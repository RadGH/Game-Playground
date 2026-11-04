// Trains on the page (M10): the Rails tab (Track and Station tools), the Lines screen (Info → Lines),
// steel rails drawn over the track bed, and trains as short chains of carriages. Everything the
// player does is an order to the worker (js/sim/logistics/trains.js does the work).
//
// Track tool: one finger drags a straight run (it snaps to the 8 compass directions, so lines stay
// neat). Start a drag on the end of existing track to carry on from it. Two fingers still move the
// map. Station tool: a ghost follows the finger and hops to the nearest spot right beside the track;
// green = it can go there.

import { hooks } from '../ui/hooks.js';

const SNAP = 7;           // cells: a drag that starts this near a track end continues from it
let tool = null;          // { kind: 'track', a, b } | { kind: 'station', x, y, ok, touch }
const eased = new Map();  // carriage id -> drawn position, so trains glide between snapshots

const town = ui => ui.app.stream?.town;
const rails = ui => town(ui)?.trains;
const nearX = (x, cx, W) => { const d = x - cx; if (d > W / 2) x -= W; if (d < -W / 2) x += W; return x; };

// ------------------------------------------------------------------ the Rails tab
function render(ui) {
  const D = ui.data, G = D.goods;
  const icon = g => G[g]?.icon || g;
  const per = Object.entries(D.rail.cost).map(([g, n]) => `${icon(g)} ${n}`).join(' ');
  const st = D.kinds.station;
  const p = ui.panel('<h3>Railways</h3>');
  const item = (name, cost, on, fn) => {
    const b = document.createElement('button'); b.className = 'item';
    b.innerHTML = `<span class="nm">${name}</span><span class="cost">${cost}</span>`;
    b.classList.toggle('on', on); b.addEventListener('click', fn); return b;
  };
  p.append(
    item('Track', `${per} per ${D.rail.per} m`, tool?.kind === 'track', () => startTrack(ui)),
    item(st.name, Object.entries(st.cost).map(([g, n]) => `${icon(g)} ${n}`).join(' '), tool?.kind === 'station', () => startStation(ui)),
  );
  const have = town(ui)?.stock?.iron_ore || 0;
  p.append(ui.hint(tool?.kind === 'track' ? 'Drag to lay a straight run. Start on the end of a track to carry it on. Track can never be destroyed.'
    : tool?.kind === 'station' ? 'Tap beside the track. Any track joining two stations becomes a line (see Info → Lines).'
    : have ? 'Trains are the fastest way to move goods and people between towns.' : 'Track needs iron ore: build an iron mine on a found seam first.'));
}
hooks.tabs.push({ id: 'rails', label: 'Rails', tool: true, render });

function stopTool(ui) { tool = null; ui.camera()?.setTool(null); }

function trackEnds(ui) {
  const out = [];
  for (const [x0, y0, x1, y1] of rails(ui)?.segs || []) out.push({ x: x0, y: y0 }, { x: x1, y: y1 });
  return out;
}
/** Snap the drag to the nearest of the 8 compass directions. */
function snapRun(a, p, W) {
  let dx = nearX(p.x, a.x, W) - a.x; const dy = p.y - a.y;
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const ux = Math.round(Math.cos(ang)), uy = Math.round(Math.sin(ang));
  const len = Math.round(ux && uy ? (Math.abs(dx) + Math.abs(dy)) / 2 : Math.hypot(dx, dy));
  return { x: a.x + ux * len, y: a.y + uy * len };
}
function startTrack(ui) {
  tool = { kind: 'track', a: null, b: null };
  const W = ui.app.world.W;
  ui.setTool({          // (ui.setTool also puts away the build ghost and the road tool)
    feature: true,
    down: p => {
      let a = { x: Math.floor(p.x), y: Math.floor(p.y) }, bd = SNAP;
      for (const e of trackEnds(ui)) { const d = Math.hypot(nearX(e.x, p.x, W) - p.x, e.y - p.y); if (d < bd) { bd = d; a = { x: nearX(e.x, p.x, W), y: e.y }; } }
      if (tool) { tool.a = a; tool.b = a; }
    },
    move: p => { if (tool?.a) tool.b = snapRun(tool.a, p, W); },
    up: async (p, e, tap) => {
      if (!tool) return;
      const { a, b } = tool; tool.a = tool.b = null;
      if (!a || !b || tap || (a.x === b.x && a.y === b.y)) return;
      const r = await ui.link().order({ t: 'rail', x0: a.x, y0: a.y, x1: b.x, y1: b.y });
      if (typeof r === 'string') ui.toast(r, 'bad');
      else if (r > 0) ui.toast(`Track laid: ${Math.round(r / 2)} m.`, 'good');
    },
    cancel: () => { if (tool) tool.a = tool.b = null; },
  });
  ui.refreshDock();
}

// ------------------------------------------------------------------ station tool
const isTrackCell = (ui, x, y) => { const c = ui.app.stream.cellAt(x, y); return !!c && (c.ground === ui.M.id.rail || c.mat === ui.M.id.rail_bridge); };
/** Does a footprint at (x, y) touch track without covering any? */
function besideTrack(ui, x, y, w, h) {
  let touch = false;
  for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) {
    const inside = dx >= 0 && dy >= 0 && dx < w && dy < h;
    if (!isTrackCell(ui, x + dx, y + dy)) continue;
    if (inside) return false;
    touch = true;
  }
  return touch;
}
function startStation(ui) {
  const k = ui.data.kinds.station;
  tool = { kind: 'station', w: k.w, h: k.h, x: 0, y: 0, ok: false, touch: false };
  const move = p => {
    const x0 = Math.round(p.x - k.w / 2), y0 = Math.round(p.y - k.h / 2);
    // hop to the nearest spot right beside the track
    let best = null, bd = Infinity;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const d = dx * dx + dy * dy; if (d >= bd) continue;
      if (besideTrack(ui, x0 + dx, y0 + dy, k.w, k.h)) { bd = d; best = { x: x0 + dx, y: y0 + dy }; }
    }
    if (!tool) return;
    tool.touch = !!best;
    Object.assign(tool, best || { x: x0, y: y0 });
    check(ui);
  };
  ui.setTool({
    feature: true,
    down: move, move,
    up: async () => {
      if (tool?.kind !== 'station') return;
      const r = await ui.link().order({ t: 'station', x: tool.x + k.w / 2, y: tool.y + k.h / 2 });
      if (typeof r === 'string') ui.toast(r, 'bad');
      else if (r) ui.toast(`${k.name} planned. Builders will bring the stone and logs.`, 'good');
    },
  });
  ui.refreshDock();
}
async function check(ui) {
  const g = tool; if (!g || g.kind !== 'station') return;
  const key = g.x + ',' + g.y;
  if (check.key === key) return; check.key = key;
  const fits = g.touch && await ui.link().ask('fits', { x: g.x, y: g.y, w: g.w, h: g.h });
  if (tool === g && check.key === key) g.ok = !!fits;
}

hooks.overlay.push((cam, out, ui) => {
  const W = ui.app.world.W;
  if (tool?.kind === 'track' && tool.a && tool.b) {
    const { a, b } = tool;
    const dx = b.x - a.x, dy = b.y - a.y, n = Math.max(1, Math.abs(dx), Math.abs(dy));
    for (let k = 0; k <= n; k++) out.push([nearX(a.x + dx * k / n, cam.x, W), a.y + dy * k / n, 2, 2, 0.75, 0.8, 0.95, 0.45]);
    out.push([nearX(b.x, cam.x, W) - 0.5, b.y - 0.5, 3, 3, 1, 1, 1, 0.7]);
  }
  if (tool?.kind === 'track' && cam.ppc > 0.8) {
    // the ends you can carry on from
    for (const e of trackEnds(ui)) out.push([nearX(e.x, cam.x, W) - 0.5, e.y - 0.5, 3, 3, 0.95, 0.85, 0.4, 0.5]);
  }
  if (tool?.kind === 'station') {
    const c = tool.ok ? [0.4, 0.9, 0.4, 0.38] : [0.95, 0.3, 0.25, 0.38];
    out.push([nearX(tool.x, cam.x, W), tool.y, tool.w, tool.h, ...c]);
  }
});

// ------------------------------------------------------------------ drawing: rails and trains
const STEEL = [0.66, 0.68, 0.72], SLEEPER = [0.33, 0.24, 0.17];
const BODY = { freight: [0.5, 0.33, 0.2], passenger: [0.55, 0.16, 0.18] };
const ENGINE = [0.16, 0.22, 0.2];
hooks.sprites.push((cam, out, ui) => {
  const R = rails(ui); if (!R) return;
  const W = ui.app.world.W;
  const hw = window.innerWidth / cam.ppc / 2 + 6, hh = window.innerHeight / cam.ppc / 2 + 6;
  if (cam.ppc >= 1.1) for (const [x0, y0, x1, y1] of R.segs) {
    // the steel: two rails either side of the middle of the 2-wide bed, sleepers across it
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, px = -uy, py = ux;
    const sx = nearX(x0, cam.x, W);
    const steps = Math.ceil(len * 2);
    for (let k = 0; k <= steps; k++) {
      const t = k / 2, cx = sx + 1 + ux * t, cy = y0 + 1 + uy * t;
      if (Math.abs(cx - cam.x) > hw || Math.abs(cy - cam.y) > hh) continue;
      if ((k & 1) === 0) for (const o of [-1.05, -0.35, 0.35, 1.05]) out.push([cx + px * o - 0.25, cy + py * o - 0.25, 0.5, 0.5, ...SLEEPER, 1]);
      for (const o of [-0.68, 0.68]) out.push([cx + px * o - 0.16, cy + py * o - 0.16, 0.32, 0.32, ...STEEL, 1]);
    }
  }
  const seen = new Set();
  for (const t of R.trains) {
    const n = t.cars.length;
    for (let j = 0; j < n; j++) {
      const id = t.id + ':' + j; seen.add(id);
      let [x, y] = t.cars[j];
      const o = eased.get(id);
      if (o) { let ddx = x - o.x; if (ddx > W / 2) ddx -= W; if (ddx < -W / 2) ddx += W; if (Math.abs(ddx) + Math.abs(y - o.y) < 12) { x = o.x + ddx * 0.3; y = o.y + (y - o.y) * 0.3; } }
      eased.set(id, { x, y });
    }
    // each carriage: three overlapping blocks along the way it faces (quads can't turn), lifted
    // a little off the track for the 3/4 view, with a shadow under it
    const pos = t.cars.map((_, j) => eased.get(t.id + ':' + j));
    for (let j = n - 1; j >= 0; j--) {
      const p = pos[j], q = pos[j === 0 ? 1 : j - 1] || p;
      let dx = j === 0 ? p.x - q.x : q.x - p.x, dy = j === 0 ? p.y - q.y : q.y - p.y;
      if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const x = nearX(p.x, cam.x, W), y = p.y;
      if (Math.abs(x - cam.x) > hw || Math.abs(y - cam.y) > hh) continue;
      const col = j === 0 ? ENGINE : BODY[t.kind];
      for (const s of [-1.3, 0, 1.3]) out.push([x + dx * s - 0.9, y + dy * s - 0.6, 1.8, 1.4, 0, 0, 0, 0.35]);
      for (const s of [-1.3, 0, 1.3]) out.push([x + dx * s - 0.85, y + dy * s - 1.7, 1.7, 1.7, ...col, 1]);
      // roof line
      for (const s of [-1.1, 0, 1.1]) out.push([x + dx * s - 0.6, y + dy * s - 2.1, 1.2, 0.5, col[0] * 0.6, col[1] * 0.6, col[2] * 0.6, 1]);
      if (j === 0) { out.push([x + dx * 1.2 - 0.3, y + dy * 1.2 - 2.8, 0.6, 0.9, 0.1, 0.1, 0.1, 1]); out.push([x + dx * 1.9 - 0.3, y + dy * 1.9 - 1.2, 0.6, 0.5, 0.95, 0.8, 0.4, 1]); }
      else if (t.kind === 'passenger') for (const s of [-1, 0, 1]) out.push([x + dx * s - 0.25, y + dy * s - 1.3, 0.5, 0.45, 0.98, 0.86, 0.55, 1]);
      else if (t.load) for (const s of [-0.9, 0.9]) out.push([x + dx * s - 0.6, y + dy * s - 2.3, 1.2, 0.7, 0.45, 0.42, 0.38, 1]);
    }
  }
  for (const k of eased.keys()) if (!seen.has(k)) eased.delete(k);
});

// ------------------------------------------------------------------ tap a train
hooks.tap.push(async (p, ui) => {
  const R = rails(ui); if (!R || tool) return false;
  const W = ui.app.world.W;
  for (const t of R.trains) for (const [x, y] of t.cars) {
    if (Math.hypot(nearX(x, p.x, W) - p.x, y - p.y) > 2.6) continue;
    const K = ui.data.trains[t.kind], G = ui.data.goods;
    let html = `<b>${ui.esc(K.name)}</b><div class="bar"><i style="width:${Math.round(t.hp / t.max * 100)}%"></i></div>`;
    html += t.wait > 0 ? 'Standing at a station' : `Running at ${Math.round(t.v)} m/s`;
    if (t.kind === 'freight') html += `<br>${t.load ? `Carrying ${t.load.n} ${(G[t.load.g]?.name || t.load.g).toLowerCase()}` : 'Empty'}`;
    else html += `<br>${t.riders} commuter${t.riders === 1 ? '' : 's'} aboard`;
    html += `<br>${t.vul ? 'Slow enough to be attacked' : 'Too fast to be attacked'}`;
    ui.sheet(html, 6000);
    return true;
  }
  return false;
});

// ------------------------------------------------------------------ the Lines screen (Info → Lines)
hooks.infoTabs.push({
  id: 'lines', label: 'Lines',
  render(ui, head) {
    const p = ui.panel(''); p.append(head);
    const R = rails(ui), D = ui.data, G = D.goods;
    const list = R?.lines || [];
    if (!list.length) { p.append(ui.hint('No lines yet. Lay track in the Rails tab and put a station beside it in two towns. Any track that joins two stations is a line.')); return; }
    const price = K => `🪙${K.gold} ${Object.entries(K.cost).map(([g, n]) => `${G[g]?.icon || g}${n}`).join(' ')}`;
    for (const l of list) {
      const c = document.createElement('div'); c.className = 'card';
      const mins = l.secs >= 60 ? `${Math.floor(l.secs / 60)}m${String(l.secs % 60).padStart(2, '0')}s` : `${l.secs}s`;
      c.innerHTML = `<b>${l.stations.map(s => ui.esc(s.town)).join(' ⇄ ')}</b>`
        + `<span>${l.length} m · ${mins} end to end · ${l.stations.length} stations</span>`
        + `<span>🚂 ${l.freight} freight · 🚃 ${l.passenger} passenger</span>`
        + `<span>Delivered ${l.delivered} · commuters ${l.commuters}</span>`;
      const row = document.createElement('div'); row.className = 'row';
      const add = kind => async () => { const r = await ui.link().order({ t: 'train.add', line: l.key, kind }); if (typeof r === 'string') ui.toast(r, 'bad'); };
      const less = kind => async () => { const r = await ui.link().order({ t: 'train.remove', line: l.key, kind }); if (typeof r === 'string') ui.toast(r, 'bad'); };
      row.append(
        ui.btn(`+ Freight ${price(D.trains.freight)}`, add('freight')),
        ui.btn('−', less('freight')),
        ui.btn(`+ Passenger ${price(D.trains.passenger)}`, add('passenger')),
        ui.btn('−', less('passenger')),
        ui.btn('Show', () => ui.camera().flyTo(l.stations[0].x, l.stations[0].y, 2.5, 700)),
      );
      c.append(row); p.append(c);
    }
    p.append(ui.hint('Freight carries whatever the next town is short of. Passenger trains bring settlers from bigger towns on the line. Trains only stop at stations; a stopped or slow train can be attacked.'));
  },
});

// Esc drops the tool
hooks.keys.push((e, ui) => { if (e.code === 'Escape' && tool) { stopTool(ui); return true; } return false; });
// leaving the Rails tab drops the tool (main.js clears the camera tool; forget ours too)
// (read the open tab from the dock: ui.openTab is copied once by Object.assign, so it never changes)
hooks.tick.push(() => { if (tool && document.querySelector('#dock-tabs .on')?.dataset.tab !== 'rails') tool = null; });
