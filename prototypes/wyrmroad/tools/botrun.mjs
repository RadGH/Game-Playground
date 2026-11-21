#!/usr/bin/env node
// Bots play chapters start to finish: node tools/botrun.mjs [chapter|all] [heroes=1] [seed=1]
// Prints won/lost, time, kills, lives left and levels — read before changing strength.
// Bots wear the PREVIOUS chapter's designed set at Fine (what a player arriving there plausibly has; gear: 'starter' for
// the bare starting kit) — round 2 made enemies tougher, and bots never pick up loot.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createBrawl, step, releaseHold } from '../js/sim/brawl.js';
import { mergeActs } from '../js/sim/route.js';
import { starterGear, chapterGear } from '../js/sim/items.js';
const D = resolve(dirname(fileURLToPath(import.meta.url)), '../data');
/** Every data file, with Acts II/III merged in (24 chapters). */
export const loadData = () => {
  const d = Object.fromEntries(['classes', 'enemies', 'chapters', 'items', 'story', 'acts'].map(k => [k, JSON.parse(readFileSync(`${D}/${k}.json`, 'utf8'))]));
  d.storyActs = JSON.parse(readFileSync(`${D}/story-acts.json`, 'utf8'));
  return mergeActs(d);
};
export const loadT = () => { const t = JSON.parse(readFileSync(`${D}/tuning.json`, 'utf8')); return Object.fromEntries(Object.entries(t).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v.value])); };
export function play({ data, T, chapter, n = 1, seed = 1, level, maxT = 900, gear = 'fair' }) {
  // gear 'fair' = the set of the tier before this chapter's, at Fine (a pre-boss scene is released at once)
  const ch = data.chapters.chapters.find(c => c.id === chapter);
  const classes = ['vanguard', 'arcanist', 'duelist', 'warden'];
  const heroes = Array.from({ length: n }, (_, i) => ({ pid: 'p' + i, cls: classes[i % 4], level: level ?? ch.level, xp: data.classes.levels[(level ?? ch.level) - 1], gear: gear === 'starter' ? starterGear(data.items, classes[i % 4]) : chapterGear(data.items, classes[i % 4], Math.max(0, (ch.tier ?? 1) - 1)), ctrl: 'bot' }));
  const G = createBrawl({ data, T, chapter, heroes, seed });
  const counts = {}; let bossAt = null; const bossTimes = [];
  while (!G.over && G.t < maxT) { if (G.hold) releaseHold(G); step(G, {}); for (const e of G.events) { counts[e.type] = (counts[e.type] || 0) + 1; if (e.type === 'boss') bossAt = G.t; if (e.type === 'sectionClear' && bossAt != null) { bossTimes.push(Math.round(G.t - bossAt)); bossAt = null; } } }
  return { G, counts, bossTimes };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [which = 'all', n = '1', seed = '1'] = process.argv.slice(2);
  const data = loadData(), T = loadT();
  for (const ch of data.chapters.chapters) {
    if (which !== 'all' && which !== ch.id) continue;
    const t0 = Date.now(); const { G, counts, bossTimes } = play({ data, T, chapter: ch.id, n: +n, seed: +seed });
    console.log(`${ch.id.padEnd(12)} ${String(G.outcome || 'timeout').padEnd(7)} t=${G.t.toFixed(0)}s sec=${G.secI}/${ch.sections.length} kills=${G.stats.kills} lives=${G.heroes.map(h => h.lives + '/' + h.state).join(',')} lv=${G.heroes.map(h => h.level).join(',')} downs=${counts.heroDown || 0} loot=${counts.loot || 0} perfect=${counts.perfect || 0} throws=${counts.throw || 0} boss=${bossTimes.join(',')}s (${Date.now() - t0}ms)`);
  }
}
