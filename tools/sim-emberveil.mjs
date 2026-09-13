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
import { equip, refresh, derive, canUse, passiveTree, classSkills, mergeSkill } from '../prototypes/emberveil/js/rules.js';
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

/** One headless fight. Feeds the damage meter exactly the way the live game does. */
function runFight(g, enc, node, stats) {
  const heroes = g.fighters(); const foes = enc.enemies;
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
  stats.fights++; stats.rounds += C.round_; stats.roundsByAct[g.act] = (stats.roundsByAct[g.act] || []);
  stats.roundsByAct[g.act].push(C.round_);
  for (const [id, sk] of Object.entries(C.skillUses || {})) stats.skillUses[id] = (stats.skillUses[id] || 0) + sk;
  const won = C.result === 'win';
  if (won) { g.trackFight(C, enc, true); g.victory(node, enc); for (const h of g.party) spendPoints(g, h); }
  else {
    stats.deaths++; const killer = foes.find(e => e.alive) || foes[0];
    const kind = enc.named ? 'named' : node?.type === 'boss' ? 'boss' : enc.night ? 'night raid' : 'ordinary';
    stats.deathBy[kind] = (stats.deathBy[kind] || 0) + 1;
    stats.deathByEnemy[killer?.templateId || '?'] = (stats.deathByEnemy[killer?.templateId || '?'] || 0) + 1;
    stats.deathDays.push(g.day); stats.deathActs[g.act] = (stats.deathActs[g.act] || 0) + 1;
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
  while (g.day <= days && guard++ < 4000) {
    stats.actReached = Math.max(stats.actReached, g.act);
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
      } else if (res.kind === 'skillCheck') g.resolveSkillCheck(node);
      // everything else (lore, shrines, caches, dungeons, quiet nodes) is already applied by enter();
      // mark it done so the bot stops walking back to it
      if (!g.usedNodes.includes(key)) g.usedNodes.push(key);
    }
    for (const f of g.winGear || []) stats.gearFired[f.id] = (stats.gearFired[f.id] || 0) + 1;
    g.winGear = [];
    // bandage up between fights
    for (const h of g.party) if (h.alive && h.hp < h.maxHp * 0.4) g.useBandage(h);
    // boss down → next zone
    const nz = g.zone().nodes.find(n => n.type === 'boss');
    if (nz && g.isCleared(nz.id)) {
      const next = g.nextZoneId();
      if (!next) { stats.won = true; break; }
      if (g.unlockedZones.includes(next)) { g.enterZone(next); stats.actReached = Math.max(stats.actReached, g.act); continue; }
    }
    // hurt and poor? go and see a cleric before the next fight
    const town = g.zone().nodes.find(n => n.type === 'town');
    const wantTown = town && town.id !== g.nodeId && (partyHpFrac(g) < 0.45 || g.supplies.ration <= 1 || g.inventory.length > 14);
    const target = wantTown ? town.id : nextTarget(g);
    if (target == null) { const next = g.nextZoneId(); if (next && g.unlockedZones.includes(next)) { g.enterZone(next); continue; } break; }
    const step = pathTo(g.zone(), g.nodeId, target)?.[0];
    if (!step) { if (!g.usedNodes.includes(key)) g.usedNodes.push(key); if (target === g.nodeId) continue; break; }
    if (!g.canMove()) { if (!doRest(g, stats)) { wipes++; if (wipes >= maxWipes) break; } continue; }
    if (partyHpFrac(g) < 0.4 && !wantTown) { if (!doRest(g, stats)) { wipes++; if (wipes >= maxWipes) break; } continue; }
    if (!g.travel(step)) { if (!doRest(g, stats)) break; continue; }
    for (const fx of g.legGear || []) stats.gearFired[fx.id] = (stats.gearFired[fx.id] || 0) + 1;
  }
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
    byAct,
  };
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
