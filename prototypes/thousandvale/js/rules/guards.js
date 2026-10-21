// Thousandvale — TOWN GUARDS (owner feedback 8, W1: "the starting town is being raided. I died before I had a chance to
// do anything. Where are the town guards?"). Pure.
//
// The rules had no friendly fighter without an owner: a follower needs an owner unit, monsters notice only players, and
// nothing outside the rules can hurt a monster. A guard is that missing thing:
//
//   * a unit in `field.allies` built on a real bestiary body (stream E's data/provinces/guards.json `rules.reference`
//     at level + `levelOver`): health x `hpMult`, hit x `dmgMult`, + `armor`; a sergeant on top (`ranks`);
//   * it holds a POST, fights only raiders (`m.raider`, set by rules.openingTarget) and anything that struck a player
//     or a guard near a post (`m.guardFoe`), never goes further than `leashM` from the post, walks back, and is whole
//     again `healsOutOfCombatSec` after the fight;
//   * it never attacks a player and a player cannot attack it (it is a friend: no player strike can pick it);
//   * it never DIES: at 0 health it is down for `respawnSec` and then stands up at full health;
//   * its hits credit nobody — a monster only guards have touched pays no experience, gold or loot when it falls, but
//     it DOES fall (a `death` event: the raid counts it); a player who also hit it is paid as always;
//   * its hit on a boss (the raid's captain) is multiplied by `vsBossMult`: the guards hold the waves, the captain is
//     the players' to break;
//   * raiders go for guards first: `threatMult` (default 3) on everything a guard does, and rules.openingTarget puts the
//     nearest standing guard on a raider's table before anyone has swung.
//
// Monsters only think when a player is within 200 m (js/rules/monster-ai.js), so a raid nobody is near does not run —
// which is what the room does anyway (a province copy with nobody in it is parked).

import { tickStatuses, slowOf, groundAt } from './farhold.js';
import { forget } from './threat.js';

const num = (v, d) => (Number.isFinite(+v) ? +v : d);
export const GUARD_DEFAULTS = Object.freeze({
  reference: 'road_brigand', levelOver: 2, hpMult: 4, dmgMult: 0.2, armor: 6, respawnSec: 75, leashM: 45, reachM: 2.6,
  healsOutOfCombatSec: 8, vsBossMult: 0.02, threatMult: 3, noticeM: 30, speed: 5.2, newcomerThreatMult: 0.25, rallyM: 110,
});

/**
 * Owner feedback 10 (Y21, report #18): "I found an NPC just wandering in the wilderness… stood next to two giant enemy
 * Ossuary Crawlers but they did not fight. NPCs in the wilderness, at least when a player is nearby, should fight
 * nearby enemies… If you help or save an NPC, they should sometimes have a special thank you or give you a reward."
 * A WANDERER is a guard with a different brief (the same unit, the same tick, the same "never a corpse"): it takes on
 * any monster within `noticeM` of it — but only while a player is within `playerM`; with nobody near it does nothing
 * and nothing happens to it. When its fight is over and it is still standing, every player who did a real share of the
 * work on its foes is reported (`field.emit npcHelped`): `saved` if it had dropped under `savedBelow` of its health,
 * else `helped`. The thanks and the reward are the room's (stream A / E).
 */
export const WANDERER_DEFAULTS = Object.freeze({ hpMult: 0.5, dmgMult: 2, playerM: 40, noticeM: 12, leashM: 25, respawnSec: 45, savedBelow: 0.35, helpedShare: 0.2, quietSec: 4 });

export function attachGuards(room, { cfg = null, wanderer = null } = {}) {
  const field = room.field, engine = room.engine, rpg = engine.rpg;
  const R = { ...GUARD_DEFAULTS, ...((cfg && cfg.rules) || {}) };
  const RANKS = (cfg && cfg.ranks) || {};
  const RAID = (cfg && cfg.raid) || {};
  const W = { ...WANDERER_DEFAULTS, ...(wanderer || {}), ...((RANKS.wanderer && typeof RANKS.wanderer === 'object') ? RANKS.wanderer : {}) };
  const G = { list: [], rules: R, wanderer: W, newcomerThreatMult: num(RAID.newcomerThreatMult, GUARD_DEFAULTS.newcomerThreatMult) };
  field.guards = G;
  const rng = () => room.streams.get('spawn');
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const up = g => !g.removed && !(g.downFor > 0) && g.hp > 0;
  G.standing = () => G.list.filter(up);
  /** The nearest standing guard to a point within `within` metres, or null. */
  G.nearest = (x, z, within = Infinity) => {
    let best = null, bd = within;
    for (const g of G.list) { if (!up(g) || g.wanderer) continue; const d = Math.hypot(g.x - x, g.z - z); if (d < bd) { bd = d; best = g; } }      // (a wanderer is nobody's gate guard)
    return best;
  };
  /** Is this spot under a guard's eye (within the leash of some post)? */
  G.watched = (x, z) => G.list.some(g => !g.wanderer && Math.hypot(g.post.x - x, g.post.z - z) <= g.leash);

  /** Build the numbers of a guard of `rank` at `level` (the town's or the raid's; `levelOver` is added here). */
  function statsFor(level, rank) {
    const def = engine.enemyDef(R.reference) || engine.enemyDef('road_brigand');
    const K = rank === 'wanderer' ? W : (RANKS[rank] || {});
    const lvl = Math.max(1, Math.round(level) + (R.levelOver | 0));
    const body = rpg.makeEnemy(def, lvl, rng(), { rank: 'normal' });
    const maxHp = Math.max(1, Math.round(body.maxHp * R.hpMult * (K.hpMult || 1)));
    const k = R.dmgMult * (K.dmgMult || 1);
    return { body, lvl, maxHp, dmg: body.dmg.map(v => Math.max(1, Math.round(v * k))), armor: Math.round((body.armor || 0) + (R.armor || 0)) };
  }

  /**
   * Make the fighter for a guard. `spec`: `{ id, name, x, z, yaw, level, rank, town, post }` (`level` = the town's band
   * floor or the raid's level BEFORE levelOver). Returns the unit (already in the field).
   */
  G.create = (spec) => {
    const rank = spec.wanderer ? 'wanderer' : (spec.rank || 'guard');
    const s = statsFor(spec.level || 1, rank);
    const u = s.body;
    Object.assign(u, {
      id: spec.id, name: spec.name || 'Guard', guard: true, rank2: rank, baseLevel: Math.max(1, Math.round(spec.level || 1)),
      level: s.lvl, maxHp: s.maxHp, hp: s.maxHp, dmg: s.dmg, armor: s.armor,
      x: spec.x, z: spec.z, y: field.terrain ? groundAt(field.terrain, spec.x, spec.z) : 0, facing: num(spec.yaw, 0),
      post: { x: spec.x, z: spec.z, yaw: num(spec.yaw, 0) }, leash: num(R.leashM, 45), reach: num(R.reachM, u.reach || 2.6),
      speed: num(R.speed, u.speed || 5), threatMult: num(R.threatMult, 3), town: spec.town || null,
      state: 'post', swingTimer: 0, downFor: 0, quietFor: 0, rallyIn: 0, statuses: {}, target: null, anim: 'idle',
      xp: 0, gold: 0, onHit: [], lifeSteal: 0, owner: null,
    });
    u.bodyR = Math.max(0.4, u.reach * 0.3);
    if (spec.wanderer) { u.wanderer = true; u.leash = num(W.leashM, 25); u.fight = null; }
    field.add(u, 'ally');
    G.list.push(u);
    return u;
  };
  /** A raid of a higher level than the town: the guards meet it at ITS level (never lowered; health share kept). */
  G.raise = (level, town = null) => {
    for (const g of G.list) {
      if (g.wanderer || (town && g.town && g.town !== town) || !(level > g.baseLevel)) continue;
      const share = g.maxHp > 0 ? g.hp / g.maxHp : 1;
      const s = statsFor(level, g.rank2);
      g.baseLevel = Math.round(level); g.level = s.lvl; g.maxHp = s.maxHp; g.hp = Math.round(s.maxHp * share); g.dmg = s.dmg; g.armor = s.armor;
    }
  };
  G.remove = (u) => { const i = G.list.indexOf(u); if (i >= 0) G.list.splice(i, 1); };

  /** Is `m` something a guard fights? A raider, or something that struck a player / a guard under a guard's eye. */
  const foe = m => m.dying == null && !m.removed && (m.raider || m.guardFoe);

  /** Is a wanderer's fight live — a player close enough to see it? */
  const witnessed = g => field.players.some(p => !p.dead && !p.removed && dist(p, g) <= num(W.playerM, 40));
  /** A wanderer takes a monster on: the monster knows it (threat, chase) and is fair game for it from now on. */
  function engage(g, m) {
    if (m.guardFoe && m.threat?.has(g.id)) return;
    m.guardFoe = true;
    const t = m.threat || (m.threat = new Map());
    t.set(g.id, Math.max(t.get(g.id) || 0, Math.max(8, (m.maxHp || 40) * 0.08)));
    if (m.state !== 'chase') { m.state = 'chase'; m.lastCombatAt = field.clock; if (m.targetId == null) m.targetId = g.id; }
  }
  /** What each player put into a foe of this wanderer's fight, as a share of that foe's health (kept as it falls or leaves). */
  function tally(g, m) {
    const F = g.fight;
    if (!F || F.done.has(m.id)) return;
    for (const [id, v] of m.damageBy || []) {
      const p = field.get(id);
      const who = p?.kind === 'player' ? p : p?.owner?.kind === 'player' ? p.owner : null;
      if (who) F.dealt.set(who.id, (F.dealt.get(who.id) || 0) + v / Math.max(1, m.maxHp || 1));
    }
    F.done.add(m.id);
  }
  /** The fight is over. Standing: tell the room who helped. Down: nobody saved anybody. */
  function endFight(g, standing) {
    const F = g.fight;
    g.fight = null;
    if (!F || !standing || !F.foes.size) return;
    for (const m of F.live) tally(g, m);
    const kind = F.low ? 'saved' : 'helped';
    for (const [pid, share] of F.dealt) {
      if (share < num(W.helpedShare, 0.2)) continue;
      field.emit({ t: 'npcHelped', npc: g.id, player: pid, kind, level: g.baseLevel, foes: F.foes.size, share: Math.round(share * 100) / 100 });
    }
  }
  /** Is this fighter in a fight right now (the room leaves its feet alone while it is)? */
  G.fighting = g => !!g && !g.removed && (g.state === 'chase' || g.state === 'down' || (g.wanderer && !!g.fight));

  function goDown(g) {
    if (g.wanderer) endFight(g, false);
    g.hp = 0; g.downFor = num(g.wanderer ? W.respawnSec : R.respawnSec, 75); g.statuses = {}; g.target = null; g.state = 'down'; g.anim = 'sit'; g.dying = null;
    for (const m of field.monsters) if (m.threat?.has(g.id)) forget(m, g.id);
    field.emit({ t: 'fx', kind: 'guard', id: g.id, down: 1, ms: Math.round(g.downFor * 1000) });
  }

  G.tick = (dt) => {
    if (!G.list.length) return;
    let foes = null;
    for (const g of G.list) {
      if (g.removed) continue;
      if (g.dying != null) g.dying = null;                 // a guard is never a corpse
      if (g.downFor > 0) {
        g.downFor -= dt;
        if (g.downFor <= 0) { g.downFor = 0; g.hp = g.maxHp; g.state = 'post'; g.anim = 'idle'; field.emit({ t: 'fx', kind: 'guard', id: g.id, down: 0 }); }
        continue;
      }
      if (g.statuses && Object.keys(g.statuses).length) tickStatuses(g, dt);
      if (g.hp <= 0) { goDown(g); continue; }
      g.swingTimer = Math.max(0, g.swingTimer - dt);
      // Y21: a wanderer — nothing at all unless a player is near; then every monster close to it is its business
      let mine = null;
      if (g.wanderer) {
        if (!witnessed(g)) { if (g.fight) endFight(g, false); g.target = null; g.targetId = null; g.state = 'post'; g.anim = 'idle'; continue; }
        mine = [];
        field.eachMonsterNear(g.x, g.z, num(W.noticeM, 12), m => { if (!m.dummy && !m.removed && m.dying == null && !m.statuses?.turned) mine.push(m); });
        for (const m of mine) engage(g, m);
        if (mine.length) {
          const F = g.fight || (g.fight = { foes: new Set(), live: new Set(), done: new Set(), dealt: new Map(), low: false, quiet: 0 });
          for (const m of mine) { F.foes.add(m.id); F.live.add(m); }
          F.quiet = 0;
        }
        if (g.fight) {
          const F = g.fight;
          if (g.hp / Math.max(1, g.maxHp) < num(W.savedBelow, 0.35)) F.low = true;
          for (const m of [...F.live]) if (m.dying != null || m.removed) { tally(g, m); F.live.delete(m); }
          if (!mine.length) { F.quiet += dt; if (F.quiet >= num(W.quietSec, 4)) endFight(g, true); }
        }
      }
      if (!foes && !g.wanderer) foes = field.monsters.filter(foe);
      // the nearest foe that is inside this guard's ground (its post's leash)
      let t = null, bd = Infinity;
      for (const m of (g.wanderer ? mine : foes)) {
        if (m.dying != null) continue;
        if (Math.hypot(m.x - g.post.x, m.z - g.post.z) > g.leash + g.reach) continue;
        const d = dist(m, g);
        if (d < bd) { bd = d; t = m; }
      }
      // feedback #100 (2026-10-21, a siege of Torborhold: "guards should at least pretend to help"): nothing at its own
      // post, a guard runs to a raider that is on a PLAYER within `rallyM` of it, and fights beside them (its hits are
      // still small; it is seen helping). It walks back to its post when that fight is over.
      g.leashNow = g.leash;
      if (!t && !g.wanderer && num(R.rallyM, 0) > g.leash) {
        for (const m of foes) {
          if (m.dying != null || m.targetId == null) continue;
          const v = field.get(m.targetId);
          if (!v || v.kind !== 'player' || v.dead) continue;
          if (Math.hypot(m.x - g.post.x, m.z - g.post.z) > num(R.rallyM, 0)) continue;
          const d = dist(m, g);
          if (d < bd) { bd = d; t = m; }
        }
        if (t) g.leashNow = num(R.rallyM, 0) + g.reach;
      }
      g.target = t; g.targetId = t ? t.id : null;
      let speed = 0;
      if (t) {
        g.state = 'chase'; g.quietFor = 0;
        g.facing = Math.atan2(t.x - g.x, t.z - g.z);
        const reach = g.reach + (t.reach || 2) * 0.3;
        if (bd > reach) speed = g.speed;
        else if (g.swingTimer <= 0) {
          g.swingTimer = g.attackEvery || 1.6;
          g.anim = 'attack';
          // round 9: Farhold's "town guards deal more damage while you are with them" (`cond_guardBond`, the Covenant
          // Hammer's own line) had no guards to mean — it means these now: the best bond among players within 20 m
          let bond = 1;
          for (const p of field.players) if (!p.dead && p.equipment && dist(p, g) <= 20) bond = Math.max(bond, rpg.fx.product(p, 'guardPower') || 1);
          const result = rpg.strike(g, t, field.rng, { multiplier: (t.boss ? num(R.vsBossMult, 1) : 1) * bond });
          field.land(t, result, { fromX: g.x, fromZ: g.z, by: g });
          field.report(g, t, result, 'guard');
          if (result.dead) field.kill(t);
        }
        // the sergeant's rally: a share of health back to every guard in earshot
        const rally = RANKS[g.rank2]?.rally;
        if (rally) {
          g.rallyIn -= dt;
          if (g.rallyIn <= 0) {
            g.rallyIn = num(rally.everySec, 20);
            let n = 0;
            for (const o of G.list) if (up(o) && o.hp < o.maxHp && dist(o, g) <= num(rally.withinM, 14)) { o.hp = Math.min(o.maxHp, o.hp + Math.round(o.maxHp * num(rally.healShare, 0.15))); n++; }
            const says = rally.say || [];
            if (n) field.emit({ t: 'fx', kind: 'guard', id: g.id, rally: 1, n, say: says.length ? says[Math.floor(field.rng() * says.length) % says.length] : undefined });
          }
        }
      } else {
        // nothing to fight: back to the post, then whole again
        const back = Math.hypot(g.post.x - g.x, g.post.z - g.z);
        if (back > 0.4) { g.state = 'return'; g.facing = Math.atan2(g.post.x - g.x, g.post.z - g.z); speed = Math.min(g.speed, back / dt); }
        else { g.state = 'post'; g.x = g.post.x; g.z = g.post.z; g.facing = g.post.yaw; }
        g.quietFor += dt;
        if (g.hp < g.maxHp && g.quietFor >= num(R.healsOutOfCombatSec, 8)) g.hp = g.maxHp;
      }
      if (speed > 0) {
        speed *= 1 - (slowOf(g) || 0);
        const nx = g.x + Math.sin(g.facing) * speed * dt, nz = g.z + Math.cos(g.facing) * speed * dt;
        const B = field.terrain?.blocked;
        if (!(B && B(nx, nz) && !B(g.x, g.z)) && Math.hypot(nx - g.post.x, nz - g.post.z) <= (g.leashNow || g.leash)) { g.x = nx; g.z = nz; }
        g.y = field.terrain ? groundAt(field.terrain, g.x, g.z, g.y) : 0;
      }
      if (g.swingTimer <= 0 || !t) g.anim = speed > 0 ? 'walk' : 'idle';
    }
  };

  /**
   * A raider's OPENING target (before anyone has swung): `hint` = 'guard' (the nearest standing guard within `within`
   * metres) or an entity. Marks the monster a raider (guards fight it; it notices guards). Never a newcomer.
   */
  G.opening = (m, hint = 'guard', { within = 120 } = {}) => {
    if (!m || m.dying != null) return null;
    m.raider = true;
    let who = hint && typeof hint === 'object' ? hint : null;
    if (who && who.kind === 'player' && (who.threatScale ?? 1) < 1) who = null;          // never a newcomer
    if (!who) who = G.nearest(m.x, m.z, within);
    if (!who) return null;
    const t = m.threat || (m.threat = new Map());
    t.set(who.id, Math.max(t.get(who.id) || 0, Math.max(12, (m.maxHp || 40) * 0.12)));
    m.targetId = who.id;
    m.state = 'chase';
    m.lastCombatAt = field.clock;
    return who;
  };
  return G;
}
