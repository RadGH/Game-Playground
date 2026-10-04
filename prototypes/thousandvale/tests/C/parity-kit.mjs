// Shared harness for the class parity fixtures: one Farhold side (real EnemyField, skill bar and
// skill runtime, main.js transcribed) and one Thousandvale side, set up identically, stepped in
// main.js's frame order, and compared field by field. Run under node:test mock timers.

import { mock } from 'node:test';
import * as O from './farhold-oracle.mjs';
import { farholdSkills } from './farhold-oracle-skills.mjs';
import { engineFor, roomFor } from './setup.mjs';
import { createCharacter } from '../../js/rules/character.js';
import { spawnMonster, tickMonsters } from '../../js/rules/monster-ai.js';
import { makeRng } from '../../js/rules/rng.js';

export const DT = 0.05;
export const PACK = [['moor_hound', 24, 0.5, 3.5], ['moor_hound', 24, -1.6, 4.4], ['moor_hound', 24, 1.9, 5.2], ['barrow_hound', 24, 0, 8]];

export async function pair({ classId, level = 30, seed = 4, pack = PACK, followers = false }) {
  const F = O.farholdRpg(seed);
  const fp = O.farholdCharacter(F, classId, level, O.makeRng(seed + 1));
  const ff = O.farholdField(F, seed);
  ff.oraclePlayer = fp;
  const fmobs = pack.map(([id, lvl, x, z]) => O.farholdAdd(ff, F.enemies.enemies.find(d => d.id === id), lvl, x, z));
  const control = { x: 0, z: 0, yaw: 0 };
  const fs = farholdSkills(F, ff, fp, control, O.makeRng(seed + 2), { followers });

  const engine = await engineFor(seed);
  const room = roomFor(engine, { rng: makeRng(seed) });
  room.combat.tickMonsters = dt => tickMonsters(room.field, dt);
  const tp = createCharacter(engine, { id: 'p1', classId, level, rng: makeRng(seed + 1) });
  tp.roomRng = makeRng(seed + 2);
  room.field.add(tp, 'player');
  const tmobs = pack.map(([id, lvl, x, z], i) => spawnMonster(room.field, engine.enemyDef(id), lvl, x, z, { id: `m${i}` }));
  for (const m of [...fmobs, ...tmobs]) { m.hp = m.maxHp = m.maxHp * 40; m.dmg = [1, 2]; }
  return { F, fp, ff, fmobs, fs, control, room, tp, tmobs };
}

export function frame(s) {
  mock.timers.tick(DT * 1000);
  s.ff.update(DT, s.control, s.fp, { onEnemyStrike: e => O.farholdEnemyStrike(s.F, s.ff, s.fp, e, s.fs.mech) });
  s.fs.tick(DT);
  s.room.run(() => { s.room.clock.advance(DT); s.room.combat.tick(DT); });
}

const keys = u => Object.keys(u.statuses || {}).sort().join(',');
/** The first difference between the two sides, or null. */
export function diff(s) {
  for (let i = 0; i < s.fmobs.length; i++) {
    const f = s.fmobs[i], t = s.tmobs[i];
    if (t.hp !== f.hp) return `hound ${i} hp ${t.hp} vs ${f.hp}`;
    if (keys(t) !== keys(f)) return `hound ${i} statuses [${keys(t)}] vs [${keys(f)}]`;
    if (Math.abs(t.x - f.x) > 1e-6 || Math.abs(t.z - f.z) > 1e-6) return `hound ${i} position`;
  }
  if (Math.round(s.tp.hp) !== Math.round(s.fp.hp)) return `player hp ${s.tp.hp} vs ${s.fp.hp}`;
  if (Math.round(s.tp.mp) !== Math.round(s.fp.mp)) return `player mana ${s.tp.mp} vs ${s.fp.mp}`;
  if ((s.tp.barrier || 0) !== (s.fp.barrier || 0)) return `barrier ${s.tp.barrier} vs ${s.fp.barrier}`;
  if (keys(s.tp) !== keys(s.fp)) return `player statuses [${keys(s.tp)}] vs [${keys(s.fp)}]`;
  if (Math.abs(s.tp.x - s.control.x) > 1e-6 || Math.abs(s.tp.z - s.control.z) > 1e-6) return `player position ${s.tp.x},${s.tp.z} vs ${s.control.x},${s.control.z}`;
  for (let i = 0; i < s.tp.skills.slots.length; i++) if (Math.abs(s.tp.skills.slots[i].ready - s.fs.bar.slots[i].ready) > 1e-9) return `slot ${i} cooldown`;
  if (s.followers) { const d = s.followers(s); if (d) return d; }
  return null;
}

/** A basic attack on both sides (a melee skill borrows the last swing's shape). */
export function basic(s, step) {
  const w = s.tp.equipment.weapon;
  const castsOrShoots = w && (/staff/.test(w.subtype || '') || w.ranged);   // a staff, a wand, a bow: everything else swings
  if (castsOrShoots) {
    s.fs.rangedAttack(1.0, step);
    s.tp.swing.mainReady = 0; s.tp.swing.readySince = -10; s.tp.swing.mainStep = step; s.tp.swing.lastAt = s.room.clock.now();
    s.room.run(() => s.room.combat.attack(s.tp, { held: 1.0 }));
  } else {
    O.farholdSwing(s.F, s.ff, s.control, s.fp, 'main', step);
    s.room.run(() => s.room.combat.resolveSwing(s.tp, 'main', step, s.tp.equipment.weapon));
  }
}

/**
 * Every skill on a class's bar, in order: a basic attack, then the skill, then `frames` frames.
 * `skip(row)` leaves a slot out on both sides. Returns { problems: [..], casts, dealt }.
 */
export async function runBar({ classId, seed = 4, level = 30, frames = 50, skip = () => false, followers = false }) {
  mock.timers.enable({ apis: ['setTimeout'], now: 0 });
  const problems = [];
  let casts = 0, dealt = 0;
  try {
    const s = await pair({ classId, level, seed, followers });
    const aim = { x: 0, z: 5 };
    for (let slot = 0; slot < 6; slot++) {
      const row = s.tp.skills.rowFor(slot);
      const id = s.tp.skills.slots[slot].id;
      if (!row || skip(row, id)) continue;
      s.control.yaw = 0; s.tp.yaw = 0;
      s.fp.mp = s.fp.maxMp; s.tp.mp = s.tp.maxMp;
      basic(s, slot);
      let d = diff(s);
      if (d) { problems.push(`${classId}/${id} after the basic attack: ${d}`); break; }
      const before = s.fmobs.reduce((n, m) => n + m.hp, 0);
      const a = s.fs.cast(slot, aim);
      const b = s.room.run(() => s.room.combat.cast(s.tp, slot, { aim }));
      if (b.ok !== (a?.ok !== false)) { problems.push(`${classId}/${id}: cast ok ${b.ok} (${b.why || ''}) vs ${a?.ok} (${a?.why || ''})`); break; }
      casts++;
      for (let k = 0; k < frames; k++) {
        frame(s);
        d = diff(s);
        if (d) { problems.push(`${classId}/${id} +${k}: ${d}`); break; }
      }
      if (problems.length) break;
      dealt += before - s.fmobs.reduce((n, m) => n + m.hp, 0);
      s.control.teleport(0, 0); s.tp.x = 0; s.tp.z = 0;
    }
    if (!problems.length && s.room.rng() !== s.ff.rng()) problems.push(`${classId}: fight rngs out of step`);
    if (!problems.length && s.tp.roomRng() !== s.F.rpg.rng()) problems.push(`${classId}: skill-bar rngs out of step`);
  } finally {
    mock.timers.reset();
  }
  return { problems, casts, dealt };
}
