// The star map: 14 systems on a flat chart, linked to their nearest neighbours. Danger rises with distance from
// the home system (1 → 6). Each system has a seed that decides its sun, planet, rock fields and enemy posts.

import { rng, hash, clamp, vadd, vscale, vrand, qaxis, vnorm } from '../core/math.js';
import { createBody, refresh } from './body.js';
import { generateShip, generateRock, generateStation } from './shipgen.js';
import { addBody } from './world.js';

const SYL_A = ['Ar', 'Bel', 'Cor', 'Dra', 'Eth', 'Fen', 'Gal', 'Hes', 'Ira', 'Jun', 'Kal', 'Lor', 'Mir', 'Nov', 'Ost', 'Pyr', 'Quel', 'Ros', 'Sar', 'Tor', 'Ulm', 'Vey', 'Wen', 'Xal', 'Yor', 'Zan'];
const SYL_B = ['a', 'en', 'is', 'or', 'u', 'ae', 'io', 'ar', 'el', 'on'];
const SYL_C = ['th', 'x', 'n', 'ra', 'des', 'mir', 'lan', 'vos', 'tis', 'ka', 'ron', 'dell'];
const SUNS = [
  { name: 'Yellow', color: '#ffe7b0', light: '#fff1dc' }, { name: 'Orange', color: '#ffb36b', light: '#ffd8b0' },
  { name: 'Red giant', color: '#ff6a4a', light: '#ffb8a0' }, { name: 'Blue', color: '#9cc8ff', light: '#d8e8ff' },
  { name: 'White', color: '#ffffff', light: '#f4f6ff' }, { name: 'Violet', color: '#c99cff', light: '#e6d8ff' },
];
export const DANGER_NAMES = ['Calm', 'Watchful', 'Risky', 'Dangerous', 'Deadly', 'Lethal'];
/** Ship rating we suggest for each danger level (shown on the star map). */
export const SUGGESTED = [0, 0, 330, 450, 650, 950, 1200];

export function generateGalaxy(seed) {
  const r = rng(seed);
  const systems = [];
  const names = new Set();
  const name = () => { for (;;) { const n = r.pick(SYL_A) + r.pick(SYL_B) + r.pick(SYL_C); if (!names.has(n)) { names.add(n); return n; } } };
  // home at the left, the rest spread out to the right in a loose fan
  systems.push({ id: 0, name: name(), x: 0.08, y: 0.5 });
  let tries = 0;
  while (systems.length < 14 && tries++ < 4000) {
    const x = 0.08 + r() * 0.86, y = 0.1 + r() * 0.8;
    if (systems.some(s => Math.hypot(s.x - x, (s.y - y) * 0.8) < 0.15)) continue;
    systems.push({ id: systems.length, name: name(), x, y });
  }
  const home = systems[0];
  const far = Math.max(...systems.map(s => Math.hypot(s.x - home.x, s.y - home.y)));
  for (const s of systems) {
    const d = Math.hypot(s.x - home.x, s.y - home.y) / far;
    s.danger = s.id === 0 ? 1 : clamp(1 + Math.round(d * 5.2), 1, 6);
    s.seed = hash(seed, s.id);
    const rr = rng(s.seed);
    s.sun = rr.int(0, SUNS.length - 1);
    s.faction = s.danger >= 3 && rr() < 0.45 ? 'swarm' : 'pirate';
    s.rich = rr() < 0.3;   // extra ore fields
    s.planet = { hue: rr(), size: rr.range(0.7, 1.4), ring: rr() < 0.4 };
  }
  // links: each system to its 2-3 nearest; then make sure everything is reachable
  const link = (a, b) => { if (a === b) return; a.links ||= []; b.links ||= []; if (!a.links.includes(b.id)) a.links.push(b.id); if (!b.links.includes(a.id)) b.links.push(a.id); };
  for (const s of systems) {
    const near = systems.filter(o => o !== s).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
    link(s, near[0]); if (r() < 0.75) link(s, near[1]);
  }
  for (let pass = 0; pass < 20; pass++) {
    const seen = new Set([0]); const st = [0];
    while (st.length) { const s = systems[st.pop()]; for (const l of s.links || []) if (!seen.has(l)) { seen.add(l); st.push(l); } }
    if (seen.size === systems.length) break;
    const out = systems.filter(s => !seen.has(s.id)); const ins = systems.filter(s => seen.has(s.id));
    let best = null, bd = Infinity;
    for (const a of out) for (const b of ins) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < bd) { bd = d; best = [a, b]; } }
    link(best[0], best[1]);
  }
  return { seed, systems };
}
export const sunOf = s => SUNS[s.sun] || SUNS[0];

/** Fill a world with one system's contents (station, rock fields, enemy posts, a boss in deadly systems). */
export function populate(w, sys) {
  const r = rng(sys.seed);
  w.sys = sys;
  const station = createBody(generateStation(sys.seed), { kind: 'station', team: 'friendly', name: `${sys.name} Station` });
  addBody(w, station); w.station = station;
  // rock fields
  const nFields = 3 + (sys.rich ? 2 : 0);
  w.fields = [];
  for (let i = 0; i < nFields; i++) {
    const a = r() * Math.PI * 2, dist = 1100 + r() * 2600;
    const c = { x: Math.cos(a) * dist, y: r.range(-250, 250), z: Math.sin(a) * dist };
    w.fields.push(c);
    const n = 5 + r.int(0, 6);
    for (let j = 0; j < n; j++) {
      const g = generateRock(hash(sys.seed, i, j), { radius: r.int(3, 9), danger: sys.danger });
      const rock = createBody(g, { kind: 'rock', pos: vadd(c, vscale(vrand(r), 40 + r() * 220)), quat: qaxis(vnorm(vrand(r)), r() * 6) });
      rock.angVel = vscale(vrand(r), 0.02 + r() * 0.05);
      addBody(w, rock);
    }
  }
  // enemy posts near the fields and out in the dark
  const posts = 2 + Math.round(sys.danger * 0.8);
  w.posts = [];
  for (let i = 0; i < posts; i++) {
    const base = i < w.fields.length ? w.fields[i] : { x: r.range(-4000, 4000), y: r.range(-400, 400), z: r.range(-4000, 4000) };
    const post = vadd(base, vscale(vrand(r), 300));
    if (Math.hypot(post.x, post.z) < 1500) continue;
    w.posts.push(post);
    spawnGroup(w, post, sys, hash(sys.seed, 'g', i));
  }
  if (sys.danger >= 4) {
    const a = r() * Math.PI * 2; const post = { x: Math.cos(a) * 4200, y: 0, z: Math.sin(a) * 4200 };
    spawnShip(w, post, sys, hash(sys.seed, 'boss'), { boss: true });
  }
  return w;
}

export function spawnGroup(w, post, sys, seed) {
  const r = rng(seed);
  const n = clamp(1 + Math.floor(r() * (1 + sys.danger * 0.5)), 1, 4);
  const small = sys.danger <= 2 && r() < 0.5;
  for (let i = 0; i < n; i++) spawnShip(w, vadd(post, vscale(vrand(r), 60 + i * 30)), sys, hash(seed, i), { small: small && i > 0 });
}
export function spawnShip(w, pos, sys, seed, { boss = false, small = false } = {}) {
  const { grid } = generateShip(seed, { danger: sys.danger, faction: sys.faction, boss, small });
  const b = createBody(grid, { kind: 'ship', team: 'hostile', pos, faction: sys.faction, danger: sys.danger, name: shipName(seed, sys.faction, boss) });
  b.post = { ...pos }; b.boss = boss; b.mode = 'patrol';
  b.quat = qaxis({ x: 0, y: 1, z: 0 }, (seed % 628) / 100);
  addBody(w, b);
  return b;
}
const PIRATE = ['Rustfang', 'Grinder', 'Gutter', 'Scrapjaw', 'Hookline', 'Blackwake', 'Cutpurse', 'Ironteeth'];
const HIVE = ['Drone', 'Stinger', 'Weaver', 'Brood', 'Husk', 'Spinner', 'Lurker', 'Mantle'];
function shipName(seed, faction, boss) {
  const r = rng(seed); const list = faction === 'swarm' ? HIVE : PIRATE;
  return boss ? (faction === 'swarm' ? 'Hive Queen ' : 'Warlord ') + r.pick(list) : r.pick(list) + ' ' + (100 + r.int(0, 899));
}
