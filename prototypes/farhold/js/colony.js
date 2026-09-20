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
  tax: { perCitizenPerDay: 6, moodFloor: 0.25, prosperityPerStructure: 0.01, prosperityMax: 1.5 },
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
} = {}) {
  const D = data || FALLBACK;
  const sched = D.schedule || FALLBACK.schedule;
  const foodCfg = D.food || FALLBACK.food;
  const houseCfg = D.housing || FALLBACK.housing;
  const taxCfg = D.tax || FALLBACK.tax;
  const migCfg = D.migration || FALLBACK.migration;
  const recCfg = D.recruit || FALLBACK.recruit;
  const jobs = D.jobs || FALLBACK.jobs;
  const jobBy = key => jobs.find(j => j.key === key) || jobs[0];

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
      if (job) { const j = jobBy(job); c.job = j.key; c.jobName = j.name; }
      if (stationId !== undefined) c.stationId = stationId;
      return { ok: true, citizen: c };
    },

    byId(id) { return colony.citizens.find(c => c.id === id) || null; },
    jobOf(c) { return jobBy(c.job); },

    /** Beds in, beds out. Housing is set by whatever built the houses. */
    setBeds(n) { colony.base.beds = Math.max(0, Math.floor(n)); colony._assignBeds(); return colony.base.beds; },

    _assignBeds() {
      const beds = colony.base.beds || 0;
      colony.citizens.forEach((c, i) => { c.home = i < beds ? `bed_${i + 1}` : null; });
    },

    spareBeds() { return Math.max(0, (colony.base.beds || 0) - colony.citizens.length); },
    housed() { return colony.citizens.filter(c => c.home).length; },

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
        if (c.home) c.mood = clamp01(c.mood + (houseCfg.moodGainPerNightHoused || 0) * (dt / 8));
        else c.mood = clamp01(c.mood - (houseCfg.moodLossPerDayUnhoused || 0) * (dt / 24));
      } else if (workNow && colony._willWork(c, rung)) {
        if (c.state === 'asleep' || c.state === 'home' || c.state === 'to_home') {
          // They set off THIS step and arrive on a later one. Walking to work has to be a state the
          // roster can actually show, or the player never sees why the furnace is cold at seven.
          c.state = 'to_work';
          c.travelLeft = Math.min(c.travelHours ?? sched.travelHoursDefault, sched.maxTravelHours ?? 2);
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
          c.travelLeft = Math.min(c.travelHours ?? sched.travelHoursDefault, sched.maxTravelHours ?? 2);
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
      const rung = hungerRung(c, foodCfg);
      const hungerFactor = rung === 'content' ? 1 : (foodCfg.outputAtHungry ?? 0.65);
      const moodFactor = 0.6 + 0.4 * clamp01(c.mood);
      let budget = (job.unitsPerHour || 1) * (c.skill || 1) * hungerFactor * moodFactor * dt;
      const asked = budget;
      if (!board) { c.idleHours = round2(c.idleHours + dt); return; }

      let guard = 0;
      while (budget > 1e-6 && guard++ < 32) {
        const order = board.nextFor({ tags: job.tags, stationId: c.stationId })
          || board.nextFor({ tags: job.tags });
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
     */
    collectTax() {
      const prosperity = colony.prosperity();
      let gold = 0;
      const paid = [];
      const skipped = [];
      for (const c of colony.citizens) {
        const rung = hungerRung(c, foodCfg);
        if (!c.home) { skipped.push({ id: c.id, name: c.name, why: 'no bed' }); continue; }
        if (rung !== 'content' && rung !== 'hungry') { skipped.push({ id: c.id, name: c.name, why: 'grumbling' }); continue; }
        const mood = clamp(c.mood, taxCfg.moodFloor ?? 0.25, 1);
        const due = (taxCfg.perCitizenPerDay || 0) * mood * prosperity;
        gold += due;
        paid.push({ id: c.id, name: c.name, gold: round2(due) });
      }
      gold = Math.round(gold);
      colony.gold += gold;
      return { gold, paid, skipped, prosperity: round2(prosperity), day: colony.day };
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
      const score = beds * w.spareBeds + days * w.foodDays + safe * w.safety + mood * w.mood;
      return { score: round2(clamp01(score)), beds: round2(beds), foodDays: round2(days), safety: round2(safe), mood: round2(mood) };
    },

    /** Once a day: does anybody turn up? Returns an OFFER, never a citizen. */
    rollMigration() {
      if (colony.pending.length >= (migCfg.maxPending || 2)) return null;
      if (colony.spareBeds() <= 0) return null;     // nowhere to put them; nobody comes
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
      return colony.citizens.map(c => ({
        id: c.id, name: c.name, job: c.jobName, station: c.stationId,
        state: CITIZEN_STATES[c.state]?.name || c.state,
        rung: HUNGER_WORDS[c.rung]?.name || c.rung,
        housed: !!c.home,
        mood: round2(c.mood),
        unitsToday: c.unitsToday,
        line: `${c.name} — ${c.jobName.toLowerCase()}, ${(CITIZEN_STATES[c.state]?.name || c.state).toLowerCase()}, ${(HUNGER_WORDS[c.rung]?.name || c.rung).toLowerCase()}${c.home ? '' : ', no bed'}`,
      }));
    },

    toJSON() {
      return {
        name: colony.name, hour: colony.hour, day: colony.day, gold: colony.gold,
        citizens: colony.citizens, departed: colony.departed.map(c => ({ id: c.id, name: c.name, leftOn: c.leftOn, leftBecause: c.leftBecause })),
        base: colony.base, townPools: colony.townPools, seq,
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
      seq = saved.seq || colony.citizens.length + 1;
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
