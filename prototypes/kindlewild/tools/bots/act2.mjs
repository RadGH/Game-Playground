// Bots for Act II (creatures first). t = bot turn (one every 5 ticks).
const monsters = (s) => s.sim.creatures.list.filter(c => c.alive && c.team === 'monster');
const near = (s, x, y, r) => monsters(s).filter(c => Math.hypot(c.x - x, c.y - y) < r);
const centre = (list) => list.length ? { x: list.reduce((a, c) => a + c.x, 0) / list.length, y: list.reduce((a, c) => a + c.y, 0) / list.length } : null;

export default {
  '2-1'(s, t) {
    const v = s.sim.village.list[0];
    if (t === 1) for (let k = 0; k < 6; k++) s.use('creature:archer', 30 + k * 20, 155);
    if (t % 30 === 0 && s.mana.cur > 30) s.use('creature:archer', 70 + (t % 60 ? 0 : 20), 160);
    if (t % 40 === 20 && s.mana.cur > 25) s.use('creature:warden', 80, 156);
    if (t % 60 === 0 && s.mana.cur > 40) s.use('spell:heal', v.x, v.y - 30);
  },
  '2-2'(s, t) {
    const sheep = centre(s.sim.creatures.list.filter(c => c.alive && c.sp.id === 'sheep'));
    if (!sheep) return;
    if (t === 1) { for (let k = 0; k < 4; k++) s.use('creature:knight', sheep.x + Math.cos(k * 1.57) * 8, sheep.y + Math.sin(k * 1.57) * 8); }
    if (t % 20 === 0 && s.mana.cur > 30) { const m = near(s, sheep.x, sheep.y, 40)[0]; if (m) s.use(s.mana.cur > 50 ? 'creature:knight' : 'creature:archer', (m.x + sheep.x) / 2, (m.y + sheep.y) / 2); }
    if (t % 50 === 25 && s.mana.cur > 30) s.use('spell:bless', sheep.x, sheep.y);
    if (t % 45 === 0 && s.mana.cur > 40) s.use('spell:heal', sheep.x, sheep.y);
  },
  '2-3'(s, t) {
    if (t === 1) { for (let k = 0; k < 3; k++) s.use('creature:golem', 74 + k * 6, 126); }
    if (t === 3) { for (let k = 0; k < 4; k++) s.use('creature:archer', 66 + k * 8, 138); }
    if (t % 30 === 0 && s.mana.cur > 45) s.use(t % 60 ? 'creature:knight' : 'creature:golem', 80, 128);
    const v = s.sim.village.list[0];
    const tr = near(s, v.x, v.y, 30).find(c => c.sp.id === 'troll');
    if (tr && !(s.sim.world.barriers && s.sim.world.barriers.length) && s.mana.cur > 25) s.use('spell:barrier', v.x, v.y);
  },
  '2-4'(s, t) {
    const v = s.sim.village.list[0];
    if (t === 1) { for (let k = 0; k < 4; k++) s.use('creature:mage', v.x - 12 + k * 8, v.y - 16); }
    if (t % 30 === 0 && s.mana.cur > 40) s.use('creature:mage', v.x + (t % 60 ? -14 : 14), v.y - 10);
    const m = near(s, v.x, v.y, 40);
    if (m.length && t % 6 === 0 && s.mana.cur > 20) { const c = centre(m); s.use('spell:missiles', c.x, c.y); }
    if (s.sim.world.stats.burning > 20 && t % 40 === 0) s.use('spell:rain', v.x, v.y - 10);
  },
  '2-5'(s, t) {
    const set = s.sim.creatures.list.filter(c => c.alive && c.tag === 'settler');
    const c0 = centre(set);
    if (!c0) return;
    if (t === 1) { s.use('creature:knight', 50, 80); s.use('creature:knight', 60, 92); s.use('creature:archer', 40, 70); }
    const foes = near(s, c0.x, c0.y, 45);
    if (foes.length && t % 10 === 0 && s.mana.cur > 22) { const f = centre(foes); s.use(s.mana.cur > 40 ? 'creature:knight' : 'creature:archer', (f.x + c0.x) / 2, (f.y + c0.y) / 2); }
    if (t % 40 === 0 && s.mana.cur > 40) s.use('spell:heal', c0.x, c0.y);
    if (foes.length > 6 && t % 60 === 30 && s.mana.cur > 30) s.use('spell:barrier', c0.x, c0.y);
  },
  '2-6'(s, t) {
    const v = s.sim.village.list[0];
    if (t === 1) { for (let k = 0; k < 6; k++) s.use('creature:archer', 60 + k * 11, 138); s.use('creature:knight', 88, 134); }
    if (t === 4) { s.use('creature:golem', 84, 128); }
    if (t % 25 === 0 && s.mana.cur > 50) s.use(t % 50 ? 'creature:archer' : 'creature:mage', 66 + (t % 7) * 6, 140);
    const m = near(s, v.x, v.y, 60);
    if (m.length > 5 && t % 8 === 0 && s.mana.cur > 30) { const c = centre(m); s.use('spell:missiles', c.x, c.y); }
    if (near(s, v.x, v.y, 25).length > 4 && !(s.sim.world.barriers && s.sim.world.barriers.length) && s.mana.cur > 25) s.use('spell:barrier', v.x, v.y);
  },
};
