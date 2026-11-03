// Rooms on disk: one gzip file a room, written whole and swapped in by a rename, so a crash leaves the old copy and never half of a new one.
//   <dir>/<CODE>.json.gz   { code, at, text (the sim's save), meta (seats, parties, lines) }
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { gzip, gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';

export function createStore(dir) {
  mkdirSync(dir, { recursive: true });
  const file = code => join(dir, `${code}.json.gz`);
  const write = (code, buf) => { const tmp = `${file(code)}.tmp`; writeFileSync(tmp, buf); renameSync(tmp, file(code)); };
  const body = (code, dump, at) => JSON.stringify({ code, at, text: dump.text, meta: dump.meta });
  return {
    dir,
    has: code => existsSync(file(code)),
    /** In the background: a room running must not stall while it is written. */
    save(code, dump, at, done = () => {}) { gzip(body(code, dump, at), { level: 6 }, (e, buf) => { if (e) { done(e); return; } try { write(code, buf); done(null); } catch (err) { done(err); } }); },
    saveNow(code, dump, at) { write(code, gzipSync(body(code, dump, at))); },
    load(code) { return JSON.parse(gunzipSync(readFileSync(file(code))).toString()); },
    remove(code) { rmSync(file(code), { force: true }); },
    /** Rooms nobody has opened for `days` go, oldest first, and never more than `max` are kept. */
    prune({ days = 30, max = 500, nowMs = Date.now() } = {}) {
      const rows = readdirSync(dir).filter(f => f.endsWith('.json.gz')).map(f => ({ f, at: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.at - a.at);
      let n = 0;
      rows.forEach((r, i) => { if (i >= max || nowMs - r.at > days * 864e5) { rmSync(join(dir, r.f), { force: true }); n++; } });
      return n;
    },
    count: () => readdirSync(dir).filter(f => f.endsWith('.json.gz')).length,
  };
}
