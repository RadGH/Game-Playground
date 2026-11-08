// How long a match will take (Expansion 1, M2 "Finish the night", 2026-11-07).
//
// Live numbers (2026-11-07): 74 matches started, 31 finished. Read back from the insights log, the unfinished ones were
// mostly (a) matches with NO end — The Fair Never Closes, Custom, "first to X tickets" (16 of 43), (b) matches restarted
// or left before the first minigame (17), and (c) a player alone leaving after one or two games. Fixed-length board
// matches nearly always finished, in 5-11 minutes. So the lobby now says how long each choice takes, there is a Quick
// Match that is ~10 minutes, and the match screens say how far through you are.
//
// The estimate is built from the room's real timers (room.js TIMES, board.js BOARD) and the minigames' own clocks
// (meta.seconds), never a table of minutes, so changing a timer changes the estimate. PACE holds the few things that
// are about PEOPLE rather than timers, each measured: tests/match-time.test.js plays whole matches with bots and
// fails if the estimate drifts more than a quarter away from what really happened.
import { BOARD } from './board.js';
import { GAMES, eligible } from '../games/index.js';

export const PACE = Object.freeze({
  /** Minigames end before their clock: on average they run 67% of it (live insights, 290 plays to 2026-11-07). */
  GAME_SHARE: 0.67,
  /** ... except golf holes, which are over long before their clock (live: mini golf 27 s of 100, fairway 38 of 150). */
  GOLF_SHARE: 0.3,
  /** A board turn after the walk: landing on a space, its effect or live event (measured with bots: tools/match-length.mjs). */
  LAND_MS: 2600,
  /** A person taps ROLL a moment after their turn opens. */
  ROLL_MS: 2000,
  /** The average die. */
  SPACES: 3.5,
  /** Votes: most phones have voted by this share of the timer (it closes 0.7 s after the last person votes). */
  VOTE_SHARE: 0.6,
  /** Intro / results: a group mostly reads them out (some tap ready, some wait). Share of the timer. */
  INTRO_SHARE: 0.8, RESULTS_SHARE: 0.9,
  /** "First to X tickets": what the leader gains in a round, on average, by table size (measured with bots, first to
   *  100: 2 players ~9 rounds, 4 players ~11). More players = the minigame prizes are shared out more thinly. */
  LEADER_TICKETS: { 1: 12, 2: 11, 3: 10, 4: 9 },
  /** The Quick Match aims at this. */
  QUICK_MS: 10 * 60 * 1000,
});

/** The average minigame's real length (ms) for this many players from this pool (the room's own list). */
export function gameMs(players = 4, pool = null) {
  const ids = pool?.length ? pool : eligible(players);
  if (!ids.length) return 60000 * PACE.GAME_SHARE;
  return ids.reduce((a, id) => a + (GAMES[id]?.meta.seconds || 60), 0) / ids.length * 1000 * PACE.GAME_SHARE;
}

/** One board turn (roll, dice, walk, landing). */
export const turnMs = () => PACE.ROLL_MS + BOARD.DICE_MS + PACE.SPACES * BOARD.STEP_MS + 120 + PACE.LAND_MS;

/**
 * The parts of one round, in ms: { board, vote, intro, game, results }. `times` = room.js TIMES.
 * mode: board | marathon | endless | custom | golf.
 */
export function roundParts({ mode = 'board', players = 4, pool = null, times, golf = 'mini', first = false }) {
  const intro = times.INTRO_MS * PACE.INTRO_SHARE, results = times.RESULTS_MS * PACE.RESULTS_SHARE;
  if (mode === 'golf') { const id = golf === 'fairway' ? 'fairway-golf' : 'mini-golf'; return { board: 0, vote: 0, intro, game: (GAMES[id]?.meta.seconds || 100) * 1000 * PACE.GOLF_SHARE, results }; }
  const vote = mode === 'custom' ? times.VOTE_MS * PACE.VOTE_SHARE : times.VOTE_MS * PACE.VOTE_SHARE;   // custom: the host picks, about as long
  const board = mode === 'board' ? (first ? 0 : BOARD.BULLETIN_MS) + players * turnMs() : 0;
  return { board, vote, intro, game: gameMs(players, pool), results };
}
export const roundMs = o => Object.values(roundParts(o)).reduce((a, b) => a + b, 0);

/** How many rounds a "first to X tickets" match takes, about. */
export const goalRounds = (goal, players = 4) => Math.max(1, Math.ceil(goal / (PACE.LEADER_TICKETS[players] || 9)));

/**
 * A whole match, Start to the final screen (ms). Open-ended modes (endless, custom) have no total: null.
 * opts: { mode, rounds, goal, players, pool, golf, times }.
 */
export function matchEstimate({ mode = 'board', rounds = 4, goal = 0, players = 4, pool = null, golf = 'mini', times }) {
  if (mode === 'endless' || mode === 'custom') return null;
  const n = mode === 'board' && goal ? goalRounds(goal, players) : rounds;
  let ms = 0;
  for (let r = 1; r <= n; r++) ms += roundMs({ mode, players, pool, times, golf, first: r === 1 });
  if (mode === 'board' && !goal && players > 1) ms += times.BONUS_MS * PACE.RESULTS_SHARE;   // the closing ceremony
  return ms;
}

/** What is left of a running match (ms), from the round it is in and how far through that round it is. null = open-ended. */
export function remainingMs({ mode, round, rounds, goal = 0, players = 4, pool = null, golf = 'mini', times, phase, phaseLeft = 0, leader = 0 }) {
  if (mode === 'endless' || mode === 'custom') return null;
  const total = mode === 'board' && goal ? round + (leader >= goal ? 0 : Math.max(0, goalRounds(goal - leader, players) - 1)) : rounds;   // first to X: the rounds the leader still needs
  const parts = roundParts({ mode, players, pool, times, golf });
  const order = ['board', 'vote', 'intro', 'game', 'results'], at = order.indexOf(phase === 'pick' ? 'vote' : phase);
  let ms = 0;
  if (at >= 0) { ms += phaseLeft; for (let i = at + 1; i < order.length; i++) ms += parts[order[i]]; }
  ms += Math.max(0, total - round) * roundMs({ mode, players, pool, times, golf });
  if (mode === 'board' && !goal && players > 1 && phase !== 'bonus') ms += times.BONUS_MS * PACE.RESULTS_SHARE;
  if (phase === 'bonus') ms = phaseLeft;
  return Math.max(0, ms);
}

/** The most rounds of a board match that fit in the Quick Match's ten minutes (at least 2). */
export function quickRounds({ players = 4, pool = null, times }) {
  let best = 2;
  for (let r = 2; r <= 8; r++) if (matchEstimate({ mode: 'board', rounds: r, players, pool, times }) <= PACE.QUICK_MS) best = r;
  return best;
}

/** Everything the lobby shows (per player count n and the room's pool): minutes for each mode and length. */
export function lobbyEstimates({ players = 4, pool = null, times, golf = 'mini' }) {
  const min = ms => (ms == null ? null : Math.max(1, Math.round(ms / 60000)));
  const per = (mode, list, extra = {}) => Object.fromEntries(list.map(r => [r, min(matchEstimate({ mode, rounds: r, players, pool, times, golf, ...extra }))]));
  return {
    board: per('board', [3, 4, 5, 6]), marathon: per('marathon', [3, 4, 5, 6]), golf: per('golf', [3, 6, 9, 18]),
    goal: Object.fromEntries([60, 100, 150, 200].map(g => [g, min(matchEstimate({ mode: 'board', goal: g, players, pool, times }))])),
    perGameS: Math.round(roundMs({ mode: 'marathon', players, pool, times }) / 1000),
    quick: { rounds: quickRounds({ players, pool, times }), min: min(matchEstimate({ mode: 'board', rounds: quickRounds({ players, pool, times }), players, pool, times })) },
  };
}
