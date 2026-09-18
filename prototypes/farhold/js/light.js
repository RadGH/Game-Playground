// Farhold — light in the dark.
//
// The problem this fixes: night looked good and was unplayable. `js/sky.js` drops the sun light and
// the hemisphere light to near nothing after dusk, which is correct, and left the player walking
// into trees they could not see. So:
//
//   * **every character starts with a torch** and it is a real light, not a glow sprite — a wide,
//     warm point light that reaches far enough to walk by (34 m by default, which is deliberately
//     generous: the user asked for "effective, lighting up a large area").
//   * **world light sources** — braziers, camp fires, town lanterns, dungeon sconces, warded
//     chests — hand this module a position and it lights the nearest handful.
//   * **a floor under the ambient** so a moonless night is dim rather than black.
//
// Point lights are not free with Lambert materials: every light is another term in every vertex
// shader for every lit object. So there is a fixed **pool** of them (`balance.light.maxLights`),
// they are recycled, and only the nearest sources get one. Everything else is just geometry that
// happens to be painted bright, which reads fine at distance.
//
//   const light = createLight(scene, { balance });
//   light.setTorch(true);
//   light.setSources([{ x, y, z, color, range, intensity }]);
//   light.update(dt, { x, y, z }, { day, indoors });

import * as THREE from 'three';

/**
 * How far past its useful range a light's cutoff is pushed.
 *
 * A Three.js point light with a `distance` set does not simply stop there: it multiplies its
 * falloff by `(1 - (d/distance)^4)^2`, which holds nearly full brightness most of the way out and
 * then dumps the rest over the last fifth. On flat ground that last fifth is a crisp yellow ring,
 * and the torch read as a spotlight aimed at the floor rather than as a flame. So the cutoff goes
 * out past anything you can see and the DECAY does the fading instead — by the time the hard edge
 * arrives the light is a fortieth of what it was, so there is no edge left to see.
 */
const SOFT_EDGE = 2.2;

/**
 * WHY A BETTER LAMP DID NOT LOOK BETTER — and the fix.
 *
 *   "I bought a different light and a different mount, but there is no noticeable difference.
 *    Upgraded lamps must be SIGNIFICANTLY better — the light radius is dreadfully low right now."
 *
 * The three lights differed only in `distance`, which with a decay term is almost the WRONG knob:
 * a point light's brightness at `d` metres is roughly `intensity / d^decay`, and `distance` only
 * decides where the window cuts it off. At decay 1.4 a torch of intensity 3.2 is putting 0.018 on
 * the ground at forty metres — nothing you could see — so a Wisp Lamp with twice the cutoff and a
 * tenth more intensity lit almost exactly the same circle as a Pitch Torch. That is the whole of
 * "the difference is not there".
 *
 * So the RANGE now drives the brightness as well as the cutoff. `intensity` is multiplied by
 * `(range / REFERENCE_RANGE)^DECAY`, which makes every light the same brightness at its own edge
 * and much brighter than the last one everywhere inside it: at twenty metres the Wisp Lamp throws
 * about four times what the torch does. A lower decay on top of that keeps the pool wide and even
 * instead of a bright ring around your feet.
 */
const DECAY = 1.05;
/** The range the configured `intensity` is written for — the starting torch. */
const REFERENCE_RANGE = 40;

/** How bright a light of this reach has to be to read at its own edge. */
export function intensityFor(baseIntensity, range) {
  const r = Math.max(1, range || REFERENCE_RANGE);
  return baseIntensity * Math.pow(r / REFERENCE_RANGE, DECAY);
}

/** ~6 Hz, in radians a second: fast enough to read as a flame, slow enough not to strobe. */
const TORCH_HZ = Math.PI * 2 * 6;

export function createLight(scene, { balance = {} } = {}) {
  const cfg = balance.light || {};
  const torchCfg = cfg.torch || {};
  const maxLights = cfg.maxLights ?? 10;

  // ---- the torch: one light that rides with the player
  const torch = new THREE.PointLight(
    new THREE.Color(torchCfg.color || '#ffb060'),
    0,
    (torchCfg.range ?? REFERENCE_RANGE) * SOFT_EDGE,
    DECAY,                                 // gentle falloff: a torch that dies at 3 m is a candle
  );
  torch.name = 'farhold-torch';
  scene.add(torch);

  // ---- the pool: world sources borrow one of these
  const pool = [];
  for (let i = 0; i < maxLights; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 20 * SOFT_EDGE, DECAY);
    l.name = 'farhold-light-' + i;
    l.visible = false;
    scene.add(l);
    pool.push(l);
  }

  let sources = [];
  let torchOn = false;
  let flicker = 0;                          // the slow wobble every world source shares
  let torchPhase = 0;                       // the torch's own, much faster — a flame, not a lantern
  let indoors = false;
  let nightFloor = cfg.ambientNight ?? 0.16;

  /**
   * Hand over every light source in the world right now. Cheap to call every frame — it only
   * stores the list; the sorting happens in `update`, against the player's actual position.
   */
  function setSources(list) { sources = list || []; }

  /** Is the player carrying a lit torch? */
  function setTorch(on) {
    torchOn = !!on;
    if (!on) torch.intensity = 0;
  }

  /**
   * How far the carried light reaches — a better lantern in the light slot lights more ground, and
   * (see `intensityFor`) throws a good deal more light inside that ground as well.
   *
   * `js/main.js` calls this every frame with `player.equipment.light.range`, and `rpg.refresh` now
   * writes the affix and perk total back onto that item, so "+12 more metres of ground" reaches
   * here instead of sitting on the character sheet.
   */
  let torchRange = torchCfg.range ?? REFERENCE_RANGE;
  function setRange(metres) { torchRange = metres || (torchCfg.range ?? REFERENCE_RANGE); }

  /**
   * One frame. `at` is where the player is; `day` is 0 at midnight and 1 at noon (sky.dayFraction
   * shaped by the caller), used to decide how much the torch needs to do.
   */
  function update(dt, at, { day = 1, inside = false, ambient = null } = {}) {
    indoors = inside;
    flicker += dt * 9;
    torchPhase += dt * TORCH_HZ;

    if (torchOn) {
      // The torch fades out in full daylight — carrying a light at noon should not wash the world
      // out — and comes fully up as the sun goes. Inside, it is always at full.
      const need = inside ? 1 : Math.max(0, 1 - Math.max(0, day) * 1.25);
      // A flame is never steady. Two sines at an untidy ratio so the wobble never settles into a
      // pulse you can count; the config's `flicker` is the peak-to-peak swing, so 0.16 is ±8%.
      const amp = (torchCfg.flicker ?? 0.16) * 0.5;
      const wobble = 1 + (Math.sin(torchPhase) * 0.6 + Math.sin(torchPhase * 1.7 + 1.3) * 0.4) * amp;
      torch.intensity = intensityFor(torchCfg.intensity ?? 3.2, torchRange) * need * wobble;
      torch.distance = torchRange * SOFT_EDGE;
      torch.position.set(at.x, at.y + (torchCfg.height ?? 1.55), at.z);
    } else {
      torch.intensity = 0;
    }

    // the nearest sources get a light each
    const near = sources
      .map(s => ({ s, d: (s.x - at.x) ** 2 + (s.z - at.z) ** 2 }))
      .filter(o => o.d < 260 * 260)
      .sort((a, b) => a.d - b.d)
      .slice(0, maxLights);

    for (let i = 0; i < pool.length; i++) {
      const l = pool[i];
      const hit = near[i];
      if (!hit) { l.visible = false; l.intensity = 0; continue; }
      const s = hit.s;
      l.visible = true;
      l.color.set(s.color || '#ff9040');
      l.distance = (s.range ?? 24) * SOFT_EDGE;    // same hard ring as the torch, same fix
      l.position.set(s.x, s.y, s.z);
      const wob = s.flicker === false ? 1 : 1 + Math.sin(flicker * 1.3 + i * 2.1) * 0.12;
      // fade a source out as it gets near the edge of the pool's reach, so nothing pops on
      const fade = 1 - Math.min(1, Math.sqrt(hit.d) / 240);
      const dayFade = inside ? 1 : Math.max(0.15, 1 - Math.max(0, day));
      // world sources get the same treatment, so a big brazier reads as a big brazier
      l.intensity = intensityFor(s.intensity ?? 2, s.range ?? 24) * wob * fade * dayFade;
    }

    // the ambient floor: a moonless night should be dim, not black
    if (ambient) {
      /**
       * Underground the floor was 0.05 — the same torch that throws a twenty-metre pool outdoors lit
       * about four metres, and you could not tell a doorway from a wall. The dark should come from
       * the COLOUR, not from the player being unable to see, so the floor is high enough to read
       * geometry by and the light it lets through is a cold blue-grey.
       */
      const floor = inside ? (cfg.dungeonAmbient ?? 0.17) : nightFloor;
      if (inside && cfg.dungeonAmbientColor) ambient.color.set(cfg.dungeonAmbientColor);
      if (ambient.intensity < floor) ambient.intensity = floor;
    }
  }

  function dispose() {
    scene.remove(torch);
    for (const l of pool) scene.remove(l);
  }

  /**
   * THE SHIP'S LANDING LIGHTS.
   *
   * "When flying around in the surface, let's add spotlights that can be toggled on." Two real
   * SpotLights on the hull rather than a brighter point light, because the whole value of a landing
   * light is the CONE — you want to see the strip of ground you are about to put down on, not a
   * uniform glow that washes the night out. They are parented to nothing and moved by the caller
   * each frame, which is how everything else in this module works.
   */
  const spots = [];
  for (let i = 0; i < 2; i++) {
    const l = new THREE.SpotLight(
      new THREE.Color(cfg.spot?.color || '#eaf2ff'),
      0,
      cfg.spot?.range ?? 220,
      cfg.spot?.angle ?? 0.42,
      cfg.spot?.blur ?? 0.55,
      1.1,
    );
    l.name = 'farhold-spot-' + i;
    l.visible = false;
    scene.add(l);
    scene.add(l.target);
    spots.push(l);
  }
  let spotsOn = false;

  /** Turn the landing lights on or off. */
  function setSpots(on) {
    spotsOn = !!on;
    for (const l of spots) { l.visible = spotsOn; l.intensity = spotsOn ? (cfg.spot?.intensity ?? 9) : 0; }
  }

  /**
   * Put the cones where the ship is, aimed where it is going and a little down.
   *
   * `at` is the hull, `yaw` where the nose points. The two lamps sit either side of the centreline
   * so the lit ground reads as two overlapping ovals rather than one circle, which is what makes it
   * look like a machine rather than a torch.
   */
  function aimSpots(at, yaw, pitch = -0.35) {
    if (!spotsOn || !at) return;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = fz, rz = -fx;                       // the hull's right, for the lamp spacing
    const spread = cfg.spot?.spread ?? 2.6;
    const reach = cfg.spot?.reach ?? 90;
    spots.forEach((l, i) => {
      const side = i === 0 ? -1 : 1;
      l.position.set(at.x + rx * spread * side, at.y - 0.6, at.z + rz * spread * side);
      l.target.position.set(
        at.x + fx * reach + rx * spread * side,
        at.y - 0.6 + Math.sin(pitch) * reach,
        at.z + fz * reach + rz * spread * side,
      );
      l.target.updateMatrixWorld();
    });
  }

  return {
    torch, pool, setSources, setTorch, setRange, update, dispose,
    spots, setSpots, aimSpots,
    get spotsOn() { return spotsOn; },
    get torchOn() { return torchOn; },
    get indoors() { return indoors; },
    setNightFloor: v => { nightFloor = v; },
    stats: () => ({ torch: torchOn, spots: spotsOn, lit: pool.filter(l => l.visible).length, sources: sources.length }),
  };
}

/**
 * The starting mount. A horse used to be a key you pressed; it is a thing you own now, so it can be
 * lost, replaced by something better, and shown on the character sheet with everything else.
 */
export const STARTER_MOUNT = {
  id: 'mount_start',
  baseKey: 'trail_horse',
  name: 'Trail Horse',
  baseName: 'Trail Horse',
  type: 'accessory',
  subtype: 'mount',
  slot: 'mount',
  rarity: 'normal',
  quality: 'medium',
  affixes: [],
  mount: { creature: 'horse', size: 1.25, speed: 2.1, jump: 1.5 },
  lore: 'Patient, unremarkable, and faster than your own legs. H to get on it.',
};

/**
 * The starting torch, as a real item. It has its own **light slot** — putting it in the off hand
 * meant choosing between seeing at night and carrying a shield — and the Chibi 2 body's `torch`
 * off-hand part still draws it, so you can see it burning in your character's hand.
 */
export const STARTER_TORCH = {
  id: 'torch_start',
  baseKey: 'torch',
  name: 'Pitch Torch',
  baseName: 'Pitch Torch',
  type: 'accessory',
  subtype: 'torch',
  slot: 'light',
  rarity: 'normal',
  quality: 'medium',
  affixes: [],
  look: { offhand: 'torch', color: '#c08040' },
  light: true,
  range: 40,
  lore: 'Rag, pitch and a stick. It will not win a fight, but you can see the fight coming.',
};
