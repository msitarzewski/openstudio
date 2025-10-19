/**
 * connection-manager.js
 * Coordinates WebRTC mesh connections for OpenStudio
 *
 * Implements "Perfect Negotiation" pattern to prevent race conditions:
 * - Polite peer: Backs off on glare collisions (simultaneous offers)
 * - Impolite peer: Ignores incoming offers if already negotiating
 * - Role determination: peerId < remotePeerId = polite
 *
 * Handles:
 * - Mesh topology coordination (who connects to whom)
 * - Connection retry logic with exponential backoff
 * - Concurrent peer join handling
 * - Connection state tracking
 */

const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 8000;

export class ConnectionManager extends EventTarget {
  constructor(peerId, signalingClient, rtcManager) {
    super();
    this.peerId = peerId;
    this.signalingClient = signalingClient;
    this.rtcManager = rtcManager;

    // Track connection state per remote peer
    this.connections = new Map(); // remotePeerId -> ConnectionState

    // Set up event listeners
    this.setupSignalingListeners();
    this.setupRTCListeners();

    console.log('[ConnectionManager] Initialized for peer:', this.peerId);
  }

  /**
   * Connection state tracking
   */
  getConnectionState(remotePeerId) {
    return this.connections.get(remotePeerId) || {
      status: 'disconnected', // disconnected | connecting | connected | failed
      retryCount: 0,
      retryTimeout: null,
      isPolite: this.isPolite(remotePeerId),
      makingOffer: false,
      ignoreOffer: false
    };
  }

  setConnectionState(remotePeerId, updates) {
    const current = this.getConnectionState(remotePeerId);
    const newState = { ...current, ...updates };
    this.connections.set(remotePeerId, newState);

    // Emit state change event
    this.dispatchEvent(new CustomEvent('connection-state-changed', {
      detail: { remotePeerId, state: newState }
    }));

    return newState;
  }

  /**
   * Determine if this peer should be "polite" in negotiation
   * Polite peer = lower peer ID (alphabetically)
   */
  isPolite(remotePeerId) {
    return this.peerId < remotePeerId;
  }

  /**
   * Set up signaling event listeners
   */
  setupSignalingListeners() {
    // When we join a room and receive existing participants
    this.signalingClient.addEventListener('room-joined', async (event) => {
      const { participants } = event.detail;
      console.log(`[ConnectionManager] Room joined, existing participants:`, participants);

      // Wait for local stream to be ready before initiating connections
      await this.waitForLocalStream();

      // Connect to all existing participants
      participants.forEach(participant => {
        if (participant.peerId !== this.peerId) {
          this.initiateConnection(participant.peerId);
        }
      });
    });

    // When a new peer joins the room
    this.signalingClient.addEventListener('peer-joined', (event) => {
      const { peerId: remotePeerId } = event.detail;
      console.log(`[ConnectionManager] Peer joined:`, remotePeerId);

      // Only impolite peer initiates (prevents both peers from initiating)
      if (!this.isPolite(remotePeerId)) {
        console.log(`[ConnectionManager] We are impolite, initiating connection to ${remotePeerId}`);
        this.initiateConnection(remotePeerId);
      } else {
        console.log(`[ConnectionManager] We are polite, waiting for ${remotePeerId} to initiate`);
        // Just track the peer, wait for their offer
        this.setConnectionState(remotePeerId, { status: 'waiting' });
      }
    });

    // When a peer leaves the room
    this.signalingClient.addEventListener('peer-left', (event) => {
      const { peerId: remotePeerId } = event.detail;
      console.log(`[ConnectionManager] Peer left:`, remotePeerId);
      this.closeConnection(remotePeerId);
    });

    // Handle incoming offers
    this.signalingClient.addEventListener('offer', async (event) => {
      const { from: remotePeerId, sdp } = event.detail;
      await this.handleOffer(remotePeerId, sdp);
    });

    // Handle incoming answers
    this.signalingClient.addEventListener('answer', async (event) => {
      const { from: remotePeerId, sdp } = event.detail;
      await this.handleAnswer(remotePeerId, sdp);
    });

    // Handle incoming ICE candidates
    this.signalingClient.addEventListener('ice-candidate', async (event) => {
      const { from: remotePeerId, candidate } = event.detail;
      await this.rtcManager.handleIceCandidate(remotePeerId, candidate);
    });
  }

  /**
   * Set up RTC event listeners
   */
  setupRTCListeners() {
    // ICE candidates generated locally
    this.rtcManager.addEventListener('ice-candidate', (event) => {
      const { remotePeerId, candidate } = event.detail;
      this.signalingClient.sendIceCandidate(remotePeerId, candidate);
    });

    // Connection state changes
    this.rtcManager.addEventListener('connection-state', (event) => {
      const { remotePeerId, state } = event.detail;
      console.log(`[ConnectionManager] RTC connection state for ${remotePeerId}: ${state}`);

      if (state === 'connected') {
        this.setConnectionState(remotePeerId, {
          status: 'connected',
          retryCount: 0
        });
      } else if (state === 'failed') {
        this.handleConnectionFailure(remotePeerId);
      } else if (state === 'disconnected') {
        this.setConnectionState(remotePeerId, { status: 'disconnected' });
      }
    });

    // Remote stream received
    this.rtcManager.addEventListener('remote-stream', (event) => {
      // Pass through to app layer
      this.dispatchEvent(new CustomEvent('remote-stream', { detail: event.detail }));
    });
  }

  /**
   * Wait for local media stream to be ready
   */
  async waitForLocalStream() {
    const maxWait = 10000; // 10 seconds max
    const startTime = Date.now();

    while (!this.rtcManager.localStream && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.rtcManager.localStream) {
      console.warn('[ConnectionManager] Local stream not ready after 10s, proceeding anyway');
    } else {
      console.log('[ConnectionManager] Local stream ready, proceeding with connections');
    }
  }

  /**
   * Initiate connection to a remote peer
   */
  async initiateConnection(remotePeerId) {
    const state = this.getConnectionState(remotePeerId);

    if (state.status === 'connected' || state.status === 'connecting') {
      console.log(`[ConnectionManager] Already ${state.status} to ${remotePeerId}`);
      return;
    }

    console.log(`[ConnectionManager] Initiating connection to ${remotePeerId}`);
    this.setConnectionState(remotePeerId, {
      status: 'connecting',
      makingOffer: true
    });

    try {
      // Create peer connection
      this.rtcManager.createPeerConnection(remotePeerId, true);

      // Create and send offer
      const offer = await this.rtcManager.createOffer(remotePeerId);
      this.signalingClient.sendOffer(remotePeerId, offer);

      console.log(`[ConnectionManager] Offer sent to ${remotePeerId}`);
      this.setConnectionState(remotePeerId, { makingOffer: false });
    } catch (error) {
      console.error(`[ConnectionManager] Failed to initiate connection to ${remotePeerId}:`, error);
      this.setConnectionState(remotePeerId, {
        status: 'failed',
        makingOffer: false
      });
      this.scheduleRetry(remotePeerId);
    }
  }

  /**
   * Handle incoming offer (Perfect Negotiation pattern)
   */
  async handleOffer(remotePeerId, sdp) {
    const state = this.getConnectionState(remotePeerId);
    const isPolite = state.isPolite;

    console.log(`[ConnectionManager] Handling offer from ${remotePeerId} (we are ${isPolite ? 'polite' : 'impolite'})`);

    try {
      // Perfect Negotiation: Detect glare collision
      const offerCollision = state.makingOffer || this.rtcManager.peerConnections.get(remotePeerId)?.signalingState !== 'stable';

      if (offerCollision) {
        console.log(`[ConnectionManager] Offer collision detected with ${remotePeerId}`);

        if (!isPolite) {
          // Impolite peer ignores incoming offer
          console.log(`[ConnectionManager] We are impolite, ignoring offer from ${remotePeerId}`);
          state.ignoreOffer = true;
          return;
        } else {
          // Polite peer rolls back and accepts incoming offer
          console.log(`[ConnectionManager] We are polite, rolling back our offer`);
        }
      }

      state.ignoreOffer = false;

      // Handle the offer
      const answer = await this.rtcManager.handleOffer(remotePeerId, sdp);
      this.signalingClient.sendAnswer(remotePeerId, answer);

      console.log(`[ConnectionManager] Answer sent to ${remotePeerId}`);
      this.setConnectionState(remotePeerId, { status: 'connecting' });
    } catch (error) {
      console.error(`[ConnectionManager] Failed to handle offer from ${remotePeerId}:`, error);
      this.setConnectionState(remotePeerId, { status: 'failed' });
      this.scheduleRetry(remotePeerId);
    }
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(remotePeerId, sdp) {
    console.log(`[ConnectionManager] Handling answer from ${remotePeerId}`);

    try {
      await this.rtcManager.handleAnswer(remotePeerId, sdp);
      console.log(`[ConnectionManager] Answer processed for ${remotePeerId}`);

      // Clear ignoreOffer flag after successful answer processing
      // (collision resolved, we can accept new offers now)
      this.setConnectionState(remotePeerId, { ignoreOffer: false });
    } catch (error) {
      console.error(`[ConnectionManager] Failed to handle answer from ${remotePeerId}:`, error);
      this.setConnectionState(remotePeerId, { status: 'failed' });
      this.scheduleRetry(remotePeerId);
    }
  }

  /**
   * Handle connection failure
   */
  handleConnectionFailure(remotePeerId) {
    const state = this.getConnectionState(remotePeerId);
    console.error(`[ConnectionManager] Connection failed for ${remotePeerId} (attempt ${state.retryCount + 1})`);

    this.setConnectionState(remotePeerId, {
      status: 'failed',
      retryCount: state.retryCount + 1
    });

    this.scheduleRetry(remotePeerId);
  }

  /**
   * Schedule connection retry with exponential backoff
   */
  scheduleRetry(remotePeerId) {
    const state = this.getConnectionState(remotePeerId);

    if (state.retryCount >= MAX_RETRY_ATTEMPTS) {
      console.error(`[ConnectionManager] Max retry attempts reached for ${remotePeerId}, giving up`);
      this.setConnectionState(remotePeerId, { status: 'failed-permanent' });

      this.dispatchEvent(new CustomEvent('connection-failed', {
        detail: { remotePeerId, reason: 'Max retries exceeded' }
      }));
      return;
    }

    // Calculate retry delay with exponential backoff
    const delay = Math.min(
      INITIAL_RETRY_DELAY_MS * Math.pow(2, state.retryCount),
      MAX_RETRY_DELAY_MS
    );

    console.log(`[ConnectionManager] Scheduling retry for ${remotePeerId} in ${delay}ms (attempt ${state.retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);

    // Clear existing retry timeout
    if (state.retryTimeout) {
      clearTimeout(state.retryTimeout);
    }

    // Schedule retry
    const retryTimeout = setTimeout(() => {
      console.log(`[ConnectionManager] Retrying connection to ${remotePeerId}`);

      // Close existing failed connection
      this.rtcManager.closePeerConnection(remotePeerId);

      // Retry connection
      this.initiateConnection(remotePeerId);
    }, delay);

    this.setConnectionState(remotePeerId, { retryTimeout });
  }

  /**
   * Add return feed track to peer connection (renegotiation)
   * This sends the mix-minus audio back to the remote peer
   *
   * @param {string} remotePeerId - Remote peer identifier
   * @param {MediaStream} mixMinusStream - Mix-minus stream (all participants except remotePeerId)
   */
  async addReturnFeedTrack(remotePeerId, mixMinusStream) {
    const state = this.getConnectionState(remotePeerId);

    if (state.status !== 'connected') {
      console.warn(`[ConnectionManager] Cannot add return feed to ${remotePeerId}: not connected (status: ${state.status})`);
      return;
    }

    console.log(`[ConnectionManager] Adding return feed track to ${remotePeerId}`);
    this.setConnectionState(remotePeerId, { makingOffer: true });

    try {
      // Add return feed track and get renegotiation offer
      const offer = await this.rtcManager.addReturnFeedTrack(remotePeerId, mixMinusStream);

      // Send offer via signaling
      this.signalingClient.sendOffer(remotePeerId, offer);

      console.log(`[ConnectionManager] Return feed renegotiation offer sent to ${remotePeerId}`);
      this.setConnectionState(remotePeerId, { makingOffer: false });
    } catch (error) {
      console.error(`[ConnectionManager] Failed to add return feed for ${remotePeerId}:`, error);
      this.setConnectionState(remotePeerId, { makingOffer: false });
    }
  }

  /**
   * Close connection to a remote peer
   */
  closeConnection(remotePeerId) {
    const state = this.getConnectionState(remotePeerId);

    // Clear retry timeout
    if (state.retryTimeout) {
      clearTimeout(state.retryTimeout);
    }

    // Close RTC connection
    this.rtcManager.closePeerConnection(remotePeerId);

    // Remove state
    this.connections.delete(remotePeerId);

    console.log(`[ConnectionManager] Connection to ${remotePeerId} closed`);
  }

  /**
   * Close all connections
   */
  closeAll() {
    console.log('[ConnectionManager] Closing all connections');

    // Clear all retry timeouts
    for (const [remotePeerId, state] of this.connections) {
      if (state.retryTimeout) {
        clearTimeout(state.retryTimeout);
      }
    }

    // Clear state
    this.connections.clear();

    // Close all RTC connections
    this.rtcManager.closeAll();
  }

  /**
   * Get info about all connections (for debugging)
   */
  getConnectionsInfo() {
    const info = {
      peerId: this.peerId,
      connectionCount: this.connections.size,
      connections: []
    };

    for (const [remotePeerId, state] of this.connections) {
      info.connections.push({
        remotePeerId,
        status: state.status,
        isPolite: state.isPolite,
        retryCount: state.retryCount
      });
    }

    return info;
  }
}
