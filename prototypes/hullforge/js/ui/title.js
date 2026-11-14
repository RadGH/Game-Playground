// Title screen (a menu over a live scene: a station and ships drifting by), the New game screen (one job: pick a
// starter, name it, paint it — with the real 3D ship turning beside the form) and the Load screen.

import * as THREE from 'three';
import { $, el, btn, panel, num, credits as cr } from './dom.js';
import { newGame, load, slotInfo, lastSlot, SLOTS, deleteSlot, designGrid } from '../sim/state.js';
import { STARTERS, buildStarter, generateShip, generateStation } from '../sim/shipgen.js';
import { generateGalaxy, sunOf } from '../sim/galaxy.js';
import { computeStats } from '../sim/stats.js';
import { makeItem } from '../sim/items.js';
import { PAINTS } from '../data/blocks.js';
import { buildModel } from '../render/views.js';
import { buildSky } from '../render/sky.js';
import { animateTurret } from '../render/turrets.js';
import { ask } from '../../../../shared/dialog.js';
import { createWhatsNew } from '../../../../shared/whats-new.js';
import { createCredits } from '../../../../shared/credits.js';

let scene3d = null;
export const news = createWhatsNew({ url: new URL('../../data/changelog.json', import.meta.url), key: 'hullforge' });
export const creditsBox = createCredits({ game: 'hullforge', made: 'Hullforge — made by Radley Sustaire with Claude.' });

/** The title backdrop: a station, a couple of passing ships, slow camera. */
function buildTitleScene(app) {
  const root = new THREE.Group(); app.scene.add(root);
  const gal = generateGalaxy(7); const sys = gal.systems[3];
  const sky = buildSky(app.scene, sys, sunOf(sys));
  app.sunLight.position.copy(sky.sunDir).multiplyScalar(100); app.sunLight.color.set(sunOf(sys).light);
  app.fillLight.position.copy(sky.sunDir).multiplyScalar(-100);
  const st = buildModel(generateStation(sys.seed)); st.position.set(-40, -10, -120); root.add(st);
  const ships = [];
  for (let i = 0; i < 4; i++) {
    const m = buildModel(generateShip(100 + i * 17, { danger: 1 + i, faction: i === 2 ? 'swarm' : 'navy' }).grid, { faction: i === 2 ? 'swarm' : null });
    root.add(m); ships.push({ m, phase: i * 1.7, lane: i });
  }
  const state = { t: 0 };
  app.titleScene = (dt, now) => {
    state.t += dt;
    const cam = app.camera;
    cam.position.set(Math.sin(state.t * 0.03) * 25 + 30, 8 + Math.sin(state.t * 0.05) * 4, 30);
    cam.up.set(0, 1, 0); cam.lookAt(-10, 0, -60);
    st.rotation.y = state.t * 0.03;
    ships.forEach((s, i) => {
      const k = ((state.t * (0.018 + i * 0.004) + s.phase) % 1);
      s.m.position.set(-160 + k * 320, -8 + i * 9, -60 - i * 28);
      s.m.rotation.set(0, Math.PI / 2, Math.sin(state.t * 0.4 + i) * 0.12);
      for (const T of s.m.userData.turrets) animateTurret(T, { yaw: Math.sin(now * 0.3 + i) * 1.2, pitch: 0.2, firing: false }, dt, now);
    });
    sky.root.position.copy(cam.position);
  };
  scene3d = { root, sky };
}
function dropTitleScene(app) { if (!scene3d) return; app.scene.remove(scene3d.root); scene3d.sky.dispose(); scene3d = null; app.titleScene = null; }

export function showTitle(app) {
  app.mode = 'title';
  for (const p of [...$('#panels').children]) p.remove();
  $('#hud').classList.add('hidden');
  if (!scene3d) buildTitleScene(app);
  const t = $('#title'); t.classList.remove('hidden');
  const B = $('#title-buttons'); B.replaceChildren();
  const last = lastSlot(); const info = last != null ? slotInfo(last) : null;
  if (info) B.append(btn(`Continue — ${info.shipName}`, () => startFrom(app, load(last)), 'primary'));
  B.append(btn('New game', () => openNewGame(app), info ? '' : 'primary'));
  if ([...Array(SLOTS).keys()].some(i => slotInfo(i))) B.append(btn('Load game', () => openLoad(app)));
  B.append(btn('Controls', () => app.openControls?.()), btn('Settings', () => app.openSettings?.()));
  const X = $('#title-extra'); X.replaceChildren();
  X.append(news.button(), creditsBox.button());
  import('../../../../shared/rgs-signin.js').then(({ accountButton }) => { X.append(accountButton({ game: 'hullforge', gameName: 'Hullforge' })); }).catch(() => {});
}
function startFrom(app, G) {
  if (!G) return;
  dropTitleScene(app);
  $('#title').classList.add('hidden');
  app.startGame(G);
}

// ------------------------------------------------------------------ new game
function openNewGame(app) {
  $('#title').classList.add('hidden');
  const choice = { starter: 'wasp', paint: 0, accent: 2, captain: 'Captain', shipName: '', slot: firstFreeSlot() };
  const P = panel('New game', () => { stopPreview(); showTitle(app); }, { cls: 'see-through', closeLabel: 'Back' });
  const wrap = el('div', { class: 'newgame' }); P.body.append(wrap);
  const left = el('div', { class: 'left' }); wrap.append(left, el('div'));
  // preview: the real ship model turning in the right half of the screen
  let model = null; const items = [];
  const mk = (k, t, r) => { const it = makeItem(k, t, r); items.push(it); return it; };
  function preview() {
    if (model) { app.scene.remove(model); model.userData.dispose?.(); }
    const g = buildStarter(choice.starter, mk, choice.paint, choice.accent);
    model = buildModel(g); app.scene.add(model);
    const st = computeStats(g);
    stats.replaceChildren(...[['Blocks', num(st.blocks)], ['Top speed', `${num(st.maxSpeed)} m/s`], ['Turning', `${num(st.turn * 57.3)}° per second`], ['Hull', num(st.maxHp)], ['Shield', st.shield ? num(st.shield) : 'none'], ['Turrets', num(st.turrets.length)], ['Damage per second', num(st.dps)], ['Ore room', num(st.cargo)]].flatMap(([a, b]) => [el('span', {}, a), el('b', {}, b)]));
  }
  const prev = app.titleScene;
  app.titleScene = (dt, now) => {
    prev?.(dt, now);
    if (!model) return;
    const cam = app.camera; const s = model.userData.size || 8;
    const dist = s * 2.2 + 6; const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
    const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist * cam.aspect;
    model.position.copy(cam.position).addScaledVector(fwd, dist).addScaledVector(right, half * 0.42);
    model.rotation.set(0.35, now * 0.4, 0);
    for (const T of model.userData.turrets) animateTurret(T, { yaw: Math.sin(now * 0.8) * 1.4, pitch: 0.3 + Math.sin(now * 0.6) * 0.25, firing: true, beam: Math.sin(now * 2) > 0.6, charge: (now % 1.5) / 1.5, target: true }, dt, now);
  };
  function stopPreview() { if (model) { app.scene.remove(model); model.userData.dispose?.(); model = null; } app.titleScene = prev; }

  left.append(el('h3', {}, 'Pick your first ship'));
  const starters = el('div', { class: 'col' });
  const drawStarters = () => starters.replaceChildren(...STARTERS.map(s => {
    const b = btn('', () => { choice.starter = s.id; drawStarters(); preview(); }, 'starter' + (choice.starter === s.id ? ' on' : ''));
    b.append(el('b', {}, `${s.name} · ${s.role}`), el('small', {}, s.blurb)); return b;
  }));
  drawStarters(); left.append(starters);
  const stats = el('div', { class: 'kv section' }); left.append(stats);
  const paints = (label, key) => {
    const row = el('div', { class: 'paints' });
    const draw = () => row.replaceChildren(...PAINTS.map((p, i) => { const b = btn('', () => { choice[key] = i; draw(); preview(); }, choice[key] === i ? 'on' : '', { 'aria-label': p.name, 'data-tip': p.name }); b.style.background = p.color; return b; }));
    draw(); return el('div', { class: 'field' }, el('label', {}, label), row);
  };
  left.append(paints('Hull paint', 'paint'), paints('Stripe paint', 'accent'));
  const cap = el('input', { type: 'text', value: choice.captain, maxlength: 24 });
  const nm = el('input', { type: 'text', placeholder: 'Name your ship', maxlength: 24 });
  left.append(el('div', { class: 'field' }, el('label', {}, 'Captain'), cap), el('div', { class: 'field' }, el('label', {}, 'Ship name'), nm));
  const slotRow = el('div', { class: 'seg' });
  const drawSlots = () => slotRow.replaceChildren(...[...Array(SLOTS).keys()].map(i => { const inf = slotInfo(i); return btn(`Slot ${i + 1}${inf ? ' (used)' : ''}`, () => { choice.slot = i; drawSlots(); }, choice.slot === i ? 'on' : ''); }));
  drawSlots(); left.append(el('div', { class: 'field' }, el('label', {}, 'Save slot'), slotRow));
  left.append(btn('Start', async () => {
    if (slotInfo(choice.slot) && !(await ask({ title: 'Replace this save?', text: `Slot ${choice.slot + 1} already holds ${slotInfo(choice.slot).shipName}. Starting here replaces it.`, ok: 'Replace', danger: true }))) return;
    const G = newGame({ slot: choice.slot, starter: choice.starter, captain: cap.value.trim() || 'Captain', shipName: nm.value.trim() || STARTERS.find(s => s.id === choice.starter).name, paint: choice.paint, accent: choice.accent });
    stopPreview(); P.root.remove(); startFrom(app, G);
  }, 'primary'));
  preview();
}
function firstFreeSlot() { for (let i = 0; i < SLOTS; i++) if (!slotInfo(i)) return i; return 0; }

// ------------------------------------------------------------------ load
function openLoad(app) {
  $('#title').classList.add('hidden');
  const P = panel('Load game', () => showTitle(app), { closeLabel: 'Back' });
  const draw = () => {
    P.body.replaceChildren();
    const list = el('div', { class: 'col', style: 'max-width:620px' }); P.body.append(list);
    for (let i = 0; i < SLOTS; i++) {
      const inf = slotInfo(i);
      if (!inf) { list.append(el('div', { class: 'card dim' }, `Slot ${i + 1} — empty`)); continue; }
      const mins = Math.round((inf.playTime || 0) / 60);
      const b = btn('', () => { P.root.remove(); startFrom(app, load(i)); }, 'slot-btn');
      b.append(el('span', {}, el('b', {}, `${inf.shipName}`), el('br'), el('small', {}, `Captain ${inf.captain} · ${num(inf.blocks)} blocks · ${cr(inf.credits)}`)), el('small', {}, `${num(mins)} min played`));
      list.append(el('div', { class: 'row' }, el('div', { class: 'grow' }, b), btn('Delete', async () => { if (await ask({ title: 'Delete this save?', text: `${inf.shipName} will be gone for good.`, ok: 'Delete', danger: true })) { deleteSlot(i); draw(); } }, 'danger small')));
    }
  };
  draw();
}
export { openNewGame };
