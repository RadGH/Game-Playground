// Units (Lumen/Umbra army, drones, and Hollow creatures share one list and one shape).

export function udef(game, type) {
  return game.data.units.list[type] || game.data.enemies.list[type];
}

export function createUnit(game, type, team, x, y, opts = {}) {
  const def = udef(game, type);
  if (!def) throw new Error('unknown unit ' + type);
  const hollow = team === 3;
  let maxHp = def.hp * (opts.hpMult || 1);
  const u = {
    id: game.nextId++, kind: 'u', type, team, hollow,
    x, y, w: def.size[0], h: def.size[1], vx: 0, vy: 0, dir: opts.dir || (team === 1 ? 1 : -1),
    hp: maxHp, maxHp, move: def.move, flying: def.move === 'fly',
    airborne: false, fallStart: y,
    cd: game.rng.next() * 0.5, target: 0, retargetT: 0, aim: 0, firing: 0, beamT: 0,
    order: { t: 'idle' }, orders: [], path: null, pathI: 0, pathT: 0,
    stuckT: 0, progX: x, climbAcc: 0, biteCd: 0,
    job: null, jobT: 0, buildAcc: 0,
    deployed: false, abil: {}, lastHit: -99, spawnT: 0, bossPhase: 0,
    goal: null, burrowed: def.move === 'burrow',
    dmgMult: opts.dmgMult || 1,
  };
  game.units.push(u);
  game.byId.set(u.id, u);
  if (!hollow) {
    const t = game.teams[team];
    if (t) t.pop += def.pop || 0;
  }
  return u;
}

export function removeUnit(game, u, how = 'killed', killerTeam = 0) {
  if (u.dead) return;
  u.dead = true;
  game.byId.delete(u.id);
  const i = game.units.indexOf(u);
  if (i >= 0) game.units.splice(i, 1);
  const def = udef(game, u.type);
  if (!u.hollow) {
    const t = game.teams[u.team];
    if (t) { t.pop -= def.pop || 0; if (how === 'killed') t.stats.lost++; }
  }
  if (how === 'killed') {
    const kt = game.teams[killerTeam];
    if (kt) kt.stats.kills[u.type] = (kt.stats.kills[u.type] || 0) + 1;
    game.events.emit('unitKilled', { id: u.id, type: u.type, team: u.team, x: u.x, y: u.y - u.h / 2, w: u.w, h: u.h, hollow: u.hollow, boss: !!def.boss });
    if (def.splits) {
      for (let k = 0; k < def.splits.count; k++) {
        const m = createUnit(game, def.splits.into, u.team, u.x + (k - 1.5) * 3, u.y, { dir: u.dir });
        m.vy = -40 - k * 10;
      }
    }
    if (def.hero) game.onHeroDown(u);
  }
}

export function damageUnit(game, u, amount, fromTeam = 0, dtype = 'laser') {
  if (u.dead || amount <= 0) return;
  const def = udef(game, u.type);
  if (def.resist && def.resist[dtype] !== undefined) amount *= def.resist[dtype];
  u.hp -= amount;
  u.lastHit = game.time;
  if (game.emitHurt) game.events.emit('hurt', { id: u.id, amt: amount, x: u.x, y: u.y - u.h, team: u.team });
  u.lastHitBy = fromTeam;
  const ft = game.teams[fromTeam];
  if (ft) ft.stats.dmgBy[dtype] = (ft.stats.dmgBy[dtype] || 0) + amount;
  if (u.hp <= 0) removeUnit(game, u, 'killed', fromTeam);
  else if (!u.hollow) game.noteAttack(u);
}

export function unitCenter(u) { return { x: u.x, y: u.y - u.h / 2 }; }

export function hostile(a, b) { return a !== b && a !== 0 && b !== 0; }
