// Everything that flashes, flies and fades: shots by look, warning circles that fill until they land, bursts, the
// sanctuary dome, spell effects by `fx` key, Breaker, hit sparks, damage numbers (whole numbers via shared/format.js,
// crits bigger, "Blocked" / "Perfect!"), level-up, loot that flies to its hero in its rarity colour, gold, food,
// crate planks, swing arcs and enemy beams. Every object is pooled: made at load, shown and hidden, never disposed mid-
// fight, and no light is ever added or hidden (lessons rule 29).
import * as THREE from 'three';
import { hp as fmtHp } from '../../../../shared/format.js';
import { glowTex, glyphAtlas, clamp01, mergeGroup } from './kit.js';
import { createActsFx } from './fx-acts.js';

const SHOT_LOOKS = {
  spark: { color: '#9ff0ff', core: '#ffffff', size: 0.34, trail: '#5ac8ff' },
  arcane: { color: '#c78cff', core: '#ffffff', size: 0.42, trail: '#8a5ad8' },
  fire: { color: '#ff8a2a', core: '#fff0a0', size: 0.5, trail: '#ff4a10' },
  blade: { color: '#e8f4ff', core: '#ffffff', size: 0.28, trail: '#9ad0ff', mesh: 'blade' },
  thorn: { color: '#9ad850', core: '#e8ffb0', size: 0.3, trail: '#4a8a2a', mesh: 'thorn' },
  bolt: { color: '#e0d0b0', core: '#ffffff', size: 0.16, trail: '#a89070', mesh: 'bolt' },
  lantern: { color: '#c6ff5a', core: '#f4ffd0', size: 0.48, trail: '#8ac020' },
  wyrmfire: { color: '#ff6a20', core: '#ffe080', size: 0.6, trail: '#d83010' },
  hook: { color: '#c8ccd2', core: '#ffffff', size: 0.2, trail: '#6a6e72', mesh: 'hook', chain: true },   // Grell's thrown hook (sim: shot.pull)
  // Acts II/III
  arrow: { color: '#c8b89a', core: '#ffffff', size: 0.14, trail: '#8a7a60', mesh: 'bolt' },
  net: { color: '#c8b88a', core: '#fff4d8', size: 0.3, trail: '#8a7a5a', mesh: 'net' },
  glass: { color: '#7affa0', core: '#e8ffe8', size: 0.36, trail: '#3aff7a', mesh: 'shard' },
  bluelamp: { color: '#6ac8ff', core: '#e8f8ff', size: 0.5, trail: '#3a8aff' },
};
const CLASS_ARC = { vanguard: '#ffd27a', duelist: '#8ff0e8', arcanist: '#d4a8ff', warden: '#fff4d0' };
const TEAM_WARN = ['#ffd36a', '#ff4a2a'];

export function createFx({ scene, data, quality = 'high', camera, size = () => ({ w: 1280, h: 720 }) }) {
  const low = quality === 'low';
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  const atlas = glyphAtlas();
  const live = [];            // { o, t, life, upd(k, dt, e), done() }
  const add = (o) => { o.visible = false; root.add(o); return o; };

  // ---------------------------------------------------------------- pools
  const pools = {};
  function pool(name, make, n) { pools[name] = { free: [], make, all: [] }; for (let i = 0; i < n; i++) { const o = add(make()); pools[name].free.push(o); pools[name].all.push(o); } }
  function take(name) { const p = pools[name]; let o = p.free.pop(); if (!o) { o = add(p.make()); p.all.push(o); } o.visible = true; return o; }
  function give(name, o) { o.visible = false; o.position.set(0, -50, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); pools[name].free.push(o); }

  const glow = glowTex();
  const addMat = (c = '#ffffff') => new THREE.SpriteMaterial({ map: glow, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flat = (geo, additive = true, side = THREE.DoubleSide) => () => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  const ringG = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
  const discG = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  const colG = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);
  const domeG = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const shellG = new THREE.SphereGeometry(1, 20, 14);
  const arcG = (() => { const g = new THREE.RingGeometry(0.75, 1, 24, 1, -Math.PI * 0.42, Math.PI * 0.84); return g; })();
  const plankG = new THREE.BoxGeometry(0.5, 0.06, 0.14);
  const rockG = new THREE.DodecahedronGeometry(0.16, 0);
  const beamG = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0);
  pool('spark', () => new THREE.Sprite(addMat()), low ? 90 : 200);
  pool('ring', flat(ringG), 24);
  pool('disc', flat(discG, false), 16);
  pool('col', flat(colG), 10);
  pool('dome', flat(domeG, true, THREE.DoubleSide), 3);
  pool('shell', flat(shellG), 6);
  pool('arc', flat(arcG), 14);
  pool('beam', flat(beamG), 3);
  pool('plank', () => { const m = new THREE.Mesh(plankG, new THREE.MeshToonMaterial({ color: 0x9a6a3a })); m.castShadow = false; return m; }, 30);
  pool('rock', () => new THREE.Mesh(rockG, new THREE.MeshToonMaterial({ color: 0x7a6a5a })), 30);
  pool('glyph', () => { const t = atlas.tex.clone(); t.needsUpdate = true; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.renderOrder = 30; return s; }, low ? 60 : 140);

  // ---------------------------------------------------------------- primitives
  function spawn(name, life, upd, setup) {
    const o = take(name); if (setup) setup(o);
    live.push({ o, name, t: 0, life, upd });
    return o;
  }
  /** n sparks from a point: speed, spread up, colour, size, life, gravity. */
  function sparks(x, y, z, color, n = 8, { speed = 4, up = 2.5, size = 0.22, life = 0.45, grav = 9, drag = 2, zSpread = 1 } = {}) {
    if (low) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = speed * (0.4 + Math.random() * 0.6);
      const v = new THREE.Vector3(Math.cos(a) * u, up * (0.3 + Math.random()), Math.sin(a) * u * 0.6 * zSpread);
      const L = life * (0.7 + Math.random() * 0.6), s0 = size * (0.7 + Math.random() * 0.6);
      spawn('spark', L, (o, k, dt) => {
        v.y -= grav * dt; v.multiplyScalar(Math.max(0, 1 - drag * dt));
        o.position.addScaledVector(v, dt); o.material.opacity = 1 - k * k; o.scale.setScalar(s0 * (1 - k * 0.6));
      }, o => { o.position.set(x, y, z); o.material.color.set(color); o.material.opacity = 1; o.scale.setScalar(s0); });
    }
  }
  function flash(x, y, z, color, size = 1.2, life = 0.16) {
    spawn('spark', life, (o, k) => { o.scale.setScalar(size * (0.6 + k * 0.8)); o.material.opacity = 1 - k; }, o => { o.position.set(x, y, z); o.material.color.set(color); o.material.opacity = 1; });
  }
  function ring(x, z, r, color, life = 0.5, { y = 0.06, from = 0.2, opacity = 1, vertical = false, face = 1 } = {}) {
    spawn('ring', life, (o, k) => { const s = r * (from + (1 - from) * Math.sqrt(k)); o.scale.setScalar(s); o.material.opacity = opacity * (1 - k); },
      o => { o.position.set(x, y, z); o.material.color.set(color); o.material.opacity = opacity; if (vertical) o.rotation.set(Math.PI / 2, 0, 0); if (vertical) o.rotation.y = face * Math.PI / 2; });
  }
  function column(x, z, r, h, color, life = 0.6, { grow = false } = {}) {
    spawn('col', life, (o, k) => { o.scale.set(r * (1 - k * 0.5), grow ? h * Math.min(1, k * 4) : h, r * (1 - k * 0.5)); o.material.opacity = 0.32 * (1 - k); },   // light enough to see the hero inside
      o => { o.position.set(x, 0, z); o.material.color.set(color); o.material.opacity = 0.75; o.scale.set(r, h, r); });
  }
  function debris(name, x, y, z, n, color, { speed = 4, up = 5, life = 0.9 } = {}) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * speed, up * (0.5 + Math.random() * 0.7), (Math.random() - 0.3) * speed * 0.6);
      const w = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      spawn(name, life + Math.random() * 0.3, (o, k, dt) => {
        v.y -= 14 * dt; o.position.addScaledVector(v, dt);
        if (o.position.y < 0.04) { o.position.y = 0.04; v.y *= -0.3; v.x *= 0.6; v.z *= 0.6; w.multiplyScalar(0.6); }
        o.rotation.x += w.x * dt; o.rotation.y += w.y * dt; o.rotation.z += w.z * dt;
        const s = k > 0.75 ? 1 - (k - 0.75) * 4 : 1; o.scale.setScalar(Math.max(0.01, s));
      }, o => { o.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4); o.material.color.set(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12); });
    }
  }

  // Acts II/III: strips, looks, hazards, rises, giants, the sky fire (fx-acts.js); its pools are made here, at load
  const actsKit = () => ({ root, pool, take, give, spawn, sparks, flash, ring, column, debris, text, after, low, flat, glow });
  let acts = null;

  // ---------------------------------------------------------------- text (glyph sprites)
  function glyph(o, key) {
    const r = atlas.rects[key]; const t = o.material.map;
    t.repeat.set(r.w / atlas.W, r.h / atlas.H); t.offset.set(r.x / atlas.W, 1 - (r.y + r.h) / atlas.H);
    return r;
  }
  // ---------------------------------------------------------------- labels: rising text that never sits on other text
  // Every floating number or word is ONE label (its glyph sprites move together). A new label that would land within
  // ~40 px of a live one is lifted above it (rule 15), and at most MAX_LABELS live at once: over the cap the oldest
  // GAIN label (xp/gold, heals, food) goes first; damage numbers and combat words are never dropped (rule 42).
  const labels = [], MAX_LABELS = 12, NEAR_PX = 40;
  const pv = new THREE.Vector3();
  const screen = (x, y, z) => { pv.set(x, y, z).project(camera); const s2 = size(); return { x: (pv.x * 0.5 + 0.5) * s2.w, y: (-pv.y * 0.5 + 0.5) * s2.h }; };
  const worldPerPx = (x, y, z) => { pv.set(x, y, z); const d = camera.position.distanceTo(pv); return (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, size().h); };
  function dropLabel(L) { for (const g of L.glyphs) give('glyph', g.o); labels.splice(labels.indexOf(L), 1); }
  /** Rising text over a spot: a number string ("1,204", "+12 xp · +4 gold") or a word from WORDS. kind: 'damage' | 'word' | 'gain'. */
  function text(x, y, z, str, color, size0 = 0.42, { life = 0.85, rise = 1.1, word = false, kind = 'damage' } = {}) {
    if (kind === 'damage' && !api.showDamage) return;      // the player turned damage numbers off (gains and words stay)
    if (labels.length >= MAX_LABELS) {
      const oldGain = labels.find(L => L.kind === 'gain');
      if (oldGain) dropLabel(oldGain); else if (kind === 'gain') return;
    }
    const keys = word ? [str] : [...String(str)].filter(c => atlas.rects[c] || c === ' ');
    if (word && !atlas.rects[str]) { console.warn('wyrmroad: no glyph for the word', str); return; }   // kit.js WORDS lists every word
    const adv = k => (k === ' ' ? 0.32 : word ? atlas.rects[k].w / atlas.rects[k].h : atlas.rects[k].adv * 0.72) * size0;
    const total = keys.reduce((a, k) => a + adv(k), 0);
    // lift above any live label that is (or will be) within ~40 px on screen
    const wpp = worldPerPx(x, y, z), wPx = total / wpp, hPx = size0 / wpp;
    // try straight up first, then columns to the right and left; never above the top edge (room for the rise)
    const top = rise / wpp + hPx + 12;
    const hitAt = (sx, lift) => { const me = screen(x + sx, y + lift, z); return labels.find(L => { const o = screen(L.x, L.y + L.cur, L.z); return Math.abs(o.x - me.x) < Math.max(NEAR_PX, (L.wPx + wPx) * 0.6 + 10) && Math.abs(o.y - me.y) < Math.max(NEAR_PX * 0.75, (L.hPx + hPx) * 0.6 + 8); }); };   // 0.6: room for the pop-in scale
    let place = null;
    for (const col of [0, 1, -1, 2, -2]) {
      const sx = col * (Math.max(NEAR_PX, wPx) + 8) * wpp;
      let lift = 0;
      for (let n = 0; n < 8; n++) {
        if (screen(x + sx, y + lift, z).y < top) break;
        const hit = hitAt(sx, lift);
        if (!hit) { place = { sx, lift }; break; }
        lift += (hit.hPx + hPx) / 2 * wpp + 6 * wpp + Math.max(0, screen(x + sx, y + lift, z).y - screen(hit.x, hit.y + hit.cur, hit.z).y) * wpp;
      }
      if (place) break;
    }
    if (!place) { if (kind === 'gain') return; place = { sx: 0, lift: 0 }; }      // no free spot: a gain waits for the next one
    const L = { kind, x: x + place.sx, y, z, t: 0, life, rise, size: size0, lift: place.lift, cur: place.lift, wPx, hPx, word, glyphs: [] };
    let cx = -total / 2;
    for (const k of keys) {
      const w = adv(k), ox = cx + w / 2; cx += w;
      if (k === ' ') continue;
      const o = take('glyph'); glyph(o, k); o.material.color.set(color); o.material.opacity = 1; o.position.set(L.x + ox, y + L.lift, z);
      L.glyphs.push({ o, k, ox });
    }
    labels.push(L);
  }
  function updateLabels(dt) {
    for (let i = labels.length - 1; i >= 0; i--) {
      const L = labels[i]; L.t += dt;
      const k = Math.min(1, L.t / L.life), pop = 0.12;
      if (k >= 1) { dropLabel(L); continue; }
      const sc = k < pop ? 0.6 + (k / pop) * 0.6 : (k < pop * 2 ? 1.2 - ((k - pop) / pop) * 0.2 : 1);
      L.cur = L.lift + L.rise * k;      // every label rises at the same speed, so a stack keeps its spacing
      for (const g of L.glyphs) {
        const r = atlas.rects[g.k];
        g.o.position.set(L.x + g.ox, L.y + L.cur, L.z);
        g.o.scale.set(L.size * sc * (L.word ? r.w / r.h : 0.67), L.size * sc, 1);
        g.o.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      }
    }
  }

  // ---------------------------------------------------------------- state-driven: shots, zones, sanctuary, beams
  const shots = new Map(), warns = new Map(), domes = new Map(), beams = new Map();
  function makeShot(s) {
    const L = s.look?.startsWith('thrown:') ? null : (SHOT_LOOKS[s.look] || SHOT_LOOKS.spark);
    const core = take('spark'), halo = take('spark');
    core.material.color.set(L ? L.core : '#ffffff'); halo.material.color.set(L ? L.color : '#ffd890');
    core.material.opacity = 1; halo.material.opacity = 0.85;
    let body = null;
    if (!L) body = thrownMesh(s.look.slice(7));
    else if (L.mesh) body = shotMesh(L.mesh, L.color);
    return { core, halo, body, L, lastTrail: 0, x: s.x, y: s.y, z: s.z, chain: L?.chain ? chainMesh() : null };
  }
  const meshCache = { blade: [], thorn: [], bolt: [], hook: [], net: [], shard: [] }, thrownCache = new Map();
  // a hook's chain: a thin rod from the thrower's hand to the hook, stretched every frame (owner from the 'shot' event)
  const shotOwner = new Map(), chainCache = [];
  function chainMesh() {
    let m = chainCache.pop();
    if (!m) { m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 5).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshToonMaterial({ color: '#8a8e94', emissive: '#3a3e44', emissiveIntensity: 0.4 })); root.add(m); }
    m.visible = true; return m;
  }
  for (let i = 0; i < 2; i++) { const m = chainMesh(); m.visible = false; chainCache.push(m); }   // made at load (rule 29)
  function syncChain(v, s, G) {
    const o = G.foes.find(f => f.id === shotOwner.get(s.id));
    if (!o) { v.chain.visible = false; return; }
    const hx = o.x + (o.dir || 1) * 0.45, hy = (o.y || 0) + 1.15, hz = o.z;
    v.chain.visible = true; v.chain.position.set(hx, hy, hz);
    const len = Math.max(0.05, Math.hypot(v.x - hx, v.y - hy, v.z - hz));
    v.chain.scale.set(1, 1, len); v.chain.lookAt(v.x, v.y, v.z);
  }
  function shotMesh(kind, color) {
    let m = meshCache[kind].pop();
    if (!m) {
      const g = kind === 'net' ? new THREE.TorusGeometry(0.3, 0.025, 4, 12).rotateY(Math.PI / 2) : kind === 'shard' ? new THREE.OctahedronGeometry(0.2, 0).scale(1.6, 0.5, 0.5) : kind === 'hook' ? new THREE.TorusGeometry(0.16, 0.035, 5, 10, Math.PI * 1.3).rotateZ(-Math.PI / 2) : kind === 'blade' ? new THREE.ConeGeometry(0.07, 0.55, 4).rotateZ(-Math.PI / 2) : kind === 'thorn' ? new THREE.ConeGeometry(0.08, 0.45, 5).rotateZ(-Math.PI / 2) : new THREE.CylinderGeometry(0.02, 0.02, 0.7, 5).rotateZ(Math.PI / 2);
      m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ color, emissive: color, emissiveIntensity: 0.5 })); m.userData.kind = kind; root.add(m);
    }
    m.visible = true; return m;
  }
  function thrownMesh(part) {
    const pid = Object.keys(data.chapters.pickups).find(k => data.chapters.pickups[k].held === part) || 'log';
    const list = thrownCache.get(pid) || []; thrownCache.set(pid, list);
    let m = list.pop();
    if (!m) { m = mergeGroup(groundWeaponMesh(pid, data.chapters.pickups[pid]?.color)); m.userData.thrown = pid; root.add(m); }
    m.visible = true; return m;
  }
  function dropShot(v) {
    give('spark', v.core); give('spark', v.halo);
    if (v.chain) { v.chain.visible = false; chainCache.push(v.chain); }
    if (v.body) { v.body.visible = false; if (v.body.userData.thrown) thrownCache.get(v.body.userData.thrown).push(v.body); else meshCache[v.body.userData.kind].push(v.body); }
  }

  function syncShots(G, dt) {
    const seen = new Set();
    for (const s of G.shots) {
      seen.add(s.id);
      let v = shots.get(s.id);
      if (!v) { v = makeShot(s); shots.set(s.id, v); }
      // shots move fast and straight: smooth toward the sim spot (it is ahead of the drawn frame by < 1 step)
      v.x += (s.x - v.x) * Math.min(1, dt * 30); v.y += (s.y - v.y) * Math.min(1, dt * 30); v.z += (s.z - v.z) * Math.min(1, dt * 30);
      if (Math.abs(s.x - v.x) > 2) { v.x = s.x; v.y = s.y; v.z = s.z; }
      const L = v.L, sz = L ? L.size : 0.4, pulse = 1 + Math.sin(performance.now() / 50 + s.id) * 0.12;
      v.core.position.set(v.x, v.y, v.z); v.core.scale.setScalar(sz * 0.55 * pulse);
      if (v.chain) syncChain(v, s, G);
      v.halo.position.set(v.x, v.y, v.z); v.halo.scale.setScalar(sz * 1.5 * pulse);
      if (v.body) {
        v.body.position.set(v.x, v.y, v.z);
        if (v.body.userData.thrown) { v.body.rotation.z -= (s.dir || 1) * dt * 16; v.body.rotation.y = 0; }
        else v.body.rotation.y = (s.dir || 1) > 0 ? 0 : Math.PI;
      }
      v.lastTrail += dt;
      if (L && v.lastTrail > (low ? 0.06 : 0.025)) {
        v.lastTrail = 0;
        const tx = v.x, ty = v.y, tz = v.z, c = L.trail, s0 = sz * 0.9;
        spawn('spark', 0.28, (o, k) => { o.scale.setScalar(s0 * (1 - k)); o.material.opacity = 0.7 * (1 - k); }, o => { o.position.set(tx, ty + (Math.random() - 0.5) * 0.06, tz); o.material.color.set(c); });
      }
    }
    for (const [id, v] of shots) if (!seen.has(id)) { dropShot(v); shots.delete(id); shotOwner.delete(id); }
  }

  function syncZones(G) {
    const seenW = new Set(), seenD = new Set();
    for (const zn of G.zones) {
      if (zn.kind === 'sanctuary') {
        seenD.add(zn.id);
        let d = domes.get(zn.id);
        if (!d) { d = { dome: take('dome'), ring: take('ring'), disc: take('disc') }; domes.set(zn.id, d); d.dome.material.color.set('#ffe9a0'); d.ring.material.color.set('#fff2c0'); d.disc.material.color.set('#ffe08a'); }
        const life = zn.life || 7, k = zn.t / life, fade = k > 0.85 ? (1 - k) / 0.15 : Math.min(1, zn.t * 3);
        // the sanctuary's rule is a true circle on the ground (brawl.js stepZones), so it is drawn as one
        d.dome.position.set(zn.x, 0, zn.z); d.dome.scale.set(zn.r, zn.r * 0.75, zn.r); d.dome.material.opacity = 0.16 * fade + 0.04 * Math.sin(zn.t * 4) * fade;
        d.ring.position.set(zn.x, 0.05, zn.z); d.ring.scale.set(zn.r, 1, zn.r); d.ring.material.opacity = 0.8 * fade;
        d.disc.position.set(zn.x, 0.04, zn.z); d.disc.scale.set(zn.r, 1, zn.r); d.disc.material.opacity = 0.12 * fade;
        if (Math.random() < 0.25) sparks(zn.x + (Math.random() - 0.5) * zn.r * 1.6, 0.2, zn.z + (Math.random() - 0.5) * zn.r, '#fff0b0', 1, { speed: 0.2, up: 2.4, grav: -1, life: 0.9, size: 0.14 });
        continue;
      }
      if (!(zn.delay > 0) || zn.t >= zn.delay) continue;
      if (zn.shape === 'col' || zn.shape === 'row') continue;          // strips: fx-acts.js
      seenW.add(zn.id);
      let w = warns.get(zn.id);
      const c = TEAM_WARN[zn.team === 0 ? 0 : 1];
      if (!w) {
        w = { ring: take('ring'), disc: take('disc'), fill: take('disc') };
        w.ring.material.color.set(c); w.disc.material.color.set(c); w.fill.material.color.set(c);
        warns.set(zn.id, w);
        if (zn.team === 0 && zn.r >= 3) meteorFall(zn);
      }
      const k = clamp01(zn.t / zn.delay), rz = 1 / 1.2;     // the sim measures depth 1.2× (hit test), so the circle is squashed to match
      w.ring.position.set(zn.x, 0.07, zn.z); w.ring.scale.set(zn.r, 1, zn.r * rz); w.ring.material.opacity = 0.75 + 0.25 * Math.sin(zn.t * 18);
      w.disc.position.set(zn.x, 0.05, zn.z); w.disc.scale.set(zn.r, 1, zn.r * rz); w.disc.material.opacity = 0.16;
      w.fill.position.set(zn.x, 0.06, zn.z); w.fill.scale.set(zn.r * k, 1, zn.r * rz * k); w.fill.material.opacity = 0.22 + 0.3 * k;
    }
    for (const [id, w] of warns) if (!seenW.has(id)) { give('ring', w.ring); give('disc', w.disc); give('disc', w.fill); warns.delete(id); }
    for (const [id, d] of domes) if (!seenD.has(id)) { give('dome', d.dome); give('ring', d.ring); give('disc', d.disc); domes.delete(id); }
  }
  function meteorFall(zn) {
    const x = zn.x, z = zn.z, dly = zn.delay;
    spawn('shell', dly, (o, k) => {
      o.position.set(x - 6 * (1 - k), 0.4 + 14 * (1 - k), z); o.scale.setScalar(0.7);
      if (Math.random() < 0.6) sparks(o.position.x, o.position.y, z, Math.random() < 0.5 ? '#ff7a20' : '#ffd060', 1, { speed: 0.6, up: 0.5, grav: 0, life: 0.4, size: 0.5 });
    }, o => { o.material.color.set('#ff9a40'); o.material.opacity = 0.95; });
  }

  // beams (golem eye beam, Lamplord's wyrmfire): a line on the ground during the wind-up, then the beam itself
  function beamFor(G, ev, actors) {
    const f = G.foes.find(o => o.id === ev.id); if (!f) return;
    const def = f.def; const mv = def?.moves?.find(m => m.id === ev.mv); if (!mv?.beam) return;
    const a = actors?.get(f.id);
    const hot = mv.t[1], len = mv.beam.len, depth = mv.beam.depth || 0.7;
    const color = f.kind === 'lamplord' ? '#ff7a20' : '#c6ff5a';
    const tellO = take('disc');
    const at = () => a ? a.group.position : { x: f.x, y: f.y, z: f.z };
    live.push({ o: tellO, name: 'disc', t: 0, life: ev.wind, upd: (o, k) => { const p = at(); o.position.set(p.x + f.dir * len / 2, 0.06, p.z); o.scale.set(len / 2, 1, depth); o.material.opacity = 0.12 + 0.25 * k; } });
    tellO.material.color.set(TEAM_WARN[1]);
    const b = take('beam'); b.visible = false; b.material.color.set(color);
    live.push({ o: b, name: 'beam', t: -ev.wind, life: hot + 0.15, upd: (o, k, dt, t) => {
      if (t < 0) { o.visible = false; return; }
      o.visible = true; const p = at(); const h = (f.def.height || 2) * 0.62;
      o.position.set(p.x + f.dir * 0.4, p.y + h, p.z); o.rotation.y = f.dir > 0 ? 0 : Math.PI;
      const fl = 1 + Math.sin(t * 60) * 0.15; o.scale.set(len, 0.45 * fl * (1 - k * 0.6), depth * 0.6 * fl);
      o.material.opacity = 0.75 * (1 - k * 0.7);
      if (Math.random() < 0.5) sparks(p.x + f.dir * Math.random() * len, h * 0.5, p.z, color, 1, { speed: 1, up: 2, life: 0.3, size: 0.3 });
    } });
  }

  // swing arcs in front of a hero's strike, in the class colour, at the moment the hit lands
  function swingArc(a, e, ev, G) {
    if (!a || !e) return;
    const mvDef = ev.kind === 'combo' || ev.kind === 'heavy' || ev.kind === 'air' || ev.kind === 'dash' || ev.kind === 'pickup';
    if (!mvDef) return;
    const color = CLASS_ARC[e.cls] || '#ffffff', big = ev.kind === 'heavy' || ev.kind === 'dash';
    const delay = ev.wind || 0.1, life = 0.2;
    const o = take('arc'); o.visible = false; o.material.color.set(color);
    const tilt = (Math.random() - 0.5) * 0.9;
    let dir = null;   // read when the blow lands: a hero may turn during the wind-up (owner #109)
    live.push({ o, name: 'arc', t: -delay, life, upd: (o, k, dt, t) => {
      if (t < 0) { o.visible = false; return; }
      if (dir == null) dir = e.dir || 1;
      o.visible = true; const p = a.group.position;
      o.position.set(p.x + dir * 0.55, p.y + 1.0, p.z + 0.05);
      o.rotation.set(0, dir > 0 ? 0 : Math.PI, tilt + (dir > 0 ? 0 : 0));
      const s = (big ? 1.6 : 1.15) * (0.85 + k * 0.35); o.scale.set(s, s, s);
      o.material.opacity = 0.75 * (1 - k);
    } });
  }

  // ---------------------------------------------------------------- loot / gold that flies to its hero
  const rarityColor = id => (data.items.rarity.find(r => r.id === id)?.color) || '#ffffff';
  function flyTo(x, y, z, heroActor, color, { size = 0.5, delay = 0.35, life = 0.9, n = 1, arcUp = 2 } = {}) {
    for (let i = 0; i < n; i++) {
      const ox = (Math.random() - 0.5) * 0.6, oz = (Math.random() - 0.5) * 0.4, dl = delay + i * 0.05;
      spawn('spark', life + dl, (o, k, dt, t) => {
        const u = Math.max(0, (t - dl) / life), p = heroActor ? heroActor.group.position : null;
        const sx = x + ox, sz = z + oz, sy = y + arcUp * Math.sin(Math.min(1, t / Math.max(0.01, dl)) * Math.PI * 0.5);
        if (u <= 0 || !p) { o.position.set(sx, sy, sz); }
        else { const e = u * u; o.position.set(sx + (p.x - sx) * e, sy + (p.y + 1.1 - sy) * e + Math.sin(u * Math.PI) * 1.2, sz + (p.z - sz) * e); }
        o.scale.setScalar(size * (1 + Math.sin(t * 20) * 0.15) * (u > 0.85 ? (1 - u) / 0.15 + 0.2 : 1));
        o.material.opacity = 1;
      }, o => { o.position.set(x, y, z); o.material.color.set(color); });
    }
  }

  // ---------------------------------------------------------------- spells by fx key
  function spellFx(ev, G, actors) {
    const h = G.heroes.find(o => o.id === ev.id) || G.foes.find(o => o.id === ev.id); if (!h) return;
    const a = actors.get(ev.id); const S = data.classes.spells[ev.spell]; const wind = S?.t?.[0] || 0.2;
    const at = () => (a ? a.group.position : h);
    const later = after;
    // casting glow on the hands during the wind
    const handC = { quake: '#ffcf80', shout: '#ffd36a', iron: '#cfd8e0', shadow: '#8a6aff', fan: '#bfe6ff', cuts: '#9ff0e8', fire: '#ff8a2a', frost: '#a9e0ff', meteor: '#ff6a20', heal: '#9cffb0', smite: '#fff0a0', sanctuary: '#ffe9a0' }[ev.fx] || '#ffffff';
    { const p = at(); flash(p.x + (h.dir || 1) * 0.4, p.y + 1.1, p.z + 0.1, handC, 0.9, Math.max(0.2, wind)); }
    const p0 = { x: h.x, z: h.z, dir: h.dir || 1 };
    switch (ev.fx) {
      case 'quake': later(wind, () => { const p = at(); ring(p.x, p.z, 3.0, '#ffcf80', 0.55); ring(p.x, p.z, 2.2, '#a07040', 0.7, { opacity: 0.8 }); debris('rock', p.x, 0.2, p.z, low ? 4 : 9, '#8a7058', { speed: 7, up: 6 }); sparks(p.x, 0.2, p.z, '#d8b080', 12, { speed: 6, up: 1.5, life: 0.6, size: 0.4, grav: 2 }); }); break;
      case 'shout': later(wind, () => { const p = at(); for (let i = 0; i < 3; i++) after(i * 0.09, () => ring(p.x, p.z, 4 + i * 0.6, '#ffd36a', 0.5, { y: 0.08 })); flash(p.x, p.y + 1.4, p.z, '#ffe8a0', 2.2, 0.3); }); break;
      case 'iron': later(wind, () => { spawn('shell', 0.7, (o, k) => { const p = at(); o.position.set(p.x, p.y + 0.95, p.z); o.scale.set(0.95 + k * 0.3, 1.15 + k * 0.3, 0.8 + k * 0.3); o.material.opacity = 0.45 * (1 - k); }, o => o.material.color.set('#cfe0f0')); }); break;
      case 'shadow': for (let i = 0; i < 6; i++) { const t = wind + i * 0.025, x = p0.x + p0.dir * i * 0.8; later(t, () => { flash(x, 1.0, p0.z, '#6a4ad8', 1.6, 0.35); sparks(x, 0.9, p0.z, '#2a1a4a', 2, { speed: 1, up: 1, life: 0.5, size: 0.5, grav: -1 }); }); } break;
      case 'fan': later(wind, () => { const p = at(); flash(p.x + p0.dir * 0.6, p.y + 1.1, p.z, '#dff4ff', 1.4, 0.18); }); break;
      case 'cuts': for (let i = 0; i < 10; i++) later(wind + i * 0.1, () => { const p = at(); const o = take('arc'); o.material.color.set('#9ff0e8'); const rz = Math.random() * Math.PI * 2, dir = p0.dir; live.push({ o, name: 'arc', t: 0, life: 0.14, upd: (oo, k) => { oo.position.set(p.x + dir * 1.2, p.y + 1.0, p.z); oo.rotation.set(0, dir > 0 ? 0 : Math.PI, rz); oo.scale.setScalar(1.3); oo.material.opacity = 0.85 * (1 - k); } }); }); break;
      case 'fire': later(wind, () => { const p = at(); flash(p.x + p0.dir * 0.6, p.y + 1.15, p.z, '#ffb040', 1.3, 0.2); }); break;
      case 'frost': later(wind, () => { const p = at(); ring(p.x, p.z, 3.6, '#bfe8ff', 0.6); ring(p.x, p.z, 3.0, '#ffffff', 0.45, { opacity: 0.7 }); sparks(p.x, 0.3, p.z, '#d8f2ff', 20, { speed: 7, up: 1.2, grav: 1, life: 0.7, size: 0.3 }); }); break;
      case 'meteor': break;   // the falling rock is drawn on its warning circle
      case 'heal': later(wind, () => { const p = at(); ring(p.x, p.z, 6, '#9cffb0', 0.8, { opacity: 0.7 }); column(p.x, p.z, 0.9, 3.2, '#b8ffc8', 0.6); }); break;
      case 'smite': break;    // the pillar is drawn when its circle lands
      case 'sanctuary': later(wind, () => { const p = at(); column(p.x, p.z, 1.2, 4, '#fff0b0', 0.6, { grow: true }); }); break;
      default: break;
    }
  }
  /** Run f once, `t` seconds from now (on the fx clock). */
  function after(t, f) { let done = false; live.push({ o: null, t: -t, life: 0.0001, upd: (o, k, dt, tt) => { if (tt >= 0 && !done) { done = true; f(); } } }); }

  // ---------------------------------------------------------------- events
  function heroByPid(G, pid) { return G.heroes.find(h => h.pid === pid); }
  // xp + gold from one kill → ONE label at the kill's spot. With local pids set (session.localPids) only their gains
  // count; without, one shared label per kill (the first hero's share), never one per hero.
  let localPids = null;
  function gainText(g) {
    const parts = [];
    if (g.xp > 0) parts.push('+' + fmtHp(g.xp) + ' xp');
    if (g.gold > 0) parts.push('+' + fmtHp(g.gold) + ' gold');
    if (parts.length) text(g.x, 1.7, g.z + 0.2, parts.join(' · '), '#ffe08a', 0.3, { kind: 'gain', life: 1.1, rise: 0.7 });
  }
  function handle(events, G, actors) {
    if (!G) return;
    let gain = null;
    const counts = pid => (localPids ? localPids.includes(pid) : (gain.pid == null || gain.pid === pid));
    for (const ev of events) {
      if (ev.type === 'kill') { if (gain) gainText(gain); gain = { x: ev.x, z: ev.z, xp: 0, gold: 0, pid: null }; }
      else if (ev.type === 'xp' && gain) { if (counts(ev.pid)) { gain.xp += ev.amount; if (!localPids) gain.pid = ev.pid; } }
      else if (ev.type === 'gold' && gain && ev.x === gain.x && ev.z === gain.z) { if (counts(ev.pid)) { gain.gold += ev.amount; if (!localPids) gain.pid = ev.pid; } }
      else if (ev.type === 'gold' && ev.x != null && (!localPids || localPids.includes(ev.pid))) gainText({ x: ev.x, z: ev.z, xp: 0, gold: ev.amount });
      switch (ev.type) {
        case 'hit': {
          const big = ev.crit || ev.heavy, x = ev.x, y = ev.y ?? 1.1, z = ev.z + 0.2;
          const target = actors.get(ev.id), isHero = target?.hero;
          flash(x, y, z, ev.burn ? '#ff8a30' : (isHero ? '#ff6a50' : '#fff4d0'), big ? 1.6 : 1.0, 0.12);
          sparks(x, y, z, ev.burn ? '#ff7a20' : (big ? '#ffd060' : '#fff0c0'), big ? 12 : 6, { speed: big ? 6 : 4, size: 0.16 });
          if (big) ring(x, z - 0.2, 1.2, '#fff0c0', 0.3, { y: 0.06 });
          const dmg = fmtHp(ev.dmg);
          if (dmg && dmg !== '0') text(x, y + 0.5, z + 0.2, dmg, ev.burn ? '#ff9a40' : (isHero ? '#ff6a5a' : (ev.crit ? '#ffd23a' : '#ffffff')), ev.crit ? 0.62 : (ev.burn ? 0.3 : 0.42), { kind: 'damage' });
          break;
        }
        case 'block': case 'shieldblock': {
          sparks(ev.x, ev.y ?? 1.1, ev.z + 0.2, '#bfe0ff', 7, { speed: 4, size: 0.15 });
          flash(ev.x, ev.y ?? 1.1, ev.z + 0.2, '#cfe6ff', 1.0, 0.14);
          text(ev.x, (ev.y ?? 1.1) + 0.6, ev.z + 0.2, 'Blocked', '#bfe0ff', 0.34, { word: true, kind: 'word' });
          break;
        }
        case 'perfect': {
          const a = actors.get(ev.id); const p = a ? a.group.position : null; if (!p) break;
          flash(p.x, p.y + 1.1, p.z + 0.2, '#ffe28a', 2.4, 0.22);
          ring(p.x, p.z, 1.6, '#ffe28a', 0.4); ring(p.x, p.z, 1.6, '#ffffff', 0.35, { y: 1.1, vertical: true, face: 0 });
          sparks(p.x, p.y + 1.1, p.z, '#ffe28a', 14, { speed: 5, size: 0.18 });
          text(p.x, p.y + 2.3, p.z + 0.2, 'Perfect!', '#ffe28a', 0.46, { word: true, life: 1.0, kind: 'word' });
          break;
        }
        case 'armor': { const a = actors.get(ev.id); if (a) { const p = a.group.position; sparks(p.x, p.y + 1.2, p.z + 0.3, '#d0d8e0', 5, { speed: 3, size: 0.12 }); } break; }
        case 'kill': {
          acts.handle(ev, G, actors);
          sparks(ev.x, 0.6, ev.z, '#d8c8b0', ev.boss ? 30 : 8, { speed: ev.boss ? 7 : 3, up: 2, size: ev.boss ? 0.5 : 0.35, grav: 1, life: 0.8 });
          if (ev.boss) { ring(ev.x, ev.z, 6, '#ffe8a0', 1.0); column(ev.x, ev.z, 1.6, 9, '#fff0c0', 1.1); }
          break;
        }
        case 'land': if (ev.hard) { sparks(ev.x, 0.15, ev.z, '#c8b8a0', 6, { speed: 2.5, up: 0.8, grav: 1, life: 0.5, size: 0.4 }); ring(ev.x, ev.z, 0.9, '#d8c8b0', 0.3, { opacity: 0.5 }); } break;
        case 'heroDown': { const a = actors.get(ev.id); if (a) { const p = a.group.position; ring(p.x, p.z, 1.4, '#ff6a50', 0.6); } break; }
        case 'revive': case 'respawn': { const a = actors.get(ev.id); if (a) { const p = a.group.position; column(p.x, p.z, 0.8, 4, ev.type === 'revive' ? '#9cffb0' : '#ffe9a0', 0.8, { grow: true }); ring(p.x, p.z, 1.6, '#ffffff', 0.5); sparks(p.x, 0.4, p.z, '#ffffff', 10, { speed: 2, up: 4, grav: 2, size: 0.2 }); } break; }
        case 'heal': { const a = actors.get(ev.id); if (a) { const p = a.group.position; sparks(p.x, p.y + 0.6, p.z, '#9cffb0', 6, { speed: 0.8, up: 2.6, grav: -0.5, life: 0.8, size: 0.2 }); if (ev.amount > 0) text(p.x, p.y + 2.2, p.z + 0.2, '+' + fmtHp(ev.amount), '#8cf0a0', 0.34, { kind: 'gain' }); } break; }
        case 'buff': { const a = actors.get(ev.id); if (a) { const p = a.group.position; ring(p.x, p.z, 1.1, '#ffd36a', 0.5, { y: 0.06 }); } break; }
        case 'levelUp': { const h = G.heroes.find(o => o.id === ev.id) || heroByPid(G, ev.pid); const a = h && actors.get(h.id); if (a) { const p = a.group.position; column(p.x, p.z, 0.9, 5, '#ffe08a', 1.2, { grow: true }); ring(p.x, p.z, 2.2, '#ffe08a', 0.8); sparks(p.x, 0.5, p.z, '#fff0b0', 22, { speed: 2.5, up: 6, grav: 3, life: 1.0, size: 0.2 }); text(p.x, p.y + 2.6, p.z + 0.2, 'Level up!', '#ffe08a', 0.5, { word: true, life: 1.4, rise: 0.8, kind: 'word' }); } break; }
        case 'loot': { const h = heroByPid(G, ev.pid); const a = h && actors.get(h.id); const c = rarityColor(ev.item?.rarity); flyTo(ev.x, 0.6, ev.z, a, c, { size: ev.boss ? 0.8 : 0.6, delay: 0.5, life: 0.8, arcUp: 2.2 }); ring(ev.x, ev.z, 1, c, 0.6); break; }
        case 'gold': { const h = heroByPid(G, ev.pid); const a = h && actors.get(h.id); if (ev.x != null) flyTo(ev.x, 0.4, ev.z, a, '#ffd23a', { size: 0.24, delay: 0.15, life: 0.5, n: low ? 2 : 4, arcUp: 1 }); break; }
        case 'food': { const a = actors.get(ev.id); if (a) { const p = a.group.position; sparks(p.x, p.y + 0.8, p.z, '#ffb0a0', 8, { speed: 1, up: 2.4, grav: -0.5, life: 0.7, size: 0.2 }); text(p.x, p.y + 2.2, p.z + 0.2, '+' + fmtHp(ev.amount), '#8cf0a0', 0.4, { kind: 'gain' }); } break; }
        case 'pickup': { const a = actors.get(ev.id); if (a) { const p = a.group.position; sparks(p.x, p.y + 1.0, p.z, '#ffe8a0', 8, { speed: 2, up: 2, size: 0.16 }); } break; }
        case 'pickupBreak': { const a = actors.get(ev.id); if (a) { const p = a.group.position; debris('plank', p.x + (a.yaw > 0 ? 0.5 : -0.5), p.y + 1.1, p.z, 4, data.chapters.pickups[ev.pickup]?.color || '#8a6a44', { speed: 3, up: 3 }); } break; }
        case 'crate': debris('plank', ev.x, 0.5, ev.z, low ? 4 : 7, '#9a6a3a', { speed: 5, up: 5 }); sparks(ev.x, 0.5, ev.z, '#d8c098', 6, { speed: 2, up: 1, grav: 1, size: 0.35, life: 0.5 }); break;
        case 'shot': { if (ev.look === 'hook') shotOwner.set(ev.id, ev.owner); const f = G.foes.find(o => o.id === ev.owner) || G.heroes.find(o => o.id === ev.owner); const L = SHOT_LOOKS[ev.look]; if (f) flash(ev.x, 1.1 + (f.def?.float || 0) * 0.3, ev.z + 0.1, L ? L.color : '#ffd890', 0.9, 0.1); break; }
        case 'zoneHit': {
          if (acts.handle(ev, G, actors)) break;
          const team = ev.team ?? 0, look = ev.look;
          const c = look ? (SHOT_LOOKS[look]?.color || '#ffd890') : (team === 1 ? '#ff7a40' : '#ffe08a');
          ring(ev.x, ev.z, ev.r, c, 0.5); ring(ev.x, ev.z, ev.r * 0.7, '#ffffff', 0.35, { opacity: 0.6 });
          sparks(ev.x, 0.3, ev.z, c, Math.round(6 + ev.r * 4), { speed: 2 + ev.r * 1.6, up: 3, size: 0.3, life: 0.6, grav: 4 });
          if (team === 0 && !look && ev.r < 3) column(ev.x, ev.z, ev.r * 0.6, 7, '#fff4c0', 0.5);                   // smite
          if (team === 0 && !look && ev.r >= 3) { debris('rock', ev.x, 0.3, ev.z, 6, '#5a4038', { speed: 8, up: 7 }); flash(ev.x, 0.8, ev.z, '#ffb040', 4, 0.3); }   // meteor
          if (team === 1 && !look) debris('rock', ev.x, 0.2, ev.z, low ? 2 : 4, '#6a6058', { speed: 4, up: 4 });
          break;
        }
        case 'spell': spellFx(ev, G, actors); break;
        case 'breaker': { const a = actors.get(ev.id); const p = a ? a.group.position : ev; ring(p.x, p.z, 3.6, '#fff4d0', 0.5); ring(p.x, p.z, 2.6, '#ffd36a', 0.4); flash(p.x, (p.y || 0) + 1, p.z, '#ffffff', 3.5, 0.2); sparks(p.x, 1, p.z, '#fff0c0', 20, { speed: 8, up: 2, size: 0.2 }); break; }
        case 'grab': { const a = actors.get(ev.target); if (a) { const p = a.group.position; flash(p.x, p.y + 1.1, p.z + 0.2, '#ffffff', 0.8, 0.1); } break; }
        case 'throw': { const a = actors.get(ev.id); if (a) { const p = a.group.position; ring(p.x + (ev.dir || 1) * 0.8, p.z, 1, '#ffffff', 0.3, { y: 1, vertical: true, face: 1, opacity: 0.6 }); } break; }
        case 'nomana': { const a = actors.get(ev.id); if (a && (!a.nomanaT || G.t - a.nomanaT > 1)) { a.nomanaT = G.t; const p = a.group.position; text(p.x, p.y + 2.2, p.z + 0.2, 'No mana', '#8ab8ff', 0.3, { word: true, life: 0.8, rise: 0.4, kind: 'word' }); } break; }
        case 'move': {
          const a = actors.get(ev.id); if (!a) break;
          if (a.hero) swingArc(a, G.heroes.find(h => h.id === ev.id), ev, G);
          else if (ev.mv && G.foes.find(f => f.id === ev.id)?.def?.moves?.find(m => m.id === ev.mv)?.beam) beamFor(G, ev, actors);
          // a foe's area slam: show its circle during the wind-up (rule 39 — never punish what can't be seen)
          else if (ev.mv && ev.wind > 0.3) {
            const f = G.foes.find(o => o.id === ev.id); const mv = f?.def?.moves?.find(m => m.id === ev.mv);
            if (mv?.aoe && mv.aoe.at === 'self' && !mv.aoe.delay) selfWarn(f, a, mv.aoe.r, ev.wind);
          }
          break;
        }
        // round 2 sim events (SIM helper): knockdown kinds, hook, held spin, riposte, dash/block upgrades
        case 'stagger': {
          const a = actors.get(ev.id); if (!a) break; const p = a.group.position;
          if (ev.what === 'resist' || ev.what === 'stand') { ring(p.x, p.z, 0.9, '#d0d8e0', 0.3, { y: 1.1, vertical: true, face: -(a.yaw > 0 ? 1 : -1), opacity: 0.8 }); sparks(p.x, p.y + 1.2, p.z + 0.3, '#e8eef4', 6, { speed: 3, size: 0.14 }); }
          else if (ev.what === 'break') { flash(p.x, p.y + 1.2, p.z, '#ffffff', 2.4, 0.2); sparks(p.x, p.y + 1.2, p.z + 0.2, '#ffd36a', 14, { speed: 6, up: 3, size: 0.2 }); text(p.x, p.y + 2.4, p.z + 0.2, 'Broken!', '#ffd36a', 0.36, { word: true, life: 0.8, rise: 0.5, kind: 'word' }); }
          else if (ev.what === 'limit') { ring(p.x, p.z, 1.3, '#ff9a4a', 0.35, { y: 1.1, vertical: true, face: 1, opacity: 0.9 }); text(p.x, p.y + 2.6, p.z + 0.2, 'Steady', '#ffb070', 0.32, { word: true, life: 0.7, rise: 0.4, kind: 'word' }); }
          else if (ev.what === 'guard') { ring(p.x, p.z, 1.0, '#a8d0ff', ev.time || 1, { y: 1.0, vertical: true, face: 1, opacity: 0.7 }); }
          else if (ev.what === 'counter') { flash(p.x, p.y + 1.4, p.z, '#ff6a40', 1.6, 0.25); }
          else if (ev.what === 'ready') { sparks(p.x, p.y + 1.0, p.z, '#c8d0d8', 4, { speed: 1.5, up: 1.5, size: 0.12 }); }
          break;
        }
        case 'hook': { const a = actors.get(ev.target); if (a && ev.hit) { const p = a.group.position; flash(p.x, p.y + 1.1, p.z + 0.2, '#e0e4ea', 1.2, 0.15); sparks(p.x, p.y + 1.1, p.z, '#c8ccd2', 8, { speed: 3, size: 0.12 }); } break; }
        case 'channel': { const a = actors.get(ev.id); if (a && ev.on) { const p = a.group.position; ring(p.x, p.z, 2.4, '#ffd27a', 0.4); } break; }
        case 'riposte': { const a = actors.get(ev.id); if (a) { const p = a.group.position; flash(p.x, p.y + 1.2, p.z + 0.2, '#9ff0e8', 2.2, 0.2); text(p.x, p.y + 2.4, p.z + 0.2, 'Riposte!', '#9ff0e8', 0.4, { word: true, life: 0.8, rise: 0.6, kind: 'word' }); } break; }
        case 'kit': {
          if (ev.kind === 'teleport') { for (const x of [ev.from, ev.to]) { flash(x, 1.0, ev.z, '#c78cff', 2.0, 0.25); sparks(x, 1.0, ev.z, '#8a5ad8', 10, { speed: 3, up: 2, size: 0.16 }); } }
          else { const a = actors.get(ev.id); if (a) { const p = a.group.position; ring(p.x, p.z, 1.0, CLASS_ARC[G.heroes.find(h => h.id === ev.id)?.cls] || '#ffffff', 0.3); } }
          break;
        }
        case 'bossPhase': { const a = actors.get(ev.id); if (a) { const p = a.group.position; ring(p.x, p.z, 4, '#c6ff5a', 0.8); flash(p.x, p.y + 1.6, p.z, '#d8ff6a', 3, 0.4); } break; }
        default: acts.handle(ev, G, actors); break;
      }
    }
    if (gain) gainText(gain);
  }
  function selfWarn(f, a, r, wind) {
    const ringO = take('ring'), fill = take('disc');
    ringO.material.color.set(TEAM_WARN[1]); fill.material.color.set(TEAM_WARN[1]);
    const upd = (o, k) => { const p = a.group.position; o.position.set(p.x, o === ringO ? 0.07 : 0.06, p.z); if (o === ringO) { o.scale.set(r, 1, r / 1.2); o.material.opacity = 0.9; } else { o.scale.set(r * k, 1, r * k / 1.2); o.material.opacity = 0.2 + 0.3 * k; } };
    live.push({ o: ringO, name: 'ring', t: 0, life: wind, upd }); live.push({ o: fill, name: 'disc', t: 0, life: wind, upd });
  }

  // ---------------------------------------------------------------- per frame
  let visible = true;
  acts = createActsFx(actsKit());
  const api = {
    showDamage: true,
    root,
    handle,
    sync(G, alpha, dt) { syncShots(G, dt); syncZones(G); acts.syncZones(G); },
    get acts() { return acts; },
    /** Whose xp/gold to show (session.localPids); null = one shared label per kill. */
    setLocalPids(pids) { localPids = pids && pids.length ? [...pids] : null; },
    get labelCount() { return labels.length; },
    update(dt) {
      updateLabels(dt); acts.update(dt);
      for (let i = live.length - 1; i >= 0; i--) {
        const L = live[i]; L.t += dt;
        const k = L.t < 0 ? 0 : Math.min(1, L.t / L.life);
        if (L.upd) L.upd(L.o, k, dt, L.t);
        if (L.t >= L.life) { if (L.o) give(L.name, L.o); live.splice(i, 1); }
      }
    },
    text, sparks, ring, flash, debris, column, after,
    clear() {
      for (const L of live) if (L.o) give(L.name, L.o); live.length = 0;
      while (labels.length) dropLabel(labels[0]);
      for (const v of shots.values()) dropShot(v); shots.clear();
      for (const w of warns.values()) { give('ring', w.ring); give('disc', w.disc); give('disc', w.fill); } warns.clear();
      for (const d of domes.values()) { give('dome', d.dome); give('ring', d.ring); give('disc', d.disc); } domes.clear();
      beams.clear(); acts.clear();
    },
    /** Show every pooled object for one compile pass (shader warm-up), then hide them again. */
    warm(on) { for (const p of Object.values(pools)) for (const o of p.all) if (p.free.includes(o)) { o.visible = on; if (on) o.position.set(0, -30, 0); } },
    setVisible(on) { visible = on; root.visible = on; },
    dispose() { this.clear(); scene.remove(root); },
    get liveCount() { return live.length; },
  };
  return api;
}

// ------------------------------------------------------------------------------------------------ ground weapons
/** A ground weapon (also drawn spinning when thrown). Original low-poly shapes, one per pickup. */
export function groundWeaponMesh(id, color = '#8a6a44') {
  const g = new THREE.Group();
  const m = c => new THREE.MeshToonMaterial({ color: c });
  const wood = m(color), iron = m('#6a6e74'), gold = m('#d8b050'), dark = m('#3a3a40');
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
  switch (id) {
    case 'pitchfork':
      add(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), wood, 0, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.BoxGeometry(0.06, 0.04, 0.34), iron, 0.76, 0, 0);
      for (const z of [-0.15, 0, 0.15]) add(new THREE.ConeGeometry(0.02, 0.36, 4), iron, 0.95, 0, z, 0, 0, -Math.PI / 2);
      break;
    case 'log':
      add(new THREE.CylinderGeometry(0.13, 0.16, 1.2, 8), wood, 0, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.SphereGeometry(0.1, 6, 4), m('#6a8a3a'), 0.2, 0.12, 0.05);
      add(new THREE.SphereGeometry(0.08, 6, 4), m('#5a7a2a'), -0.3, 0.12, -0.04);
      break;
    case 'anchor':
      add(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), iron, 0, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.TorusGeometry(0.22, 0.05, 5, 12, Math.PI), iron, -0.5, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.TorusGeometry(0.09, 0.025, 4, 10), dark, 0.55, 0, 0);
      add(new THREE.BoxGeometry(0.06, 0.05, 0.4), iron, 0.35, 0, 0);
      break;
    case 'candelabra':
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), gold, 0, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.12, 0.14, 0.05, 8), gold, -0.45, 0, 0, 0, 0, Math.PI / 2);
      add(new THREE.TorusGeometry(0.16, 0.02, 4, 10, Math.PI), gold, 0.42, 0, 0, 0, 0, -Math.PI / 2);
      for (const z of [-0.16, 0, 0.16]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), m('#f4ecd8'), 0.5, 0, z, 0, 0, -Math.PI / 2);
      break;
    case 'scale':
      add(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 6), m(color), 0, 0, 0, 0, 0, 0);
      add(new THREE.ConeGeometry(0.12, 0.3, 4), m('#8a9aa8'), 0, 0.15, 0);
      break;
    case 'chain':
      for (let i = 0; i < 6; i++) add(new THREE.TorusGeometry(0.08, 0.022, 4, 8), iron, -0.45 + i * 0.16, 0, 0, i % 2 ? Math.PI / 2 : 0, 0, 0);
      add(new THREE.IcosahedronGeometry(0.13, 0), dark, 0.55, 0, 0);
      break;
    default:
      add(new THREE.BoxGeometry(0.9, 0.08, 0.12), wood);
  }
  return g;
}
