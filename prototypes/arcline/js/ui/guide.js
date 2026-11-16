// "Getting started": a small card of first steps that tick themselves off from the city's real state (no manual in a
// menu — lessons rule 6). Collapses to one line; hides for good when every step is done or the player closes it.
import { $, el, btn } from './dom.js';
import { census } from '../sim/city.js';

const STEPS = [
  { id: 'road', text: 'Lay a street from the Colony Core', done: r => r.tiles.road.some(Boolean) },
  { id: 'homes', text: 'Zone homes beside the street', done: r => r.tiles.zone.some(z => z === 1) },
  { id: 'settled', text: 'Settlers move into the first homes', done: r => r.people.total > 0 },
  { id: 'water', text: 'Build a Water Pump by water and run pipes', done: r => r.lots.some(l => (l.water ?? 0) > 0) && r.tiles.pipe.some(Boolean) },
  { id: 'work', text: 'Zone shops and industry for jobs', done: r => census(r).jobs > 10 },
  { id: 'wall', text: 'Wall off the side the creatures come from', done: r => r.tiles.wall.some(Boolean) },
  { id: 'turret', text: 'Put a Pulse Gun behind the wall', done: r => r.turrets.length > 0 },
  { id: 'comms', text: 'Build a Comms Array to call passing ships', done: r => r.lots.some(l => l.id?.startsWith('col-comms')) },
];

export function updateGuide(app) {
  const r = app.r; if (!r || !r.founded) return;
  let card = $('#guide');
  const closed = (() => { try { return localStorage.getItem('arcline.guide.closed') === '1'; } catch { return false; } })();
  const states = STEPS.map(s => ({ ...s, ok: !!s.done(r) }));
  if (closed || states.every(s => s.ok)) { card?.remove(); return; }
  if (!card) {
    card = el('aside', { id: 'guide', class: 'ac-guide', 'aria-label': 'Getting started' });
    $('#city .hud')?.append(card);
  }
  const open = card.dataset.open !== '0';
  const next = states.find(s => !s.ok);
  const left = states.filter(s => !s.ok).length;
  card.replaceChildren(...[
    el('header', {}, el('b', {}, 'Getting started'), el('span', { class: 'dim' }, `${STEPS.length - left} of ${STEPS.length}`),
      btn(open ? 'Hide' : 'Show', () => { card.dataset.open = open ? '0' : '1'; updateGuide(app); }, 'small'),
      btn('Close', () => { try { localStorage.setItem('arcline.guide.closed', '1'); } catch { /* private window */ } card.remove(); }, 'small')),
    open ? el('ol', {}, ...states.map(s => el('li', { class: s.ok ? 'ok' : s === next ? 'next' : '' }, s.text))) : null,
    el('p', { class: 'dim nextline' }, `Next: ${next.text}`),
  ].filter(Boolean));   // a null would print as the word "null"
}
