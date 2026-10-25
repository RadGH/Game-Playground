// Roverlands world view — everything that draws the world (not the vehicles or the people).
//
//   const view = await createWorldView({ THREE, renderer, scene, camera, world, quality: 'medium' });
//   per frame:  view.update(dt, camera); view.render(dt);          (render = the post chain; or renderer.render yourself)
//   view.breakObject(id, { dir, speed, instant })  -> 'gone' | 'flat' | null
//   view.objectPiece(id)   THREE.Object3D at the object's BASE point (origin = o.x, o.y, o.z; rotation.y = o.yaw),
//                          already in the scene — move it with your falling body. null for 'flatten' objects.
//   view.tracks.add(key, x, y, z, nx, ny, nz, width, surfaceId, dirX, dirZ) / view.tracks.lift(key)
//   view.dust(x, y, z, surfaceId, amount) / view.splash(x, y, z, amount)
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
import { createTracks } from './tracks.js';
import { createParticles } from './particles.js';
import { drawMap, worldToMap } from './mapimage.js';

export async function createWorldView({ THREE = THREE_NS, renderer, scene, camera, world, quality = 'medium', hour = 10.5, weather = 'clear', onProgress, progress: progressCb } = {}) {
  const T = THREE;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.info.autoReset = false;

  const mapCache = new Map();
  let q, sky, ground, water, things, grass, tracks, dust, composer, passes, textures;
  const postInfo = { mode: /[?&]post=0\b/.test(globalThis.location?.search || '') ? 'direct' : 'post', target: null, frame: 0, checks: 0, black: 0, why: null };
  let elapsed = 0;
  let lastCam = new T.Vector3();
  const size = new T.Vector2();
  renderer.getSize(size);
  const state = { hour, weather };
  const cb = onProgress || progressCb;   // either name: (fraction 0..1, label)
  const progress = (f, label) => { if (cb) cb(f, label); return new Promise(r => setTimeout(r, 0)); };

  async function build(name) {
    q = resolveQuality(name);
    renderer.setPixelRatio(Math.min(q.pixelRatio, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)));
    await progress(0.05, 'lighting the sky');
    sky = createSky(scene, renderer, camera, { quality: q, worldSize: world.size });
    for (const l of sky.csm.lights) l.castShadow = q.shadows;
    sky.setWeather(state.weather);
    sky.setTime(state.hour);
    await progress(0.15, 'painting the ground');
    if (!textures || textures.size !== q.textureSize) {
      textures?.albedo.dispose(); textures?.normal.dispose();
      textures = { ...buildGroundTextures(q.textureSize, q.anisotropy), size: q.textureSize };
    }
    await progress(0.45, 'laying the ground');
    ground = createGround(world, q, { csm: sky.csm, textures });
    scene.add(ground.group);
    water = createWater(world, q);
    water.setEnvironment(sky.envCube);
    scene.add(water.mesh);
    await progress(0.6, 'growing the trees');
    things = await createThings({ world, quality: q, csm: sky.csm, scene });
    scene.add(things.group);
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
    for (const o of [ground?.group, water?.mesh, things?.group, grass?.mesh, tracks?.mesh, dust?.points]) if (o) scene.remove(o);
    ground?.dispose(); water?.dispose(); things?.dispose(); grass?.dispose(); tracks?.dispose(); dust?.dispose();
    if (sky) { scene.remove(sky.group); scene.remove(sky.hemi); scene.remove(sky.fill); sky.dispose(); }
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
      if (grass.mesh) grass.update(cam.position);
      sky.update(dt, elapsed);
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
        for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.8], [0.8, 0.8], [0.5, 0.25], [0.15, 0.3]]) { gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); sum += px[0] + px[1] + px[2]; }
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
    setTime(h) { state.hour = h; sky.setTime(h); },
    setWeather(name) { if (!WEATHER[name]) return; state.weather = name; sky.setWeather(name); },
    get hour() { return state.hour; },

    debug() {
      const info = renderer.info.render;
      let casters = 0;
      scene.traverse(o => { if (o.isMesh && o.castShadow && o.visible) casters++; });
      return {
        quality: q.name, calls: info.calls, triangles: info.triangles,
        terrainChunks: ground.chunkCount, things: things.stats(), grass: grass.count || 0, tracks: tracks.count,
        casters, cascades: sky.csm.cascades, fog: SHARED.hdFogDensity.value,
      };
    },
    dispose() { teardown(); textures?.albedo.dispose(); textures?.normal.dispose(); },
  };
  return view;
}
