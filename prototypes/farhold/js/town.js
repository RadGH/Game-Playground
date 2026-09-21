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

export function createTownFolk(scene, terrain, opts = {}) {
  const {
    features, rpg, namegen = null, looks = [], seed = 1, radius = 900, balance = {},
    // R14: the zone band at a point, so a village crier cannot send a level-3 player to a level-30
    // town. Optional — left out, quests are picked exactly as they were. See js/quests.js.
    zoneAt = null,
  } = opts;
  const cfg = balance.town || {};
  // every merchant carries a light, a mount and a quiver whatever else it sells
  const gearShop = createGearShop({ rpg });
  const talkRange = cfg.talkRange ?? 3.6;
  /** How far from the middle of a settlement a guard will go, and how far the watch reaches. */
  const guardReach = cfg.guardReach ?? 42;

  const live = new Map();          // settlement id -> [npc]
  let pending = 0;

  /** The roles a settlement of this size gets, deterministic from its id. */
  function rosterFor(node) {
    const rng = makeRng((seed ^ (node.id * 2654435761)) >>> 0);
    const size = Math.max(1, Math.min(5, node.size || 1));
    const allowed = ROLES.filter(r => (r.minSize ?? 1) <= size);
    const want = Math.max(3, HEADCOUNT[size] || 3);
    const roster = [];
    // A trader and somebody with work, always. "Every town should have at least two NPCs to talk
    // to, one as a shop" — so those two are placed before anything competes for the space.
    roster.push(ROLES.find(r => r.key === 'merchant'));
    roster.push(ROLES.find(r => r.key === 'elder'));
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
      pending++;
      let actor = null;
      try {
        actor = await makeActor({ avatar: look ? JSON.parse(JSON.stringify(look)) : {} });
      } catch { /* a body we cannot build is a person we skip */ }
      finally { pending--; }
      if (!actor) continue;

      const npc = {
        id: `${node.id}:${i}`,
        name, role: role.key, roleName: role.name, gender,
        guards: !!role.guards, guardTimer: 0, target: null,
        greeting: role.greeting,
        trades: !!role.trades, givesQuests: !!role.quests, gambles: !!role.gambles, brokers: !!role.brokers,
        node, x, z, y: terrain.heightAt(x, z),
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
    live.set(node.id, people);
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
      trades: false, givesQuests: false, gambles: false, brokers: false,
      node: node || null, x, z, y: terrain.heightAt(x, z),
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

    /** Keep the people near the player, and let them shuffle about. */
    update(dt, player, { field = null, level = 1, onLog = null } = {}) {
      // bring settlements in range to life, and let the far ones go
      for (const s of features.settlements) {
        const d = Math.hypot(s.wx - player.x, s.wz - player.z);
        if (d < radius && !live.has(s.id)) populate(s);
        else if (d > radius * 1.6 && live.has(s.id)) depopulate(s.id);
      }

      for (const people of live.values()) {
        for (const npc of people) {
          const dx = player.x - npc.x, dz = player.z - npc.z;
          const dist = Math.hypot(dx, dz);

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
                if (Math.hypot(nx - npc.home[0], nz - npc.home[1]) < guardReach && !terrain.waterAt(nx, nz)) {
                  npc.x = nx; npc.z = nz;
                }
                setActorAnim(npc.actor, 'run');
              } else if (npc.guardTimer <= 0) {
                npc.guardTimer = GUARD.attackEvery;
                setActorAnim(npc.actor, 'attack');
                const scale = Math.pow(GUARD.perLevel, Math.max(0, level - 1));
                const hit = Math.round((GUARD.dmg[0] + Math.random() * (GUARD.dmg[1] - GUARD.dmg[0])) * scale);
                npc.target.hp = Math.max(0, npc.target.hp - hit);
                npc.target.hitFlash = 0.18;
                if (npc.target.state !== 'chase') npc.target.state = 'chase';
                if (npc.target.hp <= 0) {
                  onLog?.(`${npc.name} cuts down ${npc.target.name}.`, 'good');
                  field.kill(npc.target);
                  npc.target = null;
                }
              }
              npc.y = terrain.heightAt(npc.x, npc.z);
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
              npc.y = terrain.heightAt(npc.x, npc.z);
              npc.actor.group.position.set(npc.x, npc.y, npc.z);
              npc.actor.group.rotation.y = npc.facing;
              setActorAnim(npc.actor, 'walk');
              npc.actor.update(dt);
              continue;
            }
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
              if (!terrain.waterAt(nx, nz)) { npc.x = nx; npc.z = nz; }
              else { npc.goal = null; }
              setActorAnim(npc.actor, npc.goalRun ? 'run' : 'walk');
              npc.y = terrain.heightAt(npc.x, npc.z);
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
              if (Math.hypot(nx - npc.home[0], nz - npc.home[1]) < 14 && !terrain.waterAt(nx, nz)) {
                npc.x = nx; npc.z = nz;
              } else {
                npc.facing += Math.PI;
              }
            }
            setActorAnim(npc.actor, npc.strolling ? 'walk' : 'idle');
          }
          npc.y = terrain.heightAt(npc.x, npc.z);
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
      const size = s.size || 1;
      const ring = 16 + size * 13;                 // the same ring buildSettlement lays out to
      const wall = size >= 4 ? ring + 14 : ring;   // …and the wall a city puts round it
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
