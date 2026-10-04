// Farhold — the build ledger: what is placed, whether it may be, and what it cost.
//
// This is the BOOK, not the geometry — the same split `js/waypoints.js` made. It knows the
// catalogue, the footprints, the snapping, the claims, the material bill and every reason a ghost
// turns red. `js/build.js` turns all of that into meshes and a key you hold down. Nothing here
// imports Three.js, so `node --test` can check the rules that actually matter:
//
//   * a structure never floats and never intersects another one (§4.6 — "structural sense, not
//     structural simulation": a piece needs ground under it, and that is the whole model);
//   * a piece you cannot afford is refused with a sentence saying what you are short of (§4.4);
//   * deconstruct gives most of it back (§4.7) and undo takes the last one away (§4.9);
//   * one waypoint may stand in one outpost (§5.9) — and since round 14 that is the ONLY thing left
//     that a group of buildings gates. There is no claim to be inside of any more; see `check`.
//
//   import { createBuildPlan, makeBag } from './buildplan.js';
//   const plan = createBuildPlan({ catalogue, terrain, terraform, store: makeBag({ timber: 40 }) });
//   plan.check({ id: 'furnace', x, z, rot });   // → { ok, why, cost, missing, ghostY }
//   plan.place({ id: 'furnace', x, z, rot });
//
// The catalogue is `data/structures.json`. The caller loads the JSON and passes it in, because a
// browser and `node --test` fetch a file in two different ways and neither belongs in here.

import { mat } from '../../../shared/format.js';
import { groupOutposts } from './outposts.js';
import { levelUnderSlab } from './roadplan.js';

const TAU = Math.PI * 2;

/**
 * THE CATALOGUE'S SHORT NAMES ARE THE SAME THINGS AS THE MATERIALS, AND NOTHING SAID SO.
 *
 * `data/structures.json` says it in its own header, and then it was left: *"the ids in `cost` are a
 * CONTRACT, not an inventory. §1 (gathering) and §2 (refining) belong to another part of this
 * expansion and will decide where `iron` or `plank` actually comes from."* They did decide — and
 * they decided on `iron_ingot`, `log`, `cut_stone`, `machine_part`. Nobody ever went back and
 * joined the two vocabularies, so a palisade cost 6 `timber` and **nothing in the game has ever
 * produced a single unit of anything called `timber`.** Twenty-two pieces of the catalogue were
 * unbuildable by any honest route, which is the thirteenth join of this kind and the one that makes
 * felling a tree pointless: you get logs and the fence wants timber.
 *
 * One table, applied once when a cost is read, so the catalogue keeps its readable short names and
 * the rest of the game keeps its precise ones. `costText` prints the catalogue's word, because
 * "6 timber" is what a fence is made of however the bag spells it.
 */
/**
 * Structure ids renamed after saves already held them (old id -> new id). `load()` rewrites a saved
 * piece through this. 2026-10-03: `muster_stone` became `levy_stone` (the owner banned the word).
 */
export const RENAMED_STRUCTURES = { muster_stone: 'levy_stone' };

export const MATERIAL_ALIASES = {
  timber: 'log',
  iron: 'iron_ingot',
  copper: 'copper_ingot',
  steel: 'steel_ingot',
  alloy: 'bronze_ingot',
  block: 'cut_stone',
  crystal: 'crystal_raw',
  parts: 'machine_part',
  salvage: 'salvage_metal',
  fuel: 'lift_fuel',
};

/** A cost in the catalogue's words, translated into the words the storage pools use. */
export function realCost(cost) {
  const out = {};
  for (const [k, n] of Object.entries(cost || {})) {
    const id = MATERIAL_ALIASES[k] || k;
    out[id] = (out[id] || 0) + n;
  }
  return out;
}

/** The material id a catalogue cost line actually spends. */
export const realMaterial = id => MATERIAL_ALIASES[id] || id;

/**
 * Translate a whole catalogue ONCE, at load, so there is one vocabulary from there on.
 *
 * `realCost` is idempotent — `log` is not a key in the alias table — so a catalogue that has been
 * through here can still be handed to `createBuildPlan` safely, and a raw one straight off disk
 * still works because the plan translates again. The names table gains an entry per translated id
 * so every screen can still print "6 timber" rather than "6 log": a fence is made of timber
 * whatever the storage pool calls it.
 *
 *   const catalogue = alignCatalogue(structureData, resourceData);
 */
export function alignCatalogue(catalogue, resources = null, power = null) {
  if (!catalogue?.structures) return catalogue;
  const names = { ...(catalogue.materials || {}) };
  for (const [short, real] of Object.entries(MATERIAL_ALIASES)) {
    if (!names[real]) names[real] = { ...(names[short] || {}), name: names[short]?.name || real.replace(/_/g, ' ') };
  }
  // …and anything the catalogue spends that it never named gets the resource file's own word
  for (const [id, m] of Object.entries(resources?.materials || {})) {
    if (!names[id]) names[id] = { name: m.name, tier: m.tier };
  }
  /**
   * R18 — AND THE POWER FACTS COME FROM THE FILE THAT OWNS THEM.
   *
   * Two numbers for one thing, and only one of them live. `js/power.js` runs the grid off
   * data/power.json's `gen`; `js/build-ui.js` printed "Makes N kW" off data/structures.json's
   * `power.make`. They disagreed on every generator in the game — solar 26 against 44, geothermal
   * 70 against 95, wind 22 against 26, the battery bank 400 against 600 — so you could not plan a
   * base from the panel that was telling you about it.
   *
   * The user's ruling settles which side wins: **structures.json is authoritative for COST,
   * power.json for kW.** So the panel's number is replaced here, once, at the same boundary the
   * material vocabularies are joined — rather than by editing one file to agree with the other,
   * which is how they drifted in the first place.
   *
   * It also carries `needsGround` across, which is the only reason that rule can ever be enforced:
   * it lives on the power.json generator and `createBuildPlan` only ever sees the structure def.
   * The Geothermal Tap's own description says "it only works where the ground is hot. A reason to
   * build the base somewhere awkward" — and it worked on a lawn, at 95 kW, for free.
   */
  const gens = power?.generators || {};
  const cells = power?.batteries || {};
  const withPower = st => {
    const src = gens[st.id] || cells[st.id];
    if (!src || !st.power) return st;
    const pw = { ...st.power };
    if (src.gen != null) pw.make = src.gen;
    if (src.store != null) pw.store = src.store;
    if (src.needsGround) pw.needsGround = src.needsGround;
    if (src.supplyRadius != null) pw.supplyRadius = src.supplyRadius;
    return { ...st, power: pw };
  };

  return {
    ...catalogue,
    materials: names,
    structures: catalogue.structures.map(st => withPower(st.cost ? { ...st, cost: realCost(st.cost) } : st)),
  };
}

/** Every material cost in the game is a plain `{ id: count }` map; these three do the arithmetic. */
export function addCost(into, cost, times = 1) {
  for (const [k, n] of Object.entries(cost || {})) into[k] = (into[k] || 0) + n * times;
  return into;
}
export function scaleCost(cost, factor) {
  const out = {};
  for (const [k, n] of Object.entries(cost || {})) {
    const v = Math.floor(n * factor);
    if (v > 0) out[k] = v;
  }
  return out;
}

/**
 * R17 — TWO CONTRACTS FOR THE SAME OBJECT, AND BUILDING WAS FREE FOR THE WHOLE EXPANSION.
 *
 * This file has always spent a WHOLE BILL at once: `bank.take(test.cost)` with `{ log: 6,
 * iron_ingot: 1 }`, because a half-paid structure is worse than an unpaid one. `makeBag` below does
 * exactly that, and every node test has therefore always passed.
 *
 * js/main.js hands in a different object. Its methods are `take(id, n)` and `give(id, n)` — ONE
 * LINE AT A TIME — because js/build.js's clear tool calls them that way (round 13's note: *"this
 * was `store.give(res.materials)` — the whole bag as the first argument"*). Nobody joined the two
 * up. So in the real game `bank.take({ log: 6, iron_ingot: 1 })` ran with the cost object as the
 * material id and `undefined` as the count: `stores.count(pool, {object})` is 0, `n - fromPool` is
 * NaN, `materials.spend({ '[object Object]': NaN })` refuses and changes nothing — and the
 * placement went ahead regardless, because `check` had already approved it.
 *
 * **Every structure in Farhold has been free since the building expansion landed, and a deconstruct
 * has refunded nothing.** `check` reads `bank.have(id)`, which is the one method both shapes agree
 * on, so the refusal sentence was right and only the deduction was missing — which is precisely why
 * nobody noticed: you still could not build what you could not afford, you simply never ran out.
 *
 * One adapter, at the boundary, that speaks both. A per-line store declares itself by taking two
 * arguments; a whole-bill store takes one. `have` is checked here rather than inside the per-line
 * branch because main.js's `take` has no refusal in it at all — it takes what it can and returns
 * the number it was asked for — and a bill that is half payable must buy nothing.
 */
export function bankAdapter(store) {
  if (!store) return { have: () => Infinity, take: () => true, give: () => {}, perLine: false };
  const have = id => (store.have ? store.have(id) : Infinity);
  const perLine = typeof store.take === 'function' && store.take.length >= 2;
  if (!perLine) {
    return {
      have,
      take: cost => (store.take ? !!store.take(cost) : true),
      give: cost => { store.give?.(cost); },
      perLine: false,
    };
  }
  return {
    have,
    take(cost) {
      for (const [k, n] of Object.entries(cost || {})) if (n > 0 && have(k) < n) return false;
      for (const [k, n] of Object.entries(cost || {})) if (n > 0) store.take(k, n);
      return true;
    },
    give(cost) {
      for (const [k, n] of Object.entries(cost || {})) if (n > 0) store.give?.(k, n);
    },
    perLine: true,
  };
}

/**
 * A plain material bag, good enough for tests and for a game that has not built its store pools yet.
 * The real game passes its own `store` with the same three methods — §4.5 wants building to draw
 * from a pool in range rather than from the player's pockets, and that decision lives outside here.
 */
export function makeBag(initial = {}) {
  const bag = { ...initial };
  return {
    have: id => bag[id] || 0,
    take(cost) {
      for (const [k, n] of Object.entries(cost)) if ((bag[k] || 0) < n) return false;
      for (const [k, n] of Object.entries(cost)) bag[k] -= n;
      return true;
    },
    give(cost) { for (const [k, n] of Object.entries(cost)) bag[k] = (bag[k] || 0) + n; },
    contents: () => ({ ...bag }),
  };
}

/** The four corners of a footprint, in world metres. */
export function cornersOf({ x, z, w, d, rot = 0 }) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const hw = w / 2, hd = d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
    .map(([lx, lz]) => [x + lx * c - lz * s, z + lx * s + lz * c]);
}

/**
 * Do two rotated footprints overlap?
 *
 * Separating axes: project both boxes on to each box's two edge directions, and if any projection
 * leaves a gap they are apart. Four axes, no library, and it is exact for rectangles — which is why
 * "a structure never intersects" is a rule we can actually keep rather than approximate with
 * circles and then apologise for.
 *
 * Two boxes that TOUCH are not overlapping, and that is not a nicety: a run of wall is pieces laid
 * end to end, and a rule that called abutting panels an overlap would make it impossible to build a
 * wall at all. `slack` is how much real overlap to forgive, for callers that only care about gross
 * collisions — a rotated leg of a run lands its corners about a femtometre out, and a test that
 * measures overlap should not fail on that.
 */
export function boxesOverlap(a, b, slack = 0) {
  const ca = cornersOf(a), cb = cornersOf(b);
  for (const box of [a, b]) {
    for (const ang of [box.rot || 0, (box.rot || 0) + Math.PI / 2]) {
      const ax = Math.cos(ang), az = Math.sin(ang);
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [px, pz] of ca) { const t = px * ax + pz * az; a0 = Math.min(a0, t); a1 = Math.max(a1, t); }
      for (const [px, pz] of cb) { const t = px * ax + pz * az; b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
      if (a1 <= b0 + slack || b1 <= a0 + slack) return false;
    }
  }
  return true;
}

/** Snap an angle to the catalogue's rotation step, so walls line up without a protractor. */
export function snapAngle(rot, step) {
  if (!step) return rot;
  return Math.round(rot / step) * step;
}

/**
 * R28 — A SHIFT+CLICK LINE: the spots for a row of one piece from `from` to `to`.
 *
 * `from` is the piece you placed last, so the row starts one footprint PAST it rather than on top
 * of it. The step is how long the footprint is measured along the line, so a fence turned along the
 * line is spaced by its 2 m width and a fence turned across it by its 0.2 m depth — which is exactly
 * how far apart two of them can stand without touching. Capped at `max`, because a line dragged to
 * the horizon is a misclick, not a plan.
 */
export function lineSpots({ w, d, from, to, rot = 0, max = 40 }) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return [];
  const dir = Math.atan2(dz, dx);
  const along = Math.abs(w * Math.cos(rot - dir)) + Math.abs(d * Math.sin(rot - dir));
  const step = Math.max(0.3, along);
  const count = Math.min(max, Math.floor(len / step + 1e-6));
  const out = [];
  for (let k = 1; k <= count; k++) {
    out.push({ x: from.x + (dx / len) * step * k, z: from.z + (dz / len) * step * k, rot });
  }
  return out;
}

/**
 * R28 — WHERE THE PIECES OF A RUN GO, and where its gates go.
 *
 * Pulled out of `plan.run` so the panel can price a run BEFORE Enter is pressed and a test can
 * check the gate rule without placing anything. `gateCorners` are indices into `points` — the
 * corners the player clicked twice ("double back over a corner and the gate goes there", which the
 * Wall tool's hint has promised since round 13 and nothing ever did). `gateAt` is the older form,
 * by section index along the whole run, kept for its callers.
 *
 * A GAP IS NOT A GATE. The first version swapped a section's id for the gate's and left it in the
 * section's slot: a 4 m gate in a 2 m slot overlaps the section beside it, `check` refused it, and
 * the run came out with a hole where the gate was meant to be. So a leg is laid out in METRES: each
 * gate claims its own width along the leg (from the corner, for a corner gate), and the wall
 * sections are spaced to fill only what is left on either side. A gate always gets the room it
 * needs and the wall closes up to its posts.
 */
export function runSpots(def, points, { gateCorners = [], gateAt = [], gateDef = null } = {}) {
  const out = [];
  const legs = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    legs.push({ ax, az, bx, bz, len, rot: Math.atan2(bz - az, bx - ax), count: Math.max(1, Math.round(len / def.w)), gates: [] });
  }
  if (!legs.length) return out;
  const gw = gateDef?.w ?? def.w;
  if (gateDef) {
    // a corner gate stands just past the corner, on the leg that leaves it (the last corner: on
    // the end of the leg that arrives there)
    for (const c of new Set(gateCorners)) {
      if (c < 0 || c >= points.length) continue;
      const leg = legs[Math.min(c, legs.length - 1)];
      leg.gates.push(c >= legs.length ? leg.len - gw / 2 : gw / 2);
    }
    // the old form: the n-th section of the whole run becomes a gate, centred where it stood
    let n = 0;
    for (const leg of legs) {
      for (let k = 0; k < leg.count; k++, n++) if (gateAt.includes(n)) leg.gates.push(((k + 0.5) / leg.count) * leg.len);
    }
  }
  for (const leg of legs) {
    const ux = (leg.bx - leg.ax) / (leg.len || 1), uz = (leg.bz - leg.az) / (leg.len || 1);
    const at = s => ({ x: leg.ax + ux * s, z: leg.az + uz * s, rot: leg.rot });
    if (!leg.gates.length) {
      for (let k = 0; k < leg.count; k++) out.push({ ...at(((k + 0.5) / leg.count) * leg.len), id: def.id });
      continue;
    }
    // gates in order along the leg, each clamped onto the leg and kept from overlapping the last
    const centres = [];
    for (const g of [...leg.gates].sort((a, b) => a - b)) {
      let c = Math.max(gw / 2, Math.min(leg.len - gw / 2, g));
      if (leg.len < gw) c = leg.len / 2;
      if (centres.length && c < centres[centres.length - 1] + gw) continue;   // two gates on one spot: one gate
      centres.push(c);
    }
    let from = 0;
    const fill = (a, b) => {
      const room = b - a;
      const count = Math.round(room / def.w);
      for (let k = 0; k < count; k++) out.push({ ...at(a + ((k + 0.5) / count) * room), id: def.id });
    };
    for (const c of centres) {
      fill(from, c - gw / 2);
      out.push({ ...at(c), id: gateDef.id, gate: true });
      from = c + gw / 2;
    }
    fill(from, leg.len);
  }
  return out;
}

/**
 * R28 — DO TWO PIECES OF A RUN COLLIDE?
 *
 * Wall sections are laid end to end and turned at every corner, so two of them always touch and
 * at a corner they always cross by up to a wall's thickness; and a leg that is not a whole number
 * of sections long spaces them a little closer than their own width. `check` used to treat all of
 * that as "would stand inside the Palisade": every corner lost a section, and a 5 m fence lost one
 * of its three. Two run pieces are compared with each one's LENGTH trimmed at both ends by its own
 * depth (and by at least a fifth of its length), so ends may meet, cross at a corner — a thick wall
 * at a sharp corner crosses by more — or overlap a little, while a second wall laid on top of the
 * first, or alongside it closer than its own depth, is still refused.
 */
export function runPiecesClash(a, b) {
  const trim = p => ({ ...p, w: Math.max(p.w * 0.2, p.w - 2 * Math.max(p.w * 0.2, p.d)) });
  return boxesOverlap(trim(a), trim(b), 1e-6);
}

/**
 * R28 — WHAT A PIECE IS SOLID AS, for js/collide.js. Pure, so the gate rule has a test.
 *
 * It used to be one circle per piece, `min(1.4, max(w, d) / 2)` across, whatever the piece was —
 * so a 2 × 0.2 m fence was a 2 m disc, a diagonal fence was a row of bumps, and a **gate was a
 * circle in the middle of the opening**: a 4 m gate between two palisades left 0.6 m either side of
 * its 1.4 m circle, and a body is 0.8 m wide. `gate: true` has been on three catalogue rows since
 * they were written and nothing read it. You could not walk through your own gate.
 *
 *   * flat things (≤ 0.35 m) are not solid at all — the old rule, kept;
 *   * a gate is its two POSTS, and between them a LEAF that only stops bodies which do not say
 *     where their feet are — every enemy. The catalogue says "Opens for you, and not for them",
 *     and an open gap let a raid walk straight in. The leaf carries its own `band`
 *     `[-Infinity, -Infinity]`: js/collide.js `inBand` applies a floorless band to a body with no
 *     feet and never to the player, whose feet are always above minus infinity. Companions do not
 *     collide with built pieces at all, so they follow you through;
 *   * anything long and thin (a wall section, a fence, a hedge, a barricade — a run piece or
 *     anything at least twice as long as it is deep) is a segment end to end, `d / 2` either side,
 *     which is the shape that is drawn;
 *   * everything else is the circle it always was.
 *
 * `{ kind: 'seg', ax, az, bx, bz, half, h, band? }` or `{ kind: 'circle', x, z, r, h }`. A
 * segment without its own `band` is filed by the caller with the hop band (see js/main.js
 * `rebuildBuildSolids`).
 */
export function solidsFor(entry, def = entry) {
  const w = def?.w ?? entry.w ?? 1, d = def?.d ?? entry.d ?? 1, h = def?.h ?? entry.h ?? 2;
  if (h <= 0.35) return [];
  const rot = entry.rot || 0;
  const c = Math.cos(rot), s = Math.sin(rot);
  const along = (t, off = 0) => [entry.x + t * c - off * s, entry.z + t * s + off * c];
  if (def?.gate || entry.gate) {
    const post = Math.max(0.15, Math.min(0.45, d / 2, w * 0.12));
    const out = [];
    for (const side of [-1, 1]) {
      const [x, z] = along(side * (w / 2 - post));
      out.push({ kind: 'circle', x, z, r: post, h, post: true });
    }
    const [ax, az] = along(-(w / 2 - 2 * post)), [bx, bz] = along(w / 2 - 2 * post);
    out.push({ kind: 'seg', ax, az, bx, bz, half: Math.max(0.12, Math.min(0.3, d / 2)), h, leaf: true, band: [-Infinity, -Infinity] });
    return out;
  }
  if (def?.run || w >= d * 2) {
    const [ax, az] = along(-w / 2), [bx, bz] = along(w / 2);
    return [{ kind: 'seg', ax, az, bx, bz, half: Math.max(0.12, d / 2), h }];
  }
  return [{ kind: 'circle', x: entry.x, z: entry.z, r: Math.max(0.35, Math.min(1.4, Math.max(w, d) / 2)), h }];
}

/** Is (x, z) inside a rotated footprint, grown by `pad` metres? */
export function insideFootprint(e, x, z, pad = 0) {
  const c = Math.cos(-(e.rot || 0)), s = Math.sin(-(e.rot || 0));
  const lx = (x - e.x) * c - (z - e.z) * s, lz = (x - e.x) * s + (z - e.z) * c;
  return Math.abs(lx) <= e.w / 2 + pad && Math.abs(lz) <= e.d / 2 + pad;
}

/**
 * R28 — THE PRICE OF AN UPGRADE: what the new piece costs that the old one did not.
 *
 * Paid material by material, never below zero — a stone wall that replaces a palisade does not
 * charge the timber the palisade was already made of, and it does not give any back either. Both
 * sides in the materials' own ids.
 */
export function upgradeCost(fromCost, toCost) {
  const a = realCost(fromCost), b = realCost(toCost);
  const out = {};
  for (const [k, n] of Object.entries(b)) {
    const more = n - (a[k] || 0);
    if (more > 0) out[k] = more;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// R28 — STRUCTURE DAMAGE. Pure pieces first, so the hp table, the repair price and the salvage
// have node tests; the plan's own methods (`damage`, `repairOf`, `repair`, `heal`, `blocking`)
// are below in createBuildPlan.
// ------------------------------------------------------------------------------------------------

/**
 * HOW MUCH A PIECE CAN TAKE.
 *
 * 39 catalogue rows carry an `hp` and it is used as written (a palisade 400, a stone wall 1200, a
 * reinforced wall 3000). The other 86 never needed one, because until R28 nothing hit a building;
 * they get one DERIVED from what they cost and their tier, so a dearer, later piece is tougher:
 *
 *   hp = clamp(round((40 + 20 × cost units) × tier), 60, 2000)
 *
 * A Storage Box (6 log, tier 1) is 160; a tier-2 furnace of 22 units is 960. Written down here and
 * in data/structures.json's `_r28` note, and a test moves a cost and watches the number move.
 */
export function structureHp(def) {
  if (!def) return 0;
  if (def.hp > 0) return def.hp;
  const units = Object.values(def.cost || {}).reduce((n, v) => n + (v || 0), 0);
  return Math.max(60, Math.min(2000, Math.round((40 + 20 * units) * (def.tier || 1))));
}

/**
 * THE PRICE OF PUTTING HIT POINTS BACK: `share` of the piece's build cost per WHOLE bar, pro rata,
 * rounded UP per material — so a scratch still costs one of each thing the piece is made of, and
 * a piece at half health costs a quarter of a new one at the default share of one half. In the
 * materials' real ids, like every other bill.
 */
export function repairCost(def, missing, maxHp, share = 0.5) {
  if (!def || !(missing > 0) || !(maxHp > 0)) return {};
  const frac = Math.min(1, missing / maxHp) * share;
  const out = {};
  for (const [k, n] of Object.entries(realCost(def.cost || {}))) {
    const v = Math.ceil(n * frac - 1e-9);
    if (v > 0) out[k] = v;
  }
  return out;
}

/**
 * How hurt a piece LOOKS: 0 whole, then 1/2/3 as it falls past two thirds and one third. Four
 * bands, so js/build.js swaps a piece's materials only when it crosses one, not on every hit.
 */
export function damageBand(ratio) {
  if (!(ratio < 1)) return 0;
  return ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
}

/** What a piece broken by enemies leaves behind: `fraction` of its cost, rounded down. */
export function salvageOf(def, fraction = 0.25) {
  return realCost(scaleCost(def?.cost || {}, fraction));
}

/** Distance from a point to a segment, and how far along the segment the nearest point is. */
function pointSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
  const cx = ax + dx * t, cz = az + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), t, x: cx, z: cz };
}

/** Do two segments cross? (Proper or touching.) */
function segsCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const o = (px, pz, qx, qz, rx, rz) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
  return o(ax, az, bx, bz, cx, cz) !== o(ax, az, bx, bz, dx, dz) && o(cx, cz, dx, dz, ax, az) !== o(cx, cz, dx, dz, bx, bz);
}

/**
 * THE BUILT PIECE IN THE WAY: the first solid (by `solidsFor`) that the straight line from an enemy
 * at A to its target at B runs into, looked for only within `ahead` metres of A — a wall a hundred
 * metres off is not "in the way" yet. `pad` is the walker's own half-width.
 *
 * Returns `{ id, entry, x, z, gap }` — the point on the piece's centre line nearest the walker (what
 * it walks at), and `gap`, how far the walker is from the piece's SURFACE (what a swing must reach)
 * — or null when the way is clear. Enemies have no pathfinding, so "in the way" is the straight
 * line; js/actors.js asks this a couple of times a second, not every frame.
 */
export function blockingPiece(list, defOf, ax, az, bx, bz, { ahead = 14, pad = 0.5 } = {}) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 1e-6) return null;
  const k = Math.min(1, ahead / len);
  const ex = ax + (bx - ax) * k, ez = az + (bz - az) * k;
  let best = null;
  for (const e of list || []) {
    if (Math.hypot(e.x - ax, e.z - az) > ahead + Math.max(e.w || 1, e.d || 1)) continue;
    const def = defOf(e.key);
    if (!def || def.road) continue;
    for (const sol of solidsFor(e, def)) {
      let hit = false, near;
      if (sol.kind === 'seg') {
        near = pointSeg(ax, az, sol.ax, sol.az, sol.bx, sol.bz);
        // the gap between the walk and the piece: zero if they cross, else the nearest of the four ends
        const between = segsCross(ax, az, ex, ez, sol.ax, sol.az, sol.bx, sol.bz) ? 0 : Math.min(
          pointSeg(sol.ax, sol.az, ax, az, ex, ez).d, pointSeg(sol.bx, sol.bz, ax, az, ex, ez).d,
          near.d, pointSeg(ex, ez, sol.ax, sol.az, sol.bx, sol.bz).d);
        hit = between <= sol.half + pad;
        near.gap = Math.max(0, near.d - sol.half);
      } else {
        const p = pointSeg(sol.x, sol.z, ax, az, ex, ez);
        hit = p.d <= sol.r + pad;
        const d = Math.hypot(sol.x - ax, sol.z - az);
        near = { x: sol.x, z: sol.z, d, gap: Math.max(0, d - sol.r) };
      }
      if (hit && (!best || near.gap < best.gap)) best = { id: e.id, entry: e, x: near.x, z: near.z, gap: near.gap };
    }
  }
  return best;
}

export function createBuildPlan({
  catalogue,
  /** `{ heightAt(x,z), slopeAt(x,z,step), waterAt(x,z) }` — the wrapped terrain, edits and all. */
  terrain = null,
  /** `js/terraform.js`, so a foundation flattens its own ground as it is placed. */
  terraform = null,
  /** `{ have(id), take(cost), give(cost) }`. The default lets anything be built — used by tests. */
  store = null,
  /** `(need, x, z) => boolean` — is there an ore node / water / a gas vent here? */
  siteOk = null,
  /**
   * R17 — `(def) => ({ text }) | null`. The research gate, and it is a CALLBACK rather than an
   * import for the same reason `siteOk` is: this file knows the rules of the ground, and what a
   * player has learned belongs to js/research.js. Omitted, nothing is ever locked — which is the
   * direction a missing gate must fail in.
   */
  locked = null,
  saved = null,
} = {}) {
  const rules = { ...(catalogue?.rules || {}) };
  const grid = rules.grid ?? 2;
  const snapDistance = rules.snapDistance ?? 1.6;
  const rotateStep = rules.rotateStep ?? Math.PI / 4;
  const refund = rules.refund ?? 0.75;
  const defaultSlope = rules.defaultSlope ?? 0.18;
  const footing = rules.footingTolerance ?? 0.35;
  const claimRadius = rules.claimRadius ?? 64;
  const undoDepth = rules.undoDepth ?? 30;
  // R28 — see the `_r28` note in data/structures.json's rules block
  const autoLevel = rules.autoLevel ?? 1.5;
  const lineMax = rules.lineMax ?? 40;
  const mountReach = rules.mountReach ?? 2.4;
  // R28 — structure damage: what a broken piece leaves, and what a repair costs per whole bar
  const salvage = rules.salvage ?? 0.25;
  const repairShare = rules.repairShare ?? 0.5;

  /**
   * R19 — `terraformBudget` AND `maxLift`, WHICH THE CATALOGUE STATED AND NOBODY READ.
   *
   * Every other key of `rules` is unpacked in the block above and used somewhere in this file.
   * These two belong to js/terraform.js instead, and the book is made in js/main.js as
   * `createTerraform({ saved })` — no options — so the JSON's §4.20 cap on how much ground one
   * claim may reshape has never once reached the code that enforces it. It only LOOKED wired
   * because the default in terraform.js's own signature is the same 60000.
   *
   * This is the join, and it is made here because this is the one function handed both the
   * catalogue and the terraform book. A book made without a catalogue (the balance harness, most
   * of the node tests) keeps the defaults it was born with.
   */
  if (terraform?.setRules && (rules.terraformBudget != null || rules.maxLift != null)) {
    terraform.setRules({ terraformBudget: rules.terraformBudget, maxLift: rules.maxLift });
  }

  const byId = new Map((catalogue?.structures || []).map(s => [s.id, s]));

  const bank = bankAdapter(store);
  const ground = (x, z) => (terrain?.heightAt ? terrain.heightAt(x, z) : 0);
  const steepness = (x, z, step = 2) => (terrain?.slopeAt ? terrain.slopeAt(x, z, step) : 0);

  /** Everything standing, in placement order — so `undo` is a pop and nothing needs a timestamp. */
  let entries = [];
  /** Base claims (§4.10). The first thing you build makes one; a claim stone makes another. */
  let claims = [];
  let nextEntry = 1;
  let nextClaim = 1;

  const spotOf = e => ({ x: e.x, z: e.z, w: e.w, d: e.d, rot: e.rot || 0 });

  function claimAt(x, z) {
    for (const c of claims) if (Math.hypot(c.x - x, c.z - z) <= c.radius) return c;
    return null;
  }

  /**
   * A group for the piece you just put down, because it was not near any existing one.
   *
   * This used to be the thing a Claim Stone bought you. It is now free and automatic: build a drill
   * and a crate on a seam a kilometre from home and you have an outpost, because that is what the
   * word means. The `claim` id it hands out is still called a claim in the save file — an old save
   * has to keep loading, and the terrain brushes, the waypoint register and js/defence.js all file
   * against that id — but everything the player ever reads calls it an outpost.
   */
  function newClaim(x, z, name = null) {
    const c = {
      id: 'cl' + (nextClaim++), x, z, radius: claimRadius,
      name: name || 'Outpost ' + (nextClaim - 1),
    };
    claims.push(c);
    return c;
  }

  /**
   * How far the worst corner sits off the height under the middle.
   *
   * This IS the structural model. §4.6 asks for "structural sense, not structural simulation": a
   * piece needs ground under it and roughly level ground at that. A thing whose corners disagree by
   * more than `footingTolerance` is either half-buried in a bank or hanging over a drop, and both
   * read as broken — which is exactly why the smoothing tool had to be built first.
   */
  /** R28 — the mean of the middle and the four corners: the height a self-levelling piece lands at. */
  function slabMean({ x, z, w, d, rot = 0 }) {
    let sum = ground(x, z);
    for (const [cx, cz] of cornersOf({ x, z, w, d, rot })) sum += ground(cx, cz);
    return sum / 5;
  }

  function footingOf({ x, z, w, d, rot = 0 }) {
    const base = ground(x, z);
    let worst = 0;
    for (const [cx, cz] of cornersOf({ x, z, w, d, rot })) {
      worst = Math.max(worst, Math.abs(ground(cx, cz) - base));
    }
    return { y: base, gap: worst };
  }

  /**
   * The bill for one piece, and what the store is short of.
   *
   * `cost` comes back in the MATERIALS' own ids, not the catalogue's short names — see
   * `MATERIAL_ALIASES` — because everything that pays it (the storage pools, the bag, the refunds)
   * speaks that vocabulary and there is no good place further down to translate. `costText` turns
   * it back into words for the screen.
   */
  function billFor(def, times = 1) {
    const cost = realCost(scaleCost(def.cost || {}, times));
    const missing = {};
    for (const [k, n] of Object.entries(cost)) {
      const short = n - bank.have(k);
      if (short > 0) missing[k] = short;
    }
    return { cost, missing, short: Object.keys(missing).length > 0 };
  }

  /**
   * "6 log, 2 iron ingot" — for the ghost's cost line and for the refusal sentence.
   *
   * Reads BOTH vocabularies, because a bill is in material ids and a catalogue row is in the
   * catalogue's short names, and this one function prints both.
   */
  function costText(cost) {
    const names = catalogue?.materials || {};
    const resources = catalogue?.resourceNames || {};
    return Object.entries(cost)
      .map(([k, n]) => {
        const word = names[k]?.name || resources[k]?.name || k.replace(/_/g, ' ');
        // R17 — `mat()` and not the raw float: "You are short of 6.000000000003 clay."
        return `${mat(n)} ${word.toLowerCase()}`;
      })
      .join(', ');
  }

  /**
   * R28 — THE GROUND A PIECE PAINTS AS IT LANDS, shared by `place` and `relocate`. Returns null
   * when the ground is ready, or the sentence saying why it cannot be made ready.
   *
   * Two cases. A piece that self-levels (`check` said `levels`) gets a slab only a hair wider than
   * itself — the first version used the floor's +0.6 m, which reshaped the ground under the
   * neighbour beside it. A flat piece or a foundation levels as it always has (round 14's
   * `levelUnderSlab`, mean of the corners and the middle). Either way a refusal from a terraform
   * that CAN reshape is a refusal: past the claim's reshaping allowance the piece used to be placed
   * anyway on ground nobody levelled, which is exactly the floating floor this was meant to stop.
   */
  function groundWork(def, x, z, rot, claimId, levels) {
    if (!terraform) return null;
    const can = !!terraform.slab;
    if (!def.flatten && def.h > 0.3 && levels) {
      const lv = levelUnderSlab({ x, z, w: def.w + 0.2, d: def.d + 0.2, rot },
        { terrain: { heightAt: ground }, terraform, claim: claimId });
      if (!lv.ok && can) return lv.why || 'The ground here cannot be levelled any more.';
    }
    if (def.flatten || def.h <= 0.3) {
      if (def.flatten === 'pit') {
        terraform.lower({ x, z, r: Math.max(def.w, def.d) / 2, amount: 2.4, claim: claimId });
      } else {
        const pad = def.flatten === 'strip' ? 0 : 0.6;
        const lv = levelUnderSlab({ x, z, w: def.w + pad, d: def.d + pad, rot },
          { terrain: { heightAt: ground }, terraform, claim: claimId });
        if (lv && lv.ok === false && can) return lv.why || 'The ground here cannot be levelled any more.';
      }
    }
    return null;
  }

  const api = {
    get rules() { return { grid, snapDistance, rotateStep, refund, defaultSlope, footing, claimRadius, undoDepth, autoLevel, lineMax, mountReach, salvage, repairShare, siegeDamage: rules.siegeDamage ?? 1 }; },
    get entries() { return entries; },
    get claims() { return claims; },
    byId: id => byId.get(id) || null,
    all: () => [...byId.values()],
    inCategory: cat => [...byId.values()].filter(s => s.cat === cat),
    /**
     * R16 — IS THIS PIECE ONE THAT DIGS?
     *
     * One place, so no caller has to remember the word "extract" or keep its own list of drill ids.
     * js/main.js's placement test used to be `def?.needs === 'node' || entry.key === 'drill' ||
     * entry.key === 'pump'` — a hard-coded id list beside a rule that already covered two of them.
     */
    isExtractor: idOrDef => {
      const def = typeof idOrDef === 'string' ? byId.get(idOrDef) : idOrDef;
      return !!def && (def.cat === 'extract' || def.needs === 'node' || def.needs === 'water');
    },
    costText,
    /**
     * R17 — WHY THIS ROW IS GREY, for anything that wants to ask without pretending to place one.
     * The build panel draws a locked row rather than hiding it, because a piece you cannot see is a
     * piece you will never go looking for — the same argument js/build-ui.js makes for a locked
     * recipe.
     */
    lockOf: idOrDef => {
      const def = typeof idOrDef === 'string' ? byId.get(idOrDef) : idOrDef;
      return def && locked ? locked(def) : null;
    },

    /**
     * §4.2/§4.3 — snap by default, free placement when the player holds the key down.
     *
     * Two passes: first offer the edge of any nearby piece of the same family (walls join walls,
     * floors tile), then fall back to the grid. Snapping to a PIECE first is what makes a wall run
     * come out as a wall rather than as a row of fence panels that nearly touch.
     */
    snap({ id, x, z, rot = 0, free = false, ignore = null }) {
      const def = byId.get(id);
      if (free || !def) return { x, z, rot };
      const step = rotateStep;
      /**
       * R28 — `snap: "wall"` HANGS THE PIECE ON A WALL.
       *
       * Every catalogue row has carried `snap: "wall" | "floor" | "grid"` since the catalogue was
       * written, and nothing read it — so a Wall Sconce, Shutters or a Banner snapped to the 2 m
       * grid like a crate and stood in the grass. Fourteen pieces are meant to go ON something.
       * `mountOn` finds the nearest side of a wall section, a gate or a building and puts the piece
       * flat against it, facing out; with nothing in reach it falls through to the grid as before.
       */
      if (def.snap === 'wall') {
        const m = api.mountOn({ id, x, z, ignore });
        if (m) return m;
      }
      let best = null;
      /**
       * R28 — a piece that is not a run keeps the way YOU turned it. Snapping used to copy the
       * neighbour's bearing for everything, so next to another crate the wheel did nothing at all.
       * A run piece still takes its neighbour's bearing, because that is what makes it a wall.
       * Floor pieces (`snap: "floor"`) also tile off the neighbour's two long sides, not only its
       * ends, so foundations make a grid rather than a row.
       */
      const mine = ((snapAngle(rot, step) % TAU) + TAU) % TAU;
      for (const e of entries) {
        if (e.id === ignore) continue;               // R28 — a piece being moved does not snap to itself
        if (e.cat !== def.cat && !(e.run && def.run)) continue;
        const er = e.rot || 0;
        const c = Math.cos(er), s = Math.sin(er);
        const turn = def.run ? er : mine;
        // how far this piece reaches along the neighbour's length / across it, at the bearing it will have
        const extW = (Math.abs(def.w * Math.cos(turn - er)) + Math.abs(def.d * Math.sin(turn - er))) / 2;
        const extD = (Math.abs(def.w * Math.sin(turn - er)) + Math.abs(def.d * Math.cos(turn - er))) / 2;
        const faces = [[1, 0, e.w / 2 + extW], [-1, 0, e.w / 2 + extW]];
        if (def.snap === 'floor') faces.push([0, 1, e.d / 2 + extD], [0, -1, e.d / 2 + extD]);
        for (const [ax, az, off] of faces) {
          const lx = ax * off, lz = az * off;
          const px = e.x + lx * c - lz * s, pz = e.z + lx * s + lz * c;
          const dist = Math.hypot(px - x, pz - z);
          if (dist < snapDistance && (!best || dist < best.dist)) best = { x: px, z: pz, rot: turn, dist };
        }
      }
      if (best) return { x: best.x, z: best.z, rot: best.rot };
      return {
        x: Math.round(x / grid) * grid,
        z: Math.round(z / grid) * grid,
        rot: ((snapAngle(rot, step) % TAU) + TAU) % TAU,
      };
    },

    /**
     * May this go here — and if not, the reason as a sentence.
     *
     * Returned rather than thrown because the ghost shows it while you are still holding the piece:
     * red plus "the ground is too steep — level it first" teaches the smoothing tool in one go,
     * where a red box alone teaches nothing.
     */
    check({ id, x, z, rot = 0, ignore = null, free = false }) {
      const def = byId.get(id);
      if (!def) return { ok: false, why: 'No such structure.' };
      const spot = { x, z, w: def.w, d: def.d, rot };
      const foot = footingOf(spot);
      const bill = billFor(def);
      const out = { ok: false, why: '', def, cost: bill.cost, missing: bill.missing, ghostY: foot.y, gap: foot.gap };

      /**
       * R17 — THE RESEARCH GATE, AND IT IS THE FIRST REFUSAL ON PURPOSE.
       *
       * Before the ground, before the purse: a piece you have not researched is not a thing you can
       * fix by standing somewhere flatter or fetching more iron, so telling the player about the
       * slope first would send them off to do work that could never help. The sentence names the
       * node and the age (js/research.js `lockReason`), because "Locked" on its own is the one
       * answer nobody can act on.
       */
      const gate = locked ? locked(def) : null;
      if (gate) { out.why = gate.text || 'You have not researched this yet.'; out.locked = gate; return out; }

      if (terrain?.waterAt && terrain.waterAt(x, z)) { out.why = 'You cannot build on water.'; return out; }

      /**
       * R18 — SOME GROUND IS THE POINT OF THE PIECE.
       *
       * `needsGround` has been on the Geothermal Tap since it landed and was read by nobody, so the
       * best generator in the game — 95 kW, no fuel, no upkeep — worked on a lawn. Its own
       * description says "it only works where the ground is hot. A reason to build the base somewhere
       * awkward", which is a real decision the player was never asked to make.
       */
      const needs = def.power?.needsGround;
      if (needs?.length && terrain?.biomeAt) {
        const here = terrain.biomeAt(x, z);
        const key = here?.key || here?.id || '';
        if (!needs.includes(key)) {
          out.why = `${def.name || 'This'} only works on ${needs.join(', ')} ground — this is ${here?.name || 'the wrong sort'}.`;
          return out;
        }
      }

      /**
       * A piece that flattens its own ground is allowed to land on a slope — that is what it is for.
       *
       * Round 14 adds the second half of that sentence: **anything flat is a tile, and a tile levels
       * under itself.** *"Maybe these tiles and slabs just need to level the ground beneath them
       * automatically, though IDK how to handle slopes."* A rug, a flower bed, a patch of caltrops
       * and a paving square are all 10 cm tall, all sat on the height of their own middle, and all
       * poked a corner through the hill on anything but a billiard table. They now level to the mean
       * height under the footprint and skirt out to the ground around them — see `slabLevel` below.
       */
      const flattens = !!def.flatten || def.h <= 0.3;
      if (!flattens) {
        const maxSlope = def.slope ?? defaultSlope;
        const steep = steepness(x, z) > maxSlope;
        const uneven = foot.gap > footing;
        /**
         * R28 — A SMALL SLOPE LEVELS ITSELF.
         *
         * "The ground is too steep — level it first" was the commonest red ghost in the game, and
         * for a crate on a half-metre hummock the answer was always the same three trips: pick
         * Level, click, pick the crate again. Every flat piece has levelled its own footprint since
         * round 14 (`levelUnderSlab`); a piece whose worst corner is within `autoLevel` metres of
         * the ground under its middle now does the same as it lands, and the card says so before
         * the click. Past the cap the old sentence stands — with the number in it — so a real
         * hillside still teaches the Level tool.
         */
        if ((steep || uneven) && terraform && autoLevel > 0 && foot.gap <= autoLevel) {
          out.levels = true;
          out.ghostY = slabMean({ x, z, w: def.w, d: def.d, rot });
        } else if (steep || uneven) {
          const fall = Math.round(foot.gap * 10) / 10;
          out.why = steep && !uneven
            ? 'The ground is too steep here — level it first.'
            : terraform && autoLevel > 0 && foot.gap > autoLevel
              ? `The ground under this is uneven — it falls ${fall} m, more than the ${autoLevel} m a piece levels by itself. Level it first.`
              : 'The ground under this is uneven — level it first.';
          return out;
        }
      }

      for (const e of entries) {
        if (ignore && e.id === ignore) continue;
        // Flat things tile: paving over a foundation is the point, not a mistake. Anything with
        // real height, though, has to keep clear of anything else with real height.
        if ((def.h <= 0.3) !== (e.h <= 0.3)) continue;
        if (def.h <= 0.3 && e.h <= 0.3) continue;
        /**
         * R28 — TWO LEGS OF A RUN SHARE THEIR CORNER.
         *
         * The last section of one leg ends exactly on the corner and the first section of the next
         * starts there, so at any angle their inside edges cross by up to a wall's thickness — and
         * `check` refused one of them as "would stand inside the Palisade". Every corner of every
         * wall anybody laid lost a section and left a gap. Two run pieces (walls, fences, gates) are
         * compared by `runPiecesClash`; anything else still may not overlap at all.
         */
        const runPair = (def.run || def.gate) && (e.run || e.gate);
        const clash = runPair ? runPiecesClash(spot, spotOf(e)) : boxesOverlap(spot, spotOf(e));
        if (clash) { out.why = `That would stand inside the ${e.name}.`; return out; }
      }

      if (def.needs && siteOk && !siteOk(def.needs, x, z)) {
        const what = { node: 'an ore node', water: 'water', vent: 'a gas vent' }[def.needs] || def.needs;
        out.why = `A ${def.name.toLowerCase()} has to stand on ${what}.`;
        return out;
      }

      const claim = claimAt(x, z);
      if (def.waypoint && claim && entries.some(e => e.waypoint && e.claim === claim.id && e.id !== ignore)) {
        out.why = 'This outpost already has a waypoint. One per base.';     // §5.9
        return out;
      }

      /**
       * ROUND 14 — THE CLAIM GATE IS GONE. THIS IS WHERE IT USED TO BE.
       *
       * It read:
       *
       *     if (!claim && !def.claims && entries.length > 0) {
       *       out.why = 'That is outside your claim. Put down a claim stone first.';
       *
       * …and it was a genuine deadlock, reported exactly as one: *"I can't build a claim stone
       * because it requires 2 iron ingots. I can't refine iron without a furnace. I can't build a
       * furnace without a claim stone."* Every one of those three sentences was true. The first
       * thing you ever build stakes a claim for free, so your FIRST furnace was fine — but the
       * moment you wanted a second site, the only key to it cost two ingots you could only make at a
       * machine you were no longer allowed to place.
       *
       * The answer is not a cheaper stone. It is the user's own: *"I don't really want to have claim
       * stones and would rather just allow building arbitrarily anywhere."* So every rule about the
       * WORLD is kept — not on water, not on a slope, not inside something else, on the right ground
       * for the machine — and the one rule about paperwork is deleted. A claim is now only a
       * bookkeeping group: it exists so the reshaping allowance and the terrain brushes have
       * something to be filed against, it is made for you wherever you build, and nothing anywhere
       * asks you to buy one. js/outposts.js works out what the groups MEAN from the geometry.
       */

      // R28 — `free`: the Move tool is carrying a piece already paid for, so the purse is not asked
      if (bill.short && !free) { out.why = `You are short of ${costText(bill.missing)}.`; return out; }

      out.ok = true;
      out.claim = claim;
      return out;
    },

    /**
     * Put it down. Takes the materials, paints the terrain under anything that flattens, and
     * returns the entry — or the refusal, unchanged from `check`.
     */
    place({ id, x, z, rot = 0, name = null }) {
      const test = api.check({ id, x, z, rot });
      if (!test.ok) return { ok: false, why: test.why };
      const def = test.def;

      let claim = test.claim;
      // §4.10 — the very first thing you build stakes the ground it stands on, so nobody has to
      // learn about claims before they can learn about building.
      if (!claim) claim = newClaim(x, z, name);
      // R28 — a placement refused below must not leave an empty outpost behind it
      const refuse = why => { if (!test.claim) claims = claims.filter(c => c !== claim); return { ok: false, why }; };

      /**
       * A FLATTENING PIECE PAINTS ITS OWN GROUND, WHICH IS WHY IT CANNOT FLOAT.
       *
       * §4.17 wants a foundation to "flatten and floor in one action", and the moment it does, the
       * footing rule above becomes true by construction rather than by hoping the player levelled
       * enough. The brush is filed against this claim so razing the base puts the hillside back.
       */
      /**
       * ROUND 14 — LEVEL TO THE AVERAGE, NOT TO THE MIDDLE.
       *
       * This used to take `ground(x, z)` — the height at the piece's own centre — and flatten the
       * whole footprint to it. On flat ground that is right and on a slope it is exactly the "tiles
       * clip through the terrain" complaint: a 6 m paving square laid across a one-in-six bank has
       * corners half a metre above and half a metre below the height it chose, so one corner floats
       * and the opposite one is buried. `levelUnderSlab` in js/roadplan.js samples the four corners
       * AND the middle, levels to the mean, and sizes the skirt by how far the ground was falling —
       * so half the slab is a shallow cut, half a shallow fill, and the edge eases out to the
       * hillside instead of ending in a step.
       */
      // R28 — every terrain brush this placement paints, so undoing it can take them back off
      const tfBefore = terraform?.edits?.length ?? 0;
      const no = groundWork(def, x, z, rot, claim.id, test.levels);
      if (no) return refuse(no);

      bank.take(test.cost);
      const entry = {
        id: 'b' + (nextEntry++),
        key: def.id, name: def.name, cat: def.cat,
        x, z, rot, w: def.w, d: def.d, h: def.h,
        y: ground(x, z),
        claim: claim.id,
        hp: structureHp(def), maxHp: structureHp(def),
        waypoint: !!def.waypoint,
        run: !!def.run,
        gate: !!def.gate,
        powered: !def.power?.use,          // a machine is dark until the grid reaches it
      };
      entries.push(entry);
      /**
       * A CLAIM STONE IS A SIGNPOST NOW, NOT A PERMIT.
       *
       * It is kept in the catalogue on purpose rather than deleted — an old save may have one
       * standing, js/defence.js finds the middle of a base by looking for one, and it is a
       * perfectly good thing to put in the middle of a camp. What it does is move the group's
       * centre to itself and carry a NAME, which js/outposts.js reads so an outpost you cared
       * enough about to mark is called something other than "Mine 3".
       */
      if (def.claims) {
        claim.x = x; claim.z = z; claim.stone = entry.id;
        if (name) claim.name = name;
        entry.outpostName = claim.name;
      }
      const tf = (terraform?.edits || []).slice(tfBefore).map(e => e.id).filter(Boolean);
      return { ok: true, entry, claim, cost: test.cost, levelled: !!test.levels, tf };
    },

    /** §4.7 — the deconstruct tool. Most of it back, because experimenting should be cheap. */
    remove(entryId, { fraction = refund } = {}) {
      const i = entries.findIndex(e => e.id === entryId);
      if (i < 0) return { ok: false, why: 'Nothing there.' };
      const entry = entries[i];
      const def = byId.get(entry.key);
      entries.splice(i, 1);
      // in material ids, like the bill — a refund of "timber" would put a word nothing spends
      // back into the pool, and the player would watch their logs disappear into a phantom
      // R28 — `fraction` 1 is the Move tool and Undo: a full refund, because nothing was wasted
      const back = realCost(fraction >= 1 ? (def?.cost || {}) : scaleCost(def?.cost || {}, fraction));
      bank.give(back);
      return { ok: true, entry, refund: back };
    },

    /**
     * R28 — CAN THE MOVE TOOL PICK THIS UP?
     *
     * Moving keeps the piece's id (`relocate`), so anything that files against the id alone — a
     * guard standing a watch post, the outpost a piece belongs to — is undisturbed. What it cannot
     * fix is a system that also keeps the piece's POSITION: a store pool's reach, a grid unit, a
     * refining queue's bench, a drill's seam and haul route, the waypoint network, a citizen's bed.
     * Those are refused with the sentence, rather than moved and left pointing at empty grass.
     */
    movable(entryOrKey) {
      const def = byId.get(typeof entryOrKey === 'string' ? entryOrKey : entryOrKey?.key);
      if (!def) return { ok: false, why: 'Nothing there.' };
      if (def.store || def.pool) return { ok: false, why: `The ${def.name} holds goods — take it down (its goods go to the nearest store, or your bag) and build it again.` };
      if (def.power || def.station || def.needs || def.waypoint || def.home || def.claims || def.turret
        || ['refine', 'extract', 'craft', 'store', 'power', 'waypoint', 'home', 'trade'].includes(def.cat)) {
        return { ok: false, why: `The ${def.name} is part of the base's workings — take it down and build it again instead.` };
      }
      return { ok: true, def };
    },

    /**
     * R28 — MOVE A PIECE, KEEPING ITS ID: the same tests as a fresh placement (ground, neighbours,
     * research), with itself ignored and nothing charged, because it is already paid for. Returns
     * where it was, so Undo can carry it back.
     */
    relocate(entryId, { x, z, rot = 0 }) {
      const entry = entries.find(e => e.id === entryId);
      if (!entry) return { ok: false, why: 'Nothing there.' };
      const can = api.movable(entry);
      if (!can.ok) return can;
      const test = api.check({ id: entry.key, x, z, rot, ignore: entry.id, free: true });
      if (!test.ok) return { ok: false, why: test.why };
      const tfBefore = terraform?.edits?.length ?? 0;
      const no = groundWork(can.def, x, z, rot, entry.claim, test.levels);
      if (no) return { ok: false, why: no };
      const from = { x: entry.x, z: entry.z, rot: entry.rot || 0 };
      Object.assign(entry, { x, z, rot, y: ground(x, z) });
      const tf = (terraform?.edits || []).slice(tfBefore).map(e => e.id).filter(Boolean);
      return { ok: true, entry, from, levelled: !!test.levels, tf };
    },

    /** R28 — what taking this down would give back, for the hover card BEFORE the click. */
    refundFor(entryOrKey, fraction = refund) {
      const def = byId.get(typeof entryOrKey === 'string' ? entryOrKey : entryOrKey?.key);
      return realCost(fraction >= 1 ? (def?.cost || {}) : scaleCost(def?.cost || {}, fraction));
    },

    /**
     * R28 — PUT A TAKEN-DOWN PIECE BACK, exactly where it was and under the same id: Undo of Take
     * down and of Move. It costs what came back out of it (`charge`), so undoing a take-down is
     * never a way to turn 75% into 100%. Refused, with the sentence, if something now stands there
     * or the purse no longer covers it.
     */
    restore(snapshot, charge = null) {
      if (!snapshot || entries.some(e => e.id === snapshot.id)) return { ok: false, why: 'It is already standing.' };
      const def = byId.get(snapshot.key);
      if (!def) return { ok: false, why: 'No such structure.' };
      const spot = { x: snapshot.x, z: snapshot.z, w: snapshot.w ?? def.w, d: snapshot.d ?? def.d, rot: snapshot.rot || 0 };
      for (const e of entries) {
        if ((def.h <= 0.3) || (e.h <= 0.3)) continue;
        const clash = (def.run || def.gate) && (e.run || e.gate) ? runPiecesClash(spot, spotOf(e)) : boxesOverlap(spot, spotOf(e), 1e-6);
        if (clash) return { ok: false, why: `The ${e.name} stands there now.` };
      }
      const cost = charge || realCost(def.cost || {});
      for (const [k, n] of Object.entries(cost)) {
        if (n > 0 && bank.have(k) < n) return { ok: false, why: `You are short of ${costText({ [k]: n - bank.have(k) })} to put it back.` };
      }
      bank.take(cost);
      const entry = { ...snapshot, y: ground(snapshot.x, snapshot.z) };
      entries.push(entry);
      return { ok: true, entry, cost };
    },

    /**
     * R28 — THE UPGRADE TOOL: a palisade becomes a stone wall where it stands.
     *
     * `upgradesTo` on a catalogue row names the next step. The new piece is paid as the DIFFERENCE
     * (`upgradeCost`), keeps the entry's id — so whatever files against that id (the outpost, the
     * terrain brushes, a raid's idea of the base) is undisturbed — and must pass the same tests a
     * fresh placement would: researched, not standing inside a neighbour, affordable.
     *
     * Refused for any piece that holds a store or runs a station, on either side of the upgrade:
     * those carry contents and queues in systems this ledger does not own, and swapping the key
     * under them is how a crate would lose what was in it.
     */
    upgradeOf(entryOrId) {
      const entry = typeof entryOrId === 'string' ? entries.find(e => e.id === entryOrId) : entryOrId;
      if (!entry) return { ok: false, why: 'Nothing there.' };
      const from = byId.get(entry.key);
      const to = from?.upgradesTo ? byId.get(from.upgradesTo) : null;
      if (!to) return { ok: false, entry, why: `The ${entry.name} is as good as it gets.` };
      const out = { ok: false, entry, from, to, cost: upgradeCost(from.cost, to.cost), missing: {}, why: '' };
      /**
       * Walls, fences and hedges only. Anything a system files (a store, the grid, a bench, a
       * turret, a watch post) keeps facts about its TYPE in that system, and swapping the type
       * under it is how a crate loses its contents or a lamp goes dark on a grid it never joined.
       */
      const plain = d => d.run && !d.store && !d.pool && !d.station && !d.power && !d.turret && !d.post && !d.home;
      if (!plain(from) || !plain(to)) { out.why = 'Only walls, fences and hedges upgrade in place — take this down and build the new one.'; return out; }
      const gate = locked ? locked(to) : null;
      if (gate) { out.why = gate.text || 'You have not researched that yet.'; out.locked = gate; return out; }
      const spot = { x: entry.x, z: entry.z, w: to.w, d: to.d, rot: entry.rot || 0 };
      for (const e of entries) {
        if (e.id === entry.id || to.h <= 0.3 || e.h <= 0.3) continue;
        const clash = (e.run || e.gate) ? runPiecesClash(spot, spotOf(e)) : boxesOverlap(spot, spotOf(e), 1e-6);
        if (clash) { out.why = `A ${to.name} is bigger — it would stand inside the ${e.name}.`; return out; }
      }
      for (const [k, n] of Object.entries(out.cost)) {
        const short = n - bank.have(k);
        if (short > 0) out.missing[k] = short;
      }
      if (Object.keys(out.missing).length) { out.why = `You are short of ${costText(out.missing)}.`; return out; }
      out.ok = true;
      return out;
    },
    upgrade(entryId) {
      const test = api.upgradeOf(entryId);
      if (!test.ok) return test;
      if (!bank.take(test.cost)) return { ok: false, why: 'You could not pay for it.' };
      const { entry, from, to } = test;
      const was = { key: entry.key, name: entry.name, w: entry.w, d: entry.d, h: entry.h, hp: entry.hp, maxHp: entry.maxHp, run: entry.run, gate: entry.gate, powered: entry.powered };
      Object.assign(entry, {
        key: to.id, name: to.name, cat: to.cat, w: to.w, d: to.d, h: to.h,
        hp: structureHp(to), maxHp: structureHp(to), run: !!to.run, gate: !!to.gate, powered: !to.power?.use,
      });
      return { ok: true, entry, from, to, paid: test.cost, was };
    },
    /** R28 — Undo of an upgrade: the old piece back, and what was paid for the new one. */
    downgrade(entryId, was, paid = {}) {
      const entry = entries.find(e => e.id === entryId);
      if (!entry || !was) return { ok: false, why: 'Nothing there.' };
      Object.assign(entry, was, { cat: byId.get(was.key)?.cat || entry.cat });
      bank.give(paid);
      return { ok: true, entry };
    },

    /**
     * R28 — WHAT IS UNDER THE CURSOR, for every tool you point at a piece.
     *
     * Inside a footprint wins outright (a crate standing next to a long wall is the crate when you
     * point at the crate); otherwise the nearest middle within `reach`. The old `nearestEntry` was
     * middle-distance only, so pointing at the end of a 6 m house picked the lamp beside its door.
     */
    pickEntry(x, z, reach = 3) {
      let inside = null;
      for (const e of entries) {
        if (insideFootprint(e, x, z, 0.3) && (!inside || e.w * e.d < inside.w * inside.d)) inside = e;
      }
      if (inside) return inside;
      let best = null;
      for (const e of entries) {
        const dist = Math.hypot(e.x - x, e.z - z);
        if (dist <= reach + Math.max(e.w, e.d) / 2 && (!best || dist < best.dist)) best = { e, dist };
      }
      return best ? best.e : null;
    },

    /**
     * R28 — WHERE A WALL-MOUNTED PIECE HANGS: the nearest side of a wall, a gate or a building.
     *
     * A host is anything standing at least 1.5 m tall that is not itself wall-mounted. Each of its
     * four sides is a segment; the cursor is projected onto the nearest one within `mountReach`, and
     * the piece goes flat against it, its back to the wall (`d / 2` out, plus a hair so the overlap
     * test reads "touching" and not "inside"), turned to face away from the host.
     */
    mountOn({ id, x, z, ignore = null }) {
      const def = byId.get(id);
      if (!def) return null;
      let best = null;
      for (const e of entries) {
        if (e.id === ignore) continue;
        const edef = byId.get(e.key);
        if (!edef || edef.snap === 'wall' || (e.h ?? edef.h) < 1.5) continue;
        if (Math.hypot(e.x - x, e.z - z) > Math.max(e.w, e.d) / 2 + mountReach + 1) continue;
        const r = e.rot || 0, c = Math.cos(r), s = Math.sin(r);
        // the four sides, as (outward normal angle, half-length along the side, offset to the side)
        for (const [nx, nz, half, off, faceRot] of [
          [-s, c, e.w / 2, e.d / 2, r], [s, -c, e.w / 2, e.d / 2, r + Math.PI],
          [c, s, e.d / 2, e.w / 2, r - Math.PI / 2], [-c, -s, e.d / 2, e.w / 2, r + Math.PI / 2],
        ]) {
          const fx = e.x + nx * off, fz = e.z + nz * off;            // middle of this side
          const tx = -nz, tz = nx;                                   // along the side
          const along = Math.max(-half + def.w / 2, Math.min(half - def.w / 2, (x - fx) * tx + (z - fz) * tz));
          const out = (x - fx) * nx + (z - fz) * nz;
          if (out < -0.5) continue;                                   // the cursor is behind this side
          const px = fx + tx * along, pz = fz + tz * along;
          const dist = Math.hypot(x - px, z - pz);
          if (dist > mountReach || (best && dist >= best.dist)) continue;
          const lift = def.d / 2 + 0.02;
          best = { x: px + nx * lift, z: pz + nz * lift, rot: ((faceRot % TAU) + TAU) % TAU, mount: e.id, dist };
        }
      }
      return best ? { x: best.x, z: best.z, rot: best.rot, mount: best.mount } : null;
    },

    /** R28 — a Shift+click line, checked: the spots, and which of them would be refused. */
    lineFrom({ id, from, to, rot = 0 }) {
      const def = byId.get(id);
      if (!def || !from || !to) return { spots: [], ok: 0, cost: {}, text: '' };
      const spots = lineSpots({ w: def.w, d: def.d, from, to, rot, max: lineMax });
      const total = {};
      addCost(total, realCost(def.cost || {}), spots.length);
      return { spots, count: spots.length, cost: total, text: costText(total) };
    },
    placeLine({ id, from, to, rot = 0 }) {
      const { spots } = api.lineFrom({ id, from, to, rot });
      const placed = [], skipped = [], tf = [];
      for (const sp of spots) {
        const res = api.place({ id, x: sp.x, z: sp.z, rot: sp.rot });
        if (res.ok) { placed.push(res.entry); tf.push(...(res.tf || [])); } else skipped.push({ ...sp, why: res.why });
      }
      return { ok: placed.length > 0, placed, skipped, tf };
    },

    /** R28 — the price of a run before Enter: how many pieces, how many gates, and the bill. */
    runBill({ id, points, gateCorners = [] }) {
      const def = byId.get(id);
      if (!def || (points || []).length < 2) return { count: 0, gates: 0, cost: {}, missing: {}, text: '', ok: false };
      const gateDef = byId.get(def.gateId) || (def.cat === 'defence' ? byId.get('gate') : null);
      const spots = runSpots(def, points, { gateCorners, gateDef });
      const total = {};
      for (const sp of spots) addCost(total, realCost(byId.get(sp.id)?.cost || {}));
      const missing = {};
      for (const [k, n] of Object.entries(total)) if (n - bank.have(k) > 0) missing[k] = n - bank.have(k);
      return {
        count: spots.length, gates: spots.filter(sp => sp.gate).length, spots,
        cost: total, missing, ok: !Object.keys(missing).length, text: costText(total),
        why: Object.keys(missing).length ? `You are short of ${costText(missing)}.` : '',
      };
    },

    /** §4.9 — take the last placement back, materials and all. */
    undo() {
      const entry = entries[entries.length - 1];
      if (!entry) return { ok: false, why: 'Nothing to undo.' };
      if (entries.length > undoDepth + 200) return { ok: false, why: 'Too long ago.' };
      const def = byId.get(entry.key);
      entries.pop();
      bank.give(realCost(def?.cost || {}));          // undo is a full refund; deconstruct is not
      return { ok: true, entry };
    },

    /**
     * §4.14/§4.16 — drag a run of wall or road along a polyline.
     *
     * The run is cut into whole pieces along each leg, each piece turned to face the leg, and a
     * corner is simply where two legs meet — which is what gives "it corners itself". Anything that
     * will not fit (a river, a boulder, an empty purse) is skipped and reported rather than
     * aborting the whole drag, because a wall that stops at the water is a wall and a wall that
     * refuses to exist is a bug report.
     */
    run({ id, points, gateAt = [], gateCorners = [] }) {
      const def = byId.get(id);
      if (!def) return { ok: false, why: 'No such structure.' };
      const placed = [], skipped = [], tf = [];
      /**
       * R28 — gates by CORNER, which is what the player clicks, or by section index (`gateAt`, the
       * old form, which nothing in the game ever filled). Both go through `runSpots`, which makes
       * room for the gate's own width instead of dropping it into a section's slot.
       */
      const gateDef = byId.get(def.gateId) || (def.cat === 'defence' ? byId.get('gate') : null);
      for (const sp of runSpots(def, points, { gateCorners: gateCorners || [], gateAt, gateDef })) {
        const res = api.place({ id: sp.id, x: sp.x, z: sp.z, rot: sp.rot });
        if (res.ok) { placed.push(res.entry); tf.push(...(res.tf || [])); } else skipped.push({ x: sp.x, z: sp.z, why: res.why });
      }
      return { ok: placed.length > 0, placed, skipped, tf };
    },

    /**
     * §4.8 — copy a cluster and stamp it somewhere else.
     *
     * The blueprint is stored relative to its own centre and rotation, so stamping it turned puts
     * the whole camp down turned. It is data, not geometry, which means it can live in a save, be
     * traded, or be handed out as a raid reward the way §7.14 suggests.
     */
    blueprint(entryIds, name = 'Blueprint') {
      const picked = entries.filter(e => entryIds.includes(e.id));
      if (!picked.length) return null;
      const cx = picked.reduce((a, e) => a + e.x, 0) / picked.length;
      const cz = picked.reduce((a, e) => a + e.z, 0) / picked.length;
      return {
        name,
        pieces: picked.map(e => ({ key: e.key, dx: e.x - cx, dz: e.z - cz, rot: e.rot || 0 })),
      };
    },

    /**
     * R28 — THE COPY TOOL: every piece whose middle is inside the brush, as a blueprint.
     *
     * The blueprint functions have been here since §4.8 and nothing ever called them. This is the
     * door. Waypoint pads are left out on purpose (one per outpost — a stamped camp would be
     * refused its pad every time), and so is anything wall-mounted whose wall was not copied.
     */
    captureAround(x, z, r, name = null) {
      const inside = entries.filter(e => Math.hypot(e.x - x, e.z - z) <= r && !e.waypoint);
      if (!inside.length) return null;
      const bp = api.blueprint(inside.map(e => e.id), name || `Layout of ${inside.length}`);
      bp.w = Math.round(Math.max(...inside.map(e => Math.abs(e.x - x) + Math.max(e.w, e.d) / 2)) * 2);
      return bp;
    },

    /** R28 — where each piece of a blueprint would land, whether it may, and the whole bill. */
    stampCheck(blueprint, x, z, rot = 0) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const rows = [];
      const total = {};
      for (const p of blueprint?.pieces || []) {
        const px = x + p.dx * c - p.dz * s, pz = z + p.dx * s + p.dz * c;
        const res = api.check({ id: p.key, x: px, z: pz, rot: p.rot + rot });
        // the bill alone would say "short" on every row once the pile is spent by the rows above
        // it, so a row is refused here only for the ground or a neighbour, and the bill is summed
        const blocked = !res.ok && !Object.keys(res.missing || {}).length ? res.why : '';
        rows.push({ key: p.key, x: px, z: pz, rot: p.rot + rot, ok: !blocked && !res.locked, why: res.locked ? res.why : blocked, y: res.ghostY ?? ground(px, pz) });
        if (!blocked && !res.locked) addCost(total, realCost(byId.get(p.key)?.cost || {}));
      }
      const missing = {};
      for (const [k, n] of Object.entries(total)) if (n - bank.have(k) > 0) missing[k] = n - bank.have(k);
      const fits = rows.filter(r => r.ok).length;
      return {
        rows, fits, total: rows.length, cost: total, missing, text: costText(total),
        ok: fits > 0 && !Object.keys(missing).length,
        why: !fits ? (rows[0]?.why || 'None of it fits here.') : Object.keys(missing).length ? `You are short of ${costText(missing)}.` : '',
      };
    },

    stamp(blueprint, x, z, rot = 0) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const placed = [], skipped = [], tf = [];
      for (const p of blueprint?.pieces || []) {
        const px = x + p.dx * c - p.dz * s, pz = z + p.dx * s + p.dz * c;
        const res = api.place({ id: p.key, x: px, z: pz, rot: p.rot + rot });
        if (res.ok) { placed.push(res.entry); tf.push(...(res.tf || [])); } else skipped.push({ key: p.key, why: res.why });
      }
      return { placed, skipped, tf };
    },

    /** Total bill for a blueprint, so the player can be told before they stamp it. */
    billFor(blueprint) {
      const total = {};
      for (const p of blueprint?.pieces || []) addCost(total, realCost(byId.get(p.key)?.cost || {}));
      return total;
    },

    /**
     * Every light this base is throwing, in the shape `js/light.js` wants.
     *
     * Same list, same pool, same falloff as the carried torch — which is the whole of §4c's
     * "they should genuinely light". A lamp post that draws power goes dark when the grid does.
     */
    lights() {
      const out = [];
      for (const e of entries) {
        const def = byId.get(e.key);
        if (!def?.light) continue;
        if (def.power?.use && !e.powered) continue;
        out.push({
          x: e.x, y: e.y + (def.light.y ?? 1), z: e.z,
          color: def.light.color, range: def.light.range,
          intensity: def.light.intensity, flicker: def.light.flicker,
        });
      }
      return out;
    },

    /**
     * §4.4 — the bill for `times` of something, without placing it.
     *
     * The road tool needs this: a lane is priced by the metre, so it has to ask what 62 m of gravel
     * costs and whether the pool covers it BEFORE it starts painting ground. `pay` and `refund` are
     * the other two thirds of the same job — the store is private to this module on purpose, so
     * anything that spends has to come through here and there is one place where a bill is checked
     * against a purse.
     */
    quote(id, times = 1) {
      const def = byId.get(id);
      if (!def) return { ok: false, why: 'No such structure.' };
      // the road and wall tools price a whole run through here, so the gate has to be asked here
      // too or a locked cobbled road could be laid by the metre
      const gate = locked ? locked(def) : null;
      if (gate) return { ok: false, def, times, cost: {}, missing: {}, text: '', why: gate.text, locked: gate };
      const bill = billFor(def, times);
      return {
        ok: !bill.short, def, times,
        cost: bill.cost, missing: bill.missing,
        text: costText(bill.cost),
        why: bill.short ? `You are short of ${costText(bill.missing)}.` : '',
      };
    },
    pay(cost) { return bank.take(cost); },
    refundOf(cost, fraction = refund) { return scaleCost(cost, fraction); },
    giveBack(cost) { bank.give(cost); return cost; },

    /**
     * Round 14 — the groups, worked out from the geometry rather than declared.
     *
     * Delegated to js/outposts.js so the clustering can be tested on its own and so this file does
     * not grow a second idea of what a base is. `lanes` is a js/roadplan.js book's lanes, because a
     * road you laid between two clusters says they are one holding.
     */
    outposts({ lanes = [], gap } = {}) {
      const names = Object.fromEntries(claims.map(c => [c.id, c.name]));
      return groupOutposts(entries, { lanes, gap, defOf: k => byId.get(k) || null, names });
    },

    /** Everything in one claim, for a raid to path at and for the base overview panel. */
    inClaim(claimId) { return entries.filter(e => e.claim === claimId); },
    claimAt,
    /** The waypoint standing in this claim, if any — what `js/waypoints.js` adds to the network. */
    waypointIn(claimId) { return entries.find(e => e.waypoint && e.claim === claimId) || null; },
    waypoints() { return entries.filter(e => e.waypoint); },

    /** Turn the grid on or off over a claim — a dark waypoint cannot be travelled to (§5.10). */
    setPowered(claimId, on) {
      let n = 0;
      for (const e of entries) {
        if (claimId != null && e.claim !== claimId) continue;
        const def = byId.get(e.key);
        if (!def?.power?.use) continue;
        if (e.powered !== !!on) { e.powered = !!on; n++; }
      }
      return n;
    },

    /** The whole base, small enough to sit in a save next to the terrain deltas. */

    // ---- R28: structure damage -------------------------------------------------------------

    /** How hurt a piece is: `{ hp, maxHp, ratio }`. */
    health(entryOrId) {
      const e = typeof entryOrId === 'string' ? entries.find(x => x.id === entryOrId) : entryOrId;
      if (!e) return null;
      const maxHp = e.maxHp || structureHp(byId.get(e.key));
      const hp = Math.max(0, Math.min(maxHp, e.hp ?? maxHp));
      return { hp, maxHp, ratio: maxHp > 0 ? hp / maxHp : 1 };
    },

    /**
     * Something hit a piece. At 0 it is BROKEN: out of the ledger, and `rules.salvage` of its cost
     * (0.25) comes back — less than a take-down's 0.75, because you did not take it apart
     * carefully, somebody kicked it in. Not an undo step; a broken wall is not something you did.
     */
    damage(entryId, amount) {
      const e = entries.find(x => x.id === entryId);
      if (!e || !(amount > 0)) return { ok: false, why: 'Nothing there.' };
      const h = api.health(e);
      e.maxHp = h.maxHp;
      e.hp = Math.max(0, h.hp - amount);
      if (e.hp > 0) return { ok: true, entry: e, hp: e.hp, maxHp: e.maxHp, destroyed: false };
      const res = api.remove(e.id, { fraction: salvage });
      return { ok: true, entry: res.entry, hp: 0, maxHp: h.maxHp, destroyed: true, refund: res.refund };
    },

    /** The Repair tool's quote: what it costs to put this piece back to full, and whether you can. */
    repairOf(entryOrId) {
      const e = typeof entryOrId === 'string' ? entries.find(x => x.id === entryOrId) : entryOrId;
      if (!e) return { ok: false, why: 'Nothing there.' };
      const def = byId.get(e.key);
      const h = api.health(e);
      const missing = h.maxHp - h.hp;
      const out = { ok: false, entry: e, hp: h.hp, maxHp: h.maxHp, missing, cost: {}, why: '' };
      if (!(missing > 0)) { out.why = `The ${e.name} is not damaged.`; return out; }
      out.cost = repairCost(def, missing, h.maxHp, repairShare);
      const short = {};
      for (const [k, n] of Object.entries(out.cost)) if (bank.have(k) < n) short[k] = n - bank.have(k);
      if (Object.keys(short).length) { out.why = `You are short of ${costText(short)}.`; out.short = short; return out; }
      out.ok = true;
      return out;
    },

    /** Pay the quote and put the piece back to full. */
    repair(entryId) {
      const q = api.repairOf(entryId);
      if (!q.ok) return q;
      bank.take(q.cost);
      const was = q.entry.hp;
      q.entry.hp = q.maxHp;
      return { ok: true, entry: q.entry, paid: q.cost, was, healed: q.missing };
    },

    /** Undo of a repair: the damage back, and what it cost. */
    unrepair(entryId, hp, paid = {}) {
      const e = entries.find(x => x.id === entryId);
      if (!e) return { ok: false };
      e.hp = hp;
      bank.give(paid);
      return { ok: true, entry: e };
    },

    /** Free hit points (a Repair Station's slow mend). Returns how many went back. */
    heal(entryId, amount) {
      const e = entries.find(x => x.id === entryId);
      if (!e || !(amount > 0)) return 0;
      const h = api.health(e);
      const add = Math.min(amount, h.maxHp - h.hp);
      if (add > 0) e.hp = h.hp + add;
      return Math.max(0, add);
    },

    /** The built piece in the way of a walker from A to B — see `blockingPiece`. */
    blocking(ax, az, bx, bz, opts = {}) {
      return blockingPiece(entries, k => byId.get(k), ax, az, bx, bz, opts);
    },

    toJSON() {
      return {
        v: 1,
        entries: entries.map(e => ({ ...e, x: r3(e.x), z: r3(e.z), y: r3(e.y), rot: r3(e.rot) })),
        claims: claims.map(c => ({ ...c })),
      };
    },

    /**
     * R16 — A SAVED ENTRY CARRIES A CATEGORY, AND CATEGORIES MOVE.
     *
     * `place` copies `def.cat` onto the entry, so every drill in a save made before R16 has
     * `cat: "refine"` written into it — and js/outposts.js `roleOf` reads `e.cat` FIRST and only
     * falls back to the definition. Without this line an old base full of drills would keep calling
     * itself a Workshops outpost for ever, because nothing ever re-reads the catalogue for a piece
     * that is already standing.
     *
     * The id is what a save really depends on and no id changed; the category is display data, so
     * the catalogue is always right and the save is always stale. Re-derive it, every load.
     */
    load(data) {
      entries = (data?.entries || []).map(e => {
        const copy = { ...e };
        // A catalogue id renamed after saves already held it: point the old piece at the new row
        // and take the catalogue's name, so an old base keeps its stone instead of losing it.
        if (RENAMED_STRUCTURES[copy.key]) {
          copy.key = RENAMED_STRUCTURES[copy.key];
          if (byId.get(copy.key)) copy.name = byId.get(copy.key).name;
        }
        const def = byId.get(copy.key);
        if (def) copy.cat = def.cat;
        /**
         * R28 — hit points. The ceiling is always the catalogue's (a tuning change reaches old
         * bases); the damage is the save's. A save from before R28 wrote `hp: 0` for every piece
         * with no catalogue hp, and a broken piece is never saved standing, so 0 or missing is full.
         */
        if (def) {
          copy.maxHp = structureHp(def);
          copy.hp = copy.hp > 0 ? Math.min(copy.hp, copy.maxHp) : copy.maxHp;
        }
        return copy;
      });
      claims = (data?.claims || []).map(c => ({ ...c }));
      nextEntry = entries.reduce((n, e) => Math.max(n, Number(String(e.id).slice(1)) + 1 || 0), 1);
      nextClaim = claims.reduce((n, c) => Math.max(n, Number(String(c.id).slice(2)) + 1 || 0), 1);
      return entries.length;
    },
  };

  if (saved) api.load(saved);
  return api;
}

const r3 = v => Math.round((v || 0) * 1000) / 1000;
