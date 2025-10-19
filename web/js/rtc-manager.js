/**
 * rtc-manager.js
 * WebRTC connection manager for OpenStudio
 *
 * Handles:
 * - RTCPeerConnection lifecycle
 * - Local media stream (getUserMedia)
 * - Remote media stream playback
 * - SDP offer/answer creation
 * - ICE candidate generation
 */

const API_STATION_URL = 'http://localhost:3000/api/station';

export class RTCManager extends EventTarget {
  constructor(peerId) {
    super();
    this.peerId = peerId;
    this.peerConnections = new Map(); // remotePeerId -> RTCPeerConnection
    this.localStream = null;
    this.iceServers = null;
    this.remoteAudioElements = new Map(); // remotePeerId -> HTMLAudioElement
  }

  /**
   * Initialize: fetch ICE servers from station API
   */
  async initialize() {
    try {
      console.log('[RTC] Fetching ICE servers from station API...');
      const response = await fetch(API_STATION_URL);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const config = await response.json();
      console.log('[RTC] Station config:', config);

      // Extract ICE servers from config
      this.iceServers = [];

      if (config.ice && config.ice.stun) {
        config.ice.stun.forEach(url => {
          this.iceServers.push({ urls: url });
        });
      }

      if (config.ice && config.ice.turn) {
        config.ice.turn.forEach(server => {
          this.iceServers.push({
            urls: server.urls || server.url, // Support both 'urls' and 'url' field names
            username: server.username,
            credential: server.credential
          });
        });
      }

      console.log('[RTC] ICE servers configured:', this.iceServers);
      this.dispatchEvent(new Event('initialized'));
      return true;
    } catch (error) {
      console.error('[RTC] Failed to fetch station config:', error);
      this.dispatchEvent(new CustomEvent('error', {
        detail: { message: 'Failed to load ICE server configuration' }
      }));
      return false;
    }
  }

  /**
   * Get local media stream (microphone audio)
   */
  async getLocalStream() {
    if (this.localStream) {
      console.log('[RTC] Local stream already exists');
      return this.localStream;
    }

    try {
      console.log('[RTC] Requesting microphone access...');
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      console.log('[RTC] Microphone access granted');
      this.dispatchEvent(new CustomEvent('local-stream', { detail: { stream: this.localStream } }));
      return this.localStream;
    } catch (error) {
      console.error('[RTC] Failed to get user media:', error);

      let message = 'Failed to access microphone';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        message = 'Microphone access denied. Please grant permission and try again.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        message = 'No microphone found. Please connect a microphone and try again.';
      }

      this.dispatchEvent(new CustomEvent('error', { detail: { message } }));
      throw error;
    }
  }

  /**
   * Create RTCPeerConnection for a remote peer
   */
  createPeerConnection(remotePeerId, isInitiator = false) {
    if (this.peerConnections.has(remotePeerId)) {
      console.log(`[RTC] Peer connection for ${remotePeerId} already exists`);
      return this.peerConnections.get(remotePeerId);
    }

    console.log(`[RTC] Creating peer connection for ${remotePeerId} (initiator: ${isInitiator})`);

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers || []
    });

    // Add local stream tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
        console.log(`[RTC] Added local ${track.kind} track to peer connection`);
      });
    }

    // Handle ICE candidates
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        console.log(`[RTC] ICE candidate generated for ${remotePeerId}`);
        this.dispatchEvent(new CustomEvent('ice-candidate', {
          detail: {
            remotePeerId,
            candidate: event.candidate
          }
        }));
      } else {
        console.log(`[RTC] ICE gathering complete for ${remotePeerId}`);
      }
    });

    // Handle connection state changes
    pc.addEventListener('connectionstatechange', () => {
      console.log(`[RTC] Connection state for ${remotePeerId}: ${pc.connectionState}`);
      this.dispatchEvent(new CustomEvent('connection-state', {
        detail: {
          remotePeerId,
          state: pc.connectionState
        }
      }));

      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.closePeerConnection(remotePeerId);
      }
    });

    // Handle ICE connection state changes
    pc.addEventListener('iceconnectionstatechange', () => {
      console.log(`[RTC] ICE connection state for ${remotePeerId}: ${pc.iceConnectionState}`);
    });

    // Handle remote tracks
    pc.addEventListener('track', (event) => {
      console.log(`[RTC] Remote ${event.track.kind} track received from ${remotePeerId}`);

      if (event.streams && event.streams[0]) {
        this.playRemoteStream(remotePeerId, event.streams[0]);
      }
    });

    this.peerConnections.set(remotePeerId, pc);
    return pc;
  }

  /**
   * Create SDP offer
   */
  async createOffer(remotePeerId) {
    const pc = this.peerConnections.get(remotePeerId);
    if (!pc) {
      throw new Error(`No peer connection found for ${remotePeerId}`);
    }

    console.log(`[RTC] Creating offer for ${remotePeerId}`);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log(`[RTC] Local description set (offer) for ${remotePeerId}`);

    return offer;
  }

  /**
   * Create SDP answer
   */
  async createAnswer(remotePeerId) {
    const pc = this.peerConnections.get(remotePeerId);
    if (!pc) {
      throw new Error(`No peer connection found for ${remotePeerId}`);
    }

    console.log(`[RTC] Creating answer for ${remotePeerId}`);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log(`[RTC] Local description set (answer) for ${remotePeerId}`);

    return answer;
  }

  /**
   * Handle remote SDP offer
   */
  async handleOffer(remotePeerId, offer) {
    console.log(`[RTC] Handling offer from ${remotePeerId}`);

    const pc = this.createPeerConnection(remotePeerId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    console.log(`[RTC] Remote description set (offer) from ${remotePeerId}`);

    const answer = await this.createAnswer(remotePeerId);
    return answer;
  }

  /**
   * Handle remote SDP answer
   */
  async handleAnswer(remotePeerId, answer) {
    console.log(`[RTC] Handling answer from ${remotePeerId}`);

    const pc = this.peerConnections.get(remotePeerId);
    if (!pc) {
      throw new Error(`No peer connection found for ${remotePeerId}`);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    console.log(`[RTC] Remote description set (answer) from ${remotePeerId}`);
  }

  /**
   * Handle remote ICE candidate
   */
  async handleIceCandidate(remotePeerId, candidate) {
    const pc = this.peerConnections.get(remotePeerId);
    if (!pc) {
      console.warn(`[RTC] No peer connection found for ${remotePeerId}, ignoring ICE candidate`);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`[RTC] ICE candidate added for ${remotePeerId}`);
    } catch (error) {
      console.error(`[RTC] Failed to add ICE candidate for ${remotePeerId}:`, error);
    }
  }

  /**
   * Play remote audio stream
   */
  playRemoteStream(remotePeerId, stream) {
    // Create audio element for remote peer
    let audioElement = this.remoteAudioElements.get(remotePeerId);

    if (!audioElement) {
      audioElement = new Audio();
      audioElement.autoplay = true;
      this.remoteAudioElements.set(remotePeerId, audioElement);
      console.log(`[RTC] Created audio element for ${remotePeerId}`);
    }

    audioElement.srcObject = stream;

    this.dispatchEvent(new CustomEvent('remote-stream', {
      detail: {
        remotePeerId,
        stream
      }
    }));
  }

  /**
   * Close peer connection
   */
  closePeerConnection(remotePeerId) {
    const pc = this.peerConnections.get(remotePeerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(remotePeerId);
      console.log(`[RTC] Closed peer connection for ${remotePeerId}`);
    }

    const audioElement = this.remoteAudioElements.get(remotePeerId);
    if (audioElement) {
      audioElement.srcObject = null;
      this.remoteAudioElements.delete(remotePeerId);
      console.log(`[RTC] Removed audio element for ${remotePeerId}`);
    }
  }

  /**
   * Close all peer connections and stop local stream
   */
  closeAll() {
    // Close all peer connections
    for (const remotePeerId of this.peerConnections.keys()) {
      this.closePeerConnection(remotePeerId);
    }

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`[RTC] Stopped local ${track.kind} track`);
      });
      this.localStream = null;
    }

    console.log('[RTC] All connections closed');
  }
}
