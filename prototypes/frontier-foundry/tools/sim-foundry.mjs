#!/usr/bin/env node
// Headless balance run. Plays the real engine with the bot and prints what happened.
//
//   node prototypes/frontier-foundry/tools/sim-foundry.mjs --hours 8
//   node .../sim-foundry.mjs --seed 12 --hours 12 --planet volcanic --difficulty hard --why
//
// Flags:
//   --seed N            world seed (default 7)
//   --hours N           in-game hours to play (default 8)
//   --planet <name>     archetype: temperate arid frozen volcanic toxic verdant barren shattered oceanic gas_shrouded
//   --difficulty <d>    easy | normal | hard
//   --size N            local map edge in tiles (default 96)
//   --no-waves          turn attacks off, to look at the economy on its own
//   --quiet             only the summary
//   --why               after the run, print what every machine is waiting for

import { loadData } from '../js/data.js';
import { Game } from '../js/game.js';
import { Bot, PLAN } from '../js/ai.js';
import { makePlanet } from '../js/planets.js';

const argv = process.argv.slice(2);
const flag = (name, def = null) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v == null || v.startsWith('--') ? true : v;
};
const num = (name, def) => { const v = flag(name, null); return v == null ? def : Number(v); };

const seed = num('seed', 7);
const hours = num('hours', 8);
const size = num('size', 96);
const difficulty = String(flag('difficulty', 'normal'));
const archetype = flag('planet', null);
const quiet = !!flag('quiet', false);
const why = !!flag('why', false);
const noWaves = !!flag('no-waves', false);

const data = await loadData();
const planet = archetype ? makePlanet({ id: 'p1', seed, archetype: String(archetype), resourceTable: data.resources }) : null;
const game = Game.createSync({ seed, difficulty, data, size, planet: planet || undefined });
if (noWaves) game.flags.noWaves = true;
const bot = new Bot(game);

const marks = {};
const seconds = Math.round(hours * 3600);
const rows = [];
const t0 = Date.now();
let firstWave = null, firstRocketPart = null, rocketReady = null;

for (let t = 0; t < seconds; t++) {
  game.tick(1);
  bot.tick(1);
  if (firstWave == null && game.waveNumber >= 1) firstWave = game.time;
  if (firstRocketPart == null && (game.stats.produced.rocket_part || 0) > 0) firstRocketPart = game.time;
  if (rocketReady == null && game.space.rocketReady) rocketReady = game.time;
  if (t % 1800 === 0) rows.push(snapshot());
  if (game.lost) break;
}
rows.push(snapshot());

function snapshot() {
  const inv = game.inventory();
  return {
    t: game.time,
    built: game.structures.filter(s => s.state === 'done').length,
    gen: Math.round(game.stats.power.gen),
    use: Math.round(game.stats.power.use),
    tech: game.research.done.length,
    wave: game.waveNumber,
    threat: Math.round(game.threat),
    kills: game.stats.kills,
    lost: game.stats.lost,
    plate: Math.round(inv.iron_plate || 0),
    steel: Math.round(inv.steel_plate || 0),
    circuit: Math.round(inv.circuit || 0),
    packs: Math.round((inv.pack_basic || 0) + (inv.pack_logistics || 0) + (inv.pack_chem || 0)),
  };
}

const hms = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
const pad = (v, n) => String(v).padStart(n);

if (!quiet) {
  console.log(`\nFrontier Foundry - seed ${seed}, ${game.planet.name} (${game.planet.archetype}), ${difficulty}, ${hours}h, ${size}x${size}`);
  console.log(`rare elements: ${(game.planet.rareElements || []).join(', ') || 'none'} | hazards: ${(game.planet.hazards || []).join(', ') || 'none'}`);
  console.log('\n time  built  power      tech wave threat kills lostS  plate  steel circ packs');
  for (const r of rows) {
    console.log(` ${hms(r.t)} ${pad(r.built, 5)}  ${pad(r.gen, 5)}/${pad(r.use, 4)} ${pad(r.tech, 4)} ${pad(r.wave, 4)} ${pad(r.threat, 6)} ${pad(r.kills, 5)} ${pad(r.lost, 5)} ${pad(r.plate, 6)} ${pad(r.steel, 6)} ${pad(r.circuit, 4)} ${pad(r.packs, 5)}`);
  }
}

const st = game.rocketStatus();
console.log('\n--- headline ---');
console.log(`first attack        ${firstWave == null ? 'never' : hms(firstWave)}`);
console.log(`waves / cleared     ${game.waveNumber} / ${game.stats.wavesCleared}`);
console.log(`kills / crew lost   ${game.stats.kills} / ${game.stats.crewLost}`);
console.log(`structures          ${game.structures.filter(s => s.state === 'done').length} built, ${game.stats.lost} destroyed`);
console.log(`research            ${game.research.done.length} nodes (${game.research.current || 'idle'}${game.flags.researchStalled ? ', stalled on packs' : ''})`);
console.log(`power               ${Math.round(game.stats.power.gen)} kW generated, ${Math.round(game.stats.power.use)} kW drawn`);
console.log(`hauling             ${game.routes.length} routes, ${Math.round(game.stats.hauled)} units delivered`);
console.log(`regions explored    ${game.exploredRegions.length}`);
console.log(`quests done         ${game.quests.done.length}/${game.data.quests.length}`);
console.log(`satellites / probes ${game.space.satellites} / ${game.space.surveyed.length}`);
console.log(`rocket              ${st.parts}/${st.needed} sections${rocketReady ? `, assembled at ${hms(rocketReady)}` : st.hasPad ? ', pad standing' : ', no pad yet'}`);
console.log(`outcome             ${game.lost ? 'LOST at ' + hms(game.time) : game.won ? 'WON' : 'survived'}`);
console.log(`sim cost            ${Date.now() - t0} ms for ${hours}h of game time`);

if (why) {
  console.log('\n--- what everything is waiting for ---');
  const by = {};
  for (const s of game.structures.filter(s => s.state === 'done')) {
    const k = s.recipe || s.type;
    const e = by[k] ||= { n: 0, busy: 0, blocked: 0, off: 0, starved: new Set() };
    e.n++; if (s.busy) e.busy++; if (s.blocked) e.blocked++; if (!s.enabled) e.off++;
    if (s.starvedFor) e.starved.add(s.starvedFor);
  }
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].n - a[1].n)) {
    console.log(` ${k.padEnd(22)} x${pad(v.n, 3)}  running ${pad(v.busy, 3)}  output full ${pad(v.blocked, 3)}  throttled ${pad(v.off, 3)}  short of ${[...v.starved].join(', ') || '-'}`);
  }
  console.log('\n--- next things the bot wants ---');
  let shown = 0;
  for (const step of PLAN) {
    if (shown >= 8) break;
    const r = bot.doStep(step);
    if (r === 'done' || r === 'skip') continue;
    console.log(' ', JSON.stringify(step), '->', r);
    shown++;
  }
  console.log('\n--- nodes being worked ---');
  for (const n of game.map.nodes.filter(n => n.claimedBy != null)) console.log(` ${n.resource.padEnd(16)} ${Math.round(n.amount)}/${n.initial}`);
  console.log('\n--- last notifications ---');
  for (const n of game.notifications.filter(n => n.importance >= 4).slice(-10)) console.log(` ${hms(n.time)} ${n.text}`);
}
