// Realm mode: a world that keeps going between visits — the incremental mode.
// PURE apart from the save string (the caller writes it to storage).
//
//   * Mana regenerates, faster the more FAITH your people give (more people, shrines).
//   * Faith also pays Essence over time; milestones (population, villages, shrines) pay once.
//   * OMENS arrive on a timer, announced a little before: goblin raids, swarms, wolves, dry
//     spells, trolls at night, imps from a vent, and (from day 4) a dragon. Each one handled pays.

import { createSession } from './session.js';

const TPS = 30;

export const OMENS = [
  { id: 'raid', name: 'Goblin raid', minDay: 0, weight: 3, text: 'Goblins are gathering to the {dir}!', spawn: (d) => [{ species: 'goblin', count: 5 + d * 3 }, d >= 2 ? { species: 'torchgob', count: Math.min(8, d) } : null] },
  { id: 'swarm', name: 'Mite swarm', minDay: 0, weight: 2, text: 'A swarm is boiling up in the {dir}!', spawn: (d) => [{ species: 'mite', count: 22 + d * 14, spread: 10 }] },
  { id: 'wolves', name: 'Hungry pack', minDay: 0, weight: 2, text: 'Wolves howl in the {dir}.', spawn: (d) => [{ species: 'wolf', count: 3 + d }] },
  { id: 'dry', name: 'Dry spell', minDay: 1, weight: 2, text: 'A hot wind from the {dir}. The grass is tinder-dry...', fire: true },
  { id: 'troll', name: 'Troll', minDay: 1, weight: 1, night: true, text: 'Heavy footsteps in the {dir}...', spawn: (d) => [{ species: 'troll', count: 1 + (d > 4 ? 1 : 0) }] },
  { id: 'imps', name: 'Imp rising', minDay: 2, weight: 1, text: 'Fire imps pour out of the {dir} hills!', spawn: (d) => [{ species: 'imp', count: 4 + d }] },
  { id: 'slimes', name: 'Bog slimes', minDay: 2, weight: 1, text: 'Something oozes out of the {dir} marsh.', spawn: (d) => [{ species: 'slime', count: 3 + d }] },
  { id: 'dead', name: 'Restless dead', minDay: 3, weight: 1, night: true, text: 'The dead walk in the {dir}!', spawn: (d) => [{ species: 'skeleton', count: 5 + d * 2 }] },
  { id: 'dragon', name: 'Dragon', minDay: 4, weight: 1, text: 'A great shadow wheels over the {dir}...', spawn: () => [{ species: 'dragon', count: 1, spread: 0 }] },
];
const DIRS = ['west', 'east', 'north', 'south'];

export const MILESTONES = [
  { id: 'pop10', text: '10 people in your realm', test: (r) => r.people >= 10, essence: 15 },
  { id: 'pop25', text: '25 people in your realm', test: (r) => r.people >= 25, essence: 30 },
  { id: 'pop50', text: '50 people in your realm', test: (r) => r.people >= 50, essence: 60 },
  { id: 'pop100', text: '100 people in your realm', test: (r) => r.people >= 100, essence: 120 },
  { id: 'vil2', text: 'A second village', test: (r) => r.villages >= 2, essence: 25 },
  { id: 'vil4', text: 'Four villages', test: (r) => r.villages >= 4, essence: 60 },
  { id: 'shrine', text: 'Your first shrine', test: (r) => r.shrines >= 1, essence: 20 },
  { id: 'day3', text: 'Three days and nights', test: (r) => r.day >= 3, essence: 20 },
  { id: 'day10', text: 'Ten days and nights', test: (r) => r.day >= 10, essence: 60 },
  { id: 'herd50', text: '50 animals roam your land', test: (r) => r.animals >= 50, essence: 20 },
];

export function createRealm(data, cfg) {
  const s = createSession(data, { mode: 'realm', W: cfg.W ?? 256, H: cfg.H ?? 256, seed: cfg.seed, recipe: cfg.recipe || 'greenvale', unlocked: cfg.unlocked, spellLevels: cfg.spellLevels, manaMax: cfg.mana.max, manaRegen: 1, manaStart: cfg.mana.max * 0.6, discovered: cfg.discovered });
  const sim = s.sim, w = sim.world;
  w.dayLength = 3600 * 2; // a realm day = 4 minutes
  w.popScale = 0.6;       // a realm runs for hours: keep the herds modest
  const R = s.realm = {
    day: 0, faith: 0, faithTotal: 0, essenceOwed: 0, omen: null, nextOmen: 90 * TPS, milestones: cfg.milestones || [], handled: 0,
    mana: cfg.mana, log: [],
  };
  let lastClock = w.clock;
  s.onStep = () => {
    if (w.clock < lastClock) R.day++;
    lastClock = w.clock;
    const faithRate = sim.village.faithRate() * (cfg.mana.faithScale ?? 1);   // people, shrines count more
    s.mana.regen = (1.2 + faithRate * 0.05) * (cfg.mana.regenScale ?? 1);
    s.mana.max = cfg.mana.max;
    if (sim.tick % TPS === 0) {
      const f = faithRate * 0.012;
      R.faith += f; R.faithTotal += f;
      R.essenceOwed += f * 0.6;
    }
    // omens
    if (R.omen) {
      const o = R.omen;
      if (!o.started && sim.tick >= o.at) startOmen(o);
      if (o.started) {
        const left = o.creatures.filter(c => c.alive).length;
        o.left = left;
        if ((left === 0 && o.creatures.length) || (o.fire && sim.tick > o.at + 60 * TPS && w.stats.burning === 0) || sim.tick > o.at + 150 * TPS) endOmen(o);
      }
    } else if (sim.tick >= R.nextOmen) planOmen();
    if (sim.tick % (5 * TPS) === 0) checkMilestones();
    // settlers: a realm that is nearly empty draws newcomers looking for land
    if (sim.tick % (90 * TPS) === 0 && sim.tick > 0) {
      const sum = R.summary();
      if (sum.people < 6) {
        const v = sim.village.list.find(x => x.alive);
        const edge = ['west', 'east', 'north', 'south'][(sim.rng() * 4) | 0];
        const out = s.spawnGroup({ species: 'villager', count: 3, at: edge, spread: 3 });
        if (v) for (const c of out) { c.village = v.id; }
        else if (out[0]) { const nv = sim.village.found(out[0].x | 0, out[0].y | 0, { people: 0, prebuilt: ['cottage', 'farm'], food: 40, wood: 20, stone: 6 }); for (const c of out) c.village = nv.id; }
        sim.fire('milestone', { text: 'Settlers have arrived', essence: 0 });
      }
    }
  };

  function planOmen() {
    const night = sim.daylight() < 0.3;
    const pool = OMENS.filter(o => o.minDay <= R.day && (!o.night || night || R.day > 0));
    let tot = pool.reduce((a, o) => a + o.weight, 0), r = sim.rng() * tot;
    let pick = pool[0];
    for (const o of pool) { r -= o.weight; if (r <= 0) { pick = o; break; } }
    const dir = DIRS[(sim.rng() * 4) | 0];
    R.omen = { id: pick.id, name: pick.name, dir, at: sim.tick + 12 * TPS, started: false, creatures: [], text: pick.text.replace('{dir}', dir), fire: !!pick.fire, day: R.day };
    sim.fire('omen', { text: R.omen.text, name: pick.name, dir, warn: true });
  }
  function startOmen(o) {
    o.started = true;
    const def = OMENS.find(x => x.id === o.id);
    const scale = Math.min(10, R.day + Math.floor(R.handled / 3));
    if (def.spawn) {
      for (const g of def.spawn(scale).filter(Boolean)) {
        const out = s.spawnGroup({ ...g, at: o.dir, goal: 'village' });
        o.creatures.push(...out);
      }
    }
    if (def.fire) {
      const vx = o.dir === 'west' ? 1 : o.dir === 'east' ? -1 : 0, vy = o.dir === 'north' ? 1 : o.dir === 'south' ? -1 : 0;
      w.wind.x = vx; w.wind.y = vy; w.wind.strength = 2;
      const x = vx > 0 ? 20 : vx < 0 ? w.W - 20 : w.W / 2, y = vy > 0 ? 20 : vy < 0 ? w.H - 20 : w.H / 2;
      sim.fire('omen-fire', { x, y });
      s.terrainOp({ op: 'paint', at: [x | 0, y | 0], r: 3, mat: 'fire' });
    }
    const first = o.creatures[0];
    sim.fire('omen', { text: o.name + '!', name: o.name, start: true, x: first?.x, y: first?.y });
  }
  function endOmen(o) {
    R.handled++;
    const pay = 15 + o.day * 5 + (o.id === 'dragon' ? 60 : 0);
    R.essenceOwed += pay;
    sim.fire('omen-end', { name: o.name, essence: pay });
    R.log.unshift({ day: o.day, name: o.name, essence: pay });
    R.log.length = Math.min(R.log.length, 20);
    R.omen = null;
    R.nextOmen = sim.tick + (100 + sim.rng() * 80) * TPS * Math.max(0.6, 1 - R.day * 0.04);
    if (o.fire) { w.wind.strength = 1; }
  }
  R.summary = function () {
    let people = 0, animals = 0;
    for (const c of sim.creatures.list) { if (!c.alive) continue; if (c.sp.kind === 'person') people++; else if (c.sp.kind === 'animal') animals++; }
    const vs = sim.village.list.filter(v => v.alive);
    const shrines = vs.reduce((a, v) => a + v.buildings.filter(b => b.alive && b.done && b.kind === 'shrine').length, 0);
    return { people, animals, villages: vs.length, shrines, day: R.day, faith: R.faith, faithRate: sim.village.faithRate() };
  };
  function checkMilestones() {
    const sum = R.summary();
    for (const m of MILESTONES) {
      if (R.milestones.includes(m.id) || !m.test(sum)) continue;
      R.milestones.push(m.id);
      R.essenceOwed += m.essence;
      sim.fire('milestone', { text: m.text, essence: m.essence });
    }
  }
  /** Essence earned since the last call (the game adds it to the save). */
  R.collect = function () { const n = Math.floor(R.essenceOwed); R.essenceOwed -= n; return n; };
  return s;
}

// ---------- saving the world ----------

function rle(arr) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v && n < 255) n++;
    out.push(n, v);
    i += n;
  }
  return Uint8Array.from(out);
}
function unrle(bytes, len) {
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < bytes.length; i += 2) { out.fill(bytes[i + 1], o, o + bytes[i]); o += bytes[i]; }
  return out;
}
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

export function saveRealm(s, cfg) {
  const w = s.sim.world;
  const arrays = {};
  for (const k of ['mat', 'ground', 'height', 'life', 'flag']) arrays[k] = b64(rle(w[k]));
  return JSON.stringify({
    v: 1, W: w.W, H: w.H, seed: s.seed, recipe: cfg.recipe, tick: s.sim.tick, clock: w.clock, arrays,
    mana: s.mana.cur, realm: { day: s.realm.day, faith: s.realm.faith, faithTotal: s.realm.faithTotal, milestones: s.realm.milestones, handled: s.realm.handled, nextOmen: s.realm.nextOmen - s.sim.tick, log: s.realm.log },
    creatures: s.sim.creatures.list.filter(c => c.alive && !c.sp.boss).map(c => [c.sp.id, +c.x.toFixed(1), +c.y.toFixed(1), Math.round(c.hp), Math.round(c.age), +c.hunger.toFixed(2), c.sex, c.village, c.team, c.tint.cloth ? c.tint : 0]),
    villages: s.sim.village.list.map(v => ({ ...v, plan: null, fire: null, buildings: v.buildings.filter(b => b.done && b.alive) })),
  });
}

export function loadRealm(data, str, cfg) {
  const o = JSON.parse(str);
  const s = createRealm(data, { ...cfg, W: o.W, H: o.H, seed: o.seed, recipe: o.recipe, milestones: o.realm.milestones });
  const sim = s.sim, w = sim.world;
  for (const k of ['mat', 'ground', 'height', 'life', 'flag']) w[k].set(unrle(unb64(o.arrays[k]), w.N));
  w.temp.fill(w.M.ambient);
  w.clock = o.clock;
  w.heightVer++;
  w.wakeAll();
  // replace the freshly generated life with the saved one
  for (const c of sim.creatures.list) c.alive = false;
  sim.creatures.list.length = 0;
  for (const k of Object.keys(sim.creatures.counts)) sim.creatures.counts[k] = 0;
  sim.village.list.length = 0;
  for (const v of o.villages) sim.village.list.push({ ...v, plan: null, fire: null });
  for (const [sp, x, y, hp, age, hunger, sex, village, team, tint] of o.creatures) {
    const c = sim.creatures.add(sp, x | 0, y | 0, { village, team, age });
    if (!c) continue;
    c.x = x; c.y = y; c.hp = hp; c.hunger = hunger; c.sex = sex;
    if (tint) c.tint = tint;
  }
  s.mana.cur = o.mana;
  Object.assign(s.realm, { day: o.realm.day, faith: o.realm.faith, faithTotal: o.realm.faithTotal, handled: o.realm.handled, log: o.realm.log || [] });
  s.realm.nextOmen = sim.tick + Math.max(30 * TPS, o.realm.nextOmen);
  return s;
}
