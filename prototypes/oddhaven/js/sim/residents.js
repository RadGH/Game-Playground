// Generate the town's people from the seed: households, homes, cars, jobs, schedules. Called once for a new world; after
// that they are state and come back from a save.

import { rand, randInt, pick, pickWeighted, shuffle } from './rng.js';
import { buildSchedule } from './people.js';
import { setBill } from './economy.js';
import { nudge } from './feelings.js';
import { newTrucks } from './work.js';
import { newEngines } from './fire.js';

function householdSizes(s, k, fixed = []) {
  const sizes = [], weights = Object.entries(k.sizeWeights).map(([n, w]) => ({ n: Number(n), w }));
  for (let i = 0; i < k.households; i++) sizes.push(pickWeighted(s, weights, x => x.w).n);
  // The premade households keep the size they were written with; the rest of the town makes up the numbers.
  fixed.forEach((h, i) => { sizes[i] = h.members.length; });
  let sum = sizes.reduce((a, b) => a + b, 0), guard = 100000;
  const max = Math.max(...weights.map(x => x.n));
  while (sum !== k.people && guard-- > 0) {
    const i = fixed.length + Math.floor(rand(s) * (sizes.length - fixed.length));
    if (sum < k.people && sizes[i] < max) { sizes[i]++; sum++; }
    else if (sum > k.people && sizes[i] > 1) { sizes[i]--; sum--; }
  }
  return sizes;
}

function makePerson(c, id, householdId, family, race) {
  const s = c.s, d = c.d.people, k = c.k.needs;
  const gender = rand(s) < 0.5 ? 'f' : 'm';
  const traits = shuffle(s, d.traits.map(x => x.id)).slice(0, d.traitsPerPerson);
  const n = c.needIds.map(() => k.startMin + rand(s) * (k.startMax - k.startMin));
  return {
    id, name: `${pick(s, d.given[gender])} ${family}`, gender, race,
    look: `${race}-${gender}-${randInt(s, 0, d.lookVariants - 1)}`,
    age: randInt(s, 19, 62),
    traits, quirks: [pick(s, d.quirks).id],
    household: householdId, home: -1, job: null, work: -1, shift: 0, dayOffset: randInt(s, 0, 6), retired: false, wear: 'casual',
    car: -1, sch: { wake: 450, bed: 1410 },
    n, mood: 0.7, nt: 0, moodlets: [],
    at: -1, act: null, trip: null, goal: null, wake: 0, since: 0, lv: 2, last: null, lastMorning: -1,
    orders: [], xp: {}, shifts: 0, f: {},
  };
}

/** A written character keeps their name, race, age and personality; the sim treats them like anybody else. */
function applyPremade(p, pre, row, m) {
  p.name = `${row.given} ${row.family || pre.family}`;
  p.gender = row.gender; p.race = row.race; p.age = row.age;
  if (row.traits) p.traits = [...row.traits];
  if (row.quirk) p.quirks = [row.quirk];
  p.look = `${row.race}-premade-${pre.id}-${m}`;
  p.premade = pre.id;
  if (row.job) p.wantJob = row.job;
  if (row.age >= 63) p.wantRetired = true;
}

function uniqueName(c, p, seen) {
  let guard = 0;
  while (seen.has(p.name) && guard++ < 50) {
    const family = p.name.slice(p.name.indexOf(' ') + 1);
    p.name = `${pick(c.s, c.d.people.given[p.gender])} ${family}`;
  }
  seen.add(p.name);
}

export function generateResidents(c) {
  const s = c.s, pop = c.k.population, d = c.d.people;
  const homes = shuffle(s, c.places.filter(p => p.role === 'home').map(p => p.id));
  if (homes.length < pop.households) throw new Error(`town: ${pop.households} households need ${pop.households} homes, the town has ${homes.length}`);
  const premades = c.d.premades?.households || [];
  const sizes = householdSizes(s, pop, premades), seen = new Set();
  let nextId = 0;
  // Family names run out before households do; a used name just means distant cousins.
  const families = shuffle(s, [...d.family]);
  sizes.forEach((size, i) => {
    const pre = premades[i] || null;
    const family = pre?.family || families[i % families.length], race = pickWeighted(s, d.races, r => r.weight).id;
    const h = { id: i, name: family, members: [], home: homes[i], money: randInt(s, c.k.economy.startMoneyMin, c.k.economy.startMoneyMax), start: 0, ledger: {}, bill: 0, cars: [], autonomy: c.k.autonomy.default, ties: size === 1 ? 'single' : size === 2 ? pick(s, ['couple', 'siblings', 'housemates']) : pick(s, ['family', 'housemates']) };
    h.start = h.money;
    if (pre) { h.premade = pre.id; h.ties = pre.ties; }
    s.households.push(h);
    for (let m = 0; m < size; m++) {
      const mixed = h.ties === 'housemates' ? pickWeighted(s, d.races, r => r.weight).id : race;
      const fam = h.ties === 'housemates' ? pick(s, d.family) : family;
      const p = makePerson(c, nextId++, i, fam, mixed);
      if (pre) applyPremade(p, pre, pre.members[m], m, i);
      uniqueName(c, p, seen);
      p.home = h.home; p.at = h.home; p.wake = randInt(s, 0, 7);
      s.people.push(p);
      h.members.push(p.id);
    }
    // Household ties start warm.
    for (const a of h.members) for (const b of h.members) {
      if (a === b) continue;
      nudge(c, s.people[a], b, 'known', 60); nudge(c, s.people[a], b, 'like', 30); nudge(c, s.people[a], b, 'trust', 25);
      if (h.ties === 'couple') nudge(c, s.people[a], b, 'love', 50);
    }
    const adults = Math.ceil(size * pop.carPerAdult);
    const cars = Math.min(pop.maxCarsPerHousehold, rand(s) < 0.9 ? adults : Math.max(0, adults - 1));
    for (let j = 0; j < cars; j++) {
      const car = { id: s.cars.length, household: i, driver: h.members[j], model: pick(s, d.cars), at: h.home };
      s.cars.push(car); h.cars.push(car.id); s.people[h.members[j]].car = car.id;
    }
  });
  assignJobs(c);
  newTrucks(c);
  newEngines(c);
  for (const p of s.people) buildSchedule(c, p);
  for (const h of s.households) setBill(c, h);
}

function assignJobs(c) {
  const s = c.s, pop = c.k.population;
  const openings = [];
  for (const place of c.places) for (const [job, n] of Object.entries(place.jobs || {})) for (let i = 0; i < n; i++) openings.push({ job, place: place.id });
  shuffle(s, openings);
  const fallback = c.d.jobs.jobs.find(j => j.fallback);
  // Everyone without a car first: they are the ones who need a job they can reach.
  const order = shuffle(s, s.people.map(p => p.id)).sort((a, b) => (s.people[a].car >= 0) - (s.people[b].car >= 0));
  // Written characters first: they were promised a job in their story. They get the nearest one going.
  for (const p of s.people) {
    if (p.wantRetired) { p.retired = true; delete p.wantRetired; continue; }
    if (!p.wantJob) continue;
    let at = -1, near = Infinity;
    openings.forEach((o, i) => { if (o.job !== p.wantJob) return; const d = c.roads.distance(c.places[p.home].node, c.places[o.place].node); if (d < near) { near = d; at = i; } });
    if (at >= 0) { const o = openings.splice(at, 1)[0]; p.job = o.job; p.work = o.place; p.shift = randInt(s, 0, c.jobById[p.job].shifts.length - 1); }
    delete p.wantJob;
  }
  // The timber crew is filled first, from the nearest people with a car: the chain needs its hands, and a cross-town commute is hours of game time.
  for (const o of openings.filter(x => c.jobById[x.job].chain)) {
    let id, near = Infinity;
    for (const i of order) { const q = s.people[i]; if (q.job || q.retired || q.car < 0) continue; const d = c.roads.distance(c.places[q.home].node, c.places[o.place].node); if (d < near) { near = d; id = i; } }
    if (id === undefined) break;
    const p = s.people[id];
    p.job = o.job; p.work = o.place; p.shift = randInt(s, 0, c.jobById[p.job].shifts.length - 1);
    openings.splice(openings.indexOf(o), 1);
  }
  for (const id of order) {
    const p = s.people[id], h = s.households[p.household];
    if (p.job || p.retired) continue;
    const hasEarner = h.members.some(m => s.people[m].job);
    if (hasEarner || h.members.length > 1) {
      if (rand(s) < pop.retiredShare && h.members.some(m => m !== id && !s.people[m].retired)) { p.retired = true; p.age = randInt(s, 63, 85); continue; }
    }
    // Most people work near home: a cross-town commute is hours of game time (roast §4). A car makes it possible.
    let best = -1;
    if (p.car >= 0 && openings.length && rand(s) < pop.crossTownShare) best = 0;
    else {
      let bestD = Infinity;
      for (let i = 0; i < openings.length; i++) {
        const dist = c.roads.distance(c.places[p.home].node, c.places[openings[i].place].node);
        if (dist < bestD) { bestD = dist; best = i; }
      }
      if (p.car < 0 && bestD > c.k.travel.walkMaxMeters * 3) best = -1; // no car and nothing close: work from home
    }
    if (best >= 0) {
      const o = openings.splice(best, 1)[0];
      p.job = o.job; p.work = o.place;
    } else { p.job = fallback.id; p.work = p.home; }
    p.shift = randInt(s, 0, c.jobById[p.job].shifts.length - 1);
  }
}

/** Who works where, rebuilt from the people (never saved). */
export function indexStaff(c) {
  c.staff = {};
  for (const p of c.s.people) if (p.work >= 0) (c.staff[p.work] ||= []).push(p.id);
}
