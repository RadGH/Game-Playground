// Level bots for Act VI "Wyrmfall" (see tools/bot.mjs). t = bot turn (one every 5 ticks, 6 a second).
// Each bot plays roughly as a person would: a few actions a second at most, aimed at what matters.

const monster = (c) => c.team === 'monster';
const near = (s, x, y, r, pred) => s.sim.creatures.nearest(x, y, r, pred);
const sp = (...ids) => (c) => c.alive && ids.includes(c.sp.id);
const ready = (s, page, mana) => s.mana.cur > mana && s.cooldown(page) <= 0;
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
/** Hold the lava: a ridge across the front, frost on it when it gets close. */
function holdLava(s, t, v, { frostAt = 60 } = {}) {
  if (t % 12 !== 0) return;
  const f = lavaFront(s);
  if (!f || f.y < 30) return;
  const y = f.y + 5;
  if (s.mana.cur > 20) s.use('spell:earth', Math.max(1, f.minX - 12), y, { x2: Math.min(s.sim.world.W - 2, f.maxX + 12), y2: y });
  if (v.y - f.y < frostAt && ready(s, 'spell:frost', 40)) s.use('spell:frost', (f.minX + f.maxX) / 2, f.y);
}
/** Shoot at the flyer (or anything) closest to the village. */
function shootNearest(s, v, r, pred) {
  const m = near(s, v.x, v.y, r, pred);
  if (!m) return null;
  if (ready(s, 'spell:missiles', 16)) s.use('spell:missiles', m.x, m.y);
  else if (ready(s, 'spell:lightning', 30) && !m.sp.flies) s.use('spell:lightning', m.x, m.y);
  return m;
}

export default {
  // Smoke over Cindercrag: missiles at the wyrmlings, a ridge across the lava
  '6-1'(s, t) {
    const v = s.sim.village.list[0];
    if (t === 2) for (let k = 0; k < 3; k++) s.use('creature:archer', v.x - 10 + k * 10, v.y - 14);
    holdLava(s, t, v);
    if (t % 5 === 0) shootNearest(s, v, 200, sp('wyrmling'));
  },
  // Twin Fires: archers, then missiles on the more hurt dragon, a barrier when one dives at the roofs
  '6-2'(s, t) {
    const v = s.sim.village.list[0], w = s.sim.world;
    if (t === 2) { for (let k = 0; k < 3; k++) s.use('creature:archer', v.x - 8 + k * 8, v.y + 8); }
    const ds = s.sim.creatures.list.filter(sp('dragon', 'wyrmling')).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    if (!ds.length) return;
    const d = ds.find(c => c.sp.id === 'dragon') || ds[0];
    // the dome over the roofs comes first: keep mana for it
    const close = ds.some(c => Math.hypot(c.x - v.x, c.y - v.y) < 50);
    const domed = (w.barriers || []).some(b => b.ttl > 45);
    if (close && !domed && ready(s, 'spell:barrier', 22)) { s.use('spell:barrier', v.x, v.y); return; }
    if (t % 30 === 0 && w.stats.burning > 60 && s.mana.cur > 40) { s.use('spell:rain', v.x, v.y); return; }
    if (t % 6 === 0 && ready(s, 'spell:missiles', 40)) s.use('spell:missiles', d.x, d.y);
  },
  // Night of Falling Stars: a barrier over the village when a star is coming down near it, missiles at the rest
  '6-3'(s, t) {
    const v = s.sim.village.list[0], w = s.sim.world;
    if (t === 2) for (let k = 0; k < 3; k++) s.use('creature:archer', v.x - 10 + k * 10, v.y - 12);
    const danger = (w.warnings || []).some(a => Math.hypot(a.x - v.x, a.y - v.y) < 28);
    const covered = (w.barriers || []).some(b => Math.hypot(b.x - v.x, b.y - v.y) < 6 && b.ttl > 60);
    if (danger && !covered && ready(s, 'spell:barrier', 22)) { s.use('spell:barrier', v.x, v.y - 2); return; }
    if (t % 5 !== 0) return;
    const troll = near(s, v.x, v.y, 60, sp('troll'));
    if (troll && ready(s, 'spell:frost', 50)) { s.use('spell:frost', troll.x, troll.y); return; }
    const imps = near(s, v.x, v.y, 70, sp('imp'));
    if (imps && ready(s, 'spell:frost', 40)) { s.use('spell:frost', imps.x, imps.y); return; }
    shootNearest(s, v, 120, monster);
    if (t % 60 === 0 && w.stats.burning > 10 && s.mana.cur > 40) s.use('spell:rain', v.x, v.y - 6);
  },
  // The Wyrm's Hoard: meteors on the clutch, missiles on the hatchlings and on the mother once she leaves
  '6-4'(s, t) {
    const v = s.sim.village.list[0], w = s.sim.world;
    if (t === 2) { s.use('creature:knight', v.x - 8, v.y - 14); s.use('creature:knight', v.x + 8, v.y - 14); }
    if (ready(s, 'spell:meteor', 40) && t % 12 === 0) {
      // the nest that still has the most eggs
      const w = s.sim.world, egg = s.sim.M.id.dragonegg;
      let best = null;
      for (const [x, y] of [[30, 72], [130, 72], [56, 40], [104, 40], [80, 88]]) {
        let n = 0;
        for (let yy = y - 4; yy <= y + 4; yy++) for (let xx = x - 4; xx <= x + 4; xx++) if (w.mat[yy * w.W + xx] === egg) n++;
        if (n && (!best || n > best.n)) best = { x, y, n };
      }
      if (best) s.use('spell:meteor', best.x, best.y);
    }
    if (t % 6 === 3) {
      const hatch = near(s, v.x, v.y, 200, sp('wyrmling'));
      const mom = s.sim.creatures.list.find(c => c.alive && c.sp.id === 'dragon' && !c.leash);
      const target = hatch && Math.hypot(hatch.x - v.x, hatch.y - v.y) < 90 ? hatch : mom || hatch;
      // a hatchling near the roofs comes before the next falling star
      if (target && (s.mana.cur > 54 || (hatch && Math.hypot(hatch.x - v.x, hatch.y - v.y) < 50 && s.mana.cur > 14))) s.use('spell:missiles', target.x, target.y);
      if (mom && Math.hypot(mom.x - v.x, mom.y - v.y) < 40 && !(w.barriers && w.barriers.length) && ready(s, 'spell:barrier', 22)) s.use('spell:barrier', v.x, v.y);
    }
  },
  // Three Mouths: ridges and frost on the lava, missiles at the flyers, frost on imps
  '6-5'(s, t) {
    const v = s.sim.village.list[0];
    if (t === 2) for (let k = 0; k < 2; k++) s.use('creature:archer', v.x - 8 + k * 16, v.y - 12);
    holdLava(s, t, v, { frostAt: 70 });
    if (t % 6 !== 3) return;
    const imp = near(s, v.x, v.y, 60, sp('imp'));
    if (imp && ready(s, 'spell:frost', 30)) { s.use('spell:frost', imp.x, imp.y); return; }
    shootNearest(s, v, 120, sp('wyrmling'));
  },
  // The Elder Wyrm: archers and mages, missiles every recharge, lightning when there is mana to spare,
  // a barrier over the roofs when it dives, chain lightning into the brood
  '6-6'(s, t) {
    const v = s.sim.village.list[0], w = s.sim.world;
    if (t === 2) { for (let k = 0; k < 4; k++) s.use('creature:archer', v.x - 12 + k * 8, v.y + 10); s.use('creature:mage', v.x - 4, v.y + 14); s.use('creature:mage', v.x + 4, v.y + 14); }
    const e = s.sim.creatures.list.find(sp('elderwyrm'));
    if (!e) return;
    const brood = s.sim.creatures.list.filter(sp('wyrmling'));
    const close = [e, ...brood].some(c => Math.hypot(c.x - v.x, c.y - v.y) < 55);
    const falling = (w.warnings || []).some(a => Math.hypot(a.x - v.x, a.y - v.y) < 30);
    const domed = (w.barriers || []).some(b => b.ttl > 45);
    if ((close || falling) && !domed && ready(s, 'spell:barrier', 22)) { s.use('spell:barrier', v.x, v.y); return; }
    if (t % 30 === 0 && w.stats.burning > 60 && s.mana.cur > 40) { s.use('spell:rain', v.x, v.y); return; }
    if (brood.length >= 3 && ready(s, 'spell:chain', 50)) { s.use('spell:chain', brood[0].x, brood[0].y); return; }
    if (t % 6 === 0 && ready(s, 'spell:missiles', 40)) s.use('spell:missiles', e.x, e.y);
  },
};
