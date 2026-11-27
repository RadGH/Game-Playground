// Oathwild — one arena match on top of the combat sim (brainstorm 2026-11-27 §2c, §2g). Pure; the SAME code runs a
// match in the game (server/arena.js) and in the balance sim (tools/sim-arena.mjs), so what the sim measures is what
// players meet (lessons rule 81).
//
//   const M = createMatch(rules, world, { kind: 'waves', bracket, heroes: [unitId…], seed, place })
//   const M = createMatch(rules, world, { kind: 'champion', champion: 'hobb', heroes, seed, place })
//   matchInputs(world, M)          → { [championUnitId]: input }   (call BEFORE step: the champion's own step; its tell
//                                    events go straight into world.events so they leave with the step's events)
//   stepMatch(world, M, dt, events) → [arena events]   (call AFTER step with the step's events)
//   endMatch(world, M)             clears what is left (monsters of the match, the champion)
//   matchView(M, world)            the plain numbers the HUD shows (wave x/5, left, breather, gates, boss…)
//
// `place` = js/world/arena-place.js layout numbers: { centre:[x,z], gates:[{ id, name, at:[x,z], out:[x,z] }],
// heroAt:[x,z], champAt:[x,z] } — monsters walk out of a gate's mouth (`out`), the champion from its own gate.
// Events: { t:'arenaWave', wave, of, total, brute, boss } · { t:'arenaPack', gate, ids, brute, boss, names } ·
//         { t:'arenaBreather', seconds, next } · { t:'arenaWon' } · { t:'arenaLost' } · { t:'arenaStart', kind }
import { spawnMonster, addPlayer, removePlayer, refreshPlayer } from './combat.js';
import { makeRng } from './farhold.js';
import { wavePlan, arenaScale, championOf, championChar, championScale } from './arena.js';
import { championInput } from './hero-ai.js';

const AD = rules => rules.data.arena;

export function createMatch(rules, world, { kind = 'waves', bracket = null, champion = null, heroes = [], seed = 1, place }) {
  const C = AD(rules).match;
  const M = {
    kind, bracket, champion: champion ? championOf(rules, champion) : null, place, rng: makeRng(seed >>> 0),
    heroes: new Set(heroes), state: 'gather', t: 0, until: C.gather, wave: 0, of: C.waves, plan: null, queue: [],
    alive: new Set(), spawned: 0, killed: 0, champUnit: null, champMem: {}, startedAt: world.t, lastGate: null, result: null,
  };
  return M;
}

const heroCount = (world, M) => Math.max(1, [...M.heroes].filter(id => world.units.get(id)).length);
function standing(world, M) { return [...M.heroes].map(id => world.units.get(id)).filter(u => u && !u.downed); }

function spawnPack(world, M, pack) {
  const rules = world.rules, C = AD(rules).match;
  const gate = M.place.gates[pack.gate % M.place.gates.length];
  const ids = [], names = [];
  pack.monsters.forEach((m, i) => {
    const off = (i - (pack.monsters.length - 1) / 2) * 2.2;
    const gx = gate.out[0], gz = gate.out[1];
    // side by side across the gate's mouth
    const tx = -(gz - M.place.centre[1]), tz = gx - M.place.centre[0], tl = Math.hypot(tx, tz) || 1;
    const at = [gx + tx / tl * off, gz + tz / tl * off];
    const u = spawnMonster(world, m.id, m.level, at, { rank: m.rank, home: M.place.centre });
    if (!u) return;
    const k = arenaScale(rules, m.rank, heroCount(world, M));
    if (k.hp !== 1) { u.maxHp = Math.max(1, Math.round(u.maxHp * k.hp)); u.hp = u.maxHp; }
    if (k.dmg !== 1) u.dmg = u.dmg.map(v => Math.max(1, Math.round(v * k.dmg)));
    u.leash = C.leash; u.aggroRange = C.aggro; u.wander = 0; u.arena = true;
    u.facing = Math.atan2(M.place.centre[0] - at[0], M.place.centre[1] - at[1]);
    M.alive.add(u.id); ids.push(u.id); names.push(u.name);
    M.spawned++;
  });
  M.lastGate = gate.id;
  return { t: 'arenaPack', gate: gate.id, gateName: gate.name, at: gate.out, ids, brute: !!pack.brute, boss: !!pack.boss, names };
}

function startWave(world, M, out) {
  M.wave++;
  M.plan = wavePlan(world.rules, M.bracket, M.wave, { heroes: heroCount(world, M), rng: M.rng, gates: M.place.gates.length });
  M.queue = M.plan.packs.map(p => ({ ...p, due: M.t + p.after }));
  M.state = 'wave';
  out.push({ t: 'arenaWave', wave: M.wave, of: M.of, total: M.plan.total, brute: M.plan.brute, boss: M.plan.boss, level: M.plan.level });
}

function startBout(world, M, out) {
  const rules = world.rules;
  const c = M.champion;
  const char = championChar(rules, c.id);
  const u = addPlayer(world, char, { at: M.place.champAt });
  u.side = 'monsters';
  u.champion = c.id;
  u.name = `${c.name}, ${c.epithet}`;
  u.boost = championScale(rules, c, heroCount(world, M));
  refreshPlayer(world, u.id, { full: true });
  u.facing = Math.atan2(M.place.centre[0] - u.x, M.place.centre[1] - u.z);
  M.champUnit = u.id;
  M.state = 'bout';
  out.push({ t: 'arenaWave', wave: 1, of: 1, total: 1, champion: c.id, name: u.name });
  out.push({ t: 'arenaPack', gate: 'champion', gateName: 'the Champions\' Gate', at: M.place.champAt, ids: [u.id], champion: c.id, names: [u.name] });
}

/** The champion's input for this step (call before the sim step). */
export function matchInputs(world, M) {
  if (M.state !== 'bout' || !M.champUnit) return {};
  const u = world.units.get(M.champUnit);
  if (!u) return {};
  const CH = AD(world.rules).champions;
  const r = championInput(world, u, M.champMem, { tell: CH.tell, specialCooldown: CH.specialCooldown, dodgeSkill: M.champion.dodge ?? 0.3, keepIn: { x: M.place.centre[0], z: M.place.centre[1], r: AD(world.rules).match.floorRadius - 6 } });
  for (const e of r.events) world.events.push(e);
  return { [u.id]: r.input };
}

/** One step of the match after the sim's step (`events` = what the step said). → arena events. */
export function stepMatch(world, M, dt, events = []) {
  const out = [];
  if (M.state === 'won' || M.state === 'lost') return out;
  M.t += dt;
  for (const e of events) if (e.t === 'death' && M.alive.delete(e.who)) M.killed++;
  for (const id of [...M.alive]) if (!world.units.get(id)) M.alive.delete(id);
  // everyone in the match down (or gone): lost — keep what was earned, no chest
  if (M.state !== 'gather' && !standing(world, M).length) { M.state = 'lost'; M.result = 'lost'; out.push({ t: 'arenaLost' }); return out; }
  if (M.state === 'gather') {
    if (M.t >= M.until) { out.push({ t: 'arenaStart', kind: M.kind }); if (M.kind === 'champion') startBout(world, M, out); else startWave(world, M, out); }
    return out;
  }
  if (M.state === 'bout') {
    const u = world.units.get(M.champUnit);
    if (!u || u.downed) { M.state = 'won'; M.result = 'won'; out.push({ t: 'arenaWon', champion: M.champion.id }); }
    return out;
  }
  if (M.state === 'wave') {
    for (const p of M.queue) if (!p.out && M.t >= p.due) { p.out = true; out.push(spawnPack(world, M, p)); }
    M.queue = M.queue.filter(p => !p.out);
    if (!M.queue.length && !M.alive.size) {
      if (M.wave >= M.of) { M.state = 'won'; M.result = 'won'; out.push({ t: 'arenaWon' }); }
      else {
        // the breather: the crowd's water-bearers run out — every hero still standing gets back a share of health and mana
        const C = AD(world.rules).match, k = C.breatherHeal || 0;
        for (const u of standing(world, M)) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * k); if (u.maxMp) u.mp = Math.min(u.maxMp, u.mp + u.maxMp * k); }
        M.state = 'breather'; M.until = M.t + C.breather; out.push({ t: 'arenaBreather', seconds: C.breather, next: M.wave + 1, heal: k });
      }
    }
    return out;
  }
  if (M.state === 'breather' && M.t >= M.until) startWave(world, M, out);
  return out;
}

/** Take away what is left of a match (its monsters, the champion). */
export function endMatch(world, M) {
  for (const id of M.alive) world.units.delete(id);
  M.alive.clear();
  if (M.champUnit) { removePlayer(world, M.champUnit); M.champUnit = null; }
}

/** What the HUD shows (sent to every player in the arena). */
export function matchView(M, world) {
  const left = M.alive.size + M.queue.reduce((s, p) => s + p.monsters.length, 0);
  const champ = M.champUnit ? world.units.get(M.champUnit) : null;
  return {
    kind: M.kind, state: M.state, wave: M.wave, of: M.of, left, total: M.plan?.total || (M.kind === 'champion' ? 1 : 0),
    timer: M.state === 'gather' || M.state === 'breather' ? Math.max(0, Math.round((M.until - M.t) * 10) / 10) : null,
    next: M.queue.length ? { gate: M.place.gates[M.queue[0].gate % M.place.gates.length].id, in: Math.max(0, Math.round((M.queue[0].due - M.t) * 10) / 10) } : null,
    gate: M.lastGate, boss: !!M.plan?.boss, brute: !!M.plan?.brute, bracket: M.bracket?.id || null, champion: M.champion?.id || null,
    champHp: champ ? Math.round(champ.hp) : null, champMax: champ ? champ.maxHp : null,
    heroes: [...M.heroes], foes: [...M.alive],
  };
}
