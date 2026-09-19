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

/** How wide a settlement's footprint is, which is also where its quiet ground starts. */
export function footprintOf(size = 1) {
  const ring = 16 + size * 13;
  const wall = size >= 4 ? ring + 14 : ring;
  return { ring, wall, walled: size >= 4 };
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
    const tried = planOnce({ ...opts, ringScale: ring, squeeze: squeezeBy(k) });
    if (tried.plots.length > best.plots.length) best = tried;
    if (best.plots.length >= floor) break;
  }
  return best;
}

function planOnce({
  seed = 1, size = 3, culture = 'human', heightAt = null, followGround = null, buildable = null,
  squeeze = null, ringScale = 1,
} = {}) {
  const base = CULTURES[culture] || CULTURES.human;
  const cfg = { ...base, ...(squeeze || {}), followGround: followGround ?? 0.35 };
  const rng = makeRng(seed);
  const base0 = footprintOf(size);
  // a town that has lost ground to a road or a river covers more of it instead
  const ring = base0.ring * ringScale;
  const wall = base0.wall * ringScale;
  const walled = base0.walled;

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

  // the central square: whichever block sits nearest the middle becomes open ground
  let squareBlock = null, best = Infinity;
  for (const b of out.blocks) {
    const d = Math.hypot(b.cx, b.cz);
    if (d < best) { best = d; squareBlock = b; }
  }
  if (squareBlock) {
    out.blocks = out.blocks.filter(b => b !== squareBlock);
    out.square = { cx: squareBlock.cx, cz: squareBlock.cz, r: Math.max(squareBlock.w, squareBlock.d) / 2 };
  } else {
    out.square = { cx: 0, cz: 0, r: 6 };
  }

  for (const b of out.blocks) plotsInBlock(b, rng, cfg, out, buildable);

  /**
   * Trim on the PLOT's own corners, not its block's centre.
   *
   * Filtering blocks by their centre let a big block poke a corner past the wall, and the plots cut
   * from that corner then stood outside the town — outside the wall, on the wrong side of the gate.
   */
  out.plots = out.plots.filter(p => corners(p).every(([x, z]) => Math.hypot(x, z) <= ring));

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
  out.wall = walled ? buildWall(wall, out.streets, rng) : null;
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
function buildWall(radius, streets, rng) {
  const poly = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    poly.push([Math.cos(a), Math.sin(a)]);
  }
  const gates = [];
  const apart = (x, y) => Math.abs(((x - y + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const add = angle => {
    if (gates.some(g => apart(g.angle, angle) < 0.7)) return false;
    gates.push({ angle, road: true, x: Math.cos(angle), z: Math.sin(angle) });
    return true;
  };

  const mains = streets.filter(s => s.cls === 'main');
  mains.sort((a, b) => streetLength(b) - streetLength(a));
  for (const s of mains) {
    for (const end of [s.pts[0], s.pts[s.pts.length - 1]]) add(Math.atan2(end[1], end[0]));
  }

  /**
   * A town with one way in is a cul-de-sac, not a town.
   *
   * On a small or lopsided footprint the split can leave very few full-width main streets, and the
   * first pass then finds one gate or none — which would strand the player outside. So the wall
   * insists on at least two, at the widest gaps left in the ring, and never more than four, because
   * every gate is a hole somebody has to guard.
   */
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
  if (gates.length > 4) gates.length = 4;
  return { kind: radius, poly, gates };
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
 */
export function overlaps(plan) {
  const hits = [];
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
    square: Math.round(plan.square.r * 10) / 10,
    gates: plan.wall ? plan.wall.gates.length : 0,
    wants,
  };
}
