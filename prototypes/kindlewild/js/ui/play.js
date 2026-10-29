// The game screen: one finger uses the selected tool, two fingers move and zoom the view.
// The dock (tabs + paged tiles) picks the tool; the top bar shows mana, the goal and speed.
//
// app = { data, save, stage, saveNow(), onDiscover(id), exitTo(screen), ... } (see main.js)

import { el, modal, toast, banner, show, $ } from './ui.js';
import { pageInfo, pageArt, iconUrl } from './icons.js';
import { play as sound, ambience, stopAmbience, ambienceFor } from './audio.js';

const TABS = ['spell', 'material', 'creature', 'tool'];
const BRUSHED = (page) => page.startsWith('material:') || page === 'tool:erase' || page === 'tool:torch';
const SPEEDS = [1, 2, 3, 0];

export function createPlay(app) {
  const { data } = app;
  const canvas = document.getElementById('world');
  const P = {
    s: null, kind: null, level: null,
    tab: 'spell', page: null, pageIdx: { spell: 0, material: 0, creature: 0, tool: 0 },
    brush: 3, hand: false, speedIdx: 0, collapsed: false,
    pointers: new Map(), gesture: null, cursor: null, held: null,
    lastFail: 0, hudT: 0, seen: new Set(),
  };

  // ---------- starting and stopping ----------
  P.start = function (session, kind, level) {
    P.s = session; P.kind = kind; P.level = level;
    P.speedIdx = 0; P.gesture = null; P.held = null;
    updateSpeed();   // a new level starts at 1x, and the button must say so (it kept showing the old 3x)
    app.stage.setSession(session);
    const v0 = session.sim.village.list.find(v => v.alive);
    app.stage.wholeMap = kind === 'challenge';
    app.stage.fit(level?.focus || (kind !== 'challenge' && v0 ? [v0.x, v0.y + 10] : null));
    show('hud'); show('dock'); show('dock-open', false); P.collapsed = false;
    document.body.classList.add('playing'); dispatchEvent(new Event('resize'));
    $('#realm-strip').classList.toggle('hidden', kind !== 'realm');
    $('#hud').classList.toggle('realm', kind === 'realm');
    // first page that exists in the first tab that has one
    P.tab = TABS.find(t => pagesOf(t).length) || 'spell';
    P.page = pagesOf(P.tab)[0] || null;
    for (const t of TABS) P.pageIdx[t] = 0;
    renderTabs(); renderTiles(); renderSel();
    setTimeout(dockH, 30);
    wireSession(session);
    if (level) showIntro(); else if (kind === 'sandbox') toast('Tap a tile, then touch the land. Two fingers move the view.', '', 4200);
  };
  P.stop = function () {
    P.s = null;
    P.amb = null; stopAmbience();
    document.body.classList.remove('playing'); dispatchEvent(new Event('resize'));
    show('hud', false); show('dock', false); show('dock-open', false);
    $('#inspect').classList.add('hidden');
  };

  // arrows at the screen edge pointing at trouble that is off screen
  const arrows = [];
  function pointAt(x, y, secs) { arrows.push({ x, y, until: performance.now() + secs * 1000, el: null }); }
  function drawArrows() {
    const now = performance.now();
    for (let k = arrows.length - 1; k >= 0; k--) {
      const a = arrows[k];
      if (now > a.until || !P.s) { a.el?.remove(); arrows.splice(k, 1); continue; }
      const [sx, sy] = app.stage.toScreen(a.x, a.y);
      const m = 34, top = 70, bottom = P.collapsed ? 60 : 250;
      const inside = sx > m && sx < innerWidth - m && sy > top && sy < innerHeight - bottom;
      if (!a.el) { a.el = el('div', { class: 'edge-arrow', text: '➤' }); document.getElementById('hud').append(a.el); }
      a.el.classList.toggle('hidden', inside);
      if (inside) continue;
      const cx = innerWidth / 2, cy = (top + innerHeight - bottom) / 2;
      const ang = Math.atan2(sy - cy, sx - cx);
      const ex = Math.max(m, Math.min(innerWidth - m, sx)), ey = Math.max(top, Math.min(innerHeight - bottom, sy));
      a.el.style.transform = `translate(${ex - 16}px, ${ey - 16}px) rotate(${ang}rad)`;
    }
  }
  function buzz(ms) { if (app.save.settings.shake && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* not allowed */ } }
  function wireSession(s) {
    const sim = s.sim;
    sim.on('discover', (e) => app.onDiscover(e.id));
    sim.on('announce', (e) => { toast(e.text, 'warn', 3200); if (e.x != null) pointAt(e.x, e.y, 6); });
    sim.on('omen', (e) => { if (e.start && e.x != null) pointAt(e.x, e.y, 8); });
    sim.on('omen-fire', (e) => pointAt(e.x, e.y, 8));
    sim.on('omen', (e) => { if (e.warn) { banner('Omen: ' + e.name); toast(e.text, 'warn', 4000); sound('bell.toll', {}, 1000); } });
    sim.on('omen-end', (e) => toast(`${e.name} is over — +${e.essence} ✦`, 'good', 3000));
    sim.on('milestone', (e) => toast(`<b>${e.text}</b>${e.essence ? ' +' + e.essence + ' ✦' : ''}`, 'disc', 3600));
    sim.on('building-lost', (e) => { if (P.kind !== 'sandbox' && e.b.beds) toast(`A ${e.kind === 'stonehouse' ? 'stone house' : e.kind} in ${e.v.name} is lost`, 'warn'); });
    sim.on('village-lost', (e) => toast(`${e.v.name} is gone…`, 'warn', 4000));
    sim.on('dragon-flee', () => { banner('The dragon flees!'); });
    sim.on('fled', (e) => { if (e.species === 'dragon') toast('The dragon has flown away.', 'good'); });
    sim.on('death', (e) => { if (e.species === 'dragon') banner('The dragon falls!', 2400); if (e.species === 'troll' && e.cause === 'sunlight') toast('The troll turned to stone in the sunrise!', 'good'); });
    sim.on('built', (e) => { if (P.kind !== 'challenge' && e.kind !== 'lamppost' && e.kind !== 'farm') toast(`${e.v.name} built a ${e.kind === 'stonehouse' ? 'stone house' : e.kind}`, '', 2000); });
    sim.on('meteor', () => { app.stats.meteors = (app.stats.meteors || 0) + 1; buzz(60); });
    sim.on('lightning', () => buzz(25));
    sim.on('blast', (e) => { if (!e.quiet) app.stats.blasts = (app.stats.blasts || 0) + 1; });
    sim.on('birth', () => { app.stats.born = (app.stats.born || 0) + 1; });
    sim.on('building-lost', () => { app.stats.burned = (app.stats.burned || 0) + 1; });
    sim.on('result', (r) => setTimeout(() => showResult(r), 1300));
  }

  // ---------- pages / tabs / tiles ----------
  const CHIPS = [['all', 'All'], ['land', 'Land'], ['liquid', 'Liquids'], ['build', 'Build'], ['glow', 'Glow'], ['wild', 'Wild']];
  P.chip = 'all';
  function chipOf(page) {
    const m = data.materials.list.find(x => x.id === page.slice(9));
    if (!m) return 'wild';
    if (m.layer === 'ground') return 'land';
    if (m.liquid || m.source) return 'liquid';
    if (m.built || m.id === 'boulder' || m.id === 'obsidian' || m.id === 'glass') return 'build';
    if (m.emit) return 'glow';
    return 'wild';
  }
  function renderChips() {
    const box = $('#chips');
    const on = P.tab === 'material' && pagesOf('material', true).length > 10;
    box.classList.toggle('hidden', !on);
    if (!on) return;
    box.innerHTML = '';
    const all = pagesOf('material', true);
    for (const [id, label] of CHIPS) {
      if (id !== 'all' && !all.some(p => chipOf(p) === id)) continue;
      const b = el('button', { class: P.chip === id ? 'on' : '', text: label });
      b.addEventListener('click', () => { P.chip = id; P.pageIdx.material = 0; renderChips(); renderTiles(); });
      box.append(b);
    }
  }
  function pagesOf(tab, unfiltered) {
    const s = P.s;
    if (!s) return [];
    if (tab === 'material' && !unfiltered && P.chip !== 'all') return pagesOf(tab, true).filter(p => chipOf(p) === P.chip);
    if (s.level) return s.level.loadout.filter(p => p.startsWith(tab + ':'));
    const src = s.cfg.everything ? data.grimoire.pages.map(p => p.id) : app.save.pages;
    const order = data.grimoire.pages.map(p => p.id);
    return src.filter(p => p.startsWith(tab + ':')).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  function layout() {
    const tiles = $('#tiles');
    const wpx = tiles.clientWidth || (innerWidth - 80);
    const tileW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile')) || 64;
    const cols = Math.max(3, Math.floor((wpx + 6) / (tileW + 6)));
    const land = innerWidth > innerHeight && innerHeight < 520;
    // one row is enough when this session's biggest tab fits in one (a challenge with few tools)
    const most = Math.max(...TABS.map(t => pagesOf(t, true).length));
    const rows = land ? Math.max(2, Math.floor((innerHeight - 230) / (tileW + 6))) : most <= cols ? 1 : 2;
    document.getElementById('tiles').style.minHeight = rows === 1 ? 'var(--tile)' : '';
    return { cols, rows, per: cols * rows };
  }
  const TAB_PIC = { spell: 'spell:missiles', material: 'material:lava', creature: 'creature:sheep', tool: 'tool:inspect' };
  function renderTabs() {
    for (const b of document.querySelectorAll('#tabs button')) {
      const t = b.dataset.tab;
      const ico = b.querySelector('.tab-ico');
      if (ico && !ico.style.backgroundImage) ico.style.backgroundImage = `url(${pageArt(data, TAB_PIC[t], 32)})`;
      b.classList.toggle('on', t === P.tab);
      b.disabled = pagesOf(t).length === 0;
    }
  }
  function renderTiles() {
    renderChips();
    const box = $('#tiles');
    box.innerHTML = '';
    const list = pagesOf(P.tab);
    const { cols, per } = layout();
    box.style.setProperty('--cols', cols);
    const pages = Math.max(1, Math.ceil(list.length / per));
    P.pageIdx[P.tab] = Math.min(P.pageIdx[P.tab], pages - 1);
    const start = P.pageIdx[P.tab] * per;
    for (const page of list.slice(start, start + per)) box.append(tileFor(page));
    $('#page-prev').disabled = P.pageIdx[P.tab] === 0;
    $('#page-next').disabled = P.pageIdx[P.tab] >= pages - 1;
    const dots = $('#page-dots');
    dots.innerHTML = '';
    if (pages > 1) for (let k = 0; k < pages; k++) dots.append(el('i', { class: k === P.pageIdx[P.tab] ? 'on' : '' }));
  }
  function tileFor(page) {
    const info = pageInfo(data, page);
    const art = pageArt(data, page, 32);
    const fresh = P.kind !== 'challenge' && app.save.seenPages && !app.save.seenPages.includes(page);
    const t = el('button', { class: 'tile' + (page === P.page ? ' sel' : '') + (fresh ? ' new' : ''), 'data-page': page, 'aria-label': info.name });
    if (art) t.append(el('div', { class: 'art', style: { backgroundImage: `url(${art})` } }));
    t.append(el('div', { class: 'name', text: info.name }));
    const cost = P.s.costOf(page, 0, 0, {});
    if (cost && !P.s.endless) t.append(el('div', { class: 'cost', text: page.startsWith('material:') ? `${+cost.toFixed(2)}` : Math.ceil(cost) }));
    t.append(el('div', { class: 'cd', style: { transform: 'scaleY(0)' } }));
    // tap selects; long press shows the card
    let lp = 0, longDone = false;
    t.addEventListener('pointerdown', () => { longDone = false; lp = setTimeout(() => { longDone = true; infoCard(page); }, 520); });
    const clear = () => clearTimeout(lp);
    t.addEventListener('pointerup', clear); t.addEventListener('pointerleave', clear); t.addEventListener('pointercancel', clear);
    t.addEventListener('click', () => { if (longDone) return; select(page); });
    t.addEventListener('contextmenu', (e) => { e.preventDefault(); infoCard(page); });
    return t;
  }
  function select(page) {
    if (P.page === page) { infoCard(page); return; }
    P.page = page;
    if (app.save.seenPages && !app.save.seenPages.includes(page)) { app.save.seenPages.push(page); app.saveNow(); }
    for (const t of document.querySelectorAll('#tiles .tile')) { t.classList.toggle('sel', t.dataset.page === page); if (t.dataset.page === page) t.classList.remove('new'); }
    renderSel();
    sound('ui.click', {}, 30);
  }
  P.select = select;
  function renderSel() {
    const page = P.page;
    const box = $('#sel-icon');
    if (!page) { $('#sel-name').textContent = '—'; $('#sel-sub').textContent = ''; return; }
    const info = pageInfo(data, page);
    const art = pageArt(data, page, 32);
    box.style.backgroundImage = art ? `url(${art})` : 'none';
    box.textContent = '';
    box.style.fontSize = '24px'; box.style.display = 'flex'; box.style.alignItems = 'center'; box.style.justifyContent = 'center';
    $('#sel-name').textContent = info.name;
    const cost = P.s.costOf(page, 0, 0, {});
    let sub = '';
    if (page.startsWith('spell:')) {
      const d = data.spells.spells[page.slice(6)];
      sub = d.aim === 'line' ? 'Drag to draw' : 'Tap to cast';
      if (!P.s.endless) sub += d.aim === 'line' && !d.flat ? ` · ${cost}/cell` : ` · ${cost} mana`;
      const lv = P.s.spellLevels[page.slice(6)];
      if (lv) sub += ` · power ${'+'.repeat(lv)}`;
    } else if (page.startsWith('material:')) sub = 'Drag to paint' + (!P.s.endless ? ` · ${+cost.toFixed(2)} mana a cell (brush ${P.brush}: ~${Math.max(1, Math.round(Math.PI * P.brush * P.brush * cost))})` : '');
    else if (page.startsWith('creature:')) sub = 'Tap to place' + (!P.s.endless ? ` · ${cost} mana` : '');
    else sub = pageInfo(data, page).desc;
    $('#sel-sub').textContent = sub;
    $('#brush').classList.toggle('hidden', !BRUSHED(page));
    $('#brush-size').textContent = P.brush;
  }
  function infoCard(page) {
    const info = pageInfo(data, page);
    const art = pageArt(data, page, 48);
    const pic = art ? el('div', { style: { width: '72px', height: '72px', margin: '0 auto', backgroundImage: `url(${art})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', imageRendering: 'pixelated' } }) : null;
    const cost = P.s.costOf(page, 0, 0, {});
    modal({ title: info.name, body: [pic, el('p', { text: info.desc || '' }), cost ? el('p', { class: 'tip', text: (page.startsWith('material:') ? `${+cost.toFixed(2)} mana a cell` : `${Math.ceil(cost)} mana`) + (P.s.endless ? ' (free here: endless mana)' : '') }) : null], buttons: [{ label: 'Use it', cls: 'big go', onClick: () => select(page) }, { label: 'Close', cls: 'small-btn' }] });
  }

  // dock buttons
  for (const b of document.querySelectorAll('#tabs button')) b.addEventListener('click', () => { P.tab = b.dataset.tab; renderTabs(); renderTiles(); sound('ui.tab', {}, 30); });
  $('#page-prev').addEventListener('click', () => { P.pageIdx[P.tab]--; renderTiles(); });
  $('#page-next').addEventListener('click', () => { P.pageIdx[P.tab]++; renderTiles(); });
  $('#brush-minus').addEventListener('click', () => { P.brush = Math.max(1, P.brush - 1); renderSel(); });
  $('#brush-plus').addEventListener('click', () => { P.brush = Math.min(12, P.brush + 1); renderSel(); });
  $('#btn-hand').addEventListener('click', () => { P.hand = !P.hand; $('#btn-hand').classList.toggle('on', P.hand); toast(P.hand ? 'One finger now moves the view' : 'One finger uses the tool again', '', 1600); });
  $('#btn-collapse').addEventListener('click', () => setCollapsed(true));
  $('#dock-open').addEventListener('click', () => setCollapsed(false));
  $('#sel-name').parentElement.addEventListener('click', () => P.page && infoCard(P.page));
  function setCollapsed(c) { P.collapsed = c; show('dock', !c); show('dock-open', c); dockH(); }
  function dockH() { const d = document.getElementById('dock'); const land = innerWidth > innerHeight && innerHeight < 520; document.documentElement.style.setProperty('--dock-h', (P.collapsed || land ? 70 : (d.offsetHeight || 200) + 8) + 'px'); }
  addEventListener('resize', () => setTimeout(dockH, 50));
  // swipe the tile grid to change page
  { let sx = null; const tiles = $('#tiles');
    tiles.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    tiles.addEventListener('pointerup', (e) => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 50) { P.pageIdx[P.tab] += dx < 0 ? 1 : -1; P.pageIdx[P.tab] = Math.max(0, P.pageIdx[P.tab]); renderTiles(); } }); }
  addEventListener('resize', () => { if (P.s) renderTiles(); });

  $('#btn-speed').addEventListener('click', () => { P.speedIdx = (P.speedIdx + 1) % SPEEDS.length; updateSpeed(); });
  function updateSpeed() { const v = SPEEDS[P.speedIdx]; $('#btn-speed').textContent = v === 0 ? 'II' : v + '×'; $('#btn-speed').classList.toggle('on', v !== 1); }
  P.speed = () => (P.s && !P.s.paused ? SPEEDS[P.speedIdx] : 0);
  P.togglePause = () => { P.speedIdx = SPEEDS[P.speedIdx] === 0 ? 0 : SPEEDS.length - 1; updateSpeed(); };
  $('#btn-menu').addEventListener('click', () => openMenu());
  $('#btn-report').addEventListener('click', () => app.report());
  $('#goal-chip').addEventListener('click', () => showGoals());

  // ---------- using the tool on the world ----------
  function worldAt(cx, cy) { return app.stage.toWorld(cx, cy); }
  function use(x, y, o = {}) {
    if (!P.s || !P.page) return null;
    const r = P.s.use(P.page, x, y, { brush: P.brush, ...o });
    if (!r.ok && r.reason) fail(r.reason);
    if (r.ok && P.page === 'tool:inspect' && r.info) showInspect(r.info);
    if (r.ok && P.page.startsWith('spell:')) {
      app.stats.casts = (app.stats.casts || 0) + 1;
      // a quick ring where the finger touched, so a tap always answers
      const w = P.s.sim.world;
      w.rings = w.rings || [];
      const col = pageInfo(data, P.page).color || '#ffffff';
      const v = parseInt(col.slice(1), 16);
      w.rings.push({ x, y, max: 5, ttl: 8, life: 8, color: [(v >> 16) & 255, (v >> 8) & 255, v & 255] });
    }
    return r;
  }
  function fail(reason) {
    const now = performance.now();
    if (now - P.lastFail < 900) return;
    P.lastFail = now;
    if (reason === 'Not enough mana') { const m = $('#mana'); m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash'); }
    if (reason !== 'Recharging') toast(reason, 'warn', 1400);
    sound('ui.error', {}, 300);
  }
  function showInspect(info) {
    const box = $('#inspect');
    const bits = [];
    if (info.creature) { const c = info.creature; bits.push(`<b>${c.name}</b>${c.young ? ' (young)' : ''} — ${c.hp}/${Math.round(c.maxHp)} health<br>${c.sex ? 'female' : 'male'}, ${c.age}s old, ${c.hunger > 0.6 ? 'hungry' : c.hunger > 0.3 ? 'peckish' : 'fed'}, ${c.state}`); }
    bits.push(`<b>${info.cell !== 'Nothing' ? info.cell : info.ground}</b>${info.cell !== 'Nothing' ? ' on ' + info.ground : ''}${info.burning ? ' — <span style="color:#ff8a3a">burning</span>' : ''}${info.temp > 90 ? ' — hot' : info.temp < 20 ? ' — freezing' : ''}`);
    if (info.village) { const v = info.village; bits.push(`<b>${v.name}</b>: ${v.pop} people, ${v.beds} beds<br>food ${v.food} · wood ${v.wood} · stone ${v.stone}`); }
    box.innerHTML = bits.join('<hr style="border:0;border-top:1px solid #3a2d58;margin:6px 0">');
    box.classList.remove('hidden');
    clearTimeout(P.inspT); P.inspT = setTimeout(() => box.classList.add('hidden'), 5000);
  }

  // pointer gestures on the canvas
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (!P.s) return;
    canvas.setPointerCapture(e.pointerId);
    P.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (P.pointers.size === 2) {
      // two fingers: cancel the tool, start moving the view
      if (P.gesture?.kind === 'grab' && P.held) { P.s.throw(P.held, 0, 0); P.held = null; }
      const [a, b] = [...P.pointers.values()];
      P.gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cam: { ...app.stage.cam } };
      return;
    }
    if (P.pointers.size > 2) return;
    const panning = P.hand || e.button === 1 || e.button === 2 || (e.pointerType === 'mouse' && e.shiftKey);
    if (panning) { P.gesture = { kind: 'pan', x: e.clientX, y: e.clientY, cam: { ...app.stage.cam } }; return; }
    const [wx, wy] = worldAt(e.clientX, e.clientY);
    const page = P.page;
    if (!page) return;
    if (page === 'tool:grab') {
      const c = P.s.grab(wx, wy);
      P.held = c;
      P.gesture = { kind: 'grab', hist: [[wx, wy, performance.now()]] };
      if (!c) toast('Nothing to grab there', '', 1000);
      return;
    }
    const spell = page.startsWith('spell:') ? data.spells.spells[page.slice(6)] : null;
    if (spell?.aim === 'line') { P.gesture = { kind: 'line', x0: wx, y0: wy, x1: wx, y1: wy }; return; }
    if (BRUSHED(page)) {
      // touch: wait a moment in case a second finger is coming (that means "move the view")
      P.gesture = { kind: 'brush', lx: wx, ly: wy, started: e.pointerType === 'mouse', t0: performance.now() };
      if (P.gesture.started) { use(wx, wy); }
      return;
    }
    P.gesture = { kind: 'tap', x: wx, y: wy, t0: performance.now(), cx: e.clientX, cy: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = P.pointers.get(e.pointerId);
    if (e.pointerType === 'mouse') P.cursor = worldAt(e.clientX, e.clientY);
    if (!p || !P.s) return;
    p.x = e.clientX; p.y = e.clientY;
    const g = P.gesture;
    if (!g) return;
    if (g.kind === 'pinch' && P.pointers.size >= 2) {
      const [a, b] = [...P.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      app.stage.pinch(g.cam, g.mx, g.my, mx, my, d / Math.max(1, g.d));
      return;
    }
    if (g.kind === 'pan') { app.stage.panFrom(g.cam, e.clientX - g.x, e.clientY - g.y); return; }
    const [wx, wy] = worldAt(e.clientX, e.clientY);
    P.cursor = [wx, wy];
    if (g.kind === 'grab') { if (P.held) P.s.carry(P.held, wx, wy); g.hist.push([wx, wy, performance.now()]); if (g.hist.length > 6) g.hist.shift(); return; }
    if (g.kind === 'line') { g.x1 = wx; g.y1 = wy; return; }
    if (g.kind === 'brush') {
      if (!g.started) { g.started = true; }
      // paint along the stroke so a fast swipe leaves no gaps
      const n = Math.max(1, Math.ceil(Math.hypot(wx - g.lx, wy - g.ly) / Math.max(1, P.brush * 0.7)));
      for (let k = 1; k <= n; k++) use(g.lx + (wx - g.lx) * k / n, g.ly + (wy - g.ly) * k / n);
      g.lx = wx; g.ly = wy;
    }
  });
  const end = (e) => {
    const p = P.pointers.get(e.pointerId);
    P.pointers.delete(e.pointerId);
    if (!P.s) return;
    const g = P.gesture;
    if (!g) return;
    if (g.kind === 'pinch') { if (P.pointers.size === 0) P.gesture = null; else P.gesture = { kind: 'dead' }; return; }
    if (P.pointers.size > 0) return;
    P.gesture = null;
    if (g.kind === 'dead' || g.kind === 'pan') return;
    const [wx, wy] = worldAt(e.clientX, e.clientY);
    if (g.kind === 'tap') {
      // cast where the finger LIFTS: the aiming circle follows a press-and-drag, so that is where the
      // player is looking (it used to cast back at the first touch). A cancelled touch casts nothing.
      if (e.type === 'pointerup') use(wx, wy);
    } else if (g.kind === 'brush') {
      if (!g.started) use(wx, wy);
    } else if (g.kind === 'line') {
      use(g.x0, g.y0, { x2: g.x1, y2: g.y1 });
    } else if (g.kind === 'grab' && P.held) {
      const h = g.hist;
      let vx = 0, vy = 0;
      if (h.length >= 2) { const a = h[0], b = h[h.length - 1]; const dt = Math.max(16, b[2] - a[2]) / 33; vx = (b[0] - a[0]) / dt; vy = (b[1] - a[1]) / dt; }
      const sp = Math.hypot(vx, vy);
      if (sp > 3) { vx *= 3 / sp; vy *= 3 / sp; }
      P.s.throw(P.held, vx, vy);
      P.held = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', (e) => { P.pointers.delete(e.pointerId); if (P.pointers.size === 0) { if (P.held) { P.s?.throw(P.held, 0, 0); P.held = null; } P.gesture = null; } });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') P.cursor = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); app.stage.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });

  /** Called every frame by the stage: held brushes keep pouring; HUD refresh. */
  P.frame = function () {
    const s = P.s;
    if (!s) return;
    const g = P.gesture;
    if (g?.kind === 'brush' && g.started && P.pointers.size === 1 && (app.stage.frameNo & 3) === 0) use(g.lx, g.ly);
    if (g?.kind === 'brush' && !g.started && performance.now() - g.t0 > 90 && P.pointers.size === 1) { g.started = true; use(g.lx, g.ly); }
    const now = performance.now();
    if (now - P.hudT > 100) { P.hudT = now; hud(); }
    if (arrows.length) drawArrows();
  };

  /** What the shader should draw at the cursor (brush size / spell radius / line preview). */
  P.cursorView = function () {
    const g = P.gesture;
    if (!P.s || !P.page) return null;
    const color = [1, 0.85, 0.5];
    if (g?.kind === 'line') return { x: g.x1, y: g.y1, r: 1.5, color, line: [g.x0, g.y0, g.x1, g.y1] };
    const at = g?.kind === 'brush' ? [g.lx, g.ly] : P.cursor;
    if (!at) return null;
    let r = 2;
    if (BRUSHED(P.page)) r = P.brush;
    else if (P.page.startsWith('spell:')) { const d = data.spells.spells[P.page.slice(6)]; r = (d.radius ?? 3) * (1 + 0.2 * (P.s.spellLevels[P.page.slice(6)] || 0)); }
    const cost = P.s.costOf(P.page, at[0], at[1], {});
    const ok = P.s.endless || P.s.mana.cur >= Math.min(cost, P.page.startsWith('material:') ? 0.5 : cost);
    return { x: at[0], y: at[1], r, color: ok ? color : [1, 0.35, 0.35] };
  };
  P.setCursor = (c) => { P.cursor = c; };

  function hud() {
    const s = P.s;
    const m = s.mana;
    if (s.endless) { $('#mana-fill').style.width = '100%'; $('#mana-num').textContent = '∞'; $('#mana-regen').textContent = ''; $('#mana-ghost').style.width = '0'; }
    else {
      $('#mana-fill').style.width = (100 * m.cur / m.max).toFixed(1) + '%';
      $('#mana-num').textContent = `${Math.floor(m.cur)}/${m.max}`;
      $('#mana-regen').textContent = `+${m.regen.toFixed(1)}/s`;
      const cost = P.page?.startsWith('spell:') || P.page?.startsWith('creature:') ? P.s.costOf(P.page, 0, 0, {}) : 0;
      const after = Math.max(0, m.cur - cost);
      $('#mana-ghost').style.left = (100 * after / m.max).toFixed(1) + '%';
      $('#mana-ghost').style.width = (100 * Math.min(cost, m.cur) / m.max).toFixed(1) + '%';
    }
    // goal chip
    let text = P.kind === 'sandbox' ? 'Sandbox' : '';
    if (s.objectives) {
      const st = s.objectives.status();
      const main = st.find(g => !g.keep && !g.done) || st[0];
      text = main ? `${main.short || main.text}${main.label ? ' ' + main.label : ''}` : '';
      const keep = st.find(g => g.keep && g.progress < 0.75);
      if (keep && !keep.failed) text += ' !';
    }
    if (P.kind === 'realm') {
      const R = s.realm, sum = R.summary();
      text = `Day ${R.day + 1}`;
      const o = R.omen;
      $('#realm-strip').innerHTML = `<span>People ${sum.people}</span><span>Animals ${sum.animals}</span><span>Villages ${sum.villages}</span><span>Faith ${sum.faithRate.toFixed(0)}</span>` + (o ? `<span class="omen">${o.started ? `${o.name}${o.left ? ' — ' + o.left + ' left' : ''}` : `${o.name} in ${Math.max(0, Math.ceil((o.at - s.sim.tick) / 30))}s`}</span>` : `<span>next omen ${Math.max(0, Math.ceil((R.nextOmen - s.sim.tick) / 30))}s</span>`);
      const got = R.collect();
      if (got) app.earn(got);
    }
    $('#goal-text').textContent = text;
    { const w = s.sim.world; const a = Math.atan2(w.wind.y, w.wind.x); const st = w.wind.strength;
      const ar = $('#wind-arrow'); ar.style.transform = `rotate(${a}rad)`; ar.style.opacity = String(0.45 + Math.min(1, st / 2.5) * 0.55); ar.style.fontSize = (12 + Math.min(3, st) * 4) + 'px'; }
    // ambience follows the world: a blaze crackles, rain patters, nights are windy, days are birdsong
    const w = s.sim.world;
    const want = ambienceFor(w, s.sim.daylight());
    if (want !== P.amb) { P.amb = want; ambience(want); }
    // tile states: cooldown sweep, too poor
    for (const t of document.querySelectorAll('#tiles .tile')) {
      const page = t.dataset.page;
      const cd = s.cooldown(page);
      const d = page.startsWith('spell:') ? data.spells.spells[page.slice(6)] : null;
      const frac = d && d.cd ? Math.min(1, cd / d.cd) : 0;
      t.querySelector('.cd').style.transform = `scaleY(${frac})`;
      const cost = s.costOf(page, 0, 0, {});
      t.classList.toggle('poor', !s.endless && !page.startsWith('material:') && cost > m.cur);
    }
  }

  // ---------- intro, goals, menu, results ----------
  function goalList(withStars) {
    const s = P.s;
    const ul = el('ul', { class: 'goal-list' });
    for (const g of s.objectives.status()) {
      ul.append(el('li', { class: (g.keep ? 'keep ' : '') + (g.done ? 'done' : g.failed ? 'failed' : '') },
        el('span', { class: g.keep ? 'gk' : 'gw', text: g.text }),
        g.label ? el('small', { text: g.label }) : null,
        el('div', { class: 'bar' }, el('i', { style: { width: (g.progress * 100).toFixed(0) + '%' } }))));
    }
    if (withStars) {
      const rec = app.save.levels[P.level.id];
      const sl = el('ul', { class: 'star-texts' });
      (P.level.stars || []).forEach((st, k) => sl.append(el('li', { class: rec?.stars[k] ? 'on' : '', text: (rec?.stars[k] ? '★ ' : '☆ ') + st.text })));
      return [ul, el('p', { style: { color: '#e8b860', marginTop: '4px' }, text: 'Stars' }), sl];
    }
    return [ul];
  }
  function levelPic(L) {
    const u = iconUrl(data, L.icon);
    return u ? el('div', { class: 'level-pic', style: { backgroundImage: `url(${u})` } }) : null;
  }
  function showIntro() {
    const L = P.level;
    P.s.paused = true;
    modal({
      title: L.name, cls: 'sticky',
      body: [levelPic(L), ...L.intro.map(t => el('p', { text: t })), ...goalList(true), L.tip && app.save.settings.tips ? el('p', { class: 'tip', text: 'Tip: ' + L.tip }) : null],
      buttons: [{ label: 'Begin', cls: 'big go', onClick: () => { P.s.paused = false; } }],
      onClose: () => { if (P.s) P.s.paused = false; },
    });
  }
  function showGoals() {
    if (!P.s) return;
    if (!P.s.objectives) {
      if (P.kind === 'realm') return realmPanel();
      toast('Sandbox — no goals, just play. Try mixing things!', '', 2400);
      return;
    }
    const was = P.s.paused; P.s.paused = true;
    modal({ title: 'Goals', body: [...goalList(true), P.level.tip ? el('p', { class: 'tip', text: 'Tip: ' + P.level.tip }) : null], buttons: [{ label: 'Back to it', cls: 'big go' }], onClose: () => { if (P.s) P.s.paused = was; } });
  }
  function realmPanel() {
    const R = P.s.realm, sum = R.summary();
    const log = el('ul', { class: 'goal-list' });
    for (const l of R.log.slice(0, 5)) log.append(el('li', {}, el('span', { text: `Day ${l.day + 1}: ${l.name}` }), el('small', { text: `+${l.essence} ✦` })));
    modal({ title: `Day ${R.day + 1}`, body: [
      el('p', { html: `${sum.people} people in ${sum.villages} villages · ${sum.animals} animals<br>Faith ${sum.faithRate.toFixed(1)} — it speeds your mana and pays Essence.<br>Shrines: ${sum.shrines}` }),
      el('p', { class: 'tip', text: 'Omens come every few minutes. Protect your people and they will thank you with faith. Buy Boons in the Grimoire to grow your mana.' }),
      R.log.length ? log : null,
    ], buttons: [{ label: 'Back to it', cls: 'big go' }] });
  }
  function openMenu() {
    if (!P.s) return;
    const was = P.s.paused; P.s.paused = true;
    const buttons = [{ label: 'Resume', cls: 'big go' }];
    if (P.kind === 'challenge') buttons.push({ label: '↻ Restart', onClick: () => app.restart() }, { label: 'Goals', onClick: () => setTimeout(showGoals, 50) });
    if (P.kind === 'sandbox') buttons.push({ label: 'Day / night', onClick: () => { const w = P.s.sim.world; w.clock = P.s.sim.daylight() > 0.4 ? 0.9 : 0.42; } }, { label: '↻ New land', onClick: () => app.restart() });
    if (P.kind === 'realm') buttons.push({ label: 'Realm', onClick: () => setTimeout(realmPanel, 50) });
    if (P.kind !== 'challenge') buttons.push({ label: 'Grimoire', onClick: () => setTimeout(() => app.openGrimoire(), 50) });
    buttons.push({ label: 'Settings', onClick: () => setTimeout(() => app.settings(), 50) }, { label: "What's new", onClick: () => app.news.open() }, { label: 'Credits', onClick: () => setTimeout(() => app.credits.open(), 50) }, { label: '! Report a problem', onClick: () => setTimeout(() => app.report(), 50) }, { label: P.kind === 'realm' ? 'Save and leave' : 'Leave', cls: 'small-btn', onClick: () => app.quit() });
    modal({ title: 'Paused', body: [], buttons, onClose: () => { if (P.s) P.s.paused = was; } });
  }
  P.openMenu = openMenu;

  function showResult(r) {
    if (!P.s || !P.level) return;
    const L = P.level;
    const gained = app.recordLevel(L, r);
    const stars = el('div', { class: 'star-row' }, ...[0, 1, 2].map(k => el('i', { class: r.stars[k] ? 'on' : '', text: '★' })));
    const st = el('ul', { class: 'star-texts' });
    (L.stars || []).forEach((s, k) => st.append(el('li', { class: r.stars[k] ? 'on' : '', text: (r.stars[k] ? '★ ' : '☆ ') + s.text })));
    const body = [];
    if (r.won) body.push(stars, st);
    else body.push(el('p', { style: { textAlign: 'center' }, text: r.reason }));
    body.push(el('p', { style: { textAlign: 'center', color: '#a897c8' }, text: `${Math.round(r.secs)}s · ${r.manaUsed} mana used` }));
    if (gained.essence) body.push(el('div', { class: 'essence-gain', text: `+${gained.essence} ✦ Essence` }));
    if (gained.reward) body.push(el('p', { class: 'tip', text: `New Grimoire page: ${pageInfo(data, gained.reward).name}` }));
    body.push(rating(L));
    const all = data.levels.acts.flatMap(a => a.levels);
    const idx = all.findIndex(l => l.id === L.id);
    const next = idx >= 0 ? all[idx + 1] : null;
    const actOf = (l) => data.levels.acts.find(a => a.levels.includes(l));
    const buttons = [];
    if (r.won && next) buttons.push({ label: actOf(next) !== actOf(L) ? `On to ${actOf(next).name.split(' — ')[0]}` : `Next: ${next.name}`, cls: 'big go', onClick: () => app.startLevel(next) });
    if (r.won && !next && idx >= 0) buttons.push({ label: 'Every act complete!', cls: 'big go', onClick: () => app.exitTo('challenges') });
    if (r.won && L.trial) buttons.push({ label: 'Come back tomorrow for a new trial', cls: 'big go', onClick: () => app.exitTo('challenges') });
    buttons.push({ label: '↻ Try again', cls: r.won ? 'big' : 'big go', onClick: () => app.restart() }, { label: 'Levels', cls: 'small-btn', onClick: () => app.exitTo('challenges') });
    modal({ title: r.won ? (r.starCount === 3 ? 'Perfect!' : 'Well done!') : 'Not this time', body, buttons, cls: 'sticky' });
  }

  function rating(L) {
    const GOOD = ['Big explosions', 'Clever', 'Pretty', 'Just right', 'Fun creatures'];
    const BAD = ['Too hard', 'Too easy', 'Unclear goal', 'Too slow', 'Hard to control'];
    const prev = app.save.ratings[L.id] || {};
    const box = el('div', { class: 'rate' }, el('small', { text: 'How was this level?' }));
    const thumbs = el('div', { class: 'thumbs' });
    const reasons = el('div', { class: 'reasons' });
    const cur = { vote: prev.vote || 0, reasons: new Set(prev.reasons || []) };
    const draw = () => {
      reasons.innerHTML = '';
      thumbs.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === cur.vote));
      if (!cur.vote) return;
      for (const r of cur.vote > 0 ? GOOD : BAD) {
        const b = el('button', { class: cur.reasons.has(r) ? 'on' : '', text: r });
        b.addEventListener('click', () => { cur.reasons.has(r) ? cur.reasons.delete(r) : cur.reasons.add(r); save(); draw(); });
        reasons.append(b);
      }
    };
    const save = () => { app.save.ratings[L.id] = { vote: cur.vote, reasons: [...cur.reasons], at: Date.now() }; app.saveNow(); };
    for (const [v, t] of [[1, 'Liked it'], [-1, 'Not for me']]) {
      const b = el('button', { 'data-v': v, text: t });
      b.addEventListener('click', () => { cur.vote = cur.vote === v ? 0 : v; cur.reasons.clear(); save(); draw(); });
      thumbs.append(b);
    }
    box.append(thumbs, reasons);
    draw();
    return box;
  }

  // keyboard
  addEventListener('keydown', (e) => {
    if (!P.s || document.querySelector('.modal-back') || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    const k = e.key;
    const pan = 18 / app.stage.cam.zoom * 4;
    if (k === 'w' || k === 'ArrowUp') app.stage.cam.y -= pan;
    else if (k === 's' || k === 'ArrowDown') app.stage.cam.y += pan;
    else if (k === 'a' || k === 'ArrowLeft') app.stage.cam.x -= pan;
    else if (k === 'd' || k === 'ArrowRight') app.stage.cam.x += pan;
    else if (k === ' ') { P.speedIdx = SPEEDS[P.speedIdx] === 0 ? 0 : 3; updateSpeed(); e.preventDefault(); }
    else if (k === 'Escape') openMenu();
    else if (k === '[') { P.brush = Math.max(1, P.brush - 1); renderSel(); }
    else if (k === ']') { P.brush = Math.min(12, P.brush + 1); renderSel(); }
    else if (k === '+' || k === '=') app.stage.zoomAt(innerWidth / 2, innerHeight / 2, 1.2);
    else if (k === '-') app.stage.zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.2);
    else if (k === 'q' || k === 'e') P.nextTab(k === 'e' ? 1 : -1);
    else if (/^[1-9]$/.test(k)) { const list = pagesOf(P.tab); const { per } = layout(); const p = list[P.pageIdx[P.tab] * per + (+k - 1)]; if (p) select(p); }
    else return;
    app.stage.clamp();
  });
  P.nextTab = (d) => {
    const avail = TABS.filter(t => pagesOf(t).length);
    if (!avail.length) return;
    P.tab = avail[(avail.indexOf(P.tab) + d + avail.length) % avail.length];
    renderTabs(); renderTiles();
  };
  P.nextTile = (d) => {
    const list = pagesOf(P.tab);
    if (!list.length) return;
    const i = (list.indexOf(P.page) + d + list.length) % list.length;
    const { per } = layout();
    P.pageIdx[P.tab] = Math.floor(i / per);
    renderTiles(); select(list[i]);
  };
  // controller: press/hold/release at a world point, like a finger
  P.padDown = (wx, wy) => {
    const page = P.page;
    if (!page || !P.s) return;
    if (page === 'tool:grab') { P.held = P.s.grab(wx, wy); P.gesture = { kind: 'grab', hist: [[wx, wy, performance.now()]] }; return; }
    const spell = page.startsWith('spell:') ? data.spells.spells[page.slice(6)] : null;
    if (spell?.aim === 'line') { P.gesture = { kind: 'line', x0: wx, y0: wy, x1: wx, y1: wy }; return; }
    if (BRUSHED(page)) { P.gesture = { kind: 'brush', lx: wx, ly: wy, started: true, t0: 0 }; use(wx, wy); return; }
    use(wx, wy);
    P.gesture = null;
  };
  P.padMove = (wx, wy) => {
    const g = P.gesture;
    if (!g) return;
    if (g.kind === 'line') { g.x1 = wx; g.y1 = wy; }
    if (g.kind === 'brush') { use(wx, wy); g.lx = wx; g.ly = wy; }
    if (g.kind === 'grab') { if (P.held) P.s.carry(P.held, wx, wy); g.hist.push([wx, wy, performance.now()]); if (g.hist.length > 6) g.hist.shift(); }
  };
  P.padUp = () => {
    const g = P.gesture;
    P.gesture = null;
    if (!g) return;
    if (g.kind === 'line') use(g.x0, g.y0, { x2: g.x1, y2: g.y1 });
    if (g.kind === 'grab' && P.held) { const h = g.hist; const a = h[0], b = h[h.length - 1]; P.s.throw(P.held, (b[0] - a[0]) / 3, (b[1] - a[1]) / 3); P.held = null; }
  };
  P.brushBy = (d) => { P.brush = Math.max(1, Math.min(12, P.brush + d)); renderSel(); };
  P.refreshTiles = () => { if (P.s) { renderTabs(); renderTiles(); renderSel(); } };
  return P;
}
