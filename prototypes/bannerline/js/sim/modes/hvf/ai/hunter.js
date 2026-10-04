// Stream E — the HUNTER AI (docs/hvf-PLAN.md §10). One think every `reaction` ticks:
//
//   1. shop        at a lodge with gold: the shopping list for its level (Recruit: whatever it can afford;
//                  Veteran: Pony, Watchstones, blade, leathers; Commander: Pony, Watchstones, Spyglass,
//                  Axe, horses up the ladder, Hound) — before release the kennel is the shop
//   2. retreat     below `retreatAt` health, back to the nearest lodge (Recruit never)
//   3. hunt        a farmer in sight: chase and kill (Pounce to close the gap); else what fights back
//                  (a tower shooting me, crows); else animals and producers it can see
//   4. breach      a target behind a hedge or wall: hit the hedge; a pocket behind trees: chop in
//   5. search      the suspicion map (suspicion.js): go to argmax(suspicion / travel); Hawk ahead to the
//                  next best place; Horn when the trail is hot but nothing shows; snares at the mouth of a
//                  found base; watchstones on the busiest junctions (Recruit 1, Veteran 3, Commander 3
//                  on chokes near suspicion)
//   6. lodges      a second and third lodge spread out across the map (more when the Turn goes against
//                  it: a hunter with no lodge standing is out)
//   7. the Turn    early: push hard, everything into the search; once the farmers' army outweighs it
//                  (state.hvf.turn > 0), avoid scarecrow packs, guard the lodges, pick off farmers alone
//
// Every command is checked against the sim's refusal functions (castRefusal, buyRefusal, lodgeRefusal,
// the attack visibility rule, a route check).

import { next, int } from '../../../rng.js';
import { castRefusal, buyRefusal, lodgeRefusal, gear, nearLodge } from '../hunter.js';
import { canSee } from '../vision.js';
import { FARMERS, HUNTERS, entById } from '../state.js';
import { released } from '../units.js';
import { updateSuspicion, bestPoi, poisOf, known } from './suspicion.js';
import { routeBudget, canRoute, d2, dist, live, n8, liveGrid, cellOf, cellX, cellZ, canStand, KIND } from './common.js';

const SHOP = {
  impulse: null,
  value: ['horse1', 'watchstone', 'blade', 'leathers', 'blade', 'salve'],
  build: ['horse1', 'watchstone', 'spyglass', 'axe', 'horse2', 'blade', 'watchstone', 'leathers', 'horse3', 'hound', 'blade', 'salve'],
};

/** Leave a point alone for 90 s (unreachable, or searched and empty). */
function ban(m, i, tick) { if (!m.banned) m.banned = {}; m.banned[i] = tick + 1800; m.checked[i] = tick; m.sus[i] *= 0.1; }

function lodges(state, p) { return state.ents.filter(b => b.kind === 'building' && b.lodge && b.owner === p.id && live(b) && b.done !== false); }

/** The next item on this hunter's list it does not carry yet (null when done). */
export function nextItem(ctx, p, K) {
  const I = ctx.data.hvf['hunter-items'].items;
  const list = SHOP[K.hunt.shop];
  if (!list) return null;
  const have = {};
  for (const it of p.inv) if (it) have[it.id] = (have[it.id] || 0) + 1;
  const horse = p.inv.find(it => it && I[it.id].group === 'horse');
  for (const id of list) {
    if (have[id] > 0) { have[id]--; continue; }
    if (I[id].group === 'horse' && horse && I[horse.id].price >= I[id].price) continue;
    if (id === 'watchstone' && p.inv.some(it => it && it.id === 'watchstone')) continue;
    return id;
  }
  return null;
}

function shopping(ctx, p, K, rng, cmd) {
  const { data } = ctx;
  const I = data.hvf['hunter-items'].items;
  if (!nearLodge(ctx, p)) return false;
  let did = false;
  if (K.hunt.shop === 'impulse') {
    const ids = Object.keys(I).filter(id => buyRefusal(ctx, p, id) === null);
    if (ids.length && next(rng) < 0.5) { cmd('buy', { id: ids[int(rng, ids.length)] }); did = true; }
    return did;
  }
  const want = nextItem(ctx, p, K);
  if (!want) return false;
  // a better horse replaces the old one (one mount at a time)
  if (I[want].group === 'horse') {
    const slot = p.inv.findIndex(it => it && I[it.id].group === 'horse');
    if (slot >= 0) {
      const back = Math.round(I[p.inv[slot].id].price * data.hvf['hunter-items'].sellFactor);
      if (p.gold + back >= I[want].price) { cmd('sell', { slot }); cmd('buy', { id: want }); return true; }
      return false;
    }
  }
  // make room: sell a spent-out or cheap item when full
  if (p.inv.indexOf(null) < 0) return false;
  if (buyRefusal(ctx, p, want) === null) { cmd('buy', { id: want }); return true; }
  return false;
}

function visibleFoes(ctx) {
  const out = { farmers: [], animals: [], buildings: [], army: [], kit: [] };
  for (const e of ctx.state.ents) {
    if (e.team !== FARMERS || !live(e) || !canSee(ctx, HUNTERS, e)) continue;
    if (e.kind === 'farmer') out.farmers.push(e);
    else if (e.kind === 'animal') out.animals.push(e);
    else if (e.kind === 'building') out.buildings.push(e);
    else if (e.kind === 'army') out.army.push(e);
  }
  return out;
}

const nearest = (list, x, z) => { let b = null, bd = Infinity; for (const e of list) { const dd = d2(e.x, e.z, x, z); if (dd < bd || (dd === bd && e.id < b.id)) { bd = dd; b = e; } } return b; };

/** A cell to cut (tree / briar) or a farmer building to hit, between me and (tx, tz). */
function breachToward(ctx, me, tx, tz) {
  const { state, map } = ctx, g = liveGrid(ctx);
  const here = cellOf(map, me.x, me.z);
  let cut = -1, cd = Infinity, wall = null, wd = Infinity;
  for (const c of n8(map, here).concat(n8(map, here).flatMap(j => n8(map, j)))) {
    const k = g.cells[c], dd = d2(cellX(map, c), cellZ(map, c), tx, tz);
    if ((k === KIND.tree || k === KIND.briar) && dd < cd && map.level[c] === map.level[here]) { cd = dd; cut = c; }
  }
  for (const b of state.ents) {
    if (b.kind !== 'building' || b.team !== FARMERS || !live(b) || !b.cells || !canSee(ctx, HUNTERS, b)) continue;
    if (d2(b.x, b.z, me.x, me.z) > 16) continue;
    const dd = d2(b.x, b.z, tx, tz);
    if (dd < wd) { wd = dd; wall = b; }
  }
  const myD = d2(me.x, me.z, tx, tz);
  if (wall && wd < myD) return { attack: wall };
  if (cut >= 0 && cd < myD) return { chop: cut };
  return null;
}

export function hunterThink(ctx, p, K, rng, cmd) {
  const { state, data, map } = ctx;
  const m = p.ai, HK = K.hunt;
  const me = entById(state, p.ent);
  if (!me || !me.alive || p.out) return;
  const route = (type, args, goal, near, closest) => {
    // a point projected from a track can fall off the map: keep every target inside it
    if (args.x != null) { args.x = Math.max(1, Math.min(map.size - 1, args.x)); args.z = Math.max(1, Math.min(map.size - 1, args.z)); goal = cellOf(map, args.x, args.z); }
    // a route that just failed is not searched again for five seconds (a failed search walks the
    // whole map; doing that every think is most of the AI's cost)
    const key = type + ':' + goal;
    if (m.fail && m.fail[key] > state.tick) return false;
    if (!routeBudget(state)) { m.retry = true; return false; }
    if (!canRoute(ctx, me, goal, near, closest)) {
      if (!m.fail || Object.keys(m.fail).length > 24) m.fail = {};
      m.fail[key] = state.tick + 100;
      return false;
    }
    cmd(type, args); return true;
  };
  const cast = (slot, x, z) => {
    if (castRefusal(ctx, p, slot)) return false;
    const S = data.hvf.hunter.skills[slot];
    if (x != null && S.range && d2(me.x, me.z, x, z) > S.range * S.range) return false;
    if (x != null) {   // the same ground rules castHunter applies
      const c = cellOf(map, x, z), g = liveGrid(ctx);
      if (S.id === 'pounce' && (!canStand(g, 'hunter', c) || map.level[c] !== map.level[cellOf(map, me.x, me.z)])) return false;
      if (S.id === 'snare') {
        if (!canStand(g, 'farmer', c)) return false;
        if (state.ents.filter(q => q.kind === 'snare' && q.owner === p.id && !q._gone).length >= S.max + gear(data, p).snares) return false;
      }
    }
    cmd('cast', x == null ? { slot } : { slot, x, z }); return true;
  };

  // ── 1. shop (also before release: the kennel is a lodge) ──
  if (shopping(ctx, p, K, rng, cmd)) return;
  if (!released(state)) return;

  const ev = updateSuspicion(ctx, p, K, me);
  const hp = me.hp / me.hpMax;
  const turn = state.hvf.turn;
  const L = lodges(state, p);

  // ── 2. retreat ──
  if (HK.retreatAt > 0 && hp < HK.retreatAt && L.length) {
    const home = nearest(L, me.x, me.z);
    if (d2(me.x, me.z, home.x, home.z) > 36) {
      if (!(me.ord.k === 'move' && m.goal === 'lodge')) { if (route('move', { x: home.x, z: home.z }, cellOf(map, home.x, home.z), false, true)) m.goal = 'lodge'; }
      return;
    }
    if (hp < 0.8) return;   // heal up at the lodge
  }
  if (m.goal === 'lodge' && hp >= 0.8) m.goal = null;

  // ── 3. hunt what is in sight ──
  const F = visibleFoes(ctx);
  // after the Turn, scarecrow packs are trouble: back off toward a lodge
  if (HK.turnAware && turn > 0.15) {
    const pack = F.army.filter(u => u.type === 'scarecrow' && d2(u.x, u.z, me.x, me.z) < 225);
    if (pack.length >= 2 && L.length) { const home = nearest(L, me.x, me.z); if (route('move', { x: home.x, z: home.z }, cellOf(map, home.x, home.z), false, true)) { m.goal = 'lodge'; return; } }
  }
  let target = null;
  const farmer = nearest(F.farmers, me.x, me.z);
  if (farmer && d2(farmer.x, farmer.z, me.x, me.z) < HK.chase * HK.chase) target = farmer;
  if (!target) {
    const shooting = F.buildings.filter(b => b.type === 'tower' && d2(b.x, b.z, me.x, me.z) < 196);
    const pests = F.army.filter(u => d2(u.x, u.z, me.x, me.z) < 64);
    if (HK.priority && shooting.length && hp > 0.45) target = nearest(shooting, me.x, me.z);
    else if (pests.length) target = nearest(pests, me.x, me.z);
  }
  if (!target && F.animals.length) target = nearest(F.animals, me.x, me.z);
  if (!target && F.buildings.length) {
    // Commander: the Farmhouse first (a farmer with one comes back on his own), then what earns
    const house = HK.priority ? F.buildings.filter(b => b.type === 'farmhouse') : [];
    const prod = HK.priority ? F.buildings.filter(b => data.hvf.buildings.kinds[b.type] && (data.hvf.buildings.kinds[b.type].makes || data.hvf.buildings.kinds[b.type].incomePct || data.hvf.buildings.kinds[b.type].flat)) : [];
    target = nearest(house.length ? house : prod.length ? prod : F.buildings, me.x, me.z);
  }
  if (target) {
    m.lastSeen = { x: target.x, z: target.z, tick: state.tick, kind: target.kind };
    const td = dist(me.x, me.z, target.x, target.z);
    // Pounce at a farmer getting away
    if (target.kind === 'farmer' && td > 3 && td <= data.hvf.hunter.skills.Q.range && cast('Q', target.x, target.z)) return;
    // a snare on the farmer's line (Veteran+)
    if (target.kind === 'farmer' && HK.snares && td < 6 && cast('W', target.x, target.z)) return;
    // stuck behind something?
    const prog = m.progress;
    if (prog && prog.id === target.id && state.tick - prog.tick > 40 && td >= prog.d - 0.5 && td > 2.5) {
      const b = breachToward(ctx, me, target.x, target.z);
      m.progress = { id: target.id, d: td, tick: state.tick };
      if (b && b.attack) { cmd('attack', { target: b.attack.id }); m.breach = b.attack.id; return; }
      if (b && b.chop != null && route('chop', { cell: b.chop }, b.chop, true, false)) return;
    }
    if (!prog || prog.id !== target.id || td < prog.d - 0.5) m.progress = { id: target.id, d: td, tick: state.tick };
    if (!(me.ord.k === 'attack' && me.ord.target === target.id) && !(me.ord.k === 'attack' && me.ord.target === m.breach && live(entById(state, m.breach)))) {
      // the sim drops an attack it cannot path to; re-issuing it every think is a whole-map search
      // each time — after a drop, try the breach or leave that target alone for a few seconds
      if (m.attacked && m.attacked.id === target.id && state.tick - m.attacked.at < 100) {
        const b = breachToward(ctx, me, target.x, target.z);
        if (b && b.attack) { cmd('attack', { target: b.attack.id }); m.breach = b.attack.id; return; }
        if (b && b.chop != null && route('chop', { cell: b.chop }, b.chop, true, false)) return;
        return;
      }
      m.attacked = { id: target.id, at: state.tick };
      cmd('attack', { target: target.id });
    }
    return;
  }
  // fair play: an attack order keeps chasing in the sim even into the fog; the AI lets go of what it
  // can no longer see and goes to where it was last seen instead
  if (me.ord.k === 'attack') {
    const t = entById(state, me.ord.target);
    if (t && live(t) && canSee(ctx, HUNTERS, t)) return;
    if (t && m.lastSeen && route('move', { x: m.lastSeen.x, z: m.lastSeen.z }, cellOf(map, m.lastSeen.x, m.lastSeen.z), false, true)) { m.goal = 'lastSeen'; return; }
    if (!t) cmd('stop');
    return;
  }
  if (me.ord.k === 'chop') return;

  // Commander: camp a fresh grave for a while — his friends come to revive him (graves are public)
  if (HK.camp > 0) {
    let gr = null;
    for (const g of state.hvf.graves) if (state.tick - g.since < HK.camp * 20 && (!gr || g.since > gr.since)) gr = g;
    if (gr) {
      const dd = dist(me.x, me.z, gr.x, gr.z);
      if (dd > 9) { if (!(me.ord.k === 'move' && m.goal === 'grave') && route('move', { x: gr.x, z: gr.z }, cellOf(map, gr.x, gr.z), false, true)) m.goal = 'grave'; return; }
      if (dd > 4) return;   // close enough: wait out of the way
      // standing on the grave: step aside a little (from the right distance a reviver walks into reach)
      if (route('move', { x: gr.x + 6, z: gr.z }, cellOf(map, gr.x + 6, gr.z), false, true)) { m.goal = 'grave'; return; }
      return;
    }
  }

  // the last farmer I saw went somewhere: look there first
  if (m.lastSeen && m.lastSeen.kind === 'farmer' && state.tick - m.lastSeen.tick < HK.memory) {
    if (d2(me.x, me.z, m.lastSeen.x, m.lastSeen.z) > 16) {
      if (!(me.ord.k === 'move' && m.goal === 'lastSeen')) { if (route('move', { x: m.lastSeen.x, z: m.lastSeen.z }, cellOf(map, m.lastSeen.x, m.lastSeen.z), false, true)) m.goal = 'lastSeen'; }
      return;
    }
    m.lastSeen = null;
  }

  // ── 4. kit: watchstones, lodges, hawk, horn ──
  if (kit(ctx, p, K, rng, me, cmd, route, cast, ev, L, turn)) return;

  // ── 5. search ──
  const P = poisOf(map);
  // a fresh bleat / track / sighting beats a map point: go to the spot itself, and cut in if it is
  // behind trees (that is how a pocket nobody has seen yet gets found)
  if (m.hot && m.hot.length) {
    let hb = null, hs = 0;
    for (const h of m.hot) { const sc = h.w / (dist(me.x, me.z, h.x, h.z) + 30); if (h.tries < 4 && sc > hs) { hs = sc; hb = h; } }
    const bp = bestPoi(ctx, p, me);
    const ps = bp >= 0 ? m.sus[bp] / (dist(me.x, me.z, P[bp].x, P[bp].z) + 30) : 0;
    if (hb && hs >= ps) {
      const moving = me.ord.k === 'move' && me.ord.path && me.ord.i < me.ord.path.length;
      if (moving && m.goal === 'hot') return;
      const dd = dist(me.x, me.z, hb.x, hb.z);
      // a try counts once per two seconds, whatever the think rate
      if (state.tick - (hb.at || -1000) >= 40) { hb.tries++; hb.at = state.tick; }
      if (dd > 5 && hb.tries <= 2 && route('move', { x: hb.x, z: hb.z }, cellOf(map, hb.x, hb.z), false, true)) { m.goal = 'hot'; return; }
      if (dd < 24) {
        const b = breachToward(ctx, me, hb.x, hb.z);
        if (b && b.chop != null && route('chop', { cell: b.chop }, b.chop, true, false)) { hb.tries--; return; }
        if (b && b.attack && canSee(ctx, HUNTERS, b.attack)) { cmd('attack', { target: b.attack.id }); return; }
      }
      if (hb.tries >= 4) hb.w *= 0.2;
    }
  }
  const best = bestPoi(ctx, p, me);
  if (best < 0) return;
  const poi = P[best];
  const there = d2(me.x, me.z, poi.x, poi.z) < 16;
  if (there) {
    // nothing here: the evidence came from somewhere close and hidden — the nearest pocket next
    m.checked[best] = state.tick; m.sus[best] *= 0.05; m.target = -1;
    let pk = -1, pd = 40 * 40;
    for (let i = 0; i < P.length; i++) if (P[i].kind === 'pocket' && known(state, map, P[i]) && (m.checked[i] < 0 || state.tick - m.checked[i] > 1200)) { const dd = d2(me.x, me.z, P[i].x, P[i].z); if (dd < pd) { pd = dd; pk = i; } }
    if (pk >= 0) m.sus[pk] += 3;
    return;
  }
  const moving = me.ord.k === 'move' && me.ord.path && me.ord.i < me.ord.path.length;
  if (best === m.target && moving) return;
  // arrived as close as the ground allows, again and again: give the place up for a while
  if (best === m.target && !moving) {
    if (state.tick - (m.triedAt || -1000) >= 40) { m.tries = (m.tries || 0) + 1; m.triedAt = state.tick; }
    if (m.tries > 3 && poi.kind !== 'pocket') { ban(m, best, state.tick); m.target = -1; m.tries = 0; return; }
  } else m.tries = 0;
  // a pocket I cannot walk into: cut my way in from the nearest point
  if (poi.kind === 'pocket' && best === m.target && !moving && d2(me.x, me.z, poi.x, poi.z) < 400) {
    const b = breachToward(ctx, me, poi.x, poi.z);
    if (b && b.chop != null && route('chop', { cell: b.chop }, b.chop, true, false)) return;
    if (b && b.attack && canSee(ctx, HUNTERS, b.attack)) { cmd('attack', { target: b.attack.id }); return; }
    ban(m, best, state.tick);   // give up on it for now
    return;
  }
  if (route('move', { x: poi.x, z: poi.z }, cellOf(map, poi.x, poi.z), false, true)) { m.target = best; m.goal = 'poi'; }
  else if (!m.retry) ban(m, best, state.tick);
}

function kit(ctx, p, K, rng, me, cmd, route, cast, ev, L, turn) {
  const { state, data, map } = ctx;
  const m = p.ai, HK = K.hunt, P = poisOf(map);
  // Hawk: the best place I am not going to myself, far enough to be worth a look
  if (state.tick >= (p.cd.E || 0)) {
    let bi = -1, bs = 0.5;
    for (let i = 0; i < P.length; i++) {
      const dd = dist(me.x, me.z, P[i].x, P[i].z);
      if (i === m.target || dd < 20 || dd > data.hvf.hunter.skills.E.range || !known(state, map, P[i])) continue;
      const s = HK.hawk === 'random' ? next(rng) : m.sus[i] / (dd + 30) * 30;
      if (s > bs) { bs = s; bi = i; }
    }
    if (bi >= 0 && cast('E', P[bi].x, P[bi].z)) return true;
  }
  // Horn: the trail is hot right here but nothing shows
  if (p.level >= data.hvf.hunter.skills.R.level && !ev.hot.some(h => h.kind === 'animal')) {
    let heat = 0;
    for (let i = 0; i < P.length; i++) if (d2(me.x, me.z, P[i].x, P[i].z) < 1600) heat += m.sus[i];
    if (heat > HK.hornHeat && cast('R')) return true;
  }
  // watchstones on the busiest junctions near what I suspect
  const myWards = state.ents.filter(w => w.kind === 'ward' && w.owner === p.id && live(w));
  const stoneSlot = p.inv.findIndex(it => it && it.id === 'watchstone');
  if (stoneSlot >= 0 && myWards.length < HK.wards) {
    const deg = new Array(map.graph.nodes.length).fill(0);
    for (const e of map.graph.edges) { deg[e.a]++; deg[e.b]++; }
    let bn = null, bs = -Infinity;
    for (const n of map.graph.nodes) {
      if (n.kind === 'kennel' || n.kind === 'commons') continue;
      if (state.ents.some(w => w.kind === 'ward' && w.team === HUNTERS && live(w) && d2(w.x, w.z, n.x, n.z) < 400)) continue;
      const i = P.findIndex(q => q.x === n.x && q.z === n.z);
      const s = deg[n.id] * (HK.wardChokes ? 2 : 1) + (i >= 0 ? m.sus[i] : 0) - dist(me.x, me.z, n.x, n.z) / 25;
      if (s > bs) { bs = s; bn = n; }
    }
    if (bn) {
      const R = data.hvf.hunter.watchstone.range;
      if (d2(me.x, me.z, bn.x, bn.z) <= (R - 0.5) * (R - 0.5)) {
        const c = cellOf(map, bn.x, bn.z);
        if (canStand(liveGrid(ctx), 'farmer', c)) { cmd('ward', { x: bn.x, z: bn.z }); return true; }
      } else if (dist(me.x, me.z, bn.x, bn.z) < 30 && !(me.ord.k === 'move' && m.goal === 'ward')) {
        if (route('move', { x: bn.x, z: bn.z }, cellOf(map, bn.x, bn.z), false, true)) { m.goal = 'ward'; return true; }
      }
    }
  }
  // lodges, spread out (more of them once the Turn goes against me)
  const want = HK.lodges + (HK.turnAware && turn > 0 ? 1 : 0);
  const all = state.ents.filter(b => b.kind === 'building' && b.lodge && b.owner === p.id && live(b));
  if (all.length < want && p.gold >= data.hvf.hunter.lodge.cost + HK.lodgeReserve) {
    const far = all.every(b => d2(b.x, b.z, me.x, me.z) > 55 * 55);
    if (far && lodgeRefusal(ctx, p, me.x, me.z) === null) { cmd('lodge', { x: me.x, z: me.z }); return true; }
  }
  // walk to a lodge to shop when the list says it is worth it and the trail is cold
  const want2 = nextItem(ctx, p, K);
  if (want2 && HK.shopTrips && p.gold >= data.hvf['hunter-items'].items[want2].price && !ev.hot.length && !nearLodge(ctx, p) && L.length) {
    const home = L.reduce((b, l) => (d2(l.x, l.z, me.x, me.z) < d2(b.x, b.z, me.x, me.z) ? l : b));
    if (dist(me.x, me.z, home.x, home.z) < 60 && !(me.ord.k === 'move' && m.goal === 'shop')) {
      if (route('move', { x: home.x, z: home.z }, cellOf(map, home.x, home.z), false, true)) { m.goal = 'shop'; return true; }
    }
    if (me.ord.k === 'move' && m.goal === 'shop') return true;
  }
  return false;
}
