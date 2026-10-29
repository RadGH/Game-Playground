// Casting (PLAN M6, §3.3 `arm` / `disarm` / `cast`). PURE.
//
// A cast is TWO separate actions, like a fire mission: pull a cartridge (`arm` — the key turns itself for
// mana.json `arm.ticks`), then `cast` with the target the light pen marked. A cast is refused, in plain words, when:
// nothing (or another spell) is armed, the key is still turning, the spell's tier is above the cap, the cartridge is
// still recharging, the store is short, the target is off the map, the line is too long or too short, or the target is
// not in sight. THE SIGHT RULE: a spell lands only on a cell the scope sees LIVE right now (inside a sensor circle, not
// hidden by smoke, lit or daylight); a sensor flare (`sight: 'sensor'`) only needs to be inside a sensor circle — it is
// how you see in the dark.
//
// After FIRE the cost leaves the store at once, the key springs back (disarmed), and the spell travels: it lands
// `travel.base + travel.perCell × distance from the HQ` ticks later. Active spells (in flight, burning, standing) live
// in `sim.mana.active` — JSON-safe records the console draws and a save keeps.

import { createEffects } from './effects.js';

export function createSpells(sim, M6) {
  const { world } = sim;
  const g = world.g;
  const SP = M6.spells;
  const fx = createEffects(sim, { combos: M6.combos });
  let nextId = 1;

  function hq() { return sim.ents.list('building').find((b) => b.type === 'hq') || null; }
  function travelTicks(def, x, y) {
    const h = hq();
    const hx = h ? h.fp.cx : world.meta.hq.x, hy = h ? h.fp.cy : world.meta.hq.y;
    const d = Math.sqrt((x - hx) * (x - hx) + (y - hy) * (y - hy));
    return Math.max(1, Math.round(def.travel.base + def.travel.perCell * d));
  }

  /** Why (x, y) cannot be targeted by a spell with sight mode `mode`, in plain words — or null. */
  function sightWhy(x, y, mode = 'live') {
    if (!g.inside(x, y)) return 'That is off the map.';
    const sensors = sim.sensors();
    const inSensor = sensors.some((s) => (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) <= s.r * s.r);
    if (mode === 'sensor') return inSensor ? null : 'Out of sensor range — even a flare needs a sensor to guide it there.';
    const q = g.qIdx(x, y);
    if (g.fog[q] === 2) return null;
    if (g.fog[q] === 0) return 'The scope has never seen that spot — a spell needs live sight.';
    if (!inSensor) return 'That spot is outside every sensor circle — a spell needs live sight.';
    if (g.gasDensity[q] >= sim.data.balance.sight.smokeBlocks) return 'Smoke hides the target — a spell needs live sight.';
    const daylight = sim.clock.daylightAt(sim.clock.hourAt(sim.tick));
    if (daylight < sim.data.balance.sight.darkBelow) return 'Too dark to see the target — light it, or send a sensor flare first.';
    return 'The target is not in live sight.';
  }

  /** Every refusal of a cast, in order, or null. Shared by the command and the console's FIRE lamp (via hud). */
  function castWhy(cmd) {
    const def = SP[cmd.spell];
    if (!def) return 'There is no such cartridge on the Spell Board.';
    if (!M6.hasRefinery()) return 'The Spell Board has no feed yet — raise a mana refinery inside the HQ yard ring.';
    const A = M6.state.armed;
    if (!A || A.spell !== cmd.spell) return `Arm it first: pull the ${def.name.toLowerCase()} cartridge, then fire.`;
    if (sim.tick < A.ready) return 'The key is still turning.';
    const tw = M6.tierWhy(def); if (tw) return tw;
    const cool = (M6.state.cooling[def.id] || 0) - sim.tick;
    if (cool > 0) return `The ${def.name.toLowerCase()} cartridge is still recharging (${Math.ceil(cool / 20)} s).`;
    if (M6.store() < def.cost) return `Not enough mana: ${def.name.toLowerCase()} needs ${def.cost}, the store holds ${Math.floor(M6.store())}.`;
    const x = Math.round(cmd.x), y = Math.round(cmd.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 'Mark a target on the scope with the light pen first.';
    if (def.shape === 'line') {
      if (cmd.x2 == null || cmd.y2 == null) return `Draw the ${def.name.toLowerCase()} on the scope: drag the light pen from one end to the other.`;
      const x2 = Math.round(cmd.x2), y2 = Math.round(cmd.y2);
      const L = Math.sqrt((x2 - x) * (x2 - x) + (y2 - y) * (y2 - y));
      if (L < 4) return 'Draw the line longer.';
      if (L > def.maxLen) return `That line is ${Math.round(L / 2)} m — the ${def.name.toLowerCase()} reaches at most ${Math.round(def.maxLen / 2)} m.`;
      const w = sightWhy(x, y, def.sight) || sightWhy(x2, y2, def.sight);
      if (w) return w;
      return null;
    }
    return sightWhy(x, y, def.sight);
  }

  function arm(cmd) {
    const def = SP[cmd.spell];
    if (!def) return 'There is no such cartridge on the Spell Board.';
    if (!M6.hasRefinery()) return 'The Spell Board has no feed yet — raise a mana refinery inside the HQ yard ring.';
    const tw = M6.tierWhy(def); if (tw) return tw;
    M6.state.armed = { spell: def.id, at: sim.tick, ready: sim.tick + M6.cfg.arm.ticks };
    sim.events.push({ e: 'spellArmed', tick: sim.tick, base: sim.base, spell: def.id, ready: M6.state.armed.ready });
    return null;
  }
  function disarm() {
    if (!M6.state.armed) return 'Nothing is armed.';
    const s = M6.state.armed.spell;
    M6.state.armed = null;
    sim.events.push({ e: 'spellDisarmed', tick: sim.tick, base: sim.base, spell: s });
    return null;
  }

  function cast(cmd) {
    const why = castWhy(cmd);
    if (why) return why;
    const def = SP[cmd.spell];
    const x = Math.round(cmd.x), y = Math.round(cmd.y);
    M6.spend(def.cost, 'spell');
    M6.state.cooling[def.id] = sim.tick + def.cooldown;
    M6.state.armed = null;
    const a = { id: nextId++, spell: def.id, x, y, castAt: sim.tick, landAt: 0, cost: def.cost, landed: false };
    if (def.shape === 'line') { a.x2 = Math.round(cmd.x2); a.y2 = Math.round(cmd.y2); }
    const mx = a.x2 != null ? (x + a.x2) / 2 : x, my = a.y2 != null ? (y + a.y2) / 2 : y;
    a.landAt = sim.tick + travelTicks(def, mx, my);
    // a spell cast at night inside a flare's light earns the NIGHT STRIKE commendation when it lands
    a.night = sim.clock.daylightAt(sim.clock.hourAt(sim.tick)) < sim.data.balance.sight.darkBelow && M6.state.active.some((f) => f.spell === 'flare' && f.landed && (x - f.x) * (x - f.x) + (y - f.y) * (y - f.y) <= f.r * f.r);
    M6.state.active.push(a);
    sim.events.push({ e: 'spellCast', tick: sim.tick, base: sim.base, spell: def.id, id: a.id, x, y, x2: a.x2, y2: a.y2, landAt: a.landAt, eta: a.landAt - sim.tick, cost: def.cost });
    return null;
  }

  function land(a) {
    const def = SP[a.spell];
    a.landed = true;
    const out = fx[a.spell].land(a, def) || {};
    M6.glow.spell(def, a.x2 != null ? (a.x + a.x2) >> 1 : a.x, a.y2 != null ? (a.y + a.y2) >> 1 : a.y, a.r || (def.shape === 'line' ? 16 : 12));
    if (a.night && a.spell !== 'flare') M6.combos.hit('night-strike', a);
    M6.state.lastLanding = { tick: sim.tick, x: a.x, y: a.y, spell: a.spell };
    sim.events.push({ e: 'spellLanded', tick: sim.tick, base: sim.base, spell: a.spell, id: a.id, x: a.x, y: a.y, x2: a.x2, y2: a.y2, ...out });
  }

  /** One tick: land what has arrived, keep the standing spells going, retire the finished ones. */
  function step() {
    const act = M6.state.active;
    for (let k = 0; k < act.length; k++) {
      const a = act[k], E = fx[a.spell];
      if (!a.landed) { if (sim.tick < a.landAt) continue; land(a); if (!E.tick) a.done = true; continue; }
      if (!E.tick || !E.tick(a, SP[a.spell])) a.done = true;
    }
    for (let k = act.length - 1; k >= 0; k--) {
      if (!act[k].done) continue;
      const a = act[k];
      act.splice(k, 1);
      sim.events.push({ e: 'spellEnded', tick: sim.tick, base: sim.base, spell: a.spell, id: a.id });
    }
  }

  /** Is cell (x, y) inside a live shield bubble? (M4: enemies may not step in, shots may not cross.) */
  function inShield(x, y) {
    for (const a of M6.state.active) if (a.spell === 'shield' && a.landed && (x - a.x - 0.5) * (x - a.x - 0.5) + (y - a.y - 0.5) * (y - a.y - 0.5) < a.r * a.r) return a;
    return null;
  }
  /** Does a shot from (x0, y0) to (x1, y1) (cells) cross a shield's skin? (one end inside, the other outside) */
  function shotBlocked(x0, y0, x1, y1) {
    for (const a of M6.state.active) {
      if (a.spell !== 'shield' || !a.landed) continue;
      const r2 = a.r * a.r, cx = a.x + 0.5, cy = a.y + 0.5;
      const i0 = (x0 - cx) * (x0 - cx) + (y0 - cy) * (y0 - cy) < r2, i1 = (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy) < r2;
      if (i0 !== i1) return true;
      if (!i0) {
        // both outside: does the segment pass through the dome?
        const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / L2)) : 0;
        const px = x0 + dx * t - cx, py = y0 + dy * t - cy;
        if (px * px + py * py < r2) return true;
      }
    }
    return false;
  }

  return { arm, disarm, cast, castWhy, sightWhy, step, inShield, shotBlocked, travelTicks, fx, get nextId() { return nextId; }, set nextId(v) { nextId = v; } };
}
