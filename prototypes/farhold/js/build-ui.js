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
  { key: 'road', name: 'Road', hint: 'Click a line of points, Enter to lay the road along it.' },
  { key: 'wall', name: 'Wall', hint: 'Same, but a wall — and Enter puts a gate where you double back.' },
  { key: 'raise', name: 'Raise', hint: 'Pull the ground up under the brush.' },
  { key: 'lower', name: 'Lower', hint: 'Push it down. A moat is a lowered ring.' },
  { key: 'clear', name: 'Clear', hint: 'Fell the trees and boulders in the brush. You keep the timber.' },
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
 * Four steps, in order, in the words the panel's own buttons use. It sits above the list and goes
 * away for good once there is a claim stone on the map, because the answer to "how do I start a
 * base" stops being useful the moment you have one.
 */
const FIRST_STEPS = [
  'Pick Level, aim at flat-ish ground and click. That is your plot.',
  'Pick Place, choose Claim Stone under Waypoint, and put it in the middle. The ground is yours now.',
  'Build a Storage Crate and a Burner Generator beside it, and put coal in the crate.',
  'When you can afford a Waypoint Pad, build it. You can travel home from anywhere after that.',
];

/** "12 stone, 2 iron" — and the ones you are short of are the ones that matter. */
function costLine(cost, have) {
  return Object.entries(cost || {})
    .map(([id, n]) => {
      const got = have(id);
      const name = id.replace(/_/g, ' ');
      return { text: `${n} ${name}`, short: got < n, got, need: n };
    });
}

export function createBuildUI({ catalogue = null, build = null, store = null, onLog = null, mining = null, works = null, nearest = null, shipyard = null, garage = null, holding = null } = {}) {
  const pieces = catalogue?.structures || [];
  const categories = catalogue?.categories || {};
  const have = id => (store?.have ? store.have(id) : 0);

  /** Only the categories that actually have something in them, in the catalogue's own order. */
  const catKeys = Object.keys(categories).filter(k => pieces.some(p => p.cat === k));

  let open = false;
  let cat = catKeys.includes('waypoint') ? 'waypoint' : catKeys[0] || null;
  let pick = null;

  const root = el('div', { class: 'build-ui hidden', id: 'build-ui' });
  const head = el('div', { class: 'build-head' });
  const steps = el('div', { class: 'build-steps' });
  const toolRow = el('div', { class: 'build-tools' });
  const catRow = el('div', { class: 'build-cats' });
  const listBox = el('div', { class: 'build-list' });
  /** §1 — what every drill is doing, and what is holding it up. Empty until you own a drill. */
  const minesBox = el('div', { class: 'build-mines' });
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
  /** §6.5/6.8/6.9 — the people who live here, the fields they work, and the tax they pay. */
  const holdBox = el('div', { class: 'build-yard build-holding' });
  const detail = el('div', { class: 'build-detail' });
  const keys = el('div', { class: 'build-keys muted small' });
  root.append(head, steps, toolRow, catRow, listBox, minesBox, benchBox, holdBox, garageBox, yardBox, detail, keys);

  head.append(
    el('h2', { text: 'Build' }),
    el('button', { class: 'build-close', text: '×', title: 'Close (B)', onclick: () => api.setOpen(false) }),
  );
  keys.textContent = 'scroll turn · click place · Enter finish a run · Ctrl+Z undo · Esc or B leave · [ ] brush size';

  function drawSteps() {
    // gone once there is a claim on the map — see FIRST_STEPS
    const started = (build?.entries || []).length > 0;
    steps.replaceChildren();
    if (started) return;
    steps.append(el('h3', { text: 'Starting a base' }));
    const ol = el('ol', { class: 'build-steplist' });
    for (const line of FIRST_STEPS) ol.append(el('li', { text: line }));
    steps.append(ol);
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
    const rows = pieces.filter(p => p.cat === cat).sort((a, b) => (a.tier || 1) - (b.tier || 1) || a.name.localeCompare(b.name));
    for (const p of rows) {
      const parts = costLine(p.cost, have);
      const afford = parts.every(c => !c.short);
      const row = el('button', {
        class: 'build-row' + (pick === p.id ? ' on' : '') + (afford ? '' : ' short'),
        onclick: () => {
          pick = p.id;
          build?.select(p.id);
          // choosing a thing to build means you want to build it, so the tool follows the choice
          if (build?.tool !== 'build' && p.cat !== 'road') build.setTool('build');
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

    const notes = [];
    if (p.power?.use) notes.push(`Draws ${p.power.use} kW. It will not run without a generator in reach.`);
    if (p.power?.make) notes.push(`Makes ${p.power.make} kW${p.power.burns ? `, burning ${p.power.burns}` : ''}.`);
    if (p.store?.slots) notes.push(`Holds ${p.store.slots} slots, shared with every store it can reach.`);
    if (p.claims) notes.push('Stakes the ground. A base starts here.');
    if (p.waypoint) notes.push('Joins the waypoint network. You can travel back to it from anywhere.');
    if (p.slope != null) notes.push(`Wants ground no steeper than about 1 in ${Math.max(1, Math.round(1 / p.slope))}.`);
    for (const n of notes) detail.append(el('p', { class: 'small muted', text: n }));

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

    benchBox.append(el('h3', { text: m.name }));
    benchBox.append(el('p', { class: 'small muted', text: works.stateText(m) }));

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
          const out = works.queue(m.id, r.id, 1);
          if (!out.ok && onLog) onLog(out.why, 'warn');
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

  function redraw() {
    if (!open) return;
    drawSteps(); drawTools(); drawCats(); drawList(); drawMines(); drawBench();
    drawHolding(); drawGarage(); drawYard(); drawDetail();
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
      drawMines();
      drawBench();
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
