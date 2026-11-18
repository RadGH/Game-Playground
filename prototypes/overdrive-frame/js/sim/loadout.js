// A build (one part per slot + four weapons) → the numbers the mission rules use. THE one place part numbers become
// game numbers (lessons 53: rarity is a real power step from one stat function; the hangar's stat panel, item cards and
// the mission all call this). Parts data: mechkit/data/parts.json (units there: tons, armour points, % resist, km/h,
// metres, energy points). 1 tile = 16 m.
//
// build = { head, core, arms, legs, booster, generator, cooling, cpu, weapons: [leftArm, rightArm, leftShoulder,
//   rightShoulder], hangar?: weapon } — each entry is a part id OR an owned item { id, rarity, rolls: [{ stat, value }] }.

import { applyChips } from './chips.js';

export const SLOTS = ['head', 'core', 'arms', 'legs', 'booster', 'generator', 'cooling', 'cpu'];
export const WEAPON_SLOTS = [
  { id: 'L', label: 'Left arm', mount: 'arm' }, { id: 'R', label: 'Right arm', mount: 'arm' },
  { id: 'SL', label: 'Left shoulder', mount: 'shoulder' }, { id: 'SR', label: 'Right shoulder', mount: 'shoulder' },
];

/** Rarity: a real power step. lift = how much a part's main numbers rise; rolls = how many bonus lines it carries. */
export const RARITY = [
  { id: 'common', label: 'Common', lift: 0, rolls: 0, colour: '#c9ced6' },
  { id: 'refined', label: 'Refined', lift: 0.1, rolls: 1, colour: '#6fd36f' },
  { id: 'rare', label: 'Rare', lift: 0.22, rolls: 2, colour: '#4aa8ff' },
  { id: 'prototype', label: 'Prototype', lift: 0.4, rolls: 3, colour: '#c46bff' },
  { id: 'experimental', label: 'Experimental', lift: 0.65, rolls: 4, colour: '#ff9a2e' },
];
export const RARITY_BY_ID = Object.fromEntries(RARITY.map(r => [r.id, r]));

/** Which numbers rarity lifts (the "good" ones) — weight, heat and energy draw are never raised by rarity. */
const LIFTED = new Set(['ap', 'damage', 'thrust', 'qbThrust', 'output', 'capacity', 'recharge', 'sink', 'rate', 'firmware', 'lockCount', 'carry', 'speed', 'heal', 'block', 'scan']);

export const itemId = it => (typeof it === 'string' ? it : it?.id);

/** One number of one part, after rarity and rolled bonuses. Every reader goes through here. */
export function partNum(part, item, key) {
  let v = part[key];
  if (v == null && typeof item === 'object' && item?.rolls?.some(r => r.stat === key)) v = 0;   // a bonus line on a number the part lacks (crit)
  if (typeof v !== 'number') return v;
  const r = typeof item === 'object' && item ? RARITY_BY_ID[item.rarity] : null;
  if (r && LIFTED.has(key)) v = key === 'lockCount' || key === 'firmware' ? v + Math.round(r.lift * 2) : v * (1 + r.lift);
  if (typeof item === 'object' && item?.rolls) for (const roll of item.rolls) if (roll.stat === key) v = roll.pct ? v * (1 + roll.value / 100) : v + roll.value;
  return v;
}

/** Parts by id: every Mech Kit part plus the crafted-only weapons (data/crafted.json: a Mech Kit model with its own
 *  numbers — set replaces, mul multiplies). Crafted parts carry model = the Mech Kit part drawn for them. */
export function partsIndex(partsJson, craftedJson = null) {
  const P = Object.fromEntries(partsJson.parts.map(p => [p.id, p]));
  for (const c of craftedJson?.parts || []) {
    const base = P[c.model]; if (!base) continue;
    const p = { ...base, ...c.set, id: c.id, name: c.name, blurb: c.blurb, cost: c.cost, crafted: true, model: c.model, tier: base.tier || 1 };
    for (const [k, v] of Object.entries(c.mul || {})) if (typeof p[k] === 'number') p[k] = Math.round(p[k] * v * 100) / 100;
    P[c.id] = p;
  }
  return P;
}

/** Everything the stat panel shows and the mission uses. P = partsIndex(parts.json); C = chipsIndex (build.chips). */
export function mechStats(build, P, C = null) {
  const get = slot => { const it = build[slot]; const p = P[itemId(it)]; return p ? [p, it] : [null, null]; };
  const all = [...SLOTS.map(get), ...(build.weapons || []).map(w => { const p = P[itemId(w)]; return p ? [p, w] : [null, null]; })].filter(([p]) => p);
  const sum = key => all.reduce((s, [p, it]) => s + (partNum(p, it, key) || 0), 0);
  const [legs, legsIt] = get('legs'), [boo, booIt] = get('booster'), [gen, genIt] = get('generator'), [cool, coolIt] = get('cooling'), [cpu, cpuIt] = get('cpu'), [arms, armsIt] = get('arms'), [core, coreIt] = get('core');

  const weight = sum('weight');
  const legsWeight = legs ? partNum(legs, legsIt, 'weight') : 0;
  const carry = legs ? partNum(legs, legsIt, 'carry') : 1;
  const load = weight - legsWeight;
  const overweight = Math.max(0, load / carry - 1);
  const draw = all.reduce((s, [p]) => s + (p.slot === 'weapon' || p.slot === 'generator' ? 0 : p.energy || 0), 0) + all.filter(([p]) => p.slot === 'weapon').reduce((s, [p]) => s + (p.energy || 0), 0);
  const output = gen ? partNum(gen, genIt, 'output') : 0;
  const powerShort = output > 0 ? Math.max(0, draw / output - 1) : 1;      // over the generator's output = slower recharge
  const ap = sum('ap');
  const res = {};
  for (const [p] of all) if (p.res) for (const [k, v] of Object.entries(p.res)) res[k] = (res[k] || 0) + v;
  const armourParts = all.filter(([p]) => p.res).length || 1;
  for (const k in res) res[k] = Math.min(60, res[k] / armourParts) / 100;
  const passiveHeat = sum('heat');
  const coolRate = cool ? partNum(cool, coolIt, 'rate') : 20;

  const st = {
    hp: Math.round(ap), armour: 0, resist: res,
    legs: legs?.type || 'biped',
    speedMul: legs ? partNum(legs, legsIt, 'speed') / 110 : 1,
    turnMul: legs ? partNum(legs, legsIt, 'turn') / 300 : 1,
    jumpMul: legs ? Math.max(0, partNum(legs, legsIt, 'jump')) / 20 : 1,
    boostMul: boo ? partNum(boo, booIt, 'thrust') / 300 : 1,
    hoverMul: boo ? partNum(boo, booIt, 'thrust') / 300 : 1,
    qbMul: boo ? partNum(boo, booIt, 'qbThrust') / 650 : 1,
    qbCostMul: boo ? partNum(boo, booIt, 'qbCost') / 200 : 1,
    qbCooldown: boo ? boo.qbCooldown : null,
    boostCostMul: boo ? partNum(boo, booIt, 'boostCost') / 120 : 1,
    accelMul: 1,
    energyMax: gen ? partNum(gen, genIt, 'capacity') / 10 - 100 : 0,       // tuning's energyMax (100) + this = capacity / 10
    regenMul: (gen ? partNum(gen, genIt, 'recharge') / 350 : 1) / (1 + powerShort * 2),
    heatMax: cool ? partNum(cool, coolIt, 'sink') / 10 : 0,
    coolMul: Math.max(0.25, (coolRate - passiveHeat * 0.35) / 26),
    overweight, weight, load, carry, draw, output, powerShort, passiveHeat,
    lockTimeMul: cpu ? partNum(cpu, cpuIt, 'lockSpeed') / 0.6 : 1,
    lockCount: cpu ? partNum(cpu, cpuIt, 'lockCount') : 2,
    firmware: cpu ? partNum(cpu, cpuIt, 'firmware') : 0,
    aimMul: arms ? partNum(arms, armsIt, 'aim') / 100 : 1,
    recoilMul: arms ? partNum(arms, armsIt, 'recoil') / 100 : 1,
    meleeMul: arms ? partNum(arms, armsIt, 'melee') / 100 : 1,
    critChance: 0, radius: legs?.type === 'quad' || legs?.type === 'treads' ? 0.24 : 0.2,
    boostEff: core ? (core.boostEff || 100) / 100 : 1,
    overload: gen?.overload || null,                                       // an Overload core's ultimate (sim/overload.js)
  };
  return applyChips(st, build.chips, C);
}

const KIND_MAP = {
  'laser-rifle': { kind: 'bullet', speed: 24 }, pulse: { kind: 'bullet', speed: 20 }, rifle: { kind: 'bullet', speed: 16 },
  mg: { kind: 'bullet', speed: 16 }, gatling: { kind: 'bullet', speed: 16 }, rivet: { kind: 'bullet', speed: 15 },
  sniper: { kind: 'bullet', speed: 42 }, shotgun: { kind: 'pellets', speed: 12 }, railgun: { kind: 'rail' },
  'vertical-pod': { kind: 'missile', speed: 5.5, vertical: true }, 'swarm-pod': { kind: 'missile', speed: 6.5 },
  'missile-pod': { kind: 'missile', speed: 6 }, mortar: { kind: 'lob', speed: 6 }, grenade: { kind: 'lob', speed: 7, gravity: 6 },
  plasma: { kind: 'plasma', speed: 5 }, chain: { kind: 'chain' }, repair: { kind: 'repair' },
  'drone-bay': { kind: 'deploy', deploy: 'drone' }, 'mine-layer': { kind: 'deploy', deploy: 'mine' }, 'turret-deployer': { kind: 'deploy', deploy: 'turret' },
  flamer: { kind: 'flame', speed: 4.5 }, 'laser-blade': { kind: 'blade' }, pile: { kind: 'blade' }, saw: { kind: 'blade' }, shield: { kind: 'shield' },
};
const M = 16;   // metres per tile

/** A weapon part (or owned item) → the spec weapons.js fires. stats = the mech's mechStats (CPU lock count, arms). */
export function weaponSpec(part, item = null, stats = null) {
  const n = k => partNum(part, item, k);
  const map = KIND_MAP[part.kind] || { kind: 'bullet', speed: 14 };
  const range = n('range') / M;
  const spec = {
    id: part.id, name: part.name, kind: map.kind, dtype: part.type || 'kinetic', dmg: n('damage'), rate: n('rate') * (stats?.wfx?.rate || 1), crit: n('crit') || 0,
    speed: map.speed || 10, range: Math.max(0.6, range), spread: (part.spread ? part.spread * Math.PI / 180 : 0.03) / (stats?.aimMul || 1),
    count: part.pellets || part.salvo || 1, ammo: part.ammo ?? null, mag: part.mag ?? null, reload: n('reload') || 1.5,
    heat: (n('heatPerShot') || 0) * 0.6 * (stats?.wfx?.heat || 1), energy: (n('shotEnergy') || 0) / 10, splash: part.blast ? part.blast / M : 0,
    pierce: part.pierce ? 3 : 0, charge: part.charge || 0, vertical: !!map.vertical, gravity: map.gravity, mount: part.mount, hand: part.hand,
    status: part.burn ? Math.min(1, part.burn / 60) : part.shock ? Math.min(1, part.shock / 60) : 0,
    knock: part.kind === 'shotgun' || part.kind === 'pile' ? 2.5 : 0, recoil: part.kind === 'railgun' || part.kind === 'sniper' ? 0.6 * (stats?.recoilMul ? 1 / stats.recoilMul : 1) : 0,
  };
  if (part.lock === 'homing' || part.lock === 'multi') spec.lock = { count: Math.min(spec.count, Math.max(1, stats?.lockCount || 2) * (part.salvo > 4 ? 2 : 1)), time: 0.18 };
  if (map.kind === 'blade') { spec.range = Math.max(0.55, range * 1.6); spec.arc = part.kind === 'pile' ? 0.8 : 1.8; spec.dmg *= stats?.meleeMul || 1; spec.knock = 3; }
  if (map.kind === 'flame') { spec.spread = (part.cone || 25) * Math.PI / 180; spec.count = 3; spec.dmg = spec.dmg; spec.status = 0.5; }
  if (map.kind === 'chain') { spec.jumps = part.chain || 4; spec.jumpRange = 1.6; }
  if (map.kind === 'repair') spec.heal = n('heal') || 100;
  if (map.kind === 'plasma') { spec.splash = Math.max(spec.splash, 0.6); }
  if (map.kind === 'deploy') {
    spec.life = part.life || 20; spec.hp = 400; spec.turretDmg = spec.dmg; spec.turretRate = spec.rate; spec.range = Math.max(spec.range, 4);
    if (map.deploy === 'mine') { spec.splash = Math.max(spec.splash, 0.6); spec.life = 60; }
    spec.rate = map.deploy === 'mine' ? 2 : 0.5;
  }
  if (map.kind === 'shield') spec.block = (part.block || 50) / 100;
  if (map.kind === 'missile') { spec.turn = (part.kind === 'swarm-pod' ? 6 : 4) * (stats?.wfx?.missileTurn || 1); spec.dmg *= stats?.wfx?.missileDmg || 1; }
  if (part.burn && map.kind !== 'flame') spec.burn = part.burn;
  return spec;
}
