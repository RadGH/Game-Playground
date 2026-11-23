// Wyrmroad's 3D view (the render contract in docs/ARCH.md):
//
//   const view = await createView({ canvas, data, quality: 'high' | 'low', T, models: 'legacy' | 'hd' });   // models: js/render/hd.js
//   await view.setChapter('millbrook');     // builds the street + backdrop and every body the chapter needs
//   view.update(G, alpha, dtReal);          // every animation frame: actors, props, shots, zones, camera, draw
//   view.handle(events);                    // fx, one-shot clips, damage numbers for this frame's events
//   view.project(x, y, z) → { x, y, visible }   // world → CSS px in the canvas
//   view.scenic(true);                      // story scenes: slow pan over the chapter, no actors
//   view.setLocalPids(session.localPids);   // xp/gold labels only for this device's heroes
//   view.resize(); view.dispose();
//   const p = await createPreview(canvas, { data });  p.setLook(look, cls, gear); p.setAnim('cheer'); p.spin(true)
//   const url = await renderPortrait({ look } | { creature }, { size: 128 });   // head and shoulders from the 3D model
//   portraitSpec(data, speakerId | foeId)   → { look } | { creature } for renderPortrait (story speakers, bosses, foes)
//
// Side camera, ~12° above the road, fitting `T.viewWidth` metres of road to the canvas width (≥ 10 m on a narrow phone,
// where it follows the drawn heroes inside the locked screen). It follows the DRAWN camX (rule 51) and shakes on heavy
// hits and while `G.quakeT > 0`. Lights are made once and only re-coloured (rule 29).
import * as THREE from 'three';
import { createActors, buildChibi, buildCreature, HERO_COLORS, CHIBI_ANIMS } from './actors.js';
import { buildTheme } from './themes.js';
import { createFx } from './fx.js';
import { createProps } from './props.js';
import { dressedLook } from '../sim/items.js';
import { skyTex } from './kit.js';

export { HERO_COLORS };
const DEFAULT_T = { viewWidth: 17, camHeight: 3.2, camDistance: 15, reviveTime: 2, downTime: 6 };

export async function createView({ canvas, data, quality = 'high', T = null, models = 'legacy' }) {
  const low = quality === 'low';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !low; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = skyTex([[0, '#3a4a6a'], [1, '#c8a888']]);
  scene.fog = new THREE.Fog(0xc8a888, 30, 260);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 900);

  // the light rig: made once, re-coloured per chapter, never added/removed/hidden mid-game
  const hemi = new THREE.HemisphereLight(0xbfd0ff, 0x6a5040, 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd8a8, 2.4);
  sun.castShadow = !low; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 10, bottom: -10, near: 1, far: 70 });
  scene.add(sun, sun.target);
  const lamps = [new THREE.PointLight(0xffb060, 0, 16, 1.6), new THREE.PointLight(0xffb060, 0, 16, 1.6)];
  for (const l of lamps) scene.add(l);

  // the parts that depend on quality (body detail, outlines, effect counts) are rebuilt when quality changes
  let actors, fx, props, partsQuality = null;
  function makeParts(q) {
    if (actors) { actors.clear(); scene.remove(actors.root); fx.dispose(); props.clear(); scene.remove(props.root); }
    actors = createActors({ scene, data, quality: q, models });
    fx = createFx({ scene, data, quality: q, camera, size: () => ({ w: cam.w, h: cam.h }) });
    props = createProps({ scene, data, quality: q, fx });
    partsQuality = q;
  }
  makeParts(quality);
  /** Quality from the settings: shadows and sharpness change at once; bodies, outlines and street detail on the next chapter load. */
  function applyQuality(q) {
    if (q !== 'low' && q !== 'high') return;
    quality = q; const lowNow = q === 'low';
    renderer.shadowMap.enabled = !lowNow; sun.castShadow = !lowNow;
    scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });   // a settings change, not mid-fight
    cam.w = 0; resize();
  }
  let theme = null, themeId = null, chapterId = null, loading = null, lastG = null, flyer = null;
  const cam = { x: 8, shake: 0, t: 0, scenic: false, scenicT: 0, w: 1, h: 1, width: 17, shot: null };
  let tun = T || DEFAULT_T;
  const timing = { actors: 0, world: 0, render: 0 };   // smoothed ms per frame: sync, world update, renderer.render

  function resize() {
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (!w || !h) return;
    if (w === cam.w && h === cam.h) return;
    cam.w = w; cam.h = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    fitCamera();
  }
  /** Fit the road: viewWidth metres across at the middle of the street (z = 0); narrower (≥ 10 m) on a portrait phone. */
  function fitCamera() {
    const V = tun.viewWidth || 17, aspect = cam.w / cam.h, dist = tun.camDistance || 15;
    // Heroes at least ~70 px tall: a hero's height on screen is 1.75 m × canvas width ÷ road width, so the road width
    // is at most width/40 px-metres (≥ 8 m). A wide desktop keeps the whole locked screen (viewWidth) and the tuning's
    // own camera; a portrait or short canvas ("narrow") follows the heroes and frames the depth strip to its height.
    cam.width = Math.max(8, Math.min(V, cam.w / 48));     // /48 not /40: the narrow camera sits higher, so the road is a little farther than the fit point
    cam.narrow = cam.width < V - 0.01 || aspect < 1.2;
    if (!cam.narrow) { cam.pitch = null; cam.lookY = 1.4; }
    else cam.pitch = THREE.MathUtils.degToRad(aspect < 0.7 ? 26 : 20);
    const ch0 = cam.pitch == null ? (tun.camHeight || 3.2) : dist * Math.tan(cam.pitch);
    const D = Math.hypot(dist, ch0), hf = Math.atan((cam.width / 2) / D), vh = Math.atan(Math.tan(hf) / aspect);
    camera.fov = THREE.MathUtils.radToDeg(2 * vh);
    camera.updateProjectionMatrix();
    if (cam.narrow) {
      // the bottom edge of the picture meets the ground a little past the road's front lip (z ≈ 5), so the street fills
      // the canvas from the bottom up and the backdrop takes the rest — no empty foreground
      const camY = (dist - 5) * Math.tan(cam.pitch + vh);
      cam.lookY = Math.max(1.0, Math.min(4.5, camY - ch0));
    }
  }

  function placeCamera(G, dt) {
    if (cam.shot) {
      // a directed shot (story stage, review pages): the director owns the camera; the light rig follows its target
      const s = cam.shot;
      if (s.fov && Math.abs(camera.fov - s.fov) > 1e-3) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
      camera.position.set(s.pos[0], s.pos[1], s.pos[2]); camera.lookAt(s.target[0], s.target[1], s.target[2]);
      cam.x = s.target[0];
      const sd = theme?.env.sunDir || [-0.5, 0.8, 0.6];
      sun.position.set(cam.x + sd[0] * 30, sd[1] * 30, sd[2] * 30); sun.target.position.set(cam.x, 0, -1); sun.target.updateMatrixWorld();
      lamps[0].position.set(cam.x - 5, 2.6, -3.2); lamps[1].position.set(cam.x + 5.5, 2.6, -3.2);
      return;
    }
    const V = tun.viewWidth || 17, dist = tun.camDistance || 15, lookY = cam.lookY ?? 1.4;
    const ch = cam.pitch == null ? (tun.camHeight || 3.2) : dist * Math.tan(cam.pitch);   // portrait: steeper, so the street has depth
    let want;
    if (cam.scenic) {
      cam.scenicT += dt;
      const len = G?.ch?.length || theme?.length || 150, span = Math.max(20, len - 10);
      const u = (cam.scenicT * 1.1) % (span * 2);
      want = 5 + (u < span ? u : span * 2 - u);
      cam.x += (want - cam.x) * Math.min(1, dt * 2);
    } else if (G) {
      want = G.camX;
      if (cam.width < V - 0.01) {   // narrow screen: follow the drawn heroes inside the locked screen
        const up = G.heroes.filter(h => h.state !== 'gone');
        if (up.length) {
          let s = 0; for (const h of up) { const a = actors.get(h.id); s += a ? a.group.position.x : h.x; }
          const slack = (V - cam.width) / 2;
          want = Math.max(G.camX - slack, Math.min(G.camX + slack, s / up.length));
        }
      }
      cam.x += (want - cam.x) * (1 - Math.exp(-dt * 7));
    }
    if (G && G.quakeT > 0) cam.shake = Math.max(cam.shake, 0.12);
    if (view.options?.shake === false) cam.shake = 0;          // the player turned screen shake off
    const sx = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0, sy = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 0.7 : 0;
    cam.shake = Math.max(0, cam.shake - dt * 1.6);
    camera.position.set(cam.x + sx, lookY + ch + sy, dist);
    camera.lookAt(cam.x + sx * 0.5, lookY, 0);
    // light rig follows the screen
    const sd = theme?.env.sunDir || [-0.5, 0.8, 0.6];
    sun.position.set(cam.x + sd[0] * 30, sd[1] * 30, sd[2] * 30);
    sun.target.position.set(cam.x, 0, -1); sun.target.updateMatrixWorld();
    lamps[0].position.set(cam.x - 5, 2.6, -3.2); lamps[1].position.set(cam.x + 5.5, 2.6, -3.2);
  }

  /** A chapter id, or `stage:<theme>` — a theme's street on its own (story scenes set in a place that is not a chapter). */
  function chapterFor(id) {
    const ch = data.chapters.chapters.find(c => c.id === id);
    if (ch) return ch;
    if (typeof id === 'string' && id.startsWith('stage:')) {
      const th = id.slice(6), like = data.chapters.chapters.find(c => c.theme === th);
      return { id, name: like?.name || th, theme: th, length: like?.length || 160, sections: [], seedOf: like || null };
    }
    return data.chapters.chapters[0];
  }
  async function setChapter(id) {
    const ch = chapterFor(id);
    if (chapterId === ch.id && theme) return;
    chapterId = ch.id;
    const job = (async () => {
      const chIndex = Math.max(0, data.chapters.chapters.indexOf(ch.seedOf || ch));
      const next = await buildTheme(ch.theme, { length: ch.length, chIndex, quality, chapter: ch });   // quality read now: a change applies here
      if (chapterId !== ch.id) { next.dispose(); return; }
      if (theme) { scene.remove(theme.group); theme.dispose(); }
      if (partsQuality !== quality) makeParts(quality);
      theme = next; themeId = ch.theme; scene.add(theme.group);
      const env = theme.env;
      scene.background = env.sky; scene.fog.color.set(env.fog[0]); scene.fog.near = env.fog[1]; scene.fog.far = env.fog[2];
      hemi.color.set(env.hemi[0]); hemi.groundColor.set(env.hemi[1]); hemi.intensity = env.hemi[2];
      sun.color.set(env.sun[0]); sun.intensity = env.sun[1];
      for (const l of lamps) { l.color.set(env.lamp[0]); l.intensity = env.lamp[1]; }
      renderer.toneMappingExposure = env.exposure || 1.08;
      fx.clear(); props.clear(); actors.clear();
      cam.x = 8; cam.scenicT = 0;
      const warm = await actors.preload(ch, lastG?.heroes || []);
      // a chapter with sky fire: Ossmara's body for the fly-over, built now so its first pass compiles nothing
      if (ch.sky && !flyer) {
        const def = data.enemies.bosses.ossmara_wrath;
        if (def) try { const b = await buildCreature(def.look, { low: quality === 'low', outline: false }); b.obj.scale.setScalar(7 / b.h); b.loop('fly'); flyer = b; } catch (err) { console.error('wyrmroad: flyer', err); }
      }
      fx.acts.setFlyer(ch.sky && flyer ? { obj: flyer.obj, update: dt => flyer.update(dt) } : null);
      if (ch.sky && flyer) { flyer.obj.visible = true; flyer.obj.position.set(cam.x, 8, -12); }
      // shader warm-up: every pooled effect and one body per foe kind are compiled now, not on their first hit
      fx.warm(true);
      try { await renderer.compileAsync(scene, camera); } catch { /* older drivers: compiled on first draw */ }
      fx.warm(false); warm?.done(); if (flyer) flyer.obj.visible = false;
    })();
    loading = job;
    await job;
    if (loading === job) loading = null;
  }

  function draw() { renderer.render(scene, camera); }

  const view = {
    renderer, scene, camera,
    get actors() { return actors; }, get fx() { return fx; }, get props() { return props; },
    /** Set by the UI: { shake, damageNumbers, quality, models }. Read every frame (models: 'hd' | 'legacy', switches live). */
    options: { shake: true, damageNumbers: true, quality, models },
    get chapter() { return chapterId; },
    get loading() { return !!loading; },
    setChapter,
    /** The pids this device plays (session.localPids): only their xp/gold pops up. */
    setLocalPids(pids) { fx.setLocalPids(pids); },
    setTuning(t) { tun = t || DEFAULT_T; fitCamera(); },
    /** Every animation frame. Builds the chapter on its own if G is on a different one. */
    update(G, alpha = 1, dt = 1 / 60) {
      dt = Math.min(0.1, Math.max(0, dt));
      const op = view.options || {};
      fx.showDamage = op.damageNumbers !== false;
      if (op.quality && op.quality !== quality) applyQuality(op.quality);
      if (op.models && op.models !== models) { models = op.models; actors.setModels(models); }
      cam.t += dt;
      if (G) { lastG = G; if (G.T && G.T !== tun) { tun = G.T; fitCamera(); } }
      if (G && G.ch && G.ch.id !== chapterId) setChapter(G.ch.id);
      resize();
      const t0 = performance.now();
      if (G && !cam.scenic && !loading) {
        actors.sync(G, alpha, dt);
        props.sync(G, dt);
        fx.sync(G, alpha, dt, actors);
      }
      const t1 = performance.now();
      placeCamera(G, dt);
      if (theme) theme.update(dt, cam.t, cam.x, G?.quakeT || 0);
      fx.update(dt, camera);
      const t2 = performance.now();
      draw();
      const t3 = performance.now(), k = 0.05;
      timing.actors += (t1 - t0 - timing.actors) * k; timing.world += (t2 - t1 - timing.world) * k; timing.render += (t3 - t2 - timing.render) * k;
    },
    handle(events) {
      if (!events || !events.length || cam.scenic) return;
      actors.handle(events, lastG);
      if (lastG?.cinematic) return;            // a story stage: gestures only (no swing trails, no shake)
      fx.handle(events, lastG, actors);
      for (const ev of events) {
        if (ev.type === 'hit' && (ev.heavy || ev.crit)) cam.shake = Math.max(cam.shake, ev.heavy ? 0.16 : 0.08);
        else if (ev.type === 'breaker') cam.shake = Math.max(cam.shake, 0.22);
        else if (ev.type === 'land' && ev.hard) cam.shake = Math.max(cam.shake, 0.06);
        else if (ev.type === 'kill' && ev.boss) cam.shake = Math.max(cam.shake, 0.35);
        else if (ev.type === 'zoneHit' && ev.r >= 3) cam.shake = Math.max(cam.shake, 0.14);
        else if (ev.type === 'quake' || ev.type === 'bossPhase') cam.shake = Math.max(cam.shake, 0.3);
        else if (ev.type === 'zoneHit' && /^skyfire/.test(ev.look || '')) cam.shake = Math.max(cam.shake, 0.32);
        else if (ev.type === 'zoneHit' && ['handslam', 'quake', 'claw', 'sweep', 'toll'].includes(ev.look)) cam.shake = Math.max(cam.shake, 0.2);
        else if (ev.type === 'expose' && ev.on) cam.shake = Math.max(cam.shake, 0.3);
        else if (ev.type === 'gust') cam.shake = Math.max(cam.shake, 0.08);
      }
    },
    project(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return { x: (v.x * 0.5 + 0.5) * cam.w, y: (-v.y * 0.5 + 0.5) * cam.h, visible: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
    },
    resize() { cam.w = 0; resize(); },
    /**
     * A directed camera: `{ pos: [x, y, z], target: [x, y, z], fov? }` (degrees, vertical), or null to give the camera
     * back to the game. While set, actors are drawn from whatever G is passed to update (the story stage passes its own).
     */
    setShot(shot) {
      const was = !!cam.shot;
      cam.shot = shot || null;
      if (cam.shot) { if (cam.scenic) view.scenic(false); }
      else if (was) { cam.w = 0; resize(); }      // the game's own fov and framing come back
    },
    get shot() { return cam.shot; },
    /** The canvas size in CSS px (the story director frames its shots to it). */
    get size() { return { w: cam.w, h: cam.h }; },
    /** Shake the camera now (story moments: a bell, a roar). */
    shake(k = 0.2) { cam.shake = Math.max(cam.shake, k); },
    /** Named spots the street marks for story moments (the Great Bell…): { name: [x, y, z] }. */
    get marks() { return theme?.marks || {}; },
    scenic(on) {
      cam.scenic = !!on; cam.scenicT = 0;
      actors.setVisible(!on); fx.setVisible(!on); props.setVisible(!on);
      if (!on && lastG) cam.x = lastG.camX;
    },
    /** Render one frame without a game (title backdrops, story scenes before a fight starts). */
    frame(dt = 1 / 60) { view.update(null, 1, dt); },
    stats() { return { timing: { ...timing }, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs?.length || 0, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; },
    dispose() {
      actors.clear(); fx.dispose(); props.clear();
      if (theme) { scene.remove(theme.group); theme.dispose(); theme = null; }
      renderer.dispose();
    },
  };
  resize();
  return view;
}

// ------------------------------------------------------------------------------------------------ preview
/**
 * One character on a small stage (title, hero select, creator, inventory paper-doll).
 *   const p = await createPreview(canvas, { data });   p.setLook(look, cls, gear); p.setAnim('cheer'); p.spin(true); p.dispose()
 * `look` is the hero's own look; with `cls` (and `gear`) it is dressed through items.js dressedLook. A look that is
 * already dressed can be passed with no cls. `{ creature: spec }` shows a creature.
 */
export async function createPreview(canvas, { data = null, quality = 'high', background = null, models = 'legacy' } = {}) {
  const low = quality === 'low';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !background });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = !low;
  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x6a5040, 1.3));
  const key = new THREE.DirectionalLight(0xffe2b8, 2.4); key.position.set(-2.5, 4, 4); key.castShadow = !low; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.5, far: 12 });
  const rim = new THREE.DirectionalLight(0x9fc0ff, 1.2); rim.position.set(3, 2.5, -3);
  scene.add(key, rim);
  // the stage: a round plinth of warm stone with a brass rim
  const stage = new THREE.Group(); scene.add(stage);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.02, 0.14, 40), new THREE.MeshToonMaterial({ color: 0x8a7462 })); top.position.y = -0.07; top.receiveShadow = true; stage.add(top);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.985, 0.028, 6, 48), new THREE.MeshToonMaterial({ color: 0xc8a050 })); band.rotation.x = Math.PI / 2; band.position.y = -0.005; stage.add(band);
  const holder = new THREE.Group(); stage.add(holder);
  let body = null, wantKey = '', spinning = false, yaw = 0.35, anim = 'idle', raf = 0, disposed = false, last = performance.now();
  function resize() {
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function frameCamera() {
    const H = 1.8, aspect = camera.aspect || 1;
    const vfov = THREE.MathUtils.degToRad(camera.fov), need = Math.max(H * 1.32, (H * 0.95) / aspect);
    const d = (need / 2) / Math.tan(vfov / 2);
    camera.position.set(0, H * 0.6, d); camera.lookAt(0, H * 0.5, 0);
  }
  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (canvas.clientWidth && (canvas.width !== Math.round(canvas.clientWidth * renderer.getPixelRatio()))) { resize(); frameCamera(); }
    if (spinning) yaw += dt * 0.6;
    holder.rotation.y = yaw;
    if (body) body.update(dt);
    renderer.render(scene, camera);
  }
  resize(); frameCamera(); loop();
  return {
    async setLook(look, cls = null, gear = null) {
      let spec;
      if (look && look.creature) spec = { key: 'c' + JSON.stringify(look.creature), make: () => buildCreature(look.creature, { low }) };
      else {
        const dressed = cls && data ? dressedLook(data.classes, data.items, { cls, look: look || {}, gear: gear || {} }) : look;
        spec = { key: 'h' + JSON.stringify(dressed), make: () => buildChibi(dressed, { low, outline: !low }) };
        if (models === 'hd') spec = (await hdBodySpec(data, dressed, spec)) || spec;     // high detail: the Tabard hero
      }
      if (spec.key === wantKey) return;
      wantKey = spec.key;
      const b = await spec.make();
      if (disposed || wantKey !== spec.key) { b.dispose(); return; }
      if (body) { holder.remove(body.obj); body.dispose(); }
      body = b; body.obj.scale.setScalar(1.75 / body.h); holder.add(body.obj);
      body.obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
      body.loop(anim === 'idle' || anim === 'ready' || anim === 'walk' ? anim : 'idle');
      if (anim !== 'idle' && anim !== 'ready' && anim !== 'walk') body.play(anim);
    },
    setAnim(name = 'idle') {
      anim = name;
      if (!body) return;
      if (name === 'idle' || name === 'ready' || name === 'walk' || name === 'run' || name === 'block' || name === 'guard') body.loop(name);
      else body.play(name);
    },
    spin(on = true) { spinning = !!on; },
    setYaw(r) { yaw = r; },
    resize() { resize(); frameCamera(); },
    dispose() { disposed = true; cancelAnimationFrame(raf); if (body) body.dispose(); renderer.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------ portraits
const portraitCache = new Map();
let pr = null;
function portraitRig() {
  if (pr) return pr;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe8ecff, 0x6a5848, 1.4));
  const key = new THREE.DirectionalLight(0xffe6c8, 2.3); key.position.set(-2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa8c4ff, 1.1); rim.position.set(3, 2, -3); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(22, 1, 0.05, 40);
  pr = { canvas, renderer, scene, camera, queue: Promise.resolve() };
  return pr;
}
/**
 * High detail (js/render/hd.js): the body spec for a look or creature as the old renderer would draw it — a story person,
 * foe or boss whose look this is gets its own high-detail model (data/hd-models.json), any other look is a hero (Tabard).
 * null = no high-detail model: draw the old one. `old` (a legacy { make }) is the fallback if the model fails to load.
 */
let whoByLook = null;
async function hdBodySpec(data, look, old = null, creature = null) {
  try {
    const hd = await import('./hd.js'), kit = await hd.loadHdKit(); if (!kit) return null;
    if (data && !whoByLook) {
      whoByLook = new Map();
      for (const [k, d] of [...Object.entries(data.enemies.foes), ...Object.entries(data.enemies.bosses)]) if (d.look) whoByLook.set(JSON.stringify(d.look), { side: 'foe', kind: k });
      for (const [id, sp] of Object.entries(data.story?.speakers || {})) if (sp.look) whoByLook.set(JSON.stringify(sp.look), { side: 'npc', lookDirect: sp.look, speaker: id });
    }
    const who = whoByLook?.get(JSON.stringify(creature || look)) || (creature ? null : { side: 'hero' });
    const s = who && kit.specFor(data, who, look);
    if (!s) return null;
    return { key: s.key, hd: true, make: () => hd.buildHd(s, {}).catch(e => { console.warn('[wyrmroad] high-detail model failed:', e?.message); if (old) return old.make(); throw e; }) };
  } catch (e) { console.warn('[wyrmroad] high-detail models:', e?.message); return null; }
}

/** A head-and-shoulders portrait from the real 3D model, as a PNG data URL (cached by look). models: 'hd' draws high detail. */
export function renderPortrait(spec, { size = 128, yaw = 0.42, data = null, models = 'legacy' } = {}) {
  const key = JSON.stringify(spec) + '|' + size + '|' + yaw + '|' + models;
  if (portraitCache.has(key)) return portraitCache.get(key);
  const R = portraitRig();
  const job = R.queue.then(async () => {
    const hdSpec = models === 'hd' ? await hdBodySpec(data, spec.look || null, null, spec.creature || null) : null;
    const body = hdSpec ? await hdSpec.make() : spec.creature ? await buildCreature(spec.creature, { outline: false }) : await buildChibi(spec.look || {}, { anims: ['idle', 'ready'], outline: false });
    const g = new THREE.Group(); g.add(body.obj); R.scene.add(g);
    try {
      body.loop('idle'); body.update(0.01);
      g.rotation.y = spec.creature ? 0.55 : yaw;
      g.updateMatrixWorld(true);
      R.renderer.setSize(size, size, false); R.camera.aspect = 1; R.camera.updateProjectionMatrix();
      let cx = 0, cy, cz = 0, span;
      if (body.hd) {
        // a high-detail model: its head bone (UAL skeleton 'Head'), else the top of its bounding box
        body.obj.updateMatrixWorld(true);
        let head = null; body.obj.traverse(o => { if (!head && o.isBone && /^head$/i.test(o.name)) head = o; });
        const box = new THREE.Box3().setFromObject(body.obj), H = body.h || (box.max.y - box.min.y);
        span = Math.max(0.3, H * 0.3);
        const hp = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, H - span * 0.4, 0);
        cx = hp.x; cy = hp.y - span * 0.08; cz = hp.z;
      } else if (spec.creature) {
        // a beast: its head end, from the bounding box (creatures have no parked parts)
        const box = new THREE.Box3().setFromObject(body.obj), H = box.max.y - box.min.y;
        const head = body.creature.parts?.head, hp = head ? head.getWorldPosition(new THREE.Vector3()) : null;
        span = hp ? Math.max(0.35, H * 0.62) : Math.max(H * 0.8, (box.max.x - box.min.x) * 0.55);
        if (hp) { cx = hp.x; cy = Math.min(hp.y, box.max.y - span * 0.4); cz = hp.z; }
        else { cy = box.max.y - span * 0.5; cx = (box.max.x + box.min.x) / 2; cz = (box.max.z + box.min.z) / 2; }
      } else {
        // a person: head and shoulders from the rig's own numbers (a Chibi parks unused parts far below its feet,
        // so a bounding box can reach y = -100)
        const m = body.chibi.metrics(), top = m.height * 1.03, head = m.headHeight || m.height * 0.2;
        span = Math.max(0.6, head * 2.05); cy = top - span * 0.5;
      }
      const d = (span / 2) / Math.tan(THREE.MathUtils.degToRad(R.camera.fov) / 2) * 1.08;
      R.camera.position.set(cx, cy + span * 0.06, cz + d); R.camera.lookAt(cx, cy, cz);
      R.renderer.render(R.scene, R.camera);
      const c2 = document.createElement('canvas'); c2.width = c2.height = size;
      c2.getContext('2d').drawImage(R.canvas, 0, 0, size, size, 0, 0, size, size);
      return c2.toDataURL('image/png');
    } finally { R.scene.remove(g); body.dispose(); }
  });
  R.queue = job.catch(() => {});
  portraitCache.set(key, job);
  return job;
}
/** Who a story speaker / foe / boss is, as a renderPortrait spec. `hero` speakers are the player's own look (pass it). */
export function portraitSpec(data, id) {
  const sp = data.story?.speakers?.[id];
  if (sp?.look) return { look: sp.look };
  const foeId = sp?.boss || sp?.foe || id;
  const def = data.enemies.bosses[foeId] || data.enemies.foes[foeId];
  if (!def) return null;
  return def.body === 'creature' ? { creature: def.look } : { look: def.look };
}
export { CHIBI_ANIMS };
export { renderItemIcon, itemIconUrl, itemIconHtml, paintItemIcons } from './item-icons.js';
export { createStage } from './stage.js';
