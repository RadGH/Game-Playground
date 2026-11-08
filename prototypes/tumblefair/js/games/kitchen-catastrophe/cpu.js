// Kitchen Catastrophe CPU: a cook who reads the front order card. It fetches the earliest part of that order that is
// on one of ITS counters and that nobody is already carrying, carries it to the tray and adds it when it is next;
// otherwise it waits by the hatch (each seat in its own spot). Tricky also fetches a part for the order after when it
// has nothing to do; Family sometimes adds a part before it is next ("Not yet!") or dawdles.
import { thinker, stickTo, by, slip, noisy, A } from '../cpu-kit.js';
import { RECIPES, STATIONS, TRAY } from './sim.js';

export function createCpu(c) {
  const sk = c.skill, think = thinker(c), mem = { own: (c.init?.stations || []).map(s => s.own) };
  const stations = c.init?.stations || [], ahead = by(sk, [false, false, true]);
  const waitAt = { x: TRAY.use.x + (c.seat - 1.5) * 1.3, z: TRAY.use.z + 1.5 };
  return {
    tick(v) {
      for (const ev of v.events) if (ev.e === 'own' && ev.own) mem.own = ev.own;
      const me = v.me, g = v.g; if (!me || !g) return null;
      return think(v, () => {
        const hold = g.hold?.[c.pid] ?? -1, o = g.o?.[0], rest = o ? RECIPES[o[1]].steps.slice((g.tray || []).length) : [];
        const held = new Set(Object.entries(g.hold || {}).filter(([p, h]) => +p !== c.pid && h >= 0).map(([, h]) => h));
        if (g.cpu && g.cpu[3] >= 0) held.add(g.cpu[3]);
        const mine = it => { const k = stations.findIndex(s => s.item === it); return k >= 0 && mem.own[k] === c.pid ? stations[k] : null; };
        const go = (p, reach, press) => {
          const d = Math.hypot(p.x - me.x, p.z - me.z);
          return { ...stickTo(me, p.x, p.z, sk, { arrive: 0.4 }), b: press && d < reach ? A : 0 };
        };
        if (hold >= 0 && (hold === rest[0] || (rest.includes(hold) && slip(sk, c.rng, 0.35)))) return go(TRAY.use, 1.15, true);
        if (hold >= 0 && rest.includes(hold)) return go(waitAt, 0, false);
        let want = rest.find(it => !held.has(it) && mine(it));
        if (want === undefined && ahead && g.o?.[1] && hold < 0) want = RECIPES[g.o[1][1]].steps.find(it => !held.has(it) && mine(it));
        if (want !== undefined && want !== hold && !slip(sk, c.rng, 0.4)) return go(STATIONS[mine(want).spot].use, 0.8, true);
        if (hold >= 0 && g.o?.[1] && RECIPES[g.o[1][1]].steps.includes(hold)) return go(waitAt, 0, false);
        return go({ x: noisy(waitAt.x, 0.6, sk, c.rng), z: noisy(waitAt.z, 0.4, sk, c.rng) }, 0, false);
      });
    },
  };
}
