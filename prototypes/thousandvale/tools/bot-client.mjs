#!/usr/bin/env node
// Thousandvale bot client (stream G): real WebSocket bots that log in, walk and fight.
//
// They speak the real protocol through stream A's `js/net/client.js` (the same library the browser
// uses), so a bot exercises exactly the code path a player does: gateway hello/guest/create/play,
// province enter, 20 Hz `in` messages, `cast` at a wolf, binary snapshots, auto-reconnect.
//
// CLI:
//   node prototypes/thousandvale/tools/bot-client.mjs --url ws://127.0.0.1:8491 --bots 20 --seconds 60
//     --mode fight|walk|idle   fight (default): wander, chase wolves within 30 m and swing at them
//     --radius 60              wander radius around the spawn, metres
//     --cls warrior            Farhold class id for new characters
//     --stagger 100            ms between bot logins
//     --json                   print the final report as JSON
//
// Library (tests/load/*):
//   import { startBot, startBots, getStatus } from '../../tools/bot-client.mjs';
//   const bot = await startBot({ url, name: 'Bot1', mode: 'fight' });   // resolves once joined
//   bot.stats  -> { joins, snaps, bytes, inputs, casts, hitsDealt, kills, deaths, refusals, errors, lastSnapAt }
//   bot.pos    -> { x, y, z } (server-authoritative, from the snapshot self block)
//   bot.charId, bot.you, bot.ents (Map id -> { id, kind, type, name, x, z, hp, dead })
//   bot.stop() -> closes the sockets (leave)
//   bot.waitFor(pred, ms) -> resolves when pred(bot) is true

import { connect } from '../js/net/client.js';
import { IN } from '../js/net/protocol.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** HTTP base for a ws url: ws://h:p -> http://h:p */
export function httpBase(url) { return url.replace(/^ws/, 'http').replace(/\/+$/, ''); }

/** GET /status as JSON. */
export async function getStatus(url) {
  const res = await fetch(httpBase(url) + '/status');
  if (!res.ok) throw new Error('status HTTP ' + res.status);
  return res.json();
}

/** A tiny seeded rng so a bot's wander is the same run to run (mulberry32). */
function rngFor(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * A WebSocket factory with the shape js/net/sockets.js uses, safe under Node 22: Node's built-in
 * WebSocket fires only `error` (never `close`) when the connection is refused, and stays CONNECTING
 * forever — so client.js's retry loop, which waits for `onclose`, stalls while the server is down
 * (found by the kill -9 test). Here an error before open counts as a close. Reported to stream A
 * (docs/requests.md); once js/net/sockets.js does the same, this can go.
 */
export function nodeSafeWsFactory(base) {
  return path => {
    const ws = new WebSocket(base.replace(/\/$/, '') + path);
    ws.binaryType = 'arraybuffer';
    let closedOnce = false;
    const s = {
      get readyState() { return closedOnce ? 3 : ws.readyState; },
      onopen: null, onmessage: null, onclose: null,
      send(d) { if (ws.readyState === 1) ws.send(d); },
      close() { try { ws.close(); } catch { /* ignore */ } },
    };
    const fireClose = (code, reason) => { if (closedOnce) return; closedOnce = true; s.onclose && s.onclose({ code, reason }); };
    ws.onopen = () => s.onopen && s.onopen();
    ws.onmessage = ev => s.onmessage && s.onmessage({ data: ev.data });
    ws.onclose = ev => fireClose(ev.code, ev.reason);
    ws.onerror = () => { if (ws.readyState !== 1) { fireClose(1006, 'error'); try { ws.close(); } catch { /* ignore */ } } };
    return s;
  };
}

let botCounter = 0;

/**
 * Start one bot. Resolves with the bot once it has joined the world (or rejects after `joinTimeout`).
 * opts: { url, name, cls, mode, radius, seed, token, joinTimeout, log }
 */
export async function startBot(opts = {}) {
  const n = ++botCounter;
  const url = opts.url || 'ws://127.0.0.1:8491';
  const mode = opts.mode || 'fight';
  const radius = opts.radius ?? 60;
  const rnd = rngFor(opts.seed ?? n * 7919);
  let token = opts.token || null;
  const name = opts.name || `Bot ${String.fromCharCode(65 + (n % 26))}${String.fromCharCode(97 + ((n * 7) % 26))}${String.fromCharCode(97 + ((n * 13) % 26))}`;

  const bot = {
    name, mode, charId: null, you: null, room: null, myId: null,
    pos: null, home: null, waypoint: null, target: null,
    ents: new Map(),
    stats: { joins: 0, snaps: 0, bytes: 0, inputs: 0, casts: 0, hitsDealt: 0, hitsTaken: 0, kills: 0, deaths: 0, refusals: 0, errors: 0, kicks: 0, lastSnapAt: 0, firstPos: null },
    get token() { return token; },
    net: null,
    stopped: false,
  };

  const net = connect({
    mode: 'ws', url,
    socketFactory: nodeSafeWsFactory(url),
    tokenStore: { get: () => token, set: t => { token = t; } },
    build: opts.build || 'dev',
  });
  bot.net = net;

  net.on('chars', async list => {
    if (bot.charId != null || bot.stopped || bot.picking) return;
    bot.picking = true;                 // client.js emits `chars` again after create — only pick once
    try {
      let ch = list && list[0];
      // names are unique per realm: on a clash (e.g. a store kept from an earlier run) try a suffix
      for (let k = 0; !ch && k < 4; k++) {
        const nm = k ? `${name.slice(0, 11)} ${'abcdefghij'[(n + k) % 10]}${'klmnopqrst'[Math.floor(rnd() * 10)]}` : name;
        try { ch = await net.createChar({ name: nm, cls: opts.cls || 'warrior' }); bot.name = nm; }
        catch (err) { if (k === 3) throw err; }
      }
      bot.charId = ch.id;
      await net.play(ch.id);
    } catch (err) { bot.stats.errors++; opts.log?.(`${name}: ${err.message || err}`); }
    finally { bot.picking = false; }
  });
  net.on('joined', j => {
    bot.stats.joins++;
    bot.room = j.room; bot.you = j.you; bot.myId = j.you.id;
    bot.pos = { x: j.you.x, y: j.you.y, z: j.you.z };
    if (!bot.stats.firstPos) bot.stats.firstPos = { ...bot.pos };
    bot.stats.joinPos = { ...bot.pos };          // where the server put me on this (re)join
    // protocol v2: new characters start in the TOWN room (no monsters; a circle j.room.area). A fighting
    // or walking bot heads out through the edge on its own bearing; crossing it hands it to the wilds room.
    bot.town = j.room.kind === 'town' ? (j.room.area || null) : null;
    if (bot.town) {
      const a = rnd() * Math.PI * 2, r = bot.town.r + 30;
      bot.exit = { x: bot.town.x + Math.cos(a) * r, z: bot.town.z + Math.sin(a) * r };
    } else {
      bot.exit = null;
      if (!bot.home || bot.homeFromTown) { bot.home = { x: j.you.x, z: j.you.z }; bot.homeFromTown = false; }
      // keep wandering out here, away from the town edge so it does not bounce back in
      if (j.room.town) {
        const t = j.room.town, dx = j.you.x - t.x, dz = j.you.z - t.z, d = Math.hypot(dx, dz) || 1;
        const push = Math.max(0, t.r + radius + 10 - d);
        bot.home = { x: j.you.x + dx / d * push, z: j.you.z + dz / d * push };
      }
    }
    bot.roomKind = j.room.kind || 'wilds';
    bot.ents.clear(); bot.target = null; bot.waypoint = null;
  });
  net.on('info', ents => {
    for (const e of ents) bot.ents.set(e.id, { ...(bot.ents.get(e.id) || {}), ...e, dead: false });
  });
  net.on('snap', snap => {
    bot.stats.snaps++; bot.stats.lastSnapAt = Date.now();
    if (snap.bytes) bot.stats.bytes += snap.bytes;
    if (snap.self) bot.pos = { x: snap.self.x, y: snap.self.y, z: snap.self.z };
    for (const id of snap.left || []) bot.ents.delete(id);
    for (const r of snap.ents || []) {
      const e = bot.ents.get(r.id) || { id: r.id };
      if (r.kind != null && typeof r.kind === 'number') e.kindId = r.kind;
      if (r.x != null) e.x = r.x;
      if (r.z != null) e.z = r.z;
      if (r.hp != null) e.hp = r.hp;
      if (r.state != null) e.dead = !!(r.state & 1);
      bot.ents.set(r.id, e);
    }
    if (snap.dead && !bot.wasDead) { bot.stats.deaths++; setTimeout(() => !bot.stopped && net.respawn(), 1500); }
    bot.wasDead = !!snap.dead;
  });
  net.on('ev', ({ e }) => {
    for (const ev of e || []) {
      if (ev.type === 'hit' && ev.kind === 'dmg') {
        if (ev.s === bot.myId) bot.stats.hitsDealt++;
        if (ev.d === bot.myId) bot.stats.hitsTaken++;
      } else if (ev.type === 'die') {
        const ent = bot.ents.get(ev.d);
        if (ent) ent.dead = true;
        if (ev.by === bot.myId) bot.stats.kills++;
        if (bot.target === ev.d) bot.target = null;
      }
    }
  });
  net.on('castR', () => { bot.stats.refusals++; });
  net.on('kick', () => { bot.stats.kicks++; });

  // ---- behaviour: one input per 50 ms, a swing whenever a wolf is in reach ---------------------
  let seq = 0, lastCast = 0;
  const tickTimer = setInterval(() => {
    if (bot.stopped || !bot.pos || bot.myId == null || bot.wasDead) return;
    let goal = null;
    if (mode === 'fight') {
      let best = null, bestD = 30;
      for (const e of bot.ents.values()) {
        if (e.dead || e.x == null || !isMonster(e)) continue;
        const d = Math.hypot(e.x - bot.pos.x, e.z - bot.pos.z);
        if (d < bestD) { bestD = d; best = e; }
      }
      bot.target = best ? best.id : null;
      if (best) {
        goal = best;
        const now = Date.now();
        if (bestD < 3.0 && now - lastCast > 950) {
          lastCast = now; bot.stats.casts++;
          net.cast({ slot: 0, aim: { x: best.x, z: best.z }, target: best.id });
        }
        if (bestD < 2.0) goal = null;   // close enough: stand and swing
      }
    }
    if (!goal && bot.exit && mode !== 'idle') goal = bot.exit;
    if (!goal && mode !== 'idle' && !(mode === 'fight' && bot.target != null)) {
      if (!bot.waypoint || Math.hypot(bot.waypoint.x - bot.pos.x, bot.waypoint.z - bot.pos.z) < 3) {
        const a = rnd() * Math.PI * 2, r = radius * Math.sqrt(rnd());
        const h = bot.home || bot.pos;
        bot.waypoint = { x: h.x + Math.cos(a) * r, z: h.z + Math.sin(a) * r };
      }
      goal = bot.waypoint;
    }
    let mx = 0, mz = 0, yaw = 0;
    if (goal) {
      const dx = goal.x - bot.pos.x, dz = goal.z - bot.pos.z, d = Math.hypot(dx, dz) || 1;
      mx = dx / d; mz = dz / d; yaw = Math.atan2(dx, dz);
    }
    net.input({ s: ++seq, dt: 50, mx, mz, yaw, b: 0 });
    bot.stats.inputs++;
  }, 50);

  bot.stop = async () => {
    bot.stopped = true; clearInterval(tickTimer);
    try { net.leave?.(); } catch { /* closing anyway */ }
    await sleep(50);
    try { net.close(); } catch { /* already closed */ }
  };
  bot.waitFor = async (pred, ms = 10000, every = 50) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (pred(bot)) return true; await sleep(every); }
    throw new Error(`${name}: waitFor timed out after ${ms} ms`);
  };

  const joinTimeout = opts.joinTimeout ?? 15000;
  try { await bot.waitFor(b => b.stats.joins > 0, joinTimeout); }
  catch (err) { await bot.stop(); throw err; }
  return bot;
}

function isMonster(e) {
  return e.kind === 'monster' || e.kindId === 2;
}

/** Start `count` bots, `stagger` ms apart. Resolves with the array once all have joined. */
export async function startBots(count, opts = {}) {
  const bots = [];
  const pending = [];
  for (let i = 0; i < count; i++) {
    pending.push(startBot({ ...opts, seed: (opts.seed ?? 1) * 1000 + i }).then(b => bots.push(b)));
    if (opts.stagger ?? 100) await sleep(opts.stagger ?? 100);
  }
  await Promise.all(pending);
  return bots;
}

/** Sum the bots' stats into one report. */
export function report(bots) {
  const sum = {};
  for (const b of bots) for (const [k, v] of Object.entries(b.stats)) if (typeof v === 'number' && k !== 'lastSnapAt') sum[k] = (sum[k] || 0) + v;
  sum.bots = bots.length;
  sum.moved = bots.filter(b => b.stats.firstPos && b.pos && Math.hypot(b.pos.x - b.stats.firstPos.x, b.pos.z - b.stats.firstPos.z) > 2).length;
  return sum;
}

// ---- CLI -------------------------------------------------------------------------------------------
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const isMain = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (isMain) {
  const url = arg('url', 'ws://127.0.0.1:8491');
  const count = +arg('bots', 5), seconds = +arg('seconds', 30);
  const t0 = Date.now();
  const bots = await startBots(count, { url, mode: arg('mode', 'fight'), radius: +arg('radius', 60), cls: arg('cls', 'warrior'), stagger: +arg('stagger', 100), log: m => console.error(m) });
  console.error(`${bots.length} bots joined in ${Date.now() - t0} ms; running ${seconds} s`);
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    await sleep(5000);
    let st = null; try { st = await getStatus(url); } catch { /* server may be down */ }
    const r = report(bots);
    console.error(`t+${Math.round((Date.now() - t0) / 1000)}s snaps ${r.snaps} hits ${r.hitsDealt} kills ${r.kills} deaths ${r.deaths}` + (st ? ` | ccu ${st.ccu} tick p99 ${st.tick?.p99} max ${st.tick?.max}` : ''));
  }
  const final = { report: report(bots), status: await getStatus(url).catch(() => null) };
  await Promise.all(bots.map(b => b.stop()));
  console.log(arg('json', false) ? JSON.stringify(final) : JSON.stringify(final, null, 2));
  process.exit(0);
}
