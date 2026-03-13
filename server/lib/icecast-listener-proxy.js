/**
 * Icecast listener proxy
 *
 * Proxies GET /stream/* requests to the local Icecast server
 * so listeners can access the stream on the same port as the app.
 */

import http from 'http';
import * as logger from './logger.js';

const ICECAST_HOST = process.env.ICECAST_HOST || 'localhost';
const ICECAST_PORT = parseInt(process.env.ICECAST_PORT || '6737');

/**
 * Attempt to proxy a /stream/* request to Icecast
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true if request was handled
 */
export function proxyIcecastListener(req, res) {
  if (req.method !== 'GET' || !req.url.startsWith('/stream/')) {
    return false;
  }

  // Strip /stream prefix to get the Icecast mount path
  const mountPath = '/' + req.url.slice('/stream/'.length).split('?')[0];

  logger.info(`Proxying listener request to Icecast: ${mountPath}`);

  const proxyReq = http.request(
    {
      hostname: ICECAST_HOST,
      port: ICECAST_PORT,
      path: mountPath,
      method: 'GET',
      headers: {
        'User-Agent': req.headers['user-agent'] || 'OpenStudio-Proxy',
        'Icy-MetaData': req.headers['icy-metadata'] || '0',
      },
    },
    (proxyRes) => {
      // Forward status and relevant headers
      const headers = {};
      if (proxyRes.headers['content-type']) {
        headers['Content-Type'] = proxyRes.headers['content-type'];
      }
      if (proxyRes.headers['icy-name']) {
        headers['Icy-Name'] = proxyRes.headers['icy-name'];
      }
      if (proxyRes.headers['icy-description']) {
        headers['Icy-Description'] = proxyRes.headers['icy-description'];
      }
      headers['Access-Control-Allow-Origin'] = '*';

      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    logger.warn(`Icecast proxy error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Stream unavailable' }));
    }
  });

  // Clean up if client disconnects
  req.on('close', () => {
    proxyReq.destroy();
  });

  proxyReq.end();
  return true;
}
