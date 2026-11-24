// One icon style for the whole game (lessons rule 17): the playground's Codex-drawn SVG sets — button/menu icons
// (icons/data/game/ui.js) and the spell medallions (icons/js/catalog.js, 192 spells by id). An Oathwild spell that is
// not in the catalog gets its class's motif on the same medallion. A few small line glyphs (close, arrows, coin)
// are drawn here in the same weight.
import { uiIconSvg, motifSvg, CLASS_MOTIFS } from '../../../../../icons/js/game-icons.js';
import { iconSvg } from '../../../../../icons/js/catalog.js';

const LINE = {
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  coin: '<circle cx="12" cy="12" r="7.5"/><path d="M12 8.5v7M9.8 10.2c0-1 1-1.7 2.2-1.7s2.2.6 2.2 1.5-1 1.3-2.2 1.6-2.2.7-2.2 1.6 1 1.6 2.2 1.6 2.2-.7 2.2-1.7"/>',
  weight: '<path d="M8 9h8l2.5 10h-13z"/><circle cx="12" cy="6.5" r="2"/>',
  star: '<path d="M12 4l2.4 5 5.4.7-4 3.7 1 5.4L12 16.3 7.2 18.8l1-5.4-4-3.7 5.4-.7z"/>',
  level: '<path d="M12 4l6 6h-4v8h-4v-8H6z"/>',
  shrine: '<path d="M5 19h14M7 19V11M17 19V11M5 11l7-6 7 6M10 19v-4h4v4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  refresh: '<path d="M18 9a7 7 0 1 0 1 5M18 4v5h-5"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3.5 19c.5-3.5 2.8-5.5 5.5-5.5s5 2 5.5 5.5M14.5 14c2.6-.4 5 1.3 5.5 5"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16"/>',
  lockOpen: '<rect x="6" y="11" width="12" height="8" rx="1.5"/><path d="M9 11V8a3 3 0 0 1 6 0"/>',
  thumbUp: '<path d="M8 11v8H5v-8zM8 11l3.5-6.5c1.3 0 2 .8 2 2V10h4.3a1.6 1.6 0 0 1 1.6 1.9l-1.2 5.6a2 2 0 0 1-2 1.5H8"/>',
  thumbDown: '<path d="M8 13V5H5v8zM8 13l3.5 6.5c1.3 0 2-.8 2-2V14h4.3a1.6 1.6 0 0 0 1.6-1.9l-1.2-5.6a2 2 0 0 0-2-1.5H8"/>',
  news: '<path d="M5 6h11v12H6a1 1 0 0 1-1-1zM16 9h3v8a1 1 0 0 1-1 1h-2M8 9h5M8 12h5M8 15h3"/>',
  scroll: '<path d="M7 5h10v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-1h10"/><path d="M9 9h5M9 12h5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6"/>',
  pad: '<rect x="3.5" y="8" width="17" height="9" rx="4.5"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="15.5" cy="11.5" r=".8"/><circle cx="17" cy="13.5" r=".8"/>',
  keyboard: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M6.5 10h1M9.5 10h1M12.5 10h1M15.5 10h1M7 14h10"/>',
  sound: '<path d="M5 10h3l4-3.5v11L8 14H5zM15.5 9.5a3.5 3.5 0 0 1 0 5M17.5 7.5a6.5 6.5 0 0 1 0 9"/>',
  eye: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/>',
  sword: '<path d="M14.5 4.5h5v5L10 19l-2-2zM6 15l3 3M5 20l2-2"/>',
  shield: '<path d="M12 4l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V7z"/>',
  enchant: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18 15l.8 2.2 2.2.8-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  hammer: '<path d="M13 6l5 5-2 2-5-5zM11 8L4 15l2 2 7-7"/>',
  horse: '<path d="M6 19v-5c0-3 2-6 5-7l2-3 1 3c2 1 4 3 4 6v1h-3l-1-2-2 1v6M10 19v-4"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8v.5"/>',
  door: '<path d="M6 20V5a1 1 0 0 1 1-1h8v16M4 20h16M12 12v.5"/>',
};

/** A small line glyph (24 viewBox, currentColor). */
export function glyph(id, size = 20) {
  const p = LINE[id];
  if (!p) return '';
  return `<svg class="ow-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

/** A button / menu picture from the shared Codex set, falling back to a line glyph. */
export function uiIcon(id, size = 24) {
  return uiIconSvg(id, size, { cls: 'ow-icon ow-uiico' }) || glyph(id, size) || '';
}

// spell picture: the shared catalog by spell id (most Oathwild spells reuse a Farhold / Thousandvale row and its id),
// else the source row it came from, else the class's motif on a medallion
const MOTIF_OF = { warrior: 'warrior', ranger: 'ranger', rogue: 'rogue', mage: 'mage', cleric: 'cleric', druid: 'druid', bard: 'bard', shaman: 'shaman', paladin: 'paladin', spellblade: 'knight', warlock: 'warlock', wayfarer: 'ranger', pyromancer: 'pyromancer', stormcaller: 'stormcaller', necromancer: 'necromancer', witch_hunter: 'witch_hunter', duelist: 'swashbuckler', shadowdancer: 'shadow_dancer', spellfletcher: 'ranger', bladesworn: 'fighter', wrathborn: 'warrior', gravecutter: 'rogue', dragon_knight: 'dragon_knight', chronomancer: 'chronomancer', oracle: 'oracle', tinker: 'tinker', starcaller: 'starblade' };
const cache = new Map();
export function spellIcon(spellId, size = 40, { cls = null, from = null } = {}) {
  const k = `${spellId}|${size}|${cls}`;
  if (cache.has(k)) return cache.get(k);
  let svg = iconSvg(spellId, size) || (from && iconSvg(from, size));
  if (!svg) {
    const motifs = CLASS_MOTIFS[MOTIF_OF[cls] || 'mage'] || [];
    const pick = motifs.length ? motifs[[...String(spellId)].reduce((s, c) => s + c.charCodeAt(0), 0) % motifs.length] : null;
    const m = pick && motifSvg(pick, size);
    svg = m ? `<span class="ow-motif" style="width:${size}px;height:${size}px">${m}</span>` : `<span class="ow-motif ow-motif-blank" style="width:${size}px;height:${size}px"></span>`;   // lint-ok: size is a computed pixel number
  }
  cache.set(k, svg);
  return svg;
}
