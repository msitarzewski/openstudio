/**
 * OpenStudio Signaling Server
 *
 * Provides WebSocket signaling for WebRTC peer coordination
 * and HTTP health check endpoint.
 */

import http from 'http';
import path from 'node:path';
import * as logger from './lib/logger.js';
import { createWebSocketServer, setIceConfig } from './lib/websocket-server.js';
import { loadConfig } from './lib/config-loader.js';
import { serveStatic } from './lib/static-server.js';
import { proxyIcecastListener } from './lib/icecast-listener-proxy.js';
import { transcribeBuffer, transcribe } from './lib/whisper-transcriber.js';
import { isSupportedAudio, getDuration } from './lib/audio-converter.js';

// Load and validate station manifest (fail fast if invalid)
let config;
try {
  config = loadConfig();
} catch (error) {
  logger.error('Failed to load station manifest:', error.message);
  process.exit(1);
}

// Configuration
const PORT = process.env.PORT || 6736;
const startTime = Date.now();

/**
 * Set security headers on every HTTP response.
 * Defence-in-depth: these apply regardless of route.
 */
function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

/**
 * Origin allowlist for CORS.
 * When ALLOWED_ORIGINS env var is unset/empty every origin is permitted
 * (open development mode). In production set a comma-separated list, e.g.
 *   ALLOWED_ORIGINS=https://studio.example.com,https://app.example.com
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

/**
 * Return the validated CORS origin header value for the given request,
 * or null if the origin is not on the allowlist.
 */
function getCorsOrigin(req) {
  const origin = req.headers.origin;
  if (allowedOrigins.length === 0) {
    // No allowlist configured — allow all (development mode)
    return origin || '*';
  }
  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }
  return null;
}

/**
 * POST /api/export/clean — Accept audio + transcript, return cleaned audio.
 *
 * Expects multipart/form-data with:
 *   - audio: audio file (any format ffmpeg supports)
 *   - transcript: JSON string [{start, end, text}, ...]
 *
 * Optional query params:
 *   - silenceThreshold (dB, default -50)
 *   - silenceDuration (s, default 2)
 *   - targetLoudness (LUFS, default -16)
 */
async function handleExportClean(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const silenceThreshold = parseFloat(url.searchParams.get('silenceThreshold')) || -50;
  const silenceDuration = parseFloat(url.searchParams.get('silenceDuration')) || 2;
  const targetLoudness = parseFloat(url.searchParams.get('targetLoudness')) || -16;

  // Only accept multipart/form-data
  const ct = req.headers['content-type'] || '';
  if (!ct.startsWith('multipart/form-data')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Content-Type must be multipart/form-data' }));
    return;
  }

  const boundaryMatch = ct.match(/boundary=(?:"([^"]+)"|'([^']+)'|([^;,\s]+))/i);
  const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2] || boundaryMatch[3]) : null;
  if (!boundary) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Could not parse multipart boundary' }));
    return;
  }

  // Binary-aware multipart parser — splits by boundary markers
  const boundaryPrefix = Buffer.from(`--${boundary}\r\n`);
  const boundaryEnd = Buffer.from(`--${boundary}--\r\n`);
  const CRLF = Buffer.from('\r\n');

  const parts = [];

  // Collect the full body as buffer chunks
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));

  req.on('end', async () => {
    const body = Buffer.concat(chunks);

    // Split by boundary markers
    let offset = 0;
    while (offset < body.length) {
      // Find next boundary
      const idx = body.indexOf(boundaryPrefix, offset);
      if (idx === -1) break;

      // Skip to after the boundary line
      let headerStart = idx + boundaryPrefix.length;

      // Read headers until double CRLF (empty line marks end of headers)
      const doubleCRLF = Buffer.from('\r\n\r\n');
      const headerEnd = body.indexOf(doubleCRLF, headerStart);
      if (headerEnd === -1) break;
      const headerBlock = body.slice(headerStart, headerEnd).toString('utf8');
      const headers = {};
      for (const line of headerBlock.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim().toLowerCase();
          const val = line.slice(colonIdx + 1).trim();
          headers[key] = val;
        }
      }

      // Content starts after double CRLF
      let contentStart = headerEnd + doubleCRLF.length;
      let contentEnd;

      // Use Content-Length if available (more reliable for binary data)
      const contentLength = parseInt(headers['content-length'], 10);
      if (!isNaN(contentLength) && contentLength > 0) {
        contentEnd = contentStart + contentLength;
      } else {
        // Fallback: find next boundary marker
        const nextBoundary = body.indexOf(boundaryPrefix, contentStart);
        if (nextBoundary === -1) {
          contentEnd = body.length;
        } else {
          contentEnd = nextBoundary;
        }
      }
      logger.info(`  Part offset=${contentStart} contentEnd=${contentEnd} contentLen=${contentEnd - contentStart}`);

      const content = body.slice(contentStart, contentEnd);
      parts.push({ headers, content });

      // Check if this is the final boundary
      const remaining = body.slice(contentEnd);
      if (remaining.length >= boundaryEnd.length &&
          remaining.toString('utf8').startsWith('--' + boundary + '--')) {
        break;
      }

      offset = contentEnd;
    }

    // Extract fields
    const audioPart = parts.find(p => p.headers['content-type']?.startsWith('audio/'));
    const transcriptPart = parts.find(p => p.headers['content-type']?.startsWith('text/'));

    if (!audioPart) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No audio file provided' }));
      return;
    }
    if (!transcriptPart) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No transcript provided' }));
      return;
    }

    let transcript;
    try {
      transcript = JSON.parse(transcriptPart.content.toString('utf8'));
      if (!Array.isArray(transcript)) throw new Error('Transcript must be a JSON array');
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid transcript JSON' }));
      return;
    }

    try {
      // Save uploaded audio to temp file
      const fs = await import('fs');
      const path = await import('path');
      const crypto = await import('crypto');
      const tmpFile = path.join('/tmp', `upload-${crypto.randomUUID()}.wav`);
      await fs.promises.writeFile(tmpFile, audioPart.content);

      const result = await cleanAudio(tmpFile, transcript, {
        silenceThreshold,
        silenceDuration,
        targetLoudness,
      });

      const stat = await fs.promises.stat(result.outputPath);
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Disposition': 'attachment; filename="cleaned.wav"',
        'Content-Length': stat.size,
      });
      const stream = fs.createReadStream(result.outputPath);
      stream.pipe(res);
      stream.on('end', () => {
        logger.info('Cleaned audio sent successfully');
        fs.promises.unlink(result.outputPath).catch(() => {});
      });
    } catch (err) {
      logger.error('Export clean failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Create HTTP server
const httpServer = http.createServer((req, res) => {
  setSecurityHeaders(res);

  // Health check endpoint
  if (req.method === 'GET' && req.url === '/health') {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime }));
    return;
  }

  // Station info endpoint
  if (req.method === 'GET' && req.url === '/api/station') {
    const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Methods': 'GET' };
    const corsOrigin = getCorsOrigin(req);
    if (corsOrigin) {
      corsHeaders['Access-Control-Allow-Origin'] = corsOrigin;
    }
    res.writeHead(200, corsHeaders);
    res.end(JSON.stringify({
      stationId: config.stationId,
      name: config.name,
      signaling: config.signaling
      // ICE credentials are now delivered via WebSocket on room-created/room-joined
    }));
    return;
  }

  // Icecast listener proxy (/stream/*)
  if (proxyIcecastListener(req, res)) {
    return;
  }

  // Static file serving (web/ directory)
  if (serveStatic(req, res)) {
    return;
  }

  // POST /api/export/clean — clean audio (silence removal + filler word splice)
  if (req.method === 'POST' && req.url.split('?')[0] === '/api/export/clean') {
    handleExportClean(req, res);
    return;
  }

  // POST /api/export/transcribe — transcribe uploaded audio
  if (req.method === 'POST' && req.url === '/api/export/transcribe') {
    handleTranscribe(req, res);
    return;
  }

  // 404 for all other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Pass ICE config to WebSocket server for room responses
if (config.ice) {
  setIceConfig(config.ice);
}

/**
 * Handle POST /api/export/transcribe
 * Accepts multipart/form-data with audio file.
 */
function handleTranscribe(req, res) {
  const chunks = [];
  let contentLength = 0;

  req.on('data', chunk => {
    contentLength += chunk.length;
    if (contentLength > 500 * 1024 * 1024) {
      req.destroy(new Error('File too large (max 500MB)'));
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File too large' }));
    }
    chunks.push(chunk);
  });

  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('multipart/form-data')) {
        const result = await parseMultipart(body, contentType);
        if (result) {
          const audioBuffer = result.audio;
          const filename = result.filename || 'audio.wav';

          if (!isSupportedAudio(filename)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Unsupported format: ${path.extname(filename)}` }));
            return;
          }

          const duration = await getDurationFromBuffer(audioBuffer);
          const startTime = Date.now();

          const transcription = await transcribeBuffer(audioBuffer, filename, {
            outputDir: '/tmp'
          });

          const elapsed = Date.now() - startTime;
          logger.info(`Transcription done in ${elapsed}ms (${Math.round(duration / 1000)}s audio)`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            duration: transcription.duration,
            language: transcription.language,
            text: transcription.text,
            segments: transcription.segments,
            processingTime: elapsed,
            filename
          }));
          return;
        }
      }

      if (body.length > 0) {
        const duration = await getDurationFromBuffer(body);
        const startTime = Date.now();

        const transcription = await transcribeBuffer(body, 'audio.wav', {
          outputDir: '/tmp'
        });

        const elapsed = Date.now() - startTime;
        logger.info(`Transcription done in ${elapsed}ms (${Math.round(duration / 1000)}s audio)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          duration: transcription.duration,
          language: transcription.language,
          text: transcription.text,
          segments: transcription.segments,
          processingTime: elapsed,
          filename: 'upload'
        }));
        return;
      }

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No audio data provided' }));

    } catch (error) {
      logger.error('Transcription error:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Transcription failed: ${error.message}` }));
    }
  });

  req.on('error', (error) => {
    logger.error('Request error:', error.message);
    if (!res.headersSent) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
}

function parseMultipart(body, contentType) {
  const match = contentType.match(/boundary=(.?[^;\s]+)/);
  if (!match) return null;

  const boundary = '--' + match[1];
  const parts = body.split(boundary);

  for (let i = 1; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!part.includes('Content-Disposition')) continue;

    const fnMatch = part.match(/filename="?([^"\r\n]+)"?/i);
    const filename = fnMatch ? fnMatch[1] : 'audio.wav';

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const audioData = part.slice(headerEnd + 4);
    return { audio: audioData, filename };
  }

  return null;
}

async function getDurationFromBuffer(audioBuffer) {
  const tmpPath = `/tmp/duration_${Date.now()}.wav`;
  const fs = await import('fs');
  await fs.promises.writeFile(tmpPath, audioBuffer);
  const dur = await getDuration(tmpPath);
  try { await fs.promises.unlink(tmpPath); } catch {}
  return dur;
}

// Create WebSocket server attached to HTTP server
const wss = createWebSocketServer(httpServer);

// Start server
httpServer.listen(PORT, () => {
  logger.info(`OpenStudio listening on http://localhost:${PORT}`);
  logger.info(`WebSocket: ws://localhost:${PORT}`);
  logger.info(`Stream proxy: http://localhost:${PORT}/stream/live.opus`);
});

// Graceful shutdown handler
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Close WebSocket server (stop accepting new connections)
  wss.close(() => {
    logger.info('WebSocket server closed');
  });

  // Close HTTP server
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 10000);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
