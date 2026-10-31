// What someone has on (M7). `p.wear` is a word from WEARS, set at every detail level, and only where a person can change: at the
// moment they start something at a place, or as they leave home. Never on the street. The page turns the word into clothes
// (js/client/outfits.js), so the sim stays free of looks and a town nobody watches dresses exactly as one on screen does.
import { h01 } from './social.js';

export const WEARS = ['casual', 'work', 'sleep', 'smart', 'sport', 'swim', 'winter', 'party'];

/** One day in a few is cold, by hash, so every detail level agrees. People who go out on it wrap up. */
export const coldDay = (c, t) => h01(`${c.clock.day(t)}/cold/${c.s.seed}`) < c.k.wear.coldShare;

export function setWear(c, p, wear) {
  const w = wear === 'work' && !p.job ? 'casual' : wear;
  if (w !== p.wear) p.wear = w;
}

/** Clothes for going out of the door to do `a`. Anything without a dress code is everyday clothes, or a coat on a cold day. */
function forOut(c, p, a) {
  if (a?.wear) return a.wear;
  return coldDay(c, c.s.t) ? 'winter' : 'casual';
}

/** They are starting `a` at a place. Null: they keep what they have on (a chat, a coffee, a wait). */
export function dressForAct(c, p, a, place) {
  if (a.wear) return setWear(c, p, a.wear);
  if (place === p.home && a.site === 'home') setWear(c, p, a.outdoors ? forOut(c, p, a) : 'casual');
  else if (place === p.home && a.outdoors) setWear(c, p, forOut(c, p, a));
}

/** They are leaving home. Whatever they are off to do decides what they went upstairs and put on. */
export function dressToLeave(c, p, from, goal) {
  if (from !== p.home) return;
  setWear(c, p, goal?.work ? 'work' : forOut(c, p, c.actionById[goal?.a]));
}
