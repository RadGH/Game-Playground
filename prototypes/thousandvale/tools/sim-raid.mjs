#!/usr/bin/env node
// Thousandvale — DO THE TOWN GUARDS HOLD? (stream E, owner feedback 8 W1: "the starting town is being raided … I died
// before I had a chance to do anything. Where are the town guards?")
//
//   node tools/sim-raid.mjs                 every town raid in data/quests/events.json against that town's guard posts:
//                                           guards alone / with one player / with two / players with no guards
//   node tools/sim-raid.mjs --json
//   import { raidTable } from './sim-raid.mjs'      (tests/E/playtest8-guards.test.js pins the RULE in guards.json `hold`)
//
// THE RULE being measured (data/provinces/guards.json `hold`): the posted guards ALONE beat the first wave without
// losing the gate, and can NOT finish the whole raid inside its time limit; with players of the raid's level they
// can. "Strong enough to hold, weak enough that players matter."
//
// WHAT IS REAL: every body's health, armour, hit and swing time come out of the rules the game runs
// (js/rules/monster-ai.js spawnMonster for raiders and for the guard's reference body; a real level-N character with
// its starting kit and its measured basic-attack damage, js/rules/estimate.js measureBasic, for a player).
// WHAT IS A MODEL, in plain words (FIGHT below): everyone in reach swings all the time; raiders split evenly over the
// guards still standing and only turn on the players when `playerShare` of them peel off (or no guard is left); the
// defenders all hit the weakest raider; a guard that falls gets up after `respawnSec` at full health; a player who
// falls is out for `playerDownSec` (the walk back). No skills, no healing, no telegraphs — so players are UNDER-sold
// here, which is the safe side for "do players matter".
import { readFileSync } from 'node:fs';
import { loadRulesData } from '../js/rules/data.js';
import { createEngine } from '../js/rules/engine.js';
import { createRoomContext } from '../js/rules/room.js';
import { attachField } from '../js/rules/field.js';
import { flatTerrain } from '../js/rules/terrain-flat.js';
import { spawnMonster } from '../js/rules/monster-ai.js';
import { createCharacter } from '../js/rules/character.js';
import { measureBasic } from '../js/rules/estimate.js';
import { makeRng } from '../js/rules/rng.js';

const ROOT = new URL('../', import.meta.url);
const readJ = f => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8'));

export const FIGHT = Object.freeze({ dt: 0.25, playerShare: 0.25, playerDownSec: 40, waveGapSec: 8, playerClasses: ['warrior', 'ranger', 'pyromancer'] });

const cut = armor => 1 - Math.max(0, armor) / (100 + Math.max(0, armor));
const avg = d => (Array.isArray(d) ? (d[0] + d[1]) / 2 : +d || 0);

export async function raidTable({ guards = null, events = null, set = null } = {}) {
  const data = await loadRulesData(async u => JSON.parse(readFileSync(u, 'utf8')));
  const engine = createEngine(data, { seed: 11 });
  const room = createRoomContext({ id: 'raid', seed: 11, engine });
  attachField(room, { terrain: flatTerrain() });
  const G = { ...(guards || readJ('data/provinces/guards.json')) };
  if (set) G.rules = { ...G.rules, ...set };
  const EV = events || readJ('data/quests/events.json');
  const size = (EV.director && EV.director.size) || {};

  const body = (type, level, opts = {}) => {
    const def = engine.enemyDef(type) || engine.enemyDef('road_brigand');
    const u = room.run(() => spawnMonster(room.field, def, level, 0, 0, opts));
    // a monster's hit: its own rolled damage when the unit carries one, else the def's scaled the way its health was
    const scale = u.maxHp / (def.hp || u.maxHp);
    const hit = avg(u.dmg || u.damage) || avg(def.dmg) * (u.modDmg || 1) * Math.sqrt(scale);
    try { room.run(() => room.field.remove && room.field.remove(u)); } catch { /* scratch */ }
    return { hp: u.maxHp, armor: u.armor || 0, dps: hit / (u.attackEvery || 1.5), ranged: !!def.ranged };
  };
  const player = level => {
    const rows = FIGHT.playerClasses.map((cls, i) => { const p = createCharacter(engine, { id: 'p' + i + level, classId: cls, level, rng: makeRng(5 + i) }); const m = measureBasic(engine, p); return { hp: p.maxHp || (p.derived && p.derived.maxHp) || 100, armor: (p.derived && p.derived.armor) || 0, dps: m.dps }; });
    return { hp: rows.reduce((a, r) => a + r.hp, 0) / rows.length, armor: rows.reduce((a, r) => a + r.armor, 0) / rows.length, dps: rows.reduce((a, r) => a + r.dps, 0) / rows.length };
  };

  const out = [];
  for (const e of EV.realm.filter(x => x.site && x.site.settlement && Array.isArray(x.waves))) {
    const posts = G.posts.filter(p => p.town === e.site.settlement);
    const R = G.rules, lvl = (e.level || 1) + (R.levelOver || 0);
    const ref = body(R.reference || 'road_brigand', lvl);
    const guardOf = rank => { const k = (G.ranks && G.ranks[rank]) || {}; return { hp: ref.hp * R.hpMult * (k.hpMult || 1), armor: ref.armor + (R.armor || 0), dps: ref.dps * R.dmgMult * (k.dmgMult || 1), guard: true }; };
    const P = player(e.level || 1);
    const run = (nPlayers, withGuards = true) => {
      const def = [...(withGuards ? posts.map(p => ({ ...guardOf(p.rank), max: 0, down: 0 })) : []), ...Array.from({ length: nPlayers }, () => ({ ...P, player: true, down: 0 }))];
      for (const d of def) d.max = d.hp;
      const limit = (e.durationMinutes || 12) * 60;
      // waves at the size the director gives this many players (one extra add per addWavePerPlayers), then the boss
      const extra = Math.floor(nPlayers / (size.addWavePerPlayers || 2));
      const waves = e.waves.map(w => Array.from({ length: Math.round((w.count[0] + w.count[1]) / 2) + extra }, () => body(w.type, w.level || e.level, w.rank ? { rank: w.rank === 'elite' ? 'champion' : w.rank } : {})));
      const bossType = e.monster || (e.waves[e.waves.length - 1] || {}).type || 'brigand_captain';
      const boss = body(bossType, e.level || 1, { rank: 'champion', boss: true });
      boss.hp *= 1 + (size.healthPerPlayer || 0.35) * Math.max(0, nPlayers - 1);
      waves.push([boss]);
      let t = 0, wave1 = null, minGuards = def.filter(d => d.guard).length, wi = 0;
      const res = { players: nPlayers, guards: withGuards ? posts.length : 0 };
      for (; wi < waves.length; wi++) {
        const foes = waves[wi];
        while (foes.some(f => f.hp > 0)) {
          if (t >= limit) { res.won = false; res.why = 'time'; res.reached = wi + 1; res.sec = Math.round(t); res.minGuards = minGuards; res.wave1 = wave1; return res; }
          t += FIGHT.dt;
          for (const d of def) if (d.hp <= 0 && t >= d.down) d.hp = d.max;
          const up = def.filter(d => d.hp > 0), gUp = up.filter(d => d.guard), pUp = up.filter(d => d.player);
          minGuards = Math.min(minGuards, gUp.length);
          const live = foes.filter(f => f.hp > 0);
          // defenders: everyone on the weakest raider
          // (a guard's hit on the raid's CAPTAIN is multiplied by rules.vsBossMult: the captain is the players' to break)
          const isBoss = wi === waves.length - 1;
          let pool = up.reduce((a, d) => a + d.dps * (isBoss && d.guard ? (R.vsBossMult ?? 1) : 1), 0) * FIGHT.dt;
          for (const f of live.slice().sort((a, b) => a.hp - b.hp)) { if (pool <= 0) break; const need = f.hp / cut(f.armor); const use = Math.min(pool, need); f.hp -= use * cut(f.armor); pool -= use; }
          // raiders: spread over the guards; a share peel off onto the players (all of them when no guard stands)
          const total = live.reduce((a, f) => a + f.dps, 0) * FIGHT.dt;
          const toP = pUp.length ? (gUp.length ? total * FIGHT.playerShare : total) : 0, toG = gUp.length ? total - toP : 0;
          for (const d of gUp) { d.hp -= toG / gUp.length * cut(d.armor); if (d.hp <= 0) d.down = t + (R.respawnSec || 60); }
          for (const d of pUp) { d.hp -= toP / pUp.length * cut(d.armor); if (d.hp <= 0) d.down = t + FIGHT.playerDownSec; }
          if (!up.length && !def.some(d => d.guard) ) { /* players only and all down: they walk back */ }
        }
        if (wi === 0) wave1 = { sec: Math.round(t), guardsStanding: def.filter(d => d.guard && d.hp > 0).length, lowest: Math.round(Math.min(1, ...def.filter(d => d.guard).map(d => Math.max(0, d.hp) / d.max)) * 100) };
        t += FIGHT.waveGapSec;
      }
      res.won = true; res.sec = Math.round(t); res.minGuards = minGuards; res.wave1 = wave1; res.limit = limit;
      return res;
    };
    out.push({ id: e.id, name: e.name, town: e.site.settlement, level: e.level, limitSec: (e.durationMinutes || 12) * 60, posts: posts.length,
      guard: { level: lvl, ...Object.fromEntries(Object.entries(guardOf('guard')).filter(([k]) => k !== 'guard').map(([k, v]) => [k, Math.round(v * 10) / 10])) },
      raider: { ...Object.fromEntries(Object.entries(body(e.waves[0].type, e.waves[0].level || e.level)).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 10) / 10 : v])) },
      player: { hp: Math.round(P.hp), dps: Math.round(P.dps * 10) / 10 },
      alone: run(0), one: run(1), two: run(2), three: run(3), noGuardsOne: run(1, false), noGuardsTwo: run(2, false) });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const set = Object.fromEntries(process.argv.filter(a => a.startsWith('--set=')).map(a => { const [k, v] = a.slice(6).split('='); return [k, +v]; }));
  const rows = await raidTable({ set: Object.keys(set).length ? set : null });
  if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
  const show = r => (r.won ? `WON in ${Math.floor(r.sec / 60)}m${String(r.sec % 60).padStart(2, '0')}s` : `LOST (${r.why}, reached stage ${r.reached})`) + (r.guards ? `, fewest guards standing ${r.minGuards}/${r.guards}` : '');
  for (const r of rows) {
    console.log(`\n${r.name} — ${r.town}, level ${r.level}, limit ${r.limitSec / 60} min, ${r.posts} guards`);
    console.log(`  a guard: level ${r.guard.level}, ${r.guard.hp} health, ${r.guard.dps} damage a second   ·   a wave-1 raider: ${r.raider.hp} health, ${r.raider.dps} a second   ·   a player: ${r.player.hp} health, ${r.player.dps} a second (basic attacks only)`);
    console.log(`  wave 1, guards alone: cleared in ${r.alone.wave1 ? r.alone.wave1.sec + ' s, ' + r.alone.wave1.guardsStanding + '/' + r.posts + ' guards standing, weakest at ' + r.alone.wave1.lowest + '%' : 'never'}`);
    console.log(`  guards alone        ${show(r.alone)}`);
    console.log(`  guards + 1 player   ${show(r.one)}`);
    console.log(`  guards + 2 players  ${show(r.two)}`);
    console.log(`  guards + 3 players  ${show(r.three)}`);
    console.log(`  1 player, no guards ${show(r.noGuardsOne)}`);
    console.log(`  2 players, no guards ${show(r.noGuardsTwo)}`);
  }
}
