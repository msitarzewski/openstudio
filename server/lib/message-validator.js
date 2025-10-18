/**
 * Message validator for WebSocket signaling protocol
 *
 * Validates signaling messages (offer, answer, ice-candidate, register)
 * to ensure they contain required fields and proper structure.
 */

/**
 * Validate a signaling message
 * @param {object} message - Parsed message object
 * @param {string|null} registeredPeerId - The peer ID of the sender (null if not registered)
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateSignalingMessage(message, registeredPeerId = null) {
  const errors = [];

  // Check message is an object
  if (!message || typeof message !== 'object') {
    return { valid: false, errors: ['Message must be a valid JSON object'] };
  }

  // Check message type exists
  if (!message.type || typeof message.type !== 'string') {
    errors.push('Missing or invalid "type" field (must be non-empty string)');
    return { valid: false, errors }; // Can't validate further without type
  }

  // Validate based on message type
  switch (message.type) {
    case 'register':
      validateRegisterMessage(message, errors);
      break;

    case 'offer':
    case 'answer':
      validateOfferAnswerMessage(message, registeredPeerId, errors);
      break;

    case 'ice-candidate':
      validateIceCandidateMessage(message, registeredPeerId, errors);
      break;

    case 'ping':
      // Ping messages don't require additional validation
      break;

    default:
      // Unknown message types are allowed (for extensibility)
      // They'll be handled by the protocol layer
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate register message
 * @param {object} message - Message to validate
 * @param {string[]} errors - Array to accumulate errors
 */
function validateRegisterMessage(message, errors) {
  if (!message.peerId || typeof message.peerId !== 'string') {
    errors.push('Missing or invalid "peerId" field (must be non-empty string)');
  } else if (message.peerId.trim().length === 0) {
    errors.push('Field "peerId" cannot be empty or whitespace');
  }
}

/**
 * Validate offer or answer message
 * @param {object} message - Message to validate
 * @param {string|null} registeredPeerId - Sender's registered peer ID
 * @param {string[]} errors - Array to accumulate errors
 */
function validateOfferAnswerMessage(message, registeredPeerId, errors) {
  // Check sender is registered
  if (!registeredPeerId) {
    errors.push('Peer must register before sending offer/answer messages');
    return;
  }

  // Validate from field
  if (!message.from || typeof message.from !== 'string') {
    errors.push('Missing or invalid "from" field (must be non-empty string)');
  } else if (message.from !== registeredPeerId) {
    errors.push(`Field "from" must match registered peer ID (expected: ${registeredPeerId}, got: ${message.from})`);
  }

  // Validate to field
  if (!message.to || typeof message.to !== 'string') {
    errors.push('Missing or invalid "to" field (must be non-empty string)');
  }

  // Validate sdp field
  if (!message.sdp || typeof message.sdp !== 'string') {
    errors.push('Missing or invalid "sdp" field (must be non-empty string)');
  }
}

/**
 * Validate ICE candidate message
 * @param {object} message - Message to validate
 * @param {string|null} registeredPeerId - Sender's registered peer ID
 * @param {string[]} errors - Array to accumulate errors
 */
function validateIceCandidateMessage(message, registeredPeerId, errors) {
  // Check sender is registered
  if (!registeredPeerId) {
    errors.push('Peer must register before sending ICE candidate messages');
    return;
  }

  // Validate from field
  if (!message.from || typeof message.from !== 'string') {
    errors.push('Missing or invalid "from" field (must be non-empty string)');
  } else if (message.from !== registeredPeerId) {
    errors.push(`Field "from" must match registered peer ID (expected: ${registeredPeerId}, got: ${message.from})`);
  }

  // Validate to field
  if (!message.to || typeof message.to !== 'string') {
    errors.push('Missing or invalid "to" field (must be non-empty string)');
  }

  // Validate candidate field (should be an object)
  if (!message.candidate) {
    errors.push('Missing "candidate" field');
  } else if (typeof message.candidate !== 'object') {
    errors.push('Field "candidate" must be an object');
  }
}

export default { validateSignalingMessage };
