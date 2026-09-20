// Farhold — refining: raw stuff into useful stuff, in three tiers, while you are somewhere else.
//
// BUILDING_EXPANSION §2. Every recipe and every machine lives in `data/refining.json`; this file is
// only the engine that runs them. Three rules shape it:
//
//   §2.19 EVERYTHING QUEUES. You set a job and walk away. `catchUp(seconds)` runs a machine forward
//         when you come back from a fight, so "set it going and leave" is the intended way to use
//         the place rather than something you get away with.
//   §2.18 RECIPES UNLOCK BY DOING. Smelt iron ten times and the alloy forge's steel appears. There
//         is no tech-tree screen for tier one; `completed` counts what you have made and
//         `available()` tells you what that has opened up.
//   §2.20 REFINING IS WHERE POWER STARTS TO MATTER. Tier 0 burns fuel and does not care about the
//         grid. Tier 1 runs slowly by hand and properly on power. Tier 2 does not run at all
//         without it — and the refinery will not even start without coolant in the pool.
//
//   import { createWorks } from './refine.js';
//   const works = createWorks({ refining, resources, stores, grid, log });
//   works.place({ id: 'furnace1', type: 'furnace', x: 4, z: 2 });
//   works.queue('furnace1', 'smelt_iron', 10);
//   works.tick(1 / 60);              // in the frame loop
//   works.catchUp(600);              // ten minutes passed while you were in a dungeon
//
// Pure: no DOM, no Three.js, no clock of its own. The machine's badge, the job list and the
// progress bar are drawn from `snapshot()`.

/**
 * `stores` is a js/stores.js network — a machine draws from and delivers to the pool it stands in,
 * which is the whole point of §8: a machine outside every pool has nothing to work with.
 * `grid` is a js/power.js grid, or null for a base that has not got that far yet.
 */
export function createWorks({ refining = {}, resources = {}, stores = null, grid = null, log = null, rareElement = null } = {}) {
  const MACHINES = refining.machines || {};
  const RECIPES = Object.fromEntries((refining.recipes || []).map(r => [r.id, r]));
  const BY_MACHINE = {};
  for (const r of refining.recipes || []) (BY_MACHINE[r.machine] ||= []).push(r);
  const MATS = resources.materials || {};

  const machines = new Map();
  /** How many times each recipe has been completed, ever. This is the whole unlock system. */
  const completed = Object.create(null);
  const justUnlocked = [];

  const nameOf = id => MATS[id]?.name || id;

  // ---------------------------------------------------------------- building one

  function place({ id, type, x = 0, z = 0, name = null }) {
    const def = MACHINES[type];
    if (!def) return { ok: false, why: `there is no such machine as "${type}"` };
    const m = {
      id, type, def, x, z,
      name: name || def.name,
      queue: [],                 // [{ recipe, left, done }]
      crafting: false, progress: 0,
      fuelSeconds: 0, fuelRes: null,
      state: 'idle', starvedFor: null, made: 0,
      enabled: true,
    };
    machines.set(id, m);
    // tell the grid about it so load shedding can find it. A tier-0 machine has no draw at all,
    // which is exactly why you can build one the hour you land.
    if (grid && (def.powerUse || 0) > 0) {
      grid.add({ id, type, x, z, draw: def.powerUse, priority: def.priority || 'refining', name: m.name });
    }
    return { ok: true, machine: m };
  }
  function removeMachine(id) { grid?.remove(id); return machines.delete(id); }
  const get = id => machines.get(id) || null;

  // ---------------------------------------------------------------- what you may make

  /** Has this recipe been earned yet? §2.18 — you earn it by doing the one before it. */
  function isUnlocked(recipeId) {
    const r = RECIPES[recipeId];
    if (!r) return false;
    if (!r.unlock) return true;
    return (completed[r.unlock.recipe] || 0) >= (r.unlock.times || 1);
  }

  /** How close you are to earning it, for the "3 more and this appears" line. */
  function unlockProgress(recipeId) {
    const r = RECIPES[recipeId];
    if (!r?.unlock) return { locked: false, done: 0, need: 0, text: '' };
    const done = completed[r.unlock.recipe] || 0, need = r.unlock.times || 1;
    const via = RECIPES[r.unlock.recipe];
    return {
      locked: done < need, done, need,
      text: done >= need ? '' : `${need - done} more ${via?.name || r.unlock.recipe} and this turns up`,
    };
  }

  /** Every recipe this machine can run right now. */
  function available(machineType) {
    return (BY_MACHINE[machineType] || []).filter(r => isUnlocked(r.id));
  }
  /** Every recipe this machine has, unlocked or not, so the UI can grey out the rest. */
  function board(machineType) {
    return (BY_MACHINE[machineType] || []).map(r => ({ ...r, unlock: unlockProgress(r.id), unlocked: isUnlocked(r.id) }));
  }

  /**
   * The real input list for a recipe. `rareInput` is a count rather than an id: which rare element
   * a recipe eats depends on what this planet holds (§9.6), and on a world that holds none the
   * recipe honestly cannot be run here.
   */
  function inputsOf(recipe) {
    const ins = { ...(recipe.inputs || {}) };
    if (recipe.rareInput) {
      if (!rareElement) return null;
      ins[rareElement] = (ins[rareElement] || 0) + recipe.rareInput;
    }
    return ins;
  }

  // ---------------------------------------------------------------- the queue

  /** Put a job on a machine. `count` 0 or less means "keep going until told otherwise". */
  function queue(machineId, recipeId, count = 1) {
    const m = get(machineId);
    if (!m) return { ok: false, why: 'no such machine' };
    const r = RECIPES[recipeId];
    if (!r) return { ok: false, why: 'no such recipe' };
    if (r.machine !== m.type) return { ok: false, why: `${m.name} cannot run ${r.name}` };
    if (!isUnlocked(recipeId)) return { ok: false, why: unlockProgress(recipeId).text || 'not learned yet' };
    if (r.rareInput && !rareElement) return { ok: false, why: 'this world holds no rare element — you will have to go and find one' };
    m.queue.push({ recipe: recipeId, left: count > 0 ? count : Infinity, done: 0 });
    return { ok: true, job: m.queue[m.queue.length - 1] };
  }
  function cancel(machineId, index = 0) {
    const m = get(machineId);
    if (!m || !m.queue[index]) return false;
    m.queue.splice(index, 1);
    if (index === 0) { m.crafting = false; m.progress = 0; }
    return true;
  }
  function clear(machineId) { const m = get(machineId); if (!m) return false; m.queue.length = 0; m.crafting = false; m.progress = 0; return true; }

  // ---------------------------------------------------------------- the pool it stands in

  function poolFor(m) { return stores ? stores.poolAt(m.x, m.z) : null; }
  function see(m, res) { const p = poolFor(m); return p ? stores.count(p, res) : 0; }
  function takeFrom(m, res, n) { const p = poolFor(m); return p ? stores.take(p, res, n) : 0; }
  function putInto(m, res, n) { const p = poolFor(m); return p ? stores.put(p, res, n) : 0; }

  // ---------------------------------------------------------------- fuel, for the tier-0 lot

  /**
   * Keep a fuel-burning machine lit. `fuels` says how many SECONDS of work one unit buys, so a log
   * is worth eighteen seconds in a furnace and coal is worth seventy — which is the whole reason
   * coal matters before power does.
   */
  function stoke(m) {
    const fuels = m.def.fuels || {};
    if (!Object.keys(fuels).length) return true;
    if (m.fuelSeconds > 0) return true;
    // best first: the fuel that buys the most seconds, so nobody burns beams by accident
    const order = Object.entries(fuels).sort((a, b) => b[1] - a[1]);
    for (const [res, seconds] of order) {
      if (see(m, res) >= 1 && takeFrom(m, res, 1) >= 1) { m.fuelSeconds += seconds; m.fuelRes = res; return true; }
    }
    m.fuelRes = null;
    return false;
  }

  /** How fast this machine runs right now: 0 means it is not running at all, and why. */
  function speedOf(m) {
    const def = m.def;
    let factor = 1;
    if ((def.powerUse || 0) > 0) {
      const powered = grid ? grid.poweredOf(m.id) : 0;
      if (def.needsPower) {
        if (powered < 0.05) return { speed: 0, why: grid ? (grid.stateOf(m.id) === 'unpowered' ? 'unpowered' : 'shed') : 'unpowered' };
        factor = powered;
      } else {
        // it turns by hand at a fraction of the speed, which is what makes a sawmill worth having
        // before the grid is
        factor = powered >= 0.05 ? powered : (def.unpoweredSpeed ?? 0.35);
      }
    }
    return { speed: (def.speed ?? 1) * factor, why: '' };
  }

  // ---------------------------------------------------------------- one machine, one step

  function step(m, dt) {
    if (!m.enabled) { m.state = 'idle'; grid?.setBusy(m.id, false); return; }
    const job = m.queue[0];
    if (!job) { m.state = 'idle'; m.crafting = false; grid?.setBusy(m.id, false); return; }
    const recipe = RECIPES[job.recipe];
    if (!recipe) { m.queue.shift(); return; }

    const { speed, why } = speedOf(m);
    if (speed <= 0) { m.state = why || 'unpowered'; grid?.setBusy(m.id, false); return; }

    let budget = dt;
    let guard = 0;
    while (budget > 1e-9 && guard++ < 10000) {
      if (!m.crafting) {
        const ins = inputsOf(recipe);
        if (!ins) { m.state = 'starved'; m.starvedFor = 'a rare element this world does not hold'; break; }
        let short = null;
        for (const [res, n] of Object.entries(ins)) if (see(m, res) < n) { short = res; break; }
        if (short) {
          if (m.state !== 'starved') log?.(`${m.name} has stopped: no ${nameOf(short)}.`);
          m.state = 'starved'; m.starvedFor = short;
          grid?.setBusy(m.id, false);
          break;
        }
        for (const [res, n] of Object.entries(ins)) takeFrom(m, res, n);
        m.crafting = true; m.progress = 0; m.starvedFor = null;
      }

      // a fuel burner needs to be lit; a coolant machine needs coolant every second it runs
      if (Object.keys(m.def.fuels || {}).length && !stoke(m)) {
        if (m.state !== 'starved') log?.(`${m.name} has gone out: nothing left to burn.`);
        m.state = 'starved'; m.starvedFor = 'fuel';
        grid?.setBusy(m.id, false);
        break;
      }

      // real seconds to finish, never negative — a slice that ran backwards used to wind the
      // progress bar down and let a machine finish a job it had been refusing to run
      const need = Math.max(0, (recipe.time - m.progress) / speed);
      const slice = Math.max(0, Math.min(budget, need));

      // coolant is taken BEFORE the work is credited, because a machine that has already done the
      // work cannot then be told it was not allowed to
      if (m.def.coolant) {
        let dry = null;
        for (const [res, perSec] of Object.entries(m.def.coolant)) {
          const want = perSec * slice;
          if (want <= 0) continue;
          if (takeFrom(m, res, want) < want - 1e-9) { dry = res; break; }
        }
        if (dry) {
          if (m.state !== 'starved') log?.(`${m.name} is out of ${nameOf(dry)} and has shut down.`);
          m.state = 'starved'; m.starvedFor = dry;
          grid?.setBusy(m.id, false);
          return;
        }
      }

      m.progress += slice * speed;
      budget -= slice;
      if (m.fuelSeconds > 0) m.fuelSeconds = Math.max(0, m.fuelSeconds - slice);
      m.state = 'running';
      grid?.setBusy(m.id, true);

      if (m.progress + 1e-9 < recipe.time) break;

      // finished: everything has to fit somewhere or the machine holds the batch and says so
      let allOut = true;
      for (const [res, n] of Object.entries(recipe.outputs || {})) {
        if (putInto(m, res, n) < n - 1e-9) allOut = false;
      }
      if (!allOut) {
        m.state = 'blocked';
        m.progress = recipe.time;
        log?.(`${m.name} has finished and there is nowhere to put it.`);
        grid?.setBusy(m.id, false);
        break;
      }
      m.crafting = false; m.progress = 0; m.made++;
      job.done++;
      completed[recipe.id] = (completed[recipe.id] || 0) + 1;
      noteUnlocks(recipe.id);
      if (job.left !== Infinity) job.left--;
      if (job.left <= 0) { m.queue.shift(); if (!m.queue.length) { m.state = 'idle'; grid?.setBusy(m.id, false); break; } }
    }
  }

  /** Anything this completion just opened up gets announced once, not every tick. */
  function noteUnlocks(justDone) {
    for (const r of refining.recipes || []) {
      if (r.unlock?.recipe !== justDone) continue;
      if ((completed[justDone] || 0) !== (r.unlock.times || 1)) continue;     // exactly on the step
      justUnlocked.push(r.id);
      log?.(`You have the hang of it: ${r.name} is now on the ${MACHINES[r.machine]?.name || r.machine}.`);
    }
  }

  /** One frame. */
  function tick(dt) {
    for (const m of machines.values()) step(m, dt);
    const opened = justUnlocked.splice(0, justUnlocked.length);
    return { unlocked: opened };
  }

  /**
   * Catch every machine up after time has passed elsewhere — a fight, a dungeon, a night's sleep.
   *
   * Chopped into slices rather than run as one enormous step, because a machine can go from running
   * to starved to blocked inside the window and the fuel, the coolant and the pool all have to see
   * that happen in order. The slice is deliberately coarse: this is a catch-up, not a simulation.
   */
  function catchUp(seconds, { slice = 5 } = {}) {
    let left = Math.max(0, seconds);
    const opened = [];
    let guard = 0;
    while (left > 1e-6 && guard++ < 20000) {
      const dt = Math.min(slice, left);
      opened.push(...tick(dt).unlocked);
      left -= dt;
    }
    return { unlocked: [...new Set(opened)] };
  }

  // ---------------------------------------------------------------- telling the player

  /** What to draw on one machine: its badge, its job, and how far through it is. */
  function snapshot(id) {
    const m = get(id);
    if (!m) return null;
    const job = m.queue[0];
    const recipe = job ? RECIPES[job.recipe] : null;
    return {
      id: m.id, name: m.name, type: m.type, tier: m.def.tier,
      state: m.state,
      stateText: stateText(m),
      recipe: recipe?.id || null,
      recipeName: recipe?.name || '',
      progress: recipe ? Math.min(1, m.progress / recipe.time) : 0,
      queued: m.queue.map(j => ({ recipe: j.recipe, name: RECIPES[j.recipe]?.name || j.recipe, left: j.left, done: j.done })),
      fuel: m.fuelRes ? { resource: m.fuelRes, name: nameOf(m.fuelRes), seconds: +m.fuelSeconds.toFixed(1) } : null,
      made: m.made,
      pooled: !!poolFor(m),
    };
  }

  /** The line under the badge. Plain language: a player should never have to guess. */
  function stateText(m) {
    switch (m.state) {
      case 'running': return `Working${m.fuelRes ? ` — burning ${nameOf(m.fuelRes)}` : ''}`;
      case 'idle': return m.queue.length ? 'Waiting' : 'Nothing queued';
      case 'starved': return m.starvedFor === 'fuel' ? 'Out of fuel' : `Waiting for ${nameOf(m.starvedFor)}`;
      case 'blocked': return 'Finished, and nowhere to put it';
      case 'unpowered': return 'No power reaches this';
      case 'shed': return 'Grid is short — this was switched off to keep the important things on';
      default: return m.state;
    }
  }

  /** Every machine at once, for the base overview (§8.9) and the one shared job list (§3.19). */
  function allJobs() {
    const out = [];
    for (const m of machines.values()) {
      for (let i = 0; i < m.queue.length; i++) {
        const j = m.queue[i];
        out.push({
          machine: m.id, machineName: m.name, index: i,
          recipe: j.recipe, name: RECIPES[j.recipe]?.name || j.recipe,
          left: j.left, done: j.done,
          progress: i === 0 && RECIPES[j.recipe] ? Math.min(1, m.progress / RECIPES[j.recipe].time) : 0,
          state: i === 0 ? m.state : 'queued',
        });
      }
    }
    return out;
  }

  function toJSON() {
    return {
      completed: { ...completed },
      machines: [...machines.values()].map(m => ({
        id: m.id, type: m.type, x: m.x, z: m.z, enabled: m.enabled,
        queue: m.queue.map(j => ({ recipe: j.recipe, left: j.left === Infinity ? -1 : j.left, done: j.done })),
        progress: m.progress, crafting: m.crafting, fuelSeconds: m.fuelSeconds, fuelRes: m.fuelRes, made: m.made,
      })),
    };
  }
  function load(json) {
    machines.clear();
    for (const k in completed) delete completed[k];
    Object.assign(completed, json?.completed || {});
    for (const spec of json?.machines || []) {
      const { machine } = place(spec);
      if (!machine) continue;
      machine.enabled = spec.enabled !== false;
      machine.progress = spec.progress || 0;
      machine.crafting = !!spec.crafting;
      machine.fuelSeconds = spec.fuelSeconds || 0;
      machine.fuelRes = spec.fuelRes || null;
      machine.made = spec.made || 0;
      machine.queue = (spec.queue || []).map(j => ({ recipe: j.recipe, left: j.left < 0 ? Infinity : j.left, done: j.done || 0 }));
    }
    return machines.size;
  }

  return {
    place, remove: removeMachine, get, queue, cancel, clear, tick, catchUp,
    isUnlocked, unlockProgress, available, board, inputsOf, snapshot, stateText, allJobs,
    recipes: RECIPES, machineDefs: MACHINES, completed,
    set rare(key) { rareElement = key; },
    get rare() { return rareElement; },
    toJSON, load,
    get size() { return machines.size; },
  };
}
