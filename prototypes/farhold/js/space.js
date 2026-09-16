// Farhold — leaving the planet.
//
// Space is its own scene, in its own units. The ground is metres over a 163 km map; a star system is
// hundreds of millions of kilometres. Nothing sensible survives both in one coordinate space, so
// this module keeps a compressed "space unit" world — 1 AU is `auUnits` across, an Earth-sized
// planet is `earthUnits` in radius — and `main.js` swaps scenes during the climb, under cover of the
// ascent. That is the same trick every game of this kind plays.
//
//   const space = createSpace({ star, system, homePlanet, balance, seed });
//   space.enter({ fromPlanet: planet });     // put the ship just above the world you left
//   space.update(dt, input, camera);         // fly it
//   space.canLand();                         // { planet, distance } when you are close enough
//
// Positions come from the same orbital angles `sky.js` uses, so what you saw in the sky from the
// ground is where you actually fly to.

import * as THREE from 'three';
import { createPlanet, createStar, createShip, createSpaceBackdrop } from '../../../assets/js/space-models.js';
import { cloudTexture, surfaceTexture } from '../../../universe/js/texture.js';
import { atmospherePalette } from '../../../worldgen/js/weather.js';
import { clamp } from '../../../worldgen/js/noise.js';

export function createSpace({ star, system, homePlanet, homeWorld = null, balance = {}, seed = 1 } = {}) {
  const cfg = balance.space || {};
  const AU = cfg.auUnits ?? 14000;
  const EARTH = cfg.earthUnits ?? 700;
  const baseSpeed = cfg.speed ?? 160;
  const boostMult = cfg.boost ?? 3.6;
  const warpMult = cfg.warp ?? 26;
  const landRange = cfg.landRange ?? 1.8;         // multiples of a planet's radius
  const orbitScale = balance.sky?.orbitScale ?? 150;
  const dayLength = balance.sky?.dayLengthSeconds ?? 900;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050b);

  // ---------------------------------------------------------------- the star
  const starRadius = Math.max(EARTH * 2.2, EARTH * (star.radius ?? 1) * 1.6);
  const starModel = createStar(star, { radius: starRadius });
  scene.add(starModel.group);
  const starLight = new THREE.PointLight(new THREE.Color(star.color || '#fff0c0'), 2.6, 0, 0);
  scene.add(starLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.09));

  const backdrop = createSpaceBackdrop({ seed, radius: AU * 26, stars: 2600 });
  scene.add(backdrop.group);

  // ---------------------------------------------------------------- the worlds
  //
  // Planets first, then their moons. A moon was drawn in the sky from the ground but did not exist
  // out here at all, so there was nothing to fly to and nothing to land on. They orbit their parent
  // rather than the star, which is why they are placed in a second pass in `placeBodies`.
  const bodies = [];
  const worlds = [
    ...system.planets.map(p => ({ p, parent: null })),
    ...system.planets.flatMap(p => (p.moons || []).map(m => ({ p: m, parent: p }))),
  ];
  for (const { p, parent } of worlds) {
    const pal = atmospherePalette(p);
    const tinted = { ...p, atmosphere: { ...(p.atmosphere || {}), color: pal.cloud } };
    const texture = {};
    const clouds = cloudTexture(tinted, { size: 256 });
    if (clouds) texture.clouds = clouds;
    // the world we launched from gets its real surface map; the rest get the procedural one
    if (homeWorld && p.id === homePlanet?.id) {
      try { texture.map = surfaceTexture(p, homeWorld, { size: 512 }); } catch { /* fall back */ }
    }
    // a moon is genuinely smaller — that is most of what makes it feel like a moon
    const base = EARTH * (p.radius ?? 1) * (p.giant ? 0.55 : 1) * (parent ? 0.42 : 1);
    const radius = Math.max(EARTH * (parent ? 0.12 : 0.35), base);
    const model = createPlanet(tinted, { radius, detail: parent ? 20 : 32, textureSize: parent ? 128 : 256, texture });
    scene.add(model.group);
    bodies.push({
      planet: p, model, radius, parentId: parent?.id ?? null, moon: !!parent,
      au: p.orbit?.au ?? parent?.orbit?.au ?? 1,
      // a moon's orbit is given in PLANET RADII, not AU — the same conversion sky.js makes
      moonRadii: parent ? (p.orbit?.radii ?? p.orbit?.planetRadii ?? 8) : 0,
      period: p.orbit?.periodDays || (parent ? 12 : 365),
      phase: ((p.seed ?? p.id) % 360) * Math.PI / 180,
      inclination: p.orbit?.inclination ?? 0,
      eccentricity: p.orbit?.eccentricity ?? 0,
      position: new THREE.Vector3(),
      // a gas or ice giant has no surface; a moon has one if `universe/` drew it a map
      landable: !p.giant && p.landable !== false,
      gravity: p.gravity ?? (parent ? 0.18 : 1),
    });
  }

  // ---------------------------------------------------------------- the ship
  const ship = createShip('explorer');
  ship.group.scale.setScalar(cfg.shipScale ?? 12);
  scene.add(ship.group);

  const state = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    yaw: 0, pitch: 0,
    throttle: 0,
    speed: 0,
    boosting: false,
    warping: false,
    warpCharge: 0,
    elapsed: 0,
    lastYaw: 0,
    bank: 0,
  };

  const forward = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  /** Where every world is right now, on the same clock the sky uses. */
  function placeBodies(elapsed) {
    const days = (elapsed / dayLength) * orbitScale;
    for (const b of bodies) {
      if (b.moon) continue;                      // moons go round their parent, in a second pass
      const angle = b.phase + (days / b.period) * Math.PI * 2;
      // a real orbit is an ellipse: r = a(1 - e^2) / (1 + e cos θ). `universe/` already rolls an
      // eccentricity for every planet; drawing perfect circles threw it away.
      const e = b.eccentricity;
      const r = b.au * (1 - e * e) / (1 + e * Math.cos(angle));
      b.position.set(
        Math.cos(angle) * r * AU,
        Math.sin(b.inclination) * r * AU * 0.35,
        Math.sin(angle) * r * AU,
      );
      b.orbitRadius = r;
      b.model.group.position.copy(b.position);
      b.model.update?.(0, elapsed);
    }
    // now the moons, around wherever their planet ended up
    for (const b of bodies) {
      if (!b.moon) continue;
      const host = bodies.find(x => x.planet.id === b.parentId) || bodies[0];
      const angle = b.phase + (days / Math.max(0.2, b.period)) * Math.PI * 2;
      const r = host.radius * Math.max(2.2, b.moonRadii);
      b.position.set(
        host.position.x + Math.cos(angle) * r,
        host.position.y + Math.sin(b.inclination) * r * 0.4,
        host.position.z + Math.sin(angle) * r,
      );
      b.orbitRadius = host.orbitRadius;
      b.model.group.position.copy(b.position);
      b.model.update?.(0, elapsed);
    }
  }

  /** Put the ship just off the world it launched from. */
  function enter({ fromPlanet = homePlanet, elapsed = 0, offset = 2.6 } = {}) {
    state.elapsed = elapsed;
    placeBodies(elapsed);
    const body = bodies.find(b => b.planet.id === fromPlanet?.id) || bodies[0];
    // rise away from the star, so you leave on the daylight side and the world is lit
    tmp.copy(body.position).normalize();
    if (tmp.lengthSq() < 1e-6) tmp.set(1, 0, 0);
    state.position.copy(body.position).addScaledVector(tmp, body.radius * offset);
    state.velocity.set(0, 0, 0);
    state.throttle = 0;
    // look back at the world you just left
    const look = tmp.clone().multiplyScalar(-1);
    state.yaw = Math.atan2(look.x, look.z);
    state.pitch = Math.asin(clamp(look.y, -1, 1));
    return body;
  }

  /** One frame of flight. `input` is a snapshot from player.js createInput().sample(). */
  function update(dt, input, camera) {
    state.elapsed += dt;
    placeBodies(state.elapsed);

    if (input) {
      state.yaw -= input.look[0] * 0.0022;
      state.pitch = clamp(state.pitch + input.look[1] * -0.0018, -1.45, 1.45);
      // W/S is the throttle; it eases rather than snapping, so the ship has some weight
      const want = (input.forward || 0);
      state.throttle += (want - state.throttle) * Math.min(1, dt * 2.6);
      state.boosting = !!input.run;
      state.warping = !!input.jump;
    }

    // warp takes a moment to spin up, which is what makes it feel like a warp
    state.warpCharge = clamp(state.warpCharge + (state.warping ? dt * 1.6 : -dt * 3), 0, 1);
    const multiplier = 1 + (state.boosting ? boostMult - 1 : 0) + state.warpCharge * (warpMult - 1);
    state.speed = baseSpeed * multiplier * state.throttle;

    const cp = Math.cos(state.pitch);
    forward.set(Math.sin(state.yaw) * cp, Math.sin(state.pitch), Math.cos(state.yaw) * cp);
    state.velocity.copy(forward).multiplyScalar(state.speed);
    state.position.addScaledVector(state.velocity, dt);

    // keep the ship inside the system rather than letting it fly off into nothing
    const rim = AU * (cfg.rimAu ?? 14);
    if (state.position.length() > rim) state.position.setLength(rim);

    // Point the nose along the flight path. The hull is modelled facing +Z (the nose cone sits at
    // z 0.65, the engines behind it), and Object3D.lookAt turns +Z toward the target, so aiming it
    // this way works whatever Euler order the rest of the code uses.
    //
    // Do NOT call ship.update(): the model's own update is the gallery turntable
    // (`group.rotation.y += 0.35 * dt`), which fought this every frame and left the hull skewed.
    ship.group.position.copy(state.position);
    ship.group.lookAt(
      state.position.x + forward.x,
      state.position.y + forward.y,
      state.position.z + forward.z,
    );
    // bank into the turn, by how fast the nose is swinging
    const yawRate = (state.yaw - state.lastYaw + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    state.lastYaw = state.yaw;
    state.bank += (clamp(yawRate / Math.max(1e-4, dt) * 0.12, -0.7, 0.7) - state.bank) * Math.min(1, dt * 4);
    ship.group.rotateZ(state.bank);
    state.quaternion.copy(ship.group.quaternion);

    if (camera) {
      // third person, behind and slightly above, pulled back further the faster you go
      const back = (cfg.camBack ?? 90) * (1 + state.warpCharge * 1.4);
      camera.position.copy(state.position)
        .addScaledVector(forward, -back)
        .add(tmp.set(0, (cfg.camLift ?? 26), 0));
      camera.lookAt(state.position.x + forward.x * 40, state.position.y + forward.y * 40, state.position.z + forward.z * 40);
    }

    starLight.position.set(0, 0, 0);
    return state;
  }

  /** How far the ship is from a body's surface, in that body's radii. */
  function altitudeOf(body) {
    return (state.position.distanceTo(body.position) - body.radius) / body.radius;
  }

  /** The body the ship is closest to, by surface distance. */
  function nearest() {
    let best = null, bestAlt = Infinity;
    for (const b of bodies) {
      const alt = altitudeOf(b);
      if (alt < bestAlt) { bestAlt = alt; best = b; }
    }
    return best ? { body: best, altitude: bestAlt, distance: state.position.distanceTo(best.position) } : null;
  }

  /** The world you could put down on right now, or null. */
  function canLand() {
    const near = nearest();
    if (!near || !near.body.landable) return null;
    if (near.altitude > landRange) return null;
    return { planet: near.body.planet, body: near.body, altitude: near.altitude };
  }

  /**
   * Where on the target world the ship is coming down: the point under it. Returned as a fraction
   * of the map, so the ground can rebuild there.
   */
  function landingSpot(body) {
    tmp.copy(state.position).sub(body.position).normalize();
    const lon = (Math.atan2(tmp.z, tmp.x) / (Math.PI * 2)) + 0.5;
    const lat = 0.5 - Math.asin(clamp(tmp.y, -1, 1)) / Math.PI;
    return { u: (lon % 1 + 1) % 1, v: clamp(lat, 0.05, 0.95) };
  }

  /**
   * The body the crosshair is on — the nearest one whose disc the shot line passes through, or the
   * closest to the line if none is actually covered. `dir` is the way the ship is looking.
   */
  function targetUnder(dir, { cone = 0.30 } = {}) {
    // A generous cone — about seventeen degrees — because these are specks at a distance of an AU
    // and demanding the crosshair sit on the disc made targeting "very finicky". Inside the cone the
    // nearest-to-centre wins, and a body you are actually pointing at beats one merely nearby.
    let best = null, bestScore = Infinity;
    let sticky = null;
    for (const b of [...bodies, STAR]) {
      tmp.copy(b.position).sub(state.position);
      const along = tmp.dot(dir);
      if (along <= 0) continue;                                  // behind us
      const off = tmp.clone().addScaledVector(dir, -along).length();
      const angular = Math.atan2(off, along);                    // radians away from the crosshair
      const disc = Math.atan2(b.radius, along);                  // how wide it looks from here
      if (angular <= disc) {
        // the crosshair is genuinely ON it: the nearest such body wins outright
        if (!sticky || along < sticky.along) sticky = { b, along };
        continue;
      }
      if (angular > cone) continue;
      // otherwise: closest to the middle, with a nudge toward bodies that look bigger
      const score = angular - disc * 0.5;
      if (score < bestScore) { bestScore = score; best = b; }
    }
    return sticky ? sticky.b : best;
  }

  /**
   * Everything worth saying about a body, in plain language — the card that hangs beside the
   * reticle. It always answers "can I land on this", and when the answer is no it says why.
   */
  function describe(body) {
    if (!body) return null;
    if (body.isStar) {
      return {
        name: star.name || 'the star', kind: `${star.className || star.type || 'star'}`,
        lines: [
          star.temperature ? `${Math.round(star.temperature)} K at the surface` : null,
          star.radius ? `${star.radius.toFixed(2)} times our own sun across` : null,
          'Everything in this system orbits it.',
        ].filter(Boolean),
        landable: false,
        why: 'It is a star. There is no surface, and getting close would end the expedition.',
        distanceAu: state.position.distanceTo(body.position) / AU,
      };
    }
    const p = body.planet;
    const lines = [
      body.moon ? `Moon of ${system.planets.find(x => x.id === body.parentId)?.name || 'its planet'}` : (p.archetypeName || p.archetype || 'world'),
      p.radius ? `${(p.radius * 6371).toFixed(0)} km across` : null,
      p.gravity ? `${p.gravity.toFixed(2)} g` : null,
      p.dayLengthHours ? `a ${p.dayLengthHours.toFixed(1)}-hour day` : null,
      p.atmosphere?.density > 0.08
        ? `${p.atmosphere.breathable ? 'breathable' : 'unbreathable'} air`
        : 'no air worth the name',
      p.temperature?.K ? `${Math.round(p.temperature.K - 273)}°C on average` : null,
      // `resources` and `rareElements` are OBJECTS out of universe/js/elements.js, not strings —
      // joining them gave "[object Object, object Object]" on every planet card.
      (p.resources || []).length ? (p.resources.slice(0, 3).map(r => r.name || r.key).join(', ')) : null,
      (p.rareElements || []).length ? `rare: ${p.rareElements.slice(0, 2).map(r => r.name || r.key).join(', ')}` : null,
    ].filter(Boolean);
    return {
      name: p.name, kind: body.moon ? 'moon' : (p.giant ? 'giant' : 'planet'),
      lines, landable: body.landable,
      why: body.landable ? null
        : p.giant ? 'A gas giant — there is no ground under the cloud, only more cloud, then a crush.'
          : 'Nothing here will hold a ship.',
      distanceAu: state.position.distanceTo(body.position) / AU,
      altitude: altitudeOf(body),
      moon: body.moon,
      gravity: p.gravity ?? body.gravity,
    };
  }

  /** The star, as a body the crosshair can find. */
  const STAR = {
    isStar: true, planet: { name: star.name || 'the star', id: 'star' },
    position: new THREE.Vector3(0, 0, 0), radius: starRadius, landable: false, model: starModel,
  };

  /** A line for the HUD: where you are and how fast. */
  function readout() {
    const near = nearest();
    const speedText = state.warpCharge > 0.5 ? 'warp' : state.boosting ? 'boost' : 'cruise';
    return {
      target: near ? near.body.planet.name : '—',
      altitude: near ? near.altitude : 0,
      distanceAu: near ? near.distance / AU : 0,
      speed: Math.round(state.speed),
      mode: speedText,
      warpCharge: state.warpCharge,
      canLand: !!canLand(),
    };
  }

  return {
    scene, bodies, ship, state, AU, EARTH,
    enter, update, nearest, canLand, landingSpot, readout, placeBodies,
    targetUnder, describe, STAR,
    /** The way the ship is pointing, for `targetUnder`. */
    heading() {
      const cp = Math.cos(state.pitch);
      return new THREE.Vector3(Math.sin(state.yaw) * cp, Math.sin(state.pitch), Math.cos(state.yaw) * cp);
    },
    /** Everything worth drawing a bracket around: near enough and big enough to see. */
    marks(camera) {
      const out = [];
      for (const b of [...bodies, STAR]) {
        const d = state.position.distanceTo(b.position);
        if (d > AU * 22) continue;
        out.push({ body: b, position: b.position, radius: b.radius, distance: d, name: b.planet.name, moon: !!b.moon, star: !!b.isStar, landable: !!b.landable });
      }
      return out.sort((a, b) => a.distance - b.distance).slice(0, 12);
    },
    /** Aim the ship at a world, for a "set course" button. */
    aimAt(body) {
      tmp.copy(body.position).sub(state.position).normalize();
      state.yaw = Math.atan2(tmp.x, tmp.z);
      state.pitch = Math.asin(clamp(tmp.y, -1, 1));
    },
    stats: () => ({
      bodies: bodies.length,
      position: state.position.toArray().map(v => Math.round(v)),
      speed: Math.round(state.speed),
      throttle: +state.throttle.toFixed(2),
      warpCharge: +state.warpCharge.toFixed(2),
      ...readout(),
    }),
    dispose() {
      for (const b of bodies) { scene.remove(b.model.group); b.model.dispose?.(); }
      scene.remove(ship.group); ship.dispose?.();
      scene.remove(starModel.group); starModel.dispose?.();
      scene.remove(backdrop.group); backdrop.dispose?.();
    },
  };
}
