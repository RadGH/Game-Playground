// Build mode: the ship editor (PLAN §3 M2).
//
// The editor works on a COPY of the ship: a list of entries { id, x, y, rot, hp, item, isNew, alive },
// a copy of the parts hold and a ledger of what this session has spent. Nothing in the save changes
// until Done; Cancel just throws the copy away. Removed structure that was already on the ship goes
// to a "spares" pile for the session (re-placing it is free); whatever is left in that pile at Done is
// refunded at half its materials.
//
// Entry point: openBuild(app, { docked }) — see js/main.js openBuild().
// Test hook: app.buildUI (state + actions) while the editor is open.

import { el, btn, modal, esc, fmt } from './dom.js';
import { itemTipHTML, itemCard } from './items.js';
import { BLOCKS } from '../data/blocks.js';
import { CLASSES } from '../data/hulls.js';
import { ALL_WEAPONS } from '../data/weapons.js';
import { DAMAGE, DAMAGE_IDS, ARMOR, RARITY_BY_ID, MATERIALS } from '../data/types.js';
import { createGrid, place, killBlock, components } from '../sim/grid.js';
import { makeBody, recompute } from '../sim/ship.js';
import { bakeBody, PLAYER_PALETTE } from '../render/bake.js';
import { drawTurret } from '../render/turret-art.js';
import { makeItem } from '../sim/loot.js';
import { createPadNav } from './padnav.js';

const TABS = [
  { id: 'hull', name: 'Hull', cats: ['frame', 'core', 'cargo'] },
  { id: 'armor', name: 'Armour', cats: ['armor'] },
  { id: 'weapon', name: 'Weapons', cats: ['weapon'] },
  { id: 'shield', name: 'Shields', cats: ['shield'] },
  { id: 'power', name: 'Power', cats: ['power'] },
  { id: 'engine', name: 'Engines', cats: ['engine', 'gyro'] },
  { id: 'cpu', name: 'CPU/Crew', cats: ['cpu', 'crew'] },
  { id: 'utility', name: 'Utility', cats: ['utility'] },
  { id: 'drone', name: 'Drones', cats: ['drone'] },
];
const CAT_COLOR = { frame: '#6a7896', armor: '#9aa3ad', core: '#6fd0ff', power: '#ffd060', engine: '#8fb4ff', gyro: '#d0b060', cpu: '#5fff8a', crew: '#ffd8a0', cargo: '#c8a050', shield: '#7fd0ff', utility: '#ff9a6a', drone: '#ffb040', weapon: '#8a96b0' };
const DEG = Math.PI / 180;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const matName = m => MATERIALS[m]?.name || m;
const itemKey = it => `${it.block}|${it.rarity}|${it.name}`;

let OPEN = null;
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function openBuild(app, { docked = false } = {}) {
  if (OPEN) return OPEN;
  const G = app.G;
  const cls = G.ship.cls; const C = CLASSES[cls] || CLASSES.skiff; const maxB = C.maxBlock || 1;
  const pal = G.ship.palette || PLAYER_PALETTE;

  // ---------------------------------------------------------------- the working copy
  const src = G.ship.grid;
  let sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9;
  for (const [id, x, y] of src.b) { const n = BLOCKS[id]?.size || 1; sx0 = Math.min(sx0, x); sy0 = Math.min(sy0, y); sx1 = Math.max(sx1, x + n); sy1 = Math.max(sy1, y + n); }
  if (sx0 > sx1) { sx0 = sy0 = 0; sx1 = sy1 = 0; }
  const sw = sx1 - sx0, sh = sy1 - sy0;
  const W = Math.max(C.grid, sw), H = Math.max(C.grid, sh);
  const coreRow = src.b.find(r => BLOCKS[r[0]]?.core);
  const ox = Math.floor((W - sw) / 2) - sx0;
  let oy = Math.floor((H - sh) / 2) - sy0;
  if (coreRow) { const n = BLOCKS[coreRow[0]].size || 1; oy = clamp(Math.round(H / 2 - (coreRow[2] + n / 2)), -sy0, H - sh - sy0); }
  let entries = src.b.filter(r => BLOCKS[r[0]]).map(([id, x, y, rot, hp, item]) => ({ id, x: x + ox, y: y + oy, rot: rot || 0, hp, item: item || null, isNew: false, alive: hp > 0, counted: false }));
  const startKeys = new Set(entries.map(e => `${e.id}@${e.x},${e.y},${e.rot}`));
  let parts = G.parts.slice();
  let led = { cr: 0, mats: {}, placed: 0 };
  let spare = {};
  const undoStack = [];
  let changed = false;
  // mirror line: through the middle of the bridge (fallback: the middle of the grid)
  const coreE = entries.find(e => BLOCKS[e.id].core);
  let axis = coreE ? coreE.y + (BLOCKS[coreE.id].size || 1) / 2 : H / 2;
  if (!Number.isInteger(axis * 2)) axis = Math.round(axis * 2) / 2;

  let grid = null; let body = null;
  const startStats = {};
  function rebuild() {
    const g = createGrid(W, H);
    for (const e of entries) if (e.alive) { const b = place(g, e.id, e.x, e.y, e.rot, e.item); e.b = b; if (b) { b.e = e; if (e.hp != null) b.hp = clamp(e.hp, 1, b.maxHp); } }
    for (const e of entries) if (!e.alive) {
      const b = place(g, e.id, e.x, e.y, e.rot, e.item); e.b = b;
      if (b) { b.e = e; killBlock(g, b); }
    }
    grid = g;
    if (!body) body = makeBody('ship', g, { cls, team: 'player', faction: 'player', crew: G.ship.crew ?? 0 });
    body.grid = g; body.crew = G.ship.crew ?? 0; recompute(body);
    dirty.bake = dirty.draw = dirty.stats = true;
  }
  const dirty = { bake: true, draw: true, stats: true, palette: true };
  rebuild();
  Object.assign(startStats, statSummary());

  // ---------------------------------------------------------------- UI shell
  if (!docked) app.mode = 'build';
  const root = el('div', { class: 'panel-full bm' });
  const title = el('h2', {}, el('span', { class: 'bm-wide' }, 'Build mode — '), `${G.ship.name || 'Ship'}`, el('small', { class: 'bm-cls' }, ` ${C.name}`));
  const costEl = el('div', { class: 'bm-cost' });
  const bCancel = btn('Cancel', () => cancel(), 'primary bm-cancel');
  const bDone = btn('Done', () => done(), 'bm-done');
  const bStats = btn('Stats', () => { root.classList.toggle('bm-show-stats'); bStats.classList.toggle('on', root.classList.contains('bm-show-stats')); dirty.stats = true; }, 'bm-stats-btn');
  const bDesigns = btn('Designs', () => designsModal());
  const head = el('div', { class: 'panel-head bm-head' }, title, costEl, el('div', { class: 'grow' }), bStats, bDesigns, bCancel, bDone);

  const tabsEl = el('div', { class: 'tabs bm-tabs' });
  const listEl = el('div', { class: 'bm-list' });
  const infoEl = el('div', { class: 'bm-info' });
  const pal_ = el('div', { class: 'bm-pal' }, tabsEl, infoEl, listEl);

  const cv = el('canvas', { class: 'bm-canvas' });
  const warnEl = el('div', { class: 'bm-warn' });
  const hoverEl = el('div', { class: 'bm-hover hidden' });
  const sayEl = el('div', { class: 'bm-say' });
  const tools = {};
  const toolRow = el('div', { class: 'bm-tools' });
  const mkTool = (id, label, icon, fn, tipText) => { const b = el('button', { class: 'bm-tool', 'aria-label': tipText, onclick: (e) => { e.stopPropagation(); hideTip(); fn(); } }, el('b', {}, icon), el('span', {}, label)); if (tipText) { b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showTip(tipText, e); }); b.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') moveTip(e); }); b.addEventListener('pointerleave', hideTip); } tools[id] = b; toolRow.append(b); return b; };
  mkTool('place', 'Place', '▣', () => setTool('place'), 'Place the selected part (click or tap; drag to paint hull and armour)');
  mkTool('erase', 'Erase', '✕', () => setTool('erase'), 'Remove parts (or right-click). Modules go back to your parts hold.');
  mkTool('move', 'Move', '✥', () => setTool('move'), 'Drag to look around (two fingers always work too)');
  mkTool('rotate', 'Turn', '⟳', () => rotate(1), 'Turn the part you are placing 45° (R). With nothing selected, tap a placed turret to turn it.');
  mkTool('mirror', 'Mirror', '⇅', () => { mirror = !mirror; refreshTools(); dirty.draw = true; say(mirror ? 'Mirror on: parts are copied across the middle line.' : 'Mirror off.'); }, 'Copy every placement across the middle line (M)');
  mkTool('undo', 'Undo', '↶', () => undo(), 'Undo (Ctrl+Z)');
  mkTool('arcs', 'Arcs', '∡', () => { arcsAll = !arcsAll; refreshTools(); dirty.draw = true; }, 'Show where every gun can shoot (G)');
  const zoomRow = el('div', { class: 'bm-zoom' }, btn('−', () => zoomBy(1 / 1.25)), btn('+', () => zoomBy(1.25)), btn('Fit', () => fit()));
  const stage = el('div', { class: 'bm-stage' }, cv, warnEl, hoverEl, sayEl, zoomRow, toolRow);
  const statsEl = el('div', { class: 'bm-stats' });
  const main = el('div', { class: 'bm-main' }, pal_, stage, statsEl);
  root.append(head, main);
  document.querySelector('#panels').append(root);
  // The controller belongs to the editor while it is on top. The game's menu helper would otherwise press
  // whatever button it has highlighted (A) or close the editor (B), so it is paused and a private copy
  // drives only the boxes opened over the editor (Designs, confirmations). Restored on close.
  const panelsEl = document.querySelector('#panels');
  const editorOnTop = () => panelsEl.lastElementChild === root;
  app.padnav?.stop?.();
  const myNav = createPadNav({ busy: editorOnTop, back: () => { const last = panelsEl.lastElementChild; if (last && last !== root) { last.remove(); return true; } return false; } });

  // ---------------------------------------------------------------- state
  let tool = 'place', sel = null, rot = 0, mirror = false, arcsAll = true, tab = 'hull';
  let hover = null;                 // { fx, fy } fractional cell under the mouse
  let padCur = null;                // { x, y } cell under the controller cursor
  let tipEl = null;
  const V = { scale: 20, ox: 0, oy: 0, cw: 0, ch: 0 };
  let t0 = performance.now();

  function say(msg, kind = '') {
    const d = el('div', { class: 'bm-msg ' + kind }, msg); sayEl.append(d);
    setTimeout(() => d.remove(), 3200); while (sayEl.children.length > 3) sayEl.firstChild.remove();
  }
  function setTool(t) { tool = t; refreshTools(); dirty.draw = true; }
  function refreshTools() {
    for (const [id, b] of Object.entries(tools)) b.classList.toggle('on', id === tool || (id === 'mirror' && mirror) || (id === 'arcs' && arcsAll));
    tools.undo.disabled = !undoStack.length;
    tools.rotate.querySelector('span').textContent = selDef()?.rot ? `Turn ${rot * 45}°` : 'Turn';
  }

  // ---------------------------------------------------------------- money and materials
  const crLeft = () => G.credits - led.cr;
  const matLeft = m => (G.cargo[m] || 0) - (led.mats[m] || 0);
  function missingFor(def) {
    if ((spare[def.id] || 0) > 0) return null;
    const c = def.cost || {}; const miss = [];
    if ((c.cr || 0) > crLeft()) miss.push(`${fmt(c.cr - crLeft())} credits`);
    for (const [m, v] of Object.entries(c.mats || {})) if (v > matLeft(m)) miss.push(`${v - Math.max(0, matLeft(m))} ${matName(m)}`);
    return miss.length ? miss : null;
  }
  function spend(def, sign) {
    const c = def.cost || {};
    led.cr += sign * (c.cr || 0);
    for (const [m, v] of Object.entries(c.mats || {})) led.mats[m] = (led.mats[m] || 0) + sign * v;
  }
  const costText = def => { const c = def.cost || {}; return [...Object.entries(c.mats || {}).map(([m, v]) => `${v} ${matName(m)}`), c.cr ? `${fmt(c.cr)} cr` : null].filter(Boolean).join(' · '); };

  // ---------------------------------------------------------------- undo
  let pendingSnap = null;
  const snap = () => ({ entries: entries.map(e => ({ ...e, b: null })), parts: parts.slice(), led: JSON.parse(JSON.stringify(led)), spare: { ...spare } });
  function beginAction() { pendingSnap = snap(); }
  function touched() { if (pendingSnap) { undoStack.push(pendingSnap); if (undoStack.length > 200) undoStack.shift(); pendingSnap = null; } changed = true; refreshTools(); dirty.palette = true; }
  function undo() {
    const s = undoStack.pop(); if (!s) { say('Nothing to undo.'); return; }
    entries = s.entries; parts = s.parts; led = s.led; spare = s.spare; rebuild(); refreshTools(); dirty.palette = true; changed = true;
  }

  // ---------------------------------------------------------------- selection
  function selDef() { return sel ? BLOCKS[sel.id] : null; }
  function selItemsLeft() { return sel?.kind === 'item' ? parts.filter(it => itemKey(it) === sel.key).length : Infinity; }
  function select(s) {
    sel = s; if (s && tool !== 'place') tool = 'place';
    const d = selDef(); if (d && !d.rot) { /* keep rot for the next turret */ }
    refreshTools(); dirty.palette = dirty.draw = true; showInfo();
  }

  // ---------------------------------------------------------------- editing
  function entryAt(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const v = grid.cells[y * W + x]; if (v) return grid.blocks[v - 1].e;
    for (const e of entries) { if (e.alive) continue; const n = BLOCKS[e.id].size || 1; if (x >= e.x && x < e.x + n && y >= e.y && y < e.y + n) return e; }
    return null;
  }
  function eraseEntry(e) {
    const i = entries.indexOf(e); if (i < 0) return;
    entries.splice(i, 1);
    const def = BLOCKS[e.id];
    // a module goes back to the hold; a DESTROYED stock module (no item of its own) is scrap, not a free new part
    if (def.module) { if (e.item) parts.push(e.item); else if (e.alive) parts.push(makeItem(Math.random, e.id, 'common')); }
    else if (!e.alive) { /* a broken structure block: nothing comes back */ }
    else if (e.isNew) spend(def, -1);
    else spare[e.id] = (spare[e.id] || 0) + 1;
    if (e.counted) led.placed--;
  }
  /** Why a part can't go at (x, y) — '' when it can. */
  function blockReason(def, x, y, item) {
    const n = def.size || 1;
    if (n > maxB) return `${C.name} hulls can only fit parts up to ${maxB}×${maxB}.`;
    if (x < 0 || y < 0 || x + n > W || y + n > H) return 'That is outside the hull limits.';
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (grid.cells[(y + j) * W + x + i]) return 'Something is already there.';
    if (def.module) { if (!item) return `You have no more ${def.name} parts.`; }
    else { const miss = missingFor(def); if (miss) return `Not enough: need ${miss.join(', ')}.`; }
    return '';
  }
  function putOne(def, x, y, r, quiet) {
    let item = null;
    if (def.module) item = sel?.kind === 'item' ? parts.find(it => itemKey(it) === sel.key) : parts.find(it => it.block === def.id);
    const why = blockReason(def, x, y, item);
    if (why) { if (!quiet) say(why, 'bad'); return false; }
    // broken blocks under the new one are cleared away
    const n = def.size || 1;
    for (const e of entries.slice()) if (!e.alive) { const m = BLOCKS[e.id].size || 1; if (e.x < x + n && e.x + m > x && e.y < y + n && e.y + m > y) eraseEntry(e); }
    let isNew = true;
    if (def.module) parts.splice(parts.indexOf(item), 1);
    else if ((spare[def.id] || 0) > 0) { spare[def.id]--; isNew = false; }
    else spend(def, 1);
    const e = { id: def.id, x, y, rot: def.rot ? r & 7 : 0, hp: null, item, isNew, alive: true, counted: true };
    entries.push(e); led.placed++;
    const b = place(grid, e.id, x, y, e.rot, item); if (b) { b.e = e; e.b = b; }
    return true;
  }
  const mirrorY = (y, n) => Math.round(2 * axis - y - n);
  function tryPlace(x, y, quiet = false) {
    const def = selDef(); if (!def) return false;
    if (sel.kind === 'item' && !selItemsLeft()) { if (!quiet) say(`No more of that part left.`, 'bad'); return false; }
    const ok = putOne(def, x, y, rot, quiet);
    let ok2 = false;
    if (mirror) { const my = mirrorY(y, def.size || 1); if (my !== y) ok2 = putOne(def, x, my, (8 - rot) & 7, true); }
    if (ok || ok2) { touched(); dirty.bake = dirty.draw = dirty.stats = true; body.grid = grid; recompute(body); }
    if (sel?.kind === 'item' && !selItemsLeft()) { say('That was the last one.'); sel = null; showInfo(); }
    return ok || ok2;
  }
  function tryErase(x, y, quiet = false) {
    const e = entryAt(x, y); let any = false;
    if (e) { eraseEntry(e); any = true; }
    if (mirror) { const my = Math.round(2 * axis - 1 - y); const e2 = entryAt(x, my); if (e2 && e2 !== e && entries.includes(e2)) { eraseEntry(e2); any = true; } }
    if (any) { rebuild(); touched(); }
    else if (!quiet) say('Nothing there to remove.');
    return any;
  }
  function turnPlaced(x, y) {
    const e = entryAt(x, y); if (!e || !BLOCKS[e.id].rot || !e.alive) return false;
    beginAction(); e.rot = (e.rot + 1) & 7; rebuild(); touched(); say(`${BLOCKS[e.id].name} turned to ${facingWord(e.rot)}.`); return true;
  }
  function rotate(dir) {
    rot = (rot + dir + 8) & 7; refreshTools(); showInfo(); dirty.draw = true;
    if (!selDef()?.rot) say(selDef() ? 'This part has no facing — only guns and deflectors turn.' : `Facing set to ${facingWord(rot)}. Pick a gun to place it that way.`);
  }
  const facingWord = r => ['front', 'front-right', 'right side', 'back-right', 'back', 'back-left', 'left side', 'front-left'][r & 7];

  /** Where the ghost goes for a pointer at fractional cell (fx, fy). */
  function ghostAt(fx, fy, def) {
    const n = def ? def.size || 1 : 1;
    return { x: clamp(Math.round(fx - n / 2), 0, W - n), y: clamp(Math.round(fy - n / 2), 0, H - n), n };
  }

  // ---------------------------------------------------------------- numbers
  function wStat(b, key) {
    const w = ALL_WEAPONS[b.def.weapon]; const it = b.item; const rb = it?.rarity ? RARITY_BY_ID[it.rarity]?.bonus || 0 : 0; const m = it?.mods || {};
    if (key === 'dmg') return w.dmg * (1 + rb + (m.dmg || 0));
    if (key === 'rate') return (w.rate || 0) * (1 + (m.rate || 0) + rb * 0.3);
    if (key === 'range') return w.range * (1 + (m.range || 0) + rb * 0.15);
    return w[key];
  }
  function blockDps(b) {
    const w = ALL_WEAPONS[b.def.weapon]; if (!w || w.mode === 'tool') return 0;
    const d = wStat(b, 'dmg');
    if (w.mode === 'beam' || w.proj === 'beam') return d;
    return d * (w.count || 1) * wStat(b, 'rate') * (w.chain ? 1 + w.chain * 0.6 : 1);
  }
  function statSummary() {
    const st = body.stats; let dps = 0; const byType = {};
    for (const b of grid.blocks) if (b.alive && b.def.weapon) { const v = blockDps(b); dps += v; const ty = ALL_WEAPONS[b.def.weapon].type; byType[ty] = (byType[ty] || 0) + v; }
    return { speed: st.maxSpeed, turn: st.turnRate / DEG, hp: st.hp, maxHp: st.maxHp, shield: st.shieldMax, dps, byType, mass: st.mass, blocks: st.blocks };
  }
  function armourAverages() {
    const sum = Object.fromEntries(DAMAGE_IDS.map(k => [k, 0])); let wt = 0;
    for (const b of grid.blocks) { if (!b.alive) continue; const n = b.def.size || 1; const A = ARMOR[b.def.armor] || ARMOR.frame; wt += n * n; for (const k of DAMAGE_IDS) sum[k] += (A.resist[k] || 0) * n * n; }
    for (const k of DAMAGE_IDS) sum[k] = wt ? sum[k] / wt : 0;
    return sum;
  }
  /** Gun count per 5° slice around the ship (local angles, 0 = front). */
  function coverage() {
    const N = 72; const out = new Array(N).fill(0);
    for (const b of grid.blocks) {
      if (!b.alive || !b.def.weapon) continue; const w = ALL_WEAPONS[b.def.weapon]; if (w.mode === 'tool') continue;
      const c = b.rot * Math.PI / 4, h = w.arc >= 360 ? 4 : w.arc * DEG / 2;
      for (let i = 0; i < N; i++) if (Math.abs(angDiff(c, (i + 0.5) * Math.PI * 2 / N)) <= h) out[i]++;
    }
    return out;
  }
  function problems() {
    const out = []; const st = body.stats;
    const cores = entries.filter(e => BLOCKS[e.id].core);
    let coreB = null;
    if (!cores.length) out.push({ msg: 'Your ship needs a bridge — the block you fly it from. Put one back from the Hull tab.', stop: true });
    else if (cores.length > 1) out.push({ msg: `A ship can only have one bridge. Remove ${cores.length - 1} of them.`, stop: true });
    else if (!cores[0].alive) out.push({ msg: 'The bridge is broken. Remove it and place a working one.', stop: true });
    else coreB = cores[0].b;
    const loose = disconnected();
    if (coreB && loose.size) out.push({ msg: `${loose.size} part${loose.size > 1 ? 's are' : ' is'} not joined to the bridge (shown in red). Join them with hull frame or remove them — loose parts would just fall off.`, stop: true });
    if (st.cpu > st.cpuCap) out.push({ msg: `Over the CPU limit (${st.cpu} used, ${st.cpuCap} available). Add CPU nodes or remove some weapons or shields.`, stop: true });
    if (!st.powerOk) out.push({ msg: `Not enough power (${Math.round(st.power)} made, ${Math.round(st.powerUse)} used): weapons fire slower and shields charge slower. Add fuel cells or reactors.` });
    const have = Math.min(G.ship.crew ?? 0, st.crewCap);
    if ((G.ship.crew ?? 0) > st.crewCap) out.push({ msg: `Only ${st.crewCap} bunks: ${(G.ship.crew ?? 0) - st.crewCap} crew would have to leave. Add crew quarters to keep them.` });
    if (st.crewNeed > have) out.push({ msg: `Short of crew (${have} aboard, ${st.crewNeed} needed): parts run slower. Hire more at a crew hall.` });
    const held = Object.values(G.cargo).reduce((a, b) => a + b, 0) - Object.values(led.mats).reduce((a, b) => a + b, 0);
    if (st.cargo < held && st.cargo < startStatsCargo) out.push({ msg: `Your hold would be over-full (${fmt(held)} carried, room for ${fmt(st.cargo)}).` });
    return out;
  }
  const startStatsCargo = body.stats.cargo;
  let looseMemo = { g: null, v: -1, set: null };
  function disconnected() {
    if (looseMemo.g === grid && looseMemo.v === grid.version) return looseMemo.set;
    const core = grid.blocks.find(b => b.alive && b.def.core);
    const groups = components(grid, core);
    const set = new Set();
    groups.forEach((g, i) => { if (i > 0 || !core) for (const b of g) set.add(b); });
    if (!core) set.clear();
    looseMemo = { g: grid, v: grid.version, set };
    return set;
  }

  // ---------------------------------------------------------------- palette
  function renderTabs() {
    tabsEl.innerHTML = '';
    TABS.forEach((t, i) => {
      const count = parts.filter(it => t.cats.includes(BLOCKS[it.block]?.cat)).length;
      const b = btn(t.name, () => { tab = t.id; dirty.palette = true; }, tab === t.id ? 'on' : '');
      if (count) b.append(el('i', { class: 'bm-badge' }, String(count)));
      b.setAttribute('aria-label', `${t.name} (key ${i + 1})`);
      b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showTip(`${t.name} <span class="meh">(key ${i + 1})</span>`, e); });
      b.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') moveTip(e); });
      b.addEventListener('pointerleave', hideTip);
      tabsEl.append(b);
    });
  }
  const iconCache = new Map();
  function iconFor(id) {
    if (iconCache.has(id)) return iconCache.get(id);
    const def = BLOCKS[id]; const n = def.size || 1;
    const g = createGrid(n, n); place(g, id, 0, 0, 0, null);
    const bk = bakeBody({ grid: g, team: 'player', faction: 'player', palette: pal, kind: 'ship', id: 3, seed: 3 });
    iconCache.set(id, bk); return bk;
  }
  function drawIcon(c, id) {
    const S = c.width; const x = c.getContext('2d'); const bk = iconFor(id); const def = BLOCKS[id];
    x.clearRect(0, 0, S, S);
    const k = (S * 0.84) / ((def.size || 1) * bk.px); const off = (S - (def.size || 1) * bk.px * k) / 2;
    x.drawImage(bk.hull, off - bk.pad * k, off - bk.pad * k, bk.hull.width * k, bk.hull.height * k);
    if (def.weapon) { x.save(); x.translate(S / 2, S / 2); drawTurret(x, def.weapon, S * 0.84, 0, 0, pal, null); x.restore(); }
  }
  function tile({ key, id, label, sub, count, rarity, off, why, onPick, tipHTML, selected }) {
    const c = el('canvas', { width: 36, height: 36, class: 'bm-ico' });
    drawIcon(c, id);
    const t = el('button', { class: 'bm-tile' + (off ? ' off' : '') + (selected ? ' on' : ''), 'data-key': key },
      c, el('span', { class: 'bm-tl' }, el('b', { class: rarity ? 'rar-' + rarity : '' }, label), el('small', {}, sub)),
      count != null ? el('i', { class: 'bm-cnt' }, '×' + count) : null);
    t.addEventListener('click', e => { e.stopPropagation(); hideTip(); onPick(); });
    t.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showTip(tipHTML() + (why ? `<div class="bad">${why}</div>` : ''), e); });
    t.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') moveTip(e); });
    t.addEventListener('pointerleave', hideTip);
    return t;
  }
  function renderList() {
    const T = TABS.find(t => t.id === tab);
    listEl.innerHTML = '';
    const rows = [];
    // structure built from materials
    const structs = Object.values(BLOCKS).filter(d => !d.module && !d.nature && T.cats.includes(d.cat) && (d.size || 1) <= maxB);
    for (const d of structs) {
      const miss = missingFor(d); const sp = spare[d.id] || 0;
      rows.push(tile({
        key: 's:' + d.id, id: d.id, label: d.name, sub: sp ? `${sp} spare — free` : costText(d), off: !!miss, why: miss ? `Not enough: ${miss.join(', ')}` : '',
        selected: sel?.kind === 'struct' && sel.id === d.id, onPick: () => select(sel?.kind === 'struct' && sel.id === d.id ? null : { kind: 'struct', id: d.id }),
        tipHTML: () => structTip(d),
      }));
    }
    // owned modules, grouped
    const groups = new Map();
    for (const it of parts) { const d = BLOCKS[it.block]; if (!d || !T.cats.includes(d.cat)) continue; const k = itemKey(it); if (!groups.has(k)) groups.set(k, { it, n: 0 }); groups.get(k).n++; }
    const sorted = [...groups.entries()].sort((a, b) => (BLOCKS[a[1].it.block].size - BLOCKS[b[1].it.block].size) || a[1].it.block.localeCompare(b[1].it.block) || (RARITY_BY_ID[b[1].it.rarity]?.index || 0) - (RARITY_BY_ID[a[1].it.rarity]?.index || 0));
    for (const [k, { it, n }] of sorted) {
      const d = BLOCKS[it.block]; const big = (d.size || 1) > maxB;
      rows.push(tile({
        key: 'i:' + k, id: it.block, label: it.name, rarity: it.rarity, count: n, sub: `${d.size}×${d.size} · ${RARITY_BY_ID[it.rarity]?.name || ''}${big ? ' · needs a bigger hull' : ''}`,
        off: big, why: big ? `${C.name} hulls fit parts up to ${maxB}×${maxB}.` : '', selected: sel?.kind === 'item' && sel.key === k,
        onPick: () => { if (big) { say(`Too big for a ${C.name}. Bigger hulls take ${d.size}×${d.size} parts.`, 'bad'); return; } select(sel?.kind === 'item' && sel.key === k ? null : { kind: 'item', key: k, id: it.block }); },
        tipHTML: () => itemTipHTML(it),
      }));
    }
    if (!rows.length) listEl.append(el('p', { class: 'hint bm-empty' }, T.cats.includes('weapon') || !structs.length ? 'No parts of this kind in your hold. Outfitters sell them, and wrecks drop them.' : 'Nothing here fits this hull.'));
    listEl.append(...rows);
  }
  function structTip(d) {
    return itemTipHTML(d.id) + `<div class="bm-tipcost">Costs ${esc(costText(d))}${(spare[d.id] || 0) ? ` — ${spare[d.id]} spare (free)` : ''}. Removing it later gives back half the materials.</div>`;
  }
  function showInfo() {
    infoEl.innerHTML = '';
    const d = selDef();
    if (!d) { infoEl.append(el('p', { class: 'hint' }, tool === 'erase' ? 'Erase: tap or drag over parts to remove them.' : TOUCH ? 'Pick a part, then tap the grid. Drag to paint hull. Two fingers move and zoom.' : 'Pick a part, then click the grid (drag to paint hull). Right-click removes, R turns, wheel zooms.')); return; }
    const it = sel.kind === 'item' ? parts.find(x => itemKey(x) === sel.key) : null;
    const ws = d.weapon ? ALL_WEAPONS[d.weapon] : null;
    const line = el('div', { class: 'bm-sel' },
      el('b', { class: it ? 'rar-' + it.rarity : '' }, it ? it.name : d.name),
      el('span', { class: 'hint' }, ws ? ` ${DAMAGE[ws.type].name} · range ${fmt(ws.range)} · arc ${ws.arc}° · facing ${facingWord(rot)}` : d.module ? '' : ` ${costText(d)}`),
      el('div', { class: 'grow' }),
      btn('ⓘ', () => modal(it ? it.name : d.name, (m, close) => { m.append(itemCard(it || d.id, { compact: false }), d.module ? '' : el('p', { class: 'hint' }, `Costs ${costText(d)}.`), btn('Close', close, 'primary')); }), 'small'),
      btn('✕', () => select(null), 'small'));
    infoEl.append(line);
  }
  function showTip(html, e) { hideTip(); tipEl = el('div', { class: 'tip', html }); document.body.append(tipEl); moveTip(e); }
  function moveTip(e) { if (!tipEl) return; const x = Math.min(innerWidth - tipEl.offsetWidth - 8, e.clientX + 14), y = Math.min(innerHeight - tipEl.offsetHeight - 8, e.clientY + 14); tipEl.style.left = Math.max(4, x) + 'px'; tipEl.style.top = Math.max(4, y) + 'px'; }
  function hideTip() { tipEl?.remove(); tipEl = null; }

  // ---------------------------------------------------------------- stats panel
  function renderStats() {
    const st = body.stats; const now = statSummary(); const s0 = startStats;
    const delta = (a, b, dp = 0) => { const d = a - b; if (Math.abs(d) < (dp ? 0.05 : 0.5)) return ''; return `<small class="${d > 0 ? 'good' : 'bad'}"> ${d > 0 ? '+' : ''}${dp ? d.toFixed(dp) : fmt(d)}</small>`; };
    const row = (k, v, cls = '') => `<span>${k}</span><span class="${cls}">${v}</span>`;
    const have = Math.min(G.ship.crew ?? 0, st.crewCap);
    const arm = armourAverages();
    const dmgRows = DAMAGE_IDS.filter(k => now.byType[k]).map(k => row(`<i class="bm-dot" style="background:${DAMAGE[k].color}"></i>${DAMAGE[k].name}`, fmt(now.byType[k]))).join('');
    const resRows = DAMAGE_IDS.map(k => { const v = arm[k]; return row(`<i class="bm-dot" style="background:${DAMAGE[k].color}"></i>${DAMAGE[k].name}`, `${v >= 0 ? '' : '−'}${Math.abs(Math.round(v * 100))}%`, v < 0 ? 'bad' : v >= 0.2 ? 'good' : ''); }).join('');
    const worst = DAMAGE_IDS.reduce((a, k) => arm[k] < arm[a] ? k : a, DAMAGE_IDS[0]);
    const best = DAMAGE_IDS.reduce((a, k) => arm[k] > arm[a] ? k : a, DAMAGE_IDS[0]);
    let hint = '';
    if (arm[worst] < 0) hint = `Weak to ${DAMAGE[worst].name.toLowerCase()}.`;
    else if (arm[worst] < 0.08) hint = `Little protection from ${DAMAGE[worst].name.toLowerCase()}.`;
    if (arm[best] >= 0.2) hint += ` Strong against ${DAMAGE[best].name.toLowerCase()}.`;
    if (!hint) hint = 'Even protection, nothing special.';
    const cpuBad = st.cpu > st.cpuCap, powBad = !st.powerOk, crewBad = st.crewNeed > have;
    const shieldN = body.shields.length;
    const matLines = Object.entries(led.mats).filter(([, v]) => v).map(([m, v]) => `<span class="${v > 0 ? 'bad' : 'good'}">${v > 0 ? '−' : '+'}${Math.abs(v)} ${esc(matName(m))}</span>`);
    const spares = Object.entries(spare).filter(([, v]) => v > 0);
    const spareMats = {};
    for (const [id, n] of spares) for (const [m, v] of Object.entries(BLOCKS[id].cost?.mats || {})) spareMats[m] = (spareMats[m] || 0) + Math.floor(v * n / 2);
    const cov = coverage(); const open = cov.filter(v => !v).length;
    statsEl.innerHTML = `
      <h3>${esc(C.name)} <small class="hint">grid ${W}×${H} · parts up to ${maxB}×${maxB}</small></h3>
      <div class="kv">
        ${row('Blocks', `${now.blocks}${grid.blocks.some(b => !b.alive) ? ` <small class="bad">(${grid.blocks.filter(b => !b.alive).length} broken)</small>` : ''}`)}
        ${row('Mass', fmt(now.mass) + delta(now.mass, s0.mass))}
        ${row('Top speed', fmt(now.speed) + delta(now.speed, s0.speed))}
        ${row('Turning', `${Math.round(now.turn)}°/s` + delta(now.turn, s0.turn))}
        ${row('Hull', fmt(now.hp) + ' / ' + fmt(now.maxHp) + delta(now.maxHp, s0.maxHp))}
        ${row('Shields', shieldN ? fmt(now.shield) + ` <small class="hint">(${body.shields.map(s => s.kind === 'arc' ? 'deflector' : 'bubble').join(', ')})</small>` + delta(now.shield, s0.shield) : '<span class="meh">none</span>')}
        ${row('Cargo room', fmt(st.cargo))}
        ${row('Drones', st.droneCap ? String(st.droneCap) : '<span class="meh">none</span>')}
      </div>
      <h4>Firepower</h4>
      <div class="kv">${row('Damage / sec', fmt(now.dps) + delta(now.dps, s0.dps))}${dmgRows}</div>
      ${st.efficiency < 0.999 && now.dps ? `<p class="bad small">Running at ${Math.round(st.efficiency * 100)}% (short of ${powBad ? 'power' : 'crew'}): about ${fmt(now.dps * st.efficiency)} / sec.</p>` : ''}
      <p class="hint small">Ring around the ship: <b class="good">green</b> = several guns can shoot that way, <b class="amber">yellow</b> = one, <b class="bad">red</b> = none.${open ? ` <b class="bad">${Math.round(open / cov.length * 100)}% of directions are open.</b>` : ''}</p>
      <h4>Armour (average)</h4>
      <div class="kv">${resRows}</div>
      <p class="small">${esc(hint.trim())}</p>
      <h4>Budget</h4>
      <div class="kv">
        ${row('CPU', `${st.cpu} / ${st.cpuCap}`, cpuBad ? 'bad' : '')}
        ${row('Power', `${Math.round(st.power)} made / ${Math.round(st.powerUse)} used`, powBad ? 'bad' : '')}
        ${row('Crew', `${have} aboard / ${st.crewNeed} needed <small class="hint">(${st.crewCap} bunks)</small>`, crewBad ? 'bad' : '')}
      </div>
      ${cpuBad ? '<p class="bad small">Over the CPU limit — you cannot finish until it fits.</p>' : ''}
      ${powBad ? '<p class="bad small">Not enough power: weapons fire slower.</p>' : ''}
      ${crewBad ? '<p class="bad small">Not enough crew: parts run slower.</p>' : ''}
      <h4>Cost of changes</h4>
      <div class="bm-costs">${led.cr ? `<span class="${led.cr > 0 ? 'bad' : 'good'}">${led.cr > 0 ? '−' : '+'}${fmt(Math.abs(led.cr))} cr</span>` : ''}${matLines.join('')}${!led.cr && !matLines.length ? '<span class="meh">nothing yet</span>' : ''}</div>
      ${spares.length ? `<p class="hint small">Removed hull you have not reused gives back half its materials when you press Done: ${Object.entries(spareMats).filter(([, v]) => v).map(([m, v]) => `+${v} ${esc(matName(m))}`).join(', ') || 'nothing'}.</p>` : ''}
      <p class="hint small">You have ${fmt(crLeft())} cr${Object.keys(G.cargo).length ? ', ' + Object.keys(G.cargo).filter(m => matLeft(m) > 0).map(m => `${fmt(matLeft(m))} ${esc(matName(m))}`).join(', ') : ''}.</p>`;
    // header summary
    const bits = [];
    if (led.cr) bits.push(`${led.cr > 0 ? '−' : '+'}${fmt(Math.abs(led.cr))} cr`);
    for (const [m, v] of Object.entries(led.mats)) if (v) bits.push(`${v > 0 ? '−' : '+'}${Math.abs(v)} ${matName(m)}`);
    costEl.textContent = bits.length ? bits.join(' · ') : '';
    // problems strip
    const pr = problems();
    warnEl.innerHTML = '';
    if (pr.length) {
      const top = pr.find(p => p.stop) || pr[0];
      warnEl.append(el('div', { class: top.stop ? 'bad' : 'amber' }, (top.stop ? '⚠ ' : '') + top.msg, pr.length > 1 ? el('small', {}, `  (+${pr.length - 1} more — see Stats)`) : ''));
    }
    bDone.classList.toggle('blocked', pr.some(p => p.stop));
  }

  // ---------------------------------------------------------------- drawing
  let bake = null, animating = false;
  const ctx = cv.getContext('2d');
  function resize() {
    const r = cv.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
    if (!r.width || !r.height) return;
    const first = !V.cw;
    V.cw = r.width; V.ch = r.height; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (first) fit();
    dirty.draw = true;
  }
  function fit() {
    const m = Math.min(70, Math.min(V.cw, V.ch) * 0.12);
    V.scale = clamp(Math.min((V.cw - m * 2) / W, (V.ch - m * 2 - 40) / H), 3, 60);
    V.ox = (V.cw - W * V.scale) / 2; V.oy = (V.ch - H * V.scale) / 2 - 10;
    dirty.draw = true;
  }
  function zoomBy(k, px = V.cw / 2, py = V.ch / 2) {
    const s2 = clamp(V.scale * k, 3, 80); const kk = s2 / V.scale;
    V.ox = px - (px - V.ox) * kk; V.oy = py - (py - V.oy) * kk; V.scale = s2; dirty.draw = true;
  }
  const toScr = (cx, cy) => [V.ox + cx * V.scale, V.oy + cy * V.scale];

  function wedge(cx, cy, centre, arcDeg, R, color, alpha, lineAlpha = 0.9) {
    ctx.save();
    ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath();
    if (arcDeg >= 360) {
      ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.globalAlpha = alpha * 0.5; ctx.fill();
      ctx.globalAlpha = lineAlpha * 0.7; ctx.setLineDash([4, 6]); ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore(); return;
    }
    else { const h = arcDeg * DEG / 2; ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, centre - h, centre + h); ctx.closePath(); }
    ctx.fill();
    ctx.globalAlpha = lineAlpha; ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  function draw() {
    const S = V.scale; const t = (performance.now() - t0) / 1000;
    ctx.clearRect(0, 0, V.cw, V.ch);
    ctx.fillStyle = '#04060d'; ctx.fillRect(0, 0, V.cw, V.ch);
    // build area
    const [gx, gy] = toScr(0, 0);
    ctx.fillStyle = '#0b1224'; ctx.fillRect(gx, gy, W * S, H * S);
    if (S >= 5) {
      ctx.strokeStyle = 'rgba(80,110,170,0.16)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= W; i++) { const x = Math.round(gx + i * S) + 0.5; ctx.moveTo(x, gy); ctx.lineTo(x, gy + H * S); }
      for (let j = 0; j <= H; j++) { const y = Math.round(gy + j * S) + 0.5; ctx.moveTo(gx, y); ctx.lineTo(gx + W * S, y); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(95,216,255,0.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(gx, gy, W * S, H * S);
    // mirror line
    if (mirror) {
      const y = gy + axis * S; ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,196,90,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(gx - 10, y); ctx.lineTo(gx + W * S + 10, y); ctx.stroke(); ctx.restore();
    }
    // ship centre and ring
    const [scx, scy] = body.stats.blocks ? toScr(body.ox, body.oy) : toScr(W / 2, H / 2);
    const R = (Math.max(W, H) * 0.5 + 0.9) * S;
    const cov = coverage(); const N = cov.length; const ringW = clamp(S * 0.55, 6, 14);
    for (let i = 0; i < N; i++) {
      const v = cov[i]; const a0 = i * Math.PI * 2 / N, a1 = (i + 1) * Math.PI * 2 / N;
      ctx.strokeStyle = v === 0 ? 'rgba(255,70,90,0.85)' : v === 1 ? 'rgba(255,196,90,0.8)' : v === 2 ? 'rgba(170,240,110,0.8)' : 'rgba(95,255,154,0.85)';
      ctx.lineWidth = ringW; ctx.beginPath(); ctx.arc(scx, scy, R, a0 + 0.006, a1 - 0.006); ctx.stroke();
    }
    // front / back labels on the ring
    const label = (txt, x, y, col) => {
      ctx.font = '700 13px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(txt).width + 12;
      x = clamp(x, w / 2 + 2, V.cw - w / 2 - 2);
      ctx.fillStyle = 'rgba(4,6,13,0.85)'; ctx.fillRect(x - w / 2, y - 10, w, 20); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2 + 0.5, y - 9.5, w - 1, 19);
      ctx.fillStyle = col; ctx.fillText(txt, x, y);
    };
    // the ship
    if (dirty.bake || !bake) {
      bake = body.stats.blocks || grid.blocks.length ? bakeBody({ grid, team: 'player', faction: 'player', palette: pal, kind: 'ship', id: 7, seed: 7 }) : null;
      dirty.bake = false;
    }
    if (bake) {
      const k = S / bake.px;
      ctx.imageSmoothingEnabled = k < 2.2;
      ctx.drawImage(bake.hull, gx - bake.pad * k, gy - bake.pad * k, bake.hull.width * k, bake.hull.height * k);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55;
      ctx.imageSmoothingEnabled = true; ctx.drawImage(bake.glow, gx - bake.pad * k, gy - bake.pad * k, bake.glow.width * k, bake.glow.height * k); ctx.restore();
    }
    // turrets on top
    for (const b of grid.blocks) {
      if (!b.alive || !b.def.weapon) continue; const n = b.def.size || 1;
      const [x, y] = toScr(b.x + n / 2, b.y + n / 2);
      ctx.save(); ctx.translate(x, y); ctx.rotate(b.rot * Math.PI / 4); drawTurret(ctx, b.def.weapon, n * S, 0, t, pal, null); ctx.restore();
    }
    // broken blocks
    for (const b of grid.blocks) {
      if (b.alive) continue; const n = b.def.size || 1; const [x, y] = toScr(b.x, b.y);
      ctx.strokeStyle = 'rgba(255,90,106,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.strokeRect(x + 1, y + 1, n * S - 2, n * S - 2); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + n * S - 3, y + n * S - 3); ctx.moveTo(x + n * S - 3, y + 3); ctx.lineTo(x + 3, y + n * S - 3); ctx.stroke();
    }
    // loose blocks
    const loose = disconnected(); animating = loose.size > 0;
    for (const b of loose) {
      const n = b.def.size || 1; const [x, y] = toScr(b.x, b.y);
      ctx.fillStyle = `rgba(255,50,70,${0.35 + 0.15 * Math.sin(t * 5)})`; ctx.fillRect(x, y, n * S, n * S);
      ctx.strokeStyle = '#ff5a6a'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, n * S - 2, n * S - 2);
    }
    // arcs
    let maxRange = 600;
    for (const b of grid.blocks) if (b.alive && b.def.weapon) maxRange = Math.max(maxRange, wStat(b, 'range'));
    const sd = selDef(); if (sd?.weapon) maxRange = Math.max(maxRange, ALL_WEAPONS[sd.weapon].range);
    const arcR = range => Math.max(S * 1.5, (range / maxRange) * R * 0.92);
    const hovE = hover && !sd ? entryAt(Math.floor(hover.fx), Math.floor(hover.fy)) : padCur && !sd ? entryAt(padCur.x, padCur.y) : null;
    for (const b of grid.blocks) {
      if (!b.alive) continue; const n = b.def.size || 1; const [x, y] = toScr(b.x + n / 2, b.y + n / 2);
      const isHov = hovE && hovE.b === b;
      if (b.def.weapon && (arcsAll || isHov)) {
        const w = ALL_WEAPONS[b.def.weapon];
        wedge(x, y, b.rot * Math.PI / 4, w.arc, arcR(wStat(b, 'range')), DAMAGE[w.type].color, isHov ? 0.22 : 0.05, isHov ? 0.95 : 0.28);
      }
      if (b.def.shield?.kind === 'arc' && (arcsAll || isHov)) {
        const h = b.def.shield.arc * DEG / 2, c = b.rot * Math.PI / 4;
        ctx.save(); ctx.strokeStyle = 'rgba(127,208,255,0.85)'; ctx.lineWidth = Math.max(4, S * 0.35); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(scx, scy, R - ringW * 1.6, c - h, c + h); ctx.stroke(); ctx.restore();
        wedge(x, y, c, b.def.shield.arc, R * 0.5, '#7fd0ff', isHov ? 0.18 : 0.05, 0.3);
      }
    }
    label('Front →', scx + R, scy, '#5fd8ff');
    label('Back', scx - R, scy, '#8c9ab4');
    if (hovE) { const n = BLOCKS[hovE.id].size || 1; const [x, y] = toScr(hovE.x, hovE.y); ctx.strokeStyle = tool === 'erase' ? '#ff5a6a' : '#ffc45a'; ctx.lineWidth = 2; ctx.strokeRect(x, y, n * S, n * S); }
    // ghost
    const g = cursorCell();
    if (g && tool === 'place' && sd) {
      const p = ghostAt(g.fx, g.fy, sd);
      drawGhost(sd, p.x, p.y, rot, maxRange, arcR, true);
      if (mirror) { const my = mirrorY(p.y, p.n); if (my !== p.y && my >= 0 && my + p.n <= H) drawGhost(sd, p.x, my, (8 - rot) & 7, maxRange, arcR, false); }
    } else if (g && tool === 'erase') {
      const [x, y] = toScr(Math.floor(g.fx), Math.floor(g.fy)); ctx.strokeStyle = '#ff5a6a'; ctx.lineWidth = 2; ctx.strokeRect(x, y, S, S);
      ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + S - 4, y + S - 4); ctx.moveTo(x + S - 4, y + 4); ctx.lineTo(x + 4, y + S - 4); ctx.stroke();
    }
    if (padCur) { const [x, y] = toScr(padCur.x, padCur.y); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(x - 2, y - 2, S + 4, S + 4); ctx.setLineDash([]); }
    dirty.draw = false;
  }
  function drawGhost(def, x, y, r, maxRange, arcR, primary) {
    const S = V.scale; const n = def.size || 1; const [px, py] = toScr(x, y);
    let item = null; if (def.module) item = sel?.kind === 'item' ? parts.find(it => itemKey(it) === sel.key) : null;
    const ok = !blockReason(def, x, y, def.module ? item || true : null);
    ctx.save(); ctx.globalAlpha = primary ? 0.75 : 0.45;
    ctx.fillStyle = ok ? (CAT_COLOR[def.cat] || '#8fb') : '#3a0810';
    ctx.fillRect(px + 1, py + 1, n * S - 2, n * S - 2);
    ctx.globalAlpha = 1; ctx.strokeStyle = ok ? '#5fff9a' : '#ff3048'; ctx.lineWidth = 2.5; ctx.strokeRect(px, py, n * S, n * S);
    if (!ok) { ctx.beginPath(); ctx.moveTo(px + 3, py + 3); ctx.lineTo(px + n * S - 3, py + n * S - 3); ctx.moveTo(px + n * S - 3, py + 3); ctx.lineTo(px + 3, py + n * S - 3); ctx.stroke(); }
    const cx = px + n * S / 2, cy = py + n * S / 2;
    if (def.weapon) {
      const w = ALL_WEAPONS[def.weapon];
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(r * Math.PI / 4); drawTurret(ctx, def.weapon, n * S, 0, 0, pal, null); ctx.restore();
      ctx.restore();
      wedge(cx, cy, r * Math.PI / 4, w.arc, arcR(w.range * (1 + (item?.mods?.range || 0))), DAMAGE[w.type].color, 0.2, 1);
      return;
    }
    if (def.rot) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(r * Math.PI / 4) * n * S * 0.6, cy + Math.sin(r * Math.PI / 4) * n * S * 0.6); ctx.stroke(); }
    ctx.restore();
    if (def.shield?.kind === 'arc') wedge(cx, cy, r * Math.PI / 4, def.shield.arc, (Math.max(W, H) * 0.5) * V.scale * 0.5, '#7fd0ff', 0.2, 1);
  }
  function cursorCell() {
    if (padCur) return { fx: padCur.x + 0.5 + ((selDef()?.size || 1) - 1) / 2, fy: padCur.y + 0.5 + ((selDef()?.size || 1) - 1) / 2 };
    return hover;
  }
  function showHover() {
    const g = cursorCell(); const e = g ? entryAt(Math.floor(g.fx), Math.floor(g.fy)) : null;
    if (!e || (tool === 'place' && selDef())) { hoverEl.classList.add('hidden'); return; }
    const d = BLOCKS[e.id]; const b = e.b;
    const hp = b ? (e.alive ? `${fmt(b.hp)} / ${fmt(b.maxHp)} hp` : 'broken') : '';
    let extra = '';
    if (d.weapon && b) { const w = ALL_WEAPONS[d.weapon]; extra = ` · ${DAMAGE[w.type].name} · ${fmt(blockDps(b))}/s · faces ${facingWord(e.rot)}`; }
    else if (d.shield?.kind === 'arc') extra = ` · faces ${facingWord(e.rot)}`;
    hoverEl.innerHTML = `<b class="${e.item ? 'rar-' + e.item.rarity : ''}">${esc(e.item?.name || d.name)}</b> <span class="hint">${hp}${extra}</span>`;
    hoverEl.classList.remove('hidden');
  }

  // ---------------------------------------------------------------- pointer input
  const ptrs = new Map(); let gesture = null; // { kind: 'paint'|'pan'|'pinch'|'pending'|'rpending', ... }
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const fcell = (px, py) => ({ fx: (px - V.ox) / V.scale, fy: (py - V.oy) / V.scale });
  function inGrid(px, py) { const { fx, fy } = fcell(px, py); return fx >= 0 && fy >= 0 && fx < W && fy < H; }
  function primaryAction(px, py, quiet, stroke) {
    const { fx, fy } = fcell(px, py); const cx = Math.floor(fx), cy = Math.floor(fy);
    if (tool === 'erase') return tryErase(cx, cy, quiet);
    if (tool === 'place') {
      const d = selDef();
      if (!d) { if (!stroke && !turnPlaced(cx, cy) && !quiet) { const e = entryAt(cx, cy); if (!e) say('Pick a part from the list first.'); } return false; }
      const p = ghostAt(fx, fy, d);
      if (stroke && stroke.last && stroke.last.x === p.x && stroke.last.y === p.y) return false;
      if (stroke) stroke.last = p;
      return tryPlace(p.x, p.y, quiet);
    }
    return false;
  }
  const canPaint = () => tool === 'erase' || (tool === 'place' && selDef() && !selDef().module);
  function paintLine(g, px, py) {
    // walk from the last point so fast drags leave no gaps
    const [lx, ly] = g.lastPx; const dist = Math.hypot(px - lx, py - ly); const steps = Math.max(1, Math.ceil(dist / (V.scale * 0.5)));
    for (let i = 1; i <= steps; i++) primaryAction(lx + (px - lx) * i / steps, ly + (py - ly) * i / steps, true, g);
    g.lastPx = [px, py];
  }
  cv.addEventListener('pointerdown', e => {
    e.preventDefault(); cv.setPointerCapture(e.pointerId); hideTip(); padCur = null;
    const [px, py] = local(e); ptrs.set(e.pointerId, { x: px, y: py, x0: px, y0: py, type: e.pointerType });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), s0: V.scale, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (ptrs.size > 2) return;
    if (e.pointerType === 'mouse') {
      if (e.button === 1 || tool === 'move' && e.button === 0) { gesture = { kind: 'pan', lx: px, ly: py }; return; }
      if (e.button === 2) { gesture = { kind: 'rpending', x0: px, y0: py, lx: px, ly: py }; return; }
      if (e.button !== 0) return;
      beginAction();
      if (canPaint()) { gesture = { kind: 'paint', lastPx: [px, py] }; primaryAction(px, py, false, gesture); }
      else { primaryAction(px, py, false, null); gesture = null; }
      return;
    }
    // touch / pen: decide on move or release
    gesture = { kind: 'pending', x0: px, y0: py, lx: px, ly: py, onGrid: inGrid(px, py) };
  });
  cv.addEventListener('pointermove', e => {
    const [px, py] = local(e); const p = ptrs.get(e.pointerId);
    if (e.pointerType === 'mouse') { hover = fcell(px, py); padCur = null; dirty.draw = true; showHover(); }
    if (!p) return;
    p.x = px; p.y = py;
    if (!gesture) return;
    if (gesture.kind === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      V.ox += mx - gesture.mx; V.oy += my - gesture.my; gesture.mx = mx; gesture.my = my;
      zoomBy((gesture.s0 * d / Math.max(10, gesture.d0)) / V.scale, mx, my);
      return;
    }
    if (gesture.kind === 'pan') { V.ox += px - gesture.lx; V.oy += py - gesture.ly; gesture.lx = px; gesture.ly = py; dirty.draw = true; return; }
    if (gesture.kind === 'paint') { paintLine(gesture, px, py); return; }
    if (gesture.kind === 'rpending' || gesture.kind === 'pending') {
      if (Math.hypot(px - gesture.x0, py - gesture.y0) > 8) {
        if (gesture.kind === 'pending' && gesture.onGrid && canPaint() && tool !== 'move') {
          beginAction(); const g = { kind: 'paint', lastPx: [gesture.x0, gesture.y0] }; primaryAction(gesture.x0, gesture.y0, true, g); gesture = g; paintLine(g, px, py);
        } else gesture = { kind: 'pan', lx: px, ly: py };
      }
    }
  });
  const endPtr = e => {
    const [px, py] = local(e); ptrs.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.kind === 'pinch') { if (ptrs.size === 1) { const [q] = [...ptrs.values()]; gesture = { kind: 'pan', lx: q.x, ly: q.y }; } else if (!ptrs.size) gesture = null; return; }
    if (ptrs.size) return;
    if (gesture.kind === 'rpending') { beginAction(); const { fx, fy } = fcell(px, py); tryErase(Math.floor(fx), Math.floor(fy)); }
    else if (gesture.kind === 'pending' && e.type === 'pointerup') { if (tool !== 'move') { beginAction(); primaryAction(px, py, false, null); hover = fcell(px, py); dirty.draw = true; } }
    pendingSnap = null; gesture = null;
  };
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hover = null; dirty.draw = true; hoverEl.classList.add('hidden'); } });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.shiftKey) { rotate(e.deltaY > 0 ? 1 : -1); return; }
    const [px, py] = local(e); zoomBy(e.deltaY > 0 ? 1 / 1.15 : 1.15, px, py);
  }, { passive: false });

  // ---------------------------------------------------------------- keyboard (captured so flight keys don't fire)
  function onKey(e) {
    if (e.target.closest?.('input, textarea, select')) return;
    if (document.querySelector('#panels').lastElementChild !== root) return;   // a box is open on top: let the game close it
    e.stopPropagation();
    const k = e.code;
    if ((e.ctrlKey || e.metaKey) && k === 'KeyZ') { e.preventDefault(); undo(); return; }
    if (k === 'Escape') { e.preventDefault(); if (sel) select(null); else if (tool !== 'place') setTool('place'); else cancel(); return; }
    if (k === 'KeyR') { rotate(e.shiftKey ? -1 : 1); return; }
    if (k === 'KeyM') { tools.mirror.click(); return; }
    if (k === 'KeyG') { tools.arcs.click(); return; }
    if (k === 'KeyE' || k === 'Delete' || k === 'KeyX') { setTool(tool === 'erase' ? 'place' : 'erase'); showInfo(); return; }
    if (k === 'KeyB') { done(); return; }
    if (k === 'Equal' || k === 'NumpadAdd') { zoomBy(1.2); return; }
    if (k === 'Minus' || k === 'NumpadSubtract') { zoomBy(1 / 1.2); return; }
    if (k === 'KeyF') { fit(); return; }
    const pan = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [1, 0], ArrowLeft: [1, 0], KeyD: [-1, 0], ArrowRight: [-1, 0] }[k];
    if (pan) { e.preventDefault(); V.ox += pan[0] * 60; V.oy += pan[1] * 60; dirty.draw = true; return; }
    const n = +e.key; if (n >= 1 && n <= TABS.length) { tab = TABS[n - 1].id; dirty.palette = true; }
  }
  addEventListener('keydown', onKey, true);

  // ---------------------------------------------------------------- controller
  const padPrev = new Set(); let padRep = 0;
  function pollPad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find(x => x && x.connected); if (!p) return;
    if (!editorOnTop()) { padPrev.clear(); for (let i = 0; i < p.buttons.length; i++) if (p.buttons[i]?.pressed) padPrev.add('b' + i); return; }
    const pr = i => !!p.buttons[i]?.pressed;
    const edge = i => { const k = 'b' + i; if (pr(i)) { if (!padPrev.has(k)) { padPrev.add(k); return true; } } else padPrev.delete(k); return false; };
    const ax = Math.abs(p.axes[0] || 0) > 0.5 ? Math.sign(p.axes[0]) : 0, ay = Math.abs(p.axes[1] || 0) > 0.5 ? Math.sign(p.axes[1]) : 0;
    let dx = (pr(15) ? 1 : 0) - (pr(14) ? 1 : 0) || ax, dy = (pr(13) ? 1 : 0) - (pr(12) ? 1 : 0) || ay;
    const any = dx || dy || p.buttons.some(b => b.pressed);
    if (any && !padCur) { padCur = { x: Math.floor(W / 2), y: Math.floor(H / 2) }; hover = null; dirty.draw = true; }
    if (!padCur) return;
    padRep -= dt;
    if ((dx || dy) && padRep <= 0) { padCur.x = clamp(padCur.x + dx, 0, W - 1); padCur.y = clamp(padCur.y + dy, 0, H - 1); padRep = padRep < -0.05 ? 0.22 : 0.09; dirty.draw = true; showHover(); }
    if (!dx && !dy) padRep = -1;
    const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
    if (Math.abs(rx) > 0.2 || Math.abs(ry) > 0.2) { V.ox -= rx * 500 * dt; V.oy -= ry * 500 * dt; dirty.draw = true; }
    const g = cursorCell();
    if (edge(0)) { beginAction(); primaryAction(V.ox + g.fx * V.scale, V.oy + g.fy * V.scale, false, null); pendingSnap = null; }
    if (edge(1)) { beginAction(); tryErase(padCur.x, padCur.y); pendingSnap = null; }
    if (edge(2)) tools.mirror.click();
    if (edge(3)) rotate(1);
    if (edge(4) || edge(5)) { const i = TABS.findIndex(t => t.id === tab); tab = TABS[(i + (pr(5) ? 1 : -1) + TABS.length) % TABS.length].id; dirty.palette = true; }
    if (edge(6) || edge(7)) {
      const tiles = [...listEl.querySelectorAll('.bm-tile:not(.off)')]; if (tiles.length) {
        const cur = tiles.findIndex(t => t.classList.contains('on')); const nx = tiles[(cur + (pr(7) ? 1 : -1) + tiles.length) % tiles.length];
        nx.click(); nx.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }

  // ---------------------------------------------------------------- loop
  let raf = 0, lastT = performance.now(), statT = 0;
  const ro = new ResizeObserver(resize); ro.observe(cv);
  function loop(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    try {
      pollPad(dt);
      if (dirty.palette) { dirty.palette = false; renderTabs(); renderList(); showInfo(); }
      statT -= dt;
      if (dirty.stats && statT <= 0) { dirty.stats = false; statT = 0.08; renderStats(); }
      // turrets idle-animate slowly; redraw at most ~30 fps when nothing changes
      if (dirty.draw || dirty.bake || animating) draw();
    } catch (err) { console.error(err); }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  refreshTools(); showInfo();
  if (innerWidth > 760) root.classList.add('bm-show-stats');
  bStats.classList.toggle('on', root.classList.contains('bm-show-stats'));
  say(docked ? 'Build mode. Changes are free to try — nothing is charged until you press Done.' : 'Build mode (the world is paused). Nothing is charged until you press Done.');

  // ---------------------------------------------------------------- designs
  function cropped(withState) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const e of entries) { const n = BLOCKS[e.id].size || 1; x0 = Math.min(x0, e.x); y0 = Math.min(y0, e.y); x1 = Math.max(x1, e.x + n); y1 = Math.max(y1, e.y + n); }
    if (!entries.length) return { w: 1, h: 1, b: [] };
    return {
      w: x1 - x0, h: y1 - y0,
      b: entries.map(e => withState
        ? [e.id, e.x - x0, e.y - y0, e.rot, e.alive ? Math.round(e.b?.hp ?? e.hp ?? BLOCKS[e.id].hp) : 0, e.item || 0]
        : [e.id, e.x - x0, e.y - y0, e.rot]),
    };
  }
  function designsModal() {
    modal('Saved designs', (m, close) => {
      const name = el('input', { type: 'text', value: `${G.ship.name || 'Ship'} ${G.designs.length + 1}`, maxlength: 40, style: 'flex:1;min-width:0' });
      m.append(el('p', { class: 'hint' }, 'Save this layout to rebuild it later. Loading only places the parts you own and can afford, and tells you what is missing.'),
        el('div', { class: 'row' }, name, btn('Save', () => {
          if (!entries.length) return;
          const n = name.value.trim() || 'Design';
          const old = G.designs.findIndex(d => d.name === n && d.cls === cls);
          const d = { name: n, cls, grid: cropped(false) };
          if (old >= 0) G.designs[old] = d; else G.designs.push(d);
          app.save(); close(); say(`Saved "${n}".`, 'good');
        }, 'primary')));
      const list = el('div', { class: 'col bm-dlist' });
      if (!G.designs.length) list.append(el('p', { class: 'hint' }, 'No saved designs yet.'));
      G.designs.forEach((d, i) => {
        const fits = d.grid.w <= W && d.grid.h <= H && d.grid.b.every(([id]) => (BLOCKS[id]?.size || 1) <= maxB);
        list.append(el('div', { class: 'row bm-drow' },
          el('div', { class: 'grow' }, el('b', {}, d.name), el('div', { class: 'hint' }, `${CLASSES[d.cls]?.name || d.cls} · ${d.grid.b.length} blocks${fits ? '' : ' · too big for this hull'}`)),
          btn('Load', () => { close(); loadDesign(d); }, fits ? '' : 'off'),
          btn('Delete', () => { G.designs.splice(i, 1); app.save(); close(); designsModal(); }, 'danger small')));
      });
      m.append(list, btn('Close', close));
    });
  }
  function loadDesign(d) {
    const fits = d.grid.w <= W && d.grid.h <= H;
    if (!fits) { say('That design is bigger than this hull allows.', 'bad'); return; }
    beginAction();
    for (const e of entries.slice()) eraseEntry(e);
    rebuild();
    const core = d.grid.b.find(r => BLOCKS[r[0]]?.core);
    const dx = Math.floor((W - d.grid.w) / 2);
    let dy = Math.floor((H - d.grid.h) / 2);
    if (core) { const n = BLOCKS[core[0]].size || 1; dy = clamp(Math.round(axis - (core[2] + n / 2)), 0, H - d.grid.h); }
    const cx = core ? core[1] : d.grid.w / 2, cy = core ? core[2] : d.grid.h / 2;
    const order = d.grid.b.filter(r => BLOCKS[r[0]]).slice().sort((a, b) => (BLOCKS[b[0]].core ? 1 : 0) - (BLOCKS[a[0]].core ? 1 : 0) || Math.hypot(a[1] - cx, a[2] - cy) - Math.hypot(b[1] - cx, b[2] - cy));
    const missParts = {}, missMats = {}; let missCr = 0; let placed = 0;
    const saveSel = sel;
    for (const [id, x, y, r] of order) {
      const def = BLOCKS[id];
      if ((def.size || 1) > maxB) { missParts[def.name + ' (too big)'] = (missParts[def.name + ' (too big)'] || 0) + 1; continue; }
      if (def.module) {
        const best = parts.filter(it => it.block === id).sort((a, b) => (RARITY_BY_ID[b.rarity]?.index || 0) - (RARITY_BY_ID[a.rarity]?.index || 0))[0];
        if (!best) { missParts[def.name] = (missParts[def.name] || 0) + 1; continue; }
        sel = { kind: 'item', key: itemKey(best), id };
      } else {
        const miss = missingFor(def);
        if (miss) { const c = def.cost || {}; missCr += c.cr || 0; for (const [m2, v] of Object.entries(c.mats || {})) missMats[m2] = (missMats[m2] || 0) + v; continue; }
        sel = { kind: 'struct', id };
      }
      if (putOne(def, x + dx, y + dy, r, true)) placed++;
    }
    sel = saveSel && (saveSel.kind === 'struct' || parts.some(it => itemKey(it) === saveSel.key)) ? saveSel : null;
    rebuild(); touched(); showInfo();
    const lines = [...Object.entries(missParts).map(([n, c]) => `${c}× ${n}`), ...Object.entries(missMats).map(([m2, v]) => `${v} ${matName(m2)}`), missCr ? `${fmt(missCr)} credits` : null].filter(Boolean);
    if (!lines.length) say(`Loaded "${d.name}" — all ${placed} blocks placed.`, 'good');
    else modal(`Loaded "${d.name}"`, (m, close) => {
      m.append(el('p', {}, `Placed ${placed} of ${order.length} blocks. Missing:`), el('ul', {}, ...lines.map(l => el('li', {}, l))),
        el('p', { class: 'hint' }, 'Buy the parts at an outfitter, mine or buy the materials, then load the design again. Undo puts your old layout back.'), btn('OK', close, 'primary'));
    });
  }

  // ---------------------------------------------------------------- finish
  function close() {
    cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', onKey, true); hideTip();
    root.remove(); OPEN = null; delete app.buildUI;
    myNav.stop();
    if (app.padnav) app.padnav = app.makePadNav();   // main.js owns the menu-controller rules
    if (!docked) app.mode = 'fly';
  }
  function cancel() {
    if (!changed) { close(); return; }
    modal('Leave without saving?', (m, c) => {
      m.append(el('p', {}, 'Your changes will be thrown away. Parts and materials go back where they were.'),
        el('div', { class: 'row end' }, btn('Keep building', c), btn('Throw away', () => { c(); close(); }, 'danger')));
    });
  }
  function done() {
    if (!changed) { close(); return; }
    const pr = problems(); const stop = pr.filter(p => p.stop);
    if (stop.length) {
      modal('Not ready yet', (m, c) => { m.append(el('ul', { class: 'bm-plist' }, ...stop.map(p => el('li', {}, p.msg))), btn('Back to building', c, 'primary')); });
      return;
    }
    // leftover spares come back as half their materials
    for (const [id, n] of Object.entries(spare)) if (n > 0) for (const [m, v] of Object.entries(BLOCKS[id].cost?.mats || {})) led.mats[m] = (led.mats[m] || 0) - Math.floor(v * n / 2);
    if (led.cr > G.credits) { say('Not enough credits.', 'bad'); return; }
    G.credits -= led.cr;
    for (const [m, v] of Object.entries(led.mats)) { G.cargo[m] = Math.max(0, (G.cargo[m] || 0) - v); if (!G.cargo[m]) delete G.cargo[m]; }
    G.parts = parts;
    G.ship.grid = cropped(true);
    // count blocks that are really new: not the same part already sitting in the same spot at the start
    G.stats.built = (G.stats.built || 0) + entries.filter(e => e.counted && !startKeys.has(`${e.id}@${e.x},${e.y},${e.rot}`)).length;
    close();
    if (!docked) app.rebuildPlayer();
    app.updateQuest?.(); app.save();
    app.toast?.('Ship rebuilt.', 'good');
  }

  OPEN = { close, cancel, done };
  app.buildUI = {
    get entries() { return entries; }, get stats() { return body.stats; }, get led() { return led; }, get parts() { return parts; },
    select: s => { if (s?.item) { const it = parts.find(x => x.block === s.item); if (it) select({ kind: 'item', key: itemKey(it), id: it.block }); } else select(s ? { kind: 'struct', id: s } : null); },
    place: (x, y) => { beginAction(); const r = tryPlace(x, y); pendingSnap = null; return r; },
    erase: (x, y) => { beginAction(); const r = tryErase(x, y); pendingSnap = null; return r; },
    setTool, rotate, undo, problems, coverage, done, cancel, loadDesign, get W() { return W; }, get H() { return H; }, get axis() { return axis; },
    set mirror(v) { mirror = !!v; refreshTools(); }, view: V, toScr, tab: id => { tab = id; dirty.palette = true; },
  };
  return OPEN;
}
