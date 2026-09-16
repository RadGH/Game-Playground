// Farhold — the sky over the planet, with the rest of the star system actually in it.
//
// The sky is its own scene, drawn first with a camera that shares the player camera's rotation but
// sits at the origin. That makes everything in it infinitely far away for free: no depth-precision
// fight between a 2 m rock and a planet, and nothing here can ever clip into the ground.
//
//   const sky = createSky({ star, system, planet, balance });
//   scene.add(sky.sunLight); scene.fog = sky.fog;
//   sky.update(elapsedSeconds);            // moves the sun, the siblings and the moons
//   renderer.render(sky.scene, sky.camera(mainCamera));
//   renderer.clearDepth();
//   renderer.render(scene, mainCamera);
//
// Where the planets go is real: each body's heliocentric angle comes from its orbital period, and
// the difference between its angle and ours decides where it sits relative to the star in the sky.
// An inner planet therefore hangs near the sun at dusk; a planet at opposition rides overhead at
// midnight. How BIG they are drawn is not real — see `siblingScale` below.

import * as THREE from 'three';
import { clamp } from '../../../worldgen/js/noise.js';
import { createPlanet, createStar } from '../../../assets/js/space-models.js';
import { cloudTexture } from '../../../universe/js/texture.js';
import { atmospherePalette } from '../../../worldgen/js/weather.js';

const DOME = 1000;                 // sky-scene radius; everything sits on this shell
const EARTH_RADII_PER_AU = 23455;  // 1 AU / Earth's radius — turns "radius in Earths" into AU

/** Rotate `v` around `axis` by `angle`, in place. */
function spin(v, axis, angle) { return v.applyAxisAngle(axis, angle); }

export function createSky({ star, system, planet, balance = {}, palette = {} } = {}) {
  const cfg = balance.sky || {};
  const dayLength = cfg.dayLengthSeconds ?? 900;
  const siblingScale = cfg.siblingScale ?? 160;
  const moonScale = cfg.moonScale ?? 1;
  // Orbits run on their own clock. At real speed a sibling with a 365-day year needs about 91 hours
  // of play to go round, so it looks welded to the sun — which is exactly what it looked like.
  const orbitScale = cfg.orbitScale ?? 150;
  const moonOrbitScale = cfg.moonOrbitScale ?? 6;

  const scene = new THREE.Scene();
  const skyCam = new THREE.PerspectiveCamera(60, 1, 0.1, DOME * 4);

  // The plane the whole system orbits in, tilted by the planet's axial tilt so the sun does not
  // simply rise due east on every world. `pole` is the horizontal axis the sky turns about, and
  // `base` is where the sun sits at angle 0 — straight up, i.e. noon. Getting that wrong is what
  // made every run start at midnight.
  const tilt = ((planet?.axialTilt ?? 20) * Math.PI) / 180;
  const pole = new THREE.Vector3(Math.sin(tilt), 0, Math.cos(tilt)).normalize();
  const base = new THREE.Vector3(0, 1, 0);
  // where in the day a new game begins: 0 midnight, 0.25 dawn, 0.5 noon
  const startFraction = cfg.startFraction ?? 0.34;

  // ------------------------------------------------------------------ the star
  const sunGroup = new THREE.Group();
  const sunModel = createStar(star, { radius: DOME * 0.022 * (cfg.starScale ?? 2.2) });
  sunGroup.add(sunModel.group);
  scene.add(sunGroup);

  // light for the sky scene itself, so the siblings show phases
  const skySun = new THREE.DirectionalLight(0xffffff, 2.4);
  scene.add(skySun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));

  // ------------------------------------------------------------------ starfield
  const starCount = 1400;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    starPos[i * 3] = Math.cos(a) * r * DOME * 2;
    starPos[i * 3 + 1] = u * DOME * 2;
    starPos[i * 3 + 2] = Math.sin(a) * r * DOME * 2;
  }
  const starGeom = new THREE.BufferGeometry();
  starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: DOME * 0.004, sizeAttenuation: true, transparent: true, opacity: 1 });
  const starField = new THREE.Points(starGeom, starMat);
  starField.frustumCulled = false;
  scene.add(starField);

  // ------------------------------------------------------------------ the neighbours
  /** Every body we draw in the sky: the other planets of this system, plus our own moons. */
  const bodies = [];
  const ourAu = planet?.orbit?.au ?? 1;
  const ourPeriod = planet?.orbit?.periodDays || 365;

  /**
   * A neighbour as it should look from here: its own weather on it. Every body gets its palette
   * from the same function this planet's sky uses, so a toxic world really does hang up there with
   * a sick yellow cloud deck, and a dead rock has none at all.
   */
  function skyBody(body, detail, textureSize) {
    const pal = atmospherePalette(body);
    const tinted = { ...body, atmosphere: { ...(body.atmosphere || {}), color: pal.cloud } };
    const clouds = cloudTexture(tinted, { size: textureSize });
    return createPlanet(tinted, { radius: 1, detail, textureSize, texture: clouds ? { clouds } : {} });
  }

  for (const p of system?.planets || []) {
    if (p.id === planet.id) continue;
    const model = skyBody(p, 20, 128);
    model.group.userData.body = p;
    scene.add(model.group);
    bodies.push({
      kind: 'planet', body: p, model,
      au: p.orbit?.au ?? 1,
      period: p.orbit?.periodDays || 365,
      phase: ((p.seed ?? p.id) % 360) * Math.PI / 180,
      radiusAu: (p.radius ?? 1) / EARTH_RADII_PER_AU,
      eccentricity: p.orbit?.eccentricity ?? 0,
    });
  }
  for (const m of planet?.moons || []) {
    const model = skyBody(m, 16, 96);
    model.group.userData.body = m;
    scene.add(model.group);
    bodies.push({
      kind: 'moon', body: m, model,
      au: ourAu,
      period: m.orbit?.periodDays || m.periodDays || 14,
      phase: ((m.seed ?? 1) % 360) * Math.PI / 180,
      radiusAu: (m.radius ?? 0.27) / EARTH_RADII_PER_AU,
      // a moon's orbit is measured in PARENT PLANET RADII, not AU — convert through the parent's
      // own size so it lands in the same units as radiusAu. These moons orbit close (5-10 planet
      // radii, against our own Moon's 60), so at an honest scale of 1 they are already enormous.
      distanceAu: ((m.orbit?.aroundPlanet ?? m.distance ?? 6) * (planet.radius ?? 1)) / EARTH_RADII_PER_AU,
    });
  }

  // ------------------------------------------------------------------ colours
  // the planet's own sky, varied per world by worldgen's palette (two lava worlds are not the
  // same lava world)
  const dayColor = new THREE.Color(palette.sky || planet?.skyColor || '#7fb0d8');
  const duskColor = new THREE.Color(palette.skyHorizon || '#d8783c');
  const nightColor = new THREE.Color('#050810');
  const skyColor = new THREE.Color();
  scene.background = skyColor;

  const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sunLight.name = 'farhold-sun';
  const ambient = new THREE.HemisphereLight(0xffffff, 0x2a3040, 0.55);
  const fog = new THREE.Fog(skyColor, 300, 7000);

  const sunDir = new THREE.Vector3(1, 0.4, 0);
  const tmp = new THREE.Vector3();
  const eclipse = { solar: 0, lunar: 0, kind: null, body: null };
  let elapsed = 0, dayFraction = 0;

  /** Where a body sits on the sky dome, given how far round its orbit it is compared with us. */
  function placeOnDome(out, deltaAngle, sunAngle) {
    out.copy(base);
    spin(out, pole, sunAngle + deltaAngle);
    return out;
  }

  /**
   * seconds: the run clock. env: { gloom 0..1 how much the weather is stealing the light,
   * flash 0..1 a lightning strike this frame }.
   */
  function update(seconds, env = {}) {
    elapsed = seconds;
    const gloom = Math.max(0, Math.min(1, env.gloom ?? 0));
    const flash = Math.max(0, Math.min(1, env.flash ?? 0));
    // Angle 0 is noon (the sun on `base`, straight up), shifted by where the day starts — and by
    // WHERE YOU ARE. The map is the planet's surface unrolled, so x is longitude: walk far enough
    // east and it is a different time of day. Without this the far side of the world kept the same
    // clock as the near side, which is what it was doing.
    const longitude = env.longitude ?? 0;
    const sunAngle = ((elapsed / dayLength) + (startFraction - 0.5) + longitude) * Math.PI * 2;
    dayFraction = (((sunAngle / (Math.PI * 2)) + 0.5) % 1 + 1) % 1;

    // the sun
    placeOnDome(sunDir, 0, sunAngle);
    sunGroup.position.copy(sunDir).multiplyScalar(DOME);
    skySun.position.copy(sunDir).multiplyScalar(DOME);
    sunLight.position.copy(sunDir).multiplyScalar(500);
    sunLight.target.position.set(0, 0, 0);

    const up = Math.max(-1, Math.min(1, sunDir.y));      // -1 midnight … 1 noon
    const day = Math.max(0, up);
    const dusk = Math.max(0, 1 - Math.abs(up) * 4);
    skyColor.copy(nightColor).lerp(dayColor, day).lerp(duskColor, dusk * 0.55);
    // heavy weather steals the light and washes the colour out of the sky
    if (gloom > 0) skyColor.lerp(new THREE.Color(0x6a7079), gloom * 0.6).multiplyScalar(1 - gloom * 0.25);
    if (flash > 0) skyColor.lerp(new THREE.Color(0xd8e4ff), flash * 0.7);
    sunLight.intensity = (0.15 + day * 2.1) * (1 - gloom * 0.7) + flash * 1.6;
    ambient.intensity = (0.16 + day * 0.5) * (1 - gloom * 0.35) + flash * 0.8;
    ambient.color.copy(skyColor).lerp(new THREE.Color(0xffffff), 0.35);
    fog.color.copy(skyColor);
    // cloud cover hides the stars as surely as daylight does
    starMat.opacity = Math.max(0, 1 - day * 3) * (1 - clamp(env.cloud ?? 0, 0, 1) * 0.95);

    // the neighbours
    const days = (elapsed / dayLength) * orbitScale;
    const moonDays = (elapsed / dayLength) * moonOrbitScale;
    const ourAngle = (days / ourPeriod) * Math.PI * 2;
    for (const b of bodies) {
      let delta, distanceAu, radiusAu, scale;
      if (b.kind === 'moon') {
        delta = b.phase + (moonDays / b.period) * Math.PI * 2;
        distanceAu = b.distanceAu;
        radiusAu = b.radiusAu;
        scale = moonScale;
      } else {
        const theirAngle = b.phase + (days / b.period) * Math.PI * 2;
        // where they are relative to us, on real ellipses: r = a(1 - e^2) / (1 + e cos θ)
        const te = b.eccentricity || 0;
        const theirR = b.au * (1 - te * te) / (1 + te * Math.cos(theirAngle));
        const oe = planet?.orbit?.eccentricity ?? 0;
        const ourR = ourAu * (1 - oe * oe) / (1 + oe * Math.cos(ourAngle));
        const dx = theirR * Math.cos(theirAngle) - ourR * Math.cos(ourAngle);
        const dy = theirR * Math.sin(theirAngle) - ourR * Math.sin(ourAngle);
        distanceAu = Math.max(0.01, Math.hypot(dx, dy));
        // angle between "toward the star" and "toward them", which is what the sky shows
        const toStar = Math.atan2(-ourR * Math.sin(ourAngle), -ourR * Math.cos(ourAngle));
        delta = Math.atan2(dy, dx) - toStar;
        radiusAu = b.radiusAu;
        scale = siblingScale;
      }
      const angular = (radiusAu / distanceAu) * scale;          // apparent radius, radians-ish
      const size = Math.max(DOME * 0.0015, Math.min(DOME * 0.26, DOME * angular));
      placeOnDome(tmp, delta, sunAngle);
      b.dir = (b.dir || new THREE.Vector3()).copy(tmp);
      b.model.group.position.copy(tmp).multiplyScalar(DOME * 0.985);
      b.model.group.scale.setScalar(size);
      b.model.group.lookAt(0, 0, 0);
      b.visibleSize = size;
      b.distanceAu = distanceAu;
      // a body low in a bright sky washes out, like a daytime moon — and cloud hides it outright
      // a moon in this world's shadow goes dark and coppery (`lunarShade` is set below)
      const washed = (Math.max(0, 1 - day * 1.6) * 0.75 + 0.25)
        * (1 - clamp(env.cloud ?? 0, 0, 1) * 0.92) * (1 - (b.lunarShade || 0) * 0.85);
      b.model.group.traverse(o => {
        if (!o.material) return;
        o.material.transparent = true;
        o.material.opacity = washed;
      });
      b.model.update?.(0, elapsed);
    }

    // ------------------------------------------------------------ eclipses
    // Everything needed is already here: the sun's direction, each body's direction, and how big
    // each is drawn. A solar eclipse is a body sitting on the sun; a lunar one is a moon sliding
    // into the shadow this world casts, which is the point of the sky directly opposite the sun.
    const rSun = 0.022 * (cfg.starScale ?? 2.2);
    let solar = 0, solarBody = null, lunar = 0, lunarBody = null;
    for (const b of bodies) {
      b.lunarShade = 0;
      if (!b.dir) continue;
      const sep = b.dir.angleTo(sunDir);
      const rBody = b.visibleSize / DOME;
      if (sep < rSun + rBody) {
        const cover = discOverlap(sep, rSun, rBody);
        if (cover > solar) { solar = cover; solarBody = b; }
      }
      if (b.kind === 'moon') {
        const opposite = Math.PI - sep;
        const shadow = rBody + 0.05;
        if (opposite < shadow) {
          const k = 1 - opposite / shadow;
          b.lunarShade = k;
          if (k > lunar) { lunar = k; lunarBody = b; }
        }
      }
    }
    eclipse.solar = solar;
    eclipse.lunar = lunar;
    eclipse.body = solarBody?.body?.name || lunarBody?.body?.name || null;
    eclipse.kind = solar > 0.02 ? 'solar' : lunar > 0.02 ? 'lunar' : null;

    if (solar > 0) {
      // the world genuinely goes dark, the stars come out, and the star grows a corona
      const dark = solar * 0.96;
      sunLight.intensity *= 1 - dark;
      ambient.intensity *= 1 - dark * 0.8;
      skyColor.lerp(nightColor, dark * 0.92);
      fog.color.copy(skyColor);
      starMat.opacity = Math.max(starMat.opacity, dark * 0.85);
      sunModel.group.scale.setScalar(1 + solar * 0.4);
    } else {
      sunModel.group.scale.setScalar(1);
    }
  }

  /** Roughly how much of a disc of radius `rA` is hidden by one of radius `rB`, `sep` apart. */
  function discOverlap(sep, rA, rB) {
    if (sep >= rA + rB) return 0;
    const full = Math.min(1, (rB / rA) ** 2);
    if (sep <= Math.abs(rA - rB)) return full;
    const band = (rA + rB - sep) / (2 * Math.min(rA, rB));
    return clamp(band, 0, 1) * full;
  }

  update(0);

  return {
    scene, sunLight, ambient, fog, sunDirection: sunDir, bodies, eclipse,
    /**
     * Line a moon up with the star so an eclipse happens now. There is no cheating in the drawing —
     * it moves the moon's phase, and the same maths that finds a natural eclipse then finds this one.
     */
    forceEclipse(kind = 'solar') {
      // the biggest thing in the sky makes the best eclipse; a distant planet only transits
      const moon = [...bodies].sort((a, b) => (b.visibleSize || 0) - (a.visibleSize || 0))[0];
      if (!moon) return null;
      const md = (elapsed / dayLength) * moonOrbitScale;
      const want = kind === 'lunar' ? Math.PI : 0;
      moon.phase = want - (md / moon.period) * Math.PI * 2;
      update(elapsed);
      return moon.body?.name || null;
    },
    /** The camera to draw the sky with: the player's view, rotated only. */
    camera(mainCamera) {
      skyCam.fov = mainCamera.fov;
      skyCam.aspect = mainCamera.aspect;
      skyCam.quaternion.copy(mainCamera.quaternion);
      skyCam.updateProjectionMatrix();
      return skyCam;
    },
    update,
    /** 0 = midnight, 0.25 = dawn, 0.5 = noon — for the clock in the HUD. */
    get dayFraction() { return dayFraction; },
    get isNight() { return sunDir.y < 0; },
    /** What is in the sky right now, for the HUD and the tests. */
    visible() {
      // DOME * 0.0044 is a full-moon-sized disc; half of that still reads clearly as a body
      return bodies
        .filter(b => b.visibleSize > DOME * 0.002)
        .map(b => ({ name: b.body.name, kind: b.kind, size: b.visibleSize, distanceAu: b.distanceAu }))
        .sort((a, b) => b.size - a.size);
    },
    dispose() {
      for (const b of bodies) b.model.dispose?.();
      sunModel.dispose?.();
      starGeom.dispose(); starMat.dispose();
    },
  };
}
