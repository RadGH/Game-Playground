// Campaign missions: turn a mission from data/campaign.json into Game options, sculpt its special
// map features, and run its objectives and star conditions.
//
// Objective objects (game.objectives) expose:
//   list()   -> [{text, done, failed}] for the HUD
//   update() -> checks win/lose each tick
//   stars()  -> [{text, got}] when the match ends
//   save()/state for suspend + resume

import { M } from '../world/materials.js';
import { createBuilding } from './buildings.js';
import { createUnit } from './units.js';
import { findLinkFor } from './network.js';

const AI_SHIFT = { story: -1, normal: 0, hard: 1 };
const AI_LEVELS = ['easy', 'normal', 'hard', 'brutal'];

export function missionOpts(data, index, difficulty = 'normal') {
  const m = data.campaign.missions[index];
  const [w] = { small: [768], medium: [1024], large: [1280] }[m.map.size];
  const opts = {
    mode: 'campaign', missionIndex: index, missionId: m.id, seed: m.map.seed, mapSize: m.map.size, style: m.map.style,
    caves: m.map.caves, start: { a: 0, ...m.start }, commander: m.commander, tech: m.tech, difficulty,
    label: `${index}. ${m.name}`,
  };
  if (m.waves) {
    const list = m.waves.list.map((wv) => ({ ...wv, lanes: wv.lanes || m.waves.lanes || ['right'] }));
    opts.waves = { authored: list, total: m.waves.total || list.length, firstDelay: m.waves.firstDelay, between: m.waves.between, difficulty: difficulty === 'normal' ? 'normal' : difficulty === 'story' ? 'story' : 'hard' };
  } else opts.waves = { enabled: false, total: 0 };
  if (m.ai) {
    const lvl = Math.max(0, Math.min(3, AI_LEVELS.indexOf(m.ai.difficulty) + (AI_SHIFT[difficulty] || 0)));
    opts.ai = { ...m.ai, difficulty: AI_LEVELS[lvl] };
  }
  if (m.script === 'twofronts') opts.bases = [{ x: 230, w: 90 }, { x: w - 70, w: 90 }];
  return opts;
}

// Called by the Game constructor: sculpt the mission's map features right after terrain generation,
// then (once cores and waves exist) attach its objectives.
export function setupMissionMap(game) {
  const m = game.data.campaign.missions[game.opts.missionIndex];
  const S = SCRIPTS[m.script] || SCRIPTS.survive;
  if (S.map && !game.opts.restoring) S.map(game, m);
}

export function attachObjectives(game) {
  const m = game.data.campaign.missions[game.opts.missionIndex];
  const S = SCRIPTS[m.script] || SCRIPTS.survive;
  game.objectives = new Objectives(game, m, S);
  return game.objectives;
}

class Objectives {
  constructor(game, mission, script) {
    this.game = game; this.mission = mission; this.script = script;
    this.coreKillWins = true;
    this.state = { coreHurt: false, buildingLost: false, cmdrDown: false, borerNear: false, crushedNest: false, armyLost: false, beaconLost: false, linkT: 0, bridge0: 0, hints: 0 };
    const E = game.events;
    E.on('buildingDestroyed', (e) => { if (e.team === 1) { this.state.buildingLost = true; if (e.type === 'beacon') this.state.beaconLost = true; } });
    E.on('underAttack', (e) => { if (e.team === 1 && e.type === 'core') this.state.coreHurt = true; });
    E.on('commanderDown', (e) => { if (e.team === 1) this.state.cmdrDown = true; });
    E.on('unitKilled', (e) => { if (e.team === 1 && e.type !== 'drone' && e.type !== 'commander') this.state.armyLost = true; });
    E.on('crushed', (e) => { if (e.type === 'nest') this.state.crushedNest = true; });
    E.on('borerSurfaced', (e) => {
      const core = game.byId.get(game.teams[1].coreId);
      if (core && Math.abs(e.x - (core.x + core.w / 2)) < 100) this.state.borerNear = true;
    });
    if (script.init) script.init(this, game);
  }

  save() { return { ...this.state }; }
  load(s) { Object.assign(this.state, s); }

  update(dt) {
    const g = this.game;
    const core = g.byId.get(g.teams[1].coreId);
    if (core && core.hp < core.maxHp - 1) this.state.coreHurt = true;
    this.script.update?.(this, g, dt);
  }

  list() { return this.script.list(this, this.game); }

  stars() {
    const g = this.game, won = g.result && g.result.winner === 1;
    const extra = this.script.stars(this, g);
    return [{ text: this.mission.stars[0], got: won }, ...extra.map((got, i) => ({ text: this.mission.stars[i + 1], got: won && got }))];
  }

  wavesDone() {
    const W = this.game.waves;
    return W && W.n >= W.total && W.phase === 'build';
  }
}

const coreFrac = (g) => { const c = g.byId.get(g.teams[1].coreId); return c ? c.hp / c.maxHp : 0; };
const waveText = (g, n) => { const W = g.waves; return `Survive ${n} waves (${W ? W.cleared : 0}/${n})`; };

const SCRIPTS = {
  survive: {
    update(o, g) { if (o.wavesDone()) g.end(1, 'All waves survived'); },
    list(o, g) { return [{ text: waveText(g, g.waves.total), done: o.wavesDone() }, { text: 'Keep the Core alive' }]; },
    stars(o, g) {
      const id = o.mission.id;
      if (id === 'm1') return [!o.state.buildingLost, !o.state.cmdrDown];
      return [!o.state.coreHurt, g.time < 8 * 60];
    },
  },

  tutorial: {
    update(o, g) { if (o.wavesDone()) g.end(1, 'The line begins'); },
    list(o, g) { return [{ text: waveText(g, 4), done: o.wavesDone() }, { text: 'Keep the Core alive' }]; },
    stars(o, g) { return [!o.state.coreHurt, g.time < 8 * 60]; },
  },

  undertow: {
    update(o, g) { if (o.wavesDone()) g.end(1, 'The valley holds'); },
    list(o, g) { return [{ text: waveText(g, 8), done: o.wavesDone() }, { text: 'Watch for tremor lines — Borers tunnel under walls' }]; },
    stars(o) { return [!o.state.borerNear, !o.state.coreHurt]; },
  },

  beacons: {
    map(g) {
      const W = g.world.w;
      g.saveExtra = g.saveExtra || {};
      g.saveExtra.beacons = [];
      for (const f of [0.34, 0.52, 0.7]) {
        const x = Math.round(W * f);
        const y = g.world.surfaceY(x + 3) - 18;
        for (let yy = y - 2; yy < y + 18; yy++) for (let xx = x - 2; xx < x + 8; xx++) if (g.world.get(xx, yy) !== M.EMPTY && yy < y + 18) g.world.set(xx, yy, M.EMPTY);
        // Level a little footing under it.
        for (let xx = x - 1; xx < x + 7; xx++) for (let yy = y + 18; yy < y + 21; yy++) if (g.world.get(xx, yy) === M.EMPTY) g.world.set(xx, yy, M.ROCK);
        // Beacons start dormant (neutral team 0): the Hollow ignore them until you link one.
        const b = createBuilding(g, 'beacon', 0, x, y, { built: true });
        g.saveExtra.beacons.push(b.id);
      }
    },
    update(o, g, dt) {
      const ids = g.saveExtra?.beacons || [];
      // Wake a dormant beacon once your network can reach it.
      if (g.tickNo % 15 === 0) for (const id of ids) {
        const b = g.byId.get(id);
        if (!b || b.team !== 0) continue;
        if (findLinkFor(g, 1, b.x, b.y, b.w, b.h)) {
          b.team = 1;
          for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) { const i = g.world.idx(x, y); if (g.world.owner[i] === b.id) g.world.team[i] = 1; }
          g.linksDirty = true;
          g.events.emit('objective', { text: 'Beacon lit! The Hollow will come for it now.', x: b.x + b.w / 2, y: b.y, cls: 'good' });
        }
      }
      // A destroyed beacon goes dark, then reforms (dormant) 30 s later where it stood.
      const ex = g.saveExtra;
      ex.beaconPos = ex.beaconPos || {};
      ex.beaconBack = ex.beaconBack || [];
      ids.forEach((id, k) => {
        const b = g.byId.get(id);
        if (b) { ex.beaconPos[k] = { x: b.x, y: b.y }; return; }
        if (!ex.beaconBack.some((r) => r.k === k)) { ex.beaconBack.push({ k, t: g.time + 30 }); o.state.beaconLost = true; }
      });
      for (let r = ex.beaconBack.length - 1; r >= 0; r--) {
        const rb = ex.beaconBack[r];
        if (g.time < rb.t) continue;
        const pos = ex.beaconPos[rb.k];
        let clear = true;
        for (let y = pos.y; y < pos.y + 18 && clear; y++) for (let x = pos.x; x < pos.x + 6; x++) if (g.world.get(x, y) !== M.EMPTY && g.world.mats.state[g.world.get(x, y)] !== 2) { clear = false; break; }
        if (!clear) { rb.t = g.time + 5; continue; }
        const nb = createBuilding(g, 'beacon', 0, pos.x, pos.y, { built: true });
        nb.hp = nb.maxHp * 0.5;
        ids[rb.k] = nb.id;
        ex.beaconBack.splice(r, 1);
        g.events.emit('objective', { text: 'A beacon has reformed — link it again', x: pos.x + 3, y: pos.y, cls: 'warn' });
      }
      const alive = ids.map((id) => g.byId.get(id)).filter(Boolean);
      if (alive.length === ids.length && alive.every((b) => b.linked && b.team === 1)) o.state.linkT += dt; else o.state.linkT = 0;
      if (o.state.linkT >= 60) g.end(1, 'The line is lit');
    },
    list(o, g) {
      const ids = g.saveExtra?.beacons || [];
      const bs = ids.map((id) => g.byId.get(id));
      const linked = bs.filter((b) => b && b.linked && b.team === 1).length;
      return [
        { text: `Link all 3 beacons (${linked}/3)`, done: linked === 3 },
        { text: `Hold the link for 60 s (${Math.floor(o.state.linkT)} s)`, done: o.state.linkT >= 60 },
        { text: 'Keep every beacon standing (a lost one reforms in 30 s)', failed: o.state.beaconLost },
      ];
    },
    stars(o, g) { return [!o.state.beaconLost, g.time < 12 * 60]; },
  },

  nests: {
    map(g) {
      const W = g.world.w;
      g.saveExtra = g.saveExtra || {};
      g.saveExtra.nests = [];
      const xs = [0.6, 0.74, 0.88].map((f) => Math.round(W * f));
      // The first nest sits under a neutral stone slab on two pillars.
      const x0 = xs[0] - 22;
      let gy = 0;
      for (let x = x0; x < x0 + 44; x++) gy = Math.max(gy, g.world.surfaceY(x));
      // Flatten the ground under the slab.
      for (let x = x0 - 2; x < x0 + 46; x++) {
        const sy = g.world.surfaceY(x);
        for (let y = sy; y < gy; y++) g.world.set(x, y, M.ROCK);
        for (let y = gy - 60; y < gy; y++) g.world.set(x, y, M.EMPTY);
      }
      const top = gy - 34;
      for (let x = x0; x < x0 + 44; x++) for (let y = top; y < top + 10; y++) g.world.set(x, y, M.PLATE, 0);
      // Pillars are Panel (weaker than the slab): a few shells or a dig takes one out.
      for (const px of [x0, x0 + 39]) for (let x = px; x < px + 5; x++) for (let y = top + 10; y < gy; y++) g.world.set(x, y, M.PANEL, 0);
      g.support.process(200000);
      xs.forEach((x, k) => {
        const y = k === 0 ? gy - 0.001 : g.world.surfaceY(x) - 0.001; // the first one sits under the slab
        const n = createUnit(g, 'nest', 3, x, y, { dir: -1, hpMult: k === 0 ? 0.8 : 1 });
        g.saveExtra.nests.push(n.id);
      });
    },
    update(o, g) {
      const alive = (g.saveExtra?.nests || []).filter((id) => g.byId.has(id)).length;
      if (alive === 0) g.end(1, 'The nests are gone');
    },
    list(o, g) {
      const ids = g.saveExtra?.nests || [];
      const dead = ids.filter((id) => !g.byId.has(id)).length;
      return [{ text: `Destroy the Nests (${dead}/${ids.length})`, done: dead === ids.length }, { text: 'Tip: drop the stone slab on the first Nest' }];
    },
    stars(o) { return [o.state.crushedNest, !o.state.armyLost]; },
  },

  bridge: {
    map(g) {
      const W = g.world.w, H = g.world.h;
      const a = Math.round(W * 0.44), b = Math.round(W * 0.58);
      let deck = 0;
      for (let x = a - 6; x <= b + 6; x++) deck = Math.max(deck, g.world.surfaceY(x));
      deck -= 2;
      // Carve the chasm.
      for (let x = a; x <= b; x++) {
        for (let y = 0; y < H - 40; y++) if (g.world.get(x, y) !== M.BEDROCK) g.world.set(x, y, M.EMPTY);
        // Solid chasm floor (caves below would leave the pillars hanging).
        for (let y = H - 40; y < H - 6; y++) if (g.world.get(x, y) === M.EMPTY) g.world.set(x, y, M.ROCK);
      }
      // Build up the rims to the deck height so the bridge meets flat ground.
      for (const [x0, x1] of [[a - 30, a - 1], [b + 1, b + 30]]) for (let x = x0; x <= x1; x++) {
        const sy = g.world.surfaceY(x);
        for (let y = deck + 6; y < sy; y++) g.world.set(x, y, M.ROCK);
        for (let y = deck - 30; y < Math.min(sy, deck + 6); y++) g.world.set(x, y, y >= deck + 6 ? M.ROCK : M.EMPTY);
        for (let y = deck + 6; y < deck + 10; y++) g.world.set(x, y, M.ROCK);
      }
      // Deck + pillars (neutral plate).
      for (let x = a - 4; x <= b + 4; x++) for (let y = deck + 6; y < deck + 12; y++) g.world.set(x, y, M.PLATE, 0);
      const floor = H - 40;
      for (let px = a + 12; px < b - 8; px += 28) for (let x = px; x < px + 4; x++) for (let y = deck + 12; y < floor; y++) g.world.set(x, y, M.PLATE, 0);
      g.support.process(400000);
      g.saveExtra = g.saveExtra || {};
      g.saveExtra.bridge = { a: a - 4, b: b + 4, y0: deck + 6, y1: floor };
    },
    init(o, g) {
      const br = g.saveExtra?.bridge;
      if (br && !o.state.bridge0) o.state.bridge0 = countNeutral(g, br);
    },
    update(o, g) { if (o.wavesDone()) g.end(1, 'The bridge holds'); },
    list(o, g) {
      const br = g.saveExtra?.bridge;
      const pct = br && o.state.bridge0 ? Math.round((countNeutralCached(o, g, br) / o.state.bridge0) * 100) : 100;
      return [{ text: waveText(g, 10), done: o.wavesDone() }, { text: `Bridge intact: ${pct}%`, failed: pct < 70 }];
    },
    stars(o, g) {
      const br = g.saveExtra?.bridge;
      const pct = br && o.state.bridge0 ? countNeutral(g, br) / o.state.bridge0 : 1;
      return [pct >= 0.7, !o.state.coreHurt];
    },
  },

  rival: {
    init(o, g) { if (g.waves) g.waves.enabled = false; },
    list(o, g) { return [{ text: 'Destroy the Umbra Core' }, { text: 'Keep your Core alive' }]; },
    stars(o, g) { return [g.time < 15 * 60, coreFrac(g) > 0.5]; },
  },

  twofronts: {
    list(o, g) { return [{ text: 'Destroy the Umbra Core (east)' }, { text: 'Hollow attack from the west — behind you' }, { text: 'Keep your Core alive' }]; },
    stars(o, g) { return [g.time < 20 * 60, coreFrac(g) > 0.5]; },
  },
};

function countNeutral(g, br) {
  let n = 0;
  for (let y = br.y0; y < br.y1; y++) for (let x = br.a; x <= br.b; x++) {
    const i = g.world.idx(x, y);
    if (g.world.mat[i] === M.PLATE && g.world.team[i] === 0) n++;
  }
  return n;
}

function countNeutralCached(o, g, br) {
  if (!o._bc || g.time - o._bcT > 1) { o._bc = countNeutral(g, br); o._bcT = g.time; }
  return o._bc;
}

export function missionCount(data) { return data.campaign.missions.length; }
