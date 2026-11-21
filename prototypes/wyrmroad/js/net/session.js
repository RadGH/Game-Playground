// An online chapter on this device, with the same shape as the local session (docs/ARCH.md "Session contract"):
//   const s = await createNetSession({ net, data, T, start });     // start = the server's 'start' message
//   s.G                      the view state (mirror.js) — everyone drawn ~100 ms behind the server, your hero now
//   s.tick(dtReal, inputsByPid) → { events, alpha }               alpha is always 1 (the mirror is already smooth)
//   s.localPids              [your pid]          s.pause() / s.resume()   (the ☰ menu: you stand still, the game goes on)
//   s.leave()                leave the room       s.connection() → { state, rtt, code, ... } for the ☰ menu's detail
// Extra for online: s.online = true, s.closed (the server ended play — online.js shows what comes next), s.waiting
// (you joined mid-chapter: your hero arrives at the next fight), s.netStats (game-eye + tests).
//
// Your controls go to the server every step, numbered. Walking is predicted here: when the server says your
// hero is free to walk, the steps it has not used yet are run locally (walk speed × input), so movement answers at
// once; each snapshot puts the hero where the server says plus those steps, and any difference is eased out over a few
// frames instead of a jump. Attacks wait for the server's `move` event (handed out the moment it arrives).
import { STEP_HZ, INPUT_BATCH, EDGES, packInput } from './protocol.js';
import { createMirror } from './mirror.js';
import { DEPTH } from '../sim/brawl.js';

const STEP = 1 / STEP_HZ;
const FREE = new Set(['idle']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function createNetSession({ net, data, T, start, now = () => performance.now() / 1000 }) {
  const pid = start.you;
  let ownId = start.heroId ?? null;
  const ownIdOf = () => { if (ownId == null) for (const h of mirror.latest.heroes.values()) if (h.pid === pid) ownId = h.id; return ownId; };
  const OWN_NOW = new Set(['move', 'spell', 'nomana', 'cooldown', 'breaker', 'buff', 'pickup', 'pickupBreak', 'grab', 'throw']);
  const immediate = e => (e.pid === pid && e.type !== 'hit') || (OWN_NOW.has(e.type) && e.id != null && e.id === ownIdOf());
  const mirror = createMirror({ data, T, chapter: start.chapter, immediate });
  let seq = 0, acc = 0, ack = 0, batch = [], batchS = 0, edges = {}, paused = false, closed = false;
  const pending = [];                                  // { s, inp } sent but not yet used by the server
  let ready = [];                                      // events handed out at once (own moves), waiting for tick()
  const netStats = { snaps: 0, corrections: 0, lastFix: 0, sent: 0, moveDelayMs: [] };
  const presses = [];                                  // local times of recent presses (attack, jump…)
  // the drawn position of your hero: server position (+ prediction), plus an offset that fades
  const shown = { x: 0, y: 0, z: 0 }, off = { x: 0, y: 0, z: 0 };
  let fresh = false;

  const offs = [
    net.on('s', m => {
      mirror.push(m, now()); netStats.snaps++;
      if (Number.isInteger(m.a)) { ack = m.a; while (pending.length && pending[0].s <= ack) pending.shift(); }
      fresh = true;
    }),
    net.on('e', m => {
      const out = mirror.pushEvents(m.k, m.ev || [], now());
      for (const e of out) {
        if (e.type === 'move' && e.id === ownId && presses.length) {          // how long a press took to come back as a move
          const t = now(); while (presses.length && t - presses[0] > 0.5) presses.shift();   // a press that made no move (blocked, mid-swing) is not counted
          if (presses.length) { netStats.moveDelayMs.push(Math.round((t - presses[0]) * 1000)); if (netStats.moveDelayMs.length > 60) netStats.moveDelayMs.shift(); }
          presses.length = 0;
        }
        ready.push(e);
      }
    }),
  ];
  if (start.snap) { mirror.push(start.snap, now()); mirror.render(now()); }      // the play screen reads G.heroes as it opens

  const freeRec = rec => FREE.has(rec.state) && (rec.y ?? 0) < 0.01;
  /** One walk step of input `inp` from (x, z), the way the sim moves a free hero (brawl.js stepHero). */
  function walk(rec, p, inp) {
    const k = data.classes.classes[rec.cls]?.speed ?? 1, half = T.viewWidth / 2, cam = mirror.latest.camX;
    const mx = clamp(inp.mx || 0, -1, 1), mz = clamp(inp.mz || 0, -1, 1);
    p.x = clamp(p.x + mx * T.walkSpeed * k * STEP, cam - half + 0.5, cam + half - 0.5);
    p.z = clamp(p.z + mz * T.depthSpeed * k * STEP, -DEPTH, DEPTH);
    if (Math.abs(mx) > 0.2) p.dir = Math.sign(mx);
    p.anim = Math.abs(mx) > 0.1 || Math.abs(mz) > 0.1 ? 'walk' : 'idle';
  }
  /** The server's position of your hero plus the walk steps it has not used yet (only while it is free to walk). */
  function rebase(rec) {
    const p = { x: rec.x, z: rec.z, y: rec.y ?? 0, dir: rec.dir, anim: rec.anim, free: freeRec(rec) };
    if (p.free) for (const q of pending) walk(rec, p, q.inp);
    return p;
  }
  let pred = null;                                   // the running prediction (advanced every local step)
  function ownView(dt) {
    return o => {
      if (!pred || fresh) {                          // a new snapshot: re-base, keep the hero where it was drawn, fade the difference
        const nb = rebase(o);
        if (pred) {
          const ex = pred.x - nb.x, ey = pred.y - nb.y, ez = pred.z - nb.z, err = Math.hypot(ex, ez);
          if (pred.free && nb.free && err > 0.05) { netStats.corrections++; netStats.lastFix = Math.round(err * 100) / 100; }
          if (err > 1.5 || Math.abs(ey) > 1.5) { off.x = off.y = off.z = 0; } else { off.x += ex; off.y += ey; off.z += ez; }
        }
        pred = nb; fresh = false;
      }
      const k = Math.exp(-dt * 12);
      off.x *= k; off.y *= k; off.z *= k;
      shown.x = pred.x + off.x; shown.y = Math.max(0, pred.y + off.y); shown.z = pred.z + off.z;
      return { x: shown.x, y: shown.y, z: shown.z, dir: pred.dir, anim: pred.free ? pred.anim : o.anim };
    };
  }
  /** A new local step: the running prediction walks with it at once. */
  function stepOwn(inp) {
    const rec = ownId != null && mirror.latest.heroes.get(ownId);
    if (pred && rec && pred.free && freeRec(rec)) walk(rec, pred, inp);
  }

  function sendBatch() {
    if (!batch.length) return;
    net.send({ t: 'in', s: batchS, i: batch }); netStats.sent++;
    batch = [];
  }

  const s = {
    online: true,
    get G() { return mirror.G; },
    localPids: [pid],
    get paused() { return paused; },
    get closed() { return closed; },
    get waiting() { return ownIdOf() == null || !mirror.latest.heroes.has(ownId); },
    get netStats() { return { ...netStats, pending: pending.length, ack, seq, frames: mirror.frames.length, renderK: Math.round(mirror.renderK), ...mirror.stats }; },
    mirror, start,
    pause() { paused = true; },
    resume() { paused = false; },
    /** Run 0..n fixed steps of your controls (sent + predicted), then build the view state for this frame. */
    tick(dtReal, inputsByPid = {}) {
      const inp = inputsByPid[pid] || {};
      if (!paused) { let any = false; for (const k of EDGES) if (inp[k]) { edges[k] = true; any = true; } if (any) presses.push(now()); }
      acc += Math.min(0.25, Math.max(0, dtReal));
      let steps = 0;
      while (acc >= STEP && steps < 8) {
        const use = paused ? { mx: 0, mz: 0 } : { mx: inp.mx || 0, mz: inp.mz || 0, block: !!inp.block, spell1Held: !!inp.spell1Held, spell2Held: !!inp.spell2Held, ...edges };
        edges = {};
        const sq = ++seq;
        if (!batch.length) batchS = sq;
        batch.push(packInput(use));
        pending.push({ s: sq, inp: use }); if (pending.length > 120) pending.shift();
        stepOwn(use);
        if (batch.length >= INPUT_BATCH) sendBatch();
        acc -= STEP; steps++;
      }
      if (steps === 8) acc = 0;
      const id = ownIdOf();
      const events = mirror.render(now(), id != null ? { id, view: ownView(dtReal) } : null);
      const out = ready.concat(events); ready = [];
      return { events: out, alpha: 1 };
    },
    connection() { return { state: net.state, rtt: net.rtt, code: net.code, build: net.build, corrections: netStats.corrections, snaps: netStats.snaps, behindMs: mirror.stats.behindMs }; },
    /** online.js: the server ended play (outro, results or a loss) — the play loop stops drawing. */
    close() { if (closed) return; closed = true; sendBatch(); for (const off of offs) off(); },
    /** Leave the room altogether (the ☰ menu's "Leave the room" — confirm first; this leaves at once). Does nothing
     *  once the server has ended play (online.js has the screen then). */
    leave() { if (s.serverClosed) return; s.close(); if (s.onLeave) s.onLeave(); },
    onLeave: null, serverClosed: false, chapter: start.chapter, section: start.section ?? 0,
  };
  return s;
}
