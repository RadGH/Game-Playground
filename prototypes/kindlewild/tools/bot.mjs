// Level bots: play each challenge headless with a simple strategy, and with no player at all,
// to check every level can be won and can be lost. node tools/bot.mjs [levelId|all] [seeds]
import { loadData } from '../tests/load.mjs';
import { createSession, prepareData } from '../js/game/session.js';
import { makeTrial } from '../js/game/trials.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const data = prepareData(loadData());
const want = process.argv[2] || 'all';
// `node tools/bot.mjs act3` plays data/acts/act3.json even before it is listed in levels.json
let levels = data.levels.acts.flatMap(a => a.levels);
if (/^act\d+$/.test(want)) levels = JSON.parse(fs.readFileSync(path.join(here, '..', 'data', 'acts', want + '.json'), 'utf8')).levels;
// per-act strategies live in tools/bots/<act>.mjs: export default { '3-1'(s, t) {...}, ... }
const extraStrats = {};
for (const f of fs.readdirSync(path.join(here, 'bots')).filter(f => f.endsWith('.mjs'))) Object.assign(extraStrats, (await import(path.join(here, 'bots', f))).default);
const seeds = +(process.argv[3] || 1);

function centroid(s, pred) {
  let x = 0, y = 0, n = 0, vx = 0, vy = 0;
  for (const c of s.sim.creatures.list) if (c.alive && pred(c)) { x += c.x; y += c.y; vx += c.vx || 0; vy += c.vy || 0; n++; }
  return n ? { x: x / n, y: y / n, vx: vx / n, vy: vy / n, n } : null;
}
const monster = (c) => c.team === 'monster';

const STRATS = {
  '1-1'(s, t) {
    const g = centroid(s, monster);
    if (!g) return;
    if (t % 15 === 0 && s.mana.cur >= 40) {
      // aim ahead of the swarm: two seconds of travel
      s.use('spell:meteor', g.x + g.vx * 60, g.y + g.vy * 60);
    } else if (t % 20 === 0 && s.mana.cur >= 50) {
      const c = s.sim.creatures.list.find(c => c.alive && monster(c) && c.y > 150);
      if (c) s.use('spell:fireball', c.x, c.y);
    }
  },
  '1-2'(s, t) {
    const v = s.sim.village.list[0];
    if (t === 5) { s.use('spell:earth', 20, 150, { x2: 75, y2: 172 }); s.use('spell:earth', 140, 150, { x2: 85, y2: 172 }); }
    if (t > 5 && t % 90 === 0) {
      // patch the wall wherever lava has reached the band above the village
      for (let x = 30; x < 130; x += 3) {
        const y = 165, i = y * s.sim.world.W + x;
        if (s.sim.world.mat[i] === s.sim.M.id.lava) s.use('spell:rain', x, y - 10);
      }
      s.use('spell:earth', 50, 178, { x2: 110, y2: 178 });
    }
  },
  defenders(s, t) {
    const v = s.sim.village.list[0];
    if (!v) return;
    if (t === 1) for (let k = 0; k < 5; k++) s.use('creature:archer', v.x - 16 + k * 8, v.y - 18);
    if (t % 24 === 0 && s.mana.cur > 40) s.use(t % 48 ? 'creature:knight' : 'creature:mage', v.x + (t % 5 - 2) * 6, v.y - 14);
    const near = s.sim.creatures.list.filter(c => c.alive && c.team === 'monster' && Math.hypot(c.x - v.x, c.y - v.y) < 22);
    if (near.length > 4 && !(s.sim.world.barriers && s.sim.world.barriers.length) && s.mana.cur > 25) s.use('spell:barrier', v.x, v.y);
    if (t % 30 === 15 && s.sim.world.stats.burning > 20) {
      const w = s.sim.world; let best = null, bd = 1e9;
      for (let k = 0; k < 500; k++) { const x = (Math.random() * w.W) | 0, y = (Math.random() * w.H) | 0; if (w.flag[y * w.W + x] & 1) { const d = Math.hypot(x - v.x, y - v.y); if (d < bd) { bd = d; best = [x, y]; } } }
      if (best && bd < 60) s.use('spell:rain', best[0], best[1]);
    }
  },
  lava(s, t) {
    // general: every 2 s find the lava front and push up a ridge across it, rain on it
    if (t % 12 !== 0) return;
    const w = s.sim.world, ID = s.sim.M.id;
    let maxY = 0, minX = 1e9, maxX = 0;
    for (let i = 0; i < w.N; i++) if (w.mat[i] === ID.lava) { const y = (i / w.W) | 0, x = i % w.W; if (y > maxY) maxY = y; }
    for (let i = (maxY - 6) * w.W; i < (maxY + 1) * w.W; i++) if (i >= 0 && w.mat[i] === ID.lava) { const x = i % w.W; minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    if (maxY < 30 || minX > maxX) return;
    const y = maxY + 5;
    s.use('spell:earth', Math.max(1, minX - 12), y, { x2: Math.min(w.W - 2, maxX + 12), y2: y });
    if (s.mana.cur > 60) s.use('spell:rain', (minX + maxX) / 2, maxY);
  },
  '1-3'(s, t) {
    if (t === 5) for (let x = 2; x < 160; x += 4) s.use('material:dirt', x, 150, { brush: 3 });
    if (t === 40) for (let x = 2; x < 160; x += 4) s.use('material:dirt', x, 156, { brush: 3 });
    if (t % 60 === 0 && s.sim.world.stats.burning > 0) {
      // rain on the fire nearest the village
      const v = s.sim.village.list[0], w = s.sim.world;
      let best = null, bd = 1e9;
      for (let k = 0; k < 400; k++) { const x = (Math.random() * w.W) | 0, y = (Math.random() * w.H) | 0; if (w.flag[y * w.W + x] & 1) { const d = Math.hypot(x - v.x, y - v.y); if (d < bd) { bd = d; best = [x, y]; } } }
      if (best && bd < 70) s.use('spell:rain', best[0], best[1] + 4);
    }
  },
  '1-4'(s, t) {
    const sheep = centroid(s, c => c.sp.id === 'sheep');
    if (sheep && t % 45 === 0) s.use('spell:bless', sheep.x, sheep.y);
    if (t % 10 === 0) {
      const wolf = s.sim.creatures.list.find(c => c.alive && c.sp.id === 'wolf');
      if (wolf) s.use('spell:lightning', wolf.x, wolf.y);
    }
    if (sheep && t % 120 === 60) s.use('spell:growth', sheep.x, sheep.y);
  },
  '1-5'(s, t) {
    const v = s.sim.village.list[0];
    const d = s.sim.creatures.list.find(c => c.alive && (c.sp.id === 'dragon' || c.sp.id === 'wyrmling'));
    if (t === 2) for (let k = 0; k < 4; k++) s.use('creature:archer', v.x - 6 + k * 4, v.y + 6);
    if (!d) return;
    const w = s.sim.world;
    if (Math.hypot(d.x - v.x, d.y - v.y) < 45 && !(w.barriers && w.barriers.length) && s.mana.cur > 30) s.use('spell:barrier', v.x, v.y);
    if (t % 7 === 0 && s.mana.cur > 20) s.use('spell:missiles', d.x, d.y);
    else if (t % 5 === 0 && s.mana.cur > 40) s.use('spell:lightning', d.x + d.vx * 3, d.y + d.vy * 3);
    if (t % 90 === 0 && w.stats.burning > 5) s.use('spell:rain', v.x, v.y);
  },
  '1-6'(s, t) {
    const v = s.sim.village.list[0];
    if (t % 8 === 0) {
      const near = s.sim.creatures.nearest(v.x, v.y, 60, (c) => monster(c));
      if (near) s.use(near.sp.id === 'troll' ? 'spell:lightning' : 'spell:fireball', near.x, near.y);
    }
    const g = centroid(s, c => monster(c) && Math.hypot(c.x - v.x, c.y - v.y) < 70);
    if (g && g.n > 12 && t % 30 === 0) s.use('spell:meteor', g.x + g.vx * 60, g.y + g.vy * 60);
    if (t % 60 === 0 && s.sim.world.stats.burning > 10) s.use('spell:rain', v.x, v.y);
    if (t % 120 === 0) s.use('spell:heal', v.x, v.y);
  },
};

Object.assign(STRATS, extraStrats);
function run(L, withBot, seedOff) {
  const level = structuredClone(L);
  if (seedOff) level.map.seed += seedOff;
  const s = createSession(data, { mode: 'challenge', level });
  const max = 400 * 30;
  for (let k = 0; k < max; k++) {
    s.step();
    if (withBot && k % 5 === 0) STRATS[L.id]?.(s, k / 5);
    if (s.result) break;
  }
  return { result: s.result, state: s.state() };
}

const KIND = { swarm: '1-1', lava: 'lava', fire: '1-3', flock: '1-4', wyrm: '1-5', siege: '1-6', defenders: 'defenders' };
if (want === 'trials') {
  const start = new Date('2026-10-26T12:00:00');
  for (let d = 0; d < seeds; d++) {
    const day = new Date(start.getTime() + d * 86400000);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const L = makeTrial(key, []);
    STRATS[L.id] = STRATS[KIND[L.kind]];
    const idle = run(L, false, 0), bot = run(L, true, 0);
    const fmt = (r) => r.result ? `${r.result.won ? 'WON ' : 'LOST'} ${Math.round(r.result.secs)}s stars ${r.result.starCount} ${r.result.won ? '' : '(' + r.result.reason + ')'}` : 'no result';
    console.log(`${key} ${L.kind.padEnd(6)} x${L.difficulty.toFixed(2)} "${L.name}"  idle: ${fmt(idle)}  |  bot: ${fmt(bot)}`);
  }
  process.exit(0);
}
for (const L of levels) {
  if (want !== 'all' && !/^act\d+$/.test(want) && L.id !== want) continue;
  for (let sd = 0; sd < seeds; sd++) {
    const idle = run(L, false, sd * 17);
    const bot = run(L, true, sd * 17);
    const fmt = (r) => r.result ? `${r.result.won ? 'WON ' : 'LOST'} ${Math.round(r.result.secs)}s stars ${r.result.starCount} mana ${r.result.manaUsed} ${r.result.won ? '' : '(' + r.result.reason + ')'}` : 'no result';
    console.log(`${L.id} seed+${sd * 17}  idle: ${fmt(idle)}  |  bot: ${fmt(bot)}`);
  }
}
