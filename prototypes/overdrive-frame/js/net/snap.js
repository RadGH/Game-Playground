// Co-op snapshots: the server packs what changed in a mission since the last snapshot; every browser applies it to
// its own copy of the mission (a "mirror": made by createMission from the same mission + players, so the city, the
// buildings and every id line up). The socket is ordered and never drops a frame, so a snapshot only carries changes:
// an enemy that did not move is not sent at all. A player who joins mid-mission gets one full snapshot first.
//
// Numbers go over the wire as whole hundredths (q) — 2 decimals is a quarter of a pixel at the closest zoom.
// Pure: the server, the browser and the tests import it.
import { makeEnemy } from '../sim/enemies.js';
import { RUBBLE_H } from '../sim/world.js';

const q = v => (v == null || !Number.isFinite(v) ? 0 : Math.round(v * 100));
const uq = v => v / 100;
const r2 = v => Math.round(v * 100) / 100;

// enemy fields: [wire key, property, kind] — q = hundredths, i = whole number, s = text, b = flag
const E_FIELDS = [['x', 'x', 'q'], ['z', 'z', 'q'], ['y', 'flying', 'q'], ['f', 'face', 'q'], ['a', 'aim', 'q'], ['n', 'anim', 's'],
  ['h', 'hp', 'i'], ['H', 'hpMax', 'i'], ['s', 'state', 's'], ['l', 'elite', 'b'], ['d', 'hidden', 'b'], ['g', 'tag', 's'],
  ['r', 'r', 'q'], ['D', 'dead', 'b'], ['t', 'stateT', 'q'],
  ['w', 'shielded', 'b'], ['m', 'healing', 's']];   // round 5 roles: inside a bulwark's dome; a medic's patient id (append only: index 13 = dead)
// a mech (players, bots, rival aces): sent whole every snapshot — there are only a few
const M_FIELDS = [['x', 'x', 'q'], ['z', 'z', 'q'], ['y', 'y', 'q'], ['f', 'face', 'q'], ['a', 'aim', 'q'], ['n', 'anim', 's'],
  ['h', 'hp', 'i'], ['H', 'hpMax', 'i'], ['e', 'energy', 'i'], ['t', 'heat', 'i'], ['o', 'overheated', 'b'], ['s', 'stall', 'q'],
  ['D', 'down', 'b'], ['T', 'downT', 'q'], ['R', 'reviveT', 'q'], ['L', 'lockOn', 's'], ['b', 'boosting', 'b'], ['v', 'hovering', 'b'],
  ['k', 'kills', 'i'], ['u', 'hurtT', 'q'], ['X', 'dead', 'b'], ['S', 'state', 's'], ['g', 'onGround', 'b'],
  ['O', 'od', 'q'], ['P', 'odT', 'q'], ['Q', 'odK', 's'],                         // the Overload bar, time left, which one
  ['W', 'team', 's']];                                                              // versus sides (else 'player' / 'enemy')
// the moving parts of your OWN frame, for correcting what your browser predicted
const ME_FIELDS = ['x', 'z', 'y', 'vx', 'vz', 'vy', 'face', 'qbT', 'qbCd', 'qbX', 'qbZ', 'airT', 'regenWait', 'stall', 'energy', 'heat'];
const ME_FLAGS = ['onGround', 'boosting', 'hovering', 'overheated'];

// your own frame's moving parts come from your browser's prediction (and packMe), not from the shared list
const OWN_PREDICTED = new Set(['x', 'z', 'y', 'face', 'aim', 'anim', 'boosting', 'hovering', 'onGround', 'energy', 'heat', 'stall', 'overheated']);
const enc = (v, k) => k === 'q' ? q(v) : k === 'i' ? Math.round(v || 0) : k === 'b' ? (v ? 1 : 0) : (v ?? '');
const dec = (v, k) => k === 'q' ? uq(v) : k === 'b' ? !!v : k === 's' ? (v === '' ? null : v) : v;

function bossExtra(e) {
  if (!e.parts) return null;
  return JSON.stringify({ parts: e.parts.map(p => ({ id: p.id, label: p.label, hp: Math.round(p.hp), hpMax: Math.round(p.hpMax), broken: p.broken, locked: p.locked, at: r2(p.at), arc: r2(p.arc) })),
    atk: e.atk ? roundObj(e.atk) : null, phase: e.phase, stagger: r2(e.stagger || 0), diedAt: e.diedAt ?? null, bodyR: e.bodyR, boss: true,
    // the Juggernaut (sim/juggernaut.js): its dome, whether it kneels, its mines on the ground (atk carries the cannon lane / stomp ring / mine spots)
    ...(e.mines ? { shield: !!e.shield, kneel: !!e.kneel, mines: e.mines.map(n => ({ x: r2(n.x), z: r2(n.z), arm: n.arm > 0 ? 1 : 0, life: n.life < 2 ? 1 : 9 })) } : {}) });
}
function roundObj(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) out[k] = typeof v === 'number' ? r2(v) : Array.isArray(v) ? v.map(x => (typeof x === 'number' ? r2(x) : x)) : v && typeof v === 'object' ? roundObj(v) : v;
  return out;
}
/** Every event of the last steps, numbers rounded (they only drive effects, sounds, numbers and the HUD). */
export const packEvents = evs => evs.map(e => roundObj(e));

function opsView(S) {
  const O = S.ops; if (!O) return null;
  return { plants: O.plants.map(p => [p.id, q(p.x), q(p.z), q(p.t), p.done ? 1 : 0]),
    core: O.core ? [q(O.core.x), q(O.core.z), O.core.carrier || '', q(O.core.pick || 0), O.core.home ? 1 : 0] : null,
    units: O.convoyUnits.map(e => e.id), escaped: O.escaped, arrived: O.arrived, lost: O.lost, landed: !!O.landed, convoyLeft: O.convoyLeft };
}
const objView = S => S.objectives.map(o => { const { points, core, ...rest } = o; return rest; });

/** The server's packer for one room's mission. pack() is the shared change list (it remembers what it sent);
 *  pack({ full: true }) is everything, for a player arriving now (it does not disturb the change list). */
export function createPacker() {
  const lastE = new Map(), lastBoss = new Map(), lastLots = new Map();
  let lastObj = '', lastOps = '', lastStats = '', lastVs = '';
  return {
    pack(S, { full = false } = {}) {
      const out = { tm: r2(S.time), ph: S.phase, pt: r2(S.phaseT) };
      // mechs (whole)
      out.m = S.mechs.map(m => {
        const r = { i: m.id };
        for (const [w, p, k] of M_FIELDS) { const v = enc(m[p], k); if (v !== 0 && v !== '') r[w] = v; }
        if (m.pid) r.p = m.pid;
        if (m.team === 'enemy') { r.E = 1; r.K = m.kind; r.A = m.ace; }
        if (m.status?.slow > 0) r.sl = q(m.status.slow);            // round 5: spore gas (the HUD and your prediction read it)
        if (m.status?.burn > 0) r.bu = q(m.status.burn);
        return r;
      });
      // enemies (changes)
      const E = [], seen = new Set();
      for (const e of S.enemies) {
        seen.add(e.id);
        const rec = E_FIELDS.map(([, p, k]) => enc(e[p], k));
        const prev = full ? null : lastE.get(e.id);
        if (prev && prev[13] && rec[13]) continue;               // dead then, dead now: nothing to say
        const r = { i: e.id };
        if (!prev) { r.k = e.kind; E_FIELDS.forEach(([w], j) => { if (rec[j] !== 0 && rec[j] !== '') r[w] = rec[j]; }); }
        else { let n = 0; E_FIELDS.forEach(([w], j) => { if (rec[j] !== prev[j]) { r[w] = rec[j]; n++; } }); if (!n && !e.parts) continue; }
        const bx = bossExtra(e);
        if (bx && (full || lastBoss.get(e.id) !== bx)) { r.B = bx; if (!full) lastBoss.set(e.id, bx); }
        if (!full) lastE.set(e.id, rec);
        if (Object.keys(r).length > 1) E.push(r);
      }
      if (!full) for (const id of lastE.keys()) if (!seen.has(id)) { E.push({ i: id, gone: 1 }); lastE.delete(id); lastBoss.delete(id); }
      if (E.length) out.e = E;
      // buildings (changes; everything damaged when full)
      const L = [];
      for (const l of S.world.lots) {
        const hp = Math.round(l.hp), prev = lastLots.get(l.i);
        if (full) { if (l.stage > 0 || hp < Math.round(l.hpMax)) L.push([l.i, hp, l.stage]); continue; }
        if (prev ? prev[0] !== hp || prev[1] !== l.stage : hp !== Math.round(l.hpMax) || l.stage) { L.push([l.i, hp, l.stage]); lastLots.set(l.i, [hp, l.stage]); }
      }
      if (L.length) out.L = L;
      // shots: every one, each time (they live a second at most)
      if (S.shots.length) out.s = S.shots.map(s => [q(s.x), q(s.z), q(s.y ?? 0.4), q(s.vx), q(s.vz), s.kind || 'bullet', s.dtype || 'kinetic', s.team === 'enemy' ? 1 : 0,
        s.lob ? 1 : 0, s.flame ? q(s.age / (s.life || 1)) : -1, s.tx != null ? q(s.tx) : null, s.tz != null ? q(s.tz) : null, q(s.splash || 0)]);
      if (S.clouds?.length) out.c = S.clouds.map(c => [c.id, q(c.x), q(c.z), q(c.r), q(c.t), q(c.life)]);   // round 5: spore clouds
      if (S.strikes.length) out.k = S.strikes.map(k => [q(k.x), q(k.z), q(k.r), q(k.t)]);
      if (S.deployed.length) out.d = S.deployed.map(d => [d.id, d.kind, q(d.x), q(d.z), q(d.y || d.flying || 0)]);
      if (S.allies?.length) out.a = S.allies.map(a => [a.id, q(a.x), q(a.z), q(a.face || 0), Math.round(a.hp), Math.round(a.hpMax), a.down ? 1 : 0, a.arrived ? 1 : 0, q(a.r)]);
      const ob = JSON.stringify(objView(S)); if (full || ob !== lastObj) { out.o = ob; if (!full) lastObj = ob; }
      const op = JSON.stringify(opsView(S)); if (full || op !== lastOps) { out.O = op; if (!full) lastOps = op; }
      const st = JSON.stringify({ ...S.stats, revives: S.revives }); if (full || st !== lastStats) { out.st = st; if (!full) lastStats = st; }
      if (S.versus) { const vs = JSON.stringify({ score: S.versus.score, round: S.versus.round, resetT: Math.round(S.versus.resetT * 10) / 10 }); if (full || vs !== lastVs) { out.V = vs; if (!full) lastVs = vs; } }
      if (S.result) out.res = S.result;
      if (full) out.full = 1;
      return out;
    },
  };
}

/** One player's own part of a snapshot: their weapons (ammo, reload, locks), their frame's moving parts (to correct
 *  the prediction), their own pickups (loot is per player) and the last input the server used. */
export function packMe(S, pid, ack) {
  const p = S.players.find(x => x.id === pid); if (!p) return null;
  const m = p.mech;
  return { ack, mid: m.id,
    w: m.weapons.map(w => [w.ammo ?? -1, w.inMag ?? -1, q(w.reloadT || 0), q(w.charge || 0), w.held ? 1 : 0, (w.locks || []).slice(0, 8)]),
    phys: ME_FIELDS.map(k => q(m[k] ?? 0)).concat(ME_FLAGS.map(k => (m[k] ? 1 : 0))),
    pk: S.pickups.filter(x => x.owner === pid).map(x => [x.id, q(x.x), q(x.z), x.part ? 'part' : x.mat]),
    mats: p.mats, loot: p.loot.length };
}

/** Put a frame's server state (packMe().phys) onto a mech object. */
export function setPhys(m, phys) {
  ME_FIELDS.forEach((k, i) => { m[k] = uq(phys[i]); });
  ME_FLAGS.forEach((k, i) => { m[k] = !!phys[ME_FIELDS.length + i]; });
}

/**
 * Apply one snapshot to a mirror mission M. ctx: { localPid, makeMech(rec) → a mech for an id the mirror does not know
 * (a rival ace, a player who dropped in) or null }. Returns { events } — the caller plays them through the effects.
 * Your own frame's position is left to the caller (it predicts it): pass `skipPos` = your mech id.
 */
export function applySnap(M, snap, ctx = {}) {
  M.time = snap.tm; M.phaseT = snap.pt;
  if (snap.ph !== M.phase) M.phase = snap.ph;
  // mechs
  const live = new Set();
  for (const r of snap.m || []) {
    let m = M.byId.get(r.i);
    if (!m) { m = ctx.makeMech?.(r); if (!m) continue; if (!M.mechs.includes(m)) M.mechs.push(m); M.byId.set(m.id, m); }
    live.add(m.id);
    const own = ctx.skipPos === m.id;
    for (const [w, p, k] of M_FIELDS) {
      if (own && OWN_PREDICTED.has(p)) continue;
      const v = r[w] ?? (k === 's' ? '' : 0); const nv = dec(v, k);
      if (p === 'anim' && m.anim !== nv) m.animT = 0;
      m[p] = nv;
    }
    if (r.p) m.pid = r.p;
    m.status ||= {}; m.status.slow = r.sl ? uq(r.sl) : 0; m.status.burn = r.bu ? uq(r.bu) : 0;   // round 5: gas + fire on frames
  }
  // mechs the server no longer has (a player left, an ace gone) leave the mirror too
  if (snap.m) M.mechs = M.mechs.filter(m => { if (live.has(m.id)) return true; M.byId.delete(m.id); return false; });
  // enemies (a full snapshot lists every one: any other this copy still has are gone)
  let gone = false;
  if (snap.full) { const ids = new Set((snap.e || []).map(r => r.i)); for (const e of M.enemies) if (!ids.has(e.id)) { e.dead = true; M.byId.delete(e.id); gone = true; } }
  for (const r of snap.e || []) {
    let e = M.byId.get(r.i);
    if (r.gone) { if (e) { e.dead = true; gone = true; M.byId.delete(r.i); } continue; }
    if (!e) {
      const K = M.kinds[r.k]; if (!K) continue;
      e = makeEnemy(r.k, K, uq(r.x ?? 0), uq(r.z ?? 0), M.T, { id: r.i });
      e.state = 'move'; e.hidden = false; e.animT = 0;
      M.enemies.push(e); M.byId.set(e.id, e);
    }
    for (const [w, p, k] of E_FIELDS) if (w in r) { const nv = dec(r[w], k); if (p === 'anim' && e.anim !== nv) e.animT = 0; e[p] = nv; }
    if (!e.state) e.state = 'move';
    if (r.B) Object.assign(e, JSON.parse(r.B));
  }
  if (gone || M.enemies.length > 400) M.enemies = M.enemies.filter(e => M.byId.get(e.id) === e && !(e.dead && !e.parts && M.enemies.length > 400));
  // buildings
  for (const [i, hp, stage] of snap.L || []) {
    const l = M.world.lots[i]; if (!l) continue;
    l.hp = hp; if (l.stage !== stage) { l.stage = stage; l.h = stage >= 3 ? RUBBLE_H : stage === 2 ? Math.max(l.h0 * 0.8, RUBBLE_H) : l.h0; }
  }
  // shots, strikes, deployed, convoy trucks
  M.shots = (snap.s || []).map(s => ({ x: uq(s[0]), z: uq(s[1]), y: uq(s[2]), vx: uq(s[3]), vz: uq(s[4]), kind: s[5], dtype: s[6], team: s[7] ? 'enemy' : 'player',
    lob: !!s[8], flame: s[9] >= 0, age: s[9] >= 0 ? uq(s[9]) : 0, life: 1, tx: s[10] != null ? uq(s[10]) : null, tz: s[11] != null ? uq(s[11]) : null, splash: uq(s[12]) }));
  M.clouds = (snap.c || []).map(c => ({ id: c[0], x: uq(c[1]), z: uq(c[2]), r: uq(c[3]), t: uq(c[4]), life: uq(c[5]) }));   // round 5
  M.strikes = (snap.k || []).map(k => ({ x: uq(k[0]), z: uq(k[1]), r: uq(k[2]), t: uq(k[3]) }));
  M.deployed = (snap.d || []).map(d => ({ id: d[0], kind: d[1], x: uq(d[2]), z: uq(d[3]), y: uq(d[4]) }));
  if (snap.a) {
    const byA = new Map((M.allies || []).map(a => [a.id, a]));
    M.allies = snap.a.map(a => Object.assign(byA.get(a[0]) || { id: a[0], ally: true }, { x: uq(a[1]), z: uq(a[2]), face: uq(a[3]), hp: a[4], hpMax: a[5], down: !!a[6], arrived: !!a[7], r: uq(a[8]) }));
    for (const a of M.allies) M.byId.set(a.id, a);
  } else if (M.allies?.length) M.allies = [];
  if (snap.o) {
    const list = JSON.parse(snap.o);
    M.objectives = list.map(o => { if (o.type === 'plant' && M.ops) o.points = M.ops.plants; if (o.type === 'carry' && M.ops) o.core = M.ops.core; return o; });
  }
  if (snap.O && M.ops) {
    const O = JSON.parse(snap.O);
    if (O) {
      M.ops.plants = O.plants.map(([id, x, z, t, done]) => ({ id, x: uq(x), z: uq(z), t: uq(t), done: !!done }));
      M.ops.core = O.core ? { x: uq(O.core[0]), z: uq(O.core[1]), carrier: O.core[2] || null, pick: uq(O.core[3]), home: !!O.core[4] } : null;
      M.ops.convoyUnits = O.units.map(id => M.byId.get(id)).filter(Boolean);
      Object.assign(M.ops, { escaped: O.escaped, arrived: O.arrived, lost: O.lost, landed: O.landed, convoyLeft: O.convoyLeft });
      for (const o of M.objectives) { if (o.type === 'plant') o.points = M.ops.plants; if (o.type === 'carry') o.core = M.ops.core; }
    }
  }
  if (snap.st) { const st = JSON.parse(snap.st); M.revives = st.revives; delete st.revives; M.stats = st; }
  if (snap.V && M.versus) Object.assign(M.versus, JSON.parse(snap.V));
  if (snap.res && !M.result) M.result = snap.res;
  return { events: snap.ev || [] };
}

/** Your own part (packMe) onto the mirror: weapons, pickups. Returns the server's physics for the prediction. */
export function applyMe(M, me, localPid) {
  if (!me) return null;
  const m = M.byId.get(me.mid);
  if (m) me.w.forEach(([ammo, inMag, reloadT, charge, held, locks], i) => {
    const w = m.weapons[i]; if (!w) return;
    if (ammo >= 0) w.ammo = ammo; if (inMag >= 0) w.inMag = inMag; w.reloadT = uq(reloadT); w.charge = uq(charge); w.held = !!held;
    w.locks = locks.filter(id => M.byId.has(id));             // the sim keeps locks as enemy ids
  });
  M.pickups = me.pk.map(([id, x, z, type]) => ({ id, owner: localPid, x: uq(x), z: uq(z), part: type === 'part', mat: type === 'part' ? null : type }));
  return { ack: me.ack, phys: me.phys, mats: me.mats, loot: me.loot };
}
