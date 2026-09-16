// Farhold — the bodies on the ground: the player's Chibi 2 character and everything that wants to
// bite it.
//
// Two body builders, one interface. A humanoid is `createChibi2Character` from the avatar JSON; a
// beast is `createCreature` from a creature spec. Both give back `{ group, setAnim, update }`, so
// the enemy code below never asks which kind it is holding.
//
// Enemies live in a ring around the player: they appear out past `minRadius`, walk, notice you,
// chase, swing, die, and are cleared away once you have walked far enough off. Nothing is
// simulated beyond the ring — this is a prototype, not a persistent ecology.

import * as THREE from 'three';
import { createChibi2Character } from '../../../avatar-3d/js/chibi2.js';
import { createCreature } from '../../../avatar-3d/js/creatures.js';
import { normalizeAvatar } from '../../../avatar-2d/js/render.js';
import { familiesOf } from '../../../worldgen/js/biomes.js';
import { makeRng } from '../../emberveil/js/rng.js';
import { tickStatuses, slowOf } from './skills.js';

/** Build a body from a look: `{ avatar }` gives a Chibi 2 humanoid, `{ creature }` gives a beast. */
export async function makeActor(look = {}) {
  // Note: do NOT spread the controller. Chibi 2 hands back an object with GETTERS (`anim`, `parts`,
  // `skeleton`); spreading it evaluates them once and freezes the values, so `actor.anim` would
  // report whatever it was at creation for the rest of the run.
  if (look.creature) {
    const actor = await createCreature(look.creature);
    actor.beast = true;
    return actor;
  }
  const avatar = normalizeAvatar ? normalizeAvatar(look.avatar || {}) : (look.avatar || {});
  const actor = await createChibi2Character(avatar, { swim: !!look.swim });
  actor.beast = false;
  return actor;
}

/** Animation names differ slightly between the two builders; this is the translation. */
function anim(actor, name) {
  if (!actor) return;
  if (actor.beast) {
    const map = { ready: 'idle', run: 'run', walk: 'walk', attack: 'attack', hit: 'idle', dead: 'dead', idle: 'idle', jump: 'run' };
    actor.setAnim(map[name] || 'idle');
  } else {
    actor.setAnim(name);
  }
}
export { anim as setActorAnim };

/**
 * Everything hostile in the world around the player.
 *
 * deps: { scene, terrain, rpg, defs (data/enemies.json enemies), balance, onLog, onKill }
 */
export class EnemyField {
  constructor({ scene, terrain, rpg, defs, balance = {}, onLog = () => {}, onKill = () => {} }) {
    this.scene = scene; this.terrain = terrain; this.rpg = rpg; this.defs = defs;
    this.cfg = balance.spawn || {};
    this.onLog = onLog; this.onKill = onKill;
    this.rng = makeRng(balance.seed ?? 1);
    this.enemies = [];
    this.pending = 0;
    this.sinceSpawn = 0;
  }

  /** The table entries that belong in the biome the player is standing in. */
  defsFor(x, z, level) {
    const families = familiesOf(this.terrain.biomeIdAt(x, z));
    const band = this.cfg.levelSpread ?? 2;
    return this.defs.filter(d => {
      const biomeOk = (d.biomes || ['any']).includes('any') || d.biomes.some(f => families.includes(f));
      const levelOk = (d.minLevel ?? 1) <= level + band && (d.maxLevel ?? 99) >= level - band;
      return biomeOk && levelOk;
    });
  }

  /** Put one enemy on the ground somewhere in the ring around the player. */
  async spawnNear(px, pz, playerLevel) {
    const cfg = this.cfg;
    const min = cfg.minRadius ?? 45, max = cfg.radius ?? 130;
    const angle = this.rng() * Math.PI * 2;
    const dist = min + this.rng() * (max - min);
    const x = px + Math.cos(angle) * dist, z = pz + Math.sin(angle) * dist;
    const [cx, cz] = this.terrain.clampToWorld(x, z);
    if (this.terrain.underwater(cx, cz)) return null;
    const pool = this.defsFor(cx, cz, playerLevel);
    if (!pool.length) return null;
    const def = this.rng.pick(pool);
    const level = Math.max(1, Math.min(def.maxLevel ?? 30, playerLevel + this.rng.int(-1, 2)));
    return this.add(def, level, cx, cz);
  }

  /** Add a specific enemy at a specific spot (the tests and the console use this). */
  async add(def, level, x, z) {
    const unit = this.rpg.makeEnemy(def, level, this.rng);
    unit.x = x; unit.z = z; unit.y = this.terrain.heightAt(x, z);
    unit.state = 'wander'; unit.wanderTimer = 0; unit.swingTimer = 0; unit.hitFlash = 0;
    unit.home = [x, z];
    unit.facing = this.rng() * Math.PI * 2;
    this.pending++;
    let actor = null;
    try {
      actor = await makeActor(def.look || {});
    } finally {
      this.pending--;
    }
    if (!actor) return null;
    unit.actor = actor;
    actor.group.position.set(x, unit.y, z);
    this.scene.add(actor.group);
    anim(actor, 'idle');
    this.enemies.push(unit);
    return unit;
  }

  /** One tick of the whole field: spawn, think, move, swing, clean up. */
  update(dt, player, playerUnit, hooks = {}) {
    const cfg = this.cfg;
    this.sinceSpawn += dt;
    const alive = this.enemies.length + this.pending;
    if (this.sinceSpawn >= (cfg.everySeconds ?? 2.5) && alive < (cfg.maxAlive ?? 14)) {
      this.sinceSpawn = 0;
      this.spawnNear(player.x, player.z, playerUnit.level);
    }

    const despawn = cfg.despawnRadius ?? 320;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dx = player.x - e.x, dz = player.z - e.z;
      const dist = Math.hypot(dx, dz);

      if (e.dying != null) {
        e.dying += dt;
        e.actor.group.position.y = e.y - Math.min(1.2, e.dying * 0.4);
        e.actor.update(dt);
        if (e.dying > 2.4) { this.remove(i); }
        continue;
      }
      if (dist > despawn) { this.remove(i); continue; }

      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.swingTimer > 0) e.swingTimer -= dt;

      // burns and poisons keep working between swings; a chill takes the legs out of the chase
      if (e.statuses) {
        const burned = tickStatuses(e, dt);
        if (burned > 0) {
          e.hitFlash = Math.max(e.hitFlash, 0.08);
          hooks.onStatusDamage?.(e, burned);
          if (e.hp <= 0) { this.kill(e); continue; }
        }
      }

      // decide
      if (e.state !== 'chase' && dist < e.aggroRange) {
        e.state = 'chase';
      } else if (e.state === 'chase' && dist > e.aggroRange * 2.2) {
        e.state = 'wander';
      }

      let speed = 0;
      if (e.state === 'chase') {
        e.facing = Math.atan2(dx, dz);
        if (dist > e.reach) {
          speed = e.speed;
        } else if (e.swingTimer <= 0) {
          e.swingTimer = e.attackEvery;
          anim(e.actor, 'attack');
          hooks.onEnemyStrike?.(e);
        }
      } else {
        e.wanderTimer -= dt;
        if (e.wanderTimer <= 0) {
          e.wanderTimer = 2 + this.rng() * 4;
          e.facing = this.rng() * Math.PI * 2;
          e.strolling = this.rng() < 0.6;
        }
        if (e.strolling) speed = e.speed * 0.32;
      }

      if (speed > 0) {
        speed *= 1 - slowOf(e);
        const nx = e.x + Math.sin(e.facing) * speed * dt;
        const nz = e.z + Math.cos(e.facing) * speed * dt;
        const [cx, cz] = this.terrain.clampToWorld(nx, nz);
        if (!this.terrain.underwater(cx, cz)) { e.x = cx; e.z = cz; }
        else { e.facing += Math.PI; }
      }
      e.y = this.terrain.heightAt(e.x, e.z);
      e.actor.group.position.set(e.x, e.y, e.z);
      e.actor.group.rotation.y = e.facing;
      if (e.swingTimer <= 0 || e.state !== 'chase') {
        anim(e.actor, speed > e.speed * 0.6 ? 'run' : speed > 0 ? 'walk' : 'idle');
      }
      e.actor.update(dt);
    }
  }

  /** Damage everything inside the player's swing. Returns what was hit. */
  strike(player, playerUnit, { reach = 2.9, arc = 1.5, power = 1, onHit = null } = {}) {
    const hits = [];
    for (const e of this.enemies) {
      if (e.dying != null) continue;
      const dx = e.x - player.x, dz = e.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach + (e.reach || 2) * 0.4) continue;
      const toEnemy = Math.atan2(dx, dz);
      let delta = Math.abs(((toEnemy - player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (delta > arc / 2) continue;
      const result = this.rpg.strike(playerUnit, e, this.rng, { multiplier: power });
      e.hitFlash = 0.18;
      if (e.state !== 'chase') e.state = 'chase';
      onHit?.(e, result);
      hits.push({ enemy: e, result });
      if (result.dead) this.kill(e);
    }
    return hits;
  }

  /**
   * Damage everything within `radius` of a point — an arrow landing, or a heavy weapon's shockwave.
   * Every attack in the game goes through this or `strike`, so nothing is ever single-target.
   */
  strikeArea(x, z, radius, attacker, { falloff = 0.45, power = 1, onHit = null } = {}) {
    const hits = [];
    for (const e of this.enemies) {
      if (e.dying != null) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > radius + (e.reach || 2) * 0.25) continue;
      // full damage at the centre, `falloff` of it at the rim
      const near = 1 - (1 - falloff) * Math.min(1, d / Math.max(0.001, radius));
      const result = this.rpg.strike(attacker, e, this.rng, { multiplier: near * power });
      e.hitFlash = 0.18;
      if (e.state !== 'chase') e.state = 'chase';
      onHit?.(e, result);
      hits.push({ enemy: e, result });
      if (result.dead) this.kill(e);
    }
    return hits;
  }

  /**
   * The nearest live enemy along a shot, in three dimensions — a bow that can only scan the
   * horizontal plane cannot hit anything up a slope or down a bank.
   */
  hitScan(x, y, z, dirX, dirY, dirZ, { range = 40, width = 1.1 } = {}) {
    let best = null, bestT = Infinity;
    for (const e of this.enemies) {
      if (e.dying != null) continue;
      const ex = e.x - x, ey = (e.y + 0.9) - y, ez = e.z - z;    // aim at the body, not the feet
      const t = ex * dirX + ey * dirY + ez * dirZ;               // distance along the shot
      if (t < 0 || t > range) continue;
      const off = Math.hypot(ex - dirX * t, ey - dirY * t, ez - dirZ * t);
      if (off > width + (e.reach || 2) * 0.3) continue;
      if (t < bestT) { bestT = t; best = e; }
    }
    return best ? { enemy: best, distance: bestT } : null;
  }

  kill(e) {
    if (e.dying != null) return;
    e.dying = 0;
    anim(e.actor, 'dead');
    this.onKill(e);
  }

  remove(i) {
    const e = this.enemies[i];
    this.scene.remove(e.actor.group);
    e.actor.dispose?.();
    this.enemies.splice(i, 1);
  }

  /** The enemy the player is most likely aiming at, for the nameplate. */
  target(player, { maxDistance = 40 } = {}) {
    let best = null, bestScore = Infinity;
    for (const e of this.enemies) {
      if (e.dying != null) continue;
      const dx = e.x - player.x, dz = e.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > maxDistance) continue;
      const toEnemy = Math.atan2(dx, dz);
      const delta = Math.abs(((toEnemy - player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const score = delta * 14 + dist * 0.3;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  clear() { while (this.enemies.length) this.remove(this.enemies.length - 1); }
}
