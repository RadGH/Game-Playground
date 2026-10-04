// Race + team + player-slot identity (stream C). Data: data/identity.json.
//
//   import { loadIdentity } from './identity.js';
//   const id = await loadIdentity();
//   id.slotColor(4)              -> '#f0a238'   (slots 0-2 team 0, 3-5 team 1)
//   id.teamColor(1)              -> '#e0503e'
//   id.race('unburied')          -> { stone, roof, trim, cloth, glow, emblem, style, ... }
//   id.emblemCanvas('paw', { color, size })      -> a canvas with the emblem drawn on transparent
//   id.bannerTexture(THREE, { race, color })     -> a cached CanvasTexture: cloth + border + emblem
//   id.css()                     -> ':root { --slot-0: ...; --team-0: ... }' for the UI
//
// Rules (also in the JSON _doc): never recolour a unit. Slot colour on rings and banners, team
// colour on HP bars, race palette on buildings.

const here = p => new URL(p, import.meta.url).href;

/** Emblems as 2D drawing on a 100x100 board (centre 50,50). Original shapes only. */
const EMBLEMS = {
  tower(g) {          // a keep tower with a gate and three merlons
    g.beginPath(); g.moveTo(30, 86); g.lineTo(30, 38); g.lineTo(26, 38); g.lineTo(26, 24); g.lineTo(34, 24); g.lineTo(34, 30); g.lineTo(42, 30); g.lineTo(42, 24);
    g.lineTo(58, 24); g.lineTo(58, 30); g.lineTo(66, 30); g.lineTo(66, 24); g.lineTo(74, 24); g.lineTo(74, 38); g.lineTo(70, 38); g.lineTo(70, 86); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(42, 86); g.lineTo(42, 66); g.arc(50, 66, 8, Math.PI, 0); g.lineTo(58, 86); g.closePath(); g.fill();
    g.fillRect(46, 44, 8, 10);
    g.globalCompositeOperation = 'source-over';
  },
  tusks(g) {          // two curved tusks crossed under a horned brow
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(50 + s * 30, 20); g.quadraticCurveTo(50 + s * 34, 66, 50 - s * 14, 84); g.quadraticCurveTo(50 + s * 18, 62, 50 + s * 20, 20); g.closePath(); g.fill();
    }
    g.beginPath(); g.moveTo(28, 40); g.quadraticCurveTo(50, 28, 72, 40); g.lineTo(66, 48); g.quadraticCurveTo(50, 40, 34, 48); g.closePath(); g.fill();
  },
  skull(g) {          // a skull under a crescent
    g.beginPath(); g.arc(50, 50, 22, Math.PI * 0.9, Math.PI * 2.1); g.lineTo(66, 72); g.lineTo(34, 72); g.closePath(); g.fill();
    g.fillRect(38, 72, 24, 10);
    g.beginPath(); g.arc(50, 22, 14, Math.PI * 0.15, Math.PI * 0.85, false); g.arc(50, 14, 14, Math.PI * 0.8, Math.PI * 0.2, true); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse(41, 52, 6, 7, 0, 0, Math.PI * 2); g.ellipse(59, 52, 6, 7, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(50, 60); g.lineTo(46, 67); g.lineTo(54, 67); g.closePath(); g.fill();
    for (let i = 0; i < 3; i++) g.fillRect(42 + i * 6, 74, 2, 8);
    g.globalCompositeOperation = 'source-over';
  },
  paw(g) {            // a paw print ringed by thorns
    g.beginPath(); g.ellipse(50, 60, 15, 13, 0, 0, Math.PI * 2); g.fill();
    for (const [x, y, r] of [[31, 42, 6.5], [43, 33, 7], [57, 33, 7], [69, 42, 6.5]]) { g.beginPath(); g.ellipse(x, y, r, r * 1.25, (x - 50) / 60, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.2, r0 = 40, r1 = 47;
      g.beginPath(); g.moveTo(50 + Math.cos(a - 0.12) * r0, 52 + Math.sin(a - 0.12) * r0); g.lineTo(50 + Math.cos(a) * r1, 52 + Math.sin(a) * r1); g.lineTo(50 + Math.cos(a + 0.12) * r0, 52 + Math.sin(a + 0.12) * r0); g.closePath(); g.fill();
    }
  },
};
export const EMBLEM_IDS = Object.keys(EMBLEMS);

export async function loadIdentity(url = here('../../data/identity.json')) {
  const data = await (await fetch(url)).json();
  return createIdentity(data);
}

export function createIdentity(data) {
  const texCache = new Map();
  const api = {
    data,
    teamColor: t => data.teams[t]?.color || '#888888',
    teamDark: t => data.teams[t]?.dark || '#333333',
    slotColor: s => data.slots[s]?.color || api.teamColor(s < 3 ? 0 : 1),
    /** The default slot for the n-th player of a team (0, 1, 2). */
    slotFor: (team, n = 0) => team * 3 + Math.min(2, n),
    race: id => data.races[id] || data.races.freeholds,
    raceIds: () => Object.keys(data.races),
    emblemCanvas(emblem, { color = '#ffffff', size = 128, outline = 'rgba(0,0,0,0.45)' } = {}) {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d'); g.scale(size / 100, size / 100);
      const draw = EMBLEMS[emblem] || EMBLEMS.tower;
      // outline pass: draw a little larger in the outline colour, then the emblem on top
      const tmp = document.createElement('canvas'); tmp.width = tmp.height = size; const t = tmp.getContext('2d'); t.scale(size / 100, size / 100);
      t.fillStyle = color; draw(t);
      if (outline) { g.save(); g.filter = 'blur(0px)'; g.globalAlpha = 1; for (const [dx, dy] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) { g.drawImage(tmp, dx, dy, 100, 100); } g.globalCompositeOperation = 'source-in'; g.fillStyle = outline; g.fillRect(0, 0, 100, 100); g.restore(); }
      g.drawImage(tmp, 0, 0, 100, 100);
      return c;
    },
    /**
     * A banner cloth texture: the player's colour, a border in the race trim, the race emblem.
     * Cached per (race, colour, shape). `shape` 'banner' is a tall swallow-tailed hanging banner
     * (UV: top at v=1); 'flag' is a wide flag for poles.
     */
    bannerTexture(THREE, { race = 'freeholds', color = '#3f86ec', shape = 'banner', size = 128 } = {}) {
      const key = race + color + shape + size;
      if (texCache.has(key)) return texCache.get(key);
      const R = api.race(race);
      const w = shape === 'flag' ? size * 1.5 : size, h = shape === 'flag' ? size : size * 1.6;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, shadeHex(color, 0.15)); grd.addColorStop(1, shadeHex(color, -0.22));
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      // weave
      g.globalAlpha = 0.08; g.fillStyle = '#000'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); g.globalAlpha = 1;
      const b = size * 0.06;
      g.strokeStyle = R.trim; g.lineWidth = b; g.strokeRect(b * 1.2, b * 1.2, w - b * 2.4, h - b * 2.4);
      const e = api.emblemCanvas(R.emblem, { color: R.trim, size: Math.round(size * 0.8) });
      g.drawImage(e, (w - size * 0.7) / 2, shape === 'flag' ? (h - size * 0.7) / 2 : h * 0.18, size * 0.7, size * 0.7);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      texCache.set(key, tex); return tex;
    },
    css() {
      const lines = data.slots.map((s, i) => `--slot-${i}: ${s.color};`).concat(data.teams.map((t, i) => `--team-${i}: ${t.color}; --team-${i}-dark: ${t.dark};`));
      return `:root { ${lines.join(' ')} }`;
    },
  };
  return api;
}

/** Lighten (k > 0) or darken (k < 0) a #rrggbb colour. */
export function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return '#' + [f(r), f(g), f(b)].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
