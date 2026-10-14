// The board, drawn: the fairground picture as the ground, a round pad per space (coloured AND labelled by what it
// does), cream paths between them, and the players' characters hopping from pad to pad. The server sends what
// happened (`bd` events); this file only animates it, in order, never deciding anything.
import * as THREE from 'three';
import { createActor } from './avatars.js';
import { canvasTexture, loadTexture } from './stage.js';
import { SEATS } from '../shared/protocol.js';

export const SPACE_LOOK = {
  start: { color: '#3ecf5a', label: 'GO' }, ticket: { color: '#ffd23f', label: '+3' }, join: { color: '#ffd23f', label: '+3' },
  pit: { color: '#8a5a3a', label: '-3' }, chance: { color: '#a45cff', label: '?' }, booth: { color: '#ff5f8f', label: '★' },
  mirror: { color: '#39d0e0', label: '⇄' }, jackpot: { color: '#ff9f1c', label: '+8' }, fork: { color: '#ffffff', label: '⑂' },
};
const OFFS = [[-0.5, -0.38], [0.5, -0.38], [-0.5, 0.48], [0.5, 0.48]];

export async function createBoardView({ stage, def, members, me, assetBase }) {
  const group = new THREE.Group(); group.name = 'board'; stage.root.add(group);
  const byId = new Map(def.spaces.map(s => [s.id, s]));
  const tex = await loadTexture(`${assetBase}${def.backdrop}.webp`);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(def.size, def.size).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, color: tex ? '#ffffff' : '#3f8f5a', roughness: 1 }));
  ground.receiveShadow = true; group.add(ground);
  const skirt = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#12323a' })); skirt.position.y = -0.05; group.add(skirt);
  // paths
  const pathMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', roughness: 1 });
  for (const s of def.spaces) for (const n of s.next) {
    const t = byId.get(n), dx = t.x - s.x, dz = t.z - s.z, len = Math.hypot(dx, dz);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, len), pathMat); seg.position.set((s.x + t.x) / 2, 0.05, (s.z + t.z) / 2); seg.rotation.y = Math.atan2(dx, dz); seg.receiveShadow = true; group.add(seg);
  }
  // pads
  const padGeo = new THREE.CylinderGeometry(1.05, 1.15, 0.3, 28), topGeo = new THREE.CircleGeometry(0.98, 28).rotateX(-Math.PI / 2);
  const topTex = new Map();
  for (const s of def.spaces) {
    const L = SPACE_LOOK[s.type] || SPACE_LOOK.ticket;
    const pad = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({ color: '#12222a', roughness: 0.7 })); pad.position.set(s.x, 0.15, s.z); pad.castShadow = pad.receiveShadow = true; group.add(pad);
    if (!topTex.has(s.type)) topTex.set(s.type, canvasTexture(128, 128, (g, w) => {
      g.fillStyle = L.color; g.fillRect(0, 0, w, w);
      g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.arc(w / 2, w / 2, w * 0.42, 0, 7); g.fill();
      g.fillStyle = '#12222a'; g.font = `900 ${L.label.length > 1 ? 62 : 78}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.label, w / 2, w / 2 + 4);
    }));
    const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ map: topTex.get(s.type), roughness: 0.6 })); top.material.userData.shared = false; top.position.set(s.x, 0.31, s.z); top.receiveShadow = true; group.add(top);
  }
  // tokens
  const actors = new Map(), tags = new Map(), at = new Map(), queue = [];
  let cur = null, focus = null, disposed = false;
  const spot = (pid, id) => { const s = byId.get(id), m = members().find(x => x.pid === pid), o = OFFS[m?.seat ?? 0]; return { x: s.x + o[0], z: s.z + o[1] }; };
  async function ensure(pid, id) {
    if (actors.has(pid) || disposed) return;
    const m = members().find(x => x.pid === pid); if (!m) return;
    actors.set(pid, null);
    const a = await createActor(m, { scale: 1.15 });
    if (disposed) return a.dispose();
    a.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const p = spot(pid, at.get(pid) || id); a.place(p.x, 0.31, p.z, 0); group.add(a.group); actors.set(pid, a);
    tags.set(pid, stage.tag(a.group, { text: pid === me ? 'YOU' : m.name, seat: m.seat, height: a.height + 0.3, cls: pid === me ? 'me' : '' }));
  }
  /** Put everyone where the server says (a fresh page, or after a swap). */
  function sync(view) {
    for (const pid of view.order) { if (!queue.length && !cur) at.set(pid, view.pos[pid]); else if (!at.has(pid)) at.set(pid, view.pos[pid]); ensure(pid, view.pos[pid]); const a = actors.get(pid); if (a && !queue.length && !cur) { const p = spot(pid, view.pos[pid]); a.place(p.x, 0.31, p.z); } }
    for (const [pid, a] of actors) if (!view.order.includes(pid) && a) { a.dispose(); actors.delete(pid); tags.get(pid)?.remove(); tags.delete(pid); }
    if (view.pid != null && !cur && !queue.length) look(view.pid);
  }
  function look(pid, wide = false) {
    focus = pid; const id = at.get(pid); const s = id && byId.get(id);
    // a tall phone looks along the board's long side, so the loop fills the screen instead of a strip across it
    const yaw = innerHeight > innerWidth * 1.15 ? 90 : 0;
    if (wide || !s) stage.setView({ cx: 0, cz: 0, hw: def.size * 0.44, hd: def.size * 0.34, pitch: 58, tall: 2, yaw });
    else stage.setView({ cx: s.x * 0.75, cz: s.z * 0.75, hw: yaw ? 7 : 9.5, hd: yaw ? 9.5 : 7, pitch: 52, tall: 3, yaw });
  }
  function event(ev) {
    if (ev.ev === 'turn') queue.push({ kind: 'look', pid: ev.pid });
    if (ev.ev === 'step') queue.push({ kind: 'walk', pid: ev.pid, path: ev.path, ms: ev.ms });
    if (ev.ev === 'fx') {
      if (ev.path?.length) queue.push({ kind: 'walk', pid: ev.pid, path: ev.path, ms: ev.path.length * 260, hold: 900 });
      queue.push({ kind: 'fx', ev });
    }
    if (ev.ev === 'roundEnd') queue.push({ kind: 'wide' });
  }
  function frame(dt) {
    for (const a of actors.values()) a?.update(dt);
    if (!cur && queue.length) {
      cur = queue.shift(); cur.t = 0;
      if (cur.kind === 'look') { look(cur.pid); cur = null; }
      else if (cur.kind === 'wide') { look(null, true); cur = null; }
      else if (cur.kind === 'fx') {
        const ev = cur.ev, a = actors.get(ev.pid);
        if (ev.pos) for (const [k, id] of Object.entries(ev.pos)) { const pid = +k; if (at.get(pid) !== id) { at.set(pid, id); const b = actors.get(pid), p = spot(pid, id); b?.place(p.x, 0.31, p.z); } }
        if (a) a.play((ev.d ?? 0) < 0 || ev.kind === 'pit' ? 'hit' : ev.kind === 'none' ? 'idle' : 'cheer', 1200);
        if (ev.pid === focus) look(ev.pid);
        cur = null;
      } else if (cur.kind === 'walk') { cur.from = spot(cur.pid, at.get(cur.pid)); cur.i = 0; cur.per = cur.ms / cur.path.length / 1000; look(cur.pid); }
    }
    if (cur?.kind === 'walk') {
      const a = actors.get(cur.pid);
      cur.t += dt;
      const to = spot(cur.pid, cur.path[cur.i]), k = Math.min(1, cur.t / cur.per);
      if (a) { const x = cur.from.x + (to.x - cur.from.x) * k, z = cur.from.z + (to.z - cur.from.z) * k; a.place(x, 0.31 + Math.sin(k * Math.PI) * 0.7, z, Math.atan2(to.x - cur.from.x, to.z - cur.from.z)); a.setPose('jump'); }
      if (k >= 1) {
        at.set(cur.pid, cur.path[cur.i]); cur.from = to; cur.t = 0; cur.i++;
        look(cur.pid);
        if (cur.i >= cur.path.length) { a?.place(to.x, 0.31, to.z, 0); a?.setPose('idle'); cur = null; }
      }
    }
  }
  function dispose() { disposed = true; for (const t of tags.values()) t.remove(); for (const a of actors.values()) a?.dispose(); stage.clear(group); group.removeFromParent(); }
  look(null, true);
  return { sync, event, frame, dispose, look, get busy() { return !!cur || queue.length > 0; } };
}
