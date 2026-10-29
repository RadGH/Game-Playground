// Static files for the game server (stream A, docs/protocol.md §8.5). It serves the PLAYGROUND: `/` is the
// playground home page (the same one port 8400 shows) and every experiment and prototype linked from it, so
// the client's relative imports into Farhold / avatar-3d / shared resolve exactly as they do on 8400.
// Only the allow-listed folders and files are served, never dotfiles, node_modules, or any server/ops/tools/
// tests/research folder. DEV (8491) applies these rules to the working tree; STABLE (8490, and the public
// link) serves a published copy that tools/publish-thousandvale.sh builds FROM THESE SAME LISTS — the
// script imports ALLOW, DENY, PRIVATE_DIRS, PRIVATE_FILES and BROWSER_CODE from this file at the commit being published, so there is one
// list, not two to keep in step (tests/H/public-lists.test.js).

import { createReadStream, statSync, readFileSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Playground folders and root files a browser may load. Anything not under one of these is refused. */
export const ALLOW = Object.freeze([
  // the home page
  'index.html', 'credits.html', 'GAME-GUIDE.md', 'js', 'css', 'data',
  // shared code and art
  'shared', 'vendor', 'assets',
  // experiments
  'armory', 'avatar-2d', 'avatar-3d', 'combined', 'conversations', 'highdef-3d', 'icons', 'items', 'library',
  'lingo', 'meters', 'namegen', 'proctown', 'sfx', 'universe', 'voice-lab', 'worldgen',
  // prototypes (prototypes/tinyrts is a symlink to another repo, so a published copy cannot hold it)
  'prototypes/thousandvale', 'prototypes/farhold', 'prototypes/emberveil', 'prototypes/bannerline',
  'prototypes/frontier-foundry', 'prototypes/lanternfall', 'prototypes/lodestar', 'prototypes/kindlewild',
  'prototypes/tumblefair', 'prototypes/knockabout', 'prototypes/roverlands',
]);
/** Paths inside the allow-list that are still refused. */
export const DENY = Object.freeze([
  'prototypes/thousandvale/server', 'prototypes/thousandvale/ops', 'prototypes/thousandvale/tests',
  'prototypes/thousandvale/docs', 'prototypes/thousandvale/package.json', 'prototypes/thousandvale/package-lock.json',
  'library/synced',
  'avatar-3d/chibi4',      // owner 2026-10-16: Chibi 4 is a LAN-only experiment for a future game — never on a public server
]);
/** A folder with one of these names is refused wherever it sits: server code, build tools, tests, notes. */
export const PRIVATE_DIRS = Object.freeze(['server', 'ops', 'tools', 'tests', 'research', 'test-results', 'node_modules']);
/** The exception: folders that carry one of those names but hold page scripts a browser needs. Keep it short. */
export const BROWSER_CODE = Object.freeze(['prototypes/bannerline/js/tools']);   // the scripts of icons.html, hvf-map.html, structures.html…
/** File names refused everywhere. */
export const PRIVATE_FILES = Object.freeze(['package.json', 'package-lock.json', 'env.example']);
/** DEV only: Thousandvale's own tool pages (dungeon and terrain viewers). A published copy never holds them. */
export const DEV_ONLY = Object.freeze(['prototypes/thousandvale/tools']);

/** The home page asks for this file to learn who is serving it. On 8400 it is the empty file in data/. */
export const HOST_INFO = 'data/served-by.json';
const GAME = Object.freeze({ game: 'thousandvale', path: 'prototypes/thousandvale/' });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.u16': 'application/octet-stream', '.u8': 'application/octet-stream',
};
const GZIP = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.bin', '.u16', '.u8', '.txt', '.md', '.gltf']);

/** True when a clean relative path ('a/b/c.js') is one the rules refuse outright. */
export function isPrivate(clean, { dev = false } = {}) {
  const parts = clean.split('/');
  if (parts.some(s => s.startsWith('.'))) return true;
  if (PRIVATE_FILES.includes(parts[parts.length - 1]) || parts[parts.length - 1].endsWith('.env')) return true;
  if (DENY.some(d => clean === d || clean.startsWith(d + '/'))) return true;
  if (dev && DEV_ONLY.some(d => clean === d || clean.startsWith(d + '/'))) return false;
  const kept = BROWSER_CODE.find(d => clean === d || clean.startsWith(d + '/'));
  const rest = kept ? [...kept.split('/').slice(0, -1), ...clean.slice(kept.length).split('/')] : parts;   // the excepted folder's own name is forgiven, nothing else
  return rest.some(s => PRIVATE_DIRS.includes(s));
}

/**
 * Map a URL path to a file under root, or null when refused.
 * allowAll = root is a published copy: the allow-list was applied when it was built, the refusals still apply.
 */
export function resolveStatic(root, urlPath, allowAll = false) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (p.includes('\0') || p.includes('\\')) return null;
  const rel = p.replace(/^\/+/, '');
  const parts = rel.split('/');
  if (parts.some(s => s.startsWith('.') || s === 'node_modules')) return null;
  const clean = parts.filter(Boolean).join('/');
  if (clean === '') return root;                                   // the home page
  if (!allowAll && !ALLOW.some(a => clean === a || clean.startsWith(a + '/'))) return null;
  if (isPrivate(clean, { dev: !allowAll })) return null;
  const abs = resolve(root, clean);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}

/** Does this relative link ('armory/', 'avatar-3d/chibi2.html#x') lead to a file this server will hand out? */
export function canServe(root, href, allowAll = false) {
  const abs = resolveStatic(root, '/' + String(href).split('#')[0], allowAll);
  if (!abs) return false;
  try { const st = statSync(abs); return st.isDirectory() ? statSync(resolve(abs, 'index.html')).isFile() : st.isFile(); } catch { return false; }
}

/**
 * What the home page is told about its host: which game this server runs (so that card links to the same
 * origin instead of to a port) and which of the links in data/experiments.json it cannot serve (so the page
 * shows no dead link — Tiny RTS is a symlink the published copy cannot hold, Thousandvale's docs are private).
 */
export function hostInfo(root, allowAll = false) {
  const unavailable = [];
  try {
    const { entries } = JSON.parse(readFileSync(resolve(root, 'data/experiments.json'), 'utf8'));
    for (const e of entries) {
      const links = [e.href, ...(e.links || []).map(l => l.href), e.readme || (e.folder ? e.folder + '/README.md' : null)];
      for (const l of links) if (l && !/^[a-z]+:/i.test(l) && !unavailable.includes(l) && !canServe(root, l, allowAll)) unavailable.push(l);
    }
  } catch { /* no list: nothing to hide */ }
  return { ...GAME, unavailable };
}

/** allowAll: root is a published copy that holds only approved files (see resolveStatic). */
export function createStaticHandler(root, { allowAll = false } = {}) {
  root = resolve(root);
  const gzCache = new Map();   // abs -> { mtime, buf }
  return function serve(req, res) {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '') urlPath = '/';
    if (urlPath === '/' + HOST_INFO) {
      const body = Buffer.from(JSON.stringify(hostInfo(root, allowAll)));
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
      return true;
    }
    let abs = resolveStatic(root, urlPath, allowAll);
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
