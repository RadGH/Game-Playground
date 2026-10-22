// Holidays (round 6, 2026-10-22). ONE table says when each holiday is on; everything seasonal checks it:
//   * a minigame with `meta.season: 'halloween'` is only offered while that season is on (the "Holidays" group in the
//     host's minigame list); the host's Holidays option can force a season on (any time of year) or turn them off;
//   * a costume with `season` is only in the shop and only worn while its season is on BY THE DATE (the host option
//     does not unlock costumes): outside it, it is hidden, and anyone wearing it is drawn in their own clothes;
//   * chance events / bulletins with `season` join the board's lists while the season is on;
//   * every minigame is created with `season` (null or an id) and may reskin itself (pumpkins for balloons…);
//     the browser gets the same value as `ctx.season`, and the page sets body[data-season] for themed menus.
// To add Christmas later: add a row here, give its content `season: 'christmas'`, add its body[data-season] styles.
// Dates are month/day, inclusive, in the SERVER's local time for the room (the browser's for its own menus).
export const SEASONS = [
  { id: 'halloween', name: 'Halloween', from: [10, 1], to: [10, 31] },
  // planned, not built yet (owner 2026-10-22: "later we'll add christmas and other holidays"):
  // { id: 'christmas', name: 'Christmas', from: [12, 1], to: [12, 31] },
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
/** The host's choice ('auto' | 'off' | a season id) -> the season in force, or null. */
export function effectiveSeason(choice = 'auto', date = new Date()) {
  if (choice === 'off') return null;
  if (SEASON_IDS.includes(choice)) return choice;
  return seasonByDate(date);
}
/** Does an item (game meta, costume, chance event) belong right now? Items without a season always do. */
export const inSeason = (item, season) => !item?.season || item.season === season;
export const seasonName = id => SEASONS.find(s => s.id === id)?.name || '';
