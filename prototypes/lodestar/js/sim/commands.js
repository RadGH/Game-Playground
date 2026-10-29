// Commands (console → sim, PLAN §3.3). PURE. Every command is checked; a refused one answers with a `refused` event
// that says why in plain words (and, for a road, where: `gaps`). The console never changes game state itself.
// Later milestones add commands through `sim.hooks.commands[name] = (sim, cmd) => refusal | null`.

const LATER = {
  drawWall: 'No wall crews have arrived yet — walls are not on the ledger.',
  addGate: 'There are no walls to put a gate in yet.',
  drawRail: 'Rails are not available yet.',
  setOrder: 'There are no squads to give orders to yet.',
  clearOrder: 'There are no squads to give orders to yet.',
  trainSquad: 'There is no barracks yet.',
  makeLine: 'Haul lines arrive with the Dispatch Board.', editLine: 'Haul lines arrive with the Dispatch Board.', deleteLine: 'Haul lines arrive with the Dispatch Board.',
  buyVehicle: 'Vehicles are bought with haul lines, which have not arrived yet.',
  queueResearch: 'The Calculator has not arrived yet.', unqueueResearch: 'The Calculator has not arrived yet.',
  cast: 'There is no mana store yet.', launch: 'There is no launch pad yet.', buildModule: 'There is no station yet.',
  land: 'There is nowhere else to land yet.', warp: 'There is no warp drive yet.', tradeRoute: 'There are no trade routes yet.',
};

export function applyCommand(sim, cmd) {
  const refuse = (why, extra = {}) => { sim.events.push({ e: 'refused', tick: sim.tick, base: sim.base, cmd: cmd.t, why, ...extra }); return { ok: false, why }; };
  const ok = (extra = {}) => ({ ok: true, ...extra });
  const W = sim.world;
  switch (cmd.t) {
    case 'build': {
      if (!cmd.type) return refuse('Pick a building from the Build Ledger first.');
      const r = sim.buildings.place(cmd.type, Math.round(cmd.x), Math.round(cmd.y));
      if (!r.ok) return refuse(r.why, { type: cmd.type, x: cmd.x, y: cmd.y });
      sim.history.push({ tick: sim.tick, kind: 'building', id: r.id });
      return ok({ id: r.id });
    }
    case 'demolish': {
      let b = cmd.id ? sim.ents.get(cmd.id) : null;
      if (!b && cmd.x != null) b = sim.buildings.at(Math.round(cmd.x), Math.round(cmd.y));
      if (b && b.kind === 'building') { const r = sim.buildings.demolish(b); return r.ok ? ok() : refuse(r.why); }
      if (cmd.x != null && sim.defence) {
        // M4: CLEAR on a gate seals it; on a wall takes that 4 m section away
        const w = sim.defence.walls.clearAt(cmd.x, cmd.y);
        if (w) { sim.events.push({ e: 'destroyed', tick: sim.tick, base: sim.base, type: w === 'sealed' ? 'gate' : 'wall', name: w === 'sealed' ? 'Gate' : 'Wall section', x: Math.round(cmd.x), y: Math.round(cmd.y), by: 'clear' }); return ok(); }
      }
      if (cmd.x != null) {
        const n = sim.roads.near(cmd.x, cmd.y, 4);
        if (n) { sim.roads.erase(n.v.id, n.at - 10, n.at + 10); sim.events.push({ e: 'destroyed', tick: sim.tick, base: sim.base, id: n.v.id, type: 'road', name: 'Road', x: Math.round(cmd.x), y: Math.round(cmd.y), by: 'clear' }); return ok(); }
      }
      return refuse('There is nothing there to clear.');
    }
    case 'drawRoad': {
      const p = sim.roads.plan(cmd.pts);
      if (!p.ok) return refuse(p.why, { gaps: p.gaps, unlock: p.unlock });
      const short = sim.shortOf(p.cost);
      if (short) return refuse(`The bridge needs ${short}.`, { gaps: [] });
      const v = sim.roads.add(p);
      sim.history.push({ tick: sim.tick, kind: 'road', id: v.id });
      sim.events.push({ e: 'roadPlanned', tick: sim.tick, base: sim.base, id: v.id, len: v.len, bridge: v.bridge, cost: p.cost, joins: p.joins.length });
      return ok({ id: v.id });
    }
    case 'eraseVector': {
      const v = sim.roads.get(cmd.id);
      if (!v && sim.defence?.walls.get(cmd.id)) { sim.defence.walls.erase(cmd.id, cmd.from ?? 0, cmd.to ?? Infinity); return ok(); } // M4
      if (!v) return refuse('There is no such road.');
      sim.roads.erase(cmd.id, cmd.from ?? 0, cmd.to ?? Infinity);
      return ok();
    }
    case 'undo': {
      const last = sim.history[sim.history.length - 1];
      if (!last || sim.tick - last.tick > sim.data.econ.undoTicks) return refuse('There is nothing recent to take back.');
      sim.history.pop();
      if (last.kind === 'building') { const b = sim.ents.get(last.id); if (b) sim.buildings.demolish(b, { undo: true }); }
      else if (last.kind === 'wall') sim.defence.walls.undo(last.id); // M4
      else if (last.kind === 'road') {
        const v = sim.roads.get(last.id);
        if (v) {
          const back = {};
          for (const sp of v.spans) for (const [r, n] of Object.entries(sp.delivered)) back[r] = (back[r] || 0) + n;
          sim.roads.erase(last.id);
          if (Object.keys(back).length) sim.dropPile(v.pts[0][0], v.pts[0][1], back);
        }
      }
      sim.events.push({ e: 'undone', tick: sim.tick, base: sim.base, kind: last.kind, id: last.id });
      return ok();
    }
    case 'setRecipe': {
      const b = sim.ents.get(cmd.id);
      if (!b || b.kind !== 'building') return refuse('There is no such building.');
      const why = sim.production.setRecipe(b, cmd.recipe);
      return why ? refuse(why) : ok();
    }
    case 'setKeep': {
      const b = sim.ents.get(cmd.id);
      if (!b || b.kind !== 'building') return refuse('There is no such building.');
      if (!sim.data.R[cmd.res]) return refuse('There is no such resource.');
      const n = cmd.n === null || cmd.n === undefined ? null : Math.max(0, Math.round(cmd.n));
      const def = sim.data.B[b.type];
      if (def.ring && b.type !== 'hq') { b.keepHere = b.keepHere || {}; if (!n) delete b.keepHere[cmd.res]; else b.keepHere[cmd.res] = n; }
      else if (def.recipes) b.keep = { ...b.keep, [cmd.res]: n };
      else return refuse(`A ${def.name.toLowerCase()} makes nothing to keep in stock.`);
      sim.dirty.add(b.id);
      return ok();
    }
    // ---- dev / test only (the bench and the specs)
    case 'dev.paint': W.paint(cmd.x | 0, cmd.y | 0, cmd.r | 0, cmd.mat); return ok();
    case 'dev.ignite': W.igniteArea(cmd.x | 0, cmd.y | 0, cmd.r ?? 2); return ok();
    case 'dev.blast': W.blast(cmd.x, cmd.y, cmd.r, cmd.power ?? 1); return ok();
    case 'dev.frost': W.frost(cmd.x, cmd.y, cmd.r); return ok();
    case 'dev.lightning': W.lightning(cmd.x, cmd.y); return ok();
    case 'dev.rain': W.rain(cmd.x, cmd.y, cmd.r, cmd.ticks ?? 400); return ok();
    case 'dev.rainAll': W.setRain(!!cmd.on); return ok();
    case 'dev.wind': W.setWind(cmd.dir, cmd.strength); return ok();
    case 'dev.hour': sim.clock.setHour(sim.tick, cmd.hour); sim.updateFog(); return ok();
    case 'dev.smoke': sim.smoke(cmd.x, cmd.y, cmd.r ?? 12); return ok();
    case 'dev.give': { const hq = sim.stores.hqPool(); if (hq) sim.stores.put(hq, cmd.res, cmd.n | 0); return ok(); }
    default: {
      const h = sim.hooks.commands[cmd.t];
      if (h) {
        const r = h(sim, cmd);
        // a hook answers with a refusal string, null (done), or { ok, id, ... } / { why, ...extra }
        if (r && typeof r === 'object') return r.why ? refuse(r.why, r.extra || {}) : ok(r);
        return r ? refuse(r) : ok();
      }
      if (LATER[cmd.t]) return refuse(LATER[cmd.t]);
      return refuse(`Unknown order "${cmd.t}".`);
    }
  }
}
