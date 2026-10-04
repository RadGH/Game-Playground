// The vale: both walled fields in one world (PLAN §4.1), drawn from a LAYOUT object that
// js/view/layout.js derives from the sim's map. Nothing here reads sim state per frame except
// `setBanners`, which drops the Keep's physical banners as they are lost.
//
// layout = { fields: [{ team, x0, x1, zGate, zKeep, dir, gates:[{x,z}], keep:{x,z},
//            armory:{x,z}, lanes:[[{x,z}...]], ford:{z0,z1}|null, merge:z|null }], bounds:{...} }
// `dir` is +1 when units walk toward +z (gate at low z), -1 otherwise.

import * as THREE from 'three';

export const TEAM_COLORS = [0x3f86ec, 0xe0503e, 0x4fc46a, 0xe0b23e];
export const TEAM_CSS = ['#3f86ec', '#e0503e', '#4fc46a', '#e0b23e'];

// ---------- procedural textures (canvas; no image files) ----------

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

function speckle(ctx, w, h, base, cols, n, rmin, rmax, seed) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = cols[(r() * cols.length) | 0];
    ctx.globalAlpha = 0.25 + r() * 0.5;
    const x = r() * w, y = r() * h, s = rmin + r() * (rmax - rmin);
    ctx.beginPath(); ctx.ellipse(x, y, s, s * (0.5 + r()), r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const TEX = {};
function textures() {
  if (TEX.grass) return TEX;
  TEX.grass = canvasTex(256, 256, (c, w, h) => speckle(c, w, h, '#4f6b34', ['#5d7a3c', '#435c2b', '#6a8443', '#3a5226', '#738c4a'], 2600, 1, 4, 7), 1);
  TEX.wild = canvasTex(256, 256, (c, w, h) => speckle(c, w, h, '#3d5130', ['#4a6038', '#33452a', '#56693f', '#2c3b24', '#605f3a'], 2600, 1, 5, 11), 1);
  TEX.road = canvasTex(256, 256, (c, w, h) => speckle(c, w, h, '#8a7556', ['#9c8663', '#7a6649', '#a8936e', '#6c5a40', '#b19c74'], 3000, 1, 3.5, 3), 1);
  TEX.stone = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#7d7d78'; c.fillRect(0, 0, w, h);
    const r = rng(5); const rowH = 32;
    for (let y = 0; y < h; y += rowH) {
      let x = (y / rowH) % 2 ? -24 : 0;
      while (x < w) {
        const bw = 40 + r() * 30, g = 120 + (r() * 30 | 0);
        c.fillStyle = `rgb(${g},${g - 2},${g - 8})`;
        c.fillRect(x + 2, y + 2, bw - 4, rowH - 4);
        x += bw;
      }
    }
  }, 1);
  TEX.water = canvasTex(128, 128, (c, w, h) => speckle(c, w, h, '#3d6f86', ['#4c86a0', '#36637a', '#5b98b0'], 500, 2, 6, 9), 1);
  return TEX;
}

function mat(tex, repeatX, repeatY, opts = {}) {
  const t = tex.clone(); t.needsUpdate = true; t.repeat.set(repeatX, repeatY);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, metalness: 0, ...opts });
}

// ---------- pieces ----------

function wallSegment(group, ax, az, bx, bz, h, thick, material, crenel = true) {
  const len = Math.hypot(bx - ax, bz - az);
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, thick), material);
  m.position.set((ax + bx) / 2, h / 2, (az + bz) / 2);
  m.rotation.y = -Math.atan2(bz - az, bx - ax);
  group.add(m);
  if (crenel && len > 2) {
    const n = Math.floor(len / 2.2);
    const geo = new THREE.BoxGeometry(1.0, 0.7, thick * 1.05);
    const inst = new THREE.InstancedMesh(geo, material, n);
    const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      o.position.set(ax + (bx - ax) * t, h + 0.35, az + (bz - az) * t);
      o.rotation.y = m.rotation.y; o.updateMatrix(); inst.setMatrixAt(i, o.matrix);
    }
    group.add(inst);
  }
  return m;
}

function tower(group, x, z, r, h, stoneMat, roofColor) {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 14), stoneMat);
  body.position.set(x, h / 2, z); group.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.25, h * 0.45, 14), new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7 }));
  roof.position.set(x, h + h * 0.22, z); group.add(roof);
  return body;
}

function flagMesh(color) {
  const geo = new THREE.PlaneGeometry(1.3, 0.8, 6, 1);
  geo.translate(0.65, 0, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }));
  return m;
}

/** Banner poles in a ring around the Keep. Returns { setFraction(f), update(t) }. */
function bannerRing(group, x, z, team, count, radius) {
  const color = TEAM_COLORS[team] ?? 0xffffff;
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8 });
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6);
  const poles = [];
  for (let i = 0; i < count; i++) {
    const a = Math.PI + ((i + 0.5) / count) * Math.PI;   // a half-ring in front of the Keep (toward the field)
    const p = new THREE.Group();
    p.position.set(x + Math.cos(a) * radius, 0, z + Math.sin(a) * radius);
    const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 2.1; p.add(pole);
    const flag = flagMesh(color); flag.position.y = 3.6; flag.rotation.y = (i % 2 ? 0.25 : -0.25); p.add(flag);   // face the camera
    p.userData = { flag, phase: i * 0.7, fall: 0, down: false };
    group.add(p); poles.push(p);
  }
  return {
    poles,
    setFraction(f) {
      const up = Math.ceil(Math.max(0, Math.min(1, f)) * count);
      poles.forEach((p, i) => { p.userData.down = i >= up; });
    },
    update(t, dt) {
      for (const p of poles) {
        const u = p.userData;
        // Wave the cloth by bending its vertices a little.
        const pos = u.flag.geometry.attributes.position;
        if (!u.base) u.base = Float32Array.from(pos.array);
        for (let i = 0; i < pos.count; i++) {
          const bx = u.base[i * 3];
          pos.array[i * 3 + 2] = Math.sin(t * 3 + bx * 2.4 + u.phase) * 0.12 * bx;
        }
        pos.needsUpdate = true;
        const goal = u.down ? 1 : 0;
        u.fall += (goal - u.fall) * Math.min(1, dt * 2.5);
        p.rotation.z = u.fall * 1.45;
        p.position.y = -u.fall * 0.4;
        p.visible = u.fall < 0.98;
      }
    },
  };
}

// ---------- the world ----------

export function buildWorld(scene, layout) {
  const T = textures();
  const root = new THREE.Group(); root.name = 'world';
  const stoneMat = mat(T.stone, 1, 1, { color: 0xd8d4c8 });
  const darkStone = mat(T.stone, 1, 1, { color: 0x9a968c });
  const fields = [];

  // Wild ground under everything.
  const b = layout.bounds;
  const bw = b.x1 - b.x0 + 260, bd = b.z1 - b.z0 + 260;
  const wild = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), mat(T.wild, bw / 14, bd / 14));
  wild.rotation.x = -Math.PI / 2; wild.position.set((b.x0 + b.x1) / 2, -0.02, (b.z0 + b.z1) / 2);
  root.add(wild);

  for (const f of layout.fields) {
    const g = new THREE.Group(); g.name = 'field' + f.team;
    const w = f.x1 - f.x0, zMin = Math.min(f.zGate, f.zKeep), zMax = Math.max(f.zGate, f.zKeep), len = zMax - zMin;
    const cx = (f.x0 + f.x1) / 2, cz = (zMin + zMax) / 2;
    // Field floor.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, len + 16), mat(T.grass, w / 10, (len + 16) / 10));
    floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, cz); g.add(floor);
    // Lanes: a dirt ribbon per lane polyline.
    const roadMat = mat(T.road, 1, 1);
    for (const lane of f.lanes) {
      for (let i = 0; i < lane.length - 1; i++) {
        const a = lane[i], c = lane[i + 1];
        const l = Math.hypot(c.x - a.x, c.z - a.z);
        const rm = roadMat.clone(); rm.map = roadMat.map.clone(); rm.map.needsUpdate = true; rm.map.repeat.set(1, l / 6);
        const seg = new THREE.Mesh(new THREE.PlaneGeometry(6, l + 6), rm);
        seg.rotation.x = -Math.PI / 2; seg.rotation.z = -Math.atan2(c.x - a.x, c.z - a.z) + Math.PI;
        seg.position.set((a.x + c.x) / 2, 0.015 + i * 0.001, (a.z + c.z) / 2);
        g.add(seg);
      }
    }
    // Ford.
    if (f.ford) {
      const fz = (f.ford.z0 + f.ford.z1) / 2, fl = Math.abs(f.ford.z1 - f.ford.z0);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(w, fl), mat(T.water, w / 8, fl / 8, { roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85 }));
      water.rotation.x = -Math.PI / 2; water.position.set(cx, 0.03, fz); water.name = 'ford';
      g.add(water);
      // Stepping stones across.
      const sGeo = new THREE.CylinderGeometry(0.6, 0.7, 0.25, 7);
      const r = rng(31 + f.team);
      for (let i = 0; i < 9; i++) {
        const s = new THREE.Mesh(sGeo, darkStone);
        s.position.set(cx + (r() - 0.5) * w * 0.8, 0.08, fz + (r() - 0.5) * fl * 0.7);
        s.rotation.y = r() * 3; g.add(s);
      }
    }
    // Side walls.
    const wallH = 3.2, th = 1.4;
    wallSegment(g, f.x0 - th / 2, zMin - 6, f.x0 - th / 2, zMax + 8, wallH, th, stoneMat);
    wallSegment(g, f.x1 + th / 2, zMin - 6, f.x1 + th / 2, zMax + 8, wallH, th, stoneMat);
    // Gate wall at the top, with one arch per gate.
    const gz = f.zGate - f.dir * 6;
    const gateXs = f.gates.map((p) => p.x).sort((a, c) => a - c);
    let lastX = f.x0 - th;
    for (const gx of gateXs) {
      wallSegment(g, lastX, gz, gx - 4, gz, wallH + 1, th * 1.6, stoneMat);
      tower(g, gx - 4.5, gz, 1.6, wallH + 4, stoneMat, TEAM_COLORS[f.team]);
      tower(g, gx + 4.5, gz, 1.6, wallH + 4, stoneMat, TEAM_COLORS[f.team]);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.4, th * 1.6), darkStone);
      lintel.position.set(gx, wallH + 2.2, gz); g.add(lintel);
      lastX = gx + 4;
    }
    wallSegment(g, lastX, gz, f.x1 + th, gz, wallH + 1, th * 1.6, stoneMat);
    // Keep wall at the bottom.
    const kz = f.zEnd ?? (f.zKeep + f.dir * 8);
    wallSegment(g, f.x0 - th, kz, f.x1 + th, kz, wallH, th, stoneMat);

    // The Keep.
    const keep = new THREE.Group();
    keep.position.set(f.keep.x, 0, f.keep.z);
    keep.scale.set(1, 0.62, 1);          // squat, so it never walls off the camera's view of the Armory
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.2, 1.2, 20), darkStone); base.position.y = 0.6; keep.add(base);
    const keepBody = new THREE.Mesh(new THREE.BoxGeometry(7, 9, 7), stoneMat); keepBody.position.y = 5.6; keep.add(keepBody);
    for (const [ox, oz] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 12, 10), stoneMat); t.position.set(ox, 6, oz); keep.add(t);
      const r = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3, 10), new THREE.MeshStandardMaterial({ color: TEAM_COLORS[f.team], roughness: 0.6 }));
      r.position.set(ox, 13.5, oz); keep.add(r);
    }
    const bigPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6, 6), new THREE.MeshStandardMaterial({ color: 0x5a4632 }));
    bigPole.position.y = 13; keep.add(bigPole);
    const bigFlag = flagMesh(TEAM_COLORS[f.team]); bigFlag.scale.set(2.4, 2.4, 1); bigFlag.position.y = 15; keep.add(bigFlag);
    g.add(keep);
    const banners = bannerRing(g, f.keep.x, f.keep.z, f.team, 14, 11);

    // Town buildings (Outfitter, Barracks, Drill Yard, Sanctum): placeholders until stream C's
    // js/view/structures.js models land. Positions come from the sim (buildingsInfo).
    const town = [];
    for (const bd of (layout.buildings || []).filter((x) => x.team === f.team)) {
      const m = buildingModel(bd);
      m.position.set(bd.x, 0, bd.z);
      m.rotation.y = DOOR_YAW[bd.door] ?? 0;
      g.add(m);
      town.push({ def: bd, model: m });
    }

    // Torches along the walls for some warmth.
    const torchGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.4, 5);
    const torchMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
    const fireMat = new THREE.MeshBasicMaterial({ color: 0xffb040 });
    for (let i = 0; i < 4; i++) {
      for (const sx of [f.x0 + 0.4, f.x1 - 0.4]) {
        const z = zMin + len * (0.15 + i * 0.25);
        const t = new THREE.Mesh(torchGeo, torchMat); t.position.set(sx, 3.6, z); g.add(t);
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), fireMat); fl.position.set(sx, 4.4, z); g.add(fl);
      }
    }
    root.add(g);
    fields.push({ team: f.team, group: g, banners, layout: f, town });
  }

  // Decoration outside the fields: trees and rocks, seeded.
  decorate(root, layout);

  scene.add(root);
  let t = 0;
  return {
    root, fields,
    setBanners(team, fraction) { for (const f of fields) if (f.team === team) f.banners.setFraction(fraction); },
    update(dt) {
      t += dt;
      for (const f of fields) {
        f.banners.update(t, dt);
        for (const b of f.town) {
          const u = b.model.userData;
          u.ring.material.opacity = (u.hot ? 0.75 : 0.32) + Math.sin(t * 3) * 0.12;
          if (u.spin) u.spin.rotation.y += dt * 0.8;
          if (u.flag) u.flag.rotation.y = Math.sin(t * 1.3) * 0.15;
        }
      }
    },
    /** Highlight one building's ring (hovered / hero standing in range). */
    highlight(id, on) {
      for (const f of fields) for (const b of f.town) if (b.def.id === id) { b.model.userData.hot = on; b.model.userData.ring.material.color.set(on ? 0xfff1c0 : b.model.userData.ringColor); }
    },
    dispose() { scene.remove(root); root.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}

// Door direction (data/buildings.json `door`) -> yaw. Models are built with the door on local +z.
const DOOR_YAW = { '+z': 0, '+x': Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 };
const RING_COLORS = { shop: 0x7fd0ff, barracks: 0xf2c45a, drillyard: 0xff9a6a, sanctum: 0xc69cff };

/** Placeholder building per kind: shop (Outfitter), barracks, drillyard, sanctum. Door on +z. */
function buildingModel(bd) {
  const g = new THREE.Group(); g.name = 'building:' + bd.id;
  const [w, d] = bd.size || [7, 5];
  const team = TEAM_COLORS[bd.team] ?? 0x888888;
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const wood = M(0x7a5a3a), dark = M(0x4a3524), stone = M(0x9a968c), roofM = M(0x5a2f22), teamM = M(team, { side: THREE.DoubleSide });
  const gold = M(0xd9a842, { metalness: 0.6, roughness: 0.35 });
  const box = (bw, bh, bd2, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd2), mat); m.position.set(x, y, z); g.add(m); return m; };
  const u = { ringColor: RING_COLORS[bd.kind] ?? 0xf2c45a };
  if (bd.kind === 'shop') {
    box(w, 3, d, wood, 0, 1.5, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 2.2, 4), roofM); roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); roof.position.y = 4.1; g.add(roof);
    // A striped awning over the counter and goods out front.
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 2), M(0x3f86ec, { side: THREE.DoubleSide })); aw.rotation.x = -Math.PI / 3; aw.position.set(0, 2.9, d / 2 + 0.7); g.add(aw);
    box(w * 0.7, 1, 0.8, dark, 0, 0.5, d / 2 + 0.6);
    for (const [x, z] of [[-w / 2 - 0.7, d / 2], [w / 2 + 0.6, d / 2 - 0.5]]) box(1, 1, 1, wood, x, 0.5, z);
    const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), gold); sign.rotation.x = Math.PI / 2; sign.position.set(0, 3.4, d / 2 + 0.06); g.add(sign);
  } else if (bd.kind === 'barracks') {
    box(w, 3.2, d, wood, 0, 1.6, 0);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, Math.max(w, d) * 0.5, 2.4, 4, 1), roofM); roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.max(w, d) * 1.4, 1, d / Math.max(w, d) * 1.4); roof.position.y = 4.4; g.add(roof);
    box(1.8, 2.2, 0.2, dark, 0, 1.1, d / 2 + 0.05);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), dark); pole.position.set(-w / 2 - 0.4, 3.5, d / 2 + 0.4); g.add(pole);
    const flagGeo = new THREE.PlaneGeometry(1.5, 2.4); flagGeo.translate(0.75, -1.2, 0);
    const flag = new THREE.Mesh(flagGeo, teamM); flag.position.set(-w / 2 - 0.4, 6.8, d / 2 + 0.4); g.add(flag); u.flag = flag;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.9, 16), M(0xa8562e)); drum.position.set(w / 2 - 1.2, 0.45, d / 2 + 1); g.add(drum);
    const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 18), gold); sign.rotation.x = Math.PI / 2; sign.position.set(0, 2.85, d / 2 + 0.08); g.add(sign);
  } else if (bd.kind === 'drillyard') {
    // A fenced yard with a small shed and training dummies.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M(0x8a7556)); ground.rotation.x = -Math.PI / 2; ground.position.y = 0.02; g.add(ground);
    for (const [x0, z0, x1, z1] of [[-w / 2, -d / 2, w / 2, -d / 2], [-w / 2, -d / 2, -w / 2, d / 2], [w / 2, -d / 2, w / 2, d / 2], [-w / 2, d / 2, -1.2, d / 2], [1.2, d / 2, w / 2, d / 2]]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, 0.15), wood); rail.position.set((x0 + x1) / 2, 0.9, (z0 + z1) / 2); rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(rail);
      for (let k = 0; k <= Math.floor(len / 1.6); k++) { const t = k / Math.max(1, Math.floor(len / 1.6)); box(0.18, 1.2, 0.18, dark, x0 + (x1 - x0) * t, 0.6, z0 + (z1 - z0) * t); }
    }
    box(w * 0.4, 2.4, d * 0.35, wood, -w * 0.25, 1.2, -d * 0.28);
    for (const x of [0.8, 2.4]) { box(0.15, 1.6, 0.15, dark, x, 0.8, 0.6); const dm = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.9, 8), M(0xd8c08a)); dm.position.set(x, 1.4, 0.6); g.add(dm); }
    const rack = box(1.6, 1.2, 0.2, dark, w / 2 - 1.2, 0.6, -d / 2 + 0.5); rack.material = dark;
  } else {
    // Sanctum: a round stone shrine with a floating crystal.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.55, 0.6, 20), stone); base.position.y = 0.3; g.add(base);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 3.2, 8), stone); c.position.set(Math.cos(a) * w * 0.4, 2.2, Math.sin(a) * w * 0.4); g.add(c); }
    const cap = new THREE.Mesh(new THREE.TorusGeometry(w * 0.4, 0.25, 6, 24), stone); cap.rotation.x = Math.PI / 2; cap.position.y = 3.8; g.add(cap);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: 0xc69cff, emissive: 0x6a3ad0, emissiveIntensity: 1.2, roughness: 0.2 }));
    crystal.position.y = 2.2; crystal.scale.set(1, 1.6, 1); g.add(crystal); u.spin = crystal;
    const glow = new THREE.PointLight(0xb08aff, 5, 10, 2); glow.position.y = 2.2; g.add(glow);
  }
  // Interaction ring on the ground in front of the door.
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.8, 40), new THREE.MeshBasicMaterial({ color: u.ringColor, transparent: true, opacity: 0.4, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.05, d / 2 + 2.6); g.add(ring);
  u.ring = ring;
  g.userData = u;
  return g;
}

function decorate(root, layout) {
  const r = rng(1234);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2, 6);
  const crownGeo = new THREE.ConeGeometry(1.8, 4.5, 7);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const N = 340;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }), N);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 1 }), N);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x7a776e, roughness: 1, flatShading: true }), 120);
  const o = new THREE.Object3D();
  const b = layout.bounds;
  const inField = (x, z) => layout.fields.some((f) => x > f.x0 - 5 && x < f.x1 + 5 && z > Math.min(f.zGate, f.zKeep) - 14 && z < Math.max(f.zGate, f.zKeep) + 14);
  let n = 0, tries = 0;
  const col = new THREE.Color();
  while (n < N && tries < 6000) {
    tries++;
    const x = b.x0 - 90 + r() * (b.x1 - b.x0 + 180), z = b.z0 - 70 + r() * (b.z1 - b.z0 + 140);
    if (inField(x, z)) continue;
    const s = 0.8 + r() * 0.9;
    o.position.set(x, s, z); o.scale.set(s, s, s); o.rotation.set(0, r() * 6, 0); o.updateMatrix();
    trunks.setMatrixAt(n, o.matrix);
    o.position.y = s * 2 + s * 2.2; o.updateMatrix(); crowns.setMatrixAt(n, o.matrix);
    col.setHSL(0.27 + r() * 0.08, 0.35 + r() * 0.2, 0.18 + r() * 0.1); crowns.setColorAt(n, col);
    n++;
  }
  trunks.count = crowns.count = n;
  let m = 0;
  while (m < 120) {
    const x = b.x0 - 60 + r() * (b.x1 - b.x0 + 120), z = b.z0 - 50 + r() * (b.z1 - b.z0 + 100);
    if (inField(x, z)) continue;
    const s = 0.4 + r() * 1.4;
    o.position.set(x, s * 0.3, z); o.scale.set(s, s * 0.7, s); o.rotation.set(r(), r() * 6, r()); o.updateMatrix();
    rocks.setMatrixAt(m++, o.matrix);
  }
  root.add(trunks, crowns, rocks);
}
