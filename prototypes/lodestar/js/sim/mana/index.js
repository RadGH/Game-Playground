// Mana (PLAN M6, §0.11). PURE. The HQ's mana store, the batteries, refining, Glow, crystal regrowth and the spells.
//
//   installMana(sim) → sim.mana (safe to call more than once). js/sim/systems.js calls it from the `mana` row, so a
//   sim made by createSim gets it on its first step; tests and tools may call it straight away.
//
// THE STORE (one per base — mana is planet-specific and never moves between bases). Kept in thousandths so the slow
// regen is exact integer maths. Cap = mana.json store.cap + every built battery's capByLevel[global battery level].
//   * regen: `regenPerSecond` while the store is under `regenShare` of the cap — and no further;
//   * refining: the mana refinery (a normal producer, recipes.json refine_mana) must stand inside the HQ yard ring, so
//     the jars of refined mana it makes are in the HQ's own store; every `sweepEvery` ticks they are poured into the
//     mana store while there is room (nothing teleports — the HQ is where the store is). This is the only way past
//     the regen share: mana ultimately needs mana crystal;
//   * batteries raise the cap (and open spell tiers). One destroyed while charged BURSTS (radius grows with the
//     charge it held); one pulled down is bled safely. "Destroyed" = its hp fell to 0 (M4's damage sets that).
//
// Extension points (later milestones): sim.mana.spend(n, why) / canSpend(n) — empowered units, wards (M12);
//   sim.mana.inShield(x, y), sim.mana.shotBlocked(x0, y0, x1, y1) — M4's movement and shots respect shield bubbles;
//   sim.mana.glow.at(x, y) — the Glow field M4's nests and M14b's Glowfeeders read; enemies' `slowUntil`/`slowBy`
//   (frost snap) — M4's movement should multiply speed by (1 - slowBy) until then; sim.hooks.damage — M4's damage
//   rule (js/sim/mana/harm.js asks it first).

import { createGlow } from './glow.js';
import { createCrystals } from './crystals.js';
import { createCombos } from './combos.js';
import { createSpells } from './spells.js';

const K = 1000; // the store is kept in thousandths

export function installMana(sim) {
  if (sim.mana) return sim.mana;
  const raw = sim.data.raw;
  if (!raw.mana || !raw.spells) throw new Error('mana: load data/mana.json and data/spells.json (tools/lib-data.mjs DATA_FILES)');
  const cfg = raw.mana;
  const SP = Object.fromEntries(raw.spells.list.map((s) => [s.id, s]));
  if (sim.levels.battery === undefined) sim.levels.battery = 1;
  const regenPerTick = Math.round((cfg.store.regenPerSecond * K) / 20);

  const state = {
    milli: Math.round(cfg.store.start * K),
    armed: null,            // { spell, at, ready }
    cooling: {},            // spell → tick it can fire again
    active: [],             // spells in flight / standing (js/sim/mana/spells.js)
    refined: 0, regenerated: 0, spent: 0,
    lastLanding: null,
  };
  const M6 = {
    cfg, spells: SP, state,
    stats: { damage: 0, buildingHits: 0, bursts: 0 },
  };
  sim.mana = M6;
  M6.glow = createGlow(sim, cfg.glow);
  M6.combos = createCombos(sim, raw.spells.combos.list);
  M6.crystals = createCrystals(sim, cfg.crystal);

  // ---- the store
  const batteryCap = () => cfg.battery.capByLevel[String(sim.levels.battery || 1)] ?? cfg.battery.capByLevel['1'];
  const builtBatteries = () => sim.ents.list('building').filter((b) => b.type === 'battery' && b.built >= 1 && b.hp > 0);
  M6.cap = () => cfg.store.cap + builtBatteries().length * batteryCap();
  M6.store = () => state.milli / K;
  M6.regenTo = () => M6.cap() * cfg.store.regenShare;
  M6.tier = () => { let t = 0; for (const r of cfg.tiers) if (M6.cap() >= r.cap) t = r.tier; return t; };
  M6.tierWhy = (def) => {
    const row = cfg.tiers.find((r) => r.tier === def.tier);
    if (!row || M6.cap() >= row.cap) return null;
    return `${def.name} is a tier ${row.name} spell: it needs a mana cap of ${row.cap} (the cap is ${M6.cap()}). Batteries raise the cap.`;
  };
  M6.canSpend = (n) => state.milli >= Math.round(n * K);
  /** Take n mana from the store (spells, and later empowered units). Returns false (and takes nothing) when short. */
  M6.spend = (n, why = 'other') => {
    const m = Math.round(n * K);
    if (state.milli < m) return false;
    state.milli -= m; state.spent += n;
    void why;
    return true;
  };
  M6.hasRefinery = () => sim.ents.list('building').some((b) => b.type === 'mana_refinery' && b.built >= 1);

  /** Is building b (or a footprint centre) inside the HQ's yard ring (any ring of the pool the HQ is in)? */
  function inHqRing(cx, cy) {
    const hqPool = sim.stores.hqPool();
    if (!hqPool) return false;
    return hqPool.owners.some((o) => { const r = sim.data.B[o.type].ring, dx = o.fp.cx - cx, dy = o.fp.cy - cy; return dx * dx + dy * dy <= r * r; });
  }
  M6.inHqRing = inHqRing;

  // ---- spells
  M6.cast = createSpells(sim, M6);
  M6.inShield = M6.cast.inShield;
  M6.shotBlocked = M6.cast.shotBlocked;
  M6.sightWhy = M6.cast.sightWhy;

  // ---- hooks into the sim
  sim.hooks.commands.arm = (s, cmd) => M6.cast.arm(cmd);
  sim.hooks.commands.disarm = () => M6.cast.disarm();
  sim.hooks.commands.cast = (s, cmd) => M6.cast.cast(cmd);
  // dev / test only (§3.3 dev.*): never sent by a machine
  sim.hooks.commands['dev.mana'] = (s, cmd) => { state.milli = Math.max(0, Math.min(M6.cap(), cmd.n ?? M6.cap())) * K; return null; };
  sim.hooks.commands['dev.raise'] = (s, cmd) => { const r = sim.buildings.place(cmd.type, Math.round(cmd.x), Math.round(cmd.y), { free: true, instant: true }); return r.ok ? null : r.why; };
  sim.hooks.commands['dev.wild'] = (s, cmd) => {
    // with M4 there: a real (posted, standing still) creature of a real kind, tied to the nearest nest so it is kept
    const D = sim.defence, nests = sim.ents.list('nest');
    if (D?.enemies?.spawn && D.DD?.E && nests.length) {
      const type = D.DD.E[cmd.type] ? cmd.type : Object.keys(D.DD.E)[0];
      let n = nests[0], bd = Infinity;
      for (const q of nests) { const d = (q.x / 256 - cmd.x) * (q.x / 256 - cmd.x) + (q.y / 256 - cmd.y) * (q.y / 256 - cmd.y); if (d < bd) { bd = d; n = q; } }
      const e = D.enemies.spawn(type, Math.floor(cmd.x), Math.floor(cmd.y), { still: true, nest: n.id });
      if (cmd.hp) { e.hp = cmd.hp; e.hpMax = cmd.hp; }
      return null;
    }
    sim.ents.add('enemy', { type: cmd.type || 'dummy', family: 'test', x: Math.round(cmd.x * 256), y: Math.round(cmd.y * 256), hp: cmd.hp ?? 100, hpMax: cmd.hp ?? 100, team: 1, raid: null, target: null, still: true }); return null; };
  sim.hooks.commands['dev.hp'] = (s, cmd) => { const e = sim.ents.get(cmd.id); if (!e) return 'There is no such thing.'; e.hp = cmd.hp; return null; };
  (sim.hooks.place ||= []).push((def, fp) => (def.inHqRing && !inHqRing(fp.cx, fp.cy) ? `The ${def.name.toLowerCase()} must stand inside the HQ's yard ring — its mana goes straight into the HQ's store.` : null));
  let refineryDelivered = sim.ents.list('building').some((b) => b.type === 'mana_refinery' && b.built >= 1);
  sim.hooks.built.push((b) => {
    if (b.type === 'mana_refinery' && !refineryDelivered) {
      refineryDelivered = true;
      for (const machine of ['gauge', 'spellboard']) sim.events.push({ e: 'machineUnlocked', tick: sim.tick, base: sim.base, machine });
    }
  });
  // flares are sensors while they burn, and they LIGHT the ground under them (the night sight rule reads the light)
  sim.hooks.sensors.push(() => {
    const out = [];
    for (const a of state.active) {
      if (a.spell !== 'flare' || !a.landed) continue;
      const F = SP.flare.flare;
      out.push({ x: a.x, y: a.y, r: F.sensorR, id: -a.id });
      lightDisc(a.x, a.y, F.r, F.light);
    }
    return out;
  });
  function lightDisc(x, y, r, v) {
    const g = sim.world.g, rq = Math.ceil(r / 4), qx = x >> 2, qy = y >> 2;
    for (let dy = -rq; dy <= rq; dy++) for (let dx = -rq; dx <= rq; dx++) {
      if (dx * dx + dy * dy > rq * rq) continue;
      const xx = qx + dx, yy = qy + dy;
      if (xx < 0 || yy < 0 || xx >= g.QW || yy >= g.QH) continue;
      const q = yy * g.QW + xx;
      if (g.light[q] < v) g.light[q] = v;
    }
  }
  sim.hooks.hud.push((out) => { out.mana = M6.hud(); });

  // ---- one tick
  // what each live battery holds (not saved: worked out again every tick from the store)
  const tracked = new Map(); // id → { ent, charge }
  function trackBatteries() {
    const list = sim.ents.list('building').filter((b) => b.type === 'battery' && b.built >= 1);
    for (const b of list) if (b.hp <= 0 && !b.burst) burst(b, tracked.get(b.id)?.charge ?? 0);
    const on = new Set(list.map((b) => b.id));
    for (const [id, rec] of tracked) {
      if (on.has(id)) continue;
      // gone from the map: destroyed (hp 0) bursts; one pulled down is bled safely by its crew
      if (rec.ent.hp <= 0 && !rec.ent.burst) burst(rec.ent, rec.charge);
      tracked.delete(id);
    }
    const live = list.filter((b) => b.hp > 0);
    const share = live.length ? Math.max(0, state.milli / K - cfg.store.cap) / live.length : 0;
    for (const b of live) tracked.set(b.id, { ent: b, charge: share });
    for (const b of list) if (b.hp <= 0) tracked.delete(b.id);
    // a smaller cap (a battery lost) spills the mana above it
    const capM = M6.cap() * K;
    if (state.milli > capM) state.milli = capM;
  }
  function burst(b, charge) {
    b.burst = true;
    const B = cfg.battery.burst, root = Math.sqrt(Math.max(0, charge));
    const r = Math.min(B.rMax, B.r0 + B.perRoot * root), power = Math.min(B.powerMax, B.power0 + B.powerPerRoot * root);
    state.milli = Math.max(0, state.milli - Math.round(charge * K));
    M6.stats.bursts++;
    const x = Math.round(b.fp.cx), y = Math.round(b.fp.cy);
    sim.world.blast(x, y, r, power, { by: 'battery' });
    M6.glow.burst(x, y, r, cfg.glow.spellBase + charge * cfg.glow.perMana);
    sim.events.push({ e: 'batteryBurst', tick: sim.tick, base: sim.base, id: b.id, x, y, r: Math.round(r * 10) / 10, power, charge: Math.round(charge) });
    const L = state.lastLanding;
    if (L && sim.tick - L.tick <= 10 && (L.x - x) * (L.x - x) + (L.y - y) * (L.y - y) <= 60 * 60) M6.combos.hit('battery-burst', { x, y });
  }

  function refineSweep() {
    const hq = sim.stores.hqPool();
    if (!hq) return;
    const have = sim.stores.stock(hq, 'mana');
    if (!have) return;
    const room = Math.floor((M6.cap() * K - state.milli) / K);
    const n = Math.min(have, room);
    if (n <= 0) return;
    sim.stores.take(hq, 'mana', n);
    state.milli += n * K; state.refined += n;
  }

  M6.step = () => {
    trackBatteries();
    const capM = M6.cap() * K, regenM = Math.floor(capM * cfg.store.regenShare);
    if (state.milli < regenM) { const n = Math.min(regenPerTick, regenM - state.milli); state.milli += n; state.regenerated += n / K; }
    if (sim.tick % cfg.sweepEvery === 0) refineSweep();
    M6.cast.step();
    if (sim.tick % cfg.glow.every === 0) {
      const src = [];
      for (const b of sim.ents.list('building')) {
        if (b.built < 1) continue;
        const charge = Math.min(1, state.milli / Math.max(1, capM));
        if (b.type === 'mana_refinery' && b.batch) src.push({ x: b.fp.cx, y: b.fp.cy, r: cfg.glow.refineryR, amount: cfg.glow.refinery, level: cfg.glow.refineryLevel });
        if (b.type === 'battery' && b.hp > 0) src.push({ x: b.fp.cx, y: b.fp.cy, r: cfg.glow.batteryR, amount: cfg.glow.battery * charge + 1, level: cfg.glow.batteryLevel * (0.25 + 0.75 * charge) });
      }
      M6.glow.step(src);
    }
    if (sim.tick % cfg.crystal.regrowEvery === 0) M6.crystals.step();
  };

  /** The needles and lamps the Mana Gauge and the Spell Board show (sent in every hud). */
  M6.hud = () => {
    const cap = M6.cap();
    const A = state.armed;
    const cooling = {};
    for (const [k, t] of Object.entries(state.cooling)) if (t > sim.tick) cooling[k] = t - sim.tick;
    return {
      store: Math.floor(state.milli / 100) / 10, cap, regenTo: M6.regenTo(), tier: M6.tier(),
      tiers: cfg.tiers.map((t) => t.cap), batteries: builtBatteries().length, refinery: M6.hasRefinery(),
      refining: sim.ents.list('building').some((b) => b.type === 'mana_refinery' && b.built >= 1 && b.batch),
      jars: (() => { const p = sim.stores.hqPool(); return p ? sim.stores.stock(p, 'mana') : 0; })(),
      armed: A ? { spell: A.spell, ready: Math.max(0, A.ready - sim.tick) } : null,
      cooling, combos: M6.combos.list(),
      active: state.active.map((a) => ({ id: a.id, spell: a.spell, x: a.x, y: a.y, x2: a.x2, y2: a.y2, castAt: a.castAt, landAt: a.landAt, landed: a.landed, until: a.until, r: a.r, prog: a.prog, phase: a.phase, len: a.pts?.length })),
    };
  };

  /** Save / load (M8 puts this under bases[planet].mana, §3.5). */
  M6.save = () => ({ store: M6.store(), cap: M6.cap(), milli: state.milli, armed: state.armed, cooling: { ...state.cooling }, active: JSON.parse(JSON.stringify(state.active)), combos: M6.combos.list(), nextId: M6.cast.nextId });
  M6.load = (s) => { state.milli = s.milli ?? Math.round((s.store || 0) * K); state.armed = s.armed || null; state.cooling = s.cooling || {}; state.active = s.active || []; M6.combos.restore(s.combos); M6.cast.nextId = s.nextId || 1; };

  return M6;
}
