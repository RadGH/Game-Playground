// The console's one line to the world (PLAN §1.2) and the picture behind the glass. Since M3 the world is the real
// sim in its worker (js/worker/sim-worker.js → js/sim/index.js) and the picture is M1's WebGL scope; the stand-in
// world M2 was built against is gone.
//
// createWorldLink — send(cmd) / setRate(tps) / setView(rect) / pump() → merged frame / step(n) / tick / size / data.
//   A frame: { tick, base, size, m1: { chunks, gas, debris, events }, fields?: { fog, gas, light, qw, qh },
//              hud?, events, buildings?: [records], gone?: [ids], movers?: Float32Array, vectors?, vectorsGone?,
//              survey? }. The fog arrives from the sim (§3.1 `fog` field); the page never works it out.
// createWorldRenderer — wraps js/render/scope.js (createScope) in the interface the Tactical Scope uses
//   (ingest / resize / render / fogAt / gasAt / lightAt / cellAt / pixelAt / roadAt).

export async function createWorldLink({ seed, mapSize = 'normal', difficulty = 'standard' }) {
  const worker = new Worker(new URL('../worker/sim-worker.js', import.meta.url), { type: 'module' });
  const base = new URL('../../', import.meta.url).href;
  const ready = await new Promise((resolve, reject) => {
    worker.onmessage = (e) => { if (e.data?.type === 'ready') resolve(e.data); };
    worker.onerror = (e) => reject(new Error(e.message || 'the world could not start'));
    worker.postMessage({ type: 'init', base, seed, size: mapSize, difficulty });
  });
  const W = ready.W, H = ready.H, QW = W >> 2, QH = H >> 2, CW = W >> 6;
  const meta = ready.meta;
  const frames = [];
  worker.onmessage = (e) => { if (e.data?.type === 'frame') frames.push(e.data); };
  const gas = new Uint8Array(QW * QH);
  let tick = 0, rate = 20, first = true, local = [], lastView = '';
  let hud = null;
  const link = {
    kind: 'sim', materials: ready.materials, size: [W, H], data: ready.data, meta,
    debug: { map: { hq: meta.hq, outcrops: meta.outcrops || [], fire: null, lava: meta.lava, lake: meta.lakes } },
    get hud() { return hud; },
    send(cmd) {
      if (cmd.t === 'debug.hour') cmd = { t: 'dev.hour', hour: cmd.hour };
      else if (cmd.t === 'debug.smoke') cmd = { t: 'dev.smoke', x: cmd.x, y: cmd.y, r: 12 };
      else if (cmd.t === 'debug.event') { local.push({ ...cmd.event, tick, base: 'home' }); return; }
      worker.postMessage({ type: 'cmd', cmd: { base: 'home', ...cmd } });
    },
    close() { worker.terminate(); },
    /** Run n ticks at once (tests and the eye's fast-forward). */
    step(n) { worker.postMessage({ type: 'step', n }); },
    setRate(tps) { rate = tps; worker.postMessage({ type: 'rate', tps }); },
    get rate() { return rate; }, get tick() { return tick; },
    setView(r) { const k = [r[0] | 0, r[1] | 0, r[2] | 0, r[3] | 0].join(','); if (k === lastView) return; lastView = k; worker.postMessage({ type: 'view', x0: r[0], y0: r[1], x1: r[2], y1: r[3] }); },
    pump() {
      const got = frames.splice(0);
      if (!got.length && !first && !local.length) return null;
      first = false;
      const m1 = { chunks: [], gas: [], debris: null, events: [] };
      const frame = { tick, base: 'home', size: [W, H], m1, events: local.splice(0), buildings: null, gone: [], vectors: null, vectorsGone: [] };
      for (const f of got) {
        tick = f.tick;
        m1.chunks.push(...f.chunks); m1.gas.push(...f.gas);
        if (f.debris) m1.debris = f.debris;
        m1.events.push(...(f.events || []));
        frame.events.push(...(f.events || []));
        for (let k = 0; k < f.gas.length; k += 2) {
          const ci = f.gas[k], d = new Uint8Array(f.gas[k + 1]), qx = (ci % CW) << 4, qy = ((ci / CW) | 0) << 4;
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) gas[(qy + y) * QW + qx + x] = d[(y * 16 + x) * 2];
        }
        if (f.fields) frame.fields = { qw: QW, qh: QH, fog: new Uint8Array(f.fields.fog), light: f.fields.light ? new Uint8Array(f.fields.light) : null, gas, ver: f.fields.ver };
        if (f.hud) { frame.hud = f.hud; hud = f.hud; }
        if (f.movers) frame.movers = new Float32Array(f.movers);
        if (f.ents) { frame.buildings = (frame.buildings || []).concat(f.ents); frame.gone.push(...f.gone); }
        if (f.vectors) { frame.vectors = (frame.vectors || []).concat(f.vectors); frame.vectorsGone.push(...f.vectorsGone); }
        if (f.survey) frame.survey = f.survey;
        if (f.foes) frame.foes = new Float32Array(f.foes);          // M4: enemies on live sight
        if (f.defence) frame.defence = f.defence;                  // M4: seen nests, raids + predicted paths, towers
        if (f.threat) frame.threat = { qw: f.threat.qw, qh: f.threat.qh, noise: new Uint8Array(f.threat.noise), glow: new Uint8Array(f.threat.glow) };
      }
      frame.tick = tick;
      if (!frame.fields && got.some((f) => f.gas.length)) frame.fields = { qw: QW, qh: QH, gas };
      return frame;
    },
  };
  return link;
}

export async function createWorldRenderer({ canvas, materials, size, data }) {
  const { createScope } = await import('../render/scope.js');
  const { createFoePainter } = await import('../render/foes.js'); // M4
  const s = createScope(canvas, { materials });
  s.setWorld(size[0], size[1]);
  s.opts.fog = true;
  if (data?.resources) s.setResourceColours(data.resources.list);
  if (data?.buildings?.vectors?.road) s.opts.roadW = data.buildings.vectors.road.width;
  if (data?.buildings?.vectors?.wall) s.opts.wallW = data.buildings.vectors.wall.width;
  const foes = createFoePainter(); s.addPainter(foes.paint); // M4: enemies, shots, splats
  let fog = null, gasF = null, lightF = null;
  const qn = size[0] >> 2;
  return {
    kind: 'webgl', canvas, dirty: true, scope: s, get size() { return size[0]; },
    ingest(frame) {
      const m = frame.m1;
      if (m) {
        for (let k = 0; k < m.chunks.length; k += 2) s.putChunk(m.chunks[k], new Uint32Array(m.chunks[k + 1]));
        for (let k = 0; k < m.gas.length; k += 2) s.putGas(m.gas[k], new Uint8Array(m.gas[k + 1]));
        if (m.debris) s.setDebris(new Float32Array(m.debris), performance.now());
        const now = performance.now(); for (const ev of m.events) { s.event(ev, now); foes.event(ev, now); }
      }
      if (frame.fields?.fog) { fog = frame.fields.fog; s.putFog(fog); }
      if (frame.fields?.gas) gasF = frame.fields.gas;
      if (frame.fields?.light) lightF = frame.fields.light;
      if (frame.vectors || frame.vectorsGone?.length) {
        s.putRoads((frame.vectors || []).filter((v) => v.kind === 'road'), frame.vectorsGone || []);
        s.putWalls((frame.vectors || []).filter((v) => v.kind === 'wall'), frame.vectorsGone || []); // M4
      }
      if (frame.foes) foes.setFoes(frame.foes, performance.now());
      if (frame.defence) { s.opts.wallLv = frame.defence.wallLevel || 1; const t = frame.defence.wallTrim; if (t) s.opts.wallTrim = [1, 3, 5].map((i) => parseInt(t.slice(i, i + 2), 16) / 255); }
      if (frame.movers) s.setMovers(frame.movers, performance.now());
      if (frame.hud) { s.opts.time = frame.hud.hour / 24; s.opts.roadLv = frame.hud.levels?.road || 1; }
    },
    resize() { /* the WebGL scope sizes itself from the canvas every frame */ },
    render({ view, t, filter }) {
      s.view.cx = view.cx; s.view.cy = view.cy; s.view.zoom = view.ppc;
      s.opts.filter = { sight: 0, ore: 1, flow: 2, threat: 3 }[filter] ?? 0;
      s.render(t);
      return true;
    },
    fogAt: (x, y) => fog ? fog[(y >> 2) * qn + (x >> 2)] : 0,
    gasAt: (x, y) => gasF ? gasF[(y >> 2) * qn + (x >> 2)] : 0,
    lightAt: (x, y) => lightF ? lightF[(y >> 2) * qn + (x >> 2)] : 0,
    cellAt: (x, y) => s.cellAt(x, y),
    roadAt: (x, y) => s.roadAt(x, y),
    wallAt: (x, y) => s.wallAt(x, y), foesNow: () => foes.now(), // M4
    moversNow: () => s.moversNow(),
    pixelAt: (sx, sy) => s.readAt([[sx, sy]])[0],
    setQuality(q) { s.opts.quality = q; }, setCrt(v) { s.opts.crt = v; },
  };
}
