/**
 * audio-context-manager.js
 * AudioContext singleton and lifecycle management for OpenStudio
 *
 * Handles:
 * - AudioContext creation (singleton pattern)
 * - Browser compatibility (webkit prefix)
 * - Autoplay policy (resume on user interaction)
 * - Context state management (suspended → running)
 */

class AudioContextManager extends EventTarget {
  constructor() {
    super();
    this.context = null;
    this.isResuming = false;
  }

  /**
   * Initialize AudioContext (singleton)
   * Creates context in suspended state per browser autoplay policy
   */
  initialize() {
    if (this.context) {
      console.log('[AudioContext] Already initialized');
      return this.context;
    }

    // Browser compatibility: webkit prefix for Safari
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      const error = new Error('Web Audio API not supported in this browser');
      console.error('[AudioContext] Initialization failed:', error);
      this.dispatchEvent(new CustomEvent('error', { detail: { message: error.message } }));
      throw error;
    }

    try {
      this.context = new AudioContextClass();
      console.log(`[AudioContext] Created (state: ${this.context.state}, sample rate: ${this.context.sampleRate}Hz)`);

      // Listen for state changes
      this.context.addEventListener('statechange', () => {
        console.log(`[AudioContext] State changed: ${this.context.state}`);
        this.dispatchEvent(new CustomEvent('statechange', {
          detail: { state: this.context.state }
        }));
      });

      this.dispatchEvent(new Event('initialized'));
      return this.context;
    } catch (error) {
      console.error('[AudioContext] Failed to create context:', error);
      this.dispatchEvent(new CustomEvent('error', { detail: { message: error.message } }));
      throw error;
    }
  }

  /**
   * Resume AudioContext (required for browser autoplay policy)
   * Must be called in response to user interaction
   */
  async resume() {
    if (!this.context) {
      throw new Error('AudioContext not initialized. Call initialize() first.');
    }

    if (this.context.state === 'running') {
      console.log('[AudioContext] Already running');
      return;
    }

    if (this.isResuming) {
      console.log('[AudioContext] Resume already in progress');
      return;
    }

    try {
      this.isResuming = true;
      console.log('[AudioContext] Resuming...');

      await this.context.resume();

      console.log(`[AudioContext] Resumed successfully (state: ${this.context.state})`);
      this.dispatchEvent(new Event('resumed'));
    } catch (error) {
      console.error('[AudioContext] Failed to resume:', error);
      this.dispatchEvent(new CustomEvent('error', { detail: { message: error.message } }));
      throw error;
    } finally {
      this.isResuming = false;
    }
  }

  /**
   * Suspend AudioContext (pause audio processing)
   */
  async suspend() {
    if (!this.context) {
      return;
    }

    if (this.context.state === 'suspended') {
      console.log('[AudioContext] Already suspended');
      return;
    }

    try {
      await this.context.suspend();
      console.log('[AudioContext] Suspended');
      this.dispatchEvent(new Event('suspended'));
    } catch (error) {
      console.error('[AudioContext] Failed to suspend:', error);
    }
  }

  /**
   * Close AudioContext (release resources)
   */
  async close() {
    if (!this.context) {
      return;
    }

    try {
      await this.context.close();
      console.log('[AudioContext] Closed');
      this.context = null;
      this.dispatchEvent(new Event('closed'));
    } catch (error) {
      console.error('[AudioContext] Failed to close:', error);
    }
  }

  /**
   * Get AudioContext instance
   */
  getContext() {
    if (!this.context) {
      throw new Error('AudioContext not initialized. Call initialize() first.');
    }
    return this.context;
  }

  /**
   * Get current state
   */
  getState() {
    return this.context ? this.context.state : 'uninitialized';
  }

  /**
   * Check if context is ready for audio processing
   */
  isReady() {
    return this.context && this.context.state === 'running';
  }
}

// Export singleton instance
export const audioContextManager = new AudioContextManager();
