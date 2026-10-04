// Static files for the DEV server (stream A, docs/protocol.md §8.5). Serves the playground root so the
// client's relative imports into Farhold / avatar-3d / shared resolve exactly as they do on 8400, but
// ONLY the allow-listed folders, never dotfiles, node_modules, or Thousandvale's server/ops/tests/docs.
// The public build (M1.5+) serves a published copy instead (PLAN §11.2).

import { createReadStream, statSync, readFileSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Top-level playground folders the client may load from. */
export const ALLOW = Object.freeze([
  'prototypes/thousandvale', 'prototypes/farhold', 'prototypes/emberveil', 'prototypes/bannerline',
  'shared', 'avatar-3d', 'avatar-2d', 'vendor', 'assets', 'worldgen', 'proctown', 'items', 'namegen',
  'lingo', 'conversations', 'voice-lab', 'sfx', 'meters', 'library/data', 'universe', 'highdef-3d',
]);
/** Paths inside the allow-list that are still refused. */
export const DENY = Object.freeze([
  'prototypes/thousandvale/server', 'prototypes/thousandvale/ops', 'prototypes/thousandvale/tests',
  'prototypes/thousandvale/docs', 'prototypes/thousandvale/package.json', 'prototypes/thousandvale/package-lock.json',
]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.u16': 'application/octet-stream', '.u8': 'application/octet-stream',
};
const GZIP = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.bin', '.u16', '.u8', '.txt', '.md', '.gltf']);

/** Map a URL path to a file under root, or null when refused. */
export function resolveStatic(root, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (p.includes('\0')) return null;
  const rel = p.replace(/^\/+/, '');
  const parts = rel.split('/');
  if (parts.some(s => s.startsWith('.') || s === 'node_modules')) return null;
  const clean = parts.filter(Boolean).join('/');
  if (!ALLOW.some(a => clean === a || clean.startsWith(a + '/'))) return null;
  if (DENY.some(d => clean === d || clean.startsWith(d + '/'))) return null;
  const abs = resolve(root, clean);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

export function createStaticHandler(root) {
  root = resolve(root);
  const gzCache = new Map();   // abs -> { mtime, buf }
  return function serve(req, res) {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/' || urlPath === '') { res.writeHead(302, { Location: '/prototypes/thousandvale/' }); res.end(); return true; }
    let abs = resolveStatic(root, urlPath);
    if (!abs) return false;
    let st;
    try { st = statSync(abs); } catch { return false; }
    if (st.isDirectory()) {
      if (!urlPath.endsWith('/')) { res.writeHead(301, { Location: urlPath + '/' }); res.end(); return true; }
      abs = resolve(abs, 'index.html');
      try { st = statSync(abs); } catch { return false; }
    }
    const ext = extname(abs).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
    headers.ETag = etag;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
    if (GZIP.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && st.size > 1024 && st.size < 64 * 1024 * 1024) {
      let c = gzCache.get(abs);
      if (!c || c.mtime !== st.mtimeMs) { c = { mtime: st.mtimeMs, buf: gzipSync(readFileSync(abs), { level: 6 }) }; gzCache.set(abs, c); }
      headers['Content-Encoding'] = 'gzip'; headers['Content-Length'] = c.buf.length; headers.Vary = 'Accept-Encoding';
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : c.buf);
      return true;
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return true; }
    createReadStream(abs).pipe(res);
    return true;
  };
}
