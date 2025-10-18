/**
 * Signaling protocol - Peer registry and message routing
 *
 * Manages peer connections and routes signaling messages between peers.
 */

import * as logger from './logger.js';

/**
 * Peer registry - Manages peerId to WebSocket connection mappings
 */
export class PeerRegistry {
  constructor() {
    // Map of peerId (string) -> WebSocket connection
    this.peers = new Map();

    // WeakMap to store peerId for each WebSocket (for reverse lookup)
    this.connections = new WeakMap();
  }

  /**
   * Register a new peer
   * @param {string} peerId - Unique peer identifier
   * @param {import('ws').WebSocket} ws - WebSocket connection
   * @returns {{success: boolean, error?: string}}
   */
  registerPeer(peerId, ws) {
    // Check if peer ID is already registered
    if (this.peers.has(peerId)) {
      logger.warn(`Peer ID already registered: ${peerId}`);
      return {
        success: false,
        error: `Peer ID "${peerId}" is already registered`
      };
    }

    // Register the peer
    this.peers.set(peerId, ws);
    this.connections.set(ws, peerId);

    logger.info(`Peer registered: ${peerId} (total peers: ${this.peers.size})`);

    return { success: true };
  }

  /**
   * Unregister a peer
   * @param {string} peerId - Peer identifier to remove
   */
  unregisterPeer(peerId) {
    if (this.peers.has(peerId)) {
      const ws = this.peers.get(peerId);
      this.peers.delete(peerId);
      // Note: WeakMap entries are automatically cleaned up when ws is garbage collected

      logger.info(`Peer unregistered: ${peerId} (remaining peers: ${this.peers.size})`);
    }
  }

  /**
   * Unregister peer by WebSocket connection
   * @param {import('ws').WebSocket} ws - WebSocket connection
   */
  unregisterByConnection(ws) {
    const peerId = this.connections.get(ws);
    if (peerId) {
      this.unregisterPeer(peerId);
    }
  }

  /**
   * Get peer's WebSocket connection
   * @param {string} peerId - Peer identifier
   * @returns {import('ws').WebSocket|undefined}
   */
  getPeer(peerId) {
    return this.peers.get(peerId);
  }

  /**
   * Get peer ID for a WebSocket connection
   * @param {import('ws').WebSocket} ws - WebSocket connection
   * @returns {string|undefined}
   */
  getPeerId(ws) {
    return this.connections.get(ws);
  }

  /**
   * Check if a peer is registered
   * @param {string} peerId - Peer identifier
   * @returns {boolean}
   */
  hasPeer(peerId) {
    return this.peers.has(peerId);
  }

  /**
   * Get count of registered peers
   * @returns {number}
   */
  getPeerCount() {
    return this.peers.size;
  }

  /**
   * Get all registered peer IDs
   * @returns {string[]}
   */
  getAllPeerIds() {
    return Array.from(this.peers.keys());
  }
}

/**
 * Relay a signaling message to target peer
 * @param {PeerRegistry} registry - Peer registry instance
 * @param {object} message - Message to relay (must have 'to' field)
 * @param {string} fromPeerId - Sender's peer ID
 * @param {import('./room-manager.js').RoomManager} roomManager - Optional room manager for room validation
 * @returns {{success: boolean, error?: string}}
 */
export function relayMessage(registry, message, fromPeerId, roomManager = null) {
  const targetPeerId = message.to;

  // Check if target peer exists
  const targetWs = registry.getPeer(targetPeerId);
  if (!targetWs) {
    logger.warn(`Cannot relay message: target peer not found: ${targetPeerId}`);
    return {
      success: false,
      error: `Target peer "${targetPeerId}" is not connected`
    };
  }

  // If room manager provided, verify peers are in the same room
  if (roomManager) {
    const senderRoom = roomManager.getRoomForPeer(fromPeerId);
    const targetRoom = roomManager.getRoomForPeer(targetPeerId);

    if (senderRoom && targetRoom && senderRoom.roomId !== targetRoom.roomId) {
      logger.warn(`Cannot relay message: peers in different rooms (${senderRoom.roomId} vs ${targetRoom.roomId})`);
      return {
        success: false,
        error: `Target peer is in a different room`
      };
    }
  }

  // Check if target connection is still open
  if (targetWs.readyState !== 1) { // WebSocket.OPEN = 1
    logger.warn(`Cannot relay message: target peer connection not open: ${targetPeerId}`);
    return {
      success: false,
      error: `Target peer "${targetPeerId}" connection is not open`
    };
  }

  // Relay the message
  try {
    targetWs.send(JSON.stringify(message));
    logger.info(`Relayed ${message.type} from ${fromPeerId} to ${targetPeerId}`);
    return { success: true };
  } catch (error) {
    logger.error(`Failed to relay message to ${targetPeerId}:`, error.message);
    return {
      success: false,
      error: `Failed to send message to peer: ${error.message}`
    };
  }
}

/**
 * Broadcast a message to all participants in a room
 * @param {import('./room.js').Room} room - Room instance
 * @param {object} message - Message to broadcast
 * @param {string|null} excludePeerId - Optional peer ID to exclude from broadcast
 * @returns {number} Number of participants who received the message
 */
export function broadcastToRoom(room, message, excludePeerId = null) {
  return room.broadcast(message, excludePeerId);
}

export default { PeerRegistry, relayMessage, broadcastToRoom };
