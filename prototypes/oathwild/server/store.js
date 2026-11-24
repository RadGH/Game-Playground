// Saves on disk (owner ruling: world saves are JSON files; Postgres later if needed). One folder per server copy:
//   <dir>/worlds/<CODE>.json     { meta, state }  (world-state.js record + the world's name, code, owner, public)
//   <dir>/players/<key>.json     { key, name, chars: [character records] }   (key = acct:<id> or dev:<device id>)
// Writes go to a .tmp file first and are renamed into place, so a crash mid-write never leaves half a save.
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const SAFE = /^[A-Za-z0-9:_-]{1,80}$/;
const fileOf = key => key.replace(/:/g, '_');

export function createStore(dir) {
  mkdirSync(join(dir, 'worlds'), { recursive: true });
  mkdirSync(join(dir, 'players'), { recursive: true });
  const write = (p, obj) => { const tmp = p + '.tmp'; writeFileSync(tmp, JSON.stringify(obj)); renameSync(tmp, p); };
  const read = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
  return {
    dir,
    worldCodes() { return readdirSync(join(dir, 'worlds')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)); },
    loadWorld(code) { return /^[A-Z]{4}$/.test(code) ? read(join(dir, 'worlds', code + '.json')) : null; },
    saveWorld(code, rec) { if (/^[A-Z]{4}$/.test(code)) write(join(dir, 'worlds', code + '.json'), rec); },
    deleteWorld(code) { const p = join(dir, 'worlds', code + '.json'); if (/^[A-Z]{4}$/.test(code) && existsSync(p)) unlinkSync(p); },
    loadPlayer(key) { if (!SAFE.test(key)) return null; return read(join(dir, 'players', fileOf(key) + '.json')); },
    savePlayer(key, rec) { if (SAFE.test(key)) write(join(dir, 'players', fileOf(key) + '.json'), rec); },
  };
}

/** A store in memory (tests). */
export function memoryStore() {
  const W = new Map(), P = new Map();
  const clone = o => (o == null ? null : JSON.parse(JSON.stringify(o)));
  return {
    dir: null, W, P,
    worldCodes: () => [...W.keys()],
    loadWorld: c => clone(W.get(c)), saveWorld: (c, r) => W.set(c, clone(r)), deleteWorld: c => W.delete(c),
    loadPlayer: k => clone(P.get(k)), savePlayer: (k, r) => P.set(k, clone(r)),
  };
}
