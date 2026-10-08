// W9 professions — ten small line icons (24 × 24, drawn here: no icon font, no image file) and each craft's colour.
//   profIcon('mining') -> <svg class="prof-svg" …>      PROF_TINT.mining -> '#c9824a'
const NS = 'http://www.w3.org/2000/svg';
export const PROF_TINT = { mining: '#c9824a', logging: '#7fb069', foraging: '#c58bff', skinning: '#d9a066', angling: '#6ab8e0', smithing: '#ff9a4a', outfitting: '#e58fb0', alchemy: '#58c0a0', cooking: '#f0c060', tempering: '#7fd0ff' };
export const PROF_NAME = { mining: 'Mining', logging: 'Logging', foraging: 'Foraging', skinning: 'Skinning', angling: 'Angling', smithing: 'Smithing', outfitting: 'Outfitting', alchemy: 'Alchemy', cooking: 'Cooking', tempering: 'Tempering' };
const PATHS = {
  mining: ['M4 9c5-5 11-5 16 0', 'M12 6.2 5 20', 'M10.4 7.2l3 1.2'],                                   // a pick: curved head, haft
  logging: ['M6 20 15 7', 'M13 4.5c3 0 5.5 2 6 5l-4.5 1.2-3-4z'],                                       // a hatchet
  foraging: ['M12 21V11', 'M12 14c-4 0-6-2.5-6-6 4 0 6 2.5 6 6z', 'M12 11c0-3.5 2-6 6-6 0 3.5-2 6-6 6z'], // two leaves on a stem
  skinning: ['M5 19 9 15', 'M9 15 18 4c1.5 3 .5 7-3 10l-4 3z'],                                         // a curved knife
  angling: ['M5 20V5c0-2 6-2 6 1', 'M11 6v8', 'M11 14c0 3 5 3 5 0', 'M16 14l-1.5-1.5'],                 // a rod and hook
  smithing: ['M3 9h13c2 0 4 1 5 2h-5v2H9v2l2 3H5l2-3v-2c-2.5 0-4-1.5-4-4z'],                            // an anvil
  outfitting: ['M5 19 18 6', 'M18 6l1.5-1.5', 'M16.5 4.5a1.3 1.3 0 102.6 2.6', 'M5 19c-1-4 3-5 5-3s5 1 6-2'], // needle and thread
  alchemy: ['M9.5 3h5', 'M10.5 3v6L5.5 18a2 2 0 001.8 3h9.4a2 2 0 001.8-3l-5-9V3', 'M8 15h8'],          // a flask
  cooking: ['M4 11h16', 'M5 11c0 5 3 8 7 8s7-3 7-8', 'M9 7c0-1.5 1.5-1.5 1.5-3', 'M13.5 7c0-1.5 1.5-1.5 1.5-3'], // a pot with steam
  tempering: ['M12 3 9.5 9.5 3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5z'],                              // a struck spark
};
export function profIcon(id, size = 22) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('class', 'prof-svg'); svg.setAttribute('aria-hidden', 'true');
  svg.style.color = PROF_TINT[id] || '#d9b26a';
  for (const d of PATHS[id] || PATHS.tempering) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.9'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); svg.appendChild(p); }
  return svg;
}
