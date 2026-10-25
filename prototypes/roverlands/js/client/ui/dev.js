// The stand-in game for dev.html: a flat painted "world", a map picture made from noise, fake sites, and a pretend
// drive in a circle that feeds the HUD and the minimap — exactly the calls js/client/main.js makes on the real thing.
import { createUI } from './index.js';

const cv = document.getElementById('view'), g = cv.getContext('2d');
const SIZE = 1536;
const SITES = { home: { x: 0, z: 0, r: 22 }, flags: [{ id: 'f1', x: 420, z: -260, name: 'Red Rock Gap' }, { id: 'f2', x: -380, z: 300, name: 'Bog End' }, { id: 'f3', x: 120, z: 520, name: 'Frost Tarn' }],
  pads: [{ x: 6, z: 4, yaw: 0, vehicle: 'trail_jeep' }, { x: 12, z: 4, yaw: 0, vehicle: 'dirtbike' }, { x: 300, z: 300, yaw: 0, vehicle: 'trail_jeep' }],
  labels: [{ x: 420, z: -300, text: 'Red Rock Gap' }, { x: -380, z: 340, text: 'Bog End' }, { x: 0, z: 40, text: 'Home' }] };
const VEH = [{ id: 'trail_jeep', name: 'Trail Jeep', seats: [{}, {}, {}] }, { id: 'dirtbike', name: 'Dirtbike', seats: [{}, {}] }];
function mapImage(n = 512) {
  const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), img = x.createImageData(n, n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h = Math.sin(i * 0.031) * Math.cos(j * 0.027) + Math.sin((i + j) * 0.011) * 0.6 + Math.sin(i * 0.004 - j * 0.006) * 0.8, k = (j * n + i) * 4;
    const water = h < -0.9, high = h > 1.1;
    img.data[k] = water ? 50 : high ? 190 : 90 + h * 30; img.data[k + 1] = water ? 110 : high ? 180 : 130 + h * 20; img.data[k + 2] = water ? 170 : high ? 170 : 70; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.strokeStyle = '#c9b48a'; x.lineWidth = 3; x.beginPath(); x.moveTo(n / 2, n / 2); x.lineTo(n * 0.77, n * 0.33); x.moveTo(n / 2, n / 2); x.lineTo(n * 0.25, n * 0.7); x.stroke();
  return c;
}
let t0 = performance.now(), playing = null;
function paint() {
  const w = cv.width = innerWidth * Math.min(2, devicePixelRatio), h = cv.height = innerHeight * Math.min(2, devicePixelRatio);
  const t = (performance.now() - t0) / 1000;
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#87a9c0'); grd.addColorStop(0.55, '#c9d6c8'); grd.addColorStop(0.56, '#6f8a4a'); grd.addColorStop(1, '#3f5a2e');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2f4424'; for (let i = 0; i < 18; i++) { const x = ((i * 137 + t * (playing ? 60 : 8)) % (w + 200)) - 100; g.beginPath(); g.moveTo(x, h * 0.56); g.lineTo(x + 30, h * 0.4); g.lineTo(x + 60, h * 0.56); g.fill(); }
  requestAnimationFrame(paint);
}
paint();

const ui = createUI({
  canvas: cv, vehicles: VEH, defaultSeed: 7,
  prepare: async (seed, progress) => { for (let i = 1; i <= 4; i++) { progress(i / 4); await new Promise(r => setTimeout(r, 60)); } ui.setWorld({ size: SIZE, sites: SITES, mapImage: mapImage() }); return { sites: SITES, vehicles: VEH }; },
  onGame: (net, info) => { playing = { net, info, a: 0 }; window.devGame = playing; },
  onLeave: () => { playing = null; },
  getDebug: () => ({ stand: 'dev page', pos: playing ? [Math.cos(playing.a) * 60, 0, Math.sin(playing.a) * 60] : null }),
});
ui.setFlagSites(SITES.flags);
window.rlui = ui;
// the pretend drive: in a circle round home, sending poses like the real game
setInterval(() => {
  if (!playing || ui.blocking()) return;
  const p = playing; p.a += 0.02;
  const x = Math.cos(p.a) * 60, z = Math.sin(p.a) * 60, dir = [-Math.sin(p.a), Math.cos(p.a)];
  ui.markers({ you: { x, z, dir }, camDir: dir, players: [{ pid: 99, x: x + 30, z: z - 20 }], vehicles: [{ id: 1, kind: 'trail_jeep', x: 6, z: 4, dir: [0, -1] }, { id: 2, kind: 'dirtbike', x: x + 4, z: z + 3, dir }] });
  ui.hud.speed(42 + Math.sin(p.a * 3) * 8, '3');
  ui.hud.seatHint(Math.sin(p.a) > 0.6 ? 'E — get in Trail Jeep (driver)' : null);
  if (!p.info.spectate) p.net.send({ t: 'pos', me: { p: [x, 0, z], yaw: p.a } });
}, 50);
