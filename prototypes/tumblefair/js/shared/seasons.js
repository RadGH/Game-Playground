// Holidays (round 6, 2026-10-22). ONE table says when each holiday is on; everything seasonal checks it:
//   * a minigame with `meta.season: 'halloween'` is only offered while that season is on (the "Holidays" group in the
//     host's minigame list); the host's Holidays option can force a season on (any time of year) or turn them off;
//   * a costume with `season` is only in the shop and only worn while its season is on BY THE DATE (the host option
//     does not unlock costumes): outside it, it is hidden, and anyone wearing it is drawn in their own clothes;
//   * chance events / bulletins with `season` join the board's lists while the season is on;
//   * every minigame is created with `season` (null or an id) and may reskin itself (pumpkins for balloons…);
//     the browser gets the same value as `ctx.season`, and the page sets body[data-season] for themed menus.
// To add a holiday: add a row here, give its content `season: '<id>'`, add its body[data-season] styles.
// Winter Fair (Expansion 1, M6, 2026-11-07): `winter`, November 1 to January 6 (the range wraps past New Year; owner 2026-11-08 moved the start from Dec 1 to Nov 1).
// Preview (owner): open the page with `?holiday=winter` (or any season id, or `off`): the host's lobby then shows a
// "Holiday preview" row that forces that season for the room (games, reskins, board, menus) on any day of the year,
// and the costume shop lets you TRY ON that season's costumes (buying and wearing them still follows the date).
// Dates are month/day, inclusive, in the SERVER's local time for the room (the browser's for its own menus).
export const SEASONS = [
  { id: 'halloween', name: 'Halloween', from: [10, 1], to: [10, 31] },
  { id: 'winter', name: 'Winter Fair', from: [11, 1], to: [1, 6] },
  // planned, not built yet:
  // { id: 'valentines', name: "Valentine's", from: [2, 7], to: [2, 14] },
];
export const SEASON_IDS = SEASONS.map(s => s.id);
const md = d => (d.getMonth() + 1) * 100 + d.getDate();

/** The season the calendar says is on (a range may wrap past New Year), or null. */
export function seasonByDate(date = new Date()) {
  const k = md(date);
  for (const s of SEASONS) { const a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1]; if (a <= b ? k >= a && k <= b : k >= a || k <= b) return s.id; }
  return null;
}
/** The host's choice ('auto' | 'off' | 'only' | a season id) -> the season in force, or null. */
export function effectiveSeason(choice = 'auto', date = new Date()) {
  if (choice === 'off') return null;
  if (choice === 'only') return seasonByDate(date) || SEASON_IDS[0];      // "holiday games only" (owner 2026-10-22): the date's holiday, else the first one
  if (SEASON_IDS.includes(choice)) return choice;
  return seasonByDate(date);
}
/** Does an item (game meta, costume, chance event) belong right now? Items without a season always do. */
export const inSeason = (item, season) => !item?.season || item.season === season;
export const seasonName = id => SEASONS.find(s => s.id === id)?.name || '';
/** The season a page asks to preview (`?holiday=winter`), or undefined when it asks for none. 'off' is a choice too. */
export function previewFromUrl(search = '') {
  const v = new URLSearchParams(search).get('holiday');
  return v && (v === 'off' || SEASON_IDS.includes(v)) ? v : undefined;
}
