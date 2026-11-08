// Draw the Disaster CPU: it cannot read its prompt like a person, so it draws one of the kit's simple stock pictures,
// stroke by stroke at a doodler's pace, in a few colours, then says done. In the vote it picks someone else's picture,
// leaning to the fuller ones (as people do). Skill only changes how much it puts in: Family draws a quick one-colour
// sketch, Tricky fills it out in more colours with an extra doodle or two.
import { by, drawingFor, readDelay, later, pickBest } from '../cpu-kit.js';
import { measure } from './sim.js';

const hex2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export function createCpu(c) {
  const sk = c.skill, mem = { sid: 0, plan: null, art: null };
  const colours = by(sk, [1, 2, 4]), extra = by(sk, [0, 1, 3]), per = by(sk, [1.6, 1.1, 0.9]);
  function makePlan() {
    const strokes = drawingFor(c.rng, 230, 230);
    for (let i = 0; i < extra; i++) strokes.push(drawingFor(c.rng, 70, 70)[0].map(([x, y]) => [x + 10 + (i * 70) % 160, y + 10]));
    const pal = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => c.rng() - 0.5).slice(0, colours);
    return strokes.map((s, i) => ({ c: pal[i % pal.length], w: i === 0 ? 1 : (c.rng() < 0.3 ? 1 : 0), p: s.map(([x, y]) => hex2(x + 12) + hex2(y + 12)).join('') }));
  }
  return {
    tick(v) {
      const g = v.g, p = v.priv; if (!g) return;
      for (const e of v.events) if (e.e === 'art') mem.art = e.art;
      if (g.phase === 'draw') {
        mem.plan ||= makePlan();
        mem.next ??= v.t + readDelay(sk, c.rng, 2);
        if (v.t < mem.next) return;
        if (mem.plan.length) { const s = mem.plan.shift(); v.act('ink', { s: ++mem.sid, c: s.c, w: s.w, p: s.p }); mem.next = v.t + per * (0.7 + c.rng() * 0.6); }
        else if (!p?.done) v.act('done', true);
        return;
      }
      if (g.phase === 'vote' && p && p.vote == null && p.mine != null) later(mem, v, 'vote', () => {
        const art = mem.art || v.init?.art || [];
        const opts = art.map((a, i) => i).filter(i => i !== p.mine && art[i]?.k?.length);
        if (!opts.length) { if (art.length === 2) v.act('vote', 'both'); return; }
        v.act('vote', pickBest(opts, i => { const m = measure(art[i].k); return m.strokes + m.colours * 2; }, sk, c.rng));
      }, readDelay(sk, c.rng, 3));
    },
  };
}
