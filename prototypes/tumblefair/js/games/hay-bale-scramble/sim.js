// HAY BALE SCRAMBLE — musical bales in a round farmyard. A fiddler stands on a barrel in the middle; round him, a ring
// of hay bales turns slowly like a carousel while the tune plays. When the music STOPS (the ring stops turning too),
// dash to a free bale and press A to sit on it — first come, first seated. There is always one bale fewer than
// players: whoever is left standing is out and goes to cheer from the hay wagon. Then one bale goes and it starts
// again, until one player is left. Pressing A while the music still plays (watch out for the fiddler's hiccups!)
// makes you stumble. B is a barge: shove someone out of your way (seated players cannot be shoved).
// Alone: five bales, and once the music stops they VANISH one by one — sit before the last one goes. Every time you
// make it there is one bale fewer and they vanish faster; three misses and you are out. Score = rounds you sat in time.
import { makeBody, stepBody, separate, clampToArena, collideObstacles, spawnRing, F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export const meta = {
  id: 'hay-bale-scramble', title: 'Hay Bale Scramble', blurb: 'When the fiddle stops, grab a hay bale — the last one standing is out!',
  how: ['Walk round the bales while the fiddle plays.', 'Music stops? Run to a free bale and press A to sit!', 'One bale too few — whoever is left standing is out.', 'B barges. Press A too soon and you stumble!'],
  kind: 'arena', min: 1, max: 4, seconds: 100, scoring: 'survival', unit: 'rounds', tags: ['action'],
  controls: { stick: true, a: 'Sit', b: 'Barge' }, move: { speed: 5.2, accel: 22, stunDrag: 2.5 },
  arena: { shape: 'circle', r: 7.2, wall: true, posts: [{ x: 0, z: 0, r: 0.75 }], blocks: [{ x: 0, z: -6.0, hw: 2.2, hd: 0.75 }] }, pitch: 58, card: 'card-hay-bale-scramble', css: true,
};

export const RULES = {
  ready: 2.4, music: [5, 9], hiccupChance: 0.4, hiccup: 0.5, scramble: 5, result: 2.6, endPause: 2.4,
  sitR: 1.55,                        // press A this close to a free bale's middle to sit
  spin: 0.55, spinUp: 0.1,           // ring turn speed (rad/s), a bit faster every round
  stumble: 0.6,                      // pressing A while the music plays
  bargeCool: 1.4, bargeSpeed: 10.5, bargeTime: 0.25, bargeR: 1.05, bargePush: 7.5, bargeStun: 0.55,
  solo: { bales: 5, tries: 3, vanish: 0.85, vanishMin: 0.38, vanishStep: 0.09, firstWait: 1.8 },
  wagon: { z: -6.0, y: 0.95, xs: [-1.5, -0.5, 0.5, 1.5] },
};
const READY = 0, MUSIC = 1, SCRAMBLE = 2, RESULT = 3, DONE = 4;
export const PHASES = ['ready', 'music', 'scramble', 'result', 'done'];
const r2 = v => Math.round(v * 1000) / 1000;

export function create({ rng, players }) {
  const n = players.length, solo = n === 1, bodies = new Map(), spawns = spawnRing(n, 5, Math.PI / 4 + Math.PI / 2);
  players.forEach((p, i) => { const b = makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw); b.flags = F.FROZEN; bodies.set(p.pid, b); });
  const P = new Map(players.map(p => [p.pid, { prevB: 0, seat: -1, out: false, outRound: -1, rounds: 0, stun: 0, bargeCool: 0, barge: 0, hitSet: new Set() }]));
  let phase = READY, pt = RULES.ready, round = 0, time = meta.seconds, over = false, endIn = -1;
  let soloK = RULES.solo.bales, tries = RULES.solo.tries, k = 0, ang = 0, dir = 1, omega = 0, bales = [], hic = -1, hicLeft = 0, vanishIn = 0, outs = [], again = false;
  const events = [];
  const lvl = () => (solo ? P.get(players[0].pid).rounds : round - 1);       // how far along: speeds things up
  const active = () => players.filter(p => !P.get(p.pid).out);
  const ringR = () => 2.2 + 0.36 * Math.max(1, k);
  const baleAt = i => { const a = ang + i * Math.PI * 2 / k, r = ringR(); return { x: Math.sin(a) * r, z: Math.cos(a) * r, a }; };
  function startRound() {
    round++; again = false; outs = [];
    k = solo ? soloK : active().length - 1;
    bales = Array.from({ length: k }, () => -1);              // -1 free, pid = sat on, -2 gone (solo)
    dir = rng.chance(0.5) ? 1 : -1; omega = (RULES.spin + RULES.spinUp * lvl()) * dir;
    phase = MUSIC; pt = rng.range(RULES.music[0], RULES.music[1]) - Math.min(2, round * 0.4);
    hic = rng.chance(RULES.hiccupChance) && pt > 3 ? rng.range(1.2, pt - 1.4) : -1;      // time left on the music clock when it hiccups
    for (const p of active()) { const s = P.get(p.pid), b = bodies.get(p.pid); s.seat = -1; b.flags &= ~(F.FROZEN | F.STUN); b.y = 0; s.stun = 0; }
    events.push({ e: 'music', round, k });
  }
  function sit(pid, i) {
    const s = P.get(pid), b = bodies.get(pid), at = baleAt(i);
    bales[i] = pid; s.seat = i; s.barge = 0;
    b.x = r2(at.x); b.z = r2(at.z); b.y = 0.72; b.vx = b.vz = 0; b.yaw = Math.atan2(at.x, at.z); b.flags = (b.flags & ~F.STUN) | F.FROZEN;
    events.push({ e: 'sit', pid, i });
  }
  function knockOut(pid) {
    const s = P.get(pid); s.out = true; s.outRound = round; outs.push(pid);
  }
  function toWagon() {
    const outList = players.filter(p => P.get(p.pid).out);
    outList.forEach((p, j) => { const b = bodies.get(p.pid); b.x = RULES.wagon.xs[j % 4]; b.z = RULES.wagon.z; b.y = RULES.wagon.y; b.yaw = 0; b.vx = b.vz = 0; b.flags = F.FROZEN | F.GHOST; });
  }
  function endScramble() {
    const standing = active().filter(p => P.get(p.pid).seat < 0).map(p => p.pid);
    if (solo) {
      // alone: three tries; sitting in time takes a bale away for next time, missing costs a try (same bales again)
      if (standing.length) { tries--; if (tries <= 0) knockOut(standing[0]); else again = true; }
      else { P.get(players[0].pid).rounds++; soloK = Math.max(1, soloK - 1); }
    } else if (standing.length === active().length) again = true;                // nobody sat: play the round again
    else { for (const pid of standing) knockOut(pid); for (const p of active()) P.get(p.pid).rounds++; }
    phase = RESULT; pt = RULES.result;
    events.push({ e: 'result', outs: [...outs], again, tries: solo ? tries : undefined });
  }
  function finishGame() {
    phase = DONE; endIn = RULES.endPause;
    const left = active();
    for (const b of bodies.values()) { b.flags |= F.FROZEN; b.vx = b.vz = 0; }
    events.push({ e: 'done', win: !solo && left.length === 1 ? left[0].pid : null });
  }
  return {
    bodies, events,
    init: () => ({ solo, tries: RULES.solo.tries, wagon: RULES.wagon, left: Math.ceil(time) }),
    input(pid, inp) {
      const b = bodies.get(pid), s = P.get(pid); if (!b || over) return;
      const bits = inp?.b | 0, pa = (bits & IN.A) && !(s.prevB & IN.A), pb = (bits & IN.B) && !(s.prevB & IN.B); s.prevB = bits;
      if (s.out || s.seat >= 0 || phase === READY || phase === DONE) return;
      const free = !(b.flags & F.STUN);
      if (pa && free) {
        if (phase === MUSIC) { b.flags |= F.STUN; s.stun = RULES.stumble; b.vx *= 0.2; b.vz *= 0.2; events.push({ e: 'stumble', pid }); }
        else if (phase === SCRAMBLE) {
          let best = -1, bd = RULES.sitR;
          for (let i = 0; i < k; i++) { if (bales[i] !== -1) continue; const at = baleAt(i), d = Math.hypot(at.x - b.x, at.z - b.z); if (d < bd) { bd = d; best = i; } }
          if (best >= 0) sit(pid, best); else events.push({ e: 'miss', pid, to: pid });
        }
      }
      if (pb && free && s.bargeCool <= 0 && s.seat < 0) {
        const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
        s.bargeCool = RULES.bargeCool; s.barge = RULES.bargeTime; s.hitSet.clear(); b.vx = fx * RULES.bargeSpeed; b.vz = fz * RULES.bargeSpeed;
        events.push({ e: 'barge', pid });
      }
      if (s.seat < 0) stepBody(b, inp, meta.move, meta.arena);
    },
    step(dt) {
      if (over) return;
      if (endIn >= 0) { endIn -= dt; if (endIn <= 0) over = true; return; }
      time -= dt;
      { const list = [...bodies].filter(([pid]) => !P.get(pid).out && P.get(pid).seat < 0).map(([, b]) => b); separate(list); for (const b of list) { clampToArena(b, meta.arena); collideObstacles(b, meta.arena); } }
      for (const [pid, b] of bodies) {
        const s = P.get(pid); if (s.out) continue;
        if (s.bargeCool > 0) s.bargeCool -= dt;
        if (s.stun > 0) { s.stun -= dt; if (s.stun <= 0) b.flags &= ~F.STUN; }
        if (s.barge > 0) {
          s.barge -= dt;
          for (const [qid, c] of bodies) {
            const q = P.get(qid); if (qid === pid || q.out || q.seat >= 0 || s.hitSet.has(qid)) continue;
            const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz); if (d > RULES.bargeR) continue;
            s.hitSet.add(qid); c.vx = dx / (d || 1) * RULES.bargePush; c.vz = dz / (d || 1) * RULES.bargePush; c.flags |= F.STUN; q.stun = RULES.bargeStun;
            b.vx *= 0.3; b.vz *= 0.3; events.push({ e: 'shove', pid: qid, by: pid, x: Math.round(c.x * 100) / 100, z: Math.round(c.z * 100) / 100 });
          }
        }
      }
      pt -= dt;
      if (phase === READY) { if (pt <= 0) startRound(); }
      else if (phase === MUSIC) {
        ang += omega * dt;
        if (hicLeft > 0) { hicLeft -= dt; if (hicLeft <= 0) events.push({ e: 'resume' }); }
        if (hic > 0 && pt <= hic) { hic = -1; hicLeft = RULES.hiccup; events.push({ e: 'hiccup' }); }
        if (pt <= 0) { phase = SCRAMBLE; pt = solo ? 99 : RULES.scramble; hicLeft = 0; vanishIn = Math.max(1.0, RULES.solo.firstWait - 0.1 * lvl()); events.push({ e: 'stop' }); }
      } else if (phase === SCRAMBLE) {
        if (solo) {
          const me = P.get(players[0].pid);
          if (me.seat >= 0) endScramble();
          else {
            vanishIn -= dt;
            if (vanishIn <= 0) {
              const free = bales.map((o, i) => o === -1 ? i : -1).filter(i => i >= 0), i = rng.pick(free);
              bales[i] = -2; vanishIn = Math.max(RULES.solo.vanishMin, RULES.solo.vanish - RULES.solo.vanishStep * lvl());
              events.push({ e: 'vanish', i });
              if (free.length <= 1) endScramble();
            }
          }
        } else if (bales.every(o => o !== -1) || pt <= 0) endScramble();
      } else if (phase === RESULT) {
        if (pt <= 0) {
          toWagon();
          const left = active().length;
          if ((solo && left === 0) || (!solo && left <= 1)) finishGame(); else startRound();
        }
      }
      if (time <= 0 && phase !== DONE) { time = 0; toWagon(); finishGame(); }
    },
    state() {
      const sc = {}, out = {};
      for (const p of players) { const s = P.get(p.pid); sc[p.pid] = s.rounds; if (s.out) out[p.pid] = 1; }
      return { ph: PHASES[phase], r: round, a: Math.round(ang * 1000) / 1000, w: phase === MUSIC ? Math.round(omega * 1000) / 1000 : 0, rr: Math.round(ringR() * 100) / 100, bl: bales, h: hicLeft > 0 ? 1 : 0, sc, out, ...(solo ? { tr: tries } : {}), left: Math.ceil(Math.max(0, time)) };
    },
    get over() { return over; },
    result() {
      const scores = {}, groups = new Map();
      for (const p of players) {
        const s = P.get(p.pid); scores[p.pid] = s.rounds;
        const key = (s.out ? s.outRound : 999) * 100 + s.rounds;
        if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p.pid);
      }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(key => groups.get(key)), scores, unit: meta.unit };
    },
    get phase() { return PHASES[phase]; }, get round() { return round; }, bale: i => baleAt(i), get bales() { return bales; },
  };
}
