// Letter Shot CPU: as setter it picks a mark (Family mostly the easy close ones, Tricky the far ones that are hard to
// copy) and shoots; when copying it shoots the called mark. Each shot lets go of the meter off the green band's middle
// by an error measured in band widths (Family about 1.5, Tricky about 0.75), so far marks are harder for it as well.
import { by, gauss, clamp, pickBest } from '../cpu-kit.js';
import { SPOTS, PH } from './sim.js';
import { idealPower, tolFor } from '../hoops-kit.js';

export function createCpu(c) {
  const sk = c.skill, mem = {}, tol = c.init?.level?.tol ?? 0.06, period = c.init?.level?.period ?? 1.5;
  const me = (c.init?.who || []).findIndex(w => w.pid === c.pid), spread = by(sk, [1.75, 1.05, 0.72]);
  const power = d => clamp(idealPower(d) + gauss(c.rng) * spread * tolFor(d, tol), 0, 1);
  const wait = (key, s) => { if (mem.key !== key) { mem.key = key; mem.at = s; } return mem.at; };
  return {
    tick(v) {
      for (const e of v.events || []) if (e.e === 'turn' || e.e === 'copy' || e.e === 'pick') mem.turn = (mem.turn || 0) + 1;
      const g = v.g; if (!g || !g.r || me < 0 || g.r[me][1]) return;
      const at = (key, s) => v.t >= wait(key, v.t + s);
      if (g.ph === PH.PICK && g.s === me) {
        if (!at('pick' + mem.turn, 0.8 + sk.react * (1 + c.rng() * 2))) return;
        const want = by(sk, [3, 4.5, 5.5]);
        const i = pickBest(SPOTS.map((_, k) => k), k => -Math.abs(SPOTS[k].d - want) + c.rng() * 1.2, sk, c.rng);
        v.act('pick', i); mem.key = null;
      } else if ((g.ph === PH.SET && g.s === me) || (g.ph === PH.COPY && g.s !== me && !g.r[me][2])) {
        if (!at('shot' + g.ph + ':' + mem.turn, 0.6 + sk.react * (1 + c.rng() * 1.5) + period * (0.3 + c.rng() * 0.5))) return;
        v.act('shoot', { p: Math.round(power(SPOTS[g.sp].d) * 1000) / 1000 }); mem.key = null;
      }
    },
  };
}
