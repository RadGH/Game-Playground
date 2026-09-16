// Farhold — what the weather looks like.
//
// `worldgen/js/weather.js` decides WHAT the weather is (and is pure data, shared with World Forge).
// This file draws it: cloud decks in the sky scene, rain, snow and blown dust around the camera,
// lightning that actually lights the ground, and the fog and gloom that a heavy sky brings with it.
//
//   const view = createWeatherView({ scene, skyScene, palette, seed });
//   view.update(dt, clock.blend(), { camera, sunDir, daylight });
//   scene.fog.color.copy(view.fogColor); scene.fog.far = view.fogFar;
//
// Clouds live in the sky scene (the one drawn with a camera at the origin), so they sit between you
// and the planets overhead and never clip into a mountain. Precipitation lives in the world scene
// and is recycled in a box that follows the camera — a few thousand particles are enough when they
// only ever exist within 40 m of your face.

import * as THREE from 'three';
import { makeNoise2D, subSeed, clamp, lerp } from '../../../worldgen/js/noise.js';

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
 * opts: { scene (world), skyScene, palette (from worldgen weather.js atmospherePalette), seed,
 *         quality ('low' halves every particle budget) }
 */
export function createWeatherView({ scene, skyScene, palette = {}, seed = 1, quality = 'high' } = {}) {
  const low = quality === 'low';
  const cloudColor = new THREE.Color(palette.cloud || '#dfe6ee');
  const shadowColor = new THREE.Color(palette.cloudShadow || '#8d97a3');

  // ---------------------------------------------------------------- cloud decks
  const decks = [];
  for (const [i, spec] of [[0, { radius: 640, repeat: 3, speed: 0.004, sharp: 1.5 }], [1, { radius: 720, repeat: 2, speed: 0.0022, sharp: 2.2 }]]) {
    const tex = new THREE.CanvasTexture(cloudCanvas(seed + i * 977, low ? 128 : 256, spec.sharp));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(spec.repeat, spec.repeat);
    const mesh = new THREE.Mesh(
      // an upper dome only: clouds belong above the horizon, not wrapped around your ankles
      new THREE.SphereGeometry(spec.radius, low ? 20 : 36, low ? 10 : 18, 0, Math.PI * 2, 0, Math.PI * 0.54),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, side: THREE.BackSide }),
    );
    mesh.renderOrder = 5 + i;
    mesh.frustumCulled = false;
    mesh.name = 'farhold-clouds-' + i;
    skyScene.add(mesh);
    decks.push({ mesh, tex, speed: spec.speed });
  }

  // ---------------------------------------------------------------- precipitation
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
  const rain = new THREE.LineSegments(rainGeom, new THREE.LineBasicMaterial({ color: 0xa8c4dd, transparent: true, opacity: 0 }));
  rain.frustumCulled = false;
  rain.visible = false;
  rain.name = 'farhold-rain';
  scene.add(rain);

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
  const flakeGeom = new THREE.BufferGeometry();
  flakeGeom.setAttribute('position', new THREE.BufferAttribute(flakePos, 3));
  const snow = new THREE.Points(flakeGeom, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0, sizeAttenuation: true }));
  snow.frustumCulled = false;
  snow.visible = false;
  snow.name = 'farhold-snow';
  scene.add(snow);

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
    color: new THREE.Color(palette.fog || '#c8a878'), size: 0.3, transparent: true, opacity: 0, sizeAttenuation: true,
  }));
  dust.frustumCulled = false;
  dust.visible = false;
  dust.name = 'farhold-dust';
  scene.add(dust);

  // ---------------------------------------------------------------- lightning
  const boltGeom = new THREE.BufferGeometry();
  boltGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 2 * 3), 3));
  const bolt = new THREE.LineSegments(boltGeom, new THREE.LineBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0 }));
  bolt.frustumCulled = false;
  bolt.visible = false;
  bolt.renderOrder = 9;
  skyScene.add(bolt);

  let nextStrike = 4 + Math.random() * 8;
  let flash = 0;
  let boltLife = 0;

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
  };

  const tmp = new THREE.Vector3();

  /**
   * dt in seconds, `w` is the blended weather from WeatherClock.blend(),
   * ctx: { camera, sunDir, daylight (0..1), baseFogColor }
   */
  function update(dt, w = {}, ctx = {}) {
    const camera = ctx.camera;
    const daylight = ctx.daylight ?? 1;
    const cloud = clamp(w.cloud ?? 0, 0, 1);
    const wind = clamp(w.wind ?? 0, 0, 1);

    // --- cloud decks: thicker cover means more opaque and darker, and they scroll with the wind
    for (const [i, deck] of decks.entries()) {
      const opacity = clamp(cloud * (i === 0 ? 0.95 : 0.6), 0, 1);
      deck.mesh.material.opacity = opacity;
      deck.mesh.visible = opacity > 0.01;
      deck.tex.offset.x += deck.speed * (0.3 + wind * 2.6) * dt * 60 * 0.016;
      deck.tex.offset.y += deck.speed * 0.28 * dt * 60 * 0.016;
      // lit from above by day, and darker underneath the heavier the deck
      const lit = 0.35 + daylight * 0.65;
      deck.mesh.material.color.copy(cloudColor).lerp(shadowColor, cloud * 0.55).multiplyScalar(lit);
    }

    // --- precipitation, recycled in a box that follows the camera
    const rainAmount = clamp(w.rain ?? 0, 0, 1);
    rain.visible = rainAmount > 0.01;
    rain.material.opacity = rainAmount * 0.55;
    if (rain.visible && camera) {
      const pos = rainGeom.attributes.position.array;
      const slant = wind * 10;
      for (let i = 0; i < rainCount; i++) {
        const fall = rainVel[i] * dt * (0.5 + rainAmount);
        for (const k of [0, 1]) {
          pos[i * 6 + k * 3 + 1] -= fall;
          pos[i * 6 + k * 3] += slant * dt;
        }
        if (pos[i * 6 + 1] < 0) {
          const x = (Math.random() - 0.5) * BOX, z = (Math.random() - 0.5) * BOX;
          pos[i * 6] = x; pos[i * 6 + 1] = BOX; pos[i * 6 + 2] = z;
          pos[i * 6 + 3] = x + slant * 0.03; pos[i * 6 + 4] = BOX - 0.75; pos[i * 6 + 5] = z;
        }
      }
      rainGeom.attributes.position.needsUpdate = true;
      rain.position.set(camera.position.x, camera.position.y - BOX / 2, camera.position.z);
    }

    const snowAmount = clamp(w.snow ?? 0, 0, 1);
    snow.visible = snowAmount > 0.01;
    snow.material.opacity = snowAmount * 0.9;
    if (snow.visible && camera) {
      const pos = flakeGeom.attributes.position.array;
      for (let i = 0; i < flakeCount; i++) {
        pos[i * 3 + 1] -= (1.1 + snowAmount * 2.4) * dt;
        pos[i * 3] += flakeDrift[i * 2] * (0.4 + wind * 5) * dt;
        pos[i * 3 + 2] += flakeDrift[i * 2 + 1] * (0.4 + wind * 5) * dt;
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3] = (Math.random() - 0.5) * BOX;
          pos[i * 3 + 1] = BOX;
          pos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
        }
      }
      flakeGeom.attributes.position.needsUpdate = true;
      snow.position.set(camera.position.x, camera.position.y - BOX / 2, camera.position.z);
    }

    const dustAmount = clamp(w.dust ?? 0, 0, 1);
    dust.visible = dustAmount > 0.01;
    dust.material.opacity = dustAmount * 0.5;
    if (dust.visible && camera) {
      const pos = dustGeom.attributes.position.array;
      for (let i = 0; i < dustCount; i++) {
        pos[i * 3] += (7 + wind * 26) * dt;
        pos[i * 3 + 1] -= 0.4 * dt;
        if (pos[i * 3] > BOX / 2 || pos[i * 3 + 1] < 0) {
          pos[i * 3] = -BOX / 2;
          pos[i * 3 + 1] = Math.random() * BOX * 0.6;
          pos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
        }
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
    state.fogColor.copy(base).lerp(shadowColor, state.gloom * 0.5).lerp(new THREE.Color(0xffffff), state.flash * 0.6);
    // clear air sees for miles; a blizzard sees a few dozen metres
    state.fogFar = lerp(7000, 90, Math.pow(fogAmount, 1.35));
    state.fogNear = lerp(300, 2, Math.pow(fogAmount, 1.6));
    return state;
  }

  return {
    state, decks, rain, snow, dust, bolt,
    update,
    /** Hide the sky's weather — indoors there is none. */
    setVisible(on) {
      for (const d of decks) d.visible = !!on;
      for (const m of [rain, snow, dust, bolt]) if (m) m.visible = !!on;
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
      for (const m of [rain, snow, dust]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
      skyScene.remove(bolt); boltGeom.dispose(); bolt.material.dispose();
    },
  };
}
