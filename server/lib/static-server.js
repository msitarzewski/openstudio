/**
 * Static file server for serving the web client
 *
 * Serves files from the web/ directory with proper MIME types
 * and directory traversal prevention.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, '../../web');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Attempt to serve a static file from web/ directory
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true if file was served, false to fall through
 */
export function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  // Map / to /index.html
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') {
    urlPath = '/index.html';
  }

  // Resolve and verify the path stays within WEB_ROOT
  const filePath = path.resolve(WEB_ROOT, '.' + urlPath);
  if (!filePath.startsWith(WEB_ROOT)) {
    return false;
  }

  // Check extension has a known MIME type
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext];
  if (!contentType) {
    return false;
  }

  // Check file exists
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return false;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });

    if (req.method === 'HEAD') {
      res.end();
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
    return true;
  } catch {
    return false;
  }
}
