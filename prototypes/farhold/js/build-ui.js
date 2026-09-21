// Farhold — the panel that comes up when you press B.
//
// "How does build mode work? How do I start building a base?"
//
// Build mode worked before this file existed, in the sense that every key did what it was supposed
// to. But pressing B put a green ghost on the grass and nothing else: no list of what you can build,
// no prices, no tools, and no way to find out but reading BUILD-MODE.md. A ghost is not an
// interface. This is the interface.
//
// It is its own overlay rather than a tab of js/hud.js, for the same reason the map is: it is up
// only while a mode is, it wants the whole right-hand side of the screen while it is, and hud.js is
// three thousand lines already.
//
//   import { createBuildUI } from './build-ui.js';
//   const ui = createBuildUI({ catalogue, build, store, onPick });
//   document.body.append(ui.root);
//   ui.setOpen(true);       // B
//   ui.tick();              // once every few frames while it is open
//
// `store.have(id)` is the same callback build mode pays costs out of, so what the panel says you
// have is exactly what the placement will find.

import { el } from '../../../shared/ui.js';
import { createStationScreen, drawStationBody } from './station-ui.js';
import { createResearchScreen } from './research-ui.js';
import { sharedResearch } from './research.js';

/**
 * The tools, in the order a base is actually built.
 *
 * Smoothing first, deliberately: almost nothing in the catalogue will sit on Farhold's raw ground
 * (§4.11 — most pieces want a 1-in-5 bank and the planet is rarely that), so a player who tries the
 * list top-down and gets "the ground is too steep" four times has been failed by the ordering, not
 * by the game.
 *
 * R17 ADDED `kind`, AND IT IS THE WHOLE OF THE SECOND HALF OF THE PANEL COMPLAINT.
 *
 *   "The build menu itself could use some work. For example it shows a list of building category
 *    buttons and a list of buildings even if the 'Place' option is not selected. If I select
 *    'Scan', it shouldn't show those placement options."
 *
 * Quite right, and it was not a display bug so much as a missing fact: nothing in this file knew
 * which tools PLACE something. The category row, the catalogue and the detail card were simply
 * always drawn. `kind` is that fact, stated once:
 *
 *   place  — the catalogue is the point (Place, Road, Wall; a road and a wall are still a choice of
 *            WHICH piece, so they keep the list and it is filtered to their own family).
 *   brush  — a circle of ground. Size, not catalogue.
 *   scan   — the sweep and what it found.
 *   point  — you aim it at a thing that is already standing. Nothing to choose beforehand.
 */
export const TOOLS = [
  { key: 'smooth', name: 'Level', kind: 'brush', hint: 'Flatten a circle of ground to the height under the cursor. Do this first.' },
  { key: 'build', name: 'Place', kind: 'place', hint: 'Put the selected piece down. Scroll to turn it.' },
  { key: 'road', name: 'Road', kind: 'place', cats: ['road'], hint: 'Click a corner, then another, then press Enter. It lays one smooth road, not a row of tiles — the ground comes up to meet it and the corners round themselves. Goods travel far quicker over one.' },
  { key: 'wall', name: 'Wall', kind: 'place', cats: ['defence'], hint: 'Same as Road, but a wall — and a gate goes where you double back over a corner.' },
  { key: 'raise', name: 'Raise', kind: 'brush', hint: 'Pull the ground up under the brush.' },
  { key: 'lower', name: 'Lower', kind: 'brush', hint: 'Push it down. A moat is a lowered ring.' },
  { key: 'clear', name: 'Clear', kind: 'brush', hint: 'Fell every tree, bush and boulder in the brush, and keep what they drop. [ and ] size the brush.' },
  /**
   * The scanner. It comes before Take down because finding a seam is an early-game job and
   * deconstructing is a late one.
   */
  { key: 'scan', name: 'Scan', kind: 'scan', hint: 'Sweep for ore, stone, clay and timber. [ and ] widen the sweep. What it finds is listed below and pinned to the map.' },
  { key: 'remove', name: 'Take down', kind: 'point', hint: 'Deconstruct what you point at. Most of the cost comes back.' },
  /**
   * The route tool: click a drill, then click a store.
   *
   * It is a build-mode tool rather than a panel button because the two things it joins are both
   * standing in the world, and picking them off a list would mean naming forty crates.
   */
  { key: 'route', name: 'Route', kind: 'point', hint: 'Click a drill, then a store. How far apart they are decides how fast the ore moves.' },
];

/** The tool that is up, as a row of the table above. Falls back to Place, which is the default. */
export const toolInfo = key => TOOLS.find(t => t.key === key) || TOOLS.find(t => t.key === 'build');

/**
 * WHICH CATEGORIES THE TOOL THAT IS UP CAN ACTUALLY USE — the whole of the panel-tidy rule, and it
 * is a pure function so `node --test` can check it without a browser.
 *
 * Place gets all of them. Road and Wall get their own family and nothing else, because picking a
 * Statue while the Road tool is up was only ever a way to make the panel quote a price for
 * something the tool would never lay. Every other tool gets NONE, and the category row, the
 * catalogue and the detail card then draw nothing at all.
 */
export function catsForTool(toolKey, catKeys = []) {
  const info = toolInfo(toolKey);
  if (info.kind !== 'place') return [];
  if (!info.cats) return [...catKeys];
  return catKeys.filter(k => info.cats.includes(k));
}

/**
 * R17 — this panel's own stylesheet, loaded by this module, the way civics.css and station.css are.
 * Only the rules this round added: the `hidden` tool rail, a locked catalogue row and two buttons.
 * Everything the panel already looked like is still style.css's.
 */
const CSS_HREF = 'buildpanel.css';

/**
 * THE FIRST THING A NEW PLAYER NEEDS IS NOT A CATALOGUE, IT IS A SENTENCE.
 *
 * Six steps, in order, in the words the panel's own buttons use. It sits above the list and goes
 * away for good once anything at all is standing, because the answer to "how do I start a base"
 * stops being useful the moment you have one.
 *
 * Round 13 added the first and the fifth. The first, because every step after it spends materials
 * and nothing anywhere said where materials come from — and "your weapon is your tool" is a rule a
 * player has no way to guess. The fifth, because the scanner and the self-routing drill are the
 * whole of getting ore without standing over it.
 *
 * ROUND 14 DELETED THE THIRD. It said *"choose Claim Stone under Waypoint, and put it in the middle.
 * The ground is yours now"* — and it was the instruction that led straight into the deadlock the
 * user hit, because the stone cost two iron ingots and iron needed a furnace and a furnace needed
 * the stone. There is no permit any more. You build where you like, and a cluster of things you
 * built becomes an outpost because it IS one.
 */
const FIRST_STEPS = [
  'Materials come off the land: swing at a tree for timber, a boulder for stone, a seam for ore. Your weapon is your tool.',
  'Pick Level, aim at flat-ish ground and click. Whatever is growing there comes down and you keep it. That is your plot.',
  /**
   * R17 REWROTE THE THIRD AND ADDED THE FOURTH, and the reason is the deadlock the round opened on.
   * It used to say "put down a Furnace and a Storage Crate" — and the crate cost six planks, which
   * came off a Sawmill, which cost eight iron ingots, which came out of the Furnace. The Crafting
   * Table is the rung that was missing: logs and stone, its own shelf, and it splits planks.
   */
  'Pick Place and put down a Crafting Table — six logs and two stone. Walk up to it, press E, and split some logs into planks.',
  'Build a Storage Box out of six of those planks, then a Furnace beside it. Anything within reach of a store shares its pile.',
  'Press E at the Furnace, queue Smelt Iron, and hold E to work it. That is your first ingot — and a Storage Chest after it.',
  'Pick Scan to find the seams around you, then put a Small Drill on one — it finds its own way to your store.',
  'Far from home? Put a box out there too and link it back. The load takes a while; a road makes it much quicker.',
];

/**
 * R16 — WHAT A WHOLE GROUP OF PIECES IS FOR, above the list of them.
 *
 *   "Drills and similar resource extraction devices should be on their own building menu and are
 *    automated, separate from manufacturing devices which require work to be done by the player
 *    or NPC."
 *
 * Splitting the category was the easy half. The half that makes it mean something is SAYING what
 * the difference is, once, at the top of each list — because a player looking at a Drill and a
 * Furnace side by side has no way at all to know that one of them will quietly stop when nobody is
 * standing at it. Only the groups where there is something real to say have a line.
 */
const CAT_BLURB = {
  extract: 'These run themselves. Put one on a seam or in the water, give it power if it wants any, and it works while you are somewhere else. No worker, ever.',
  refine: 'These need somebody at them. Stand at one and hold E to work it, send one of your people, or — for the benches that take power — wire it to the grid and it pays its own way.',
  craft: 'Benches you use yourself. Walk up and press E.',
};

/** "12 stone, 2 iron" — and the ones you are short of are the ones that matter. */
function costLine(cost, have) {
  return Object.entries(cost || {})
    .map(([id, n]) => {
      const got = have(id);
      const name = id.replace(/_/g, ' ');
      return { text: `${n} ${name}`, short: got < n, got, need: n };
    });
}

export function createBuildUI({ catalogue = null, build = null, store = null, onLog = null, onClose = null, mining = null, scan = null, works = null, nearest = null, shipyard = null, garage = null, holding = null, workboard = null,
  /**
   * R16 — `{ list(), build(kind, id) }`. R17 moved the rows themselves out to the station screen
   * (js/station-ui.js `drawToolPanel`), where they are filtered by each row's own `at` bench; this
   * panel only passes the callbacks through.
   */
  tools = null,
  /**
   * R15 — `() => ({ text, why, where })`, or null when the chain is finished. See js/nextstep.js.
   * The panel does not work any of it out; it only draws whatever it is handed.
   */
  nextStep = null,
} = {}) {
  if (typeof document !== 'undefined' && !document.querySelector(`link[href="${CSS_HREF}"]`)) {
    document.head.appendChild(el('link', { rel: 'stylesheet', href: CSS_HREF }));
  }

  const pieces = catalogue?.structures || [];
  const categories = catalogue?.categories || {};
  const have = id => (store?.have ? store.have(id) : 0);

  /** Only the categories that actually have something in them, in the catalogue's own order. */
  const catKeys = Object.keys(categories).filter(k => pieces.some(p => p.cat === k));

  let open = false;
  let cat = catKeys.includes('waypoint') ? 'waypoint' : catKeys[0] || null;
  let pick = null;
  /** R16 — how many of a recipe one click queues. 0 is the standing order. See `drawBench`. */
  let batch = 1;

  const root = el('div', { class: 'build-ui hidden', id: 'build-ui' });
  const head = el('div', { class: 'build-head' });
  const steps = el('div', { class: 'build-steps' });
  const toolRow = el('div', { class: 'build-tools' });
  const catRow = el('div', { class: 'build-cats' });
  const listBox = el('div', { class: 'build-list' });
  /** §1 — what every drill is doing, and what is holding it up. Empty until you own a drill. */
  const minesBox = el('div', { class: 'build-mines' });
  /**
   * §1 — what the last sweep of the scanner turned up. Empty until you press Scan.
   *
   * Its OWN class, not `build-mines` as well. The file already learned this once with `build-yard`:
   * two sections sharing a class means `querySelector('.build-mines')` returns whichever happens to
   * be first in the document, and a test (or a stylesheet) meaning the drill list silently gets the
   * scanner. It looks identical, so it shares the LOOK — see `.build-scan` in style.css.
   */
  const scanBox = el('div', { class: 'build-scan' });
  /** What the brush tools have to say for themselves, now that they no longer borrow the catalogue. */
  const brushBox = el('div', { class: 'build-brush' });
  /** §2 — the bench you are standing next to, and what it can make. */
  const benchBox = el('div', { class: 'build-bench' });
  /** §9 — the pad, the four subsystems, the ship, and the tanks. */
  /**
   * Three sections share the `build-yard` LOOK — a heading and rows of button-plus-reason — so they
   * share the class. Each also carries its own, because `querySelector('.build-yard')` otherwise
   * returns whichever happens to be first in the document and a test (or a stylesheet) meaning the
   * shipyard silently gets the holding.
   */
  const yardBox = el('div', { class: 'build-yard build-shipyard' });
  /**
   * R17 — THE GARAGE AND THE TOOL BENCH ARE NOT IN THIS PANEL ANY MORE.
   *
   *   "It also has a 'Tools and devices' menu where I can craft a knapped tool… I think that menu
   *    should only open if you open a crafting table of some kind. There is also a garage menu…
   *    there should be a distinct Garage building where you manage that sort of thing."
   *
   * Both were sections of the build panel that appeared whenever you happened to stand near any
   * bench at all, which meant the panel was a menu of everything in the game at once and neither
   * one belonged to a building. They are STATIONS now (js/station-ui.js): the tools live at the
   * Crafting Table, the Anvil and the Workbench — filtered by the `at` key data/tools.json has
   * carried since the day it was written and nothing has ever read — and the garage lives at a
   * Garage, which you build. The two boxes are gone from the body below; nothing replaced them.
   */
  /** §6.5/6.8/6.9 — the people who live here, the fields they work, and the tax they pay. */
  const holdBox = el('div', { class: 'build-yard build-holding' });
  /** §6.6 — ten units of work, and who is putting them in. */
  const workBox = el('div', { class: 'build-yard build-work' });
  const detail = el('div', { class: 'build-detail' });
  const keys = el('div', { class: 'build-keys muted small' });
  /**
   * THE MIDDLE SCROLLS; THE HEAD AND THE KEY LINE DO NOT.
   *
   * There are nine sections that can be up at once — first steps, tools, catalogue, digging, the
   * bench you are at, the work board, the holding, the garage and the shipyard with the orbital
   * yard under it — and a base that has all of them is a base that has earned all of them. With
   * only the catalogue scrolling, the rest pushed past the bottom of a fixed-height panel and were
   * simply cut off, which is the same class of bug as the title screen the user could not see the
   * submit button on. The head and the key line stay put so the close button and the controls are
   * always reachable.
   */
  const body = el('div', { class: 'build-body' },
    steps, toolRow, catRow, listBox, brushBox, scanBox, minesBox, benchBox, workBox, holdBox, yardBox, detail);
  root.append(head, body, keys);

  /**
   * R17 — THE TWO SCREENS THIS PANEL IS THE DOOR TO.
   *
   * They are created here rather than in js/main.js for one plain reason: everything they need —
   * the works, the purse, the tool list, the garage, the shipyard, the work board — is already
   * handed to this panel, so wiring them here costs nothing and adds no argument to a call site in
   * somebody else's file. `openStation` is what js/main.js's E handler should call (see
   * research/round17-build-handoff.md); until it does, the bench section below carries a button
   * that opens the same screen, so neither of these is a finished module with no door.
   */
  const station = createStationScreen({
    catalogue, works, store, build, tools, garage, shipyard, workboard,
    onLog,
    /**
     * CLOSING THE STATION ONLY LEAVES BUILD MODE IF THE STATION WAS THE WHOLE REASON YOU WERE IN IT.
     *
     * `onClose` is js/main.js's `build.setMode(false); …; regrab()`. That is exactly right when E
     * opened the screen straight off the ground — the pointer has to come back. It is exactly wrong
     * when you opened it from the build panel's own bench section, because then the panel is still
     * up behind it and dropping out of build mode to close a sub-screen would be the game taking a
     * mode away you did not ask it to.
     */
    onClose: () => { if (!open) onClose?.(); },
  });
  const research = sharedResearch({ catalogue });
  const researchScreen = createResearchScreen({ research, log: onLog, standalone: true });

  head.append(
    el('h2', { text: 'Build' }),
    /**
     * R17 — the door to the Research screen, put where the question is asked. A player reading
     * "Locked — research Ironworking" on a catalogue row should not have to close build mode, open
     * the character sheet and find a tab; the tab still exists and is the main way in, and this is
     * the shortcut from the place that made you want it.
     */
    el('button', {
      class: 'build-research', text: 'Research',
      title: 'Four ages. Everything low-tech is yours from the start; the rest is bought with points you earn by finishing quests, finding places and killing things with names.',
      onclick: () => researchScreen.toggle(),
    }),
    /**
     * The × leaves BUILD MODE, not just the panel.
     *
     * Closing only the panel left the mode running with the pointer freed, no catalogue and no way
     * back except pressing B twice — a state the player has no name for and no way out of.
     */
    el('button', { class: 'build-close', text: '×', title: 'Close (B)', onclick: () => { api.setOpen(false); onClose?.(); } }),
  );
  keys.textContent = 'scroll turn · click place · Enter finish a run · Ctrl+Z undo · Esc or B leave · [ ] brush size';

  /**
   * R15 — THE GUIDANCE STOPPED EXACTLY WHEN IT STARTED BEING NEEDED.
   *
   *   "I have stone and clay and I built a furnace. Now what?"
   *   "I don't really know how to get iron ore or how to transport ore to my base for refining."
   *
   * `FIRST_STEPS` was written for precisely those two questions, and it deleted itself the moment
   * anything at all was standing — so it was on screen for the one minute you did not need it and
   * gone for the hour you did. Both players above had already built something.
   *
   * The list still goes when you have started, because six numbered lines over a base you have
   * already built is clutter. What replaces it is ONE step that never goes away: the first
   * unfinished link in the chain (js/nextstep.js), with why it is next and where to do it.
   */
  function drawSteps() {
    steps.replaceChildren();
    const started = (build?.entries || []).length > 0;

    if (!started) {
      steps.append(el('h3', { text: 'Starting a base' }));
      const ol = el('ol', { class: 'build-steplist' });
      for (const line of FIRST_STEPS) ol.append(el('li', { text: line }));
      steps.append(ol);
      return;
    }

    const next = nextStep?.();
    if (!next) {
      steps.append(el('div', { class: 'build-next done' },
        el('b', { text: 'Your base runs itself.' }),
        el('span', { class: 'small', text: 'Power, ore, smelting and a supply route are all in place. What you build past here is up to you.' })));
      return;
    }
    const card = el('div', { class: 'build-next' });
    card.append(el('span', { class: 'build-next-tag', text: 'Next' }));
    card.append(el('b', { text: next.text }));
    card.append(el('span', { class: 'small', text: next.why }));
    if (next.where) card.append(el('span', { class: 'build-next-where', text: next.where }));
    steps.append(card);
  }

  function drawTools() {
    toolRow.replaceChildren();
    for (const t of TOOLS) {
      const on = build?.tool === t.key;
      toolRow.append(el('button', {
        class: 'build-tool' + (on ? ' on' : ''),
        text: t.name,
        title: t.hint,
        onclick: () => { build?.setTool(t.key); redraw(); if (onLog) onLog(t.hint, ''); },
      }));
    }
  }

  /** R17 — see `catsForTool` above; this only supplies the tool that is up. */
  const toolCats = () => catsForTool(build?.tool, catKeys);

  function drawCats() {
    catRow.replaceChildren();
    const keys = toolCats();
    catRow.hidden = keys.length === 0;
    if (!keys.length) return;
    // a tool that narrows the list must also move the selection into it, or the panel shows a
    // heading for a category whose rows are not drawn
    if (!keys.includes(cat)) cat = keys[0];
    for (const key of keys) {
      catRow.append(el('button', {
        class: 'build-cat' + (key === cat ? ' on' : ''),
        text: categories[key].name || key,
        onclick: () => { cat = key; redraw(); },
      }));
    }
  }

  function drawList() {
    listBox.replaceChildren();
    const keys = toolCats();
    listBox.hidden = keys.length === 0;
    if (!keys.length) return;
    if (CAT_BLURB[cat]) listBox.append(el('p', { class: 'build-cat-blurb small muted', text: CAT_BLURB[cat] }));
    const rows = pieces.filter(p => p.cat === cat).sort((a, b) => (a.tier || 1) - (b.tier || 1) || a.name.localeCompare(b.name));
    for (const p of rows) {
      const parts = costLine(p.cost, have);
      const afford = parts.every(c => !c.short);
      /**
       * R17 — A LOCKED ROW IS SHOWN, AND IT SAYS WHICH NODE OPENS IT.
       *
       * Two rules, and they are the same rule the bench's locked recipes already follow. It is
       * SHOWN, because a piece you cannot see is a piece you will never go looking for and the
       * whole point of four ages is that you can see where the fourth one is. And it carries the
       * SENTENCE rather than going grey and silent, because a greyed-out row with no reason is the
       * one answer a player cannot act on.
       */
      const lock = build?.plan?.lockOf?.(p) || null;
      const row = el('button', {
        class: 'build-row' + (pick === p.id ? ' on' : '') + (lock ? ' locked' : afford ? '' : ' short'),
        title: lock ? lock.text : (p.desc || ''),
        onclick: () => {
          if (lock) { onLog?.(lock.text, 'warn'); return; }
          pick = p.id;
          build?.select(p.id);
          /**
           * Choosing a thing to build means you want to build it, so the tool follows the choice —
           * EXCEPT for the pieces that are laid as a run. A road or a palisade picked while the
           * Road or Wall tool is up is you choosing which road, not you asking to place one slab.
           */
          const runnable = p.cat === 'road' || p.cat === 'defence';
          const onRunTool = build?.tool === 'road' || build?.tool === 'wall';
          if (build?.tool !== 'build' && !(runnable && onRunTool)) build.setTool('build');
          redraw();
        },
      });
      row.append(
        el('span', { class: 'build-row-name', text: p.name }),
        el('span', { class: 'build-row-cost', text: lock ? lock.text : (parts.map(c => c.text).join(' · ') || 'free') }),
      );
      listBox.append(row);
    }
    if (!rows.length) listBox.append(el('p', { class: 'muted small', text: 'Nothing in this group yet.' }));
  }

  /**
   * R17 — WHAT A NON-PLACEMENT TOOL SAYS INSTEAD OF A CATALOGUE.
   *
   * The complaint was that the panel showed building categories while Scan was up. Hiding them is
   * only half the fix: what is left is an empty panel, which is no more of an answer. A brush tool
   * owns a radius and a sentence; a point tool owns a sentence. The scanner has its own section
   * lower down and already says what it found, so it gets nothing here.
   */
  function drawBrush() {
    brushBox.replaceChildren();
    const info = toolInfo(build?.tool);
    if (info.kind === 'place' || info.kind === 'scan') { brushBox.hidden = true; return; }
    brushBox.hidden = false;
    brushBox.append(el('h3', { text: info.name }));
    brushBox.append(el('p', { class: 'small muted', text: info.hint }));
    if (info.kind === 'brush' && build?.setRadius) {
      const r = Math.round(build.radius || 0);
      const bar = el('div', { class: 'build-yard-row build-brush-size' });
      bar.append(el('span', { class: 'muted small', text: `Brush ${r} m` }));
      for (const step of [-4, -1, 1, 4]) {
        bar.append(el('button', {
          class: 'build-tool', text: step > 0 ? `+${step}` : String(step),
          title: '[ and ] do the same thing without opening the panel.',
          onclick: () => { build.setRadius((build.radius || 0) + step); redraw(); },
        }));
      }
      brushBox.append(bar);
    }
  }

  function drawDetail() {
    detail.replaceChildren();
    // R17 — the detail card is about a piece you are placing, so it goes away with the catalogue.
    // See `toolCats`: a Scan sweep has nothing to say about the cost of a Storage Box.
    if (toolInfo(build?.tool).kind !== 'place') { detail.hidden = true; return; }
    detail.hidden = false;
    const p = pieces.find(x => x.id === pick);
    if (!p) {
      detail.append(el('p', { class: 'muted small', text: 'Pick something to see what it costs and what it does.' }));
      return;
    }
    detail.append(el('h3', { text: p.name }));
    if (p.desc) detail.append(el('p', { class: 'small', text: p.desc }));

    // …and if it is behind the tech tree, that is the first thing said about it, because no amount
    // of levelling or iron will change the answer
    const lock = build?.plan?.lockOf?.(p) || null;
    if (lock) {
      detail.append(el('p', { class: 'build-why', text: lock.text }));
      detail.append(el('button', {
        class: 'small', text: `Open Research`,
        onclick: () => researchScreen.show(),
      }));
    }

    // the cost, with the shortfall spelled out — "you are short of 4 iron" beats a red number
    const list = el('ul', { class: 'build-cost' });
    for (const c of costLine(p.cost, have)) {
      list.append(el('li', { class: c.short ? 'short' : '', text: `${c.text} — you have ${c.got}` }));
    }
    detail.append(list);

    /**
     * WHAT A BENCH IS FOR, WHERE YOU DECIDE TO BUILD ONE.
     *
     * The bench panel lower down lists what a machine can make — but only once you own it, which is
     * exactly backwards: the question "why would I build an Alloy Forge" is asked in the catalogue,
     * before the thing exists. `works.board(type)` answers it, and the same learn-by-doing lock the
     * bench shows is shown here, so a recipe you cannot run yet says what unlocks it rather than
     * being hidden and then turning up unannounced.
     */
    if (works?.machineDefs?.[p.id]) {
      const recipes = works.board(p.id) || [];
      const open = recipes.filter(r => r.unlocked);
      detail.append(el('p', { class: 'small', text:
        recipes.length
          ? `Makes ${recipes.length} thing${recipes.length === 1 ? '' : 's'} · ${open.length} you already know`
          : 'Makes nothing on its own.' }));
      const list = el('ul', { class: 'build-cost' });
      for (const r of recipes.slice(0, 8)) {
        const out = Object.keys(r.outputs || {}).map(k => k.replace(/_/g, ' ')).join(', ');
        list.append(el('li', {
          class: r.unlocked ? '' : 'short',
          text: r.unlocked ? `${r.name} → ${out}` : `${r.name} — ${r.unlock?.text || 'not learned yet'}`,
        }));
      }
      if (recipes.length > 8) list.append(el('li', { class: 'muted', text: `…and ${recipes.length - 8} more` }));
      detail.append(list);
    }

    const notes = [];
    /**
     * R16 — DOES THIS PIECE NEED A PERSON? The question is answered here, at the moment you decide
     * to build one, and it is answered out of the DATA rather than from a list of ids: a piece is
     * automated if it is not a js/refining.json machine, or if the machine it is has no `labour`
     * block at all. `auto: true` is the middle case — a bench that wants hands until it is wired.
     */
    const mdef = works?.machineDefs?.[p.id] || null;
    const lab = mdef?.labour || null;
    if (p.cat === 'extract') notes.push('Automated. Nobody works it — it digs on its own for as long as it has what it needs.');
    else if (mdef && !lab) notes.push('Automated once it is powered. Nobody stands at it.');
    else if (lab?.auto) notes.push('Needs a pair of hands — yours, holding E, or one of your people — until you wire it to the grid. Then it pays its own labour.');
    else if (lab) notes.push('Always needs somebody at it. Hold E to work it yourself, or house a worker who will.');
    if (p.power?.use) notes.push(`Draws ${p.power.use} kW. It will not run without a generator in reach.`);
    if (p.power?.make) notes.push(`Makes ${p.power.make} kW${p.power.burns ? `, burning ${p.power.burns}` : ''}.`);
    if (p.store?.slots) notes.push(`Holds ${p.store.slots} slots, shared with every store it can reach.`);
    // Round 14: it stakes nothing. You can build anywhere; this only puts a name on the place.
    if (p.claims) notes.push('Optional. Names this outpost and marks its middle.');
    if (p.waypoint) notes.push('Joins the waypoint network. You can travel back to it from anywhere.');
    if (p.slope != null) notes.push(`Wants ground no steeper than about 1 in ${Math.max(1, Math.round(1 / p.slope))}.`);
    for (const n of notes) detail.append(el('p', { class: 'small muted', text: n }));

    /**
     * A RUN TOOL SAYS WHERE IT HAS GOT TO.
     *
     * "The build Road tool doesn't seem to do anything." Half of that was the world — there was no
     * preview, which js/build.js now draws — and half was here: the panel showed the piece's cost
     * and the ghost's verdict, neither of which changes when you click a corner, so the panel was
     * as silent as the ground. Now the tool that is up owns this line.
     */
    if (build && (build.tool === 'road' || build.tool === 'wall')) {
      const n = (build.runPoints || []).length;
      const word = build.tool === 'wall' ? 'wall' : 'road';
      detail.append(el('p', {
        class: n >= 2 ? 'build-ok' : 'build-why',
        text: !n ? `Click the first corner of the ${word} on the ground.`
          : n === 1 ? 'One corner down. Click the next one.'
          : `${n} corners · press Enter to lay the ${word} · Esc to drop the run.`,
      }));
      if (build.tool === 'wall' && n >= 2) {
        detail.append(el('p', { class: 'small muted', text: 'Double back over a corner and the gate goes there.' }));
      }
      return;
    }

    /**
     * WHY THE GHOST IS RED.
     *
     * `build.lastCheck` already holds the sentence — "the ground is too steep here", "you are short
     * of 4 iron ingot" — and it was only ever printed into the log AFTER a failed click. Showing it
     * live beside the piece is the difference between a rule you learn and a rule you fight.
     */
    const why = build?.lastCheck;
    if (why && !why.ok && why.why) detail.append(el('p', { class: 'build-why', text: why.why }));
    else if (why?.ok) detail.append(el('p', { class: 'build-ok', text: 'Clear. Click to build.' }));
  }

  /**
   * Every drill, what it is digging, and — the part that matters — WHY it is not going faster.
   *
   * `limit` is one word: power, seam, no route, hauling, digging. A drill digging faster than its
   * route can carry is the interesting failure, because it looks like it is working: the stock
   * climbs and nothing arrives. One word beats any number beside it.
   */
  function drawMines() {
    minesBox.replaceChildren();
    const rows = mining?.overview?.() || [];
    if (!rows.length) return;
    minesBox.append(el('h3', { text: 'Digging' }));
    // R16 — the other half of the split, said where the drills are listed rather than only in the
    // catalogue: nothing on this list will ever ask you for a worker.
    minesBox.append(el('p', { class: 'small muted', text: 'Automated. None of these needs anybody at it — only power, a seam and somewhere to put what comes up.' }));
    for (const r of rows) {
      const line = el('div', { class: 'build-mine' });
      line.append(
        el('span', { class: 'build-mine-name', text: r.resourceName }),
        el('span', { class: 'build-mine-rate', text: `${r.digPerMinute}/min` }),
        el('span', { class: `build-mine-limit limit-${r.limit.replace(/ /g, '-')}`, text: r.limit }),
      );
      const note = r.route
        ? `route ${r.route.direct ? 'direct' : `${r.route.metres} m · ${r.route.perMinute.toFixed(1)}/min`}`
        : `${r.stock} piled up · no route`;
      line.append(el('span', { class: 'muted small', text: note }));
      minesBox.append(line);
    }
  }

  /**
   * WHAT THE SCANNER FOUND — the answer to "where is the iron on this planet".
   *
   * One row per material rather than one per seam: a sweep over half a kilometre turns up forty
   * outcrops and a list of forty is not an answer, it is a spreadsheet. The row carries the best of
   * that material within reach, judged by what it would DELIVER from where you are standing, which
   * is the same number js/resources.js has used to compare seams since it was written.
   *
   * "Pin it" drops a marker, so the thing you just found is on the map and the minimap with an
   * arrow on the rim when it is off the edge — exactly what js/markers.js was built for.
   */
  function drawScan() {
    scanBox.replaceChildren();
    const state = scan?.state?.();
    // up while the Scan tool is picked, or once a sweep has been made — never otherwise, or the
    // panel carries an empty heading for the whole game
    if (!state || (!state.swept && build?.tool !== 'scan')) return;
    scanBox.append(el('h3', { text: 'Deposits' }));
    if (!state.rows?.length) {
      scanBox.append(el('p', { class: 'small muted', text: state.swept
        ? `Nothing within ${Math.round(state.radius)} m. Walk somewhere else and sweep again.`
        : 'Pick Scan, aim at the ground and click.' }));
      return;
    }
    scanBox.append(el('p', { class: 'small muted', text: `${state.found} seams within ${Math.round(state.radius)} m · best of each` }));
    for (const row of state.rows) {
      const line = el('div', { class: 'build-mine' });
      line.append(
        el('span', { class: 'build-mine-name', text: row.resourceName }),
        el('span', { class: 'build-mine-rate', text: `${Math.round(row.distance)} m ${row.compass}` }),
        el('span', { class: `build-mine-limit limit-${row.band}`, text: row.bandName }),
        el('span', { class: 'muted small', text: `${row.deliveredPerMinute}/min delivered` }),
      );
      line.append(el('button', {
        class: 'small', text: row.pinned ? 'pinned' : 'pin it',
        onclick: () => { scan.pin(row.id); redraw(); },
      }));
      scanBox.append(line);
    }
  }

  /**
   * THE BENCH YOU ARE STANDING NEXT TO — and only that one.
   *
   * A base ends up with sixteen benches and listing all of them turns the panel into a spreadsheet.
   * Walking up to the one you want is already how every other interaction in Farhold works, so the
   * queue belongs to whatever is within a few metres. `nearest()` is supplied by the game, because
   * this file has no idea where the player is.
   *
   * R17 — THE CONTROLS ARE js/station-ui.js's, DRAWN INTO THIS BOX.
   *
   * The body of this section used to be a hundred and forty lines of switch, priority, work bar,
   * queue, batch row and recipe list, and the station screen needed every one of them. Two copies
   * of a recipe list is how a bench you reach with B starts behaving differently from the same
   * bench reached with E, which is exactly the sort of split this round exists to close. So there
   * is one renderer and two mounts, and it emits the same `build-recipe` markup it always did.
   */
  function drawBench() {
    benchBox.replaceChildren();
    const bench = nearest?.();
    if (!bench || !works) return;
    const m = works.get(bench.id);
    if (!m) return;
    const def = pieces.find(p => p.id === bench.key) || null;

    benchBox.append(el('h3', { text: m.name }));
    /**
     * THE BUTTON THAT IS THE STATION SCREEN'S GUARANTEED DOOR.
     *
     * E should open it, and js/main.js's E handler is one line away from doing so (see
     * research/round17-build-handoff.md). This button exists so that the screen is reachable
     * whether or not that line has been applied — this project's signature fault is a finished
     * module nothing calls, and "another agent will add the call site" is not a door.
     */
    benchBox.append(el('button', {
      class: 'small build-open-station',
      text: `Open the ${m.name}`,
      title: "The station's own screen: only what this one can make, and a way to run it.",
      onclick: () => { station.open(bench); },
    }));
    drawStationBody(benchBox, {
      entry: bench, def, works, store, build, tools, garage, shipyard, workboard, onLog,
      batch, setBatch: n => { batch = n; },
      redraw,
      compact: true,
    });
  }

  /**
   * THE SHIPYARD — the only screen that exists for §9, and the reason the sky opens.
   *
   * Shown when you are standing at an assembler (which is where three of the four subsystems are
   * built) or once you have started, so a player who has begun a ship can always find it again.
   * Everything here is a button with the refusal written on it: js/shipyard.js's `why` strings are
   * deliberately specific — "the assembler has not made a Drive Assembly yet" rather than "cannot
   * build" — and hiding them behind a disabled button throws all of that away.
   */
  function drawYard() {
    yardBox.replaceChildren();
    if (!shipyard) return;
    const state = shipyard.state();
    if (!state || (!state.atAssembler && !state.started)) return;

    yardBox.append(el('h3', { text: 'Shipyard' }));
    yardBox.append(el('p', { class: 'small muted', text: state.summary }));
    // §9.16 — one line saying what to do next, so the player is never guessing which of the seven
    // buttons below is the one that will actually move
    if (state.next) yardBox.append(el('p', { class: 'small', text: `Next: ${state.next}` }));

    const action = (label, note, run, ok) => {
      const row = el('div', { class: 'build-yard-row' });
      const b = el('button', { class: 'small', text: label, onclick: () => { run(); redraw(); } });
      b.disabled = !ok;
      row.append(b, el('span', { class: ok ? 'small' : 'small bad', text: note }));
      yardBox.append(row);
    };

    if (!state.pad) action('Build the pad', state.padWhy, () => shipyard.buildPad(), state.padOk);
    for (const part of state.parts) {
      action(part.done ? `Upgrade ${part.name}` : `Build ${part.name}`, part.why || part.costText, () => shipyard.buildPart(part.id), part.ok);
    }
    if (state.assembleOk || state.assembleWhy) {
      action('Put the ship together', state.assembleWhy || 'Everything is ready.', () => shipyard.assemble(), state.assembleOk);
    }
    action('Fill the tanks', state.fuelText, () => shipyard.refuel(), state.fuelOk);

    /**
     * §9.15 — the orbital yard, four modules, each lifted by a hauler.
     *
     * Only up once the gate is passable or something is already in orbit: a list of four things you
     * cannot touch for twenty hours of play is noise, and this panel has enough in it already.
     */
    if (state.station) {
      yardBox.append(el('h3', { text: state.station.name }));
      const bar = el('div', { class: 'build-work-bar' }, el('i', { style: `width:${Math.round(state.station.fraction * 100)}%` }));
      yardBox.append(bar);
      if (state.station.gateWhy) yardBox.append(el('p', { class: 'small bad', text: state.station.gateWhy }));
      for (const m of state.station.modules) {
        action(m.up ? `${m.name} ✓` : `Lift the ${m.name}`, m.note, () => shipyard.buildModule(m.id), m.ok);
      }
    }
  }


  /**
   * THE HOLDING — the people, the fields and the money.
   *
   * Only up once there is a bed, because a colony with nowhere to sleep is not a colony and a panel
   * of zeroes teaches nothing. Every number here is something the player built on purpose:
   * migration is a reward for a tidy place, never a random event, and the panel says which of the
   * four things it weighs is short.
   */
  function drawHolding() {
    holdBox.replaceChildren();
    if (!holding) return;
    const h = holding.state();
    if (!h || !h.show) return;

    holdBox.append(el('h3', { text: 'Holding' }));
    holdBox.append(el('p', { class: 'small muted', text: h.summary }));

    for (const offer of h.offers || []) {
      const row = el('div', { class: 'build-yard-row' });
      row.append(
        el('button', { class: 'small', text: 'Take them in', onclick: () => { holding.accept(offer.id); redraw(); } }),
        el('button', { class: 'small', text: 'Turn away', onclick: () => { holding.turnAway(offer.id); redraw(); } }),
        el('span', { class: 'small', text: `${offer.name}, ${offer.job}` }),
      );
      holdBox.append(row);
    }

    const act = (label, note, run, ok) => {
      const row = el('div', { class: 'build-yard-row' });
      const b = el('button', { class: 'small', text: label, onclick: () => { run(); redraw(); } });
      b.disabled = !ok;
      row.append(b, el('span', { class: ok ? 'small' : 'small bad', text: note }));
      holdBox.append(row);
    };
    act('Collect the tax', h.taxNote, () => holding.tax(), h.taxOk);
    act('Break a field here', h.fieldNote, () => holding.field(), h.fieldOk);
  }

  /**
   * THE WORK BOARD — §6.6, "10 units of work… supplied by the player working manually, by a
   * machine, or by an assigned NPC."
   *
   * js/work.js has done all of that from the day it landed and had no screen: you could not see an
   * order, put a swing into one, or point a citizen at it. The whole idea of the module is that a
   * unit is a unit whoever produced it, so the row shows where the units came FROM — that credit
   * line is the feature, not a decoration.
   */
  function drawWork() {
    workBox.replaceChildren();
    if (!workboard) return;
    const rows = workboard.list() || [];
    if (!rows.length) return;

    workBox.append(el('h3', { text: 'Work' }));
    const idle = workboard.idle?.() ?? 0;
    workBox.append(el('p', { class: 'small muted', text: idle ? `${idle} idle · click an order to put them on it` : 'Everybody is on something.' }));

    for (const o of rows) {
      const row = el('div', { class: 'build-work-row' });
      row.append(
        // `name` is what js/work.js's `createOrder` actually calls it — "Work the Furnace". A row
        // falling through to `o.tag` printed the word "refine" on every line of the board.
        el('span', { class: 'build-row-name', text: o.title || o.name || o.tag || 'work' }),
        el('span', { class: 'muted small', text: o.progress }),
      );
      // a bar, because "6.5 of 10" is a number and a bar is a glance
      const bar = el('div', { class: 'build-work-bar' }, el('i', { style: `width:${Math.round(o.fraction * 100)}%` }));
      row.append(bar);
      row.append(el('span', { class: 'muted small build-work-credit', text: o.credit || 'nobody has touched it' }));

      const tools = el('div', { class: 'build-yard-row' });
      tools.append(el('button', {
        class: 'small', text: 'Put your back into it',
        onclick: () => { workboard.swing(o.id); redraw(); },
      }));
      if (idle > 0) {
        tools.append(el('button', {
          class: 'small', text: 'Send somebody',
          onclick: () => { workboard.assign(o.id); redraw(); },
        }));
      }
      row.append(tools);
      workBox.append(row);
    }
  }

  function redraw() {
    if (!open) return;
    drawSteps(); drawTools(); drawCats(); drawList(); drawBrush(); drawScan(); drawMines();
    drawBench(); drawWork(); drawHolding(); drawYard(); drawDetail();
  }


  const api = {
    root,
    get isOpen() { return open; },
    get pick() { return pick; },
    setOpen(on) {
      open = !!on;
      root.classList.toggle('hidden', !open);
      if (open) redraw();
      return open;
    },
    /** Called from the frame loop while the mode is up: only the live bits change. */
    tick() {
      if (!open) return;
      drawDetail();
      drawScan();
      drawMines();
      drawBench();
      drawWork();
      drawHolding();
      drawYard();
      // R17 — the station screen has a live queue and a live work bar on it, and it is up while
      // the panel is, so it ticks with everything else rather than owning a clock of its own.
      station.tick();
    },
    /** A full rebuild — after a placement, when the bag changed, or when the tool did. */
    refresh: redraw,

    /**
     * R17 — THE DOOR js/main.js's E HANDLER SHOULD USE.
     *
     *   "I built a furnace… when I press E to open it it just opens the regular build menu."
     *
     * Hand it a build-ledger entry. It returns TRUE if that entry has a station screen and the
     * screen is now up, and FALSE if it is not a station at all — so the caller can fall through to
     * whatever else E does there. It is on this panel's API rather than on a module of its own
     * because js/main.js already holds a `buildUI` and nothing else has to be threaded anywhere.
     *
     * The exact three lines for js/main.js are in research/round17-build-handoff.md.
     */
    openStation(entry) {
      if (!entry) return false;
      if (station.isOpen && station.at?.id === entry.id) return true;   // E again is not a toggle
      return station.open(entry);
    },
    closeStation() { return station.close(); },
    get station() { return station; },

    /** R17 — the Research screen, for the hud tab wiring and for the tests. */
    get research() { return research; },
    get researchScreen() { return researchScreen; },
    openResearch() { researchScreen.show(); return researchScreen; },

    /** For the tests and the debug menu. */
    select(id) { pick = id; build?.select(id); redraw(); return pick; },
    get categories() { return catKeys; },
    /** R17 — which categories the tool that is up will actually draw. The panel-tidy rule, askable. */
    get toolCategories() { return toolCats(); },
    dispose() { root.remove(); station.dispose(); researchScreen.dispose(); },
  };
  return api;
}
