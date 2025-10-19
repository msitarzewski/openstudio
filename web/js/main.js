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
import { audioContextManager } from './audio-context-manager.js';
import { AudioGraph } from './audio-graph.js';

class OpenStudioApp {
  constructor() {
    // Generate unique peer ID
    this.peerId = crypto.randomUUID();
    console.log(`[App] Peer ID: ${this.peerId}`);

    // Initialize components
    this.signaling = new SignalingClient(this.peerId);
    this.rtc = new RTCManager(this.peerId);
    this.audioGraph = new AudioGraph();

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
    this.setupAudioListeners();
    this.setupUIListeners();

    // Check for room ID in URL hash
    this.checkUrlHash();

    // Auto-connect to signaling server
    this.initializeApp();

    // Expose for debugging in browser console
    window.audioContextManager = audioContextManager;
    window.audioGraph = this.audioGraph;
    window.app = this;
  }

  /**
   * Initialize app: connect signaling, fetch ICE config, setup audio
   */
  async initializeApp() {
    try {
      // Initialize AudioContext (will be in suspended state)
      audioContextManager.initialize();

      // Initialize audio graph
      this.audioGraph.initialize();

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
      this.audioGraph.removeParticipant(peerId);
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

      // Route remote stream through audio graph
      try {
        this.audioGraph.addParticipant(remotePeerId, stream);
      } catch (error) {
        console.error(`[App] Failed to add ${remotePeerId} to audio graph:`, error);
      }
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
    // Resume AudioContext (required for browser autoplay policy)
    try {
      await audioContextManager.resume();
      console.log('[App] AudioContext resumed');
    } catch (error) {
      console.error('[App] Failed to resume AudioContext:', error);
      alert('Failed to start audio system. Please try again.');
      return;
    }

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

    // Clear audio graph
    this.audioGraph.clearAll();

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
   * Handle participant mute button click
   */
  handleParticipantMute(peerId) {
    const participant = this.participants.get(peerId);
    if (!participant) {
      return;
    }

    const card = this.participantsSection.querySelector(`[data-peer-id="${peerId}"]`);
    if (!card) {
      return;
    }

    const muteButton = card.querySelector('.mute-button');
    const gainSlider = card.querySelector('.gain-slider');
    const gainValue = card.querySelector('.gain-value');

    if (participant.muted) {
      // Unmute
      this.audioGraph.unmuteParticipant(peerId);
      participant.muted = false;
      muteButton.textContent = '🔊 Unmuted';
      muteButton.classList.remove('muted');

      // Restore previous gain value
      gainSlider.disabled = false;
      const gainPercent = participant.gain;
      this.audioGraph.setParticipantGain(peerId, gainPercent / 100);

      console.log(`[App] Unmuted participant: ${peerId}`);
    } else {
      // Mute
      this.audioGraph.muteParticipant(peerId);
      participant.muted = true;
      muteButton.textContent = '🔇 Muted';
      muteButton.classList.add('muted');
      gainSlider.disabled = true;

      console.log(`[App] Muted participant: ${peerId}`);
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
    roleEl.className = 'participant-role';
    roleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);

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
      card.appendChild(controlsEl);
    } else {
      // Self - no gain controls needed
      card.appendChild(avatar);
      card.appendChild(nameEl);
      card.appendChild(roleEl);
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
