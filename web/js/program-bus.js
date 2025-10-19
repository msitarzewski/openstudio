/**
 * program-bus.js
 * Program bus management for OpenStudio
 *
 * The program bus is the final audio mix that combines all participants.
 * This is what gets sent to Icecast and what hosts monitor.
 *
 * Architecture:
 * All participant compressor outputs → ChannelMerger → ┬→ AudioContext.destination (monitoring)
 *                                                       ├→ AnalyserNode (volume meter)
 *                                                       └→ MediaStreamDestination (recording)
 */

export class ProgramBus extends EventTarget {
  constructor(audioContext) {
    super();
    this.audioContext = audioContext;
    this.merger = null;
    this.analyser = null;
    this.destination = null;
    this.masterGain = null;
    this.connectedSources = new Set(); // Track connected compressor nodes
  }

  /**
   * Initialize program bus nodes
   */
  initialize() {
    if (!this.audioContext) {
      throw new Error('AudioContext is required');
    }

    try {
      console.log('[ProgramBus] Initializing...');

      // Create ChannelMerger for stereo output (2 channels)
      // Note: We're using a basic merger - participants will be mono summed to stereo
      this.merger = this.audioContext.createChannelMerger(2);

      // Create master gain control (for future use)
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.0; // Unity gain

      // Create AnalyserNode for volume metering
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.minDecibels = -90;
      this.analyser.maxDecibels = -10;

      // Create MediaStreamDestination for recording (Task 018)
      this.destination = this.audioContext.createMediaStreamDestination();

      // Connect the chain: merger → masterGain → (analyser, destination, speakers)
      this.merger.connect(this.masterGain);
      this.masterGain.connect(this.analyser);
      this.masterGain.connect(this.destination);
      this.masterGain.connect(this.audioContext.destination);

      console.log('[ProgramBus] Initialized successfully');
      console.log('[ProgramBus] Chain: Merger → MasterGain → (Analyser, Destination, Speakers)');

      this.dispatchEvent(new Event('initialized'));
      return true;
    } catch (error) {
      console.error('[ProgramBus] Failed to initialize:', error);
      this.dispatchEvent(new CustomEvent('error', {
        detail: { message: 'Failed to initialize program bus' }
      }));
      throw error;
    }
  }

  /**
   * Connect a participant's compressor node to the program bus
   * @param {AudioNode} compressorNode - The participant's compressor node
   * @param {string} peerId - Participant identifier for tracking
   */
  connectParticipant(compressorNode, peerId) {
    if (!this.merger) {
      throw new Error('Program bus not initialized');
    }

    if (!compressorNode) {
      throw new Error('Compressor node is required');
    }

    try {
      // Connect the compressor to both channels of the merger (mono to stereo)
      compressorNode.connect(this.merger, 0, 0); // Left channel
      compressorNode.connect(this.merger, 0, 1); // Right channel

      this.connectedSources.add(peerId);

      console.log(`[ProgramBus] Connected participant ${peerId} to program bus (${this.connectedSources.size} total)`);

      this.dispatchEvent(new CustomEvent('participant-connected', {
        detail: { peerId, participantCount: this.connectedSources.size }
      }));
    } catch (error) {
      console.error(`[ProgramBus] Failed to connect participant ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect a participant's compressor node from the program bus
   * @param {AudioNode} compressorNode - The participant's compressor node
   * @param {string} peerId - Participant identifier for tracking
   */
  disconnectParticipant(compressorNode, peerId) {
    if (!this.merger) {
      console.warn('[ProgramBus] Cannot disconnect: program bus not initialized');
      return;
    }

    if (!compressorNode) {
      console.warn('[ProgramBus] Cannot disconnect: compressor node is null');
      return;
    }

    try {
      // Disconnect from the merger
      compressorNode.disconnect(this.merger);

      this.connectedSources.delete(peerId);

      console.log(`[ProgramBus] Disconnected participant ${peerId} from program bus (${this.connectedSources.size} remaining)`);

      this.dispatchEvent(new CustomEvent('participant-disconnected', {
        detail: { peerId, participantCount: this.connectedSources.size }
      }));
    } catch (error) {
      console.error(`[ProgramBus] Failed to disconnect participant ${peerId}:`, error);
    }
  }

  /**
   * Get the analyser node for volume metering
   * @returns {AnalyserNode}
   */
  getAnalyser() {
    return this.analyser;
  }

  /**
   * Get the media stream for recording (used in Task 018)
   * @returns {MediaStream}
   */
  getMediaStream() {
    return this.destination ? this.destination.stream : null;
  }

  /**
   * Get the number of connected participants
   * @returns {number}
   */
  getParticipantCount() {
    return this.connectedSources.size;
  }

  /**
   * Set master gain level
   * @param {number} value - Gain value (0.0 to 2.0)
   */
  setMasterGain(value) {
    if (!this.masterGain) {
      console.warn('[ProgramBus] Cannot set master gain: not initialized');
      return;
    }

    const clampedValue = Math.max(0.0, Math.min(2.0, value));
    this.masterGain.gain.value = clampedValue;
    console.log(`[ProgramBus] Master gain set to ${clampedValue}`);

    this.dispatchEvent(new CustomEvent('master-gain-changed', {
      detail: { gain: clampedValue }
    }));
  }

  /**
   * Get master gain level
   * @returns {number}
   */
  getMasterGain() {
    return this.masterGain ? this.masterGain.gain.value : null;
  }

  /**
   * Get program bus info for debugging
   * @returns {object}
   */
  getInfo() {
    return {
      initialized: this.merger !== null,
      participantCount: this.connectedSources.size,
      participants: Array.from(this.connectedSources),
      masterGain: this.getMasterGain(),
      analyserFFTSize: this.analyser ? this.analyser.fftSize : null,
      hasMediaStream: this.destination && this.destination.stream ? true : false
    };
  }

  /**
   * Cleanup and disconnect all nodes
   */
  destroy() {
    console.log('[ProgramBus] Destroying...');

    try {
      if (this.masterGain) {
        this.masterGain.disconnect();
      }
      if (this.merger) {
        this.merger.disconnect();
      }
      if (this.analyser) {
        this.analyser.disconnect();
      }

      this.connectedSources.clear();
      this.merger = null;
      this.analyser = null;
      this.destination = null;
      this.masterGain = null;

      console.log('[ProgramBus] Destroyed');
      this.dispatchEvent(new Event('destroyed'));
    } catch (error) {
      console.error('[ProgramBus] Error during destroy:', error);
    }
  }
}
