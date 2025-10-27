/**
 * signaling-client.js
 * WebSocket client for OpenStudio signaling server
 *
 * Handles:
 * - WebSocket connection lifecycle
 * - Peer registration
 * - Room creation and joining
 * - SDP offer/answer relay
 * - ICE candidate relay
 */

const SIGNALING_URL = 'ws://localhost:6736';
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

export class SignalingClient extends EventTarget {
  constructor(peerId) {
    super();
    this.peerId = peerId;
    this.ws = null;
    this.reconnectDelay = RECONNECT_DELAY_MS;
    this.reconnectTimeout = null;
    this.isIntentionallyClosed = false;
    this.isRegistered = false;
  }

  /**
   * Connect to signaling server and register peer ID
   */
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      console.log('[Signaling] Already connected or connecting');
      return;
    }

    this.isIntentionallyClosed = false;
    console.log(`[Signaling] Connecting to ${SIGNALING_URL}...`);

    try {
      this.ws = new WebSocket(SIGNALING_URL);
    } catch (error) {
      console.error('[Signaling] WebSocket creation failed:', error);
      this.dispatchEvent(new CustomEvent('error', { detail: { message: 'Failed to create WebSocket connection' } }));
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener('open', this.handleOpen.bind(this));
    this.ws.addEventListener('message', this.handleMessage.bind(this));
    this.ws.addEventListener('close', this.handleClose.bind(this));
    this.ws.addEventListener('error', this.handleError.bind(this));
  }

  /**
   * WebSocket opened - register peer ID
   */
  handleOpen() {
    console.log('[Signaling] WebSocket connected');
    this.reconnectDelay = RECONNECT_DELAY_MS; // Reset reconnect delay
    this.dispatchEvent(new Event('connected'));

    // Register with server
    this.send({
      type: 'register',
      peerId: this.peerId
    });
  }

  /**
   * Handle incoming messages from signaling server
   */
  handleMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      console.error('[Signaling] Failed to parse message:', event.data);
      return;
    }

    console.log('[Signaling] Received:', message);

    switch (message.type) {
      case 'registered':
        this.isRegistered = true;
        this.dispatchEvent(new CustomEvent('registered', { detail: message }));
        break;

      case 'room-created':
        this.dispatchEvent(new CustomEvent('room-created', { detail: message }));
        break;

      case 'room-joined':
        this.dispatchEvent(new CustomEvent('room-joined', { detail: message }));
        break;

      case 'peer-joined':
        this.dispatchEvent(new CustomEvent('peer-joined', { detail: message }));
        break;

      case 'peer-left':
        this.dispatchEvent(new CustomEvent('peer-left', { detail: message }));
        break;

      case 'offer':
        this.dispatchEvent(new CustomEvent('offer', { detail: message }));
        break;

      case 'answer':
        this.dispatchEvent(new CustomEvent('answer', { detail: message }));
        break;

      case 'ice-candidate':
        this.dispatchEvent(new CustomEvent('ice-candidate', { detail: message }));
        break;

      case 'mute':
        this.dispatchEvent(new CustomEvent('mute', { detail: message }));
        break;

      case 'error':
        console.error('[Signaling] Server error:', message.message);
        this.dispatchEvent(new CustomEvent('error', { detail: message }));
        break;

      case 'pong':
        // Heartbeat response - ignored for now
        break;

      default:
        console.warn('[Signaling] Unknown message type:', message.type);
    }
  }

  /**
   * WebSocket closed - attempt reconnection unless intentional
   */
  handleClose(event) {
    console.log(`[Signaling] WebSocket closed (code: ${event.code}, reason: ${event.reason})`);
    this.isRegistered = false;
    this.dispatchEvent(new Event('disconnected'));

    if (!this.isIntentionallyClosed) {
      this.scheduleReconnect();
    }
  }

  /**
   * WebSocket error occurred
   */
  handleError(error) {
    console.error('[Signaling] WebSocket error:', error);
    this.dispatchEvent(new CustomEvent('error', { detail: { message: 'WebSocket error occurred' } }));
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    console.log(`[Signaling] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  /**
   * Send message to signaling server
   */
  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[Signaling] Cannot send - WebSocket not open');
      return false;
    }

    console.log('[Signaling] Sending:', message);
    this.ws.send(JSON.stringify(message));
    return true;
  }

  /**
   * Create a new room
   */
  createRoom() {
    if (!this.isRegistered) {
      console.error('[Signaling] Cannot create room - not registered');
      return false;
    }

    return this.send({
      type: 'create-room'
    });
  }

  /**
   * Join an existing room
   */
  joinRoom(roomId) {
    if (!this.isRegistered) {
      console.error('[Signaling] Cannot join room - not registered');
      return false;
    }

    return this.send({
      type: 'join-room',
      roomId: roomId
    });
  }

  /**
   * Create or join a room (idempotent operation)
   * @param {string|null} roomId - Room ID to create/join (null = generate new UUID)
   * @param {string} role - Participant role: 'host', 'ops', or 'guest' (default: 'guest')
   */
  createOrJoinRoom(roomId, role = 'guest') {
    if (!this.isRegistered) {
      console.error('[Signaling] Cannot create or join room - not registered');
      return false;
    }

    return this.send({
      type: 'create-or-join-room',
      roomId: roomId, // Can be null to generate new UUID
      role: role
    });
  }

  /**
   * Send SDP offer to target peer
   */
  sendOffer(targetPeerId, sdp) {
    return this.send({
      type: 'offer',
      from: this.peerId,
      to: targetPeerId,
      sdp: sdp.sdp || sdp // Extract SDP string from RTCSessionDescription
    });
  }

  /**
   * Send SDP answer to target peer
   */
  sendAnswer(targetPeerId, sdp) {
    return this.send({
      type: 'answer',
      from: this.peerId,
      to: targetPeerId,
      sdp: sdp.sdp || sdp // Extract SDP string from RTCSessionDescription
    });
  }

  /**
   * Send ICE candidate to target peer
   */
  sendIceCandidate(targetPeerId, candidate) {
    return this.send({
      type: 'ice-candidate',
      from: this.peerId,
      to: targetPeerId,
      candidate: candidate
    });
  }

  /**
   * Send mute state change (broadcast to all peers in room)
   *
   * @param {string} targetPeerId - Peer being muted/unmuted
   * @param {boolean} muted - True if muted, false if unmuted
   * @param {'producer'|'self'} authority - Who initiated the mute
   */
  sendMute(targetPeerId, muted, authority) {
    return this.send({
      type: 'mute',
      from: this.peerId,
      peerId: targetPeerId,  // The peer being muted/unmuted
      muted: muted,
      authority: authority
    });
  }

  /**
   * Close WebSocket connection
   */
  disconnect() {
    this.isIntentionallyClosed = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isRegistered = false;
    console.log('[Signaling] Disconnected');
  }

  /**
   * Get the underlying WebSocket connection
   * @returns {WebSocket|null} WebSocket instance or null if not connected
   */
  getWebSocket() {
    return this.ws;
  }
}
