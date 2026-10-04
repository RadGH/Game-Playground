// Stream E — the AI's situation reading. Pure functions over sim state: no writes, no rng.
//
//   defenceOf(ctx, fieldId, forTeam)   who defends a field against `forTeam`'s sends: heroes (damage mix,
//                                      armour class, armour, magic resist, dps, area clear, crowd control,
//                                      alive / away / low), turrets, pets — what counter-sending reads
//   threatIn(ctx, team)                enemy bodies in a team's own field: how many, how close to the Keep,
//                                      banners they would tear, per lane — what defending reads
//   laneOf(map, field, x)              which gate lane an x position belongs to
//
// The AI reads only sim state (never events), exactly what is on screen for a human: unit types,
// positions and health, the enemy hero's level, form and items (the Outfitter is public).

import { heroStats } from '../heroes.js';
import { gearStats } from '../items.js';
import { activeForm } from '../skills.js';
import { dist2 } from '../mathx.js';

export const live = e => e.alive && !e._gone;

/** What each hero's kit does to a crowd, for counter-sending. Knowledge a player learns by playing. */
export const KIT = {
  //           skill share of its damage, crowd control in the kit, fights at range
  warrior:    { skillShare: 0.35, cc: 1.0, ranged: false },
  ranger:     { skillShare: 0.30, cc: 0.6, ranged: true },
  pyromancer: { skillShare: 0.55, cc: 0.2, ranged: true },
  druid:      { skillShare: 0.35, cc: 0.5, ranged: true },
  engineer:   { skillShare: 0.45, cc: 0.4, ranged: true },
};
const kitOf = hero => KIT[hero] || KIT.warrior;

/** A hero's damage mix right now: { type: share }. A form changes the basic attack (Wolf bites are blade). */
export function damageMix(data, p, ent) {
  const base = ent ? ent.dmgType : data.heroes.heroes[p.hero].dmgType;
  const form = activeForm(data, p);
  const kit = kitOf(p.hero);
  const mix = {};
  const add = (t, w) => { mix[t] = (mix[t] || 0) + w; };
  if (form && form.basic && form.basic.element && data.damage.types.includes(form.basic.element)) {
    add(form.basic.element, 1 - kit.skillShare);
    add(base, kit.skillShare);
  } else add(base, 1);
  return mix;
}

/** Index of the gate lane nearest to x in a field (0 in 1v1). */
export function laneOf(field, x) {
  let best = 0, bd = Infinity;
  field.gates.forEach((g, i) => { const d = Math.abs(g.x - x); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** The lane in `p`'s own field that `p`'s direct rival sends down. */
export function myLane(ctx, p) {
  const { state, map } = ctx;
  const field = map.fields[state.teams[p.team].field];
  const rival = state.players[p.rival];
  const gi = state.teams[rival.team].players.indexOf(rival.id) % field.gates.length;
  return gi;
}

/**
 * Who defends field `fieldId` against `forTeam`. Each hero row:
 * { pid, ent, alive, respawnIn, dps, mix, armourClass, armor, mr, aoe, cc, ranged, skillShare, hpPct, x, z, lane,
 *   atShop (inside its Outfitter), busy (bodies on it) }.
 */
export function defenceOf(ctx, fieldId, forTeam) {
  const { state, data, map } = ctx;
  const field = map.fields[fieldId];
  const team = state.fields[fieldId].team;
  const heroes = [];
  let turretDps = 0, turrets = 0, petDps = 0, pets = 0, turretType = null;
  for (const pid of state.teams[team].players) {
    const p = state.players[pid];
    const ent = state.ents.find(e => e.id === p.heroEnt) || null;
    const hs = heroStats(data, p);
    const g = hs.g;
    const kit = kitOf(p.hero);
    const asp = (1 + g.attackSpeed / 100) * (1 + (hs.attackSpeedPct || 0));
    const alive = !!(ent && ent.alive);
    let busy = 0;
    if (alive) for (const e of state.ents) if (live(e) && e.target === ent.id && e.team !== team) busy++;
    const arm = field.armory;
    heroes.push({
      pid, ent, alive, respawnIn: alive ? 0 : Math.max(0, (ent ? ent.respawnAt : 0) - state.tick),
      dps: hs.dps * asp / (1 - kit.skillShare * 0.6),   // basic attacks + an estimate of skill damage
      mix: damageMix(data, p, ent), armourClass: ent ? ent.armour : data.heroes.heroes[p.hero].armourClass,
      armor: hs.armor, mr: g.magicResist || 0,
      aoe: (data.econ.hero.classes[p.hero] || { aoe: 0.8 }).aoe, cc: kit.cc, ranged: kit.ranged, skillShare: kit.skillShare,
      hpPct: alive ? ent.hp / ent.hpMax : 0, x: alive ? ent.x : field.spawn.x, z: alive ? ent.z : field.spawn.z,
      lane: alive ? laneOf(field, ent.x) : -1,
      atShop: alive && dist2(ent.x, ent.z, arm.x, arm.z) <= 64, busy, level: p.level,
    });
  }
  for (const e of state.ents) {
    if (!live(e) || e.field !== fieldId || e.team !== team) continue;
    if (e.kind === 'turret') { turrets++; turretDps += e._dps; turretType = e.dmgType; }
    else if (e.kind === 'pet') { pets++; petDps += e._dps; }
  }
  // the Keep guard (js/sim/keep.js): a splash shot every few seconds on whatever is nearest the leak
  // line, growing with the clock — it melts swarms of small bodies on the last stretch
  const G = field.keep && field.keep.guard;
  const keep = G ? { shot: G.damage + G.damagePerMinute * (state.tick / 1200), every: G.every, range: G.range, splash: G.splash, dmgType: G.dmgType || 'pierce' } : null;
  return { fieldId, team, heroes, turrets, turretDps, turretType, pets, petDps, keep };
}

/**
 * Enemy bodies in `team`'s own field. { n, ehp, leak (banners if all of it reached the Keep), danger
 * (leak weighted by how close each body is), near (bodies within 30 m of the leak line), stealth (hidden
 * bodies), lanes: [{ n, danger }], cx, cz (centre of the nearest-to-Keep cluster) }.
 */
export function threatIn(ctx, team) {
  const { state, map } = ctx;
  const field = map.fields[state.teams[team].field];
  const lanes = field.gates.map(() => ({ n: 0, danger: 0 }));
  const merge = field.laneWalls && field.laneWalls.length ? field.laneWalls[0].z1 : Infinity;   // lanes join below the lane wall
  const out = { n: 0, ehp: 0, leak: 0, danger: 0, near: 0, stealth: 0, lanes, cx: field.cx, cz: field.z1 - 20, deepest: null };
  let sx = 0, sz = 0, sw = 0;
  for (const e of state.ents) {
    if (!live(e) || e.field !== field.id || e.team === team || e.kind === 'hero' || e.kind === 'pet' || e.kind === 'turret') continue;
    out.n++;
    out.ehp += e.hp;
    const leak = e.kind === 'tide' ? 1 : e._leak;
    out.leak += leak;
    const prox = Math.max(0, Math.min(1, (e.z - field.z0) / (field.leakZ - field.z0)));
    const w = leak * prox * prox;
    out.danger += w;
    if (e.z > field.leakZ - 30) { out.near++; sx += e.x * (w + 0.01); sz += e.z * (w + 0.01); sw += w + 0.01; }
    if (e._traits.indexOf('stealth') >= 0) out.stealth++;
    const l = lanes[laneOf(field, e.x)];
    if (e.z < merge || lanes.length === 1) { l.n++; l.danger += w; } else { for (const k of lanes) { k.n += 1 / lanes.length; k.danger += w / lanes.length; } }
    if (!out.deepest || e.z > out.deepest.z) out.deepest = e;
  }
  if (sw > 0) { out.cx = sx / sw; out.cz = sz / sw; }
  return out;
}

/** My sent units now in the enemy field (they keep its defenders busy): { n, ehp, leak, cx, cz }. */
export function myArmy(ctx, p) {
  const { state, map } = ctx;
  const out = { n: 0, ehp: 0, leak: 0, cx: 0, cz: 0, front: 0 };
  let sx = 0, sz = 0;
  const fid = state.teams[1 - p.team].field;
  for (const e of state.ents) {
    if (!live(e) || e.kind !== 'unit' || e.owner !== p.id || e.field !== fid) continue;
    out.n++; out.ehp += e.hp; out.leak += e._leak; sx += e.x; sz += e.z;
    if (e.z > out.front) out.front = e.z;
  }
  if (out.n) { out.cx = sx / out.n; out.cz = sz / out.n; } else { const f = map.fields[fid]; out.cx = f.cx; out.cz = f.z0 + 10; }
  return out;
}

/** Densest spot among `ents` for an area of radius r: { x, z, n } (candidates = the ents themselves). */
export function bestCluster(ents, r, maxCand = 14) {
  let best = null;
  const step = ents.length > maxCand ? Math.ceil(ents.length / maxCand) : 1;
  const r2 = r * r;
  for (let i = 0; i < ents.length; i += step) {
    const c = ents[i];
    let n = 0, sx = 0, sz = 0;
    for (const e of ents) if (dist2(c.x, c.z, e.x, e.z) <= r2) { n++; sx += e.x; sz += e.z; }
    if (!best || n > best.n) best = { x: sx / n, z: sz / n, n };
  }
  return best || { x: 0, z: 0, n: 0 };
}

/** Gear totals for a player (shortcut). */
export const gearOf = (data, p) => gearStats(data, p);
