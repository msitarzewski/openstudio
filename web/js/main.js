/**
 * main.js
 * OpenStudio web client main application
 *
 * Orchestrates:
 * - Signaling client and RTC manager
 * - UI state management
 * - Room creation and joining workflow
 * - Participant display
 * - Program bus volume meter
 */

import { SignalingClient } from './signaling-client.js';
import { RTCManager } from './rtc-manager.js';
import { ConnectionManager } from './connection-manager.js';
import { audioContextManager } from './audio-context-manager.js';
import { AudioGraph } from './audio-graph.js';
import { VolumeMeter } from './volume-meter.js';
import { ReturnFeedManager } from './return-feed.js';
import { MuteManager } from './mute-manager.js';
import { IcecastStreamer } from './icecast-streamer.js';

class OpenStudioApp {
  constructor() {
    // Generate unique peer ID
    this.peerId = crypto.randomUUID();
    console.log(`[App] Peer ID: ${this.peerId}`);

    // Initialize components
    this.signaling = new SignalingClient(this.peerId);
    this.rtc = new RTCManager(this.peerId);
    this.audioGraph = new AudioGraph();
    this.volumeMeter = null; // Will be initialized after audio graph
    this.connectionManager = null; // Will be initialized after RTC
    this.returnFeedManager = new ReturnFeedManager();
    this.muteManager = null; // Will be initialized after audio graph
    this.icecastStreamer = new IcecastStreamer(); // Icecast streaming

    // State
    this.currentRoom = null;
    this.currentRole = null; // 'host', 'ops', or 'guest'
    this.participants = new Map(); // peerId -> { name, role }
    this.participantMeters = new Map(); // peerId -> VolumeMeter instance (for per-participant level meters)

    // Track which remote streams have been received (for distinguishing microphone vs return feed)
    // Each peer sends TWO streams: microphone (first) and return feed (second)
    this.receivedMicrophoneStreams = new Set(); // peerIds that have sent microphone
    this.receivedReturnFeeds = new Set(); // peerIds that have sent return feed
    this.pendingReturnFeeds = new Map(); // peerId -> true (return feeds waiting for connection to be ready)

    // UI elements
    this.statusElement = document.getElementById('status');
    this.participantsSection = document.getElementById('participants');
    this.startSessionButton = document.getElementById('start-session');
    this.toggleMuteButton = document.getElementById('toggle-mute');
    this.endSessionButton = document.getElementById('end-session');
    this.startStreamingButton = document.getElementById('start-streaming');
    this.stopStreamingButton = document.getElementById('stop-streaming');
    this.streamingStatusElement = document.getElementById('streaming-status');
    this.bitrateSelect = document.getElementById('bitrate-select');

    // Bind event handlers
    this.setupSignalingListeners();
    this.setupAudioListeners();
    this.setupStreamingListeners();
    this.setupUIListeners();

    // Check for room ID in URL hash
    this.checkUrlHash();

    // Auto-connect to signaling server
    this.initializeApp();

    // Expose for debugging in browser console
    window.audioContextManager = audioContextManager;
    window.audioGraph = this.audioGraph;
    window.returnFeedManager = this.returnFeedManager;
    window.icecastStreamer = this.icecastStreamer;
    window.app = this;
  }

  /**
   * Initialize app: connect signaling, fetch ICE config, setup audio
   */
  async initializeApp() {
    try {
      // Initialize AudioContext (will be in suspended state)
      audioContextManager.initialize();

      // Initialize audio graph (includes program bus)
      this.audioGraph.initialize();

      // Initialize mute manager (requires audio graph)
      this.muteManager = new MuteManager(this.audioGraph);
      this.setupMuteManagerListeners();
      console.log('[App] Mute manager initialized');

      // Initialize volume meter
      const canvasElement = document.getElementById('volume-meter');
      const programBus = this.audioGraph.getProgramBus();
      const analyser = programBus.getAnalyser();
      this.volumeMeter = new VolumeMeter(canvasElement, analyser);
      console.log('[App] Volume meter initialized');

      // Expose volume meter and mute manager for debugging
      window.volumeMeter = this.volumeMeter;
      window.muteManager = this.muteManager;

      // Fetch ICE servers
      await this.rtc.initialize();

      // Initialize connection manager (coordinates WebRTC mesh)
      this.connectionManager = new ConnectionManager(this.peerId, this.signaling, this.rtc);
      this.setupConnectionManagerListeners();

      // Expose connection manager for debugging
      window.connectionManager = this.connectionManager;

      // Connect to signaling server
      this.signaling.connect();
    } catch (error) {
      console.error('[App] Initialization failed:', error);
      this.setStatus('disconnected', 'Initialization failed');
    }
  }

  /**
   * Setup signaling event listeners
   */
  setupSignalingListeners() {
    this.signaling.addEventListener('connected', () => {
      this.setStatus('connecting', 'Connecting...');
    });

    this.signaling.addEventListener('registered', () => {
      this.setStatus('connected', 'Connected');
      this.startSessionButton.disabled = false;
    });

    this.signaling.addEventListener('disconnected', () => {
      this.setStatus('disconnected', 'Disconnected');
      this.startSessionButton.disabled = true;
      this.endSessionButton.disabled = true;
    });

    this.signaling.addEventListener('room-created', async (event) => {
      const { roomId, hostId, role } = event.detail;
      console.log(`[App] Room created: ${roomId} as ${role}`);

      this.currentRoom = roomId;
      this.currentRole = role || 'host'; // Use role from server, fallback to host

      // Update URL with room ID
      window.location.hash = roomId;

      // Update UI
      this.setStatus('connected', `Room: ${roomId.substring(0, 8)}...`);
      this.startSessionButton.disabled = true;
      this.endSessionButton.disabled = false;
      this.toggleMuteButton.disabled = false;

      // Enable streaming only for host
      if (this.currentRole === 'host') {
        this.startStreamingButton.disabled = false;
      }

      // Add self to participants with role from server
      const displayName = this.currentRole === 'host' ? 'Host (You)' :
                          this.currentRole === 'ops' ? 'Ops (You)' : 'You';
      this.addParticipant(this.peerId, displayName, this.currentRole);

      // Get local media stream
      try {
        await this.rtc.getLocalStream();
        console.log('[App] Local media stream ready, waiting for callers...');

        // Safari: Resume AudioContext after permission dialog
        // The permission dialog causes Safari to suspend the context
        await audioContextManager.resume();
        console.log('[App] AudioContext resumed after microphone permission');

        // Create level meter for local participant (self)
        this.createLocalMeter();
      } catch (error) {
        console.error('[App] Failed to get local stream:', error);
      }
    });

    this.signaling.addEventListener('room-joined', async (event) => {
      const { roomId, participants, role } = event.detail;
      console.log(`[App] Joined room: ${roomId} as ${role}`, participants);

      this.currentRoom = roomId;
      this.currentRole = role || 'guest'; // Use role from server, fallback to guest

      // Update UI
      this.setStatus('connected', `Room: ${roomId.substring(0, 8)}...`);
      this.startSessionButton.disabled = true;
      this.endSessionButton.disabled = false;
      this.toggleMuteButton.disabled = false;

      // Add existing participants
      participants.forEach(p => {
        if (p.peerId !== this.peerId) {
          const displayName = p.role === 'host' ? 'Host' :
                              p.role === 'ops' ? 'Ops' : 'Guest';
          this.addParticipant(p.peerId, displayName, p.role);
        }
      });

      // Add self with role from server
      const displayName = this.currentRole === 'host' ? 'Host (You)' :
                          this.currentRole === 'ops' ? 'Ops (You)' : 'You';
      this.addParticipant(this.peerId, displayName, this.currentRole);

      // Get local media stream
      try {
        await this.rtc.getLocalStream();
        console.log('[App] Local stream ready, ConnectionManager will handle peer connections');

        // Safari: Resume AudioContext after permission dialog
        // The permission dialog causes Safari to suspend the context
        await audioContextManager.resume();
        console.log('[App] AudioContext resumed after microphone permission');

        // Create level meter for local participant (self)
        this.createLocalMeter();

        // ConnectionManager automatically handles connections via room-joined event
      } catch (error) {
        console.error('[App] Failed to get local stream:', error);
      }
    });

    this.signaling.addEventListener('peer-joined', (event) => {
      const { peerId, role } = event.detail;
      console.log(`[App] Peer joined: ${peerId} (${role})`);

      const displayName = role === 'host' ? 'Host' :
                          role === 'ops' ? 'Ops' : 'Guest';
      this.addParticipant(peerId, displayName, role);
      // ConnectionManager automatically handles connection initiation via peer-joined event
    });

    this.signaling.addEventListener('peer-left', (event) => {
      const { peerId } = event.detail;
      console.log(`[App] Peer left: ${peerId}`);

      // Clean up all components related to this peer
      this.removeParticipant(peerId);

      // Remove from audio graph
      this.audioGraph.removeParticipant(peerId);

      // Stop return feed playback
      this.returnFeedManager.stopReturnFeed(peerId);

      // Remove mute state
      if (this.muteManager) {
        this.muteManager.removeParticipant(peerId);
      }

      // Remove from tracking sets
      this.receivedMicrophoneStreams.delete(peerId);
      this.receivedReturnFeeds.delete(peerId);
      this.pendingReturnFeeds.delete(peerId);

      // ConnectionManager automatically handles connection cleanup via peer-left event
    });

    // Handle incoming mute messages (broadcast from all peers)
    this.signaling.addEventListener('mute', (event) => {
      const { peerId, muted, authority, from } = event.detail;
      console.log(`[App] Mute message received: ${peerId} ${muted ? 'muted' : 'unmuted'} by ${from} (authority: ${authority})`);

      // Ignore mute messages from ourselves (we already applied it locally)
      if (from === this.peerId) {
        console.log(`[App] Ignoring our own mute message`);
        return;
      }

      // Apply mute state via MuteManager (handles conflict resolution)
      if (this.muteManager && peerId !== this.peerId) {
        // Don't apply mute to self (we handle that locally)
        this.muteManager.setMute(peerId, muted, authority);
        this.updateParticipantMuteUI(peerId);
      }
    });

    // Note: offer/answer/ice-candidate events are now handled by ConnectionManager

    this.signaling.addEventListener('error', (event) => {
      const { message } = event.detail;
      console.error(`[App] Signaling error: ${message}`);
      alert(`Error: ${message}`);
    });
  }

  /**
   * Setup MuteManager event listeners
   */
  setupMuteManagerListeners() {
    // Mute state changed - propagate via signaling
    this.muteManager.addEventListener('mute-changed', (event) => {
      const { peerId, muted, authority } = event.detail;
      console.log(`[App] Mute state changed: ${peerId} ${muted ? 'muted' : 'unmuted'} (authority: ${authority})`);

      // Send mute message to all peers via signaling (broadcast)
      this.signaling.sendMute(peerId, muted, authority);

      // Update UI for this participant
      this.updateParticipantMuteUI(peerId);
    });
  }

  /**
   * Setup Icecast streamer event listeners
   */
  setupStreamingListeners() {
    // Streaming status changed
    this.icecastStreamer.addEventListener('status-change', (event) => {
      const { status, message } = event.detail;
      console.log(`[App] Streaming status: ${status} - ${message}`);

      // Update streaming status UI
      this.streamingStatusElement.textContent = message;
      this.streamingStatusElement.className = `streaming-status ${status}`;

      // Update button states based on status
      if (status === 'streaming') {
        this.startStreamingButton.style.display = 'none';
        this.stopStreamingButton.style.display = 'inline-block';
        this.stopStreamingButton.disabled = false;
      } else if (status === 'stopped') {
        this.startStreamingButton.style.display = 'inline-block';
        this.stopStreamingButton.style.display = 'none';
        // Re-enable start button only if we're in a session
        if (this.currentRoom && this.currentRole === 'host') {
          this.startStreamingButton.disabled = false;
        }
      } else if (status === 'error') {
        this.startStreamingButton.style.display = 'inline-block';
        this.stopStreamingButton.style.display = 'none';
        // Re-enable start button for retry
        if (this.currentRoom && this.currentRole === 'host') {
          this.startStreamingButton.disabled = false;
        }
      }
    });

    // Chunk sent (for monitoring)
    this.icecastStreamer.addEventListener('chunk-sent', (event) => {
      // Could add bandwidth monitoring here if needed
      // console.log(`[App] Chunk sent: ${event.detail.size} bytes`);
    });

    // Reconnection attempt
    this.icecastStreamer.addEventListener('reconnect-attempt', (event) => {
      console.log(`[App] Icecast reconnect attempt ${event.detail.attempt}`);
      // Try to restart streaming with current program bus
      const programBus = this.audioGraph.getProgramBus();
      const mediaStream = programBus.getMediaStream();
      if (mediaStream) {
        const bitrate = parseInt(this.bitrateSelect.value);
        this.icecastStreamer.start(mediaStream, this.signaling.getWebSocket());
      }
    });
  }

  /**
   * Setup ConnectionManager event listeners
   */
  setupConnectionManagerListeners() {
    // Remote stream received
    // Each peer sends TWO streams: microphone (first) and return feed (second)
    this.connectionManager.addEventListener('remote-stream', async (event) => {
      const { remotePeerId, stream } = event.detail;
      console.log(`[App] Remote stream from ${remotePeerId}:`, stream);

      // Distinguish between microphone track (first stream) and return feed (second stream)
      if (!this.receivedMicrophoneStreams.has(remotePeerId)) {
        // First stream = microphone, route to audio graph
        console.log(`[App] First stream from ${remotePeerId} = microphone, routing to audio graph`);

        try {
          // Add to audio graph (creates mix-minus automatically)
          this.audioGraph.addParticipant(remotePeerId, stream);
          this.receivedMicrophoneStreams.add(remotePeerId);

          // Create per-participant level meter
          this.createParticipantMeter(remotePeerId);

          // Mark that we need to send return feed for this peer
          // Wait a moment for audio graph to fully initialize the mix-minus
          // AND stagger return feed sending to avoid renegotiation collisions:
          // Polite peer sends first (500ms), impolite peer waits longer (2500ms)
          const connectionState = this.connectionManager.getConnectionState(remotePeerId);
          const isPolite = connectionState?.isPolite || false;
          const delay = isPolite ? 500 : 2500; // Polite first, impolite waits

          console.log(`[App] Will create return feed for ${remotePeerId} (${isPolite ? 'polite' : 'impolite'}) in ${delay}ms`);

          setTimeout(() => {
            const mixMinusStream = this.audioGraph.getMixMinusStream(remotePeerId);
            if (mixMinusStream) {
              console.log(`[App] Mix-minus stream created for ${remotePeerId}, marking return feed as pending`);
              this.pendingReturnFeeds.set(remotePeerId, true);

              // Check if connection is already in "connected" state
              // If so, send the return feed immediately
              this.trySendPendingReturnFeed(remotePeerId);
            } else {
              console.warn(`[App] No mix-minus stream available for ${remotePeerId}`);
            }
          }, delay); // Staggered delay to avoid renegotiation collisions
        } catch (error) {
          console.error(`[App] Failed to add ${remotePeerId} to audio graph:`, error);
        }
      } else if (!this.receivedReturnFeeds.has(remotePeerId)) {
        // Second stream = return feed, play directly (bypass audio graph)
        console.log(`[App] Second stream from ${remotePeerId} = return feed, playing directly`);

        try {
          this.returnFeedManager.playReturnFeed(remotePeerId, stream);
          this.receivedReturnFeeds.add(remotePeerId);
        } catch (error) {
          console.error(`[App] Failed to play return feed for ${remotePeerId}:`, error);
        }
      } else {
        // Third or subsequent stream - unexpected
        console.warn(`[App] Unexpected additional stream from ${remotePeerId}:`, stream);
      }
    });

    // Connection state changed
    this.connectionManager.addEventListener('connection-state-changed', (event) => {
      const { remotePeerId, state } = event.detail;
      console.log(`[App] Connection state for ${remotePeerId}: ${state.status}`);

      // Update participant card status
      this.updateParticipantStatus(remotePeerId, state.status);

      // If connection is now connected, try to send any pending return feeds
      if (state.status === 'connected') {
        console.log(`[App] Connection is now connected, trying to send pending return feed to ${remotePeerId}`);
        this.trySendPendingReturnFeed(remotePeerId);
      }
    });

    // Connection permanently failed
    this.connectionManager.addEventListener('connection-failed', (event) => {
      const { remotePeerId, reason } = event.detail;
      console.error(`[App] Connection permanently failed for ${remotePeerId}: ${reason}`);
      alert(`Failed to connect to participant ${remotePeerId.substring(0, 8)}: ${reason}`);
    });
  }

  /**
   * Setup audio event listeners
   */
  setupAudioListeners() {
    audioContextManager.addEventListener('statechange', (event) => {
      const { state } = event.detail;
      console.log(`[App] AudioContext state changed: ${state}`);
    });

    audioContextManager.addEventListener('resumed', () => {
      console.log('[App] AudioContext resumed successfully');
    });

    this.audioGraph.addEventListener('participant-added', (event) => {
      const { peerId } = event.detail;
      console.log(`[App] Participant added to audio graph: ${peerId}`);
    });

    this.audioGraph.addEventListener('participant-removed', (event) => {
      const { peerId } = event.detail;
      console.log(`[App] Participant removed from audio graph: ${peerId}`);
    });

    this.audioGraph.addEventListener('error', (event) => {
      const { message } = event.detail;
      console.error(`[App] Audio graph error: ${message}`);
    });
  }

  /**
   * Try to send pending return feed for a peer if connection is ready
   */
  async trySendPendingReturnFeed(remotePeerId) {
    // Check if we have a pending return feed for this peer
    if (!this.pendingReturnFeeds.has(remotePeerId)) {
      return;
    }

    // Check if connection is ready (must be "connected" for renegotiation to work)
    // Query the actual RTCPeerConnection state, not just our tracked state
    const pc = this.connectionManager.rtcManager.peerConnections.get(remotePeerId);
    const rtcState = pc?.connectionState;

    if (!pc || rtcState !== 'connected') {
      console.log(`[App] Connection not ready for ${remotePeerId} (RTC state: ${rtcState}), keeping return feed pending`);
      return; // Keep in pendingReturnFeeds, will retry when connection becomes "connected"
    }

    // Get the mix-minus stream
    const mixMinusStream = this.audioGraph.getMixMinusStream(remotePeerId);
    if (!mixMinusStream) {
      console.error(`[App] No mix-minus stream available for ${remotePeerId}, cannot send return feed`);
      this.pendingReturnFeeds.delete(remotePeerId);
      return;
    }

    // Remove from pending FIRST to prevent retries
    this.pendingReturnFeeds.delete(remotePeerId);

    console.log(`[App] Adding return feed track for ${remotePeerId} (connection is connected)`);

    try {
      // Add return feed track
      // This triggers negotiationneeded event which handles renegotiation automatically
      this.connectionManager.addReturnFeedTrack(remotePeerId, mixMinusStream);
      console.log(`[App] Return feed track added for ${remotePeerId}`);
    } catch (error) {
      console.error(`[App] Failed to add return feed for ${remotePeerId}:`, error);
    }
  }

  /**
   * Setup UI event listeners
   */
  setupUIListeners() {
    this.startSessionButton.addEventListener('click', () => {
      this.handleStartSession();
    });

    this.endSessionButton.addEventListener('click', () => {
      this.handleEndSession();
    });

    this.toggleMuteButton.addEventListener('click', () => {
      this.handleToggleMute();
    });

    this.startStreamingButton.addEventListener('click', () => {
      this.handleStartStreaming();
    });

    this.stopStreamingButton.addEventListener('click', () => {
      this.handleStopStreaming();
    });
  }

  /**
   * Check URL hash for room ID and role (join flow)
   * Format: #room-id?role=host|ops|guest
   */
  checkUrlHash() {
    const hash = window.location.hash.substring(1); // Remove '#'
    if (!hash) {
      return;
    }

    // Parse room ID and query parameters
    const [roomId, queryString] = hash.split('?');

    if (roomId) {
      console.log(`[App] Found room ID in URL: ${roomId}`);
      this.roomIdFromUrl = roomId;
    }

    // Parse role from query string
    if (queryString) {
      const params = new URLSearchParams(queryString);
      const role = params.get('role');
      if (role && ['host', 'ops', 'guest'].includes(role)) {
        console.log(`[App] Found role in URL: ${role}`);
        this.roleFromUrl = role;
      } else if (role) {
        console.warn(`[App] Invalid role in URL: ${role}. Using default (guest)`);
      }
    }

    // Default to guest if no role specified
    if (!this.roleFromUrl) {
      this.roleFromUrl = 'guest';
    }
  }

  /**
   * Handle Start Session button
   */
  async handleStartSession() {
    // Resume AudioContext (required for browser autoplay policy)
    try {
      await audioContextManager.resume();
      console.log('[App] AudioContext resumed');
    } catch (error) {
      console.error('[App] Failed to resume AudioContext:', error);
      alert('Failed to start audio system. Please try again.');
      return;
    }

    // Start volume meter animation
    if (this.volumeMeter) {
      this.volumeMeter.start();
      console.log('[App] Volume meter started');
    }

    // Use create-or-join-room logic
    if (this.roomIdFromUrl) {
      // Room ID in URL - create or join it with role from URL
      const role = this.roleFromUrl || 'guest';
      console.log(`[App] Creating or joining room: ${this.roomIdFromUrl} as ${role}`);
      this.signaling.createOrJoinRoom(this.roomIdFromUrl, role);
    } else {
      // No room ID in URL - prompt user
      const confirmCreate = confirm('Create a new room? Click OK to create, or Cancel to join an existing room.');

      if (confirmCreate) {
        // Create new room as host
        console.log('[App] Creating new room as host...');
        this.signaling.createOrJoinRoom(null, 'host'); // null = generate new UUID
      } else {
        // Prompt for room ID
        const roomId = prompt('Enter room ID to join:');
        if (roomId) {
          console.log(`[App] Joining room: ${roomId} as guest`);
          this.signaling.createOrJoinRoom(roomId, 'guest');
        }
      }
    }
  }

  /**
   * Handle End Session button
   */
  handleEndSession() {
    console.log('[App] Ending session...');

    // Stop Icecast streaming if active
    if (this.icecastStreamer.isActive()) {
      this.icecastStreamer.stop();
      console.log('[App] Icecast streaming stopped');
    }

    // Stop volume meter animation
    if (this.volumeMeter) {
      this.volumeMeter.stop();
      console.log('[App] Volume meter stopped');
    }

    // Clear audio graph
    this.audioGraph.clearAll();

    // Stop all return feed playback
    this.returnFeedManager.stopAll();

    // Clear mute manager state
    if (this.muteManager) {
      this.muteManager.clear();
    }

    // Close all connections (ConnectionManager handles cleanup)
    if (this.connectionManager) {
      this.connectionManager.closeAll();
    }

    // Disconnect from signaling (will auto-notify peers)
    this.signaling.disconnect();

    // Reset state
    this.currentRoom = null;
    this.currentRole = null;
    this.participants.clear();

    // Clear tracking sets
    this.receivedMicrophoneStreams.clear();
    this.receivedReturnFeeds.clear();
    this.pendingReturnFeeds.clear();

    // Reset UI
    this.clearParticipants();
    this.startSessionButton.disabled = false;
    this.endSessionButton.disabled = true;
    this.toggleMuteButton.disabled = true;
    this.startStreamingButton.disabled = true;
    this.stopStreamingButton.disabled = true;
    this.startStreamingButton.style.display = 'inline-block';
    this.stopStreamingButton.style.display = 'none';
    this.streamingStatusElement.textContent = 'Not Streaming';
    this.streamingStatusElement.className = 'streaming-status';
    window.location.hash = '';

    // Reconnect to signaling
    this.signaling.connect();
  }

  /**
   * Handle Toggle Mute button (for local microphone)
   */
  handleToggleMute() {
    if (!this.rtc.localStream) {
      return;
    }

    const audioTrack = this.rtc.localStream.getAudioTracks()[0];
    if (!audioTrack) {
      return;
    }

    audioTrack.enabled = !audioTrack.enabled;

    if (audioTrack.enabled) {
      this.toggleMuteButton.textContent = 'Mute';
      console.log('[App] Unmuted microphone');
    } else {
      this.toggleMuteButton.textContent = 'Unmute';
      console.log('[App] Muted microphone');
    }
  }

  /**
   * Handle Start Streaming button
   */
  async handleStartStreaming() {
    console.log('[App] Starting Icecast streaming...');

    // Only host can stream
    if (this.currentRole !== 'host') {
      alert('Only the host can start streaming.');
      return;
    }

    // Get program bus MediaStream
    const programBus = this.audioGraph.getProgramBus();
    const mediaStream = programBus.getMediaStream();

    if (!mediaStream) {
      console.error('[App] No program bus MediaStream available');
      alert('Program bus not ready. Please try again.');
      return;
    }

    // Get selected bitrate
    const bitrate = parseInt(this.bitrateSelect.value);
    console.log(`[App] Starting stream with bitrate: ${bitrate}bps`);

    // Disable start button during connection attempt
    this.startStreamingButton.disabled = true;

    try {
      // Update Icecast configuration with selected bitrate
      this.icecastStreamer.updateConfig({ bitrate });

      // Start streaming (pass signaling WebSocket for Safari fallback)
      await this.icecastStreamer.start(mediaStream, this.signaling.getWebSocket());
    } catch (error) {
      console.error('[App] Failed to start streaming:', error);
      alert(`Failed to start streaming: ${error.message}`);
      this.startStreamingButton.disabled = false;
    }
  }

  /**
   * Handle Stop Streaming button
   */
  async handleStopStreaming() {
    console.log('[App] Stopping Icecast streaming...');

    try {
      await this.icecastStreamer.stop();
      console.log('[App] Streaming stopped successfully');
    } catch (error) {
      console.error('[App] Error stopping stream:', error);
    }
  }

  /**
   * Handle participant mute button click
   */
  handleParticipantMute(peerId) {
    if (!this.muteManager) {
      console.warn('[App] MuteManager not initialized');
      return;
    }

    const participant = this.participants.get(peerId);
    if (!participant) {
      return;
    }

    // Determine authority based on role
    // Host and ops can mute anyone (producer authority)
    // Guests can only mute themselves (self authority)
    const canMuteOthers = this.currentRole === 'host' || this.currentRole === 'ops';
    const isSelf = peerId === this.peerId;

    // Check permissions
    if (!isSelf && !canMuteOthers) {
      console.warn(`[App] Guest cannot mute other participants`);
      alert('Only hosts and ops can mute other participants.');
      return;
    }

    // Get current mute state
    const muteState = this.muteManager.getMuteState(peerId);
    const currentlyMuted = muteState.muted;

    // Set authority
    const authority = canMuteOthers && !isSelf ? 'producer' : 'self';

    // Toggle mute
    const newMutedState = !currentlyMuted;

    // Apply mute via MuteManager (handles conflict resolution + signaling propagation)
    const success = this.muteManager.setMute(peerId, newMutedState, authority);

    if (!success) {
      console.warn(`[App] Mute action blocked for ${peerId} (conflict with ${muteState.authority} authority)`);
      // Show user feedback that action was blocked
      alert('Cannot override host/ops mute. Please ask them to unmute you.');
    } else {
      console.log(`[App] ${newMutedState ? 'Muted' : 'Unmuted'} participant: ${peerId} (authority: ${authority})`);
    }
  }

  /**
   * Update participant mute button UI based on current mute state
   */
  updateParticipantMuteUI(peerId) {
    const card = this.participantsSection.querySelector(`[data-peer-id="${peerId}"]`);
    if (!card) {
      return;
    }

    const muteButton = card.querySelector('.mute-button');
    const gainSlider = card.querySelector('.gain-slider');

    if (!muteButton || !this.muteManager) {
      return;
    }

    const muteState = this.muteManager.getMuteState(peerId);
    const participant = this.participants.get(peerId);

    // Update button text and class based on mute state
    muteButton.classList.remove('self-muted', 'producer-muted');

    if (muteState.muted) {
      if (muteState.authority === 'producer') {
        muteButton.textContent = '🔇 Muted (Host)';
        muteButton.classList.add('producer-muted');
      } else {
        muteButton.textContent = '🔇 Muted';
        muteButton.classList.add('self-muted');
      }
      if (gainSlider) {
        gainSlider.disabled = true;
      }
    } else {
      muteButton.textContent = '🔊 Unmuted';
      if (gainSlider) {
        gainSlider.disabled = false;
      }
    }

    // Update participant state
    if (participant) {
      participant.muted = muteState.muted;
    }
  }

  /**
   * Handle gain slider change
   */
  handleGainChange(peerId, sliderValue) {
    const participant = this.participants.get(peerId);
    if (!participant || participant.muted) {
      return;
    }

    const gainPercent = parseInt(sliderValue, 10);
    const gainValue = gainPercent / 100; // Convert 0-200% to 0.0-2.0

    // Update audio graph with smooth ramping
    try {
      const nodes = this.audioGraph.participantNodes.get(peerId);
      if (nodes) {
        const audioContext = this.audioGraph.audioContext;
        const currentGain = nodes.gain.gain.value;

        // Use AudioParam ramping for smooth transitions (no clicks/pops)
        nodes.gain.gain.setValueAtTime(currentGain, audioContext.currentTime);
        nodes.gain.gain.linearRampToValueAtTime(gainValue, audioContext.currentTime + 0.05);

        // Update UI
        const card = this.participantsSection.querySelector(`[data-peer-id="${peerId}"]`);
        if (card) {
          const gainValueEl = card.querySelector('.gain-value');
          if (gainValueEl) {
            gainValueEl.textContent = `${gainPercent}%`;
          }
        }

        // Store in participant state
        participant.gain = gainPercent;

        console.log(`[App] Set gain for ${peerId}: ${gainPercent}% (${gainValue.toFixed(2)})`);
      }
    } catch (error) {
      console.error(`[App] Failed to set gain for ${peerId}:`, error);
    }
  }


  /**
   * Set connection status
   */
  setStatus(state, text) {
    this.statusElement.className = '';
    if (state === 'connecting') {
      this.statusElement.classList.add('connecting');
    } else if (state === 'connected') {
      this.statusElement.classList.add('connected');
    }
    this.statusElement.textContent = text;
  }

  /**
   * Add participant to UI
   */
  addParticipant(peerId, name, role) {
    if (this.participants.has(peerId)) {
      return; // Already added
    }

    this.participants.set(peerId, { name, role, muted: false, gain: 100 });

    // Clear placeholder cards on first real participant
    if (this.participants.size === 1) {
      this.clearParticipants();
    }

    const card = document.createElement('div');
    card.className = 'participant-card';
    card.dataset.peerId = peerId;

    const avatar = document.createElement('div');
    avatar.className = 'participant-avatar';
    avatar.textContent = name.charAt(0).toUpperCase();

    const nameEl = document.createElement('div');
    nameEl.className = 'participant-name';
    nameEl.textContent = name;

    const roleEl = document.createElement('div');
    roleEl.className = `participant-role role-${role}`;
    roleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);

    // Per-participant level meter
    const levelMeterCanvas = document.createElement('canvas');
    levelMeterCanvas.className = 'participant-level-meter';
    levelMeterCanvas.width = 150;
    levelMeterCanvas.height = 20;
    levelMeterCanvas.dataset.peerId = peerId; // For debugging

    // Gain controls (only for remote participants, not self)
    const isSelf = peerId === this.peerId;
    if (!isSelf) {
      const controlsEl = document.createElement('div');
      controlsEl.className = 'participant-controls';

      // Mute button
      const muteButton = document.createElement('button');
      muteButton.className = 'mute-button';
      muteButton.textContent = '🔊 Unmuted';
      muteButton.addEventListener('click', () => this.handleParticipantMute(peerId));

      // Gain control container
      const gainControl = document.createElement('div');
      gainControl.className = 'gain-control';

      const gainSlider = document.createElement('input');
      gainSlider.type = 'range';
      gainSlider.className = 'gain-slider';
      gainSlider.min = '0';
      gainSlider.max = '200';
      gainSlider.value = '100';
      gainSlider.addEventListener('input', (e) => this.handleGainChange(peerId, e.target.value));

      const gainValue = document.createElement('span');
      gainValue.className = 'gain-value';
      gainValue.textContent = '100%';

      gainControl.appendChild(gainSlider);
      gainControl.appendChild(gainValue);

      controlsEl.appendChild(muteButton);
      controlsEl.appendChild(gainControl);

      card.appendChild(avatar);
      card.appendChild(nameEl);
      card.appendChild(roleEl);
      card.appendChild(levelMeterCanvas);
      card.appendChild(controlsEl);
    } else {
      // Self - add mute button (for self-mute), but no gain controls
      const controlsEl = document.createElement('div');
      controlsEl.className = 'participant-controls';

      // Mute button for self-mute
      const muteButton = document.createElement('button');
      muteButton.className = 'mute-button';
      muteButton.textContent = '🔊 Unmuted';
      muteButton.addEventListener('click', () => this.handleParticipantMute(peerId));

      controlsEl.appendChild(muteButton);

      card.appendChild(avatar);
      card.appendChild(nameEl);
      card.appendChild(roleEl);
      card.appendChild(levelMeterCanvas);
      card.appendChild(controlsEl);
    }

    const statusEl = document.createElement('div');
    statusEl.className = 'participant-status';
    statusEl.innerHTML = '<span class="icon">🎙️</span><span>Ready</span>';

    card.appendChild(statusEl);

    this.participantsSection.appendChild(card);
  }

  /**
   * Remove participant from UI
   */
  removeParticipant(peerId) {
    this.participants.delete(peerId);

    // Cleanup level meter
    const meter = this.participantMeters.get(peerId);
    if (meter) {
      meter.destroy();
      this.participantMeters.delete(peerId);
      console.log(`[App] Destroyed level meter for ${peerId}`);
    }

    const card = this.participantsSection.querySelector(`[data-peer-id="${peerId}"]`);
    if (card) {
      card.remove();
    }
  }

  /**
   * Create per-participant level meter
   */
  createParticipantMeter(peerId) {
    // Get the analyser node from audio graph
    const analyser = this.audioGraph.getParticipantAnalyser(peerId);
    if (!analyser) {
      console.warn(`[App] No analyser found for ${peerId}, cannot create level meter`);
      return;
    }

    // Get the canvas element from participant card
    const card = this.participantsSection.querySelector(`[data-peer-id="${peerId}"]`);
    if (!card) {
      console.warn(`[App] No participant card found for ${peerId}, cannot create level meter`);
      return;
    }

    const canvas = card.querySelector('.participant-level-meter');
    if (!canvas) {
      console.warn(`[App] No level meter canvas found for ${peerId}`);
      return;
    }

    try {
      // Create and start the volume meter
      const volumeMeter = new VolumeMeter(canvas, analyser);
      volumeMeter.start();
      this.participantMeters.set(peerId, volumeMeter);
      console.log(`[App] Created level meter for ${peerId}`);
    } catch (error) {
      console.error(`[App] Failed to create level meter for ${peerId}:`, error);
    }
  }

  /**
   * Create level meter for local participant (self)
   */
  createLocalMeter() {
    // Get local stream from RTC manager
    const localStream = this.rtc.localStream;
    if (!localStream) {
      console.warn('[App] No local stream available, cannot create local meter');
      return;
    }

    // Get the canvas element for local participant
    const card = this.participantsSection.querySelector(`[data-peer-id="${this.peerId}"]`);
    if (!card) {
      console.warn('[App] No local participant card found, cannot create local meter');
      return;
    }

    const canvas = card.querySelector('.participant-level-meter');
    if (!canvas) {
      console.warn('[App] No level meter canvas found for local participant');
      return;
    }

    try {
      // Create analyser for local stream
      const audioContext = audioContextManager.getContext();

      // Safari: Log context state for debugging
      console.log(`[App] AudioContext state before creating meter: ${audioContext.state}`);

      const source = audioContext.createMediaStreamSource(localStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;

      // Create ultra-low-gain node for Safari compatibility
      // Safari requires MediaStreamSources to be connected to destination
      // AND suspends AudioContext when gain = 0, so use 0.001 instead
      const ultraLowGain = audioContext.createGain();
      ultraLowGain.gain.value = 0.001; // Nearly silent - prevents Safari suspension

      // Connect: source → analyser → ultraLowGain → destination
      // This keeps Safari's AudioContext active while being inaudible
      source.connect(analyser);
      analyser.connect(ultraLowGain);
      ultraLowGain.connect(audioContext.destination);

      // Create and start the volume meter
      const volumeMeter = new VolumeMeter(canvas, analyser);
      volumeMeter.start();
      this.participantMeters.set(this.peerId, volumeMeter);
      console.log('[App] Created level meter for local participant (self)');

      // Safari: Force initial canvas render
      setTimeout(() => {
        const level = volumeMeter.getCurrentLevel();
        console.log('[App] Safari canvas check - current level:', level);
      }, 500);
    } catch (error) {
      console.error('[App] Failed to create local meter:', error);
    }
  }

  /**
   * Update participant connection status
   */
  updateParticipantStatus(peerId, state) {
    const card = this.participantsSection.querySelector(`[data-peer-id="${peerId}"]`);
    if (!card) {
      return;
    }

    const statusEl = card.querySelector('.participant-status span:last-child');
    if (!statusEl) {
      return;
    }

    if (state === 'connected') {
      statusEl.textContent = 'Connected';
    } else if (state === 'connecting' || state === 'waiting') {
      statusEl.textContent = 'Connecting...';
    } else if (state === 'failed' || state === 'failed-permanent' || state === 'disconnected') {
      statusEl.textContent = 'Disconnected';
    }
  }

  /**
   * Clear all participants from UI
   */
  clearParticipants() {
    this.participantsSection.innerHTML = '';
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new OpenStudioApp();
  });
} else {
  new OpenStudioApp();
}
