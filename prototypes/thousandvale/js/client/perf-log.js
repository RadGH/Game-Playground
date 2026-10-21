// The performance log (2026-10-20, the owner's "stuttering in combat" report). Pure: no DOM, no three.js — node tests
// import it (tests/D/perf-log.test.js).
//
// perf.js measures; this file KEEPS what it measured, in a small capped log, and says in plain words what each stutter
// was. Two kinds of entry:
//   * a STUTTER — one frame that took longer than the watchdog's limit (100 ms):
//       { at, ms, busyMs, spans: [[name, ms]], tasks: [ms], compiles: [{ name, what, site }], heapMB, heapDropMB,
//         draws, tris, programs, textures, geometries, effects, actors, cause: { code, text } }
//   * a COMPILE — the game had to build a new graphics shader ("program") while it was running:
//       { at, frameMs, name, what, site, users, afterLoad }
// Every entry is capped (`cap` stutters, `compileCap` compiles), so the log can stay on all the time.
//
//   const log = createPerfLog({ cap: 40 })
//   log.stutter(entry)          // perf.js, once per long frame (the cause is worked out here)
//   log.compile(entry)          // perf.js, once per new shader
//   log.snapshot(extra)         // { v, stutters, compiles, counts, ...extra } — what the panel, the report and the bug report read
//   reportLines(snap, { max })  // short lines for the bug report (each <= 220 characters)
//   reportText(snap)            // the "Copy performance report" text

export const PERF_LOG_VERSION = 1;
/** The bug report carries at most this many lines of the performance log (server: js/sim/feedback.js FEEDBACK.perfLines). */
export const PERF_REPORT_LINES = 16;
export const PERF_LINE_MAX = 220;

/** What a named span means, for a player (perf.span names in the game). The first prefix that matches wins. */
const SPAN_WORDS = [
  ['gl:link', 'building a graphics shader'],
  ['zone:', 'loading a piece of the world'],
  ['terrain:', 'building the ground'],
  ['world:', 'placing grass and small things on the ground'],
  ['scatter:', 'placing trees and rocks'],
  ['actor:build', 'building a character or monster model'],
  ['warm:', 'getting graphics ready at load'],
  ['spells:', 'getting spell effects ready'],
  ['render', 'drawing the frame'],
];
export function spanWords(name) {
  const n = String(name || '');
  for (const [p, w] of SPAN_WORDS) if (n === p || n.startsWith(p)) return w;
  return n || 'the game\'s own work';
}

const round = v => (Number.isFinite(v) ? Math.round(v) : null);
const clip = (s, n = PERF_LINE_MAX) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/**
 * Why was this frame slow? -> { code, text }. Codes, most certain first:
 *   shader   — a new graphics shader was built in that frame (the first time something was drawn)
 *   outside  — the page was busy between frames (a long task with no frame in it)
 *   gc       — the browser cleaned up memory (the JavaScript heap shrank a lot in that frame)
 *   work     — the game's own code was slow (the biggest span is named)
 *   gpu      — the game's code finished quickly and the frame still took long: the graphics card (or the browser
 *              drawing the page) was the slow part
 *   unknown
 */
export function causeOf(e = {}) {
  const ms = +e.ms || 0, busy = Number.isFinite(e.busyMs) ? e.busyMs : null;
  const compiles = Array.isArray(e.compiles) ? e.compiles : [];
  if (compiles.length) {
    const names = [...new Set(compiles.map(c => c.what || c.name).filter(Boolean))].slice(0, 3);
    return { code: 'shader', text: `Building ${compiles.length === 1 ? 'a new graphics shader' : `${compiles.length} new graphics shaders`} (the first time ${names.length ? names.join(', ') : 'something'} was drawn)` };
  }
  const tasks = Array.isArray(e.tasks) ? e.tasks : [];
  const top = Array.isArray(e.spans) && e.spans.length ? e.spans[0] : null;
  if (e.outside && tasks.length) return { code: 'outside', text: `The page was busy between frames for ${round(Math.max(...tasks))} ms${top ? ` (${spanWords(top[0])})` : ''}` };
  if ((+e.heapDropMB || 0) >= 24) return { code: 'gc', text: `The browser cleaned up memory (${round(e.heapDropMB)} MB freed in that frame)` };
  if (busy != null && busy >= ms * 0.5 && busy > 50) {
    const named = top && top[0] !== 'render' && top[1] >= busy * 0.3 ? top : null;
    if (named) return { code: 'work', text: `The game's own work: ${spanWords(named[0])} (${round(named[1])} ms)` };
    if (top && top[0] === 'render') return { code: 'work', text: `Drawing the frame took ${round(top[1])} ms (${e.draws != null ? `${e.draws} draw calls, ` : ''}the game's code was busy)` };
    return { code: 'work', text: `The game's own code was busy for ${round(busy)} ms` };
  }
  if (busy != null && ms - busy > 80) return { code: 'gpu', text: `Waiting on the graphics card: the game's code took ${round(busy)} ms of a ${round(ms)} ms frame` };
  return { code: 'unknown', text: `A slow frame (${round(ms)} ms) with no clear cause` };
}

export function createPerfLog({ cap = 40, compileCap = 40 } = {}) {
  const stutters = [], compiles = [];
  const counts = { stutters: 0, compiles: 0, compilesAfterLoad: 0, worstMs: 0, byCause: {} };
  return {
    stutters, compiles, counts,
    stutter(e) {
      const x = { ...e, ms: round(e.ms), busyMs: round(e.busyMs) };
      x.cause = causeOf(x);
      stutters.push(x); if (stutters.length > cap) stutters.shift();
      counts.stutters++; counts.worstMs = Math.max(counts.worstMs, x.ms || 0);
      counts.byCause[x.cause.code] = (counts.byCause[x.cause.code] || 0) + 1;
      return x;
    },
    compile(c) {
      const x = { ...c, frameMs: round(c.frameMs) };
      compiles.push(x); if (compiles.length > compileCap) compiles.shift();
      counts.compiles++; if (c.afterLoad) counts.compilesAfterLoad++;
      return x;
    },
    clear() { stutters.length = 0; compiles.length = 0; Object.assign(counts, { stutters: 0, compiles: 0, compilesAfterLoad: 0, worstMs: 0, byCause: {} }); },
    snapshot(extra = {}) {
      return { v: PERF_LOG_VERSION, ...extra, counts: { ...counts, byCause: { ...counts.byCause } }, stutters: stutters.map(s => ({ ...s })), compiles: compiles.map(c => ({ ...c })) };
    },
  };
}

const ago = (at, now) => (Number.isFinite(at) && Number.isFinite(now) ? `${Math.max(0, Math.round((now - at) / 1000))} s ago` : '');

/** One stutter as one short line. */
export function stutterLine(s, now = null) {
  const bits = [`${s.ms} ms`, s.cause?.text || causeOf(s).text];
  const ctx = [s.draws != null && `${s.draws} draws`, s.programs != null && `${s.programs} shaders`, s.effects != null && `${s.effects} effects`, s.actors != null && `${s.actors} bodies near`, s.heapMB != null && `${s.heapMB} MB memory`].filter(Boolean).join(', ');
  return clip(`${now != null ? ago(s.at, now) + ': ' : ''}${bits.join(' — ')}${ctx ? ` [${ctx}]` : ''}`);
}
/** One shader build as one short line. */
export function compileLine(c, now = null) {
  return clip(`${now != null ? ago(c.at, now) + ': ' : ''}shader ${c.name || '?'} for ${c.what || 'something not in the world'}${c.site ? ` (${c.site})` : ''}${c.frameMs != null ? `, frame ${c.frameMs} ms` : ''}${c.afterLoad ? '' : ' (while loading)'}`);
}

/** The bug report's lines: a header, then the newest stutters and shader builds, newest first, at most `max`. */
export function reportLines(snap = {}, { max = PERF_REPORT_LINES, now = snap.now ?? null } = {}) {
  const c = snap.counts || {};
  const head = clip(`fps ${snap.fps ?? '?'} · worst ${c.worstMs ?? 0} ms · ${c.stutters || 0} stutters · ${c.compilesAfterLoad || 0} shaders built after load${snap.gpu ? ` · ${snap.gpu}` : ''}${snap.parallel != null ? ` · parallel shader builds ${snap.parallel ? 'yes' : 'no'}` : ''}${snap.quality ? ` · quality ${snap.quality}` : ''}${snap.readyMs != null ? ` · ready ${Math.round(snap.readyMs / 1000)} s after load` : ''}`);
  const rest = [
    ...(snap.stutters || []).map(s => ({ at: s.at, line: 'stutter ' + stutterLine(s, now) })),
    ...(snap.compiles || []).filter(x => x.afterLoad || x.frameMs > (snap.longMs || 100)).map(x => ({ at: x.at, line: compileLine(x, now) })),      // one built while loading counts when it froze a frame
  ].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, Math.max(0, max - 1)).map(x => x.line);
  return [head, ...rest];
}

/** "Copy performance report": plain text a player can paste into a message. */
export function reportText(snap = {}) {
  const c = snap.counts || {}, now = snap.now ?? null;
  const out = [];
  out.push('Thousandvale performance report');
  out.push(`When: ${snap.when || ''}  Build: ${snap.build || '?'}  Graphics quality: ${snap.quality || '?'}`);
  if (snap.gpu) out.push(`Graphics card (as the browser names it): ${snap.gpu}`);
  if (snap.ua) out.push(`Browser: ${snap.ua}`);
  out.push(`Frames a second now: ${snap.fps ?? '?'}  Slowest frame: ${c.worstMs || 0} ms  Stutters (frames over ${snap.longMs || 100} ms): ${c.stutters || 0}`);
  const by = Object.entries(c.byCause || {}).map(([k, n]) => `${k} ${n}`).join(', ');
  if (by) out.push(`Stutters by cause: ${by}`);
  out.push(`Shaders built after loading: ${c.compilesAfterLoad || 0} (each one can freeze the game for a moment)  Parallel shader builds: ${snap.parallel ? 'yes' : 'no'}`);
  out.push(snap.readyMs != null ? `Graphics warm-up finished ${Math.round(snap.readyMs / 1000)} s after the page opened (a fight before then can still stutter)` : 'Graphics warm-up: not finished yet (a fight now can still stutter)');
  const e = snap.scene || {};
  if (Object.keys(e).length) out.push(`Right now: ${[e.draws != null && `${e.draws} draw calls`, e.tris != null && `${e.tris} triangles`, e.programs != null && `${e.programs} shaders`, e.textures != null && `${e.textures} textures`, e.geometries != null && `${e.geometries} meshes`, e.heapMB != null && `${e.heapMB} MB memory`, e.effects != null && `${e.effects} effects`, e.actors != null && `${e.actors} bodies near`].filter(Boolean).join(', ')}`);
  out.push('');
  out.push('Recent stutters (newest first):');
  const st = (snap.stutters || []).slice().reverse();
  if (!st.length) out.push('  none');
  for (const s of st.slice(0, 20)) {
    out.push('  ' + stutterLine(s, now));
    if (s.spans?.length) out.push('    work in that frame: ' + s.spans.slice(0, 5).map(([n, ms]) => `${n} ${ms} ms`).join(', '));
    for (const x of (s.compiles || []).slice(0, 4)) out.push('    shader: ' + (x.what || x.name) + (x.site ? ` (${x.site})` : ''));
  }
  out.push('');
  out.push('Shaders built while playing (newest first):');
  const cs = (snap.compiles || []).filter(x => x.afterLoad || x.frameMs > (snap.longMs || 100)).slice().reverse();
  if (!cs.length) out.push('  none');
  for (const x of cs.slice(0, 20)) out.push('  ' + compileLine(x, now));
  return out.join('\n');
}
