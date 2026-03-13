/**
 * Authentication module for OpenStudio
 *
 * JWT-based room tokens and invite tokens.
 * - Room token: issued on room create/join, proves peerId + role + roomId
 * - Invite token: issued by host, embedded in invite URL, proves roomId + role
 */

import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import * as logger from './logger.js';

// JWT secret: from env, or generate a random one for dev (logged as warning)
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = randomBytes(32).toString('hex');
  logger.warn('JWT_SECRET not set — generated random secret (tokens will not survive restart)');
}

const ROOM_TOKEN_EXPIRY = '24h';
const INVITE_TOKEN_EXPIRY = '4h';

/**
 * Generate a room token (proves identity + role in a room)
 * @param {string} peerId
 * @param {string} roomId
 * @param {string} role - 'host', 'ops', or 'guest'
 * @returns {string} signed JWT
 */
export function generateRoomToken(peerId, roomId, role) {
  return jwt.sign(
    { peerId, roomId, role, type: 'room' },
    JWT_SECRET,
    { expiresIn: ROOM_TOKEN_EXPIRY }
  );
}

/**
 * Generate an invite token (allows joining a room with a specific role)
 * @param {string} roomId
 * @param {string} role - 'host', 'ops', or 'guest'
 * @returns {string} signed JWT
 */
export function generateInviteToken(roomId, role) {
  return jwt.sign(
    { roomId, role, type: 'invite' },
    JWT_SECRET,
    { expiresIn: INVITE_TOKEN_EXPIRY }
  );
}

/**
 * Verify and decode a token
 * @param {string} token
 * @returns {{ valid: boolean, payload?: object, error?: string }}
 */
export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
