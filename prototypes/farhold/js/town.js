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
];

/**
 * How many people a settlement of each size holds. The first entry used to be 0, so the smallest
 * settlements on the map were built, named, and completely empty — you walked into a village and
 * there was nobody to talk to. Nowhere has fewer than three now, and a merchant is guaranteed.
 */
const HEADCOUNT = [3, 3, 4, 6, 8, 9];

/** What a merchant's stock is drawn from. */
const STOCK_BY_ROLE = {
  merchant: ['ring', 'necklace', 'cloth_helm', 'light_boots', 'light_chest', 'dagger'],
  smith: ['sword', 'longsword', 'hammer', 'medium_chest', 'medium_helm', 'heavy_gauntlets'],
};

/**
 * How a guard fights. Deliberately not a bestiary entry: a guard is scaled off the PLAYER's level so
 * it is always a match for whatever is out here, and it is not something you can kill or loot.
 */
const GUARD = { hp: 260, dmg: [14, 22], armor: 22, speed: 5.2, reach: 3, attackEvery: 1.2, perLevel: 1.17 };

export function createTownFolk(scene, terrain, opts = {}) {
  const { features, rpg, namegen = null, looks = [], seed = 1, radius = 900, balance = {} } = opts;
  const cfg = balance.town || {};
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
        trades: !!role.trades, givesQuests: !!role.quests,
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

  function depopulate(id) {
    const people = live.get(id);
    if (!people) return;
    for (const npc of people) {
      scene.remove(npc.actor.group);
      npc.actor.dispose?.();
    }
    live.delete(id);
  }

  /** Stock is rolled once per merchant, from what a player of this level would use. */
  function stockFor(npc, level) {
    if (npc.stock) return npc.stock;
    const rng = makeRng((seed ^ npc.id.split(':').reduce((a, c) => a + c.charCodeAt(0), 0) * 2654435761) >>> 0);
    const bases = STOCK_BY_ROLE[npc.role] || STOCK_BY_ROLE.merchant;
    const items = [];
    for (let i = 0; i < 6; i++) {
      const rarity = rng() < 0.12 ? 'rare' : rng() < 0.45 ? 'magic' : 'normal';
      const item = rpg.loot.generate(rng.pick(bases), rarity, rpg.qualityFor(level), { rng });
      if (item) items.push(item);
    }
    npc.stock = items;
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
    safeZones: () => features.settlements.map(s => ({ x: s.wx, z: s.wz, r: guardReach * 1.35 })),

    /** Everyone worth a pip on the minimap: a stall, or somebody with work. */
    marks: () => [...live.values()].flat()
      .filter(n => n.badge)
      .map(n => ({ x: n.x, z: n.z, icon: n.badge === 'quest' ? '!' : '$', color: n.badge === 'quest' ? '#ffd24a' : '#8fe0a0', kind: n.badge })),

    /** Whoever is close enough to talk to. */
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

    /** Take an item off a merchant. */
    buy(npc, item, player, multiplier = 1) {
      const price = Math.max(1, Math.round(rpg.price(item) * multiplier));
      if (player.gold < price) return { ok: false, why: `That is ${price} gold and you have ${player.gold}.` };
      player.gold -= price;
      player.bag.push(item);
      npc.stock = npc.stock.filter(i => i !== item);
      return { ok: true, price };
    },

    /** Sell one of yours. */
    sell(npc, item, player) {
      const price = Math.max(1, Math.round(rpg.price(item) * (rpg.items.sellFactor ?? 0.35)));
      const i = player.bag.indexOf(item);
      if (i < 0) return { ok: false, why: 'You are not carrying that.' };
      player.bag.splice(i, 1);
      player.gold += price;
      return { ok: true, price };
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
