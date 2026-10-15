#!/usr/bin/env node
// Thousandvale — HOW MANY RARES AND CHAMPIONS DOES A NEWCOMER MEET? (stream E, play-test 5 T10: "rare monsters much
// more frequent — I still haven't seen one"). A measurement, not a guess: it loads the same layout the server runs
// and walks the start chain.
//
//   node tools/content-rares.mjs                  the table, with the rates in data/rules/affixes.json
//   node tools/content-rares.mjs --chance=0.09,0.025,4      the same walk with other rates (champion, rare, minLevel)
//   node tools/content-rares.mjs --json
//   import { measureRares } from './content-rares.mjs'      (tests/E/playtest5-rares.test.js)
//
// THE WALK. A newcomer's first 30 minutes: the quests of the start chain in order, giver to step to step (the marks
// file the quest tracker uses), cut off after WALK_M metres (half the time walking at 5 m/s, half fighting and
// reading), plus KILLS kills on the way (a kill every 45 s, each a fresh body when it comes back). A monster is "met"
// when its camp is within SIGHT metres of the line walked.
// Three ways to meet something special:
//   rolled   an ordinary wilds camp monster rolls champion / rare when it spawns (C's data/rules/affixes.json
//            `chance`, only from `minLevel`) — expected number = bodies met x chance
//   placed   a camp E placed with a fixed rank (the roadside champions, `rank` on a camp placement) — it is simply there
//   named    a zone's named rare (data/provinces/rares.json) whose patrol comes within SIGHT of the line; counted by
//            the share of the half hour it is standing (respawn 20-60 min means a solo newcomer finds it up)
import { readFileSync } from 'node:fs';
import { loadLayouts } from '../server/load.mjs';
import { provinceArg } from '../js/sim/province-files.js';

const root = new URL('../', import.meta.url);
const readJ = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const PROV = provinceArg(process.argv);     // --province=<id> (default torbor_downs)
export const SIGHT = 45;
export const MINUTES = 30;
export const KILLS = 40;
export const WALK_M = 4500;
export const CHAIN = ['start_two_good_legs', 'start_letters_south', 'start_signs_of_the_beast', 'start_old_gristle', 'start_road_to_orrinsford', 'start_the_priors_favour', 'start_home_with_news'];

function segDist(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}
const lineDist = (p, line) => { let d = Infinity; for (let i = 1; i < line.length; i++) d = Math.min(d, segDist(p, line[i - 1], line[i])); return d; };

/** The line a newcomer walks: giver -> each step, quest after quest (world metres). */
export function startLine(marks = readJ(`data/quests/marks/${PROV}.json`), cut = WALK_M) {
  const line = [];
  for (const id of CHAIN) {
    const m = marks.quests[id]; if (!m) continue;
    for (const p of [m.giver, ...(m.steps || [])]) if (p && Number.isFinite(p.x)) line.push({ x: p.x, z: p.z });
  }
  if (!line.length) return [];                 // a province without the start chain (its newcomers come from elsewhere)
  // cut it off at WALK_M
  const out = [line[0]]; let left = cut;
  for (let i = 1; i < line.length && left > 0; i++) {
    const a = line[i - 1], b = line[i], d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= left) { out.push(b); left -= d; } else { out.push({ x: a.x + (b.x - a.x) * left / d, z: a.z + (b.z - a.z) * left / d }); left = 0; }
  }
  return out;
}

export async function measureRares({ chance = null, layout = null, sight = SIGHT, prov = PROV } = {}) {
  if (!layout) { const q = console.log; console.log = () => {}; try { layout = (await loadLayouts([prov])).layouts[0]; } finally { console.log = q; } }
  const c = chance || readJ('data/rules/affixes.json').chance;
  const line = startLine(readJ(`data/quests/marks/${prov}.json`));
  let length = 0; for (let i = 1; i < line.length; i++) length += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
  const met = layout.camps.filter(k => lineDist(k, line) <= sight + (k.radius || 0));
  const plain = met.filter(k => !k.rank && !k.encounter && !k.warband);
  const bodies = plain.reduce((a, k) => a + (k.count || 1), 0);
  const rollable = plain.filter(k => (k.level || 1) >= (c.minLevel ?? 2)).reduce((a, k) => a + (k.count || 1), 0);
  const share = bodies ? rollable / bodies : 0;
  const rolls = rollable + KILLS * share;                      // the bodies standing there + the ones that come back
  const placed = met.filter(k => k.rank === 'champion' || (k.rank === 'rare' && !k.encounter));
  // a named rare walks a loop: the chance you see it = the share of its loop that is within sight of your line
  const loop = k => (k.path && k.path.length ? k.path.map(p => ({ x: p[0], z: p[1] })) : [k]);
  const seen = k => loop(k).filter(p => lineDist(p, line) <= sight).length / loop(k).length;
  const named = layout.camps.filter(k => k.rank === 'rare' && k.encounter && !/^mb_/.test(k.encounter) && seen(k) > 0);   // a quest's own boss is not a surprise
  const up = k => seen(k);
  // what E's data places, whether or not the server passes the rank through yet (docs/requests.md: A, js/sim/placements.js)
  let inData = 0;
  for (const z of layout.zones || []) {
    if (!/^z\d+_\d+$/.test(z.key)) continue;
    let f; try { f = readJ(`data/vignettes/placements/${z.key}.quest.json`); } catch { continue; }
    const ox = +z.key.slice(1, 3) * 2048, oz = +z.key.slice(4, 6) * 2048;
    for (const p of f.placements || []) if (p.rank === 'champion' && lineDist({ x: p.x + ox, z: p.z + oz }, line) <= sight + (p.radius || 0)) inData++;
  }
  const levels = {}; for (const k of plain) levels[k.level || 1] = (levels[k.level || 1] || 0) + (k.count || 1);
  const out = {
    chance: { champion: c.champion, rare: c.rare, minLevel: c.minLevel }, sight, lineMetres: Math.round(length), campsMet: met.length, bodiesMet: bodies, bodiesThatCanRoll: rollable, levels,
    rolledChampions: +(rolls * c.champion).toFixed(2), rolledRares: +(rolls * c.rare).toFixed(2),
    placedChampions: placed.reduce((a, k) => a + (k.count || 1), 0), placed: placed.map(k => k.name || k.type), placedInData: inData,
    namedRares: named.length, named: named.map(k => k.name || k.encounter), namedMeetings: +named.reduce((a, k) => a + up(k), 0).toFixed(2),
  };
  out.total = +(out.rolledChampions + out.rolledRares + out.placedChampions + out.namedMeetings).toFixed(2);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv.find(a => a.startsWith('--chance='));
  let chance = null;
  if (arg) { const [champion, rare, minLevel] = arg.slice(9).split(',').map(Number); chance = { champion, rare, minLevel }; }
  let r;
  try { r = await measureRares({ chance }); } catch (err) { console.error(`content-rares: province ${PROV}: ${err.message}`); process.exit(2); }
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`A newcomer's first ${MINUTES} minutes on the start chain: ${r.lineMetres} m walked, ${KILLS} kills, sight ${r.sight} m`);
    console.log(`  camps met ${r.campsMet}, ordinary bodies ${r.bodiesMet} (by level ${JSON.stringify(r.levels)}), of which ${r.bodiesThatCanRoll} are level ${r.chance.minLevel}+ and can roll a rank`);
    console.log(`  rolled:  ${r.rolledChampions} champions + ${r.rolledRares} rares expected (chance ${r.chance.champion} / ${r.chance.rare} from level ${r.chance.minLevel})`);
    console.log(`  placed:  ${r.placedChampions} roadside champions ${r.placed.length ? '(' + r.placed.join(', ') + ')' : ''}${r.placedInData !== r.placedChampions ? ` — E's data places ${r.placedInData} on this walk; the server is not passing their rank through yet` : ''}`);
    console.log(`  named:   ${r.namedRares} named rares pass within sight ${r.named.length ? '(' + r.named.join(', ') + ')' : ''} = ${r.namedMeetings} meetings`);
    console.log(`  TOTAL special monsters met: ${r.total}`);
  }
  process.exit(0);
}
