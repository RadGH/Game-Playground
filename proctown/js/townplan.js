// Procedural Towns — the planner.
//
// THIS MODULE IS THE ONE TRUE TOWN PLANNER. `prototypes/farhold/` imports it, so tuning a town in
// this experiment tunes the town in the game. It is pure arithmetic with no Three.js and no DOM, so
// `node --test` can check it and the 2D canvas and the 3D game can both draw the same plan.
//
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS
//
// Farhold's old planner (`prototypes/farhold/js/town-plan.js`, 89 lines) fired 2-6 straight-ish
// spokes out of a central square and dropped buildings along them. That produced, in the user's
// words: "Houses sitting on roads. Some roofs don't line up with the walls. Alleyway roads clip
// beneath the surface texture. All the towns look and feel the same, and they don't feel anything
// at all natural."
//
// Every one of those is downstream of the same thing: a building was placed at a COORDINATE, and a
// street was drawn at a COORDINATE, and nothing reconciled the two.
//
// So the unit here is the PLOT, not the building:
//
//   footprint -> blocks (recursive split, the cuts BECOME the streets)
//             -> plots  (each block divided, each plot knowing which edge fronts a street)
//             -> a building fitted INSIDE its plot, facing its frontage
//
// A house cannot sit on a road because a road is not a plot. That is the whole idea, and it is why
// `noOverlap()` below can be a hard assertion rather than a hopeful one.
//
// ---------------------------------------------------------------------------------------------
//   import { planTown, CULTURES } from './townplan.js';
//   const plan = planTown({ seed: 7, size: 4, culture: 'human' });
//   plan.streets  [{ a:[x,z], b:[x,z], cls, width }]
//   plan.plots    [{ poly, cx, cz, w, d, facing, district, want }]
//   plan.square   { cx, cz, r }
//   plan.wall     { poly, gates:[{ x, z, angle, road }] }

// ---------------------------------------------------------------------------- seeded arithmetic

/**
 * A small deterministic generator.
 *
 * Every number in a plan comes from here, keyed off `(worldSeed, settlementId)`, so a town is the
 * same town every time you walk back into it and nothing has to be stored.
 */
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------- street classes

/**
 * Four widths, four surfaces, four rules about what may front onto them.
 *
 * `depth` is how deep into the recursive split a cut was made: the first cuts across the whole town
 * are the main streets, and by the time the blocks are small the cuts are alleys. That is also the
 * natural hierarchy — a street is important because it is long and it came first.
 */
export const STREET_CLASSES = [
  { cls: 'main',  width: 5.0, setback: 2.0, surface: 'paved' },
  { cls: 'lane',  width: 3.2, setback: 1.0, surface: 'cobble' },
  { cls: 'alley', width: 2.2, setback: 0.4, surface: 'dirt' },
];
const classForDepth = d => STREET_CLASSES[Math.min(d, STREET_CLASSES.length - 1)];

// ---------------------------------------------------------------------------- cultures

/**
 * A culture is a PARAMETER SET, not a second generator.
 *
 * Everything that makes an elf town an elf town is in here: how straight its streets are, how big
 * its plots are, what its wall is made of, and which buildings it would not be itself without. The
 * generator below does not know what an elf is.
 */
export const CULTURES = {
  human: {
    name: 'Human', grammar: 'grown', jitter: 0.30, blockMin: 8, blockMax: 13,
    plotMin: 5, storeys: [1, 3], wall: 'stone', street: 'cobble',
    cornerstones: ['guildhall', 'market_cross'],
  },
  elf: {
    name: 'Elf', grammar: 'grown', jitter: 0.55, blockMin: 9, blockMax: 16,
    plotMin: 6, storeys: [2, 4], wall: 'hedge', street: 'root',
    cornerstones: ['canopy_hall', 'spiral_stair'],
  },
  dwarf: {
    name: 'Dwarf', grammar: 'planned', jitter: 0.04, blockMin: 14, blockMax: 23,
    plotMin: 8, storeys: [1, 2], wall: 'cutstone', street: 'flag',
    cornerstones: ['great_gate', 'forge_hall'],
  },
  undead: {
    name: 'Undead', grammar: 'grown', jitter: 0.42, blockMin: 8, blockMax: 13,
    plotMin: 5, storeys: [1, 3], wall: 'bone', street: 'bone',
    cornerstones: ['bone_spire', 'necropolis_row'],
  },
  orc: {
    name: 'Orc', grammar: 'sprawl', jitter: 0.70, blockMin: 8, blockMax: 14,
    plotMin: 5, storeys: [1, 2], wall: 'palisade', street: 'dirt',
    cornerstones: ['war_hall', 'totem_field'],
  },
  halfling: {
    name: 'Halfling', grammar: 'grown', jitter: 0.48, blockMin: 8, blockMax: 14,
    plotMin: 5, storeys: [1, 1], wall: 'hedge', street: 'dirt',
    cornerstones: ['burrow_row', 'party_tree'],
  },
  desert: {
    name: 'Desert', grammar: 'planned', jitter: 0.16, blockMin: 13, blockMax: 22,
    plotMin: 7, storeys: [1, 3], wall: 'mudbrick', street: 'sand',
    cornerstones: ['bazaar', 'windcatcher'],
  },
};

/**
 * Which culture a settlement builds in.
 *
 * World Forge already gives every settlement a `race` (Name Forge has twelve) and a `biome`, so
 * nothing new has to be invented or stored — a town's look falls out of who lives there and where.
 * The four races with no culture of their own borrow the one they build most like: gnomes and
 * dragons hoard and cut stone, so they build like dwarves; giants, trolls and goblins throw a place
 * up out of what is to hand, so they sprawl like orcs; fey grow theirs like elves.
 *
 * The exception is the ground: anyone living in sand builds for shade, whatever their ancestry, so
 * a desert biome overrides the race for the cultures that have no strong tradition of their own.
 */
export const CULTURE_FOR_RACE = {
  human: 'human', elf: 'elf', fey: 'elf',
  dwarf: 'dwarf', gnome: 'dwarf', dragon: 'dwarf',
  halfling: 'halfling', undead: 'undead',
  orc: 'orc', giant: 'orc', troll: 'orc', goblin: 'orc',
};

/** Deserts are built for shade before they are built for anybody's ancestry. */
const DESERT_BIOMES = ['desert', 'dunes', 'badlands', 'sand', 'arid', 'wasteland'];

export function cultureFor({ race = 'human', biome = '' } = {}) {
  const base = CULTURE_FOR_RACE[String(race).toLowerCase()] || 'human';
  const dry = DESERT_BIOMES.some(b => String(biome).toLowerCase().includes(b));
  // a dwarf still cuts stone in a desert; a human or a halfling builds a shaded courtyard
  if (dry && (base === 'human' || base === 'halfling')) return 'desert';
  return base;
}

/** What a settlement of this size wants, in the order it gets built. */
export const WANT_ORDER = [
  'hall', 'forge', 'inn', 'market', 'granary', 'chapel', 'stable',
  'warehouse', 'barracks', 'mill', 'watchpost', 'shrine',
];

/** The smallest settlement size that wants each thing. */
export const WANT_FROM = {
  hall: 3, forge: 2, inn: 2, market: 2, granary: 1, chapel: 3,
  stable: 2, warehouse: 3, barracks: 4, mill: 2, watchpost: 3, shrine: 0,
};

/**
 * WHAT KIND OF EDGE A SETTLEMENT OF THIS SIZE HAS: `'none'`, `'low'` or `'wall'`.
 *
 * R27 — "size >= 4 means a wall" was written out in six places (this file, and five in Farhold),
 * and six copies of one rule is six chances for them to disagree. This is the one copy; Farhold's
 * js/town-plan.js re-exports it. `'low'` (a fence, a ring of boundary stones) is reserved for the
 * smaller settlements and is decoration only — it never changes `walled`.
 */
export function wallTier(size = 1) {
  return size >= 4 ? 'wall' : 'none';
}

/** How wide a settlement's footprint is, which is also where its quiet ground starts. */
export function footprintOf(size = 1) {
  const ring = 16 + size * 13;
  const walled = wallTier(size) === 'wall';
  const wall = walled ? ring + 14 : ring;
  return { ring, wall, walled };
}

// ---------------------------------------------------------------------------- oriented boxes
//
// Everything below works in a block's OWN frame rather than the world's.
//
// The first version of this planner split axis-aligned rectangles, which meant every culture came
// out as a rectangular grid however the knobs were set — and the user spotted it immediately: "each
// town looks structurally the same even though elves are supposed to follow the terrain and have
// natural paths, is that just an abstraction?" It was not an abstraction. `grammar` was written in
// seven places and read in none, and `jitter` could only move WHERE an axis-aligned cut fell, never
// which way it pointed. A grid with the cuts in different places is still a grid.
//
// So a block now carries an ANGLE, splits happen along its own axes, and a child may inherit a
// slightly different angle from its parent. Three or four generations of small drift is what turns a
// grid into a street plan that looks like it grew.

/** The world-space corners of an oriented box, clockwise from its local (-,-). */
export function corners(b) {
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  const hw = b.w / 2, hd = b.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
    .map(([lx, lz]) => [b.cx + lx * c - lz * s, b.cz + lx * s + lz * c]);
}

/** Separating-axis test between two oriented boxes. */
function obbOverlap(a, b, tol = 0) {
  const A = corners(a), B = corners(b);
  for (const [p, q] of [[A, B], [B, A]]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % 4];
      // the outward normal of this edge
      let nx = -(z2 - z1), nz = x2 - x1;
      const len = Math.hypot(nx, nz) || 1;
      nx /= len; nz /= len;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const [x, z] of p) { const d = x * nx + z * nz; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
      for (const [x, z] of q) { const d = x * nx + z * nz; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
      if (aMax - tol <= bMin || bMax - tol <= aMin) return false;    // a gap on this axis: no overlap
    }
  }
  return true;
}

/** A street segment as an oriented box, so one overlap routine covers everything. */
function segmentBox(a, b, width) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  return {
    cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2,
    w: Math.hypot(dx, dz), d: width, angle: Math.atan2(dz, dx),
  };
}

// ---------------------------------------------------------------------------- the ground

/**
 * A stand-in heightfield, so "follows the terrain" can be seen on this page.
 *
 * Farhold passes its real `terrain.heightAt`; the experiment needs SOMETHING to follow or the elf
 * grammar cannot be judged. Three octaves of cheap trig is plenty to produce ridges and valleys with
 * a believable gradient.
 */
export function demoTerrain(seed = 1) {
  const o = (seed % 97) * 0.37;
  return (x, z) => (
    Math.sin(x * 0.026 + o) * Math.cos(z * 0.021 - o) * 9 +
    Math.sin(x * 0.055 - o) * Math.cos(z * 0.049 + o) * 4 +
    Math.sin((x + z) * 0.012 + o) * 6
  );
}

/** Which way the ground runs level here — the direction a lazy path would take. */
function contourAngle(height, x, z, step = 4) {
  const gx = height(x + step, z) - height(x - step, z);
  const gz = height(x, z + step) - height(x, z - step);
  if (!gx && !gz) return null;
  // the contour is perpendicular to the gradient
  return Math.atan2(gx, -gz);
}

// ---------------------------------------------------------------------------- the split

/**
 * Cut a block in two, and the CUT IS A STREET.
 *
 * The cut is made along one of the block's OWN axes, so a block that sits at an angle produces
 * streets at that angle. What each grammar does with that:
 *
 *   planned  no drift at all. The child keeps the parent's angle, the cut lands at the middle, and
 *            the result is a rigid grid — which is exactly a dwarf town.
 *   grown    a little drift per generation, biased toward the contour of the ground, and the street
 *            is bowed rather than straight. Three or four generations of that and nothing is
 *            parallel to anything. This is the human, elf, undead and halfling case.
 *   sprawl   heavy drift, lopsided cuts, no contour discipline. Orcs build where there is room.
 */
function splitBlock(block, depth, rng, cfg, out, height) {
  const { blockMin, blockMax, jitter, grammar } = cfg;
  const longest = Math.max(block.w, block.d);

  /**
   * The depth cap has to clear the biggest town, or every size above a point is the same town.
   *
   * At 8 a dwarf settlement stopped subdividing before it had used its ring, and sizes 2, 3, 4 and 5
   * all came out with exactly 31 plots — the size slider did nothing above a hamlet. A city's ring
   * is 94 m and its blocks are 23, which needs ten halvings to reach.
   */
  if (longest <= blockMax || depth > 11) {
    if (block.w >= blockMin * 0.6 && block.d >= blockMin * 0.6) out.blocks.push({ ...block, depth });
    return;
  }

  const along = block.w >= block.d ? 'w' : 'd';
  const street = classForDepth(depth);
  const span = block[along];
  const t = 0.5 + (rng() - 0.5) * jitter;
  const at = span * Math.max(0.25, Math.min(0.75, t)) - span / 2;   // offset from the centre

  const c = Math.cos(block.angle), sn = Math.sin(block.angle);
  const toWorld = (lx, lz) => [block.cx + lx * c - lz * sn, block.cz + lx * sn + lz * c];

  /**
   * How far a child may swing away from its parent.
   *
   * This is the number that decides whether a culture reads as planned or grown. It stays small on
   * purpose: a big swing makes neighbouring blocks scissor into each other, and the fix below costs
   * floor area, so every degree is paid for.
   */
  /**
   * ...and only for the first few generations.
   *
   * The shrink below costs floor area every time a child turns, and it COMPOUNDS: eight generations
   * of a 13% loss leaves a third of the town, which is how an elf settlement ended up with four
   * buildings in it while a dwarf one had thirty-seven. The angles that a player actually reads are
   * the main streets and the lanes — the alleys inside a block are too short to tell. So the drift
   * is spent where it shows, on the first three cuts, and everything deeper stays square to its
   * parent and keeps its area.
   */
  const mayDrift = depth < 3;
  const drift = (grammar === 'planned' || !mayDrift) ? 0
    : grammar === 'sprawl' ? (rng() - 0.5) * 0.34
    : (rng() - 0.5) * 0.17;

  /**
   * ELVES FOLLOW THE GROUND.
   *
   * For a grown town the drift is pulled toward whichever way the land lies level. A street running
   * along a contour is the one a person would actually wear into a hillside, and it is the whole of
   * the difference between a plan that sits on the terrain and one that ignores it.
   */
  let bias = 0;
  if (height && grammar !== 'planned' && mayDrift) {
    const ang = contourAngle(height, block.cx, block.cz);
    if (ang != null) {
      const want = ang + (along === 'w' ? Math.PI / 2 : 0);
      const diff = ((want - block.angle + Math.PI * 1.5) % Math.PI) - Math.PI / 2;
      /**
       * Follow the ground, but do not chase it off a cliff.
       *
       * `diff` can be a quarter turn, and the shrink below charges floor area for every degree a
       * block turns — an unclamped terrain pull was swinging blocks 31 degrees and costing 85% of
       * the buildable area over three generations, which is why grown towns came out with a tenth
       * of the buildings a dwarf town had. Clamped, the street still visibly bends toward the
       * contour and the town still has houses in it.
       */
      const pull = diff * (cfg.followGround ?? 0.35);
      bias = Math.max(-0.11, Math.min(0.11, pull));
    }
  }

  /**
   * A bowed street needs its swing reserved before the blocks are cut.
   *
   * A grown street is a three-point polyline with the middle pushed sideways, because a straight
   * line between two points is a surveyor's road and people do not wear those. But the bow moves the
   * street INTO the ground either side of it, so the width taken out of the middle has to cover the
   * bow as well — otherwise the street curves straight through somebody's front room.
   */
  const bow = grammar === 'planned' ? 0
    : (rng() - 0.5) * (along === 'w' ? block.d : block.w) / 2 * (grammar === 'sprawl' ? 0.22 : 0.13);
  const half = street.width / 2 + Math.abs(bow);

  /**
   * A rotated child has to SHRINK to stay inside the slot it was given.
   *
   * This is the cost of `grammar` being real. A child that sits at an angle to its parent sweeps its
   * corners outside its own half of the parent, into its sibling — which is why the first version of
   * this, before the shrink, produced 81 overlaps on an elf town and 160 on an orc one. Rotating a
   * w x d box by theta needs a slot of (w|cos| + d|sin|) x (w|sin| + d|cos|), so the box is scaled
   * down until its rotated extent fits what it was allocated. Steeper angle, smaller building plot —
   * which is also true of real towns on awkward ground.
   */
  const fit = (w, d, theta) => {
    const ac = Math.abs(Math.cos(theta)), as = Math.abs(Math.sin(theta));
    const needW = w * ac + d * as, needD = w * as + d * ac;
    const k = Math.min(w / needW, d / needD, 1);
    return [w * k, d * k];
  };

  const aAngle = block.angle + drift + bias;
  const bAngle = block.angle + drift - bias;
  const a = { angle: aAngle }, b = { angle: bAngle };

  if (along === 'w') {
    const aw = at + block.w / 2 - half, bw = block.w / 2 - at - half;
    const [afw, afd] = fit(aw, block.d, aAngle - block.angle);
    const [bfw, bfd] = fit(bw, block.d, bAngle - block.angle);
    Object.assign(a, { w: afw, d: afd }, pos(toWorld, -block.w / 2 + aw / 2, 0));
    Object.assign(b, { w: bfw, d: bfd }, pos(toWorld, at + half + bw / 2, 0));
  } else {
    const ad = at + block.d / 2 - half, bd = block.d / 2 - at - half;
    const [afw, afd] = fit(block.w, ad, aAngle - block.angle);
    const [bfw, bfd] = fit(block.w, bd, bAngle - block.angle);
    Object.assign(a, { w: afw, d: afd }, pos(toWorld, 0, -block.d / 2 + ad / 2));
    Object.assign(b, { w: bfw, d: bfd }, pos(toWorld, 0, at + half + bd / 2));
  }
  pushStreet(out, toWorld, at, along, block, street, depth, bow);

  if (a.w > 1 && a.d > 1) splitBlock(a, depth + 1, rng, cfg, out, height);
  if (b.w > 1 && b.d > 1) splitBlock(b, depth + 1, rng, cfg, out, height);
}

const pos = (toWorld, lx, lz) => { const [cx, cz] = toWorld(lx, lz); return { cx, cz }; };

/**
 * Record the cut as a street — bowed, for a grown town.
 *
 * A straight line between two points is a surveyor's road. A road that people wore in bends a
 * little, so a grown street is emitted as a three-point polyline with the middle pushed sideways.
 * It is a small thing and it is most of what stops a plan looking mechanical.
 */
function pushStreet(out, toWorld, at, along, block, street, depth, bow) {
  const halfSpan = (along === 'w' ? block.d : block.w) / 2;
  const ends = along === 'w'
    ? [toWorld(at, -halfSpan), toWorld(at, halfSpan)]
    : [toWorld(-halfSpan, at), toWorld(halfSpan, at)];

  const pts = bow
    ? [ends[0], along === 'w' ? toWorld(at + bow, 0) : toWorld(0, at + bow), ends[1]]
    : ends;
  out.streets.push({ pts, cls: street.cls, width: street.width, depth });
}

// ---------------------------------------------------------------------------- plots

/**
 * Divide a block into plots, each one knowing which way it faces.
 *
 * The plots are cut in the block's own frame and carry the block's angle, so a building stands
 * square to its own street rather than square to the world.
 */
function plotsInBlock(block, rng, cfg, out, buildable) {
  const { plotMin } = cfg;
  const inset = 0.6;
  const w = block.w - inset * 2, d = block.d - inset * 2;
  if (w < plotMin || d < plotMin) return;

  const c = Math.cos(block.angle), sn = Math.sin(block.angle);
  const toWorld = (lx, lz) => [block.cx + lx * c - lz * sn, block.cz + lx * sn + lz * c];

  const along = w >= d ? 'w' : 'd';
  const span = along === 'w' ? w : d;
  const count = Math.max(1, Math.floor(span / (plotMin * (1.1 + rng() * 0.7))));
  const each = span / count;

  for (let i = 0; i < count; i++) {
    const pw = along === 'w' ? each : w;
    const pd = along === 'w' ? d : each;
    if (pw < plotMin * 0.8 || pd < plotMin * 0.8) continue;

    // centre of this plot, in the block's frame
    const lx = along === 'w' ? -span / 2 + each * (i + 0.5) : 0;
    const lz = along === 'w' ? 0 : -span / 2 + each * (i + 0.5);
    const [cx, cz] = toWorld(lx, lz);

    // face the nearest edge of the block — the block's edges ARE streets, by construction
    const toLeft = lx + block.w / 2, toRight = block.w / 2 - lx;
    const toTop = lz + block.d / 2, toBottom = block.d / 2 - lz;
    const nearest = Math.min(toLeft, toRight, toTop, toBottom);
    let local = 0;
    if (nearest === toLeft) local = Math.PI;
    else if (nearest === toRight) local = 0;
    else if (nearest === toTop) local = -Math.PI / 2;
    else local = Math.PI / 2;

    /**
     * A town does not build in the river.
     *
     * Farhold drops any building that lands in water, on a riverbank or on a cliff — silently, after
     * the plan is made. On a settlement with a river through it that was throwing away 14 plots of
     * 26 and leaving a city with twelve buildings in it. The planner is told what ground it may not
     * use, so the count it reports is the truth and the gap where the water runs is deliberate
     * rather than an accident nobody could see.
     */
    if (buildable && !buildable(cx, cz)) { out.blocked = (out.blocked || 0) + 1; continue; }

    out.plots.push({
      cx, cz, w: pw, d: pd, angle: block.angle,
      facing: block.angle + local, depth: block.depth,
      district: null, want: null,
    });
  }
}

// ---------------------------------------------------------------------------- the plan

/**
 * Plan a settlement, and if the ground takes too much of it away, plan it again more finely.
 *
 * `buildable` stops the planner laying plots in a river, on a bank or up a cliff — which is right,
 * and on a town built across a river it can take most of the ground away. A riverside settlement
 * came out with no houses in it at all: every surviving plot went to a trade, and the place read as
 * a wall with a forge in it.
 *
 * So a town that comes out under its floor tries once more at a finer grain — smaller blocks,
 * smaller plots — and keeps whichever attempt produced more. Real towns on awkward sites do exactly
 * this: the plots get smaller and the lanes get tighter, because the land is what it is. Same seed
 * either way, so a town is still the same town every visit.
 *
 * The floor matters as much for the SMALL as for the awkward. A hamlet's ring is only 29 m across,
 * which is barely two blocks before the recursion stops — one settlement came out as a granary, a
 * well and thirty-two paving slabs, with nobody living in it. A village has to be a handful of
 * houses at minimum or it is not a village.
 */
export function planTown(opts = {}) {
  let best = planOnce(opts);
  /**
   * The floor has to clear what the GROUND takes, not just what the plan wants.
   *
   * A settlement with a road through it loses about a third of its area before a single plot is
   * cut, and a river takes more. At five plots a size the floor was under what a clear site produces
   * anyway, so it never fired on the towns that needed it most.
   */
  const floor = Math.max(8, (opts.size ?? 3) * 7);
  if (best.plots.length >= floor) return best;

  /**
   * FINER FIRST, THEN WIDER.
   *
   * Two different shortages need two different answers, and the first version only had one.
   *
   * A hamlet is short of plots because its ring is 29 m across and the recursion stops after two
   * cuts — the ground is there, the blocks are just too big. Finer blocks fix that.
   *
   * A town with a road and a river through it is short because a third of its ground is GONE, and no
   * amount of subdividing makes more of it: measured on Hollowcrown, 31 plots on clear ground became
   * 15 with the real terrain, and every finer attempt stayed at 15. What a real settlement does
   * there is cover more ground — it spreads along the bank and up the road rather than squeezing
   * into the gaps. So the ring grows too, and the wall grows with it.
   */
  const base = CULTURES[opts.culture] || CULTURES.human;
  const squeezeBy = k => (k === 1 ? null : {
    blockMin: Math.max(4.5, base.blockMin * k),
    blockMax: Math.max(6.5, base.blockMax * k),
    plotMin: Math.max(3.2, base.plotMin * k),
  });
  const attempts = [
    { k: 0.7, ring: 1 }, { k: 0.5, ring: 1 },
    { k: 1, ring: 1.3 }, { k: 0.7, ring: 1.3 },
    { k: 1, ring: 1.65 }, { k: 0.7, ring: 1.65 },
  ];
  for (const { k, ring } of attempts) {
    const tried = planOnce({ ...opts, ringScale: ring, squeeze: squeezeBy(k) });   // `opts` carries `links`
    if (tried.plots.length > best.plots.length) best = tried;
    if (best.plots.length >= floor) break;
  }
  return best;
}

function planOnce({
  seed = 1, size = 3, culture = 'human', heightAt = null, followGround = null, buildable = null,
  squeeze = null, ringScale = 1,
  /**
   * Where the world's roads reach this town, in the town's own coordinates. See `linkRoads`.
   * Farhold works these out from where the inter-town route crosses the settlement's ring.
   */
  links = [],
  /** R27 — `(radius) => links`, asked at the radius this attempt really builds to. Wins over `links`. */
  linksAt = null,
} = {}) {
  const base = CULTURES[culture] || CULTURES.human;
  const cfg = { ...base, ...(squeeze || {}), followGround: followGround ?? 0.35 };
  const rng = makeRng(seed);
  const base0 = footprintOf(size);
  // a town that has lost ground to a road or a river covers more of it instead
  const ring = base0.ring * ringScale;
  const wall = base0.wall * ringScale;
  const walled = base0.walled;

  /**
   * ROUND 22 — A LINK IS A POINT ON THE WALL, SO IT HAS TO MOVE WHEN THE WALL DOES.
   *
   * `links` are handed in by the caller as the spots where a world road reaches the town, worked
   * out against the town's NORMAL size. `planTown` then retries a crowded site at `ringScale` up
   * to 1.65 — and every retry left the links exactly where they were, which is now somewhere in
   * the middle of a bigger town rather than on its edge. `linkRoads` would then lay the high
   * street from that inside point, and `clipPolyline` would keep the whole of it, so the road
   * arrived at the wall and the town's own high street started sixty metres further in with
   * nothing joining them.
   *
   * The bearing is what a link really is — which way the road comes from — so the fix is to slide
   * each one out along its own bearing to the wall this plan actually built. Nothing moves when
   * `ringScale` is 1, which is every town on an ordinary site.
   */
  /**
   * R27 — …OR BETTER, ASK THE CALLER AGAIN. Sliding along the bearing is right for a road that
   * arrives square-on and wrong for one that arrives at a slant: the road crosses the bigger wall
   * somewhere else entirely, so the high street ended on the wall 7 to 23 m from where the road
   * (and so the gate) actually came through, and ran into masonry. `links` may be a function of the
   * radius the plan really walls at (`linksAt(radius)`); Farhold passes one, and a plain `links` list
   * still slides as before.
   */
  const linkPoints = linksAt ? linksAt(walled ? wall : ring) : ringScale === 1 ? links : links.map(([lx, lz]) => {
    const d = Math.hypot(lx, lz);
    if (d < 1e-6) return [lx, lz];
    const want = walled ? wall : ring;
    return [lx / d * want, lz / d * want];
  });

  // the ground the town is built on. Farhold passes its real terrain; the page passes a stand-in,
  // because "follows the terrain" cannot be judged against flat ground.
  const height = heightAt || demoTerrain(seed);

  /**
   * The town starts at an angle of its own.
   *
   * Even a rigidly planned dwarf town should not line up with the world axes — every settlement
   * facing due north is its own kind of tell. The plan is rotated once at the root, and from there
   * the grammar decides whether that angle holds or wanders.
   */
  const root = { cx: 0, cz: 0, w: ring * 2, d: ring * 2, angle: rng() * Math.PI * 2 };

  const out = { streets: [], blocks: [], plots: [] };
  splitBlock(root, 0, rng, cfg, out, cfg.grammar === 'planned' ? null : height);

  out.blocks = out.blocks.filter(b => Math.hypot(b.cx, b.cz) <= ring);
  out.streets = out.streets.map(st => clipPolyline(st, wall)).filter(Boolean);

  /**
   * The central square: whichever block sits nearest the middle becomes open ground.
   *
   * ROUND 17 — AND "THE MIDDLE" HAS TO BE SOMEWHERE YOU CAN STAND.
   *
   * *"The centre of the town has a bunch of stuff semi-underwater."* Farhold hangs the well, the
   * market stalls and the civic district off `out.square`, and this took the block nearest 0,0
   * whatever was there. On a settlement the world map founded with a river through it — Feafungate
   * on seed 56138 has its map node in the middle of the channel, with 42% of its ring under water —
   * that put the town square, and everything that rings it, in the river. The planner already knows
   * which ground it may not use; it simply was not asking here.
   *
   * So a buildable block wins over a nearer one, and the old rule is the fallback for a town where
   * nothing is buildable (a test's stand-in terrain says nothing at all is, and a square is still
   * better than no square).
   */
  let squareBlock = null, best = Infinity;
  let anyBlock = null, anyBest = Infinity;
  for (const b of out.blocks) {
    const d = Math.hypot(b.cx, b.cz);
    if (d < anyBest) { anyBest = d; anyBlock = b; }
    if (buildable && !buildable(b.cx, b.cz)) continue;
    if (d < best) { best = d; squareBlock = b; }
  }
  if (!squareBlock) squareBlock = anyBlock;
  if (squareBlock) {
    out.blocks = out.blocks.filter(b => b !== squareBlock);
    out.square = { cx: squareBlock.cx, cz: squareBlock.cz, r: Math.max(squareBlock.w, squareBlock.d) / 2 };
  } else {
    out.square = { cx: 0, cz: 0, r: 6 };
  }

  /**
   * ONE NETWORK, AND THE HIGHWAY JOINS IT — BEFORE A SINGLE PLOT IS CUT.
   *
   * Order matters twice over. The roads come in first so a link can be the thing that rescues an
   * otherwise orphaned lane near the edge. And both happen before `plotsInBlock`, because a spur is
   * a STREET: cutting the plots first and laying spurs through them afterwards would put houses on
   * roads again, which is the one thing this planner exists to make impossible. The plots are then
   * trimmed against the new streets below, since a spur crosses a block rather than bounding it.
   */
  out.links = linkRoads(out, linkPoints);
  out.connect = connectStreets(out);

  for (const b of out.blocks) plotsInBlock(b, rng, cfg, out, buildable);

  /**
   * Trim on the PLOT's own corners, not its block's centre.
   *
   * Filtering blocks by their centre let a big block poke a corner past the wall, and the plots cut
   * from that corner then stood outside the town — outside the wall, on the wrong side of the gate.
   */
  out.plots = out.plots.filter(p => corners(p).every(([x, z]) => Math.hypot(x, z) <= ring));

  /**
   * …and nothing stands on a spur or a high street either.
   *
   * The cuts that made the blocks cannot be built on because a plot is cut from a block and a block
   * is what is left between cuts. A spur is not one of those — it crosses a block to reach the
   * lane on the far side — so it is the one kind of street a plot CAN land on, and `overlaps()`
   * would rightly call that a broken plan. Cheap: a handful of added streets against a few dozen
   * plots.
   */
  const added = out.streets.filter(st => st.spur || st.highway);
  if (added.length) {
    out.plots = out.plots.filter(p => !added.some(st => {
      for (let i = 0; i + 1 < st.pts.length; i++) {
        if (obbOverlap(p, segmentBox(st.pts[i], st.pts[i + 1], st.width), 0.02)) return true;
      }
      return false;
    }));
  }

  for (const p of out.plots) {
    const d = Math.hypot(p.cx - out.square.cx, p.cz - out.square.cz);
    p.district = d < ring * 0.34 ? 'civic' : d < ring * 0.62 ? 'craft' : 'residential';
  }

  /**
   * The trades take the big plots — but a town is mostly people's houses.
   *
   * One plot per trade, biggest first, sounds right and is not: a settlement wants a dozen trades
   * from size 4 up, and if the plan only yields nineteen plots then thirteen of them are a forge, an
   * inn, a chapel, a barracks and so on, and the "city" has six homes in it. That is a trading post
   * with delusions, not a city. The trades are capped at a third of the town, taken from the biggest
   * plots in want-order, so whatever a small town does without is whatever is at the bottom of that
   * list — which is the same rule as before, applied to a number that makes sense.
   */
  const wants = WANT_ORDER.filter(k => size >= (WANT_FROM[k] ?? 0));
  const byArea = [...out.plots].sort((a, b) => (b.w * b.d) - (a.w * a.d));
  const roomForTrades = Math.max(1, Math.floor(out.plots.length / 3));
  wants.slice(0, roomForTrades).forEach((want, i) => { if (byArea[i]) byArea[i].want = want; });
  for (const p of out.plots) if (!p.want) p.want = p.district === 'residential' ? 'house' : 'hut';

  out.blocked = out.blocked || 0;
  out.wall = walled ? buildWall(wall, out.streets, rng, cfg.wall, ring) : null;
  out.ring = ring;
  out.wallRadius = wall;
  out.culture = culture;
  out.grammar = cfg.grammar;
  out.size = size;
  out.seed = seed;
  return out;
}

/** Clip a street polyline to the wall circle, stitching the surviving spans back together. */
function clipPolyline(street, r) {
  const kept = [];
  for (let i = 0; i < street.pts.length - 1; i++) {
    const seg = clipSegmentToCircle(street.pts[i], street.pts[i + 1], r);
    if (!seg) continue;
    const last = kept[kept.length - 1];
    if (!last || Math.hypot(last[0] - seg[0][0], last[1] - seg[0][1]) > 0.01) kept.push(seg[0]);
    kept.push(seg[1]);
  }
  return kept.length >= 2 ? { ...street, pts: kept } : null;
}

/** Clip one span to a circle at the origin, or null if it never comes inside. */
function clipSegmentToCircle(p1, p2, r) {
  const [x1, z1] = p1, [x2, z2] = p2;
  const dx = x2 - x1, dz = z2 - z1;
  const a = dx * dx + dz * dz;
  if (a === 0) return null;
  const b = 2 * (x1 * dx + z1 * dz);
  const c = x1 * x1 + z1 * z1 - r * r;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return null;
  const root = Math.sqrt(disc);
  const t0 = Math.max(0, Math.min(1, (-b - root) / (2 * a)));
  const t1 = Math.max(0, Math.min(1, (-b + root) / (2 * a)));
  if (t1 - t0 < 0.001) return null;
  return [[x1 + dx * t0, z1 + dz * t0], [x1 + dx * t1, z1 + dz * t1]];
}

/**
 * The wall, and a gate wherever a main street reaches it.
 *
 * A gate exists BECAUSE a road crosses the wall line, and its angle is taken from the street that
 * made it — which is the fix for gates that sit at ninety degrees to the wall and do not meet it.
 */
function buildWall(radius, streets, rng, kind = 'stone', ring = radius) {
  const poly = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    poly.push([Math.cos(a), Math.sin(a)]);
  }
  const gates = [];
  const apart = (x, y) => Math.abs(((x - y + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const free = angle => gates.length < 4 && !gates.some(g => apart(g.angle, angle) < 0.7);
  const add = angle => {
    if (!free(angle)) return false;
    gates.push({ angle, road: true, x: Math.cos(angle), z: Math.sin(angle) });
    return true;
  };

  /**
   * R27 — A GATE AT A STREET'S END, AND THE STREET CARRIED OUT TO IT.
   *
   * The blocks are cut from a square `ring` across and the wall stands at `ring + 14`, so an
   * ordinary main street stops at the edge of the houses, fourteen metres short of the masonry,
   * and the gate this function cut at its bearing opened onto a strip of grass. (Only a high
   * street laid in from a world road ever reached the wall.) Now a street end at the edge of the
   * town that is heading OUTWARD is extended along its own line to the wall — through the band
   * between the last plot and the wall, where there are no plots to land on — and the gate is cut
   * where it arrives. An end deep inside the town (a T-junction) gets neither.
   */
  const reach = (s, first) => {
    const pts = s.pts;
    const end = first ? pts[0] : pts[pts.length - 1];
    const inner = first ? pts[1] : pts[pts.length - 2];
    const r = Math.hypot(end[0], end[1]);
    if (r >= radius - 0.5) return { at: end, extend: null };
    if (r < ring * 0.85 || !inner) return null;
    const len = Math.hypot(end[0] - inner[0], end[1] - inner[1]);
    if (len < 1e-6) return null;
    const dx = (end[0] - inner[0]) / len, dz = (end[1] - inner[1]) / len;
    const b = end[0] * dx + end[1] * dz;
    if (b / r < 0.35) return null;                       // running along the wall, not towards it
    const t = -b + Math.sqrt(b * b - (r * r - radius * radius));
    const at = [end[0] + dx * t, end[1] + dz * t];
    return { at, extend: at };
  };
  const gateAt = (s, first) => {
    const hit = reach(s, first);
    if (!hit || !add(Math.atan2(hit.at[1], hit.at[0]))) return false;
    // the extension runs along the last span's own line, so the end point simply moves out — a
    // straight street stays a two-point street
    if (hit.extend) { s.pts[first ? 0 : s.pts.length - 1] = hit.extend; s.toWall = true; }
    return true;
  };

  const mains = streets.filter(s => s.cls === 'main');
  mains.sort((a, b) => streetLength(b) - streetLength(a));
  for (const s of mains) { gateAt(s, true); gateAt(s, false); }

  /**
   * A town with one way in is a cul-de-sac, not a town.
   *
   * On a small or lopsided footprint the split can leave very few full-width main streets, and the
   * first pass then finds one gate or none — which would strand the player outside. So the wall
   * insists on at least two: R27 — first at the end of the longest lesser street that heads out
   * (carried to the wall the same way, so the gate still leads onto a street), and only then at the
   * widest gaps left in the ring, and never more than four, because every gate is a hole somebody
   * has to guard.
   */
  if (gates.length < 2) {
    const lesser = streets.filter(s => s.cls !== 'main').sort((a, b) => streetLength(b) - streetLength(a));
    for (const s of lesser) {
      if (gates.length >= 2) break;
      if (!gateAt(s, true) && gates.length < 2) gateAt(s, false);
    }
  }

  let guard = 0;
  while (gates.length < 2 && guard++ < 24) {
    if (!gates.length) { add(rng() * Math.PI * 2); continue; }
    const sorted = [...gates].sort((a, b) => a.angle - b.angle);
    let widest = 0, at = 0;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i].angle;
      const b = sorted[(i + 1) % sorted.length].angle + (i === sorted.length - 1 ? Math.PI * 2 : 0);
      if (b - a > widest) { widest = b - a; at = (a + b) / 2; }
    }
    add(at);
  }
  // R27: this used to be `{ kind: radius, … }` — the radius filed under the culture's wall KIND.
  // `kind` is the culture's wall material ('stone', 'hedge', 'palisade' …) and `radius` the metres
  return { kind, radius, poly, gates };
}

// ---------------------------------------------------------------------------- one network

/**
 * The nearest point on a polyline to a point, and how far it is.
 *
 * Returned as `{ x, z, distance, street, at }` so a spur can be laid to exactly where it should
 * join rather than to the nearest CORNER, which is what makes a T-junction look like a T rather
 * than like two roads that nearly meet.
 */
export function nearestOnStreets(streets, px, pz, { skip = null } = {}) {
  let best = null;
  for (const st of streets) {
    if (st === skip) continue;
    for (let i = 0; i + 1 < st.pts.length; i++) {
      const [ax, az] = st.pts[i], [bx, bz] = st.pts[i + 1];
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
      const x = ax + dx * t, z = az + dz * t;
      const distance = Math.hypot(px - x, pz - z);
      if (!best || distance < best.distance) best = { x, z, distance, street: st, at: t };
    }
  }
  return best;
}

/** Do these two streets share ground? Their widths count, so a T-junction touches. */
function streetsMeet(a, b, tol = 0.6) {
  const reach = (a.width + b.width) / 2 + tol;
  for (const [px, pz] of a.pts) {
    const near = nearestOnStreets([b], px, pz);
    if (near && near.distance <= reach) return true;
  }
  for (const [px, pz] of b.pts) {
    const near = nearestOnStreets([a], px, pz);
    if (near && near.distance <= reach) return true;
  }
  return false;
}

/**
 * MAKE THE STREETS ONE NETWORK, AND DROP WHATEVER WILL NOT JOIN.
 *
 * Reported in play, twice: *"There are still random flat rectangles in town I think are supposed to
 * be roads, can they be interconnected somehow… They still don't feel quite natural."*
 *
 * The cuts that make the blocks are, in principle, already a connected network — a child street
 * runs from one edge of its block to the other, and those edges are its parent's streets. In
 * practice three things break that:
 *
 *   * a drifting child block SHRINKS to stay inside its slot, so its alleys stop short of the
 *     street that made them;
 *   * `clipPolyline` cuts every street to the wall circle, which can leave a stub near the edge
 *     with both of its junctions outside;
 *   * the renderer drops any span that lands in water or on a riverbank, which can cut a street in
 *     half and leave the far end stranded.
 *
 * Any of those leaves paving with no road attached to it: a flat rectangle in a field, which is
 * exactly what the player saw. So after the plan is cut, the streets are grouped into connected
 * components, the one containing the square is the town, and every other component either gets a
 * SPUR to reach it or is thrown away. Nothing is left floating.
 */
export function connectStreets(out, { maxSpur = 26 } = {}) {
  const streets = out.streets;
  if (streets.length < 2) return { spurs: 0, dropped: 0 };

  const groupOf = new Array(streets.length).fill(-1);
  const groups = [];
  for (let i = 0; i < streets.length; i++) {
    if (groupOf[i] >= 0) continue;
    const g = groups.length;
    const stack = [i];
    groups.push([]);
    groupOf[i] = g;
    while (stack.length) {
      const k = stack.pop();
      groups[g].push(k);
      for (let j = 0; j < streets.length; j++) {
        if (groupOf[j] >= 0) continue;
        if (!streetsMeet(streets[k], streets[j])) continue;
        groupOf[j] = g;
        stack.push(j);
      }
    }
  }
  if (groups.length <= 1) return { spurs: 0, dropped: 0, groups: groups.length };

  // the town is whichever group is nearest the square — the place everything should lead to
  const sq = out.square || { cx: 0, cz: 0 };
  let home = 0, homeDist = Infinity;
  for (let g = 0; g < groups.length; g++) {
    for (const i of groups[g]) {
      const near = nearestOnStreets([streets[i]], sq.cx, sq.cz);
      if (near && near.distance < homeDist) { homeDist = near.distance; home = g; }
    }
  }

  const keep = new Set(groups[home]);
  const spurs = [];
  let dropped = 0;

  /**
   * Nearest first, and a joined group JOINS THE TOWN.
   *
   * Two orphan lanes beside each other should both end up connected by one spur and a join, not be
   * thrown away because neither of them alone was near the square. So the groups are taken in order
   * of how close they are, and each one that gets a spur becomes part of what the next may join to.
   */
  const rest = groups.map((g, i) => i).filter(i => i !== home);
  const distOf = g => {
    let best = Infinity;
    for (const i of groups[g]) {
      for (const [px, pz] of streets[i].pts) {
        const near = nearestOnStreets([...keep].map(k => streets[k]), px, pz);
        if (near && near.distance < best) best = near.distance;
      }
    }
    return best;
  };

  rest.sort((a, b) => distOf(a) - distOf(b));
  for (const g of rest) {
    let link = null;
    for (const i of groups[g]) {
      for (const [px, pz] of streets[i].pts) {
        const near = nearestOnStreets([...keep].map(k => streets[k]), px, pz);
        if (near && (!link || near.distance < link.distance)) link = { ...near, from: [px, pz] };
      }
    }
    if (link && link.distance <= maxSpur) {
      spurs.push({
        pts: [link.from, [link.x, link.z]],
        cls: 'alley', width: STREET_CLASSES[2].width, depth: 9, spur: true,
      });
      for (const i of groups[g]) keep.add(i);
    } else {
      dropped += groups[g].length;
    }
  }

  out.streets = streets.filter((_, i) => keep.has(i)).concat(spurs);
  return { spurs: spurs.length, dropped, groups: groups.length };
}

/**
 * THE HIGHWAY COMES INTO TOWN.
 *
 * *"…and actually connect to the real roads passing through towns?"* A settlement had a street plan
 * and the world had a road network and the two had never been introduced: the inter-town route ran
 * straight past (or straight through) a town whose own streets stopped dead at the wall.
 *
 * `links` are the points on the town's edge where a road arrives, in the town's own coordinates.
 * Each one gets a main street from the edge to wherever the existing network comes closest — which
 * is what a road does when it reaches a town: it becomes the high street.
 */
export function linkRoads(out, links = []) {
  if (!links.length || !out.streets.length) return 0;
  let made = 0;
  for (const [lx, lz] of links) {
    const near = nearestOnStreets(out.streets, lx, lz);
    if (!near) continue;
    if (near.distance < 2) continue;                 // the road already meets the plan here
    out.streets.push({
      pts: [[lx, lz], [near.x, near.z]],
      cls: 'main', width: STREET_CLASSES[0].width, depth: 0, highway: true,
    });
    made++;
  }
  return made;
}

/** How long a street polyline is, end to end. */
function streetLength(s) {
  let n = 0;
  for (let i = 0; i < s.pts.length - 1; i++) {
    n += Math.hypot(s.pts[i + 1][0] - s.pts[i][0], s.pts[i + 1][1] - s.pts[i][1]);
  }
  return n;
}

// ---------------------------------------------------------------------------- validation

/**
 * The assertion the whole design exists to make possible: NOTHING SITS ON A STREET.
 *
 * Both plots and street spans are oriented boxes now, so one separating-axis test covers every
 * case. Used by the page's validator overlay and by the node tests — if this returns a hit, the
 * PLANNER is broken, not the renderer.
 *
 * ROUND 22 ADDED THE WALL, because *"houses clip through the wall"* and nothing here had ever
 * looked at one. The planner keeps its plots inside `ring` and stands its wall at `wallRadius`,
 * which is fourteen metres further out — so this should never fire, and that is exactly why it is
 * worth asserting. The bug the user actually hit was a CONSUMER (Farhold) recomputing its own
 * unscaled ring instead of reading `plan.wallRadius`, and the way to keep the two honest is for
 * the planner to state, in one place, what "inside the wall" means.
 */
/** Metres of daylight a plot must leave between its corner and the masonry. */
export const WALL_CLEARANCE = 2;

export function overlaps(plan) {
  const hits = [];
  if (plan.wall && plan.wallRadius > 0) {
    const limit = plan.wallRadius - WALL_CLEARANCE;
    for (const p of plan.plots) {
      const out = corners(p).find(([x, z]) => Math.hypot(x, z) > limit);
      if (out) hits.push({ kind: 'plot-wall', p, at: out, over: Math.hypot(out[0], out[1]) - limit });
    }
  }
  for (let i = 0; i < plan.plots.length; i++) {
    for (let j = i + 1; j < plan.plots.length; j++) {
      if (obbOverlap(plan.plots[i], plan.plots[j], 0.02)) hits.push({ kind: 'plot-plot', i, j, p: plan.plots[i] });
    }
  }
  for (const p of plan.plots) {
    for (const s of plan.streets) {
      for (let i = 0; i < s.pts.length - 1; i++) {
        if (obbOverlap(p, segmentBox(s.pts[i], s.pts[i + 1], s.width), 0.02)) {
          hits.push({ kind: 'plot-street', p, s });
          break;
        }
      }
    }
  }
  return hits;
}

/** A quick shape summary, for the batch sameness report. */
export function summarise(plan) {
  const wants = {};
  for (const p of plan.plots) wants[p.want] = (wants[p.want] || 0) + 1;
  return {
    seed: plan.seed, culture: plan.culture, size: plan.size,
    streets: plan.streets.length, plots: plan.plots.length,
    highways: plan.links || 0, spurs: plan.connect?.spurs || 0, orphans: plan.connect?.dropped || 0,
    square: Math.round(plan.square.r * 10) / 10,
    gates: plan.wall ? plan.wall.gates.length : 0,
    wants,
  };
}
