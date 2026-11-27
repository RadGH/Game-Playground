// What the editor draws on top of the world: road / river centre lines, colliders, level areas, effect zone rings,
// bridge end handles, control points, note pins, Claude's marker, the brush ring. Plain lines and simple shapes in one
// group, rebuilt only when something they show changes (or the camera moves far for the near-only ones).
import * as THREE from 'three';

const COL = { road: 0xf1d79a, river: 0x6fc0ff, collider: 0xff5a4a, box: 0xff9a4a, area: 0xd7a6ff, zone: 0xc79bff, zoneSel: 0xffffff, handle: 0xffd36a, point: 0xffffff, brush: 0xfff2c0, done: 0x62d26f, open: 0xffb347, claude: 0x6fd3ff, sel: 0x8cff9a };

export function createOverlays(scene, { heightAt }) {
  const root = new THREE.Group(); root.name = 'editor overlays'; scene.add(root);
  const groups = {};
  const group = name => { if (!groups[name]) { groups[name] = new THREE.Group(); groups[name].name = name; root.add(groups[name]); } return groups[name]; };
  const lineMat = new Map();
  const mat = (c, top = false) => { const k = c + (top ? 't' : ''); if (!lineMat.has(k)) lineMat.set(k, new THREE.LineBasicMaterial({ color: c, depthTest: !top, transparent: true, opacity: 0.95 })); return lineMat.get(k); };
  const solid = new Map();
  const smat = (c, top = true) => { const k = c + (top ? 't' : ''); if (!solid.has(k)) solid.set(k, new THREE.MeshBasicMaterial({ color: c, depthTest: !top, transparent: true, opacity: top ? 0.9 : 1 })); return solid.get(k); };
  const sphere = new THREE.SphereGeometry(1, 14, 10), cone = new THREE.ConeGeometry(0.55, 1.6, 10), beam = new THREE.CylinderGeometry(0.25, 0.25, 1, 8, 1, true);
  function clear(name) { const g = group(name); for (const c of [...g.children]) { g.remove(c); if (c.geometry && c.geometry !== sphere && c.geometry !== cone && c.geometry !== beam) c.geometry.dispose(); } return g; }
  function polyline(pts, c, { lift = 0.35, top = false, loop = false } = {}) {
    const a = new Float32Array(pts.length * 3);
    pts.forEach(([x, z, y], i) => { a[i * 3] = x; a[i * 3 + 1] = (y ?? heightAt(x, z)) + lift; a[i * 3 + 2] = z; });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const l = new (loop ? THREE.LineLoop : THREE.Line)(g, mat(c, top)); l.renderOrder = 20; return l;
  }
  const circle = (x, z, r, n = 48) => Array.from({ length: n }, (_, i) => [x + Math.cos(i / n * 6.2832) * r, z + Math.sin(i / n * 6.2832) * r]);
  function ball(x, y, z, r, c, top = true) { const m = new THREE.Mesh(sphere, smat(c, top)); m.position.set(x, y, z); m.scale.setScalar(r); m.renderOrder = 21; return m; }

  const O = {
    root,
    lines(T, on) {
      const g = clear('lines'); if (!on) return;
      for (const r of T.rivers) g.add(polyline(r.pts.map(p => [p.x, p.z, p.y]), COL.river, { lift: 0.3 }));
      for (const r of T.roads) g.add(polyline(r.pts.map(p => [p.x, p.z, p.y]), COL.road, { lift: 0.35 }));
    },
    areas(T, on) {
      const g = clear('areas'); if (!on) return;
      for (const a of T.map.areas || []) g.add(polyline(circle(a.at[0], a.at[1], a.radius, 72), COL.area, { lift: 1.2, loop: true }));
    },
    colliders(ground, at, on) {
      const g = clear('colliders'); if (!on) return;
      for (const s of ground.solidsNear(at.x, at.z, 70)) g.add(polyline(circle(s.x, s.z, s.r, 16), COL.collider, { lift: 0.25, loop: true }));
      for (const b of ground.boxes || []) {
        if (Math.hypot(b.x - at.x, b.z - at.z) > 90) continue;
        const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => { const lx = sx * b.hw, lz = sz * b.hd; return [b.x + lx * b.c + lz * b.s, b.z - lx * b.s + lz * b.c]; });
        g.add(polyline(pts, COL.box, { lift: 0.25, loop: true }));
      }
    },
    zones(zones, selId, on) {
      const g = clear('zones'); if (!on) return;
      for (const z of zones) {
        const sel = z.id === selId;
        g.add(polyline(circle(z.at[0], z.at[1], z.r, 72), sel ? COL.zoneSel : COL.zone, { lift: 0.8, loop: true, top: sel }));
        if (z.soft > 0.5) g.add(polyline(circle(z.at[0], z.at[1], Math.max(0.5, z.r - z.soft), 72), COL.zone, { lift: 0.8, loop: true }));
        if (sel) g.add(ball(z.at[0], heightAt(...z.at) + 1.5, z.at[1], 0.9, COL.zoneSel));
      }
    },
    /** bridge ends (a, b) as handles; the selected bridge's deck outline */
    bridge(b, draft) {
      const g = clear('bridge'); if (!b) return;
      const a = draft?.a || b.a, e = draft?.b || b.b, deck = draft?.deck ?? b.deck, w = (draft?.width ?? b.width) / 2;
      const dx = e[0] - a[0], dz = e[1] - a[1], L = Math.hypot(dx, dz) || 1, vx = dz / L * w, vz = -dx / L * w;
      g.add(polyline([[a[0] + vx, a[1] + vz, deck], [e[0] + vx, e[1] + vz, deck], [e[0] - vx, e[1] - vz, deck], [a[0] - vx, a[1] - vz, deck]], COL.handle, { lift: 0.05, loop: true, top: true }));
      g.add(ball(a[0], deck + 0.6, a[1], 0.7, COL.handle)); g.add(ball(e[0], deck + 0.6, e[1], 0.7, COL.handle));
    },
    points(pts, sel, c = COL.point) {
      const g = clear('points'); if (!pts) return;
      g.add(polyline(pts, c, { lift: 0.6, top: true }));
      pts.forEach((p, i) => g.add(ball(p[0], heightAt(p[0], p[1]) + 0.8, p[1], i === sel ? 1.1 : 0.75, i === sel ? COL.sel : c)));
    },
    notes(notes) {
      const g = clear('notes');
      for (const n of notes) {
        const y = heightAt(...n.at), m = new THREE.Mesh(cone, smat(n.done ? COL.done : COL.open, false));
        m.position.set(n.at[0], y + 2.6, n.at[1]); m.rotation.x = Math.PI; m.scale.setScalar(1.4); g.add(m);
        g.add(ball(n.at[0], y + 4, n.at[1], 0.75, n.done ? COL.done : COL.open, false));
      }
    },
    marker(mk) {
      const g = clear('marker'); if (!mk?.at) return;
      const y = heightAt(...mk.at), m = new THREE.Mesh(beam, smat(COL.claude, false));
      m.position.set(mk.at[0], y + 15, mk.at[1]); m.scale.set(1, 30, 1); g.add(m);
      g.add(polyline(circle(mk.at[0], mk.at[1], 3, 32), COL.claude, { lift: 0.3, loop: true, top: true }));
    },
    brush(at, r, on) {
      const g = clear('brush'); if (!on || !at) return;
      g.add(polyline(circle(at[0], at[1], r, 56), COL.brush, { lift: 0.4, loop: true, top: true }));
    },
    pick(at, r = 1.2) {
      const g = clear('pick'); if (!at) return;
      g.add(polyline(circle(at[0], at[1], r, 24), COL.sel, { lift: 0.3, loop: true, top: true }));
    },
  };
  return O;
}
