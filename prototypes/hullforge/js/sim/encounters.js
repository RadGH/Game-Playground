// Encounters (Voidwright PLAN §E1 E6 carried over): things happening out in a system besides the enemy posts.
//
//   convoy    traders being raided: kill the raiders (credits + Traders standing + sometimes a part), or press F
//             near them and join the raiders (a cut of the haul, the pirates' favour, the traders' anger)
//   merchant  a trader parked in open space: fly up and press F to buy and sell parts and drones
//   rift      a tear in space: three waves of Hive ships come through, rich rocks drift round it; close it for a cache
//   ion       an ion cloud: shields do not refill inside; the rocks in it are rich
//   comet     a fast rock on a loop that sheds ore as it goes; harpoon it and tow it to the station
//   derelict  a dead station, hollow, with a way in and a sealed cache in its middle (a scan shows the cache)
//   distress  a freighter calling for help: stay beside it a few seconds to patch it up — or it is bait for pirates
//   elite     a wanted pirate captain: tougher, named, a bounty on screen and a rare-or-better part
//   ambush    looks like a plain asteroid cluster; pirates come out of the rocks when you get close (a scan shows them)
//
// Sites are rolled when you arrive (1-3, from the system's seed and your visit), and a new one turns up near you
// every few minutes of flying. Bodies are made when you come within SPAWN_AT of a site. Everything that should
// reach the screen goes through ctx.say({ t: 'toast'|'banner'|'sound', … }). Pure: no DOM.

import { rng, hash, vadd, vsub, vscale, vnorm, vdist, vrand, qaxis, clamp } from '../core/math.js';
import { createBody, toWorld, refresh } from './body.js';
import { generateShip, generateRock, generateDerelict, generateCache } from './shipgen.js';
import { addBody, DT, SAFE_RADIUS } from './world.js';
import { rollLootItem } from './items.js';
import { addRep, repLevel, FACTIONS } from './factions.js';
import { pilot } from './npc.js';
import { makeDrone, DRONE_IDS } from './drones.js';
import { fmt } from '../../../../shared/format.js';

export const ENCOUNTERS = {
  convoy: { name: 'Convoy under attack', color: '#ffd05a', what: 'Traders are being raided. Help them, or join the raiders.' },
  merchant: { name: 'Wandering merchant', color: '#7affd8', what: 'A trader selling parts and drones. Fly close and press F.' },
  rift: { name: 'Space rift', color: '#d06aff', what: 'Hive ships come through in waves. Close it for what it leaves.' },
  ion: { name: 'Ion cloud', color: '#8ab8ff', what: 'Shields do not refill inside. The rocks in it are rich.' },
  comet: { name: 'Comet', color: '#bff4ff', what: 'Sheds ore as it flies. Harpoon it and tow it home.' },
  derelict: { name: 'Derelict station', color: '#c48cff', what: 'A dead station with a sealed cache in its middle.' },
  distress: { name: 'Distress call', color: '#ff9db8', what: 'A freighter calling for help.' },
  elite: { name: 'Wanted captain', color: '#ff7a3a', what: 'A pirate captain with a price on their head.' },
  ambush: { name: 'Asteroid cluster', color: '#b8a890', what: 'Asteroids to mine.' },
};
export const ANOMALIES = ['rift', 'ion', 'comet', 'derelict'];
export const SPAWN_AT = 2600;          // m: an encounter's ships appear when you come this close
export const TIMED_GAP = [150, 260];   // s of flying between new encounters near you
export const MAX_LIVE = 4;
/** Pay multiplier by danger (same curve as jobs). */
export const PAY = d => 1 + (d - 1) * 0.75;
const round10 = v => Math.round(v / 10) * 10;
const CAPTAIN_FIRST = ['Varro', 'Ilse', 'Doran', 'Mira', 'Taskel', 'Quen', 'Brannoch', 'Sefa', 'Orrin', 'Halde', 'Yusk', 'Corwen', 'Nadja', 'Petrak'];
const CAPTAIN_LAST = ['Tusk', 'Blackwater', 'Sorrow', 'Halloway', 'Grint', 'Mournhew', 'Saltjaw', 'Kettle', 'Vorne', 'Ashgrove', 'Rookhart', 'Dunmere'];

/** Which kinds can turn up at a danger level, with weights. */
function weights(d, timed) {
  const w = { convoy: 3, merchant: 2, ion: 1.5, comet: 1.2, derelict: 1.4, distress: 2, ambush: 1.4, rift: d >= 2 ? 1.5 : 0, elite: d >= 2 ? 1.6 : 0 };
  if (timed) { w.ion = 0; w.comet = 0; w.derelict = 0; w.rift = 0; }
  return w;
}
const pickKind = (r, W) => r.weighted(Object.entries(W).filter(([, v]) => v > 0).map(([k, weight]) => ({ k, weight }))).k;

/** The sites in a system on this visit: 1-3, at least 1.8 km from the station. */
export function rollEncounters(sys, seed) {
  const r = rng(hash(seed, 'enc')); const n = 1 + Math.floor(r() * 2.6); const out = [];
  for (let i = 0; i < n; i++) {
    const kind = pickKind(r, weights(sys.danger, false));
    if (out.some(e => e.kind === kind) && r() < 0.7) continue;
    const a = r() * Math.PI * 2, dist = 1800 + r() * 3200;
    out.push({ id: `e${i}`, kind, pos: { x: Math.round(Math.cos(a) * dist), y: Math.round(r.range(-300, 300)), z: Math.round(Math.sin(a) * dist) }, seed: hash(seed, 'e', i), state: 'idle' });
  }
  return out;
}
/** A new encounter near the player (1.6-2.4 km off, away from the station). */
export function timedEncounter(w, r) {
  const P = w.player; const d = w.sys.danger;
  const kind = pickKind(r, weights(d, true));
  for (let k = 0; k < 8; k++) {
    const dir = vnorm(vrand(r)); dir.y *= 0.3;
    const pos = vadd(P.pos, vscale(vnorm(dir), 1600 + r() * 800));
    if (w.station && vdist(pos, w.station.pos) < SAFE_RADIUS + 1200) continue;
    return { id: `t${Math.floor(w.t)}`, kind, pos, seed: Math.floor(r() * 1e9), state: 'idle', timed: true };
  }
  return null;
}

// ------------------------------------------------------------------ making the bodies
function ship(w, e, seed, { faction, danger, small = false, team, name }) {
  const { grid } = generateShip(seed, { danger, faction: faction === 'traders' ? 'traders' : faction, small });
  const b = createBody(grid, { kind: 'ship', team, faction, danger, name, pos: vadd(e.pos, vscale(vrand(rng(seed)), 40 + (seed % 60))) });
  b.quat = qaxis({ x: 0, y: 1, z: 0 }, (seed % 628) / 100);
  b.enc = e.id;
  return addBody(w, b);
}
function toughen(b, k) {
  for (const bl of b.grid.cells.values()) { bl.maxHp *= k; bl.hp = bl.maxHp; }
  refresh(b); b.baseHp = b.stats.maxHp; b.shield = b.stats.shield;
}
function rockAt(w, pos, seed, radius, danger) {
  const r = rng(seed);
  const b = createBody(generateRock(seed, { radius, danger }), { kind: 'rock', pos, quat: qaxis(vnorm(vrand(r)), r() * 6) });
  b.angVel = vscale(vrand(r), 0.02 + r() * 0.04);
  return addBody(w, b);
}
const pirateName = r => `${r.pick(['Rustfang', 'Grinder', 'Gutter', 'Scrapjaw', 'Hookline', 'Blackwake', 'Cutpurse', 'Ironteeth'])} ${100 + r.int(0, 899)}`;

/** Make an encounter's bodies (when you come near). */
export function spawnEncounter(w, e, G) {
  const r = rng(e.seed); const d = w.sys.danger; e.spawned = true; e.ships = []; e.rocks = [];
  const hated = f => repLevel(G, f).hostileShips;
  switch (e.kind) {
    case 'convoy': {
      for (let i = 0; i < 2; i++) {
        const t = ship(w, e, hash(e.seed, 't', i), { faction: 'traders', danger: Math.max(1, d - 1), small: d <= 2, team: 'neutral', name: `Hauler ${r.pick(['Marrow', 'Tallow', 'Brisk', 'Kettle', 'Plover', 'Saffron'])} ${i + 1}` });
        t.think = pilot; t.ai = { route: [w.station ? vadd(w.station.pos, { x: 0, y: 80, z: 0 }) : e.pos], speed: 0.22, stopAt: SAFE_RADIUS * 0.6 };
        t.angry = hated('traders'); e.ships.push(t);
      }
      const n = 2 + Math.floor(d / 2);
      for (let i = 0; i < n; i++) {
        const p = ship(w, e, hash(e.seed, 'r', i), { faction: 'pirate', danger: d, small: d <= 1 && i > 0, team: 'hostile', name: pirateName(r) });
        p.pos = vadd(e.pos, vscale(vrand(r), 180 + i * 40));
        p.think = pilot; p.ai = { sight: 1100, prefer: e.ships[i % 2], post: e.pos, leash: 2600 }; p.raider = true;
        e.ships.push(p);
      }
      e.state = 'fight';
      break;
    }
    case 'merchant': {
      const m = ship(w, e, e.seed, { faction: 'traders', danger: Math.max(2, d), team: 'neutral', name: `${r.pick(['Odd Sela', 'Old Brannick', 'Quill Marrow', 'Teska Vane', 'Jory Halt'])}, wandering merchant` });
      m.pos = { ...e.pos }; m.think = pilot; m.ai = { hold: true }; m.merchant = e.id; m.angry = hated('traders');
      e.ships.push(m); e.body = m; e.leaveAt = w.t + 480;
      break;
    }
    case 'rift':
      for (let i = 0; i < 6; i++) e.rocks.push(rockAt(w, vadd(e.pos, vscale(vrand(r), 120 + r() * 160)), hash(e.seed, 'rk', i), 3 + r.int(0, 3), Math.min(6, d + 2)));
      e.wave = 0; e.state = 'idle';
      break;
    case 'ion':
      e.radius = 420;
      for (let i = 0; i < 7; i++) e.rocks.push(rockAt(w, vadd(e.pos, vscale(vrand(r), 60 + r() * 280)), hash(e.seed, 'rk', i), 3 + r.int(0, 4), Math.min(6, d + 1)));
      break;
    case 'comet': {
      const c = rockAt(w, vadd(e.pos, { x: 500, y: 0, z: 0 }), hash(e.seed, 'comet'), 3, Math.min(6, d + 2));
      c.name = 'Comet'; c.comet = e.id; e.body = c; e.ang = 0; e.dropT = 0;
      e.ore = Object.keys(oreCounts(c))[0] || 'iron';
      break;
    }
    case 'derelict': {
      const g = generateDerelict(e.seed);
      const b = createBody(g, { kind: 'rock', pos: e.pos, name: 'Derelict station' }); b.derelict = e.id; addBody(w, b);
      const c = createBody(generateCache(), { kind: 'rock', name: 'Sealed cache' }); c.cache = e.id; c.hidden = true;
      c.pos = toWorld(b, { x: 0.5, y: 0.5, z: 0.5 }); addBody(w, c);
      e.body = b; e.cache = c;
      break;
    }
    case 'distress': {
      const { grid } = generateShip(e.seed, { danger: Math.max(1, d - 1), faction: 'traders', small: d <= 2 });
      const b = createBody(grid, { kind: 'wreck', team: 'neutral', faction: 'traders', pos: e.pos, name: 'Freighter (distress call)' });
      b.keep = true; b.angVel = { x: 0.02, y: 0.05, z: 0 }; addBody(w, b);
      e.body = b; e.trap = r() < (d <= 1 ? 0.3 : 0.45); e.help = 0;
      break;
    }
    case 'elite': {
      const name = `${r.pick(CAPTAIN_FIRST)} ${r.pick(CAPTAIN_LAST)}`;
      const b = ship(w, e, e.seed, { faction: 'pirate', danger: Math.min(6, d + 1), team: 'hostile', name: `Captain ${name} (wanted)` });
      toughen(b, 1.6); b.post = { ...e.pos }; b.mode = 'patrol'; b.elite = e.id;
      e.bounty = round10(600 * PAY(d)); e.captain = name; e.ships.push(b); e.body = b;
      if (d >= 3) for (let i = 0; i < 2; i++) { const s = ship(w, e, hash(e.seed, 'x', i), { faction: 'pirate', danger: d, small: true, team: 'hostile', name: pirateName(r) }); s.post = { ...e.pos }; s.mode = 'patrol'; e.ships.push(s); }
      break;
    }
    case 'ambush':
      for (let i = 0; i < 5; i++) e.rocks.push(rockAt(w, vadd(e.pos, vscale(vrand(r), 60 + r() * 150)), hash(e.seed, 'rk', i), 3 + r.int(0, 4), d));
      break;
  }
  return e;
}
function oreCounts(b) { const c = {}; for (const bl of b.grid.cells.values()) { const o = bl.t.startsWith('ore_') ? bl.t : null; if (o) c[o] = (c[o] || 0) + 1; } return Object.fromEntries(Object.entries(c).sort((a, b2) => b2[1] - a[1]).map(([t, n]) => [ORE_OF[t], n])); }
const ORE_OF = { ore_iron: 'iron', ore_copper: 'copper', ore_cobalt: 'cobalt', ore_iridium: 'iridium', ore_solar: 'sunstone' };

// ------------------------------------------------------------------ rewards
function drop(w, pos, items, cr) {
  for (const it of items) w.pickups.push({ kind: 'item', item: it, pos: vadd(pos, vscale(vrand(w.rand), 3)), vel: vscale(vrand(w.rand), 4), life: 240 });
  if (cr) w.pickups.push({ kind: 'credits', qty: cr, pos: { ...pos }, vel: vscale(vrand(w.rand), 3), life: 240 });
}
function repText(changes) { return changes.map(c => `${FACTIONS[c.faction].short} ${c.d > 0 ? '+' : ''}${fmt(c.d, { decimals: 1 })}`).join(' · '); }
function done(e, G, ctx, title, text) {
  e.state = 'done'; G.stats.encounters = (G.stats.encounters || 0) + 1;
  ctx.say({ t: 'banner', title, text }); ctx.say({ t: 'sound', id: 'rare' });
}

// ------------------------------------------------------------------ each tick
/**
 * Encounters for one sim tick (call every step). ctx = { G, say(msg) }. Spawns sites you come near, runs their
 * rules, pays rewards, and now and then puts a new one near you.
 */
export function encounterStep(w, ctx) {
  const P = w.player; const G = ctx.G; if (!P || P.dead || !w.enc) return;
  const d = w.sys.danger;
  // a new encounter near you every few minutes of flying
  if (w.encNext == null) w.encNext = w.t + TIMED_GAP[0] + w.rand() * (TIMED_GAP[1] - TIMED_GAP[0]);
  if (w.t > w.encNext) {
    w.encNext = w.t + TIMED_GAP[0] + w.rand() * (TIMED_GAP[1] - TIMED_GAP[0]);
    if (w.enc.filter(e => e.state !== 'done').length < MAX_LIVE && w.t - w.combatT > 10) {
      const e = timedEncounter(w, rng(Math.floor(w.rand() * 1e9)));
      if (e) { w.enc.push(e); ctx.say({ t: 'toast', text: `New on your scanner: ${ENCOUNTERS[e.kind].name}`, kind: '' }); }
    }
  }
  for (const e of w.enc) {
    if (e.state === 'done') continue;
    const dist = vdist(P.pos, e.pos);
    if (!e.spawned) { if (dist < SPAWN_AT) spawnEncounter(w, e, G); else continue; }
    const live = (e.ships || []).filter(s => !s.dead);
    switch (e.kind) {
      case 'convoy': {
        const traders = live.filter(s => s.faction === 'traders'), raiders = live.filter(s => s.raider);
        // raiders go after a trader that is still alive
        for (const s of raiders) if (!s.ai.prefer || s.ai.prefer.dead) s.ai.prefer = traders[0] || null;
        if (e.state === 'fight' && !raiders.length && traders.length) {
          const cr = round10(260 * PAY(d)); G.credits += cr; G.stats.earned += cr;
          const ch = addRep(G, 'traders', 5); const part = w.rand() < 0.4 ? rollLootItem(hash(e.seed, 'thanks'), d, 0.3) : null;
          if (part) drop(w, traders[0].pos, [part], 0);
          for (const t of traders) { t.ai = { route: [w.station.pos], speed: 0.3, stopAt: SAFE_RADIUS * 0.7 }; }
          done(e, G, ctx, 'Convoy saved', `+${fmt(cr, { decimals: 0 })} cr · ${repText(ch)}${part ? ' · they left you a part' : ''}`);
        } else if (!traders.length) {
          if (e.joined) {
            const cut = round10(320 * PAY(d) * (repLevel(G, 'pirate').min >= 40 ? 1.5 : 1)); G.credits += cut; G.stats.earned += cut;
            const ch = addRep(G, 'pirate', 6);
            for (const s of raiders) { s.ai = { leave: true }; }
            done(e, G, ctx, 'Convoy robbed', `Your cut: +${fmt(cut, { decimals: 0 })} cr · ${repText(ch)}`);
          } else { e.state = 'done'; ctx.say({ t: 'toast', text: 'The convoy was destroyed before you got there.', kind: 'bad' }); }
        }
        break;
      }
      case 'merchant':
        if (w.t > e.leaveAt && dist > 1500 && e.body && !e.body.dead) { e.body.ai = { leave: true }; e.state = 'done'; }
        if (e.body?.dead) e.state = 'done';
        break;
      case 'rift': {
        if (e.state === 'idle' && dist < 800) { e.state = 'waves'; e.wave = 0; e.next = w.t + 1; ctx.say({ t: 'toast', text: 'Something is coming through the rift.', kind: 'bad' }); ctx.say({ t: 'sound', id: 'warn' }); }
        if (e.state === 'waves') {
          if (!live.length && w.t > e.next) {
            if (e.wave >= 3) {
              const cache = createBody(generateCache(), { kind: 'rock', name: 'Sealed cache', pos: e.pos }); cache.cache = e.id; addBody(w, cache); e.cache = cache;
              ctx.say({ t: 'banner', title: 'The rift closed', text: 'It left something behind: fly into the glowing cache.' }); ctx.say({ t: 'sound', id: 'rare' });
              e.state = 'cache';
            } else {
              e.wave++; const n = [0, 2, 3, 3][e.wave];
              for (let i = 0; i < n; i++) {
                const s = ship(w, e, hash(e.seed, 'w', e.wave, i), { faction: 'swarm', danger: Math.max(2, d), small: d <= 2 && i > 0, team: 'hostile', name: `Rift ${['Weaver', 'Husk', 'Stinger', 'Brood'][i % 4]}` });
                s.pos = vadd(e.pos, vscale(vrand(w.rand), 25)); s.think = pilot; s.ai = { sight: 1500, post: e.pos, leash: 2000 }; e.ships.push(s);
              }
              e.next = w.t + 4;
              ctx.say({ t: 'toast', text: `Hive wave ${e.wave} of 3`, kind: 'bad' });
            }
          } else if (live.length) e.next = w.t + 4;
        }
        break;
      }
      case 'ion': {
        const inside = dist < e.radius;
        if (inside) {
          if (e.lastShield != null && P.shield > e.lastShield) P.shield = e.lastShield;   // no refill inside
          e.lastShield = P.shield; P.ionized = true;
          if (!e.inside) { e.inside = true; if (w.t - (e.toldAt ?? -99) > 30) { e.toldAt = w.t; ctx.say({ t: 'toast', text: 'Ion cloud: your shields will not refill in here.', kind: 'bad' }); } }
        } else { if (e.inside) P.ionized = false; e.inside = false; e.lastShield = null; }
        break;
      }
      case 'comet': {
        const c = e.body; if (!c || c.dead) { e.state = 'done'; break; }
        if (!c.harpooned && !c.tractor) {
          e.ang += DT * 35 / 500;
          const want = vadd(e.pos, { x: Math.cos(e.ang) * 500, y: Math.sin(e.ang * 0.5) * 60, z: Math.sin(e.ang) * 500 });
          c.vel = vscale(vsub(want, c.pos), 1 / DT * 0.2);
          c.vel = vscale(vnorm(c.vel), Math.min(45, Math.hypot(c.vel.x, c.vel.y, c.vel.z)));
        }
        if ((e.dropT -= DT) <= 0) { e.dropT = 3; w.pickups.push({ kind: 'ore', ore: e.ore, qty: 1 + (w.rand() < 0.4 ? 1 : 0), pos: { ...c.pos }, vel: vscale(vrand(w.rand), 2), life: 60 }); }
        break;
      }
      case 'derelict':
        if (e.cache && !e.cache.dead && vdist(P.pos, e.cache.pos) < P.radius + 6) openCache(w, e, ctx, d);
        if (e.cache?.dead) e.state = 'done';
        break;
      case 'distress': {
        if (!e.body || e.body.dead) { e.state = 'done'; break; }
        if (e.trap && !e.sprung && dist < 600) {
          e.sprung = true; const n = 2 + Math.floor(d / 2); const away = vnorm(vsub(e.pos, P.pos));
          for (let i = 0; i < n; i++) { const s = ship(w, e, hash(e.seed, 'trap', i), { faction: 'pirate', danger: d, small: d <= 1 && i > 0, team: 'hostile', name: pirateName(rng(e.seed + i)) }); s.pos = vadd(e.pos, vadd(vscale(away, 520), vscale(vrand(w.rand), 80))); s.post = { ...e.pos }; s.mode = 'attack'; e.ships.push(s); }
          ctx.say({ t: 'banner', title: 'It was a trap', text: 'Pirates are coming out from behind the freighter.' }); ctx.say({ t: 'sound', id: 'warn' });
        }
        if (e.sprung && !live.length) { e.state = 'done'; e.body.keep = true; e.body.name = 'Bait hulk'; ctx.say({ t: 'toast', text: 'The pirates are beaten. The bait hulk is salvage now: harpoon it and tow it to the station.', kind: 'good' }); }
        if (!e.trap && dist < e.body.radius + P.radius + 120) {
          e.help += DT;
          if (e.help >= 6) {
            const cr = round10(220 * PAY(d)); G.credits += cr; G.stats.earned += cr; const ch = addRep(G, 'traders', 4);
            e.body.keep = false; e.body.born = w.t - 34;
            done(e, G, ctx, 'Freighter patched up', `+${fmt(cr, { decimals: 0 })} cr · ${repText(ch)}`);
          }
        }
        break;
      }
      case 'elite':
        if (e.body?.dead) {
          const kill = e.body.killedBy === 'player';
          if (kill) {
            G.credits += e.bounty; G.stats.earned += e.bounty; const ch = addRep(G, 'navy', 4);
            let it = rollLootItem(hash(e.seed, 'prize'), Math.min(6, d + 1), 0.6); it.rarity = Math.max(2, it.rarity);
            drop(w, e.body.pos, [it], 0);
            done(e, G, ctx, `Bounty paid: ${e.captain}`, `+${fmt(e.bounty, { decimals: 0 })} cr · ${repText(ch)} · they dropped a rare part`);
          } else e.state = 'done';
        }
        break;
      case 'ambush':
        if (!e.sprung && dist < 450) {
          e.sprung = true; const n = 2 + Math.floor(d / 2); const away = vnorm(vsub(e.pos, P.pos));
          for (let i = 0; i < n; i++) { const s = ship(w, e, hash(e.seed, 'amb', i), { faction: 'pirate', danger: d, small: d <= 1 && i > 0, team: 'hostile', name: pirateName(rng(e.seed + i)) }); s.pos = vadd(e.pos, vadd(vscale(away, 240), vscale(vrand(w.rand), 60))); s.post = { ...e.pos }; s.mode = 'attack'; e.ships.push(s); }
          ctx.say({ t: 'banner', title: 'Ambush', text: e.revealed ? 'The pirates you scanned are coming out of the rocks.' : 'Pirates were hiding in the rocks!' }); ctx.say({ t: 'sound', id: 'warn' });
        }
        if (e.sprung && !live.length) { e.state = 'done'; G.stats.encounters++; }
        break;
    }
    if (e.cache && !e.cache.dead && e.kind === 'rift' && vdist(P.pos, e.cache.pos) < P.radius + 6) { openCache(w, e, ctx, d); e.state = 'done'; }
  }
}

/** Fly into a cache: parts, credits and sometimes a drone. */
export function openCache(w, e, ctx, d) {
  const c = e.cache; if (!c || c.dead) return;
  c.dead = true; const G = ctx.G;
  const n = 2 + (w.rand() < 0.5 ? 1 : 0); const items = [];
  for (let i = 0; i < n; i++) items.push(rollLootItem(hash(e.seed, 'cache', i), d, 0.35));
  const cr = round10(250 * PAY(d));
  drop(w, c.pos, items, cr);
  let drone = null;
  if (w.rand() < 0.3) { drone = makeDrone(DRONE_IDS[Math.floor(w.rand() * 3)], clamp(Math.round(1 + (d - 1) * 0.5), 1, 3), w.rand() < 0.3 ? 2 : 1); G.drones.push(drone); }
  w.events.push({ type: 'cacheOpen', pos: { ...c.pos } });
  G.stats.encounters = (G.stats.encounters || 0) + 1;
  ctx.say({ t: 'banner', title: 'Cache opened', text: `${n} parts and ${fmt(cr, { decimals: 0 })} cr${drone ? ' · and a drone, sent to your hangar' : ''}` });
}

/** Join the raiders at a convoy (F near it, after a confirm). */
export function joinRaid(w, e, G) {
  if (e.kind !== 'convoy' || e.state !== 'fight' || e.joined) return null;
  e.joined = true;
  for (const s of e.ships) { if (s.raider) s.truce = true; else if (s.faction === 'traders') s.angry = true; }
  return addRep(G, 'traders', -10);
}

/** Every live encounter site, for markers: [{ e, pos, label, color, body? }]. Hidden ambushes look like rocks. */
export function encounterMarks(w) {
  const out = [];
  for (const e of w.enc || []) {
    if (e.state === 'done' && !(e.kind === 'rift' && e.cache && !e.cache.dead)) continue;
    const E = ENCOUNTERS[e.kind];
    let label = E.name, color = E.color, pos = e.body && !e.body.dead ? e.body.pos : e.pos;
    if (e.kind === 'ambush' && e.revealed) { label = 'Ambush: pirates in the rocks'; color = '#ff5a4a'; }
    if (e.kind === 'elite' && e.bounty) label = `Wanted: ${e.captain} · bounty ${fmt(e.bounty, { decimals: 0 })} cr`;
    if (e.kind === 'rift' && e.state === 'cache') label = 'Rift cache';
    if (e.kind === 'convoy' && e.joined) label = 'Convoy (you joined the raiders)';
    out.push({ e, pos, label, color });
  }
  return out;
}
