// The star map (PLAN §0 #1): every star you have seen, the lanes between them, danger by colour,
// who holds each system, rumours of roaming giants, your mining claims. Pick a linked star and jump.

import { panel, el, btn, toast, fmt } from './dom.js';
import { FACTIONS } from '../data/factions.js';
import { STAR_KINDS, traitWords, warpCore, canWarpTo, coreFor } from '../sim/galaxy.js';

const tierColor = t => t >= 8 ? '#ff3b5c' : t >= 6 ? '#ff7a3a' : t >= 4 ? '#ffc45a' : t >= 2 ? '#9fe870' : '#5fd8ff';

export function openGalaxy(app) {
  const G = app.G; const gal = app.galaxy; const here = gal.systems[G.system];
  const range = Math.max(1, app.P?.stats.jump || 1);
  const reach = jumpReach(gal, G.system, range);
  let sel = null;
  const wasMode = app.mode; if (app.mode === 'fly') app.mode = 'paused';
  const p = panel('Star map', () => { if (app.mode === 'paused') app.mode = 'fly'; });
  const cv = el('canvas', { style: 'width:100%;height:100%;display:block;touch-action:none' });
  const info = el('div', { class: 'card', style: 'position:absolute;right:10px;bottom:10px;width:min(320px,calc(100% - 20px));max-height:46%;overflow:auto' });
  const legend = el('div', { class: 'hint', style: 'position:absolute;left:12px;bottom:10px;max-width:46%' },
    el('div', {}, 'Colour = danger. Further in = tougher enemies, better loot and shops.'),
    el('div', {}, `Your jump range: ${range} lane${range > 1 ? 's' : ''}${range < 2 ? ' (fit a jump drive for 2)' : ''}.`),
    el('div', {}, `${warpCore(G).name}: reaches danger ${warpCore(G).reach}. 🔒 = needs a better warp core (outfitters).`));
  p.body.style.position = 'relative'; p.body.style.padding = '0'; p.body.append(cv, info, legend);
  // phones: the key sits behind a button so it never covers the star card
  const narrow = innerWidth < 640; if (narrow) { legend.classList.add('gx-key', 'hidden'); legend.style.cssText = ''; }
  let view = { x: here.x, y: here.y, k: 1.0 };
  const ctx = cv.getContext('2d');
  function size() { const r = cv.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; return d; }
  function draw() {
    const d = size(); const W = cv.width, H = cv.height; const k = view.k * Math.min(W, H) / 700;
    const X = x => (x - view.x) * k + W / 2, Y = y => (y - view.y) * k + H / 2;
    ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, W, H);
    // faint spiral glow
    const gr = ctx.createRadialGradient(X(0), Y(0), 0, X(0), Y(0), 520 * k); gr.addColorStop(0, 'rgba(160,120,255,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    const seen = new Set(G.seenSystems);
    // lanes
    ctx.lineWidth = 1.2 * d;
    for (const s of gal.systems) for (const l of s.links) if (l > s.id && seen.has(s.id) && seen.has(l)) {
      const o = gal.systems[l]; const inReach = ((s.id === G.system && reach.has(l)) || (l === G.system && reach.has(s.id))) && canWarpTo(G, s.id === G.system ? o : s);
      ctx.strokeStyle = inReach ? 'rgba(95,216,255,0.7)' : 'rgba(120,140,180,0.25)'; ctx.beginPath(); ctx.moveTo(X(s.x), Y(s.y)); ctx.lineTo(X(o.x), Y(o.y)); ctx.stroke();
    }
    for (const s of gal.systems) {
      const known = seen.has(s.id); const visited = G.visited.includes(s.id);
      const x = X(s.x), y = Y(s.y); const r = (s.id === G.system ? 9 : 6) * d;
      if (!known) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(x, y, 2 * d, 0, 7); ctx.fill(); continue; }
      const col = tierColor(s.tier);
      ctx.fillStyle = STAR_KINDS[s.star].color; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 7); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2 * d; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
      const locked = !canWarpTo(G, s);
      if (locked) { ctx.fillStyle = 'rgba(4,5,12,0.55)'; ctx.beginPath(); ctx.arc(x, y, r + 1 * d, 0, 7); ctx.fill(); ctx.font = `${10 * d}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#ff9a6a'; ctx.fillText('🔒', x + r + 6 * d, y + 4 * d); }
      if (reach.has(s.id) && !locked) { ctx.strokeStyle = 'rgba(95,216,255,0.6)'; ctx.setLineDash([4 * d, 3 * d]); ctx.beginPath(); ctx.arc(x, y, r + 5 * d, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      if (s === sel) { ctx.strokeStyle = '#ffc45a'; ctx.lineWidth = 3 * d; ctx.beginPath(); ctx.arc(x, y, r + 9 * d, 0, 7); ctx.stroke(); }
      if (s.id === G.system) { ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.moveTo(x, y - r - 12 * d); ctx.lineTo(x - 5 * d, y - r - 20 * d); ctx.lineTo(x + 5 * d, y - r - 20 * d); ctx.fill(); }
      // markers: station, claim, boss rumour
      ctx.font = `${11 * d}px Rajdhani, sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = visited ? '#dfe8f6' : '#8c9ab4'; ctx.fillText(s.name, x, y + r + 13 * d);
      const icons = [];
      if (s.station === 'trade') icons.push(['◆', '#5fd8ff']); if (s.station === 'pirate') icons.push(['◆', '#ff5a4a']);
      if (G.claims.some(c => c.system === s.id)) icons.push(['⛏', '#5fff9a']);
      if (G.bosses.some(b => b.alive && b.system === s.id) && (visited || reach.has(s.id) || s.tier <= G.stats.maxTier + 2)) icons.push(['☠', '#ff3b5c']);
      if (G.bounties?.some(b => !b.done && b.system === s.id)) icons.push(['✚', '#ffc45a']);
      icons.forEach(([ch, c], i) => { ctx.fillStyle = c; ctx.fillText(ch, x + (i - (icons.length - 1) / 2) * 12 * d, y - r - 4 * d); });
    }
    cv._X = X; cv._Y = Y;
  }
  function showInfo(s) {
    info.innerHTML = '';
    if (!s) { info.append(el('b', {}, here.name), el('div', { class: 'hint' }, 'Tap a star to see what is there.'), el('div', { class: 'hint' }, `${warpCore(G).name}: reaches danger ${warpCore(G).reach}.`)); return; }
    const F = FACTIONS[s.owner]; const rep = G.rep[s.owner] ?? 0;
    const boss = G.bosses.find(b => b.alive && b.system === s.id);
    info.append(
      el('h3', { style: `color:${tierColor(s.tier)}` }, `${s.name}`),
      el('div', {}, `Danger ${s.tier} · ${F.name}`, el('span', { class: rep < 0 ? 'bad' : 'good' }, ` (you: ${rep})`)),
      el('div', { class: 'hint' }, s.station === 'trade' ? `Station: ${s.shops.length} services` : s.station === 'pirate' ? 'Corsair den (black market)' : s.station === 'hive' ? 'Alien hive — no docking' : 'No station'),
      el('div', { class: 'hint' }, `${s.planets} planet${s.planets > 1 ? 's' : ''}, ${s.belts} asteroid belt${s.belts > 1 ? 's' : ''}${s.features.includes('derelict') ? ', a derelict' : ''}${s.features.includes('beacon') ? ', a distress signal' : ''}${s.features.includes('pirateBase') ? ', an enemy stronghold' : ''}${s.features.includes('claimable') ? ', a rich field' : ''}`),
      boss ? el('div', { class: 'bad' }, `Rumour: ${boss.name} (${boss.cls}) is here.`) : '',
    );
    if (s.traits) {
      const t = traitWords(s.traits);
      const row = (k, v, cls = '') => el('div', { class: 'trait ' + cls }, el('span', { class: 'hint' }, k + ' '), v);
      info.append(el('div', { class: 'traits' },
        row('Enemies:', t.enemies, s.traits.enemies >= 1.25 ? 'bad' : s.traits.enemies <= 0.85 ? 'good' : ''),
        row('Finds:', t.luck, s.traits.luck > 0 ? 'good' : ''),
        row('Mining:', t.ore, s.traits.ore >= 1.25 ? 'good' : ''),
        row('Size:', t.size),
        t.econ ? row('Economy:', t.econ) : ''));
    }
    if (s.id === G.system) info.append(el('div', { class: 'amber' }, 'You are here.'));
    else if (!canWarpTo(G, s)) info.append(el('div', { class: 'bad' }, `🔒 Too dangerous for your ${warpCore(G).name}. You need a ${coreFor(s.tier).name} (outfitters sell upgrades).`));
    else if (reach.has(s.id)) {
      const warn = s.tier > G.stats.maxTier + 1 ? el('div', { class: 'bad' }, 'Much more dangerous than anywhere you have been.') : '';
      info.append(warn, btn(`Jump to ${s.name}`, () => {
        if (wasMode !== 'fly') { toast('Undock first.'); return; }
        app.mode = 'fly';
        if (app.w.t - app.combatOK() < 3) { toast('Your jump drive will not charge under fire.', 'bad'); return; }
        p.close(); app.startJump(s.id);
      }, 'primary big'));
    } else info.append(el('div', { class: 'hint' }, `${hops(gal, G.system, s.id)} jumps away. Your range is ${range}.`));
  }
  showInfo(null); requestAnimationFrame(draw);
  // pan / zoom / pick
  let drag = null, moved = 0;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = 0; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!drag) return; const d = Math.min(2, devicePixelRatio || 1); const k = view.k * Math.min(cv.width, cv.height) / 700 / d; moved += Math.abs(e.movementX) + Math.abs(e.movementY); view.x = drag.vx - (e.clientX - drag.x) / k; view.y = drag.vy - (e.clientY - drag.y) / k; draw(); });
  cv.addEventListener('pointerup', e => {
    const was = drag; drag = null; if (!was || moved > 8) return;
    const r = cv.getBoundingClientRect(); const d = cv.width / r.width; const mx = (e.clientX - r.left) * d, my = (e.clientY - r.top) * d;
    let best = null, bd = 30 * d;
    for (const s of gal.systems) { if (!G.seenSystems.includes(s.id)) continue; const dd = Math.hypot(cv._X(s.x) - mx, cv._Y(s.y) - my); if (dd < bd) { bd = dd; best = s; } }
    sel = best; showInfo(best); draw();
  });
  cv.addEventListener('wheel', e => { view.k = Math.max(0.4, Math.min(5, view.k * (e.deltaY > 0 ? 0.88 : 1.13))); draw(); e.preventDefault(); }, { passive: false });
  const zoomRow = el('div', { class: 'row', style: 'position:absolute;left:10px;top:10px' }, btn('+', () => { view.k = Math.min(5, view.k * 1.25); draw(); }, 'small'), btn('−', () => { view.k = Math.max(0.4, view.k / 1.25); draw(); }, 'small'), btn('Here', () => { view.x = here.x; view.y = here.y; draw(); }, 'small'),
    narrow ? btn('Key', () => legend.classList.toggle('hidden'), 'small') : '',
    btn('Local map', () => { p.close(); app.openLocal?.(); }, 'small'));
  p.body.append(zoomRow);
  addEventListener('resize', draw);
}

function jumpReach(gal, from, range) {
  const out = new Set(); let frontier = [from]; const seen = new Set([from]);
  for (let i = 0; i < range; i++) { const next = []; for (const id of frontier) for (const l of gal.systems[id].links) if (!seen.has(l)) { seen.add(l); out.add(l); next.push(l); } frontier = next; }
  return out;
}
function hops(gal, a, b) {
  const dist = new Map([[a, 0]]); const q = [a];
  while (q.length) { const c = q.shift(); if (c === b) return dist.get(c); for (const l of gal.systems[c].links) if (!dist.has(l)) { dist.set(l, dist.get(c) + 1); q.push(l); } }
  return '?';
}
void fmt;
