// People indoors. The sim says which bed, chair or spot on the floor someone has (act.spot); this walks them there on the nav grid
// when somebody is looking, and leaves them alone when nobody is. Only buildings that are open (the cutaway) have people drawn.
//
//   const indoors = createIndoors({ town, buildings, plans, shut, isOpen });
//   indoors.locate(p, pl, tick, out)   true = drawn indoors, false = indoors but not drawn, null = not indoors, draw them outside
//   indoors.leaving(p, trip, tick, out)   they have set off: true while they are still walking out to the door
import { routeInside, outsideDoor } from '../sim/interior-nav.js';
import { toWorld } from '../sim/interior.js';
import { floorY } from './interior-view.js';
import { USE_CLIP, ACT_CLIP, LIES_DOWN } from './life-clips.js';

const WALK = 2.6;

function pathOf(route) {
  const cum = [0];
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + (route[i][2] === route[i - 1][2] ? Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]) : 3));
  return { pts: route, cum, len: cum[cum.length - 1] };
}
function along(path, m, o) {
  const c = path.cum; let i = 1;
  while (i < c.length - 1 && c[i] < m) i++;
  const a = path.pts[i - 1], b = path.pts[i], k = Math.max(0, Math.min(1, (m - c[i - 1]) / ((c[i] - c[i - 1]) || 1)));
  o.x = a[0] + (b[0] - a[0]) * k; o.z = a[1] + (b[1] - a[1]) * k; o.lv = k < 0.5 ? a[2] : b[2]; o.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  return o;
}

export function createIndoors({ town, buildings, plans, shut, isOpen }) {
  const tracks = new Map(), came = new Map(), tmp = {}, tmp2 = {};
  const tps = () => town.roster.clock.ticksPerSecond;
  const place = (out, b, x, z) => { toWorld({ cx: b.x, cz: b.z, yaw: b.yaw }, x, z, tmp2); out.x = tmp2.x; out.z = tmp2.z; };
  const spotOf = (plan, sp) => (sp >= 0 ? plan.slots[sp] : plan.floor[-2 - sp]);

  function here(tr, tick, o) {
    const m = Math.max(0, tick - tr.t0) / tps() * WALK;      // the page's tick is a guess between snapshots, and can step back
    return m < tr.path.len ? along(tr.path, m, o) : null;
  }
  const self = {
    /** A trip's walk ended or began: the next person through the door comes from outside. */
    cameBy(id, tick) { came.set(id, tick); },
    locate(p, pl, tick, out) {
      if (p.sp === null || p.sp === undefined) { tracks.delete(p.i); return null; }
      const b = buildings.get(pl.building), plan = plans(pl.building);
      if (!plan || !b) return null;
      if (p.sp === -1) {   // no room: the line outside
        const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), n = p.q ?? 0;
        out.x = pl.x + fx * 1.2 + fz * (1 + n * 0.85); out.z = pl.z + fz * 1.2 - fx * (1 + n * 0.85); out.yaw = b.yaw; out.anim = 'idle';
        return null;
      }
      const lvNow = isOpen(pl.building);
      const row = spotOf(plan, p.sp), key = `${p.at}/${p.sp}`, stand = { x: row.sx ?? row.x, z: row.sz ?? row.z, lv: row.lv ?? 0 };
      let tr = tracks.get(p.i);
      if (lvNow === null) { tracks.delete(p.i); return false; }
      if (!tr || tr.key !== key) {
        const fresh = !tr || tr.place !== p.at, fromDoor = fresh && tick - (came.get(p.i) ?? -1e9) < 24;
        let from = null;
        if (!fresh) { const at = here(tr, tick, {}); from = at ? { x: at.x, z: at.z, lv: at.lv } : { ...tr.stand }; } else if (fromDoor) from = outsideDoor(plan);
        const route = from ? routeInside(plan, from, stand, 0.4, d => shut(pl.building, d)) : null;
        tr = { key, place: p.at, stand, path: route ? pathOf(route) : { pts: [[stand.x, stand.z, stand.lv]], cum: [0], len: 0 }, t0: tick };
        tracks.set(p.i, tr);
        came.delete(p.i);
      }
      const walking = here(tr, tick, tmp);
      out.car = null; out.inside = true; out.lie = false;
      if (walking) {
        place(out, b, walking.x, walking.z);
        out.lv = walking.lv; out.y = floorY(b, walking.lv); out.yaw = walking.yaw + (b.yaw); out.walking = true; out.anim = 'walk'; out.speed = WALK;
      } else {
        place(out, b, row.x, row.z);
        out.lv = row.lv ?? 0; out.yaw = row.yaw + b.yaw; out.walking = false;
        const use = row.use ?? null, fallen = p.a === 'down', lying = fallen || (use && LIES_DOWN.has(use));
        out.anim = fallen ? 'lifeSleep' : use ? USE_CLIP[use] ?? 'idle' : ACT_CLIP[p.a] ?? 'idle';
        out.y = floorY(b, out.lv) + (fallen ? 0.12 : lying ? row.y ?? 0.56 : 0);
        out.lie = !!lying;
      }
      if (out.lv !== lvNow) return false;
      return true;
    },
    leaving(p, trip, tick, out) {
      const tr = tracks.get(p.i);
      if (!tr || tr.place !== trip.from) return false;
      const pl = town.roster.places[trip.from], b = buildings.get(pl?.building), plan = pl && plans(pl.building);
      if (!plan || isOpen(pl.building) === null) { tracks.delete(p.i); return false; }
      if (!tr.exit) {
        const at = here(tr, tick, {}) ?? tr.stand, route = routeInside(plan, { x: at.x, z: at.z, lv: at.lv ?? tr.stand.lv }, outsideDoor(plan), 0.4, d => shut(pl.building, d));
        if (!route) { tracks.delete(p.i); return false; }
        tr.exit = pathOf(route); tr.t1 = tick; tr.exitTicks = tr.exit.len / WALK * tps();
        p.exitTicks = tr.exitTicks;
      }
      const m = Math.max(0, tick - tr.t1) / tps() * WALK;
      if (m >= tr.exit.len) { tracks.delete(p.i); return false; }
      const q = along(tr.exit, m, tmp);
      place(out, b, q.x, q.z);
      out.lv = q.lv; out.y = floorY(b, q.lv); out.yaw = q.yaw + b.yaw; out.walking = true; out.anim = 'walk'; out.speed = WALK; out.inside = true; out.lie = false; out.car = null;
      return q.lv === isOpen(pl.building);
    },
    reset() { tracks.clear(); came.clear(); },
    stats: () => ({ tracks: tracks.size }),
  };
  return self;
}
