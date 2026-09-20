// Farhold — work to do.
//
// Four kinds of job, all of them anchored to things that genuinely exist on the map: a creature the
// bestiary actually spawns in this biome, a settlement World Forge actually founded, a dungeon it
// actually placed, or an item the loot tables actually drop. Nothing here invents a destination.
//
// Pure JavaScript — no DOM, no Three.js — so the node tests drive the same code the game does.
//
//   const log = new QuestLog();
//   log.add(makeQuest('hunt', { rng, level, giver, enemies, nodes, terrain }));
//   log.onKill({ defId: 'moor_hound' });        // progress happens through events
//   log.readyToTurnIn(giver.id);

import { M_PER_CELL } from './planet.js';

export const QUEST_KINDS = ['hunt', 'visit', 'gather', 'clear'];

/**
 * KINDS THAT NEVER APPEAR ON A BOARD.
 *
 * A raid is a job you take and then choose the hour for (BUILDING_EXPANSION.md §7.4), so it is not
 * something `makeQuest` rolls and a town crier does not hand you one. `js/raid.js` builds it,
 * already quest-shaped, and it goes in the same log as everything else so the journal, the map pins
 * and the save do not need a second list. It advances only through `onRaidWave`, and the raid's own
 * `canFire()` is what decides whether anything is coming — nothing in this file can start one.
 */
export const STARTED_KINDS = ['raid'];

/** Is this a job the world offered you, or one you set going yourself? */
export const isStarted = quest => STARTED_KINDS.includes(quest?.kind);

/** How many, and what it pays. Scaled by the player's level. */
const SHAPE = {
  hunt:   { count: [3, 7],  gold: [35, 80],  xp: [40, 90] },
  visit:  { count: [1, 1],  gold: [25, 60],  xp: [30, 70] },
  gather: { count: [2, 5],  gold: [30, 70],  xp: [35, 75] },
  clear:  { count: [4, 8],  gold: [70, 150], xp: [80, 170] },
};

const pick = (rng, list) => list[Math.floor(rng() * list.length)] ?? null;
const between = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * Build one job.
 * ctx: { rng, level, giver, enemies (bestiary defs), nodes (world.nodes), terrain, from (the
 * settlement the giver stands in) }
 */
export function makeQuest(kind, ctx) {
  const { rng, level = 1, giver, enemies = [], nodes = [], terrain, from = null } = ctx;
  const shape = SHAPE[kind] || SHAPE.hunt;
  const scale = 1 + (level - 1) * 0.12;
  const base = {
    id: 'q_' + Math.floor(rng() * 1e9).toString(36),
    kind,
    giverId: giver?.id ?? null,
    giverName: giver?.name ?? 'a stranger',
    fromName: from?.name ?? null,
    progress: 0,
    done: false,
    turnedIn: false,
    reward: {
      gold: Math.round(between(rng, shape.gold) * scale),
      xp: Math.round(between(rng, shape.xp) * scale),
    },
  };

  if (kind === 'hunt' || kind === 'clear') {
    // something that actually lives around here, at a level the player can face
    const pool = enemies.filter(e => (e.minLevel ?? 1) <= level + 3 && (e.maxLevel ?? 99) >= level - 1);
    const def = pick(rng, pool.length ? pool : enemies);
    if (!def) return null;
    const count = between(rng, shape.count);
    if (kind === 'clear') {
      const dens = nodes.filter(n => n.type === 'dungeon');
      const site = pick(rng, dens);
      if (!site) return null;
      return {
        ...base,
        target: def.id, targetName: def.name, count,
        place: { x: site.x * M_PER_CELL, z: site.y * M_PER_CELL, name: site.name || 'the ruin', cell: { x: site.x, y: site.y } },
        title: `Clear ${site.name || 'the ruin'}`,
        text: `${count} ${def.name} have made a home of ${site.name || 'the ruin'}. Put them out of it.`,
      };
    }
    return {
      ...base,
      target: def.id, targetName: def.name, count,
      title: `Cull the ${def.name}`,
      text: `${def.name} have been a plague on us. Kill ${count} and there is coin in it.`,
    };
  }

  if (kind === 'visit') {
    // somewhere else on the map, not where you are standing
    const places = nodes.filter(n => (n.type === 'settlement' || n.type === 'port' || n.type === 'landmark') && n.id !== from?.id);
    const site = pick(rng, places);
    if (!site) return null;
    return {
      ...base,
      count: 1,
      place: { x: site.x * M_PER_CELL, z: site.y * M_PER_CELL, name: site.name, cell: { x: site.x, y: site.y } },
      title: `Carry word to ${site.name}`,
      text: `Take word to ${site.name}. It is a walk, but the news will not carry itself.`,
    };
  }

  if (kind === 'gather') {
    const count = between(rng, shape.count);
    const want = pick(rng, ['ring', 'necklace', 'dagger', 'cloth_helm', 'light_boots']);
    return {
      ...base,
      target: want, targetName: want.replace(/_/g, ' '), count,
      title: `Bring ${count} ${want.replace(/_/g, ' ')}`,
      text: `Find me ${count} ${want.replace(/_/g, ' ')}. Whatever condition — I am not proud.`,
    };
  }
  return null;
}

/**
 * WHAT IN THE BAG WOULD COUNT TOWARD THIS JOB.
 *
 * "I had a quest to collect 6 daggers. I actually had 6 daggers on me, but I had to go witness them
 * drop. It should have just let me use the ones I had on me."
 *
 * A gather quest only ever advanced through `onLoot`, so anything already in the bag was invisible
 * to it — you could be standing in front of the person who asked, carrying exactly what they wanted,
 * and be told to go and find some. This lists what would count, and `submitGather` takes the ones
 * the player chose.
 *
 * The choosing is the other half of the ask: "there should also be a dialog that asks me to select
 * the items in question and submit the quest, that way it doesn't accidentally take something the
 * player meant to keep." So nothing is ever taken automatically — the quest says what it can use,
 * and the player hands it over.
 */
export function gatherable(quest, bag = []) {
  if (!quest || quest.kind !== 'gather') return [];
  return bag.filter(item => item && item.baseKey === quest.target);
}

/**
 * Hand over the chosen items. Returns what was taken and whether that finished the job.
 *
 * Refuses rather than over-taking: handing in eight daggers for a job that wants six leaves you the
 * other two, because a quest should never be a way to lose things.
 */
export function submitGather(quest, bag, chosen = []) {
  if (!quest || quest.kind !== 'gather') return { ok: false, why: 'That job does not want items.' };
  const need = Math.max(0, (quest.count || 0) - (quest.progress || 0));
  if (!need) return { ok: false, why: 'You have already brought enough.' };
  const usable = chosen.filter(item => item && item.baseKey === quest.target && bag.includes(item));
  if (!usable.length) return { ok: false, why: 'Nothing you picked is what they asked for.' };
  const taken = usable.slice(0, need);
  for (const item of taken) {
    const at = bag.indexOf(item);
    if (at >= 0) bag.splice(at, 1);
  }
  quest.progress = (quest.progress || 0) + taken.length;
  if (quest.progress >= quest.count) quest.done = true;
  return { ok: true, taken, done: !!quest.done, left: Math.max(0, quest.count - quest.progress) };
}

/** The jobs a player is carrying. Progress only ever happens through events. */
export class QuestLog {
  constructor() {
    this.active = [];
    this.finished = [];
  }

  add(quest) {
    if (!quest) return null;
    this.active.push(quest);
    return quest;
  }

  has(id) { return this.active.some(q => q.id === id); }

  // A raid has no giver — you took it off your own board and you pay yourself out of what was
  // carrying it. Filtering it out here stops a raid from turning up in a village merchant's
  // "finished jobs" list, which it otherwise would, every raid having `giverId: null`.
  byGiver(giverId) { return this.active.filter(q => q.giverId === giverId && !isStarted(q)); }

  /** The raids in the log, whatever state they are in. For the base panel and the journal. */
  raids() { return this.active.filter(q => q.kind === 'raid'); }

  /** Something died. */
  onKill({ defId }) {
    const advanced = [];
    for (const q of this.active) {
      if (q.done || (q.kind !== 'hunt' && q.kind !== 'clear')) continue;
      if (q.target !== defId) continue;
      // a "clear" job only counts kills at the site
      q.progress++;
      if (q.progress >= q.count) q.done = true;
      advanced.push(q);
    }
    return advanced;
  }

  /** The player moved. `x`,`z` in metres. */
  onArrive({ x, z }, radius = 120) {
    const advanced = [];
    for (const q of this.active) {
      if (q.done || !q.place) continue;
      if (Math.hypot(q.place.x - x, q.place.z - z) > radius) continue;
      if (q.kind === 'visit') { q.progress = 1; q.done = true; advanced.push(q); }
      else if (q.kind === 'clear') { q.atSite = true; }
    }
    return advanced;
  }

  /** Something went in the bag. */
  onLoot({ baseKey }) {
    const advanced = [];
    for (const q of this.active) {
      if (q.done || q.kind !== 'gather' || q.target !== baseKey) continue;
      q.progress++;
      if (q.progress >= q.count) q.done = true;
      advanced.push(q);
    }
    return advanced;
  }

  /**
   * A wave of a raid was cleared. `js/raid.js` owns the raid's own state machine; this only keeps
   * the log's progress counter in step so the journal and the tracker read right.
   */
  onRaidWave({ questId = null, quest = null, wave = null } = {}) {
    const q = quest || this.active.find(j => j.id === questId);
    if (!q || q.kind !== 'raid') return null;
    q.progress = wave == null ? (q.progress || 0) + 1 : wave;
    if (q.progress >= q.count) q.done = true;
    return q;
  }

  /** Finished jobs this person can pay out. */
  readyToTurnIn(giverId) {
    return this.active.filter(q => q.done && !q.turnedIn && q.giverId === giverId && !isStarted(q));
  }

  /** A raid pays itself out — there is nobody to walk back to. */
  readyRaids() { return this.active.filter(q => q.kind === 'raid' && q.done && !q.turnedIn); }

  turnIn(quest) {
    quest.turnedIn = true;
    const i = this.active.indexOf(quest);
    if (i >= 0) this.active.splice(i, 1);
    this.finished.push(quest);
    return quest.reward;
  }

  /** "2 / 5" for the journal. */
  progressText(q) {
    if (q.kind === 'visit') return q.done ? 'arrived' : 'not yet there';
    if (q.kind === 'raid') {
      if (q.state === 'offered') return 'not taken';
      if (q.state === 'accepted') return 'ring the bell when you are ready';
      if (q.state === 'lost') return 'overrun';
      return `wave ${Math.min(Math.max(q.progress, q.wave || 1), q.count)} / ${q.count}`;
    }
    return `${Math.min(q.progress, q.count)} / ${q.count}`;
  }

  toJSON() { return { active: this.active, finished: this.finished.map(q => q.id) }; }
  static fromJSON(data) {
    const log = new QuestLog();
    if (data?.active) log.active = data.active;
    return log;
  }
}
