// Spirehold — the whole game's tick and every action the player can take.
// Pure: dt (seconds) and now (ms) are passed in. The UI calls these and draws the result.

import { TOWERS, LANDMARKS, RESEARCH, LEGACY, SCHOOLS, NAME_PARTS, REALMS, RELICS, CITY_TITLES, ringSlots } from './data.js';
import { rng, hash } from './rand.js';
import {
  touch, bon, cityXpNeed, popCap, taxRate, landmarkCost, wallCost, wallMax, towerCost, towerCostN, towerUnlocked, branchDue, ringOf, slotsOf,
  mageSlots, mageHireCost, mageLvlCost, researchCost, researchOpen, legacyCost, crownsFor, TUNE,
} from './rules.js';
import { createBattle, stepBattle } from './battle.js';
import { stepGuild, relicLevelCost } from './guild.js';
import { foundRealm } from './state.js';

export const STEP = 0.05;   // the battle runs in fixed 50 ms steps

export function tick(G, B, dt, now) {
  G.playTime += dt; G.realmTime = (G.realmTime || 0) + dt;
  const before = { gold: G.gold, lore: G.lore };
  // the city looks after itself: people move in toward the cap and pay taxes
  const cap = popCap(G);
  G.city.pop += (cap - G.city.pop) * Math.min(1, 0.012 * dt) + (G.city.pop < cap ? 0.02 * dt : 0);
  G.city.pop = Math.min(cap, G.city.pop);
  const tax = taxRate(G) * dt; G.gold += tax; G.totals.gold += tax;
  stepBattle(G, B, dt, now);
  addCityXp(G, B.cityXp + tax * 0.2); B.cityXp = 0;
  stepGuild(G, now);
  // rolling income, used for time away
  const k = Math.min(1, dt / 120);
  G.rates.gold += ((G.gold - before.gold) / dt - G.rates.gold) * k;
  G.rates.lore += ((G.lore - before.lore) / dt - G.rates.lore) * k;
  G.lastSeen = now;
}
/** A wider wall has more spots: every tower keeps its compass bearing, so the new spots fall in the gaps between them. */
export function keepTowerAngles(G, oldN, newN) {
  if (newN <= oldN) return;
  for (const t of G.towers) t.slot = Math.round(t.slot * newN / oldN) % newN;
}
/** The empty spot furthest from any tower (null when the wall is full). */
export function bestEmptySlot(G) {
  const n = slotsOf(G); let best = null, bd = -1;
  for (let s = 0; s < n; s++) {
    if (G.towers.some(t => t.slot === s)) continue;
    const d = G.towers.length ? Math.min(...G.towers.map(t => { const k = Math.abs(t.slot - s); return Math.min(k, n - k); })) : n;
    if (d > bd) { bd = d; best = s; }
  }
  return best;
}
export function addCityXp(G, xp) {
  G.city.xp += xp;
  while (G.city.xp >= cityXpNeed(G.city.level)) {
    G.city.xp -= cityXpNeed(G.city.level); const ringBefore = ringOf(G.city.level); G.city.level++;
    const ring = ringOf(G.city.level);
    if (ring > ringBefore) keepTowerAngles(G, ringSlots(ringBefore), slotsOf(G));
    const news = [];
    if (ring > ringBefore) news.push(`The walls are rebuilt wider: ${slotsOf(G)} tower spots.`);
    for (const id in LANDMARKS) if (LANDMARKS[id].city === G.city.level) news.push(`New landmark: ${LANDMARKS[id].name}.`);
    for (const id in TOWERS) if (TOWERS[id].unlock?.city === G.city.level) news.push(`New tower: ${TOWERS[id].name}.`);
    G.news.push({ k: 'city', level: G.city.level, title: cityTitle(G), news, ring: ring > ringBefore });
    touch(G);
  }
}
export const cityTitle = G => CITY_TITLES[Math.min(CITY_TITLES.length - 1, ringOf(G.city.level))];

// ---------------------------------------------------------------- actions (return null on success, or a reason)
export function buildTower(G, slot, type) {
  if (slot >= slotsOf(G) || G.towers.some(t => t.slot === slot)) return 'That spot is taken.';
  if (!towerUnlocked(G, type)) return 'Not unlocked yet.';
  const c = towerCost(type, 1, G); if (G.gold < c) return 'Not enough gold.';
  G.gold -= c; G.towers.push({ slot, type, lvl: 1, br: [null, null], kills: 0, dmg: 0 }); return null;
}
/** Buy up to `count` levels (Infinity = as many as you can afford). Stops at a branch choice. */
export function upgradeTower(G, slot, count = 1) {
  const t = G.towers.find(x => x.slot === slot); if (!t) return 'No tower there.';
  let bought = 0;
  while (bought < count) {
    if (branchDue(t) >= 0) break;
    const c = towerCost(t.type, t.lvl + 1, G); if (G.gold < c) break;
    G.gold -= c; t.lvl++; bought++;
  }
  return bought ? null : (branchDue(t) >= 0 ? 'Choose a path first.' : 'Not enough gold.');
}
export function maxAffordable(G, t) {
  let n = 0, g = G.gold, lvl = t.lvl; const stop = t.br[0] == null ? 10 : t.br[1] == null ? 30 : Infinity;
  while (lvl < stop) { const c = towerCost(t.type, lvl + 1, G); if (g < c) break; g -= c; lvl++; n++; if (n > 5000) break; }
  return n;
}
export function chooseBranch(G, slot, pick) {
  const t = G.towers.find(x => x.slot === slot); if (!t) return 'No tower there.';
  const due = branchDue(t); if (due < 0) return 'Nothing to choose yet.';
  t.br[due] = pick ? 1 : 0; return null;
}
export function sellTower(G, slot) {
  const i = G.towers.findIndex(x => x.slot === slot); if (i < 0) return 'No tower there.';
  const t = G.towers[i]; const back = Math.round(towerCostN(t.type, 0, t.lvl, G) * 0.5);
  G.gold += back; G.towers.splice(i, 1); return null;
}
export function upgradeWall(G, count = 1) {
  let n = 0; while (n < count) { const c = wallCost(G.wall.lvl + 1); if (G.gold < c) break; G.gold -= c; const f = G.wall.hp / wallMax(G); G.wall.lvl++; G.wall.hp = f * wallMax(G); n++; }
  return n ? null : 'Not enough gold.';
}
export function upgradeLandmark(G, id, count = 1) {
  const L = LANDMARKS[id]; if (!L || G.city.level < L.city) return 'Not yet.';
  let n = 0; while (n < count) { const lv = G.city.landmarks[id] || 0; const c = landmarkCost(id, lv); if (G.gold < c) break; G.gold -= c; G.city.landmarks[id] = lv + 1; n++; }
  if (n) touch(G); return n ? null : 'Not enough gold.';
}
export function hireMage(G, school, seed) {
  if (G.mages.length >= mageSlots(G)) return 'No room in the court. Upgrade research: Court Patronage.';
  const S = SCHOOLS[school]; if (!S) return 'Unknown school.'; if (S.unlock && !(G.research[S.unlock] > 0)) return 'Not unlocked yet.';
  const c = mageHireCost(G.mages.length); if (G.gold < c) return 'Not enough gold.';
  const r = rng(hash('mage', G.seed, seed));
  G.gold -= c; G.mages.push({ id: ++G.mageSeq, name: `${r.pick(NAME_PARTS.first)} ${r.pick(NAME_PARTS.last)}`, school, lvl: 1, kills: 0 }); return null;
}
export function levelMage(G, id, count = 1) {
  const m = G.mages.find(x => x.id === id); if (!m) return 'Gone.';
  let n = 0; while (n < count) { const c = mageLvlCost(m.lvl + 1); if (G.gold < c) break; G.gold -= c; m.lvl++; n++; }
  return n ? null : 'Not enough gold.';
}
export function dismissMage(G, id) { const i = G.mages.findIndex(m => m.id === id); if (i >= 0) G.mages.splice(i, 1); }
export function buyResearch(G, id, count = 1) {
  const r = RESEARCH.find(x => x.id === id); if (!r) return 'Unknown.';
  if (!researchOpen(G, r)) return 'Research what comes before it first.';
  let n = 0; while (n < count) { const rank = G.research[id] || 0; if (rank >= r.max) break; const c = researchCost(r, rank); if (G.lore < c) break; G.lore -= c; G.research[id] = rank + 1; n++; }
  if (n) touch(G); return n ? null : ((G.research[id] || 0) >= r.max ? 'Fully researched.' : 'Not enough lore.');
}
export function buyLegacy(G, id) {
  const l = LEGACY.find(x => x.id === id); if (!l) return 'Unknown.';
  const rank = G.legacy[id] || 0; if (rank >= l.max) return 'Maxed.';
  const c = legacyCost(l, rank); if (G.crowns < c) return 'Not enough crowns.';
  G.crowns -= c; G.legacy[id] = rank + 1; touch(G); return null;
}
export function levelRelic(G, id) {
  if (!G.relics[id]) return 'You do not have that relic.';
  const c = relicLevelCost(G.relics[id]); if (G.shards < c) return 'Not enough starshards.';
  G.shards -= c; G.relics[id]++; touch(G); return null;
}
export const realmOpen = (G, id) => (G.founded || 0) >= REALMS[id].need;
export function newRealm(G, realm, seed, now) {
  const c = crownsFor(G); if (c <= 0) return { err: 'Reach wave 100 first.' };
  if (!realmOpen(G, realm)) return { err: 'That realm is not open to you yet.' };
  return { G: foundRealm(G, { realm, crowns: c, seed, now }) };
}

// ---------------------------------------------------------------- time away
/**
 * The game was closed (or the tab asleep) for a while. Taxes and the battle's usual income come in at a reduced rate,
 * people keep moving in, and quests finish on their own clocks. Waves do not advance — the frontier waits for you.
 */
export function catchUp(G, now) {
  const secs = Math.min((now - (G.lastSeen ?? now)) / 1000, TUNE.offlineCapHours * 3600);
  if (secs < 20) return null;
  const eff = Math.min(1, TUNE.offlineEff + bon(G, 'offline'));
  const gold = Math.max(0, G.rates.gold) * secs * eff;
  const lore = Math.max(0, G.rates.lore) * secs * eff;
  const pop0 = G.city.pop; G.city.pop = popCap(G) - (popCap(G) - G.city.pop) * Math.exp(-0.012 * secs);
  G.gold += gold; G.lore += lore; G.totals.gold += gold; G.totals.lore += lore;
  const lvl0 = G.city.level; addCityXp(G, gold * 0.25);
  const quests = stepGuild(G, now);
  G.lastSeen = now; G.playTime += 0; // time away is not play time
  return { secs, gold, lore, eff, pop: G.city.pop - pop0, levels: G.city.level - lvl0, quests };
}
export { createBattle, crownsFor };

// ---------------------------------------------------------------- the Royal Steward (optional: spends gold for an idle player)
const STEWARD_ORDER = ['archer', 'ballista', 'bombard', 'frost', 'brazier', 'storm', 'arcane', 'shrine', 'observatory'];
/** Build in empty spots, pick tower paths, then buy the cheapest tower or wall level until a tenth of the gold is left. */
export function stewardSpend(G, maxBuys = 200) {
  const keep = G.gold * 0.1; let bought = 0;
  const n = slotsOf(G);
  for (let i = 0; i < n; i++) {
    const s = bestEmptySlot(G); if (s === null) break;
    const counts = {}; for (const t of G.towers) counts[t.type] = (counts[t.type] || 0) + 1;
    const type = STEWARD_ORDER.filter(t => towerUnlocked(G, t)).sort((a, b) => (counts[a] || 0) - (counts[b] || 0))[0];
    if (type && G.gold - towerCost(type, 1, G) >= keep) { buildTower(G, s, type); bought++; } else break;
  }
  if (G.stewardPaths !== false) for (const t of G.towers) { const d = branchDue(t); if (d >= 0) chooseBranch(G, t.slot, (t.slot + d) % 2); }
  while (bought < maxBuys) {
    let best = null, bc = Infinity;
    for (const t of G.towers) { if (branchDue(t) >= 0) continue; const c = towerCost(t.type, t.lvl + 1, G); if (c < bc) { bc = c; best = () => upgradeTower(G, t.slot, 1); } }
    const wc = wallCost(G.wall.lvl + 1) * 1.6; if (wc < bc) { bc = wallCost(G.wall.lvl + 1); best = () => upgradeWall(G, 1); }
    if (!best || G.gold - bc < keep) break; best(); bought++;
  }
  return bought;
}
