// Farhold — what the weather looks like.
//
// `worldgen/js/weather.js` decides WHAT the weather is (and is pure data, shared with World Forge).
// This file draws it: cloud decks in the sky scene, rain, snow and blown dust around the camera,
// lightning that actually lights the ground, and the fog and gloom that a heavy sky brings with it.
//
//   const view = createWeatherView({ scene, skyScene, palette, seed, wind, gfx, terrain });
//   view.update(dt, clock.blend(), { camera, sunDir, daylight, sky: sky.state });
//   scene.fog.color.copy(view.fogColor); scene.fog.far = view.fogFar;
//
// Clouds live in the sky scene (the one drawn with a camera at the origin), so they sit between you
// and the planets overhead and never clip into a mountain. Precipitation lives in the world scene.
//
// R23 — THE ROUND THIS FILE GOT ATMOSPHERE:
//
//   * ONE WIND. Everything that moves in the wind reads `wind` (js/wind.js): the rain's lean, the
//     snow's drift, the dust, which way the cloud deck crosses the sky, and — through
//     js/atmosphere.js — the trees and the grass. It used to be a strength with no direction at all,
//     so the rain slanted along +x, the dust blew along +x, and the clouds scrolled round the zenith.
//   * THE CLOUDS CROSS THE SKY. The deck's texture was wrapped onto the dome by its own u/v, so
//     scrolling it turned the clouds round the zenith like a record. It is now projected as a flat
//     sheet overhead (`dir.xz / dir.y`), which is what a cloud layer is: scrolling moves them across
//     the sky downwind, and they bunch toward the horizon the way real ones do.
//   * CLOUDS LIT FROM BELOW. At sunset the underside of a deck takes the sky table's sunset colours —
//     gold and orange on the sun's side, rose and violet away from it — and a thin edge near the sun
//     gets a silver lining that the bloom picks up.
//   * RAIN, SNOW AND BLOWN THINGS on the graphics card (js/rain.js) whenever the Graphics setting is
//     Low or High. Off keeps the line rain below, now leaning with the wind.
//   * LIGHTNING that flickers the way it does — a strike, a gap, a second stroke — with a bolt bright
//     enough (on the HDR frame) to bloom.

import * as THREE from 'three';
import { makeNoise2D, subSeed, clamp, lerp } from '../../../worldgen/js/noise.js';
import { createWind, rainVelocity, snowDrift, debrisVelocity, cloudDrift } from './wind.js';
import { createPrecipitation } from './rain.js';

const DOME = 1000;

/**
 * A seamless cloud texture. The noise is blended with copies of itself shifted by the tile size,
 * so the left edge matches the right and the deck can scroll forever without a seam crawling past.
 */
function cloudCanvas(seed, size = 256, sharpness = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n = makeNoise2D(subSeed(seed >>> 0, 'cloudtex'));
  const octaves = (x, y) => {
    let v = 0, amp = 0.5, freq = 1;
    for (let o = 0; o < 5; o++) { v += amp * n(x * freq, y * freq); amp *= 0.52; freq *= 2.03; }
    return v * 0.5 + 0.5;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // four-way blend makes the tile wrap on both axes
      const a = octaves(u * 4, v * 4);
      const b = octaves((u - 1) * 4, v * 4);
      const c = octaves(u * 4, (v - 1) * 4);
      const d = octaves((u - 1) * 4, (v - 1) * 4);
      const value = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
      const shaped = Math.pow(clamp(value, 0, 1), sharpness);
      const o = (y * size + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = shaped * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * The deck's shader: a flat sheet overhead, lit from below at sunset, with a silver lining.
 * `uniforms` are the deck's own; the hook is kept as a named function so every deck shares one
 * compiled program.
 */
function deckShader(uniforms) {
  return function farholdCloudDeck(shader) {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFhSkyDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFhSkyDir = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFhSkyDir;
        uniform vec2 uCloudOffset;
        uniform float uCloudScale, uCloudDusk;
        uniform vec3 uCloudSun, uCloudUnder, uCloudAnti, uCloudSilver;`)
      .replace('#include <map_fragment>', `
        vec3 fhD = normalize( vFhSkyDir );
        vec2 fhUv = fhD.xz / max( fhD.y, 0.07 ) * uCloudScale - uCloudOffset;
        vec4 sampledDiffuseColor = texture2D( map, fhUv );
        diffuseColor *= sampledDiffuseColor;
        // thin out into the haze at the horizon rather than ending at the dome's rim
        diffuseColor.a *= smoothstep( 0.015, 0.2, fhD.y );
        float fhCs = max( dot( fhD, uCloudSun ), 0.0 );
        vec2 fhDh = fhD.xz / max( length( fhD.xz ), 1e-4 );
        vec2 fhSh = uCloudSun.xz / max( length( uCloudSun.xz ), 1e-4 );
        float fhSide = dot( fhDh, fhSh ) * 0.5 + 0.5;
        float fhLow = 1.0 - smoothstep( 0.02, 0.6, fhD.y );
        vec3 fhUnder = mix( uCloudAnti, uCloudUnder, fhSide * fhSide );
        diffuseColor.rgb = mix( diffuseColor.rgb, fhUnder, uCloudDusk * ( 0.35 + 0.65 * fhLow ) );
        float fhThin = 1.0 - sampledDiffuseColor.a;
        diffuseColor.rgb += uCloudSilver * pow( fhCs, 10.0 ) * ( 0.25 + fhThin * 1.5 );`);
  };
}

/**
 * opts: { scene (world), skyScene, palette (from worldgen weather.js atmospherePalette), seed,
 *         quality ('low' halves every particle budget), wind (js/wind.js — THE wind; one is made if
 *         none is given), gfx (js/gfx.js — whether the GPU rain and snow are on), terrain (for the
 *         splashes and the ground under the rain; an object or a function returning one) }
 */
export function createWeatherView({ scene, skyScene, palette = {}, seed = 1, quality = 'high', wind = null, gfx = null, terrain = null } = {}) {
  const low = quality === 'low';
  const cloudColor = new THREE.Color(palette.cloud || '#dfe6ee');
  const shadowColor = new THREE.Color(palette.cloudShadow || '#8d97a3');
  // the ONE wind — main.js passes the shared object; a view on its own makes its own
  const ownWind = !wind;
  wind = wind || createWind({ seed });
  const groundOf = () => (typeof terrain === 'function' ? terrain() : terrain);

  // ---------------------------------------------------------------- cloud decks
  const decks = [];
  for (const [i, spec] of [[0, { radius: 640, scale: 0.9, speed: 1, sharp: 1.5 }], [1, { radius: 720, scale: 0.55, speed: 0.6, sharp: 2.2 }]]) {
    const tex = new THREE.CanvasTexture(cloudCanvas(seed + i * 977, low ? 128 : 256, spec.sharp));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const uniforms = {
      uCloudOffset: { value: new THREE.Vector2() }, uCloudScale: { value: spec.scale },
      uCloudDusk: { value: 0 }, uCloudSun: { value: new THREE.Vector3(0, 1, 0) },
      uCloudUnder: { value: new THREE.Color(1, 0.6, 0.4) }, uCloudAnti: { value: new THREE.Color(0.7, 0.5, 0.6) },
      uCloudSilver: { value: new THREE.Color(0, 0, 0) },
    };
    const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, side: THREE.BackSide });
    material.onBeforeCompile = deckShader(uniforms);
    material.customProgramCacheKey = () => 'farhold-cloud-deck-v2';
    const mesh = new THREE.Mesh(
      // an upper dome only: clouds belong above the horizon, not wrapped around your ankles
      new THREE.SphereGeometry(spec.radius, low ? 20 : 36, low ? 10 : 18, 0, Math.PI * 2, 0, Math.PI * 0.54),
      material,
    );
    mesh.renderOrder = 5 + i;
    mesh.frustumCulled = false;
    mesh.name = 'farhold-clouds-' + i;
    skyScene.add(mesh);
    decks.push({ mesh, tex, uniforms, speed: spec.speed, offset: [Math.random() * 10, Math.random() * 10] });
  }

  // ---------------------------------------------------------------- precipitation on the card
  const wantsPrecip = g => !!g && (g.rainDrops > 0 || g.snowFlakes > 0 || g.debris > 0);
  let precip = wantsPrecip(gfx) ? createPrecipitation(scene, gfx) : null;

  // ---------------------------------------------------------------- precipitation, the old way
  const BOX = 44;                                   // metres of rain that exist at any moment
  const rainCount = low ? 700 : 2000;
  const rainPos = new Float32Array(rainCount * 2 * 3);
  const rainVel = new Float32Array(rainCount);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 6] = (Math.random() - 0.5) * BOX;
    rainPos[i * 6 + 1] = Math.random() * BOX;
    rainPos[i * 6 + 2] = (Math.random() - 0.5) * BOX;
    rainVel[i] = 26 + Math.random() * 16;
  }
  const rainGeom = new THREE.BufferGeometry();
  rainGeom.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const lineRain = new THREE.LineSegments(rainGeom, new THREE.LineBasicMaterial({ color: 0xa8c4dd, transparent: true, opacity: 0 }));
  lineRain.frustumCulled = false;
  lineRain.visible = false;
  lineRain.name = 'farhold-rain';
  scene.add(lineRain);

  const flakeCount = low ? 500 : 1400;
  const flakePos = new Float32Array(flakeCount * 3);
  const flakeDrift = new Float32Array(flakeCount * 2);
  for (let i = 0; i < flakeCount; i++) {
    flakePos[i * 3] = (Math.random() - 0.5) * BOX;
    flakePos[i * 3 + 1] = Math.random() * BOX;
    flakePos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    flakeDrift[i * 2] = Math.random() * 2 - 1;
    flakeDrift[i * 2 + 1] = Math.random() * 2 - 1;
  }
  /**
   * A ROUND FLAKE, because a `PointsMaterial` with no map draws a SQUARE.
   *
   * "The snow is square icons instead of round. Is that supposed to be snow or wind? Can we try a
   * different particle?" It was square because that is what a point sprite is by default — a flat
   * quad of solid colour with nothing shaping it. One small canvas with a radial falloff, generated
   * once and shared by the snow and the dust, turns every one of them into a soft disc.
   *
   * `depthWrite: false` matters as much as the shape: without it each sprite punches a hole in the
   * depth buffer and the ones behind it disappear, which reads as flickering.
   */
  const SPRITE = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d').createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    const ctx = c.getContext('2d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();

  const flakeGeom = new THREE.BufferGeometry();
  flakeGeom.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
  const pointSnow = new THREE.Points(flakeGeom, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.26, transparent: true, opacity: 0, sizeAttenuation: true,
    map: SPRITE, depthWrite: false,
  }));
  pointSnow.frustumCulled = false;
  pointSnow.visible = false;
  pointSnow.name = 'farhold-snow';
  scene.add(pointSnow);

  const dustCount = low ? 400 : 1100;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * BOX;
    dustPos[i * 3 + 1] = Math.random() * BOX * 0.6;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
  }
  const dustGeom = new THREE.BufferGeometry();
  dustGeom.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeom, new THREE.PointsMaterial({
    // bigger and warmer than a flake, so blown sand never reads as snow even at a glance
    color: new THREE.Color(palette.dust || palette.fog || '#c8a878'),
    size: 0.52, transparent: true, opacity: 0, sizeAttenuation: true,
    map: SPRITE, depthWrite: false,
  }));
  dust.frustumCulled = false;
  dust.visible = false;
  dust.name = 'farhold-dust';
  scene.add(dust);


  // ---------------------------------------------------------------- lightning
  const boltGeom = new THREE.BufferGeometry();
  boltGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 2 * 3), 3));
  // brighter than white on purpose: on the HDR frame the bloom turns this into a glowing channel
  const boltColor = new THREE.Color(0xdfeaff).multiplyScalar(precip ? 6 : 1);
  const bolt = new THREE.LineSegments(boltGeom, new THREE.LineBasicMaterial({ color: boltColor, transparent: true, opacity: 0 }));
  bolt.frustumCulled = false;
  bolt.visible = false;
  bolt.renderOrder = 9;
  skyScene.add(bolt);

  let nextStrike = 4 + Math.random() * 8;
  let flash = 0;
  let boltLife = 0;
  // a strike is rarely one flash: a stroke, a gap of a tenth of a second, and a second stroke
  let restrike = -1;

  /** Draw a fresh zig-zag somewhere in the sky. */
  function strike() {
    const pos = boltGeom.attributes.position.array;
    const a = Math.random() * Math.PI * 2;
    const tilt = 0.25 + Math.random() * 0.5;
    let x = Math.cos(a) * DOME * 0.5 * tilt, z = Math.sin(a) * DOME * 0.5 * tilt;
    let y = DOME * 0.5;
    for (let i = 0; i < 18; i++) {
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      x += (Math.random() - 0.5) * 70;
      z += (Math.random() - 0.5) * 70;
      y -= DOME * 0.028;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = z;
    }
    boltGeom.attributes.position.needsUpdate = true;
    boltLife = 0.16;
    flash = 1;
    restrike = Math.random() < 0.65 ? 0.09 + Math.random() * 0.12 : -1;
  }

  const state = {
    fogColor: new THREE.Color(palette.fog || '#9fb0c8'),
    fogFar: 7000,
    fogNear: 300,
    /** 0..1 extra light from a strike this frame — main.js adds it to the ambient. */
    flash: 0,
    /** 0..1 how much the sky is stealing the daylight. */
    gloom: 0,
    lastStrike: 0,
    strikes: 0,
    /** R23: what the GPU precipitation is doing (null when the Graphics setting is Off). */
    precip: null,
  };

  const white = new THREE.Color(0xffffff);
  const rainLit = new THREE.Color();
  const setC = (c, v) => (v ? c.setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace) : c);

  /**
   * dt in seconds, `w` is the blended weather from WeatherClock.blend(),
   * ctx: { camera, sunDir, daylight (0..1), baseFogColor, sky (js/sky.js `state`), indoors, biome,
   *        viewHeight (drawing-buffer pixels, for the snow's point size) }
   */
  function update(dt, w = {}, ctx = {}) {
    const camera = ctx.camera;
    const daylight = ctx.daylight ?? 1;
    const cloud = clamp(w.cloud ?? 0, 0, 1);
    if (ownWind) wind.update(dt, w.wind ?? 0);
    const sky = ctx.sky || null;

    // --- cloud decks: thicker cover means more opaque and darker, and they cross the sky downwind
    const drift = cloudDrift(wind);
    for (const [i, deck] of decks.entries()) {
      const opacity = clamp(cloud * (i === 0 ? 0.95 : 0.6), 0, 1);
      deck.mesh.material.opacity = opacity;
      // a clear sky's 4% cover is invisible anyway, and a whole-sky shader is not free
      deck.mesh.visible = opacity > 0.06;
      deck.offset[0] = (deck.offset[0] + drift.u * deck.speed * dt) % 1000;
      deck.offset[1] = (deck.offset[1] + drift.v * deck.speed * dt) % 1000;
      deck.uniforms.uCloudOffset.value.set(deck.offset[0], deck.offset[1]);
      deck.tex.offset.set(deck.offset[0], deck.offset[1]);
      // lit from above by day, and darker underneath the heavier the deck; moonlit, not black, at night
      const lit = 0.18 + daylight * 0.82;
      deck.mesh.material.color.copy(cloudColor).lerp(shadowColor, cloud * 0.55).multiplyScalar(lit);
      if (ctx.sunDir) deck.uniforms.uCloudSun.value.copy(ctx.sunDir);
      if (sky) {
        // the underside at sunset: the sky's own low bands, a little brighter than the sky itself
        setC(deck.uniforms.uCloudUnder.value, sky.low).lerp(setC(rainLit, sky.horizon), 0.5).multiplyScalar(1.1);
        setC(deck.uniforms.uCloudAnti.value, sky.aLow).multiplyScalar(0.95);
        deck.uniforms.uCloudDusk.value = clamp(sky.dusk, 0, 1) * (1 - (sky.gloom || 0) * 0.6);
        const silver = (precip ? 2.2 : 0.7) * clamp((ctx.sunDir?.y ?? 0) * 5 + 0.3, 0, 1) * (1 - cloud * 0.5);
        setC(deck.uniforms.uCloudSilver.value, sky.sun).multiplyScalar(silver);
      }
    }

    // --- the rain's colour: the sky it falls out of, lit by any lightning
    if (sky) setC(rainLit, sky.mid).lerp(setC(state.fogColor.clone(), sky.fog), 0.5).multiplyScalar(0.6 + daylight * 0.6);
    else rainLit.set(0xa8c4dd);

    const rainAmount = clamp(w.rain ?? 0, 0, 1);
    const snowAmount = clamp(w.snow ?? 0, 0, 1);
    const useGpu = !!precip;
    if (useGpu) {
      state.precip = precip.update(dt, {
        camera, weather: w, wind, terrain: groundOf(), colour: rainLit, flash: state.flash,
        indoors: !!ctx.indoors, biome: ctx.biome, daylight: 0.35 + daylight * 0.65,
        viewHeight: ctx.viewHeight, fogColour: state.fogColor,
      });
    }

    // --- the old line rain, now leaning with the wind (Graphics: Off)
    lineRain.visible = !useGpu && rainAmount > 0.01;
    lineRain.material.opacity = rainAmount * 0.55;
    if (lineRain.visible && camera) {
      const pos = rainGeom.attributes.position.array;
      const v = rainVelocity(wind, 30);
      const sx = v.x / 30, sz = v.z / 30;
      for (let i = 0; i < rainCount; i++) {
        const fall = rainVel[i] * dt * (0.5 + rainAmount);
        for (const k of [0, 1]) {
          pos[i * 6 + k * 3 + 1] -= fall;
          pos[i * 6 + k * 3] += sx * fall;
          pos[i * 6 + k * 3 + 2] += sz * fall;
        }
        if (pos[i * 6 + 1] < 0) {
          const x = (Math.random() - 0.5) * BOX, z = (Math.random() - 0.5) * BOX;
          pos[i * 6] = x; pos[i * 6 + 1] = BOX; pos[i * 6 + 2] = z;
          pos[i * 6 + 3] = x - sx * 0.75; pos[i * 6 + 4] = BOX - 0.75; pos[i * 6 + 5] = z - sz * 0.75;
        }
      }
      rainGeom.attributes.position.needsUpdate = true;
      lineRain.position.set(camera.position.x, camera.position.y - BOX / 2, camera.position.z);
    }

    pointSnow.visible = !useGpu && snowAmount > 0.01;
    pointSnow.material.opacity = snowAmount * 0.9;
    if (pointSnow.visible && camera) {
      const pos = flakeGeom.attributes.position.array;
      const d = snowDrift(wind);
      for (let i = 0; i < flakeCount; i++) {
        pos[i * 3 + 1] -= (1.1 + snowAmount * 2.4) * dt;
        pos[i * 3] += (d.x + flakeDrift[i * 2] * 0.4) * dt;
        pos[i * 3 + 2] += (d.z + flakeDrift[i * 2 + 1] * 0.4) * dt;
        if (pos[i * 3 + 1] < 0 || Math.abs(pos[i * 3]) > BOX / 2 || Math.abs(pos[i * 3 + 2]) > BOX / 2) {
          pos[i * 3] = (Math.random() - 0.5) * BOX;
          pos[i * 3 + 1] = BOX;
          pos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
        }
      }
      flakeGeom.attributes.position.needsUpdate = true;
      pointSnow.position.set(camera.position.x, camera.position.y - BOX / 2, camera.position.z);
    }

    const dustAmount = clamp(w.dust ?? 0, 0, 1);
    dust.visible = dustAmount > 0.01 && !ctx.indoors;
    dust.material.opacity = dustAmount * 0.5;
    if (dust.visible && camera) {
      const pos = dustGeom.attributes.position.array;
      const v = debrisVelocity(wind);
      const k = 1 + dustAmount * 1.5;
      for (let i = 0; i < dustCount; i++) {
        pos[i * 3] += v.x * k * dt;
        pos[i * 3 + 2] += v.z * k * dt;
        pos[i * 3 + 1] -= 0.4 * dt;
        // wrap in the box round the camera, whichever way it is blowing
        if (pos[i * 3] > BOX / 2) pos[i * 3] -= BOX; else if (pos[i * 3] < -BOX / 2) pos[i * 3] += BOX;
        if (pos[i * 3 + 2] > BOX / 2) pos[i * 3 + 2] -= BOX; else if (pos[i * 3 + 2] < -BOX / 2) pos[i * 3 + 2] += BOX;
        if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = Math.random() * BOX * 0.6;
      }
      dustGeom.attributes.position.needsUpdate = true;
      dust.position.set(camera.position.x, camera.position.y - BOX * 0.3, camera.position.z);
    }

    // --- lightning
    const rate = clamp(w.lightning ?? 0, 0, 1);
    if (rate > 0.01) {
      nextStrike -= dt * (0.3 + rate * 2.2);
      if (nextStrike <= 0) {
        nextStrike = 1.5 + Math.random() * (9 - rate * 6);
        strike();
        state.strikes++;
        state.lastStrike = 0;
      }
    }
    if (restrike > 0) {
      restrike -= dt;
      if (restrike <= 0) { flash = Math.max(flash, 0.8); boltLife = 0.12; restrike = -1; }
    }
    state.lastStrike += dt;
    if (boltLife > 0) {
      boltLife -= dt;
      bolt.visible = true;
      bolt.material.opacity = clamp(boltLife / 0.16, 0, 1) * 0.9;
    } else {
      bolt.visible = false;
    }
    flash = Math.max(0, flash - dt * 4.5);
    state.flash = flash * flash;

    // --- what the air does to your view
    state.gloom = clamp(w.gloom ?? 0, 0, 1);
    const fogAmount = clamp(w.fog ?? 0, 0, 1);
    const base = ctx.baseFogColor || state.fogColor;
    state.fogColor.copy(base).lerp(shadowColor, state.gloom * 0.5).lerp(white, state.flash * 0.6);
    // clear air sees for miles; a blizzard sees a few dozen metres
    state.fogFar = lerp(7000, 90, Math.pow(fogAmount, 1.35));
    state.fogNear = lerp(300, 2, Math.pow(fogAmount, 1.6));
    return state;
  }

  return {
    state, decks, dust, bolt, wind, lineRain, pointSnow,
    // the rain and the snow the rest of the game (and the tests) look at: whichever is drawing
    get rain() { return precip?.streaks?.mesh || lineRain; },
    get snow() { return precip?.snow?.mesh || pointSnow; },
    get precip() { return precip; },
    update,
    /** R23: the Graphics setting changed — build or drop the GPU precipitation to match. */
    setGfx(next) {
      if (wantsPrecip(next) === !!precip && (!precip || next.rainDrops === gfx?.rainDrops)) { gfx = next; return; }
      precip?.dispose();
      gfx = next;
      precip = wantsPrecip(next) ? createPrecipitation(scene, next) : null;
      bolt.material.color.set(0xdfeaff).multiplyScalar(precip ? 6 : 1);
    },
    /** Hide the sky's weather — indoors there is none. */
    setVisible(on) {
      for (const d of decks) d.visible = !!on;
      for (const m of [lineRain, pointSnow, dust, bolt]) if (m) m.visible = !!on;
      if (!on) precip?.setVisible(false);
    },
    get fogColor() { return state.fogColor; },
    get fogFar() { return state.fogFar; },
    get fogNear() { return state.fogNear; },
    /** Force a strike (the debug menu). */
    strike,
    setPalette(next = {}) {
      if (next.cloud) cloudColor.set(next.cloud);
      if (next.cloudShadow) shadowColor.set(next.cloudShadow);
      if (next.fog) dust.material.color.set(next.fog);
    },
    dispose() {
      for (const d of decks) { skyScene.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.dispose(); d.tex.dispose(); }
      for (const m of [lineRain, pointSnow, dust]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
      skyScene.remove(bolt); boltGeom.dispose(); bolt.material.dispose();
      precip?.dispose();
    },
  };
}
