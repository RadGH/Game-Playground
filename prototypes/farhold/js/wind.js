// Farhold round 23 — THE WIND, from one place.
//
// Pure: no Three.js, no DOM.
//
//   const wind = createWind({ seed });
//   wind.update(dt, blended.wind);        // once a frame, from the weather's own 0..1 wind
//   rainVelocity(wind, 30)                // what the rain streaks do
//   snowDrift(wind), debrisVelocity(wind) // what the flakes and the blown leaves do
//   cloudDrift(wind)                      // which way the cloud deck scrolls
//   swayUniforms(wind)                    // what the trees, the bushes and the grass bend to
//
// Before this round the weather had a wind STRENGTH and no direction: the rain slanted along +x, the
// dust blew along +x, the cloud texture scrolled along its own u axis (which on a dome is round the
// zenith, not across the sky) and the trees did not move at all. Four consumers, four directions,
// none of them agreeing. Everything that moves in the wind now asks this object, and each consumer
// is a small pure function here so a test can turn the wind round and ask every one of them.
//
// The direction wanders slowly on its own (a couple of long sines seeded by the world, so two worlds
// do not blow the same way), and the strength chases the weather's number rather than jumping to it,
// so a storm rolls in rather than switching on. `gust` is a 0..1 swell on top, shared by everything,
// so a gust bends the grass, leans the rain and throws the leaves in the same moment.

const TAU = Math.PI * 2;

function hash01(seed, salt) {
  let h = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createWind({ seed = 1 } = {}) {
  const base = hash01(seed, 1) * TAU;
  const ph1 = hash01(seed, 2) * TAU, ph2 = hash01(seed, 3) * TAU, ph3 = hash01(seed, 4) * TAU;
  const w = {
    /** radians; 0 blows toward +x, PI/2 toward +z */
    angle: base,
    dirX: Math.cos(base), dirZ: Math.sin(base),
    /** 0..1, smoothed toward the weather's own wind */
    strength: 0,
    /** 0..1 swell, shared by every consumer */
    gust: 0.5,
    /** seconds of wind clock — the phase every sway and flutter runs on */
    time: 0,
    /** set by `set()`: a debug or test override that the drift does not touch */
    locked: null,

    update(dt = 0, target = 0) {
      const d = Math.max(0, Math.min(0.25, dt));
      w.time += d;
      const t = w.time;
      if (w.locked?.angle != null) w.angle = w.locked.angle;
      else w.angle = base + 0.55 * Math.sin(t * 0.0105 + ph1) + 0.22 * Math.sin(t * 0.037 + ph2);
      w.dirX = Math.cos(w.angle); w.dirZ = Math.sin(w.angle);
      const want = w.locked?.strength != null ? w.locked.strength : Math.max(0, Math.min(1, target));
      // a few seconds to follow the weather — fast enough that a storm arriving is felt
      if (w.locked?.strength != null) w.strength = want;
      else w.strength += (want - w.strength) * Math.min(1, d * 0.6);
      const g = 0.5 + 0.5 * Math.sin(t * 0.43 + ph3) * Math.sin(t * 0.13 + ph1);
      w.gust = Math.max(0, Math.min(1, g * (0.4 + w.strength * 0.6) + (1 - w.strength) * 0.2));
      return w;
    },

    /** Hold the wind: `{ angle, strength }` (either may be omitted). `set(null)` lets it go. */
    set(v) {
      if (!v) { w.locked = null; return w; }
      w.locked = { ...(w.locked || {}), ...v };
      if (v.angle != null) { w.angle = v.angle; w.dirX = Math.cos(v.angle); w.dirZ = Math.sin(v.angle); }
      if (v.strength != null) w.strength = Math.max(0, Math.min(1, v.strength));
      return w;
    },
  };
  return w;
}

// ---------------------------------------------------------------- the consumers

/** Rain: metres a second. It leans downwind by as much as a third of its fall in a gale. */
export function rainVelocity(wind, fall = 30) {
  const push = wind.strength * (6 + wind.gust * 6);
  return { x: wind.dirX * push, y: -fall, z: wind.dirZ * push };
}

/** Snow: sideways metres a second. Flakes are light, so the wind moves them much more than rain. */
export function snowDrift(wind) {
  const push = 0.35 + wind.strength * (3.5 + wind.gust * 3);
  return { x: wind.dirX * push, z: wind.dirZ * push };
}

/** Blown leaves, dust and spindrift: metres a second along the ground. */
export function debrisVelocity(wind) {
  const push = 1.5 + wind.strength * (8 + wind.gust * 6);
  return { x: wind.dirX * push, z: wind.dirZ * push };
}

/**
 * The cloud deck: how far its pattern moves, in deck units a second, downwind. The deck is drawn as
 * a flat sheet projected onto the dome (js/weather.js), so this really is a direction across the sky.
 */
export function cloudDrift(wind) {
  const push = 0.0025 + wind.strength * 0.012;
  return { u: wind.dirX * push, v: wind.dirZ * push };
}

/**
 * What the vertex sway reads. `amount` is 0..1 and is the lean; `gust` and `time` drive the flutter.
 * js/atmosphere.js copies these into the shared shader uniforms every frame.
 */
export function swayUniforms(wind) {
  return {
    dirX: wind.dirX, dirZ: wind.dirZ,
    amount: 0.12 + wind.strength * 0.88,
    gust: wind.gust,
    time: wind.time,
  };
}
