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
  let awakeGen = 0;
  const stats = { rulesErrors: 0, lastRulesError: '', spawned: 0 };
  const writer = new ByteWriter(4096), snapWriter = new ByteWriter(2048);
  const campState = camps.map(c => ({ ...c, live: new Set(), nextAt: 0 }));
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
      room.emit(ev);
    },
    /** Emit without interception (the world's own loot events). */
    emit(ev) {
      if (ev.x === undefined) fillXZ(ev);
      events.push(ev);
    },
  };
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
  room.host = host;

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
  room.removePlayer = function (e) { room.remove(e); };

  room.input = function (e, msg) {
    const c = clients.get(e.id);
    if (!c) return;
    if (msg.s <= c.ack || (c.inputs.length && msg.s <= c.inputs[c.inputs.length - 1].s)) return;   // old or replayed
    if (c.inputs.length >= MAX_QUEUED_INPUTS) c.inputs.shift();
    c.inputs.push(msg);
  };
  room.intent = function (e, msg) {
    if (e.dead) return { ok: false, why: 'dead' };
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
  room.respawn = function (e) {
    if (!e.dead) return false;
    e.moveTo(spawnPoint.x, spawnPoint.z);
    e.revive(1);
    safe('respawn', e);
    const c = clients.get(e.id); if (c) c.selfDirty = true;
    return true;
  };
  room.award = function (e, { xp = 0, gold = 0, items = null, from = null, reason = 'kill' } = {}) {
    const ch = e.char;
    if (!ch) return;
    xp = Math.max(0, Math.round(xp)); gold = Math.max(0, Math.round(gold));
    ch.xp = (ch.xp || 0) + xp; ch.gold = (ch.gold || 0) + gold;
    const c = clients.get(e.id);
    if (xp) room.event({ type: 'xp', to: e.id, n: xp, total: ch.xp });
    const lv = rules.levelFor ? safe('levelFor', ch.xp) : ch.level;
    let urgent = false;
    if (lv && lv > (ch.level || 1)) {
      ch.level = lv; e.setLevel(lv);
      safe('onLevel', e);
      room.event({ type: 'level', d: e.id, level: lv });
      urgent = true;
    }
    if (c && c.you) c.you({ xp: ch.xp, level: ch.level, gold: ch.gold, xpNext: rules.xpFor ? safe('xpFor', (ch.level || 1) + 1) : undefined, hpMax: e.hpMax, mpMax: e.mpMax });
    hooks.dirty && hooks.dirty(ch, urgent);
    if (hooks.award) hooks.award(e, { gold, xp, level: ch.level, items: items || [], reason, from });
  };

  // ---- camps (monster spawners) ----
  function spawnInCamp(c) {
    let x = c.x, z = c.z;
    for (let k = 0; k < 8; k++) {
      const a = host.random('spawn') * Math.PI * 2, r = host.random('spawn') * (c.radius || 10);
      const tx = c.x + Math.cos(a) * r, tz = c.z + Math.sin(a) * r;
      if (room.walkable(tx, tz)) { x = tx; z = tz; break; }
    }
    const m = room.spawn({ kind: 'monster', type: c.type, level: c.level || 1, x, z, yaw: host.random('spawn') * 6.283, rank: c.rank || 'normal', state: c.rank && c.rank !== 'normal' ? STATE.elite : 0, name: c.name || (c.encounter && opts.encounterInfo && opts.encounterInfo[c.encounter] ? opts.encounterInfo[c.encounter].name : undefined), data: c.encounter ? { encounter: c.encounter } : null });
    c.live.add(m.id);
  }
  /** A camp's respawn delay: a number, or [min, max] picked on the room's 'spawn' stream (rares: 20-60 min). */
  function respawnOf(c) { const r = c.respawnMs ?? 30000; return Array.isArray(r) ? r[0] + host.random('spawn') * (r[1] - r[0]) : r; }
  function fillCamps(now, initial = false) {
    for (const c of campState) {
      for (const idd of c.live) { const m = entities.get(idd); if (!m || m.dead) c.live.delete(idd); }
      if (initial) { while (c.live.size < c.count) spawnInCamp(c); continue; }
      if (c.live.size >= c.count) { c.nextAt = 0; continue; }
      if (!c.nextAt) c.nextAt = now + respawnOf(c);
      if (now >= c.nextAt) { spawnInCamp(c); c.nextAt = c.live.size < c.count ? now + respawnOf(c) : 0; }
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
      for (let i = despawns.length - 1; i >= 0; i--) if (despawns[i].at <= now) { room.remove(despawns[i].e); despawns.splice(i, 1); }
    }
    if (tick % 10 === 1) fillCamps(now);
    // 4. snapshots + events
    send();
    events = [];
  };

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
      if (!e.dead && !e.airborne && e.kind === 'player') e.loop('idle');
      return;
    }
    let moved = false, lastB = 0, mxs = 0, mzs = 0;
    for (const m of c.inputs) {
      c.ack = m.s;
      if (e.dead) continue;
      const dt = Math.min(m.dt, 100, c.budget);
      if (dt <= 0) continue;
      c.budget -= dt;
      const st = { x: e.x, y: e.y, z: e.z, vy: e.vy, airborne: e.airborne };
      stepMove(st, m, dt, terrain);
      commitMove(e, st);
      e.face(m.yaw);
      moved = true; lastB = m.b; mxs = m.mx; mzs = m.mz;
    }
    c.inputs.length = 0;
    c.selfDirty = true;
    if (moved && !e.dead) {
      const going = Math.hypot(mxs, mzs) > 0.05;
      e.setState(STATE.sprinting, going && !!(lastB & IN.SPRINT));
      if (e.airborne) e.loop(e.vy > 0 ? 'jump' : 'fall');
      else e.loop(going ? ((lastB & IN.SPRINT) ? 'sprint' : 'run') : 'idle');
    }
  }
  function commitMove(e, st) {
    const wasAir = e.airborne;
    e.vy = st.vy; e.airborne = st.airborne;
    if (wasAir !== st.airborne) e.setState(STATE.airborne, st.airborne);
    e.moveTo(st.x, st.z, st.y);
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

  const viewTmp = [];
  function send() {
    const due = [bandDue(0), bandDue(1), bandDue(2)];
    const anyDue = due[0] || due[1] || due[2];
    const deltaCache = new Map(), fullCache = new Map();
    const R = VIEW.bands[2];
    for (const c of clients.values()) {
      const me = c.entity;
      // events near me (every tick)
      if (events.length) {
        let out = null;
        for (const ev of events) {
          if (ev.to !== undefined ? ev.to === me.id : (Math.abs(ev.x - me.x) <= R && Math.abs(ev.z - me.z) <= R)) {
            (out ||= []).push(ev.to !== undefined ? stripTo(ev) : ev);
          }
        }
        if (out) c.send(JSON.stringify({ t: 'ev', k: tick, e: out }));
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
            newInfo.push(e.info());
          } else if (k.e !== e) {   // id reused after a despawn: treat as new
            c.known.set(e.id, { e, ver: e.infoVer }); newInfo.push(e.info());
            if (!fullSent && !fulls.has(e.id)) { extra ||= new ByteWriter(64); encodeRecord(extra, e, F.FULL, q, bounds.minX, bounds.minZ); }
          } else if (k.ver !== e.infoVer) { k.ver = e.infoVer; newInfo.push(e.info()); }
        }
      }
      if (extra) chunks.push(extra.out());
      const left = [];
      for (const [eid, k] of c.known) {
        if (k.e.removed || k.e.cell < 0 || !inView.has(k.e.cell)) { left.push(eid); c.known.delete(eid); }
      }
      if (newInfo.length) c.send(JSON.stringify({ t: 'info', ents: newInfo }));
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
        note: o.note || null, use: o.use || null, npc: o.npc || null, hidden: !!o.hidden, hint: o.hint || null, lore: o.lore || null, waystone: o.waystone || null, schedule: o.schedule || null } });
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
