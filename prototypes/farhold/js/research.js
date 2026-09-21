// Farhold — research: four ages, seven nodes, and Age 1 is not one of them.
//
//   "Since I still can't craft an iron ingot, I can't build a chest, so I can't complete the
//    building onboarding. This feedback is all low-tech in comparison. There are some high-tech
//    options in the building menu so it's clear we'll need a research system… basically unlock all
//    low tech gear from the start and then iron-age tier 2 and steel-age tier 3 and rocket-age
//    tier 4."
//
// THE RULE THIS FILE EXISTS TO KEEP, and it is the first line of the module rather than a footnote:
// **a structure is locked only if it says which node unlocks it.** `lockReason(id)` reads
// `def.tech` out of data/structures.json and nothing else. No key, no lock. So the default for
// anything anybody adds to the catalogue later is "you can build it", and the failure mode of
// forgetting is a piece that is too cheap rather than a player who lands on a planet and cannot
// build a box. Getting that default backwards is exactly how the deadlock in the quote happened.
//
//   import { createResearch, sharedResearch } from './research.js';
//   const research = createResearch({ data, catalogue });
//   research.award('boss', 1);            // three points
//   research.buy('ironworking');          // { ok, why }
//   research.lockReason('smelter');       // null once it is bought
//
// PURE: no DOM, no Three.js, no fetch of its own unless you ask for one. `node --test` drives the
// same code the game does by handing `data` in.
//
// ------------------------------------------------------------------------------------------------
// WHERE THE POINTS COME FROM, AND WHY IT IS ONE FUNCTION
//
// Quests, exploring and bosses live in three files this module must not import (and, this round,
// must not even edit). So there is exactly one entry point — `award(reason, n)` — and each of those
// three call sites is a single line. Anything that can name a reason can pay into it; nothing has to
// know what a node costs or what an age is.
//
// A reason the data has never heard of is still worth `points.default` and is still counted in the
// ledger. A point quietly worth nothing is worse than a point worth one, because the first is a bug
// you find six months later and the second is a number somebody can tune.

/**
 * The tree, with everything filled in. Handed `null` it still works — you get a research system
 * with no nodes in it, which locks nothing, which is the safe direction to fail in.
 */
export function createResearch({ data = null, catalogue = null, log = null } = {}) {
  let DATA = data || { ages: [], nodes: [], points: {}, reasons: {} };
  let byId = new Map();
  let byStructure = new Map();

  /** Points earned, points spent, and where each one came from. */
  let earned = 0;
  let spent = 0;
  const ledger = Object.create(null);
  const taken = new Set();

  function reindex() {
    byId = new Map((DATA.nodes || []).map(n => [n.id, n]));
    byStructure = new Map();
    for (const n of DATA.nodes || []) {
      for (const sid of n.unlocks || []) byStructure.set(sid, n.id);
    }
  }
  reindex();

  /**
   * Swap the tree in after it has been fetched.
   *
   * The screen may well have drawn itself once already (see `load` below and `sharedResearch`), so
   * anything already bought or earned is KEPT. Only the shape of the tree changes.
   */
  function setData(next) {
    if (!next) return DATA;
    DATA = next;
    reindex();
    return DATA;
  }

  const nodeOf = id => byId.get(id) || null;
  const ageOf = id => (DATA.ages || []).find(a => a.id === id) || null;

  // ---------------------------------------------------------------- points

  /**
   * Somebody did something worth a point. THE only way points come into being.
   *
   * `reason` is a plain string — 'quest', 'region', 'landmark', 'boss', 'worldboss', 'story',
   * 'instance', 'planet' — and `n` is how many of that thing happened, NOT how many points to
   * award: the value of one is data/research.json's business. `award('boss', 2)` for two bosses is
   * six points, and the caller never has to know that.
   */
  function award(reason = 'default', n = 1) {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    if (!count) return 0;
    const per = (DATA.points || {})[reason] ?? (DATA.points || {}).default ?? 1;
    const gained = per * count;
    earned += gained;
    ledger[reason] = (ledger[reason] || 0) + count;
    if (gained > 0 && log) {
      log(`${gained} research point${gained === 1 ? '' : 's'}. ${available()} to spend.`, 'level');
    }
    return gained;
  }

  const available = () => Math.max(0, earned - spent);

  /** "3 bosses killed · 4 regions found" — the ledger as rows, biggest first. */
  function ledgerRows() {
    const names = DATA.reasons || {};
    return Object.entries(ledger)
      .map(([reason, count]) => ({
        reason,
        name: names[reason] || names.default || reason,
        count,
        points: ((DATA.points || {})[reason] ?? (DATA.points || {}).default ?? 1) * count,
      }))
      .sort((a, b) => b.points - a.points);
  }

  // ---------------------------------------------------------------- the tree

  const isTaken = id => taken.has(id);

  /** Every node this one waits on that has not been bought yet. */
  function missingNeeds(node) {
    return (node?.needs || []).filter(id => !taken.has(id));
  }

  /**
   * May this node be bought right now, and if not, the reason AS A SENTENCE.
   *
   * Two refusals and they are different in kind: one is "go and do something", the other is "buy
   * that one first". Collapsing them into a grey button is the one answer a player cannot act on,
   * which is the house rule this project keeps relearning.
   */
  function canBuy(id) {
    const node = nodeOf(id);
    if (!node) return { ok: false, why: 'There is no such thing to research.' };
    if (taken.has(id)) return { ok: false, why: 'Already researched.', done: true };
    const need = missingNeeds(node);
    if (need.length) {
      const names = need.map(x => nodeOf(x)?.name || x).join(' and ');
      return { ok: false, why: `${names} first.`, blocked: true };
    }
    const short = (node.cost || 0) - available();
    if (short > 0) return { ok: false, why: `${short} more research point${short === 1 ? '' : 's'}.`, short };
    return { ok: true, why: '' };
  }

  function buy(id) {
    const test = canBuy(id);
    if (!test.ok) return test;
    const node = nodeOf(id);
    spent += node.cost || 0;
    taken.add(id);
    if (log) log(`${node.name} researched. ${(node.unlocks || []).length} new thing${(node.unlocks || []).length === 1 ? '' : 's'} on the build list.`, 'good');
    return { ok: true, node };
  }

  /**
   * EVERYTHING, AT ONCE — for the Settings → Debug menu, the balance harness and the browser suite.
   *
   * It is not a cheat so much as a necessity: a Playwright spec that wants to prove a Drill delivers
   * ore should not first have to play eight hours of quests, and a spec that fails because a
   * structure it placed in round 11 is now behind a node is a spec telling you nothing about drills.
   * It spends no points and earns none — the nodes are simply taken.
   */
  function unlockAll() {
    for (const n of DATA.nodes || []) taken.add(n.id);
    return taken.size;
  }

  // ---------------------------------------------------------------- what is locked

  /**
   * WHY THIS PIECE IS GREY, or null if it is not.
   *
   * `idOrDef` may be a structure id or a whole catalogue row, because half the callers have one and
   * half have the other and neither should have to look the other up. The sentence names the node
   * AND the age, because "Ironworking" on its own means nothing to somebody who has not opened the
   * Research screen yet.
   */
  function lockReason(idOrDef) {
    const def = typeof idOrDef === 'string'
      ? (catalogue?.structures || []).find(s => s.id === idOrDef) || { id: idOrDef, tech: byStructure.get(idOrDef) }
      : idOrDef;
    if (!def) return null;
    const techId = def.tech || byStructure.get(def.id);
    if (!techId) return null;                       // no key, no lock — the rule at the top
    if (taken.has(techId)) return null;
    const node = nodeOf(techId);
    if (!node) return null;                         // a `tech` naming nothing must not brick a piece
    const age = ageOf(node.age);
    return {
      node: node.id,
      name: node.name,
      age: age?.name || '',
      cost: node.cost || 0,
      text: `Locked — research ${node.name}${age ? ` (${age.name})` : ''}, ${node.cost || 0} point${(node.cost || 0) === 1 ? '' : 's'}.`,
    };
  }

  /** The plain question, for anything that only wants a yes or a no. */
  const allows = idOrDef => !lockReason(idOrDef);

  /** A recipe the tree has granted on top of data/refining.json's learn-by-doing unlocks. */
  function grantsRecipe(recipeId) {
    for (const n of DATA.nodes || []) {
      if (!(n.grants || []).includes(recipeId)) continue;
      return taken.has(n.id);
    }
    return true;                                    // not named by any node = not gated by the tree
  }

  // ---------------------------------------------------------------- drawing it

  /**
   * Everything the screen needs, in one call and with no drawing in it: one row per age, one card
   * per node, each card carrying its own verdict and its own sentence.
   */
  function board() {
    const names = new Map((catalogue?.structures || []).map(s => [s.id, s.name]));
    return (DATA.ages || []).map(age => ({
      ...age,
      /** Age 1 has no nodes and that is the point — it is the name for everything never gated. */
      open: age.id === (DATA.ages || [])[0]?.id
        || (DATA.nodes || []).filter(n => n.age === age.id).every(n => missingNeeds(n).length === 0),
      nodes: (DATA.nodes || []).filter(n => n.age === age.id).map(n => {
        const test = canBuy(n.id);
        return {
          ...n,
          taken: taken.has(n.id),
          ok: test.ok,
          why: test.why,
          blocked: !!test.blocked,
          needNames: (n.needs || []).map(x => nodeOf(x)?.name || x),
          opens: (n.unlocks || []).map(id => names.get(id) || id.replace(/_/g, ' ')),
        };
      }),
    }));
  }

  /** The one line a HUD or a tab badge wants. */
  function summary() {
    const nodes = DATA.nodes || [];
    return {
      points: available(),
      earned, spent,
      taken: taken.size,
      total: nodes.length,
      /** How many nodes could be bought this instant — the number the tab badge shows. */
      ready: nodes.filter(n => canBuy(n.id).ok).length,
      age: [...(DATA.ages || [])].reverse().find(a =>
        (nodes.filter(n => n.age === a.id).length > 0)
        && nodes.filter(n => n.age === a.id).every(n => taken.has(n.id)))?.name
        || (DATA.ages || [])[0]?.name || '',
    };
  }

  // ---------------------------------------------------------------- the save

  function toJSON() {
    return { v: 1, earned, spent, taken: [...taken], ledger: { ...ledger } };
  }
  function load(json) {
    if (!json) return false;
    earned = Number(json.earned) || 0;
    spent = Number(json.spent) || 0;
    taken.clear();
    for (const id of json.taken || []) taken.add(id);
    for (const k in ledger) delete ledger[k];
    Object.assign(ledger, json.ledger || {});
    return true;
  }

  return {
    award, buy, canBuy, lockReason, allows, grantsRecipe, board, summary,
    ledgerRows, setData, toJSON, load,
    isTaken, unlockAll,
    get points() { return available(); },
    get data() { return DATA; },
    get catalogue() { return catalogue; },
    set catalogue(c) { catalogue = c; },
    nodeOf, ageOf,
    get nodes() { return DATA.nodes || []; },
  };
}

// ---------------------------------------------------------------------------- the one in the game

/**
 * ONE RESEARCH STATE, REACHED FROM ANYWHERE, AND WHY IT IS A SINGLETON.
 *
 * Research is read in four places that do not know about each other: js/buildplan.js (may this be
 * placed), js/build-ui.js (why is this row grey), js/research-ui.js (the screen) and — through
 * `award` — the quest, exploration and boss code. Threading one object through all of them would
 * mean adding a constructor argument to js/main.js's `createBuild`, `createBuildPlan` and
 * `createBuildUI` calls, and js/main.js belongs to another pair of hands this round.
 *
 * So there is one, here, and everybody asks for it by name. A node test that wants its own isolated
 * tree calls `createResearch` directly and is unaffected; `resetShared()` exists for the tests that
 * want to drive the shared one.
 */
let shared = null;

export function sharedResearch(opts = null) {
  if (!shared) {
    shared = createResearch(opts || {});
    if (!opts?.data) loadResearchData().then(d => d && shared.setData(d)).catch(() => {});
  } else if (opts?.data) {
    shared.setData(opts.data);
  }
  if (opts?.catalogue) shared.catalogue = opts.catalogue;
  return shared;
}

/** For tests, and for a new game that should not inherit the last one's ages. */
export function resetShared() { shared = null; return null; }

/**
 * Fetch data/research.json, once, without anybody having to add it to js/main.js's data bundle.
 *
 * Guarded on `document` rather than on `fetch`, because node has `fetch` and would happily try a
 * `file:` URL and throw. In node the tree is handed in by the test instead.
 */
let pending = null;
export function loadResearchData() {
  if (pending) return pending;
  if (typeof document === 'undefined') return Promise.resolve(null);
  const url = new URL('../data/research.json', import.meta.url);
  pending = fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
  return pending;
}
