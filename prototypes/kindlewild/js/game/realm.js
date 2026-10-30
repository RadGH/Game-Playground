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
  { id: 'raid', pool: 'threat', name: 'Goblin raid', minDay: 0, weight: 3, text: 'Goblins are gathering to the {dir}!', spawn: (d) => [{ species: 'goblin', count: 5 + d * 3 }, d >= 2 ? { species: 'torchgob', count: Math.min(8, d) } : null] },
  { id: 'swarm', pool: 'threat', name: 'Mite swarm', minDay: 0, weight: 2, text: 'A swarm is boiling up in the {dir}!', spawn: (d) => [{ species: 'mite', count: 22 + d * 14, spread: 10 }] },
  { id: 'wolves', pool: 'threat', name: 'Hungry pack', minDay: 0, weight: 2, text: 'Wolves howl in the {dir}.', spawn: (d) => [{ species: 'wolf', count: 3 + d }] },
  { id: 'dry', pool: 'threat', name: 'Dry spell', minDay: 1, weight: 2, text: 'A hot wind from the {dir}. The grass is tinder-dry...', fire: true },
  { id: 'troll', pool: 'threat', name: 'Troll', minDay: 1, weight: 1, night: true, text: 'Heavy footsteps in the {dir}...', spawn: (d) => [{ species: 'troll', count: 1 + (d > 4 ? 1 : 0) }] },
  { id: 'imps', pool: 'threat', name: 'Imp rising', minDay: 2, weight: 1, text: 'Fire imps pour out of the {dir} hills!', spawn: (d) => [{ species: 'imp', count: 4 + d }] },
  { id: 'slimes', pool: 'threat', name: 'Bog slimes', minDay: 2, weight: 1, text: 'Something oozes out of the {dir} marsh.', spawn: (d) => [{ species: 'slime', count: 3 + d }] },
  { id: 'dead', pool: 'threat', name: 'Restless dead', minDay: 3, weight: 1, night: true, text: 'The dead walk in the {dir}!', spawn: (d) => [{ species: 'skeleton', count: 5 + d * 2 }] },
  { id: 'dragon', pool: 'threat', name: 'Dragon', minDay: 4, weight: 1, text: 'A great shadow wheels over the {dir}...', spawn: () => [{ species: 'dragon', count: 1, spread: 0 }] },
];
const DIRS = ['west', 'east', 'north', 'south'];

// no-one to fight: these simply happen, and a realm is better off for them (the Peaceful style is nothing but these)
export const BLESSINGS = [
  { id: 'harvest', pool: 'blessing', name: 'Good harvest', weight: 3, text: 'The barns are full this year.', bless: (s) => { for (const v of s.sim.village.list) if (v.alive) { v.food += 30; v.wood += 12; } } },
  { id: 'settlers', pool: 'blessing', name: 'Travellers', weight: 3, text: 'Travellers have heard of your realm.', bless: (s) => { const v = s.sim.village.list.find(q => q.alive); if (v) for (const c of s.spawnGroup({ species: 'villager', count: 3, at: [v.x, v.y], spread: 8 })) c.village = v.id; } },
  { id: 'rain', pool: 'blessing', name: 'Gentle rain', weight: 2, text: 'A soft rain over the fields.', bless: (s, p) => s.sim.spells.cast('rain', p.x, p.y, {}) },
  { id: 'herd', pool: 'blessing', name: 'A wandering herd', weight: 2, text: 'A herd has come to graze your land.', bless: (s, p) => { s.spawnGroup({ species: ['sheep', 'deer', 'goat', 'cow'][(s.sim.rng() * 4) | 0], count: 5, at: [p.x + 20, p.y + 10], spread: 6 }); } },
  { id: 'bloom', pool: 'blessing', name: 'Spring bloom', weight: 2, text: 'Everything is growing at once.', bless: (s, p) => s.sim.spells.cast('growth', p.x, p.y, {}) },
  { id: 'star', pool: 'blessing', name: 'Falling star', weight: 1, text: 'A star falls and your mana overflows.', bless: (s) => { s.mana.cur = s.mana.max; } },
];
// the world itself: cast a real spell at the land, close enough to matter
export const DISASTERS = [
  { id: 'dry2', pool: 'disaster', name: 'Dry spell', minDay: 0, weight: 3, text: 'A hot wind from the {dir}. The grass is tinder-dry...', fire: true },
  { id: 'storm', pool: 'disaster', name: 'Great storm', minDay: 0, weight: 3, text: 'Black clouds are piling up in the {dir}.', cast: ['storm'] },
  { id: 'gale', pool: 'disaster', name: 'Tornado', minDay: 1, weight: 2, text: 'The wind is spinning up in the {dir}.', cast: ['tornado'] },
  { id: 'quake', pool: 'disaster', name: 'Earthquake', minDay: 1, weight: 2, text: 'The ground is trembling to the {dir}.', cast: ['quake'] },
  { id: 'acid', pool: 'disaster', name: 'Acid rain', minDay: 2, weight: 2, text: 'A sour yellow cloud from the {dir}.', cast: ['acidrain'] },
  { id: 'shower', pool: 'disaster', name: 'Meteor shower', minDay: 2, weight: 2, text: 'New stars are falling in the {dir}!', cast: ['shower'] },
  { id: 'volcano', pool: 'disaster', name: 'Eruption', minDay: 4, weight: 1, text: 'The {dir} hills are smoking.', cast: ['volcano'] },
];
/** Who comes in wave n of the Wave Defense style. */
export function realmWave(n) {
  return [
    { species: 'goblin', count: 4 + n * 2 },
    n >= 2 ? { species: 'wolf', count: Math.ceil(n / 2) + 1 } : null,
    n >= 3 ? { species: 'torchgob', count: Math.min(10, n) } : null,
    n >= 5 ? { species: 'skeleton', count: n } : null,
    n >= 6 ? { species: 'imp', count: n - 2 } : null,
    n >= 8 && n % 2 === 0 ? { species: 'troll', count: Math.ceil(n / 6) } : null,
    n % 10 === 0 ? { species: 'dragon', count: 1, spread: 0 } : null,
  ];
}

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
  const style = data.gamemodes?.events?.[cfg.events] || data.gamemodes?.events?.random || { pools: ['threat'], gap: [100, 180] };
  const s = createSession(data, { mode: 'realm', W: cfg.W ?? 256, H: cfg.H ?? 256, seed: cfg.seed, recipe: cfg.recipe || 'greenvale', unlocked: cfg.unlocked, spellLevels: cfg.spellLevels, manaMax: cfg.mana.max, manaRegen: 1, manaStart: cfg.mana.max * 0.6, discovered: cfg.discovered, base: cfg.base, scaleMap: cfg.scaleMap });
  const sim = s.sim, w = sim.world;
  w.dayLength = 3600 * 2; // a realm day = 4 minutes
  w.popScale = 0.6;       // a realm runs for hours: keep the herds modest
  const R = s.realm = {
    day: 0, faith: 0, faithTotal: 0, essenceOwed: 0, omen: null, nextOmen: (style.first ?? 90) * TPS, milestones: cfg.milestones || [], handled: 0,
    mana: cfg.mana, log: [], events: cfg.events || 'random', word: style.word || 'omen', wave: 0,
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
        if ((o.until && sim.tick > o.until) || (left === 0 && o.creatures.length) || (o.fire && sim.tick > o.at + 60 * TPS && w.stats.burning === 0) || sim.tick > o.at + 150 * TPS) endOmen(o);
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

  function nextGap() {
    const [lo, hi] = style.gap;
    return (lo + sim.rng() * (hi - lo)) * TPS * Math.max(0.6, 1 - R.day * 0.04);
  }
  function planOmen() {
    const night = sim.daylight() < 0.3;
    const kind = style.pools[(sim.rng() * style.pools.length) | 0];
    const at = sim.village.list.find(v => v.alive);
    if (kind === 'blessing') {
      const pick = weighted(BLESSINGS);
      if (at) pick.bless(s, at);
      const pay = 4 + R.day;
      R.essenceOwed += pay;
      sim.fire('blessing', { name: pick.name, text: pick.text, x: at?.x, y: at?.y, essence: pay });
      R.log.unshift({ day: R.day, name: pick.name, essence: pay }); R.log.length = Math.min(R.log.length, 20);
      R.nextOmen = sim.tick + nextGap();
      return;
    }
    if (kind === 'wave') {
      R.wave++;
      const dir = DIRS[(sim.rng() * 4) | 0];
      R.omen = { id: 'wave', name: `Wave ${R.wave}`, dir, at: sim.tick + 12 * TPS, started: false, creatures: [], text: `Wave ${R.wave} is coming from the ${dir}!`, wave: R.wave, day: R.day };
      sim.fire('omen', { text: R.omen.text, name: R.omen.name, dir, warn: true });
      return;
    }
    const list = (kind === 'disaster' ? DISASTERS : OMENS).filter(o => (o.minDay ?? 0) <= R.day && (!o.night || night || R.day > 0));
    const pick = weighted(list);
    const dir = DIRS[(sim.rng() * 4) | 0];
    R.omen = { id: pick.id, name: pick.name, dir, at: sim.tick + 12 * TPS, started: false, creatures: [], text: pick.text.replace('{dir}', dir), fire: !!pick.fire, day: R.day };
    sim.fire('omen', { text: R.omen.text, name: pick.name, dir, warn: true });
  }
  function weighted(list) {
    let r = sim.rng() * list.reduce((a, o) => a + o.weight, 0);
    for (const o of list) { r -= o.weight; if (r <= 0) return o; }
    return list[0];
  }
  // on the old 256 map threats start at the map's edge; on a huge one that is minutes away, so they start within reach
  const entry = (dir) => (Math.max(w.W, w.H) > 320 ? s.edgeNear(dir) : dir);
  function startOmen(o) {
    o.started = true;
    const def = [...OMENS, ...DISASTERS].find(x => x.id === o.id) || {};
    if (o.id === 'wave') for (const g of realmWave(o.wave).filter(Boolean)) o.creatures.push(...s.spawnGroup({ ...g, at: entry(o.dir), goal: 'village' }));
    if (def.cast) {
      const v = sim.village.list.find(q => q.alive) || { x: w.W / 2, y: w.H / 2 };
      for (const id of def.cast) sim.spells.cast(id, v.x + (sim.rng() - 0.5) * 50, v.y + (sim.rng() - 0.5) * 50, {});
      o.until = sim.tick + 25 * TPS;
    }
    const scale = Math.min(10, R.day + Math.floor(R.handled / 3));
    if (def.spawn) {
      for (const g of def.spawn(scale).filter(Boolean)) {
        const out = s.spawnGroup({ ...g, at: entry(o.dir), goal: 'village' });
        o.creatures.push(...out);
      }
    }
    if (def.fire) {
      const vx = o.dir === 'west' ? 1 : o.dir === 'east' ? -1 : 0, vy = o.dir === 'north' ? 1 : o.dir === 'south' ? -1 : 0;
      w.wind.x = vx; w.wind.y = vy; w.wind.strength = 2;
      const near = entry(o.dir);
      const x = Array.isArray(near) ? near[0] : vx > 0 ? 20 : vx < 0 ? w.W - 20 : w.W / 2, y = Array.isArray(near) ? near[1] : vy > 0 ? 20 : vy < 0 ? w.H - 20 : w.H / 2;
      sim.fire('omen-fire', { x, y });
      s.terrainOp({ op: 'paint', at: [x | 0, y | 0], r: 3, mat: 'fire' });
    }
    const first = o.creatures[0];
    sim.fire('omen', { text: o.name + '!', name: o.name, start: true, x: first?.x, y: first?.y });
  }
  function endOmen(o) {
    R.handled++;
    const pay = o.wave ? 12 + o.wave * 5 + (o.wave % 10 === 0 ? 60 : 0) : 15 + o.day * 5 + (o.id === 'dragon' ? 60 : 0);
    R.essenceOwed += pay;
    sim.fire('omen-end', { name: o.name, essence: pay });
    R.log.unshift({ day: o.day, name: o.name, essence: pay });
    R.log.length = Math.min(R.log.length, 20);
    R.omen = null;
    R.nextOmen = sim.tick + nextGap();
    if (o.fire) { w.wind.strength = 1; }
  }
  R.summary = function () {
    let people = 0, animals = 0;
    for (const c of sim.creatures.list) { if (!c.alive) continue; if (c.sp.kind === 'person') people++; else if (c.sp.kind === 'animal') animals++; }
    const vs = sim.village.list.filter(v => v.alive);
    const shrines = vs.reduce((a, v) => a + v.buildings.filter(b => b.alive && b.done && b.kind === 'shrine').length, 0);
    return { people, animals, villages: vs.length, shrines, day: R.day, faith: R.faith, faithRate: sim.village.faithRate(), wave: R.wave };
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

/** The world and everything alive in it, as a plain object: shared by the Realm and every other custom game. */
export function saveWorld(s, cfg = {}) {
  const w = s.sim.world;
  const arrays = {};
  for (const k of ['mat', 'ground', 'height', 'life', 'flag']) arrays[k] = b64(rle(w[k]));
  return {
    v: 1, W: w.W, H: w.H, seed: s.seed, recipe: cfg.recipe, tick: s.sim.tick, clock: w.clock, arrays,
    mana: s.mana.cur,
    creatures: s.sim.creatures.list.filter(c => c.alive && (!c.sp.boss || c.towerBoss)).map(c => [c.sp.id, +c.x.toFixed(1), +c.y.toFixed(1), Math.round(c.hp), Math.round(c.age), +c.hunger.toFixed(2), c.sex, c.village, c.team, c.tint.cloth ? c.tint : 0, c.runner || c.towerBoss ? { max: c.maxHp, run: c.runner ? 1 : 0, breaker: c.breaker ? 1 : 0, bounty: c.bounty, leak: c.leak, boss: c.boss ? 1 : 0, towerBoss: c.towerBoss ? 1 : 0 } : 0]),
    villages: s.sim.village.list.map(v => ({ ...v, plan: null, fire: null, buildings: v.buildings.filter(b => b.done && b.alive) })),
  };
}
/** Put a saved world into a freshly made session. */
export function restoreWorld(s, o) {
  const sim = s.sim, w = sim.world;
  s.placing = null;
  for (const k of ['mat', 'ground', 'height', 'life', 'flag']) w[k].set(unrle(unb64(o.arrays[k]), w.N));
  w.temp.fill(w.M.ambient);
  w.clock = o.clock;
  w.heightVer++;
  w.wakeAll();
  // replace the freshly generated life with the saved one
  for (const c of sim.creatures.list) c.alive = false;
  sim.creatures.list.length = 0;
  for (const k of Object.keys(sim.creatures.counts)) sim.creatures.counts[k] = 0;
  sim.creatures.byId.clear();
  sim.village.list.length = 0;
  for (const v of o.villages) sim.village.list.push({ ...v, plan: null, fire: null });
  for (const [sp, x, y, hp, age, hunger, sex, village, team, tint, extra] of o.creatures) {
    const c = sim.creatures.add(sp, x | 0, y | 0, { village, team, age });
    if (!c) continue;
    c.x = x; c.y = y; c.hp = hp; c.hunger = hunger; c.sex = sex;
    if (tint) c.tint = tint;
    if (extra) { c.maxHp = extra.max; s.run?.relink?.(c, extra); }
  }
  s.mana.cur = o.mana;
}

export function saveRealm(s, cfg) {
  return JSON.stringify({ ...saveWorld(s, cfg), realm: { day: s.realm.day, faith: s.realm.faith, faithTotal: s.realm.faithTotal, milestones: s.realm.milestones, handled: s.realm.handled, nextOmen: s.realm.nextOmen - s.sim.tick, log: s.realm.log, events: s.realm.events, wave: s.realm.wave } });
}

export function loadRealm(data, str, cfg) {
  const o = JSON.parse(str);
  const s = createRealm(data, { ...cfg, W: o.W, H: o.H, seed: o.seed, recipe: o.recipe, milestones: o.realm.milestones, events: o.realm.events, base: undefined });
  restoreWorld(s, o);
  Object.assign(s.realm, { day: o.realm.day, faith: o.realm.faith, faithTotal: o.realm.faithTotal, handled: o.realm.handled, log: o.realm.log || [], wave: o.realm.wave || 0 });
  s.realm.nextOmen = s.sim.tick + Math.max(30 * TPS, o.realm.nextOmen);
  return s;
}
