// Farhold — companions: the thing that follows you and bites what you are biting.
//
// A necromancer without skeletons is a mage with a worse hat. Pets are a class's identity, so this
// is a real system rather than a cosmetic: each pet is a full body (the same Chibi 2 / creature
// builders enemies use, so they animate), each has its own AI, each scales off its OWNER's level so
// it never falls behind, and each can die and be raised again after a cooldown.
//
// The AI is three states and nothing clever:
//   follow   — stay inside `follow` metres of the owner, at a slot around them so they do not stack
//   engage   — something is inside the aggro range of the owner, or something is hurting one of
//              them: go and hit it. A companion moves at the owner's sprint speed getting there.
//   return   — too far from the owner (`leash`), give up and come back
//
// Round 11 fixed three things that made companions useless: they were reading the enemy list of a
// planet you had already left, they never re-costed themselves when their owner levelled (so a
// level 1 sentry was still swinging for 1 at level 20), and they only ever looked 22 m at 4 m/s.
//
//   const pets = createPets({ scene, terrain, rpg, defs, balance, field });
//   await pets.summon('bone_thrall', owner, { count: 2 });
//   pets.update(dt, control, player, { onLog });
//
// Pets use the enemy field's own `strike` maths in reverse: `rpg.strike(pet, enemy)`, so an affix
// that says "your companions hit 40% harder" is a multiplier in one place.

import * as THREE from 'three';
import { makeActor, setActorAnim, activeEnemyField } from './actors.js';
import { makeRng } from '../../emberveil/js/rng.js';
import { tickStatuses, slowOf, applyStatus } from './skills.js';
// R17 — the level-scaling arithmetic lives in the (Three.js-free) follower book so a node test can
// drive it. See `scaleFollower` there; this file is the only caller.
import { scaleFollower } from './followers.js';

/**
 * Which pets a class brings, and what it calls them. Data rather than code because the class list
 * is data: `data/classes.json` can override any of this per class.
 */
/**
 * R18 — DOES THIS ABILITY NEED SOMETHING TO AIM AT?
 *
 * The rule in one place, because expressing it twice is what broke it. `castAbility` had
 * `if (!ab.heal && !target) continue;` and then `if (ab.heal && !ab.mult) { …heal… }`, which
 * between them let an ability carrying BOTH `heal` and `mult` past the first guard (it has a heal)
 * and past the second (it also has a mult) into the damage path, where the null target was
 * dereferenced. `data/mercenaries.json`'s `tithe` is precisely that pair.
 *
 * Only a heal with no damage half is target-free. Exported so a test can ask it of every ability in
 * the data without needing a scene, which is the check that would have caught this.
 */
export function isPureHeal(ab) { return !!(ab && ab.heal) && !(ab && ab.mult); }

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

  /**
   * THE ENEMY LIST IT IS ACTUALLY LOOKING AT.
   *
   * The field handed in here is the one that existed at boot. Landing on another world throws it
   * away and builds a new one, and nothing ever told the companions — so after one flight a pet was
   * reading an empty list belonging to a dead planet, which is why "my pet stood beside me getting
   * attacked and died, without even retaliating": there was nothing for it to retaliate AGAINST as
   * far as it could see. `activeEnemyField()` is whichever field is live now.
   */
  let boundField = field;
  const live = () => (boundField ? (activeEnemyField() || boundField) : null);

  /**
   * HOW FAR A COMPANION LOOKS, AND HOW FAST IT MOVES.
   *
   * balance.json still says a pet notices things 22 m away and runs at its own 4-5 m/s, and those
   * are the numbers behind "too slow and unobservant to be useful". A sprinting player does 11.3
   * m/s (moveSpeed x runMultiplier), so a pet at 4.4 falls behind every time you run at something —
   * it arrives after the fight. Until balance.json is retuned we take the LARGER of its number and
   * ours; `pets.aggro` in balance.json, when someone adds it, wins outright.
   */
  const FLOOR = { aggro: 55 };
  const engageAt = Math.max(cfg.aggro ?? 0, cfg.engage ?? 0, FLOOR.aggro);
  // the leash has to clear the aggro range or a pet turns for home the moment it sets off
  const leash = Math.max(cfg.leash ?? 0, engageAt + 12);
  const sprint = (balance.player?.moveSpeed ?? 5.4) * (balance.player?.runMultiplier ?? 2.1);

  /** Companions waiting out their cooldown: `{ defId, owner, left }`. */
  const fallen = [];
  /** Last frame's owner health, so a companion can tell that its owner is being hit. */
  let ownerHpSeen = null;

  const byId = Object.fromEntries(defs.map(d => [d.id, d]));

  /**
   * R17 — A DEF CAN BE ADDED AFTER THE FACT.
   *
   * The ten hireable mercenary types live in `data/mercenaries.json` rather than in the bestiary:
   * `data/enemies.json` is the enemy tables and Emberveil's build script owns it, and putting ten
   * hireable people in there would put ten more rows in front of every reader that walks it. So
   * js/followers.js registers them here at boot and the pet system treats them like anything else
   * it summons. Safe to call twice with the same id — the later one wins.
   */
  function register(def) {
    if (!def?.id) return null;
    byId[def.id] = def;
    return def;
  }

  /**
   * R17 — THE FOLLOWER GATE, and the reason it lives here rather than at the call sites.
   *
   * Three completely separate things summon: a summoning skill in js/main.js, a hire in
   * js/followers.js, and the class companion at the start of a run. A limit checked at the call
   * sites is a limit with three copies and three chances to be missed, which is this project's
   * signature fault written as a rule. `pets.summon` is the one door, so the question is asked at
   * the door: js/followers.js installs `setGate` and everything obeys it for free.
   *
   * The default gate is the old behaviour exactly — `cfg.maxAlive` and nothing else — so a run with
   * no follower book behaves as it always did.
   */
  let gate = null;
  function admitted(defId, opts) {
    if (gate) return gate(defId, opts);
    return pets.length + pending >= (cfg.maxAlive ?? 6)
      ? { ok: false, why: 'You have as many companions as you can keep.' }
      : { ok: true, why: null };
  }

  /** Build a live pet from a table entry, scaled off its owner. */
  function make(def, owner) {
    const level = owner.level || 1;
    // affixes and legendary powers get a say in how strong a companion is
    const power = rpg.fx.product(owner, 'petPower');
    const health = rpg.fx.product(owner, 'petHealth');
    const at = scaleFollower({ def, level, perLevel: cfg.perLevel ?? 1.17, power, health });
    return {
      id: 'p' + Math.floor(rng() * 1e9).toString(36),
      defId: def.id, name: def.name, kind: def.kind || 'beast', family: def.family || 'beast',
      role: def.role || 'skirmisher', level,
      hp: at.hp, maxHp: at.hp,
      dmg: at.dmg,
      armor: at.armor,
      derived: { resistAll: 0, thorns: 0, dodge: 0 },
      speed: def.speed ?? 4.4, reach: def.reach ?? 2.4, attackEvery: def.attackEvery ?? 1.5,
      ranged: def.ranged ? { ...def.ranged } : null, onHit: def.onHit || null, flying: !!def.flying, glow: def.glow || null,
      look: def.look ? JSON.parse(JSON.stringify(def.look)) : null,
      state: 'follow', swingTimer: 0, hitFlash: 0, slot: pets.length,
      /**
       * R17 — WHAT KIND OF FOLLOWER THIS IS: 'companion' (came with your class or your build),
       * 'mercenary' (paid for) or 'summon' (called up by a spell). The follower book counts by it
       * and the per-type cap only applies to the third, so it is set at the door in `summon`.
       */
      origin: 'summon',
      /**
       * R17 — the spells a mercenary casts on its own clock, and the upgrades it grows into.
       * A bestiary pet has neither and the whole block is inert for one. `learned` is what has
       * already been applied, so an upgrade fires once however many times a pet is re-costed.
       */
      abilities: (def.abilities || []).filter(a => (a.minLevel ?? 1) <= level).map(a => ({ ...a, ready: (a.cooldown || 10) * 0.4 })),
      abilityBook: def.abilityBook || null,
      upgrades: def.upgrades || [],
      learned: [],
      carrying: null,
      owner,
    };
  }

  /**
   * A COMPANION IS ONLY AS STRONG AS THE DAY IT WAS SUMMONED — and that is most of "the sentry
   * deals no damage".
   *
   * `make()` reads `owner.level` once. A tinker who summoned their sentry at level 1 and fought
   * their way to level 20 still had a level 1 sentry: 6-11 raw damage against armour built for level
   * 20, which `rpg.strike` floors at 1 a hit. It played its attack, it rolled its damage, and the
   * number was 1 — which from across the field looks exactly like doing nothing at all.
   *
   * So a companion is re-costed whenever its owner gains a level, keeping the share of health it had
   * (levelling up should not heal your pet, nor hurt it).
   */
  function retune(p) {
    const def = byId[p.defId];
    const level = p.owner?.level || 1;
    /**
     * R18 — `level === p.level` IS NOT "NOTHING TO DO".
     *
     * `make()` builds a follower at the owner's level and applies no upgrades, so a mercenary hired
     * at 20 arrived stock — no longsword, no `rive`, no kit — and this early return then refused to
     * fix it, because its level already matched. It caught up at 21, and at the level cap it never
     * caught up at all: a Blade for Hire bought at 50 stayed a Blade for Hire at 50 forever, while
     * the hire board advertised the growth explicitly.
     *
     * `applyUpgrades` is already idempotent (`learned` makes each one happen once), so the honest
     * test is "have the upgrades for this level been applied", not "has the number changed".
     */
    if (!def) return;
    if (level === p.level && p.upgradesAt === level) return;
    p.upgradesAt = level;
    const frac = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    const power = rpg.fx.product(p.owner, 'petPower');
    const health = rpg.fx.product(p.owner, 'petHealth');
    p.level = level;
    /**
     * R17 — THE UPGRADES A FOLLOWER GROWS INTO.
     *
     *   "…some companions should equip better weapons or learn new skills at higher levels."
     *
     * Read here rather than at a level-up event, because this is the one place that already knows
     * a follower's level has moved — and it fires for a mercenary hired at level 4 who is looked at
     * again at 22, which a level-up event would have missed entirely. `learned` makes it happen
     * once: an upgrade already in that list is skipped however many times this runs.
     */
    const grown = applyUpgrades(p, level);
    // R18 — from the DEF's range, never from the current one. See `out.rangeAdd`.
    if (p.ranged) p.ranged.range = (def.ranged?.range ?? 20) + grown.rangeAdd;
    const at = scaleFollower({ def, level, perLevel: cfg.perLevel ?? 1.17, power, health, grown });
    p.maxHp = at.hp;
    p.hp = Math.max(1, Math.round(p.maxHp * frac));
    p.dmg = at.dmg;
    p.armor = at.armor;
  }

  /**
   * Everything a follower has grown into by now, and the one-off effects of anything new.
   *
   * Returns the cumulative multipliers so `retune` can apply them to the base numbers rather than
   * to the current ones — compounding a 1.16 damage bump on every re-cost would have a level-40
   * mercenary hitting for thousands.
   */
  function applyUpgrades(p, level) {
    const out = { dmgMult: 1, hpMult: 1, armorAdd: 0, rangeAdd: 0 };
    for (const up of p.upgrades || []) {
      if (level < (up.atLevel ?? 1)) continue;
      out.dmgMult *= up.dmgMult ?? 1;
      out.hpMult *= up.hpMult ?? 1;
      out.armorAdd += up.armorAdd ?? 0;
      /**
       * R18 — CUMULATIVE, like `armorAdd` beside it, and applied to the BASE.
       *
       * This line used to sit above the `learned` guard and mutate `p.ranged.range` IN PLACE, so
       * every call added the bonus again. A Longshot (base 26 m, +6 at level 12) was 32 m at 12,
       * 38 at 13, 80 at 20 and 260 m at 50 — sniping from off-screen while the Followers board
       * still said "about 26 m". The comment on this function already warned about exactly this
       * for damage: "compounding a 1.16 damage bump on every re-cost would have a level-40
       * mercenary hitting for thousands."
       */
      out.rangeAdd += up.rangeAdd ?? 0;
      if (p.learned.includes(up.atLevel + ':' + (up.note || ''))) continue;
      p.learned.push(up.atLevel + ':' + (up.note || ''));
      // a new spell out of the shared ability book, or off the type's own list
      if (up.ability) {
        const spec = p.abilityBook?.[up.ability] || (byId[p.defId]?.abilities || []).find(a => a.id === up.ability);
        if (spec && !(p.abilities || []).some(a => a.id === spec.id)) {
          p.abilities.push({ ...spec, ready: spec.cooldown || 10 });
        }
      }
      // …and a better weapon, which is a real change to the body rather than a line in a panel
      if (up.held || up.offhand || up.top) refit(p, up);
      if (up.note) p.carrying = up.note;
      if (up.bringsCount) p.bringsCount = up.bringsCount;
    }
    return out;
  }

  /**
   * REBUILD THE BODY WITH THE NEW KIT ON IT.
   *
   * An avatar is baked into a merged skinned mesh at build time, so there is no "swap the sword"
   * — the body is rebuilt and the old one thrown away. It is an await inside a frame, so the swap
   * is guarded: the pet keeps fighting with the body it has until the new one is ready, and if the
   * pet dies in the meantime the new actor is disposed rather than left in the scene.
   */
  function refit(p, up) {
    if (!p.look?.avatar || p.refitting) return;
    const next = JSON.parse(JSON.stringify(p.look));
    if (up.held) next.avatar.held = { ...(next.avatar.held || {}), id: up.held };
    if (up.offhand) next.avatar.offhand = { ...(next.avatar.offhand || {}), id: up.offhand };
    if (up.top) next.avatar.top = { ...(next.avatar.top || {}), id: up.top };
    p.refitting = true;
    makeActor(next).then(actor => {
      p.refitting = false;
      if (!actor) return;
      if (p.removed || p.dying != null || !pets.includes(p)) { actor.dispose?.(); return; }
      scene.remove(p.actor.group);
      p.actor.dispose?.();
      p.actor = actor;
      p.look = next;
      actor.group.position.set(p.x, p.y + (p.hover || 0), p.z);
      actor.group.rotation.y = p.facing || 0;
      scene.add(actor.group);
      setActorAnim(actor, 'idle');
    }).catch(() => { p.refitting = false; });
  }

  /**
   * Put `count` of a pet into the world beside its owner.
   *
   * R17 — `origin` says what kind of follower this is ('summon' by default, so every existing call
   * site means exactly what it did before) and the gate is asked once per body rather than once per
   * call: summoning three wolves into one free slot puts one wolf down and stops, which is the
   * honest answer rather than refusing the whole cast. `refused` is left on the returned array so a
   * caller can say WHY only one turned up.
   */
  async function summon(defId, owner, { count = 1, at = null, origin = 'summon', name = null } = {}) {
    const def = byId[defId];
    if (!def) return [];
    const made = [];
    made.refused = null;
    for (let i = 0; i < count; i++) {
      const allow = admitted(defId, { origin, name: name || def.name });
      if (!allow.ok) { made.refused = allow.why; break; }
      if (pets.length + pending >= (cfg.maxAlive ?? 6)) { made.refused = 'You have as many companions as you can keep.'; break; }
      const unit = make(def, owner);
      unit.origin = origin;
      if (name) unit.name = name;
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

  /**
   * The whole roster a class starts with.
   *
   * R17 — filed as `companion` rather than `summon`, because the follower book treats the three
   * kinds differently: a companion cannot be dismissed (it came with you), and the per-type cap is
   * a rule about SUMMONING spells rather than about what your class brought to the first morning.
   */
  async function summonForClass(classId, owner, overrides = null) {
    const spec = overrides || CLASS_PETS[classId];
    if (!spec) return [];
    const out = await summon(spec.id, owner, { count: spec.count || 1, origin: 'companion' });
    if (spec.extra) out.push(...await summon(spec.extra.id, owner, { count: spec.extra.count || 1, origin: 'companion' }));
    return out;
  }

  /**
   * R17 — LET ONE GO. The Followers screen's dismiss button, and nothing else calls it.
   *
   * Not the same thing as dying: a dismissed follower leaves no body and is never put back by the
   * revive clock, which is exactly the difference between "they walked off" and "they fell".
   */
  function remove(uid) {
    const i = pets.findIndex(p => p.id === uid);
    if (i < 0) return false;
    const p = pets[i];
    p.removed = true;
    scene.remove(p.actor.group);
    p.actor.dispose?.();
    pets.splice(i, 1);
    return true;
  }

  /** One frame of every companion. `at` is where the owner is standing. */
  function update(dt, at, owner, hooks = {}) {
    const followAt = cfg.follow ?? 4.5;
    const field = live();

    // the owner losing health is the signal that something is on them: see the targeting below
    const ownerHurt = ownerHpSeen != null && (owner?.hp ?? 0) < ownerHpSeen;
    ownerHpSeen = owner?.hp ?? null;

    // anything killed while you were away comes back on its own — the fall already promised it would
    for (let i = fallen.length - 1; i >= 0; i--) {
      fallen[i].left -= dt;
      if (fallen[i].left > 0) continue;
      const back = fallen.splice(i, 1)[0];
      summon(back.defId, back.owner, { count: 1, at, origin: back.origin, name: back.name }).then(made => {
        // …and it is the SAME follower, so the contract that hired it still recognises it
        if (made[0]) {
          if (back.uid) made[0].id = back.uid;
          hooks.onReturned?.(made[0]);
        }
      });
    }

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
          // it comes back: the owner gets it again after the cooldown. `reviveSeconds` was in
          // balance.json from the start and nothing read it, so "will come back" was a lie and a
          // dead companion stayed dead for the rest of the run.
          /**
           * R18 — CARRY THE `origin` AND THE `uid` ACROSS THE FALL.
           *
           * The record held only `{defId, owner, left}`, so the revive below summoned with the
           * default `origin: 'summon'`. A hired mercenary therefore came back as a summon with a
           * NEW uid — and js/followers.js `tick` matches contracts by `c.uid`, found its Blade
           * missing, and hired a free duplicate within a couple of seconds. A revived class
           * companion became dismissible for the same reason, which is the exact thing the "they
           * came with you" rule exists to prevent.
           */
          if (p.owner) {
            fallen.push({
              defId: p.defId, owner: p.owner, left: cfg.reviveSeconds ?? 14,
              origin: p.origin || 'summon', uid: p.id, name: p.name || null,
            });
          }
          hooks.onFallen?.(p);
        }
        continue;
      }

      retune(p);
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

      /**
       * WHAT IT SHOULD BE BITING.
       *
       * It used to be one rule — the enemy nearest the OWNER — which meant a companion being chewed
       * on at the edge of a fight kept walking past its attacker to something else. Now, in order:
       *
       *   1. whatever is hurting the pet itself (its health went down since last frame)
       *   2. whatever is hurting the owner (the same test, on the owner)
       *   3. whatever it is already fighting
       *   4. the nearest live enemy inside the aggro range
       *
       * 1 and 2 are read off health rather than from a "who hit me" message because the hit lands in
       * main.js's hands, not here — and health going down is the honest version of the question
       * anyway: something is hurting it, and whatever is nearest is what that something is.
       */
      const selfHurt = p._hpSeen != null && p.hp < p._hpSeen;
      p._hpSeen = p.hp;

      let target = p.target;
      if (target && (target.removed || target.dying != null || Math.hypot(target.x - at.x, target.z - at.z) > leash * 1.4)) target = null;
      if (field && (selfHurt || ownerHurt || !target)) {
        // measured from whoever is being hit: the pet when it is the one bleeding, else the owner
        const fromX = selfHurt ? p.x : at.x, fromZ = selfHurt ? p.z : at.z;
        let best = null, bestD = selfHurt || ownerHurt ? Math.max(engageAt, leash) : engageAt;
        for (const e of field.enemies) {
          if (e.dying != null || e.removed) continue;
          const d = Math.hypot(e.x - fromX, e.z - fromZ);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best || !target) target = best;
      }
      p.target = target;

      // states
      if (toOwner > leash) p.state = 'return';
      else if (target) p.state = 'engage';
      else p.state = 'follow';

      /**
       * R17 — MERCENARIES HAVE THEIR OWN SPELLS.
       *
       *   "…add a mercenary person who sells mercenaries to the player and add a variety of types
       *    with their own spells."
       *
       * A bestiary pet has no `abilities` at all and this whole block costs it one `for` over an
       * empty array. A hired caster has two or three, each on its own clock, and they fire at
       * whatever the follower is already fighting — no separate targeting, because a second
       * targeting rule is a second thing that can point at the wrong enemy.
       */
      for (const ab of p.abilities || []) {
        ab.ready = Math.max(0, (ab.ready ?? 0) - dt);
      }
      if (p.abilities?.length) castAbility(p, target, hooks);

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
        // A companion moves at the speed its owner can move, because anything slower means it turns
        // up after the fight. Its own `speed` is only the floor now, and there is still a little
        // extra for catching up from a long way back.
        speed = Math.max(p.speed, sprint) * (p.state === 'return' || toOwner > 12 ? 1.2 : 1);
      } else if (p.state === 'engage' && target && p.swingTimer <= 0) {
        p.facing = Math.atan2(target.x - p.x, target.z - p.z);
        p.swingTimer = p.attackEvery;
        setActorAnim(p.actor, 'attack');
        const result = rpg.strike(p, target, rng, { element: p.ranged?.element || 'physical' });
        // your minions' damage is your damage: this is what stops a guard walking off with the kill
        field?.credit?.(target, result.amount);
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
        setActorAnim(p.actor, speed > p.speed ? 'run' : speed > 0 ? 'walk' : 'idle');
      }
      p.actor.update(dt);
    }
  }

  /**
   * One follower's spell, if one is ready and there is something to point it at.
   *
   * Three shapes and no more, because three is what the ten types in data/mercenaries.json need:
   * a single target, a radius around the target, and a heal that goes on the owner rather than on
   * anything else. Damage goes through `rpg.strike` exactly like a swing does, so an affix that
   * says "your companions hit 40% harder" lifts a spell as well as a bite — which is the reason
   * pets have always gone through `strike` rather than rolling their own numbers.
   */
  function castAbility(p, target, hooks = {}) {
    const field = live();
    for (const ab of p.abilities) {
      if (ab.ready > 0) continue;
      /**
       * R18 — A PURE heal needs nobody to fight. ONE THAT ALSO HITS STILL NEEDS A TARGET.
       *
       * This was `if (!ab.heal && !target) continue;`, and the branch below is
       * `if (ab.heal && !ab.mult)`. An ability carrying BOTH `heal` and `mult` slipped through the
       * first (it has a heal) and through the second (it also has a mult), and then fell into the
       * damage path, where `Math.hypot(target.x - p.x, …)` dereferenced a null target.
       *
       * `data/mercenaries.json`'s `tithe` is exactly that — `{mult: 1.6, heal: 0.05, range: 22}`,
       * the Bonesinger's, learned at level 18. Hire one, reach 18, stand in a quiet field, and it
       * throws. `tick` has no try/catch and js/main.js calls it from the frame loop, so
       * requestAnimationFrame re-throws every frame: the picture freezes while the game runs on,
       * which reads as a hang rather than an error.
       *
       * Asked the right way round, the rule is obvious — only a heal with no damage half is
       * target-free — and the `ab.heal && !ab.mult` branch below is that same pure-heal case.
       */
      const pureHeal = isPureHeal(ab);
      if (!pureHeal && !target) continue;
      if (pureHeal) {
        const owner = p.owner;
        if (!owner || owner.hp == null) continue;
        // never spend the cooldown on a full-health party — a healer that heals nothing is the
        // report this file's header is already full of
        const hurt = owner.hp < (owner.maxHp || 0) * 0.92;
        if (!hurt) continue;
        const amount = Math.max(1, Math.round((owner.maxHp || 0) * (ab.heal || 0.1)));
        owner.hp = Math.min(owner.maxHp, owner.hp + amount);
        if (ab.healsPets) heal(Math.round(amount * 0.6));
        ab.ready = ab.cooldown || 12;
        setActorAnim(p.actor, 'attack');
        hooks.onPetCast?.(p, ab, { healed: amount });
        continue;
      }
      const reach = ab.range || (p.ranged?.range ?? 0) || Math.max(p.reach || 2.4, 4);
      if (Math.hypot(target.x - p.x, target.z - p.z) > reach) continue;
      ab.ready = ab.cooldown || 10;
      p.facing = Math.atan2(target.x - p.x, target.z - p.z);
      setActorAnim(p.actor, 'attack');
      const hit = victim => {
        const result = rpg.strike(p, victim, rng, { multiplier: ab.mult || 1.5, element: ab.element || 'physical' });
        field?.credit?.(victim, result.amount);
        victim.hitFlash = 0.18;
        if (victim.state !== 'chase') victim.state = 'chase';
        if (ab.status && statuses?.[ab.status]) {
          applyStatus(victim, ab.status, statuses[ab.status], Math.max(1, (p.dmg?.[1] || 6) * 0.6 * (ab.statusMult || 1)));
        }
        if (result.dead) { field?.kill(victim); if (p.target === victim) p.target = null; }
        return result;
      };
      if (ab.radius && field) {
        for (const e of field.enemies) {
          if (e.dying != null || e.removed) continue;
          if (Math.hypot(e.x - target.x, e.z - target.z) > ab.radius) continue;
          hit(e);
        }
      } else {
        hit(target);
      }
      // `tithe` and its kind pay the owner back a share of what they took
      if (ab.heal && p.owner?.hp != null) {
        p.owner.hp = Math.min(p.owner.maxHp, p.owner.hp + Math.round((p.owner.maxHp || 0) * ab.heal));
      }
      hooks.onPetCast?.(p, ab, { at: target });
      return;                                     // one spell a frame, however many are ready
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
    fallen.length = 0;
  }

  return {
    pets, summon, summonForClass, update, splash, nearest, heal, fall, clear,
    // R17 — the three the follower book needs: add a type at runtime, install the limit, let one go
    register, remove,
    setGate: fn => { gate = typeof fn === 'function' ? fn : null; },
    /**
     * R18 — ASK THE GATE WITHOUT WALKING THROUGH IT.
     *
     * The gate was only ever consulted inside `summon`, which runs after js/skills.js has already
     * spent the mana and started the cooldown — so a refused summon cost you both and said nothing,
     * because `made.refused` is read by nobody. This is the same question, asked early.
     */
    canAdmit: (defId, opts = {}) => admitted(defId, { origin: 'summon', ...opts }),
    setTerrain: t => { currentTerrain = t; },
    /** Point the companions at a different enemy field. Rarely needed: `live()` finds it anyway. */
    setField: f => { boundField = f; },
    /** What a companion can see and how fast it travels, for the tests and the debug menu. */
    tuning: () => ({ aggro: engageAt, leash, sprint }),
    /** Companions waiting out their revive cooldown. */
    waiting: () => fallen.map(f => ({ defId: f.defId, left: Math.max(0, f.left) })),
    /** For the character sheet and the Followers screen: who they are and what they are doing. */
    roster: () => pets.filter(p => p.dying == null).map(p => ({
      uid: p.id, defId: p.defId, origin: p.origin || 'summon',
      name: p.name, hp: Math.ceil(p.hp), maxHp: p.maxHp, state: p.state, level: p.level,
      abilities: (p.abilities || []).map(a => a.name), carrying: p.carrying || null,
    })),
    get alive() { return pets.filter(p => p.dying == null).length; },
    stats: () => ({ pets: pets.length, alive: pets.filter(p => p.dying == null).length }),
  };
}
