// The words next to the numbers on the results card and the final card (round 10, report #21: "the other person won
// but their score was only 2 instead of 5 at the end"). Every number now says what it counts: the minigame's own score
// ("5 blocks", what the game's top bar showed), the prize that placing earns for the whole fair ("+4 points",
// "+10 tickets"), and at the end the whole fair's totals ("2 ribbons · 31 tickets") with a line saying how the winner
// is picked — the final winner can have fewer of the last minigame's blocks than you and still win the fair.
// Pure (no DOM), so tests read it.
const one = (n, unit) => (n === 1 ? String(unit || '').replace(/s$/, '') : String(unit || ''));
/** The minigame's own score: "5 blocks", "1 point", "" when the game gave none. */
export const gameScoreText = (n, unit) => (typeof n === 'number' ? `${n} ${one(n, unit)}`.trim() : '');
/** What that placing earns for the whole fair: "+4 points", "+10 tickets". */
export const awardText = (n, unit) => `+${n || 0} ${one(n || 0, unit)}`;
/** A row of the final standings: board "2 ribbons · 31 tickets", otherwise "12 points". */
export const finalScoreText = (r, mode) => (mode === 'golf' ? `${r.strokes ?? 0} ${one(r.strokes ?? 0, 'strokes')}` : mode === 'board' ? `${r.ribbons || 0} ${one(r.ribbons || 0, 'ribbons')} · ${r.tickets || 0} ${one(r.tickets || 0, 'tickets')}` : `${r.points || 0} ${one(r.points || 0, 'points')}`);
/** How the whole fair is won, under the final standings. */
export const finalHowText = (mode, goal = 0) => (mode === 'golf' ? 'Fewest strokes over the whole round wins.' : mode === 'board'
  ? (goal ? `Whole-fair totals: first to ${goal} tickets (ribbons count at their price).` : 'Whole-fair totals: most ribbons wins, then most tickets.')
  : 'Whole-fair totals: the points from every minigame added up.');
/** The line under a results card's title. */
export const resultsKeyText = unit => `Score in this game · prize for the whole fair (${unit})`;
