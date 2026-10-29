// What is in the ground, and what the base knows about it (PLAN M3, §0.10). PURE.
//
// OUTCROPS are cells: the map generator puts rock outcrops of ore on the surface and each ore cell's `amt` byte holds
// lumps of `unitsPerAmt` units, so an outcrop's total IS the sum of its cells (drawn == measured). Only surface
// outcrops can be known at the start, and only the ones the scope has seen: an outcrop is `known` once the fog over
// its middle has been anything but "never seen".
//
// SHALLOW DEPOSITS are records, not cells (§3.1): `{ id, res, layer, cx, cy, r, amt, known }` entities of kind
// `deposit`, laid down from the seed when the sim starts and invisible until a SURVEY THUMPER's pulse ring reaches
// their middle. A thumper pulses every `survey.every` ticks (slower when power is short).

import { hash2 } from '../rng.js';

export function createSurvey(sim) {
  const { g, M, meta } = sim.world;
  const D = sim.data;
  const outcrops = meta.outcrops.map((o) => ({ id: o.id, res: oreRes(o.res), x: o.x, y: o.y, r: o.r, cells: o.cells, known: false, remaining: 0, start: 0, dirty: true, worked: false }));
  function oreRes(r) { return { copper: 'copper_ore', iron: 'iron_ore', coal: 'coal', stone: 'stone', silica: 'sand', crystal: 'crystal' }[r] || r; }
  const matsOf = {};
  for (const [res, src] of Object.entries(D.sources)) matsOf[res] = new Set(src.mats.map((id) => M.id[id]));
  matsOf.crystal = new Set([M.id.crystal]);

  /** Recount an outcrop from its cells: units = Σ amt × unitsPerAmt over its ore cells. */
  function count(o) {
    const R = Math.ceil(o.r * 1.5) + 1, mats = matsOf[o.res];
    let units = 0;
    for (let y = o.y - R; y <= o.y + R; y++) for (let x = o.x - R; x <= o.x + R; x++) {
      if (!g.inside(x, y)) continue;
      const c = g.cells[g.idx(x, y)];
      if (mats.has(c & 255)) units += ((c >>> 16) & 255) * D.unitsPerAmt;
    }
    return units;
  }
  for (const o of outcrops) { o.remaining = count(o); o.start = o.remaining; o.dirty = false; }

  /** The outcrop whose area holds cell (x, y), if any. */
  function outcropAt(x, y) {
    for (const o of outcrops) { const R = Math.ceil(o.r * 1.5) + 1; if (Math.abs(x - o.x) <= R && Math.abs(y - o.y) <= R) return o; }
    return null;
  }

  // ---- shallow deposits, laid down once from the seed
  const rng = sim.rng.split('deposits');
  const dep = D.deposits;
  const area = (g.W * g.H) / (1536 * 1536);
  const hq = meta.hq;
  const waterNear = (x, y, r) => {
    for (let k = 0; k < 16; k++) {
      const a = (k * 64) & 1023;
      const dx = Math.round((sim.trig.cos(a) * r) / 65536), dy = Math.round((sim.trig.sin(a) * r) / 65536);
      const xx = x + dx, yy = y + dy;
      if (!g.inside(xx, yy)) return true;
      const m = g.cells[g.idx(xx, yy)] & 255;
      if (M.water[m] || M.hot[m]) return true;
    }
    return false;
  };
  for (const [res, n0] of Object.entries(dep.shallow)) {
    const n = Math.max(1, Math.round(n0 * area));
    for (let c = 0; c < n; c++) {
      for (let t = 0; t < 300; t++) {
        const r = rng.range(dep.r[0], dep.r[1]);
        const x = rng.range(r + 8, g.W - r - 9), y = rng.range(r + 8, g.H - r - 9);
        const dh = Math.sqrt((x - hq.x) * (x - hq.x) + (y - hq.y) * (y - hq.y));
        if (dh < dep.minHqDist + r) continue;
        const cc = g.cells[g.idx(x, y)];
        if (!M.walk[cc & 255] || M.water[cc & 255] || (cc & (1 << 30))) continue;
        if (waterNear(x, y, r + dep.waterGap)) continue;
        if (sim.ents.list('deposit').some((d) => Math.sqrt((d.cx - x) * (d.cx - x) + (d.cy - y) * (d.cy - y)) < d.r + r + 12)) continue;
        sim.ents.add('deposit', { type: 'deposit', res, layer: 'shallow', cx: x, cy: y, r, amt: rng.range(dep.amt[0], dep.amt[1]), known: false, x: x * 256, y: y * 256, team: 0 });
        break;
      }
    }
  }

  function depositUnder(x, y, res) {
    for (const d of sim.ents.list('deposit')) {
      if (!d.known || d.amt <= 0 || (res && d.res !== res)) continue;
      const dx = x - d.cx, dy = y - d.cy;
      if (dx * dx + dy * dy <= d.r * d.r) return d;
    }
    return null;
  }

  /** Mark outcrops known when the fog over them has been seen. Called after each fog update. */
  function learn() {
    for (const o of outcrops) {
      if (o.known) continue;
      if (g.fog[g.qIdx(o.x, o.y)] !== 0) {
        o.known = true;
        sim.surveyVer++;
        sim.events.push({ e: 'deposit', tick: sim.tick, base: sim.base, id: o.id, res: o.res, layer: 'surface', x: o.x, y: o.y, amt: o.remaining });
      }
    }
  }

  /** Recount outcrops a camp has dug from (cheap, a few at a time), and say when one is worked out. */
  function recount() {
    for (const o of outcrops) {
      if (!o.dirty) continue;
      o.dirty = false;
      const was = o.remaining;
      o.remaining = count(o);
      if (o.remaining !== was) sim.surveyVer++;
      if (was > 0 && o.remaining === 0) sim.events.push({ e: 'depleted', tick: sim.tick, base: sim.base, id: o.id, res: o.res, x: o.x, y: o.y, what: 'outcrop' });
    }
  }

  /** Thumpers: count down and pulse. */
  function step() {
    for (const b of sim.ents.list('building')) {
      const def = D.B[b.type];
      if (!def.survey || b.built < 1) continue;
      const f = def.power?.draw ? sim.power.factor : 1;
      b.pulseIn -= f;
      if (b.pulseIn > 0) continue;
      b.pulseIn += def.survey.every;
      const x = b.fp.cx, y = b.fp.cy, r = def.survey.r;
      sim.events.push({ e: 'pulse', tick: sim.tick, base: sim.base, id: b.id, x: Math.round(x), y: Math.round(y), r });
      for (const d of sim.ents.list('deposit')) {
        if (d.known || d.layer !== def.survey.layer) continue;
        const dx = d.cx - x, dy = d.cy - y;
        if (dx * dx + dy * dy <= r * r) {
          d.known = true;
          sim.surveyVer++;
          sim.events.push({ e: 'deposit', tick: sim.tick, base: sim.base, id: d.id, res: d.res, layer: d.layer, x: d.cx, y: d.cy, r: d.r, amt: d.amt });
        }
      }
    }
  }

  /** What the ORE chart shows: known outcrops and known deposits, with what is left in each. */
  function known() {
    return {
      outcrops: outcrops.filter((o) => o.known).map((o) => ({ id: o.id, res: o.res, x: o.x, y: o.y, r: o.r, remaining: o.remaining, start: o.start })),
      deposits: sim.ents.list('deposit').filter((d) => d.known).map((d) => ({ id: d.id, res: d.res, layer: d.layer, x: d.cx, y: d.cy, r: d.r, amt: d.amt })),
    };
  }

  return { outcrops, count, outcropAt, depositUnder, learn, recount, step, known, matsOf, salt: hash2 };
}
