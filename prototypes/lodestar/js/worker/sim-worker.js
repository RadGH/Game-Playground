// The sim worker (PLAN §1.2). Owns the world; the page only sends commands and draws frames.
//
// In:  { type: 'init', base, seed, size, bare? }     build the map (data fetched from `base`); bare = M1 world only
//      { type: 'view', x0, y0, x1, y1 }              cells on the scope (only these chunks are sent)
//      { type: 'rate', tps }                         0 (pause) / 20 / 40 / 80 ticks a second
//      { type: 'cmd', cmd: { t, ...args } }          world commands (M1: dev.* paint toy commands)
//      { type: 'step', n }                           run n ticks now (tests, paused stepping)
//      { type: 'flush', id }                         send a frame now even when paused (frames echo `ack: id`)
//      { type: 'resend' }                            forget what was sent (render lost its copy)
// Out: { type: 'ready', W, H, meta, materials }
//      { type: 'frame', tick, chunks: [ci, ArrayBuffer]..., gas: [ci, ArrayBuffer]..., debris, events, stats }
//      Every chunk and gas buffer is a fresh copy and is TRANSFERRED (never SharedArrayBuffer).
//
// M3: the worker runs the whole sim (js/sim/index.js createSim) — the HQ, the economy, the fog, the day clock — and
// each frame also carries (only when they changed):
//      fields: { fog: ArrayBuffer (quarter-res, 0/1/2), ver }            the fog of war, worked out in the sim
//      hud:    the needles (day, hour, daylight, sensors, stock, power, crew, unlocked, research)
//      movers: Float32Array [id, x, y, kind, cargoRes, phase] × n          porters, carts, builders (positions in cells)
//      ents:   [building records that changed] + `gone: [ids]`
//      vectors: [road records that changed] (id, pts, laid, len, bridge, spans done) + `gone: [ids]`
//      survey: { outcrops, deposits } (known ones only)
// `init` with `bare: true` (the bench) runs M1's bare world as before.

import { createWorld } from '../world/world.js';
import { createSim } from '../sim/index.js';
import { awakeCount } from '../world/grid.js';
import { gasAwakeCount } from '../world/gas.js';

let world = null, g = null, sim = null;
let sentFog = -1, sentSurvey = -1, lastHud = -999, lastStores = -999;
const MOVER = { porter: 0, cart: 1, builder: 2, migrant: 3 }; // M7: settlers walking in (3)
const FILES = ['materials', 'mapgen', 'resources', 'recipes', 'buildings', 'research', 'vehicles', 'balance', 'mana', 'spells', 'towers', 'enemies', 'nests', 'upgrades', 'radio'];
let sentVer = null, sentGas = null;
let view = { x0: 0, y0: 0, x1: 0, y1: 0 };
let tps = 20;
let acc = 0, last = 0;
let tickTimes = [], maxMs = 0, lastStats = 0;
let pendingEvents = [];
let lastFlush = 0; // echoed in every frame so a caller knows its flush has been seen
const MAX_CHUNKS_PER_FRAME = 96;

async function init(msg) {
  const base = msg.base;
  const t0 = performance.now();
  if (msg.bare) {
    const [materials, mapgen] = await Promise.all([
      fetch(new URL('data/materials.json', base)).then((r) => r.json()),
      fetch(new URL('data/mapgen.json', base)).then((r) => r.json()),
    ]);
    world = createWorld({ materials, mapgen }, { seed: msg.seed, size: msg.size });
  } else {
    const raw = {};
    await Promise.all(FILES.map(async (f) => { raw[f] = await fetch(new URL(`data/${f}.json`, base)).then((r) => r.json()); }));
    sim = createSim(raw, { seed: msg.seed, size: msg.size, difficulty: msg.difficulty }); // M4: difficulty sets raids and what losing the HQ means
    world = sim.world;
  }
  g = world.g;
  sentVer = new Uint32Array(g.nChunks).fill(0xffffffff);
  sentGas = new Uint32Array(g.nChunks).fill(0xffffffff);
  postMessage({ type: 'ready', W: g.W, H: g.H, meta: world.meta, materials: world.M.rules, data: sim ? publicData(sim) : null, genMs: Math.round(performance.now() - t0) });
  last = performance.now();
  setInterval(loop, 8);
}

/** The data the console needs to draw cards and prices (the sim's own copies, so both sides agree). */
function publicData(s) {
  const r = s.data.raw;
  return { resources: r.resources, recipes: r.recipes, buildings: r.buildings, research: r.research, vehicles: r.vehicles, balance: r.balance };
}

function command(cmd) {
  if (cmd.t === 'dev.stress') { stress(cmd); return; }
  if (sim) { sim.send(cmd); return; }
  const w = world;
  switch (cmd.t) {
    case 'dev.paint': w.paint(cmd.x | 0, cmd.y | 0, cmd.r | 0, cmd.mat); break;
    case 'dev.ignite': w.igniteArea(cmd.x | 0, cmd.y | 0, cmd.r ?? 2); break;
    case 'dev.blast': w.blast(cmd.x, cmd.y, cmd.r, cmd.power ?? 1); break;
    case 'dev.frost': w.frost(cmd.x, cmd.y, cmd.r); break;
    case 'dev.lightning': w.lightning(cmd.x, cmd.y); break;
    case 'dev.rain': w.rain(cmd.x, cmd.y, cmd.r, cmd.ticks ?? 400); break;
    case 'dev.rainAll': w.setRain(!!cmd.on); break;
    case 'dev.wind': w.setWind(cmd.dir, cmd.strength); break;
    default: pendingEvents.push({ e: 'refused', cmd: cmd.t, why: 'unknown command' });
  }
}

const stepOnce = () => (sim ? sim.step() : world.step());

/** Bench helper: light fires in n chunks, or set off n blasts at once, around the view. */
function stress(cmd) {
  const cx = ((view.x0 + view.x1) / 2) | 0, cy = ((view.y0 + view.y1) / 2) | 0;
  if (cmd.kind === 'fires') {
    let n = 0;
    const R = Math.ceil(Math.sqrt(cmd.n || 80)) + 2;
    for (let ring = 0; ring <= R && n < (cmd.n || 80); ring++) {
      for (let dy = -ring; dy <= ring && n < (cmd.n || 80); dy++) for (let dx = -ring; dx <= ring && n < (cmd.n || 80); dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = (((cx >> 6) + dx) << 6) + 32, y = (((cy >> 6) + dy) << 6) + 32;
        if (!g.inside(x, y)) continue;
        if (world.igniteArea(x, y, 4) > 0) n++;
      }
    }
  } else if (cmd.kind === 'blasts') {
    for (let k = 0; k < (cmd.n || 50); k++) {
      const a = (k / (cmd.n || 50)) * Math.PI * 2;
      const d = 20 + (k * 37) % 120;
      world.blast(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 8 + (k % 7), 1);
    }
  }
}

function loop() {
  if (!world) return;
  const now = performance.now();
  const dtMs = Math.min(250, now - last);
  last = now;
  let ran = 0;
  if (tps > 0) {
    acc += (dtMs * tps) / 1000;
    const maxRun = Math.max(2, Math.ceil(tps / 15));
    while (acc >= 1 && ran < maxRun) {
      const a = performance.now();
      stepOnce();
      const ms = performance.now() - a;
      tickTimes.push(ms);
      if (ms > maxMs) maxMs = ms;
      acc -= 1; ran++;
    }
    if (acc > 3) acc = 3; // fell behind: drop time rather than spiral
  }
  if (ran || forceFrame) sendFrame();
}
let forceFrame = false;

function sendFrame() {
  forceFrame = false;
  const chunks = [], gasOut = [], transfer = [];
  const cx0 = Math.max(0, Math.floor(view.x0 / 64) - 1), cy0 = Math.max(0, Math.floor(view.y0 / 64) - 1);
  const cx1 = Math.min(g.CW - 1, Math.floor(view.x1 / 64) + 1), cy1 = Math.min(g.CH - 1, Math.floor(view.y1 / 64) + 1);
  let budget = MAX_CHUNKS_PER_FRAME;
  // centre-out order so the middle of the scope fills first
  const mx = (cx0 + cx1) / 2, my = (cy0 + cy1) / 2;
  const order = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) order.push([(cx - mx) ** 2 + (cy - my) ** 2, cy * g.CW + cx]);
  order.sort((a, b) => a[0] - b[0]);
  for (const [, ci] of order) {
    if (g.ver[ci] !== sentVer[ci] && budget > 0) {
      const copy = g.cells.slice(ci << 12, (ci << 12) + 4096);
      chunks.push(ci, copy.buffer);
      transfer.push(copy.buffer);
      sentVer[ci] = g.ver[ci];
      budget--;
    }
    if (g.gasVer[ci] !== sentGas[ci]) {
      const qx = (ci % g.CW) << 4, qy = ((ci / g.CW) | 0) << 4;
      const out = new Uint8Array(512);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const q = (qy + y) * g.QW + qx + x;
        out[(y * 16 + x) * 2] = g.gasDensity[q];
        out[(y * 16 + x) * 2 + 1] = g.gasKind[q];
      }
      gasOut.push(ci, out.buffer);
      transfer.push(out.buffer);
      sentGas[ci] = g.gasVer[ci];
    }
  }
  if (budget === 0) forceFrame = true; // more to send next loop
  const debris = world.debris.pack();
  transfer.push(debris.buffer);
  const events = pendingEvents.concat(sim ? sim.drainEvents() : world.drainEvents());
  pendingEvents = [];
  for (const ev of events) if (ev.flood) transfer.push(ev.flood.buffer);
  let stats = null;
  const now = performance.now();
  if (now - lastStats > 500 && tickTimes.length) {
    const s = [...tickTimes].sort((a, b) => a - b);
    stats = {
      ticks: s.length, median: +s[s.length >> 1].toFixed(3), mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(3), max: +maxMs.toFixed(3),
      awake: awakeCount(g), gasAwake: gasAwakeCount(g), debris: world.debris.alive, burning: world.fire.burning,
      landingsPerSecond: world.debris.stats.maxLandingsPerSecond, refused: world.debris.stats.refused,
    };
    tickTimes = []; maxMs = 0; lastStats = now;
  }
  const msg = { type: 'frame', tick: world.tick, ack: lastFlush, chunks, gas: gasOut, debris: debris.buffer, events, stats };
  if (sim) simParts(msg, transfer);
  postMessage(msg, transfer);
}

/** The economy's share of a frame (only what changed). */
function simParts(msg, transfer) {
  if (sim.fogVer !== sentFog) {
    sentFog = sim.fogVer;
    const f = g.fog.slice(), l = g.light.slice();
    msg.fields = { qw: g.QW, qh: g.QH, fog: f.buffer, light: l.buffer, ver: sim.fogVer };
    transfer.push(f.buffer, l.buffer);
  }
  if (sim.tick - lastHud >= 5 || msg.fields) { lastHud = sim.tick; msg.hud = sim.hud(); }
  const ms = [...sim.ents.list('vehicle'), ...sim.ents.list('worker'), ...sim.ents.list('migrant')];
  const mv = new Float32Array(ms.length * 6);
  ms.forEach((e, i) => {
    const o = i * 6, cargo = Object.keys(e.cargo || {})[0];
    mv[o] = e.id; mv[o + 1] = e.x / 256; mv[o + 2] = e.y / 256; mv[o + 3] = MOVER[e.type] ?? 0;
    // (M7: a settler group carries its head count in the cargo slot)
    mv[o + 4] = e.kind === 'migrant' ? e.n : cargo ? sim.data.resIndex[cargo] + 1 : 0; mv[o + 5] = e.route ? 1 : e.phase === 'lay' || e.phase === 'work' ? 2 : 0;
  });
  msg.movers = mv.buffer; transfer.push(mv.buffer);
  // stores change all the time without anything marking the building: re-send the ones with a store twice a second
  if (sim.tick - lastStores >= 10) { lastStores = sim.tick; for (const b of sim.ents.list('building')) if (b.store) sim.dirty.add(b.id); }
  if (sim.dirty.size) {
    const ents = [], gone = [];
    for (const id of sim.dirty) {
      const e = sim.ents.get(id);
      if (!e) { gone.push(id); continue; }
      if (e.kind !== 'building' && e.kind !== 'pile') continue;
      ents.push(publicBuilding(e));
    }
    sim.dirty.clear();
    msg.ents = ents; msg.gone = gone;
  }
  if (sim.vectorsDirty.size) {
    const vs = [], gone = [];
    for (const id of sim.vectorsDirty) {
      const wall = sim.defence?.walls.get(id); // M4
      if (wall) { vs.push(sim.defence.walls.publicRecord(wall)); continue; }
      const v = sim.roads.get(id);
      if (!v) { gone.push(id); continue; }
      vs.push({ id: v.id, kind: v.kind, pts: v.pts, laid: v.laid, len: v.len, bridge: v.bridge, spans: v.spans.map((s) => [s.a, s.b, s.done ? 1 : 0, s.builder ? 1 : 0]) });
    }
    sim.vectorsDirty.clear();
    msg.vectors = vs; msg.vectorsGone = gone;
  }
  if (sim.surveyVer !== sentSurvey) { sentSurvey = sim.surveyVer; msg.survey = sim.survey.known(); }
  if (sim.defence) defenceParts(msg, transfer); // M4
}

/** M4: the enemies the scope can see, the defence picture (seen nests, raids with their predicted paths, towers) and
 *  the Noise / Glow fields for the THREAT filter. Only what is on LIVE sight is sent as an enemy (fog 2). */
let lastDefence = -999, sentThreat = -1;
const FOE = { skitter: 0, gnasher: 1, spitter: 2, carapace: 3 };
function defenceParts(msg, transfer) {
  const D = sim.defence, en = sim.ents.list('enemy');
  const live = [];
  for (const e of en) { const x = e.x / 256, y = e.y / 256; if (g.fog[g.qIdx(x | 0, y | 0)] === 2) live.push(e); }
  const fa = new Float32Array(live.length * 6);
  live.forEach((e, i) => { const o = i * 6; fa[o] = e.id; fa[o + 1] = e.x / 256; fa[o + 2] = e.y / 256; fa[o + 3] = FOE[e.type] ?? 0; fa[o + 4] = e.hp / e.hpMax; fa[o + 5] = e.state === 'attack' ? 2 : e.raid ? 1 : 0; });
  msg.foes = fa.buffer; transfer.push(fa.buffer);
  if (sim.tick - lastDefence >= 10) {
    lastDefence = sim.tick;
    msg.defence = {
      nests: sim.ents.list('nest').filter((n) => n.seen).map((n) => ({ id: n.id, x: n.x / 256, y: n.y / 256, r: n.r, stage: n.stage, hp: n.hp / n.hpMax, fed: +n.fed.toFixed(2) })),
      raids: D.raids.list().map((r) => { const t = D.raids.targetOf(r); return { id: r.id, state: r.state, n: r.members.length + r.toSpawn.length, path: r.path, leaveIn: Math.max(0, r.leaveAt - sim.tick), guards: r.guards, atWall: r.atWall, hits: r.hits, target: r.target, tx: t?.fp.cx, ty: t?.fp.cy, what: t ? sim.data.B[t.type].name : null }; }),
      towers: sim.ents.list('building').filter((b) => D.DD.T[b.type] && b.built >= 1).map((b) => { const st = D.towers.stats(b.type); return { id: b.id, type: b.type, x: b.fp.cx, y: b.fp.cy, range: st.range, minRange: st.minRange || 0, level: sim.levels['tower.' + b.type] || 1 }; }),
      enemies: en.length, live: live.length, over: D.over, crippledUntil: D.crippledUntil, wallLevel: sim.levels.wall, wallTrim: D.DD.wallLevel(sim.levels.wall).trim,
    };
  }
  if (D.fields.ver !== sentThreat && sim.tick % D.DD.bal.threat.fieldEvery === 0) {
    sentThreat = D.fields.ver;
    const n = g.noise.slice(), gl = g.glow.slice();
    msg.threat = { qw: g.QW, qh: g.QH, noise: n.buffer, glow: gl.buffer };
    transfer.push(n.buffer, gl.buffer);
  }
}

function publicBuilding(b) {
  const def = sim.data.B[b.type];
  const p = b.kind === 'building' ? sim.stores.poolOf(b.id) : null;
  return {
    id: b.id, kind: b.kind, type: b.type, name: def?.name || 'Pile', x: b.x / 256, y: b.y / 256, w: b.w || 1, h: b.h || 1, fp: b.fp, door: b.door,
    built: b.built, work: b.work, workNeed: def?.work || 0, need: b.need, delivered: b.delivered, recipe: b.recipe, keep: b.keep, keepHere: b.keepHere || null,
    lamps: b.lamps, store: b.store || null, cap: b.cap || 0, pool: p ? p.id : null, poolHq: !!p?.hq, ring: def?.ring || 0,
    batch: b.batch ? { left: b.batch.left } : null, running: !!b.running, made: b.made || 0,
    hp: b.hp, hpMax: b.hpMax, tower: !!def?.tower, // M4
    jobs: b.jobs || 0, workers: b.workers ?? null, residents: b.residents ?? null, beds: sim.town && b.kind === 'building' ? sim.town.people.bedsOf(b) : 0, cropShare: b.cropShare ?? null, // M7
  };
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') { init(m); return; }
  if (!world) return;
  if (m.type === 'view') { view = m; forceFrame = true; }
  else if (m.type === 'rate') tps = m.tps;
  else if (m.type === 'cmd') { command(m.cmd); forceFrame = true; lastHud = -999; }
  else if (m.type === 'step') { for (let i = 0; i < (m.n || 1); i++) stepOnce(); forceFrame = true; }
  else if (m.type === 'flush') { forceFrame = true; lastFlush = m.id | 0; }
  else if (m.type === 'resend') { sentVer.fill(0xffffffff); sentGas.fill(0xffffffff); sentFog = -1; sentSurvey = -1; if (sim) { for (const b of sim.ents.list('building')) sim.dirty.add(b.id); for (const v of sim.roads.list()) sim.vectorsDirty.add(v.id); for (const v of sim.defence?.walls.list() || []) sim.vectorsDirty.add(v.id); sentThreat = -1; lastDefence = -999; } forceFrame = true; }
};
