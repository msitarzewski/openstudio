/**
 * Configuration loader for station manifest
 *
 * Loads station-manifest.json with fallback to station-manifest.sample.json
 * in development mode.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateManifest } from './validate-manifest.js';
import * as logger from './logger.js';

// Get current directory (ES modules don't have __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to project root
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'station-manifest.json');
const SAMPLE_MANIFEST_PATH = path.join(PROJECT_ROOT, 'station-manifest.sample.json');

/**
 * Load and validate station manifest configuration
 * @returns {object} Parsed and validated manifest
 * @throws {Error} If manifest is invalid or missing
 */
export function loadConfig() {
  let manifestPath = MANIFEST_PATH;
  let usingFallback = false;

  // Auto-create config from sample on first run
  if (!fs.existsSync(MANIFEST_PATH)) {
    if (fs.existsSync(SAMPLE_MANIFEST_PATH)) {
      fs.copyFileSync(SAMPLE_MANIFEST_PATH, MANIFEST_PATH);
      logger.info('Created station-manifest.json from sample (first run)');
    } else {
      throw new Error('Neither station-manifest.json nor station-manifest.sample.json found');
    }
  }

  // Read file
  let fileContent;
  try {
    fileContent = fs.readFileSync(manifestPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read manifest file: ${error.message}`);
  }

  // Parse JSON
  let manifest;
  try {
    manifest = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Invalid JSON in manifest file: ${error.message}`);
  }

  // Validate manifest
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    const errorList = validation.errors.join('\n  - ');
    throw new Error(`Invalid station manifest:\n  - ${errorList}`);
  }

  // Log success
  if (usingFallback) {
    logger.info('Loaded station manifest from sample file (development mode)');
  } else {
    logger.info(`Loaded station manifest: ${manifest.name} (${manifest.stationId})`);
  }

  return manifest;
}

export default { loadConfig };
