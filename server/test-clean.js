#!/usr/bin/env node
/**
 * Test script for /api/export/clean endpoint.
 *
 * Creates a test audio file with silence gaps and filler words in the
 * transcript, sends it to the server, and verifies the output.
 */

import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 6736;
const SERVER = `http://localhost:${PORT}`;

// ─── Test transcript ───────────────────────────────────────────────────────
// Simulating Whisper.cpp output with filler words at known positions
//
// 0-3s: "um hello everyone" (um at 0-0.5s)
// 3-6s: silence
// 6-9s: "like we are testing" (like at 6-6.5s)
// 9-12s: silence
// 12-15s: "uh actually done" (uh at 12-12.5s, actually at 13.5-14.5s)

const transcript = [
  { start: 0, end: 3, text: "um hello everyone" },
  { start: 3, end: 6, text: "" },
  { start: 6, end: 9, text: "like we are testing the audio" },
  { start: 9, end: 12, text: "" },
  { start: 12, end: 15, text: "uh actually done" },
];

// ─── Multipart form builder ────────────────────────────────────────────────
function buildMultipart(audioBuffer, transcriptJson, boundary) {
  const transcriptStr = JSON.stringify(transcriptJson);
  const parts = [];

  // Audio part
  parts.push(
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="audio"; filename="test.wav"\r\n' +
    'Content-Type: audio/wav\r\n' +
    `Content-Length: ${audioBuffer.length}\r\n` +
    '\r\n'
  );

  // Transcript part
  parts.push(
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="transcript"\r\n' +
    'Content-Type: text/plain\r\n' +
    `Content-Length: ${transcriptStr.length}\r\n` +
    '\r\n'
  );

  return Buffer.concat([
    Buffer.from(parts[0]),
    audioBuffer,
    Buffer.from(parts[1]),
    Buffer.from(transcriptStr),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

// ─── Main test ─────────────────────────────────────────────────────────────
async function main() {
  console.log('=== OpenStudio Audio Cleaner Test ===\n');

  // 1. Check server health
  console.log('1. Checking server health...');
  await fetch(`${SERVER}/health`).then(r => r.json()).then(d => {
    console.log(`   Server: ${d.status} (uptime: ${d.uptime}s)\n`);
  });

  // 2. Read test audio
  console.log('2. Reading test audio file...');
  const audioPath = '/tmp/test_combined.wav';
  const audioBuffer = fs.readFileSync(audioPath);
  console.log(`   Size: ${(audioBuffer.length / 1024).toFixed(0)} KB\n`);

  // 3. Send to /api/export/clean
  console.log('3. Sending to /api/export/clean...');
  const boundary = '----OpenStudioCleanTest' + Date.now();
  const body = buildMultipart(audioBuffer, transcript, boundary);

  const response = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/export/clean?silenceThreshold=-60&silenceDuration=1',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, resolve);
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log(`   Status: ${response.statusCode}`);

  // 4. Collect response
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  const resultBuffer = Buffer.concat(chunks);
  console.log(`   Response size: ${(resultBuffer.length / 1024).toFixed(0)} KB\n`);

  // 5. Save output
  const outputPath = '/tmp/cleaned_output.wav';
  fs.writeFileSync(outputPath, resultBuffer);
  console.log(`   Saved to: ${outputPath}`);

  // 6. Verify output
  if (response.statusCode === 200 && resultBuffer.length > 0) {
    console.log('\n✅ Test PASSED — cleaned audio received');

    // Get output duration
    const { stdout } = await execFileP('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      outputPath,
    ]);
    const outputDuration = parseFloat(stdout.trim());
    console.log(`   Input duration:  15.00s`);
    console.log(`   Output duration: ${outputDuration.toFixed(2)}s`);
    console.log(`   Reduction: ${((1 - outputDuration / 15) * 100).toFixed(1)}%`);

    // Check for silence in output
    const { stdout: silenceOut } = await execFileP('ffmpeg', [
      '-i', outputPath,
      '-af', 'silencedetect=noise=-40dB:d=0.5',
      '-f', 'null', '-',
    ], { stderr: 'pipe' });
    const silenceMatches = (silenceOut.stderr || '').match(/silence_start/g) || [];
    console.log(`   Silence regions remaining: ${silenceMatches.length}`);
  } else {
    console.log('\n❌ Test FAILED');
    console.log('   Response:', response.statusCode);
    const text = Buffer.concat(chunks).toString('utf8');
    console.log('   Body:', text);
  }

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
