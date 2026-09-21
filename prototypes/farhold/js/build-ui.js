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

/**
 * The tools, in the order a base is actually built.
 *
 * Smoothing first, deliberately: almost nothing in the catalogue will sit on Farhold's raw ground
 * (§4.11 — most pieces want a 1-in-5 bank and the planet is rarely that), so a player who tries the
 * list top-down and gets "the ground is too steep" four times has been failed by the ordering, not
 * by the game.
 */
const TOOLS = [
  { key: 'smooth', name: 'Level', hint: 'Flatten a circle of ground to the height under the cursor. Do this first.' },
  { key: 'build', name: 'Place', hint: 'Put the selected piece down. Scroll to turn it.' },
  { key: 'road', name: 'Road', hint: 'Click a corner, then another, then press Enter. It lays one smooth road, not a row of tiles — the ground comes up to meet it and the corners round themselves. Goods travel far quicker over one.' },
  { key: 'wall', name: 'Wall', hint: 'Same as Road, but a wall — and a gate goes where you double back over a corner.' },
  { key: 'raise', name: 'Raise', hint: 'Pull the ground up under the brush.' },
  { key: 'lower', name: 'Lower', hint: 'Push it down. A moat is a lowered ring.' },
  { key: 'clear', name: 'Clear', hint: 'Fell every tree, bush and boulder in the brush, and keep what they drop. [ and ] size the brush.' },
  /**
   * The scanner. It comes before Take down because finding a seam is an early-game job and
   * deconstructing is a late one.
   */
  { key: 'scan', name: 'Scan', hint: 'Sweep for ore, stone, clay and timber. [ and ] widen the sweep. What it finds is listed below and pinned to the map.' },
  { key: 'remove', name: 'Take down', hint: 'Deconstruct what you point at. Most of the cost comes back.' },
  /**
   * The route tool: click a drill, then click a store.
   *
   * It is a build-mode tool rather than a panel button because the two things it joins are both
   * standing in the world, and picking them off a list would mean naming forty crates.
   */
  { key: 'route', name: 'Route', hint: 'Click a drill, then a store. How far apart they are decides how fast the ore moves.' },
];

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
  'Pick Place and put down a Furnace and a Storage Crate. You can build anywhere — no permit, no marker, no ceremony.',
  'Build a Burner Generator beside the crate and put coal in the crate. Anything within reach of a store shares its pile.',
  'Pick Scan to find the seams around you, then put a Drill on one — it finds its own way to your store.',
  'Far from home? Put a crate out there too and link it back. The load takes a while; a road makes it much quicker.',
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
  /** R16 — `{ list(), build(kind, id) }`. The tools and devices bench; see `drawToolBench`. */
  tools = null,
  /**
   * R15 — `() => ({ text, why, where })`, or null when the chain is finished. See js/nextstep.js.
   * The panel does not work any of it out; it only draws whatever it is handed.
   */
  nextStep = null,
} = {}) {
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
  /** The motorcycle, the car and the truck — built at a bench, not placed on the ground. */
  const garageBox = el('div', { class: 'build-yard build-garage' });
  /**
   * R16 — THE TOOL BENCH.
   *
   *   "Instead of having tool be based on weapon (no idea how that works) change it so you build
   *    new tools."
   *
   * It belongs here and not in the crafting screen for one plain reason: a tool is paid for out of
   * the MATERIALS bag — timber, stone, iron ingots — which is the same purse everything else in
   * this panel spends, and the crafting screen spends the three recycled gear materials instead.
   * Making the player carry the cost across two economies to build a pickaxe would be silly.
   */
  const toolsBox = el('div', { class: 'build-yard build-tools-bench' });
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
    steps, toolRow, catRow, listBox, scanBox, minesBox, benchBox, toolsBox, workBox, holdBox, garageBox, yardBox, detail);
  root.append(head, body, keys);

  head.append(
    el('h2', { text: 'Build' }),
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

  function drawCats() {
    catRow.replaceChildren();
    for (const key of catKeys) {
      catRow.append(el('button', {
        class: 'build-cat' + (key === cat ? ' on' : ''),
        text: categories[key].name || key,
        onclick: () => { cat = key; redraw(); },
      }));
    }
  }

  function drawList() {
    listBox.replaceChildren();
    if (CAT_BLURB[cat]) listBox.append(el('p', { class: 'build-cat-blurb small muted', text: CAT_BLURB[cat] }));
    const rows = pieces.filter(p => p.cat === cat).sort((a, b) => (a.tier || 1) - (b.tier || 1) || a.name.localeCompare(b.name));
    for (const p of rows) {
      const parts = costLine(p.cost, have);
      const afford = parts.every(c => !c.short);
      const row = el('button', {
        class: 'build-row' + (pick === p.id ? ' on' : '') + (afford ? '' : ' short'),
        onclick: () => {
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
        el('span', { class: 'build-row-cost', text: parts.map(c => c.text).join(' · ') || 'free' }),
      );
      listBox.append(row);
    }
    if (!rows.length) listBox.append(el('p', { class: 'muted small', text: 'Nothing in this group yet.' }));
  }

  function drawDetail() {
    detail.replaceChildren();
    const p = pieces.find(x => x.id === pick);
    if (!p) {
      detail.append(el('p', { class: 'muted small', text: 'Pick something to see what it costs and what it does.' }));
      return;
    }
    detail.append(el('h3', { text: p.name }));
    if (p.desc) detail.append(el('p', { class: 'small', text: p.desc }));

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
   */
  function drawBench() {
    benchBox.replaceChildren();
    const bench = nearest?.();
    if (!bench || !works) return;
    const m = works.get(bench.id);
    if (!m) return;

    const snap = works.snapshot(m.id) || {};
    benchBox.append(el('h3', { text: m.name }));
    benchBox.append(el('p', { class: 'small muted', text: works.stateText(m) }));

    /**
     * R16 — THE SWITCH AND THE QUEUE ORDER, side by side above the jobs.
     *
     * `m.enabled` was read in three places and set in none (js/refine.js `setEnabled` has the whole
     * note). `priority` is new and goes straight onto the machine's work order, which js/work.js
     * `nextFor` has always sorted by — so "first" genuinely means the next citizen free walks here
     * rather than to the loom.
     *
     * Both are on one row because they are the same question asked twice: of the benches I own,
     * which ones matter.
     */
    if (works.setEnabled) {
      // The classes are borrowed on purpose: `build-yard-row` is the flex row this panel already
      // uses everywhere and `build-tool` is the toggle button that already has an `.on` look, so
      // none of this needs a line of new CSS. (It does NOT borrow `build-tools`, which the tool row
      // owns — two sections sharing a class is a fault this file has already learned twice.)
      const bar = el('div', { class: 'build-yard-row build-bench-switch' });
      bar.append(el('button', {
        class: 'build-tool' + (snap.enabled === false ? '' : ' on'),
        text: snap.enabled === false ? 'Switched off' : 'Running',
        title: 'A machine that is off keeps its queue, its half-finished batch and its banked work — it just stops, and stops asking for a worker.',
        onclick: () => { works.setEnabled(m.id, snap.enabled === false); redraw(); },
      }));
      if (snap.needsWorking || (m.def.labour?.secondsPerUnit || 0) > 0) {
        for (let p = 0; p <= 2; p++) {
          bar.append(el('button', {
            class: 'build-tool build-prio' + ((snap.priority ?? 1) === p ? ' on' : ''),
            text: ['Last', 'Normal', 'First'][p],
            title: `Workers take this one ${works.PRIORITY_WORDS?.[p] || 'normally'}.`,
            onclick: () => { works.setPriority(m.id, p); redraw(); },
          }));
        }
      }
      benchBox.append(bar);
    }

    /**
     * R16 — WHO IS KEEPING THIS LIT, and how far through the current four units they are.
     *
     * The bar is the machine's OWN work order off the board, not a second clock — the same number
     * the bar over the structure draws while you hold E, so helping by hand and watching the panel
     * tell the same story. `workboard.at(stationId)` is optional: without it the panel falls back
     * to the bank, which is the other half of the same fact.
     */
    if (snap.needsWorking) {
      const order = workboard?.at?.(m.id) || null;
      const work = el('div', { class: 'build-bench-work' });
      work.append(el('span', { class: 'small', text: order ? `${order.title} · ${order.progress}` : `${snap.minutesLeft} min of work banked` }));
      const frac = order ? order.fraction : Math.min(1, (snap.workBank || 0) / Math.max(1, snap.workBankMax || 1));
      work.append(el('div', { class: 'build-work-bar' }, el('i', { style: `width:${Math.round(frac * 100)}%` })));
      const credit = order?.credit || snap.lastCredit;
      work.append(el('span', { class: 'muted small build-work-credit', text: credit
        ? (order?.credit ? credit : `last shift: ${credit}`)
        : 'Nobody has worked this yet. Stand here and hold E.' }));
      benchBox.append(work);
    } else {
      benchBox.append(el('p', { class: 'small muted', text: 'Runs itself — it wants power, not hands.' }));
    }

    // what is already queued, with a way to take it back off
    for (let i = 0; i < m.queue.length; i++) {
      const job = m.queue[i];
      const r = works.recipes[job.recipe];
      const row = el('div', { class: 'build-job' },
        el('span', { text: r?.name || job.recipe }),
        el('span', { class: 'muted small', text: job.left === Infinity ? 'repeating' : `${job.done}/${job.done + job.left}` }),
      );
      row.append(el('button', { class: 'small', text: '×', title: 'Take this off the queue', onclick: () => { works.cancel(m.id, i); redraw(); } }));
      benchBox.append(row);
    }

    /**
     * R16 — HOW MANY. "Make twenty planks and stop", and the standing order.
     *
     * `works.queue(id, recipe, count)` has taken a count since the day it was written, and `count
     * <= 0` has always meant "keep going until told otherwise" — the queue rows above have printed
     * the word "repeating" for it all along. The panel only ever sent 1. So the whole of batching
     * and standing orders existed, was saved, was drawn, and could not be reached: clicking a
     * recipe twenty times was the only way to make twenty of anything.
     *
     * It is a choice you make ONCE and then click recipes, rather than three buttons on every row,
     * because a bench has a dozen recipes and thirty-six buttons is not a panel.
     */
    const batchRow = el('div', { class: 'build-yard-row build-bench-batch' });
    batchRow.append(el('span', { class: 'muted small', text: 'Make' }));
    for (const n of [1, 5, 20, 0]) {
      batchRow.append(el('button', {
        class: 'build-tool build-batch' + (batch === n ? ' on' : ''),
        text: n === 0 ? 'keep going' : `×${n}`,
        title: n === 0 ? 'A standing order: it makes them until you take the job off, or until it runs out of what it eats.' : `Queue ${n} at a time.`,
        onclick: () => { batch = n; redraw(); },
      }));
    }
    benchBox.append(batchRow);

    // …and everything it could make. A locked recipe is SHOWN, greyed, with what unlocks it —
    // a recipe you cannot see is a recipe you will never go looking for.
    for (const r of works.board(m.type)) {
      const ins = works.inputsOf(r);
      const short = ins ? Object.entries(ins).filter(([id, n]) => have(id) < n) : [];
      const row = el('button', {
        class: 'build-recipe' + (r.unlocked ? '' : ' locked'),
        title: r.desc || '',
        onclick: () => {
          if (!r.unlocked) { if (onLog) onLog(r.unlock?.text || 'Not learned yet.', 'warn'); return; }
          const out = works.queue(m.id, r.id, batch);
          if (!out.ok && onLog) onLog(out.why, 'warn');
          else if (onLog) {
            onLog(batch === 0
              ? `${m.name}: ${r.name}, on a standing order — it will keep making them.`
              : `${m.name}: ${batch} × ${r.name} queued.`, 'good');
          }
          redraw();
        },
      });
      row.append(
        el('span', { class: 'build-row-name', text: r.name }),
        el('span', { class: 'build-row-cost', text: !r.unlocked ? (r.unlock?.text || 'locked')
          : !ins ? 'needs a rare element this world does not hold'
          : short.length ? `short ${short.map(([id, n]) => `${Math.ceil(n - have(id))} ${id.replace(/_/g, ' ')}`).join(', ')}`
          : `${Math.round(r.time)}s` }),
      );
      benchBox.append(row);
    }
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
   * THE GARAGE — a vehicle is BUILT AT A BENCH, not put down on the ground.
   *
   * Which is why it cannot live in the catalogue list above: everything there has a footprint and a
   * ghost, and a motorcycle has neither. It is shown at the bench that makes it, the same rule the
   * shipyard follows, so the panel never turns into a menu of everything in the game at once.
   */
  function drawGarage() {
    garageBox.replaceChildren();
    if (!garage) return;
    const rows = garage.list() || [];
    if (!rows.length) return;
    garageBox.append(el('h3', { text: 'Garage' }));
    for (const v of rows) {
      const row = el('div', { class: 'build-yard-row' });
      const b = el('button', {
        class: 'small',
        text: v.owned ? (v.fuelOk ? `Fuel the ${v.name}` : v.name) : `Build the ${v.name}`,
        onclick: () => { (v.owned ? garage.refuel : garage.build)(v.key); redraw(); },
      });
      b.disabled = v.owned ? !v.fuelOk : !v.ok;
      row.append(b, el('span', { class: (v.owned || v.ok) ? 'small' : 'small bad', text: v.note }));
      garageBox.append(row);
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
    drawSteps(); drawTools(); drawCats(); drawList(); drawScan(); drawMines(); drawBench();
    drawToolBench(); drawWork(); drawHolding(); drawGarage(); drawYard(); drawDetail();
  }

  /**
   * R16 — the tools and the two devices you can build right now, with what each is short of.
   *
   * `tools` is `{ list(), build(kind, id) }`, handed in by js/main.js. A row that cannot be paid
   * for says WHY in materials rather than going grey — a greyed-out row is the one answer a player
   * cannot act on, which is the rule the Holding panel already follows.
   */
  function drawToolBench() {
    toolsBox.replaceChildren();
    if (!tools) return;
    const rows = tools.list() || [];
    if (!rows.length) return;
    toolsBox.append(el('h3', { text: 'Tools and devices' }));
    toolsBox.append(el('p', {
      class: 'small muted',
      text: 'A tool is pick and axe in one. Its tier says what it can work; its quality says how fast.',
    }));
    for (const r of rows) {
      const row = el('div', { class: 'build-yard-row' });
      const cost = Object.entries(r.cost || {})
        .map(([m, n]) => `${n} ${(r.names?.[m] || m).toLowerCase()}`).join(', ');
      const b = el('button', {
        class: 'small',
        text: r.owned && r.kind === 'device' ? `${r.name} ✓` : `Build the ${r.name}`,
        onclick: () => { tools.build(r.kind, r.id); redraw(); },
      });
      b.disabled = !r.canAfford || (r.owned && r.kind === 'device');
      const note = r.owned && r.kind === 'device' ? r.desc
        : r.canAfford ? `${cost} — ${r.desc}`
        : `Short: ${r.short.map(s => `${Math.ceil(s.n - s.got)} ${(r.names?.[s.m] || s.m).toLowerCase()}`).join(', ')}`;
      row.append(b, el('span', { class: r.canAfford || r.owned ? 'small' : 'small bad', text: note }));
      toolsBox.append(row);
    }
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
      drawGarage();
      drawYard();
    },
    /** A full rebuild — after a placement, when the bag changed, or when the tool did. */
    refresh: redraw,
    /** For the tests and the debug menu. */
    select(id) { pick = id; build?.select(id); redraw(); return pick; },
    get categories() { return catKeys; },
    dispose() { root.remove(); },
  };
  return api;
}
