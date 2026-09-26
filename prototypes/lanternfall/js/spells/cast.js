// Casting (docs/03 §2.2-2.3, §9): wick slots, oil, cooldowns, the global cast gap, hold-to-overcharge
// with the safe line and guttering. Pure. The caster is the player actor (hp, oil, maxOil, stats, wicks).
import { compileWick, wickName, burnLevel } from './wick.js';
import { castPlan } from './instances.js';
import { dealDamage } from '../rpg/damage.js';
import { applyElement } from '../world/elements.js';

const DT = 1 / 60;
export const OC = { fill: 1.2, safe: 1.4, gutterMax: 0.6, selfDamage: 0.4, lockout: 1.5, holdToCharge: 0.18 };

export function createCaster(p) {
  p.cast = { slot: 0, cds: [0, 0, 0, 0], gap: 0, hold: 0, charging: false, c: 1, lockout: 0, beam: null, casting: null };
  return p.cast;
}

/** Called once per tick for the player. I = intent; aim = { x, y } world. */
export function stepCasting(game, p, I, aim) {
  const C = p.cast, H = game.hero;
  for (let k = 0; k < 4; k++) if (C.cds[k] > 0) C.cds[k] = Math.max(0, C.cds[k] - DT);
  if (C.gap > 0) C.gap -= DT; if (C.lockout > 0) C.lockout -= DT;
  // oil regen (darkness rules come from game.oilRegenMult)
  p.oil = Math.min(p.maxOil, p.oil + (p.oilRegen || 3) * (game.oilRegenMult ?? 1) * DT);
  // slot selection
  for (let k = 0; k < 4; k++) if (I.pressed?.['wick' + (k + 1)] && k < (H.unlocked?.wickSlots ?? 2)) C.slot = k;
  const nSlots = Math.max(1, Math.min(H.unlocked?.wickSlots ?? 2, H.wicks.length));
  if (I.pressed?.nextWick) C.slot = (C.slot + 1) % nSlots;
  if (I.pressed?.prevWick) C.slot = (C.slot + nSlots - 1) % nSlots;
  const wick = H.wicks[H.loadout?.[C.slot] ?? C.slot]; game.flameColor = wick ? hexRgb(game.data.flames.byId[wick.flame].color) : [1, 0.54, 0.16];
  if (!wick || !p.canCast) { C.charging = false; C.hold = 0; return; }
  const tip = p.lantern || { x: p.x + p.facing * 6, y: p.y - 16 };
  // beam: held
  if (C.beam) { C.beam.holding = !!I.cast && C.beam.alive; if (!C.beam.alive || !I.cast) { if (C.beam.oilSpent) addBurn(game, wick, C.beam.oilSpent); C.beam.holding = false; C.cds[C.slot] = 0.3; C.beam = null; } return; }
  const plan0 = compileWick(wick, game.data, p.stats, { still: p.stillT > 0.3, burn: H.burn });
  if (I.cast && !C.charging && C.cds[C.slot] <= 0 && C.gap <= 0 && C.lockout <= 0) {
    if (plan0.shape === 'beam') {
      if (p.oil < 2) { fizzle(game, p); return; }
      const inst = castPlan(game, p, plan0, { ox: tip.x, oy: tip.y, x: aim.x, y: aim.y }, meta(wick, game))[0];
      if (inst) { inst.aimFn = () => game.aim; inst.holding = true; C.beam = inst; game.bus.emit('cast.release', { caster: p, plan: plan0, wickId: wick.id }); }
      return;
    }
    C.hold += DT;
    const canOC = H.unlocked?.overcharge && plan0.shape !== 'tether';
    if (canOC && C.hold >= OC.holdToCharge) { C.charging = true; C.c = 1; }
    if (!canOC) { release(game, p, wick, 1, tip, aim); C.hold = 0; }
    return;
  }
  if (C.charging) {
    const maxHold = H.mastery === wick.id ? 2.0 : 0.8;
    C.c = Math.min(2, C.c + DT / OC.fill);
    if (C.c >= 2) { C.fullT = (C.fullT || 0) + DT; if (C.fullT > maxHold) { I.cast = false; } }
    const needOil = plan0.oil * C.c;
    if (needOil > p.oil) C.c = Math.max(1, p.oil / plan0.oil);
    if (!I.cast) { release(game, p, wick, C.c, tip, aim); C.charging = false; C.c = 1; C.fullT = 0; C.hold = 0; }
    return;
  }
  if (!I.cast && C.hold > 0) { release(game, p, wick, 1, tip, aim); C.hold = 0; }
}

function meta(wick, game) { return { wickId: wick.id, wickName: wickName(wick, game.data), knot: wick.knot ? { ...wick.knot, max: 3 } : null }; }
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function fizzle(game, p) { game.bus.emit('cast.fizzle', { caster: p }); }

export function release(game, p, wick, c, tip, aim) {
  const C = p.cast, H = game.hero;
  const plan = compileWick(wick, game.data, p.stats, { overcharge: c, still: p.stillT > 0.3, burn: H.burn });
  const free = p.freshWick && p.freshWickReady; // Lamplighter passive: first wick after 3 s costs no base oil
  const cost = free ? plan.oil - plan.oil / c : plan.oil;
  if (p.oil < cost) { fizzle(game, p); return false; }
  p.oil -= cost; addBurn(game, wick, plan.oil); if (free) { p.freshWickReady = false; game.bus.emit('passive', { id: 'll_fresh_wick' }); }
  p.lastCastT = game.time;
  C.cds[C.slot] = plan.cooldown; C.gap = 0.1;
  // gutter roll
  const safe = Math.min(1.7, OC.safe + (plan.steady ? 0.1 : 0) + (p.stats?.overchargeSafe || 0));
  if (c > safe && H.mastery !== wick.id && H.unlocked?.gutter) {
    const chance = OC.gutterMax * Math.pow((c - safe) / (2 - safe), 2);
    if (game.rng.spell.next() < chance) { gutter(game, p, plan, c, tip, wick); return true; }
  }
  castPlan(game, p, plan, { ox: tip.x, oy: tip.y, x: aim.x, y: aim.y }, meta(wick, game));
  game.bus.emit('cast.release', { caster: p, plan, wickId: wick.id, overcharge: c, x: tip.x, y: tip.y });
  p.castAnimT = 0.18;
  return true;
}

function gutter(game, p, plan, c, tip, wick) {
  const r = 8 + 8 * (c - 1);
  dealDamage(game, { source: p, target: p, amount: plan.damage * OC.selfDamage, flame: plan.flame, via: `gutter:${wick.id}`, viaName: 'Guttered wick' });
  for (const e of game.entities) if (!e.dead && e.kind !== 'npc' && Math.hypot(e.x - tip.x, e.y - e.h / 2 - tip.y) < r + e.w / 2) dealDamage(game, { source: p, target: e, amount: plan.damage, flame: plan.flame, via: wick.id, viaName: 'Gutter burst' });
  applyElement(game, p.x, p.y - 2, 4, plan.flame, {});
  p.cast.lockout = OC.lockout;
  game.flashes.push({ x: tip.x, y: tip.y, r: r * 4, color: hexRgb(plan.color), i: 2, t: 0.3, max: 0.3 });
  game.bus.emit('cast.gutter', { caster: p, plan, x: tip.x, y: tip.y });
}

/** Burn-in: oil spent through a wick feeds its flame track and its shape track (docs/03 §10). */
export function addBurn(game, wick, oil) {
  const H = game.hero; H.burn ||= { flame: {}, shape: {} };
  const before = [H.burn.flame[wick.flame] || 0, H.burn.shape[wick.shape] || 0];
  H.burn.flame[wick.flame] = before[0] + oil; H.burn.shape[wick.shape] = before[1] + oil;
  const T = [0, 200, 600, 1500, 3500], lv = v => T.filter(x => v >= x).length;
  if (lv(H.burn.flame[wick.flame]) > lv(before[0])) game.bus.emit('burnin', { track: 'flame', id: wick.flame, level: lv(H.burn.flame[wick.flame]) });
  if (lv(H.burn.shape[wick.shape]) > lv(before[1])) game.bus.emit('burnin', { track: 'shape', id: wick.shape, level: lv(H.burn.shape[wick.shape]) });
}
