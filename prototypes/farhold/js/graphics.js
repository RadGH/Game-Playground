// Farhold round 23 — the graphics round, in one place, so js/main.js only needs a few hook lines.
//
//   const graphics = createGraphics({ renderer, scene, camera, settings, lowQuality, seed,
//                                     world: () => ({ sky, terrain, view, props, features, weatherView }) });
//   createWeatherView({ ...opts, ...graphics.weatherOpts() });
//   graphics.update(dt, { mode, blended, indoors, space, x, z, y });   // after sky.update
//   weatherView.update(dt, blended, { ...ctx, ...graphics.weatherCtx() });
//   graphics.render(mode, () => { ...draw the scenes... });
//   graphics.setSize(w, h);  graphics.setLevel('high');
//
// What it owns:
//
//   * the Graphics setting (js/gfx.js decides what each level turns on)
//   * the picture pipeline (js/postfx.js)
//   * THE wind (js/wind.js) — one object, handed to the weather view, pushed into the shared shader
//     uniforms for the trees and the grass (js/atmosphere.js)
//   * the height fog: where the low ground is round you (so the valleys fill and the ridges stay
//     clear), how thick it is (js/sky-palette.js `fogFor`), and which way the sun glows through it
//   * the wet ground: it gets wet over half a minute of rain and dries over a minute and a half
//   * the GPU grass (js/grass-gpu.js) on High, handing the CPU tufts back on Low and Off
//   * where the sun is on screen, for the light shafts

import * as THREE from 'three';
import { resolveGraphics } from './gfx.js';
import { createWind } from './wind.js';
import { setWind, setAtmosphere, setAtmosphereFeatures, refreshMaterials, ATMO } from './atmosphere.js';
import { fogFor, gradeFor } from './sky-palette.js';
import { createPostFx } from './postfx.js';
import { createGpuGrass } from './grass-gpu.js';
import { BIOMES } from '../../../worldgen/js/biomes.js';

export function createGraphics({ renderer, scene, camera, settings = null, lowQuality = false, seed = 1, override = null, world = () => ({}) } = {}) {
  let gfx = resolveGraphics(settings?.get?.('graphics'), { lowQuality, override });
  const wind = createWind({ seed });
  const post = createPostFx(renderer, gfx);
  let grass = null, grassFor = null;
  let fogBase = null, fogBaseAt = [Infinity, Infinity], fogBaseClock = 0;
  let wet = 0, lastSunY = 0, rising = true;
  let lastMode = 'ground';
  let lastXZ = null;
  const sunFog = new THREE.Color(), skyRefl = new THREE.Color(), glowC = new THREE.Color();
  const tmp = new THREE.Vector3();
  const look = { sunScreen: { x: 0.5, y: 0.7 }, sunVisible: 0, space: 0, indoors: false, grade: null, flash: 0 };
  let biomeKey = null;
  let weatherView = null;
  let viewHeight = 720;

  // The DOM god rays in js/sunfx.js paint over the canvas; with the real shafts on they would be a
  // second set of rays in a slightly different place. The flare and the horizon wash stay.
  const style = document.createElement('style');
  style.textContent = 'body.fh-shafts .sunfx-rays, body.fh-shafts .sunfx-glow { display: none !important; }';
  document.head.append(style);

  function applyLevel() {
    post.setFlags(gfx);
    document.body.classList.toggle('fh-shafts', !!gfx.shafts);
    document.body.dataset.graphics = gfx.level;
    const w = world();
    // Off compiles the height fog and the wet ground out altogether (js/atmosphere.js FEATURES)
    if (setAtmosphereFeatures({ fog: gfx.heightFog, wet: gfx.wetGround })) refreshMaterials(scene, w.sky?.scene);
    w.sky?.setHdr?.(gfx.postfx);
    weatherView?.setGfx?.(gfx);
    ensureGrass();
  }

  function ensureGrass() {
    const w = world();
    const want = gfx.gpuGrass && w.terrain && w.view;
    if (grass && (!want || grassFor !== w.terrain)) { grass.dispose(); grass = null; grassFor = null; }
    if (want && !grass) {
      grass = createGpuGrass(scene, { terrain: w.terrain, view: w.view, props: w.props, features: w.features, gfx });
      grassFor = w.terrain;
    }
    w.props?.setGrassMode?.(grass ? 'gpu' : 'cpu', lastXZ?.[0], lastXZ?.[1]);
  }

  /** The low ground round the player: the 25th percentile of a wide ring of samples. */
  function sampleFogBase(terrain, x, z) {
    const hs = [];
    for (const r of [250, 700, 1400]) {
      for (let a = 0; a < 10; a++) {
        const t = (a / 10) * Math.PI * 2 + r;
        hs.push(terrain.heightAt(x + Math.cos(t) * r, z + Math.sin(t) * r));
      }
    }
    hs.push(terrain.heightAt(x, z));
    hs.sort((a, b) => a - b);
    const low = hs[Math.floor(hs.length * 0.25)];
    return terrain.hasSea ? Math.max(low, (terrain.seaLevel ?? 0) - 5) : low;
  }

  const api = {
    wind, post, ATMO,
    get flags() { return gfx; },
    get level() { return gfx.level; },
    get grass() { return grass; },
    get wet() { return wet; },
    /**
     * The Graphics setting changed. `explicit` is the player picking a level on the panel, which
     * wins over `?quality=low` and `?graphics=` — those only decide what the page BOOTS at.
     */
    setLevel(level, { explicit = false } = {}) {
      const next = explicit ? resolveGraphics(level) : resolveGraphics(level, { lowQuality, override });
      const changed = next.level !== gfx.level;
      gfx = next;
      if (changed || !api._applied) { api._applied = true; applyLevel(); }
      return gfx.level;
    },
    /** The weather view is built after this, and rebuilt on every new world. */
    setWeatherView(v) { weatherView = v; v?.setGfx?.(gfx); },
    /** A new world: new terrain, new props, new sky. */
    rebind() { applyLevel(); fogBase = null; fogBaseAt = [Infinity, Infinity]; },
    /** What createWeatherView needs to share the wind and know the budgets. */
    weatherOpts() { return { wind, gfx, terrain: () => world().terrain }; },
    /** What weatherView.update needs every frame, on top of what main.js already passes. */
    weatherCtx() { return { sky: world().sky?.state, indoors: look.indoors, biome: biomeKey, viewHeight }; },
    setSize(w, h) {
      post.setSize(w, h);
      viewHeight = Math.max(1, Math.floor(h * renderer.getPixelRatio()));
    },

    /**
     * Once a frame, after sky.update. ctx: { mode, blended, indoors, space (0..1), x, z, y }
     */
    update(dt, ctx = {}) {
      const w = world();
      const { sky, terrain, props } = w;
      const blended = ctx.blended || {};
      const indoors = !!ctx.indoors;
      const space = Math.max(0, Math.min(1, ctx.space ?? 0));
      look.indoors = indoors; look.space = space;
      lastMode = ctx.mode || 'ground';

      // --- the wind: the weather's number in, one direction and gust out, to everybody
      wind.update(dt, indoors ? 0 : (blended.wind ?? 0));
      setWind(wind);

      if (!sky) return;
      const st = sky.state;
      const sunY = sky.sunDirection.y;
      if (Math.abs(sunY - lastSunY) > 1e-5) rising = sunY > lastSunY;
      lastSunY = sunY;

      // --- the height fog
      if (terrain && ctx.x != null && !indoors) {
        fogBaseClock -= dt;
        if (fogBase == null || fogBaseClock <= 0 || Math.hypot(ctx.x - fogBaseAt[0], ctx.z - fogBaseAt[1]) > 400) {
          const b = sampleFogBase(terrain, ctx.x, ctx.z);
          fogBase = fogBase == null ? b : fogBase + (b - fogBase) * 0.35;
          fogBaseAt = [ctx.x, ctx.z];
          fogBaseClock = 2;
        }
        const id = terrain.biomeIdAt(ctx.x, ctx.z);
        biomeKey = BIOMES[id]?.key || null;
      }
      const fog = fogFor(sunY, blended, { rising, space, indoors });
      if (st) {
        sunFog.setRGB(st.horizon[0], st.horizon[1], st.horizon[2], THREE.SRGBColorSpace)
          .lerp(glowC.setRGB(st.glow[0], st.glow[1], st.glow[2], THREE.SRGBColorSpace), 0.6);
        skyRefl.setRGB(st.mid[0], st.mid[1], st.mid[2], THREE.SRGBColorSpace).multiplyScalar(0.8);
      }

      // --- wet ground: half a minute to soak, a minute and a half to dry
      const wantWet = indoors || space > 0.2 ? 0 : Math.min(1, (blended.rain ?? 0) * 1.3 + (blended.snow ?? 0) * 0.25);
      wet += (wantWet - wet) * Math.min(1, dt * (wantWet > wet ? 1 / 25 : 1 / 90) * 3);
      setAtmosphere({ fog, base: fogBase ?? 0, sunDir: sky.sunDirection, sunFog, wet: gfx.wetGround ? wet : 0, skyRefl });

      // --- the grade, and where the sun is for the shafts
      if (st) look.grade = gradeFor(st);
      look.flash = st?.flash || 0;
      tmp.copy(sky.sunDirection).multiplyScalar(1000).add(camera.position).project(camera);
      const inFront = tmp.z < 1 && tmp.z > -1;
      look.sunScreen = { x: tmp.x * 0.5 + 0.5, y: tmp.y * 0.5 + 0.5 };
      const off = Math.hypot(look.sunScreen.x - 0.5, look.sunScreen.y - 0.5) * 2;
      look.sunVisible = inFront && !indoors && sunY > -0.03
        ? (1 - Math.min(1, Math.max(0, (off - 0.6) / 0.8))) * (1 - (blended.cloud ?? 0) * 0.75) * (1 - space)
          * Math.min(1, (sunY + 0.03) * 12)
        : 0;

      // --- the grass
      if (grass) {
        const on = settings?.get?.('grass') !== false && (props?.grassOn ?? true) && !indoors && lastMode === 'ground' && space < 0.05;
        grass.setVisible(on);
        grass.setDensity(Math.min(1.5, Number(settings?.get?.('density') ?? 1)));
        if (on && ctx.x != null) grass.update(ctx.x, ctx.z, ctx.y);
      }
      if (ctx.x != null) {
        lastXZ = [ctx.x, ctx.z];
        // the CPU tufts step aside for the GPU field (and come back if it goes)
        const want = grass ? 'gpu' : 'cpu';
        if (props?.grassMode && props.grassMode !== want) props.setGrassMode(want, ctx.x, ctx.z);
      }
    },

    /** Draw a frame through the pipeline (or straight to the screen when it is off). */
    render(mode, draw) {
      const inSpace = mode === 'space' || mode === 'warp';
      if (inSpace) {
        look.space = 1; look.sunVisible = 0; look.indoors = false;
        if (grass) grass.setVisible(false);
      }
      post.setLook({ ...look, dt: 1 / 60 });
      const info = renderer.info.render;
      let saved = null;
      post.render(() => {
        draw();
        saved = { calls: info.calls, triangles: info.triangles, points: info.points, lines: info.lines };
      });
      // the readouts (and the tests) mean "the world scene", as they always have — not the
      // full-screen passes that come after it
      if (saved && gfx.postfx) Object.assign(info, saved);
    },

    stats() {
      return {
        level: gfx.level, flags: { ...gfx }, passes: post.stats.passes,
        wind: { dirX: wind.dirX, dirZ: wind.dirZ, strength: wind.strength, gust: wind.gust },
        fog: {
          density: ATMO.uFhFogDensity.value, falloff: ATMO.uFhFogFalloff.value,
          amount: ATMO.uFhFogAmount.value, base: ATMO.uFhFogBase.value,
        },
        wet, grass: grass ? { blades: grass.count, visible: grass.visible, ...grass.stats } : null,
        sunVisible: look.sunVisible, space: look.space,
      };
    },
  };
  api.setLevel(gfx.level);
  return api;
}
