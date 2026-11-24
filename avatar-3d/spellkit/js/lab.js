// Spell Lab — review page for the Spell Kit: a Tabard caster, three training dummies on bumpy ground (so ground
// decals visibly drape over hills), every visual in prototypes/oathwild/data/spell-visuals.json, phase by phase.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSpellKit } from './spellkit.js';
import { ELEMENT_PALETTE, elementName } from '../../js/spellfx.js';
import { fmt } from '../../../shared/format.js';

const Q = new URLSearchParams(location.search);
const BARE = Q.has('bare');
const VISUALS_URL = new URL('../../../prototypes/oathwild/data/spell-visuals.json', import.meta.url);
const NAMES_URL = new URL('../data/oathwild-spells.json', import.meta.url);
const $ = id => document.getElementById(id);
const lab = window.__lab = { ready: false, errors: [], events: [] };
addEventListener('error', e => lab.errors.push(String(e.message)));
addEventListener('unhandledrejection', e => lab.errors.push(String(e.reason?.message || e.reason)));

// ---------------------------------------------------------------------------------------------- the ground
/** bumpy ground: rolling hills + a mound under the far dummies (decals must drape over it) */
export function heightAt(x, z) {
  return 0.32 * Math.sin(x * 0.45) * Math.cos(z * 0.38) + 0.16 * Math.sin(x * 1.1 + z * 0.7)
    + 0.55 * Math.exp(-((x - 1.5) ** 2 + (z - 7.5) ** 2) / 7) - 0.25 * Math.exp(-((x + 3) ** 2 + (z - 3) ** 2) / 4);
}

const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2131);
scene.fog = new THREE.Fog(0x1a2131, 18, 46);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(-6.8, 4.4, -2.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 3.8); controls.enableDamping = true; controls.maxPolarAngle = 1.45; controls.minDistance = 3; controls.maxDistance = 30;
controls.update();
const camBase = new THREE.Vector3();

scene.add(new THREE.HemisphereLight(0x8090c0, 0x30281c, 1.1));
const sun = new THREE.DirectionalLight(0xffd8b0, 1.4); sun.position.set(-8, 12, -4); scene.add(sun);

function terrain() {
  const g = new THREE.PlaneGeometry(44, 44, 160, 160); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const a = new THREE.Color(0x3c5a2c), b = new THREE.Color(0x5a6a34), dirt = new THREE.Color(0x6a5638), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = heightAt(x, z); p.setY(i, y);
    const n = 0.5 + 0.5 * Math.sin(x * 2.3 + Math.sin(z * 1.7) * 2) * Math.cos(z * 1.9 + x * 0.4);
    c.copy(a).lerp(b, n);
    const path = Math.exp(-((x * 0.9 - Math.sin(z * 0.3) * 1.2) ** 2) / 1.6);   // a worn path toward the dummies
    c.lerp(dirt, Math.min(0.85, path * 0.9 + (y > 0.45 ? 0.15 : 0)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  m.name = 'ground';
  scene.add(m);
  // a few stones for scale
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7468, roughness: 0.9, flatShading: true });
  for (const [x, z, s] of [[-4, 6, 0.6], [4.5, 3, 0.45], [-2.5, 11, 0.8], [5, 10, 0.7], [-5.5, 1, 0.4]]) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stoneMat);
    r.position.set(x, heightAt(x, z) + s * 0.4, z); r.rotation.set(x, z, 0.3); r.scale.y = 0.7; scene.add(r);
  }
  return m;
}
const ground = terrain();

/** a training dummy: post, straw body, sack head, cross-bar arms (a real object, not a stand-in blob) */
function dummy(x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, heightAt(x, z), z);
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.9 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xc8a860, roughness: 1 });
  const sack = new THREE.MeshStandardMaterial({ color: 0xb09a78, roughness: 1 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 1 });
  const add = (geo, mat, y, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.scale.set(sx, sy, sz); g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.06, 0.08, 1.9, 8), wood, 0.95);
  add(new THREE.CapsuleGeometry(0.3, 0.55, 4, 12), straw, 1.15, 1, 1, 0.8);
  add(new THREE.SphereGeometry(0.2, 14, 10), sack, 1.72);
  add(new THREE.BoxGeometry(1.2, 0.07, 0.07), wood, 1.38);
  for (const y of [0.92, 1.38]) add(new THREE.TorusGeometry(0.29, 0.025, 6, 20), rope, y).rotation.x = Math.PI / 2;
  g.scale.setScalar(s);
  scene.add(g);
  return g;
}
const dummies = [dummy(0, 7.5), dummy(2.6, 10, 0.9), dummy(-2.6, 10.6, 0.9)];

// ---------------------------------------------------------------------------------------------- caster
let tabard = null, bones = {}, caster;
async function makeCaster() {
  if (BARE) { caster = new THREE.Group(); caster.position.set(0, heightAt(0, 0), 0); scene.add(caster); return; }
  const { createTabard } = await import('../../tabard/js/tabard.js');
  tabard = await createTabard({ body: 'male', items: [], clip: 'idle', calm: 0.6 });
  try { await tabard.wearSet?.('wizard'); } catch (e) { console.warn('wizard set', e); }
  caster = tabard.group; caster.position.set(0, heightAt(0, 0), 0);
  caster.rotation.y = Math.PI;   // Tabard bodies face -z; the dummies are toward +z
  scene.add(caster);
  bones = tabard.bones;
}
const hands = () => (bones.hand_l && bones.hand_r ? [bones.hand_l, bones.hand_r] : null);
const play = (clip, back = 0) => { if (!tabard) return; tabard.play(clip); if (back) kitWait(back).then(() => tabard.play('idle')); };

// ---------------------------------------------------------------------------------------------- kit
let kit, data, names = {};
let quality = Q.get('quality') === 'low' ? 'low' : 'high';
let speed = 1, loop = false, manual = false;
const kitWait = s => kit.wait(s);

async function makeKit() {
  if (kit) { kit.dispose(); kit = null; }
  kit = await createSpellKit({ THREE, scene, camera, renderer, visuals: data, heightAt, quality });
  lab.kit = kit;
  lab.warmPrograms = kit.warm();
}

// ---------------------------------------------------------------------------------------------- picking
const GROUPS = [
  ['Bolts and missiles', ['fire_bolt', 'frost_bolt', 'arcane_missile', 'shadow_bolt', 'nature_bolt', 'bolt_generic', 'arrow']],
  ['Ground', ['ring_of_dawn', 'poison_cloud', 'blizzard', 'meteor', 'thunder_strike', 'fire_wall', 'flask_throw', 'arrow_rain', 'ground_generic', 'summon_circle']],
  ['Around the caster', ['frost_nova', 'nova_generic', 'whirl_slash', 'battle_shout']],
  ['Beams and cones', ['chain_lightning', 'beam_generic', 'breath_cone']],
  ['Weapons', ['melee_slash', 'elemental_slash', 'dash_generic']],
  ['On the body', ['nature_heal', 'heal_generic', 'buff_generic', 'shapeshift_puff', 'aura_burning', 'aura_frozen', 'aura_blessed', 'aura_poisoned', 'aura_haste', 'aura_warded', 'aura_cursed']],
];
let cur = Q.get('spell') || 'fire_bolt', curSchool = null, curScale = 1, curName = null;
const ref = () => ({ visual: cur, ...(curSchool ? { school: curSchool } : {}), ...(curScale !== 1 ? { scale: curScale } : {}) });
const def = () => data.visuals[cur];

function schoolHex(school) {
  const p = ELEMENT_PALETTE[elementName(school)];
  return '#' + (p ? p.mid : 0xffffff).toString(16).padStart(6, '0');
}

function buildPicker() {
  const host = $('spell-groups'); host.textContent = '';
  for (const [title, ids] of GROUPS) {
    const sec = document.createElement('div'); sec.className = 'sl-group';
    const h = document.createElement('h3'); h.textContent = title; sec.append(h);
    const chips = document.createElement('div'); chips.className = 'sl-chips';
    for (const id of ids) {
      const v = data.visuals[id]; if (!v) continue;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sl-chip'; b.dataset.id = id;
      const dot = document.createElement('i'); dot.style.color = dot.style.background = schoolHex(v.school);
      b.append(dot, document.createTextNode(v.label || id));
      b.addEventListener('click', () => pick(id));
      chips.append(b);
    }
    sec.append(chips); host.append(sec);
  }
  const sel = $('game-spell');
  const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; return o; };
  sel.append(opt('', 'Choose a spell…'));
  for (const [id, [name]] of Object.entries(names).sort((a, b) => a[1][0].localeCompare(b[1][0]))) sel.append(opt(id, name));
  sel.addEventListener('change', () => { if (sel.value) pickSpell(sel.value); });
}

function pick(id, school = null, scale = 1, name = null) {
  stopAll();
  cur = id; curSchool = school; curScale = scale; curName = name;
  for (const b of document.querySelectorAll('.sl-chip')) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  if (!name) $('game-spell').value = '';
  const v = def();
  const used = Object.entries(data.spells).filter(([, m]) => (typeof m === 'string' ? m : m.visual) === id).map(([s]) => names[s]?.[0] || s);
  const p = $('picked'); p.textContent = '';
  const b = document.createElement('b'); b.textContent = name || v.label || id; p.append(b);
  p.append(document.createTextNode(name ? ` uses “${v.label}”${school ? ' in ' + school : ''}${scale !== 1 ? ' at ' + fmt(scale) + '×' : ''}.`
    : used.length ? ` — used by ${used.length} Oathwild spell${used.length > 1 ? 's' : ''}: ${used.slice(0, 6).join(', ')}${used.length > 6 ? '…' : ''}` : ' — not used by an Oathwild spell yet.'));
  buildPhases();
}
function pickSpell(spellId) {
  const m = kit.visualFor(spellId, { kind: names[spellId]?.[1], element: names[spellId]?.[2] });
  pick(m.visual, m.school && m.school !== data.visuals[m.visual].school ? m.school : null, m.scale || 1, names[spellId]?.[0] || spellId);
}

// ---------------------------------------------------------------------------------------------- phases
let held = null, aim = null, aura = null;
const aimAt = new THREE.Vector3(0, 0, 7.5);
const target = () => dummies[0];
/** melee lands on a point just in front of the caster (the dummies stand too far for a sword) */
const meleeAt = () => caster.position.clone().addScaledVector(dirTo(), 1.3).add(new THREE.Vector3(0, 1.1, 0));
const dirTo = () => new THREE.Vector3().subVectors(target().position, caster.position).setY(0).normalize();
const handPos = () => { const out = new THREE.Vector3(); if (bones.hand_r) bones.hand_r.getWorldPosition(out); else out.copy(caster.position).add(new THREE.Vector3(-0.3, 1.2, 0.3)); return out; };
const aimShape = () => def().aim?.shape || ({ ground: 'circle', summon: 'circle', line: 'line', cone: 'cone' }[def().kind]) || 'none';
const isSelf = () => ['self', 'shift', 'nova', 'aura'].includes(def().kind);

const PHASES = [
  ['windup', 'Wind-up', () => !!def().windup],
  ['aim', 'Aim', () => aimShape() !== 'none'],
  ['release', 'Release', () => !!(def().release || def().windup)],
  ['travel', 'Travel', () => !!def().travel],
  ['beam', 'Beam', () => !!def().beam],
  ['sweep', 'Swing', () => !!def().sweep],
  ['impact', 'Impact', () => !!def().impact],
  ['linger', 'Ground', () => !!def().linger],
  ['aura', 'On body', () => !!def().aura],
];
const actions = {
  windup() {
    if (held) { held.stop(); held = null; play('idle'); return; }
    held = kit.windup(caster, ref(), { hands: hands() }); play('channel');
  },
  aim() {
    if (aim) { aim.stop(); aim = null; return; }
    const d = def().aim || {};
    const shape = aimShape();
    const o = shape === 'circle' ? { at: aimAt, radius: (def().linger?.radius || 4) * curScale, kind: d.kind || 'valid' }
      : { at: caster.position, dir: dirTo(), length: d.length || def().linger?.length || 8, width: d.width || 1.6, angle: d.angle || 1.2, kind: d.kind || 'hostile' };
    aim = kit.indicator(shape, o);
  },
  release() {
    if (held) { kit.release(held); held = null; }
    else kit.release({ visual: kit.resolve(ref()), caster, hands: hands(), height: 1.8 });
    play('cast', 0.7);
  },
  travel() {
    const d = def();
    if (d.travel?.from === 'sky') return kit.missile(aimAt.clone().add(new THREE.Vector3(-3, 14, -2)), aimAt.clone(), ref());
    if (d.kind === 'ground') return kit.missile(handPos(), aimAt.clone(), ref());
    const n = d.travel?.count || 1;
    for (let i = 0; i < n; i++) kit.missile(handPos(), target(), ref(), { delay: i * (d.travel?.every ?? 0.12) });
  },
  beam() { kit.beam(bones.hand_r || handPos(), dummies, ref()); },
  sweep() { play('attack', 0.9); kit.trail(bones.hand_r || caster, ref(), { base: swordTip(0.25), tip: swordTip(), seconds: def().sweepTime ?? 0.4 }); },
  impact() {
    const k = def().kind;
    const at = isSelf() ? caster.position.clone() : k === 'ground' || k === 'summon' ? aimAt.clone() : k === 'cone' ? handPos()
      : k === 'melee' ? meleeAt() : target().position.clone().add(new THREE.Vector3(0, 1.08, 0));
    kit.impact(at, ref(), { dir: dirTo(), radius: def().linger?.radius ?? 2, target: isSelf() ? caster : target() });
  },
  linger() { kit.ground(isSelf() ? caster.position : (def().kind === 'line' ? caster.position.clone().addScaledVector(dirTo(), 1.2) : aimAt), ref(), { dir: dirTo() }); },
  aura() {
    if (aura) { aura.stop(); aura = null; return; }
    aura = kit.aura(def().kind === 'aura' ? target() : caster, ref(), {});
  },
};

/** the blade tip in the hand bone's own frame: out along the forearm by 0.9 m */
function swordTip(len = 1.1) {
  const h = bones.hand_r, la = bones.lowerarm_r;
  if (!h || !la) return [0, 0.9, 0];
  const hw = new THREE.Vector3(), lw = new THREE.Vector3(); h.getWorldPosition(hw); la.getWorldPosition(lw);
  const tipW = hw.clone().addScaledVector(hw.clone().sub(lw).normalize(), len);
  const t = h.worldToLocal(tipW); return [t.x, t.y, t.z];
}

function buildPhases() {
  const host = $('phases'); host.textContent = '';
  for (const [id, label, ok] of PHASES) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.phase = id;
    b.disabled = !ok();
    if (id === 'windup' || id === 'aim' || id === 'aura') b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      actions[id]();
      if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(id === 'windup' ? !!held : id === 'aim' ? !!aim : !!aura));
      if (id === 'release') host.querySelector('[data-phase=windup]')?.setAttribute('aria-pressed', 'false');
      showPhase(label);
    });
    host.append(b);
  }
}

let phaseTimer = 0;
function showPhase(name) {
  const el = $('phase-now'); el.textContent = name; el.classList.add('on');
  clearTimeout(phaseTimer); phaseTimer = setTimeout(() => el.classList.remove('on'), 1400);
}
const PHASE_LABEL = { windup: 'Wind-up', release: 'Release', travel: 'Travel', impact: 'Impact', linger: 'Ground', beam: 'Beam', sweep: 'Swing', aura: 'On body' };

// ---------------------------------------------------------------------------------------------- whole cast
let castRun = 0;
async function castAll() {
  const run = ++castRun;
  stopAll(true);
  const d = def();
  const showAim = aimShape() !== 'none' && !manual;
  if (showAim) actions.aim();
  lab.events = [];
  await kit.cast(ref(), {
    caster, hands: hands(), target: isSelf() ? caster : d.kind === 'melee' ? meleeAt() : target(), at: isSelf() ? caster.position.clone() : (d.kind === 'line' ? caster.position.clone().addScaledVector(dirTo(), 1.2) : aimAt.clone()),
    dir: dirTo(), chain: dummies, weapon: bones.hand_r || caster, tip: swordTip(), base: swordTip(0.25),
    onPhase: p => {
      lab.events.push({ phase: p, t: kit.time });
      showPhase(PHASE_LABEL[p] || p);
      if (p === 'windup') play('channel');
      if (p === 'release') { play('cast', 0.7); if (aim) { aim.stop(); aim = null; } }
      if (p === 'sweep') play('attack', 0.9);
    },
  });
  if (aim) { aim.stop(); aim = null; }
  if (loop && run === castRun) { await kit.wait(Math.max(1.6, (d.linger?.seconds ?? 0) * 0.6)); if (loop && run === castRun) castAll(); }
}
lab.castAll = castAll;

function stopAll(keepLoop = false) {
  if (!keepLoop) castRun++;
  if (held) { held.stop(); held = null; }
  if (aim) { aim.stop(); aim = null; }
  if (aura) { aura.stop(); aura = null; }
  document.querySelectorAll('.sl-phases [aria-pressed]').forEach(b => b.setAttribute('aria-pressed', 'false'));
}

// ---------------------------------------------------------------------------------------------- storm
const STORM_SPELLS = ['fire_bolt', 'frost_bolt', 'arcane_missile', 'shadow_bolt', 'chain_lightning', 'ring_of_dawn', 'poison_cloud', 'frost_nova', 'meteor', 'nature_heal', 'melee_slash', 'blizzard', 'thunder_strike', 'summon_circle', 'breath_cone'];
let stormOn = false;
async function storm(seconds = 10, n = 10) {
  if (stormOn) return; stormOn = true;
  stopAll();
  const casters = [];
  for (let i = 0; i < n; i++) {
    const a = -1.2 + (i / (n - 1)) * 2.4, r = 7;
    const g = new THREE.Group(); g.position.set(Math.sin(a) * r, 0, 5 - Math.cos(a) * r); g.position.y = heightAt(g.position.x, g.position.z);
    g.lookAt(0, g.position.y, 6); scene.add(g); casters.push(g);
  }
  const end = kit.time + seconds;
  const auras = [];
  ['aura_burning', 'aura_frozen', 'aura_blessed', 'aura_poisoned', 'aura_haste'].forEach((id, i) => auras.push(kit.aura(i < 3 ? dummies[i] : casters[i], id)));
  await Promise.all(casters.map(async (c, i) => {
    await kit.wait(i * 0.17);
    while (kit.time < end) {
      const id = STORM_SPELLS[(Math.random() * STORM_SPELLS.length) | 0];
      const t = dummies[(Math.random() * 3) | 0];
      const at = new THREE.Vector3(t.position.x + (Math.random() - 0.5) * 5, 0, t.position.z + (Math.random() - 0.5) * 4);
      await kit.cast(id, { caster: c, target: t, at, dir: new THREE.Vector3().subVectors(t.position, c.position).setY(0).normalize(), chain: dummies, weapon: c, tip: [0, 1.4, 0.8], windup: 0.5, seconds: 3 });
      await kit.wait(0.25 + Math.random() * 0.4);
    }
  }));
  auras.forEach(a => a.stop());
  casters.forEach(c => scene.remove(c));
  stormOn = false;
}
lab.storm = storm;

// ---------------------------------------------------------------------------------------------- frame
const clock = new THREE.Clock();
let fps = 60, fpsAcc = 0, fpsN = 0, statT = 0;
function resize() {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

function step(dt) {
  kit.update(dt);
  tabard?.update(dt);
}
function render() {
  camBase.copy(camera.position);
  camera.position.add(kit.shakeOffset);
  renderer.render(scene, camera);
  camera.position.copy(camBase);
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  controls.update();
  if (kit && !manual) step(dt * speed);
  if (kit && !manual) render();   // manual (tests, shots): advance() renders
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  statT -= dt;
  if (kit && statT <= 0) { statT = 0.25; drawStats(); }
}

function drawStats() {
  const s = kit.stats(), info = renderer.info;
  $('hud').textContent = `${fmt(Math.round(fps), { decimals: 0 })} fps · ${fmt(s.particles, { decimals: 0 })} particles`;
  const rows = [
    ['Particles', `${fmt(s.particles, { decimals: 0 })} of ${fmt(s.budget, { decimals: 0 })}`, s.particles > s.budget * 0.8],
    ['Glowing / smoky', `${fmt(s.glow, { decimals: 0 })} / ${fmt(s.smoke, { decimals: 0 })}`],
    ['Effects running', fmt(s.effects, { decimals: 0 })],
    ['Draw calls (whole frame)', fmt(info.render.calls, { decimals: 0 })],
    ['Draw calls (spells)', fmt(s.draws, { decimals: 0 })],
    ['Shader programs', fmt(info.programs?.length ?? 0, { decimals: 0 })],
    ['Lights lit / pooled', `${fmt(s.lightsOn, { decimals: 0 })} / ${fmt(s.lights, { decimals: 0 })}`],
    ['Births refused (budget)', fmt(s.refused, { decimals: 0 }), s.refused > 0],
    ['Frame rate', `${fmt(Math.round(fps), { decimals: 0 })} fps`, fps < 40],
  ];
  const dl = $('stats'); dl.textContent = '';
  for (const [k, v, warn] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v; if (warn) dd.className = 'warn';
    dl.append(dt, dd);
  }
}

// ---------------------------------------------------------------------------------------------- inputs
function seg(id, value, on) {
  const host = $(id);
  const set = v => { for (const b of host.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.v === String(v))); };
  for (const b of host.querySelectorAll('button')) { b.setAttribute('role', 'radio'); b.addEventListener('click', () => { set(b.dataset.v); on(b.dataset.v); }); }
  set(value);
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointermove', e => {
  if (!aim) return;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(ground)[0];
  if (!hit) return;
  if (aimShape() === 'circle') {
    aimAt.copy(hit.point);
    aim.set({ at: aimAt, valid: hit.point.distanceTo(caster.position) < 14 });
  } else aim.set({ dir: hit.point.clone().sub(caster.position).setY(0).normalize() });
});

addEventListener('keydown', e => {
  if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); castAll(); }
});

// controller: A = cast, LB/RB = previous/next spell
const allIds = () => GROUPS.flatMap(g => g[1]).filter(id => data.visuals[id]);
let padPrev = [];
function pollPad() {
  const p = navigator.getGamepads?.()[0];
  if (p) {
    const down = i => p.buttons[i]?.pressed && !padPrev[i];
    if (down(0)) castAll();
    if (down(4) || down(5)) { const ids = allIds(), i = ids.indexOf(cur); pick(ids[(i + (down(5) ? 1 : ids.length - 1)) % ids.length]); }
    padPrev = p.buttons.map(b => b.pressed);
  }
  requestAnimationFrame(pollPad);
}

// ---------------------------------------------------------------------------------------------- tests + shots
Object.assign(lab, {
  THREE, scene, camera, renderer, dummies, heightAt,
  pick, pickSpell,
  stats: () => ({ ...kit.stats(), programs: renderer.info.programs?.length ?? 0, calls: renderer.info.render.calls }),
  /** deterministic stepping for screenshots and tests: manual(true) stops the clock; advance(s) steps at 60 Hz */
  manual(on) { manual = !!on; },
  advance(sec) { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) step(1 / 60); render(); return kit.time; },
  /** start a whole cast (manual or live) and return the phase events list (filled as it plays) */
  begin(id) { pick(id); castAll(); return lab.events; },
  setSpeed(v) { speed = v; },
  async setQuality(q) { quality = q; await makeKit(); pick(cur, curSchool, curScale, curName); },
  view(pos, look) { camera.position.set(...pos); controls.target.set(...look); controls.update(); },
});

// ---------------------------------------------------------------------------------------------- boot
(async () => {
  [data, names] = await Promise.all([fetch(VISUALS_URL).then(r => r.json()), fetch(NAMES_URL).then(r => r.json()).then(j => j.spells)]);
  await makeCaster();
  await makeKit();
  resize();
  buildPicker();
  if (!data.visuals[cur]) cur = 'fire_bolt';
  pick(cur);
  seg('speed', 1, v => { speed = Number(v); });
  seg('loop', 0, v => { loop = v === '1'; if (loop) castAll(); });
  seg('quality', quality, async v => { quality = v; await makeKit(); pick(cur, curSchool, curScale, curName); });
  $('play-all').addEventListener('click', castAll);
  $('storm').addEventListener('click', () => storm(10, 10));
  $('clear').addEventListener('click', () => { stopAll(); kit.clear(); });
  $('loading').classList.add('gone'); setTimeout(() => { $('loading').hidden = true; }, 450);
  frame(); pollPad();
  lab.ready = true;
  document.body.dataset.ready = '1';
})().catch(e => { lab.errors.push(String(e.stack || e)); $('loading').textContent = 'Could not load: ' + e.message; console.error(e); });
