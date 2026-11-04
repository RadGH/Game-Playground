// Routes: how goods from a mine or an outpost far from town get home. PURE, a sim system.
//
// Owner (2026-11-03, Sightseer-style): build a mine on a node, and once a road connects it the goods
// flow home automatically. A good only becomes part of the kingdom's stock when it arrives in a
// town's warehouse; until then it sits at the mine or outpost and can be raided. Carts really drive
// the road (nothing teleports), so a trip takes as long as the road makes it.
//
// A route is { id, from, to, vehicle, carts, via, priority }. Every remote producer and every
// outpost gets one automatically (to the nearest outpost for a mine near one, else the nearest
// town store). With no road all the way, porters carry it on foot; once a road joins up, the route
// switches to carts. The Routes screen can add carts, change the vehicle, set priority, and steer
// the route through a waypoint (a safer road).

export function createRoutes(sim, data) {
  const S = sim.state.routes ??= { list: [], carts: [], nextId: 1 };
  const T = sim.state.town;
  const KINDS = data.kinds, V = data.vehicles;
  const W = sim.W;
  const dist = (ax, ay, bx, by) => { let dx = Math.abs(ax - bx); if (dx > W / 2) dx = W - dx; return Math.hypot(dx, ay - by); };
  const wrapX = x => ((x % W) + W) % W;
  const byId = id => T.buildings.find(b => b.id === id);
  const SPEED = 0.07;
  const used = b => Object.values(b.store).reduce((a, n) => a + n, 0);
  const room = b => (KINDS[b.kind].storage || 0) - used(b);
  const door = b => ({ x: b.x + (b.w >> 1), y: b.y + b.h + 1 });
  const nav = () => sim.town.nav;

  const inTown = o => T.buildings.some(k => (k.kind === 'keep' || KINDS[k.kind].founds) && k.state === 'up' && dist(k.x, k.y, o.x, o.y) < (data.town.remoteAt || 90));
  /** A far dock's goods go by water to a dock in a town, when water joins them. */
  function waterDestination(b) {
    if (!KINDS[b.kind].dock || inTown(b)) return null;
    return T.buildings.filter(o => o !== b && o.state === 'up' && KINDS[o.kind].dock && inTown(o)).sort((a, c) => dist(b.x, b.y, a.x, a.y) - dist(b.x, b.y, c.x, c.y))[0] || null;
  }
  function destinationFor(b) {
    const wd = waterDestination(b); if (wd) return wd;
    let best = null, bd = Infinity;
    for (const o of T.buildings) {
      if (o.state !== 'up' || o.id === b.id) continue;
      const k = KINDS[o.kind];
      const accepts = k.kingdom || (k.dock && inTown(o)) || (k.depot && !KINDS[b.kind].depot && dist(b.x, b.y, o.x, o.y) < 140);
      if (!accepts || room(o) < 10) continue;
      // an outpost only takes from a mine nearer to it than to any town store
      const d = dist(b.x, b.y, o.x, o.y) * (k.depot ? 0.8 : 1);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** A barge's way: over water only (4 m tiles), from the water beside one dock to the other. */
  function waterPath(p, q) {
    const isWater = (x, y) => { const at = sim.cell(x, y); return !!at && at.c.mat[at.i] === sim.M.id.water; };
    const nearWater = pt => { for (let r = 0; r < 14; r++) for (let k = 0; k < 16; k++) { const x = Math.round(pt.x + Math.cos(k / 16 * Math.PI * 2) * r), y = Math.round(pt.y + Math.sin(k / 16 * Math.PI * 2) * r); if (isWater(x, y)) return { x, y }; } return null; };
    const a = nearWater(p), b = nearWater(q); if (!a || !b) return null;
    const res = nav().find(Math.floor(a.x / 4), Math.floor(a.y / 4), Math.floor(b.x / 4), Math.floor(b.y / 4), { near: 1, maxNodes: 40000, wrapW: sim.W / 4, costFn: (tx, ty) => isWater(tx * 4 + 2, ty * 4 + 2) ? 1 : Infinity });
    if (!res) return null;
    return { path: [[p.x, p.y], ...res.path.map(([x, y]) => [x * 4 + 2, y * 4 + 2]), [q.x, q.y]], cost: res.cost * 4 * 0.6 };
  }
  function plan(r) {
    const a = byId(r.from), b = byId(r.to);
    if (!a || !b) return null;
    const v = V[r.vehicle];
    const A = door(a), B = door(b);
    const legs = r.via ? [[A, r.via], [r.via, B]] : [[A, B]];
    const path = []; let cost = 0, roadless = 0;
    for (const [p, q] of legs) {
      const res = v.water ? waterPath(p, q) : nav().findLong(p.x, p.y, q.x, q.y, { offroad: v.offroad });
      if (!res) return null;
      path.push(...res.path); cost += res.cost;
    }
    // how much of the trip has no road (porters until it is all road)
    for (const [x, y] of path) { const at = sim.cell(x, y); if (at && !(sim.M.flag.road[at.c.ground[at.i]] || at.c.mat[at.i] === sim.M.id.bridge)) roadless++; }
    r.path = path; r.cost = cost; r.roadShare = path.length ? 1 - roadless / path.length : 0;
    // cost is in plain-ground cells; at SPEED x vehicle speed cells a tick that is cost / speed ticks
    r.secs = Math.round(cost / (SPEED * v.speed) / 20);
    r.planned = sim.tick;
    return r;
  }

  function ensureRoutes() {
    for (const b of T.buildings) {
      if (b.state !== 'up') continue;
      const k = KINDS[b.kind];
      const producer = (b.remote && k.job) || (k.depot && !(k.dock && inTown(b)));
      if (!producer || S.list.some(r => r.from === b.id)) continue;
      const to = destinationFor(b); if (!to) continue;
      const byWater = KINDS[b.kind].dock && KINDS[to.kind].dock;
      const r = { id: S.nextId++, from: b.id, to: to.id, vehicle: byWater ? 'barge' : 'porter', carts: 1, via: null, priority: 1, delivered: 0, since: sim.tick };
      if (!plan(r)) { if (!byWater) continue; r.vehicle = 'porter'; if (!plan(r)) continue; }
      if (!byWater && r.roadShare > 0.85) r.vehicle = 'handcart', plan(r);
      S.list.push(r);
      sim.events.push({ t: 'say', text: `A route opens: ${k.name} → ${KINDS[to.kind].name}.`, kind: 'good', x: b.x, y: b.y });
    }
    // drop routes whose ends are gone; re-plan old ones (roads change)
    for (const r of [...S.list]) {
      if (!byId(r.from) || !byId(r.to)) { S.list.splice(S.list.indexOf(r), 1); S.carts = S.carts.filter(c => c.route !== r.id); continue; }
      if (sim.tick - r.planned > 2400) {
        plan(r);
        // a road joined up: porters become a cart on their own
        if (r.vehicle === 'porter' && r.roadShare > 0.85) { r.vehicle = 'handcart'; plan(r); sim.events.push({ t: 'say', text: 'A road is finished — carts take over a route.', kind: 'good' }); }
      }
    }
  }

  function stepCarts() {
    // each route keeps `carts` vehicles on it
    for (const r of S.list) {
      const have = S.carts.filter(c => c.route === r.id).length;
      if (have < r.carts && r.path && sim.tick % 60 === r.id % 60) {
        const a = byId(r.from), d = door(byId(r.to));
        S.carts.push({ id: S.nextId++, route: r.id, x: d.x + 0.5, y: d.y + 0.5, pi: r.path.length - 1, dir: -1, load: null, wait: 0 });
      }
      if (have > r.carts) { const c = S.carts.find(c => c.route === r.id && !c.load); if (c) S.carts.splice(S.carts.indexOf(c), 1); }
    }
    for (const c of S.carts) {
      const r = S.list.find(r => r.id === c.route); if (!r || !r.path) continue;
      if (c.wait > 0) { c.wait--; continue; }
      const v = V[r.vehicle];
      const tgt = r.path[c.pi];
      if (tgt) {
        let dx = tgt[0] + 0.5 - c.x; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
        const dy = tgt[1] + 0.5 - c.y, d = Math.hypot(dx, dy);
        const at = sim.cell(c.x, c.y);
        let spd = SPEED * v.speed * (v.feed && S.hungry ? 0.5 : 1);
        if (at && !v.water) { const g = at.c.ground[at.i], m = at.c.mat[at.i]; const road = sim.M.flag.road[g] || m === sim.M.id.bridge; spd *= (m === sim.M.id.bridge ? sim.M.walk[m] : sim.M.walk[g] || 100) / 100 / (road ? 1 : v.offroad); }
        if (d > spd) { c.x = wrapX(c.x + dx / d * spd); c.y += dy / d * spd; continue; }
        c.x = wrapX(tgt[0] + 0.5); c.y = tgt[1] + 0.5;
        c.pi += c.dir;
        if (c.pi >= 0 && c.pi < r.path.length) continue;
      }
      // at an end
      const a = byId(r.from), b = byId(r.to);
      if (c.dir > 0) {
        // arrived at the destination: unload (into the kingdom's stock if it is a town store)
        if (c.load && b) {
          const k = Math.min(c.load.n, Math.max(0, room(b)));
          b.store[c.load.g] = (b.store[c.load.g] || 0) + k; r.delivered += k;
          c.load.n -= k; if (c.load.n <= 0) c.load = null;
        }
        // the store is full: send the route somewhere with room next time
        if (c.load && sim.tick - (r.retarget || 0) > 600) { r.retarget = sim.tick; const to = a && destinationFor(a); if (to && to.id !== r.to) { r.to = to.id; plan(r); } }
        c.dir = -1; c.pi = r.path.length - 1; c.wait = 20;
      } else {
        // at the source: load the good it has most of
        if (a) {
          let g = null, n = 0;
          for (const [gg, nn] of Object.entries(a.store)) if (nn > n) { g = gg; n = nn; }
          if (!c.load && g && n >= Math.min(v.carry, 4)) { const k = Math.min(n, v.carry); a.store[g] -= k; c.load = { g, n: k }; }
        }
        if (!c.load) { c.wait = 100; c.pi = 0; c.dir = -1; c.x = c.x; continue; }
        c.dir = 1; c.pi = 0; c.wait = 30;
      }
    }
  }

  function feed() {
    let need = 0;
    for (const r of S.list) need += (V[r.vehicle].feed || 0) * r.carts;
    if (!need) return;
    let left = need;
    for (const b of T.buildings) { if (!left) break; if (b.state !== 'up' || !KINDS[b.kind].kingdom) continue; for (const g of Object.keys(data.goods).filter(g => data.goods[g].food)) { const k = Math.min(left, b.store[g] || 0); b.store[g] = (b.store[g] || 0) - k; left -= k; if (!left) break; } }
    S.hungry = left > 0;      // hungry oxen pull slowly
  }
  function step() {
    if (sim.tick % sim.dayTicks === sim.dayTicks - 7) feed();
    if (sim.tick % 100 === 7) ensureRoutes();
    stepCarts();
  }

  function order(o) {
    const r = S.list.find(r => r.id === o.route);
    if (o.t === 'route.cart' && r) {
      const v = V[r.vehicle];
      if ((T.gold ?? 0) < v.gold) return { error: 'Not enough gold.' };
      T.gold -= v.gold; r.carts = Math.min(20, r.carts + (o.n ?? 1)); return { carts: r.carts };
    }
    if (o.t === 'route.less' && r) { r.carts = Math.max(1, r.carts - 1); return { carts: r.carts }; }
    if (o.t === 'route.vehicle' && r && V[o.vehicle]) {
      if (V[o.vehicle].water && !(KINDS[byId(r.from)?.kind]?.dock && KINDS[byId(r.to)?.kind]?.dock)) return { error: 'Barges run between two docks.' };
      if (sim.unlocked?.(o.vehicle) === false) return { error: 'Your kingdom does not know how to make that yet.' }; r.vehicle = o.vehicle; plan(r); return { vehicle: r.vehicle }; }
    if (o.t === 'route.via' && r) { r.via = o.x == null ? null : { x: Math.floor(o.x), y: Math.floor(o.y) }; plan(r); return { via: r.via }; }
    if (o.t === 'route.priority' && r) { r.priority = (r.priority % 3) + 1; return { priority: r.priority }; }
    return null;
  }

  /** For the Routes screen and the map. */
  function view(rect) {
    const list = S.list.map(r => {
      const a = byId(r.from), b = byId(r.to);
      const pile = a ? used(a) : 0;
      let danger = 0;
      if (r.path?.length && sim.military) { const n = Math.min(8, r.path.length); for (let k = 0; k < n; k++) { const [x, y] = r.path[Math.floor(k * (r.path.length - 1) / Math.max(1, n - 1))]; danger += 1 - sim.military.safetyAt(x, y); } danger /= n; }
      return { danger: +danger.toFixed(2), escorts: (sim.state.military?.units || []).filter(u => u.mode === 'escort' && S.carts.some(c => c.id === u.cart && c.route === r.id)).length, id: r.id, from: a ? KINDS[a.kind].name : '?', to: b ? KINDS[b.kind].name : '?', fx: a?.x, fy: a?.y, tx: b?.x, ty: b?.y, vehicle: r.vehicle, vname: V[r.vehicle].name, carts: r.carts, secs: r.secs, road: Math.round((r.roadShare || 0) * 100), carry: V[r.vehicle].carry, delivered: r.delivered, waiting: pile, via: r.via, priority: r.priority };
    });
    const carts = [];
    for (const c of S.carts) {
      let x = c.x;
      if (rect) { while (x < rect.x0) x += W; while (x > rect.x1) x -= W; if (x < rect.x0 || c.y < rect.y0 || c.y > rect.y1) continue; }
      const r = S.list.find(r => r.id === c.route);
      carts.push([+x.toFixed(2), +c.y.toFixed(2), c.load ? 1 : 0, r?.vehicle === 'porter' ? 0 : 1, c.id]);
    }
    return { list, carts };
  }

  return { id: 'routes', step, order, view, plan };
}
