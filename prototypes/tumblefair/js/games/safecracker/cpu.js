// Safecracker CPU: follows the lamp like a person with a thumb on the arrows — big turns while it is cold, single
// notches once it is warm, turning back when the lamp cools — and presses SET on CLICK after a beat. A tap every
// 0.2-0.35 s (by skill); now and then it gets impatient and presses SET on "Hot!", which jams the dial.
import { by, slip } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = { dir: c.rng() < 0.5 ? 1 : -1, prev: null, at: 0 };
  const form = 0.88 + c.rng() * 0.24;                               // a good day or a bad day
  const gap = by(sk, [0.3, 0.27, 0.255]) * form, pause = by(sk, [0.14, 0.1, 0.08]);
  return {
    tick(v) {
      const p = v.priv; if (!p || p.dial == null || p.lock || v.t < mem.at) return;
      const key = p.dial + ':' + p.step + ':' + p.safes;
      if (mem.key === key) return;                                   // wait for the dial to answer the last tap
      mem.key = key; mem.at = v.t + gap * (0.75 + c.rng() * 0.5) + (c.rng() < pause ? 0.4 + c.rng() * 0.8 : 0);   // a glance away now and then
      if (p.heat === 4 || (p.heat === 3 && slip(sk, c.rng, 0.12))) { mem.prev = null; mem.key = null; mem.at += 0.15 + c.rng() * 0.25; v.act('set'); return; }
      if (mem.prev != null && p.heat < mem.prev) mem.dir = -mem.dir;  // colder: wrong way
      mem.prev = p.heat;
      const size = p.heat <= 0 ? 5 : p.heat === 1 ? 3 : p.heat === 2 ? 2 : 1;
      v.act('turn', mem.dir * size);
    },
  };
}
