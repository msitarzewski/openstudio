/**
 * Station manifest validator
 *
 * Validates that station-manifest.json contains all required fields
 * and that values are in expected formats.
 */

/**
 * Validate station manifest configuration
 * @param {object} manifest - Parsed manifest object
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateManifest(manifest) {
  const errors = [];

  // Check manifest is an object
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be a valid JSON object'] };
  }

  // Validate stationId
  if (!manifest.stationId || typeof manifest.stationId !== 'string') {
    errors.push('Missing or invalid "stationId" (must be non-empty string)');
  }

  // Validate name
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Missing or invalid "name" (must be non-empty string)');
  }

  // Validate signaling object
  if (!manifest.signaling || typeof manifest.signaling !== 'object') {
    errors.push('Missing or invalid "signaling" object');
  } else {
    // Validate signaling.url
    if (!manifest.signaling.url || typeof manifest.signaling.url !== 'string') {
      errors.push('Missing or invalid "signaling.url" (must be non-empty string)');
    } else if (!isValidWebSocketUrl(manifest.signaling.url)) {
      errors.push('Invalid "signaling.url" format (must start with ws:// or wss://)');
    }
  }

  // Validate ice object
  if (!manifest.ice || typeof manifest.ice !== 'object') {
    errors.push('Missing or invalid "ice" object');
  } else {
    // Validate ice.stun
    if (!Array.isArray(manifest.ice.stun)) {
      errors.push('Missing or invalid "ice.stun" (must be array)');
    } else if (manifest.ice.stun.length === 0) {
      errors.push('At least one STUN server required in "ice.stun"');
    } else {
      // Validate each STUN URL format
      manifest.ice.stun.forEach((url, index) => {
        if (typeof url !== 'string' || !url.startsWith('stun:')) {
          errors.push(`Invalid STUN URL at ice.stun[${index}] (must start with stun:)`);
        }
      });
    }

    // Validate ice.turn (optional, but if present must be array)
    if (manifest.ice.turn !== undefined) {
      if (!Array.isArray(manifest.ice.turn)) {
        errors.push('Invalid "ice.turn" (must be array if provided)');
      } else {
        // Validate each TURN server object
        manifest.ice.turn.forEach((server, index) => {
          if (!server.urls || typeof server.urls !== 'string') {
            errors.push(`Invalid TURN server at ice.turn[${index}]: missing "urls"`);
          } else if (!server.urls.startsWith('turn:')) {
            errors.push(`Invalid TURN URL at ice.turn[${index}] (must start with turn:)`);
          }

          if (server.username !== undefined && typeof server.username !== 'string') {
            errors.push(`Invalid TURN server at ice.turn[${index}]: "username" must be string`);
          }

          if (server.credential !== undefined && typeof server.credential !== 'string') {
            errors.push(`Invalid TURN server at ice.turn[${index}]: "credential" must be string`);
          }
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check if URL is valid WebSocket URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid WebSocket URL
 */
function isValidWebSocketUrl(url) {
  return url.startsWith('ws://') || url.startsWith('wss://');
}

export default { validateManifest };
