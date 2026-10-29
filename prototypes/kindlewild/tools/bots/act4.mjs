// Level bots for Act IV "Stormcrown" (see tools/bot.mjs). t = bot turn (one every 5 ticks).

const monster = (c) => c.team === 'monster';
function centroid(s, pred) {
  let x = 0, y = 0, n = 0, vx = 0, vy = 0;
  for (const c of s.sim.creatures.list) if (c.alive && pred(c)) { x += c.x; y += c.y; vx += c.vx || 0; vy += c.vy || 0; n++; }
  return n ? { x: x / n, y: y / n, vx: vx / n, vy: vy / n, n } : null;
}
/** The biggest knot of creatures matching pred (centre of the best of a few samples). */
function knot(s, pred, r = 14) {
  let best = null, bn = 0;
  const list = s.sim.creatures.list.filter(c => c.alive && pred(c));
  for (let k = 0; k < Math.min(12, list.length); k++) {
    const c = list[(Math.random() * list.length) | 0];
    let n = 0, x = 0, y = 0;
    s.sim.creatures.near(c.x, c.y, r, (o) => { if (pred(o)) { n++; x += o.x; y += o.y; } });
    if (n > bn) { bn = n; best = { x: x / n, y: y / n, n }; }
  }
  return best;
}
function fireNear(s, x, y, r) {
  const w = s.sim.world;
  let bx = 0, by = 0, bd = 1e9;
  for (let k = 0; k < 600; k++) { const xx = (Math.random() * w.W) | 0, yy = (Math.random() * w.H) | 0; if (w.flag[yy * w.W + xx] & 1) { const d = Math.hypot(xx - x, yy - y); if (d < bd) { bd = d; bx = xx; by = yy; } } }
  return bd < r ? { x: bx, y: by } : null;
}
const flyers = (c) => monster(c) && c.sp.flies;

export default {
  // Thunder on the Downs: storms ahead of the host (the north wind carries them into it), bolts only at the end
  '4-1'(s, t) {
    const v = s.sim.village.list[0];
    if (t % 8 === 0 && s.mana.cur > 26) {
      const k = knot(s, monster, 16);
      if (k && k.n >= 6) s.use('spell:storm', k.x, k.y + 10);
    }
    // a bolt into a stream while a crowd is wading it hits all of them
    if (t % 3 === 1 && s.mana.cur > 10) {
      const w = s.sim.world, WATER = s.sim.M.id.water;
      const wading = s.sim.creatures.list.filter(c => c.alive && monster(c) && w.mat[(c.y | 0) * w.W + (c.x | 0)] === WATER);
      if (wading.length >= 7) { const c = wading[0]; s.use('spell:lightning', c.x, c.y); return; }
    }
    if (t % 4 === 2 && s.mana.cur > 40) {
      const m = s.sim.creatures.nearest(v.x, v.y, 30, monster);
      if (m) s.use('spell:lightning', m.x, m.y);
    }
    if (t % 40 === 20 && s.sim.world.stats.burning > 30 && s.mana.cur > 20) { const f = fireNear(s, v.x, v.y, 45); if (f) s.use('spell:rain', f.x, f.y + 4); }
  },
  // The Griffin Moor: archers by the flock, missiles at the closest griffin, a barrier when one is on top of the sheep
  '4-2'(s, t) {
    const flock = centroid(s, (c) => c.sp.id === 'sheep' && c.tag === 'flock');
    if (!flock) return;
    if (t === 2) for (let k = 0; k < 4; k++) s.use('creature:archer', flock.x - 9 + k * 6, flock.y + 8);
    const g = s.sim.creatures.nearest(flock.x, flock.y, 70, (c) => c.sp.id === 'griffin');
    if (!g) return;
    const w = s.sim.world;
    if (Math.hypot(g.x - flock.x, g.y - flock.y) < 20 && !(w.barriers && w.barriers.length) && s.mana.cur > 22) s.use('spell:barrier', flock.x, flock.y);
    if (t % 4 === 0 && s.mana.cur > 14) s.use('spell:missiles', g.x, g.y);
    else if (t % 4 === 2 && s.mana.cur > 30) s.use('spell:lightning', g.x + (g.vx || 0) * 3, g.y + (g.vy || 0) * 3);
  },
  // Eye of the Gale: a whirlwind into each swarm, a gale to steer it away from the village, a barrier if it strays
  '4-3'(s, t) {
    const v = s.sim.village.list[0], w = s.sim.world;
    const tw = s.sim.spells.active.find(a => a.kind === 'tornado');
    if (!tw && t % 4 === 0 && s.mana.cur > 35) {
      const k = knot(s, monster, 14);
      if (k && k.n >= 15 && Math.hypot(k.x - v.x, k.y - v.y) > 30) s.use('spell:tornado', k.x, k.y);
    }
    if (tw && t % 6 === 0) {
      // steer: toward the nearest swarm, never toward the houses
      const k = knot(s, monster, 14);
      if (k) {
        let dx = k.x - tw.x, dy = k.y - tw.y;
        if (Math.hypot(tw.x - v.x, tw.y - v.y) < 40) { dx = tw.x - v.x; dy = tw.y - v.y; }
        s.use('spell:gale', tw.x, tw.y, { x2: tw.x + dx, y2: tw.y + dy });
      }
      if (Math.hypot(tw.x - v.x, tw.y - v.y) < 30 && !(w.barriers && w.barriers.length) && s.mana.cur > 22) s.use('spell:barrier', v.x, v.y);
    }
    if (t % 3 === 1 && s.mana.cur > 50) {
      const m = s.sim.creatures.nearest(v.x, v.y, 26, monster);
      if (m) s.use('spell:fireball', m.x, m.y);
    }
    if (t % 40 === 20 && w.stats.burning > 30 && s.mana.cur > 20) { const f = fireNear(s, v.x, v.y, 40); if (f) s.use('spell:rain', f.x, f.y + 4); }
  },
  // Three on the Wing: archers in the village, missiles on the closest wyrm, a barrier over the roofs, rain on fires
  '4-4'(s, t) {
    const v = s.sim.village.list[0], w = s.sim.world;
    if (t === 2) for (let k = 0; k < 4; k++) s.use('creature:archer', v.x - 8 + k * 5, v.y + 8);
    const d = s.sim.creatures.nearest(v.x, v.y, 90, (c) => c.sp.id === 'wyrmling');
    if (d && Math.hypot(d.x - v.x, d.y - v.y) < 35 && !(w.barriers && w.barriers.length) && s.mana.cur > 22) s.use('spell:barrier', v.x, v.y);
    if (d && t % 4 === 0 && s.mana.cur > 14) s.use('spell:missiles', d.x, d.y);
    if (t % 30 === 15 && w.stats.burning > 10 && s.mana.cur > 30) { const f = fireNear(s, v.x, v.y, 30); if (f) s.use('spell:rain', f.x, f.y + 4); }
  },
  // Ashes and Wings: frost + missiles on the phoenix, rain between the burning wood and the village
  '4-5'(s, t) {
    const v = s.sim.village.list[0], w = s.sim.world;
    if (t === 2) for (let k = 0; k < 3; k++) s.use('creature:archer', v.x - 6 + k * 6, v.y - 14);
    const p = s.sim.creatures.list.find(c => c.alive && c.sp.id === 'phoenix');
    if (p && t % 4 === 0 && s.mana.cur > 16) s.use('spell:frost', p.x, p.y);
    else if (p && t % 4 === 2 && s.mana.cur > 14) s.use('spell:missiles', p.x, p.y);
    if (t % 18 === 9 && w.stats.burning > 10 && s.mana.cur > 20) { const f = fireNear(s, v.x, v.y, 70); if (f) s.use('spell:rain', f.x, f.y + 6); }
    if (t % 4 === 1) { const m = s.sim.creatures.nearest(v.x, v.y, 50, (c) => c.sp.id === 'imp'); if (m && s.mana.cur > 30) s.use('spell:frost', m.x, m.y); }
  },
  // The Storm's Eye: barrier over the village whenever a flyer or a storm is close, missiles at flyers, gale the clouds off
  '4-6'(s, t) {
    const v = s.sim.village.list[0], w = s.sim.world;
    if (t === 2) for (let k = 0; k < 4; k++) s.use('creature:archer', v.x - 8 + k * 5, v.y + 8);
    const storm = w.rain.find(c => c.storm && Math.hypot(c.x - v.x, c.y - v.y) < c.r + 20);
    const f = s.sim.creatures.nearest(v.x, v.y, 60, flyers);
    // two domes side by side cover the houses
    const domes = w.barriers ? w.barriers.length : 0;
    if ((storm || f) && domes < 2 && s.mana.cur > 22) s.use('spell:barrier', v.x + (domes ? 9 : -9), v.y);
    if (storm && t % 20 === 0 && s.mana.cur > 10) s.use('spell:gale', storm.x, storm.y, { x2: storm.x + (storm.x - v.x), y2: storm.y + (storm.y - v.y) });
    const d = s.sim.creatures.nearest(v.x, v.y, 100, flyers);
    if (d && t % 3 === 0 && s.mana.cur > 14) s.use('spell:missiles', d.x, d.y);
    else if (d && t % 3 === 1 && s.mana.cur > 40) s.use('spell:lightning', d.x + (d.vx || 0) * 3, d.y + (d.vy || 0) * 3);
    if (t % 3 === 2) { const m = s.sim.creatures.nearest(v.x, v.y, 70, (c) => c.sp.id === 'imp'); if (m && s.mana.cur > 30) s.use('spell:frost', m.x, m.y); }
    if (t % 20 === 10 && w.stats.burning > 10 && s.mana.cur > 30) { const fi = fireNear(s, v.x, v.y, 35); if (fi) s.use('spell:rain', fi.x, fi.y + 4); }
  },
};
