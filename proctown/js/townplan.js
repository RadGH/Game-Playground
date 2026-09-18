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
  { cls: 'main',  width: 7.0, setback: 2.4, surface: 'paved' },
  { cls: 'lane',  width: 4.5, setback: 1.2, surface: 'cobble' },
  { cls: 'alley', width: 2.6, setback: 0.4, surface: 'dirt' },
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
    name: 'Human', grammar: 'grown', jitter: 0.30, blockMin: 17, blockMax: 34,
    plotMin: 7, storeys: [1, 3], wall: 'stone', street: 'cobble',
    cornerstones: ['guildhall', 'market_cross'],
  },
  elf: {
    name: 'Elf', grammar: 'grown', jitter: 0.55, blockMin: 20, blockMax: 44,
    plotMin: 9, storeys: [2, 4], wall: 'hedge', street: 'root',
    cornerstones: ['canopy_hall', 'spiral_stair'],
  },
  dwarf: {
    name: 'Dwarf', grammar: 'planned', jitter: 0.04, blockMin: 15, blockMax: 26,
    plotMin: 7, storeys: [1, 2], wall: 'cutstone', street: 'flag',
    cornerstones: ['great_gate', 'forge_hall'],
  },
  undead: {
    name: 'Undead', grammar: 'grown', jitter: 0.42, blockMin: 14, blockMax: 30,
    plotMin: 6, storeys: [1, 3], wall: 'bone', street: 'bone',
    cornerstones: ['bone_spire', 'necropolis_row'],
  },
  orc: {
    name: 'Orc', grammar: 'sprawl', jitter: 0.70, blockMin: 13, blockMax: 38,
    plotMin: 6, storeys: [1, 2], wall: 'palisade', street: 'dirt',
    cornerstones: ['war_hall', 'totem_field'],
  },
  halfling: {
    name: 'Halfling', grammar: 'grown', jitter: 0.48, blockMin: 12, blockMax: 24,
    plotMin: 5, storeys: [1, 1], wall: 'hedge', street: 'dirt',
    cornerstones: ['burrow_row', 'party_tree'],
  },
  desert: {
    name: 'Desert', grammar: 'planned', jitter: 0.16, blockMin: 13, blockMax: 25,
    plotMin: 6, storeys: [1, 3], wall: 'mudbrick', street: 'sand',
    cornerstones: ['bazaar', 'windcatcher'],
  },
};

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

// ---------------------------------------------------------------------------- the split

/**
 * Cut a rectangle in two, and the CUT IS A STREET.
 *
 * This is the heart of it. Recursive binary subdivision is the standard way to get believable
 * blocks, and doing it this way round — the street is the gap left by the split rather than a line
 * drawn afterwards — is what guarantees a building can never end up on a road.
 *
 * `jitter` is the culture's irregularity: a dwarf splits at the middle and square on, a halfling
 * splits anywhere and slightly skew. That one number is most of the difference between a planned
 * town and a grown one.
 */
function splitBlock(rect, depth, rng, cfg, out) {
  const { blockMin, blockMax, jitter } = cfg;
  const longest = Math.max(rect.w, rect.d);

  // small enough to build on, or too deep to keep cutting
  if (longest <= blockMax || depth > 6) {
    if (rect.w >= blockMin * 0.6 && rect.d >= blockMin * 0.6) out.blocks.push({ ...rect, depth });
    return;
  }

  const along = rect.w >= rect.d ? 'w' : 'd';
  const street = classForDepth(depth);
  const span = rect[along];

  // where the cut falls. 0.5 is a dwarf; a halfling wanders a third of the way either side
  const t = 0.5 + (rng() - 0.5) * jitter;
  const at = span * Math.max(0.25, Math.min(0.75, t));

  // the two halves, with the street's width taken out of the middle
  const half = street.width / 2;
  const a = { ...rect }, b = { ...rect };
  if (along === 'w') {
    a.w = at - half;
    b.x = rect.x + at + half;
    b.w = rect.w - at - half;
  } else {
    a.d = at - half;
    b.z = rect.z + at + half;
    b.d = rect.d - at - half;
  }

  // the cut itself, recorded as a street down the middle of the gap
  if (along === 'w') {
    const x = rect.x + at;
    out.streets.push({ a: [x, rect.z], b: [x, rect.z + rect.d], cls: street.cls, width: street.width, depth });
  } else {
    const z = rect.z + at;
    out.streets.push({ a: [rect.x, z], b: [rect.x + rect.w, z], cls: street.cls, width: street.width, depth });
  }

  if (a.w > 1 && a.d > 1) splitBlock(a, depth + 1, rng, cfg, out);
  if (b.w > 1 && b.d > 1) splitBlock(b, depth + 1, rng, cfg, out);
}

// ---------------------------------------------------------------------------- plots

/**
 * Divide a block into plots, each one knowing which way it faces.
 *
 * `facing` is the angle from the plot's centre out to the street it fronts, and it is the reason a
 * door is never on a blank back wall: the building is built to face it. A plot on the outside of a
 * block faces out; the rare interior plot faces the nearest edge and gets an alley.
 */
function plotsInBlock(block, rng, cfg, out) {
  const { plotMin } = cfg;
  const inset = 0.6;                       // a hair of yard between the plot and the kerb
  const x0 = block.x + inset, z0 = block.z + inset;
  const w = block.w - inset * 2, d = block.d - inset * 2;
  if (w < plotMin || d < plotMin) return;

  // lay plots along the longer edge, so a long thin block becomes a terrace rather than one lump
  const along = w >= d ? 'w' : 'd';
  const span = along === 'w' ? w : d;
  const count = Math.max(1, Math.floor(span / (plotMin * (1.1 + rng() * 0.7))));
  const each = span / count;

  for (let i = 0; i < count; i++) {
    const px = along === 'w' ? x0 + i * each : x0;
    const pz = along === 'w' ? z0 : z0 + i * each;
    const pw = along === 'w' ? each : w;
    const pd = along === 'w' ? d : each;
    if (pw < plotMin * 0.8 || pd < plotMin * 0.8) continue;

    const cx = px + pw / 2, cz = pz + pd / 2;
    // face the nearest edge of the block — that is where the street is, because the block's edges
    // ARE streets by construction
    const toLeft = cx - block.x, toRight = block.x + block.w - cx;
    const toTop = cz - block.z, toBottom = block.z + block.d - cz;
    const nearest = Math.min(toLeft, toRight, toTop, toBottom);
    let facing = 0;
    if (nearest === toLeft) facing = Math.PI;
    else if (nearest === toRight) facing = 0;
    else if (nearest === toTop) facing = -Math.PI / 2;
    else facing = Math.PI / 2;

    out.plots.push({
      x: px, z: pz, w: pw, d: pd, cx, cz,
      facing, depth: block.depth,
      district: null, want: null,
    });
  }
}

/**
 * Clip a street to the town's wall circle, or drop it if it never comes inside.
 *
 * Both ends are axis-aligned here, which keeps this to solving one quadratic rather than a general
 * segment-circle intersection with all its degenerate cases.
 */
function clipSegmentToCircle(seg, r) {
  const [x1, z1] = seg.a, [x2, z2] = seg.b;
  const dx = x2 - x1, dz = z2 - z1;
  const a = dx * dx + dz * dz;
  if (a === 0) return null;
  const b = 2 * (x1 * dx + z1 * dz);
  const c = x1 * x1 + z1 * z1 - r * r;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return null;                       // never enters the circle
  const root = Math.sqrt(disc);
  let t0 = (-b - root) / (2 * a), t1 = (-b + root) / (2 * a);
  t0 = Math.max(0, Math.min(1, t0));
  t1 = Math.max(0, Math.min(1, t1));
  if (t1 - t0 < 0.001) return null;
  return {
    ...seg,
    a: [x1 + dx * t0, z1 + dz * t0],
    b: [x1 + dx * t1, z1 + dz * t1],
  };
}

// ---------------------------------------------------------------------------- the plan

/**
 * Plan a settlement.
 *
 * Deterministic from `seed` alone: the same seed is the same town, so nothing has to be saved and
 * a bug report that names a seed is reproducible.
 */
export function planTown({ seed = 1, size = 3, culture = 'human', rotate = null } = {}) {
  const cfg = CULTURES[culture] || CULTURES.human;
  const rng = makeRng(seed);
  const { ring, wall, walled } = footprintOf(size);

  // the buildable square the town is cut out of, a little wider than the ring so the corners can be
  // trimmed back to a round-ish footprint
  const extent = ring * 2;
  const root = { x: -ring, z: -ring, w: extent, d: extent };

  const out = { streets: [], blocks: [], plots: [] };
  splitBlock(root, 0, rng, cfg, out);

  // trim to the footprint: a town is round-ish, and a square one looks like a car park
  const insideRing = (cx, cz, pad = 0) => Math.hypot(cx, cz) <= ring - pad;
  out.blocks = out.blocks.filter(b => insideRing(b.x + b.w / 2, b.z + b.d / 2, 0));

  /**
   * Streets stop at the wall, they do not trail off into the fields.
   *
   * The split cuts across the whole square the town is carved out of, so before clipping, every
   * street ran out to the corners of that square — past the wall, past the last plot, into nothing.
   * Each street is clipped to the wall circle, which is also what makes a gate meaningful: the
   * street ENDS at the wall, and the gate is the hole it goes through.
   */
  out.streets = out.streets
    .map(s => clipSegmentToCircle(s, wall))
    .filter(Boolean);

  // the central square: whichever block sits nearest the middle becomes open ground
  let squareBlock = null, best = Infinity;
  for (const b of out.blocks) {
    const d = Math.hypot(b.x + b.w / 2, b.z + b.d / 2);
    if (d < best) { best = d; squareBlock = b; }
  }
  if (squareBlock) {
    out.blocks = out.blocks.filter(b => b !== squareBlock);
    out.square = {
      cx: squareBlock.x + squareBlock.w / 2,
      cz: squareBlock.z + squareBlock.d / 2,
      r: Math.max(squareBlock.w, squareBlock.d) / 2,
    };
  } else {
    out.square = { cx: 0, cz: 0, r: 6 };
  }

  for (const b of out.blocks) plotsInBlock(b, rng, cfg, out);

  /**
   * Trim on the PLOT's corners, not the block's centre.
   *
   * Filtering blocks by their centre let a big block sit mostly inside the ring and poke a corner
   * out past it, and the plots cut from that corner then stood outside the town — outside the wall,
   * on the wrong side of the gate, in the fields. A town's edge is round, so the test has to be
   * against the farthest corner of the thing being placed.
   */
  out.plots = out.plots.filter(p => {
    const far = Math.max(
      Math.hypot(p.x, p.z), Math.hypot(p.x + p.w, p.z),
      Math.hypot(p.x, p.z + p.d), Math.hypot(p.x + p.w, p.z + p.d),
    );
    return far <= ring;
  });

  // ---- districts. Tight to the square is civic and craft; the edge is where people live.
  for (const p of out.plots) {
    const d = Math.hypot(p.cx - out.square.cx, p.cz - out.square.cz);
    p.district = d < ring * 0.34 ? 'civic' : d < ring * 0.62 ? 'craft' : 'residential';
  }

  // ---- what the town wants, biggest plots first, so a hall is not squeezed into an alley
  const wants = WANT_ORDER.filter(k => size >= (WANT_FROM[k] ?? 0));
  const byArea = [...out.plots].sort((a, b) => (b.w * b.d) - (a.w * a.d));
  wants.forEach((want, i) => { if (byArea[i]) byArea[i].want = want; });
  for (const p of out.plots) if (!p.want) p.want = p.district === 'residential' ? 'house' : 'hut';

  // ---- the wall, and the gates where roads cross it
  out.wall = walled ? buildWall(wall, out.streets, rng) : null;
  out.ring = ring;
  out.wallRadius = wall;
  out.culture = culture;
  out.size = size;
  out.seed = seed;
  out.rotate = rotate == null ? rng() * Math.PI * 2 : rotate;
  return out;
}

/**
 * The wall, and a gate wherever a main street reaches it.
 *
 * A gate exists BECAUSE a road crosses the wall line — which is also the fix for the reported bug
 * that gates sit at ninety degrees to the wall and do not meet it. The gate's angle is taken from
 * the street that made it, so it can only ever line up.
 */
function buildWall(kind, streets, rng, want = 0) {
  const poly = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    poly.push([Math.cos(a), Math.sin(a)]);          // unit circle; scaled by the caller's ring
  }

  // every main street that reaches the edge wants a gate, at the angle the street arrives on
  const gates = [];
  const apart = (x, y) => Math.abs(((x - y + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const add = angle => {
    if (gates.some(g => apart(g.angle, angle) < 0.7)) return false;
    gates.push({ angle, road: true, x: Math.cos(angle), z: Math.sin(angle) });
    return true;
  };

  const mains = streets.filter(s => s.cls === 'main');
  // longest first: the streets that cross the whole town are the ones that leave it
  mains.sort((a, b) => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) - Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]));
  for (const s of mains) {
    for (const end of [s.a, s.b]) add(Math.atan2(end[1], end[0]));
  }

  /**
   * A town with one way in is a cul-de-sac, not a town.
   *
   * The split can leave very few full-width main streets on a small or lopsided footprint, and the
   * first pass then finds one gate or none — which would strand the player outside. So the wall
   * insists on at least two, placed at the widest gaps left in the ring, and never more than four
   * because every gate is a hole somebody has to guard.
   */
  const least = want || 2;
  let guard = 0;
  while (gates.length < least && guard++ < 24) {
    if (!gates.length) { add(rng() * Math.PI * 2); continue; }
    const sorted = [...gates].sort((a, b) => a.angle - b.angle);
    let widest = 0, at = 0;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i].angle, b = sorted[(i + 1) % sorted.length].angle + (i === sorted.length - 1 ? Math.PI * 2 : 0);
      if (b - a > widest) { widest = b - a; at = (a + b) / 2; }
    }
    add(at);
  }
  if (gates.length > 4) gates.length = 4;
  return { kind, poly, gates };
}

// ---------------------------------------------------------------------------- validation

/** Do two axis-aligned rectangles overlap, allowing a tolerance? */
function rectsOverlap(a, b, tol = 0) {
  return a.x < b.x + b.w - tol && a.x + a.w - tol > b.x
      && a.z < b.z + b.d - tol && a.z + a.d - tol > b.z;
}

/**
 * The assertion the whole design exists to make possible: NOTHING SITS ON A STREET.
 *
 * Used by the experiment's validator overlay and by the node tests. If this ever returns a hit, the
 * planner is broken — not the renderer, not the placement, the planner.
 */
export function overlaps(plan) {
  const hits = [];
  for (let i = 0; i < plan.plots.length; i++) {
    for (let j = i + 1; j < plan.plots.length; j++) {
      if (rectsOverlap(plan.plots[i], plan.plots[j], 0.01)) hits.push({ kind: 'plot-plot', i, j });
    }
  }
  for (const p of plan.plots) {
    for (const s of plan.streets) {
      const half = s.width / 2;
      const sx = Math.min(s.a[0], s.b[0]) - half, sz = Math.min(s.a[1], s.b[1]) - half;
      const sw = Math.abs(s.b[0] - s.a[0]) + s.width, sd = Math.abs(s.b[1] - s.a[1]) + s.width;
      if (rectsOverlap(p, { x: sx, z: sz, w: sw, d: sd }, 0.01)) hits.push({ kind: 'plot-street', p, s });
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
