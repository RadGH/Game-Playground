// Storm Shelter CPU: reads what the storm is about to hit (the event and the wind are on every screen), works out
// where the meters will stand, and plays the card from its hand that props up the weakest one — after a few seconds
// of reading, like a person. It cannot see the others' hands, so two players can still cover the same thing; Family
// now and then just plays the card that looks nice.
import { by, later, readDelay, pick, slip } from '../cpu-kit.js';
import { EVENTS, METERS, bestCard } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, mem = {};
  return {
    tick(v) {
      const g = v.g, hand = v.priv?.hand; if (!g || g.ph !== 'beat' || !hand?.length || g.ev == null) return;
      later(mem, v, 'b' + g.beat, () => {
        const m = g.m.slice(), hit = EVENTS[g.ev]?.hit || {};
        for (const [k, d] of Object.entries(hit)) m[METERS.indexOf(k)] += d;
        (g.wind || []).forEach((d, i) => { m[i] += d; });
        v.act('play', slip(sk, c.rng, 1.7) ? pick(hand.map((_, i) => i), c.rng) : bestCard(m, hand));
      }, Math.min(5.5, readDelay(sk, c.rng, by(sk, [2.6, 1.9, 1.4])) + c.rng() * 1.5));
    },
  };
}
