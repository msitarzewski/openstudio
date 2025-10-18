/**
 * Simple console logger with timestamps and log levels
 */

const LOG_LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

/**
 * Format timestamp in ISO format
 * @returns {string} ISO timestamp
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Log info message
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments
 */
export function info(message, ...args) {
  console.log(`[${getTimestamp()}] [${LOG_LEVELS.INFO}]`, message, ...args);
}

/**
 * Log warning message
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments
 */
export function warn(message, ...args) {
  console.warn(`[${getTimestamp()}] [${LOG_LEVELS.WARN}]`, message, ...args);
}

/**
 * Log error message
 * @param {string} message - Log message
 * @param {...any} args - Additional arguments
 */
export function error(message, ...args) {
  console.error(`[${getTimestamp()}] [${LOG_LEVELS.ERROR}]`, message, ...args);
}

export default { info, warn, error };
