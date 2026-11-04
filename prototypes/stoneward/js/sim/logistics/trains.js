// Trains (M10): track, stations, lines, freight and passenger trains. PURE, a sim system.
//
// Owner (2026-11-03): "their tracks should not be destroyable. They transport the fastest and
// require the most research. Passenger trains can also transport people between towns which boosts
// town growth. Satisfying but simple, no need to set up signals, it all just works with no risk of
// trains colliding, they are just simulated, but still render in game and can be destroyed by
// enemies if they are quick enough."
//
// How it works:
//   * TRACK is cells: the ground becomes `rail` (or a `rail_bridge` cell over shallow water), and
//     every track cell's `part` is RAIL_PART, so roads, building plots and site clearing all leave
//     it alone. Rail has hard 255 and nothing that burns or melts, and js/sim/cells.js never
//     replaces a hard-255 ground: track can't be destroyed (PLAN §0.3). It costs stone + iron ore
//     per `rail.per` metres, from the kingdom stock.
//   * A STATION is a building (`station` in data/buildings-trains.json) that must touch track. It
//     is a kingdom store, so what a train unloads there is in that town's stock.
//   * A LINE is any connected piece of track with 2 or more stations. Lines are found by
//     themselves (a flood fill over the track cells), and rebuilt whenever track or stations change.
//     Its stations are put in order along the track; trains run end to end and back.
//   * TRAINS are just a position along the line's path. There are no signals and nothing collides:
//     two trains on one line simply pass through each other.
//   * FREIGHT: at each stop a train unloads, then loads the good that THIS town has most more of
//     than the NEXT stop's town (largest stock gap, at least `rail.minDiff`), up to half the gap.
//     It loads from the station's own store first, then from the town's other stores within
//     `rail.yard` metres (the goods yard). Goods only reach the next town when the train arrives.
//   * PASSENGERS: a town on a line with a passenger train gets extra settlers from every bigger town
//     on that line (`appeal`, read by the town's migrant code). Commuters (idle people here, open
//     jobs at the next stop) are counted per trip; handing them a real job in the other town is
//     town.js work for later (see the README).
//   * DANGER: a train at speed can't be hurt. A stopped or slow one (at a station, pulling away,
//     braking) is `vulnerable`; `hit(id, dmg)` only works then, and at 0 hp it is wrecked.
//
// State in sim.state.trains (plain JSON, saved as-is): track (cell keys y*W+x), segs (what was
// drawn, for the page), trains, stats per line, nextId, ver.

import { BURN } from '../cells.js';

export const RAIL_PART = 65535;
const SPEED = 0.07;                         // cells a tick for a walker on plain ground, as everywhere
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function createTrains(sim, data) {
  const { M } = sim;
  const W = sim.W;
  const KINDS = data.kinds, TR = data.trains, RAIL = data.rail;
  const S = sim.state.trains ??= { track: [], segs: [], trains: [], stats: {}, nextId: 1, ver: 0 };
  const T = sim.state.town;
  const track = new Set(S.track);
  const wrapX = x => ((x % W) + W) % W;
  const key = (x, y) => y * W + wrapX(x);
  const kx = k => k % W, ky = k => Math.floor(k / W);
  const dist = (ax, ay, bx, by) => { let dx = Math.abs(ax - bx); if (dx > W / 2) dx = W - dx; return Math.hypot(dx, ay - by); };
  const say = (text, kind = 'info', x, y) => sim.events.push({ t: 'say', text, kind, x, y });
  const byId = id => T.buildings.find(b => b.id === id);
  const used = b => Object.values(b.store).reduce((a, n) => a + n, 0);
  const room = b => (KINDS[b.kind].storage || 0) - used(b);
  const isStore = b => b.state === 'up' && KINDS[b.kind].kingdom;
  const townOf = id => T.towns.find(t => t.id === id);

  // ------------------------------------------------------------------ the kingdom stock
  function stockAll() { const out = {}; for (const b of T.buildings) if (isStore(b)) for (const [g, n] of Object.entries(b.store)) out[g] = (out[g] || 0) + n; return out; }
  const canPay = cost => { const st = stockAll(); return Object.entries(cost).every(([g, n]) => (st[g] || 0) >= n); };
  /** Take goods from storage, nearest to (x, y) first. Call only after canPay. */
  function pay(cost, x, y) {
    const list = T.buildings.filter(isStore).sort((a, b) => dist(x, y, a.x, a.y) - dist(x, y, b.x, b.y) || a.id - b.id);
    for (const [g, n] of Object.entries(cost)) {
      let left = n;
      for (const b of list) { const k = Math.min(left, b.store[g] || 0); if (k) { b.store[g] -= k; left -= k; } if (!left) break; }
    }
  }
  const costText = cost => Object.entries(cost).map(([g, n]) => `${n} ${(data.goods[g]?.name || g).toLowerCase()}`).join(' and ');

  // ------------------------------------------------------------------ track
  /** The cells a straight run from (x0,y0) to (x1,y1) covers: 2 wide, like a road. */
  function runCells(x0, y0, x1, y1) {
    let dx = x1 - x0; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    const n = Math.max(Math.abs(dx), Math.abs(y1 - y0)) | 0;
    const out = [], seen = new Set();
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + dx * k / Math.max(1, n)), y = Math.round(y0 + (y1 - y0) * k / Math.max(1, n));
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const kk = key(x + ox, y + oy); if (!seen.has(kk)) { seen.add(kk); out.push([x + ox, y + oy, kk]); } }
    }
    return { cells: out, len: n + 1, dx };
  }
  /** Lay a run of track. Returns the cells laid (a number), or a sentence saying why not. */
  function layTrack({ x0, y0, x1, y1 }) {
    x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
    const { cells, len, dx } = runCells(x0, y0, x1, y1);
    const fresh = [];
    for (const [x, y, kk] of cells) {
      if (track.has(kk)) continue;
      const at = sim.cell(x, y); if (!at) return 'Track cannot cross the ice.';
      const { c, i } = at, m = c.mat[i];
      if (c.part[i]) return 'Something is built in the way.';
      if (m && M.built[m] && m !== M.id.bridge) return 'Something is built in the way.';
      if (m === M.id.water) { if (c.height[i] < RAIL.shallow) return 'The water there is too deep for a rail bridge.'; }
      else if (m && M.liquid[m]) return 'Track cannot be laid through that.';
      fresh.push([x, y, kk, at]);
    }
    if (!fresh.length) return 0;
    // pay by length: two cells across make one metre of track
    const lots = Math.ceil(fresh.length / 2 / RAIL.per);
    const cost = Object.fromEntries(Object.entries(RAIL.cost).map(([g, n]) => [g, n * lots]));
    if (!canPay(cost)) return `Track needs ${costText(cost)} in your stores.`;
    pay(cost, x0, y0);
    for (const [, , kk, { c, i }] of fresh) {
      if (c.mat[i] === M.id.water) { c.mat[i] = M.id.rail_bridge; c.life[i] = 0; }
      else { if (c.mat[i] && !M.liquid[c.mat[i]]) c.mat[i] = 0; c.ground[i] = M.id.rail; }
      c.tall[i] = 0; c.part[i] = RAIL_PART; c.hp[i] = 255; c.temp[i] = M.ambient; c.flag[i] &= ~BURN;
      c.dirty = true; sim.store.markEdited(c);
      track.add(kk); S.track.push(kk);
    }
    S.segs.push([x0, y0, x0 + dx, y1]);
    S.ver++;
    return fresh.length;
  }
  const isTrack = (x, y) => track.has(key(x, y));

  // ------------------------------------------------------------------ stations
  /** Track cells right beside a footprint (its one-cell ring). */
  function ringTrack(x, y, w, h) {
    const out = [];
    for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) {
      if (dx >= 0 && dy >= 0 && dx < w && dy < h) continue;
      if (isTrack(x + dx, y + dy)) out.push([x + dx, y + dy]);
    }
    return out;
  }
  function placeStation({ x, y, instant = false }) {
    const k = KINDS.station;
    const bx = Math.round(x - k.w / 2), by = Math.round(y - k.h / 2);
    if (!T.towns.length) return 'Found a town first.';
    if (!ringTrack(bx, by, k.w, k.h).length) return 'A station has to stand right beside the track.';
    if (!sim.town.fits(bx, by, k.w, k.h, { margin: 0 })) return "A station won't fit there.";
    const town = T.towns.slice().sort((a, b) => dist(x, y, a.x, a.y) - dist(x, y, b.x, b.y) || a.id - b.id)[0];
    const b = sim.town.addBuilding('station', bx, by, town.id, { instant, by: 'player' });
    S.ver++;
    say(instant ? `${town.name} has a railway station.` : `A station is planned for ${town.name}.`, 'good', bx, by);
    return b;
  }

  // ------------------------------------------------------------------ lines (found by themselves)
  let lines = [], sig = '';
  const stations = () => T.buildings.filter(b => b.kind === 'station' && b.state === 'up');
  /** Breadth-first walk over the track from one cell: distance (steps) and parent for every cell reached. */
  function walkFrom(start) {
    const d = new Map([[start, 0]]), from = new Map(), q = [start];
    for (let h = 0; h < q.length; h++) {
      const k = q[h], x = kx(k), y = ky(k);
      for (const [ox, oy] of DIRS) {
        if (y + oy < 0) continue;
        const n = key(x + ox, y + oy);
        if (!track.has(n) || d.has(n)) continue;
        d.set(n, d.get(k) + 1); from.set(n, k); q.push(n);
      }
    }
    return { d, from };
  }
  /** Path from a walk's start to `to`, as unwrapped points smoothed a little, plus running lengths. */
  function pathTo(walk, start, to) {
    const keys = [];
    for (let k = to; k !== undefined; k = walk.from.get(k)) { keys.push(k); if (k === start) break; }
    keys.reverse();
    const raw = []; let px = kx(keys[0]);
    for (const k of keys) { let x = kx(k); while (x - px > W / 2) x -= W; while (px - x > W / 2) x += W; raw.push([x, ky(k)]); px = x; }
    // a moving average over 5 cells so trains glide along a 2-wide track instead of zig-zagging
    const pts = raw.map((p, j) => {
      if (j === 0 || j === raw.length - 1) return [p[0] + 0.5, p[1] + 0.5];
      let sx = 0, sy = 0, n = 0;
      for (let o = -2; o <= 2; o++) { const q = raw[Math.max(0, Math.min(raw.length - 1, j + o))]; sx += q[0]; sy += q[1]; n++; }
      return [sx / n + 0.5, sy / n + 0.5];
    });
    const cum = [0];
    for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  function rebuild() {
    // which piece of track each cell is in
    const comp = new Map(); let nComp = 0;
    for (const k of S.track) {
      if (comp.has(k)) continue;
      const q = [k]; comp.set(k, nComp);
      for (let h = 0; h < q.length; h++) {
        const x = kx(q[h]), y = ky(q[h]);
        for (const [ox, oy] of DIRS) { const n = key(x + ox, y + oy); if (track.has(n) && !comp.has(n)) { comp.set(n, nComp); q.push(n); } }
      }
      nComp++;
    }
    // each station stops at the track cell beside it nearest its middle
    const groups = new Map();
    for (const b of stations().sort((a, c) => a.id - c.id)) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const ring = ringTrack(b.x, b.y, b.w, b.h).map(([x, y]) => ({ x, y, k: key(x, y), d: dist(x + 0.5, y + 0.5, cx, cy) })).sort((a, c) => a.d - c.d || a.k - c.k);
      if (!ring.length) continue;
      const g = comp.get(ring[0].k);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push({ b, at: ring[0].k });
    }
    lines = [];
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      // put the stations in order along the track: start from the one farthest from the first
      const w0 = walkFrom(list[0].at);
      const far = list.slice().sort((a, c) => (w0.d.get(c.at) ?? -1) - (w0.d.get(a.at) ?? -1) || a.b.id - c.b.id)[0];
      const wf = walkFrom(far.at);
      const order = list.slice().sort((a, c) => (wf.d.get(a.at) ?? 0) - (wf.d.get(c.at) ?? 0) || a.b.id - c.b.id);
      const fwd = [];
      for (let j = 0; j + 1 < order.length; j++) fwd.push({ from: j, to: j + 1, ...pathTo(walkFrom(order[j].at), order[j].at, order[j + 1].at) });
      // the trip: end to end and back
      const cycle = fwd.slice();
      for (let j = fwd.length - 1; j >= 0; j--) { const f = fwd[j]; const pts = f.pts.slice().reverse(); const cum = [0]; for (let q = 1; q < pts.length; q++) cum.push(cum[q - 1] + Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1])); cycle.push({ from: f.to, to: f.from, pts, cum, len: cum[cum.length - 1] }); }
      cycle.forEach((leg, j) => { const p = cycle[(j - 1 + cycle.length) % cycle.length]; leg.flip = p.from === leg.to && p.to === leg.from; });
      const ids = order.map(o => o.b.id);
      lines.push({ key: Math.min(...ids), stations: ids, cycle, length: fwd.reduce((a, l) => a + l.len, 0), sig: ids.join(',') + ':' + fwd.map(l => l.len.toFixed(1)).join(',') });
    }
    lines.sort((a, b) => a.key - b.key);
    // trains whose line changed start again from a station; trains whose line is gone are laid up
    for (const t of [...S.trains]) {
      const line = lineOf(t);
      if (!line) { S.trains.splice(S.trains.indexOf(t), 1); T.gold += Math.floor(TR[t.kind].gold / 2); say(`A ${TR[t.kind].name.toLowerCase()} is laid up: its line was cut. Half its price is back in the treasury.`, 'bad'); continue; }
      if (t.sig !== line.sig) { t.sig = line.sig; t.leg = t.leg % line.cycle.length; t.d = startD(t, line.cycle[t.leg]); t.v = 0; t.wait = TR[t.kind].dwell * 20; }
    }
  }
  const lineOf = t => lines.find(l => l.key === t.line);
  function ensureLines() {
    const s = S.ver + '|' + stations().map(b => b.id).join(',');
    if (s !== sig) { sig = s; rebuild(); }
  }

  // ------------------------------------------------------------------ trains
  const trainLen = t => (TR[t.kind].cars - 1) * RAIL.carSpacing;
  /** Where a train's head starts on a leg. At a terminus the train just reverses: its old tail is its new head. */
  const startD = (t, leg) => leg.flip ? Math.min(trainLen(t), leg.len * 0.5) : 0;
  const vmax = t => SPEED * TR[t.kind].speed;
  const vulnerable = t => t.wait > 0 || t.v < vmax(t) * TR[t.kind].safeAbove;
  function pointAt(leg, d) {
    const { pts, cum } = leg;
    if (d <= 0) return pts[0];
    if (d >= leg.len) return pts[pts.length - 1];
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const f = (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
  }
  /** Where each carriage of a train is (engine first). Behind the start of a leg, the cars are still on the last one. */
  function carsOf(t, line) {
    const out = [], leg = line.cycle[t.leg], prev = line.cycle[(t.leg - 1 + line.cycle.length) % line.cycle.length];
    for (let j = 0; j < TR[t.kind].cars; j++) {
      const d = t.d - j * RAIL.carSpacing;
      out.push(d >= 0 || leg.flip ? pointAt(leg, d) : pointAt(prev, prev.len + d));
    }
    return out;
  }
  const stationAt = (line, idx) => byId(line.stations[idx]);

  /** The yard: the station's own store, then its town's other stores within rail.yard metres. */
  function yard(st) {
    return [st, ...T.buildings.filter(b => b !== st && isStore(b) && b.town === st.town && dist(b.x, b.y, st.x, st.y) <= RAIL.yard).sort((a, b) => dist(a.x, a.y, st.x, st.y) - dist(b.x, b.y, st.x, st.y) || a.id - b.id)];
  }
  /** A train stands at the start of leg `t.leg`: unload, then load for the next stop. */
  function atStation(t, line, arrived) {
    const leg = line.cycle[t.leg];
    const st = stationAt(line, leg.from); if (!st) return;
    const nx = stationAt(line, leg.to);
    const stats = S.stats[line.key] ??= { delivered: 0, commuters: 0, trips: 0 };
    if (arrived) stats.trips++;
    const K = TR[t.kind];
    if (t.kind === 'freight') {
      // unload whatever fits
      if (t.load) {
        const k = Math.min(t.load.n, Math.max(0, room(st)));
        if (k) { st.store[t.load.g] = (st.store[t.load.g] || 0) + k; t.load.n -= k; stats.delivered += k; }
        if (t.load.n <= 0) t.load = null;
      }
      // load what the next town is shortest of, next to this one
      if (!t.load && nx && nx.town !== st.town) {
        const here = sim.town.stock(st.town), there = sim.town.stock(nx.town);
        const yd = yard(st);
        let best = null, gap = RAIL.minDiff - 1;
        for (const g of Object.keys(data.goods).sort()) {
          const diff = (here[g] || 0) - (there[g] || 0);
          const avail = yd.reduce((a, b) => a + (b.store[g] || 0), 0);
          if (diff > gap && avail > 0) { gap = diff; best = { g, avail }; }
        }
        if (best) {
          let n = Math.min(K.carry, Math.floor(gap / 2), best.avail), got = 0;
          for (const b of yd) { const k = Math.min(n - got, b.store[best.g] || 0); if (k) { b.store[best.g] -= k; got += k; } if (got >= n) break; }
          if (got) t.load = { g: best.g, n: got };
        }
      }
    } else {
      // passengers: who rode here got off; commuters board for the open jobs at the next stop
      stats.commuters += t.riders || 0;
      t.riders = 0;
      if (nx && nx.town !== st.town) {
        const idle = T.people.filter(p => p.town === st.town && p.job == null).length;
        let open = 0;
        for (const b of T.buildings) { const job = KINDS[b.kind].job; if (b.town === nx.town && b.state === 'up' && job) open += Math.max(0, job.workers - b.workers.length); }
        t.riders = Math.min(K.seats, idle, open);
      }
    }
  }
  function stepTrain(t, line) {
    const K = TR[t.kind];
    if (t.wait > 0) { t.wait--; t.v = 0; return; }
    const leg = line.cycle[t.leg];
    const top = vmax(t), acc = top / (K.accel * 20);
    const left = leg.len - t.d;
    // ease off in time to stop at the platform, otherwise pull up to full speed
    if (left <= t.v * t.v / (2 * acc) + t.v) t.v = Math.max(acc, t.v - acc);
    else t.v = Math.min(top, t.v + acc);
    t.d += t.v;
    if (t.d < leg.len) return;
    // in at a station
    t.v = 0;
    t.leg = (t.leg + 1) % line.cycle.length;
    t.d = startD(t, line.cycle[t.leg]);
    t.wait = K.dwell * 20;
    atStation(t, line, true);
  }

  function addTrain({ line: lk, kind }) {
    const line = lines.find(l => l.key === lk);
    const K = TR[kind];
    if (!line) return 'That line is not there any more.';
    if (!K) return 'No such train.';
    if ((T.gold ?? 0) < K.gold) return `A ${K.name.toLowerCase()} costs ${K.gold} gold.`;
    const st = stationAt(line, 0);
    if (!canPay(K.cost)) return `A ${K.name.toLowerCase()} needs ${costText(K.cost)} in your stores.`;
    T.gold -= K.gold; pay(K.cost, st?.x ?? 0, st?.y ?? 0);
    // a new train starts at the next station along, so trains spread out down the line
    const on = S.trains.filter(t => t.line === lk).length;
    const t = { id: S.nextId++, kind, line: lk, sig: line.sig, leg: on % line.cycle.length, d: 0, v: 0, wait: K.dwell * 20, hp: K.hp, load: null, riders: 0 };
    t.d = startD(t, line.cycle[t.leg]);
    S.trains.push(t);
    atStation(t, line, false);
    say(`A ${K.name.toLowerCase()} joins the line.`, 'good', st?.x, st?.y);
    return t.id;
  }
  function removeTrain({ line: lk, kind }) {
    const list = S.trains.filter(t => t.line === lk && t.kind === kind);
    const t = list[list.length - 1]; if (!t) return 'No train like that on this line.';
    S.trains.splice(S.trains.indexOf(t), 1);
    T.gold += Math.floor(TR[kind].gold / 2);
    return true;
  }

  /** An enemy strikes a train. Only a stopped or slow train can be hurt. Returns false, true, or 'wrecked'. */
  function hit(id, dmg) {
    const t = S.trains.find(t => t.id === id); if (!t || !vulnerable(t)) return false;
    t.hp -= dmg;
    if (t.hp > 0) return true;
    S.trains.splice(S.trains.indexOf(t), 1);
    const line = lineOf(t); const at = line ? carsOf(t, line)[0] : [undefined, undefined];
    say(`A ${TR[t.kind].name.toLowerCase()} was wrecked. ${t.load ? 'Its load is lost.' : 'Nobody was hurt.'}`, 'bad', at[0], at[1]);
    return 'wrecked';
  }

  /** Passenger lines share appeal: extra settlers for this town from every bigger town it is linked to. */
  function appeal(town) {
    ensureLines();
    const pop = id => T.people.reduce((a, p) => a + (p.town === id), 0);
    const mine = pop(town.id);
    let extra = 0;
    for (const line of lines) {
      if (!S.trains.some(t => t.line === line.key && t.kind === 'passenger')) continue;
      const towns = [...new Set(line.stations.map(id => byId(id)?.town).filter(x => x != null))];
      if (!towns.includes(town.id)) continue;
      for (const u of towns) if (u !== town.id) extra += Math.max(0, pop(u) - mine) * RAIL.appealShare;
    }
    return Math.min(RAIL.appealCap, extra);
  }

  /** Towns that share a passenger line with this one (for commuters taking jobs there; town.js, later). */
  function linkedTowns(townId) {
    ensureLines();
    const out = new Set();
    for (const line of lines) {
      if (!S.trains.some(t => t.line === line.key && t.kind === 'passenger')) continue;
      const towns = line.stations.map(id => byId(id)?.town).filter(x => x != null);
      if (towns.includes(townId)) for (const u of towns) if (u !== townId) out.add(u);
    }
    return [...out].sort((a, b) => a - b);
  }

  // ------------------------------------------------------------------ the system
  function step() {
    if (sim.tick % 20 === 3 || !sig) ensureLines();
    for (const t of S.trains) { const line = lineOf(t); if (line) stepTrain(t, line); }
  }
  function order(o) {
    switch (o.t) {
      case 'rail': return sim.unlocked?.('rail') === false ? 'Your kingdom does not know how to make that yet.' : layTrack(o);
      case 'station': return sim.unlocked?.('station') === false ? 'Your kingdom does not know how to make that yet.' : placeStation(o);
      case 'train.add': if (sim.unlocked?.('train:' + (o.kind || o.type || 'freight')) === false) return 'Your kingdom does not know how to make that yet.'; ensureLines(); return addTrain(o);
      case 'train.remove': return removeTrain(o);
      case 'train.hit': return hit(o.id, o.dmg ?? 10);
      // test tool (?dev and node tests): put goods in the first keep
      case 'dev.give': { const k = T.buildings.find(b => b.kind === 'keep'); if (!k) return null; for (const [g, n] of Object.entries(o.goods || {})) k.store[g] = (k.store[g] || 0) + n; T.gold += o.gold || 0; return true; }
      default: return null;
    }
  }
  /** For the page: the track drawn, the lines (Lines screen) and every train's carriages. */
  function view(rect) {
    const near = (x, y) => { if (!rect) return x; while (x < rect.x0 - 40) x += W; while (x > rect.x1 + 40) x -= W; return x >= rect.x0 - 40 && x <= rect.x1 + 40 && y >= rect.y0 - 40 && y <= rect.y1 + 40 ? x : null; };
    const trains = [];
    for (const t of S.trains) {
      const line = lineOf(t); if (!line) continue;
      const cars = carsOf(t, line);
      const hx = near(cars[0][0], cars[0][1]); if (hx == null) continue;
      const shift = hx - cars[0][0];
      trains.push({ id: t.id, kind: t.kind, cars: cars.map(([x, y]) => [+(x + shift).toFixed(2), +y.toFixed(2)]), vul: vulnerable(t) ? 1 : 0, hp: t.hp, max: TR[t.kind].hp, load: t.load, riders: t.riders || 0, v: +(t.v * 20).toFixed(1), wait: t.wait });
    }
    return {
      segs: S.segs,
      lines: lines.map(l => {
        const st = l.stations.map(id => byId(id)).filter(Boolean);
        const legs = l.cycle.slice(0, l.stations.length - 1);
        const freight = S.trains.filter(t => t.line === l.key && t.kind === 'freight').length;
        const passenger = S.trains.filter(t => t.line === l.key && t.kind === 'passenger').length;
        // one way at a freight train's full speed plus its stops (it eases in and out of each)
        const K = TR.freight, top = SPEED * K.speed * 20;
        const secs = Math.round(legs.reduce((a, g) => a + g.len / top + K.accel, 0) + K.dwell * (st.length - 1));
        return { key: l.key, stations: st.map(b => ({ id: b.id, town: townOf(b.town)?.name || '?', x: b.x + (b.w >> 1), y: b.y + (b.h >> 1) })), length: Math.round(l.length), secs, freight, passenger, ...(S.stats[l.key] || { delivered: 0, commuters: 0, trips: 0 }) };
      }),
      trains,
    };
  }

  return { id: 'trains', step, order, view, appeal, hit, layTrack, isTrack, linkedTowns, lines: () => { ensureLines(); return lines; }, vulnerable: id => { const t = S.trains.find(t => t.id === id); return !!t && vulnerable(t); }, get state() { return S; } };
}
