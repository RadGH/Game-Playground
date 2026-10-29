// Jobs (PLAN M7): the town staffs every building by itself — nobody assigns a worker. PURE.
//
// Labour = the population minus anyone drafted into a squad (M5 calls town.draft). Each town step the labour is
// handed out again from scratch: buildings marked `staffFirst` in data/buildings.json (food and water: people must
// eat) come first, then every other building with `jobs`, NEAREST A HOME FIRST (ties by id). A building gets all its
// jobs or what is left. `b.workers` is what it got; the work-speed hook (index.js) multiplies its speed by
// workers ÷ jobs. A producer with nobody at all lights its INPUT lamp "no workers".

export const NO_WORKERS = 'no workers';

/** Hand out `labour` workers over `list` = [{ b, jobs, first, d2 }] (sorted here). Returns { filled, wanted }. */
export function assignJobs(list, labour) {
  list.sort((a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0) || a.d2 - b.d2 || a.b.id - b.b.id);
  let left = Math.max(0, labour), filled = 0, wanted = 0;
  for (const it of list) {
    const k = Math.min(it.jobs, left);
    it.got = k; left -= k; filled += k; wanted += it.jobs;
  }
  return { filled, wanted, idle: left };
}

export function createJobs(sim, town) {
  const D = sim.data;

  /** Set or clear the INPUT lamp the way production.js does (so the teletype hears of it after the debounce). */
  function lamp(b, why) {
    if (!b.lamps) return;
    if (b.lamps.input === why) return;
    if (!why && b.lamps.input !== NO_WORKERS) return; // only ever clear our own reason
    b.lamps.input = why;
    b.jamSince = b.jamSince || {};
    if (why) b.jamSince.input = sim.tick; else if (b.jamTold) delete b.jamTold.input;
    sim.dirty.add(b.id);
  }

  function step(homes) {
    const list = [];
    for (const b of sim.ents.list('building')) {
      if (b.built < 1) continue;
      const def = D.B[b.type];
      if (!def.jobs) continue;
      let d2 = Infinity;
      for (const h of homes) { const dx = h.x - b.fp.cx, dy = h.y - b.fp.cy, d = dx * dx + dy * dy; if (d < d2) d2 = d; }
      list.push({ b, jobs: def.jobs, first: !!def.staffFirst, d2 });
    }
    const r = assignJobs(list, town.pop - town.drafted);
    for (const it of list) {
      const b = it.b;
      if (b.workers !== it.got) { b.workers = it.got; sim.dirty.add(b.id); }
      b.jobs = it.jobs;
      const def = D.B[b.type];
      // the INPUT lamp says "no workers" only while the producer wants to run and has no other reason lit (production.js
      // owns the lamp otherwise: a stocked producer is simply off, a missing input is named)
      if (def.recipes || def.power?.supply) {
        if (it.got === 0) { if (b.wants !== false && !b.lamps?.input) lamp(b, NO_WORKERS); }
        else lamp(b, null);
      }
    }
    town.jobsFilled = r.filled; town.jobsWanted = r.wanted; town.idle = r.idle;
    return r;
  }

  return { step };
}
