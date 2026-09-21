// Farhold R17 — the five steps that take you from standing in a field to holding an iron ingot.
//
//   "Let's add a brief onboarding quest line that holds the hand of the player and guides them
//    through accepting a quest at the starter town, harvesting basic resources, and starting a
//    basic base. This quest should require you to get enough resources to build the necessary
//    stuff required to smelt iron ore."
//
// Round 10's review already found the shape of this problem — *"the game never said what to do"* —
// and the answer then was the tracked objective line under the health bars. That line tells you
// WHERE something is. It has never once told you what to press when you get there, and the whole
// opening of this game is a chain of presses nobody has been told about: E on a tree, B for the
// build panel, E on a furnace. js/nextstep.js writes those sentences already and they are buried in
// the build panel, which a player who does not know B exists will never open.
//
// So this is the same sentences, on the line the player is already reading, in order, paying out as
// you go. It is ONE quest in the log with five steps rather than five quests, because five entries
// in the journal for the first ten minutes of the game is a journal nobody opens again.
//
// WHAT MAKES IT REACHABLE — this project's signature fault is a finished module with no way in, so
// every join is written down here:
//
//   offered      js/quests.js `setFirstJob` — `makeQuest` asks it before it rolls anything, and
//                js/town.js's `questFrom` calls `makeQuest`. So the first quest-giver you talk to
//                in any settlement offers this instead of a cull, through the talk screen that
//                already exists. Nothing in js/town.js changes.
//   in the log   the ordinary `accept` handler: `questLog.add(quest)`. It saves, loads and appears
//                in the journal for free, because it is a quest like any other.
//   on the HUD   `objective()` below, called from main.js's own `objective:` provider.
//   advancing    `tick()` below, called once from the frame loop. It reads what is actually
//                standing and what is actually in a storage pool — never a flag — so a step cannot
//                stay lit after you have done it.
//   paid         js/questrewards.js `grantReward`, injected as `pay`. There is no second payer.
//   finished     the last step sets `quest.done`, and the quest is handed in the ordinary way, at
//                the giver or from the journal's button.
//
// No DOM and no Three.js: `node --test` drives exactly what the game drives.
//
//   const onboard = await createOnboarding({ questLog, structures, refining, resources, game, pay });
//   onboard.tick(dt);
//   onboard.objective();   // { name, where } for the HUD, or null

import { setFirstJob, ONBOARD_KIND } from './quests.js';

/** Where the line's data lives, when nobody hands it in. */
export const ONBOARDING_URL = 'data/onboarding.json';

/**
 * EVERY ID THE LINE NAMES, CHECKED AGAINST THE DATA THAT WOULD HAVE TO CONTAIN IT.
 *
 * Two agents are re-cutting the early crafting chain in the same round this was written, so the ids
 * below WILL move. That is fine; what is not fine is a tutorial quietly pointing at a structure
 * nobody builds any more, because it is the first thing a new player sees and they will believe it.
 *
 * This returns a list of problems rather than throwing, so the caller can decide: the node test
 * fails on any problem at all, and the game logs them and carries on without the line — a broken
 * tutorial must never be the reason somebody cannot play.
 */
export function resolveTargets(data, { structures = null, refining = null, resources = null } = {}) {
  const problems = [];
  const resolved = {};
  const structureIds = new Set((structures?.structures || []).map(s => s.id));
  const recipes = new Map((refining?.recipes || []).map(r => [r.id, r]));
  const machines = new Set(Object.keys(refining?.machines || {}));
  const materials = new Set(Object.keys(resources?.materials || {}));
  const nodeKinds = new Set(Object.keys(resources?.nodeKinds || {}));

  for (const step of data?.steps || []) {
    const c = step.check || {};
    const got = { step: step.id };
    if (c.kind === 'structure') {
      // `anyOf` is the whole point: the cheap store may be `storage_crate` or `storage_box` this
      // round, and the step is happy with either — but at least one of them has to be real.
      const found = (c.anyOf || []).filter(id => structureIds.has(id));
      if (!found.length) problems.push(`${step.id}: none of [${(c.anyOf || []).join(', ')}] is a structure in data/structures.json`);
      got.structures = found;
    } else if (c.kind === 'materials') {
      for (const id of Object.keys(c.need || {})) {
        if (!materials.has(id)) problems.push(`${step.id}: "${id}" is not a material in data/resources.json`);
      }
      for (const kind of c.nodes || []) {
        if (!nodeKinds.has(kind)) problems.push(`${step.id}: "${kind}" is not a node kind in data/resources.json`);
      }
      got.need = { ...(c.need || {}) };
    } else if (c.kind === 'recipe') {
      const recipe = recipes.get(c.recipe);
      if (!recipe) problems.push(`${step.id}: "${c.recipe}" is not a recipe in data/refining.json`);
      else {
        if (!machines.has(recipe.machine)) problems.push(`${step.id}: recipe "${c.recipe}" runs on "${recipe.machine}", which is not a machine`);
        if (c.material && !(recipe.outputs || {})[c.material]) {
          problems.push(`${step.id}: recipe "${c.recipe}" does not put out "${c.material}"`);
        }
      }
      if (c.material && !materials.has(c.material)) problems.push(`${step.id}: "${c.material}" is not a material`);
      got.recipe = recipe || null;
    } else if (c.kind !== 'accepted') {
      problems.push(`${step.id}: check kind "${c.kind}" is not one this module knows`);
    }
    resolved[step.id] = got;
  }

  // the reward bags, for the same reason — a reward of something the game has never heard of goes
  // silently into the materials bag and never comes out again
  const bags = [data?.reward, ...(data?.steps || []).map(s => s.reward)];
  for (const r of bags) {
    for (const id of Object.keys(r?.mats || {})) {
      if (!materials.has(id)) problems.push(`reward pays "${id}", which is not a material`);
    }
  }
  return { ok: problems.length === 0, problems, resolved };
}

/**
 * The quest object a giver hands over.
 *
 * Deliberately shaped like every other quest — `count`, `progress`, `done`, `turnedIn`, `reward` —
 * so the journal row, the save, the marker sweep and the turn-in path all work on it without
 * knowing it is special. `step` is the only field that is ours, and it is a plain number so a save
 * written before this round loads as step 0 rather than as `undefined`.
 */
export function makeOnboardQuest(data, { giver = null, from = null } = {}) {
  const steps = data?.steps || [];
  return {
    id: data?.id || 'q_onboard',
    kind: ONBOARD_KIND,
    giverId: giver?.id ?? null,
    giverName: giver?.name ?? 'a townsperson',
    fromName: from?.name ?? giver?.node?.name ?? null,
    title: data?.title || 'First Ground',
    text: data?.giver?.text || data?.blurb || '',
    step: 0,
    // what the player is being asked to do right now, in the quest's own words — see `advance`
    stepName: steps[0]?.name || null,
    stepHud: steps[0]?.hud || null,
    count: steps.length,
    progress: 0,
    done: false,
    turnedIn: false,
    reward: { gold: 0, xp: 0, kind: 'coin', ...(data?.reward || {}) },
  };
}

/** The step a quest is on, or null when the line is finished. */
export function stepOf(quest, data) {
  const steps = data?.steps || [];
  const at = Math.max(0, Math.min(steps.length, quest?.step ?? 0));
  return steps[at] || null;
}

/**
 * IS THIS STEP DONE?
 *
 * `facts` is a snapshot of what is actually true right now — see `readFacts` — and every branch
 * reads it rather than any bookkeeping of ours. The deliberate looseness in the last two branches
 * is worth stating: a step is satisfied by the RESULT, not by the route. If you bought an iron
 * ingot from a smith instead of smelting one, the line has nothing left to teach you and refusing
 * to move on would be the tutorial arguing with the player.
 */
export function stepDone(step, facts) {
  const c = step?.check || {};
  if (c.kind === 'accepted') return true;               // finished by the act of taking the job
  if (c.kind === 'materials') {
    return Object.entries(c.need || {}).every(([id, n]) => facts.have(id) >= n);
  }
  if (c.kind === 'structure') {
    const standing = (c.anyOf || []).some(id => facts.built(id));
    // `pool` asks the harder question: a store that has formed a pool is a store that works
    if (c.pool) return standing && facts.pools > 0;
    return standing;
  }
  if (c.kind === 'recipe') return facts.have(c.material) >= (c.count || 1);
  return false;
}

/**
 * How much of a material you have ANYWHERE — the bag and every storage pool.
 *
 * The same sum main.js already does for js/nextstep.js, and for the same reason: a player who has
 * just tipped twelve logs into a crate has not stopped having twelve logs, and a step that said
 * otherwise would be telling them to go and cut wood while standing next to their own woodpile.
 */
function haveAnywhere(game, id) {
  let n = game?.materials?.count?.(id) ?? 0;
  for (const pool of game?.stores?.pools?.() || []) n += game.stores.count(pool, id) || 0;
  return n;
}

/** Everything a check can ask about, read fresh. Cheap enough to do twice a second. */
export function readFacts(game = {}) {
  const entries = game?.build?.entries || [];
  const pools = game?.stores?.pools?.()?.length ?? 0;
  const at = game?.control || { x: 0, z: 0 };
  const inside = game?.features?.settlementAt?.(at.x, at.z) || null;
  const near = inside || game?.features?.nearestSettlement?.(at.x, at.z) || null;
  return {
    level: game?.player?.level ?? 1,
    have: id => haveAnywhere(game, id),
    built: key => entries.some(e => e.key === key),
    buildings: entries.length,
    pools,
    town: near ? {
      name: near.name,
      inside: !!inside,
      away: Math.hypot((near.x ?? near.wx ?? 0) - at.x, (near.z ?? near.wz ?? 0) - at.z),
    } : null,
  };
}

/** "450 m" / "1.2 km" — the objective line's own wording, kept short enough for the strip. */
function away(metres) {
  if (!Number.isFinite(metres)) return '';
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

/**
 * Hand a research point over, if there is anything to hand it to.
 *
 * The research system is being written in the same round as this file, so it may not exist yet —
 * and when it does, it may arrive as an injected module or as `window.farhold.research`. Both are
 * tried, both are wrapped, and a missing module is silence rather than a crash. A tutorial that
 * kills the frame loop because a sibling module landed an hour later is not a tutorial.
 */
function awardResearch(research, reason, n) {
  if (!(n > 0)) return false;
  try {
    const mod = research
      || (typeof globalThis !== 'undefined' ? globalThis.farhold?.research : null);
    if (typeof mod?.award !== 'function') return false;
    mod.award(reason, n);
    return true;
  } catch (err) {
    console.warn('onboarding: research.award threw', err);
    return false;
  }
}

/**
 * The line itself.
 *
 * Everything that touches the game is injected, which is what lets the node tests run the whole
 * five steps with a fake base and a fake purse:
 *
 *   questLog   the real QuestLog, so the quest saves and loads like any other
 *   structures/refining/resources   the three data files, for `resolveTargets`
 *   game       { player, control, stores, materials, build, features } — read, never written
 *   pay        quest => grantReward(quest, questRewardCtx())   — js/questrewards.js, the one payer
 *   log        (text, tone) => hud.log(text, tone)
 *   save       () => autoSave()
 *   research   the research module, if it exists yet
 */
export async function createOnboarding({
  data = null, dataUrl = ONBOARDING_URL,
  questLog = null, structures = null, refining = null, resources = null,
  game = {}, pay = null, log = null, save = null, research = null,
  every = 0.5,
} = {}) {
  if (!data) {
    try {
      const res = await fetch(dataUrl);
      data = res.ok ? await res.json() : null;
    } catch (err) {
      console.warn('onboarding: could not read', dataUrl, err);
      data = null;
    }
  }
  const audit = data ? resolveTargets(data, { structures, refining, resources }) : { ok: false, problems: ['no data'], resolved: {} };
  if (!audit.ok) {
    // Loud, and then out of the way. See the header: the tutorial is never allowed to be the
    // reason the game does not start.
    console.warn('onboarding: the line points at things that do not exist —', audit.problems);
  }
  const live = !!data && audit.ok;
  const steps = data?.steps || [];

  /** The quest, once it is in the log. Found by id so a reload picks it straight back up. */
  const find = () => questLog?.active?.find(q => q.kind === ONBOARD_KIND) || null;
  const finishedAlready = () => !!questLog?.finished?.some(q => (q.id || q) === (data?.id || 'q_onboard'));

  /**
   * WHO GETS OFFERED IT, AND WHEN NOBODY DOES.
   *
   * Registered with js/quests.js so `makeQuest` asks before it rolls anything. Every gate here is
   * about a player who does NOT need this: somebody who has levelled, somebody with an ingot
   * already, somebody with a base already, or somebody who has taken it once. There is no decline
   * button in the talk screen's job card, so walking away IS declining — which is why these gates
   * have to carry the whole weight of "do not nag me".
   */
  function offerFor(ctx) {
    if (!live) return null;
    if (find() || finishedAlready()) return null;
    const gate = data.offer || {};
    // the HUD hands its own snapshot in so a frame does not read the base twice; a quest-giver
    // calls this out of js/town.js with nothing, and gets a fresh one
    const facts = ctx?.facts || readFacts(game);
    if (Number.isFinite(gate.maxLevel) && (ctx?.level ?? facts.level) > gate.maxLevel) return null;
    const not = gate.notIf || {};
    if (not.material && facts.have(not.material) >= (not.atLeast ?? 1)) return null;
    if (Number.isFinite(not.built) && facts.buildings >= not.built) return null;
    return makeOnboardQuest(data, { giver: ctx?.giver || null, from: ctx?.from || null });
  }
  if (live) setFirstJob(offerFor);

  // ---------------------------------------------------------------- advancing

  let since = 0;
  let working = false;     // `pay` is async; without this the tick re-enters it sixty times a second
  let lastStep = -1;

  /**
   * Pay one finished step and move to the next.
   *
   * The step's own reward is put through `grantReward` as a small quest-shaped object rather than
   * being added by hand, because this project has exactly one payer and adding a second one here
   * would be how the next round's "quest gold is wrong" bug gets written.
   */
  async function completeStep(quest, step) {
    quest.step = Math.min(steps.length, (quest.step || 0) + 1);
    quest.progress = quest.step;
    if (step.reward) {
      const paid = await pay?.({
        id: `${quest.id}:${step.id}`,
        kind: ONBOARD_KIND,
        title: step.name,
        giverName: quest.giverName,
        reward: { kind: 'coin', ...step.reward },
      });
      const bits = [
        paid?.gold ? `${paid.gold} gold` : null,
        paid?.xp ? `${paid.xp} xp` : null,
      ].filter(Boolean);
      log?.(`${step.name} — done.${bits.length ? ` ${bits.join(', ')}.` : ''}`, 'good');
    } else {
      log?.(`${step.name} — done.`, 'good');
    }
    awardResearch(research, `onboarding:${step.id}`, step.research || 0);
    // the last step finishes the QUEST; it is handed in at the giver or from the journal, which is
    // also what clears the giver's cached offer so they have real work for you next time
    if (quest.step >= steps.length) {
      quest.done = true;
      if (data.finished) log?.(data.finished, 'level');
    }
    save?.();
  }

  /** One pass: is the step the player is on finished? Keeps going while it is. */
  async function advance() {
    const quest = find();
    if (!quest || quest.done || quest.turnedIn) return;
    const facts = readFacts(game);
    let guard = steps.length + 1;
    while (guard-- > 0) {
      const step = stepOf(quest, data);
      if (!step || !stepDone(step, facts)) break;
      await completeStep(quest, step);
      if (quest.done) break;
    }
    /**
     * THE STEP WRITES ITSELF ONTO THE QUEST.
     *
     * `stepName` and `stepHud` are a copy of what `data/onboarding.json` says, kept on the quest
     * object. That is denormalised on purpose: js/questhelp.js is pure and has never been handed a
     * data file, and giving it one so it could look a step up would mean every caller of
     * `helperFor` — including the frame loop and four tests — learning about onboarding. A quest
     * that can describe itself needs none of that, and it survives the save for free.
     */
    const now = stepOf(quest, data);
    quest.stepName = now?.name || null;
    quest.stepHud = now?.hud || null;
    // announce the new step once, and only once — `lastStep` is what stops the line repeating
    // itself every half second, which is the failure mode of every hint system ever written
    if (!quest.done && quest.step !== lastStep) {
      lastStep = quest.step;
      if (now) log?.(`${now.name}. ${now.hud}.`, 'level');
    }
  }

  return {
    /** Is the line wired up and pointing at real things? */
    get live() { return live; },
    get data() { return data; },
    get audit() { return audit; },
    /** The quest in the log, or null. */
    get quest() { return find(); },
    /** The step it is on, or null. */
    get step() { return find() ? stepOf(find(), data) : null; },

    /**
     * Called once a frame from main.js. Throttled in here rather than at the call site so the cost
     * of the line is this module's business and not something a future edit to the loop can undo.
     */
    tick(dt = 0) {
      if (!live || working) return;
      since += dt;
      if (since < every) return;
      since = 0;
      working = true;
      Promise.resolve(advance())
        .catch(err => console.warn('onboarding: advance threw', err))
        .finally(() => { working = false; });
    },

    /**
     * THE LINE UNDER THE HEALTH BARS.
     *
     * Two states. Before the job is taken it points at the town and says why to go there — the
     * player has to be TOLD where the town is, because "walk until you see one" is the answer the
     * game gave before round 10 and it is not an answer. After it is taken it is the step, and the
     * step always names the key.
     *
     * Returns null the moment the line is over, which hands the strip straight back to the marker
     * book. It never holds the line hostage.
     */
    objective() {
      if (!live) return null;
      const quest = find();
      if (quest && !quest.done && !quest.turnedIn) {
        const step = stepOf(quest, data);
        if (step) return { name: step.name, where: step.hud, onboarding: true, stepId: step.id };
        return null;
      }
      if (quest || finishedAlready()) return null;       // taken, or finished — say nothing
      /**
       * `readFacts` once, not three times: this runs on every HUD redraw, which is every frame, and
       * it walks the store pools and the build ledger. One pass is cheap; three is three times a
       * frame for a line that is only on screen for the first ten minutes of a run.
       */
      const facts = readFacts(game);
      if (!offerFor({ level: facts.level, facts })) return null;
      const town = facts.town;
      if (!town) return null;
      return {
        name: town.inside ? `Find work in ${town.name}` : `Walk to ${town.name}`,
        where: town.inside ? 'E to talk · somebody here has a job' : `${away(town.away)} · somebody there has work`,
        onboarding: true, stepId: 'offer',
      };
    },

    /** For the tests and the debug menu: run one pass right now, no throttle. */
    check: () => advance(),
  };
}
