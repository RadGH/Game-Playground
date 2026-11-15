// Grimring fight rules: pure and seeded (no three.js, no DOM, no clock) so node tests can play whole fights.
//
//   const F = createFight({ data, sides: [{ model: 'bandit', team: 0, ctrl: 'player' }, { model: 'zombie', team: 1 }], seed: 7 });
//   step(F, 1 / 60, { mx, mz, attack, special, dodge });   // input drives every fighter with ctrl 'player'
//   F.events → [{ type: 'swing' | 'hit' | 'miss' | 'shot' | 'warn' | 'blast' | 'shout' | 'block' | 'dodge' | 'death' | 'end', … }]
//
// World: metres, y up. A fighter facing angle a looks along (sin a, cos a) — the same as a three.js model turned by
// rotation.y = a (models face +z). The arena is a circle of radius F.R around the origin.
export const STEP = 1 / 60;
export const ARENA_R = 11;
const BASIC_ARC = 110;            // degrees a basic melee swing covers
const DODGE = { dist: 3.6, time: 0.32, cd: 1.0 };
const STAGGER_AT = 20;            // a single hit this big interrupts a swing that has not landed yet
const FLINCH = 0.3;

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const RAD = Math.PI / 180;

/** Size from the Model Library's height: collision radius and how far an ogre reaches compared with a goblin. */
export function bodyOf(height) { return { radius: clamp(height * 0.24, 0.32, 0.8), height }; }

export function defOf(data, model) {
  const d = data.fighters.find(f => f.id === model);
  if (!d) throw new Error(`no fighter ${model}`);
  return d;
}

export const NO_MODS = Object.freeze({ hpMul: 1, dmgMul: 1, speedMul: 1, cdCut: 0, leech: 0, hasteMul: 1, armor: 0, mend: 0 });

export function createFight({ data, sides, seed = 1, difficulty = 'normal', heights = {}, R = ARENA_R }) {
  const diff = data.difficulty[difficulty] || data.difficulty.normal;
  const F = { t: 0, R, rand: rng(seed), diff, difficulty, fighters: [], shots: [], zones: [], events: [], over: false, winner: null, nextId: 1 };
  const byTeam = [0, 0];
  sides.forEach((s) => {
    const def = defOf(data, s.model);
    const mods = { ...NO_MODS, ...(s.mods || {}) };
    const body = bodyOf(heights[s.model] || s.height || 1.75);
    const tough = s.tough || 1;
    const max = Math.round(def.hp * mods.hpMul * tough);
    const n = byTeam[s.team]++;
    // team 0 starts south (+z, near the camera), team 1 north; a second fighter on a side stands beside the first
    const side = s.team === 0 ? 1 : -1, x = n === 0 ? 0 : (n % 2 ? 2.6 : -2.6), z = side * R * 0.55;
    F.fighters.push({
      id: F.nextId++, model: s.model, name: s.name || null, def, team: s.team, ctrl: s.ctrl || 'bot', mods, tough,
      dmgK: (s.team === 0 ? 1 : diff.dmg) * tough,
      x, z, px: x, pz: z, face: s.team === 0 ? Math.PI : 0, ...body,
      hp: s.hp != null ? Math.min(s.hp, max) : max, max,
      state: 'idle', st: 0, dur: 0, act: null, landed: false, aim: null,
      cd: { atk: 0, sp: 0.5 + (s.team ? 1.5 : 0), dodge: 0 }, slowT: 0, slowK: 0, stunT: 0, blockT: 0, invT: 0, mx: 0, mz: 0,
      stats: { dealt: 0, taken: 0, hits: 0 }, ai: { think: 0, strafe: (n % 2 ? -1 : 1), want: null, wait: 0.6 + n * 0.4 },
    });
  });
  return F;
}

export const alive = f => f.state !== 'dead';
export const foesOf = (F, f) => F.fighters.filter(o => o.team !== f.team && alive(o));
export function nearestFoe(F, f) {
  let best = null, bd = Infinity;
  for (const o of foesOf(F, f)) { const d = dist(f, o); if (d < bd) { bd = d; best = o; } }
  return best;
}
const busy = f => f.state === 'attack' || f.state === 'special' || f.state === 'dodge' || f.state === 'hit' || f.stunT > 0;
export const speedOf = f => f.def.speed * f.mods.speedMul * (f.slowT > 0 ? 1 - f.slowK : 1);
export const swingOf = f => f.def.swing / f.mods.hasteMul;
export const specialCd = f => f.def.special.cd * (1 - f.mods.cdCut);
export const rangeOf = f => (f.def.kind === 'melee' ? f.def.reach : f.def.range);

// ---------------------------------------------------------------- actions a fighter (player or bot) can start
function faceFoe(F, f, within) {
  const o = nearestFoe(F, f);
  if (o && dist(f, o) <= within) f.face = angTo(f, o);
  return o;
}
export function tryAttack(F, f) {
  if (!alive(f) || busy(f) || f.cd.atk > 0) return false;
  faceFoe(F, f, f.def.kind === 'melee' ? f.def.reach + 3 : f.def.range + 2);
  f.state = 'attack'; f.st = 0; f.dur = swingOf(f); f.landed = false; f.act = { land: f.def.land };
  f.cd.atk = f.dur;
  F.events.push({ type: 'swing', id: f.id, clip: 'attack', dur: f.dur });
  return true;
}
export function trySpecial(F, f) {
  if (!alive(f) || busy(f) || f.cd.sp > 0) return false;
  const sp = f.def.special;
  const o = faceFoe(F, f, sp.kind === 'blast' ? f.def.range + 2 : sp.kind === 'lunge' ? 8 : 12);
  f.state = 'special'; f.st = 0; f.dur = sp.time; f.landed = false; f.act = { land: sp.land, kind: sp.kind };
  f.cd.sp = specialCd(f); f.cd.atk = Math.max(f.cd.atk, 0.2);
  if (sp.kind === 'blast') {
    // the spot is chosen now and marked on the ground until it goes off (never an unseen hit, lessons rule 39)
    const at = o && dist(f, o) <= f.def.range + 2 ? { x: o.x, z: o.z } : { x: f.x + Math.sin(f.face) * 6, z: f.z + Math.cos(f.face) * 6 };
    const r = Math.hypot(at.x, at.z), lim = F.R - 0.5; if (r > lim) { at.x *= lim / r; at.z *= lim / r; }
    f.act.at = at;
    F.zones.push({ by: f.id, team: f.team, x: at.x, z: at.z, r: sp.radius, t: sp.time * sp.land, total: sp.time * sp.land, dmg: sp.dmg, color: f.def.shot?.color });
    F.events.push({ type: 'warn', id: f.id, x: at.x, z: at.z, r: sp.radius, t: sp.time * sp.land });
  }
  if (sp.kind === 'block') f.blockT = sp.time;
  F.events.push({ type: 'swing', id: f.id, clip: sp.clip, dur: f.dur, special: sp.kind });
  return true;
}
export function tryDodge(F, f, dx, dz) {
  if (!alive(f) || f.cd.dodge > 0 || f.stunT > 0 || f.state === 'dodge') return false;
  if ((f.state === 'attack' || f.state === 'special') && f.landed) return false;        // can cancel a wind-up, not a follow-through
  const m = Math.hypot(dx, dz);
  const a = m > 0.2 ? Math.atan2(dx, dz) : f.face;
  if (f.state === 'special' && f.act?.kind === 'blast') F.zones = F.zones.filter(z => z.by !== f.id);
  f.blockT = 0;
  f.state = 'dodge'; f.st = 0; f.dur = DODGE.time; f.face = a; f.invT = DODGE.time; f.cd.dodge = DODGE.cd;
  F.events.push({ type: 'dodge', id: f.id });
  return true;
}

// ---------------------------------------------------------------- damage
function hurt(F, from, to, raw, extra = {}) {
  if (!alive(to)) return 0;
  if (to.invT > 0) { F.events.push({ type: 'miss', id: from.id, to: to.id, x: to.x, z: to.z, why: 'dodged' }); return 0; }
  let dmg = raw * from.mods.dmgMul * from.dmgK * (0.9 + F.rand() * 0.2);
  dmg *= 1 - to.mods.armor;
  let blocked = false;
  if (to.blockT > 0) { dmg *= 1 - to.def.special.cut; blocked = true; }
  dmg = Math.max(1, Math.round(dmg));
  to.hp = Math.max(0, to.hp - dmg);
  from.stats.dealt += dmg; from.stats.hits++; to.stats.taken += dmg;
  if (from.mods.leech > 0 && alive(from)) from.hp = Math.min(from.max, from.hp + dmg * from.mods.leech);
  F.events.push({ type: 'hit', id: from.id, to: to.id, dmg, x: to.x, z: to.z, blocked, ...extra });
  if (to.hp <= 0) {
    to.state = 'dead'; to.st = 0; to.blockT = 0;
    F.zones = F.zones.filter(z => z.by !== to.id);
    F.events.push({ type: 'death', id: to.id, by: from.id });
  } else if (!blocked && (to.state === 'idle' || to.state === 'move' || ((to.state === 'attack' || to.state === 'special') && !to.landed && dmg >= STAGGER_AT && to.def.special.kind !== 'block'))) {
    if (to.state === 'special' && to.act?.kind === 'blast') F.zones = F.zones.filter(z => z.by !== to.id);
    to.state = 'hit'; to.st = 0; to.dur = FLINCH;
  }
  return dmg;
}

function landMelee(F, f, reach, arcDeg, raw, extra) {
  let any = false;
  for (const o of foesOf(F, f)) {
    const d = dist(f, o);
    if (d > reach + o.radius) continue;
    if (Math.abs(angDiff(f.face, angTo(f, o))) > (arcDeg * RAD) / 2 && d > f.radius + o.radius + 0.15) continue;
    hurt(F, f, o, raw, extra); any = true;
  }
  if (!any) F.events.push({ type: 'miss', id: f.id, x: f.x + Math.sin(f.face) * reach, z: f.z + Math.cos(f.face) * reach });
}
function fire(F, f, ang, raw, extra = {}) {
  const sp = f.def.shot.speed, life = (f.def.range + 1) / sp;
  const s = { from: f.id, team: f.team, x: f.x + Math.sin(ang) * (f.radius + 0.3), z: f.z + Math.cos(ang) * (f.radius + 0.3), vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, life, dmg: raw, kind: f.def.kind, color: f.def.shot.color, id: F.nextId++, ...extra };
  F.shots.push(s);
  F.events.push({ type: 'shot', id: f.id, shot: s.id, kind: s.kind });
}

function land(F, f) {
  f.landed = true;
  const sp = f.def.special;
  if (f.state === 'attack') {
    if (f.def.kind === 'melee') landMelee(F, f, f.def.reach, BASIC_ARC, f.def.dmg);
    else {
      const o = nearestFoe(F, f);
      if (o && dist(f, o) <= f.def.range + 2) f.face = angTo(f, o);
      fire(F, f, f.face, f.def.dmg);
    }
    return;
  }
  switch (sp.kind) {
    case 'heavy': landMelee(F, f, f.def.reach + 0.3, sp.arc, sp.dmg, { special: true }); break;
    case 'lunge': landMelee(F, f, f.def.reach + 0.4, 100, sp.dmg, { special: true }); break;
    case 'volley': {
      const o = nearestFoe(F, f); if (o && dist(f, o) <= f.def.range + 2) f.face = angTo(f, o);
      for (let i = 0; i < sp.count; i++) fire(F, f, f.face + (i - (sp.count - 1) / 2) * sp.spread * RAD, sp.dmg, { special: true });
      break;
    }
    case 'blast': break;                   // the zone goes off on its own timer (stepZones)
    case 'scream': case 'roar': {
      F.events.push({ type: 'shout', id: f.id, x: f.x, z: f.z, r: sp.radius, kind: sp.kind });
      for (const o of foesOf(F, f)) {
        if (dist(f, o) > sp.radius + o.radius) continue;
        if (o.invT > 0) { F.events.push({ type: 'miss', id: f.id, to: o.id, x: o.x, z: o.z, why: 'dodged' }); continue; }
        hurt(F, f, o, sp.dmg, { special: true });
        if (!alive(o)) continue;
        if (sp.slow) { o.slowT = sp.for; o.slowK = sp.slow; F.events.push({ type: 'status', id: o.id, what: 'slow', for: sp.for }); }
        if (sp.stun) { o.stunT = sp.stun; o.state = 'hit'; o.st = 0; o.dur = sp.stun; o.blockT = 0; F.events.push({ type: 'status', id: o.id, what: 'stun', for: sp.stun }); }
      }
      break;
    }
    case 'block': break;
  }
}

// ---------------------------------------------------------------- the step
export function step(F, dt, input = {}) {
  if (F.over) { F.t += dt; tickBodies(F, dt, true); return F; }
  F.t += dt;
  for (const f of F.fighters) { f.px = f.x; f.pz = f.z; }
  for (const f of F.fighters) {
    if (!alive(f)) { f.st += dt; continue; }
    for (const k in f.cd) f.cd[k] = Math.max(0, f.cd[k] - dt);
    f.slowT = Math.max(0, f.slowT - dt); f.stunT = Math.max(0, f.stunT - dt); f.invT = Math.max(0, f.invT - dt); f.blockT = Math.max(0, f.blockT - dt);
    if (f.ctrl === 'player') drivePlayer(F, f, input); else if (f.ctrl === 'idle') { f.mx = f.mz = 0; } else think(F, f, dt);   // 'idle' stands still (tests)
  }
  tickBodies(F, dt, false);
  stepShots(F, dt);
  stepZones(F, dt);
  separate(F);
  const teams = [0, 1].map(t => F.fighters.some(f => f.team === t && alive(f)));
  if (!teams[0] || !teams[1]) { F.over = true; F.winner = teams[0] ? 0 : teams[1] ? 1 : null; F.events.push({ type: 'end', winner: F.winner }); }
  return F;
}

function drivePlayer(F, f, inp) {
  f.mx = clamp(inp.mx || 0, -1, 1); f.mz = clamp(inp.mz || 0, -1, 1);
  const m = Math.hypot(f.mx, f.mz); if (m > 1) { f.mx /= m; f.mz /= m; }
  if (inp.dodge) tryDodge(F, f, f.mx, f.mz);
  if (inp.special) trySpecial(F, f);
  if (inp.attack) tryAttack(F, f);
}

function tickBodies(F, dt, frozen) {
  for (const f of F.fighters) {
    if (!alive(f)) continue;
    f.st += dt;
    if (frozen) { if (f.state !== 'idle') { f.state = 'idle'; } continue; }
    if (f.state === 'dodge') {
      const v = DODGE.dist / DODGE.time;
      f.x += Math.sin(f.face) * v * dt; f.z += Math.cos(f.face) * v * dt;
      if (f.st >= f.dur) f.state = 'idle';
    } else if (f.state === 'attack' || f.state === 'special') {
      const sp = f.def.special;
      if (f.state === 'special' && sp.kind === 'lunge' && !f.landed) {
        const v = sp.dash / (sp.time * sp.land);
        const o = nearestFoe(F, f);
        if (!o || dist(f, o) > f.radius + o.radius + 0.6) { f.x += Math.sin(f.face) * v * dt; f.z += Math.cos(f.face) * v * dt; }
      } else if (!f.landed && f.state === 'attack') {
        const o = nearestFoe(F, f);              // keep turning toward the foe during the wind-up (a slow turn, dodgeable)
        if (o && dist(f, o) < rangeOf(f) + 3) f.face += clamp(angDiff(f.face, angTo(f, o)), -4 * dt, 4 * dt);
      }
      if (!f.landed && f.st >= f.dur * f.act.land) land(F, f);
      if (f.st >= f.dur) { f.state = 'idle'; f.act = null; }
    } else if (f.state === 'hit') {
      if (f.st >= f.dur && f.stunT <= 0) f.state = 'idle';
    } else {
      const m = Math.hypot(f.mx, f.mz);
      if (m > 0.15) {
        const sp = speedOf(f) * Math.min(1, m);
        f.x += (f.mx / m) * sp * dt; f.z += (f.mz / m) * sp * dt;
        const want = Math.atan2(f.mx, f.mz);
        f.face += clamp(angDiff(f.face, want), -12 * dt, 12 * dt);
        f.state = 'move';
      } else f.state = 'idle';
    }
    const r = Math.hypot(f.x, f.z), lim = F.R - f.radius;
    if (r > lim) { f.x *= lim / r; f.z *= lim / r; }
  }
}

function stepShots(F, dt) {
  for (const s of F.shots) {
    s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
    if (Math.hypot(s.x, s.z) > F.R + 0.5) s.life = 0;
    if (s.life <= 0) continue;
    const from = F.fighters.find(f => f.id === s.from);
    for (const o of F.fighters) {
      if (o.team === s.team || !alive(o)) continue;
      if (Math.hypot(o.x - s.x, o.z - s.z) > o.radius + 0.25) continue;
      if (o.invT > 0) continue;                    // a dodge passes through it
      hurt(F, from, o, s.dmg, { shot: s.id, special: !!s.special });
      s.life = 0; s.hit = true; break;
    }
    if (s.life <= 0) F.events.push({ type: 'shot-end', shot: s.id, x: s.x, z: s.z, hit: !!s.hit, kind: s.kind });
  }
  F.shots = F.shots.filter(s => s.life > 0);
}

function stepZones(F, dt) {
  for (const z of F.zones) {
    z.t -= dt;
    if (z.t > 0) continue;
    const from = F.fighters.find(f => f.id === z.by);
    F.events.push({ type: 'blast', id: z.by, x: z.x, z: z.z, r: z.r });
    for (const o of F.fighters) {
      if (o.team === z.team || !alive(o)) continue;
      if (Math.hypot(o.x - z.x, o.z - z.z) > z.r + o.radius * 0.5) continue;
      hurt(F, from, o, z.dmg, { special: true });
    }
  }
  F.zones = F.zones.filter(z => z.t > 0);
}

function separate(F) {
  const L = F.fighters.filter(alive);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j], d = dist(a, b), min = a.radius + b.radius;
    if (d >= min || d < 1e-6) continue;
    const push = (min - d) / 2, nx = (b.x - a.x) / d, nz = (b.z - a.z) / d;
    a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
  }
}

// ---------------------------------------------------------------- bots
function think(F, f, dt) {
  const ai = f.ai;
  ai.wait = Math.max(0, ai.wait - dt);
  ai.think -= dt;
  const o = nearestFoe(F, f);
  if (!o) { f.mx = f.mz = 0; return; }
  const d = dist(f, o), a = angTo(f, o), ranged = f.def.kind !== 'melee', sp = f.def.special;
  // react to a foe's big wind-up: maybe dodge out (hard bots more often), or raise the shield
  const threat = (o.state === 'special' || (o.state === 'attack' && o.def.kind === 'melee')) && !o.landed && o.st < 0.12 && d < rangeOf(o) + 1.5;
  if (threat && !busy(f)) {
    if (sp.kind === 'block' && f.cd.sp <= 0 && F.rand() < 0.5 + F.diff.dodge) { trySpecial(F, f); return; }
    if (F.rand() < F.diff.dodge) { const side = a + (Math.PI / 2) * ai.strafe + Math.PI * 0.25 * ai.strafe; tryDodge(F, f, Math.sin(side + Math.PI), Math.cos(side + Math.PI)); return; }
  }
  if (ai.think <= 0) { ai.think = F.diff.react * (0.6 + F.rand() * 0.8); if (F.rand() < 0.2) ai.strafe = -ai.strafe; }
  if (ai.wait > 0 || busy(f)) { f.mx = f.mz = 0; return; }
  // specials
  if (f.cd.sp <= 0) {
    const want =
      sp.kind === 'heavy' ? d < f.def.reach + o.radius :
      sp.kind === 'lunge' ? d > 2.4 && d < sp.dash + f.def.reach :
      sp.kind === 'scream' || sp.kind === 'roar' ? d < sp.radius * 0.7 :
      sp.kind === 'blast' ? d < f.def.range && F.rand() < 0.04 :
      sp.kind === 'volley' ? d < f.def.range * 0.9 && F.rand() < 0.05 : false;
    if (want && trySpecial(F, f)) { f.mx = f.mz = 0; return; }
  }
  let mx = 0, mz = 0;
  const toward = [Math.sin(a), Math.cos(a)], side = [Math.cos(a) * ai.strafe, -Math.sin(a) * ai.strafe];
  if (!ranged) {
    const reach = f.def.reach + o.radius;
    if (d > reach * 0.85) { mx = toward[0] + side[0] * 0.25; mz = toward[1] + side[1] * 0.25; }
    else if (f.cd.atk <= 0) { tryAttack(F, f); f.mx = f.mz = 0; return; }
    else { mx = side[0] * 0.35; mz = side[1] * 0.35; }
  } else {
    const lo = 5.5, hi = Math.min(9.5, f.def.range * 0.85);
    if (d < lo) { mx = -toward[0] + side[0] * 0.6; mz = -toward[1] + side[1] * 0.6; if (d < 2.8 && F.rand() < F.diff.dodge * 0.05) tryDodge(F, f, mx, mz); }
    else if (d > hi) { mx = toward[0]; mz = toward[1]; }
    else if (f.cd.atk <= 0) { tryAttack(F, f); f.mx = f.mz = 0; return; }
    else { mx = side[0] * 0.7; mz = side[1] * 0.7; }
    // backing into the wall: slide along it instead
    if (Math.hypot(f.x, f.z) > F.R - 2) { mx = side[0]; mz = side[1]; }
  }
  const m = Math.hypot(mx, mz) || 1; f.mx = mx / m; f.mz = mz / m;
}
