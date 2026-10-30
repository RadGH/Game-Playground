// The stage: one canvas, one renderer, the camera and the frame loop. Whatever session is on it
// (the title's live demo, a challenge, the sandbox, the realm) is stepped 30 times a game-second
// and drawn every frame.

import { createRenderer } from '../render/gl.js';
import { createFrame, buildFrame } from '../render/frame.js';

const BIG_WORLD = 100000, BUILD_BUDGET = 110000;   // cells

export function createStage(canvas, opts = {}) {
  const renderer = createRenderer(canvas);
  const st = {
    renderer, session: null, frame: null,
    cam: { x: 0, y: 0, zoom: 3 },
    frameNo: 0, buildSkip: 0, time: 0, slow: 1 / 60, autoDropped: false, slowSince: 0,
    // speed numbers (ms, smoothed): the readout in Settings and every bug report carry these
    perf: { frame: 16, sim: 0, build: 0, draw: 0, gpu: 0, lights: 0, worst: 0 },
    frameTimes: new Float32Array(120), diag: false,   // diag: wait for the GPU each frame to time it (readout on only)
    controller: null,        // { speed(), frame(), cursorView() }
    quality: opts.quality || 'high',
    shakeOn: true,
    onFrame: null,
  };
  let dpr = 1;
  // the view is the canvas, which in landscape stops where the tool column starts
  const VW = () => canvas.clientWidth || innerWidth;
  function resize() {
    dpr = st.quality === 'low' ? 1 : Math.min(2, window.devicePixelRatio || 1);
    renderer.resize(Math.round(VW() * dpr), Math.round(innerHeight * dpr));
    st.redraw = true;   // a resized canvas is blank: draw once even under a window
    st.clamp();
  }
  addEventListener('resize', resize);

  st.setSession = function (s) {
    st.session = s;
    st.frame = s ? createFrame(s.sim.world) : null;
    if (s) renderer.setWorld(s.sim.world.W, s.sim.world.H);
  };
  /** Frame the world: fill the width on a phone, or the height on a wide screen. */
  st.fit = function (focus) {
    const w = st.session.sim.world;
    const land = innerWidth > innerHeight && innerHeight < 520;
    const top = 60, bottom = land ? 10 : 230;
    const avW = VW(), avH = Math.max(200, innerHeight - top - bottom);
    st.cam.zoom = Math.max(1.2, Math.min(avW / w.W, avH / w.H) * 1.0);
    if (VW() < 600 && !st.wholeMap) st.cam.zoom = Math.max(st.cam.zoom, avW / w.W, Math.min(3, avW / 120));
    st.cam.x = focus ? focus[0] : w.W / 2;
    st.cam.y = focus ? focus[1] : w.H / 2 + (bottom - top) / 2 / st.cam.zoom;
    st.minZoom = Math.min(avW / w.W, avH / w.H) * 0.8;
    st.clamp();
  };
  st.clamp = function () {
    if (!st.session) return;
    const w = st.session.sim.world;
    st.cam.zoom = Math.max(st.minZoom || 0.8, Math.min(24, st.cam.zoom));
    const z = st.cam.zoom;
    const hw = VW() / 2 / z, hh = innerHeight / 2 / z;
    // the view may show a little of the dark beyond the edge, never mostly dark; the bottom
    // allows for the dock and the top for the bar
    const out = Math.min(hw, hh) * 0.3;
    const top = 60 / z, bottom = (innerWidth > innerHeight && innerHeight < 520 ? 10 : 230) / z;
    const fit = (c, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, c)));
    st.cam.x = fit(st.cam.x, hw - out, w.W - hw + out);
    st.cam.y = fit(st.cam.y, hh - out - top, w.H - hh + out + bottom);
  };
  st.toWorld = (cx, cy) => [st.cam.x + (cx - VW() / 2) / st.cam.zoom, st.cam.y + (cy - innerHeight / 2) / st.cam.zoom];
  st.toScreen = (wx, wy) => [(wx - st.cam.x) * st.cam.zoom + VW() / 2, (wy - st.cam.y) * st.cam.zoom + innerHeight / 2];
  st.panFrom = (cam, dx, dy) => { st.cam.x = cam.x - dx / st.cam.zoom; st.cam.y = cam.y - dy / st.cam.zoom; st.clamp(); };
  st.zoomAt = (cx, cy, k) => {
    const [wx, wy] = st.toWorld(cx, cy);
    st.cam.zoom *= k; st.clamp();
    const [nx, ny] = st.toWorld(cx, cy);
    st.cam.x += wx - nx; st.cam.y += wy - ny; st.clamp();
  };
  st.pinch = (cam0, mx0, my0, mx, my, k) => {
    st.cam.zoom = cam0.zoom * k;
    st.clamp();
    // keep the world point that was under the fingers' midpoint under it
    const wx = cam0.x + (mx0 - VW() / 2) / cam0.zoom, wy = cam0.y + (my0 - innerHeight / 2) / cam0.zoom;
    st.cam.x = wx - (mx - VW() / 2) / st.cam.zoom;
    st.cam.y = wy - (my - innerHeight / 2) / st.cam.zoom;
    st.clamp();
  };

  // ---------- the loop ----------
  let last = performance.now(), last0 = last, acc = 0;
  const ema = (k, v) => { st.perf[k] = st.perf[k] * 0.9 + v * 0.1; };
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    // a phone that cannot keep up drops to the fast picture by itself (once). Measured in SECONDS of
    // slowness, not frames: at 0.5 fps "after 240 frames" was eight minutes away.
    st.slow = st.slow * 0.9 + dt * 0.1;
    st.frameTimes[st.frameNo % 120] = now - last0; last0 = now;
    st.perf.frame = st.perf.frame * 0.9 + dt * 1000 * 0.1;
    if (st.quality === 'high' && !st.autoDropped && st.controller && st.session) {
      if (st.slow > 0.05) { st.slowSince ||= now; if (now - st.slowSince > 2500) { st.autoDropped = true; st.setQuality('low'); st.onAutoLow?.(); } }
      else st.slowSince = 0;
    }
    st.time += dt;
    st.frameNo++;
    const s = st.session;
    if (!s) return;
    const speed = st.controller ? st.controller.speed() : 1;
    acc += dt * 30 * speed;
    let steps = 0;
    const maxSteps = 3 * Math.max(1, speed);
    const t0 = performance.now();
    while (acc >= 1 && steps < maxSteps) { s.step(); acc -= 1; steps++; }
    if (steps) ema('sim', (performance.now() - t0) / steps);
    if (acc > 3) acc = 0;
    st.controller?.frame?.();
    st.onFrame?.(dt);
    // the world only changes when the sim stepped (30 a second); between steps the GPU just
    // redraws the same textures under the moving camera, which halves the work at 60 Hz
    // a window over the world (menu, report, goals): keep the last picture and draw nothing, so a
    // slow phone's GPU is not fighting the typing (owner's iPhone lagged while writing a report)
    if (st.covered?.() && st.frame.built && !st.redraw) return;
    st.redraw = false;
    draw(steps > 0 || (speed === 0 && st.frameNo % 3 === 0) || !st.frame.built);
  }
  requestAnimationFrame(loop);

  /** The cells on screen plus a margin, for a big world. */
  function viewRect(w) {
    const hw = VW() / 2 / st.cam.zoom + 10, hh = innerHeight / 2 / st.cam.zoom + 10;
    return [Math.max(0, (st.cam.x - hw) | 0), Math.max(0, (st.cam.y - hh) | 0), Math.min(w.W, Math.ceil(st.cam.x + hw)), Math.min(w.H, Math.ceil(st.cam.y + hh))];
  }
  function draw(rebuild) {
    const s = st.session, w = s.sim.world;
    const day = s.sim.daylight();
    const cursor = st.controller?.cursorView?.() || null;
    const tb = performance.now();
    // a big world: rebuild only what the camera sees, and when nearly all of it is in view rebuild less often
    // (building 512x512 cells 30 times a second is more than a phone has)
    const rect = w.N > BIG_WORLD && st.frame.built ? viewRect(w) : null;
    if (rect && rebuild) {
      const every = Math.ceil((rect[2] - rect[0]) * (rect[3] - rect[1]) / BUILD_BUDGET);
      if (every > 1 && (++st.buildSkip % every)) rebuild = false;
    }
    if (rebuild) { st.frame.built = true; st.frame.dirty = true; buildFrame(st.frame, w, s.sim.ps, {
      daylight: day, rect,
      draw: (api) => {
        s.sim.creatures.draw(api, s.sim.tick);
        s.run?.draw?.(api, s.sim.tick, cursor);
        // meteor warning rings, pulsing
        if (w.warnings) for (const wr of w.warnings) {
          const pulse = (s.sim.tick >> 2) & 1;
          const n = Math.ceil(wr.r * 6.3);
          for (let k = 0; k < n; k++) {
            const a = k / n * Math.PI * 2;
            if ((k + (s.sim.tick >> 1)) % 3 === 0) continue;
            api.px(wr.x + Math.cos(a) * wr.r, wr.y + Math.sin(a) * wr.r, 255, pulse ? 80 : 150, 40, 0.8);
          }
          api.px(wr.x, wr.y, 255, 230, 120, 1);
        }
        // barrier domes: a shimmering ring and a faint skin
        if (w.barriers) for (const b of w.barriers) {
          const fade = Math.min(1, b.ttl / 60);
          const n = Math.ceil(b.r * 6.3);
          for (let k = 0; k < n; k++) {
            const a = k / n * Math.PI * 2 + st.time * 0.4;
            if ((k + (st.frameNo >> 3)) % 4 === 0) continue;
            api.px(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, 150, 230, 255, 0.7 * fade);
          }
          for (let k = 0; k < 10; k++) { const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * b.r; api.glow(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, 30 * fade, 70 * fade, 110 * fade); }
        }
        // shockwave rings
        if (w.rings) for (const ring of w.rings) {
          const t = 1 - ring.ttl / ring.life;
          const rr = ring.max * (0.25 + t * 0.75);
          const n = Math.ceil(rr * 6.3);
          const k2 = (1 - t) * 0.9;
          for (let k = 0; k < n; k++) {
            const a = k / n * Math.PI * 2;
            api.px(ring.x + Math.cos(a) * rr, ring.y + Math.sin(a) * rr, ring.color[0], ring.color[1], ring.color[2], k2);
          }
        }
        // where a structure would go
        if (cursor?.rect) {
          const [x, y, rw, rh] = cursor.rect, c = cursor.color;
          for (let k = 0; k < rw; k++) { api.px(x + k, y, c[0] * 255, c[1] * 255, c[2] * 255, 0.5); api.px(x + k, y + rh - 1, c[0] * 255, c[1] * 255, c[2] * 255, 0.5); }
          for (let k = 0; k < rh; k++) { api.px(x, y + k, c[0] * 255, c[1] * 255, c[2] * 255, 0.5); api.px(x + rw - 1, y + k, c[0] * 255, c[1] * 255, c[2] * 255, 0.5); }
        }
        // line tool preview
        if (cursor?.line) {
          const [x0, y0, x1, y1] = cursor.line;
          const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
          for (let k = 0; k <= n; k += 1) if ((k + (st.frameNo >> 2)) % 3) api.px(x0 + (x1 - x0) * k / Math.max(1, n), y0 + (y1 - y0) * k / Math.max(1, n), 255, 220, 140, 0.6);
        }
      },
    }); }
    // light and sky from the clock
    const t = w.clock;
    const a = (t - 0.25) * Math.PI * 2;
    const warm = Math.max(0, 1 - Math.abs(day - 0.35) / 0.35) * (day < 0.98 ? 1 : 0);
    const night = [0.3, 0.33, 0.72], noon = [1.12, 1.1, 1.04], dusk = [1.1, 0.68, 0.46];
    const amb = [0, 1, 2].map(k => night[k] + (noon[k] - night[k]) * day + (dusk[k] - noon[k]) * warm * 0.55 * day);
    const sunUp = Math.sin(a);
    const sun = sunUp > -0.05 ? [Math.cos(a) * 0.9, 0.45, Math.max(0.18, sunUp)] : [-Math.cos(a) * 0.6, -0.3, 0.6];
    const sh = st.shakeOn ? w.shake : 0;
    if (rebuild) ema('build', performance.now() - tb);
    const lights = st.frame.pointLights ? w.lights.slice(-20).concat(st.frame.pointLights) : w.lights;
    st.perf.lights = Math.min(st.quality === 'low' ? 12 : 40, lights.length);
    const td = performance.now();
    renderer.draw(st.frame, {
      x: st.cam.x, y: st.cam.y, zoom: st.cam.zoom * dpr,
      ambient: amb, sun, sunAmt: 0.9, time: st.time, flash: Math.min(0.8, w.flashSky || 0), day,
      shakeX: (Math.random() - 0.5) * sh * 0.12, shakeY: (Math.random() - 0.5) * sh * 0.12,
      lights: st.quality === 'low' ? lights.slice(-12) : lights,
      cursor: cursor && !cursor.line ? cursor : cursor?.line ? { x: cursor.x, y: cursor.y, r: 1.5, color: cursor.color } : null,
    });
    ema('draw', performance.now() - td);
    // with the readout on, wait for the GPU to finish so its share can be seen (costs a little)
    if (st.diag && renderer.sync) { const tg = performance.now(); renderer.sync(); ema('gpu', performance.now() - tg); }
  }

  st.setQuality = (q) => { st.quality = q; resize(); };
  /** A picture of the world for a bug report. The canvas no longer keeps every frame (that costs a
   *  copy per frame on iPhones), so draw one now and read it back in the same task. */
  st.capture = (type = 'image/jpeg', q = 0.5) => { try { if (st.session) { st.buildSkip = -1; draw(true); } return canvas.toDataURL(type, q); } catch { return null; } };
  /** Everything a speed report needs, as plain data. */
  st.perfReport = () => {
    const ft = [...st.frameTimes].filter(x => x > 0).sort((a, b) => a - b);
    const q = (p) => ft.length ? +ft[Math.min(ft.length - 1, Math.floor(ft.length * p))].toFixed(1) : null;
    const w = st.session?.sim.world;
    return {
      fps: +(1000 / Math.max(1, st.perf.frame)).toFixed(1), frameMs: { median: q(0.5), p90: q(0.9), worst: q(1) },
      ms: Object.fromEntries(['sim', 'build', 'draw', 'gpu'].map(k => [k, +st.perf[k].toFixed(2)])),
      lights: st.perf.lights, quality: st.quality, autoDropped: st.autoDropped, dpr, devicePixelRatio: window.devicePixelRatio,
      canvas: [canvas.width, canvas.height], world: w ? [w.W, w.H] : null, zoom: +st.cam.zoom.toFixed(2),
      creatures: st.session?.sim.creatures.list.length ?? null, particles: st.session?.sim.ps.n ?? null,
      awakeChunks: w ? w.awake.reduce((a, b) => a + b, 0) : null, burning: w?.stats.burning ?? null,
      renderer: renderer.info?.() || { kind: renderer.kind },
    };
  };
  resize();
  return st;
}

