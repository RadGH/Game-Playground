// A little weather sign over a head (PLAN M1: "stand-ins must show mood at a distance"): one instanced quad per person, one
// draw call, always facing the camera and always the same size on the screen, so you can read a street's mood from up high.
import { MOODS } from './mood.js';

const CELL = 64, EXTRA = 6, ICONS = MOODS.length + 1 + EXTRA;
/** Signs that say more than a mood. */
export const SIGN = { HEART: MOODS.length + 1, BOLT: MOODS.length + 2, ZZZ: MOODS.length + 3, SNOW: MOODS.length + 4, MUTE: MOODS.length + 5, GLOW: MOODS.length + 6 };

function drawAtlas() {
  const c = document.createElement('canvas'); c.width = CELL * ICONS; c.height = CELL;
  const x = c.getContext('2d');
  const cloud = (cx, cy, s, fill) => { x.fillStyle = fill; x.strokeStyle = 'rgba(30,40,50,0.75)'; x.lineWidth = 3; x.beginPath(); x.arc(cx - 12 * s, cy + 2 * s, 9 * s, 0, 7); x.arc(cx, cy - 5 * s, 12 * s, 0, 7); x.arc(cx + 12 * s, cy + 2 * s, 9 * s, 0, 7); x.stroke(); x.fill(); x.fillRect(cx - 14 * s, cy, 28 * s, 10 * s); };
  const sun = (cx, cy, r) => { x.fillStyle = '#ffc93c'; x.strokeStyle = 'rgba(120,70,0,0.8)'; x.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 1.2); x.lineTo(cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r * 1.6); x.stroke(); } x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); x.fill(); };
  const rain = (cx, cy) => { x.strokeStyle = '#2f7fd6'; x.lineWidth = 4; x.lineCap = 'round'; for (const d of [-10, 2, 14]) { x.beginPath(); x.moveTo(cx + d, cy); x.lineTo(cx + d - 4, cy + 12); x.stroke(); } };
  sun(32, 32, 15);
  sun(22 + CELL, 24, 11); cloud(38 + CELL, 38, 0.8, '#f4f6f8');
  cloud(32 + CELL * 2, 32, 1.05, '#c9d2da');
  cloud(32 + CELL * 3, 24, 1, '#8c99a6'); rain(32 + CELL * 3, 42);
  cloud(32 + CELL * 4, 22, 1, '#55606c');
  x.fillStyle = '#ffd23c'; x.strokeStyle = '#2a2a2a'; x.lineWidth = 2; x.beginPath(); const b = CELL * 4; x.moveTo(b + 36, 28); x.lineTo(b + 24, 46); x.lineTo(b + 32, 46); x.lineTo(b + 26, 62); x.lineTo(b + 44, 40); x.lineTo(b + 35, 40); x.closePath(); x.stroke(); x.fill();
  // the last cell: a house, for your own household
  const h = CELL * 5; x.fillStyle = '#e8a93c'; x.strokeStyle = '#1c2730'; x.lineWidth = 4; x.beginPath(); x.moveTo(h + 32, 8); x.lineTo(h + 56, 30); x.lineTo(h + 48, 30); x.lineTo(h + 48, 54); x.lineTo(h + 16, 54); x.lineTo(h + 16, 30); x.lineTo(h + 8, 30); x.closePath(); x.stroke(); x.fill();
  // hearts: in love
  const heart = (cx, cy, s, fill) => { x.fillStyle = fill; x.strokeStyle = 'rgba(90,10,30,0.85)'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx, cy + 12 * s); x.bezierCurveTo(cx - 20 * s, cy - 2 * s, cx - 10 * s, cy - 16 * s, cx, cy - 6 * s); x.bezierCurveTo(cx + 10 * s, cy - 16 * s, cx + 20 * s, cy - 2 * s, cx, cy + 12 * s); x.closePath(); x.stroke(); x.fill(); };
  const at = i => CELL * i;
  heart(at(SIGN.HEART) + 26, 36, 1.05, '#f0506e'); heart(at(SIGN.HEART) + 46, 18, 0.55, '#ff9ab0');
  // a red bolt: a feud on
  x.fillStyle = '#e8352c'; x.strokeStyle = '#2a0a08'; x.lineWidth = 4; { const b2 = at(SIGN.BOLT); x.beginPath(); x.moveTo(b2 + 38, 4); x.lineTo(b2 + 14, 36); x.lineTo(b2 + 28, 36); x.lineTo(b2 + 20, 60); x.lineTo(b2 + 50, 26); x.lineTo(b2 + 34, 26); x.closePath(); x.stroke(); x.fill(); }
  // worn out, lonely, hushed, glowing
  x.font = 'bold 24px sans-serif'; x.textAlign = 'center'; x.lineWidth = 4; x.strokeStyle = 'rgba(20,30,50,0.8)'; x.fillStyle = '#dfe9f7'; { const z = at(SIGN.ZZZ); x.strokeText('Z', z + 18, 54); x.fillText('Z', z + 18, 54); x.font = 'bold 32px sans-serif'; x.strokeText('Z', z + 38, 34); x.fillText('Z', z + 38, 34); }
  cloud(at(SIGN.SNOW) + 32, 22, 1, '#d8e6f2'); x.fillStyle = '#ffffff'; x.strokeStyle = '#5f8cb0'; x.lineWidth = 2; for (const d of [-12, 2, 14]) { x.beginPath(); x.arc(at(SIGN.SNOW) + 32 + d, 46 + (d % 4), 4, 0, 7); x.stroke(); x.fill(); }
  { const m = at(SIGN.MUTE); x.strokeStyle = '#2a2a2a'; x.lineWidth = 5; x.fillStyle = '#fff3c9'; x.beginPath(); x.ellipse(m + 32, 30, 22, 17, 0, 0, 7); x.stroke(); x.fill(); x.lineWidth = 6; x.strokeStyle = '#c2493d'; x.beginPath(); x.moveTo(m + 12, 50); x.lineTo(m + 52, 10); x.stroke(); }
  { const g = at(SIGN.GLOW); x.fillStyle = '#ffe680'; x.strokeStyle = 'rgba(150,100,0,0.8)'; x.lineWidth = 2; for (const [dx, dy, r] of [[32, 30, 20], [14, 12, 9], [50, 50, 8]]) { x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, l = i % 2 ? r * 0.32 : r; x[i ? 'lineTo' : 'moveTo'](g + dx + Math.cos(a) * l, dy + Math.sin(a) * l); } x.closePath(); x.stroke(); x.fill(); } }
  return c;
}

export function createMoodMarks({ THREE, cap }) {
  const tex = new THREE.CanvasTexture(drawAtlas()); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const geo = new THREE.PlaneGeometry(1, 1);
  const iData = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2); iData.setUsage(THREE.DynamicDrawUsage);   // icon, size
  geo.setAttribute('iData', iData);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, uniforms: { map: { value: tex }, cells: { value: ICONS } },
    vertexShader: `attribute vec2 iData; varying vec2 vUv; uniform float cells;
      void main() { vUv = vec2((uv.x + iData.x) / cells, uv.y);
        vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        c.xy += position.xy * iData.y; c.y += iData.y * 0.55; gl_Position = projectionMatrix * c; }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv;
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.08) discard;
        gl_FragColor = t;
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 5; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.name = 'mood-marks';
  const m4 = new THREE.Matrix4();
  return {
    mesh, HOME: MOODS.length,
    set(i, x, y, z, icon, size) { m4.makeTranslation(x, y, z); mesh.setMatrixAt(i, m4); iData.setXY(i, icon, size); },
    commit(n) { mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.needsUpdate = true; iData.needsUpdate = true; },
  };
}
