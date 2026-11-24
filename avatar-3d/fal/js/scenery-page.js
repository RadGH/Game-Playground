// Scenery tab of the fal review page (Oathwild 2026-11-23): every static prop from data/catalog.json `scenery`, at its
// real size in metres beside a 1.8 m man (the fal male body) for scale. One at a time, or a line-up of the filtered
// props in rows by size. Table: name, kind, size (wide x deep x tall), triangles, texture px, file size, cost.
//   ?tab=scenery  ?kind=building  ?region=brightwater|thornmere  ?prop=<id>  ?plineup=1
import * as THREE from 'three';
import { glb, createFalCharacter } from './fal.js';

const KINDS = [['all', 'All'], ['building', 'Buildings'], ['wall', 'Walls'], ['prop', 'Village'], ['clutter', 'Clutter'], ['camp', 'Camp'],
  ['loot', 'Loot'], ['travel', 'Travel'], ['shrine', 'Shrines'], ['ruin', 'Ruins'], ['barrow', 'Barrow'], ['rock', 'Rocks'], ['tree', 'Trees'], ['plant', 'Plants']];
const REGIONS = [['all', 'Both regions'], ['brightwater', 'Brightwater Vale'], ['thornmere', 'Thornmere Wilds']];

export function createSceneryTab({ view, cat, $, chip, loading, q, money, num }) {
  const group = new THREE.Group(); group.visible = false; view.scene.add(group);
  const pick = { kind: q.get('kind') || 'all', region: q.get('region') || 'all', id: q.get('prop') || null, lineup: q.get('plineup') === '1' };
  const all = cat.scenery || [];
  const list = () => all.filter(p => (pick.kind === 'all' || p.kind === pick.kind) && (pick.region === 'all' || p.regions.includes(pick.region)));
  const made = new Map();
  let man = null, token = 0;
  const shown = [];

  async function model(p) {
    if (!made.has(p.id)) made.set(p.id, glb(p.file).then(g => {
      const o = g.scene.clone(true);
      o.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; if (m.material?.map) m.material.map.anisotropy = 4; } });
      return o;
    }));
    return made.get(p.id);
  }

  async function show() {
    render();
    const t = ++token;
    const ps = list();
    if (!pick.id || !ps.some(p => p.id === pick.id)) pick.id = ps[0]?.id || null;
    const want = pick.lineup ? ps : ps.filter(p => p.id === pick.id);
    loading(want.length ? 'Loading ' + (want.length > 1 ? want.length + ' props' : want[0].name.toLowerCase()) + '…' : '');
    if (!man) { man = await createFalCharacter('male'); man.play('idle', 0); man._tick = dt => man.update(dt); }
    const objs = [];
    for (const p of want) objs.push([p, await model(p)]);
    if (t !== token) return;
    group.clear(); shown.length = 0;
    view.removeTicker(man._tick); view.addTicker(man._tick);
    group.add(man.group);
    // rows: props sorted smallest first, packed left to right (rows go back); the man stands at the left end of the first row
    const gap = 0.6;
    let x = 0, z = 0, rowDepth = 0, maxW = 0;
    const rowMax = pick.lineup ? Math.max(14, Math.sqrt(objs.reduce((a, [p]) => a + (p.size[0] + gap) * (p.size[2] + gap), 0)) * 1.6) : 1e9;
    objs.sort((a, b) => a[0].size[1] - b[0].size[1]);   // small props in the front row, buildings behind
    man.group.position.set(-0.9, 0, 0);
    for (const [p, o] of objs) {
      const [w, , d] = p.size;
      if (x > 0 && x + w > rowMax) { z -= rowDepth + gap * 2; x = 0; rowDepth = 0; }
      o.position.set(x + w / 2, 0, z - d / 2);
      group.add(o); shown.push({ p, o });
      x += w + gap; rowDepth = Math.max(rowDepth, d); maxW = Math.max(maxW, x);
    }
    loading('');
    frame(maxW, -z + rowDepth, Math.max(1.8, ...objs.map(([p]) => p.size[1])));
  }

  function frame(w, d, h) {
    const cam = view.camera, tn = Math.tan(cam.fov * Math.PI / 360);
    const cx = (w - 0.9 - 0.9) / 2, cz = -d / 2;
    const span = Math.max(w + 1.8, d) * 0.62, dist = Math.max(span / (tn * cam.aspect), h * 0.75 / tn) + d * 0.3;
    view.controls.target.set(cx, h * 0.4, cz);
    cam.position.set(cx + dist * 0.35, h * 0.5 + dist * 0.45, cz + dist * 0.85);
    view.controls.update();
  }

  function render() {
    const k = $('p-kinds'); k.replaceChildren();
    for (const [id, label] of KINDS) {
      const n = all.filter(p => (id === 'all' || p.kind === id) && (pick.region === 'all' || p.regions.includes(pick.region))).length;
      if (!n && id !== 'all') continue;
      k.append(chip(label, String(n), pick.kind === id, () => { pick.kind = id; show(); }));
    }
    const r = $('p-regions'); r.replaceChildren();
    for (const [id, label] of REGIONS) r.append(chip(label, null, pick.region === id, () => { pick.region = id; show(); }));
    const v = $('p-view'); v.replaceChildren(
      chip('One at a time', null, !pick.lineup, () => { pick.lineup = false; show(); }),
      chip('Line-up, real sizes', null, pick.lineup, () => { pick.lineup = true; show(); }));
    const t = $('p-table'); t.replaceChildren();
    const head = t.createTHead().insertRow();
    for (const h of ['Prop', 'Size (m)', 'Triangles', 'Texture', 'File', 'Cost']) { const th = document.createElement('th'); th.textContent = h; head.append(th); }
    const tb = t.createTBody(); const ps = list(); let tris = 0, kbs = 0, cost = 0;
    for (const p of ps) {
      const tr = tb.insertRow(); tr.className = 'fl-pick' + (p.id === pick.id ? ' on' : ''); tr.tabIndex = 0;
      const n = tr.insertCell(); n.textContent = p.name;
      const s = document.createElement('small'); s.textContent = (KINDS.find(k => k[0] === p.kind)?.[1] || p.kind) + ' · ' + p.regions.map(id => REGIONS.find(r => r[0] === id)?.[1].split(' ')[0]).join(', '); n.append(s);
      tr.insertCell().textContent = `${p.size[0].toFixed(1)} × ${p.size[2].toFixed(1)} × ${p.size[1].toFixed(1)}`;
      tr.insertCell().textContent = num(p.triangles);
      tr.insertCell().textContent = p.tex + ' px';
      tr.insertCell().textContent = p.kb + ' KB';
      tr.insertCell().textContent = money(p.cost);
      tris += p.triangles; kbs += p.kb; cost += p.cost;
      const go = () => { pick.id = p.id; if (pick.lineup) { render(); focus(p.id); } else show(); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    }
    const f = t.createTFoot().insertRow();
    f.insertCell().textContent = ps.length + ' props'; f.insertCell();
    f.insertCell().textContent = ps.length ? num(tris / ps.length) + ' avg' : ''; f.insertCell();
    f.insertCell().textContent = Math.round(kbs / 102.4) / 10 + ' MB'; f.insertCell().textContent = money(cost);
  }

  function focus(id) {
    const s = shown.find(x => x.p.id === id); if (!s) return;
    const [w, h, d] = s.p.size, tn = Math.tan(view.camera.fov * Math.PI / 360);
    const dist = Math.max(h * 0.8 / tn, w * 0.7 / (tn * view.camera.aspect)) + d * 0.5;
    const p = s.o.position;
    view.controls.target.set(p.x, h * 0.45, p.z); view.camera.position.set(p.x + dist * 0.4, h * 0.6 + dist * 0.3, p.z + dist * 0.9); view.controls.update();
  }

  return {
    group,
    async enter() { group.visible = true; await show(); },
    leave() { group.visible = false; if (man) view.removeTicker(man._tick); },
    state: () => ({ shown: shown.map(s => s.p.id), pick: { ...pick } }),
  };
}
