// Shared helpers for Bannerline node tests (not a test file itself: no .test.js suffix).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataSync, prepareData, ALL_DATA_FILES, rawSet } from '../js/sim/data.js';
import { createSim } from '../js/sim/sim.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const readData = n => readFileSync(join(ROOT, 'data', n), 'utf8');
export const data = loadDataSync(readData);

/** Raw (unfrozen) data, optionally modified, as a new bundle. */
export function dataWith(mutate) {
  const raw = {};
  for (const f of ALL_DATA_FILES) rawSet(raw, f, JSON.parse(readData(f)));
  mutate(raw);
  return prepareData(raw);
}

export function config(over = {}) {
  return Object.assign({
    seed: 7, mode: '1v1', map: 'vale',
    players: [
      { team: 0, kind: 'human', race: 'freeholds', hero: 'warrior', name: 'H' },
      { team: 1, kind: 'ai', ai: { difficulty: 'veteran' }, race: 'freeholds', hero: 'warrior', name: 'AI' },
    ],
  }, over);
}

export const aiVsAi = (seed = 7, a = 'veteran', b = 'veteran', rules = {}) => config({ seed, rules, players: [
  { team: 0, kind: 'ai', ai: { difficulty: a }, race: 'freeholds', hero: 'warrior', name: 'A' },
  { team: 1, kind: 'ai', ai: { difficulty: b }, race: 'freeholds', hero: 'warrior', name: 'B' },
] });

export function sim(cfg = config(), opts = {}, d = data) { return createSim(cfg, d, opts); }

export function run(s, ticks, cmdsAt = () => []) { for (let i = 0; i < ticks && !s.over; i++) s.step(cmdsAt(s.tick + 1)); return s; }

export const hero = (s, pid = 0) => s.state.ents.find(e => e.id === s.state.players[pid].heroEnt);
