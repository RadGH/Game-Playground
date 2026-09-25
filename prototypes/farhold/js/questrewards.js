// Farhold — what a finished job actually pays, and the one place that pays it.
//
//   "Let's have some quests give money and xp, some give item reward via loot crate popup, others
//    give materials (especially if the quest was triggered by building or town growth), or a fourth
//    option where the quest giver asks what type of reward you want and you get to pick. Also add a
//    quest reward where you get to choose one of three rare or better items."
//
// Before this file there was no such thing as a reward KIND. `makeQuest` wrote `{ gold, xp }` and
// nothing else, and the paying happened at three different call sites in main.js — the talk screen,
// `payBoardJobs()` and the meteor crate — each of which could add gold and experience and nothing
// whatever else. So a job could not pay an item even in principle, and `reward.extras` (which
// `jobgen.js` has been building out of `data/job-frames.json` since the day it was written, for four
// frames) was read by NOBODY. Four kinds of promised reward, none of them ever delivered.
//
// This is one function, `grantReward(quest, ctx)`, that every one of those call sites goes through.
// Everything it needs to touch the game with is INJECTED — roll an item, add materials, add gold,
// grant experience, show the crate popup, ask the player to choose — so the whole thing runs under
// `node --test` with no DOM, no Three.js and no game.
//
//   import { grantReward, rewardKindFor } from './questrewards.js';
//   const paid = await grantReward(quest, { rollDrop, addItem, addMaterials, addGold, gainXp,
//                                           showCrate, choose, level, rng, extras });

/** The five things a finished job can pay out in. */
export const REWARD_KINDS = ['coin', 'crate', 'materials', 'choice', 'pick3'];

/**
 * THE RULE, IN ONE PLACE.
 *
 * A reward kind is decided from what the job IS, not rolled blind, because the point of having kinds
 * at all is that the reward should feel like it came out of the work:
 *
 *   fetching and hauling      -> materials   ("especially if the quest was triggered by building or
 *                                             town growth" — you carried stuff, you are paid in stuff)
 *   going into a hole, or     -> crate       (you cleared a place; something was in it)
 *   putting down a champion
 *   the biggest jobs of all   -> pick3       (three rare-or-better items, you take one)
 *   errands and culls         -> coin        (money and experience, the old behaviour)
 *   and one in five of those  -> choice      (the giver asks what you would rather have)
 *
 * Data wins over all of it: a frame in `data/job-frames.json` that says `"reward": { "kind": ... }`
 * gets that kind, which is how a job about feeding a hold or digging out a mine says so in the file
 * rather than in a special case in here.
 */
const MATERIAL_LOG_KINDS = new Set(['gather']);
const CRATE_KINDS = new Set(['clear', 'clearSites', 'kill']);
/** What a job has to pay in coin, before scaling, to count as one of the big ones. */
export const PICK3_GOLD = 130;
/** …or, for a board job, how much standing it moves. Only the two hardest frames reach this. */
export const PICK3_STANDING = 12;
/** How often a giver asks you what you want instead of just handing it over. */
export const CHOICE_CHANCE = 0.2;

export function rewardKindFor(quest, { rng = null, level = 1 } = {}) {
  if (!quest) return 'coin';
  const said = quest.reward?.kind;
  if (said && REWARD_KINDS.includes(said)) return said;   // the data decided
  const shape = quest.kind || 'visit';
  const log = quest.logKind || shape;
  const scale = 1 + (Math.max(1, level) - 1) * 0.12;      // the same scale both quest makers use
  const big = (quest.reward?.gold || 0) >= PICK3_GOLD * scale
    || (quest.reward?.standing || 0) >= PICK3_STANDING;
  const crateish = CRATE_KINDS.has(shape) || CRATE_KINDS.has(log);

  if (crateish && big) return 'pick3';
  if (MATERIAL_LOG_KINDS.has(log)) return 'materials';
  const natural = crateish ? 'crate' : 'coin';
  // the giver asks. Never for materials or pick3 — a haul of timber is not a thing anybody would
  // pick over three rare items, so offering the choice there would only ever be a worse reward.
  if (rng && rng() < CHOICE_CHANCE) return 'choice';
  return natural;
}

/**
 * A JOB THAT PAYS IN A THING STILL PAYS SOME COIN.
 *
 * The alternative is that "some quests give money" reads as "most quests no longer give money", and
 * a player who is saving for a horse feels a crate quest as a pay cut. So the coin a job was already
 * worth is kept whole for a `coin` job and cut to this share for the others, with the rest of the
 * value going into the item or the materials. Experience is never cut: levelling is progression, not
 * a flavour of reward, and a job that took the same work has to be worth the same experience.
 */
export const SIDE_GOLD = 0.4;

/**
 * WHAT MATERIALS, AND WHY THOSE.
 *
 * Three pools, chosen by what the job had you doing, so a reward is legible as having come from the
 * work: hauling for a settlement pays building stock, a cull pays what comes off a carcass, a ruin
 * pays what you pull out of a ruin. Every id here is a real material — `data/resources.json` for the
 * dug and made ones, `data/crafting.json` for the three recycled ones — and the test checks that,
 * because a reward of something the game has never heard of would go silently into the bag and never
 * come out. The number beside each is its share of the haul.
 */
export const MATERIAL_POOLS = {
  build: [['log', 3], ['plank', 2], ['cut_stone', 2], ['stone', 3], ['rope', 1], ['iron_ingot', 1]],
  hunt: [['hide', 3], ['bone', 3], ['sinew', 2], ['leather', 1], ['scrap', 2]],
  ruin: [['scrap', 3], ['cut_stone', 2], ['essence', 2], ['iron_ingot', 1], ['dust', 1]],
};

/** Which pool a job draws on. A frame may name one outright with `reward.matPool`. */
export function materialPoolFor(quest) {
  const named = quest?.reward?.matPool;
  if (named && MATERIAL_POOLS[named]) return named;
  const shape = quest?.kind || '';
  const log = quest?.logKind || shape;
  if (CRATE_KINDS.has(shape) || CRATE_KINDS.has(log)) return 'ruin';
  if (shape === 'hunt' || log === 'hunt') return 'hunt';
  return 'build';
}

/**
 * The bag of materials a job pays. **Never empty** — a materials reward that rolled nothing would be
 * a job that paid nothing at all, which is worse than any other bug in here because the player has
 * no way to tell it apart from the reward simply not existing.
 */
export function materialsFor(quest, { level = 1, rng = Math.random } = {}) {
  const fixed = quest?.reward?.mats;
  if (fixed && Object.keys(fixed).length) {
    // a frame said exactly what it pays. Scale it with level the same way coin is scaled.
    const scale = 1 + (Math.max(1, level) - 1) * 0.12;
    const out = {};
    for (const [id, n] of Object.entries(fixed)) out[id] = Math.max(1, Math.round(n * scale));
    return out;
  }
  const pool = MATERIAL_POOLS[materialPoolFor(quest)] || MATERIAL_POOLS.build;
  // two or three lines, drawn without repeats, so the bag reads as a delivery and not as a slot pull
  const bag = {};
  const left = pool.slice();
  const lines = Math.min(left.length, 2 + (rng() < 0.45 ? 1 : 0));
  for (let i = 0; i < lines; i++) {
    const at = Math.floor(rng() * left.length) % left.length;
    const [id, weight] = left.splice(at, 1)[0];
    const n = Math.max(1, Math.round(weight * (1 + Math.max(0, level - 1) * 0.25) * (0.7 + rng() * 0.6)));
    bag[id] = (bag[id] || 0) + n;
  }
  if (!Object.keys(bag).length) bag[pool[0][0]] = 1;   // belt and braces: never an empty bag
  return bag;
}

/**
 * THE FOUR EXTRAS THAT WERE DEAD DATA.
 *
 * `data/job-frames.json` has carried these since it was written — `standing_stone` promises a perk
 * point, `dig_it_out` promises to open a dungeon, `map_the_edge` promises to reveal a zone,
 * `the_apprentice` promises a brand on your weapon — and `jobgen.js` faithfully collected all four
 * into `reward.extras`, where nothing ever looked at them. Four frames whose whole reason for being
 * interesting was a promise the game did not keep.
 *
 * They are handled by INJECTED handlers (`ctx.extras`) because each one touches a different part of
 * the game; this list is here so the test can prove that every extra a frame can name has somewhere
 * to go, and so an extra added to the data without a handler shows up as `unhandled` rather than
 * vanishing the way these four did.
 */
export const EXTRA_KEYS = ['perk', 'opens', 'reveals', 'brand'];

/** Keys of `frame.reward` that are the reward's SHAPE, not an extra to be granted. */
export const REWARD_SHAPE_KEYS = ['gold', 'xp', 'standing', 'kind', 'mats', 'matPool'];

/** A short line for the journal row and the talk screen: what handing this in gets you. */
export function rewardBlurb(quest) {
  const r = quest?.reward || {};
  const kind = r.kind || rewardKindFor(quest);
  const coin = kind === 'coin' ? (r.gold || 0) : Math.round((r.gold || 0) * SIDE_GOLD);
  const money = [coin ? `${coin} gold` : null, r.xp ? `${r.xp} xp` : null].filter(Boolean).join(', ');
  const TAIL = {
    coin: '',
    crate: 'and something in a crate',
    materials: 'and materials',
    choice: 'and your pick of the reward',
    pick3: 'and one of three rare finds',
  };
  const tail = TAIL[kind] || '';
  if (!money) return tail || 'nothing but the thanks';
  return tail ? `${money} ${tail}` : money;
}

/** The three things a giver can offer when they ask you what you want. */
export const CHOICE_OPTIONS = [
  { id: 'coin', name: 'The coin', icon: 'coin_pile', note: 'Paid in full, on the spot.' },
  { id: 'crate', name: 'Something from the store', icon: 'chest_closed', note: 'They go and find you a piece of gear.' },
  { id: 'materials', name: 'A load of stock', icon: 'wagon', note: 'Timber, stone, metal — whatever they have.' },
];

const clamp0 = n => Math.max(0, Math.round(n || 0));

/**
 * Pay a finished job out. Returns what was paid, so the caller can write the log line.
 *
 * ctx: {
 *   level, rng,
 *   rollDrop({ level, floor }) -> item,   addItem(item),
 *   addMaterials(bag),  addGold(n),  gainXp(n) -> levels gained,
 *   showCrate(spec) -> Promise,           // the shared rewards popup
 *   choose({ kind, title, subtitle, options }) -> Promise<id|index>,
 *   extras: { perk(value, quest), opens(...), reveals(...), brand(...) },
 * }
 * Every one of them is optional: with none of them this still decides the kind, rolls the numbers
 * and reports them, which is exactly what the node tests drive.
 */
export async function grantReward(quest, ctx = {}) {
  const out = {
    kind: 'none', gold: 0, xp: 0, levels: 0, items: [], mats: {},
    extras: [], unhandled: [], already: false, chosen: null,
  };
  if (!quest) return out;
  /**
   * A JOB IS PAID ONCE.
   *
   * `QuestLog.turnIn` splices the quest out of `active`, so the old single path could not double-pay
   * by accident — but there are three paths into this now, plus a "Hand it in" button in the journal
   * that can be clicked twice before the screen redraws. The flag is on the quest itself so it
   * survives a save and a reload.
   */
  if (quest.paid || quest.turnedIn) { out.already = true; return out; }
  quest.paid = true;

  const {
    level = 1, rng = Math.random,
    rollDrop = null, addItem = null, addMaterials = null, addGold = null, gainXp = null,
    showCrate = null, choose = null, extras: handlers = {},
  } = ctx;

  let kind = quest.reward?.kind || rewardKindFor(quest, { rng, level });
  // Write the decision back, so a quest made before this file existed (an old save) settles on one
  // kind rather than rolling a different answer every time something asks what it pays.
  if (quest.reward && !quest.reward.kind) quest.reward.kind = kind;

  // ---- the giver asks
  if (kind === 'choice') {
    let taken = null;
    if (choose) {
      const answer = await choose({
        kind: 'choice',
        title: 'Name your price',
        subtitle: `${quest.giverName || 'They'} would rather you said what you wanted.`,
        options: CHOICE_OPTIONS.map(o => ({ ...o, lines: [o.note] })),
      });
      taken = typeof answer === 'number' ? CHOICE_OPTIONS[answer]?.id : answer;
    }
    // no chooser wired in (the node tests, or a screen that could not open): take the coin, which is
    // the one option that can never fail and never gives less than the job was already worth
    kind = REWARD_KINDS.includes(taken) && taken !== 'choice' && taken !== 'pick3' ? taken : 'coin';
    out.chosen = kind;
  }
  out.kind = kind;

  // ---- the money
  const share = kind === 'coin' ? 1 : SIDE_GOLD;
  out.gold = clamp0((quest.reward?.gold || 0) * share);
  out.xp = clamp0(quest.reward?.xp || 0);
  if (out.gold && addGold) addGold(out.gold);
  if (out.xp && gainXp) out.levels = gainXp(out.xp) || 0;

  // ---- and the thing
  if (kind === 'crate' && rollDrop) {
    // floor `magic` because a quest reward that comes out plain white is the reward not existing,
    // and `rarityBoost` so a crate job usually lands on rare
    const item = rollDrop({ level, floor: 'magic', rarityBoost: 2, chance: 1 });
    if (item) { out.items.push(item); addItem?.(item); }
  }

  if (kind === 'materials') {
    out.mats = materialsFor(quest, { level, rng });
    addMaterials?.(out.mats);
  }

  if (kind === 'pick3' && rollDrop) {
    /**
     * "Also add a quest reward where you get to choose one of three rare or better items."
     *
     * `floor: 'rare'` is the guarantee, and it is the whole reward — three cards side by side with
     * their stat lines, and you take one. If the chooser is not wired in (a headless run) the first
     * one is taken rather than none of them, because the player earned an item either way.
     */
    const offered = [];
    for (let i = 0; i < 3; i++) {
      const item = rollDrop({ level, floor: 'rare', rarityBoost: 2, chance: 1 });
      if (item) offered.push(item);
    }
    out.offered = offered;
    if (offered.length) {
      let at = 0;
      if (choose) {
        const answer = await choose({
          kind: 'pick3',
          title: 'Take one',
          subtitle: `${quest.giverName || 'They'} lay out three. One of them is yours.`,
          options: offered.map(item => ({ id: item.id, name: item.name, item })),
        });
        if (typeof answer === 'number' && offered[answer]) at = answer;
        else if (typeof answer === 'string') { const i = offered.findIndex(it => it.id === answer); if (i >= 0) at = i; }
      }
      const item = offered[at];
      out.items.push(item);
      out.chosen = item?.id ?? null;
      addItem?.(item);
    }
  }

  // ---- the extras nobody read
  for (const [key, value] of Object.entries(quest.reward?.extras || {})) {
    if (value == null || value === false) continue;
    const fn = handlers[key];
    if (!fn) { out.unhandled.push(key); continue; }
    const said = await fn(value, quest);
    out.extras.push({ key, value, text: typeof said === 'string' ? said : '' });
  }

  /**
   * THE CRATE POPUP — FOR THE KINDS THAT ARE WORTH ONE, AND NEVER AWAITED.
   *
   * Two things were wrong with opening it for everything and waiting on it.
   *
   * A `coin` job is "twenty gold and forty experience". A full-screen reveal for that is the game
   * stopping to applaud itself, and the user asked for the popup to be what tells one reward kind
   * from another — "some give money and xp, SOME give item reward via loot crate popup".
   *
   * And a board job PAYS ITSELF: `payBoardJobs` sweeps the log every few frames with nobody having
   * pressed anything. Awaiting a popup there means the caller's `questLog.turnIn` never runs until
   * somebody clicks — so the job sat finished-but-not-turned-in for ever, which is exactly what
   * tests/round10.spec.js caught. The reveal is presentation: it is started and left to itself, and
   * the ledger does not wait for it. The two kinds that genuinely need an answer — `choice` and
   * `pick3` — asked their question further up, before any of this.
   */
  if (showCrate && (kind === 'crate' || kind === 'materials' || kind === 'choice')) {
    const shown = showCrate({
      title: quest.title || 'Job done',
      subtitle: quest.giverName ? `${quest.giverName} settles up.` : 'Settled up.',
      gold: out.gold, xp: out.xp,
      items: out.items,
      mats: out.mats,
      extras: out.extras,
    });
    // it may be a promise or it may not; either way nothing below depends on it
    if (shown && typeof shown.catch === 'function') shown.catch(() => {});
  }
  return out;
}

/**
 * The same thing with its primitives already tied on, so `main.js` wires them up once instead of at
 * every call site. `grant(quest)` is then the whole of paying a job out, wherever it finished.
 */
export function makeQuestRewards(base = {}) {
  return {
    grant: (quest, extra = {}) => grantReward(quest, { ...base, ...extra }),
    blurb: rewardBlurb,
    kindFor: (quest, opts) => rewardKindFor(quest, { level: base.level, ...opts }),
  };
}
