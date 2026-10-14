// PAINT PANIC — walk to paint the floor your colour; most tiles when the clock runs out wins.
// Paint bombs drop now and then: touch one and it splats a big circle in your colour.
import { makeBody, stepBody, separate, spawnRing, F } from '../../shared/arena.js';

export const meta = {
  id: 'paint-panic', title: 'Paint Panic', blurb: 'Cover the most ground with your colour before time runs out!',
  how: ['Walk to paint the floor.', 'Paint over other colours to steal their tiles.', 'Grab a paint bomb for a big splat.'],
  kind: 'arena', min: 1, max: 4, seconds: 45, scoring: 'points', unit: 'tiles', tags: ['action'],
  controls: { stick: true }, move: { speed: 6.2, accel: 26 },
  arena: { shape: 'rect', hw: 9, hd: 7, wall: true }, card: 'card-paint-panic',
};
export const GRID = { w: 18, h: 14, cell: 1 };
const BOMB_EVERY = 5.5, BOMB_R = 2.6, BOMB_MAX = 3;
export const cellOf = (x, z) => { const cx = Math.floor(x + GRID.w / 2), cz = Math.floor(z + GRID.h / 2); return cx < 0 || cz < 0 || cx >= GRID.w || cz >= GRID.h ? -1 : cz * GRID.w + cx; };

export function create({ rng, players }) {
  const bodies = new Map(), seatOf = new Map();
  const spawns = spawnRing(players.length, 5);
  players.forEach((p, i) => { bodies.set(p.pid, makeBody(spawns[i].x, spawns[i].z, spawns[i].yaw)); seatOf.set(p.pid, p.seat); });
  const grid = new Int8Array(GRID.w * GRID.h).fill(-1);       // seat that owns each tile
  let changed = [], bombs = [], bombId = 0, nextBomb = 3, time = meta.seconds, over = false;
  const paint = (i, seat) => { if (i >= 0 && grid[i] !== seat) { grid[i] = seat; changed.push(i, seat); } };
  const counts = () => { const c = {}; for (const p of players) c[p.pid] = 0; for (const s of grid) if (s >= 0) for (const p of players) if (p.seat === s) c[p.pid]++; return c; };
  return {
    bodies,
    init: () => ({ grid: Array.from(grid), bombs, time }),
    input(pid, inp) { const b = bodies.get(pid); if (b && !over) stepBody(b, inp, meta.move, meta.arena); },
    step(dt) {
      if (over) return;
      separate(bodies.values());
      for (const [pid, b] of bodies) {
        const seat = seatOf.get(pid);
        paint(cellOf(b.x, b.z), seat);
        for (const bomb of bombs) if (!bomb.gone && Math.hypot(bomb.x - b.x, bomb.z - b.z) < 0.9) {
          bomb.gone = true;
          for (let cz = 0; cz < GRID.h; cz++) for (let cx = 0; cx < GRID.w; cx++) if (Math.hypot(cx + 0.5 - GRID.w / 2 - bomb.x, cz + 0.5 - GRID.h / 2 - bomb.z) <= BOMB_R) paint(cz * GRID.w + cx, seat);
          this.events.push({ e: 'splat', x: bomb.x, z: bomb.z, seat, r: BOMB_R });
        }
      }
      bombs = bombs.filter(b => !b.gone);
      nextBomb -= dt;
      if (nextBomb <= 0 && bombs.length < BOMB_MAX) { nextBomb = BOMB_EVERY; bombs.push({ id: ++bombId, x: +(rng.range(-7.5, 7.5)).toFixed(1), z: +(rng.range(-5.5, 5.5)).toFixed(1) }); }
      time -= dt; if (time <= 0) { time = 0; over = true; for (const b of bodies.values()) b.flags |= F.FROZEN; }
    },
    events: [],
    state() { const d = changed; changed = []; return { d, bombs: bombs.map(b => [b.id, b.x, b.z]), c: counts(), left: Math.ceil(time) }; },
    get over() { return over; },
    result() {
      const c = counts(), groups = new Map();
      for (const p of players) { const k = c[p.pid]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p.pid); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: c, unit: meta.unit };
    },
  };
}
