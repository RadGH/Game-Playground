// Procedural Towns — the page.
//
// Knobs on the left, plans on the right. Nothing in here is clever: it reads the controls, calls
// `planTown`, and hands the result to `drawPlan`. All the thinking is in js/townplan.js, which is
// the module Farhold imports — so this page cannot drift from the game by accident.

import { planTown, overlaps, summarise, CULTURES } from './townplan.js';
import { drawPlan, drawOverlaps } from './draw2d.js';

const $ = id => document.getElementById(id);
const stage = $('stage');

// the culture list comes from the data, so adding a culture adds an option here for free
for (const [key, cfg] of Object.entries(CULTURES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = cfg.name;
  $('culture').append(opt);
}

/** Read every control once, so the draw path never touches the DOM twice for the same value. */
function readControls() {
  return {
    seed: Math.max(1, Number($('seed').value) || 1),
    size: Number($('size').value),
    culture: $('culture').value,
    compare: $('ov-compare').checked,
    find: $('find').value.trim().toLowerCase(),
    show: {
      plots: $('ov-plots').checked,
      blocks: $('ov-blocks').checked,
      frontage: $('ov-frontage').checked,
    },
  };
}

/** One canvas, sized for the device so the lines are not soft on a retina screen. */
function canvasFor(w, h) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.aspectRatio = `${w} / ${h}`;
  return c;
}

let current = null;

function render() {
  const cfg = readControls();
  $('size-val').textContent = cfg.size;
  stage.className = cfg.compare ? 'four' : 'one';
  stage.replaceChildren();

  /**
   * Four seeds at once is the sameness test you can do with your eyes.
   *
   * The complaint that started this experiment was "all the towns look and feel the same", and the
   * fastest way to know whether that is fixed is to put four of them next to each other. If they
   * look like one town drawn four times, the knobs are wrong.
   */
  const seeds = cfg.compare
    ? [cfg.seed, cfg.seed + 1, cfg.seed + 2, cfg.seed + 3]
    : [cfg.seed];
  const size = cfg.compare ? 420 : 900;

  let first = null;
  for (const seed of seeds) {
    const plan = planTown({ seed, size: cfg.size, culture: cfg.culture });
    if (!first) first = plan;
    const c = canvasFor(size, size);
    const ctx = c.getContext('2d');
    drawPlan(ctx, plan, {
      width: c.width, height: c.height,
      show: cfg.show,
      highlight: cfg.find || null,
    });
    drawOverlaps(ctx, plan, overlaps(plan), { width: c.width, height: c.height });
    stage.append(c);
  }

  current = first;
  showStats(first, cfg);
}

function showStats(plan, cfg) {
  const s = summarise(plan);
  const hits = overlaps(plan);
  const verdict = $('validate');
  if (hits.length) {
    verdict.className = 'verdict bad';
    verdict.textContent = `${hits.length} overlap${hits.length === 1 ? '' : 's'} — a building is on a street or on another building. The planner is wrong, not the renderer.`;
  } else {
    verdict.className = 'verdict ok';
    verdict.textContent = 'No overlaps. Nothing sits on a street.';
  }

  const named = Object.entries(s.wants)
    .filter(([k]) => k !== 'house' && k !== 'hut')
    .map(([k, n]) => `${k}${n > 1 ? ` ×${n}` : ''}`)
    .join(', ');
  $('stats').innerHTML = `
    <b>${CULTURES[cfg.culture].name}</b> settlement, size ${s.size}, seed ${s.seed} ·
    <b>${s.streets}</b> streets · <b>${s.plots}</b> plots ·
    <b>${s.gates}</b> gate${s.gates === 1 ? '' : 's'} ·
    square ${s.square} m<br>
    ${named ? `Has: ${named}` : 'Nothing but homes — too small to want a trade.'}<br>
    Homes: ${(s.wants.house || 0) + (s.wants.hut || 0)}`;
}

/**
 * The sameness report, in numbers rather than vibes.
 *
 * Two hundred towns, and what comes back is the spread: if every town has the same plot count and
 * the same street count, they ARE the same town and no amount of looking at one will tell you.
 */
function batchReport() {
  const cfg = readControls();
  const rows = [];
  let worstOverlap = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const plan = planTown({ seed, size: cfg.size, culture: cfg.culture });
    worstOverlap = Math.max(worstOverlap, overlaps(plan).length);
    rows.push(summarise(plan));
  }
  const spread = key => {
    const vals = rows.map(r => r[key]).sort((a, b) => a - b);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return `${vals[0]}–${vals[vals.length - 1]} (mean ${mean.toFixed(1)}, ${new Set(vals).size} distinct)`;
  };
  $('report').textContent =
    `200 ${CULTURES[cfg.culture].name} towns at size ${cfg.size}\n` +
    `streets  ${spread('streets')}\n` +
    `plots    ${spread('plots')}\n` +
    `gates    ${spread('gates')}\n` +
    `square   ${spread('square')}\n` +
    `overlaps ${worstOverlap} (must be 0)`;
}

// ---------------------------------------------------------------------------- wiring

for (const id of ['seed', 'size', 'culture', 'find', 'ov-plots', 'ov-blocks', 'ov-frontage', 'ov-compare']) {
  $(id).addEventListener('input', render);
  $(id).addEventListener('change', render);
}
$('reroll').onclick = () => { $('seed').value = Math.floor(Math.random() * 99999) + 1; render(); };
$('prev').onclick = () => { $('seed').value = Math.max(1, Number($('seed').value) - 1); render(); };
$('next').onclick = () => { $('seed').value = Number($('seed').value) + 1; render(); };
$('batch').onclick = batchReport;

// arrow keys step through seeds, because stepping is how you spot a bad one
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'ArrowLeft') { $('prev').click(); e.preventDefault(); }
  if (e.key === 'ArrowRight') { $('next').click(); e.preventDefault(); }
});

/**
 * Copy and paste a plan.
 *
 * This page is served over plain http on a LAN address, which is not a secure context, so
 * `navigator.clipboard` is simply absent. A hidden textarea and `execCommand` is not elegant and it
 * is the thing that actually works here.
 */
$('copy').onclick = () => {
  if (!current) return;
  const text = JSON.stringify({ seed: current.seed, size: current.size, culture: current.culture }, null, 1);
  const box = document.createElement('textarea');
  box.value = text;
  box.style.cssText = 'position:fixed;top:-1000px';
  document.body.append(box);
  box.select();
  try { document.execCommand('copy'); } catch { /* the prompt below is the fallback */ }
  box.remove();
  $('report').textContent = `Copied:\n${text}`;
};
$('paste').onclick = () => {
  const text = prompt('Paste a plan JSON:');
  if (!text) return;
  try {
    const p = JSON.parse(text);
    if (p.seed) $('seed').value = p.seed;
    if (p.size) $('size').value = p.size;
    if (p.culture && CULTURES[p.culture]) $('culture').value = p.culture;
    render();
  } catch { $('report').textContent = 'That is not a plan.'; }
};

render();
document.body.dataset.ready = '1';
