// The Game Icons page: every non-spell picture in the library, by set, with a search.
import { UI_ICONS, ITEM_ART, MOTIFS, CLASS_MOTIFS, uiIconSvg, itemIconSvg, motifSvg, classPalette } from './game-icons.js';
import goods from '../data/game/items-goods.js';
import materials from '../data/game/items-materials.js';
import fish from '../data/game/items-fish.js';

const SETS = [
  { id: 'ui', label: 'Buttons & menus', rows: Object.entries(UI_ICONS), draw: id => uiIconSvg(id, 28, { medallion: true }) + uiIconSvg(id, 56), bg: 'slot' },
  { id: 'goods', label: 'Potions, food & goods', rows: Object.entries(goods), draw: id => itemIconSvg(id, 64) + itemIconSvg(id, 40), bg: 'slot' },
  { id: 'materials', label: 'Materials', rows: Object.entries(materials), draw: id => itemIconSvg(id, 64) + itemIconSvg(id, 40), bg: 'slot' },
  { id: 'fish', label: 'Fish', rows: Object.entries(fish), draw: id => itemIconSvg(id, 64) + itemIconSvg(id, 40), bg: 'slot' },
  { id: 'motifs', label: 'Spell shapes by class', rows: Object.entries(MOTIFS), draw: id => tinted(id), bg: 'dark' },
];
/** A motif in its class's three colours, the way the game draws it (glowing). */
function tinted(id) {
  const p = classPalette(id.split('.')[0]) || { core: '#fff', glow: '#fff', accent: '#fff' };
  return [p.core, p.glow, p.accent].map(c => motifSvg(id, 48).replace('<svg ', `<svg style="filter: drop-shadow(0 0 4px ${c}) drop-shadow(0 0 8px ${c}); color:${c}" `).replace(/#fff(fff)?\b/gi, c)).join('');
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tabs = document.getElementById('tabs'), grid = document.getElementById('grid'), q = document.getElementById('q');
let cur = new URLSearchParams(location.search).get('set') || 'ui';
function draw() {
  const set = SETS.find(s => s.id === cur) || SETS[0];
  tabs.replaceChildren(...SETS.map(s => { const b = document.createElement('button'); b.type = 'button'; b.role = 'tab'; b.textContent = `${s.label} (${s.rows.length})`; b.setAttribute('aria-selected', String(s.id === set.id)); b.onclick = () => { cur = s.id; history.replaceState(null, '', '?set=' + s.id); draw(); }; return b; }));
  const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = set.rows.filter(([id, v]) => words.every(w => `${id} ${v.name} ${v.description}`.toLowerCase().includes(w)));
  grid.innerHTML = rows.map(([id, v]) => `<div class="gi-card"><div class="gi-pics ${set.bg}">${set.draw(id)}</div><b>${esc(v.name)}</b><small>${esc(id)}</small><p>${esc(v.description)}</p></div>`).join('');
}
const all = Object.keys(UI_ICONS).length + Object.keys(ITEM_ART).length + Object.keys(MOTIFS).length;
document.getElementById('total').textContent = `${all} pictures · ${Object.keys(CLASS_MOTIFS).length} classes`;
q.addEventListener('input', draw);
draw();
