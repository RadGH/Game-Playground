// How spells look (PLAN M6): lit points drawn INTO the WebGL scope (a painter on js/render/scope.js — so a flare
// really lights the ground, a shield's skin glows and a meteor's head lights the field it is about to hit) plus the
// phosphor marks on the overlay glass (the target being aimed, the impact warning ring, a shield's exact edge).
//
// What the world does (fire, blasts, debris, ice, lightning through water, rain) is drawn by the world's own renderer
// from its cells and events; this file adds only what the cells cannot show: things in the air, light that is not a
// cell, and the moment of arrival. Everything is timed from the sim's own ticks (castAt / landAt) so what you see
// lands when the sim lands it.
//
// Pure helpers (node-tested): meteorPose(p, tx, ty) — where the falling stone is drawn at progress p; shieldEdge(a) —
// the points of a shield's drawn skin, which sit exactly on the radius the sim blocks at (drawn == measured).

import { PHOSPHOR, drawRing, drawLabel, drawDashed } from './sprites.js';

/** The falling meteor at progress p (0 = cast, 1 = impact): ground track, height, and the drawn (screen-up) point. */
export function meteorPose(p, tx, ty) {
  const q = Math.max(0, Math.min(1, p));
  const s = 1 - q;
  const gx = tx + 0.5 - 46 * s, gy = ty + 0.5 - 18 * s;       // it comes in from the north-west…
  const z = 130 * s * s + 30 * s;                                // …and drops faster and faster
  return { gx, gy, z, x: gx, y: gy - z };
}

/** The drawn skin of a shield bubble: n points at exactly the radius the sim blocks at (cells, centre of the cell). */
export function shieldEdge(a, n = 64) {
  const cx = a.x + 0.5, cy = a.y + 0.5, out = [];
  for (let k = 0; k < n; k++) { const t = (k / n) * Math.PI * 2; out.push([cx + Math.cos(t) * a.r, cy + Math.sin(t) * a.r]); }
  return out;
}

/** The flare in the air: rising from the HQ (p < 1), then hanging and sinking slowly (q = share of its burn left). */
export function flarePose(from, a, now) {
  if (!a.landed) {
    const p = Math.max(0, Math.min(1, (now - a.castAt) / Math.max(1, a.landAt - a.castAt)));
    const x = from[0] + (a.x + 0.5 - from[0]) * p, y = from[1] + (a.y + 0.5 - from[1]) * p;
    const z = 30 + 60 * Math.sin(p * Math.PI) - 6 * p;
    return { x, y, z, flying: true };
  }
  const life = Math.max(1, (a.until || now) - a.landAt), q = Math.max(0, Math.min(1, (a.until - now) / life));
  const sway = Math.sin(now / 23) * 1.6;
  return { x: a.x + 0.5 + sway, y: a.y + 0.5, z: 6 + 18 * q, q, flying: false };
}

export function createSpellFx({ simNow, hqAt, spells }) {
  const transients = []; // { kind, x, y, born (ms), life (ms), ... }
  const rnd = (() => { let s = 1234567; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  const col = (hex) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];

  /** Something just happened in the sim (events from the frames). */
  function onEvent(ev, nowMs) {
    if (ev.e === 'spellLanded') {
      const S = ev.spell;
      if (S === 'lightning' && ev.chain?.length > 1) transients.push({ kind: 'chain', pts: ev.chain, born: nowMs, life: 520, seed: rnd() * 1000 });
      if (S === 'shield') transients.push({ kind: 'pop', x: ev.x + 0.5, y: ev.y + 0.5, r: ev.r, born: nowMs, life: 650, c: [0.55, 0.95, 1.1] });
      if (S === 'frost') transients.push({ kind: 'frost', x: ev.x + 0.5, y: ev.y + 0.5, r: ev.r, born: nowMs, life: 1100 });
      if (S === 'mend') transients.push({ kind: 'mend', x: ev.x + 0.5, y: ev.y + 0.5, r: ev.r, born: nowMs, life: 1800, seed: rnd() * 1000 });
      if (S === 'meteor') transients.push({ kind: 'impact', x: ev.x + 0.5, y: ev.y + 0.5, r: ev.r, born: nowMs, life: 2400 });
      if (S === 'rain') transients.push({ kind: 'pop', x: ev.x + 0.5, y: ev.y + 0.5, r: ev.r, born: nowMs, life: 900, c: [0.5, 0.7, 1] });
    } else if (ev.e === 'batteryBurst') {
      transients.push({ kind: 'pop', x: ev.x + 0.5, y: ev.y + 0.5, r: ev.r * 1.6, born: nowMs, life: 800, c: [0.8, 0.5, 1.4] });
    }
  }

  /** The WebGL painter: called by the scope every frame with its point pushers. */
  function painter({ nowMs, pushL, pushS, pushG, shake, flash }) {
    const now = simNow();
    for (const a of spells()) {
      const def = a.spell;
      if (def === 'meteor' && !a.landed) {
        const p = (now - a.castAt) / Math.max(1, a.landAt - a.castAt);
        if (p < 0 || p > 1.02) continue;
        const m = meteorPose(p, a.x, a.y);
        // the trail: the points it has just been through, cooling from white to deep red smoke
        for (let k = 1; k <= 18; k++) {
          const b = meteorPose(p - k * 0.012, a.x, a.y);
          const f = 1 - k / 19;
          pushG(b.x + (rnd() - 0.5) * 0.8, b.y + (rnd() - 0.5) * 0.8, 2.4 + k * 0.35, 1, 0.35 + 0.5 * f, 0.1 + 0.3 * f * f, 1.6 * f * f);
        }
        pushG(m.x, m.y, 5.5 + 4 * p, 1, 0.8, 0.5, 3.2);
        pushS(m.x, m.y, 2.2, 3.4, 3, 2.4, 1);
        pushL(m.x, m.y + m.z * 0.3, 24 + 30 * p, 1, 0.55, 0.25, 0.4 + 1.1 * p * p);
        // its shadow and the light it throws on the ground it is about to hit
        pushS(m.gx, m.gy, 3 + 6 * p, 0, 0, 0, 0.12 + 0.4 * p);
        pushL(a.x + 0.5, a.y + 0.5, 18 + 14 * p, 1, 0.45, 0.2, 0.8 * p * p * p);
        if (p > 0.85) shake(0.15);
      } else if (def === 'shield' && a.landed) {
        const left = (a.until - now) / 20;
        const fl = left < 3 ? (Math.sin(nowMs / 40) > 0 ? 1 : 0.35) : 1;
        const n = Math.max(48, Math.round(a.r * 7));
        const t = nowMs / 1000;
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2;
          const sh = 0.55 + 0.45 * Math.sin(ang * 6 + t * 2.2) * Math.sin(ang * 3 - t * 1.3);
          const x = a.x + 0.5 + Math.cos(ang) * a.r, y = a.y + 0.5 + Math.sin(ang) * a.r;
          pushG(x, y, 2.6, 0.45, 0.95, 1.15, (1.1 + 1.4 * sh) * fl);
          pushS(x, y, 0.9, 0.9 + 1.2 * sh * fl, 1.9 + 1.2 * sh * fl, 2.3 + 1.2 * sh * fl, 0.9);
          if (k % 2 === 0) { const xi = a.x + 0.5 + Math.cos(ang) * a.r * 0.9, yi = a.y + 0.5 + Math.sin(ang) * a.r * 0.9; pushG(xi, yi, 3.2, 0.35, 0.8, 1, 0.35 * fl); }
        }
        // the dome's faint surface: a slow hex shimmer, and a cool light on the ground under it
        const cells = Math.round(a.r * a.r * 0.08);
        for (let k = 0; k < cells; k++) {
          const ang = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * a.r * 0.96;
          pushG(a.x + 0.5 + Math.cos(ang) * d, a.y + 0.5 + Math.sin(ang) * d, 1.6, 0.4, 0.9, 1.1, 0.3 * fl);
        }
        pushL(a.x + 0.5, a.y + 0.5, a.r * 2.4, 0.45, 0.9, 1.1, 0.45 * fl);
      } else if (def === 'fireline' && a.landed) {
        const sp = spellRow('fireline')?.fire?.speed || 2;
        const k = Math.min(a.len - 1, (now - a.landAt + 1) * sp);
        if (k >= a.len - 1) continue;
        const t = a.len > 1 ? k / (a.len - 1) : 1;
        const hx = a.x + (a.x2 - a.x) * t + 0.5, hy = a.y + (a.y2 - a.y) * t + 0.5;
        pushG(hx, hy, 5, 1, 0.75, 0.35, 3.4);
        pushS(hx, hy, 1.6, 3.2, 2.6, 1.6, 1);
        pushL(hx, hy, 34, 1, 0.55, 0.2, 2.2);
        for (let j = 0; j < 6; j++) pushG(hx + (rnd() - 0.5) * 3, hy + (rnd() - 0.5) * 3 - rnd() * 2, 1.2, 1, 0.6, 0.2, 1.6);
      } else if (def === 'flare') {
        const from = hqAt();
        const f = flarePose(from, a, now);
        const q = f.flying ? 1 : f.q;
        const flick = 0.9 + 0.2 * Math.sin(nowMs / 37) * Math.sin(nowMs / 71);
        pushS(f.x, f.y - f.z, 1.4, 3.4, 3.3, 2.8, 1);
        pushG(f.x, f.y - f.z, 4 + 3 * q, 1, 0.95, 0.75, 2.6 * flick);
        if (!f.flying) {
          const R = spellRow('flare')?.flare?.r || 64;
          pushL(f.x, f.y, R * 2.3, 1, 0.92, 0.72, (1.6 + 0.6 * q) * flick);
          pushS(f.x + 0.6, f.y + 0.8, 2.5, 0, 0, 0, 0.25);
          if (rnd() < 0.4) transients.push({ kind: 'spark', x: f.x + (rnd() - 0.5), y: f.y - f.z, born: nowMs, life: 500 });
        } else {
          for (let k = 1; k < 6; k++) { const b = flarePose(from, { ...a, castAt: a.castAt + k * 0.5 }, now); pushG(b.x, b.y - b.z, 1.6, 1, 0.8, 0.5, 0.8 / k); }
        }
      } else if (def === 'rain' && a.landed) {
        const n = Math.round(a.r * 3.2);
        for (let k = 0; k < n; k++) {
          const ang = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * a.r;
          const x = a.x + 0.5 + Math.cos(ang) * d, y = a.y + 0.5 + Math.sin(ang) * d;
          pushS(x, y - 1.2, 0.7, 0.55, 0.7, 0.95, 0.55);
          pushS(x, y - 0.4, 0.7, 0.65, 0.8, 1, 0.7);
          if (k % 5 === 0) pushG(x, y, 1, 0.5, 0.7, 1, 0.25);
        }
      } else if (def === 'ridge' && a.landed) {
        const n = a.phase === 'crumble' ? 10 : 16;
        for (let k = 0; k < n; k++) {
          const t = a.phase === 'crumble' ? rnd() : Math.min(1, (a.prog || 0) / Math.max(1, a.len * 3)) * (0.85 + rnd() * 0.15);
          const x = a.x + (a.x2 - a.x) * t + 0.5 + (rnd() - 0.5) * 3, y = a.y + (a.y2 - a.y) * t + 0.5 + (rnd() - 0.5) * 3;
          pushG(x, y - rnd() * 2, 2.4, 0.55, 0.48, 0.38, a.phase === 'crumble' ? 0.35 : 0.6);
        }
      } else if (!a.landed && def !== 'meteor') {
        // in flight: a small charge gathering over the target
        const p = Math.max(0, Math.min(1, (now - a.castAt) / Math.max(1, a.landAt - a.castAt)));
        const c = col(spellRow(def)?.colour || '#ffffff');
        const x = (a.x2 != null ? (a.x + a.x2) / 2 : a.x) + 0.5, y = (a.y2 != null ? (a.y + a.y2) / 2 : a.y) + 0.5;
        pushG(x, y - 4 * (1 - p), 1.5 + 2 * p, c[0], c[1], c[2], 0.8 + 1.6 * p);
      }
    }
    // the moments of arrival
    for (let k = transients.length - 1; k >= 0; k--) {
      const f = transients[k], age = (nowMs - f.born) / (f.life * (api.slow || 1));
      if (age >= 1) { transients.splice(k, 1); continue; }
      const fade = (1 - age) * (1 - age);
      if (f.kind === 'chain') {
        const on = age < 0.18 || (age > 0.3 && age < 0.45) ? 1 : 0.25;
        for (let s = 0; s < f.pts.length - 1; s++) {
          const [ax, ay] = f.pts[s], [bx, by] = f.pts[s + 1];
          const L = Math.hypot(bx - ax, by - ay), steps = Math.max(4, Math.ceil(L * 1.4));
          let px = ax + 0.5, py = ay + 0.5;
          for (let j = 1; j <= steps; j++) {
            const t = j / steps, wob = j < steps ? (Math.sin(f.seed + s * 7 + j * 2.3 + nowMs / 30) * 1.6) : 0;
            const nx = ax + 0.5 + (bx - ax) * t + wob * ((by - ay) / (L || 1)), ny = ay + 0.5 + (by - ay) * t - wob * ((bx - ax) / (L || 1));
            // a bright core while the bolt is on; between flickers only its afterglow (never a dark line)
            for (let u = 0; u < 3; u++) {
              const uu = u / 3, qx = px + (nx - px) * uu, qy = py + (ny - py) * uu;
              if (on === 1 && fade > 0.25) pushS(qx, qy, 0.9, 2.6 * fade + 0.6, 2.9 * fade + 0.7, 3.4 * fade + 0.9, 1);
              else pushG(qx, qy, 1.2, 0.55, 0.7, 1, 1.1 * fade);
            }
            if (j % 2 === 0) pushG(nx, ny, 3, 0.5, 0.65, 1, 0.45 * on * fade);
            px = nx; py = ny;
          }
          pushL(bx + 0.5, by + 0.5, 20, 0.7, 0.8, 1, 1.2 * fade);
        }
      } else if (f.kind === 'pop') {
        const rad = f.r * (0.6 + age * 0.55), n = Math.min(180, Math.ceil(rad * 6) + 12);
        for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; pushG(f.x + Math.cos(a) * rad, f.y + Math.sin(a) * rad, 2.4, f.c[0], f.c[1], f.c[2], 1.6 * fade); }
        pushL(f.x, f.y, f.r * 2.6, f.c[0], f.c[1], f.c[2], 1.2 * fade);
      } else if (f.kind === 'frost') {
        const rad = f.r * Math.min(1, age * 3), n = Math.min(200, Math.ceil(rad * 6) + 12);
        for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; pushG(f.x + Math.cos(a) * rad, f.y + Math.sin(a) * rad, 2, 0.7, 0.9, 1.1, 1.4 * fade); }
        for (let j = 0; j < 30; j++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * f.r; pushS(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 0.8, 2.2 * fade + 0.4, 2.5 * fade + 0.5, 2.8 * fade + 0.6, fade); }
        pushL(f.x, f.y, f.r * 2.2, 0.6, 0.8, 1, 0.9 * fade);
      } else if (f.kind === 'mend') {
        for (let j = 0; j < 40; j++) {
          const a = f.seed + j * 2.39996, d = f.r * (((j * 0.618) % 1) * 0.95);
          const rise = age * 14 * (0.6 + ((j * 0.37) % 1));
          pushG(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d - rise, 1.5, 0.5, 1.1, 0.6, 1.4 * (1 - age));
        }
        const rad = f.r * Math.min(1, age * 2.2), n = Math.min(160, Math.ceil(rad * 5) + 10);
        for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; pushG(f.x + Math.cos(a) * rad, f.y + Math.sin(a) * rad, 1.8, 0.45, 1.1, 0.55, 0.9 * fade); }
        pushL(f.x, f.y, f.r * 2, 0.5, 1, 0.6, 0.8 * fade);
      } else if (f.kind === 'impact') {
        // the crater keeps glowing and smoking after the fireball has gone
        pushL(f.x, f.y, f.r * 3, 1, 0.42, 0.14, 2.2 * (1 - age));
        if (age < 0.04) { shake(9); flash(0.1); }
      } else if (f.kind === 'spark') {
        pushS(f.x, f.y + age * 8, 0.8, 2.8 * fade, 2.3 * fade, 1.4 * fade, fade);
      }
    }
  }

  let rowsById = null;
  function spellRow(id) { return rowsById?.[id]; }

  const api = { onEvent, painter, setRows(list) { rowsById = Object.fromEntries(list.map((r) => [r.id, r])); }, transients, slow: 1 };
  return api;
}

/**
 * The phosphor marks on the glass: the spell being aimed (its area, line, cost and ETA, red with the reason when the
 * target is not in sight), and over the active spells an impact warning, a shield's exact edge and its time left.
 */
export function drawSpellOverlay(ctx, { toS, ppc, now, aim, active, rows, sightOf, label = drawLabel }) {
  const R = (id) => rows[id];
  for (const a of active) {
    const def = R(a.spell); if (!def) continue;
    if (a.spell === 'meteor' && !a.landed) {
      const left = Math.max(0, (a.landAt - now) / 20);
      const [sx, sy] = toS(a.x + 0.5, a.y + 0.5);
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);
      drawRing(ctx, sx, sy, def.blast.r * ppc, `rgba(255,90,70,${0.45 + 0.5 * pulse})`, [4, 3]);
      drawRing(ctx, sx, sy, def.blast.damageR * ppc, 'rgba(255,90,70,0.35)', [2, 6]);
      label(ctx, sx, sy - def.blast.damageR * ppc - 6, `IMPACT ${left.toFixed(1)} S`, { colour: PHOSPHOR.red, size: 10 });
    } else if (a.spell === 'shield' && a.landed) {
      const [sx, sy] = toS(a.x + 0.5, a.y + 0.5);
      drawRing(ctx, sx, sy, a.r * ppc, 'rgba(143,240,255,0.7)', []);
      if (ppc >= 1) label(ctx, sx, sy - a.r * ppc - 4, `SHIELD ${Math.max(0, Math.ceil((a.until - now) / 20))} S`, { colour: '#8ff0ff', size: 9 });
    } else if (!a.landed && def.shape === 'line') {
      drawDashed(ctx, [toS(a.x + 0.5, a.y + 0.5), toS(a.x2 + 0.5, a.y2 + 0.5)], def.colour, 2, [3, 4]);
    } else if (!a.landed) {
      const [sx, sy] = toS(a.x + 0.5, a.y + 0.5);
      drawRing(ctx, sx, sy, 8, def.colour, [2, 3]);
    }
  }
  if (!aim?.spell) return;
  const def = R(aim.spell); if (!def) return;
  const T = aim.target;
  const pts = T ? (def.shape === 'line' && T.x2 != null ? [[T.x, T.y], [T.x2, T.y2]] : [[T.x, T.y]]) : null;
  if (!pts) return;
  const why = pts.map(([x, y]) => sightOf(x, y, def.sight)).find(Boolean) || (def.shape === 'line' && Math.hypot(T.x2 - T.x, T.y2 - T.y) > def.maxLen ? 'TOO LONG' : null);
  const c = why ? PHOSPHOR.red : def.colour;
  const area = def.shield?.r || def.blast?.r || def.frost?.r || def.rain?.r || def.mend?.r || def.flare?.r || def.hit?.radius * 3 || 6;
  if (def.shape === 'line') {
    ctx.save(); ctx.globalAlpha = 0.85;
    drawDashed(ctx, pts.map(([x, y]) => toS(x + 0.5, y + 0.5)), c, Math.max(2, (def.fire?.width || def.ridge?.width || 1) * 2 * ppc), [6, 4]);
    ctx.restore();
  } else {
    const [sx, sy] = toS(T.x + 0.5, T.y + 0.5);
    drawRing(ctx, sx, sy, area * ppc, c, [5, 4]);
    ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx - 7, sy); ctx.lineTo(sx + 7, sy); ctx.moveTo(sx, sy - 7); ctx.lineTo(sx, sy + 7); ctx.stroke(); ctx.restore();
  }
  const [lx, ly] = toS(pts[pts.length - 1][0] + 0.5, pts[pts.length - 1][1] + 0.5);
  label(ctx, lx, ly - (def.shape === 'line' ? 12 : area * ppc + 8), why ? `${def.short} · ${why}` : `${def.short} · ${def.cost} MANA · ETA ${(aim.eta / 20).toFixed(1)} S`, { colour: c, size: 10 });
}
