#!/usr/bin/env node
// Oathwild — the arena balance sim (lessons rule 81; data/arena.json `_goal`). Runs whole matches with the game's own
// match code (js/rules/arena-match.js) and the game's own hero bot (js/rules/hero-ai.js): every bracket with a bot
// party of 1 and of 3, and every champion bout at the champion's level, at two player bars — the 'new player' (rolls
// out of 25% of the tells) and the average one (50%).
//
//   node prototypes/oathwild/tools/sim-arena.mjs              everything (a few minutes)
//   … --brackets b1,b3   … --champions garran,aldis   … --no-brackets   … --no-champions
//   … --party 1,3        … --dodge 0.25,0.5         … --runs 8 (classes per row: warrior, ranger, rogue, mage, cleric, druid, bard, shaman)
//   … --under 2          heroes this many levels UNDER the bracket's low end (what the board's 'hard' means)
//   … --json
// Heroes: plain kit up to level 3, magic finds from 5 (as tools/sim-fights.mjs). No revives (a bot never picks a friend up).
import { readFileSync } from 'node:fs';
import { bootRules } from '../js/rules/boot.js';
import { buildCharacter, botInput } from '../js/rules/hero-ai.js';
import { createWorld, addPlayer, step } from '../js/rules/combat.js';
import { createMatch, matchInputs, stepMatch, endMatch } from '../js/rules/arena-match.js';
import { brackets, champions } from '../js/rules/arena.js';
import { arenaLayout } from '../js/world/arena-place.js';
import { PLANS } from '../tests/rules/plans.mjs';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const list = (k, d) => (opt(k) && opt(k) !== true ? String(opt(k)).split(',') : d);
const rules = await bootRules({ seed: 7 });
const L = arenaLayout(JSON.parse(readFileSync(new URL('../data/arena/placements.json', import.meta.url), 'utf8')).arena);
const CLASSES = ['warrior', 'ranger', 'rogue', 'mage', 'cleric', 'druid', 'bard', 'shaman'];
const runs = Number(opt('--runs') || 8), parties = list('--party', ['1', '3']).map(Number), dodges = list('--dodge', ['0.25', '0.5']).map(Number);
const under = Number(opt('--under') || 0);
const DT = 1 / rules.data.combat.tickHz;

function hero(cls, level, seed) {
  const lv = Math.max(1, level);
  return buildCharacter(rules, PLANS[cls].slice(0, lv), { seed, gearLevel: lv > 1 ? lv : null, gearRarity: lv >= 5 ? 'magic' : 'normal' });
}
/** One match. → { won, seconds, wave, downed } */
export function runMatch({ kind, bracket = null, champion = null, chars, dodgeSkill, seed, maxSeconds = 1200 }) {
  const world = createWorld(rules, { seed });
  const us = chars.map((c, i) => addPlayer(world, c, { at: [L.heroAt[0] + (i - (chars.length - 1) / 2) * 2, L.heroAt[1]] }));
  const M = createMatch(rules, world, { kind, bracket, champion, heroes: us.map(u => u.id), seed, place: L });
  const keepIn = { x: L.centre[0], z: L.centre[1], r: L.floor - 6 };
  let events = [];
  for (let t = 0; t < maxSeconds; t += DT) {
    const inputs = matchInputs(world, M);
    for (const u of us) inputs[u.id] = botInput(world, u, { dodge: true, dodgeSkill, keepIn });
    events = step(world, DT, inputs);
    // the sim has no walls: keep bodies on the sand like the stands do
    for (const u of world.units.values()) { const d = Math.hypot(u.x - L.centre[0], u.z - L.centre[1]); if (d > L.floor - 0.5) { const k = (L.floor - 0.5) / d; u.x = L.centre[0] + (u.x - L.centre[0]) * k; u.z = L.centre[1] + (u.z - L.centre[1]) * k; } }
    stepMatch(world, M, DT, events);
    if (M.state === 'won' || M.state === 'lost') break;
  }
  const out = { won: M.state === 'won', seconds: Math.round(M.t), wave: M.wave, downed: us.filter(u => u.downed).length, timeout: M.state !== 'won' && M.state !== 'lost' };
  endMatch(world, M);
  return out;
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const pct = n => `${Math.round(n * 100)}%`.padStart(4);
const rows = [];
if (!opt('--no-brackets')) {
  const want = list('--brackets', null);
  for (const b of brackets(rules).filter(b => !want || want.includes(b.id))) for (const n of parties) for (const dodgeSkill of dodges) {
    const res = [];
    for (let r = 0; r < runs; r++) {
      const chars = Array.from({ length: n }, (_, i) => hero(CLASSES[(r + i * 3) % CLASSES.length], b.levels[0] - under, 100 + r * 7 + i));
      res.push({ cls: chars.map(c => c.classOrder[0]).join('+'), ...runMatch({ kind: 'waves', bracket: b, chars, dodgeSkill, seed: 1000 + r }) });
    }
    const won = res.filter(x => x.won);
    rows.push({ what: `${b.id} ${b.name} ${b.levels.join('-')}`, kind: 'bracket', bracket: b.id, party: n, dodge: dodgeSkill, win: won.length / res.length, time: median(won.map(x => x.seconds)), wave: median(res.map(x => x.wave)), lost: res.filter(x => !x.won).map(x => `${x.cls} w${x.wave}`) });
    if (!opt('--json')) { const R = rows.at(-1); console.log(`${R.what.padEnd(20)} x${n} roll ${pct(dodgeSkill)}  won ${pct(R.win)}  time ${Number.isFinite(R.time) ? `${Math.round(R.time / 6) / 10} min` : '-'}  lost on waves [${R.lost.join(',')}]`); }
  }
}
if (!opt('--no-champions')) {
  const want = list('--champions', null);
  for (const c of champions(rules).filter(c => !want || want.includes(c.id))) for (const dodgeSkill of dodges) {
    const res = [];
    for (let r = 0; r < runs; r++) res.push({ cls: CLASSES[r % CLASSES.length], ...runMatch({ kind: 'champion', champion: c.id, chars: [hero(CLASSES[r % CLASSES.length], c.level, 300 + r)], dodgeSkill, seed: 2000 + r, maxSeconds: 400 }) });
    const won = res.filter(x => x.won);
    rows.push({ what: `rank ${c.rank} ${c.name} (L${c.level})`, kind: 'champion', champion: c.id, party: 1, dodge: dodgeSkill, win: won.length / res.length, time: median(res.map(x => x.seconds - rules.data.arena.match.gather)), lostTo: res.filter(x => !x.won).map(x => x.cls + (x.timeout ? ' (time)' : '')) });
    if (!opt('--json')) { const R = rows.at(-1); console.log(`${R.what.padEnd(30)} 1v1 roll ${pct(dodgeSkill)}  won ${pct(R.win)}  fight ${Math.round(R.time)} s  lost: ${R.lostTo.join(', ') || '-'}`); }
  }
}
if (opt('--json')) console.log(JSON.stringify(rows, null, 1));
