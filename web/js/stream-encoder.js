/**
 * stream-encoder.js
 * MediaRecorder wrapper for encoding program bus audio to Opus
 *
 * Captures the program bus MediaStream and encodes it to Opus chunks
 * for transmission to Icecast.
 */

export class StreamEncoder extends EventTarget {
  constructor() {
    super();
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.isRecording = false;
    this.bitrate = 128000; // 128kbps default (configurable)
    this.chunkInterval = 1000; // 1 second chunks
  }

  /**
   * Start encoding the given MediaStream
   * @param {MediaStream} mediaStream - The program bus MediaStream
   * @param {number} bitrate - Audio bitrate in bps (default: 128000)
   */
  start(mediaStream, bitrate = 128000) {
    if (this.isRecording) {
      console.warn('[StreamEncoder] Already recording');
      return;
    }

    if (!mediaStream) {
      throw new Error('MediaStream is required');
    }

    this.mediaStream = mediaStream;
    this.bitrate = bitrate;

    try {
      // Check for Opus support in WebM container
      const mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        throw new Error(`MIME type ${mimeType} not supported by this browser`);
      }

      console.log(`[StreamEncoder] Starting MediaRecorder with ${mimeType} at ${bitrate}bps`);

      // Create MediaRecorder with Opus encoding
      this.mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: mimeType,
        audioBitsPerSecond: bitrate
      });

      // Handle data availability (fired every chunkInterval ms)
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          console.log(`[StreamEncoder] Chunk available: ${event.data.size} bytes`);
          this.dispatchEvent(new CustomEvent('chunk', {
            detail: { data: event.data, size: event.data.size }
          }));
        }
      };

      // Handle recording start
      this.mediaRecorder.onstart = () => {
        console.log('[StreamEncoder] Recording started');
        this.isRecording = true;
        this.dispatchEvent(new Event('started'));
      };

      // Handle recording stop
      this.mediaRecorder.onstop = () => {
        console.log('[StreamEncoder] Recording stopped');
        this.isRecording = false;
        this.dispatchEvent(new Event('stopped'));
      };

      // Handle errors
      this.mediaRecorder.onerror = (error) => {
        console.error('[StreamEncoder] MediaRecorder error:', error);
        this.isRecording = false;
        this.dispatchEvent(new CustomEvent('error', {
          detail: { message: 'MediaRecorder error', error }
        }));
      };

      // Start recording with chunk interval
      this.mediaRecorder.start(this.chunkInterval);

    } catch (error) {
      console.error('[StreamEncoder] Failed to start encoding:', error);
      this.dispatchEvent(new CustomEvent('error', {
        detail: { message: 'Failed to start encoding', error }
      }));
      throw error;
    }
  }

  /**
   * Stop encoding
   */
  stop() {
    if (!this.isRecording || !this.mediaRecorder) {
      console.warn('[StreamEncoder] Not recording');
      return;
    }

    console.log('[StreamEncoder] Stopping MediaRecorder...');
    this.mediaRecorder.stop();
  }

  /**
   * Check if currently encoding
   * @returns {boolean}
   */
  isEncoding() {
    return this.isRecording;
  }

  /**
   * Get current bitrate
   * @returns {number}
   */
  getBitrate() {
    return this.bitrate;
  }

  /**
   * Get encoder info for debugging
   * @returns {object}
   */
  getInfo() {
    return {
      isRecording: this.isRecording,
      bitrate: this.bitrate,
      chunkInterval: this.chunkInterval,
      state: this.mediaRecorder ? this.mediaRecorder.state : null,
      mimeType: this.mediaRecorder ? this.mediaRecorder.mimeType : null
    };
  }
}
