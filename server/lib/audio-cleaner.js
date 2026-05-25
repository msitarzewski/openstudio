/**
 * Audio cleaner — ffmpeg-powered pipeline.
 *
 * Pipeline:
 *   1. Detect silence intervals (silencedetect)
 *   2. Remove silence (silenceremove)
 *   3. Identify regions to keep (exclude silence + filler intervals)
 *   4. Concatenate kept segments via ffmpeg concat demuxer
 *   5. Loudness normalization (loudnorm, two-pass)
 *
 * All processing is done via child_process.spawn — no npm dependencies.
 */

import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createWriteStream, unlink, mkdirSync } from 'fs';
import { detectFillers } from './filler-detector.js';
import * as logger from './logger.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Run a command and return stdout as string.
 */
function run(cmd, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    });
    const stdout = [];
    proc.stdout.on('data', d => stdout.push(d));
    const stderr = [];
    proc.stderr.on('data', d => stderr.push(d));
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`${cmd} exited ${code}: ${stderr.join('')}`));
      } else {
        resolve(Buffer.concat(stdout).toString('utf8'));
      }
    });
  });
}

/**
 * Run ffmpeg with stdin pipe (for JSON input).
 */
function ffmpegStdin(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Write input JSON to stdin
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
    proc.stdin.write(inputStr);
    proc.stdin.end();

    const stdout = [];
    const stderr = [];
    proc.stdout.on('data', d => stdout.push(d));
    proc.stderr.on('data', d => stderr.push(d));
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}: ${stderr.join('')}`));
      } else {
        resolve(Buffer.concat(stdout).toString('utf8'));
      }
    });
  });
}

/**
 * Run ffmpeg and return both stdout and stderr.
 */
function ffmpegFull(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    proc.stdout.on('data', d => stdout.push(d));
    proc.stderr.on('data', d => stderr.push(d));
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}: ${stderr.join('')}`));
      } else {
        resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
      }
    });
  });
}

/**
 * Cleanup temp files.
 */
async function cleanup(files) {
  for (const f of files) {
    try { await unlink(f); } catch { /* ignore */ }
  }
}

// ─── Silence detection ────────────────────────────────────────────────────

/**
 * Run silencedetect on the input file and return intervals.
 */
async function detectSilence(inputFile, threshold, minDuration) {
  const thresholdStr = `-${threshold}`;
  const args = [
    '-i', inputFile,
    '-af', `silencedetect=noise=${thresholdStr}:duration=${minDuration}`,
    '-f', 'null',
    '-',
  ];
  const output = await run('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

  const intervals = [];
  const re = /silence_start:\s*([0-9.]+)/g;
  let m;
  while ((m = re.exec(output)) !== null) {
    intervals.push(parseFloat(m[1]));
  }

  // silence_start marks the *beginning* of a silence region.
  // The *next* silence_start (or end of file) marks the end.
  const silenceIntervals = [];
  for (let i = 0; i < intervals.length; i++) {
    const start = intervals[i];
    // Get total duration via ffprobe
    if (i + 1 < intervals.length) {
      silenceIntervals.push({ start, end: intervals[i + 1] });
    }
    // last silence_start: end = total duration (handled externally)
  }
  return { silenceIntervals, totalStartSilences: intervals.length };
}

/**
 * Get total audio duration via ffprobe.
 */
async function getDuration(file) {
  const output = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  return parseFloat(output.trim());
}

// ─── Two-pass loudnorm ────────────────────────────────────────────────────

/**
 * Run loudnorm analysis pass to get measured values.
 */
async function loudnormAnalyze(inputFile) {
  const args = [
    '-i', inputFile,
    '-af', 'loudnorm=print_format=json',
    '-f', 'null',
    '-',
  ];
  const result = await ffmpegFull('ffmpeg', args);

  // Extract JSON block from stderr (loudnorm outputs there)
  const jsonMatch = result.stderr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('loudnorm: could not extract JSON from output');
  }
  return JSON.parse(jsonMatch[0]);
}

// ─── Main pipeline ────────────────────────────────────────────────────────

/**
 * Clean audio: detect silence, remove filler words, normalize loudness.
 *
 * @param {string} inputFile  Path to input audio file
 * @param {Array}  transcript  Whisper.cpp transcript [{start, end, text}]
 * @param {object} [opts]
 * @param {number} [opts.silenceThreshold=-50]  Noise threshold in dB
 * @param {number} [opts.silenceDuration=2]     Min silence duration in seconds
 * @param {number} [opts.targetLoudness=-16]    Target integrated loudness (LUFS)
 * @param {number} [opts.padding=0.3]           Padding around filler words
 * @returns {Promise<{outputPath: string, duration: number}>}
 */
export async function cleanAudio(inputFile, transcript, opts = {}) {
  const {
    silenceThreshold = -50,
    silenceDuration = 2,
    targetLoudness = -16,
    padding = 0.3,
  } = opts;

  const tmp = join(tmpdir(), `audio-cleaner-${randomUUID()}`);
  mkdirSync(tmp, { recursive: true });
  const filesToClean = [tmp];

  try {
    // ── Step 1: Detect silence ────────────────────────────────────────
    logger.info('Step 1: Detecting silence...');
    const { silenceIntervals } = await detectSilence(inputFile, silenceThreshold, silenceDuration);
    logger.info(`  Found ${silenceIntervals.length} silence region(s)`);

    // ── Step 2: Detect filler words ───────────────────────────────────
    logger.info('Step 2: Detecting filler words...');
    const fillerIntervals = detectFillers(transcript, { padding });
    logger.info(`  Found ${fillerIntervals.length} filler interval(s)`);

    // ── Step 3: Combine and invert to get regions to keep ─────────────
    logger.info('Step 3: Computing regions to keep...');
    const totalDuration = await getDuration(inputFile);
    const keepIntervals = computeKeepRegions(silenceIntervals, fillerIntervals, totalDuration);
    logger.info(`  Kept ${keepIntervals.length} region(s) (${keepIntervals.reduce((s, r) => s + (r.end - r.start), 0).toFixed(1)}s / ${totalDuration.toFixed(1)}s)`);

    if (keepIntervals.length === 0) {
      throw new Error('All audio was removed — no regions to keep');
    }

    // ── Step 4: Extract segments and build concat file ────────────────
    logger.info('Step 4: Extracting segments...');
    const segments = [];
    for (let i = 0; i < keepIntervals.length; i++) {
      const segFile = join(tmp, `seg-${i}.wav`);
      const { start, end } = keepIntervals[i];
      const duration = end - start;

      const args = [
        '-y',
        '-i', inputFile,
        '-ss', String(start),
        '-t', String(duration),
        '-acodec', 'pcm_s16le',
        '-ar', '48000',
        '-ac', '1',
        segFile,
      ];
      await run('ffmpeg', args);
      segments.push(segFile);
      filesToClean.push(segFile);
      logger.info(`  Segment ${i + 1}/${keepIntervals.length}: [${start.toFixed(2)}s, ${end.toFixed(2)}s] (${duration.toFixed(2)}s)`);
    }

    // ── Step 5: Concatenate segments ──────────────────────────────────
    logger.info('Step 5: Concatenating segments...');
    const concatFile = join(tmp, 'concat.txt');
    const concatContent = segments.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n');
    filesToClean.push(concatFile);
    await (await import('fs')).promises.writeFile(concatFile, concatContent);

    const mergedFile = join(tmp, 'merged.wav');
    const concatArgs = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-acodec', 'pcm_s16le',
      '-ar', '48000',
      '-ac', '1',
      mergedFile,
    ];
    await run('ffmpeg', concatArgs);
    filesToClean.push(mergedFile);

    // ── Step 6: Two-pass loudness normalization ───────────────────────
    logger.info('Step 6: Loudness normalization (two-pass)...');
    const measured = await loudnormAnalyze(mergedFile);

    const finalFile = join(tmp, 'cleaned.wav');
    const normArgs = [
      '-y',
      '-i', mergedFile,
      '-af', `loudnorm=I=${targetLoudness}:TP=-1.5:LRA=11:print_format=json:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`,
      '-ar', '48000',
      '-ac', '1',
      finalFile,
    ];
    await run('ffmpeg', normArgs);
    filesToClean.push(finalFile);

    const finalDuration = await getDuration(finalFile);
    logger.info(`  Done! Output: ${finalFile} (${finalDuration.toFixed(1)}s)`);

    return { outputPath: finalFile, duration: finalDuration };

  } catch (err) {
    logger.error('Audio cleaning failed:', err.message);
    await cleanup(filesToClean);
    throw err;
  }
}

/**
 * Given silence intervals and filler intervals, compute regions to keep.
 * Regions are sorted, non-overlapping, and clamped to [0, totalDuration].
 */
function computeKeepRegions(silenceIntervals, fillerIntervals, totalDuration) {
  // Combine all intervals to remove (with small gap padding)
  const remove = [];
  for (const s of silenceIntervals) {
    remove.push({ start: s.start, end: s.end });
  }
  for (const f of fillerIntervals) {
    remove.push({ start: f.start, end: f.end });
  }

  // Sort and merge
  remove.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of remove) {
    if (merged.length === 0) {
      merged.push({ start: r.start, end: r.end });
    } else {
      const last = merged[merged.length - 1];
      if (r.start <= last.end) {
        last.end = Math.max(last.end, r.end);
      } else {
        merged.push({ start: r.start, end: r.end });
      }
    }
  }

  // Invert: regions between removed intervals are kept
  const keep = [];
  let cursor = 0;
  for (const r of merged) {
    if (r.start > cursor) {
      keep.push({ start: cursor, end: r.start });
    }
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < totalDuration) {
    keep.push({ start: cursor, end: totalDuration });
  }

  // Clamp and merge overlapping keep regions (shouldn't happen, but be safe)
  const clamped = keep
    .map(r => ({
      start: Math.max(0, r.start),
      end: Math.min(totalDuration, r.end),
    }))
    .filter(r => r.end > r.start + 0.05); // at least 50ms

  // Merge any overlapping/adjacent keep regions
  const result = [];
  for (const r of clamped) {
    if (result.length === 0) {
      result.push(r);
    } else {
      const last = result[result.length - 1];
      if (r.start <= last.end) {
        last.end = Math.max(last.end, r.end);
      } else {
        result.push(r);
      }
    }
  }

  return result;
}

export default { cleanAudio };
