// World Build — the page's Web Worker: runs the pipeline off the page's thread, sends each stage's picture as it is
// made, then keeps the world and hands the 3D fly view what it asks for, piece by piece (ground chunks, a tile's trees,
// a town, the bridges) — the way a game server would stream a big map.
//
// Messages in:  { type: 'build', brief, seed, mpp, edits }   { type: 'pick', x, z }   { type: 'chunk', key, x0, z0, size, step }
//               { type: 'tile', key, tx, tz }   { type: 'town', id }   { type: 'bridges', box }   { type: 'overview', step }
// Messages out: { type: 'stage', id, ms, pic }   { type: 'done', … }   { type: 'error', message }   and a reply per ask

import { runPipeline } from './pipeline.js';
import { stagePicture } from './preview.js';
import { toMapJson, toTownsJson } from './export.js';
import { pick, chunk, tile, town, bridges, LAYERS, SPECIES } from './serve.js';

const ROOT = new URL('../../', import.meta.url);
const read = async p => (await fetch(new URL(p, ROOT))).json();
let W = null;

let rid = 0;
const post = (msg, transfer = [], r = rid) => self.postMessage({ ...msg, rid: r }, transfer);

self.onmessage = async e => {
  const m = e.data;
  rid = m.rid ?? 0;
  try {
    if (m.type === 'build') return await build(m);
    if (!W) throw new Error('no world yet');
    if (m.type === 'pick') return post({ type: 'pick', ...pick(W, m.x, m.z) });
    if (m.type === 'chunk') { const c = chunk(W, m); return post({ type: 'chunk', key: m.key, ...c }, [c.heights.buffer, c.water.buffer, c.paint.buffer]); }
    if (m.type === 'tile') { const t = tile(W, m.tx, m.tz); return post({ type: 'tile', key: m.key, ...t }, [t.trees.buffer, t.rocks.buffer]); }
    if (m.type === 'town') return post({ type: 'town', id: m.id, ...town(W, m.id) });
    if (m.type === 'bridges') return post({ type: 'bridges', key: m.key, ...bridges(W, m.box) });
    if (m.type === 'export') return post({ type: 'export', map: toMapJson(W), towns: toTownsJson(W) });
  } catch (err) {
    post({ type: 'error', ask: m.type, key: m.key, message: err.message, stack: String(err.stack || '').split('\n').slice(0, 4).join('\n') });
  }
};

async function build({ brief, seed, mpp = 4, edits = null }) {
  W = null;
  const myRid = rid;   // (other asks may arrive while the build awaits)
  const t0 = performance.now();
  const world = await runPipeline(brief, {
    read, seed, edits,
    onStage: (id, ms, w) => {
      if (id === 'edits') return;
      // the brief's picture needs only the brief; the checks picture is sent at the end (it shows the report)
      if (id === 'checks') return;
      const pic = stagePicture(id === 'brief' ? { brief: w.brief, pin: w.pin, bounds: { ...w.brief.size.bounds } } : w, id, { mpp });
      post({ type: 'stage', id, ms, pic }, [pic.rgba.buffer], myRid);
    },
  });
  W = world;
  const pic = stagePicture(W, 'checks', { mpp });
  post({ type: 'stage', id: 'checks', ms: W.stages.find(s => s.id === 'checks').ms, pic }, [pic.rgba.buffer], myRid);
  const places = Object.values(W.places).filter(p => p.kind !== 'pass').map(p => ({ id: p.id, name: p.name, kind: p.kind, type: p.type, region: p.region, at: p.at, levels: p.levels, pinned: !!p.pinned, y: p.y }));
  post({
    type: 'done', ms: Math.round(performance.now() - t0), stages: W.stages, report: { ok: W.report.ok, checks: W.report.checks, leftovers: W.report.leftovers, edits: W.report.edits },
    numbers: W.numbers, fingerprint: W.fingerprint, places, bounds: W.bounds, seed: W.seed, briefId: W.brief.id, briefName: W.brief.name,
    regions: W.regionList.map(r => ({ id: r.id, name: r.name, levels: r.levels, theme: r.theme, pinned: !!r.pinned })),
    towns: W.placeOrder.filter(id => W.places[id].kind === 'town').concat(W.pinTownPlan ? Object.keys(W.pin.data.towns).filter(k => !k.startsWith('_') && k !== 'idles') : []),
    sea: W.brief.sea.edges, layers: LAYERS, species: SPECIES, start: W.startAt, startMoved: W.startMoved || null, unplaced: W.unplaced,
    townsAt: Object.fromEntries(Object.values(W.places).filter(p => p.kind === 'town').map(p => [p.id, p.at])),
  }, [], myRid);
}


// (a module worker takes messages before its imports have finished loading — Oathwild's tree species file is
// fetched at load — so the page waits for this before it asks anything; an early message would be lost)
self.postMessage({ type: 'ready' });
