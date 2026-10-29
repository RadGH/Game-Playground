// Level bots for Act III "The Alchemist's Road" (see tools/bot.mjs). t = bot turn (one every 5 ticks).
// Each bot plays roughly as a person would: a few actions a second at most, aimed at what matters.

const monster = (c) => c.team === 'monster';
function centroid(s, pred) {
  let x = 0, y = 0, n = 0, vx = 0, vy = 0;
  for (const c of s.sim.creatures.list) if (c.alive && pred(c)) { x += c.x; y += c.y; vx += c.vx || 0; vy += c.vy || 0; n++; }
  return n ? { x: x / n, y: y / n, vx: vx / n, vy: vy / n, n } : null;
}
/** The lowest (southmost) row lava has reached, and its x range there. */
function lavaFront(s, band = 6) {
  const w = s.sim.world, ID = s.sim.M.id;
  let maxY = -1;
  for (let i = w.N - 1; i >= 0; i--) if (w.mat[i] === ID.lava) { maxY = (i / w.W) | 0; break; }
  if (maxY < 0) return null;
  let minX = 1e9, maxX = -1;
  for (let i = Math.max(0, maxY - band) * w.W; i < (maxY + 1) * w.W; i++) if (w.mat[i] === ID.lava) { const x = i % w.W; minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  return { y: maxY, minX, maxX };
}
const near = (s, x, y, r, pred) => s.sim.creatures.nearest(x, y, r, pred);
const wet = (s, c) => { const w = s.sim.world; const m = w.mat[(c.y | 0) * w.W + (c.x | 0)]; return m === s.sim.M.id.water; };

export default {
  // Blackwater Ford: water on the lava front makes obsidian; lightning the raiders who wade in
  '3-1'(s, t) {
    const v = s.sim.village.list[0];
    if (t % 10 === 0) {
      const f = lavaFront(s);
      if (f && f.y > 40) {
        if (s.mana.cur > 30) s.use('spell:frost', (f.minX + f.maxX) / 2, f.y);
        for (let x = f.minX - 2; x <= f.maxX + 2 && s.mana.cur > 8; x += 5) s.use('material:water', x, f.y + 4, { brush: 3 });
      }
    }
    if (t % 4 === 2) {
      const m = near(s, v.x, v.y, 80, monster);
      if (!m) return;
      if (m.sp.id === 'imp' && s.mana.cur > 16) s.use('spell:frost', m.x, m.y);
      else if (wet(s, m) && s.mana.cur > 8) s.use('spell:lightning', m.x, m.y);
      else if (s.mana.cur > 20) s.use('spell:fireball', m.x + (m.vx || 0) * 20, m.y + (m.vy || 0) * 20);
    }
  },

  // The Long Fuse: a powder line across the pass, lit when a band is on it; the camp stores when it is full
  '3-2'(s, t) {
    const w = s.sim.world, ID = s.sim.M.id, v = s.sim.village.list[0];
    const Y = 128;
    const st = s._fuse || (s._fuse = { laid: false, at: 0 });
    if (t === 2) for (let k = 0; k < 2; k++) s.use('creature:archer', v.x - 4 + k * 8, v.y - 12);
    if (!st.laid && t > 3 && s.mana.cur > 26) {
      for (let x = 58; x <= 102; x++) s.use('material:blackpowder', x, Y, { brush: 0 });
      st.laid = true;
    }
    if (st.laid) {
      let on = 0;
      s.sim.creatures.near(80, Y, 24, (c) => { if (c.team === 'monster' && Math.abs(c.y - Y) < 7) on++; });
      if (on >= 6) { s.use('tool:torch', 59, Y, { brush: 1 }); st.laid = false; }
    }
    // the camp's own stores, when a band is mustering on top of them
    if (t % 6 === 0) {
      let inCamp = 0;
      s.sim.creatures.near(80, 40, 18, (c) => { if (c.team === 'monster') inCamp++; });
      if (inCamp >= 12) for (const [x, y] of [[70, 34], [92, 36], [80, 26]]) if (w.mat[y * w.W + x] === ID.blackpowder) { s.use('spell:lightning', x, y); break; }
    }
    if (t % 40 === 20 && w.stats.burning > 30 && s.mana.cur > 20) s.use('spell:rain', v.x, v.y - 25);
    if (t % 6 === 3 && s.mana.cur > 20) {
      const m = s.sim.creatures.nearest(v.x, v.y, 40, monster);
      if (m) s.use('spell:lightning', m.x, m.y);
    }
  },

  // Rime and Cinder: frost the thickest knot of fire spirits near the village, rain on fires, rimelings on guard
  '3-3'(s, t) {
    const w = s.sim.world, v = s.sim.village.list[0];
    const fiery = (c) => c.alive && c.sp.tags.has('fiery') && Math.hypot(c.x - v.x, c.y - v.y) < 90;
    if (t === 3) for (const dx of [-14, 14]) s.use('creature:rimeling', v.x + dx, v.y - 12);
    if (t % 3 === 0 && s.mana.cur > 14) {
      let best = null, bn = 0;
      for (const c of s.sim.creatures.list) if (fiery(c)) {
        let n = 0; s.sim.creatures.near(c.x, c.y, 8, (o) => { if (o.sp.tags.has('fiery')) n += o.sp.id === 'flamewraith' ? 2 : 1; });
        n += Math.max(0, 60 - Math.hypot(c.x - v.x, c.y - v.y)) / 20;
        if (n > bn) { bn = n; best = c; }
      }
      if (best && (bn >= 3 || Math.hypot(best.x - v.x, best.y - v.y) < 35)) s.use('spell:frost', best.x + (best.vx || 0) * 10, best.y + (best.vy || 0) * 10);
    }
    if (t % 30 === 15 && w.stats.burning > 20 && s.mana.cur > 30) {
      // rain on the fire closest to the houses
      let bx = 0, by = 0, bd = 1e9;
      for (let k = 0; k < 600; k++) { const x = (Math.random() * w.W) | 0, y = (Math.random() * w.H) | 0; if (w.flag[y * w.W + x] & 1) { const d = Math.hypot(x - v.x, y - v.y); if (d < bd) { bd = d; bx = x; by = y; } } }
      if (bd < 45) s.use('spell:rain', bx, by);
    }
  },

  // Gallowmere Keep: bile on the walls where the outlaws crowd, Bile Rain over the yard, lightning on the raiders
  '3-4'(s, t) {
    const v = s.sim.village.list[0];
    if (t === 2) s.use('creature:knight', v.x, v.y - 14);
    if (t > 4 && t % 24 === 4 && s.mana.cur > 20) {
      const spots = [[60, 71], [101, 71], [80, 74], [56, 52], [104, 52]];
      const [x, y] = spots[(t / 24 | 0) % spots.length];
      for (let k = -1; k <= 1; k++) s.use('material:acid', x + k * 3, y, { brush: 3 });
    }
    if (t % 60 === 30 && s.mana.cur > 40) s.use('spell:acidrain', 80, 56);
    if (t % 5 === 0 && s.mana.cur > 16) {
      const m = s.sim.creatures.nearest(v.x, v.y, 70, monster);
      if (m) s.use('spell:lightning', m.x, m.y);
    }
  },

  // The Drowned Graves: Healing Light on the dead near the village, Blessed Rain and blessed water into the bog
  '3-5'(s, t) {
    const w = s.sim.world, ID = s.sim.M.id, v = s.sim.village.list[0];
    if (t % 4 === 0) {
      const g = centroid(s, (c) => monster(c) && Math.hypot(c.x - v.x, c.y - v.y) < 60);
      if (g && g.n >= 2 && s.mana.cur > 14) { s.use('spell:heal', g.x, g.y); return; }
    }
    if (t % 4 === 2 && s.mana.cur > 40) {
      // the goo left in the bog: rain on its middle, pour on its edge
      let x = 0, y = 0, n = 0, ex = 0, ey = 0;
      for (let yy = 28; yy < 90; yy += 2) for (let xx = 50; xx < 110; xx += 2) if (w.mat[yy * w.W + xx] === ID.goo) { x += xx; y += yy; n++; if (yy > ey) { ey = yy; ex = xx; } }
      if (!n) return;
      if (s.use('spell:holyrain', x / n, y / n).ok) return;
      if (s.mana.cur > 60) s.use('material:holy', x / n, y / n, { brush: 3 });
    }
  },

  // The Crucible: each foe gets its opposite; the crystal ring when a crowd stands in it; lava held off like 3-1
  '3-6'(s, t) {
    const w = s.sim.world, ID = s.sim.M.id, v = s.sim.village.list[0];
    if (t % 6 === 0) {
      let n = 0;
      s.sim.creatures.near(88, 92, 26, (c) => { if (monster(c)) n++; });
      if (n >= 8) for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + Math.PI / 8, x = Math.round(88 + Math.cos(a) * 15), y = Math.round(90 + Math.sin(a) * 15);
        if (w.mat[y * w.W + x] === ID.crystal) { s.use('spell:lightning', x, y); return; }
      }
    }
    if (t % 10 === 5) {
      const f = lavaFront(s);
      if (f && f.y > 100) {
        s.use('spell:earth', Math.max(1, f.minX - 10), f.y + 6, { x2: Math.min(w.W - 2, f.maxX + 10), y2: f.y + 6 });
        if (s.mana.cur > 40) s.use('spell:frost', (f.minX + f.maxX) / 2, f.y);
      }
    }
    if (t % 30 === 20 && w.stats.burning > 20 && s.mana.cur > 30) s.use('spell:rain', v.x, v.y - 20);
    if (t % 3 === 1) {
      const m = s.sim.creatures.nearest(v.x, v.y, 80, monster);
      if (!m) return;
      const id = m.sp.id;
      if (m.sp.tags.has('fiery')) { if (s.mana.cur > 16) s.use('spell:frost', m.x, m.y); }
      else if (m.sp.undead) { if (s.mana.cur > 14) s.use('spell:heal', m.x, m.y); }
      else if (s.mana.cur > 10) s.use(id === 'slime' ? 'spell:fireball' : 'spell:lightning', m.x, m.y);
    }
  },
};
