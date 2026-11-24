#!/usr/bin/env node
// Build data/catalog.json (what the review page reads) from:
//   data/refs.json   names / slots / sets of every subject
//   data/gear.json   which fal job (sheet) made each item, what body regions it hides, its grip (weapons)
//   data/spend.json  what each job cost (a sheet's price is shared by the items cut from it)
//   data/sockets.json  weapon sockets per body (tools/blender/sockets.py)
//   models/final/**  the finished files; triangle counts and sizes are read from the GLBs themselves
//   node avatar-3d/fal/tools/build-catalog.mjs
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const refs = J('data/refs.json'), spend = J('data/spend.json');
const gear = existsSync(join(ROOT, 'data/gear.json')) ? J('data/gear.json') : { bodies: {}, items: {} };
const sockets = existsSync(join(ROOT, 'data/sockets.json')) ? J('data/sockets.json') : {};
const price = id => spend.jobs.find(j => j.id === id)?.price ?? 0;
const round = v => Math.round(v * 1000) / 1000;

export function glbTriangles(file) {
  const b = readFileSync(join(ROOT, file));
  const len = b.readUInt32LE(12);
  const g = JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
  let t = 0;
  for (const m of g.meshes || []) for (const p of m.primitives) {
    t += p.indices != null ? g.accessors[p.indices].count / 3 : g.accessors[p.attributes.POSITION].count / 3;
  }
  return Math.round(t);
}
const kb = f => Math.round(statSync(join(ROOT, f)).size / 1024);

const bodies = [];
for (const [id, b] of Object.entries(gear.bodies)) {
  const file = `models/final/${id}.glb`;
  if (!existsSync(join(ROOT, file))) continue;
  const jobs = b.jobs.map(j => ({ id: j, price: price(j), endpoint: spend.jobs.find(x => x.id === j)?.endpoint }));
  bodies.push({ id, name: b.name, note: b.note || null, ...(b.regions ? { regions: b.regions } : {}), ...(b.druidForm ? { druidForm: true } : {}), ...(b.mount ? { mount: b.mount } : {}), enemy: !!b.enemy, maker: b.maker || null, weapon: b.weapon || null, offhand: b.offhand || null, role: b.role || null, group: b.group || null, height: b.height ?? null, skeleton: b.skeleton || 'biped', stage: b.stage !== false, file, triangles: glbTriangles(file), kb: kb(file), cost: round(jobs.reduce((a, j) => a + j.price, 0)), jobs });
}

const items = [];
for (const [id, g] of Object.entries(gear.items)) {
  const r = refs.items.find(x => x.id === id) || {};
  const share = g.job ? price(g.job) / (gear.items ? Object.values(gear.items).filter(x => x.job === g.job).length : 1) : 0;
  const it = { id, name: r.name || id, slot: r.slot, set: r.set || null, chibi: r.chibi || null, kind: g.kind, job: g.job, endpoint: spend.jobs.find(x => x.id === g.job)?.endpoint || null, cost: round(share) };
  if (g.kind === 'wear') {
    it.hides = {}; it.files = {}; it.triangles = {}; it.kb = {}; it.fit = {};
    for (const b of bodies) {
      const f = `models/final/gear/${id}-${b.id}.glb`;
      if (!existsSync(join(ROOT, f))) continue;
      it.files[b.id] = f; it.triangles[b.id] = glbTriangles(f); it.kb[b.id] = kb(f);
      // what the fit measured on this body: which body parts the piece really covers (tools/blender/fit.py)
      const fitFile = join(ROOT, `data/fits/${id}-${b.id}.json`);
      const fit = existsSync(fitFile) ? JSON.parse(readFileSync(fitFile, 'utf8')) : null;
      it.hides[b.id] = fit ? fit.hides : (g.hides || []);
      if (fit) it.fit[b.id] = { inside: fit.inside, scale: fit.scale ?? [fit.scale_l, fit.scale_r] };
    }
    if (!Object.keys(it.files).length) continue;
  } else {
    it.file = `models/final/props/${id}.glb`;
    if (!existsSync(join(ROOT, it.file))) continue;
    it.grip = g.grip; it.triangles = glbTriangles(it.file); it.kb = kb(it.file);
  }
  items.push(it);
}

// scenery props (Oathwild, data/scenery.json → tools/scenery.sh): real size read from the file (glTF: x wide, y up, z deep)
export function glbBox(file) {
  const b = readFileSync(join(ROOT, file));
  const g = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const m of g.meshes) for (const p of m.primitives) { const a = g.accessors[p.attributes.POSITION]; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a.min[i]); hi[i] = Math.max(hi[i], a.max[i]); } }
  return hi.map((v, i) => Math.round((v - lo[i]) * 100) / 100);
}
const scen = existsSync(join(ROOT, 'data/scenery.json')) ? J('data/scenery.json') : { sheets: [] };
const scenery = [];
for (const sh of scen.sheets) for (const o of sh.objects) {
  const file = `models/final/scenery/${o.id}.glb`;
  if (!existsSync(join(ROOT, file)) || o.stage === false) continue;
  const job = o.job || 'scn-' + sh.id;
  const sharing = scen.sheets.flatMap(s => s.objects.map(x => ({ x, sid: s.id }))).filter(({ x, sid }) => (x.job || 'scn-' + sid) === job).length;
  scenery.push({ id: o.id, name: o.name, kind: o.kind, regions: o.regions || [], file, triangles: glbTriangles(file), size: glbBox(file), tex: o.tex || 512, kb: kb(file), job, cost: round(price(job) / sharing) });
}

const out = {
  _doc: 'GENERATED by tools/build-catalog.mjs — edit data/gear.json / data/refs.json and re-run.',
  total_spent: spend.total, bodies, items, scenery, sockets,
  slots: [['head', 'Head'], ['chest', 'Chest'], ['hands', 'Hands'], ['legs', 'Legs'], ['feet', 'Feet'], ['weapon', 'Main hand'], ['offhand', 'Off hand']],
  sets: [['cloth', 'Cloth'], ['leather', 'Leather'], ['mail', 'Mail'], ['plate', 'Plate']],
};
writeFileSync(join(ROOT, 'data/catalog.json'), JSON.stringify(out, null, 1));
console.log(`catalog: ${bodies.length} bodies, ${items.length} items, ${scenery.length} scenery props, spent $${spend.total}`);
