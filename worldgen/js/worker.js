// Generation worker: keeps the page responsive while a world is being built.
//
//   const worker = new Worker('js/worker.js', { type: 'module' });
//   worker.postMessage({ type: 'generate', id, opts });
//   worker.onmessage = e => e.data.type === 'progress' ? … : e.data.world;
//
// Name Forge is loaded here once and reused, so region and town names come from the same language
// data the rest of the playground uses.

import { generateWorld } from './world.js';
import { generateRegionDetail, generateLocalDetail } from './local.js';

let namegen = null;
let namegenTried = false;
let world = null;

async function getNamegen() {
  if (namegen || namegenTried) return namegen;
  namegenTried = true;
  try {
    const { NameGen } = await import('../../namegen/js/namegen.js');
    namegen = await NameGen.load('../../namegen/data/');
  } catch (err) {
    namegen = null;          // the built-in fallback namer takes over
    self.postMessage({ type: 'warn', message: 'Name Forge data not available, using the built-in namer (' + err.message + ')' });
  }
  return namegen;
}

/** Strip the working-only layers and the namer before the world crosses back to the page. */
function forPosting(w) {
  const out = { ...w };
  delete out._namer; delete out.filled; delete out.down;
  return out;
}

self.onmessage = async e => {
  const msg = e.data || {};
  try {
    if (msg.type === 'generate') {
      const gen = await getNamegen();
      const t0 = Date.now();
      world = generateWorld({
        ...msg.opts,
        namegen: gen,
        onProgress: (f, label) => self.postMessage({ type: 'progress', id: msg.id, fraction: f, label }),
      });
      self.postMessage({ type: 'world', id: msg.id, world: forPosting(world), ms: Date.now() - t0 });
    } else if (msg.type === 'region') {
      if (!world) throw new Error('no world generated yet');
      const detail = generateRegionDetail(world, msg.regionId, { ...(msg.opts || {}), namegen: await getNamegen() });
      self.postMessage({ type: 'region', id: msg.id, detail });
    } else if (msg.type === 'local') {
      if (!world) throw new Error('no world generated yet');
      const tile = generateLocalDetail(world, msg.x, msg.y, msg.opts || {});
      self.postMessage({ type: 'local', id: msg.id, tile });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err && err.message ? err.message : String(err), stack: err && err.stack });
  }
};
