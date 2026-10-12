// Written shop signs (play-test 2, Q10 + B's town-offices.json `label`): every office's name on the board over its
// door — "Smithy", "Apothecary", "The Wheel and Wether". All the names of one zone are painted into ONE canvas (a row
// each) and every board is a quad in ONE merged geometry reading its row: one draw call for a whole town's signs.
//
//   const m = buildSignBoards([{ text, x, y, z, yaw, w, h }])   // world metres; (x, y, z) = the board face's centre
//   group.add(m.mesh); … m.dispose()

import * as THREE from 'three';

const ROW_W = 512, ROW_H = 64, MAX_ROWS = 48;

/** Pure: the quad corners of a board facing `yaw` (its front looks along (sin yaw, cos yaw)). Exported for tests. */
export function boardCorners({ x, y, z, yaw = 0, w = 2, h = 0.5 }) {
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);        // the board's right-hand direction seen from the street
  const hw = w / 2, hh = h / 2;
  return [[x - rx * hw, y - hh, z - rz * hw], [x + rx * hw, y - hh, z + rz * hw], [x + rx * hw, y + hh, z + rz * hw], [x - rx * hw, y + hh, z - rz * hw]];
}

export function buildSignBoards(signs, { font = '600 40px "Cinzel", Georgia, serif', ink = '#f0dfb0', board = '#3a2a1c' } = {}) {
  const list = signs.filter(s => s && s.text).slice(0, MAX_ROWS);
  if (!list.length || typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = ROW_W; c.height = ROW_H * list.length;
  const g = c.getContext('2d');
  list.forEach((s, i) => {
    const y0 = i * ROW_H;
    g.fillStyle = s.board || board; g.fillRect(0, y0, ROW_W, ROW_H);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4; g.strokeRect(3, y0 + 3, ROW_W - 6, ROW_H - 6);
    g.fillStyle = s.ink || ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 40; g.font = font.replace('40px', size + 'px');
    while (g.measureText(s.text).width > ROW_W - 30 && size > 16) { size -= 2; g.font = font.replace('40px', size + 'px'); }
    g.fillText(s.text, ROW_W / 2, y0 + ROW_H / 2 + 2);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const pos = [], uv = [], idx = [];
  list.forEach((s, i) => {
    // the board's aspect: a long name gets a longer board, never wider than the wall allows
    const k = boardCorners(s), v0 = 1 - (i + 1) / list.length, v1 = 1 - i / list.length, b = i * 4;
    for (const p of k) pos.push(...p);
    uv.push(0, v0, 1, v0, 1, v1, 0, v1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12 });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'sign-boards'; mesh.userData.labels = list.map(s => s.text);
  return { mesh, labels: list.map(s => s.text), setNight(n) { mat.emissiveIntensity = 0.12 + 0.25 * n; }, dispose() { geo.dispose(); mat.dispose(); tex.dispose(); } };
}
