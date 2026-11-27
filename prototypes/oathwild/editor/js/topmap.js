// The map from above: the whole world as a picture (biomes, water, roads, bridges, places), with the camera, Claude's
// last spot, the note pins and the effect zones on it. Click / tap to fly there. Redrawn after every world change.
//
//   const map = createTopMap(host, { getT, onJump })   map.draw()   map.marks({ cam, marker, notes, zones })
import { BIOMES, BIOME_COLOUR } from '../../js/world/terrain.js';

export function createTopMap(host, { getT, onJump }) {
  const wrap = document.createElement('div');
  wrap.className = 'ed-map';
  wrap.innerHTML = '<canvas class="ed-map-base"></canvas><canvas class="ed-map-marks"></canvas>';
  host.append(wrap);
  const base = wrap.children[0], top = wrap.children[1];
  let scale = 1, B = null;
  const toPx = (x, z) => [(x - B.minX) * scale, (z - B.minZ) * scale];
  function draw() {
    const T = getT(); B = T.bounds;
    const W = B.maxX - B.minX, H = B.maxZ - B.minZ, px = 1;      // 1 px per metre (1200 × 800)
    scale = px;
    for (const c of [base, top]) { c.width = W * px; c.height = H * px; }
    const g = base.getContext('2d'), img = g.createImageData(W, H), bg = T.biomeGrid;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const i = Math.min(bg.nx - 1, Math.floor(x / bg.cell)), k = Math.min(bg.nz - 1, Math.floor(z / bg.cell));
      const c = BIOME_COLOUR[BIOMES[bg.ids[k * bg.nx + i]]] || [90, 90, 90];
      // a little hill shade so the shape of the land reads
      const wx = B.minX + x, wz = B.minZ + z, sh = (T.heightAt(wx - 2, wz - 2) - T.heightAt(wx + 2, wz + 2)) * 6;
      const o = (z * W + x) * 4;
      img.data[o] = c[0] + sh; img.data[o + 1] = c[1] + sh; img.data[o + 2] = c[2] + sh; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.lineCap = 'round';
    for (const r of T.rivers) { g.strokeStyle = 'rgb(64,128,196)'; g.lineWidth = r.width * px; line(g, r.pts); }
    for (const r of T.roads) { g.strokeStyle = r.town ? 'rgba(214,190,150,.95)' : 'rgba(232,210,160,.95)'; g.lineWidth = Math.max(2, r.width * px * 0.7); line(g, r.pts); }
    for (const b of T.bridges) { g.strokeStyle = b.kind === 'ford' ? '#9fd0ff' : '#6b4524'; g.lineWidth = b.width * px; g.beginPath(); g.moveTo(...toPx(...b.a)); g.lineTo(...toPx(...b.b)); g.stroke(); }
    g.font = '600 15px "Alegreya Sans", sans-serif'; g.textAlign = 'center';
    for (const p of Object.values(T.places)) {
      if (!['town', 'camp', 'shrine', 'landmark'].includes(p.kind)) continue;
      const [x, z] = toPx(...p.at);
      g.fillStyle = 'rgba(20,16,10,.75)'; g.fillText(p.name, x + 1, z + 1); g.fillStyle = '#fff6df'; g.fillText(p.name, x, z);
    }
  }
  function line(g, pts) { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...toPx(p.x, p.z)) : g.moveTo(...toPx(p.x, p.z)))); g.stroke(); }
  function marks({ cam, marker, notes = [], zones = [] }) {
    if (!B) return;
    const g = top.getContext('2d');
    g.clearRect(0, 0, top.width, top.height);
    for (const z of zones) { const [x, y] = toPx(...z.at); g.strokeStyle = 'rgba(190,150,255,.9)'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.arc(x, y, z.r * scale, 0, 7); g.stroke(); g.setLineDash([]); }
    for (const n of notes) { const [x, y] = toPx(...n.at); g.fillStyle = n.done ? '#62d26f' : '#ffb347'; g.strokeStyle = '#1b130a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.stroke(); }
    if (marker?.at) { const [x, y] = toPx(...marker.at); g.strokeStyle = '#6fd3ff'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 12, 0, 7); g.stroke(); g.beginPath(); g.arc(x, y, 3, 0, 7); g.fillStyle = '#6fd3ff'; g.fill(); }
    if (cam) {
      const [x, y] = toPx(cam.x, cam.z);
      g.save(); g.translate(x, y); g.rotate(-cam.yaw + Math.PI);
      g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 14); g.lineTo(9, -9); g.lineTo(0, -4); g.lineTo(-9, -9); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  }
  wrap.addEventListener('click', e => {
    if (!B) return;
    const r = top.getBoundingClientRect();
    const x = B.minX + (e.clientX - r.left) / r.width * (B.maxX - B.minX), z = B.minZ + (e.clientY - r.top) / r.height * (B.maxZ - B.minZ);
    onJump(x, z);
  });
  return { el: wrap, draw, marks };
}
