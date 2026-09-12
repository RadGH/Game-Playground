// Spell FX gallery: two chibi bodies on a stage, every element thrown between them, every status
// aura toggled on either body, and a "play everything" run that fires the whole catalogue in order.
// `window.spellfxDemo` is the same API the Playwright spec drives.
import * as THREE from 'three';
import { el, button, select, checkbox, panel, toast } from '../../shared/ui.js';
import { createScene } from './scene.js';
import { createMiiCharacter } from './mii.js';
import { Assets } from '../../assets/js/assets.js';
import { SpellFx, ELEMENTS, STATUS_FX } from './spellfx.js';

const statusEl = document.getElementById('status');
const setStatus = t => { statusEl.textContent = t; };

// ---- stage ------------------------------------------------------------------------------------
const main = document.getElementById('main');
const viewport = el('div', { id: 'viewport' });
viewport.append(el('div', { class: 'overlay', text: 'drag to orbit · wheel to zoom' }));
const quick = el('div', { class: 'row' });
main.append(el('div', { class: 'panel' }, viewport, quick));

const scene = createScene(viewport, { background: 0x191c22, ground: true });
scene.camera.position.set(0, 1.5, 5.4);
scene.controls.target.set(0, 0.85, 0);
scene.controls.update();

const assets = await Assets.open('../assets/');
const textures = await assets.fxTextures(THREE, { size: 128 });
const fx = new SpellFx(scene.scene, { textures, camera: scene.camera });
// kept in a variable so the demo can freeze the effects (but keep rendering) and step them by hand —
// that is how the screenshot tools catch a burst at its peak.
const fxTicker = dt => fx.update(dt);
scene.addTicker(fxTicker);

const AVATARS = {
  a: { body: { skin: '#c68642', height: 0.55, width: 0.5 }, hair: { id: 'short', color: '#3a2a1a' }, top: { id: 'tunic', color: '#3f6fa8' } },
  b: { body: { skin: '#8d5524', height: 0.5, width: 0.55 }, hair: { id: 'long', color: '#1c1c22' }, top: { id: 'robe', color: '#6a3f8a' } },
};
const bodies = {};
async function buildBody(key, x) {
  const ctrl = await createMiiCharacter(AVATARS[key]);
  ctrl.group.position.set(x, 0, 0);
  ctrl.group.rotation.y = x < 0 ? 0.85 : -0.85;
  ctrl.group.userData.fxHeight = ctrl.metrics().totalHeight;
  scene.scene.add(ctrl.group);
  scene.addTicker((dt, t) => ctrl.update(dt, t));
  bodies[key] = ctrl;
  return ctrl;
}
await buildBody('a', -1.25);
await buildBody('b', 1.25);

/** Chest height of a body in world space — where a spell leaves from and lands. */
function chestOf(key) {
  const c = bodies[key];
  const h = c?.group?.userData?.fxHeight || 1.1;
  const p = new THREE.Vector3();
  c.group.getWorldPosition(p);
  p.y += h * 0.62;
  return p;
}
function feetOf(key) { const p = new THREE.Vector3(); bodies[key].group.getWorldPosition(p); return p; }

// ---- actions ----------------------------------------------------------------------------------
let element = 'fire';
let crit = false;
let caster = 'a';
const other = () => (caster === 'a' ? 'b' : 'a');

async function doCast() { await fx.cast({ at: feetOf(caster), element }); }
async function doProjectile() {
  const from = chestOf(caster), to = chestOf(other());
  await fx.projectile({ from, to, element, crit });
  fx.impact({ at: to, element, crit });
}
function doImpact() { fx.impact({ at: chestOf(other()), element, crit }); }
function doHeal() { fx.heal({ at: feetOf(caster) }); }
function doRevive() { fx.revive({ at: feetOf(other()) }); }
function doAoe(id = element) { fx.aoe({ points: [chestOf('b'), chestOf('b').add(new THREE.Vector3(0.6, -0.2, 0.4)), chestOf('b').add(new THREE.Vector3(-0.5, -0.1, -0.5))], element: id, crit }); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
let running = false;
/** Fire every element (cast → projectile → impact), then every status aura on body B. */
async function runAll({ perElement = 520, perStatus = 700 } = {}) {
  if (running) return; running = true;
  try {
    for (const id of Object.keys(ELEMENTS)) {
      element = id; syncElement();
      setStatus('element: ' + ELEMENTS[id].label);
      fx.cast({ at: feetOf(caster), element: id });
      const from = chestOf(caster), to = chestOf(other());
      await fx.projectile({ from, to, element: id });
      fx.impact({ at: to, element: id, crit: id === 'fire' });
      await sleep(perElement);
    }
    fx.heal({ at: feetOf('a') }); await sleep(500);
    fx.revive({ at: feetOf('b') }); await sleep(600);
    for (const type of Object.keys(STATUS_FX)) {
      setStatus('status: ' + STATUS_FX[type].label);
      fx.status(bodies.b.group, type, true);
      await sleep(perStatus);
      fx.status(bodies.b.group, type, false);
    }
    setStatus('done');
  } finally { running = false; syncStatusBoxes(); }
}

// ---- left: element + one-shot buttons -----------------------------------------------------------
const left = document.getElementById('left');
const elemChips = el('div', { class: 'chips' });
function syncElement() {
  elemChips.replaceChildren(...Object.entries(ELEMENTS).map(([id, E]) => el('span', {
    class: 'chip' + (element === id ? ' on' : ''), text: E.label,
    onclick: () => { element = id; syncElement(); },
  })));
}
syncElement();
const critBox = checkbox('Critical (bigger burst + extra ring)', false, v => { crit = v; });
const casterSel = select('Caster', [{ value: 'a', label: 'Left body' }, { value: 'b', label: 'Right body' }], 'a', v => { caster = v; });
left.append(
  panel('Element', elemChips, el('p', { class: 'small muted', html: 'Each element has its own projectile body, trail and impact burst — see <code>ELEMENTS</code> in <code>js/spellfx.js</code>.' }), critBox, casterSel),
  panel('Play',
    el('div', { class: 'row' }, button('Cast flash', () => doCast(), 'small'), button('Projectile →', () => doProjectile(), 'primary'), button('Impact', () => doImpact(), 'small')),
    el('div', { class: 'row' }, button('Heal', () => doHeal(), 'small'), button('Revive', () => doRevive(), 'small'), button('Zone (3 hits)', () => doAoe(), 'small')),
    el('div', { class: 'row' }, button('▶ Play everything', () => runAll(), 'primary')),
    el('p', { class: 'small muted', text: 'Projectile flight is capped at 450 ms so a fight stays readable.' })),
);

quick.append(
  el('label', { text: 'Quick' }),
  ...['fire', 'ice', 'lightning', 'shadow', 'holy', 'nature', 'arcane', 'physical'].map(id =>
    button(ELEMENTS[id].label, async () => { element = id; syncElement(); await doProjectile(); }, 'small')),
  button('Clear statuses', () => { for (const k of Object.keys(bodies)) fx.clearStatuses(bodies[k].group); syncStatusBoxes(); }, 'small'),
);

// ---- right: status toggles ------------------------------------------------------------------------
const right = document.getElementById('right');
const boxes = { a: new Map(), b: new Map() };
function statusPanel(key, title) {
  const wrap = el('div');
  for (const [type, S] of Object.entries(STATUS_FX)) {
    const cb = checkbox(S.label + ' (' + type + ')', false, v => { fx.status(bodies[key].group, type, v); });
    boxes[key].set(type, cb);
    wrap.append(cb);
  }
  return panel(title, el('p', { class: 'small muted', text: 'Auras are parented to the body, so they follow it around the stage.' }), wrap,
    el('div', { class: 'row' }, button('Clear all', () => { fx.clearStatuses(bodies[key].group); syncStatusBoxes(); }, 'small')));
}
function syncStatusBoxes() {
  for (const key of ['a', 'b']) {
    const on = new Set(fx.statusesOn(bodies[key].group));
    for (const [type, cb] of boxes[key]) cb.set(on.has(type));
  }
}
right.append(statusPanel('a', 'Statuses · left body'), statusPanel('b', 'Statuses · right body'));

// ---- ready ------------------------------------------------------------------------------------
setStatus(`${Object.keys(ELEMENTS).length} elements · ${Object.keys(STATUS_FX).length} statuses · ${Object.keys(textures).length} sprites`);
document.body.dataset.ready = '1';

window.spellfxDemo = {
  fx, scene, bodies, THREE,
  elements: Object.keys(ELEMENTS),
  statuses: Object.keys(STATUS_FX),
  get element() { return element; },
  setElement(id) { element = id; syncElement(); },
  cast: (id = element) => fx.cast({ at: feetOf(caster), element: id }),
  projectile: (id = element, c = false) => fx.projectile({ from: chestOf(caster), to: chestOf(other()), element: id, crit: c }),
  impact: (id = element, c = false) => fx.impact({ at: chestOf(other()), element: id, crit: c }),
  heal: () => fx.heal({ at: feetOf('a') }),
  revive: () => fx.revive({ at: feetOf('b') }),
  aoe: (id = element) => doAoe(id),
  status: (who, type, on) => fx.status(bodies[who].group, type, on),
  clearStatuses: who => fx.clearStatuses(bodies[who].group),
  statusesOn: who => fx.statusesOn(bodies[who].group),
  freeze: () => scene.removeTicker(fxTicker),
  unfreeze: () => scene.addTicker(fxTicker),
  step: (sec = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) fx.update(sec); },
  liveCount: () => fx.liveCount,
  fxChildren: () => fx.root.children.length,
  sceneChildren: () => scene.scene.children.length,
  chestOf, feetOf,
  runAll,
  toast,
};
