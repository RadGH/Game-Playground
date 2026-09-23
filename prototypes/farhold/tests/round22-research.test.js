// Farhold R22 — the Research board: the tree is a real lattice, and the screen has a bottom.
//
// TWO FAULTS IN ONE REPORT, and they are not the same kind of thing.
//
//   "'Reagents' goes off screen and I can't scroll down. Can we redesign this menu … having smaller
//    boxes with networked relationship/requirements and click to view more details in a side popup?
//    Rather than just a massive screen of text."
//
// The first is a box with no height in it: `.res-body` asks to scroll, and a flex child only becomes
// a scroller when its parent has a height to divide up. The overlay had one and the character-sheet
// tab did not, so the screen grew past the bottom of the sheet and the tab's `overflow: hidden` cut
// it off. That is checked here as a RULE about the stylesheet — a height is set on `.research`, and
// the overlay still has its own bound — rather than as a string match on one selector, because the
// selector is allowed to change and the rule is not.
//
// The second is the shape of the data, which the new board draws directly. A column is an age and a
// wire is a `needs` entry, so a node whose age does not exist, or whose `needs` names nothing, or
// whose `needs` points forwards into a later age, is a wire drawn to nowhere. None of that was
// checkable while the screen was a list of paragraphs; it is now, so it is checked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createResearch } from '../js/research.js';
import { laneRows } from '../js/research-ui.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(here, '..', p), 'utf8');

const DATA = JSON.parse(read('data/research.json'));
const AGE_IDS = DATA.ages.map(a => a.id);
const NODE_IDS = new Set(DATA.nodes.map(n => n.id));

// ---------------------------------------------------------------- the tree is a drawable lattice

test('every node stands in an age the data declares', () => {
  for (const node of DATA.nodes) {
    assert.ok(AGE_IDS.includes(node.age), `${node.id} is in age "${node.age}", which is not one of the ages`);
  }
});

test('every `needs` names a real node', () => {
  for (const node of DATA.nodes) {
    for (const need of node.needs || []) {
      assert.ok(NODE_IDS.has(need), `${node.id} waits on "${need}", which is not a node — that is a wire to nowhere`);
    }
  }
});

test('nothing waits on a node in a later age', () => {
  // A column is an age, and a wire always runs left to right. A prerequisite one column further on
  // would draw backwards, and worse, would mean an age you cannot finish in its own order.
  const ageIndex = new Map(AGE_IDS.map((id, i) => [id, i]));
  for (const node of DATA.nodes) {
    for (const need of node.needs || []) {
      const dep = DATA.nodes.find(n => n.id === need);
      assert.ok(ageIndex.get(dep.age) <= ageIndex.get(node.age),
        `${node.id} (${node.age}) waits on ${dep.id} (${dep.age}), which comes later`);
    }
  }
});

test('the needs graph has no cycles, so every node is reachable from nothing', () => {
  // depth-first with a colour per node: grey = on the current path, black = finished.
  const state = new Map();
  const byId = new Map(DATA.nodes.map(n => [n.id, n]));
  const walk = (id, trail) => {
    if (state.get(id) === 'black') return;
    assert.notEqual(state.get(id), 'grey', `${[...trail, id].join(' -> ')} is a loop — nothing in it can ever be bought`);
    state.set(id, 'grey');
    for (const need of byId.get(id)?.needs || []) walk(need, [...trail, id]);
    state.set(id, 'black');
  };
  for (const node of DATA.nodes) walk(node.id, []);
});

test('a node is named by exactly one other thing at most — no two nodes unlock the same piece', () => {
  const owner = new Map();
  for (const node of DATA.nodes) {
    for (const sid of node.unlocks || []) {
      assert.equal(owner.has(sid), false, `${sid} is unlocked by both ${owner.get(sid)} and ${node.id}`);
      owner.set(sid, node.id);
    }
  }
});

// ---------------------------------------------------------------- where the board puts each node

test('a node always stands below everything it waits on, and no two share a slot', () => {
  const research = createResearch({ data: DATA });
  const ages = research.board();
  const rows = laneRows(ages);

  for (const node of DATA.nodes) {
    for (const need of node.needs || []) {
      assert.ok(rows.get(node.id) > rows.get(need),
        `${node.id} is drawn level with or above ${need}, so the wire between them runs upward`);
    }
  }

  // two nodes in one column on one row would be drawn on top of each other
  const seen = new Set();
  for (const node of DATA.nodes) {
    const slot = `${node.age}#${rows.get(node.id)}`;
    assert.equal(seen.has(slot), false, `two nodes share slot ${slot}`);
    seen.add(slot);
  }
});

test('an age with no nodes takes no rows, and age 1 is that age on purpose', () => {
  const research = createResearch({ data: DATA });
  const first = research.board()[0];
  assert.equal(first.nodes.length, 0, 'age 1 has nodes now — the screen says it never will');
});

// ---------------------------------------------------------------- the screen

test('the board draws one column per age, one card per node and one wire per requirement', async () => {
  const { installTinyDom } = await import('./tiny-dom.mjs');
  const dom = installTinyDom();
  try {
    const { createResearchScreen } = await import('../js/research-ui.js');
    const research = createResearch({ data: DATA });
    const screen = createResearchScreen({ research });
    screen.mount(dom.body);

    assert.equal(screen.root.querySelectorAll('.res-col-head').length, DATA.ages.length,
      'an age is a column and every age gets one, including the empty one');
    assert.equal(screen.root.querySelectorAll('.res-node').length, DATA.nodes.length,
      'every node is on the board from the first minute, including the ones ten hours away');
    const wires = screen.root.querySelectorAll('.res-wire');
    const needCount = DATA.nodes.reduce((n, x) => n + (x.needs || []).length, 0);
    assert.equal(wires.length, needCount, 'a requirement that is not drawn is a requirement nobody can see');
  } finally {
    dom.restore();
  }
});

test('a card carries a state and a short line, and the paragraphs are in the side panel', () => {
  // The redesign's whole claim: the board is readable without reading. A card says name, cost and
  // one sentence; the blurb and the list of what a node opens are shown once, for the node picked.
  const src = read('js/research-ui.js');
  assert.match(src, /res-node--\$\{state\}/, 'a card no longer carries its state as a class');
  const card = src.slice(src.indexOf('function drawNode'), src.indexOf('function drawBoard'));
  assert.equal(/node\.blurb/.test(card), false, 'the blurb is back on the card — that is the wall of text');
  assert.equal(/node\.opens/.test(card), false, 'the list of unlocks is back on the card');
  const panel = src.slice(src.indexOf('function drawDetail'), src.indexOf('function firstWorthShowing'));
  for (const field of ['node.blurb', 'node.why', 'node.needNames', 'node.opens']) {
    assert.ok(panel.includes(field), `the side panel never shows ${field}`);
  }
});

test('picking a node shows it, and a prerequisite chip moves the panel to what is holding it up', async () => {
  const { installTinyDom } = await import('./tiny-dom.mjs');
  const dom = installTinyDom();
  try {
    const { createResearchScreen } = await import('../js/research-ui.js');
    const research = createResearch({ data: DATA });
    const screen = createResearchScreen({ research });
    screen.mount(dom.body);

    // the panel is never an empty box waiting for a click
    assert.ok(screen.selected, 'nothing is picked when the screen opens');

    const wiring = DATA.nodes.find(n => (n.needs || []).length === 1);
    screen.select(wiring.id);
    assert.equal(screen.selected, wiring.id);
    const panel = screen.root.querySelector('.res-detail');
    assert.match(panel.textContent, new RegExp(wiring.name));
    assert.match(panel.textContent, new RegExp(wiring.blurb.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const chip = panel.querySelectorAll('.res-chip')[0];
    assert.ok(chip, 'a node with a prerequisite shows no way to go and look at it');
    chip.click();
    assert.equal(screen.selected, wiring.needs[0], 'the prerequisite chip went nowhere');
  } finally {
    dom.restore();
  }
});

test('the Research button is the only place a point is spent, and it says why it will not press', async () => {
  const { installTinyDom } = await import('./tiny-dom.mjs');
  const dom = installTinyDom();
  try {
    const { createResearchScreen } = await import('../js/research-ui.js');
    const research = createResearch({ data: DATA });
    const screen = createResearchScreen({ research });
    screen.mount(dom.body);

    const first = DATA.nodes.find(n => !(n.needs || []).length);
    screen.select(first.id);
    let buy = screen.root.querySelector('.res-buy');
    assert.equal(buy.disabled, true, 'a node is buyable with no points at all');
    assert.match(screen.root.querySelector('.res-detail').textContent, /more research point/,
      'the refusal is a grey button and nothing else');

    research.award('boss', 1);
    screen.draw();
    buy = screen.root.querySelector('.res-buy');
    assert.equal(buy.disabled, false);
    buy.click();
    assert.equal(research.isTaken(first.id), true, 'the button spent nothing');

    // and the card says so without anybody opening the panel
    const card = screen.root.querySelectorAll('.res-node').find(n => new RegExp(first.name).test(n.textContent));
    assert.match(card.className, /res-node--done/);
  } finally {
    dom.restore();
  }
});

test('the ledger is still on the screen after being moved off the grid', async () => {
  const { installTinyDom } = await import('./tiny-dom.mjs');
  const dom = installTinyDom();
  try {
    const { createResearchScreen } = await import('../js/research-ui.js');
    const research = createResearch({ data: DATA });
    const screen = createResearchScreen({ research });
    screen.mount(dom.body);
    // every reason is a row whether or not you have earned any of that kind — the list is the
    // instruction, which is the whole reason it is on this screen rather than in the docs
    for (const [reason, name] of Object.entries(DATA.reasons)) {
      if (reason === 'default') continue;
      assert.match(screen.root.textContent, new RegExp(name), `"${name}" is not on the screen`);
    }
  } finally {
    dom.restore();
  }
});

// ---------------------------------------------------------------- the screen has a bottom

test('the screen bounds its own height, so its body can be a scroller', () => {
  const css = read('research.css');

  /** The rule as a rule: `.res-body` asks to scroll, which needs a bounded parent. */
  const block = name => {
    const at = css.indexOf(`\n${name} {`);
    assert.notEqual(at, -1, `${name} has no rule in research.css`);
    return css.slice(at, css.indexOf('}', at));
  };

  const body = block('.res-body');
  assert.match(body, /min-height:\s*0/, '.res-body has no min-height:0, so it will not shrink below its content');

  const screen = block('.research');
  assert.match(screen, /height:\s*100%/,
    'the screen sets no height, so mounted in a tab it grows past the bottom and `.res-body` never scrolls');

  // …and the overlay, which floats and is bounded by the window instead, still has its own bound
  const overlay = block('.research--overlay');
  assert.match(overlay, /max-height:\s*min\(/, 'the overlay lost the bound that made it scroll in R17');
});

test('the board scrolls in both directions and the side panel scrolls on its own', () => {
  const css = read('research.css');
  const block = name => {
    const at = css.indexOf(`\n${name} {`);
    assert.notEqual(at, -1, `${name} has no rule in research.css`);
    return css.slice(at, css.indexOf('}', at));
  };
  assert.match(block('.res-board'), /overflow:\s*auto/, 'the board does not scroll, so a far node is unreachable');
  assert.match(block('.res-board'), /min-height:\s*0/);
  assert.match(block('.res-detail'), /overflow-y:\s*auto/, 'a long node description has no way down');

  // at the project's narrow floor the panel goes under the board rather than squeezing it to nothing
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.res-body \{ flex-direction: column/,
    'the board and a 272px panel stay side by side on a narrow screen');
});

test('the overlay still closes on Escape, and it is a capture-phase listener', () => {
  const src = read('js/research-ui.js');
  const at = src.indexOf('if (standalone && typeof document');
  assert.notEqual(at, -1, 'the standalone overlay lost its Escape handler');
  const tail = src.slice(at, at + 400);
  assert.match(tail, /'Escape'/);
  assert.match(tail, /api\.hide\(\)/);
  assert.match(tail, /\}, true\)/, 'the Escape listener is no longer capture-phase, so the sheet eats it first');
});

test('the screen keeps the API js/main.js and js/build-ui.js call', async () => {
  const { installTinyDom } = await import('./tiny-dom.mjs');
  const dom = installTinyDom();
  try {
    const { createResearchScreen } = await import('../js/research-ui.js');
    const research = createResearch({ data: DATA });
    const screen = createResearchScreen({ research, standalone: true });
    for (const key of ['root', 'mount', 'show', 'hide', 'toggle', 'open', 'draw', 'refresh', 'ready', 'dispose']) {
      assert.ok(key in screen, `the screen no longer has ${key}, which another file calls`);
    }
    screen.mount(dom.body);
    assert.equal(screen.open, false, 'a standalone overlay starts open');
    screen.toggle();
    assert.equal(screen.open, true);
    screen.toggle();
    assert.equal(screen.open, false);
    assert.equal(screen.ready(), research.summary().ready);
    screen.dispose();
  } finally {
    dom.restore();
  }
});
