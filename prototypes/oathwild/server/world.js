// One shared, saved world (≤ 10 players): the 20 Hz sim from js/rules/combat.js, the quest engine from
// js/world/quests.js, camps and roam zones from js/world/encounters.js, the ground from js/game/ground.js, and every
// window action a player can take (loot, talk, level-up, gear, shops, shrines, enchanting…). Pure apart from what it
// is handed: no sockets, no timers, no files — server/hub.js wires it, tests/net drive it with fake players.
//
//   const R = createWorldRoom({ rules, W, ground, scattered, meta, state, log, persist })
//   R.join({ key, char, send }) → player     R.leave(key)     R.message(key, msg)     R.step()     R.save()
//
// `meta` = { code, name, public, owner, created } · `state` = world-state.js record (or null for a new world)
// `persist({ world, chars })` is called with what to write (the hub writes files).
import {
  createWorld, addPlayer, removePlayer, refreshPlayer, step as simStep, respawnPlayer, die, castRefusal, spellPowerRange, spawnMonster, walkSpeedOf, knockUnit,
} from '../js/rules/combat.js';
import { createWorldState, fromJSON, toJSON, flagsFor, discoverShrine, setHomeShrine, homeShrine, clearCamp, campsToRespawn, note } from '../js/rules/world-state.js';
import { openFor, takeItem, takeGold, takeAll, chestOpenFor, chestDef, isEmptyFor, createContainer } from '../js/rules/loot.js';
import { levelUp, pendingLevels, respec, respecPrice, addXp, xpToReach } from '../js/rules/levels.js';
import { buyNode, choosePath, classDef, addToBar, spellSources, cleanNodes } from '../js/rules/classes.js';
import { takeTalent } from '../js/rules/talents.js';
import { spendAttrPoint } from '../js/rules/attributes.js';
import { sheetOf, attrTotals } from '../js/rules/sheet.js';
import { profSources } from '../js/rules/proficiency.js';
import { repairItem, repairPrice, enchant, disenchant, carriedWeight, mountDef } from '../js/rules/inventory.js';
import { auraList } from '../js/rules/auras.js';
import { finishCaster } from '../js/rules/casters.js';
import { makeRng, hashStr } from '../js/rules/farhold.js';
import { notify, escortTick, npcCall, talkTo, choose, npcAt, npcPresent, servicesOf, liveObjects, escorts } from '../js/world/quests.js';
import { spawnCampFor, spawnZone } from '../js/world/encounters.js';
import { equip, unequip, buyPrice, sellPrice, shopStock } from '../js/game/gear.js';
import { STEP, MAX_PLAYERS, VIEW_METRES, EVENT_METRES, UF, unpackButtons } from '../js/net/protocol.js';

const R2 = v => Math.round(v * 100) / 100;
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const TALK_METRES = 7, LOOT_METRES = 6, AREA_LOOT = 10, USE_METRES = 5, SHRINE_METRES = 10, FIND_METRES = 30;
const ZONE_RESPAWN_S = 90, CAMP_CLEAR_METRES = 45, SPAWN_SAFE_METRES = 35;

export function createWorldRoom({ rules, W, ground, meta, state = null, log = () => {}, persist = () => {}, seed = 1, dev = false }) {
  const { book, terrain: T, data } = W;
  const placements = data.placements;
  const ws = state ? fromJSON(state) : createWorldState({ id: meta.code, name: meta.name, seed });
  ws.found = Array.isArray(ws.found) ? ws.found : [];
  ws.at = ws.at && typeof ws.at === 'object' ? ws.at : {};               // where each character last stood in this world
  const world = createWorld(rules, { seed: (ws.seed * 7919 + Math.floor(ws.time)) >>> 0, flags: ws.flags });
  const players = new Map();          // key -> P
  const unitMeta = new Map();         // monster id -> { camp, zone }
  const activeCamps = new Set();
  const zones = new Map(placements.roam.map(z => [z.id, { z, alive: 0, emptySince: -1e9 }]));
  const extra = new Map();            // chest / quest-object containers by id (corpses live in world.containers)
  const stockCache = new Map();
  const rng = makeRng((ws.seed ^ 0x5bd1) >>> 0);
  let tick = 0, wsDirty = true, saveAt = 0;
  const stats = { steps: 0, stepMs: 0, maxStepMs: 0, bytesOut: 0 };
  const spawnAt = ground.standAt(data.map.spawn.at[0], data.map.spawn.at[1]);
  if (!ws.shrines.length) discoverShrine(ws, data.map.spawn.shrine);

  // ------------------------------------------------------------------ monsters
  function heroesIn(region) { let n = 0; for (const P of players.values()) { const u = unitOf(P); if (u && T.regionAt(u.x, u.z) === region) n++; } return Math.max(1, n); }
  function settleSpawned(units) { for (const u of units) { const p = ground.standAt(u.x, u.z); u.x = p.x; u.z = p.z; u.home = { x: p.x, z: p.z }; } }
  function fillCamp(id) {
    const row = Object.values(rules.data.regions.regions).find(r => r.camps?.[id]);
    const region = placements.camps.find(c => c.id === id)?.region || null;
    const units = spawnCampFor(world, placements, id, { heroes: region ? heroesIn(region) : 1, flags: ws.flags });
    settleSpawned(units);
    for (const u of units) unitMeta.set(u.id, { camp: id });
    if (units.length) activeCamps.add(id);
    return row ? units.length : 0;
  }
  function fillZone(Z) {
    const units = spawnZone(world, Z.z, { rng });
    settleSpawned(units);
    for (const u of units) unitMeta.set(u.id, { zone: Z.z.id });
    Z.alive = units.length;
  }
  function nearPlayer(at, r) { for (const P of players.values()) { const u = unitOf(P); if (u && Math.hypot(u.x - at[0], u.z - at[1]) < r) return true; } return false; }
  function populate(first = false) {
    for (const id of campsToRespawn(rules, ws, ws.time)) {
      if (activeCamps.has(id)) continue;
      const c = placements.camps.find(x => x.id === id);
      if (!first && c && nearPlayer(c.at, CAMP_CLEAR_METRES)) continue;   // never fill a camp in someone's face
      fillCamp(id);
    }
    for (const Z of zones.values()) {
      if (Z.alive > 0) continue;
      if (!first && ws.time - Z.emptySince < ZONE_RESPAWN_S) continue;
      if (!first && nearPlayer(Z.z.at, Math.max(30, Z.z.radius))) continue;
      fillZone(Z);
    }
  }
  populate(true);

  // ------------------------------------------------------------------ players
  const unitOf = P => (P?.unitId ? world.units.get(P.unitId) : null);
  function startPoint(char) {
    const saved = ws.at[char.id];
    if (saved && T.walkable(saved[0], saved[1])) return ground.standAt(saved[0], saved[1]);
    const sh = shrinePos(homeShrine(ws, char.id));
    return sh || spawnAt;
  }
  function shrinePos(id) {
    const s = placements.shrines.find(x => x.id === id);
    if (!s) return null;
    // stand a few metres in front of the shrine, on the side it faces
    const p = ground.standAt(s.at[0] + Math.sin(s.facing || 0) * 3.5, s.at[1] + Math.cos(s.facing || 0) * 3.5);
    return p;
  }
  function join({ key, char, send, name = null }) {
    const old = players.get(key);
    if (old) { old.send = send; old.away = 0; sendEnter(old); return old; }
    if (players.size >= MAX_PLAYERS) return { error: 'This world is full (10 players).' };
    for (const P of players.values()) if (P.char.id === char.id) return { error: 'That character is already in this world.' };
    // a magic item made before casters existed learns its element and style now (same item id = same answer)
    for (const it of [...Object.values(char.gear || {}), ...(char.bag || [])]) finishCaster(rules, it);
    // a hero saved on the old ranked trees (before 2026-11-26) moves onto the new ones: unknown nodes go, points back
    cleanNodes(rules, char);
    const at = startPoint(char);
    const shrine = shrinePos(homeShrine(ws, char.id)) || spawnAt;
    const u = addPlayer(world, char, { at: [at.x, at.z], shrine: [shrine.x, shrine.z] });
    u.safeUntil = world.t + 4;                       // arriving: a short grace (lessons rule 39)
    const P = { key, char, unitId: u.id, send, away: 0, inputs: [], last: null, ack: 0, seen: new Map(), loot: new Set(), meDirty: true, prevButtons: 0, chSlot: -1, target: null, joinedAt: world.t, name: name || char.name, saveAt: 0 };
    players.set(key, P);
    note(ws, `${char.name} arrived.`);
    broadcast({ t: 'say', text: `${char.name} has joined the world.`, kind: 'join' }, key);
    log('world.join', { code: meta.code, key, char: char.name, players: players.size });
    sendEnter(P);
    return P;
  }
  function sendEnter(P) {
    P.seen.clear();
    P.meDirty = true;
    P.send(JSON.stringify({ t: 'enter', world: { code: meta.code, name: meta.name, public: !!meta.public }, you: P.unitId, char: P.char, wt: world.t, step: STEP }));
    sendWorld(P);
  }
  function leave(key, { quiet = false } = {}) {
    const P = players.get(key);
    if (!P) return;
    const u = unitOf(P);
    if (u) ws.at[P.char.id] = [R2(u.x), R2(u.z)];
    removePlayer(world, P.unitId);
    players.delete(key);
    persist({ world: saveRecord(), chars: [{ key, char: P.char }] });
    if (!quiet) broadcast({ t: 'say', text: `${P.char.name} has left the world.`, kind: 'join' });
    log('world.leave', { code: meta.code, key, players: players.size });
  }
  /** A dropped connection keeps the hero in the world for AWAY_MS (the hub calls leave() after). */
  function away(key) { const P = players.get(key); if (P) { P.away = Date.now(); P.send = () => {}; P.inputs = []; P.last = null; } }

  // ------------------------------------------------------------------ messages
  function message(key, msg) {
    const P = players.get(key);
    if (!P) return;
    if (msg.t === 'in') {
      if (P.inputs.length > 6) {                      // a burst after a stall: keep the newest three …
        const dropped = P.inputs.splice(0, P.inputs.length - 3);
        const once = dropped.reduce((b, x) => b | ((x.b || 0) & (32 | 64 | 128)), 0);   // … but never lose a dodge / mount / respawn press
        if (once) P.inputs[0] = { ...P.inputs[0], b: (P.inputs[0].b || 0) | once };
      }
      P.inputs.push(msg);
      return;
    }
    // dev builds only (the LAN dev server; never `stable…`): jump somewhere for screenshots and look checks
    if (msg.t === 'devTp' && dev) { const u = unitOf(P); if (u && Number.isFinite(msg.x) && Number.isFinite(msg.z)) { u.x = msg.x; u.z = msg.z; u.safeUntil = world.t + 600; P.teleport = true; } return; }
    // dev builds only: hold a magic weapon of a given base / style / element (screenshots of every caster style)
    if (msg.t === 'devGear' && dev) {
      const it = rules.rpg.loot.generate(msg.base, 'magic', 'high', { rng: makeRng(hashStr(`${msg.base}:${msg.style}:${msg.el}`)), ilvl: P.char.level || 1, level: P.char.level || 1, raw: true });
      if (!it) return;
      if (msg.el) it.attune = msg.el;
      if (msg.style && msg.base === 'staff') it.castStyle = msg.style.replace(/^staff:/, ''); else if (msg.style) it.castStyle = msg.style;
      if (msg.base === 'staff' && msg.style && !['beam', 'ward'].includes(it.castStyle)) { it.staffSpell = it.castStyle; delete it.castStyle; }
      finishCaster(rules, it);
      const slot = msg.slot === 'offhand' ? 'offhand' : 'weapon';
      P.char.gear[slot] = it;
      if (slot === 'weapon' && it.twoHanded) delete P.char.gear.offhand;
      changed(P);
      return;
    }
    // dev builds only: fall where you stand (the fallen panel and Wake at the shrine, on a phone)
    if (msg.t === 'devDown' && dev) { const u = unitOf(P); if (u && !u.downed) die(world, u, null); return; }
    // dev builds only: gold and magic items to try the shop and the Trade skills window with (tests/ui/shop-buy.mjs)
    if (msg.t === 'devGold' && dev) {
      const c = P.char;
      if (Number.isFinite(msg.n)) c.gold = Math.max(0, Math.min(1e6, Math.round(msg.n)));
      const bases = Object.keys(rules.data.items.weaponBases).filter(k => !rules.data.items.weaponBases[k].magic);
      for (let i = 0; i < Math.min(6, msg.magic | 0); i++) {
        const it = rules.rpg.loot.generate(bases[i % bases.length], 'magic', 'medium', { rng: makeRng(hashStr(`${c.id}:dev:${i}:${world.t}`)), ilvl: c.level || 1, level: c.level || 1 });
        if (it) { it.id = `i${Math.floor(rng() * 1e9).toString(36)}`; c.bag.push(it); }
      }
      changed(P);
      return;
    }
    // dev builds only: the experience for `levels` more levels (the level-up window on a phone: tests/ui/levelup-look.mjs)
    if (msg.t === 'devXp' && dev) {
      const c = P.char, n = Math.max(1, Math.min(5, msg.levels | 0 || 1));
      addXp(rules, c, xpToReach(rules, (c.level || 1) + pendingLevels(rules, c) + n) - (c.xp || 0));
      changed(P);
      return;
    }
    // dev builds only: throw every monster within 15 m (knockback + knockdown; tests/ui/knock-shot.mjs)
    if (msg.t === 'devKnock' && dev) {
      const u = unitOf(P); if (!u) return;
      for (const m of [...world.units.values()]) if (m.kind === 'monster' && Math.hypot(m.x - u.x, m.z - u.z) < 15) knockUnit(world, u, m, { push: Number(msg.push) || 4, down: Number(msg.down) || 3 });
      return;
    }
    // dev builds only: still, unkillable targets in a fan ahead of the hero (screenshots of attacks)
    if (msg.t === 'devDummy' && dev) {
      const u = unitOf(P); if (!u) return;
      const n = Math.max(1, Math.min(8, msg.n | 0 || 4)), f = u.facing || 0;
      for (let i = 0; i < n; i++) {
        const a = f + (i - (n - 1) / 2) * 0.28, r = 7 + (i % 3) * 2.5;
        const m = spawnMonster(world, 'vale_wolf', 1, [u.x + Math.sin(a) * r, u.z + Math.cos(a) * r]);
        if (m) { m.hp = m.maxHp = msg.hp > 0 ? msg.hp : 1e7; m.speed = 0; m.attackEvery = 1e6; m.aggroRange = 0; m.home = { x: m.x, z: m.z }; }
      }
      return;
    }
    if (msg.t === 'act') act(P, msg);
  }

  const say = (P, text, kind = 'info') => P.send(JSON.stringify({ t: 'say', text, kind }));
  const err = (P, text) => P.send(JSON.stringify({ t: 'err', msg: text }));
  const win = (P, w) => P.send(JSON.stringify({ t: 'win', ...w }));
  function broadcast(obj, exceptKey = null) { const s = JSON.stringify(obj); for (const [k, P] of players) if (k !== exceptKey) P.send(s); }
  const ctxOf = P => ({ playerId: P.char.id, level: P.char.level, flags: flagsFor(ws, P.char.id), char: P.char });
  const near = (u, at, r) => u && Math.hypot(u.x - at[0], u.z - at[1]) <= r;
  function changed(P, { refresh = true } = {}) { if (refresh) refreshPlayer(world, P.unitId); P.meDirty = true; }
  function itemIn(P, id) { return (P.char.bag || []).find(it => it.id === id) || null; }

  function containerOf(id) { return world.containers.get(id) || extra.get(id) || null; }
  /**
   * Area looting (owner 2026-11-25, "like Thousandvale"): opening one body opens every body of yours within AREA_LOOT
   * metres in the same window; Take all / Take gold sweep them all. Quest boxes and chests stay one at a time.
   */
  function lootGroup(P, box) {
    const u = unitOf(P);
    if (!box || box.kind !== 'corpse' || box.quest || !u) return [box];
    const out = [box];
    for (const c of world.containers.values()) {
      if (c === box || c.kind !== 'corpse' || c.quest || !c.eligible?.includes(P.char.id) || isEmptyFor(c, P.char.id)) continue;
      if (near(u, c.at, AREA_LOOT)) out.push(c);
    }
    return out;
  }
  function lootView(P, c) {
    const group = lootGroup(P, c).filter(Boolean);
    let gold = 0, allowed = false, why = null;
    const items = [];
    for (const b of group) {
      const v = openFor(rules, b, P.char.id, { char: P.char });
      if (!v.allowed) { if (b === c) why = v.why; continue; }
      allowed = true; gold += v.gold || 0;
      for (const it of v.items || []) items.push({ ...it, box: b.id, from: group.length > 1 ? (b.name || 'Remains') : null });
    }
    const name = group.length > 1 ? `${group.length} bodies` : (c.name || 'Remains');
    return { t: 'win', kind: 'loot', id: c.id, name, at: c.at, allowed, why: allowed ? null : why, gold, items, quest: c.quest || null, boxes: group.map(b => b.id) };
  }
  function sweep(group) { for (const b of group) if (b.kind === 'corpse' && b.eligible.every(id => isEmptyFor(b, id))) world.containers.delete(b.id); }

  function act(P, m) {
    const u = unitOf(P);
    const c = P.char;
    switch (m.a) {
      // ---- loot windows (individual loot: every player has their own contents)
      case 'loot-open': case 'loot-take': case 'loot-gold': case 'loot-all': {
        let box = containerOf(m.id);
        // (area loot: the body the window names may have been emptied and cleared — sweep from the nearest one left)
        if (!box && (m.a === 'loot-all' || m.a === 'loot-gold') && u) box = [...world.containers.values()].filter(b => b.kind === 'corpse' && b.eligible?.includes(c.id) && near(u, b.at, AREA_LOOT)).sort((a, b) => Math.hypot(a.at[0] - u.x, a.at[1] - u.z) - Math.hypot(b.at[0] - u.x, b.at[1] - u.z))[0] || null;
        if (!box) return err(P, 'That is gone.');
        if (!near(u, box.at, LOOT_METRES + 2)) return err(P, 'Too far away.');
        const group = lootGroup(P, box);
        if (m.a === 'loot-take') {
          const from = (m.from && group.find(b => b.id === m.from)) || box;
          const r = takeItem(rules, from, c.id, c, m.item); if (!r.ok) return err(P, r.why); questTake(P, from, r.item); changed(P);
        }
        if (m.a === 'loot-gold') {
          let g = 0; for (const b of group) { const r = takeGold(b, c.id, c); if (r.ok) g += r.gold; }
          if (!g) return err(P, 'There is no gold here.');
          say(P, `+${g} gold`, 'gold'); changed(P, { refresh: false });
        }
        if (m.a === 'loot-all') {
          let g = 0, n = 0, why = null;
          for (const b of group) { const r = takeAll(rules, b, c.id, c); if (!r.ok) { why = why || r.why; continue; } g += r.gold || 0; n += r.items.length; for (const it of r.items) questTake(P, b, it); }
          if (!g && !n && why) return err(P, why);
          if (g) say(P, `+${g} gold`, 'gold');
          changed(P);
        }
        // the window follows what is left: a body of the group that still holds something (every share rolled first,
        // so a body that turns out empty is not the one the window points at once it is swept away)
        for (const b of group) openFor(rules, b, c.id, { char: c });
        const left = group.find(b => b.eligible.includes(c.id) && !isEmptyFor(b, c.id)) || box;
        P.loot.add(left.id);
        P.send(JSON.stringify(lootView(P, left)));
        sweep(group);
        return;
      }
      case 'loot-close': P.loot.delete(m.id); return;
      case 'chest': case 'pick': {
        const def = chestDef(rules, m.id);
        const spot = placements.chests.find(x => x.id === m.id);
        if (!def || !spot) return err(P, 'There is no chest there.');
        if (!near(u, spot.at, USE_METRES + 1.5)) return err(P, 'Too far away.');
        const r = chestOpenFor(rules, ws, m.id, c.id, ws.time, { char: c, pick: m.a === 'pick' ? { rng } : null });
        if (r.skill?.gained) changed(P, { refresh: false });
        if (!r.ok) return win(P, { kind: 'locked', id: m.id, name: def.name, why: r.why, locked: !!r.locked });
        r.container.at = spot.at;
        extra.set(r.container.id, r.container);
        wsDirty = true;
        P.loot.add(r.container.id);
        P.send(JSON.stringify(lootView(P, r.container)));
        return;
      }
      case 'use': return useObject(P, m.id);
      // ---- people
      case 'talk': {
        const at = npcAt(book, ws, m.npc);
        if (!at || !npcPresent(book, ws, m.npc)) return err(P, 'Nobody is there.');
        if (!near(u, at, TALK_METRES)) return err(P, 'Walk closer to talk.');
        const r = talkTo(book, ws, m.npc, ctxOf(P));
        return win(P, { kind: 'talk', npc: r.npc, lines: r.lines, options: r.options });
      }
      case 'choose': {
        const at = npcAt(book, ws, m.npc);
        if (!at || !near(u, at, TALK_METRES + 2)) return err(P, 'Walk closer to talk.');
        if (m.option === 'bye') return win(P, { kind: 'close' });
        const r = choose(book, rules, ws, m.npc, m.option, { ...ctxOf(P), pick: m.pick || 0, rng: null });
        questEvents(r.events, P);
        if (r.rewards) {
          if (r.rewards.ok) { rewardSay(P, r.rewards); changed(P); } else if (r.rewards.why) err(P, r.rewards.why);
        }
        if (r.open) return openService(P, m.npc, r.open);
        const follow = r.options?.length ? r.options : talkTo(book, ws, m.npc, ctxOf(P)).options;
        return win(P, { kind: 'talk', npc: talkTo(book, ws, m.npc, ctxOf(P)).npc, lines: r.lines.length ? r.lines : ['…'], options: follow, rewards: r.rewards?.ok ? r.rewards : null });
      }
      // ---- levelling (every call validated by the rules core; all-or-nothing)
      case 'levelup': {
        const r = levelUp(rules, c, { cls: m.cls, spend: (m.spend || []).filter(x => typeof x === 'string'), attr: m.attr || null, flags: flagsFor(ws, c.id) });
        if (!r.ok) return err(P, r.why);
        changed(P);
        broadcast({ t: 'say', text: `${c.name} reached level ${c.level} (${classDef(rules, m.cls).name} ${c.classLevels[m.cls]}).`, kind: 'level' });
        P.send(JSON.stringify({ t: 'leveled', cls: m.cls, level: c.level, gained: r.gained || null }));
        return;
      }
      case 'node': { const r = buyNode(rules, c, m.cls, m.node); if (!r.ok) return err(P, r.why); changed(P); return; }
      case 'path': { const r = choosePath(rules, c, m.cls, m.path); if (!r.ok) return err(P, r.why); changed(P); return; }
      case 'talent': { const r = takeTalent(rules, c, m.id, { attrs: attrTotals(rules, c), profs: profSources(rules, c) }); if (!r.ok) return err(P, r.why); changed(P); return; }
      case 'attr': { const r = spendAttrPoint(rules, c, m.key); if (!r.ok) return err(P, r.why); changed(P); return; }
      case 'bar': {
        const slot = Math.floor(m.slot);
        if (!(slot >= 0 && slot < 8)) return;
        c.bar = c.bar || [];
        while (c.bar.length < 8) c.bar.push(null);
        if (m.spell && !spellSources(rules, c)[m.spell]) return err(P, 'You do not know that spell.');
        const was = c.bar.indexOf(m.spell || '\u0000');
        if (was >= 0 && m.spell) c.bar[was] = c.bar[slot] || null;    // a swap, never two copies
        c.bar[slot] = m.spell || null;
        changed(P, { refresh: false });
        return;
      }
      // ---- gear
      case 'equip': { const r = equip(rules, c, m.item, m.slot || null); if (!r.ok) return err(P, r.why); changed(P); return; }
      case 'unequip': { const r = unequip(c, m.slot); if (!r.ok) return err(P, r.why); changed(P); return; }
      case 'destroy': { const i = (c.bag || []).findIndex(it => it.id === m.item); if (i < 0) return err(P, 'Not in your bag.'); const [it] = c.bag.splice(i, 1); say(P, `${it.name} was thrown away.`); changed(P, { refresh: false }); return; }
      case 'disenchant': {
        const it = itemIn(P, m.item); if (!it) return err(P, 'Not in your bag.');
        if (fighting(u)) return err(P, 'Not in the middle of a fight. Break it once the fighting is over.');
        const r = disenchant(rules, c, it, rng); if (!r.ok) return err(P, r.why);
        say(P, `You learned ${r.learned.length > 1 ? `${r.learned.length} enchantments` : 'an enchantment'} from ${it.name}. It crumbles to dust.`, 'good'); c.bag = c.bag.filter(x => x !== it); changed(P); return;
      }
      case 'enchant': {
        const it = itemIn(P, m.item) || Object.values(c.gear || {}).find(g => g?.id === m.item); if (!it) return err(P, 'You do not have that item.');
        if (fighting(u)) return err(P, 'Not in the middle of a fight. Enchant it once the fighting is over.');
        const r = enchant(rules, c, it, m.affix, rng, { sheet: sheetOf(rules, c) }); if (!r.ok) return err(P, r.why);
        say(P, `${it.name} now carries ${r.affix?.name || 'the enchantment'} (${r.price} gold).`, 'good'); changed(P); return;
      }
      // ---- shops and services (must stand by the person who offers them)
      case 'buy': case 'sell': case 'repair': case 'horse': case 'train': {
        const at = npcAt(book, ws, m.npc);
        if (!at || !near(u, at, TALK_METRES + 2)) return err(P, 'Walk closer.');
        const sv = servicesOf(book, ws, m.npc, ctxOf(P));
        if (m.a === 'buy' || m.a === 'sell') {
          const shop = sv.find(s => s.kind === 'shop'); if (!shop) return err(P, 'Nothing for sale here.');
          if (m.a === 'buy') {
            const stock = stockOf(m.npc, shop);
            const i = stock.findIndex(it => it.id === m.item); if (i < 0) return err(P, 'That is sold out.');
            const price = buyPrice(rules, c, stock[i]);
            if ((c.gold || 0) < price) return err(P, `That costs ${price} gold; you have ${c.gold || 0}.`);
            c.gold -= price; const it = structuredClone(stock[i]); it.id = `i${Math.floor(rng() * 1e9).toString(36)}`; c.bag.push(it); stock.splice(i, 1);
            say(P, `Bought ${it.name} for ${price} gold.`, 'gold');
          } else {
            const i = (c.bag || []).findIndex(it => it.id === m.item); if (i < 0) return err(P, 'Not in your bag.');
            const [it] = c.bag.splice(i, 1); const price = sellPrice(rules, c, it); c.gold = (c.gold || 0) + price;
            say(P, `Sold ${it.name} for ${price} gold.`, 'gold');
          }
          changed(P, { refresh: false });
          return openService(P, m.npc, { kind: 'shop', npc: m.npc, ...shop });
        }
        if (m.a === 'repair') {
          const it = m.item === 'all' ? null : itemIn(P, m.item) || Object.values(c.gear || {}).find(g => g?.id === m.item);
          const list = it ? [it] : [...Object.values(c.gear || {}), ...(c.bag || [])].filter(g => g && repairPrice(rules, g) > 0);
          let paid = 0;
          for (const g of list) { const r = repairItem(rules, c, g); if (!r.ok) { if (!paid) return err(P, r.why); break; } paid += r.price; }
          if (paid) say(P, `Repaired for ${paid} gold.`, 'gold');
          changed(P); return openService(P, m.npc, { kind: 'repair', npc: m.npc });
        }
        if (m.a === 'horse') {
          const st = sv.find(s => s.kind === 'stable'); if (!st) return err(P, 'No horses here.');
          if (c.horse) return err(P, 'You already own a horse.');
          const price = Math.round(mountDef(rules).price * (st.priceMult || 1));
          if ((c.gold || 0) < price) return err(P, `A horse costs ${price} gold; you have ${c.gold || 0}.`);
          c.gold -= price; c.horse = true; say(P, `You bought a riding horse for ${price} gold. Press the Mount key to ride.`, 'good');
          changed(P, { refresh: false }); return openService(P, m.npc, { kind: 'stable', npc: m.npc, ...st });
        }
        return;
      }
      case 'respec': {
        if (!nearShrine(u)) return err(P, 'Changing your path happens at a shrine.');
        const kind = m.kind === 'full' ? 'full' : 'points';
        const r = respec(rules, c, kind); if (!r.ok) return err(P, r.why);
        say(P, kind === 'full' ? `Everything was reset for ${r.price} gold. Choose your classes again as you level.` : `Your points were given back for ${r.price} gold.`, 'good');
        changed(P); return;
      }
      case 'travel': {
        const to = shrinePos(m.shrine);
        if (!to || !ws.shrines.includes(m.shrine)) return err(P, 'Your world has not found that shrine yet.');
        if (!nearShrine(u)) return err(P, 'Travel starts at a shrine.');
        if (world.t - (u.lastFight || -999) < 6) return err(P, 'Not while fighting.');
        u.x = to.x; u.z = to.z; u.safeUntil = world.t + 4; u.mounted = false;
        P.teleport = true;
        say(P, `You travel to ${placements.shrines.find(s => s.id === m.shrine).name}.`);
        return;
      }
      case 'home': {
        if (!ws.shrines.includes(m.shrine)) return;
        setHomeShrine(ws, c.id, m.shrine); const p = shrinePos(m.shrine); if (u && p) u.shrine = [p.x, p.z];
        say(P, `${placements.shrines.find(s => s.id === m.shrine)?.name} is now where you return after a fall.`); wsDirty = true; return;
      }
      case 'respawn': {
        if (!u?.downed) return;
        const p = shrinePos(homeShrine(ws, c.id)) || spawnAt;
        const r = respawnPlayer(world, u.id, [p.x, p.z]);
        if (r) { u.safeUntil = world.t + 5; P.teleport = true; say(P, `You wake at the shrine. It cost ${r.gold} gold and some wear on your gear.`, 'bad'); changed(P, { refresh: false }); }
        return;
      }
      case 'chat': { const text = String(m.text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 200); if (text) broadcast({ t: 'say', text: `${c.name}: ${text}`, kind: 'chat' }); return; }
      default: return;
    }
  }

  function nearShrine(u) { return !!u && placements.shrines.some(s => near(u, s.at, SHRINE_METRES)); }
  // in a fight: hit or was hit within data/combat.json combatState.seconds (the same window combat.js uses; it ends —
  // lessons rule 40). Trade skills (enchanting) work anywhere but here (owner 2026-11-25).
  function fighting(u) { return !!u && world.t - (u.lastFight ?? -999) < rules.data.combat.combatState.seconds; }
  function stockOf(npc, shop) {
    const day = Math.floor(ws.time / 1800);       // the stock changes every half hour of world time
    const k = `${npc}:${day}`;
    if (!stockCache.has(k)) stockCache.set(k, shopStock(rules, shop, hashStr(`${ws.seed}:${k}`)));
    return stockCache.get(k);
  }
  function openService(P, npc, open) {
    const c = P.char;
    const kind = open.kind;
    if (kind === 'shop') {
      const stock = stockOf(npc, open);
      return win(P, { kind: 'shop', npc, name: book.npcs[npc]?.name, stock: stock.map(it => ({ item: it, price: buyPrice(rules, c, it) })), sell: (c.bag || []).map(it => ({ id: it.id, price: sellPrice(rules, c, it) })) });
    }
    if (kind === 'repair') return win(P, { kind: 'repair', npc, name: book.npcs[npc]?.name, items: [...Object.values(c.gear || {}), ...(c.bag || [])].filter(Boolean).map(it => ({ id: it.id, price: repairPrice(rules, it) })).filter(x => x.price > 0) });
    if (kind === 'stable') return win(P, { kind: 'stable', npc, name: book.npcs[npc]?.name, price: Math.round(mountDef(rules).price * (open.priceMult || 1)), owned: !!c.horse, discount: open.priceMult ? 1 - open.priceMult : 0 });
    if (kind === 'trainer') return win(P, { kind: 'trainer', npc, name: book.npcs[npc]?.name, classes: open.classes || [] });
    if (kind === 'respec') return win(P, { kind: 'respec', npc, prices: { points: respecPrice(rules, c, 'points'), full: respecPrice(rules, c, 'full') } });
    if (kind === 'travel') return win(P, { kind: 'travel', npc, shrines: ws.shrines });
    return win(P, { kind: 'close' });
  }
  function rewardSay(P, r) {
    const bits = [];
    if (r.xp) bits.push(`${r.xp} XP`);
    if (r.gold) bits.push(`${r.gold} gold`);
    for (const it of r.items || []) bits.push(it.name);
    if (bits.length) say(P, `Reward: ${bits.join(', ')}.`, 'good');
  }

  // ---- quest objects: use (ring a bell, light a seal-stone) or open (a quest item comes out of a loot window)
  function useObject(P, id) {
    const u = unitOf(P);
    const o = book.objects[id];
    if (!o) return err(P, 'Nothing to use there.');
    if (!near(u, o.at, USE_METRES + 1.5)) return err(P, 'Walk closer.');
    const live = liveObjects(book, ws).find(x => x.object === id);
    if (!live) return say(P, `${cap(o.name)}: nothing more to do here now.`);
    if (live.kind === 'use') { questEvents(notify(book, ws, { t: 'use', object: id, player: P.char.id }), P); return; }
    // a quest container: the item shows in a loot window for everyone in the world (progress belongs to the world)
    const cid = `q:${id}`;
    let box = extra.get(cid);
    if (!box) {
      box = createContainer({ id: cid, kind: 'quest', at: o.at, level: 1, table: 'beast', eligible: [], seed: 1, name: cap(o.name) });
      box.quest = { object: id, item: live.item || cap(o.name) };
      extra.set(cid, box);
    }
    if (!box.eligible.includes(P.char.id)) { box.eligible.push(P.char.id); box.shares[P.char.id] = { gold: 0, items: [{ id: `qi_${id}`, name: live.item || cap(o.name), quest: true, type: 'quest', rarity: 'quest' }], opened: true }; }
    P.loot.add(cid);
    P.send(JSON.stringify(lootView(P, box)));
  }
  function questTake(P, box, item) {
    if (!item?.quest) return;
    // quest items are not carried: they count for the world (WORLD.md)
    P.char.bag = (P.char.bag || []).filter(it => it !== item);
    questEvents(notify(book, ws, { t: 'take', object: box.quest.object, player: P.char.id }), P);
    for (const other of players.values()) if (other !== P && box.shares[other.char.id]) box.shares[other.char.id].items = [];
  }
  function questEvents(events = [], P = null) {
    if (!events?.length) return;
    wsDirty = true;
    for (const e of events) {
      const q = e.quest ? book.quests[e.quest] : null;
      if (e.t === 'quest-count') broadcast({ t: 'say', text: `${q.title}: ${e.progress}`, kind: 'quest' });
      else if (e.t === 'quest-step') broadcast({ t: 'say', text: `${q.title}: ${q.steps[ws.quests[e.quest]?.step]?.text || 'ready to hand in'}`, kind: 'quest' });
      else if (e.t === 'quest-start') broadcast({ t: 'say', text: `New quest: ${q.title}`, kind: 'quest' });
      else if (e.t === 'quest-ready') broadcast({ t: 'say', text: `${q.title}: return to ${npcCall(book.npcs[q.turnIn])}.`, kind: 'quest' });
      else if (e.t === 'quest-done') { broadcast({ t: 'say', text: `Quest complete: ${q.title}`, kind: 'quest' }); note(ws, `${q.title} was completed.`); }
      else if (e.t === 'flag') { /* class unlocks etc.: the world-state message carries them */ }
    }
  }

  // ------------------------------------------------------------------ the step
  function inputFor(P, u) {
    const m = P.inputs.length ? P.inputs.shift() : P.last;
    if (!m) return {};
    P.last = { ...m, c: -1, b: m.b & ~(32 | 64 | 128) };        // a repeat never re-presses one-shot buttons
    if (m.q > P.ack) P.ack = m.q;
    const b = unpackButtons(m.b || 0);
    const mx = Math.max(-1, Math.min(1, m.mx || 0)), mz = Math.max(-1, Math.min(1, m.mz || 0));
    const dir = [m.dx || 0, m.dy || 0, m.dz || 0];
    const input = {
      move: { x: mx, z: mz }, aim: { origin: [m.ax || u.x, m.ay || 0, m.az || u.z], dir },
      attack: b.attack, power: b.power, sneak: b.sneak, dodge: b.dodge, mount: b.mount,
    };
    if (b.respawn) act(P, { a: 'respawn' });
    if (m.tg) P.target = m.tg;
    const slot = Number.isInteger(m.c) ? m.c : -1;
    if (slot >= 0 && slot < 8) { input.cast = { slot, at: Array.isArray(m.at) ? m.at.map(Number) : null, held: !!m.h }; P.chSlot = slot; }
    else if (m.h && u.channel && P.chSlot >= 0) input.cast = { slot: P.chSlot, held: true };
    // the crosshair's ground point with an attack: where a lobbed wand / tome / staff attack lands
    if (slot < 0 && Array.isArray(m.at) && m.at.length === 3) input.attackAt = m.at.map(Number);
    if (b.interact && m.rv) input.revive = m.rv;
    return input;
  }

  function step() {
    const t0 = performance.now();
    tick++;
    ws.time += STEP;
    const inputs = {};
    const before = new Map();
    for (const u of world.units.values()) before.set(u.id, { x: u.x, z: u.z });
    for (const P of players.values()) { const u = unitOf(P); if (u) inputs[u.id] = inputFor(P, u); }
    // deep water: everyone in it swims (slower, no dodge); a rider slips off the horse
    for (const u of world.units.values()) {
      u.swimming = ground.swimming(u.x, u.z);
      if (u.swimming && u.mounted) { u.mounted = false; const P = byUnit(u.id); if (P) { P.meDirty = true; say(P, 'Your horse will not swim. You slide off.', 'info'); } }
    }
    const events = simStep(world, STEP, inputs);
    // the sim moves on a flat plane: keep every body on ground it can stand on
    for (const u of world.units.values()) {
      const b = before.get(u.id);
      if (!b || (b.x === u.x && b.z === u.z)) continue;
      const s = ground.settle(b, { x: u.x, z: u.z }, { solid: u.kind !== 'monster' || !u.returning });
      u.x = s.x; u.z = s.z;
    }
    handleEvents(events);
    if (tick % 10 === 0) slowTick();
    sendAll(events);
    const ms = performance.now() - t0;
    stats.steps++; stats.stepMs += ms; stats.maxStepMs = Math.max(stats.maxStepMs, ms);
    if (ws.time >= saveAt) { saveAt = ws.time + 30; persist({ world: saveRecord(), chars: [...players.values()].map(P => ({ key: P.key, char: P.char })) }); }
  }

  function handleEvents(events) {
    for (const e of events) {
      if (e.t === 'death' && e.def) {
        const m = unitMeta.get(e.who) || {};
        unitMeta.delete(e.who);
        if (m.zone) { const Z = zones.get(m.zone); if (Z && --Z.alive <= 0) { Z.alive = 0; Z.emptySince = ws.time; } }
        const by = [...players.values()].filter(P => { const u = unitOf(P); return u && Math.hypot(u.x - e.at[0], u.z - e.at[1]) < 60; }).map(P => P.char.id);
        questEvents(notify(book, ws, { t: 'death', def: e.def, camp: m.camp || null, by }));
      } else if (e.t === 'camp' && e.cleared) {
        clearCamp(ws, e.camp, ws.time); activeCamps.delete(e.camp); wsDirty = true;
        const name = placements.camps.find(c => c.id === e.camp)?.name;
        if (name) broadcast({ t: 'say', text: `${name} is cleared.`, kind: 'quest' });
      } else if (e.t === 'xp' || e.t === 'skill') {
        const P = byUnit(e.who); if (P) P.meDirty = true;
        if (e.t === 'xp' && P && e.ready) P.send(JSON.stringify({ t: 'say', text: 'You can level up! Open the level-up window.', kind: 'level' }));
      } else if (e.t === 'respawned' || e.t === 'revived' || e.t === 'form' || e.t === 'mount') {
        const P = byUnit(e.who); if (P) P.meDirty = true;
      } else if (e.t === 'refused') {
        const P = byUnit(e.who); if (P && e.why) P.send(JSON.stringify({ t: 'err', msg: e.why, quiet: true }));
      }
    }
  }
  const byUnit = id => { for (const P of players.values()) if (P.unitId === id) return P; return null; };

  function slowTick() {
    // places found, shrines discovered, quest "reach" steps, escorts, camps and roam packs filling again
    const heroes = [];
    for (const P of players.values()) {
      const u = unitOf(P);
      if (!u || u.downed) continue;
      heroes.push({ x: u.x, z: u.z });
      for (const [id, p] of Object.entries(T.places)) {
        if (!ws.found.includes(id) && Math.hypot(u.x - p.at[0], u.z - p.at[1]) < Math.max(FIND_METRES, p.radius || 0)) { ws.found.push(id); wsDirty = true; if (p.name) say(P, `Found: ${p.name}`, 'found'); }
      }
      for (const s of placements.shrines) {
        if (Math.hypot(u.x - s.at[0], u.z - s.at[1]) < SHRINE_METRES) {
          const fresh = discoverShrine(ws, s.id, P.char.id);
          if (homeShrine(ws, P.char.id) !== s.id) { setHomeShrine(ws, P.char.id, s.id); }
          const p = shrinePos(s.id); if (p) u.shrine = [p.x, p.z];
          if (fresh) { wsDirty = true; broadcast({ t: 'say', text: `Shrine found: ${s.name}. Anyone in this world can travel here now.`, kind: 'found' }); }
        }
      }
      questEvents(notify(book, ws, { t: 'reach', at: [u.x, u.z], player: P.char.id }), P);
      ws.at[P.char.id] = [R2(u.x), R2(u.z)];
      if (P.meDirty === false && tick % 40 === 0) P.meDirty = true;      // stamina-free numbers (regen, cooldown) refresh now and then
    }
    if (heroes.length) {
      const ev = escortTick(book, ws, heroes, 0.5, { walkable: T.walkable });
      if (ev?.length) questEvents(ev);
      if (escorts(book, ws).length) wsDirty = true;
    }
    populate();
    for (const [id, box] of extra) if (box.kind === 'chest' && box.eligible.every(p => isEmptyFor(box, p))) extra.delete(id);
  }

  // ------------------------------------------------------------------ what each player is sent
  function unitInfo(u) {
    const info = { id: u.id, k: u.kind, n: u.name, lv: u.level, side: u.side, mh: u.maxHp, mm: u.maxMp ?? null, ms: u.maxStamina ?? null };
    if (u.kind === 'player') { info.look = u.char.look || null; info.gear = gearLook(u.char); info.form = u.form?.id || null; info.body = u.form?.body?.creature || null; info.horse = !!u.char.horse; }
    else { info.def = u.defId; info.art = u.art; info.rank = u.rank || 'normal'; info.owner = u.owner || null; if (u.temper && u.temper !== 'hostile') info.tp = u.temper; }   // tp: a peaceful animal (yellow tag)
    return info;
  }
  function gearLook(char) {
    const g = char.gear || {}, o = {};
    for (const [s, it] of Object.entries(g)) if (it) o[s] = { b: it.baseKey, s: it.subtype || null, r: it.rarity || null, two: !!it.twoHanded, c: it.weaponCategory || null, sh: !!it.isShield };
    return o;
  }
  function flagsOf(u) {
    let f = 0;
    if (u.downed) f |= UF.downed;
    if (u.mounted) f |= UF.mounted;
    if (u.sneaking) f |= UF.sneaking;
    if (u.channel) f |= UF.channel;
    if (u.returning) f |= UF.returning;
    if (world.t < (u.safeUntil || 0)) f |= UF.safe;
    return f;
  }
  function sendAll(events) {
    const snapEvery = 1;
    if (tick % snapEvery) return;
    for (const P of players.values()) {
      const me = unitOf(P);
      if (!me) continue;
      const rows = [], add = [], keep = new Set();
      for (const u of world.units.values()) {
        const inView = u === me || u.kind === 'player' || Math.hypot(u.x - me.x, u.z - me.z) < VIEW_METRES;
        if (!inView) continue;
        keep.add(u.id);
        const info = unitInfo(u);
        const h = JSON.stringify(info);
        if (P.seen.get(u.id) !== h) { P.seen.set(u.id, h); add.push(info); }
        rows.push([u.id, R2(u.x), R2(u.z), R2(u.facing || 0), Math.round(u.hp), u.mp != null ? Math.round(u.mp) : 0, u.stamina != null ? Math.round(u.stamina) : 0, Math.round(u.barrier || 0), flagsOf(u)]);
      }
      const gone = [];
      for (const id of P.seen.keys()) if (!keep.has(id)) { gone.push(id); P.seen.delete(id); }
      const ev = events.filter(e => eventFor(e, me));
      const msg = { t: 's', tk: tick, wt: R2(world.t), ack: P.ack, u: rows };
      const sp = speedOf(me); if (sp !== P.sp) { P.sp = sp; msg.sp = sp; }
      if (add.length) msg.add = add;
      if (gone.length) msg.gone = gone;
      if (ev.length) msg.ev = ev;
      if (P.teleport) { msg.tp = 1; P.teleport = false; }
      if (tick % 4 === 0) {
        // auras of me + my target + other players (the buff rows and the target frame), 5 a second
        const au = {};
        const list = [me, ...[...players.values()].map(unitOf).filter(x => x && x !== me)];
        const tg = P.target && world.units.get(P.target);
        if (tg && keep.has(tg.id)) list.push(tg);
        for (const x of list) { const a = auraList(rules, x); if (a.length || x === me) au[x.id] = a.map(r => ({ id: r.id, n: r.name, k: r.kind, r: R2(r.remaining), to: R2(r.total), s: r.stacks, src: r.source, e: auraRaw(x.statuses?.[r.id]) })); }
        if (au[me.id]) au.b = Math.round(me.barrier || 0);
        msg.au = au;
        msg.pj = world.projectiles.filter(p => Math.hypot(p.x - me.x, p.z - me.z) < VIEW_METRES).map(p => [p.id, R2(p.x), R2(p.z), R2(p.dx), R2(p.dz), p.speed, p.ctx?.spell || p.ctx?.vis || null]);
        msg.zn = world.zones.filter(z => Math.hypot(z.x - me.x, z.z - me.z) < VIEW_METRES).map(z => [z.id, R2(z.x), R2(z.z), z.radius, z.ctx?.spell || null, R2(z.until - world.t)]);
        const boxes = [];
        for (const c of [...world.containers.values(), ...extra.values()]) {
          if (!c.eligible.includes(P.char.id) || isEmptyFor(c, P.char.id) || Math.hypot(c.at[0] - me.x, c.at[1] - me.z) > VIEW_METRES) continue;
          if (c.kind === 'chest') continue;
          boxes.push([c.id, R2(c.at[0]), R2(c.at[1]), c.kind, c.name || '']);
        }
        msg.lb = boxes;
        if (me.channel || P.chSlot >= 0) msg.ch = me.channel ? me.channel.spell : null;
        msg.cd = Object.fromEntries(Object.entries(me.cooldowns || {}).filter(([, t]) => t > world.t).map(([k, t]) => [k, R2(t - world.t)]));
        if (me.downed) msg.dn = { left: R2(Math.max(0, me.downed.until - world.t)) };
        if (me.reviving) msg.rv = { id: me.reviving.id, held: R2(me.reviving.held) };
        msg.wt0 = R2(ws.time);
      }
      const s = JSON.stringify(msg);
      stats.bytesOut += s.length;
      P.send(s);
      if (P.meDirty) sendMe(P);
      if (wsDirty) sendWorld(P);
    }
    wsDirty = false;
  }
  function eventFor(e, me) {
    if (e.t === 'respawnReady' || e.t === 'tick' && e.to !== me.id) return false;
    if (e.who === me.id || e.to === me.id || e.from === me.id || e.players?.includes?.(me.id)) return true;
    // (a throw's / leap's `to` is a point [x, z], not a unit id; an event's own `at` may be the time)
    const ref = world.units.get(typeof e.to === 'string' ? e.to : (e.who || e.from));
    if (ref) return Math.hypot(ref.x - me.x, ref.z - me.z) < EVENT_METRES;
    if (Array.isArray(e.at)) return Math.hypot((e.at[0] || 0) - me.x, (e.at[1] || 0) - me.z) < EVENT_METRES;
    return false;
  }
  function sendMe(P) {
    P.meDirty = false;
    const u = unitOf(P);
    const s = u?.sheet || sheetOf(rules, P.char);
    P.send(JSON.stringify({
      t: 'me', char: P.char, pending: pendingLevels(rules, P.char), flags: flagsFor(ws, P.char.id),
      sheet: { maxHp: s.maxHp, maxMp: s.maxMp, maxStamina: s.maxStamina, moveSpeed: s.moveSpeed, carry: s.carry, carried: carriedWeight(rules, P.char), overloaded: !!s.overloaded },
      speed: u ? speedOf(u) : s.moveSpeed, home: homeShrine(ws, P.char.id),
    }));
  }
  /** The walking speed the sim would use now (the browser predicts its own hero with it). */
  // the sim's own walking speed (js/rules/combat.js walkSpeedOf: slows, speed buffs, the horse), so the browser's
  // prediction walks exactly as fast; sent again in a snapshot (`sp`) whenever it changes (a slow landing, a buff ending)
  function speedOf(u) { return R2(walkSpeedOf(world, u)); }
  function sendWorld(P) {
    P.send(JSON.stringify({
      t: 'wstate', flags: ws.flags, my: ws.playerFlags[P.char.id] || [], quests: ws.quests, shrines: ws.shrines, found: ws.found, camps: ws.camps,
      players: [...players.values()].map(Q => ({ id: Q.unitId, name: Q.char.name, level: Q.char.level, cls: Q.char.classOrder })), time: R2(ws.time),
      esc: escorts(book, ws).map(e => ({ npc: e.npc, at: e.at })),
    }));
  }

  // ------------------------------------------------------------------ saving
  function saveRecord() { return { meta: { ...meta, updated: new Date().toISOString(), players: [...new Set([...(meta.players || []), ...[...players.values()].map(P => P.key)])] }, state: toJSON(ws) }; }
  function save() { persist({ world: saveRecord(), chars: [...players.values()].map(P => ({ key: P.key, char: P.char })) }); }

  function listing() { return { code: meta.code, name: meta.name, public: !!meta.public, players: players.size, seats: MAX_PLAYERS, names: [...players.values()].map(P => P.char.name), quests: Object.values(ws.quests).filter(q => q.done).length }; }

  return {
    join, leave, away, message, step, save, listing, stats, meta, ws, world,
    get size() { return players.size; }, players,
    // tests
    _test: { unitOf, act: (key, m) => act(players.get(key), m), populate, zones, activeCamps, extra, ground },
  };
}

const cap = s => String(s || '').replace(/^\w/, c => c.toUpperCase());
/** The numbers of one status entry the tooltip needs (describe.js describeAura reads these off unit.statuses). */
const AURA_FIELDS = ['perSecond', 'power', 'healPerSecond', 'damage', 'resist', 'takeMore', 'dealLess', 'haste', 'move', 'slow', 'armor', 'element', 'dispel', 'beneficial', 'name', 'kind', 'remaining', 'total', 'stacks'];
function auraRaw(st) { if (!st) return null; const o = {}; for (const k of AURA_FIELDS) if (st[k] != null && (typeof st[k] !== 'number' || Number.isFinite(st[k]))) o[k] = typeof st[k] === 'number' ? R2(st[k]) : st[k]; return o; }
// keep rarely used imports honest (castRefusal / spellPowerRange / addToBar are part of the contract tests read)
export { castRefusal, spellPowerRange, addToBar };
