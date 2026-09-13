#!/usr/bin/env node
// sim-emberveil.mjs — headless balance simulator for prototypes/emberveil.
//
// Plays whole runs with the game's own modules: the same Game (map, travel legs, rations, night
// attacks, rest, towns, named enemies, nemeses), the same Combat, the same Loot, the same damage
// meter. A small bot makes the decisions a player would: walk toward the boss, fight what is in the
// way, rest when the party is low or out of moves, buy food and bandages, equip anything with a
// better score.
//
//   node tools/sim-emberveil.mjs --runs 200 --seed 1
//   node tools/sim-emberveil.mjs --runs 60 --act 3            only start-of-act-3 runs
//   node tools/sim-emberveil.mjs --runs 40 --class necromancer  every party carries one
//   node tools/sim-emberveil.mjs --runs 200 --report prototypes/emberveil/research/sim-latest.md
//   node tools/sim-emberveil.mjs --matrix                     class + weapon matrices as well
//
// Flags: --runs N --seed N --act N --class ID --matrix --quiet --report PATH --days N
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, MAIN_QUESTS, VEHICLES } from '../prototypes/emberveil/js/game.js';
import { Combat, fleeCheck, recordEvent } from '../prototypes/emberveil/js/combat.js';
import { equip, refresh, derive, canUse, passiveTree, classSkills, mergeSkill, XP_TABLE, xpForLevel } from '../prototypes/emberveil/js/rules.js';
import { resolveCrossing, crossingChoices } from '../prototypes/emberveil/js/explore.js';
import { makeRng } from '../prototypes/emberveil/js/rng.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EV = path.join(HERE, '..', 'prototypes', 'emberveil');
const J = f => JSON.parse(fs.readFileSync(path.join(EV, 'data', f), 'utf8'));
const LJ = f => JSON.parse(fs.readFileSync(path.join(HERE, '..', 'lingo', 'data', f), 'utf8'));
const DATA = {
  items: J('items.json'), classes: J('classes.json'), skills: J('skills.json'), builds: J('build-presets.json'),
  enemies: J('enemies.json'), bosses: J('bosses.json'), encounters: J('encounters.json'), spells: J('enemy-spells.json'),
  zones: J('zones.json'), zoneTables: J('zone-tables.json'), dialogs: J('dialog-events.json'),
  randomEvents: J('random-events.json'), dungeons: J('dungeons.json'), companions: J('companions.json'),
  statuses: J('status-effects.json'), bossPhases: J('boss-phases.json'), named: J('named-enemies.json'),
  sideQuests: J('side-quests.json'), classQuests: J('class-quests.json'), balance: J('balance.json'),
  crossings: J('crossings.json'),
  relations: LJ('relations.json'), events: LJ('events.json'),
};
const CLASSES = DATA.classes.classes.map(c => c.id);
const ACT_ZONES = { 1: 'border_roads', 2: 'dust_roads', 3: 'hell_breach', 4: 'cosmic_rift', 5: 'abyssal_depths', 6: 'dragons_reach' };
// Where a party that walked there naturally would be: levels and purse at the head of each act,
// read off the full runs. Mid-act starts use these so the matrices are not measuring a naked party.
const ACT_LEVEL = { 0: 1, 1: 2, 2: 8, 3: 13, 4: 17, 5: 20, 6: 23 };
const ACT_GOLD = { 1: 300, 2: 1200, 3: 2500, 4: 4000, 5: 5500, 6: 7000 };
const ZONE_ACT = {}; for (const v of Object.values(DATA.zones)) if (Array.isArray(v)) for (const z of v) if (z?.id) ZONE_ACT[z.id] = z.act;

// ── flags ─────────────────────────────────────────────────────────────────────────────────
function flags(argv) {
  const f = { runs: 200, seed: 1, act: 0, class: null, matrix: false, quiet: false, days: 140, report: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; if (!a.startsWith('--')) continue; const k = a.slice(2); const v = argv[i + 1];
    if (k === 'matrix' || k === 'quiet') { f[k] = true; continue; }
    if (k in f) { f[k] = ['runs', 'seed', 'act', 'days'].includes(k) ? +v : v; i++; }
  }
  return f;
}

// ── the bot ───────────────────────────────────────────────────────────────────────────────
/** Shortest path of node ids from `from` to `to` inside one zone. */
function pathTo(zone, from, to) {
  const q = [[from]]; const seen = new Set([from]);
  while (q.length) {
    const p = q.shift(); const last = p[p.length - 1]; if (last === to) return p.slice(1);
    for (const e of zone.nodes.find(n => n.id === last)?.exits || []) if (!seen.has(e)) { seen.add(e); q.push([...p, e]); }
  }
  return null;
}
/** Where the bot wants to go next: the nearest thing worth doing, then the boss. */
function nextTarget(g) {
  const z = g.zone(); const cur = g.nodeId;
  const worth = n => !g.isCleared(n.id) && !g.isUsed(n.id) && !['town'].includes(n.type);
  const boss = z.nodes.find(n => n.type === 'boss');
  const wanted = z.nodes.filter(n => worth(n) && n.type !== 'boss');
  let best = null, bestLen = 1e9;
  for (const n of wanted) { const p = pathTo(z, cur, n.id); if (p && p.length < bestLen) { best = n; bestLen = p.length; } }
  if (best) return best.id;
  return boss && !g.isCleared(boss.id) ? boss.id : null;
}
/** Spend the points a level-up hands out — the bot plays the character sheet the way a player does.
 *  Attributes follow the class's build preset, talents are bought in order, passives go down the class tree. */
function spendPoints(g, h) {
  let touched = false;
  const w = g.build(h.class)?.targetAttrs || { STR: 25, DEX: 25, INT: 25, CON: 25 };
  const order = Object.entries(w).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  let i = 0;
  while (h.pendingAttr > 0) { h.attrs[order[i % order.length]]++; h.pendingAttr--; i++; touched = true; }
  while (h.pendingTalent > 0) {
    const t = classSkills(DATA.skills.skills, h.class, h.level).flatMap(sk => sk.talents || []).find(x => !h.talents[x.id]);
    if (!t) break; h.talents[t.id] = true; h.pendingTalent--; touched = true;
  }
  const tree = passiveTree(h.class);
  while (h.pendingPassive > 0) {
    const node = tree.find(n => (h.passiveRanks[n.id] || 0) < 3);
    if (!node) break; h.passiveRanks[node.id] = (h.passiveRanks[node.id] || 0) + 1; h.pendingPassive--; touched = true;
  }
  // new skills unlocked by the level
  const kit = classSkills(DATA.skills.skills, h.class, h.level).map(sk => sk.id);
  for (const id of kit) if (!h.skills.includes(id)) { h.skills.push(id); touched = true; }
  if (touched) refresh(h, g.loot);
  return touched;
}
function spendAll(g) { for (const h of g.party) spendPoints(g, h); }
function partyHpFrac(g) { const a = g.party.filter(h => h.alive); return a.length ? a.reduce((s, h) => s + h.hp / h.maxHp, 0) / a.length : 0; }

/** Equip anything in the bag that scores better for someone who can use it. Returns how many swaps. */
function equipUpgrades(g, stats) {
  let swaps = 0;
  for (const it of [...g.inventory]) {
    if (it.type === 'potion') continue;
    let bestHero = null, bestGain = 0;
    for (const h of g.party) {
      if (it.type === 'weapon' && !canUse(h, it)) continue;
      const slot = it.slot === 'ring' ? (h.equipment.ring1 ? 'ring2' : 'ring1') : it.slot;
      const cur = h.equipment[slot]; const gain = g.loot.score(it, h).total - (cur ? g.loot.score(cur, h).total : 0);
      if (gain > bestGain) { bestGain = gain; bestHero = h; }
    }
    if (!bestHero) continue;
    g.inventory = g.inventory.filter(x => x !== it);
    const out = equip(bestHero, it, g.loot); g.inventory.push(...out.filter(Boolean));
    g.logLoot(it, { holder: bestHero.id, equipped: true, replaced: out[0]?.name || null, delta: bestGain });
    for (const k of (it.affixes || [])) if (String(k.stat).startsWith('cond_')) stats.affixPicks[k.stat] = (stats.affixPicks[k.stat] || 0) + 1;
    stats.itemPicks[it.baseKey] = (stats.itemPicks[it.baseKey] || 0) + 1;
    swaps++;
  }
  return swaps;
}
/** Town: sell the leftovers, stock up on food and bandages, then upgrade gear. */
function doTown(g, stats) {
  const town = g.townFor();
  for (const it of [...g.inventory]) if (g.loot.score(it).total < 40 && !it.isUnique) g.sell(it);
  const want = { ration: 20, bandages: 4, torch: 8 };
  for (const [kind, target] of Object.entries(want)) while ((g.supplies[kind] || 0) < target && g.buySupply(kind, 1)) stats.bought[kind] = (stats.bought[kind] || 0) + 1;
  if (!g.supplies.tent && g.gold > 400) { g.buySupply('tent', 1); stats.bought.tent = (stats.bought.tent || 0) + 1; }
  if (g.vehicle === 'none' && g.gold > 600) { g.buyVehicle('wagon'); stats.bought.wagon = (stats.bought.wagon || 0) + 1; }
  if (!g.companions.length) { const pick = g.kennel().sort((a, b) => (b.power || 1) - (a.power || 1)).find(c => c.price <= g.gold * 0.35); if (pick) { g.gold -= pick.price; g.addCompanion(g.makeCompanion(pick)); stats.bought.companion = (stats.bought.companion || 0) + 1; } }
  const stock = g.merchantStock(town);
  for (const it of [...stock]) {
    if (!it || g.gold < (it.price || 0) * 1.6) continue;
    const gain = Math.max(...g.party.map(h => (it.type === 'weapon' && !canUse(h, it)) ? -1 : g.loot.score(it, h).total - (h.equipment[it.slot === 'ring' ? 'ring1' : it.slot] ? g.loot.score(h.equipment[it.slot === 'ring' ? 'ring1' : it.slot], h).total : 0)));
    if (gain > 30) { g.buy(it, it.price, stock); stats.goldSpent += it.price; }
  }
  equipUpgrades(g, stats);
  if (partyHpFrac(g) < 0.8) g.clericRest(town);
}


/** Average score of everything the party has equipped — the "how good is our gear" number. */
function gearScore(g) {
  let n = 0, t = 0;
  for (const h of g.party) for (const it of Object.values(h.equipment || {})) { if (!it) continue; t += g.loot.score(it, h).total; n++; }
  return n ? t / n : 0;
}
/** Everything the party is wearing right now, by affix stat / unique / legendary power. */
function wornTally(g, stats) {
  for (const h of g.party) for (const it of Object.values(h.equipment || {})) {
    if (!it) continue;
    if (it.isUnique) stats.wornUnique[it.uniqueId || it.baseKey] = (stats.wornUnique[it.uniqueId || it.baseKey] || 0) + 1;
    if (it.setId) stats.wornSet[it.setId] = (stats.wornSet[it.setId] || 0) + 1;
    if (it.rarity) stats.wornRarity[it.rarity] = (stats.wornRarity[it.rarity] || 0) + 1;
    for (const a of it.affixes || []) if (a.stat && !a.baseIntrinsic) stats.wornAffix[a.stat] = (stats.wornAffix[a.stat] || 0) + 1;
    if (it.legendaryEffectId) stats.wornLegendary[it.legendaryEffectId] = (stats.wornLegendary[it.legendaryEffectId] || 0) + 1;
  }
}
/** Snapshot of where the party stands, filed under the act it just walked into. */
function snapAct(g, stats, act = g.act) {
  if (act < 1 || stats.actSnap[act]) return;
  const lv = g.party.map(h => h.level);
  stats.actSnap[act] = {
    day: g.day, level: lv.reduce((a, b) => a + b, 0) / Math.max(1, lv.length), gold: g.gold,
    xp: g.party.reduce((s, h) => s + h.xp, 0) / Math.max(1, g.party.length),
    gear: gearScore(g), fights: stats.fights, wipes: stats.deaths,
  };
}
/** A damage record's broad source: what the player would call it. */
function sourceKind(via) {
  const v = String(via || 'attack');
  if (v.startsWith('skill:')) return 'skill';
  if (v.startsWith('dot:') || v.startsWith('status:')) return 'status';
  if (v.startsWith('proc:') || v.startsWith('affix') || v.startsWith('legendary') || v.startsWith('champion') || v === 'thorns') return 'proc';
  if (v.startsWith('spell:')) return 'enemy spell';
  return 'weapon';
}
/** The bot at a crossing: take the surest way past that does not cost a day, else the surest way at all. */
function doCrossing(g, res, stats) {
  const cr = res.crossing; const states = crossingChoices(g, cr);
  const scored = states.map((st, i) => {
    const raw = cr.choices[i]; const mult = raw.reward?.mult ?? 1;
    const odds = st.odds == null ? 96 : st.odds;                     // auto / no-check choices just work
    const value = odds + mult * 12 - (st.days || 0) * 22 - st.goldCost / 40 - (st.fight ? 18 : 0);
    return { st, raw, value };
  }).filter(x => x.st.available).sort((a, b) => b.value - a.value);
  const pick = scored[0];
  if (!pick) { stats.crossings.blocked++; return true; }
  const out = resolveCrossing(g, cr, pick.st.id, g.rng);
  stats.crossings.tried++;
  stats.crossings[out.ok ? 'passed' : 'failed']++;
  stats.crossings.byId[cr.id] = stats.crossings.byId[cr.id] || { tried: 0, passed: 0 };
  stats.crossings.byId[cr.id].tried++; if (out.ok) stats.crossings.byId[cr.id].passed++;
  stats.crossings.days += out.days || 0;
  if (out.ok && !out.fight) g.clearCrossing(res.node);
  if (out.fight) {
    const enc = g.encounter(out.fight);
    if (enc) { stats.crossings.fights++; if (!runFight(g, enc, null, stats)) return false; g.clearCrossing(res.node); }
  }
  return true;
}

/** One headless fight. Feeds the damage meter exactly the way the live game does. */
function runFight(g, enc, node, stats) {
  const heroes = g.fighters(); const foes = enc.enemies;
  const act = Math.max(1, g.act);
  const hpBefore = g.party.reduce((s, h) => s + Math.max(0, h.hp), 0);
  const hpPool = g.party.reduce((s, h) => s + h.maxHp, 0) || 1;
  const foePower = foes.reduce((s, e) => s + e.maxHp, 0);
  const foeDps = foes.reduce((s, e) => s + (e.dmg[0] + e.dmg[1]) / 2, 0);
  const meterMark = g.meter.fights.length;
  const C = new Combat(heroes, foes, {
    skills: DATA.skills.skills, spells: DATA.spells.spells, loot: g.loot,
    rng: makeRng(g.seed + g.kills * 13 + g.day + stats.fights), act: g.act, bossPhases: DATA.bossPhases.phases,
    exhaustionMult: g.exhaustionMult(), vehicle: g.vehicle, meter: g.meter,
    startBarrier: enc.night && g.vehicle === 'war_wagon' ? 25 : 0,
  });
  g.meter.startFight(enc.name || 'fight', { zone: g.zoneId, day: g.day });
  let tick = 0;
  while (!C.over) { for (const ev of C.round()) { tick += 0.5; recordEvent(g.meter, ev, tick); } }
  g.meter.endFight(); enc.killsBy = C.killsBy;
  stats.fights++; stats.rounds += C.round_; stats.roundsByAct[act] = (stats.roundsByAct[act] || []);
  stats.roundsByAct[act].push(C.round_);
  // the difficulty curve: what one fight costs the party, and what it was worth facing
  const A = (stats.byAct[act] ||= { fights: 0, rounds: 0, hpLostFrac: 0, foeHp: 0, foeDps: 0, gearScore: 0, statusRounds: 0, heroStatusRounds: 0, dmgDealt: 0, dmgTaken: 0, wipes: 0, gold: 0, xp: 0, drops: 0, rarity: {} });
  const hpAfter = g.party.reduce((s, h) => s + Math.max(0, h.alive ? h.hp : 0), 0);
  A.fights++; A.rounds += C.round_; A.hpLostFrac += Math.max(0, hpBefore - hpAfter) / hpPool;
  A.foeHp += foePower; A.foeDps += foeDps; A.gearScore += gearScore(g);
  // damage share by source, status uptime — read straight off the meter records this fight added
  for (const f of g.meter.fights.slice(meterMark)) for (const r of f.records) {
    const mine = g.party.some(h => h.id === r.source);
    if (r.kind === 'damage') { if (mine) { A.dmgDealt += r.amount; stats.dmgBySource[sourceKind(r.via)] = (stats.dmgBySource[sourceKind(r.via)] || 0) + r.amount; } else A.dmgTaken += r.amount; }
    if (r.kind === 'status') { const d = r.duration || 2; if (g.party.some(h => h.id === r.target)) A.heroStatusRounds += d; else A.statusRounds += d; stats.statusRoundsBy[r.status] = (stats.statusRoundsBy[r.status] || 0) + d; }
  }
  for (const [id, sk] of Object.entries(C.skillUses || {})) stats.skillUses[id] = (stats.skillUses[id] || 0) + sk;
  const won = C.result === 'win';
  if (won) {
    g.trackFight(C, enc, true); const before = g.act; const v = g.victory(node, enc); for (const h of g.party) spendPoints(g, h);
    // the act advances inside victory() when the act boss goes down — that is what "cleared an act" means
    if (g.act > before) { stats.actsCleared = Math.max(stats.actsCleared, before); stats.clearedActs[before] = 1; snapAct(g, stats); }
    A.gold += v?.gold || 0; A.xp += v?.xp || 0;
    for (const it of [...(v?.drops || []), ...(v?.bossDrops || [])]) { A.drops++; A.rarity[it.rarity] = (A.rarity[it.rarity] || 0) + 1; if (it.isUnique) stats.uniquesFound[it.uniqueId || it.baseKey] = (stats.uniquesFound[it.uniqueId || it.baseKey] || 0) + 1; }
  }
  else {
    stats.deaths++; const killer = foes.find(e => e.alive) || foes[0];
    const kind = enc.named ? 'named' : node?.type === 'boss' ? 'boss' : enc.night ? 'night raid' : 'ordinary';
    stats.deathBy[kind] = (stats.deathBy[kind] || 0) + 1;
    stats.deathByEnemy[killer?.templateId || '?'] = (stats.deathByEnemy[killer?.templateId || '?'] || 0) + 1;
    stats.deathDays.push(g.day); stats.deathActs[act] = (stats.deathActs[act] || 0) + 1; A.wipes++;
    g.defeat(enc);
  }
  for (const h of heroes) { h.statuses = []; h.buffs = []; h.dmgBuff = 0; h.dmgReduct = 0; }
  return won;
}

/** A night's rest, including the raid roll. */
function doRest(g, stats) {
  const na = g.nightAttack();
  if (g.rng() < na.chance) {
    const enc = g.nightEncounter();
    if (enc) { stats.nightFights++; if (!runFight(g, enc, null, stats)) { stats.nightDeaths++; return false; } }
  }
  const out = g.rest({ eatExtra: partyHpFrac(g) < 0.55 && g.supplies.ration > 2 });
  if (!out.ate) stats.starvedNights++;
  stats.rests++;
  for (const f of out.gear || []) stats.gearFired[f.id] = (stats.gearFired[f.id] || 0) + 1;
  return true;
}

/** Play one run. Returns a row of numbers. */
function runOnce(seed, { startAct = 0, forceClass = null, forceWeapon = null, days = 140, maxWipes = 3 } = {}) {
  const rng = makeRng(seed);
  const g = new Game(DATA); g.seed = seed; g.rng = makeRng(seed);
  const picks = []; if (forceClass) picks.push(forceClass);
  while (picks.length < 4) { const c = rng.pick(CLASSES); if (!picks.includes(c)) picks.push(c); }
  picks.forEach((c, i) => g.addHero(g.makeHero(c, `${c[0].toUpperCase()}${c.slice(1)} ${i + 1}`, startAct ? ACT_LEVEL[startAct] : 1)));
  g.startQuests(); spendAll(g);
  const stats = {
    seed, classes: picks, fights: 0, rounds: 0, roundsByAct: {}, deaths: 0, deathBy: {}, deathByEnemy: {},
    deathDays: [], deathActs: {}, nightFights: 0, nightDeaths: 0, starvedNights: 0, rests: 0, bought: {},
    goldSpent: 0, itemPicks: {}, affixPicks: {}, gearFired: {}, skillUses: {}, dmgByClass: {}, killsByClass: {}, statuses: {}, dtypes: {},
    actReached: 0, won: false, days: 0, levels: [], gold: 0, xpCurve: [],
    byAct: {}, actSnap: {}, actsCleared: 0, clearedActs: {}, dmgBySource: {}, statusRoundsBy: {},
    wornAffix: {}, wornUnique: {}, wornSet: {}, wornRarity: {}, wornLegendary: {}, uniquesFound: {},
    crossings: { tried: 0, passed: 0, failed: 0, blocked: 0, fights: 0, days: 0, byId: {} },
    rationsBought: 0, hungryDays: 0, starveWipes: 0,
  };
  if (startAct) {
    const z = ACT_ZONES[startAct]; g.unlockedZones.push(z); g.enterZone(z); g.act = startAct;
    g.gold = ACT_GOLD[startAct]; g.supplies = { ration: 14, bandages: 3, torch: 6, tent: 1 };
    // kit them out the way a party that walked here would be: a few rolls off this zone's table
    for (let i = 0; i < 16; i++) { const it = g.loot.zoneDrop(z, g.rng, { act: startAct }) || g.loot.generate(g.rng.pick(DATA.items.merchant.bases), 'rare', 'high', { rng: g.rng }); if (it) g.inventory.push(it); }
    spendAll(g); equipUpgrades(g, stats); doTown(g, stats);
  }
  if (forceWeapon) for (const h of g.party) {
    const w = DATA.items.uniques.some(u => u.id === forceWeapon) ? g.loot.generateUnique(forceWeapon, g.rng) : g.loot.generate(forceWeapon, 'rare', 'high', { rng: g.rng });
    if (w && canUse(h, w)) { equip(h, w, g.loot); break; }
  }

  let guard = 0, wipes = 0;
  snapAct(g, stats, Math.max(1, g.act));
  while (g.day <= days && guard++ < 4000) {
    stats.actReached = Math.max(stats.actReached, g.act);
    snapAct(g, stats);
    const node = g.node(); const key = `${g.zoneId}:${node.id}`;
    // resolve where we stand
    const res = g.enter(node);
    if (res.kind === 'combat') {
      if (!runFight(g, res.encounter, res.node, stats)) { wipes++; if (wipes >= maxWipes) break; }
      equipUpgrades(g, stats);
    } else if (res.kind === 'town') doTown(g, stats);
    else {
      if (res.kind === 'event') {
        const ev = res.event; const choice = (ev.choices || []).filter(c => g.choiceAllowed(c))[0];
        if (choice) { const out = g.choose(ev, choice); if (out.startCombat) { const enc = g.encounter(out.startCombat); if (enc && !runFight(g, enc, null, stats)) { wipes++; if (wipes >= maxWipes) break; } } }
      } else if (res.kind === 'crossing') {
        if (!doCrossing(g, res, stats)) { wipes++; if (wipes >= maxWipes) break; }
        equipUpgrades(g, stats);
      } else if (res.kind === 'skillCheck') g.resolveSkillCheck(node);
      // everything else (lore, shrines, caches, dungeons, quiet nodes) is already applied by enter();
      // mark it done so the bot stops walking back to it. A crossing it failed stays walkable so it
      // can come back to it, exactly as a player would.
      if (res.kind !== 'crossing' || g.isCleared(node.id)) { if (!g.usedNodes.includes(key)) g.usedNodes.push(key); }
      else if (!g.usedNodes.includes(key)) g.usedNodes.push(key);
    }
    for (const f of g.winGear || []) stats.gearFired[f.id] = (stats.gearFired[f.id] || 0) + 1;
    g.winGear = [];
    // bandage up between fights
    for (const h of g.party) if (h.alive && h.hp < h.maxHp * 0.4) g.useBandage(h);
    // boss down → next zone
    const nz = g.zone().nodes.find(n => n.type === 'boss');
    if (nz && g.isCleared(nz.id)) {
      const next = g.nextZoneId();
      if (!next) { stats.won = true; stats.actsCleared = 6; stats.clearedActs[6] = 1; break; }
      if (g.unlockedZones.includes(next)) { g.enterZone(next); stats.actReached = Math.max(stats.actReached, g.act); snapAct(g, stats); continue; }
    }
    // hurt and poor? go and see a cleric before the next fight
    const town = g.zone().nodes.find(n => n.type === 'town');
    const wantTown = town && town.id !== g.nodeId && (partyHpFrac(g) < 0.45 || g.supplies.ration <= 1 || g.inventory.length > 14);
    const target = wantTown ? town.id : nextTarget(g);
    if (target == null) { const next = g.nextZoneId(); if (next && g.unlockedZones.includes(next)) { g.enterZone(next); stats.actReached = Math.max(stats.actReached, g.act); snapAct(g, stats); continue; } break; }
    const step = pathTo(g.zone(), g.nodeId, target)?.[0];
    if (!step) { if (!g.usedNodes.includes(key)) g.usedNodes.push(key); if (target === g.nodeId) continue; break; }
    if (!g.canMove()) { if (!doRest(g, stats)) { wipes++; if (wipes >= maxWipes) break; } continue; }
    if (partyHpFrac(g) < 0.4 && !wantTown) { if (!doRest(g, stats)) { wipes++; if (wipes >= maxWipes) break; } continue; }
    if (!g.travel(step)) { if (!doRest(g, stats)) break; continue; }
    for (const fx of g.legGear || []) stats.gearFired[fx.id] = (stats.gearFired[fx.id] || 0) + 1;
  }
  wornTally(g, stats);
  stats.days = g.day; stats.levels = g.party.map(h => h.level); stats.gold = g.gold; stats.wipes = wipes;
  stats.actReached = Math.max(stats.actReached, g.act);
  // damage share by class, from the meter
  for (const f of g.meter.fights) for (const r of f.records) {
    const h = g.party.find(x => x.id === r.source); if (!h) continue;
    if (r.kind === 'damage') stats.dmgByClass[h.class] = (stats.dmgByClass[h.class] || 0) + r.amount;
    if (r.killingBlow) stats.killsByClass[h.class] = (stats.killsByClass[h.class] || 0) + 1;
    if (r.kind === 'damage' && String(r.via).startsWith('skill:')) stats.skillUses[r.via.slice(6)] = (stats.skillUses[r.via.slice(6)] || 0) + 1;
  }
  for (const f of g.meter.fights) for (const r of f.records) {
    if (r.kind === 'status') stats.statuses[r.status] = (stats.statuses[r.status] || 0) + 1;
    if (r.kind === 'damage') stats.dtypes[r.dtype || 'physical'] = (stats.dtypes[r.dtype || 'physical'] || 0) + r.amount;
  }
  stats.itemKills = Object.fromEntries(Object.values(g.meter.itemStats).map(s => [s.name || s.itemId, s.kills]));
  stats.xpCurve = g.party.map(h => ({ level: h.level, xp: h.xp }));
  return stats;
}

// ── aggregation ───────────────────────────────────────────────────────────────────────────
const MAX_WIPES = 3;
const STATUS_NAMES = Object.keys(JSON.parse(fs.readFileSync(path.join(EV, 'data', 'status-effects.json'), 'utf8')).statusMeta);
/** The properties this round's road weapons introduced — reported on their own so they do not get lost among the old affixes. */
const ROAD_STATS = new Set(Object.values(DATA.items.weaponBases).flatMap(b => (b.intrinsic || []).map(f => f.stat)));
const sum = a => a.reduce((s, x) => s + x, 0);
const avg = a => (a.length ? sum(a) / a.length : 0);
const pct = (n, d) => (d ? (100 * n / d).toFixed(1) + '%' : '—');
const f1 = n => (Math.round(n * 10) / 10).toFixed(1);
function mergeCounts(rows, key) { const out = {}; for (const r of rows) for (const [k, v] of Object.entries(r[key] || {})) out[k] = (out[k] || 0) + v; return out; }
function topN(obj, n = 8) { return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n); }

function summarise(rows, label) {
  const byAct = {};
  for (const r of rows) { const a = r.actReached || 1; (byAct[a] ||= []).push(r); }
  const allRounds = rows.flatMap(r => Object.values(r.roundsByAct).flat());
  return {
    label, runs: rows.length,
    winRate: 100 * rows.filter(r => r.won).length / Math.max(1, rows.length),
    reachedAct: avg(rows.map(r => r.actReached)),
    fights: avg(rows.map(r => r.fights)), rounds: avg(allRounds),
    deaths: avg(rows.map(r => r.deaths)), deathDay: avg(rows.flatMap(r => r.deathDays)),
    days: avg(rows.map(r => r.days)), level: avg(rows.flatMap(r => r.levels)), gold: avg(rows.map(r => r.gold)),
    starve: 100 * sum(rows.map(r => r.starvedNights)) / Math.max(1, sum(rows.map(r => r.rests))),
    nightDeath: 100 * sum(rows.map(r => r.nightDeaths)) / Math.max(1, sum(rows.map(r => r.nightFights))),
    deathBy: mergeCounts(rows, 'deathBy'), deathByEnemy: mergeCounts(rows, 'deathByEnemy'),
    deathActs: mergeCounts(rows, 'deathActs'), itemPicks: mergeCounts(rows, 'itemPicks'),
    affixPicks: mergeCounts(rows, 'affixPicks'), gearFired: mergeCounts(rows, 'gearFired'),
    statuses: mergeCounts(rows, 'statuses'), dtypes: mergeCounts(rows, 'dtypes'),
    skillUses: mergeCounts(rows, 'skillUses'), dmgByClass: mergeCounts(rows, 'dmgByClass'),
    dmgBySource: mergeCounts(rows, 'dmgBySource'), statusRoundsBy: mergeCounts(rows, 'statusRoundsBy'),
    wornAffix: mergeCounts(rows, 'wornAffix'), wornUnique: mergeCounts(rows, 'wornUnique'),
    wornSet: mergeCounts(rows, 'wornSet'), wornRarity: mergeCounts(rows, 'wornRarity'),
    wornLegendary: mergeCounts(rows, 'wornLegendary'), uniquesFound: mergeCounts(rows, 'uniquesFound'),
    actsCleared: avg(rows.map(r => r.actsCleared || 0)),
    clearedAct: Object.fromEntries([1, 2, 3, 4, 5, 6].map(a => [a, rows.filter(r => r.clearedActs?.[a] || r.won && a === 6).length])),
    curve: actCurve(rows), snap: actSnaps(rows), crossings: crossingTotals(rows),
    byAct,
  };
}
/** Per-act difficulty curve: fight length, what a fight costs the party, and what it is worth. */
function actCurve(rows) {
  const out = {};
  for (let a = 1; a <= 6; a++) {
    const parts = rows.map(r => r.byAct[a]).filter(Boolean);
    if (!parts.length) continue;
    const S = k => sum(parts.map(p => p[k] || 0));
    const fights = S('fights') || 1;
    out[a] = {
      runs: parts.length, fights: S('fights'), rounds: S('rounds') / fights,
      hpLost: 100 * S('hpLostFrac') / fights, foeHp: S('foeHp') / fights, foeDps: S('foeDps') / fights,
      gear: S('gearScore') / fights, dmgDealt: S('dmgDealt') / fights, dmgTaken: S('dmgTaken') / fights,
      statusRounds: S('statusRounds') / fights, heroStatusRounds: S('heroStatusRounds') / fights,
      gold: S('gold') / fights, xp: S('xp') / fights, drops: S('drops') / fights, wipes: S('wipes'),
      wipeRate: 100 * S('wipes') / fights,
      rarity: parts.reduce((o, p) => { for (const [k, v] of Object.entries(p.rarity || {})) o[k] = (o[k] || 0) + v; return o; }, {}),
    };
  }
  return out;
}
/** Where the party stood the day it walked into each act. */
function actSnaps(rows) {
  const out = {};
  for (let a = 1; a <= 6; a++) {
    const parts = rows.map(r => r.actSnap[a]).filter(Boolean);
    if (!parts.length) continue;
    out[a] = { runs: parts.length, day: avg(parts.map(p => p.day)), level: avg(parts.map(p => p.level)),
      gold: avg(parts.map(p => p.gold)), xp: avg(parts.map(p => p.xp)), gear: avg(parts.map(p => p.gear)) };
  }
  return out;
}
function crossingTotals(rows) {
  const t = { tried: 0, passed: 0, failed: 0, blocked: 0, fights: 0, days: 0, byId: {} };
  for (const r of rows) { const c = r.crossings || {}; for (const k of ['tried', 'passed', 'failed', 'blocked', 'fights', 'days']) t[k] += c[k] || 0;
    for (const [id, v] of Object.entries(c.byId || {})) { const b = t.byId[id] ||= { tried: 0, passed: 0 }; b.tried += v.tried; b.passed += v.passed; } }
  return t;
}

function md(s, f, extra = {}) {
  const L = [];
  L.push(`# Emberveil 2 — simulation report`);
  L.push('');
  L.push(`${s.runs} runs · seed ${f.seed} · day cap ${f.days} · generated ${new Date().toISOString().slice(0, 10)}`);
  L.push('');
  L.push(`Run it again with \`node tools/sim-emberveil.mjs --runs ${f.runs} --seed ${f.seed}\`.`);
  L.push('');
  L.push('## Headline');
  L.push('');
  L.push('| number | value |');
  L.push('|---|---|');
  L.push(`| full clears (all six acts) | ${f1(s.winRate)}% |`);
  L.push(`| act reached on average | ${f1(s.reachedAct)} |`);
  L.push(`| fights per run | ${f1(s.fights)} |`);
  L.push(`| rounds per fight | ${f1(s.rounds)} |`);
  L.push(`| party wipes per run | ${f1(s.deaths)} |`);
  L.push(`| average day of a wipe | ${f1(s.deathDay)} |`);
  L.push(`| days survived | ${f1(s.days)} |`);
  L.push(`| hero level at the end | ${f1(s.level)} |`);
  L.push(`| gold in hand at the end | ${Math.round(s.gold)} |`);
  L.push(`| nights with no food | ${f1(s.starve)}% of rests |`);
  L.push(`| night raids that wiped the party | ${f1(s.nightDeath)}% |`);
  L.push(`| acts cleared per run | ${f1(s.actsCleared)} |`);
  L.push(`| crossings passed | ${pct(s.crossings.passed, s.crossings.tried)} of ${s.crossings.tried} |`);
  L.push('');
  L.push('## Per act: cleared, stalled, wiped');
  L.push('');
  L.push('"Cleared" means the act boss went down and the party walked on. "Stalled" is a run that ended in that act.');
  L.push('');
  L.push('| act | runs that got there | cleared it | stalled there | wipes in that act | wipes per 100 fights |');
  L.push('|---|---|---|---|---|---|');
  for (let a = 1; a <= 6; a++) {
    const got = (s.curve[a]?.runs) || 0; const cl = s.clearedAct[a] || 0;
    L.push(`| ${a} | ${got} | ${cl} (${pct(cl, s.runs)}) | ${(s.byAct[a] || []).length} | ${s.deathActs[a] || 0} | ${f1(s.curve[a]?.wipeRate || 0)} |`);
  }
  L.push('');
  L.push('## The difficulty curve');
  L.push('');
  L.push('One line per act: how long a fight runs, what share of the party\'s health bar it costs, how much enemy');
  L.push('HP and how much enemy damage-per-round the party is facing, and how good the gear on their backs is.');
  L.push('');
  L.push('| act | rounds per fight | party HP lost per fight | enemy HP per fight | enemy dmg/round | avg equipped item score | damage dealt | damage taken |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const a of Object.keys(s.curve).sort()) { const c = s.curve[a];
    L.push(`| ${a} | ${f1(c.rounds)} | ${f1(c.hpLost)}% | ${Math.round(c.foeHp)} | ${Math.round(c.foeDps)} | ${Math.round(c.gear)} | ${Math.round(c.dmgDealt)} | ${Math.round(c.dmgTaken)} |`); }
  L.push('');
  L.push('## Level and purse at each act boundary');
  L.push('');
  L.push('`xp table` is the XP the party actually holds against the XP the table wants for the level it is on —');
  L.push('over 100% means they are ahead of the curve and will level again soon.');
  L.push('');
  L.push('| act | runs | day it started | party level | xp held | xp for that level | gold | avg equipped item score |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const a of Object.keys(s.snap).sort()) { const n = s.snap[a]; const want = xpForLevel(Math.max(1, Math.round(n.level)));
    L.push(`| ${a} | ${n.runs} | ${f1(n.day)} | ${f1(n.level)} | ${Math.round(n.xp)} | ${want} | ${Math.round(n.gold)} | ${Math.round(n.gear)} |`); }
  L.push('');
  L.push('## Loot per act');
  L.push('');
  L.push('| act | gold per fight | xp per fight | drops per fight | normal | magic | rare | legendary |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const a of Object.keys(s.curve).sort()) { const c = s.curve[a]; const r = c.rarity || {};
    L.push(`| ${a} | ${f1(c.gold)} | ${f1(c.xp)} | ${(c.drops).toFixed(2)} | ${r.normal || 0} | ${r.magic || 0} | ${r.rare || 0} | ${r.legendary || 0} |`); }
  L.push('');
  L.push('## Crossings');
  L.push('');
  const cx = s.crossings;
  L.push(`${cx.tried} crossings attempted · **${pct(cx.passed, cx.tried)} passed** · ${cx.failed} failed · ${cx.blocked} with no way through · ${cx.fights} ended in a fight · ${cx.days} days spent.`);
  L.push('');
  L.push('| crossing | attempts | passed |');
  L.push('|---|---|---|');
  for (const [id, v] of Object.entries(cx.byId).sort((a, b) => b[1].tried - a[1].tried)) L.push(`| ${id} | ${v.tried} | ${pct(v.passed, v.tried)} |`);
  L.push('');
  L.push('## Damage by source');
  L.push('');
  const srcTot = sum(Object.values(s.dmgBySource));
  L.push('| source | share of hero damage |');
  L.push('|---|---|');
  for (const [k, v] of topN(s.dmgBySource, 8)) L.push(`| ${k} | ${pct(v, srcTot)} |`);
  L.push('');
  L.push('## Where runs end');
  L.push('');
  L.push('| act | runs that got no further | wipes in that act |');
  L.push('|---|---|---|');
  for (let a = 1; a <= 6; a++) L.push(`| ${a} | ${(s.byAct[a] || []).length} | ${s.deathActs[a] || 0} |`);
  L.push('');
  L.push('## What kills the party');
  L.push('');
  L.push('| kind of fight | wipes | share |');
  L.push('|---|---|---|');
  const dTot = sum(Object.values(s.deathBy));
  for (const [k, v] of topN(s.deathBy, 8)) L.push(`| ${k} | ${v} | ${pct(v, dTot)} |`);
  L.push('');
  L.push('| enemy holding the field | wipes |');
  L.push('|---|---|');
  for (const [k, v] of topN(s.deathByEnemy, 10)) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push('## Fight length by act');
  L.push('');
  L.push('| act | rounds per fight |');
  L.push('|---|---|');
  const rByAct = {}; for (const r of extra.rows || []) for (const [a, list] of Object.entries(r.roundsByAct)) (rByAct[a] ||= []).push(...list);
  for (const a of Object.keys(rByAct).sort()) L.push(`| ${a} | ${f1(avg(rByAct[a]))} |`);
  L.push('');
  L.push('## Damage share by class');
  L.push('');
  const dmgTot = sum(Object.values(s.dmgByClass));
  L.push('| class | share of all damage |');
  L.push('|---|---|');
  for (const [k, v] of topN(s.dmgByClass, 12)) L.push(`| ${k} | ${pct(v, dmgTot)} |`);
  L.push('');
  L.push('## Skills the bot leans on');
  L.push('');
  L.push('| skill | hits recorded |');
  L.push('|---|---|');
  for (const [k, v] of topN(s.skillUses, 10)) L.push(`| ${k} | ${v} |`);
  const least = Object.entries(s.skillUses).sort((a, b) => a[1] - b[1]).slice(0, 6);
  if (least.length) { L.push(''); L.push(`Least used of the ones that fired at all: ${least.map(([k, v]) => `${k} (${v})`).join(', ')}.`); }
  L.push('');
  L.push('## Statuses and damage types');
  L.push('');
  L.push('| status applied | times |');
  L.push('|---|---|');
  for (const [k, v] of topN(s.statuses, 30)) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push('| status | rounds of uptime it bought | per fight |');
  L.push('|---|---|---|');
  const fightsAll = sum(Object.values(s.curve).map(c => c.fights)) || 1;
  for (const [k, v] of topN(s.statusRoundsBy, 12)) L.push(`| ${k} | ${v} | ${f1(v / fightsAll)} |`);
  L.push('');
  L.push('| act | status rounds on enemies per fight | on the party per fight |');
  L.push('|---|---|---|');
  for (const a of Object.keys(s.curve).sort()) L.push(`| ${a} | ${f1(s.curve[a].statusRounds)} | ${f1(s.curve[a].heroStatusRounds)} |`);
  L.push('');
  const never = [...STATUS_NAMES].filter(k => !s.statuses[k]);
  if (never.length) { L.push(''); L.push(`Never applied in these runs: ${never.join(', ')}.`); }
  L.push('');
  L.push('| damage type | total dealt |');
  L.push('|---|---|');
  const dtTot = sum(Object.values(s.dtypes));
  for (const [k, v] of topN(s.dtypes, 14)) L.push(`| ${k} | ${pct(v, dtTot)} |`);
  L.push('');
  L.push('## Gear');
  L.push('');
  L.push('| base picked up and worn | times |');
  L.push('|---|---|');
  for (const [k, v] of topN(s.itemPicks, 12)) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push('| road-weapon property equipped | times |');
  L.push('|---|---|');
  const road = Object.fromEntries(Object.entries(s.affixPicks).filter(([k]) => ROAD_STATS.has(k)));
  for (const [k, v] of topN(road, 30)) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push('| affix on worn gear at the end of the run | runs |');
  L.push('|---|---|');
  for (const [k, v] of topN(s.wornAffix, 14)) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push('| rarity of worn gear at the end | pieces |');
  L.push('|---|---|');
  for (const [k, v] of topN(s.wornRarity, 5)) L.push(`| ${k} | ${v} (${pct(v, sum(Object.values(s.wornRarity)))}) |`);
  if (Object.keys(s.wornUnique).length) { L.push(''); L.push('| unique worn at the end | runs |'); L.push('|---|---|');
    for (const [k, v] of topN(s.wornUnique, 12)) L.push(`| ${k} | ${v} |`); }
  if (Object.keys(s.wornLegendary).length) { L.push(''); L.push('| legendary power carried at the end | runs |'); L.push('|---|---|');
    for (const [k, v] of topN(s.wornLegendary, 12)) L.push(`| ${k} | ${v} |`); }
  if (Object.keys(s.wornSet).length) { L.push(''); L.push('| set piece worn at the end | pieces |'); L.push('|---|---|');
    for (const [k, v] of topN(s.wornSet, 8)) L.push(`| ${k} | ${v} |`); }
  L.push('');
  L.push('| older conditional affix equipped | times |');
  L.push('|---|---|');
  for (const [k, v] of topN(Object.fromEntries(Object.entries(s.affixPicks).filter(([k]) => !ROAD_STATS.has(k))), 10)) L.push(`| ${k} | ${v} |`);
  if (Object.keys(s.gearFired).length) {
    L.push('');
    L.push('| road property that actually fired (rest / travel / victory) | times |');
    L.push('|---|---|');
    for (const [k, v] of topN(s.gearFired, 20)) L.push(`| ${k} | ${v} |`);
  }
  if (extra.classMatrix) {
    L.push('');
    L.push('## Class matrix');
    L.push('');
    L.push('Each class dropped into a random party of four starting at the head of the act, on the same seeds as a');
    L.push('control party with nobody forced. The number is **fights won before the run gave up** (two wipes, 30 days);');
    L.push('the control line at the bottom is what a random party manages on those seeds.');
    L.push('');
    L.push('| class | ' + extra.matrixActs.map(a => `act ${a} won`).join(' | ') + ' | act-3 damage share |');
    L.push('|---|' + extra.matrixActs.map(() => '---').join('|') + '|---|');
    const sorted = Object.entries(extra.classMatrix).sort((x, y) => sum(extra.matrixActs.map(a => y[1][a].won)) - sum(extra.matrixActs.map(a => x[1][a].won)));
    for (const [c, row] of sorted) L.push(`| ${c} | ` + extra.matrixActs.map(a => f1(row[a]?.won ?? 0)).join(' | ') + ` | ${f1(row[3]?.share ?? 0)}% |`);
    L.push(`| **control (random party)** | ` + extra.matrixActs.map(a => `**${f1(extra.control[a].won)}**`).join(' | ') + ' | — |');
  }
  if (extra.weaponMatrix) {
    L.push('');
    L.push('## Weapon matrix (the road weapons)');
    L.push('');
    L.push('One hero in a party of four starts the act carrying it, on the same seeds as the control party above.');
    L.push('"lift" is fights won minus what a control party managed in the **same** act on the same seeds — positive means the weapon helped.');
    L.push('');
    L.push('Control: ' + [1, 2, 3, 4, 5].map(a => `act ${a} ${f1(extra.control[a].won)}`).join(' · ') + ' fights won.');
    L.push('');
    L.push('| weapon | act | fights won | lift vs control | rounds per fight | wipes per run |');
    L.push('|---|---|---|---|---|---|');
    for (const r of extra.weaponMatrix) L.push(`| ${r.weapon} | ${r.act} | ${f1(r.won)} | ${r.lift >= 0 ? '+' : ''}${f1(r.lift)} | ${f1(r.rounds)} | ${f1(r.deaths)} |`);
  }
  L.push('');
  return L.join('\n');
}

// ── main ──────────────────────────────────────────────────────────────────────────────────
const f = flags(process.argv.slice(2));
const t0 = Date.now();
const rows = [];
for (let i = 0; i < f.runs; i++) rows.push(runOnce(f.seed + i * 7919, { startAct: f.act, forceClass: f.class, days: f.days }));
const s = summarise(rows, 'main');
const extra = { rows };

if (f.matrix) {
  // "Cleared the whole act" saturates at act 1 and floors at act 5, so the matrices score progress
  // instead: how many fights a party wins before it gives up (three wipes) inside a fixed window.
  const acts = [1, 3, 5]; extra.matrixActs = acts;
  const per = Math.max(5, Math.round(f.runs / 28));
  const short = { days: 20, maxWipes: 2 };
  const seedFor = (i, a) => f.seed + i * 131 + a * 7919;
  const won = r => r.fights - r.deaths;
  // control: the same seeds with a random party and no forced anything
  const control = {};
  for (const a of [1, 2, 3, 4, 5]) { const r = []; for (let i = 0; i < per * (acts.includes(a) ? 3 : 1); i++) r.push(runOnce(seedFor(i, a), { startAct: a, ...short })); control[a] = { won: avg(r.map(won)), deaths: avg(r.map(x => x.deaths)), clear: 100 * r.filter(x => x.actReached > a || x.won).length / r.length }; }
  extra.control = control;
  extra.classMatrix = {};
  for (const c of CLASSES) {
    extra.classMatrix[c] = {};
    for (const a of acts) {
      const r = []; for (let i = 0; i < per; i++) r.push(runOnce(seedFor(i, a), { startAct: a, forceClass: c, ...short }));
      extra.classMatrix[c][a] = { won: avg(r.map(won)), clear: 100 * r.filter(x => x.actReached > a || x.won).length / r.length,
        share: 100 * sum(r.map(x => x.dmgByClass[c] || 0)) / Math.max(1, sum(r.map(x => sum(Object.values(x.dmgByClass))))) };
    }
  }
  const WEAPONS = JSON.parse(fs.readFileSync(path.join(EV, 'data', 'items.json'), 'utf8'));
  const roadBases = Object.entries(WEAPONS.weaponBases).filter(([, b]) => b.intrinsic?.length).map(([k, b]) => [k, b.minAct]);
  const roadUniques = WEAPONS.uniques.filter(u => u.look && u.act).map(u => [u.id, u.act]);
  extra.weaponMatrix = [];
  for (const [key, act] of [...roadBases, ...roadUniques]) {
    const a = Math.min(5, act); const r = [];
    for (let i = 0; i < per; i++) r.push(runOnce(seedFor(i, a), { startAct: a, forceWeapon: key, ...short }));
    const w = avg(r.map(won));
    extra.weaponMatrix.push({ weapon: key, act: a, won: w, lift: w - control[a].won,
      rounds: avg(r.flatMap(x => Object.values(x.roundsByAct).flat())), deaths: avg(r.map(x => x.deaths)) });
  }
  extra.weaponMatrix.sort((x, y) => y.lift - x.lift);
}

const text = md(s, f, extra);
if (f.report) { fs.mkdirSync(path.dirname(f.report), { recursive: true }); fs.writeFileSync(f.report, text); }
if (!f.quiet) console.log(text);
console.error(`\n${f.runs} runs in ${((Date.now() - t0) / 1000).toFixed(1)}s${f.report ? ` → ${f.report}` : ''}`);
