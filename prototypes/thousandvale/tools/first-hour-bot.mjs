#!/usr/bin/env node
// Thousandvale FIRST-HOUR BOT v1 (stream G, PLAN §15 M1.5 "first-hour bot v1", roast §1.3).
//
// Two real WebSocket bots (tools/bot-client.mjs, script mode) play the opening of the game the way a new
// player does, compressed into a few minutes:
//   1. create a character and arrive in Torborhold (the town room)
//   2. form a party (one makes a party code, the other joins with it)
//   3. walk out of town into the wilds (a handoff to the province room)
//   4. fight: head for the zone's dungeon door and kill what attacks or stands near the road
//   5. loot: personal loot from the kills lands in the bag
//   6. enter the dungeon together (`use` the door portal) and fight inside — both in the SAME instance
// Every step has a deadline; the report says which step failed and why, and the numbers a designer wants
// (time to each step, kills, loot, level, vignettes / distinct monster types met = "templates met").
//
//   node prototypes/thousandvale/tools/first-hour-bot.mjs --url ws://127.0.0.1:8491 [--json]
//   import { firstHour } from './first-hour-bot.mjs';  const r = await firstHour({ url });  r.ok, r.steps, r.failed
import { readFileSync } from 'node:fs';
import { startBot } from './bot-client.mjs';
import { parseTerrain } from '../js/rules/terrain-read.js';
import { unrleTiles } from '../js/sim/dungeon.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = new URL('../', import.meta.url);

/** The starter zone's dungeon door, in world metres (from stream B's bake). */
export function starterDoor(zone = 'z12_02') {
  const t = parseTerrain(readFileSync(new URL(`data/zones/${zone}/terrain.bin`, ROOT)));
  const d = t.meta.sites.find(s => s.type === 'dungeon');
  const ox = +zone.slice(1, 3) * 2048, oz = +zone.slice(4, 6) * 2048;
  const hub = t.meta.sites.find(s => s.hub);
  return { x: ox + d.x, z: oz + d.z, yaw: d.yaw, town: hub ? { x: ox + hub.x, z: oz + hub.z, r: hub.radius } : null };
}

/**
 * A walking route inside a dungeon instance (joined.room.dungeon): breadth-first over the floor tiles from
 * `from` to the tile nearest `to`, as world points. Null when `from` is on no floor.
 */
export function dungeonRoute(dungeon, from, to) {
  const cell = dungeon.cell || 2;
  const fl = dungeon.floors.find(f => from.x >= f.origin.x && from.z >= f.origin.z && from.x < f.origin.x + f.w * cell && from.z < f.origin.z + f.h * cell);
  if (!fl) return null;
  fl._t ||= Array.isArray(fl.tiles) ? unrleTiles(fl.tiles, fl.w * fl.h) : fl.tiles;
  const T = fl._t, W = fl.w, H = fl.h;
  const tile = p => [Math.max(0, Math.min(W - 1, Math.floor((p.x - fl.origin.x) / cell))), Math.max(0, Math.min(H - 1, Math.floor((p.z - fl.origin.z) / cell)))];
  const [si, sj] = tile(from), [ti, tj] = tile(to);
  const prev = new Int32Array(W * H).fill(-1), start = sj * W + si;
  prev[start] = start;
  const q = [start];
  let best = start, bestD = Infinity;
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % W, j = (k / W) | 0, d = Math.abs(i - ti) + Math.abs(j - tj);
    if (d < bestD) { bestD = d; best = k; if (!d) break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = nj * W + ni; if (!T[n] || prev[n] >= 0) continue;
      prev[n] = k; q.push(n);
    }
  }
  const path = [];
  for (let k = best; k !== start; k = prev[k]) path.push({ x: fl.origin.x + (k % W + 0.5) * cell, z: fl.origin.z + (((k / W) | 0) + 0.5) * cell });
  return path.reverse();
}

export async function firstHour({ url, log = () => {}, stepMs = {}, fightSeconds = 90, dungeonSeconds = 45, tag = '', trace = false } = {}) {
  const T0 = Date.now();
  const steps = [], seen = { monsterTypes: new Set(), vignettes: new Set(), objects: new Set() };
  let failed = null;
  const bots = [];
  const step = async (name, ms, fn) => {
    if (failed) return;
    const t = Date.now();
    try {
      const r = await Promise.race([fn(), sleep(stepMs[name] ?? ms).then(() => { throw new Error('timed out after ' + (stepMs[name] ?? ms) + ' ms'); })]);
      steps.push({ name, ok: true, ms: Date.now() - t, at: Date.now() - T0, ...(r && typeof r === 'object' ? r : {}) });
      log(`ok   ${name} (${Date.now() - t} ms)`);
    } catch (err) {
      failed = { step: name, why: err.message || String(err) };
      steps.push({ name, ok: false, ms: Date.now() - t, why: failed.why });
      log(`FAIL ${name}: ${failed.why}`);
    }
  };
  const until = async (pred, every = 100) => { while (!pred()) await sleep(every); };
  const watch = b => setInterval(() => {
    for (const e of b.ents.values()) {
      if ((e.kind === 'monster' || e.kindId === 2) && e.type) seen.monsterTypes.add(e.type);
      if (e.kind === 'object' && e.type) { seen.objects.add(e.type); if (e.type === 'vignette') seen.vignettes.add(e.key || e.name || e.id); }
    }
  }, 500);
  const door = starterDoor();
  const near = (b, p, r) => b.pos && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) <= r;
  const portalNear = b => { let best = null, bd = 60; for (const e of b.ents.values()) if (e.kind === 'object' && e.type === 'portal' && e.x != null) { const d = Math.hypot(e.x - b.pos.x, e.z - b.pos.z); if (d < bd) { bd = d; best = e; } } return best; };
  // play it like a new player: leave elites, bosses and anything 4+ levels up alone (they still get fought if they
  // start it), and get your health back between pulls instead of walking into the next fight at a third
  const myLevel = b => b.net.joined?.you.level ?? b.you?.level ?? 1;
  const tooHard = (b, e) => (e.rank && e.rank !== 'normal') || (e.level || 1) > myLevel(b) + 3;
  const hpShare = b => (b.vitals && b.vitals.hpMax ? b.vitals.hp / b.vitals.hpMax : 1);
  const visible = (b, max) => [...b.ents.values()].filter(e => !e.dead && e.x != null && (e.kind === 'monster' || e.kindId === 2) && !tooHard(b, e))
    .map(e => ({ e, d: Math.hypot(e.x - b.pos.x, e.z - b.pos.z) })).filter(o => o.d < max).sort((p, q) => p.d - q.d);
  const fighting = () => A.target != null || B.target != null;
  /** Stand still (still fighting back) until both are at `to` of their health, or `ms` passes. Counts the time rested. */
  const rest = async (deadline, to = 0.85, ms = 25000) => {
    if (Math.min(hpShare(A), hpShare(B)) >= 0.55) return 0;
    const t = Date.now();
    for (const b of [A, B]) b.goal = null;
    while (Date.now() - t < ms && Date.now() < deadline && !(hpShare(A) >= to && hpShare(B) >= to)) await sleep(250);
    restedMs += Date.now() - t;
    return Date.now() - t;
  };
  let restedMs = 0;
  const timers = [];
  let A, B;
  try {
    await step('arrive in town', 20000, async () => {
      // names are letters only: a run tag in letters keeps reruns on a kept database from clashing
      const sfx = tag || [...String(Date.now() % 1e6)].map(d => 'abcdefghij'[+d]).join('');
      A = await startBot({ url, mode: 'script', name: `Hour A${sfx}`.slice(0, 16), cls: 'warrior', seed: 11 });
      B = await startBot({ url, mode: 'script', name: `Hour B${sfx}`.slice(0, 16), cls: 'cleric', seed: 12 });
      bots.push(A, B); timers.push(watch(A), watch(B));
      // trace: every 2 s, where each bot is, its health and what it is fighting (diagnosing a red run)
      if (trace) timers.push(setInterval(() => {
        for (const b of [A, B]) {
          const t = b.target != null ? b.ents.get(b.target) : null;
          const near3 = [...b.ents.values()].filter(e => !e.dead && e.x != null && (e.kind === 'monster' || e.kindId === 2)).map(e => ({ e, d: Math.hypot(e.x - b.pos.x, e.z - b.pos.z) })).sort((p, q) => p.d - q.d).slice(0, 3);
          log(`  [${b.name.slice(5, 6)}] ${b.roomKind} (${Math.round(b.pos?.x)},${Math.round(b.pos?.z)}) hp ${b.vitals ? b.vitals.hp + '/' + b.vitals.hpMax : '?'} lv ${b.net.joined?.you.level} tgt ${t ? `${t.type || t.name} L${t.level} ${t.rank || ''}` : '-'} near ${near3.map(o => `${o.e.type || o.e.name}L${o.e.level}${o.e.rank ? '/' + o.e.rank : ''}@${Math.round(o.d)}`).join(' ')} k${b.stats.kills} d${b.stats.deaths} hit${b.stats.hitsDealt}/${b.stats.hitsTaken}`);
        }
      }, 2000));
      if (A.roomKind !== 'town' || B.roomKind !== 'town') throw new Error(`new characters start in ${A.roomKind}/${B.roomKind}, not the town`);
      return { room: A.room?.name || A.room?.id };
    });
    await step('form a party', 15000, async () => {
      A.net.partyOp('code');
      await until(() => A.party && A.party.code);
      B.net.partyOp('join', { code: A.party.code });
      await until(() => A.party?.members?.length === 2 && B.party?.members?.length === 2);
      return { party: A.party.id, members: A.party.members.map(m => m.name) };
    });
    await step('walk out of town', 60000, async () => {
      // straight for the door: it lies outside the town circle
      for (const b of [A, B]) b.goal = { x: door.x, z: door.z };
      await until(() => A.roomKind !== 'town' && B.roomKind !== 'town');
      return { room: A.room?.id };
    });
    await step('fight and loot on the way to the dungeon', fightSeconds * 1000 + 150000, async () => {
      // like a pair of new players: use the skill bar, heal each other, and kill one thing at a time (B assists A)
      for (const b of [A, B]) { b.fightRadius = 28; b.avoid = e => tooHard(b, e); b.skills = true; }
      A.healTarget = () => B.myId; B.healTarget = () => A.myId;
      B.focus = () => A.target;
      const kills = () => A.stats.kills + B.stats.kills;
      const t0 = Date.now();
      // head for the door, fighting what comes; as soon as something worth fighting is in sight, hunt it — then hunt in
      // widening circles round the door until both have loot. The clock is FIGHTING time: time spent resting to full
      // between pulls is not counted against it (a level-1 pair that never rests just dies and walks back from town).
      const fightLeft = () => fightSeconds * 1000 + restedMs - (Date.now() - t0);
      await until(() => (near(A, door, 12) && near(B, door, 12)) || visible(A, 260).length > 0 || fightLeft() <= 0, 200);
      let ring = 0;
      while ((kills() < 3 || A.loot.length + B.loot.length < 1) && fightLeft() > 0) {
        await rest(t0 + fightSeconds * 1000 + 90000);
        ring++;
        // a live monster in sight (E's camps sit ~140 m apart, further than the 28 m reach): go to it; else widen the ring
        const seen = visible(A, 260)[0];
        const a = ring * 1.3, r = 25 + ring * 12;
        const g = seen ? { x: seen.e.x, z: seen.e.z } : { x: door.x + Math.cos(a) * r, z: door.z + Math.sin(a) * r };
        A.goal = g; B.goal = { x: g.x + 2, z: g.z + 2 };
        const tw = Date.now();
        await until(() => near(A, g, 4) || fighting() || Date.now() - tw > 15000, 200);
        while (fighting() && fightLeft() > 0) await sleep(250);
      }
      if (kills() < 3) throw new Error(`only ${kills()} kills in ${fightSeconds} s of fighting (+${Math.round(restedMs / 1000)} s rested; hits dealt ${A.stats.hitsDealt + B.stats.hitsDealt}, deaths ${A.stats.deaths + B.stats.deaths})`);
      if (A.loot.length + B.loot.length < 1) throw new Error(`${kills()} kills but no loot`);
      return { kills: kills(), loot: A.loot.length + B.loot.length, items: [...A.loot, ...B.loot].reduce((n, l) => n + l.items.length, 0), deaths: A.stats.deaths + B.stats.deaths, restedSeconds: Math.round(restedMs / 1000) };
    });
    await step('enter the dungeon together', 90000, async () => {
      await rest(Date.now() + 25000);
      for (const b of [A, B]) { b.fightRadius = 10; b.goal = { x: door.x, z: door.z }; }
      for (const b of [A, B]) {
        await until(() => portalNear(b) && near(b, portalNear(b), 3.2), 150);
        const p = portalNear(b);
        b.goal = null;
        const before = b.rooms.length;
        let tries = 0;
        while (b.rooms.length === before && tries++ < 20) { b.net.use(p.id); await sleep(500); }
        if (b.roomKind !== 'instance') throw new Error(`${b.name} used the door (${JSON.stringify(b.used)}) but is in ${b.roomKind}`);
      }
      if (A.room.id !== B.room.id) throw new Error(`party split across instances ${A.room.id} / ${B.room.id}`);
      return { instance: A.room.id, dungeon: A.room.dungeon?.name || null };
    });
    await step('fight inside the dungeon', dungeonSeconds * 1000 + 30000, async () => {
      const k0 = A.stats.kills + B.stats.kills, h0 = A.stats.hitsDealt + B.stats.hitsDealt;
      const dg = A.room.dungeon;
      // a chase walks the floor route, not a straight line through the wall at a monster in the next room
      for (const b of [A, B]) { b.fightRadius = 40; b.avoid = null; b.route = dg ? (from, to) => { const r = dungeonRoute(dg, from, to); return r && r.length ? r[Math.min(2, r.length - 1)] : null; } : null; }
      const t0 = Date.now();
      // walk the floor tiles (walls are real) toward any monster in sight, else toward the next fight room
      const fightRooms = (dg?.floors?.[0]?.rooms || []).filter(r => r.kind === 'fight' || r.kind === 'miniboss').map(r => ({ x: dg.floors[0].origin.x + (r.i + r.w / 2) * (dg.cell || 2), z: dg.floors[0].origin.z + (r.j + r.h / 2) * (dg.cell || 2) }));
      let roomGoal = 0;
      while (Date.now() - t0 < dungeonSeconds * 1000) {
        const mon = [...A.ents.values()].filter(e => (e.kind === 'monster' || e.kindId === 2) && !e.dead && e.x != null).sort((a, b) => Math.hypot(a.x - A.pos.x, a.z - A.pos.z) - Math.hypot(b.x - A.pos.x, b.z - A.pos.z))[0];
        let target = mon || fightRooms[roomGoal];
        if (!mon && target && near(A, target, 4)) roomGoal = Math.min(fightRooms.length - 1, roomGoal + 1);
        if (target && dg) for (const b of [A, B]) {
          const route = dungeonRoute(dg, b.pos, target);
          b.goal = route && route.length ? route[Math.min(2, route.length - 1)] : { x: target.x, z: target.z };
        }
        if (A.stats.kills + B.stats.kills - k0 >= 2) break;
        await sleep(300);
      }
      const hits = A.stats.hitsDealt + B.stats.hitsDealt - h0;
      if (!hits) throw new Error('no fighting inside the dungeon');
      return { kills: A.stats.kills + B.stats.kills - k0, hits };
    });
  } finally {
    for (const t of timers) clearInterval(t);
  }
  const report = {
    ok: !failed, failed, seconds: Math.round((Date.now() - T0) / 1000), steps,
    bots: bots.map(b => ({ name: b.name, cls: b.you?.cls, level: b.net.joined?.you.level ?? b.you?.level, xp: b.net.joined?.you.xp, gold: b.net.joined?.you.gold, bag: b.net.joined?.you.bag?.length, kills: b.stats.kills, deaths: b.stats.deaths, loot: b.loot.length, rooms: b.rooms.map(r => r.kind).join(' > ') })),
    templatesMet: { monsterTypes: [...seen.monsterTypes], vignettes: seen.vignettes.size, objectTypes: [...seen.objects] },
  };
  await Promise.all(bots.map(b => b.stop()));
  return report;
}

const isMain = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (isMain) {
  const i = process.argv.indexOf('--url');
  const url = i > 0 ? process.argv[i + 1] : 'ws://127.0.0.1:8491';
  const r = await firstHour({ url, log: m => console.error(m) });
  console.log(process.argv.includes('--json') ? JSON.stringify(r) : JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
