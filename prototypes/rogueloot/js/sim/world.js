// The world sim: pure, fixed 20 Hz step, seeded rng, content passed in. Runs in the solo Worker and on the room server.
//   const w = createWorld({ seed, content });  addPlayer(w, id, character);  setInput(w, id, { mx, mz, seq });
//   act(w, id, { do: 'use'|'target'|'release'|'revive', ... });  step(w);  snapshot(w) -> what browsers draw.
// Heroes and foes are both "actors" (js/sim/actors.js); combat in js/sim/fight.js; monster brains in js/sim/brain.js.
import { makeRng } from './rng.js';
import { testField } from './area.js';
import { buildArea } from '../world/zone.js';
import { walk, PLAYER_RADIUS } from './move.js';
import { makeHero, makeFoe, heroRegen } from './actors.js';
import { useSkill, stepCasts, stepAuto, stepShots, setTarget, release, startRevive, KEEP_CORPSE } from './fight.js';
import { stepBrains } from './brain.js';
import { spawnArea } from './spawn.js';
import { speedFactor, stepFx } from './status.js';
import { hurt } from './fight.js';
import { stepPending } from './champions.js';
import { stepAllies, spawnAlly } from './allies.js';
import { mercAct } from './mercs.js';
import { inventoryAct } from './inventory.js';
import { townAct } from './town.js';
import { craftAct } from './craft.js';
import { pickPath, learn, setBar, resourceOf, pickSpec, respec, stepZones } from './skills.js';
import { refreshHero } from './actors.js';
import { stepLoot, pickup, openChest, placeChests } from './loot.js';

export const STEP_HZ = 20;
export const DT = 1 / STEP_HZ;

export const START_ZONE = 'proving_meadow';
export function createWorld({ seed = 1, area = null, content = null, zone = null, difficulty = 'normal' } = {}) {
  const z = content?.zones?.[zone || START_ZONE];
  const w = { seed, rng: makeRng(seed), tick: 0, time: 0, area: area || (z ? buildArea(z) : testField(seed)), content: content || { monsters: {}, skills: {}, bases: {} },
    players: new Map(), foes: new Map(), shots: [], events: [], nextId: 1, charDirty: new Set(), difficulty, tier: content?.difficulty?.tiers?.[difficulty] || { levelAdd: 0, resistPenalty: 0 } };
  spawnArea(w); placeChests(w);
  return w;
}

export function addPlayer(w, id, character = {}) {
  const s = w.area.spawn, n = w.players.size;
  const p = makeHero(w, id, character);
  initResource(w, p);
  rescaleFoes(w, n + 1);
  p.x = s.x + (n % 2 ? 1.2 : -1.2) * Math.ceil(n / 2); p.z = s.z; p.yaw = Math.PI;
  w.players.set(id, p);
  if (character.merc && !character.merc.dead) spawnAlly(w, id, character.merc);
  return p;
}
export function removePlayer(w, id) {
  w.players.delete(id);
  if (w.allies) for (const [k, a] of w.allies) if (a.owner === id) w.allies.delete(k);
  rescaleFoes(w, w.players.size);
  for (const f of w.foes.values()) { f.threat.delete(id); if (f.target === id) f.target = null; }
}

/** An input from a player's browser. The browser sends one per sim step (20 a second, numbered by `seq`); the sim
 *  walks EVERY input exactly once, from a short queue, so the browser's own prediction (the same walk(), the same
 *  inputs) lands exactly where the server does. Delivery is bursty: an empty queue = stand still this step (never
 *  guess — a guess is a step the browser did not take); a queue that has backed up past CATCH_UP walks two this step. */
export const MAX_QUEUE = 10, CATCH_UP = 3;
export function setInput(w, id, inp) {
  const p = w.players.get(id); if (!p) return;
  const f = v => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
  const i = { mx: f(inp.mx), mz: f(inp.mz), seq: Number.isFinite(inp.seq) ? inp.seq : null };
  if (i.seq == null) { p.queue.length = 0; p.input = { mx: 0, mz: 0, seq: p.seq }; return; }       // server-side stop (a dropped socket)
  if (i.seq <= p.seq || p.queue.some(q => q.seq === i.seq)) return;
  p.queue.push(i); if (p.queue.length > MAX_QUEUE) p.queue.shift();
}
function inputsThisStep(p) {
  if (!p.queue.length) return [];
  const n = p.queue.length > CATCH_UP ? 2 : 1, out = p.queue.splice(0, n);
  p.input = out[out.length - 1]; p.seq = p.input.seq;
  return out;
}

/** A player's action (not movement): use a skill, pick a target, release after death, revive a friend. */
export function act(w, id, a) {
  const p = w.players.get(id); if (!p || !a) return { err: 'no' };
  switch (a.do) {
    case 'use': return useSkill(w, p, String(a.skill || ''), a.target ?? p.target, a.at && Number.isFinite(a.at.x) && Number.isFinite(a.at.z) ? { x: +a.at.x, z: +a.at.z } : null);
    case 'path': { const r = pickPath(w, p, String(a.path || '')); if (r.ok) { w.charDirty.add(p.id); refreshHero(w, p); initResource(w, p); } return r; }
    case 'spec': { const r = pickSpec(w, p, String(a.spec || '')); if (r.ok) { w.charDirty.add(p.id); refreshHero(w, p); } return r; }
    case 'respec': { const r = respec(w, p, a); if (r.ok) { w.charDirty.add(p.id); refreshHero(w, p); } return r; }
    case 'learn': { const r = learn(w, p, String(a.skill || '')); if (r.ok) { w.charDirty.add(p.id); refreshHero(w, p); } return r; }
    case 'bar': { const r = setBar(w, p, a.i | 0, a.skill ? String(a.skill) : null); if (r.ok) w.charDirty.add(p.id); return r; }
    case 'target': return setTarget(w, p, a.target ?? null);
    case 'release': return release(w, p);
    case 'revive': return startRevive(w, p, a.target);
    case 'equip': case 'unequip': case 'move': case 'identify': case 'spend': case 'swap': case 'drink': case 'belt': case 'unbelt': return inventoryAct(w, p, a);
    case 'shop': case 'buy': case 'buyPotion': case 'sell': case 'repair': case 'gamble': case 'stash': case 'unstash': return townAct(w, p, a);
    case 'craft': case 'salvage': case 'convert': return craftAct(w, p, a);
    case 'merc': return mercAct(w, p, a);
    case 'pickup': return pickup(w, p, String(a.gid || ''));
    case 'open': return openChest(w, p, String(a.id || ''));
    case 'stop': p.autoOn = false; if (p.cast) { p.cast = null; w.events.push({ k: 'cancel', s: p.id }); } return { ok: true };
  }
  return { err: 'unknown action' };
}

export function step(w) {
  w.tick++; w.time = +(w.tick * DT).toFixed(4);
  for (const p of w.players.values()) {
    const list = p.dead ? [] : inputsThisStep(p);
    if (p.dead) { p.queue.length = 0; p.moving = false; continue; }
    if (!list.length) p.moving = false;
    const spd = p.speed * speedFactor(p);
    for (const i of list) walk(w.area, p, i.mx, i.mz, DT, spd);
    stepFx(w, p, (src, t, n, type) => hurt(w, w.foes.get(src) || t, t, { result: 'hit', amount: Math.max(1, Math.round(n)), mitigated: 0 }, type));
    if (p.dead) continue;
    if (p.cast && (p.moving || p.fx?.some(f => f.kind === 'stun'))) { w.events.push({ k: 'cancel', s: p.id, why: 'moved' }); p.cast = null; }
    heroRegen(w, p, DT);
    stepResource(w, p, DT);
  }
  stepBrains(w, DT);
  stepAllies(w, DT);
  stepCasts(w);
  stepAuto(w);
  stepShots(w, DT);
  stepLoot(w);
  stepPending(w);
  stepZones(w);
  // corpses fade, then go (fresh each game session: nothing respawns, ruling 25)
  for (const f of [...w.foes.values()]) if (f.dead && w.time - f.diedAt > KEEP_CORPSE) w.foes.delete(f.id);
}

const r2 = v => Math.round(v * 100) / 100;
export function snapshot(w) {
  const players = [], foes = [];
  for (const p of w.players.values()) players.push({ id: p.id, name: p.name, x: r2(p.x), z: r2(p.z), yaw: r2(p.yaw), moving: p.moving, seq: p.seq,
    lvl: p.level, hp: Math.round(p.hp), mhp: p.maxHp, mp: Math.round(p.mana), mmp: p.maxMana, res: p.res, rv: p.res === 'mana' ? undefined : Math.round(p.res === 'rage' ? p.rage : p.energy), dead: p.dead || undefined, tg: p.target || undefined, ao: p.autoOn || undefined,
    cast: p.cast ? { sk: p.cast.skill, t: r2(p.cast.end - p.cast.start), left: r2(p.cast.end - w.time) } : undefined,
    gcd: p.gcdUntil > w.time ? r2(p.gcdUntil - w.time) : undefined, spd: speedFactor(p) !== 1 ? r2(speedFactor(p)) : undefined,
    fx: p.fx?.length ? p.fx.map(f => ({ k: f.kind, left: r2(f.until - w.time), id: f.id })) : undefined, sb: p.fx?.find(f => f.kind === 'stance' && f.bar)?.bar || undefined,
    cds: Object.keys(p.cds).length ? Object.fromEntries(Object.entries(p.cds).filter(([, t]) => t > w.time).map(([k, t]) => [k, r2(t - w.time)])) : undefined });
  for (const f of w.foes.values()) foes.push({ id: f.id, d: f.def.id, n: f.name, x: r2(f.x), z: r2(f.z), yaw: r2(f.yaw), lvl: f.level, hp: Math.round(f.hp), mhp: f.maxHp,
    st: f.dead ? 'dead' : f.state, rk: f.rank !== 'normal' ? f.rank : undefined, ra: f.rareId || undefined, ph: f.phase > 0 ? f.phase : undefined,
    fx: f.fx?.length ? f.fx.map(x => x.kind) : undefined, mods: f.mods?.length ? f.mods : undefined, ward: f.ward ? Math.round(f.ward / f.wardMax * 100) : undefined,
    cast: f.cast ? { sk: f.cast.name, t: r2(f.cast.end - f.cast.start), left: r2(f.cast.end - w.time), int: f.cast.interruptible || undefined } : undefined, tg: f.target || undefined });
  const allies = [...(w.allies?.values() || [])].map(a => ({ id: a.id, o: a.owner, n: a.name, x: r2(a.x), z: r2(a.z), yaw: r2(a.yaw), moving: a.moving, hp: Math.round(a.hp), mhp: a.maxHp, dead: a.dead || undefined, k: a.mercKind || a.akind, look: a.look }));
  const chests = [...(w.chests?.values() || [])].map(c => ({ id: c.id, x: c.x, z: c.z, tier: c.tier, by: c.openedBy.size ? [...c.openedBy] : undefined }));
  const shots = w.shots.map(s => ({ id: s.id, x: r2(s.x), z: r2(s.z), ty: s.type }));
  const events = w.events; w.events = [];
  return { tick: w.tick, time: w.time, players, foes, allies, shots, chests, events };
}

/** More heroes, tougher monsters (ruling 5): health follows the bestiary's playersScaling; a hurt monster keeps its share. */
export function rescaleFoes(w, n) {
  const sc = w.content.baseline?.playersScaling, k = i => (sc?.hp?.[Math.max(0, Math.min(3, i - 1))] ?? (1 + 0.6 * (i - 1)));
  const want = k(Math.max(1, n));
  for (const f of w.foes.values()) {
    if (f.dead) continue;
    const base = f.maxHp / (f.crowd || 1), frac = f.hp / f.maxHp;
    const own = f.def.boss && f.def.raw?.scaling ? f.def.raw.scaling[Math.max(0, Math.min(f.def.raw.scaling.length - 1, Math.max(1, n) - 1))] : null;
    f.crowd = own ?? want;
    f.maxHp = Math.round(base * f.crowd); f.hp = Math.max(1, Math.round(f.maxHp * frac));
  }
  w.crowd = want;
}

/** The Path resource (data/skills-paths.json resources): Fighters build temper (stored as rage), Rogues refill energy. */
export function initResource(w, p) {
  p.res = resourceOf(p.char);
  const R = w.content.resources || {};
  if (p.res === 'rage') p.rage ??= R.rage?.start ?? 0;
  if (p.res === 'energy') p.energy ??= R.energy?.start ?? 100;
}
function stepResource(w, p, dt) {
  const R = w.content.resources || {};
  if (p.res === 'energy') p.energy = Math.min(R.energy?.max ?? 100, (p.energy || 0) + (R.energy?.regenPerSecond ?? 10) * (1 + (p.st.energyRegen || 0) / 100) * dt);
  if (p.res === 'rage' && w.time - p.lastFight > 5) p.rage = Math.max(0, (p.rage || 0) - (R.rage?.decayPerSecondOutOfCombat ?? 1) * dt);
}
