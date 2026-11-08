// The practice copy's rules (Expansion 1 M3): which version of a minigame a player practises in the intro. Pure, so
// tests/practice.test.js builds exactly what a phone builds (js/client/practice.js is the browser half).
import { makeRng } from './rng.js';

/** The practice copy is always the gentlest version: same controls, more time to try them. */
export const PRACTICE_DIFFICULTY = 'easy';

/** One practice instance of a game's rules (`mod` = its sim.js module) for one player, alone with the game's own rival. */
export function practiceInstance(mod, { me, seat = 0, name = 'You', season = null, seed = 1 }) {
  const players = [{ pid: me, seat, name }];
  return mod.create({ seed, rng: makeRng(seed), players, difficulty: PRACTICE_DIFFICULTY, season, teams: false, rivals: true });
}
