#!/usr/bin/env node
// Thousandvale — TOWN GUARDS AND OX CARTS on stream B's baked towns (stream E, owner feedback 8).
//
//   W1  "the starting town is being raided … where are the town guards?"  -> guard POSTS at every gate and in every
//       square (data/provinces/guards.json `posts`), and the gates a raid must come in by (`gates`).
//   W5  "ox carts at towns, and sometimes travelling the road, that act as PAID fast travel to other towns"
//       -> a carter and a parked ox cart outside the main gate of every settlement on the road network
//          (data/provinces/carts.json `stops`), the road links between them and the full fare table.
//
//   node tools/content-towns.mjs            write the generated keys of guards.json and carts.json (the hand-written
//                                           `rules` / `ranks` / `hold` / `roaming` blocks are kept as they are)
//   node tools/content-towns.mjs --check    change nothing; exit 1 when a file would change
//   then: node tools/content-hunts.mjs      (it copies posts, carters and carts into <zone>.quest.json, the file the
//                                           server spawns from and B's bake never reads — NO re-placement, NO re-bake)
//
// WHERE A BODY STANDS. Only on a nav sample a walker can stand on (WALK, not SOLID / BUILDING / DEEP / SHALLOW /
// STEEP). A gate guard stands just INSIDE its gate, to one side of the roadway, facing out. A square guard stands on
// the rim of the square facing the middle. A cart stands OUTSIDE the main gate, CART.out metres down the gate road and
// CART.side metres off its edge (never on the road: carts travelling the road must get past), its pole toward the
// road; the carter stands between the cart and the road. Same inputs -> same output (no random numbers; names are a
// hash of the town).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseNav, NAV } from '../js/rules/terrain-read.js';

const ROOT = new URL('../', import.meta.url);
const P = f => new URL(f, ROOT);
const readJ = f => JSON.parse(readFileSync(P(f), 'utf8'));
const CHECK = process.argv.includes('--check');
const ZM = 2048, PROV = 'torbor_downs';

/** Guards per settlement kind: at each gate (up to `gates` gates), and in the square (the first is the sergeant where `sergeant`). */
export const GUARDS = Object.freeze({
  city: { perGate: 2, gates: 4, square: 4, sergeant: true },
  town: { perGate: 2, gates: 3, square: 3, sergeant: true },
  village: { perGate: 1, gates: 2, square: 1, sergeant: false },
  hamlet: { perGate: 1, gates: 1, square: 0, sergeant: false },
  inside: 3.4,            // metres inside the gate line
  beside: 1.1,            // metres clear of the gate's open width
  wide: 4.6,              // never further than this from the middle of the gateway
  rim: 2.2,               // metres outside the square's own radius
});
export const OVERLAND = 1.3;       // a back-lane link costs this times the straight line
export const CART = Object.freeze({ out: [12, 60], side: [3.2, 9], carter: 2.6, clear: 2.2 });

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const slug = s => String(s).toLowerCase().replace(/'/g, '_').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const r1 = v => Math.round(v * 10) / 10;
const yawTo = (ax, az, bx, bz) => +Math.atan2(bx - ax, bz - az).toFixed(3);
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
const zoneOffset = wid => { const [, zx, zy] = /^z(\d+)_(\d+)$/.exec(wid).map(Number); return { ox: zx * ZM, oz: zy * ZM }; };

function zoneFacts(wid) {
  const nav = parseNav(readFileSync(P(`data/zones/${wid}/nav.bin`)));
  const { size: S, step, bits } = nav;
  const at = (x, z) => bits[Math.min(S - 1, Math.max(0, Math.round(z / step))) * S + Math.min(S - 1, Math.max(0, Math.round(x / step)))];
  const stand = (x, z, { road = true } = {}) => { const b = at(x, z); return (b & NAV.WALK) !== 0 && !(b & (NAV.SOLID | NAV.BUILDING | NAV.DEEP | NAV.SHALLOW | NAV.STEEP)) && (road || !(b & NAV.ROAD)); };
  /** Every sample within `r` of the point can be stood on (a cart needs room). */
  const room = (x, z, r, opt) => { const n = Math.ceil(r / step); for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) if (!stand(x + i * step, z + j * step, opt)) return false; return true; };   // the whole square of samples round it (x, z are on the grid)
  /** The standable sample nearest (x, z) within `max` metres (on the nav grid, so what is written is what was tested). */
  const snap = (x, z, max = 4, opt, ok = null) => {
    let best = null;
    for (let dz = -max; dz <= max; dz += step) for (let dx = -max; dx <= max; dx += step) {
      const px = Math.round((x + dx) / step) * step, pz = Math.round((z + dz) / step) * step, d = Math.hypot(px - x, pz - z);
      if (d > max || !stand(px, pz, opt) || (ok && !ok(px, pz))) continue;
      if (!best || d < best.d) best = { x: px, z: pz, d };
    }
    return best;
  };
  const placements = readJ(`data/zones/${wid}/placements.json`).placements;
  return { wid, nav, step, at, stand, room, snap, placements };
}

/** Every settlement of the province with its bake facts: { wid, id, name, kind, x, z, r, gates[], square } (zone metres). */
export function settlements() {
  const map = readJ('data/world/province-map.json').provinces[PROV].map;
  const out = [];
  for (const [eid, wid] of Object.entries(map)) {
    if (!existsSync(P(`data/zones/${wid}/placements.json`))) continue;
    const F = zoneFacts(wid);
    const names = Object.fromEntries((readJ(`data/vignettes/placements/${wid}.json`).settlements || []).map(s => [s.bakeId, s.name]));
    const walls = Object.fromEntries(F.placements.filter(p => p.kind === 'town_wall').map(p => [p.data.town, p.data]));
    const squares = Object.fromEntries(F.placements.filter(p => p.kind === 'town_square').map(p => [p.data.town, { x: p.x, z: p.z, r: p.data.r || 4 }]));
    for (const s of F.placements.filter(p => p.kind === 'settlement')) {
      const w = walls[s.id];
      out.push({ wid, eid, F, id: s.id, name: names[s.id] || s.data.name, kind: s.data.kind, x: s.x, z: s.z, r: s.data.radius, hub: !!s.data.hub,
        wall: w ? { tier: w.tier, radius: w.radius } : null, gates: (w && w.gates) || [], square: squares[s.id] || { x: s.x, z: s.z, r: 4 } });
    }
  }
  return out;
}

/** The main gate: the one whose way is a real road and leads on to other roads; else the first. */
const mainGate = s => s.gates.slice().sort((a, b) => ((b.led || []).length - (a.led || []).length) || ((b.wayKind === 'road') - (a.wayKind === 'road')) || a.id.localeCompare(b.id))[0] || null;

export function guardPosts(S, names) {
  const posts = [], gates = [], problems = [];
  for (const s of S) {
    const G = GUARDS[s.kind] || GUARDS.hamlet, F = s.F, taken = [];
    // stream W (round 8, W6): a gate's `main` is the centreline of the high street from that gate to the square — a guard
    // stands BESIDE it, never in it (present after W's re-bake; before it there is nothing to keep clear of)
    const mains = s.gates.filter(g => g.main && Array.isArray(g.main.pts)).map(g => g.main);
    const offStreet = (x, z) => mains.every(m => { for (let i = 1; i < m.pts.length; i++) if (segDist(x, z, m.pts[i - 1], m.pts[i]) < (m.width || 5) / 2 + 0.6) return false; return true; });
    const free = (x, z) => offStreet(x, z) && !taken.some(p => Math.hypot(p.x - x, p.z - z) < 1.8);
    const family = i => names.family[(hash(s.id + ':guard:' + i) >>> 5) % names.family.length];
    const add = (rec, at) => { taken.push(at); posts.push({ id: `guard_${s.id}_${posts.filter(p => p.town === s.name).length}`, town: s.name, settlement: s.id, zone: s.wid, tier: GUARDS[s.kind] ? s.kind : 'hamlet', ...rec, x: at.x, z: at.z }); };
    const ordered = [mainGate(s), ...s.gates.filter(g => g !== mainGate(s))].filter(Boolean).slice(0, G.gates);
    for (const g of s.gates) gates.push({ id: g.id, town: s.name, zone: s.wid, x: r1(g.x), z: r1(g.z), out: [+g.out[0].toFixed(3), +g.out[1].toFixed(3)], width: g.open || g.width || 4.5, kind: g.kind, main: g === mainGate(s) });
    for (const g of ordered) {
      const [ox, oz] = g.out, px = -oz, pz = ox, half = Math.min(GUARDS.wide, (g.open || g.width || 4.5) / 2 + GUARDS.beside);   // a hamlet's 20 m gap: the guards flank the ROADWAY, not the gap
      for (let k = 0; k < G.perGate; k++) {
        const side = k % 2 ? -1 : 1;
        const want = { x: g.x - ox * GUARDS.inside + px * half * side, z: g.z - oz * GUARDS.inside + pz * half * side };
        // inside the wall: on the town's side of the gate line
        const at = F.snap(want.x, want.z, 5, { road: true }, (x, z) => (x - g.x) * ox + (z - g.z) * oz < -1.2 && free(x, z));   // (snap radius 5: room to step off W's main street)
        if (!at) { problems.push(`${s.id}: no standing room inside ${g.id} (side ${side})`); continue; }
        add({ post: 'gate', gate: g.id, rank: 'guard', name: `${s.name} Guard`, yaw: +Math.atan2(ox, oz).toFixed(3), titled: false }, at);
      }
    }
    for (let k = 0; k < G.square; k++) {
      const a = (k / Math.max(1, G.square)) * Math.PI * 2 + (hash(s.id) % 628) / 100, rr = s.square.r + GUARDS.rim;
      const want = { x: s.square.x + Math.sin(a) * rr, z: s.square.z + Math.cos(a) * rr };
      const at = F.snap(want.x, want.z, 6, { road: true }, free);
      if (!at) { problems.push(`${s.id}: no standing room in the square (${k})`); continue; }
      const serg = G.sergeant && k === 0;
      add({ post: 'square', rank: serg ? 'sergeant' : 'guard', name: serg ? `Sergeant ${family(k)}` : `${s.name} Guard`, yaw: yawTo(at.x, at.z, s.square.x, s.square.z), titled: false }, at);
    }
  }
  return { posts, gates, problems };
}

export function cartStops(S, names, routes) {
  const stops = [], problems = [];
  for (const s of S) {
    const F = s.F, g = mainGate(s), o = zoneOffset(s.wid);
    let cart = null;
    // the gate road's samples, from the gate outward
    const line = (() => {
      if (!g) return [];
      const ap = (g.approaches || []).filter(a => !a.inside).flatMap(a => a.pts);
      const pts = ap.filter(p => (p[0] - g.x) * g.out[0] + (p[1] - g.z) * g.out[1] > 0);
      const seen = new Set();
      return pts.filter(p => { const k = p[0].toFixed(1) + ',' + p[1].toFixed(1); if (seen.has(k)) return false; seen.add(k); return true; })
        .map(p => ({ x: p[0], z: p[1], d: Math.hypot(p[0] - g.x, p[1] - g.z) })).sort((a, b) => a.d - b.d);
    })();
    const tryAt = (cx, cz, dx, dz) => {              // (cx, cz) on the road, (dx, dz) along it
      const L = Math.hypot(dx, dz) || 1, px = -dz / L, pz = dx / L;
      for (let off = CART.side[0]; off <= CART.side[1] && !cart; off += 0.6) for (const side of [1, -1]) {
        const x = Math.round((cx + px * off * side) / F.step) * F.step, z = Math.round((cz + pz * off * side) / F.step) * F.step;
        if (!F.room(x, z, CART.clear, { road: false })) continue;
        // the carter: between the cart and the road, on a standable sample
        const c = F.snap(x - px * side * CART.carter, z - pz * side * CART.carter, 2.5, { road: false }, (ax, az) => Math.hypot(ax - x, az - z) >= 2);
        if (!c) continue;
        cart = { x, z, yaw: +Math.atan2(dx, dz).toFixed(3), carter: { x: c.x, z: c.z, yaw: yawTo(c.x, c.z, cx, cz) }, fromGate: Math.round(Math.hypot(x - (g ? g.x : s.x), z - (g ? g.z : s.z))) };
        break;
      }
    };
    for (let i = 1; i < line.length && !cart; i++) { const p = line[i]; if (p.d < CART.out[0] || p.d > CART.out[1]) continue; tryAt(p.x, p.z, p.x - line[i - 1].x, p.z - line[i - 1].z); }
    // no gate road sample fits (a gate that opens onto a bridge or a cliff road): straight out from the gate, then round the ring
    if (!cart && g) for (let d = CART.out[0]; d <= 60 && !cart; d += 2) tryAt(g.x + g.out[0] * d, g.z + g.out[1] * d, g.out[0], g.out[1]);
    if (!cart) for (let a = 0; a < 48 && !cart; a++) { const an = a / 48 * 6.283, R = (s.wall ? s.wall.radius : s.r) + 12; tryAt(s.x + Math.sin(an) * R, s.z + Math.cos(an) * R, Math.cos(an), -Math.sin(an)); }
    if (!cart) { problems.push(`${s.id}: nowhere to park a cart`); continue; }
    const h = hash('carter:' + s.id), sex = h & 1 ? 'f' : 'm';
    const name = names.given[sex][(h >>> 1) % names.given[sex].length] + ' ' + names.family[(h >>> 9) % names.family.length];
    const id = 'cart_' + slug(s.name);
    stops.push({ id, town: s.name, kind: s.kind, zone: s.wid, sheet: s.eid, x: Math.round(s.x + o.ox), z: Math.round(s.z + o.oz), gate: g ? g.id : null, fromGate: cart.fromGate,
      carter: { id: 'carter_' + slug(s.name), name, x: cart.carter.x, z: cart.carter.z, yaw: cart.carter.yaw },
      cart: { id, model: 'ox_cart', x: cart.x, z: cart.z, yaw: cart.yaw } });
  }
  return { stops, problems };
}

/** Road links between stops (the routes file: one per pair of settlements joined by road) and every shortest path. */
export function cartTable(stops, routes, fareOf) {
  const byTown = Object.fromEntries(stops.map(s => [s.town, s]));
  const links = [];
  for (const r of routes.routes) {
    const a = byTown[r.from.name], b = byTown[r.to.name];
    if (!a || !b) continue;
    const ex = links.find(l => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id));
    if (ex) { if (r.length < ex.metres) { ex.metres = r.length; ex.route = r.id; } continue; }
    links.push({ a: a.id, b: b.id, metres: r.length, route: r.id });
  }
  // THE ROUTES FILE IS NOT ONE NETWORK: it only lists roads up to ~5 km with no third settlement on the way, so it
  // falls into islands (and four southern towns have no listed road at all). A carter knows the back lanes: join the
  // islands with `overland` links — the nearest pair of stops in two different islands, at OVERLAND x the straight
  // line — until every stop can reach every other. Roaming carts only ever walk the real routes.
  const comp = () => { const c = {}; let n = 0; for (const s of stops) { if (c[s.id] !== undefined) continue; const q = [s.id]; c[s.id] = n; while (q.length) { const u = q.pop(); for (const l of links) { const v = l.a === u ? l.b : l.b === u ? l.a : null; if (v && c[v] === undefined) { c[v] = n; q.push(v); } } } n++; } return { c, n }; };
  for (let guard = 0; guard < stops.length; guard++) {
    const { c, n } = comp(); if (n <= 1) break;
    // the smallest island joins its nearest neighbour first
    const size = {}; for (const k of Object.values(c)) size[k] = (size[k] || 0) + 1;
    const small = +Object.keys(size).sort((a, b) => size[a] - size[b] || a - b)[0];
    let best = null;
    for (const a of stops) if (c[a.id] === small) for (const b of stops) if (c[b.id] !== small) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (!best || d < best.d) best = { a, b, d }; }
    links.push({ a: best.a.id, b: best.b.id, metres: Math.round(best.d * OVERLAND), overland: true });
  }
  const adj = {};
  for (const l of links) { (adj[l.a] ||= []).push([l.b, l.metres]); (adj[l.b] ||= []).push([l.a, l.metres]); }
  const fares = {};
  for (const s of stops) {
    const dist = { [s.id]: 0 }, hops = { [s.id]: 0 }, via = {}, done = new Set();
    for (;;) {
      let u = null;
      for (const k of Object.keys(dist)) if (!done.has(k) && (u === null || dist[k] < dist[u])) u = k;
      if (u === null) break;
      done.add(u);
      for (const [v, m] of adj[u] || []) if (dist[v] === undefined || dist[u] + m < dist[v]) { dist[v] = dist[u] + m; hops[v] = hops[u] + 1; via[v] = u; }
    }
    fares[s.id] = Object.keys(dist).filter(k => k !== s.id).map(k => {
      let first = k; while (via[first] && via[first] !== s.id) first = via[first];
      return { to: k, town: stops.find(x => x.id === k).town, metres: dist[k], hops: hops[k], next: first, gold: fareOf(dist[k]) };
    }).sort((a, b) => a.metres - b.metres || a.to.localeCompare(b.to));
  }
  return { links, fares };
}

/** The fare rule, from data/provinces/economy.json `cart` (the server computes the same: js/sim/economy-knobs.js). */
export const cartFare = (econ, metres) => { const c = (econ && econ.cart) || {}; return Math.max(c.minGold ?? 1, Math.round((c.base ?? 3) + metres / (c.metresPerGold ?? 250))); };

/** W1: who is a newcomer, and how far from an event one must be before it may start. */
export const NEWCOMER = Object.freeze({ underLevel: 3, firstMinutes: 10, townPad: 160, zoneNear: 400, zoneLevel: 4, zoneClear: 220 });

/**
 * W1 — events.json: `director.newcomer`, and on every event that can hurt a town or stands near one
 * `startOn.clearOfNewcomersM` (the event may not start, nor count down, while a newcomer is that close to its centre).
 * A town raid also gets `raid.gates` (where its waves come in) and `raid.guards` (how many stand there).
 * Returns the new file object (the caller writes it).
 */
export function safeEvents(ev, S, guards) {
  const out = JSON.parse(JSON.stringify(ev));
  out.director.newcomer = { underLevel: NEWCOMER.underLevel, firstMinutes: NEWCOMER.firstMinutes,
    _doc: 'W1 (owner feedback 8): a NEWCOMER is a character under `underLevel` OR one with less than `firstMinutes` of played time. An event with `startOn.clearOfNewcomersM` may not start, nor run its countdown, while a newcomer stands within that many metres of its centre (the settlement for a town event, the arena for a zone event); a countdown already running is called off. tools/content-towns.mjs writes the distances.' };
  out.director.raid = { rules: 'data/provinces/guards.json raid', firstTarget: 'guard', neverFirstTarget: 'newcomer', enterBy: 'gate',
    _doc: 'W1: a town raid comes in through the gates listed on the event (`raid.gates`), fights the town guards first, and never opens on a newcomer. The numbers and the guards\' lines are in data/provinces/guards.json.' };
  out.director.chest = { opensOn: 'won', lockedBy: 'nothing', lootSec: 120, forEveryone: 'who took part',
    _doc: 'W24 (owner feedback 8, report #45): a chest an event leaves (`reward.chest`) is open from the moment the event is won — no kill order, no leftover monster and no missing add can keep it shut — and it stays until everyone who took part has looted it or `lootSec` seconds have passed. The result line ("Won") is only shown once the chest can be opened. Road-event chests follow the same rule: data/provinces/road-events.json `rules.chest`.' };
  const world = s => { const o = zoneOffset(s.wid); return { x: s.x + o.ox, z: s.z + o.oz }; };
  for (const e of out.realm) {
    const s = e.site && e.site.settlement ? S.find(x => x.name === e.site.settlement) : null;
    if (!s) continue;
    e.startOn = { ...(e.startOn || {}), clearOfNewcomersM: Math.round((s.wall ? s.wall.radius : s.r) + NEWCOMER.townPad) };
    e.raid = { gates: guards.gates.filter(g => g.town === s.name).map(g => ({ id: g.id, x: g.x, z: g.z, out: g.out, main: g.main })), guards: guards.posts.filter(p => p.town === s.name).length, zone: s.wid };
  }
  for (const e of out.zone) {
    const at = e.map && e.map[0]; if (!at) continue;
    let near = Infinity;
    for (const s of S) { const w = world(s); near = Math.min(near, Math.hypot(w.x - at.x, w.z - at.z) - s.r); }
    if (near <= NEWCOMER.zoneNear || (e.level || 1) <= NEWCOMER.zoneLevel) e.startOn = { ...(e.startOn || {}), clearOfNewcomersM: NEWCOMER.zoneClear };
    else if (e.startOn && e.startOn.clearOfNewcomersM) { delete e.startOn.clearOfNewcomersM; if (!Object.keys(e.startOn).length) delete e.startOn; }
  }
  return out;
}

/** What a carter says when you walk up (one per carter, by a hash of the town; `{town}` = its own town). */
export const CARTER_GREETINGS = Object.freeze([
  'Where to? The ox knows every road in the Downs, and takes most of them slowly.',
  'Climb up. Mind the turnips. A few coins and you are in another town before your boots notice.',
  'Longroad Carters. We go everywhere there is a gate, and we are never late, because we never say when.',
  'Walking is free. Riding is nearly free, and you arrive with your legs.',
  'Name a town. If it has a gate, I have been stuck outside it.',
  'The ox is called Thunder. It is a joke. Where are we going?',
  'I do not go fast, I do not go far in the dark, and I do not stop for wolves. Fares are on the board.',
  'Out of {town} by cart is the only way to leave with dignity. Pick a town.',
]);

/** W5: every carter is an NPC of its zone's quest file (`placedBy`: the placer and the offices tool leave it alone). */
function carterNpcs(stops) {
  const out = {};
  for (const s of stops) {
    const g = CARTER_GREETINGS[hash('greet:' + s.id) % CARTER_GREETINGS.length].replace('{town}', s.town);
    (out[s.sheet] ||= {})[s.carter.id] = { name: s.carter.name, role: 'carter', at: s.town, greeting: g, cart: s.id, placedBy: 'content-towns' };
  }
  return out;
}

function build() {
  const names = readJ('data/names/torbor.json'), routes = readJ(`data/provinces/${PROV}-routes.json`), econ = readJ('data/provinces/economy.json');
  const S = settlements();
  const g = guardPosts(S, names), c = cartStops(S, names, routes);
  const t = cartTable(c.stops, routes, m => cartFare(econ, m));
  return { S, g, c, t };
}

/** Write `gen` over the generated keys of a file, keeping every hand-written key. */
function put(file, gen) {
  const cur = existsSync(P(file)) ? readJ(file) : {};
  const next = { ...cur, ...gen };
  const a = JSON.stringify(next, null, 1) + '\n', b = existsSync(P(file)) ? readFileSync(P(file), 'utf8') : '';
  if (a === b) return false;
  if (!CHECK) writeFileSync(P(file), a);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { S, g, c, t } = build();
  const changed = [
    put('data/provinces/guards.json', { made: 'tools/content-towns.mjs — posts, gates and problems are generated; edit rules / ranks / hold by hand', gates: g.gates, posts: g.posts, problems: g.problems }),
    put('data/provinces/carts.json', { made: 'tools/content-towns.mjs — stops, links, fares and problems are generated; edit rules / roaming by hand', stops: c.stops, links: t.links, fares: t.fares, problems: c.problems }),
  ];
  // W5: the carters join their zone's quest file (stream A gives a quest NPC a body, a greeting and its quests)
  for (const [sheet, npcs] of Object.entries(carterNpcs(c.stops))) {
    const f = `data/quests/${sheet}.json`, src = readFileSync(P(f), 'utf8'), j = JSON.parse(src);
    for (const k of Object.keys(j.npcs || {})) if (j.npcs[k].placedBy === 'content-towns' && !npcs[k]) delete j.npcs[k];
    for (const [id, n] of Object.entries(npcs)) j.npcs[id] = { ...n, ...(j.npcs[id] && 'titled' in j.npcs[id] ? { titled: j.npcs[id].titled } : {}) };
    const ind = /^\{\n( +)"/.exec(src), next = JSON.stringify(j, null, ind ? ind[1].length : 1) + '\n';
    if (next !== src) { changed.push(true); if (!CHECK) writeFileSync(P(f), next); }
  }
  // W1: the events that may not start beside a newcomer, and the gates a raid comes in by
  {
    const cur = readFileSync(P('data/quests/events.json'), 'utf8'), ev = JSON.parse(cur);
    const next = JSON.stringify(safeEvents(ev, S, g), null, 2) + '\n';
    if (next !== cur) { changed.push(true); if (!CHECK) writeFileSync(P('data/quests/events.json'), next); }
    const n = safeEvents(ev, S, g);
    console.log(`events kept clear of newcomers: ${n.realm.filter(e => e.startOn && e.startOn.clearOfNewcomersM).length} realm, ${n.zone.filter(e => e.startOn && e.startOn.clearOfNewcomersM).length} of ${n.zone.length} zone`);
  }
  const byKind = {};
  for (const p of g.posts) { const s = S.find(x => x.name === p.town); (byKind[s.kind] ||= { towns: new Set(), n: 0 }).towns.add(p.town); byKind[s.kind].n++; }
  console.log(`settlements ${S.length}; guard posts ${g.posts.length} (${Object.entries(byKind).map(([k, v]) => `${k} ${v.n} in ${v.towns.size}`).join(', ')}); gates ${g.gates.length}`);
  console.log(`cart stops ${c.stops.length}; links ${t.links.length}; longest ride ${Math.max(...Object.values(t.fares).flat().map(f => f.metres))} m = ${Math.max(...Object.values(t.fares).flat().map(f => f.gold))} gold`);
  for (const p of [...g.problems, ...c.problems]) console.log('PROBLEM ' + p);
  if (CHECK && changed.some(Boolean)) { console.error('content-towns: files are stale — run node tools/content-towns.mjs'); process.exit(1); }
}
