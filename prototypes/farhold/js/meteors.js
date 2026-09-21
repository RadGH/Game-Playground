// Farhold — something falls out of the sky.
//
//   "Add a chance every 5 minutes when on the surface of a meteorite spawning. It should be visible
//    on the map and visible in the sky with several particle effects as it slowly streaks through
//    the sky and crashes to the surface over 30 seconds. There should be a subtle alert about a
//    meteor landing and there should be some shooting stars too. Once they land they reveal a
//    Meteorite Chest which is like a random treasure chest, but with 1-3 higher quality items. They
//    should always spawn at least rare quality and have quality beams like chests. We should add
//    other type of random events later, this is just one idea."
//
// The thirty seconds are the whole point. A chest that simply appears is a chest; a chest you
// *watched arrive* is somewhere you decided to walk to, and by the time you get there you already
// know roughly how far it is and roughly what it is worth. So the fall is real: a body on a real arc
// from high in the sky to a real point on the map, trailing fire, with the impact where the map said
// it would be.
//
//   const sky = createMeteors({ scene, terrain, chests, balance });
//   sky.update(dt, player);            // rolls the chance, flies whatever is falling
//   sky.falling                        // [{ x, z, secondsLeft }] — the map draws these
//
// Shooting stars are the same machinery at a hundredth of the size: they streak and burn out
// without ever landing, which is what makes the real one read as an event rather than as scenery.

import * as THREE from 'three';

const DEFAULTS = {
  /**
   * Seconds between rolls, and the chance each roll fires.
   *
   * R15 — FIVE PER CENT OF WHAT IT WAS.
   *
   *   "For meteorise … make them about 5% chance of spawning from currently, there are too many."
   *
   * The arithmetic, so the next person can retune it without redoing it: a real fall came from two
   * places. This roll (0.6 every 300 s = 0.0020/s) and the shooting-star roll below, of which
   * `shootingRealChance` were real (0.4 x 0.4 every 90 s = 0.0018/s). About 0.0038 a second
   * together — one every four and a half minutes, which is why the sky was full of them.
   *
   * At 0.03 here and 0.02 there it is 0.00019/s: **one about every eighty-eight minutes**. That is
   * genuinely rare, which is the point — a meteor is meant to be the thing you drop what you are
   * doing for. Both numbers are in `balance.json` under `meteors` if it wants moving.
   */
  everySeconds: 300,
  chance: 0.03,
  /** How long the fall takes, start to impact. */
  fallSeconds: 30,
  /** Where it comes down, in metres from the player. Far enough to be a walk, near enough to find. */
  landRange: [220, 900],
  /** How high it starts. */
  startHeight: 2600,
  /**
   * Shooting stars: how often, and how long each lasts.
   *
   * R14 — THEY WERE WALLPAPER, AND THAT WAS THE PROBLEM.
   *
   * "I saw what looked like a shooting star, can you change it so that falling stars are actual
   *  events and leave behind a meteor with a special loot crate inside."
   *
   * One every 22 seconds at a 70% roll is a star roughly every half minute, all night, none of
   * which ever meant anything — so by the time a REAL fall crossed the sky there was no reason to
   * look up. Two changes: they are much rarer (a minute and a half between rolls at two in five),
   * and `shootingRealChance` of them are not decoration at all — the streak is the opening of a
   * real fall, which then lands where it was always going to. A star you see now is worth walking
   * toward, because two in five of them are.
   */
  shootingEvery: 90,
  shootingChance: 0.4,
  shootingSeconds: 1.6,
  /**
   * …and this share of those are the start of a real one. R15: 0.4 -> 0.02, see the note above.
   * The decorative stars keep their own rate: they are the sky, and the sky is free.
   */
  shootingRealChance: 0.02,
  /** How many items the chest holds, and the worst of them. */
  items: [1, 3],
  floor: 'rare',
};

const HEAD = new THREE.IcosahedronGeometry(1, 1);
const TRAIL = new THREE.ConeGeometry(1, 1, 6, 1, true);

/** One falling body: a glowing head, a tail behind it, and a few motes shedding off. */
function makeBody(scale = 1, colour = '#ffb066') {
  const group = new THREE.Group();
  const tint = new THREE.Color(colour);
  const headMat = new THREE.MeshBasicMaterial({ color: tint });
  const head = new THREE.Mesh(HEAD, headMat);
  head.scale.setScalar(scale);
  group.add(head);

  const tailMat = new THREE.MeshBasicMaterial({
    color: tint, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const tail = new THREE.Mesh(TRAIL, tailMat);
  tail.scale.set(scale * 1.6, scale * 26, scale * 1.6);
  group.add(tail);

  const motes = [];
  const moteMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(HEAD, moteMat);
    m.scale.setScalar(scale * 0.25);
    m.userData.phase = i * 1.05;
    group.add(m);
    motes.push(m);
  }
  return {
    group, head, tail, motes,
    dispose() { headMat.dispose(); tailMat.dispose(); moteMat.dispose(); },
  };
}

export function createMeteors(opts = {}) {
  const { scene, terrain, chests = null, rng = Math.random, onLand = null, onWarn = null } = opts;
  const cfg = { ...DEFAULTS, ...(opts.balance?.meteors || {}) };

  let sinceRoll = 0;
  let sinceShooting = 0;
  const falling = [];
  const shooting = [];

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();

  /**
   * Start one. `at` is where it will land; the entry point is picked up-range of that, so the streak
   * crosses the sky rather than dropping straight down like a lift.
   */
  function drop(x, z, { seconds = cfg.fallSeconds } = {}) {
    const [gx, gz] = terrain.clampToWorld(x, z);
    const ground = terrain.heightAt(gx, gz);
    const entryAngle = rng() * Math.PI * 2;
    const lateral = cfg.startHeight * 0.8;
    const body = makeBody(2.4, '#ff9a4a');
    scene.add(body.group);
    const meteor = {
      x: gx, z: gz, ground,
      // R14: the crate's key is settled at DROP time, not at landing, because the quest that tracks
      // this fall is created thirty seconds before there is a crate to key it against.
      chestKey: `meteor:${Math.round(gx)},${Math.round(gz)}`,
      from: [gx + Math.cos(entryAngle) * lateral, ground + cfg.startHeight, gz + Math.sin(entryAngle) * lateral],
      body, t: 0, seconds, landed: false,
    };
    falling.push(meteor);
    onWarn?.(meteor);
    return meteor;
  }

  /** A streak that never lands. Purely for the sky. */
  function shootingStar() {
    const body = makeBody(0.35, '#dfe9ff');
    scene.add(body.group);
    const a = rng() * Math.PI * 2;
    const at = rng() * Math.PI * 2;
    const r = 900 + rng() * 600;
    const star = {
      body, t: 0, seconds: cfg.shootingSeconds,
      from: [Math.cos(a) * r, 700 + rng() * 500, Math.sin(a) * r],
      to: [Math.cos(at) * r * 0.5, 420 + rng() * 260, Math.sin(at) * r * 0.5],
    };
    shooting.push(star);
    return star;
  }

  /** Put the chest down where it hit. */
  function land(meteor) {
    meteor.landed = true;
    scene.remove(meteor.body.group);
    meteor.body.dispose();
    const chest = chests?.place?.('meteorite', meteor.x, meteor.z, { key: meteor.chestKey });
    onLand?.(meteor, chest);
    return chest;
  }

  function update(dt, player = null) {
    // ---- the roll
    sinceRoll += dt;
    if (sinceRoll >= cfg.everySeconds) {
      sinceRoll = 0;
      if (player && rng() < cfg.chance) {
        const a = rng() * Math.PI * 2;
        const [lo, hi] = cfg.landRange;
        const d = lo + rng() * (hi - lo);
        drop(player.x + Math.cos(a) * d, player.z + Math.sin(a) * d);
      }
    }

    // ---- shooting stars. Most are decoration; some are the first second of a real fall.
    sinceShooting += dt;
    if (sinceShooting >= cfg.shootingEvery) {
      sinceShooting = 0;
      if (rng() < (cfg.shootingChance ?? 0.4)) {
        if (player && rng() < (cfg.shootingRealChance ?? 0.4)) {
          // a real one, announced the same way the five-minute roll announces its own
          const a = rng() * Math.PI * 2;
          const [lo, hi] = cfg.landRange;
          const d = lo + rng() * (hi - lo);
          drop(player.x + Math.cos(a) * d, player.z + Math.sin(a) * d);
        } else shootingStar();
      }
    }

    // ---- fly whatever is in the air
    for (let i = falling.length - 1; i >= 0; i--) {
      const m = falling[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.seconds);
      // ease IN: it is barely moving at the top of the sky and comes down hard at the end, which is
      // what makes thirty seconds feel like a fall rather than a slow lift
      const e = k * k;
      const x = m.from[0] + (m.x - m.from[0]) * e;
      const y = m.from[1] + (m.ground - m.from[1]) * e;
      const z = m.from[2] + (m.z - m.from[2]) * e;
      m.body.group.position.set(x, y, z);
      dir.set(m.x - x, m.ground - y, m.z - z).normalize();
      m.body.group.quaternion.setFromUnitVectors(up, dir.clone().negate());
      for (const mote of m.body.motes) {
        const p = mote.userData.phase + m.t * 3;
        mote.position.set(Math.cos(p) * 2.5, 6 + (p % 6), Math.sin(p) * 2.5);
      }
      m.altitude = y - m.ground;
      m.secondsLeft = Math.max(0, m.seconds - m.t);
      if (k >= 1) { land(m); falling.splice(i, 1); }
    }

    for (let i = shooting.length - 1; i >= 0; i--) {
      const s = shooting[i];
      s.t += dt;
      const k = Math.min(1, s.t / s.seconds);
      const px = player?.x || 0, pz = player?.z || 0;
      s.body.group.position.set(
        px + s.from[0] + (s.to[0] - s.from[0]) * k,
        s.from[1] + (s.to[1] - s.from[1]) * k,
        pz + s.from[2] + (s.to[2] - s.from[2]) * k,
      );
      dir.set(s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]).normalize();
      s.body.group.quaternion.setFromUnitVectors(up, dir.clone().negate());
      s.body.tail.material.opacity = 0.5 * (1 - k);
      s.body.head.material.opacity = 1 - k;
      if (k >= 1) { scene.remove(s.body.group); s.body.dispose(); shooting.splice(i, 1); }
    }
  }

  return {
    cfg, falling, shooting,
    update, drop, shootingStar,
    /** What the map and the minimap draw: where each one will land, and how long you have. */
    marks() {
      return falling.map(m => ({
        x: m.x, z: m.z, kind: 'meteor',
        secondsLeft: Math.round(m.secondsLeft ?? m.seconds),
        altitude: Math.round(m.altitude ?? 0),
      }));
    },
    clear() {
      for (const m of falling) { scene.remove(m.body.group); m.body.dispose(); }
      for (const s of shooting) { scene.remove(s.body.group); s.body.dispose(); }
      falling.length = 0; shooting.length = 0;
    },
    dispose() { this.clear(); },
  };
}
