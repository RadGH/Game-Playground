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
  /**
   * THE NINTH JOIN — AND IT IS THREE LINES. The Civilization Expansion §8.5.
   *
   * `colony.guards()` has counted citizens standing a watch since the colony landed, and
   * `baseOf()` below hard-coded `citizens: 0` right next to it. COLONY.md's own wiring table has
   * listed handing that number over as owed ever since. Two consequences, both immediate and both
   * correct:
   *
   *   * data/raids.json gates the Warband at `minDefence: 5` — **four guards and a bolt turret now
   *     qualify**, where before you needed five turrets;
   *   * `notoriety.perCitizen: 1.2` and `perRefineryThroughput: 0.6` finally get real numbers
   *     instead of zeroes, so a village of twelve with a watch is noticed by the world. That is the
   *     correct reading of `notorietyOf` and it has never once fired.
   *
   * Both come in as GETTERS for the reason the field and the build ledger do, stated in full above:
   * both are rebuilt when the player lands somewhere else, and capturing either by value means
   * holding a pointer to the last planet's colony.
   */
  getColony = () => null,
  getWorks = () => null,
  getOutposts = () => null,
  folk = null,
} = {}) {
  const say = (t, k) => { if (log) log(t, k); };

  /** The offer or the running raid. One at a time: a base under attack is not offered another. */
  let quest = null;
  /** turret entry id -> seconds until it may fire again. */
  const cooldowns = new Map();
  /** R18 — how much charge each shield pylon has spent this raid. See `shieldAt`. */
  const shieldSpent = new Map();
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
  function baseSpot({ near = null } = {}) {
    const build = getBuild();
    const entries = build?.entries || [];
    if (!entries.length) return null;
    /**
     * ROUND 14 LEFT THIS LOOKING FOR A CLAIM STONE THAT IS NOW OPTIONAL.
     *
     * js/outposts.js works an outpost out from the geometry, so the right answer is the outpost
     * nearest whoever rang the bell, falling back to the largest one, and only then to the stone
     * and the average. A raid at "the middle of everything you have ever built" is a raid in the
     * sea when your mine is nine hundred metres from your house.
     */
    const posts = getOutposts?.() || null;
    if (posts?.length) {
      let best = posts[0];
      if (near) {
        let bestD = Infinity;
        for (const p of posts) {
          const d = Math.hypot(p.x - near.x, p.z - near.z);
          if (d < bestD) { bestD = d; best = p; }
        }
      } else {
        for (const p of posts) if ((p.entries?.length || 0) > (best.entries?.length || 0)) best = p;
      }
      if (best) return { x: best.x, z: best.z, name: best.name };
    }
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
    const colony = getColony?.() || null;
    const posted = colony?.stationed?.() || 0;
    return {
      structures: entries.length,
      // a guard standing a post is worth a turret, which is what makes "spend gold on people" a
      // real alternative to "spend materials on walls" — BUILDING_EXPANSION §4e, finally wired
      defences: defences.length + posted,
      citizens: colony?.citizens?.length || 0,
      throughput: getWorks?.()?.throughputPerMinute?.() || 0,
      waypoint: entries.some(e => e.waypoint),
      /**
       * R18 — how much of a loss the repair stations undo. See the note in js/raid.js `loseRaid`.
       * A station has to be POWERED to count, like a turret: it draws 12 kW and an unpowered one
       * is a shed.
       */
      repairShare: entries.reduce((sum, e) => {
        const def = build.defOf?.(e.key);
        if (!def?.repairs || e.powered === false) return sum;
        return sum + (def.repairs.rate ?? 25) / 100;
      }, 0),
      gold: 0,
      posted,
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
      shieldSpent.clear();                       // R18 — a fight starts with the pylons charged
      const out = beginRaid(quest, { at, hour, data });
      if (!out.ok) { say(out.why, 'bad'); return out; }
      say(quest.night
        ? 'You ring the bell into the dark. They come faster at night, and they bring more.'
        : 'You ring the bell. Something moves at the treeline.', 'bad');
      this.spawnWave({ level });
      return out;
    },

    /** Where the raid arrives — for the caller's own spawn calls, and for the map marker. */
    spot(opts = {}) { return baseSpot(opts); },

    /**
     * R14 — TAKE OVER A FIGHT SOMEBODY ELSE STARTED.
     *
     * `js/muster.js` builds its own raid quest — same `raidOffer`, same `beginRaid`, same shape —
     * because a drill is not an offer the world made you and must not occupy the slot a real raid
     * needs. But `spawnWave`, `killed` and `lost` all read the quest held HERE, so without this the
     * muster could be started and nothing would ever walk out of the treeline.
     *
     * Adopting rather than duplicating is the whole point: there is still exactly one wave system,
     * one `canFire` gate and one kill counter, and `loseRaid` still decides what a loss costs — so
     * a drill's "nothing at stake" flag cannot be bypassed by a second code path, because there
     * isn't one.
     */
    adopt(next) { quest = next || null; return quest; },
    // (there is already a `quest` getter at the top of this object — a duplicate key in an object
    // literal is not an error in JavaScript, it is a shrug, and this project has been bitten by
    // exactly that before: `board` was declared twice on window.farhold and the later one won.)

    /**
     * YOUR GUARDS TURN OUT. The Civilization Expansion §8.5.
     *
     * Every posted, fed guard gets a body at their post, with the stat block out of
     * `data/colony.json`'s `guard` — the SAME table js/town.js reads for a town's watch, so your
     * guard and a town guard can never quietly become different things.
     *
     * A guard that falls is KNOCKED DOWN, not killed. They are back at their post the next morning
     * at half mood. Killing your own citizens by ringing a bell is the punishment-for-playing shape
     * all over again, and COLONY.md §4's rule already stands: *"a dead citizen makes you reload, a
     * departed one makes you build a granary."*
     */
    async rally({ level = 1 } = {}) {
      const colony = getColony?.();
      const build = getBuild();
      if (!colony || !build?.entries) return 0;
      const stats = colony.data?.guard || {};
      const posts = new Map((build.entries || [])
        .filter(e => build.defOf?.(e.key)?.post)
        .map(e => [e.id, e]));
      let out = 0;
      for (const c of colony.citizens || []) {
        if (!c.posted || c.rung === 'downsTools' || c.rung === 'leaving') continue;
        const post = posts.get(c.posted);
        if (!post) continue;
        const tower = !!build.defOf?.(post.key)?.post?.reachBonus;
        const body = await folk?.spawnOne?.({
          groupId: 'watch', role: 'guard', roleName: 'Guard',
          name: c.name, x: post.x + (Math.random() - 0.5) * 2, z: post.z + (Math.random() - 0.5) * 2,
          greeting: 'Stay behind me.',
          fight: {
            hp: Math.round((stats.hp ?? 260) * Math.pow(stats.perLevel ?? 1.17, Math.max(0, level - 1))),
            dmg: stats.dmg ?? [14, 22],
            armor: stats.armor ?? 22,
            speed: stats.speed ?? 5.2,
            reach: tower ? (stats.towerReach ?? 7) : (stats.reach ?? 3),
            attackEvery: stats.attackEvery ?? 1.2,
          },
          onDown: () => { c.mood = Math.max(0, (c.mood || 0.5) * 0.5); c.knockedDown = true; },
        });
        if (body) out++;
      }
      return out;
    },

    /**
     * How many bodies the watch can put on the wall, without spawning any of them.
     *
     * Used by the Holding screen and by the muster board's difficulty line, which both want the
     * number long before anybody rings anything.
     */
    watch() {
      const colony = getColony?.();
      if (!colony) return { posted: 0, slots: 0 };
      const build = getBuild();
      const slots = (build?.entries || [])
        .reduce((n, e) => n + (build.defOf?.(e.key)?.post?.slots || 0), 0);
      return { posted: colony.stationed?.() || 0, slots };
    },

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
        // R18 — the fight is over, so the pylons charge back up. Without a caller this ledger would
        // only ever grow, which is the same "written and never read" fault from the other side.
        shieldSpent.clear();
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
    tick(dt, { enemies = [], onHit = null, onTrap = null } = {}) {
      const build = getBuild();
      if (!build?.entries?.length) return;
      const live = enemies.filter(e => e && e.hp > 0);
      if (!live.length) return;

      /**
       * R18 — THE AMMO HOPPER FEEDS SOMETHING NOW.
       *
       * `ammo_hopper` has carried `feeds: { radius: 22 }` since it landed and nothing read it — the
       * piece cost steel, stood there, and raised the raid tier it could not help you survive.
       * There is no ammunition in Farhold (R16 took it out), so what a hopper can honestly buy is
       * RATE: a turret with one behind it reloads faster. The multiplier is data, not a constant
       * here, so it can be tuned without touching code.
       */
      const fed = new Set();
      let feedRate = 1;
      for (const h of build.entries) {
        const hd = build.defOf?.(h.key);
        if (!hd?.feeds || h.powered === false) continue;
        feedRate = Math.max(feedRate, hd.feeds.rate ?? 1.35);
        for (const t of build.entries) {
          if (Math.hypot(t.x - h.x, t.z - h.z) <= (hd.feeds.radius ?? 22)) fed.add(t.id);
        }
      }

      /**
       * R18 — AND THE THREE TRAPS DO SOMETHING WHEN SOMETHING WALKS ON THEM.
       *
       * `spike_trap`, `caltrops` and `pit_trap` have carried a `trap` block — dps, area, slow,
       * hold — read by NOBODY: `js/defence.js` gates firing on `def.defence`, which they do not
       * have. You could lay a caltrops field across the approach and the raiders walked through it
       * taking nothing, while the field still counted toward `baseOf().defences` and so toward the
       * size of the wave it failed to stop.
       *
       * A trap needs no power and has no cooldown: it is ground you do not want to cross. The
       * damage is handed out through `onTrap` for the same reason a turret's is handed out through
       * `onHit` — this module owns the RULES and js/main.js owns the field, the numbers and the
       * picture.
       */
      for (const e of build.entries) {
        const def = build.defOf?.(e.key);
        if (!def?.trap || !onTrap) continue;
        const t = def.trap;
        const area = t.area ?? 2;
        for (const u of live) {
          if (Math.hypot(u.x - e.x, u.z - e.z) > area) continue;
          onTrap(u, t, e, dt);
        }
      }

      for (const e of build.entries) {
        const def = build.defOf?.(e.key);
        if (def?.cat !== 'defence' || !def.defence) continue;
        // an unpowered turret is a post
        if (e.powered === false) continue;
        const gun = gunOf(def);
        // a hopper behind it reloads it faster — see `fed` above
        if (fed.has(e.id) && feedRate > 1) gun.every = gun.every / feedRate;
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

    /**
     * R18 — THE SHIELD PYLON, WHICH COST 30 kW TO DO NOTHING.
     *
     * `shield: { radius: 26, absorb: 4000 }` was read by nobody, so the piece drew live power, made
     * the raid bigger and absorbed not one point of anything.
     *
     * I first wrote this one off as impossible: `absorb` reads as a pool protecting the BASE, and
     * Farhold has no per-structure health for it to protect — a lost raid breaks an abstract
     * fraction. That was too quick. The game has `barrier` already: a real pool, spent before health
     * and regenerating toward a cap. A pylon that shields whoever is standing under it is the plain
     * reading of the name, and it needs no new damage model at all.
     *
     * The pool is honest rather than decorative: the pylon holds `absorb` and pays for the barrier
     * it keeps up, so it runs down over a long fight and refills between raids. `cap` keeps one
     * pylon from handing a level-3 character four thousand points of shield — it is a data knob, so
     * the balance of it is not buried in here.
     */
    shieldAt(x, z) {
      const build = getBuild();
      let pool = 0;
      for (const e of build?.entries || []) {
        const def = build.defOf?.(e.key);
        if (!def?.shield || e.powered === false) continue;
        if (Math.hypot(e.x - x, e.z - z) > (def.shield.radius ?? 26)) continue;
        const spent = shieldSpent.get(e.id) || 0;
        pool += Math.max(0, (def.shield.absorb ?? 0) - spent);
      }
      return Math.min(pool, data?.shield?.cap ?? 180);
    },

    /** Take `n` points out of the nearest charged pylon. Returns what it actually had. */
    spendShield(x, z, n) {
      if (!(n > 0)) return 0;
      const build = getBuild();
      let left = n;
      for (const e of build?.entries || []) {
        if (left <= 0) break;
        const def = build.defOf?.(e.key);
        if (!def?.shield || e.powered === false) continue;
        if (Math.hypot(e.x - x, e.z - z) > (def.shield.radius ?? 26)) continue;
        const spent = shieldSpent.get(e.id) || 0;
        const have = Math.max(0, (def.shield.absorb ?? 0) - spent);
        const take = Math.min(have, left);
        if (take > 0) { shieldSpent.set(e.id, spent + take); left -= take; }
      }
      return n - left;
    },

    /** Between raids the pylons charge back up — §7's "a drill costs you nothing" rule. */
    rechargeShields() { shieldSpent.clear(); },

    /** The base fell. §7.11: broken structures and a lighter store, never a deleted base. */
    lost({ materials = 0 } = {}) { return loseRaid(quest, { base: baseOf(), materials, data }); },

    toJSON() { return { quest }; },
    load(json) { quest = json?.quest || null; },
  };
}
