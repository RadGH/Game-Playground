// Oathwild — gravestones for any cemetery (brainstorm 2026-11-27 §2 "Gravestones — procedural placement"). Pure: no
// DOM, no files, no Math.random — the same inputs give the same stones on the server, in the browser and in the tests.
//
//   const G = planGraves({ seed, quarters, story, keep, heightAt, slopeAt, blocked, inside, names, open })
//     → { stones, openGraves, boxes, circles, graves, byQuarter }
//
//   stones     [{ id, kind, at:[x,z], y, rot, lean, roll, sink, scale, moss, broken, name, dates, quarter, plot?, story? }]
//              kind = one of STONE_KINDS; rot = three.js rotation.y; the grave (and an open grave's hole) lies on the
//              stone's local +z side, so the inscription faces +z. lean = tilt forward (+) / back (-) about the
//              stone's own x axis, roll = a small sideways tilt (radians); sink = metres sunk into the ground.
//              A family plot is one 'family-plot' row (its iron railing) plus the headstones inside (`plot` = its id).
//   openGraves [{ id, at:[x,z] (the hole), y, rot, stone, mound:[x,z], spade:[x,z], quarter, level, outcome, named?, object? }]
//              outcome: 'cache' | 'skeleton' | 'named' | 'ring' (rolled, open.outcomes) or a story grave's own
//              ('ring' with a quest object, 'robbed'). named = { name, monster } — the buried person risen.
//   boxes      solid oriented boxes { x, z, hw, hd, facing } for js/game/ground.js (railings, table tombs, mausoleums)
//   circles    solid round things { x, z, r } (headstones, obelisks, angels, the mound beside an open grave)
//   graves     how many burial plots outside railings (the ones that may be open) — openGraves ≈ graves / open.every
//   byQuarter  { id: { stones, graves, open, kinds: { kind: n } } }
//
// Inputs:
//   quarters  [{ id, name, at:[x,z], size:[w,d], angle, levels, years:[from,to], spacing:[col,row], jitter, skip, bend,
//               small:[[kind, weight]…], big?:{ kinds, every:[col,row], chance }, lean, sink:[lo,hi], moss:[lo,hi],
//               broken, scale:[lo,hi] }]  — an oriented rectangle; rows run along its local x (the `angle`), one row
//               every spacing[1] metres; `bend` pulls rows toward the ground's contour lines (m per m of height).
//   story     fixed graves [{ id, kind, quarter, at, rot, name, dates, open?: { outcome, object } }] — placed first
//   keep      [[x, z, r]…] circles no stone may use (entrances, quest spots)
//   blocked(x, z) → true where no stone may stand (paths, walls, buildings, tree trunks, solid decor)
//   inside(x, z)  → false outside the cemetery
//   names(seed, { gender, family }) → { given, family }   (Name Forge in a browser/server; tableNames() otherwise)
//   open      { every: 60, outcomes:[[id, weight]…], skeleton, named, epithets }
//
// The rule that keeps it honest (lessons rule 25): every stone is a rectangle tested at its corners AND centre against
// paths, walls, buildings and trunks, and against every other stone's grown footprint — never by its centre alone.

import { makeRng, hashStr } from '../../rules/farhold.js';
import { boxesOverlap } from '../town.js';

/**
 * Every stone kind: footprint half sizes (hw along the stone's x, hd along its z), drawn height `h`, the gap kept round
 * it (`pad`), and how it collides (`circle` radius or `box`). `grave` = a burial plot that may be an open grave.
 */
export const STONE_KINDS = Object.freeze({
  'cross-wood':      { hw: 0.32, hd: 0.08, h: 1.15, pad: 0.35, circle: 0.2, grave: true, label: 'wooden cross' },
  'slab':            { hw: 0.36, hd: 0.1, h: 0.8, pad: 0.35, circle: 0.28, grave: true, label: 'plain slab' },
  'headstone-round': { hw: 0.4, hd: 0.12, h: 1.0, pad: 0.35, circle: 0.3, grave: true, label: 'round-topped headstone' },
  'headstone-tall':  { hw: 0.45, hd: 0.14, h: 1.5, pad: 0.4, circle: 0.33, grave: true, label: 'tall headstone' },
  'obelisk':         { hw: 0.45, hd: 0.45, h: 3.4, pad: 0.6, circle: 0.5, big: true, label: 'obelisk' },
  'angel':           { hw: 0.65, hd: 0.65, h: 2.6, pad: 0.7, circle: 0.62, big: true, label: 'angel statue' },
  'table-tomb':      { hw: 0.85, hd: 1.35, h: 1.0, pad: 0.7, box: true, big: true, label: 'table tomb' },
  'family-plot':     { hw: 2.5, hd: 1.9, h: 0.9, pad: 0.8, box: true, big: true, label: 'railed family plot' },
  'mausoleum-small': { hw: 2.3, hd: 2.9, h: 4.6, pad: 1.2, box: true, big: true, label: 'small mausoleum' },
  'mausoleum':       { hw: 3.3, hd: 4.3, h: 6.8, pad: 1.5, box: true, big: true, label: 'mausoleum' },
});
/** Open-grave pieces: the hole on the grave's side of the stone, the mound beside it (solid), the spade in the mound. */
export const OPEN_GRAVE = Object.freeze({ hole: { hw: 0.55, hd: 0.95, ahead: 1.55 }, mound: { hw: 0.5, hd: 0.95, side: 1.2, r: 0.5 } });

const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pickW = (rng, table) => { const tot = table.reduce((s, [, w]) => s + w, 0); let x = rng() * tot; for (const [v, w] of table) if ((x -= w) <= 0) return v; return table[table.length - 1][0]; };
/** Local (lx, lz) in a frame turned `f` (three.js rotation.y) at (cx, cz) → world. Same frame as js/game/ground.js boxes. */
export const fromLocal = (cx, cz, f, lx, lz) => [cx + lx * Math.cos(f) + lz * Math.sin(f), cz - lx * Math.sin(f) + lz * Math.cos(f)];

/** One outcome for an open grave from a roll in [0, 1): the table's weights (70 / 20 / 8 / 2 by default). */
export function rollOutcome(u, outcomes = DEFAULT_OPEN.outcomes) {
  const tot = outcomes.reduce((s, [, w]) => s + w, 0);
  let x = u * tot;
  for (const [id, w] of outcomes) if ((x -= w) < 0) return id;
  return outcomes[outcomes.length - 1][0];
}
export const DEFAULT_OPEN = Object.freeze({ every: 60, outcomes: [['cache', 70], ['skeleton', 20], ['named', 8], ['ring', 2]], skeleton: 'skeleton_warrior', named: 'named_dead', epithets: ['the Restless', 'the Cold', 'the Wakeful', 'the Unburied', 'the Hungry'] });

// A small plain name table for when Name Forge is not handed in (tests, a host without it). Plain, invented-for-here.
const GIVEN = {
  m: ['Alden', 'Bram', 'Cedric', 'Dunstan', 'Edwin', 'Gareth', 'Hugh', 'Ivo', 'Jory', 'Kit', 'Lewin', 'Mathew', 'Ned', 'Osric', 'Piers', 'Roland', 'Simon', 'Tobias', 'Walter', 'Wat'],
  f: ['Agnes', 'Beatrix', 'Cecily', 'Dora', 'Edith', 'Felice', 'Grace', 'Hester', 'Isobel', 'Joan', 'Kate', 'Lettice', 'Mabel', 'Nell', 'Orla', 'Prudence', 'Rose', 'Sybil', 'Tamar', 'Wenna'],
};
const FAMILY = ['Ashdown', 'Barrow', 'Cobb', 'Dene', 'Fairlie', 'Gale', 'Hatch', 'Ives', 'Kemp', 'Lowe', 'Marsh', 'Nash', 'Orme', 'Pryor', 'Quill', 'Rudd', 'Stokes', 'Thorne', 'Underwood', 'Vance', 'Webb', 'Yarrow', 'Coombe', 'Pell-Harris', 'Moss'];
/** Default names: (seed, { gender, family }) → { given, family }. */
export function tableNames(seed, { gender = 'm', family = null } = {}) {
  const r = makeRng(seed >>> 0);
  const g = GIVEN[gender === 'f' ? 'f' : 'm'];
  return { given: g[Math.floor(r() * g.length)], family: family || FAMILY[Math.floor(r() * FAMILY.length)] };
}
// words a name may never carry (docs/banned-names.md + plain-names rule)
const BANNED_WORD = /ember|veil|wyrm|gyre|\brim\b|shove|muster/i;   // lint-ok: the banned words themselves, to keep them OUT of names

// ---------------------------------------------------------------- the spatial index of footprints

function makeIndex(cell = 4) {
  const grid = new Map();
  const key = (i, k) => i * 73856093 ^ k * 19349663;
  const cellsOf = (b) => { const R = Math.hypot(b.hw, b.hd), out = []; for (let i = Math.floor((b.x - R) / cell); i <= Math.floor((b.x + R) / cell); i++) for (let k = Math.floor((b.z - R) / cell); k <= Math.floor((b.z + R) / cell); k++) out.push(key(i, k)); return out; };
  return {
    add(b) { b.R = Math.hypot(b.hw, b.hd); for (const kk of cellsOf(b)) { let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(b); } },
    hits(b) {
      const R = Math.hypot(b.hw, b.hd), seen = new Set();
      for (const kk of cellsOf(b)) for (const o of grid.get(kk) || []) {
        if (seen.has(o)) continue; seen.add(o);
        if (Math.hypot(o.x - b.x, o.z - b.z) > o.R + R) continue;
        if (boxesOverlap(o, b, 0)) return true;
      }
      return false;
    },
  };
}

// ---------------------------------------------------------------- planning

export function planGraves({ seed = 1, quarters = [], story = [], keep = [], heightAt = () => 0, slopeAt = () => 0, blocked = () => false, inside = () => true, names = tableNames, open = {}, maxSlope = 24 } = {}) {
  const O = { ...DEFAULT_OPEN, ...open };
  const idx = makeIndex();
  const stones = [], openGraves = [], boxes = [], circles = [];
  const byQuarter = Object.fromEntries(quarters.map(q => [q.id, { stones: 0, graves: 0, open: 0, kinds: {} }]));
  const Q = Object.fromEntries(quarters.map(q => [q.id, q]));
  let graves = 0, serial = 0;
  const keepHit = (x, z, pad) => keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr + pad);

  // footprint grown by the kind's pad: the walking room round a stone (a mausoleum keeps more than a cross)
  const foot = (kind, x, z, rot, scale = 1) => { const K = STONE_KINDS[kind]; return { x, z, hw: K.hw * scale + K.pad / 2, hd: K.hd * scale + K.pad / 2, facing: rot }; };
  const groundOk = (b) => {
    // the whole footprint every half metre (a 16 cm railing can never slip between two samples), each point inside
    // the cemetery, off every path / wall / trunk, on gentle ground
    const nx = Math.max(1, Math.ceil(b.hw * 4)), nz = Math.max(1, Math.ceil(b.hd * 4));
    for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
      const [x, z] = fromLocal(b.x, b.z, b.facing, -b.hw + 2 * b.hw * i / nx, -b.hd + 2 * b.hd * k / nz);
      if (!inside(x, z) || blocked(x, z) || slopeAt(x, z) > maxSlope) return false;
    }
    return !keepHit(b.x, b.z, Math.hypot(b.hw, b.hd));
  };
  const fits = (b) => groundOk(b) && !idx.hits(b);

  function nameFor(s, q, { gender, family = null, year = null } = {}) {
    for (let t = 0; t < 4; t++) {
      const n = names((s + t * 7919) >>> 0, { gender, family });
      const text = `${n.given} ${n.family}`.trim();
      if (!BANNED_WORD.test(text)) return { given: n.given, family: n.family, text };
    }
    const n = tableNames(s, { gender, family });
    return { given: n.given, family: n.family, text: `${n.given} ${n.family}` };
  }
  function datesFor(r, q, kind) {
    const [y0, y1] = q?.years || [300, 470];
    const died = Math.round(lerp(y0, y1, r()));
    const u = r();
    const age = u < 0.1 ? Math.floor(r() * 5) : u < 0.25 ? 5 + Math.floor(r() * 15) : 20 + Math.floor(Math.pow(r(), 0.8) * 70);
    return kind === 'mausoleum' || kind === 'mausoleum-small' ? `${Math.max(1, died - 40 - Math.floor(r() * 80))}-${died}` : `${Math.max(1, died - age)}-${died}`;
  }

  function addStone(kind, x, z, rot, q, r, extra = {}) {
    const K = STONE_KINDS[kind];
    const scale = extra.scale ?? r2(lerp(...(q?.scale || [0.95, 1.1]), r()));
    const slope = slopeAt(x, z);
    const lean = K.big ? r3((r() - 0.5) * 0.04) : r3((r() - 0.5) * 2 * (q?.lean ?? 0.1) * (1 + slope / 30));
    const id = extra.id || `st${++serial}`;
    const seedN = hashStr(`${seed}:name:${id}`);
    let name, dates;
    if (extra.name) { name = extra.name; dates = extra.dates; }
    else {
      const gender = (seedN & 1) ? 'f' : 'm';
      const n = nameFor(seedN, q, { gender, family: extra.family });
      name = kind === 'mausoleum' || kind === 'mausoleum-small' ? `the ${n.family} family` : kind === 'family-plot' ? `the ${n.family} family plot` : n.text;
      dates = datesFor(makeRng(seedN ^ 0x5bd1), q, kind);
      extra.familyOut = n.family;
    }
    const st = {
      id, kind, at: [r2(x), r2(z)], y: r2(heightAt(x, z)), rot: r3(rot), lean, roll: r3((r() - 0.5) * (K.big ? 0.02 : 0.12)),
      sink: r2(K.big ? r() * 0.05 : lerp(...(q?.sink || [0, 0.15]), r())), scale, moss: r2(lerp(...(q?.moss || [0.2, 0.7]), r())),
      broken: !K.big && kind !== 'cross-wood' && r() < (q?.broken ?? 0.08), name, dates, quarter: q?.id || extra.quarter || null,
    };
    if (extra.plot) st.plot = extra.plot;
    if (extra.story) st.story = extra.story;
    stones.push(st);
    const b = foot(kind, x, z, rot, scale);
    idx.add(b);
    if (K.box) boxes.push({ x: r2(x), z: r2(z), hw: r2(K.hw * scale), hd: r2(K.hd * scale), facing: r3(rot), kind, stone: id });
    else circles.push({ x: r2(x), z: r2(z), r: r2(K.circle * scale), stone: id });
    if (st.quarter && byQuarter[st.quarter]) { const B = byQuarter[st.quarter]; B.stones++; B.kinds[kind] = (B.kinds[kind] || 0) + 1; }
    return st;
  }

  /** Room for an open grave (hole ahead of the stone, mound beside it)? Reserves it when there is. */
  function openPieces(st, { force = false } = {}) {
    const [x, z] = st.at, f = st.rot;
    const [hx, hz] = fromLocal(x, z, f, 0, OPEN_GRAVE.hole.ahead);
    // the mound goes on the row's +x side: the next stone of the row is not placed yet, so it makes room (the one
    // before it already stands on the -x side)
    const side = 1;
    const [mx, mz] = fromLocal(x, z, f, side * OPEN_GRAVE.mound.side, OPEN_GRAVE.hole.ahead);
    const hole = { x: hx, z: hz, hw: OPEN_GRAVE.hole.hw + 0.15, hd: OPEN_GRAVE.hole.hd + 0.15, facing: f };
    const mound = { x: mx, z: mz, hw: OPEN_GRAVE.mound.hw + 0.15, hd: OPEN_GRAVE.mound.hd + 0.15, facing: f };
    if (!force && !(fits(hole) && fits(mound))) return null;
    idx.add(hole); idx.add(mound);
    circles.push({ x: r2(mx), z: r2(mz), r: OPEN_GRAVE.mound.r, open: st.id });
    const [sx, sz] = fromLocal(mx, mz, f, side * 0.15, 0.55);
    return { at: [r2(hx), r2(hz)], y: r2(heightAt(hx, hz)), mound: [r2(mx), r2(mz)], spade: [r2(sx), r2(sz)] };
  }
  function makeOpen(st, q, outcome, u, extra = {}) {
    const P = openPieces(st, { force: !!extra.force });
    if (!P) return null;
    const lv = q?.levels || [3, 5];
    const level = lv[0] + Math.floor(u * 997 % 1 * (lv[1] - lv[0] + 1));
    const og = { id: extra.id || `og_${st.id}`, ...P, rot: st.rot, stone: st.id, quarter: st.quarter, level, outcome };
    if (outcome === 'named') og.named = { name: `${st.name}, ${O.epithets[Math.floor(u * 7717 % 1 * O.epithets.length)]}`, monster: O.named };
    if (outcome === 'skeleton') og.monster = O.skeleton;
    if (extra.object) og.object = extra.object;
    if (extra.story) og.story = true;
    openGraves.push(og);
    if (st.quarter && byQuarter[st.quarter]) byQuarter[st.quarter].open++;
    st.open = og.id;
    return og;
  }

  // 1. story graves (fixed, named, placed first so the rest flow round them)
  for (const s of story) {
    const q = Q[s.quarter];
    const r = makeRng(hashStr(`${seed}:story:${s.id}`));
    const st = addStone(s.kind, s.at[0], s.at[1], s.rot ?? q?.angle ?? 0, q, r, { id: s.id, name: s.name, dates: s.dates, story: s.id, quarter: s.quarter });
    if (s.open) makeOpen(st, q, s.open.outcome, r(), { id: s.id, object: s.open.object, force: true, story: true });
  }

  for (const q of quarters) {
    const [cx, cz] = q.at, [W, D] = q.size, f = q.angle || 0;
    const r = makeRng(hashStr(`${seed}:${q.id}`));
    const ro = makeRng(hashStr(`${seed}:${q.id}:open`));
    const h0 = heightAt(cx, cz);
    const bent = (lx, lz) => {
      // rows drift toward the ground's contour lines: a row higher than the quarter's middle slides back, lower forward
      const [x, z] = fromLocal(cx, cz, f, lx, lz);
      const dz = clamp(-(heightAt(x, z) - h0) * (q.bend || 0), -1.6, 1.6);
      return fromLocal(cx, cz, f, lx, lz + dz);
    };
    // 2a. the big pieces first on a coarse grid (mausoleums, family plots, table tombs, angels, obelisks)
    if (q.big) {
      const [bc, br] = q.big.every;
      for (let lz = -D / 2 + br / 2; lz <= D / 2 - br / 2 + 1e-6; lz += br) for (let lx = -W / 2 + bc / 2; lx <= W / 2 - bc / 2 + 1e-6; lx += bc) {
        if (r() > q.big.chance) { r(); r(); r(); continue; }
        const kind = pickW(r, q.big.kinds);
        const jx = (r() - 0.5) * bc * 0.3, jz = (r() - 0.5) * br * 0.3;
        const [x, z] = bent(lx + jx, lz + jz);
        const rot = f + (r() - 0.5) * 0.1 + (kind === 'mausoleum' || kind === 'mausoleum-small' ? (r() < 0.5 ? Math.PI : 0) : 0);
        const scale = r2(lerp(...(q.scale || [0.95, 1.1]), r()));
        if (!fits(foot(kind, x, z, rot, scale))) continue;
        const st = addStone(kind, x, z, rot, q, r, { scale });
        if (kind === 'family-plot') {
          // two to four headstones inside the railing, one family
          const n = 2 + Math.floor(r() * 3), K = STONE_KINDS['family-plot'];
          for (let i = 0; i < n; i++) {
            const ox = -K.hw * scale + (i + 0.5) * (2 * K.hw * scale / n);
            const [sx, sz] = fromLocal(x, z, rot, ox, -K.hd * scale * 0.45);
            addStone(r() < 0.7 ? 'headstone-tall' : 'headstone-round', sx, sz, rot + (r() - 0.5) * 0.06, q, r, { plot: st.id, family: st.name.replace(/^the | family plot$/g, '') });
          }
        }
      }
    }
    // 2b. the rows of ordinary graves
    const [col, row] = q.spacing;
    let rowN = 0, owed = 0;
    for (let lz = -D / 2 + row / 2; lz <= D / 2 - row / 2 + 1e-6; lz += row, rowN++) {
      const shift = (rowN % 2) * col * 0.25;           // rows a little out of step, not a chessboard
      for (let lx = -W / 2 + col / 2 + shift; lx <= W / 2 - col / 2 + 1e-6; lx += col) {
        const u = r(), kindRoll = r(), jx = (r() - 0.5) * 2 * (q.jitter || 0), jz = (r() - 0.5) * 2 * (q.jitter || 0), rj = (r() - 0.5) * 0.14;
        if (u < (q.skip || 0)) continue;
        const kind = pickW(() => kindRoll, q.small);
        const [x, z] = bent(lx + jx, lz + jz);
        const rot = f + rj;
        const scale = r2(lerp(...(q.scale || [0.95, 1.1]), r()));
        if (!fits(foot(kind, x, z, rot, scale))) continue;
        const st = addStone(kind, x, z, rot, q, r, { scale });
        if (!STONE_KINDS[kind].grave) continue;
        graves++; byQuarter[q.id].graves++;
        // ~1 in `every` plots is an open grave (its own dice, so the layout above never shifts with the odds). A grave
        // with no room for its hole and mound passes the turn on to the next plot, so the share stays ~1 in `every`.
        if (ro() < 1 / O.every) owed++;
        if (owed > 0 && makeOpen(st, q, rollOutcome(ro(), O.outcomes), ro())) owed--;
      }
    }
  }
  return { stones, openGraves, boxes, circles, graves, byQuarter };
}

/** Kinds a renderer must draw (one instanced mesh each) and the open-grave pieces. */
export const DRAW_KINDS = Object.freeze([...Object.keys(STONE_KINDS), 'open-grave-hole', 'open-grave-mound', 'spade']);
