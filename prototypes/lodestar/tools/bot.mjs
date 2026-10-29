// Bot v1 (PLAN M3): plays the economy through the SAME commands the console sends (§3.3) — it never touches sim
// state directly, it only reads what the console could see (hud, known outcrops/deposits, buildings) and asks the
// sim's own placement check before it builds, the way the BUILD tool's ghost does.
//
// Goal: 500 copper bars made. Plan, re-checked every `every` ticks:
//   lumber camp → camps on the nearest copper, coal and stone outcrops → a porters' hut → roads from the HQ to each
//   camp → smelter (when Smelting arrives) with keep-in-stock raised past the goal → sawmill → cart shed (when Mule
//   carts arrive) → a sensor mast and a new camp when an outcrop runs low → thumper, iron camp and drills when they
//   arrive.
//
//   node tools/bot.mjs [--seed 7] [--size small] [--minutes 60]     prints a one-line summary
//   import { runBot } from './bot.mjs'                              (tests, balance.mjs)

import { loadData } from './lib-data.mjs';
import { createSim } from '../js/sim/index.js';
import { SUB } from '../js/sim/entities.js';
import { createTownBot } from './bot-town.mjs'; // M7
import { createDefenceBot } from './bot-defence.mjs'; // M4

const TAU = 6.283185307179586;

export function createBot(sim, { goal = 500, log = null, defend = true } = {}) {
  const D = sim.data;
  const notes = [];
  const say = (s) => { notes.push(`${sim.tick}: ${s}`); if (log) log(`[${sim.tick}] ${s}`); };
  const hq = () => sim.ents.list('building').find((b) => b.type === 'hq');
  const mine = (type) => sim.ents.list('building').filter((b) => b.type === type);
  const send = (cmd) => sim.send({ base: 'home', ...cmd });
  const roadsTo = new Set();

  /** Spiral out from (cx, cy) for the first spot the sim would accept. `inRing` keeps it inside the HQ yard. */
  function spot(type, cx, cy, { rMin = 0, rMax = 120, inRing = false, score = null } = {}) {
    const h = hq();
    const ring = D.B.hq.ring - Math.max(...D.B[type].size) / 2 - 2;
    let best = null;
    for (let r = rMin; r <= rMax; r += 3) {
      const n = Math.max(8, Math.round((TAU * r) / 5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
        if (inRing && h && (x - h.fp.cx) ** 2 + (y - h.fp.cy) ** 2 > ring * ring) continue;
        const c = sim.buildings.canPlace(type, x, y);
        if (!c.ok) continue;
        if (!score) return [x, y];
        const s = score(c, x, y);
        if (!best || s > best.s) best = { s, x, y };
      }
      if (best && !score) break;
      if (best && r > rMin + 24) break;
    }
    return best ? [best.x, best.y] : null;
  }

  // a search that found nothing is not repeated for a while (each try asks the sim about thousands of spots)
  const failedAt = new Map();
  const tryBuild = (key, type, finder, why) => {
    if (sim.tick - (failedAt.get(key) ?? -1e9) < 1500) return null;
    const at = finder();
    if (!at) { failedAt.set(key, sim.tick); return null; }
    return build(type, at, why);
  };

  function build(type, at, why) {
    if (!at) return null;
    const r = send({ t: 'build', type, x: at[0], y: at[1] });
    if (r.ok) say(`build ${type} at ${at} (${why})`);
    return r.ok ? r.id : null;
  }

  /** Lay a road along the walking route between two doors (simplified to a point every ~10 cells). */
  function road(a, b, key) {
    if (roadsTo.has(key)) return;
    roadsTo.add(key);
    const foot = sim.data.V.porter;
    const r = sim.paths.find(a[0], a[1], b[0], b[1], foot);
    if (!r) return;
    const W = sim.world.g.W, pts = [];
    for (let i = 0; i < r.cells.length; i += 4) pts.push([r.cells[i] % W, (r.cells[i] / W) | 0]);
    const last = r.cells[r.cells.length - 1]; pts.push([last % W, (last / W) | 0]);
    if (pts.length < 2) return;
    const res = send({ t: 'drawRoad', pts });
    say(res.ok ? `road ${key} (${Math.round(r.len)} cells)` : `road ${key} refused: ${res.why}`);
  }

  const knownOut = () => sim.survey.known().outcrops;
  const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  function campOn(res) {
    const h = hq(); if (!h) return null;
    const centre = { x: h.fp.cx, y: h.fp.cy };
    const taken = mine('camp').filter((c) => D.RECIPE[c.recipe].dig === res);
    const live = taken.filter((c) => c.lamps.input !== 'nothing left to dig in reach');
    if (live.length) return live[0];
    const list = knownOut().filter((o) => o.res === res && o.remaining > 40).sort((a, b) => dist(a, centre) - dist(b, centre));
    for (const o of list) {
      if (sim.tick - (failedAt.get('camp' + o.id) ?? -1e9) < 1500) continue;
      const at = spot('camp', o.x, o.y, { rMin: Math.max(4, o.r - 4), rMax: o.r + 18, score: (c) => (c.dig.find((d) => d.res === res)?.units || 0) - 1000 * (c.dig[0].res !== res) });
      if (!at) { failedAt.set('camp' + o.id, sim.tick); continue; }
      const id = build('camp', at, `${res} outcrop ${o.id}`);
      if (id) { const b = sim.ents.get(id); const rid = D.B.camp.recipes.find((x) => D.RECIPE[x].dig === res); if (b.recipe !== rid) send({ t: 'setRecipe', id, recipe: rid }); return b; }
    }
    return null;
  }

  const townBot = createTownBot({ sim, spot, tryBuild, mine, hq, send, say }); // M7
  const defenceBot = defend ? createDefenceBot(sim, { say }) : null; // M4: towers by what is loud, walls across raid paths
  let lastMast = -1e9;
  function step(events = []) {
    const h = hq(); if (!h) return;
    defenceBot?.step(events); // M4
    const hud = sim.hud();
    const stock = hud.stock;
    const sites = hud.sites;
    // 1. timber (and if no wood is in sight yet, a sensor mast to find some)
    const woods = mine('lumber').filter((l) => l.lamps.input !== 'nothing left to dig in reach');
    if (!woods.length || (woods.length < 2 && (hud.produced.timber || 0) > 200)) {
      const id = tryBuild('lumber', 'lumber', () => spot('lumber', h.fp.cx, h.fp.cy, { rMin: 30, rMax: 400, score: (c) => c.dig[0].units - Math.hypot(c.fp.cx - h.fp.cx, c.fp.cy - h.fp.cy) }), 'timber');
      const masts = mine('sensor_mast');
      if (!id && failedAt.has('lumber') && masts.every((m) => m.built >= 1) && masts.length < 6) {
        // no wood in sight: put a mast out at the edge of what the scope has seen, a new direction each time
        const i = masts.length, ang = ((sim.seed % 8) * TAU) / 8 + i * 2.1;
        const reach = 120 + 60 * Math.floor(i / 3);
        tryBuild('mast-wood' + i, 'sensor_mast', () => spot('sensor_mast', h.fp.cx + Math.cos(ang) * reach, h.fp.cy + Math.sin(ang) * reach, { rMax: 90 }), 'look for a wood');
      }
    }
    if (sites > 3) return; // let the builders catch up
    if (!mine('lumber').length) return; // wood first: every other build costs timber
    townBot.step(hud); // M7: wells, farms, houses, lamps, Commons
    // 2. camps on copper, coal, stone
    for (const res of ['copper_ore', 'coal', 'stone']) campOn(res);
    // 3. a porters' hut once the camps are going
    if (mine('porter_hut').length < 1 + Math.floor(mine('camp').length / 2) && (stock.timber || 0) >= 30) tryBuild('hut', 'porter_hut', () => spot('porter_hut', h.fp.cx, h.fp.cy, { rMin: 28, rMax: 60, inRing: true }), 'more porters');
    // 4. roads from the HQ to every camp outside the yard
    for (const c of mine('camp')) if (c.built >= 1 && !sim.stores.poolOf(c.id)?.hq) road(h.door, c.door, 'camp' + c.id);
    for (const c of mine('lumber')) if (c.built >= 1 && !sim.stores.poolOf(c.id)?.hq) road(h.door, c.door, 'lumber' + c.id);
    // 5. smelting
    const smelters = mine('smelter');
    if (sim.unlocked.has('smelter') && (!smelters.length || (smelters.length < 3 && smelters.every((b) => b.built >= 1) && (stock.copper_ore || 0) > 120))) {
      const id = tryBuild('smelter', 'smelter', () => spot('smelter', h.fp.cx, h.fp.cy, { rMin: 30, rMax: 60, inRing: true }), 'bars');
      if (id) send({ t: 'setKeep', id, res: 'copper_bar', n: null });
    }
    // 6. planks and carts
    if (!mine('sawmill').length && (stock.timber || 0) >= 40) { const id = tryBuild('saw', 'sawmill', () => spot('sawmill', h.fp.cx, h.fp.cy, { rMin: 30, rMax: 60, inRing: true }), 'planks'); if (id) send({ t: 'setKeep', id, res: 'planks', n: 50 }); }
    if (sim.unlocked.has('cart_shed') && !mine('cart_shed').length && (!sim.unlocked.has('smelter') || smelters.length) && (stock.planks || 0) >= 24) tryBuild('shed', 'cart_shed', () => spot('cart_shed', h.fp.cx, h.fp.cy, { rMin: 30, rMax: 62, inRing: true }), 'carts');
    // 7. see further when the near copper runs low
    const cu = knownOut().filter((o) => o.res === 'copper_ore' && o.remaining > 40);
    if (cu.reduce((a, o) => a + o.remaining, 0) < 600 && sim.tick - lastMast > 3000) {
      lastMast = sim.tick;
      const ang = (mine('sensor_mast').length * 2.4) % TAU;
      tryBuild('mast' + mine('sensor_mast').length, 'sensor_mast', () => spot('sensor_mast', h.fp.cx + Math.cos(ang) * 120, h.fp.cy + Math.sin(ang) * 120, { rMax: 60 }), 'look for copper');
    }
    // 8. iron for drills, thumper, drills on deposits
    if (sim.unlocked.has('smelter') && (hud.produced.copper_bar || 0) > 40) campOn('iron_ore');
    if (sim.unlocked.has('thumper') && !mine('thumper').length) tryBuild('thumper', 'thumper', () => spot('thumper', h.fp.cx, h.fp.cy, { rMin: 70, rMax: 120 }), 'survey');
    if (sim.unlocked.has('drill')) {
      const deps = sim.survey.known().deposits.filter((d) => d.res === 'copper_ore' && d.amt > 200);
      for (const d of deps) {
        if (mine('drill').some((b) => (b.fp.cx - d.x) ** 2 + (b.fp.cy - d.y) ** 2 < d.r * d.r)) continue;
        tryBuild('drill' + d.id, 'drill', () => spot('drill', d.x, d.y, { rMax: d.r - 2 }), `deposit ${d.id}`);
        break;
      }
      if (mine('drill').length && !mine('generator').length && sim.unlocked.has('generator')) tryBuild('gen', 'generator', () => spot('generator', h.fp.cx, h.fp.cy, { rMin: 30, rMax: 62, inRing: true }), 'power');
    }
    // the smelter's iron recipe: one smelter makes iron once copper is well under way, until the drills can be built
    const sm = mine('smelter').filter((b) => b.built >= 1);
    if (sm.length >= 2 && !sim.unlocked.has('drill') && sm[1].recipe !== 'iron_bar') send({ t: 'setRecipe', id: sm[1].id, recipe: 'iron_bar' });
    if (sm.length >= 2 && sim.unlocked.has('drill') && sm[1].recipe !== 'copper_bar' && (hud.produced.iron_bar || 0) >= 40) { send({ t: 'setRecipe', id: sm[1].id, recipe: 'copper_bar' }); send({ t: 'setKeep', id: sm[1].id, res: 'copper_bar', n: null }); }
    void goal;
  }

  return { step, notes, get defence() { return defenceBot?.stats || null; } };
}

/** Play one game headless until the goal or the time cap. Returns a summary (and the sim, for tests). */
export function runBot({ seed = 7, size = 'small', minutes = 90, goal = 500, every = 100, data = loadData(), log = null, sample = 0, difficulty = 'standard', defend = true, untilGoal = true } = {}) {
  const sim = createSim(data, { seed, size, difficulty });
  const bot = createBot(sim, { goal, log, defend });
  const fights = { raids: 0, beaten: 0, breaches: 0, lost: {}, convoys: 0, atWall: 0 };
  const cap = minutes * 60 * 20;
  let reached = null;
  const curve = [];
  const jams = {};
  let busySum = 0, busyN = 0;
  while (sim.tick < cap) {
    sim.step();
    if (sim.tick % every === 0) {
      const evs = sim.drainEvents();
      bot.step(evs);
      for (const e of evs) {
        if (e.e === 'jam') jams[`${e.type}:${e.lamp}`] = (jams[`${e.type}:${e.lamp}`] || 0) + 1;
        else if (e.e === 'raidForming' && !e.guards) fights.raids++;
        else if (e.e === 'raidBeaten') fights.beaten++;
        else if (e.e === 'wallBreached') fights.breaches++;
        else if (e.e === 'raidAtWall') fights.atWall++;
        else if (e.e === 'vehicleLost') fights.convoys++;
        else if (e.e === 'destroyed' && e.by === 'raid') fights.lost[e.type] = (fights.lost[e.type] || 0) + 1;
      }
      const vs = sim.ents.list('vehicle');
      if (vs.length) { busySum += vs.filter((v) => v.job).length / vs.length; busyN++; }
      if (sample && sim.tick % sample === 0) curve.push({ min: +(sim.tick / 1200).toFixed(1), bars: sim.produced.copper_bar || 0, ore: sim.produced.copper_ore || 0 });
    }
    if (!reached && (sim.produced.copper_bar || 0) >= goal) { reached = sim.tick; if (untilGoal) break; }
    if (sim.defence.over) break;
  }
  const hud = sim.hud();
  return {
    seed, size, reached, minutes: reached ? +(reached / 1200).toFixed(1) : null, ticks: sim.tick,
    bars: sim.produced.copper_bar || 0, produced: hud.produced, stock: hud.stock,
    buildings: Object.fromEntries(Object.entries(sim.ents.list('building').reduce((a, b) => (a[b.type] = (a[b.type] || 0) + 1, a), {}))),
    roads: sim.roads.list().length, roadCells: Math.round(sim.roads.list().reduce((a, v) => a + v.len, 0)),
    porters: hud.crew.porter.n, carts: hud.crew.cart.n, busy: busyN ? +(busySum / busyN).toFixed(2) : 0,
    jams, unlocked: sim.research.done.slice(), notes: bot.notes, curve, hash: sim.hash(), sim,
    deliveries: sim.deliveries.length, paths: { ...sim.paths.stats },
    workedOut: sim.survey.outcrops.filter((o) => o.worked && o.remaining === 0).length,
    defence: { ...fights, kills: sim.defence.kills, over: !!sim.defence.over, overAt: sim.defence.over?.tick ?? null, nests: sim.ents.list('nest').length, bot: bot.defence, walls: sim.defence.walls.list().length, towers: sim.ents.list('building').filter((b) => sim.data.B[b.type].tower).length }, // M4
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const t0 = Date.now();
  const r = runBot({ seed: +arg('seed', 7), size: arg('size', 'small'), minutes: +arg('minutes', 90), log: process.argv.includes('--log') ? console.log : null });
  delete r.sim;
  console.log(JSON.stringify({ ...r, notes: r.notes.length, curve: undefined, ms: Date.now() - t0 }, null, 1));
}
