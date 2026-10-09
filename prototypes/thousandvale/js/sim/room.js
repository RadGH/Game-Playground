// A room (stream A): one simulated area — a province copy, a hub town or an instance (PLAN §8.2).
// Owns entities, the AOI grid, movement, the rules module, snapshots and event routing. Pure: no DOM,
// no Node APIs; the world (js/sim/world.js) drives step() at 20 Hz and wires clients in.
//
//   const room = createRoom({ id, name, terrain, seed, createRules, camps, hooks })
//   room.addPlayer(char, client) -> Entity ; room.attach(e, client) ; room.detach(e) ; room.removePlayer(e)
//   room.input(e, msg) ; room.intent(e, msg) ; room.say(e, text) ; room.respawn(e)
//   room.step()   one tick
//
// client = { send(data), you(patch)?, ... } — the room adds its own per-client view state to it.

import { npcIdentity } from './npc-names.js';
import { Entity, BANDS } from './entity.js';
import { createGrid } from './aoi.js';
import { stepMove } from './movement.js';
import { seedStream, next } from './rng.js';
import { ByteWriter, encodeRecord, encodeClientSnap } from '../net/snapshot.js';
import { F, STATE, IN, TICK_MS } from '../net/protocol.js';

export const VIEW = Object.freeze({
  bands: [40, 90, 150],          // metres: near / mid / far (PLAN §8.3)
  rates: [15, 7.5, 3],           // Hz per band
  cap: 150,                      // entities per client
  awakeR: 200,                   // monsters think only with a player this close (PLAN §8.5)
  sayR: 40,
  q: 0.125,                      // metres per snapshot position unit
});
const MAX_QUEUED_INPUTS = 30, MOVE_BUDGET_CAP = 500;
export const DORMANT_MS = 30000;      // a camp nobody has been within awakeR of for this long (and calm) is parked

/** Y23 (round 10): a wilds camp's body comes back 90-150 s after it died (it was 30 s, on one clock a camp); a camp may name its own `respawnMs`. */
export const CAMP_RESPAWN_MS = Object.freeze([90000, 150000]);
/** …and never within RESPAWN_IN_VIEW_MS of its death while a player is within RESPAWN_VIEW_M of the camp. */
export const RESPAWN_IN_VIEW_MS = 60000, RESPAWN_VIEW_M = 60;

export function createRoom(opts) {
  const { id, name = id, terrain, seed = 1, createRules, hooks = {}, tickMs = TICK_MS, camps = [], objects = [], kind = 'wilds', area = null, safeZones = [], meta = null } = opts;
  const bounds = terrain.bounds;
  const size = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  const q = Math.max(VIEW.q, size / 65535);
  // a town room only ever holds its own circle: its grid covers that, not the whole province
  const ga = opts.gridArea;
  const grid = ga ? createGrid(2 * ga.r, { x: ga.x - ga.r, z: ga.z - ga.r }) : createGrid(size, { x: bounds.minX, z: bounds.minZ });
  const entities = new Map();
  const clients = new Map();       // entity id -> client
  const streams = new Map();
  const despawns = [];             // { at, e }
  let tick = 0, nextId = 1, events = [], uidN = 0;
  const awake = new Uint32Array(grid.count);   // == awakeGen when awake this tick
  let awakeGen = 1;              // (the array starts at 0: nothing is awake before the first refresh)
  const stats = { rulesErrors: 0, lastRulesError: '', spawned: 0 };
  const writer = new ByteWriter(4096), snapWriter = new ByteWriter(2048);
  // DORMANT CAMPS (opt-in, `dormantCamps`: a province copy of ~1,300 monsters): a camp with no player within awakeR
  // is not spawned at all; one that has been out of reach for DORMANT_MS with every member calm (alive, full health,
  // not fighting) is parked — removed, with its warband escort — and comes back as it was when someone walks near.
  // Respawn timers keep running while parked. The rules (stream C) then only ever see monsters near players.
  const dormant = !!opts.dormantCamps;
  const campState = camps.map(c => ({ ...c, live: new Set(), due: [], nextAt: 0, parked: dormant ? (c.count || 1) : 0, idleSince: 0 }));
  const spawnPoint = opts.spawn ? { ...opts.spawn } : { ...terrain.spawn };

  const room = {
    id, name, kind, area, meta, terrain, bounds, grid, entities, clients, q, size, stats, tickMs,
    get tick() { return tick; },
    now: () => tick * tickMs,
    groundAt: (x, z) => terrain.heightAt(x, z),
    walkable: (x, z) => (terrain.walkable ? terrain.walkable(x, z) : true),
    spawnPoint,
    describe() {
      const d = { id, name, kind, size, q, origin: { x: bounds.minX, z: bounds.minZ }, terrain: terrain.key ?? null, spawn: { ...spawnPoint } };
      if (area) d.area = { ...area };
      if (opts.describeExtra) Object.assign(d, opts.describeExtra);
      return d;
    },
    /** Emit an event to clients (§6); the rules' `loot` events are turned into grants (hooks.loot). */
    event(ev) {
      if (ev.type === 'loot' && ev.items && hooks.loot) { hooks.loot(ev, room); return; }
      if (hooks.observe) { if (ev.x === undefined) fillXZ(ev); hooks.observe(ev, room); }
      watchTelegraphs(ev);
      if (ev.type === 'fx' && (ev.kind === 'form' || ev.kind === 'shield') && ev.id) lateInfo(ev);
      if (ev.type === 'fx' && (ev.kind === 'form' || ev.kind === 'build') && ev.id) barDirty.add(ev.id);
      if (ev.type === 'fx' && ev.kind === 'status' && ev.id) stDirty.add(ev.id);          // Q8: info.st follows the rules
      else if (ev.type === 'die' && ev.d) { stDirty.add(ev.d); stClear.add(ev.d); }   // a form/stance/talent/perk changed slots   // a form/stance changed slots: resend you.bar after the tick
      room.emit(ev);
    },
    /** Emit without interception (the world's own loot events). */
    emit(ev) {
      if (ev.x === undefined && !ev._at) fillXZ(ev);
      events.push(ev);
    },
  };
  /**
   * PLAY-TEST 6, U3 — "void-zone / telegraph effects must end immediately when the enemy dies or the cast is interrupted".
   * The rules own what a telegraph DOES; this is the net under them for what everyone SEES: every live `tele {id, s}` and
   * every ground pool a MONSTER lays (`fx {kind:'pool', id: caster, x, z, seconds}`) is remembered by its source, and the
   * moment that source dies (`die`) or is removed, each one still running is ended on the wire (a `tele` the rules mark
   * `after: 1` — it lands even if its caster is dead — is left alone) —
   * `teleR {id, x: 1, why}` / `fx {kind:'pool', id, x, z, end: 1, why}` — unless the rules already ended it themselves.
   */
  const liveTele = new Map();        // tele id -> { s, x, z, after, until }
  /** Give an event the place it is DELIVERED by (not serialised): for events whose own `x` means something else. */
  const routed = (ev, at) => { Object.defineProperty(ev, '_at', { value: { x: at.x, z: at.z }, enumerable: false }); return ev; };
  const livePools = new Map();       // source id -> [{ x, z, until }]
  function endFor(src, why) {
    for (const [tid, t] of liveTele) if (t.s === src && !t.after) { liveTele.delete(tid); room.emit(routed({ type: 'teleR', id: tid, x: 1, why }, t)); }
    const pools = livePools.get(src);
    if (pools) { livePools.delete(src); const t = room.now(); for (const p of pools) if (p.until > t) room.emit(routed({ type: 'fx', kind: 'pool', id: src, x: p.x, z: p.z, end: 1, why }, p)); }
  }
  function watchTelegraphs(ev) {
    switch (ev.type) {
      case 'tele': {
        if (ev.id == null || ev.s == null) break;
        const src = entities.get(ev.s);
        liveTele.set(ev.id, { s: ev.s, after: !!ev.after, x: Number.isFinite(ev.x) ? ev.x : src ? src.x : 0, z: Number.isFinite(ev.z) ? ev.z : src ? src.z : 0, until: room.now() + (ev.ms || 0) + 2000 });
        break;
      }
      // a telegraph's END is sent to whoever could see the telegraph: `teleR` has no place of its own, and its `x` is the
      // "cancelled" flag, not a coordinate — routed by position it reached nobody (which is why a cancelled zone stayed drawn)
      case 'teleR': { const t = liveTele.get(ev.id); if (t) { routed(ev, t); liveTele.delete(ev.id); } break; }
      case 'teleM': { const t = liveTele.get(ev.id); if (t && Number.isFinite(ev.x) && Number.isFinite(ev.z)) { t.x = ev.x; t.z = ev.z; } break; }      // C (round 10, Y12): a knocked-back caster carries its wind-up — the later teleR is routed from where it now is
      case 'fx':
        if (ev.kind === 'pool' && !ev.end && ev.id != null) { const src = entities.get(ev.id); if (src && src.kind === 'monster') { const l = livePools.get(ev.id) || []; l.push({ x: ev.x, z: ev.z, until: room.now() + (ev.seconds || 4) * 1000 }); livePools.set(ev.id, l); } }
        break;
      case 'die': if (ev.d != null && (liveTele.size || livePools.size)) endFor(ev.d, 'dead'); break;
      // an INTERRUPTED cast: the rules end that cast's own zones themselves (`teleR x:1` from cancelCast) — zones of an earlier,
      // finished cast still land, so nothing more is ended here
    }
    if (liveTele.size > 64) { const t = room.now(); for (const [tid, x] of liveTele) if (x.until < t) liveTele.delete(tid); }
  }
  /**
   * Play-test 6 (C's asks): what a late joiner must still see — a druid's SHAPE (U16: `info.form` = C's shape object while a
   * `group:'shape'` form is on) and a boss's WARD (U8: `info.ward = {max, ms, until (room ms)}` while the shield holds).
   */
  function lateInfo(ev) {
    const e = entities.get(ev.id);
    if (!e) return;
    if (ev.kind === 'form') {
      if (ev.group && ev.group !== 'shape') return;          // a stance / temper / song has no body: it neither sets nor clears the shape
      const shape = ev.on === false ? null : (ev.shape && typeof ev.shape === 'object' ? ev.shape : ev.body ? { id: ev.form, group: ev.group || 'shape', creature: ev.body } : null);
      const next = shape && (shape.group === undefined || shape.group === 'shape') && shape.creature ? shape : null;
      if (JSON.stringify(next) !== JSON.stringify(e.form || null)) { e.form = next; e.infoVer++; }
    } else if (ev.on === true || ev.on === false) {
      const next = ev.on ? { max: ev.pool ?? ev.max ?? null, ms: ev.ms ?? null, until: ev.ms ? room.now() + ev.ms : null, ...(ev.name ? { name: ev.name } : {}) } : null;
      e.ward = next; e.infoVer++;
    }
  }
  function fillXZ(ev) {
    const ref = entities.get(ev.d) || entities.get(ev.s) || entities.get(ev.id) || entities.get(ev.to);
    if (ref) { ev.x = ref.x; ev.z = ref.z; }
  }

  // ---- the host the rules module sees (docs/protocol.md §7.1) ----
  const host = {
    roomId: id, tickMs,
    get tick() { return tick; },
    now: room.now,
    rng(nm) { let s = streams.get(nm); if (!s) { s = seedStream(seed, id + ':' + nm); streams.set(nm, s); } return s; },
    random(nm) { return next(host.rng(nm)); },
    entities,
    near(x, z, r, filter) { return grid.query(x, z, r, [], filter); },
    *players() { for (const e of entities.values()) if (e.kind === 'player') yield e; },
    groundAt: room.groundAt,
    walkable: room.walkable,
    isAwake(x, z) { return awake[grid.cellOf(x, z)] === awakeGen; },
    event: room.event,
    npcHelped: (npc, pl, info) => { if (hooks.npcHelped) hooks.npcHelped(npc, pl, info, room); },      // Y21 (round 10): C's wilderness-NPC fights -> the province's thanks
    spawn: spec => room.spawn(spec),
    despawn(e, delayMs = 0) { if (delayMs > 0) despawns.push({ at: room.now() + delayMs, e }); else room.remove(e); },
    award: (e, a) => room.award(e, a),
    newUid: () => (hooks.newUid ? hooks.newUid() : id + ':' + (++uidN)),
    terrain,                       // the room's terrain; `terrain.reader` = B's reader for a baked zone (groundAdapter)
    safeZones,
    inSafeZone(x, z) { for (const c of safeZones) if ((x - c.x) ** 2 + (z - c.z) ** 2 <= c.r * c.r) return true; return false; },
    kind,
    log: (...a) => hooks.log && hooks.log('[rules ' + id + ']', ...a),
  };
  // stream C's one-drop-per-corpse-per-party hook (js/rules/cast.js onKill): only when the province takes party loot
  host.isNight = () => (hooks.isNight ? !!hooks.isNight() : false);      // the realm clock (C: the torch's night bonus)
  // play-test 5, T4: stream C's revive skills ASK the fallen player (the province sends `reviveAsk`, the body stands up on
  // `revive {op:'accept'}`): host.offerRevive(caster, target, { skill, name, hpPct, mpPct?, ms?, note?, apply? }) -> { ok, why? }
  host.offerRevive = (caster, target, spec = {}) => (hooks.offerRevive ? hooks.offerRevive(caster, target, spec, room) : { ok: false, why: 'notReady' });
  if (hooks.partyLoot) host.partyLoot = (members, items, corpse, partyId) => hooks.partyLoot(members, items, corpse, partyId, room);
  room.host = host;

  const barDirty = new Set();       // player entity ids whose skill bar must be resent (level-up, form, talent)
  // STATUSES OTHERS SEE (play-test 2, Q8: "revived still on fire; other people don't see the fire"). `info.st` = the status
  // ids an entity carries, so a late arrival draws the aura too. Rechecked when the rules announce a status (fx status),
  // on a death and a revive (both clear it, with an `fx status on:false` per status so a client drawing from events
  // drops the aura), and once a second for anything still showing one (a status that ran out without a word).
  const stDirty = new Set(), stClear = new Set();
  const rules = createRules(host, { seed, roomId: id });
  room.rules = rules;
  function safe(fnName, ...args) {
    const f = rules[fnName];
    if (typeof f !== 'function') return undefined;
    try { return f.apply(rules, args); } catch (err) {
      stats.rulesErrors++;
      const msg = fnName + ': ' + (err && err.message);
      if (msg !== stats.lastRulesError) { stats.lastRulesError = msg; hooks.log && hooks.log('rules error', msg, err && err.stack); }
      return undefined;
    }
  }

  // ---- entities ----
  room.spawn = function (spec) {
    // S19 (play-test 4): every NPC you can talk to gets a title above its name and a real name (js/sim/npc-names.js)
    if (spec.kind === 'npc' && spec.data && (spec.data.npc || spec.data.folk)) { const id = npcIdentity(spec); spec = { ...spec, name: id.name, data: { ...spec.data, title: id.title, ...(id.titled ? {} : { filler: 1 }) } }; }
    if (nextId > 0xFFFE) nextId = 1;
    while (entities.has(nextId)) nextId++;
    const e = new Entity(room, nextId++, spec);
    entities.set(e.id, e);
    grid.add(e);
    stats.spawned++;
    if (e.kind === 'object' || (e.kind === 'npc' && e.data)) room.objects.set(e.id, e);      // also rules-spawned arena objects; NPCs you can talk to
    safe('addEntity', e);
    return e;
  };
  room.objects = new Map();
  room.remove = function (e) {
    if (e.removed) return;
    e.removed = true;
    if (liveTele.size || livePools.size) endFor(e.id, 'gone');          // U3: nothing it was winding up outlives it on screen
    safe('removeEntity', e);
    grid.remove(e);
    entities.delete(e.id);
    room.objects.delete(e.id);
    clients.delete(e.id);
  };

  room.addPlayer = function (char, client, at = null) {
    const x = at ? at.x : Number.isFinite(char.x) && char.room === id ? char.x : spawnPoint.x;
    const z = at ? at.z : Number.isFinite(char.z) && char.room === id ? char.z : spawnPoint.z;
    const e = room.spawn({ kind: 'player', name: char.name, level: char.level || 1, x, z, yaw: char.yaw || 0, char, team: 1, r: at && at.carry });
    if (char.hp > 0) e.setHp(Math.min(char.hp, e.hpMax));
    char.room = id;
    if (rules.formOf) { const f = safe('formOf', e); if (f && f.creature && (f.group === undefined || f.group === 'shape')) e.form = f; }      // U16: a shape carried into this room
    if (client) room.attach(e, client);
    return e;
  };
  room.attach = function (e, client) {
    client.entity = e;
    client.known = new Map();       // id -> { e, ver }
    client.cellBand = new Map();    // cell -> band last sent
    client.inputs = [];
    client.ack = client.ack || 0;
    client.budget = 0;
    client.lastSelf = null; client.lastVitals = null; client.selfDirty = true;
    clients.set(e.id, client);
  };
  room.detach = function (e) { clients.delete(e.id); };
  /**
   * The skill bar the client draws (`you.bar`, PLAN/D's ask): C's `rules.bar(e)`, or undefined when the
   * rules have none (the stand-in rules). It formats text, so it runs on `joined` and on a change only.
   */
  room.barFor = function (e) { const b = safe('bar', e); return Array.isArray(b) ? b : undefined; };
  /** Something changed a player's slots (a talent pick, a form): send `you {bar}` after this tick. */
  room.barChanged = function (e) { if (e) barDirty.add(e.id); };
  host.barChanged = room.barChanged;          // C's rules call this after a talent / perk / level change (P6)
  function flushBars() {
    for (const eid of barDirty) {
      const e = entities.get(eid), c = clients.get(eid);
      if (!e || e.kind !== 'player' || !c || !c.you) continue;
      const bar = room.barFor(e);
      if (bar) c.you({ bar });
    }
    barDirty.clear();
  }
  room.removePlayer = function (e) { room.remove(e); };
  /** The status ids the rules hold on `e` (C's `rules.statusesOf(e)` when it has one, else its unit's `statuses` keys). */
  function statusesOf(e) {
    if (e.dead) return [];
    if (rules.statusesOf) { const l = safe('statusesOf', e); return Array.isArray(l) ? l.map(String) : []; }
    const s = e.r && e.r.unit && e.r.unit.statuses;
    return s && typeof s === 'object' ? Object.keys(s) : [];
  }
  /** Bring `e.st` in step; `announce` = also emit `fx status on:false` for each status that went (a death, a revive, a sweep). */
  function syncStatuses(e, announce) {
    const now = statusesOf(e).sort();
    const old = e.st || [];
    if (now.length === old.length && now.every((x, i) => x === old[i])) return;
    if (announce) for (const s of old) if (!now.includes(s)) room.emit({ type: 'fx', id: e.id, kind: 'status', status: s, on: false });
    e.st = now.length ? now : null;
    e.infoVer++;
  }
  function flushStatuses(sweep) {
    for (const id of stDirty) { const e = entities.get(id); if (e) syncStatuses(e, stClear.has(id)); }
    stDirty.clear(); stClear.clear();
    if (sweep) for (const e of entities.values()) if (e.st) syncStatuses(e, true);
  }
  /** A revive / respawn outside the rules' own events (the province's town respawn): clear what others draw. */
  room.statusChanged = function (e, clear = true) { if (!e) return; stDirty.add(e.id); if (clear) stClear.add(e.id); };

  room.input = function (e, msg) {
    const c = clients.get(e.id);
    if (!c) return;
    if (msg.s <= c.ack || (c.inputs.length && msg.s <= c.inputs[c.inputs.length - 1].s)) return;   // old or replayed
    if (c.inputs.length >= MAX_QUEUED_INPUTS) c.inputs.shift();
    c.inputs.push(msg);
  };
  room.intent = function (e, msg) {
    if (e.dead) return { ok: false, why: 'dead' };
    // no fighting while swimming (P25): attacks and skills are refused; picking a target is still fine
    if ((e.state & STATE.swimming) && msg.t === 'cast') return { ok: false, why: 'swimming', text: 'You cannot fight while swimming.' };
    if (msg.target) { const t = entities.get(msg.target); if (!t) msg = { ...msg, target: undefined }; }
    return safe('intent', e, msg) || { ok: false, why: 'unknown' };
  };
  /** Say chat to everyone within VIEW.sayR; `deliver(recipientChar)` may veto (ignore lists). */
  room.say = function (e, text, deliver = null) {
    const msg = JSON.stringify({ t: 'chat', ch: 'say', from: e.id, name: e.name, text });
    for (const o of grid.query(e.x, e.z, VIEW.sayR)) {
      const c = clients.get(o.id);
      if (c && (!deliver || deliver(o.char))) c.send(msg);
    }
  };
  room.respawn = function (e, at = null) {
    if (!e.dead) return false;
    e.revive(1);                    // alive first: a dead body never moves (Entity.moveTo, P8)
    const p = at && Number.isFinite(at.x) && Number.isFinite(at.z) ? at : spawnPoint;      // U12: a dungeon floor's landing
    e.moveTo(p.x, p.z);
    safe('respawn', e);
    room.statusChanged(e);
    const c = clients.get(e.id); if (c) c.selfDirty = true;
    return true;
  };
  room.award = function (e, { xp = 0, gold = 0, items = null, from = null, reason = 'kill' } = {}) {
    const ch = e.char;
    if (!ch) return;
    xp = Math.max(0, Math.round(xp)); gold = Math.max(0, Math.round(gold));
    // play-test 2, Q3: a kill's gold and items wait on the corpse until looted (js/sim/corpses.js); the experience is now
    if (reason === 'kill' && from && from.kind === 'monster' && hooks.holdKill && (gold || (items && items.length)) && hooks.holdKill(e, from, { gold, items: items || [] }, room)) { gold = 0; items = null; }
    ch.xp = (ch.xp || 0) + xp; ch.gold = (ch.gold || 0) + gold;
    const c = clients.get(e.id);
    if (xp) room.event({ type: 'xp', to: e.id, n: xp, total: ch.xp });
    const lv = rules.levelFor ? safe('levelFor', ch.xp) : ch.level;
    let urgent = false;
    if (lv && lv > (ch.level || 1)) {
      ch.level = lv; e.setLevel(lv);
      safe('onLevel', e);
      barDirty.add(e.id);
      room.event({ type: 'level', d: e.id, level: lv });
      urgent = true;
    }
    // a level-up may add talent tiers / perk points (P6): the rules' build view rides along on a level change
    const build = urgent && rules.build ? safe('build', e) : null;
    if (c && c.you) c.you({ xp: ch.xp, level: ch.level, gold: ch.gold, xpNext: rules.xpFor ? safe('xpFor', (ch.level || 1) + 1) : undefined, hpMax: e.hpMax, mpMax: e.mpMax, ...(build && typeof build === 'object' ? build : {}) });
    hooks.dirty && hooks.dirty(ch, urgent);
    if (hooks.award) hooks.award(e, { gold, xp, level: ch.level, items: items || [], reason, from });
  };

  // ---- camps (monster spawners) ----
  /** Inside a camp's `avoid` circles (vignette props: a well, a barrel — P28), with half a metre for the body. */
  const inProp = (c, x, z) => { if (c.avoid) for (const q of c.avoid) if ((x - q.x) ** 2 + (z - q.z) ** 2 < (q.r + 0.5) ** 2) return true; return false; };
  function spawnInCamp(c) {
    let x = c.x, z = c.z;
    for (let k = 0; k < (c.avoid ? 16 : 8); k++) {
      const a = host.random('spawn') * Math.PI * 2, r = host.random('spawn') * (c.radius || 10);
      const tx = c.x + Math.cos(a) * r, tz = c.z + Math.sin(a) * r;
      if (room.walkable(tx, tz) && !inProp(c, tx, tz)) { x = tx; z = tz; break; }
    }
    const m = room.spawn({ kind: 'monster', type: c.type, level: c.level || 1, x, z, yaw: host.random('spawn') * 6.283, rank: c.rank || 'normal', state: c.rank && c.rank !== 'normal' ? STATE.elite : 0, name: c.name || (c.encounter && opts.encounterInfo && opts.encounterInfo[c.encounter] ? opts.encounterInfo[c.encounter].name : undefined), data: { camp: 1, ...(c.noRank ? { noRank: true } : {}), ...(c.encounter ? { encounter: c.encounter } : {}), ...(c.path ? { path: c.path } : {}), ...(c.affixes ? { affixes: c.affixes } : {}) } });   // camp: S4 — only a camp's ordinary monster may roll a rank
    c.live.add(m.id);
  }
  /** A camp's respawn delay: a number, or [min, max] picked on the room's 'spawn' stream (rares: 20-60 min). */
  function respawnOf(c) { const r = c.respawnMs ?? CAMP_RESPAWN_MS; return Array.isArray(r) ? r[0] + host.random('spawn') * (r[1] - r[0]) : r; }
  const campCalm = c => { for (const idd of c.live) { const m = entities.get(idd); if (!m || m.dead || (m.state & STATE.combat) || m.hp < m.hpMax) return false; } return true; };
  function parkCamp(c) {
    for (const idd of c.live) {
      const m = entities.get(idd);
      if (!m) continue;
      for (const x of [...entities.values()]) if (x.kind === 'monster' && x.data && x.data.escortOf === m.id) room.remove(x);
      room.remove(m);
    }
    c.parked += c.live.size; c.live.clear(); c.idleSince = 0;
    stats.parked = (stats.parked || 0) + 1;
  }
  const playerNear = (x, z, r) => { for (const cl of clients.values()) { const p = cl.entity; if (p && !p.removed && Math.abs(p.x - x) <= r && Math.abs(p.z - z) <= r && Math.hypot(p.x - x, p.z - z) <= r) return true; } return false; };
  function fillCamps(now, initial = false) {
    for (const c of campState) {
      // Y23 (round 10, dev report #55 "enemies respawn 2-5 s after I kill them"): EVERY death starts its own clock. There used
      // to be one clock a camp, started at the first death — so the second wolf you killed, 27 s into it, was "back" 3 s later.
      for (const idd of c.live) { const m = entities.get(idd); if (!m || m.dead) { c.live.delete(idd); if (!initial) c.due.push({ at: now + respawnOf(c), died: now }); } }
      if (c.due.length > 1) c.due.sort((a, b) => a.at - b.at);
      while (c.live.size + c.parked + c.due.length < c.count && !initial) c.due.push({ at: now + respawnOf(c), died: now });      // a body lost some other way
      if (dormant) {
        if (awake[grid.cellOf(c.x, c.z)] !== awakeGen) {
          // out of reach: count respawns on paper, park a calm camp after a while
          while (c.due.length && now >= c.due[0].at) { c.due.shift(); c.parked++; }
          if (c.live.size) { c.idleSince ||= now || 1; if (now - c.idleSince >= DORMANT_MS && campCalm(c)) parkCamp(c); }
          continue;
        }
        c.idleSince = 0;
        while (c.parked > 0) { c.parked--; spawnInCamp(c); }
      }
      if (initial) { while (c.live.size < c.count) spawnInCamp(c); c.due.length = 0; continue; }
      if (c.live.size >= c.count) { c.due.length = 0; continue; }
      // ...and never back inside a minute while a player still stands within sight of the camp (whatever its own timer says)
      while (c.due.length && now >= c.due[0].at && c.live.size < c.count) {
        if (now - c.due[0].died < RESPAWN_IN_VIEW_MS && playerNear(c.x, c.z, RESPAWN_VIEW_M)) break;
        c.due.shift(); spawnInCamp(c);
      }
    }
  }
  room.camps = campState;

  // ---- one tick ----
  room.step = function () {
    tick++;
    const now = room.now();
    // awake cells: within awakeR of any player (recomputed every 5th tick; players move < 3 m in that time)
    if (tick % 5 === 1) {
      awakeGen = (awakeGen + 1) >>> 0 || 1;
      for (const e of entities.values()) if (e.kind === 'player') markAwake(e.x, e.z);
    }
    // 1. movement inputs
    for (const c of clients.values()) applyInputs(c);
    // 2. rules
    safe('step', tickMs);
    // 3. despawns + camps
    if (despawns.length) {
      for (let i = despawns.length - 1; i >= 0; i--) if (despawns[i].at <= now) {
        // a body with loot still on it stays until it is looted or its time is up (Q3, hooks.keepBody)
        const keep = hooks.keepBody && !despawns[i].e.removed ? hooks.keepBody(despawns[i].e, room) : 0;
        if (keep > 0) { despawns[i].at = now + keep; continue; }
        room.remove(despawns[i].e); despawns.splice(i, 1);
      }
    }
    if (tick % 10 === 1) fillCamps(now);
    if (barDirty.size) flushBars();
    if (stDirty.size || tick % 20 === 3) flushStatuses(tick % 20 === 3);
    if (tick % 10 === 5) flushMana();
    // 4. snapshots + events
    send();
    events = [];
  };

  /**
   * Play-test 3 R6+: other players' mana (target frame, party frames). Health rides the snapshot; mana does not, so a
   * player's mana goes out as an `mp {id, n, max}` event at most every 500 ms, only when the whole number changed.
   * `info.mpMax` carries the maximum for a late joiner; your own mana is still in `you`.
   */
  function flushMana() {
    for (const c of clients.values()) {
      const e = c.entity;
      if (!e || e.kind !== 'player') continue;
      const n = Math.round(e.mp || 0), max = Math.round(e.mpMax || 0);
      if (e._mpSent === n && e._mpMaxSent === max) continue;
      e._mpSent = n; e._mpMaxSent = max;
      room.emit({ type: 'mp', id: e.id, n, max });
    }
  }

  function markAwake(x, z) {
    const r = VIEW.awakeR, cell = grid.cell, cols = grid.cols, ox = grid.origin.x, oz = grid.origin.z;
    const c0x = Math.max(0, Math.floor((x - r - ox) / cell)), c1x = Math.min(cols - 1, Math.floor((x + r - ox) / cell));
    const c0z = Math.max(0, Math.floor((z - r - oz) / cell)), c1z = Math.min(cols - 1, Math.floor((z + r - oz) / cell));
    for (let cz = c0z; cz <= c1z; cz++) { const row = cz * cols; for (let cx = c0x; cx <= c1x; cx++) awake[row + cx] = awakeGen; }
  }

  function applyInputs(c) {
    const e = c.entity;
    c.budget = Math.min(MOVE_BUDGET_CAP, c.budget + tickMs);
    if (!c.inputs.length) {
      if (!e.dead && e.airborne) {   // keep falling with no input
        const st = { x: e.x, y: e.y, z: e.z, vy: e.vy, airborne: e.airborne };
        stepMove(st, { mx: 0, mz: 0, b: 0 }, tickMs, terrain);
        commitMove(e, st, 0, 0, 0); c.selfDirty = true;
      }
      if (!e.dead && !e.airborne && e.kind === 'player') e.loop(e.state & STATE.swimming ? 'swim' : e.sitting ? 'sit' : e.fishing ? (e.fishing.tug ? 'reel' : 'fish') : e.working ? e.working.anim /* W9 (P-core) */ : 'idle');   // T25: a line out is its own pose
      return;
    }
    let moved = false, lastB = 0, mxs = 0, mzs = 0;
    for (const m of c.inputs) {
      c.ack = m.s;
      if (e.dead) continue;
      const dt = Math.min(m.dt, 100, c.budget);
      if (dt <= 0) continue;
      c.budget -= dt;
      const st = { x: e.x, y: e.y, z: e.z, vy: e.vy, airborne: e.airborne, speedMul: e.speedMul || 1 };
      // W26 (round 8): while `e.held` (calling a mount, riding a cart) you STAND — the client's movement is ignored, facing still turns
      stepMove(st, e.held ? { ...m, mx: 0, mz: 0, b: 0 } : m, dt, terrain);
      commitMove(e, st);
      e.face(m.yaw);
      moved = true; lastB = e.held ? 0 : m.b; mxs = e.held ? 0 : m.mx; mzs = e.held ? 0 : m.mz;
    }
    c.inputs.length = 0;
    c.selfDirty = true;
    if (moved && !e.dead) {
      const going = Math.hypot(mxs, mzs) > 0.05;
      // S20 (play-test 4): a step (or a jump) stands you up — the meal ends (the province's standUp hook)
      if (e.sitting && (going || e.airborne)) { if (hooks.standUp) hooks.standUp(e, 'moved'); if (e.sitting) { e.sitting = false; e.eating = null; e.infoVer++; } }
      e.setState(STATE.sprinting, going && !!(lastB & IN.SPRINT));
      if (e.airborne) e.loop(e.vy > 0 ? 'jump' : 'fall');
      else if (e.state & STATE.swimming) e.loop('swim');
      else e.loop(going ? ((lastB & IN.SPRINT) ? 'sprint' : 'run') : e.sitting ? 'sit' : e.fishing ? (e.fishing.tug ? 'reel' : 'fish') : e.working ? e.working.anim /* W9 (P-core) */ : 'idle');
    }
  }
  function commitMove(e, st) {
    const wasAir = e.airborne;
    e.vy = st.vy; e.airborne = st.airborne;
    if (wasAir !== st.airborne) e.setState(STATE.airborne, st.airborne);
    if (!!st.swim !== !!(e.state & STATE.swimming)) setSwim(e, !!st.swim);
    e.moveTo(st.x, st.z, st.y);
  }
  /** Into / out of deep water (P25): the state bit (clients draw the swim pose and get y while it is set), and
   *  the rules hear about it (`rules.onSwim(e, on)` when they have it — e.g. to drop a cast). */
  function setSwim(e, on) {
    e.setState(STATE.swimming, on);
    if (on) e.loop('swim');
    safe('onSwim', e, on);
    if (hooks.onSwim) hooks.onSwim(e, on, room);          // the province: a rider gets off (Q16)
  }

  // ---- snapshots (docs/protocol.md §4) ----
  function bandDue(b) { const r = VIEW.rates[b]; return Math.floor(tick * r / 20) !== Math.floor((tick - 1) * r / 20); }
  function encodeCell(cell, band, full) {
    writer.reset();
    const fulls = full ? null : new Set();
    for (const e of grid.at(cell)) {
      if (full) { encodeRecord(writer, e, F.FULL, q, bounds.minX, bounds.minZ); continue; }
      const d = e.dirty[band];
      if (!d) continue;
      if (d & F.FULL) fulls.add(e.id);
      encodeRecord(writer, e, d, q, bounds.minX, bounds.minZ);
    }
    return { bytes: writer.out(), fulls };
  }

  const viewTmp = [], evIdx = [], evCache = new Map();
  function send() {
    evCache.clear();
    const due = [bandDue(0), bandDue(1), bandDue(2)];
    const anyDue = due[0] || due[1] || due[2];
    const deltaCache = new Map(), fullCache = new Map();
    const R = VIEW.bands[2];
    for (const c of clients.values()) {
      const me = c.entity;
      // events near me (every tick)
      if (events.length) {
        // a crowd sees the same events: the frame is serialised once per distinct set (keyed by which events are in
        // it) and shared; a client with a personal event (`to` = me) gets its own
        let n = 0, personal = false, all = true;
        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          const at = ev._at || ev;
          const mine = ev.to !== undefined ? ev.to === me.id : (Math.abs(at.x - me.x) <= R && Math.abs(at.z - me.z) <= R);
          if (mine) { evIdx[n++] = i; if (ev.to !== undefined) personal = true; } else all = false;
        }
        if (n) {
          let str;
          if (personal) { const out = []; for (let k = 0; k < n; k++) { const ev = events[evIdx[k]]; out.push(ev.to !== undefined ? stripTo(ev) : ev); } str = JSON.stringify({ t: 'ev', k: tick, e: out }); }
          else {
            let key = all ? '*' : ''; if (!all) for (let k = 0; k < n; k++) key += evIdx[k] + ',';
            str = evCache.get(key);
            if (!str) { const out = []; for (let k = 0; k < n; k++) out.push(events[evIdx[k]]); str = JSON.stringify({ t: 'ev', k: tick, e: out }); evCache.set(key, str); }
          }
          c.send(str);
        }
      }
      if (!anyDue) continue;
      // my view: cells by distance from me to the cell centre, nearest first, capped
      let nv = 0;
      {
        const cell = grid.cell, cols = grid.cols, ox = grid.origin.x, oz = grid.origin.z;
        const R2 = R * R, b0 = VIEW.bands[0] * VIEW.bands[0], b1 = VIEW.bands[1] * VIEW.bands[1];
        const myCell = grid.cellOf(me.x, me.z);
        const c0x = Math.max(0, Math.floor((me.x - R - ox) / cell)), c1x = Math.min(cols - 1, Math.floor((me.x + R - ox) / cell));
        const c0z = Math.max(0, Math.floor((me.z - R - oz) / cell)), c1z = Math.min(cols - 1, Math.floor((me.z + R - oz) / cell));
        for (let cz = c0z; cz <= c1z; cz++) {
          const dz = oz + (cz + 0.5) * cell - me.z, dz2 = dz * dz;
          for (let cx = c0x; cx <= c1x; cx++) {
            const ci = cz * cols + cx;
            const dx = ox + (cx + 0.5) * cell - me.x, d2 = dx * dx + dz2;
            if (d2 > R2 && ci !== myCell) continue;
            if (!grid.at(ci).size && !c.cellBand.has(ci)) continue;
            let v = viewTmp[nv];
            if (!v) v = viewTmp[nv] = { ci: 0, d: 0, band: 0 };
            v.ci = ci; v.d = d2; v.band = d2 <= b0 ? 0 : d2 <= b1 ? 1 : 2;
            nv++;
          }
        }
      }
      viewTmp.length = nv;
      viewTmp.sort((a, b) => a.d - b.d);
      const inView = new Map();
      let count = 0;
      for (const v of viewTmp) {
        const n = grid.at(v.ci).size;
        if (count + n > VIEW.cap && inView.size) break;
        count += n; inView.set(v.ci, v.band);
      }
      for (const ci of c.cellBand.keys()) if (!inView.has(ci)) c.cellBand.delete(ci);
      const chunks = [];
      const newInfo = [];
      let extra = null;
      for (const [ci, band] of inView) {
        if (!due[band]) continue;
        let fullSent = c.cellBand.get(ci) !== band, fulls = null;
        if (fullSent) {
          let fc = fullCache.get(ci); if (!fc) { fc = encodeCell(ci, band, true); fullCache.set(ci, fc); }
          if (fc.bytes.length) chunks.push(fc.bytes);
          c.cellBand.set(ci, band);
        } else {
          const key = ci * BANDS + band;
          let dc = deltaCache.get(key); if (!dc) { dc = encodeCell(ci, band, false); dc.ci = ci; dc.band = band; deltaCache.set(key, dc); }
          if (dc.bytes.length) chunks.push(dc.bytes);
          fulls = dc.fulls;
        }
        for (const e of grid.at(ci)) {
          const k = c.known.get(e.id);
          if (!k) {
            if (!fullSent && !fulls.has(e.id)) { extra ||= new ByteWriter(64); encodeRecord(extra, e, F.FULL, q, bounds.minX, bounds.minZ); }
            c.known.set(e.id, { e, ver: e.infoVer });
            newInfo.push(e.infoJSON());
          } else if (k.e !== e) {   // id reused after a despawn: treat as new
            c.known.set(e.id, { e, ver: e.infoVer }); newInfo.push(e.infoJSON());
            if (!fullSent && !fulls.has(e.id)) { extra ||= new ByteWriter(64); encodeRecord(extra, e, F.FULL, q, bounds.minX, bounds.minZ); }
          } else if (k.ver !== e.infoVer) { k.ver = e.infoVer; newInfo.push(e.infoJSON()); }
        }
      }
      if (extra) chunks.push(extra.out());
      const left = [];
      for (const [eid, k] of c.known) {
        if (k.e.removed || k.e.cell < 0 || !inView.has(k.e.cell)) { left.push(eid); c.known.delete(eid); }
      }
      if (newInfo.length) c.send('{"t":"info","ents":[' + newInfo.join(',') + ']}');
      // self block
      let self = null, vitals = null;
      if (c.selfDirty || !c.lastSelf) { self = { x: me.x, y: me.y, z: me.z, vy: me.vy }; c.selfDirty = false; c.lastSelf = self; }
      const lv = c.lastVitals;
      if (!lv || lv.hp !== me.hp || lv.hpMax !== me.hpMax || lv.mp !== Math.round(me.mp) || lv.mpMax !== me.mpMax) {
        vitals = { hp: me.hp, hpMax: me.hpMax, mp: Math.round(me.mp), mpMax: me.mpMax }; c.lastVitals = vitals;
      }
      if (!due[0] && !chunks.length && !left.length && !self && !vitals) continue;
      const frame = encodeClientSnap({ tick, ack: c.ack, self, vitals, dead: me.dead, left, chunks }, snapWriter);
      c.send(frame);
      if (c.bytesOut !== undefined) c.bytesOut += frame.length;
    }
    // clear the dirty bits that were just encoded for each band
    for (const dc of deltaCache.values()) for (const e of grid.at(dc.ci)) e.dirty[dc.band] = 0;
    // bands nobody looked at keep accumulating; a FULL record goes out when someone starts looking
  }
  function stripTo(ev) { const o = { ...ev }; delete o.to; return o; }

  // objects: portals, stairs, exits, chests, gates, levers, arena props (team 0: nobody fights them)
  for (const o of objects) {
    const npc = o.type === 'npc';
    room.spawn({ kind: npc ? 'npc' : 'object', type: o.type, name: o.name || o.type, x: o.x, z: o.z, yaw: o.yaw || 0, team: npc ? 1 : 0, state: npc ? STATE.friendly : 0,
      data: { portal: o.portal || null, chest: o.chest || null, gate: o.gate || null, lever: o.lever || null, rules: !!o.rules, key: o.key || null, r: o.r || null, state: o.state || null, room: o.room ?? null,
        note: o.note || null, use: o.use || null, npc: o.npc || null, hidden: !!o.hidden, hint: o.hint || null, lore: o.lore || null, waystone: o.waystone || null, schedule: o.schedule || null,
        treasure: o.treasure || null, site: o.site || null, shimmer: o.shimmer || null, office: o.office || null,
        /* play-test 6: dungeon floors, the lift, the way in */ ...(o.lift ? { lift: o.lift } : {}), ...(o.floor ? { floor: o.floor } : {}), ...(o.dir ? { dir: o.dir } : {}), ...(o.leave ? { leave: true } : {}), ...(npc && o.title ? { title: o.title } : {}), ...(o.cart ? { cart: o.cart } : {}), ...(o.guard ? { guard: o.guard } : {}), ...(o.fighter ? { fighter: o.fighter } : {}) } });
  }
  /** Change an object's state (lit, used, broken, open…): late joiners see it in `info`, everyone near gets `obj`. */
  room.objState = function (o, state, extra = {}) {
    o.data = { ...(o.data || {}), state };
    o.infoVer++;
    room.emit({ type: 'obj', id: o.id, state, x: o.x, z: o.z, ...extra });
  };
  host.objState = room.objState;
  /** The object `objId` if `e` stands within reach of it. */
  room.objectNear = function (e, objId, reach = 4) {
    const o = room.objects.get(objId);
    if (!o || o.removed) return { why: 'unknown' };
    if (Math.hypot(o.x - e.x, o.z - e.z) > reach + 0.5) return { why: 'far', o };
    return { o };
  };

  // first fill
  fillCamps(0, true);
  return room;
}
