// A STAND-IN for js/sim/match.js, used only until the real sim exists (sim.js loads the real one first). It follows the
// contract in docs/PLAN.md closely enough to build the screens and the renderer against, with toy physics: fighters are
// points on flat floors, punches are a range check, nothing here is the real game. Two arenas in the planned shape.
const ARENAS = [
  { id: 'the-ring', name: 'The Ring', blurb: 'Ropes, a square ring and a long way down.', outY: -6,
    theme: { floor: '#e8d9b0', wall: '#c0392b', accent: '#2c7be5', sky: '#7fc8f8', ground: '#3a6b4a' },
    statics: [{ box: { p: [0, -0.5, 0], size: [12, 1, 12] } }, { cyl: { p: [-6, 0.75, -6], r: 0.2, h: 1.5 } }, { cyl: { p: [6, 0.75, -6], r: 0.2, h: 1.5 } }, { cyl: { p: [-6, 0.75, 6], r: 0.2, h: 1.5 } }, { cyl: { p: [6, 0.75, 6], r: 0.2, h: 1.5 } }],
    grab: [{ a: [-6, 1.2, -6], b: [6, 1.2, -6] }, { a: [-6, 1.2, 6], b: [6, 1.2, 6] }, { a: [-6, 1.2, -6], b: [-6, 1.2, 6] }, { a: [6, 1.2, -6], b: [6, 1.2, 6] }],
    kill: [], hazards: [], spawns: [[-3, 0, -3], [3, 0, 3], [3, 0, -3], [-3, 0, 3], [0, 0, -4], [0, 0, 4], [-4, 0, 0], [4, 0, 0]] },
  { id: 'saw-pit', name: 'Saw Pit', blurb: 'Spinning saws and a pit in the middle.', outY: -6,
    theme: { floor: '#9aa3ad', wall: '#444b55', accent: '#ffb000', sky: '#2b3440', ground: '#20262e' },
    statics: [{ box: { p: [-4, -0.5, 0], size: [6, 1, 14] } }, { box: { p: [4, -0.5, 0], size: [6, 1, 14] } }],
    kill: [{ kind: 'spikes', box: { p: [0, -2, 0], size: [2, 1, 14] } }],
    hazards: [{ id: 'saw1', kind: 'blade', p: [-4, 0, -3], r: 1.1, axis: 'z', track: [[-4, -5], [-4, 5]] }, { id: 'saw2', kind: 'blade', p: [4, 0, 3], r: 1.1, axis: 'x', track: [[2, 3], [6, 3]] }, { id: 'arm', kind: 'sweeper', p: [0, 0, 0], arms: [{ y: 0.6, len: 6, thick: 0.35, height: 0.35, angle: 0 }] }],
    spawns: [[-4, 0, -5], [4, 0, 5], [4, 0, -5], [-4, 0, 5], [-5, 0, 0], [5, 0, 0], [-3, 0, 2], [3, 0, -2]] },
];
const MODES = [{ id: 'versus', name: 'Versus' }, { id: 'teams', name: 'Teams' }, { id: 'waves', name: 'Waves' }];
const floorAt = (A, x, z) => {
  for (const s of A.statics) { const b = s.box; if (b && Math.abs(x - b.p[0]) <= b.size[0] / 2 && Math.abs(z - b.p[2]) <= b.size[2] / 2) return b.p[1] + b.size[1] / 2; }
  return -Infinity;
};
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function createMatch({ arena = 'the-ring', mode = 'versus', players = [], seed = 1, rounds = 3 } = {}) {
  const A = ARENAS.find(a => a.id === arena) || ARENAS[0], rng = mulberry(seed);
  let t = 0, phase = 'intro', phaseT = 2, round = 1, wave = mode === 'waves' ? 1 : undefined, over = false;
  const events = [], score = {}, inputs = {};
  const F = [];
  const spawn = (p, i) => { const s = A.spawns[i % A.spawns.length]; return { ...p, x: s[0], y: 1.2, z: s[2], vx: 0, vy: 0, vz: 0, face: Math.atan2(-s[0], -s[2]), alive: true, down: 0, downs: 0, daze: 0, hits: [], out: null, prev: {}, tapT: [0, 0], grip: [null, null], raise: [0, 0], walk: 0 }; };
  const addGoons = n => { for (let i = 0; i < n; i++) F.push(spawn({ pid: 100 + F.length, team: 9, bot: true, cpu: true, name: 'Goon' }, i + 3)); };
  players.forEach((p, i) => { F.push(spawn({ ...p, bot: !!p.cpu }, i)); score[p.pid] = 0; });
  if (mode === 'waves') addGoons(2);
  const live = () => F.filter(f => f.alive);
  function knock(f, dx, dz, k) { f.vx += dx * k; f.vz += dz * k; f.vy += 2.5; }
  function step(dt) {
    t += dt; phaseT -= dt;
    if (phase === 'intro' && phaseT <= 0) phase = 'fight';
    if (phase === 'roundEnd' && phaseT <= 0) {
      if (over) phase = 'over';
      else { round++; F.splice(0, F.length, ...F.filter(f => !f.bot || f.cpu && f.pid < 100).map((f, i) => spawn(f, i))); if (mode === 'waves') addGoons(2 + wave); phase = 'intro'; phaseT = 2; }
    }
    for (const f of F) {
      if (!f.alive) continue;
      let I = inputs[f.pid] || {};
      if (f.bot) {
        const foe = live().filter(o => o !== f && (o.team !== f.team || mode === 'versus')).sort((a, b) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z))[0];
        I = {};
        if (foe && phase === 'fight') { const dx = foe.x - f.x, dz = foe.z - f.z, d = Math.hypot(dx, dz) || 1; I.mx = dx / d; I.mz = dz / d; if (d < 1.3 && rng() < 0.06) I.grabL = !f.prev.grabL; }
      }
      if (phase !== 'fight') I = {};
      const ctl = f.down <= 0;
      if (ctl) {
        const sp = I.duck ? 1.8 : 4;
        f.vx += ((I.mx || 0) * sp - f.vx) * Math.min(1, dt * 10); f.vz += ((I.mz || 0) * sp - f.vz) * Math.min(1, dt * 10);
        if (Math.hypot(I.mx || 0, I.mz || 0) > 0.2) f.face = Math.atan2(I.mx, I.mz);
        const g = floorAt(A, f.x, f.z);
        if (I.jump && !f.prev.jump && f.y <= g + 0.01) f.vy = 5.5;
        ['grabL', 'grabR'].forEach((k, h) => {
          if (I[k] && !f.prev[k]) f.tapT[h] = t;
          f.grip[h] = I[k] && t - f.tapT[h] > 0.18 ? (f.grip[h] || 'reach') : null;
          if (!I[k] && f.prev[k] && t - f.tapT[h] < 0.18) {
            const hx = f.x + Math.sin(f.face) * 0.9, hz = f.z + Math.cos(f.face) * 0.9;
            const hit = F.find(o => o !== f && o.alive && Math.hypot(o.x - hx, o.z - hz) < 0.8);
            events.push({ e: 'punch', pid: f.pid, hit: hit ? hit.pid : null, x: hx, y: f.y + 1.1, z: hz });
            if (hit) { hit.hits = hit.hits.filter(x => t - x < 4).concat(t); hit.daze = Math.min(1, hit.hits.length / 3); knock(hit, Math.sin(f.face), Math.cos(f.face), 2.5);
              if (hit.hits.length >= 3 && hit.down <= 0) { hit.down = Math.min(5, 1 + 0.7 * hit.downs); hit.downs++; hit.hits = []; events.push({ e: 'down', pid: hit.pid, secs: hit.down }); knock(hit, Math.sin(f.face), Math.cos(f.face), 4); } }
          }
        });
        f.raise[0] += ((I.raiseL ? 1 : 0) - f.raise[0]) * Math.min(1, dt * 12); f.raise[1] += ((I.raiseR ? 1 : 0) - f.raise[1]) * Math.min(1, dt * 12);
      } else {
        f.down -= dt; f.vx *= 0.96; f.vz *= 0.96; f.grip = [null, null];
        if (f.down <= 0) { f.down = 0; f.daze = 0; events.push({ e: 'up', pid: f.pid }); }
      }
      if (f.daze > 0 && f.down <= 0 && !f.hits.length) f.daze = Math.max(0, f.daze - dt * 0.2);
      f.prev = { ...I };
      f.vy -= 18 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      const g = floorAt(A, f.x, f.z);
      if (f.y < g && f.y > g - 0.6) { f.y = g; f.vy = 0; }
      f.walk += Math.hypot(f.vx, f.vz) * dt;
      for (const k of A.kill || []) { const b = k.box; if (Math.abs(f.x - b.p[0]) < b.size[0] / 2 && Math.abs(f.z - b.p[2]) < b.size[2] / 2 && f.y < b.p[1] + b.size[1]) { f.out = k.kind; } }
      for (const h of A.hazards) if (h.kind === 'blade' && (t % 6) / 6 > 0.7 && Math.hypot(f.x - h.p[0], f.z - h.p[2]) < h.r && f.down <= 0) { const dx = f.x - h.p[0], dz = f.z - h.p[2], d = Math.hypot(dx, dz) || 1; knock(f, dx / d, dz / d, 7); f.down = 1.5; f.downs++; events.push({ e: 'down', pid: f.pid, secs: 1.5 }); }
      if (f.y < A.outY) f.out = 'ring';
      if (f.out) { f.alive = false; events.push({ e: 'out', pid: f.pid, how: f.out, by: null }); }
    }
    if (phase === 'fight') {
      const L = live();
      const sides = new Set(L.map(f => (mode === 'versus' ? f.pid : f.team)));
      const humansLeft = L.some(f => f.team !== 9);
      if (mode === 'waves' ? (!humansLeft || !L.some(f => f.team === 9)) : sides.size <= 1) {
        const win = mode === 'waves' ? (humansLeft ? 'players' : 'goons') : L[0] ? (mode === 'versus' ? L[0].pid : L[0].team) : null;
        if (mode === 'waves' && humansLeft) { wave++; events.push({ e: 'wave', n: wave }); for (const f of F) if (f.team !== 9) score[f.pid] = (score[f.pid] || 0) + 1; }
        else if (win != null && mode !== 'waves') score[win] = (score[win] || 0) + 1;
        events.push({ e: 'round', winner: win });
        phase = 'roundEnd'; phaseT = 2.5;
        if (round >= rounds || (mode === 'waves' && !humansLeft)) { over = true; events.push({ e: 'over', standings: result().order }); }
      }
    }
  }
  function result() {
    const ids = players.map(p => p.pid).sort((a, b) => (score[b] || 0) - (score[a] || 0));
    return { order: ids.map(i => [i]), scores: { ...score }, mode, arena: A.id };
  }
  const r3 = v => Math.round(v * 1000) / 1000;
  function snapshot() {
    return { t: r3(t), phase, round, rounds, wave, timeLeft: undefined,
      fighters: F.map(f => {
        const c = Math.cos(f.face), s = Math.sin(f.face), lean = f.down > 0 ? Math.PI / 2 * 0.95 : 0;
        // yaw (face) then a pitch back when down
        const qy = [0, Math.sin(f.face / 2), 0, Math.cos(f.face / 2)], hp = lean / 2, qx = [Math.sin(-hp), 0, 0, Math.cos(hp)];
        const q = [qy[3] * qx[0] + qy[0] * qx[3] + qy[1] * qx[2] - qy[2] * qx[1], qy[3] * qx[1] - qy[0] * qx[2] + qy[1] * qx[3] + qy[2] * qx[0], qy[3] * qx[2] + qy[0] * qx[1] - qy[1] * qx[0] + qy[2] * qx[3], qy[3] * qx[3] - qy[0] * qx[0] - qy[1] * qx[1] - qy[2] * qx[2]];
        const ty = f.y + (f.down > 0 ? 0.35 : 0.95);
        const reach = h => { const side = h ? 1 : -1, up = f.raise[h], out = f.grip[h] || (t - f.tapT[h] < 0.15) ? 0.75 : 0.25;
          return [r3(f.x + s * out + c * side * 0.3), r3(ty + 0.15 + up * 0.7 - (1 - up) * 0.25), r3(f.z + c * out - s * side * 0.3)]; };
        return { pid: f.pid, team: f.team, bot: !!f.bot, alive: f.alive, down: r3(f.down), downs: f.downs, out: f.out,
          torso: [r3(f.x), r3(ty), r3(f.z), ...q.map(r3)], head: f.down > 0 ? [r3(f.x - s * 0.5), r3(f.y + 0.3), r3(f.z - c * 0.5)] : [r3(f.x), r3(ty + 0.55), r3(f.z)],
          hands: [reach(0), reach(1)], feet: [[r3(f.x - c * 0.15 + s * Math.sin(f.walk * 4) * 0.2), r3(f.y), r3(f.z + s * 0.15 + c * Math.sin(f.walk * 4) * 0.2)], [r3(f.x + c * 0.15 - s * Math.sin(f.walk * 4) * 0.2), r3(f.y), r3(f.z - s * 0.15 - c * Math.sin(f.walk * 4) * 0.2)]],
          grip: f.grip.map(g => (g && g !== 'reach' ? g : null)), raise: f.raise.map(r3), face: r3(f.face), daze: r3(f.daze) };
      }),
      props: [], hazards: A.hazards.map(h => { const c = (t % 6) / 6, phase = c < 0.5 ? 0 : c < 0.7 ? 1 : 2; return { id: h.id, s: h.kind === 'blade' ? [phase, phase === 2 ? 1 : 0, h.p[0], h.p[2], r3(t * 9 % 6.28)] : [phase, r3(t * 1.2 % 6.28)] }; }), score: { ...score }, events: [] };
  }
  return { input(pid, st) { inputs[pid] = st; }, step, snapshot, events, get over() { return over && phase === 'over'; }, result };
}
export { ARENAS, MODES };
