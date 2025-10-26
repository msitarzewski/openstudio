/**
 * icecast-proxy.js
 * WebSocket proxy for streaming to Icecast
 *
 * Maintains a persistent PUT connection to Icecast and forwards
 * chunks received via WebSocket. This enables Safari and other
 * browsers that don't support ReadableStream uploads to stream.
 */

import http from 'http';
import * as logger from './logger.js';

export class IcecastProxy {
  constructor(config = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 6737,
      mountPoint: config.mountPoint || '/live.opus',
      username: config.username || 'source',
      password: config.password || 'hackme',
      contentType: config.contentType || 'audio/webm'
    };

    this.activeConnections = new Map(); // clientId -> connection state
  }

  /**
   * Start streaming for a client
   * @param {string} clientId - Unique client identifier
   * @param {WebSocket} ws - WebSocket connection to client
   */
  async startStream(clientId, ws) {
    if (this.activeConnections.has(clientId)) {
      logger.warn(`[IcecastProxy] Client ${clientId} already streaming`);
      return;
    }

    logger.info(`[IcecastProxy] Starting stream for client ${clientId}`);

    try {
      // Create persistent PUT connection to Icecast
      const connection = await this.createIcecastConnection();

      this.activeConnections.set(clientId, {
        ws,
        connection,
        startTime: Date.now()
      });

      logger.info(`[IcecastProxy] Stream started for client ${clientId}`);

      // Send success message to client
      ws.send(JSON.stringify({
        type: 'stream-started',
        message: 'Connected to Icecast server'
      }));

    } catch (error) {
      logger.error(`[IcecastProxy] Failed to start stream for ${clientId}:`, error.message);

      // Send error to client
      ws.send(JSON.stringify({
        type: 'stream-error',
        message: `Failed to connect to Icecast: ${error.message}`
      }));
    }
  }

  /**
   * Create persistent PUT connection to Icecast
   */
  createIcecastConnection() {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');

      // Use 127.0.0.1 instead of localhost to avoid IPv6 issues in Docker
      const hostname = this.config.host === 'localhost' ? '127.0.0.1' : this.config.host;

      const options = {
        hostname: hostname,
        port: this.config.port,
        path: this.config.mountPoint,
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': this.config.contentType,
          'Ice-Name': 'OpenStudio Live Stream',
          'Ice-Description': 'OpenStudio live broadcast',
          'Ice-Public': '0',
          'Transfer-Encoding': 'chunked'
        }
      };

      const req = http.request(options, (res) => {
        if (res.statusCode === 200) {
          logger.info('[IcecastProxy] Connected to Icecast successfully');
          resolve(req);
        } else {
          reject(new Error(`Icecast returned ${res.statusCode}: ${res.statusMessage}`));
        }
      });

      req.on('error', (error) => {
        logger.error('[IcecastProxy] Icecast connection error:', error.message);
        reject(error);
      });

      // Don't end the request - keep it open for streaming
    });
  }

  /**
   * Handle chunk from client
   * @param {string} clientId - Client identifier
   * @param {Buffer} chunk - Audio chunk data
   */
  async handleChunk(clientId, chunk) {
    const state = this.activeConnections.get(clientId);

    if (!state) {
      logger.warn(`[IcecastProxy] Received chunk for unknown client: ${clientId}`);
      return;
    }

    try {
      // Write chunk to Icecast connection
      state.connection.write(chunk);

      // Send acknowledgment to client
      state.ws.send(JSON.stringify({
        type: 'chunk-ack',
        size: chunk.length
      }));

    } catch (error) {
      logger.error(`[IcecastProxy] Failed to send chunk for ${clientId}:`, error.message);
      this.handleError(clientId, error);
    }
  }

  /**
   * Stop streaming for a client
   * @param {string} clientId - Client identifier
   */
  stopStream(clientId) {
    const state = this.activeConnections.get(clientId);

    if (!state) {
      return;
    }

    logger.info(`[IcecastProxy] Stopping stream for client ${clientId}`);

    try {
      // End the Icecast connection
      state.connection.end();
    } catch (error) {
      logger.error(`[IcecastProxy] Error closing Icecast connection:`, error.message);
    }

    this.activeConnections.delete(clientId);

    logger.info(`[IcecastProxy] Stream stopped for client ${clientId}`);
  }

  /**
   * Handle error for a client stream
   * @param {string} clientId - Client identifier
   * @param {Error} error - Error object
   */
  handleError(clientId, error) {
    const state = this.activeConnections.get(clientId);

    if (state) {
      // Send error to client
      state.ws.send(JSON.stringify({
        type: 'stream-error',
        message: error.message
      }));
    }

    this.stopStream(clientId);
  }

  /**
   * Get status for all active streams
   */
  getStatus() {
    const streams = [];

    for (const [clientId, state] of this.activeConnections) {
      streams.push({
        clientId,
        duration: Date.now() - state.startTime
      });
    }

    return {
      activeStreams: streams.length,
      streams
    };
  }
}
