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
export function alignCatalogue(catalogue, resources = null) {
  if (!catalogue?.structures) return catalogue;
  const names = { ...(catalogue.materials || {}) };
  for (const [short, real] of Object.entries(MATERIAL_ALIASES)) {
    if (!names[real]) names[real] = { ...(names[short] || {}), name: names[short]?.name || real.replace(/_/g, ' ') };
  }
  // …and anything the catalogue spends that it never named gets the resource file's own word
  for (const [id, m] of Object.entries(resources?.materials || {})) {
    if (!names[id]) names[id] = { name: m.name, tier: m.tier };
  }
  return {
    ...catalogue,
    materials: names,
    structures: catalogue.structures.map(st => (st.cost ? { ...st, cost: realCost(st.cost) } : st)),
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

  const byId = new Map((catalogue?.structures || []).map(s => [s.id, s]));

  const bank = store || { have: () => Infinity, take: () => true, give: () => {} };
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
        return `${n} ${word.toLowerCase()}`;
      })
      .join(', ');
  }

  const api = {
    get rules() { return { grid, snapDistance, rotateStep, refund, defaultSlope, footing, claimRadius }; },
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
     * §4.2/§4.3 — snap by default, free placement when the player holds the key down.
     *
     * Two passes: first offer the edge of any nearby piece of the same family (walls join walls,
     * floors tile), then fall back to the grid. Snapping to a PIECE first is what makes a wall run
     * come out as a wall rather than as a row of fence panels that nearly touch.
     */
    snap({ id, x, z, rot = 0, free = false }) {
      const def = byId.get(id);
      if (free || !def) return { x, z, rot };
      const step = rotateStep;
      let best = null;
      for (const e of entries) {
        if (e.cat !== def.cat && !(e.run && def.run)) continue;
        // the mid-point of each of the neighbour's two end faces, in world metres
        const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0);
        for (const side of [-1, 1]) {
          const off = (e.w / 2 + def.w / 2) * side;
          const px = e.x + off * c, pz = e.z + off * s;
          const dist = Math.hypot(px - x, pz - z);
          if (dist < snapDistance && (!best || dist < best.dist)) best = { x: px, z: pz, rot: e.rot || 0, dist };
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
    check({ id, x, z, rot = 0, ignore = null }) {
      const def = byId.get(id);
      if (!def) return { ok: false, why: 'No such structure.' };
      const spot = { x, z, w: def.w, d: def.d, rot };
      const foot = footingOf(spot);
      const bill = billFor(def);
      const out = { ok: false, why: '', def, cost: bill.cost, missing: bill.missing, ghostY: foot.y, gap: foot.gap };

      if (terrain?.waterAt && terrain.waterAt(x, z)) { out.why = 'You cannot build on water.'; return out; }

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
        if (steepness(x, z) > maxSlope) { out.why = 'The ground is too steep here — level it first.'; return out; }
        if (foot.gap > footing) { out.why = 'The ground under this is uneven — level it first.'; return out; }
      }

      for (const e of entries) {
        if (ignore && e.id === ignore) continue;
        // Flat things tile: paving over a foundation is the point, not a mistake. Anything with
        // real height, though, has to keep clear of anything else with real height.
        if ((def.h <= 0.3) !== (e.h <= 0.3)) continue;
        if (def.h <= 0.3 && e.h <= 0.3) continue;
        if (boxesOverlap(spot, spotOf(e))) { out.why = `That would stand inside the ${e.name}.`; return out; }
      }

      if (def.needs && siteOk && !siteOk(def.needs, x, z)) {
        const what = { node: 'an ore node', water: 'water', vent: 'a gas vent' }[def.needs] || def.needs;
        out.why = `A ${def.name.toLowerCase()} has to stand on ${what}.`;
        return out;
      }

      const claim = claimAt(x, z);
      if (def.waypoint && claim && entries.some(e => e.waypoint && e.claim === claim.id)) {
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

      if (bill.short) { out.why = `You are short of ${costText(bill.missing)}.`; return out; }

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
      if (terraform && (def.flatten || def.h <= 0.3)) {
        if (def.flatten === 'pit') {
          terraform.lower({ x, z, r: Math.max(def.w, def.d) / 2, amount: 2.4, claim: claim.id });
        } else {
          levelUnderSlab({ x, z, w: def.w + (def.flatten === 'strip' ? 0 : 0.6), d: def.d + (def.flatten === 'strip' ? 0 : 0.6), rot },
            { terrain: { heightAt: ground }, terraform, claim: claim.id });
        }
      }

      bank.take(test.cost);
      const entry = {
        id: 'b' + (nextEntry++),
        key: def.id, name: def.name, cat: def.cat,
        x, z, rot, w: def.w, d: def.d, h: def.h,
        y: ground(x, z),
        claim: claim.id,
        hp: def.hp || 0, maxHp: def.hp || 0,
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
      return { ok: true, entry, claim, cost: test.cost };
    },

    /** §4.7 — the deconstruct tool. Most of it back, because experimenting should be cheap. */
    remove(entryId) {
      const i = entries.findIndex(e => e.id === entryId);
      if (i < 0) return { ok: false, why: 'Nothing there.' };
      const entry = entries[i];
      const def = byId.get(entry.key);
      entries.splice(i, 1);
      // in material ids, like the bill — a refund of "timber" would put a word nothing spends
      // back into the pool, and the player would watch their logs disappear into a phantom
      const back = realCost(scaleCost(def?.cost || {}, refund));
      bank.give(back);
      return { ok: true, entry, refund: back };
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
    run({ id, points, gateAt = [] }) {
      const def = byId.get(id);
      if (!def) return { ok: false, why: 'No such structure.' };
      const placed = [], skipped = [];
      let n = 0;
      for (let i = 0; i + 1 < points.length; i++) {
        const [ax, az] = points[i], [bx, bz] = points[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const count = Math.max(1, Math.round(len / def.w));
        const rot = Math.atan2(bz - az, bx - ax);
        for (let k = 0; k < count; k++) {
          const t = (k + 0.5) / count;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const useId = gateAt.includes(n) && def.cat === 'defence' ? 'gate' : id;
          const res = api.place({ id: byId.has(useId) ? useId : id, x, z, rot });
          if (res.ok) placed.push(res.entry); else skipped.push({ x, z, why: res.why });
          n++;
        }
      }
      return { ok: placed.length > 0, placed, skipped };
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

    stamp(blueprint, x, z, rot = 0) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const placed = [], skipped = [];
      for (const p of blueprint?.pieces || []) {
        const px = x + p.dx * c - p.dz * s, pz = z + p.dx * s + p.dz * c;
        const res = api.place({ id: p.key, x: px, z: pz, rot: p.rot + rot });
        if (res.ok) placed.push(res.entry); else skipped.push({ key: p.key, why: res.why });
      }
      return { placed, skipped };
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
        const def = byId.get(copy.key);
        if (def) copy.cat = def.cat;
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
