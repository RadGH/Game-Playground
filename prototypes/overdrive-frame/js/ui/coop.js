// Co-op screens (game-standards §2), one job each: the Co-op screen (host a room, join with a code, find a public
// game) and the Room (invite by QR or link, the four seats, the host's mission, your frame, bots, ready / launch).
// The mission itself runs on the co-op server; js/netplay.js draws it. ?code=ABCD in the address joins at once.
import { fmt } from '../../../../shared/format.js';
import { ask } from '../../../../shared/dialog.js';
import { Net } from '../net/client.js';
import { MAX_SEATS } from '../net/protocol.js';
import { storyList, contractsFor } from '../sim/campaign.js';
import { buildProblems } from '../sim/inventory.js';
import { rankOf } from '../sim/progress.js';
import { BOT_NAMES } from '../sim/bots.js';
import { qrSvg } from '../../../tumblefair/js/client/qr.js';
import { play as sound } from '../../../../citykit/js/world/sound.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const click = () => sound('ui.click', { global: true, gain: 0.4 });
const DISTRICT = { downtown: 'Downtown', residential: 'Residential', industrial: 'Industrial', moon: 'Moon outpost' };   // moon: round 5
const CALL_A = ['Iron', 'Low', 'Copper', 'Grey', 'Night', 'Rust', 'Bright', 'Static', 'Cold', 'Long', 'Quick', 'Steel', 'Dust', 'Signal', 'Arc', 'Torque'];
const CALL_B = ['tide', 'jack', 'wire', 'heron', 'ridge', 'hound', 'lark', 'wren', 'pike', 'gantry', 'rook', 'bolt', 'spur', 'kite', 'drift', 'anvil'];
export const randomCallsign = () => CALL_A[Math.floor(Math.random() * CALL_A.length)] + CALL_B[Math.floor(Math.random() * CALL_B.length)];   // lint-ok: a name suggestion, not game rules
export const joinUrl = code => `${location.origin}${location.pathname}?code=${code}`;

export class Coop {
  constructor(screens, game) {
    this.s = screens; this.g = game; this.net = null; this.room = null; this.list = null; this.qr = { code: null, svg: '' };
    this.listTimer = 0; this.picking = false; this.start = null;
  }
  get active() { return !!this.net && !!this.room; }
  get isHost() { return this.room && this.room.host === this.room.you; }

  /** Connect (once) and listen. Throws when the server can't be reached. */
  async _net() {
    if (this.net?.state === 'open') return this.net;
    if (!this.net) {
      const n = this.net = new Net();
      n.on('room', m => { const first = !this.room; this.room = m; if (first || this.s.current === 'room') this._roomChanged(); });
      n.on('rooms', m => { this.list = m.list; if (this.s.current === 'coop') this._drawList(); });
      n.on('err', m => this._note(m.msg));
      n.on('start', m => this._onStart(m));
      n.on('kicked', m => { this._bye(m.msg || 'You were removed from the room.'); });
      n.on('closed', () => this._bye('The room closed.'));
      n.on('ended', m => { this.g.quitMission(); this.roomScreen(); this._note(m.why); });
      n.on('close', () => this._dot());
      n.on('open', () => this._dot());
      this.pingTimer = setInterval(() => n.ping(), 3000);
    }
    await this.net.connect();
    return this.net;
  }
  _note(text) { if (text) this.s._toast(this.s.root.firstElementChild || this.s.root, text); }
  _bye(text) {
    clearInterval(this.pingTimer); this.net?.close(); this.net = null; this.room = null; this.start = null;
    this.g.quitMission(); this.s.title(); this._note(text);
  }
  /** Your pilot and the frame you bring (sent again whenever you pick another saved build). */
  sendMe() {
    const g = this.g, b = g.build();
    this.net?.send({ t: 'me', name: g.save.callsign || 'Pilot', rank: rankOf(g.save.xp).rank, build: { ...b, name: g.save.builds.find(x => x.id === g.save.active)?.name || '' } });
  }
  leave() { clearInterval(this.pingTimer); this.net?.close(); this.net = null; this.room = null; this.start = null; }

  // ------------------------------------------------------------------ the Co-op screen
  entry(note = '') {
    this.s._leaveNow();
    // a pilot still called the default gets a callsign of their own the first time (editable right here)
    if (!this.g.save.callsign || this.g.save.callsign === 'Frame') { this.g.save.callsign = randomCallsign(); this.g.saveNow(false); }
    const el = h('section', 'of-board of-coop');
    el.innerHTML = `
      <header class="of-bar"><button type="button" class="of-btn of-back" aria-label="Back">‹ Back</button><h1>Co-op</h1><span class="of-net-dot" aria-label="Connection"></span></header>
      <div class="of-coop-body">
        <p class="of-coop-lead">Fly missions with up to three friends. Everyone brings their own frame and keeps their own loot; the pay is never split.</p>
        <label class="of-callsign"><span>Your callsign</span><input type="text" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(this.g.save.callsign)}"></label>
        <p class="of-coop-note" role="status">${esc(note)}</p>
        <div class="of-coop-grid">
          <section class="of-panel"><h2>Host a room</h2><p class="of-dim">You pick the missions from your own city board. Empty seats can be flown by bots.</p>
            <div class="of-seg" role="group" aria-label="Who can join"><button type="button" class="of-btn of-small on" data-pub="0" aria-pressed="true">Invite only</button><button type="button" class="of-btn of-small" data-pub="1" aria-pressed="false">Public</button></div>
            <button type="button" class="of-btn of-primary" data-a="host">Host a room</button></section>
          <section class="of-panel"><h2>Join with a code</h2><p class="of-dim">Four letters, from the host's screen.</p>
            <form class="of-code-form"><input class="of-code-in" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Room code" placeholder="ABCD"><button type="submit" class="of-btn of-primary">Join</button></form></section>
          <section class="of-panel of-find"><h2>Find a game <button type="button" class="of-btn of-small" data-a="refresh">Refresh</button></h2><ol class="of-room-list" aria-live="polite"><li class="of-dim">Looking for public rooms…</li></ol></section>
        </div>
      </div>`;
    el.querySelector('.of-back').addEventListener('click', () => { click(); this.leave(); this.s.title(); });
    const cs = el.querySelector('.of-callsign input');
    cs.addEventListener('change', () => { this.g.save.callsign = cs.value.replace(/[<>&"'`\\]/g, '').trim().slice(0, 16) || this.g.save.callsign; cs.value = this.g.save.callsign; this.g.saveNow(false); });
    let pub = false;
    el.querySelectorAll('[data-pub]').forEach(b => b.addEventListener('click', () => { click(); pub = b.dataset.pub === '1'; el.querySelectorAll('[data-pub]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }));
    const busy = async (fn) => { try { await this._net(); fn(); } catch { el.querySelector('.of-coop-note').textContent = 'The co-op server can\'t be reached right now. Solo play still works — try again in a minute.'; } };
    el.querySelector('[data-a="host"]').addEventListener('click', () => { click(); if (!this._frameOk(el)) return; busy(() => { this.wantRoom = true; this.net.send({ t: 'create', public: pub }); this.sendMeSoon = true; }); });
    const input = el.querySelector('.of-code-in');
    input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    el.querySelector('.of-code-form').addEventListener('submit', e => { e.preventDefault(); click(); if (!this._frameOk(el)) return; if (input.value.length !== 4) { input.focus(); return; } this.join(input.value); });
    el.querySelector('[data-a="refresh"]').addEventListener('click', () => { click(); this.net?.send({ t: 'rooms' }); });
    this.s._show('coop', el);
    this._dot();
    busy(() => this.net.send({ t: 'rooms' }));
    clearInterval(this.listTimer);
    this.listTimer = setInterval(() => { if (this.s.current !== 'coop') { clearInterval(this.listTimer); return; } this.net?.send({ t: 'rooms' }); }, 6000);
    this.s._leave = () => clearInterval(this.listTimer);
  }
  _frameOk(el) {
    const bad = buildProblems(this.g.build(), this.g.P, this.g.C).errors;
    if (bad.length) { el.querySelector('.of-coop-note').textContent = 'Your active frame needs fixing in the hangar\'s assembly bay first.'; return false; }
    return true;
  }
  async join(code) {
    if (!this.g.save.callsign || this.g.save.callsign === 'Frame') { this.g.save.callsign = randomCallsign(); this.g.saveNow(false); }
    try { await this._net(); } catch { this.entry('The co-op server can\'t be reached right now. Solo play still works — try again in a minute.'); return; }
    this.wantRoom = true; this.sendMeSoon = true;
    this.net.send({ t: 'join', code });
  }
  _drawList() {
    const ol = this.s.root.querySelector('.of-room-list'); if (!ol) return;
    if (!this.list?.length) { ol.innerHTML = '<li class="of-dim">No public rooms right now. Host one, and pick Public.</li>'; return; }
    ol.replaceChildren(...this.list.map(r => {
      const li = h('li'), b = h('button', 'of-card'); b.type = 'button';
      b.innerHTML = `<span class="of-card-name">${esc(r.host)}'s room</span><span class="of-card-pay">${r.players} / ${r.seats}</span><span class="of-card-meta">${esc(r.mission || 'Choosing a mission')} · ${r.phase === 'lobby' ? 'in the room' : 'mid-mission — you can drop in'}</span>`;
      if (r.players >= r.seats) b.disabled = true; else b.addEventListener('click', () => { click(); this.join(r.code); });
      li.append(b); return li;
    }));
  }
  _dot() {
    const d = this.s.root.querySelector('.of-net-dot'); if (!d) return;
    const st = this.net?.state || 'closed';
    d.className = 'of-net-dot of-net-' + st;
    d.textContent = st === 'open' ? (this.net.rtt != null ? `${this.net.rtt} ms` : 'online') : st === 'connecting' ? 'connecting' : 'offline';
  }

  // ------------------------------------------------------------------ the Room
  _roomChanged() {
    if (this.sendMeSoon) { this.sendMeSoon = false; this.sendMe(); }
    const r = this.room;
    if (r.phase !== 'lobby' && this.s.current === 'mission') return;      // the HUD shows the team; nothing to redraw
    if (this.s.current === 'room') this._drawRoom(); else if (this.wantRoom || this.s.current === 'coop') { this.wantRoom = false; this.roomScreen(); }
  }
  roomScreen() {
    this.s._leaveNow();
    if (!this.room) { this.entry(); return; }
    const el = h('section', 'of-board of-room');
    el.innerHTML = `
      <header class="of-bar"><button type="button" class="of-btn of-back" data-a="leave">‹ Leave</button><h1>Room <b class="of-room-code"></b></h1><span class="of-net-dot" aria-label="Connection"></span></header>
      <div class="of-room-body">
        <div class="of-room-side">
          <section class="of-panel of-invite"><div class="of-qr" aria-label="QR code to join"></div><div class="of-invite-text"><h2>Invite</h2><p>Scan the code, or send the link. They can join mid-mission too.</p><a class="of-invite-link" target="_blank" rel="noopener"></a>
            <div class="of-row of-left"><button type="button" class="of-btn of-small" data-a="copy">Copy link</button><button type="button" class="of-btn of-small" data-a="bigqr">Big QR</button></div></div></section>
          <section class="of-panel"><h2>Pilots</h2><ol class="of-seats"></ol></section>
          <section class="of-panel of-host-only"><h2>Room</h2>
            <div class="of-opt-row"><span>Bots fill</span><div class="of-seg" role="group" aria-label="Bots">${[0, 1, 2, 3].map(n => `<button type="button" class="of-btn of-small" data-bots="${n}">${n}</button>`).join('')}</div></div>
            <div class="of-opt-row"><span>Who can join</span><div class="of-seg" role="group" aria-label="Who can join"><button type="button" class="of-btn of-small" data-pub="0">Invite only</button><button type="button" class="of-btn of-small" data-pub="1">Public</button></div></div></section>
        </div>
        <div class="of-room-main">
          <section class="of-panel of-room-mission"></section>
          <section class="of-panel of-frames"><h2>Your frame <small>the saved build you bring</small></h2><div class="of-frame-row"></div><div class="of-frame-stats"></div></section>
          <div class="of-room-go"><p class="of-room-why" role="status"></p><button type="button" class="of-btn" data-a="cp" hidden></button><button type="button" class="of-btn of-primary" data-a="go"></button></div>
        </div>
      </div>`;
    el.querySelector('[data-a="leave"]').addEventListener('click', async () => {
      click();
      if (!(await ask({ title: 'Leave the room?', text: this.room?.seats.length > 1 ? 'The others keep playing without you.' : 'The room closes when everyone has left.', ok: 'Leave' }))) return;
      this.leave(); this.s.title();
    });
    el.querySelector('[data-a="copy"]').addEventListener('click', async () => { click(); try { await navigator.clipboard.writeText(joinUrl(this.room.code)); this._note('Link copied.'); } catch { this._note(joinUrl(this.room.code)); } });
    el.querySelector('[data-a="bigqr"]').addEventListener('click', () => { click(); this._bigQr(); });
    el.querySelectorAll('[data-bots]').forEach(b => b.addEventListener('click', () => { click(); this.net.send({ t: 'opt', key: 'bots', value: +b.dataset.bots }); }));
    el.querySelectorAll('[data-pub]').forEach(b => b.addEventListener('click', () => { click(); this.net.send({ t: 'opt', key: 'public', value: b.dataset.pub === '1' }); }));
    el.querySelector('[data-a="cp"]').addEventListener('click', () => { click(); this.net.send({ t: 'start', fromCheckpoint: true }); });
    el.querySelector('[data-a="go"]').addEventListener('click', () => {
      click();
      if (this.isHost) this.net.send({ t: 'start' });
      else { const me = this.room.seats.find(s => s.pid === this.room.you); this.net.send({ t: 'ready', on: !me?.ready }); }
    });
    const row = el.querySelector('.of-frame-row');
    this.s._frames(row, el.querySelector('.of-frame-stats'));
    row.addEventListener('click', () => setTimeout(() => { this.sendMe(); if (!this.isHost && this.room.seats.find(s => s.pid === this.room.you)?.ready) this.net.send({ t: 'ready', on: false }); }, 0));
    this.s._show('room', el);
    this._drawRoom();
  }
  _drawRoom() {
    const el = this.s.root.querySelector('.of-room'); if (!el) return;
    const r = this.room, g = this.g, host = this.isHost;
    el.querySelector('.of-room-code').textContent = r.code;
    el.classList.toggle('of-is-host', host);
    const link = joinUrl(r.code), a = el.querySelector('.of-invite-link'); a.href = link; a.textContent = link.replace(/^https?:\/\//, '');
    if (this.qr.code !== r.code) { this.qr = { code: r.code, svg: '' }; qrSvg(link).then(svg => { this.qr.svg = svg; const q = this.s.root.querySelector('.of-qr'); if (q) q.innerHTML = svg; }).catch(() => {}); }
    else el.querySelector('.of-qr').innerHTML = this.qr.svg;
    // seats: people, then the bots the host asked for, then open seats
    const seats = el.querySelector('.of-seats'), others = r.seats.filter(s => !s.away).length - 1;
    const items = r.seats.map(s => {
      const li = h('li', 'of-seat' + (s.pid === r.you ? ' of-you' : '') + (s.away ? ' of-away' : ''));
      const badges = [s.host ? '<span class="of-badge of-badge-host">Host</span>' : '', s.away ? '<span class="of-badge of-badge-away">Away</span>' : r.phase !== 'lobby' && !s.loaded ? '<span class="of-badge">Loading</span>' : s.host ? '' : s.ready ? '<span class="of-badge of-badge-ready">Ready</span>' : '<span class="of-badge">Not ready</span>'].join('');
      li.innerHTML = `<div class="of-seat-who"><b>${esc(s.name)}${s.pid === r.you ? ' <small>(you)</small>' : ''}</b><span>Rank ${s.rank} · ${esc(s.frame || 'no frame yet')}</span></div><div class="of-seat-badges">${badges}</div>`;
      if (s.pid !== r.you) {
        const b = h('button', 'of-btn of-small of-danger'); b.type = 'button';
        const need = Math.floor(Math.max(1, others) / 2) + 1;
        b.textContent = host ? 'Remove' : `Vote to remove${s.votes ? ` (${s.votes}/${need})` : ''}`;
        b.addEventListener('click', async () => { click(); if (!(await ask({ title: host ? `Remove ${s.name}?` : `Vote to remove ${s.name}?`, text: host ? 'They can\'t come back to this room.' : 'They\'re removed when most of the room agrees.', ok: host ? 'Remove' : 'Vote', danger: true }))) return; this.net.send({ t: host ? 'kick' : 'vote', pid: s.pid }); });
        li.append(b);
      }
      return li;
    });
    const free = MAX_SEATS - r.seats.length;
    for (let i = 0; i < free; i++) items.push(h('li', 'of-seat of-seat-open', i < r.bots ? `<div class="of-seat-who"><b>${BOT_NAMES[i % BOT_NAMES.length]}</b><span>Bot · flies a starter frame</span></div><div class="of-seat-badges"><span class="of-badge of-badge-bot">Bot</span></div>` : '<div class="of-seat-who"><b>Open seat</b><span>Share the code to fill it</span></div>'));
    seats.replaceChildren(...items);
    el.querySelectorAll('[data-bots]').forEach(b => { const on = +b.dataset.bots === r.bots; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    el.querySelectorAll('[data-pub]').forEach(b => { const on = (b.dataset.pub === '1') === r.public; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    this._drawMission(el.querySelector('.of-room-mission'));
    // the button: host launches (when everyone's ready), a guest says ready
    const go = el.querySelector('[data-a="go"]'), why = el.querySelector('.of-room-why'), me = r.seats.find(s => s.pid === r.you);
    const waiting = r.seats.filter(s => s.pid !== r.you && !s.away && (!s.ready || !s.hasBuild));
    if (r.phase !== 'lobby') { go.textContent = 'Mission under way…'; go.disabled = true; why.textContent = 'Your frame drops in beside the team as soon as it\'s loaded.'; }
    else if (host) { go.textContent = 'Launch'; go.disabled = !r.pick || waiting.length > 0 || !me?.hasBuild; why.textContent = !r.pick ? 'Pick a mission.' : waiting.length ? `Waiting for ${waiting.map(s => s.name).join(', ')} to be ready.` : 'Everyone is ready.'; }
    else { go.textContent = me?.ready ? 'Not ready' : 'Ready'; go.disabled = !me?.hasBuild || !r.pick; go.setAttribute('aria-pressed', me?.ready ? 'true' : 'false'); why.textContent = !r.pick ? 'The host is picking a mission.' : me?.ready ? 'Waiting for the host to launch.' : 'Say when you\'re ready.'; }
    const cpBtn = el.querySelector('[data-a="cp"]'), cp = r.pick?.checkpoint;
    cpBtn.hidden = !(host && cp && r.phase === 'lobby'); if (cp) { cpBtn.textContent = `From the checkpoint: ${cp.label}`; cpBtn.disabled = go.disabled; if (!go.disabled) go.textContent = 'Launch from the start'; }
    this._dot();
  }
  /** The mission panel: what's picked (everyone), and for the host, the list to pick from (their own city board). */
  _drawMission(box) {
    const r = this.room, g = this.g, p = r.pick;
    const head = p ? `<div class="of-pick"><h2>${esc(p.label)}</h2><p class="of-brief-meta">${p.contract != null ? 'Contract' : 'Story'}${p.district ? ` · ${esc(g.CAMP.districts.find(d => d.id === p.district)?.name || '')}` : ''} · Loot tier ${p.tier}</p><p class="of-brief-text">${esc(p.brief)}</p></div>` : `<div class="of-pick"><h2>No mission yet</h2><p class="of-dim">${this.isHost ? 'Pick one from your board below.' : 'The host picks from their city board.'}</p></div>`;
    box.innerHTML = head;
    if (!this.isHost || r.phase !== 'lobby') return;
    const story = storyList(g.save, g.CAMP, g.MISSIONS).filter(x => x.open || x.done), contracts = contractsFor(g.save, g.CAMP, g.MAKERS);
    const toggle = h('button', 'of-btn of-small', this.picking || !p ? 'Hide the list' : 'Change mission'); toggle.type = 'button';
    if (!p) this.picking = true;
    toggle.addEventListener('click', () => { click(); this.picking = !this.picking; this._drawMission(box); });
    box.append(toggle);
    if (!this.picking) return;
    const lists = h('div', 'of-board-lists');
    const card = (m, msg) => {
      const li = h('li'), b = h('button', 'of-card' + (p && p.label === m.name ? ' on' : '')); b.type = 'button';
      b.innerHTML = `<span class="of-card-name">${esc(m.name)}</span><span class="of-card-pay">${fmt(m.pay, { decimals: 0 })} cr</span><span class="of-card-meta">${esc(g.CAMP.districts.find(d => d.id === m.district || d.story === m.id)?.name || DISTRICT[m.map.district])} · tier ${m.tier || 1}</span>`;
      b.addEventListener('click', () => { click(); this.picking = false; this.net.send({ t: 'pick', ...msg }); });
      li.append(b); return li;
    };
    const so = h('ol', 'of-board-list'), co = h('ol', 'of-board-list');
    so.append(...story.map(x => card(x.mission, { story: x.mission.id })));
    co.append(...contracts.map((m, i) => card(m, { contract: i, played: g.save.played || 0, grades: g.save.grades })));
    const vo = h('ol', 'of-board-list');
    vo.append(...g.MISSIONS.filter(m => m.versus).map(m => { const li = card(m, { story: m.id }); li.querySelector('.of-card-pay').textContent = m.versus.mode === 'ffa' ? 'Every frame for itself' : 'Red against blue'; return li; }));
    lists.append(h('h3', null, 'Story'), so, h('h3', null, 'Contracts'), co, h('h3', null, 'Versus'), vo);
    box.append(lists);
  }
  _bigQr() {
    const el = h('div', 'of-pause of-bigqr'); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Join code');
    el.innerHTML = `<div class="of-bigqr-card"><div class="of-qr">${this.qr.svg}</div><p>Room <b>${esc(this.room.code)}</b></p><button type="button" class="of-btn of-primary">Close</button></div>`;
    const close = () => { el.remove(); this.s.pad.popLayer(); };
    el.querySelector('button').addEventListener('click', close);
    el.addEventListener('click', e => { if (e.target === el) close(); });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.body.append(el); this.s.pad.pushLayer(el);
  }

  // ------------------------------------------------------------------ a mission
  async _onStart(start) {
    // a second 'start' for the mission already on screen (back after a dropped line): just say we're loaded
    if (this.start && this.g.play?.net && this.start.mission.id === start.mission.id) { this.start = start; this.net.send({ t: 'loaded' }); return; }
    this.start = start;
    const { result, S, m } = await this.s.drop(start.mission, { coop: start, net: this.net });
    if (!result) return;
    this.start = null;
    this.s.results(m, result, S, { coop: true, pid: start.you });
  }
}
