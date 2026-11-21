// Wyrmroad fight rules: pure and seeded (no three.js, no DOM, no clock) so node tests, bots and the online server can
// play whole chapters in memory.
//
//   const G = createBrawl({ data, T, chapter: 'millbrook', heroes: [{ pid: 'p1', name: 'Ash', cls: 'vanguard', level: 1, gear }], seed: 7 });
//   step(G, { p1: { mx, mz, attack, heavy, jump, dash, block, grab, spell1, spell2, breaker } });   // one 1/60 s step
//   G.events → what happened this step ({ type: 'hit' | 'kill' | 'move' | … }, see EVENTS below)
//
// World (metres): x runs along the road (right = +), z is the depth strip (−DEPTH..+DEPTH, + is toward the camera),
// y is height. `dir` is +1 facing right, −1 facing left. A move's numbers come from data (classes.json / enemies.json).
// Input edges (attack, heavy, jump, dash, grab, spell1, spell2, breaker) are "pressed since the last step"; block is held,
// and spell1Held / spell2Held say the spell button is still down (a channelled spell such as Iron Gale keeps going while
// it is held; without the flags it spins for its minimum time).
//
// Round 2 rules (owner play-test 2026-11-21): waves grow with the number of heroes (stage.js, T.coopFoes); gear regen
// works only between fights; Breaker has a short cooldown and costs more when used back to back (heat); enemies have
// knockdown kinds from enemies.json `down` (resist meter, stay standing, quick get-up, guard + counter on get-up, a
// boss knockdown limit) shown by `stagger` events; reach grabs are thrown hooks (a shot with `pull`) you can jump, dash
// through or block; heroes turn between combo hits; each class has dash/block upgrades by level (classes.json `kit`).
import { rng } from './rng.js';
import { heroStats, rollItem, levelFor } from './items.js';
import { thinkFoe, bossPhaseCheck } from './foes.js';
import { stageStep, stageStart, bossArrives } from './stage.js';
import { botInput } from './bots.js';
import { stepBig, isBig, skyStep } from './big.js';

export const STEP = 1 / 60;
export const DEPTH = 2.6;
export const EVENTS = ['move', 'hit', 'block', 'perfect', 'shieldblock', 'armor', 'kill', 'heroDown', 'revive', 'lifeLost',
  'respawn', 'gone', 'loot', 'gold', 'xp', 'levelUp', 'food', 'pickup', 'pickupBreak', 'crate', 'shot', 'zoneWarn', 'zoneHit',
  'spell', 'fight', 'wave', 'go', 'boss', 'bossPhase', 'line', 'sectionClear', 'chapterClear', 'chapterLost', 'grab', 'throw',
  'land', 'heal', 'buff', 'nomana', 'cooldown', 'breaker', 'quake', 'stagger', 'hook', 'channel', 'riposte', 'kit',
  'rise', 'expose', 'sky', 'gust', 'calm', 'bossScene', 'enrage'];

const EDGES = ['attack', 'heavy', 'jump', 'dash', 'grab', 'spell1', 'spell2', 'breaker'];
/** The dash / block upgrade this hero has at their level (classes.json kit: the highest entry at or below the level). */
export function kitMove(G, h, slot) {
  const list = G.data.classes.classes[h.cls]?.kit?.[slot] || [];
  let best = null; for (const k of list) if (k.level <= h.level && (!best || k.level >= best.level)) best = k;
  return best;
}
/** Kit moves first learned when going from level `from` to level `to` (the level-up banner names them). */
export function kitLearned(CLASSES, cls, from, to) {
  const K = CLASSES.classes[cls]?.kit || {};
  return Object.values(K).flat().filter(k => k.level > from && k.level <= to);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sgn = v => (v < 0 ? -1 : 1);

/** Start a chapter. heroes: [{ pid, name, cls, level, xp, gear, spells: [id, id], ctrl: 'player' | 'bot', look }] */
export function createBrawl({ data, T, chapter, heroes, seed = 1, section = 0, ally = true }) {
  const ch = data.chapters.chapters.find(c => c.id === chapter) || data.chapters.chapters[0];
  const chIndex = data.chapters.chapters.indexOf(ch);
  // tier = the chapter's strength step (loot, gold, enemy numbers); chIndex is only its place in the full list of 24
  const G = {
    t: 0, rand: rng(seed), seed, T, data, ch, chIndex, tier: ch.tier ?? chIndex, hold: null, heroes: [], foes: [], props: [], shots: [], zones: [], events: [],
    nextId: 1, phase: 'walk', secI: section, waveI: 0, camX: 0, quakeT: 0, over: false, outcome: null, said: new Set(),
    stats: { kills: 0, time: 0, damage: {} },
  };
  heroes.forEach((h, i) => addHero(G, h, i));
  if (ally && ch.ally && G.heroes.length === 1) addAlly(G, ch.ally);
  stageStart(G);
  return G;
}

export function addHero(G, h, i = G.heroes.length) {
  const { data, T } = G;
  const st = heroStats(data.classes, data.items, { cls: h.cls, level: h.level || 1, gear: h.gear || {} });
  const startX = (G.ch.sections[G.secI - 1]?.at ?? 0) + 2 + (G.secI ? 2 : 0);
  const e = baseEntity(G, {
    side: 'hero', team: 0, kind: h.cls, pid: h.pid, name: h.name || data.classes.classes[h.cls].name, ctrl: h.ctrl || 'player',
    x: (G.phase === 'fight' ? G.camX - 3 : startX) - i * 0.8, z: [0.8, -0.8, 1.9, -1.9][i % 4], hp: st.hp, max: st.hp,
  });
  Object.assign(e, {
    stats: st, cls: h.cls, level: h.level || 1, xp: h.xp || 0, gear: h.gear || {}, look: h.look || null,
    mp: st.mp, mpMax: st.mp, spells: (h.spells || data.classes.classes[h.cls].spells.slice(0, 2)).map(id => data.classes.renamed?.[id] || id),
    lives: T.lives + (st.effects.some(f => f.id === 'extralife') ? 1 : 0), combo: 0, comboT: 0, cds: {},
    buf: Object.fromEntries(EDGES.map(k => [k, 0])), blocking: false, blockT: 0, pickup: null, reviveT: 0, downClock: 0,
    airUsed: false, dashT: 0, contactT: 0, gold: 0, xpGained: 0, kills: 0, inputs: {}, brkHeat: 0, chan: null, pull: null, carry: null,
  });
  G.heroes.push(e);
  return e;
}

function addAlly(G, allyId) {
  const a = G.data.chapters.allies[allyId], def = G.data.enemies.bosses[a.foe];
  const e = makeFoe(G, a.foe, def, G.heroes[0].x - 1.2, -1.2, { team: 0, side: 'ally', hpMul: a.hpMul, dmgMul: a.dmgMul, name: a.name });
  e.state = 'idle';
  G.foes.push(e);
}

function baseEntity(G, o) {
  return {
    id: G.nextId++, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, dir: 1, hp: 1, max: 1, state: 'idle', st: 0, mv: null, mvKind: null,
    hitSet: null, fired: false, stunT: 0, invT: 0, freezeT: 0, slowT: 0, slowK: 0, burnT: 0, hs: 0, grab: null, heldBy: null,
    grabT: 0, buffs: [], anim: 'idle', ...o,
  };
}

/**
 * Enemy strength step for a chapter tier: +k a tier through Act I (tiers 0-5), then half that a tier in Acts II/III,
 * where heroes also grow half as fast (one level a chapter instead of two — tools/build-items.mjs L()).
 */
export const tierK = (tier, k) => (tier <= 5 ? 1 + tier * k : 1 + 5 * k + (tier - 5) * k / 2);

/** Heroes still in the chapter (co-op scaling counts these). */
export const heroCount = G => Math.max(1, G.heroes.filter(h => h.state !== 'gone').length);

/**
 * A foe (or the ally) from enemies.json. tier scales health and power by chapter; every hero after the first adds
 * T.coopHealth (bosses T.coopBossHealth) of health and T.coopDamage of power — the waves also grow (stage.js).
 */
export function makeFoe(G, type, def, x, z, o = {}) {
  const { T } = G, tier = G.ch.tier, n = heroCount(G), boss = def.ai === 'boss', ally = o.team === 0;
  const hpMul = (o.hpMul || 1) * (ally ? 1 : T.foeHealth * tierK(tier, 0.32) * (1 + (boss ? T.coopBossHealth : T.coopHealth) * (n - 1)));
  const max = Math.round(def.hp * hpMul);
  return baseEntity(G, {
    side: o.side || 'foe', team: o.team ?? 1, kind: type, def, name: o.name || def.name, x, z, y: def.float || 0, hp: max, max,
    power: def.power * tierK(tier, 0.22) * (o.dmgMul || 1) * (ally ? 1 : 1 + T.coopDamage * (n - 1)), cut: def.def / (def.def + 60), boss,
    ai: { think: 0.3 + G.rand() * 0.5, cd: {}, token: false, target: null, strafe: G.rand() < 0.5 ? -1 : 1, wait: 0, phase: 0, angry: null },
    poiseDmg: 0, state: o.team === 0 ? 'idle' : 'enter', enterT: 0.9, dir: -1,
    downMeter: def.down?.resist || 0, meterT: 0, downs: [], guardT: 0, counter: null,
  });
}

export function spawnFoe(G, type, x, z) {
  const def = G.data.enemies.foes[type] || G.data.enemies.bosses[type];
  if (!def) throw new Error(`no foe ${type}`);
  const e = makeFoe(G, type, def, x, z);
  e.dir = x > G.camX ? -1 : 1;
  if (isBig(def)) { e.state = 'idle'; e.hidden = true; e.z = def.home ?? -(DEPTH + 1.6); e.x = clampViewX(G, x, 2); e.homeZ = e.z; }
  G.foes.push(e);
  return e;
}

/**
 * An enemy that climbs out of the ground (hollowborn) or fades in (wraiths): it appears ON the street, not at an
 * edge, never within T.riseClear of a hero (rule 39), and can't be hit or hit anyone until it is up. The renderer gets
 * { type: 'rise', id, x, z, time, how: 'ground' | 'fade' } first and draws the warning.
 */
export function riseFoe(G, type, x, z) {
  const e = spawnFoe(G, type, x, z);
  for (let k = 0; k < 8; k++) {
    const near = G.heroes.find(h => alive(h) && Math.abs(h.x - e.x) < G.T.riseClear && Math.abs(h.z - e.z) < 1.2);
    if (!near) break;
    e.x = clampViewX(G, near.x + (e.x >= near.x ? 1 : -1) * (G.T.riseClear + 0.3 + k * 0.4), 0.8);
  }
  e.state = 'rise'; e.riseT = e.def.rise; e.st = 0;
  G.events.push({ type: 'rise', id: e.id, kind: type, x: e.x, z: e.z, time: e.def.rise, how: e.def.riseHow || 'ground' });
  return e;
}

/** Called-in help: ground-risers climb out on the street (warned), the rest walk in from both edges. */
export function summonFoes(G, list) {
  for (const [i, s] of list.entries()) {
    const d = G.data.enemies.foes[s], side = i % 2 ? -1 : 1;
    if (d?.rise) riseFoe(G, s, G.camX + (G.rand() - 0.5) * (G.T.viewWidth - 3), clamp((G.rand() - 0.5) * 4.4, -DEPTH + 0.3, DEPTH - 0.3));
    else spawnFoe(G, s, G.camX + side * (viewHalf(G) + 1.2), (G.rand() - 0.5) * 4);
  }
}

export const alive = e => e.state !== 'dead' && e.state !== 'out' && e.state !== 'gone' && e.state !== 'calm';
export const hittable = e => alive(e) && e.state !== 'enter' && e.state !== 'rise' && !e.hidden && e.invT <= 0 && e.state !== 'down' && e.state !== 'held' && e.state !== 'thrown';
/** Everyone on the other team who can still be fought. */
export const foesOf = (G, e) => (e.team === 0 ? G.foes.filter(f => f.team === 1) : [...G.heroes, ...G.foes.filter(f => f.team === 0)]).filter(alive);
export const viewHalf = G => G.T.viewWidth / 2;

// ------------------------------------------------------------------------------------------------ the step
export function step(G, inputs = {}) {
  const dt = STEP; G.events.length = 0;
  if (G.over) return G;
  // a pre-boss story scene holds everything (no clock, no moves) until releaseHold(G)
  if (G.hold) { if (!G.hold.go) return G; const sec = G.hold.sec; G.hold = null; bossArrives(G, sec); }
  G.t += dt; G.stats.time += dt;
  if (G.quakeT > 0) G.quakeT -= dt;
  for (const h of G.heroes) {
    const inp = h.ctrl === 'bot' ? botInput(G, h) : (inputs[h.pid] || {});
    h.inputs = inp;
    for (const k of EDGES) { if (inp[k]) h.buf[k] = G.T.inputBuffer + dt; else h.buf[k] = Math.max(0, h.buf[k] - dt); }
    stepHero(G, h, inp, dt);
  }
  for (const f of G.foes) stepFoe(G, f, dt);
  stepShots(G, dt); stepZones(G, dt); stepProps(G, dt);
  separate(G);
  stageStep(G, dt);
  skyStep(G, dt);
  return G;
}

/** The pre-boss scene is over (UI locally; the online host's message on the server; bots and tests at once). */
export function releaseHold(G) { if (G.hold) G.hold.go = true; return G; }

const take = (h, k) => { if (h.buf[k] > 0) { h.buf[k] = 0; return true; } return false; };
const want = (h, k) => h.buf[k] > 0;

function timers(G, e, dt) {
  e.st += dt;
  for (const k of ['stunT', 'invT', 'freezeT', 'slowT', 'guardT']) if (e[k] > 0) e[k] = Math.max(0, e[k] - dt);
  // a knockdown-resist meter fills back up after a quiet spell (enemies.json down.refill)
  if (e.meterT > 0) { e.meterT -= dt; if (e.meterT <= 0 && e.def?.down?.resist) { e.downMeter = e.def.down.resist; G.events.push({ type: 'stagger', id: e.id, what: 'ready', left: e.downMeter, of: e.downMeter }); } }
  if (e.burnT > 0) { e.burnT -= dt; e.burnAcc = (e.burnAcc || 0) + dt; if (e.burnAcc >= 0.5) { e.burnAcc = 0; dealRaw(G, e, Math.max(1, Math.round(e.max * 0.02)), e.burnBy); } }
  if (e.buffs.length) e.buffs = e.buffs.filter(b => (b.until > G.t));
}
const buffSum = (e, k) => e.buffs.reduce((a, b) => a + (b[k] || 0), 0);
const steady = e => e.buffs.some(b => b.steady) || (e.mv && e.mv.steady && e.state === 'move');

function physics(G, e, dt, { friction = 10 } = {}) {
  const T = G.T, flung = e.state === 'air' || e.state === 'thrown', wasAir = flung || e.y > 0.001 || e.vy > 0;
  const floats = e.def?.float && !flung && e.state !== 'down' && e.state !== 'dead';
  const swooping = e.state === 'move' && e.mv?.swoop && e.swoopY != null;   // an interrupted swoop goes back up
  if (floats) e.y += ((swooping ? e.swoopY : e.def.float) - e.y) * Math.min(1, dt * (swooping ? 6 : 3));
  else if (wasAir) { e.vy -= T.gravity * dt; e.y += e.vy * dt; if (e.y <= 0) { e.y = 0; const v = e.vy; e.vy = 0; landed(G, e, v); } }
  e.x += e.vx * dt; e.z = clamp(e.z + e.vz * dt, -DEPTH, DEPTH);
  if (e.y <= 0.001) { const f = Math.max(0, 1 - friction * dt); e.vx *= f; e.vz *= f; }
}

function landed(G, e, v) {
  e.juggle = 0;
  if (e.state === 'air') { e.state = 'down'; e.st = 0; e.vx *= 0.3; G.events.push({ type: 'land', id: e.id, x: e.x, z: e.z, hard: true }); if (e.hp <= 0) killed(G, e); }
  else if (e.state === 'thrown') { const w = e.thrownBy; e.state = 'down'; e.st = 0; e.vx *= 0.2; G.events.push({ type: 'land', id: e.id, x: e.x, z: e.z, hard: true }); deal(G, w, e, { dmg: G.T.throwDamage, down: true, kb: 0 }, { isThrow: true, noReact: true }); }
  else if (e.side === 'hero' && e.state !== 'move') { e.airUsed = false; G.events.push({ type: 'land', id: e.id, x: e.x, z: e.z }); }
  else if (e.state === 'move') { e.airUsed = false; if (e.mvKind === 'air') endMove(G, e); }
}

// ------------------------------------------------------------------------------------------------ heroes
function stepHero(G, h, inp, dt) {
  const T = G.T, C = G.data.classes.classes[h.cls];
  timers(G, h, dt);
  if (h.hs > 0) { h.hs -= dt; return; }
  for (const k in h.cds) if (h.cds[k] > 0) h.cds[k] -= dt;
  if (h.comboT > 0) { h.comboT -= dt; if (h.comboT <= 0) h.combo = 0; }
  if (h.state === 'gone') return;
  if (h.chan && !(h.state === 'move' && h.mv?.channel)) { G.events.push({ type: 'channel', id: h.id, pid: h.pid, on: false }); h.chan = null; }
  if (h.state === 'out') return stepOut(G, h, dt);
  // mana regen always; gear health regen only between fights (owner: regen in a fight "trivialized the game")
  if (alive(h)) {
    h.mp = Math.min(h.mpMax, h.mp + (T.manaRegen + (h.stats.mpRegen || 0)) * dt);
    if (h.stats.regen && G.phase === 'walk') h.hp = Math.min(h.max, h.hp + h.stats.regen * T.regenOutside * dt);
  }
  if (h.brkHeat > 0) h.brkHeat = Math.max(0, h.brkHeat - dt / T.breakerCool);
  if (h.windT > 0) { h.windT -= dt; if (alive(h) && h.state !== 'held') h.x = clampViewX(G, h.x + h.windV * dt, 0.4); }
  // Breaker works from almost anywhere: being surrounded is never being stuck. A panic button, not a strategy: a
  // short cooldown, and each use soon after another costs more health (it still never kills).
  if (take(h, 'breaker') && ['idle', 'move', 'hurt', 'block', 'held', 'dash', 'grab'].includes(h.state)) {
    if ((h.cds.breaker || 0) > 0) G.events.push({ type: 'cooldown', id: h.id, pid: h.pid, spell: 'breaker', left: h.cds.breaker });
    else if (h.hp > 1) { breaker(G, h); return; }
  }

  switch (h.state) {
    case 'hurt':
      if (h.pull) { stepPulled(G, h, dt); return; }
      if (h.stunT <= 0 && h.freezeT <= 0) setIdle(h); physics(G, h, dt); return;
    case 'air': physics(G, h, dt, { friction: 0 }); return;
    case 'down': physics(G, h, dt); if (h.st >= T.knockdownTime) { setIdle(h); h.invT = T.getUpGrace; G.events.push({ type: 'move', id: h.id, anim: 'getup' }); } return;
    case 'held': return;
    case 'move':
      if (h.mv?.channel) { stepChannel(G, h, inp, dt); return; }
      // turn to the held direction during a swing's wind-up and between combo hits (owner #109: stuck facing left)
      if (TURNABLE.has(h.mvKind) && Math.abs(inp.mx || 0) > 0.2 && sgn(inp.mx) !== h.dir && (phaseOf(h) === 'wind' || moveRecovering(h))) turnHero(G, h, sgn(inp.mx));
      stepMove(G, h, dt); physics(G, h, dt, { friction: 6 });
      // chain the combo / cancel into a spell from the recovery part of a move
      if (h.state === 'move' && moveRecovering(h)) {
        if (h.mvKind === 'combo' && want(h, 'attack') && h.combo < C.combo.length) { take(h, 'attack'); if (Math.abs(inp.mx || 0) > 0.2) h.dir = sgn(inp.mx); startCombo(G, h); }
        else if (want(h, 'spell1') || want(h, 'spell2')) { const k = want(h, 'spell1') ? 'spell1' : 'spell2'; take(h, k); castSpell(G, h, h.spells[k === 'spell1' ? 0 : 1], k); }
      }
      return;
    case 'grab': return stepGrab(G, h, inp, dt);
    case 'dash':
      h.dashT -= dt;
      if (h.kitDash) stepDashKit(G, h, h.kitDash);
      if (take(h, 'attack')) { dropCarry(G, h); startMove(G, h, h.pickup ? pickupMove(G, h) : C.dash, 'dash'); return; }
      if (take(h, 'jump') && h.y <= 0) { h.vy = T.jumpSpeed; h.vx = h.dir * T.dashSpeed * 0.8; h.state = 'idle'; return; }
      h.vx = h.dir * T.dashSpeed * h.stats.speed; physics(G, h, dt, { friction: 0 });
      if (h.dashT <= 0) { h.vx *= 0.3; dropCarry(G, h); setIdle(h); }
      return;
    case 'block':
      h.blockT += dt;
      if (!inp.block) { setIdle(h); return; }
      physics(G, h, dt); return;
  }
  // idle / walking / airborne-by-jump
  const air = h.y > 0.001 || h.vy > 0;
  const sp = T.walkSpeed * h.stats.speed * (h.slowT > 0 ? 1 - h.slowK : 1) * (h.freezeT > 0 ? 0 : 1);
  const mx = clamp(inp.mx || 0, -1, 1), mz = clamp(inp.mz || 0, -1, 1);
  if (!air) { h.vx = mx * sp; h.vz = mz * T.depthSpeed * h.stats.speed * (h.slowT > 0 ? 1 - h.slowK : 1); }
  else { h.vx += (mx * sp - h.vx) * Math.min(1, dt * 3); h.vz = mz * T.depthSpeed * 0.5; }
  if (Math.abs(mx) > 0.2 && !air) h.dir = sgn(mx);
  h.anim = air ? 'jump' : (Math.abs(mx) > 0.1 || Math.abs(mz) > 0.1 ? 'walk' : 'idle');
  // actions
  if (air) {
    if (take(h, 'attack') && !h.airUsed) { h.airUsed = true; startMove(G, h, h.pickup ? pickupMove(G, h) : C.air, 'air'); }
    else if ((want(h, 'spell1') || want(h, 'spell2'))) { const k = want(h, 'spell1') ? 'spell1' : 'spell2'; take(h, k); castSpell(G, h, h.spells[k === 'spell1' ? 0 : 1], k); }
  } else if (inp.block && h.freezeT <= 0) { h.state = 'block'; h.blockT = 0; h.st = 0; h.vx = 0; h.vz = 0; G.events.push({ type: 'move', id: h.id, anim: 'block' }); }
  else if (take(h, 'jump')) { h.vy = T.jumpSpeed; G.events.push({ type: 'move', id: h.id, anim: 'jump' }); }
  else if (take(h, 'dash')) { if (Math.abs(mx) > 0.2) h.dir = sgn(mx); startDash(G, h); }
  else if (take(h, 'grab') && !tryPickup(G, h)) { /* nothing on the floor: a grab only happens by walking into someone */ }
  else if (take(h, 'heavy')) { if (h.pickup) throwPickup(G, h); else startMove(G, h, C.heavy, 'heavy'); }
  else if (take(h, 'attack')) { if (h.pickup) startMove(G, h, pickupMove(G, h), 'pickup'); else { h.combo = h.comboT > 0 ? h.combo : 0; startCombo(G, h); } }
  else if (want(h, 'spell1') || want(h, 'spell2')) { const k = want(h, 'spell1') ? 'spell1' : 'spell2'; take(h, k); castSpell(G, h, h.spells[k === 'spell1' ? 0 : 1], k); }
  else if (!air && Math.abs(mx) > 0.2) tryGrab(G, h, dt);
  else h.contactT = 0;
  physics(G, h, dt);
  clampToView(G, h);
}

function setIdle(e) { e.state = 'idle'; e.st = 0; e.mv = null; e.mvKind = null; e.anim = 'idle'; }

// Hero moves a held direction may turn: in their wind-up, and in the recovery before the next combo hit.
const TURNABLE = new Set(['combo', 'heavy', 'pickup', 'dash']);
function turnHero(G, h, dir) {
  h.dir = dir; h.alignZ = null;
  // re-pick the lane to line up with on the new side
  if (phaseOf(h) === 'wind' && h.mv && (h.mv.reach > 0 || h.mv.shot)) {
    let best = null, bd = Infinity;
    for (const o of foesOf(G, h)) { const dx = (o.x - h.x) * h.dir, dz = Math.abs(o.z - h.z); if (dx > -0.2 && dx < (h.mv.reach || 4) + 1.2 && dz < G.T.laneAlign + 0.9 && dx + dz < bd) { bd = dx + dz; best = o; } }
    if (best) h.alignZ = best.z;
  }
}

// ------------------------------------------------------------------------------------------------ dash and block kit
function startDash(G, h) {
  const K = kitMove(G, h, 'dash');
  h.state = 'dash'; h.dashT = 0.32; h.st = 0; h.kitDash = K; h.carry = null; h.dashHit = new Set();
  if (K?.kind === 'teleport') {   // Rift Step: gone and back a few metres on, through anyone in the way
    const from = h.x, to = clampViewX(G, h.x + h.dir * K.dist);
    h.x = to; h.invT = Math.max(h.invT, K.safe); h.dashT = 0.12;
    G.events.push({ type: 'kit', id: h.id, pid: h.pid, move: K.id, kind: K.kind, from, to, z: h.z });
    G.events.push({ type: 'move', id: h.id, anim: 'castPoint', kind: 'teleport', dur: 0.2 });
    if (K.dmg) addZone(G, h, { x: from, z: h.z, r: K.r, delay: 0, def: { dmg: K.dmg, kb: 4, stun: 0.5 }, pw: h.stats.spell + h.stats.power * 0.5 });
    return;
  }
  if (K?.safe) h.invT = Math.max(h.invT, K.safe);
  if (K) G.events.push({ type: 'kit', id: h.id, pid: h.pid, move: K.id, kind: K.kind });
  G.events.push({ type: 'move', id: h.id, anim: 'run', kind: 'dash' });
}
/** Shoulder Charge carries the enemies it meets; Shield Rush knocks them down as it runs through. */
function stepDashKit(G, h, K) {
  if (K.kind === 'teleport') return;
  for (const o of foesOf(G, h)) {
    if (!hittable(o) || h.dashHit.has(o.id)) continue;
    const dx = (o.x - h.x) * h.dir;
    if (dx < -0.1 || dx > 0.95 || Math.abs(o.z - h.z) > 0.7) continue;
    h.dashHit.add(o.id);
    if (K.kind === 'charge' && !o.def?.heavy) { (h.carry ||= []).push(o.id); o.state = 'hurt'; o.stunT = 1; o.st = 0; o.mv = null; if (o.ai) o.ai.token = false; }
    else deal(G, h, o, { dmg: K.dmg, kb: K.kb, down: true, up: 2 }, { pw: h.stats.power });
  }
  for (const id of h.carry || []) { const o = byId(G, id); if (o && alive(o) && o.state === 'hurt') { o.x = h.x + h.dir * 0.8; o.z += (h.z - o.z) * 0.3; o.stunT = Math.max(o.stunT, 0.2); } }
}
function dropCarry(G, h) {
  const K = h.kitDash;
  for (const id of h.carry || []) { const o = byId(G, id); if (o && alive(o)) deal(G, h, o, { dmg: K.dmg, kb: K.kb, up: 3, down: true }, { pw: h.stats.power }); }
  h.carry = null; h.kitDash = null;
}

/** Pulled by a hook: dragged toward the thrower, stunned until close. */
function stepPulled(G, h, dt) {
  const by = byId(G, h.pull.by);
  if (!by || !alive(by)) { h.pull = null; h.stunT = Math.min(h.stunT, 0.2); return; }
  const gap = by.x + by.dir * h.pull.stop - h.x;
  const stepX = sgn(gap) * Math.min(Math.abs(gap), h.pull.speed * dt);
  h.x += stepX; h.z += clamp(by.z - h.z, -h.pull.speed * dt, h.pull.speed * dt); h.y = Math.max(0, h.y - dt * 4);
  h.stunT = Math.max(h.stunT, 0.1);
  if (Math.abs(gap) < 0.05) { h.pull = null; h.stunT = h.pullStun || 0.6; }
}

// ------------------------------------------------------------------------------------------------ channelled spells
/** Iron Gale: spins while the spell button is held, spending mana each second; you can drift slowly while spinning. */
function stepChannel(G, h, inp, dt) {
  const mv = h.mv, c = mv.channel, T = G.T;
  if (h.st < mv.t[0]) { physics(G, h, dt); return; }   // wind-up
  if (!h.chan) { h.chan = { t: 0, tick: 0, anim: 0 }; G.events.push({ type: 'channel', id: h.id, pid: h.pid, spell: mv.id, on: true, fx: mv.fx }); }
  const ch = h.chan, held = inp[h.chanKey];
  const go = (held || ch.t < c.min) && ch.t < c.max && h.mp > 0 && h.freezeT <= 0 && h.state === 'move';
  if (!go) { endChannel(G, h); return; }
  ch.t += dt;
  if (ch.t > c.min) h.mp = Math.max(0, h.mp - c.mpPerSec * dt);
  const mx = clamp(inp.mx || 0, -1, 1), mz = clamp(inp.mz || 0, -1, 1), sp = T.walkSpeed * h.stats.speed * c.speed;
  h.vx = mx * sp; h.vz = mz * T.depthSpeed * h.stats.speed * c.speed;
  if (Math.abs(mx) > 0.2) h.dir = sgn(mx);
  ch.anim -= dt; if (ch.anim <= 0) { ch.anim = 0.45; G.events.push({ type: 'move', id: h.id, anim: mv.anim, kind: 'channel', dur: 0.5, wind: 0 }); }
  ch.tick -= dt;
  if (ch.tick <= 0) {
    ch.tick = c.tick;
    const pw = powerOf(h, { spell: false });
    for (const o of foesOf(G, h)) if ((hittable(o) || o.state === 'air') && Math.hypot(o.x - h.x, (o.z - h.z) * 1.3) <= c.r) deal(G, h, o, { dmg: c.dmg, kb: c.kb, stun: c.stun, up: o.state === 'air' ? 1.5 : 0 }, { pw, noMana: true });
    for (const p of G.props) if (p.type === 'crate' && !p.broken && Math.hypot(p.x - h.x, p.z - h.z) <= c.r) breakCrate(G, p, h);
  }
  physics(G, h, dt, { friction: 0 }); clampToView(G, h);
}
function endChannel(G, h) {
  if (h.chan) G.events.push({ type: 'channel', id: h.id, pid: h.pid, spell: h.mv?.id, on: false });
  h.chan = null; h.vx = 0; h.vz = 0;
  h.state = 'move'; h.mv = { anim: 'ready', t: [0, 0, h.mv?.channel?.rec ?? 0.25] }; h.mvKind = 'chanEnd'; h.st = 0; h.hitSet = new Set(); h.fired = true; h.windMul = 1;
}

function startCombo(G, h) {
  const C = G.data.classes.classes[h.cls];
  const mv = C.combo[Math.min(h.combo, C.combo.length - 1)];
  h.combo = (h.combo + 1);
  startMove(G, h, mv, 'combo');
  if (h.combo >= C.combo.length) h.combo = 0;
}

/** Begin any move (attack, spell, foe attack). Lane-align: nudge up/down toward the foe you face. */
export function startMove(G, e, mv, kind, opts = {}) {
  e.state = 'move'; e.mv = mv; e.mvKind = kind; e.st = 0; e.hitSet = new Set(); e.fired = false; e.finished = false; e.vx = 0; e.vz = 0;
  e.windMul = e.side === 'foe' ? G.T.foeWindup : 1;
  e.alignZ = null;
  if (mv.reach > 0 || mv.shot) {
    let best = null, bd = Infinity;
    for (const o of foesOf(G, e)) {
      const dx = (o.x - e.x) * e.dir, dz = Math.abs(o.z - e.z);
      if (dx > -0.2 && dx < (mv.reach || 4) + 1.2 && dz < G.T.laneAlign + 0.9 && dx + dz < bd) { bd = dx + dz; best = o; }
    }
    if (best) e.alignZ = best.z;
  }
  e.anim = mv.anim;
  G.events.push({ type: 'move', id: e.id, anim: mv.anim, kind, dur: (mv.t[0] * e.windMul) + mv.t[1] + mv.t[2], wind: mv.t[0] * e.windMul, mv: opts.name || mv.id || null });
}
function phaseOf(e) {
  const [a, b, c] = e.mv.t, w = a * (e.windMul || 1);
  if (e.st < w) return 'wind'; if (e.st < w + b) return 'hit'; if (e.st < w + b + c) return 'rec'; return 'end';
}
const moveRecovering = e => phaseOf(e) === 'rec';

function endMove(G, e) {
  if (e.side === 'hero' && e.mvKind === 'combo') e.comboT = G.T.comboWindow;
  if (e.side !== 'hero' && e.ai) e.ai.token = false;
  e.swoopY = null;
  setIdle(e);
}

export function stepMove(G, e, dt) {
  const mv = e.mv, ph = phaseOf(e), T = G.T;
  // a flyer's swoop: it climbs during the wind-up (the tell), dives to head height to hit, then climbs back
  if (mv.swoop) e.swoopY = ph === 'wind' ? e.def.float + 0.7 : ph === 'hit' ? 0.35 : e.def.float;
  // slide forward during wind-up and hit; lane-align during wind-up
  if (mv.move && (ph === 'wind' || ph === 'hit')) e.vx = e.dir * mv.move * (ph === 'hit' ? 1 : 0.35);
  if (e.alignZ != null && ph === 'wind') { const d = e.alignZ - e.z; e.z += clamp(d, -T.laneAlign * dt * 6, T.laneAlign * dt * 6); }
  if (ph === 'hit') {
    if (!e.fired) { e.fired = true; fireMove(G, e, mv); }
    if (mv.reach > 0 && (mv.dmg > 0)) meleeHits(G, e, mv);
    if (mv.beam) beamHits(G, e, mv);
  }
  // a finisher: one burst around you as the hitting part ends (Hundred Cuts)
  if ((ph === 'rec' || ph === 'end') && mv.finish && !e.finished) { e.finished = true; addZone(G, e, { x: e.x + e.dir * (mv.finish.ahead || 0), z: e.z, r: mv.finish.r, delay: 0, def: mv.finish, pw: powerOf(e, mv) }); }
  if (ph === 'end') endMove(G, e);
}

/** Effects that start once when a move's hitting part begins: shots, fans, areas, steps, heals, buffs, zones, rain. */
function fireMove(G, e, mv) {
  const pw = powerOf(e, mv);
  if (mv.shot) fireShot(G, e, mv.shot, 0, pw);
  if (mv.fan) { const n = mv.fan.n; for (let i = 0; i < n; i++) fireShot(G, e, mv.fan, n === 1 ? 0 : (i / (n - 1) - 0.5) * mv.fan.spread, pw); }
  if (mv.aoe) {
    let x = e.x, z = e.z;
    if (mv.aoe.at === 'ahead') x = e.x + e.dir * (mv.aoe.ahead || 4);
    if (mv.aoe.at === 'foe') { const t = targetOf(G, e, mv.aoe.ahead || 99); if (t) { x = t.x; z = t.z; } else x = e.x + e.dir * 3; }
    addZone(G, e, { x, z, r: mv.aoe.r, delay: mv.aoe.delay || 0, def: mv.aoe, pw });
    if (mv.expose) e.exposeAt = { t: G.t + (mv.aoe.delay || 0), x, z: mv.aoe.shape === 'row' ? -DEPTH + 0.35 : z, part: mv.expose.part, time: mv.expose.time };
  }
  // a row of strips across the street, one after another (a claw rake, a wing sweep): each warned
  if (mv.cols) {
    const t = targetOf(G, e, 99), c = mv.cols, x0 = (t ? t.x : e.x) - ((c.n - 1) * c.gap) / 2 * (c.dirX || 1);
    for (let i = 0; i < c.n; i++) addZone(G, e, { x: x0 + i * c.gap * (c.dirX || 1), z: 0, r: c.w / 2, delay: c.delay + i * (c.step || 0), def: { ...c, shape: 'col' }, pw });
  }
  // a wing gust: every hero is pushed along the street (blocking halves it)
  if (mv.gust) {
    const dir = mv.gust.dir || e.dir;
    G.events.push({ type: 'gust', id: e.id, dir, time: mv.gust.time });
    for (const h of G.heroes) if (alive(h)) { h.windT = mv.gust.time; h.windV = dir * mv.gust.push * (h.state === 'block' ? 0.5 : 1); }
  }
  if (mv.expose && !mv.aoe) { const t = targetOf(G, e, 99); e.exposeAt = { t: G.t + (mv.expose.delay || 0), x: t ? t.x : e.x, z: t ? t.z : 0, part: mv.expose.part, time: mv.expose.time }; }
  if (mv.rain) {
    const t = nearestFoe(G, e, 99) || e;
    for (let i = 0; i < mv.rain.n; i++) addZone(G, e, { x: t.x + (G.rand() - 0.5) * mv.rain.spread, z: clamp(t.z + (G.rand() - 0.5) * 4, -DEPTH, DEPTH), r: mv.rain.r, delay: mv.rain.delay + i * 0.12, def: mv.rain, pw });
  }
  if (mv.step) {   // Shadow Step: pass through everyone in front, hitting each
    const from = e.x, to = clampViewX(G, e.x + e.dir * mv.step.dist);
    for (const o of foesOf(G, e)) if (hittable(o) && (o.x - from) * e.dir > -0.3 && (o.x - to) * e.dir < 0.3 && Math.abs(o.z - e.z) < 1.0) {
      deal(G, e, o, mv.step, { pw });
      // the cuts left behind open a moment later where each enemy stood
      if (mv.step.echo) addZone(G, e, { x: o.x, z: o.z, r: mv.step.echo.r, delay: mv.step.echo.delay, def: mv.step.echo, pw });
    }
    e.x = to; e.invT = Math.max(e.invT, 0.3);
  }
  if (mv.heal) for (const o of [...G.heroes, ...G.foes.filter(f => f.team === 0)]) if (alive(o) && o.team === e.team && Math.hypot(o.x - e.x, o.z - e.z) <= mv.heal.r) { const amt = Math.round(o.max * mv.heal.amount + (e.stats?.spell || 0) * 0.5); o.hp = Math.min(o.max, o.hp + amt); G.events.push({ type: 'heal', id: o.id, amount: amt }); }
  if (mv.healFoes) for (const o of G.foes) if (alive(o) && o.team === e.team && o !== e && Math.hypot(o.x - e.x, o.z - e.z) <= mv.healFoes.r) { const amt = Math.round(o.max * mv.healFoes.amount); o.hp = Math.min(o.max, o.hp + amt); G.events.push({ type: 'heal', id: o.id, amount: amt }); }
  if (mv.buff) {
    const who = mv.buff.who === 'party' ? [...G.heroes, ...G.foes.filter(f => f.team === 0)].filter(o => alive(o) && Math.hypot(o.x - e.x, o.z - e.z) <= mv.buff.r) : [e];
    for (const o of who) { o.buffs.push({ ...mv.buff, until: G.t + mv.buff.time, from: mv.name }); G.events.push({ type: 'buff', id: o.id, name: mv.name, time: mv.buff.time }); }
  }
  if (mv.zone) G.zones.push({ id: G.nextId++, kind: 'sanctuary', owner: e.id, team: e.team, x: e.x, z: e.z, r: mv.zone.r, t: 0, life: mv.zone.time, def: mv.zone });
  if (mv.summon) summonFoes(G, mv.summon);
  // a wisp's burst: the blast is the last thing it does
  if (mv.selfDestruct && e.side === 'foe') { e.selfBurst = true; killed(G, e); }
  if (mv.grab) {   // a bruiser's grab: catch the hero in front, slam them down
    const t = meleeTargets(G, e, mv)[0];
    if (t && t.side === 'hero' && t.state !== 'block') { if (t.state === 'grab') releaseGrab(G, t); t.pull = null; t.state = 'held'; t.heldBy = e.id; t.st = 0; e.grabbing = t.id; e.grabSlamT = 0.7; G.events.push({ type: 'grab', id: e.id, target: t.id }); }
  }
}

function powerOf(e, mv) {
  const base = e.side === 'hero' ? (mv.spell ? e.stats.spell : e.stats.power) : e.power;
  return base * (1 + buffSum(e, 'power'));
}

function meleeTargets(G, e, mv) {
  const out = [];
  for (const o of foesOf(G, e)) {
    if (!hittable(o) && o.state !== 'air') continue;
    if (o.invT > 0) continue;
    const dx = (o.x - e.x) * e.dir, dz = Math.abs(o.z - e.z);
    const back = mv.back ? -(mv.reach * 0.8) : -0.35;
    if (dx >= back && dx <= mv.reach + 0.35 && dz <= (mv.depth || 0.75) && o.y < 2.2 + e.y) out.push(o);
  }
  return out;
}

function meleeHits(G, e, mv) {
  const n = mv.hits || 1, [a, b] = mv.t, w = a * (e.windMul || 1);
  const slice = Math.min(n - 1, Math.floor(((e.st - w) / b) * n));
  for (const o of meleeTargets(G, e, mv)) {
    const key = slice + ':' + o.id;
    if (e.hitSet.has(key)) continue;
    e.hitSet.add(key);
    const last = slice === n - 1;
    const hit = { ...mv, dmg: mv.dmg / (n > 1 ? Math.max(1, n * 0.7) : 1), down: mv.down && (last || !mv.lastDown) || (mv.lastDown && last), kb: last ? mv.kb : (mv.kb || 0) * 0.3, up: last ? mv.up : 0 };
    deal(G, e, o, hit, { pw: powerOf(e, mv) });
  }
  // crates break under any hero blow
  if (e.side === 'hero') for (const p of G.props) if (p.type === 'crate' && !p.broken && (p.x - e.x) * e.dir >= -0.3 && (p.x - e.x) * e.dir <= mv.reach + 0.4 && Math.abs(p.z - e.z) < 0.9) breakCrate(G, p, e);
}

function beamHits(G, e, mv) {
  const n = mv.beam.hits, [a, b] = mv.t, w = a * (e.windMul || 1);
  const slice = Math.min(n - 1, Math.floor(((e.st - w) / b) * n));
  for (const o of foesOf(G, e)) {
    if (!hittable(o)) continue;
    const dx = (o.x - e.x) * e.dir;
    if (dx < 0 || dx > mv.beam.len || Math.abs(o.z - e.z) > mv.beam.depth) continue;
    const key = 'b' + slice + ':' + o.id; if (e.hitSet.has(key)) continue; e.hitSet.add(key);
    deal(G, e, o, { dmg: mv.beam.dmg, kb: mv.beam.kb, stun: 0.25 }, { pw: powerOf(e, mv) });
  }
}

/** Who a move aims at: the brain's own target when it can still be fought, else the nearest. */
export function targetOf(G, e, within = 99) {
  const t = e.ai?.target != null ? byId(G, e.ai.target) : null;
  if (t && alive(t) && t.team !== e.team && Math.abs(t.x - e.x) <= within) return t;
  return nearestFoe(G, e, within);
}

export function nearestFoe(G, e, within = 99) {
  let best = null, bd = Infinity;
  for (const o of foesOf(G, e)) { if (!hittable(o) && o.state !== 'air') continue; const d = Math.abs(o.x - e.x) + Math.abs(o.z - e.z) * 0.5; if (d < bd && Math.abs(o.x - e.x) <= within) { bd = d; best = o; } }
  return best;
}

// ------------------------------------------------------------------------------------------------ damage
/**
 * One blow lands. hit = move-like numbers ({ dmg, kb, up, down, stun, guardBreak, freeze, slow, burn }); opts.pw = the
 * attacker's power for this blow; opts.isThrow / isShot change what blocks it; opts.noReact = damage only.
 */
export function deal(G, a, o, hit, opts = {}) {
  if (!o || !alive(o) || o.dying) return 0;
  const T = G.T;
  const from = a ? sgn(o.x - a.x) : -o.dir;          // the side the blow comes from, as seen from the target: o is hit FROM -from
  const facingAttacker = a ? sgn(a.x - o.x) === o.dir : false;
  // blocking hero (kit: Brace blocks from every side and can't be broken; Riposte widens the perfect window and strikes
  // back; Mana Ward spends mana instead of health)
  const bk = o.side === 'hero' && o.state === 'block' ? kitMove(G, o, 'block') : null;
  const braced = bk?.kind === 'brace';
  if (o.side === 'hero' && o.state === 'block' && (facingAttacker || braced) && (!hit.guardBreak || braced) && !opts.isThrow && !opts.ground) {
    const perfectWin = bk?.kind === 'parry' ? bk.window : T.perfectBlock;
    if (o.blockT <= perfectWin && a && a.state === 'move' && facingAttacker) {
      a.stunT = 0.9; a.state = 'hurt'; a.st = 0; a.mv = null; if (a.ai) a.ai.token = false;
      G.events.push({ type: 'perfect', id: o.id, by: a.id });
      if (bk?.kind === 'parry' && alive(a)) {
        G.events.push({ type: 'riposte', id: o.id, pid: o.pid, by: a.id, move: bk.id });
        G.events.push({ type: 'move', id: o.id, anim: 'parry', kind: 'riposte', dur: 0.35, wind: 0.05 });
        deal(G, o, a, { dmg: bk.dmg, kb: bk.kb, up: 3, down: true }, { pw: o.stats.power });
      }
      return 0;
    }
    if (bk?.kind === 'ward' && o.mp >= bk.mp) {
      o.mp -= bk.mp; o.vx = from * (hit.kb || 1) * 0.2;
      G.events.push({ type: 'block', id: o.id, by: a?.id, dmg: 0, x: o.x, y: 1.1, z: o.z, ward: true });
      return 0;
    }
    const cut = Math.min(0.95, T.blockCut + (o.stats.blockCut || 0));
    const dmg = Math.max(1, Math.round(rawDamage(G, a, o, hit, opts) * (1 - cut)));
    o.hp = Math.max(1, o.hp - dmg); o.vx = from * (hit.kb || 1) * 0.3;
    const bh = o.stats.effects.find(f => f.id === 'blockheal'); if (bh) o.hp = Math.min(o.max, o.hp + Math.round(o.max * bh.amount));
    G.events.push({ type: 'block', id: o.id, by: a?.id, dmg, x: o.x, y: 1.1, z: o.z });
    return dmg;
  }
  // Shield Rush: a dashing Warden's shield stops shots from the front
  if (o.side === 'hero' && o.state === 'dash' && o.kitDash?.kind === 'rush' && facingAttacker && opts.isShot) {
    G.events.push({ type: 'block', id: o.id, by: a?.id, dmg: 0, x: o.x, y: 1.1, z: o.z });
    return 0;
  }
  // Shield Wall: a blocking Warden covers partners standing just behind them
  if (o.side === 'hero' && o.state !== 'block' && a && !hit.guardBreak && !opts.isThrow && !opts.ground) {
    const w = G.heroes.find(q => q !== o && q.state === 'block' && alive(q) && kitMove(G, q, 'block')?.kind === 'wall' && sgn(a.x - q.x) === q.dir
      && (o.x - q.x) * q.dir < 0.2 && Math.abs(o.x - q.x) <= kitMove(G, q, 'block').r && Math.abs(o.z - q.z) <= 1.2);
    if (w) {
      const cut = Math.min(0.95, T.blockCut + (w.stats.blockCut || 0));
      const dmg = Math.max(1, Math.round(rawDamage(G, a, o, hit, opts) * (1 - cut)));
      o.hp = Math.max(1, o.hp - dmg);
      G.events.push({ type: 'block', id: o.id, by: a.id, dmg, x: o.x, y: 1.1, z: o.z, wall: w.id });
      return dmg;
    }
  }
  // an enemy that has just got up with its guard raised (enemies.json down.guard) turns aside everything from the front
  if (o.side !== 'hero' && o.guardT > 0 && facingAttacker && !opts.isThrow) {
    const dmg = Math.max(1, Math.round(rawDamage(G, a, o, hit, opts) * 0.1));
    o.hp = Math.max(1, o.hp - dmg);
    G.events.push({ type: 'shieldblock', id: o.id, by: a?.id, dmg, x: o.x, y: 1.1, z: o.z, guard: true });
    if (a && a.side === 'hero' && a.state === 'move') a.hs = 0.08;
    return dmg;
  }
  // shield-bearing foe: frontal light blows bounce off
  if (o.def?.shield === 'front' && facingAttacker && !hit.guardBreak && !opts.isThrow && !hit.pierce && o.state !== 'hurt' && o.state !== 'air' && o.state !== 'move') {
    const dmg = Math.max(1, Math.round(rawDamage(G, a, o, hit, opts) * 0.1));
    o.hp = Math.max(1, o.hp - dmg);
    G.events.push({ type: 'shieldblock', id: o.id, by: a?.id, dmg, x: o.x, y: 1.1, z: o.z });
    if (a && a.side === 'hero' && a.state === 'move') a.hs = 0.08;
    return dmg;
  }
  if (a) o.lastHitBy = a.id;
  let dmg = rawDamage(G, a, o, hit, opts);
  let crit = false;
  if (a?.side === 'hero' && G.rand() * 100 < a.stats.crit) { crit = true; dmg *= 1.6; }
  if (o.freezeT > 0 && o.shatterK && a?.side === 'hero') dmg *= 1 + o.shatterK;   // Frost Ring: frozen enemies take more
  dmg = Math.max(1, Math.round(dmg));
  o.hp -= dmg;
  G.stats.damage[a?.pid || a?.id] = (G.stats.damage[a?.pid || a?.id] || 0) + dmg;
  G.events.push({ type: 'hit', id: o.id, by: a?.id, dmg, crit, x: o.x, y: o.y + 1.1, z: o.z, heavy: !!(hit.down || hit.up > 3) });
  // Iron Skin's thorns: whoever strikes you in melee takes some back
  if (o.side === 'hero' && a && a.side !== 'hero' && !opts.isShot && !opts.thorns) { const th = buffSum(o, 'thorns'); if (th > 0 && alive(a)) deal(G, o, a, { dmg: th, kb: 2, stun: 0.3 }, { pw: o.stats.power, thorns: true, noMana: true }); }
  if (a?.side === 'hero') {
    if (!opts.noMana) a.mp = Math.min(a.mpMax, a.mp + T.manaOnHit);
    const lee = a.stats.effects.find(f => f.id === 'leech'); if (lee) a.hp = Math.min(a.max, a.hp + Math.max(1, Math.round(dmg * lee.amount)));
    const echo = a.stats.effects.find(f => f.id === 'echo'); if (echo && !opts.echo && G.rand() < echo.chance && o.hp > 0) deal(G, a, o, { ...hit, kb: 0, up: 0, down: false }, { ...opts, echo: true });
    const sw = a.stats.effects.find(f => f.id === 'shockwave'); if (sw && hit.down && !opts.wave) for (const q of foesOf(G, a)) if (q !== o && hittable(q) && Math.hypot(q.x - o.x, q.z - o.z) < sw.r) deal(G, a, q, { dmg: sw.dmg, kb: 4, down: true }, { ...opts, wave: true, pw: opts.pw });
  }
  // hit pause on solid blows
  if (hit.down || hit.up > 3 || crit) { o.hs = T.hitStop; if (a) a.hs = T.hitStop; }
  if (hit.freeze) { o.freezeT = Math.max(o.freezeT, hit.freeze); o.shatterK = hit.shatter || 0; }
  if (hit.slow) { o.slowT = 2; o.slowK = hit.slow; }
  if (hit.burn) { o.burnT = hit.burn; o.burnBy = a; }
  // a fight that ends when she calms down (Ossmara, Maddened): no death, the section is won
  if (o.def?.calmAt && o.team === 1 && o.hp <= o.max * o.def.calmAt) { o.hp = Math.max(1, Math.round(o.max * o.def.calmAt)); calmDown(G, o); return dmg; }
  if (o.def && isBig(o.def)) { if (o.hp <= 0) { o.hp = 0; killed(G, o); } return dmg; }   // a body too big to knock about
  if (o.hp <= 0) { o.hp = 0; react(G, a, o, { ...hit, down: true, up: Math.max(hit.up || 0, 4), kb: Math.max(hit.kb || 0, 4) }, from); if (o.state !== 'air') killed(G, o); else o.dying = true; return dmg; }
  if (!opts.noReact) react(G, a, o, hit, from, opts);
  return dmg;
}

function rawDamage(G, a, o, hit, opts) {
  const pw = opts.pw ?? (a ? (a.side === 'hero' ? a.stats.power : a.power) : 10);
  let d = pw * (hit.dmg ?? 1);
  if (a && a.side !== 'hero' && o.side === 'hero') d *= G.T.foeDamage;
  const cut = o.side === 'hero' ? o.stats.cut : o.cut;
  const guard = buffSum(o, 'guard');
  return d * (1 - cut) * (1 - Math.min(0.8, guard));
}

function dealRaw(G, o, dmg, by) {
  if (!alive(o)) return;
  o.hp -= dmg; G.events.push({ type: 'hit', id: o.id, by: by?.id, dmg, x: o.x, y: o.y + 1.1, z: o.z, burn: true });
  if (o.hp <= 0) { o.hp = 0; if (o.side === 'hero') heroDown(G, o); else killed(G, o); }
}

function react(G, a, o, hit, from, opts = {}) {
  // release grabs either way
  if (o.state === 'grab') releaseGrab(G, o);
  if (o.grabbing) dropHeld(G, o);
  // heavy foes and steady heroes shrug off light hits
  if (o.side !== 'hero' && o.def?.poise) {
    o.poiseDmg += hit.dmg || 1;
    if (!hit.guardBreak && !hit.down && o.poiseDmg * (o.power || 10) < o.def.poise * 6) { G.events.push({ type: 'armor', id: o.id }); return; }
    if (o.boss && !hit.guardBreak && o.poiseDmg * 10 < o.def.poise * 3 && o.state === 'move') { G.events.push({ type: 'armor', id: o.id }); return; }
    o.poiseDmg = 0;
  }
  if (o.side === 'hero' && steady(o)) return;
  if (o.state === 'move' && o.ai) o.ai.token = false;
  const kb = hit.kb || 0, airborne = o.y > 0.05 || o.state === 'air';
  // knockdown kinds (enemies.json `down`): some soak knockdowns on a meter, some stay standing, bosses have a limit
  if ((hit.down || (hit.up || 0) > 0) && !airborne && o.side !== 'hero' && o.def?.down && !o.dying && o.hp > 0 && !downAllowed(G, o, hit, opts)) {
    const stand = o.def.down.stand;
    o.state = 'hurt'; o.st = 0; o.mv = null; o.stunT = stand ? 0.4 : 0.25; o.vx = from * Math.max(kb, 2) * (stand ? 0.8 : 0.3); o.anim = 'hit';
    return;
  }
  if (hit.down || airborne || (hit.up || 0) > 0) {
    const big = o.def?.heavy && !hit.guardBreak && !o.dying && o.hp > 0;
    if (big && !hit.down) { o.state = 'hurt'; o.stunT = hit.stun || 0.3; o.st = 0; o.vx = from * kb * 0.3; return; }
    o.state = 'air'; o.st = 0; o.mv = null;
    // juggles: each air hit lifts less, and after three the body just falls
    o.juggle = airborne ? (o.juggle || 0) + 1 : 0;
    const lift = o.juggle >= 3 ? 0 : (hit.up || 3) * (big ? 0.5 : (airborne ? 0.75 / (1 + o.juggle * 0.5) : 1));
    o.vy = airborne ? Math.min(o.vy, 0) * 0.5 + lift : lift;
    if (o.y <= 0) o.y = 0.01;
    o.vx = from * Math.max(kb, 2) * (big ? 0.5 : 1);
    o.anim = 'hit';
  } else {
    o.state = 'hurt'; o.st = 0; o.mv = null; o.stunT = hit.stun || 0.3; o.vx = from * kb * 0.6; o.anim = 'hit';
  }
}

/**
 * May this blow knock the enemy down? Reads enemies.json `down`: { resist: knockdowns soaked before it falls (Heavy,
 * throws and Breaker count 2), refill: s until the meter is full again, stand: knocked back but stays up while the
 * meter holds (or always, with no meter), limit + window: at most `limit` knockdowns in `window` s (bosses) }.
 * Each refusal is a `stagger` event the renderer shows (what: resist | break | stand | limit).
 */
function downAllowed(G, o, hit, opts) {
  const K = o.def.down, ev = what => G.events.push({ type: 'stagger', id: o.id, what, left: o.downMeter, of: K.resist || 0, x: o.x, z: o.z });
  if (K.limit) {
    o.downs = o.downs.filter(t => G.t - t < K.window);
    if (o.downs.length >= K.limit) { ev('limit'); return false; }
  }
  if (K.resist) {
    if (o.downMeter > 0) {
      o.downMeter = Math.max(0, o.downMeter - (hit.guardBreak || opts.isThrow ? 2 : 1));
      o.meterT = K.refill;
      if (o.downMeter > 0) { ev('resist'); return false; }
      ev('break');
    }
  } else if (K.stand) { ev('stand'); return false; }
  if (K.limit) o.downs.push(G.t);
  return true;
}

function killed(G, o) {
  if (o.side === 'hero') return heroDown(G, o);
  if (o.state === 'dead') return;
  o.state = 'dead'; o.st = 0; o.hp = 0; o.ai && (o.ai.token = false); o.hidden = false;
  if (o.team === 0) return;   // the ally just falls
  G.stats.kills++;
  const def = o.def;
  G.events.push({ type: 'kill', id: o.id, kind: o.kind, boss: o.boss, x: o.x, z: o.z, burst: !!o.selfBurst });
  if (def.deathBurst) addZone(G, o, { x: o.x, z: o.z, r: def.deathBurst.r, delay: def.deathBurst.delay, def: def.deathBurst, pw: o.power, team: 1 });
  reward(G, o);
  // a pair boss: the one left standing fights harder
  if (o.boss && (def.partner || def.pairOf)) for (const p of G.foes) if (p !== o && p.boss && alive(p) && p.team === 1 && (p.kind === def.partner || p.kind === def.pairOf)) {
    p.power *= 1 + (G.T.pairEnrage ?? 0.25); G.events.push({ type: 'enrage', id: p.id, by: o.id });
  }
}

/** Ossmara, Maddened: at def.calmAt of her health the fight is over — no kill, the heroes still get the boss rewards. */
function calmDown(G, o) {
  if (o.state === 'calm') return;
  o.state = 'calm'; o.st = 0; o.mv = null; o.hidden = false; o.ai && (o.ai.token = false);
  G.events.push({ type: 'calm', id: o.id, kind: o.kind, boss: o.boss, x: o.x, z: o.z });
  for (const z of G.zones) if (z.owner === o.id) z.done = true;   // her fire stops with her
  reward(G, o);
}

/** Experience, gold, loot — every hero gets their own share and their own roll. */
function reward(G, o) {
  const def = o.def;
  for (const h of G.heroes) {
    if (h.state === 'gone') continue;
    // co-op waves are bigger (stage.js waveFor), so each kill is worth a matching share: a chapter gives the same xp
    const xp = Math.round(def.xp * G.T.xpScale / (o.boss ? 1 : 1 + G.T.coopFoes * (heroCount(G) - 1))); h.xp += xp; h.xpGained += xp;
    const [g0, g1] = def.gold || [0, 0], gold = Math.round(g0 + (g1 - g0) * G.rand()); h.gold += gold;
    G.events.push({ type: 'xp', pid: h.pid, amount: xp }); if (gold) G.events.push({ type: 'gold', pid: h.pid, amount: gold, x: o.x, z: o.z });
    const lv = levelFor(G.data.classes, h.xp);
    if (lv > h.level) levelUp(G, h, lv);
    if (o.boss) dropFor(G, h, { minRarity: 'rare', bossSet: true }, o);
    else if (G.rand() < G.T.dropChance * (def.heavy ? 2 : 1)) dropFor(G, h, {}, o);
  }
  const killer = G.heroes.find(h => h.id === o.lastHitBy); if (killer) killer.kills++;
}

export function levelUp(G, h, lv) {
  const was = h.level;
  h.level = lv;
  const st = heroStats(G.data.classes, G.data.items, { cls: h.cls, level: lv, gear: h.gear });
  const dhp = st.hp - h.max; h.stats = st; h.max = st.hp; h.mpMax = st.mp; h.hp = Math.min(h.max, h.hp + dhp + Math.round(h.max * 0.25));
  // learnedMove: the dash/block upgrade(s) this level brings, by name, for the level-up banner (null when none)
  const moves = kitLearned(G.data.classes, h.cls, was, lv), C = G.data.classes;
  const spells = C.classes[h.cls].spells.filter(id => C.spells[id].level > was && C.spells[id].level <= lv).map(id => C.spells[id].name);
  G.events.push({ type: 'levelUp', pid: h.pid, id: h.id, level: lv, learnedMove: moves.map(k => k.name).join(' and ') || null, learnedSpell: spells.join(' and ') || null });
}

function dropFor(G, h, { minRarity = 'common', bossSet = false }, o) {
  const it = rollItem(G.data.items, { chapter: G.tier, cls: h.cls, rand: G.rand, minRarity });
  if (it) G.events.push({ type: 'loot', pid: h.pid, item: it, x: o.x, z: o.z, boss: bossSet });
  // a boss also has a small chance at this chapter's legendary for your class
  if (bossSet) {
    const leg = G.data.items.items.find(b => b.legendary && b.chapter <= G.tier && b.cls.includes(h.cls) && b.slot !== 'trinket');
    const legT = G.data.items.items.filter(b => b.legendary && b.slot === 'trinket' && b.chapter <= G.tier);
    if (leg && G.rand() < 0.25) G.events.push({ type: 'loot', pid: h.pid, item: rollItem(G.data.items, { chapter: G.tier, base: leg.id, rand: G.rand }), x: o.x, z: o.z, boss: true });
    else if (legT.length && G.rand() < 0.12) G.events.push({ type: 'loot', pid: h.pid, item: rollItem(G.data.items, { chapter: G.tier, base: legT[Math.floor(G.rand() * legT.length)].id, rand: G.rand }), x: o.x, z: o.z, boss: true });
  }
}

// ------------------------------------------------------------------------------------------------ heroes down, revive, lives
function heroDown(G, h) {
  if (h.state === 'out' || h.state === 'gone') return;
  if (h.state === 'grab') releaseGrab(G, h);
  // dying marks a body still in the air; a hero who is down is no longer dying. Leaving it set made a revived hero
  // untouchable for good (owner #112: Breaker to 1 health, fell, came back, and nothing could hit them).
  h.dying = false; h.pull = null; h.carry = null; h.kitDash = null; h.juggle = 0;
  h.state = 'out'; h.st = 0; h.hp = 0; h.downClock = G.T.downTime; h.reviveT = 0; h.vx = 0; h.vz = 0; h.pickup = null;
  G.events.push({ type: 'heroDown', id: h.id, pid: h.pid });
}
function stepOut(G, h, dt) {
  physics(G, h, dt);
  const helpers = [...G.heroes, ...G.foes.filter(f => f.team === 0)].filter(o => o !== h && alive(o) && o.state !== 'move' && Math.hypot(o.x - h.x, o.z - h.z) < 1.3);
  if (helpers.length) { h.reviveT += dt; if (h.reviveT >= G.T.reviveTime) { h.state = 'idle'; h.hp = Math.round(h.max * 0.4); h.invT = G.T.respawnGrace; G.events.push({ type: 'revive', id: h.id, pid: h.pid, by: helpers[0].id }); return; } }
  else h.reviveT = Math.max(0, h.reviveT - dt);
  h.downClock -= dt;
  if (h.downClock <= 0) {
    h.lives--;
    G.events.push({ type: 'lifeLost', id: h.id, pid: h.pid, lives: h.lives });
    if (h.lives > 0) {
      h.state = 'idle'; h.hp = h.max; h.mp = h.mpMax; h.invT = G.T.respawnGrace; h.y = 2.5; h.vy = 0.1;
      G.events.push({ type: 'respawn', id: h.id, pid: h.pid });
    } else { h.state = 'gone'; G.events.push({ type: 'gone', id: h.id, pid: h.pid }); }
  }
}

/** Breaker's health cost right now: the base share, plus T.breakerRamp for each recent use (heat cools by 1 every T.breakerCool s). */
export const breakerCostOf = (G, h) => Math.round(h.max * (G.T.breakerCost + G.T.breakerRamp * h.brkHeat));
function breaker(G, h) {
  const cost = breakerCostOf(G, h);
  h.hp = Math.max(1, h.hp - cost);
  h.brkHeat += 1; h.cds.breaker = G.T.breakerCooldown;
  h.pull = null; dropCarry(G, h);
  if (h.state === 'grab') releaseGrab(G, h);
  if (h.state === 'held') { const g = G.foes.find(f => f.id === h.heldBy); if (g) dropHeld(G, g); }
  setIdle(h); h.invT = 0.45; h.y = 0; h.vy = 0;
  G.events.push({ type: 'breaker', id: h.id, cost, x: h.x, z: h.z });
  G.events.push({ type: 'move', id: h.id, anim: 'whirl', kind: 'breaker', dur: 0.45 });
  for (const o of foesOf(G, h)) if (hittable(o) && Math.hypot(o.x - h.x, (o.z - h.z) * 1.3) <= G.T.breakerRadius) deal(G, h, o, { dmg: 1.0, kb: 6, up: 5, down: true, guardBreak: true }, { pw: h.stats.power });
  h.state = 'move'; h.mv = { anim: 'whirl', t: [0, 0.15, 0.3] }; h.mvKind = 'breaker'; h.st = 0; h.hitSet = new Set(); h.fired = true; h.windMul = 1;
}

// ------------------------------------------------------------------------------------------------ spells
export function spellReady(G, h, id) {
  const S = G.data.classes.spells[id];
  if (!S) return { ok: false, why: 'none' };
  if (S.level > h.level) return { ok: false, why: 'level' };
  if ((h.cds[id] || 0) > 0) return { ok: false, why: 'cooldown', left: h.cds[id] };
  if (h.mp < S.mp) return { ok: false, why: 'mana' };
  return { ok: true };
}
function castSpell(G, h, id, key = 'spell1') {
  const r = spellReady(G, h, id);
  if (!r.ok) { G.events.push({ type: r.why === 'mana' ? 'nomana' : 'cooldown', id: h.id, pid: h.pid, spell: id }); return false; }
  const S = G.data.classes.spells[id];
  h.mp -= S.mp; h.cds[id] = S.cd;
  const mv = { ...S, spell: true, id };
  // Staff of Three Flames: Fire Bolt splits
  if (id === 'fire_bolt' && h.stats.effects.some(f => f.id === 'splitbolt')) { mv.fan = { ...S.shot, n: 3, spread: 1.4 }; delete mv.shot; }
  h.chan = null; h.chanKey = key + 'Held';
  startMove(G, h, mv, 'spell', { name: S.name });
  G.events.push({ type: 'spell', id: h.id, pid: h.pid, spell: id, fx: S.fx });
  return true;
}

// ------------------------------------------------------------------------------------------------ grabs and throws
const grabbable = o => o.side === 'foe' && !o.def.heavy && !o.def.float && (o.state === 'idle' || o.state === 'hurt') && o.y < 0.1 && o.invT <= 0;
function tryGrab(G, h, dt) {
  const o = G.foes.find(f => f.team === 1 && alive(f) && grabbable(f) && (f.x - h.x) * h.dir > 0 && (f.x - h.x) * h.dir < 0.95 && Math.abs(f.z - h.z) < 0.5);
  if (!o) { h.contactT = 0; return; }
  h.contactT += dt;
  if (h.contactT < 0.12) return;
  h.contactT = 0; h.state = 'grab'; h.grab = o.id; h.grabT = 0; h.st = 0; h.grabHits = 0; h.vx = 0; h.vz = 0;
  o.state = 'held'; o.heldBy = h.id; o.st = 0; o.mv = null; o.ai.token = false; o.dir = -h.dir;
  G.events.push({ type: 'grab', id: h.id, target: o.id });
}
function stepGrab(G, h, inp, dt) {
  const C = G.data.classes.classes[h.cls];
  const o = G.foes.find(f => f.id === h.grab);
  if (!o || !alive(o) || o.state !== 'held') { releaseGrab(G, h); return; }
  h.grabT += dt;
  o.x = h.x + h.dir * 0.75; o.z = h.z; o.y = 0;
  if (h.grabMoveT > 0) { h.grabMoveT -= dt; return; }
  const back = (inp.mx || 0) * h.dir < -0.5;
  if (take(h, 'heavy') || (back && take(h, 'attack')) || h.grabHits >= 3) { doThrow(G, h, o, back ? -h.dir : h.dir); return; }
  if (take(h, 'attack')) {
    h.grabHits++; h.grabMoveT = C.grabHit.t[0] + C.grabHit.t[1] + C.grabHit.t[2];
    G.events.push({ type: 'move', id: h.id, anim: C.grabHit.anim, kind: 'grabHit', dur: h.grabMoveT });
    deal(G, h, o, { ...C.grabHit, stun: 0.3, kb: 0 }, { pw: h.stats.power, noReact: true });
    if (o.hp <= 0) { releaseGrab(G, h); return; }
    o.state = 'held';
    return;
  }
  if (h.grabT >= G.T.grabHold) { releaseGrab(G, h); o.state = 'hurt'; o.stunT = 0.2; o.vx = h.dir * 3; }
}
function doThrow(G, h, o, dir) {
  h.dir = dir; h.state = 'move'; h.mv = { anim: 'throw', t: [0.05, 0.1, 0.3] }; h.mvKind = 'throw'; h.st = 0; h.hitSet = new Set(); h.fired = true; h.windMul = 1;
  h.grab = null;
  o.state = 'thrown'; o.heldBy = null; o.thrownBy = h; o.vx = dir * G.T.throwSpeed; o.vy = 4.5; o.y = 0.6; o.x = h.x + dir * 0.6; o.dir = -dir; o.st = 0; o.throwHit = new Set();
  G.events.push({ type: 'throw', id: h.id, target: o.id, dir });
  G.events.push({ type: 'move', id: h.id, anim: 'throw', kind: 'throw', dur: 0.45 });
}
function releaseGrab(G, h) {
  const o = G.foes.find(f => f.id === h.grab);
  if (o && o.state === 'held') { o.state = 'hurt'; o.stunT = 0.2; o.heldBy = null; }
  h.grab = null; if (h.state === 'grab') setIdle(h);
}
function dropHeld(G, f) {
  const t = G.heroes.find(h => h.id === f.grabbing);
  if (t && t.state === 'held') { t.state = 'idle'; t.heldBy = null; t.invT = 0.5; }
  f.grabbing = null;
}

// ------------------------------------------------------------------------------------------------ foes
function stepFoe(G, f, dt) {
  timers(G, f, dt);
  if (f.hs > 0) { f.hs -= dt; return; }
  if (f.state === 'calm' || f.state === 'dead') { f.vx *= 0.9; return; }
  if (isBig(f.def)) return stepBig(G, f, dt);
  if (f.boss && f.team === 1) { bossHazards(G, f, dt); if (f.state !== 'enter') bossPhaseCheck(G, f); }
  switch (f.state) {
    case 'rise': f.riseT -= dt; f.anim = 'idle'; if (f.riseT <= 0) { f.state = 'idle'; f.st = 0; f.invT = 0; } return;
    case 'enter': {   // walk in from the screen edge
      const target = clamp(f.x, G.camX - viewHalf(G) + 1.2, G.camX + viewHalf(G) - 1.2);
      f.dir = sgn(target - f.x); f.x += f.dir * Math.min(Math.abs(target - f.x), f.def.speed * dt * 1.2); f.anim = 'walk';
      f.enterT -= dt; if (Math.abs(target - f.x) < 0.05 || f.enterT <= -2) { f.state = 'idle'; f.st = 0; }
      return;
    }
    case 'held': return;
    case 'thrown': {
      physics(G, f, dt, { friction: 0 });
      for (const o of G.foes) if (o !== f && o.team === 1 && hittable(o) && !f.throwHit.has(o.id) && Math.abs(o.x - f.x) < 0.9 && Math.abs(o.z - f.z) < 0.8) {
        f.throwHit.add(o.id); deal(G, f.thrownBy, o, { dmg: G.T.throwDamage, kb: 7, up: 4, down: true }, { isThrow: true });
      }
      if (f.state === 'thrown' && Math.abs(f.x - G.camX) > viewHalf(G) + 0.5) { f.x = clamp(f.x, G.camX - viewHalf(G) + 0.3, G.camX + viewHalf(G) - 0.3); f.vx = -f.vx * 0.3; }
      return;
    }
    case 'air': physics(G, f, dt, { friction: 0 }); clampToView(G, f, 0.2); return;
    case 'down': physics(G, f, dt); if (f.dying) { killed(G, f); return; } if (f.st >= G.T.knockdownTime * (f.def.down?.getUp ?? (f.boss ? 0.6 : 1))) getUp(G, f); return;
    case 'hurt': physics(G, f, dt); clampToView(G, f, 0.3); if (f.stunT <= 0 && f.freezeT <= 0) setIdle(f); return;
    case 'move':
      if (f.grabbing) {   // holding a hero: slam them after a moment
        const t = G.heroes.find(h => h.id === f.grabbing);
        f.grabSlamT -= dt;
        if (!t || t.state !== 'held') { f.grabbing = null; }
        else { t.x = f.x + f.dir * 0.8; t.z = f.z; t.y = 0.4; if (f.grabSlamT <= 0) { t.state = 'idle'; t.heldBy = null; t.y = 0; f.grabbing = null; deal(G, f, t, { dmg: f.mv.dmg || 2, kb: 6, up: 5, down: true }, {}); } }
      }
      stepMove(G, f, dt); physics(G, f, dt, { friction: 6 }); if (G.phase === 'fight') clampToView(G, f, 0.5); return;
  }
  // a counter-attack queued on getting up starts once the raised guard drops (its wind-up still shows — rule 39)
  if (f.counter && f.guardT <= 0 && f.team === 1) { const m = f.def.moves.find(x => x.id === f.counter); f.counter = null; const t = nearestFoe(G, f, 6); if (m && t) { f.dir = sgn(t.x - f.x); startMove(G, f, m, 'foe', { name: m.id }); return; } }
  // idle: the brain picks what to do
  thinkFoe(G, f, dt);
  physics(G, f, dt);
  if (G.phase === 'fight') clampToView(G, f, 0.7);   // nobody hides past the edge of a locked screen
}

/**
 * Arena hazards a boss keeps dropping on the street while it lives (def.hazards: [{ every, n, r, delay, dmg, phase,
 * shape, len, look, leave }]): warned circles or strips at random spots near the heroes, never on top of one with no
 * warning (rule 39). Its clock keeps running while the boss is busy.
 */
export function bossHazards(G, f, dt) {
  const list = f.def.hazards; if (!list) return;
  f.hzT ||= list.map(() => 0);
  list.forEach((H, i) => {
    if ((H.phase || 0) > (f.ai?.phase || 0)) return;
    f.hzT[i] += dt; if (f.hzT[i] < H.every) return; f.hzT[i] = 0;
    const heroes = G.heroes.filter(alive);
    for (let k = 0; k < H.n; k++) {
      const h = heroes.length ? heroes[Math.floor(G.rand() * heroes.length)] : null;
      const x = h && k === 0 ? h.x : G.camX + (G.rand() - 0.5) * (G.T.viewWidth - 2);
      const z = h && k === 0 ? h.z : (G.rand() - 0.5) * 2 * (DEPTH - 0.3);
      addZone(G, f, { x, z, r: H.r, delay: H.delay + k * 0.15, def: H, pw: f.power });
    }
  });
}

/** An enemy stands up: some raise their guard for a moment, some swing straight back (enemies.json down.guard / counter). */
function getUp(G, f) {
  setIdle(f); f.invT = G.T.getUpGrace;
  const K = f.def.down; if (!K) return;
  if (K.guard) { f.guardT = K.guard; G.events.push({ type: 'stagger', id: f.id, what: 'guard', time: K.guard, x: f.x, z: f.z }); }
  if (K.counter) { f.counter = K.counter; G.events.push({ type: 'stagger', id: f.id, what: 'counter', move: K.counter, x: f.x, z: f.z }); }
}

// ------------------------------------------------------------------------------------------------ shots, zones, props
export function fireShot(G, e, def, zOff = 0, pw) {
  const s = {
    id: G.nextId++, owner: e.id, team: e.team, x: e.x + e.dir * 0.6, y: def.dive ? Math.max(0.6, e.y + 1.0) : 1.1 + (e.def?.float || 0) * 0.3,
    z: clamp(e.z + zOff, -DEPTH, DEPTH), vx: e.dir * def.speed, vy: def.dive ? -6 : 0, dir: e.dir, gone: 0, def, pw: pw ?? powerOf(e, {}),
    hitSet: new Set(), look: def.look, seek: def.seek || 0,
  };
  G.shots.push(s);
  G.events.push({ type: 'shot', id: s.id, owner: e.id, look: def.look, x: s.x, z: s.z });
  return s;
}
function stepShots(G, dt) {
  for (const s of G.shots) {
    const owner = byId(G, s.owner);
    if (s.seek) { const t = owner && nearestFoe(G, owner, 99); if (t) s.z += clamp(t.z - s.z, -s.seek * dt * 2, s.seek * dt * 2); }
    s.x += s.vx * dt; s.y = Math.max(0.3, s.y + s.vy * dt); s.gone += Math.abs(s.vx) * dt;
    if (s.gone > s.def.range) { s.dead = true; if (s.def.burst) burst(G, s, owner); if (s.def.leave) leaveHazard(G, s, owner); continue; }
    const targets = s.team === 1 ? [...G.heroes, ...G.foes.filter(f => f.team === 0)] : G.foes.filter(f => f.team === 1);
    for (const o of targets) {
      if (!hittable(o) && o.state !== 'air') continue;
      if (s.hitSet.has(o.id)) continue;
      // a hook flies low and straight: jump over it or dash through it
      if (s.def.pull && (o.y > s.def.pull.over || o.state === 'dash')) continue;
      if (Math.abs(o.x - s.x) < 0.6 && Math.abs(o.z - s.z) < 0.6 && s.y < o.y + (o.def?.height || 1.7) + 0.3) {
        s.hitSet.add(o.id);
        const blocked = o.side === 'hero' && o.state === 'block' && owner && sgn(owner.x - o.x) === o.dir;
        deal(G, owner, o, s.def, { pw: s.pw, isShot: true });
        if (s.def.pull) {
          G.events.push({ type: 'hook', id: s.owner, target: o.id, shot: s.id, hit: !blocked && alive(o) });
          if (!blocked && alive(o) && owner && o.side === 'hero' && o.state === 'hurt') { o.pull = { by: owner.id, speed: s.def.pull.speed, stop: s.def.pull.stop }; o.pullStun = s.def.pull.stun; if (o.grab) releaseGrab(G, o); }
          s.dead = true; break;
        }
        if (s.def.burst) burst(G, s, owner);
        if (s.def.leave) leaveHazard(G, s, owner);
        if (!s.def.pierce) { s.dead = true; break; }
      }
    }
    if (s.team === 0) for (const p of G.props) if (p.type === 'crate' && !p.broken && Math.abs(p.x - s.x) < 0.6 && Math.abs(p.z - s.z) < 0.7) { breakCrate(G, p, owner); if (!s.def.pierce) s.dead = true; }
  }
  G.shots = G.shots.filter(s => !s.dead);
}
/** Shards that shatter into a short-lived burning patch where they land (Kiln Monk glass). */
function leaveHazard(G, s, owner) {
  if (s.leftDone) return; s.leftDone = true;
  addHazard(G, owner, { x: s.x, z: s.z, r: s.def.leave.r, def: s.def.leave, pw: s.pw, team: s.team });
}
function burst(G, s, owner) {
  if (s.burstDone) return; s.burstDone = true;
  G.events.push({ type: 'zoneHit', x: s.x, z: s.z, r: s.def.burst, look: s.look });
  const targets = s.team === 1 ? G.heroes : G.foes.filter(f => f.team === 1);
  for (const o of targets) if (hittable(o) && !s.hitSet.has(o.id) && Math.hypot(o.x - s.x, o.z - s.z) <= s.def.burst) deal(G, owner, o, { ...s.def, dmg: (s.def.dmg || 1) * 0.6 }, { pw: s.pw, isShot: true });
}
/**
 * A warned area. shape: 'circle' (r), 'col' (a strip ACROSS the street, r = half its width — a claw slam, a wing sweep)
 * or 'row' (a strip ALONG the street at depth z: half-depth r, length def.len — a breath line). The zoneWarn / zoneHit
 * events carry shape, len and look so the renderer can draw each. def.leave = a lasting hazard left behind.
 */
export function addZone(G, e, { x, z, r, delay, def, pw, team }) {
  const shape = def.shape || 'circle', len = def.len || 0;
  const zn = { id: G.nextId++, kind: 'aoe', shape, len, look: def.look || null, owner: e.id, team: team ?? e.team, x, z: shape === 'col' ? 0 : clamp(z, -DEPTH, DEPTH), r, t: 0, delay: delay || 0, def, pw, done: false };
  G.zones.push(zn);
  if (zn.delay > 0) G.events.push({ type: 'zoneWarn', id: zn.id, x: zn.x, z: zn.z, r, delay: zn.delay, team: zn.team, shape, len, look: zn.look });
  else resolveZone(G, zn);
  return zn;
}
/** Is this body inside the zone's shape? */
export function inZone(zn, o, pad = 0) {
  if (zn.shape === 'col') return Math.abs(o.x - zn.x) <= zn.r + pad;
  if (zn.shape === 'row') return Math.abs(o.z - zn.z) <= zn.r + pad && Math.abs(o.x - zn.x) <= zn.len / 2 + pad;
  return Math.hypot(o.x - zn.x, (o.z - zn.z) * 1.2) <= zn.r + pad;
}
/** A lasting hazard (burning glass, embers, root patches): hurts the other side every half second for def.time s. */
export function addHazard(G, e, { x, z, r, def, pw, team, shape, len }) {
  const zn = { id: G.nextId++, kind: 'hazard', shape: shape || def.shape || 'circle', len: len || def.len || 0, look: def.look || null, owner: e?.id ?? 0, team: team ?? e?.team ?? 1, x, z: clamp(z, -DEPTH, DEPTH), r, t: 0, life: def.time, tick: 0, def, pw, done: false };
  G.zones.push(zn);
  G.events.push({ type: 'zoneHit', id: zn.id, x: zn.x, z: zn.z, r, team: zn.team, shape: zn.shape, len: zn.len, look: zn.look, hazard: def.time });
  return zn;
}
function resolveZone(G, zn) {
  zn.done = true;
  const owner = byId(G, zn.owner);
  G.events.push({ type: 'zoneHit', id: zn.id, x: zn.x, z: zn.z, r: zn.r, team: zn.team, shape: zn.shape, len: zn.len, look: zn.look });
  const targets = zn.team === 1 ? [...G.heroes, ...G.foes.filter(f => f.team === 0)] : G.foes.filter(f => f.team === 1);
  for (const o of targets) if ((hittable(o) || o.state === 'air') && inZone(zn, o)) {
    if (zn.def.dmg || zn.def.stun || zn.def.freeze) deal(G, owner, o, zn.def.dmg ? zn.def : { ...zn.def, dmg: 0.01 }, { pw: zn.pw });
  }
  if (zn.team === 0) for (const p of G.props) if (p.type === 'crate' && !p.broken && inZone(zn, p)) breakCrate(G, p, owner);
  // a follow-up circle (Ground Slam's aftershock, Smite's ring): warned like any other
  if (zn.def.after) addZone(G, owner || { id: zn.owner, team: zn.team }, { x: zn.x, z: zn.z, r: zn.def.after.r, delay: zn.def.after.delay, def: zn.def.after, pw: zn.pw, team: zn.team });
  if (zn.def.leave) addHazard(G, owner, { x: zn.x, z: zn.z, r: zn.def.leave.r ?? zn.r, def: zn.def.leave, pw: zn.pw, team: zn.team, shape: zn.def.leave.shape ?? zn.shape, len: zn.def.leave.len ?? zn.len });
}
function stepZones(G, dt) {
  for (const zn of G.zones) {
    zn.t += dt;
    if (zn.kind === 'aoe') { if (!zn.done && zn.t >= zn.delay) resolveZone(G, zn); continue; }
    if (zn.kind === 'sanctuary') {
      zn.tick = (zn.tick || 0) + dt;
      for (const o of [...G.heroes, ...G.foes]) if (alive(o) && Math.hypot(o.x - zn.x, o.z - zn.z) <= zn.r) {
        if (o.team === zn.team) { if (zn.tick >= 0.5) o.hp = Math.min(o.max, o.hp + Math.round(o.max * zn.def.heal)); }
        else { o.slowT = 0.3; o.slowK = zn.def.slow; if (zn.def.dmg && zn.tick >= 0.5) { const ow = byId(G, zn.owner); deal(G, ow, o, { dmg: zn.def.dmg }, { pw: ow?.stats?.spell ?? 10, noReact: true, noMana: true }); } }
      }
      if (zn.tick >= 0.5) zn.tick = 0;
      if (zn.t >= zn.life) zn.done = true;
    }
    if (zn.kind === 'hazard') {
      zn.tick += dt;
      if (zn.tick >= 0.5) {
        zn.tick = 0;
        const owner = byId(G, zn.owner);
        const targets = zn.team === 1 ? [...G.heroes, ...G.foes.filter(f => f.team === 0)] : G.foes.filter(f => f.team === 1);
        for (const o of targets) if (hittable(o) && o.y < 0.6 && inZone(zn, o)) {
          deal(G, owner, o, { dmg: zn.def.dmg || 0.3, slow: zn.def.slow }, { pw: zn.pw, noReact: true, noMana: true, ground: true });
          if (zn.def.slow) { o.slowT = 0.6; o.slowK = zn.def.slow; }
        }
      }
      if (zn.t >= zn.life) zn.done = true;
    }
  }
  G.zones = G.zones.filter(zn => !zn.done);
}

export function addCrate(G, c) { G.props.push({ id: G.nextId++, type: 'crate', x: c.x, z: c.z, holds: c.holds, hp: 1, broken: false }); }
function breakCrate(G, p, by) {
  p.broken = true;
  G.events.push({ type: 'crate', id: p.id, x: p.x, z: p.z });
  let holds = p.holds;
  if (holds === 'random') holds = G.rand() < G.T.crateFood ? 'food' : (G.rand() < 0.5 ? 'gold' : 'item');
  if (holds === 'food') G.props.push({ id: G.nextId++, type: 'food', x: p.x, z: p.z, kind: ['bread', 'apple', 'roast', 'pie'][Math.floor(G.rand() * 4)] });
  else if (holds === 'gold') G.props.push({ id: G.nextId++, type: 'gold', x: p.x, z: p.z, amount: 10 + Math.round(G.rand() * 15 * (1 + G.tier)) });
  else if (holds === 'item') { for (const h of G.heroes) if (h.state !== 'gone') { const it = rollItem(G.data.items, { chapter: G.tier, cls: h.cls, rand: G.rand }); if (it) G.events.push({ type: 'loot', pid: h.pid, item: it, x: p.x, z: p.z }); } }
  else if (holds?.startsWith('weapon:')) G.props.push({ id: G.nextId++, type: 'weapon', x: p.x, z: p.z, pickup: holds.slice(7) });
}
function stepProps(G, dt) {
  for (const p of G.props) {
    if (p.broken || p.taken) continue;
    if (p.type === 'food' || p.type === 'gold') {
      for (const h of G.heroes) {
        if (!alive(h) || Math.abs(h.x - p.x) > 0.7 || Math.abs(h.z - p.z) > 0.6 || h.y > 0.5) continue;
        if (p.type === 'food' && h.hp >= h.max) continue;   // leave food for someone who needs it
        p.taken = true;
        if (p.type === 'food') { const amt = Math.round(h.max * G.T.foodHeal); h.hp = Math.min(h.max, h.hp + amt); G.events.push({ type: 'food', id: h.id, pid: h.pid, amount: amt, kind: p.kind }); }
        else { h.gold += p.amount; G.events.push({ type: 'gold', pid: h.pid, amount: p.amount, x: p.x, z: p.z }); }
        break;
      }
    }
  }
  G.props = G.props.filter(p => !p.taken && !(p.type === 'crate' && p.broken));
}
function tryPickup(G, h) {
  const p = G.props.find(q => q.type === 'weapon' && !q.taken && Math.abs(q.x - h.x) < 0.9 && Math.abs(q.z - h.z) < 0.7);
  if (!p) return false;
  const P = G.data.chapters.pickups[p.pickup];
  if (h.pickup) G.props.push({ id: G.nextId++, type: 'weapon', x: h.x, z: h.z, pickup: h.pickup.id });   // swap
  p.taken = true; h.pickup = { id: p.pickup, uses: P.uses };
  G.events.push({ type: 'pickup', id: h.id, pid: h.pid, pickup: p.pickup });
  return true;
}
function pickupMove(G, h) {
  const P = G.data.chapters.pickups[h.pickup.id];
  h.pickup.uses--;
  if (h.pickup.uses <= 0) { G.events.push({ type: 'pickupBreak', id: h.id, pickup: h.pickup.id }); h.pickup = null; }
  return { ...P.move, dmg: P.move.dmg };
}
function throwPickup(G, h) {
  const P = G.data.chapters.pickups[h.pickup.id];
  h.pickup = null;
  startMove(G, h, { anim: 'throw', t: [0.1, 0.05, 0.25], shot: { speed: 13, range: 9, dmg: P.move.dmg * 1.2, kb: 6, up: 3, down: true, look: 'thrown:' + P.held } }, 'throwPickup');
}

// ------------------------------------------------------------------------------------------------ space
export function byId(G, id) { return G.heroes.find(h => h.id === id) || G.foes.find(f => f.id === id) || null; }
export function clampViewX(G, x, pad = 0.5) { return clamp(x, G.camX - viewHalf(G) + pad, G.camX + viewHalf(G) - pad); }
function clampToView(G, e, pad = 0.5) { e.x = clampViewX(G, e.x, pad); }
function separate(G) {
  const all = [...G.heroes.filter(h => alive(h) && h.state !== 'held'), ...G.foes.filter(f => alive(f) && f.state !== 'held' && f.state !== 'thrown' && f.state !== 'enter' && f.state !== 'rise' && !isBig(f.def))];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.team === b.team && a.side === 'hero' && b.side === 'hero') continue;   // heroes pass through each other
    const dx = b.x - a.x, dz = (b.z - a.z) * 1.6, d = Math.hypot(dx, dz), min = 0.55;
    if (d > 0.0001 && d < min) { const push = (min - d) / 2, nx = dx / d, nz = dz / d / 1.6; a.x -= nx * push; b.x += nx * push; a.z = clamp(a.z - nz * push, -DEPTH, DEPTH); b.z = clamp(b.z + nz * push, -DEPTH, DEPTH); }
  }
}
