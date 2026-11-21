// The local session (docs/ARCH.md "Session contract"): runs the brawl at a fixed 60 steps a second with an
// accumulator, sets px/py/pz on every entity before each step (the renderer draws between the last two — lessons rule
// 28), and carries every edge press that arrives between two steps into the next step, so no press is ever dropped.
// The online session (js/net/session.js) has the same shape, so the play loop and the HUD don't care which one runs.
import { createBrawl, step, STEP } from './sim/brawl.js';

const EDGES = ['attack', 'heavy', 'jump', 'dash', 'grab', 'spell1', 'spell2', 'breaker'];
const MAX_FRAME = 0.25;             // a long stall (a hidden tab) never runs more than this much game time at once

export function createLocalSession({ data, T, chapter, heroes, seed = (Math.random() * 1e9) >>> 0, section = 0, ally = true }) {
  const G = createBrawl({ data, T, chapter, heroes, seed, section, ally });
  const carry = {};                 // pid → edges pressed but not yet handed to a step
  let acc = 0, paused = false, left = false;
  const snap = e => { e.px = e.x; e.py = e.y; e.pz = e.z; };
  for (const e of [...G.heroes, ...G.foes]) snap(e);

  const s = {
    G, online: false, seed, chapter, section,
    localPids: heroes.filter(h => (h.ctrl || 'player') === 'player').map(h => h.pid),
    get paused() { return paused; },
    pause() { paused = true; },
    resume() { paused = false; for (const k in carry) carry[k] = {}; },
    leave() { left = true; paused = true; },
    /** Run 0..n steps for this much real time. inputs: { pid: { mx, mz, block, attack, … } }. */
    tick(dtReal, inputs = {}) {
      const events = [];
      if (paused || left || G.over) return { events, alpha: 1 };
      // remember this frame's presses until a step takes them (a 144 Hz screen sees frames with no step)
      for (const [pid, inp] of Object.entries(inputs)) {
        const c = carry[pid] || (carry[pid] = {});
        for (const k of EDGES) if (inp[k]) c[k] = true;
      }
      acc += Math.min(MAX_FRAME, Math.max(0, dtReal));
      while (acc >= STEP) {
        acc -= STEP;
        for (const e of G.heroes) snap(e);
        for (const e of G.foes) snap(e);
        const now = {};
        for (const [pid, inp] of Object.entries(inputs)) {
          now[pid] = { mx: inp.mx || 0, mz: inp.mz || 0, block: !!inp.block, spell1Held: !!inp.spell1Held, spell2Held: !!inp.spell2Held };
          const c = carry[pid] || {};
          for (const k of EDGES) now[pid][k] = !!c[k];
          carry[pid] = {};
        }
        step(G, now);
        // a new foe this step has no previous position yet
        for (const f of G.foes) if (f.px === undefined) snap(f);
        events.push(...G.events);
        if (G.over) { acc = 0; break; }
      }
      return { events, alpha: acc / STEP };
    },
  };
  return s;
}
