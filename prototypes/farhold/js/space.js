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
// ground is where you actually fly to. Both ends cap how fast a body may appear to move, and they
// cap it differently on purpose: the sky cares about degrees of sky a second, out here it is metres
// a second against the ship — a world that drifts faster than you can fly is a world you cannot
// leave. See `clockFor` below.

import * as THREE from 'three';
import { createPlanet, createStar, createShip, createSpaceBackdrop } from '../../../assets/js/space-models.js';
import { cloudTexture, surfaceTexture } from '../../../universe/js/texture.js';
import { orbitLayout } from '../../../universe/js/system.js';
import { atmospherePalette } from '../../../worldgen/js/weather.js';
import { clamp } from '../../../worldgen/js/noise.js';

/**
 * The rungs of the planet texture ladder, smallest first.
 *
 * Module level so it cannot land in a temporal dead zone: `placeBodies` runs while the factory body
 * is still executing and reaches for the first rung.
 */
const LADDER = [256, 512, 1024];

export function createSpace({ star, system, homePlanet, homeWorld = null, balance = {}, seed = 1 } = {}) {
  const cfg = balance.space || {};
  const AU = cfg.auUnits ?? 14000;
  const EARTH = cfg.earthUnits ?? 700;
  const baseSpeed = cfg.speed ?? 160;
  const boostMult = cfg.boost ?? 3.6;
  const warpMult = cfg.warp ?? 26;
  const landRange = cfg.landRange ?? 1.8;         // multiples of a planet's radius
  /**
   * The approach.
   *
   * **The slow zone is measured in AU, not in body radii.** It used to be "26 radii above the
   * surface", which sounds modest and is not: a body is drawn a twentieth of an AU across in these
   * compressed units, so 26 radii is a third of an AU, and a gas giant's was further still. The
   * report was *"the slowing system is far too aggressive and stops me boosting with Space; it
   * should only slow me within roughly 0.1 AU of a planet"* — which is a distance, the same for a
   * moon as for a giant, so that is what it is now. `slowWithinAu` is also where you come out when
   * you leave an atmosphere, so the drop-out point sits just outside the brake and you can boost
   * away the moment you arrive.
   */
  const approachCfg = {
    slowWithinAu: cfg.slowWithinAu ?? 0.1,   // start easing off the throttle this far from the surface
    slowTo: cfg.slowTo ?? 0.25,              // …down to this fraction of cruise at the surface
    // …with two guards in the body's own radii, because a body is drawn anywhere from a
    // two-hundredth to a twelfth of an AU across in these compressed units and one flat distance
    // cannot be right for both. `minRadii` stops the brake being too small to bite on a little
    // world in a tight system; `bigRadii` is the extra a gas giant gets for being a bigger thing to
    // be near. On an ordinary world neither one bites and the plain 0.1 AU is what you feel.
    minRadii: cfg.slowMinRadii ?? 8,
    bigRadii: cfg.slowBigRadii ?? 3,
    // How close counts as "in the way" for the warp drive — again a distance, and half the brake's,
    // so there is always open water between "the drive will light" and "the ship is being slowed".
    noWarpWithinAu: cfg.noWarpWithinAu ?? 0.05,
    noWarpRadii: cfg.noWarpRadii ?? 1.5,
    // Leaving an atmosphere puts you at the OUTER EDGE of the brake above — whatever that works out
    // to for the world you left — plus this much margin, so the throttle is yours from the first
    // frame. You used to surface 1.6 radii up with the throttle crushed to a quarter, which is
    // slower than the world's own orbital drift, so the planet simply caught you again: *"leaving
    // atmosphere sometimes drops you straight back into it as soon as space loads."*
    exitMargin: cfg.exitMargin ?? 1.1,
    entry: cfg.entryAltitude ?? 0.5,     // fall below this over a landable world and you are in its air
    tiers: cfg.detailTiers || [
      { key: 'far', within: Infinity, detail: 32, textureSize: 256 },
      { key: 'near', within: 14, detail: 64, textureSize: 512 },
      { key: 'close', within: 3.5, detail: 128, textureSize: 1024 },
    ],
  };
  const orbitScale = balance.sky?.orbitScale ?? 150;
  const dayLength = balance.sky?.dayLengthSeconds ?? 900;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050b);

  // ---------------------------------------------------------------- the star
  /**
   * HOW BIG THE STAR IS DRAWN — and it has to leave room for its own planets.
   *
   * Seed 777: "there is a Neutron Star with rings and a shaft sticking out of it, very cool; however
   * there are two planets INSIDE the diameter of the sun."
   *
   * A neutron star is twenty kilometres across, so its true radius is nothing, and the floor here
   * (`EARTH * 2.2`, so it is visible at all) made the drawn star 1540 units while its innermost
   * world orbited at 491. The floor is right — an invisible star is worse — but it cannot be
   * allowed to swallow the system. So the drawn radius is also capped at a fraction of the closest
   * orbit, which is the one number that guarantees every planet is outside it.
   */
  const closestAu = Math.min(...(system.planets || []).map(p => p.orbit?.au ?? Infinity), Infinity);
  const wanted = Math.max(EARTH * 2.2, EARTH * (star.radius ?? 1) * 1.6);
  const roomFor = Number.isFinite(closestAu) ? closestAu * AU * 0.42 : Infinity;
  const starRadius = Math.max(EARTH * 0.5, Math.min(wanted, roomFor));
  const starModel = createStar(star, { radius: starRadius });
  scene.add(starModel.group);
  const starLight = new THREE.PointLight(new THREE.Color(star.color || '#fff0c0'), 2.6, 0, 0);
  scene.add(starLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.09));

  /**
   * "Different systems should have different properties in the skybox."
   *
   * The backdrop takes a seed, so the star field already changes with the system — but the nebulae
   * were the same four colours everywhere, which made every system read the same at a glance. The
   * palette is now rolled from the star itself: a hot blue system gets cold clouds, a red dwarf gets
   * rust and ember, a black hole gets almost nothing at all. It is the first thing you see when you
   * come out of a jump, and it should tell you that you went somewhere.
   */
  const NEBULA_PALETTES = {
    blueGiant: ['#4a7ad0', '#6a4ad0', '#3ad0c0'],
    whiteDwarf: ['#8fa8d0', '#5a6a9a', '#3ad0c0'],
    redDwarf: ['#d0563a', '#a03a5a', '#d08a3a'],
    redGiant: ['#d04a3a', '#d0863a', '#a0405a'],
    neutronStar: ['#9fd8ff', '#6a4ad0', '#ffffff'],
    blackHole: ['#2a1a3a', '#6a2a4a'],
    binaryPair: ['#d04a7a', '#4a7ad0', '#d0b03a'],
  };
  const backdrop = createSpaceBackdrop({
    seed, radius: AU * 26,
    stars: 1800 + ((seed >>> 3) % 1900),
    nebula: star.classKey === 'blackHole' ? 1 : 2 + ((seed >>> 7) % 4),
    colors: NEBULA_PALETTES[star.classKey] || ['#6a4ad0', '#2a6ad0', '#d04a7a', '#3ad0c0'],
  });
  scene.add(backdrop.group);

  // ---------------------------------------------------------------- the worlds
  //
  // Planets first, then their moons. A moon was drawn in the sky from the ground but did not exist
  // out here at all, so there was nothing to fly to and nothing to land on. They orbit their parent
  // rather than the star, which is why they are placed in a second pass in `placeBodies`.
  const bodies = [];
  /** `${planetId}@${size}` -> the layer set at that size. Generated once, then switched between. */
  const textureCache = new Map();

  /**
   * HOW BIG A WORLD IS DRAWN, AND WHERE ITS MOONS GO.
   *
   * *"Planets are too close together, some are drawn larger than their own sun, and moons share an
   * orbital ring with planets so they could collide."* All three are the same fault: nothing here
   * knew how much room a world actually had. A giant came out at `EARTH * 11 * 0.55` — six times
   * the drawn star — and its moons were then placed eight of THOSE radii out, a circle nearly two
   * and a half AU wide that swept straight through its neighbours' orbits.
   *
   * `universe/js/system.js`'s `orbitLayout` owns the answer. Asked with `map: 'au'` it leaves the
   * orbits exactly where they really are — this scene is flown in real AU, and the HUD says so — and
   * lends only the geometry: the gap either side of each ring, a size cap that keeps a planet
   * narrower than its own lane, and a moon ladder that stays inside the lane its parent owns. Two
   * lanes never touch, so nothing a moon sweeps can meet anything else in the system.
   */
  const layout = orbitLayout(system, { map: 'au', starRadius: starRadius / AU });
  const drawn = new Map();               // planet id → { radius, moonOrbits }
  system.planets.forEach((p, i) => {
    const moons = (p.moons || []).length;
    const wantAu = EARTH * (p.radius ?? 1) * (p.giant ? 0.55 : 1) / AU;
    // the lane cap, and then a second one: a world is never drawn bigger than the star it goes round
    const capped = layout.sizeFor(i, wantAu, { moons }) * AU;
    const radius = Math.max(EARTH * 0.1, Math.min(capped, starRadius * 0.85));
    drawn.set(p.id, {
      radius,
      lane: layout.laneAt(i) * AU,     // the space around this ring that is this planet's alone
      moonOrbits: layout.moonRings(i, moons, { bodyRadius: radius / AU }).map(r => r * AU),
    });
  });

  /**
   * AN ORBIT YOU CAN BELIEVE.
   *
   * *"Planets and moons orbit at crazy speeds — pretty much all moons."* One multiplier ran every
   * body: `orbitScale` 150 turns a 900-second day into six seconds, which is fine for a sibling
   * planet's year and absurd for a twelve-day moon — it went round in about a minute, several times
   * faster than the ship can fly. `sky.js` already caps each body's apparent motion separately;
   * out here the measure that matters is linear speed, because a world that moves faster than the
   * ship is a world you cannot get away from. So every body gets its own clock, cut back until it
   * is drifting at no more than a small fraction of cruise.
   */
  const maxBodySpeed = cfg.bodySpeed ?? baseSpeed * 0.12;
  function clockFor(radiusUnits, periodDays) {
    const period = Math.max(0.2, periodDays);
    const speed = (Math.PI * 2 * radiusUnits * orbitScale) / (period * dayLength);
    return speed > maxBodySpeed ? orbitScale * (maxBodySpeed / speed) : orbitScale;
  }

  const worlds = [
    ...system.planets.map(p => ({ p, parent: null })),
    ...system.planets.flatMap(p => (p.moons || []).map((m, mi) => ({ p: m, parent: p, moonIndex: mi }))),
  ];
  for (const { p, parent, moonIndex = 0 } of worlds) {
    const pal = atmospherePalette(p);
    const tinted = { ...p, atmosphere: { ...(p.atmosphere || {}), color: pal.cloud } };
    // the cheapest rung to start on — the ladder fills in as the ship closes
    const texture = texturesFor(p, tinted, LADDER[0]);
    // a moon is genuinely smaller — that is most of what makes it feel like a moon — and it also has
    // to fit in the ring its parent left it, or it is drawn inside the planet it goes round
    const host = parent ? drawn.get(parent.id) : null;
    const moonOrbit = host ? (host.moonOrbits[moonIndex] ?? host.radius * 2.4) : 0;
    const radius = parent
      ? Math.max(EARTH * 0.06, Math.min(EARTH * (p.radius ?? 0.27) * 0.42, host.radius * 0.5, (moonOrbit - host.radius) * 0.45))
      : drawn.get(p.id).radius;
    const baseDetail = parent ? 20 : 32, baseTexture = parent ? 128 : 256;
    const model = createPlanet(tinted, { radius, detail: baseDetail, textureSize: baseTexture, texture });
    scene.add(model.group);
    bodies.push({
      planet: p, model, radius, parentId: parent?.id ?? null, moon: !!parent,
      // kept so the model can be rebuilt at a finer detail as the ship closes on it
      tinted, texture, baseDetail, baseTexture, tier: 'far',
      au: p.orbit?.au ?? parent?.orbit?.au ?? 1,
      // where this moon's ring sits, in scene units, already inside its parent's own lane
      moonOrbit,
      // …and the lane itself, which is how far out this body's approach brake may reach
      lane: (parent ? host.lane : drawn.get(p.id).lane),
      period: p.orbit?.periodDays || (parent ? 12 : 365),
      // …and its own clock, slow enough that it cannot outrun the ship (see `clockFor`)
      clock: clockFor(parent ? moonOrbit : (p.orbit?.au ?? 1) * AU, p.orbit?.periodDays || (parent ? 12 : 365)),
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
    approach: 1,             // how much of the throttle the ship will give you this close in
    crowded: false,          // …and whether warp is locked out because something is nearby
    elapsed: 0,
    lastYaw: 0,
    bank: 0,
  };

  const forward = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  /** Where every world is right now, on the same clock the sky uses. */
  function placeBodies(elapsed) {
    for (const b of bodies) {
      if (b.moon) continue;                      // moons go round their parent, in a second pass
      const days = (elapsed / dayLength) * b.clock;
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
      const days = (elapsed / dayLength) * b.clock;
      const angle = b.phase + (days / Math.max(0.2, b.period)) * Math.PI * 2;
      const r = b.moonOrbit || host.radius * 2.4;
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

  // ---------------------------------------------------------------- closing on a world
  //
  // *"In space, getting close to a planet should cause you to slow down and cause the planet to get
  // more detailed. As you approach the atmosphere it should get more detailed, eventually entering
  // the atmosphere."*
  //
  // Two halves. The throttle is governed by how close you are, so a world you are diving at stops
  // being a speck that becomes a wall in one frame; and the body you are closing on is rebuilt at a
  // finer sphere and a bigger texture in two steps, so the disc that was a smudge from an AU away is
  // a surface with weather on it by the time you are in its air.

  /**
   * How far off a body's surface the approach brake reaches, in scene units.
   *
   * 0.1 AU, or three of the body's own radii if it is a big one — but never wider than the lane it
   * owns. That last cap is for compact systems: a red dwarf keeps its worlds a tenth of an AU apart
   * all told, and a flat 0.1 AU bubble on each of them would put the brake on everywhere in the
   * system, which is the complaint we are fixing, not a milder version of it.
   */
  function slowZoneFor(radius, lane = Infinity) {
    // the distance rule: 0.1 AU, and never wider than the lane this world owns
    const byDistance = Math.min(approachCfg.slowWithinAu * AU, lane);
    // never tighter than `minRadii` of the body's own radii, or it cannot bite before you are on
    // the deck; and never wider than `bigRadii` past 0.1 AU, which is what stopped a big world's
    // bubble quietly meaning a third of an AU again
    const ceiling = Math.max(approachCfg.slowWithinAu * AU, radius * approachCfg.bigRadii);
    return Math.min(Math.max(radius * approachCfg.minRadii, byDistance), ceiling);
  }

  /** …and how far out the warp drive refuses to light. Always well inside the brake. */
  function warpBubbleFor(radius, lane = Infinity) {
    return Math.min(
      Math.max(approachCfg.noWarpWithinAu * AU, radius * approachCfg.noWarpRadii),
      slowZoneFor(radius, lane) * 0.6,
    );
  }

  /**
   * How much of cruise speed is available this close to something. 1 anywhere outside the slow zone,
   * `slowTo` at the deck. Measured from the SURFACE in scene units, so the brake is a distance you
   * can point at on the HUD rather than a number of radii that quietly meant a third of an AU.
   *
   * With no argument it answers for whatever is nearest, which is what the flight model asks. Pass
   * a body and it answers for that one — useful when you want to know how hard a particular world
   * is holding you rather than which world happens to be closest.
   */
  function throttleLimit(body = null) {
    const near = body ? { body, distance: state.position.distanceTo(body.position) } : nearest();
    if (!near) return 1;
    const t = clamp((near.distance - near.body.radius) / slowZoneFor(near.body.radius, near.body.lane), 0, 1);
    // ease in, so the brake comes on gently rather than as a wall
    return approachCfg.slowTo + (1 - approachCfg.slowTo) * (t * t * (3 - 2 * t));
  }

  /** Which detail step a body deserves at this altitude. */
  function tierFor(altitude) {
    let best = approachCfg.tiers[0];
    for (const t of approachCfg.tiers) if (altitude < t.within) best = t;
    return best;
  }

  /**
   * THE TEXTURE LADDER.
   *
   * "Can the planets also switch to a higher resolution texture as you get closer? It might make
   * sense to generate 2-3 LOD textures."
   *
   * That is exactly right, and it was not what happened. There WAS a three-tier system — far / near
   * / close, with `textureSize` 256 / 512 / 1024 — but `textureSize` is only read by
   * `createPlanet` when NOBODY HANDS IN A MAP: it sizes the fallback procedural blotch. The world
   * you launched from always hands in a real map, so its tier size did nothing at all, and measuring
   * it confirmed the surface stayed 1024 wide at every distance including the far one.
   *
   * Worse, the map was REGENERATED on every tier change. `surfaceTexture` rasterises an equirect
   * image a pixel at a time on the main thread; doing that each time the ship crosses a threshold —
   * and again when it drops back — is the most expensive possible way to change a number.
   *
   * So: generate each rung ONCE, keep it, and switch. Flying out and back in costs nothing the
   * second time, and the first rung is the cheap one, so arriving in a system does not stall.
   */
  function texturesFor(planet, tinted, size) {
    const key = `${planet.id}@${size}`;
    const hit = textureCache.get(key);
    if (hit) return hit;

    const set = {};
    // clouds and lights ride the same ladder a rung down: they are soft, and nobody reads a cloud
    const soft = Math.max(128, size >> 1);
    try { const c = cloudTexture(tinted, { size: soft }); if (c) set.clouds = c; } catch { /* no clouds */ }
    // the world we launched from gets its REAL surface map; the rest keep the procedural one, which
    // `createPlanet` builds itself from `textureSize`
    if (homeWorld && planet.id === homePlanet?.id) {
      try { set.map = surfaceTexture(planet, homeWorld, { size }); } catch { /* fall back */ }
    }
    textureCache.set(key, set);
    return set;
  }

  /** Which rung a tier stands on. A moon is small on screen, so it never needs the top one. */
  function ladderFor(tier, moon) {
    const i = Math.max(0, approachCfg.tiers.findIndex(t => t.key === tier.key));
    const rung = LADDER[Math.min(LADDER.length - 1, i)];
    return moon ? Math.max(LADDER[0], rung >> 1) : rung;
  }

  let refineCooldown = 0;

  /**
   * Rebuild the nearest body at a finer detail when it has earned one, and drop everything else
   * back to `far`. Rebuilding allocates a texture, so it happens at most a few times a second and
   * only when the step has actually changed.
   */
  function refineDetail(dt = 0) {
    refineCooldown -= dt;
    const near = nearest();
    if (!near) return null;
    const want = tierFor(near.altitude);
    if (want.key !== near.body.tier && refineCooldown <= 0) {
      refineCooldown = 0.35;
      rebuildBody(near.body, want);
    }
    // anything else that got refined earlier goes back to cheap
    if (refineCooldown <= 0) {
      for (const b of bodies) {
        if (b === near.body || b.tier === 'far') continue;
        refineCooldown = 0.35;
        rebuildBody(b, approachCfg.tiers[0]);
        break;                                   // one a frame; there is no hurry going the other way
      }
    }
    return near;
  }

  function rebuildBody(body, tier) {
    const detail = tier.key === 'far' ? body.baseDetail : Math.round(tier.detail * (body.moon ? 0.6 : 1));
    /**
     * Step up or down the ladder — no rasterising here.
     *
     * `textureSize` is what `createPlanet` uses for the procedural fallback, so it has to agree with
     * the rung, or a world with no real map would stay coarse while its neighbour sharpened.
     */
    const textureSize = ladderFor(tier, body.moon);
    const texture = texturesFor(body.planet, body.tinted, textureSize);
    body.texture = texture;
    body.textureSize = textureSize;
    const next = createPlanet(body.tinted, { radius: body.radius, detail, textureSize, texture });
    next.group.position.copy(body.model.group.position);
    next.group.quaternion.copy(body.model.group.quaternion);
    scene.add(next.group);
    scene.remove(body.model.group);
    body.model.dispose?.();
    body.model = next;
    body.tier = tier.key;
    return body;
  }

  /**
   * The world the ship has fallen into the air of, or null. `main.js` hands this straight to the
   * descent, so you enter an atmosphere by flying into it rather than by pressing a key at it.
   */
  function atmosphereEntry() {
    const near = nearest();
    if (!near || !near.body.landable) return null;
    if (near.altitude > approachCfg.entry) return null;
    return { planet: near.body.planet, body: near.body, altitude: near.altitude };
  }

  /**
   * Put the ship well off the world it launched from.
   *
   * `offset` is in body radii, and on its own it was the whole of the problem behind *"leaving
   * atmosphere sometimes drops you straight back in"*: 2.6 radii is a tenth of the width of a hand
   * at this scale, inside the approach brake, and slower than the world's own orbital drift — so
   * the planet caught the ship up and swallowed it again before you had a chance to turn. The
   * distance is now whichever is further out, that many radii or `exitAu` clear of the surface, so
   * you always come out at the outer edge of the brake with the throttle free.
   */
  function enter({ fromPlanet = homePlanet, elapsed = 0, offset = 2.6 } = {}) {
    state.elapsed = elapsed;
    placeBodies(elapsed);
    const body = bodies.find(b => b.planet.id === fromPlanet?.id) || bodies[0];
    // rise away from the star, so you leave on the daylight side and the world is lit
    tmp.copy(body.position).normalize();
    if (tmp.lengthSq() < 1e-6) tmp.set(1, 0, 0);
    // …and at least clear of the brake, so the throttle is yours from the first frame
    const out = body.radius + Math.max(
      body.radius * (offset - 1),
      slowZoneFor(body.radius, body.lane) * approachCfg.exitMargin,
    );
    state.position.copy(body.position).addScaledVector(tmp, out);
    state.velocity.set(0, 0, 0);
    state.throttle = 0;
    /**
     * FACING AWAY FROM THE WORLD YOU JUST LEFT.
     *
     * "When you exit a planet, the vehicle is facing backwards and pointing directly at the planet.
     * They should be pointing away since you just left the planet." It used to turn and look back,
     * which is a nice shot and a bad control state: the first thing you do on leaving is fly
     * somewhere, and the first thing the ship did was point at the one place you had finished with.
     */
    const look = tmp.clone();
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

    // warp takes a moment to spin up, which is what makes it feel like a warp — and it will not
    // spin up at all with a world in your lap, which is what stops you warping into a planet
    const room = nearest();
    state.crowded = !!room && (room.distance - room.body.radius) < warpBubbleFor(room.body.radius, room.body.lane);
    if (state.crowded) state.warping = false;
    // a running drive bleeds off FAST when a world comes up, rather than coasting the ship straight
    // through it while the charge takes a third of a second to fall
    const bleed = state.crowded ? 12 : 3;
    state.warpCharge = clamp(state.warpCharge + (state.warping ? dt * 1.6 : -dt * bleed), 0, 1);
    const multiplier = 1 + (state.boosting ? boostMult - 1 : 0) + state.warpCharge * (warpMult - 1);
    // …and the closer you get, the less of the throttle the ship will give you
    state.approach = throttleLimit();
    state.speed = baseSpeed * multiplier * state.throttle * state.approach;

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

    refineDetail(dt);

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
        : p.giant ? 'Landing unavailable — Gas giants lack a solid surface'
          : 'Nothing here will hold a ship.',
      distanceAu: state.position.distanceTo(body.position) / AU,
      altitude: altitudeOf(body),
      moon: body.moon,
      gravity: p.gravity ?? body.gravity,
    };
  }

  /**
   * STRETCH THE SYSTEM PAST YOU WHILE THE DRIVE IS RUNNING.
   *
   * "When warp animation starts, make all the existing stars/planets from the system you were in
   * quickly warp and stretch behind you as if you are moving forward quickly. The current star warp
   * effect is good, but the stationary planets in the background kills the mood."
   *
   * `k` is the drive's intensity, 0 to 1. Every body is pushed out along the line from the ship
   * through it — so whatever is ahead flies past and whatever is behind recedes — and stretched
   * along that same line, which is what a long exposure of something going past at speed looks
   * like. Nothing is destroyed: `releaseWarp()` puts every body back, and the placement pass
   * re-seats them on the next frame anyway.
   */
  function warpStretch(k = 0, forwardDir = null) {
    const push = 1 + k * 26;
    const stretch = 1 + k * 34;
    const dirV = forwardDir || heading();
    for (const b of [...bodies, STAR]) {
      const group = b.model?.group;
      if (!group) continue;
      if (!b._rest) b._rest = { scale: group.scale.clone() };
      if (k <= 0.001) {
        group.scale.copy(b._rest.scale);
        group.position.copy(b.position);
        continue;
      }
      tmp.copy(b.position).sub(state.position);
      const along = tmp.dot(dirV);
      // slide it away from the ship along its own line
      group.position.copy(state.position).addScaledVector(tmp, push);
      // …and smear it along the direction of travel
      group.scale.copy(b._rest.scale);
      group.scale.addScaledVector(new THREE.Vector3(Math.abs(dirV.x), Math.abs(dirV.y), Math.abs(dirV.z)), stretch * b._rest.scale.x);
      // anything behind us fades as it goes
      const mat = b.model.surface?.material || b.model.group.children[0]?.material;
      if (mat && 'opacity' in mat) {
        mat.transparent = true;
        mat.opacity = along < 0 ? Math.max(0, 1 - k * 1.4) : 1;
      }
    }
  }

  /** Put every body back where it belongs. */
  function releaseWarp() {
    for (const b of [...bodies, STAR]) {
      const group = b.model?.group;
      if (!group || !b._rest) continue;
      group.scale.copy(b._rest.scale);
      group.position.copy(b.position);
      const mat = b.model.surface?.material || group.children[0]?.material;
      if (mat && 'opacity' in mat) mat.opacity = 1;
      b._rest = null;
    }
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
      approach: state.approach,
      crowded: state.crowded,
      detail: near ? near.body.tier : 'far',
      canLand: !!canLand(),
    };
  }

  return {
    scene, bodies, ship, state, AU, EARTH,
    enter, update, nearest, canLand, landingSpot, readout, placeBodies,
    atmosphereEntry, refineDetail, throttleLimit, tierFor, slowZoneFor, warpBubbleFor, layout,
    warpStretch, releaseWarp,
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
