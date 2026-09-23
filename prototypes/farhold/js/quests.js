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
import { rewardKindFor } from './questrewards.js';

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
export const STARTED_KINDS = ['raid', 'fall'];

/** Is this a job the world offered you, or one you set going yourself? */
export const isStarted = quest => STARTED_KINDS.includes(quest?.kind);

/**
 * R17 — THE HAND-HOLDING LINE IS A QUEST LIKE ANY OTHER.
 *
 * js/onboarding.js's five steps live in one quest of this kind. It is deliberately NOT in
 * `STARTED_KINDS`: it has a real giver in a real town, and handing it in at the end is what clears
 * that giver's cached offer (js/town.js caches `npc.offered` and only the turn-in path clears it),
 * so a line that paid itself in a field would leave the one person who helped you with nothing else
 * to say for the rest of the run.
 */
export const ONBOARD_KIND = 'onboard';

/**
 * R17 — THE JOB A GIVER HANDS OVER BEFORE ANY OTHER.
 *
 * js/town.js's `questFrom` is the only door a settlement's work comes through, and every one of its
 * six tries calls `makeQuest`. Asking here — once, at the top — is what lets the onboarding line be
 * offered by whoever in the starter town gives out work, through the talk screen that already
 * exists, without js/town.js or js/main.js knowing anything about it.
 *
 * It is a single slot rather than a list because there is only ever one first job, and a list would
 * be a queue nobody could see the order of. `setFirstJob(null)` turns it off again.
 */
let firstJob = null;
export function setFirstJob(fn) { firstJob = typeof fn === 'function' ? fn : null; }
/** For the tests: what is registered right now. */
export function getFirstJob() { return firstJob; }

/**
 * R22 — the "+50% on quest experience" knob, set once at boot from `data/balance.json` `xp.quest`.
 *
 * A module-level setting rather than a parameter on `makeQuest` because eleven call sites across
 * js/town.js, js/jobgen.js, js/main.js and the tests build quests, and threading a balance number
 * through all of them is how a knob ends up read by nine of the eleven. It defaults to 1, so a test
 * that never calls the setter gets the unscaled roll and stays readable.
 */
let questXpMult = 1;
export function setQuestXpMult(n) { questXpMult = Math.max(0, Number(n) || 1); }
export function getQuestXpMult() { return questXpMult; }

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
 * R14 — NEAR FIRST, AND NEVER ABSURDLY FAR.
 *
 *   "That location was hours of foot travel away in a much higher level zone. Rework the quest
 *    system to focus on nearby locations, adjacent towns preferred when possible."
 *
 * `makeQuest('visit')` picked flat at random out of every settlement, port and landmark on the
 * whole planet, which on a world this size means the average errand was most of a continent. This
 * is the one place that changes it: sort by distance the short way round, throw away anything past
 * the budget, and draw with a squared roll so the nearest few win most of the time without the same
 * village winning every time.
 *
 * `from` is world metres. Without it (the node tests) nothing is measured and nothing is dropped.
 */
const NEAR_METRES = 5200;

function nearest(rng, list, { from = null, wrapM = 0, budget = NEAR_METRES } = {}) {
  if (!list.length) return null;
  if (!from) return pick(rng, list);
  const withAway = list.map(n => {
    let dx = (n.x ?? 0) - from.x;
    if (wrapM > 0) {
      if (dx > wrapM / 2) dx -= wrapM;
      if (dx < -wrapM / 2) dx += wrapM;
    }
    return { n, away: Math.hypot(dx, (n.z ?? 0) - from.z) };
  }).sort((a, b) => a.away - b.away);
  // inside the budget if anything is; otherwise the three closest, because a board with nothing on
  // it is worse than a long walk and there are worlds where the nearest village really is far
  const inside = withAway.filter(r => r.away <= budget);
  const bag = inside.length ? inside : withAway.slice(0, 3);
  const at = Math.min(bag.length - 1, Math.floor(rng() ** 2 * bag.length));
  return { ...bag[at].n, away: bag[at].away };
}

/**
 * Build one job.
 * ctx: { rng, level, giver, enemies (bestiary defs), nodes (world.nodes), terrain, from (the
 * settlement the giver stands in) }
 */
export function makeQuest(kind, ctx) {
  /**
   * R17: the onboarding line gets first refusal, and it refuses itself the moment the player has
   * taken it, levelled past it, or built anything — see js/onboarding.js `offerFor`. A thrown error
   * in there must not cost the giver their job offer, hence the guard: a broken tutorial is never
   * allowed to be the reason a town has no work.
   */
  if (firstJob) {
    try {
      const first = firstJob(ctx);
      if (first) return first;
    } catch (err) {
      console.warn('quests: the first-job hook threw; falling back to ordinary work', err);
    }
  }
  const {
    rng, level = 1, giver, enemies = [], nodes = [], terrain, from = null,
    // R14: where the giver is standing, how wide the world is, and what level a place sits at.
    at = null, wrapM = terrain?.widthM || 0, zoneAt = null,
  } = ctx;
  /** A destination this player has no business walking to yet. */
  const tooHigh = node => {
    if (!zoneAt || !Number.isFinite(node?.x)) return false;
    const z = zoneAt(node.x, node.z);
    const band = z?.minLevel ?? z?.midLevel;
    return Number.isFinite(band) && band > level + 4;
  };
  const shape = SHAPE[kind] || SHAPE.hunt;
  const scale = 1 + (level - 1) * 0.12;
  /**
   * R22 — "Let's bump the XP gained from quests and other events by 50%."
   *
   * A quest's experience is rolled HERE, when the job is written, not when it is handed in — so
   * this is where the 1.5 has to go, and a job already on a board keeps whatever it was offered
   * for, which is right: the number is printed on the notice.
   *
   * It is the same `xp.quest` knob `js/rpg.js` `eventXp` reads for everything else, passed in by
   * whoever builds the board rather than imported, because js/quests.js is pure and has no
   * balance file of its own.
   */
  const reward = {
    gold: Math.round(between(rng, shape.gold) * scale),
    xp: Math.round(between(rng, shape.xp) * scale * questXpMult),
  };
  /**
   * R16 — WHAT IT PAYS IN, DECIDED WHERE THE JOB IS MADE.
   *
   *   "Let's have some quests give money and xp, some give item reward via loot crate popup, others
   *    give materials… or a fourth option where the quest giver asks what type of reward you want."
   *
   * The kind is settled here, once, rather than at the moment of handing in — so the talk screen and
   * the journal can both TELL you what is on offer before you walk back for it, and so a job cannot
   * quietly change what it pays between being taken and being finished. The rule itself lives in
   * `js/questrewards.js`; this only hands it the finished numbers to judge.
   */
  reward.kind = rewardKindFor({ kind, reward }, { rng, level });
  const base = {
    id: 'q_' + Math.floor(rng() * 1e9).toString(36),
    kind,
    giverId: giver?.id ?? null,
    giverName: giver?.name ?? 'a stranger',
    fromName: from?.name ?? null,
    progress: 0,
    done: false,
    turnedIn: false,
    reward,
  };

  if (kind === 'hunt' || kind === 'clear') {
    // something that actually lives around here, at a level the player can face
    const pool = enemies.filter(e => (e.minLevel ?? 1) <= level + 3 && (e.maxLevel ?? 99) >= level - 1);
    const def = pick(rng, pool.length ? pool : enemies);
    if (!def) return null;
    const count = between(rng, shape.count);
    if (kind === 'clear') {
      const dens = nodes
        .map(n => (n.type === 'dungeon' ? { ...n, x: n.x * M_PER_CELL, z: n.y * M_PER_CELL, cell: { x: n.x, y: n.y } } : null))
        .filter(Boolean)
        .filter(n => !tooHigh(n));
      const site = nearest(rng, dens, { from: at, wrapM });
      if (!site) return null;
      return {
        ...base,
        target: def.id, targetName: def.name, count,
        place: { x: site.x, z: site.z, name: site.name || 'the ruin', cell: site.cell },
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
    // R14: somewhere else on the map, not where you are standing — and NEAR, and not six bands up
    const places = nodes
      .filter(n => (n.type === 'settlement' || n.type === 'port' || n.type === 'landmark') && n.id !== from?.id)
      .map(n => ({ ...n, x: n.x * M_PER_CELL, z: n.y * M_PER_CELL, cell: { x: n.x, y: n.y } }))
      .filter(n => !tooHigh(n));
    const site = nearest(rng, places, { from: at, wrapM });
    if (!site) return null;
    const far = Number.isFinite(site.away) && site.away > NEAR_METRES;
    return {
      ...base,
      count: 1,
      place: { x: site.x, z: site.z, name: site.name, cell: site.cell },
      title: `Carry word to ${site.name}`,
      text: far
        ? `Take word to ${site.name}. It is a long way — pack for it.`
        : `Take word to ${site.name}. It is a walk, but the news will not carry itself.`,
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

/**
 * R14 — A FALL FROM THE SKY IS A JOB.
 *
 * "I saw what looked like a shooting star, can you change it so that falling stars are actual
 *  events and leave behind a meteor with a special loot crate inside. I could not tell where the
 *  meteor landed however, so it should have its own map marker. It would be interesting to act
 *  like a quest."
 *
 * A meteor used to be a line in the log and a dot that vanished the moment it landed, which is the
 * worst possible timing: the thirty seconds you could see it were the thirty seconds you did not
 * need to. Making it quest-shaped costs almost nothing and buys all of it at once — the journal
 * lists it, the marker book pins it (`markerKind: 'fall'`, its own ☄ rather than a quest's `!`),
 * the minimap arrow points at it, and it survives a save like any other job.
 *
 * It is a STARTED kind, like a raid: nobody handed it to you, so there is nobody to walk back to.
 * It pays itself out the moment the crate is open.
 */
export function makeFallQuest({ x, z, cell, seconds = 30, id = null } = {}) {
  return {
    id: id || 'q_fall_' + Math.round(x) + '_' + Math.round(z),
    kind: 'fall',
    giverId: null,
    giverName: 'the sky',
    markerKind: 'fall',
    count: 1,
    progress: 0,
    done: false,
    turnedIn: false,
    state: 'falling',
    seconds,
    chestKey: `meteor:${Math.round(x)},${Math.round(z)}`,
    place: { x, z, name: 'Meteor Crater', cell: { x: cell?.x ?? 0, y: cell?.y ?? 0 } },
    /**
     * R15 — IT IS CALLED WHAT IT IS.
     *
     *   "For meteorise instead of saying 'Something came down' just say 'Meteor Crater'"
     *
     * "Something came down" is atmospheric and tells you nothing: on the map, in the Nearby panel
     * and in the journal it has to survive being read at a glance beside twenty other rows, and a
     * row that could be anything is a row you skip.
     */
    title: 'Meteor Crater',
    text: 'A star fell and did not burn up. Whatever is in the crater is still hot.',
    // a fall pays itself out when the crate comes open; plain coin and experience, no chooser
    reward: { gold: 0, xp: 0, kind: 'coin' },
  };
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

  /**
   * R14 — a crate was opened. The only job that cares is a `fall`, and its whole completion
   * condition is "you got there and you opened it".
   */
  onChestOpened({ key = null } = {}) {
    if (!key) return null;
    const q = this.active.find(j => j.kind === 'fall' && j.chestKey === key && !j.done);
    if (!q) return null;
    q.progress = 1;
    q.done = true;
    q.state = 'found';
    return q;
  }

  /** A fall has landed — the crate is on the ground now, so the wording changes. */
  onFallLanded(chestKey) {
    const q = this.active.find(j => j.kind === 'fall' && j.chestKey === chestKey);
    if (q) q.state = 'landed';
    return q || null;
  }

  /** Falls that are finished and have nobody to hand them to. Cleared out like a raid. */
  readyFalls() { return this.active.filter(q => q.kind === 'fall' && q.done && !q.turnedIn); }

  /** Finished jobs this person can pay out. */
  readyToTurnIn(giverId) {
    return this.active.filter(q => q.done && !q.turnedIn && q.giverId === giverId && !isStarted(q));
  }

  /** A raid pays itself out — there is nobody to walk back to. */
  readyRaids() { return this.active.filter(q => q.kind === 'raid' && q.done && !q.turnedIn); }

  /**
   * Hand a job in. Bookkeeping only — `js/questrewards.js` does the paying.
   *
   * R16: it REFUSES a second attempt. There are four ways into this now (the talk screen, the board
   * sweep, the meteor crate and the journal's own "Hand it in" button), and the journal button in
   * particular can be pressed twice before the screen has redrawn. A quest that was already handed
   * in returns null, and a null is the caller's signal to pay nothing.
   */
  turnIn(quest) {
    if (!quest || quest.turnedIn) return null;
    quest.turnedIn = true;
    const i = this.active.indexOf(quest);
    if (i >= 0) this.active.splice(i, 1);
    this.finished.push(quest);
    return quest.reward;
  }

  /**
   * R16 — EVERY FINISHED JOB, WHEREVER THE PERSON WHO ASKED IS STANDING.
   *
   *   "It's currently difficult to turn in a quest, finding the right quest giver. Allow quests to
   *    be turned in through the interface journal page."
   *
   * The journal's list. It is deliberately NOT filtered by who gave the job or by how far away they
   * are: walking three zones back to a named villager to be told "well done" is the complaint, and
   * gating half the list behind that would only have made the button look broken. The started kinds
   * (a raid, a meteor fall) stay out because they pay themselves the moment they finish — there is
   * nobody to hand them to and no button that would help.
   */
  readyAnywhere() {
    return this.active.filter(q => q.done && !q.turnedIn && !isStarted(q));
  }

  /** "2 / 5" for the journal. */
  progressText(q) {
    if (q.kind === 'visit') return q.done ? 'arrived' : 'not yet there';
    /**
     * R17 — the onboarding line counts its own steps. `q.step` is the index of the step you are ON,
     * so the row reads "2 / 5" while you are working the third one, which is what a progress line
     * is for. `?? 0` matters: a save written before this round has no `step` field at all, and
     * `undefined / 5` on the journal row would read "NaN / 5".
     */
    if (q.kind === ONBOARD_KIND) {
      return q.done ? 'ready to hand in' : `${Math.min(q.step ?? 0, q.count ?? 0)} / ${q.count ?? 0}`;
    }
    if (q.kind === 'fall') {
      if (q.done) return 'opened';
      // R15: short enough for the Nearby panel's second line, which is about ninety pixels wide
      return q.state === 'landed' ? 'down' : 'falling';
    }
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
