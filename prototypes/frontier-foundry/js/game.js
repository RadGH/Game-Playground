// Frontier Foundry - the engine. No DOM, no canvas, no timers: you call tick(dt) and read state.
//
//   import { Game } from './game.js';
//   import { loadData } from './data.js';
//   const game = await Game.create({ seed: 7, difficulty: 'normal' });
//   game.scan(game.hq().x, game.hq().y, 30);
//   game.place('drill_mk1', x, y);
//   for (let i = 0; i < 3600; i++) game.tick(1);
//
// The loop it runs: land -> scan -> mine -> haul -> refine -> build -> research -> explore ->
// defend -> launch -> next planet. Each of those is a module; this file wires them together and
// owns the state.

import { loadData } from './data.js';
import { DIFFICULTY, daylight, isNight, BALANCE } from './rules.js';
import { createLocalMap, scanArea, findLandingSite, ensureStarterNodes, tickRegrow, findPath, costField } from './map.js';
import { createFog, recomputeVisible, reveal, exploredFraction, packFog, unpackFog } from './fog.js';
import { place, canPlace, demolish, cancel, tickBuilders, tickOrders, available, takeCost, pendingBuilds, stamp, footprint } from './build.js';
import { recomputeLinks, recomputePower, rebuildPoolTotals, tickPower, tickExtraction, tickProduction, tickRepair, push, pull, visible, load, space } from './production.js';
import { addRoute, removeRoute, tickLogistics, estimateTrip, replanRoutes, vehiclesFor, garageFor, upgradeVehicle, nextTier } from './logistics.js';
import { tickResearch, startResearch, canResearch, availableTechs, completeResearch, grantResearch } from './research.js';
import { seedNests, tickThreat, tickCombat, tickArtillery, tickShields, spawnWave, damageNest, damageEnemy } from './combat.js';
import * as Space from './space.js';
import { localPlanets, makePlanet, generatePlanetMap, ARCHETYPES } from './planets.js';
import { makeRng, subSeed } from '../../../worldgen/js/noise.js';

const IDX = (map, x, y) => (y | 0) * map.width + (x | 0);

export class Game {
  /**
   * Start a run. Everything is optional; with no arguments you get a seeded temperate world.
   * opts: { seed, difficulty, planet, planets, world, data, size, site, nests, autoQuests }
   */
  static async create(opts = {}) {
    const data = opts.data || await loadData();
    return Game.createSync({ ...opts, data });
  }

  /** Same thing, but for callers that already have the data bundle (tests, the sim, a second planet). */
  static createSync(opts = {}) {
    const g = new Game(opts);
    g.setup(opts);
    return g;
  }

  constructor({ seed = 1, difficulty = 'normal', data, planets = null, beaconsToWin = Space.BEACONS_TO_WIN } = {}) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.data = data;
    this.difficulty = DIFFICULTY[difficulty] ? difficulty : 'normal';
    this.diff = DIFFICULTY[this.difficulty];
    this.planets = planets || localPlanets(data.resources, seed, 5);
    this.beaconsToWin = beaconsToWin;

    this.time = 0; this.ticks = 0; this.accum = 0;
    this.nextId = 1;
    this.structures = []; this.units = []; this.vehicles = []; this.routes = [];
    this.enemies = []; this.nests = []; this.waves = []; this.currentWave = null;
    this.blocking = new Set();
    this.networks = [];
    this.notifications = [];
    this.research = { done: [], current: null, progress: 0, consumed: {}, bank: 0 };
    this.quests = { active: [], done: [], counters: {} };
    this.space = { satellites: 0, probes: [], surveyed: [], rocketReady: false, launched: null, stationModules: 0, station: false, beacons: [] };
    this.exploredRegions = [];
    this.pendingSurveys = [];
    this.threat = 0; this.pollution = 0; this.noise = 0;
    this.waveNumber = 0; this.nextWaveAt = null;
    this.hazard = null;
    this.flags = {};
    this.dirty = { power: true, links: true, routes: false };
    this.unlocked = null;
    this.won = false; this.lost = false;
    this.listeners = {};
    this.stats = {
      built: 0, lost: 0, crafted: 0, hauled: 0, kills: 0, crewLost: 0, wavesCleared: 0,
      nestsKilled: 0, damageDealt: 0, damageTaken: 0, researchSpent: 0, produced: {}, scanned: 0,
      power: { gen: 0, use: 0, satisfaction: 1 },
      history: [],
    };
  }

  /** Build the planet, the world, the local map and the landing pod. */
  setup(opts = {}) {
    this.planet = opts.planet || this.planets.list()[0] || makePlanet({ id: 'p1', seed: this.seed, archetype: 'temperate', resourceTable: this.data.resources });
    if (!this.planets.get(this.planet.id)) { const list = this.planets.list; this.planets = { list: () => [this.planet, ...list()], get: id => (id === this.planet.id ? this.planet : this.planets_get_fallback(id, list)), generateMap: p => generatePlanetMap(p) }; }
    this.world = opts.world || this.planets.generateMap(this.planet);
    const site = opts.site || pickWorldCell(this.world, this.rng);
    this.worldCell = site;
    this.map = createLocalMap({ world: this.world, wx: site.x, wy: site.y, planet: this.planet, data: this.data, size: opts.size ?? 128, nodeDensity: opts.nodeDensity ?? 1 });
    this.map.blocking = this.blocking;
    this.fog = createFog(this.map);

    const landing = opts.landing || findLandingSite(this.map, { footprint: 4 });
    ensureStarterNodes(this.map, this.data, { x: landing.x + 2, y: landing.y + 2 }, this.rng,
      { need: ['iron_ore', this.planet.resources.includes('coal') ? 'coal' : 'biomass', 'copper_ore', 'stone'] });
    let podOut = place(this, 'landing_pod', landing.x, landing.y, { free: true });
    if (!podOut.ok) {
      // the scored site was not actually legal - take the first legal 4x4 anywhere on the tile
      outer: for (let y = 2; y < this.map.height - 6; y++) for (let x = 2; x < this.map.width - 6; x++) {
        if (!canPlace(this, 'landing_pod', x, y, { ignoreCost: true, ignoreUnlock: true }).ok) continue;
        landing.x = x; landing.y = y;
        podOut = place(this, 'landing_pod', x, y, { free: true });
        if (podOut.ok) break outer;
      }
    }
    if (!podOut.ok) throw new Error('nowhere to land on this tile: ' + podOut.reason);
    const pod = podOut.structure;
    this.hqId = pod.id;
    Object.assign(pod.inv, opts.startInventory || { iron_plate: 150, gear: 70, copper_wire: 80, stone: 220, coal: 150, iron_ore: 80, concrete: 40 });
    for (const [res, n] of Object.entries(opts.cargo || {})) pod.inv[res] = (pod.inv[res] || 0) + n;

    for (const id of opts.research || ['t_landfall']) if (!this.research.done.includes(id)) this.research.done.push(id);
    if (!this.research.done.includes('t_landfall')) this.research.done.unshift('t_landfall');

    for (let i = 0; i < (opts.crew ?? 4); i++) this.spawnUnit('builder', landing.x + 1 + (i % 3), landing.y + 5);
    recomputeLinks(this); recomputePower(this);
    reveal(this.fog, pod.x + 2, pod.y + 2, 24);
    this.scan(pod.x + 2, pod.y + 2, 30);
    if (opts.nests !== false) seedNests(this, opts.nests === true ? null : opts.nests);
    if (opts.autoQuests !== false) this.offerQuests();
    this.notify('landed', { planet: this.planet.name, n: this.units.length, at: { x: pod.x, y: pod.y } });
    this.emit('landed', { planet: this.planet });
    return this;
  }

  planets_get_fallback(id, list) { return list().find(p => p.id === id) || null; }

  // ------------------------------------------------------------ small helpers
  /**
   * Structures by id, through a map that is thrown away whenever one is built or removed.
   * pull() and push() call this once per linked store per machine per tick, so on a 400-building
   * base the old linear scan was most of the simulator's running time.
   */
  byId(id) {
    if (!this._idx) this._idx = new Map(this.structures.map(s => [s.id, s]));
    return this._idx.get(id) || null;
  }
  dropIndex() { this._idx = null; }
  hq() { return this.byId(this.hqId); }
  nodeById(id) {
    if (!this._nodeIdx || this._nodeIdx.size !== this.map.nodes.length) this._nodeIdx = new Map(this.map.nodes.map(n => [n.id, n]));
    return this._nodeIdx.get(id) || null;
  }
  get daylight() { return daylight(this.time, this.planet.dayLength); }
  get isNight() { return isNight(this.time, this.planet.dayLength); }
  planetHas(elementId) { return (this.planet.resources || []).includes(elementId) || (this.planet.rareElements || []).includes(elementId); }

  /** Is a structure / recipe / vehicle / unit researched? */
  isUnlocked(id) {
    if (!this.unlocked) {
      this.unlocked = new Set();
      for (const t of this.research.done) for (const u of this.data.tech[t]?.unlocks || []) this.unlocked.add(u);
    }
    return this.unlocked.has(id);
  }

  /** Multiply every researched effect of this name together. */
  techEffect(key, base = 1) {
    let v = base;
    for (const t of this.research.done) { const e = this.data.tech[t]?.effects; if (e && e[key] != null) v *= e[key]; }
    return v;
  }

  /** How much faster builders work near this spot. */
  workshopBonusAt(x, y) {
    let b = 0;
    for (const s of this.structures) {
      if (s.state !== 'done' || !s.def.buildSpeedBonus) continue;
      if (Math.hypot(s.x - x, s.y - y) <= (s.def.linkRadius || 6) + 6) b = Math.max(b, s.def.buildSpeedBonus);
    }
    return b;
  }

  /** Weather multiplier for a wind turbine or storm tap. */
  weatherPower(def) {
    const wind = this.hazardEffect('windBonus', 0);
    if (wind > 0) return def.stormBonus || wind;
    const base = 0.55 + Math.sin(this.time / 220) * 0.35;
    return Math.max(0.15, base);
  }

  /**
   * One value out of the running hazard's definition, or `fallback` when nothing is running.
   * Every hazard effect in the engine goes through here, so `data/balance.json -> hazards` is the
   * only place weather is tuned.
   */
  hazardEffect(key, fallback = 0) {
    if (!this.hazard) return fallback;
    const def = BALANCE.hazards?.[this.hazard.type];
    const v = def?.[key];
    return v == null ? fallback : v;
  }
  /** Multiplier on solar output right now: ash, dust and cloud all cut it. */
  hazardSolar() { return 1 - this.hazardEffect('solarPenalty', 0); }
  /** Multiplier on crafting speed right now: heat and pressure both slow machines down. */
  hazardMachineSpeed() { return 1 - this.hazardEffect('machineSlow', 0); }
  /** Extra kW per building a heater draws while a deep cold is running. */
  hazardPowerDraw() { return this.hazardEffect('coldDrain', 0); }
  /** Is this structure inside a filter or shelter bubble of one of these types? */
  coveredBy(s, types, radius) {
    if (!types || !types.length) return false;
    for (const t of this.structures) {
      if (t.state !== 'done' || !types.includes(t.type)) continue;
      if (Math.hypot((t.x + t.w / 2) - (s.x + (s.w || 0) / 2), (t.y + t.h / 2) - (s.y + (s.h || 0) / 2)) <= radius) return true;
    }
    return false;
  }

  /** Put a crew member on the map. */
  spawnUnit(typeId, x, y) {
    const def = this.data.unit[typeId];
    if (!def) return null;
    if (this.crewUsed() + (def.crew || 1) > this.crewCap()) return null;
    const u = { id: this.nextId++, type: typeId, def, x, y, hp: def.hp, maxHp: def.hp, alive: true, job: def.buildRate ? 'build' : 'guard', target: null };
    this.units.push(u);
    return u;
  }
  crewCap() { return 4 + this.structures.filter(s => s.state === 'done' && s.def.crew).reduce((a, s) => a + s.def.crew, 0) + this.structures.filter(s => s.state === 'done' && s.type === 'builder_yard').length * 2; }
  crewUsed() { return this.units.filter(u => u.alive).reduce((a, u) => a + (u.def.crew || 1), 0); }

  // ------------------------------------------------------------ events and notifications
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this.listeners[ev] = (this.listeners[ev] || []).filter(f => f !== fn); }
  emit(ev, payload) { for (const f of this.listeners[ev] || []) { try { f(payload); } catch {} } for (const f of this.listeners['*'] || []) { try { f({ type: ev, payload }); } catch {} } }

  /** Raise a message from notifications.json. Returns the notification object. */
  notify(type, payload = {}) {
    const tpl = this.data.notifications[type];
    if (!tpl) return null;
    const text = String(tpl.text).replace(/\{(\w+)\}/g, (_, k) => (payload[k] != null ? String(payload[k]) : ''));
    const n = { type, text, at: payload.at || null, importance: tpl.importance, icon: tpl.icon, jumpTo: tpl.jumpTo ? payload.at || null : null, time: this.time, id: this.nextId++ };
    this.notifications.push(n);
    if (this.notifications.length > 400) this.notifications.shift();
    this.emit('notify', n);
    return n;
  }
  /** The unread messages, most important first. */
  unread(min = 1) { return this.notifications.filter(n => !n.seen && n.importance >= min).sort((a, b) => b.importance - a.importance); }
  markSeen(id = null) { for (const n of this.notifications) if (id == null || n.id === id) n.seen = true; }

  // ------------------------------------------------------------ player actions
  /** Sweep an area for hidden nodes. Returns the nodes it found. */
  scan(x, y, r = 20) {
    const found = scanArea(this.map, x, y, r);
    this.stats.scanned += found.length;
    const scarce = new Set(this.planet.scarce || []);
    for (const n of found) {
      const res = this.data.resource[n.resource];
      if (res.kind === 'rare') {
        this.notify('rare_found', { resource: res.name, n: n.amount, at: { x: n.x, y: n.y } });
        // a rare element is also a research node and a building nothing else on the run can have
        const tech = this.data.techs.find(t => t.planetRequirement === n.resource);
        if (tech && !this.flags['element:' + n.resource]) {
          this.flags['element:' + n.resource] = true;
          this.notify('element_available', { resource: res.name, name: tech.name });
        }
      } else if (scarce.has(n.resource)) this.notify('scarce_found', { resource: res.name, n: Math.round(n.amount), at: { x: n.x, y: n.y } });
      else this.notify('node_found', { resource: res.name, n: n.amount, at: { x: n.x, y: n.y } });
    }
    if (found.length) this.emit('scan', { found });
    return found;
  }
  place(typeId, x, y, opts) { return place(this, typeId, x, y, opts); }
  canPlace(typeId, x, y, opts) { return canPlace(this, typeId, x, y, opts); }
  removeStructure(id, opts) { return demolish(this, id, opts); }
  cancelBuild(id) { return cancel(this, id); }
  setRecipe(id, recipeId) { const s = this.byId(id); if (!s) return false; if (recipeId && !(this.data.recipesFor[s.type] || []).includes(recipeId)) return false; s.recipe = recipeId; s.crafting = false; s.craft = 0; return true; }
  toggle(id, on = null) { const s = this.byId(id); if (!s) return false; s.enabled = on == null ? !s.enabled : !!on; return s.enabled; }
  addRoute(spec) { return addRoute(this, spec); }
  removeRoute(id) { return removeRoute(this, id); }
  estimateTrip(route) { return estimateTrip(this, typeof route === 'object' ? route : this.routes.find(r => r.id === route)); }
  /** Buy the next tier for one truck. `{ ok, tier, capacity }` or a plain-language reason. */
  upgradeVehicle(id) { return upgradeVehicle(this, id); }
  /** What the next tier for this truck would cost, or null if it is at the top. */
  vehicleUpgrade(id) { const v = this.vehicles.find(x => x.id === id); return v ? nextTier(this, v) : null; }
  startResearch(id) { return startResearch(this, id); }
  canResearch(id) { return canResearch(this, id); }
  availableTechs() { return availableTechs(this); }
  available(res) { return available(this, res); }
  /** Everything in every store, added up. */
  inventory() {
    const total = {};
    for (const s of this.structures) if (s.state === 'done') for (const [r, n] of Object.entries(s.inv)) total[r] = (total[r] || 0) + n;
    return total;
  }
  /** What a build screen should list right now. */
  buildable() { return this.data.structures.filter(s => this.isUnlocked(s.id) && (!s.planetRequirement || this.planetHas(s.planetRequirement))); }

  /**
   * What is on a tile, for a click on the map. Returns the most interesting thing first: an enemy or
   * one of your own movers standing on it, then the building, then the nest, then the resource patch.
   * `{ kind: 'structure'|'unit'|'vehicle'|'enemy'|'nest'|'node'|'tile', ... }` - never null.
   */
  selectAt(x, y, { radius = 1.2 } = {}) {
    const tx = Math.floor(x), ty = Math.floor(y);
    const near = (a) => Math.hypot(a.x - x, a.y - y) <= radius;
    for (const e of this.enemies) if (e.alive && near(e)) return { kind: 'enemy', enemy: e, x: e.x, y: e.y };
    for (const u of this.units) if (u.alive && near(u)) return { kind: 'unit', unit: u, x: u.x, y: u.y };
    for (const v of this.vehicles) if (v.alive && near(v)) return { kind: 'vehicle', vehicle: v, x: v.x, y: v.y };
    if (tx >= 0 && ty >= 0 && tx < this.map.width && ty < this.map.height) {
      const id = this.map.occupied[ty * this.map.width + tx];
      if (id >= 0) { const s = this.byId(id); if (s) return { kind: 'structure', structure: s, x: tx, y: ty }; }
    }
    for (const n of this.nests) if (n.alive && n.known && Math.hypot(n.x - x, n.y - y) <= 2.5) return { kind: 'nest', nest: n, x: n.x, y: n.y };
    const k = tx >= 0 && ty >= 0 && tx < this.map.width && ty < this.map.height ? this.map.nodeAt[ty * this.map.width + tx] : -1;
    const node = k >= 0 ? this.map.nodes[k] : null;
    if (node && node.scanned) return { kind: 'node', node, x: node.x, y: node.y };
    return { kind: 'tile', x: tx, y: ty };
  }

  /** The tiles a structure type would cover at this facing - the interface draws its ghost from this. */
  footprint(typeId, rot = 0) { const def = this.data.structure[typeId]; return def ? footprint(def, rot) : { w: 1, h: 1 }; }

  // space
  launchSatellite() { return Space.launchSatellite(this); }
  launchProbe(planetId) { return Space.launchProbe(this, planetId); }
  rocketStatus() { return Space.rocketStatus(this); }
  assembleRocket() { return Space.assembleRocket(this); }
  launchRocket(spec) { return Space.launchRocket(this, spec); }
  stationStatus() { return Space.stationStatus(this); }
  liftStationModule() { return Space.liftStationModule(this); }

  /** Start the next planet from a launch. Returns a brand new Game carrying the hold. */
  static land(transfer, { data, planets = null, world = null, size = 96 } = {}) {
    const target = (planets || localPlanets(data.resources, transfer.seed, 5)).get(transfer.to);
    const g = Game.createSync({
      seed: transfer.seed, difficulty: transfer.difficulty, data, planets, world, size,
      planet: target, cargo: transfer.cargo, research: transfer.research, crew: transfer.crew,
    });
    g.space.beacons = [...(transfer.beacons || [])];
    g.space.stationModules = transfer.stationModules || 0;
    g.space.station = g.space.stationModules >= Space.STATION_MODULES;
    g.space.surveyed = [...(transfer.surveyed || [])];
    g.arrivedFrom = transfer.from;
    return g;
  }

  /** Send a scout to a neighbouring region. It takes a while and comes back with intel. */
  exploreRegion(regionId) {
    const region = this.world.regions[regionId];
    if (!region) return { ok: false, reason: 'no such region' };
    if (this.exploredRegions.includes(regionId)) return { ok: false, reason: 'already explored' };
    if (this.pendingSurveys.some(s => s.regionId === regionId)) return { ok: false, reason: 'scouts already on the way' };
    const scout = this.units.find(u => u.alive && u.type === 'scout');
    const skimmer = this.vehicles.find(v => v.alive && v.type === 'skimmer');
    if (!scout && !skimmer) return { ok: false, reason: 'no scout or skimmer available' };
    const dist = Math.hypot(region.center.x - this.worldCell.x, region.center.y - this.worldCell.y);
    const speed = skimmer ? 0.012 : 0.006;
    this.pendingSurveys.push({ regionId, doneAt: this.time + Math.max(60, dist / speed / 10) });
    return { ok: true, eta: this.pendingSurveys[this.pendingSurveys.length - 1].doneAt - this.time };
  }

  /** Regions you could send scouts to, nearest first. */
  knownRegions() {
    const here = this.world.region[IDX(this.world, this.worldCell.x, this.worldCell.y)];
    const set = new Set([here, ...(this.world.regions[here]?.neighbours || [])]);
    for (const r of this.exploredRegions) for (const n of this.world.regions[r]?.neighbours || []) set.add(n);
    return [...set].filter(i => i >= 0).map(i => this.world.regions[i]).filter(Boolean);
  }

  lose() {
    if (this.lost) return;
    this.lost = true;
    this.notify('defeat', { planet: this.planet.name, at: { x: this.hq()?.x ?? 0, y: this.hq()?.y ?? 0 } });
    this.emit('defeat', {});
  }

  // ------------------------------------------------------------ the tick
  /** Advance the world. dt is game seconds; it is broken into fixed one-second steps. */
  tick(dt = 1) {
    this.accum += dt;
    let steps = 0;
    while (this.accum >= 1 && steps < 600) { this.step(1); this.accum -= 1; steps++; }
    return this;
  }

  /** One fixed second. Everything in here is deterministic given the seed. */
  step(dt) {
    if (this.lost || this.won) { this.time += dt; return; }
    this.time += dt; this.ticks++;

    if (this.dirty.links) recomputeLinks(this); else rebuildPoolTotals(this);
    tickOrders(this, dt);
    tickBuilders(this, dt);
    tickPower(this, dt);
    tickExtraction(this, dt);
    tickProduction(this, dt);
    tickLogistics(this, dt);
    tickResearch(this, dt);
    tickRepair(this, dt);
    tickShields(this, dt);
    tickThreat(this, dt);
    tickCombat(this, dt);
    tickArtillery(this, dt);
    Space.tickSpace(this, dt);

    if (this.ticks % 4 === 0) this.tickScanners(dt * 4);
    if (this.ticks % 5 === 0) { recomputeVisible(this); this.checkQuests(); this.checkAlarms(); }
    if (this.ticks % 10 === 0) { tickRegrow(this.map, dt * 10, this.techEffect('regrowRate', 1)); this.tickHazards(dt * 10); this.tickSurveys(); }
    if (this.ticks % 60 === 0) this.snapshot();
    if (this.structures.some(s => s.state === 'done' && s.def.victoryPoint) && !this.space.beacons.includes(this.planet.id)) Space.lightBeacon(this);
  }

  /** Radars and scanner towers sweep on their own timer. */
  tickScanners(dt) {
    for (const s of this.structures) {
      if (s.state !== 'done' || !s.def.scanRadius) continue;
      if (s.def.powerUse && s.powered < 0.3) continue;
      if (this.time - s.lastScan < (s.def.scanPeriod || 20)) continue;
      s.lastScan = this.time;
      const r = s.def.scanRadius * this.techEffect('scanRadius', 1);
      this.scan(s.x + s.w / 2, s.y + s.h / 2, r);
      if (!s.def.nodeOnly) reveal(this.fog, s.x + s.w / 2, s.y + s.h / 2, r * 0.6);
      for (const n of this.nests) {
        if (n.alive && !n.known && Math.hypot(n.x - s.x, n.y - s.y) <= r) {
          n.known = true;
          this.notify('nest_found', { n: Math.round(Math.hypot(n.x - s.x, n.y - s.y)), at: { x: n.x, y: n.y } });
        }
      }
    }
  }

  /**
   * Weather. Each planet hazard tag can fire, run for a while, and pass. What each one does is in
   * data/balance.json -> hazards: storms damage anything not under a shield, deep cold makes every
   * building draw a heater's worth of power and chews up whatever is unpowered, radiation hurts
   * crew who are not near a dormitory or med bay, and a toxic front corrodes everything outside a
   * filter's reach. All of them raise a notification going in and hazard_over coming out.
   */
  tickHazards(dt) {
    const H = BALANCE.hazards || {};
    if (this.hazard) {
      if (this.time >= this.hazard.until) {
        this.hazard = null;
        this.hazardQuietUntil = this.time + (H.clock?.quietAfter ?? 260);
        this.notify('hazard_over', {});
        this.emit('hazard:over', {});
        return;
      }
      const def = H[this.hazard.type] || {};
      const hq = this.hq();
      if (def.structureDamage) {
        const shielded = def.shieldedBy === 'shield';
        for (const s of this.structures) {
          if (s.state !== 'done' || s.def.roadTier) continue;
          if (shielded && (s.shield > 0 || this.coveredBy(s, ['shield_generator'], 20))) continue;
          if (def.filterTypes && this.coveredBy(s, def.filterTypes, def.filterRadius ?? 14)) continue;
          s.hp = Math.max(1, s.hp - def.structureDamage * dt);
        }
      }
      if (def.breaksRoads) {
        for (const s of this.structures) if (s.def.roadTier && this.rng() < 0.002 * dt) s.hp = Math.max(1, s.hp - 20 * dt);
      }
      if (def.unpoweredDamage) {
        for (const s of this.structures) if (s.state === 'done' && s.def.powerUse && s.powered < 0.2) s.hp = Math.max(1, s.hp - def.unpoweredDamage * dt);
      }
      if (def.unitDamage) {
        let sheltered = 0;
        for (const u of this.units) {
          if (!u.alive) continue;
          if (def.shelterTypes && this.coveredBy({ x: u.x, y: u.y, w: 0, h: 0 }, def.shelterTypes, def.shelterRadius ?? 12)) { sheltered++; continue; }
          if (def.filterTypes && this.coveredBy({ x: u.x, y: u.y, w: 0, h: 0 }, def.filterTypes, def.filterRadius ?? 14)) { sheltered++; continue; }
          u.hp -= def.unitDamage * dt;
          if (u.hp <= 0) { u.alive = false; this.stats.crewLost++; this.notify('unit_lost', { name: u.def.name, at: { x: u.x, y: u.y } }); }
        }
        this.units = this.units.filter(u => u.alive);
        if (sheltered && !this.hazard.toldShelter) { this.hazard.toldShelter = true; this.notify('hazard_sheltered', { n: sheltered }); }
      }
      if (def.regrowRate) tickRegrow(this.map, dt * (def.regrowRate - 1), this.techEffect('regrowRate', 1));
      return;
    }
    const tags = (this.planet.hazards || []).filter(t => H[t]);
    if (!tags.length) return;
    if (this.time < (this.hazardQuietUntil || 0)) return;
    const chance = (H.clock?.chancePer10s ?? 0.014) * (dt / 10);
    if (this.rng() > chance) return;
    const type = this.rng.weighted(tags, t => H[t].weight ?? 1);
    const def = H[type];
    const [lo, hi] = def.duration || [120, 260];
    this.hazard = { type, until: this.time + lo + this.rng() * (hi - lo), at: this.time };
    const at = { x: this.hq()?.x ?? 0, y: this.hq()?.y ?? 0 };
    this.notify(def.notify || 'hazard_storm', { name: this.hq()?.def.name || 'the base', n: Math.round((def.machineSlow || 0) * 100), at });
    this.emit('hazard', this.hazard);
    if (def.waveChance && this.rng() < def.waveChance && this.nextWaveAt != null) {
      spawnWave(this, { budget: Math.max(4, this.threat * (this.data.waves.hazardWaves?.stormBudgetShare ?? 0.5) * 0.05) });
    }
  }

  tickSurveys() {
    for (const s of [...this.pendingSurveys]) {
      if (this.time < s.doneAt) continue;
      this.pendingSurveys = this.pendingSurveys.filter(x => x !== s);
      this.exploredRegions.push(s.regionId);
      const region = this.world.regions[s.regionId];
      const cache = { iron_ore: 120, copper_ore: 80, stone: 200 };
      const hq = this.hq();
      if (hq) for (const [r, n] of Object.entries(cache)) hq.inv[r] = (hq.inv[r] || 0) + n;
      this.notify('region_explored', { name: region?.name || 'the region', text: `${region?.biomeName || 'unknown ground'}, danger ${((region?.danger ?? 0.3) * 100) | 0}%. The scouts brought back a cache.`, at: { x: hq?.x ?? 0, y: hq?.y ?? 0 } });
      this.emit('region:explored', { regionId: s.regionId, region });
    }
  }

  snapshot() {
    const inv = this.inventory();
    this.stats.history.push({
      t: this.time, threat: Math.round(this.threat), wave: this.waveNumber,
      structures: this.structures.filter(s => s.state === 'done').length,
      power: Math.round(this.stats.power.gen), sat: +this.stats.power.satisfaction.toFixed(2),
      iron: Math.round(inv.iron_ingot || 0), plate: Math.round(inv.iron_plate || 0),
      science: this.research.done.length, kills: this.stats.kills,
    });
    if (this.stats.history.length > 2000) this.stats.history.shift();
  }

  // ------------------------------------------------------------ quests
  //
  // Three shapes of objective share one list:
  //   - a plain side quest, offered as soon as its tier is reached
  //   - a `requires` quest, held back until the quests it names are done
  //   - a `chain` quest with a `step` number: only the lowest unfinished step is ever offered, so
  //     the tutorial and the exploration gate read as numbered lists rather than a pile
  offerQuests() {
    const chainNext = {};                       // chain id -> the lowest unfinished step number
    for (const q of this.data.quests) {
      if (!q.chain || this.quests.done.includes(q.id)) continue;
      const cur = chainNext[q.chain];
      if (cur == null || (q.step || 0) < cur) chainNext[q.chain] = q.step || 0;
    }
    for (const q of this.data.quests) {
      if (this.quests.done.includes(q.id) || this.quests.active.includes(q.id)) continue;
      if (q.chain) { if ((q.step || 0) !== chainNext[q.chain]) continue; }
      else if ((q.tier || 0) > this.questTier()) continue;
      if ((q.requires || []).some(id => !this.quests.done.includes(id))) continue;
      this.quests.active.push(q.id);
      this.notify('quest_offered', { name: q.name, text: q.text });
    }
  }
  questTier() {
    const done = this.research.done.length;
    return done > 40 ? 6 : done > 28 ? 5 : done > 18 ? 4 : done > 10 ? 3 : done > 5 ? 2 : done > 1 ? 1 : 0;
  }
  trackQuest(type, target) { this.quests.counters[type + ':' + target] = (this.quests.counters[type + ':' + target] || 0) + 1; }
  /** The objectives a UI should be showing, with their progress, chain first. */
  activeQuests() {
    return this.quests.active.map(id => this.data.quest[id]).filter(Boolean)
      .map(q => ({ ...q, ...this.questProgress(q) }))
      .sort((a, b) => (b.chain ? 1 : 0) - (a.chain ? 1 : 0) || (a.step || 0) - (b.step || 0));
  }

  /** Progress on one quest, 0..1 plus the raw numbers. */
  questProgress(q) {
    const done = this.structures.filter(s => s.state === 'done');
    let have = 0;
    switch (q.type) {
      case 'build': have = done.filter(s => s.type === q.target).length; break;
      case 'build_count':
        have = q.target?.startsWith('category:')
          ? done.filter(s => s.def.category === q.target.slice(9)).length
          : done.filter(s => s.type === q.target).length;
        break;
      case 'produce': have = this.stats.produced[q.target] || 0; break;
      case 'scan_nodes': have = this.map.nodes.filter(n => n.scanned).length; break;
      case 'scan_all_of_kind': {
        const all = this.map.nodes.filter(n => n.kind === q.target || this.data.resource[n.resource]?.kind === q.target);
        have = all.length && all.every(n => n.scanned) ? 1 : 0; break;
      }
      case 'routes': have = this.routes.length; break;
      case 'route_vehicle': have = this.routes.filter(r => this.vehicles.find(v => v.id === r.vehicle)?.type === q.target).length; break;
      case 'power_capacity': have = Math.round(this.stats.power.gen); break;
      case 'survive_wave': have = this.stats.wavesCleared; break;
      case 'turret_before_wave': have = this.flags.turretBeforeFirstWave ? 1 : 0; break;
      case 'explore_regions': have = this.exploredRegions.length; break;
      case 'kill_nests': have = this.stats.nestsKilled; break;
      case 'reach_rare': have = done.some(s => s.nodeId && this.data.resource[this.nodeById(s.nodeId)?.resource]?.kind === 'rare') ? 1 : 0; break;
      case 'research_count': have = this.research.done.length; break;
      case 'landed_again': have = this.arrivedFrom ? 1 : 0; break;
      case 'beacons': have = this.space.beacons.length; break;
      case 'launch': have = this.quests.counters['launch:' + q.target] || 0; break;
      default: have = 0;
    }
    return { have, goal: q.goal, pct: Math.min(1, have / q.goal) };
  }

  checkQuests() {
    for (const id of [...this.quests.active]) {
      const q = this.data.quest[id];
      if (!q) continue;
      const p = this.questProgress(q);
      if (p.have < q.goal) continue;
      this.quests.active = this.quests.active.filter(x => x !== id);
      this.quests.done.push(id);
      const hq = this.hq();
      if (q.reward?.resources && hq) for (const [r, n] of Object.entries(q.reward.resources)) hq.inv[r] = (hq.inv[r] || 0) + n;
      if (q.reward?.research) grantResearch(this, q.reward.research);
      if (q.reward?.tech && completeResearch(this, q.reward.tech, { silent: true })) this.notify('tech_granted', { name: this.data.tech[q.reward.tech]?.name || q.reward.tech });
      if (q.reward?.crew) for (let i = 0; i < q.reward.crew; i++) this.spawnUnit('builder', hq?.x ?? 0, hq?.y ?? 0);
      if (q.chain) {
        const steps = this.data.quests.filter(x => x.chain === q.chain);
        const chain = (this.data.questChains || []).find(c => c.id === q.chain);
        this.notify('quest_step', { name: q.name, n: q.step, text: String(steps.length), reason: q.done });
        if (steps.every(x => this.quests.done.includes(x.id))) this.notify('quest_chain_done', { name: chain?.name || q.chain });
      } else this.notify('quest_done', { name: q.name, text: q.done });
      this.emit('quest:done', q);
    }
    this.offerQuests();
  }

  /**
   * The running "something is wrong" checks. They are deliberately sampled rather than raised the
   * instant they happen, so the player gets one clear message instead of a stream of them.
   */
  checkAlarms() {
    // several machines all waiting on the same input is the single most useful thing to say
    const starved = {};
    for (const s of this.structures) {
      if (s.state !== 'done' || !s.starvedFor || s.idleFor < 45) continue;
      (starved[s.starvedFor] ||= []).push(s);
    }
    for (const [res, list] of Object.entries(starved)) {
      if (list.length < 3) continue;
      if (this.time - (this.flags['starve:' + res] || -1e9) < 240) continue;
      this.flags['starve:' + res] = this.time;
      this.notify('input_starved', { n: list.length, resource: this.data.resource[res]?.name || res, at: { x: list[0].x, y: list[0].y } });
    }
    // builders with nothing to do
    const builders = this.units.filter(u => u.alive && u.def.buildRate);
    const jobs = this.structures.some(s => s.state === 'ghost' || s.state === 'building');
    if (!jobs && builders.length >= 2) {
      this.idleBuilderFor = (this.idleBuilderFor || 0) + 5;
      if (this.idleBuilderFor > 180 && this.time - (this.flags.builderIdle || -1e9) > 600) {
        this.flags.builderIdle = this.time;
        this.notify('builder_idle', { n: builders.length });
      }
    } else this.idleBuilderFor = 0;
    // stores filling up
    const stores = this.structures.filter(s => s.state === 'done' && s.cap > 0);
    const cap = stores.reduce((a, s) => a + s.cap, 0);
    if (cap > 0) {
      const used = stores.reduce((a, s) => a + Object.values(s.inv).reduce((x, y) => x + y, 0), 0);
      const pct = Math.round(used / cap * 100);
      if (pct > 88 && this.time - (this.flags.storageFull || -1e9) > 600) { this.flags.storageFull = this.time; this.notify('storage_pressure', { n: pct }); }
    }
    // the grid behind demand by a real margin
    const short = this.stats.power.use - this.stats.power.gen;
    if (short > 60 && this.time - (this.flags.powerShort || -1e9) > 420) { this.flags.powerShort = this.time; this.notify('power_short', { n: Math.round(short) }); }
    // a quiet stretch is a chance to say "go and build something"
    if (this.nextWaveAt != null && !this.enemies.length) {
      const gap = this.nextWaveAt - this.time;
      if (gap > 300 && this.time - (this.flags.quietTold || -1e9) > 900) { this.flags.quietTold = this.time; this.notify('wave_quiet', { n: Math.round(gap / 60) }); }
    }
  }

  // ------------------------------------------------------------ save / load
  /** A plain JSON snapshot. The map is not saved - it is rebuilt from the seed and patched. */
  toJSON() {
    return {
      schema: 1, seed: this.seed, difficulty: this.difficulty, time: this.time, ticks: this.ticks, nextId: this.nextId,
      planet: this.planet, worldCell: this.worldCell, mapSize: this.map.size,
      hqId: this.hqId, beaconsToWin: this.beaconsToWin,
      structures: this.structures.map(s => ({ id: s.id, type: s.type, x: s.x, y: s.y, rot: s.rot || 0, state: s.state, progress: s.progress, hp: s.hp, inv: s.inv, recipe: s.recipe, craft: s.craft, crafting: !!s.crafting, crafted: s.crafted, enabled: s.enabled, nodeId: s.nodeId, charge: s.charge || 0, shield: s.shield || 0, lastScan: s.lastScan })),
      units: this.units.map(u => ({ id: u.id, type: u.type, x: u.x, y: u.y, hp: u.hp, target: u.target })),
      vehicles: this.vehicles.map(v => ({ id: v.id, type: v.type, x: v.x, y: v.y, hp: v.hp, cargo: v.cargo, cargoRes: v.cargoRes, garage: v.garage, route: v.route, tier: v.tier, fuel: v.fuel || 0 })),
      routes: this.routes.map(r => ({ id: r.id, from: r.from, to: r.to, resource: r.resource, vehicle: r.vehicle, state: r.state, progress: r.progress, enabled: r.enabled, delivered: r.delivered, trips: r.trips })),
      nodes: this.map.nodes.map(n => ({ ...n })),                 // saved whole: the starter patches are moved at landfall, so they cannot be re-derived
      nests: this.nests.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, hp: n.hp, alive: n.alive, cd: n.cd, known: !!n.known })),
      enemies: this.enemies.map(e => ({ id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp, wave: e.wave, target: e.target })),
      waves: this.waves.map(w => ({ n: w.n, spawned: w.spawned, killed: w.killed, target: w.target, closed: !!w.closed, at: w.at })),
      research: this.research, quests: this.quests, space: this.space,
      exploredRegions: this.exploredRegions, pendingSurveys: this.pendingSurveys,
      threat: this.threat, waveNumber: this.waveNumber, nextWaveAt: this.nextWaveAt, hazard: this.hazard,
      fog: packFog(this.fog), stats: this.stats, notifications: this.notifications.slice(-60),
      won: this.won, lost: this.lost,
    };
  }

  /** Rebuild a game from toJSON(). Give it the same data bundle (and world, if you cached one). */
  static fromJSON(json, { data, planets = null, world = null } = {}) {
    const g = new Game({ seed: json.seed, difficulty: json.difficulty, data, planets, beaconsToWin: json.beaconsToWin });
    g.planet = json.planet;
    g.world = world || generatePlanetMap(g.planet);
    g.worldCell = json.worldCell;
    g.map = createLocalMap({ world: g.world, wx: json.worldCell.x, wy: json.worldCell.y, planet: g.planet, data, size: json.mapSize });
    g.map.blocking = g.blocking;
    g.fog = createFog(g.map);
    unpackFog(g.fog, json.fog);
    g.map.nodes = json.nodes.map(n => ({ ...n }));
    g.map.nodeAt.fill(-1);
    for (let k = 0; k < g.map.nodes.length; k++) {
      const n = g.map.nodes[k];
      for (let dy = -n.radius; dy <= n.radius; dy++) for (let dx = -n.radius; dx <= n.radius; dx++) {
        const xx = n.x + dx, yy = n.y + dy;
        if (xx < 0 || yy < 0 || xx >= g.map.width || yy >= g.map.height) continue;
        if (dx * dx + dy * dy > n.radius * n.radius) continue;
        g.map.nodeAt[yy * g.map.width + xx] = k;
      }
    }
    g.time = json.time; g.ticks = json.ticks; g.nextId = json.nextId; g.hqId = json.hqId;
    g.research = json.research; g.quests = json.quests; g.space = json.space;
    g.exploredRegions = json.exploredRegions || []; g.pendingSurveys = json.pendingSurveys || [];
    g.threat = json.threat; g.waveNumber = json.waveNumber; g.nextWaveAt = json.nextWaveAt; g.hazard = json.hazard;
    g.stats = json.stats; g.notifications = json.notifications || [];
    g.won = json.won; g.lost = json.lost;
    g.dropIndex();
    for (const s of json.structures) {
      const def = data.structure[s.type];
      const fp = footprint(def, s.rot || 0);
      const e = { ...s, def, rot: s.rot || 0, w: fp.w, h: fp.h, maxHp: def.hp || 100, cap: def.storage || 0, net: -1, powered: 1, links: [], busy: false, cooldown: 0, idleFor: 0 };
      g.structures.push(e);
      g.dropIndex();
      stamp(g, e);
    }
    for (const u of json.units) { const def = data.unit[u.type]; g.units.push({ ...u, def, maxHp: def.hp, alive: true, job: def.buildRate ? 'build' : 'guard' }); }
    for (const v of json.vehicles) { const def = data.vehicle[v.type]; g.vehicles.push({ ...v, def, maxHp: def.hp, alive: true, buildTarget: null }); }
    for (const r of json.routes) g.routes.push({ ...r, path: [], tripTime: 1 });
    for (const n of json.nests) { const def = data.unit[n.type]; g.nests.push({ ...n, def, maxHp: def.hp }); }
    for (const e of json.enemies) { const def = data.unit[e.type]; g.enemies.push({ ...e, def, maxHp: def.hp, alive: true, armor: def.armor || 0, dps: def.dps, speed: def.speed, air: !!def.air, cd: 0, slow: 0 }); }
    for (const w of json.waves) g.waves.push({ ...w, field: null });
    g.currentWave = g.waves[g.waves.length - 1] || null;
    g.unlocked = null;
    recomputeLinks(g); recomputePower(g); replanRoutes(g); recomputeVisible(g);
    return g;
  }
}

/** Pick a world cell to land on: land, not a peak, near the middle of a decent region. */
function pickWorldCell(world, rng) {
  const candidates = [];
  for (let y = 4; y < world.height - 4; y++) for (let x = 4; x < world.width - 4; x++) {
    const i = y * world.width + x;
    if (world.water[i] !== 0) continue;
    if (world.slope[i] > 0.45) continue;
    let wet = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const j = (y + dy) * world.width + (x + dx);
      if (world.water[j] !== 0) wet++;
    }
    if (wet > 2) continue;                                 // a shoreline cell would come out half ocean
    candidates.push({ x, y, score: (world.habitability?.[i] ?? 0.5) + (world.river[i] ? 0.2 : 0) - wet * 0.2 });
  }
  if (!candidates.length) return { x: world.width >> 1, y: world.height >> 1 };
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, Math.max(1, Math.floor(candidates.length * 0.1)));
  return rng.pick(top);
}

export { ARCHETYPES, makePlanet, generatePlanetMap, localPlanets, Space };
