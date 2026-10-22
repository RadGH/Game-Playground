// BOARDWALK BRAWL — a side-scrolling brawler down a long, shallow fairground street. Everyone walks left to right
// together; the screen only scrolls forward, and it STOPS at each wave until that wave of roughnecks is beaten (the
// "GO" arrow shows when it is free again). A = punch (a three-hit combo, the third punch sends them flying), B = jump
// kick (a leap forward that hits everything you land in, and nothing can hit you mid-air). Get knocked to zero and you
// are down: a teammate standing next to you for a moment gets you up, and beating a wave gets everyone up. If every
// player is down at once it is over. A boss waits at the end of the street; beat it and the whole team gets a bonus.
// Points for every hit and every knock-out: most points wins, so it is co-op with a scoreboard.
//
// The screen window is part of the game's arena: two invisible walls (arena.blocks) just outside the window, moved
// every step. stepBody already collides with blocks, and the browser moves its copy of the same walls from state.w,
// so your phone predicts the edge of the screen exactly as the server does. Levels are data (levels.js).
import { makeBody, stepBody, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { LEVELS, FOES, BOSSES } from './levels.js';

export const W = 14, HD = 3.5;                                     // the screen window is W metres of street; the lane is 2*HD deep
export const meta = {
  id: 'boardwalk-brawl', title: 'Boardwalk Brawl', blurb: 'Punch your way down the fairground street together and topple the boss at the end!',
  how: ['PUNCH three times for a combo; the third sends them flying.', 'KICK leaps forward: nobody can hit you in the air.', 'Stand by a downed friend to pick them up.', 'Most points wins; beating the boss pays everyone.'],
  kind: 'arena', min: 1, max: 4, seconds: 90, scoring: 'points', unit: 'pts', tags: ['action', 'coop'],
  controls: { stick: true, a: 'Punch', b: 'Kick' }, move: { speed: 5.6, accel: 16, stunDrag: 3.6 },
  arena: { shape: 'rect', hw: 42, hd: HD, wall: true }, pitch: 38, card: 'card-boardwalk-brawl', css: true,
};

export const RULES = {
  hp: 100, jab: [1, 1, 2], reach: 1.55, width: 0.85, comboWin: 0.55, jabCool: 0.22, finCool: 0.45,
  kickCool: 1.0, kickSpeed: 10.5, kickVy: 5.4, grav: 24, kickR: 1.15,
  reviveR: 1.6, reviveT: 1.3, reviveHp: 50, waveHp: 40, waveHeal: 20, inv: 1.5,
  ptsPerDmg: 2, revivePts: 10, clearBonus: 30, spawnGap: 0.45, lead: 9, scroll: 6,
  dmgMul: { easy: 0.7, normal: 1, hard: 1.3 },
};
export const KINDS = ['tough', 'quick', 'heavy', 'boss'];
/** Enemy states on the wire. */
export const ST = { walk: 0, wind: 1, recover: 2, stagger: 3, fly: 4, down: 5, dead: 6, windSlam: 7, windCharge: 8, charge: 9 };
const ATTACKING = new Set([ST.wind, ST.recover, ST.windSlam, ST.windCharge, ST.charge]);
const r2 = v => Math.round(v * 100) / 100;

export function create({ seed, rng, players, difficulty = 'normal' }) {
  const n = players.length, solo = n === 1;
  const level = LEVELS[Math.abs(seed | 0) % LEVELS.length];
  const hw = level.length / 2, lookSalt = rng.int(1, 9999);
  const dmgMul = (RULES.dmgMul[difficulty] ?? 1) * (solo ? 0.85 : 1);
  const walls = [{ x: 0, z: 0, hw: 2, hd: 8 }, { x: 0, z: 0, hw: 2, hd: 8 }];
  const arena = { shape: 'rect', hw, hd: HD, wall: true, blocks: walls };
  let win0 = -hw;
  const setWalls = () => { walls[0].x = r2(win0 - 2); walls[1].x = r2(win0 + W + 2); };
  setWalls();
  const bodies = new Map(), P = new Map();
  players.forEach((p, i) => {
    bodies.set(p.pid, makeBody(-hw + 3 + (i % 2) * 0.8, r2((i - (n - 1) / 2) * 1.4), Math.PI / 2));
    P.set(p.pid, { prevB: 0, hp: RULES.hp, down: false, rev: 0, combo: 0, comboT: 0, cool: 0, kick: 0, kickCool: 0, kickHit: new Set(), vy: 0, stun: 0, inv: 0, score: 0, kos: 0, downs: 0 });
  });
  const waveX = i => Math.min(hw, level.waves[i].at - hw);
  let foes = [], fid = 0, wi = 0, waveOn = false, spawnQ = [], time = meta.seconds, elapsed = 0, over = false, endIn = -1, cleared = false, failed = false;
  const events = [];

  const up = pid => !P.get(pid).down;
  const upPlayers = () => players.filter(p => up(p.pid));
  function startWave() {
    const w = level.waves[wi]; waveOn = true;
    const list = [...w.foes]; for (let k = 1; k < n; k++) list.push(...(w.more || []));
    let t = 0.3;
    if (w.boss) { spawnQ.push({ k: 'boss', id: w.boss, side: 1, t }); t += 0.9; }
    list.forEach((k, i) => { spawnQ.push({ k, side: (i % 3 === 2) ? -1 : 1, t }); t += RULES.spawnGap; });
    events.push({ e: 'wave', i: wi, boss: w.boss ? BOSSES[w.boss].name : null });
  }
  function spawn(q) {
    const def = q.k === 'boss' ? BOSSES[q.id] : FOES[q.k];
    const hp = q.k === 'boss' ? def.hp + def.perExtra * (n - 1) : def.hp;
    const x = q.side > 0 ? win0 + W + 1.6 : win0 - 1.6, z = rng.range(-HD + 0.7, HD - 0.7);
    foes.push({ id: ++fid, k: q.k, def, x, z, y: 0, vx: 0, vz: 0, vy: 0, yaw: q.side > 0 ? -Math.PI / 2 : Math.PI / 2, hp, maxHp: hp, st: ST.walk, t: 0, cool: rng.range(0.4, 1.0), poise: 0, dir: [0, 0], hitSet: new Set() });
  }
  const hittable = e => e.st !== ST.fly && e.st !== ST.down && e.st !== ST.dead;
  function damage(e, dmg, by, fin, dx, dz) {
    const s = P.get(by), wasAlive = e.hp > 0;
    e.hp -= dmg; s.score += dmg * RULES.ptsPerDmg;
    const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    if (e.hp <= 0 && wasAlive) {
      e.st = ST.fly; e.vy = 6.5; e.vx = dx * 7; e.vz = dz * 2; e.t = 0;
      s.kos++; s.score += e.def.pts;
      events.push({ e: 'ko', id: e.id, by, pts: e.def.pts + dmg * RULES.ptsPerDmg, boss: e.k === 'boss', x: r2(e.x), z: r2(e.z) });
      return;
    }
    events.push({ e: 'hit', id: e.id, by, fin: fin ? 1 : 0, x: r2(e.x), z: r2(e.z) });
    if (e.k === 'boss') { if (fin && e.poise <= 0) { e.st = ST.stagger; e.t = 0.4; e.poise = 1.8; e.vx = dx * 2.5; e.vz = 0; } return; }
    if (fin && !e.def.armour) { e.st = ST.fly; e.vy = 5; e.vx = dx * 6; e.vz = dz * 1.5; e.t = 0; }
    else if (fin || !e.def.armour) { e.st = ST.stagger; e.t = fin ? 0.45 : 0.28; e.vx = dx * (fin ? 3 : 2); e.vz = dz; }
  }
  function hurt(pid, dmg, dx, dz, by) {
    const s = P.get(pid), b = bodies.get(pid);
    if (s.down || s.inv > 0 || s.kick > 0) return false;
    s.hp = Math.max(0, s.hp - Math.round(dmg * dmgMul)); s.combo = 0;
    const d = Math.hypot(dx, dz) || 1;
    events.push({ e: 'hurt', pid, by, hp: s.hp });
    if (s.hp <= 0) { knockDown(pid); return true; }
    b.vx = dx / d * 6.5; b.vz = dz / d * 3; b.flags |= F.STUN; s.stun = 0.35;
    return true;
  }
  function knockDown(pid) {
    const s = P.get(pid), b = bodies.get(pid);
    s.down = true; s.rev = 0; s.kick = 0; s.stun = 0; s.downs++; b.y = 0; b.vx = b.vz = 0;
    b.flags = (b.flags & ~(F.STUN | F.AIR | F.GHOST)) | F.FROZEN;
    events.push({ e: 'down', pid });
    if (!upPlayers().length && !over && endIn < 0) { failed = true; endIn = 1.6; events.push({ e: 'fail' }); }
  }
  function getUp(pid, hp, by = null) {
    const s = P.get(pid), b = bodies.get(pid);
    s.down = false; s.hp = hp; s.rev = 0; s.inv = RULES.inv; b.flags = (b.flags & ~F.FROZEN) | F.GHOST;
    if (by != null) P.get(by).score += RULES.revivePts;
    events.push({ e: 'up', pid, by });
  }
  /** A punch box in front of the player: everything in it is hit. */
  function punch(pid, b, s) {
    s.combo = s.comboT > 0 && s.combo < 3 ? s.combo + 1 : 1; s.comboT = RULES.comboWin;
    const dmg = RULES.jab[s.combo - 1], fin = s.combo === 3;
    s.cool = fin ? RULES.finCool : RULES.jabCool;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    let hits = 0;
    for (const e of foes) {
      if (!hittable(e) || hits >= 3) continue;
      const rx = e.x - b.x, rz = e.z - b.z, along = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
      if (along > -0.25 && along < RULES.reach + e.def.scale * 0.3 && side < RULES.width + e.def.scale * 0.15) { damage(e, dmg, pid, fin, fx || Math.sign(rx), 0); hits++; }
    }
    events.push({ e: 'punch', pid, n: s.combo, hit: hits });
    if (fin) s.combo = 0;
  }

  function stepFoe(e, dt) {
    e.cool -= dt; if (e.poise > 0) e.poise -= dt;
    const def = e.def;
    if (e.st === ST.fly) {
      e.vy -= RULES.grav * dt; e.y += e.vy * dt; e.x += e.vx * dt; e.z += e.vz * dt;
      if (e.y <= 0 && e.vy < 0) { e.y = 0; e.vx = e.vz = 0; if (e.hp <= 0) { e.st = ST.dead; e.t = 1.1; } else { e.st = ST.down; e.t = 0.75; } }
      return;
    }
    if (e.st === ST.dead || e.st === ST.down) { e.t -= dt; if (e.t <= 0) { if (e.st === ST.down) e.st = ST.walk; else e.gone = true; } return; }
    if (e.st === ST.stagger) { e.t -= dt; const k = Math.max(0, 1 - 6 * dt); e.vx *= k; e.vz *= k; e.x += e.vx * dt; e.z += e.vz * dt; if (e.t <= 0) { e.st = ST.walk; e.cool = Math.max(e.cool, 0.35); } return; }
    // who to go after: the nearest player still standing
    let tgt = null, best = 1e9;
    for (const p of players) { if (!up(p.pid)) continue; const b = bodies.get(p.pid), d = Math.hypot(b.x - e.x, b.z - e.z); if (d < best) { best = d; tgt = b; } }
    if (e.st === ST.charge) {
      e.t -= dt; e.x += e.dir[0] * 9.5 * dt; e.z += e.dir[1] * 9.5 * dt;
      for (const p of players) { const b = bodies.get(p.pid); if (!up(p.pid) || e.hitSet.has(p.pid) || Math.hypot(b.x - e.x, b.z - e.z) > 1.25) continue; e.hitSet.add(p.pid); hurt(p.pid, def.dmg, e.dir[0], b.z - e.z || 0.3, -e.id); }
      if (e.t <= 0 || e.x < win0 + 0.6 || e.x > win0 + W - 0.6) { e.st = ST.recover; e.t = 1.1; e.cool = def.cool; }   // dizzy after a run
      return;
    }
    if (e.st === ST.recover) { e.t -= dt; if (e.t <= 0) e.st = ST.walk; return; }
    if (e.st === ST.wind || e.st === ST.windSlam || e.st === ST.windCharge) {
      e.t -= dt;
      if (e.st === ST.windCharge && tgt) { const dx = tgt.x - e.x, dz = tgt.z - e.z, d = Math.hypot(dx, dz) || 1; e.dir = [dx / d, dz / d]; e.yaw = Math.atan2(dx, dz); }
      if (e.t > 0) return;
      if (e.st === ST.wind) {
        const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
        for (const p of players) {
          const b = bodies.get(p.pid); if (!up(p.pid)) continue;
          const rx = b.x - e.x, rz = b.z - e.z, along = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
          if (along > -0.2 && along < def.reach + 0.25 && side < 0.9) hurt(p.pid, def.dmg, fx, fz, -e.id);
        }
        events.push({ e: 'swing', id: e.id });
        e.st = ST.recover; e.t = e.k === 'boss' ? 0.9 : 0.35; e.cool = def.cool * rng.range(0.85, 1.25);   // a boss stands there after a swing: your opening
      } else if (e.st === ST.windSlam) {
        for (const p of players) { const b = bodies.get(p.pid); if (up(p.pid) && Math.hypot(b.x - e.x, b.z - e.z) < 2.5) hurt(p.pid, def.dmg, b.x - e.x, b.z - e.z, -e.id); }
        events.push({ e: 'slam', id: e.id, x: r2(e.x), z: r2(e.z) });
        e.st = ST.recover; e.t = 1.0; e.cool = def.cool;
      } else { e.st = ST.charge; e.t = 0.8; e.hitSet.clear(); events.push({ e: 'charge', id: e.id }); }
      return;
    }
    // walking
    if (!tgt) { e.vx = e.vz = 0; return; }
    const dx = tgt.x - e.x, dz = tgt.z - e.z;
    e.yaw = Math.atan2(dx, dz);
    const busy = foes.filter(f => ATTACKING.has(f.st)).length, tokens = Math.max(2, n + 1);
    if (e.cool <= 0 && busy < tokens) {
      const boss = e.k === 'boss', moves = boss ? def.moves : ['swing'];
      if (boss && moves.includes('charge') && Math.abs(dx) > 4 && rng.chance(0.5)) { e.st = ST.windCharge; e.t = 0.7; e.yaw = Math.atan2(dx, dz); events.push({ e: 'tell', id: e.id, m: 'charge' }); return; }
      if (boss && moves.includes('slam') && best < 2.4 && rng.chance(0.45)) { e.st = ST.windSlam; e.t = 0.9; events.push({ e: 'tell', id: e.id, m: 'slam' }); return; }
      if (Math.abs(dx) <= def.reach + 0.1 && Math.abs(dz) < 0.55) { e.st = ST.wind; e.t = def.wind; e.yaw = dx >= 0 ? Math.PI / 2 : -Math.PI / 2; events.push({ e: 'tell', id: e.id, m: 'swing' }); return; }
    }
    const side = Math.sign(e.x - tgt.x) || 1, sx = tgt.x + side * Math.max(0.95, def.reach - 0.35), sz = tgt.z;
    const mx = sx - e.x, mz = sz - e.z, md = Math.hypot(mx, mz);
    if (md > 0.15) { const sp = Math.min(def.speed, md / dt); e.x += mx / md * sp * dt; e.z += mz / md * sp * dt; }
  }

  return {
    bodies, events,
    init: () => ({ level: { id: level.id, name: level.name, length: level.length, theme: level.theme, waves: level.waves.map(w => w.at) }, boss: BOSSES[level.waves.at(-1).boss] || null, arena: { ...arena, blocks: walls.map(w => ({ ...w })) }, W, solo, hp: RULES.hp, lookSalt, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      const free = !s.down && !(b.flags & F.STUN) && s.kick <= 0;
      if (pa && free && s.cool <= 0) punch(pid, b, s);
      else if (pb && free && s.kickCool <= 0) {
        const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
        s.kick = 1; s.kickCool = RULES.kickCool; s.vy = RULES.kickVy; s.kickHit.clear(); s.combo = 0;
        b.vx = fx * RULES.kickSpeed; b.vz = fz * RULES.kickSpeed; b.flags |= F.STUN | F.AIR;
        events.push({ e: 'kick', pid });
      }
      stepBody(b, inp, meta.move, arena);
    },
    step(dt) {
      if (over) return;
      elapsed += dt; time -= dt;
      // players: timers, the jump kick's arc, revives
      for (const p of players) {
        const s = P.get(p.pid), b = bodies.get(p.pid);
        if (s.cool > 0) s.cool -= dt; if (s.kickCool > 0) s.kickCool -= dt; if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) s.combo = 0; }
        if (s.inv > 0) { s.inv -= dt; if (s.inv <= 0) b.flags &= ~F.GHOST; }
        if (s.kick > 0) {
          s.vy -= RULES.grav * dt; b.y = Math.max(0, b.y + s.vy * dt);
          for (const e of foes) {
            if (!hittable(e) || s.kickHit.has(e.id) || Math.hypot(e.x - b.x, e.z - b.z) > RULES.kickR + e.def.scale * 0.3) continue;
            s.kickHit.add(e.id); damage(e, 2, p.pid, true, Math.sin(b.yaw) || 1, 0);
          }
          if (b.y <= 0 && s.vy < 0) { s.kick = 0; b.y = 0; b.flags &= ~(F.STUN | F.AIR); }
        } else if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.down) {
          let helper = null;
          for (const q of players) { if (q.pid === p.pid || !up(q.pid)) continue; const c = bodies.get(q.pid); if (Math.hypot(c.x - b.x, c.z - b.z) < RULES.reviveR) { helper = q.pid; break; } }
          if (helper != null) { s.rev += dt; if (s.rev >= RULES.reviveT) getUp(p.pid, RULES.reviveHp, helper); }
          else s.rev = Math.max(0, s.rev - dt * 0.5);
        }
      }
      // the screen scrolls after the leader, never back, and stops at the next wave until it is beaten
      const ups = upPlayers();
      if (ups.length && endIn < 0) {
        let target = Math.max(...ups.map(p => bodies.get(p.pid).x)) - RULES.lead;
        if (waveOn) target = win0;
        if (wi < level.waves.length) target = Math.min(target, waveX(wi) - W);
        target = Math.min(target, hw - W);
        if (target > win0) { win0 = r2(win0 + Math.min(target - win0, RULES.scroll * dt)); setWalls(); }
        if (!waveOn && wi < level.waves.length && win0 + W >= waveX(wi) - 0.02) startWave();
      }
      // spawns, then the roughnecks
      for (const q of spawnQ) q.t -= dt;
      while (spawnQ.length && spawnQ[0].t <= 0) spawn(spawnQ.shift());
      for (const e of foes) {
        stepFoe(e, dt);
        e.z = Math.max(-HD + 0.4, Math.min(HD - 0.4, e.z)); e.x = Math.max(win0 - 3, Math.min(win0 + W + 3, Math.max(-hw + 0.4, Math.min(hw - 0.4, e.x))));
      }
      // keep bodies apart: roughnecks from each other, and out of the players (only the roughneck moves, so a phone's
      // prediction of its own player is never pushed by something it cannot see)
      const solid = foes.filter(e => e.st !== ST.dead && e.st !== ST.fly && e.y <= 0.01);
      for (let i = 0; i < solid.length; i++) {
        const a = solid[i];
        for (let j = i + 1; j < solid.length; j++) { const c = solid[j], dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz), min = 0.45 * (a.def.scale + c.def.scale) + 0.1; if (d < min && d > 1e-6) { const k = (min - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; c.x += dx * k; c.z += dz * k; } }
        if (a.st === ST.down) continue;
        for (const p of players) { const b = bodies.get(p.pid); if (!up(p.pid)) continue; const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), min = 0.45 + 0.42 * a.def.scale; if (d < min && d > 1e-6) { a.x += dx / d * (min - d); a.z += dz / d * (min - d); } }
      }
      foes = foes.filter(e => !e.gone);
      // a wave is beaten when nothing of it is left standing
      if (waveOn && !spawnQ.length && !foes.some(e => e.hp > 0)) {
        const boss = !!level.waves[wi].boss;
        waveOn = false; wi++;
        for (const p of players) { const s = P.get(p.pid); if (s.down) getUp(p.pid, RULES.waveHp); else s.hp = Math.min(RULES.hp, s.hp + RULES.waveHeal); }
        events.push({ e: 'clearWave', i: wi - 1 });
        if (boss || wi >= level.waves.length) {
          cleared = true; endIn = 2.4;
          for (const p of players) P.get(p.pid).score += RULES.clearBonus;
          events.push({ e: 'clear', bonus: RULES.clearBonus });
        }
      }
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; }
      if (time <= 0) over = true;
      if (over) { time = Math.max(0, time); for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; } }
    },
    state() {
      const hp = {}, sc = {}, rv = {};
      for (const p of players) { const s = P.get(p.pid); hp[p.pid] = s.down ? 0 : s.hp; sc[p.pid] = s.score; if (s.down && s.rev > 0) rv[p.pid] = r2(s.rev / RULES.reviveT); }
      const g = { w: win0, hp, sc, left: Math.ceil(Math.max(0, time)), wv: wi, go: !waveOn && wi < level.waves.length && win0 + W < waveX(wi) - 0.5 && endIn < 0 ? 1 : 0,
        e: foes.map(e => [e.id, KINDS.indexOf(e.k), r2(e.x), r2(e.z), r2(e.y), r2(e.yaw), e.st, Math.max(0, Math.ceil(e.hp / e.maxHp * 20))]) };
      if (Object.keys(rv).length) g.rv = rv;
      if (cleared) g.clr = 1; if (failed) g.fail = 1;
      return g;
    },
    get over() { return over; },
    /** For tests and the debug overlay. */
    get debug() { return { level: level.id, win0, wi, waveOn, foes, P, cleared, failed, arena }; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) { const s = P.get(p.pid); scores[p.pid] = s.score; if (!groups.has(s.score)) groups.set(s.score, []); groups.get(s.score).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
    },
  };
}
