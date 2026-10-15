#!/usr/bin/env node
// Thousandvale — WHAT A PROFESSION EARNS (round 8, W9; stream P-core). Gold per hour of gathering and of
// gather-then-refine, everything sold to a merchant, measured with the real rules, the real mini-games (played by a
// player whose timing is decent, not perfect) and the real node placement.
//
//   node tools/sim-professions.mjs            the table
//   node tools/sim-professions.mjs --json
// tools/sim-economy.mjs (stream E) imports `extraRows({ levels, questHour })` and prints these rows beside its own.
//
// THE RULE (owner): each gathering and each crafting route earns 70-100% of an hour of questing at that level.
// tests/P/economy.test.js pins it. What "an hour" is here:
//   * the gatherer has the skill a character of that level has if the trade is kept up (SKILL_AT), works every node of
//     the trade they can in the best zone for their level, on foot, nearest node next; a node takes the walk + the
//     mini-game + two seconds; a node comes back for them after gather.respawnMin, so a small zone caps the hour;
//   * the crafter gathers the same way, then refines everything at a station (batches of craft.batchMax) and sells it;
//   * SKINNING is not an hour of its own: it rides on hunting. Its row is what the hides and meat ADD to an hour of
//     killing beasts (`addOn`), and the rule for it is "a useful extra, never a second income" (5-20%).
//   * Level 20: Torbor Downs has no tier-4 nodes (its zones stop at level 10), so that row is PROJECTED: the best
//     zone's layout with its top tier's nodes priced as tier 4. It says so.
import { readFileSync } from 'node:fs';
import { createProfessions } from '../js/rules/professions.js';
import { botInputs, scoreGame, seeded } from '../js/rules/professions-games.js';

const ROOT = new URL('../', import.meta.url);
const readJ = f => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8'));
export const SKILL_AT = Object.freeze({ 1: 3, 5: 28, 10: 52, 20: 80 });
export const PLAYER = Object.freeze({ sloppy: 0.6, speed: 4.7, settleS: 2, sellWalkShare: 0.04, killsPerHour: 85, beastShare: 0.7, skinS: 6 });
const skillAt = L => SKILL_AT[L] ?? Math.min(100, Math.round(3 + L * 4.2));

/** How a decent player's games come out: `{ quality: share }` and the mean seconds a game takes. */
function playStats(P, prof, { skill, need, tool = null, steps = null, n = 300 }) {
  const rng = seeded(991 + skill * 7 + need);
  const dist = { fail: 0, poor: 0, good: 0, fine: 0, perfect: 0 };
  let ms = 0;
  for (let s = 1; s <= n; s++) {
    const g = P.gameFor(prof, { skill, need, tool, seed: s * 7919 + need, steps });
    const inp = botInputs(g, rng, PLAYER.sloppy);
    dist[P.qualityOf(scoreGame(g, inp).score)]++;
    ms += inp.length ? inp[inp.length - 2] : g.ms;
  }
  for (const k of Object.keys(dist)) dist[k] /= n;
  return { dist, seconds: ms / n / 1000 };
}
/** The mean leg of a nearest-neighbour walk over points. */
function meanHop(pts) {
  if (pts.length < 2) return 0;
  const left = pts.slice(1); let cur = pts[0], sum = 0, n = 0;
  while (left.length) { let bi = 0, bd = Infinity; for (let i = 0; i < left.length; i++) { const d = Math.hypot(left[i].x - cur.x, left[i].z - cur.z); if (d < bd) { bd = d; bi = i; } } sum += bd; n++; cur = left.splice(bi, 1)[0]; }
  return sum / n;
}

export function simulate({ levels = [1, 5, 10, 20] } = {}) {
  const numbers = readJ('data/rules/professions.json'), content = readJ('data/provinces/professions.json'), nodes = readJ('data/provinces/professions-nodes.json');
  const P = createProfessions(numbers, content);
  const Q = numbers.quality, G = numbers.gather;
  const price = id => (P.material(id) || {}).price || 0;
  // round 11 (live #9): a high score (fine / perfect) gives the main material x1.5, rounded up, and one find — exactly as gatherYield
  const mainN = (y, gn, q) => { if (!y) return 0; const k = Math.max(1, Math.round(y * (gn || 1))); return P.highScore(q) ? Math.ceil(k * (P.highScoreNumbers.mult || 1.5)) : k; };
  const findValue = (prof, tier, q) => { if (!P.highScore(q)) return 0; const f = P.findFor(prof, tier); return f ? price(f) : 0; };
  const rows = [];
  /** Expected gold of one worked node of `kind` (priced as tier `as` when projecting). */
  const nodeValue = (kind, stats, as = null) => {
    const k = P.nodeKind(kind);
    const shift = id => { if (!as || as === k.tier) return id; for (const list of Object.values(P.classes)) { const i = list.indexOf(id); if (i === k.tier - 1 && list[as - 1]) return list[as - 1]; } return id; };
    let v = 0;
    for (const [q, share] of Object.entries(stats.dist)) v += share * (mainN(Q.yield[q] || 0, 1, q) * price(shift(k.gives)) + (k.bonus ? (Q.bonusChance[q] || 0) * price(shift(k.bonus)) : 0) + findValue(k.prof, as || k.tier, q));
    return v;
  };
  const gatherHour = (prof, L) => {
    const skill = skillAt(L), top = P.tierForSkill(skill).tier;
    let best = null;
    // a PROJECTED row (no node of this skill's tier anywhere) prices the top-tier nodes of the zones that grow the province's
    // best tier of this trade — round 11: since tier-2 trees left the low zones, an all-ash zone priced as tier 4 had won
    const provTop = Math.max(0, ...Object.values(nodes.zones).flat().map(n => P.nodeKind(n.k)).filter(k => k && k.prof === prof && k.tier <= top).map(k => k.tier));
    for (const [wid, m] of Object.entries(nodes.meta)) {
      if (L <= 10 && (L < m.band[0] - 1 || L > m.band[1] + 1)) continue;
      const list = (nodes.zones[wid] || []).filter(n => { const k = P.nodeKind(n.k); return k && k.prof === prof && k.tier <= top; });
      if (list.length < 5) continue;
      const zoneTop = Math.max(...list.map(n => P.nodeKind(n.k).tier));
      const projected = top > zoneTop && L > 10;          // the province has nothing of the tier this skill works
      if (projected && zoneTop < provTop) continue;
      const hop = meanHop(list);
      let value = 0, seconds = 0;
      for (const n of list) {
        const k = P.nodeKind(n.k), as = projected && k.tier === zoneTop ? top : k.tier;
        const st = playStats(P, prof, { skill, need: P.tier(as).minSkill, n: 120 });
        value += nodeValue(n.k, st, as) * (1 - st.dist.fail * 0) ; seconds += st.seconds * (1 + st.dist.fail);     // a failed game is played again
      }
      const perNode = value / list.length, perNodeS = hop / PLAYER.speed + seconds / list.length + PLAYER.settleS;
      const lapS = list.length * perNodeS, respawnS = (G.respawnMin[0] + G.respawnMin[1]) / 2 * 60;
      const perHour = 3600 / Math.max(perNodeS, respawnS / list.length) * (1 - PLAYER.sellWalkShare);
      const gold = perHour * perNode;
      if (!best || gold > best.gold) best = { gold, wid, zone: m.name, nodes: list.length, perHour, perNode, hop, lapS, projected, top };
    }
    return best;
  };
  for (const L of levels) {
    const skill = skillAt(L);
    const routes = {};
    for (const prof of ['mining', 'logging', 'foraging']) {
      const b = routes[prof] = gatherHour(prof, L);
      if (!b) { rows.push({ activity: prof, level: L, goldPerHour: 0, note: 'no nodes for this level' }); continue; }
      rows.push({ activity: prof, level: L, goldPerHour: Math.round(b.gold), kind: 'gather', projected: !!b.projected,
        note: `skill ${skill}, ${b.zone}: ${b.nodes} nodes, ${Math.round(b.perHour)} an hour (${Math.round(b.hop)} m apart), ${b.perNode.toFixed(1)} gold each${b.projected ? ' — PROJECTED: no tier-' + b.top + ' nodes in this province yet' : ''}` });
    }
    // gather, then refine at a station and sell the refined goods
    const refine = (label, prof, from, share, pick) => {
      const b = routes[from];
      if (!b) return;
      const tier = Math.min(b.top, 5);
      const rcs = P.recipes.filter(r => r.refine && r.prof === prof && r.tier <= tier && pick(r));
      if (!rcs.length) return;
      const rc = rcs.sort((x, y) => y.tier - x.tier)[0];
      const st = playStats(P, prof, { skill, need: rc.skill, n: 200 });
      const inValue = rc.needs.reduce((a, nd) => a + price(nd.id) * nd.n, 0), outValue = price(rc.makes.id) * (1 + st.dist.perfect * 0.5 / (numbers.craft.batchMax || 10) * 0 + st.dist.perfect * 0.5 * 0.1);
      // the share of the gathered value that is this recipe's input is refined; the rest is sold raw
      const refined = b.gold * share, games = refined / inValue / (numbers.craft.batchMax || 10);
      const craftS = games * (st.seconds * (1 + st.dist.fail) + PLAYER.settleS + 2);
      const k = 3600 / (3600 + craftS);
      const gold = (b.gold * (1 - share) + refined / inValue * outValue) * k;
      rows.push({ activity: label, level: L, goldPerHour: Math.round(gold), kind: 'craft', projected: !!b.projected,
        note: `${from} as above, then ${rc.name} (${inValue} gold of ${rc.needs.map(n => n.n + ' ' + P.material(n.id).name).join(' + ')} -> ${price(rc.makes.id)}), ${Math.round(games)} batches, ${Math.round(craftS / 60)} min at the station` });
    };
    refine('mining + smithing', 'smithing', 'mining', 0.85, r => /^smelt_/.test(r.id));
    refine('foraging + outfitting', 'outfitting', 'foraging', 1 / 3, r => /^weave_/.test(r.id));
    // skinning: what hides and meat add to an hour of hunting beasts
    {
      const tier = P.tierForLevel(L), sk = P.skinOf(Object.keys(content.skins.types)[0], L);
      const st = playStats(P, 'skinning', { skill, need: P.tier(sk.tier).minSkill, n: 300 });
      let per = 0;
      for (const [q, share] of Object.entries(st.dist)) for (const g of sk.gives) per += share * mainN(Q.yield[q] || 0, g.n, q) * price(g.id);
      for (const [q, share] of Object.entries(st.dist)) per += share * ((Q.bonusChance[q] || 0) * price(sk.bonus) + findValue('skinning', sk.tier, q));
      const beasts = PLAYER.killsPerHour * PLAYER.beastShare;
      const lost = beasts * (st.seconds + PLAYER.settleS + 1) / 3600;      // the share of the hour spent with the knife
      rows.push({ activity: 'skinning (add-on)', level: L, goldPerHour: Math.round(beasts * (1 - lost) * per), kind: 'addOn', addOn: true, lostShare: +lost.toFixed(3),
        note: `skill ${skill}: ${Math.round(beasts * (1 - lost))} beasts skinned, ${per.toFixed(1)} gold each (tier ${tier.tier} hide); costs ${Math.round(lost * 100)}% of the hour's kills. Added to hunting, not an hour of its own` });
    }
  }
  return rows;
}

/** For tools/sim-economy.mjs: `[{ activity, level, goldPerHour, note }]`. */
export async function extraRows({ levels = [1, 5, 10, 20] } = {}) { return simulate({ levels }); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = simulate();
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
  else {
    let questing = null;
    try { const E = await import('./sim-economy.mjs'); const r = await E.simulate({}); questing = Object.fromEntries(Object.entries(r.levels).map(([L, v]) => [L, v.activities.questing.gold])); } catch { /* the table still prints */ }
    for (const x of rows) console.log(`L${String(x.level).padEnd(3)}${x.activity.padEnd(24)}${String(x.goldPerHour).padStart(7)}${questing && questing[x.level] ? String(Math.round(x.goldPerHour / questing[x.level] * 100) + '%').padStart(6) : ''}  ${x.note}`);
  }
}
