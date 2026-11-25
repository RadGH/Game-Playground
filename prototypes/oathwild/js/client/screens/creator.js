// The character creator (its own screen — lessons rule 13), in four steps, each its own page with Back / Next:
//   1 Look (name, then Body / Face / Hair rows)  2 Class (the eight open classes and the chosen one's whole tree — the
//   same tree the Classes window draws)  3 Background  4 Attributes (point buy, and what the hero starts with).
// Owner 2026-11-24: "Make class selection come after customization using its own screen, and allow to view the skill
// tree … Background and attribute pages should also be separate." The live 3D hero (a Tabard body in the chosen
// class's starting gear) stays in view on phone and desktop. Tapping a row's value opens the whole list.
// Works by mouse, thumb, keyboard and controller (the pad walks the buttons; the right stick turns the hero).
// Starting points: Wyrmroad js/ui/creator.js and Oddhaven creator.js (rows, tabs, body always visible), Tumblefair
// editor.js (character visible on phones). Also exports createPreview() — the 3D hero stage the character select uses.
import * as THREE from 'three';
import { createTabard } from '../../../../../avatar-3d/tabard/js/tabard.js';
import { FACE_OPTIONS } from '../../../../../avatar-3d/tabard/js/face.js';
import { tabardItems } from '../../game/gear.js';
import { ATTRS, pointBuyCost, pointBuyRefusal, suggestedSpread } from '../../rules/attributes.js';
import { classDef, classIds, classRules } from '../../rules/classes.js';
import { createCharacter } from '../../rules/levels.js';
import { sheetOf } from '../../rules/sheet.js';
import { makeRng } from '../../rules/farhold.js';
import { treeHtml } from '../ui/win-classes.js';
import { tipAttrs } from '../ui/tip.js';
import { spellRow } from '../../rules/spells.js';
import { openWin, esc } from '../ui/kit.js';
import { glyph, uiIcon, spellIcon } from '../ui/icons.js';
import { fmt, sign, hp, range, pctOf } from '../../../../../shared/format.js';

// ---------------------------------------------------------------- the 3D stage (shared with the character select)
/** A small three.js stage on `canvas` showing one Tabard hero. → { show(look, items), setFocus('body'|'face'), dispose() } */
export function createPreview(canvas, { quality = 'medium' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'low' ? 1 : 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight('#fff3dc', '#5a4a30', 1.6));
  const key = new THREE.DirectionalLight('#ffe6c0', 2.2); key.position.set(2.5, 4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight('#9ec0ff', 1.1); rim.position.set(-3, 2.5, -2.5); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28 }));
  scene.add(floor);
  const holder = new THREE.Group(); scene.add(holder);
  const st = { yaw: 0.35, focus: 'body', dist: 4.2, ty: 0.95, wantDist: 4.2, wantTy: 0.95, drag: null, spin: true, hero: null, version: 0, disposed: false, idleT: 0 };
  let raf = 0, last = performance.now();

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  canvas.addEventListener('pointerdown', e => { st.drag = { x: e.clientX, id: e.pointerId }; st.spin = false; try { canvas.setPointerCapture?.(e.pointerId); } catch { /* the finger already lifted */ } });
  canvas.addEventListener('pointermove', e => { if (st.drag && st.drag.id === e.pointerId) { st.yaw += (e.clientX - st.drag.x) * 0.012; st.drag.x = e.clientX; } });
  const end = e => { if (st.drag?.id === e.pointerId) st.drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { e.preventDefault(); st.wantDist = Math.min(6, Math.max(0.8, st.wantDist + Math.sign(e.deltaY) * 0.35)); }, { passive: false });

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected);
    if (pad && Math.abs(pad.axes[2] || 0) > 0.2) { st.yaw += (pad.axes[2] || 0) * dt * 2.4; st.spin = false; }
    if (st.spin) st.yaw += dt * 0.25;
    st.dist += (st.wantDist - st.dist) * Math.min(1, dt * 6);
    st.ty += (st.wantTy - st.ty) * Math.min(1, dt * 6);
    holder.rotation.y = st.yaw;
    camera.position.set(0, st.ty + 0.12, st.dist);
    camera.lookAt(0, st.ty, 0);
    st.hero?.update(dt);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    /** Put a hero with this look and these Tabard items on the stage (re-uses the body when only the look changes). */
    async show(look, items) {
      const v = ++st.version;
      const body = look?.body === 'female' ? 'female' : 'male';
      const key = body + '|' + items.join(',');
      if (st.hero && st.heroKey === key) { await st.hero.setLook(look); return; }
      try {
        const t = await createTabard({ body, items, look, clip: 'idle' });
        if (v !== st.version || st.disposed) return;
        if (st.hero) holder.remove(st.hero.group);
        st.hero = t; st.heroKey = key;
        holder.add(t.group);
      } catch (e) { console.warn('preview hero', e); }
    },
    setFocus(f) {
      st.focus = f;
      if (f === 'face') { st.wantDist = 1.05; st.wantTy = 1.6; st.spin = false; st.yaw = 0; }
      else { st.wantDist = 4.2; st.wantTy = 0.95; }
    },
    set spin(v) { st.spin = !!v; }, get spin() { return st.spin; },
    get ready() { return !!st.hero; },
    dispose() { st.disposed = true; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); },
  };
}

/** Tabard items for a class's starting kit (classes.json `starter` → the same item look the game draws). */
export function starterItems(rules, cls) {
  const def = classDef(rules, cls);
  const gear = {};
  for (const key of def?.starter || []) {
    const wb = rules.data.items.weaponBases[key], ab = rules.data.items.armorBases[key];
    if (wb) { const slot = gear.weapon ? 'offhand' : 'weapon'; gear[slot] = { baseKey: key, type: 'weapon', subtype: wb.subtype, weaponCategory: wb.weaponCategory, twoHanded: !!wb.twoHanded }; }
    else if (ab) gear[ab.slot] = { baseKey: key, type: 'armor', slot: ab.slot, isShield: !!ab.isShield };
  }
  return tabardItems(rules, { gear });
}

/** Tabard items for a character summary's gear ({ slot: { b, s, two } }, server/hub.js summary). */
export function summaryItems(rules, g = {}) {
  const gear = {};
  for (const [slot, x] of Object.entries(g || {})) gear[slot] = { baseKey: x.b, subtype: x.s, twoHanded: !!x.two, type: slot === 'weapon' ? 'weapon' : 'armor', isShield: /shield|buckler|aegis/.test(x.b || ''), weaponCategory: rules.data.items.weaponBases[x.b]?.weaponCategory || null };
  return tabardItems(rules, { gear });
}

// ---------------------------------------------------------------- the options
const HAIR_STYLES = [['short', 'Short'], ['side_part', 'Side part'], ['bangs', 'Bangs'], ['bob', 'Bob'], ['long', 'Long'], ['wavy', 'Wavy'], ['ponytail', 'Ponytail'], ['bun', 'Bun'], ['braids', 'Braids'], ['spiky', 'Spiky'], ['curly', 'Curly'], ['afro', 'Afro'], ['mohawk', 'Mohawk'], ['undercut', 'Undercut'], ['topknot', 'Top knot'], ['high_ponytail', 'High ponytail'], ['twin_tails', 'Twin tails'], ['messy', 'Messy'], ['locs', 'Locs'], ['long_braid', 'Long braid'], ['wolf_cut', 'Wolf cut'], ['curly_bob', 'Curly bob'], ['warrior_braids', 'Warrior braids'], ['buzz', 'Buzz'], ['bald', 'Bald']];
const HAIR_COLOURS = [['#1f1712', 'Black'], ['#3b2618', 'Dark brown'], ['#5a3a22', 'Brown'], ['#7a4f2a', 'Chestnut'], ['#a8733c', 'Light brown'], ['#d2a35c', 'Honey'], ['#e8d29a', 'Flaxen'], ['#9a3a22', 'Auburn'], ['#c4542a', 'Copper'], ['#c8c3ba', 'Silver'], ['#6a6a72', 'Ash grey'], ['#f2efe8', 'White']];
const BODIES = [['male', 'Broad'], ['female', 'Slender']];
const NAMES = {
  male: ['Aldric Venn', 'Bram Holloway', 'Corin Ashdale', 'Dunstan Reeve', 'Edric Marsh', 'Fennick Larke', 'Gareth Thorne', 'Hob Whitlow', 'Ivo Brackwater', 'Jory Fellwood', 'Kestran Moor', 'Lorcan Ditch', 'Merrick Vale', 'Osric Pell', 'Rowan Tallis', 'Tamsin Cole'],
  female: ['Ada Wren', 'Brisa Hollow', 'Celyn Marsh', 'Delphine Rook', 'Elowen Vance', 'Fenna Ashby', 'Gwen Thistle', 'Hesper Lane', 'Isolde Brack', 'Jessamy Reed', 'Kerra Dunmore', 'Liesel Crane', 'Maren Oakes', 'Nessa Fairweather', 'Orla Penhallow', 'Sorcha Vell'],
};
const STEPS = [['look', 'Look'], ['class', 'Class'], ['background', 'Background'], ['attributes', 'Attributes']];
const LOOK_TABS = [['body', 'Body'], ['face', 'Face'], ['hair', 'Hair']];
const BASE_ORDER = ['warrior', 'ranger', 'rogue', 'mage', 'cleric', 'druid', 'bard', 'shaman'];

// a row: [key, label, list, get, set] — list = [[value, name]]
function rows(st, tab) {
  const L = st.look;
  const r = (key, label, list, get, set, kind = 'step') => ({ key, label, list, get, set, kind });
  if (tab === 'body') return [
    r('body', 'Build', BODIES, () => L.body, v => { L.body = v; if (v === 'female' && L.facialHair.id !== 'none') L.facialHair.id = 'none'; }),
    r('skin', 'Skin', FACE_OPTIONS.skin, () => L.skin.color, v => { L.skin.color = v; }, 'swatch'),
  ];
  if (tab === 'face') return [
    r('eyes', 'Eyes', FACE_OPTIONS.eyes, () => L.eyes.id, v => { L.eyes.id = v; }),
    r('eyeColor', 'Eye colour', FACE_OPTIONS.eyeColor, () => L.eyes.color, v => { L.eyes.color = v; }, 'swatch'),
    r('brows', 'Brows', FACE_OPTIONS.brows, () => L.brows.id, v => { L.brows.id = v; }),
    r('extras', 'Marks', FACE_OPTIONS.extras, () => L.extras.id, v => { L.extras.id = v; }),
    r('facialHair', 'Beard', FACE_OPTIONS.facialHair, () => L.facialHair.id, v => { L.facialHair.id = v; }),
  ];
  if (tab === 'hair') return [
    r('hair', 'Style', HAIR_STYLES, () => L.hair.id, v => { L.hair.id = v; }),
    r('hairColor', 'Colour', HAIR_COLOURS, () => L.hair.color, v => { L.hair.color = v; }, 'swatch'),
  ];
  return [];
}

const pick = list => list[Math.floor(Math.random() * list.length)];
function randomLook(body = pick(['male', 'female'])) {
  return {
    body, skin: { color: pick(FACE_OPTIONS.skin)[0] },
    hair: { id: 'short', color: pick(HAIR_COLOURS)[0] },
    eyes: { id: pick(FACE_OPTIONS.eyes)[0], color: pick(FACE_OPTIONS.eyeColor)[0] },
    brows: { id: pick(FACE_OPTIONS.brows)[0] },
    extras: { id: Math.random() < 0.3 ? pick(FACE_OPTIONS.extras)[0] : 'none' },
    facialHair: { id: body === 'female' ? 'none' : pick(FACE_OPTIONS.facialHair)[0] },
  };
}
function freshLook(body) {
  const L = randomLook(body);
  L.hair.id = pick(body === 'female' ? ['long', 'braids', 'ponytail', 'bun', 'wavy', 'bob', 'long_braid', 'curly_bob', 'high_ponytail'] : ['short', 'side_part', 'messy', 'undercut', 'wolf_cut', 'curly', 'buzz', 'spiky', 'warrior_braids']);
  return L;
}

// ---------------------------------------------------------------- the screen
export async function show(app, opts = {}) {
  const rules = app.rules;
  const A = rules.data.attributes;
  const bases = BASE_ORDER.filter(c => classDef(rules, c)?.open).concat(classIds(rules).filter(c => classDef(rules, c).open && !BASE_ORDER.includes(c)));
  const bgs = rules.data.backgrounds.backgrounds;
  const st = { step: 'look', tab: 'body', cls: opts.cls && bases.includes(opts.cls) ? opts.cls : 'warrior', bg: 'farmhand', look: freshLook(Math.random() < 0.5 ? 'male' : 'female'), attrs: null, name: '', busy: false, msg: '', sel: null };
  st.attrs = suggestedSpread(rules, classDef(rules, st.cls).primary.slice(0, 3));
  st.name = pick(NAMES[st.look.body]);

  const ui = document.getElementById('ui');
  ui.innerHTML = `<section class="scr-creator" aria-label="New hero" data-step="look">
    <header class="scr-creator-bar">
      <button type="button" class="ow-x scr-creator-back" data-back aria-label="Back">${glyph('back', 22)}</button>
      <h1>New hero</h1>
      <nav class="scr-creator-steps" aria-label="Steps">${STEPS.map(([id, label], i) => `<button type="button" class="scr-creator-stepbtn" data-go="${id}"><span class="scr-creator-stepn">${fmt(i + 1)}</span><span class="scr-creator-stept"><b>${label}</b><small></small></span></button>`).join('')}</nav>
      <button type="button" class="ow-x" data-act="menu" aria-label="Menu">${uiIcon('menu', 22)}</button>
    </header>
    <div class="scr-creator-body">
      <div class="scr-creator-stage">
        <canvas class="scr-creator-canvas" aria-label="Your hero"></canvas>
        <div class="scr-creator-tools">
          <button type="button" class="ow-btn ow-small ow-ghost" data-act="spin" aria-pressed="true">${glyph('refresh', 18)}<span>Turn</span></button>
          <button type="button" class="ow-btn ow-small ow-ghost" data-act="random">${glyph('star', 18)}<span>Random look</span></button>
        </div>
        <p class="scr-creator-who"></p>
      </div>
      <div class="scr-creator-panel">
        <div class="scr-creator-main"></div>
        <div class="scr-creator-foot" data-lint-skip>
          <p class="scr-creator-msg" role="status"></p>
          <div class="scr-creator-nav">
            <button type="button" class="ow-btn scr-creator-prev" data-act="prev">${glyph('back', 18)}<span></span></button>
            <button type="button" class="ow-btn ow-primary scr-creator-go" data-act="next"><span class="scr-creator-go-text"><b></b><small></small></span>${glyph('next', 20)}</button>
          </div>
        </div>
      </div>
    </div>
  </section>`;
  const root = ui.firstElementChild;
  const $ = s => root.querySelector(s);
  const main = $('.scr-creator-main'), msg = $('.scr-creator-msg');

  const preview = createPreview($('.scr-creator-canvas'), { quality: app.settings.quality });
  const redress = () => preview.show(st.look, starterItems(rules, st.cls));
  redress();

  const clsName = c => classDef(rules, c)?.name || c;
  const stepIdx = () => STEPS.findIndex(s => s[0] === st.step);
  const pointsLeft = () => A.pointBuy.points - pointBuyCost(rules, st.attrs);
  const suggested = () => suggestedSpread(rules, classDef(rules, st.cls).primary.slice(0, 3));

  // the would-be hero, built by the same rules the server uses — the tree, tooltips and "at the start" numbers read it
  let draftKey = '', draftChar = null;
  function draft() {
    const k = JSON.stringify([st.cls, st.bg, st.attrs]);
    if (k !== draftKey) {
      draftKey = k;
      const r = createCharacter(rules, { id: 'draft', name: st.name || 'Hero', look: st.look, background: st.bg, attributes: st.attrs, cls: st.cls }, makeRng(7));
      draftChar = r.ok ? r.char : (draftChar || null);
      app.draftChar = draftChar;
    }
    return draftChar;
  }

  function foot() {
    const i = stepIdx(), last = i === STEPS.length - 1;
    const left = pointsLeft();
    const sub = { look: st.name.trim() || 'Unnamed', class: clsName(st.cls), background: bgs[st.bg]?.name || '', attributes: left > 0 ? `${fmt(left)} point${left === 1 ? '' : 's'} left` : 'All spent' };
    root.querySelectorAll('[data-go]').forEach((b, j) => {
      b.setAttribute('aria-current', b.dataset.go === st.step ? 'step' : 'false');
      b.classList.toggle('is-done', j < i);
      b.querySelector('small').textContent = sub[b.dataset.go];
    });
    $('.scr-creator-who').textContent = `${st.name.trim() || 'Unnamed'} — ${clsName(st.cls)}`;
    const prev = $('.scr-creator-prev');
    prev.hidden = i === 0;
    if (i > 0) prev.querySelector('span').textContent = STEPS[i - 1][1];
    $('.scr-creator-go-text b').textContent = last ? 'Begin' : `Next: ${STEPS[i + 1][1]}`;
    $('.scr-creator-go-text small').textContent = last ? `${st.name.trim() || 'Unnamed'} · ${clsName(st.cls)} · ${bgs[st.bg]?.name || ''}` : '';
    $('.scr-creator-go').classList.toggle('is-begin', last);
    msg.textContent = st.msg;
  }

  // ---- step bodies
  function render({ top = false } = {}) {
    root.dataset.step = st.step;
    preview.setFocus(st.step === 'look' && (st.tab === 'face' || st.tab === 'hair') ? 'face' : 'body');
    const keep = main.scrollTop;
    if (st.step === 'look') main.innerHTML = lookStep();
    else if (st.step === 'class') main.innerHTML = classStep();
    else if (st.step === 'background') main.innerHTML = backgroundStep();
    else main.innerHTML = attributesStep();
    main.scrollTop = top ? 0 : keep;
    if (st.step === 'look') {
      const nameIn = $('#scr-creator-name-in');
      nameIn.value = st.name;
      nameIn.addEventListener('input', () => { st.name = nameIn.value; foot(); });
      nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); } });
    }
    foot();
  }
  function lookStep() {
    return `<div class="scr-creator-name"><label for="scr-creator-name-in">Name</label><input id="scr-creator-name-in" class="ow-input" type="text" maxlength="18" autocomplete="off" spellcheck="false"><button type="button" class="ow-btn ow-small" data-act="rname" aria-label="Random name">${glyph('refresh', 18)}</button></div>
      <nav class="ow-tabs scr-creator-tabs" role="tablist">${LOOK_TABS.map(([id, label]) => `<button type="button" class="ow-tab" role="tab" data-tab="${id}" aria-selected="${id === st.tab}">${label}</button>`).join('')}</nav>
      <div class="scr-creator-rows">${rows(st, st.tab).map(rowHtml).join('')}</div>`;
  }
  function rowHtml(r) {
    const cur = r.get();
    const i = Math.max(0, r.list.findIndex(o => o[0] === cur));
    const name = r.list[i]?.[1] || '';
    if (r.kind === 'swatch') {
      return `<div class="scr-creator-row" data-row="${r.key}"><span class="scr-creator-label">${esc(r.label)}<small>${esc(name)}</small></span>
        <div class="scr-creator-swatches" role="radiogroup" aria-label="${esc(r.label)}">${r.list.map(([v, n]) => `<button type="button" class="scr-creator-swatch" data-swatch="${esc(v)}" aria-label="${esc(n)}" aria-pressed="${v === cur}" style="--sw:${esc(v)}"></button>`).join('')}</div></div>`;   // lint-ok: a swatch's colour is data
    }
    return `<div class="scr-creator-row" data-row="${r.key}"><span class="scr-creator-label">${esc(r.label)}</span>
      <div class="scr-creator-step"><button type="button" class="ow-btn ow-small" data-step="-1" aria-label="Previous ${esc(r.label)}">${glyph('back', 18)}</button>
      <button type="button" class="ow-btn ow-small scr-creator-value" data-list="${r.key}">${esc(name)}<small>${fmt(i + 1)} / ${fmt(r.list.length)}</small></button>
      <button type="button" class="ow-btn ow-small" data-step="1" aria-label="Next ${esc(r.label)}">${glyph('next', 18)}</button></div></div>`;
  }
  const freeSpells = d => d.nodes.filter(n => n.free && n.kind === 'spell').map(n => { let nm = n.spell; try { nm = spellRow(rules, n.spell)?.name || n.spell; } catch { /* unknown */ } return { id: n.spell, name: nm }; });
  function classStep() {
    const d = classDef(rules, st.cls), c = draft();
    const list = bases.map(k => {
      const x = classDef(rules, k), sp = freeSpells(x);
      return `<button type="button" class="scr-creator-class" data-cls="${k}" aria-pressed="${k === st.cls}" ${tipAttrs('class', { cls: k })}>
        <span class="scr-creator-class-icon">${spellIcon(sp[0]?.id || k, 40, { cls: k })}</span>
        <span class="scr-creator-class-text"><b>${esc(x.name)}</b><em>${esc(x.role)}</em></span></button>`;
    }).join('');
    const spells = freeSpells(d);
    const paths = Object.values(d.paths || {});
    const R = classRules(rules);
    const facts = [
      `<div class="scr-creator-fact"><span>Best with</span><b>${esc(d.primary.map(k => A.names[k]).join(', '))}</b></div>`,
      spells.length ? `<div class="scr-creator-fact"><span>Starts with</span><b>${esc(spells.map(x => x.name).join(', '))}</b></div>` : '',
      d.growth ? `<div class="scr-creator-fact"><span>Each level</span><b>${esc([d.growth.hp ? `+${fmt(d.growth.hp)} health` : '', d.growth.mp ? `+${fmt(d.growth.mp)} mana` : ''].filter(Boolean).join(', '))}</b></div>` : '',
    ].join('');
    return `<div class="scr-creator-cls">
      <div class="scr-creator-clslist" role="radiogroup" aria-label="Class">${list}</div>
      <div class="scr-creator-clsinfo">
        <div class="scr-creator-clshead">
          <span class="scr-creator-clsbig">${spellIcon(spells[0]?.id || st.cls, 64, { cls: st.cls })}</span>
          <div><h2>${esc(d.name)}</h2><em>${esc(d.role)}</em><p>${esc(d.blurb || '')}</p></div>
        </div>
        <div class="scr-creator-facts">${facts}</div>
        ${paths.length ? `<div class="scr-creator-paths">${paths.map(p => `<div class="scr-creator-path"><b>${esc(p.name)}</b><span>${esc(p.blurb || '')}</span></div>`).join('')}<small class="ow-dim">Choose a path at ${esc(d.name)} level ${fmt(R.pathLevel)}.</small></div>` : ''}
        <h3 class="scr-creator-h">${esc(d.name)} tree</h3>
        ${c ? treeHtml(app, c, st.cls, { sel: st.sel, preview: true }) : ''}
        <p class="scr-creator-note">Every level you choose a class again: stay with this one or add any other.</p>
      </div>
    </div>`;
  }
  function backgroundStep() {
    return `<h2 class="scr-creator-title">Where you come from</h2><div class="scr-creator-bgs" role="radiogroup" aria-label="Background">${Object.entries(bgs).map(([id, b]) => {
      const chips = [];
      for (const [k, v] of Object.entries(b.attrs || {})) chips.push(`${sign(v, { decimals: 0 })} ${A.names[k]}`);
      for (const [k, v] of Object.entries(b.skills || {})) chips.push(`${sign(v, { decimals: 0 })} ${rules.data.skillsUse.skills[k]?.name || k}`);
      if (b.mods?.carry) chips.push(`${sign(b.mods.carry, { decimals: 0 })} kg carry weight`);
      if (b.mods?.maxStaminaPct) chips.push(`${sign(b.mods.maxStaminaPct, { decimals: 0 })}% stamina`);
      return `<button type="button" class="scr-creator-bg" data-bg="${id}" aria-pressed="${id === st.bg}">
        <span class="scr-creator-bg-top"><b>${esc(b.name)}</b><span class="scr-creator-gold">${glyph('coin', 16)}${fmt(b.gold || 0)} gold</span></span>
        <span class="scr-creator-bg-blurb">${esc(b.blurb)}</span>
        <span class="scr-creator-chips">${chips.map(x => `<i>${esc(x)}</i>`).join('')}</span></button>`;
    }).join('')}</div>`;
  }
  function attributesStep() {
    const pb = A.pointBuy;
    const left = pointsLeft();
    const bonus = bgs[st.bg]?.attrs || {};
    const sug = suggested(), same = ATTRS.every(k => sug[k] === st.attrs[k]);
    const c = draft(), s = c ? sheetOf(rules, c) : null;
    const stat = (label, v) => `<div class="scr-creator-stat"><span>${esc(label)}</span><b>${esc(v)}</b></div>`;
    const spell = s ? ['int', 'wis', 'cha'].map(k => [k, s.spell?.[k]]).filter(([, r]) => r).sort((a, b) => (b[1][1] || 0) - (a[1][1] || 0))[0] : null;
    const start = s ? [
      stat('Health', hp(s.maxHp)), stat('Mana', hp(s.maxMp)), stat('Stamina', hp(s.maxStamina)),
      stat('Weapon damage', range(s.melee[0], s.melee[1])), spell ? stat(`Spell power (${A.names[spell[0]]})`, range(spell[1][0], spell[1][1])) : '',
      stat('Critical chance', pctOf(s.critChance, 1)), stat('Armour', fmt(s.armor)), stat('Carry', `${fmt(s.carry)} kg`),
    ].join('') : '';
    return `<div class="scr-creator-points"><span>Points left</span><b class="${left < 0 ? 'ow-bad' : left === 0 ? '' : 'ow-gold'}">${fmt(left)} / ${fmt(pb.points)}</b>
        <button type="button" class="ow-btn ow-small" data-act="suggest" ${same ? 'disabled' : ''}>${glyph(same ? 'check' : 'star', 18)}<span>${same ? 'Using the spread suggested for' : 'Suggested for'} ${esc(clsName(st.cls))}</span></button></div>
      <div class="scr-creator-attrs">${ATTRS.map(k => {
        const v = st.attrs[k];
        const next = { ...st.attrs, [k]: v + 1 };
        const canUp = v < pb.max && pointBuyCost(rules, next) <= pb.points;
        const cost = canUp ? pb.cost[String(v + 1)] - pb.cost[String(v)] : 0;
        const prim = classDef(rules, st.cls).primary.includes(k);
        return `<div class="scr-creator-attr${prim ? ' is-primary' : ''}" data-attr="${k}">
          <button type="button" class="scr-creator-attr-text" ${tipAttrs('attr', { id: k })}><b>${esc(A.names[k])}${prim ? `<small class="ow-gold">${esc(clsName(st.cls))}</small>` : ''}</b><span>${esc(A.blurbs[k])}</span></button>
          <div class="scr-creator-step">
            <button type="button" class="ow-btn ow-small" data-attr-step="-1" aria-label="Lower ${esc(A.names[k])}" ${v <= pb.min ? 'disabled' : ''}>${glyph('minus', 18)}</button>
            <span class="scr-creator-attr-val">${fmt(v + (bonus[k] || 0))}${bonus[k] ? `<small class="ow-good">${sign(bonus[k], { decimals: 0 })} ${esc(bgs[st.bg].name)}</small>` : ''}</span>
            <button type="button" class="ow-btn ow-small" data-attr-step="1" aria-label="Raise ${esc(A.names[k])}" ${canUp ? '' : 'disabled'}>${glyph('plus', 18)}</button>
          </div>
          <small class="scr-creator-attr-cost">${canUp ? `Next point costs ${fmt(cost)}` : v >= pb.max ? `Highest at the start (${fmt(pb.max)})` : 'Not enough points'}</small>
        </div>`;
      }).join('')}</div>
      ${start ? `<h3 class="scr-creator-h">At the start</h3><div class="scr-creator-stats">${start}</div>` : ''}`;
  }

  // ---- the whole list for one row (a window: big lists never scroll over the canvas)
  function openList(r) {
    const w = openWin({
      id: 'creator-list', title: r.label, size: 'narrow', cls: 'scr-creator-pickwin',
      render: () => `<div class="scr-creator-pick">${r.list.map(([v, n]) => `<button type="button" class="ow-btn scr-creator-pick-item" data-pick="${esc(v)}" aria-pressed="${v === r.get()}" ${v === r.get() ? 'data-primary' : ''}>${esc(n)}</button>`).join('')}</div>`,
    });
    w.body.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; r.set(b.dataset.pick); w.close(); changed(); });
  }

  function changed(dress = false) { st.msg = ''; if (dress) redress(); else preview.show(st.look, starterItems(rules, st.cls)); render(); }
  function go(step) {
    if (!STEPS.some(s => s[0] === step) || step === st.step) return;
    st.step = step; st.msg = ''; render({ top: true });
    // a controller needs a starting point on the new page; a mouse or a finger does not (focus would pop a tooltip)
    if (app.device === 'pad') setTimeout(() => (main.querySelector('[aria-pressed="true"], [aria-selected="true"], button:not([disabled])'))?.focus({ preventScroll: true }), 30);
  }

  root.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.tab) { st.tab = t.dataset.tab; render({ top: true }); return; }
    if (t.dataset.back != null) { app.go(opts.from === 'title' ? 'title' : 'chars'); return; }
    const act = t.dataset.act;
    if (act === 'menu') return app.openWindow('menu', { where: 'creator' });
    if (act === 'spin') { preview.spin = !preview.spin; t.setAttribute('aria-pressed', String(preview.spin)); return; }
    if (act === 'random') { st.look = freshLook(st.look.body); return changed(); }
    if (act === 'rname') { st.name = pick(NAMES[st.look.body].filter(n => n !== st.name)); const n = $('#scr-creator-name-in'); if (n) n.value = st.name; return foot(); }
    if (act === 'suggest') { st.attrsTouched = false; st.attrs = suggested(); return render(); }
    if (act === 'prev') return go(STEPS[Math.max(0, stepIdx() - 1)][0]);
    if (act === 'next') {
      if (st.step === 'look' && !st.name.trim()) { st.msg = 'Choose a name first.'; foot(); $('#scr-creator-name-in')?.focus(); return; }
      return stepIdx() === STEPS.length - 1 ? create() : go(STEPS[stepIdx() + 1][0]);
    }
    // a tree node first: its tooltip attributes carry data-cls too, so it must not read as "pick this class"
    if (t.dataset.node) { st.sel = st.sel === t.dataset.node ? null : t.dataset.node; render(); main.querySelector('.cls-detail')?.scrollIntoView({ block: 'nearest' }); return; }
    if (t.dataset.cls && t.classList.contains('scr-creator-class')) { if (st.cls === t.dataset.cls) return; st.cls = t.dataset.cls; st.sel = null; if (!st.attrsTouched) st.attrs = suggested(); return changed(true); }
    if (t.dataset.bg) { st.bg = t.dataset.bg; return render(); }
    if (t.dataset.swatch) { const row = rows(st, st.tab).find(r => r.key === t.closest('[data-row]').dataset.row); row?.set(t.dataset.swatch); return changed(); }
    if (t.dataset.list) { const row = rows(st, st.tab).find(r => r.key === t.dataset.list); if (row) openList(row); return; }
    if (t.dataset.step) {
      const row = rows(st, st.tab).find(r => r.key === t.closest('[data-row]').dataset.row); if (!row) return;
      const i = Math.max(0, row.list.findIndex(o => o[0] === row.get()));
      row.set(row.list[(i + +t.dataset.step + row.list.length) % row.list.length][0]);
      if (row.key === 'body') { st.look.hair.id = st.look.hair.id || 'short'; }
      return changed(row.key === 'body');
    }
    if (t.dataset.attrStep) {
      const k = t.closest('[data-attr]').dataset.attr;
      const next = { ...st.attrs, [k]: st.attrs[k] + +t.dataset.attrStep };
      if (!pointBuyRefusal(rules, next)) { st.attrs = next; st.attrsTouched = true; }
      return render();
    }
  });

  async function create() {
    if (st.busy) return;
    const name = st.name.trim();
    if (!name) { st.msg = 'Choose a name first.'; go('look'); return; }
    const why = pointBuyRefusal(rules, st.attrs);
    if (why) { st.msg = why; go('attributes'); foot(); return; }
    st.busy = true; st.msg = 'Making your hero…'; foot();
    $('.scr-creator-go').disabled = true;
    try {
      if (app.net.state !== 'open') await app.net.connect();
      const look = { body: st.look.body, skin: { ...st.look.skin }, hair: { ...st.look.hair }, eyes: { ...st.look.eyes }, brows: { ...st.look.brows }, extras: { ...st.look.extras }, facialHair: { ...st.look.facialHair } };
      const r = await app.net.request({ t: 'charNew', name, look, background: st.bg, attributes: st.attrs, cls: st.cls }, 'chars');
      if (!r.made) throw new Error('The world server did not make the hero. Try again.');
      app.go('worlds', { char: r.made });
    } catch (e) {
      st.busy = false; st.msg = e.message || 'Something went wrong. Try again.'; foot();
      $('.scr-creator-go').disabled = false;
    }
  }

  render({ top: true });
  // not on a phone: focusing the name box would open the keyboard over the hero
  if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => $('#scr-creator-name-in')?.focus({ preventScroll: true }), 30);
  return {
    get view() { return preview.ready ? 'ready' : 'loading'; },
    get step() { return st.step; },
    close() { preview.dispose(); app.draftChar = null; },
  };
}
