#!/usr/bin/env node
// Stream D — a real Thousandvale server (stream A's server/main.mjs startServer, memory DB, stage 1) for the M3
// client spec and screenshots, plus a TEST-ONLY hook on a second loopback port so a spec can skip the grind:
// claimed accounts need level 5 for whispers to strangers, mail and guild founding (protocol §16), and founding
// costs 10 gold. Never used by the real server; lives in tests/ (not published).
//
//   node tests/D/m3-server.mjs --port 8494 --hook 8495 [--event-first 60000]
//   POST http://127.0.0.1:<hook>/level {name, level}    set a character's level everywhere it is read
//   POST http://127.0.0.1:<hook>/give  {name, gold, items, itemName?, slot?, rarity?}  grant gold and N plain test items (a bag message follows)
//   POST http://127.0.0.1:<hook>/event {id, announceMs}  force a realm event (the admin page's button)
//   POST http://127.0.0.1:<hook>/roll  {name, n, level, boost, bases?}  grant n REAL items rolled by Farhold's generator (inventory spec; bases = only these item bases)
//   POST http://127.0.0.1:<hook>/grant {name, items:[{…}]}   grant these exact item objects (potions, fish, materials…)
//   GET  http://127.0.0.1:<hook>/who                    online characters [{char, name, level}]
//   POST http://127.0.0.1:<hook>/kill {name}              the character dies where it stands (death/respawn spec)
//   POST http://127.0.0.1:<hook>/teleport {name, x, z}  move a character within its room (the freeze spec starts walks
//                                                        near a zone border instead of a 1.5 km stroll from town)
// Prints "READY <port> <hook>" on stdout when both listen.
import http from 'node:http';
import { join } from 'node:path';
import { startServer } from '../../server/main.mjs';
import { GAME } from '../../server/load.mjs';
import { prepareRules, rulesEngine } from '../../js/rules/index.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const port = +arg('--port', 8494), hookPort = +arg('--hook', port + 1);
const director = {};
if (arg('--event-first')) { director.firstMs = +arg('--event-first'); director.demo = true; }
if (arg('--event-announce')) director.announceMs = +arg('--event-announce');

const s = await startServer({
  port, host: '127.0.0.1', hostGiven: true, adminPort: 0, guestsPerIpHour: null, guestsPerHour: null, unlimitedIp: [], db: 'memory',
  dbFile: join(GAME, '.data/d-m3.json'), build: 'dev', rules: 'auto', terrain: 'test', linger: 3000, maxPerIp: 16, saveEvery: 60000,
  process: 'd-m3', env: 'dev', publicDir: null, journalMs: 2000, provinces: null, procs: 0, director,
});
const W = s.world;
const byName = name => { for (const o of W.online.values()) if (o.char && o.char.name.toLowerCase() === String(name).toLowerCase()) return o; return null; };
let itemN = 0;
const hook = http.createServer(async (req, res) => {
  const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  try {
    if (req.method === 'GET' && req.url === '/who') return send(200, [...W.online.values()].map(o => ({ char: o.char.id, name: o.char.name, level: o.char.level })));
    let body = ''; for await (const c of req) body += c;
    const b = body ? JSON.parse(body) : {};
    if (req.url === '/event') return send(200, { ok: W.gateway.admin.forceEvent(b.id || null, b.announceMs ?? 5000) });
    const o = byName(b.name);
    if (!o) return send(404, { ok: false, why: 'not online' });
    if (req.url === '/level') {
      const lv = Math.max(1, Math.min(50, b.level | 0));
      // stream A's dev hook does the whole level-up (the rules' sheet too, so talent tiers open); fall back to the old way
      // a REAL level-up when we can (XP through the room: the rules' sheet levels too, so talent tiers and perk points open)
      if (o.room?.award && lv > (o.char.level || 1)) {
        await prepareRules();
        const { xpForLevel } = await import('../../js/rules/farhold.js');
        o.room.award(o.entity, { xp: Math.max(1, xpForLevel(lv) - (o.char.xp || 0) + 1), reason: 'test' });
        if ((o.char.level || 1) >= lv) return send(200, { ok: true, level: o.char.level });
      }
      if (typeof W.devSetLevel === 'function') { W.devSetLevel(o.char.id, lv); return send(200, { ok: true, level: lv }); }
      o.entity.setLevel(lv); o.char.level = lv;
      const pr = W.gateway.presence.get(o.char.id); if (pr) pr.level = lv;
      if (o.conn) o.conn.sendJSON({ t: 'you', level: lv });          // what a real level-up tells the client
      return send(200, { ok: true, level: lv });
    }
    if (req.url === '/roll') {
      await prepareRules();
      const rpg = rulesEngine().rpg, items = [];
      const want = Math.max(1, Math.min(40, b.n | 0));
      for (let i = 0; i < want * 8 && items.length < want; i++) { const it = rpg.rollDrop({ level: Math.max(1, b.level | 0 || 5) + (i % 4) * 2, rarityBoost: b.boost ?? 2, chance: 1, ...(Array.isArray(b.bases) ? { bases: b.bases } : {}) }); if (it) items.push(it); }
      W.grant(o, { items, gold: 0, reason: 'test' });
      return send(200, { ok: true, items: items.length });
    }
    if (req.url === '/teleport') {
      const e = o.entity; e.moveTo(+b.x, +b.z, undefined, true);
      const c = o.room.clients.get(e.id); if (c) c.selfDirty = true;
      return send(200, { ok: true, x: e.x, z: e.z, room: o.room.kind });
    }
    if (req.url === '/mounts') { o.char.mounts = (b.mounts || []).slice(0, 12); if (o.conn) o.conn.sendJSON({ t: 'you', mounts: W.mountBook ? W.mountBook.owned(o.char) : o.char.mounts.map(id => ({ id, name: id })) }); return send(200, { ok: true, mounts: o.char.mounts }); }   // round 11 (#16): nobody is given a horse — a spec hands one over
    if (req.url === '/kill') { const e = o.entity; e.setHp(0); e.kill(null); return send(200, { ok: true, dead: !!e.dead }); }   // P8 spec
    if (req.url === '/grant') { W.grant(o, { items: (b.items || []).slice(0, 40), gold: 0, reason: 'test' }); return send(200, { ok: true }); }   // 2026-10-14: exact item objects (the icon spec)
    if (req.url === '/give') {
      const items = Array.from({ length: Math.max(0, Math.min(12, b.items | 0)) }, (_, i) => ({ name: b.itemName || ['Hollin Shortsword', 'Weathered Cloak', 'Copper Ring', 'Ashwood Staff'][(itemN + i) % 4], rarity: b.rarity || ['common', 'magic', 'rare'][(itemN++ + i) % 3], ...(b.kind ? { kind: b.kind, id: b.id || 'healing_potion', use: { type: 'heal', hp: 0.3 } } : { slot: b.slot || 'weapon', ...(b.slot && b.slot !== 'weapon' ? { type: 'armor' } : {}) }), value: 4, level: b.slot ? 1 : 3 }));
      W.grant(o, { items, gold: Math.max(0, b.gold | 0), reason: 'test' });
      return send(200, { ok: true, items: items.length });
    }
    if (req.url === '/roadevent') {      // wrap-up (#59): start a road event of a kind (and, when asked, of one record) beside this player; `open` frees a caged captive
      if (b.open != null) { const ev = hook.events && hook.events.get(b.open); if (!ev) return send(404, { ok: false }); for (const m of ev.guards || []) if (!m.removed) ev.room.remove(m); if (ev.npc.data.held) { ev.npc.data.held.open = true; ev.npc.infoVer++; } ev.npc.loop('idle'); return send(200, { ok: true }); }
      hook.events ||= new Map();
      for (let k = 0; k < 80; k++) {
        const ev = W.roadEvents.spawnFor(o, b.kind || 'rescue');
        if (!ev) continue;
        if (!b.id || (ev.spec && ev.spec.id === b.id)) { hook.events.set(ev.id, ev); if (b.calm) for (const m of ev.guards || []) if (!m.removed) ev.room.remove(m);   /* calm: a picture of the cage, not a fight */ const at = ev.npc || ev.chest; return send(200, { ok: true, ev: ev.id, npc: ev.npc ? ev.npc.id : null, obj: at ? at.id : null, x: at ? at.x : null, z: at ? at.z : null, guards: (ev.guards || []).length, name: ev.name, room: o.room.kind }); }
        for (const e of ev.ents || []) if (!e.removed) ev.room.remove(e);
        for (const m of ev.guards || []) if (!m.removed) ev.room.remove(m);
      }
      return send(200, { ok: false, why: 'no such event came up' });
    }
    send(404, { ok: false });
  } catch (err) { send(500, { ok: false, err: String(err && err.message) }); }
});
hook.listen(hookPort, '127.0.0.1', () => console.log(`READY ${port} ${hookPort}`));
const bye = () => { hook.close(); s.stop().then(() => process.exit(0), () => process.exit(1)); setTimeout(() => process.exit(1), 8000).unref(); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
