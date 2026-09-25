// Farhold — the power grid: making it, keeping it, spending it, and what stops first when there
// is not enough.
//
// BUILDING_EXPANSION §8.4–8.8. The machinery is lifted from `prototypes/frontier-foundry`
// (`js/production.js` `recomputePower`/`tickPower`): suppliers whose radii overlap are one network,
// generators run on a **duty cycle** so a base with spare capacity does not drain its coal
// overnight, and batteries cover the gap. Two things are Farhold's own:
//
//   1. **Shedding is an ordered ladder, not a two-tier split.** data/power.json states the order
//      and argues for it. The grid serves from the top down and whatever is left over goes to the
//      bottom, which is the same thing as shedding from the bottom up and much easier to read.
//   2. **It says what it dropped.** `tick()` returns the classes it shed this step and calls `log`
//      once when a brownout starts or ends — in the log, not a modal (§8.10).
//
//   import { createGrid } from './power.js';
//   const grid = createGrid({ power, stores, log: msg => hud.log(msg) });
//   grid.add({ id: 'gen1', type: 'burner_generator', x: 0, z: 0 });
//   grid.add({ id: 'smelter1', type: 'smelter', x: 6, z: 0, draw: 14, priority: 'refining' });
//   grid.tick(1/60, { daylight: 1, wind: 0.6 });
//   grid.stateOf('smelter1');        // 'running' | 'shed' | 'unpowered' | ...
//
// Pure: no DOM, no Three.js, no clock of its own — `tick(dt)` is driven by whoever owns the frame.

/** A network is a run of suppliers that reach each other, plus everything they cover. */
const centreDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createGrid({ power = {}, stores = null, log = null } = {}) {
  const GENS = power.generators || {};
  const BATTS = power.batteries || {};
  const POLES = power.poles || {};
  const SHED = power.shedding || {};
  const ORDER = SHED.order || ['life', 'defence', 'extraction', 'waypoint', 'refining', 'crafting', 'comfort'];
  const FLOOR = SHED.floor || {};
  const IDLE_SHARE = SHED.idleShare ?? 0.25;
  /**
   * R19 — THE SIX WORDS A MACHINE MAY SHOW, WHICH WERE DECLARED AND THEN READ BY NOBODY.
   *
   * data/power.json's `machineStates` is the enumeration `_stateDoc` says it is: "js/power.js and
   * js/refine.js set exactly one of these and the UI paints it". Neither file read it. Both simply
   * assigned string literals — fifteen of them across the two — and the proof that an unread
   * enumeration drifts is already sitting in the data: §3 added `unworked` (a tended machine
   * standing cold because nobody is working it) and the list in the file was never told, so the one
   * state a player is most likely to be confused by was not a declared state at all.
   *
   * So `overview()` tallies machines by state in THIS order, and anything holding a word the data
   * does not declare comes back in `undeclared` rather than vanishing out of the tally. A badge the
   * panel cannot paint is now a named machine in a report instead of a blank square, and the next
   * state somebody invents fails loudly the first time it is set.
   */
  const STATES = (power.machineStates?.length ? power.machineStates : ['running', 'idle', 'starved', 'unpowered', 'shed', 'blocked', 'unworked']).slice();
  const isState = s => STATES.includes(s);

  const units = new Map();          // id -> unit
  let networks = [];
  let dirty = true;
  let brownout = false;

  /** Pull the type's numbers out of whichever table it lives in. */
  function defFor(type) { return GENS[type] || BATTS[type] || POLES[type] || null; }

  /**
   * Register anything that touches the grid: a generator, a battery, a pole, or a machine that
   * draws. A machine only needs `draw` and `priority`; everything else comes off its type.
   */
  function add(spec) {
    const def = defFor(spec.type) || {};
    const u = {
      id: spec.id,
      type: spec.type,
      name: spec.name || def.name || spec.type,
      x: spec.x ?? 0, z: spec.z ?? 0,
      gen: spec.gen ?? def.gen ?? 0,
      store: spec.store ?? def.store ?? 0,
      charge: spec.charge ?? 0,
      supplyRadius: spec.supplyRadius ?? def.supplyRadius ?? 0,
      fuel: spec.fuel ?? def.fuel ?? null,
      coolant: spec.coolant ?? def.coolant ?? null,
      dayOnly: spec.dayOnly ?? def.dayOnly ?? false,
      windVaries: spec.windVaries ?? def.windVaries ?? false,
      draw: spec.draw ?? 0,
      priority: spec.priority || 'refining',
      busy: !!spec.busy,
      enabled: spec.enabled !== false,
      // filled in by tick()
      net: -1, powered: 0, duty: 0, state: 'idle', fuelChoice: null,
    };
    units.set(u.id, u);
    dirty = true;
    return u;
  }
  function remove(id) { const had = units.delete(id); dirty = true; return had; }
  function get(id) { return units.get(id) || null; }
  /** Machines tell the grid they started or stopped working — a busy machine draws its full rating. */
  function setBusy(id, busy) { const u = get(id); if (u) u.busy = !!busy; }
  function setDraw(id, draw) { const u = get(id); if (u) u.draw = draw; }

  /**
   * Group the base into networks: suppliers whose radii overlap are one grid, and everything else
   * joins the nearest supplier that covers it. Straight out of Frontier Foundry.
   */
  function rebuild() {
    const list = [...units.values()];
    const suppliers = list.filter(u => u.supplyRadius > 0);
    const parent = new Map(suppliers.map(u => [u.id, u.id]));
    const find = a => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
    for (let i = 0; i < suppliers.length; i++) for (let j = i + 1; j < suppliers.length; j++) {
      if (centreDist(suppliers[i], suppliers[j]) <= suppliers[i].supplyRadius + suppliers[j].supplyRadius) {
        const a = find(suppliers[i].id), b = find(suppliers[j].id);
        if (a !== b) parent.set(a, b);
      }
    }
    const byRoot = new Map();
    for (const u of suppliers) {
      const root = find(u.id);
      u.net = root;
      if (!byRoot.has(root)) byRoot.set(root, { id: root, members: [] });
      byRoot.get(root).members.push(u);
    }
    for (const u of list) {
      if (u.supplyRadius > 0) continue;
      u.net = -1;
      let best = null, bestD = Infinity;
      for (const s of suppliers) {
        const d = centreDist(u, s);
        if (d <= s.supplyRadius && d < bestD) { bestD = d; best = s; }
      }
      if (best) { u.net = find(best.id); byRoot.get(u.net).members.push(u); }
    }
    networks = [...byRoot.values()];
    dirty = false;
    return networks;
  }
  const all = () => { if (dirty) rebuild(); return networks; };

  // ------------------------------------------------------------------ fuel

  /** How much of a thing this unit can see: its own little buffer, then the store pool it stands in. */
  function visible(u, res) {
    const own = u.buffer?.[res] || 0;
    if (!stores) return own;
    const pool = stores.poolAt(u.x, u.z);
    return own + (pool ? stores.count(pool, res) : 0);
  }
  function drawFrom(u, res, n) {
    let got = 0;
    if (u.buffer?.[res] > 0) { const k = Math.min(n, u.buffer[res]); u.buffer[res] -= k; got += k; }
    if (got < n && stores) {
      const pool = stores.poolAt(u.x, u.z);
      if (pool) got += stores.take(pool, res, n - got);
    }
    return got;
  }

  /**
   * What a generator could put out right now, without burning anything yet.
   *
   * Zero if it has no fuel or no coolant, so the grid never counts power it cannot actually make —
   * which is the difference between "the lights went out" and "the lights flickered for an hour
   * while a number lied to you".
   */
  function potential(u, { daylight = 1, wind = 1 } = {}) {
    if (!u.gen || !u.enabled) return 0;
    let out = u.gen;
    if (u.dayOnly) out *= Math.max(0, daylight);
    if (u.windVaries) out *= Math.max(0, wind);
    if (out <= 0) return 0;
    if (u.fuel) {
      u.fuelChoice = null;
      for (const [res, perSec] of Object.entries(u.fuel)) {
        if (visible(u, res) >= perSec * 0.5) { u.fuelChoice = [res, perSec]; break; }
      }
      if (!u.fuelChoice) return 0;
    }
    if (u.coolant) for (const [res, perSec] of Object.entries(u.coolant)) if (visible(u, res) < perSec) return 0;
    return out;
  }

  /** Burn only what the grid actually asked for. Half the load, half the coal. */
  function burn(u, dt, duty) {
    u.duty = duty;
    if (duty <= 0) return;
    if (u.fuel && u.fuelChoice) drawFrom(u, u.fuelChoice[0], u.fuelChoice[1] * dt * duty);
    if (u.coolant) for (const [res, perSec] of Object.entries(u.coolant)) drawFrom(u, res, perSec * dt);
  }

  // ------------------------------------------------------------------ the tick

  /**
   * One step of every network.
   *
   * Returns a small report — what each network made, what it wanted, and which classes it had to
   * shed — so the HUD and the tests read the same numbers rather than guessing from side effects.
   */
  function tick(dt, { daylight = 1, wind = 1 } = {}) {
    const report = [];
    for (const n of all()) {
      const gens = [], batteries = [], loads = new Map();
      let gen = 0, store = 0, charge = 0, use = 0;
      for (const u of n.members) {
        if (u.gen) { const p = potential(u, { daylight, wind }); gens.push([u, p]); gen += p; }
        if (u.store) { batteries.push(u); store += u.store; charge += u.charge || 0; }
        if (u.draw > 0 && u.enabled) {
          // an idle machine still draws a share: the lights on it, the heater in it
          const want = u.draw * (u.busy ? 1 : IDLE_SHARE);
          use += want;
          loads.set(u.priority, (loads.get(u.priority) || 0) + want);
        }
      }

      // spare generation charges the batteries, so a generator with headroom is never simply wasted
      const room = Math.max(0, store - charge) / Math.max(1e-6, dt);
      const demand = use + Math.min(room, gen);
      const duty = gen > 0 ? Math.min(1, demand / gen) : 0;
      for (const [u, p] of gens) burn(u, dt, p > 0 ? duty : 0);
      const supplied = gen * duty;

      let fromBattery = 0;
      if (supplied < use && charge > 0) fromBattery = Math.min(use - supplied, charge / Math.max(1e-6, dt));
      const available = supplied + fromBattery;

      // Serve the ladder from the top. Whatever is left when a class is reached is what that class
      // gets — which is the same as shedding from the bottom up, stated the other way round.
      const satisfaction = new Map();
      let left = available;
      for (const cls of ORDER) {
        const want = loads.get(cls) || 0;
        if (want <= 0) { satisfaction.set(cls, 1); continue; }
        const give = Math.min(want, left);
        left -= give;
        satisfaction.set(cls, Math.max(FLOOR[cls] ?? 0, give / want));
      }
      // anything with a class nobody listed goes last of all
      const leftover = left;

      for (const u of n.members) {
        if (!u.draw) { u.powered = 1; u.state = u.gen ? (duty > 0 ? 'running' : 'idle') : 'running'; continue; }
        const s = satisfaction.has(u.priority) ? satisfaction.get(u.priority) : (leftover > 0 ? 1 : 0);
        u.powered = u.enabled ? s : 0;
        u.state = !u.enabled ? 'idle' : s <= 0.01 ? 'shed' : s < 0.99 ? 'shed' : (u.busy ? 'running' : 'idle');
      }

      // batteries take the surplus or give up the shortfall, shared by capacity
      const delta = (supplied > use ? Math.min(supplied - use, room) : -fromBattery) * dt;
      if (store > 0) for (const b of batteries) {
        b.charge = Math.max(0, Math.min(b.store, (b.charge || 0) + delta * (b.store / store)));
      }

      const sat = use > 0 ? Math.max(0, Math.min(1, available / use)) : 1;
      const shedClasses = ORDER.filter(c => (loads.get(c) || 0) > 0 && (satisfaction.get(c) ?? 1) < 0.99);
      n.gen = gen; n.supplied = supplied; n.use = use; n.charge = charge + delta; n.store = store;
      n.satisfaction = sat; n.shed = shedClasses;
      report.push({ id: n.id, gen, supplied, use, store, charge: n.charge, satisfaction: sat, shed: shedClasses, fromBattery });
    }

    // anything that no supplier reaches is simply off, and says so
    for (const u of units.values()) {
      if (u.net === -1 && u.draw > 0) { u.powered = 0; u.state = 'unpowered'; }
    }

    const worst = report.length ? Math.min(...report.map(r => r.satisfaction)) : 1;
    if (!brownout && worst < (SHED.brownoutBelow ?? 0.85)) {
      brownout = true;
      const dropped = [...new Set(report.flatMap(r => r.shed))];
      log?.(dropped.length
        ? `Power short — ${Math.round(worst * 100)}% of what the base wants. Shed: ${dropped.join(', ')}.`
        : `Power short — ${Math.round(worst * 100)}% of what the base wants.`);
    } else if (brownout && worst >= (SHED.restoredAbove ?? 0.98)) {
      brownout = false;
      log?.('Power restored. Everything is back on.');
    }
    return { networks: report, worst, brownout };
  }

  /** What one machine is doing, for the badge on its face (§8.8). */
  function stateOf(id) { return get(id)?.state || 'unpowered'; }
  function poweredOf(id) { return get(id)?.powered ?? 0; }

  /** The base overview's power half (§8.9). */
  function overview() {
    return all().map(n => {
      // R19 — one count per state data/power.json declares, in the order it declares them
      const states = {};
      for (const s of STATES) states[s] = 0;
      const undeclared = [];
      for (const u of n.members) {
        if (!u.draw) continue;                       // a pole is not a machine with a badge
        if (isState(u.state)) states[u.state]++;
        else undeclared.push({ id: u.id, name: u.name, state: u.state });
      }
      return {
        id: n.id,
        generators: n.members.filter(u => u.gen).length,
        batteries: n.members.filter(u => u.store).length,
        machines: n.members.filter(u => u.draw > 0).length,
        gen: +(n.gen || 0).toFixed(1),
        use: +(n.use || 0).toFixed(1),
        charge: +(n.charge || 0).toFixed(1),
        store: n.store || 0,
        satisfaction: +(n.satisfaction ?? 1).toFixed(3),
        shed: n.shed || [],
        states,
        undeclared,
      };
    });
  }

  /**
   * "What happens if I turn this on?" — answered before the player commits, in the same spirit as
   * the node report: a number you can see rather than a surprise you discover.
   */
  function whatIf(id, extraDraw, priority = 'refining') {
    const u = get(id);
    const n = all().find(x => x.id === (u?.net ?? -1));
    if (!n) return { ok: false, why: 'nothing on this spot is connected to a grid' };
    const use = (n.use || 0) + extraDraw;
    const available = (n.supplied || 0);
    const sat = use > 0 ? available / use : 1;
    const at = ORDER.indexOf(priority);
    const below = ORDER.slice(at + 1);
    return {
      ok: sat >= 0.99,
      use: +use.toFixed(1),
      available: +available.toFixed(1),
      satisfaction: +sat.toFixed(3),
      text: sat >= 0.99
        ? `Room for it: ${available.toFixed(0)} made, ${use.toFixed(0)} wanted.`
        : `Short by ${(use - available).toFixed(0)}. ${below.length ? `${below.join(', ')} would go dark first.` : 'Nothing below this to shed — it would go dark itself.'}`,
    };
  }

  /**
   * R19 — HOW MANY kW ARE SPARE ON THE GRID THAT REACHES THIS POINT.
   *
   * The Hauler Drone in data/colony.json costs no gold and 12 kW `powerAtOrigin`, and js/trade.js
   * needs to ask that question about a PLACE rather than about a machine — `whatIf` wants a unit
   * id, and a trade post is not on the grid, it is standing next to it.
   *
   * A point is on a network when a supplier reaches it, which is the same test `rebuild()` uses to
   * decide which network a machine belongs to, asked of bare ground. Returns null (not zero) when
   * no supplier reaches the point at all: null means "there is no grid here" and zero means "there
   * is one and it has nothing to give", and the drone's refusal line says something different for
   * each of them.
   */
  function spareAt(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const nets = all();
    let best = null, bestD = Infinity;
    for (const n of nets) {
      for (const u of n.members) {
        if (!(u.supplyRadius > 0)) continue;
        const d = Math.hypot((u.x ?? 0) - x, (u.z ?? 0) - z);
        if (d <= u.supplyRadius && d < bestD) { bestD = d; best = n; }
      }
    }
    if (!best) return null;
    /**
     * CAPACITY minus load, not OUTPUT minus load.
     *
     * `supplied` is `gen * duty`, and duty is how hard the generators are being asked to work — so
     * a base with nothing switched on has a burner generator sitting at zero output and `supplied
     * - use` comes out as 0 spare. That is the opposite of the truth: a 30 kW generator with
     * nothing drawing on it is the emptiest grid there is. The question the drone is really asking
     * is "could this grid carry 12 kW more", and the answer is generation capacity less the load.
     * My own test caught this on its first honest run, having passed vacuously before that.
     */
    return Math.max(0, (best.gen || 0) - (best.use || 0));
  }

  function toJSON() {
    return { units: [...units.values()].map(u => ({ id: u.id, type: u.type, x: u.x, z: u.z, charge: u.charge, enabled: u.enabled, priority: u.priority, draw: u.draw })) };
  }
  function load(json) { units.clear(); for (const u of json?.units || []) add(u); dirty = true; return all(); }

  return {
    add, remove, get, setBusy, setDraw, rebuild, networks: all,
    potential, tick, stateOf, poweredOf, overview, whatIf, spareAt, toJSON, load,
    order: ORDER,
    // R19 — the declared badge words, so refine.js and any panel read the data instead of a literal
    machineStates: STATES, isState,
    get brownout() { return brownout; },
    get size() { return units.size; },
  };
}
