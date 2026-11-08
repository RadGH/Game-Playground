// Tiptoe Tiger CPU: creeps straight at the bell while the tiger sings and lets go of the stick a human reaction time
// after the "!" (Family ~0.47 s, Tricky ~0.3 s, with a spread; now and then it is simply too slow and gets roared).
// It starts creeping again a beat after the song starts. Tricky also holds A (statue) to stop dead.
import { A, by, gauss, stickTo, slip } from '../cpu-kit.js';

export function createCpu(c) {
  const sk = c.skill, bell = c.init?.bell || [0, -7.25], mem = { ph: null, at: 0, walking: false };
  const rt = () => Math.max(0.18, by(sk, [0.47, 0.42, 0.3]) + gauss(c.rng) * by(sk, [0.14, 0.09, 0.06]));
  return {
    tick(v) {
      const g = v.g, me = v.me; if (!g || !me) return null;
      if (g.ph !== mem.ph) {
        if (g.ph === 'sing') { mem.walking = false; mem.at = v.t + rt(); mem.pace = by(sk, [0.84, 0.9, 0.92]) * (0.8 + c.rng() * 0.2); }  // a race: Tricky is barely quicker
        else if (g.ph === 'tell') mem.at = v.t + rt() + (slip(sk, c.rng, 0.4) ? 0.55 + c.rng() * 0.4 : 0);   // too slow this time
        else if (mem.ph !== 'tell') mem.walking = false;                // ready / ring / done: stand
        mem.ph = g.ph;
      }
      if (g.ph === 'sing') mem.walking = v.t >= mem.at;                 // noticed the song
      else if (mem.walking && v.t >= mem.at) mem.walking = false;       // noticed the "!"
      if (!mem.walking) return { mx: 0, mz: 0, b: (sk.level >= 2 && g.ph !== 'sing' && g.ph !== 'ready') ? A : 0 };
      return { ...stickTo(me, bell[0], bell[1], sk, { arrive: 0, mag: mem.pace ?? sk.speed }), b: 0 };
    },
  };
}
