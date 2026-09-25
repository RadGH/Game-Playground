#!/usr/bin/env node
// Farhold — the balance harness.
//
// Plays the real rules headlessly: the real terrain sampler, the real loot generator, the real
// levelling, the real bestiary, the real jobs and the real survey. No renderer, so a hundred runs
// take seconds and you can ask questions a play-test cannot answer — how long to level 10, what
// kills people, whether any biome has nothing living in it, whether the survey can be finished at
// all.
//
//   node prototypes/farhold/tools/sim-farhold.mjs                 # 60 runs, default seed
//   node prototypes/farhold/tools/sim-farhold.mjs --runs 200 --minutes 45 --out research/sim.md
//   node prototypes/farhold/tools/sim-farhold.mjs --why           # print what the bot did each step
//
// The bot is deliberately simple and consistent: it walks, it fights what it meets, it spends every
// point it earns, it re-equips anything better, and it takes work when it passes a town. It is a
// yardstick, not a good player.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { createWorld, makeTerrain, M_PER_CELL } from '../js/planet.js';
import { Rpg, xpForLevel, itemScore } from '../js/rpg.js';
import { makeQuest, QuestLog } from '../js/quests.js';
import { Campaign } from '../js/campaign.js';
import { makeRng } from '../../emberveil/js/rng.js';
import { familiesOf, BIOMES } from '../../../worldgen/js/biomes.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, '..', f), 'utf8'));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? (args[i + 1] ?? true) : fallback;
};
const RUNS = Number(flag('runs', 60));
const MINUTES = Number(flag('minutes', 30));
const SEED0 = Number(flag('seed', 1));
const VERBOSE = args.includes('--why');
const OUT = flag('out', null);

const items = JSON.parse(readFileSync(join(here, '../../emberveil/data/items.json'), 'utf8'));
const balance = read('data/balance.json');
const bestiary = read('data/enemies.json').enemies;
const talents = read('data/talents.json');
const campaignData = read('data/campaign.json');

/** One run: a character on a world, for `MINUTES` of game time. */
function play(seed) {
  const rng = makeRng(seed);
  const { planet, world, star } = createWorld({ seed, width: 128, height: 64 });
  const terrain = makeTerrain(world, planet, balance.terrain);
  const rpg = new Rpg(items, { ...balance, seed }, talents);
  const campaign = new Campaign(campaignData);
  const quests = new QuestLog();

  const player = rpg.createPlayer({ name: 'Bot', classId: 'ranger' });
  const starter = rpg.loot.generate('shortbow', 'normal', 'low', { rng });
  if (starter) rpg.equip(player, starter);

  const spawn = terrain.spawnPoint(rng);
  let x = spawn.x, z = spawn.z;
  const towns = (world.nodes || []).filter(n => n.type === 'settlement' || n.type === 'port');
  const visited = new Set();
  /** The nearest town not yet visited — what a player does, rather than picking one at random. */
  const nextTown = (fromX, fromZ) => {
    const pool = towns.filter(t => !visited.has(t.id));
    const list = (pool.length ? pool : towns)
      .map(t => ({ t, d: Math.hypot(t.x * M_PER_CELL - fromX, t.y * M_PER_CELL - fromZ) }))
      .sort((a, b) => a.d - b.d);
    return list.length ? list[0].t : null;
  };
  const log = [];
  const deaths = [];
  const biomesSeen = new Set();
  const milestones = {};

  const STEP = 4;                       // seconds of game time per tick
  const ticks = Math.round((MINUTES * 60) / STEP);
  const walkSpeed = () => player.derived.moveSpeed * 0.75;   // the bot does not sprint everywhere

  let target = nextTown(spawn.x, spawn.z);
  let fights = 0, wins = 0, fled = 0, goldSpent = 0, itemsWorn = 0;

  for (let t = 0; t < ticks; t++) {
    const minutes = (t * STEP) / 60;

    // ---- walk toward the current target
    if (target) {
      const tx = target.x * M_PER_CELL, tz = target.y * M_PER_CELL;
      const d = Math.hypot(tx - x, tz - z);
      const step = walkSpeed() * STEP;
      if (d <= step) {
        x = tx; z = tz;
        campaign.onEnterSettlement(target.id);
        visited.add(target.id);
        // take work, and hand in anything finished
        const q = makeQuest(['hunt', 'visit', 'gather', 'clear'][Math.floor(rng() * 4)], {
          rng, level: player.level, giver: { id: 't' + target.id, name: target.name },
          enemies: bestiary, nodes: world.nodes, terrain, from: target,
        });
        if (q && quests.active.length < 4) quests.add(q);
        for (const done of quests.readyToTurnIn('t' + target.id)) {
          const reward = quests.turnIn(done);
          player.gold += reward.gold;
          rpg.gainXp(player, reward.xp);
          campaign.onQuestDone(done, target.id);
        }
        // buy the best thing they have that beats what is worn
        const stock = Array.from({ length: 5 }, () => rpg.rollDrop({ level: player.level, rng, chance: 1 })).filter(Boolean);
        for (const item of stock) {
          const slot = item.type === 'weapon' ? 'weapon' : item.slot === 'ring1' ? 'ring' : item.slot;
          const price = rpg.price(item);
          if (itemScore(item) > itemScore(player.equipment[slot]) && player.gold >= price) {
            player.gold -= price; goldSpent += price;
            rpg.equip(player, item); itemsWorn++;
          }
        }
        // head for wherever there is finished work waiting, else somewhere new
        const owed = quests.active.find(q => q.done && !q.turnedIn);
        const owedTown = owed ? towns.find(t => 't' + t.id === owed.giverId) : null;
        target = owedTown || nextTown(x, z);
        if (VERBOSE) log.push(`${minutes.toFixed(0)}m reached a settlement, level ${player.level}`);
      } else {
        x += ((tx - x) / d) * step;
        z += ((tz - z) / d) * step;
        campaign.onWalk(step);
      }
    } else {
      x += (rng() - 0.5) * walkSpeed() * STEP;
      z += (rng() - 0.5) * walkSpeed() * STEP;
      campaign.onWalk(walkSpeed() * STEP);
    }
    [x, z] = terrain.clampToWorld(x, z);
    biomesSeen.add(terrain.biomeAt(x, z).key);

    // a finished job is worth walking back for
    if (t % 15 === 0) {
      const owed = quests.active.find(q => q.done && !q.turnedIn);
      if (owed) {
        const home = towns.find(tw => 't' + tw.id === owed.giverId);
        if (home) target = home;
      }
    }

    // ---- meet something
    const families = familiesOf(terrain.biomeIdAt(x, z));
    const pool = bestiary.filter(e =>
      ((e.biomes || ['any']).includes('any') || e.biomes.some(f => families.includes(f)))
      && (e.minLevel ?? 1) <= player.level + 2 && (e.maxLevel ?? 99) >= player.level - 2);
    if (pool.length && rng() < 0.55 && !terrain.underwater(x, z)) {
      const def = pool[Math.floor(rng() * pool.length)];
      const level = Math.max(1, player.level + Math.floor(rng() * 3) - 1);
      const enemy = rpg.makeEnemy(def, level, rng);
      fights++;
      // Fight on the clock, not in alternating turns. The player swings every `attackEvery`
      // (0.62s) and the enemy every `e.attackEvery` (1.3-2.2s), so a player gets two or three
      // blows for each one taken. Trading 1:1 made the sim four times deadlier than the game and
      // reported 150 deaths a run.
      const playerEvery = balance.player?.attackEvery ?? 0.62;
      let tp = playerEvery, te = enemy.attackEvery, clock = 0;
      while (enemy.hp > 0 && player.hp > 0 && clock < 90) {
        const next = Math.min(tp, te);
        clock += next; tp -= next; te -= next;
        if (tp <= 1e-6) { rpg.strike(player, enemy, rng); tp = playerEvery; }
        if (te <= 1e-6 && enemy.hp > 0) { rpg.strike(enemy, player, rng); te = enemy.attackEvery; }
        // a real player runs when it is going badly
        if (player.hp < player.maxHp * 0.3 && enemy.hp > enemy.maxHp * 0.5) break;
      }
      if (player.hp <= 0) {
        deaths.push({ by: def.id, name: def.name, level: player.level, minutes: +minutes.toFixed(1) });
        campaign.onDeath({ defId: def.id, name: def.name, level });
        player.hp = Math.round(player.maxHp * 0.5);
        player.gold = Math.round(player.gold * 0.9);
        x = spawn.x; z = spawn.z;
        if (VERBOSE) log.push(`${minutes.toFixed(0)}m killed by ${def.name}`);
      } else if (enemy.hp <= 0) {
        wins++;
        player.kills++;
        const levels = rpg.gainXp(player, enemy.xp);
        player.gold += enemy.gold;
        campaign.onKill(def.id);
        quests.onKill({ defId: def.id });
        rpg.onKillRestore(player);
        const drop = rpg.rollDrop({ level: enemy.level, rng, magicFind: player.derived.magicFind, bases: def.dropBases });
        if (drop) {
          campaign.onLoot(drop);
          quests.onLoot({ baseKey: drop.baseKey });
          const slot = drop.type === 'weapon' ? 'weapon' : drop.slot === 'ring1' ? 'ring' : drop.slot;
          if (itemScore(drop) > itemScore(player.equipment[slot])) { rpg.equip(player, drop); itemsWorn++; }
          else player.bag.push(drop);
        }
        if (levels && !milestones['level' + player.level]) milestones['level' + player.level] = +minutes.toFixed(1);
      } else {
        fled++;
      }
    }

    // ---- spend everything that is spendable
    while (player.pendingAttr) rpg.spendAttr(player, ['str', 'dex', 'int', 'con'][Math.floor(rng() * 4)]);
    while (player.pendingPassive) {
      const tree = rpg.passives(player).filter(n => n.rank < n.maxRank);
      if (!tree.length) break;
      rpg.spendPassive(player, tree[Math.floor(rng() * tree.length)].id);
    }
    while (player.pendingTalent) {
      const choices = rpg.talentChoices(player);
      if (!choices.length) break;
      rpg.takeTalent(player, choices[Math.floor(rng() * choices.length)].id);
    }

    // ---- rest
    player.hp = Math.min(player.maxHp, player.hp + player.derived.hpRegen * STEP);
    quests.onArrive({ x, z });
  }

  return {
    seed, planet: planet.name, archetype: planet.archetype, star: star.className,
    level: player.level, xp: player.xp, gold: player.gold, kills: player.kills,
    fights, wins, fled, deaths, goldSpent, itemsWorn,
    gearScore: Object.values(player.equipment).reduce((n, it) => n + itemScore(it), 0),
    bag: player.bag.length,
    biomes: [...biomesSeen],
    towns: towns.length,
    townsVisited: visited.size,
    walked: campaign.progress[(campaignData.objectives.find(o => o.kind === 'distance') || {}).id] || 0,
    campaign: campaign.share,
    objectives: campaign.list().filter(o => o.done).map(o => o.id),
    quests: quests.finished.length,
    milestones,
    passives: Object.keys(player.passiveRanks).length,
    talents: player.talents.length,
    log,
  };
}

// ---------------------------------------------------------------------------- run them

const runs = [];
const t0 = Date.now();
for (let i = 0; i < RUNS; i++) runs.push(play(SEED0 + i));
const ms = Date.now() - t0;

const avg = pick => runs.reduce((a, r) => a + pick(r), 0) / runs.length;
const med = pick => {
  const v = runs.map(pick).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};
const pct = f => Math.round(runs.filter(f).length / runs.length * 100);

const killers = {};
for (const r of runs) for (const d of r.deaths) killers[d.name] = (killers[d.name] || 0) + 1;
const topKillers = Object.entries(killers).sort((a, b) => b[1] - a[1]).slice(0, 8);

const biomeSeen = {};
for (const r of runs) for (const b of r.biomes) biomeSeen[b] = (biomeSeen[b] || 0) + 1;
const never = BIOMES.filter(b => !b.tags.includes('water')).map(b => b.key).filter(k => !biomeSeen[k]);

const objDone = {};
for (const r of runs) for (const id of r.objectives) objDone[id] = (objDone[id] || 0) + 1;

const lines = [];
const say = t => { lines.push(t); console.log(t); };

say(`# Farhold balance — ${RUNS} runs of ${MINUTES} game-minutes (seeds ${SEED0}–${SEED0 + RUNS - 1})`);
say('');
say(`Ran in ${(ms / 1000).toFixed(1)}s. The bot walks between settlements, fights what it meets, spends`);
say('every point it earns and wears anything better. It is a yardstick, not a good player.');
say('');
say('## Where a run ends up');
say('');
say('| | median | mean |');
say('|---|---:|---:|');
say(`| level | ${med(r => r.level)} | ${avg(r => r.level).toFixed(1)} |`);
say(`| kills | ${med(r => r.kills)} | ${avg(r => r.kills).toFixed(0)} |`);
say(`| gold | ${med(r => r.gold)} | ${avg(r => r.gold).toFixed(0)} |`);
say(`| gear score | ${med(r => r.gearScore)} | ${avg(r => r.gearScore).toFixed(0)} |`);
say(`| deaths | ${med(r => r.deaths.length)} | ${avg(r => r.deaths.length).toFixed(2)} |`);
say(`| jobs finished | ${med(r => r.quests)} | ${avg(r => r.quests).toFixed(1)} |`);
say(`| survey | ${(med(r => r.campaign) * 100).toFixed(0)}% | ${(avg(r => r.campaign) * 100).toFixed(0)}% |`);
say('');
say(`Runs that never died: **${pct(r => r.deaths.length === 0)}%**. Runs that died three or more times: **${pct(r => r.deaths.length >= 3)}%**.`);
say(`Fights won: **${Math.round(avg(r => r.wins) / Math.max(1, avg(r => r.fights)) * 100)}%** of those started.`);
say('');
say('## Time to level');
say('');
say('| level | median minutes | runs that got there |');
say('|---|---:|---:|');
for (const l of [5, 10, 15, 20, 25, 30]) {
  const got = runs.filter(r => r.milestones['level' + l] != null);
  if (!got.length) { say(`| ${l} | — | 0% |`); continue; }
  const times = got.map(r => r.milestones['level' + l]).sort((a, b) => a - b);
  say(`| ${l} | ${times[Math.floor(times.length / 2)]} | ${Math.round(got.length / runs.length * 100)}% |`);
}
say('');
say('## What kills people');
say('');
if (!topKillers.length) say('Nothing did. That is its own problem.');
else for (const [name, n] of topKillers) say(`- ${name} — ${n}`);
say('');
say('## The survey');
say('');
say('| objective | finished in |');
say('|---|---:|');
for (const o of campaignData.objectives) {
  say(`| ${o.name} | ${Math.round((objDone[o.id] || 0) / runs.length * 100)}% of runs |`);
}
say('');
say('## Coverage');
say('');
say(`Biomes walked across at least once: **${Object.keys(biomeSeen).length}**.`);
if (never.length) say(`Never once walked on: ${never.join(', ')}.`);
else say('Every land biome was walked on by somebody.');
say('');
say(`Passive nodes taken per run: ${avg(r => r.passives).toFixed(1)}. Talents: ${avg(r => r.talents).toFixed(1)}.`);
say('');
say('## Travel');
say('');
say(`Median ground covered: **${(med(r => r.walked) / 1000).toFixed(1)} km**. Settlements reached: **${med(r => r.townsVisited)}** of ${med(r => r.towns)} on the world.`);
say(`Runs that landed on a world with nobody on it: **${pct(r => r.towns === 0)}%** — there, the survey drops the objectives that need people (Campaign.fit).`);

say('');
say('## What this harness cannot do');
say('');
say('Read the zeroes above with these in mind — some of them are the bot, not the game:');
say('');
say('- **It never flies.** "Three worlds" needs the ship, and the bot only walks, so that line will');
say('  always read 0%. Interplanetary travel is covered by the browser tests instead.');
say('- **It never goes into a ruin.** A "clear" job sends it to a dungeon marker and it fights');
say('  whatever the biome spawns, so "Three ruins" is a bot limit too.');
say('- **It has no skill.** It stands and trades blows on the real attack clock and runs at 30%');
say('  health. It does not kite, retreat uphill, pick its fights or use terrain, so the win rate is');
say('  a floor, not a typical player.');
say('- **It buys from a rolled shop, not a real merchant**, because merchants live in the browser.');

if (VERBOSE) {
  say('');
  say('## What the first run did');
  for (const l of runs[0].log.slice(0, 40)) say(`- ${l}`);
}

if (OUT) {
  const path = resolve(here, '..', String(OUT));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n') + '\n');
  console.log(`\nwritten to ${path}`);
}
