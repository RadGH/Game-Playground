// Procedural Towns — OFFICE DRESSING: what makes the smithy look like a smithy.
//
// The building kit (buildkit.js) decides a building's SHAPE from its trade (`want`): a forge leans toward a
// long blockhouse, an inn toward a jettied house. That is not enough to find the smith. Thousandvale's second
// play-test: "NPCs all went to the same house… each NPC needs their own office (the smith at a forge); each NPC
// structure a distinct look; active lights where they should attract the player (shops yes, regular NPCs no)."
//
// So a service building gets DRESSING on top of its body: the things you would see from the street that say
// what happens inside — an anvil and an open hearth for the smith, a striped awning and crates for a shop, a
// hanging tankard sign and benches for the inn, a paddock for the stable, a striped pole for the barber, steps,
// banners and a flag for the hall. Every trade has a hanging SIGN with an emblem built from the same unit
// shapes (a medieval sign reads by its picture, not its words).
//
//   import { officeDressing, OFFICE_KINDS, officeKindFor } from './offices.js';
//   const desc = describeBuilding({ plot, culture, seed, want });
//   const d = officeDressing(officeKindFor(want), desc, { lit: true, seed });
//   // d.parts  -> [{ mesh, x, y, z, w, h, d, yaw, rx, rz, colour, tag }]  (the building's own frame: partsFor's)
//   // d.lights -> [{ x, y, z, color }]   lanterns that should really light the street (only when `lit`)
//   // d.fires  -> [{ x, y, z, s }]       flames (the forge hearth, temple candles)
//   // d.spin   -> [{ x, y, z, axis, speed, parts }]  mill sails
//
// Same frame and unit shapes as partsFor(): origin at the plot centre, +z is the street side (the door), every
// part's `y` is its bottom. `rx`/`rz` are tilts applied after `yaw` (Euler order 'YXZ'). Parts tagged 'lamp'
// are lantern glass: a game draws them with a material that glows at night (lit offices only carry them).
// Pure — no Three.js, no DOM — so the 2D kit page, the game and node tests read the same output.

import { makeRng } from './townplan.js';
import { heightOf, hash } from './buildkit.js';

/** Every dressing this file knows, with the sign emblem and whether it is a shop that should draw the eye. */
export const OFFICE_KINDS = Object.freeze({
  forge:          { label: 'Smithy',          emblem: 'anvil',     lit: true },
  shop:           { label: 'General Goods',   emblem: 'sack',      lit: true },
  market:         { label: 'Market',          emblem: 'coin',      lit: true },
  provisioner:    { label: 'Provisioner',     emblem: 'sack',      lit: true },
  inn:            { label: 'Inn',             emblem: 'mug',       lit: true },
  stable:         { label: 'Stables',         emblem: 'horseshoe', lit: true },
  barber:         { label: 'Barber',          emblem: 'scissors',  lit: true },
  armoury:        { label: 'Armourer',        emblem: 'shield',    lit: true },
  bowyer:         { label: 'Bowyer',          emblem: 'bow',       lit: true },
  tailor:         { label: 'Tailor',          emblem: 'spool',     lit: true },
  apothecary:     { label: 'Apothecary',      emblem: 'bottle',    lit: true },
  jeweller:       { label: 'Jeweller',        emblem: 'ring',      lit: true },
  temple:         { label: 'Temple',          emblem: 'sun',       lit: false },
  chapel:         { label: 'Chapel',          emblem: 'sun',       lit: false },
  shrine:         { label: 'Shrine',          emblem: 'sun',       lit: false },
  hall:           { label: 'Town Hall',       emblem: null,        lit: false },
  counting_house: { label: 'Counting House',  emblem: 'scales',    lit: false },
  study:          { label: 'Study',           emblem: 'eye',       lit: false },
  mill:           { label: 'Mill',            emblem: null,        lit: false },
  granary:        { label: 'Granary',         emblem: null,        lit: false },
  warehouse:      { label: 'Warehouse',       emblem: null,        lit: false },
  barracks:       { label: 'Barracks',        emblem: 'shield',    lit: false },
  watchpost:      { label: 'Watch Post',      emblem: null,        lit: false },
});

/** A building `want` / an office name / an NPC role -> the dressing kind (null = an ordinary home: no dressing). */
const ALIASES = {
  smith: 'forge', blacksmith: 'forge', smithy: 'forge', merchant: 'shop', general: 'shop', trader: 'market', innkeeper: 'inn', tavern: 'inn',
  stablehand: 'stable', stables: 'stable', healer: 'temple', priest: 'temple', church: 'chapel', elder: 'hall', unbinder: 'study', broker: 'counting_house',
  bank: 'counting_house', armourer: 'armoury', armorer: 'armoury', armory: 'armoury', fletcher: 'bowyer', clothier: 'tailor', herbalist: 'apothecary',
  alchemist: 'apothecary', miller: 'mill', farmer: 'granary', guard: 'barracks', office: 'counting_house',
};
export function officeKindFor(name) {
  if (!name) return null;
  const k = String(name).toLowerCase();
  if (OFFICE_KINDS[k]) return k;
  return ALIASES[k] || null;
}

const WOOD = '#6e553d', DARK = '#4a3a2c', IRON = '#3b3a3e', STONE = '#8a857c', DSTONE = '#6d6961', CANVAS = '#e8dcc0', STRAW = '#c8a85a', GOLD = '#c9a43a';

/**
 * The dressing of one service building. `desc` is describeBuilding()'s output for that very building, so the
 * dressing knows where the door is, how wide the front is and how tall the walls are.
 * `opts.lit` (default: the kind's own) — lanterns and real lights; an unlit office still gets its sign.
 */
export function officeDressing(kind, desc, { lit = null, seed = 1 } = {}) {
  const K = OFFICE_KINDS[kind];
  const out = { kind, parts: [], lights: [], fires: [], spin: [], signs: [] };
  if (!K || !desc) return out;
  const on = lit == null ? K.lit : !!lit;
  const rng = makeRng(hash(seed, 31));
  const P = out.parts;
  const H = desc.storeyHeight || 2.6;
  const front = desc.masses.find(m => m.index === desc.door.mass) || desc.masses[0];
  const F = front.z + front.d / 2;                        // the front wall
  const W = front.w, dx = desc.door.x, dw = desc.door.w;
  const left = (front.x - W / 2 + (dx - dw / 2)) / 2;     // the middle of the wall left of the door
  const right = (front.x + W / 2 + (dx + dw / 2)) / 2;
  const accent = desc.colour.accent || '#8a3a2a', trim = desc.colour.trim || WOOD;
  const part = (mesh, x, y, z, w, h, d, colour, o = {}) => { P.push({ mesh, x, y, z, w, h, d, yaw: o.yaw || 0, rx: o.rx || 0, rz: o.rz || 0, colour, tag: o.tag || 'office' }); };

  // ---- small reusable pieces -------------------------------------------------------------------
  const barrel = (x, z, s = 1) => { part('cyl', x, 0, z, 0.62 * s, 0.85 * s, 0.62 * s, '#7a5a3a'); part('cyl', x, 0.18 * s, z, 0.66 * s, 0.07, 0.66 * s, IRON); part('cyl', x, 0.62 * s, z, 0.66 * s, 0.07, 0.66 * s, IRON); };
  const crate = (x, z, s = 1, y = 0, yaw = 0) => { part('box', x, y, z, 0.7 * s, 0.6 * s, 0.7 * s, '#8a6a42', { yaw }); part('box', x, y + 0.27 * s, z, 0.74 * s, 0.06, 0.74 * s, DARK, { yaw }); };
  const sack = (x, z, s = 1) => part('dome', x, 0, z, 0.55 * s, 0.6 * s, 0.5 * s, '#b8a07a');
  const bench = (x, z, len = 1.6, yaw = 0) => { part('box', x, 0.42, z, len, 0.1, 0.4, WOOD, { yaw }); for (const s of [-1, 1]) { const c = Math.cos(yaw), sn = Math.sin(yaw); part('box', x + s * (len / 2 - 0.15) * c, 0, z - s * (len / 2 - 0.15) * sn, 0.12, 0.42, 0.36, DARK, { yaw }); } };
  /** A lantern on a wall bracket at (x, F) — glass tagged 'lamp' and a real light when lit. */
  const lantern = (x, y = Math.min(2.3, H * 0.85), z = F) => {
    part('box', x, y + 0.42, z + 0.25, 0.06, 0.06, 0.5, IRON);
    part('box', x, y, z + 0.48, 0.26, 0.04, 0.26, IRON);
    part('box', x, y + 0.04, z + 0.48, 0.2, 0.3, 0.2, on ? '#ffd28a' : '#4a4236', { tag: on ? 'lamp' : 'office' });
    part('hip', x, y + 0.34, z + 0.48, 0.3, 0.14, 0.3, IRON);
    if (on) out.lights.push({ x, y: y + 0.2, z: z + 0.55, color: '#ffbe6e' });
  };
  /** A hanging sign: an iron arm out from the wall, a board hanging under it edge-on to the street (readable both ways). */
  const sign = (emblem, x = right, y = Math.min(H * 0.98, 3.0), colour = accent) => {
    part('box', x, y, F + 0.55, 0.08, 0.08, 1.1, IRON);
    part('box', x, y - 0.2, F + 0.1, 0.06, 0.24, 0.06, IRON);
    for (const z of [F + 0.6, F + 0.98]) part('box', x, y - 0.18, z, 0.03, 0.18, 0.03, IRON);
    const by = y - 0.92, bz = F + 0.79;
    part('box', x, by, bz, 0.07, 0.72, 0.8, colour);
    part('box', x, by - 0.03, bz, 0.09, 0.05, 0.86, trim); part('box', x, by + 0.7, bz, 0.09, 0.05, 0.86, trim);
    if (emblem) for (const side of [-1, 1]) drawEmblem(emblem, x + side * 0.06, by + 0.36, bz, side);
    out.signs.push({ x, y: by, z: bz, emblem, label: K.label });
  };
  /** Emblem shapes on a board face; `side` = which face (x sign). Centre (ex, ey, ez); the board plane is YZ. */
  function drawEmblem(e, ex, ey, ez, side) {
    const t = 0.05, X = ex + side * t / 2;
    // a disc turned on its side (rz = pi/2) lies along -x from its base point: start it on the face, not in the board
    const em = (mesh, y, z, w, h, d, c, o) => part(mesh, o && o.rz ? X + (side > 0 ? h : 0) : X, ey + y, ez + z, w, h, d, c, o);
    switch (e) {
      case 'anvil': em('box', -0.2, 0, t, 0.1, 0.18, IRON); em('box', -0.1, 0, t, 0.1, 0.42, '#55545a'); em('cone', -0.06, 0.24, 0.07, 0.18, 0.07, '#55545a', { rx: Math.PI / 2 }); break;
      case 'mug': em('cyl', -0.2, 0, t, 0.34, 0.26, GOLD); em('box', -0.1, -0.17, t, 0.16, 0.06, GOLD); em('cyl', 0.13, 0, t, 0.05, 0.27, CANVAS); break;
      case 'coin': em('cyl', -0.2, 0, 0.04, 0.4, 0.4, GOLD, { rz: Math.PI / 2 }); break;
      case 'sack': em('dome', -0.22, 0, t, 0.38, 0.36, '#d8c09a'); em('box', 0.12, 0, t, 0.08, 0.1, '#8a6a42'); break;
      case 'horseshoe': em('box', -0.2, -0.13, t, 0.36, 0.06, IRON); em('box', -0.2, 0.13, t, 0.36, 0.06, IRON); em('box', -0.22, 0, t, 0.06, 0.3, IRON); break;
      case 'scissors': em('box', -0.22, 0, t, 0.44, 0.04, '#d8d8dc', { rx: 0.6 }); em('box', -0.22, 0, t, 0.44, 0.04, '#d8d8dc', { rx: -0.6 }); break;
      case 'shield': em('box', -0.22, 0, t, 0.42, 0.34, '#7a2a2a'); em('box', -0.03, 0, t + 0.01, 0.06, 0.34, GOLD); em('box', -0.03, 0, t + 0.01, 0.32, 0.06, GOLD, { rx: Math.PI / 2 }); break;
      case 'bow': em('box', -0.22, -0.08, t, 0.24, 0.04, '#7a5a2a', { rx: -0.5 }); em('box', -0.02, -0.08, t, 0.24, 0.04, '#7a5a2a', { rx: 0.5 }); em('box', -0.22, 0.02, t * 0.5, 0.46, 0.015, CANVAS); break;
      case 'spool': em('cyl', -0.2, 0, 0.04, 0.4, 0.22, '#c04a6a', { rz: Math.PI / 2 }); em('box', -0.22, 0, t, 0.44, 0.04, '#d8d8dc', { rx: 0.4 }); break;
      case 'bottle': em('cyl', -0.24, 0, t, 0.3, 0.24, '#4a8a5a'); em('cyl', 0.06, 0, t, 0.14, 0.09, '#4a8a5a'); em('cyl', 0.2, 0, t, 0.06, 0.1, '#8a6a42'); break;
      case 'ring': em('cyl', -0.2, 0, 0.04, 0.34, 0.34, GOLD, { rz: Math.PI / 2 }); em('cyl', -0.18, 0, 0.05, 0.22, 0.22, accent, { rz: Math.PI / 2 }); em('box', 0.12, 0, t, 0.1, 0.1, '#7ad0ff'); break;
      case 'scales': em('box', -0.26, 0, t, 0.5, 0.04, GOLD); em('box', 0.2, 0, t, 0.04, 0.44, GOLD); for (const z of [-0.2, 0.2]) em('cyl', -0.04, z, t, 0.05, 0.14, GOLD); break;
      case 'eye': em('cyl', -0.2, 0, 0.04, 0.4, 0.4, '#e8e0f0', { rz: Math.PI / 2 }); em('cyl', -0.1, 0, 0.05, 0.2, 0.2, '#6a3a9a', { rz: Math.PI / 2 }); break;
      case 'sun': em('cyl', -0.2, 0, 0.04, 0.4, 0.4, GOLD, { rz: Math.PI / 2 }); break;
      default: break;
    }
  }
  const awning = (x0, x1, y, depth, c1, c2) => {
    const n = Math.max(3, Math.round((x1 - x0) / 0.55));
    const sw = (x1 - x0) / n;
    for (let i = 0; i < n; i++) part('shed', x0 + sw * (i + 0.5), y, F + depth / 2, depth, 0.5, sw + 0.01, i % 2 ? c2 : c1, { yaw: Math.PI / 2 });
    for (const x of [x0 + 0.06, x1 - 0.06]) part('box', x, 0, F + depth - 0.06, 0.1, y, 0.1, DARK);
    // a scalloped valance along the front edge
    part('box', (x0 + x1) / 2, y - 0.22, F + depth, x1 - x0, 0.22, 0.04, c1);
  };
  const table = (x, z, w = 1.6, goods = []) => {
    part('box', x, 0.78, z, w, 0.08, 0.7, WOOD);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part('box', x + sx * (w / 2 - 0.08), 0, z + sz * 0.27, 0.08, 0.78, 0.08, DARK);
    goods.forEach((g, i) => part(g.mesh || 'dome', x - w / 2 + (i + 0.5) * w / goods.length, 0.86, z, g.s || 0.28, g.h || 0.2, g.s || 0.28, g.c));
  };
  const fenceRun = (x0, z0, x1, z1, colour = WOOD) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 1.4)), yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) part('box', x0 + (x1 - x0) * i / n, 0, z0 + (z1 - z0) * i / n, 0.14, 1.1, 0.14, DARK);
    for (const y of [0.45, 0.88]) part('box', (x0 + x1) / 2, y, (z0 + z1) / 2, 0.07, 0.09, len, colour, { yaw });
  };

  // ---- the trades ------------------------------------------------------------------------------
  switch (kind) {
    case 'forge': {
      // an open-fronted smithing shed against the left wall: shed roof on posts, a stone hearth with the fire,
      // the anvil on its block in front of it, a quench trough and a rack of tongs and hammers
      const sx = front.x - W / 2 - 1.5, sz = F - Math.min(2.2, front.d * 0.35), sd = Math.min(3.6, front.d * 0.8 + 0.6);
      part('shed', sx - 0.05, 2.4, sz, 3.1, 0.75, sd + 0.3, desc.colour.roof || '#5a4a3a');
      for (const [px, pz] of [[sx - 1.4, sz - sd / 2 + 0.1], [sx - 1.4, sz + sd / 2 - 0.1]]) part('box', px, 0, pz, 0.18, 2.4, 0.18, DARK);
      part('box', sx + 0.5, 0, sz - sd * 0.18, 1.5, 0.95, 1.3, DSTONE);                 // hearth
      part('box', sx + 0.5, 0.95, sz - sd * 0.18, 1.2, 0.1, 1.0, '#2a2220');
      part('box', sx + 0.9, 0.95, sz - sd * 0.18, 0.5, 2.6, 0.6, STONE);                 // its stack, up the wall
      out.fires.push({ x: sx + 0.45, y: 1.05, z: sz - sd * 0.18, s: 0.8 });
      if (on) out.lights.push({ x: sx + 0.4, y: 1.6, z: sz - sd * 0.18 + 0.4, color: '#ff8a3a', strong: true });
      // the anvil, out front where people can see it worked
      const ax = sx + 0.2, az = Math.min(F + 0.9, sz + sd / 2 + 0.6);
      part('cyl', ax, 0, az, 0.62, 0.55, 0.62, '#5a4632');
      part('box', ax, 0.55, az, 0.32, 0.16, 0.5, IRON); part('box', ax, 0.71, az, 0.26, 0.12, 0.36, '#4a4a50'); part('box', ax, 0.83, az, 0.36, 0.13, 0.72, '#55545a');
      part('cone', ax, 0.83, az + 0.48, 0.12, 0.3, 0.12, '#55545a', { rx: Math.PI / 2 });
      part('box', ax + 0.05, 0.96, az - 0.1, 0.06, 0.05, 0.32, DARK, { yaw: 0.5 });     // a hammer left on it
      part('box', ax + 0.9, 0, az - 0.2, 0.55, 0.5, 1.1, '#5a5048'); part('box', ax + 0.9, 0.42, az - 0.2, 0.45, 0.05, 1.0, '#2b4a5a');   // quench trough
      part('box', sx - 1.3, 0.7, sz, 0.08, 1.2, 1.4, DARK);                                // tool rack on the post side
      for (let i = 0; i < 4; i++) part('box', sx - 1.24, 0.8, sz - 0.5 + i * 0.33, 0.05, 0.9, 0.05, IRON);
      barrel(front.x + W / 2 - 0.5, F + 0.55, 0.9);
      sign('anvil', right);
      if (on) lantern(dx + dw / 2 + 0.35);
      break;
    }
    case 'shop': case 'provisioner': case 'market': {
      const stripe = kind === 'market' ? '#2a6a8a' : kind === 'provisioner' ? '#4a7a3a' : '#9a2a2a';
      awning(front.x - W / 2 + 0.1, front.x + W / 2 - 0.1, Math.min(2.5, H * 0.92), 1.7, stripe, CANVAS);
      table(left, F + 1.0, Math.min(1.8, Math.max(0.9, dx - dw / 2 - (front.x - W / 2) - 0.3)), kind === 'provisioner'
        ? [{ c: '#d8b060' }, { c: '#a03a2a' }, { c: '#e0c080' }] : [{ c: '#c03a3a' }, { c: '#e0b040', mesh: 'box' }, { c: '#5a8a3a' }]);
      crate(right - 0.3, F + 0.9, 1); crate(right - 0.3, F + 0.9, 0.8, 0.6, 0.4); sack(right + 0.5, F + 0.7); barrel(front.x + W / 2 + 0.55, F + 0.2);
      sign(kind === 'market' ? 'coin' : 'sack', front.x + W / 2 - 0.25);
      if (on) { lantern(dx - dw / 2 - 0.35); }
      if (kind === 'market') for (const s of [-1, 1]) {
        const x = front.x + s * (W / 2 + 2.2);
        part('box', x, 0, F + 1.2, 1.9, 0.85, 1.0, WOOD); part('gable', x, 2.0, F + 1.2, 2.3, 0.6, 1.5, s > 0 ? stripe : CANVAS, { yaw: Math.PI / 2 });
        for (const px of [-0.9, 0.9]) part('box', x + px, 0, F + 1.65, 0.1, 2.0, 0.1, DARK);
        table(x, F + 1.2, 1.6, [{ c: '#c88a3a' }, { c: '#8a3a6a' }, { c: '#d8d0b0', mesh: 'box' }]);
      }
      break;
    }
    case 'inn': {
      sign('mug', front.x + W / 2 - 0.3, Math.min(H * 1.05, 3.2), '#5a2a1a');
      if (on) { lantern(dx - dw / 2 - 0.35); lantern(dx + dw / 2 + 0.35); }
      bench(left, F + 0.9, 1.6); part('box', left, 0, F + 1.6, 1.0, 0.75, 0.6, WOOD);    // a bench and a table by the door
      barrel(right, F + 0.6); barrel(right + 0.7, F + 0.5, 0.9); part('cyl', right + 0.35, 0.85, F + 0.55, 0.62, 0.8, 0.62, '#7a5a3a', { rz: Math.PI / 2 });
      // a little hitch for travellers' horses
      part('box', front.x + W / 2 + 1.2, 0, F + 1.4, 0.14, 1.0, 0.14, DARK); part('box', front.x + W / 2 + 1.2, 0, F - 0.4, 0.14, 1.0, 0.14, DARK); part('box', front.x + W / 2 + 1.2, 0.85, F + 0.5, 0.1, 0.1, 1.9, WOOD);
      break;
    }
    case 'stable': {
      // a paddock off the side, hay, a trough, a saddle on the rail
      const px0 = front.x + W / 2 + 0.6, px1 = px0 + 5, pz0 = F - Math.min(5, front.d), pz1 = F + 1.8;
      fenceRun(px0, pz0, px1, pz0); fenceRun(px1, pz0, px1, pz1); fenceRun(px0, pz1, px1 - 1.6, pz1);
      part('box', (px0 + px1) / 2 + 0.5, 0, pz0 + 0.8, 1.8, 0.45, 0.55, '#5a5048'); part('box', (px0 + px1) / 2 + 0.5, 0.38, pz0 + 0.8, 1.6, 0.05, 0.45, '#2b4a5a');
      part('box', left, 0, F + 0.7, 1.2, 0.6, 0.8, STRAW); part('box', left + 0.2, 0.6, F + 0.75, 1.0, 0.55, 0.7, STRAW, { yaw: 0.2 });
      part('box', px0 + 1.2, 0.95, pz1, 0.6, 0.18, 0.4, '#5a3a22');      // a saddle on the rail
      sign('horseshoe', dx + dw / 2 + 0.25 < front.x + W / 2 - 0.2 ? front.x + W / 2 - 0.25 : right);
      if (on) lantern(dx - dw / 2 - 0.35);
      break;
    }
    case 'barber': {
      // the striped pole: white, red and blue bands spiralling (tilted bands read as a spiral at a distance)
      const bx = dx + dw / 2 + 0.55, bz = F + 0.32;
      part('box', bx, 1.15, F + 0.06, 0.12, 1.5, 0.12, IRON);
      part('cyl', bx, 1.0, bz, 0.2, 0.08, 0.2, GOLD); part('cyl', bx, 2.32, bz, 0.2, 0.08, 0.2, GOLD); part('dome', bx, 2.4, bz, 0.2, 0.16, 0.2, GOLD);
      for (let i = 0; i < 10; i++) part('cyl', bx, 1.08 + i * 0.124, bz, 0.16, 0.12, 0.16, ['#f4f0e8', '#c0282a', '#f4f0e8', '#2a4aa0'][i % 4], { rz: 0.32 });
      sign('scissors', front.x - W / 2 + 0.35);
      bench(left, F + 0.85, 1.4);
      if (on) lantern(dx - dw / 2 - 0.35);
      break;
    }
    case 'armoury': {
      // a weapon rack and an armour stand by the door
      part('box', left, 0, F + 0.5, 1.6, 0.12, 0.4, DARK); part('box', left, 1.1, F + 0.42, 1.6, 0.1, 0.12, DARK);
      for (let i = 0; i < 5; i++) part('box', left - 0.6 + i * 0.3, 0.1, F + 0.48, 0.05, 1.5, 0.05, i % 2 ? '#a0a4ac' : WOOD);
      const sx = right; part('box', sx, 0, F + 0.7, 0.1, 1.2, 0.1, DARK); part('box', sx, 1.0, F + 0.7, 0.55, 0.6, 0.32, '#8a909a'); part('dome', sx, 1.6, F + 0.7, 0.32, 0.36, 0.32, '#8a909a');
      part('box', sx, 1.05, F + 0.7, 0.75, 0.12, 0.12, '#8a909a');
      sign('shield', front.x + W / 2 - 0.25);
      if (on) lantern(dx - dw / 2 - 0.35);
      break;
    }
    case 'bowyer': {
      part('cyl', left, 0.2, F + 1.2, 1.1, 1.1, 0.15, '#d8c890', { rx: Math.PI / 2 }); part('cyl', left, 0.42, F + 1.27, 0.7, 0.66, 0.05, '#c03a2a', { rx: Math.PI / 2 }); part('cyl', left, 0.62, F + 1.29, 0.28, 0.26, 0.05, GOLD, { rx: Math.PI / 2 });
      for (const s of [-1, 1]) part('box', left + s * 0.4, 0, F + 1.0, 0.08, 1.2, 0.08, DARK, { rx: 0.25 });
      part('box', right, 0, F + 0.4, 1.2, 0.1, 0.3, DARK); for (let i = 0; i < 5; i++) part('box', right - 0.5 + i * 0.25, 0.1, F + 0.4, 0.04, 1.7, 0.04, '#9a7a4a');
      sign('bow', front.x + W / 2 - 0.25);
      if (on) lantern(dx - dw / 2 - 0.35);
      break;
    }
    case 'tailor': {
      part('box', right, 0, F + 0.7, 0.08, 1.0, 0.08, DARK); part('cyl', right, 1.0, F + 0.7, 0.5, 0.6, 0.38, accent); part('dome', right, 1.6, F + 0.7, 0.2, 0.2, 0.2, '#d8c8a8');
      for (let i = 0; i < 4; i++) part('cyl', left - 0.45 + i * 0.3, 0, F + 0.5, 0.26, 1.0, 0.26, ['#7a2a4a', '#2a5a7a', '#c8b06a', '#4a6a3a'][i]);
      sign('spool', front.x + W / 2 - 0.25);
      if (on) lantern(dx - dw / 2 - 0.35);
      break;
    }
    case 'apothecary': {
      // a herb drying rack and a shelf of coloured bottles
      part('box', left, 0, F + 0.5, 1.4, 0.1, 0.35, DARK); part('box', left, 0.9, F + 0.5, 1.4, 0.06, 0.35, DARK);
      for (let i = 0; i < 6; i++) part('cyl', left - 0.55 + i * 0.22, 0.96, F + 0.5, 0.12, 0.2 + (i % 3) * 0.05, 0.12, ['#4a8a5a', '#8a3a6a', '#3a6a9a', '#c0a03a'][i % 4]);
      for (const s of [-1, 1]) part('box', right + s * 0.6, 0, F + 0.8, 0.08, 1.7, 0.08, DARK);
      part('box', right, 1.6, F + 0.8, 1.3, 0.06, 0.06, DARK);
      for (let i = 0; i < 5; i++) part('cone', right - 0.5 + i * 0.25, 1.15, F + 0.8, 0.18, 0.45, 0.18, ['#6a8a3a', '#8a9a4a', '#5a7a3a'][i % 3], { rx: Math.PI });
      sign('bottle', front.x + W / 2 - 0.25, undefined, '#2a4a3a');
      if (on) lantern(dx - dw / 2 - 0.35);
      break;
    }
    case 'jeweller': {
      part('box', left, 0, F + 0.6, 1.2, 0.95, 0.6, DARK); part('box', left, 0.95, F + 0.6, 1.14, 0.3, 0.54, '#9fc4d8');
      for (let i = 0; i < 3; i++) part('box', left - 0.35 + i * 0.35, 1.0, F + 0.6, 0.12, 0.08, 0.12, ['#7ad0ff', GOLD, '#d04a6a'][i]);
      sign('ring', front.x + W / 2 - 0.25, undefined, '#2a2a4a');
      if (on) { lantern(dx - dw / 2 - 0.35); lantern(dx + dw / 2 + 0.35); }
      break;
    }
    case 'temple': case 'chapel': case 'shrine': {
      // broad steps, a sun disc over the door, two candle stands (small flames, no street light), a statue
      const sw = Math.min(W - 0.2, dw + 2.4);
      for (let i = 0; i < 3; i++) part('box', dx, i * 0.16, F + 0.95 - i * 0.3, sw - i * 0.3, 0.16, 0.9 - i * 0.26, STONE);
      part('cyl', dx, Math.min(desc.door.h + 0.45, H * 0.95), F + 0.06, 0.8, 0.8, 0.08, GOLD, { rx: Math.PI / 2 });
      for (const s of [-1, 1]) {
        const cx = dx + s * (sw / 2 + 0.35);
        part('cyl', cx, 0, F + 0.7, 0.16, 1.1, 0.16, IRON); part('cyl', cx, 1.1, F + 0.7, 0.36, 0.06, 0.36, IRON);
        for (const k of [-1, 0, 1]) part('cyl', cx + k * 0.1, 1.16, F + 0.7, 0.05, 0.16 + (k + 1) * 0.03, 0.05, '#f0e8d0');
        out.fires.push({ x: cx, y: 1.36, z: F + 0.7, s: 0.22 });
      }
      const st = left < dx - sw / 2 - 0.6 ? left : front.x - W / 2 - 1.0;
      part('box', st, 0, F + 1.2, 0.8, 0.6, 0.8, DSTONE); part('cyl', st, 0.6, F + 1.2, 0.5, 1.1, 0.4, '#b8b2a6'); part('dome', st, 1.7, F + 1.2, 0.34, 0.4, 0.34, '#b8b2a6');
      break;
    }
    case 'hall': {
      // banners either side of the door, wide steps, a flagpole
      const sw = Math.min(W - 0.2, dw + 2.6);
      for (let i = 0; i < 3; i++) part('box', dx, i * 0.18, F + 0.95 - i * 0.3, sw - i * 0.3, 0.18, 0.9 - i * 0.26, STONE);
      for (const s of [-1, 1]) {
        const bx = dx + s * (dw / 2 + 0.6);
        part('box', bx, Math.max(0.6, H * 0.95 - 1.9), F + 0.05, 0.62, 1.9, 0.05, accent);
        part('box', bx, Math.max(0.6, H * 0.95 - 1.9) + 1.88, F + 0.08, 0.8, 0.06, 0.08, GOLD);
        part('hip', bx, Math.max(0.6, H * 0.95 - 1.9) - 0.25, F + 0.05, 0.62, 0.25, 0.05, accent, { rx: Math.PI });
      }
      const fx = front.x + W / 2 + 1.0;
      part('cyl', fx, 0, F + 1.0, 0.12, 6.5, 0.12, '#d8d0c0'); part('dome', fx, 6.5, F + 1.0, 0.18, 0.12, 0.18, GOLD);
      part('box', fx, 5.2, F + 1.0 + 0.75, 0.04, 0.95, 1.5, accent);
      break;
    }
    case 'counting_house': {
      const sw = Math.min(W - 0.2, dw + 1.6);
      for (let i = 0; i < 2; i++) part('box', dx, i * 0.16, F + 0.6 - i * 0.3, sw - i * 0.3, 0.16, 0.6 - i * 0.26, STONE);
      part('box', left, 0, F + 0.6, 0.8, 0.55, 0.55, '#5a3a22'); part('box', left, 0.55, F + 0.6, 0.84, 0.1, 0.59, IRON); part('box', left, 0.2, F + 0.89, 0.12, 0.14, 0.04, GOLD);
      sign('scales', front.x + W / 2 - 0.25, undefined, '#2a3a2a');
      break;
    }
    case 'study': {
      // a lectern with an open book and a crystal on a post (it glints; it does not light the street)
      part('box', left, 0, F + 0.8, 0.12, 1.0, 0.12, DARK); part('box', left, 1.0, F + 0.8, 0.6, 0.06, 0.45, DARK, { rx: -0.35 }); part('box', left, 1.08, F + 0.8, 0.5, 0.04, 0.36, '#e8dcc0', { rx: -0.35 });
      part('cyl', right, 0, F + 0.8, 0.16, 1.2, 0.16, DSTONE); part('cone', right, 1.2, F + 0.8, 0.22, 0.4, 0.22, '#9a6ad0'); part('cone', right, 1.6, F + 0.8, 0.22, 0.3, 0.22, '#9a6ad0', { rx: Math.PI });
      sign('eye', front.x + W / 2 - 0.25, undefined, '#2a1a3a');
      break;
    }
    case 'mill': {
      const top = heightOf(desc);
      const hub = { x: front.x, y: Math.max(3.5, top * 0.72), z: F + 0.45 };
      part('cyl', hub.x, hub.y - 0.2, F + 0.2, 0.4, 0.4, 0.5, DARK, { rx: Math.PI / 2 });
      const L = Math.max(3.2, Math.min(6, top * 0.62)), blades = [];
      for (let k = 0; k < 4; k++) {
        // a unit box stands on its base point and rz turns it about that point: a blade's base sits at the hub
        // and rz = -a points it along (sin a, cos a); its sail cloth starts a fifth of the way out, to one side
        const a = k * Math.PI / 2, ux = Math.sin(a), uy = Math.cos(a);
        blades.push({ mesh: 'box', x: 0, y: 0, z: 0, w: 0.14, h: L, d: 0.08, yaw: 0, rx: 0, rz: -a, colour: DARK, tag: 'office' });
        blades.push({ mesh: 'box', x: ux * L * 0.22 + uy * 0.34, y: uy * L * 0.22 - ux * 0.34, z: 0.03, w: 0.62, h: L * 0.76, d: 0.03, yaw: 0, rx: 0, rz: -a, colour: '#e0d4b8', tag: 'office' });
      }
      out.spin.push({ x: hub.x, y: hub.y, z: hub.z, axis: 'z', speed: 0.45, parts: blades });
      sack(left, F + 0.6); sack(left + 0.5, F + 0.5, 0.9); crate(right, F + 0.6);
      break;
    }
    case 'granary': case 'warehouse': {
      for (let i = 0; i < 3; i++) sack(left - 0.5 + i * 0.55, F + 0.55, 0.9 + (i % 2) * 0.15);
      crate(right, F + 0.6); crate(right + 0.8, F + 0.5, 0.9); crate(right + 0.4, F + 0.55, 0.8, 0.55, 0.3);
      // a hand cart
      const cx = front.x + W / 2 + 1.2; part('box', cx, 0.45, F + 0.8, 1.0, 0.35, 1.5, WOOD); for (const s of [-1, 1]) part('cyl', cx + s * 0.58, 0.05, F + 0.8, 0.8, 0.08, 0.8, DARK, { rz: Math.PI / 2 });
      part('box', cx, 0.6, F + 2.0, 0.08, 0.08, 1.2, WOOD);
      break;
    }
    case 'barracks': case 'watchpost': {
      part('box', left, 0, F + 0.5, 1.4, 0.12, 0.35, DARK); part('box', left, 1.0, F + 0.42, 1.4, 0.1, 0.12, DARK);
      for (let i = 0; i < 4; i++) part('box', left - 0.5 + i * 0.33, 0.1, F + 0.48, 0.05, 1.7, 0.05, '#9a7a4a');
      part('box', right, 0, F + 1.0, 0.12, 1.6, 0.12, '#7a5a3a'); part('dome', right, 1.2, F + 1.0, 0.5, 0.6, 0.5, STRAW); part('box', right, 1.0, F + 1.0, 1.0, 0.1, 0.1, '#7a5a3a');
      if (kind === 'barracks') sign('shield', front.x + W / 2 - 0.25, undefined, '#3a3a5a');
      break;
    }
    default: break;
  }
  // a touch of seeded variety: nudge loose clutter a few centimetres so no two shops are pixel-identical
  for (const p of P) if (p.mesh === 'cyl' && p.h < 1 && p.y === 0) { p.x += (rng() - 0.5) * 0.06; p.z += (rng() - 0.5) * 0.06; }
  return out;
}
