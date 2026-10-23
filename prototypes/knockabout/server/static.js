// Static files for the Knockabout server. It serves the playground root so the page's relative imports (avatar-3d,
// avatar-2d, vendor, Thousandvale's portrait + face helpers, Tumblefair's look tidier and costume list) resolve
// exactly as they do on the playground's own servers — but ONLY the paths on the allow-list, never dotfiles or
// node_modules, and never this game's server-side folders.
// The handler is a copy of Tumblefair's (prototypes/tumblefair/server/static.js), whose allow-list is baked into its module.
import { resolve, sep } from 'node:path';
import { createReadStream, statSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { gzipSync } from 'node:zlib';

export const HOME = 'prototypes/knockabout';
/** Playground paths the page loads from (checked against the client's real imports). tools/publish-knockabout.sh copies exactly these. */
export const ALLOW = Object.freeze([HOME, 'prototypes/tumblefair/js/client/look-tidy.js', 'prototypes/tumblefair/js/client/qr.js', 'prototypes/tumblefair/data/cosmetics.json',
  'prototypes/thousandvale/js', 'shared', 'avatar-3d', 'avatar-2d', 'vendor/three', 'vendor/cannon-es', 'vendor/qrcode-generator', 'sfx', 'assets']);
export const DENY = Object.freeze([...['server', 'ops', 'tests', 'tools', 'docs', 'package.json', 'package-lock.json'].map(p => `${HOME}/${p}`),
  'prototypes/thousandvale/js/sim', 'prototypes/thousandvale/js/net']);

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
    // the page asks its own navigation entry whether a Knockabout server sent it (js/client/net.js serverAvailable):
    // no extra request, so a plain file server or GitHub Pages logs no failed /status fetch
    if (ext === '.html') headers['Server-Timing'] = 'knockabout;desc="online"';
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
