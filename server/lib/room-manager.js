/**
 * Room Manager - Manages room lifecycle and peer-to-room mappings
 */

import { randomUUID } from 'crypto';
import * as logger from './logger.js';
import { Room } from './room.js';

export class RoomManager {
  constructor() {
    // Map of roomId -> Room instance
    this.rooms = new Map();

    // Map of peerId -> roomId (for fast lookup)
    this.peerToRoom = new Map();

    // Room TTL (for demo server - rooms expire after this duration)
    this.roomTTL = parseInt(process.env.ROOM_TTL_MS || '0'); // 0 = no expiry

    if (this.roomTTL > 0) {
      logger.info(`Room TTL enabled: ${this.roomTTL}ms (${this.roomTTL / 60000} minutes)`);
      this.roomCreationTimes = new Map(); // roomId -> timestamp
      this.ttlInterval = setInterval(() => this.expireRooms(), 60000);
    }

    logger.info('RoomManager initialized');
  }

  /**
   * Create a new room
   * @param {string} hostId - Peer ID of the host
   * @param {import('ws').WebSocket} hostConnection - Host's WebSocket connection
   * @returns {{success: boolean, roomId?: string, room?: Room, error?: string}}
   */
  createRoom(hostId, hostConnection) {
    // Check if peer is already in a room
    if (this.peerToRoom.has(hostId)) {
      const existingRoomId = this.peerToRoom.get(hostId);
      logger.warn(`Peer ${hostId} already in room ${existingRoomId}`);
      return {
        success: false,
        error: `Peer is already in room "${existingRoomId}"`
      };
    }

    // Generate unique room ID
    const roomId = randomUUID();

    // Create room with host
    const room = new Room(roomId, hostId, hostConnection);

    // Store room and mapping
    this.rooms.set(roomId, room);
    this.peerToRoom.set(hostId, roomId);

    if (this.roomTTL > 0) {
      this.roomCreationTimes.set(roomId, Date.now());
    }

    logger.info(`Room created: ${roomId} by host ${hostId} (total rooms: ${this.rooms.size})`);

    return {
      success: true,
      roomId,
      room
    };
  }

  /**
   * Get a room by ID
   * @param {string} roomId - Room ID
   * @returns {Room|undefined}
   */
  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  /**
   * Create or join a room (idempotent operation)
   * If room exists, join it. If not, create it with the specified ID.
   * @param {string|null} roomId - Room ID to create/join (null = generate new UUID)
   * @param {string} peerId - Peer ID
   * @param {import('ws').WebSocket} connection - WebSocket connection
   * @param {string} role - Participant role: 'host', 'ops', or 'guest' (default: 'guest')
   * @returns {{success: boolean, roomId?: string, room?: Room, created?: boolean, error?: string}}
   */
  createOrJoinRoom(roomId, peerId, connection, role = 'guest') {
    // Check if peer is already in a room
    if (this.peerToRoom.has(peerId)) {
      const existingRoomId = this.peerToRoom.get(peerId);
      logger.warn(`Peer ${peerId} already in room ${existingRoomId}`);
      return {
        success: false,
        error: `Peer is already in room "${existingRoomId}"`
      };
    }

    // Generate room ID if not provided
    const finalRoomId = roomId || randomUUID();

    // Check if room already exists
    let room = this.rooms.get(finalRoomId);
    let created = false;

    if (room) {
      // Room exists - join it
      logger.info(`Peer ${peerId} joining existing room ${finalRoomId} as ${role}`);

      const result = room.addParticipant(peerId, connection, role);
      if (!result.success) {
        return result;
      }

      // Store mapping
      this.peerToRoom.set(peerId, finalRoomId);

      return {
        success: true,
        roomId: finalRoomId,
        room,
        created: false
      };
    } else {
      // Room doesn't exist - create it
      logger.info(`Creating new room ${finalRoomId} for peer ${peerId} as ${role}`);

      // Create room with first participant
      room = new Room(finalRoomId, peerId, connection, role);

      // Store room and mapping
      this.rooms.set(finalRoomId, room);
      this.peerToRoom.set(peerId, finalRoomId);

      if (this.roomTTL > 0) {
        this.roomCreationTimes.set(finalRoomId, Date.now());
      }

      logger.info(`Room created: ${finalRoomId} by ${peerId} (${role}) (total rooms: ${this.rooms.size})`);

      return {
        success: true,
        roomId: finalRoomId,
        room,
        created: true
      };
    }
  }

  /**
   * Join an existing room
   * @param {string} roomId - Room ID to join
   * @param {string} peerId - Peer ID
   * @param {import('ws').WebSocket} connection - WebSocket connection
   * @returns {{success: boolean, room?: Room, error?: string}}
   */
  joinRoom(roomId, peerId, connection) {
    // Check if room exists
    const room = this.rooms.get(roomId);
    if (!room) {
      logger.warn(`Room not found: ${roomId}`);
      return {
        success: false,
        error: `Room "${roomId}" does not exist`
      };
    }

    // Check if peer is already in a room
    if (this.peerToRoom.has(peerId)) {
      const existingRoomId = this.peerToRoom.get(peerId);
      logger.warn(`Peer ${peerId} already in room ${existingRoomId}`);
      return {
        success: false,
        error: `Peer is already in room "${existingRoomId}"`
      };
    }

    // Add peer to room
    const result = room.addParticipant(peerId, connection, 'caller');
    if (!result.success) {
      return result;
    }

    // Store mapping
    this.peerToRoom.set(peerId, roomId);

    logger.info(`Peer ${peerId} joined room ${roomId}`);

    return {
      success: true,
      room
    };
  }

  /**
   * Remove a peer from their room
   * @param {string} peerId - Peer ID to remove
   * @returns {{success: boolean, room?: Room, wasLastParticipant?: boolean}}
   */
  removePeerFromRoom(peerId) {
    const roomId = this.peerToRoom.get(peerId);
    if (!roomId) {
      return { success: false };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      // Clean up orphaned mapping
      this.peerToRoom.delete(peerId);
      return { success: false };
    }

    // Remove peer from room
    room.removeParticipant(peerId);
    this.peerToRoom.delete(peerId);

    // Check if room is now empty
    if (room.isEmpty()) {
      this.rooms.delete(roomId);
      logger.info(`Room ${roomId} deleted (empty room, total rooms: ${this.rooms.size})`);
      return {
        success: true,
        room,
        wasLastParticipant: true
      };
    }

    return {
      success: true,
      room,
      wasLastParticipant: false
    };
  }

  /**
   * Get room ID for a peer
   * @param {string} peerId - Peer ID
   * @returns {string|undefined}
   */
  getRoomIdForPeer(peerId) {
    return this.peerToRoom.get(peerId);
  }

  /**
   * Get room for a peer
   * @param {string} peerId - Peer ID
   * @returns {Room|undefined}
   */
  getRoomForPeer(peerId) {
    const roomId = this.peerToRoom.get(peerId);
    if (!roomId) {
      return undefined;
    }
    return this.rooms.get(roomId);
  }

  /**
   * Delete a room by ID
   * @param {string} roomId - Room ID to delete
   * @returns {boolean} True if room was deleted
   */
  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    // Remove all peer-to-room mappings
    for (const participant of room.getParticipants()) {
      this.peerToRoom.delete(participant.peerId);
    }

    // Clean up TTL tracking
    if (this.roomCreationTimes) {
      this.roomCreationTimes.delete(roomId);
    }

    // Delete room
    this.rooms.delete(roomId);
    logger.info(`Room ${roomId} deleted (total rooms: ${this.rooms.size})`);

    return true;
  }

  /**
   * Expire rooms that have exceeded TTL
   */
  expireRooms() {
    if (!this.roomTTL || !this.roomCreationTimes) return;

    const now = Date.now();
    for (const [roomId, createdAt] of this.roomCreationTimes) {
      if (now - createdAt > this.roomTTL) {
        const room = this.rooms.get(roomId);
        if (room) {
          logger.info(`Room ${roomId} expired (TTL: ${this.roomTTL}ms)`);
          // Notify all participants
          room.broadcast({ type: 'room-expired', roomId });
          // Remove all participants
          for (const participant of room.getParticipants()) {
            this.peerToRoom.delete(participant.peerId);
          }
          this.rooms.delete(roomId);
        }
        this.roomCreationTimes.delete(roomId);
      }
    }
  }

  /**
   * Get total number of rooms
   * @returns {number}
   */
  getRoomCount() {
    return this.rooms.size;
  }

  /**
   * Get all room IDs
   * @returns {string[]}
   */
  getAllRoomIds() {
    return Array.from(this.rooms.keys());
  }
}

export default RoomManager;
