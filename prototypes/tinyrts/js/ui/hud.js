// In-game HUD (DOM): top bar, alerts, objectives, wave preview, cursor info, and the bottom panel
// (minimap, selection panel, command card). Text refreshes ~10x a second; the command card is
// rebuilt when the selection or mode changes.

import { cardFor, costText } from './commandcard.js';
import { GRID } from './controller.js';
import { iconFor } from './icons.js';
import { fmtTime } from '../core/util.js';
import { udef } from '../sim/units.js';
import { M } from '../world/materials.js';
import { findOre } from '../sim/buildings.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class Hud {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('hud');
    this.tooltip = document.getElementById('tooltip');
    this.alerts = [];
    this.lastAlert = null;
    this.t = 0;
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = '';
    // Top bar.
    this.top = el('div', 'topbar');
    this.top.innerHTML = `
      <div class="res" data-tip="crystal"><span class="c-crystal">◆</span> <b id="r-c">0</b> <small id="i-c"></small></div>
      <div class="res" data-tip="ferrite"><span class="c-ferrite">▲</span> <b id="r-f">0</b> <small id="i-f"></small></div>
      <div class="res" data-tip="alloy"><span class="c-alloy">⬢</span> <b id="r-a">0</b> <small id="i-a"></small></div>
      <div class="res power" data-tip="power"><span class="c-power">⚡</span> <b id="r-p">0</b> <span class="batt"><i id="r-batt"></i></span></div>
      <div class="res" data-tip="pop">Pop <b id="r-pop">0/0</b></div>
      <div class="spacer"></div>
      <div class="wave" id="wave"></div>
      <button class="tb-btn" id="btn-early" data-tip="early">Call early</button>
      <div class="speed" id="speed" data-tip="speed"></div>
      <button class="tb-btn icon" id="btn-pause" data-tip="pause">❚❚</button>
      <button class="tb-btn icon" id="btn-menu" data-tip="menu">☰</button>`;
    r.appendChild(this.top);
    this.alertBox = el('div', 'alerts'); r.appendChild(this.alertBox);
    this.objBox = el('div', 'objectives'); r.appendChild(this.objBox);
    this.preview = el('div', 'wave-preview'); r.appendChild(this.preview);
    this.cursorInfo = el('div', 'cursor-info'); r.appendChild(this.cursorInfo);
    this.flashBox = el('div', 'flash'); r.appendChild(this.flashBox);
    this.pausedBanner = el('div', 'paused-banner', 'PAUSED · P to resume'); r.appendChild(this.pausedBanner);
    // Bottom panel.
    const bottom = el('div', 'bottom');
    this.mini = el('canvas', 'minimap');
    this.mini.width = 280; this.mini.height = 84;
    const miniWrap = el('div', 'mini-wrap'); miniWrap.appendChild(this.mini);
    this.sel = el('div', 'selpanel');
    this.card = el('div', 'card');
    this.btns = {};
    for (const code of GRID) {
      const b = el('button', 'cbtn');
      b.tabIndex = -1;
      b.dataset.slot = code;
      b.innerHTML = `<canvas width="30" height="30"></canvas><span class="key"></span><span class="lbl"></span><span class="cost"></span><span class="cdn"></span>`;
      b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.button === 0) this.pressSlot(code); });
      b.addEventListener('mouseenter', () => this.showTip(b, this.slots?.[code]?.tip, this.slots?.[code]));
      b.addEventListener('mouseleave', () => this.hideTip());
      this.card.appendChild(b);
      this.btns[code] = b;
    }
    bottom.append(miniWrap, this.sel, this.card);
    r.appendChild(bottom);
    this.bottom = bottom;

    // HUD mouse handling: over-HUD flag, minimap camera drag, tooltips on top bar.
    for (const part of [this.top, bottom, this.alertBox, this.preview, this.objBox]) {
      part.addEventListener('mouseenter', () => { this.app.overHud = true; });
      part.addEventListener('mouseleave', () => { this.app.overHud = false; });
    }
    let miniDown = false;
    const miniMove = (e) => {
      const g = this.app.game; if (!g) return;
      const rect = this.mini.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
      this.app.camera.centerOn(fx * g.world.w, fy * g.world.h);
    };
    this.mini.addEventListener('mousedown', (e) => { e.preventDefault(); if (e.button === 0) { miniDown = true; miniMove(e); } else if (e.button === 2) { this.miniOrder(e); } });
    this.mini.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => { if (miniDown) miniMove(e); });
    window.addEventListener('mouseup', () => { miniDown = false; });
    this.top.querySelectorAll('[data-tip]').forEach((n) => {
      n.addEventListener('mouseenter', () => this.showTip(n, this.topTip(n.dataset.tip)));
      n.addEventListener('mouseleave', () => this.hideTip());
    });
    this.top.querySelector('#btn-early').addEventListener('click', (e) => { e.currentTarget.blur(); this.app.cmd({ t: 'callWave' }); });
    this.top.querySelector('#btn-pause').addEventListener('click', (e) => { e.currentTarget.blur(); this.app.togglePause(); });
    this.top.querySelector('#btn-menu').addEventListener('click', (e) => { e.currentTarget.blur(); this.app.openPause(); });
    this.top.querySelector('#speed').addEventListener('click', () => this.app.changeSpeed(1, true));
  }

  miniOrder(e) {
    const g = this.app.game; if (!g) return;
    const rect = this.mini.getBoundingClientRect();
    const wx = (e.clientX - rect.left) / rect.width * g.world.w;
    const wy = g.world.surfaceY(Math.floor(wx)) - 1;
    this.app.controller.smartOrder({ x: wx, y: wy }, e.shiftKey);
  }

  attach(game) {
    this.alerts = []; this.alertBox.innerHTML = ''; this.lastAlert = null;
    this.miniTerrain = null; this.miniT = 0;
    const E = game.events;
    const A = (type, text, x, y, cls = '') => this.alert(text, x, y, cls, type);
    E.on('underAttack', (e) => { if (e.team === 1) A('attack', e.kind === 'b' ? `${nameOf(game, e.type)} under attack` : 'Units under attack', e.x, e.y, 'bad'); });
    E.on('buildingDestroyed', (e) => { if (e.team === 1) A('lost', `${nameOf(game, e.type)} destroyed`, e.x, e.y, 'bad'); else if (e.team === 2) A('kill', `Umbra ${nameOf(game, e.type)} destroyed`, e.x, e.y, 'good'); });
    E.on('waveStart', (e) => A('wave', e.boss ? `Wave ${e.n} — BOSS incoming!` : `Wave ${e.n} incoming${e.lanes.some((l) => l.includes('left')) ? ' (both sides)' : ''}`, null, null, 'warn'));
    E.on('waveCleared', (e) => A('clear', `Wave ${e.n} cleared`, null, null, 'good'));
    E.on('researchDone', (e) => { if (e.team === 1) A('research', `Research complete: ${e.name}`, null, null, 'good'); });
    E.on('oreDepleted', (e) => { if (e.team === 1) A('ore', 'A drill ran out of ore (salvage it for a full refund)', e.x, e.y, 'warn'); });
    E.on('commandFailed', (e) => { if (e.team === 1) this.flash(e.reason); });
    E.on('calledEarly', (e) => this.flash(`Wave called early: +${e.bonus} crystal`));
    E.on('commanderDown', (e) => { if (e.team === 1) A('hero', 'Commander down — back in 30 s', null, null, 'bad'); });
    E.on('borerSurfaced', (e) => A('borer', 'Borer surfaced!', e.x, e.y, 'bad'));
    E.on('built', (e) => { if (e.team === 1 && ['fabricator', 'lab', 'reactor'].includes(e.type)) A('built', `${nameOf(game, e.type)} ready`, e.x, e.y, 'good'); });
    E.on('aiIntent', (e) => A('ai', e.text, e.x, e.y, 'warn'));
    E.on('objective', (e) => A('obj', e.text, e.x, e.y, e.cls || 'good'));
    E.on('buildingFalling', (e) => { const b = game.byId.get(e.id); if (b && b.team === 1) A('fall', `${nameOf(game, b.type)} is falling!`, e.x, e.y, 'warn'); });
    this.lastBrownout = false;
    this.refreshCard();
  }

  alert(text, x, y, cls, type) {
    const now = performance.now();
    const same = this.alerts.find((a) => a.text === text && now - a.t < 4000);
    if (same) { same.t = now; same.x = x ?? same.x; same.y = y ?? same.y; return; }
    const node = el('div', 'alert ' + cls, text);
    const a = { text, x, y, t: now, node };
    node.addEventListener('mousedown', (e) => { e.stopPropagation(); if (a.x != null) this.app.camera.centerOn(a.x, a.y); });
    this.alertBox.prepend(node);
    this.alerts.unshift(a);
    while (this.alerts.length > 5) { const old = this.alerts.pop(); old.node.remove(); }
    if (x != null) this.lastAlert = a;
    this.app.audio?.alert(cls);
  }

  jumpToAlert() {
    const a = this.lastAlert;
    if (a && a.x != null) this.app.camera.centerOn(a.x, a.y);
  }

  flash(text) {
    this.flashBox.textContent = text;
    this.flashBox.classList.remove('show'); void this.flashBox.offsetWidth; this.flashBox.classList.add('show');
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => this.flashBox.classList.remove('show'), 1800);
  }

  setCursorInfo(html) {
    if (html === this._ci) return;
    this._ci = html;
    this.cursorInfo.innerHTML = html || '';
    this.cursorInfo.style.display = html ? 'block' : 'none';
  }

  // ---------- command card ----------
  refreshCard() {
    this.cardDirty = true;
  }

  renderCard() {
    this.cardDirty = false;
    const slots = cardFor(this.app);
    this.slots = slots;
    const input = this.app.input;
    for (const code of GRID) {
      const b = this.btns[code];
      const s = slots[code];
      const cv = b.querySelector('canvas');
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, 30, 30);
      b.className = 'cbtn';
      if (!s) { b.classList.add('empty'); b.querySelector('.key').textContent = ''; b.querySelector('.lbl').textContent = ''; b.querySelector('.cost').innerHTML = ''; b.querySelector('.cdn').textContent = ''; continue; }
      const ic = iconFor(s.icon, 30);
      if (ic) { ctx.imageSmoothingEnabled = false; ctx.drawImage(ic, 0, 0); }
      b.querySelector('.key').textContent = input.label(code);
      b.querySelector('.lbl').textContent = s.label;
      b.querySelector('.cost').innerHTML = s.cost || '';
      b.querySelector('.cdn').textContent = s.cd ? s.cd : '';
      if (!s.enabled) b.classList.add('disabled');
      if (s.poor) b.classList.add('poor');
      if (s.active) b.classList.add('active');
      if (s.done) b.classList.add('done');
    }
    if (this.tipFor) { const s = slots[this.tipFor.dataset.slot]; if (s) this.showTip(this.tipFor, s.tip, s); }
  }

  pressSlot(code) {
    if (this.cardDirty || !this.slots) this.renderCard();
    const s = this.slots?.[code];
    if (!s) return;
    if (!s.enabled) { if (s.why) this.flash(s.why); return; }
    this.app.audio?.ui('click');
    s.run();
    this.refreshCard();
  }

  showTip(node, html, slot) {
    if (!html) return;
    this.tipFor = node.classList.contains('cbtn') ? node : null;
    const t = this.tooltip;
    let extra = '';
    if (slot) {
      extra = `<div class="tt-key">Hotkey: ${this.app.input.label(node.dataset.slot)}</div>`;
      if (!slot.enabled && slot.why) extra += `<div class="tt-why">${slot.why}</div>`;
      else if (slot.poor) extra += `<div class="tt-why">Not enough resources</div>`;
    }
    t.innerHTML = html + extra;
    t.hidden = false;
    const r = node.getBoundingClientRect();
    const tw = t.offsetWidth, th = t.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 8;
    if (y < 4) y = r.bottom + 8;
    x = Math.max(4, Math.min(window.innerWidth - tw - 4, x));
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }

  hideTip() { this.tooltip.hidden = true; this.tipFor = null; }

  topTip(kind) {
    const g = this.app.game; if (!g) return '';
    const t = g.teams[1];
    switch (kind) {
      case 'crystal': return `<b>Crystal</b><br>Income ${t.income.c.toFixed(1)}/s (Core +2/s, drills on crystal ore).<br>Spent on almost everything.`;
      case 'ferrite': return `<b>Ferrite</b><br>Income ${t.income.f.toFixed(1)}/s from drills on ferrite ore.<br>Plate walls, machines, and ammo for Mortars, Railguns and Flak.`;
      case 'alloy': return `<b>Alloy</b><br>Made by Refineries from 2 crystal + 1 ferrite.<br>Advanced turrets, units and research.`;
      case 'power': { const p = t.power; return `<b>Power</b><br>Supply ${p.supply.toFixed(1)} · Draw ${p.draw.toFixed(1)}<br>Battery ${Math.round(p.battery)}/${Math.round(p.cap)}${p.ratio < 1 ? `<br><span class="c-bad">BROWN-OUT: everything runs at ${Math.round(p.ratio * 100)}%</span>` : ''}<br><span class="c-dim">Laser turrets draw power only while firing.</span>`; }
      case 'pop': return `<b>Population</b><br>Army units count toward the cap. Drones don't.`;
      case 'early': return `<b>Call next wave early</b> (Shift+N)<br>Earn 1 crystal per second skipped.`;
      case 'speed': return `<b>Game speed</b> (+ / −)`;
      case 'pause': return `<b>Pause</b> (P)`;
      case 'menu': return `<b>Menu</b> (Esc)`;
    }
    return '';
  }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.app.game;
    if (!g) return;
    this.t += dt;
    if (this.cardDirty) this.renderCard();
    this.pausedBanner.style.display = this.app.paused && !this.app.menuOpen ? 'block' : 'none';
    this.drawMinimap(dt);
    if (this.t < 0.1) return;
    this.t = 0;
    const t = g.teams[1];
    const $ = (id) => this.top.querySelector('#' + id);
    $('r-c').textContent = Math.floor(t.res.c);
    $('r-f').textContent = Math.floor(t.res.f);
    $('r-a').textContent = Math.floor(t.res.a);
    $('i-c').textContent = t.income.c > 0.05 ? `+${t.income.c.toFixed(1)}` : '';
    $('i-f').textContent = t.income.f > 0.05 ? `+${t.income.f.toFixed(1)}` : '';
    $('i-a').textContent = t.income.a > 0.05 ? `+${t.income.a.toFixed(1)}` : '';
    const p = t.power;
    const pw = $('r-p');
    pw.textContent = (p.net >= 0 ? '+' : '') + p.net.toFixed(0);
    pw.parentElement.classList.toggle('warn', p.net < 0 && p.ratio >= 1);
    pw.parentElement.classList.toggle('bad', p.ratio < 1);
    $('r-batt').style.width = (p.cap ? Math.round((p.battery / p.cap) * 100) : 0) + '%';
    $('r-batt').parentElement.style.display = p.cap ? 'inline-block' : 'none';
    if (p.ratio < 1 && !this.lastBrownout) this.alert('Brown-out! Build Solar Arrays or a Reactor', null, null, 'bad', 'power');
    this.lastBrownout = p.ratio < 1;
    $('r-pop').textContent = `${t.pop}/${t.popCap}`;
    // Wave.
    const W = g.waves;
    const wave = $('wave'), early = $('btn-early');
    if (W && W.enabled) {
      const total = W.total === Infinity ? '∞' : W.total;
      if (W.phase === 'build' && W.n < W.total) {
        wave.innerHTML = `WAVE ${W.n + 1}/${total} in <b>${fmtTime(W.timer)}</b>`;
        early.style.display = 'inline-block';
        early.textContent = `Call early +${Math.floor(W.timer)}`;
      } else if (W.phase === 'wave') {
        const alive = W.alive.length + W.queue.length;
        wave.innerHTML = `<span class="c-bad">WAVE ${W.n}/${total}</span> · ${alive} left`;
        early.style.display = 'none';
      } else { wave.innerHTML = `WAVES DONE`; early.style.display = 'none'; }
    } else { wave.innerHTML = g.mode === 'versus' ? 'VERSUS · destroy the Umbra Core' : ''; early.style.display = 'none'; }
    $('speed').textContent = this.app.speedLabel();
    $('speed').style.display = this.app.speedAllowed() ? 'block' : 'none';
    // Wave preview.
    if (W && W.preview && W.phase === 'build' && !W.hideBrutalPreview) {
      const groups = {};
      for (const gr of W.preview.groups) { groups[gr.type] = groups[gr.type] || { n: 0, lanes: new Set() }; groups[gr.type].n += gr.count; groups[gr.type].lanes.add(gr.lane); }
      let html = `<div class="wp-title">NEXT WAVE ${W.preview.boss ? '<span class="c-bad">· BOSS</span>' : ''}${W.preview.surge ? ' <span class="c-warn">· SURGE</span>' : ''}</div><div class="wp-list">`;
      for (const [type, info] of Object.entries(groups)) {
        const lanes = [...info.lanes].map((l) => (l.includes('left') ? '◀' : '▶') + (l.startsWith('sky') ? '✈' : l.startsWith('under') ? '⛏' : '')).join(' ');
        html += `<div class="wp-item" data-type="${type}"><canvas width="22" height="22" data-icon="${type}"></canvas><b>${info.n}</b> ${nameOf(g, type)} <span class="c-dim">${lanes}</span></div>`;
      }
      html += '</div>';
      if (this.preview.dataset.html !== html) {
        this.preview.innerHTML = html; this.preview.dataset.html = html;
        this.preview.querySelectorAll('canvas[data-icon]').forEach((c) => { const ic = iconFor({ kind: 'e', type: c.dataset.icon }, 22); c.getContext('2d').drawImage(ic, 0, 0); });
      }
      this.preview.style.display = 'block';
    } else this.preview.style.display = 'none';
    // Objectives.
    const objs = g.objectives ? g.objectives.list() : this.defaultObjectives(g);
    const oh = objs.map((o) => `<div class="obj ${o.done ? 'done' : ''} ${o.failed ? 'failed' : ''}">${o.done ? '✔' : o.failed ? '✖' : '▸'} ${o.text}</div>`).join('');
    if (this.objBox.dataset.html !== oh) { this.objBox.innerHTML = oh; this.objBox.dataset.html = oh; }
    // Alerts fade.
    const now = performance.now();
    for (const a of this.alerts) a.node.style.opacity = now - a.t > 9000 ? 0.35 : 1;
    // Card cooldowns / affordability refresh.
    this.cardTick = (this.cardTick || 0) + 1;
    if (this.cardTick % 3 === 0) this.renderCard();
    this.renderSelection();
  }

  defaultObjectives(g) {
    if (g.mode === 'siege' && g.waves) return [{ text: `Survive ${g.waves.total === Infinity ? 'as long as you can' : g.waves.total + ' waves'} (${g.waves.cleared} cleared)`, done: false }, { text: 'Keep the Core alive', done: false }];
    if (g.mode === 'versus') return [{ text: 'Destroy the Umbra Core', done: false }, { text: 'Keep your Core alive', done: false }];
    return [];
  }

  renderSelection() {
    const c = this.app.controller;
    const g = this.app.game;
    const sel = c.selected();
    let html = '';
    if (!sel.length) {
      html = `<div class="sel-empty"><div class="c-dim">Nothing selected.</div><div class="hint">Build: <b>Q</b> Walls · <b>W</b> Turrets · <b>E</b> Economy · <b>R</b> Base · <b>Z</b> Dig</div><div class="hint">Drag to select units · Right-click to order · <b>?</b> for all keys</div></div>`;
    } else if (sel.length === 1) {
      html = this.singleHtml(g, sel[0]);
    } else {
      const at = c.activeType();
      html = `<div class="multi">` + sel.slice(0, 24).map((e) => {
        const f = e.hp / e.maxHp;
        return `<div class="mi ${e.type === at ? 'sub' : ''}" data-id="${e.id}"><canvas width="26" height="26" data-k="${e.kind}" data-t="${e.type}" data-team="${e.team}"></canvas><i style="width:${Math.round(f * 100)}%;background:${f > 0.6 ? '#6dff9e' : f > 0.3 ? '#ffe066' : '#ff5a6e'}"></i></div>`;
      }).join('') + (sel.length > 24 ? `<div class="more">+${sel.length - 24}</div>` : '') + `</div>`;
    }
    if (this.sel.dataset.html === html) return;
    this.sel.dataset.html = html;
    this.sel.innerHTML = html;
    this.sel.querySelectorAll('canvas[data-t]').forEach((cv) => {
      const ic = iconFor({ kind: cv.dataset.k === 'b' ? 'b' : 'u', type: cv.dataset.t, team: Number(cv.dataset.team) }, cv.width);
      cv.getContext('2d').drawImage(ic, 0, 0);
    });
    this.sel.querySelectorAll('.mi').forEach((n) => n.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const ent = g.byId.get(Number(n.dataset.id));
      if (!ent) return;
      if (e.shiftKey) { c.view.selection.delete(ent.id); this.refreshCard(); }
      else if (e.ctrlKey || e.detail > 1) c.select(sel.filter((s) => s.type === ent.type));
      else c.select([ent]);
    }));
    this.sel.querySelectorAll('[data-cancel]').forEach((n) => n.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.app.cmd({ t: 'cancelTrain', id: Number(n.dataset.b), index: Number(n.dataset.cancel) });
    }));
  }

  singleHtml(g, e) {
    const f = e.hp / e.maxHp;
    const isB = e.kind === 'b';
    const def = isB ? g.data.buildings.list[e.type] : udef(g, e.type);
    const teamName = e.team === 1 ? '' : e.team === 2 ? '<span class="c-umbra">Umbra</span> ' : '<span class="c-hollow">Hollow</span> ';
    let status = [];
    let ctx = '';
    if (isB) {
      if (!e.done) status.push(`<span class="c-warn">Under construction ${Math.round(e.progress * 100)}%</span>`);
      if (e.falling) status.push('<span class="c-bad">Falling!</span>');
      if (e.done && !e.linked && !def.noLink) status.push('<span class="c-bad">Unlinked — build a Relay nearby</span>');
      if (e.done && !e.on) status.push('<span class="c-warn">Turned off</span>');
      if (e.salvage) status.push('<span class="c-warn">Being salvaged</span>');
      if (e.noAmmo) status.push('<span class="c-bad">Out of ferrite ammo</span>');
      if (e.team === 1 && g.teams[1].power.ratio < 1 && (def.power < 0 || def.weapon?.power)) status.push('<span class="c-bad">Brown-out</span>');
      if (def.mine) {
        if (e.depleted) status.push('<span class="c-warn">Depleted — salvage for 100% refund</span>');
        else if (e.team === 1) { const o = this.oreLeft(g, e, def); ctx += `<div>Ore below: <span class="c-crystal">${o.c}</span> / <span class="c-ferrite">${o.f}</span></div>`; }
      }
      if (def.needsSky) ctx += `<div>Sky ${Math.round(e.sky * 100)}% → <span class="c-power">+${(def.power * e.sky).toFixed(1)}</span> power</div>`;
      if (def.weapon && e.team === 1 && e.type !== 'core') ctx += `<div>Target: <b>${({ nearest: 'Nearest', strongest: 'Strongest', weakest: 'Weakest', air: 'Air first', core: 'Closest to Core' })[e.targeting]}</b></div>`;
      if (def.refine) ctx += `<div>${e.refining === false ? '<span class="c-warn">Waiting for crystal/ferrite</span>' : 'Refining alloy'}</div>`;
      if (def.trains && e.queue.length) {
        const first = udef(g, e.queue[0]);
        ctx += `<div class="queue">` + e.queue.map((q, i) => `<span class="qi" data-b="${e.id}" data-cancel="${i}" title="Click to cancel"><canvas width="22" height="22" data-k="u" data-t="${q}" data-team="1"></canvas>${i === 0 ? `<i style="width:${Math.round((e.trainT / (first.train || 8)) * 100)}%"></i>` : ''}</span>`).join('') + `</div>`;
      }
      if (e.type === 'lab') {
        const a = g.teams[e.team].research.active[e.id];
        if (a) { const r = g.data.research.list[a.key]; ctx += `<div>Researching <b>${r.name}</b> ${Math.round((a.t / r.time) * 100)}%</div>`; }
        else ctx += `<div class="c-dim">Idle — pick a project</div>`;
      }
    } else {
      if (e.type === 'drone') status.push(e.job ? `<span class="c-good">${({ site: 'Building', wall: 'Building walls', dig: 'Digging', repair: 'Repairing', salvage: 'Salvaging' })[e.job.kind]}</span>` : '<span class="c-dim">Idle</span>');
      if (e.deployed) status.push('<span class="c-warn">Deployed</span>');
      if (e.waitingRes) status.push('<span class="c-bad">Waiting for resources</span>');
      const o = e.order?.t;
      if (e.type !== 'drone' && o) status.push(`<span class="c-dim">${({ idle: 'Idle', move: 'Moving', amove: 'Attack-moving', attack: 'Attacking', hold: 'Holding', patrol: 'Patrolling' })[o] || o}</span>`);
    }
    const w = def.weapon;
    let stats = '';
    if (w) {
      const dmg = w.dps ? `${w.dps}/s` : `${w.dmg}${w.burst ? '×' + w.burst : ''}`;
      stats = `<span class="c-dim">${w.dtype} ${dmg} · range ${w.range}</span>`;
    } else if (def.bite) stats = `<span class="c-dim">bite ${def.bite.dmg}</span>`;
    return `<div class="single">
      <canvas class="portrait" width="48" height="48" data-k="${isB ? 'b' : 'u'}" data-t="${e.type}" data-team="${e.team}"></canvas>
      <div class="info">
        <div class="name">${teamName}${def.name}</div>
        <div class="hpbar"><i style="width:${Math.round(f * 100)}%;background:${f > 0.6 ? '#6dff9e' : f > 0.3 ? '#ffe066' : '#ff5a6e'}"></i><span>${Math.ceil(e.hp)} / ${Math.round(e.maxHp)}</span></div>
        <div class="stats">${stats}</div>
        <div class="status">${status.join(' · ')}</div>
        <div class="ctx">${ctx}</div>
      </div></div>`;
  }

  oreLeft(g, b, def) {
    const cx = b.x + Math.floor(b.w / 2);
    const x0 = cx - Math.floor(def.mine.w / 2), y0 = b.y + b.h;
    // Cached per second.
    if (b._oreT && g.time - b._oreT < 1) return b._ore;
    let c = 0, f = 0;
    for (let y = y0; y < y0 + def.mine.h; y++) for (let x = x0; x < x0 + def.mine.w; x++) { const m = g.world.get(x, y); if (m === M.CRYSTAL) c++; else if (m === M.FERRITE) f++; }
    b._oreT = g.time; b._ore = { c, f };
    return b._ore;
  }

  drawMinimap(dt) {
    const g = this.app.game;
    const cv = this.mini, ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const sx = W / g.world.w, sy = H / g.world.h;
    this.miniT -= dt;
    if (!this.miniTerrain || this.miniT <= 0) {
      this.miniT = 1.5;
      const off = this.miniTerrain || document.createElement('canvas');
      off.width = W; off.height = H;
      const o = off.getContext('2d');
      const img = o.createImageData(W, H);
      const px = new Uint32Array(img.data.buffer);
      const w = g.world;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const m = w.get(Math.floor(x / sx), Math.floor(y / sy));
        let c = 0xff140b0a;
        if (m === M.CRYSTAL) c = 0xfff5e846;
        else if (m === M.FERRITE) c = 0xff559ff5;
        else if (m !== M.EMPTY && m !== M.FOOTPRINT) c = w.mats.built[m] ? 0xffd7b28f : 0xff6a4e40;
        px[y * W + x] = c;
      }
      o.putImageData(img, 0, 0);
      this.miniTerrain = off;
    }
    ctx.drawImage(this.miniTerrain, 0, 0);
    for (const b of g.buildings) {
      ctx.fillStyle = b.team === 1 ? '#4ee6ff' : b.team === 2 ? '#ffab40' : '#ff4fd8';
      ctx.fillRect(Math.floor(b.x * sx), Math.floor(b.y * sy), Math.max(2, Math.ceil(b.w * sx)), Math.max(2, Math.ceil(b.h * sy)));
    }
    for (const u of g.units) {
      ctx.fillStyle = u.team === 1 ? '#ffffff' : u.team === 2 ? '#ffd080' : (u.burrowed ? '#ff9ae8' : '#ff4fd8');
      ctx.fillRect(Math.floor(u.x * sx), Math.floor((u.y - u.h / 2) * sy), 2, 2);
    }
    const cam = this.app.camera;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
    ctx.strokeRect(Math.floor(cam.x * sx) + 0.5, Math.floor(cam.y * sy) + 0.5, Math.floor(cam.viewW * sx), Math.floor(cam.viewH * sy));
    // Lane arrows during waves.
    const Wv = g.waves;
    if (Wv && (Wv.phase === 'wave' || (Wv.preview && Wv.phase === 'build'))) {
      ctx.fillStyle = '#ff4fd8';
      ctx.fillRect(W - 3, 0, 3, H);
      if (Wv.lanes === 'both' || Wv.lanes === 'chaos') ctx.fillRect(0, 0, 3, H);
    }
  }
}

function nameOf(game, type) {
  return game.data.buildings.list[type]?.name || game.data.units.list[type]?.name || game.data.enemies.list[type]?.name || type;
}
