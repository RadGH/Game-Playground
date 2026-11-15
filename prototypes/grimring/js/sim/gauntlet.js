// The Gauntlet: eight rounds of one or two foes, a boon between rounds, health carried over. Pure and seeded.
import { rng, NO_MODS } from './fight.js';

export const BIG = ['ogre', 'orc_warrior', 'zombie'];

export function createRun({ data, champion, difficulty = 'normal', seed = 1 }) {
  return { champion, difficulty, seed, round: 0, mods: { ...NO_MODS }, boons: [], hp: null, rand: rng(seed ^ 0x9e3779b9), last: [], totals: { dealt: 0, taken: 0, time: 0 }, done: false, won: false, rounds: data.gauntlet.rounds.length };
}

/** Which models the current round sends: never the same model as the round before, and a big one when the round says so. */
export function foesFor(data, run) {
  const spec = data.gauntlet.rounds[run.round];
  const all = data.fighters.map(f => f.id);
  const pick = pool => { const p = pool.filter(id => !run.last.includes(id)); const from = p.length ? p : pool; return from[Math.floor(run.rand() * from.length)]; };
  const out = [];
  for (let i = 0; i < spec.foes; i++) {
    const id = pick(i === 0 && spec.big ? BIG : all.filter(id => !out.includes(id)));
    out.push(id);
  }
  run.last = out.slice();
  return out.map(model => ({ model, tough: spec.tough }));
}

/** Three different boons to choose from after a round. */
export function boonChoices(data, run) {
  const list = data.boons.slice();
  const out = [];
  while (out.length < 3 && list.length) out.push(list.splice(Math.floor(run.rand() * list.length), 1)[0]);
  return out;
}

/** A boon's line for the card, with its real number. */
export function boonText(data, b) {
  return b.text.replace('{v}', String(b.v)).replace('{base}', String(Math.round(data.gauntlet.heal * 100)));
}

export function applyBoon(run, b, def = null) {
  const m = run.mods, v = b.v / 100, oldHp = m.hpMul;
  if (b.stat === 'hpMul' || b.stat === 'dmgMul' || b.stat === 'speedMul' || b.stat === 'hasteMul') m[b.stat] = +(m[b.stat] * (1 + v)).toFixed(4);
  else if (b.stat === 'cdCut') m.cdCut = +(1 - (1 - m.cdCut) * (1 - v)).toFixed(4);
  else if (b.stat === 'armor') m.armor = +(1 - (1 - m.armor) * (1 - v)).toFixed(4);
  else m[b.stat] = +(m[b.stat] + v).toFixed(4);
  if (b.stat === 'hpMul' && def && run.hp != null) run.hp += Math.round(def.hp * (m.hpMul - oldHp));     // the new health comes filled
  run.boons.push(b.id);
}

/** After a won round: carry health over and heal (the usual share plus Second Wind). Returns the health healed. */
export function endRound(data, run, me, F) {
  run.totals.dealt += me.stats.dealt; run.totals.taken += me.stats.taken; run.totals.time += F.t;
  if (F.winner !== 0) { run.done = true; run.won = false; run.hp = 0; return 0; }
  run.round++;
  if (run.round >= run.rounds) { run.done = true; run.won = true; run.hp = me.hp; return 0; }
  const heal = Math.round(me.max * (data.gauntlet.heal + run.mods.mend));
  const before = me.hp;
  run.hp = Math.min(me.max, me.hp + heal);
  return run.hp - before;
}
