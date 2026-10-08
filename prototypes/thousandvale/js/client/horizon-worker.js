// The far horizon's worker (stream D): fetches and inflates data/world/horizon.bin (~80-150 ms of work) and builds
// chunk meshes as typed arrays, all off the main thread. horizon.js talks to it:
//   -> { type: 'load', url }                      <- { type: 'ready', meta, W, H, step, drawn }   (drawn copied once, for heightAt)
//   -> { type: 'chunk', id, ci, cj, chunk, stride, holes } <- { type: 'chunk', id, ...buildChunk() }    (arrays transferred)
//   <- { type: 'error', message }
import { prepareGrid, buildChunk, buildCanopy } from './horizon-grid.js';

let grid = null;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      const r = await fetch(data.url);
      if (!r.ok) throw new Error('horizon.bin ' + r.status);
      grid = prepareGrid(await r.arrayBuffer());
      const { meta, W, H, step } = grid;
      self.postMessage({ type: 'ready', meta, W, H, step, drawn: grid.drawn.slice(), wet: grid.wet.slice() });
    } else if (data.type === 'canopy') {
      // W18: tree spires for the part of a chunk that lies under loaded zones (bare mountain slopes in the real terrain)
      if (!grid) throw new Error('horizon: canopy asked before load');
      const c = buildCanopy(grid, data.ci, data.cj, data.chunk, data.holes, data.opts || null);
      if (!c) self.postMessage({ type: 'chunk', id: data.id, empty: true });
      else self.postMessage({ type: 'chunk', id: data.id, ...c }, [c.pos.buffer, c.nor.buffer, c.col.buffer, c.idx.buffer]);
    } else if (data.type === 'chunk') {
      if (!grid) throw new Error('horizon: chunk asked before load');
      const c = buildChunk(grid, data.ci, data.cj, data.chunk, data.stride, data.holes, data.opts || null);      // opts: W18 tree cover { trees, spires }
      self.postMessage({ type: 'chunk', id: data.id, ...c }, [c.pos.buffer, c.nor.buffer, c.col.buffer, c.idx.buffer]);
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: data.id, message: e.message || String(e) });
  }
};
