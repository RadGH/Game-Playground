// The chapter map, in three acts (docs/STORY.md). Act I is the painted wyrm: the road winds along her back from the tail
// (Millbrook) to the crown (Crownhollow). Acts II and III fork: after Crownhollow the road splits in two, and after each
// of those it splits again — four roads into Act III. The hero's own road is lit; a road the hero has not walked is a
// faint dashed line of unnamed places ("Another road" — no names, no art from it, until it is walked). Tabs pick the
// act; the row beside them counts the endings found. Every place is a node in one list (`layout()`); its button sits on
// its drawing in a box exactly the drawing's size (fit(), #98 — tests/ui/layout-browser.mjs). The details panel names
// the act and road, the suggested level, best time and the ending a final chapter gave; the Peddler's cart stands by
// the hero's place. Start a chapter (its opening scene plays the first time), or open the bag, spells or Peddler.
// For the lead: a new road is a new entry in data/acts.json routes + its node positions in ROADS below.
import { icon } from './icons.js';
import { esc, CLASS_NAMES, timeText, placeLine, chapterPlace, endingOf } from './text.js';
import { hp as n } from '../../../../shared/format.js';
import { openPeddler } from './peddler.js';
import { companionFor } from './looks.js';
import { COLORS } from './party.js';
import { progressOf } from '../sim/route.js';

const W = 1000, H = 560;
const BODY = 'M70 470 C150 525 250 420 340 418 S500 505 590 392 S700 238 790 226 S880 214 905 182';
const AT = [0.05, 0.235, 0.43, 0.615, 0.79, 0.975];
const PLACE_ICON = ['map', 'nature', 'anchor', 'tower', 'scale', 'crown'];
const GLYPH = {   // the place markers, drawn in the map's own ink
  map: '<path d="M-8 6V-2l8-6 8 6v8zM-3 6V1h6v5"/>',
  nature: '<path d="M0-9-7 2h4l-5 6h16l-5-6h4zM0 8v3"/>',
  anchor: '<path d="M0-8v15M-6 1a6 6 0 0 0 12 0M-4-5h8"/><circle cx="0" cy="-9" r="1.6"/>',
  tower: '<path d="M-6 9V-3l6-6 6 6V9zM-2 9V3h4v6M-6-3h12"/>',
  scale: '<path d="M-8 4c3-8 13-8 16 0-5-3-11-3-16 0zM-6 8c2-4 10-4 12 0"/>',
  crown: '<path d="M-8 6-9-5l5 4 4-7 4 7 5-4-1 11z"/>',
  bell: '<path d="M-7 5c1-2 1-6 1-8a6 6 0 0 1 12 0c0 2 0 6 1 8zM-2 8h4"/>',
  flame: '<path d="M0-9c4 5 7 7 7 11a7 7 0 0 1-14 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 1-5 2-8z"/>',
  wing: '<path d="M-9 4c3-8 7-11 9-12 0 4 2 7 9 8-5 1-7 3-9 6-2-2-5-2-9-2z"/>',
  lantern: '<path d="M-5-5h10v11h-10zM-3-5v-3h6v3M-5 6l5 3 5-3M0-2v5"/>',
  skull: '<path d="M-7 1a7 7 0 1 1 14 0v3h-3v4h-8V4h-3z"/><circle cx="-3" cy="0" r="1.4"/><circle cx="3" cy="0" r="1.4"/>',
  lock: '<rect x="-7" y="-1" width="14" height="10" rx="2"/><path d="M-4-1v-4a4 4 0 0 1 8 0v4"/>',
  unknown: '<path d="M-4-4a4 4 0 1 1 5 4c-1 .5-1 1.5-1 3"/><circle cx="0" cy="7" r=".9"/>',
};
/** The places of Acts II and III, in the drawing's own units. A road lists its three places in order. */
const ROADS = {
  2: { free: [[330, 168], [575, 132], [830, 172]], hold: [[330, 402], [575, 432], [830, 396]] },
  3: { 'free.bond': [[330, 70], [585, 60], [850, 82]], 'free.seal': [[330, 222], [585, 236], [850, 212]],
    'hold.crown': [[330, 344], [585, 330], [850, 352]], 'hold.break': [[330, 494], [585, 502], [850, 488]] },
};
const FORKS = { 2: { '': [95, 285] }, 3: { free: [90, 146], hold: [90, 418] } };   // where each act's roads start
const ROAD_INK = { free: '#7fb4e0', hold: '#9ad06a', 'free.bond': '#f2c14e', 'free.seal': '#e07a5a', 'hold.crown': '#8fe07a', 'hold.break': '#f0a050' };
const ACT_GLYPH = { brokenreach: 'skull', underway: 'nature', bellwater: 'bell', kingsway: 'crown', rookhaven: 'anchor', kiln: 'lantern',
  halvenhold: 'tower', wyrmback: 'wing', undermaw: 'flame', ashfall: 'flame', foundry: 'bell', belltower: 'bell',
  siege: 'tower', homefront: 'map', lanternvoid: 'lantern', wildwyrm: 'wing', wraithlight: 'skull', burningcrown: 'crown' };

let ptsCache = null;
function points() {
  if (ptsCache) return ptsCache;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', BODY); svg.append(p); svg.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden'; document.body.append(svg);
  const L = p.getTotalLength();
  ptsCache = AT.map(f => { const q = p.getPointAtLength(L * f); return { x: q.x, y: q.y }; });
  ptsCache.ridges = Array.from({ length: 34 }, (_, i) => { const a = p.getPointAtLength(L * (0.02 + i * 0.0285)), b = p.getPointAtLength(Math.min(L, L * (0.02 + i * 0.0285) + 4)); return { x: a.x, y: a.y, ang: Math.atan2(b.y - a.y, b.x - a.x) }; });
  svg.remove();
  return ptsCache;
}
/** A smooth line through points (Catmull-Rom as cubic curves). */
function smooth(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/**
 * Everything one act's map shows, from the hero's story alone (pure: tests and the walk read it):
 *   nodes: [{ key, id (null = an unnamed place on a road not walked), x, y, state, road, final, start }]
 *     state: 'done' | 'current' | 'open' | 'locked' (ahead on your road) | 'walked' (another road, walked before) | 'unknown'
 *   roads: [{ key, pts, lit (your road), known (yours or walked) }]
 */
export function layout(data, story, act) {
  const A = data.acts, P = progressOf(data, story), route = P.route, done = new Set(P.done);
  const stateOf = id => {
    const i = route.indexOf(id);
    if (i >= 0) return i === P.reached ? 'current' : done.has(id) ? 'done' : i < P.reached ? 'open' : 'locked';
    return done.has(id) ? 'walked' : 'unknown';
  };
  const node = (id, x, y, road, extra = {}) => { const st = stateOf(id); return { key: st === 'unknown' ? `other:${road}:${x}:${y}` : id, id: st === 'unknown' ? null : id, x, y, state: st, road, ...extra }; };
  const nodes = [], roads = [];
  if (act === 1 || !A) {
    const ids = A ? A.routes.act1 : data.chapters.chapters.slice(0, 6).map(c => c.id), Pt = points();
    ids.forEach((id, i) => nodes.push(node(id, Pt[i].x, Pt[i].y, 'act1', { final: i === ids.length - 1 })));
    return { act: 1, nodes, roads, P };
  }
  if (act === 2) {
    const [fx, fy] = FORKS[2][''];
    nodes.push(node(A.routes.act1.at(-1), fx, fy, 'act1', { start: true }));
    for (const [path, ids] of Object.entries(A.routes.act2)) {
      const pts = ROADS[2][path];
      ids.forEach((id, i) => nodes.push(node(id, pts[i][0], pts[i][1], path, { final: i === ids.length - 1 })));
      const lit = route.includes(ids[0]), known = lit || ids.some(id => done.has(id));
      roads.push({ key: path, pts: [[fx, fy], ...pts], lit, known });
    }
    return { act: 2, nodes, roads, P };
  }
  for (const [p1, [fx, fy]] of Object.entries(FORKS[3])) nodes.push(node(A.routes.act2[p1].at(-1), fx, fy, p1, { start: true }));
  for (const [path, ids] of Object.entries(A.routes.act3)) {
    const pts = ROADS[3][path], [fx, fy] = FORKS[3][path.split('.')[0]];
    ids.forEach((id, i) => nodes.push(node(id, pts[i][0], pts[i][1], path, { final: i === ids.length - 1 })));
    const lit = route.includes(ids[0]), known = lit || ids.some(id => done.has(id));
    roads.push({ key: path, pts: [[fx, fy], ...pts], lit, known });
  }
  return { act: 3, nodes, roads, P };
}

/** The act a hero's map opens on: the act of the place they stand. */
export const actNow = (data, story) => { const P = progressOf(data, story); return data.chapters.chapters.find(c => c.id === P.route[P.reached])?.act || 1; };

// ------------------------------------------------------------------------------------------------ painting
const DEFS = `
      <linearGradient id="wrSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26324a"/><stop offset=".55" stop-color="#3d4a5e"/><stop offset="1" stop-color="#5b5a4e"/></linearGradient>
      <linearGradient id="wrStone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8c857a"/><stop offset="1" stop-color="#5d574f"/></linearGradient>
      <radialGradient id="wrGlow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
      <pattern id="wrScales" width="18" height="12" patternUnits="userSpaceOnUse"><path d="M0 12a9 9 0 0 1 18 0" fill="none" stroke="#4a453f" stroke-width="1.4" opacity=".55"/></pattern>
      <linearGradient id="wrSky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2638"/><stop offset=".6" stop-color="#2c3a48"/><stop offset="1" stop-color="#3a4440"/></linearGradient>
      <linearGradient id="wrSky3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#241a26"/><stop offset=".55" stop-color="#3a2a30"/><stop offset="1" stop-color="#4a3a2e"/></linearGradient>
      <filter id="wrSoft"><feGaussianBlur stdDeviation="6"/></filter>`;
const STARS = (n, top = 190) => `<g fill="#fff6dc">${Array.from({ length: n }, (_, i) => { const x = (i * 211.7) % W, y = 14 + ((i * 97.3) % top), r = i % 7 === 0 ? 1.8 : 1.1; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" opacity="${(0.3 + (i % 5) * 0.12).toFixed(2)}"/>`; }).join('')}</g>`;

function art1() {
  const P = points();
  const ridge = P.ridges.map(r => { const nx = Math.sin(r.ang) * 30, ny = -Math.cos(r.ang) * 30; return `<path d="M${r.x + nx - Math.cos(r.ang) * 8} ${r.y + ny - Math.sin(r.ang) * 8} L${r.x + nx * 1.5} ${r.y + ny * 1.5} L${r.x + nx + Math.cos(r.ang) * 8} ${r.y + ny + Math.sin(r.ang) * 8}z"/>`; }).join('');
  return `    <rect width="${W}" height="${H}" fill="url(#wrSky)"/>
    <g fill="#fff6dc">${Array.from({ length: 46 }, (_, i) => { const x = (i * 211.7) % W, y = 14 + ((i * 97.3) % 190), r = i % 7 === 0 ? 1.8 : 1.1; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" opacity="${(0.35 + (i % 5) * 0.12).toFixed(2)}"/>`; }).join('')}</g>
    <circle cx="140" cy="86" r="34" fill="#f6e6b8" opacity=".9"/><circle cx="154" cy="78" r="30" fill="#2a3650" opacity=".85"/>
    <path d="M330 120 c30 -14 70 -14 100 0 M620 92 c24 -10 54 -10 78 0" stroke="#7a86a0" stroke-width="5" stroke-linecap="round" fill="none" opacity=".35"/>
    <path d="M0 300 L90 250 L170 290 L260 220 L350 280 L430 230 L520 290 L610 210 L700 260 L800 190 L880 240 L1000 200 V560 H0z" fill="#33394a" opacity=".75"/>
    <path d="M0 360 C120 330 220 380 330 350 S560 330 690 360 S900 330 1000 350 V560 H0z" fill="#46483f"/>
    <path d="M0 470 C140 450 300 480 470 460 S800 450 1000 470 V560 H0z" fill="#4f4c3c"/>
    <g fill="#6f8a5a" opacity=".55">${Array.from({ length: 26 }, (_, i) => { const x = 18 + i * 38 + (i % 3) * 7, y = 380 + (i % 4) * 34 + (i % 2) * 12; return `<path d="M${x} ${y} l-9 18 h18z"/>`; }).join('')}</g>
    <path d="${BODY}" fill="none" stroke="#2e2b28" stroke-width="86" stroke-linecap="round"/>
    <path d="${BODY}" fill="none" stroke="url(#wrStone)" stroke-width="74" stroke-linecap="round"/>
    <path d="${BODY}" fill="none" stroke="url(#wrScales)" stroke-width="70" stroke-linecap="round"/>
    <g fill="#6d665c" stroke="#2e2b28" stroke-width="2" stroke-linejoin="round">${ridge}</g>
    <g class="wr-map-head" transform="translate(918 172) rotate(-24)">
      <path d="M-30 -30 C10 -44 60 -30 78 -6 C60 10 40 22 -6 28 C-30 26 -40 0 -30 -30z" fill="url(#wrStone)" stroke="#2e2b28" stroke-width="4"/>
      <path d="M-12 -30 L-30 -70 L4 -36M14 -36 L10 -76 L32 -34" fill="#6d665c" stroke="#2e2b28" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="26" cy="-10" r="16" fill="url(#wrGlow)"/><circle cx="26" cy="-10" r="5" fill="#ffe08a"/>
      <path d="M40 14 C52 10 64 8 74 0" stroke="#2e2b28" stroke-width="3" fill="none"/>
    </g>
    <path d="M70 470 C40 455 20 470 8 500" fill="none" stroke="#2e2b28" stroke-width="30" stroke-linecap="round"/>
    <path d="M70 470 C40 455 20 470 8 500" fill="none" stroke="#6d665c" stroke-width="20" stroke-linecap="round"/>
    <path d="${BODY}" fill="none" stroke="#e3cf9b" stroke-width="7" stroke-dasharray="14 10" stroke-linecap="round" opacity=".9"/>`;
}
/** Acts II and III: dusk over the land beyond the wyrm; each road drawn in its own ink once it is yours or walked. */
function artFork(m) {
  const a2 = m.act === 2;
  const land = a2
    ? `<path d="M0 250 L120 210 L240 240 L380 190 L520 230 L660 180 L800 220 L1000 190 V560 H0z" fill="#2a3340" opacity=".8"/>
       <path d="M0 330 C200 300 400 340 600 310 S900 300 1000 320 V560 H0z" fill="#343a36"/>
       <path d="M0 470 C200 450 420 480 640 460 S900 455 1000 470 V560 H0z" fill="#3c3e34"/>`
    : `<path d="M0 200 L110 160 L230 200 L360 140 L500 190 L640 130 L790 180 L1000 140 V560 H0z" fill="#33262c" opacity=".85"/>
       <path d="M0 300 C200 270 420 310 640 280 S900 270 1000 290 V560 H0z" fill="#3a3030"/>
       <path d="M0 430 C220 410 460 440 680 420 S900 415 1000 430 V560 H0z" fill="#40362c"/>`;
  const roads = m.roads.map(r => {
    const d = smooth(r.pts), ink = ROAD_INK[r.key] || '#e3cf9b';
    if (!r.known) return `<path d="${d}" fill="none" stroke="#8a8a8a" stroke-width="5" stroke-dasharray="3 12" stroke-linecap="round" opacity=".45"/>`;
    return `<path d="${d}" fill="none" stroke="#1e1c1a" stroke-width="${r.lit ? 30 : 22}" stroke-linecap="round" opacity=".7"/>
      <path d="${d}" fill="none" stroke="${ink}" stroke-width="${r.lit ? 18 : 12}" stroke-linecap="round" opacity="${r.lit ? 0.32 : 0.16}" filter="url(#wrSoft)"/>
      <path d="${d}" fill="none" stroke="${ink}" stroke-width="${r.lit ? 6 : 4}" stroke-dasharray="14 10" stroke-linecap="round" opacity="${r.lit ? 0.95 : 0.5}"/>`;
  }).join('');
  // the endings at the ends of Act III's roads: a star for each road, filled once its ending is found
  const ends = m.act === 3 ? m.roads.map(r => { const last = r.pts.at(-1), id = { 'free.bond': 'friend', 'free.seal': 'song', 'hold.crown': 'crown', 'hold.break': 'unbound' }[r.key], got = m.endings.includes(id);
    return `<g class="wr-map-end${got ? ' got' : ''}" transform="translate(${last[0] + 70} ${last[1]})"><path d="M0-11 3.2-3.4 11-3.4 4.8 1.6 7 9.4 0 4.6-7 9.4-4.8 1.6-11-3.4-3.2-3.4z"/></g>`; }).join('') : '';
  return `<rect width="${W}" height="${H}" fill="url(#${a2 ? 'wrSky2' : 'wrSky3'})"/>${STARS(a2 ? 30 : 18, a2 ? 150 : 110)}
    ${a2 ? '<circle cx="955" cy="46" r="22" fill="#cfe0f0" opacity=".55"/>' : '<circle cx="455" cy="34" r="24" fill="#f0a060" opacity=".35"/>'}
    ${land}${roads}${ends}`;
}
function nodesSvg(m, sel) {
  const at = m.P.route[m.P.reached];
  return m.nodes.map(nd => {
    const on = nd.key === sel, glyph = nd.state === 'unknown' ? GLYPH.unknown : nd.state === 'locked' ? GLYPH.lock
      : GLYPH[m.act === 1 ? PLACE_ICON[Math.max(0, m.nodes.indexOf(nd))] : ACT_GLYPH[nd.id] || (nd.final ? 'crown' : 'tower')] || GLYPH.map;
    const r = nd.state === 'unknown' ? 15 : nd.final ? 26 : 23;
    return `<g class="wr-map-node st-${nd.state}${on ? ' sel' : ''}${nd.final ? ' final' : ''}" transform="translate(${nd.x} ${nd.y})" style="--ink:${ROAD_INK[nd.road] || '#e3cf9b'}">
      ${on ? `<circle r="${r + 11}" class="wr-map-halo"/>` : ''}
      <circle r="${r}" class="wr-map-disc"/>
      <g class="wr-map-glyph" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ${nd.state === 'unknown' ? 'transform="scale(.8)"' : ''}>${glyph}</g>
      ${nd.state === 'done' || nd.state === 'walked' ? `<g class="wr-map-check" transform="translate(${r - 6} ${-r + 6})"><circle r="9"/><path d="m-4 0 3 3 5-6" fill="none" stroke-width="2.4" stroke-linecap="round"/></g>` : ''}
      ${nd.id && nd.id === at ? '<g class="wr-map-me" transform="translate(0 -40)"><path d="M0 14 L-10 -2 A11 11 0 1 1 10 -2z"/><circle cy="-5" r="4.5"/></g>' : ''}
    </g>`;
  }).join('');
}
/** Where the Peddler's cart stands: just below-left or below-right of the hero's place (never on another place). */
function cartAt(m) {
  const at = m.P.route[m.P.reached], nd = m.nodes.find(x => x.id === at); if (!nd) return null;
  return { x: nd.x + (nd.x > 760 ? -86 : 86), y: nd.y + (nd.y > 470 ? -46 : 40) };
}
const CART = '<path d="M-24 -6h40l-6 14h-30z" fill="#8a5a32" stroke="#2e2b28" stroke-width="3" stroke-linejoin="round"/><path d="M-22 -6c4-18 32-18 36 0" fill="#c9a24a" stroke="#2e2b28" stroke-width="3"/><circle cx="-14" cy="12" r="6" fill="#3a2e24" stroke="#2e2b28" stroke-width="2"/><circle cx="8" cy="12" r="6" fill="#3a2e24" stroke="#2e2b28" stroke-width="2"/>';
function mapSvg(m, sel) {
  const c = cartAt(m);
  return `<svg class="wr-map-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>${DEFS}</defs>
    ${m.act === 1 ? art1() : artFork(m)}
    ${nodesSvg(m, sel)}
    ${c ? `<g class="wr-map-cart" transform="translate(${c.x} ${c.y})">${CART}</g>` : ''}
  </svg>`;
}

// ------------------------------------------------------------------------------------------------ the screen
const ACT_LINE = { 2: 'the end of Act I', 3: 'the end of Act II' };

export function mapScreen(app, opts = {}) {
  const { data } = app;
  const lead = app.hero(opts.heroId || app.party?.[0]?.heroId || app.save.lastHero);
  if (!lead) { app.go('title'); return; }
  const chapters = data.chapters.chapters, byId = id => chapters.find(c => c.id === id);
  app.save.lastHero = lead.id;
  const P0 = progressOf(data, lead.story);
  const st = { act: opts.act || actNow(data, lead.story), sel: P0.route[P0.reached], companion: !!app.companion };
  const party = () => (app.party || []).map(s => ({ ...s, hero: s.bot || app.hero(s.heroId) })).filter(s => s.hero);
  const acts = data.acts?.acts || [{ n: 1, name: 'Act I', title: 'The Wyrmroad' }];
  const allEndings = Object.keys(data.acts?.endings || {});

  app.ui.innerHTML = `<section class="wr-screen wr-map">
    <header class="wr-bar"><button type="button" class="wr-icon-btn" data-back aria-label="Back">${icon('back')}</button>
      <h2>The Wyrmroad</h2><div class="wr-grow"></div>
      <div class="wr-gold-pill">${icon('gold')}<b data-gold></b></div>
      <button type="button" class="wr-icon-btn" data-act="menu" aria-label="Menu">${icon('menu')}</button></header>
    <div class="wr-act-row"><div class="wr-act-tabs" role="tablist" aria-label="Acts"></div>
      ${allEndings.length ? '<p class="wr-endings-found" aria-live="polite"></p>' : ''}</div>
    <div class="wr-map-body">
      <div class="wr-map-frame"><div class="wr-map-box"><div class="wr-map-art"></div><div class="wr-map-hits"></div></div></div>
      <aside class="wr-map-panel" aria-live="polite"></aside>
    </div>
    <footer class="wr-map-foot">
      <button type="button" class="wr-btn" data-act="bag">${icon('bag')}<span>Bag</span></button>
      <button type="button" class="wr-btn" data-act="spells">${icon('book')}<span>Spells</span></button>
      <button type="button" class="wr-btn" data-act="peddler">${icon('shop')}<span>Peddler</span></button>
    </footer>
  </section>`;
  const root = app.ui.firstElementChild;
  // The drawing keeps its shape inside whatever box the layout gives the frame; the place buttons live in a box of
  // EXACTLY the drawing's size and spot (#98: on wide, short windows the drawing sat letterboxed in the middle of the
  // frame while the buttons were spread over the whole frame — up to 90 px off). tests/ui/layout-browser.mjs checks it.
  const frame = root.querySelector('.wr-map-frame'), mbox = root.querySelector('.wr-map-box');
  function fit() {
    const fw = frame.clientWidth, fh = frame.clientHeight; if (!fw || !fh) return;
    const k = Math.min(fw / W, fh / H), w = Math.floor(W * k), h = Math.floor(H * k);
    Object.assign(mbox.style, { width: `${w}px`, height: `${h}px`, left: `${Math.floor((fw - w) / 2)}px`, top: `${Math.floor((fh - h) / 2)}px` });
  }
  const ro = new ResizeObserver(fit); ro.observe(frame);

  let model = null;
  const actKnown = a => a === 1 || (a === 2 ? !!lead.story.choices?.act1 || chapters.some(c => c.act === 2 && lead.story.done.includes(c.id))
    : !!lead.story.choices?.act2 || chapters.some(c => c.act === 3 && lead.story.done.includes(c.id)));
  function tabs() {
    root.querySelector('.wr-act-tabs').innerHTML = acts.map(A => {
      const known = actKnown(A.n), road = typeof A.title === 'string' ? A.title : known ? A.title[A.n === 2 ? lead.story.choices?.act1 : `${lead.story.choices?.act1}.${lead.story.choices?.act2}`] || 'Many roads' : 'Not walked yet';
      return `<button type="button" role="tab" class="wr-act-tab${A.n === st.act ? ' on' : ''}${known ? '' : ' wr-act-dim'}" data-actn="${A.n}" aria-selected="${A.n === st.act}"><b>${esc(A.name)}</b><small>${esc(road)}</small></button>`;
    }).join('');
    const ef = root.querySelector('.wr-endings-found');
    if (ef) ef.innerHTML = `${icon('star')}<span>Endings found <b>${n((lead.story.endings || []).length)}</b> of ${n(allEndings.length)}</span>`;
  }
  function draw() {
    model = layout(data, lead.story, st.act);
    model.endings = lead.story.endings || [];
    if (!model.nodes.some(nd => nd.key === st.sel)) st.sel = (model.nodes.find(nd => nd.state === 'current') || model.nodes.find(nd => !nd.start) || model.nodes[0]).key;
    root.querySelector('[data-gold]').textContent = n(lead.gold);
    root.querySelector('.wr-map-art').innerHTML = mapSvg(model, st.sel);
    const c = cartAt(model);
    root.querySelector('.wr-map-hits').innerHTML = model.nodes.map(nd => {
      const name = nd.id ? byId(nd.id)?.name : null;
      return `<button type="button" class="wr-map-hit${nd.key === st.sel ? ' on' : ''}${nd.id ? '' : ' wr-map-hit-other'}" data-ch="${esc(nd.key)}" style="left:${nd.x / W * 100}%;top:${nd.y / H * 100}%" aria-label="${esc(name || 'Another road')}${nd.state === 'locked' ? ' (locked)' : ''}"><span>${esc(name || 'Another road')}</span></button>`;
    }).join('') + (c ? `<button type="button" class="wr-map-hit wr-map-hit-cart" data-act="peddler" style="left:${c.x / W * 100}%;top:${c.y / H * 100}%" aria-label="The Peddler"><span>Peddler</span></button>` : '');
    tabs(); panel();
  }
  function panel() {
    const nd = model.nodes.find(x => x.key === st.sel), box = root.querySelector('.wr-map-panel');
    if (!nd) { box.innerHTML = ''; return; }
    if (!nd.id) {
      box.innerHTML = `<p class="wr-kicker">${esc(acts[model.act - 1]?.name || '')} · another road</p><h3>Another road</h3>
        <p class="wr-sub">A road you have not walked.</p>
        <p class="wr-locked">${icon('swap')}<span>Choose differently at ${esc(ACT_LINE[nd.start ? model.act - 1 : model.act] || 'a fork')} to walk it.</span></p>`;
      return;
    }
    const c = byId(nd.id), i = chapters.indexOf(c), isDone = lead.story.done.includes(c.id), best = lead.best?.[c.id];
    const locked = nd.state === 'locked', other = nd.state === 'walked';
    const low = lead.level < c.level, ps = party(), solo = ps.filter(s => !s.bot).length === 1;
    const comp = solo && st.companion ? companionFor(data, lead, i, app.save.heroes.length) : null;
    const prev = model.P.route[model.P.route.indexOf(c.id) - 1], E = c.ending && lead.story.endings?.includes(c.ending) ? endingOf(data, c.ending) : null;
    box.innerHTML = `
      <p class="wr-kicker">${esc(placeLine(data, c.id))}</p>
      <h3>${esc(c.name)}</h3><p class="wr-sub">${esc(c.sub || '')}</p>
      <ul class="wr-facts">
        <li class="${low ? 'wr-warn' : ''}">${icon('star')}<span>Suggested level ${n(c.level)}${low ? ` · you are ${n(lead.level)}` : ''}</span></li>
        <li>${icon('clock')}<span>${best ? `Best time ${timeText(best)}` : 'No best time yet'}</span></li>
        ${isDone ? `<li class="wr-good">${icon('check')}<span>Cleared</span></li>` : ''}
        ${c.ally && solo ? `<li>${icon('people')}<span>Grell fights beside a lone hero here</span></li>` : ''}
        ${c.sky ? `<li>${icon('breaker')}<span>Ossmara breathes fire on your foes from the sky</span></li>` : ''}
        ${E ? `<li class="wr-ending">${icon('star')}<span>Ending found: ${esc(E.name)}</span></li>` : ''}
      </ul>
      <div class="wr-party">${ps.map((s, k) => `<span class="wr-chip" style="--pc:${s.color || COLORS[k]}">${esc(s.hero.name)} · level ${n(s.hero.level)} ${esc(CLASS_NAMES[s.hero.cls])}</span>`).join('')}
        ${comp ? `<span class="wr-chip wr-chip-bot">${esc(comp.name)} · level ${n(comp.level)} ${esc(CLASS_NAMES[comp.cls])} (companion)</span>` : ''}</div>
      ${other ? `<p class="wr-road-other">${icon('swap')}<span>A road you walked before. Setting off here puts you back on it: ${esc(chapterPlace(data, c.id).road)}.</span></p>` : ''}
      ${locked ? `<p class="wr-locked">${icon('lock')}<span>Clear ${esc(byId(prev)?.name || 'the chapter before')} to open this road.</span></p>` : `
        ${solo ? `<button type="button" class="wr-btn wr-toggle-btn${st.companion ? ' on' : ''}" data-act="companion" aria-pressed="${st.companion}">${icon('people')}<span>Bring a companion</span><i class="wr-switch"></i></button>` : ''}
        <button type="button" class="wr-btn wr-big wr-primary" data-act="start">${icon('play')}<span><b>${isDone ? 'Play again' : 'Set off'}</b><small>${esc(c.name)}</small></span></button>
        ${isDone ? `<button type="button" class="wr-btn wr-ghost" data-act="story">${icon('scroll')}<span>Hear the story again</span></button>` : ''}`}`;
  }
  function start() {
    const c = byId(st.sel); if (!c) return;
    const slots = (app.party || []).filter(s => !s.bot);
    const playParty = [...slots];
    if (slots.length === 1 && st.companion) playParty.push({ pid: 'bot', device: 'bot', color: COLORS[1], bot: companionFor(data, lead, chapters.indexOf(c), app.save.heroes.length) });
    const play = () => app.go('play', { chapter: c.id, party: playParty, leadId: lead.id });
    if (!lead.story.done.includes(c.id)) app.go('story', { scene: c.intro, chapter: c.id, heroId: lead.id, then: play });
    else play();
  }
  function pickAct(a) { if (a === st.act) return; st.act = a; st.sel = null; app.audio.play('ui.tab'); draw(); const sel = model.nodes.find(nd => nd.key === st.sel); if (sel?.id) app.view.setChapter(sel.id); root.querySelector(`[data-actn="${a}"]`)?.focus({ preventScroll: true }); }
  root.addEventListener('click', async e => {
    const t = e.target.closest('[data-actn]'); if (t) return pickAct(+t.dataset.actn);
    const ch = e.target.closest('[data-ch]');
    if (ch) {
      st.sel = ch.dataset.ch; app.audio.play('ui.click'); draw();
      root.querySelector(`[data-ch="${CSS.escape(st.sel)}"]`)?.focus({ preventScroll: true });
      const nd = model.nodes.find(x => x.key === st.sel); if (nd?.id) app.view.setChapter(nd.id);
      return;
    }
    const b = e.target.closest('[data-act], [data-back]'); if (!b) return;
    app.audio.play('ui.click');
    if (b.hasAttribute('data-back')) return app.go(app.save.heroes.length > 1 ? 'heroes' : 'title');
    switch (b.dataset.act) {
      case 'menu': app.openMenu(); break;
      case 'start': start(); break;
      case 'companion': st.companion = app.companion = !st.companion; panel(); root.querySelector('[data-act="companion"]')?.focus({ preventScroll: true }); break;
      case 'story': { const c = byId(st.sel); app.go('story', { scene: c.intro, chapter: c.id, heroId: lead.id, then: () => app.go('map', { heroId: lead.id, act: st.act }) }); break; }
      case 'peddler': openPeddler(app, lead, { onChange: draw }); break;
      case 'bag': (await import('./inventory.js')).openInventory(app, lead, { onChange: draw }); break;
      case 'spells': (await import('./spells.js')).openSpells(app, lead); break;
    }
  });
  draw();
  { const nd = model.nodes.find(x => x.key === st.sel); app.view.setChapter(nd?.id || 'millbrook'); }
  app.view.scenic(true);
  app.audio.ambience(null);
  setTimeout(() => root.querySelector('[data-act="start"]')?.focus({ preventScroll: true }), 40);
  fit();
  app.mapState = () => ({ act: st.act, sel: st.sel, nodes: model.nodes.map(({ key, id, state, x, y }) => ({ key, id, state, x, y })) });   // game-eye + tests
  return () => { ro.disconnect(); app.mapState = null; };
}
