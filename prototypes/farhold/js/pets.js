// Farhold — companions: the thing that follows you and bites what you are biting.
//
// A necromancer without skeletons is a mage with a worse hat. Pets are a class's identity, so this
// is a real system rather than a cosmetic: each pet is a full body (the same Chibi 2 / creature
// builders enemies use, so they animate), each has its own AI, each scales off its OWNER's level so
// it never falls behind, and each can die and be raised again after a cooldown.
//
// The AI is three states and nothing clever:
//   follow   — stay inside `follow` metres of the owner, at a slot around them so they do not stack
//   engage   — something is inside `engage` metres of the owner: go and hit it
//   return   — too far from the owner (`leash`), give up and come back
//
//   const pets = createPets({ scene, terrain, rpg, defs, balance, field });
//   await pets.summon('bone_thrall', owner, { count: 2 });
//   pets.update(dt, control, player, { onLog });
//
// Pets use the enemy field's own `strike` maths in reverse: `rpg.strike(pet, enemy)`, so an affix
// that says "your companions hit 40% harder" is a multiplier in one place.

import * as THREE from 'three';
import { makeActor, setActorAnim } from './actors.js';
import { makeRng } from '../../emberveil/js/rng.js';
import { tickStatuses, slowOf } from './skills.js';

/**
 * Which pets a class brings, and what it calls them. Data rather than code because the class list
 * is data: `data/classes.json` can override any of this per class.
 */
export const CLASS_PETS = {
  necromancer: { id: 'bone_thrall', count: 2, extra: { id: 'bone_archer', count: 1 }, verb: 'raises' },
  druid: { id: 'grove_wolf', count: 2, verb: 'calls' },
  shaman: { id: 'spirit_bear', count: 1, verb: 'calls up' },
  warlock: { id: 'bound_imp', count: 1, extra: { id: 'ember_familiar', count: 1 }, verb: 'binds' },
  pyromancer: { id: 'ember_familiar', count: 1, verb: 'kindles' },
  stormcaller: { id: 'storm_familiar', count: 1, verb: 'calls down' },
  tinker: { id: 'clockwork_sentry', count: 1, verb: 'winds up' },
  ranger: { id: 'hunting_cat', count: 1, verb: 'whistles for' },
  demon_hunter: { id: 'dire_companion', count: 1, verb: 'unleashes' },
  sorcerer: { id: 'storm_familiar', count: 1, verb: 'conjures' },
  oracle: { id: 'ember_familiar', count: 1, verb: 'wakes' },
  enchanter: { id: 'bound_imp', count: 1, verb: 'charms' },
  priest: { id: 'spirit_bear', count: 1, verb: 'is joined by' },
};

export function createPets({ scene, terrain, rpg, defs = [], balance = {}, field = null, statuses = {} }) {
  const cfg = balance.pets || {};
  const rng = makeRng((balance.seed ?? 1) ^ 0x9e11);
  const pets = [];
  let pending = 0;
  let currentTerrain = terrain;

  const byId = Object.fromEntries(defs.map(d => [d.id, d]));

  /** Build a live pet from a table entry, scaled off its owner. */
  function make(def, owner) {
    const level = owner.level || 1;
    const scale = Math.pow(cfg.perLevel ?? 1.17, level - 1);
    // affixes and legendary powers get a say in how strong a companion is
    const power = rpg.fx.product(owner, 'petPower');
    const health = rpg.fx.product(owner, 'petHealth');
    const hp = Math.max(1, Math.round((def.hp ?? 30) * scale * health));
    return {
      id: 'p' + Math.floor(rng() * 1e9).toString(36),
      defId: def.id, name: def.name, kind: def.kind || 'beast', family: def.family || 'beast',
      role: def.role || 'skirmisher', level,
      hp, maxHp: hp,
      dmg: (def.dmg ?? [4, 6]).map(v => Math.max(1, Math.round(v * scale * power))),
      armor: Math.round((def.armor ?? 0) * scale),
      derived: { resistAll: 0, thorns: 0, dodge: 0 },
      speed: def.speed ?? 4.4, reach: def.reach ?? 2.4, attackEvery: def.attackEvery ?? 1.5,
      ranged: def.ranged || null, onHit: def.onHit || null, flying: !!def.flying, glow: def.glow || null,
      look: def.look || null,
      state: 'follow', swingTimer: 0, hitFlash: 0, slot: pets.length,
      owner,
    };
  }

  /** Put `count` of a pet into the world beside its owner. */
  async function summon(defId, owner, { count = 1, at = null } = {}) {
    const def = byId[defId];
    if (!def) return [];
    const made = [];
    for (let i = 0; i < count; i++) {
      if (pets.length + pending >= (cfg.maxAlive ?? 6)) break;
      const unit = make(def, owner);
      const home = at || { x: owner.x ?? 0, z: owner.z ?? 0 };
      const a = rng() * Math.PI * 2;
      unit.x = home.x + Math.cos(a) * 2.4;
      unit.z = home.z + Math.sin(a) * 2.4;
      unit.y = currentTerrain.heightAt(unit.x, unit.z);
      unit.facing = a;
      unit.hover = def.flying ? 1.3 + rng() * 0.5 : 0;
      unit.bob = rng() * Math.PI * 2;
      unit.slot = pets.length + made.length;
      pending++;
      let actor = null;
      try { actor = await makeActor(def.look || {}); } finally { pending--; }
      if (!actor) continue;
      unit.actor = actor;
      actor.group.position.set(unit.x, unit.y, unit.z);
      scene.add(actor.group);
      setActorAnim(actor, 'idle');
      pets.push(unit);
      made.push(unit);
    }
    return made;
  }

  /** The whole roster a class starts with. */
  async function summonForClass(classId, owner, overrides = null) {
    const spec = overrides || CLASS_PETS[classId];
    if (!spec) return [];
    const out = await summon(spec.id, owner, { count: spec.count || 1 });
    if (spec.extra) out.push(...await summon(spec.extra.id, owner, { count: spec.extra.count || 1 }));
    return out;
  }

  /** One frame of every companion. `at` is where the owner is standing. */
  function update(dt, at, owner, hooks = {}) {
    const leash = cfg.leash ?? 26;
    const followAt = cfg.follow ?? 4.5;
    const engageAt = cfg.engage ?? 22;

    for (let i = pets.length - 1; i >= 0; i--) {
      const p = pets[i];

      if (p.dying != null) {
        p.dying += dt;
        p.actor.group.position.y = p.y - Math.min(1.2, p.dying * 0.4);
        p.actor.update(dt);
        if (p.dying > 2.2) {
          scene.remove(p.actor.group);
          p.actor.dispose?.();
          pets.splice(i, 1);
          // it comes back: the owner gets it again after the cooldown
          hooks.onFallen?.(p);
        }
        continue;
      }

      if (p.hitFlash > 0) p.hitFlash -= dt;
      if (p.swingTimer > 0) p.swingTimer -= dt;
      if (p.statuses) {
        const hurt = tickStatuses(p, dt);
        if (hurt > 0 && p.hp <= 0) { fall(p); continue; }
      }

      const toOwner = Math.hypot(at.x - p.x, at.z - p.z);
      // A companion is never lost. If the owner has gone a long way in one step — a teleport, a
      // map jump, climbing out of a dungeon — walking back would take a minute, so it catches up.
      if (toOwner > leash * 2.5) {
        const a = rng() * Math.PI * 2;
        p.x = at.x + Math.cos(a) * 3;
        p.z = at.z + Math.sin(a) * 3;
        p.y = currentTerrain.heightAt(p.x, p.z);
        p.actor.group.position.set(p.x, p.y + (p.hover || 0), p.z);
        p.target = null;
        continue;
      }

      // pick a target: the nearest thing that is bothering the owner, or that the pet is fighting
      let target = p.target;
      if (target && (target.dying != null || Math.hypot(target.x - at.x, target.z - at.z) > leash * 1.4)) target = null;
      if (!target && field) {
        let best = null, bestD = engageAt;
        for (const e of field.enemies) {
          if (e.dying != null) continue;
          const d = Math.hypot(e.x - at.x, e.z - at.z);
          if (d < bestD) { bestD = d; best = e; }
        }
        target = best;
      }
      p.target = target;

      // states
      if (toOwner > leash) p.state = 'return';
      else if (target) p.state = 'engage';
      else p.state = 'follow';

      let speed = 0, goalX = at.x, goalZ = at.z, close = followAt;
      if (p.state === 'engage' && target) {
        goalX = target.x; goalZ = target.z;
        close = p.ranged ? Math.min(p.ranged.range * 0.7, p.ranged.range - 4) : p.reach;
      } else {
        // a slot around the owner, so three skeletons do not stand in one skeleton's place
        const a = (p.slot / Math.max(1, pets.length)) * Math.PI * 2;
        goalX = at.x + Math.cos(a) * 2.6;
        goalZ = at.z + Math.sin(a) * 2.6;
        close = 1.2;
      }

      const dx = goalX - p.x, dz = goalZ - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > close) {
        p.facing = Math.atan2(dx, dz);
        speed = p.speed * (p.state === 'return' || toOwner > 12 ? 1.5 : 1);
      } else if (p.state === 'engage' && target && p.swingTimer <= 0) {
        p.facing = Math.atan2(target.x - p.x, target.z - p.z);
        p.swingTimer = p.attackEvery;
        setActorAnim(p.actor, 'attack');
        const result = rpg.strike(p, target, rng, { element: p.ranged?.element || 'physical' });
        target.hitFlash = 0.18;
        if (target.state !== 'chase') target.state = 'chase';
        if (p.onHit?.length) field?.statusOnHit(p, target, statuses);
        hooks.onPetHit?.(p, target, result);
        if (result.dead) { field?.kill(target); p.target = null; }
      }

      if (speed > 0) {
        speed *= 1 - slowOf(p);
        const nx = p.x + Math.sin(p.facing) * speed * dt;
        const nz = p.z + Math.cos(p.facing) * speed * dt;
        let [cx, cz] = currentTerrain.clampToWorld(nx, nz);
        if (!p.hover && field) [cx, cz] = field.unstick(cx, cz, (p.reach || 2) * 0.28);
        if (!currentTerrain.underwater(cx, cz)) { p.x = cx; p.z = cz; }
        else { p.x = at.x; p.z = at.z; }        // a companion will not drown chasing you across a river
      }
      p.y = currentTerrain.heightAt(p.x, p.z);
      let y = p.y;
      if (p.hover) { p.bob += dt * 1.8; y += p.hover + Math.sin(p.bob) * 0.2; }
      p.actor.group.position.set(p.x, y, p.z);
      p.actor.group.rotation.y = p.facing;
      if (p.swingTimer <= 0 || p.state !== 'engage') {
        setActorAnim(p.actor, speed > p.speed * 0.7 ? 'run' : speed > 0 ? 'walk' : 'idle');
      }
      p.actor.update(dt);
    }
  }

  /** Something killed a companion. */
  function fall(p) {
    if (p.dying != null) return;
    p.dying = 0;
    p.target = null;
    setActorAnim(p.actor, 'dead');
  }

  /** Damage every companion in an area — an enemy's swing catches them too. */
  function splash(x, z, radius, attacker, { power = 1, element = 'physical' } = {}) {
    const hits = [];
    for (const p of pets) {
      if (p.dying != null) continue;
      if (Math.hypot(p.x - x, p.z - z) > radius) continue;
      const result = rpg.strike(attacker, p, rng, { multiplier: power, element });
      p.hitFlash = 0.18;
      hits.push({ pet: p, result });
      if (result.dead) fall(p);
    }
    return hits;
  }

  /** The nearest companion to a point — an enemy picks one of these instead of the player. */
  function nearest(x, z, range = 3.2) {
    let best = null, bestD = range;
    for (const p of pets) {
      if (p.dying != null) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /** Heal every companion — `cond_partyHpOnKill` and the set powers land here. */
  function heal(amount) {
    for (const p of pets) {
      if (p.dying != null) continue;
      p.hp = Math.min(p.maxHp, p.hp + amount);
    }
  }

  function clear() {
    for (const p of pets) { scene.remove(p.actor.group); p.actor.dispose?.(); }
    pets.length = 0;
  }

  return {
    pets, summon, summonForClass, update, splash, nearest, heal, fall, clear,
    setTerrain: t => { currentTerrain = t; },
    /** For the character sheet: name, health, what it is doing. */
    roster: () => pets.filter(p => p.dying == null).map(p => ({
      name: p.name, hp: Math.ceil(p.hp), maxHp: p.maxHp, state: p.state, level: p.level,
    })),
    get alive() { return pets.filter(p => p.dying == null).length; },
    stats: () => ({ pets: pets.length, alive: pets.filter(p => p.dying == null).length }),
  };
}
