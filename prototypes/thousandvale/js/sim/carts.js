// OX CARTS (stream A, owner feedback 8 W5, report #26: "ox carts at towns, and sometimes travelling the road, that act as
// PAID fast travel to other towns"). Pure. Runs stream E's data/provinces/carts.json (stops, the fare table over the
// road network, ride times) with the fare knobs of data/provinces/economy.json `cart`.
//
//   const C = createCarts({ data, layouts, online, journal, econ, now, setTimeoutTicks, moveTo, questEvent, fighting,
//                           dismount, consume, tickMs, log, counters, cartFare })
//   C.stopFor(obj) -> stop | null        the stop a thing you can `use` stands for: a parked cart object (data.cart), a
//                                        carter NPC (data.npc.cart, or role 'carter' beside a cart), a roaming ox-carter
//                                        (data.traveller.cart: the stop of the town it is walking TO)
//   C.list(o, obj) -> `cartList` body | null
//   C.go(o, m, obj) -> sends `cartR`, then `cartRide`; `ms` later you stand beside the destination's cart
//   C.place(stopId) -> { province, x, z }   where a ride to that stop ends
//
// A ride needs no waystone and no discovery — it takes you somewhere you have never been; that is what you pay for.
// Each rider pays their own fare (gold, or ONE `cart_token` good for a fare of any size). While you ride you are held
// (js/sim/room.js `e.held`): no steps, and the ride is called off — fare back — if you die or leave before it ends.

export const CART_DEFAULTS = Object.freeze({ boardM: 6, flagDownM: 12, rideSecPerKm: 2, minRideSec: 4, maxRideSec: 14, minLevel: 1 });
export const CART_TOKEN = 'cart_token';

/**
 * Round 11 (World, live #45: "When you start riding on a caravan to another town, it seems to just ride off in a random
 * direction … right into the Torborhold walls … make the caravans leave following the road"). The first `maxM` metres of
 * the ride as a polyline in world metres: from `start` (where the cart stands) onto the road out of `town` whose far end
 * lies nearest the destination, then along it. `routes` = the province's travel routes ({ from:{name}, to:{name}, pts }).
 * Empty when no road passes within `nearM` of the cart (the client then rolls straight, as before). Pure.
 */
export function departPath(routes, start, town, dest, { maxM = 160, nearM = 140, centre = null } = {}) {
  if (!start) return [];
  // no road near the cart: straight out, AWAY from the town's middle (the cart stands outside its gate), never through it
  const outward = () => { if (!centre) return []; const dx = start.x - centre.x, dz = start.z - centre.z, d = Math.hypot(dx, dz); if (d < 1) return []; const r1 = v => Math.round(v * 10) / 10; return [[r1(start.x), r1(start.z)], [r1(start.x + dx / d * 40), r1(start.z + dz / d * 40)]]; };
  if (!Array.isArray(routes) || !routes.length) return outward();
  const bareN = n => String(n || '').toLowerCase().replace(/^the\s+/, '');
  const T = bareN(town);
  let best = null;
  for (const r of routes) {
    const pts = Array.isArray(r.pts) ? r.pts.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
    if (pts.length < 2) continue;
    const ends = bareN(r.from && r.from.name) === T ? [pts] : bareN(r.to && r.to.name) === T ? [pts.slice().reverse()] : [pts, pts.slice().reverse()];
    for (const line of ends) {
      let i0 = -1, d0 = Infinity;
      for (let i = 0; i < line.length; i++) { const d = Math.hypot(line[i][0] - start.x, line[i][1] - start.z); if (d < d0) { d0 = d; i0 = i; } }
      if (d0 > nearM || i0 >= line.length - 1) continue;
      const far = line[line.length - 1], toDest = dest ? Math.hypot(far[0] - dest.x, far[1] - dest.z) : 0;
      const score = toDest + d0 * 4 + (bareN(r.from && r.from.name) === T || bareN(r.to && r.to.name) === T ? 0 : 500);
      if (!best || score < best.score) best = { score, line, i0 };
    }
  }
  if (!best) return outward();
  const out = [[Math.round(start.x * 10) / 10, Math.round(start.z * 10) / 10]];
  let walked = 0, last = out[0];
  for (let i = best.i0; i < best.line.length && walked < maxM; i++) {
    const p = best.line[i], d = Math.hypot(p[0] - last[0], p[1] - last[1]);
    if (d < 2) continue;
    walked += d; last = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; out.push(last);
  }
  return out.length >= 2 ? out : outward();
}

export function createCarts({ data = null, layouts = [], online, journal = () => {}, econ = null, setTimeoutTicks, moveTo, questEvent = () => {}, fighting = () => false, dismount = () => {},
  consume = null, tickMs = 50, log = () => {}, counters = {}, cartFare = null }) {
  const D = data || {};
  const R = { ...CART_DEFAULTS, ...(D.rules || {}) };
  const stops = new Map((D.stops || []).map(s => [s.id, s]));
  const fares = D.fares || {};
  const bare = n => String(n || '').toLowerCase().replace(/^the\s+/, '');
  const byTown = new Map((D.stops || []).map(s => [bare(s.town), s]));
  // where each stop's cart really stands in this world (the placed `cart` object), else the stop's own world point
  const placed = new Map();
  for (const L of layouts) for (const o of [...(L.objects || []), ...((L.townObjects || []).flat())]) if (o && o.cart && o.cart.stop && !placed.has(o.cart.stop)) placed.set(o.cart.stop, { province: L.key, x: o.x, z: o.z, yaw: o.yaw || 0 });
  const homeKey = (layouts[0] && layouts[0].key) || null;
  function place(id) {
    const p = placed.get(id);
    if (p) return { province: p.province, x: p.x + Math.cos(p.yaw + 1.57) * 2.5, z: p.z + Math.sin(p.yaw + 1.57) * 2.5 };     // beside the cart, not inside it
    const s = stops.get(id);
    return s && Number.isFinite(s.x) ? { province: s.province || homeKey, x: s.x, z: s.z } : null;
  }
  const fareOf = row => (Number.isFinite(row.gold) ? row.gold : cartFare ? cartFare(row.metres || 0) : Math.max(4, Math.round(3 + (row.metres || 0) / 250)));
  const rideMs = metres => Math.round(Math.max(R.minRideSec, Math.min(R.maxRideSec, R.rideSecPerKm * (metres || 0) / 1000)) * 1000);
  const fill = (str, tok) => String(str || '').replace(/\{(\w+)\}/g, (m, k) => (tok[k] != null ? String(tok[k]) : m));
  const isToken = i => !!i && (i.id === CART_TOKEN || i.good === CART_TOKEN || i.base === CART_TOKEN || (i.use && i.use.type === 'cartToken'));
  const tokenIdx = ch => (ch.bag || []).findIndex(isToken);
  const tokensOf = ch => (ch.bag || []).reduce((n, i) => n + (isToken(i) ? Math.max(1, i.count | 0 || 1) : 0), 0);

  function stopFor(obj) {
    const d = (obj && obj.data) || {};
    if (d.cart && d.cart.stop) return stops.get(d.cart.stop) || null;
    if (d.npc && d.npc.cart) return stops.get(d.npc.cart) || null;
    if (d.traveller && d.traveller.cart && (!d.npc || d.npc.role === 'carter')) return byTown.get(bare(d.traveller.to)) || byTown.get(bare(d.traveller.from)) || null;
    if (d.npc && d.npc.role === 'carter') {            // a carter with no stop named: the nearest stop's
      let best = null, bd = Infinity;
      for (const [id, p] of placed) { const dd = Math.hypot(p.x - obj.x, p.z - obj.z); if (dd < bd) { bd = dd; best = id; } }
      return best && bd < 60 ? stops.get(best) : null;
    }
    return null;
  }
  const isRoaming = obj => !!(obj && obj.data && obj.data.traveller && obj.data.traveller.cart);
  const reachOf = obj => (isRoaming(obj) ? R.flagDownM : R.boardM);

  function rows(o, from) {
    const ch = o.char, gold = ch.gold || 0, tok = tokensOf(ch);
    return (fares[from.id] || []).filter(r => stops.has(r.to) && place(r.to)).map(r => {
      const s = stops.get(r.to), fare = fareOf(r), need = s.minLevel || 0;
      const row = { id: r.to, name: s.town || r.town, fare, m: Math.round(r.metres || 0), s: Math.round(rideMs(r.metres) / 1000), ...(r.hops ? { hops: r.hops } : {}), ...(s.kind ? { kind: s.kind } : {}), ...(s.zone ? { zone: s.zone } : {}) };
      if (need && (ch.level || 1) < need) Object.assign(row, { locked: true, why: 'level', msg: 'The carter will not take anyone under level ' + need + ' there.' });
      else if (gold < fare && !tok) Object.assign(row, { locked: true, why: 'gold', msg: fill((R.refuse && R.refuse.gold) || 'That is {fare} gold to {town}.', { fare, town: row.name }) });
      return row;
    }).sort((a, b) => a.m - b.m);
  }
  function list(o, obj) {
    const from = stopFor(obj);
    if (!from) return null;
    return { t: 'cartList', id: obj.id, from: from.id, name: from.town, roaming: isRoaming(obj) || undefined, says: Array.isArray(R.says) && R.says.length ? R.says[(obj.id + (o.char.id | 0)) % R.says.length] : undefined,
      stops: rows(o, from), gold: o.char.gold || 0, tokens: tokensOf(o.char) };
  }

  function go(o, m, obj) {
    const s = o.conn, e = o.entity, ch = o.char;
    const reply = x => { if (s) s.sendJSON({ t: 'cartR', op: 'go', to: m.to || null, ...x }); };
    const from = stopFor(obj);
    if (!from) return reply({ ok: false, why: 'stop', msg: 'There is no cart here.' });
    if (Math.hypot(obj.x - e.x, obj.z - e.z) > reachOf(obj) + 0.5) return reply({ ok: false, why: 'far', msg: 'Walk over to the cart first.' });
    if (e.dead) return reply({ ok: false, why: 'dead', msg: 'You are dead.' });
    if (o.cartRide || o.travelling) return reply({ ok: false, why: 'busy', msg: 'You are already on your way.' });
    if (fighting(o, e)) return reply({ ok: false, why: 'fight', msg: (R.refuse && R.refuse.combat) || 'Not while you are in a fight.' });
    if (m.to === from.id) return reply({ ok: false, why: 'same', msg: fill((R.refuse && R.refuse.same) || 'You are standing in {town}.', { town: from.town }) });
    const row = (fares[from.id] || []).find(r => r.to === m.to), dest = row && stops.get(row.to), at = dest && place(dest.id);
    if (!row || !dest || !at) return reply({ ok: false, why: 'stop', msg: 'The cart does not go there.' });
    if (dest.minLevel && (ch.level || 1) < dest.minLevel) return reply({ ok: false, why: 'level', msg: 'The carter will not take anyone under level ' + dest.minLevel + ' there.' });
    const fare = fareOf(row), ti = tokenIdx(ch);
    const byToken = ti >= 0 && !!consume && ((ch.gold || 0) < fare || m.token === true);
    if (!byToken && (ch.gold || 0) < fare) return reply({ ok: false, why: 'gold', fare, msg: fill((R.refuse && R.refuse.gold) || 'That is {fare} gold to {town}.', { fare, town: dest.town }) });
    // pay
    if (byToken) consume(o, ti);
    else { ch.gold -= fare; journal(o, 'gold', { d: -fare }); if (econ) econ.add('sink', 'cartFare', { gold: fare }, ch.level || 1); if (s) s.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold }); }
    o.dirty = true;
    dismount(o, 'cart');
    const ms = rideMs(row.metres);
    counters.cartRides = (counters.cartRides || 0) + 1;
    reply({ ok: true, name: dest.town, fare: byToken ? 0 : fare, ...(byToken ? { token: true } : {}), ms });
    // round 11 (#45): the way out — onto the road toward the destination, never straight through the town wall
    const routes = (layouts.find(L => L.key === (o.room && o.room.meta && o.room.meta.province)) || layouts[0] || {}).travel?.routes || [];
    let path = [];
    const lay = layouts.find(L => L.key === (o.room && o.room.meta && o.room.meta.province)) || layouts[0] || {};
    const centre = (lay.towns || []).find(t => bare(t.name) === bare(from.town)) || null;
    try { path = departPath(routes, { x: obj.x, z: obj.z }, from.town, at, { centre }); } catch { path = []; }
    if (s) s.sendJSON({ t: 'cartRide', to: { id: dest.id, name: dest.town, x: Math.round(at.x), z: Math.round(at.z), province: at.province }, from: { id: from.id, name: from.town }, ms, fare: byToken ? 0 : fare, m: Math.round(row.metres || 0), ...(path.length ? { path } : {}) });
    e.held = 'cart';
    const ride = o.cartRide = { to: dest.id, from: from.id, entity: e };
    setTimeoutTicks(() => {
      if (o.cartRide !== ride) return;
      o.cartRide = null;
      if (ride.entity.held === 'cart') ride.entity.held = null;
      const here = online.get(ch.id) === o && o.conn && !o.entity.dead && !o.relocating;
      if (!here) {           // died on the cart, or gone: the fare back (a token is not minted again; it was a gift)
        if (!byToken) { ch.gold = (ch.gold || 0) + fare; journal(o, 'gold', { d: fare }); if (econ) econ.add('faucet', 'cartRefund', { gold: fare }, ch.level || 1); o.dirty = true; }
        if (o.conn) { o.conn.sendJSON({ t: 'cartR', op: 'arrive', ok: false, to: dest.id, why: 'interrupted', msg: 'The ride was called off.' + (byToken ? '' : ' Your fare came back.') }); o.conn.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold }); }
        return;
      }
      try { moveTo(o, at.province, { x: at.x, z: at.z }, 'cart'); } catch (err) { log('cart arrive', err && err.stack); }
      questEvent(o, { kind: 'ride', to: dest.id, from: from.id, x: at.x, z: at.z });
      if (o.conn) o.conn.sendJSON({ t: 'cartR', op: 'arrive', ok: true, to: dest.id, name: dest.town });
    }, Math.max(1, Math.round(ms / tickMs)));
    return true;
  }
  /** A character leaving the world mid-ride: nothing to do — the timer finds them gone and pays the fare back into the save. */
  return { stopFor, list, go, place, stops, R, isRoaming, reachOf, rideMs, tokensOf };
}
