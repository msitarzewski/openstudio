/**
 * mix-minus.js
 * Mix-minus bus management for OpenStudio
 *
 * Technical centerpiece: Creates personalized audio mixes for each participant
 * that exclude their own voice, preventing echo/feedback.
 *
 * Efficient Algorithm (O(N) instead of O(N²)):
 * For each participant i:
 *   MixMinus_i = Program Bus - Participant_i
 *
 * Implementation using phase inversion:
 *   1. Create inverter GainNode (gain = -1) for participant's audio
 *   2. Create mixer GainNode that sums:
 *      - Program Bus output (all participants)
 *      - Inverted participant audio (gain = -1)
 *   3. Result: Program + (-Participant_i) = All participants except i
 *
 * Audio graph:
 * [Participant A compressor] ──┬──> [Program Bus] ──┬──> [Mix-Minus B output]
 *                              │                     │
 *                              └──> [Inverter A] ────┘
 *
 * [Participant B compressor] ──┬──> [Program Bus] ──┬──> [Mix-Minus A output]
 *                              │                     │
 *                              └──> [Inverter B] ────┘
 */

export class MixMinusManager extends EventTarget {
  constructor(audioContext, programBus) {
    super();
    this.audioContext = audioContext;
    this.programBus = programBus;

    // Track per-participant mix-minus state
    // peerId -> { inverter, mixer, destination, mediaStream }
    this.mixMinusBuses = new Map();
  }

  /**
   * Create mix-minus bus for a participant
   * @param {string} peerId - Participant identifier
   * @param {AudioNode} compressorNode - Participant's compressor output
   * @returns {MediaStream} Mix-minus audio stream for this participant
   */
  createMixMinusBus(peerId, compressorNode) {
    if (!this.audioContext) {
      throw new Error('AudioContext is required');
    }

    if (!this.programBus) {
      throw new Error('Program bus is required');
    }

    if (this.mixMinusBuses.has(peerId)) {
      console.warn(`[MixMinus] Mix-minus bus for ${peerId} already exists, recreating`);
      this.destroyMixMinusBus(peerId);
    }

    console.log(`[MixMinus] Creating mix-minus bus for ${peerId}`);

    try {
      // Step 1: Create inverter GainNode (phase inversion)
      // This will subtract the participant's audio from the program bus
      const inverter = this.audioContext.createGain();
      inverter.gain.value = -1.0; // Invert phase

      // Step 2: Create mixer GainNode
      // This sums the program bus + inverted participant
      const mixer = this.audioContext.createGain();
      mixer.gain.value = 1.0; // Unity gain

      // Step 3: Create MediaStreamDestination for output
      // This gives us a MediaStream we can send back to the participant
      const destination = this.audioContext.createMediaStreamDestination();

      // Step 4: Connect the audio graph
      // Participant's compressor → inverter → mixer
      compressorNode.connect(inverter);
      inverter.connect(mixer);

      // Program bus master gain → mixer
      // This is the sum of all participants
      const programMasterGain = this.programBus.masterGain;
      if (!programMasterGain) {
        throw new Error('Program bus master gain not available');
      }
      programMasterGain.connect(mixer);

      // Mixer → destination (output MediaStream)
      mixer.connect(destination);

      // Store references
      const mixMinusBus = {
        inverter,
        mixer,
        destination,
        mediaStream: destination.stream,
        compressorNode // Keep reference for cleanup
      };

      this.mixMinusBuses.set(peerId, mixMinusBus);

      console.log(`[MixMinus] Created mix-minus bus for ${peerId}`);
      console.log(`[MixMinus] Audio flow: Program(all) + Inverted(${peerId}) = MixMinus(all except ${peerId})`);

      this.dispatchEvent(new CustomEvent('mix-minus-created', {
        detail: { peerId, mediaStream: destination.stream }
      }));

      return destination.stream;
    } catch (error) {
      console.error(`[MixMinus] Failed to create mix-minus bus for ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Destroy mix-minus bus for a participant
   * @param {string} peerId - Participant identifier
   */
  destroyMixMinusBus(peerId) {
    const bus = this.mixMinusBuses.get(peerId);
    if (!bus) {
      console.warn(`[MixMinus] Mix-minus bus for ${peerId} not found`);
      return;
    }

    console.log(`[MixMinus] Destroying mix-minus bus for ${peerId}`);

    try {
      // Disconnect all nodes
      bus.inverter.disconnect();
      bus.mixer.disconnect();

      // Disconnect from program bus
      if (this.programBus && this.programBus.masterGain) {
        try {
          this.programBus.masterGain.disconnect(bus.mixer);
        } catch (error) {
          // Node might already be disconnected, ignore
          console.warn(`[MixMinus] Could not disconnect program bus from mixer for ${peerId}:`, error.message);
        }
      }

      // Remove from map
      this.mixMinusBuses.delete(peerId);

      console.log(`[MixMinus] Destroyed mix-minus bus for ${peerId}`);

      this.dispatchEvent(new CustomEvent('mix-minus-destroyed', {
        detail: { peerId }
      }));
    } catch (error) {
      console.error(`[MixMinus] Error destroying mix-minus bus for ${peerId}:`, error);
    }
  }

  /**
   * Get mix-minus MediaStream for a participant
   * @param {string} peerId - Participant identifier
   * @returns {MediaStream|null} Mix-minus audio stream
   */
  getMixMinusStream(peerId) {
    const bus = this.mixMinusBuses.get(peerId);
    return bus ? bus.mediaStream : null;
  }

  /**
   * Check if mix-minus bus exists for a participant
   * @param {string} peerId - Participant identifier
   * @returns {boolean}
   */
  hasMixMinusBus(peerId) {
    return this.mixMinusBuses.has(peerId);
  }

  /**
   * Get all participant IDs with mix-minus buses
   * @returns {string[]}
   */
  getParticipants() {
    return Array.from(this.mixMinusBuses.keys());
  }

  /**
   * Get count of active mix-minus buses
   * @returns {number}
   */
  getCount() {
    return this.mixMinusBuses.size;
  }

  /**
   * Get mix-minus info for debugging
   * @returns {object}
   */
  getInfo() {
    const buses = [];

    for (const [peerId, bus] of this.mixMinusBuses.entries()) {
      buses.push({
        peerId,
        inverterGain: bus.inverter.gain.value,
        mixerGain: bus.mixer.gain.value,
        hasMediaStream: bus.mediaStream ? true : false,
        streamId: bus.mediaStream ? bus.mediaStream.id : null
      });
    }

    return {
      count: this.mixMinusBuses.size,
      buses
    };
  }

  /**
   * Destroy all mix-minus buses
   */
  destroyAll() {
    console.log('[MixMinus] Destroying all mix-minus buses');

    const peerIds = Array.from(this.mixMinusBuses.keys());
    for (const peerId of peerIds) {
      this.destroyMixMinusBus(peerId);
    }

    this.dispatchEvent(new Event('all-destroyed'));
  }
}
