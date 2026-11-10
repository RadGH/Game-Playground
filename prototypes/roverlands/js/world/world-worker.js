// Builds a world off the page's main thread (a module worker), so the load screen keeps moving while Wayfare County's
// 2.4 M height samples are made. The generator is the same pure code the page and the tests call directly
// (worldgen.js), so the same seed + map gives the same world bit for bit.
//
//   in:  { id, opts: { seed, map, vehicles } }
//   out: { id, progress, label }  ...then  { id, world }  (the world without its functions; the big typed arrays are
//        transferred, not copied)   or  { id, error }
// The page side is world-async.js: generateWorldAsync() puts the accessors (heightAt, waterAt ...) back on.
import { generateWorldSteps } from './worldgen.js';

self.onmessage = (e) => {
  const { id, opts } = e.data || {};
  try {
    let world = null, lastPost = 0;
    for (const step of generateWorldSteps(opts || {})) {
      if (step.world) world = step.world;
      else if (step.progress - lastPost >= 0.04 || step.progress >= 1) { lastPost = step.progress; self.postMessage({ id, progress: step.progress, label: step.label }); }
    }
    const data = {}, transfer = [];
    for (const k of Object.keys(world)) {
      const v = world[k];
      if (typeof v === 'function') continue;
      data[k] = v;
      if (ArrayBuffer.isView(v) && v.byteOffset === 0 && v.byteLength === v.buffer.byteLength && !transfer.includes(v.buffer)) transfer.push(v.buffer);
    }
    self.postMessage({ id, world: data }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err?.stack || err) });
  }
};
