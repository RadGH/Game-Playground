// Knockabout — a match: arena + fighters + bots + rules. PURE: no DOM, no three.js.
// The contract (docs/PLAN.md "The sim contract") — the client and the server code against exactly this:
//   createMatch(opts) -> m;  m.input(pid, held);  m.step(dt);  m.snapshot();  m.events;  m.over;  m.result()
//   ARENAS, MODES

import { createPhysics, G, r2 } from './physics.js';
import { TUNING, mergeTuning, makeRng, loadJSON } from './tuning.js';
import { createFighter, blankInput, normInput } from './fighter.js';
import { buildArena } from './arena.js';
import { createBot, findDumps } from './bots.js';

const ARENA_DATA = await loadJSON('../../data/arenas.json');
const MODE_DATA = await loadJSON('../../data/modes.json');

/** Every arena (static geometry + hazard definitions). The client draws the static parts from this. */
export const ARENAS = ARENA_DATA.arenas;
/** Modes, difficulty table and bot levels. MODES.modes = [{ id, name, blurb, ... }]. */
export const MODES = MODE_DATA;
export { TUNING };

const GOON_PID = 1001;
const GOON_TEAM = 99;

export function createMatch(opts = {}) {
  const tuning = mergeTuning(TUNING, opts.tuning);
  const R = tuning.rules;
  const FIX = tuning.physics.dt;
  const arenaDef = ARENAS.find((a) => a.id === opts.arena) || ARENAS[0];
  const modeId = ['versus', 'teams', 'waves'].includes(opts.mode) ? opts.mode : 'versus';
  const modeDef = MODE_DATA.modes.find((x) => x.id === modeId);
  const diffName = MODE_DATA.difficulty[opts.difficulty] ? opts.difficulty : 'normal';
  const diff = MODE_DATA.difficulty[diffName];
  const seed = (opts.seed ?? 1) >>> 0;
  const rng = makeRng(seed);
  const winsNeeded = Math.max(1, opts.rounds || modeDef.rounds || 3);
  const roundTime = opts.roundTime || modeDef.roundTime || R.roundTime;

  const phys = createPhysics(tuning);
  const { world } = phys;
  const events = [];
  let t = 0;

  const m = {
    events, over: false, mode: modeId, arenaId: arenaDef.id, seed, tuning,
    phase: 'intro', phaseT: R.introSecs, round: 1, rounds: winsNeeded, wave: 0, fightT: 0, sudden: false,
    score: {}, fighters: [],
  };

  const ctx = {
    world, mats: phys.mats, tuning, rng, botLevels: MODE_DATA.botLevels,
    fighters: m.fighters,
    now: () => t,
    sudden: () => m.sudden,
    emit: (ev) => events.push(ev),
    fighterBy: (pid) => (pid == null ? null : m.fighters.find((f) => f.pid === pid) || null),
    isEnemy: (a, b) => (modeId === 'versus' ? a.pid !== b.pid : a.team !== b.team),
    releaseGripsOn: (target, push) => {
      for (const o of m.fighters) {
        for (let i = 0; i < 2; i++) {
          const g = o.hand[i].grip;
          if (g && g.fighter === target) {
            o.releaseHand(i, false);
            if (push) { // the struggler shoves free, and the grabber's hand needs a moment before it can grab again
              o.hand[i].lockT = 1.0;
              const dx = o.torso.position.x - target.torso.position.x, dz = o.torso.position.z - target.torso.position.z;
              const d = Math.hypot(dx, dz) || 1;
              o.torso.velocity.x += dx / d * 3; o.torso.velocity.z += dz / d * 3;
            }
          }
        }
      }
    },
  };

  const arena = buildArena(ctx, arenaDef);
  ctx.arena = arena;
  ctx.dumps = findDumps(arena);
  // A safe spot to retreat to: the spawn point nearest to us that is safe right now.
  // A safe spot to retreat to: sample rings around us (and the spawn points), take the nearest one that is safe
  // and whose straight path there is safe too.
  ctx.safeSpot = (x, z) => {
    let best = null, bd = Infinity;
    const cands = [];
    for (const r of [1.2, 2.2, 3.4]) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + r; cands.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); }
    for (const s of arenaDef.spawns) cands.push([s[0], s[2]]);
    for (const c of cands) {
      const d = Math.hypot(c[0] - x, c[1] - z);
      if (d >= bd) continue;
      if (arena.safeAt(c[0], c[1]) < 0.8) continue;
      const mx = (c[0] + x) / 2, mz = (c[1] + z) / 2;
      if (d > 1.5 && arena.safeAt(mx, mz) < 0.5) continue;
      bd = d; best = c;
    }
    return best || [arenaDef.cam.look[0], arenaDef.cam.look[2]];
  };

  // ------------------------------------------------------------------ players
  const players = (opts.players || []).slice(0, 8);
  if (!players.length) players.push({ pid: 1, cpu: true }, { pid: 2, cpu: true });
  const nTeams = Math.max(2, Math.min(4, opts.teams || modeDef.minTeams || 2));
  if (modeId === 'teams') {
    const teamsGiven = new Set(players.map((p) => p.team ?? 0));
    if (teamsGiven.size < 2) players.forEach((p, i) => { p.team = i % nTeams; });
  }
  const bots = new Map();
  ctx.botsMap = bots;
  const inputs = new Map();
  for (const p of players) {
    const f = createFighter(ctx, { pid: p.pid, team: modeId === 'waves' ? 0 : modeId === 'versus' ? p.pid : (p.team ?? 0), name: p.name, look: p.look, cpu: !!p.cpu, level: p.level });
    f.isPlayer = true;
    m.fighters.push(f);
    if (p.cpu) bots.set(f.pid, createBot(ctx, f, p.level || diff.bot));
  }
  const playerFighters = m.fighters.slice();
  const tally = {};   // per pid: kos, tossed (goons), downs, roundWins
  for (const f of playerFighters) tally[f.pid] = { kos: 0, tossed: 0, downs: 0, wins: 0 };

  // ------------------------------------------------------------------ rounds / waves
  function spawnOrder() {
    const sp = arenaDef.spawns.slice();
    if (modeId === 'teams') {
      // team mates start next to each other: sort fighters by team, hand out spawns in ring order
      return sp;
    }
    for (let i = sp.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [sp[i], sp[j]] = [sp[j], sp[i]]; }
    return sp;
  }

  function startRound() {
    arena.reset();
    for (const f of m.fighters) if (f.goon) f.removeFromWorld();
    if (modeId === 'waves') { for (let i = m.fighters.length - 1; i >= 0; i--) if (m.fighters[i].goon) { bots.delete(m.fighters[i].pid); m.fighters.splice(i, 1); } }
    const sp = spawnOrder();
    const order = modeId === 'teams' ? playerFighters.slice().sort((a, b) => a.team - b.team || a.pid - b.pid) : playerFighters;
    order.forEach((f, i) => {
      const s = sp[i % sp.length];
      f.removeFromWorld();
      f.downs = 0;
      f.spawn([s[0], s[1], s[2]], s[3]);
    });
    m.fightT = 0; m.sudden = false;
    m.phase = 'intro'; m.phaseT = R.introSecs;
    if (modeId === 'waves') startWave(1);
  }

  function startWave(n) {
    m.wave = n;
    const g = modeDef.goons;
    const room = Math.max(1, g.maxFighters - playerFighters.length);
    const count = Math.min(room, Math.max(g.min, Math.round(playerFighters.length * (g.perPlayer + g.growth * (n - 1)))));
    const tough = (g.toughStart || 0) + Math.floor((n - 1) / g.toughEvery) + diff.goonTough;
    const sp = arenaDef.spawns;
    const used = new Set();
    for (const f of playerFighters) if (f.alive) {
      let bi = 0, bd = Infinity; sp.forEach((s, i) => { const d = Math.hypot(s[0] - f.torso.position.x, s[2] - f.torso.position.z); if (d < bd) { bd = d; bi = i; } });
      used.add(bi);
    }
    const free = sp.map((s, i) => i).filter((i) => !used.has(i));
    for (let k = 0; k < count; k++) {
      const pid = GOON_PID + (n - 1) * 20 + k;
      const s = sp[free.length ? free[k % free.length] : k % sp.length];
      const f = createFighter(ctx, {
        pid, team: GOON_TEAM, goon: true, name: 'Goon',
        stats: { punchesToDown: Math.max(1, R.punchesToDown + tough), punch: diff.goonPunch * (1 + g.punchPerWave * (n - 1)), speed: Math.min(1.2, (diff.goonSpeed || 0.9) + g.speedPerWave * (n - 1)) },
      });
      m.fighters.push(f);
      const jitter = (k >= free.length) ? (k * 0.7) : 0;
      f.spawn([s[0] + jitter * 0.3, s[1] + (g.dropIn || 0), s[2] + jitter * 0.3], s[3]);
      bots.set(pid, createBot(ctx, f, diff.goonLevel));
    }
    m.fightT = 0;
    events.push({ e: 'wave', n });
  }

  function eliminate(f, how) {
    if (!f.alive) return;
    const by = f.creditPid();
    f.alive = false; f.out = how; f.down = 0; f.limp = 0;
    f.removeFromWorld();
    const op = f.torso.position;
    events.push({ e: 'out', pid: f.pid, how, by, x: r2(op.x), y: r2(op.y), z: r2(op.z) });
    if (by != null && tally[by]) {
      if (f.goon) { tally[by].tossed++; m.score[by] = (m.score[by] || 0) + 1; }
      else tally[by].kos++;
    }
    if (tally[f.pid]) tally[f.pid].downs += 0;
  }

  function aliveSides() {
    const sides = new Set();
    for (const f of m.fighters) if (f.alive && !f.goon) sides.add(modeId === 'versus' ? f.pid : f.team);
    return sides;
  }

  function endRound(winnerSide) {
    m.phase = 'roundEnd'; m.phaseT = R.roundEndSecs;
    let winner = null;
    if (winnerSide != null) {
      if (modeId === 'versus') { winner = winnerSide; m.score[winnerSide] = (m.score[winnerSide] || 0) + 1; tally[winnerSide].wins++; }
      else { winner = 't' + winnerSide; m.score[winner] = (m.score[winner] || 0) + 1; for (const f of playerFighters) if (f.team === winnerSide) tally[f.pid].wins++; }
    }
    events.push({ e: 'round', winner, round: m.round });
    const top = Math.max(0, ...Object.values(m.score));
    if (top >= winsNeeded || m.round >= winsNeeded * 3) m.pendingOver = true;
  }

  function finish() {
    m.phase = 'over'; m.over = true;
    const res = m.result();
    events.push({ e: 'over', standings: res.order });
  }

  function rules(dt) {
    if (m.phase === 'intro') {
      m.phaseT -= dt;
      if (m.phaseT <= 0) { m.phase = 'fight'; m.fightT = 0; events.push({ e: 'fight', round: m.round, wave: modeId === 'waves' ? m.wave : undefined }); }
      return;
    }
    if (m.phase === 'roundEnd') {
      m.phaseT -= dt;
      if (m.phaseT <= 0) {
        if (m.pendingOver) finish();
        else { m.round++; startRound(); }
      }
      return;
    }
    if (m.phase === 'waveBreak') {
      m.phaseT -= dt;
      if (m.phaseT <= 0) {
        // knocked-out players come back
        const sp = arenaDef.spawns;
        playerFighters.forEach((f, i) => { if (!f.alive) { const s = sp[i % sp.length]; f.spawn([s[0], s[1] + 1.5, s[2]], s[3]); } });
        startWave(m.wave + 1);
        m.phase = 'fight';
        events.push({ e: 'fight', round: m.round, wave: m.wave });
      }
      return;
    }
    if (m.phase !== 'fight') return;
    m.fightT += dt;

    if (modeId === 'waves') {
      const playersLeft = playerFighters.some((f) => f.alive);
      const goonsLeft = m.fighters.some((f) => f.goon && f.alive);
      if (!playersLeft) { finish(); return; }
      if (!goonsLeft || m.fightT > (modeDef.waveTime || 150)) {
        // a wave that drags on too long is called (stragglers are cleared)
        for (const f of m.fighters) if (f.goon && f.alive) eliminate(f, 'ring');
        m.score.waves = (m.score.waves || 0) + 1;
        if (m.wave >= (opts.waves || modeDef.waves)) { finish(); return; }
        m.phase = 'waveBreak'; m.phaseT = R.waveBreakSecs;
      }
      return;
    }

    const sides = aliveSides();
    if (sides.size <= 1) { endRound(sides.size ? [...sides][0] : null); return; }
    if (!m.sudden && m.fightT >= roundTime) { m.sudden = true; events.push({ e: 'sudden' }); }
    if (m.sudden && m.fightT >= roundTime + R.suddenDeathSecs) endRound(null);
  }

  // ------------------------------------------------------------------ the tick
  const touches = new Map();
  function collectContacts() {
    touches.clear();
    const hazardHits = [];
    const propHits = [];
    const beltTouch = [];
    for (const c of world.contacts) {
      const a = c.bi, b = c.bj;
      // hands: remember what they touch (for grabbing)
      if (a.part === 'hand') addTouch(a, b, c.bi.position.x + c.ri.x, c.bi.position.y + c.ri.y, c.bi.position.z + c.ri.z);
      if (b.part === 'hand') addTouch(b, a, c.bj.position.x + c.rj.x, c.bj.position.y + c.rj.y, c.bj.position.z + c.rj.z);
      // hazards biting fighters
      if (a.hazard && b.fid != null) hazardHits.push([a.hazard, b]);
      else if (b.hazard && a.fid != null) hazardHits.push([b.hazard, a]);
      // props flying into fighters
      if (a.prop && b.fid != null) propHits.push([a.prop, b]);
      else if (b.prop && a.fid != null) propHits.push([b.prop, a]);
      // belts carry things that are not standing on them (limp fighters, props)
      if (a.belt && b.mass > 0) beltTouch.push([a, b]);
      else if (b.belt && a.mass > 0) beltTouch.push([b, a]);
    }
    return { hazardHits, propHits, beltTouch };
  }
  function addTouch(hand, other, x, y, z) {
    let l = touches.get(hand);
    if (!l) touches.set(hand, (l = []));
    l.push({ body: other, point: [x, y, z] });
  }

  function biteFighters(hazardHits) {
    for (const [h, body] of hazardHits) {
      if (!['blade', 'piston', 'sweeper'].includes(h.kind) || !h.biting) continue;
      if (h.kind === 'sweeper' && h.phase !== 2) continue; // a slow arm only shoves; the fast one knocks you down
      const f = ctx.fighterBy(body.fid);
      if (!f || !f.alive) continue;
      const key = h.id;
      if ((f.hazardCd[key] || 0) > t) continue;
      f.hazardCd[key] = t + R.hazardCooldown;
      // knock away from the hazard (sweeper: along the arm's motion)
      let dx = f.torso.position.x - h.body.position.x, dz = f.torso.position.z - h.body.position.z;
      if (h.kind === 'sweeper') {
        const w = h.w || 1; const rx = dx, rz = dz;
        dx = w * rz; dz = -w * rx; // tangential (ω × r with ω along y)
      } else if (h.kind === 'piston') { dx = h.def.dir[0]; dz = h.def.dir[2]; }
      const d = Math.hypot(dx, dz) || 1;
      const kn = h.def.knock ?? 1;
      for (const b of f.bodies) { b.velocity.x += dx / d * R.hazardKnock * kn; b.velocity.z += dz / d * R.hazardKnock * kn; b.velocity.y += R.hazardKnockUp * kn; }
      f.knockDown(Math.max(R.hazardDownSecs, f.downSecsNext() * 0.6), true, null);
      events.push({ e: 'hazard', id: h.id, kind: h.kind, pid: f.pid });
    }
  }

  function propsStep(propHits, beltTouch) {
    for (const [prop, body] of propHits) {
      if (prop.hitCd > t) continue;
      const f = ctx.fighterBy(body.fid);
      if (!f || !f.alive) continue;
      const pv = prop.body.velocity, fv = body.velocity;
      const rel = Math.hypot(pv.x - fv.x, pv.y - fv.y, pv.z - fv.z);
      if (rel < tuning.fighter.propHitSpeed) continue;
      prop.hitCd = t + 0.5;
      const by = prop.lastBy && t - prop.lastBy.t < R.creditSecs ? prop.lastBy.pid : null;
      if (by != null && by !== f.pid) f.addDaze(by, 1);
      events.push({ e: 'bonk', prop: prop.id, pid: f.pid, by });
    }
    for (const [belt, body] of beltTouch) {
      if (body.fid != null) { const f = ctx.fighterBy(body.fid); if (f && f.grounded) continue; }
      const k = body.mass * 6;
      body.force.x += k * (belt.belt[0] - body.velocity.x);
      body.force.z += k * (belt.belt[2] - body.velocity.z);
    }
    for (const p of arena.props) {
      if (p.body.position.y < arenaDef.outY) {
        p.outT += FIX;
        if (p.outT > 3) p.reset();
      }
    }
  }

  function killChecks() {
    for (const f of m.fighters) {
      if (!f.alive || !f.inWorld) continue;
      const p = f.torso.position;
      if (p.y < arenaDef.outY || !isFinite(p.y)) { eliminate(f, 'ring'); continue; }
      const k = arena.staticKill(p) || arena.hazards.killAt(p) || arena.staticKill(f.head.position) || arena.hazards.killAt(f.head.position);
      if (k) eliminate(f, k);
    }
  }

  // Safety net: a body that ever goes non-finite is taken out (fighter: out of the ring; prop: put back) instead of
  // poisoning the solver and crashing the match. Should never fire; sim-bots.mjs would show it as a 'glitch' out.
  const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  function sanity() {
    for (const f of m.fighters) {
      if (!f.alive || !f.inWorld) continue;
      if (f.bodies.every((b) => finite(b.position) && finite(b.velocity) && Number.isFinite(b.quaternion.w))) continue;
      for (const b of f.bodies) { b.position.set(0, arenaDef.outY - 5, 0); b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); b.quaternion.set(0, 0, 0, 1); }
      eliminate(f, 'ring');
      events.push({ e: 'glitch', pid: f.pid });
    }
    for (const p of arena.props) if (!finite(p.body.position) || !finite(p.body.velocity) || !Number.isFinite(p.body.quaternion.w)) p.reset();
  }

  function tick(dt) {
    t += dt;
    const control = m.phase === 'fight' || m.phase === 'roundEnd' || m.phase === 'waveBreak';
    for (const f of m.fighters) {
      if (!f.alive) continue;
      let inp;
      if (bots.has(f.pid)) inp = control ? bots.get(f.pid).update(dt) : blankInput();
      else inp = control ? (inputs.get(f.pid) || blankInput()) : blankInput();
      f.setInput(inp);
    }
    for (const f of m.fighters) f.preStep(dt);
    arena.hazards.update(dt, m.phase === 'intro' ? 0 : m.sudden ? R.suddenDeathHazardSpeed : 1);
    world.step(dt);
    sanity();
    const { hazardHits, propHits, beltTouch } = collectContacts();
    for (const f of m.fighters) f.postStep(dt, touches);
    if (m.phase === 'fight' || m.phase === 'waveBreak' || m.phase === 'roundEnd') {
      biteFighters(hazardHits);
      killChecks();
    } else {
      // during the intro nobody can be eliminated: anyone who slips off is put back
      for (const f of m.fighters) if (f.alive && f.torso.position.y < arenaDef.outY) f.spawn(arenaDef.spawns[0].slice(0, 3), 0);
    }
    propsStep(propHits, beltTouch);
    rules(dt);
  }

  // ------------------------------------------------------------------ public API
  let acc = 0;
  m.step = (dt = FIX) => {
    if (m.over) { inputs.clear(); return; }
    acc += dt;
    let n = 0;
    while (acc >= FIX - 1e-9 && n < tuning.physics.maxSubSteps) { tick(FIX); acc -= FIX; n++; if (m.over) break; }
    if (n >= tuning.physics.maxSubSteps) acc = 0;
    inputs.clear(); // held input must be re-sent every step ("missing = no input")
  };

  m.input = (pid, held) => { inputs.set(pid, normInput(held)); };

  m.snapshot = () => {
    const snap = {
      t: r2(t), phase: m.phase, round: m.round, rounds: winsNeeded,
      fighters: m.fighters.map((f) => f.snapshot()),
      props: arena.props.map((p) => p.snapshot()),
      hazards: arena.hazards.snapshot(),
      score: Object.assign({}, m.score),
      events: events.slice(),
    };
    if (modeId === 'waves') snap.wave = m.wave;
    else if (m.phase === 'fight') snap.timeLeft = r2(Math.max(0, (m.sudden ? roundTime + R.suddenDeathSecs : roundTime) - m.fightT));
    if (m.sudden) snap.sudden = true;
    return snap;
  };

  m.result = () => {
    let keyed;
    if (modeId === 'waves') keyed = playerFighters.map((f) => [f.pid, tally[f.pid].tossed * 100 - f.downs + tally[f.pid].kos]);
    else if (modeId === 'teams') {
      // a team places together: round wins, then the team's knock-outs
      const teamKos = {};
      for (const f of playerFighters) teamKos[f.team] = (teamKos[f.team] || 0) + tally[f.pid].kos;
      keyed = playerFighters.map((f) => [f.pid, (m.score['t' + f.team] || 0) * 1000 + teamKos[f.team]]);
    }
    else keyed = playerFighters.map((f) => [f.pid, (m.score[f.pid] || 0) * 1000 + tally[f.pid].kos * 10 + (f.alive ? 1 : 0)]);
    keyed.sort((a, b) => b[1] - a[1]);
    const order = [];
    let last = null;
    for (const [pid, s] of keyed) {
      if (last !== null && s === last) order[order.length - 1].push(pid);
      else order.push([pid]);
      last = s;
    }
    const stats = {};
    for (const f of playerFighters) stats[f.pid] = { kos: tally[f.pid].kos, tossed: tally[f.pid].tossed, wins: tally[f.pid].wins, downs: f.downs, punches: f.tally.punches, hits: f.tally.hits, throws: f.tally.throws };
    return { order, scores: Object.assign({}, m.score), mode: modeId, arena: arenaDef.id, waves: modeId === 'waves' ? (m.score.waves || 0) : undefined, stats };
  };

  m.time = () => t;
  m.arena = arena;
  m.bots = bots;
  m.world = world;

  startRound();
  return m;
}
