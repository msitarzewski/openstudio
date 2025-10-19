/**
 * return-feed.js
 * Return feed management for OpenStudio
 *
 * Handles playback of personalized mix-minus audio feeds sent back to participants.
 * Return feeds bypass the audio graph and play directly to speakers, allowing
 * participants to hear everyone except themselves (prevents echo/feedback).
 *
 * Audio Routing:
 * - Microphone track → AudioGraph → Program Bus (mixed with others)
 * - Return feed track → Speakers (direct playback, no processing)
 *
 * This is the final piece of the mix-minus system:
 * 1. Participant's mic → Other peers' audio graphs
 * 2. Other peers create mix-minus (Program - Participant)
 * 3. Mix-minus sent back as return feed → This module plays it
 * 4. Result: Participant hears everyone except themselves ✅
 */

export class ReturnFeedManager extends EventTarget {
  constructor() {
    super();

    // Track HTMLAudioElements for return feed playback
    // peerId -> HTMLAudioElement
    this.audioElements = new Map();

    console.log('[ReturnFeed] ReturnFeedManager initialized');
  }

  /**
   * Play return feed stream for a participant
   * Routes audio directly to speakers, bypassing the audio graph
   *
   * @param {string} peerId - Participant identifier
   * @param {MediaStream} stream - Mix-minus audio stream (all participants except peerId)
   */
  playReturnFeed(peerId, stream) {
    if (!stream) {
      console.error(`[ReturnFeed] Cannot play return feed for ${peerId}: stream is null`);
      return;
    }

    // Check if already playing
    if (this.audioElements.has(peerId)) {
      console.warn(`[ReturnFeed] Return feed for ${peerId} already playing, stopping old stream`);
      this.stopReturnFeed(peerId);
    }

    console.log(`[ReturnFeed] Starting return feed playback for ${peerId}`);
    console.log(`[ReturnFeed] Stream ID: ${stream.id}, Tracks: ${stream.getAudioTracks().length}`);

    try {
      // Create HTMLAudioElement for direct playback
      const audio = new Audio();
      audio.srcObject = stream;
      audio.autoplay = true;

      // Set volume to 100% (mix-minus already has correct levels)
      audio.volume = 1.0;

      // Handle errors
      audio.addEventListener('error', (event) => {
        console.error(`[ReturnFeed] Audio playback error for ${peerId}:`, event);
        this.dispatchEvent(new CustomEvent('error', {
          detail: {
            peerId,
            message: 'Return feed playback failed'
          }
        }));
      });

      // Store reference
      this.audioElements.set(peerId, audio);

      console.log(`[ReturnFeed] Return feed playback started for ${peerId}`);

      this.dispatchEvent(new CustomEvent('return-feed-started', {
        detail: { peerId, stream }
      }));

      // Play the audio (may be needed if autoplay fails)
      audio.play().catch(error => {
        console.warn(`[ReturnFeed] Autoplay failed for ${peerId}, user interaction may be required:`, error);
      });
    } catch (error) {
      console.error(`[ReturnFeed] Failed to start return feed for ${peerId}:`, error);
      throw error;
    }
  }

  /**
   * Stop return feed playback for a participant
   *
   * @param {string} peerId - Participant identifier
   */
  stopReturnFeed(peerId) {
    const audio = this.audioElements.get(peerId);
    if (!audio) {
      console.warn(`[ReturnFeed] No return feed playback for ${peerId}`);
      return;
    }

    console.log(`[ReturnFeed] Stopping return feed playback for ${peerId}`);

    try {
      // Stop playback
      audio.pause();
      audio.srcObject = null;

      // Remove reference
      this.audioElements.delete(peerId);

      console.log(`[ReturnFeed] Return feed playback stopped for ${peerId}`);

      this.dispatchEvent(new CustomEvent('return-feed-stopped', {
        detail: { peerId }
      }));
    } catch (error) {
      console.error(`[ReturnFeed] Failed to stop return feed for ${peerId}:`, error);
    }
  }

  /**
   * Check if return feed is playing for a participant
   *
   * @param {string} peerId - Participant identifier
   * @returns {boolean}
   */
  isPlaying(peerId) {
    return this.audioElements.has(peerId);
  }

  /**
   * Get all peer IDs with active return feeds
   *
   * @returns {string[]}
   */
  getActivePeers() {
    return Array.from(this.audioElements.keys());
  }

  /**
   * Get count of active return feeds
   *
   * @returns {number}
   */
  getCount() {
    return this.audioElements.size;
  }

  /**
   * Stop all return feed playback
   */
  stopAll() {
    console.log('[ReturnFeed] Stopping all return feed playback');

    const peerIds = Array.from(this.audioElements.keys());
    for (const peerId of peerIds) {
      this.stopReturnFeed(peerId);
    }

    this.dispatchEvent(new Event('all-stopped'));
  }

  /**
   * Get return feed info for debugging
   *
   * @returns {object}
   */
  getInfo() {
    const feeds = [];

    for (const [peerId, audio] of this.audioElements.entries()) {
      feeds.push({
        peerId,
        volume: audio.volume,
        muted: audio.muted,
        paused: audio.paused,
        hasStream: audio.srcObject ? true : false,
        streamId: audio.srcObject ? audio.srcObject.id : null
      });
    }

    return {
      count: this.audioElements.size,
      feeds
    };
  }
}
