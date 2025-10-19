/**
 * audio-graph.js
 * Web Audio graph management for OpenStudio
 *
 * Handles:
 * - Participant audio node creation and routing
 * - MediaStreamAudioSourceNode → GainNode → DynamicsCompressor → Program Bus
 * - Program bus routing to destination, analyser, and media stream
 * - Mix-minus bus creation for each participant (prevents self-echo)
 * - Node lifecycle (creation, connection, cleanup)
 *
 * Audio Graph with Mix-Minus:
 *
 * Participant A: Source → Gain → Compressor ──┬──→ Program Bus ──┬──→ Speakers/Monitor
 *                                              │                   │
 *                                              │                   ├──→ Mix-Minus B (Program + (-A))
 *                                              │                   └──→ Mix-Minus C (Program + (-C))
 *                                              │
 *                                              └──→ Inverter A (gain = -1) ──→ Mix-Minus A mixer
 *
 * Participant B: Source → Gain → Compressor ──┬──→ Program Bus ──┬──→ Mix-Minus A (Program + (-B))
 *                                              │                   ├──→ Mix-Minus C (Program + (-C))
 *                                              │                   └──→ Speakers/Monitor
 *                                              │
 *                                              └──→ Inverter B (gain = -1) ──→ Mix-Minus B mixer
 */

import { audioContextManager } from './audio-context-manager.js';
import { ProgramBus } from './program-bus.js';
import { MixMinusManager } from './mix-minus.js';

export class AudioGraph extends EventTarget {
  constructor() {
    super();
    this.participantNodes = new Map(); // peerId -> { source, gain, compressor }
    this.audioContext = null;
    this.programBus = null;
    this.mixMinusManager = null;
  }

  /**
   * Initialize audio graph with program bus and mix-minus manager
   */
  initialize() {
    try {
      this.audioContext = audioContextManager.getContext();
      console.log('[AudioGraph] Initialized with context');

      // Create and initialize program bus
      this.programBus = new ProgramBus(this.audioContext);
      this.programBus.initialize();
      console.log('[AudioGraph] Program bus created and initialized');

      // Create mix-minus manager
      this.mixMinusManager = new MixMinusManager(this.audioContext, this.programBus);
      console.log('[AudioGraph] Mix-minus manager created');

      this.dispatchEvent(new Event('initialized'));
    } catch (error) {
      console.error('[AudioGraph] Failed to initialize:', error);
      this.dispatchEvent(new CustomEvent('error', {
        detail: { message: 'Failed to initialize audio graph' }
      }));
      throw error;
    }
  }

  /**
   * Add participant to audio graph
   * Creates: MediaStreamSource → GainNode → DynamicsCompressor → Program Bus
   */
  addParticipant(peerId, mediaStream) {
    if (!this.audioContext) {
      throw new Error('AudioGraph not initialized');
    }

    if (!this.programBus) {
      throw new Error('Program bus not initialized');
    }

    if (this.participantNodes.has(peerId)) {
      console.warn(`[AudioGraph] Participant ${peerId} already exists, removing old nodes`);
      this.removeParticipant(peerId);
    }

    console.log(`[AudioGraph] Adding participant: ${peerId}`);

    try {
      // Create MediaStreamAudioSourceNode from remote stream
      const source = this.audioContext.createMediaStreamSource(mediaStream);

      // Create GainNode for volume control
      const gain = this.audioContext.createGain();
      gain.gain.value = 1.0; // Unity gain (0 dB)

      // Create DynamicsCompressorNode for light leveling
      const compressor = this.audioContext.createDynamicsCompressor();
      compressor.threshold.value = -24; // dB
      compressor.knee.value = 30; // dB
      compressor.ratio.value = 12; // 12:1
      compressor.attack.value = 0.003; // 3ms
      compressor.release.value = 0.25; // 250ms

      // Connect nodes: source → gain → compressor → program bus
      source.connect(gain);
      gain.connect(compressor);

      // Connect to program bus instead of destination
      this.programBus.connectParticipant(compressor, peerId);

      // Store node references
      this.participantNodes.set(peerId, {
        source,
        gain,
        compressor,
        mediaStream
      });

      console.log(`[AudioGraph] Participant ${peerId} connected to program bus (gain: ${gain.gain.value})`);

      // Create mix-minus bus for this participant
      // This gives them all audio EXCEPT their own voice (prevents echo)
      if (this.mixMinusManager) {
        const mixMinusStream = this.mixMinusManager.createMixMinusBus(peerId, compressor);
        console.log(`[AudioGraph] Mix-minus bus created for ${peerId} (stream ID: ${mixMinusStream.id})`);
      }

      this.dispatchEvent(new CustomEvent('participant-added', {
        detail: { peerId }
      }));

      return { source, gain, compressor };
    } catch (error) {
      console.error(`[AudioGraph] Failed to add participant ${peerId}:`, error);
      this.dispatchEvent(new CustomEvent('error', {
        detail: { message: `Failed to add participant ${peerId}` }
      }));
      throw error;
    }
  }

  /**
   * Remove participant from audio graph
   */
  removeParticipant(peerId) {
    const nodes = this.participantNodes.get(peerId);
    if (!nodes) {
      console.warn(`[AudioGraph] Participant ${peerId} not found`);
      return;
    }

    console.log(`[AudioGraph] Removing participant: ${peerId}`);

    try {
      // Destroy mix-minus bus first
      if (this.mixMinusManager) {
        this.mixMinusManager.destroyMixMinusBus(peerId);
      }

      // Disconnect from program bus
      if (this.programBus) {
        this.programBus.disconnectParticipant(nodes.compressor, peerId);
      }

      // Disconnect all nodes
      nodes.source.disconnect();
      nodes.gain.disconnect();
      nodes.compressor.disconnect();

      // Remove from map
      this.participantNodes.delete(peerId);

      console.log(`[AudioGraph] Participant ${peerId} removed`);

      this.dispatchEvent(new CustomEvent('participant-removed', {
        detail: { peerId }
      }));
    } catch (error) {
      console.error(`[AudioGraph] Failed to remove participant ${peerId}:`, error);
    }
  }

  /**
   * Set participant gain (volume control)
   * @param {string} peerId - Participant ID
   * @param {number} value - Gain value (0.0 to 1.0, where 1.0 = unity gain)
   */
  setParticipantGain(peerId, value) {
    const nodes = this.participantNodes.get(peerId);
    if (!nodes) {
      console.warn(`[AudioGraph] Cannot set gain: participant ${peerId} not found`);
      return;
    }

    // Clamp value between 0.0 and 2.0 (0dB to +6dB)
    const clampedValue = Math.max(0.0, Math.min(2.0, value));

    nodes.gain.gain.value = clampedValue;
    console.log(`[AudioGraph] Set gain for ${peerId}: ${clampedValue}`);

    this.dispatchEvent(new CustomEvent('gain-changed', {
      detail: { peerId, gain: clampedValue }
    }));
  }

  /**
   * Mute participant (set gain to 0)
   */
  muteParticipant(peerId) {
    this.setParticipantGain(peerId, 0.0);
    console.log(`[AudioGraph] Muted participant: ${peerId}`);
  }

  /**
   * Unmute participant (restore to unity gain)
   */
  unmuteParticipant(peerId) {
    this.setParticipantGain(peerId, 1.0);
    console.log(`[AudioGraph] Unmuted participant: ${peerId}`);
  }

  /**
   * Get participant gain value
   */
  getParticipantGain(peerId) {
    const nodes = this.participantNodes.get(peerId);
    return nodes ? nodes.gain.gain.value : null;
  }

  /**
   * Get all participant IDs
   */
  getParticipants() {
    return Array.from(this.participantNodes.keys());
  }

  /**
   * Get participant count
   */
  getParticipantCount() {
    return this.participantNodes.size;
  }

  /**
   * Get the program bus instance
   */
  getProgramBus() {
    return this.programBus;
  }

  /**
   * Get mix-minus MediaStream for a participant
   * This is the audio mix that excludes the participant's own voice
   * @param {string} peerId - Participant ID
   * @returns {MediaStream|null}
   */
  getMixMinusStream(peerId) {
    if (!this.mixMinusManager) {
      console.warn('[AudioGraph] Mix-minus manager not initialized');
      return null;
    }
    return this.mixMinusManager.getMixMinusStream(peerId);
  }

  /**
   * Get the mix-minus manager instance
   */
  getMixMinusManager() {
    return this.mixMinusManager;
  }

  /**
   * Clear all participants from graph
   */
  clearAll() {
    console.log('[AudioGraph] Clearing all participants');

    for (const peerId of this.participantNodes.keys()) {
      this.removeParticipant(peerId);
    }

    // Ensure all mix-minus buses are destroyed
    if (this.mixMinusManager) {
      this.mixMinusManager.destroyAll();
    }

    this.dispatchEvent(new Event('cleared'));
  }

  /**
   * Get audio graph visualization info for debugging
   */
  getGraphInfo() {
    const participants = [];

    for (const [peerId, nodes] of this.participantNodes.entries()) {
      participants.push({
        peerId,
        gain: nodes.gain.gain.value,
        compressor: {
          threshold: nodes.compressor.threshold.value,
          ratio: nodes.compressor.ratio.value,
          reduction: nodes.compressor.reduction
        },
        hasMixMinus: this.mixMinusManager ? this.mixMinusManager.hasMixMinusBus(peerId) : false
      });
    }

    return {
      contextState: this.audioContext ? this.audioContext.state : 'uninitialized',
      sampleRate: this.audioContext ? this.audioContext.sampleRate : null,
      participantCount: this.participantNodes.size,
      participants,
      programBus: this.programBus ? this.programBus.getInfo() : null,
      mixMinus: this.mixMinusManager ? this.mixMinusManager.getInfo() : null
    };
  }
}
