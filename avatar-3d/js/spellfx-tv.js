// The Thousandvale tab of the Spell FX page. Everything drawn here is the GAME's own code, imported from
// prototypes/thousandvale/js/client/ (one copy — nothing is copied into avatar-3d). The page plays the part of the
// game server: it builds a few stand-in bodies and sends the same events the rules send (`cast`, `hit`, `fx {...}`), and
// routes them to the same modules in the same order as the game's main.js:
//
//   spells.js     the element effects (avatar-3d SpellFx) + held beams (beam-fx.js) + shots (projectiles.js) + stars
//   sig-fx.js     each class's signature shapes on top (sig-looks.js decides; 30 classes + the Star Blade)
//   star-fx.js    the Starcaller and Star Blade's gold stars (star-looks.js documents the wire events)
//   weapon-fx.js  swings and staff flashes        form-fx.js  caster attack forms       revive-fx.js  the six revives
//   vharlen-fx.js the Burning Isle's hot springs, geysers, lava vents and ashfall (sites read from the game's data)
//
// Any module that fails to load is listed on the page and its buttons are left out; nothing here throws for a missing
// file. `window.tvFx` is the API the screenshot script drives.
import * as THREE from 'three';
import { el, button, select, panel } from '../../shared/ui.js';
import { createScene } from './scene.js';
import { createChibi2Character } from './chibi2.js';
import { loadClassRoster } from './class-outfits.js';

const TV = '../../prototypes/thousandvale/';
const CLIENT = TV + 'js/client/';
const url = p => new URL(p, import.meta.url).href;
const missing = [];
async function tryImport(p) { try { return await import(url(p)); } catch (e) { console.warn('[spellfx-tv] could not load', p, e); missing.push(p.replace(TV, 'thousandvale/')); return null; } }
async function tryJson(p) { try { const r = await fetch(url(p)); if (!r.ok) throw new Error(r.status); return await r.json(); } catch (e) { console.warn('[spellfx-tv] could not read', p, e); missing.push(p.replace(TV, 'thousandvale/').replace('../../', '')); return null; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ELEMENTS = ['fire', 'ice', 'lightning', 'shadow', 'holy', 'nature', 'arcane', 'poison', 'physical'];
const CASTER = 1, TARGET = 2, SECOND = 3;

export async function openThousandvale(args = {}) {
  const main = document.getElementById('tv-main'), left = document.getElementById('tv-left'), right = document.getElementById('tv-right');
  const viewport = el('div', { class: 'tv-viewport' });
  const caption = el('div', { class: 'caption', text: 'loading Thousandvale effects…' });
  viewport.append(el('div', { class: 'overlay', text: 'drag to orbit · wheel to zoom' }), caption);
  const camRow = el('div', { class: 'row' });
  main.append(el('div', { class: 'panel' }, viewport, camRow));
  const say = t => { caption.textContent = t; };

  // ---- the game's modules and data (all optional) ----
  const [S, SIG, SIGL, STAR, STARL, FORM, REV, WPN, SHOT, KINDS, VHL, LVL, LP, BEAM] = await Promise.all([
    'spells.js', 'sig-fx.js', 'sig-looks.js', 'star-fx.js', 'star-looks.js', 'form-fx.js', 'revive-fx.js', 'weapon-fx.js',
    'projectiles.js', 'projectile-kinds.js', 'vharlen-fx.js', 'fx-level.js', 'lightpool.js', 'beam-fx.js',
  ].map(f => tryImport(CLIENT + f)));
  const [catalog, tvClasses, fhSkills, forms, roster] = await Promise.all([
    tryJson(TV + 'data/rules/class-catalog.json'), tryJson(TV + 'data/rules/classes-tv.json'),
    tryJson('../../prototypes/farhold/data/skills.json'), tryJson(TV + 'data/rules/caster-forms.json'),
    loadClassRoster().catch(e => { console.warn('[spellfx-tv] roster', e); missing.push('class roster'); return []; }),
  ]);
  const SKILLS = { ...(fhSkills?.skills || {}), ...(tvClasses?.skills || {}) };
  const CLASSES = catalog?.classes || {};
  const SKILL_CLASS = new Map();
  for (const [c, C] of Object.entries(CLASSES)) for (const s of C.skills || []) SKILL_CLASS.set(s.id, c);
  const skillOf = id => SKILLS[id] || null;
  const looksById = new Map((roster || []).map(r => [r.id, r]));

  // ---- the stage ----
  const sc = createScene(viewport, { background: 0x1b2026, ground: false });
  const { scene, camera, controls, renderer } = sc;
  camera.far = 500; camera.fov = 40; camera.updateProjectionMatrix();
  controls.maxDistance = 80;
  const home = () => { camera.position.set(0, 5.5, 14.5); controls.target.set(0, 1, 0); controls.update(); };
  home();
  scene.fog = new THREE.Fog(0x1b2026, 70, 260);
  for (const o of scene.children) if (o.isDirectionalLight && o.castShadow) { const c = o.shadow.camera; c.left = c.bottom = -16; c.right = c.top = 16; c.far = 60; o.position.set(6, 14, 8); c.updateProjectionMatrix(); }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(120, 60, 0x3a4250, 0x30363f); grid.position.y = 0.002; scene.add(grid);
  const groundY = () => 0;

  // ---- stand-in bodies: what the game's actors.js hands every effect module ----
  const map = new Map();
  const actors = { actors: map, get: id => map.get(id) };
  async function body(look) {
    try { return await createChibi2Character(look || {}, { v25: true }); } catch (e) { console.warn('[spellfx-tv] body', e); return null; }
  }
  function makeActor(id, ctrl, x, z, yaw, { cls = null, hostile = false } = {}) {
    const holder = new THREE.Group(); holder.name = 'actor-' + id; scene.add(holder);
    const a = { id, kind: hostile ? 'monster' : 'player', humanoid: true, hostile, pos: new THREE.Vector3(x, 0, z), home: new THREE.Vector3(x, 0, z), yaw, height: 1.7, group: holder, model: null, body: null, look: { cls }, dead: false, liftY: 0 };
    setBody(a, ctrl);
    map.set(id, a);
    return a;
  }
  function setBody(a, ctrl) {
    if (a.body) { a.group.remove(a.body.group); try { a.body.dispose?.(); } catch {} }
    a.body = ctrl; a.model = ctrl?.group || null;
    if (ctrl) { ctrl.group.traverse(o => { if (o.isMesh) o.castShadow = true; }); a.group.add(ctrl.group); try { a.height = Math.max(0.8, ctrl.metrics().height || 1.7); } catch {} }
  }
  const anim = (id, name, back = 900) => { const a = map.get(id); if (!a?.body) return; try { a.body.setAnim(name, true); } catch {} if (back) setTimeout(() => { try { if (!a.dead) a.body.setAnim('idle'); } catch {} }, back); };

  const firstClass = CLASSES[args.cls] ? args.cls : 'starcaller' in CLASSES ? 'starcaller' : Object.keys(CLASSES)[0] || 'warrior';
  const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  const caster = makeActor(CASTER, await body(looksById.get(firstClass)?.avatar), -4.5, 0, 0, { cls: firstClass });
  const target = makeActor(TARGET, await body(looksById.get('knight')?.avatar || looksById.get('warrior')?.avatar), 4.5, 0, 0, { hostile: true });
  const second = makeActor(SECOND, await body(looksById.get('rogue')?.avatar), 7.5, -3.5, 0, { hostile: true });
  caster.yaw = yawTo(caster.pos, target.pos); target.yaw = yawTo(target.pos, caster.pos); second.yaw = yawTo(second.pos, caster.pos);

  // ---- the game's effect modules, built the way main.js builds them ----
  const LIGHTS = LP?.LIGHTS || null;
  try { LIGHTS?.attach(scene, { count: 4 }); } catch (e) { console.warn(e); }
  let level = LVL?.FX_DEFAULT || 'enhanced';
  const focus = () => ({ self: CASTER, target: TARGET });
  const safe = (name, fn) => { try { return fn(); } catch (e) { console.warn('[spellfx-tv] could not build', name, e); missing.push(name + ' (build failed: ' + e.message + ')'); return null; } };
  const shots = SHOT ? safe('projectiles', () => SHOT.createProjectiles(scene, { actors, groundY, night: () => 0 })) : null;
  const stars = STAR ? safe('star-fx', () => STAR.createStarFx(scene, { camera, actors, groundY, quality: 'high' })) : null;
  const spells = S ? safe('spells', () => S.createSpells(scene, { camera, renderer, actors, groundY, skillOf, quality: 'high', shots, stars, level, focus })) : null;
  const beams = spells?.beams || (BEAM ? safe('beam-fx', () => BEAM.createBeams(scene, { camera, actors, groundY })) : null);
  const sig = SIG ? safe('sig-fx', () => SIG.createSigFx(scene, { camera, actors, groundY, level, focus, skillOf, classOf: (id, a) => SKILL_CLASS.get(id) || a?.look?.cls || null })) : null;
  const weaponFx = WPN ? safe('weapon-fx', () => WPN.createWeaponFx(scene, { shots, spellFx: spells?.fx || null, actors, groundY, targetOf: () => TARGET })) : null;
  const formFx = FORM ? safe('form-fx', () => FORM.createFormFx(scene, { spellFx: spells?.fx || null, actors, groundY })) : null;
  const reviveFx = REV && formFx ? safe('revive-fx', () => REV.createReviveFx({ forms: formFx, spellFx: spells?.fx || null, actors, groundY })) : null;

  // the Burning Isle: the game's own site list, moved onto this stage (one hot spring, one geyser, one lava vent)
  const HZ = { spring: { x: -12, z: -24 }, geyser: { x: 0, z: -26 }, vent: { x: 7, z: -24 } };
  let hazardDoc = null, ashOn = false;
  function stageHazards(doc) {
    if (!doc) return null;
    const sp = (doc.springs || []).find(s => s.kind === 'hot_spring') || (doc.springs || [])[0];
    const gy = (doc.geysers || [])[0], vt = (doc.vents || [])[0];
    const len = vt ? Math.max(4, Math.hypot(vt.bx - vt.ax, vt.bz - vt.az)) : 0;
    return {
      province: 'vharlen',
      springs: sp ? [{ ...sp, x: HZ.spring.x, z: HZ.spring.z, r: Math.min(4, sp.r || 4), level: 0.06 }] : [],
      geysers: gy ? [{ ...gy, x: HZ.geyser.x, z: HZ.geyser.z }] : [],
      vents: vt ? [{ ...vt, ax: HZ.vent.x, az: HZ.vent.z, bx: HZ.vent.x + len, bz: HZ.vent.z }] : [],
      ashfall: doc.ashfall || { zones: [] },
    };
  }
  const vharl = VHL ? safe('vharlen-fx', () => VHL.createVharlenFx(scene, {
    actors, camera, renderer, quality: 'high', groundY, roomOf: () => ({ province: 'vharlen' }), indoors: () => false,
    // ashfall follows the player's world zone: stand them in an ash zone (z11_10) while the toggle is on
    selfPos: () => (ashOn ? { x: 11 * 2048 + 900, z: 10 * 2048 + 900 } : null),
    fetchJson: p => fetch(url(TV + p)).then(r => (r.ok ? r.json() : null)).then(d => (hazardDoc = stageHazards(d))).catch(() => null),
  })) : null;
  // a hot spring in the game is the terrain's own water: a stand-in pool so the steam has something to rise off
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.MeshStandardMaterial({ color: 0x3f8a96, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(HZ.spring.x, 0.04, HZ.spring.z); pool.visible = !!VHL; scene.add(pool);

  // ---- the frame (main.js order) ----
  sc.addTicker(dt => {
    for (const a of map.values()) {
      a.group.position.set(a.pos.x, a.pos.y + (a.liftY || 0), a.pos.z);
      if (a.body) { a.body.group.rotation.y = a.yaw; try { a.body.update(dt); } catch {} }
    }
    for (const [n, m] of [['spells', spells], ['sig', sig], ['stars', stars], ['weapon', weaponFx], ['forms', formFx], ['shots', shots], ['vharlen', vharl]]) {
      if (!m) continue;
      try { m.update(dt); } catch (e) { if (!m._warned) { m._warned = true; console.warn('[spellfx-tv] update', n, e); } }
    }
    if (!spells && beams) try { beams.update(dt); } catch {}
    try { LIGHTS?.update(dt, camera.position); } catch {}
  });

  // ---- the event bus: every event goes where main.js sends it ----
  const log = [];
  function emit(ev) {
    log.push(ev); if (log.length > 200) log.shift();
    if (ev.type === 'cast' || ev.type === 'hit' || ev.type === 'fx') {
      for (const m of [spells, sig, weaponFx, formFx, reviveFx]) { if (m) try { m.onEvent(ev); } catch (e) { console.warn('[spellfx-tv]', ev.type, ev.kind, e); } }
    }
    if (vharl && ev.type === 'fx') try { vharl.onEvent(ev); } catch (e) { console.warn(e); }
  }
  const pt = a => ({ x: a.pos.x, z: a.pos.z });
  const flightMs = (a, b, speed = 26) => Math.max(160, Math.round(Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) / speed * 1000));

  // ---- class + skills ----
  let cls = firstClass;
  const isStar = id => !!STARL?.isStarSkill?.(id);
  const motionOf = shape => (shape === 'melee' || shape === 'around' || shape === 'dash' ? 'attack' : 'cast');
  async function setClass(id) {
    if (!CLASSES[id]) return false;
    cls = id; caster.look.cls = id;
    say('dressing the ' + (CLASSES[id].name || id) + '…');
    const ctrl = await body(looksById.get(id)?.avatar);
    if (cls !== id) { try { ctrl?.dispose?.(); } catch {} return false; }
    setBody(caster, ctrl);
    try { stars?.setMotes?.(CASTER, 0); } catch {}
    drawSkills();
    say(`${CLASSES[id].name}: ${CLASSES[id].role || ''} — press a skill`);
    return true;
  }
  const skillList = () => (CLASSES[cls]?.skills || []);

  /** Dash skills move the caster for real (the signature's afterimages and the footfalls follow the body). */
  async function dashCaster() {
    const from = caster.pos.clone(), to = target.pos.clone().lerp(from, 0.25), t0 = performance.now();
    while (performance.now() - t0 < 280) { caster.pos.lerpVectors(from, to, (performance.now() - t0) / 280); await sleep(16); }
    caster.pos.copy(to);
    setTimeout(() => caster.pos.copy(caster.home), 1500);
  }

  /** The Starcaller's six, as the rules send them (star-looks.js lists the events; cast-skills.js sends them). */
  const STAR_SCRIPTS = {
    star_dart() { const ms = flightMs(caster, target); emit({ type: 'fx', kind: 'bolt', id: CASTER, skill: 'star_dart', proj: 'star', element: 'arcane', from: pt(caster), to: TARGET, ms }); return ms; },
    star_volley() { const ms = flightMs(caster, target); for (let n = 1; n <= 3; n++) setTimeout(() => emit({ type: 'fx', kind: 'bolt', id: CASTER, skill: 'star_volley', proj: 'star', element: 'arcane', from: pt(caster), to: TARGET, ms, n, of: 3 }), (n - 1) * 160); return ms + 320; },
    called_star() { const sk = skillOf('called_star') || {}, ms = sk.tv?.sky?.fallMs || 1000; emit({ type: 'fx', kind: 'spell', id: CASTER, ab: 'called_star', shape: 'ground', to: pt(target), r: sk.radius || 5 }); emit({ type: 'fx', kind: 'skyfall', id: CASTER, skill: 'called_star', proj: 'skystar', el: 'arcane', to: pt(target), r: sk.radius || 5, ms }); return ms; },
    star_field() { const sk = skillOf('star_field') || {}; emit({ type: 'fx', kind: 'place', obj: 9001, s: CASTER, skill: 'star_field', x: target.pos.x, z: target.pos.z, r: sk.place?.radius || sk.radius || 6, seconds: sk.place?.seconds || 8, element: 'arcane' }); return 300; },
    wheeling_stars() { const o = skillOf('wheeling_stars')?.orbs || {}; emit({ type: 'fx', kind: 'orbs', id: CASTER, skill: 'wheeling_stars', count: o.count || 3, seconds: o.seconds || 12, element: 'arcane' }); return 0; },
    sky_barrage() {
      const sk = skillOf('sky_barrage') || {}, n = sk.repeats?.count || 10, every = (sk.repeats?.every || 0.4) * 1000, r = sk.radius || 9, fall = sk.tv?.sky?.fallMs || 350;
      emit({ type: 'fx', kind: 'spell', id: CASTER, ab: 'sky_barrage', shape: 'ground', to: pt(target), r, n });
      for (let k = 0; k < n; k++) setTimeout(() => { const a = k * 2.39996, d = r * 0.8 * Math.sqrt((k + 0.5) / n); emit({ type: 'fx', kind: 'skyfall', id: CASTER, skill: 'sky_barrage', proj: 'skystar', el: 'arcane', to: { x: target.pos.x + Math.cos(a) * d, z: target.pos.z + Math.sin(a) * d }, r: 2.2, ms: fall, n: k + 1, of: n }); }, k * every);
      return fall;
    },
  };

  /** Play one skill of the chosen class, from the caster at the target dummy. */
  function playSkill(id) {
    const row = skillList().find(s => s.id === id) || { id, shape: skillOf(id)?.shape, element: skillOf(id)?.element };
    const shape = row.shape || 'bolt';
    caster.yaw = yawTo(caster.pos, target.pos);
    anim(CASTER, motionOf(shape));
    emit({ type: 'cast', s: CASTER, skill: id, aim: pt(target), target: TARGET });
    let hitAt = 300;
    if (cls === 'starcaller' && STAR_SCRIPTS[id]) {
      // the cast event above is the gold glint at the hand; the script sends the rest
      hitAt = STAR_SCRIPTS[id]();
    } else {
      if (shape === 'dash') dashCaster();
      hitAt = flyIfShot(id, shape) ?? 140;
    }
    const el0 = row.element && row.element !== 'physical' ? row.element : undefined;
    if (!['self', 'summon', 'heal', 'buff', 'aura', 'form'].includes(shape)) setTimeout(() => {
      // what the rules send for every landed hit: the `hit` and an `fx impact` naming the skill (the class signature and the
      // Star Blade's gold starburst hang on that one)
      emit({ type: 'fx', kind: 'impact', id: TARGET, s: CASTER, ab: id, el: el0 || 'physical' });
      emit({ type: 'hit', s: CASTER, d: TARGET, n: 10, el: el0, kind: 'dmg', skill: id });
      const L = spells?.lookOf?.(id);
      if (L?.status) { emit({ type: 'fx', kind: 'status', id: TARGET, status: L.status, on: true }); setTimeout(() => emit({ type: 'fx', kind: 'status', id: TARGET, status: L.status, on: false }), 3000); }
      anim(TARGET, 'hit', 700);
    }, hitAt);
    say(`${CLASSES[cls]?.name || cls} · ${row.name || id} (${shape}, ${row.element || '—'})`);
    return true;
  }
  /** A thrown skill: ONE `fx bolt` event, as the rules send it (spells.js flies the body, sig-fx.js its class head). */
  function flyIfShot(id, shape) {
    const L = spells?.lookOf?.(id);
    const head = sigLevelOn() && SIGL?.sigLook?.(cls, id, skillOf(id) || {})?.travel?.kind === 'head';
    if (!(L?.travel?.kind === 'projectile' || (head && shape === 'bolt'))) return null;
    const ms = flightMs(caster, target, 30), n = Math.max(1, Math.min(5, skillOf(id)?.projectiles || 1));
    for (let k = 1; k <= n; k++) emit({ type: 'fx', kind: 'bolt', id: CASTER, skill: id, element: L?.element || 'arcane', from: pt(caster), to: TARGET, ms, ...(n > 1 ? { n: k, of: n } : {}) });
    return ms;
  }
  const sigLevelOn = () => !LVL || LVL.drawFor(level, { s: CASTER }, focus(), { signature: true }) !== 'none';

  // ---- forms, staffs, foci, swings ----
  let formEl = 'arcane';
  function playForm(key) {
    const st = forms?.styles?.[key] || { shape: 'bolt' }, ms = flightMs(caster, target, 24);
    caster.yaw = yawTo(caster.pos, target.pos);
    anim(CASTER, 'cast');
    emit({ type: 'cast', s: CASTER, skill: 'basic', slot: 0, form: key, wk: st.shape === 'bolt' ? 'bolt' : 'staff' });
    const base = { id: CASTER, el: formEl, element: formEl, form: key, basic: 1, wk: 'bolt', wt: 'wand' };
    if (st.shape === 'bolt') {
      const n = key === 'fan' ? 3 : 1;
      for (let k = 1; k <= n; k++) emit({ type: 'fx', kind: 'bolt', ...base, from: pt(caster), to: TARGET, ms, ...(n > 1 ? { n: k, of: n } : {}) });
      if (key === 'chain' || key === 'fork') setTimeout(() => emit({ type: 'fx', kind: 'chain', id: CASTER, el: formEl, first: TARGET, targets: [SECOND], fork: key === 'fork' }), ms);
      if (key === 'ward') setTimeout(() => emit({ type: 'fx', kind: 'ward', id: CASTER, el: formEl, amt: 20 }), ms);
      setTimeout(() => emit({ type: 'hit', s: CASTER, d: TARGET, n: 8, el: formEl, kind: 'dmg' }), ms);
    } else {
      const yaw = yawTo(caster.pos, target.pos), reach = Math.hypot(target.pos.x - caster.pos.x, target.pos.z - caster.pos.z) + 1;
      emit({ type: 'fx', kind: 'attack', ...base, wk: 'staff', wt: 'staff', shape: st.shape, x: caster.pos.x, z: caster.pos.z, yaw, reach: st.shape === 'nova' ? undefined : reach,
        r: st.radius, arc: st.arc, to: st.shape === 'lob' || st.shape === 'beam' ? pt(target) : undefined, ward: key === 'ward' ? 1 : undefined });
    }
    say(`Attack form: ${st.name || key} — ${String(st.text || st.castForm || st.shape).replace('{el}', formEl)}`);
  }
  /** A staff's own spell going off (weapon-fx draws the flash + shape, form-fx the form's piece). */
  function playStaff(shape) {
    const yaw = yawTo(caster.pos, target.pos), reach = Math.hypot(target.pos.x - caster.pos.x, target.pos.z - caster.pos.z) + 1;
    anim(CASTER, 'cast');
    emit({ type: 'fx', kind: 'attack', id: CASTER, wk: 'staff', wt: 'staff', el: formEl, shape, form: shape, x: caster.pos.x, z: caster.pos.z, yaw, reach, r: shape === 'nova' || shape === 'dome' ? 4 : undefined, arc: shape === 'cone' ? 0.9 : shape === 'jet' ? 0.7 : shape === 'wave' ? 0.45 : undefined, to: shape === 'mortar' || shape === 'lob' ? pt(target) : undefined });
    say('Staff spell: ' + shape + ' (' + formEl + ')');
  }
  function playRider(rider) {
    anim(CASTER, 'cast');
    emit({ type: 'fx', kind: 'rider', id: CASTER, rider, el: formEl, x: target.pos.x, z: target.pos.z, r: 2.5 });
    say('Focus rider: ' + rider);
  }
  function playSwing(wt, { imbue = false, two = false, step = 0 } = {}) {
    const yaw = yawTo(caster.pos, target.pos), near = caster.pos.clone().lerp(target.pos, 0.72);
    caster.pos.copy(near); caster.yaw = yaw;
    anim(CASTER, 'attack');
    emit({ type: 'fx', kind: 'attack', id: CASTER, shape: 'swing', wk: 'melee', wt, el: imbue ? formEl : 'physical', imbue: imbue ? 1 : undefined, two, step, x: near.x, z: near.z, yaw, reach: two ? 2.8 : 2.2, arc: 1.6 });
    setTimeout(() => anim(TARGET, 'hit', 600), 120);
    setTimeout(() => caster.pos.copy(caster.home), 1200);
    say('Swing: ' + wt + (imbue ? ' (sceptre, ' + formEl + ')' : ''));
  }

  // ---- shots, beams, revives, hazards ----
  let shotEl = 'fire';
  function playShot(model) {
    const glowEl = { firebolt: 'fire', orb: shotEl === 'physical' ? 'arcane' : shotEl, shard: 'ice', spark: 'lightning' }[model];
    const solid = !glowEl;
    anim(CASTER, solid ? 'attack' : 'cast');
    const ms = flightMs(caster, target, solid ? 26 : 20);
    emit({ type: 'fx', kind: solid ? (model === 'arrow' || model === 'quarrel' ? 'arrow' : model === 'stone' ? 'shot' : 'thrown') : 'bolt', id: CASTER, proj: model, wt: model === 'quarrel' ? 'crossbow' : undefined, element: solid ? 'physical' : glowEl, from: pt(caster), to: TARGET, ms });
    setTimeout(() => anim(TARGET, 'hit', 600), ms);
    say('Shot model: ' + model);
  }
  let beamEl = 'lightning';
  function playBeam(seconds = 3) {
    const yaw = yawTo(caster.pos, target.pos), len = Math.hypot(target.pos.x - caster.pos.x, target.pos.z - caster.pos.z), pulses = Math.round(seconds / 0.5);
    anim(CASTER, 'cast', seconds * 1000);
    emit({ type: 'fx', kind: 'beam', id: CASTER, skill: 'storm_beam', el: beamEl, x: caster.pos.x, z: caster.pos.z, yaw, len, w: 1.2, ms: seconds * 1000, pulses, every: 0.5 });
    for (let n = 1; n <= pulses; n++) setTimeout(() => { emit({ type: 'fx', kind: 'beamPulse', id: CASTER, skill: 'storm_beam', n, of: pulses }); anim(TARGET, 'hit', 400); }, n * 500);
    setTimeout(() => emit({ type: 'fx', kind: 'beamEnd', id: CASTER, skill: 'storm_beam', why: 'done' }), seconds * 1000 + 50);
    say('Held beam (' + beamEl + '), ' + pulses + ' pulses');
  }
  function playRevive(style, ms = 1600) {
    const skill = Object.entries(REV?.REVIVE_STYLE || {}).find(([, s]) => s === style)?.[0];
    target.dead = true; anim(TARGET, 'dead', 0);
    setTimeout(() => {
      anim(CASTER, 'cast', ms);
      emit({ type: 'fx', kind: 'reviveCast', id: CASTER, on: TARGET, ab: skill, style, ms });
      setTimeout(() => { target.dead = false; emit({ type: 'fx', kind: 'revive', id: TARGET, by: CASTER, skill, style }); anim(TARGET, 'idle', 0); }, ms);
    }, 700);
    say('Revive: ' + style + (skill ? ' (' + skill + ')' : ''));
  }
  const site = kind => (kind === 'geyser' ? hazardDoc?.geysers?.[0]?.id : hazardDoc?.vents?.[0]?.id);
  function geyser({ toss = false } = {}) {
    const id = site('geyser'); if (!id) return false;
    emit({ type: 'fx', kind: 'geyser', site: id, phase: 'rumble', ms: 1800 });
    setTimeout(() => {
      emit({ type: 'fx', kind: 'geyser', site: id, phase: 'erupt' });
      if (toss) { second.pos.set(HZ.geyser.x + 0.5, 0, HZ.geyser.z); emit({ type: 'fx', kind: 'toss', id: SECOND }); setTimeout(() => second.pos.copy(second.home), 2600); }
    }, 1800);
    say('Geyser: rumble, then erupt' + (toss ? ' (throws a body)' : ''));
    return true;
  }
  function vent() {
    const id = site('vent'); if (!id) return false;
    emit({ type: 'fx', kind: 'lavaVent', site: id, phase: 'warn', ms: 1600 });
    setTimeout(() => emit({ type: 'fx', kind: 'lavaVent', site: id, phase: 'spout' }), 1600);
    say('Lava vent: warning, then spout');
    return true;
  }
  const lookAtHazards = () => { camera.position.set(-2, 10, -4); controls.target.set(0, 3, -25); controls.update(); };

  // ---- UI ----
  const classSel = select('Class', Object.entries(CLASSES).map(([id, C]) => ({ value: id, label: C.name + (looksById.get(id)?.game === 'thousandvale' ? ' (Thousandvale)' : '') })), cls, v => setClass(v));
  const skillBox = el('div', { class: 'tv-skills' });
  const classNote = el('p', { class: 'small muted' });
  const moteBox = el('div', { class: 'tv-btns' });
  function drawSkills() {
    classSel.set(cls);
    const C = CLASSES[cls] || {};
    classNote.textContent = C.hook || '';
    skillBox.replaceChildren(...skillList().map(s => el('button', { class: 'tv-skill', dataset: { skill: s.id }, onclick: () => playSkill(s.id), title: s.desc || '' },
      el('div', { class: 'name', text: s.name }), el('div', { class: 'meta', text: `level ${s.level} · ${s.shape} · ${s.element}` + (SIGL?.sigLook?.(cls, s.id, skillOf(s.id) || {}) ? ' · signature' : isStar(s.id) ? ' · gold stars' : '') }))));
    moteBox.parentElement && (moteBox.parentElement.hidden = cls !== 'starcaller');
  }
  async function playAll(gap = 1700) { for (const s of skillList()) { playSkill(s.id); await sleep(gap); } }
  for (let n = 0; n <= 5; n++) moteBox.append(button(String(n), () => { try { stars?.setMotes(CASTER, n); } catch {} say('Starlight: ' + n + ' (the Constellation motes behind the shoulders)'); }));

  const levelSel = LVL ? select('Spell effects', LVL.FX_LEVELS.map(l => ({ value: l.id, label: l.label })), level, v => { level = v; try { spells?.setLevel(v); } catch {} try { sig?.setLevel(v); } catch {} say('Spell effects: ' + v); }) : el('span');
  const moteWrap = el('div', {}, el('p', { class: 'small muted', text: 'Starlight held (the Starcaller only):' }), moteBox);
  left.append(
    panel('Class', classSel, classNote, el('div', { class: 'row' }, button('▶ Play all six', () => playAll(), 'primary'))),
    panel('Skills', skillBox, el('p', { class: 'small muted', html: 'The element effects come from <code>spells.js</code>; every class but the Starcaller adds its own signature shapes from <code>sig-looks.js</code>/<code>sig-fx.js</code>; the Starcaller and Star Blade draw gold stars from <code>star-fx.js</code>.' })),
    moteWrap,
    panel('Settings', levelSel, el('p', { class: 'small muted', text: 'The game\'s Settings → Graphics → Spell effects. Reduced keeps full effects for your own spells (this caster); Off keeps only what flies.' })),
  );
  drawSkills();

  const elSel = (label, val, set) => select(label, ELEMENTS.map(e => ({ value: e, label: e })), val, set);
  const formStyles = Object.keys(forms?.styles || {});
  const groups = [];
  if (FORM && formStyles.length) groups.push(panel('Caster attack forms', elSel('Element', formEl, v => { formEl = v; }),
    el('div', { class: 'tv-btns' }, ...formStyles.map(k => button(forms.styles[k].name || k, () => playForm(k)))),
    el('p', { class: 'small muted', html: 'A wand, staff or tome\'s basic attack (<code>caster-forms.json</code> <code>styles</code>), drawn by <code>form-fx.js</code> on top of the shot.' }),
    el('div', { class: 'tv-btns' }, ...['cone', 'wave', 'jet', 'nova', 'dome', 'wall', 'mortar'].map(k => button('Staff ' + k, () => playStaff(k)))),
    el('div', { class: 'tv-btns' }, ...Object.keys(forms?.focusRiders || { echo: 1, burst: 1, ward: 1, siphon: 1 }).map(k => button('Focus ' + k, () => playRider(k)))),
    el('div', { class: 'tv-btns' }, button('Sceptre swing', () => playSwing('sceptre', { imbue: true })))));
  if (WPN) groups.push(panel('Weapon swings', el('div', { class: 'tv-btns' },
    ...[['sword'], ['sword2h', { two: true }], ['dagger'], ['axe'], ['hammer', { two: true }], ['halberd', { two: true }], ['spear'], ['fist']].map(([w, o]) => button(w, () => playSwing(w, o)))),
    el('p', { class: 'small muted', html: 'A basic swing of each weapon type (<code>weapon-fx.js</code> <code>weaponLook</code>).' })));
  if (SHOT && KINDS?.MODELS) groups.push(panel('Shot models', elSel('Orb element', shotEl, v => { shotEl = v; }),
    el('div', { class: 'tv-btns' }, ...KINDS.MODELS.map(m => button(m, () => playShot(m)))),
    el('p', { class: 'small muted', html: `${KINDS.MODELS.length} bodies from <code>projectiles.js</code> (which one flies: <code>projectile-kinds.js</code>).` })));
  if (beams) groups.push(panel('Held beam', select('Element', Object.keys(BEAM?.BEAM_COLOURS || { lightning: 1, fire: 1, arcane: 1 }).map(e => ({ value: e, label: e })), beamEl, v => { beamEl = v; }),
    el('div', { class: 'tv-btns' }, button('Beam 3 s', () => playBeam(3), 'primary'), button('Beam 6 s', () => playBeam(6))),
    el('p', { class: 'small muted', html: 'One held beam with a flare on every pulse (<code>beam-fx.js</code>).' })));
  if (reviveFx) groups.push(panel('Revives', el('div', { class: 'tv-btns' }, ...Object.keys(REV.REVIVE_LOOK).map(s => button(s, () => playRevive(s)))),
    el('p', { class: 'small muted', html: 'The six class revives (<code>revive-fx.js</code>): the target falls, the caster raises it.' })));
  if (vharl) groups.push(panel('Island hazards (Vharlen)', el('div', { class: 'tv-btns' },
    button('Look at them', lookAtHazards), button('Geyser', () => geyser()), button('Geyser + throw', () => geyser({ toss: true })), button('Lava vent', vent),
    button('Ashfall on/off', () => { ashOn = !ashOn; say('Ashfall ' + (ashOn ? 'on' : 'off') + ' (it drifts in over a few seconds)'); })),
    el('p', { class: 'small muted', html: 'The Burning Isle\'s first hot spring, geyser and lava vent from <code>data/provinces/vharlen-hazards.json</code>, moved onto this stage and drawn by <code>vharlen-fx.js</code>. The spring\'s water here is a stand-in (in the game it is the terrain\'s). The danger circles you see in the game are the telegraph system, not part of this file.' })));
  if (missing.length) groups.push(panel('Not loaded', el('ul', { class: 'small tv-missing' }, ...missing.map(m => el('li', { text: m })))));
  right.append(...groups);
  camRow.append(el('label', { text: 'Camera' }), button('Stage', home, 'small'), button('Hazards', lookAtHazards, 'small'), button('Close up', () => { camera.position.set(-1, 3.5, 8); controls.target.set(0, 1.2, 0); controls.update(); }, 'small'));

  if (args.cls && CLASSES[args.cls] && args.cls !== cls) await setClass(args.cls);
  say(`${Object.keys(CLASSES).length} classes · ${[...SKILL_CLASS.keys()].length} skills · press a skill`);
  document.body.dataset.tvReady = '1';

  const api = {
    THREE, scene, camera, renderer, actors, emit, log,
    modules: { spells, sig, stars, beams, weaponFx, formFx, reviveFx, shots, vharl },
    missing,
    classes: () => Object.keys(CLASSES),
    get cls() { return cls; },
    setClass, skills: () => skillList().map(s => s.id), play: playSkill, playAll,
    form: playForm, forms: () => formStyles, staff: playStaff, rider: playRider, swing: playSwing,
    shot: playShot, models: () => KINDS?.MODELS || [], beam: playBeam, revive: playRevive, revives: () => Object.keys(REV?.REVIVE_LOOK || {}),
    geyser, vent, ash: v => { ashOn = v == null ? !ashOn : !!v; return ashOn; }, lookAtHazards, home,
    setLevel: v => { level = v; spells?.setLevel(v); sig?.setLevel(v); },
    motes: n => stars?.setMotes(CASTER, n),
    stats: () => ({ spells: spells?.stats, sig: sig?.stats, stars: stars?.stats, shots: shots?.stats, forms: formFx?.stats, revives: reviveFx?.stats, weapon: weaponFx?.stats, hazards: vharl?.stats?.() }),
  };
  window.tvFx = api;
  return api;
}
