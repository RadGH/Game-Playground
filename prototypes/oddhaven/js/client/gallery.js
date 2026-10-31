// The start screen's households: a face per person, one sentence each, one tap to start.
import { el } from './shell.js';
import { RACE_NAMES } from './mood.js';

export function createGallery({ households, portrait, onPick }) {
  const box = el('div', { class: 'od-gallery' });
  for (const h of households) {
    const faces = el('div', { class: 'od-faces' });
    for (let m = 0; m < h.members.length; m++) {
      const r = h.members[m];
      faces.append(el('figure', {}, el('img', { alt: '', loading: 'lazy', src: portrait(h, m) }), el('figcaption', { text: r.given })));
    }
    const races = [...new Set(h.members.map(r => RACE_NAMES[r.race]))].join(', ');
    box.append(el('button', { type: 'button', class: 'od-card', 'data-id': h.id, on: { click: () => onPick(h) } }, el('h3', { text: h.name }), faces, el('p', { text: h.story }), el('small', { text: `${h.members.length === 1 ? 'One person' : `${h.members.length} people`} · ${races}` })));
  }
  return box;
}
