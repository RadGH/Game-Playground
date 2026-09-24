// Farhold — the bodies on the ground: the player's Chibi 2 character and everything that wants to
// bite it.
//
// Two body builders, one interface. A humanoid is `createChibi2Character` from the avatar JSON; a
// beast is `createCreature` from a creature spec. Both give back `{ group, setAnim, update }`, so
// the enemy code below never asks which kind it is holding.
//
// Round 4 turned this from "one wolf wanders up" into an encounter system:
//   * spawns come as **packs** — a leader and its followers, placed together
//   * every spawn rolls a **rank**: normal, champion (one modifier, an aura), rare (two, a name)
//   * **roles** change the AI: a brute walks in, an archer keeps its distance, a caster throws
//   * **bosses** are placed rather than spawned, have phases, and clear themselves an arena
//   * the level comes from the **zone**, not from the player — walk further, meet worse
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
import { tickStatuses, slowOf, applyStatus, setStatusFx, setStatusPulse } from './skills.js';
import { feel, staggerFor, pushFor, COMBAT_FEEL } from './combat-feel.js';
import { traitsOf } from './weapons.js';
import { CHIBI2_COMBAT_RIDE } from '../../../avatar-3d/js/chibi2-motion.js';

/** `bleed` out of data/skills.json — the field applies it without owning the skill data. */
const BLEED = { name: 'Bleeding', kind: 'damage', element: 'physical', perSecond: 0.26, seconds: 6 };

/**
 * R22 — the three numbers behind "enemies seem to just ignore my pets". See `aimOf` and `taunt`.
 *
 *   THREAT_SECONDS  how long a bite holds an enemy's attention. Long enough to be a tank turn,
 *                   short enough that a pet cannot park a boss forever by biting it once.
 *   THREAT_LEASH    how far it will follow the thing that bit it before it gives up and looks
 *                   around again — a companion that ran away is not a companion that is tanking.
 *   THREAT_BLOCK    how far past its own reach an enemy will count a body as "in the way".
 */
export const THREAT_SECONDS = 5;
export const THREAT_LEASH = 16;
export const THREAT_BLOCK = 1.6;

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
  /**
   * THE COMBAT CLIPS, asked for by name.
   *
   * Every attack in the game played `attack` — the same overhead chop for a rapier thrust, an axe
   * cleave, a bow shot and a staff cast. `CHIBI2_COMBAT_RIDE` is the swimming set, plus fourteen
   * strike clips, plus (round 16) `boat` and `sit` — being carried by something. They are separate
   * lists in the shared module precisely so a game that does not ask for them builds exactly what
   * it always built. `swim` is folded in rather than passed, because `chibi2.js` lets `opts.swim`
   * win over `opts.anims` and we want both.
   *
   * THE COST, since it is paid by every body in the game and not only the player: clips are
   * generated once per distinct avatar and cached, and 29 of them take about 90 ms against 45 ms
   * for 15. A town of twenty different faces pays about another second, spread over the frames it
   * takes to place them; the town tests show no change in their timings. Enemies do not use the
   * new clips, but they share `makeActor` and there is no honest way to tell them apart here.
   */
  const actor = await createChibi2Character(avatar, { anims: CHIBI2_COMBAT_RIDE });
  actor.beast = false;
  actor.combatClips = true;
  /**
   * WHICH BODY IS THE PLAYER'S — the one whose stride main.js drives.
   *
   * The clip a swing plays has to come from the strike shape, and `js/main.js` asks for `'attack'`
   * for every attack there is. It is not ours to edit this round, and `setActorAnim` is also called
   * by js/town.js and js/pets.js for their own brawlers, so a blanket substitution would put the
   * player's greatsword sweep on a townsman throwing a punch.
   *
   * `setRate` is the tell: it is called on exactly one body in the game, every frame, by the block
   * in main.js that matches the walk cycle to the ground speed. Marking on the first call is
   * narrow, cannot misfire on an NPC, and goes away the moment main.js passes the clip itself
   * (see research/round14-combat-handoff.md, patch 6 — one line).
   */
  if (actor.setRate) {
    const rate = actor.setRate.bind(actor);
    actor.setRate = k => { actor.playerDriven = true; rate(k); };
  }
  return actor;
}

/**
 * The fourteen strike clips, and what each one falls back to.
 *
 * A creature has four clips and will never have a `slam`; a humanoid built before round 14 (or one
 * a test made by hand) has twelve. Either way the answer is the overhead chop it used to play, so
 * a missing clip is a plainer animation rather than a character standing idle mid-swing — which is
 * what `chibi2.js` does with a name it does not know.
 */
const COMBAT_CLIPS = {
  slash: 'attack', slashBack: 'attack', thrust: 'attack', overhead: 'attack', sweep: 'attack',
  jab: 'attack', arcCut: 'attack', slam: 'attack', lunge: 'attack',
  shoot: 'attack', reload: 'attack', castPoint: 'cast', castStaff: 'cast', channel: 'cast',
};

/** Animation names differ slightly between the two builders; this is the translation. */
function anim(actor, name) {
  if (!actor) return;
  if (actor.beast) {
    const map = { ready: 'idle', run: 'run', walk: 'walk', attack: 'attack', hit: 'idle', dead: 'dead', idle: 'idle', jump: 'run' };
    actor.setAnim(map[name] || COMBAT_CLIPS[name] || 'idle');
    return;
  }
  /**
   * A SWING PLAYS ITS OWN CLIP. `main.js` asks for `'attack'` whatever is in your hands — a rapier
   * thrust, an axe cleave, a bow shot and a staff cast were one overhead chop — so the shape's own
   * clip is substituted here, for the player's body only. `feel.swing.clip` is posted by the
   * controller when the swing starts, which is the frame the animation should start on.
   */
  if (name === 'attack' && actor.playerDriven && feel.swing.clip) name = feel.swing.clip;
  if (COMBAT_CLIPS[name] && !actor.combatClips) name = COMBAT_CLIPS[name];
  actor.setAnim(name);
}
export { anim as setActorAnim };

/**
 * The ring of light a champion or rare wears, so "that one is different" reads from 40 m away
 * without a nameplate. Cheap: one additive ring per enemy, no light, no shader.
 */
function makeAura(colour, radius = 1.1) {
  const geo = new THREE.RingGeometry(radius * 0.72, radius, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colour), transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.06;
  mesh.renderOrder = 2;
  return mesh;
}

/**
 * THE FIELD THAT IS LIVE RIGHT NOW.
 *
 * Landing on another world throws the whole planet away and builds a new `EnemyField`, but anything
 * that was handed the OLD one at boot — the companions, most of all — keeps pointing at it. That is
 * why a pet stood next to its owner being chewed on and never hit back: it was reading the enemy
 * list of a planet that no longer exists, so as far as it knew nothing was there.
 *
 * There is only ever one field alive at a time (a dungeon reuses the surface one, it does not build
 * a second), so the newest one to be constructed IS the live one, and `pets.js` asks for it here
 * rather than trusting the reference it was given once.
 */
let liveField = null;
export function activeEnemyField() { return liveField; }

/**
 * Everything hostile in the world around the player.
 *
 * deps: { scene, terrain, rpg, defs, bosses, modifiers, zones, balance, spellfx, onLog, onKill, nameRare }
 */
export class EnemyField {
  constructor({ scene, terrain, rpg, defs, bosses = [], modifiers = [], zones = null, balance = {}, spellfx = null, onLog = () => {}, onKill = () => {}, nameRare = null }) {
    this.scene = scene; this.terrain = terrain; this.rpg = rpg; this.defs = defs;
    this.bosses = bosses; this.modifiers = modifiers; this.zones = zones;
    this.cfg = balance.spawn || {};
    this.baseAlive = this.cfg.maxAlive ?? 14;   // what `setBudget(null)` goes back to
    /**
     * R21 — how far a body that BELONGS to a set piece survives. It lives under `balance.encounters`
     * because it is the encounter layer's number: it has to stay comfortably larger than the
     * furthest `js/encounters.js` can place one, or an event loses its guards on the walk over.
     */
    this.keepRadius = Math.max(
      balance.encounters?.keepRadius ?? 0,
      (balance.encounters?.radius ?? 90) * 1.6,
      this.cfg.despawnRadius ?? 320,
    );
    this.zoneCfg = balance.zones || {};
    this.onLog = onLog; this.onKill = onKill;
    this.nameRare = nameRare;
    this.rng = makeRng(balance.seed ?? 1);
    this.enemies = [];
    this.pending = 0;
    this.sinceSpawn = 0;
    this.rankBonus = 1;          // dungeons and night raids push this up
    this.paused = false;
    /**
     * Circles nothing may spawn inside. A settlement's watch covers one — being jumped by a pack
     * while standing in a market square talking to the smith is not an encounter, it is the spawner
     * ambushing you. `main.js` refreshes this from `folk.safeZones()`.
     */
    this.safeZones = [];
    /** The obstacle fields enemies must not walk through — props, buildings, dungeon walls. */
    this.solids = [];
    this._resolved = [0, 0];
    /**
     * The spell effects, if the game handed them over. Only the modifier auras use it ("Fiery" is
     * meant to be visibly on fire), and everything still works without it — the body just wears its
     * coloured ring and nothing else.
     */
    this.spellfx = spellfx;
    /**
     * Statuses draw themselves from now on. `js/skills.js` is pure and cannot see a renderer, so
     * the field lends it one: everything that applies a burn, a poison, a chill or a curse — a
     * skill, a branded weapon, an enemy modifier, an axe opening a vein — lights up without its
     * own call site having to remember. See `setStatusFx` there.
     */
    setStatusFx((unit, type, on) => {
      const group = unit?.actor?.group;
      if (group) this.spellfx?.status?.(group, type, on);
    });
    setStatusPulse((unit, type) => {
      const group = unit?.actor?.group;
      if (group) this.spellfx?.pulseStatus?.(group, type);
    });
    /** Buckets for the shove-apart pass. Reused every frame: this must not allocate. */
    this._grid = new Map();
    liveField = this;
  }

  /** Hand over the spell effects after the fact, and light up anything already standing. */
  setSpellFx(fx) {
    this.spellfx = fx;
    if (!fx) return;
    for (const e of this.enemies) for (const key of e.fx || []) fx.status(e.actor.group, key, true);
  }

  /** The level to roll a spawn at, here: the zone's band, not the player's level. */
  levelAt(x, z, fallback = 1) {
    if (!this.zones) return fallback;
    return this.zones.levelFor(x, z, this.rng);
  }

  /** The table entries that belong in the biome the player is standing in, at this level. */
  defsFor(x, z, level) {
    const families = familiesOf(this.terrain.biomeIdAt(x, z));
    const band = this.cfg.levelSpread ?? 2;
    return this.defs.filter(d => {
      if (d.rareOnly) return false;
      const biomeOk = (d.biomes || ['any']).includes('any') || d.biomes.some(f => families.includes(f));
      const levelOk = (d.minLevel ?? 1) <= level + band && (d.maxLevel ?? 99) >= level - band;
      return biomeOk && levelOk;
    });
  }

  /** Every enemy the rare table may pull from here — `rareOnly` entries are back in. */
  rareDefsFor(x, z, level) {
    const families = familiesOf(this.terrain.biomeIdAt(x, z));
    return this.defs.filter(d => {
      const biomeOk = (d.biomes || ['any']).includes('any') || d.biomes.some(f => families.includes(f));
      return biomeOk && (d.minLevel ?? 1) <= level + 3 && (d.maxLevel ?? 99) >= level - 4;
    });
  }

  /** Is this point far enough from anywhere with a watch on it to put something hostile? */
  wild(x, z, margin = 0) {
    for (const s of this.safeZones) {
      const r = s.r + margin;
      if ((x - s.x) ** 2 + (z - s.z) ** 2 < r * r) return false;
    }
    return true;
  }

  /**
   * Push a body out of anything solid. Enemies used to walk straight through trees, walls and
   * houses that stopped the player dead, which reads as cheating even when it is only an oversight.
   */
  unstick(x, z, radius = 0.6) {
    let ox = x, oz = z;
    for (const field of this.solids) {
      if (!field) continue;
      field.resolve(ox, oz, radius, this._resolved);
      ox = this._resolved[0]; oz = this._resolved[1];
    }
    return [ox, oz];
  }

  /**
   * Put a whole encounter on the ground in the ring around the player. Most of the time that is a
   * pack — a leader plus followers within `packRadius` of each other — because one wolf at a time
   * is not a fight, it is an interruption.
   */
  async spawnNear(px, pz, playerLevel) {
    const cfg = this.cfg;
    const min = cfg.minRadius ?? 45, max = cfg.radius ?? 130;
    const angle = this.rng() * Math.PI * 2;
    const dist = min + this.rng() * (max - min);
    const x = px + Math.cos(angle) * dist, z = pz + Math.sin(angle) * dist;
    const [cx, cz] = this.terrain.clampToWorld(x, z);
    if (this.terrain.underwater(cx, cz)) return null;
    if (!this.wild(cx, cz)) return null;            // not inside a town's watch

    const level = this.levelAt(cx, cz, playerLevel);
    const pool = this.defsFor(cx, cz, level);
    if (!pool.length) return null;
    const def = this.rng.pick(pool);

    const rank = this.rpg.rollRank(this.rng, { bonus: this.rankBonus });
    const wantPack = this.rng() < (this.zoneCfg.packChance ?? 0.55);
    const span = def.pack || [1, 1];
    const count = wantPack ? span[0] + Math.floor(this.rng() * (span[1] - span[0] + 1)) : 1;
    const radius = this.zoneCfg.packRadius ?? 9;

    const made = [];
    // the ranked one leads; the rest of the pack is plain, so the eye goes to the right body
    made.push(await this.addRanked(def, level, cx, cz, rank));
    for (let i = 1; i < count; i++) {
      const a = this.rng() * Math.PI * 2, r = 2 + this.rng() * radius;
      const [fx, fz] = this.terrain.clampToWorld(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
      if (this.terrain.underwater(fx, fz) || !this.wild(fx, fz)) continue;
      made.push(await this.addRanked(def, level, fx, fz, 'normal'));
    }
    // a leader-type brings its own escort, whatever the pack roll said
    if (def.leads?.length) {
      for (const id of def.leads) {
        const sub = this.defs.find(d => d.id === id);
        if (!sub) continue;
        for (let i = 0; i < 2; i++) {
          const a = this.rng() * Math.PI * 2, r = 3 + this.rng() * radius;
          const [fx, fz] = this.terrain.clampToWorld(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
          if (!this.terrain.underwater(fx, fz) && this.wild(fx, fz)) made.push(await this.addRanked(sub, level, fx, fz, 'normal'));
        }
      }
    }
    const leader = made.find(Boolean);
    if (leader && rank !== 'normal') {
      this.onLog(`${leader.name} is out here.`, rank === 'rare' ? 'loot' : '');
    }
    return leader;
  }

  /** Add one enemy at a rank, rolling its modifiers and (for a rare) its own name. */
  async addRanked(def, level, x, z, rank = 'normal') {
    const count = rank === 'rare' ? 2 : rank === 'champion' ? 1 : 0;
    const modifiers = this.rpg.pickModifiers(this.modifiers, count, this.rng);
    let name = null;
    if (rank === 'rare' && this.nameRare) {
      const given = this.nameRare(def, this.rng);
      if (given) name = `${given}, the ${def.name}`;
    }
    return this.add(def, level, x, z, { rank, modifiers, name });
  }

  /** Add a specific enemy at a specific spot (packs, bosses, the tests and the console use this). */
  async add(def, level, x, z, { rank = 'normal', modifiers = [], name = null, boss = false } = {}) {
    const unit = this.rpg.makeEnemy(def, level, this.rng, { rank: boss ? 'boss' : rank, modifiers, name });
    unit.x = x; unit.z = z; unit.y = this.terrain.heightAt(x, z);
    unit.state = 'wander'; unit.wanderTimer = 0; unit.swingTimer = 0; unit.hitFlash = 0;
    // round 14: the physics book — knockback in flight, stagger left, armour stripped, recoil
    unit.stagger = 0; unit.push = null; unit.recoil = null; unit.sunder = 0; unit.sunderLeft = 0; unit.closing = 0;
    unit.home = [x, z];
    unit.facing = this.rng() * Math.PI * 2;
    unit.hover = def.flying ? 1.4 + this.rng() * 0.8 : 0;
    unit.bob = this.rng() * Math.PI * 2;
    /**
     * WHAT THE PLAYER'S SIDE PUT INTO IT.
     *
     * Every point of damage the player or one of their companions deals is added here, and nothing
     * else ever touches it. It is the whole of the answer to "did they earn this kill?" — see
     * `kill()`, where a body the town watch cut down on its own pays nobody.
     */
    unit.playerDamage = 0;

    /**
     * A MODIFIER MAY CHANGE THE SHAPE OF THE BODY, not only its numbers.
     *
     * `rpg.makeEnemy` sizes a spawn by its RANK alone (a champion is 1.18, a rare 1.35), so a
     * "Giant" that is only giant in the stat block reads as an ordinary wolf that takes forever to
     * kill. The size sits on the modifier in data/enemies.json and is folded in here, and the reach
     * grows with it — a four-metre body with a two-metre swing has to shove its face into you to
     * land a hit, which looks ridiculous.
     *
     * …AND SO MAY THE DEF ITSELF. "World bosses … are much larger" — a world boss cannot rely on
     * rolling the Giant modifier to be big, so `def.scale` in data/worldbosses.json says outright
     * how many times the size of an ordinary body of its kind it is, and it multiplies with whatever
     * modifiers it happens to be wearing. A tier-4 world boss comes out around nine metres.
     */
    const sizeUp = modifiers.reduce((m, mod) => m * (mod.scale ?? 1), 1) * (def.scale ?? 1);
    if (sizeUp !== 1) {
      unit.scale *= sizeUp;
      unit.reach = (unit.reach || 2.2) * (1 + (sizeUp - 1) * 0.6);
      unit.aggroRange = (unit.aggroRange || 26) * (1 + (sizeUp - 1) * 0.2);
      unit.hover *= sizeUp;
    }
    /** How much room this body takes up on the ground — see `spread()`. */
    unit.bodyR = Math.max(0.4, (unit.reach || 2.2) * 0.3);
    /**
     * The looping auras it wears, so a new spell-effects handle can restore them.
     *
     * Two sources: whatever modifiers it rolled (`fiery` burns, `graveborn` is cursed) and whatever
     * the def itself declares. The second is there for world bosses, which have to be lit up before
     * they move — a nine-metre body standing in a field with no aura on it reads as scenery.
     */
    unit.fx = [...(def.fx || []), ...modifiers.map(m => m.fx).filter(Boolean)];
    this.pending++;
    let actor = null;
    try {
      // a champion or a rare is visibly bigger — the same trick the loot games use
      const look = unit.scale !== 1 && def.look?.creature
        ? { creature: { ...def.look.creature, size: (def.look.creature.size ?? 1) * unit.scale } }
        : def.look || {};
      actor = await makeActor(look);
    } finally {
      this.pending--;
    }
    if (!actor) return null;
    unit.actor = actor;
    if (unit.scale !== 1 && !actor.beast) actor.group.scale.setScalar(unit.scale);
    actor.group.position.set(x, unit.y, z);

    // the aura ring, for anything that is not an ordinary body
    const auraColour = unit.auras?.[0] || (boss ? '#ffd24a' : null);
    if (auraColour) {
      // the ring is drawn INSIDE the body's group, so it has to be divided by the body's own scale
      // or a giant's ring ends up the size of a house
      const radius = (boss ? 2.6 : unit.rank === 'rare' ? 1.6 : 1.2) / (actor.beast ? 1 : (unit.scale || 1));
      unit.aura = makeAura(auraColour, radius);
      actor.group.add(unit.aura);
    }
    // and the looping effect a themed modifier carries: burning, dripping poison, wreathed in frost.
    // These are the spell effects' own status auras — 23 of them already exist, parented to a body
    // and sized off its height, so "visibly on fire" costs a line rather than a particle system.
    for (const key of unit.fx) this.spellfx?.status(actor.group, key, true);
    this.scene.add(actor.group);
    anim(actor, 'idle');
    this.enemies.push(unit);
    return unit;
  }

  /** Place a boss, awake and waiting, with its arena cleared of anything else. */
  async placeBoss(bossDef, level, x, z) {
    const [cx, cz] = this.terrain.clampToWorld(x, z);
    const unit = await this.add(bossDef, level, cx, cz, { boss: true });
    if (unit) { unit.boss = true; unit.aggroRange = bossDef.aggroRange ?? 44; }
    return unit;
  }

  /** The boss that belongs at this level, or null. */
  bossFor(level, x, z) {
    const families = familiesOf(this.terrain.biomeIdAt(x, z));
    const pool = this.bosses.filter(b => {
      const biomeOk = (b.biomes || ['any']).includes('any') || b.biomes.some(f => families.includes(f));
      return biomeOk && (b.minLevel ?? 1) <= level && (b.maxLevel ?? 99) >= level;
    });
    return pool.length ? this.rng.pick(pool) : null;
  }

  /**
   * How many may be alive at once.
   *
   * The Territory's incidents move this — a raid coming means more out there, and a level 1-4 band
   * means fewer, because three moor hounds arriving together at level 1 is a death with no answer.
   * `null` puts it back to whatever `balance.spawn` says.
   */
  setBudget(n) {
    this.cfg = { ...this.cfg, maxAlive: n == null ? (this.baseAlive ?? this.cfg.maxAlive) : Math.max(2, Math.round(n)) };
    return this.cfg.maxAlive;
  }

  /**
   * R22 — THE COMPANIONS THIS FIELD CAN SEE.
   *
   * A callback rather than a list, because js/pets.js owns the roster and it changes every time
   * something is summoned, dies or is dismissed — a copy handed over once would go stale inside a
   * fight. It returns live pet objects (`{ id, x, z, hp, dying, removed }`), which is exactly what
   * `pets.pets` already is.
   *
   * Left unset (a test, a dungeon floor built before the companions are), `aimOf` answers "the
   * player" for everything and this file behaves precisely as it did before the round.
   */
  setCompanions(fn) { this.companions = typeof fn === 'function' ? fn : null; }

  /**
   * Point an enemy at whatever is hurting it, or at whatever is standing in its way.
   *
   *   1. something hit it inside the last few seconds and is still alive and still nearby;
   *   2. otherwise, the nearest live companion that is both inside its reach and closer than you —
   *      a body in the way is a body it swings at;
   *   3. otherwise, you.
   *
   * `playerDist` is passed in rather than recomputed so the two can never disagree about which is
   * nearer, which is the whole of rule 2.
   */
  aimOf(e, player, playerDist, dt = 0) {
    e.threatFor = Math.max(0, (e.threatFor || 0) - dt);
    e.aimingAt = null;
    const onPlayer = { x: player.x, z: player.z, pet: null };
    if (e.state !== 'chase') { e.threatOn = null; e.threatFor = 0; return onPlayer; }
    const pets = this.companions?.();
    if (!pets || !pets.length) return onPlayer;
    const usable = p => p && p.dying == null && !p.removed && (p.hp ?? 1) > 0;

    // 1. it is busy with whatever bit it
    if (e.threatFor > 0 && e.threatOn != null) {
      const held = pets.find(p => p.id === e.threatOn);
      if (usable(held) && Math.hypot(held.x - e.x, held.z - e.z) <= THREAT_LEASH) {
        e.aimingAt = held;
        return { x: held.x, z: held.z, pet: held };
      }
      e.threatOn = null;
      e.threatFor = 0;
    }

    // 2. something is in the way
    let best = null;
    let bestD = Math.min(playerDist, (e.reach || 2.4) + THREAT_BLOCK);
    for (const p of pets) {
      if (!usable(p)) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) { e.aimingAt = best; return { x: best.x, z: best.z, pet: best }; }
    return onPlayer;
  }

  /**
   * A companion hurt this enemy — hold its attention. Called from js/pets.js when a bite lands.
   *
   * Seconds rather than a threat number on purpose: a meter would need every source of damage in
   * the game to declare a value and then a pass to tune them against each other, and what a pet is
   * for is being the thing the enemy is looking at for a while. Every fresh hit renews the clock,
   * so a companion that keeps swinging keeps the attention, which is the behaviour anyway.
   */
  taunt(enemy, pet, seconds = THREAT_SECONDS) {
    if (!enemy || !pet || enemy.dying != null || enemy.removed) return;
    enemy.threatOn = pet.id;
    enemy.threatFor = Math.max(enemy.threatFor || 0, seconds);
    if (enemy.state !== 'chase' && enemy.state !== 'flee') enemy.state = 'chase';
  }

  /** One tick of the whole field: spawn, think, move, swing, die, clean up. */
  update(dt, player, playerUnit, hooks = {}) {
    const cfg = this.cfg;
    // one running clock, so the stagger book knows what "inside six seconds" means
    this.clock = (this.clock || 0) + dt;
    if (!this.paused) {
      this.sinceSpawn += dt;
      const alive = this.enemies.length + this.pending;
      if (this.sinceSpawn >= (cfg.everySeconds ?? 2.5) && alive < (cfg.maxAlive ?? 14)) {
        this.sinceSpawn = 0;
        this.spawnNear(player.x, player.z, playerUnit.level);
      }
    }

    /**
     * WALK A COPY, NOT THE LIST ITSELF.
     *
     * "Cannot read properties of undefined (reading 'x') at EnemyField.update" was this loop reading
     * `this.enemies[i]` after the list had been emptied UNDERNEATH it. The path: an enemy swings,
     * `hooks.onEnemyStrike` runs the hit, the hit kills the player, the game respawns them — and
     * respawning teleports you home and calls `field.clear()`. The array went to length 0 halfway
     * down a countdown loop, so every remaining index read back `undefined`. (Leaving a dungeon and
     * a map teleport clear the field the same way, from the same hooks.)
     *
     * A snapshot cannot be shortened by anything a hook does, and `removed` tells us which of the
     * bodies in it have since been thrown away, so the loop is now safe whatever a hook gets up to.
     */
    const despawn = cfg.despawnRadius ?? 320;
    const keepRadius = this.keepRadius ?? despawn;
    const list = this._tickList || (this._tickList = []);
    list.length = 0;
    for (const e of this.enemies) list.push(e);
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.removed) continue;
      const dx = player.x - e.x, dz = player.z - e.z;
      const dist = Math.hypot(dx, dz);

      if (e.dying != null) {
        e.dying += dt;
        e.actor.group.position.y = e.y - Math.min(1.2, e.dying * 0.4);
        if (e.aura) e.aura.material.opacity = Math.max(0, 0.55 * (1 - e.dying / 2));
        e.actor.update(dt);
        if (e.dying > 2.4) this.removeUnit(e);
        continue;
      }
      /**
       * R21 — A SET PIECE'S BODIES OUTLIVE A PLAIN PACK'S, BECAUSE THEY START FURTHER OUT.
       *
       * Round 21 pushed set-piece placement from 90 m to 240 m so a building stops materialising
       * in the player's lap. That immediately collides with this line: an event placed 264 m away
       * (the `ahead` case at full stretch) is already within 36 m of the 300 m despawn, so its
       * guards would be culled while the player was still walking toward them — and an event with
       * no bodies left in it wins itself, which is the exact fault round 16 fixed from the other
       * direction. `encounter` is stamped on every set-piece body by `spawnBodies`, so the ones
       * that belong to something get the longer leash and ordinary wandering packs do not.
       */
      const leash = e.encounter ? keepRadius : despawn;
      // a boss never despawns while it is alive — you do not get to walk away from it by accident
      if (dist > leash && !e.boss) { this.removeUnit(e); continue; }

      if (e.hitFlash > 0) e.hitFlash -= dt;
      /**
       * STAGGERED: IT CANNOT ACT, not merely cannot walk.
       *
       * Holding `swingTimer` rather than letting it run down is the half that matters. Without it a
       * 0.65 s stagger from a maul removes 0.65 s of WALKING and none of the attacks, and a smash
       * that buys you no time is just a number with a sound effect.
       */
      if (e.stagger > 0) {
        e.stagger -= dt;
        if (e.stagger <= 0) { e.stagger = 0; this.spellfx?.status?.(e.actor.group, 'stun', false); }
      } else if (e.swingTimer > 0) {
        e.swingTimer -= dt;
      }
      // a hammer's armour break wears off
      if (e.sunderLeft > 0) {
        e.sunderLeft -= dt;
        if (e.sunderLeft <= 0) { e.sunder = 0; this.spellfx?.status?.(e.actor.group, 'sunder', false); }
      }
      /** How long this one has been closing on you, for a polearm's `brace`. */
      e.closing = dist < (e.lastDist ?? dist) - 0.01 ? (e.closing || 0) + dt : 0;
      e.lastDist = dist;

      /**
       * KNOCKBACK, taken BEFORE the chase branch so it goes through the same `clampToWorld`,
       * `unstick` and underwater guards everything else does. Eased out over 0.18 s — and a body
       * with a wall behind it, which cannot travel, takes the blow into itself instead: a flat
       * 1.5% of its health (`balance.json` player.combat.wallSlamShare). Knowing the enemy's own
       * maximum is the only number available here, and it means a wall is worth fighting against
       * whatever hit you landed.
       */
      if (e.push) {
        const p = e.push;
        p.t -= dt;
        const was = p.done;
        const k = Math.max(0, Math.min(1, 1 - p.t / p.span));
        p.done = p.metres * (1 - (1 - k) ** 3);
        const step = p.done - was;
        if (step > 0) {
          const nx = e.x + p.dx * step, nz = e.z + p.dz * step;
          let [cx, cz] = this.terrain.clampToWorld(nx, nz);
          if (!e.hover) [cx, cz] = this.unstick(cx, cz, (e.reach || 2) * 0.28);
          if (!this.terrain.underwater(cx, cz) && Math.hypot(cx - e.x, cz - e.z) > step * 0.4) {
            e.x = cx; e.z = cz;
          } else if (!p.walled) {
            // slammed into something: the blow had nowhere to go, so it went into the body
            p.walled = true;
            e.hp = Math.max(0, e.hp - Math.max(1, Math.round((e.maxHp || 20) * COMBAT_FEEL.wallSlamShare)));
            if (e.hp <= 0) { this.kill(e); continue; }
          }
        }
        if (p.t <= 0) e.push = null;
      }

      // burns and poisons keep working between swings; a chill takes the legs out of the chase
      if (e.statuses) {
        const burned = tickStatuses(e, dt);
        if (burned > 0) {
          e.hitFlash = Math.max(e.hitFlash, 0.08);
          hooks.onStatusDamage?.(e, burned);
          if (e.hp <= 0) { this.kill(e); continue; }
        }
      }

      // boss phases: each one fires once, turns on a modifier and says a line
      if (e.phases) {
        const frac = e.hp / Math.max(1, e.maxHp);
        for (const p of e.phases) {
          if (p.fired || frac > p.at) continue;
          p.fired = true;
          this.applyModifier(e, p.modifier);
          hooks.onBossPhase?.(e, p);
        }
        if (e.spawns && e.spawns.at) {
          for (let k = 0; k < e.spawns.at.length; k++) {
            if (frac > e.spawns.at[k] || (e.spawnedAt || []).includes(k)) continue;
            (e.spawnedAt || (e.spawnedAt = [])).push(k);
            const sub = this.defs.find(d => d.id === e.spawns.id);
            if (sub) for (let n = 0; n < (e.spawns.count || 2); n++) {
              const a = this.rng() * Math.PI * 2, r = 4 + this.rng() * 6;
              const [sx, sz] = this.terrain.clampToWorld(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r);
              this.add(sub, e.level, sx, sz, {});
            }
          }
        }
      }

      /**
       * TURNED BACK AT THE TOWN LINE.
       *
       * `wild()` already keeps anything hostile from SPAWNING inside a settlement's watch, but
       * nothing stopped one that spawned outside from chasing you all the way to the well — which
       * is "I still frequently get attacked while in town. Right now I've been attacked while
       * talking to NPCs in town, very annoying".
       *
       * So a chase ends at the line. It does not simply stop: it gives up and walks away, which is
       * what an animal does when a place has people and dogs in it.
       */
      if (!e.boss && !this.wild(e.x, e.z)) {
        e.state = 'flee';
        const zone = this.safeZones.find(sz => (e.x - sz.x) ** 2 + (e.z - sz.z) ** 2 < sz.r * sz.r);
        if (zone) e.facing = Math.atan2(e.x - zone.x, e.z - zone.z);
        e.fleeFor = Math.max(e.fleeFor || 0, 2.5);
      }
      if (e.state === 'flee') {
        e.fleeFor = (e.fleeFor || 0) - dt;
        if (e.fleeFor <= 0 && this.wild(e.x, e.z)) e.state = 'wander';
      }

      // decide
      /**
       * STEALTH SHORTENS HOW FAR AWAY YOU ARE NOTICED.
       *
       * `d.stealth` was derived from the affixes and read by nothing, so every cloak in the game
       * was a number on a tooltip. It is a fraction off the aggro range with a floor, because an
       * enemy you are standing on top of has to notice you however quiet your boots are.
       */
      const notice = e.aggroRange * Math.max(0.25, 1 - (player?.derived?.stealth || 0));
      if (e.state !== 'chase' && e.state !== 'flee' && dist < notice) {
        e.state = 'chase';
        // a pack notices together: anything of the same kind close by joins in
        for (const mate of this.enemies) {
          if (mate === e || mate.dying != null || mate.state === 'chase') continue;
          if (mate.defId === e.defId && Math.hypot(mate.x - e.x, mate.z - e.z) < 14) mate.state = 'chase';
        }
      } else if (e.state === 'chase' && dist > notice * 2.2 && !e.boss) {
        e.state = 'wander';
      }

      /**
       * R22 — WHO THIS ONE IS ACTUALLY GOING FOR.
       *
       *   "My pets are now actively aggressive, which is useful. However enemies seem to just
       *    ignore my pets."
       *
       * They did, completely. There was no `e.target` in this file, no threat table and no taunt:
       * `dx`, `dz`, `dist` and `facing` were all computed against `player` and nothing else, so an
       * enemy could not have walked toward a companion if it wanted to. The only way a pet ever ate
       * a hit was a coin flip in js/main.js at the instant a swing landed — the enemy walked THROUGH
       * the pet to reach you and then happened to hit whatever was nearest. And js/pets.js made it
       * worse from the other side: a pet landing a hit set `target.state = 'chase'`, which is chase
       * the PLAYER, so biting something made it run at you faster.
       *
       * `aimOf` is the whole rule, and it is deliberately two clauses rather than a threat meter:
       * whatever hurt it recently holds its attention for a few seconds, and failing that it swings
       * at whatever body is standing between it and you. A meter would need a number on every
       * source of damage and a tuning pass; this needs neither and produces the thing a pet is for.
       *
       * `dist` above stays the distance to the PLAYER, because that is what the despawn leash and
       * the notice range are about — an enemy fighting your wolf thirty metres away must not be
       * culled for being thirty metres from you.
       */
      const aim = this.aimOf(e, player, dist, dt);
      const adx = aim.x - e.x, adz = aim.z - e.z;
      const adist = Math.hypot(adx, adz);

      // how close this one wants to be: an archer or a caster holds off, everything else closes
      const standOff = e.ranged ? Math.min(e.ranged.range * 0.65, e.ranged.range - 6) : 0;

      let speed = 0;
      if (e.stagger > 0) {
        // reeling: no walk, no swing, no shot. The body still gets its frame so the clip plays.
        e.y = this.terrain.heightAt(e.x, e.z);
        let sy = e.y;
        if (e.hover) { e.bob += dt * 1.6; sy += e.hover + Math.sin(e.bob) * 0.22; }
        this.placeBody(e, sy);
        e.actor.update(dt);
        continue;
      }
      if (e.state === 'flee') {
        // straight back out of the watch, and no attacking on the way
        speed = e.speed * 1.15;
        /**
         * A RUNNER KEEPS YOU AT ITS BACK.
         *
         * `facing` is set once when something bolts out of a town's watch, which is fine for two
         * and a half seconds of running in a straight line. The chase events in js/encounters.js
         * need the other thing: a body that keeps putting distance between itself and you for half
         * a minute, whichever way you come at it. Without this you sidestep once and it runs
         * cheerfully back into your swing, and "catch it before it gets away" is not a chase.
         */
        if (e.quarry) e.facing = Math.atan2(-dx, -dz);
      } else if (e.state === 'chase') {
        // R22 — everything from here down is about the thing it is FIGHTING, which is usually you
        // and is sometimes the companion that just bit it.
        e.facing = Math.atan2(adx, adz);
        if (standOff > 0) {
          // keep the gap: walk in when too far, back off when the target closes
          if (adist > standOff + 3) speed = e.speed;
          else if (adist < standOff * 0.55) { speed = e.speed * 0.8; e.facing += Math.PI; }
          if (e.swingTimer <= 0 && adist <= e.ranged.range) {
            e.swingTimer = e.attackEvery;
            anim(e.actor, 'attack');
            hooks.onEnemyShoot?.(e);
          }
        } else if (adist > e.reach) {
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
        if (e.strolling && !e.boss) speed = e.speed * 0.32;
      }
      // A swing can kill the player, and dying clears the whole field — so this body may have been
      // thrown away two lines ago. Its bones are gone; do not go on animating them.
      if (e.removed) continue;

      if (speed > 0) {
        speed *= 1 - slowOf(e);
        const nx = e.x + Math.sin(e.facing) * speed * dt;
        const nz = e.z + Math.cos(e.facing) * speed * dt;
        let [cx, cz] = this.terrain.clampToWorld(nx, nz);
        // Walls, trees and houses stop a body the same way they stop the player. Anything airborne
        // is allowed over them — a bat that cannot cross a wall is a worse bat.
        if (!e.hover) [cx, cz] = this.unstick(cx, cz, (e.reach || 2) * 0.28);
        if (!this.terrain.underwater(cx, cz)) {
          // if the push put it back where it started it is up against something: turn and try again
          if (Math.hypot(cx - e.x, cz - e.z) < speed * dt * 0.25) e.facing += (this.rng() - 0.5) * 1.6 + Math.PI * 0.5;
          e.x = cx; e.z = cz;
        } else { e.facing += Math.PI; }
      }
      e.y = this.terrain.heightAt(e.x, e.z);
      let y = e.y;
      if (e.hover) { e.bob += dt * 1.6; y += e.hover + Math.sin(e.bob) * 0.22; }
      if (e.recoil) { e.recoil.t -= dt; if (e.recoil.t <= 0) e.recoil = null; }
      this.placeBody(e, y);
      e.actor.group.rotation.y = e.facing;
      if (e.aura) e.aura.rotation.y += dt * 0.9;
      if (e.swingTimer <= 0 || e.state !== 'chase') {
        anim(e.actor, speed > e.speed * 0.6 ? 'run' : speed > 0 ? 'walk' : 'idle');
      }
      e.actor.update(dt);
    }

    this.spread(dt);
  }

  /**
   * NOTHING STANDS INSIDE ANYTHING ELSE.
   *
   * Observed: "enemies clip together and stack up when attacking". They all walk at the same point —
   * the player — and there was nothing to say two bodies cannot be in the same place, so a pack of
   * six arrived as one flickering wolf with six health bars. Pushing them apart is also what makes
   * them SURROUND you: shoved off each other while all still heading in, they end up spread around
   * the ring where they can each reach you.
   *
   * Cost matters here — this runs for dozens of bodies every frame — so it is a grid rather than
   * every-pair-against-every-pair: buckets four metres across, each bucket compared with itself and
   * four neighbours (the other four are the same pairs seen from the other side). A body is only
   * ever compared with one that could actually be touching it.
   */
  spread(dt) {
    const list = this.enemies;
    if (list.length < 2) return;
    const CELL = 4;
    const grid = this._grid;
    const pool = this._buckets || (this._buckets = []);
    grid.clear();
    let used = 0;
    for (const e of list) {
      if (e.removed || e.dying != null || e.hover) continue;   // the dead and the airborne do not jostle
      const gx = Math.floor(e.x / CELL), gz = Math.floor(e.z / CELL);
      // one number per cell, and no two cells share it: a plain number key costs nothing to make,
      // where a string one would allocate for every body every frame
      const key = gx * 1e6 + gz;
      let bucket = grid.get(key);
      if (!bucket) {
        // the buckets themselves are reused frame to frame, so a busy fight allocates nothing here
        bucket = pool[used] || (pool[used] = { gx: 0, gz: 0, list: [] });
        used++;
        bucket.gx = gx; bucket.gz = gz; bucket.list.length = 0;
        grid.set(key, bucket);
      }
      bucket.list.push(e);
    }
    // the half-neighbourhood: each pair of buckets is visited exactly once
    const NEI = [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    for (const bucket of grid.values()) {
      for (const [ox, oz] of NEI) {
        const other = ox === 0 && oz === 0 ? bucket : grid.get((bucket.gx + ox) * 1e6 + (bucket.gz + oz));
        if (!other) continue;
        const same = other === bucket;
        for (let i = 0; i < bucket.list.length; i++) {
          for (let j = same ? i + 1 : 0; j < other.list.length; j++) this.shove(bucket.list[i], other.list[j], dt);
        }
      }
    }
  }

  /** Push two overlapping bodies apart, the lighter one giving way to the heavier. */
  shove(a, b, dt) {
    const want = (a.bodyR || 0.6) + (b.bodyR || 0.6);
    let dx = b.x - a.x, dz = b.z - a.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= want * want) return;
    let d = Math.sqrt(d2);
    if (d < 1e-3) {
      // exactly on top of each other: pick a direction off their facings so it never jitters
      dx = Math.sin(a.facing || 0) - Math.sin(b.facing || 1);
      dz = Math.cos(a.facing || 0) - Math.cos(b.facing || 1);
      d = Math.hypot(dx, dz) || 1;
      if (d < 1e-3) { dx = 1; dz = 0; d = 1; }
    }
    const nx = dx / d, nz = dz / d;
    // no more than a third of a metre a frame each, or a crowd flings itself apart
    const push = Math.min((want - d) * 0.5, 0.34);
    // a boss or a giant is not shifted by a rat: mass goes with the square of the size
    const wa = (a.boss ? 40 : 1) * (a.scale || 1) ** 2, wb = (b.boss ? 40 : 1) * (b.scale || 1) ** 2;
    const total = wa + wb;
    this.slide(a, -nx * push * (wb / total), -nz * push * (wb / total));
    this.slide(b, nx * push * (wa / total), nz * push * (wa / total));
  }

  /** Move a body sideways, obeying the same walls and water its own walking does. */
  slide(e, dx, dz) {
    if (!dx && !dz) return;
    let [cx, cz] = this.terrain.clampToWorld(e.x + dx, e.z + dz);
    [cx, cz] = this.unstick(cx, cz, (e.reach || 2) * 0.28);
    if (this.terrain.underwater(cx, cz)) return;
    e.x = cx; e.z = cz;
    e.y = this.terrain.heightAt(cx, cz);
    e.actor.group.position.set(e.x, e.y + (e.hover || 0), e.z);
  }

  /** Turn a modifier on mid-fight (a boss phase does this). */
  applyModifier(e, id) {
    const m = this.modifiers.find(x => x.id === id);
    if (!m) return;
    e.dmg = e.dmg.map(v => Math.round(v * (m.dmg ?? 1)));
    e.armor = Math.round(e.armor * (m.armor ?? 1));
    e.speed *= m.speed ?? 1;
    e.attackEvery *= m.attackEvery ?? 1;
    if (m.onHit) e.onHit = [...(e.onHit || []), m.onHit];
    if (m.thorns) e.derived.thorns = (e.derived.thorns || 0) + m.thorns;
    if (m.resist) e.derived.resistAll = (e.derived.resistAll || 0) + m.resist * 100;
    if (m.lifeSteal) e.lifeSteal = (e.lifeSteal || 0) + m.lifeSteal;
    e.modifiers = [...(e.modifiers || []), m.id];
    if (m.aura && !e.aura) {
      e.aura = makeAura(m.aura, (e.boss ? 2.6 : 1.4) / (e.actor.beast ? 1 : (e.scale || 1)));
      e.actor.group.add(e.aura);
    } else if (m.aura && e.aura) {
      e.aura.material.color.set(m.aura);
    }
    // a themed modifier turned on mid-fight lights up the same way one rolled at spawn does
    if (m.fx && !(e.fx || []).includes(m.fx)) {
      (e.fx || (e.fx = [])).push(m.fx);
      this.spellfx?.status(e.actor.group, m.fx, true);
    }
  }

  /**
   * Record that the player's side hurt this one. Everything the player or a companion does goes
   * through here, and nothing else does — which is exactly what `kill()` needs to know.
   */
  /**
   * Put a body where it stands, plus the visual recoil from the last thing that hit it.
   *
   * 8 cm along the blow, eased back over 120 ms. It costs nothing, it is independent of the
   * knockback physics, and it is the difference between "a number appeared" and "I hit something".
   */
  placeBody(e, y) {
    const r = e.recoil;
    if (!r) { e.actor.group.position.set(e.x, y, e.z); return; }
    const k = Math.max(0, r.t / r.span);
    const back = COMBAT_FEEL.recoilMetres * k * k;
    e.actor.group.position.set(e.x + r.dx * back, y, e.z + r.dz * back);
  }

  credit(e, amount = 1) {
    if (!e || !(amount > 0)) return;
    e.playerDamage = (e.playerDamage || 0) + amount;
  }

  /**
   * WHAT A CONNECTING HIT DOES, beyond the number — the one place all of it happens.
   *
   * Round 14. Before this, `strike` rolled damage, set an 0.18 s colour flash, and that was the
   * whole of it: the thing you hit kept walking toward you at the same speed with a number floating
   * over its head. Six things make a blow read as a blow and five of them did not exist anywhere in
   * the game. They are gathered here rather than in `main.js` so that every path that damages
   * something — a swing, a splash, an arrow, a spell — gets the same treatment for free.
   */
  land(e, result, { strike = null, fromX = 0, fromZ = 0, element = 'physical', share = 1 } = {}) {
    this.credit(e, result.amount);
    e.hitFlash = 0.18;
    if (e.state !== 'chase') e.state = 'chase';
    if (!(result.amount > 0) && !result.blocked) return;

    const at = this._vec || (this._vec = new THREE.Vector3());
    const bodyY = (e.y || 0) + 0.9 * (e.scale || 1) + (e.hover || 0);

    /**
     * (a) THE IMPACT EFFECT, WHICH A STEEL SWORD NEVER GOT.
     *
     * `main.js` gates its own impact call behind `element !== 'physical'`, so an ordinary sword hit
     * drew nothing at all — while `spellfx.impact({ element: 'physical' })` has always built two
     * crossed slash planes, a spark burst and a dust puff and nobody ever asked it for them. Drawing
     * the physical case here fixes it without touching main.js, and without drawing the elemental
     * one twice.
     */
    if (element === 'physical') {
      at.set(e.x, bodyY, e.z);
      this.spellfx?.impact?.({ at, element: 'physical', crit: !!result.crit });
    }
    /** (b) SPARKS ON ARMOUR. A blow that was blocked, or one that skated off plate. */
    if (result.blocked > 0 || ((e.armor || 0) > 40 && share >= 1)) {
      at.set(e.x, bodyY, e.z);
      this.spellfx?.impact?.({ at, element: 'true', crit: false });
    }

    /** (c) RECOIL: the body is nudged along the blow and eases back. The cheap half of weight. */
    const dx = e.x - fromX, dz = e.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    e.recoil = { dx: dx / len, dz: dz / len, t: 0.12, span: 0.12 };

    if (!strike) return;

    /** (d) KNOCKBACK. Travelled over 0.18 s, resisted by rank, and a wall makes it hurt more. */
    const push = pushFor(e, (strike.push || 0) * share);
    if (push > 0.01) {
      const span = COMBAT_FEEL.knockbackSeconds;
      e.push = { dx: dx / len, dz: dz / len, metres: push, t: span, span, done: 0 };
    }

    /** (e) STAGGER, with the diminishing returns that stop a maul locking a boss for ever. */
    const stagger = staggerFor(e, (strike.stagger || 0) * share, this.clock || 0);
    if (stagger > 0.01) {
      e.stagger = Math.max(e.stagger || 0, stagger);
      anim(e.actor, 'hit');
      if (stagger > 0.4) this.spellfx?.status?.(e.actor.group, 'stun', true);
    }

    /** (f) HIT-STOP AND SCREEN SHAKE — the global half, owned by js/combat-feel.js. */
    feel.hit({
      strike, crit: !!result.crit, killed: !!result.dead,
      fromX, fromZ, toX: e.x, toZ: e.z,
    });
  }

  /**
   * ARMOUR BREAK — a hammer's whole reason to exist.
   *
   * Every hammer hit strips 7% of what is left of the target's armour for eight seconds, floored at
   * 45% of the original. Against a 60-armour enemy that is the difference between taking 62.5% of
   * your damage and taking 74%, and it helps everything else hitting the same body — which is what
   * a hammer is FOR. Carried as a fraction on the unit and read by `rpg.strike`.
   */
  sunder(e, share = 0.07) {
    if (!e || !(share > 0)) return;
    e.sunder = Math.min(0.55, (e.sunder || 0) + share);
    e.sunderLeft = 8;
    this.spellfx?.status?.(e.actor.group, 'sunder', true);
  }

  /**
   * Damage everything inside the player's swing. Returns what was hit.
   *
   * Round 14 gave the swing a SHAPE beyond a cone. A polearm's thrust is a line out to its full
   * reach that hits every body along it — which is the whole promise of "polearms should add some
   * range", and it out-reaches every enemy in `data/enemies.json` by nearly three metres. A dagger
   * landed in something's back is worth 2.2x. Both read the strike out of the swing channel
   * (js/combat-feel.js), because `main.js` hands this function a reach and an arc and never says
   * which shape they came from.
   */
  strike(player, playerUnit, { reach = 2.9, arc = 1.5, power = 1, element = 'physical', skill = null, onHit = null, applyStatus: applyFn = null, hand = null, strike: shapeIn = null } = {}) {
    const hits = [];
    const shape = shapeIn || feel.swing.strike || null;
    const weapon = shape?.item || null;
    const traits = weapon ? traitsOf(weapon) : {};
    // which hand swung: the strike carries the item it came from, and the off hand rolls its own dice
    const which = hand || (weapon && weapon === playerUnit?.equipment?.offhand ? 'off' : 'main');
    const line = shape?.key === 'thrust' && traits.pierceLine ? traits.pierceLine : 0;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    let pierced = 0;

    for (const e of this.enemies) {
      if (e.dying != null) continue;
      const dx = e.x - player.x, dz = e.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach + (e.reach || 2) * 0.4) continue;
      if (line) {
        /**
         * A LINE, NOT A CONE. 0.9 m either side of where you are pointing, out to full reach, and
         * it stops after `pierceLine` bodies. A halberd thrust is 4.8 x 1.55 = 7.4 m of it.
         */
        const along = dx * fx + dz * fz;
        if (along < 0 || along > reach) continue;
        const off = Math.abs(dx * fz - dz * fx);
        if (off > 0.9 + (e.reach || 2) * 0.25) continue;
        if (pierced >= line) continue;
        pierced++;
      } else {
        const toEnemy = Math.atan2(dx, dz);
        const delta = Math.abs(((toEnemy - player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (delta > arc / 2) continue;
      }

      let mult = power;
      /**
       * MOMENTUM, the sword's own reward: each consecutive connecting strike is +8% damage, up to
       * +16% on the third, and it resets the moment you miss or stop. A sword should never feel
       * like waiting — this is what makes a combo worth finishing rather than restarting.
       */
      if (traits.momentum) mult *= 1 + Math.min(2, playerUnit?.combo || 0) * 0.08;
      /**
       * THE BACK. A dagger landed in the target's rear 100 degrees is worth 2.2x and bleeds it.
       * The facing is already tracked on every body, so this is one angle and one comparison.
       */
      let behind = false;
      if (traits.backstab) {
        const away = Math.atan2(-dx, -dz);                     // from the target toward the attacker
        const delta = Math.abs(((away - (e.facing || 0) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        behind = delta < 0.87;                                 // 100 degrees, half either side
        if (behind) mult *= traits.backstab;
      }
      /** BRACE: a polearm thrust against something that closed on you this second does more. */
      if (traits.brace && shape?.key === 'thrust' && e.closing > 0) mult *= 1 + traits.brace;

      const result = this.rpg.strike(playerUnit, e, this.rng, {
        multiplier: mult, element, skill, applyStatus: applyFn,
        hand: which, pen: shape?.pen || 0,
      });
      this.land(e, result, { strike: shape, fromX: player.x, fromZ: player.z, element, share: power });

      // a hammer strips armour, an axe opens a vein, a knife in the back does both
      if (traits.armourBreak && result.amount > 0) this.sunder(e, traits.armourBreak);
      if (result.amount > 0 && (behind || (traits.bleed && shape?.key === 'cleave'))) {
        this.bleed?.(e, result.amount);
      }

      onHit?.(e, result);
      hits.push({ enemy: e, result });
      if (result.dead) this.kill(e);
    }
    // the combo only counts while you keep connecting
    if (playerUnit) playerUnit.combo = hits.length ? Math.min(3, (playerUnit.combo || 0) + 1) : 0;
    return hits;
  }

  /**
   * Damage everything within `radius` of a point — an arrow landing, or a heavy weapon's shockwave.
   * Every attack in the game goes through this or `strike`, so nothing is ever single-target.
   */
  strikeArea(x, z, radius, attacker, { falloff = 0.45, power = null, element = 'physical', skill = null, onHit = null, applyStatus: applyFn = null, proc = false } = {}) {
    const hits = [];
    /**
     * AN ARROW CARRIES THE DRAW IT WAS LOOSED AT.
     *
     * A bow's shot is resolved here, from `main.js`'s `onArrowLand`, which passes no `power` at all
     * — so every arrow in the game was a full-power 2.6 m area hit for free while a melee jab was
     * 0.65 of one. The shot channel (js/combat-feel.js) is opened by js/combat-fx.js for exactly
     * the moment the callback runs, so the arrow's own draw arrives here without main.js having to
     * pass it. An explicit `power` always wins.
     */
    const shot = power == null ? feel.swing.shot : null;
    const mult = power != null ? power : (shot?.power ?? 1);
    const shape = shot?.strike || null;
    for (const e of this.enemies) {
      if (e.dying != null) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > radius + (e.reach || 2) * 0.25) continue;
      // full damage at the centre, `falloff` of it at the rim
      const near = 1 - (1 - falloff) * Math.min(1, d / Math.max(0.001, radius));
      // R23 — `proc` marks a strike a unique's power made (a pool, an aura, a slam), so the powers
      // that start more strikes do not start them off this one
      const result = this.rpg.strike(attacker, e, this.rng, { multiplier: near * mult, element, skill, applyStatus: applyFn, proc });
      this.land(e, result, { strike: shape, fromX: x, fromZ: z, element, share: near });
      onHit?.(e, result);
      hits.push({ enemy: e, result });
      if (result.dead) this.kill(e);
    }
    return hits;
  }

  /**
   * A cut that keeps working. An axe is the melee damage-over-time weapon: less up front, more in
   * total, and it goes on paying while you back off. `bleed` is already a status with an aura.
   */
  bleed(e, amount = 1) {
    if (!e) return;
    // the field is built without the skill data, so the one status it applies on its own carries a
    // copy of its row from data/skills.json. tests/round14.test.js checks the two never drift.
    const spec = this.statusData?.bleed || BLEED;
    applyStatus(e, 'bleed', spec, Math.max(1, amount * 0.35));
    this.spellfx?.status?.(e.actor.group, 'bleed', true);
  }

  /**
   * The nearest live enemy along a shot, in three dimensions — a bow that can only scan the
   * horizontal plane cannot hit anything up a slope or down a bank.
   */
  /**
   * The nearest living body to a point, ignoring one you have already hit.
   *
   * Added for the `chain` talent: a chained bolt has to find somewhere to jump to, and "nearest that
   * is not the one I just burst on" is the whole rule. Kept here rather than in main.js because the
   * enemy list belongs to the field and nothing outside it should be walking the array.
   */
  nearestTo(x, z, range = 12, except = null) {
    let best = null, bd = range * range;
    for (const e of this.enemies) {
      if (!e || e === except || e.removed || e.dying != null) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  hitScan(x, y, z, dirX, dirY, dirZ, { range = 40, width = 1.1 } = {}) {
    let best = null, bestT = Infinity;
    for (const e of this.enemies) {
      if (e.dying != null) continue;
      const ex = e.x - x, ey = (e.y + 0.9 + (e.hover || 0)) - y, ez = e.z - z;    // aim at the body, not the feet
      const t = ex * dirX + ey * dirY + ez * dirZ;               // distance along the shot
      if (t < 0 || t > range) continue;
      const off = Math.hypot(ex - dirX * t, ey - dirY * t, ez - dirZ * t);
      if (off > width + (e.reach || 2) * 0.3) continue;
      if (t < bestT) { bestT = t; best = e; }
    }
    return best ? { enemy: best, distance: bestT } : null;
  }

  /** Everything alive within `radius` of a point — used by breath, curses and spreading statuses. */
  near(x, z, radius, except = null) {
    return this.enemies.filter(e => e !== except && e.dying == null && Math.hypot(e.x - x, e.z - z) <= radius);
  }

  /** The status an enemy's own hits leave behind, if it has one. */
  statusOnHit(e, target, statuses) {
    if (!e.onHit?.length) return null;
    const type = e.onHit[Math.floor(this.rng() * e.onHit.length)];
    const spec = statuses?.[type];
    if (!spec) return null;
    applyStatus(target, type, spec, Math.max(1, (e.dmg[1] || 4) * 0.5));
    return type;
  }

  /**
   * WHO EARNED THIS ONE.
   *
   * Observed: "when a guard kills an enemy, the player gets the xp and loot". The town watch is a
   * real fighter — it does damage and it finishes things off — and the reward was handed over on
   * the death alone, whoever caused it, so standing in a market square watching guards work paid
   * better than fighting.
   *
   * The rule: the player's side has to have put damage in. Not the killing blow — ANY damage, so
   * nothing can snipe a kill you earned by landing the last hit on it. If they did not, the kill is
   * the watch's and the reward is simply gone; the body still dies and still despawns.
   *
   * A kill out in the wild, where no guard can reach, always pays: the only things out there that
   * can take a body down are the player, their companions, and their burns and poisons.
   */
  kill(e) {
    if (e.dying != null) return;
    e.dying = 0;
    anim(e.actor, 'dead');
    /**
     * A DEATH DREW NOTHING. `onEnemyKilled` in main.js has one `spellfx` call in it and it is
     * behind a legendary. The moment a thing dies is the moment most worth marking, so it gets the
     * biggest impact the engine draws and a longer hold on the world — see js/combat-feel.js, where
     * a killing blow is worth 2.2x the hit-stop.
     */
    if (this.spellfx?.impact) {
      const at = this._vec || (this._vec = new THREE.Vector3());
      at.set(e.x, (e.y || 0) + 0.8 * (e.scale || 1) + (e.hover || 0), e.z);
      this.spellfx.impact({ at, element: e.element || 'physical', crit: true });
    }
    this.spellfx?.clearStatuses?.(e.actor.group);
    e.stagger = 0; e.push = null;
    // the margin is for a guard whose post sits off the middle of its settlement: it can chase a
    // little past the edge of the watch circle, and that is still its kill, not yours
    const earned = (e.playerDamage || 0) > 0 || e.boss || this.wild(e.x, e.z, 16);
    if (!earned) {
      this.onLog(`The watch cuts down ${e.name}. Nothing in it for you.`, '');
      return;
    }
    this.onKill(e);
  }

  /** Take a body out of the world. Safe at any time, including from inside a hook. */
  removeUnit(e) {
    if (!e || e.removed) return;
    e.removed = true;
    this.spellfx?.clearStatuses?.(e.actor.group);
    this.scene.remove(e.actor.group);
    e.aura?.geometry.dispose();
    e.aura?.material.dispose();
    e.actor.dispose?.();
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
  }

  /** The same, by position in the list — kept for callers that walk the array themselves. */
  remove(i) { this.removeUnit(this.enemies[i]); }

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

  /** Is anything actually fighting the player right now? Conditional affixes need to know. */
  get engaged() { return this.enemies.some(e => e.dying == null && e.state === 'chase'); }

  clear() { while (this.enemies.length) this.removeUnit(this.enemies[this.enemies.length - 1]); }
}
