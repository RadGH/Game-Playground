// The light buffer (PLAN M1): every emitting pixel lights the pixels near it.
//
// 1. Emitter pass — a WORLD-SPACE texture over the view (plus a margin so lights just off screen
//    still reach in), one texel per `div` cells. Each texel averages the emission of the cells under
//    it: fire, lava, lamps, crystal, and hot ground (embers, fresh rubble).
// 2. Point splats added on top: hot debris, blast flashes, lightning through water.
// 3. A dual-filter blur chain sums the emission at five scales, so light is strong near a source
//    and has a long soft tail. Because the buffer is in world space, a fire's glow covers the same
//    number of metres at every zoom.
// The cell pass samples the result (and its gradient, to light the side of a raised pixel that
// faces the source).

import { program, target, freeTarget, bindTarget, bindTex, fullscreen, createBlurChain, FULLSCREEN_VS } from './gl.js';
import { EMIT_FS, POINT_VS, POINT_FS } from './cells.glsl.js';

export function createLight(gl, hdr) {
  const emit = program(gl, FULLSCREEN_VS, EMIT_FS);
  const points = program(gl, POINT_VS, POINT_FS);
  const blur = createBlurChain(gl, hdr);
  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
  gl.bindVertexArray(null);
  // 8-bit fallback stores light / 6 so values above 1 survive
  const scale = hdr ? 1 : 6;
  let tgt = null;
  const rect = { x: 0, y: 0, w: 1, h: 1, tw: 1, th: 1 };

  /**
   * view: { x0, y0, x1, y1 } world cells on screen. div: cells per light texel.
   * cellsTex/matTex bound by the caller on units 0/1. pts: Float32Array of [x,y,size,kind,r,g,b,i].
   */
  function render(view, div, world, time, pts, nPts, levels, gain = 1.35) {
    const margin = 40;
    let x0 = Math.floor((view.x0 - margin) / div) * div, y0 = Math.floor((view.y0 - margin) / div) * div;
    let w = Math.ceil((view.x1 - view.x0 + 2 * margin) / div) * div, h = Math.ceil((view.y1 - view.y0 + 2 * margin) / div) * div;
    let tw = Math.ceil(w / div), th = Math.ceil(h / div);
    // cap the texture; zoomed far out a texel simply covers more cells
    const cap = 640;
    if (tw > cap || th > cap) {
      const f = Math.max(tw, th) / cap;
      tw = Math.ceil(tw / f); th = Math.ceil(th / f);
    }
    rect.x = x0; rect.y = y0; rect.w = w; rect.h = h; rect.tw = tw; rect.th = th;
    if (!tgt || tgt.w !== tw || tgt.h !== th) { freeTarget(gl, tgt); tgt = target(gl, tw, th, hdr); }
    bindTarget(gl, tgt);
    emit.use();
    gl.uniform1i(emit.u.uCells, 0);
    gl.uniform1i(emit.u.uMat, 1);
    gl.uniform2f(emit.u.uWorld, world.W, world.H);
    gl.uniform1f(emit.u.uTime, time);
    gl.uniform4f(emit.u.uLightRect, x0, y0, w, h);
    gl.uniform2f(emit.u.uLightRes, tw, th);
    gl.uniform1f(emit.u.uInvScale, 1 / scale);
    fullscreen(gl);
    if (nPts) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      points.use();
      gl.uniform2f(points.u.uOrigin, x0, y0);
      gl.uniform2f(points.u.uSpan, w, h);
      gl.uniform1f(points.u.uPxPerCell, tw / w);
      gl.uniform1f(points.u.uFlip, -1);
      gl.uniform1f(points.u.uScale, 1 / scale);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, pts.subarray(0, nPts * 8), gl.STREAM_DRAW);
      gl.drawArrays(gl.POINTS, 0, nPts);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
    const out = blur.run(tgt.tex, tw, th, levels, 1, gain);
    // gain 1.35 per level: a point (lamp) falls off over ~15 cells, a line (fire front) over ~30,
    // and a huge area (lava field) adds up to a lot — the cell pass saturates it softly
    return { tex: out, rect, scale };
  }

  return { render, rect, get scale() { return scale; } };
}
