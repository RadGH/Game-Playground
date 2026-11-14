// Gear pictures for the bag and the equipment slots (owner 2026-11-13: "all icons 1x1"). One drawn style with the skill
// medallions and the potion art: a warm metal silhouette with a dark outline on the item's rarity tile. Replaces the
// emoji glyphs the sheet used (lessons rule 17: one icon style per game). Pure strings, no DOM.
//   gearIcon(kind, size)   kind = a base's `kind` (sword, bow, …) or `slot` (head, chest, …); '' when unknown
const P = {
  sword: '<path d="M18.5 3.5 21 3l-.5 2.5-9 9-2-2z" class="m"/><path d="m7 13 4 4-1.5 1.5-1.2-1.2-2.6 2.6-1.6-1.6 2.6-2.6L5.5 14.5z" class="h"/>',
  dagger: '<path d="m17 5 2-.5-.5 2-6.5 6.5-1.5-1.5z" class="m"/><path d="m8.5 12.5 3 3-1.3 1.3-.9-.9-3 3-1.2-1.2 3-3-.9-.9z" class="h"/>',
  axe: '<path d="M7 20.5 17.5 6" class="s"/><path d="M14 3.5c3 0 6 2.5 6.5 6-1.8-.6-3.6-.4-5 .6L12 6.8c.8-1.4 1.6-2.6 2-3.3z" class="m"/>',
  mace: '<path d="M6.5 20 15 10" class="s"/><circle cx="16" cy="8" r="4" class="m"/><path d="M16 2.5v2M21.5 8h-2M16 13.5v-2M10.5 8h2M19.9 4.1l-1.4 1.4M19.9 11.9l-1.4-1.4M12.1 4.1l1.4 1.4" class="o"/>',
  sceptre: '<path d="M7 20 15 11" class="s"/><path d="M15 4.5l3 1.5 1.5 3-1.5 3-3 1.5-3-1.5-1.5-3 1.5-3z" class="m"/><circle cx="15" cy="9" r="1.6" class="g"/>',
  greatsword: '<path d="M20.5 2.5 21.5 3 21 5.5 10.5 16l-2.5-2.5z" class="m"/><path d="m5 12.5 6.5 6.5-1.6 1.6-1.4-1.4-3 3-1.7-1.7 3-3-1.4-1.4z" class="h"/>',
  greataxe: '<path d="M5 21.5 18 5" class="s"/><path d="M13.5 2c4.5.3 8 3.8 8.5 8.3-2-.4-4 0-5.6 1.2L11 6.2c1-1.6 1.9-3.2 2.5-4.2z" class="m"/><path d="M9.5 9.6 6.3 6.4c1-1.2 2.1-1.9 3.2-2.2l2.5 2.5z" class="m"/>',
  maul: '<path d="M6 21 15.5 10" class="s"/><path d="m12 5.5 5-5 6.5 6.5-5 5z" class="m"/>',
  spear: '<path d="M4 20 17 7" class="s"/><path d="M21.5 2.5 20 9l-2-2-2-2z" class="m"/>',
  polearm: '<path d="M4 20 17 7" class="s"/><path d="M21.5 2.5 20 9l-2-2-2-2z" class="m"/><path d="M15 9c-2.5-.5-4-2-4.5-4.5L13 7z" class="m"/>',
  bow: '<path d="M6 3c7 2 12 7 15 15" class="s" fill="none"/><path d="M6 3 21 18" class="o"/><path d="m16.5 12.5-9 9" class="o"/><path d="m7.5 21.5-.5-3.5 3.5.5z" class="m"/>',
  crossbow: '<path d="M12 4v16" class="s"/><path d="M4 9c3-2 13-2 16 0" class="s" fill="none"/><path d="M4 9 12 15l8-6" class="o"/><path d="m12 2 1.6 3h-3.2z" class="m"/>',
  staff: '<path d="M6 21 16 8" class="s"/><circle cx="17.5" cy="6" r="3.2" class="g"/><path d="M14 4.5c1-2.5 4-3 6-1.5" class="o"/>',
  wand: '<path d="M5 19 15 9" class="s"/><path d="m18 3 .9 2.1 2.1.9-2.1.9L18 9l-.9-2.1L15 6l2.1-.9z" class="g"/>',
  head: '<path d="M4.5 15c0-5 3.4-9.5 7.5-9.5s7.5 4.5 7.5 9.5v3h-4v-4.5h-7V18h-4z" class="m"/><path d="M12 5.5V3" class="o"/>',
  chest: '<path d="M8 3.5 12 5l4-1.5 4.5 3-1.5 4.5-1.5-.5V20.5h-11V10.5l-1.5.5-1.5-4.5z" class="m"/><path d="M12 5v15.5" class="o"/>',
  hands: '<path d="M7 21v-6.5L4.5 10l1.6-1 2.4 3V5.5a1.2 1.2 0 0 1 2.4 0V10V4.3a1.2 1.2 0 0 1 2.4 0V10V5a1.2 1.2 0 0 1 2.4 0v6l1.3-2.4a1.2 1.2 0 0 1 2 1.2L16.5 16v5z" class="m"/>',
  feet: '<path d="M7 3h6v10.5l6 2.5c1.5.6 2 1.6 2 3v1.5H5v-4.5l2-1.5z" class="m"/><path d="M5 17.5h16" class="o"/>',
  belt: '<rect x="2.5" y="9" width="19" height="6" rx="1.5" class="h"/><rect x="9" y="7.5" width="6" height="9" rx="1" class="m"/><rect x="10.8" y="9.6" width="2.4" height="4.8" class="d"/>',
  shield: '<path d="M12 2.5 20 5.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" class="m"/><path d="M12 5.5v13M7 10h10" class="o"/>',
  focus: '<circle cx="12" cy="10" r="6" class="g"/><path d="M8 18h8l-1 3.5H9z" class="h"/><path d="M9.5 8.5a3 3 0 0 1 3-2" class="o"/>',
  quiver: '<path d="m7 7 4-4 10 10-4 4z" class="h"/><path d="M5 5l2 2M8 2.5 9.5 4M2.5 8 4 9.5" class="o"/><path d="M3.5 3.5 6 6" class="s"/>',
  ring: '<circle cx="12" cy="14" r="6" class="ring"/><path d="m9.5 7 2.5-4.5L14.5 7z" class="g"/>',
  neck: '<path d="M5 3c0 6 3 10 7 10s7-4 7-10" class="ring" fill="none"/><path d="M12 13l3.5 4-3.5 4.5L8.5 17z" class="g"/>',
};
const ALIAS = { offhand: 'shield', weapon: 'sword', ring1: 'ring', ring2: 'ring', amulet: 'neck', glaive: 'polearm', halberd: 'polearm', club: 'mace', hammer: 'mace', rod: 'wand', orb: 'focus', tome: 'focus', buckler: 'shield', knife: 'dagger' };
const STYLE = '<style>.m{fill:#e8d6a8;stroke:#2b1c0c;stroke-width:1.1;stroke-linejoin:round}.h{fill:#9a6a36;stroke:#2b1c0c;stroke-width:1.1;stroke-linejoin:round}.d{fill:#2b1c0c}.s{stroke:#2b1c0c;stroke-width:3.4;stroke-linecap:round;fill:none}.s+.s,.s{}.o{stroke:#2b1c0c;stroke-width:1.1;fill:none;stroke-linecap:round}.g{fill:#9fd8ff;stroke:#1b2c40;stroke-width:1.1}.ring{stroke:#e8c25a;stroke-width:2.2;fill:none}</style>';
// the shaft stroke is drawn twice: dark outline under a wooden core
const shaft = s => s.replace(/<path d="([^"]+)" class="s"( fill="none")?\/>/g, (_, d) => `<path d="${d}" stroke="#2b1c0c" stroke-width="3.6" stroke-linecap="round" fill="none"/><path d="${d}" stroke="#a87742" stroke-width="1.6" stroke-linecap="round" fill="none"/>`);

export const GEAR_KINDS = Object.keys(P);
/** SVG for a gear kind or slot; '' when there is no picture for it. */
export function gearIcon(kind, size = 32) {
  const k = P[kind] ? kind : ALIAS[kind]; if (!k) return '';
  return `<svg class="gear-ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${STYLE}${shaft(P[k])}</svg>`;
}
