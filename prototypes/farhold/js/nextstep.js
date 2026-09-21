// Farhold — the one thing to do next, whatever state your base is in.
//
//   "I don't really know how to get iron ore or how to transport ore to my base for refining."
//   "I have stone and clay and I built a furnace. Now what?"
//
// The build panel already had a six-line "Starting a base" list, and it was written for exactly this
// problem — but it **deletes itself the moment anything at all is standing** (`drawSteps`: `if
// (started) return`). Which means it is on screen for the one minute you do not need it and gone for
// the hour you do: the player above had built a furnace, so the guidance had already vanished, and
// the question it would have answered is the question they were asking.
//
// So this is the same idea that never goes away. It looks at what you actually have and returns ONE
// step — the first unfinished link in the chain from bare ground to refined metal — with the reason
// it is next and where to do it. Not a tutorial, not a quest chain: a sentence that is always true.
//
// The rules it encodes are the real ones, taken from the data rather than written down a second
// time: clay is at the water's edge because `clay_bank` says `nearWater`, a furnace needs fuel
// because `data/refining.json` gives it a `fuels` block, a hardness-2 seam needs a steel tool
// because `kindsForBiome` says so.
//
// PURE: no DOM, no Three.js, no imports from the game. Everything it needs is passed in, which is
// what lets `tests/nextstep.test.js` walk a player through the whole chain in a loop.
//
//   import { nextStep } from './nextstep.js';
//   const step = nextStep({ have, entries, machines, drills, tool, scanned });
//   step.text   // "Press E on the Furnace and queue Iron Ingot."
//   step.why    // "You have iron ore and nothing is smelting it."

/**
 * The chain, in order. The FIRST rule whose `when` is true is the answer.
 *
 * Order is the whole design: every rule assumes everything above it is already done, so each one
 * only has to ask its own question. Put a rule in the wrong place and it will fire while its own
 * prerequisite is missing, which is how a hint tells you to smelt ore you cannot mine yet.
 */
export const STEPS = [
  {
    id: 'tool',
    when: c => c.toolTier <= 0,
    text: 'Put a weapon in your hand — that is your tool.',
    why: 'Bare hands barely scratch anything. Any weapon at all makes you a tier-1 tool; there is no separate tool slot.',
    where: 'Character sheet · Worn',
  },
  {
    id: 'gather',
    /**
     * Only while you are still starting. A player who has a crate and a furnace and has just spent
     * their last plank does not need to be told what timber is — they need to be told the furnace
     * is cold, which is four rules down. Scoping this to "before there is a store" is what stops
     * the opening hint firing over an established base, which the test caught on its first run.
     */
    when: c => !c.hasStore && c.have('log') < 4 && c.have('stone') < 6,
    text: 'Swing at a tree and at a boulder.',
    why: 'Everything you build starts as timber and stone, and both come off the land with the weapon you are carrying.',
    where: 'Anywhere with trees',
  },
  {
    id: 'store',
    when: c => !c.hasStore,
    text: 'Build a Storage Crate.',
    why: 'A crate is what makes a pile of materials shared: anything you build within reach of one can spend what is in it, and a drill can deliver to it.',
    where: 'Build mode (B) · Storage',
  },
  {
    id: 'clay',
    when: c => c.have('clay') < 10 && !c.hasSmelter,
    text: 'Dig clay at the water\'s edge.',
    why: 'A Furnace costs clay and so does a Kiln, and clay banks only form beside water — marsh, riverbank, lakeshore or beach. It needs no tool at all.',
    where: 'Map · Find · sweep for Clay',
  },
  {
    id: 'furnace',
    when: c => !c.hasSmelter,
    text: 'Build a Furnace.',
    why: 'Ore is not metal. Everything past the first few structures wants ingots, and a furnace is the first thing that makes any.',
    where: 'Build mode (B) · Refining',
  },
  {
    id: 'fuel',
    when: c => c.hasSmelter && !c.hasFuel,
    text: 'Put fuel in the store beside the furnace.',
    why: 'A furnace burns charcoal, coal or plain logs. With nothing to burn it stands cold however much ore you give it.',
    where: 'Chop wood, or burn logs to charcoal at a campfire',
  },
  {
    id: 'findore',
    when: c => c.have('iron_ore') < 1 && !c.hasDrill,
    text: 'Find an iron seam and swing at it.',
    why: 'Iron ore comes out of an ore outcrop — hills, mountains, badlands and open grassland. A plain iron weapon is tool enough for one.',
    where: 'Map · Find · sweep for Iron Ore',
  },
  {
    id: 'smelt',
    when: c => c.have('iron_ore') >= 1 && !c.smelting,
    text: 'Press E on the Furnace and queue Iron Ingot.',
    why: 'You have ore and nothing is smelting it. E on any machine opens what it can make.',
    where: 'Walk up to the furnace',
  },
  {
    id: 'drill',
    when: c => !c.hasDrill && c.have('iron') >= 6,
    text: 'Build a Small Drill on a seam.',
    why: 'Six iron ingots, no power needed. It works the seam while you are somewhere else, which is the whole point of having a base.',
    where: 'Build mode (B) · Refining',
  },
  {
    id: 'route',
    when: c => c.hasDrill && !c.hasRoute,
    text: 'Put a crate near the drill.',
    why: 'A drill fills a small stockpile and then stops. Standing in a store pool it delivers straight away; further off it finds its own route and the load takes a while.',
    where: 'Build mode (B) · Storage',
  },
  {
    id: 'link',
    when: c => c.outposts >= 2 && !c.hasLink,
    text: 'Link the far outpost back to your base.',
    why: 'Two clusters of your own buildings are two outposts. A supply route carries goods between them on a clock — a road along the way makes it much quicker.',
    where: 'Map (M) · Supply',
  },
  {
    id: 'power',
    when: c => c.hasDrill && !c.hasPower,
    text: 'Build a Burner Generator.',
    why: 'Everything past the hand-cranked rungs wants power: the real Drill, the smelter, the assembler. A generator beside a crate of coal runs them all.',
    where: 'Build mode (B) · Power',
  },
];

/**
 * What to do next. Returns null when every rule above is satisfied — which is not "you have won",
 * it is "the chain this knows about is complete and you are on your own now", and the caller should
 * say so in those words rather than showing nothing.
 */
export function nextStep(ctx = {}) {
  const c = {
    have: ctx.have || (() => 0),
    toolTier: ctx.toolTier ?? 0,
    hasStore: !!ctx.hasStore,
    hasSmelter: !!ctx.hasSmelter,
    hasFuel: !!ctx.hasFuel,
    hasDrill: !!ctx.hasDrill,
    hasRoute: !!ctx.hasRoute,
    hasPower: !!ctx.hasPower,
    hasLink: !!ctx.hasLink,
    smelting: !!ctx.smelting,
    outposts: ctx.outposts ?? 0,
  };
  for (const s of STEPS) {
    if (s.when(c)) return { id: s.id, text: s.text, why: s.why, where: s.where };
  }
  return null;
}

/** How far down the chain you are, for a progress line. Counts the rules that no longer fire. */
export function chainProgress(ctx = {}) {
  const step = nextStep(ctx);
  const at = step ? STEPS.findIndex(s => s.id === step.id) : STEPS.length;
  return { done: at, total: STEPS.length, step };
}
