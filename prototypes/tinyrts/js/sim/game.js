// The simulation. Holds the world, every entity, each team's economy, and runs one fixed tick.
// It never touches the DOM, so it runs the same in the browser, in tests and in headless sims.
// Everything in here is plain data with integer ids so a match can be saved and loaded.
//
// Options (opts):
//   mode        'siege' | 'versus' | 'campaign' | 'sandbox'
//   seed, mapSize ('small'|'medium'|'large') or size [w,h], style ('rolling'|'canyons'|'islands'|'flat')
//   difficulty  'easy'|'normal'|'hard'|'brutal'|'story'
//   waves       {total, pace, lanes, authored, allow} (siege/campaign)
//   start       {c, f, a} starting resources
//   tech        list of allowed building/unit/wall keys (null = everything)
//   ai          {difficulty, style} for the Umbra rival (versus/campaign)
//   commander   true to give the player a Commander
//   instantBuild  (tests/debug)

import { Rng } from '../core/rng.js';
import { Events } from '../core/events.js';
import { TICK_DT } from '../core/loop.js';
import { Materials, M } from '../world/materials.js';
import { World } from '../world/world.js';
import { generateTerrain, defaultBases } from '../world/terrain-gen.js';
import { stepLoose } from '../world/cellsim.js';
import { SupportSolver } from '../world/support.js';
import { makeTeam, TEAM } from './teams.js';
import { bdef, createBuilding, updateFalling, updateEconomy, damageBuilding, removeBuilding } from './buildings.js';
import { updateLinks, updatePower } from './network.js';
import { udef, createUnit, removeUnit, damageUnit } from './units.js';
import { updateHollow } from './hollow.js';
import { updateDrone } from './construction.js';
import { updateArmy } from './army.js';
import { updateWeapon, updateBurst, interceptTarget } from './weapons.js';
import { updateProjectiles, spawnBallistic, splashDamage, throwDebris } from './projectiles.js';
import { makeWaves, updateWaves, callEarly } from './waves.js';
import { applyCommand } from './commands.js';
import { Nav, findFlyPath } from './nav.js';
import { attachRival } from '../ai/rival.js';
import { setupMissionMap, attachObjectives } from './missions.js';

export const MAP_SIZES = { small: [768, 256], medium: [1024, 288], large: [1280, 320] };

export class Game {
  constructor(data, opts = {}) {
    this.data = data;
    this.opts = opts;
    this.mode = opts.mode || 'siege';
    this.seed = opts.seed ?? 1;
    this.rng = new Rng(this.seed);
    this.events = new Events();
    this.tickNo = 0;
    this.time = 0;
    this.nextId = 1;
    this.settings = { rebuildDuringWaves: false, ...(opts.settings || {}) };
    this.mats = new Materials(data.materials);
    const [w, h] = opts.size ? opts.size : MAP_SIZES[opts.mapSize || 'medium'];
    this.world = new World(w, h, this.mats);
    this.support = new SupportSolver(this.world);
    this.nav = new Nav(this.world);
    this.buildings = [];
    this.units = [];
    this.projectiles = [];
    this.acids = [];
    this.debris = [];
    this.debrisBudget = 60;
    this.byId = new Map();
    this.linkEdges = {}; this.linkNodes = {};
    this.linksDirty = true;
    this.planCells = { 1: new Set(), 2: new Set() };
    this.digCells = { 1: new Set(), 2: new Set() };
    this.rebuilds = new Set();
    this.undo = {};
    this.commandQueue = [];
    this.result = null;           // {winner, reason}
    this.tech = opts.tech || null;
    this.alerts = [];
    this.stats = { cellsDestroyed: 0, cellsRebuilt: 0 };
    this.abilityFx = [];          // pending delayed effects (orbital lance)
    this.overcharges = [];

    const versus = this.mode === 'versus' || !!opts.ai;
    this.teams = {
      1: makeTeam(1, { ...(opts.start || {}) }),
      3: makeTeam(3, {}),
    };
    if (versus) this.teams[2] = makeTeam(2, { ai: true, ...(opts.start || {}), incomeMult: opts.ai?.incomeMult ?? 1 });

    const bases = opts.bases || defaultBases(w, versus);
    this.terrainInfo = generateTerrain(this.world, {
      seed: this.seed, style: opts.style || 'rolling', bases, caves: opts.caves, ore: opts.ore,
      groundLevel: opts.groundLevel,
    });
    if (opts.mapHook) opts.mapHook(this); // custom presets edit the terrain here
    if (opts.missionIndex != null) setupMissionMap(this);

    // Hooks from the world.
    this.world.onCellDestroyed = (x, y, m, team, type) => this.onCellDestroyed(x, y, m, team, type);
    this.support.onClumpLand = (c, fell, cells) => this.onClumpLand(c, fell, cells);

    // Cores and starting units.
    const coreDef = bdef(this, 'core');
    this.bases = this.terrainInfo.bases;
    const teamIds = versus ? [1, 2] : [1];
    teamIds.forEach((tid, k) => {
      const b = this.bases[k];
      if (!b || opts.noCore?.includes(tid)) return;
      const [cw, ch] = coreDef.size;
      const cx = Math.round(b.x - cw / 2), cy = Math.round(b.y - ch);
      // Clear the pad above the core spot so nothing overlaps.
      for (let y = cy; y < cy + ch; y++) for (let x = cx - 2; x < cx + cw + 2; x++) if (this.world.get(x, y) !== M.EMPTY) this.world.set(x, y, M.EMPTY);
      createBuilding(this, 'core', tid, cx, cy, { built: true });
      const drones = opts.startDrones ?? 3;
      for (let d = 0; d < drones; d++) createUnit(this, 'drone', tid, cx + cw / 2 + (d - 1) * 6, cy - 8);
      if (opts.commander !== false && (opts.commander || tid === 2 || this.mode === 'versus')) this.spawnCommander(tid);
    });
    updateLinks(this);

    if (this.mode !== 'versus' || opts.waves) {
      this.waves = makeWaves(this, { difficulty: opts.difficulty, ...(opts.waves || {}) });
    } else this.waves = null;
    this.ai = null;
    if (this.teams[2] && opts.ai && !opts.noAI) attachRival(this, opts.ai);
    if (opts.missionIndex != null) attachObjectives(this);
  }

  // ---------- helpers used by sim modules ----------
  isUnlocked(team, key) {
    if (!this.tech || team !== 1) return true;
    if (!key) return false;
    return this.tech.includes(key);
  }

  command(c) { this.commandQueue.push(c); }
  applyNow(c) { return applyCommand(this, c); }

  blast(x, y, r, dmg, team, dtype = 'blast') {
    const w = this.world;
    const cellDmg = dmg * 1.6;
    let destroyed = 0;
    for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
      const d2 = (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2;
      if (d2 > r * r) continue;
      const f = 1 - d2 / (r * r);
      const m = w.get(xx, yy);
      if (m === M.EMPTY || m === M.FOOTPRINT) continue;
      if (w.damageCell(xx, yy, cellDmg * f, dtype)) {
        destroyed++;
        if (this.rng.next() < 0.18 && f > 0.3) w.set(xx, yy, M.SLAG, 0);
        else if (this.rng.next() < 0.05) this.throwDebris(xx, yy, M.RUBBLE, (xx - x) * 6, -40 - f * 60);
      }
    }
    splashDamage(this, x, y, r, dmg, team, dtype, true);
    this.events.emit('blast', { x, y, r, team, destroyed });
    return destroyed;
  }

  spawnBallistic(o) { return spawnBallistic(this, o); }
  throwDebris(x, y, m, vx, vy) { throwDebris(this, x, y, m, vx, vy); }

  crushUnits(x, y, w, h, dmg, sourceTeam = 0) {
    for (const u of this.units) {
      if (u.dead || u.flying || u.burrowed) continue;
      if (u.x + u.w / 2 < x || u.x - u.w / 2 > x + w) continue;
      if (u.y < y || u.y - u.h > y + h) continue;
      damageUnit(this, u, dmg, sourceTeam === u.team ? 0 : sourceTeam, 'blast');
    }
  }

  fallDamage(u, dist) {
    damageUnit(this, u, (dist - 30) * 3, 0, 'blast');
  }

  killQuietly(u) { removeUnit(this, u, 'lost'); }

  noteAttack(e) {
    // Rate-limited "under attack" alerts per team, used by HUD and AI.
    const t = this.teams[e.team];
    if (!t) return;
    if (!t.lastAlert || this.time - t.lastAlert > 6) {
      t.lastAlert = this.time;
      this.events.emit('underAttack', { team: e.team, x: e.kind === 'b' ? e.x + e.w / 2 : e.x, y: e.kind === 'b' ? e.y : e.y - e.h, kind: e.kind, type: e.type });
    }
    t.lastAttackedAt = { x: e.kind === 'b' ? e.x + e.w / 2 : e.x, y: e.kind === 'b' ? e.y : e.y, t: this.time };
  }

  spawnCommander(team) {
    const core = this.byId.get(this.teams[team].coreId);
    if (!core) return null;
    const x = core.x + (team === 1 ? core.w + 6 : -6);
    const u = createUnit(this, 'commander', team, x, core.y + core.h - 0.001, { dir: team === 1 ? 1 : -1 });
    this.teams[team].commanderId = u.id;
    this.events.emit('commanderSpawn', { team, id: u.id });
    return u;
  }

  onHeroDown(u) {
    const t = this.teams[u.team];
    t.commanderId = 0;
    t.heroRespawnAt = this.time + (udef(this, 'commander').respawn || 30);
    this.events.emit('commanderDown', { team: u.team, respawnAt: t.heroRespawnAt });
  }

  toggleDeploy(u) {
    const def = udef(this, u.type);
    if (!def.deploy) return;
    u.deployed = !u.deployed;
    u.order = { t: 'idle' }; u.orders = []; u.path = null;
    this.events.emit('deploy', { id: u.id, deployed: u.deployed });
  }

  onCellDestroyed(x, y, m, team, type) {
    this.stats.cellsDestroyed++;
    const t = this.teams[team];
    if (t && this.mats.built[m]) t.stats.cellsLost++;
  }

  onClumpLand(c, fell, cells) {
    const dmg = c.count * Math.max(0, fell - 2) * 0.08;
    if (dmg > 1) {
      // Crush whatever is under the landed block.
      for (const u of this.units) {
        if (u.dead || u.flying || u.burrowed) continue;
        if (u.x + u.w / 2 < c.x || u.x - u.w / 2 > c.x + c.w) continue;
        if (u.y < c.y || u.y - u.h > c.y + c.h + 2) continue;
        damageUnit(this, u, Math.min(1500, dmg), 0, 'blast');
        if (u.dead) this.events.emit('crushed', { id: u.id, type: u.type, team: u.team });
      }
      for (const b of this.buildings) {
        if (b.x + b.w < c.x || b.x > c.x + c.w || b.y > c.y + c.h + 2 || b.y + b.h < c.y) continue;
        damageBuilding(this, b, Math.min(1500, dmg * 2), 0, 'blast');
      }
    }
    this.events.emit('clumpLand', { x: c.x + c.w / 2, y: c.y + c.h, count: c.count, fell });
  }

  // ---------- research & abilities ----------
  startResearch(teamId, labId, key) {
    const team = this.teams[teamId];
    const lab = this.byId.get(labId);
    const r = this.data.research.list[key];
    if (!lab || lab.type !== 'lab' || lab.team !== teamId || !lab.done) return { ok: false, reason: 'Need a finished Research Lab' };
    if (!r) return { ok: false, reason: 'Unknown research' };
    if (team.research.done[key]) return { ok: false, reason: 'Already researched' };
    if (Object.values(team.research.active).some((a) => a.key === key)) return { ok: false, reason: 'Already in progress' };
    if (team.research.active[labId]) return { ok: false, reason: 'This lab is busy' };
    if (this.tech && teamId === 1 && !this.tech.includes('research:' + key) && !this.tech.includes('research:*')) return { ok: false, reason: 'Not available in this mission' };
    const { canAfford, spend } = this._teamsFns;
    if (!canAfford(team, r.cost)) return { ok: false, reason: 'Not enough resources', poor: true };
    spend(team, r.cost);
    team.research.active[labId] = { key, t: 0 };
    return { ok: true };
  }

  finishResearch(teamId, key) {
    const team = this.teams[teamId];
    const r = this.data.research.list[key];
    team.research.done[key] = true;
    for (const [k, v] of Object.entries(r.effect)) {
      if (k === 'popCap') team.popCap += v;
      else if (k === 'bounces') team.mods.bounces = (team.mods.bounces || 0) + v;
      else team.mods[k] = (team.mods[k] || 1) * v;
    }
    if (r.effect.coreHp) {
      const core = this.byId.get(team.coreId);
      if (core) { core.maxHp *= r.effect.coreHp; core.hp *= r.effect.coreHp; }
    }
    this.linksDirty = true;
    this.events.emit('researchDone', { team: teamId, key, name: r.name });
  }

  useAbility(teamId, unitId, key, x, y) {
    const u = this.byId.get(unitId);
    if (!u || u.team !== teamId || u.type !== 'commander') return { ok: false, reason: 'No Commander' };
    const def = udef(this, 'commander');
    const a = def.abilities[key];
    if (!a) return { ok: false, reason: 'Unknown ability' };
    const ready = u.abil[key] || 0;
    if (this.time < ready) return { ok: false, reason: `Ready in ${Math.ceil(ready - this.time)} s` };
    if (key === 'overcharge') {
      for (const b of this.buildings) {
        if (b.team !== teamId || !bdef(this, b.type).turret) continue;
        if (Math.hypot(b.x + b.w / 2 - u.x, b.y + b.h / 2 - u.y) <= a.radius) b.overcharge = this.time + a.dur;
      }
      this.events.emit('ability', { key, x: u.x, y: u.y - u.h / 2, r: a.radius, team: teamId });
    } else if (key === 'blink') {
      if (Math.hypot(x - u.x, y - u.y) > a.range) return { ok: false, reason: 'Too far' };
      const old = { x: u.x, y: u.y };
      const tx = x, ty = y;
      const test = { ...u, x: tx, y: ty };
      const { boxFree } = this._physFns;
      let placed = false;
      for (let k = 0; k < 16 && !placed; k++) {
        if (boxFree(this.world, test, tx, ty - k)) { u.x = tx; u.y = ty - k; placed = true; }
      }
      if (!placed) return { ok: false, reason: 'No room there' };
      u.vy = 0; u.path = null; u.order = { t: 'idle' };
      this.events.emit('ability', { key, x: old.x, y: old.y - u.h / 2, x2: u.x, y2: u.y - u.h / 2, team: teamId });
    } else if (key === 'orbital') {
      for (const b of this.buildings) {
        if (b.type !== 'core') continue;
        if (Math.abs(b.x + b.w / 2 - x) < a.coreSafe + b.w / 2) return { ok: false, reason: 'Too close to a Core' };
      }
      this.abilityFx.push({ kind: 'orbital', x, t: this.time + a.delay, team: teamId, a });
      this.events.emit('ability', { key, x, y, team: teamId, delay: a.delay });
    }
    u.abil[key] = this.time + a.cd;
    return { ok: true };
  }

  callWaveEarly(team) { return callEarly(this, team); }

  // ---------- tick ----------
  tick() {
    const dt = TICK_DT;
    this.tickNo++;
    this.time += dt;
    if ((this.tickNo % 30) === 0) this.debrisBudget = 60;

    // 1. Commands.
    while (this.commandQueue.length) {
      const c = this.commandQueue.shift();
      const r = applyCommand(this, c);
      if (!r.ok && r.reason) this.events.emit('commandFailed', { team: c.team, reason: r.reason, cmd: c.t });
    }
    // 2. Links and power.
    if (this.linksDirty || this.tickNo % 15 === 0) updateLinks(this);
    updatePower(this, dt);
    // 3. Buildings: falling, economy, training, research, weapons.
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      if (b.dead) continue;
      updateFalling(this, b, dt);
      if (b.dead || b.falling) continue;
      updateEconomy(this, b, dt);
      if (!b.done) continue;
      this.updateTraining(b, dt);
      this.updateResearch(b, dt);
      const def = bdef(this, b.type);
      if (def.weapon && (b.linked || b.type === 'core')) {
        const team = this.teams[b.team];
        const oc = b.overcharge > this.time ? 1.5 : 1;
        const laser = def.weapon.dtype === 'laser' || def.weapon.dtype === 'arc';
        const mods = { rate: oc, dmg: def.weapon.dtype === 'laser' ? (team.mods.laserDmg || 1) : 1, power: laser && def.weapon.power ? team.power.ratio : 1 };
        if (def.weapon.intercept) {
          // Flak prefers enemy projectiles in flight when there are no air units in range.
          const fired = updateWeapon(this, b, def.weapon, dt, mods);
          if (!fired && !b.target && b.cd <= 0) {
            const p = interceptTarget(this, b, def.weapon);
            if (p) {
              // Lead the projectile: aim where it will be when the flak gets there.
              const mx = b.x + b.w / 2, my = b.y + 2;
              let t = Math.hypot(p.x - mx, p.y - my) / def.weapon.speed;
              let px = p.x, py = p.y;
              for (let k = 0; k < 3; k++) { px = p.x + p.vx * t; py = p.y + p.vy * t + 0.5 * (p.g || 0) * t * t; t = Math.hypot(px - mx, py - my) / def.weapon.speed; }
              const team = this.teams[b.team];
              if (team.res.f >= (def.weapon.ammoF || 0)) {
                team.res.f -= def.weapon.ammoF || 0;
                b.cd = 1 / def.weapon.rate; b.burstLeft = 3; b.burstT = 0; b.burstTarget = 0;
                b.burstAim = { x: px, y: py }; b.burstProj = p.id;
              }
              b.aim = Math.atan2(py - my, px - mx);
            }
          }
          updateBurst(this, b, def.weapon, dt);
        } else updateWeapon(this, b, def.weapon, dt, mods);
      } else b.firingDraw = 0;
    }
    // 4. Units.
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.dead) continue;
      if (u.hollow) updateHollow(this, u, dt);
      else if (u.type === 'drone') updateDrone(this, u, dt);
      else updateArmy(this, u, dt);
    }
    // Hero respawns.
    for (const tid of [1, 2]) {
      const t = this.teams[tid];
      if (t && t.heroRespawnAt && this.time >= t.heroRespawnAt) { t.heroRespawnAt = 0; this.spawnCommander(tid); }
    }
    // 5. Projectiles, acid, debris; delayed ability effects.
    updateProjectiles(this, dt);
    this.updateAbilityFx();
    // 6. Cells: loose physics, support, clumps.
    stepLoose(this.world, this.tickNo);
    this.support.process(60000);
    this.support.stepClumps(dt, this.rng);
    // Blueprint cells that lost their wall go back on the build list.
    const lost = this.world.planLost;
    while (lost.length) {
      const i = lost.pop();
      const pt = this.world.planTeam[i];
      if (this.world.plan[i] && this.planCells[pt]) { this.planCells[pt].add(i); this.rebuilds.add(i); }
    }
    // 7. Waves, AI, objectives.
    updateWaves(this, dt);
    if (this.ai) this.ai.update(dt);
    if (this.objectives) this.objectives.update(dt);
    // Income smoothing for the HUD (per second).
    if (this.tickNo % 30 === 0) {
      for (const t of Object.values(this.teams)) {
        for (const k of ['c', 'f', 'a']) { t.income[k] = t.income[k] * 0.5 + t.incomeAcc[k] * 0.5; t.incomeAcc[k] = 0; }
      }
    }
    this.checkEnd();
  }

  updateTraining(b, dt) {
    if (!b.queue.length) { b.trainT = 0; return; }
    const team = this.teams[b.team];
    const ud = udef(this, b.queue[0]);
    const ratio = b.type === 'core' ? 1 : (b.linked ? team.power.ratio : 0);
    b.trainT += dt * ratio;
    if (b.trainT < (ud.train || 8)) return;
    const type = b.queue.shift();
    b.trainT = 0;
    const out = b.team === 1 ? 1 : -1;
    const x = out > 0 ? b.x + b.w + 3 : b.x - 3;
    const y = ud.move === 'fly' ? b.y - 4 : b.y + b.h - 0.001;
    const u = createUnit(this, type, b.team, x, y, { dir: out });
    if (b.rally && type !== 'drone') u.order = { t: 'amove', x: b.rally.x, y: b.rally.y };
    this.events.emit('trained', { id: u.id, type, team: b.team, x, y });
  }

  updateResearch(b, dt) {
    if (b.type !== 'lab') return;
    const team = this.teams[b.team];
    const a = team.research.active[b.id];
    if (!a) return;
    a.t += dt * (b.linked ? team.power.ratio : 0);
    const r = this.data.research.list[a.key];
    if (a.t >= r.time) { delete team.research.active[b.id]; this.finishResearch(b.team, a.key); }
  }

  updateAbilityFx() {
    for (let k = this.abilityFx.length - 1; k >= 0; k--) {
      const f = this.abilityFx[k];
      if (this.time < f.t) continue;
      this.abilityFx.splice(k, 1);
      if (f.kind === 'orbital') {
        const a = f.a, w = this.world;
        const top = w.surfaceY(Math.floor(f.x));
        const x0 = Math.floor(f.x - a.width / 2);
        for (let x = x0; x < x0 + a.width; x++) {
          const sy = w.surfaceY(x);
          for (let y = sy; y < Math.min(w.h, top + a.depth); y++) {
            const m = w.get(x, y);
            if (m === M.BEDROCK || m === M.FOOTPRINT) continue;
            if (m !== M.EMPTY) w.set(x, y, this.rng.next() < 0.12 ? M.SLAG : M.EMPTY);
          }
        }
        for (const u of this.units) if (!u.dead && u.team !== f.team && Math.abs(u.x - f.x) < a.width / 2 + u.w / 2) damageUnit(this, u, a.dmg, f.team, 'blast');
        for (const b of this.buildings) if (!b.dead && b.team !== f.team && b.x < f.x + a.width / 2 && b.x + b.w > f.x - a.width / 2) damageBuilding(this, b, a.dmg, f.team, 'blast');
        this.events.emit('orbitalHit', { x: f.x, w: a.width, top, depth: a.depth });
      }
    }
  }

  checkEnd() {
    if (this.result) return;
    const lumenCore = this.byId.get(this.teams[1].coreId);
    if (!lumenCore && !this.opts.noCore?.includes(1)) { this.end(2, 'Your Core was destroyed'); return; }
    if (this.teams[2] && !this.opts.noCore?.includes(2)) {
      const umbra = this.byId.get(this.teams[2].coreId);
      if (!umbra && (!this.objectives || this.objectives.coreKillWins !== false)) { this.end(1, 'Umbra Core destroyed'); return; }
    }
    if (this.objectives) return; // missions decide victory themselves
    if (this.mode === 'siege' && this.waves && this.waves.n >= this.waves.total && this.waves.phase === 'build') this.end(1, 'All waves survived');
  }

  end(winner, reason) {
    if (this.result) return;
    this.result = { winner, reason, time: this.time };
    this.events.emit('gameOver', this.result);
  }
}

// Late-bound helpers (avoid import cycles in methods above).
import * as teamsMod from './teams.js';
import * as physMod from './physics.js';
Game.prototype._teamsFns = teamsMod;
Game.prototype._physFns = physMod;
Game.prototype._findFlyPath = findFlyPath;
