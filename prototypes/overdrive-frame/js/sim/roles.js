// Round 5 enemy roles (PLAN R5 "full enemy role list"; each kind has ONE readable job). enemies.js merges ROLE_JOBS
// into its JOBS table, mission.js calls stepRoles once a step and asks shieldMul / addCloud. Numbers live in
// data/enemies.json. Pure: no DOM, randomness from S.rng.
//
//   flame     (Flamer)        walks in close, a pilot-light flicker (state 'light'), then a short fire cone (state
//                             'spray') that burns every frame inside it (the 'burn' status from damage.js)
//   shieldgen (Bulwark)       hangs back behind other army units and holds a dome up: army units inside take less
//                             damage (e.shielded / e.shieldBy). Killing the projector drops the dome at once
//   heal      (Field medic)   flies to the most hurt army unit nearby and heals it with a beam (e.healing = its id),
//                             keeps away from frames, and runs for a moment whenever it is shot
//   drift     (Spore drifter) drifts at the frames and bursts into a gas cloud (S.clouds) that slows a frame inside it
//                             (the 'slow' status: mech.js moves it at STATUS.slow.mul while it lasts). Shot down, it
//                             bursts too — so shoot it far away
import { addStatus } from './damage.js';

const angleDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
function seek(e, ux, uz, speed, dt, grip = 4) { e.vx += (ux * speed - e.vx) * Math.min(1, grip * dt); e.vz += (uz * speed - e.vz) * Math.min(1, grip * dt); }
const unit = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
/** Frames (and escort trucks) a cone or a cloud can reach: players' mechs that are standing, never a rival frame. */
function* targets(S) {
  for (const m of S.mechs) if (!m.down && m.team !== 'enemy') yield m;
  if (S.allies) for (const a of S.allies) if (!a.down && !a.arrived) yield a;
}
const isArmy = (S, o) => S.kinds[o.kind]?.faction === 'army';

export const ROLE_JOBS = {
  flame(S, e, K, P, g, dt) {
    const dmg = K.dmg * S.T.enemyDamage * (e.elite ? 1.5 : 1);
    if (e.state === 'light') {                       // the telegraph: stands, a pilot light flickers at the nozzle
      e.stateT -= dt; e.vx *= 0.7; e.vz *= 0.7; e.aim = g.toP; e.face = g.toP; e.anim = 'light';
      if (e.stateT <= 0) { e.state = 'spray'; e.stateT = K.spray; e.tick = 0; S.events.push({ type: 'flameOn', id: e.id, x: e.x, z: e.z, dir: e.aim }); }
      return;
    }
    if (e.state === 'spray') {                       // the cone: turns slowly after its target, burns what is inside
      e.stateT -= dt; e.vx *= 0.7; e.vz *= 0.7; e.anim = 'fire';
      e.aim += Math.max(-K.turn * dt, Math.min(K.turn * dt, angleDiff(g.toP, e.aim))); e.face = e.aim;
      e.tick -= dt;
      if (e.tick <= 0) {
        e.tick = K.tick;
        for (const m of targets(S)) {
          const dx = m.x - e.x, dz = m.z - e.z, d = Math.hypot(dx, dz);
          if (d > K.range + (m.r || 0.2) || Math.abs(angleDiff(Math.atan2(dz, dx), e.aim)) > K.arc) continue;
          S.hurtPlayer(m, dmg * K.tick, 'fire', e);
          if (!m.ally) addStatus(m, 'burn', dmg * K.tick * 3);
        }
        S.events.push({ type: 'flame', id: e.id, x: e.x, z: e.z, dir: e.aim, r: K.range, arc: K.arc });
      }
      if (e.stateT <= 0) { e.state = 'move'; e.cd = K.cd * S.rng.range(0.85, 1.15); }
      return;
    }
    const see = S.canSee(e, P);
    if (g.dist > K.range * 0.8 || !see) { seek(e, g.ux, g.uz, K.speed * g.slow, dt); e.anim = 'walk'; e.face = Math.atan2(e.vz, e.vx) || g.toP; }
    else { e.vx *= 0.8; e.vz *= 0.8; e.face = g.toP; e.anim = 'walk'; }
    if (g.dist < K.range + P.r && see && e.cd <= 0) { e.state = 'light'; e.stateT = K.light; e.aim = g.toP; S.events.push({ type: 'flameLight', id: e.id, x: e.x, z: e.z, dir: g.toP, t: K.light }); }
  },

  shieldgen(S, e, K, P, g, dt) {
    // stand behind the middle of the army units near it (the side away from the frame), never closer than `keep`
    let n = 0, cx = 0, cz = 0;
    for (const o of S.enemies) {
      if (o === e || o.dead || o.state === 'warn' || !isArmy(S, o) || S.kinds[o.kind].job === 'shieldgen') continue;
      if ((o.x - e.x) ** 2 + (o.z - e.z) ** 2 > K.gather * K.gather) continue;
      cx += o.x; cz += o.z; n++;
    }
    let wx, wz;
    if (n) { cx /= n; cz /= n; const [ax, az] = unit(cx - P.x, cz - P.z); wx = cx + ax * K.behind; wz = cz + az * K.behind; }
    else { const k = g.dist < K.keep ? -1 : 1; wx = e.x + g.ux * k; wz = e.z + g.uz * k; }
    let [mx, mz] = unit(wx - e.x, wz - e.z);
    const far = Math.hypot(wx - e.x, wz - e.z);
    if (g.dist < K.keep) { mx -= g.ux * 1.5; mz -= g.uz * 1.5; [mx, mz] = unit(mx, mz); }
    if (far < 0.3 && g.dist >= K.keep) { e.vx *= 0.8; e.vz *= 0.8; e.anim = 'project'; }
    else { seek(e, mx, mz, K.speed * g.slow, dt, 3); e.anim = 'walk'; }
    e.face = e.anim === 'walk' ? (Math.atan2(e.vz, e.vx) || g.toP) : g.toP;
  },

  heal(S, e, K, P, g, dt) {
    // shot at → runs straight away from the frame for a moment (and stops healing)
    if (e._hp != null && e.hp < e._hp - 0.5) { e.fleeT = K.flee; if (e.healing) S.events.push({ type: 'ehealStop', id: e.id }); e.healing = null; }
    e._hp = e.hp;
    if (e.fleeT > 0) { e.fleeT -= dt; seek(e, -g.ux, -g.uz, K.speed * 1.25 * g.slow, dt, 5); e.face = Math.atan2(e.vz, e.vx); e.anim = 'fly'; return; }
    // the most hurt army unit in reach (re-picked twice a second)
    e.pickT = (e.pickT || 0) - dt;
    let T = e.healTarget && S.byId.get(e.healTarget);
    if (e.pickT <= 0 || !T || T.dead || T.hp >= T.hpMax) {
      e.pickT = 0.5; T = null; let worst = 0.98;
      for (const o of S.enemies) {
        if (o === e || o.dead || o.state === 'warn' || o.hidden || o.parts || o.dummy || !isArmy(S, o) || S.kinds[o.kind].job === 'heal') continue;
        if ((o.x - e.x) ** 2 + (o.z - e.z) ** 2 > K.seek * K.seek) continue;
        const f = o.hp / o.hpMax; if (f < worst) { worst = f; T = o; }
      }
      e.healTarget = T ? T.id : null;
    }
    let mx, mz;
    if (T) {   // hover just behind it (the side away from the frame), so the patient is in the way of your shots
      const [bx, bz] = unit(T.x - P.x, T.z - P.z);
      [mx, mz] = unit(T.x + bx * K.reach * 0.6 - e.x, T.z + bz * K.reach * 0.6 - e.z);
    } else { const k = g.dist < K.keep ? -1 : g.dist > K.keep + 1.5 ? 0.6 : 0; mx = g.ux * k; mz = g.uz * k; }
    if (g.dist < K.keep) { const push = (K.keep - g.dist) / K.keep * 2.5; mx -= g.ux * push; mz -= g.uz * push; }   // keep away from frames
    seek(e, mx, mz, K.speed * g.slow, dt, 3);
    const heal = T && Math.hypot(T.x - e.x, T.z - e.z) < K.reach;
    if (heal) {
      const n = Math.min(T.hpMax - T.hp, K.heal * S.T.enemyHealth * (S.hpScale || 1) * dt);
      T.hp += n; e.healAcc = (e.healAcc || 0) + n;
      if (e.healing !== T.id) { e.healing = T.id; S.events.push({ type: 'eheal', id: e.id, target: T.id, x: e.x, z: e.z, start: true }); }
      e.healEv = (e.healEv || 0) - dt;
      if (e.healEv <= 0 && e.healAcc >= 1) { e.healEv = 0.6; S.events.push({ type: 'eheal', id: e.id, target: T.id, amount: Math.round(e.healAcc), x: T.x, z: T.z, y: T.flying || 0.25 }); e.healAcc = 0; }
      e.face = Math.atan2(T.z - e.z, T.x - e.x); e.anim = 'heal';
    } else {
      if (e.healing) S.events.push({ type: 'ehealStop', id: e.id });
      e.healing = null; e.face = Math.atan2(e.vz, e.vx) || g.toP; e.anim = 'fly';
    }
  },

  drift(S, e, K, P, g, dt) {
    // a lazy, wobbling drift at the nearest frame; bursts beside it
    const w = e.t * 1.3 + (e.id.charCodeAt(e.id.length - 1) % 7);
    const [mx, mz] = unit(g.ux + Math.sin(w) * 0.45, g.uz + Math.cos(w * 0.8) * 0.45);
    seek(e, mx, mz, K.speed * g.slow, dt, 1.5);
    e.face = g.toP; e.anim = 'drift';
    if (g.dist < K.range + (P.r || 0.2)) S.killEnemy(e, null, true);     // killEnemy → addCloud (K.cloud)
  },
};

/** A spore cloud where a drifter burst (mission.js killEnemy calls this for kinds with `cloud`). */
export function addCloud(S, e, K) {
  S.clouds ||= [];
  const c = { id: 'c' + (S.nextId++), x: e.x, z: e.z, r: K.cloud, t: K.cloudTime, life: K.cloudTime };
  S.clouds.push(c);
  S.events.push({ type: 'cloud', id: c.id, x: c.x, z: c.z, r: c.r, t: c.t });
  return c;
}

/** The damage multiplier for an enemy hit now: less inside a LIVING bulwark's dome (mission.js damageEnemy). */
export function shieldMul(S, e) {
  if (!e.shieldBy) return 1;
  const b = S.byId.get(e.shieldBy);
  if (!b || b.dead || Math.hypot(b.x - e.x, b.z - e.z) > S.kinds[b.kind].dome) return 1;
  return 1 - (S.kinds[b.kind].shieldCut ?? 0.5);
}

/** Once a step: which army units stand inside a dome (e.shielded for the renderer, e.shieldBy for shieldMul), and the
 *  spore clouds (they fade; a frame inside is slowed, and stays slowed STATUS.slow.time after it walks out). */
export function stepRoles(S, dt) {
  const domes = [];
  for (const e of S.enemies) if (!e.dead && e.state !== 'warn' && S.kinds[e.kind]?.job === 'shieldgen') domes.push(e);
  if (domes.length || S._domes) {
    for (const e of S.enemies) {
      if (e.dead) continue;
      let by = null;
      if (domes.length && isArmy(S, e)) for (const b of domes) {
        if (b === e) continue;                                          // the projector is never inside its own dome
        if ((b.x - e.x) ** 2 + (b.z - e.z) ** 2 < S.kinds[b.kind].dome ** 2) { by = b.id; break; }
      }
      e.shieldBy = by; e.shielded = !!by;
    }
    S._domes = domes.length;
  }
  if (!S.clouds?.length) return;
  for (const c of S.clouds) {
    c.t -= dt;
    for (const m of S.mechs) {
      if (m.down || m.team === 'enemy') continue;
      if (Math.hypot(m.x - c.x, m.z - c.z) > c.r + (m.r || 0.2) * 0.5) continue;
      if (!(m.status?.slow > 0)) S.events.push({ type: 'slowed', id: m.id, x: m.x, z: m.z });
      addStatus(m, 'slow');
    }
  }
  S.clouds = S.clouds.filter(c => c.t > 0);
}
