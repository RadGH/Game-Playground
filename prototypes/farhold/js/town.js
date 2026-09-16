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

/** Who stands in a settlement, by how big it is. */
export const ROLES = [
  { key: 'merchant', name: 'Merchant', minSize: 1, trades: true, greeting: 'Trade? I have what the road allows.' },
  { key: 'elder', name: 'Elder', minSize: 1, quests: true, greeting: 'We could use a pair of hands.' },
  { key: 'villager', name: 'Villager', minSize: 1, greeting: 'Mind the road after dark.' },
  { key: 'smith', name: 'Smith', minSize: 3, trades: true, greeting: 'Steel, if you have the coin.' },
  { key: 'innkeeper', name: 'Innkeeper', minSize: 3, quests: true, greeting: 'A bed, a fire, and trouble to spare.' },
  { key: 'guard', name: 'Guard', minSize: 4, greeting: 'Move along, or do not. It is all the same to me.' },
];

/** How many people a settlement of each size holds. */
const HEADCOUNT = [0, 3, 4, 6, 8, 9];

/** What a merchant's stock is drawn from. */
const STOCK_BY_ROLE = {
  merchant: ['ring', 'necklace', 'cloth_helm', 'light_boots', 'light_chest', 'dagger'],
  smith: ['sword', 'longsword', 'hammer', 'medium_chest', 'medium_helm', 'heavy_gauntlets'],
};

export function createTownFolk(scene, terrain, opts = {}) {
  const { features, rpg, namegen = null, looks = [], seed = 1, radius = 900, balance = {} } = opts;
  const cfg = balance.town || {};
  const talkRange = cfg.talkRange ?? 3.6;

  const live = new Map();          // settlement id -> [npc]
  let pending = 0;

  /** The roles a settlement of this size gets, deterministic from its id. */
  function rosterFor(node) {
    const rng = makeRng((seed ^ (node.id * 2654435761)) >>> 0);
    const size = Math.max(1, Math.min(5, node.size || 1));
    const allowed = ROLES.filter(r => (r.minSize ?? 1) <= size);
    const want = HEADCOUNT[size] || 3;
    const roster = [];
    // one of each special role first, then villagers to fill
    for (const role of allowed) {
      if (role.key === 'villager') continue;
      if (roster.length >= want) break;
      roster.push(role);
    }
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
      // stand them in a ring inside the settlement, off the road and out of the water
      const a = (i / roster.length) * Math.PI * 2 + rng() * 0.4;
      const r = 8 + rng() * (10 + size * 4);
      const x = node.wx + Math.cos(a) * r, z = node.wz + Math.sin(a) * r;
      if (terrain.waterAt(x, z) || terrain.riverAt(x, z) > 0.3) continue;

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
    update(dt, player) {
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
      return { settlements: live.size, people, pending };
    },

    dispose() {
      for (const id of [...live.keys()]) depopulate(id);
    },
  };
}
