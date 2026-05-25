/**
 * Audio converter — ffmpeg wrapper for converting audio to WAV (16kHz, mono, 16-bit PCM)
 * whisper.cpp requires 16kHz mono WAV. ffmpeg handles the heavy lifting.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as logger from './logger.js';

const execFileAsync = promisify(execFile);

/**
 * Convert any supported audio format to 16kHz mono WAV.
 *
 * @param {string} inputPath  - Path to input audio file
 * @param {string} outputPath - Path for output WAV file
 * @returns {Promise<void>}
 */
export async function convertToWav(inputPath, outputPath) {
  const inputExt = path.extname(inputPath).toLowerCase();
  logger.info(`Converting audio: ${path.basename(inputPath)} (${inputExt}) → WAV`);

  // ffmpeg: resample to 16kHz, mono, 16-bit PCM WAV
  await execFileAsync('ffmpeg', [
    '-y',                    // overwrite output file
    '-i', inputPath,         // input
    '-ar', '16000',          // sample rate 16kHz
    '-ac', '1',              // mono
    '-sample_fmt', 's16',    // 16-bit signed integer
    '-f', 'wav',             // output format
    outputPath               // output path
  ], { timeout: 120_000 }); // 2 min timeout

  logger.info(`Audio conversion complete: ${path.basename(outputPath)}`);
}

/**
 * Get duration of an audio file in milliseconds.
 *
 * @param {string} filePath - Path to audio file
 * @returns {Promise<number>} Duration in ms
 */
export async function getDuration(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    filePath
  ], { timeout: 30_000 });

  const duration = parseFloat(stdout.trim());
  return isNaN(duration) ? 0 : Math.round(duration * 1000);
}

/**
 * Validate that a file is a supported audio format.
 *
 * @param {string} filePath - Path to file
 * @returns {boolean}
 */
export function isSupportedAudio(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.wav', '.mp3', '.ogg', '.opus', '.webm', '.flac', '.m4a', '.aac', '.aiff', '.aif'].includes(ext);
}

/**
 * Clean up temporary files.
 *
 * @param {string[]} files - Paths to remove
 */
export function cleanup(files) {
  for (const f of files) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {
      // ignore cleanup errors
    }
  }
}

export default { convertToWav, getDuration, isSupportedAudio, cleanup };
