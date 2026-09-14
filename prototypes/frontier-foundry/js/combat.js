// Attacks and defence. The tower-defence half of the game.
//
// Threat is the clock: anything that pollutes or makes noise raises it, nests raise it, and it
// decays when you are quiet. The first wave arrives when either the grace timer runs out or threat
// crosses the threshold - whichever happens first. After that they come on a shrinking interval,
// every fifth one is a push from two sides, and every tenth can carry a boss.

import { flowField, costField } from './map.js';
import { damageAfterArmor, waveBudget, waveInterval, enemyScale } from './rules.js';
import { pull } from './production.js';
import { grantResearch } from './research.js';

const IDX = (map, x, y) => (y | 0) * map.width + (x | 0);
const centre = s => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });

/** Put a few nests on the map when a planet is first landed on. */
export function seedNests(game, count = null) {
  const table = game.data.nestTables[game.planet.archetype] || ['crawler_nest'];
  const n = count ?? Math.max(2, Math.round(game.map.width * game.map.height / 2600));
  const hq = game.hq();
  for (let k = 0; k < n * 4 && game.nests.length < n; k++) {
    const x = game.rng.int(4, game.map.width - 6), y = game.rng.int(4, game.map.height - 6);
    const i = IDX(game.map, x, y);
    if (!game.map.buildable[i]) continue;
    if (hq && Math.hypot(x - hq.x, y - hq.y) < 26) continue;
    if (game.nests.some(m => Math.hypot(m.x - x, m.y - y) < 16)) continue;
    const def = game.data.unit[game.rng.pick(table)];
    game.nests.push({ id: game.nextId++, type: def.id, def, x, y, hp: def.hp, maxHp: def.hp, alive: true, cd: def.spawns?.every || 60 });
  }
}

/** Threat accounting, and deciding when the next wave leaves. */
export function tickThreat(game, dt) {
  const cfg = game.data.waves.threat;
  const gained = game.pollution * cfg.perPollutionUnit + game.noise * cfg.perNoiseUnit + game.nests.filter(n => n.alive).length * cfg.perNestPerSecond * dt;
  game.threat = Math.max(0, game.threat + gained - cfg.decayPerSecond * dt);
  game.pollution = 0; game.noise = 0;                       // both are per-tick accumulators

  if (game.threat > 300 && !game.flags.threatWarned) { game.flags.threatWarned = true; game.notify('threat_rising', { n: Math.round(game.threat) }); }

  const W = game.data.waves;
  if (game.nextWaveAt == null) {
    const grace = W.grace[game.difficulty] ?? W.grace.normal;
    const thr = W.firstThreatThreshold[game.difficulty] ?? W.firstThreatThreshold.normal;
    if (game.time >= grace || game.threat >= thr) game.nextWaveAt = game.time;
  }
  if (game.nextWaveAt != null && game.time >= game.nextWaveAt && !game.flags.noWaves) {
    spawnWave(game);
    game.nextWaveAt = game.time + waveInterval(game.waveNumber, W.interval, game.rng);
  }
}

/** Pick which enemies a wave is made of, inside its threat budget. */
export function waveComposition(game, waveNumber, budget) {
  const table = (game.data.waveTables[game.planet.archetype] || game.data.waveTables.temperate)
    .filter(e => waveNumber >= e.from);
  const out = [];
  let left = budget;
  if (waveNumber % (game.data.waves.escalation.bossEvery || 10) === 0) {
    const boss = table.find(e => game.data.unit[e.unit]?.boss);
    if (boss) { out.push(boss.unit); left -= game.data.unit[boss.unit].threat; }
  }
  const pool = table.filter(e => !game.data.unit[e.unit]?.boss);
  if (!pool.length) return out;
  let guard = 0;
  while (left > 0 && guard++ < 400) {
    const pick = game.rng.weighted(pool, e => e.weight);
    const def = game.data.unit[pick.unit];
    if (!def || def.threat > left) {
      const cheap = pool.map(e => game.data.unit[e.unit]).filter(d => d && d.threat <= left);
      if (!cheap.length) break;
      const d = game.rng.pick(cheap);
      out.push(d.id); left -= d.threat;
      continue;
    }
    out.push(def.id); left -= def.threat;
  }
  return out;
}

/** Where a wave walks in from: the edge nearest your noisiest cluster. */
function pickEdge(game, offset = 0) {
  const done = game.structures.filter(s => s.state === 'done');
  const hq = game.hq();
  const cx = done.length ? done.reduce((a, s) => a + s.x, 0) / done.length : (hq?.x ?? game.map.width / 2);
  const cy = done.length ? done.reduce((a, s) => a + s.y, 0) / done.length : (hq?.y ?? game.map.height / 2);
  const m = game.data.waves.spawning.edgeMargin;
  const sides = [
    { name: 'north', x: Math.round(cx), y: m, d: cy },
    { name: 'south', x: Math.round(cx), y: game.map.height - 1 - m, d: game.map.height - cy },
    { name: 'west', x: m, y: Math.round(cy), d: cx },
    { name: 'east', x: game.map.width - 1 - m, y: Math.round(cy), d: game.map.width - cx },
  ].sort((a, b) => a.d - b.d);
  return sides[offset % sides.length];
}

/** What the wave walks towards. */
export function pickTarget(game, prefs = []) {
  const done = game.structures.filter(s => s.state === 'done');
  if (!done.length) return null;
  const w = game.data.waves.targeting.weights;
  const hq = game.hq();
  let best = null, bestScore = -Infinity;
  for (const s of done) {
    let score = 0;
    if (s === hq) score += w.hqBonus;
    for (const p of prefs) {
      if (p === 'hq' && s === hq) score += w.prefMatch;
      else if (p === 'structure') score += w.prefMatch * 0.3;
      else if (p === 'storage' && s.cap > 0) score += w.prefMatch;
      else if (p === 'power' && (s.def.powerGen || s.def.powerStore)) score += w.prefMatch;
      else if (p === 'turret' && s.def.dps) score += w.prefMatch;
      else if (p === 'wall' && s.def.blocks) score += w.prefMatch * 0.5;
    }
    score += (game.rng() - 0.5) * 8;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

/** Send one wave. */
export function spawnWave(game, { budget = null, fronts = null } = {}) {
  game.waveNumber++;
  const W = game.data.waves;
  const b = budget ?? waveBudget(game.waveNumber, game.threat, { ...W.budget, surgeEvery: W.escalation.surgeEvery }, game.difficulty)
    * (game.waveNumber % W.escalation.surgeEvery === 0 ? W.escalation.surgeMultiplier : 1);
  const nFronts = fronts ?? (game.waveNumber % W.escalation.surgeEvery === 0 ? W.escalation.surgeFronts : 1);
  const comp = waveComposition(game, game.waveNumber, b);
  if (!comp.length) return null;
  const scale = enemyScale(game.waveNumber, W.escalation);
  const wave = { n: game.waveNumber, spawned: 0, killed: 0, target: null, field: null, at: game.time, lostAt: game.stats.lost };
  const prefs = [...new Set(comp.map(id => game.data.unit[id].targetPref).filter(Boolean))];
  wave.target = pickTarget(game, prefs)?.id ?? null;
  for (let f = 0; f < nFronts; f++) {
    const edge = pickEdge(game, f);
    const slice = comp.filter((_, i) => i % nFronts === f);
    for (const id of slice) {
      const def = game.data.unit[id];
      const e = {
        id: game.nextId++, type: id, def, wave: game.waveNumber, alive: true,
        x: Math.max(1, Math.min(game.map.width - 2, edge.x + game.rng.int(-6, 6))),
        y: Math.max(1, Math.min(game.map.height - 2, edge.y + game.rng.int(-6, 6))),
        hp: def.hp * scale.hp * game.diff.enemyHp, maxHp: def.hp * scale.hp * game.diff.enemyHp,
        armor: (def.armor || 0) + scale.armor, dps: def.dps * game.diff.enemyDps,
        speed: (def.speed || 1) * scale.speed, air: !!def.air, target: wave.target, cd: 0, slow: 0,
      };
      game.enemies.push(e);
      wave.spawned++;
    }
    game.notify('wave_incoming', { wave: game.waveNumber, n: slice.length, name: edge.name, at: { x: edge.x, y: edge.y } });
  }
  game.waves.push(wave);
  game.currentWave = wave;
  game.emit('wave:started', wave);
  return wave;
}

/** The cost grid enemies plan on: walls are expensive but not impossible, so they head for gaps. */
export function enemyCost(game) {
  const map = game.map;
  map.blocking = game.blocking;
  const cost = costField(map, { blockedCost: 30, waterCost: Infinity });
  return cost;
}

function refreshField(game, wave) {
  const t = game.byId(wave.target);
  if (!t) { wave.target = pickTarget(game)?.id ?? null; }
  const tt = game.byId(wave.target);
  if (!tt) { wave.field = null; return; }
  wave.field = flowField(game.map, IDX(game.map, tt.x + (tt.w >> 1), tt.y + (tt.h >> 1)), enemyCost(game));
  wave.fieldAt = game.time;
}

/** One tick of everything hostile, then one tick of everything that shoots at it. */
export function tickCombat(game, dt) {
  // nests let wanderers out on their own clock between waves - a slow bleed rather than an attack
  const NEST = game.data.waves.nests || {};
  for (const nest of game.nests) {
    if (!nest.alive || !nest.def.spawns) continue;
    if (game.waveNumber < 1 || game.flags.noWaves) continue;   // nests stay quiet until the first wave
    nest.cd -= dt;
    if (nest.cd <= 0) {
      nest.cd = NEST.wanderEvery ?? nest.def.spawns.every;
      if (game.enemies.length < 400 && game.rng() < (NEST.wanderChance ?? game.data.waves.spawning.fromNestsChance)) {
        const def = game.data.unit[nest.def.spawns.unit];
        const target = pickTarget(game, [def.targetPref]);
        const count = NEST.wanderCount ?? nest.def.spawns.count;
        if (nest.known) game.notify('nest_wanderers', { n: count, at: { x: nest.x, y: nest.y } });
        for (let k = 0; k < count; k++) {
          game.enemies.push({
            id: game.nextId++, type: def.id, def, wave: 0, alive: true,
            x: nest.x + game.rng.int(-2, 2), y: nest.y + game.rng.int(-2, 2),
            hp: def.hp * game.diff.enemyHp, maxHp: def.hp * game.diff.enemyHp,
            armor: def.armor || 0, dps: def.dps * game.diff.enemyDps, speed: def.speed, air: !!def.air,
            target: target?.id ?? null, cd: 0, slow: 0,
          });
        }
      }
    }
  }

  const repath = game.data.waves.targeting.repathEvery;
  for (const wave of game.waves) {
    if (!game.enemies.some(e => e.alive && e.wave === wave.n)) continue;
    if (!wave.field || game.time - (wave.fieldAt || -1e9) > repath || !game.byId(wave.target)) refreshField(game, wave);
  }

  const slowFields = game.structures.filter(s => s.state === 'done' && s.def.slow && s.powered > 0.2);
  for (const e of game.enemies) {
    if (!e.alive) continue;
    e.slow = 0;
    for (const f of slowFields) if (Math.hypot(e.x - (f.x + f.w / 2), e.y - (f.y + f.h / 2)) <= f.def.range) e.slow = Math.max(e.slow, f.def.slow);
    const speed = e.speed * (1 - e.slow) * dt;
    let target = game.byId(e.target);
    if (!target || target.state !== 'done') { target = pickTarget(game, [e.def.targetPref]); e.target = target?.id ?? null; }
    if (!target) continue;
    const tc = centre(target);
    const d = Math.hypot(e.x - tc.x, e.y - tc.y);
    const reach = (e.def.range || 1) + Math.max(target.w, target.h) / 2;
    if (d <= reach) { hitStructure(game, e, target, dt); continue; }

    // something blocking in the way gets chewed on instead
    const blocker = blockerNear(game, e);
    if (blocker && !e.def.phasesWalls) { hitStructure(game, e, blocker, dt); continue; }

    if (e.air || e.def.phasesWalls) {
      e.x += (tc.x - e.x) / d * speed; e.y += (tc.y - e.y) / d * speed;
    } else {
      const wave = game.waves.find(w => w.n === e.wave);
      const field = wave?.field;
      const here = IDX(game.map, e.x, e.y);
      const next = field && field.next[here] >= 0 ? field.next[here] : -1;
      if (next >= 0) {
        const nx = next % game.map.width + 0.5, ny = ((next / game.map.width) | 0) + 0.5;
        const nd = Math.max(0.001, Math.hypot(nx - e.x, ny - e.y));
        e.x += (nx - e.x) / nd * Math.min(speed, nd); e.y += (ny - e.y) / nd * Math.min(speed, nd);
      } else { e.x += (tc.x - e.x) / d * speed * 0.6; e.y += (tc.y - e.y) / d * speed * 0.6; }
    }
    // enemies that go for crew will bite one on the way
    for (const u of game.units) {
      if (!u.alive) continue;
      if (Math.hypot(u.x - e.x, u.y - e.y) <= (e.def.range || 1) + 0.5) { hitUnit(game, e, u, dt); break; }
    }
  }

  tickTurrets(game, dt);
  tickGuards(game, dt);

  // clean up and close out finished waves
  const before = game.enemies.length;
  game.enemies = game.enemies.filter(e => e.alive);
  if (game.currentWave && before !== game.enemies.length) {
    const left = game.enemies.filter(e => e.wave === game.currentWave.n).length;
    if (left === 0 && game.currentWave.spawned > 0 && !game.currentWave.closed) {
      game.currentWave.closed = true;
      game.threat = Math.max(0, game.threat + game.data.waves.threat.waveCleared);
      const lostThisWave = game.stats.lost - (game.currentWave.lostAt ?? game.stats.lost);
      game.notify(lostThisWave > 0 ? 'wave_cleared' : 'wave_repelled', { wave: game.currentWave.n, n: game.currentWave.killed });
      game.emit('wave:cleared', game.currentWave);
      game.stats.wavesCleared++;
    }
  }
}

function blockerNear(game, e) {
  const map = game.map;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const x = Math.round(e.x) + dx, y = Math.round(e.y) + dy;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const id = map.occupied[IDX(map, x, y)];
    if (id >= 0 && game.blocking.has(id)) {
      const s = game.byId(id);
      if (s && s.state === 'done' && !(s.def.passableToOwn && false)) return s;
    }
  }
  return null;
}

/** Damage a building, letting a shield bubble soak it first. */
export function hitStructure(game, e, s, dt) {
  let dmg = e.dps * dt * (s.def.blocks && e.def.structureBonus ? e.def.structureBonus : 1);
  dmg = damageAfterArmor(dmg, (s.def.armor || 0) + (e.def.armorStrip ? -e.def.armorStrip : 0), 0);
  const shield = shieldFor(game, s);
  if (shield) {
    const soak = Math.min(shield.shield, dmg);
    shield.shield -= soak; dmg -= soak;
  }
  s.hp -= dmg;
  game.stats.damageTaken += dmg;
  if (s.hp <= 0) {
    const wasHq = s === game.hq();
    game.notify(s.def.blocks ? 'wall_breached' : 'structure_lost', { name: s.def.name, at: { x: s.x, y: s.y } });
    game.removeStructure(s.id, { refund: 0, reason: 'destroyed' });
    game.stats.lost++;
    if (wasHq) game.lose();
  }
}

function hitUnit(game, e, u, dt) {
  u.hp -= damageAfterArmor(e.dps * dt, u.def.armor || 0, 0);
  if (u.hp <= 0) {
    u.alive = false;
    game.units = game.units.filter(x => x.alive);
    game.stats.crewLost++;
    game.notify('unit_lost', { name: u.def.name, at: { x: u.x, y: u.y } });
  }
}

function shieldFor(game, s) {
  for (const g of game.structures) {
    if (g.state !== 'done' || !g.def.shieldPool || g.shield <= 0 || g.powered < 0.2) continue;
    if (Math.hypot(g.x - s.x, g.y - s.y) <= g.def.shieldRadius) return g;
  }
  return null;
}

/**
 * Note a shot so an interface can draw the tracer. Off by default: set `game.recordShots = true` and
 * read `game.shots` (a bounded list of `{ x1, y1, x2, y2, type, t }`, newest last). Costs nothing
 * when it is off, which is why the headless sim leaves it alone.
 */
export function recordShot(game, x1, y1, x2, y2, type = 'bullet') {
  if (!game.recordShots) return;
  const list = (game.shots ||= []);
  list.push({ x1, y1, x2, y2, type, t: game.time });
  if (list.length > 240) list.splice(0, list.length - 240);
}

/** Turrets acquire and fire. */
export function tickTurrets(game, dt) {
  if (!game.enemies.length) return;
  for (const t of game.structures) {
    if (t.state !== 'done' || !t.def.dps || !t.enabled) continue;
    const power = t.def.powerUse ? t.powered : 1;
    if (power < 0.15) continue;
    if (t.def.fuelInput) {
      let fuelled = false;
      for (const [res, perSec] of Object.entries(t.def.fuelInput)) { if (pull(game, t, res, perSec * dt) > 0) fuelled = true; }
      if (!fuelled) continue;
    }
    const c = centre(t);
    const inRange = [];
    for (const e of game.enemies) {
      if (!e.alive) continue;
      if (e.air && !t.def.hitsAir && t.def.range < 20 && !['energy'].includes(t.def.damageType)) continue;
      const d = Math.hypot(e.x - c.x, e.y - c.y);
      if (d > t.def.range) continue;
      if (t.def.minRange && d < t.def.minRange) continue;
      inRange.push({ e, d });
    }
    if (!inRange.length) continue;
    inRange.sort((a, b) => a.d - b.d);
    const targets = t.def.chain ? inRange.slice(0, t.def.chain) : [inRange[0]];
    for (const { e } of targets) {
      recordShot(game, c.x, c.y, e.x, e.y, t.def.damageType || 'bullet');
      damageEnemy(game, e, t.def.dps * dt * power, t);
      if (t.def.splash) for (const o of game.enemies) {
        if (o === e || !o.alive) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) <= t.def.splash) damageEnemy(game, o, t.def.dps * dt * power * 0.5, t);
      }
    }
    game.noise += game.data.waves.threat.turretFireNoise * dt * (t.def.noise ?? 1);
  }
  // one-shot mines
  for (const m of game.structures) {
    if (m.state !== 'done' || !m.def.oneShot) continue;
    const c = centre(m);
    const hit = game.enemies.find(e => e.alive && !e.air && Math.hypot(e.x - c.x, e.y - c.y) < 1.5);
    if (!hit) continue;
    for (const o of game.enemies) if (o.alive && Math.hypot(o.x - c.x, o.y - c.y) <= (m.def.splash || 2)) damageEnemy(game, o, m.def.damage, m);
    game.removeStructure(m.id, { refund: 0, reason: 'detonated' });
  }
}

/** Guards and sentinels shoot too. */
export function tickGuards(game, dt) {
  for (const u of game.units) {
    if (!u.alive || !u.def.dps || u.def.buildRate) continue;
    let best = null, bestD = Infinity;
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d <= (u.def.range || 5) && d < bestD) { bestD = d; best = e; }
    }
    if (best) { recordShot(game, u.x, u.y, best.x, best.y, 'bullet'); damageEnemy(game, best, u.def.dps * dt, u); }
  }
}

/** Apply damage to one enemy and clean up if it dies. */
export function damageEnemy(game, e, raw, source) {
  if (!e.alive) return 0;
  const dmg = damageAfterArmor(raw, e.armor, source?.def?.armorPierce || 0);
  e.hp -= dmg;
  game.stats.damageDealt += dmg;
  if (e.hp <= 0) {
    e.alive = false;
    game.stats.kills++;
    const w = game.waves.find(x => x.n === e.wave);
    if (w) w.killed++;
    game.emit('enemy:killed', { enemy: e, by: source?.id ?? null });
  }
  return dmg;
}

/** Shells and guards can also kill a nest. */
export function damageNest(game, nest, raw) {
  nest.hp -= damageAfterArmor(raw, nest.def.armor, 0);
  if (nest.hp <= 0 && nest.alive) {
    nest.alive = false;
    game.threat = Math.max(0, game.threat + game.data.waves.threat.nestKilled);
    game.stats.nestsKilled++;
    game.notify('nest_cleared', { at: { x: nest.x, y: nest.y } });
    // clearing one pays: salvage into the pod and a slug of free research work
    const bounty = game.data.waves.nests?.bounty || {};
    const hq = game.hq();
    const bits = [];
    if (hq) for (const [res, n] of Object.entries(bounty)) {
      hq.inv[res] = (hq.inv[res] || 0) + n;
      bits.push(`${n} ${game.data.resource[res]?.name || res}`);
    }
    const work = game.data.waves.nests?.research || 0;
    if (work) { grantResearch(game, work); bits.push(`${work} research`); }
    if (bits.length) game.notify('nest_bounty', { text: bits.join(', ') });
    game.emit('nest:cleared', nest);
  }
}

/** Artillery automatically shells nests it can reach. */
export function tickArtillery(game, dt) {
  for (const a of game.structures) {
    if (a.state !== 'done' || !a.def.dps || a.def.range < 30 || a.powered < 0.3) continue;
    const c = centre(a);
    const nest = game.nests.find(n => n.alive && Math.hypot(n.x - c.x, n.y - c.y) <= a.def.range);
    if (nest) damageNest(game, nest, a.def.dps * dt * 0.6);
  }
}

/** Shield bubbles refill between waves. */
export function tickShields(game, dt) {
  for (const g of game.structures) {
    if (g.state !== 'done' || !g.def.shieldPool || g.powered < 0.2) continue;
    g.shield = Math.min(g.def.shieldPool, (g.shield || 0) + g.def.shieldRegen * g.powered * dt);
  }
}
