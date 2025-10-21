/**
 * icecast-streamer.js
 * Manages streaming to Icecast server with reconnection logic
 *
 * Sends encoded audio chunks to Icecast mount point via HTTP PUT
 * with authentication and automatic reconnection on failure.
 */

import { StreamEncoder } from './stream-encoder.js';

export class IcecastStreamer extends EventTarget {
  constructor(config = {}) {
    super();

    // Icecast configuration
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6737,
      mountPoint: config.mountPoint || '/live.opus',
      username: config.username || 'source',
      password: config.password || 'hackme',
      contentType: config.contentType || 'audio/webm',
      bitrate: config.bitrate || 128000 // 128kbps default
    };

    // State
    this.encoder = new StreamEncoder();
    this.isStreaming = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // Start with 5s
    this.maxReconnectDelay = 60000; // Max 60s
    this.reconnectTimeout = null;

    // Stream transmission
    this.streamController = null;
    this.streamWriter = null;

    // Setup encoder event listeners
    this.setupEncoderListeners();
  }

  /**
   * Setup event listeners for the encoder
   */
  setupEncoderListeners() {
    this.encoder.addEventListener('chunk', (event) => {
      this.handleChunk(event.detail.data);
    });

    this.encoder.addEventListener('error', (event) => {
      console.error('[IcecastStreamer] Encoder error:', event.detail);
      this.handleError('Encoder error: ' + event.detail.message);
    });
  }

  /**
   * Start streaming to Icecast
   * @param {MediaStream} mediaStream - Program bus MediaStream
   */
  async start(mediaStream) {
    if (this.isStreaming) {
      console.warn('[IcecastStreamer] Already streaming');
      return;
    }

    console.log('[IcecastStreamer] Starting stream to Icecast...');
    this.dispatchEvent(new CustomEvent('status-change', {
      detail: { status: 'connecting', message: 'Connecting to Icecast...' }
    }));

    try {
      // Connect to Icecast
      await this.connectToIcecast();

      // Start encoder
      this.encoder.start(mediaStream, this.config.bitrate);

      this.isStreaming = true;
      this.reconnectAttempts = 0; // Reset reconnect counter on successful start

      console.log('[IcecastStreamer] Stream started successfully');
      this.dispatchEvent(new CustomEvent('status-change', {
        detail: { status: 'streaming', message: 'Streaming to Icecast' }
      }));

    } catch (error) {
      console.error('[IcecastStreamer] Failed to start stream:', error);
      this.handleError('Failed to connect to Icecast: ' + error.message);
    }
  }

  /**
   * Connect to Icecast server using Fetch API with ReadableStream
   */
  async connectToIcecast() {
    const url = `http://${this.config.host}:${this.config.port}${this.config.mountPoint}`;
    const auth = btoa(`${this.config.username}:${this.config.password}`);

    console.log(`[IcecastStreamer] Connecting to ${url}`);

    // Create a TransformStream to handle the chunk pipeline
    const { readable, writable } = new TransformStream();
    this.streamController = writable.getWriter();

    // Start the PUT request with streaming body
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': this.config.contentType,
        'Ice-Name': 'OpenStudio Live Stream',
        'Ice-Description': 'OpenStudio live broadcast',
        'Ice-Public': '0'
      },
      body: readable,
      // Note: duplex required for streaming request bodies
      duplex: 'half'
    });

    if (!response.ok) {
      throw new Error(`Icecast returned ${response.status}: ${response.statusText}`);
    }

    console.log('[IcecastStreamer] Connected to Icecast successfully');
  }

  /**
   * Handle encoded chunk from encoder
   * @param {Blob} chunk - Encoded audio chunk
   */
  async handleChunk(chunk) {
    if (!this.isStreaming || !this.streamController) {
      return;
    }

    try {
      // Convert Blob to ArrayBuffer for streaming
      const arrayBuffer = await chunk.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Write chunk to Icecast stream
      await this.streamController.write(uint8Array);

      // Emit chunk sent event for monitoring
      this.dispatchEvent(new CustomEvent('chunk-sent', {
        detail: { size: uint8Array.length }
      }));

    } catch (error) {
      console.error('[IcecastStreamer] Failed to send chunk:', error);
      this.handleError('Failed to send chunk to Icecast');
    }
  }

  /**
   * Stop streaming
   */
  async stop() {
    if (!this.isStreaming) {
      console.warn('[IcecastStreamer] Not streaming');
      return;
    }

    console.log('[IcecastStreamer] Stopping stream...');

    // Clear any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Stop encoder
    if (this.encoder.isEncoding()) {
      this.encoder.stop();
    }

    // Close stream connection
    if (this.streamController) {
      try {
        await this.streamController.close();
      } catch (error) {
        console.error('[IcecastStreamer] Error closing stream:', error);
      }
      this.streamController = null;
    }

    this.isStreaming = false;
    this.reconnectAttempts = 0;

    console.log('[IcecastStreamer] Stream stopped');
    this.dispatchEvent(new CustomEvent('status-change', {
      detail: { status: 'stopped', message: 'Streaming stopped' }
    }));
  }

  /**
   * Handle streaming error and attempt reconnection
   * @param {string} message - Error message
   */
  handleError(message) {
    console.error(`[IcecastStreamer] Error: ${message}`);

    this.isStreaming = false;

    // Check if we should attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;

      // Calculate exponential backoff delay
      const delay = Math.min(
        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
        this.maxReconnectDelay
      );

      console.log(`[IcecastStreamer] Will reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      this.dispatchEvent(new CustomEvent('status-change', {
        detail: {
          status: 'reconnecting',
          message: `Connection lost. Reconnecting in ${delay / 1000}s... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
        }
      }));

      // Schedule reconnection
      this.reconnectTimeout = setTimeout(() => {
        this.reconnect();
      }, delay);

    } else {
      // Max reconnect attempts reached
      console.error('[IcecastStreamer] Max reconnect attempts reached');
      this.dispatchEvent(new CustomEvent('status-change', {
        detail: {
          status: 'error',
          message: 'Failed to connect to Icecast. Max retry attempts reached.'
        }
      }));
    }
  }

  /**
   * Attempt to reconnect to Icecast
   */
  async reconnect() {
    console.log('[IcecastStreamer] Attempting reconnection...');

    try {
      // Get the current media stream (should still be available)
      // This will be passed from the app layer
      this.dispatchEvent(new CustomEvent('reconnect-attempt', {
        detail: { attempt: this.reconnectAttempts }
      }));

    } catch (error) {
      console.error('[IcecastStreamer] Reconnection failed:', error);
      this.handleError('Reconnection failed');
    }
  }

  /**
   * Update configuration
   * @param {object} newConfig - New configuration values
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('[IcecastStreamer] Configuration updated:', this.config);
  }

  /**
   * Get current streaming status
   * @returns {boolean}
   */
  getStatus() {
    return {
      isStreaming: this.isStreaming,
      reconnectAttempts: this.reconnectAttempts,
      config: this.config,
      encoder: this.encoder.getInfo()
    };
  }

  /**
   * Check if currently streaming
   * @returns {boolean}
   */
  isActive() {
    return this.isStreaming;
  }
}
