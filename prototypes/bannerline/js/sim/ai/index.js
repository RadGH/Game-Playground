// Bannerline AI (stream E, PLAN §8): one AI, three settings that differ in DECISIONS, not stats.
//
// Runs inside the sim on every peer (lockstep), reads only sim state, draws only from its own rng stream
// (player.ai.rng, one per slot, so one AI's draws never shift another's) and acts only through the same
// commands a human sends (send, buy, sell, use, upgradeUnit, power, learn, talent, cast, move, amove,
// attack, toll). Every command is checked against the sim's own refusal functions first, so an AI never
// sends an illegal one (tests/ai.test.js counts rejects).
//
// One think every `reaction` ticks:
//   1. read the situation   read.js     defence of the field my sends go into, threat in my field, my army
//   2. skills + talent      skills.js   learn order, the level-6 pick
//   3. sends                sends.js    how much, which units (counter.js), when to push; counter notices
//   3a. Sanctum             town.js     before sends: a power that saves banners outranks units
//   3b. Drill Yard          town.js     (Commander) before sends when a level beats its price in units
//   4. shopping             shop.js     walk to the Outfitter when it is safe and worth it; what to buy
//   5. Drill Yard           town.js     (Veteran) out of the item fund
//   6. hero                 hero.js     post, target, retreat, kiting, helping a teammate; draughts; skills
//   7. Toll of Iron
//
// Knobs: data/ai.json `difficulties` (Recruit / Veteran / Commander). Memory lives in player.ai (plain
// data, part of the state, so snapshots and hashes include it).

import { liveEnt } from '../state.js';
import { heroStats } from '../heroes.js';
import { atShop } from '../items.js';
import { defenceOf, threatIn, myArmy, myLane } from './read.js';
import { planSends, noticeCounter, horizon } from './sends.js';
import { learnCommands, castCommands } from './skills.js';
import { shopAtOutfitter, nextBuildItem, nextValueItem, healSlot, drinkCommand, slotOf } from './shop.js';
import { drillYard, sanctum } from './town.js';
import { heroCommands, postFor } from './hero.js';
import { dist2 } from '../mathx.js';

export function knobs(data, p) {
  const D = data.ai.difficulties;
  return D[p.ai.difficulty] || D.recruit;
}

function memory(p) {
  const m = p.ai;
  if (m.v === 2) return m;
  Object.assign(m, { v: 2, fund: m.fund || 0, pushUntil: 0, saveUntil: 0, saveFor: null, recent: {}, recentRoles: {}, toastAt: 0,
    shopTrip: false, retreat: false, helping: -1, foeBanners: -1, leakRate: 0, deathRate: 0.4 });
  return m;
}

/** The situation for one think (see read.js). */
function situation(ctx, p, K) {
  const { state, data, map } = ctx;
  const hero = liveEnt(state, p.heroEnt);
  const f = map.fields[state.teams[p.team].field];
  const lane = myLane(ctx, p);
  const ef = map.fields[state.teams[1 - p.team].field];
  const sendLane = state.teams[p.team].players.indexOf(p.id) % ef.gates.length;
  const S = {
    hero, heroAlive: !!hero, myLane: lane, laneX: f.gates[lane].x, sendLane,
    enemyDef: defenceOf(ctx, ef.id, p.team), threat: threatIn(ctx, p.team), army: myArmy(ctx, p),
    healSlot: healSlot(p), myDps: heroStats(data, p).dps,
    wantItem: K.shop.style === 'build' ? nextBuildItem(ctx, p) : K.shop.style === 'value' ? nextValueItem(ctx, p) : null,
    horizon: horizon(ctx, p),
  };
  let lead = null;
  for (const e of state.ents) if (e.alive && !e._gone && e.field === f.id && e.team !== p.team && e.kind !== 'hero' && (!lead || e.z > lead.z)) lead = e;
  S.leadFoe = lead;
  S.post = postFor(ctx, p, K, S);
  S.farFromPost = hero ? dist2(hero.x, hero.z, S.post.x, S.post.z) > 400 : false;
  return S;
}

/** Bookkeeping once a Pay: how fast my units tear banners (Drill Yard reads it). */
function track(ctx, p) {
  const { state } = ctx;
  const m = p.ai;
  if (m.foeBanners >= 0 && state.tick - (m.trackAt || 0) < 200) return;
  m.trackAt = state.tick;
  const foe = state.teams[1 - p.team];
  const secs = Math.max(1, (state.tick - (m.trackPrev || 0)) / 20);
  m.sendRate = (m.sendRate || 0) * 0.7 + Math.max(0, p.stats.sendGold - (m.sendGold0 || 0)) / secs * 0.3;   // gold per second
  m.sendGold0 = p.stats.sendGold; m.trackPrev = state.tick;
  if (m.foeBanners >= 0) {
    const torn = Math.max(0, m.foeBanners - foe.banners);
    m.leakRate = m.leakRate * 0.7 + torn * 0.3;
    m.deathRate = m.leakRate < 0.3 ? 0.6 : 0.2;
  }
  m.foeBanners = foe.banners;
  const mine = state.teams[p.team].banners;
  if (m.myBanners >= 0 && m.myBanners !== undefined) m.lossRate = (m.lossRate || 0) * 0.7 + Math.max(0, m.myBanners - mine) * 0.3;
  m.myBanners = mine;
  for (const r of Object.keys(m.recentRoles)) m.recentRoles[r] *= 0.75;
}

export function aiCommands(ctx, p) {
  const { state, data } = ctx;
  if (state.result || state.tick < p.ai.nextAt) return [];
  const K = knobs(data, p);
  p.ai.nextAt = state.tick + K.reaction;
  const m = memory(p);
  const rng = p.ai.rng;
  const out = [];
  const cmd = (type, args = {}) => out.push(Object.assign({ p: p.id, type }, args));
  track(ctx, p);
  const S = situation(ctx, p, K);
  const hero = S.hero;

  learnCommands(ctx, p, K, rng, cmd);

  // ── Sanctum first: a power that saves banners is worth more than the sends its gold would buy ──
  const pw = sanctum(ctx, p, K, S, m.fund, cmd);
  m.fund = Math.max(0, m.fund - pw);
  const pvPow = pw ? { ...p, gold: p.gold - pw } : p;

  // ── Drill Yard first for the Commander: a level that is worth more than the units its price would buy
  //    comes out of the send gold before any send ──
  const planned = K.town.upgrades === 'planned';
  let upFirst = 0;
  if (planned) {
    upFirst = drillYard(ctx, pvPow, K, S, Math.max(0, pvPow.gold - m.fund), cmd);
    if (upFirst) m.pool = Math.max(0, (m.pool || 0) - upFirst);
  }

  // ── sends ──
  const res = planSends(ctx, upFirst || pw ? { ...p, gold: p.gold - upFirst - pw } : p, K, rng, S);
  for (const uid of res.buys) {
    cmd('send', { unit: uid });
    const r = data.derived.units[uid].role;
    m.recentRoles[r] = (m.recentRoles[r] || 0) + data.derived.units[uid].cost;
  }
  noticeCounter(ctx, p, K, res);
  let gold = p.gold - res.spent - upFirst - pw;
  m.fund = Math.max(0, Math.min(m.fund, gold));

  // ── the Outfitter ──
  if (hero && K.shop.trips && !m.retreat) {
    // between waves only: nothing near the Keep and at most a couple of bodies anywhere in the field;
    // a trip is called off the moment a wave comes in (never leave the gate mid-wave)
    const calm = S.threat.near === 0 && S.threat.danger < (K.hero.tier >= 2 ? 1.5 : 2) && S.threat.n <= 2;
    const price = S.wantItem ? S.wantItem.price : Infinity;
    const needHeal = S.healSlot < 0 && m.fund >= 80 && hero.hp < hero.hpMax * 0.5;
    if (!m.shopTrip && calm && (m.fund >= price || needHeal) && !atShop(ctx, p)) m.shopTrip = true;
    if (m.shopTrip && (S.threat.near >= 1 || S.threat.n >= 4)) m.shopTrip = false;   // the gate needs me more
  }
  if (hero && atShop(ctx, p)) {
    const pv = { ...p, gold };
    const r = shopAtOutfitter(ctx, pv, K, rng, m.fund);
    for (const c of r.cmds) cmd(c.type, c);
    gold -= r.spent; m.fund = Math.max(0, m.fund - r.spent);
    if (m.shopTrip && !r.cmds.length) m.shopTrip = false;
  }

  // ── Drill Yard and Sanctum ──
  const pv = { ...p, gold };
  if (!planned) {
    const up = drillYard(ctx, pv, K, S, m.fund - (S.wantItem && !m.shopTrip ? Math.min(m.fund, S.wantItem.price * 0.5) : 0), cmd);
    gold -= up; m.fund = Math.max(0, m.fund - up);
  }

  // ── Toll of Iron ──
  const team = state.teams[p.team];
  // One bell per wave: the charges are the team's, so a seat does not ring while a teammate's toll
  // (or anyone's) still has the wave stunned — it counts only bodies near the Keep that are NOT stunned,
  // and leaves the bell alone for the stun's length after any teammate rang it.
  if (K.hero.tier >= 1 && team.toll.charges > 0) {
    const need = K.hero.tier >= 2 ? 6 : 8;
    const stunTicks = Math.round(data['items-bl'].toll.stun * 20);
    const mateRang = team.players.some(pid => { const q = state.players[pid]; return q.ai && q.ai.tollAt != null && state.tick - q.ai.tollAt < stunTicks; });
    let free = 0;
    if (!mateRang && S.threat.near >= need) {
      const f = ctx.map.fields[team.field];
      for (const e of state.ents) if (e.alive && !e._gone && e.field === f.id && e.team !== p.team && (e.kind === 'unit' || e.kind === 'tide') && e.z > f.leakZ - 30 && !e.statuses.some(st => st.id === 'stun')) free++;
    }
    if (!mateRang && free >= need && (K.hero.tier < 2 || S.threat.danger >= 4)) { cmd('toll'); m.tollAt = state.tick; }
  }

  // ── hero ──
  if (hero) {
    const drink = m.usedAt === state.tick ? null : drinkCommand(ctx, p, K, hero);
    if (drink) cmd(drink.type, drink);
    const h = heroCommands(ctx, p, K, rng, hero, { ...S, wantShop: m.shopTrip }, cmd);
    if (!h.shopping) castCommands(ctx, p, K, rng, hero, h.foes, h.target, S, cmd);
  }
  return out;
}
