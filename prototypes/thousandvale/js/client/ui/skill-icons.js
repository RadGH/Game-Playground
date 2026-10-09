// Play-test 10 Y32 — pictures for skills. The action bar has always shown two initials for a skill ("SD"); a skill
// listed here shows its picture instead, everywhere a skill has a face (the bar, its card, the Skills window).
// The first six are the Starcaller's: gold stars on midnight blue, drawn from C's hints for each skill.
// Adding a picture for another skill = one entry here (a 32 x 32 SVG body); a skill with none keeps its initials.
//
//   skillIconSvg('star_dart') -> '<svg …>' | null          skillIconIds() -> ids that have a picture
// Pure strings: no DOM, node-tested.

const GOLD = '#e6c14a', PALE = '#fff2b8', NIGHT = '#1c1f4a', DEEP = '#10122e';
/** A four-point star centred on (x, y), radius r, waist w (0..1). */
const star = (x, y, r, w = 0.3, fill = GOLD) => {
  const k = r * w, p = [[x, y - r], [x + k, y - k], [x + r, y], [x + k, y + k], [x, y + r], [x - k, y + k], [x - r, y], [x - k, y - k]];
  return `<path d="M${p.map(q => q.map(v => +v.toFixed(2)).join(' ')).join('L')}Z" fill="${fill}"/>`;
};
const disc = `<circle cx="16" cy="16" r="15.5" fill="${NIGHT}" stroke="${GOLD}" stroke-width="1"/><circle cx="16" cy="16" r="15" fill="none" stroke="${DEEP}" stroke-width="1" opacity="0.6"/>`;

const ICONS = {
  // one thrown star, with a short trail behind it
  star_dart: `${disc}<path d="M5 25 L15 17" stroke="${GOLD}" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/><path d="M8 26 L13 21" stroke="${PALE}" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>${star(19, 13, 9)}${star(19, 13, 4, 0.4, PALE)}`,
  // three small stars in a fan
  star_volley: `${disc}<path d="M8 27 L10 14 M8 27 L18 18 M8 27 L22 26" stroke="${GOLD}" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/>${star(11, 9, 5)}${star(21, 14, 5)}${star(24, 24, 4.4)}`,
  // a star with a tail coming straight down, and the mark where it will land
  called_star: `${disc}<path d="M16 3 L16 15" stroke="${GOLD}" stroke-width="3" stroke-linecap="round" opacity="0.6"/><path d="M12.5 4 L13.5 12 M19.5 4 L18.5 12" stroke="${PALE}" stroke-width="1" stroke-linecap="round" opacity="0.55"/>${star(16, 18, 7.5)}<ellipse cx="16" cy="27.5" rx="8" ry="2.2" fill="none" stroke="${GOLD}" stroke-width="1.2" opacity="0.8"/>`,
  // a ring of small stars on the ground
  star_field: `${disc}<ellipse cx="16" cy="18" rx="11" ry="6.5" fill="${GOLD}" opacity="0.14"/><ellipse cx="16" cy="18" rx="11" ry="6.5" fill="none" stroke="${GOLD}" stroke-width="1.2"/>${star(6, 17, 3.2)}${star(26, 17, 3.2)}${star(11, 12.5, 2.8)}${star(21, 12.5, 2.8)}${star(11, 23, 3.2)}${star(21, 23, 3.2)}${star(16, 18, 2.4, 0.35, PALE)}`,
  // three stars circling a figure
  wheeling_stars: `${disc}<ellipse cx="16" cy="17" rx="11.5" ry="5" fill="none" stroke="${GOLD}" stroke-width="1" opacity="0.6" transform="rotate(-18 16 17)"/><circle cx="16" cy="11" r="3" fill="${PALE}"/><path d="M11.5 25 Q16 12 20.5 25 Z" fill="${PALE}"/>${star(5.5, 20, 3.6)}${star(26.5, 14, 3.6)}${star(17, 24.5, 3)}`,
  // many stars falling
  sky_barrage: `${disc}<path d="M9 3 L7 11 M17 2 L15.5 9 M25 4 L23 13 M13 12 L11.5 19 M22 14 L20.5 21" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>${star(6.5, 14, 3.6)}${star(15, 12, 3.2)}${star(22.5, 16, 3.8)}${star(11, 22, 4)}${star(20, 24.5, 3.6)}<path d="M5 28.5 H27" stroke="${GOLD}" stroke-width="1" opacity="0.5"/>`,
};

/** The picture for a skill id as an inline SVG string (`size` px square), or null when the skill has none. */
export function skillIconSvg(id, size = 32) {
  const body = ICONS[id];
  return body ? `<svg class="sk-ico" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">${body}</svg>` : null;
}
export const skillIconIds = () => Object.keys(ICONS);
