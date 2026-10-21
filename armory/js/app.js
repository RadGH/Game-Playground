// Armory — the page. A grid of thumbnails (one shared renderer, a queue, cached pictures) and a detail view:
// a Chibi 2 body you can orbit wearing the piece, hand / animation / race / size toggles, measured model
// details, the game items mapped to it, the icon as Thousandvale draws it, and a flag note.
//
// Everything this file knows about a model comes from the gear catalog row (armory/js/source.js) or is
// MEASURED from the real builders (avatar-3d/js/preview-kit.js). Nothing here is a second copy of a model.
import * as THREE from 'three';
import { el, toast, downloadJSON, copyText } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { installTooltips } from '../../shared/tooltip.js';
import { fmt } from '../../shared/format.js';
import { createChibi2Character } from '../../avatar-3d/js/chibi2.js';
import * as motion from '../../avatar-3d/js/chibi2-motion.js';
import * as dualMotion from '../../avatar-3d/js/chibi2-motion-dual.js';      // importing it registers the dual-wield, angling and revive clips
import { CHIBI2_RACES, CHIBI2_RACE_IDS } from '../../avatar-3d/js/chibi2-races.js';
import { createScene, createThumbnailer, vertexKeys, extractAdded, holdOf, staticModel, frameBox, poseForPicture, characterStats } from '../../avatar-3d/js/preview-kit.js';
import { loadRows } from './source.js';
import {
  KIND_LABEL, SLOT_LABEL, GAME_LABEL, EMPTY_FILTER, SORTS, HEIGHTS, BUILDS, HAIR,
  facets, filterRows, parseHash, formatHash, findRow, mannequin, baselineFor, handModes, defaultHand, dress,
  itemRows, iconItem, exportFlags, cm, metres, sizeText,
} from './model.js';

installTooltips();
const $ = id => document.getElementById(id);
const store = makeStore('armory', 1);
const thumbs = createThumbnailer({ size: 192 });
const state = { rows: [], lookFor: null, origin: '', itemData: null, flags: store.get('flags', {}), ...parseHash(location.hash), measured: new Map() };
const label = (map, v) => map[v] || String(v).replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

// ---------------------------------------------------------------- animation list
// every clip the motion module offers
const ANIM_GROUPS = Object.fromEntries(Object.entries(motion.CHIBI2_ANIM_GROUPS).map(([k, v]) => [k, [...v]]));
let ANIMS = [...new Set([...motion.CHIBI2_EVERY_ANIMS, ...motion.CHIBI2_SWIM_ANIMS])];
for (const [name, v] of [...Object.entries(motion), ...Object.entries(dualMotion)]) {
  // any opt-in list the motion module exports later (CHIBI2_DUAL_ANIMS…) is picked up without a change here
  if (!/^CHIBI2_\w+_ANIMS$/.test(name) || !Array.isArray(v)) continue;
  const group = name.replace(/^CHIBI2_|_ANIMS$/g, '').toLowerCase().replace(/^\w/, c => c.toUpperCase());
  for (const n of v) {
    if (typeof n !== 'string') continue;
    if (!ANIMS.includes(n)) ANIMS.push(n);
    // a clip already in the full list but in no menu group still gets a place in the picker
    if (!Object.values(ANIM_GROUPS).some(g => g.includes(n))) (ANIM_GROUPS[group] ||= []).push(n);
  }
}
const GROUP_NAMES = { Dual: 'Dual wield', Angle: 'Angling', Revive: 'Revive' };
for (const [k, nice] of Object.entries(GROUP_NAMES)) if (ANIM_GROUPS[k] && k !== nice) { ANIM_GROUPS[nice] = ANIM_GROUPS[k]; delete ANIM_GROUPS[k]; }
/** The clip both-hands mode opens on: a dual clip for a pair of one-handers, a twin clip for two two-handers. */
const bothClip = row => { const want = row.hands === 2 ? 'twinCrash' : 'dualFlurry'; return ANIMS.includes(want) ? want : null; };
const ATTACKS = new Set([...(ANIM_GROUPS.Strikes || []), ...(ANIM_GROUPS.Weapons || []), ...(ANIM_GROUPS['Dual wield'] || [])]);

// ---------------------------------------------------------------- building and measuring
const baseKeyCache = new Map();
/** The vertex fingerprint of a bare body (built once per body). */
async function baseKeys(avatar) {
  const k = JSON.stringify(avatar);
  if (!baseKeyCache.has(k)) {
    const c = await createChibi2Character(avatar, { anims: ['idle'], v25: true });
    baseKeyCache.set(k, { keys: vertexKeys(c), stats: characterStats(c) }); c.dispose();
    if (baseKeyCache.size > 24) baseKeyCache.delete(baseKeyCache.keys().next().value);
  }
  return baseKeyCache.get(k);
}
const lookOpts = (row, view = {}) => ({ hand: view.hand || defaultHand(row), quality: row.slot === 'held' || row.slot === 'offhand' ? (view.quality ?? 1) : undefined, color: view.color || undefined, lookFor: state.lookFor });

/** Numbers for one row on the standard body (human, medium), kept for the cards and the detail table. */
function summarise(row, extract, base, character, hand) {
  const whole = characterStats(character);
  const side = hand === 'off' ? 'L' : 'R';
  const carrier = extract.bones.find(b => b.name.endsWith(side) && /grip|hand|elbow/.test(b.name)) || extract.bones[0];
  const hold = row.slot === 'held' || row.slot === 'offhand' ? (carrier ? holdOf(extract, character, carrier.name) : null) : null;
  return {
    triangles: extract.triangles, vertices: extract.vertices, byBucket: { ...extract.byBucket }, size: extract.size.clone(),
    bones: extract.bones.slice(0, 4), colours: extract.colours, addsMesh: whole.meshes - base.stats.meshes, bodyTriangles: base.stats.triangles,
    wholeTriangles: whole.triangles, meshes: whole.meshes, hold,
  };
}

/** The grid picture for a row; measures it on the way (a thumbnail build IS a measurement). */
function thumbJob(row) {
  return async stage => {
    const body = baselineFor(row), base = await baseKeys(body);
    const character = await createChibi2Character(dress(body, row, lookOpts(row)), { anims: ['idle'], v25: true });
    const extract = extractAdded(character, base.keys);
    state.measured.set(row.key, summarise(row, extract, base, character, defaultHand(row)));
    let thing, cleanup;
    if (!extract.triangles) { character.dispose(); extract.dispose(); throw new Error('draws nothing'); }
    if (row.slot === 'held' || row.slot === 'offhand') {
      thing = poseForPicture(staticModel(extract), extract, { diagonal: row.slot === 'held' });
      stage.scene.add(thing); thing.updateMatrixWorld(true);
      frameBox(stage.camera, new THREE.Box3().setFromObject(thing), { yaw: 0.25, pitch: 0.1, pad: 1.02 });
      cleanup = () => { stage.scene.remove(thing); thing.userData.dispose(); };
    } else {
      stage.scene.add(character.group); character.group.updateMatrixWorld(true);
      const box = extract.box.clone(), s = extract.size;
      // show a little of the body around a small piece so it is clear where it sits
      box.expandByScalar(Math.max(0.03, 0.22 - Math.max(s.x, s.y, s.z) * 0.25));
      frameBox(stage.camera, box, { yaw: row.slot === 'cape' ? Math.PI - 0.45 : row.slot === 'shoes' ? 0.7 : 0.38, pitch: row.slot === 'shoes' ? 0.3 : 0.1, pad: 0.9 });
      cleanup = () => { stage.scene.remove(character.group); };
    }
    return () => { cleanup(); character.dispose(); extract.dispose(); };
  };
}

// ---------------------------------------------------------------- filters
const FILTERS = [
  ['kind', 'Kind', KIND_LABEL], ['slot', 'Slot', SLOT_LABEL], ['type', 'Type', {}], ['archetype', 'Archetype', {}], ['game', 'Used by', GAME_LABEL], ['hands', 'Hands', { 1: 'One-handed', 2: 'Two-handed' }],
];
function drawFilters() {
  const f = state.filter, box = $('filters');
  // each group counts what the OTHER filters leave, so a chip never promises rows it cannot show
  const groups = FILTERS.map(([key, title, names]) => {
    const others = filterRows(state.rows, { ...f, [key]: '' }, state.flags), values = facets(others)[key] || [];
    if (!values.length && !f[key]) return null;
    return el('div', { class: 'fgroup', 'data-filter': key },
      el('h3', {}, title),
      el('div', { class: 'chips' },
        el('button', { class: 'chip' + (!f[key] ? ' on' : ''), type: 'button', text: 'All', onclick: () => setFilter({ [key]: '' }) }),
        ...values.map(v => el('button', { class: 'chip' + (String(f[key]) === String(v.value) ? ' on' : ''), type: 'button', 'data-value': v.value, onclick: () => setFilter({ [key]: String(f[key]) === String(v.value) ? '' : String(v.value) }) }, label(names, v.value), el('span', { class: 'n', text: v.n })))));
  });
  const flagged = Object.keys(state.flags).length, fresh = state.rows.filter(r => r.isNew).length;
  box.replaceChildren(
    el('div', { class: 'fgroup' },
      el('div', { class: 'chips' },
        el('button', { class: 'chip toggle' + (f.isNew ? ' on' : ''), type: 'button', id: 'f-new', 'aria-pressed': String(f.isNew), onclick: () => setFilter({ isNew: !f.isNew }) }, 'New this round', el('span', { class: 'n', text: fresh })),
        el('button', { class: 'chip toggle' + (f.flagged ? ' on' : ''), type: 'button', id: 'f-flagged', 'aria-pressed': String(f.flagged), onclick: () => setFilter({ flagged: !f.flagged }) }, 'Flagged', el('span', { class: 'n', text: flagged })))),
    ...groups.filter(Boolean),
    el('div', { class: 'fgroup' }, el('button', { class: 'small', type: 'button', id: 'f-reset', text: 'Clear filters', onclick: () => { $('search').value = ''; state.filter = { ...EMPTY_FILTER }; refresh(); } })));
}
function setFilter(patch) { Object.assign(state.filter, patch); refresh(); }

// ---------------------------------------------------------------- grid
let shown = [];
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    const key = e.target.dataset.key, row = findRow(state.rows, key);
    if (!row) continue;
    if (e.isIntersecting) loadThumb(e.target, row); else thumbs.cancel(key);
  }
}, { rootMargin: '300px' });

function loadThumb(card, row) {
  const pic = card.querySelector('.pic');
  if (pic.dataset.state === 'done') return;
  thumbs.request(row.key, thumbJob(row)).then(url => {
    pic.replaceChildren(el('img', { src: url, alt: row.name, width: 96, height: 96, loading: 'lazy' })); pic.dataset.state = 'done';
    const m = state.measured.get(row.key);
    if (m) card.querySelector('.tris').textContent = `${fmt(m.triangles)} tris`;
    if (row.key === state.id) drawStats();
  }).catch(e => {
    if (e.message === 'cancelled') return;
    pic.dataset.state = 'failed'; pic.replaceChildren(el('span', { class: 'nopic', text: e.message === 'draws nothing' ? 'draws nothing' : 'failed', 'data-tip': e.message === 'draws nothing' ? 'Building a body with this id added no geometry. Either the id has no model or it only shows on some bodies.' : String(e.message) }));
    console.warn('[armory] thumbnail', row.key, e);
  });
}

function card(row) {
  const flag = state.flags[row.key];
  return el('button', { class: 'gcard' + (row.key === state.id ? ' on' : '') + (flag ? ' flagged' : ''), type: 'button', 'data-key': row.key, 'data-id': row.id, onclick: () => select(row.key) },
    el('span', { class: 'pic', 'data-state': thumbs.has(row.key) ? 'done' : 'wait' }, thumbs.has(row.key) ? el('img', { src: thumbs.get(row.key), alt: row.name, width: 96, height: 96 }) : el('span', { class: 'nopic', text: '…' })),
    el('span', { class: 'gname', text: row.name }),
    el('span', { class: 'gid', text: row.id }),
    el('span', { class: 'gmeta' }, el('span', { text: [row.type || label(SLOT_LABEL, row.gameSlot), row.archetype].filter(Boolean).join(' · ') }), el('span', { class: 'tris', text: state.measured.has(row.key) ? `${fmt(state.measured.get(row.key).triangles)} tris` : '' })),
    row.isNew ? el('span', { class: 'gbadge new', text: 'new' }) : null,
    flag ? el('span', { class: 'gbadge flag', text: 'flagged', 'data-tip': flag.note || 'Flagged with no note' }) : null);
}

function drawGrid() {
  io.disconnect();
  shown = filterRows(state.rows, state.filter, state.flags).sort(SORTS[state.sort] || SORTS.slot);
  const grid = $('grid');
  grid.replaceChildren(...(shown.length ? shown.map(card) : [el('p', { class: 'muted', id: 'grid-empty', text: 'No model matches these filters.' })]));
  for (const c of grid.querySelectorAll('.gcard')) io.observe(c);
  $('count').textContent = `${shown.length} of ${state.rows.length} models`;
  $('flag-count').textContent = Object.keys(state.flags).length;
}

// ---------------------------------------------------------------- detail
let scene = null, actor = null, extract = null, alone = null, base = null, buildSeq = 0, loopTimer = 0, live = null;
const view = () => state.view;
const current = () => findRow(state.rows, state.id);

function ensureScene() {
  if (scene) return scene;
  scene = createScene($('stage'), { background: 0x1a1d23 });
  scene.controls.minDistance = 0.25; scene.controls.maxDistance = 9;
  scene.addTicker(dt => {
    if (!actor) return;
    const speed = Number(view().speed);
    actor.setRate(speed > 0 ? speed : 1); actor.update(speed > 0 ? dt : 0);     // paused still holds the pose it stopped on
    // a one-shot falls back to idle when it ends: play it again while "repeat" is on
    if ($('anim-loop').checked && view().anim !== 'idle' && actor.anim === 'idle' && motion.ONE_SHOTS.has(view().anim)) {
      loopTimer += dt; if (loopTimer > 0.45) { loopTimer = 0; actor.setAnim(view().anim, 0.1, true); }
    } else loopTimer = 0;
    drawLive();
  });
  return scene;
}

async function rebuild() {
  const row = current(); if (!row) return;
  const seq = ++buildSeq, v = view();
  ensureScene();
  $('stage').classList.add('busy');
  const bodyOpts = { race: v.race, height: v.height, build: v.build, hair: v.hair };
  const body = { ...baselineFor(row, bodyOpts), hair: mannequin(bodyOpts).hair };
  // measured against the same body, bald for headwear (see baselineFor); what is SHOWN keeps its hair
  const bare = await baseKeys(row.slot === 'hat' ? baselineFor(row, bodyOpts) : body);
  const hand = v.hand || defaultHand(row);
  const look = dress(body, row, { ...lookOpts(row, v), hand });
  let next;
  try { next = await createChibi2Character(look, { anims: ANIMS, v25: true }); }
  catch (e) { console.error(e); $('stage').classList.remove('busy'); $('stage-msg').textContent = 'Could not build this model: ' + e.message; return; }
  if (seq !== buildSeq) { next.dispose(); return; }
  if (actor) { scene.scene.remove(actor.group); actor.dispose(); }
  if (alone) { scene.scene.remove(alone); alone.userData.dispose(); alone = null; }
  extract?.dispose();
  actor = next; base = bare;
  // for headwear the shown body has hair, so measure a bald twin instead of the one on screen
  if (row.slot === 'hat' && v.hair !== 'none') {
    const twin = await createChibi2Character(dress(baselineFor(row, bodyOpts), row, { ...lookOpts(row, v), hand }), { anims: ['idle'], v25: true });
    extract = extractAdded(twin, bare.keys); live = summarise(row, extract, bare, twin, hand); twin.dispose();
  } else { extract = extractAdded(actor, bare.keys); live = summarise(row, extract, bare, actor, hand); }
  live.hand = hand; live.holds = holdsFor(row, hand);
  scene.scene.add(actor.group);
  actor.setAnim(ANIMS.includes(v.anim) ? v.anim : 'idle', 0, true);
  $('stage-msg').textContent = extract.triangles ? '' : 'This id adds no geometry to the body' + (hand === 'off' && row.slot === 'held' ? ' in the off hand.' : '.');
  applyAlone();
  $('stage').classList.remove('busy');
  drawStats(); drawHold();
  window.armory.ready = true; window.armory.builds = (window.armory.builds || 0) + 1;
}

/** The hold of each hand that carries something, for the readout and the left/right comparison. */
function holdsFor(row, hand) {
  if (!(row.slot === 'held' || row.slot === 'offhand') || !extract?.triangles) return [];
  const out = [];
  for (const [side, name] of [['R', 'Main hand'], ['L', 'Off hand']]) {
    if (side === 'R' && hand === 'off') continue;
    if (side === 'L' && hand === 'main' && !extract.bones.some(b => b.name.endsWith('L'))) continue;
    const carrier = extract.bones.find(b => b.name.endsWith(side) && /grip|hand|elbow/.test(b.name));
    if (!carrier) continue;
    const h = holdOf(extract, actor, carrier.name);
    if (h) out.push({ side, name, ...h });
  }
  return out;
}

function applyAlone() {
  const v = view(), on = v.alone === '1' || v.wire === '1';
  if (!actor || !extract) return;
  if (alone) { scene.scene.remove(alone); alone.userData.dispose(); alone = null; }
  actor.group.visible = !on;
  if (on && extract.triangles) {
    alone = staticModel(extract, { wireframe: v.wire === '1' }); alone.userData.character = true;
    scene.scene.add(alone);
    const c = extract.box.getCenter(new THREE.Vector3());
    scene.controls.target.copy(c); const d = Math.max(0.5, extract.size.length() * 1.9);
    scene.camera.position.set(c.x + d * 0.45, c.y + d * 0.15, c.z + d);
  }
  $('t-alone').classList.toggle('on', v.alone === '1'); $('t-wire').classList.toggle('on', v.wire === '1');
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
/** Degrees between a held item and the forearm that carries it, right now (0 = it continues the forearm). */
function tiltNow(h) {
  const parts = actor?.parts, bone = parts?.[h.bone], hand = parts?.['hand' + h.side], elbow = parts?.['elbow' + h.side];
  if (!bone || !hand || !elbow) return null;
  bone.getWorldQuaternion(_q); _d.copy(h.axisVector).applyQuaternion(_q).normalize();
  hand.getWorldPosition(_a); elbow.getWorldPosition(_b); _a.sub(_b).normalize();
  return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(_d.dot(_a), -1, 1)));
}
let liveTick = 0;
function drawLive() {
  if (!live?.holds?.length || ++liveTick % 6) return;
  for (const h of live.holds) { const cell = document.querySelector(`[data-tilt="${h.side}"]`); const t = tiltNow(h); if (cell && t != null) cell.textContent = Math.round(t) + '°'; }
}

function setCamera(preset) {
  if (!scene || !actor) return;
  const parts = actor.parts, H = actor.metrics().height, t = new THREE.Vector3(0, H * 0.5, 0);
  let dist = H * 2.7, yaw = 0.35, pitch = 0.12;
  if (preset === 'auto') {
    // Owner 2026-10-21: frame each item so the whole thing shows — from the side of the hand that holds it, at an
    // angle, further out for a two-hander; headwear close on the head; capes from behind; shoes low.
    const row = current(), hand = view().hand || defaultHand(row || {});
    if (row && (row.slot === 'held' || row.slot === 'offhand') && extract?.triangles) {
      const box = extract.box.clone().union(new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.2), new THREE.Vector3(0.3, H, 0.2)));
      box.getCenter(t); const size = box.getSize(new THREE.Vector3()).length();
      dist = Math.max(H * 1.9, size * 1.55) * (row.hands === 2 ? 1.2 : 1);
      yaw = hand === 'both' ? 0.45 : hand === 'off' ? -0.75 : 0.75; pitch = 0.16;
    } else if (row?.slot === 'hat' || row?.field === 'hat') { t.set(0, H * 0.8, 0); dist = H * 1.25; yaw = 0.55; pitch = 0.18; }
    else if (row?.slot === 'cape') { yaw = Math.PI - 0.55; pitch = 0.15; }
    else if (row?.slot === 'shoes') { t.set(0, H * 0.15, 0); dist = H * 1.3; yaw = 0.7; pitch = 0.3; }
    else yaw = 0.5;
  } else if (preset === 'item' && extract?.triangles) { extract.box.getCenter(t); dist = Math.max(0.6, extract.size.length() * 2.6); }
  else if (preset === 'handR' || preset === 'handL') { parts[preset]?.getWorldPosition(t); dist = 1.25; yaw = preset === 'handR' ? 0.9 : -0.9; pitch = 0.2; }
  else if (preset === 'back') yaw = Math.PI - 0.35;
  else if (preset === 'side') yaw = Math.PI / 2;
  scene.controls.target.copy(t);
  scene.camera.position.set(t.x + Math.sin(yaw) * Math.cos(pitch) * dist, t.y + Math.sin(pitch) * dist, t.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  scene.controls.update();
}

const row2 = (k, v, tip) => el('tr', {}, el('th', tip ? { 'data-tip': tip } : {}, k), el('td', {}, v));
function drawStats() {
  const row = current(); if (!row) return;
  const m = live || state.measured.get(row.key), box = $('stats');
  const source = row.file ? el('span', {}, el('code', { class: 'file', text: row.file }), row.builder ? el('span', {}, ' · ', el('code', { text: row.builder })) : null) : el('span', { class: 'muted', text: 'not stated in the catalog' });
  const rows = [
    row2('Part id', el('span', {}, el('code', { text: row.id }), ' ', el('span', { class: 'muted small', text: `avatar.${row.slot}${row.field ? '.' + row.field : ''}.id` }))),
    row2('Source', source, 'The file the model is built in, and the builder function or table key.'),
    row2('Kind', [label(KIND_LABEL, row.kind), label(SLOT_LABEL, row.gameSlot), row.type, row.archetype, row.hands ? (row.hands === 2 ? 'two-handed' : 'one-handed') : null, row.element, row.form ? row.form + ' attack' : null].filter(Boolean).join(' · ')),
  ];
  if (m) {
    const buckets = Object.entries(m.byBucket).map(([k, n]) => `${fmt(n)} ${k}`).join(' + ');
    rows.push(
      row2('Triangles', m.triangles ? `${fmt(m.triangles)} (${buckets})${live?.hand === 'both' ? ' — both hands together' : ''}` : 'none — this id draws nothing here', 'Counted by building the same body with and without the piece and keeping what is new. Cloth and metal are the two materials every Chibi 2 character has.'),
      row2('Vertices', fmt(m.vertices)),
      row2('Draw calls', m.addsMesh > 0 ? `+${m.addsMesh} (the body had no metal mesh until this piece)` : `none added — merged into the body (${m.meshes} meshes for the whole character)`, 'Chibi 2 gear is skinned into the body\'s own cloth and metal meshes, so a piece costs triangles but not a draw call.'),
      row2('Materials', el('span', {}, Object.keys(m.byBucket).join(', ') || '—', ' ', ...m.colours.map(c => el('span', { class: 'sw', style: { background: c }, 'data-tip': c })))),
      row2('Size', m.triangles ? sizeText(m.size) + (live?.hand === 'both' ? ' (the span of both)' : '') : '—', 'Bounding box in the rest pose, in metres. A body is about 1.2 m tall.'),
      row2('Carried by', m.bones.map(b => `${b.name} ${Math.round(b.share * 100)}%`).join(', ') || '—', 'The bones the piece is skinned to. A weapon rides a grip bone; a strapped shield rides the forearm (elbowL).'),
      row2('Whole body', `${fmt(m.wholeTriangles)} triangles with it on (${fmt(m.bodyTriangles)} without)`));
    if (m.hold) rows.push(row2('Grip offset', gripText(m.hold), 'Measured in the carrying bone\'s own space, where the palm is the origin and a handle should run along y.'));
  } else rows.push(row2('Model', el('span', { class: 'muted', text: 'measuring…' })));
  if (row.tags?.length) rows.push(row2('Tags', row.tags.join(', ')));
  box.replaceChildren(el('table', { class: 'kv' }, el('tbody', {}, ...rows)));
}
const gripText = h => `long axis ${h.axis}, ${metres(h.length)} long; the palm sits ${Math.round(h.palmAlong * 100)}% along it from the butt, ${cm(h.offAxis)} from the handle`;

function drawHold() {
  const row = current(), box = $('hold');
  const holds = live?.holds || [];
  if (!row || !holds.length) { box.hidden = true; return; }
  box.hidden = false;
  const notes = [];
  for (const h of holds) {
    const haft = row.kind === 'weapon' && !/bow|crossbow/.test(row.type || row.id);
    if (haft && h.axis !== 'y') notes.push(`${h.name}: the long axis runs along the hand's ${h.axis} axis instead of along the fist (y) — this is what "held sideways" looks like in numbers.`);
    if (haft && !h.palmOnItem) notes.push(`${h.name}: no part of the model is at the palm — the fist is closed on thin air.`);
    else if (haft && h.offAxis > 0.04) notes.push(`${h.name}: where the fist closes, the model is ${cm(h.offAxis)} away from the palm — it is not being held by its handle.`);
  }
  if (holds.length === 2) {
    const [r, l] = holds;
    const same = r.axis === l.axis && Math.abs(r.palmAlong - l.palmAlong) < 0.06 && Math.abs(r.offAxis - l.offAxis) < 0.015 && Math.abs(r.length - l.length) < 0.02;
    notes.unshift(same ? 'Both hands hold it the same way at rest. Watch the angle column while an attack plays: the two hands should mirror each other.' : 'The two hands hold it DIFFERENTLY at rest (compare the rows below).');
  }
  box.replaceChildren(
    el('h3', {}, 'How it is held'),
    el('table', { class: 'kv hold' },
      el('thead', {}, el('tr', {}, ...['Hand', 'Bone', 'Long axis', 'Length', 'Palm along it', 'Palm to handle', 'Angle to forearm (live)'].map(t => el('th', {}, t)))),
      el('tbody', {}, ...holds.map(h => el('tr', { 'data-hold': h.side },
        el('td', {}, h.name), el('td', {}, el('code', { text: h.bone })), el('td', { class: h.axis === 'y' ? '' : 'warn' }, h.axis), el('td', {}, metres(h.length)),
        el('td', {}, Math.round(h.palmAlong * 100) + '%'), el('td', { class: h.offAxis > 0.04 ? 'warn' : '' }, cm(h.offAxis)), el('td', { 'data-tilt': h.side }, '—'))))),
    ...notes.map(n => el('p', { class: 'small note', text: n })));
}

function drawItems() {
  const row = current(), box = $('items'); if (!row) return;
  const list = itemRows(row, state.itemData);
  box.replaceChildren(
    el('h3', {}, 'Games and items'),
    el('p', {}, row.games.length ? el('span', {}, 'Drawn by ', ...row.games.flatMap((g, i) => [i ? ', ' : '', el('b', { text: label(GAME_LABEL, g) })]), '.') : el('span', { class: 'muted', text: 'No game is recorded as using this model.' })),
    list.length ? el('table', { class: 'kv' },
      el('thead', {}, el('tr', {}, ...['Game', 'Item base', 'Name', 'What it is'].map(t => el('th', {}, t)))),
      el('tbody', {}, ...list.map(i => el('tr', {}, el('td', {}, label(GAME_LABEL, i.game)), el('td', {}, el('code', { text: i.base })), el('td', {}, i.name),
        el('td', { class: i.known ? '' : 'muted' }, i.known ? i.detail : 'not in the shared item file (added by the game when it loads)')))))
      : el('p', { class: 'muted small', text: 'No in-game item is mapped to this model.' }));
}

// ---- icon: Thousandvale's own module when it loads, the Armory's render otherwise
let iconApi;
function loadIconApi() {
  if (iconApi === undefined) {
    iconApi = import('../../prototypes/thousandvale/js/client/ui/item-icons.js').then(async m => { m.iconsActive(true, 'armory'); await m.loadLooks(); m.onIcon(() => drawIcon()); return m; }).catch(e => { console.warn('[armory] Thousandvale icon module did not load:', e.message); return null; });
  }
  return iconApi;
}
async function drawIcon() {
  const row = current(), box = $('icon'); if (!row) return;
  const api = await loadIconApi();
  if (row !== current()) return;
  let item = iconItem(row, state.itemData), synthetic = false;
  if (!item && (row.slot === 'held' || row.slot === 'offhand')) {
    synthetic = true;
    item = { type: row.slot === 'held' ? 'weapon' : 'armor', slot: row.slot === 'held' ? 'weapon' : 'offhand', subtype: row.type, baseKey: row.base || row.id, name: row.name, rarity: 'normal', twoHanded: row.hands === 2,
      look: { held: row.slot === 'held' ? row.id : undefined, offhand: row.slot === 'offhand' ? row.id : undefined, g5: row.id, color: row.color } };
  }
  const tiles = (src, cls = '') => [96, 48].map(px => el('span', { class: 'slot-tile ' + cls, style: { width: px + 12 + 'px', height: px + 12 + 'px' } }, src ? el('img', { src, width: px, height: px, alt: 'icon at ' + px + ' px' }) : el('span', { class: 'muted small', text: '…' })));
  const own = thumbs.get(row.key);
  if (api && item) {
    const spec = api.specFor(item), url = api.iconFor(item);
    const differs = spec && spec.kind !== 'glyph' && spec.id !== row.id;
    box.replaceChildren(el('h3', {}, 'Icon'),
      el('div', { class: 'icon-row', 'data-source': 'thousandvale' }, ...tiles(url)),
      el('p', { class: 'small', text: `Drawn by Thousandvale's own icon code (prototypes/thousandvale/js/client/ui/item-icons.js) for ${synthetic ? 'an item whose look names this model' : `a plain "${item.name}"`}: ${spec ? `${spec.kind} picture of model "${spec.id}"` : 'no picture'}.` }),
      differs ? el('p', { class: 'small note', text: `The bag icon shows a different model ("${spec.id}") than the one the character wears ("${row.id}").` }) : null);
  } else {
    box.replaceChildren(el('h3', {}, 'Icon'),
      el('div', { class: 'icon-row', 'data-source': 'armory' }, ...tiles(own)),
      el('p', { class: 'small muted', text: (api ? 'No Thousandvale item is mapped to this model, so there is no game icon to show. ' : 'Thousandvale\'s icon code could not be loaded here. ') + 'This is the Armory\'s own picture in the same framing (item alone at 26° field of view, or the body part it sits on).' }));
    if (!own) thumbs.request(row.key, thumbJob(row)).then(() => { if (row === current()) drawIcon(); }).catch(() => {});
  }
}

function drawFlag() {
  const row = current(); if (!row) return;
  const f = state.flags[row.key];
  $('flag-note').value = f?.note || '';
  $('flag-btn').textContent = f ? 'Update note' : 'Flag this model';
  $('unflag-btn').hidden = !f;
  $('flag-state').textContent = f ? 'Flagged ' + (f.at || '').slice(0, 10) : '';
}
function saveFlags() { store.set('flags', state.flags); $('flag-count').textContent = Object.keys(state.flags).length; }

function drawControls() {
  const row = current(), v = view(); if (!row) return;
  const modes = handModes(row), hand = v.hand || defaultHand(row);
  $('hands').hidden = !modes.length;
  $('hands').replaceChildren(el('span', { class: 'lbl', text: 'Hand' }), ...[['main', 'Main hand'], ['off', 'Off hand'], ['both', 'Both hands']].map(([id, text]) =>
    el('button', { type: 'button', class: 'seg' + (hand === id ? ' on' : ''), 'data-hand': id, disabled: modes.includes(id) ? null : '', text, onclick: () => { v.hand = id; if (id === 'both' && bothClip(row)) v.anim = bothClip(row); else if (id !== 'both' && (ANIM_GROUPS['Dual wield'] || []).includes(v.anim)) v.anim = 'idle'; update({ build: true, reframe: true }); } })));
  $('anim').value = ANIMS.includes(v.anim) ? v.anim : 'idle';
  for (const [id, key] of [['race', 'race'], ['height', 'height'], ['build', 'build'], ['hair', 'hair'], ['quality', 'quality'], ['speed', 'speed']]) $(id).value = v[key];
  $('quality-row').hidden = !(row.slot === 'held' || row.slot === 'offhand');
}

function drawHead() {
  const row = current(); if (!row) return;
  $('d-name').textContent = row.name;
  $('d-id').textContent = row.id;
  $('d-badges').replaceChildren(...[label(KIND_LABEL, row.kind), label(SLOT_LABEL, row.gameSlot), row.type, row.archetype, row.hands ? row.hands + '-handed' : null].filter(Boolean).map(t => el('span', { class: 'badge', text: t })),
    ...(row.isNew ? [el('span', { class: 'badge new', text: 'New this round' })] : []));
  const i = shown.findIndex(r => r.key === row.key);
  $('d-pos').textContent = i >= 0 ? `${i + 1} / ${shown.length}` : '';
}

/** Open a model (or close with ''). */
function select(key, { scroll = false } = {}) {
  state.id = key; live = null;
  const row = current();
  document.body.classList.toggle('has-detail', !!row);
  $('detail').hidden = !row;
  for (const c of document.querySelectorAll('.gcard')) c.classList.toggle('on', c.dataset.key === key);
  if (!row) { writeHash(); window.armory.ready = false; return; }
  if (!handModes(row).includes(view().hand)) view().hand = '';
  // a link that asks for both hands and names no clip opens on the pair's own attack
  if (view().hand === 'both' && view().anim === 'idle' && !/[#&]anim=/.test(location.hash) && bothClip(row)) view().anim = bothClip(row);
  window.armory.ready = false;
  drawHead(); drawControls(); drawStats(); drawHold(); drawItems(); drawFlag(); drawIcon();
  rebuild().then(() => { if (state.id !== key) return; if (autoCam()) setCamera('auto'); else if (!camSet.has('once')) { setCamera('body'); camSet.add('once'); } });
  writeHash();
  if (scroll) document.querySelector(`.gcard[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center' });
}
const camSet = new Set();
/** "Auto adjust camera" (on unless turned off; remembered in this browser). */
const autoCam = () => $('auto-cam')?.checked !== false;

function update({ build = false, reframe = false } = {}) { drawControls(); writeHash(); if (build) rebuild().then(() => { if (reframe && autoCam()) setCamera('auto'); }); }
function writeHash() { const h = formatHash(state); if (h !== location.hash) history.replaceState(null, '', h || location.pathname + location.search); }
function refresh() { drawFilters(); drawGrid(); drawHead(); writeHash(); }
function step(d) { const i = shown.findIndex(r => r.key === state.id); const next = shown[(i + d + shown.length) % shown.length]; if (next) select(next.key, { scroll: true }); }

// ---------------------------------------------------------------- wiring
function wire() {
  $('search').value = state.filter.q;
  $('search').addEventListener('input', () => { state.filter.q = $('search').value; refresh(); });
  $('sort').value = state.sort; $('sort').addEventListener('change', () => { state.sort = $('sort').value; refresh(); });
  $('anim').replaceChildren(...Object.entries(ANIM_GROUPS).map(([g, names]) => el('optgroup', { label: g }, ...names.filter(n => ANIMS.includes(n)).map(n => el('option', { value: n, text: n })))));
  $('anim').addEventListener('change', () => { view().anim = $('anim').value; actor?.setAnim(view().anim, 0.12, true); writeHash(); });
  $('anim-replay').addEventListener('click', () => actor?.setAnim(view().anim, 0.05, true));
  $('anim-next').addEventListener('click', () => { const list = ANIMS.filter(n => ATTACKS.has(n)); const i = list.indexOf(view().anim); view().anim = list[(i + 1) % list.length]; $('anim').value = view().anim; actor?.setAnim(view().anim, 0.05, true); writeHash(); });
  $('race').replaceChildren(...CHIBI2_RACE_IDS.map(id => el('option', { value: id, text: CHIBI2_RACES[id].name })));
  $('height').replaceChildren(...Object.keys(HEIGHTS).map(k => el('option', { value: k, text: k })));
  $('build').replaceChildren(...Object.keys(BUILDS).map(k => el('option', { value: k, text: k })));
  $('hair').replaceChildren(...HAIR.map(k => el('option', { value: k, text: k })));
  for (const id of ['race', 'height', 'build', 'hair', 'quality']) $(id).addEventListener('change', () => { view()[id] = $(id).value; update({ build: true }); });
  $('speed').addEventListener('change', () => { view().speed = $('speed').value; writeHash(); });
  for (const b of document.querySelectorAll('[data-cam]')) b.addEventListener('click', () => setCamera(b.dataset.cam));
  try { $('auto-cam').checked = localStorage.getItem('armory.autoCam') !== '0'; } catch { /* private window: stays on */ }
  $('auto-cam').addEventListener('change', () => { try { localStorage.setItem('armory.autoCam', $('auto-cam').checked ? '1' : '0'); } catch { /* ignore */ } if ($('auto-cam').checked) setCamera('auto'); });
  $('t-alone').addEventListener('click', () => { const v = view(); v.alone = v.alone === '1' ? '' : '1'; if (v.alone !== '1') v.wire = ''; applyAlone(); if (v.alone !== '1') setCamera('body'); writeHash(); });
  $('t-wire').addEventListener('click', () => { const v = view(); v.wire = v.wire === '1' ? '' : '1'; applyAlone(); if (v.wire !== '1' && v.alone !== '1') setCamera('body'); writeHash(); });
  $('t-spin').addEventListener('click', () => { const on = $('t-spin').classList.toggle('on'); scene?.setTurntable(on ? 0.8 : 0); });
  $('d-close').addEventListener('click', () => select(''));
  $('d-prev').addEventListener('click', () => step(-1)); $('d-next').addEventListener('click', () => step(1));
  $('d-link').addEventListener('click', async () => { await copyText(location.href); toast('Link copied'); });
  $('flag-btn').addEventListener('click', () => { const row = current(); state.flags[row.key] = { note: $('flag-note').value.trim(), at: new Date().toISOString(), view: { hand: view().hand, anim: view().anim, race: view().race } }; saveFlags(); drawFlag(); drawFilters(); drawGrid(); toast('Flagged ' + row.id); });
  $('unflag-btn').addEventListener('click', () => { delete state.flags[current().key]; saveFlags(); drawFlag(); drawFilters(); drawGrid(); });
  $('flags-export').addEventListener('click', () => { const out = exportFlags(state.flags, state.rows, { page: location.origin + location.pathname }); if (!out.count) return toast('Nothing is flagged yet'); downloadJSON(out, 'armory-flags.json'); });
  $('flags-copy').addEventListener('click', async () => { const out = exportFlags(state.flags, state.rows, { page: location.origin + location.pathname }); if (!out.count) return toast('Nothing is flagged yet'); await copyText(JSON.stringify(out, null, 2)); toast(`Copied ${out.count} flag${out.count === 1 ? '' : 's'} as JSON`); });
  $('filters-toggle').addEventListener('click', () => document.body.classList.toggle('filters-open'));
  addEventListener('keydown', e => {
    if (!current() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'Escape') select('');
  });
  addEventListener('hashchange', () => {
    const next = parseHash(location.hash), was = state.id;
    Object.assign(state, { filter: next.filter, view: next.view, sort: next.sort });
    $('search').value = state.filter.q; drawFilters(); drawGrid();
    if (next.id !== was || next.id) select(findRow(state.rows, next.id)?.key || '');
  });
}

async function main() {
  window.armory = { state, thumbs, ready: false, get live() { return live; }, get actor() { return actor; }, select, exportFlags: () => exportFlags(state.flags, state.rows), shown: () => shown };
  const [src, itemData] = await Promise.all([
    loadRows(),
    fetch(new URL('../../prototypes/emberveil/data/items.json', import.meta.url)).then(r => r.json()).catch(() => null),
  ]);
  Object.assign(state, { rows: src.rows, lookFor: src.lookFor, origin: src.origin, itemData });
  $('origin').textContent = 'Source: ' + src.note;
  wire(); drawFilters(); drawGrid();
  const first = findRow(state.rows, state.id);
  if (state.id && !first) toast(`No model with the id "${state.id}"`);
  select(first?.key || '', { scroll: true });
  window.armory.loaded = true;
}
main().catch(e => { console.error(e); $('count').textContent = 'The Armory could not start: ' + e.message; });
