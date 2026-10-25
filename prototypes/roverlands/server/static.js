// Static files for the Roverlands server. It serves the playground root so the page's relative imports (vendor/three,
// vendor/rapier, highdef-3d's world pieces, avatar-3d's Chibi bodies, Thousandvale's body builder, Knockabout's look
// builder, Tumblefair's QR helper...) resolve exactly as they do on the playground's own servers — but ONLY the paths on
// the allow-list, never dotfiles or node_modules, and never this game's server-side folders.
// A copy of Knockabout's handler (prototypes/knockabout/server/static.js) with this game's lists. Big text files (Rapier
// is 4.3 MB) are gzipped once and kept in memory until the file changes.
// tests/static-allow.test.js walks the page's real import graph and fails when something it loads is not allowed here.
import { resolve, sep, extname } from 'node:path';
import { createReadStream, statSync, readFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants as Z } from 'node:zlib';

export const HOME = 'prototypes/roverlands';
/** Playground paths the page loads from. tools/publish-roverlands.sh copies exactly these (plus the server's own imports). */
export const ALLOW = Object.freeze([HOME,
  'prototypes/knockabout/js/client', 'prototypes/tumblefair/js/client/look-tidy.js', 'prototypes/tumblefair/js/client/qr.js', 'prototypes/tumblefair/data/cosmetics.json',
  'prototypes/thousandvale/data/rules/classes-tv.json', 'prototypes/emberveil/data/class-looks.json',     // avatar-3d/js/class-outfits.js reads these
  'prototypes/thousandvale/js', 'shared', 'avatar-3d', 'avatar-2d', 'highdef-3d/js', 'highdef-3d/assets', 'highdef-3d/data',
  'vendor/three', 'vendor/rapier', 'vendor/qrcode-generator', 'vendor/meshopt', 'sfx', 'assets']);
export const DENY = Object.freeze([...['server', 'ops', 'tests', 'tools', 'docs', 'package.json', 'package-lock.json'].map(p => `${HOME}/${p}`),
  'prototypes/thousandvale/js/sim', 'prototypes/thousandvale/js/net', 'prototypes/knockabout/js/client/main.js']);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};
const SQUEEZE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.md', '.wasm', '.bin', '.glb']);
const LONG = new Set(['.png', '.jpg', '.jpeg', '.webp', '.woff2', '.ogg', '.mp3', '.wav', '.ktx2']);

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
  const packed = new Map();      // abs -> { mtime, gz, br }
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
    // the page asks its own navigation entry whether a Roverlands server sent it (js/net/client.js serverAvailable)
    if (ext === '.html') headers['Server-Timing'] = 'roverlands;desc="online"';
    const etag = `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`;
    headers.ETag = etag;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
    const enc = String(req.headers['accept-encoding'] || '');
    if (SQUEEZE.has(ext) && st.size > 1024 && st.size < 48 * 1024 * 1024 && (/\bgzip\b/.test(enc) || /\bbr\b/.test(enc))) {
      let c = packed.get(abs);
      if (!c || c.mtime !== st.mtimeMs) { c = { mtime: st.mtimeMs, raw: readFileSync(abs), gz: null, br: null }; packed.set(abs, c); }
      let body;
      // brotli for the big ones (Rapier: 4.3 MB -> ~1.1 MB), gzip for the rest; each made once per file version
      if (/\bbr\b/.test(enc) && st.size > 256 * 1024) { c.br ||= brotliCompressSync(c.raw, { params: { [Z.BROTLI_PARAM_QUALITY]: 7, [Z.BROTLI_PARAM_SIZE_HINT]: c.raw.length } }); body = c.br; headers['Content-Encoding'] = 'br'; }
      else if (/\bgzip\b/.test(enc)) { c.gz ||= gzipSync(c.raw, { level: 6 }); body = c.gz; headers['Content-Encoding'] = 'gzip'; }
      if (body) {
        if (c.gz && c.br) c.raw = null;
        headers['Content-Length'] = body.length; headers.Vary = 'Accept-Encoding';
        res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : body); return true;
      }
    }
    headers['Content-Length'] = st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return true; }
    createReadStream(abs).pipe(res);
    return true;
  };
}
