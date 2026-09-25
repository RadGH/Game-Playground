// Farhold — the people who live at your base.
//
// PURE JavaScript: no DOM, no Three.js. `data/colony.json` carries every number; the bodies that
// walk around are somebody else's problem (js/actors.js), and this file only ever says where a
// citizen IS and what they are doing.
//
//   import { createColony } from './colony.js';
//   const colony = createColony({ data: colonyJson, board, food: farm, seed: 7 });
//   colony.welcome(colony.newCitizen({ job: 'farmer' }));
//   colony.setBase({ structures: 14, defences: 5, beds: 6 });
//   colony.tick(24);      // a whole day: they wake, walk to work, work, walk home, eat, sleep
//
// WHY THIS EXISTS.
//
//   "Let's use the game Colony Survival as inspiration as that game has a full economy based on
//    workers going to work every day. I'd like a similar system, though rudimentary."
//
// (Colony Survival and Necesse are named here as design references and nowhere a player can read.)
// Rudimentary is the brief and it is also the right call: five states, one schedule, one hunger
// number, one mood number. The interest comes from the fact that a citizen's hour of work is the
// SAME work unit as a swing of your own arm (js/work.js), so every citizen you house is a decision
// about whether you would rather be smelting or out killing something.
//
// THE FOUR LEVERS, AND WHAT EACH ONE IS FOR
//
//   Food    — citizens eat; an unfed colony degrades along a ladder the player can watch happening
//             (slower, then sulking, then downing tools, then walking out). Nobody ever starves to
//             death: a dead citizen makes you reload, a departed one makes you build a granary.
//   Housing — a bed is the whole model. Housed citizens pay tax; unhoused ones sleep rough and do
//             not. It is also the biggest pull on migration, so a house you build before you have
//             anybody is a sensible thing to have built.
//   Tax     — gold out of people rather than out of corpses, and ONLY out of people who are both
//             fed and housed. That is the lever: the answer to "how do I make money" is always
//             "look after more people".
//   Growth  — migrants turn up because the place is worth coming to, and can be recruited out of
//             towns for coin. Both are OFFERS: a citizen you did not agree to is a mouth you did
//             not budget for.

import { workLeft } from './work.js';

/** A safety net if the JSON did not load. `data/colony.json` is the real file. */
const FALLBACK = {
  schedule: { wake: 6, leaveForWork: 7, leaveWork: 18, bed: 22, mealHours: [7, 13, 19], travelHoursDefault: 0.25, walkSpeedMetresPerHour: 3000, maxTravelHours: 2 },
  jobs: [{ key: 'labourer', name: 'Labourer', tags: null, unitsPerHour: 1, mayBreakGround: false }],
  food: { perCitizenPerDay: 2, hungerPerDay: 0.5, hungerFedPerMeal: 0.34, rungs: { hungry: 0.3, grumbling: 0.55, downsTools: 0.78, leaves: 1 }, outputAtHungry: 0.65, moodLossPerDayHungry: 0.35, moodGainPerDayFed: 0.2 },
  housing: { moodLossPerDayUnhoused: 0.25, moodGainPerNightHoused: 0.12, spareBedsIgnoredAbove: 12 },
  tax: { perCitizenPerDay: 6, moodFloor: 0.25, prosperityPerStructure: 0.01, prosperityMax: 1.5, unhousedPays: 0, grumblingPays: 0 },
  migration: { rollEveryHours: 24, baseChance: 0.08, chanceAtFullAppeal: 0.55, weights: { spareBeds: 0.3, foodDays: 0.3, safety: 0.2, mood: 0.2 }, foodDaysForFullMarks: 6, spareBedsForFullMarks: 3, safetyForFullMarks: 6, offerExpiresHours: 12, maxPending: 2 },
  recruit: { poolPerSettlementSize: 1.5, poolRefillDays: 8, basePrice: 120, pricePerExistingCitizen: 18, priceBySkill: 90, standingDiscountAtMax: 0.35, maxSkill: 1.6, minSkill: 0.75 },
  names: { first: ['Ard', 'Bri', 'Cal'], last: ['a', 'en', 'ith'], family: ['Ashfoot', 'Bellow', 'Carrick'] },
};

/** The five things a citizen can be doing. Rudimentary on purpose — see the header. */
export const CITIZEN_STATES = {
  asleep:  { id: 'asleep',  name: 'Asleep',        blurb: 'In bed, or as near as they have.' },
  home:    { id: 'home',    name: 'At home',       blurb: 'Off shift. Eating, if there is anything.' },
  to_work: { id: 'to_work', name: 'Walking to work', blurb: 'On the way to their station.' },
  working: { id: 'working', name: 'Working',       blurb: 'Putting units into whatever is on the board.' },
  to_home: { id: 'to_home', name: 'Walking home',  blurb: 'Shift over.' },
};

/** The ladder an unfed citizen goes down. Each rung is louder than the last. */
export const HUNGER_RUNGS = ['content', 'hungry', 'grumbling', 'downsTools', 'leaving'];

export const HUNGER_WORDS = {
  content:    { name: 'Fed',          blurb: 'Working properly.' },
  hungry:     { name: 'Hungry',       blurb: 'Working slower than they should.' },
  grumbling:  { name: 'Grumbling',    blurb: 'Still working. Not paying you a penny.' },
  downsTools: { name: 'Downed tools', blurb: 'Will not work until they are fed.' },
  leaving:    { name: 'Leaving',      blurb: 'Packing. You have about a day.' },
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const clamp01 = n => clamp(n, 0, 1);
const round2 = n => Math.round(n * 100) / 100;

/** The same small, fast, stable hash the perk lattice and the territory records use. */
function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  }
  return h >>> 0;
}
function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const pick = (rng, list) => list[Math.floor(rng() * list.length)];

/** A plain invented name. A game with Name Forge loaded should pass its own `makeName` instead. */
export function makeColonistName(rng, names) {
  const n = names || FALLBACK.names;
  const given = pick(rng, n.first) + pick(rng, n.last);
  return `${given} ${pick(rng, n.family)}`;
}

/** Where on the hunger ladder is this person? */
export function hungerRung(citizen, foodCfg) {
  const r = foodCfg?.rungs || FALLBACK.food.rungs;
  const h = citizen.hunger || 0;
  if (h >= r.leaves) return 'leaving';
  if (h >= r.downsTools) return 'downsTools';
  if (h >= r.grumbling) return 'grumbling';
  if (h >= r.hungry) return 'hungry';
  return 'content';
}

export function createColony({
  data = null, board = null, food = null, seed = 1, name = 'the colony', hour = 6, day = 1,
  makeName = null,
  /**
   * THE CIVILIZATION EXPANSION, AND BOTH OF THESE ARE OPTIONAL.
   *
   * `housing` is a js/housing.js register — houses, utilities, comfort and which bed a citizen
   * sleeps in. `stationAt(id)` is a callback the game layer supplies that turns a station id into
   * `{ x, z }`, because this file must never learn what a machine is.
   *
   * Without either of them the module behaves EXACTLY as it did before: `setBase({ beds: n })`
   * still hands out anonymous beds in list order and everybody's walk to work is still the flat
   * quarter of an hour. Forty-two tests point at that behaviour and not one of them changes.
   */
  housing = null, stationAt = null,
} = {}) {
  const D = data || FALLBACK;
  const sched = D.schedule || FALLBACK.schedule;
  const foodCfg = D.food || FALLBACK.food;
  const houseCfg = D.housing || FALLBACK.housing;
  const comfortCfg = D.comfort || { moodFloor: 0.4, moodSpan: 1.2 };
  const taxCfg = D.tax || FALLBACK.tax;
  const migCfg = D.migration || FALLBACK.migration;
  const recCfg = D.recruit || FALLBACK.recruit;
  const jobs = D.jobs || FALLBACK.jobs;
  /**
   * A VENDOR IS NOT IN `jobs`, AND THAT IS DELIBERATE.
   *
   * §5.2 wanted the vendor listed with the rest. It must not be: `rollMigration` picks a migrant's
   * trade with `pick(rng, jobs)`, so a vendor in that array would let a Forge-Warden walk in off
   * the road — the exact thing §5's whole move-in ritual exists to prevent — and every existing
   * test that walks `jobs` asserts a positive `unitsPerHour` and a non-empty tag list, which a
   * vendor has neither of. It lives in its own key and is reachable only through `jobBy('vendor')`.
   */
  const vendorJob = D.vendorJob || { key: 'vendor', name: 'Trader', tags: [], unitsPerHour: 0, tendMax: 0, rentPerDay: 14, blurb: 'Keeps a stall. Pays you rent, works for nobody.' };
  const jobBy = key => (key === 'vendor' ? vendorJob : jobs.find(j => j.key === key)) || jobs[0];
  const guardCfg = D.guard || {};

  const rng = rngFrom(hash('colony', seed));
  const nameOf = makeName || (() => makeColonistName(rng, D.names));

  let seq = 1;

  const colony = {
    name,
    data: D,
    jobs,
    board,
    food,                       // anything with takeFood(meals) and foodUnits(); js/farm.js is one
    rng,
    hour: hour % 24,
    day,
    elapsed: 0,
    citizens: [],
    departed: [],
    pending: [],                // migration offers waiting on a yes or a no
    gold: 0,
    log: [],
    base: { structures: 0, defences: 0, beds: 0, waypoint: false, wealth: 0 },
    townPools: {},              // settlementId -> { taken, refilledDay }
    _sinceMigrationRoll: 0,

    /** What the base looks like, from whatever built it. Passed in, never worked out here. */
    setBase(patch = {}) { Object.assign(colony.base, patch); return colony.base; },

    /** Sync the colony clock to the game's sky, so citizens sleep when it is actually night. */
    setClock(hourOfDay, dayNumber = null) {
      colony.hour = ((hourOfDay % 24) + 24) % 24;
      if (dayNumber != null) colony.day = dayNumber;
      return colony;
    },

    // ---------------------------------------------------------------- people

    /** A person, not yet part of the colony. `welcome()` is what makes them a citizen. */
    newCitizen({ id = null, name: who = null, job = 'labourer', skill = null, from = null } = {}) {
      const j = jobBy(job);
      return {
        id: id || `c${seq++}`,
        name: who || nameOf(),
        job: j.key,
        jobName: j.name,
        stationId: null,
        stations: [],               // §3.5 — a smelter may mind up to `tendMax` machines
        posted: null,               // §8.1 — the watch post they stand in, if any
        postName: null,
        state: 'asleep',
        travelLeft: 0,
        travelHours: sched.travelHoursDefault,
        home: null,                   // bed id, or null for sleeping rough
        skill: skill == null ? round2(0.85 + rng() * 0.4) : skill,
        hunger: 0,
        mood: 0.7,
        unitsToday: 0,
        unitsTotal: 0,
        idleHours: 0,                 // hours stood at a station with nothing on the board
        mealsToday: 0,
        daysHere: 0,
        from,
        rung: 'content',
      };
    },

    /** Take somebody on. The only way a citizen joins. */
    welcome(citizen) {
      if (!citizen) return null;
      colony.citizens.push(citizen);
      colony._assignBeds();
      colony._say(`${citizen.name} has come to stay, and will work as a ${citizen.jobName.toLowerCase()}.`);
      return citizen;
    },

    /** Put somebody on a job, and optionally tie them to one station. */
    assign(citizenId, { job = null, stationId = undefined } = {}) {
      const c = colony.byId(citizenId);
      if (!c) return { ok: false, why: 'Nobody by that name lives here.' };
      if (job) { const j = jobBy(job); c.job = j.key; c.jobName = j.name; c.stations = []; c.stationId = null; }
      if (stationId !== undefined) {
        if (stationId == null) { c.stationId = null; c.stations = []; }
        else {
          // §3.5 — the cap lives in the data and the refusal names her
          const out = colony.bind(c.id, stationId);
          if (!out.ok) return out;
        }
      }
      return { ok: true, citizen: c };
    },

    byId(id) { return colony.citizens.find(c => c.id === id) || null; },
    jobOf(c) { return jobBy(c.job); },

    /** Beds in, beds out. Housing is set by whatever built the houses. */
    setBeds(n) { colony.base.beds = Math.max(0, Math.floor(n)); colony._assignBeds(); return colony.base.beds; },

    /** The housing register, or null. Swappable at runtime, because landing rebuilds everything. */
    housing,
    setHousing(h) { housing = h; colony.housing = h; colony._assignBeds(); return h; },
    stationAt,
    setStationAt(fn) { stationAt = fn; colony.stationAt = fn; return fn; },

    _assignBeds() {
      /**
       * WITH A HOUSING REGISTER THIS IS TWO LINES; WITHOUT ONE IT IS WHAT IT ALWAYS WAS.
       *
       * The old behaviour is kept whole rather than shimmed, because `setBase({ beds: 3 })` is how
       * every existing test and the live game have put people under a roof since the colony landed,
       * and a "shim" that behaved almost the same would be a bug waiting for a quiet afternoon.
       */
      if (housing) { housing.assign(colony.citizens, { stationAt }); return; }
      const beds = colony.base.beds || 0;
      colony.citizens.forEach((c, i) => { c.home = i < beds ? `bed_${i + 1}` : null; });
    },

    spareBeds() {
      if (housing) return housing.report().spare;
      return Math.max(0, (colony.base.beds || 0) - colony.citizens.length);
    },
    housed() { return colony.citizens.filter(c => c.home).length; },

    /** How comfortable is this person's bed? 0 for a bedroll in the mud, 0 for nowhere at all. */
    comfortOf(c) { return (c && c.home && typeof c.home === 'object' ? c.home.comfort : 0) || 0; },

    /**
     * HOW LONG THE WALK TO WORK ACTUALLY TAKES.
     *
     * At `walkSpeedMetresPerHour` (3000) a station 90 m from the bed costs 0.03 h each way and one
     * 1.2 km away costs 0.4 h each way — 0.8 h out of an 11 h shift, 7% of their output, gone into
     * walking. At the `maxTravelHours` cap (2 h, so 6 km) they spend a third of the day on the road
     * and the roster says so in words. **This is the housing lesson and it is the only one: build
     * the bunkhouse next to the furnaces.**
     *
     * Both numbers have been sitting in data/colony.json unread since the colony landed.
     */
    travelHoursOf(c) {
      const fallback = sched.travelHoursDefault ?? 0.25;
      const cap = sched.maxTravelHours ?? 2;
      if (!c || !c.home || typeof c.home !== 'object' || c.stationId == null) return Math.min(fallback, cap);
      const st = stationAt ? stationAt(c.stationId) : null;
      if (!st || !Number.isFinite(st.x)) return Math.min(fallback, cap);
      const metres = Math.hypot(st.x - c.home.x, st.z - c.home.z);
      return clamp(metres / (sched.walkSpeedMetresPerHour || 3000), 0.02, cap);
    },

    /** The walk, in the only unit a player reads it in. */
    walkMinutesOf(c) { return Math.round(colony.travelHoursOf(c) * 60); },

    // ---------------------------------------------------------------- bound to a machine

    /** Every station somebody is minding, so the caller can ask "who has this furnace?". */
    stationsOf(citizenId) {
      const c = colony.byId(citizenId);
      if (!c) return [];
      return c.stationId == null ? [] : (Array.isArray(c.stations) ? c.stations : [c.stationId]);
    },

    /**
     * Tie somebody to a machine. §3.5 — how many one person may mind is a number in the data.
     *
     * `tendMax` does NOT multiply their output. A smelter bound to three furnaces still produces
     * about 10.6 units a day; the board hands them out oldest-first, so three furnaces each run
     * about a quarter of a shift. The panel states it in the only honest way there is: *"She keeps
     * about 0.77 of a furnace lit; you have asked her to keep three."* The cap exists because a
     * citizen bound to nine machines is a spreadsheet, not a person.
     */
    bind(citizenId, stationId) {
      const c = colony.byId(citizenId);
      if (!c) return { ok: false, why: 'Nobody by that name lives here.' };
      const job = jobBy(c.job);
      const max = job.tendMax ?? 1;
      if (max <= 0) return { ok: false, why: `${c.name} is a ${job.name.toLowerCase()}. That is not their work.` };
      const have = Array.isArray(c.stations) ? c.stations.slice() : (c.stationId == null ? [] : [c.stationId]);
      if (have.includes(stationId)) return { ok: true, citizen: c, stations: have };
      if (have.length >= max) {
        return { ok: false, why: `${c.name} already minds ${have.length === 1 ? 'one' : have.length}. Somebody else will have to take it.` };
      }
      have.push(stationId);
      c.stations = have;
      c.stationId = have[0];
      /**
       * A BED IS CHOSEN FOR THE WALK, SO CHANGING THE WALK HAS TO FREE THE BED.
       *
       * Without this the rule never fires once: in the live game a citizen is WELCOMED (and takes
       * the most comfortable free bed, because they have nowhere to be in the morning) and only
       * then bound to a machine, and `housing.assign` deliberately leaves anybody who already has a
       * bed exactly where they are. So the whole "build the bunkhouse next to the furnaces" lesson
       * would have been dead data — taught by a test and never by the game.
       */
      housing?.release?.(c.id);
      colony._assignBeds();
      return { ok: true, citizen: c, stations: have };
    },

    unbind(citizenId, stationId = null) {
      const c = colony.byId(citizenId);
      if (!c) return { ok: false, why: 'Nobody by that name lives here.' };
      const have = Array.isArray(c.stations) ? c.stations.slice() : (c.stationId == null ? [] : [c.stationId]);
      const left = stationId == null ? [] : have.filter(s => s !== stationId);
      c.stations = left;
      c.stationId = left[0] ?? null;
      return { ok: true, citizen: c, stations: left };
    },

    /**
     * Guards actually standing a post, which is the number js/defence.js wants.
     *
     * Somebody who has downed tools or is packing is not on the wall, so they are not a point of
     * defence — and `notorietyOf` reading them as one would mean a starving village being offered
     * a harder raid than a fed one.
     *
     * R19 — HOW FAR A GUARD'S PRESENCE REACHES, WHICH IS WHAT `guard.wardRadius` HAS ALWAYS SAID.
     *
     * data/colony.json's guard block has carried `wardRadius: 90` since the Civilization Expansion
     * landed and not one line of code read it, which meant a guard was a point of defence for the
     * whole planet: post somebody at the watch tower beside the mine four hundred metres out and
     * the HOME base counted them, so data/raids.json's `minDefence` gate opened and
     * `notoriety.perCitizen` climbed for a wall that guard could not see, let alone stand on. Worse
     * in one direction than the other: the raid arrives at `baseSpot()` and the guard who made it
     * harder is not there.
     *
     * So `centre` is the spot being defended, and only guards whose POST is inside `wardRadius` of
     * it count. Called with nothing — which is every existing caller, the Holding screen and the
     * forty-odd tests included — it counts the whole watch exactly as it always did, because
     * "how many of my folk are standing a post" is a different question from "how many are standing
     * one HERE". A guard whose post the game layer never handed in through `setPosts` also counts:
     * an unknown position is not evidence of a distant one, and guessing would silently disarm a
     * base whose posts had not been registered yet.
     */
    stationed(centre = null) {
      const on = colony.citizens.filter(c => c.posted && c.rung !== 'downsTools' && c.rung !== 'leaving');
      if (!centre || centre.x == null || centre.z == null) return on.length;
      const ward = guardCfg.wardRadius ?? Infinity;
      return on.filter(c => {
        const post = colony.posts.find(p => p.id === c.posted);
        if (!post || post.x == null || post.z == null) return true;
        return Math.hypot(post.x - centre.x, post.z - centre.z) <= ward;
      }).length;
    },

    /** How far a posted guard's presence reaches, in metres. §8.1, and the panel prints it. */
    wardRadius() { return guardCfg.wardRadius ?? Infinity; },
    tending() { return colony.citizens.filter(c => c.stationId != null).length; },

    // ---------------------------------------------------------------- standing a post

    /** The posts that are standing, handed in by the game layer: [{ id, slots, name, x, z }]. */
    posts: [],
    setPosts(list = []) { colony.posts = list.filter(Boolean); return colony.posts.length; },

    /**
     * Put a guard in a post. §8.1 — a post is a place to stand, not a turret.
     *
     * Every refusal is a sentence, because "greyed out" is the one answer a player cannot act on.
     */
    station(citizenId, postId) {
      const c = colony.byId(citizenId);
      if (!c) return { ok: false, why: 'Nobody by that name lives here.' };
      const post = colony.posts.find(p => p.id === postId);
      if (!post) return { ok: false, why: 'There is no post there.' };
      if (c.job !== 'guard') return { ok: false, why: `${c.name} is a ${jobBy(c.job).name.toLowerCase()}. Put them on guard duty first.` };
      const rung = hungerRung(c, foodCfg);
      if (rung === 'downsTools' || rung === 'leaving') return { ok: false, why: `${c.name} has downed tools. Feed them and ask again.` };
      if (c.stationId != null) return { ok: false, why: `${c.name} minds the ${c.stationName || 'machine'}. Somebody has to.` };
      const in_ = colony.citizens.filter(o => o.posted === postId && o.id !== c.id).length;
      if (in_ >= (post.slots || 1)) return { ok: false, why: `Every slot in that ${post.name ? post.name.toLowerCase() : 'post'} is taken.` };
      c.posted = postId;
      c.postName = post.name || 'the watch';
      return { ok: true, citizen: c, post };
    },

    unstation(citizenId) {
      const c = colony.byId(citizenId);
      if (!c) return { ok: false, why: 'Nobody by that name lives here.' };
      c.posted = null; c.postName = null;
      return { ok: true, citizen: c };
    },

    /** What the guards cost you a day. Paid in `collectTax`, out of the same purse. */
    wages() {
      const per = guardCfg.wagePerDay ?? jobBy('guard').wagePerDay ?? 8;
      return colony.citizens.filter(c => c.job === 'guard' && c.posted).length * per;
    },

    /** What the traders pay you a day. §5.6 — vendors are the better gold, and they cost you beds. */
    rent() {
      const per = vendorJob.rentPerDay || 14;
      return colony.citizens.filter(c => c.job === 'vendor' && c.home).length * per;
    },

    /**
     * Citizens standing a watch. A guard is worth a point of defence the same as a turret is, which
     * is what makes "spend gold on people" a real alternative to "spend materials on walls"
     * (BUILDING_EXPANSION.md §4e). The caller adds this to whatever the build system counted —
     * js/colony.js does not know what has been built and must not guess.
     */
    guards() { return colony.citizens.filter(c => c.job === 'guard' && c.rung !== 'downsTools' && c.rung !== 'leaving').length; },

    // ---------------------------------------------------------------- the day

    /**
     * Move the colony on. Broken into small steps so a schedule boundary in the middle of a big
     * jump is not skipped over — a `tick(24)` has to contain a whole working day, not teleport
     * past it.
     */
    tick(hours = 0, { at = null } = {}) {
      const events = [];
      let left = Math.max(0, hours);
      const step = 0.25;
      let guard = 0;
      while (left > 1e-6 && guard++ < 4000) {
        const dt = Math.min(step, left);
        events.push(...colony._step(dt));
        left -= dt;
      }
      if (at != null) colony.hour = ((at % 24) + 24) % 24;
      return events;
    },

    _step(dt) {
      const events = [];
      const before = colony.hour;
      colony.hour += dt;
      colony.elapsed = round2(colony.elapsed + dt);
      let rolledOver = false;
      if (colony.hour >= 24) { colony.hour -= 24; colony.day++; rolledOver = true; }
      if (board) board.tick(dt);

      for (const c of colony.citizens) {
        colony._advance(c, dt, before, events);
      }

      // Anybody who has reached the bottom of the ladder walks out. It happens at the step it
      // happens, not at some tidy midnight, so the player sees it when it is caused.
      for (let i = colony.citizens.length - 1; i >= 0; i--) {
        const c = colony.citizens[i];
        if (hungerRung(c, foodCfg) !== 'leaving') continue;
        colony.citizens.splice(i, 1);
        c.leftOn = colony.day;
        c.leftBecause = 'hunger';
        colony.departed.push(c);
        colony._assignBeds();
        const ev = { kind: 'departed', citizen: c.id, name: c.name, why: 'nothing to eat' };
        events.push(ev);
        colony._say(`${c.name} has walked out. There was nothing to eat and they said so for a week first.`);
      }

      if (rolledOver) {
        for (const c of colony.citizens) { c.daysHere++; c.unitsToday = 0; c.mealsToday = 0; }
        const tax = colony.collectTax();
        events.push({ kind: 'tax', ...tax });
      }

      colony._sinceMigrationRoll += dt;
      if (colony._sinceMigrationRoll >= (migCfg.rollEveryHours || 24)) {
        colony._sinceMigrationRoll = 0;
        const offer = colony.rollMigration();
        if (offer) events.push({ kind: 'migrant', offer });
      }
      colony._expireOffers(dt);
      return events;
    },

    /** One citizen, one small step: where they should be, and what that costs or earns them. */
    _advance(c, dt, hourBefore, events) {
      const h = colony.hour;
      const asleepNow = h >= sched.bed || h < sched.wake;
      const workNow = !asleepNow && h >= sched.leaveForWork && h < sched.leaveWork;
      const rung = hungerRung(c, foodCfg);
      c.rung = rung;

      // Hunger always climbs. Only a meal brings it down.
      c.hunger = clamp01(c.hunger + (foodCfg.hungerPerDay || 0.5) * (dt / 24));

      if (asleepNow) {
        if (c.state !== 'asleep') { c.state = 'asleep'; c.travelLeft = 0; }
        /**
         * COMFORT SCALES THE NIGHT, AND NOTHING ELSE.
         *
         *   moodGainPerNight = base × (moodFloor + moodSpan × comfort)      // 0.048 … 0.19
         *
         * A bedroll in the mud is comfort 0 and gives back four-tenths of what a bed used to; a
         * cottage with a well, a hearth and a privy in range is 0.80 and gives back a third more.
         * Without a housing register `comfortOf` is 0 for everybody, so the floor applies evenly
         * and the module behaves as it did — see `_assignBeds`.
         */
        if (c.home) {
          const cf = housing ? colony.comfortOf(c) : 1;
          const scale = housing ? ((comfortCfg.moodFloor ?? 0.4) + (comfortCfg.moodSpan ?? 1.2) * cf) : 1;
          c.mood = clamp01(c.mood + (houseCfg.moodGainPerNightHoused || 0) * scale * (dt / 8));
        } else c.mood = clamp01(c.mood - (houseCfg.moodLossPerDayUnhoused || 0) * (dt / 24));
      } else if (workNow && colony._willWork(c, rung)) {
        if (c.state === 'asleep' || c.state === 'home' || c.state === 'to_home') {
          // They set off THIS step and arrive on a later one. Walking to work has to be a state the
          // roster can actually show, or the player never sees why the furnace is cold at seven.
          c.state = 'to_work';
          c.travelLeft = colony.travelHoursOf(c);
          c.travelHours = c.travelLeft;
        } else if (c.state === 'to_work') {
          c.travelLeft = Math.max(0, c.travelLeft - dt);
          if (c.travelLeft <= 1e-6) c.state = 'working';
        } else if (c.state === 'working') {
          colony._doWork(c, dt, events);
        }
      } else {
        // Off shift, or refusing to work. Either way they are at home, which is where the player
        // will find them standing about looking at the empty pot.
        if (c.state === 'working' || c.state === 'to_work') {
          c.state = 'to_home';
          c.travelLeft = colony.travelHoursOf(c);
          c.travelHours = c.travelLeft;
        } else if (c.state === 'to_home') {
          c.travelLeft = Math.max(0, c.travelLeft - dt);
          if (c.travelLeft <= 1e-6) c.state = 'home';
        } else if (c.state !== 'home') c.state = 'home';
      }

      // Meals. A meal hour that fell inside this step, once each.
      for (const mh of sched.mealHours || []) {
        if (!crossedHour(hourBefore, colony.hour, mh)) continue;
        colony._eat(c, events);
      }

      // Mood follows the stomach.
      if (rung === 'content') c.mood = clamp01(c.mood + (foodCfg.moodGainPerDayFed || 0) * (dt / 24));
      else c.mood = clamp01(c.mood - (foodCfg.moodLossPerDayHungry || 0) * (dt / 24));
      if (!c.home) c.mood = clamp01(c.mood - (houseCfg.moodLossPerDayUnhoused || 0) * (dt / 24) * 0.5);
    },

    /** A citizen who has downed tools does not go to work. That is the point of the rung. */
    _willWork(c, rung) { return rung !== 'downsTools' && rung !== 'leaving'; },

    /**
     * An hour of a citizen's shift, turned into work units on the board.
     *
     * THIS IS THE WHOLE INTERCHANGEABILITY CLAIM, in six lines: a citizen calls `board.work`, which
     * calls the same `addWork` the player's swing and the machine's hour call. There is no citizen
     * multiplier on the order, no citizen-only order, and the leftover (`spare`) walks with them to
     * the next order so an hour is never quietly binned.
     */
    _doWork(c, dt, events) {
      const job = jobBy(c.job);
      /**
       * A TRADER WORKS FOR NOBODY, AND THIS LINE IS WHY IT IS NOT A BUG.
       *
       * §5.2. A vendor's `tags` is an empty array, and an empty tag list is the "will do anything"
       * signal EVERYWHERE ELSE in this file and in js/work.js `tagsMatch`. Without this guard a
       * Forge-Warden who moved in to sell you a sword would quietly start smelting, which would be
       * a very confusing bug to be handed: the furnaces speed up and nobody can say who is at them.
       */
      if (!(job.unitsPerHour > 0)) { c.idleHours = round2(c.idleHours + dt); return; }
      // a guard standing a post is at the post, not on the board — their shift shows in the
      // ledger through the `watch` order the game layer posts, not by pulling ordinary work
      if (c.job === 'guard' && c.posted) { c.idleHours = round2(c.idleHours + dt); return; }
      const rung = hungerRung(c, foodCfg);
      const hungerFactor = rung === 'content' ? 1 : (foodCfg.outputAtHungry ?? 0.65);
      const moodFactor = 0.6 + 0.4 * clamp01(c.mood);
      let budget = (job.unitsPerHour || 1) * (c.skill || 1) * hungerFactor * moodFactor * dt;
      const asked = budget;
      if (!board) { c.idleHours = round2(c.idleHours + dt); return; }

      const mine = Array.isArray(c.stations) && c.stations.length ? c.stations : (c.stationId == null ? [] : [c.stationId]);
      let guard = 0;
      while (budget > 1e-6 && guard++ < 32) {
        // their OWN stations first, oldest order across them, then anything else their job covers
        let order = null;
        for (const st of mine) {
          const o = board.nextFor({ tags: job.tags, stationId: st });
          if (o && (!order || o.postedAt < order.postedAt)) order = o;
        }
        order = order || board.nextFor({ tags: job.tags });
        if (!order) break;
        const res = board.work(order, { source: 'citizen', by: c.id, byName: c.name, units: budget });
        if (res.applied <= 0) break;
        budget = res.spare;
        if (res.complete) events.push({ kind: 'order', order: order.id, name: order.name, by: c.name, out: order.out });
      }
      const spent = asked - budget;
      c.unitsToday = round2(c.unitsToday + spent);
      c.unitsTotal = round2(c.unitsTotal + spent);
      if (spent <= 1e-6) c.idleHours = round2(c.idleHours + dt);
    },

    /** One meal, if there is one to be had. */
    _eat(c, events) {
      if (!food || typeof food.takeFood !== 'function') return;
      const got = food.takeFood(1);
      if (got > 0) {
        c.hunger = clamp01(c.hunger - (foodCfg.hungerFedPerMeal || 0.34) * got);
        c.mealsToday++;
      } else if (events) {
        // Only worth saying once a day, and only when it is news.
        if (hungerRung(c, foodCfg) !== 'content' && c.mealsToday === 0 && !c._saidHungry) {
          c._saidHungry = true;
          events.push({ kind: 'hungry', citizen: c.id, name: c.name });
        }
      }
      if (c.mealsToday > 0) c._saidHungry = false;
    },

    // ---------------------------------------------------------------- money

    /**
     * The day's tax.
     *
     * Fed AND housed, or nothing. A grumbling citizen keeps working and stops paying, which is the
     * clearest possible signal short of a message box — the gold line simply goes down.
     *
     * R19 — AND THOSE TWO WORDS WERE HARD-CODED, BESIDE THE TWO KNOBS THAT STATE THEM.
     *
     * data/colony.json's `tax` block has carried `unhousedPays: 0` and `grumblingPays: 0` since the
     * colony landed and nothing anywhere read either of them: the loop below simply `continue`d on
     * both cases. Same value, so the same behaviour — which is exactly why nobody noticed, and
     * exactly the fault this project keeps finding. They are SHARES of the full rate, not flags:
     * `grumblingPays: 0.5` means a hungry village still puts something in the purse, which is the
     * knob to reach for if "feed them or get nothing" ever reads as too sharp a cliff. Both stay at
     * 0 in the data, so this change moves no number in the shipped game.
     *
     * Unhoused is tested first and wins, as it did before: somebody sleeping rough AND grumbling is
     * skipped for the bed, because the bed is the thing the player can do something about tonight.
     */
    collectTax() {
      const prosperity = colony.prosperity();
      let gold = 0;
      const paid = [];
      const skipped = [];
      for (const c of colony.citizens) {
        const rung = hungerRung(c, foodCfg);
        const grumbling = rung !== 'content' && rung !== 'hungry';
        const share = !c.home ? (taxCfg.unhousedPays ?? 0)
          : grumbling ? (taxCfg.grumblingPays ?? 0)
          : 1;
        if (share <= 0) {
          skipped.push({ id: c.id, name: c.name, why: !c.home ? 'no bed' : 'grumbling' });
          continue;
        }
        const mood = clamp(c.mood, taxCfg.moodFloor ?? 0.25, 1);
        const due = (taxCfg.perCitizenPerDay || 0) * mood * prosperity * share;
        gold += due;
        paid.push({ id: c.id, name: c.name, gold: round2(due), share: round2(share) });
      }
      /**
       * WAGES OUT AND RENT IN, IN THE SAME PASS. §5.6 and §8.3.
       *
       * Six vendors in a thirty-structure outpost is about 113 gold a day against six citizens' tax
       * of roughly 36 — **vendors are the better gold, and they cost you beds that could have held
       * workers.** That is the trade the housing screen has to show, and it does.
       *
       * The day's total may come out negative and the line says so rather than hiding it: *"318 in
       * tax, 154 in rent, 96 out in wages."* An outpost that cannot pay its guards does not lose
       * them that evening — they drop to grumbling after three unpaid days and walk out on the
       * seventh, with a warning each time.
       */
      const rent = Math.round(colony.rent() * prosperity);
      const wages = Math.round(colony.wages());
      gold = Math.round(gold);
      const net = gold + rent - wages;
      colony.gold += net;
      if (wages > 0 && colony.gold < 0) {
        colony.unpaidDays = (colony.unpaidDays || 0) + 1;
        const sulk = guardCfg.unpaidDaysBeforeMood ?? 3;
        const quit = guardCfg.unpaidDaysBeforeLeaving ?? 7;
        for (const c of colony.citizens) {
          if (c.job !== 'guard' || !c.posted) continue;
          if (colony.unpaidDays >= sulk) c.mood = clamp01(c.mood - 0.15);
          if (colony.unpaidDays >= quit) { c.posted = null; c.postName = null; c.hunger = 1; }
        }
        colony._say(colony.unpaidDays >= quit
          ? 'The watch has not been paid in a week. They have walked off their posts.'
          : `The watch has not been paid for ${colony.unpaidDays} day${colony.unpaidDays === 1 ? '' : 's'}. They have noticed.`);
      } else if (wages > 0) colony.unpaidDays = 0;
      return {
        gold: net, tax: gold, rent, wages,
        paid, skipped, prosperity: round2(prosperity), day: colony.day,
        line: `${gold} in tax, ${rent} in rent, ${wages} out in wages. ${net} gold.`,
      };
    },

    /** How well the place is doing, which is mostly how much of it there is. */
    prosperity() {
      const per = taxCfg.prosperityPerStructure || 0;
      return clamp(1 + (colony.base.structures || 0) * per, 1, taxCfg.prosperityMax || 1.5);
    },

    // ---------------------------------------------------------------- growth

    /**
     * How attractive is this place to somebody looking for one? 0..1.
     *
     * Spare beds, food in the store, walls up, and folk who are not miserable. Every one of those
     * is something the player built on purpose, which is the point — migration should read as a
     * reward for a tidy colony, never as a random event.
     */
    appeal() {
      const w = migCfg.weights || FALLBACK.migration.weights;
      const beds = clamp01(colony.spareBeds() / (migCfg.spareBedsForFullMarks || 3));
      const days = food && typeof food.foodDays === 'function'
        ? clamp01(food.foodDays(Math.max(1, colony.citizens.length + 1), foodCfg.perCitizenPerDay) / (migCfg.foodDaysForFullMarks || 6))
        : 0;
      const safe = clamp01((colony.base.defences || 0) / (migCfg.safetyForFullMarks || 6));
      const mood = colony.citizens.length
        ? clamp01(colony.citizens.reduce((s, c) => s + c.mood, 0) / colony.citizens.length)
        : 0.6;   // an empty colony is neither happy nor unhappy; it is just quiet
      /**
       * TWO NEW TERMS, §2.7 and §5.8.
       *
       * `comfort` is the mean comfort of the FREE beds — nobody is drawn by a full manor — and
       * `trade` is how many traders have already set up, capped at four. Without a housing register
       * or any vendors both are zero, and because the other four weights were rescaled to leave
       * room for them an old colony reads slightly lower rather than differently: a tidy village
       * with a well, a hearth, two spare cottage beds and a quartermaster in residence reaches
       * about 0.72 and rolls a migrant at 0.42 a day; the same village with the beds in the mud
       * reaches about 0.46 and rolls at 0.30. A day and a half against two and a half per arrival —
       * noticeable, and never the difference between a colony and no colony.
       */
      const comfort = housing ? clamp01(housing.report().freeComfort) : 0;
      const trade = clamp01(colony.citizens.filter(c => c.job === 'vendor').length / 4);
      const score = beds * w.spareBeds + days * w.foodDays + safe * w.safety + mood * w.mood
        + comfort * (w.comfort || 0) + trade * (w.trade || 0);
      return {
        score: round2(clamp01(score)),
        beds: round2(beds), foodDays: round2(days), safety: round2(safe), mood: round2(mood),
        comfort: round2(comfort), trade: round2(trade),
      };
    },

    /** Once a day: does anybody turn up? Returns an OFFER, never a citizen. */
    rollMigration() {
      if (colony.pending.length >= (migCfg.maxPending || 2)) return null;
      if (colony.spareBeds() <= 0) return null;     // nowhere to put them; nobody comes
      /**
       * R16 — AND A HOUSE, NOT A BEDROLL.
       *
       *   "Once you have established a base and built at least one house, let's start a Population
       *    system like warcraft 3… migration events that happen once and awhile but only when you
       *    have available population to grow."
       *
       * A bedroll declares one bed, so a player who had thrown two on the ground was already
       * eligible for migrants — which is not "established a base with at least one house". A real
       * house is a structure that sleeps two or more; see HOUSE_MIN_BEDS in js/population.js, which
       * the Town Hall and the recruit refusal both read.
       */
      const houses = (housing?.houses || []).filter(h => (h.beds || 0) >= 2).length;
      if (housing && houses <= 0) return null;
      const a = colony.appeal();
      const chance = (migCfg.baseChance || 0) + ((migCfg.chanceAtFullAppeal || 0) - (migCfg.baseChance || 0)) * a.score;
      if (rng() > chance) return null;
      const job = pick(rng, jobs.filter(j => j.key !== 'guard')) || jobs[0];
      const person = colony.newCitizen({ job: job.key, from: 'the road' });
      const offer = {
        id: `mig_${colony.day}_${Math.floor(rng() * 1e6).toString(36)}`,
        kind: 'migrant',
        citizen: person,
        appeal: a,
        expiresIn: migCfg.offerExpiresHours || 12,
        text: `${person.name} has walked in off the road asking for work as a ${job.name.toLowerCase()}. They say they heard there were beds.`,
      };
      colony.pending.push(offer);
      return offer;
    },

    /** Say yes. */
    accept(offerId) {
      const i = colony.pending.findIndex(o => o.id === offerId);
      if (i < 0) return { ok: false, why: 'That offer has gone.' };
      const [offer] = colony.pending.splice(i, 1);
      if (colony.spareBeds() <= 0) return { ok: false, why: 'There is no bed for them.' };
      return { ok: true, citizen: colony.welcome(offer.citizen) };
    },

    /** Say no. Free, and they do not sulk about it. */
    turnAway(offerId) {
      const i = colony.pending.findIndex(o => o.id === offerId);
      if (i < 0) return { ok: false, why: 'That offer has gone.' };
      const [offer] = colony.pending.splice(i, 1);
      return { ok: true, offer };
    },

    _expireOffers(dt) {
      for (let i = colony.pending.length - 1; i >= 0; i--) {
        colony.pending[i].expiresIn -= dt;
        if (colony.pending[i].expiresIn <= 0) colony.pending.splice(i, 1);
      }
    },

    // ---------------------------------------------------------------- recruiting out of towns

    /** How many people a settlement still has spare, given what you have already taken. */
    townPool(settlementId, size = 2) {
      const cap = Math.max(1, Math.floor((size || 1) * (recCfg.poolPerSettlementSize || 1.5)));
      const rec = colony.townPools[settlementId] || { taken: 0, refilledDay: colony.day };
      const daysSince = colony.day - rec.refilledDay;
      const back = Math.floor(daysSince / (recCfg.poolRefillDays || 8));
      if (back > 0) { rec.taken = Math.max(0, rec.taken - back); rec.refilledDay = colony.day; }
      colony.townPools[settlementId] = rec;
      return Math.max(0, cap - rec.taken);
    },

    /**
     * Somebody in a town who would come with you, for a price.
     *
     * The price climbs with the size of your colony because you are asking them to leave a working
     * town for a hole in the ground, and good standing with whoever holds the zone knocks it down.
     */
    recruitOffer({ settlementId = 'town', settlementName = 'the village', size = 2, standing = 0, job = null } = {}) {
      if (colony.townPool(settlementId, size) <= 0) {
        return { ok: false, why: `Nobody in ${settlementName} is looking to leave just now.` };
      }
      const j = job ? jobBy(job) : pick(rng, jobs);
      const skill = round2(clamp((recCfg.minSkill || 0.75) + rng() * ((recCfg.maxSkill || 1.6) - (recCfg.minSkill || 0.75)), recCfg.minSkill || 0.75, recCfg.maxSkill || 1.6));
      const raw = (recCfg.basePrice || 120)
        + colony.citizens.length * (recCfg.pricePerExistingCitizen || 18)
        + (skill - 1) * (recCfg.priceBySkill || 90);
      const discount = clamp01(standing) * (recCfg.standingDiscountAtMax || 0.35);
      const price = Math.max(20, Math.round(raw * (1 - discount)));
      const person = colony.newCitizen({ job: j.key, skill, from: settlementName });
      return {
        ok: true,
        id: `rec_${settlementId}_${Math.floor(rng() * 1e6).toString(36)}`,
        kind: 'recruit',
        settlementId, settlementName,
        citizen: person,
        price,
        skillWord: skill >= 1.3 ? 'knows the work well' : skill >= 1.05 ? 'knows the work' : 'will learn',
        text: `${person.name} of ${settlementName} would come and work as a ${j.name.toLowerCase()}, for ${price} gold.`,
      };
    },

    /** Take the offer. Gold in, citizen out — the caller owns the purse, so it hands it in. */
    recruit(offer, { gold = 0 } = {}) {
      if (!offer?.ok) return { ok: false, why: 'There is no offer.' };
      if (gold < offer.price) return { ok: false, why: `That costs ${offer.price} gold and you have ${Math.floor(gold)}.` };
      if (colony.spareBeds() <= 0) return { ok: false, why: 'Build them a bed first. Nobody signs on to sleep in the mud.' };
      const rec = colony.townPools[offer.settlementId] || { taken: 0, refilledDay: colony.day };
      rec.taken++;
      colony.townPools[offer.settlementId] = rec;
      colony.welcome(offer.citizen);
      return { ok: true, citizen: offer.citizen, spent: offer.price };
    },

    // ---------------------------------------------------------------- panels and saving

    _say(line) { colony.log.push({ day: colony.day, hour: round2(colony.hour), line }); if (colony.log.length > 200) colony.log.shift(); },

    /** Everything the base overview panel needs in one object. */
    report() {
      const rungs = {};
      for (const c of colony.citizens) rungs[c.rung] = (rungs[c.rung] || 0) + 1;
      const openUnits = board ? board.open().reduce((s, o) => s + workLeft(o), 0) : 0;
      return {
        name: colony.name,
        day: colony.day,
        hour: round2(colony.hour),
        citizens: colony.citizens.length,
        housed: colony.housed(),
        spareBeds: colony.spareBeds(),
        rungs,
        working: colony.citizens.filter(c => c.state === 'working').length,
        guards: colony.guards(),
        posted: colony.stationed(),
        tending: colony.tending(),
        traders: colony.citizens.filter(c => c.job === 'vendor').length,
        wages: colony.wages(),
        rent: colony.rent(),
        comfort: housing ? housing.report().meanComfort : 0,
        idle: colony.citizens.filter(c => c.state === 'working' && c.idleHours > 0).length,
        gold: colony.gold,
        prosperity: round2(colony.prosperity()),
        appeal: colony.appeal(),
        foodUnits: food?.foodUnits ? food.foodUnits() : 0,
        unitsWaiting: round2(openUnits),
        pending: colony.pending.length,
        departed: colony.departed.length,
      };
    },

    /** One sentence per citizen for the roster: "Marwen Thorn — farmer, working, fed". */
    roster() {
      return colony.citizens.map(c => {
        const walk = colony.walkMinutesOf(c);
        const mine = Array.isArray(c.stations) ? c.stations : (c.stationId == null ? [] : [c.stationId]);
        const bits = [
          `${c.jobName.toLowerCase()}`,
          (CITIZEN_STATES[c.state]?.name || c.state).toLowerCase(),
          (HUNGER_WORDS[c.rung]?.name || c.rung).toLowerCase(),
        ];
        if (!c.home) bits.push('no bed');
        if (c.posted) bits.push(`on ${c.postName || 'the watch'}`);
        if (mine.length > 1) bits.push(`${mine.length} stations`);
        if (walk >= 5 && mine.length) bits.push(`${walk} minutes each way`);
        return {
          id: c.id, name: c.name, job: c.jobName, station: c.stationId,
          stations: mine,
          state: CITIZEN_STATES[c.state]?.name || c.state,
          rung: HUNGER_WORDS[c.rung]?.name || c.rung,
          housed: !!c.home,
          house: c.home && typeof c.home === 'object' ? c.home.house : null,
          comfort: colony.comfortOf(c),
          walkMinutes: walk,
          posted: c.posted || null,
          tending: mine.length,
          mood: round2(c.mood),
          unitsToday: c.unitsToday,
          line: `${c.name} — ${bits.join(', ')}`,
        };
      });
    },

    toJSON() {
      return {
        name: colony.name, hour: colony.hour, day: colony.day, gold: colony.gold,
        citizens: colony.citizens, departed: colony.departed.map(c => ({ id: c.id, name: c.name, leftOn: c.leftOn, leftBecause: c.leftBecause })),
        base: colony.base, townPools: colony.townPools, seq,
        unpaidDays: colony.unpaidDays || 0,
        housing: housing?.toJSON?.() || null,
      };
    },

    load(saved) {
      if (!saved) return colony;
      colony.name = saved.name ?? colony.name;
      colony.hour = saved.hour ?? colony.hour;
      colony.day = saved.day ?? colony.day;
      colony.gold = saved.gold ?? 0;
      colony.citizens = saved.citizens || [];
      colony.departed = saved.departed || [];
      colony.base = { ...colony.base, ...(saved.base || {}) };
      colony.townPools = saved.townPools || {};
      colony.unpaidDays = saved.unpaidDays || 0;
      seq = saved.seq || colony.citizens.length + 1;
      /**
       * A CITIZEN'S `home` USED TO BE THE STRING `bed_3`. IT IS AN OBJECT NOW.
       *
       * Upgraded in place rather than migrated in a pass somewhere else, because a save written
       * before the Civilization Expansion is the common case for a long time and "my whole village
       * is sleeping rough since the update" is the bug that would come of getting it wrong. A
       * string simply means "was housed"; `_assignBeds` immediately gives them a real bed if there
       * is one, and the anonymous path keeps working when there is no housing register at all.
       */
      for (const c of colony.citizens) {
        if (typeof c.home === 'string') c.home = { bedId: c.home, entryId: null, house: null, x: 0, z: 0, comfort: 0 };
        if (c.stationId != null && !Array.isArray(c.stations)) c.stations = [c.stationId];
      }
      if (housing && saved.housing) housing.load(saved.housing);
      colony._assignBeds();
      return colony;
    },
  };

  return colony;
}

/** Did the clock pass `mark` o'clock between `from` and `to`? Handles the wrap past midnight. */
function crossedHour(from, to, mark) {
  if (to >= from) return from < mark && mark <= to;
  return mark > from || mark <= to;   // the step rolled over midnight
}
