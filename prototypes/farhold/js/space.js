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
  const bodies = [];
  for (const p of system.planets) {
    const pal = atmospherePalette(p);
    const tinted = { ...p, atmosphere: { ...(p.atmosphere || {}), color: pal.cloud } };
    const texture = {};
    const clouds = cloudTexture(tinted, { size: 256 });
    if (clouds) texture.clouds = clouds;
    // the world we launched from gets its real surface map; the rest get the procedural one
    if (homeWorld && p.id === homePlanet?.id) {
      try { texture.map = surfaceTexture(p, homeWorld, { size: 512 }); } catch { /* fall back */ }
    }
    const radius = Math.max(EARTH * 0.35, EARTH * (p.radius ?? 1) * (p.giant ? 0.55 : 1));
    const model = createPlanet(tinted, { radius, detail: 32, textureSize: 256, texture });
    scene.add(model.group);
    bodies.push({
      planet: p, model, radius,
      au: p.orbit?.au ?? 1,
      period: p.orbit?.periodDays || 365,
      phase: ((p.seed ?? p.id) % 360) * Math.PI / 180,
      inclination: p.orbit?.inclination ?? 0,
      eccentricity: p.orbit?.eccentricity ?? 0,
      position: new THREE.Vector3(),
      landable: !p.giant && p.landable !== false,
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
  };

  const forward = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  /** Where every world is right now, on the same clock the sky uses. */
  function placeBodies(elapsed) {
    const days = (elapsed / dayLength) * orbitScale;
    for (const b of bodies) {
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

    // point the hull along the flight path, with a little bank into the turn
    state.quaternion.setFromEuler(new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ'));
    ship.group.position.copy(state.position);
    ship.group.quaternion.copy(state.quaternion);
    ship.update?.(dt, state.elapsed);

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
