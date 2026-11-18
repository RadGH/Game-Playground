// The mission HUD, built like a cockpit frame around the mech (owner: "Cockpit-style screen frame: energy, heat and
// ammo arranged around your mech"): two arcs hug the mech (energy left, heat right), the reticle shows the lock circle
// and lock count, armour top-left, weapons in the bottom corners in the slot they sit in, objectives top-right, and
// comms from a character on the left — never big text in the middle of the screen (owner ruling, lessons 42).
import { fmt, hp as hpFmt } from '../../../../shared/format.js';
import { hintFor } from '../input/bindings.js';
import { OVERLOAD } from '../sim/overload.js';
import { MiniMap } from './minimap.js';
import { energyMaxOf, heatMaxOf } from '../sim/mech.js';
import { TILE_W } from '../../../../citykit/js/iso.js';
import { aceSpeaker } from './speakers.js';

/** Mission comms lines can wait for these sim events (sim/boss.js, sim/ace.js); a line may narrow with part / phase / ace. */
const ROLE_NOTES = { bulwark: 'Shield projector: its dome shields the army inside — kill it first', medic: 'Medic drone: it repairs the army — shoot it down' };
const EVENT_COMMS = new Set(['boss', 'bossPart', 'bossOpen', 'bossPhase', 'bossDown', 'bossKneel', 'aceIn', 'aceDown', 'stage', 'checkpoint', 'objective']);   // stage / checkpoint: long missions (sim/stages.js); objective: a line when one is done (c.objective = its id)

const SLOT_NAMES = ['Left arm', 'Right arm', 'Left shoulder', 'Right shoulder'];
const SLOT_KEYS = ['fireL', 'fireR', 'fireSL', 'fireSR'];

export class Hud {
  constructor(root, { comms, speakers, menu }) {
    this.root = root; this.commsLines = comms; this.speakers = speakers; this.menu = menu;
    this.el = document.createElement('div'); this.el.className = 'of-hud';
    this.el.innerHTML = `
      <canvas class="of-hud-arcs" aria-hidden="true"></canvas>
      <div class="of-hud-armour" role="group" aria-label="Armour"><span class="of-hud-label">Armour</span><b class="of-ap">0</b><div class="of-ap-bar"><i></i></div><small class="of-status"></small><div class="of-od" hidden><span class="of-od-name"></span><div class="of-od-bar"><i></i></div><span class="of-od-key"></span></div></div>
      <ol class="of-hud-obj" aria-label="Objectives"></ol>
      <div class="of-hud-weapons" aria-label="Weapons"></div>
      <div class="of-comms" aria-live="polite" hidden><canvas class="of-comms-face" width="96" height="96" aria-hidden="true"></canvas><div><b class="of-comms-who"></b><p class="of-comms-text"></p><canvas class="of-comms-wave" width="160" height="18" aria-hidden="true"></canvas></div></div>
      <div class="of-alert" hidden></div>
      <div class="of-hurt" aria-hidden="true"></div>
      <button type="button" class="of-menu-btn" aria-label="Menu">☰</button>
      <button type="button" class="of-map-btn" aria-label="Mission map">Map</button>`;
    this.arcs = this.el.querySelector('.of-hud-arcs'); this.ax = this.arcs.getContext('2d');
    this.el.querySelector('.of-menu-btn').addEventListener('click', () => this.openMenu());
    this.map = new MiniMap(this.el);                     // minimap + mission map (ui/minimap.js)
    this.el.querySelector('.of-map-btn').addEventListener('click', () => this.map.toggle());
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
  detach() { this.el.remove(); this.play = null; this.map?.toggle(false); }

  _keys() {
    const dev = this.play?.controls.device || 'keys', gl = this.play?.controls.glyphs || 'xbox';
    this.el.querySelectorAll('.of-w').forEach((d, i) => { d.querySelector('.of-w-key').textContent = hintFor(SLOT_KEYS[i], dev, gl); });
    this.el.querySelector('.of-menu-btn').dataset.key = hintFor('menu', dev, gl);
    this.el.querySelector('.of-map-btn').dataset.key = dev === 'touch' ? '' : hintFor('map', dev, gl);
    this.el.querySelector('.of-od-key').textContent = dev === 'touch' ? '' : hintFor('overload', dev, gl);
    this._dev = dev;
  }

  openMenu() { if (!this.play) return; this.play.paused = true; this.menu?.({ resume: () => { this.play.paused = false; }, play: this.play }); }

  /** Comms: a character speaks (their machine + callsign + a moving waveform). Queued; one at a time. */
  say(who, text) { this.commsQueue.push({ who, text }); }
  notice(text, s = 3) { const a = this.el.querySelector('.of-alert'); a.textContent = text; a.hidden = false; this.alertT = s; }

  onEvent(ev, S) {
    if (ev.type === 'objective') this.notice(`Done: ${ev.label}`, 3);
    if (ev.type === 'objectiveFailed') this.notice(`Missed: ${ev.label}`, 3);
    if (ev.type === 'planted') this.notice('Charge set', 2);
    if (ev.type === 'corePick') this.notice(ev.id === this.play.mech.id ? 'You have the core — get it to the dropship' : 'A teammate has the core', 3);
    if (ev.type === 'coreDrop') this.notice('The core is down — pick it back up', 3);
    if (ev.type === 'allyDown') this.notice('A truck is lost', 2.5);
    if (ev.type === 'allyArrived') this.notice('A truck made it through', 2);
    if (ev.type === 'escaped') this.notice('A hauler got away', 2);
    // co-op: who came and went, who needs picking up
    const who = id => S.byId?.get(id)?.name || 'A teammate';
    // round 5 roles: one short note the first time each support unit shows up in a mission
    if (ev.type === 'espawn' && ROLE_NOTES[ev.kind] && !(S._roleNotes ||= new Set()).has(ev.kind)) { S._roleNotes.add(ev.kind); this.notice(ROLE_NOTES[ev.kind], 3); }
    if (ev.type === 'joined' && ev.id !== this.play.mech.id) this.notice(`${ev.name || 'A pilot'} dropped in`, 2.5);
    if (ev.type === 'left') this.notice(`${ev.name || 'A pilot'} left`, 2.5);
    if (ev.type === 'down' && ev.id !== this.play.mech.id && S.byId?.get(ev.id)?.pid) this.notice(`${who(ev.id)} is down — stand next to them to revive`, 3);
    if (ev.type === 'revive' && ev.id === this.play.mech.id) this.notice(`${who(ev.by)} got you back up`, 2.5);
    if (ev.type === 'phase' && ev.phase === 'extract') this._commsEvent('extract');
    if (EVENT_COMMS.has(ev.type)) this._commsEvent(ev.type, ev);
    if (ev.type === 'say') {             // a rival ace on the open channel: its own frame is the picture
      if (ev.ace && this.speakers && !this.speakers[ev.who]) this.speakers[ev.who] = aceSpeaker(this.play.mechArt, ev.ace);
      this.say(ev.who, ev.text);
    }
    if (ev.type === 'overheat' && ev.id === this.play.mech.id) this.notice('Overheating — ease off', 2.5);
    if (ev.type === 'checkpoint') this.notice(`Checkpoint — ${ev.label}`, 3);
    if (ev.type === 'roundEnd') {
      const mine = ev.winner && ev.winner === this.play.mech.team, who = ev.winner === 'red' ? 'Red' : ev.winner === 'blue' ? 'Blue' : S.mechs.find(x => x.team === ev.winner)?.name || 'The other side';
      this.notice(!ev.winner ? 'Nobody standing — a draw round' : mine ? `You take round ${ev.round}` : `${who} takes round ${ev.round}`, 3);
    }
    if (ev.type === 'roundStart') this.notice(`Round ${ev.round} — fight`, 2);
    if (ev.type === 'frameDown' && ev.by === this.play.mech.id) this.notice(`You downed ${S.byId?.get(ev.id)?.name || 'a frame'}`, 2);
    if (ev.type === 'odReady' && ev.id === this.play.mech.id) this.notice(`Overload ready${this._dev === 'touch' ? '' : ` — ${hintFor('overload', this._dev, this.play.controls.glyphs || 'xbox')}`}`, 2.5);
  }

  _commsEvent(name, ev = null) {
    for (const c of this.commsLines || []) {
      if (c.event !== name || this.saidAt.has(c)) continue;
      if (c.part && c.part !== ev?.part) continue; if (c.phase != null && c.phase !== ev?.phase) continue; if (c.ace && c.ace !== ev?.ace) continue;
      if (c.stage != null && c.stage !== ev?.stage) continue; if (c.again != null && !!c.again !== !!ev?.again) continue; if (c.objective && c.objective !== ev?.id) continue;
      this.saidAt.add(c); this.say(c.who, c.text);
    }
  }

  /** Boss / ace health along the top edge (owner: no centre text): name, a bar, and one pip per breakable part —
   *  whole (its own health), armoured (locked weak point), or broken. Hidden when no boss or ace is in the fight. */
  bossBar(S) {
    const bosses = S.enemies.filter(e => e.boss && e.parts && !e.dead && e.state !== 'warn');
    const aces = S.mechs.filter(m => m.ace && !m.grunt && !m.dead && m.state !== 'warn');   // line frames (round 5) get no bar
    let el = this.el.querySelector('.of-boss');
    if (!bosses.length && !aces.length) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement('div'); el.className = 'of-boss'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Big target'); this.el.append(el); }
    el.hidden = false;
    const rows = [];
    for (const e of bosses) {
      const K = S.kinds[e.kind];
      const pips = e.parts.map(p => `<li class="${p.broken ? 'of-broken' : p.locked ? 'of-locked' : ''}" aria-label="${p.label}: ${p.broken ? 'broken' : p.locked ? 'armoured' : fmt(p.hp / p.hpMax * 100, { decimals: 0 }) + '%'}"><span>${p.label}</span><i style="width:${p.broken ? 100 : Math.round(p.hp / p.hpMax * 100)}%"></i></li>`).join('');
      rows.push(`<div class="of-boss-row"><b>${K.name}</b><div class="of-boss-hp"><i style="width:${(e.hp / e.hpMax * 100).toFixed(1)}%"></i></div><ul class="of-boss-parts">${pips}</ul></div>`);
    }
    for (const m of aces) rows.push(`<div class="of-boss-row of-ace"><b>${m.name}</b><small>Halden-Voss ace</small><div class="of-boss-hp"><i style="width:${(m.hp / m.hpMax * 100).toFixed(1)}%"></i></div></div>`);
    const html = rows.join('');
    if (html !== this._boss) { el.innerHTML = html; this._boss = html; }
  }

  frame(S, m, dt, inp) {
    if (!this.play) return;
    if (inp?.map && performance.now() - (this._mapAt || 0) > 300) { this._mapAt = performance.now(); this.map.toggle(); }   // a press can be seen by two frames between steps
    this.map.frame(S, m, this.play.t || 0);
    if (this.play.controls.device !== this._dev) this._keys();
    // timed comms lines
    for (const c of this.commsLines || []) if (c.at != null && !this.saidAt.has(c) && S.time >= c.at) { this.saidAt.add(c); this.say(c.who, c.text); }
    this._comms(dt);
    this.bossBar(S);
    this.alertT -= dt; if (this.alertT <= 0) this.el.querySelector('.of-alert').hidden = true;

    // armour
    const share = Math.max(0, m.hp / m.hpMax);
    this.el.querySelector('.of-ap').textContent = hpFmt(m.hp);
    const bar = this.el.querySelector(".of-hud-armour .of-ap-bar i"); bar.style.width = (share * 100).toFixed(1) + '%';
    // the Overload core's bar (sim/overload.js): fills with damage dealt, glows when ready, counts down while running
    const od = this.el.querySelector('.of-od'), kind = m.stats?.overload;
    od.hidden = !kind;
    if (kind) {
      const running = m.odT > 0, full = !running && (m.od || 0) >= 1;
      od.classList.toggle('of-od-ready', full); od.classList.toggle('of-od-on', running);
      od.querySelector('.of-od-name').textContent = running ? `${OVERLOAD[kind].label} ${Math.ceil(m.odT)} s` : full ? `${OVERLOAD[kind].label} ready` : 'Overload';
      od.querySelector('.of-od-bar i').style.width = (running ? m.odT / OVERLOAD[kind].time * 100 : Math.min(1, m.od || 0) * 100).toFixed(1) + '%';
    }
    bar.parentElement.classList.toggle('of-low', share < 0.3);
    const st = []; if (m.overheated) st.push('Overheated'); if (m.stall > 0) st.push('Energy stall'); if (m.status?.burn > 0) st.push('Burning'); if (m.status?.shock > 0) st.push('Shocked'); if (m.status?.slow > 0) st.push('Slowed');
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
      if (o.type === 'kill' && o.count > 1) prog = `${fmt(Math.min(o.count, o.progress), { decimals: 0 })} / ${fmt(o.count, { decimals: 0 })}`;
      if (o.type === 'plant' || o.type === 'intercept' || o.type === 'escort') prog = `${o.progress ?? 0} / ${o.goal ?? o.count}`;
      if (o.type === 'carry') prog = S.ops?.core?.carrier ? (S.ops.core.carrier === this.play?.mech?.id ? 'You have it' : 'A teammate has it') : 'On the ground';
      if (o.type === 'escort' && S.ops) prog += ` · ${S.ops.lost} lost`;
      if (o.type === 'intercept' && S.ops) prog += ` · ${S.ops.escaped} got away`;
      return `<li class="${o.done ? 'of-done' : o.failed ? 'of-failed' : ''}${o.optional ? ' of-opt' : ''}"><span>${o.label}</span><small>${o.done ? 'Done' : o.failed ? 'Missed' : prog}</small></li>`;
    });
    if (S.phase === 'extract') rows.push('<li class="of-extract"><span>Reach the dropship</span><small>Marked green</small></li>');
    if (S.versus) {                                   // versus: the score instead of objectives
      const V = S.versus, me = this.play?.mech?.team, name = t => (t === 'red' ? 'Red' : t === 'blue' ? 'Blue' : S.mechs.find(x => x.team === t)?.name || 'Pilot');
      rows.length = 0;
      for (const t of Object.keys(V.score)) rows.push(`<li class="of-vs of-vs-${t === me ? 'me' : 'them'}${t === 'red' || t === 'blue' ? ' of-vs-' + t : ''}"><span>${name(t)}${t === me ? ' (you)' : ''}</span><small>${V.score[t]} / ${V.wins}</small></li>`);
      rows.push(`<li class="of-vs-round"><span>Round ${V.round}</span><small>${V.resetT > 0 ? `next in ${Math.ceil(V.resetT)} s` : 'fight'}</small></li>`);
    }
    if (S.def.stages?.length > 1 && S.phase !== 'extract') rows.unshift(`<li class="of-stage"><span>${S.def.stages[S.stage].label}</span><small>Part ${S.stage + 1} of ${S.def.stages.length}</small></li>`);
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
