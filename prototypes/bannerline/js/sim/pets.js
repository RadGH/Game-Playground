// Pets: summoned allies that fight beside their hero (Druid's Grove Wolves). An entity of kind 'pet'
// on the hero's team in the hero's field. Stats come from heroes.json `pets` and grow with the
// owner's level. A pet follows its hero, attacks the nearest enemy within its leash of the hero, and
// enemy units fight pets the same way they fight heroes (inside the engage cap).

import { baseEnt, liveEnt } from './state.js';
import { dist2 } from './mathx.js';

export function petStats(data, p, petId) {
  const d = data.heroes.pets[petId];
  const L = p.level;
  return { hp: d.hp + d.hpPerLevel * (L - 1), dps: d.dps + d.dpsPerLevel * (L - 1) };
}

export function petsOf(state, ownerId) {
  const out = [];
  for (const e of state.ents) if (e.kind === 'pet' && e.owner === ownerId && e.alive && !e._gone) out.push(e);
  return out;
}

/** Summon up to `count` pets of `petId` next to the hero (the oldest go first past the cap). */
export function summonPets(ctx, hero, petId, count) {
  const { state, data } = ctx;
  const d = data.heroes.pets[petId];
  const p = state.players[hero.owner];
  const st = petStats(data, p, petId);
  const out = [];
  for (let i = 0; i < count; i++) {
    const mine = petsOf(state, p.id).filter(e => e.type === petId);
    if (mine.length >= d.max) {
      const old = mine[0];
      old._gone = true; old.alive = false;
      ctx.emit('remove', { id: old.id, why: 'expired' });
    }
    const side = i % 2 ? 1 : -1;
    const e = baseEnt(state, {
      kind: 'pet', type: petId, team: hero.team, owner: p.id, field: hero.field,
      x: hero.x + side * 1.4, z: hero.z + 0.8, face: hero.face, r: d.radius,
      hp: st.hp, hpMax: st.hp, armour: d.armour, dmgType: d.dmgType,
      _spd: d.speed, _dps: st.dps, _range: d.range, _atkEvery: 20, _atkAt: state.tick + 10,
    });
    ctx.emit('spawn', { id: e.id, kind: 'pet', unit: petId, team: e.team, field: e.field });
    out.push(e);
  }
  return out;
}

/** Pet thinking: pick a target near the owner, or follow the owner. Sets _vx/_vz/_wantAttack. */
export function petThink(ctx, e, inReach) {
  const { state, data } = ctx;
  e._wantAttack = false; e._vx = 0; e._vz = 0; e._sp = 1;
  const owner = liveEnt(state, state.players[e.owner].heroEnt);
  const d = data.heroes.pets[e.type];
  const ox = owner ? owner.x : e.x, oz = owner ? owner.z : e.z;
  let t = liveEnt(state, e.target);
  const leash2 = d.leash * d.leash;
  if (!t || t.team === e.team || t.field !== e.field || dist2(ox, oz, t.x, t.z) > leash2 * 1.5) {
    t = null;
    let bd = leash2;
    for (const o of state.ents) {
      if (!o.alive || o._gone || o.field !== e.field || o.team === e.team || o.kind === 'hero' || o.kind === 'pet') continue;
      const dd = dist2(ox, oz, o.x, o.z);
      if (dd < bd) { bd = dd; t = o; }
    }
  }
  e.target = t ? t.id : -1;
  if (t) {
    if (inReach(e, t, e._range)) { e._wantAttack = true; return t; }
    e._vx = t.x - e.x; e._vz = t.z - e.z;
    return t;
  }
  if (owner && dist2(e.x, e.z, ox, oz) > 9) { e._vx = ox - e.x; e._vz = oz - e.z; }
  return null;
}
