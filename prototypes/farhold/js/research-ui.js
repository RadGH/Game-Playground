// Farhold — the Research screen: four ages drawn as a wired-up board, and what to go and do for the
// next point.
//
// ITS OWN FILE AND ITS OWN STYLESHEET, the way js/civics-ui.js is. js/hud.js is three and a half
// thousand lines and already carries nine screens; it hands a mounted screen a box and calls
// `draw()`, and everything else about this one lives here.
//
//   import { createResearchScreen } from './research-ui.js';
//   const screen = createResearchScreen({ research, log: hud.log });
//   screen.mount(document.getElementById('sheet-body-research'));
//   hud.mount('research', screen);            // the tab appears the moment this runs
//
// It can also stand on its own as an overlay — `createResearchScreen({ standalone: true })` — which
// is how the build panel opens it, because the question "why can I not build this" is asked in the
// build panel and the answer is here.
//
// ------------------------------------------------------------------------------------------------
// ROUND 22 — WHAT WAS WRONG WITH THE OLD ONE, BOTH HALVES OF IT
//
// "The new Research screen is a good start. However 'Reagents' goes off screen and I can't scroll
//  down. Can we redesign this menu to be more like a tech-tree board, having smaller boxes with
//  networked relationship/requirements and click to view more details in a tooltip or side popup?
//  Rather than just a massive screen of text."
//
// THE SCROLL BUG was a box with no height in it. `.research` is a flex column, and `.res-body` asks
// for `flex: 1 1 auto; min-height: 0; overflow-y: auto` — which only turns into a scroller when the
// flex parent has a height to divide up. The overlay gave it one (`max-height: min(84vh, 820px)`),
// so the overlay scrolled; the character-sheet tab did NOT, so the column just kept growing past the
// bottom of the sheet, and style.css's `overflow: hidden` on the tab body cut it off there. The
// Holding and the Followers screens both solve this with an `embedded` flag their caller passes in,
// and js/main.js is another pair of hands this round — so the fix here is in the stylesheet instead
// and needs no flag at all: `.research` is `height: 100%` unless it is the overlay, and the mount
// point it sits in is already `height: 100%`. Nothing has to be told which frame it is in.
//
// THE WALL OF TEXT was the layout. Every node printed its blurb, its prerequisites, what it opens
// and why it matters, all at once, in a column — seven cards' worth of paragraphs, and the ordering
// between them (which is the actual shape of the tree) existed only as the sentence "Steelwork and
// Ground Glass first". So: the board is now a LATTICE. One column per age, one small card per node
// carrying a name, a cost and a coloured dot, and the `needs` arrows drawn as real curves behind the
// cards. What a card cannot show, a side panel shows for the one node you clicked.
//
// THE ONE RULE OF THE LAYOUT, unchanged from R17: every node is visible from the first minute,
// including the ones you cannot touch for ten hours. A tech tree that hides its far end is a tech
// tree that cannot be planned against, and the point of four ages is that the player can see where
// the fourth one is. And a node you cannot buy still carries the SENTENCE saying what is missing —
// "Steelwork and Ground Glass first", "4 more research points" — never a grey box with nothing in
// it.

import { el } from '../../../shared/ui.js';

const CSS_HREF = 'research.css';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * An SVG element, or as close as the runtime can get.
 *
 * The node tests run against tests/tiny-dom.mjs, which is sixty lines of `document` and has no
 * `createElementNS` in it. Falling back to `createElement` there means the wire layer is built out
 * of the wrong kind of element in a test and the right kind in a browser, which is fine: the test
 * never measures anything, and `layoutWires()` below refuses to run without a real box model.
 */
function svgEl(tag, attrs = {}) {
  const node = typeof document.createElementNS === 'function'
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, String(v));
  return node;
}

/** Rounded, because an SVG path built out of raw floats is forty characters of noise per curve. */
const px = n => Math.round(Number(n) * 10) / 10;

/**
 * WHICH ROW EACH NODE STANDS ON, so the arrows read as a staircase rather than a knot.
 *
 * A column is an age and that is fixed by the data. The row is ours to choose, and the choice that
 * makes the wires legible is: a node stands one row below the lowest thing it waits on, and if that
 * row is already taken in its own column it moves down until it finds a free one. Two consequences,
 * and both are what make the board readable — a wire always runs downward, and two nodes that both
 * wait on the same thing (Drawn Wire and Reagents both wait on Ironworking) sit on rows of their
 * own instead of on top of each other.
 *
 * It needs the ages in order and the nodes in order within them, which is how data/research.json is
 * written. A `needs` pointing at something not yet placed simply contributes nothing, so a tree in
 * the wrong order still draws — badly, but it draws.
 */
export function laneRows(ages = []) {
  const rowOf = new Map();
  const used = new Map();
  for (const age of ages) {
    for (const node of age.nodes || []) {
      let want = 0;
      for (const need of node.needs || []) {
        if (rowOf.has(need)) want = Math.max(want, rowOf.get(need) + 1);
      }
      const taken = used.get(age.id) || new Set();
      while (taken.has(want)) want++;
      taken.add(want);
      used.set(age.id, taken);
      rowOf.set(node.id, want);
    }
  }
  return rowOf;
}

/**
 * `research` is a js/research.js instance (usually `sharedResearch()`). `log` is optional; without
 * it the screen is silent, which is what a node test wants.
 */
export function createResearchScreen({ research = null, log = null, standalone = false, mount = null } = {}) {
  if (typeof document !== 'undefined' && !document.querySelector(`link[href="${CSS_HREF}"]`)) {
    document.head.appendChild(el('link', { rel: 'stylesheet', href: CSS_HREF }));
  }

  const head = el('div', { class: 'res-head' });
  const ledger = el('div', { class: 'res-ledger' });
  const wires = svgEl('svg', { class: 'res-wires', width: 1, height: 1, viewBox: '0 0 1 1' });
  const lattice = el('div', { class: 'res-lattice' });
  const canvas = el('div', { class: 'res-canvas' }, wires, lattice);
  const board = el('div', { class: 'res-board' }, canvas);
  const detail = el('aside', { class: 'res-detail' });
  const body = el('div', { class: 'res-body' }, board, detail);
  const root = el('div', { class: 'research' + (standalone ? ' research--overlay' : ''), id: standalone ? 'research-overlay' : null });
  root.append(head, ledger, body);
  if (standalone) root.hidden = true;

  let open = !standalone;
  /** Which node the side panel is showing. Survives a redraw, so buying one does not lose your place. */
  let selected = null;
  /**
   * Is the "where points come from" list unfolded?
   *
   * It starts open only while you have earned nothing at all, because that is the one moment the
   * list is an instruction rather than a record — the screen's whole answer to "so how do I get a
   * point" is those rows. Once the first point is in, the strip folds up and gives its height to the
   * board. The rows stay in the page either way (hidden, not removed), so nothing has to redraw them
   * and anything looking for them can still find them.
   */
  let earnOpen = true;
  let earnTouched = false;

  /** Card element per node id, and one record per drawn wire, both rebuilt on every draw. */
  const cards = new Map();
  let wireList = [];
  /** Board rows, so the panel and the highlight can ask about a node without walking the ages. */
  let nodeById = new Map();

  function say(t, k) { log?.(t, k); }

  // ------------------------------------------------------------------ the head

  function drawHead() {
    head.replaceChildren();
    const s = research?.summary?.() || { points: 0, taken: 0, total: 0, ready: 0 };
    head.append(el('h2', { text: 'Research' }));
    head.append(el('span', { class: 'res-points', text: `${s.points} point${s.points === 1 ? '' : 's'} to spend` }));
    head.append(el('span', { class: 'res-sub small muted', text: `${s.taken} of ${s.total} researched${s.ready ? ` · ${s.ready} ready now` : ''}` }));
    /**
     * THE LEGEND, and it is four words rather than four sentences on purpose.
     *
     * The border colour and the dot on a card are the whole state readout. That only works if the
     * four colours are named somewhere, once, and this is the somewhere.
     */
    const key = el('span', { class: 'res-key' });
    for (const [cls, text] of [['done', 'Researched'], ['ready', 'Ready'], ['short', 'Short of points'], ['blocked', 'Locked']]) {
      key.append(el('span', { class: 'res-key-item' }, el('i', { class: `res-dot res-dot--${cls}` }), el('span', { text })));
    }
    head.append(key);
    if (standalone) {
      head.append(el('button', { class: 'res-close', text: 'Close  (Esc)', onclick: () => api.hide() }));
    }
  }

  // ------------------------------------------------------------------ where points come from

  /**
   * THE LEDGER, AND WHY IT IS ON THIS SCREEN RATHER THAN IN THE DOCS.
   *
   * "I think our research system can unlock research points by completing quests or exploring or
   * defeating bosses." A player who reads "4 points" and nothing else has no idea which of the
   * three to go and do. Every line is always shown, whether or not you have earned any of that
   * kind, because the list is the instruction.
   *
   * R22 moved it off the grid. It used to be a fifth column beside the four ages, which put a
   * static reference list on equal footing with the thing the screen is for; it is a strip across
   * the top now, folded away once you have earned a point.
   */
  function drawLedger() {
    ledger.replaceChildren();
    if (!earnTouched) earnOpen = (research?.summary?.()?.earned || 0) === 0;
    const rows = research?.ledgerRows?.() || [];
    const byReason = new Map(rows.map(r => [r.reason, r]));
    const names = research?.data?.reasons || {};
    const worth = research?.data?.points || {};

    const toggle = el('button', {
      class: 'res-earn-toggle' + (earnOpen ? ' is-open' : ''),
      text: `Where points come from${earnOpen ? '' : ` — ${Object.keys(names).filter(r => r !== 'default').length} ways`}`,
      onclick: () => { earnOpen = !earnOpen; earnTouched = true; drawLedger(); layoutWires(true); },
    });
    ledger.append(toggle);

    const list = el('div', { class: 'res-earn' });
    list.hidden = !earnOpen;
    list.append(el('p', { class: 'res-earn-note small muted', text: 'Nothing here is bought with materials or with gold. A point is something you did.' }));
    for (const reason of Object.keys(names)) {
      if (reason === 'default') continue;
      const got = byReason.get(reason);
      const per = worth[reason] ?? 1;
      list.append(el('div', { class: 'res-earn-row' },
        el('b', { text: names[reason] }),
        el('span', { class: 'small muted', text: `${per} point${per === 1 ? '' : 's'} each` }),
        el('span', { class: 'res-earn-n', text: String(got?.count || 0) })));
    }
    ledger.append(list);
  }

  // ------------------------------------------------------------------ the board

  /** done / ready / short / blocked — one word, and everything visual hangs off it. */
  function stateOf(node) {
    if (node.taken) return 'done';
    if (node.ok) return 'ready';
    if (node.blocked) return 'blocked';
    return 'short';
  }

  /**
   * A card. Name, cost, a dot, and ONE short line saying where it stands.
   *
   * The line is the part that looks like it could be dropped and cannot: a greyed-out box with
   * nothing beside it is the one answer a player cannot act on, which is the house rule the Holding
   * screen already follows. `node.why` is written to be short for exactly this ("Steelwork and
   * Ground Glass first.", "4 more research points."), so it is a line and not a paragraph. The
   * blurb, the reasoning and the list of what it opens are the side panel's job.
   */
  function drawNode(node) {
    const state = stateOf(node);
    const card = el('button', {
      class: `res-node res-node--${state}` + (node.id === selected ? ' is-picked' : ''),
      type: 'button',
      onclick: () => { selected = node.id; draw(); },
      onmouseenter: () => lightChain(node.id),
      onmouseleave: () => lightChain(null),
      onfocus: () => lightChain(node.id),
      onblur: () => lightChain(null),
    });
    card.append(el('span', { class: 'res-node-top' },
      el('i', { class: `res-dot res-dot--${state}` }),
      el('b', { class: 'res-node-name', text: node.name }),
      el('span', { class: 'res-cost', text: node.taken ? 'done' : `${node.cost} pt${node.cost === 1 ? '' : 's'}` })));
    card.append(el('span', {
      class: 'res-node-state',
      text: node.taken ? 'Done' : (node.ok ? 'Ready to research' : node.why),
    }));
    return card;
  }

  /**
   * The lattice: one grid, four columns, and the row a node stands on chosen by `laneRows`.
   *
   * It is ONE grid rather than four stacked columns for the sake of the wires — a card in age 3 has
   * to line up under the age-2 card it waits on, and two independent flex columns have no way to
   * agree on a row height.
   */
  function drawBoard(ages) {
    lattice.replaceChildren();
    cards.clear();
    wireList = [];
    if (!ages.length) return;

    lattice.style.gridTemplateColumns = `repeat(${ages.length}, var(--res-col))`;

    const rowOf = laneRows(ages);
    ages.forEach((age, i) => {
      const col = i + 1;
      const h = el('div', { class: 'res-col-head', style: `grid-column:${col}; grid-row:1` },
        el('i', { class: 'res-tone', style: `background:${age.tone || '#888'}` }),
        el('h3', { text: age.name }));
      lattice.append(h);

      if (!age.nodes.length) {
        /**
         * Age 1 has no nodes, and saying so out loud is the whole reassurance this screen owes a
         * new player: you are not behind, there is nothing here to buy, go and build something.
         */
        lattice.append(el('p', {
          class: 'res-free small',
          style: `grid-column:${col}; grid-row:2`,
          text: 'Nothing to research. Everything in this age is yours from the moment you land.',
        }));
        return;
      }
      for (const node of age.nodes) {
        const card = drawNode(node);
        card.style.gridColumn = String(col);
        card.style.gridRow = String((rowOf.get(node.id) || 0) + 2);
        lattice.append(card);
        cards.set(node.id, card);
      }
    });

    // the wires, drawn behind the cards. One per `needs` entry, coloured by where its TARGET stands,
    // because the question a wire answers is "what is holding that one up".
    wires.replaceChildren();
    for (const age of ages) {
      for (const node of age.nodes) {
        for (const need of node.needs || []) {
          if (!cards.has(need) || !cards.has(node.id)) continue;
          const path = svgEl('path', { class: `res-wire res-wire--${stateOf(node)}`, d: 'M0,0', fill: 'none' });
          wires.append(path);
          wireList.push({ from: need, to: node.id, el: path });
        }
      }
    }
  }

  /**
   * MEASURE THE CARDS, THEN DRAW THE CURVES.
   *
   * The grid decides where a card lands, not us, so the wires cannot be positioned until the browser
   * has laid the grid out — which is why this runs off `requestAnimationFrame` after every draw and
   * again whenever the board changes size. In node there is no box model at all and it does nothing,
   * which is correct: a test asserts that the wire exists and carries the right pair of ids, not
   * where it is on screen.
   */
  let lastSize = '';
  function layoutWires(force = false) {
    if (!wireList.length) return;
    if (typeof canvas.getBoundingClientRect !== 'function') return;
    const base = canvas.getBoundingClientRect();
    if (!base.width || !base.height) return;
    /**
     * Nothing moved, nothing to redraw. Without this the ResizeObserver below and the attributes
     * this function writes can keep waking each other up, which the browser reports as a resize loop
     * — a warning in the console rather than a hang, but it is noise we would then have to explain.
     */
    const size = `${Math.round(base.width)}x${Math.round(base.height)}`;
    if (!force && size === lastSize) return;
    lastSize = size;
    const w = Math.max(1, Math.ceil(base.width));
    const h = Math.max(1, Math.ceil(base.height));
    wires.setAttribute('width', w);
    wires.setAttribute('height', h);
    wires.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const box = node => {
      const r = node.getBoundingClientRect();
      return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
    };
    for (const wire of wireList) {
      const a = cards.get(wire.from);
      const b = cards.get(wire.to);
      if (!a || !b) continue;
      const A = box(a);
      const B = box(b);
      let d;
      if (B.x > A.x + A.w - 4) {
        // a different column: out of the right-hand edge and into the left-hand edge
        const x1 = A.x + A.w, y1 = A.y + A.h / 2, x2 = B.x, y2 = B.y + B.h / 2;
        const bend = Math.max(18, (x2 - x1) * 0.5);
        d = `M${px(x1)},${px(y1)} C${px(x1 + bend)},${px(y1)} ${px(x2 - bend)},${px(y2)} ${px(x2)},${px(y2)}`;
      } else {
        // the same column: straight down from the bottom edge into the top edge
        const x1 = A.x + A.w / 2, y1 = A.y + A.h, x2 = B.x + B.w / 2, y2 = B.y;
        const bend = Math.max(14, (y2 - y1) * 0.5);
        d = `M${px(x1)},${px(y1)} C${px(x1)},${px(y1 + bend)} ${px(x2)},${px(y2 - bend)} ${px(x2)},${px(y2)}`;
      }
      wire.el.setAttribute('d', d);
    }
  }

  /**
   * Hover a card and the whole chain behind it lights up — the node, everything it waits on, and
   * every wire between them.
   *
   * This is the half of "networked requirements" that a static picture cannot do. With seven nodes
   * the arrows are already followable by eye; with thirty they would not be, and the chain highlight
   * is the answer to "what would I have to buy first" in one gesture rather than four clicks.
   */
  function chainOf(id, out = new Set()) {
    if (!id || out.has(id)) return out;
    out.add(id);
    for (const need of nodeById.get(id)?.needs || []) chainOf(need, out);
    return out;
  }

  function lightChain(id) {
    const lit = id ? chainOf(id) : new Set();
    for (const [nodeId, card] of cards) card.classList.toggle('is-lit', lit.has(nodeId));
    for (const wire of wireList) wire.el.classList.toggle('is-lit', lit.has(wire.from) && lit.has(wire.to));
    // the class goes on the WRAPPER, not on the lattice: the wire layer is drawn before the cards so
    // that it sits behind them, and a CSS sibling selector only ever looks forwards
    canvas.classList.toggle('is-tracing', lit.size > 0);
  }

  // ------------------------------------------------------------------ the side panel

  /**
   * EVERYTHING THE CARD NO LONGER SAYS, for the one node you picked.
   *
   * This is where the text that used to be printed seven times over now lives exactly once. It also
   * carries the Research button, which is the only place on the screen anything is spent.
   */
  function drawDetail(ages) {
    detail.replaceChildren();
    const node = selected ? nodeById.get(selected) : null;
    if (!node) {
      detail.append(el('p', { class: 'res-empty small muted', text: 'Pick a node on the board to see what it opens.' }));
      return;
    }
    const age = ages.find(a => a.id === node.age);
    const state = stateOf(node);

    detail.append(el('div', { class: 'res-detail-head' },
      el('i', { class: `res-dot res-dot--${state}` }),
      el('h3', { text: node.name })));
    detail.append(el('p', { class: 'res-detail-age small muted' },
      el('i', { class: 'res-tone', style: `background:${age?.tone || '#888'}` }),
      el('span', { text: `${age?.name || ''} · ${node.cost} point${node.cost === 1 ? '' : 's'}` })));

    if (node.blurb) detail.append(el('p', { class: 'res-blurb', text: node.blurb }));
    if (node.why) detail.append(el('p', { class: 'res-why small muted', text: node.why }));

    if (node.needNames?.length) {
      const pane = el('div', { class: 'res-sect' }, el('h4', { text: 'Needs first' }));
      const chips = el('div', { class: 'res-chips' });
      (node.needs || []).forEach((id, i) => {
        const dep = nodeById.get(id);
        chips.append(el('button', {
          class: 'res-chip res-chip--' + (dep ? stateOf(dep) : 'blocked'),
          type: 'button',
          text: node.needNames[i] || id,
          onclick: () => { selected = id; draw(); },
        }));
      });
      pane.append(chips);
      detail.append(pane);
    }

    if (node.opens?.length) {
      const pane = el('div', { class: 'res-sect' }, el('h4', { text: `Opens ${node.opens.length} piece${node.opens.length === 1 ? '' : 's'}` }));
      const chips = el('div', { class: 'res-chips' });
      for (const name of node.opens) chips.append(el('span', { class: 'res-open', text: name }));
      pane.append(chips);
      detail.append(pane);
    }

    if (node.grants?.length) {
      const pane = el('div', { class: 'res-sect' }, el('h4', { text: `Grants ${node.grants.length} recipe${node.grants.length === 1 ? '' : 's'}` }));
      const chips = el('div', { class: 'res-chips' });
      for (const id of node.grants) chips.append(el('span', { class: 'res-open', text: String(id).replace(/_/g, ' ') }));
      pane.append(chips);
      detail.append(pane);
    }

    const foot = el('div', { class: 'res-detail-foot' });
    if (node.taken) {
      foot.append(el('span', { class: 'res-verdict res-verdict--done', text: 'Done' }));
    } else {
      const b = el('button', {
        class: 'res-buy',
        type: 'button',
        text: `Research ${node.name}`,
        onclick: () => {
          const out = research.buy(node.id);
          if (!out.ok) say(out.why, 'warn');
          draw();
        },
      });
      b.disabled = !node.ok;
      foot.append(b);
      // the sentence, always — a greyed-out button with nothing beside it is the one answer a
      // player cannot act on, which is the house rule the Holding screen already follows
      if (!node.ok) foot.append(el('span', { class: 'res-verdict', text: node.why }));
    }
    detail.append(foot);
  }

  // ------------------------------------------------------------------ drawing the lot

  /**
   * The panel shows something the moment the screen opens rather than an empty box waiting for a
   * click: the first node you could buy this instant, or failing that the first you have not bought.
   */
  function firstWorthShowing(ages) {
    const all = ages.flatMap(a => a.nodes);
    return all.find(n => n.ok)?.id || all.find(n => !n.taken)?.id || all[0]?.id || null;
  }

  function draw() {
    if (!open || !research) return;
    const ages = research.board?.() || [];
    nodeById = new Map(ages.flatMap(a => a.nodes).map(n => [n.id, n]));
    if (!selected || !nodeById.has(selected)) selected = firstWorthShowing(ages);
    drawHead();
    drawLedger();
    drawBoard(ages);
    drawDetail(ages);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => layoutWires(true));
    else layoutWires(true);
  }

  /**
   * The wires are measured, so anything that moves a card has to remeasure them: the sheet opening,
   * the window changing size, the ledger folding away. A ResizeObserver covers all three without
   * anybody having to remember to call it.
   */
  if (typeof ResizeObserver === 'function') {
    try { new ResizeObserver(() => layoutWires()).observe(canvas); } catch { /* no layout, no wires */ }
  }

  const api = {
    get root() { return root; },
    /** js/hud.js's contract: hand it a box, it puts itself in. */
    mount(parent) {
      (parent || document.body)?.appendChild(root);
      draw();
      return api;
    },
    show() { open = true; root.hidden = false; draw(); return api; },
    hide() { open = false; if (standalone) root.hidden = true; return api; },
    toggle() { return (open && standalone) ? api.hide() : api.show(); },
    get open() { return open; },
    draw,
    refresh: draw,
    /** Which node the side panel is showing, and a way to point it at one from outside. */
    get selected() { return selected; },
    select(id) { if (nodeById.has(id)) { selected = id; draw(); } return selected; },
    /**
     * R17 — how many nodes could be bought this instant, for the character sheet's rail badge.
     *
     * An unspent point is invisible unless you happen to open the screen it belongs to, which is
     * the reason `railBadges()` exists at all (round 14 added it for perk and talent points).
     */
    ready() { return research?.summary?.()?.ready || 0; },
    dispose() { root.remove(); },
  };

  if (standalone && typeof document !== 'undefined') {
    document.addEventListener('keydown', e => {
      if (open && e.key === 'Escape') { api.hide(); e.stopPropagation(); }
    }, true);
  }

  if (mount) api.mount(mount);
  return api;
}
