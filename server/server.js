/**
 * OpenStudio Signaling Server
 *
 * Provides WebSocket signaling for WebRTC peer coordination
 * and HTTP health check endpoint.
 */

import http from 'http';
import * as logger from './lib/logger.js';
import { createWebSocketServer, setIceConfig } from './lib/websocket-server.js';
import { loadConfig } from './lib/config-loader.js';
import { serveStatic } from './lib/static-server.js';
import { proxyIcecastListener } from './lib/icecast-listener-proxy.js';

// Load and validate station manifest (fail fast if invalid)
let config;
try {
  config = loadConfig();
} catch (error) {
  logger.error('Failed to load station manifest:', error.message);
  process.exit(1);
}

// Configuration
const PORT = process.env.PORT || 6736;
const startTime = Date.now();

/**
 * Set security headers on every HTTP response.
 * Defence-in-depth: these apply regardless of route.
 */
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

/**
 * Origin allowlist for CORS.
 * When ALLOWED_ORIGINS env var is unset/empty every origin is permitted
 * (open development mode). In production set a comma-separated list, e.g.
 *   ALLOWED_ORIGINS=https://studio.example.com,https://app.example.com
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

/**
 * Return the validated CORS origin header value for the given request,
 * or null if the origin is not on the allowlist.
 */
function getCorsOrigin(req) {
  const origin = req.headers.origin;
  if (allowedOrigins.length === 0) {
    // No allowlist configured — allow all (development mode)
    return origin || '*';
  }
  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }
  return null;
}

// Create HTTP server
const httpServer = http.createServer((req, res) => {
  setSecurityHeaders(res);

  // Health check endpoint
  if (req.method === 'GET' && req.url === '/health') {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime }));
    return;
  }

  // Station info endpoint
  if (req.method === 'GET' && req.url === '/api/station') {
    const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Methods': 'GET' };
    const corsOrigin = getCorsOrigin(req);
    if (corsOrigin) {
      corsHeaders['Access-Control-Allow-Origin'] = corsOrigin;
    }
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      stationId: config.stationId,
      name: config.name,
      signaling: config.signaling
      // ICE credentials are now delivered via WebSocket on room-created/room-joined
    }));
    return;
  }

  // Icecast listener proxy (/stream/*)
  if (proxyIcecastListener(req, res)) {
    return;
  }

  // Static file serving (web/ directory)
  if (serveStatic(req, res)) {
    return;
  }

  // 404 for all other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Pass ICE config to WebSocket server for room responses
if (config.ice) {
  setIceConfig(config.ice);
}

// Create WebSocket server attached to HTTP server
const wss = createWebSocketServer(httpServer);

// Start server
httpServer.listen(PORT, () => {
  logger.info(`OpenStudio listening on http://localhost:${PORT}`);
  logger.info(`WebSocket: ws://localhost:${PORT}`);
  logger.info(`Stream proxy: http://localhost:${PORT}/stream/live.opus`);
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
