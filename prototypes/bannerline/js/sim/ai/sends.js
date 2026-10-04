// Stream E — what to send and when. Gold is the only limit on sends (owner), so the decisions are:
// how much of the purse goes to sends now (income) versus the hero and the town (items, Drill Yard,
// Sanctum), which units (counter-sending), and when to dump everything into one wave (timing).
//
//   style 'spam'     (Recruit)   once a Pay, a random share of the purse, mostly cheap units, picked with
//                                a lot of noise; never reads the defence
//   style 'balanced' (Veteran)   once a Pay, a fixed share, half income / half pressure; on a coin flip it
//                                reads the rival hero's damage type and armour class off the type table
//   style 'adaptive' (Commander) every think: reads the whole defence (every hero's damage mix, armour,
//                                magic resist, kit, turrets, pets) and
//                                  - invests in income early and stops when income can no longer pay back
//                                  - finds the cheapest wave that should leak and saves up for it
//                                  - dumps the purse when the defence is down (hero dead, shopping, low,
//                                    off in another lane), when a teammate pushes, near the Rising Tide,
//                                    or when behind
//                                  - in team games, mixes its armour with its teammates' so one counter
//                                    item cannot answer the whole team

import { next, range } from '../rng.js';
import { sendRefusal, payTicks } from '../economy.js';
import { unitCounter, counterEvent } from './counter.js';
import { live } from './read.js';

/** Raw pressure per gold of a unit: effective health x banners it tears, per gold (econ-sim formula). */
export function pressureOf(data, u) {
  let ehp = 1;
  for (const t of u.traits) ehp *= (data.units.traits[t] && data.units.traits[t].ehp) || 1;
  return u.hp * u.bodies * ehp * (1 + u.leak / 4) / u.cost;
}

/** Effective health per gold (traits that make a body harder to kill count). */
export function hpPerGold(data, u) {
  let ehp = 1;
  for (const t of u.traits) ehp *= (data.units.traits[t] && data.units.traits[t].ehp) || 1;
  return u.hp * u.bodies * ehp / u.cost;
}

function rosterOf(data, p) { return data.races.races[p.race].units.map(uid => data.derived.units[uid]); }

/** Seconds of match the AI expects are left: banners lost so far and the Rising Tide clock. */
export function horizon(ctx, p) {
  const { state, data } = ctx;
  const T = state.tick / 20;
  const rise = data.econ.clock.risingTide;
  const me = state.teams[p.team], foe = state.teams[1 - p.team];
  const frac = Math.min(me.banners / me.bannersMax, foe.banners / foe.bannersMax);
  const byBanners = 90 + 510 * frac;
  const byClock = Math.max(90, rise + 240 - T);
  return Math.max(60, Math.min(byBanners, byClock));
}

/**
 * Leak estimate for a wave of `u` against defence D: how many purchases until the wave's health
 * outlasts what the defenders can kill while it walks the field. `head` = health of my units already
 * in the field (they soak the defence first).
 */
export function wavesToLeak(ctx, u, D, c, head = 0) {
  const { map, data } = ctx;
  const field = map.fields[D.fieldId];
  const walk = (field.leakZ - field.z0) / Math.max(0.5, u.speed);   // seconds
  let ehp = 1;
  for (const t of u.traits) ehp *= (data.units.traits[t] && data.units.traits[t].ehp) || 1;
  const per = u.hp * u.bodies * ehp * c.mult;
  const capFor = bodies => {
    let cap = 0;
    for (const h of D.heroes) {
      const time = h.alive ? walk * 0.7 : Math.max(0, walk - h.respawnIn / 20) * 0.6;
      const aoeK = 1 + h.aoe * (Math.min(bodies, 6) - 1) / 5;
      cap += h.dps * aoeK * time;
    }
    cap += D.turretDps * Math.min(walk, 20) + D.petDps * walk * 0.5;
    // the Keep's splash on the last stretch (it hits a few bodies of a crowd at once)
    if (D.keep) cap += D.keep.shot / D.keep.every * (D.keep.range / Math.max(0.5, u.speed)) * Math.min(bodies, 3);
    return cap;
  };
  let n = Math.max(1, Math.ceil((capFor(u.bodies) - head) / per));
  n = Math.max(1, Math.ceil((capFor(n * u.bodies) - head) / per) + 1);
  return n;
}

/** The send decision for one think. Returns { buys: [uid], spent, push, counter: {uid, reason} | null }. */
export function planSends(ctx, p, K, rng, S) {
  const { state, data } = ctx;
  const style = K.sends.style;
  const payIdx = Math.floor(state.tick / payTicks(data));
  const fresh = p.ai.sendDone !== payIdx;
  if (style !== 'adaptive' && !fresh) return { buys: [], spent: 0 };
  p.ai.sendDone = payIdx;
  if (style === 'spam') return spam(ctx, p, K, rng, fresh);
  if (style === 'balanced') return balanced(ctx, p, K, rng, S, fresh);
  return adaptive(ctx, p, K, rng, S, fresh);
}

// split the newly paid gold between sends and the item fund
function splitPurse(p, greed) {
  const fresh = Math.max(0, p.gold - (p.ai.fund || 0));
  p.ai.fund = Math.min(p.gold, (p.ai.fund || 0) + fresh * (1 - greed));
  return Math.max(0, p.gold - p.ai.fund);
}

function buyLoop(ctx, p, budget, pickFn, max = 80) {
  const { state, data } = ctx;
  const buys = [];
  let gold = p.gold, spent = 0;
  for (let guard = 0; guard < max; guard++) {
    const u = pickFn(Math.min(budget, gold));
    if (!u || u.cost > budget || u.cost > gold) break;
    if (sendRefusal(state, data, { ...p, gold }, u.id)) break;
    buys.push(u.id); gold -= u.cost; budget -= u.cost; spent += u.cost;
  }
  return { buys, spent };
}

// Recruit: a random share, cheap units, lots of noise
function spam(ctx, p, K, rng, fresh) {
  const { data } = ctx;
  const budget = splitPurse(p, range(rng, K.sends.greed[0], K.sends.greed[1]));
  const roster = rosterOf(data, p);
  const res = buyLoop(ctx, p, budget, b => {
    const avail = roster.filter(u => u.cost <= b);
    if (!avail.length) return null;
    // weight cheap tiers up: a new player mashes the first row
    let tot = 0;
    const w = avail.map(u => { const k = 1 / u.tier + K.sends.noise * next(rng); tot += k; return k; });
    let r = next(rng) * tot;
    for (let i = 0; i < avail.length; i++) { r -= w[i]; if (r <= 0) return avail[i]; }
    return avail[avail.length - 1];
  }, K.sends.maxPerPay || 80);
  return { ...res, push: false, cmap: null };
}

// Veteran: fixed share, half income half pressure, a coin-flip read of the rival hero
function balanced(ctx, p, K, rng, S, fresh) {
  const { data } = ctx;
  const budget = splitPurse(p, range(rng, K.sends.greed[0], K.sends.greed[1]));
  const roster = rosterOf(data, p);
  const pressRef = Math.max(...roster.map(u => pressureOf(data, u)));
  const readIt = next(rng) < K.sends.counter;
  const c = {};
  for (const u of roster) c[u.id] = readIt ? unitCounter(data, u, S.enemyDef, { only: 'table', lane: S.sendLane }) : { mult: 1, reasons: [] };
  const score = u => 0.5 * (u.income / u.cost) / 0.05 + 0.5 * pressureOf(data, u) / pressRef * c[u.id].mult + K.sends.noise * next(rng);
  const res = buyLoop(ctx, p, budget, b => {
    let best = null, bs = -Infinity;
    for (const u of roster) if (u.cost <= b) { const s = score(u); if (s > bs || (s === bs && u.id < best.id)) { bs = s; best = u; } }
    return best;
  });
  return { ...res, push: false, cmap: readIt ? c : null };
}

/** Is the defence of my lane down right now? Returns a short reason or null. */
export function pushWindow(ctx, p, S) {
  const { state, data } = ctx;
  const D = S.enemyDef;
  const T = state.tick / 20;
  if (T >= data.econ.clock.risingTide - 45) return 'tide';
  // a teammate is pushing: go together so the defenders must split
  for (const pid of state.teams[p.team].players) {
    const q = state.players[pid];
    if (q.id !== p.id && q.ai && q.ai.pushUntil > state.tick) return 'team';
  }
  const lane = S.sendLane;
  const guards = D.heroes.filter(h => h.alive && (h.lane === lane || h.lane < 0 || D.heroes.length === 1));
  if (D.heroes.every(h => !h.alive && h.respawnIn >= 120)) return 'dead';
  if (!guards.length && D.heroes.some(h => !h.alive && h.respawnIn >= 120)) return 'dead';
  if (D.heroes.length > 1 && !guards.length) return 'open';   // nobody in my lane
  if (guards.length && guards.every(h => h.atShop)) return 'shop';
  if (guards.length && guards.every(h => h.hpPct < 0.35)) return 'low';
  return null;
}

// Commander. Each think the send budget is cut in two:
//   income share   spent at once on the best income per gold (counters weighted in) — income only pays
//                  if it comes early, so this share shrinks with the clock and the banner count
//   pressure pool  saved (p.ai.pool) until it buys the cheapest wave that should leak against the
//                  defence as it stands, then sent in one go; any push window empties it at once.
//                  Its share starts at sends.pressure[0] and grows by sends.pressure[1] a minute (and
//                  when banners run low on either side)
function adaptive(ctx, p, K, rng, S, fresh) {
  const { state, data } = ctx;
  const T = state.tick / 20;
  const me = state.teams[p.team], foe = state.teams[1 - p.team];
  const R = horizon(ctx, p);
  const roster = rosterOf(data, p);
  const pressRef = Math.max(...roster.map(u => pressureOf(data, u)));
  const hpRef = Math.max(...roster.map(u => hpPerGold(data, u)));
  const c = {};
  for (const u of roster) c[u.id] = unitCounter(data, u, S.enemyDef, { lane: S.sendLane });

  // team play: mix armour with what my teammates have been sending
  const mates = {};
  let matesTot = 0;
  if (K.team >= 2) for (const pid of me.players) {
    const q = state.players[pid];
    if (q.id === p.id || !q.ai || !q.ai.recent) continue;
    for (const a of Object.keys(q.ai.recent)) { mates[a] = (mates[a] || 0) + q.ai.recent[a]; matesTot += q.ai.recent[a]; }
  }
  const mix = u => (matesTot > 0 ? 1 - 0.18 * (mates[u.armour] || 0) / matesTot : 1);

  // the push decision
  const why = pushWindow(ctx, p, S);
  const behind = me.banners < foe.banners * 0.75 && T > 300;
  const push = !!why || behind;
  if (why && why !== 'team') p.ai.pushUntil = state.tick + 100;

  // the purse: item fund (hero + town) vs sends. When an item is wanted, enough goes into the fund to
  // afford the next build step within `itemPays` Pays (never below greed[0]). Items are bought when they are cheap next to my income, or when my own lane is going badly (banners
  // lost lately); otherwise every coin goes to sends (measured: in a send race an item fund taken
  // early is income never made)
  let greed = K.sends.greed[1];
  const struggling = (p.ai.lossRate || 0) >= 0.5;
  if (S.wantItem && (struggling || S.wantItem.price <= p.income * (K.sends.itemAt || 1.5))) {
    const short = Math.max(0, S.wantItem.price - (p.ai.fund || 0));
    const share = short / Math.max(1, p.income * (K.sends.itemPays || 9));
    greed = Math.max(K.sends.greed[0], Math.min(K.sends.greed[1], 1 - share));
  }
  const pool0 = p.ai.pool || 0;
  if (fresh) {
    const free = Math.max(0, p.gold - (p.ai.fund || 0) - pool0);
    p.ai.fund = (p.ai.fund || 0) + free * (1 - greed);
  }
  if (push) {
    // keep the price of the next build step (the hero still has to hold its own lane); all-in only
    // when the clock or the banner count says so
    const allIn = why === 'tide' || behind;
    const keep = allIn ? (S.heroAlive ? 90 : 0) : Math.max(90, S.wantItem ? S.wantItem.price : 0);
    p.ai.fund = Math.min(p.ai.fund || 0, Math.max(keep, (p.ai.fund || 0) * (allIn ? 0 : 0.3)));
  }
  p.ai.fund = Math.min(p.ai.fund, p.gold);
  const sendGold = Math.max(0, p.gold - p.ai.fund - pool0);   // new send gold this think

  // pressure share of new send gold: a quarter at the start, most of it by minute 15
  const PS = K.sends.pressure || [0.25, 0.05];   // [share at 0:00, added per minute]
  const pShare = push ? 1 : Math.min(0.9, PS[0] + PS[1] * T / 60 + Math.max(0, 0.6 - Math.min(me.banners / me.bannersMax, foe.banners / foe.bannersMax)));
  let pool = pool0 + sendGold * pShare;
  const incomeGold = sendGold * (1 - pShare);

  const out = [];
  let spent = 0, gold = p.gold;
  const buy = (u, n, from) => {
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (u.cost > from.v || u.cost > gold || sendRefusal(state, data, { ...p, gold }, u.id)) break;
      out.push(u.id); gold -= u.cost; from.v -= u.cost; spent += u.cost; k++;
    }
    return k;
  };

  // income share: the best income per gold that is not a bad matchup
  const inc = { v: incomeGold };
  for (let guard = 0; guard < 120 && inc.v >= 12; guard++) {
    let best = null, bs = -Infinity;
    for (const u of roster) {
      if (u.cost > inc.v || u.income <= 0) continue;
      const payback = u.cost / u.income * data.econ.clock.pay;   // seconds
      if (payback > R * 0.8) continue;                            // will not pay back before the end
      // income that pays back, plus how long the body lives against this defence (a body the hero
      // sweeps away in one swing feeds it gold and XP; a tougher one keeps pressing)
      // (a body that melts on the Keep still pays its income, but sends nothing to the banners)
      const sc = ((u.income / u.cost) * (R - payback) / R * (K.sends.incomeCounter ? c[u.id].mult : 1) + (K.sends.survive ?? 0.03) * hpPerGold(data, u) / hpRef * c[u.id].mult) * mix(u) + K.sends.noise * next(rng) * 0.01;
      if (sc > bs || (sc === bs && u.id < best.id)) { bs = sc; best = u; }
    }
    if (!best || !buy(best, 1, inc)) break;
  }
  pool += inc.v;   // leftovers that no income unit fits go to the pool

  // pressure pool: the cheapest wave that should leak
  let plan = null;
  for (const u of roster) {
    if (c[u.id].mult < 0.95) continue;
    const n = wavesToLeak(ctx, u, S.enemyDef, c[u.id], S.army.ehp);
    const cost = n * u.cost;
    const sc = cost / (c[u.id].mult * mix(u));
    if (!plan || sc < plan.sc) plan = { u, n, cost, sc };
  }
  const pl = { v: pool };
  const dump = push || !plan || pool >= plan.cost || pool > Math.max(600, p.income * 6);
  if (dump) {
    if (plan && plan.cost <= pl.v) buy(plan.u, plan.n, pl);
    // the rest into the best pressure per gold against this defence
    for (let guard = 0; guard < 120 && pl.v >= 12; guard++) {
      let best = null, bs = -Infinity;
      for (const u of roster) if (u.cost <= pl.v) { const sc = pressureOf(data, u) / pressRef * c[u.id].mult * mix(u) + K.sends.noise * next(rng); if (sc > bs || (sc === bs && u.id < best.id)) { bs = sc; best = u; } }
      if (!best || !buy(best, 1, pl)) break;
    }
  }
  p.ai.pool = Math.max(0, Math.min(pl.v, gold - Math.min(p.ai.fund, gold)));
  p.ai.saving = dump ? null : plan ? plan.u.id : null;

  // remember my armour mix for teammates (decays)
  if (!p.ai.recent) p.ai.recent = {};
  if (fresh) for (const a of Object.keys(p.ai.recent)) p.ai.recent[a] *= 0.8;
  for (const uid of out) { const a = data.derived.units[uid].armour; p.ai.recent[a] = (p.ai.recent[a] || 0) + data.derived.units[uid].cost; }
  if (push && why !== 'team' && out.length) p.ai.pushUntil = Math.max(p.ai.pushUntil || 0, state.tick + 60);   // (a push that only follows a teammate's does not re-arm it)
  return { buys: out, spent, push, why, plan, cmap: c };
}

/**
 * Counter-send notices. Every send that counters the defence (mult >= 1.1 with a reason) adds its gold to
 * a per-unit tally; when the throttle allows (`sends.toast` s) and one unit has piled up a real wave
 * (>= 90 gold since the last notice), the biggest is announced and the tally clears.
 */
export function noticeCounter(ctx, p, K, res) {
  const { state, data } = ctx;
  if (!K.sends.toast || !res.cmap) return;
  // tally per unit: { gold, reason } — the reason is kept from when the unit was bought (the defence,
  // and so this think's counter map, may have changed since)
  const acc = p.ai.counterAcc || (p.ai.counterAcc = {});
  for (const uid of res.buys) {
    const k = res.cmap[uid];
    if (!k || k.mult < 1.1 || !k.reasons.length) continue;
    const a = acc[uid] || (acc[uid] = { gold: 0, text: k.reasons[0].text, key: k.reasons[0].key });
    a.gold += data.derived.units[uid].cost;
  }
  if (state.tick < (p.ai.toastAt || 0)) return;
  let best = null;
  for (const uid of Object.keys(acc)) if (acc[uid].gold >= 90 && (!best || acc[uid].gold > acc[best].gold || (acc[uid].gold === acc[best].gold && uid < best))) best = uid;
  if (!best) return;
  const n = Math.round(acc[best].gold / data.derived.units[best].cost);
  const why = acc[best];
  p.ai.toastAt = state.tick + K.sends.toast * 20;
  p.ai.counterAcc = {};
  counterEvent(ctx, p, p.rival, best, n, why);
}

export { live };
