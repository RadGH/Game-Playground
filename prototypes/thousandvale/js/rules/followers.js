// Thousandvale — FOLLOWERS on the server: companions, summons, temporary summons, decoys, hirelings.
//
// Forked from Farhold's `createPets` (prototypes/farhold/js/pets.js — it imports Three.js for the
// bodies) with the meshes taken out. Same numbers (followers.js `scaleFollower`, upgrades, abilities,
// the follower-slot gate), same brain (follow, engage, leash, abilities, revive after 14 s), same rng
// order — tests/C/parity-classes.test.mjs runs the class companions and summoning skills against the
// real pets.js. What is different on purpose:
//   * per OWNER and per ROOM: a follower is a unit in its room's field (`field.allies`), owned by a
//     player (`unit.owner`); monsters see it, fight it, and can kill it;
//   * a follower is also a room entity (kind `npc`, team 1) when the room gives a `spawnEntity` hook,
//     so every client draws it; its id is the entity's id;
//   * a handoff carries an owner's followers into the next room (index.js).
//
//   attachFollowers(room, { rng, spawnEntity, despawnEntity })   once per room
//   followers.summon(defId, owner, opts) -> [units]            synchronous (no mesh to await)

import {
  scaleFollower, slotsForLevel, perTypeCapFor, admitFollower, tickStatuses, slowOf, applyStatus,
  groundAt, wetAt, cliffStep,
} from './farhold.js';
import { makeRng } from './rng.js';

/** pets.js CLASS_PETS lives on each class row (`classDef.pet`); this is the fallback for a missing one. */
export const DEFAULT_CAP = 6;
const TEMP_CAP = 12;
export const isPureHeal = ab => !!(ab && ab.heal) && !(ab && ab.mult);

export function attachFollowers(room, { rng = null, spawnEntity = null, despawnEntity = null } = {}) {
  const field = room.field, engine = room.engine, rpg = engine.rpg;
  const balance = engine.balance;
  const cfg = balance.pets || {};
  const statuses = engine.statuses;
  const rngPets = rng || makeRng(((room.seed ?? 1) ^ 0x9e11) >>> 0);
  const merc = engine.mercenaries || {};
  const byId = Object.fromEntries((engine.bestiary.pets || []).map(d => [d.id, d]));
  const FLOOR = { aggro: 55 };
  const engageAt = Math.max(cfg.aggro ?? 0, cfg.engage ?? 0, FLOOR.aggro);
  const leash = Math.max(cfg.leash ?? 0, engageAt + 12);
  const sprint = (balance.player?.moveSpeed ?? 5.4) * (balance.player?.runMultiplier ?? 2.1);
  const T = () => field.terrain;
  let idN = 0;

  // hirelings (followers.js createFollowers registers them as pet defs)
  for (const m of merc.mercenaries || []) {
    byId[m.id] = { id: m.id, name: m.name, kind: 'humanoid', family: 'human', role: m.role || 'brute', hp: m.hp, dmg: m.dmg, armor: m.armor, speed: m.speed, reach: m.reach, attackEvery: m.attackEvery, ranged: m.ranged || null, onHit: m.onHit || null, look: m.look || null, abilities: (m.abilities || []).map(a => ({ ...a })), upgrades: (m.upgrades || []).map(u => ({ ...u })), abilityBook: merc.abilities || {} };
  }
  const spellCountFor = new Map();
  for (const s of Object.values(engine.skillData.skills || {})) if (s.shape === 'summon' && s.pet && !s.summon?.temporary) spellCountFor.set(s.pet, Math.max(1, s.count || 1));

  const F = { room, byId };
  room.followers = F;
  const bookOf = owner => owner.pets || (owner.pets = { list: [], fallen: [], hpSeen: null });
  const listOf = owner => bookOf(owner).list;
  F.of = listOf;
  F.register = def => { if (def?.id) byId[def.id] = def; return def; };

  /** followers.js `createFollowers` gate: follower slots by level (3/4/5) and one of each summoned kind. */
  function admitted(owner, defId, { origin = 'summon', name = null } = {}) {
    const alive = listOf(owner).filter(p => p.dying == null && !p.temporary).map(p => ({ defId: p.defId, origin: p.origin || 'summon', name: p.name, uid: p.id }));
    return admitFollower({
      defId, origin, alive, name,
      limit: slotsForLevel(owner.level || 1, owner.derived || null, merc.slots),
      perTypeCap: perTypeCapFor({ spellCount: spellCountFor.get(defId) || 1, derived: owner.derived || null, rules: merc.perType }),
    });
  }
  F.canAdmit = (owner, defId, opts = {}) => admitted(owner, defId, { origin: 'summon', ...opts });

  /** pets.js `make` */
  function make(def, owner) {
    const level = owner.level || 1;
    const power = rpg.fx.product(owner, 'petPower');
    const health = rpg.fx.product(owner, 'petHealth');
    const at = scaleFollower({ def, level, perLevel: cfg.perLevel ?? 1.13, power, health, ownerDamage: owner.derived?.damage || null });
    return {
      id: 'p' + Math.floor(rngPets() * 1e9).toString(36),
      defId: def.id, name: def.name, kind: def.kind || 'beast', family: def.family || 'beast',
      role: def.role || 'skirmisher', level,
      hp: at.hp, maxHp: at.hp, dmg: at.dmg, armor: at.armor,
      derived: { resistAll: 0, thorns: 0, dodge: 0 },
      speed: def.speed ?? 4.4, reach: def.reach ?? 2.4, attackEvery: def.attackEvery ?? 1.5,
      ranged: def.ranged ? { ...def.ranged } : null, onHit: def.onHit || null, flying: !!def.flying,
      state: 'follow', swingTimer: 0, hitFlash: 0, slot: listOf(owner).length,
      origin: 'summon',
      abilities: (def.abilities || []).filter(a => (a.minLevel ?? 1) <= level).map(a => ({ ...a, ready: (a.cooldown || 10) * 0.4 })),
      abilityBook: def.abilityBook || null, upgrades: def.upgrades || [], learned: [], carrying: null,
      owner, look: def.look || null,
    };
  }

  /** pets.js `retune` + `applyUpgrades` (the look refit is the client's) */
  function retune(p) {
    const def = byId[p.defId];
    const level = p.owner?.level || 1;
    if (!def) return;
    if (level === p.level && p.upgradesAt === level) return;
    p.upgradesAt = level;
    const frac = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    const power = rpg.fx.product(p.owner, 'petPower');
    const health = rpg.fx.product(p.owner, 'petHealth');
    p.level = level;
    const grown = { dmgMult: 1, hpMult: 1, armorAdd: 0, rangeAdd: 0 };
    for (const up of p.upgrades || []) {
      if (level < (up.atLevel ?? 1)) continue;
      grown.dmgMult *= up.dmgMult ?? 1; grown.hpMult *= up.hpMult ?? 1;
      grown.armorAdd += up.armorAdd ?? 0; grown.rangeAdd += up.rangeAdd ?? 0;
      const key = up.atLevel + ':' + (up.note || '');
      if (p.learned.includes(key)) continue;
      p.learned.push(key);
      if (up.ability) {
        const spec = p.abilityBook?.[up.ability] || (def.abilities || []).find(a => a.id === up.ability);
        if (spec && !(p.abilities || []).some(a => a.id === spec.id)) p.abilities.push({ ...spec, ready: spec.cooldown || 10 });
      }
      if (up.note) p.carrying = up.note;
      if (up.bringsCount) p.bringsCount = up.bringsCount;
    }
    if (p.ranged) p.ranged.range = (def.ranged?.range ?? 20) + grown.rangeAdd;
    const at = scaleFollower({ def, level, perLevel: cfg.perLevel ?? 1.13, power, health, grown, ownerDamage: p.owner?.derived?.damage || null });
    p.maxHp = at.hp;
    p.hp = Math.max(1, Math.round(p.maxHp * frac));
    p.dmg = at.dmg;
    p.armor = at.armor;
  }

  /** Put a follower unit into this room (field + optional room entity). */
  function admitUnit(p) {
    if (spawnEntity) {
      const id = spawnEntity(p);
      if (id != null) p.id = id;
    }
    field.add(p, 'ally');
    listOf(p.owner).push(p);
    field.emit({ t: 'fx', kind: 'summon', id: p.id, owner: p.owner.id, defId: p.defId });
    return p;
  }
  F.adopt = admitUnit;

  /** pets.js `summon`, synchronous. */
  F.summon = (defId, owner, { count = 1, at = null, origin = 'summon', name = null, temporary = false, lifetime = 0, decoy = null, burstOnExpire = null, hpShare = null, look = null, heal = null, taunt = 0 } = {}) => {
    const def = byId[defId];
    const made = [];
    made.refused = null;
    if (!def) return made;
    for (let i = 0; i < count; i++) {
      if (temporary) {
        if (listOf(owner).filter(p => p.temporary).length >= TEMP_CAP) { made.refused = 'Too many summoned things at once.'; break; }
      } else {
        const allow = admitted(owner, defId, { origin, name: name || def.name });
        if (!allow.ok) { made.refused = allow.why; break; }
      }
      const unit = make(look ? { ...def, look } : def, owner);
      unit.origin = temporary ? 'temporary' : origin;
      if (name) unit.name = name;
      if (temporary) {
        unit.temporary = true;
        unit.left = lifetime || 10;
        unit.burstOnExpire = burstOnExpire || null;
        unit.healPulse = heal ? { ...heal, next: heal.every ?? 2 } : null;
        unit.tauntOnSpawn = taunt || 0;
      }
      if (decoy) {
        unit.decoy = true;
        unit.hp = unit.maxHp = Math.max(1, Math.round((owner.maxHp || 100) * (decoy.hpShare ?? hpShare ?? 0.3)));
        unit.onStruck = decoy.onStruck || null;
      }
      const home = at || { x: owner.x ?? 0, z: owner.z ?? 0 };
      const a = rngPets() * Math.PI * 2;
      unit.x = home.x + Math.cos(a) * 2.4;
      unit.z = home.z + Math.sin(a) * 2.4;
      unit.y = T() ? groundAt(T(), unit.x, unit.z, owner?.y ?? Infinity) : 0;
      unit.facing = a;
      unit.hover = def.flying ? 1.3 + rngPets() * 0.5 : 0;
      unit.bob = rngPets() * Math.PI * 2;
      unit.slot = listOf(owner).length;
      admitUnit(unit);
      made.push(unit);
    }
    return made;
  };

  /** The class companion a class starts with (classes.json `pet`), as Farhold's begin() calls it. */
  F.summonForClass = (owner, spec) => {
    if (!spec) return [];
    const out = F.summon(spec.id, owner, { count: spec.count || 1, origin: 'companion' });
    if (spec.extra) out.push(...F.summon(spec.extra.id, owner, { count: spec.extra.count || 1, origin: 'companion' }));
    return out;
  };

  function dropUnit(p) {
    p.removed = true;
    field.detach(p);
    const l = listOf(p.owner), i = l.indexOf(p);
    if (i >= 0) l.splice(i, 1);
    despawnEntity?.(p);
  }
  F.remove = dropUnit;

  /** pets.js `fall` */
  F.fall = p => { if (p.dying != null) return; p.dying = 0; p.target = null; p.anim = 'dead'; };

  // ---------------------------------------------------------------- the brain (pets.js update)

  F.tick = (dt, hooks = {}) => {
    const followAt = cfg.follow ?? 4.5;
    for (const owner of field.players) {
      const book = bookOf(owner);
      const at = owner;
      const ownerHurt = book.hpSeen != null && (owner.hp ?? 0) < book.hpSeen;
      book.hpSeen = owner.hp ?? null;
      for (let i = book.fallen.length - 1; i >= 0; i--) {
        book.fallen[i].left -= dt;
        if (book.fallen[i].left > 0) continue;
        const back = book.fallen.splice(i, 1)[0];
        if (owner.dead) { book.fallen.push({ ...back, left: 1 }); continue; }
        const made = F.summon(back.defId, owner, { count: 1, at, origin: back.origin, name: back.name });
        if (made[0]) hooks.onReturned?.(made[0]);
      }
      const pets = book.list;
      for (let i = pets.length - 1; i >= 0; i--) {
        const p = pets[i];
        if (p.dying != null) {
          p.dying += dt;
          if (p.dying > 2.2) {
            dropUnit(p);
            if (!p.temporary) book.fallen.push({ defId: p.defId, left: cfg.reviveSeconds ?? 14, origin: p.origin || 'summon', name: p.name || null });
            hooks.onFallen?.(p);
          }
          continue;
        }
        retune(p);
        if (p.swingTimer > 0) p.swingTimer -= dt;
        if (p.barrierFor > 0) { p.barrierFor -= dt; if (p.barrierFor <= 0) { p.barrierFor = 0; p.barrier = 0; } }
        if (p.temporary) {
          p.left -= dt;
          if (p.left <= 0) { hooks.onExpire?.(p); dropUnit(p); continue; }
          if (p.healPulse) {
            p.healPulse.next -= dt;
            if (p.healPulse.next <= 0) { p.healPulse.next = p.healPulse.every ?? 2; hooks.onHealPulse?.(p, p.healPulse); }
          }
        }
        if (p.tauntOnSpawn > 0) {
          for (const e of field.monsters) if (e.dying == null && Math.hypot(e.x - p.x, e.z - p.z) <= 8) petTaunt(e, p, p.tauntOnSpawn);
          p.tauntOnSpawn = 0;
        }
        if (p.order) { p.order.left -= dt; if (p.order.left <= 0 || p.order.target?.dying != null || p.order.target?.removed) p.order = null; }
        if (p.statuses) {
          const hurt = tickStatuses(p, dt);
          if (hurt > 0 && p.hp <= 0) { F.fall(p); continue; }
        }
        const toOwner = Math.hypot(at.x - p.x, at.z - p.z);
        if (toOwner > leash * 2.5) {
          const a = rngPets() * Math.PI * 2;
          p.x = at.x + Math.cos(a) * 3; p.z = at.z + Math.sin(a) * 3;
          p.y = T() ? groundAt(T(), p.x, p.z, at.y ?? Infinity) : 0;
          p.target = null;
          continue;
        }
        const selfHurt = p._hpSeen != null && p.hp < p._hpSeen;
        p._hpSeen = p.hp;
        if (p.decoy || p.statuses?.stasis) { p.anim = 'idle'; continue; }
        let target = p.target;
        if (target && (target.removed || target.dying != null || Math.hypot(target.x - at.x, target.z - at.z) > leash * 1.4)) target = null;
        if (selfHurt || ownerHurt || !target) {
          const fromX = selfHurt ? p.x : at.x, fromZ = selfHurt ? p.z : at.z;
          let best = null, bestD = selfHurt || ownerHurt ? Math.max(engageAt, leash) : engageAt;
          for (const e of field.monsters) {
            if (e.dying != null || e.removed) continue;
            const d = Math.hypot(e.x - fromX, e.z - fromZ);
            if (d < bestD) { bestD = d; best = e; }
          }
          if (best || !target) target = best;
        }
        if (p.order) {
          if ((p.order.kind === 'focus' || p.order.kind === 'pounce') && p.order.target) target = p.order.target;
          else if (p.order.kind === 'return') target = null;
          else if (p.order.kind === 'guard' && target && Math.hypot(target.x - at.x, target.z - at.z) > 4 + (target.reach || 2)) target = null;
        }
        p.target = target;
        if (toOwner > leash) p.state = 'return';
        else if (target) p.state = 'engage';
        else p.state = 'follow';
        for (const ab of p.abilities || []) ab.ready = Math.max(0, (ab.ready ?? 0) - dt);
        if (p.abilities?.length) castAbility(p, target, hooks);

        let speed = 0, goalX, goalZ, close;
        if (p.state === 'engage' && target) {
          goalX = target.x; goalZ = target.z;
          close = p.ranged ? Math.min(p.ranged.range * 0.7, p.ranged.range - 4) : p.reach;
        } else {
          const a = (p.slot / Math.max(1, pets.length)) * Math.PI * 2;
          goalX = at.x + Math.cos(a) * 2.6; goalZ = at.z + Math.sin(a) * 2.6;
          close = 1.2;
        }
        const dx = goalX - p.x, dz = goalZ - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > close) {
          p.facing = Math.atan2(dx, dz);
          speed = Math.max(p.speed, sprint) * (p.state === 'return' || toOwner > 12 ? 1.2 : 1);
        } else if (p.state === 'engage' && target && p.swingTimer <= 0) {
          p.facing = Math.atan2(target.x - p.x, target.z - p.z);
          p.swingTimer = p.attackEvery;
          p.anim = 'attack';
          const boost = (p.empowered || 0);
          p.empowered = 0;
          const result = rpg.strike(p, target, rngPets, { element: p.ranged?.element || 'physical', multiplier: 1 + boost });
          if (p.biteStatus && statuses?.[p.biteStatus]) applyStatus(target, p.biteStatus, statuses[p.biteStatus], Math.max(1, result.amount * 0.5));
          hooks.onPetStrike?.(p, target, result);
          creditFor(target, p, result.amount);
          petTaunt(target, p);
          if (p.onHit?.length) statusOnHit(p, target);
          field.report(p, target, result, 'pet');
          if (result.dead) { field.kill(target); p.target = null; }
        }
        if (speed > 0) {
          speed *= 1 - slowOf(p);
          const nx = p.x + Math.sin(p.facing) * speed * dt;
          const nz = p.z + Math.cos(p.facing) * speed * dt;
          let [cx, cz] = T()?.clampToWorld ? T().clampToWorld(nx, nz) : [nx, nz];
          if (!p.hover && T()) [cx, cz] = cliffStep(T(), p, cx, cz, dt, { feet: p.y }, [0, 0]);
          if (!(T() && wetAt(T(), cx, cz, p.y))) { p.x = cx; p.z = cz; } else { p.x = at.x; p.z = at.z; }
        }
        p.y = T() ? groundAt(T(), p.x, p.z, p.y) : 0;
        if (p.swingTimer <= 0 || p.state !== 'engage') p.anim = speed > p.speed ? 'run' : speed > 0 ? 'walk' : 'idle';
      }
    }
  };

  /**
   * A follower's damage counts for its OWNER (Farhold: `field.credit(target, amount)` — the player's
   * side), so a kill by the cat pays the ranger, and its threat goes on the follower itself.
   */
  function creditFor(target, p, amount) {
    if (!(amount > 0)) return;
    target.playerDamage = (target.playerDamage || 0) + amount;
    const owner = p.owner;
    if (owner?.id != null) (target.damageBy || (target.damageBy = new Map())).set(owner.id, (target.damageBy.get(owner.id) || 0) + amount);
  }
  F.creditFor = creditFor;

  /** actors.js `taunt(enemy, pet)`: a companion's bite holds the enemy for THREAT_SECONDS (aimOf rule 1). */
  function petTaunt(e, p, seconds = 5) {
    if (!e || !p || e.dying != null || e.removed) return;
    e.threatOn = p.id;
    e.threatFor = Math.max(e.threatFor || 0, seconds);
    if (e.state !== 'chase' && e.state !== 'flee') e.state = 'chase';
  }
  F.petTaunt = petTaunt;

  /** actors.js `statusOnHit` for a pet's bite */
  function statusOnHit(p, target) {
    const type = p.onHit[Math.floor(field.rng() * p.onHit.length)];
    const spec = statuses?.[type];
    if (spec) applyStatus(target, type, spec, Math.max(1, (p.dmg[1] || 4) * 0.5));
  }

  /** pets.js `castAbility` — one spell a frame */
  function castAbility(p, target, hooks = {}) {
    for (const ab of p.abilities) {
      if (ab.ready > 0) continue;
      const pureHeal = isPureHeal(ab);
      if (!pureHeal && !target) continue;
      if (pureHeal) {
        const owner = p.owner;
        if (!owner || owner.hp == null) continue;
        if (!(owner.hp < (owner.maxHp || 0) * 0.92)) continue;
        const amount = Math.max(1, Math.round((owner.maxHp || 0) * (ab.heal || 0.1)));
        owner.hp = Math.min(owner.maxHp, owner.hp + amount);
        if (ab.healsPets) F.heal(owner, Math.round(amount * 0.6));
        ab.ready = ab.cooldown || 12;
        p.anim = 'attack';
        field.emit({ t: 'heal', src: p.id, dst: owner.id, amt: amount, hp: Math.round(owner.hp) });
        continue;
      }
      const reach = ab.range || (p.ranged?.range ?? 0) || Math.max(p.reach || 2.4, 4);
      if (Math.hypot(target.x - p.x, target.z - p.z) > reach) continue;
      ab.ready = ab.cooldown || 10;
      p.facing = Math.atan2(target.x - p.x, target.z - p.z);
      p.anim = 'attack';
      const hit = victim => {
        const result = rpg.strike(p, victim, rngPets, { multiplier: ab.mult || 1.5, element: ab.element || 'physical' });
        creditFor(victim, p, result.amount);
        petTaunt(victim, p);
        if (ab.status && statuses?.[ab.status]) applyStatus(victim, ab.status, statuses[ab.status], Math.max(1, (p.dmg?.[1] || 6) * 0.6 * (ab.statusMult || 1)));
        field.report(p, victim, result, 'pet');
        if (result.dead) { field.kill(victim); if (p.target === victim) p.target = null; }
        return result;
      };
      if (ab.radius) {
        for (const e of field.monsters) {
          if (e.dying != null || e.removed) continue;
          if (Math.hypot(e.x - target.x, e.z - target.z) > ab.radius) continue;
          hit(e);
        }
      } else hit(target);
      if (ab.heal && p.owner?.hp != null) p.owner.hp = Math.min(p.owner.maxHp, p.owner.hp + Math.round((p.owner.maxHp || 0) * ab.heal));
      return;
    }
  }

  // ---------------------------------------------------------------- the rest of the pets.js API, per owner

  F.heal = (owner, amount) => { for (const p of listOf(owner)) if (p.dying == null) p.hp = Math.min(p.maxHp, p.hp + amount); };
  F.order = (owner, kind, target = null, { seconds = 6, petOnly = false, from = null } = {}) => {
    let n = 0;
    for (const p of listOf(owner)) {
      if (p.dying != null || p.decoy) continue;
      if (petOnly && p.origin !== 'companion') continue;
      if (from && Math.hypot(p.x - from.x, p.z - from.z) > 30) continue;
      p.order = { kind, target, left: seconds };
      if (kind === 'pounce' && target) {
        const a = Math.atan2(p.x - target.x, p.z - target.z);
        p.x = target.x + Math.sin(a) * 1.6; p.z = target.z + Math.cos(a) * 1.6;
        p.empowered = Math.max(p.empowered || 0, 0.5);
        p.swingTimer = 0;
      }
      if (kind === 'return') p.target = null;
      n++;
    }
    return n;
  };
  F.reviveAll = (owner, share = 0.5) => {
    const book = bookOf(owner);
    const back = book.fallen.splice(0, book.fallen.length);
    const out = [];
    for (const f of back) {
      const made = F.summon(f.defId, owner, { count: 1, at: { x: owner.x, z: owner.z }, origin: f.origin, name: f.name });
      if (made[0]) { made[0].hp = Math.max(1, Math.round(made[0].maxHp * share)); out.push(made[0]); } else book.fallen.push(f);
    }
    return out;
  };
  F.cutAbilities = (owner, seconds = Infinity) => { for (const p of listOf(owner)) for (const ab of p.abilities || []) ab.ready = Math.max(0, (ab.ready || 0) - seconds); };
  F.barrierAll = (owner, amount, seconds = 6) => { for (const p of listOf(owner)) if (p.dying == null) { p.barrier = Math.max(p.barrier || 0, Math.round(amount)); p.barrierFor = seconds; } };
  F.cleanseAll = (owner, count = 1) => {
    for (const p of listOf(owner)) {
      if (!p.statuses) continue;
      const bad = Object.entries(p.statuses).filter(([, st]) => st.kind !== 'buff' && st.kind !== 'form');
      for (const [id] of bad.slice(0, count)) delete p.statuses[id];
    }
  };
  F.bringAlong = (owner, from, to, radius = 15) => {
    let k = 0;
    for (const p of listOf(owner)) {
      if (p.dying != null || p.decoy) continue;
      if (Math.hypot(p.x - from.x, p.z - from.z) > radius) continue;
      const a = (k++ / 4) * Math.PI * 2;
      p.x = to.x + Math.cos(a) * 2.2; p.z = to.z + Math.sin(a) * 2.2;
    }
    return k;
  };
  /** Take an owner's followers out of this room (handoff / logout); they keep their sheets. */
  F.release = owner => { for (const p of [...listOf(owner)]) { field.detach(p); despawnEntity?.(p); } return listOf(owner); };
  /** Bring an owner's followers into this room (after a handoff). */
  F.receive = owner => {
    const book = bookOf(owner);
    const units = book.list.splice(0);
    for (const p of units) {
      if (p.dying != null || p.removed) continue;
      p.x = owner.x + Math.cos(p.facing || 0) * 2.4; p.z = owner.z + Math.sin(p.facing || 0) * 2.4;
      p.target = null; p.order = null;
      admitUnit(p);
    }
  };
  F.tuning = () => ({ aggro: engageAt, leash, sprint });
  void idN;
  return F;
}
