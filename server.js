'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.xml', '.txt', '.svg']);

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
}

function cacheControl(filePath) {
  const rel = path.relative(PUBLIC_DIR, filePath).replace(/\\/g, '/');
  if (rel === 'index.html') return 'no-cache';
  if (rel === 'robots.txt' || rel === 'sitemap.xml') return 'public, max-age=3600';
  if (rel.startsWith('assets/') || rel.startsWith('vendor/')) return 'public, max-age=604800, immutable';
  return 'public, max-age=86400';
}

function safePublicPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  const relative = decoded.replace(/^\/+/, '');
  const resolved = path.resolve(PUBLIC_DIR, relative || 'index.html');
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) return null;
  return resolved;
}

function sendBuffer(req, res, statusCode, filePath, buffer) {
  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    ...securityHeaders(),
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheControl(filePath),
    'Vary': 'Accept-Encoding'
  };

  const acceptsGzip = /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
  const compressible = TEXT_EXTENSIONS.has(ext) && buffer.length > 1024;

  if (acceptsGzip && compressible) {
    zlib.gzip(buffer, { level: zlib.constants.Z_BEST_SPEED }, (error, zipped) => {
      if (error) {
        res.writeHead(statusCode, { ...headers, 'Content-Length': buffer.length });
        res.end(buffer);
        return;
      }
      res.writeHead(statusCode, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': zipped.length });
      res.end(zipped);
    });
    return;
  }

  res.writeHead(statusCode, { ...headers, 'Content-Length': buffer.length });
  res.end(buffer);
}

function sendFile(req, res, filePath, statusCode = 200) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Not found');
      return;
    }
    sendBuffer(req, res, statusCode, filePath, data);
  });
}

const server = http.createServer((req, res) => {
  const origin = `http://${req.headers.host || 'localhost'}`;
  const requestUrl = new URL(req.url || '/', origin);
  const pathname = requestUrl.pathname;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8', 'Allow': 'GET, HEAD' });
    res.end('Method not allowed');
    return;
  }

  if (pathname === '/health') {
    const body = Buffer.from(JSON.stringify({ ok: true, app: 'china-direct-sourcing-coming-soon' }));
    res.writeHead(200, {
      ...securityHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': body.length
    });
    if (req.method === 'HEAD') return res.end();
    res.end(body);
    return;
  }

  const requestedPath = safePublicPath(pathname);
  if (!requestedPath) {
    res.writeHead(400, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  fs.stat(requestedPath, (error, stat) => {
    if (!error && stat.isFile()) {
      if (req.method === 'HEAD') {
        const ext = path.extname(requestedPath).toLowerCase();
        res.writeHead(200, {
          ...securityHeaders(),
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': cacheControl(requestedPath),
          'Content-Length': stat.size
        });
        res.end();
        return;
      }
      sendFile(req, res, requestedPath);
      return;
    }

    // SPA-style fallback keeps the Vue experience working for accidental deep links,
    // while the crawlable homepage remains the canonical URL.
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    if (req.method === 'HEAD') {
      fs.stat(indexPath, (indexError, indexStat) => {
        if (indexError) {
          res.writeHead(500, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8' });
          res.end();
          return;
        }
        res.writeHead(200, {
          ...securityHeaders(),
          'Content-Type': MIME['.html'],
          'Cache-Control': 'no-cache',
          'Content-Length': indexStat.size
        });
        res.end();
      });
      return;
    }
    sendFile(req, res, indexPath);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`China Direct Sourcing app listening on http://${HOST}:${PORT}`);
});
