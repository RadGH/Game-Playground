// Procedural Towns — the 2D reader.
//
// Draws a plan to a canvas as flat polygons. This is deliberately the FIRST renderer: a town plan
// is a set of rectangles and lines, and you can see whether it is any good far faster in plan view
// than by flying to it in a game. The 3D preview is the second opinion, not the first.
//
// Everything here reads `plan` and nothing writes to it, so the same plan can be drawn twice, side
// by side, at different zooms, with different overlays.

/** Colours per street class — the hierarchy has to be readable at a glance. */
const STREET_COLOUR = { main: '#5c6672', lane: '#4a535d', alley: '#3b424b' };

/** Colours per district, so you can see the shape of the town's use, not just its geometry. */
const DISTRICT_COLOUR = {
  civic: '#6f7fa8',
  craft: '#8a7a56',
  residential: '#6a7a68',
};

/** The things a town wants, picked out so they are findable in a field of houses. */
const WANT_COLOUR = {
  hall: '#c8a24a', forge: '#c8603a', inn: '#c89a4a', market: '#8fe0a0',
  granary: '#a89a62', chapel: '#a88fd0', stable: '#8a6a44', warehouse: '#7a8a9a',
  barracks: '#9a5a5a', mill: '#9aa87a', watchpost: '#7fb8d8', shrine: '#d0c0e8',
};

/**
 * Draw one plan into a canvas.
 *
 * `show` is the overlay set — the experiment's checkboxes hand it straight through, so adding an
 * overlay is adding a key here and a checkbox there, and nothing else.
 */
export function drawPlan(ctx, plan, {
  width, height, show = {}, highlight = null, background = '#0d1118',
} = {}) {
  const ring = plan.ring || 60;
  const outer = plan.wallRadius || ring;      // the wall sits outside the last plot
  const pad = 12;
  const scale = Math.min(width - pad * 2, height - pad * 2) / (outer * 2.2);
  const ox = width / 2, oz = height / 2;
  const X = x => ox + x * scale;
  const Z = z => oz + z * scale;

  ctx.save();
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  // ---- the footprint, so you can see how much of the ring the town actually fills
  ctx.beginPath();
  ctx.arc(ox, oz, ring * scale, 0, Math.PI * 2);
  ctx.strokeStyle = '#1e2836';
  ctx.lineWidth = 1;
  ctx.stroke();

  // ---- the square: open ground, drawn under everything
  if (plan.square) {
    ctx.beginPath();
    ctx.arc(X(plan.square.cx), Z(plan.square.cz), plan.square.r * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#242c38';
    ctx.fill();
  }

  // ---- streets. Drawn as thick lines at their true width, which is the point: if a building
  // overlaps one, you can SEE it overlapping rather than having to be told.
  for (const s of plan.streets) {
    ctx.beginPath();
    ctx.moveTo(X(s.a[0]), Z(s.a[1]));
    ctx.lineTo(X(s.b[0]), Z(s.b[1]));
    ctx.strokeStyle = STREET_COLOUR[s.cls] || '#444';
    ctx.lineWidth = Math.max(1, s.width * scale);
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // ---- blocks, if asked for
  if (show.blocks) {
    ctx.strokeStyle = '#2f3b4e';
    ctx.lineWidth = 1;
    for (const b of plan.blocks) ctx.strokeRect(X(b.x), Z(b.z), b.w * scale, b.d * scale);
  }

  // ---- plots and what stands on them
  for (const p of plan.plots) {
    const matched = highlight ? String(p.want || '').includes(highlight) : false;
    const dim = highlight && !matched;

    if (show.plots) {
      ctx.strokeStyle = dim ? '#222a34' : (DISTRICT_COLOUR[p.district] || '#555');
      ctx.lineWidth = 1;
      ctx.strokeRect(X(p.x), Z(p.z), p.w * scale, p.d * scale);
    }

    // the building itself, fitted inside its plot with a margin of yard
    const inset = Math.min(p.w, p.d) * 0.16;
    const bw = (p.w - inset * 2) * scale, bd = (p.d - inset * 2) * scale;
    const named = WANT_COLOUR[p.want];
    ctx.fillStyle = dim ? '#1b222c' : (named || (p.want === 'house' ? '#4e5a6a' : '#414a57'));
    ctx.fillRect(X(p.x + inset), Z(p.z + inset), bw, bd);

    if (matched) {
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2;
      ctx.strokeRect(X(p.x + inset) - 1, Z(p.z + inset) - 1, bw + 2, bd + 2);
    }

    // which way the door faces — the reason a door is never on a blank back wall
    if (show.frontage && !dim) {
      const len = Math.min(p.w, p.d) * 0.45 * scale;
      ctx.beginPath();
      ctx.moveTo(X(p.cx), Z(p.cz));
      ctx.lineTo(X(p.cx) + Math.cos(p.facing) * len, Z(p.cz) + Math.sin(p.facing) * len);
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ---- the wall and its gates
  if (plan.wall) {
    ctx.beginPath();
    ctx.arc(ox, oz, outer * scale, 0, Math.PI * 2);
    ctx.strokeStyle = '#6a7482';
    ctx.lineWidth = 3;
    ctx.stroke();
    for (const g of plan.wall.gates) {
      ctx.beginPath();
      ctx.arc(ox + g.x * outer * scale, oz + g.z * outer * scale, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd24a';
      ctx.fill();
    }
  }

  ctx.restore();
}

/** Paint the overlap hits in red, so a broken plan is impossible to miss. */
export function drawOverlaps(ctx, plan, hits, { width, height } = {}) {
  if (!hits.length) return;
  const ring = plan.ring || 60;
  const outer = plan.wallRadius || ring;      // the wall sits outside the last plot
  const pad = 12;
  const scale = Math.min(width - pad * 2, height - pad * 2) / (outer * 2.2);
  const ox = width / 2, oz = height / 2;
  ctx.save();
  ctx.strokeStyle = '#ff4a4a';
  ctx.lineWidth = 2;
  for (const h of hits) {
    const p = h.p || plan.plots[h.i];
    if (!p) continue;
    ctx.strokeRect(ox + p.x * scale, oz + p.z * scale, p.w * scale, p.d * scale);
  }
  ctx.restore();
}
