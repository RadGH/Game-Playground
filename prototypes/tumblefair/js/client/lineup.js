// The row of characters behind the title, lobby and final screens: one 3D body per seated player on a round fair
// podium, waving as they arrive. sync(members) adds, removes and re-dresses them to match the room.
import * as THREE from 'three';
import { createActor } from './avatars.js';
import { canvasTexture } from './stage.js';

export function createLineup(stage) {
  const group = new THREE.Group(); group.name = 'lineup';
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8, 0.6, 48), new THREE.MeshStandardMaterial({ roughness: 0.8, map: canvasTexture(512, 512, (g, w) => {
    g.fillStyle = '#f2c14e'; g.fillRect(0, 0, w, w); g.translate(w / 2, w / 2);
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#e8563f' : '#fff3d6'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, w, i * Math.PI / 8, (i + 1) * Math.PI / 8); g.fill(); }
    g.fillStyle = '#12323a'; g.beginPath(); g.arc(0, 0, 60, 0, 7); g.fill();
  }) }));
  floor.position.y = -0.3; floor.receiveShadow = true; group.add(floor);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(7.75, 0.22, 10, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#12222a' })); rim.position.y = -0.05; group.add(rim);
  const actors = new Map(), tags = new Map(), busy = new Set();
  let shown = false, poses = {}, wantKey = '';
  function slots(n) { const out = []; for (let i = 0; i < n; i++) out.push({ x: (i - (n - 1) / 2) * 1.9, z: Math.abs(i - (n - 1) / 2) * -0.35 }); return out; }
  async function sync(list, { labels = true, me = null } = {}) {
    wantKey = JSON.stringify(list.map(m => [m.pid, m.seat]));
    for (const [pid, a] of actors) if (!list.some(m => m.pid === pid)) { a.dispose(); actors.delete(pid); tags.get(pid)?.remove(); tags.delete(pid); }
    const at = slots(list.length);
    await Promise.all(list.map(async (m, i) => {
      let a = actors.get(m.pid);
      if (!a) {
        if (busy.has(m.pid)) return; busy.add(m.pid);
        a = await createActor(m); busy.delete(m.pid);
        if (!list.includes(m) && !wantKey.includes(`[${m.pid},`)) { a.dispose(); return; }
        a.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
        actors.set(m.pid, a); group.add(a.group); a.play('wave', 1400);
        if (labels) tags.set(m.pid, stage.tag(a.group, { text: m.pid === me ? 'YOU' : m.name, seat: m.seat, height: a.height + 0.3, cls: m.pid === me ? 'me' : '' }));
      } else { a.setLook(m); tags.get(m.pid)?.set(m.pid === me ? 'YOU' : m.name); }
      a.place(at[i].x, 0, at[i].z, 0);
      a.setPose(poses[m.pid] || 'idle');
    }));
    stage.setView({ cx: 0, cz: 0, hw: Math.max(2.4, list.length * 1.05 + 0.6), hd: 1.6, pitch: 16, tall: 2.6, yaw: 0 });
  }
  return {
    group, actors, sync,
    show(on) { if (on === shown) return; shown = on; if (on) stage.root.add(group); else group.removeFromParent(); for (const t of tags.values()) t.el.style.visibility = on ? '' : 'hidden'; },
    setPoses(p) { poses = p; for (const [pid, a] of actors) a.setPose(poses[pid] || 'idle'); },
    play(pid, name, ms) { actors.get(pid)?.play(name, ms); },
    frame(dt) { if (shown) for (const a of actors.values()) a.update(dt); },
  };
}
