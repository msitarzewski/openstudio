/**
 * WebSocket server wrapper for signaling server
 */

import { WebSocketServer } from 'ws';
import * as logger from './logger.js';
import { PeerRegistry, relayMessage, broadcastToRoom } from './signaling-protocol.js';
import { validateSignalingMessage } from './message-validator.js';
import { RoomManager } from './room-manager.js';

// Global peer registry
const peerRegistry = new PeerRegistry();

// Global room manager
const roomManager = new RoomManager();

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
      const peerId = peerRegistry.getPeerId(ws);

      if (peerId) {
        // Remove peer from room and notify others
        const result = roomManager.removePeerFromRoom(peerId);
        if (result.success && result.room && !result.wasLastParticipant) {
          // Broadcast peer-left to remaining participants
          result.room.broadcast({
            type: 'peer-left',
            peerId: peerId
          });
        }

        // Unregister peer
        peerRegistry.unregisterByConnection(ws);
      }

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

    case 'create-room':
      handleCreateRoom(ws, message, peerId);
      break;

    case 'join-room':
      handleJoinRoom(ws, message, peerId);
      break;

    case 'offer':
    case 'answer':
    case 'ice-candidate':
      handleSignalingMessage(ws, message, peerId);
      break;

    case 'mute':
      handleMuteMessage(ws, message, peerId);
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

/**
 * Handle create-room message
 * @param {import('ws').WebSocket} ws - WebSocket connection
 * @param {object} message - Create room message
 * @param {string} peerId - Peer ID
 */
function handleCreateRoom(ws, message, peerId) {
  if (!peerId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Must register before creating a room'
    }));
    return;
  }

  const result = roomManager.createRoom(peerId, ws);

  if (result.success) {
    ws.send(JSON.stringify({
      type: 'room-created',
      roomId: result.roomId,
      hostId: peerId
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: result.error
    }));
  }
}

/**
 * Handle join-room message
 * @param {import('ws').WebSocket} ws - WebSocket connection
 * @param {object} message - Join room message
 * @param {string} peerId - Peer ID
 */
function handleJoinRoom(ws, message, peerId) {
  if (!peerId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Must register before joining a room'
    }));
    return;
  }

  if (!message.roomId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Missing roomId field'
    }));
    return;
  }

  const result = roomManager.joinRoom(message.roomId, peerId, ws);

  if (result.success) {
    // Get participant list
    const participants = result.room.getParticipants();

    // Send room-joined confirmation to joiner
    ws.send(JSON.stringify({
      type: 'room-joined',
      roomId: message.roomId,
      participants: participants
    }));

    // Broadcast peer-joined to all existing participants (except the joiner)
    result.room.broadcast({
      type: 'peer-joined',
      peerId: peerId,
      role: 'caller'
    }, peerId);
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: result.error
    }));
  }
}

/**
 * Handle mute message (broadcast to all peers in room)
 * @param {import('ws').WebSocket} ws - WebSocket connection
 * @param {object} message - Mute message
 * @param {string} peerId - Sender's peer ID
 */
function handleMuteMessage(ws, message, peerId) {
  if (!peerId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Must register before sending mute messages'
    }));
    return;
  }

  // Get room for this peer
  const room = roomManager.getRoomForPeer(peerId);
  if (!room) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Not in a room'
    }));
    return;
  }

  // Broadcast mute message to all participants in room (including sender for state sync)
  const count = broadcastToRoom(room, message, null);
  logger.info(`Broadcasted mute message from ${peerId} to ${count} participants (peerId: ${message.peerId}, muted: ${message.muted}, authority: ${message.authority})`);
}

export default { createWebSocketServer };
