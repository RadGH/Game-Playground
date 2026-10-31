// Stir (PLAN §1): the god verb. Drag one person onto another and pick a scene: introduce them, set up a date, start a row, patch it
// up. It is an order, so it goes through the same queue as Direct, and the scene is a chat with a result. data/stir.json says the
// odds and what each result does to how they feel. The words on the screen are the page's (Lingo pack, od_stir_*).

import { say, log } from './log.js';
import { rand } from './rng.js';
import { nudge, feelingIndex } from './feelings.js';
import { addMoodlet } from './needs.js';

export function stirOrder(c, p, o) {
  const row = c.d.stir.kinds[o.stir], other = c.s.people[o.person];
  if (!row || !other || other === p) return false;
  return true;
}

const feel = (c, p, other, name) => p.f[other]?.[feelingIndex(c, name)] ?? 0;

export function stirChance(c, p, other, id) {
  const r = c.d.stir.kinds[id], v = r.base + feel(c, p, other, 'like') * r.likeScale + feel(c, p, other, 'love') * r.loveScale - feel(c, p, other, 'grudge') * r.grudgeScale;
  return Math.max(0.03, Math.min(0.97, v));
}
export function stirStarted(c, p, other, id) { say(c, 'stir.start', { a: p.id, b: other.id, stir: id }); }

export function finishStir(c, p, act) {
  const other = c.s.people[act.with], id = act.stir, r = c.d.stir.kinds[id], ok = rand(c.s) < stirChance(c, p, other.id, id);
  const change = ok ? r.good : r.bad, mood = ok ? r.goodMood : r.badMood;
  for (const [a, b] of [[p, other], [other, p]]) {
    for (const [name, v] of Object.entries(change)) nudge(c, a, b.id, name, v);
    addMoodlet(c, a, `stir_${id}`, mood[0], mood[1]);
  }
  log(c, 'stir', { a: p.id, b: other.id, stir: id, ok: ok ? 1 : 0, place: act.place });
  say(c, 'stir.done', { a: p.id, b: other.id, stir: id, ok: ok ? 1 : 0 });
}
