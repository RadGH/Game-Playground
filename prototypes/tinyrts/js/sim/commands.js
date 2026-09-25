// Commands: the only way players (and the rival AI) change the game. Each is a plain object, so
// they can be queued, logged and replayed. apply() validates everything itself — a command from
// the UI is never trusted.

import { M, S } from '../world/materials.js';
import { bdef, createBuilding, salvageBuilding } from './buildings.js';
import { checkPlacement } from './placement.js';
import { canAfford, spend, refund } from './teams.js';
import { udef } from './units.js';
import { wallCellCost } from './construction.js';
import { updateLinks } from './network.js';

export function applyCommand(game, c) {
  const team = game.teams[c.team];
  if (!team) return { ok: false, reason: 'no team' };
  switch (c.t) {
    case 'build': {
      const chk = checkPlacement(game, c.team, c.type, c.x, c.y);
      if (!chk.ok) return chk;
      const def = bdef(game, c.type);
      spend(team, def.cost);
      const b = createBuilding(game, c.type, c.team, c.x, c.y, { built: !!game.opts.instantBuild });
      if (b.done && c.type === 'relay') updateLinks(game);
      team.lastBuild = { kind: 'building', type: c.type };
      game.undo[c.team] = { kind: 'building', id: b.id };
      game.events.emit('placed', { id: b.id, type: c.type, team: c.team });
      return { ok: true, id: b.id };
    }
    case 'paint': {
      // cells: [[x, y], ...]; mat: material id. Only empty/loose cells take a blueprint.
      const w = game.world;
      if (!game.isUnlocked(c.team, wallKey(game, c.mat))) return { ok: false, reason: 'locked' };
      const added = [];
      for (const [x, y] of c.cells) {
        if (!w.inBounds(x, y) || x < 2 || x >= w.w - 2) continue;
        const i = w.idx(x, y);
        const m = w.mat[i];
        if (m !== M.EMPTY && w.mats.state[m] !== S.LOOSE) continue;
        if (w.plan[i] && w.planTeam[i] !== c.team) continue;
        w.plan[i] = c.mat; w.planTeam[i] = c.team;
        game.planCells[c.team].add(i);
        game.rebuilds.delete(i);
        w.touchGfx(x, y);
        added.push(i);
      }
      if (added.length) {
        team.lastBuild = { kind: 'wall', mat: c.mat };
        game.undo[c.team] = { kind: 'paint', cells: added };
      }
      return { ok: true, count: added.length };
    }
    case 'dig': {
      const w = game.world;
      const set = game.digCells[c.team];
      let n = 0;
      for (const [x, y] of c.cells) {
        if (!w.inBounds(x, y)) continue;
        const i = w.idx(x, y);
        const m = w.mat[i];
        if (m === M.EMPTY || m === M.BEDROCK || m === M.FOOTPRINT || w.mats.built[m]) continue;
        set.add(i); n++;
      }
      if (n) game.digDirty = true;
      return { ok: true, count: n };
    }
    case 'undig': {
      const w = game.world, set = game.digCells[c.team];
      for (const [x, y] of c.cells) if (w.inBounds(x, y)) set.delete(w.idx(x, y));
      game.digDirty = true;
      return { ok: true };
    }
    case 'salvageArea': {
      // Box: salvage walls (built cells refund 50%, blueprint-only cells are just removed) and
      // mark buildings for drone salvage.
      const w = game.world;
      const x0 = Math.max(0, Math.min(c.x0, c.x1)), x1 = Math.min(w.w - 1, Math.max(c.x0, c.x1));
      const y0 = Math.max(0, Math.min(c.y0, c.y1)), y1 = Math.min(w.h - 1, Math.max(c.y0, c.y1));
      const ids = new Set();
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = w.idx(x, y);
        const m = w.mat[i];
        if (m === M.FOOTPRINT && w.team[i] === c.team) { ids.add(w.owner[i]); continue; }
        if (w.plan[i] && w.planTeam[i] === c.team) { w.plan[i] = 0; w.planTeam[i] = 0; game.planCells[c.team].delete(i); w.touchGfx(x, y); }
        if (w.mats.built[m] && w.team[i] === c.team) {
          refund(team, wallCellCost(game, m), 0.5);
          w.set(x, y, M.EMPTY);
        }
        game.digCells[c.team].delete(i);
      }
      for (const id of ids) { const b = game.byId.get(id); if (b && b.type !== 'core') markSalvage(game, b); }
      return { ok: true };
    }
    case 'salvage': {
      for (const id of c.ids) { const b = game.byId.get(id); if (b && b.team === c.team && b.kind === 'b' && b.type !== 'core') markSalvage(game, b); }
      return { ok: true };
    }
    case 'cancelSalvage': {
      for (const id of c.ids) { const b = game.byId.get(id); if (b && b.team === c.team) { b.salvage = false; b.salvageT = 0; } }
      return { ok: true };
    }
    case 'undo': {
      const u = game.undo[c.team];
      if (!u) return { ok: false, reason: 'Nothing to undo' };
      game.undo[c.team] = null;
      if (u.kind === 'building') {
        const b = game.byId.get(u.id);
        if (!b || b.progress > 0.02) return { ok: false, reason: 'Already started' };
        salvageBuilding(game, b); // unfinished buildings refund 100%
        return { ok: true };
      }
      if (u.kind === 'paint') {
        const w = game.world;
        for (const i of u.cells) {
          if (w.mat[i] === w.plan[i]) continue; // already built: keep
          w.plan[i] = 0; w.planTeam[i] = 0; game.planCells[c.team].delete(i);
          w.touchGfx(i % w.w, (i / w.w) | 0);
        }
        return { ok: true };
      }
      return { ok: false };
    }
    case 'train': {
      const b = game.byId.get(c.id);
      if (!b || b.team !== c.team || !b.done) return { ok: false, reason: 'Not ready' };
      const def = bdef(game, b.type);
      if (!def.trains || !def.trains.includes(c.unit)) return { ok: false, reason: "Can't train that here" };
      if (!game.isUnlocked(c.team, c.unit)) return { ok: false, reason: 'Not available in this mission' };
      if (b.queue.length >= 5) return { ok: false, reason: 'Queue full' };
      const ud = udef(game, c.unit);
      if (ud.max) {
        const have = game.units.filter((u) => u.team === c.team && u.type === c.unit).length + game.buildings.reduce((n, bb) => n + (bb.team === c.team ? bb.queue.filter((q) => q === c.unit).length : 0), 0);
        if (have >= ud.max) return { ok: false, reason: `Max ${ud.max} ${ud.name}s` };
      }
      if (ud.pop) {
        const queued = game.buildings.reduce((n, bb) => n + (bb.team === c.team ? bb.queue.reduce((m, q) => m + (udef(game, q).pop || 0), 0) : 0), 0);
        if (team.pop + queued + ud.pop > team.popCap) return { ok: false, reason: 'Population cap reached' };
      }
      if (!canAfford(team, ud.cost)) return { ok: false, reason: 'Not enough resources', poor: true };
      spend(team, ud.cost);
      b.queue.push(c.unit);
      return { ok: true };
    }
    case 'cancelTrain': {
      const b = game.byId.get(c.id);
      if (!b || b.team !== c.team) return { ok: false };
      const idx = c.index ?? b.queue.length - 1;
      if (idx < 0 || idx >= b.queue.length) return { ok: false };
      const [ut] = b.queue.splice(idx, 1);
      refund(team, udef(game, ut).cost, 1);
      if (idx === 0) b.trainT = 0;
      return { ok: true };
    }
    case 'rally': {
      for (const id of c.ids) { const b = game.byId.get(id); if (b && b.team === c.team) b.rally = { x: c.x, y: c.y }; }
      return { ok: true };
    }
    case 'targeting': {
      for (const id of c.ids) { const b = game.byId.get(id); if (b && b.team === c.team) b.targeting = c.mode; }
      return { ok: true };
    }
    case 'toggle': {
      for (const id of c.ids) { const b = game.byId.get(id); if (b && b.team === c.team) b.on = !b.on; }
      return { ok: true };
    }
    case 'order': {
      // order: {t:'move'|'attack'|'amove'|'hold'|'stop'|'patrol'|'deploy', x, y, target}
      let n = 0;
      for (const id of c.ids) {
        const u = game.byId.get(id);
        if (!u || u.kind !== 'u' || u.team !== c.team) continue;
        const o = { ...c.order };
        if (o.t === 'deploy') { game.toggleDeploy(u); continue; }
        if (o.t === 'stop') { u.order = { t: 'idle' }; u.orders = []; u.path = null; u.forceTarget = 0; continue; }
        if (u.deployed && o.t !== 'hold') game.toggleDeploy(u);
        if (c.queue && u.order.t !== 'idle') u.orders.push(o);
        else { u.order = o; u.orders = []; u.path = null; u.forceTarget = o.t === 'attack' ? o.target : 0; if (o.t === 'patrol') o.from = { x: u.x, y: u.y }; }
        n++;
      }
      return { ok: true, count: n };
    }
    case 'research': {
      return game.startResearch(c.team, c.id, c.key);
    }
    case 'ability': {
      return game.useAbility(c.team, c.id, c.key, c.x, c.y);
    }
    case 'callWave': {
      return game.callWaveEarly(c.team);
    }
  }
  return { ok: false, reason: 'unknown command' };
}

function markSalvage(game, b) {
  if (!b.done) { salvageBuilding(game, b); return; } // unfinished: instant, full refund
  b.salvage = true; b.salvageT = 0;
}

function wallKey(game, mat) {
  for (const k in game.data.buildings.walls) if (game.data.buildings.walls[k].mat === mat) return k;
  return null;
}
