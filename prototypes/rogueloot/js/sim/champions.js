// Champions, elites and rare named monsters (M16, ruling 16). Pure. Data: data/monsters.json `champions` (18 modifiers,
// each with a visible tell, a rule and a counter; roll count by area level; championStats) and `rares` (named monsters,
// one per zone, 35% to be up each session). The modifier RULES are implemented here, one small hook each:
//   onSpawn (stats), onHitDealt, onHitTaken, onTick, onDeath. Hooks are called from brain.js / fight.js.
import { addFx } from './status.js';
import { resolveHit } from '../rules/combat.js';
import { resolve } from './move.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const heroesNear = (w, f, r) => [...w.players.values()].filter(p => !p.dead && dist(p, f) < r);
let hurtFn = null, makeFoeFn = null;
export function wireChampions({ hurt, makeFoe }) { hurtFn = hurt; makeFoeFn = makeFoe; }

export const MODS = {
  thorned: { onHitTaken: (w, f, src, r) => { if (src?.team === 'hero' && r.amount > 0 && !r.spell && dist(f, src) < 4) hurtFn(w, f, src, { result: 'hit', amount: Math.max(1, Math.round(r.amount * 0.2)) }, 'poison'); } },
  hasted: { onSpawn: f => { f.speed *= 1.4; f.attackSpeed *= 1.3; } },
  brawny: { onSpawn: f => { f.maxHp = f.hp = Math.round(f.maxHp * 1.6); f.dmg *= 1.25; f.noKnock = true; } },
  stonehide: { onSpawn: f => { f.armour *= 2; f.physTaken = 0.7; } },
  burning: { onHitDealt: (w, f, t) => addFx(w, t, { id: 'burning', kind: 'dot', per: f.dmg * 0.2, type: 'fire', secs: 3, src: f.id }), onTick: (w, f) => { if (w.tick % 10 === 0) for (const p of heroesNear(w, f, 1.6)) addFx(w, p, { id: 'burn-trail', kind: 'dot', per: f.dmg * 0.15, type: 'fire', secs: 2, src: f.id }); } },
  rimed: { onHitDealt: (w, f, t) => addFx(w, t, { id: 'rimed', kind: 'slow', pct: 30, secs: 3, src: f.id }), onDeath: (w, f) => { for (const p of heroesNear(w, f, 3)) { hurtFn(w, f, p, resolveHit(f, p, { amount: f.dmg, type: 'frost', spell: true }, w.rng), 'frost'); } w.events.push({ k: 'burst', x: f.x, z: f.z, r: 3, ty: 'frost' }); } },
  stormtouched: { onHitDealt: (w, f, t) => { f.stormN = (f.stormN || 0) + 1; if (f.stormN % 3) return; for (const p of heroesNear(w, t, 4)) hurtFn(w, f, p, resolveHit(f, p, { amount: f.dmg * 0.6, type: 'storm', spell: true }, w.rng), 'storm'); w.events.push({ k: 'burst', x: t.x, z: t.z, r: 4, ty: 'storm' }); } },
  venomous: { onHitDealt: (w, f, t) => { const n = (t.fx || []).filter(x => x.id === 'venom').length; if (n < 5) addFx(w, t, { id: 'venom', kind: 'dot', per: f.dmg * 0.12, type: 'poison', secs: 6, src: f.id, stack: true }); }, onDeath: (w, f) => { for (const p of heroesNear(w, f, 2.5)) addFx(w, p, { id: 'venom-pool', kind: 'dot', per: f.dmg * 0.3, type: 'poison', secs: 4, src: f.id }); w.events.push({ k: 'burst', x: f.x, z: f.z, r: 2.5, ty: 'poison' }); } },
  shrouded: { onHitDealt: (w, f, t, r) => { f.hp = Math.min(f.maxHp, f.hp + r.amount * 0.3); }, onTick: (w, f) => { if (w.tick % 20 === 0) for (const p of heroesNear(w, f, 3)) hurtFn(w, f, p, { result: 'hit', amount: Math.max(1, Math.round(p.maxHp * 0.02)) }, 'shadow'); } },
  warded: { onSpawn: f => { f.ward = f.wardMax = Math.round(f.maxHp * 0.5); f.wardAt = 0; }, onTick: (w, f) => { if (f.ward < f.wardMax && w.time - (f.wardAt || 0) > 6) { f.ward = f.wardMax; w.events.push({ k: 'ward', t: f.id }); } } },
  summoning: { onTick: (w, f) => { if (f.state !== 'attack' && f.state !== 'chase') return; if (w.time - (f.summonAt || f.pulledAt || 0) < 8) return; f.summonAt = w.time; const kin = Object.values(w.content.monsters).filter(m => m.family === f.def.family && m.role === 'swarm'); const def = kin[0]; if (!def) return; for (let i = 0; i < 2; i++) { const o = makeFoeFn(w, def, f.level, f.x + (i ? 1.2 : -1.2), f.z + 0.6, { pack: f.pack, hpMult: 0.5 }); o.owner = f.id; for (const [id] of f.threat) o.threat.set(id, 1); o.state = 'chase'; } w.events.push({ k: 'fability', s: f.id, sk: 'Summons' }); }, onDeath: (w, f) => { for (const o of w.foes.values()) if (o.owner === f.id && !o.dead) { o.hp = 0; o.dead = true; o.diedAt = w.time; w.events.push({ k: 'die', t: o.id }); } } },
  shifting: { onHitTaken: (w, f, src, r) => { f.recent = (f.recent || []).filter(x => w.time - x.t < 2); f.recent.push({ t: w.time, n: r.amount }); if (w.time - (f.shiftAt || -9) < 5) return; if (f.recent.reduce((a, b) => a + b.n, 0) >= f.maxHp * 0.15) { f.shiftAt = w.time; f.recent = []; const a = w.rng() * Math.PI * 2; [f.x, f.z] = resolve(w.area, f.x + Math.cos(a) * 6, f.z + Math.sin(a) * 6, f.r); w.events.push({ k: 'blink', s: f.id }); } } },
  leeching: { onHitDealt: (w, f, t, r, pack) => { const share = pack ? 0.25 : 0.5; f.hp = Math.min(f.maxHp, f.hp + r.amount * share); } },
  cursing: { onTick: (w, f) => { if ((f.state !== 'attack' && f.state !== 'chase') || w.time - (f.curseAt || f.pulledAt || 0) < 10 || !f.target) return; f.curseAt = w.time; const p = w.players.get(f.target); if (p && !p.dead) { addFx(w, p, { id: 'hexed', kind: 'buff', stat: 'damage', pct: -20, secs: 8, src: f.id }); addFx(w, p, { id: 'hexed-heal', kind: 'buff', stat: 'healTaken', pct: -20, secs: 8, src: f.id }); w.events.push({ k: 'fability', s: f.id, sk: 'Hex' }); } } },
  volatile: { onDeath: (w, f) => { w.pending ||= []; w.pending.push({ at: w.time + 1.2, x: f.x, z: f.z, fn: () => { for (const p of heroesNear(w, f, 3)) hurtFn(w, f, p, resolveHit(f, p, { amount: f.dmg * 2, type: 'fire', spell: true }, w.rng), 'fire'); w.events.push({ k: 'burst', x: f.x, z: f.z, r: 3, ty: 'fire' }); } }); w.events.push({ k: 'tele', s: f.id, shape: 'circle', x: +f.x.toFixed(2), z: +f.z.toFixed(2), r: 3, t: 1.2 }); } },
  anchored: { onSpawn: f => { f.noSlow = true; f.noKnock = true; }, onTick: (w, f) => { if ((f.state !== 'attack' && f.state !== 'chase') || w.time - (f.anchorAt || f.pulledAt || 0) < 12) return; f.anchorAt = w.time; for (const p of heroesNear(w, f, 10)) { const l = dist(p, f) || 1, go = Math.min(5, l - 1.5); if (go > 0) [p.x, p.z] = resolve(w.area, p.x + (f.x - p.x) / l * go, p.z + (f.z - p.z) / l * go, p.r); } w.events.push({ k: 'fability', s: f.id, sk: 'Drags you in' }); } },
  hale: { onTick: (w, f) => { const inFight = f.state === 'attack' || f.state === 'chase'; f.hp = Math.min(f.maxHp, f.hp + f.maxHp * (inFight ? 0.01 : 0.03) / 20); }, noLeaderless: true },
  twinned: { twin: true },
};

/** Roll a champion's modifiers by area level (rollCount bands), respecting minLevel and `excludes`. */
export function rollMods(w, level, fixed = []) {
  const C = w.content.champions || {}, all = C.modifiers || {};
  const band = Object.entries(C.rollCount || { '1-7': 1, '8-14': 2, '15-20': 3 }).find(([k]) => { const [a, b] = k.split('-').map(Number); return level >= a && level <= (b || 999); });
  const n = band ? band[1] : 1, out = [...fixed];
  for (let tries = 0; out.length < n + fixed.length && tries < 40; tries++) {
    const pool = Object.entries(all).filter(([id, m]) => !out.includes(id) && !(m.minLevel > level) && !out.some(o => (all[o]?.excludes || []).includes(id) || (m.excludes || []).includes(o)));
    if (!pool.length) break;
    const tot = pool.reduce((s, [, m]) => s + (m.weight || 10), 0); let k = w.rng() * tot;
    for (const [id, m] of pool) { k -= (m.weight || 10); if (k <= 0) { out.push(id); break; } }
  }
  return out;
}
/** Turn a fresh foe into a champion (or a pack member sharing the pack-wide mods). */
export function makeChampion(w, f, mods, { leader = true } = {}) {
  const C = w.content.champions || {}, S = C.championStats || { hp: 3, damage: 1.4, size: 1.3, xp: 4 };
  const all = C.modifiers || {};
  const mine = leader ? mods : mods.filter(m => all[m]?.pack);
  if (!mine.length && !leader) return f;
  if (leader) { f.rank = 'champion'; f.maxHp = f.hp = Math.round(f.maxHp * S.hp); f.dmg *= S.damage; f.r *= S.size; f.xpMult = S.xp; f.name = `${mods.map(m => all[m]?.name || m).join(' ')} ${f.name}`; }
  f.mods = mine;
  for (const m of mine) MODS[m]?.onSpawn?.(f);
  return f;
}
/** Hooks, called by the sim. */
export function modsTick(w, f) { for (const m of f.mods || []) MODS[m]?.onTick?.(w, f); }
export function modsHitDealt(w, f, t, r) { if (r.amount <= 0) return; for (const m of f.mods || []) MODS[m]?.onHitDealt?.(w, f, t, r, f.rank !== 'champion'); }
export function modsHitTaken(w, f, src, r) { for (const m of f.mods || []) MODS[m]?.onHitTaken?.(w, f, src, r); }
export function modsDeath(w, f) { for (const m of f.mods || []) MODS[m]?.onDeath?.(w, f); }
/** A ward soaks damage first (warded). Returns the damage that gets through. */
export function soakWard(w, f, n) { if (!f.ward) return n; const k = Math.min(f.ward, n); f.ward -= k; f.wardAt = w.time; if (f.ward <= 0) w.events.push({ k: 'wardbreak', t: f.id }); return n - k; }
export function stepPending(w) { if (!w.pending?.length) return; const now = w.pending.filter(p => p.at <= w.time); w.pending = w.pending.filter(p => p.at > w.time); for (const p of now) p.fn(); }

/** Named rares for this area: each has a 35% chance to be up this session (data `rares.list`). */
export function spawnRares(w) {
  const R = w.content.rares?.list || {}, here = w.area.id, marks = (w.area.spawns || []).filter(s => !s.tag || s.tag === 'pack');
  for (const [id, r] of Object.entries(R)) {
    if (r.zone !== here || w.rng() > 0.35) continue;
    const base = w.content.monsters[r.base]; if (!base || !marks.length) continue;
    // its spot: a pack marker far from the start, chosen by the rare's own id so it is always the same place
    const far = [...marks].sort((a, b) => Math.hypot(b.x - w.area.spawn.x, b.z - w.area.spawn.z) - Math.hypot(a.x - w.area.spawn.x, a.z - w.area.spawn.z));
    const sp = far[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % Math.max(1, Math.ceil(far.length / 2))];
    const def = { ...base, abilities: [...base.abilities, ...(r.signature ? [r.signature] : [])], size: base.size * 1.6, radius: base.radius * 1.5 };
    const f = makeFoeFn(w, def, r.level || sp.level || base.levelRange[0], sp.x + 2, sp.z + 2, { rank: 'rare', name: r.name, hpMult: 5, dmgMult: 1.5 });
    f.xpMult = 8; f.rareId = id; f.mods = rollMods(w, f.level, r.fixedMods || []).slice(0, (r.fixedMods || []).length + 1);
    for (const m of f.mods) MODS[m]?.onSpawn?.(f);
    w.events.push({ k: 'rare-up', id, name: r.name });
  }
}
