// Roverlands world view — everything that draws the world (not the vehicles or the people).
//
//   const view = await createWorldView({ THREE, renderer, scene, camera, world, quality: 'medium' });
//   per frame:  view.update(dt, camera); view.render(dt);          (render = the post chain; or renderer.render yourself)
//   view.breakObject(id, { dir, speed, instant })  -> 'gone' | 'flat' | null
//   view.objectPiece(id)   THREE.Object3D at the object's BASE point (origin = o.x, o.y, o.z; rotation.y = o.yaw),
//                          already in the scene — move it with your falling body. null for 'flatten' objects.
//   view.tracks.add(key, x, y, z, nx, ny, nz, width, surfaceId, dirX, dirZ) / view.tracks.lift(key)
//   view.dust(x, y, z, surfaceId, amount) / view.splash(x, y, z, amount) / view.kick(x, y, z, vx, vy, vz, surfaceId, amount, g) (M12)
//   view.pushGrass([{ x, y, z, r }])   up to four things that bend the grass aside (vehicles, players)
//   view.mapImage(size) -> HTMLCanvasElement (cached)       view.worldToMap(x, z, size) -> [px, py]
//   view.setQuality('low' | 'medium' | 'high') -> Promise     view.quality (name)
//   view.sunDir (THREE.Vector3)   view.csm (or null)   view.enhance(material) -> the material with shadows + fog
//   view.setTime(hour) / view.setWeather(name)   view.resize(w, h)   view.debug()   view.dispose()
//
// Boot order (from highdef-3d/js/app.js, and it matters): the sky first, because it owns the cascaded-shadow rig and
// every material is handed that rig as it is made; then ground, water, things, grass, tracks, dust; then the post
// chain. The renderer is the caller's: this sets its tone mapping (ACES), output colour space and shadow map, which
// the look depends on.

import { createSky, WEATHER } from '../../../../../highdef-3d/js/sky.js';
import { enhance as hdEnhance, SHARED, tickMaterials } from '../../../../../highdef-3d/js/materials.js';
import { GodRayPass, GradeShader } from '../../../../../highdef-3d/js/postfx.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import * as THREE_NS from 'three';
import { resolveQuality } from './quality.js';
import { buildGroundTextures, createGround } from './ground.js';
import { createWater } from './water.js';
import { createGrass } from './grass.js';
import { createThings } from './things.js';
import { createBuildings } from './buildings.js';
import { createMarkings } from './markings.js';
import { createTracks } from './tracks.js';
import { createParticles } from './particles.js';
import { drawMap, worldToMap } from './mapimage.js';
import { createSpaceBackdrop } from './space.js';
import { createStationView } from './station.js';

export async function createWorldView({ THREE = THREE_NS, renderer, scene, camera, world, quality = 'medium', hour = 10.5, weather = 'clear', onProgress, progress: progressCb } = {}) {
  // Lantern Station is an interior, not a landscape: its own small view with the same contract (station.js)
  if (world.map === 'station') return createStationView({ THREE, renderer, scene, camera, world, quality, onProgress, progress: progressCb });
  const T = THREE;
  // the Moon (world.sky === 'black'): no air — black sky with stars and the planet, a hard white sun, no fog, no grass,
  // no water, grey ground textures (applySpace below)
  const black = world.sky === 'black';
  let space = null;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.info.autoReset = false;

  const mapCache = new Map();
  let q, sky, ground, water, things, buildings, markings, grass, tracks, dust, composer, passes, textures;
  const postInfo = { mode: /[?&]post=0\b/.test(globalThis.location?.search || '') ? 'direct' : 'post', target: null, frame: 0, checks: 0, black: 0, why: null };
  let elapsed = 0;
  const fogLast = { base: 0, baseMax: 0.94, wrote: NaN, wroteMax: NaN };    // height-thinned fog (update below)
  let lastCam = new T.Vector3();
  const size = new T.Vector2();
  renderer.getSize(size);
  const state = { hour, weather };
  const cb = onProgress || progressCb;   // either name: (fraction 0..1, label)
  const progress = (f, label) => { if (cb) cb(f, label); return new Promise(r => setTimeout(r, 0)); };

  async function build(name) {
    q = resolveQuality(name);
    if (black) q = { ...q, grass: false, grassDistance: 0, godRays: false };
    renderer.setPixelRatio(Math.min(q.pixelRatio, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)));
    await progress(0.05, 'lighting the sky');
    sky = createSky(scene, renderer, camera, { quality: q, worldSize: world.size });
    for (const l of sky.csm.lights) l.castShadow = q.shadows;
    sky.setWeather(state.weather);
    sky.setTime(black ? world.space?.hour ?? 8 : state.hour);
    if (black) { space = createSpaceBackdrop(T, world.space, { stars: q.stars * 2 }); scene.add(space.group); applySpace(); }
    await progress(0.15, 'painting the ground');
    const palette = black ? 'moon' : 'earth';
    if (!textures || textures.size !== q.textureSize || textures.palette !== palette) {
      textures?.albedo.dispose(); textures?.normal.dispose();
      textures = { ...buildGroundTextures(q.textureSize, q.anisotropy, palette), size: q.textureSize, palette };
    }
    await progress(0.45, 'laying the ground');
    ground = createGround(world, q, { csm: sky.csm, textures });
    scene.add(ground.group);
    water = black || !world.river?.pts?.length ? noWater(T) : createWater(world, q);
    water.setEnvironment(sky.envCube);
    scene.add(water.mesh);
    await progress(0.6, 'growing the trees');
    things = await createThings({ world, quality: q, csm: sky.csm, scene });
    scene.add(things.group);
    buildings = createBuildings(world, q, { csm: sky.csm });
    scene.add(buildings.group);
    markings = createMarkings(world, q, { csm: sky.csm });       // road + runway paint (county only)
    scene.add(markings.group);
    await progress(0.8, 'seeding the grass');
    grass = createGrass(world, q, { csm: sky.csm });
    if (grass.mesh) scene.add(grass.mesh);
    tracks = createTracks(world, q, { csm: sky.csm });
    scene.add(tracks.mesh);
    dust = createParticles(q);
    scene.add(dust.points);
    buildPost();
    ground.preload(camera.position);
    things.preload(camera.position);
    await progress(1, 'ready');
  }

  /** Turn the day sky into space: hide the dome, clouds and moon disc, black background, no fog, the sun where the
   *  world says, white and hard, almost no fill light (shadows on the Moon are nearly black). Re-run after setTime. */
  function applySpace() {
    sky.sky.visible = false; sky.moonDisc.visible = false; sky.sunDisc.visible = false;
    for (const c of sky.cloudLayers) c.visible = false;
    sky.stars.visible = false;
    scene.background = new T.Color(0x000000);
    scene.environment = null;
    const d = space.sunDir;
    sky.state.sunDir.copy(d);
    sky.csm.lightDirection.copy(d).multiplyScalar(-1).normalize();
    sky.csm.lightIntensity = 3.4;
    for (const l of sky.csm.lights) { l.color.setRGB(1, 0.985, 0.96); l.intensity = 3.4; }
    // a little light in the shadows (sunlight off the ground and the planet) so a shaded ramp still reads
    sky.hemi.color.setRGB(0.55, 0.6, 0.7); sky.hemi.groundColor.setRGB(0.42, 0.42, 0.43); sky.hemi.intensity = 0.32;
    sky.fill.intensity = 0.12;
    sky.state.exposure = 0.9;
    SHARED.hdFogDensity.value = 0; SHARED.hdFogMax.value = 0;
    SHARED.hdSunDir.value.copy(d);
  }

  function buildPost() {
    composer?.dispose();
    renderer.getSize(size);
    const pr = renderer.getPixelRatio();
    // a half-float target only where the GPU says it can draw into one (iPhones may not: the frame comes out black)
    const ext = renderer.extensions;
    const canHalf = ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float');
    const target = new T.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr), {
      type: canHalf ? T.HalfFloatType : T.UnsignedByteType, samples: canHalf ? (q.msaa || 0) : 0, colorSpace: T.LinearSRGBColorSpace, depthBuffer: true,
    });
    postInfo.target = canHalf ? 'half' : 'byte';
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pr);
    composer.setSize(size.x, size.y);
    passes = {};
    passes.render = new RenderPass(scene, camera);
    composer.addPass(passes.render);
    if (q.godRays) { passes.godRays = new GodRayPass({ samples: 36 }); passes.godRays.uniforms.uAspect.value = size.x / size.y; composer.addPass(passes.godRays); }
    if (q.bloom) { passes.bloom = new UnrealBloomPass(new T.Vector2(size.x, size.y), q.bloomStrength, 0.45, 2.0); composer.addPass(passes.bloom); }
    passes.output = new OutputPass();
    composer.addPass(passes.output);
    passes.grade = new ShaderPass(GradeShader);
    passes.grade.uniforms.uResolution.value.set(size.x, size.y);
    composer.addPass(passes.grade);
    if (q.smaa) { passes.smaa = new SMAAPass(); composer.addPass(passes.smaa); }
    for (const p of composer.passes) p.renderToScreen = false;
    composer.passes[composer.passes.length - 1].renderToScreen = true;
  }

  function teardown() {
    for (const o of [ground?.group, water?.mesh, things?.group, buildings?.group, markings?.group, grass?.mesh, tracks?.mesh, dust?.points, space?.group]) if (o) scene.remove(o);
    space?.dispose(); space = null;
    ground?.dispose(); water?.dispose(); things?.dispose(); buildings?.dispose(); markings?.dispose(); grass?.dispose(); tracks?.dispose(); dust?.dispose();
    // the shadow rig's sun lights live in the scene, not in sky.group, and CSM.dispose() leaves them there: switching
    // quality in a game kept the old suns and added new ones, so the picture washed out white (report #6, "hi gfx
    // bloom" — it was never the bloom). remove() takes them out first.
    if (sky) { sky.csm?.remove?.(); scene.remove(sky.group); scene.remove(sky.hemi); scene.remove(sky.fill); sky.dispose(); }
    composer?.dispose();
  }

  await build(quality);

  const view = {
    get quality() { return q.name; },
    get preset() { return q; },
    get sunDir() { return sky.sunDir; },
    get csm() { return sky?.csm || null; },
    get sky() { return sky; },
    get things() { return things; },
    tracks: {
      add: (...a) => tracks.add(...a),
      lift: (k) => tracks.lift(k),
      clear: () => tracks.clear(),
      get count() { return tracks.count; },
    },
    enhance(material, opts = {}) { return hdEnhance(material, { csm: sky.csm, fog: true, ...opts }); },

    update(dt, cam = camera) {
      elapsed += dt;
      tickMaterials(elapsed);
      lastCam.copy(cam.position);
      ground.update(cam.position, 2);
      things.update(cam.position);
      buildings.update(cam.position);
      markings.update(cam.position);
      if (grass.mesh) grass.update(cam.position);
      sky.update(dt, elapsed);
      if (space) space.update(cam);
      else {
        // fog thins with height above the ground, so a skydiver, a glider or the landing pod sees the county below
        // instead of a white wall. The sky writes its own fog numbers (maybe not every frame), so we remember its last
        // number and scale that, never our own scaled one.
        const d = SHARED.hdFogDensity.value, m = SHARED.hdFogMax.value;
        if (d !== fogLast.wrote) fogLast.base = d;
        if (m !== fogLast.wroteMax) fogLast.baseMax = m;
        const up = Math.max(0, cam.position.y - world.heightAt(cam.position.x, cam.position.z) - 120);
        const k = 1 / (1 + up / 180);                       // 300 m up: about 60% of the fog; 1.5 km: about 12%
        fogLast.wrote = SHARED.hdFogDensity.value = fogLast.base * k;
        fogLast.wroteMax = SHARED.hdFogMax.value = fogLast.baseMax * (0.35 + 0.65 * k);
      }
      water.setSun(sky.sunDir, sky.state.day.sun);
      tracks.update(elapsed);
      dust.update(dt, cam);
      if (passes.godRays) {
        const s = sky.sunScreenPosition();
        passes.godRays.uniforms.uSunPos.value.set(s.x, s.y);
        const want = s.visible ? Math.min(1, Math.max(0, sky.sunDir.y * 3.2)) : 0;
        const u = passes.godRays.uniforms.uAmount;
        u.value += (want - u.value) * Math.min(1, dt * 4);
        passes.godRays.uniforms.uTint.value.copy(sky.state.day.inscatter);
      }
      renderer.toneMappingExposure = sky.exposure;
    },
    render(dt = 1 / 60) {
      renderer.info.reset();
      if (postInfo.mode === 'direct') { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      if (passes.render.camera !== camera) passes.render.camera = camera;
      if (passes.grade) passes.grade.uniforms.uTime.value += dt;
      composer.render(dt);
      // Safety net: for the first few hundred frames, look at a few pixels of what reached the screen. A post chain
      // the GPU cannot run leaves the frame pure black (no error is thrown); after several black looks in a row,
      // drop to drawing the scene straight to the screen (no bloom / grade), and say so in bug reports.
      if (postInfo.checks < 40 && ++postInfo.frame % 8 === 0) {
        postInfo.checks++;
        const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4);
        let sum = 0;
        for (const [fx, fy] of (black ? SPOTS_LOW : SPOTS)) { gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); sum += px[0] + px[1] + px[2]; }
        postInfo.black = sum === 0 ? postInfo.black + 1 : 0;
        if (postInfo.black >= 4) { postInfo.mode = 'direct'; postInfo.why = 'black frames'; console.warn('[roverlands] post effects drew a black frame on this device: drawing without them'); }
      }
    },
    get post() { return { ...postInfo }; },
    /** Use a different camera from now on (the shadows and the sky follow it). */
    setCamera(cam) { camera = cam; passes.render.camera = cam; if (sky.csm) { sky.csm.camera = cam; sky.csm.updateFrustums(); } },
    resize(w, h) {
      size.set(w, h);
      composer.setSize(w, h);
      passes.grade?.uniforms.uResolution.value.set(w, h);
      if (passes.godRays) passes.godRays.uniforms.uAspect.value = w / Math.max(1, h);
      sky.csm?.updateFrustums();
    },

    /** Build everything near `pos` now (after a teleport), instead of over the next frames. */
    preload(pos = camera.position) { ground.preload(pos); things.preload(pos); if (grass.mesh) grass.update(pos); },

    breakObject(id, { instant = false } = {}) {
      const st = things.breakObject(id, { instant });
      return st === 1 ? 'gone' : st === 2 ? 'flat' : null;
    },
    objectPiece(id) { return things.objectPiece(id); },
    isBroken(id) { return things.isBroken(id); },
    dust(x, y, z, surf, amount) {
      dust.dust(x, y, z, surf, amount);
      if (world.waterAt(x, z) != null) dust.splash(x, y, z, amount);
    },
    splash(x, y, z, amount) { dust.splash(x, y, z, amount); },
    kick(x, y, z, vx, vy, vz, surf, amount, g) { dust.kick(x, y, z, vx, vy, vz, surf, amount, g); },      // M12: the Moon's wheel dust
    pushGrass(list) { grass.setPush?.(list); },

    mapImage(px = 1024) {
      if (!mapCache.has(px)) mapCache.set(px, drawMap(world, px));
      return mapCache.get(px);
    },
    worldToMap(x, z, px) { return worldToMap(world, x, z, px); },

    async setQuality(name) {
      if (name === q.name) return;
      const broken = [];
      for (let i = 0; i < world.objects.length; i++) if (things.isBroken(i)) broken.push(i);
      teardown();
      await build(name);
      for (const id of broken) things.breakObject(id, { instant: true });
    },
    setTime(h) { state.hour = h; if (black) return; sky.setTime(h); },
    setWeather(name) { if (!WEATHER[name] || black) return; state.weather = name; sky.setWeather(name); },
    get hour() { return state.hour; },

    debug() {
      const info = renderer.info.render;
      let casters = 0;
      scene.traverse(o => { if (o.isMesh && o.castShadow && o.visible) casters++; });
      return {
        quality: q.name, calls: info.calls, triangles: info.triangles,
        terrainChunks: ground.chunkCount, things: things.stats(), buildings: { count: buildings.count, meshes: buildings.meshes, triangles: buildings.triangles }, markings: { quads: markings.count, meshes: markings.meshes, shown: markings.group.children.filter(m => m.visible).length }, grass: grass.count || 0, tracks: tracks.count,
        casters, cascades: sky.csm.cascades, fog: SHARED.hdFogDensity.value,
      };
    },
    dispose() { teardown(); textures?.albedo.dispose(); textures?.normal.dispose(); },
  };
  return view;
}

// where the black-frame check looks (gl y = 0 is the bottom row). On the Moon the sky really is black, so it only
// looks low on the screen, where the ground is.
const SPOTS = [[0.5, 0.5], [0.2, 0.8], [0.8, 0.8], [0.5, 0.25], [0.15, 0.3]];
const SPOTS_LOW = [[0.5, 0.08], [0.2, 0.12], [0.8, 0.12], [0.5, 0.2], [0.35, 0.05]];

/** A stand-in for water.js on a world with none (the Moon). */
function noWater(T) {
  const mesh = new T.Group();
  mesh.name = 'no-water';
  return { mesh, setEnvironment() {}, setSun() {}, dispose() {} };
}
