/**
 * Capability detection — reports which OpenStudio features are usable on
 * this host based on installed binaries, models, and LLM configuration.
 *
 * Results are cached in-process for CACHE_TTL_MS to avoid re-shelling
 * on every poll.
 */

import fs from 'fs';
import path from 'path';
import { exec as cbExec } from 'child_process';
import { promisify } from 'util';

const exec = promisify(cbExec);

const CACHE_TTL_MS = 60 * 1000;
let cached = null;
let cachedAt = 0;

const WHISPER_REL = 'whisper.cpp/build/bin/whisper-cli';
const MODEL_REL = 'models/ggml-medium.bin';

async function detectFfmpeg() {
  try {
    await exec('which ffmpeg');
  } catch {
    return { available: false, version: null };
  }
  let version = null;
  try {
    const { stdout } = await exec('ffmpeg -version');
    const firstLine = stdout.split('\n')[0] || '';
    const match = firstLine.match(/ffmpeg version (\S+)/i);
    if (match) version = match[1];
  } catch {
    // version probe failed but binary exists
  }
  return { available: true, version };
}

async function detectFfprobe() {
  try {
    await exec('which ffprobe');
    return { available: true };
  } catch {
    return { available: false };
  }
}

function detectWhisper() {
  const expected = WHISPER_REL;
  const available = fs.existsSync(path.join(process.cwd(), WHISPER_REL));
  return { available, expected };
}

function detectModel() {
  const expected = MODEL_REL;
  const available = fs.existsSync(path.join(process.cwd(), MODEL_REL));
  return { available, expected, sizeHint: '~1.5 GB' };
}

function detectLlm() {
  const endpoint = process.env.LLM_BASE_URL || 'http://localhost:1234/v1';
  const model = process.env.LLM_MODEL || 'qwen3.5-35b';
  const authenticated = Boolean(process.env.LLM_API_KEY);

  let provider = 'custom';
  if (endpoint.includes('openai.com')) provider = 'openai';
  else if (endpoint.includes('anthropic.com')) provider = 'anthropic';
  else if (endpoint.includes(':1234')) provider = 'lm-studio';
  else if (endpoint.includes(':11434')) provider = 'ollama';

  return { configured: true, endpoint, model, authenticated, provider };
}

function buildFeatures({ ffmpeg, whisper, model }) {
  const has = { ffmpeg: ffmpeg.available, whisper: whisper.available, model: model.available };

  const missingFrom = (reqs) => {
    const seen = new Set();
    const out = [];
    for (const r of reqs) {
      if (seen.has(r)) continue;
      seen.add(r);
      if (!has[r]) out.push(r);
    }
    return out;
  };

  const transcribeReqs = ['whisper', 'model', 'ffmpeg'];
  const transcribeMissing = missingFrom(transcribeReqs);
  const transcribeAvailable = transcribeMissing.length === 0;

  const cleanReqs = ['ffmpeg', 'whisper', 'model'];
  const cleanMissing = missingFrom(cleanReqs);
  const cleanAvailable = cleanMissing.length === 0;

  const mp3Reqs = ['ffmpeg'];
  const mp3Missing = missingFrom(mp3Reqs);
  const mp3Available = mp3Missing.length === 0;

  const notesReqs = ['whisper', 'model', 'ffmpeg'];
  const notesMissing = missingFrom(notesReqs);
  const notesAvailable = notesMissing.length === 0;

  return {
    transcribe: {
      available: transcribeAvailable,
      requires: ['whisper', 'model', 'ffmpeg'],
      missing: transcribeMissing,
    },
    cleanAudio: {
      available: cleanAvailable,
      requires: ['ffmpeg', 'transcribe'],
      missing: cleanMissing,
    },
    mp3Export: {
      available: mp3Available,
      requires: ['ffmpeg'],
      missing: mp3Missing,
    },
    showNotes: {
      available: notesAvailable,
      requires: ['transcribe'],
      missing: notesMissing,
      llmPolish: true,
    },
  };
}

export async function getCapabilities() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const [ffmpeg, ffprobe] = await Promise.all([detectFfmpeg(), detectFfprobe()]);
  const whisper = detectWhisper();
  const model = detectModel();
  const llm = detectLlm();
  const features = buildFeatures({ ffmpeg, whisper, model });

  cached = { ffmpeg, ffprobe, whisper, model, llm, features };
  cachedAt = now;
  return cached;
}

export default { getCapabilities };
