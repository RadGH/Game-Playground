// STAND-IN SERVER — deleted once stream A's Worker build exists (docs/requests.md "D -> A" #9).
//
// A deliberately small authoritative room so the client can be built, played and screenshotted before
// the real server lands: guest login, 20 Hz movement with input acks, wolves with a threat table and a
// leash, one basic sword attack with a wind-up, death and respawn, XP, say chat, ping/pong. It speaks the
// provisional protocol from docs/requests.md, through the same JSON messages a WebSocket would carry.
// Pure: no DOM; the host (a Worker, a SharedWorker or a node test) passes `send` functions in.
//
// Nothing here is the game's real combat — numbers are placeholders until stream C's combat core.

import { standinTerrain, STANDIN } from './standin-terrain.js';
import { stepMove } from '../predict.js';

const TICK_MS = 50;
const AOI = 150;
const RNG = seed => { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

const WOLF = { family: 'wolf', creature: { type: 'wolf', size: 1 }, name: 'Grey Wolf', level: 2, hpMax: 90, dmg: [6, 10], reach: 2.3, speed: 6.2, wander: 1.6, aggro: 13, every: 1.7, xp: 34 };
const DIRE = { family: 'wolf', creature: { type: 'dire_wolf', size: 1.15 }, name: 'Dire Wolf', level: 4, hpMax: 190, dmg: [11, 17], reach: 2.7, speed: 6.6, wander: 1.4, aggro: 15, every: 2.0, xp: 80 };
const SWORD = { range: 3.2, tolerance: 0.5, cooldown: 1.05, windup: 0.22, dmg: [15, 23], crit: 0.12, critMul: 1.75 };
const PLAYER_HP = 260;
const LEVEL_XP = lvl => 100 + (lvl - 1) * 80;

export function createStandinServer({ seed = 7, now = () => Date.now() } = {}) {
  const terrain = standinTerrain(seed);
  const rng = RNG(seed * 31 + 1);
  const players = new Map();       // id -> player
  const monsters = new Map();      // id -> monster
  let nextId = 1, tick = 0;
  const t0 = now();
  const time = () => now() - t0;
  const tokens = new Map();        // token -> saved player summary (lives as long as the stand-in)
  const pendingHits = [];          // sword swings waiting out their wind-up

  // --- the wolf packs ---------------------------------------------------------------------------
  const dens = [
    { x: -16, z: 58, kinds: [WOLF, WOLF] },      // strays just outside the camp: first kill inside a minute
    { x: -40, z: 120, kinds: [WOLF, WOLF, WOLF] },
    { x: 60, z: 170, kinds: [WOLF, WOLF] },
    { x: -110, z: 210, kinds: [DIRE, WOLF, WOLF] },
    { x: 20, z: 250, kinds: [WOLF, WOLF, WOLF] },
    { x: -150, z: 60, kinds: [WOLF, WOLF] },
    { x: 120, z: 60, kinds: [WOLF] },
  ];
  function spawnMonster(def, home) {
    const id = nextId++;
    const a = rng() * Math.PI * 2, r = 4 + rng() * 6;
    const x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r;
    const m = { id, kind: 'monster', def, name: def.name, level: def.level, hp: def.hpMax, hpMax: def.hpMax,
      x, z, y: terrain.heightAt(x, z), yaw: rng() * 6.28, home: { x, z }, state: 'idle', anim: 'idle',
      threat: new Map(), lastHurt: 0, nextAttack: 0, wanderAt: time() + rng() * 4000, goal: null, deadAt: 0,
      creature: { ...def.creature, seed: (id * 7919) >>> 0 } };
    monsters.set(id, m);
    return m;
  }
  for (const d of dens) for (const k of d.kinds) spawnMonster(k, d);

  // --- connections ------------------------------------------------------------------------------
  function connect(send) {
    const conn = { send, player: null, hello: false, seen: new Set() };
    return {
      receive(msg) { try { handle(conn, msg); } catch (e) { send({ t: 'notice', text: 'Server error: ' + e.message, tone: 'bad' }); } },
      close() { if (conn.player) { save(conn.player); players.delete(conn.player.id); broadcastNear(conn.player, { t: 'chat', ch: 'system', text: `${conn.player.name} has left.` }); } conn.player = null; },
    };
  }
  function save(p) { tokens.set(p.token, { name: p.name, look: p.look, x: p.x, z: p.z, xp: p.xp, level: p.level }); }
  function makeToken() { let s = ''; for (let i = 0; i < 32; i++) s += Math.floor(rng() * 16).toString(16); return s; }

  function handle(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      if (msg.v !== 1) { conn.send({ t: 'refuse', reason: 'version', text: 'This page is out of date. Reload.' }); return; }
      conn.hello = true; return;
    }
    if (msg.t === 'ping') { conn.send({ t: 'pong', c: msg.c, s: time() }); return; }
    if (!conn.hello) return;
    if (msg.t === 'guest' || msg.t === 'resume') {
      if (conn.player) return;
      let saved = msg.t === 'resume' ? tokens.get(msg.token) : null;
      if (msg.t === 'resume' && !saved) { conn.send({ t: 'refuse', reason: 'token', text: 'That character was not found. Make a new one.' }); return; }
      const name = saved?.name || String(msg.name || '').replace(/[^A-Za-z' -]/g, '').slice(0, 16) || 'Wanderer';
      const token = msg.t === 'resume' ? msg.token : makeToken();
      const sx = saved?.x ?? STANDIN.spawn.x + (rng() - 0.5) * 8, sz = saved?.z ?? STANDIN.spawn.z + (rng() - 0.5) * 6;
      const p = { id: nextId++, kind: 'player', conn, token, name, look: saved?.look || msg.look || { race: 'human', cls: 'warrior' },
        level: saved?.level || 1, xp: saved?.xp || 0, hp: PLAYER_HP, hpMax: PLAYER_HP,
        x: sx, z: sz, y: terrain.heightAt(sx, sz), yaw: 0, anim: 'idle', ack: -1, inputs: [],
        nextSwing: 0, target: null, lastCombat: 0, deadAt: 0, speed: 0 };
      players.set(p.id, p); conn.player = p;
      conn.send({ t: 'welcome', token, you: { id: p.id }, tickMs: TICK_MS, serverTime: time(), world: { seed, size: STANDIN.size, standin: true },
        motd: 'Stand-in server (offline). The real server arrives with stream A.' });
      conn.send({ t: 'spawn', ents: [describe(p)] });
      conn.seen.add(p.id);
      conn.send({ t: 'xp', amount: 0, total: p.xp, level: p.level, next: LEVEL_XP(p.level) });
      broadcastNear(p, { t: 'chat', ch: 'system', text: `${p.name} has arrived.` }, p);
      return;
    }
    const p = conn.player;
    if (!p) return;
    if (msg.t === 'input') {
      if (p.inputs.length < 40) p.inputs.push({ seq: msg.seq | 0, mx: clampN(msg.mx), mz: clampN(msg.mz), yaw: +msg.yaw || 0, run: msg.run ? 1 : 0 });
    } else if (msg.t === 'target') {
      p.target = monsters.has(msg.id) || players.has(msg.id) ? msg.id : null;
    } else if (msg.t === 'cast') {
      cast(p, msg);
    } else if (msg.t === 'chat') {
      const text = String(msg.text || '').slice(0, 240).trim();
      if (text) broadcastNear(p, { t: 'chat', ch: 'say', from: p.name, id: p.id, text }, null, 60);
    }
  }
  const clampN = v => Math.max(-1, Math.min(1, +v || 0));

  function cast(p, msg) {
    if (p.hp <= 0) return;
    const t = time();
    const target = monsters.get(msg.target);
    if (!target || target.hp <= 0) { p.conn.send({ t: 'notice', text: 'You need a target.', tone: 'warn' }); return; }
    const d = Math.hypot(target.x - p.x, target.z - p.z);
    if (d > SWORD.range + SWORD.tolerance + (target.def.reach > 2.5 ? 0.6 : 0)) { p.conn.send({ t: 'notice', text: 'Out of range.', tone: 'warn' }); return; }
    if (t < p.nextSwing - 80) return;   // 80 ms grace for clock jitter
    p.nextSwing = t + SWORD.cooldown * 1000;
    p.target = target.id; p.lastCombat = t;
    p.yaw = Math.atan2(target.x - p.x, target.z - p.z);
    broadcastNear(p, { t: 'cast', src: p.id, slot: 0, target: target.id }, p);
    pendingHits.push({ at: t + SWORD.windup * 1000, src: p.id, dst: target.id });
  }

  function resolveHit(h) {
    const p = players.get(h.src), m = monsters.get(h.dst);
    if (!p || !m || p.hp <= 0 || m.hp <= 0) return;
    if (Math.hypot(m.x - p.x, m.z - p.z) > SWORD.range + SWORD.tolerance + 1.5) return;   // it ran out from under the blade
    const crit = rng() < SWORD.crit;
    const amt = Math.round((SWORD.dmg[0] + rng() * (SWORD.dmg[1] - SWORD.dmg[0])) * (crit ? SWORD.critMul : 1) * (1 + (p.level - 1) * 0.08));
    m.hp = Math.max(0, m.hp - amt);
    m.threat.set(p.id, (m.threat.get(p.id) || 0) + amt);
    m.lastHurt = time();
    if (m.state === 'idle' || m.state === 'wander') m.state = 'chase';
    broadcastNear(m, { t: 'hit', src: p.id, dst: m.id, amt, crit, kind: 'physical', hp: m.hp });
    if (m.hp <= 0) killMonster(m, p);
  }

  function killMonster(m, killer) {
    m.state = 'dead'; m.anim = 'dead'; m.deadAt = time();
    broadcastNear(m, { t: 'death', id: m.id, by: killer.id });
    // Shared credit: everyone on the threat table gets the full award (PLAN §7 shared tagging).
    for (const pid of m.threat.keys()) {
      const p = players.get(pid); if (!p) continue;
      const amount = Math.round(m.def.xp * Math.max(0.2, 1 - Math.max(0, p.level - m.level) * 0.2));
      p.xp += amount;
      while (p.xp >= LEVEL_XP(p.level)) { p.xp -= LEVEL_XP(p.level); p.level++; p.hpMax = PLAYER_HP + (p.level - 1) * 30; p.hp = p.hpMax; broadcastNear(p, { t: 'notice', text: `${p.name} reached level ${p.level}!`, tone: 'good' }); }
      p.conn.send({ t: 'xp', amount, total: p.xp, level: p.level, next: LEVEL_XP(p.level) });
    }
    m.threat.clear();
  }

  // --- simulation -------------------------------------------------------------------------------
  function stepPlayers(t) {
    for (const p of players.values()) {
      if (p.hp <= 0) {
        p.inputs.length = 0;
        if (t - p.deadAt > 6000) {
          p.hp = p.hpMax; p.x = STANDIN.spawn.x + (rng() - 0.5) * 6; p.z = STANDIN.spawn.z; p.y = terrain.heightAt(p.x, p.z); p.anim = 'idle';
          broadcastNear(p, { t: 'respawn', id: p.id, x: p.x, y: p.y, z: p.z, hp: p.hp });
        }
        continue;
      }
      // Apply queued steps: up to 3 a tick so a stalled tab cannot fast-forward (speed-hack guard).
      let n = 0, moved = 0;
      while (p.inputs.length && n < 3) {
        const inp = p.inputs.shift(); n++;
        if (inp.seq <= p.ack) continue;
        const s = stepMove(p, inp, TICK_MS / 1000, terrain.heightAt);
        moved += Math.hypot(s.x - p.x, s.z - p.z);
        if (terrain.inside(s.x, s.z)) { p.x = s.x; p.y = s.y; p.z = s.z; }
        p.yaw = inp.yaw; p.ack = inp.seq; p.run = inp.run;
      }
      p.speed = moved / (TICK_MS / 1000);
      // Regenerate out of combat.
      if (t - p.lastCombat > 6000 && p.hp < p.hpMax) p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.03 * TICK_MS / 1000);
    }
  }

  function nearestPlayer(m, radius) {
    let best = null, bd = radius;
    for (const p of players.values()) { if (p.hp <= 0) continue; const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  function moveToward(m, x, z, speed, dt, stopAt = 0) {
    const dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz);
    if (d <= stopAt + 0.01) return d;
    const s = Math.min(d - stopAt, speed * dt);
    m.x += dx / d * s; m.z += dz / d * s; m.y = terrain.heightAt(m.x, m.z);
    const want = Math.atan2(dx, dz);
    let dy = want - m.yaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283;
    m.yaw += dy * Math.min(1, dt * 10);
    return d - s;
  }

  function stepMonsters(t) {
    const dt = TICK_MS / 1000;
    for (const m of monsters.values()) {
      if (m.state === 'dead') {
        if (t - m.deadAt > 18000) {   // respawn at home
          m.hp = m.hpMax; m.x = m.home.x; m.z = m.home.z; m.y = terrain.heightAt(m.x, m.z); m.state = 'idle'; m.anim = 'idle';
          broadcastNear(m, { t: 'respawn', id: m.id, x: m.x, y: m.y, z: m.z, hp: m.hp });
        }
        continue;
      }
      if (m.state === 'idle' || m.state === 'wander') {
        const seen = nearestPlayer(m, m.def.aggro);
        if (seen) { m.state = 'chase'; m.threat.set(seen.id, 1); m.lastHurt = t; broadcastNear(m, { t: 'cast', src: m.id, slot: 9, target: seen.id }); }
      }
      if (m.state === 'idle') {
        m.anim = 'idle';
        if (t > m.wanderAt) { const a = rng() * 6.28, r = rng() * 9; m.goal = { x: m.home.x + Math.cos(a) * r, z: m.home.z + Math.sin(a) * r }; m.state = 'wander'; }
      } else if (m.state === 'wander') {
        m.anim = 'walk';
        if (moveToward(m, m.goal.x, m.goal.z, m.def.wander, dt) < 0.2) { m.state = 'idle'; m.wanderAt = t + 3000 + rng() * 6000; }
      } else if (m.state === 'chase') {
        // Threat table: chase whoever has the most; drop anyone dead or gone.
        let tgt = null, top = -1;
        for (const [pid, v] of m.threat) { const p = players.get(pid); if (!p || p.hp <= 0) { m.threat.delete(pid); continue; } if (v > top) { top = v; tgt = p; } }
        const homeD = Math.hypot(m.x - m.home.x, m.z - m.home.z);
        if (!tgt || homeD > 40 || t - m.lastHurt > 8000 && homeD > 14) { m.state = 'leash'; m.threat.clear(); continue; }
        m.target = tgt.id;
        const d = moveToward(m, tgt.x, tgt.z, m.def.speed, dt, m.def.reach * 0.85);
        m.anim = d > m.def.reach ? 'run' : 'idle';
        if (d <= m.def.reach && t >= m.nextAttack) {
          m.nextAttack = t + m.def.every * 1000;
          m.yaw = Math.atan2(tgt.x - m.x, tgt.z - m.z);
          broadcastNear(m, { t: 'cast', src: m.id, slot: 0, target: tgt.id });
          const amt = Math.round(m.def.dmg[0] + rng() * (m.def.dmg[1] - m.def.dmg[0]));
          pendingHits.push({ at: t + 280, monster: m.id, dst: tgt.id, amt });
        }
      } else if (m.state === 'leash') {
        m.anim = 'run'; m.hp = Math.min(m.hpMax, m.hp + m.hpMax * 0.2 * dt);
        if (moveToward(m, m.home.x, m.home.z, m.def.speed * 1.2, dt) < 0.5) { m.state = 'idle'; m.hp = m.hpMax; m.wanderAt = t + 2000; }
      }
    }
  }

  function resolveMonsterHit(h) {
    const m = monsters.get(h.monster), p = players.get(h.dst);
    if (!m || !p || m.hp <= 0 || p.hp <= 0) return;
    if (Math.hypot(m.x - p.x, m.z - p.z) > m.def.reach + 1.2) {   // dodged by walking away
      broadcastNear(m, { t: 'hit', src: m.id, dst: p.id, amt: 0, kind: 'miss', hp: p.hp });
      return;
    }
    p.hp = Math.max(0, p.hp - h.amt); p.lastCombat = time();
    broadcastNear(p, { t: 'hit', src: m.id, dst: p.id, amt: h.amt, crit: false, kind: 'physical', hp: p.hp });
    if (p.hp <= 0) {
      p.deadAt = time(); p.anim = 'dead';
      broadcastNear(p, { t: 'death', id: p.id, by: m.id });
      for (const mm of monsters.values()) mm.threat.delete(p.id);
    }
  }

  function describe(e) {
    return e.kind === 'player'
      ? { id: e.id, kind: 'player', name: e.name, level: e.level, hp: e.hp, hpMax: e.hpMax, look: e.look, x: e.x, y: e.y, z: e.z, yaw: e.yaw, hostile: false }
      : { id: e.id, kind: 'monster', name: e.name, level: e.level, hp: e.hp, hpMax: e.hpMax, creature: e.creature, family: e.def.family, x: e.x, y: e.y, z: e.z, yaw: e.yaw, hostile: true };
  }
  const r2 = v => Math.round(v * 100) / 100;

  function snapshotFor(p, t) {
    const conn = p.conn, ents = [], spawn = [], gone = [];
    const visible = new Set([p.id]);
    const consider = e => {
      if (Math.hypot(e.x - p.x, e.z - p.z) > AOI) return;
      visible.add(e.id);
      if (!conn.seen.has(e.id)) { conn.seen.add(e.id); spawn.push(describe(e)); }
      ents.push({ id: e.id, x: r2(e.x), y: r2(e.y), z: r2(e.z), yaw: r2(e.yaw), anim: e.kind === 'player' ? (e.hp <= 0 ? 'dead' : null) : e.anim, hp: Math.round(e.hp), tgt: e.target ?? null });
    };
    for (const e of players.values()) if (e !== p) consider(e);
    for (const e of monsters.values()) consider(e);
    for (const id of conn.seen) if (!visible.has(id)) { conn.seen.delete(id); gone.push(id); }
    if (spawn.length) conn.send({ t: 'spawn', ents: spawn });
    conn.send({ t: 'snap', tick, time: t, ack: p.ack, you: { x: r2(p.x), y: r2(p.y), z: r2(p.z), hp: Math.round(p.hp), hpMax: p.hpMax }, ents, gone });
  }

  function broadcastNear(src, msg, except = null, radius = AOI) {
    for (const p of players.values()) if (p !== except && Math.hypot(p.x - src.x, p.z - src.z) <= radius) p.conn.send(msg);
  }

  function step() {
    tick++;
    const t = time();
    stepPlayers(t);
    stepMonsters(t);
    for (let i = pendingHits.length - 1; i >= 0; i--) {
      const h = pendingHits[i];
      if (h.at > t) continue;
      pendingHits.splice(i, 1);
      if (h.monster) resolveMonsterHit(h); else resolveHit(h);
    }
    for (const p of players.values()) snapshotFor(p, t);
  }

  return { connect, step, tickMs: TICK_MS, get players() { return players; }, get monsters() { return monsters; }, terrain };
}
