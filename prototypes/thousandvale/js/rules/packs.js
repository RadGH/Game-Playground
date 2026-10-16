// Thousandvale — WANDERING PACKS in the rules (owner 2026-10-16: "groups or parties of mobs … sometimes led by an
// elite … wander around … larger group fights would be good for area effect stuff"). Pure: no three/DOM/fetch.
//
// The world (js/sim/packs.js) decides WHERE a pack is and what it is doing; this file is what a pack member IS in a
// fight. A monster entity spawned with `data.pack = { id, lead?, fall?, hp?, dmg?, reward?, name?, prey?, speed? }`:
//   * `packId` — every member of one pack shares it. The whole pack wakes when one member is fighting (monster-ai.js
//     `awakePacks`) and leashes TOGETHER: one member giving up sends every member home (monster-ai.js).
//   * `follow = { id, back, side, at?, face? }` — set by the world each step: keep this place behind the leader (or stand
//     at `at`, facing `face`, while the pack rests). The leader walks the route (`patrol`, with `hold` while it rests).
//   * `hp` / `dmg` / `reward` — a member is weaker than a lone monster of its kind (health, damage, and what it pays:
//     experience, gold and its own drop chance, cast.js). The PACK is the fight; the chest at the end is the pay.
//   * the LEADER (`lead`): its death breaks the pack (`fall: 'rout'` — some run for a few seconds, then come back
//     leaderless) or maddens it (`fall: 'enrage'` — every member hits harder and faster for the rest of the fight).
//   * `prey` — a deer or a goat a hunting pack runs down (monster against monster, nobody's kill): it never fights,
//     never notices a player, and flees whatever hunts it.
//
//   packMember(unit, spec)        fold data.pack into a freshly spawned unit (index.js addEntity)
//   attachPacks(field)            once per room: field.onPackDeath(e) (field.js kill)

import { applyModifier } from './monster-ai.js';

/** The modifier an enraged pack takes when its leader falls (folded once into its own numbers, like any modifier). */
export const PACK_FURY = Object.freeze({ id: 'pack_fury', name: 'Enraged', prefix: 'Enraged', dmg: 1.3, speed: 1.15, attackEvery: 0.85, aura: '#ff4a2a' });
/** A routed member runs this long (s) and at least one always runs. */
export const ROUT = Object.freeze({ chance: 0.6, seconds: 6 });

export function packMember(unit, spec = {}) {
  if (!unit || !spec || spec.id == null) return unit;
  unit.packId = String(spec.id);
  unit.packLead = !!spec.lead;
  unit.packFall = spec.fall === 'enrage' ? 'enrage' : spec.fall === 'rout' ? 'rout' : null;
  const hp = Number(spec.hp), dmg = Number(spec.dmg), rw = Number(spec.reward);
  if (hp > 0 && hp !== 1) { unit.maxHp = Math.max(1, Math.round(unit.maxHp * hp)); unit.hp = unit.maxHp; }
  if (dmg > 0 && dmg !== 1 && Array.isArray(unit.dmg)) unit.dmg = unit.dmg.map(v => Math.max(1, Math.round(v * dmg)));
  if (rw > 0 && rw !== 1) unit.rewardScale = rw;
  if (spec.prey) {
    unit.prey = true;
    unit.aggroRange = 0;                 // it never notices anybody
    unit.dmg = [0, 0]; unit.attackEvery = 1e9; unit.ranged = null; unit.onHit = null;
    if (Number(spec.speed) > 0) unit.speed = Number(spec.speed);
    unit.rewardScale = Math.min(unit.rewardScale || 1, 0.25);
  }
  return unit;
}

export function attachPacks(field) {
  field.onPackDeath = e => {
    if (!e || e.packId == null) return;
    // a hunting pack's quarry: whoever was running it down stops
    if (e.prey) { for (const m of field.monsters) if (m.huntOn === e.id) m.huntOn = null; return; }
    if (!e.packLead) return;
    const mates = field.monsters.filter(m => m !== e && m.packId === e.packId && m.dying == null && !m.removed && !m.prey);
    for (const m of mates) m.follow = null;
    if (!mates.length) return;
    if (e.packFall === 'enrage') {
      for (const m of mates) applyModifier(field, m, { ...PACK_FURY });
      field.emit({ t: 'fx', kind: 'packFall', id: e.id, mode: 'enrage', ids: mates.map(m => m.id) });
      return;
    }
    if (e.packFall === 'rout') {
      const broke = mates.filter(() => field.rng() < ROUT.chance);
      if (!broke.length) broke.push(mates.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b)));
      for (const u of broke) { u.state = 'flee'; u.routed = true; u.fleeFor = Math.max(u.fleeFor || 0, ROUT.seconds); }
      field.emit({ t: 'fx', kind: 'packFall', id: e.id, mode: 'rout', ids: broke.map(u => u.id), seconds: ROUT.seconds });
    }
  };
  return field;
}

/** Where a member's place is: `back` metres behind its leader and `side` metres to its right (leader's facing). */
export function slotOf(leader, f) {
  if (f.at) return f.at;
  const yaw = leader.facing || 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
  return { x: leader.x - fx * (f.back || 0) + fz * (f.side || 0), z: leader.z - fz * (f.back || 0) - fx * (f.side || 0) };
}
