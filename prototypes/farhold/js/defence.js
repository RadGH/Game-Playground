// Farhold — the base defends itself, and the raid that comes for it.
//
// js/raid.js decides WHAT comes and when it is allowed to; it is pure, and it has no idea that
// Farhold has an enemy field or a turret mesh. This is the join: it reads the base out of build
// mode, asks raid.js for an offer, puts the raiders on the ground when the player rings the bell,
// and lets the turrets shoot back.
//
// §7 of BUILDING_EXPANSION, and the user's own condition on it:
//
//   "[the tower defence] might be better as a quest rather than a random event, so the player can
//    decide when to start on it rather than being a burden."
//
// So nothing here ever fires on its own. `offer()` makes one available; `accept()` is the player
// saying yes; `ring()` is the player choosing the moment. Between those, the world is quiet.
//
//   import { createDefence } from './defence.js';
//   const def = createDefence({ data, bestiary, field, build, grid, rng, log });
//   def.tick(dt, { hour, level, biome, x, z });
//   def.offer({ level, biome });       // -> the quest, or why not
//   def.ring({ hour });                // the bell

import {
  notorietyOf, tierFor, raidOffer, acceptRaid, declineRaid, canFire,
  beginRaid, currentWave, waveSpawns, onRaiderKilled, clearWave, loseRaid, raidRewards,
} from './raid.js';

/**
 * What a turret does, in the only three numbers a turret has.
 *
 * Read off the catalogue's `defence` block where there is one, so the data file stays the place
 * these are tuned. A turret with no block still shoots — badly — rather than standing there inert,
 * because a defensive structure that does nothing is the exact failure this round is about.
 */
function gunOf(def) {
  const d = def?.defence || {};
  return {
    range: d.range ?? 22,
    damage: d.damage ?? 14,
    every: d.every ?? 1.1,
    splash: d.splash ?? 0,
    element: d.element || null,
  };
}

export function createDefence({
  data = null, bestiary = null, grid = null,
  rng = Math.random, log = null, spellfx = null,
  /**
   * The enemy field and the build ledger come in as GETTERS, not objects.
   *
   * `field` is rebuilt every time the player lands on a new world and `build` is a `const` declared
   * further down main.js than this is created. Capturing either by value would mean holding a
   * pointer to the last planet's enemies, which is exactly the bug that made pets attack ghosts.
   */
  getField = () => null,
  getBuild = () => null,
} = {}) {
  const say = (t, k) => { if (log) log(t, k); };

  /** The offer or the running raid. One at a time: a base under attack is not offered another. */
  let quest = null;
  /** turret entry id -> seconds until it may fire again. */
  const cooldowns = new Map();
  /** How many raiders are on the field, so a wave knows when it is done. */
  let onField = [];

  /**
   * The base, as js/raid.js wants to hear about it.
   *
   * Counted off what is actually standing rather than tracked separately, so knocking a turret down
   * genuinely lowers what the world will send at you. A structure that is not powered does not
   * count as a defence — an unpowered turret is a post.
   */
  /**
   * WHERE THE BASE IS — the claim stone, or the middle of whatever is standing.
   *
   * A raid has to arrive at the BASE, not at the player and not at the origin. `ring()` used to
   * call `spawnWave()` with no position at all, so its `x = 0, z = 0` defaults put every raider at
   * the world origin — about twenty-nine kilometres away, exactly the bug that hid every ore seam.
   * Asking the buildings where they are means it is right even if the player walks off.
   */
  function baseSpot() {
    const build = getBuild();
    const entries = build?.entries || [];
    if (!entries.length) return null;
    const stone = entries.find(e => build.defOf?.(e.key)?.claims);
    if (stone) return { x: stone.x, z: stone.z };
    const sum = entries.reduce((a, e) => ({ x: a.x + e.x, z: a.z + e.z }), { x: 0, z: 0 });
    return { x: sum.x / entries.length, z: sum.z / entries.length };
  }

  function baseOf() {
    const build = getBuild();
    const entries = build?.entries || [];
    const defences = entries.filter(e => {
      const def = build.defOf?.(e.key);
      return def?.cat === 'defence' && (e.powered !== false);
    });
    return {
      structures: entries.length,
      defences: defences.length,
      citizens: 0,
      throughput: 0,
      waypoint: entries.some(e => e.waypoint),
      gold: 0,
    };
  }

  return {
    get quest() { return quest; },
    get base() { return baseOf(); },
    /** The two gates, and which of them is short — the panel says this rather than greying out. */
    standing() {
      const base = baseOf();
      const t = tierFor({ base, data });
      return {
        notoriety: notorietyOf(base, data),
        tier: t.tier?.name || null,
        why: t.why,
        structures: base.structures,
        defences: base.defences,
        state: quest?.state || null,
      };
    },

    /** Somebody out there has decided your base is worth coming for. Still only an OFFER. */
    offer({ level = 1, biome = 'any' } = {}) {
      if (quest && quest.state !== 'won' && quest.state !== 'lost' && quest.state !== 'declined') {
        return { ok: false, why: 'You already have one of these on.' };
      }
      const out = raidOffer({
        base: baseOf(), level, biome,
        enemies: bestiary?.enemies || [], bosses: bestiary?.bosses || [],
        modifiers: bestiary?.modifiers || [],
        rng, data,
      });
      if (!out.ok) return out;
      quest = out;
      return out;
    },
    accept({ at = 0 } = {}) {
      const out = acceptRaid(quest, { at });
      if (out.ok) say('You took the fight. Ring the bell when you are ready — nothing comes until you do.', 'level');
      else if (out.why) say(out.why, 'bad');
      return out;
    },
    decline() { return declineRaid(quest); },

    /**
     * THE BELL. The player chooses the moment, which is the whole point of the design.
     *
     * Night is harder and pays better, and that is a real choice rather than a punishment: you rang
     * it, at the hour you picked.
     */
    ring({ hour = 12, at = 0, level = 1 } = {}) {
      const out = beginRaid(quest, { at, hour, data });
      if (!out.ok) { say(out.why, 'bad'); return out; }
      say(quest.night
        ? 'You ring the bell into the dark. They come faster at night, and they bring more.'
        : 'You ring the bell. Something moves at the treeline.', 'bad');
      this.spawnWave({ level });
      return out;
    },

    /** Where the raid arrives — for the caller's own spawn calls, and for the map marker. */
    spot() { return baseSpot(); },

    /** Put the current wave on the ground. Called by `ring` and between waves. */
    async spawnWave({ level = 1, x = null, z = null } = {}) {
      if (!canFire(quest)) return 0;
      // the base decides where they arrive; a caller may override it, but it must never be 0,0
      const at = (x == null || z == null) ? baseSpot() : { x, z };
      if (!at) { say('There is no base here for anything to come for.', 'bad'); return 0; }
      x = at.x; z = at.z;
      const spawns = waveSpawns(quest, { base: baseOf(), level, data });
      onField = [];
      let placed = 0;
      for (const group of spawns) {
        const def = (bestiary?.enemies || []).find(e => e.id === group.defId)
          || (bestiary?.bosses || []).find(e => e.id === group.defId);
        if (!def) continue;
        for (let i = 0; i < (group.count || 1); i++) {
          // a ring around the base, so they arrive from every side rather than in a queue
          const a = rng() * Math.PI * 2;
          const r = 55 + rng() * 25;
          const unit = await getField()?.add?.(def, level, x + Math.cos(a) * r, z + Math.sin(a) * r);
          if (!unit) continue;
          unit.raider = true;
          unit.hp = Math.round(unit.hp * (group.hpMultiplier || 1));
          unit.maxHp = unit.hp;
          unit.damage = Math.round((unit.damage || 1) * (group.dmgMultiplier || 1));
          onField.push(unit);
          placed++;
        }
      }
      const wave = currentWave(quest);
      if (wave) say(`Wave ${quest.wave} of ${quest.waves.length} — ${placed} of them.`, 'bad');
      return placed;
    },

    /** One of them went down. Returns the wave result so the caller can say so. */
    killed() {
      if (!canFire(quest)) return null;
      const out = onRaiderKilled(quest);
      if (out?.raidDone) {
        const prize = raidRewards(quest, { rng, data });
        say(`The last of them is down. ${prize.crate ? `They left a ${prize.crate} crate.` : ''}`, 'level');
        return { ...out, prize };
      }
      if (out?.cleared) say(`Wave down. ${out.breatherHours ? `${out.breatherHours}h before the next.` : ''}`, 'good');
      return out;
    },

    /**
     * THE TURRETS SHOOT BACK.
     *
     * Every powered defensive structure picks the nearest thing in range and hits it. Deliberately
     * simple — no leading, no target priority — because the interesting decision is WHERE you put
     * the turret, and a turret that never misses makes that decision for you.
     */
    tick(dt, { enemies = [], onHit = null } = {}) {
      const build = getBuild();
      if (!build?.entries?.length) return;
      const live = enemies.filter(e => e && e.hp > 0);
      if (!live.length) return;
      for (const e of build.entries) {
        const def = build.defOf?.(e.key);
        if (def?.cat !== 'defence' || !def.defence) continue;
        // an unpowered turret is a post
        if (e.powered === false) continue;
        const gun = gunOf(def);
        const left = (cooldowns.get(e.id) || 0) - dt;
        if (left > 0) { cooldowns.set(e.id, left); continue; }

        let best = null, bestD = Infinity;
        for (const u of live) {
          const d = Math.hypot(u.x - e.x, u.z - e.z);
          if (d <= gun.range && d < bestD) { best = u; bestD = d; }
        }
        if (!best) { cooldowns.set(e.id, 0); continue; }
        cooldowns.set(e.id, gun.every);
        if (onHit) onHit(best, gun, e);
      }
    },

    /** The base fell. §7.11: broken structures and a lighter store, never a deleted base. */
    lost({ materials = 0 } = {}) { return loseRaid(quest, { base: baseOf(), materials, data }); },

    toJSON() { return { quest }; },
    load(json) { quest = json?.quest || null; },
  };
}
