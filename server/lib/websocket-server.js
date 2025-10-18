/**
 * WebSocket server wrapper for signaling server
 */

import { WebSocketServer } from 'ws';
import * as logger from './logger.js';
import { PeerRegistry, relayMessage } from './signaling-protocol.js';
import { validateSignalingMessage } from './message-validator.js';

// Global peer registry
const peerRegistry = new PeerRegistry();

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
      // Unregister peer if registered
      peerRegistry.unregisterByConnection(ws);
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
  // Get peer ID if registered
  const peerId = peerRegistry.getPeerId(ws);

  logger.info('Received message:', message.type, peerId ? `from ${peerId}` : '(unregistered)');

  // Validate message
  const validation = validateSignalingMessage(message, peerId);
  if (!validation.valid) {
    const errorList = validation.errors.join(', ');
    logger.warn(`Invalid message from ${peerId || 'unregistered peer'}:`, errorList);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Invalid message: ${errorList}`
    }));
    return;
  }

  // Handle message by type
  switch (message.type) {
    case 'register':
      handleRegister(ws, message);
      break;

    case 'ping':
      // Respond with pong and current timestamp
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: Date.now()
      }));
      break;

    case 'offer':
    case 'answer':
    case 'ice-candidate':
      handleSignalingMessage(ws, message, peerId);
      break;

    default:
      logger.warn('Unknown message type:', message.type);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${message.type}`
      }));
  }
}

/**
 * Handle peer registration
 * @param {import('ws').WebSocket} ws - WebSocket connection
 * @param {object} message - Register message
 */
function handleRegister(ws, message) {
  const result = peerRegistry.registerPeer(message.peerId, ws);

  if (result.success) {
    ws.send(JSON.stringify({
      type: 'registered',
      peerId: message.peerId
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: result.error
    }));
  }
}

/**
 * Handle signaling messages (offer, answer, ice-candidate)
 * @param {import('ws').WebSocket} ws - WebSocket connection
 * @param {object} message - Signaling message
 * @param {string} peerId - Sender's peer ID
 */
function handleSignalingMessage(ws, message, peerId) {
  const result = relayMessage(peerRegistry, message, peerId);

  if (!result.success) {
    ws.send(JSON.stringify({
      type: 'error',
      message: result.error
    }));
  }
  // Note: We don't send a success confirmation to avoid extra message traffic
  // The relay itself is the confirmation
}

export default { createWebSocketServer };
