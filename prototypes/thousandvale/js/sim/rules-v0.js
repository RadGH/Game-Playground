// STAND-IN combat rules (stream A) — used only until stream C's js/rules/index.js lands.
// Same shape as docs/protocol.md §7: createRules(host, opts) -> { addEntity, removeEntity, intent, step,
// respawn, levelFor, xpFor, dispose }. One basic melee swing for every class, one monster family
// (wolves) with a threat-table stub and a leash. Numbers are placeholders, not Farhold's.

import { STATE } from '../net/protocol.js';
import { next, range } from './rng.js';

const SWING_MS = 900, SWING_RANGE = 3.2, SWING_TOLERANCE = 0.5, SWING_ARC = Math.PI * 2 / 3;
const WOLF = { aggro: 11, speed: 6.2, reach: 2.0, biteMs: 1500, leashM: 40, leashMs: 8000, corpseMs: 8000 };

export const MONSTER_TYPES = {
  wolf: { name: 'Grey wolf', hp: l => 40 + 14 * l, dmg: l => [3 + 2 * l, 5 + 2 * l], xp: l => 20 + 6 * l },
};

const RANK_HP = { normal: 1, elite: 3, boss: 6 };
const RANK_XP = { normal: 1, elite: 3, boss: 8 };

/** STAND-IN loot (C's rules roll Farhold drops). Items get their uid from the server. */
const JUNK = [['wolf_pelt', 'Wolf pelt', 3], ['wolf_fang', 'Wolf fang', 2], ['torn_cloth', 'Torn cloth', 1]];
const GEAR = [['rusty_sword', 'Rusty sword', 'mainhand', 8], ['hide_cap', 'Hide cap', 'head', 6], ['iron_ring', 'Iron ring', 'ring', 12], ['wool_boots', 'Wool boots', 'feet', 5]];
const RARITIES = ['common', 'magic', 'rare', 'unique'];
export function rollLoot(rng, level, { rank = 'normal', chest = false } = {}) {
  const items = [];
  if (next(rng) < (chest ? 1 : rank === 'normal' ? 0.35 : 1)) {
    const [base, name, value] = JUNK[Math.floor(next(rng) * JUNK.length)];
    items.push({ base, name, rarity: 'common', level, value, kind: 'junk' });
  }
  const gearChance = chest ? 1 : rank === 'boss' ? 1 : rank === 'elite' ? 0.6 : 0.06;
  if (next(rng) < gearChance) {
    const [base, name, slot, value] = GEAR[Math.floor(next(rng) * GEAR.length)];
    const roll = next(rng) + (chest ? 0.35 : rank === 'boss' ? 0.5 : 0);
    const rarity = RARITIES[roll > 1.25 ? 3 : roll > 0.95 ? 2 : roll > 0.6 ? 1 : 0];
    items.push({ base, name, rarity, level, value: value * (1 + RARITIES.indexOf(rarity)), slot, kind: 'gear' });
  }
  return items;
}

export function xpFor(level) { return Math.round(100 * Math.pow(Math.max(0, level - 1), 1.6)); }
export function levelFor(xp) { let l = 1; while (l < 50 && xp >= xpFor(l + 1)) l++; return l; }

const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export function createRules(host) {
  const rng = host.rng('combat');
  const ai = host.rng('ai');
  const loot = host.rng('loot');

  function stats(e) {
    if (e.kind === 'player') {
      const l = e.level;
      e.setMax(80 + 20 * l, 50 + 10 * l);
      if (e.hp <= 1) e.setHp(e.hpMax);
      e.setMp(e.mpMax);
    } else if (e.kind === 'monster') {
      const t = MONSTER_TYPES[e.type] || MONSTER_TYPES.wolf;
      e.setMax(t.hp(e.level) * (RANK_HP[e.rank] || 1), 0);
      e.setHp(e.hpMax);
      e.r.home = { x: e.x, z: e.z };
      e.r.threat = new Map();
      e.r.brain = 'idle';
      e.r.next = host.now() + range(ai, 500, 3000);
      e.r.lastHurt = 0;
    }
  }

  function addThreat(m, src, n) {
    if (!m.r.threat) return;
    m.r.threat.set(src.id, (m.r.threat.get(src.id) || 0) + n);
    m.r.lastHurt = host.now();
    if (m.r.brain !== 'chase') { m.r.brain = 'chase'; m.setState(STATE.combat, true); host.event({ type: 'aggro', s: m.id, d: src.id }); }
  }

  function damage(src, dst, n, skill) {
    n = Math.max(1, Math.round(n));
    const crit = next(rng) < 0.1;
    if (crit) n = Math.round(n * 1.5);
    dst.setHp(dst.hp - n);
    host.event({ type: 'hit', s: src.id, d: dst.id, n, crit: crit || undefined, kind: 'dmg', skill });
    if (dst.kind === 'monster') {
      addThreat(dst, src, n);
      (dst.r.credit ||= new Set()).add(src.id);
    }
    if (src.kind === 'player') { src.r.combatUntil = host.now() + 5000; src.setState(STATE.combat, true); }
    if (dst.kind === 'player') { dst.r.combatUntil = host.now() + 5000; dst.setState(STATE.combat, true); }
    if (dst.hp <= 0) {
      dst.kill(src);
      if (dst.kind === 'monster') {
        const t = MONSTER_TYPES[dst.type] || MONSTER_TYPES.wolf;
        for (const id of dst.r.credit || []) {
          const p = host.entities.get(id);
          if (p && p.kind === 'player' && !p.dead) host.award(p, { xp: t.xp(dst.level) * (RANK_XP[dst.rank] || 1), gold: (1 + (dst.level >> 1)) * (RANK_XP[dst.rank] || 1), items: rollLoot(loot, dst.level, { rank: dst.rank }), from: dst, reason: 'kill' });
        }
        host.despawn(dst, WOLF.corpseMs);
      }
    }
  }

  function basicAttack(e, msg) {
    const now = host.now();
    if ((e.r.swingAt || 0) > now) return { ok: false, why: 'cooldown' };
    e.r.swingAt = now + SWING_MS;
    let facing = e.yaw;
    if (msg.aim) facing = Math.atan2(msg.aim.x - e.x, msg.aim.z - e.z);
    let victim = null;
    if (msg.target) {
      const t = host.entities.get(msg.target);
      if (t && !t.dead && t.team !== e.team && Math.hypot(t.x - e.x, t.z - e.z) <= SWING_RANGE + SWING_TOLERANCE) victim = t;
    }
    if (!victim) {
      let best = Infinity;
      for (const t of host.near(e.x, e.z, SWING_RANGE + SWING_TOLERANCE)) {
        if (t === e || t.dead || t.team === e.team || t.kind === 'object') continue;
        const d = Math.hypot(t.x - e.x, t.z - e.z);
        if (d > 0.5 && Math.abs(angDiff(Math.atan2(t.x - e.x, t.z - e.z), facing)) > SWING_ARC / 2) continue;
        if (d < best) { best = d; victim = t; }
      }
    }
    e.face(victim ? Math.atan2(victim.x - e.x, victim.z - e.z) : facing);
    e.anim('attack');
    host.event({ type: 'cast', s: e.id, slot: 0, skill: 'basic', target: victim ? victim.id : undefined });
    if (victim) damage(e, victim, range(rng, 8, 12) + 3 * e.level, 'basic');
    return { ok: true };
  }

  function wolf(m, now, dt) {
    if (m.dead) return;
    const r = m.r;
    if (r.brain === 'chase') {
      // top threat that is still alive and in the room
      let top = null, best = -1;
      for (const [id, v] of r.threat) {
        const p = host.entities.get(id);
        if (!p || p.dead) { r.threat.delete(id); continue; }
        if (v > best) { best = v; top = p; }
      }
      const fromHome = Math.hypot(m.x - r.home.x, m.z - r.home.z);
      if (!top || fromHome > WOLF.leashM || now - r.lastHurt > WOLF.leashMs || (host.inSafeZone && host.inSafeZone(top.x, top.z))) { reset(m); return; }
      m.setTarget(top.id);
      const dx = top.x - m.x, dz = top.z - m.z, d = Math.hypot(dx, dz);
      m.face(Math.atan2(dx, dz));
      if (d > WOLF.reach) {
        const step = Math.min(d - WOLF.reach * 0.8, WOLF.speed * dt);
        const nx = m.x + dx / d * step, nz = m.z + dz / d * step;
        if (host.walkable(nx, nz)) m.moveTo(nx, nz);
        m.loop('run');
      } else if ((r.biteAt || 0) <= now) {
        r.biteAt = now + WOLF.biteMs;
        m.anim('bite');
        const [a, b] = (MONSTER_TYPES[m.type] || MONSTER_TYPES.wolf).dmg(m.level);
        damage(m, top, range(rng, a, b + 1), 'bite');
      }
      return;
    }
    if (r.brain === 'return') {
      const dx = r.home.x - m.x, dz = r.home.z - m.z, d = Math.hypot(dx, dz);
      if (d < 1) { r.brain = 'idle'; m.loop('idle'); return; }
      const step = Math.min(d, WOLF.speed * 1.3 * dt);
      m.face(Math.atan2(dx, dz));
      m.moveTo(m.x + dx / d * step, m.z + dz / d * step);
      m.loop('run');
      return;
    }
    // idle / wander: look for a player
    for (const p of host.near(m.x, m.z, WOLF.aggro)) {
      if (p.kind === 'player' && !p.dead && !(host.inSafeZone && host.inSafeZone(p.x, p.z))) { addThreat(m, p, 1); return; }
    }
    if (now >= r.next) {
      r.next = now + range(ai, 2500, 6000);
      if (r.brain === 'idle' && next(ai) < 0.6) {
        const a = range(ai, 0, Math.PI * 2), rr = range(ai, 2, 8);
        r.wander = { x: r.home.x + Math.cos(a) * rr, z: r.home.z + Math.sin(a) * rr };
        r.brain = 'wander';
      } else { r.brain = 'idle'; m.loop('idle'); }
    }
    if (r.brain === 'wander' && r.wander) {
      const dx = r.wander.x - m.x, dz = r.wander.z - m.z, d = Math.hypot(dx, dz);
      if (d < 0.5) { r.brain = 'idle'; m.loop('idle'); return; }
      const step = Math.min(d, 2.2 * dt);
      m.face(Math.atan2(dx, dz));
      const nx = m.x + dx / d * step, nz = m.z + dz / d * step;
      if (host.walkable(nx, nz)) { m.moveTo(nx, nz); m.loop('walk'); } else { r.brain = 'idle'; m.loop('idle'); }
    }
  }

  function reset(m) {
    m.r.threat.clear(); m.r.credit = null;
    m.r.brain = 'return';
    m.setTarget(0);
    m.setState(STATE.combat, false);
    m.setHp(m.hpMax);
  }

  return {
    addEntity: stats,
    removeEntity(e) {
      for (const m of host.entities.values()) if (m.r.threat) m.r.threat.delete(e.id);
    },
    intent(e, msg) {
      if (msg.t === 'target') { e.setTarget(msg.id || 0); return { ok: true }; }
      if (msg.t === 'cast') {
        if (msg.slot === 0) return basicAttack(e, msg);
        return { ok: false, why: 'unknown' };
      }
      return { ok: false, why: 'unknown' };
    },
    step(dtMs) {
      const now = host.now(), dt = dtMs / 1000;
      for (const e of host.entities.values()) {
        if (e.kind === 'monster') { if (host.isAwake(e.x, e.z)) wolf(e, now, dt); }
        else if (e.kind === 'player' && !e.dead) {
          if ((e.r.combatUntil || 0) <= now) {
            if (e.state & STATE.combat) e.setState(STATE.combat, false);
            if (e.hp < e.hpMax && host.tick % 20 === 0) e.setHp(e.hp + Math.ceil(e.hpMax * 0.04));
          }
        }
      }
    },
    respawn(e) { e.r.combatUntil = 0; },
    levelFor, xpFor,
    /** Loot for a chest opened by `e` (personal). */
    rollLoot(e, { level = e.level, tier = 'chest' } = {}) { return rollLoot(loot, level, { chest: true, rank: tier }); },
    onLevel(e) { stats(e); e.setHp(e.hpMax); },
    dispose() {},
  };
}
