// Farhold — a house is a building, not a bed count.
//
// PURE JavaScript: no DOM, no Three.js, no storage. It is handed the build ledger and the catalogue
// lookup, and it hands back beds with a comfort number on them.
//
//   import { createHousing } from './housing.js';
//   const housing = createHousing({ data: colonyJson });
//   housing.rebuild(build.entries, build.defOf);
//   housing.assign(colony.citizens, { stationAt: id => works.get(id) });
//   housing.report();     // { beds, taken, spare, meanComfort, utilities }
//
// WHY THIS EXISTS.
//
// Until now housing was four lines. `colony.setBeds(n)` stored a number, `_assignBeds()` handed out
// `bed_1 … bed_n` in list order, and the game counted `entries.filter(e => e.key === 'bed')`. Every
// citizen's walk to work was the SAME constant — a quarter of an hour, whether their station was
// next door or four hundred metres up the hill — and data/colony.json has carried
// `walkSpeedMetresPerHour: 3000` and `maxTravelHours: 2` since the colony landed with nothing ever
// reading either of them.
//
// So the lesson the whole system exists to teach was not being taught: **build the bunkhouse next
// to the furnaces.** At 3000 m an in-game hour a station 90 m from the bed costs two minutes each
// way and one 1.2 km away costs 24 minutes each way — 0.8 h out of an 11 h shift, 7% of their
// output, gone into walking. At the two-hour cap they spend a third of the day on the road and the
// roster says so in words.
//
// WHAT A HOUSE IS NOT (§2.6). No interiors, no furniture requirements, no room-quality scoring, no
// ownership disputes, no upgrading a cottage into a manor in place. A house is a footprint, a bed
// count and a comfort number. COLONY.md §2 settled that argument once — *"rudimentary is the brief
// and it is also the right call"* — and a housing system that needed a floor-plan validator would
// make building a village a chore rather than a decision.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const clamp01 = n => clamp(n, 0, 1);
const round2 = n => Math.round(n * 100) / 100;

/** The knobs, if data/colony.json did not load. */
const FALLBACK = {
  comfort: { moodFloor: 0.4, moodSpan: 1.2, utilityKinds: {} },
};

/**
 * Read a structure's blocks off whatever the caller can give us.
 *
 * An entry may carry `home`/`utility` itself (js/buildplan.js copies blocks on to the entry for
 * some of them), or the caller hands us `defOf(key)` and we read the catalogue. Both work, and
 * neither is required — which is why this module needs no edit to js/buildplan.js to be useful.
 */
function blockOf(entry, defOf, name) {
  if (entry && entry[name]) return entry[name];
  const def = defOf ? defOf(entry?.key) : null;
  return def?.[name] || null;
}

export function createHousing({ data = null, linkSlack = 0 } = {}) {
  const D = data || FALLBACK;
  const C = D.comfort || FALLBACK.comfort;

  /** [{ entryId, key, name, x, z, beds, own, comfort }] */
  let houses = [];
  /** [{ entryId, key, name, kind, x, z, radius, comfort, live, why }] */
  let utils = [];
  /** bedId -> citizenId. Kept across a rebuild so nobody is re-housed because a fence went up. */
  const taken = new Map();

  /** Straight-line metres. A house and its well are never on opposite sides of a mountain. */
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  /**
   * COMFORT, AND THE ONE NUMBER IT MOVES.
   *
   *   comfort(house) = clamp01( house.comfort + Σ over DISTINCT utility KINDS in range of u.comfort )
   *
   * Distinct kinds, so four privies is one privy. A cottage (0.35) with a well, a hearth and a
   * privy in range reads 0.35 + 0.20 + 0.15 + 0.10 = 0.80. A bedroll on open ground reads 0.00.
   *
   * Comfort scales the mood a housed citizen recovers overnight and decides whether a vendor will
   * live here. That is ALL it does. A second stat that secretly scaled work output would make "why
   * is my furnace slow" unanswerable, which is the exact failure mode this expansion is trying not
   * to add to.
   */
  function reach(house) {
    const kinds = new Map();
    for (const u of utils) {
      if (!u.live) continue;
      if (dist(u, house) > u.radius + linkSlack) continue;
      const have = kinds.get(u.kind);
      if (!have || u.comfort > have.comfort) kinds.set(u.kind, u);
    }
    return kinds;
  }

  function comfortOfHouse(house) {
    let c = house.own || 0;
    for (const u of reach(house).values()) c += u.comfort || 0;
    return round2(clamp01(c));
  }

  /**
   * Rebuild from what is standing. Called whenever a piece goes up or comes down.
   *
   * A bed keeps its id — `<entryId>#<n>` — so the citizen sleeping in it keeps sleeping in it. Only
   * a bed whose building came down is freed, and the citizen in it is simply unhoused until the
   * next `assign`.
   */
  function rebuild(entries = [], defOf = null) {
    houses = [];
    utils = [];
    for (const e of entries) {
      if (!e || !Number.isFinite(e.x)) continue;
      const home = blockOf(e, defOf, 'home');
      if (home && (home.beds || 0) > 0) {
        houses.push({
          entryId: e.id, key: e.key, name: e.name || e.key,
          x: e.x, z: e.z,
          beds: Math.max(1, Math.floor(home.beds)),
          own: home.comfort || 0,
          comfort: 0,
        });
      }
      const util = blockOf(e, defOf, 'utility');
      if (util && util.kind) {
        utils.push({
          entryId: e.id, key: e.key, name: e.name || e.key,
          kind: util.kind, x: e.x, z: e.z,
          radius: util.radius || 18,
          comfort: util.comfort || 0,
          needsKind: util.needsKind || null,
          live: true, why: null,
        });
      }
    }
    /**
     * A WASH HOUSE WITH NO WELL IS A SHED.
     *
     * One utility may require another KIND within its own radius (`needsKind`). It is the only
     * dependency in the whole housing system and it exists because "coppers and a drain" with no
     * water is exactly the sort of thing a player builds and then wonders about. The panel says
     * which one is missing rather than quietly scoring zero.
     */
    for (const u of utils) {
      if (!u.needsKind) continue;
      const fed = utils.some(o => o !== u && o.kind === u.needsKind && dist(o, u) <= u.radius);
      u.live = fed;
      if (!fed) u.why = `Nothing of the ${u.needsKind} kind stands within ${Math.round(u.radius)} m of it.`;
    }
    for (const h of houses) h.comfort = comfortOfHouse(h);
    // forget anybody whose building came down
    const live = new Set(beds().map(b => b.id));
    for (const id of [...taken.keys()]) if (!live.has(id)) taken.delete(id);
    return { houses: houses.length, utilities: utils.length, beds: bedCount() };
  }

  function bedCount() { return houses.reduce((n, h) => n + h.beds, 0); }

  /** Every bed in the holding, with the comfort of the house it is in. */
  function beds() {
    const out = [];
    for (const h of houses) {
      for (let i = 0; i < h.beds; i++) {
        const id = `${h.entryId}#${i + 1}`;
        out.push({
          id, entryId: h.entryId, house: h.name, key: h.key,
          x: h.x, z: h.z, comfort: h.comfort,
          taken: taken.get(id) || null,
        });
      }
    }
    return out;
  }

  function comfortOf(entryId) { return houses.find(h => h.entryId === entryId)?.comfort ?? 0; }

  /** Which utilities reach this house, in words, for the Houses tab. */
  function servedBy(entryId) {
    const h = houses.find(x => x.entryId === entryId);
    if (!h) return [];
    return [...reach(h).values()].map(u => ({
      kind: u.kind, name: u.name, comfort: u.comfort,
      words: (C.utilityKinds || {})[u.kind] || u.kind,
      metres: Math.round(dist(u, h)),
    }));
  }

  function release(citizenId) {
    for (const [bedId, who] of taken) if (who === citizenId) taken.delete(bedId);
  }

  /**
   * Put everybody in a bed.
   *
   * A citizen bound to a station takes the NEAREST free bed to it, because the walk is real now and
   * the whole lesson is where you put the bunkhouse. A citizen with no station takes the most
   * comfortable free bed instead — they have nowhere to be in the morning, so they may as well
   * sleep well. Anybody already in a bed stays in it; re-housing the whole village every time a
   * fence goes up would make the roster unreadable.
   */
  function assign(citizens = [], { stationAt = null } = {}) {
    const all = beds();
    const byId = new Map(all.map(b => [b.id, b]));
    const here = new Set(citizens.map(c => c.id));
    // anybody who left keeps nothing
    for (const [bedId, who] of [...taken]) if (!here.has(who)) taken.delete(bedId);

    const seated = [];
    for (const c of citizens) {
      const held = [...taken].find(([, who]) => who === c.id);
      if (held && byId.has(held[0])) { seated.push(c); c.home = bedRecord(byId.get(held[0])); }
    }
    const waiting = citizens.filter(c => !seated.includes(c));
    for (const c of waiting) {
      const free = all.filter(b => !taken.get(b.id));
      if (!free.length) { c.home = null; continue; }
      const st = stationAt && c.stationId != null ? stationAt(c.stationId) : null;
      let best = free[0];
      if (st && Number.isFinite(st.x)) {
        let bestScore = Infinity;
        for (const b of free) {
          // distance first, comfort as the tie-break: 30 m of walking is worth a tenth of comfort
          const score = Math.hypot(b.x - st.x, b.z - st.z) - b.comfort * 30;
          if (score < bestScore) { bestScore = score; best = b; }
        }
      } else {
        for (const b of free) if (b.comfort > best.comfort) best = b;
      }
      taken.set(best.id, c.id);
      c.home = bedRecord(best);
    }
    return citizens.filter(c => c.home).length;
  }

  /** What a citizen's `home` is now: an object, not the string `bed_3`. */
  function bedRecord(b) {
    return { bedId: b.id, entryId: b.entryId, house: b.house, x: b.x, z: b.z, comfort: b.comfort };
  }

  function report() {
    const all = beds();
    const free = all.filter(b => !taken.get(b.id));
    const mean = list => (list.length ? round2(list.reduce((s, b) => s + b.comfort, 0) / list.length) : 0);
    return {
      beds: all.length,
      taken: all.length - free.length,
      spare: free.length,
      meanComfort: mean(all),
      // nobody is drawn by a full manor: the appeal term is the comfort of the beds still going
      freeComfort: mean(free),
      best: free.sort((a, b) => b.comfort - a.comfort)[0] || null,
      houses: houses.length,
      utilities: utils.filter(u => u.live).length,
      utilityKinds: [...new Set(utils.filter(u => u.live).map(u => u.kind))],
      dark: utils.filter(u => !u.live).map(u => ({ name: u.name, why: u.why })),
    };
  }

  return {
    rebuild, beds, assign, release, report, comfortOf, servedBy,
    houses: () => houses.slice(),
    utilities: () => utils.slice(),
    bedCount,
    /** For the save: only who is in which bed. Everything else is worked out from what is standing. */
    toJSON() { return { v: 1, taken: [...taken] }; },
    load(json) {
      taken.clear();
      for (const [bedId, who] of json?.taken || []) taken.set(bedId, who);
      return taken.size;
    },
  };
}
