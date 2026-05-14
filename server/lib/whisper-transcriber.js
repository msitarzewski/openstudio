/**
 * whisper-transcriber.js
 * Local Whisper.cpp transcription service
 *
 * Uses whisper.cpp to transcribe audio files locally.
 * No API calls, no cloud dependency.
 */

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as logger from './logger.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execAsync = promisify(exec);

const MODEL_PATH = path.join(process.cwd(), 'models', 'ggml-medium.bin');
const WHISPER_BIN = path.join(process.cwd(), 'whisper.cpp', 'build', 'bin', 'whisper-cli');

/**
 * Check if whisper.cpp is built and model exists
 */
export async function isReady() {
  try {
    await execAsync(`test -f ${MODEL_PATH}`);
    await execAsync(`test -f ${WHISPER_BIN}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Transcribe an audio file using whisper.cpp
 * @param {Buffer} audioBuffer - Audio file data
 * @param {Object} options - Transcription options
 * @param {string} options.language - Language code (en, auto, etc.)
 * @param {string} options.model - Model name (medium, small, tiny)
 * @returns {Promise<{text: string, segments: Array<{start: number, end: number, text: string}>}>}
 */
export async function transcribe(audioBuffer, options = {}) {
  const { language = 'auto', model = 'medium' } = options;

  // Check if model exists, download if not
  if (!fs.existsSync(MODEL_PATH)) {
    logger.info('Model not found, downloading whisper.cpp model...');
    await downloadModel(model);
  }

  // Check if whisper.cpp is built
  if (!fs.existsSync(WHISPER_BIN)) {
    logger.info('whisper.cpp not built, building...');
    await buildWhisperCpp();
  }

  // Write audio to temp file
  const tmpDir = os.tmpdir();
  const audioPath = path.join(tmpDir, `openstudio-audio-${Date.now()}.wav`);
  const outputDir = path.join(tmpDir, `openstudio-transcribe-${Date.now()}`);
  fs.mkdirSync(outputDir, { recursive: true });

  // Write audio buffer
  fs.writeFileSync(audioPath, audioBuffer);

  // Convert to WAV if not already WAV (whisper.cpp needs 16kHz mono WAV)
  const wavPath = path.join(outputDir, 'input.wav');
  try {
    await execAsync(`ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 -sample_fmt s16 "${wavPath}" 2>/dev/null`);
  } catch {
    // If ffmpeg fails, try as-is
    fs.copyFileSync(audioPath, path.join(outputDir, 'input.wav'));
  }

  const inputWav = path.join(outputDir, 'input.wav');

  // Run whisper.cpp
  const outputJson = path.join(outputDir, 'transcript.json');
  const outputTxt = path.join(outputDir, 'transcript.txt');

  logger.info(`Transcribing with whisper.cpp (model: ${model}, language: ${language})`);

  await new Promise((resolve, reject) => {
    const proc = spawn(WHISPER_BIN, [
      '-m', MODEL_PATH,
      '-f', inputWav,
      '-otxt', outputTxt,
      '--language', language,
      '--output-json', outputJson,
      '-t', String(os.cpus().length),
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`whisper.cpp exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start whisper.cpp: ${err.message}`));
    });
  });

  // Read output
  let text = '';
  let segments = [];

  if (fs.existsSync(outputTxt)) {
    text = fs.readFileSync(outputTxt, 'utf-8').trim();
  }

  if (fs.existsSync(outputJson)) {
    const jsonStr = fs.readFileSync(outputJson, 'utf-8');
    const data = JSON.parse(jsonStr);
    segments = data.segments || [];
  }

  // Cleanup temp files
  try {
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.unlinkSync(audioPath);
  } catch { /* ignore cleanup errors */ }

  logger.info(`Transcription complete: ${text.length} chars, ${segments.length} segments`);

  return { text, segments };
}

/**
 * Download whisper.cpp model
 */
async function downloadModel(model = 'medium') {
  const modelMap = new Map([
    ['tiny', 'ggml-tiny.bin'],
    ['tiny.en', 'ggml-tiny.en.bin'],
    ['base', 'ggml-base.bin'],
    ['base.en', 'ggml-base.en.bin'],
    ['small', 'ggml-small.bin'],
    ['small.en', 'ggml-small.en.bin'],
    ['medium', 'ggml-medium.bin'],
    ['medium.en', 'ggml-medium.en.bin'],
    ['large', 'ggml-large.bin'],
  ]);

  const modelName = modelMap.get(model) || 'ggml-medium.bin';
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}`;
  const outputPath = path.join(process.cwd(), 'models', modelName);

  logger.info(`Downloading whisper.cpp model: ${modelName}`);

  await execAsync(`mkdir -p models && wget -q --timeout=300 "${url}" -O "${outputPath}"`);

  logger.info(`Model downloaded: ${outputPath}`);
  return outputPath;
}

/**
 * Build whisper.cpp from source
 */
async function buildWhisperCpp() {
  const whisperDir = path.join(process.cwd(), 'whisper.cpp');

  logger.info('Cloning whisper.cpp...');
  await execAsync(`git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git ${whisperDir}`);

  logger.info('Building whisper.cpp...');
  await execAsync(`cd ${whisperDir} && make -j$(nproc) 2>&1 | tail -5`);

  logger.info('whisper.cpp built successfully');
}

/**
 * Transcribe an audio buffer (wrapper for server.js endpoint)
 * @param {Buffer} audioBuffer
 * @param {string} filename
 * @param {Object} options
 * @returns {Promise<{duration: number, language: string, text: string, segments: Array}>}
 */
export async function transcribeBuffer(audioBuffer, filename, options = {}) {
  const result = await transcribe(audioBuffer, options);
  
  // Estimate duration from segments
  let duration = 0;
  if (result.segments?.length > 0) {
    const last = result.segments[result.segments.length - 1];
    duration = (last.end || 0) * 1000; // convert to ms
  }
  
  return {
    duration,
    language: options.language || 'auto',
    text: result.text,
    segments: result.segments,
  };
}

/**
 * Get available models
 */
export function getAvailableModels() {
  return [
    { name: 'tiny', size: '~75MB', accuracy: 'Low' },
    { name: 'base', size: '~140MB', accuracy: 'Medium' },
    { name: 'small', size: '~490MB', accuracy: 'High' },
    { name: 'medium', size: '~1.5GB', accuracy: 'Best' },
  ];
}
