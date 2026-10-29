// Level bots for Act V "The Hollow Dark" (see tools/bot.mjs). t = bot turn (one every 5 ticks, 6 a second).
// Each bot plays roughly as a person would: a few actions a second at most, aimed at what matters.

const monster = (c) => c.team === 'monster';
const near = (s, x, y, r, pred) => s.sim.creatures.nearest(x, y, r, pred);
/** The densest spot of creatures matching pred within r of (x, y): { x, y, n } (n = how many within rad). */
function cluster(s, x, y, r, rad, pred) {
  const list = [];
  s.sim.creatures.near(x, y, r, (c) => { if (pred(c)) list.push(c); });
  let best = null;
  for (const c of list) {
    let n = 0;
    for (const o of list) if ((o.x - c.x) ** 2 + (o.y - c.y) ** 2 < rad * rad) n++;
    if (!best || n > best.n) best = { x: c.x, y: c.y, n };
  }
  return best;
}
const sp = (id) => (c) => c.alive && c.sp.id === id;
/** A burning cell near (x, y), sampled (null if none found). */
function densestFire(s, x, y, r) {
  const w = s.sim.world;
  let best = null, bd = 1e9;
  for (let k = 0; k < 600; k++) {
    const xx = (x + (Math.random() - 0.5) * r * 2) | 0, yy = (y + (Math.random() - 0.5) * r * 2) | 0;
    if (!w.inside(xx, yy) || !(w.flag[yy * w.W + xx] & 1)) continue;
    const d = Math.hypot(xx - x, yy - y);
    if (d < bd) { bd = d; best = { x: xx, y: yy }; }
  }
  return best;
}
/** The centre of the 24-cell square (step `cell`) holding the most of a material inside a circle. */
function densest(s, mat, zx, zy, zr, cell = 12) {
  const w = s.sim.world, m = s.sim.M.id[mat];
  let best = null;
  for (let y0 = zy - zr; y0 < zy + zr; y0 += cell) for (let x0 = zx - zr; x0 < zx + zr; x0 += cell) {
    let n = 0;
    for (let y = y0; y < y0 + cell * 2; y++) for (let x = x0; x < x0 + cell * 2; x++) if (w.inside(x, y) && w.mat[y * w.W + x] === m) n++;
    if (n && (!best || n > best.n)) best = { x: x0 + cell, y: y0 + cell, n };
  }
  return best;
}

export default {
  // The Restless Yard: archers early, Healing Light on packs of bones, fireballs on stragglers
  '5-1'(s, t) {
    const v = s.sim.village.list[0];
    if (t === 2) for (let k = 0; k < 3; k++) s.use('creature:archer', v.x - 8 + k * 8, v.y - 14);
    if (t % 6 !== 0) return;
    const c = cluster(s, v.x, v.y - 20, 70, 11, sp('skeleton'));
    if (c && c.n >= 3 && s.mana.cur > 14) { s.use('spell:heal', c.x, c.y + 2); return; }
    const m = near(s, v.x, v.y, 60, monster);
    if (m && s.mana.cur > 10) s.use('spell:fireball', m.x, m.y + 2);
  },
  // The Splitting Bog: set them alight with the torch, fireball only the little ones, frost a big pack
  '5-2'(s, t) {
    const v = s.sim.village.list[0];
    if (t === 2) for (let k = 0; k < 3; k++) s.use('creature:archer', v.x - 10 + k * 10, v.y - 16);
    if (t % 30 === 0 && (s.sim.creatures.counts.archer || 0) < 8 && s.mana.cur > 50) s.use('creature:archer', v.x - 14 + (t % 4) * 9, v.y - 18);
    if (t % 4 !== 0) return;
    const list = s.sim.creatures.list.filter(c => c.alive && c.sp.id === 'slime').sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y));
    for (const m of list.slice(0, 4)) {
      const d = Math.hypot(m.x - v.x, m.y - v.y);
      // keep the fire away from the thatch
      if (!m.burning && m.y < 140 && s.mana.cur > 10) { const ax = m.x + (v.x - m.x) * 0.06, ay = m.y + 5; s.use('spell:firewall', ax - 7, ay, { x2: ax + 7, y2: ay }); continue; }
      if (m.maxHp <= 16 && d > 26 && s.mana.cur > 12) { s.use('spell:fireball', m.x, m.y); break; }
      if (d < 26 && s.mana.cur > 16 && !m.frozen) { s.use('spell:frost', m.x, m.y); break; }
    }
    const c = cluster(s, v.x, v.y, 60, 8, sp('slime'));
    if (c && c.n >= 3 && s.mana.cur > 40) s.use('spell:frost', c.x, c.y);
  },
  // Mire of the Drowned: blessed rain over each pool in turn, Healing Light on the risen near the village
  '5-3'(s, t) {
    const v = s.sim.village.list[0];
    // blessed rain on whichever pool still holds the most goo
    if (t % 40 === 0 && s.mana.cur > 24) { const p = densest(s, 'goo', 80, 64, 68, 12); if (p) s.use('spell:holyrain', p.x, p.y); }
    if (t % 8 === 4) {
      const c = cluster(s, v.x, v.y - 20, 70, 11, sp('skeleton'));
      if (c && c.n >= 2 && s.mana.cur > 40) s.use('spell:heal', c.x, c.y + 2);
    }
  },
  // The Hollowing: Sunlance the orb closest to the village, blessed water on void near the houses
  '5-4'(s, t) {
    const v = s.sim.village.list[0];
    if (t % 6 === 0) {
      const m = near(s, v.x, v.y, 200, sp('hollow'));
      if (!m) return;
      if (s.mana.cur > 22 && s.cooldown('spell:smite') <= 0) s.use('spell:smite', m.x, m.y);
      else if (s.mana.cur > 14 && m.hp < 40) s.use('spell:heal', m.x, m.y);
      else if (s.mana.cur > 30 && t % 60 === 0) s.use('spell:holyrain', m.x, m.y + 6);
    }
    // blessed water on void eating into the village
    if (t % 30 === 15) {
      const p = densest(s, 'void', v.x, v.y - 10, 30, 6);
      if (p && p.n > 6 && s.mana.cur > 20) s.use('material:holy', p.x, p.y, { brush: 4 });
    }
  },
  // Wraithfire: rain on the wraiths (the wind carries it south), frost on a pack, lightning to finish
  '5-5'(s, t) {
    const v = s.sim.village.list[0], w = s.sim.world;
    if (t % 6 !== 0) return;
    // fire close to the roofs first
    if (t % 12 === 0 && w.stats.burning > 0) {
      const f = densestFire(s, v.x, v.y, 45);
      if (f && s.mana.cur > 10) { s.use('spell:rain', f.x, f.y - 3); return; }
    }
    const m = near(s, v.x, v.y, 200, sp('flamewraith'));
    if (!m) return;
    const d = Math.hypot(m.x - v.x, m.y - v.y);
    if (d < 70 && s.mana.cur > 16) { s.use('spell:frost', m.x, m.y); return; }
    if (s.mana.cur > 60) s.use('spell:frost', m.x, m.y);
    else if (s.mana.cur > 30 && d < 100) s.use('spell:lightning', m.x, m.y);
  },
  // The Bone Throne: everything at once
  '5-6'(s, t) {
    const v = s.sim.village.list[0];
    if (t === 2) { s.use('creature:knight', v.x - 10, v.y - 16); s.use('creature:knight', v.x + 10, v.y - 16); }
    if (t % 50 === 10 && s.mana.cur > 40) { s.use('spell:holyrain', 44, 78); }
    if (t % 50 === 35 && s.mana.cur > 40) { s.use('spell:holyrain', 132, 78); }
    if (t % 6 !== 0) return;
    const h = near(s, v.x, v.y, 120, sp('hollow'));
    if (h && s.mana.cur > 22 && Math.hypot(h.x - v.x, h.y - v.y) < 90) { s.use('spell:smite', h.x, h.y); return; }
    const troll = near(s, v.x, v.y, 60, sp('troll'));
    if (troll && s.mana.cur > 22) { s.use('spell:smite', troll.x, troll.y); return; }
    const c = cluster(s, v.x, v.y - 20, 70, 11, sp('skeleton'));
    if (c && c.n >= 3 && s.mana.cur > 14) { s.use('spell:heal', c.x, c.y + 2); return; }
    const m = near(s, v.x, v.y, 50, monster);
    if (m && s.mana.cur > 10) s.use('spell:fireball', m.x, m.y + 2);
  },
};
