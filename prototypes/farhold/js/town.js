// Farhold phase 4 — the people in the places.
//
// Phase 2 built the map's settlements as buildings. This puts somebody in them: a handful of folk
// standing about each village, town and city, with a merchant who will trade and an elder who has
// work. Names come from Name Forge in the settlement's own race, so the woman selling you a dagger
// in a dwarf town has a dwarf name.
//
//   const folk = createTownFolk(scene, terrain, { features, rpg, namegen, looks, seed });
//   folk.update(dt, control, player.level);
//   const who = folk.nearest(control.x, control.z);   // press E on them
//
// NPCs only exist near you. They are built from a small fixed set of looks so the Chibi 2 template
// cache is shared — a unique body per villager would build a new skinned mesh for each one.

import { CHIBI2_RACES } from '../../../avatar-3d/js/chibi2-races.js';
import * as THREE from 'three';
import { makeRng } from '../../emberveil/js/rng.js';
import { makeActor, setActorAnim } from './actors.js';
import { makeQuest } from './quests.js';
import { M_PER_CELL } from './planet.js';
import { attuneWeapon } from './rpg.js';
import { createGearShop, categoryOf, VEHICLES } from './gear.js';
// A hired sword is one of the folk, but the offer they make is pure arithmetic with no scene in
// it — so it lives in its own module and the node tests can drive it. See js/hire.js.
export { hireOffer, HIRE_ROLE_WORDS } from './hire.js';
import { hireOffer as buildHireOffer } from './hire.js';
// R23: townsfolk stand on bridge decks (js/ground.js), and a walled town posts guards at its gates
import { groundAt, wetAt } from './ground.js';
import { sentryPosts, townExtent } from './town-plan.js';
// R27 M4 — a gate guard's line by your standing, and the emote a friendly one gives you
import { gateLine } from './speech.js';
import { CHIBI2_EMOTE_ANIMS } from '../../../avatar-3d/js/chibi2-motion.js';

/**
 * The little badge that floats over somebody worth talking to. Drawn into a canvas once per glyph
 * and used as a sprite, so it always faces you and costs one draw call per person.
 */
const badgeCache = new Map();
function badgeSprite(glyph, colour) {
  const key = glyph + colour;
  if (!badgeCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    // a soft dark disc behind it, so a gold "!" still reads against a bright sky
    ctx.fillStyle = 'rgba(10,14,20,.72)';
    ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colour; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = colour;
    ctx.fillText(glyph, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    badgeCache.set(key, tex);
  }
  const mat = new THREE.SpriteMaterial({ map: badgeCache.get(key), transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.9, 0.9, 1);
  sprite.position.y = 2.5;
  sprite.renderOrder = 4;
  return sprite;
}

/** What badge a role wears: work to hand out, or a stall. */
export function badgeFor(role) {
  if (role.quests) return { glyph: '!', color: '#ffd24a', kind: 'quest' };
  if (role.gambles) return { glyph: '?', color: '#ffd24a', kind: 'gambler' };
  // R17: a broker is a shop for people, so the pip is a trader's with a colour of its own
  if (role.brokers) return { glyph: '$', color: '#c08aff', kind: 'broker' };
  // R20: the Unbinder sells nothing, so the pip is not a trader's — it is the arrow that goes back
  if (role.retrains) return { glyph: '↺', color: '#7fd0ff', kind: 'unbinder' };
  if (role.trades) return { glyph: '$', color: '#8fe0a0', kind: 'shop' };
  return null;
}

/** Who stands in a settlement, by how big it is. */
export const ROLES = [
  { key: 'merchant', name: 'Merchant', minSize: 1, trades: true, greeting: 'Trade? I have what the road allows.' },
  { key: 'elder', name: 'Elder', minSize: 1, quests: true, greeting: 'We could use a pair of hands.' },
  { key: 'villager', name: 'Villager', minSize: 1, greeting: 'Mind the road after dark.' },
  { key: 'smith', name: 'Smith', minSize: 3, trades: true, greeting: 'Steel, if you have the coin.' },
  { key: 'innkeeper', name: 'Innkeeper', minSize: 3, quests: true, greeting: 'A bed, a fire, and trouble to spare.' },
  { key: 'guard', name: 'Guard', minSize: 2, guards: true, greeting: 'Move along, or do not. It is all the same to me.' },
  /**
   * The gambler. "Add a gambler who sells loot crates similar to the ones you can find randomly.
   * These should have only one item in them. You should be able to buy any rarity of loot crate at
   * a different price, guaranteeing at LEAST that level of loot inside. However any loot crate
   * should have a small chance to have even better loot inside of it — increased for higher loot
   * crates." Only in a real town: somewhere with three houses cannot support one.
   */
  { key: 'gambler', name: 'Gambler', minSize: 3, gambles: true, greeting: 'Sealed, unopened, and I do not know what is in it either. That is the arrangement.' },
  /**
   * R17 — THE BROKER. "Add a mercenary person who sells mercenaries to the player."
   *
   * The game already had a hire, and it was one person selling one product: the road captain asked
   * `pets.summon('sellsword')` by name, so every mercenary in the world was the same body wearing a
   * different label. This is the shop. They are not a hired sword themselves — they keep a board,
   * and what is on it comes from data/mercenaries.json through js/followers.js `board()`. Size 2
   * and up, because a hamlet has nobody to sell.
   */
  { key: 'broker', name: 'Mercenary Broker', minSize: 2, brokers: true, greeting: 'Four names on the board today. They all want paying up front.' },
  /**
   * R20 — THE UNBINDER. The only way a spell, a perk or a talent comes back off a character.
   *
   *   "Add an NPC at town who is able to reset individual or all spells, perks, and talents, and
   *    remove the ability to do it directly from the inventory."
   *
   * All three used to be free buttons on the character sheet, which meant a build was a setting
   * rather than a decision. They are a person and a price now. Size 2 and up, so you are never
   * more than one proper settlement away from changing your mind, but a three-house hamlet does
   * not keep one.
   */
  {
    key: 'unbinder', name: 'Unbinder', minSize: 2, retrains: true,
    greeting: 'What you learned, you can unlearn. It comes out harder than it went in, and I charge for the difference.',
  },
];

/**
 * What a sealed crate costs and what it promises.
 *
 * `floor` is the worst thing inside — the guarantee you are paying for. `lift` is the chance the
 * roll comes out a tier better than the promise, and it climbs with the price, because the whole
 * appeal of the expensive crate is that it can still surprise you.
 */
export const CRATE_TIERS = [
  { key: 'plain', name: 'Plain Crate', floor: 'normal', price: 60, lift: 0.1 },
  { key: 'marked', name: 'Marked Crate', floor: 'magic', price: 240, lift: 0.14 },
  { key: 'sealed', name: 'Sealed Crate', floor: 'rare', price: 900, lift: 0.2 },
  { key: 'warded', name: 'Warded Crate', floor: 'legendary', price: 3200, lift: 0.28 },
];

/**
 * How many people a settlement of each size holds. The first entry used to be 0, so the smallest
 * settlements on the map were built, named, and completely empty — you walked into a village and
 * there was nobody to talk to. Nowhere has fewer than three now, and a merchant is guaranteed.
 */
const HEADCOUNT = [3, 3, 4, 6, 8, 9];

/**
 * What a merchant's stock is drawn from, by category.
 *
 * "Make it so that shops have a menu more like Diablo 2 where you can filter by categories: armor,
 * weapon, other; and offer a larger selection of random loot in each one."
 *
 * So a shop is three lists rather than one, and each one is stocked from bases that belong in it.
 * `other` is the interesting one: jewellery, the torch and the mount slots, and the quivers — the
 * things you do not go looking for and then find you want.
 */
export const SHOP_CATEGORIES = ['weapon', 'armor', 'other'];

export const STOCK_BY_ROLE = {
  merchant: {
    weapon: ['dagger', 'sword', 'wand', 'scepter', 'shortbow', 'staff'],
    armor: ['cloth_helm', 'light_boots', 'light_chest', 'cloth_robe', 'light_gloves', 'light_legs'],
    other: ['ring', 'necklace'],
  },
  smith: {
    weapon: ['sword', 'longsword', 'hammer', 'axe', 'sword2h', 'axe2h', 'crossbow', 'mace'],
    armor: ['medium_chest', 'medium_helm', 'heavy_gauntlets', 'heavy_chest', 'heavy_helm', 'shield', 'medium_legs'],
    other: ['ring', 'necklace'],
  },
};

/** How many of each category a shop carries. A big selection is the point. */
export const STOCK_COUNT = { weapon: 8, armor: 8, other: 6 };

/**
 * How a guard fights. Deliberately not a bestiary entry: a guard is scaled off the PLAYER's level so
 * it is always a match for whatever is out here, and it is not something you can kill or loot.
 */
const GUARD = { hp: 260, dmg: [14, 22], armor: 22, speed: 5.2, reach: 3, attackEvery: 1.2, perLevel: 1.17 };

// ------------------------------------------------------------------ R27 M4: gates that open and shut

/**
 * The `gates` block of data/balance.json, with the numbers it falls back to. `siegeReach` is metres
 * from a town's WALL: js/sites.js puts a siege camp within 700 m of a keep-clear gap that is itself
 * 500-650 m outside a walled town's wall, so 1400 m covers every camp it places "near a settlement".
 */
export const GATE_DEFAULTS = { knockFee: 25, knockSeconds: 60, siegeReach: 1400, greetRange: 9 };

/** The salute a friendly guard gives, if the Chibi 2 emote list has one (it does — round 25). */
const SALUTE = CHIBI2_EMOTE_ANIMS.includes('salute') ? 'salute' : null;
const SALUTE_SECONDS = 1.6;

/**
 * WHICH TOWNS A STANDING SIEGE CAMP IS BESIEGING: `Map(town id -> { camp, gap })`.
 *
 * A camp besieges the ONE town nearest it (measured to that town's real wall, `townExtent`), and
 * only while it is within `reach` of it and not taken (js/sites.js `taken`, M1). This is what makes
 * data/strongholds.json's siege blurb — "a town a mile off that has stopped opening its gate" — true.
 */
export function besiegedTowns(towns = [], camps = [], reach = GATE_DEFAULTS.siegeReach) {
  const out = new Map();
  for (const c of camps || []) {
    if (!c || c.type !== 'siege_camp' || c.taken) continue;
    let best = null, gap = Infinity;
    for (const t of towns) {
      const d = Math.hypot(t.wx - c.x, t.wz - c.z) - townExtent(t).wall;
      if (d < gap) { gap = d; best = t; }
    }
    if (best && gap <= reach && !out.has(best.id)) out.set(best.id, { camp: c, gap: Math.max(0, gap) });
  }
  return out;
}

/**
 * IS THIS TOWN'S GATE SHUT, AND WHY. Derived every time from the world — never saved.
 *
 *   siege    a standing siege camp is besieging it (`besiegedTowns`)
 *   band     your standing with whoever holds the zone (data/factions.json band key)
 *   exempt   the town holds your respawn point or an active quest giver: NEVER shut (a softlock)
 *   knocked  a guard opened it for you in the last `knockSeconds` — which a Hunted player never gets
 */
export function gateVerdict({ siege = null, band = null, exempt = false, knocked = false } = {}) {
  const hunted = band === 'hunted';
  const reason = hunted ? 'hunted' : siege ? 'siege' : null;
  const opened = !!knocked && !hunted;
  return { shut: !!reason && !exempt && !opened, reason, hunted, siege: !!siege, exempt: !!reason && !!exempt, knocked: opened };
}

/**
 * DOES A GATE GUARD GO FOR THE PLAYER? Only when the player is Hunted, only OUTSIDE the wall line,
 * and only within the guard's own reach of the post. Inside the wall a Hunted player is left alone:
 * a town that holds your respawn point must never become a place you die again the moment you wake.
 */
export function guardTargetsPlayer({ hunted = false, player, centre, wallR, home, reach = 42 }) {
  if (!hunted || !player) return false;
  if (Math.hypot(player.x - centre[0], player.z - centre[1]) <= wallR) return false;
  return Math.hypot(player.x - home[0], player.z - home[1]) < reach;
}

/** What a knock at a shut gate gets you: `{ ok, fee, why }`. Known or better is free. */
export function knockOutcome(band, gold = 0, fee = GATE_DEFAULTS.knockFee) {
  if (band === 'hunted') return { ok: false, fee: 0, why: 'hunted' };
  if (band === 'disliked') return gold >= fee ? { ok: true, fee, why: null } : { ok: false, fee, why: 'gold' };
  return { ok: true, fee: 0, why: null };
}

/**
 * WHERE A WATCHPOST'S GUARD STANDS: at its door, a step out onto the street it faces (+Z of the
 * building is the street side — see features.js `placePart`). Barracks guards stay inside.
 */
export function watchPosts(records = []) {
  return records.filter(r => r.key === 'watchpost').map((r, i) => ({
    post: i, facing: r.yaw, of: r,
    x: r.x + Math.sin(r.yaw) * (r.r + 0.9), z: r.z + Math.cos(r.yaw) * (r.r + 0.9),
  }));
}

export function createTownFolk(scene, terrain, opts = {}) {
  const {
    features, rpg, namegen = null, looks = [], seed = 1, radius = 900, balance = {},
    // R14: the zone band at a point, so a village crier cannot send a level-3 player to a level-30
    // town. Optional — left out, quests are picked exactly as they were. See js/quests.js.
    zoneAt = null,
    /**
     * R18 — how much harder the guards hit while you are standing with them, as a MULTIPLIER, read
     * live. Injected as a function so this module goes on knowing nothing about affixes; left out,
     * guards hit exactly as they always did. See `cond_guardBond` in js/effects.js.
     */
    guardPower = null,
  } = opts;
  const cfg = balance.town || {};
  // every merchant carries a light, a mount and a quiver whatever else it sells
  const gearShop = createGearShop({ rpg });
  const talkRange = cfg.talkRange ?? 3.6;
  /** How far from the middle of a settlement a guard will go, and how far the watch reaches. */
  const guardReach = cfg.guardReach ?? 42;

  const live = new Map();          // settlement id -> [npc]
  // R27 M2: which towns have finished populating, and which have had their gate guards posted
  const ready = new Set();
  const posted = new Set();
  const watched = new Set();       // R27 M4: …and which have had their watchposts manned
  let pending = 0;

  // R27 M4 — the gate state, re-derived twice a second; none of it is saved
  const gcfg = { ...GATE_DEFAULTS, ...(balance.gates || {}) };
  const verdicts = new Map();      // town id -> gateVerdict + { town, band, faction, gap, why }
  const knocks = new Map();        // town id -> gate clock second a knock's opening runs out
  const greeted = new Map();       // `${town}:${gate}` -> the guard who spoke
  let gateClock = 0, gateTick = 0;

  /** The roles a settlement of this size gets, deterministic from its id. */
  function rosterFor(node) {
    const rng = makeRng((seed ^ (node.id * 2654435761)) >>> 0);
    const size = Math.max(1, Math.min(5, node.size || 1));
    const allowed = ROLES.filter(r => (r.minSize ?? 1) <= size);
    /**
     * R20 — the Unbinder is GUARANTEED, and the headcount grows by one to carry them.
     *
     * The loop below fills up to `want` by walking ROLES in declaration order and stops the moment
     * it is full, so a role added at the END of the list only ever appears in the biggest
     * settlements. Counted out: a size-2 town filled up on the guard and the broker, and a size-3
     * one on the smith, the innkeeper, the guard and the gambler — so an Unbinder declared last
     * would have existed only in size 4 and 5, and a player who could not find one would
     * reasonably conclude the feature was not in the game. Since unbinding is the ONLY way a spell,
     * a perk or a talent comes back now, it is placed with the merchant and the elder, before
     * anything can compete for the space, and `want` goes up by one so nobody is pushed out to
     * make room.
     */
    const hasUnbinder = size >= (ROLES.find(r => r.key === 'unbinder')?.minSize ?? 2);
    const want = Math.max(3, (HEADCOUNT[size] || 3) + (hasUnbinder ? 1 : 0));
    const roster = [];
    // A trader and somebody with work, always. "Every town should have at least two NPCs to talk
    // to, one as a shop" — so those two are placed before anything competes for the space.
    roster.push(ROLES.find(r => r.key === 'merchant'));
    roster.push(ROLES.find(r => r.key === 'elder'));
    if (hasUnbinder) roster.push(ROLES.find(r => r.key === 'unbinder'));
    // then one of each other special role that fits, then villagers to fill
    for (const role of allowed) {
      if (role.key === 'villager') continue;
      if (roster.some(r => r.key === role.key)) continue;
      if (roster.length >= want) break;
      roster.push(role);
    }
    // A settlement of any size keeps a watch, and a big one keeps more of it. Being jumped by a
    // pack while standing in a market square was the complaint that produced all of this.
    const guardRole = ROLES.find(r => r.key === 'guard');
    const wantGuards = Math.max(1, Math.min(4, size - 1));
    while (roster.filter(r => r.key === 'guard').length < wantGuards) roster.push(guardRole);
    while (roster.length < want) roster.push(ROLES.find(r => r.key === 'villager'));
    return { roster, rng, size };
  }

  /**
   * R24 — WHO LIVES HERE. A settlement carries its Name Forge race (human, elf, dwarf, halfling,
   * gnome, giant, troll, orc, goblin, dragon, undead, fey) and Chibi 2 now has race BODIES
   * (avatar-3d/js/chibi2-races.js), so an elf town is mostly elves and a dwarf hold mostly dwarves.
   * A quarter of the people anywhere are human travellers, and the skin comes from the race's own
   * palette so an orc is not wearing a human's complexion. Human towns keep the look as it was.
   */
  const CHIBI2_RACE_OF = { human: 'human', elf: 'elf', fey: 'elf', dwarf: 'dwarf', gnome: 'halfling', halfling: 'halfling', giant: 'giant', troll: 'orc', orc: 'orc', goblin: 'goblin', undead: 'undead', dragon: 'beast' };
  function peopleOf(node, rng) {
    const race = CHIBI2_RACE_OF[node.race] || 'human';
    if (race === 'human' || rng() < 0.25) return null;
    const r = CHIBI2_RACES[race];
    return { race, skin: r.skin[Math.floor(rng() * r.skin.length)], round: r.ranges.round[0] + rng() * (r.ranges.round[1] - r.ranges.round[0]) };
  }

  function nameFor(node, role, rng) {
    const gender = rng() < 0.5 ? 'f' : 'm';
    if (namegen) {
      try {
        const r = namegen.generate('person.full', {
          race: node.race || 'human', gender, seed: Math.floor(rng() * 1e9),
        });
        if (r?.text) return { name: r.text, gender };
      } catch { /* fall through */ }
    }
    return { name: `${role.name} of ${node.name}`, gender };
  }

  /** Build the people of one settlement. */
  async function populate(node) {
    if (live.has(node.id)) return;
    live.set(node.id, []);                       // claim it before awaiting, so it is built once
    const { roster, rng, size } = rosterFor(node);
    const people = [];
    for (let i = 0; i < roster.length; i++) {
      const role = roster[i];
      const { name, gender } = nameFor(node, role, rng);
      /**
       * Stand them in a ring inside the settlement, off the road and out of the water — and KEEP
       * TRYING until there is somewhere to stand.
       *
       * This used to place one spot and `continue` if it was wet. World Forge founds towns on
       * rivers and coasts, so a good half of the ring is water, and a settlement could come out with
       * one person in it or none at all. Every dry ring around the centre is tried, working inward.
       */
      let x = null, z = null;
      for (let attempt = 0; attempt < 40 && x === null; attempt++) {
        const a = (i / roster.length) * Math.PI * 2 + rng() * 0.4 + attempt * 0.72;
        // spiral OUTWARD. World Forge founds towns on rivers, and a river's valley reaches about
        // 40 m either side of the line — so searching inward from the ring walks straight into the
        // water. The buildings are placed beside the channel for the same reason; the people have
        // to be too, or a riverside town comes out with nobody in it.
        const r = (8 + rng() * (10 + size * 4)) + attempt * 3.5;
        const px = node.wx + Math.cos(a) * r, pz = node.wz + Math.sin(a) * r;
        if (terrain.waterAt(px, pz) || terrain.riverAt(px, pz) > 0.3) continue;
        if (terrain.slopeAt(px, pz, 4) > 0.7) continue;
        x = px; z = pz;
      }
      if (x === null) continue;                  // this settlement really is built on a lake

      const look = looks.length ? looks[Math.floor(rng() * looks.length)] : null;
      const body = peopleOf(node, rng);
      pending++;
      let actor = null;
      try {
        const avatar = look ? JSON.parse(JSON.stringify(look)) : {};
        // R24 — the town's people are the town's race (a Chibi 2 body race; see peopleOf)
        if (body) avatar.body = { ...(avatar.body || {}), ...body };
        actor = await makeActor({ avatar });
      } catch { /* a body we cannot build is a person we skip */ }
      finally { pending--; }
      if (!actor) continue;

      const npc = {
        id: `${node.id}:${i}`,
        name, role: role.key, roleName: role.name, gender,
        guards: !!role.guards, guardTimer: 0, target: null,
        greeting: role.greeting,
        trades: !!role.trades, givesQuests: !!role.quests, gambles: !!role.gambles, brokers: !!role.brokers,
        // R20 — the one counter where a spell, a perk or a talent can be taken back off you
        retrains: !!role.retrains,
        node, x, z, y: groundAt(terrain, x, z),
        facing: rng() * Math.PI * 2,
        home: [x, z],
        wanderTimer: rng() * 4,
        actor,
        stock: null,
        offered: null,
      };
      // a badge over the head, so you can see from across the square who is worth walking up to
      const badge = badgeFor(role);
      if (badge) {
        npc.badge = badge.kind;
        const sprite = badgeSprite(badge.glyph, badge.color);
        // sit it above the head — a Chibi 2 body is about 1.8 m
        sprite.position.y = 2.4;
        actor.group.add(sprite);
        npc.badgeSprite = sprite;
      }
      actor.group.position.set(x, npc.y, z);
      actor.group.rotation.y = npc.facing;
      scene.add(actor.group);
      setActorAnim(actor, 'idle');
      people.push(npc);
    }

    /**
     * ROUND 23 — A GUARD AT EACH SIDE OF EVERY GATE.
     *
     * *"Let's make them open instead and have a guard by each entrance."* The posts come from the
     * gates js/features.js actually built (`gatesOf`), through `sentryPosts` in js/town-plan.js, so
     * a guard stands at the gate you can see. They are ordinary guards — they fight what comes near,
     * using the same code as the watch in the square — with a `post`: when there is nothing to fight
     * they walk back to it and stand facing out along the road instead of wandering off.
     */
    // R27 M2: the gate guards are their own step now, so a town populated before its wall was
    // built can have them posted later (see `postGateGuards` and the retry in `update`)
    await postGateGuards(node, rng, people);
    await postWatch(node, rng, people);          // R27 M4
    live.set(node.id, people);
    ready.add(node.id);
  }

  /**
   * R27 M4 — A GUARD AT EVERY WATCHPOST. The first reader of `BUILDING_INFO.role === 'guard'`:
   * features.js files each built building that has a role (`postsOf`), and a watchpost gets a body
   * at its door facing the street. A barracks has the same role and keeps its guards inside.
   */
  async function postWatch(node, rng, people) {
    const records = features.postsOf?.(node.id) || [];
    if (!records.length) return false;
    watched.add(node.id);
    const guardRole = ROLES.find(r => r.key === 'guard');
    for (const spot of watchPosts(records)) {
      if (!live.has(node.id)) return true;
      if (terrain.waterAt(spot.x, spot.z) || terrain.riverAt?.(spot.x, spot.z) > 0.3) continue;
      const { name, gender } = nameFor(node, guardRole, rng);
      const look = looks.length ? looks[Math.floor(rng() * looks.length)] : null;
      const body = peopleOf(node, rng);
      pending++;
      let actor = null;
      try {
        const avatar = look ? JSON.parse(JSON.stringify(look)) : {};
        if (body) avatar.body = { ...(avatar.body || {}), ...body };
        actor = await makeActor({ avatar });
      } catch { /* a body we cannot build is a guard we skip */ }
      finally { pending--; }
      if (!actor) continue;
      const npc = {
        id: `${node.id}:watch${spot.post}`,
        name, role: 'guard', roleName: 'Watch Guard', gender,
        guards: true, guardTimer: 0, target: null,
        greeting: guardRole.greeting,
        trades: false, givesQuests: false, gambles: false, brokers: false, retrains: false,
        node, x: spot.x, z: spot.z, y: groundAt(terrain, spot.x, spot.z),
        facing: spot.facing, home: [spot.x, spot.z],
        post: { facing: spot.facing, watch: spot.post },
        wanderTimer: 0, actor, stock: null, offered: null,
      };
      actor.group.position.set(npc.x, npc.y, npc.z);
      actor.group.rotation.y = npc.facing;
      scene.add(actor.group);
      setActorAnim(actor, 'idle');
      people.push(npc);
    }
    return true;
  }

  /**
   * R27 M4 — WORK OUT EVERY WALLED TOWN'S GATE, AND SWING ITS DOORS TO MATCH. `gates` is what
   * main.js knows and this module does not: the stronghold list, your standing where a town stands,
   * where you respawn and who has given you work. Says so in the log when a town near you changes.
   */
  function refreshGates(player, gates, onLog) {
    const towns = features.settlements;
    const siege = besiegedTowns(towns, gates.camps || [], gcfg.siegeReach);
    // never shut: the town you wake in, and any town whose people have given you work
    const keep = new Map();
    const spawn = gates.spawn;
    if (spawn) {
      for (const t of towns) {
        if (Math.hypot(t.wx - spawn.x, t.wz - spawn.z) <= townExtent(t).wall + 10) { keep.set(t.id, 'you wake here when you fall'); break; }
      }
    }
    for (const g of gates.givers || []) {
      const id = Number(String(g ?? '').split(':')[0]);
      if (Number.isFinite(id) && !keep.has(id)) keep.set(id, 'someone here has work for you');
    }
    for (const t of towns) {
      if (!features.gatesOf?.(t.id)?.length) { verdicts.delete(t.id); continue; }
      const who = gates.standingAt?.(t) || null;
      const s = siege.get(t.id) || null;
      const v = gateVerdict({ siege: s, band: who?.band || null, exempt: keep.has(t.id), knocked: (knocks.get(t.id) || 0) > gateClock });
      Object.assign(v, { town: t, band: who?.band || null, faction: who?.faction || null, gap: s?.gap ?? null, why: keep.get(t.id) || null });
      const was = verdicts.get(t.id);
      verdicts.set(t.id, v);
      features.setGateShut?.(t.id, v.shut);
      // the log, once per change, for a town close enough to matter
      const state = `${v.shut}|${v.reason}|${v.exempt}`;
      if (!onLog || state === was?.state || Math.hypot(t.wx - player.x, t.wz - player.z) > 900) { v.state = state; continue; }
      v.state = state;
      const who2 = v.faction?.short || 'the holders';
      if (v.shut && v.reason === 'siege') onLog(`${t.name} has shut its gates: a siege camp stands ${Math.round(v.gap)} m from the wall.`, 'bad');
      else if (v.shut && v.reason === 'hunted') onLog(`${t.name} has barred its gate to you: ${who2} want you dead.`, 'bad');
      else if (v.exempt && v.reason === 'siege') onLog(`A siege camp stands ${Math.round(v.gap)} m from ${t.name}. The gate stays open for you: ${v.why}.`, '');
      else if (v.exempt && v.reason === 'hunted') onLog(`${t.name} will not bar its gate to you: ${v.why}. Its guards will still come for you outside the wall.`, 'bad');
      else if (was?.shut && !v.shut && !v.knocked) onLog(`${t.name} opens its gates.`, 'good');
    }
  }

  /** R27 M4 — the gate guard who greets you, once per approach, and the salute for a friend. */
  function greetAtGate(npc, dist, gates, onLog) {
    const key = `${npc.node.id}:${npc.post.gate}`;
    if (greeted.get(key) === npc && dist > gcfg.greetRange * 3) { greeted.delete(key); return; }
    if (dist > gcfg.greetRange || greeted.has(key)) return;
    greeted.set(key, npc);
    const v = verdicts.get(npc.node.id);
    const text = gateLine(v?.band || null, v?.faction || null);
    onLog?.(`${npc.name}: "${text}"`, v?.hunted ? 'bad' : '');
    gates.say?.(npc, text);
    // Trusted and Sworn get a salute from both guards at an open gate — ONE clip, never a per-frame
    // restart (round 25's clip rule); the post branch leaves the body alone until it has played
    if (SALUTE && !v?.shut && (v?.band === 'trusted' || v?.band === 'sworn')) {
      for (const other of [...live.values()].flat()) {
        if (other.node !== npc.node || other.post?.gate !== npc.post.gate || other.saluteLeft > 0) continue;
        other.saluteLeft = SALUTE_SECONDS;
        other.facing = Math.atan2(gates.player?.x - other.x || 0, gates.player?.z - other.z || 1);
        setActorAnim(other.actor, SALUTE);
      }
    }
  }

  /**
   * R27 M2 — STAND A GUARD EITHER SIDE OF EVERY GATE THE TOWN HAS RIGHT NOW.
   *
   * `populate` used to read `features.gatesOf` once, inline. Features build out to 2600 m and folk
   * populate at 900 m, so in ordinary travel the wall already exists — but on the first frame, or
   * after a teleport, a town could be peopled before its wall was filed, read an empty list, and
   * stand no gate guard for as long as it stayed loaded. Returns false when there were no gates to
   * post at yet, and `update` asks again until there are.
   *
   * A gate standing in a river gets no guards (`wet`), and neither does a post that lands in water:
   * a guard up to his neck beside a gate nobody can walk through is not guarding anything.
   */
  async function postGateGuards(node, rng, people) {
    const gates = features.gatesOf?.(node.id) || [];
    if (!gates.length) return false;
    posted.add(node.id);
    const posts = sentryPosts(gates)
      .filter(p => !gates[p.gate]?.wet && !terrain.waterAt(p.x, p.z) && !(terrain.riverAt?.(p.x, p.z) > 0.3));
    const guardRole = ROLES.find(r => r.key === 'guard');
    for (const [k, post] of posts.entries()) {
      if (!live.has(node.id)) return true;         // the town was let go while we were building
      const { name, gender } = nameFor(node, guardRole, rng);
      const look = looks.length ? looks[Math.floor(rng() * looks.length)] : null;
      const body = peopleOf(node, rng);
      pending++;
      let actor = null;
      try {
        const avatar = look ? JSON.parse(JSON.stringify(look)) : {};
        // R24 — the town's people are the town's race (a Chibi 2 body race; see peopleOf)
        if (body) avatar.body = { ...(avatar.body || {}), ...body };
        actor = await makeActor({ avatar });
      } catch { /* a body we cannot build is a guard we skip */ }
      finally { pending--; }
      if (!actor) continue;
      const npc = {
        id: `${node.id}:gate${k}`,
        name, role: 'guard', roleName: 'Gate Guard', gender,
        guards: true, guardTimer: 0, target: null,
        greeting: guardRole.greeting,
        trades: false, givesQuests: false, gambles: false, brokers: false, retrains: false,
        node, x: post.x, z: post.z, y: groundAt(terrain, post.x, post.z),
        facing: post.facing,
        home: [post.x, post.z],
        post: { facing: post.facing, gate: post.gate, side: post.side },
        wanderTimer: 0,
        actor, stock: null, offered: null,
      };
      actor.group.position.set(npc.x, npc.y, npc.z);
      actor.group.rotation.y = npc.facing;
      scene.add(actor.group);
      setActorAnim(actor, 'idle');
      people.push(npc);
    }
    return true;
  }

  /**
   * ONE PERSON, ANYWHERE — a freed prisoner, a survivor, a migrant who moved in.
   *
   * `populate` builds a settlement's whole roster around a node. This is the same body-and-badge
   * work for a single person standing at coordinates, so somebody let out of a cell is a figure you
   * can walk up to and talk to rather than a number in a log line. They are filed under a group id
   * of the caller's choosing so `depopulate` can take them away with everything else on that world.
   *
   *   const who = await spawnOne({ groupId: 'freed', role: 'wanderer', x, z, name });
   */
  async function spawnOne({
    groupId = 'loose', role = 'wanderer', roleName = null, name = null, gender = null,
    x = 0, z = 0, greeting = null, node = null, seed = 1,
  } = {}) {
    // one stable rng per person, from where they are standing, so a reload does not reshuffle them
    const rng = makeRng(((seed ^ Math.round(x) * 2654435761 ^ Math.round(z) * 40503) >>> 0) || 1);
    const roleRow = ROLES.find(r => r.key === role) || ROLES[0];
    const chosen = name ? { name, gender: gender || (rng() < 0.5 ? 'f' : 'm') } : nameFor(node || { id: 0 }, roleRow, rng);
    const look = looks.length ? looks[Math.floor(rng() * looks.length)] : null;
    let actor = null;
    pending++;
    try {
      actor = await makeActor({ avatar: look ? JSON.parse(JSON.stringify(look)) : {} });
    } catch { /* a body we cannot build is a person we skip */ }
    finally { pending--; }
    if (!actor) return null;

    const npc = {
      id: `${groupId}:${live.get(groupId)?.length || 0}`,
      name: chosen.name, role: roleRow.key, roleName: roleName || roleRow.name, gender: chosen.gender,
      guards: false, guardTimer: 0, target: null,
      greeting: greeting || roleRow.greeting,
      trades: false, givesQuests: false, gambles: false, brokers: false, retrains: false,
      node: node || null, x, z, y: groundAt(terrain, x, z),
      facing: rng() * Math.PI * 2,
      home: [x, z],
      wanderTimer: rng() * 4,
      actor, stock: null, offered: null,
      freed: true,
    };
    actor.group.position.set(x, npc.y, z);
    actor.group.rotation.y = npc.facing;
    scene.add(actor.group);
    setActorAnim(actor, 'idle');
    if (!live.has(groupId)) live.set(groupId, []);
    live.get(groupId).push(npc);
    return npc;
  }

  function depopulate(id) {
    const people = live.get(id);
    posted.delete(id); ready.delete(id);           // R27 M2
    watched.delete(id);                            // R27 M4
    if (!people) return;
    for (const npc of people) {
      scene.remove(npc.actor.group);
      npc.actor.dispose?.();
    }
    live.delete(id);
  }

  /**
   * Stock is rolled once per merchant, from what a player of this level would use.
   *
   * Each item carries the category it was stocked under so the shop panel can filter, and a
   * merchant keeps a **buyback** list: "when you sell an item to the shop, the item becomes
   * available from the for sale menu again; until the shop refreshes later". Selling a thing you
   * meant to keep should cost you the margin, not the item.
   */
  function stockFor(npc, level) {
    if (npc.stock) return npc.stock;
    const rng = makeRng((seed ^ npc.id.split(':').reduce((a, c) => a + c.charCodeAt(0), 0) * 2654435761) >>> 0);
    const table = STOCK_BY_ROLE[npc.role] || STOCK_BY_ROLE.merchant;
    const items = [];
    for (const category of SHOP_CATEGORIES) {
      const bases = table[category] || [];
      if (!bases.length) continue;
      for (let i = 0; i < (STOCK_COUNT[category] || 6); i++) {
        const rarity = rng() < 0.1 ? 'rare' : rng() < 0.42 ? 'magic' : 'normal';
        // a shop's gear is levelled to whoever walked in, so the selection is always worth a look
        /**
         * Straight out of the generator, and then ATTUNED.
         *
         * A shop rolled its stock with `rpg.loot.generate` and nothing else, while every drop,
         * chest and crate went through `attuneWeapon` — so a wand bought over a counter had no
         * element, no `ranged` flag and, once the card started printing them, no headline either.
         * A weapon you paid for should say the same things as one you found.
         */
        const item = attuneWeapon(rpg.loot.generate(rng.pick(bases), rarity, rpg.qualityFor(level), { rng, level }));
        if (item) { item.shopCategory = category; items.push(item); }
      }
    }
    // the mounts, lights and quivers every shop carries, whatever else it sells
    for (const extra of gearShop.stockFor(npc, level, rng)) { extra.shopCategory = 'other'; items.push(extra); }
    npc.stock = items;
    npc.buyback = npc.buyback || [];
    return items;
  }

  /** The job this person is offering, made once and kept until it is taken. */
  function questFrom(npc, { level, enemies, nodes }) {
    if (!npc.givesQuests) return null;
    if (npc.offered) return npc.offered;
    const rng = makeRng((seed ^ npc.id.length * 7919 ^ npc.node.id * 104729) >>> 0);
    const kinds = ['hunt', 'visit', 'gather', 'clear'];
    for (let tries = 0; tries < 6; tries++) {
      const q = makeQuest(rng.pick(kinds), {
        rng, level, giver: npc, enemies, nodes, terrain, from: npc.node,
        // R14: where the giver is standing, so "near" can mean near. `npc.node` is a map node in
        // CELLS; `at` wants world metres, which is what the quest's own `place` is measured in.
        at: { x: (npc.node?.x ?? 0) * M_PER_CELL, z: (npc.node?.y ?? 0) * M_PER_CELL },
        wrapM: terrain?.widthM || 0,
        zoneAt,
      });
      if (q) { npc.offered = q; return q; }
    }
    return null;
  }

  return {
    live, ROLES,
    /**
     * R20 — who a settlement of a given size WOULD get, without building any of them.
     *
     * Exposed because the roster is the one part of this module with a silent priority: `rosterFor`
     * fills up to a headcount by walking ROLES in declaration order and stops the moment it is
     * full, so a role added at the end of that list quietly only ever appears in the biggest
     * settlements. Asking this directly covers a hundred towns in a millisecond, where walking to
     * them would take an hour — see tests/round20-unbinder.spec.js.
     */
    rosterFor,

    /** Keep the people near the player, and let them shuffle about. */
    update(dt, player, { field = null, level = 1, onLog = null, gates = null } = {}) {
      // bring settlements in range to life, and let the far ones go
      for (const s of features.settlements) {
        const d = Math.hypot(s.wx - player.x, s.wz - player.z);
        if (d < radius && !live.has(s.id)) populate(s);
        else if (d > radius * 1.6 && live.has(s.id)) depopulate(s.id);
        // R27 M2 — a walled town peopled before its gates were filed: post them the moment they are
        else if (ready.has(s.id) && !posted.has(s.id) && townExtent(s).walled && features.gatesOf?.(s.id)?.length) {
          posted.add(s.id);
          postGateGuards(s, rosterFor(s).rng, live.get(s.id));
        }
        // R27 M4 — …and the same for a town's watchposts
        else if (ready.has(s.id) && !watched.has(s.id) && features.postsOf?.(s.id)?.some(r => r.key === 'watchpost')) {
          postWatch(s, rosterFor(s).rng, live.get(s.id));
        }
      }
      // R27 M4 — the gates: re-derived twice a second, and the doors swung every frame
      gateClock += dt;
      if (gates) {
        gates.player = player;
        gateTick -= dt;
        if (gateTick <= 0) { gateTick = 0.5; refreshGates(player, gates, onLog); }
      }
      features.tickGates?.(dt);

      for (const people of live.values()) {
        for (const npc of people) {
          const dx = player.x - npc.x, dz = player.z - npc.z;
          const dist = Math.hypot(dx, dz);

          /**
           * R27 M4 — A GATE GUARD NOTICES YOU. A line by your standing as you walk up, and — when
           * the town hunts you — the guards come for you, but only OUTSIDE the wall line.
           */
          if (gates && npc.post?.gate != null) {
            const v = verdicts.get(npc.node.id);
            const ring = features.wallOf?.(npc.node.id);
            npc.huntingPlayer = guardTargetsPlayer({
              hunted: !!v?.hunted, player,
              centre: ring ? [ring.cx, ring.cz] : [npc.node.wx, npc.node.wz],
              wallR: ring?.r ?? townExtent(npc.node).wall, home: npc.home, reach: guardReach,
            });
            if (!npc.huntingPlayer) greetAtGate(npc, dist, gates, onLog);
            else {
              if (npc.guardTimer > 0) npc.guardTimer -= dt;
              npc.target = null;
              npc.facing = Math.atan2(dx, dz);
              if (dist > GUARD.reach) {
                const step = GUARD.speed * dt;
                const nx = npc.x + Math.sin(npc.facing) * step, nz = npc.z + Math.cos(npc.facing) * step;
                if (Math.hypot(nx - npc.home[0], nz - npc.home[1]) < guardReach && !wetAt(terrain, nx, nz, npc.y, { test: 'waterAt' })) {
                  npc.x = nx; npc.z = nz;
                }
                setActorAnim(npc.actor, 'run');
              } else if (npc.guardTimer <= 0) {
                npc.guardTimer = GUARD.attackEvery;
                setActorAnim(npc.actor, 'attack');
                const scale = Math.pow(GUARD.perLevel, Math.max(0, level - 1));
                const hit = Math.round((GUARD.dmg[0] + Math.random() * (GUARD.dmg[1] - GUARD.dmg[0])) * scale);
                gates.hurt?.(npc, hit);
              }
              npc.y = groundAt(terrain, npc.x, npc.z, npc.y);
              npc.actor.group.position.set(npc.x, npc.y, npc.z);
              npc.actor.group.rotation.y = npc.facing;
              npc.actor.update(dt);
              continue;
            }
          }

          // ---- a guard does a guard's job
          if (npc.guards && field) {
            if (npc.guardTimer > 0) npc.guardTimer -= dt;
            if (!npc.target || npc.target.dying != null
                || Math.hypot(npc.target.x - npc.home[0], npc.target.z - npc.home[1]) > guardReach * 1.5) {
              npc.target = null;
              let best = null, bestD = guardReach;
              for (const e of field.enemies) {
                if (e.dying != null) continue;
                const d = Math.hypot(e.x - npc.home[0], e.z - npc.home[1]);
                if (d < bestD) { bestD = d; best = e; }
              }
              npc.target = best;
            }
            if (npc.target) {
              const tx = npc.target.x - npc.x, tz = npc.target.z - npc.z;
              const toTarget = Math.hypot(tx, tz);
              npc.facing = Math.atan2(tx, tz);
              if (toTarget > GUARD.reach) {
                // never leave the settlement to chase — a guard that runs off is not a guard
                const step = GUARD.speed * dt;
                const nx = npc.x + Math.sin(npc.facing) * step, nz = npc.z + Math.cos(npc.facing) * step;
                if (Math.hypot(nx - npc.home[0], nz - npc.home[1]) < guardReach && !wetAt(terrain, nx, nz, npc.y, { test: 'waterAt' })) {
                  npc.x = nx; npc.z = nz;
                }
                setActorAnim(npc.actor, 'run');
              } else if (npc.guardTimer <= 0) {
                npc.guardTimer = GUARD.attackEvery;
                setActorAnim(npc.actor, 'attack');
                const scale = Math.pow(GUARD.perLevel, Math.max(0, level - 1));
                /**
                 * R18 — `cond_guardBond`'s `guardPower` hook had no reader.
                 *
                 * "Town guards deal N% more damage while you are with them" is a 700-gold-class
                 * property on the Covenant Hammer, and `guardPower` was defined in the registry and
                 * asked by nobody, so the affix did nothing at all. This is the only place a guard
                 * deals damage, so this is where it belongs. `guardPower` is injected as a function
                 * rather than read off the player here, so js/town.js keeps knowing nothing about
                 * affixes.
                 */
                const bond = guardPower ? (guardPower() || 1) : 1;
                const hit = Math.round((GUARD.dmg[0] + Math.random() * (GUARD.dmg[1] - GUARD.dmg[0])) * scale * bond);
                npc.target.hp = Math.max(0, npc.target.hp - hit);
                npc.target.hitFlash = 0.18;
                if (npc.target.state !== 'chase') npc.target.state = 'chase';
                if (npc.target.hp <= 0) {
                  onLog?.(`${npc.name} cuts down ${npc.target.name}.`, 'good');
                  field.kill(npc.target);
                  npc.target = null;
                }
              }
              npc.y = groundAt(terrain, npc.x, npc.z, npc.y);
              npc.actor.group.position.set(npc.x, npc.y, npc.z);
              npc.actor.group.rotation.y = npc.facing;
              npc.actor.update(dt);
              continue;
            }
            // nothing to do: drift back to the post
            if (Math.hypot(npc.x - npc.home[0], npc.z - npc.home[1]) > 1.5) {
              npc.facing = Math.atan2(npc.home[0] - npc.x, npc.home[1] - npc.z);
              npc.x += Math.sin(npc.facing) * 2.2 * dt;
              npc.z += Math.cos(npc.facing) * 2.2 * dt;
              npc.y = groundAt(terrain, npc.x, npc.z, npc.y);
              npc.actor.group.position.set(npc.x, npc.y, npc.z);
              npc.actor.group.rotation.y = npc.facing;
              setActorAnim(npc.actor, 'walk');
              npc.actor.update(dt);
              continue;
            }
          }

          /**
           * R23 — a gate guard holds the gate. At the post (the guard block above has already
           * walked them back to it), they face out along the road; they turn to whoever walks up to
           * speak to them, and they never wander.
           */
          if (npc.post) {
            npc.facing = dist < talkRange * 2.4 ? Math.atan2(dx, dz) : npc.post.facing;
            // R27 M4 — a salute plays once through; the idle is asked for again only after it
            if (npc.saluteLeft > 0) {
              npc.saluteLeft -= dt;
              if (npc.saluteLeft <= 0) setActorAnim(npc.actor, 'idle');
            } else setActorAnim(npc.actor, 'idle');
            npc.y = groundAt(terrain, npc.x, npc.z, npc.y);
            npc.actor.group.position.set(npc.x, npc.y, npc.z);
            npc.actor.group.rotation.y = npc.facing;
            npc.actor.update(dt);
            continue;
          }

          /**
           * R16 — SOMEWHERE TO BE.
           *
           *   "NPCs should interact with the player or can be assigned tasks. Add a Command Rod
           *    that once built … allows you to select one or more NPCs and order them to a task."
           *
           * Every body in this file wandered on a 14 m leash from wherever it was spawned and had
           * no way of being sent anywhere. `npc.goal` is the one addition: while it is set, the
           * body walks to it and ignores its leash, and clears the goal on arrival. It is checked
           * BEFORE the turn-to-face branch on purpose — somebody you have just sent to the furnace
           * should walk to the furnace, not stop and look at you because you are standing nearby.
           */
          if (npc.goal) {
            const gx = npc.goal[0] - npc.x, gz = npc.goal[1] - npc.z;
            const away = Math.hypot(gx, gz);
            if (away < 1.6) {
              npc.home = [npc.goal[0], npc.goal[1]];   // and this is where they live now
              npc.goal = null;
              npc.arrivedAt = npc.goalName || null;
              setActorAnim(npc.actor, 'idle');
            } else {
              npc.facing = Math.atan2(gx, gz);
              const step = Math.min(away, (npc.goalRun ? 3.6 : 2.0) * dt);
              const nx = npc.x + Math.sin(npc.facing) * step;
              const nz = npc.z + Math.cos(npc.facing) * step;
              // water still stops them; a body that swims to the sawmill is a body in the river
              if (!wetAt(terrain, nx, nz, npc.y, { test: 'waterAt' })) { npc.x = nx; npc.z = nz; }
              else { npc.goal = null; }
              setActorAnim(npc.actor, npc.goalRun ? 'run' : 'walk');
              npc.y = groundAt(terrain, npc.x, npc.z, npc.y);
              npc.actor.group.position.set(npc.x, npc.y, npc.z);
              npc.actor.group.rotation.y = npc.facing;
              npc.actor.update(dt);
              continue;
            }
          }

          if (dist < talkRange * 2.4) {
            // turn to face whoever walks up
            npc.facing = Math.atan2(dx, dz);
            setActorAnim(npc.actor, 'idle');
          } else {
            npc.wanderTimer -= dt;
            if (npc.wanderTimer <= 0) {
              npc.wanderTimer = 3 + Math.random() * 5;
              npc.facing = Math.random() * Math.PI * 2;
              npc.strolling = Math.random() < 0.5;
            }
            if (npc.strolling) {
              const step = 1.1 * dt;
              const nx = npc.x + Math.sin(npc.facing) * step;
              const nz = npc.z + Math.cos(npc.facing) * step;
              // never wander far from home, into water, or onto the road
              if (Math.hypot(nx - npc.home[0], nz - npc.home[1]) < 14 && !wetAt(terrain, nx, nz, npc.y, { test: 'waterAt' })) {
                npc.x = nx; npc.z = nz;
              } else {
                npc.facing += Math.PI;
              }
            }
            setActorAnim(npc.actor, npc.strolling ? 'walk' : 'idle');
          }
          npc.y = groundAt(terrain, npc.x, npc.z, npc.y);
          npc.actor.group.position.set(npc.x, npc.y, npc.z);
          npc.actor.group.rotation.y = npc.facing;
          npc.actor.update(dt);
        }
      }
    },

    /**
     * The circles a settlement's watch covers. The enemy field refuses to spawn anything inside one
     * — being jumped by a pack while standing in a market square is not an encounter.
     */
    /**
     * WHERE NOTHING HOSTILE MAY SPAWN OR WANDER.
     *
     * "I still frequently get attacked while in town. Make sure the town has a safe radius around it
     * that is larger than its walls (for towns with walls)."
     *
     * It used to be a flat 57 m from the centre of every settlement — which is inside the wall ring
     * of a city (`ring + 14`, up to 93 m) and only just outside a hamlet. The radius is now measured
     * from the settlement's own footprint: its ring, its wall, and a margin beyond that, so the
     * quiet ground genuinely starts before the gate rather than somewhere in the market.
     */
    safeZones: () => features.settlements.map(s => {
      /**
       * R27 M2 — the town's REAL extent: the planner's own wall when the town has been planned
       * (it grows a crowded site's ring 1.3x or 1.65x), the unscaled footprint as a floor before.
       * This used to be `16 + size * 13` worked out here a second time, which stopped 44 m short
       * of a grown size-5 city's wall — room for a whole pack to spawn inside it.
       */
      const { wall } = townExtent(s);
      /**
       * Just outside the gate, and no further.
       *
       * The margin has to clear the walls so nothing ever appears INSIDE a settlement — but the
       * spawn ring is only 34–115 m across, so a hundred-metre margin on top of a city's own
       * 95 m wall empties the whole world around it, which is the opposite complaint ("the map is so
       * expansive but enemies are few and far between"). Anything that wanders in from further out
       * is turned around by the flee rule in js/actors.js instead.
       */
      /**
       * The name rides along so somebody can say it.
       *
       * A player who walks to the edge of town watches a pack turn round and leave and has no idea
       * why — the rule is invisible. `js/actors.js` says it out loud the first time it fires in a
       * zone ("The hounds will not come inside Pebelkeep's watch"), and the minimap draws the circle,
       * and neither can do that from a bare x/z/r.
       */
      return { x: s.wx, z: s.wz, r: Math.max(guardReach, wall + (cfg.safeMargin ?? 18)), name: s.name };
    }),

    /** Everyone worth a pip on the minimap: a stall, or somebody with work. */
    marks: () => [...live.values()].flat()
      .filter(n => n.badge)
      .map(n => ({ x: n.x, z: n.z, icon: n.badge === 'quest' ? '!' : '$', color: n.badge === 'quest' ? '#ffd24a' : '#8fe0a0', kind: n.badge })),

    /** Whoever is close enough to talk to. */
    spawnOne,
    nearest(x, z, range = talkRange) {
      let best = null, bd = range;
      for (const people of live.values()) {
        for (const npc of people) {
          if (npc.huntingPlayer) continue;           // R27 M4: a guard cutting at you is not a chat
          const d = Math.hypot(npc.x - x, npc.z - z);
          if (d < bd) { bd = d; best = npc; }
        }
      }
      return best;
    },

    stockFor, questFrom, populate, depopulate,

    /**
     * The offer a hireable person makes — see js/hire.js. Exposed on the folk object so main.js can
     * hand it to the talk panel without importing anything new.
     */
    hireOffer(who, { level = 1, gold = 0, pet = null } = {}) {
      return buildHireOffer(who, { playerLevel: level, gold, pet });
    },

    /** Everyone currently in the world, for the debug menu and the tests. */
    roster: () => [...live.values()].flat(),

    /** R27 M4 — the last gate verdict for a town (see `gateVerdict`), or null for one with no gates. */
    gateOf: id => verdicts.get(id) || null,
    /**
     * R27 M4 — a SHUT gate within `range` of a point, for E: `{ town, index, gate, verdict }`.
     * Asked from either side of the wall, so a gate that shut behind you can be knocked open again.
     */
    gateAt(x, z, range = 6) {
      let best = null, bd = range;
      for (const [id, v] of verdicts) {
        if (!v.shut) continue;
        for (const g of features.gatesOf?.(id) || []) {
          if (!g.doors) continue;
          const d = Math.hypot(g.x - x, g.z - z);
          if (d < bd) { bd = d; best = { town: v.town, index: g.index, gate: g, verdict: v }; }
        }
      }
      return best;
    },
    /** R27 M4 — the E prompt at a shut gate. */
    gatePrompt(hit) {
      const v = hit?.verdict;
      if (v?.hunted) return `<b>E</b> call up to the guard · ${hit.town.name} has barred its gate to you`;
      const fee = v?.band === 'disliked' ? ` · ${gcfg.knockFee} gold` : '';
      return `<b>E</b> ask the guard to open the gate${fee}`;
    },
    /**
     * R27 M4 — KNOCK. Known or better opens a shut gate for `knockSeconds`; Disliked pays
     * `knockFee` gold for the same; Hunted is refused. The gold comes off `player.gold` here.
     * Returns `{ ok, text, fee }`, worded for the log.
     */
    knock(hit, player) {
      const v = hit?.verdict || verdicts.get(hit?.town?.id);
      if (!v || !v.shut) return { ok: true, fee: 0, text: 'The gate is already open.' };
      const out = knockOutcome(v.band, player?.gold || 0, gcfg.knockFee);
      if (!out.ok) {
        return out.why === 'hunted'
          ? { ok: false, fee: 0, text: `The guard: "${gateLine('hunted', v.faction)}"` }
          : { ok: false, fee: out.fee, text: `The gate fee is ${out.fee} gold and you have ${player?.gold || 0}.` };
      }
      if (out.fee) player.gold -= out.fee;
      knocks.set(v.town.id, gateClock + gcfg.knockSeconds);
      v.shut = false; v.knocked = true;
      features.setGateShut?.(v.town.id, false);
      gateTick = 0;
      return {
        ok: true, fee: out.fee,
        text: out.fee ? `You pay ${out.fee} gold. The gate opens for ${gcfg.knockSeconds}s.`
          : `The guard knows you. The gate opens for ${gcfg.knockSeconds}s.`,
      };
    },
    /**
     * R27 M2 — the guard BODIES standing in one settlement right now (its watch and its gate
     * guards). The muster's defence count reads this; it used to count YOUR colony's guards, so a
     * city with a dozen men on the walls mustered as if it had none.
     */
    guardsOf: id => (live.get(id) || []).filter(n => n.guards).length,

    /**
     * R16 — YOUR OWN PEOPLE, as opposed to everybody standing in a market somewhere.
     *
     * A recruit is spawned into the `colony` group (js/main.js's `recruit:` handler), so that group
     * IS the holding's population as far as bodies are concerned. The Command Rod points at this
     * list and nothing else — ordering a stranger's blacksmith to go and chop wood would be a
     * different game.
     */
    own: () => live.get('colony') || [],
    ownById: id => (live.get('colony') || []).find(n => n.id === id) || null,
    /** Send one of your own somewhere. `run` is for an order given in a hurry. */
    sendTo(npc, x, z, { run = false, name = null } = {}) {
      if (!npc) return false;
      npc.goal = [x, z];
      npc.goalRun = !!run;
      npc.goalName = name;
      npc.arrivedAt = null;
      return true;
    },

    /**
     * Take an item off a merchant. Buying something back out of the buyback list costs what you
     * were paid for it plus the shop's margin — the merchant is not a charity, but it is not a
     * disaster either.
     */
    buy(npc, item, player, multiplier = 1) {
      const fromBuyback = (npc.buyback || []).includes(item);
      const price = Math.max(1, Math.round(rpg.price(item) * multiplier * (fromBuyback ? 1 : 1)));
      if (player.gold < price) return { ok: false, why: `That is ${price} gold and you have ${player.gold}.` };
      player.gold -= price;
      player.bag.push(item);
      npc.stock = (npc.stock || []).filter(i => i !== item);
      npc.buyback = (npc.buyback || []).filter(i => i !== item);
      return { ok: true, price, fromBuyback };
    },

    /**
     * Sell one of yours — and the merchant puts it straight back on the shelf.
     *
     * "Change it so when you sell an item to the shop, the item becomes available from the for sale
     * menu again; until the shop refreshes later." The buyback list is capped, oldest out first, so
     * a long session does not turn a village smith into a warehouse.
     */
    sell(npc, item, player) {
      const price = Math.max(1, Math.round(rpg.price(item) * (rpg.items.sellFactor ?? 0.35)));
      const i = player.bag.indexOf(item);
      if (i < 0) return { ok: false, why: 'You are not carrying that.' };
      player.bag.splice(i, 1);
      player.gold += price;
      npc.buyback = npc.buyback || [];
      item.shopCategory = item.shopCategory || categoryOf(item);
      npc.buyback.unshift(item);
      if (npc.buyback.length > (cfg.buybackSlots ?? 12)) npc.buyback.length = cfg.buybackSlots ?? 12;
      return { ok: true, price };
    },

    /** Everything a merchant will sell you right now: its own stock, then anything you sold it. */
    forSale(npc, level) {
      return [...stockFor(npc, level), ...(npc.buyback || [])];
    },

    /** What this person sells, sorted into the shop's three tabs. */
    shelves(npc, level) {
      const out = { weapon: [], armor: [], other: [], buyback: [...(npc.buyback || [])] };
      for (const item of stockFor(npc, level)) out[categoryOf(item)].push(item);
      return out;
    },

    /** The vehicles on offer — unlockables, not items, so they are their own list. */
    vehicles: () => gearShop.vehiclesFor(),

    CRATE_TIERS,

    /**
     * Buy a sealed crate and open it. One item, never less than what the tier promised, and a
     * `lift` chance of one tier better — which is the only reason to buy the expensive one.
     */
    gamble(npc, tierKey, player, { level = 1 } = {}) {
      const tier = CRATE_TIERS.find(t => t.key === tierKey);
      if (!tier) return { ok: false, why: 'No such crate.' };
      if ((player.gold || 0) < tier.price) {
        return { ok: false, why: `That crate is ${tier.price} gold and you have ${player.gold || 0}.` };
      }
      const rng = makeRng((seed ^ Date.now()) >>> 0);
      const RANKS = ['normal', 'magic', 'rare', 'legendary'];
      let floor = tier.floor;
      if (rng() < tier.lift) floor = RANKS[Math.min(RANKS.length - 1, RANKS.indexOf(floor) + 1)];
      const item = rpg.rollDrop({ level, rng, magicFind: player.derived?.magicFind || 0, chance: 1, floor });
      if (!item) return { ok: false, why: 'The crate was empty. It happens.' };
      player.gold -= tier.price;
      player.bag.push(item);
      return { ok: true, item, tier, lifted: floor !== tier.floor, price: tier.price };
    },

    stats() {
      let people = 0;
      for (const list of live.values()) people += list.length;
      return { settlements: live.size, people, pending, guards: [...live.values()].flat().filter(n => n.guards).length };
    },

    dispose() {
      for (const id of [...live.keys()]) depopulate(id);
    },
  };
}
