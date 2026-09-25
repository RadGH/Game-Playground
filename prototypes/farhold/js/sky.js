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
import { SKY_LOOKS } from './sky-looks.js';
export { SKY_LOOKS } from './sky-looks.js';
import { clamp } from '../../../worldgen/js/noise.js';
import { createPlanet, createStar } from '../../../assets/js/space-models.js';
import { cloudTexture } from '../../../universe/js/texture.js';
import { atmospherePalette } from '../../../worldgen/js/weather.js';
import { skyState, paletteShift, hex } from './sky-palette.js';

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
  // ...but ONE multiplier for every body is why some of them whip across the sky. A close-in planet
  // or a short-period moon has a much faster clock than a distant one, and multiplying them all by
  // 150 makes the fast ones absurd. So each body gets its own scale, cut back until its apparent
  // motion is no more than `maxDegPerSecond` of sky — fast enough to watch, slow enough to believe.
  //
  // **Measured against the sun, not picked out of the air.** The cap was a flat 1.2°/s, and the sun
  // itself only crosses the sky at 360° per day — 0.4°/s on a 900-second day. So a moon was allowed
  // to move three times faster than the sun, which is exactly the *"planets and moons orbit at
  // crazy speeds — pretty much all moons"* report: it read as a moon on a string rather than a moon
  // in an orbit. The default is now a little over half the sun's own rate, so nothing in the sky
  // ever outruns the thing the day is named after, and a moon still crosses in about a quarter of
  // an hour. `maxSkyDegPerSecond` in `balance.json` overrides it if a world wants a busier sky.
  const sunDegPerSecond = 360 / Math.max(1, dayLength);
  const maxRate = ((cfg.maxSkyDegPerSecond ?? sunDegPerSecond * 0.6) * Math.PI) / 180;
  /** The scale this body may use, given how fast it would otherwise appear to move. */
  function clockFor(periodDays, ourPeriodDays, wanted) {
    // radians of sky per real second at the full scale: the SYNODIC rate, not the orbital one —
    // what you see is how fast it pulls away from us, and a twin of our own orbit barely moves
    const relative = Math.abs(1 / Math.max(0.01, periodDays) - (ourPeriodDays ? 1 / ourPeriodDays : 0));
    const rate = Math.PI * 2 * (wanted / dayLength) * relative;
    return rate > maxRate ? wanted * (maxRate / rate) : wanted;
  }

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
  // the loose stars stay transparent (they need to fade at dawn), but they DEPTH TEST, so a planet
  // in front of one hides it
  const starMat = new THREE.PointsMaterial({
    // R23: smaller — on the HDR frame the bloom gives every star its own halo, and at the old size
    // they read as snowflakes
    color: 0xdfe8ff, size: DOME * 0.0026, sizeAttenuation: true,
    transparent: true, opacity: 1, depthWrite: false, depthTest: true,
  });
  const starField = new THREE.Points(starGeom, starMat);
  starField.frustumCulled = false;
  starField.renderOrder = -1900;
  scene.add(starField);

  // ------------------------------------------------------------------ the galaxy behind everything
  //
  // Before round 4 the sky's backdrop was `scene.background = skyColor` — one flat colour. That is
  // what made the sky read as a wall *behind* the planets: a disc of rock pasted onto a blue sheet.
  // Now the backdrop is a real sky sphere carrying this system's own galaxy, drawn further out than
  // any body and with depth writing off, so every planet and moon is genuinely in front of it.
  // NOTE: `transparent: false`. Three renders the whole OPAQUE list before the whole TRANSPARENT
  // list, and `renderOrder` only sorts within a list — so a transparent backdrop draws *after* every
  // opaque planet, and with depth testing off it painted its stars straight over them. Opaque, with
  // depth writing off and renderOrder -2000, it draws first and everything else covers it.
  // It is faded by darkening the colour rather than by opacity, for the same reason.
  const galaxy = new THREE.Mesh(
    new THREE.SphereGeometry(DOME * 2.4, 32, 20),
    new THREE.MeshBasicMaterial({
      map: galaxyTexture(star, planet),
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      transparent: false, fog: false,
    }),
  );
  galaxy.frustumCulled = false;
  galaxy.renderOrder = -2000;
  // tilt the band so the galactic plane is not lying flat along the horizon
  galaxy.rotation.set(0.55 + (planet?.orbit?.au ?? 1) * 0.1, (star?.seed ?? 1) * 0.7, 0.22);
  scene.add(galaxy);

  // ------------------------------------------------------------------ the atmosphere, IN FRONT
  //
  // Air is between you and the sky, not behind it. This shell sits INSIDE every body's shell
  // (bodies live at 0.60-0.98 of the dome), so it veils them the way real air does: a planet low on
  // the horizon goes pale and soft, and in daylight the sky washes the lot out instead of leaving
  // crisp discs stuck on a blue sheet.
  const airGeom = new THREE.SphereGeometry(DOME * 0.45, 48, 24);
  {
    // densest at the horizon, thinnest straight up — the same reason a sunset is red
    const pos = airGeom.attributes.position;
    const dens = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / (DOME * 0.45);
      dens[i] = Math.pow(1 - Math.min(1, Math.abs(y)), 1.6);
    }
    airGeom.setAttribute('density', new THREE.BufferAttribute(dens, 1));
  }
  /**
   * R23 — THE SKY IS NINE COLOURS, NOT ONE.
   *
   * The shell used to be a single colour with a paler horizon, so a sunset was one flat orange wash
   * that went straight to black. The colours now come from js/sky-palette.js — five bands up the
   * side of the sky facing the sun (deep blue, violet, rose, orange, gold at the horizon) and four on
   * the side away from it (the planet's own shadow and the pink band above it) — and this shader
   * blends them by where you are looking. `SKY_U` is shared by the two meshes that draw it:
   *
   *   backdrop — behind every body, in front of the galaxy. Opaque by day; at night it thins so the
   *              stars and the galaxy come through with a blue moonlit wash over them. It carries
   *              the sun's bright core, so a planet or moon in front of the sun really covers it.
   *   air      — the old veil in FRONT of the bodies, same colours, alpha thickest at the horizon.
   *              A planet low in the sky goes pale into the same sunset the backdrop is showing.
   *
   * The sun's core is HIGH DYNAMIC RANGE (well above 1) when the post-processing chain is on, so the
   * bloom and the light shafts have something to work with; without the chain it stays at zero and
   * the star model is what you see, as before.
   */
  const SKY_U = {
    uZenith: { value: new THREE.Color() }, uUpper: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
    uLow: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uAUpper: { value: new THREE.Color() }, uAMid: { value: new THREE.Color() }, uALow: { value: new THREE.Color() },
    uAHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlowAmt: { value: 1 }, uDisc: { value: 0 }, uBackdrop: { value: 1 },
  };
  const SKY_PARS = /* glsl */`
    uniform vec3 uZenith, uUpper, uMid, uLow, uHorizon, uAUpper, uAMid, uALow, uAHorizon, uGlow, uSunCol;
    uniform vec3 uSunDir;
    uniform float uGlowAmt, uDisc;
    varying vec3 vDir;
    vec3 skyBands( vec3 d ) {
      float e = max( d.y, 0.0 );
      vec3 s = mix( uHorizon, uLow, smoothstep( 0.0, 0.07, e ) );
      s = mix( s, uMid, smoothstep( 0.05, 0.24, e ) );
      s = mix( s, uUpper, smoothstep( 0.2, 0.52, e ) );
      s = mix( s, uZenith, smoothstep( 0.46, 1.0, e ) );
      vec3 a = mix( uAHorizon, uALow, smoothstep( 0.0, 0.09, e ) );
      a = mix( a, uAMid, smoothstep( 0.07, 0.27, e ) );
      a = mix( a, uAUpper, smoothstep( 0.22, 0.56, e ) );
      a = mix( a, uZenith, smoothstep( 0.46, 1.0, e ) );
      vec2 dh = d.xz / max( length( d.xz ), 1e-4 );
      vec2 sh = uSunDir.xz / max( length( uSunDir.xz ), 1e-4 );
      float side = smoothstep( 0.0, 1.0, dot( dh, sh ) * 0.5 + 0.5 );
      vec3 c = mix( a, s, side );
      // under the horizon the haze darkens toward the ground (seen from the air, or over the sea)
      c *= mix( 1.0, 0.55, smoothstep( 0.0, -0.3, d.y ) );
      float cs = max( dot( d, uSunDir ), 0.0 );
      c += uGlow * ( pow( cs, 8.0 ) * 0.5 + pow( cs, 64.0 ) * 1.1 ) * uGlowAmt;
      c += uSunCol * smoothstep( 0.99965, 0.99988, cs ) * uDisc;
      return c;
    }`;
  const SKY_VERT = /* glsl */`
    attribute float density;
    varying float vD;
    varying vec3 vDir;
    void main() {
      vD = density;
      vDir = normalize( position );
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`;
  const airMat = new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, uStrength: { value: 0 } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_PARS + /* glsl */`
      uniform float uStrength;
      varying float vD;
      void main() {
        vec3 d = normalize( vDir );
        vec3 c = skyBands( d );
        float a = clamp( uStrength * ( 0.28 + vD * 0.72 ), 0.0, 0.97 );
        // the sun's own disc is in front of the air, not behind it: at the horizon the veil is
        // nearly opaque, and without this a setting sun faded to a dim ring
        float disc = smoothstep( 0.99965, 0.99988, max( dot( d, uSunDir ), 0.0 ) ) * step( 0.001, uDisc );
        gl_FragColor = vec4( c, max( a, disc ) );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false,
  });
  const air = new THREE.Mesh(airGeom, airMat);
  air.frustumCulled = false;
  air.renderOrder = 2000;              // drawn last, so it is genuinely over the bodies
  scene.add(air);

  const backdropGeom = new THREE.SphereGeometry(DOME * 2.2, 48, 24);
  backdropGeom.setAttribute('density', new THREE.BufferAttribute(new Float32Array(backdropGeom.attributes.position.count), 1));
  const backdropMat = new THREE.ShaderMaterial({
    uniforms: SKY_U,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_PARS + /* glsl */`
      uniform float uBackdrop;
      varying float vD;
      void main() {
        gl_FragColor = vec4( skyBands( normalize( vDir ) ), uBackdrop );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    // NOT transparent — see the galaxy's note: a transparent backdrop would draw after every opaque
    // body. Opaque with its own blend function, it sorts with the galaxy and still blends over it.
    transparent: false, blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const backdrop = new THREE.Mesh(backdropGeom, backdropMat);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1990;
  backdrop.name = 'farhold-sky-backdrop';
  scene.add(backdrop);

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
      clock: clockFor(p.orbit?.periodDays || 365, ourPeriod, orbitScale),
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
      // a moon goes round us, so its apparent rate is its own — nothing to subtract
      clock: clockFor(m.orbit?.periodDays || m.periodDays || 14, 0, moonOrbitScale),
    });
  }

  // ------------------------------------------------------------------ colours
  // the planet's own sky, varied per world by worldgen's palette (two lava worlds are not the
  // same lava world)
  // the planet's own sky, varied per world by worldgen's palette (two lava worlds are not the
  // same lava world). R23: the palette now TURNS the whole sky table round the colour wheel
  // (js/sky-palette.js), so this world's sunsets are its own and not an Earth sunset pasted on.
  const skyPalette = { ...palette, sky: palette.sky || planet?.skyColor || '#7fb0d8' };
  const shift = paletteShift(skyPalette);
  const cloudGrey = hex(palette.cloudShadow || '#6a7079');
  const nightColor = new THREE.Color('#050810');
  const skyColor = new THREE.Color();
  /** The last table reading — js/postfx.js grades the picture from it, js/weather.js lights clouds. */
  let skyNow = null;
  const setBand = (u, c) => u.value.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  let hdr = false;
  // NOT scene.background any more: the backdrop is the galaxy sphere, and this colour is the air in
  // front of the bodies instead. `scene.background` would have painted over the stars.
  scene.background = null;

  const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sunLight.name = 'farhold-sun';
  const ambient = new THREE.HemisphereLight(0xffffff, 0x2a3040, 0.55);
  const fog = new THREE.Fog(skyColor, 300, 7000);

  const sunDir = new THREE.Vector3(1, 0.4, 0);
  const tmp = new THREE.Vector3();
  const eclipse = { solar: 0, lunar: 0, kind: null, body: null };
  // seconds of run time before an eclipse is allowed to start (two in-game hours by default)
  let grace = 0;   // the run-time moment eclipses are allowed from; see `setEclipseGrace`
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
    const space = clamp(env.space ?? 0, 0, 1);
    const st = skyState(up, skyPalette, { gloom, flash, space, cloud: env.cloud ?? 0, shift, cloudGrey });
    skyNow = st;
    // the air's colour, for the fog and the old readers: the horizon, halfway round
    skyColor.setRGB(st.fog[0], st.fog[1], st.fog[2], THREE.SRGBColorSpace);
    /**
     * R23 — AT NIGHT THE LIGHT IS THE MOON'S.
     *
     * With the sun under the ground the directional light shone UP through it, which lit the
     * undersides of everything and left every top face black — the "flat black night". Below the
     * horizon it swings to the antisolar point, which is where a full moon would be, and takes the
     * table's cool blue moonlight. The swap happens in the few minutes of twilight when the table's
     * light is nearly nothing, so there is no visible jump.
     */
    const moonlit = up < -0.02;
    const lightDir = moonlit ? tmp.copy(sunDir).negate() : tmp.copy(sunDir);
    sunLight.position.copy(lightDir).multiplyScalar(500);
    sunLight.color.setRGB(st.sun[0], st.sun[1], st.sun[2], THREE.SRGBColorSpace);
    sunLight.intensity = st.sunI + flash * 1.6;
    ambient.intensity = st.ambI;
    ambient.color.setRGB(st.hemiSky[0], st.hemiSky[1], st.hemiSky[2], THREE.SRGBColorSpace);
    ambient.groundColor.setRGB(st.hemiGround[0], st.hemiGround[1], st.hemiGround[2], THREE.SRGBColorSpace);
    fog.color.copy(skyColor);
    // cloud cover hides the stars as surely as daylight does — and the galaxy with them
    const starVisible = st.stars;
    starMat.opacity = starVisible;
    // darken rather than fade — see the note where the galaxy is built
    galaxy.material.color.setScalar(starVisible);
    galaxy.visible = starVisible > 0.01;
    // the bands, into the shared sky uniforms
    for (const [u, k] of [['uZenith', 'zenith'], ['uUpper', 'upper'], ['uMid', 'mid'], ['uLow', 'low'], ['uHorizon', 'horizon'],
      ['uAUpper', 'aUpper'], ['uAMid', 'aMid'], ['uALow', 'aLow'], ['uAHorizon', 'aHorizon'], ['uGlow', 'glow'], ['uSunCol', 'sun']]) setBand(SKY_U[u], st[k]);
    SKY_U.uSunDir.value.copy(sunDir);
    const cover = clamp(env.cloud ?? 0, 0, 1);
    // the halo round the sun: strong in a clear sky, a smudge through cloud, gone below the horizon
    SKY_U.uGlowAmt.value = (1 - cover * 0.6) * (1 - gloom * 0.5) * clamp(up * 6 + 0.6, 0, 1);
    // HDR: a core far brighter than white for the bloom and the shafts; without it, just white
    SKY_U.uDisc.value = (hdr ? 18 : 0.9) * (1 - cover * 0.85) * (1 - gloom * 0.8) * clamp(up * 12 + 0.5, 0, 1);
    // by day the backdrop is the sky; by night it thins to a blue wash over the stars
    SKY_U.uBackdrop.value = clamp(1 - starVisible * 0.62 - space * 0.4, 0, 1);
    // the air in front: thick in daylight, thin but never gone at night, thicker in bad weather
    airMat.uniforms.uStrength.value = Math.min(0.97,
      0.045 + day * 0.90 + cover * 0.08 + (gloom || 0) * 0.12) * (1 - space * 0.85);

    // the neighbours
    for (const b of bodies) {
      // each body runs on its own clock (see clockFor), and OUR angle is read on that same clock,
      // so the pair stays consistent even though two bodies no longer share one
      const days = (elapsed / dayLength) * b.clock;
      const ourAngle = (days / ourPeriod) * Math.PI * 2;
      let delta, distanceAu, radiusAu, scale;
      if (b.kind === 'moon') {
        delta = b.phase + (days / b.period) * Math.PI * 2;
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
      b.visibleSize = size;
      b.distanceAu = distanceAu;
      b.apparent = tmp.clone();
      // a body low in a bright sky washes out, like a daytime moon — and cloud hides it outright
      // a moon in this world's shadow goes dark and coppery (`lunarShade` is set below)
      const washed = (Math.max(0, 1 - day * 1.6) * 0.75 + 0.25)
        * (1 - clamp(env.cloud ?? 0, 0, 1) * 0.92) * (1 - (b.lunarShade || 0) * 0.85);
      b.washed = washed;
      b.model.update?.(0, elapsed);
    }

    // ------------------------------------------------------------ who is in front of whom
    //
    // Every body used to sit on the same shell, so two of them in the same patch of sky cut
    // straight through each other. They are all at different real distances, so put them on the
    // dome in that order — nearest closest to the eye — and scale each by the shell it lands on so
    // the apparent size is unchanged. Then the depth buffer does the occluding for free, which is
    // why these materials write depth instead of being blended like ordinary transparent things.
    const order = [...bodies].sort((a, b) => a.distanceAu - b.distanceAu);
    for (let i = 0; i < order.length; i++) {
      const b = order[i];
      const shell = DOME * (0.60 + 0.38 * (order.length === 1 ? 1 : i / (order.length - 1)));
      const k = shell / (DOME * 0.985);
      b.model.group.position.copy(b.apparent).multiplyScalar(shell);
      b.model.group.scale.setScalar(b.visibleSize * k);
      b.model.group.lookAt(0, 0, 0);
      b.shell = shell;
      b.model.group.traverse(o => {
        if (!o.material) return;
        const fade = b.washed ?? 1;
        o.material.transparent = fade < 0.999;
        o.material.opacity = fade;
        o.material.depthWrite = true;
        o.material.depthTest = true;
        // nearest first, so the depth buffer is already written when the far ones draw.
        // renderOrder lives on the object, not the group, so it has to be set here.
        o.renderOrder = -1000 + i;
      });
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
    /**
     * NOT IN THE FIRST TWO HOURS.
     *
     * A solar eclipse is a good effect and it was landing at the worst possible moment: on some seeds
     * the run opens at 08:16 with "A solar eclipse begins" and the world murky grey-green for the
     * whole first minute — a player's first impression of a sunlit world, dim, with no way to know it
     * is temporary. The eclipse still happens; it just does not happen while you are getting your
     * bearings. `grace` is in seconds of run time and is set once, at landing.
     */
    if (elapsed < grace) { solar = 0; lunar = 0; solarBody = null; lunarBody = null; }
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
      for (const k of ['uZenith', 'uUpper', 'uMid', 'uLow', 'uHorizon', 'uAUpper', 'uAMid', 'uALow', 'uAHorizon', 'uGlow']) SKY_U[k].value.lerp(nightColor, dark * 0.9);
      SKY_U.uDisc.value *= 1 - solar;
      SKY_U.uBackdrop.value = Math.min(SKY_U.uBackdrop.value, 1 - dark * 0.6);
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
    /** R23: the sky table's reading this frame (js/sky-palette.js `skyState`). */
    get state() { return skyNow; },
    /** R23: the sun's bright core is drawn only when the picture is HDR (js/postfx.js is on). */
    setHdr(on) { hdr = !!on; },
    get backdrop() { return backdrop; },
    get air() { return air; },
    /**
     * No eclipse until this moment of run time.
     *
     * The clock starts at whatever time of day the run begins at — which can already be past any
     * relative window — so the caller passes the absolute moment rather than a duration.
     */
    holdEclipsesUntil(runTime) { grace = Math.max(0, Number(runTime) || 0); },
    /**
     * Line a moon up with the star so an eclipse happens now. There is no cheating in the drawing —
     * it moves the moon's phase, and the same maths that finds a natural eclipse then finds this one.
     */
    forceEclipse(kind = 'solar') {
      // the biggest thing in the sky makes the best eclipse; a distant planet only transits
      const moon = [...bodies].sort((a, b) => (b.visibleSize || 0) - (a.visibleSize || 0))[0];
      if (!moon) return null;
      const md = (elapsed / dayLength) * moon.clock;   // its own clock, the same one update() uses
      const want = kind === 'lunar' ? Math.PI : 0;
      moon.phase = want - (md / moon.period) * Math.PI * 2;
      /**
       * Forcing one lifts the hold.
       *
       * `grace` suppresses an eclipse during the first two hours of a run so a player's first
       * impression of a sunlit world is not a dim one — but `forceEclipse` means "make one happen
       * NOW", and it is called by the debug menu and by the tests, both of which run in the first
       * two hours by definition. The hold was silently eating them, so this asked for an eclipse and
       * got clear daylight back.
       */
      grace = 0;
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
        // `moon` and `parentName` so the HUD can say "its moon" rather than "Shaukraen Anchor IV a"
        .map(b => ({
          name: b.body.name, kind: b.kind, size: b.visibleSize, distanceAu: b.distanceAu,
          moon: b.kind === 'moon', parentName: b.body.parentName || null,
        }))
        .sort((a, b) => b.size - a.size);
    },
    dispose() {
      for (const b of bodies) b.model.dispose?.();
      sunModel.dispose?.();
      starGeom.dispose(); starMat.dispose();
    },
  };
}

/**
 * The galaxy this system sits in, drawn once into a canvas and used as the sky sphere's texture.
 *
 * Procedural on purpose — no download, no licence, and it varies with the star, so two systems do
 * not share a sky. Three passes: a dark base, a soft band of dust across the middle (the galactic
 * plane, built from overlapping radial blobs), and a few thousand stars whose brightness follows a
 * power law so most are faint and a handful are worth looking at.
 */
export function galaxyTexture(star = {}, planet = {}, { width = 2048, height = 1024 } = {}) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');

  // a deterministic little generator, so the same system always has the same sky
  let seed = ((star?.seed ?? 1) * 2654435761 ^ (planet?.id ? String(planet.id).length * 97 : 7)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  /**
   * A HANDFUL OF DIFFERENT SKIES, and each star picks one and then tints it.
   *
   * "The skybox with the purple haze and stars is very cool. Can we have several variations of this
   * skybox used by different stars? Can each one customize the colors of the skybox so that stars
   * all feel more unique and different?"
   *
   * It was already seeded by the star, so no two systems shared a sky — but every one of them was
   * the same *kind* of sky: one dusty band in blue and violet. These are six genuinely different
   * looks, chosen by the star's own seed and then recoloured within the look's own range, so a
   * system reads as somewhere rather than as another roll of the same dice.
   */
  const look = SKY_LOOKS[Math.floor(rnd() * SKY_LOOKS.length)] || SKY_LOOKS[0];
  ctx.fillStyle = look.base;
  ctx.fillRect(0, 0, width, height);

  // the band: blobs strung along a sine so the plane is not a ruler-straight stripe
  const hueA = look.hueA[0] + rnd() * (look.hueA[1] - look.hueA[0]);
  const hueB = look.hueB[0] + rnd() * (look.hueB[1] - look.hueB[0]);
  ctx.globalCompositeOperation = 'lighter';
  const blobs = Math.round(420 * look.dust);
  for (let i = 0; i < blobs; i++) {
    const t = i / blobs;
    const x = t * width;
    const y = height * 0.5 + Math.sin(t * Math.PI * 2 + rnd() * 0.4) * height * 0.06 + (rnd() - 0.5) * height * 0.16;
    const r = height * (0.04 + rnd() * 0.12) * look.spread;
    const hue = rnd() < 0.6 ? hueA : hueB;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `hsla(${hue}, ${look.sat}%, ${28 + rnd() * 22}%, ${(0.05 + rnd() * 0.07) * look.glow})`);
    g.addColorStop(1, 'hsla(0,0%,0%,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // dust lanes: darker streaks along the same line, so the band has structure rather than a smear
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 90; i++) {
    const t = rnd();
    const x = t * width;
    const y = height * 0.5 + Math.sin(t * Math.PI * 2) * height * 0.06 + (rnd() - 0.5) * height * 0.08;
    const w = width * (0.02 + rnd() * 0.05), h = height * (0.004 + rnd() * 0.012);
    ctx.fillStyle = `rgba(4,5,11,${0.25 + rnd() * 0.4})`;
    ctx.beginPath(); ctx.ellipse(x, y, w, h, (rnd() - 0.5) * 0.3, 0, Math.PI * 2); ctx.fill();
  }

  // the stars: dense near the band, thinner away from it, and mostly faint
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7000; i++) {
    const x = rnd() * width;
    // pull two thirds of them towards the plane
    const near = rnd() < 0.62;
    const y = near
      ? height * 0.5 + (rnd() - 0.5) * height * 0.26 + Math.sin((x / width) * Math.PI * 2) * height * 0.06
      : rnd() * height;
    const bright = Math.pow(rnd(), 3.2);          // most faint, a few bright
    const r = 0.45 + bright * 1.7;
    const warm = rnd();
    const col = warm < 0.12 ? [255, 190, 150] : warm < 0.22 ? [255, 230, 190] : warm < 0.34 ? [190, 210, 255] : [225, 235, 255];
    ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.25 + bright * 0.75})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    // a soft halo on the few brightest. Kept small: the texture is stretched over a whole sphere,
    // so a halo that looks tidy in the canvas becomes a saucer in the sky.
    if (bright > 0.88) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.22)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
