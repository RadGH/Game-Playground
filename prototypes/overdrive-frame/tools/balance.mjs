// Balance report: every maker's starter build, driven by a kiting bot, through a few test missions. Prints health left,
// time, grade and kills — the numbers to read before changing enemy or weapon strength (balance is a report, not a guess).
// Usage: node prototypes/overdrive-frame/tools/balance.mjs [seeds=3]
import { readFileSync } from 'node:fs';
import { makeTuning } from '../../../shared/tune.js';
import { mechStats, weaponSpec, partsIndex } from '../js/sim/loadout.js';
import { makeMech } from '../js/sim/mech.js';
import { arm } from '../js/sim/weapons.js';
import { createMission, stepMission } from '../js/sim/mission.js';
import { starterBuild, botInput, BALANCE_MISSIONS } from '../tests/sim/balance-fixtures.mjs';

const ROOT = new URL('../', import.meta.url);
const PARTS = JSON.parse(readFileSync(new URL('../../mechkit/data/parts.json', ROOT)));
const P = partsIndex(PARTS);
const T = makeTuning(JSON.parse(readFileSync(new URL('data/tuning.json', ROOT))));
const KINDS = JSON.parse(readFileSync(new URL('data/enemies.json', ROOT))); delete KINDS._doc;
const MAKERS = [...new Set(PARTS.parts.map(p => p.maker))];
const seeds = +process.argv[2] || 3;

export function runOne(mk, def, seed) {
  const b = starterBuild(PARTS, mk), st = mechStats(b, P);
  const mech = makeMech({ id: 'm1', x: 3, z: 3, stats: st, weapons: b.weapons.map((w, i) => w && arm(weaponSpec(P[w], null, st), i)).filter(Boolean) });
  const S = createMission(def, { kinds: KINDS, T, players: [{ id: 'p1', mech }], seed });
  let minHp = 1;
  for (let t = 0; t < 30 * 400 && !S.result; t++) { stepMission(S, { p1: botInput(S, mech) }, 1 / 30); minHp = Math.min(minHp, mech.hp / mech.hpMax); }
  return { phase: S.phase, grade: S.result?.grade, time: Math.round(S.time), kills: S.stats.kills, hp: Math.round(mech.hp / mech.hpMax * 100), minHp: Math.round(minHp * 100) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const def of BALANCE_MISSIONS) {
    console.log(`\n${def.name}`);
    for (const mk of MAKERS) {
      const rs = Array.from({ length: seeds }, (_, i) => runOne(mk, def, 100 + i));
      const won = rs.filter(r => r.phase === 'won').length;
      console.log(`  ${mk.padEnd(10)} won ${won}/${seeds}  lowest hp ${Math.min(...rs.map(r => r.minHp))}%  avg end hp ${Math.round(rs.reduce((s, r) => s + r.hp, 0) / seeds)}%  grades ${rs.map(r => r.grade || '-').join('')}  time ${rs.map(r => r.time).join('/')}s kills ${rs.map(r => r.kills).join('/')}`);
    }
  }
}
