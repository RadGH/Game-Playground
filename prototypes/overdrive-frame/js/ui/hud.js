// The mission HUD, built like a cockpit frame around the mech (owner: "Cockpit-style screen frame: energy, heat and
// ammo arranged around your mech"): two arcs hug the mech (energy left, heat right), the reticle shows the lock circle
// and lock count, armour top-left, weapons in the bottom corners in the slot they sit in, objectives top-right, and
// comms from a character on the left — never big text in the middle of the screen (owner ruling, lessons 42).
import { fmt, hp as hpFmt } from '../../../../shared/format.js';
import { hintFor } from '../input/bindings.js';
import { energyMaxOf, heatMaxOf } from '../sim/mech.js';
import { TILE_W } from '../../../../citykit/js/iso.js';

const SLOT_NAMES = ['Left arm', 'Right arm', 'Left shoulder', 'Right shoulder'];
const SLOT_KEYS = ['fireL', 'fireR', 'fireSL', 'fireSR'];

export class Hud {
  constructor(root, { comms, speakers, menu }) {
    this.root = root; this.commsLines = comms; this.speakers = speakers; this.menu = menu;
    this.el = document.createElement('div'); this.el.className = 'of-hud';
    this.el.innerHTML = `
      <canvas class="of-hud-arcs" aria-hidden="true"></canvas>
      <div class="of-hud-armour" role="group" aria-label="Armour"><span class="of-hud-label">Armour</span><b class="of-ap">0</b><div class="of-bar"><i></i></div><small class="of-status"></small></div>
      <ol class="of-hud-obj" aria-label="Objectives"></ol>
      <div class="of-hud-weapons" aria-label="Weapons"></div>
      <div class="of-comms" aria-live="polite" hidden><canvas class="of-comms-face" width="96" height="96" aria-hidden="true"></canvas><div><b class="of-comms-who"></b><p class="of-comms-text"></p><canvas class="of-comms-wave" width="160" height="18" aria-hidden="true"></canvas></div></div>
      <div class="of-alert" hidden></div>
      <div class="of-hurt" aria-hidden="true"></div>
      <button type="button" class="of-menu-btn" aria-label="Menu">☰</button>`;
    this.arcs = this.el.querySelector('.of-hud-arcs'); this.ax = this.arcs.getContext('2d');
    this.el.querySelector('.of-menu-btn').addEventListener('click', () => this.openMenu());
    this.commsQueue = []; this.commsT = 0; this.alertT = 0; this.saidAt = new Set();
  }

  attach(play) {
    this.play = play; this.root.append(this.el); this.saidAt.clear();
    const ws = this.el.querySelector('.of-hud-weapons'); ws.replaceChildren();
    play.mech.weapons.forEach((w, i) => {
      const d = document.createElement('div'); d.className = `of-w of-w-${i}` + (w.spec.kind === 'none' ? ' of-w-empty' : '');
      d.innerHTML = `<span class="of-w-key"></span><b>${w.spec.kind === 'none' ? 'Empty' : w.spec.name}</b><span class="of-w-ammo"></span><i class="of-w-cd"></i><span class="of-w-locks"></span>`;
      ws.append(d);
    });
    this._keys();
  }
  detach() { this.el.remove(); this.play = null; }

  _keys() {
    const dev = this.play?.controls.device || 'keys', gl = this.play?.controls.glyphs || 'xbox';
    this.el.querySelectorAll('.of-w').forEach((d, i) => { d.querySelector('.of-w-key').textContent = hintFor(SLOT_KEYS[i], dev, gl); });
    this.el.querySelector('.of-menu-btn').dataset.key = hintFor('menu', dev, gl);
    this._dev = dev;
  }

  openMenu() { if (!this.play) return; this.play.paused = true; this.menu?.({ resume: () => { this.play.paused = false; }, play: this.play }); }

  /** Comms: a character speaks (their machine + callsign + a moving waveform). Queued; one at a time. */
  say(who, text) { this.commsQueue.push({ who, text }); }
  notice(text, s = 3) { const a = this.el.querySelector('.of-alert'); a.textContent = text; a.hidden = false; this.alertT = s; }

  onEvent(ev, S) {
    if (ev.type === 'objective') this.notice(`Done: ${ev.label}`, 3);
    if (ev.type === 'objectiveFailed') this.notice(`Missed: ${ev.label}`, 3);
    if (ev.type === 'phase' && ev.phase === 'extract') this._commsEvent('extract');
    if (ev.type === 'overheat' && ev.id === this.play.mech.id) this.notice('Overheating — ease off', 2.5);
  }

  _commsEvent(name) { for (const c of this.commsLines || []) if (c.event === name && !this.saidAt.has(c)) { this.saidAt.add(c); this.say(c.who, c.text); } }

  frame(S, m, dt, inp) {
    if (!this.play) return;
    if (this.play.controls.device !== this._dev) this._keys();
    // timed comms lines
    for (const c of this.commsLines || []) if (c.at != null && !this.saidAt.has(c) && S.time >= c.at) { this.saidAt.add(c); this.say(c.who, c.text); }
    this._comms(dt);
    this.alertT -= dt; if (this.alertT <= 0) this.el.querySelector('.of-alert').hidden = true;

    // armour
    const share = Math.max(0, m.hp / m.hpMax);
    this.el.querySelector('.of-ap').textContent = hpFmt(m.hp);
    const bar = this.el.querySelector('.of-hud-armour .of-bar i'); bar.style.width = (share * 100).toFixed(1) + '%';
    bar.parentElement.classList.toggle('of-low', share < 0.3);
    const st = []; if (m.overheated) st.push('Overheated'); if (m.stall > 0) st.push('Energy stall'); if (m.status?.burn > 0) st.push('Burning'); if (m.status?.shock > 0) st.push('Shocked');
    this.el.querySelector('.of-status').textContent = st.join(' · ');
    // hurt vignette
    const v = this.play.view; v.hurt = Math.max(0, (v.hurt || 0) - dt * 1.5);
    this.el.querySelector('.of-hurt').style.opacity = Math.min(0.8, v.hurt + (share < 0.25 ? 0.25 + 0.15 * Math.sin(this.play.t * 5) : 0)).toFixed(2);

    // weapons
    this.el.querySelectorAll('.of-w').forEach((d, i) => {
      const w = m.weapons[i]; if (!w || w.spec.kind === 'none') return;
      const ammo = d.querySelector('.of-w-ammo');
      ammo.textContent = w.reloadT > 0 ? 'Reloading' : w.inMag != null ? `${fmt(w.inMag, { decimals: 0 })} / ${w.ammo == null ? '∞' : fmt(w.ammo, { decimals: 0 })}` : w.spec.energy ? `${fmt(w.spec.energy, { decimals: 0 })} energy` : '';
      d.classList.toggle('of-w-out', w.ammo === 0 && w.inMag === 0);
      d.classList.toggle('of-w-firing', !!w.held);
      const cd = d.querySelector('.of-w-cd'); cd.style.width = w.reloadT > 0 ? ((1 - w.reloadT / (w.spec.reload || 1.5)) * 100).toFixed(0) + '%' : w.spec.charge ? (w.charge / w.spec.charge * 100).toFixed(0) + '%' : '0%';
      const locks = d.querySelector('.of-w-locks'); locks.textContent = w.spec.lock ? `${w.locks.length} / ${w.spec.lock.count}` : '';
    });

    // objectives
    const ol = this.el.querySelector('.of-hud-obj');
    const rows = S.objectives.map(o => {
      let prog = '';
      if (o.type === 'killAll') prog = o.left != null ? `${fmt(o.left, { decimals: 0 })} left` : '';
      if (o.type === 'destroy') prog = `${o.progress} / ${o.lots.length}`;
      if (o.type === 'survive') prog = clock(Math.max(0, o.time - o.progress));
      if (o.type === 'beat') prog = clock(Math.max(0, o.time - (S.time - (S.def.drop ?? 3))));
      return `<li class="${o.done ? 'of-done' : o.failed ? 'of-failed' : ''}${o.optional ? ' of-opt' : ''}"><span>${o.label}</span><small>${o.done ? 'Done' : o.failed ? 'Missed' : prog}</small></li>`;
    });
    if (S.phase === 'extract') rows.push('<li class="of-extract"><span>Reach the dropship</span><small>Marked green</small></li>');
    const html = rows.join(''); if (html !== this._obj) { ol.innerHTML = html; this._obj = html; }

    this._arcs(S, m, inp);
  }

  _arcs(S, m, inp) {
    const c = this.arcs, v = this.play.view, dpr = v.dpr;
    if (c.width !== v.cv.width || c.height !== v.cv.height) { c.width = v.cv.width; c.height = v.cv.height; }
    const g = this.ax; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, v.W, v.H);
    const me = this.play.lerp(m), p = v.P(me.x, me.z, (me.y || 0) + 0.35), R = 0.62 * TILE_W * v.zoom * 0.5 + 18;
    const T = this.play.T, eMax = energyMaxOf(m, T), hMax = heatMaxOf(m, T);
    const arc = (from, to, frac, col, back = 'rgba(255,255,255,0.12)') => {
      g.lineCap = 'round'; g.lineWidth = 5; g.strokeStyle = back; g.beginPath(); g.arc(p.sx, p.sy, R, from, to); g.stroke();
      g.strokeStyle = col; g.beginPath(); g.arc(p.sx, p.sy, R, from, from + (to - from) * Math.max(0, Math.min(1, frac))); g.stroke();
    };
    // energy: left side, bottom → top
    arc(Math.PI * 0.82, Math.PI * 1.32, (m.energy ?? eMax) / eMax, m.stall > 0 ? '#ff5a3a' : '#3ff0ff');
    // heat: right side, bottom → top; turns red near the limit
    const hf = m.heat / hMax; arc(Math.PI * 0.18, -Math.PI * 0.32, hf, m.overheated ? '#ff3b3b' : hf > 0.8 ? '#ff9a2e' : '#ffcf4a');
    // reticle at the aim point, with the lock circle when a homing weapon is mounted
    const aimPx = inp?.aimPx; if (!aimPx) return;
    const lockW = m.weapons.find(w => w.spec.lock);
    g.strokeStyle = 'rgba(220,245,255,0.9)'; g.lineWidth = 2; g.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(aimPx[0] + dx * 6, aimPx[1] + dy * 6); g.lineTo(aimPx[0] + dx * 13, aimPx[1] + dy * 13); }
    g.stroke();
    if (lockW) {
      const dist = Math.hypot(aimPx[0] - p.sx, aimPx[1] - p.sy), rr = Math.max(26, Math.tan(T.lockCone) * dist);
      g.strokeStyle = 'rgba(255,207,74,0.55)'; g.setLineDash([4, 6]); g.beginPath(); g.arc(aimPx[0], aimPx[1], rr, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      for (const w of m.weapons) for (const id of w.locks) { const e = S.byId.get(id); if (!e || e.dead) continue; const q = v.P(e.x, e.z, (e.flying || 0) + 0.15); g.strokeStyle = '#ffcf4a'; g.lineWidth = 2; g.strokeRect(q.sx - 8, q.sy - 8, 16, 16); }
    }
    if (m.lockOn) { const e = S.byId.get(m.lockOn); if (e && !e.dead) { const q = v.P(e.x, e.z, (e.flying || 0) + 0.2); g.strokeStyle = '#ff5adf'; g.lineWidth = 2.5; g.beginPath(); g.arc(q.sx, q.sy, 16, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(q.sx - 22, q.sy); g.lineTo(q.sx - 12, q.sy); g.moveTo(q.sx + 12, q.sy); g.lineTo(q.sx + 22, q.sy); g.stroke(); } }
    // the last few of a "clear them all" objective: an amber arrow at the screen edge points at each one off screen
    const ka = S.objectives.find(o => o.type === 'killAll' && !o.done);
    if (ka && ka.left > 0 && ka.left <= 6) for (const e of S.enemies) {
      if (e.dead || e.state === 'warn') continue;
      const q = v.P(e.x, e.z, 0.2); if (q.sx > 30 && q.sx < v.W - 30 && q.sy > 30 && q.sy < v.H - 30) continue;
      const a = Math.atan2(q.sy - v.H / 2, q.sx - v.W / 2), r = Math.min(v.W, v.H) / 2 - 40, x = v.W / 2 + Math.cos(a) * r * (v.W / Math.min(v.W, v.H)) * 0.92, y = v.H / 2 + Math.sin(a) * r;
      g.save(); g.translate(Math.max(28, Math.min(v.W - 28, x)), Math.max(28, Math.min(v.H - 28, y))); g.rotate(a);
      g.fillStyle = '#ffb02e'; g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -9); g.lineTo(-4, 0); g.lineTo(-8, 9); g.closePath(); g.fill(); g.restore();
    }
    // incoming sniper / missile warnings: a line from the threat
    for (const e of S.enemies) if (!e.dead && e.state === 'aim' && e.target === m.id) { const a = v.P(e.x, e.z, 0.3), b = v.P(me.x, me.z, 0.4); g.strokeStyle = 'rgba(255,60,40,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); g.stroke(); }
  }

  _comms(dt) {
    const box = this.el.querySelector('.of-comms');
    if (this.commsT > 0) {
      this.commsT -= dt;
      const w = box.querySelector('.of-comms-wave'), g = w.getContext('2d'); g.clearRect(0, 0, w.width, w.height);
      g.fillStyle = this.cur?.colour || '#3ff0ff';
      const talking = this.commsT > 1.2;
      for (let i = 0; i < 32; i++) { const h = talking ? (0.25 + Math.abs(Math.sin(this.play.t * 11 + i * 0.7) * Math.sin(this.play.t * 3.3 + i))) * w.height : 2; g.fillRect(i * 5, (w.height - h) / 2, 3, h); }
      if (this.commsT <= 0) box.hidden = true;
      return;
    }
    const next = this.commsQueue.shift(); if (!next) return;
    const sp = this.speakers?.[next.who] || { name: next.who, colour: '#3ff0ff' };
    this.cur = sp;
    box.querySelector('.of-comms-who').textContent = sp.name;
    box.querySelector('.of-comms-who').style.color = sp.colour;
    box.querySelector('.of-comms-text').textContent = next.text;
    const face = box.querySelector('.of-comms-face'); sp.draw?.(face);
    box.hidden = false; this.commsT = Math.max(4, next.text.length * 0.065) + 1.2;
  }
}

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
