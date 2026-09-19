// Procedural Towns — the building kit.
//
// A BUILDING IS A KIT, NOT A MODEL. `prototypes/farhold/js/features.js` imports this, the gallery
// page draws the same output, and `node --test` checks it, because there is no Three.js and no DOM
// in here — only arithmetic and the tables in `../data/`.
//
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS
//
// The planner next door (`townplan.js`) fixed WHERE a building goes: a plot is the unit, so a house
// can no longer sit on a road. It did nothing about WHAT goes on the plot, and the play-test said so:
//
//   "Some roofs don't line up with the walls."
//   "All the towns look and feel the same."
//   "I'd like houses to have procedural parts and colours, more variety, more bases, more utility
//    places like shops and other things which can be mostly like outdoor stalls."
//   "More variety of houses, roofs, colours, walls, towers, bridges."
//
// Every one of those is the same mistake again, one level down: there were twenty fixed meshes, each
// one a roof modelled NEAR a set of walls, and every town on every world drew from the same twenty.
//
// So a building is described first and built second:
//
//   plot + culture + seed  ->  describeBuilding()  ->  { footprint, storeys, roofType, roofPitch,
//                                                        wallMaterial, roofMaterial, colour, trim,
//                                                        door, windows, chimney, extras, masses }
//                          ->  partsFor()          ->  [{ mesh, x, y, z, w, h, d, yaw, colour }]
//
// `partsFor` returns nothing but unit shapes and numbers, so the 3D game instances them (one
// InstancedMesh per `mesh` kind — eight of them, whatever the town) and the 2D page draws the same
// list as polygons. If the gallery looks right, the game looks right.
//
// ---------------------------------------------------------------------------------------------
//   import { describeBuilding, partsFor, stallsFor, MESHES } from './buildkit.js';
//   const desc = describeBuilding({ plot, culture: 'dwarf', seed: 7 });
//   for (const part of partsFor(desc)) { /* place a unit box/cylinder/prism */ }

import { makeRng } from './townplan.js';
import KIT from '../data/buildkit.json' with { type: 'json' };
import CULTURE_KIT from '../data/cultures.json' with { type: 'json' };

export { KIT, CULTURE_KIT };

/**
 * The eight unit shapes everything in a town is made of.
 *
 * Section 3.19 — "keep the `BUILDING_INFO.cap` discipline, one InstancedMesh per part type". A town
 * of sixty buildings is eight draw calls, not sixty, because a dwarf blockhouse and an elf bower are
 * the same boxes and prisms at different sizes and colours.
 *
 * Every one of them has its ORIGIN AT THE CENTRE OF ITS BASE and is one metre in each direction, so
 * a part's `y` is always the bottom of it and there is never a half-height to remember. A part that
 * needs to run a different way carries a `yaw` rather than a swapped axis.
 */
export const MESHES = [
  'box',      // walls, slabs, doors, windows, posts, tables, crates, fences, parapets
  'cyl',      // round walls, towers, chimneys, trunks, barrels
  'gable',    // triangular prism, ridge along +Z
  'shed',     // right-triangle prism, rising toward -X — lean-tos, sawteeth, gambrel faces
  'hip',      // square pyramid
  'frustum',  // truncated pyramid — mansards and tiers
  'cone',     // conical roofs, turf mounds
  'dome',     // domes and burrow mounds
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** A stable 32-bit hash, so a description can be seeded from a few numbers without collisions. */
export function hash(...nums) {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    let v = Math.imul(Math.round(n * 1000) | 0, 2654435761) >>> 0;
    h = Math.imul(h ^ v, 16777619) >>> 0;
  }
  return h >>> 0 || 1;
}

// ---------------------------------------------------------------------------- colour

const hex = c => {
  const n = parseInt(String(c).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]) =>
  '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

/** Blend two colours. `t` of 0 is all of `a`. */
export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return toHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}

/** Lighten (positive) or darken (negative) by a fraction. */
function shade(c, k) {
  const A = hex(c);
  return toHex(A.map(v => (k >= 0 ? lerp(v, 255, k) : lerp(v, 0, -k))));
}

/** Pull the colour toward its own grey — what weather and soot actually do to a wall. */
function dull(c, k) {
  const A = hex(c);
  const g = A[0] * 0.3 + A[1] * 0.59 + A[2] * 0.11;
  return toHex(A.map(v => lerp(v, g, k)));
}

const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

/** Weighted pick from a `{ key: weight }` table, restricted to `allow` when one is given. */
function weighted(table, rng, allow = null) {
  const keys = Object.keys(table).filter(k => !allow || allow.includes(k));
  if (!keys.length) return null;
  let total = 0;
  for (const k of keys) total += Math.max(0, table[k]);
  if (total <= 0) return keys[0];
  let roll = rng() * total;
  for (const k of keys) { roll -= Math.max(0, table[k]); if (roll <= 0) return k; }
  return keys[keys.length - 1];
}

// ---------------------------------------------------------------------------- the plot

/**
 * The rectangle a building may stand in, in the KIT's own frame.
 *
 * The kit builds every building facing **+Z**, because that is the side the door goes on and it is
 * the one thing every base shares. A plot, though, is an oriented box with its own `angle`, and the
 * street it fronts is one of its four edges — so the kit frame is the plot frame turned by whichever
 * quarter turn puts the frontage on +Z, and the width and depth swap with it.
 *
 * Getting this wrong is how a building ends up deeper than its plot and sticking out over the lane,
 * which is why it is one function used by the game, the page and the tests rather than three.
 *
 * `yaw` is the single rotation that maps the kit frame to the world: a Three.js yaw of `theta` sends
 * local +Z to world (sin theta, cos theta), and the frontage direction is (cos facing, sin facing),
 * so theta = PI/2 - facing. No quarter turns bolted on, no convention to remember.
 */
export function fitToPlot(plot = {}) {
  const facing = plot.facing ?? 0;
  const quarter = Math.round((facing - (plot.angle ?? 0)) / (Math.PI / 2));
  const sideways = Math.abs(quarter % 2) === 1;   // the frontage is on one of the plot's Z edges
  return {
    w: sideways ? (plot.w ?? 6) : (plot.d ?? 6),  // across the front
    d: sideways ? (plot.d ?? 6) : (plot.w ?? 6),  // back from the street
    yaw: Math.PI / 2 - facing,
  };
}

// ---------------------------------------------------------------------------- the description

/**
 * Turn a plot into a building description.
 *
 * Deterministic from `seed` alone: the same plot in the same town is the same building every time
 * you walk back into it, and nothing has to be stored. `townSeed` shifts the whole town's palette a
 * little, so a region reads as one place (section 3.7) without any two towns matching.
 */
export function describeBuilding({
  plot = {}, culture = 'human', seed = 1, townSeed = 0, want = null, district = null,
} = {}) {
  const cult = CULTURE_KIT.cultures[culture] || CULTURE_KIT.cultures.human;
  const K = KIT.knobs;
  const rng = makeRng(hash(seed, plot.cx ?? 0, plot.cz ?? 0));
  const job = want || plot.want || 'house';
  const area = district || plot.district || 'residential';

  // ---- how well off this building is, which decides its materials and how straight it stands
  const W = CULTURE_KIT.wealth;
  let wealth = clamp(
    ((W.byDistrict[area] ?? 0.4) + (W.byWant[job] ?? 0.4)) / 2 + (rng() - 0.5) * W.jitter * 2,
    0.02, 0.98,
  );

  // ---- the ground it has to fit on
  const fit = fitToPlot(plot);
  const avail = {
    w: Math.max(2.4, fit.w - K.plotInset * 2),
    d: Math.max(2.4, fit.d - K.plotInset * 2),
  };

  // ---- which base. The culture's own table, narrowed to what fits, and leaned toward the trade
  const fits = k => {
    const b = KIT.bases[k];
    return b && avail.w >= b.min[0] && avail.d >= b.min[1];
  };
  const cultureBases = Object.keys(cult.bases).filter(fits);
  const prefer = (CULTURE_KIT.wantBases[job] || []).filter(k => cultureBases.includes(k));
  const pool = prefer.length && rng() < 0.82 ? prefer : cultureBases;
  const baseKey = weighted(cult.bases, rng, pool.length ? pool : cultureBases) || 'hovel';
  const base = KIT.bases[baseKey] || KIT.bases.hovel;

  // ---- the footprint. Capped by the base so a big plot leaves a yard rather than a bigger house
  let w = Math.min(avail.w, base.max[0]);
  let d = Math.min(avail.d, base.max[1]);
  const ratio = lerp(base.ratio[0], base.ratio[1], rng());
  if (w / d > ratio) w = d * ratio; else d = w / ratio;
  w = Math.min(avail.w, w * (1 - rng() * K.sizeJitter));
  d = Math.min(avail.d, d * (1 - rng() * K.sizeJitter));
  w = Math.max(2.2, w); d = Math.max(2.2, d);

  // ---- how tall. Money buys a storey; the culture decides how tall a storey is
  const storeys = clamp(
    Math.round(lerp(base.storeys[0], base.storeys[1], rng() * 0.7 + wealth * 0.3)),
    1, 6,
  );
  const storeyHeight = lerp(K.storeyHeight[0], K.storeyHeight[1], rng()) * (cult.storeyScale ?? 1);

  // ---- roof type, then the material, then the pitch they agree on
  const roofType = weighted(cult.roofs, rng, base.roofs.filter(r => KIT.roofs[r])) || base.roofs[0];
  const roofDef = KIT.roofs[roofType];
  const okRoofMat = Object.keys(cult.roofMaterials).filter(m => {
    const def = KIT.roofMaterials[m];
    if (!def) return false;
    if (wealth < def.wealth[0] - 0.12 || wealth > def.wealth[1] + 0.12) return false;
    return Math.min(def.pitch[1], roofDef.pitch[1]) >= Math.max(def.pitch[0], roofDef.pitch[0]);
  });
  const roofMaterial = weighted(cult.roofMaterials, rng, okRoofMat)
    || Object.keys(cult.roofMaterials)[0];
  const rMat = KIT.roofMaterials[roofMaterial];
  const lo = Math.max(rMat.pitch[0], roofDef.pitch[0]);
  const hi = Math.max(lo, Math.min(rMat.pitch[1], roofDef.pitch[1]));
  const roofPitch = lerp(lo, hi, rng());

  const okWallMat = Object.keys(cult.wallMaterials).filter(m => {
    const def = KIT.wallMaterials[m];
    return def && wealth >= def.wealth[0] - 0.12 && wealth <= def.wealth[1] + 0.12;
  });
  const wallMaterial = weighted(cult.wallMaterials, rng, okWallMat)
    || Object.keys(cult.wallMaterials)[0];
  const wMat = KIT.wallMaterials[wallMaterial];

  // ---- colour: the palette says what the town is, the material says what the building is made of,
  // and a town-wide nudge keeps a region looking like one place (section 3.7)
  const townRng = makeRng(hash(townSeed + 1));
  const townShift = (townRng() - 0.5) * 0.09;
  const jit = () => (rng() - 0.5) * K.colourJitter * 2;
  const tint = c => shade(mix(c, wMat.colour, 0.42), townShift + jit());
  let wallColour = tint(pick(cult.palette.wall, rng));
  let upperColour = tint(pick(cult.palette.wallUpper, rng));
  let roofColour = shade(mix(pick(cult.palette.roof, rng), rMat.colour, 0.5), townShift + jit());

  // section 3.8: poor is grey and patched, rich is painted
  if (wealth < 0.4) {
    const k = (0.4 - wealth) * 0.9;
    wallColour = dull(shade(wallColour, -k * 0.35), k);
    upperColour = dull(shade(upperColour, -k * 0.35), k);
    roofColour = dull(roofColour, k * 0.8);
  } else if (wealth > 0.7) {
    wallColour = shade(wallColour, (wealth - 0.7) * 0.28);
  }

  const colour = {
    wall: wallColour,
    wallUpper: upperColour,
    roof: roofColour,
    trim: pick(cult.palette.trim, rng),
    door: pick(cult.palette.door, rng),
    accent: cult.palette.accent,
    glass: wealth > 0.55 ? '#9fc4d8' : '#2a2620',
  };

  // ---- the masses: the base's fractions turned into real rectangles
  const masses = (base.masses || []).map((m, i) => ({
    index: i,
    x: (m.x ?? 0) * w,
    z: (m.z ?? 0) * d,
    w: Math.max(0.8, (m.w ?? 1) * w),
    d: Math.max(0.8, (m.d ?? 1) * d),
    storeys: Math.max(1, Math.round(storeys * (m.storeys ?? 1)) + (m.storeyBump ?? 0)),
    floor: m.floor ?? 0,
    roof: m.roof ?? 'main',
    shape: m.shape === 'round' ? 'round' : 'box',
    lift: (m.lift ?? 0),
    sink: (m.sink ?? 0) * storeyHeight,
    // metres the upper storeys hang out over the street, if this base jetties at all
    jetty: (m.jetty ?? 0) * lerp(K.jetty[0], K.jetty[1], rng()) * 2,
    taper: m.taper ?? 0,
    band: !!m.band,
    low: m.low ?? 1,
  }));

  // the mass whose front edge is furthest toward the street is the one the door goes in
  let frontMass = masses[0];
  for (const m of masses) if (m.floor === 0 && m.z + m.d / 2 > frontMass.z + frontMass.d / 2) frontMass = m;

  const doorW = clamp(lerp(K.doorWidth[0], K.doorWidth[1], rng()), 0.8, frontMass.w * 0.55);
  const door = {
    mass: frontMass.index,
    x: frontMass.x + (rng() - 0.5) * Math.max(0, frontMass.w - doorW * 2.4) * 0.6,
    z: frontMass.z + frontMass.d / 2,
    w: doorW,
    h: Math.min(lerp(K.doorHeight[0], K.doorHeight[1], rng()), storeyHeight - 0.25),
    round: (base.extras || []).includes('round_door'),
  };

  // ---- windows follow the frontage and the storeys, they are not scattered (section 3.9)
  const windows = [];
  for (const m of masses) {
    if (m.shape === 'round') continue;
    const tall = m.storeys;
    for (let s = 0; s < tall; s++) {
      for (const side of ['front', 'left', 'right']) {
        const run = side === 'front' ? m.w : m.d;
        const n = Math.floor(run / K.windowSpacing);
        if (n < 1) continue;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n - 0.5;
          const along = t * run * 0.86;
          // the ground floor gives up its middle bay to the door
          if (s === 0 && side === 'front' && m.index === frontMass.index
              && Math.abs(m.x + along - door.x) < door.w * 1.1) continue;
          if (s === 0 && side !== 'front' && rng() < 0.4) continue;
          windows.push({
            mass: m.index, side, storey: s + m.floor,
            along,
            w: lerp(KIT.knobs.windowSize[0], KIT.knobs.windowSize[1], rng()),
            h: lerp(KIT.knobs.windowSize[0], KIT.knobs.windowSize[1], rng()) * 1.15,
            shutters: wealth > 0.45 && rng() < 0.5,
          });
        }
      }
    }
    if (windows.length > 26) break;      // a budget, not a rule of architecture
  }

  // ---- a chimney, unless the roof is a tent or a sheet of canvas
  const smokeless = roofType === 'tent' || roofMaterial === 'canvas';
  const chimney = (!smokeless && rng() < K.chimneyChance) ? {
    mass: masses[0].index,
    x: masses[0].x + (rng() < 0.5 ? -1 : 1) * masses[0].w * 0.3,
    z: masses[0].z - masses[0].d * 0.22,
    r: lerp(0.28, 0.46, rng()),
    rise: lerp(0.9, 2.1, rng()),
    round: wMat.beams < 0.3 && rng() < 0.4,
  } : null;

  /**
   * Attached outbuildings, fences, the clutter that says somebody lives here — as far as the YARD
   * will take them.
   *
   * A lean-to is 2.6 m of shed hanging off the side wall. On a plot the building already fills, that
   * is 2.6 m into next door, and the assertion the whole design exists to make — nothing sits on a
   * street — would be true of the house and false of its woodpile. So an extra is only built when
   * there is room between the wall and the edge of the plot to stand it in.
   */
  const slack = KIT.extras.yardSlack ?? 1;
  const yard = { front: (fit.d - d) / 2 + slack, side: (fit.w - w) / 2 + slack, none: Infinity };
  const roomFor = (e) => {
    const [reach, axis] = KIT.extras.reach[e] || [0, 'none'];
    return reach <= (yard[axis] ?? Infinity);
  };
  const allowed = (base.extras || []).filter(e => KIT.extras.list.includes(e)).filter(roomFor);
  const extras = [];
  const count = clamp(Math.round(lerp(1, 3.4, rng())), 1, Math.max(1, allowed.length));
  for (let i = 0; i < count && allowed.length; i++) {
    const e = allowed[Math.floor(rng() * allowed.length)];
    if (!extras.includes(e)) extras.push(e);
  }
  // section 3.10: a trade building says so, and a hanging sign reads at a distance
  if (job !== 'house' && job !== 'hut' && rng() < K.signChance && !extras.includes('sign')
      && roomFor('sign')) {
    extras.push('sign');
  }

  return {
    schema: 1,
    base: baseKey, baseName: base.name, culture, want: job, district: area, seed,
    footprint: { w, d },
    plotFit: fit,
    storeys, storeyHeight,
    roofType, roofPitch, roofMaterial, wallMaterial,
    colour,
    trim: { beams: wMat.beams, band: masses.some(m => m.band) },
    wealth,
    // a poor building has settled; a rich one has not. Tiny, and it is most of what says "old"
    lean: wealth < 0.35 ? (rng() - 0.5) * 2 * KIT.knobs.leanOnPoor : 0,
    masses, door, windows, chimney, extras,
    yaw: fit.yaw,
  };
}

// ---------------------------------------------------------------------------- the roof

/**
 * THE ROOF IS GENERATED FROM THE WALL RECTANGLE. This is the permanent fix.
 *
 * "Some roofs don't line up with the walls" was not a tuning problem. Each of the twenty old models
 * had a roof cone written next to a wall box in a table of magic numbers, and any of those numbers
 * could be — and several were — a few centimetres out. The only way to stop that happening again is
 * to make it impossible to express: this function takes `rect`, THE RECTANGLE THE WALLS ACTUALLY
 * OCCUPY, and there is no other source of position or size in it. There is no parameter here that
 * could disagree with the walls, because there is no parameter here that describes the walls.
 *
 * Everything it returns is centred on `rect.x, rect.z` and is `rect.w + 2*eave` by `rect.d + 2*eave`.
 * The overhang is the only licence it takes, it is the same on all four sides, and
 * `tests/buildkit.test.js` asserts the covering across every base, roof, culture and seed.
 */
export function roofFor(rect, {
  type = 'gable', pitch = 0.9, colour = '#7a4a3a', trim = '#5a4632', eave = 0.3,
  thick = 0.15, maxHeight = 6.5, ridgeAlong = 'z', mass = 0,
} = {}) {
  const parts = [];
  const w = rect.w + eave * 2;
  const d = rect.d + eave * 2;
  const x = rect.x, z = rect.z, y = rect.y;      // y is the top of the walls
  const span = Math.min(w, d);
  const h = Math.min(maxHeight, Math.max(0.25, pitch * span / 2));
  const add = (mesh, px, py, pz, pw, ph, pd, yaw = 0, c = colour, tag = 'roof') =>
    parts.push({ mesh, x: px, y: py, z: pz, w: pw, h: ph, d: pd, yaw, colour: c, tag, mass });

  /**
   * The eave board: one thin slab the exact size of the roof.
   *
   * It is the thing you see from below, it is the reason the join between wall and roof never shows
   * a gap, and on a dome or a cone it is the square deck the round part sits on — which is also why
   * it is the ROOF's colour darkened rather than the trim colour. Painted in trim it drew a heavy
   * band round every building: gold on every dwarf house, indigo on every desert one.
   */
  add('box', x, y - thick * 0.5, z, w, thick, d, 0, shade(colour, -0.22), 'eave');

  const ridgeZ = ridgeAlong === 'z';
  const rw = ridgeZ ? w : d;                 // across the slope
  const rd = ridgeZ ? d : w;                 // along the ridge
  const yaw = ridgeZ ? 0 : Math.PI / 2;

  switch (type) {
    case 'gable':
      add('gable', x, y, z, rw, h, rd, yaw);
      break;

    case 'half_hip': {
      // A gable with its two ends clipped back — the little pyramids are what does the clipping.
      // They sit so their OUTER face lands on the end of the roof: put at a fraction of the way
      // along they stuck a metre past a long ridge, and on a fifteen-metre house that is an eave
      // hanging over the lane.
      add('gable', x, y, z, rw, h, rd, yaw);
      const cap = rd * 0.26;
      for (const s of [-1, 1]) {
        const off = (rd / 2 - cap / 2) * s;
        add('hip', x + (ridgeZ ? 0 : off), y, z + (ridgeZ ? off : 0),
          ridgeZ ? rw : cap, h * 0.5, ridgeZ ? cap : rw, 0);
      }
      break;
    }

    case 'hip':
      add('hip', x, y, z, w, h, d);
      break;

    case 'gambrel': {
      // A gable with a kink in it: two steep single-pitch faces at the eaves, and a shallower gable
      // sitting on top of them. The upper half is one prism rather than two more sheds because two
      // sheds meeting at the ridge leave their inner faces exactly on top of each other, and
      // coincident faces flicker in the gallery and z-fight in the game.
      //
      // `slope()` is the fiddly bit. The shed prism rises toward its own -X, so the face on the far
      // side of the ridge has to be turned right round — and which way "round" is depends on whether
      // the ridge runs along Z or X. Written once here rather than four times.
      const hLow = h * 0.6, hHigh = h - hLow;
      const qw = rw / 4;
      const slope = (off, py, ph) => {
        const extra = ridgeZ ? (off > 0 ? 0 : Math.PI) : (off > 0 ? Math.PI : 0);
        add('shed', x + (ridgeZ ? off : 0), py, z + (ridgeZ ? 0 : off), qw, ph, rd, yaw + extra);
      };
      slope(-rw * 0.375, y, hLow);
      slope(rw * 0.375, y, hLow);
      add('gable', x, y + hLow, z, rw / 2, hHigh, rd, yaw);
      break;
    }

    case 'mansard':
      add('frustum', x, y, z, w, h * 0.78, d);
      add('box', x, y + h * 0.78 - thick, z, w * 0.5, thick * 1.4, d * 0.5, 0, colour);
      break;

    case 'flat': {
      add('box', x, y, z, w, thick * 1.6, d, 0, colour);
      const p = KIT.roofs.flat.parapet;
      for (const [dx, dz, pw, pd] of [[0, d / 2 - 0.09, w, 0.18], [0, -d / 2 + 0.09, w, 0.18],
        [w / 2 - 0.09, 0, 0.18, d], [-w / 2 + 0.09, 0, 0.18, d]]) {
        add('box', x + dx, y + thick * 1.6, z + dz, pw, p, pd, 0, trim, 'roof');
      }
      break;
    }

    case 'domed':
      add('dome', x, y, z, w, h, d);
      break;

    case 'conical':
      add('cone', x, y, z, w, h, d);
      break;

    case 'sawtooth': {
      const bays = 3;
      for (let i = 0; i < bays; i++) {
        const bw = rw / bays;
        const bx = -rw / 2 + bw * (i + 0.5);
        add('shed', x + (ridgeZ ? bx : 0), y, z + (ridgeZ ? 0 : bx), bw, h, rd, yaw);
      }
      break;
    }

    case 'pagoda': {
      const tiers = 3;
      for (let i = 0; i < tiers; i++) {
        const k = 1 - i * 0.26;
        const ty = y + (h / tiers) * i;
        // the tier lips are roof, not the eave board — there is only ever one eave board, and the
        // test that a roof covers its walls counts on that
        if (i > 0) add('box', x, ty, z, w * k, thick, d * k, 0, shade(colour, -0.22), 'roof');
        add('frustum', x, ty + thick, z, w * k, h / tiers, d * k);
      }
      break;
    }

    case 'turf_mound':
      add('dome', x, y - thick, z, w, Math.max(0.4, h), d);
      break;

    case 'tent':
      add('hip', x, y, z, w, h, d);
      add('box', x, y + h * 0.5, z, ridgeZ ? 0.14 : rd * 0.9, 0.14, ridgeZ ? rd * 0.9 : 0.14, 0, trim, 'roof');
      break;

    default:
      add('gable', x, y, z, rw, h, rd, yaw);
  }

  return { parts, height: h, eave, top: y + h };
}

// ---------------------------------------------------------------------------- the parts

/**
 * A description becomes a flat list of unit shapes.
 *
 * Kit-local: +Z is the street side, +X is across the front, `y` is the bottom of each part and 0 is
 * the ground the building stands on. The caller rotates the whole list by `desc.yaw` and drops it on
 * the terrain — nothing in here knows about the world.
 */
export function partsFor(desc) {
  const parts = [];
  const K = KIT.knobs;
  const rng = makeRng(hash(desc.seed ?? 1, 17));
  const rMat = KIT.roofMaterials[desc.roofMaterial] || KIT.roofMaterials.thatch;
  const eave = K.eaveBase + K.eavePerPitch * desc.roofPitch;
  const push = (mesh, x, y, z, w, h, d, yaw, colour, tag, mass = 0) => {
    parts.push({ mesh, x, y, z, w, h, d, yaw: yaw || 0, colour, tag, mass });
  };

  const H = desc.storeyHeight;
  let tallest = 0;

  for (const m of desc.masses) {
    const shape = m.shape === 'round' ? 'cyl' : 'box';
    const base = m.floor * H + m.lift - m.sink;
    const wallH = H * (m.low ?? 1);
    let rect = { x: m.x, z: m.z, w: m.w, d: m.d, y: base };

    for (let s = 0; s < m.storeys; s++) {
      const shrink = 1 - m.taper * s;
      const grow = s > 0 ? m.jetty : 0;
      const sw = Math.max(0.5, m.w * shrink + grow);
      const sd = Math.max(0.5, m.d * shrink + grow);
      const y = base + s * wallH;
      const colour = s === 0 ? desc.colour.wall : desc.colour.wallUpper;
      push(shape, m.x, y, m.z, sw, wallH, sd, 0, colour, 'wall', m.index);

      // a dwarf's banded courses, and the sill line every jettied storey sits on
      if (m.band || grow > 0.02) {
        push('box', m.x, y + wallH - 0.14, m.z, sw + 0.1, 0.16, sd + 0.1, 0,
          desc.colour.trim, 'trim', m.index);
      }
      rect = { x: m.x, z: m.z, w: sw, d: sd, y: y + wallH };
    }

    // the exposed frame a timber building wears — four corner posts and a mid-rail
    if (desc.trim.beams > 0.4 && shape === 'box') {
      const top = rect.y;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        push('box', m.x + sx * (m.w / 2 - 0.09), base, m.z + sz * (m.d / 2 - 0.09),
          0.18, top - base, 0.18, 0, desc.colour.trim, 'trim', m.index);
      }
      if (m.storeys > 1) {
        push('box', m.x, base + wallH - 0.1, m.z + m.d / 2 - 0.05, m.w, 0.2, 0.12, 0,
          desc.colour.trim, 'trim', m.index);
      }
    }

    // ---- and now the roof, from THAT rectangle and nothing else
    if (m.roof === 'main') {
      /**
       * THE RIDGE RUNS ALONG THE LONG AXIS, always.
       *
       * It was the other way round to begin with, and a longhouse came out with its ridge across its
       * width: a thirteen-metre slope on a five-metre building, which reads as a shed thrown over a
       * barn. Nobody has ever built one that way, because the rafters would have to be twice as long
       * for no reason.
       */
      const ridgeAlong = rect.w >= rect.d ? 'x' : 'z';
      /**
       * A roof may not be much taller than the walls it covers.
       *
       * `pitch * span / 2` on a wide building gives a roof six metres tall on two metres of wall,
       * and an orc tent came out as a kite with a hut somewhere underneath it. The cap is per mass
       * because a tower house's spire is entitled to be tall — it has a tower under it.
       */
      const wallsHigh = Math.max(1.6, m.storeys * wallH);
      const roof = roofFor(rect, {
        type: desc.roofType, pitch: desc.roofPitch, colour: desc.colour.roof,
        trim: desc.colour.trim, eave, thick: rMat.thick,
        maxHeight: Math.min(K.maxRoofHeight, wallsHigh * 1.35),
        ridgeAlong, mass: m.index,
      });
      parts.push(...roof.parts);
      tallest = Math.max(tallest, roof.top);
    } else if (m.roof === 'lean') {
      // A single pitch falling away from whatever it is leaning on — and the scale here is in the
      // shed's OWN axes, which is why the width and depth look swapped: the prism is turned a
      // quarter so its slope runs back into the building it is propped against.
      const h = Math.max(0.5, desc.roofPitch * Math.min(rect.w, rect.d) / 2.4);
      const front = rect.z > 0;
      push('box', rect.x, rect.y - K.eaveThick, rect.z, rect.w + eave * 2, K.eaveThick,
        rect.d + eave * 2, 0, desc.colour.trim, 'eave', m.index);
      push('shed', rect.x, rect.y, rect.z, rect.d + eave * 2, h, rect.w + eave * 2,
        front ? -Math.PI / 2 : Math.PI / 2, desc.colour.roof, 'roof', m.index);
      tallest = Math.max(tallest, rect.y + h);
    } else if (m.roof === 'eave') {
      // a storey with more building on top of it still gets a lip, or the joint reads as a seam
      push('box', rect.x, rect.y - K.eaveThick, rect.z, rect.w + 0.3, K.eaveThick, rect.d + 0.3,
        0, desc.colour.trim, 'eave', m.index);
      tallest = Math.max(tallest, rect.y);
    } else {
      tallest = Math.max(tallest, rect.y);
    }
  }

  const massOf = i => desc.masses.find(m => m.index === i) || desc.masses[0];

  // ---- the door
  {
    const m = massOf(desc.door.mass);
    const y = m.floor * H + m.lift - m.sink;
    push('box', desc.door.x, y, desc.door.z + 0.06, desc.door.w, desc.door.h, 0.14, 0,
      desc.colour.door, 'door', m.index);
    push('box', desc.door.x, y + desc.door.h, desc.door.z + 0.06, desc.door.w + 0.24, 0.18, 0.2, 0,
      desc.colour.trim, 'trim', m.index);
    if (desc.door.round) {
      // a halfling's round door: the lintel becomes an arch, which is the whole silhouette
      push('cyl', desc.door.x, y + desc.door.h - 0.05, desc.door.z + 0.06,
        desc.door.w * 1.25, 0.16, desc.door.w * 1.25, Math.PI / 2, desc.colour.door, 'door', m.index);
    }
  }

  // ---- windows, on the face they were assigned to
  for (const win of desc.windows) {
    const m = massOf(win.mass);
    const storeyInMass = win.storey - m.floor;
    if (storeyInMass < 0 || storeyInMass >= m.storeys) continue;
    const wallH = H * (m.low ?? 1);
    const y = m.floor * H + m.lift - m.sink + storeyInMass * wallH + wallH * 0.38;
    const grow = storeyInMass > 0 ? m.jetty : 0;
    const shrink = 1 - m.taper * storeyInMass;
    const sw = m.w * shrink + grow, sd = m.d * shrink + grow;
    let x = m.x, z = m.z;
    const ww = win.w, dd = 0.12;
    if (win.side === 'front') { z = m.z + sd / 2 + 0.03; x = m.x + win.along; }
    else if (win.side === 'left') { x = m.x - sw / 2 - 0.03; z = m.z + win.along; }
    else { x = m.x + sw / 2 + 0.03; z = m.z + win.along; }
    push('box', x, y, z, win.side === 'front' ? ww : dd, win.h, win.side === 'front' ? dd : ww, 0,
      desc.colour.glass, 'window', m.index);
    if (win.shutters) {
      const off = (win.side === 'front' ? ww : ww) / 2 + 0.11;
      for (const s of [-1, 1]) {
        push('box',
          win.side === 'front' ? x + s * off : x,
          y, win.side === 'front' ? z : z + s * off,
          win.side === 'front' ? 0.16 : 0.14, win.h, win.side === 'front' ? 0.14 : 0.16,
          0, desc.colour.trim, 'trim', m.index);
      }
    }
  }

  // ---- the chimney, rising clear of whatever roof it came out of
  if (desc.chimney) {
    const m = massOf(desc.chimney.mass);
    const y = m.floor * H + m.lift - m.sink;
    const top = Math.max(tallest, y + m.storeys * H) + desc.chimney.rise;
    // a chimney is masonry, whatever the trim is painted: in trim it came out blood red in an orc
    // town and brass in a dwarf one, and a stack of bricks is a stack of bricks
    const stack = mix(desc.colour.wall, '#6b6259', 0.55);
    push(desc.chimney.round ? 'cyl' : 'box', desc.chimney.x, y, desc.chimney.z,
      desc.chimney.r * 2, top - y, desc.chimney.r * 2, 0, stack, 'chimney', m.index);
    push('box', desc.chimney.x, top, desc.chimney.z, desc.chimney.r * 2.5, 0.18,
      desc.chimney.r * 2.5, 0, shade(stack, -0.2), 'chimney', m.index);
  }

  // ---- everything hanging off the outside
  const front = massOf(desc.door.mass);
  const frontZ = front.z + front.d / 2;
  for (const extra of desc.extras) {
    switch (extra) {
      case 'porch':
        push('box', desc.door.x, desc.door.h + 0.2, frontZ + 0.7, desc.door.w + 1.5, 0.16, 1.7,
          0, desc.colour.trim, 'extra', front.index);
        for (const s of [-1, 1]) {
          push('box', desc.door.x + s * (desc.door.w / 2 + 0.6), 0, frontZ + 1.35,
            0.16, desc.door.h + 0.2, 0.16, 0, desc.colour.trim, 'extra', front.index);
        }
        break;
      case 'leanto': {
        const m = desc.masses[0];
        const h = H * 0.72;
        push('box', m.x - m.w / 2 - 1.1, 0, m.z, 2.2, h, Math.min(m.d * 0.7, 3.4), 0,
          desc.colour.wall, 'extra', m.index);
        // tagged as an extra, not a roof: it is an outbuilding with its own lid, and the check
        // that a roof covers its walls is about the roof the kit derived from the wall rectangle
        push('shed', m.x - m.w / 2 - 1.1, h, m.z, 2.4, 0.9, Math.min(m.d * 0.7, 3.4) + 0.3,
          0, desc.colour.roof, 'extra', m.index);
        break;
      }
      case 'woodpile':
        for (let i = 0; i < 3; i++) {
          push('cyl', front.x - front.w / 2 - 0.8, i * 0.32, frontZ - 1.2 + i * 0.05,
            0.3, 1.9, 0.3, Math.PI / 2, mix(desc.colour.trim, '#6b5636', 0.5), 'extra', front.index);
        }
        break;
      case 'fence': {
        const run = desc.footprint.w + 1.4;
        const n = Math.max(3, Math.round(run / 1.1));
        for (let i = 0; i < n; i++) {
          push('box', -run / 2 + run * (i / (n - 1)), 0, frontZ + 1.8, 0.1, 0.95, 0.1, 0,
            desc.colour.trim, 'extra', front.index);
        }
        push('box', 0, 0.72, frontZ + 1.8, run, 0.08, 0.08, 0, desc.colour.trim, 'extra', front.index);
        break;
      }
      case 'garden':
        push('box', front.x + front.w * 0.42, 0, frontZ + 1.2, 1.8, 0.24, 1.4, 0,
          mix(desc.colour.accent, '#4a5a34', 0.7), 'extra', front.index);
        break;
      case 'bench':
        push('box', front.x - front.w * 0.3, 0.4, frontZ + 0.55, 1.5, 0.12, 0.42, 0,
          desc.colour.trim, 'extra', front.index);
        for (const s of [-1, 1]) {
          push('box', front.x - front.w * 0.3 + s * 0.6, 0, frontZ + 0.55, 0.12, 0.4, 0.4, 0,
            desc.colour.trim, 'extra', front.index);
        }
        break;
      case 'stair': case 'spiral_stair': {
        const m = desc.masses[desc.masses.length - 1];
        const steps = Math.max(3, Math.round((m.floor * H + m.lift) / 0.4) || 5);
        for (let i = 0; i < steps; i++) {
          const r = extra === 'spiral_stair' ? (i / steps) * Math.PI * 1.6 : 0;
          const rad = m.w / 2 + 0.5;
          push('box',
            extra === 'spiral_stair' ? m.x + Math.cos(r) * rad : m.x + m.w / 2 + 0.6,
            i * 0.4,
            extra === 'spiral_stair' ? m.z + Math.sin(r) * rad : m.z - m.d / 2 + 0.5 + i * 0.42,
            1.0, 0.16, 0.8, r, desc.colour.trim, 'extra', m.index);
        }
        break;
      }
      case 'balcony': {
        const m = desc.masses[desc.masses.length - 1];
        const y = (m.floor + Math.max(0, m.storeys - 1)) * H + m.lift - m.sink;
        push('box', m.x, y, m.z + m.d / 2 + 0.5, m.w * 0.7, 0.14, 1.1, 0, desc.colour.trim, 'extra', m.index);
        push('box', m.x, y + 0.14, m.z + m.d / 2 + 1.0, m.w * 0.7, 0.8, 0.1, 0, desc.colour.trim, 'extra', m.index);
        break;
      }
      case 'stilts': {
        const m = desc.masses[0];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          push('cyl', m.x + sx * (m.w / 2 - 0.4), 0, m.z + sz * (m.d / 2 - 0.4),
            0.32, m.lift, 0.32, 0, desc.colour.trim, 'extra', m.index);
        }
        break;
      }
      case 'columns':
        for (const s of [-1, 1]) {
          push('cyl', front.x + s * front.w * 0.36, 0, frontZ + 0.6, 0.5, H * 1.4, 0.5, 0,
            desc.colour.trim, 'extra', front.index);
        }
        break;
      case 'steps':
        for (let i = 0; i < 3; i++) {
          push('box', desc.door.x, i * 0.2, frontZ + 0.9 - i * 0.3, desc.door.w + 1.4 - i * 0.2,
            0.2, 0.9 - i * 0.28, 0, desc.colour.trim, 'extra', front.index);
        }
        break;
      case 'banner':
        push('box', front.x, H * 0.9, frontZ + 0.12, 0.7, 1.9, 0.06, 0,
          desc.colour.accent, 'extra', front.index);
        break;
      case 'sign':
        push('box', front.x + front.w * 0.38, H * 0.95, frontZ + 0.5, 0.1, 0.1, 1.0, 0,
          desc.colour.trim, 'extra', front.index);
        push('box', front.x + front.w * 0.38, H * 0.5, frontZ + 0.92, 0.08, 0.75, 0.75, 0,
          desc.colour.accent, 'extra', front.index);
        break;
      case 'shutters': break;      // already handled per window
      case 'washing':
        push('box', front.x, H * 1.15, frontZ + 1.3, desc.footprint.w * 0.8, 0.04, 0.04, 0,
          desc.colour.trim, 'extra', front.index);
        for (let i = 0; i < 3; i++) {
          push('box', front.x - desc.footprint.w * 0.25 + i * desc.footprint.w * 0.25,
            H * 1.15 - 0.6, frontZ + 1.3, 0.45, 0.6, 0.03, 0,
            shade(desc.colour.wallUpper, 0.2), 'extra', front.index);
        }
        break;
      case 'cellar':
        push('shed', front.x - front.w * 0.34, 0, frontZ + 0.7, 1.2, 0.55, 1.4, 0,
          desc.colour.trim, 'extra', front.index);
        break;
      case 'gate_arch':
        push('box', desc.door.x, desc.door.h + 0.2, desc.door.z + 0.15, desc.door.w + 1.1, 0.7, 0.4,
          0, desc.colour.trim, 'extra', front.index);
        break;
      case 'well_head':
        push('cyl', 0, 0, 0, 1.4, 0.8, 1.4, 0, desc.colour.trim, 'extra', front.index);
        break;
      case 'awning':
        push('box', desc.door.x, H * 0.82, frontZ + 1.1, desc.footprint.w * 0.7, 0.1, 2.2, 0,
          desc.colour.accent, 'extra', front.index);
        for (const s of [-1, 1]) {
          push('box', desc.door.x + s * desc.footprint.w * 0.32, 0, frontZ + 2.1,
            0.12, H * 0.82, 0.12, 0, desc.colour.trim, 'extra', front.index);
        }
        break;
      case 'roof_terrace': {
        const m = desc.masses[0];
        const y = m.floor * H + m.lift - m.sink + m.storeys * H + 0.2;
        push('box', m.x, y, m.z + m.d / 2 - 0.1, m.w, 0.5, 0.14, 0, desc.colour.trim, 'extra', m.index);
        break;
      }
      case 'hanging_lamp':
        push('box', desc.door.x - desc.door.w, H * 0.95, frontZ + 0.35, 0.06, 0.5, 0.06, 0,
          desc.colour.trim, 'extra', front.index);
        push('box', desc.door.x - desc.door.w, H * 0.6, frontZ + 0.35, 0.34, 0.38, 0.34, 0,
          desc.colour.accent, 'lamp', front.index);
        break;
      case 'round_door': break;    // the arch is drawn with the door
      case 'cage':
        push('box', front.x + front.w * 0.4, H * 1.1, frontZ + 0.6, 0.7, 1.0, 0.7, 0,
          desc.colour.trim, 'extra', front.index);
        break;
      case 'brazier':
        push('cyl', front.x - front.w * 0.42, 0, frontZ + 0.9, 0.36, 1.0, 0.36, 0,
          desc.colour.trim, 'extra', front.index);
        push('cyl', front.x - front.w * 0.42, 1.0, frontZ + 0.9, 0.7, 0.32, 0.7, 0,
          desc.colour.accent, 'lamp', front.index);
        break;
      case 'totems':
        for (const s of [-1, 1]) {
          push('cyl', front.x + s * (front.w / 2 + 0.7), 0, frontZ + 0.6, 0.3, 3.0, 0.3, 0,
            desc.colour.trim, 'extra', front.index);
          push('box', front.x + s * (front.w / 2 + 0.7), 3.0, frontZ + 0.6, 0.55, 0.5, 0.55, 0,
            desc.colour.accent, 'extra', front.index);
        }
        break;
      case 'pit_fire':
        push('cyl', 0, 0, frontZ + 2.2, 1.5, 0.28, 1.5, 0, desc.colour.trim, 'extra', front.index);
        push('cyl', 0, 0.28, frontZ + 2.2, 0.8, 0.3, 0.8, 0, desc.colour.accent, 'lamp', front.index);
        break;
      case 'hide_flap':
        push('box', desc.door.x, 0, desc.door.z + 0.18, desc.door.w + 0.4, desc.door.h + 0.3, 0.1,
          0, mix(desc.colour.door, desc.colour.accent, 0.4), 'extra', front.index);
        break;
      case 'chimney_stub':
        push('cyl', front.x + front.w * 0.35, 0, front.z - front.d * 0.3, 0.5, H * 1.3, 0.5, 0,
          desc.colour.trim, 'chimney', front.index);
        break;
      default: break;
    }
  }

  // `desc.lean` is not applied here on purpose: it is a few degrees of yaw the CALLER adds when it
  // stands the building on its plot, so a poor house sits a little off the line its neighbours keep.
  // Baking it into every part would tilt the parts against each other, which is a different bug.
  rng();
  return parts;
}

/**
 * The rectangle the TOP storey's walls occupy — the one rectangle a roof is ever derived from.
 *
 * Exported because the gallery and the tests both have to be able to ask "what was the roof given?"
 * without guessing, and a guess is exactly how the old twenty models drifted out of line.
 */
export function topRect(m) {
  const s = m.storeys - 1;
  const shrink = 1 - m.taper * s;
  const grow = s > 0 ? m.jetty : 0;
  return {
    x: m.x, z: m.z,
    w: Math.max(0.5, m.w * shrink + grow),
    d: Math.max(0.5, m.d * shrink + grow),
  };
}

/**
 * Does every roofed mass have a roof that covers its own walls?
 *
 * The check the play-test asked for, written down: take the parts the kit produced, take the union
 * of everything tagged roof or eave for one mass, and make sure it reaches past all four walls. It
 * cannot fail while `roofFor` is the only way a roof is made — which is the point of it being a
 * check rather than a hope.
 */
export function roofsCover(desc, parts = partsFor(desc)) {
  for (const m of desc.masses) {
    if (m.roof !== 'main') continue;
    const roof = parts.filter(p => p.mass === m.index && (p.tag === 'roof' || p.tag === 'eave'));
    if (!roof.length) return false;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of roof) {
      // a part that carries a yaw covers a rotated box, so take its axis-aligned extent
      const c = Math.abs(Math.cos(p.yaw || 0)), s = Math.abs(Math.sin(p.yaw || 0));
      const w = p.w * c + p.d * s, d = p.w * s + p.d * c;
      x0 = Math.min(x0, p.x - w / 2); x1 = Math.max(x1, p.x + w / 2);
      z0 = Math.min(z0, p.z - d / 2); z1 = Math.max(z1, p.z + d / 2);
    }
    const top = topRect(m);
    if (x0 > top.x - top.w / 2 + 1e-6 || x1 < top.x + top.w / 2 - 1e-6) return false;
    if (z0 > top.z - top.d / 2 + 1e-6 || z1 < top.z + top.d / 2 - 1e-6) return false;
  }
  return true;
}

/** How tall the finished building stands, for collision and for the level-of-detail cut. */
export function heightOf(desc) {
  let top = 0;
  for (const p of partsFor(desc)) top = Math.max(top, p.y + p.h);
  return top;
}

/** The circle a building fills, for the obstacle field. Half the footprint diagonal, near enough. */
export function radiusOf(desc) {
  let r = 0;
  for (const m of desc.masses) {
    r = Math.max(r, Math.hypot(Math.abs(m.x) + m.w / 2, Math.abs(m.z) + m.d / 2));
  }
  return r * 0.82;
}

// ---------------------------------------------------------------------------- outdoor stalls

/**
 * An outdoor stall: an awning, a table and some goods (section 3.17).
 *
 * The user asked for these by name — "more utility places like shops and other things which can be
 * mostly like outdoor stalls". They are deliberately NOT buildings: they need no plot, they go where
 * people already are (the square, and the kerb of a main street), and they are four posts and a
 * sheet, so a market is twenty of them rather than one big model.
 */
export function describeStall({ kind = 'produce', culture = 'human', seed = 1 } = {}) {
  const rng = makeRng(hash(seed, 91));
  const S = KIT.stalls;
  const cult = CULTURE_KIT.cultures[culture] || CULTURE_KIT.cultures.human;
  const def = S.kinds[kind] || S.kinds.produce;
  return {
    kind, culture, seed, name: def.name, goods: def.goods,
    w: lerp(S.size.w[0], S.size.w[1], rng()),
    d: lerp(S.size.d[0], S.size.d[1], rng()),
    postH: lerp(S.size.postH[0], S.size.postH[1], rng()),
    tableH: S.size.tableH,
    colour: {
      awning: mix(def.awning, cult.palette.accent, 0.35),
      frame: pick(cult.palette.trim, rng),
      goods: mix(pick(cult.palette.wall, rng), def.awning, 0.4),
    },
  };
}

/** The same unit shapes a building is made of, so a stall costs no extra draw call. */
export function stallParts(stall) {
  const parts = [];
  const { w, d, postH, tableH, colour } = stall;
  const push = (mesh, x, y, z, pw, ph, pd, c, tag = 'stall', yaw = 0) =>
    parts.push({ mesh, x, y, z, w: pw, h: ph, d: pd, yaw, colour: c, tag, mass: 0 });

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    push('box', sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), 0.11, postH, 0.11, colour.frame);
  }
  /**
   * The awning, and it SLOPES.
   *
   * A flat slab on four posts draws a stall as a table with a lid on it, which is what the gallery
   * showed the first time. One shed prism, high at the back and low over the counter, is the shape
   * everybody recognises — and it is the same unit prism a lean-to is made of, so it costs nothing.
   */
  // …and it is set back off the counter, or it roofs the goods over and you cannot see what is
  // for sale from anywhere but underneath it
  push('shed', 0, postH - 0.42, -0.3, d * 0.8 + 0.4, 0.62, w + 0.6, colour.awning, 'stall', -Math.PI / 2);
  // the trestle
  push('box', 0, tableH, 0.1, w - 0.2, 0.1, d * 0.55, colour.frame);
  for (const sx of [-1, 1]) {
    push('box', sx * (w / 2 - 0.35), 0, 0.1, 0.1, tableH, d * 0.5, colour.frame);
  }
  // and what is on it
  const rng = makeRng(hash(stall.seed, 7));
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.4 + (w - 0.8) * ((i + 0.5) / n);
    if (stall.goods === 'barrels' || stall.goods === 'jars') {
      push('cyl', x, tableH + 0.1, 0.25, 0.4, 0.5, 0.4, colour.goods, 'goods');
    } else {
      push('box', x, tableH + 0.1, 0.25, 0.5, 0.38, 0.5, colour.goods, 'goods');
    }
  }
  return parts;
}

/**
 * Where the stalls stand: a ring around the square, and the kerb of the main streets.
 *
 * Pure, so the 2D page draws them in the same places the game builds them, and a test can check that
 * none of them lands in the middle of the carriageway.
 */
export function stallsFor(plan, { culture = 'human', seed = 1, max = 26 } = {}) {
  const cult = CULTURE_KIT.cultures[culture] || CULTURE_KIT.cultures.human;
  const S = KIT.stalls;
  const kinds = cult.stalls && cult.stalls.length ? cult.stalls : Object.keys(S.kinds);
  const rng = makeRng(hash(seed, 313));
  const out = [];

  // ---- the ring around the square, all of them facing in, because that is where the buyers are
  const sq = plan.square || { cx: 0, cz: 0, r: 7 };
  const count = Math.round(lerp(S.squareRing.count[0], S.squareRing.count[1],
    Math.min(1, (plan.size ?? 3) / 5)));
  const r = Math.max(2.5, sq.r - S.squareRing.inset);
  for (let i = 0; i < count && out.length < max; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.25;
    out.push({
      x: sq.cx + Math.cos(a) * r, z: sq.cz + Math.sin(a) * r,
      // facing back toward the middle of the square
      facing: Math.atan2(sq.cz - (sq.cz + Math.sin(a) * r), sq.cx - (sq.cx + Math.cos(a) * r)),
      kind: kinds[Math.floor(rng() * kinds.length)],
      where: 'square',
      seed: hash(seed, i, 1),
    });
  }

  // ---- and along the main streets, standing on the kerb rather than in the road
  for (const st of plan.streets || []) {
    if (st.cls !== 'main') continue;
    for (let i = 0; i < st.pts.length - 1 && out.length < max; i++) {
      const [ax, az] = st.pts[i], [bx, bz] = st.pts[i + 1];
      const run = Math.hypot(bx - ax, bz - az);
      const steps = Math.floor(run / S.streetSide.everyMetres);
      for (let k = 1; k <= steps && out.length < max; k++) {
        if (rng() > S.streetSide.chance) continue;
        const t = k / (steps + 1);
        const mx = ax + (bx - ax) * t, mz = az + (bz - az) * t;
        const ang = Math.atan2(bz - az, bx - ax);
        const side = rng() < 0.5 ? 1 : -1;
        const off = st.width / 2 + S.streetSide.offset;
        out.push({
          x: mx + Math.cos(ang + Math.PI / 2) * off * side,
          z: mz + Math.sin(ang + Math.PI / 2) * off * side,
          facing: ang - Math.PI / 2 * side,      // the counter looks out at the road
          kind: kinds[Math.floor(rng() * kinds.length)],
          where: 'street',
          seed: hash(seed, i, k, 2),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------- the gallery

/** Every base the kit knows, for the gallery page and for the coverage test. */
export const BASE_KEYS = Object.keys(KIT.bases);
export const ROOF_KEYS = Object.keys(KIT.roofs);
export const CULTURE_KEYS = Object.keys(CULTURE_KIT.cultures);

/**
 * One building forced to a given base and roof, for the gallery.
 *
 * The gallery has to be able to draw combinations a culture would never choose, or it is not a
 * gallery of the kit — it is a gallery of what turned up. Everything else goes through
 * `describeBuilding`.
 */
export function describeSpecimen({
  base = 'long', roof = 'gable', culture = 'human', seed = 1, want = 'house',
} = {}) {
  const def = KIT.bases[base] || KIT.bases.hovel;
  // a plot generous enough that the base gets the footprint it wants, so the gallery compares
  // silhouettes rather than comparing how cramped each one was
  const plot = {
    cx: 0, cz: 0, angle: 0, facing: Math.PI / 2,
    w: def.max[0] + KIT.knobs.plotInset * 2 + 2,
    d: def.max[1] + KIT.knobs.plotInset * 2 + 2,
    want, district: 'craft',
  };
  const desc = describeBuilding({ plot, culture, seed, want });
  if (desc.base !== base || desc.roofType !== roof) {
    // rebuild the parts of the description that the gallery is pinning
    return rebuildAs(desc, base, roof, culture, seed);
  }
  return desc;
}

/** Re-describe with the base and roof pinned — same seed, same colours, different bones. */
function rebuildAs(desc, base, roof, culture, seed) {
  const def = KIT.bases[base];
  const roofDef = KIT.roofs[roof];
  const rng = makeRng(hash(seed, 55));
  const w = def.max[0] * lerp(0.82, 1, rng());
  const d = def.max[1] * lerp(0.82, 1, rng());
  const storeys = Math.round(lerp(def.storeys[0], def.storeys[1], rng()));
  const masses = (def.masses || []).map((m, i) => ({
    index: i,
    x: (m.x ?? 0) * w, z: (m.z ?? 0) * d,
    w: Math.max(0.8, (m.w ?? 1) * w), d: Math.max(0.8, (m.d ?? 1) * d),
    storeys: Math.max(1, Math.round(storeys * (m.storeys ?? 1)) + (m.storeyBump ?? 0)),
    floor: m.floor ?? 0, roof: m.roof ?? 'main',
    shape: m.shape === 'round' ? 'round' : 'box',
    lift: m.lift ?? 0, sink: (m.sink ?? 0) * desc.storeyHeight,
    jetty: (m.jetty ?? 0) * KIT.knobs.jetty[1], taper: m.taper ?? 0,
    band: !!m.band, low: m.low ?? 1,
  }));
  let frontMass = masses[0];
  for (const m of masses) if (m.floor === 0 && m.z + m.d / 2 > frontMass.z + frontMass.d / 2) frontMass = m;
  const out = {
    ...desc, base, baseName: def.name, roofType: roof,
    roofPitch: lerp(roofDef.pitch[0], roofDef.pitch[1], 0.5),
    footprint: { w, d }, storeys, masses,
    door: { ...desc.door, mass: frontMass.index, x: frontMass.x, z: frontMass.z + frontMass.d / 2 },
    windows: desc.windows.filter(win => masses.some(m => m.index === win.mass)),
    chimney: desc.chimney ? { ...desc.chimney, mass: masses[0].index, x: masses[0].x, z: masses[0].z } : null,
    extras: (def.extras || []).slice(0, 2),
  };
  return out;
}
