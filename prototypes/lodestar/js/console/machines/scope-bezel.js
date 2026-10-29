// The Tactical Scope: the only view of the world (PLAN §0.1). A CRT behind a brass-and-steel bezel with a grid
// reference stencilled round the glass, a readout strip (pen grid ref, range, filter), the DEGAUSS button, and the
// light pen. The picture is the real sim's cells drawn by the WebGL scope (js/render/scope.js via
// js/console/world-link.js); this file draws the phosphor overlay on top of it — since M3 the economy too: building
// labels and their three jam lamps, sites with progress, the BUILD ghost (green / red, with its yard ring or reach),
// road blueprints and the road price on the pen, red gaps where a road was refused, survey pulses, and the ORE and
// FLOW filter layers.

import { machinePanel } from './panel.js';
import { colName, GRID, gridRef } from '../view.js';
import { createPen } from '../pen.js';
import { drawGrid, drawHQ, drawRing, drawReticle, drawBlueprint, drawMarker, drawLabel, drawLamps, drawFootprint, drawDashed, drawPulse, PHOSPHOR } from '../../render/sprites.js';
import { createWorldRenderer } from '../world-link.js';
import { planRoad, cutPolyline } from '../../world/vectors.js';
import { compileMaterials } from '../../world/materials.js';
import { ghostCheck } from '../../sim/economy/buildings.js';

export async function pickRenderer(canvas, materials, link) {
  return createWorldRenderer({ canvas, materials, size: link.size, data: link.data });
}

export async function mountScope(C) {
  const { el, body } = machinePanel({ id: 'scope', title: 'TACTICAL SCOPE', cls: 'machine-scope' });
  body.innerHTML = `
    <div class="bezel">
      <div class="grid-cols" aria-hidden="true"></div>
      <div class="grid-rows" aria-hidden="true"></div>
      <div class="glass" data-pad="scope" tabindex="-1" aria-label="Tactical scope picture">
        <canvas class="scope-world"></canvas>
        <canvas class="scope-over"></canvas>
        <div class="crt-lines"></div><div class="crt-shine"></div><div class="crt-vignette"></div>
        <div class="scope-stamp stamp-chart">CHART</div>
        <div class="scope-stamp stamp-filter"></div>
        <div class="scope-stamp stamp-paused">TIME STOPPED</div>
      </div>
    </div>
    <div class="scope-readout">
      <span class="ro ro-grid" title="Grid square under the pen">GRID <b>—</b></span>
      <span class="ro ro-cell"><b>—</b></span>
      <span class="ro ro-range">RANGE <b>—</b></span>
      <span class="ro ro-filter"><b>SIGHT</b></span>
      <button type="button" class="degauss" aria-label="Degauss">DEGAUSS</button>
    </div>`;
  const glass = body.querySelector('.glass');
  const world = body.querySelector('.scope-world'), over = body.querySelector('.scope-over');
  const octx = over.getContext('2d');
  const colsEl = body.querySelector('.grid-cols'), rowsEl = body.querySelector('.grid-rows');
  const ro = { grid: body.querySelector('.ro-grid b'), cell: body.querySelector('.ro-cell b'), range: body.querySelector('.ro-range b'), filter: body.querySelector('.ro-filter b') };
  const renderer = await pickRenderer(world, C.game.link.materials, C.game.link);
  const { view, state, data } = C;
  el.dataset.renderer = renderer.kind;
  let lastVk = '', dpr = 1, W = 1, H = 1, blueprints = [], markers = [], lastGridKey = '', lastPaint = 0, wobble = 0;
  const E = C.econ;                     // buildings, roads, survey, hud — kept by main.js from the frames
  const M = compileMaterials(C.game.link.materials);
  const pulses = [], gaps = [];         // survey pulse rings; red gaps where a road was refused
  const roadDoors = () => [...E.buildings.values()].filter((b) => b.kind === 'building' && b.door).map((b) => [b.door[0], b.door[1], b.id]);

  const pen = createPen({
    glass, view, data,
    getTool: () => state.get('tool'),
    getSettings: () => C.settings,
    sound: (id, o) => C.room.play(id, o),
    onZoom: (d, sx, sy) => C.rangeStep(d, sx, sy),
    onStroke: (tool, pts) => {
      if (C.penTools?.[tool]?.stroke) return C.penTools[tool].stroke(pts); // pen tools added by later milestones (M6: aiming a line spell)
      const cmd = { wall: 'drawWall', road: 'drawRoad', rail: 'drawRail', order: 'setOrder' }[tool];
      blueprints.push({ kind: tool, pts, state: 'placed', at: performance.now() });
      C.send(tool === 'order' ? { t: cmd, squad: null, order: { type: 'patrol', path: pts } } : { t: cmd, pts, closed: false });
    },
    onClick: (tool, [x, y]) => {
      if (C.penTools?.[tool]?.click) return C.penTools[tool].click([x, y]); // M6: aiming a spell
      if (tool.startsWith('tap:')) return; // a tap with a line tool nobody listens for
      if (tool === 'build') {
        const type = state.get('buildType');
        if (!type) { C.openLedger('cards'); C.print({ who: 'Quartermaster', text: 'PICK A CARD IN THE BUILD LEDGER, THEN A SPOT ON THE SCOPE.' }); return; }
        C.send({ t: 'build', type, x, y, rot: 0 });
      } else C.send({ t: 'demolish', id: null, x, y });
    },
    onTap: ([x, y]) => {
      // no switch up: a tap reads the card of the building under the pen
      const b = buildingAt(x, y);
      if (b) { C.inspect(b.id); C.room.play('press'); }
    },
    // things worth pointing at: buildings and the known outcrops
    snapTargets: () => [...[...E.buildings.values()].map((b) => ({ x: b.x, y: b.y })), ...(E.survey?.outcrops || [])],
  });

  function buildingAt(x, y) {
    for (const b of E.buildings.values()) { const f = b.fp; if (f && x >= f.x0 && y >= f.y0 && x < f.x0 + f.w && y < f.y0 + f.h) return b; }
    return null;
  }

  function resize() {
    const r = glass.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(2, window.devicePixelRatio || 1) * ([0.75, 1, 1][C.settings.quality] ?? 1);
    W = r.width; H = r.height;
    view.setScreen(W, H);
    renderer.resize(W, H, dpr);
    over.width = Math.round(W * dpr); over.height = Math.round(H * dpr);
    pen.follow(); lastGridKey = '';
  }
  new ResizeObserver(resize).observe(glass);

  function paintGrid() {
    const [x0, y0, x1, y1] = view.rect();
    const key = [Math.round(x0), Math.round(y0), view.ppc, W, H].join(',');
    if (key === lastGridKey) return; lastGridKey = key;
    // one stencil per 64-cell square; at long range only every second or fourth so the labels never collide
    const every = Math.max(1, Math.ceil(26 / (GRID * view.ppc)));
    const step = GRID * every, [N] = view.size;
    let ch = '', rh = '';
    for (let gx = Math.max(0, Math.floor(x0 / step) * step); gx < Math.min(N, x1); gx += step) {
      const [sx] = view.toScreen(gx + step / 2, 0); if (sx < 6 || sx > W - 6) continue;
      ch += `<span style="left:${sx.toFixed(0)}px">${colName(gx / GRID)}</span>`;
    }
    for (let gy = Math.max(0, Math.floor(y0 / step) * step); gy < Math.min(N, y1); gy += step) {
      const [, sy] = view.toScreen(0, gy + step / 2); if (sy < 6 || sy > H - 6) continue;
      rh += `<span style="top:${sy.toFixed(0)}px">${gy / GRID + 1}</span>`;
    }
    colsEl.innerHTML = ch; rowsEl.innerHTML = rh;
  }

  const toS = (x, y) => view.toScreen(x, y);
  const resName = (r) => E.data.R[r]?.name.toUpperCase() || r;
  const fmtN = (n) => n >= 10000 ? Math.round(n / 1000) + 'K' : String(Math.round(n));

  function overlay(t) {
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, W, H);
    const step = view.ppc >= 2 ? GRID : GRID * 4;
    drawGrid(octx, view, W, H, step);
    const filter = state.get('filter');
    const ppc = view.ppc;
    const [vx0, vy0, vx1, vy1] = view.rect();
    const onView = (x, y, m = 40) => x > vx0 - m && y > vy0 - m && x < vx1 + m && y < vy1 + m;
    // sensor rings
    // sensor rings: the long-range ones (HQ, masts); a camp's own little sight circle would only clutter the glass
    for (const s of E.hud?.sensors || []) if (s.r >= 60) drawRing(octx, ...toS(s.x, s.y), s.r * ppc, filter === 'sight' ? PHOSPHOR.dim : PHOSPHOR.faint);
    // FLOW: yard rings (pools), what each standalone store holds
    if (filter === 'flow') {
      for (const b of E.buildings.values()) {
        if (b.ring && b.built >= 1) drawRing(octx, ...toS(b.fp.cx, b.fp.cy), b.ring * ppc, 'rgba(255,195,90,0.55)', [3, 4]);
        if (b.store && !b.poolHq && b.built >= 1 && onView(b.x, b.y)) {
          const tot = Object.values(b.store).reduce((a, n) => a + n, 0);
          const [sx, sy] = toS(b.fp.cx, b.fp.y0);
          drawLabel(octx, sx, sy - 4, `${fmtN(tot)}/${b.cap}`, { colour: tot >= b.cap ? PHOSPHOR.red : PHOSPHOR.amber, size: 9 });
        }
      }
    }
    // FLOW: every porter, cart and builder as a phosphor pip (bright when carrying)
    if (filter === 'flow') for (const [x, y, kind, res] of renderer.moversNow()) {
      if (!onView(x, y, 4)) continue;
      const [sx, sy] = toS(x, y);
      octx.fillStyle = res ? PHOSPHOR.amber : kind === 2 ? 'rgba(255,195,90,0.5)' : PHOSPHOR.dim;
      octx.fillRect(Math.round(sx) - (kind === 1 ? 2 : 1), Math.round(sy) - (kind === 1 ? 2 : 1), kind === 1 ? 5 : 3, kind === 1 ? 5 : 3);
    }
    // ORE: known outcrops and deposits, with what is left
    if (filter === 'ore' && E.survey) {
      for (const o of E.survey.outcrops) {
        if (!onView(o.x, o.y, 60)) continue;
        const [sx, sy] = toS(o.x + 0.5, o.y + 0.5);
        drawRing(octx, sx, sy, Math.max(6, o.r * 1.5 * ppc), o.remaining ? PHOSPHOR.amber : 'rgba(255,90,70,0.6)', [2, 3]);
        drawLabel(octx, sx, sy - Math.max(8, o.r * 1.5 * ppc) - 2, o.remaining ? `${resName(o.res)} ${fmtN(o.remaining)}` : `${resName(o.res)} WORKED OUT`, { colour: o.remaining ? PHOSPHOR.amber : PHOSPHOR.red, size: 9 });
      }
      for (const d of E.survey.deposits) {
        if (!onView(d.x, d.y, 80)) continue;
        const [sx, sy] = toS(d.x + 0.5, d.y + 0.5);
        octx.save(); octx.globalAlpha = 0.18; octx.fillStyle = PHOSPHOR.green; octx.beginPath(); octx.arc(sx, sy, d.r * ppc, 0, Math.PI * 2); octx.fill(); octx.restore();
        drawRing(octx, sx, sy, d.r * ppc, PHOSPHOR.green, [5, 3]);
        drawLabel(octx, sx, sy + 4, `${resName(d.res)} DEPOSIT ${fmtN(d.amt)}`, { colour: PHOSPHOR.green, size: 9 });
      }
    }
    // buildings: sites with their progress, names, lamps
    const sel = state.get('inspect');
    for (const b of E.buildings.values()) {
      if (!b.fp || !onView(b.fp.cx, b.fp.cy, 60)) continue;
      const [x0, y0] = toS(b.fp.x0, b.fp.y0), w = b.fp.w * ppc, h = b.fp.h * ppc;
      if (b.kind === 'pile') { if (ppc >= 2) drawLabel(octx, x0, y0 - 3, 'SALVAGE', { colour: PHOSPHOR.amber, size: 8 }); continue; }
      if (b.built < 1) {
        const need = Object.entries(b.need || {}), have = need.reduce((a, [r, n]) => a + Math.min(n, b.delivered?.[r] || 0), 0), all = need.reduce((a, [, n]) => a + n, 0);
        const frac = all && have < all ? 0.5 * have / all : 0.5 + 0.5 * Math.min(1, (b.work || 0) / Math.max(1, b.workNeed));
        drawFootprint(octx, x0, y0, w, h, 'site', frac);
      }
      if (b.id === sel) drawFootprint(octx, x0 - 2, y0 - 2, w + 4, h + 4, 'sel');
      if (b.type === 'hq') { drawHQ(octx, x0 + w / 2, y0 + h / 2, Math.min(w, 24), t); }
      else if (Math.max(w, h) >= 44 || b.id === sel) drawLabel(octx, x0 + w / 2, y0 - 3, b.name.toUpperCase(), { size: ppc >= 4 ? 10 : 8, colour: b.built < 1 ? PHOSPHOR.amber : PHOSPHOR.green });
      if (b.built >= 1 && ppc >= 1 && (b.lamps?.power || b.lamps?.input || b.lamps?.output || ppc >= 2)) drawLamps(octx, x0 + w + 4, y0 + 3, b.lamps, t);
    }
    // road blueprints: the part not laid yet is a dashed line
    for (const v of E.roads.values()) {
      if (v.kind !== 'road') continue;
      const L = v.len;
      const holes = []; let at = 0;
      for (const [a, b] of v.laid) { if (a > at + 0.5) holes.push([at, a]); at = Math.max(at, b); }
      if (at < L - 0.5) holes.push([at, L]);
      for (const [a, b] of holes) drawDashed(octx, cutPolyline(v.pts, a, b).map((p) => toS(p[0] + 0.5, p[1] + 0.5)), PHOSPHOR.blue, Math.max(1.5, Math.min(4, ppc)), [6, 5]);
    }
    const now = performance.now();
    // survey pulses
    for (let i = pulses.length - 1; i >= 0; i--) { const p = pulses[i], k = (now - p.at) / 1800; if (k >= 1) { pulses.splice(i, 1); continue; } drawPulse(octx, ...toS(p.x + 0.5, p.y + 0.5), p.r * ppc, k); }
    // refused road gaps
    for (let i = gaps.length - 1; i >= 0; i--) { const gp = gaps[i], k = (now - gp.at) / 2600; if (k >= 1) { gaps.splice(i, 1); continue; } octx.save(); octx.globalAlpha = 1 - k; drawDashed(octx, [toS(gp.g[0] + 0.5, gp.g[1] + 0.5), toS(gp.g[2] + 0.5, gp.g[3] + 0.5)], PHOSPHOR.red, 5, []); octx.restore(); }
    blueprints = blueprints.filter(b => now - b.at < (b.state === 'refused' ? 1600 : 900));
    for (const b of blueprints) drawBlueprint(octx, b.pts.map(p => toS(p[0], p[1])), { kind: b.kind, state: b.state, alpha: Math.max(0, 1 - (now - b.at) / (b.state === 'refused' ? 1600 : 900)) });
    const s = pen.stroke;
    if (s) {
      const pts = [...s.pts, [pen.pen.x, pen.pen.y]];
      drawBlueprint(octx, pts.map(p => toS(p[0], p[1])), { kind: s.tool, state: 'drawing' });
      if (s.tool === 'road') roadPrice(pts);
    }
    if (state.get('tool') === 'build' && !s) ghost(t);
    for (const f of C.overlays || []) f(octx, { view, W, H, t, now, toS, ppc, pen, renderer }); // later milestones draw on the glass (M6: spell targets)
    markers = markers.filter(m => now - m.at < 2400);
    for (const m of markers) drawMarker(octx, ...toS(m.x, m.y), now - m.at, m.colour);
    const p = pen.pen;
    if (p.src !== 'none' && (p.over || p.src !== 'mouse' || s)) {
      const [sx, sy] = toS(p.x, p.y);
      drawReticle(octx, sx, sy, { tool: state.get('tool'), t, finger: p.finger });
    }
  }

  /** The road the pen is drawing, priced and checked the way the sim will check it (same planRoad). */
  let lastPlan = null;
  function roadPrice(pts) {
    const link = C.game.link;
    const plan = planRoad({ cellAt: (x, y) => renderer.cellAt(x, y), W: link.size[0], H: link.size[1], M, cfg: E.data.road, levels: E.hud?.levels || {}, roads: [...E.roads.values()], doors: roadDoors() }, pts.map(([x, y]) => [Math.round(x), Math.round(y)]));
    lastPlan = plan;
    for (const g of plan.gaps) drawDashed(octx, [toS(g[0] + 0.5, g[1] + 0.5), toS(g[2] + 0.5, g[3] + 0.5)], PHOSPHOR.red, 5, []);
    for (const j of plan.joins) drawRing(octx, ...toS(j.at[0] + 0.5, j.at[1] + 0.5), 7, PHOSPHOR.blue, []);
    const cost = Object.entries(plan.cost).map(([r, n]) => `${n} ${resName(r)}`).join(' · ');
    const txt = plan.gaps.length ? (plan.unlock ? `NEEDS ${plan.unlock.toUpperCase()}` : 'BLOCKED') : `${plan.bridge > 0 ? 'ROAD + BRIDGE' : 'ROAD'} ${Math.round(plan.len / 2)} M · ${cost || 'FREE'}`;
    const [sx, sy] = toS(pen.pen.x, pen.pen.y);
    drawLabel(octx, sx + 16, sy - 16, txt, { colour: plan.gaps.length ? PHOSPHOR.red : PHOSPHOR.blue, align: 'left', size: 10 });
  }

  /** The BUILD ghost: the loaded card's footprint at the pen, green if it can go there, red (and why) if not. */
  function ghost(t) {
    const type = state.get('buildType');
    const def = type && E.data.B[type];
    if (!def) return;
    const link = C.game.link, p = pen.pen;
    const x = Math.round(p.x), y = Math.round(p.y);
    const g = ghostCheck({ def, x, y, cellAt: (a, b) => renderer.cellAt(a, b), M, W: link.size[0], H: link.size[1], fogAt: (a, b) => renderer.fogAt(a, b), allow: (c) => !!C.defence?.mayStandOn?.(def, c) });
    const stock = E.hud?.stock || {}, com = E.hud?.committed || {};
    const short = Object.entries(def.cost || {}).filter(([r, n]) => (stock[r] || 0) - (com[r] || 0) < n).map(([r, n]) => `${n} ${resName(r)}`);
    const ok = g.ok && !short.length;
    const [x0, y0] = toS(g.fp.x0, g.fp.y0);
    drawFootprint(octx, x0, y0, g.fp.w * view.ppc, g.fp.h * view.ppc, ok ? 'ok' : 'bad');
    const [cx, cy] = toS(g.fp.cx, g.fp.cy);
    if (def.ring) drawRing(octx, cx, cy, def.ring * view.ppc, 'rgba(255,195,90,0.6)', [4, 4]);
    if (def.reach) drawRing(octx, cx, cy, def.reach * view.ppc, 'rgba(140,255,176,0.55)', [2, 3]);
    if (def.survey) drawRing(octx, cx, cy, def.survey.r * view.ppc, 'rgba(140,255,176,0.35)', [8, 6]);
    const cost = Object.entries(def.cost || {}).map(([r, n]) => `${n} ${resName(r)}`).join(' · ') || 'FREE';
    drawLabel(octx, cx, y0 - 4, `${def.name.toUpperCase()} · ${!g.ok ? g.why.toUpperCase() : short.length ? 'SHORT: ' + short.join(', ') : cost}`, { colour: ok ? PHOSPHOR.amber : PHOSPHOR.red, size: 10 });
  }

  // the filter stamp says when its layer is empty (ORE: nothing surveyed yet; FLOW: nobody carrying anything)
  let lastStamp;
  function stamps() {
    const f = state.get('filter'), row = data.filters.find(x => x.id === f);
    let empty = row.empty;
    if (f === 'ore' && (E.survey?.outcrops.length || E.survey?.deposits.length)) empty = null;
    if (f === 'threat' && C.defence?.contacts()) empty = null; // M4
    if (f === 'flow' && ((E.hud?.crew?.porter?.busy || 0) + (E.hud?.crew?.cart?.busy || 0) > 0 || [...E.buildings.values()].some((b) => b.ring && b.type !== 'hq'))) empty = null;
    if (empty === lastStamp) return;
    lastStamp = empty;
    const st = body.querySelector('.stamp-filter'); st.textContent = empty || ''; st.classList.toggle('on', !!empty);
  }

  function readout() {
    const p = pen.pen;
    const has = p.src !== 'none';
    const x = Math.round(p.x), y = Math.round(p.y);
    ro.grid.textContent = has ? gridRef(x, y) : gridRef(view.cx, view.cy);
    ro.cell.textContent = has ? `${x},${y}` : `${Math.round(view.cx)},${Math.round(view.cy)}`;
  }

  const api = {
    el, glass, view, pen, renderer,
    get kind() { return renderer.kind; },
    ingest(frame) {
      renderer.ingest(frame);
      for (const ev of frame.events || []) {
        if (ev.e === 'pulse') pulses.push({ x: ev.x, y: ev.y, r: ev.r, at: performance.now() });
        if (ev.e === 'refused' && ev.cmd === 'drawRoad') for (const g of ev.gaps || []) gaps.push({ g, at: performance.now() });
      }
    },
    get lastPlan() { return lastPlan; },
    frame(t) {
      const chartMode = view.ppc < data.range.chartBelow;
      el.classList.toggle('chart', chartMode);
      const vk = `${view.cx.toFixed(2)},${view.cy.toFixed(2)},${view.ppc},${state.get('filter')},${W},${H}`;
      const need = renderer.dirty || vk !== lastVk || t - lastPaint > 66 || wobble > 0;
      lastVk = vk;
      if (need) { renderer.render({ view, filter: state.get('filter'), chartMode, t }); lastPaint = t; }
      overlay(t); paintGrid(); readout(); stamps();
    },
    resize,
    setRange(i) { ro.range.textContent = data.range.labels[i]; lastGridKey = ''; },
    setFilter(f) {
      const row = data.filters.find(x => x.id === f);
      ro.filter.textContent = row.label;
      el.dataset.filter = f;
      lastStamp = undefined; stamps(); // undefined, not null: SIGHT's "no stamp" is null and must still clear the last one
    },
    setPaused(p) { el.classList.toggle('paused', p); },
    centreOn(x, y, colour) { view.centre(x, y); pen.follow(); markers.push({ x, y, at: performance.now(), colour: colour || PHOSPHOR.amber }); },
    refused(cmd) { const b = [...blueprints].reverse().find(x => x.state === 'placed'); if (b) { b.state = 'refused'; b.at = performance.now(); } },
    degauss() {
      C.room.play('degauss');
      glass.classList.remove('degaussing'); void glass.offsetWidth; glass.classList.add('degaussing');
      wobble = 1; setTimeout(() => { wobble = 0; glass.classList.remove('degaussing'); }, 900);
    },
    /** Drawn == measured: the cell's fog state and the drawn pixel at its screen spot. */
    probe(x, y) {
      // the fog field is one value per 4×4 cells, drawn with soft edges: measure at the middle of the 4×4 square,
      // where the drawn picture is exactly that square's state
      const [sx, sy] = view.toScreen((x >> 2) * 4 + 2, (y >> 2) * 4 + 2);
      return { fog: renderer.fogAt(x, y), gas: renderer.gasAt?.(x, y), light: renderer.lightAt?.(x, y), cell: renderer.cellAt?.(x, y), sx, sy, px: (sx >= 0 && sy >= 0 && sx < W && sy < H) ? renderer.pixelAt(sx, sy) : null };
    },
  };
  body.querySelector('.degauss').addEventListener('click', () => api.degauss());
  return api;
}
