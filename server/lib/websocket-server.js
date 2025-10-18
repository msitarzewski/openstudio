/**
 * WebSocket server wrapper for signaling server
 */

import { WebSocketServer } from 'ws';
import * as logger from './logger.js';

/**
 * Create and configure WebSocket server
 * @param {import('http').Server} httpServer - HTTP server instance
 * @returns {WebSocketServer} Configured WebSocket server
 */
export function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, request) => {
    const clientIp = request.socket.remoteAddress;
    logger.info('WebSocket client connected:', clientIp);

    // Send welcome message (optional, for debugging)
    ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to OpenStudio signaling server' }));

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(ws, message);
      } catch (error) {
        logger.error('Failed to parse WebSocket message:', error.message);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
    });

    // Handle client disconnection
    ws.on('close', () => {
      logger.info('WebSocket client disconnected:', clientIp);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error:', error.message);
    });
  });

  wss.on('error', (error) => {
    logger.error('WebSocket server error:', error.message);
  });

  return wss;
}

/**
 * Handle incoming WebSocket messages
 * @param {import('ws').WebSocket} ws - WebSocket connection
 * @param {object} message - Parsed message object
 */
function handleMessage(ws, message) {
  logger.info('Received message:', message.type);

  switch (message.type) {
    case 'ping':
      // Respond with pong and current timestamp
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: Date.now()
      }));
      break;

    default:
      logger.warn('Unknown message type:', message.type);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${message.type}`
      }));
  }
}

export default { createWebSocketServer };
