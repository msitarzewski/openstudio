/**
 * WebSocket server wrapper for signaling server
 */

import { WebSocketServer } from 'ws';
import * as logger from './logger.js';
import { PeerRegistry, relayMessage, broadcastToRoom } from './signaling-protocol.js';
import { validateSignalingMessage } from './message-validator.js';
import { RoomManager } from './room-manager.js';
import { IcecastProxy } from './icecast-proxy.js';

// Global peer registry
const peerRegistry = new PeerRegistry();

// Global room manager
const roomManager = new RoomManager();

// Global Icecast proxy
const icecastProxy = new IcecastProxy({
  host: process.env.ICECAST_HOST || 'localhost',
  port: parseInt(process.env.ICECAST_PORT || '6737'),
  mountPoint: process.env.ICECAST_MOUNT || '/live.opus',
  username: process.env.ICECAST_USER || 'source',
  password: process.env.ICECAST_PASS || 'hackme'
});

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

    case 'create-or-join-room':
      handleCreateOrJoinRoom(ws, message, peerId);
      break;

    case 'offer':
    case 'answer':
    case 'ice-candidate':
      handleSignalingMessage(ws, message, peerId);
      break;

    case 'mute':
      handleMuteMessage(ws, message, peerId);
      break;

    case 'start-stream':
      handleStartStream(ws, message, peerId);
      break;

    case 'stream-chunk':
      handleStreamChunk(ws, message, peerId);
      break;

    case 'stop-stream':
      handleStopStream(ws, message, peerId);
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
 * Handle create-or-join-room message (idempotent room access)
 * @param {import('ws').WebSocket} ws - WebSocket connection
 * @param {object} message - Create or join room message
 * @param {string} peerId - Peer ID
 */
function handleCreateOrJoinRoom(ws, message, peerId) {
  if (!peerId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Must register before creating or joining a room'
    }));
    return;
  }

  // Extract roomId and role from message
  const roomId = message.roomId || null; // null = generate new UUID
  const role = message.role || 'guest'; // Default to guest

  // Validate role
  const validRoles = ['host', 'ops', 'guest'];
  if (!validRoles.includes(role)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: `Invalid role "${role}". Must be one of: host, ops, guest`
    }));
    return;
  }

  const result = roomManager.createOrJoinRoom(roomId, peerId, ws, role);

  if (result.success) {
    // Get participant list
    const participants = result.room.getParticipants();

    if (result.created) {
      // Send room-created confirmation to creator
      ws.send(JSON.stringify({
        type: 'room-created',
        roomId: result.roomId,
        hostId: peerId,
        role: role
      }));
    } else {
      // Send room-joined confirmation to joiner
      ws.send(JSON.stringify({
        type: 'room-joined',
        roomId: result.roomId,
        participants: participants,
        role: role
      }));

      // Broadcast peer-joined to all existing participants (except the joiner)
      result.room.broadcast({
        type: 'peer-joined',
        peerId: peerId,
        role: role
      }, peerId);
    }
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

  // Validate permissions based on role and authority
  const senderRole = room.getRole(peerId);
  const targetPeerId = message.peerId;
  const authority = message.authority;
  const isSelf = targetPeerId === peerId;

  // Check permissions
  if (authority === 'producer' && !isSelf) {
    // Producer authority on others requires host or ops role
    if (senderRole !== 'host' && senderRole !== 'ops') {
      logger.warn(`Permission denied: ${peerId} (${senderRole}) attempted producer mute on ${targetPeerId}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Only hosts and ops can mute other participants'
      }));
      return;
    }
  }

  if (authority === 'self' && !isSelf) {
    // Self authority must be on self
    logger.warn(`Permission denied: ${peerId} attempted self-mute on ${targetPeerId} (not self)`);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Self authority can only be used on yourself'
    }));
    return;
  }

  // Broadcast mute message to all participants in room (including sender for state sync)
  const count = broadcastToRoom(room, message, null);
  logger.info(`Broadcasted mute message from ${peerId} (${senderRole}) to ${count} participants (peerId: ${targetPeerId}, muted: ${message.muted}, authority: ${authority})`);
}

/**
 * Handle start-stream message
 * @param {import('ws').WebSocket} ws - WebSocket connection
 * @param {object} message - Start stream message
 * @param {string} peerId - Peer ID
 */
async function handleStartStream(ws, message, peerId) {
  if (!peerId) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Must register before starting stream'
    }));
    return;
  }

  logger.info(`Starting Icecast stream for peer ${peerId}`);
  await icecastProxy.startStream(peerId, ws);
}

/**
 * Handle stream-chunk message
 * @param {import('ws').WebSocket} ws - WebSocket connection
 * @param {object} message - Stream chunk message
 * @param {string} peerId - Peer ID
 */
async function handleStreamChunk(ws, message, peerId) {
  if (!peerId) {
    return;
  }

  if (!message.chunk) {
    logger.warn(`No chunk data in stream-chunk from ${peerId}`);
    return;
  }

  // Convert base64 chunk to Buffer
  const chunk = Buffer.from(message.chunk, 'base64');
  await icecastProxy.handleChunk(peerId, chunk);
}

/**
 * Handle stop-stream message
 * @param {import('ws').WebSocket} ws - WebSocket connection
 * @param {object} message - Stop stream message
 * @param {string} peerId - Peer ID
 */
function handleStopStream(ws, message, peerId) {
  if (!peerId) {
    return;
  }

  logger.info(`Stopping Icecast stream for peer ${peerId}`);
  icecastProxy.stopStream(peerId);

  ws.send(JSON.stringify({
    type: 'stream-stopped',
    message: 'Stream stopped successfully'
  }));
}

export default { createWebSocketServer };
