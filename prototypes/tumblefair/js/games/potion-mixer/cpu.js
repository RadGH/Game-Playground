// Potion Mixer CPU: reads the recipe card and taps the next ingredient on the shelf at a person's pace (finding it
// on the shelf takes a moment), now and then grabbing the wrong one and waiting out the smoke. A new recipe gets a
// short look first. Family is slow and fumbles more; Tricky is quick and rarely wrong.
import { by, gauss, slip, pick } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, init = c.init || {}, recipes = init.recipes || [], shelf = init.shelf || [], mem = { next: 0 }, form = 0.85 + c.rng() * 0.3;   // form: some rounds your fingers just fly
  return {
    tick(v) {
      const g = v.g; if (g?.phase !== 'play') return;
      if ((g.lock || []).includes(c.pid)) { mem.next = Math.max(mem.next, v.t + 0.3 + sk.react * 0.5); mem.sent = null; return; }   // smoke: start again once it clears
      const k = g.at?.[c.pid] ?? 0, s = g.prog?.[c.pid] ?? 0, R = recipes[k]; if (!R) return;
      if (mem.k !== k) { mem.k = k; mem.next = Math.max(mem.next, v.t + by(sk, [0.7, 0.55, 0.45]) * form); }       // read the new card
      if (v.t < mem.next || (mem.sent === k + ':' + s && v.t < mem.sentAt + 1.2)) return;     // (the same step again only if the tap got lost)
      mem.sent = k + ':' + s; mem.sentAt = v.t;
      mem.next = v.t + Math.max(0.2, by(sk, [0.64, 0.55, 0.49]) * form + gauss(c.rng) * 0.12);
      const right = R[s], wrong = slip(sk, c.rng, by(sk, [0.15, 0.25, 0.25]));
      v.act('add', { k, s, i: wrong ? pick(shelf.filter(x => x !== right), c.rng) : right });
    },
  };
}
