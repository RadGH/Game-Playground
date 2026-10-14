// Static files for the Tumblefair server. It serves the playground root so the page's relative imports into avatar-3d,
// avatar-2d, vendor and shared resolve exactly as they do on the playground's own servers — but ONLY the folders on
// the allow-list, never dotfiles or node_modules, and never this game's server-side folders.
// (Same rules as prototypes/thousandvale/server/static.js, with this game's lists.)
import { createReadStream, statSync, readFileSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

export const HOME = 'prototypes/tumblefair';
/** Playground folders the page loads from. tools/publish-tumblefair.sh copies exactly these. */
export const ALLOW = Object.freeze([HOME, 'prototypes/thousandvale/js', 'shared', 'avatar-3d', 'avatar-2d', 'vendor/three', 'vendor/qrcode-generator', 'sfx', 'assets']);
export const DENY = Object.freeze(['server', 'ops', 'tests', 'tools', 'docs', 'package.json', 'package-lock.json', 'assets/inbox'].map(p => `${HOME}/${p}`));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};
const GZIP = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.md']);
const LONG = new Set(['.png', '.jpg', '.jpeg', '.webp', '.woff2', '.ogg', '.mp3', '.wav']);

export function resolveStatic(root, urlPath, allowAll = false) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (p.includes('\0')) return null;
  const parts = p.replace(/^\/+/, '').split('/');
  if (parts.some(s => s.startsWith('.') || s === 'node_modules')) return null;
  const clean = parts.filter(Boolean).join('/');
  if (!allowAll && !ALLOW.some(a => clean === a || clean.startsWith(a + '/'))) return null;
  if (DENY.some(d => clean === d || clean.startsWith(d + '/'))) return null;
  const abs = resolve(root, clean);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

export function createStaticHandler(root, { allowAll = false } = {}) {
  root = resolve(root);
  const gzCache = new Map();
  return function serve(req, res) {
    const urlPath = req.url.split('?')[0], query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    if (urlPath === '/' || urlPath === '') { res.writeHead(302, { Location: `/${HOME}/${query}` }); res.end(); return true; }
    let abs = resolveStatic(root, urlPath, allowAll);
    if (!abs) return false;
    let st;
    try { st = statSync(abs); } catch { return false; }
    if (st.isDirectory()) {
      if (!urlPath.endsWith('/')) { res.writeHead(301, { Location: urlPath + '/' + query }); res.end(); return true; }
      abs = resolve(abs, 'index.html');
      try { st = statSync(abs); } catch { return false; }
    }
    const ext = extname(abs).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': LONG.has(ext) ? 'public, max-age=3600' : 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
    headers.ETag = etag;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
    if (GZIP.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && st.size > 1024 && st.size < 32 * 1024 * 1024) {
      let c = gzCache.get(abs);
      if (!c || c.mtime !== st.mtimeMs) { c = { mtime: st.mtimeMs, buf: gzipSync(readFileSync(abs), { level: 6 }) }; gzCache.set(abs, c); }
      headers['Content-Encoding'] = 'gzip'; headers['Content-Length'] = c.buf.length; headers.Vary = 'Accept-Encoding';
      res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : c.buf); return true;
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return true; }
    createReadStream(abs).pipe(res);
    return true;
  };
}
