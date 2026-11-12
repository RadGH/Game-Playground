// Galaxy events on the star map (PLAN §E1 E10 + E4 treasure systems): a coloured halo around every star an event
// touches, a strip of what is running (with timers), and a line on a star's card saying what the event gives.
// ui/galaxy.js calls these three. The events themselves come from sim/events.js.

import { el, btn } from './dom.js';
import { activeEvents, upcomingEvents, EVENT_KINDS, timeLeft } from '../sim/events.js';

/** Halos round the stars of every running event. X/Y map galaxy coords to the canvas; d = device pixel ratio. */
export function drawEventHalos(ctx, X, Y, d, app) {
  const G = app.G; const gal = app.galaxy; const t = G.playTime || 0;
  const seen = new Set(G.seenSystems);
  const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 400);
  for (const e of activeEvents(gal, t)) {
    const K = EVENT_KINDS[e.kind];
    for (const id of e.systems) {
      if (!seen.has(id)) continue;
      const s = gal.systems[id]; const x = X(s.x), y = Y(s.y);
      const r = (e.kind === 'treasure' ? 20 : 16) * d;
      const gr = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.6);
      gr.addColorStop(0, hexA(K.color, 0.35 * pulse)); gr.addColorStop(1, hexA(K.color, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, 7); ctx.fill();
      ctx.strokeStyle = hexA(K.color, 0.8); ctx.lineWidth = 1.5 * d; ctx.setLineDash(e.kind === 'treasure' ? [] : [3 * d, 3 * d]);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      if (id === e.center) { ctx.font = `600 ${10 * d}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = K.color; ctx.fillText(`${K.name} · ${timeLeft(e, t)}`, x, y + r + 26 * d); }
    }
  }
}

/** The lines for a star's info card (empty array when nothing is happening there). */
export function eventLines(app, s) {
  const G = app.G; const t = G.playTime || 0;
  return activeEvents(app.galaxy, t).filter(e => e.systems.includes(s.id)).map(e => {
    const K = EVENT_KINDS[e.kind];
    return el('div', { class: 'gx-event', style: `--k:${K.color}` }, el('b', {}, `${K.name} — ${timeLeft(e, t)} left`), el('span', {}, K.gives));
  });
}

/** A collapsible strip listing every event in the galaxy right now (and what starts soon). */
export function eventStrip(app, onPick) {
  const G = app.G; const gal = app.galaxy; const t = G.playTime || 0;
  const now = activeEvents(gal, t), soon = upcomingEvents(gal, t);
  const box = el('div', { class: 'gx-events' });
  const list = el('div', { class: 'gx-ev-list' });
  const head = btn(`Galaxy events (${now.length})`, () => box.classList.toggle('open'), 'small');
  box.append(head, list);
  if (!now.length && !soon.length) list.append(el('div', { class: 'hint' }, 'All quiet out there.'));
  for (const e of now) {
    const K = EVENT_KINDS[e.kind]; const c = gal.systems[e.center];
    const row = btn('', () => onPick?.(c), 'gx-ev');
    row.style.setProperty('--k', K.color);
    row.append(el('b', {}, K.name), el('span', {}, `${c.name}${e.systems.length > 1 ? ` and ${e.systems.length - 1} near it` : ''} · ${timeLeft(e, t)} left`), el('small', {}, K.gives));
    list.append(row);
  }
  for (const e of soon) { const K = EVENT_KINDS[e.kind]; list.append(el('div', { class: 'hint gx-ev-soon' }, `Soon: ${K.name} near ${gal.systems[e.center].name} (in ${Math.ceil((e.start - t) / 60)} min)`)); }
  if (innerWidth >= 640) box.classList.add('open');
  return box;
}

const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`; };
