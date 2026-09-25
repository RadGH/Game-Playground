// Farhold — the screen a building opens when you press E at it.
//
//   "I built a furnace, campfire, kiln, and loom, but I still cannot figure out how to convert iron
//    ore into ingots. The furnace says it can smelt iron. But when I press E to open it it just
//    opens the regular build menu."
//
// It did. E at a machine put up BUILD MODE with the whole catalogue, the tool rail, the digging
// list and the shipyard, and somewhere down the right-hand side, if you were standing close enough,
// a section listing what the furnace could make. The feature existed; what you got when you asked
// for it was a hardware shop.
//
// This is that one machine's own screen and nothing else's. What it shows is DATA — every structure
// in data/structures.json may carry a `station` block naming its title, its one-sentence blurb, the
// recipes it runs and which built-in panels it also wants — so the next station somebody adds is a
// row in a JSON file rather than a new panel in here.
//
//   import { createStationScreen } from './station-ui.js';
//   const station = createStationScreen({ works, build, store, tools, garage, shipyard, workboard });
//   station.open(entry);      // an entry out of the build ledger
//   station.tick();           // while it is up
//
// ONE MECHANISM FOR WORK, NOT TWO. Queueing goes through `works.queue` and effort goes through
// js/work.js's board — the same order a citizen fills and the same order holding E at the thing
// itself fills. There is no second clock in this file. That is the rule js/refine.js's
// `createHandWork` header argues for at length, and a screen is exactly where it would have been
// easiest to break.
//
// No inline styles: station.css, injected by this module, the way js/civics-ui.js injects its own.

import { mat } from '../../../shared/format.js';
import { el } from '../../../shared/ui.js';

const CSS_HREF = 'station.css';

/** How many of a recipe one click queues. 0 is the standing order js/refine.js has always had. */
const BATCHES = [1, 5, 20, 0];

/**
 * THE BODY OF A STATION, DRAWN INTO WHATEVER BOX YOU HAND IT.
 *
 * Exported because there are two places a station's controls belong and only one of them should
 * own the code: this file's own screen (E), and the section of the build panel that shows the bench
 * you happen to be standing next to while you are placing things (B). Writing the recipe list twice
 * is how the two drift apart, and a recipe list that behaves differently depending on which key you
 * pressed is worse than only having one.
 *
 * The class names are the build panel's own (`build-recipe`, `build-row-name`, `build-job`…) on
 * purpose: style.css already styles them, so the shared renderer needs no stylesheet of its own and
 * the two mounts genuinely look the same. station.css only dresses the frame around it.
 */
/**
 * NOTE THAT IT DOES NOT CLEAR THE BOX. The caller does, because the build panel's bench section
 * puts a heading and an "Open the Furnace" button above this and a `replaceChildren()` in here
 * would silently wipe both — which it did, for exactly as long as it took to notice.
 */
export function drawStationBody(box, {
  entry, def, works = null, store = null, build = null, tools = null, garage = null,
  shipyard = null, workboard = null, onLog = null, redraw = () => {}, batch = 1, setBatch = null,
  compact = false,
} = {}) {
  if (!entry) return;
  const have = id => (store?.have ? store.have(id) : 0);
  const machine = works?.get?.(entry.id) || null;
  const station = def?.station || null;
  const panels = station?.panels || [];
  const wantsRecipes = !!(station?.recipes?.length) && !!machine;

  /**
   * The state line, and why a bench with no recipes does not get one.
   *
   * `works.stateText` on a machine that can never have a queue says "Nothing queued", which on an
   * anvil or a garage is the game blaming you for a state that is not a state.
   */
  if (machine && wantsRecipes) {
    box.append(el('p', { class: 'station-state small', text: works.stateText(machine) }));
  }

  // ---------------------------------------------------------------- the switch and the queue order
  if (machine && wantsRecipes && works.setEnabled) {
    const snap = works.snapshot(machine.id) || {};
    const bar = el('div', { class: 'build-yard-row station-switch' });
    bar.append(el('button', {
      class: 'build-tool' + (snap.enabled === false ? '' : ' on'),
      text: snap.enabled === false ? 'Switched off' : 'Running',
      title: 'A machine that is off keeps its queue, its half-finished batch and its banked work — it just stops, and stops asking for a worker.',
      onclick: () => { works.setEnabled(machine.id, snap.enabled === false); redraw(); },
    }));
    if (snap.needsWorking || (machine.def.labour?.secondsPerUnit || 0) > 0) {
      for (let p = 0; p <= 2; p++) {
        bar.append(el('button', {
          class: 'build-tool build-prio' + ((snap.priority ?? 1) === p ? ' on' : ''),
          text: ['Last', 'Normal', 'First'][p],
          title: `Workers take this one ${works.PRIORITY_WORDS?.[p] || 'normally'}.`,
          onclick: () => { works.setPriority(machine.id, p); redraw(); },
        }));
      }
    }
    box.append(bar);
  }

  // ---------------------------------------------------------------- who is keeping it lit
  if (machine && wantsRecipes) {
    const snap = works.snapshot(machine.id) || {};
    if (snap.needsWorking) {
      const order = workboard?.at?.(machine.id) || null;
      const work = el('div', { class: 'build-bench-work' });
      work.append(el('span', { class: 'small', text: order ? `${order.title} · ${order.progress}` : `${snap.minutesLeft} min of work banked` }));
      const frac = order ? order.fraction : Math.min(1, (snap.workBank || 0) / Math.max(1, snap.workBankMax || 1));
      work.append(el('div', { class: 'build-work-bar' }, el('i', { style: `width:${Math.round(frac * 100)}%` })));
      const credit = order?.credit || snap.lastCredit;
      work.append(el('span', {
        class: 'muted small build-work-credit',
        text: credit ? (order?.credit ? credit : `last shift: ${credit}`) : 'Nobody has worked this yet.',
      }));
      /**
       * R17 — A BUTTON THAT PUTS A UNIT IN, because the screen must not be a place where you can
       * only watch. It is the identical call the build panel's work board makes and the identical
       * one holding E at the structure makes: `board.swing` on the machine's own `lab_*` order.
       * Holding E in the world still works while this is up and does the same thing faster.
       */
      if (order && workboard?.swing) {
        work.append(el('button', {
          class: 'small station-swing', text: 'Put your back into it',
          title: 'One unit of work — thirty seconds of this machine running. Holding E at the thing itself does the same, faster.',
          onclick: () => { workboard.swing(order.id); redraw(); },
        }));
      }
      box.append(work);
    } else {
      box.append(el('p', { class: 'small muted', text: 'Runs itself — it wants power, not hands.' }));
    }
  }

  // ---------------------------------------------------------------- what is already on it
  if (machine && wantsRecipes) {
    for (let i = 0; i < machine.queue.length; i++) {
      const job = machine.queue[i];
      const r = works.recipes[job.recipe];
      const row = el('div', { class: 'build-job' },
        el('span', { text: r?.name || job.recipe }),
        el('span', { class: 'muted small', text: job.left === Infinity ? 'repeating' : `${job.done}/${job.done + job.left}` }));
      row.append(el('button', { class: 'small', text: '×', title: 'Take this off the queue', onclick: () => { works.cancel(machine.id, i); redraw(); } }));
      box.append(row);
    }
  }

  // ---------------------------------------------------------------- how many, then the recipes
  if (wantsRecipes) {
    const batchRow = el('div', { class: 'build-yard-row build-bench-batch' });
    batchRow.append(el('span', { class: 'muted small', text: 'Make' }));
    for (const n of BATCHES) {
      batchRow.append(el('button', {
        class: 'build-tool build-batch' + (batch === n ? ' on' : ''),
        text: n === 0 ? 'keep going' : `×${n}`,
        title: n === 0 ? 'A standing order: it makes them until you take the job off, or until it runs out of what it eats.' : `Queue ${n} at a time.`,
        onclick: () => { setBatch?.(n); redraw(); },
      }));
    }
    box.append(batchRow);

    /**
     * THE STATION'S OWN LIST, IN THE ORDER data/structures.json NAMES THEM.
     *
     * `works.board(type)` knows every recipe the MACHINE has; the `station.recipes` list is what the
     * BUILDING offers. They are almost always the same thing, and the day they are not — a second
     * furnace-like structure that only smelts iron, say — this is the line that decides.
     */
    const board = new Map((works.board(machine.type) || []).map(r => [r.id, r]));
    for (const id of station.recipes) {
      const r = board.get(id);
      if (!r) continue;
      const ins = works.inputsOf(r);
      const short = ins ? Object.entries(ins).filter(([m, n]) => have(m) < n) : [];
      const row = el('button', {
        class: 'build-recipe' + (r.unlocked ? '' : ' locked'),
        title: r.desc || '',
        onclick: () => {
          if (!r.unlocked) { onLog?.(r.unlock?.text || 'Not learned yet.', 'warn'); return; }
          const out = works.queue(machine.id, r.id, batch);
          if (!out.ok) onLog?.(out.why, 'warn');
          else {
            onLog?.(batch === 0
              ? `${machine.name}: ${r.name}, on a standing order — it will keep making them.`
              : `${machine.name}: ${batch} × ${r.name} queued.`, 'good');
          }
          redraw();
        },
      });
      const out = Object.keys(r.outputs || {}).map(k => k.replace(/_/g, ' ')).join(', ');
      row.append(
        el('span', { class: 'build-row-name', text: r.name }),
        el('span', { class: 'station-makes small muted', text: `→ ${out}` }),
        el('span', {
          class: 'build-row-cost',
          text: !r.unlocked ? (r.unlock?.text || 'locked')
            : !ins ? 'needs a rare element this world does not hold'
            : short.length ? `short ${short.map(([m, n]) => `${Math.ceil(n - have(m))} ${m.replace(/_/g, ' ')}`).join(', ')}`
            : `${Math.round(r.time)}s`,
        }),
      );
      box.append(row);
    }

    /**
     * R17 — "LOAD IT FROM YOUR PACK", and the trap it closes.
     *
     * A machine draws ONLY from the storage pool it stands in (js/refine.js `poolFor`). Everything
     * you dig up while you are away from home is in the materials bag on your back. So the honest
     * report from a player is "I have forty iron ore and the furnace says it has none", and the
     * answer — walk home and swing at something else while standing next to the crate — is not one
     * anybody could guess.
     *
     * It is `pay` then `giveBack` on the build ledger's own purse, which is not a trick: `pay` takes
     * from the pool first and then the bag, `giveBack` puts back into the pool first and only spills
     * into the bag what the crates will not hold. The net effect of doing both with the same bill is
     * exactly "tip the pack into the store", and it reuses the one purse in the game that already
     * knows the order those two things come in.
     */
    if (build?.plan?.pay && build?.plan?.giveBack) {
      const wanted = new Set();
      for (const id of station.recipes) {
        const r = works.recipes[id];
        for (const m of Object.keys(works.inputsOf(r) || {})) wanted.add(m);
      }
      for (const m of Object.keys(machine.def.fuels || {})) wanted.add(m);
      const loadable = [...wanted].filter(m => have(m) > 0);
      if (loadable.length) {
        box.append(el('button', {
          class: 'small station-load',
          text: 'Load it from your pack',
          title: 'A machine can only reach what is in the stores around it. This tips everything it eats out of your pack and into them.',
          onclick: () => {
            const bill = {};
            for (const m of loadable) bill[m] = have(m);
            if (build.plan.pay(bill)) build.plan.giveBack(bill);
            onLog?.(`${loadable.length} kind${loadable.length === 1 ? '' : 's'} of material into the stores here.`, 'good');
            redraw();
          },
        }));
      }
    }
  }

  /**
   * THE BUILT-IN PANELS, AND WHY `compact` LEAVES THEM OUT.
   *
   * The build panel's bench section is a SUMMARY of the thing you are standing next to while you
   * are placing something else; the station screen is the thing itself. Drawing the tool bench, the
   * garage and the shipyard in both would put the shipyard on screen twice at once (the build panel
   * has carried its own shipyard section since §9), which is worse than either arrangement on its
   * own. So the queue and the recipes are shared and the panels belong to the screen.
   */
  if (!compact) {
    if (panels.includes('tools') && tools) drawToolPanel(box, { entry, def, tools, redraw });
    if (panels.includes('garage') && garage) drawGaragePanel(box, { garage, redraw });
    if (panels.includes('shipyard') && shipyard) drawYardPanel(box, { shipyard, redraw });
  }

  if (!wantsRecipes && (!panels.length || compact)) {
    box.append(el('p', {
      class: 'small muted',
      text: compact && panels.length
        ? 'Open it to see what it can do.'
        : 'Nothing to set here. It does its job by standing where it stands.',
    }));
  }
}

/**
 * THE TOOLS AND DEVICES BENCH, WHICH IS NOW AT A BENCH.
 *
 *   "It also has a 'Tools and devices' menu where I can craft a knapped tool (pointless since you
 *    start with one, but) I think that menu should only open if you open a crafting table of some
 *    kind."
 *
 * It used to sit in the build panel, which meant you could forge a Steelhead Pick standing in an
 * empty field. data/tools.json has said which bench each one wants since the day it was written —
 * every row carries `at`, and js/tools.js's `buildable` copies it on to the row — and NOBODY HAS
 * EVER READ IT. Another finished rule with no consumer, which is this project's signature fault.
 *
 * `at: "hand"` is the exception and it is deliberate: the Knapped Tool is lashed together out of
 * four logs and eight fibre with no bench at all, because a first hour spent unable to pick anything
 * up is not a difficulty curve. It shows on EVERY station so it is never hidden, and it is the only
 * one that does.
 */
function drawToolPanel(box, { entry, def, tools, redraw }) {
  const rows = (tools.list() || []).filter(r => r.at === 'hand' || r.at === entry.key || r.at === def?.id);
  box.append(el('h3', { text: 'Tools and devices' }));
  box.append(el('p', {
    class: 'small muted',
    text: 'A tool is pick and axe in one. Its tier says what it can work; its quality says how fast.',
  }));
  if (!rows.length) {
    box.append(el('p', { class: 'small muted', text: 'Nothing is made at this bench. An Anvil forges tool heads; a Workbench builds the devices.' }));
    return;
  }
  for (const r of rows) {
    /**
     * R19 — A DEVICE YOU HAVE OUTGROWN IS NOT AN OPTION.
     *
     * `tools.json` has said which device replaces which since R17 and `buildable()` now reports it.
     * The panel says so rather than dropping the row: a Prospector's Scanner that has silently
     * disappeared once you build the Deep Scanner looks like a bug, and the line is also the only
     * place the game ever explains that the tiers are a ladder and not a set.
     */
    const row = el('div', { class: 'build-yard-row' });
    // R17 — `mat()`, so a recipe never quotes a price with twelve decimals in it
    const cost = Object.entries(r.cost || {}).map(([m, n]) => `${mat(n)} ${(r.names?.[m] || m).toLowerCase()}`).join(', ');
    const b = el('button', {
      class: 'small',
      text: r.supersededBy ? r.name
        : r.owned && r.kind === 'device' ? `${r.name} ✓`
        : `Build the ${r.name}`,
      onclick: () => { tools.build(r.kind, r.id); redraw(); },
    });
    b.disabled = !!r.supersededBy || !r.canAfford || (r.owned && r.kind === 'device');
    const note = r.supersededBy ? `Superseded by the ${r.supersededName}, which does everything this does.`
      : r.owned && r.kind === 'device' ? r.desc
      : r.canAfford ? `${cost} — ${r.desc}`
      : `Short: ${(r.short || []).map(s => `${Math.ceil(s.n - s.got)} ${(r.names?.[s.m] || s.m).toLowerCase()}`).join(', ')}`;
    row.append(b, el('span', {
      class: r.supersededBy ? 'small muted' : (r.canAfford || r.owned) ? 'small' : 'small bad',
      text: note,
    }));
    box.append(row);
  }
}

/** §6.3 — what you drive, built and fuelled from the building that exists for it. */
function drawGaragePanel(box, { garage, redraw }) {
  const rows = garage.list() || [];
  box.append(el('h3', { text: 'What you drive' }));
  if (!rows.length) {
    box.append(el('p', { class: 'small muted', text: 'Nothing yet. The parts are cut on the line — an Assembler, and for the bigger rigs an Alloy Forge and a Refinery — so the garage wants to stand beside them.' }));
    return;
  }
  for (const v of rows) {
    const row = el('div', { class: 'build-yard-row' });
    const b = el('button', {
      class: 'small',
      text: v.owned ? (v.fuelOk ? `Fuel the ${v.name}` : v.name) : `Build the ${v.name}`,
      onclick: () => { (v.owned ? garage.refuel : garage.build)(v.key); redraw(); },
    });
    b.disabled = v.owned ? !v.fuelOk : !v.ok;
    row.append(b, el('span', { class: (v.owned || v.ok) ? 'small' : 'small bad', text: v.note }));
    box.append(row);
  }
}

/** §9 — the pad, the four subsystems, the ship and the orbital yard, at the machine that makes them. */
function drawYardPanel(box, { shipyard, redraw }) {
  const state = shipyard.state?.();
  if (!state) return;
  box.append(el('h3', { text: 'Shipyard' }));
  box.append(el('p', { class: 'small muted', text: state.summary }));
  if (state.next) box.append(el('p', { class: 'small', text: `Next: ${state.next}` }));

  const action = (label, note, run, ok) => {
    const row = el('div', { class: 'build-yard-row' });
    const b = el('button', { class: 'small', text: label, onclick: () => { run(); redraw(); } });
    b.disabled = !ok;
    row.append(b, el('span', { class: ok ? 'small' : 'small bad', text: note }));
    box.append(row);
  };

  if (!state.pad) action('Build the pad', state.padWhy, () => shipyard.buildPad(), state.padOk);
  for (const part of state.parts || []) {
    action(part.done ? `Upgrade ${part.name}` : `Build ${part.name}`, part.why || part.costText, () => shipyard.buildPart(part.id), part.ok);
  }
  if (state.assembleOk || state.assembleWhy) {
    action('Put the ship together', state.assembleWhy || 'Everything is ready.', () => shipyard.assemble(), state.assembleOk);
  }
  action('Fill the tanks', state.fuelText, () => shipyard.refuel(), state.fuelOk);

  if (state.station) {
    box.append(el('h3', { text: state.station.name }));
    box.append(el('div', { class: 'build-work-bar' }, el('i', { style: `width:${Math.round(state.station.fraction * 100)}%` })));
    if (state.station.gateWhy) box.append(el('p', { class: 'small bad', text: state.station.gateWhy }));
    for (const m of state.station.modules || []) {
      action(m.up ? `${m.name} ✓` : `Lift the ${m.name}`, m.note, () => shipyard.buildModule(m.id), m.ok);
    }
  }
}

// ---------------------------------------------------------------------------- the screen itself

/**
 * `catalogue` is data/structures.json (aligned), so this file can find a piece's `station` block
 * from the ledger entry's `key`. Everything else is the same set of callbacks js/build-ui.js is
 * already handed by js/main.js — which is exactly why this screen can be created from inside
 * build-ui.js and needs no wiring of its own.
 */
export function createStationScreen({
  catalogue = null, works = null, store = null, build = null, tools = null, garage = null,
  shipyard = null, workboard = null, onLog = null, onClose = null, mount = null,
} = {}) {
  if (typeof document !== 'undefined' && !document.querySelector(`link[href="${CSS_HREF}"]`)) {
    document.head.appendChild(el('link', { rel: 'stylesheet', href: CSS_HREF }));
  }

  const defs = new Map((catalogue?.structures || []).map(s => [s.id, s]));
  let entry = null;
  let open = false;
  let batch = 1;

  const title = el('h2', { text: 'Station' });
  const blurb = el('p', { class: 'station-blurb' });
  const body = el('div', { class: 'station-body' });
  const root = el('div', { class: 'station', id: 'station-ui', hidden: true });
  root.append(
    el('div', { class: 'station-head' },
      title,
      el('button', { class: 'station-close', text: 'Close  (Esc)', title: 'Close (Esc or E)', onclick: () => api.close() })),
    blurb, body,
  );
  (mount || (typeof document !== 'undefined' ? document.body : null))?.appendChild(root);

  /** The catalogue row behind a ledger entry, or null when the piece is not a station at all. */
  function defFor(e) {
    if (!e) return null;
    const def = defs.get(e.key) || build?.defOf?.(e.key) || null;
    if (def?.station) return def;
    // a machine with no `station` block still gets a screen built out of what js/refine.js knows,
    // so adding a machine and forgetting the block is a plain screen rather than a dead key
    if (works?.machineDefs?.[e.key]) {
      const m = works.machineDefs[e.key];
      return {
        ...(def || { id: e.key, name: e.name }),
        station: {
          title: def?.name || m.name || e.name,
          blurb: m.desc || '',
          recipes: (works.board(e.key) || []).map(r => r.id),
        },
      };
    }
    return null;
  }

  function draw() {
    if (!open || !entry) return;
    const def = defFor(entry);
    if (!def) { api.close(); return; }
    title.textContent = def.station.title || def.name || entry.name;
    blurb.textContent = def.station.blurb || def.desc || '';
    // a furnace with eleven recipes is taller than the box, and a redraw two and a half times a
    // second that scrolled you back to the top would make the list unusable
    const scrolled = body.scrollTop || 0;
    body.replaceChildren();
    drawStationBody(body, {
      entry, def, works, store, build, tools, garage, shipyard, workboard, onLog,
      batch, setBatch: n => { batch = n; },
      redraw: draw,
    });
    body.scrollTop = scrolled;
  }

  /**
   * A CLOCK OF ITS OWN WHILE IT IS UP, AND THE REASON IS A CALL SITE IN SOMEBODY ELSE'S FILE.
   *
   * js/build-ui.js's `tick()` drives this screen whenever the build panel is up — but js/main.js
   * only calls `buildUI.tick()` inside `if (build.mode)`, and the whole point of this round is that
   * E opens a station WITHOUT entering build mode. So a furnace opened with E would have drawn once
   * and then sat there: the queue would not tick down, the work bar would not fill, and the state
   * line would still say "Nothing queued" after you had queued something.
   *
   * Two and a half times a second is enough for a progress bar and cheap enough not to matter, and
   * it stops dead the moment the screen closes. It is deliberately not `requestAnimationFrame`:
   * there is nothing here worth sixty redraws a second, and rAF would keep the DOM churning behind
   * a screen that is only ever up while the player is standing still.
   */
  let timer = null;
  const startClock = () => {
    if (timer || typeof setInterval !== 'function') return;
    timer = setInterval(() => { if (open) draw(); }, 400);
    // …and it must never be the reason a process stays alive. A node test that opens a station and
    // does not close it would otherwise hang the whole run on a timer nobody is watching.
    timer.unref?.();
  };
  const stopClock = () => { if (timer) { clearInterval(timer); timer = null; } };

  const api = {
    root,
    get isOpen() { return open; },
    get at() { return entry; },
    /** True if this entry has a screen and it is now up. False means "not a station" — try E's other answers. */
    open(e) {
      if (!e || !defFor(e)) return false;
      entry = e;
      batch = 1;
      open = true;
      root.hidden = false;
      document.body?.classList.add('station-open');
      draw();
      startClock();
      return true;
    },
    close() {
      if (!open) return false;
      open = false;
      entry = null;
      root.hidden = true;
      stopClock();
      document.body?.classList.remove('station-open');
      onClose?.();
      return true;
    },
    /** Once every few frames while it is up: the queue, the bar and the state move on their own. */
    tick() { if (open) draw(); },
    refresh: draw,
    dispose() { stopClock(); root.remove(); },
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', e => {
      if (!open) return;
      if (e.key === 'Escape') { api.close(); e.stopPropagation(); }
    }, true);
  }

  return api;
}
