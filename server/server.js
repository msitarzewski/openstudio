/**
 * OpenStudio Signaling Server
 *
 * Provides WebSocket signaling for WebRTC peer coordination
 * and HTTP health check endpoint.
 */

import http from 'http';
import * as logger from './lib/logger.js';
import { createWebSocketServer } from './lib/websocket-server.js';
import { loadConfig } from './lib/config-loader.js';

// Load and validate station manifest (fail fast if invalid)
let config;
try {
  config = loadConfig();
} catch (error) {
  logger.error('Failed to load station manifest:', error.message);
  process.exit(1);
}

// Configuration
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

// Create HTTP server
const httpServer = http.createServer((req, res) => {
  // Health check endpoint
  if (req.method === 'GET' && req.url === '/health') {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime }));
    return;
  }

  // Station info endpoint
  if (req.method === 'GET' && req.url === '/api/station') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      stationId: config.stationId,
      name: config.name,
      signaling: config.signaling,
      ice: config.ice
    }));
    return;
  }

  // 404 for all other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Create WebSocket server attached to HTTP server
const wss = createWebSocketServer(httpServer);

// Start server
httpServer.listen(PORT, () => {
  logger.info(`OpenStudio signaling server listening on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`WebSocket: ws://localhost:${PORT}`);
});

// Graceful shutdown handler
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Close WebSocket server (stop accepting new connections)
  wss.close(() => {
    logger.info('WebSocket server closed');
  });

  // Close HTTP server
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 10000);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
