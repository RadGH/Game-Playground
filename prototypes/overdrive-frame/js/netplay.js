// A co-op mission on this device: the server runs the mission; this draws the browser's copy of it (js/net/mirror.js).
// - Your controls go to the server 30 times a second, numbered. Your own frame moves AT ONCE here (the same stepMech the
//   server runs — "prediction"); when the server's snapshot says where it really is after input n, the frame is put
//   there and inputs after n are run again, so it never drifts and never waits for the round trip.
// - Everything else is drawn from snapshots (15 a second) played back at an even pace through a small buffer, smoothed
//   between the last two (lessons 28: never draw moving things only at sim steps).
// - Events in each snapshot drive the same effects, sounds and HUD as solo.
import { Play } from './play.js';
import { stepMech } from './sim/mech.js';
import { groundAt, pushOut } from './sim/world.js';
import { packInput, STEP_HZ, SNAP_EVERY } from './net/protocol.js';
import { applySnap, applyMe, setPhys } from './net/snap.js';
import { applyRoster } from './net/mirror.js';

const STEP = 1 / STEP_HZ, SNAP_DT = SNAP_EVERY / STEP_HZ;

export class NetPlay extends Play {
  /** o: Play's options + { net (js/net/client.js), M (mirror), data } */
  constructor(o) {
    const mech = o.M.byId.get('m-' + o.M.localPid);
    super({ ...o, S: o.M, mech, pid: o.M.localPid });
    this.net = o.net; this.data = o.data;
    this.seq = 0; this.pending = []; this.queue = []; this.snapT = 0; this.snapAlpha = 1; this.relT = 0; this.ownPrev = null; this.tickAlpha = 1;
    this.netStats = { snaps: 0, late: 0, corrections: 0, lastFix: 0 };
    this.worldApi = { groundAt: (x, z) => groundAt(this.S.world, x, z), pushOut: (b, r) => pushOut(this.S.world, b, r) };
    this.offs = [
      this.net.on('s', m => this._onSnap(m)),
      this.net.on('roster', m => applyRoster(this.S, m.roster, this.data)),
      this.net.on('result', m => { if (!this.S.result) this.S.result = m.result; }),
    ];
  }

  /** Your frame between its own predicted steps; everything else between the last two snapshots. */
  lerp = (o) => {
    if (o === this.mech) { const p = this.ownPrev; if (!p) return o; const a = this.tickAlpha; return { x: p[0] + (o.x - p[0]) * a, z: p[1] + (o.z - p[1]) * a, y: p[2] + ((o.y ?? 0) - p[2]) * a }; }
    const p = this.prev.get(o.id); if (!p) return o;
    const a = this.snapAlpha; return { x: p[0] + (o.x - p[0]) * a, z: p[1] + (o.z - p[1]) * a, y: (p[2] ?? 0) + ((o.y ?? 0) - (p[2] ?? 0)) * a };
  };

  _onSnap(m) {
    this.netStats.snaps++;
    this.queue.push(m);
    // your own frame: put it where the server says, then run again what the server has not used yet
    const me = m.me; if (!me) return;
    this.pending = this.pending.filter(p => p.s > me.ack);
    if (this.S.phase === 'drop' || this.mech.down || m.ph === 'drop') { setPhys(this.mech, me.phys); return; }
    const was = { x: this.mech.x, z: this.mech.z };
    setPhys(this.mech, me.phys);
    for (const p of this.pending) stepMech(this.mech, p.inp, STEP, this.S.T, this.worldApi, []);
    const err = Math.hypot(this.mech.x - was.x, this.mech.z - was.z);
    if (err > 0.05) { this.netStats.corrections++; this.netStats.lastFix = err; }
    // a small miss is eased out over a few frames instead of a visible jump
    if (err > 0.02 && err < 1.5 && this.ownPrev) { this.ownPrev[0] += (was.x - this.mech.x) * 0.5; this.ownPrev[1] += (was.z - this.mech.z) * 0.5; }
  }

  /** Play queued snapshots back at an even pace: one every 1/15 s, a little faster when two or more are waiting. */
  _release(dt) {
    this.relT += dt;
    const need = this.queue.length > 2 ? SNAP_DT * 0.6 : this.queue.length > 1 ? SNAP_DT * 0.9 : SNAP_DT;
    // fallen behind (a slow frame, a stalled tab): every snapshot is a list of changes, so none can be skipped — apply the
    // backlog at once, keeping only the newest two for smooth playback
    const behind = this.queue.length > 5 ? this.queue.length - 2 : 0;
    let n = 0;
    while (this.queue.length && (n < behind || this.relT >= need)) {
      if (n >= behind) this.relT -= need;
      n++;
      const snap = this.queue.shift();
      this.prev.clear();
      for (const m of this.S.mechs) if (m !== this.mech) this.prev.set(m.id, [m.x, m.z, m.y]);
      for (const e of this.S.enemies) if (!e.dead) this.prev.set(e.id, [e.x, e.z, e.flying || 0]);
      for (const a of this.S.allies || []) this.prev.set(a.id, [a.x, a.z, 0]);
      const wasDrop = this.S.phase === 'drop';
      const { events } = applySnap(this.S, snap, { skipPos: this.mech.id, makeMech: r => this._newMech(r) });
      applyMe(this.S, snap.me, this.S.localPid);
      if (wasDrop && this.S.phase !== 'drop') events.push({ type: 'land', id: this.mech.id, x: this.mech.x, z: this.mech.z, hard: true });
      for (const e of events) { this.fxOf(e, this.S); this.hud?.onEvent(e, this.S); }
      this.snapT = 0;
    }
    if (!this.queue.length && this.relT > SNAP_DT * 3) this.netStats.late++;
    this.snapT += dt; this.snapAlpha = Math.min(1, this.snapT / SNAP_DT);
  }

  /** A mech the server mentions that this copy does not have: a rival ace (built from its kind). */
  _newMech(r) {
    if (!r.E || !r.K) return null;
    const K = this.S.kinds[r.K]; if (!K?.ace) return null;
    return { id: r.i, team: 'enemy', ace: r.A, kind: r.K, build: K.ace.build, paint: K.ace.paint, name: K.ace.callsign, x: 0, z: 0, y: 0, face: 0, aim: 0, anim: 'idle', animT: 0, hp: 1, hpMax: 1, r: 0.22, weapons: [], status: {}, boss: true };
  }

  _advance(dt) {
    this._release(dt);
    // the parts the server does not send every time move on here: walk cycles, shots in flight, hit flashes
    for (const e of this.S.enemies) if (!e.dead) { e.animT = (e.animT || 0) + dt; if (e.hurtT > 0) e.hurtT -= dt; }
    for (const m of this.S.mechs) if (m !== this.mech) m.animT = (m.animT || 0) + dt;
    for (const s of this.S.shots) { s.x += s.vx * dt; s.z += s.vz * dt; if (s.flame) s.age += dt; }
    // your controls: read every frame, sent and predicted at the sim's own pace
    this.acc += dt;
    const me = this.lerp(this.mech), sp = this.view.P(me.x, me.z, (me.y || 0) + 0.4);
    let inp = this.controls.read({ x: sp.sx, y: sp.sy }, this.view);
    if (inp.menu) { this.controls.consume(); this.hud?.openMenu(); }
    if (this.paused) inp = { mx: 0, mz: 0, ax: inp.ax, az: inp.az, fire: [false, false, false, false] };   // the ☰ menu is open: stand still (the mission goes on)
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {              // a slow device still sends 30 a second (the server counts on it)
      this.ownPrev = [this.mech.x, this.mech.z, this.mech.y || 0];
      const s = ++this.seq;
      this.net.send({ t: 'in', s, i: packInput(inp) });
      const copy = { ...inp, fire: [...(inp.fire || [])] };
      this.pending.push({ s, inp: copy });
      if (this.pending.length > 90) this.pending.shift();
      if (this.S.phase !== 'drop' && !this.mech.down) stepMech(this.mech, copy, STEP, this.S.T, this.worldApi, []);
      this.controls.consume();
      inp.qb = inp.jumpPressed = inp.lockOnPressed = inp.ping = inp.interact = inp.swap = false;
      this.acc -= STEP; steps++;
    }
    if (steps === 8) this.acc = 0;
    this.tickAlpha = Math.min(1, this.acc / STEP);
    this.alpha = this.snapAlpha;
    this.lastInput = inp;
  }

  state() {
    return { ...super.state(), coop: { seq: this.seq, pending: this.pending.length, queued: this.queue.length, ...this.netStats, players: this.S.mechs.filter(m => m.team !== 'enemy').map(m => ({ id: m.id, name: m.name, hp: Math.round(m.hp), down: m.down })) } };
  }

  dispose() { for (const off of this.offs) off(); super.dispose(); }
}
