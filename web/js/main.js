/**
 * main.js
 * OpenStudio web client main application
 *
 * Orchestrates:
 * - Signaling client and RTC manager
 * - UI state management
 * - Room creation and joining workflow
 * - Participant display
 */

import { SignalingClient } from './signaling-client.js';
import { RTCManager } from './rtc-manager.js';

class OpenStudioApp {
  constructor() {
    // Generate unique peer ID
    this.peerId = crypto.randomUUID();
    console.log(`[App] Peer ID: ${this.peerId}`);

    // Initialize components
    this.signaling = new SignalingClient(this.peerId);
    this.rtc = new RTCManager(this.peerId);

    // State
    this.currentRoom = null;
    this.currentRole = null; // 'host' or 'caller'
    this.participants = new Map(); // peerId -> { name, role }

    // UI elements
    this.statusElement = document.getElementById('status');
    this.participantsSection = document.getElementById('participants');
    this.startSessionButton = document.getElementById('start-session');
    this.toggleMuteButton = document.getElementById('toggle-mute');
    this.endSessionButton = document.getElementById('end-session');

    // Bind event handlers
    this.setupSignalingListeners();
    this.setupRTCListeners();
    this.setupUIListeners();

    // Check for room ID in URL hash
    this.checkUrlHash();

    // Auto-connect to signaling server
    this.initializeApp();
  }

  /**
   * Initialize app: connect signaling, fetch ICE config
   */
  async initializeApp() {
    try {
      // Fetch ICE servers
      await this.rtc.initialize();

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
      const { roomId, hostId } = event.detail;
      console.log(`[App] Room created: ${roomId}`);

      this.currentRoom = roomId;
      this.currentRole = 'host';

      // Update URL with room ID
      window.location.hash = roomId;

      // Update UI
      this.setStatus('connected', `Room: ${roomId.substring(0, 8)}...`);
      this.startSessionButton.disabled = true;
      this.endSessionButton.disabled = false;
      this.toggleMuteButton.disabled = false;

      // Add self to participants
      this.addParticipant(this.peerId, 'Host (You)', 'host');

      // Get local media stream
      try {
        await this.rtc.getLocalStream();
        console.log('[App] Local media stream ready, waiting for callers...');
      } catch (error) {
        console.error('[App] Failed to get local stream:', error);
      }
    });

    this.signaling.addEventListener('room-joined', async (event) => {
      const { roomId, participants } = event.detail;
      console.log(`[App] Joined room: ${roomId}`, participants);

      this.currentRoom = roomId;
      this.currentRole = 'caller';

      // Update UI
      this.setStatus('connected', `Room: ${roomId.substring(0, 8)}...`);
      this.startSessionButton.disabled = true;
      this.endSessionButton.disabled = false;
      this.toggleMuteButton.disabled = false;

      // Add existing participants
      participants.forEach(p => {
        if (p.peerId !== this.peerId) {
          this.addParticipant(p.peerId, p.role === 'host' ? 'Host' : 'Caller', p.role);
        }
      });

      // Add self
      this.addParticipant(this.peerId, 'You', 'caller');

      // Get local media stream
      try {
        await this.rtc.getLocalStream();

        // Create peer connections and send offers to all existing participants
        for (const p of participants) {
          if (p.peerId !== this.peerId) {
            await this.initiateConnectionTo(p.peerId);
          }
        }
      } catch (error) {
        console.error('[App] Failed to get local stream:', error);
      }
    });

    this.signaling.addEventListener('peer-joined', async (event) => {
      const { peerId, role } = event.detail;
      console.log(`[App] Peer joined: ${peerId} (${role})`);

      this.addParticipant(peerId, role === 'host' ? 'Host' : 'Caller', role);

      // If we're already in the room, initiate connection to new peer
      if (this.currentRoom && this.rtc.localStream) {
        await this.initiateConnectionTo(peerId);
      }
    });

    this.signaling.addEventListener('peer-left', (event) => {
      const { peerId } = event.detail;
      console.log(`[App] Peer left: ${peerId}`);

      this.removeParticipant(peerId);
      this.rtc.closePeerConnection(peerId);
    });

    this.signaling.addEventListener('offer', async (event) => {
      const { from, sdp } = event.detail;
      console.log(`[App] Received offer from ${from}`);

      try {
        const answer = await this.rtc.handleOffer(from, sdp);
        this.signaling.sendAnswer(from, answer);
      } catch (error) {
        console.error(`[App] Failed to handle offer from ${from}:`, error);
      }
    });

    this.signaling.addEventListener('answer', async (event) => {
      const { from, sdp } = event.detail;
      console.log(`[App] Received answer from ${from}`);

      try {
        await this.rtc.handleAnswer(from, sdp);
      } catch (error) {
        console.error(`[App] Failed to handle answer from ${from}:`, error);
      }
    });

    this.signaling.addEventListener('ice-candidate', async (event) => {
      const { from, candidate } = event.detail;
      console.log(`[App] Received ICE candidate from ${from}`);

      try {
        await this.rtc.handleIceCandidate(from, candidate);
      } catch (error) {
        console.error(`[App] Failed to handle ICE candidate from ${from}:`, error);
      }
    });

    this.signaling.addEventListener('error', (event) => {
      const { message } = event.detail;
      console.error(`[App] Signaling error: ${message}`);
      alert(`Error: ${message}`);
    });
  }

  /**
   * Setup RTC event listeners
   */
  setupRTCListeners() {
    this.rtc.addEventListener('ice-candidate', (event) => {
      const { remotePeerId, candidate } = event.detail;
      this.signaling.sendIceCandidate(remotePeerId, candidate);
    });

    this.rtc.addEventListener('remote-stream', (event) => {
      const { remotePeerId, stream } = event.detail;
      console.log(`[App] Remote stream from ${remotePeerId}:`, stream);
      // Remote audio auto-plays via Audio element in RTCManager
    });

    this.rtc.addEventListener('connection-state', (event) => {
      const { remotePeerId, state } = event.detail;
      console.log(`[App] Connection state with ${remotePeerId}: ${state}`);

      // Update participant card status
      this.updateParticipantStatus(remotePeerId, state);
    });

    this.rtc.addEventListener('error', (event) => {
      const { message } = event.detail;
      console.error(`[App] RTC error: ${message}`);
      alert(`Error: ${message}`);
    });
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
  }

  /**
   * Check URL hash for room ID (join flow)
   */
  checkUrlHash() {
    const hash = window.location.hash.substring(1); // Remove '#'
    if (hash) {
      console.log(`[App] Found room ID in URL: ${hash}`);
      this.roomIdFromUrl = hash;
    }
  }

  /**
   * Handle Start Session button
   */
  async handleStartSession() {
    // Check if we should create or join
    if (this.roomIdFromUrl) {
      // Join existing room
      console.log(`[App] Joining room: ${this.roomIdFromUrl}`);
      this.signaling.joinRoom(this.roomIdFromUrl);
    } else {
      // Create new room
      const confirmCreate = confirm('Create a new room? Click OK to create, or Cancel to join an existing room.');

      if (confirmCreate) {
        console.log('[App] Creating new room...');
        this.signaling.createRoom();
      } else {
        // Prompt for room ID
        const roomId = prompt('Enter room ID to join:');
        if (roomId) {
          console.log(`[App] Joining room: ${roomId}`);
          this.signaling.joinRoom(roomId);
        }
      }
    }
  }

  /**
   * Handle End Session button
   */
  handleEndSession() {
    console.log('[App] Ending session...');

    // Close all RTC connections
    this.rtc.closeAll();

    // Disconnect from signaling (will auto-notify peers)
    this.signaling.disconnect();

    // Reset state
    this.currentRoom = null;
    this.currentRole = null;
    this.participants.clear();

    // Reset UI
    this.clearParticipants();
    this.startSessionButton.disabled = false;
    this.endSessionButton.disabled = true;
    this.toggleMuteButton.disabled = true;
    window.location.hash = '';

    // Reconnect to signaling
    this.signaling.connect();
  }

  /**
   * Handle Toggle Mute button
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
   * Initiate WebRTC connection to remote peer
   */
  async initiateConnectionTo(remotePeerId) {
    console.log(`[App] Initiating connection to ${remotePeerId}`);

    try {
      const pc = this.rtc.createPeerConnection(remotePeerId, true);
      const offer = await this.rtc.createOffer(remotePeerId);
      this.signaling.sendOffer(remotePeerId, offer);
    } catch (error) {
      console.error(`[App] Failed to initiate connection to ${remotePeerId}:`, error);
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

    this.participants.set(peerId, { name, role });

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
    roleEl.className = 'participant-role';
    roleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);

    const statusEl = document.createElement('div');
    statusEl.className = 'participant-status';
    statusEl.innerHTML = '<span class="icon">🎙️</span><span>Ready</span>';

    card.appendChild(avatar);
    card.appendChild(nameEl);
    card.appendChild(roleEl);
    card.appendChild(statusEl);

    this.participantsSection.appendChild(card);
  }

  /**
   * Remove participant from UI
   */
  removeParticipant(peerId) {
    this.participants.delete(peerId);

    const card = this.participantsSection.querySelector(`[data-peer-id="${peerId}"]`);
    if (card) {
      card.remove();
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
    } else if (state === 'connecting') {
      statusEl.textContent = 'Connecting...';
    } else if (state === 'failed' || state === 'disconnected') {
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
