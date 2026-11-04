// Chunk streaming on the page: which chunks the camera needs, asking the worker for them, painting
// what comes back into textures, and forgetting textures that are far away.

import { CH } from '../planet/chunkgen.js';
import { createPainter, IW, IH, MX, OV } from '../render/paint.js';

export function createStream({ link, renderer, M, world }) {
  const painter = createPainter(M);
  const buf = new Uint8ClampedArray(IW * IH * 4), glow = new Uint8ClampedArray(IW * IH * 4);
  const cw = world.W / CH, chh = world.H / CH;
  const inFlight = new Set();
  const have = new Map();          // key → { cx, cy, version, last }
  const data = new Map();          // key → latest chunk layers (for hover readouts and repaint)
  let frame = 0;
  const wrap = (x, w) => ((x % w) + w) % w;
  const keyOf = (cx, cy) => wrap(cx, cw) + cy * cw;

  function take(list) {
    for (const c of list) {
      const key = keyOf(c.cx, c.cy);
      inFlight.delete(key);
      data.set(key, c);
      painter.paint(c, buf, c.cx * CH, c.cy * CH, glow);
      renderer.setChunkImage(key, IW, IH, buf);
      renderer.setChunkGlow(key, IW, IH, glow);
      const h = have.get(key);
      if (h) h.version = c.version; else have.set(key, { cx: c.cx, cy: c.cy, version: c.version, last: frame });
    }
  }
  link.on('chunks', m => take(m.list));
  let clock = null, town = null, prevPeople = null, townAt = 0;
  const listeners = [];
  link.on('tick', m => {
    clock = m.clock; take(m.list);
    if (m.town) { prevPeople = town?.people || null; town = m.town; townAt = performance.now(); }
    for (const fn of listeners) fn(m);
  });

  /**
   * The chunks to draw this frame (north → south), and requests for the missing ones.
   * cam = { x, y, ppc }, view = { w, h } in CSS px.
   */
  function visible(cam, view) {
    frame++;
    const halfW = view.w / 2 / cam.ppc, halfH = view.h / 2 / cam.ppc;
    const x0 = Math.floor((cam.x - halfW - MX) / CH), x1 = Math.floor((cam.x + halfW + MX) / CH);
    const y0 = Math.max(0, Math.floor((cam.y - halfH) / CH)), y1 = Math.min(chh - 1, Math.floor((cam.y + halfH + OV) / CH));
    const list = [], want = [];
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 900) return list;      // too far out: the macro view covers it
    if (frame % 10 === 0) link.send('view', { rect: { x0: x0 - 1, y0: Math.max(0, y0 - 1), x1: x1 + 1, y1: Math.min(chh - 1, y1 + 1) }, cells: { x0: cam.x - halfW - 4, x1: cam.x + halfW + 4, y0: cam.y - halfH - 4, y1: cam.y + halfH + 8 } });
    // nearest first for requests, so the middle of the screen fills in first
    const ccx = cam.x / CH, ccy = cam.y / CH;
    for (let cy = y0; cy <= y1; cy++) for (let k = x0; k <= x1; k++) {
      const key = keyOf(k, cy), h = have.get(key);
      // draw at the unwrapped position nearest the camera: k is already that copy
      if (h) { h.last = frame; list.push({ key, gx: k * CH - MX, gy: cy * CH - OV, w: IW, h: IH }); }
      else if (!inFlight.has(key)) want.push([wrap(k, cw), cy, (k + 0.5 - ccx) ** 2 + (cy + 0.5 - ccy) ** 2]);
    }
    if (want.length && inFlight.size < 24) {
      want.sort((a, b) => a[2] - b[2]);
      const batch = want.slice(0, 24 - inFlight.size).map(([cx, cy]) => [cx, cy]);
      for (const [cx, cy] of batch) inFlight.add(keyOf(cx, cy));
      link.requestChunks(batch);
    }
    // forget textures nobody has looked at for a while
    if (have.size > 700 && frame % 30 === 0) {
      const old = [...have.entries()].sort((a, b) => a[1].last - b[1].last).slice(0, have.size - 600);
      for (const [key] of old) { renderer.dropChunk(key); have.delete(key); data.delete(key); }
      link.send('forget', { keys: old.map(o => o[0]) });
    }
    return list;
  }

  /** The cell under a world point, from whatever chunk data the page holds (or null). */
  function cellAt(gx, gy) {
    gx = Math.floor(wrap(gx, world.W)); gy = Math.floor(gy);
    const c = data.get(keyOf(Math.floor(gx / CH), Math.floor(gy / CH)));
    if (!c) return null;
    const i = (gy % CH) * CH + (gx % CH);
    return { ground: c.ground[i], mat: c.mat[i], height: c.height[i], tall: c.tall[i] };
  }

  return { visible, cellAt, onTick: fn => listeners.push(fn), get town() { return town; }, get townAt() { return townAt; }, get clock() { return clock; }, get loaded() { return have.size; }, get pending() { return inFlight.size; } };
}
