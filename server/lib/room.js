/**
 * Room class - Manages participants in a session
 */

import * as logger from './logger.js';

export class Room {
  /**
   * Create a new room
   * @param {string} roomId - Unique room identifier
   * @param {string} hostId - Peer ID of the host
   * @param {import('ws').WebSocket} hostConnection - Host's WebSocket connection
   */
  constructor(roomId, hostId, hostConnection) {
    this.roomId = roomId;
    this.hostId = hostId;

    // Map of peerId -> { role: 'host'|'caller', connection: WebSocket }
    this.participants = new Map();

    // Add host as first participant
    this.participants.set(hostId, {
      role: 'host',
      connection: hostConnection
    });

    logger.info(`Room created: ${roomId} with host: ${hostId}`);
  }

  /**
   * Add a participant to the room
   * @param {string} peerId - Peer ID
   * @param {import('ws').WebSocket} connection - WebSocket connection
   * @param {string} role - Participant role ('host' or 'caller')
   * @returns {{success: boolean, error?: string}}
   */
  addParticipant(peerId, connection, role = 'caller') {
    if (this.participants.has(peerId)) {
      logger.warn(`Peer ${peerId} already in room ${this.roomId}`);
      return {
        success: false,
        error: `Peer "${peerId}" is already in this room`
      };
    }

    this.participants.set(peerId, { role, connection });
    logger.info(`Peer ${peerId} joined room ${this.roomId} as ${role} (total: ${this.participants.size})`);

    return { success: true };
  }

  /**
   * Remove a participant from the room
   * @param {string} peerId - Peer ID to remove
   * @returns {boolean} True if participant was removed
   */
  removeParticipant(peerId) {
    const removed = this.participants.delete(peerId);
    if (removed) {
      logger.info(`Peer ${peerId} left room ${this.roomId} (remaining: ${this.participants.size})`);
    }
    return removed;
  }

  /**
   * Get all participants in the room
   * @returns {Array<{peerId: string, role: string}>}
   */
  getParticipants() {
    return Array.from(this.participants.entries()).map(([peerId, data]) => ({
      peerId,
      role: data.role
    }));
  }

  /**
   * Check if a peer is in the room
   * @param {string} peerId - Peer ID to check
   * @returns {boolean}
   */
  hasParticipant(peerId) {
    return this.participants.has(peerId);
  }

  /**
   * Get participant count
   * @returns {number}
   */
  getParticipantCount() {
    return this.participants.size;
  }

  /**
   * Get participant data
   * @param {string} peerId - Peer ID
   * @returns {{role: string, connection: import('ws').WebSocket}|undefined}
   */
  getParticipant(peerId) {
    return this.participants.get(peerId);
  }

  /**
   * Broadcast a message to all participants in the room
   * @param {object} message - Message to broadcast
   * @param {string|null} excludePeerId - Optional peer ID to exclude from broadcast
   * @returns {number} Number of participants who received the message
   */
  broadcast(message, excludePeerId = null) {
    let sentCount = 0;
    const messageStr = JSON.stringify(message);

    for (const [peerId, data] of this.participants.entries()) {
      // Skip excluded peer
      if (peerId === excludePeerId) {
        continue;
      }

      // Check connection state
      if (data.connection.readyState !== 1) { // WebSocket.OPEN = 1
        logger.warn(`Cannot broadcast to ${peerId}: connection not open`);
        continue;
      }

      try {
        data.connection.send(messageStr);
        sentCount++;
      } catch (error) {
        logger.error(`Failed to broadcast to ${peerId}:`, error.message);
      }
    }

    logger.info(`Broadcast ${message.type} in room ${this.roomId} to ${sentCount} participants`);
    return sentCount;
  }

  /**
   * Check if room is empty
   * @returns {boolean}
   */
  isEmpty() {
    return this.participants.size === 0;
  }
}

export default Room;
