// The Shipyard: build your ship block by block, like stacking cubes.
//   Left click   place the selected block on the face you point at (parts face out from that face: a thruster put
//                on the back face pushes forward, a turret put on the top face looks up)
//   Right click  remove a block (it refunds; parts go back to the hold)
//   Drag         turn the camera · wheel zoom · middle click picks up the block you point at
//   X            mirror left/right · Ctrl+Z / Ctrl+Y undo / redo
//   Controller   right stick turns, LT/RT zoom, left stick moves the view, A places at the centre mark, B removes,
//                D-pad left/right picks the tool, Y mirror, Start finishes
// Structure blocks cost credits per block (refunded when removed here). Parts come from the hold. Clicking an
// existing part with another part of the same kind selected swaps them (that is how you fit a bigger bridge).
// The automatic corners (sim/corners.js) appear live as you build; "Show corners" turns them off to compare.

import * as THREE from 'three';
import { $, el, btn, toast, num, credits as cr, dec } from './dom.js';
import { createGrid, put, remove, get, has, key, gridToSave, connectedFrom, bounds, fits, cellsOf, sizeOf } from '../sim/grid.js';
import { researchUnlocked } from '../sim/research.js';
import { computeStats, designProblems, designWarnings } from '../sim/stats.js';
import { cornerPlan, keepClearCells } from '../sim/corners.js';
import { rayGrid } from '../sim/hit.js';
import { designGrid, looseItems, installedUids, save } from '../sim/state.js';
import { itemName, rarityOf, itemDef, partStats } from '../sim/items.js';
import { checkGoals } from '../sim/goals.js';
import { STRUCTURE, PAINTS, BLOCKS, TURRETS, PARTS, RARITY } from '../data/blocks.js';
import { DIRS, DIRV, OPP } from '../core/math.js';
import { buildModel } from '../render/views.js';
import { makeEnvironment } from '../render/env.js';
import { mainValue, itemCard } from './cards.js';
import { play } from '../core/audio.js';
import { ask } from '../../../../shared/dialog.js';
import { openBlueprints } from './blueprints-ui.js';   // economy: saved blueprints
import { createArc } from './turret-arc.js';          // economy: turret arc preview

const mirrorR = r => (r === 0 ? 1 : r === 1 ? 0 : r);

export function openBuilder(app, onDone) {
  const G = app.G;
  const prevMode = app.mode; app.mode = 'build';
  const start = { rows: G.design.map(r => [...r]), credits: G.credits, hp: { ...G.hp } };
  let grid = designGrid(G);
  const byUid = new Map(G.items.map(i => [i.uid, i]));
  const undo = [], redo = [];
  const state = { tool: { type: 'structure', t: 'hull' }, paint: grid.cells.values().next().value?.p ?? 0, mirror: false, corners: true, hover: null, dirty: true };
  // paint the tool starts with: the most used paint on the hull
  { const c = new Map(); for (const b of grid.cells.values()) if (STRUCTURE[b.t]) c.set(b.p, (c.get(b.p) || 0) + 1); let best = 0, bn = -1; for (const [p, n] of c) if (n > bn) { bn = n; best = p; } state.paint = best; }

  // ---------------------------------------------------------------- 3D
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a1120');
  scene.environment = makeEnvironment(app.renderer, { sky: '#1c2840' }); scene.environmentIntensity = 0.9;
  scene.add(new THREE.HemisphereLight(0xb8ccff, 0x2a2430, 0.9));
  const key1 = new THREE.DirectionalLight(0xfff1dc, 2.6); key1.position.set(30, 50, 25); scene.add(key1);
  const rim = new THREE.DirectionalLight(0x6f8cff, 1.1); rim.position.set(-30, 10, -40); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 2000);
  const orbit = { yaw: 0.75, pitch: 0.5, dist: 22, target: new THREE.Vector3() };
  let model = null; const floorGrp = new THREE.Group(); scene.add(floorGrp);
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02), new THREE.MeshBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.35, depthWrite: false }));
  const ghostEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color: 0x9fe8ff }));
  ghost.add(ghostEdge); scene.add(ghost);
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1.2, 0xffc45a, 0.4, 0.25); ghost.add(arrow);
  const ghost2 = ghost.clone(); ghost2.material = ghost.material.clone(); ghost2.material.opacity = 0.18; scene.add(ghost2);
  const delBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.06, 1.06, 1.06)), new THREE.LineBasicMaterial({ color: 0xff6a5a })); scene.add(delBox);
  const arc = createArc(); scene.add(arc.root);   // economy: turret firing arc preview
  const mirrorPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xc48cff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })); scene.add(mirrorPlane);

  const bridgeX = () => { for (const b of grid.cells.values()) if (b.t === 'bridge') return b.x; return 0; };
  function rebuildModel() {
    if (model) { scene.remove(model); model.userData.dispose?.(); }
    model = buildModel(grid, { noCorners: !state.corners, center: false }); scene.add(model);
    // floor grid under the ship, an arrow for the front
    floorGrp.clear();
    const bb = bounds(grid); const span = Math.max(bb.x1 - bb.x0, bb.z1 - bb.z0) + 12; const S = Math.ceil(span / 2) * 2;
    const gh = new THREE.GridHelper(S, S, 0x2a4a6a, 0x1a2a40); gh.position.set(Math.round((bb.x0 + bb.x1 + 1) / 2), bb.y0 - 0.02, Math.round((bb.z0 + bb.z1 + 1) / 2)); floorGrp.add(gh);
    const fa = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3((bb.x0 + bb.x1 + 1) / 2, bb.y0, bb.z1 + 2), 4, 0x62f0a8, 1.2, 0.8); floorGrp.add(fa);
    const label = makeLabel('FRONT'); label.position.set((bb.x0 + bb.x1 + 1) / 2, bb.y0 + 0.3, bb.z1 + 7.2); floorGrp.add(label);
    mirrorPlane.visible = state.mirror; const mx = bridgeX() + 0.5;
    mirrorPlane.position.set(mx, (bb.y0 + bb.y1 + 1) / 2, (bb.z0 + bb.z1 + 1) / 2); mirrorPlane.rotation.y = Math.PI / 2; mirrorPlane.scale.set(bb.z1 - bb.z0 + 6, bb.y1 - bb.y0 + 6, 1);
    state.dirty = false;
  }
  function makeLabel(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.font = '700 40px Oxanium, sans-serif'; g.fillStyle = '#62f0a8'; g.textAlign = 'center'; g.fillText(text, 128, 46);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); s.scale.set(4, 1, 1); return s;
  }
  { const bb = bounds(grid); orbit.target.set((bb.x0 + bb.x1 + 1) / 2, (bb.y0 + bb.y1 + 1) / 2, (bb.z0 + bb.z1 + 1) / 2); orbit.dist = Math.max(14, (bb.z1 - bb.z0) * 2.2); }

  // ---------------------------------------------------------------- DOM
  const root = el('div', { class: 'builder' });
  const top = el('div', { class: 'b-top' });
  const left = el('div', { class: 'b-left' });
  const right = el('div', { class: 'b-right' });
  const bottom = el('div', { class: 'b-bottom' });
  const tipBox = el('div', { class: 'b-tip hidden' });
  const centre = el('div', { class: 'b-centre hidden' });
  root.append(top, left, right, bottom, tipBox, centre);
  // the station screens stay underneath, hidden while you build
  const hiddenPanels = [...$('#panels').children]; for (const p of hiddenPanels) p.style.display = 'none';
  $('#panels').append(root);
  root.closePanel = () => finish();
  const credLine = el('div', { class: 'stat amber' });
  top.append(el('h2', {}, 'Shipyard'), el('span', { class: 'dim' }, G.shipName), el('div', { class: 'grow' }), credLine,
    btn('Blueprints', () => openBlueprints({ G, grid: () => grid, apply: loadPlan }), 'small', { 'data-act': 'blueprints' }),   // economy
    btn('Undo', () => doUndo(), 'small', { 'data-tip': 'Ctrl+Z' }), btn('Redo', () => doRedo(), 'small', { 'data-tip': 'Ctrl+Y' }),
    btn('Discard changes', () => discard(), 'small danger'), btn('Done', () => finish(), 'primary'));

  let palTab = 'blocks';
  function drawLeft() {
    left.replaceChildren();
    const tb = el('div', { class: 'tabs' }, ...[['blocks', 'Blocks'], ['parts', `Parts (${num(spare().length)})`]].map(([id, l]) => btn(l, () => { palTab = id; drawLeft(); }, palTab === id ? 'on' : '')));
    left.append(tb);
    if (palTab === 'blocks') {
      for (const [t, d] of Object.entries(STRUCTURE)) {
        const on = state.tool.type === 'structure' && state.tool.t === t;
        const locked = d.needs && !researchUnlocked(G, d.needs);
        if (d.size > 1 && !left.querySelector('.b-big')) left.append(el('h4', { class: 'b-big' }, 'Big blocks (2×2×2, count as one block)'));
        const b = btn('', () => { if (locked) { toast('Research Heavy frames at a station’s Research lab to build with big blocks.'); return; } state.tool = { type: 'structure', t }; drawLeft(); }, 'b-tool' + (on ? ' on' : '') + (locked ? ' locked' : ''));
        b.append(el('i', { class: 'b-chip' + (d.size > 1 ? ' big' : ''), style: `background:${t === 'window' ? '#9fdcff' : PAINTS[state.paint].color}` }), el('span', {}, el('b', {}, d.name), el('small', {}, locked ? 'Needs the Heavy frames research (Research lab, Shipyard branch)' : `${cr(d.cost)} · ${num(d.hp)} health · ${d.desc}`)));
        left.append(b);
      }
      left.append(el('h4', {}, 'Paint'));
      const row = el('div', { class: 'paints' });
      PAINTS.forEach((p, i) => { const b = btn('', () => { state.paint = i; drawLeft(); }, state.paint === i ? 'on' : '', { 'aria-label': p.name, 'data-tip': p.name }); b.style.background = p.color; row.append(b); });
      const pm = btn(state.tool.type === 'paint' ? 'Painting — click blocks' : 'Paint existing blocks', () => { state.tool = state.tool.type === 'paint' ? { type: 'structure', t: 'hull' } : { type: 'paint' }; drawLeft(); }, state.tool.type === 'paint' ? 'on small' : 'small');
      left.append(row, pm);
    } else {
      const items = spare().sort((a, b) => a.kind.localeCompare(b.kind) || b.tier - a.tier || b.rarity - a.rarity);
      if (!items.length) left.append(el('p', { class: 'hint' }, 'No spare parts. Buy them at the Outfitter, or take them from wrecks.'));
      const groups = new Map(); for (const it of items) { const k = it.kind; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
      for (const [k, list] of groups) {
        left.append(el('h4', {}, BLOCKS[k].name));
        for (const it of list) {
          const on = state.tool.type === 'item' && state.tool.uid === it.uid; const r = rarityOf(it); const mv = mainValue(it);
          const b = btn('', () => { state.tool = { type: 'item', uid: it.uid }; drawLeft(); }, 'b-tool' + (on ? ' on' : ''), { 'data-tip-render': 'hf-item', 'data-uid': it.uid });
          b.append(el('i', { class: 'b-chip', style: `background:${r.color}` }), el('span', {}, el('b', { style: `color:${r.color}` }, itemName(it)), el('small', {}, `${r.name} · ${dec(mv.v, 1)} ${mv.label}`)));
          left.append(b);
        }
      }
    }
  }
  const spare = () => { const inst = new Set([...grid.cells.values()].filter(b => b.item).map(b => b.item.uid)); return G.items.filter(i => !inst.has(i.uid)); };
  import('../../../../shared/tooltip.js').then(({ registerTip }) => registerTip('hf-item', elm => { const it = byUid.get(+elm.dataset.uid); if (!it) return ''; const c = itemCard(it, { fitted: [...grid.cells.values()].filter(b => b.item).map(b => b.item) }); c.style.maxWidth = '300px'; return c; }));

  function drawRight() {
    const st = computeStats(grid); const probs = designProblems(grid, st); const warns = designWarnings(st);
    const plan = cornerPlan(grid);
    const kv = (a, b, cls = '') => [el('span', {}, a), el('b', { class: cls }, b)];
    right.replaceChildren(
      el('h3', {}, 'Ship'),
      el('div', { class: 'kv' },
        ...kv('Blocks', `${num(st.blocks)} / ${num(st.maxBlocks)}`, st.blocks > st.maxBlocks ? 'bad' : ''),
        ...kv('Rating', num(st.rating)),
        ...kv('Mass', `${num(st.mass)} t`),
        ...kv('Top speed', `${num(st.maxSpeed)} m/s`),
        ...kv('Forward push', `${dec(st.accel[4], 1)} m/s²`),
        ...kv('Sideways push', `${dec((st.accel[0] + st.accel[1]) / 2, 1)} m/s²`),
        ...kv('Up/down push', `${dec((st.accel[2] + st.accel[3]) / 2, 1)} m/s²`),
        ...kv('Turning', `${num(st.turn * 57.3)}° per second`),
        ...kv('Hull', num(st.maxHp)),
        ...kv('Shield', st.shield ? `${num(st.shield)} (+${dec(st.regen, 1)}/s)` : 'none'),
        ...kv('Power', `${num(st.powerMade)} made / ${num(st.powerUse)} used`, st.powerRatio < 1 ? 'bad' : ''),
        ...kv('Damage per second', num(st.dps)),
        ...kv('Turrets', `${num(st.turrets.length)} (${num(Math.min(st.auto, st.turrets.filter(t => t.t !== 'mining').length))} aim on their own)`),
        ...kv('Ore room', num(st.cargo)),
        ...kv('Automatic corners', num(plan.length))),
      el('label', { class: 'b-check' }, (() => { const c = el('input', { type: 'checkbox' }); c.checked = state.corners; c.onchange = () => { state.corners = c.checked; state.dirty = true; }; return c; })(), ' Show automatic corners'),
      ...probs.map(p => el('p', { class: 'b-prob' }, p)),
      ...warns.map(p => el('p', { class: 'b-warn' }, p)),
    );
    credLine.textContent = cr(G.credits);
  }
  bottom.append(
    btn('Mirror left/right (X)', () => toggleMirror(), 'small b-mirror'),
    el('span', { class: 'dim' }, 'Left click: place · Right click: remove · Drag: turn · Wheel: zoom · Middle click: pick'));
  function toggleMirror() { state.mirror = !state.mirror; bottom.querySelector('.b-mirror').classList.toggle('on', state.mirror); state.dirty = true; toast(state.mirror ? 'Mirror on: blocks go on both sides of the bridge.' : 'Mirror off.'); }

  // ---------------------------------------------------------------- editing
  const snapshot = () => ({ rows: gridToSave(grid), credits: G.credits });
  function restore(s) { grid = rowsToGrid(s.rows); G.credits = s.credits; state.dirty = true; drawLeft(); drawRight(); }
  function rowsToGrid(rows) { const g = createGrid(); g.bonus = grid.bonus; for (const [x, y, z, t, r, p, uid] of rows) put(g, { x, y, z, t, r, p, item: uid ? byUid.get(uid) : null }); return g; }
  // economy: load a blueprint plan (sim/blueprints.js planBlueprint) as one undoable step
  function loadPlan(plan) {
    const before = snapshot();
    plan.grid.bonus = grid.bonus; grid = plan.grid; G.credits -= plan.net;
    const next = spare()[0]; if (state.tool.type === 'item' && !spare().some(i => i.uid === state.tool.uid)) state.tool = next ? { type: 'item', uid: next.uid } : { type: 'structure', t: 'hull' };
    commit(before); play('rebuilt');
    { const bb = bounds(grid); orbit.target.set((bb.x0 + bb.x1 + 1) / 2, (bb.y0 + bb.y1 + 1) / 2, (bb.z0 + bb.z1 + 1) / 2); }
    toast(`Loaded: ${num(plan.placed)} blocks${plan.missing.length ? `, ${num(plan.missing.reduce((a, x) => a + x.n, 0))} parts missing` : ''}.`, plan.missing.length ? '' : 'good');
  }
  function commit(before) { undo.push(before); if (undo.length > 200) undo.shift(); redo.length = 0; state.dirty = true; drawLeft(); drawRight(); }
  function doUndo() { const s = undo.pop(); if (!s) return; redo.push(snapshot()); restore(s); }
  function doRedo() { const s = redo.pop(); if (!s) return; undo.push(snapshot()); restore(s); }

  const cache = new Map();
  const cached = (k, fn) => { const c = cache.get(k); if (c && c.g === grid && c.v === grid.version) return c.val; const val = fn(); cache.set(k, { g: grid, v: grid.version, val }); return val; };
  /** Can a block of `kind` facing `r` go in cell c? Returns a reason or ''. */
  function placeWhy(c, kind, r, ignore = null) {
    const big = (BLOCKS[kind]?.size || 1) > 1;
    if (!fits(grid, c.x, c.y, c.z, kind)) return big ? 'A big block needs a free 2×2×2 space there.' : 'Something is already there.';
    const clear = cached('clear', () => keepClearCells(grid));
    if (cellsOf({ x: c.x, y: c.y, z: c.z, t: kind }).some(([x, y, z]) => clear.has(key(x, y, z)))) return 'That spot has to stay clear (a turret or a nozzle needs it).';
    if (TURRETS[kind] || kind === 'thruster') { const [dx, dy, dz] = DIRS[r]; if (has(grid, c.x + dx, c.y + dy, c.z + dz)) return kind === 'thruster' ? 'The nozzle would point into a block.' : 'The gun would sit inside a block.'; }
    const st = cached('stats', () => computeStats(grid));
    if (st.maxBlocks && st.blocks + 1 > st.maxBlocks) return `Block limit reached (${st.maxBlocks}). Fit a bigger bridge to build more.`;
    return '';
  }
  /** The corner cell of a block placed against face `face` of the hit cell: big blocks grow out from the face. */
  function originFor(hit, face, kind) {
    const n = DIRV[face]; const S = BLOCKS[kind]?.size || 1;
    const c = { x: hit.x + n.x, y: hit.y + n.y, z: hit.z + n.z };
    if (S > 1) { if (n.x < 0) c.x -= S - 1; if (n.y < 0) c.y -= S - 1; if (n.z < 0) c.z -= S - 1; }
    return c;
  }
  /** Where the mirror copy of a block of `kind` with corner c goes (across the bridge's column). */
  const mirrorX = (x, kind) => 2 * bridgeX() - x - ((BLOCKS[kind]?.size || 1) - 1);
  function placeAt(hit) {
    const tool = state.tool;
    const before = snapshot();
    if (tool.type === 'paint') {
      const b = hit.blk; if (!STRUCTURE[b.t]) { toast('Only hull blocks take paint.'); return; }
      const targets = [b]; if (state.mirror) { const m = get(grid, mirrorX(b.x, b.t), b.y, b.z); if (m && m !== b && STRUCTURE[m.t]) targets.push(m); }
      if (targets.every(t => t.p === state.paint)) return;
      for (const t of targets) t.p = state.paint; grid.version++; commit(before); play('rebuilt'); return;
    }
    // clicking a part with the same kind of part selected swaps them
    if (tool.type === 'item') {
      const it = byUid.get(tool.uid); if (!it) return;
      if (hit.blk.item && hit.blk.t === it.kind) {
        const old = hit.blk.item; put(grid, { ...hit.blk, item: it, hp: null }); commit(before);
        toast(`Swapped in ${itemName(it)}; ${itemName(old)} went to the hold.`, 'good'); play('rebuilt');
        state.tool = { type: 'item', uid: old.uid }; drawLeft(); if (it.kind === 'bridge' || hit.blk.t === 'bridge') drawRight();
        afterChange(); return;
      }
    }
    const face = hit.face; if (face < 0) return;
    const kind = tool.type === 'structure' ? tool.t : byUid.get(tool.uid)?.kind;
    if (!kind) return;
    const c = originFor(hit, face, kind);
    if (kind === 'bridge' && [...grid.cells.values()].some(b => b.t === 'bridge')) { toast('A ship has one bridge. Click your bridge with this one selected to swap them.', 'bad'); return; }
    const r = face;
    const why = placeWhy(c, kind, r); if (why) { toast(why, 'bad'); play('warn'); return; }
    const cost = STRUCTURE[kind]?.cost || 0;
    const mx = mirrorX(c.x, kind); const mirrorCell = state.mirror && mx !== c.x && !(mx < c.x + sizeOf({ t: kind }) && c.x < mx + sizeOf({ t: kind })) ? { x: mx, y: c.y, z: c.z } : null;
    let mirrorItem = null;
    if (mirrorCell && tool.type === 'item') {
      const it = byUid.get(tool.uid);
      mirrorItem = spare().filter(x => x.uid !== it.uid && x.kind === it.kind).sort((a, b) => Math.abs(a.tier - it.tier) - Math.abs(b.tier - it.tier) || b.rarity - a.rarity)[0] || null;
    }
    const total = cost * (mirrorCell && tool.type === 'structure' ? 2 : 1);
    if (G.credits < total) { toast(`Not enough credits: ${cr(total)} needed.`, 'bad'); return; }
    put(grid, { x: c.x, y: c.y, z: c.z, t: kind, r, p: state.paint, item: tool.type === 'item' ? byUid.get(tool.uid) : null });
    G.credits -= cost;
    if (mirrorCell && (tool.type === 'structure' || mirrorItem)) {
      const mr = mirrorR(r);
      if (!placeWhy(mirrorCell, kind, mr)) { put(grid, { ...mirrorCell, t: kind, r: mr, p: state.paint, item: mirrorItem }); if (tool.type === 'structure') G.credits -= cost; }
    } else if (mirrorCell && tool.type === 'item') toast(`No second ${BLOCKS[kind].name} in the hold for the other side.`);
    if (tool.type === 'item') {
      // keep the same kind selected while you have more
      const next = spare().find(x => x.kind === kind); state.tool = next ? { type: 'item', uid: next.uid } : { type: 'structure', t: 'hull' };
      if (!G.flags?.fitted && TURRETS[kind]) { G.flags = { ...(G.flags || {}), fitted: true }; }
    }
    commit(before); play('rebuilt'); afterChange();
  }
  function removeAt(hit) {
    const b = hit.blk;
    if (b.t === 'bridge') { toast('The bridge stays. To change it, select another bridge part and click this one.', 'bad'); return; }
    const before = snapshot();
    const targets = [b];
    if (state.mirror) { const m = get(grid, mirrorX(b.x, b.t), b.y, b.z); if (m && m !== b && m.t === b.t) targets.push(m); }
    for (const t of targets) remove(grid, t.x, t.y, t.z);
    const br = [...grid.cells.values()].find(x => x.t === 'bridge');
    const joined = br ? connectedFrom(grid, br.x, br.y, br.z).size : 0;
    if (joined < grid.cells.size) { for (const t of targets) put(grid, t); toast(`That would cut ${num(grid.cells.size - joined)} blocks loose from the bridge.`, 'bad'); play('warn'); return; }
    for (const t of targets) G.credits += STRUCTURE[t.t]?.cost || 0;
    commit(before); play('blockdie'); afterChange();
  }
  function afterChange() { /* goals are checked when you press Done */ }

  // ---------------------------------------------------------------- input
  const canvas = $('#view');
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  let drag = null, mouse = { x: innerWidth / 2, y: innerHeight / 2, over: false };
  function pick(sx, sy) {
    ndc.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, cam);
    const o = ray.ray.origin, d = ray.ray.direction;
    return rayGrid(grid, { x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }, 500);
  }
  const onDown = e => { if (e.target !== canvas) return; drag = { x: e.clientX, y: e.clientY, b: e.button, moved: false }; };
  const onMove = e => {
    mouse = { x: e.clientX, y: e.clientY, over: e.target === canvas };
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) { orbit.yaw -= e.movementX * 0.006; orbit.pitch = Math.max(-1.45, Math.min(1.45, orbit.pitch + e.movementY * 0.006)); }
  };
  const onUp = e => {
    if (!drag) return; const d = drag; drag = null;
    if (d.moved || e.target !== canvas) return;
    const hit = pick(e.clientX, e.clientY); if (!hit) return;
    if (d.b === 0) placeAt(hit); else if (d.b === 2) removeAt(hit);
    else if (d.b === 1) { if (STRUCTURE[hit.blk.t]) { state.tool = { type: 'structure', t: hit.blk.t }; state.paint = hit.blk.p; palTab = 'blocks'; drawLeft(); } }
  };
  const onWheel = e => { if (e.target !== canvas) return; orbit.dist = Math.max(5, Math.min(160, orbit.dist * (1 + Math.sign(e.deltaY) * 0.1))); e.preventDefault(); };
  const onKey = e => {
    if (e.target.closest?.('input, textarea')) return;
    if (e.code === 'Escape') { if ($('#panels').lastElementChild !== root) return; e.stopImmediatePropagation(); finish(); return; }   // economy: a window on top (Blueprints) closes itself
    if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); doUndo(); }
    else if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); doRedo(); }
    else if (e.code === 'KeyX') toggleMirror();
    else if (e.code === 'ArrowLeft') orbit.yaw += 0.12; else if (e.code === 'ArrowRight') orbit.yaw -= 0.12;
    else if (e.code === 'ArrowUp') orbit.pitch = Math.min(1.45, orbit.pitch + 0.1); else if (e.code === 'ArrowDown') orbit.pitch = Math.max(-1.45, orbit.pitch - 0.1);
  };
  addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false }); addEventListener('keydown', onKey, true);
  const padPrev = {};
  function padFrame(dt) {
    const p = [...(navigator.getGamepads?.() || [])].find(Boolean); if (!p) { centre.classList.add('hidden'); return null; }
    const dz = v => (Math.abs(v) < 0.15 ? 0 : v);
    const rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0), lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0);
    const any = rx || ry || lx || ly || p.buttons.some(b => b.pressed);
    if (any) state.padMode = true;
    if (!state.padMode) return null;
    centre.classList.remove('hidden');
    orbit.yaw -= rx * dt * 2.2; orbit.pitch = Math.max(-1.45, Math.min(1.45, orbit.pitch + ry * dt * 1.8));
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); const rt = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    orbit.target.addScaledVector(rt, lx * dt * 8).addScaledVector(fwd, -ly * dt * 8);
    const press = i => { const on = !!p.buttons[i]?.pressed; const was = padPrev[i]; padPrev[i] = on; return on && !was; };
    if (p.buttons[4]?.pressed) orbit.target.y -= dt * 6; if (p.buttons[5]?.pressed) orbit.target.y += dt * 6;
    if ((p.buttons[6]?.value || 0) > 0.3) orbit.dist = Math.min(160, orbit.dist * (1 + dt)); if ((p.buttons[7]?.value || 0) > 0.3) orbit.dist = Math.max(5, orbit.dist * (1 - dt));
    const hit = pick(innerWidth / 2, innerHeight / 2);
    if (press(0) && hit) placeAt(hit);
    if (press(1) && hit) removeAt(hit);
    if (press(3)) toggleMirror();
    if (press(9)) finish();
    if (press(14)) cycleTool(-1); if (press(15)) cycleTool(1);
    return hit;
  }
  function cycleTool(dir) {
    const tools = [...Object.keys(STRUCTURE).filter(t => !STRUCTURE[t].needs || researchUnlocked(G, STRUCTURE[t].needs)).map(t => ({ type: 'structure', t })), ...spare().map(i => ({ type: 'item', uid: i.uid }))];
    const i = tools.findIndex(t => t.type === state.tool.type && (t.t === state.tool.t && t.t || t.uid === state.tool.uid && t.uid));
    state.tool = tools[(i + dir + tools.length) % tools.length]; palTab = state.tool.type === 'item' ? 'parts' : 'blocks'; drawLeft();
  }

  // ---------------------------------------------------------------- frame
  function frame(dt) {
    if (state.dirty) rebuildModel();
    const padHit = padFrame(dt);
    cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    const cp = Math.cos(orbit.pitch);
    cam.position.set(orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.dist, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist, orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.dist);
    cam.lookAt(orbit.target);
    // hover preview
    const hit = padHit || (mouse.over && !drag?.moved ? pick(mouse.x, mouse.y) : null);
    ghost.visible = ghost2.visible = delBox.visible = false; tipBox.classList.add('hidden'); arc.hide();
    if (hit) {
      { const HS = sizeOf(hit.blk); delBox.visible = true; delBox.position.set(hit.blk.x + HS / 2, hit.blk.y + HS / 2, hit.blk.z + HS / 2); delBox.scale.setScalar(HS); }
      if (state.tool.type !== 'paint' && hit.face >= 0) {
        const n = DIRV[hit.face];
        const kind = state.tool.type === 'structure' ? state.tool.t : byUid.get(state.tool.uid)?.kind;
        const c = originFor(hit, hit.face, kind); const GS = BLOCKS[kind]?.size || 1;
        const swap = state.tool.type === 'item' && hit.blk.item && hit.blk.t === kind;
        const why = swap ? '' : kind === 'bridge' ? 'Click your bridge to swap it.' : placeWhy(c, kind, hit.face);
        ghost.visible = !swap; ghost.position.set(c.x + GS / 2, c.y + GS / 2, c.z + GS / 2); ghost.scale.setScalar(GS); ghost2.scale.setScalar(GS);
        ghost.material.color.set(why ? 0xff6a5a : 0x5fd8ff);
        arrow.visible = !!(TURRETS[kind] || kind === 'thruster'); if (arrow.visible) arrow.setDirection(new THREE.Vector3(n.x, n.y, n.z));
        if (state.mirror) { const mx = mirrorX(c.x, kind); if (mx !== c.x) { ghost2.visible = true; ghost2.position.set(mx + GS / 2, c.y + GS / 2, c.z + GS / 2); } }
        const label = swap ? `Swap in ${itemName(byUid.get(state.tool.uid))}` : why || (STRUCTURE[kind] ? `${BLOCKS[kind].name} · ${cr(STRUCTURE[kind].cost)}` : `${BLOCKS[kind].name}${kind === 'thruster' ? ' — pushes the ship the other way' : ''}`);
        // economy: a turret about to be placed shows its firing arc from that face
        const ghostArc = TURRETS[kind] && !swap && !why && !TURRETS[hit.blk.t]; const toolItem = state.tool.type === 'item' ? byUid.get(state.tool.uid) : null;
        if (ghostArc) arc.show(c, hit.face, kind, toolItem);
        tipBox.textContent = ghostArc ? arc.label(toolItem, kind) : label; tipBox.classList.toggle('bad', !!why); tipBox.classList.remove('hidden');
        const tx = padHit ? innerWidth / 2 : mouse.x, ty = padHit ? innerHeight / 2 : mouse.y;
        tipBox.style.left = Math.min(innerWidth - (ghostArc ? 480 : 300), tx + 18) + 'px'; tipBox.style.top = (ty + 18) + 'px';
      }
    }
    // economy: pointing at a fitted turret shows its arc
    if (hit && TURRETS[hit.blk.t]) {
      arc.show(hit.blk, hit.blk.r, hit.blk.t, hit.blk.item);
      tipBox.textContent = arc.label(hit.blk.item, hit.blk.t); tipBox.classList.remove('bad', 'hidden');
      const tx = padHit ? innerWidth / 2 : mouse.x, ty = padHit ? innerHeight / 2 : mouse.y;
      tipBox.style.left = Math.min(innerWidth - 480, tx + 18) + 'px'; tipBox.style.top = (ty + 18) + 'px';
    }
    arc.frame(dt);
    for (const T of model?.userData.turrets || []) T.yaw.rotation.y += dt * 0.25;
    app.renderer.render(scene, cam);
  }

  // ---------------------------------------------------------------- leaving
  async function finish() {
    const st = computeStats(grid); const probs = designProblems(grid, st);
    if (probs.length) { toast(probs[0], 'bad'); play('warn'); return; }
    // keep damage only on blocks that did not change
    const old = designGrid(G); const hp = {};
    for (const [k, h] of Object.entries(G.hp)) { const a = old.cells.get(+k), b = grid.cells.get(+k); if (a && b && a.t === b.t && (a.item?.uid || 0) === (b.item?.uid || 0)) hp[k] = h; }
    G.design = gridToSave(grid); G.hp = hp;
    const g = checkGoals(G); if (g) app.goalDone(g);
    save(G); close();
  }
  async function discard() {
    if (undo.length && !(await ask({ title: 'Discard your changes?', text: 'The ship goes back to how it was, and the credits come back.', ok: 'Discard', danger: true }))) return;
    G.design = start.rows; G.credits = start.credits; G.hp = start.hp; close();
  }
  function close() {
    removeEventListener('pointerdown', onDown); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp);
    canvas.removeEventListener('wheel', onWheel); removeEventListener('keydown', onKey, true);
    if (model) { scene.remove(model); model.userData.dispose?.(); }
    arc.dispose();   // economy
    scene.environment?.dispose();
    root.remove(); for (const p of hiddenPanels) p.style.display = ''; app.builder = null; app.mode = prevMode;
    onDone?.();
  }
  drawLeft(); drawRight();
  app.builder = { frame, get grid() { return grid; }, place: placeAt, remove: removeAt, pick, finish, state };
}
