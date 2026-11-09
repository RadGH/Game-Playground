// Headless pacing check: a bot plays Spirehold for N hours of game time and prints how far it got.
// node tools/sim.mjs [hours=4] [dt=0.1] [seed=1]
import { newGame } from '../js/sim/state.js';
import { tick, createBattle, buildTower, upgradeTower, chooseBranch, upgradeWall, upgradeLandmark, hireMage, levelMage, buyResearch, crownsFor, newRealm, buyLegacy, levelRelic } from '../js/sim/game.js';
import { castSpell, autoTarget, canCast } from '../js/sim/battle.js';
import { TOWERS, LANDMARKS, RESEARCH, SCHOOLS, SPELL_ORDER, LENGTHS, LEGACY, REALMS } from '../js/sim/data.js';
import { towerCost, towerUnlocked, slotsOf, wallCost, landmarkCost, mageSlots, mageHireCost, mageLvlCost, researchCost, researchOpen, branchDue, wallMax, legacyCost, bon } from '../js/sim/rules.js';
import { suggestParty, sendQuest, hire, hireCost, rosterCap, isFree } from '../js/sim/guild.js';
import { questOdds } from '../js/sim/rules.js';

const hours = +(process.argv[2] || 4), dt = +(process.argv[3] || 0.1), seed = +(process.argv[4] || 1);
const prestigeAt = +(process.env.PRESTIGE || 0);   // found a new realm when best wave stalls this long (hours); 0 = never
let G = newGame({ seed, now: 0 }); let B = createBattle(G, seed);
let now = 0; const T = hours * 3600; let nextAct = 0, nextReport = 0; let lastBestAt = 0, lastBest = 1;
const order = ['archer', 'ballista', 'bombard', 'frost', 'brazier', 'storm', 'arcane', 'shrine', 'observatory'];
function act() {
  // spells: an attentive-but-not-glued player
  for (const id of SPELL_ORDER) { if (G.spells.auto[id] === undefined && bon(G, 'autocast')) G.spells.auto[id] = true; if (!canCast(G, B, id) && !bon(G, 'autocast')) { const at = autoTarget(G, B, id); if (at) castSpell(G, B, id, at.x, at.y); } }
  // research: cheapest open
  for (let k = 0; k < 20; k++) { const open = RESEARCH.filter(r => researchOpen(G, r) && (G.research[r.id] || 0) < r.max).map(r => ({ r, c: researchCost(r, G.research[r.id] || 0) * (r.max === 1 ? 0.5 : 1) })).sort((a, b) => a.c - b.c); if (!open.length || G.lore < open[0].c) break; buyResearch(G, open[0].r.id); }
  // build in empty spots
  const slots = slotsOf(G);
  for (let s = 0; s < slots; s++) if (!G.towers.some(t => t.slot === s)) { const avail = order.filter(t => towerUnlocked(G, t)); const type = avail[s % avail.length]; if (G.gold >= towerCost(type, 1, G)) buildTower(G, s, type); }
  for (const t of G.towers) { const d = branchDue(t); if (d >= 0) chooseBranch(G, t.slot, (t.slot + d) % 2); }
  // mages
  if (G.mages.length < mageSlots(G) && G.gold > mageHireCost(G.mages.length) * 1.2) { const sch = Object.keys(SCHOOLS).filter(s => !SCHOOLS[s].unlock || G.research[SCHOOLS[s].unlock]); hireMage(G, sch[G.mages.length % sch.length], G.mages.length); }
  // spend: cheapest useful thing, a few times
  for (let k = 0; k < 400; k++) {
    const opts = [];
    for (const t of G.towers) if (branchDue(t) < 0) opts.push({ c: towerCost(t.type, t.lvl + 1, G), f: () => upgradeTower(G, t.slot, 1) });
    opts.push({ c: wallCost(G.wall.lvl + 1) * (G.wave.falls > 0 ? 0.6 : 1.5), real: wallCost(G.wall.lvl + 1), f: () => upgradeWall(G, 1) });
    for (const id in LANDMARKS) if (G.city.level >= LANDMARKS[id].city) opts.push({ c: landmarkCost(id, G.city.landmarks[id] || 0) * 1.3, real: landmarkCost(id, G.city.landmarks[id] || 0), f: () => upgradeLandmark(G, id, 1) });
    for (const m of G.mages) opts.push({ c: mageLvlCost(m.lvl + 1) * 1.1, real: mageLvlCost(m.lvl + 1), f: () => levelMage(G, m.id, 1) });
    opts.sort((a, b) => a.c - b.c); const o = opts[0]; if (!o || G.gold < (o.real ?? o.c)) break; o.f();
  }
  // guild
  for (const p of G.guild.visitors.slice()) for (const a of p.members.slice()) if (G.guild.roster.length < rosterCap(G) && G.gold > hireCost(a) * 3) hire(G, p.id, a.id);
  for (const q of G.guild.board.slice()) { const party = suggestParty(G, q, now); if (!party.length) continue; const o = questOdds(G, q, party).odds; if (o >= 0.55) sendQuest(G, q.id, now > 3600e3 ? 'long' : 'half', party.map(a => a.id), now); }
  // legacy
  for (let k = 0; k < 50; k++) { const l = LEGACY.filter(l => (G.legacy[l.id] || 0) < l.max).map(l => ({ l, c: legacyCost(l, G.legacy[l.id] || 0) })).sort((a, b) => a.c - b.c)[0]; if (!l || G.crowns < l.c) break; buyLegacy(G, l.l.id); }
}
const t0 = Date.now(); let ticks = 0;
const lines = [];
while (now < T * 1000) {
  tick(G, B, dt, now); B.ev.length = 0; G.news.length = 0; now += dt * 1000; ticks++;
  if (now >= nextAct) { act(); nextAct = now + 5000; }
  if (G.wave.best > lastBest) { lastBest = G.wave.best; lastBestAt = now; }
  if (prestigeAt && now - lastBestAt > prestigeAt * 3600e3 && crownsFor(G) > 0) {
    const realms = Object.keys(REALMS).filter(r => (G.founded || 0) >= REALMS[r].need); const realm = realms[realms.length - 1];
    lines.push(`  -> new realm at ${(now / 3600e3).toFixed(1)}h: best ${G.wave.best}, +${crownsFor(G)} crowns -> ${realm}`);
    const r = newRealm(G, realm, seed + G.founded + 1, now); G = r.G; B = createBattle(G, seed); lastBestAt = now; lastBest = G.wave.best;
  }
  if (now >= nextReport) {
    nextReport = now + (hours > 6 ? 3600e3 : 1800e3);
    lines.push(`${(now / 3600e3).toFixed(1).padStart(5)}h wave ${String(G.wave.n).padStart(3)} best ${String(G.wave.best).padStart(3)} falls ${String(G.wave.falls).padStart(3)} city ${String(G.city.level).padStart(3)} towers ${G.towers.length}/${slotsOf(G)} lv~${Math.round(G.towers.reduce((s, t) => s + t.lvl, 0) / Math.max(1, G.towers.length))} wall ${G.wall.lvl} mages ${G.mages.length} adv ${G.guild.roster.length} quests ${G.totals.questsWon}/${G.totals.quests} best rank ${G.guild.bestRank ?? -1} relics ${Object.keys(G.relics).length} gold ${G.gold.toExponential(2)} lore ${G.lore.toExponential(1)} crowns ${G.crowns} realm ${G.founded} enemies ${B.enemies.length}`);
    console.log(lines[lines.length - 1]); lines.length = 0; if (B.bySrc) { const tot = Object.values(B.bySrc).reduce((a, b) => a + b, 0); console.log("      dmg:", Object.entries(B.bySrc).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + Math.round(v / tot * 100) + "%").join(", "), "waveT", B.wave.t.toFixed(0)); } B.bySrc = {};
  }
}
console.log(lines.join('\n'));
console.log(`ran ${ticks} ticks in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
