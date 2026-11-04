// The sim worker: owns the simulation (js/sim/sim.js) and runs it at 20 ticks a second times the
// speed. The page only draws and sends orders.
//
// Messages in:
//   { t: 'init', settings, materials }  → { t: 'ready', macro }
//   { t: 'chunks', want: [[cx, cy], ...] } → { t: 'chunks', list }      (first time the page sees a chunk)
//   { t: 'view', rect: { x0, y0, x1, y1 } }   the chunk rect on screen: full-rate physics there
//   { t: 'speed', speed }                      0 = paused, 1, 2, 4, 8
//   { t: 'order', order }                      anything the player does (sim.order)
// Messages out, about 10 a second:
//   { t: 'tick', clock: { tick, daylight, tod, wind, speed, ms }, list }  list = chunks the page holds that changed
// Arrays are COPIED into replies and transferred, so the worker's chunks stay authoritative.

import { generateMacro } from '../planet/macro.js';
import { LAYERS } from '../planet/chunkgen.js';
import { compileMaterials } from '../sim/materials.js';
import { createSim, TICKS_PER_SEC } from '../sim/sim.js';
import { addSystems, viewOf } from '../sim/world-systems.js';
import { saveSim, loadInto } from '../sim/save.js';
import { blankChunk } from '../planet/chunkgen.js';

let attackFlag = false, fightFlag = false;
let sim = null, speed = 1, timer = null, lastSend = 0, tickMs = 0, settings = null, viewCells = null;
const said = [];
const sounds = [];
const pageHas = new Map();     // chunk key → version the page last got

function payload(c, transfer) {
  const p = { cx: c.cx, cy: c.cy, version: c.version };
  for (const k of LAYERS) { p[k] = c[k].slice(); transfer.push(p[k].buffer); }
  pageHas.set(c.cx + c.cy * sim.chunksX, c.version);
  return p;
}

function loop() {
  if (!sim) return;
  const t0 = performance.now();
  // a 50 ms frame of sim time; at 8x that is 8 ticks, stopped early if it ever costs > 40 ms
  for (let k = 0; k < speed; k++) { sim.step(); if (performance.now() - t0 > 40) break; }
  tickMs = tickMs * 0.9 + (performance.now() - t0) * 0.1;
  for (const e of sim.events) {
    if (e.t === 'say') said.push({ text: e.text, kind: e.kind, x: e.x, y: e.y });
    else if (e.t === 'built') said.push({ built: e.kind, x: e.x, y: e.y });
    else if (e.t === 'warn') said.push({ warn: true, text: e.text, x: e.x, y: e.y, eta: e.eta });
    else if (e.t === 'attack') attackFlag = true;
    else if (e.t === 'underAttack') fightFlag = true;
    else if (e.t === 'defeated') said.push({ defeated: true, name: e.name });
    else if (e.t === 'milestone') said.push({ milestone: true, pop: e.pop, title: e.title, gold: e.gold, landmark: e.landmark });
    else if (e.t === 'achieve') said.push({ achieve: e.id, name: e.name, text: e.text });
    else if (e.t === 'fire') { if (sounds.length < 40) sounds.push(['fire', e.c.cx * 64 + (e.i % 64), e.c.cy * 64 + ((e.i / 64) | 0)]); }
    else if (e.t === 'collapse' || e.t === 'enemyDown' || e.t === 'guardDown' || e.t === 'power') { if (sounds.length < 40) sounds.push([e.t, e.x, e.y]); }
    else if (e.t === 'node') sounds.push(['node']);
  }
  sim.events.length = 0;
  const now = performance.now();
  if (now - lastSend < 95) return;
  lastSend = now;
  const list = [], transfer = [];
  for (const [key, v] of pageHas) {
    const c = sim.store.peek(key % sim.chunksX, Math.floor(key / sim.chunksX));
    if (!c) { pageHas.delete(key); continue; }
    if (c.version !== v) { c.dirty = false; list.push(payload(c, transfer)); }
  }
  const town = viewOf(sim, viewCells);
  self.postMessage({ t: 'tick', clock: { tick: sim.tick, daylight: sim.daylight(), tod: sim.timeOfDay(), wind: sim.wind, speed, ms: tickMs }, list, town, said: said.splice(0), attack: attackFlag, fighting: fightFlag, sounds: sounds.splice(0) }, transfer);
  attackFlag = false; fightFlag = false;
}

self.onmessage = e => {
  const m = e.data;
  try {
    if (m.t === 'init') {
      const M = compileMaterials(m.materials);
      const t0 = performance.now();
      const macro = generateMacro(m.settings);
      sim = createSim({ macro, M, seed: m.settings.seed });
      settings = m.settings;
      sim.settings = m.settings;
      if (m.save) loadInto(sim, m.save, blankChunk);
      if (m.buildings) addSystems(sim, m.buildings);
      const out = {
        seed: macro.seed, width: macro.width, height: macro.height, macroCell: macro.macroCell, mw: macro.mw, mh: macro.mh,
        sea: macro.sea, top: macro.top, iceRows: macro.iceRows,
        elev: macro.elev.slice(), biome: macro.biome.slice(), river: macro.river.slice(), site: macro.site.slice(),
        ms: performance.now() - t0,
      };
      self.postMessage({ t: 'ready', macro: out }, [out.elev.buffer, out.biome.buffer, out.river.buffer, out.site.buffer]);
      clearInterval(timer);
      if (!m.idle) timer = setInterval(loop, 1000 / TICKS_PER_SEC);
    } else if (m.t === 'chunks') {
      const list = [], transfer = [];
      for (const [cx, cy] of m.want) { const c = sim.getChunk(cx, cy); if (c) list.push(payload(c, transfer)); }
      self.postMessage({ t: 'chunks', list }, transfer);
    } else if (m.t === 'forget') {
      for (const key of m.keys) pageHas.delete(key);
    } else if (m.t === 'view') {
      sim.setFocus([m.rect]);
      viewCells = m.cells || null;
    } else if (m.t === 'speed') {
      speed = m.speed;
    } else if (m.t === 'order') {
      const r = sim.order(m.order);
      // plain fields only (an order may hand back a live building; the page needs its id, place, error…)
      const plain = r && typeof r === 'object' ? Object.fromEntries(Object.entries(r).filter(([, v]) => v == null || typeof v !== 'object' || Array.isArray(v) && v.length < 50)) : r;
      if (m.reply) self.postMessage({ t: 'reply', id: m.reply, result: plain });
    } else if (m.t === 'ask') {
      let result = null;
      if (m.q === 'building') result = sim.town?.buildingAt(m.x, m.y) ?? null;
      if (m.q === 'save') result = saveSim(sim, settings);
      if (m.q === 'wall') { const w = sim.walls?.wallAt(m.x, m.y); result = w ? { id: w.id, tier: w.tier, n: w.cells.length, towers: w.towers.length, gates: w.gates.length } : null; }
      if (m.q === 'fits') result = sim.town?.fits(m.x, m.y, m.w, m.h, { margin: 0 }) ?? false;
      self.postMessage({ t: 'reply', id: m.reply, result });
    }
  } catch (err) {
    self.postMessage({ t: 'error', message: String(err && err.stack || err) });
  }
};
