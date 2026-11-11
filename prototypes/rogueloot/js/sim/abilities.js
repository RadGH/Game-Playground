// Monster abilities from the bestiary (data/monsters.json `abilities[]`). Pure. The bestiary describes what each one
// DOES in words (`effect`) and gives its kind, cast time, cooldown, telegraph and interruptibility; this file gives
// every `kind` ONE generic rule, reading numbers out of the effect text where it states them ("slows 30% for 2 s").
// Damage multipliers per kind (x the monster's hit) are the knobs the balance bot (M12) tunes: KIND_MULT.
//   telegraph shapes: circle (at the target, radius size), cone (from the caster, size long, angle), line (size long,
//   width), ring (round the caster, innerSize..size), cross (two lines), none.
import { resolveHit } from '../rules/combat.js';
import { hurt, aggro } from './fight.js';
import { addFx, dmgFactor } from './status.js';
import { resolve } from './move.js';
import { makeFoe } from './actors.js';
import { bossMechanic } from './bosses.js';

export const KIND_MULT = { melee: 1.5, melee_aoe: 1.3, melee_cc: 1.2, melee_debuff: 1.2, debuff_melee: 1.2, bolt: 1.5, projectile: 1.4, ground: 2.0, cone: 1.8, line: 1.9,
  channel: 0.45, charge: 1.4, gap_closer: 1.3, burrow_strike: 1.6, lurk: 1.8, debuff: 0.6, pull: 0.5 };
const SKIP = new Set(['passive', 'flee_call', 'taunt']);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function readyAbility(w, f, filter = () => true) {
  for (const ab of (f.abilities || f.def.abilities)) {
    if (SKIP.has(ab.kind) || !filter(ab)) continue;
    if ((f.abilityAt[ab.id] || 0) > w.time) continue;
    if (f.silencedUntil > w.time) return null;
    return ab;
  }
  return null;
}

/** Numbers stated in the effect text. */
export function parseEffect(text = '') {
  const t = String(text).toLowerCase(), num = re => { const m = re.exec(t); return m ? +m[1] : null; };
  return {
    slow: num(/slows?\D{0,12}?(\d+)\s*%/), stun: /stun|knock(?:s|ed)? down|dazed?/.test(t) ? (num(/stun\w*\D{0,10}?(\d+(?:\.\d+)?)\s*s/) || 1) : null,
    secs: num(/for\s+(\d+(?:\.\d+)?)\s*s/), silence: /silence/.test(t) ? (num(/silence\w*\D{0,10}?(\d+(?:\.\d+)?)\s*s/) || 2) : null,
    dot: /poison|bleed|burn|rot/.test(t) && /over|per second|each second|every second/.test(t),
    pct: num(/(\d+)\s*%/), heal: /heal/.test(t),
  };
}

export function startAbility(w, f, target, ab) {
  f.abilityAt[ab.id] = w.time + (+ab.cooldown || 8);
  const tele = ab.telegraph || { shape: 'none' };
  const cast = Math.max(+ab.castTime || 0, tele.shape !== 'none' ? (+tele.warn || 0.8) : 0);
  // where it will land is fixed NOW (dodge by walking out of the drawn shape)
  const aim = { x: target.x, z: target.z, yaw: Math.atan2(target.x - f.x, target.z - f.z) };
  f.cast = { name: ab.name || ab.id, ab, start: w.time, end: w.time + cast, interruptible: ab.interruptible !== false, target: target.id, aim, ticks: 0 };
  if (cast <= 0.05) { finish(w, f, target); return; }
  w.events.push({ k: 'fcast', s: f.id, sk: f.cast.name, t: cast, int: f.cast.interruptible });
  if (tele.shape && tele.shape !== 'none') w.events.push({ k: 'tele', s: f.id, shape: tele.shape, ...where(f, aim, tele), t: cast, kind: ab.kind });
}
function where(f, aim, tele) {
  const size = +tele.size || 3;
  if (tele.shape === 'circle') return { x: +aim.x.toFixed(2), z: +aim.z.toFixed(2), r: size };
  if (tele.shape === 'ring') return { x: +f.x.toFixed(2), z: +f.z.toFixed(2), r: size, r0: +tele.innerSize || size * 0.5 };
  return { x: +f.x.toFixed(2), z: +f.z.toFixed(2), yaw: +aim.yaw.toFixed(3), len: size, w: +tele.width || 1.6, ang: +tele.angle || 60 };
}

/** Each step while casting: channels tick; the cast finishes on time. */
export function stepAbility(w, f, t) {
  const c = f.cast, ab = c.ab;
  if (ab.kind === 'channel' && w.time >= c.start + c.ticks + 1) { c.ticks++; landShape(w, f, ab, c.aim, KIND_MULT.channel, true); }
  if (w.time >= c.end - 1e-6) finish(w, f, t);
}

function finish(w, f, t) {
  const c = f.cast, ab = c.ab; f.cast = null;
  f.nextSwing = w.time + 1 / (f.attackSpeed || 0.5);
  const fx = parseEffect(ab.effect);
  const k = ab.kind, tele = ab.telegraph || { shape: 'none' };
  if (f.def.boss && bossMechanic(w, f, t, ab, makeFoe)) return;
  w.events.push({ k: 'fability', s: f.id, sk: ab.name || ab.id });
  if (k === 'heal') { const who = w.foes.get(c.target) || f; const n = Math.round(who.maxHp * ((fx.pct || 25) / 100)); who.hp = Math.min(who.maxHp, who.hp + n); w.events.push({ k: 'heal', s: f.id, t: who.id, n }); return; }
  if (k === 'buff' || k === 'pack_buff') { for (const o of w.foes.values()) if (!o.dead && (o === f || (f.pack && o.pack === f.pack)) && dist(o, f) < 14) addFx(w, o, { id: ab.id, kind: 'dmgUp', pct: fx.pct || 20, secs: fx.secs || 10, src: f.id }); return; }
  if (k === 'raise') { const corpse = [...w.foes.values()].find(o => o.dead && o.pack === f.pack && dist(o, f) < 12); if (corpse) { corpse.dead = false; corpse.hp = Math.round(corpse.maxHp * 0.5); corpse.state = 'chase'; for (const [id, v] of f.threat) corpse.threat.set(id, v); w.events.push({ k: 'raised', t: corpse.id }); } return; }
  if (k === 'spawn') { const kin = Object.values(w.content.monsters).filter(m => m.family === f.def.family && m.role === 'swarm'); const def = kin[0] || f.def; for (let i = 0; i < 2; i++) { const o = makeFoe(w, def, f.level, f.x + (i ? 1 : -1), f.z + 0.5, { pack: f.pack, hpMult: def === f.def ? 0.3 : 1 }); for (const [id] of f.threat) o.threat.set(id, 1); o.state = 'chase'; } return; }
  if (k === 'escape' || k === 'reposition') { const dx = f.x - t.x, dz = f.z - t.z, l = Math.hypot(dx, dz) || 1; [f.x, f.z] = resolve(w.area, f.x + dx / l * 5, f.z + dz / l * 5, f.r); w.events.push({ k: 'blink', s: f.id }); return; }
  if (k === 'charge' || k === 'gap_closer') { const dx = t.x - f.x, dz = t.z - f.z, l = Math.hypot(dx, dz) || 1, go = Math.max(0, l - f.r - t.r - 0.3); [f.x, f.z] = resolve(w.area, f.x + dx / l * go, f.z + dz / l * go, f.r); }
  if (k === 'pull' && t && !t.dead) { const dx = f.x - t.x, dz = f.z - t.z, l = Math.hypot(dx, dz) || 1, go = Math.max(0, Math.min(4, l - 1.5)); [t.x, t.z] = resolve(w.area, t.x + dx / l * go, t.z + dz / l * go, t.r); w.events.push({ k: 'pulled', t: t.id }); }
  const mult = KIND_MULT[k] ?? 1.3;
  if (tele.shape && tele.shape !== 'none') return landShape(w, f, ab, c.aim, mult);
  if (k === 'bolt' || k === 'projectile') {
    if (t && !t.dead) w.shots.push({ id: 's' + (w.nextId++), from: f.id, to: t.id, x: f.x, z: f.z, speed: 20, type: ab.damageType || f.def.damageType, amount: f.dmg * mult * dmgFactor(f), spell: (ab.damageType || f.def.damageType) !== 'physical', foeShot: true, onHit: rider(ab, fx) });
    return;
  }
  if (t && !t.dead && dist(f, t) <= f.def.attackRange + f.r + t.r + 1.5) strike(w, f, t, ab, mult, fx);
}
const rider = (ab, fx) => (fx.slow || fx.stun || fx.dot || fx.silence) ? { id: ab.id, fx } : null;

/** Land a telegraphed shape: every hero inside takes the hit. */
function landShape(w, f, ab, aim, mult, quiet = false) {
  const tele = ab.telegraph, size = +tele.size || 3, fx = parseEffect(ab.effect);
  for (const p of [...w.players.values(), ...(w.allies?.values() || [])]) {
    if (p.dead || !inside(tele.shape, f, aim, tele, size, p)) continue;
    strike(w, f, p, ab, mult, fx, quiet);
  }
}
export function inside(shape, f, aim, tele, size, p) {
  if (shape === 'circle') return Math.hypot(p.x - aim.x, p.z - aim.z) <= size + p.r * 0.5;
  if (shape === 'ring') { const d = Math.hypot(p.x - f.x, p.z - f.z); return d <= size && d >= (+tele.innerSize || size * 0.5); }
  const dx = p.x - f.x, dz = p.z - f.z, fwd = dx * Math.sin(aim.yaw) + dz * Math.cos(aim.yaw), side = dx * Math.cos(aim.yaw) - dz * Math.sin(aim.yaw);
  if (shape === 'line' || shape === 'cross') {
    const half = (+tele.width || 1.6) / 2 + p.r * 0.5;
    const inA = fwd >= 0 && fwd <= size && Math.abs(side) <= half;
    return shape === 'line' ? inA : inA || (Math.abs(fwd) <= half && Math.abs(side) <= size);
  }
  if (shape === 'cone') { const d = Math.hypot(dx, dz); if (d > size) return false; const a = Math.abs(Math.atan2(side, fwd)); return a <= ((+tele.angle || 60) / 2) * Math.PI / 180; }
  return false;
}
function strike(w, f, p, ab, mult, fx, quiet = false) {
  const type = ab.damageType || f.def.damageType;
  const r = resolveHit(f, p, { amount: f.dmg * mult * dmgFactor(f), type, spell: type !== 'physical' }, w.rng);
  hurt(w, f, p, r, type);
  if (r.amount > 0) applyRider(w, f, p, ab, fx);
  void quiet;
}
export function applyRider(w, f, p, ab, fx) {
  if (!fx || p.dead) return;
  if (fx.slow) addFx(w, p, { id: ab.id + ':slow', kind: 'slow', pct: fx.slow, secs: fx.secs || 3, src: f.id });
  if (fx.stun) addFx(w, p, { id: ab.id + ':stun', kind: 'stun', secs: Math.min(3, fx.stun), src: f.id });
  if (fx.silence) addFx(w, p, { id: ab.id + ':silence', kind: 'silence', secs: Math.min(4, fx.silence), src: f.id });
  if (fx.dot) addFx(w, p, { id: ab.id + ':dot', kind: 'dot', per: Math.max(1, f.dmg * 0.25), type: ab.damageType || 'poison', secs: fx.secs || 5, src: f.id });
}
void aggro;
