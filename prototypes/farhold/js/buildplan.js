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
//   * a claim is a real boundary (§4.10), and exactly one waypoint may stand in it (§5.9).
//
//   import { createBuildPlan, makeBag } from './buildplan.js';
//   const plan = createBuildPlan({ catalogue, terrain, terraform, store: makeBag({ timber: 40 }) });
//   plan.check({ id: 'furnace', x, z, rot });   // → { ok, why, cost, missing, ghostY }
//   plan.place({ id: 'furnace', x, z, rot });
//
// The catalogue is `data/structures.json`. The caller loads the JSON and passes it in, because a
// browser and `node --test` fetch a file in two different ways and neither belongs in here.

const TAU = Math.PI * 2;

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

  function newClaim(x, z, name = null) {
    const c = {
      id: 'cl' + (nextClaim++), x, z, radius: claimRadius,
      name: name || 'Camp ' + nextClaim,
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

  /** The bill for one piece, and what the store is short of. */
  function billFor(def, times = 1) {
    const cost = scaleCost(def.cost || {}, times) ;
    const missing = {};
    for (const [k, n] of Object.entries(cost)) {
      const short = n - bank.have(k);
      if (short > 0) missing[k] = short;
    }
    return { cost, missing, short: Object.keys(missing).length > 0 };
  }

  /** "6 timber, 2 iron" — for the ghost's cost line and for the refusal sentence. */
  function costText(cost) {
    const names = catalogue?.materials || {};
    return Object.entries(cost)
      .map(([k, n]) => `${n} ${(names[k]?.name || k).toLowerCase()}`)
      .join(', ');
  }

  const api = {
    get rules() { return { grid, snapDistance, rotateStep, refund, defaultSlope, footing, claimRadius }; },
    get entries() { return entries; },
    get claims() { return claims; },
    byId: id => byId.get(id) || null,
    all: () => [...byId.values()],
    inCategory: cat => [...byId.values()].filter(s => s.cat === cat),
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

      // A piece that flattens its own ground is allowed to land on a slope — that is what it is for.
      const flattens = !!def.flatten;
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
        out.why = 'This claim already has a waypoint. One per base.';       // §5.9
        return out;
      }
      if (!claim && !def.claims && entries.length > 0) {
        out.why = 'That is outside your claim. Put down a claim stone first.';
        return out;
      }

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
      if (def.flatten && terraform) {
        const h = ground(x, z);
        if (def.flatten === 'strip') {
          terraform.slab({ x, z, w: def.w, d: def.d, rot, h, claim: claim.id });
        } else if (def.flatten === 'pit') {
          terraform.lower({ x, z, r: Math.max(def.w, def.d) / 2, amount: 2.4, claim: claim.id });
        } else {
          terraform.slab({ x, z, w: def.w + 0.6, d: def.d + 0.6, rot, h, claim: claim.id });
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
      if (def.claims) { claim.x = x; claim.z = z; claim.stone = entry.id; }
      return { ok: true, entry, claim, cost: test.cost };
    },

    /** §4.7 — the deconstruct tool. Most of it back, because experimenting should be cheap. */
    remove(entryId) {
      const i = entries.findIndex(e => e.id === entryId);
      if (i < 0) return { ok: false, why: 'Nothing there.' };
      const entry = entries[i];
      const def = byId.get(entry.key);
      entries.splice(i, 1);
      const back = scaleCost(def?.cost || {}, refund);
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
      bank.give(def?.cost || {});                    // undo is a full refund; deconstruct is not
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
      for (const p of blueprint?.pieces || []) addCost(total, byId.get(p.key)?.cost || {});
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

    load(data) {
      entries = (data?.entries || []).map(e => ({ ...e }));
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
