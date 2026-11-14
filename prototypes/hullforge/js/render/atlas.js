// One texture atlas for every block face (4×4 tiles of 128 px), drawn once at load, plus a matching glow atlas
// (what lights up: windows, reactor cores, bridge glass, station lights). Face colour comes from vertex colours
// (paint × damage), so the atlas tiles are light grey detail that the colour multiplies.

import * as THREE from 'three';

export const TILE = {
  hull: 0, frame: 1, armor: 2, window: 3, reactor: 4, thruster: 5, gyro: 6, shield: 7,
  cargo: 8, targeting: 9, bridge: 10, turret: 11, rock: 12, ore: 13, station: 14, station_lit: 15, slope: 0,
};
const N = 4, S = 128;

function rnd(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

function bevel(c, x, y, light = 0.22, dark = 0.3, w = 7) {
  c.fillStyle = `rgba(255,255,255,${light})`; c.fillRect(x, y, S, w); c.fillRect(x, y, w, S);
  c.fillStyle = `rgba(0,0,0,${dark})`; c.fillRect(x, y + S - w, S, w); c.fillRect(x + S - w, y, w, S);
}
function rivets(c, x, y, inset = 14) {
  c.fillStyle = 'rgba(0,0,0,0.35)';
  for (const [a, b] of [[inset, inset], [S - inset, inset], [inset, S - inset], [S - inset, S - inset]]) { c.beginPath(); c.arc(x + a, y + b, 3.2, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.35)';
  for (const [a, b] of [[inset, inset], [S - inset, inset], [inset, S - inset], [S - inset, S - inset]]) { c.beginPath(); c.arc(x + a - 0.8, y + b - 0.8, 1.4, 0, 7); c.fill(); }
}
function noise(c, x, y, r, amt = 0.08, n = 260) {
  for (let i = 0; i < n; i++) { const v = r() < 0.5 ? 0 : 255; c.fillStyle = `rgba(${v},${v},${v},${amt * r()})`; c.fillRect(x + r() * S, y + r() * S, 2 + r() * 4, 2 + r() * 4); }
}

export function makeAtlases() {
  const base = document.createElement('canvas'); base.width = base.height = N * S;
  const glow = document.createElement('canvas'); glow.width = glow.height = N * S;
  const c = base.getContext('2d'), g = glow.getContext('2d');
  c.fillStyle = '#d8dde3'; c.fillRect(0, 0, N * S, N * S);
  g.fillStyle = '#000'; g.fillRect(0, 0, N * S, N * S);
  const r = rnd(7);
  const at = i => [(i % N) * S, Math.floor(i / N) * S];
  const tile = (i, fn) => { const [x, y] = at(i); c.save(); c.beginPath(); c.rect(x, y, S, S); c.clip(); g.save(); g.beginPath(); g.rect(x, y, S, S); g.clip(); fn(x, y); c.restore(); g.restore(); };

  tile(TILE.hull, (x, y) => {
    noise(c, x, y, r, 0.06);
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + S / 2, y + 10); c.lineTo(x + S / 2, y + S - 10); c.stroke();
    bevel(c, x, y); rivets(c, x, y);
  });
  tile(TILE.frame, (x, y) => {
    c.fillStyle = '#9aa1a8'; c.fillRect(x, y, S, S);
    c.fillStyle = '#d8dde3'; c.fillRect(x + 16, y + 16, S - 32, S - 32);
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 6; c.beginPath(); c.moveTo(x + 16, y + 16); c.lineTo(x + S - 16, y + S - 16); c.moveTo(x + S - 16, y + 16); c.lineTo(x + 16, y + S - 16); c.stroke();
    bevel(c, x, y, 0.25, 0.35, 5);
  });
  tile(TILE.armor, (x, y) => {
    c.fillStyle = '#c4c9cf'; c.fillRect(x, y, S, S); noise(c, x, y, r, 0.1, 400);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 12, y + 12, S - 24, 6); c.fillRect(x + 12, y + S - 18, S - 24, 6);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x + 12, y + 20, S - 24, 3);
    bevel(c, x, y, 0.3, 0.45, 11); rivets(c, x, y, 22);
  });
  tile(TILE.window, (x, y) => {
    c.fillStyle = '#3a4048'; c.fillRect(x, y, S, S);
    c.fillStyle = '#1b2a36'; c.fillRect(x + 14, y + 14, S - 28, S - 28);
    g.fillStyle = '#5cb8e8'; g.fillRect(x + 14, y + 14, S - 28, S - 28);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x + 20, y + 20); g.lineTo(x + 60, y + 20); g.lineTo(x + 20, y + 60); g.fill();
    bevel(c, x, y, 0.2, 0.4, 6);
  });
  tile(TILE.reactor, (x, y) => {
    c.fillStyle = '#9ba4ae'; c.fillRect(x, y, S, S);
    c.fillStyle = '#2c2f33'; c.beginPath(); c.arc(x + S / 2, y + S / 2, 40, 0, 7); c.fill();
    const gr = g.createRadialGradient(x + S / 2, y + S / 2, 4, x + S / 2, y + S / 2, 36); gr.addColorStop(0, '#fff2c0'); gr.addColorStop(0.5, '#ffaa33'); gr.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x + S / 2, y + S / 2, 36, 0, 7); g.fill();
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 5; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.beginPath(); c.moveTo(x + S / 2 + Math.cos(a) * 42, y + S / 2 + Math.sin(a) * 42); c.lineTo(x + S / 2 + Math.cos(a) * 58, y + S / 2 + Math.sin(a) * 58); c.stroke(); }
    bevel(c, x, y);
  });
  tile(TILE.thruster, (x, y) => {
    c.fillStyle = '#8a9099'; c.fillRect(x, y, S, S);
    c.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 5; i++) c.fillRect(x + 14, y + 18 + i * 20, S - 28, 8);
    bevel(c, x, y);
  });
  tile(TILE.gyro, (x, y) => {
    c.fillStyle = '#b3a78f'; c.fillRect(x, y, S, S);
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 8; c.beginPath(); c.arc(x + S / 2, y + S / 2, 38, 0, 7); c.stroke();
    c.lineWidth = 5; c.beginPath(); c.ellipse(x + S / 2, y + S / 2, 38, 14, 0.6, 0, 7); c.stroke();
    g.fillStyle = '#ffcf5a'; g.beginPath(); g.arc(x + S / 2, y + S / 2, 7, 0, 7); g.fill();
    bevel(c, x, y);
  });
  tile(TILE.shield, (x, y) => {
    c.fillStyle = '#9fb4c6'; c.fillRect(x, y, S, S);
    c.fillStyle = '#26323d'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { c.beginPath(); c.arc(x + 32 + i * 32, y + 32 + j * 32, 11, 0, 7); c.fill(); }
    g.fillStyle = '#56c8ff'; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(x + 32 + i * 32, y + 32 + j * 32, 6, 0, 7); g.fill(); }
    bevel(c, x, y);
  });
  tile(TILE.cargo, (x, y) => {
    c.fillStyle = '#c9b48e'; c.fillRect(x, y, S, S);
    c.fillStyle = 'rgba(0,0,0,0.28)'; for (let i = 0; i < 6; i++) c.fillRect(x + 8 + i * 20, y + 8, 6, S - 16);
    c.fillStyle = '#2d2a26'; c.fillRect(x, y + S / 2 - 8, S, 16); c.fillStyle = '#e0b43a'; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(x + i * 18, y + S / 2 - 8); c.lineTo(x + i * 18 + 9, y + S / 2 - 8); c.lineTo(x + i * 18 + 1, y + S / 2 + 8); c.lineTo(x + i * 18 - 8, y + S / 2 + 8); c.fill(); }
    bevel(c, x, y);
  });
  tile(TILE.targeting, (x, y) => {
    c.fillStyle = '#93b0a6'; c.fillRect(x, y, S, S);
    c.fillStyle = '#1d2a26'; c.fillRect(x + 20, y + 20, S - 40, S - 40);
    g.strokeStyle = '#6dffb8'; g.lineWidth = 3; g.beginPath(); g.arc(x + S / 2, y + S / 2, 26, 0, 7); g.moveTo(x + S / 2 - 34, y + S / 2); g.lineTo(x + S / 2 + 34, y + S / 2); g.moveTo(x + S / 2, y + S / 2 - 34); g.lineTo(x + S / 2, y + S / 2 + 34); g.stroke();
    bevel(c, x, y);
  });
  tile(TILE.bridge, (x, y) => {
    c.fillStyle = '#dfe5ec'; c.fillRect(x, y, S, S); noise(c, x, y, r, 0.05);
    c.fillStyle = '#18242e'; c.fillRect(x + 10, y + 34, S - 20, 30);
    g.fillStyle = '#7fd6ff'; g.fillRect(x + 12, y + 36, S - 24, 26);
    g.fillStyle = '#ff5050'; g.fillRect(x + 14, y + S - 22, 10, 10); g.fillStyle = '#50ff8a'; g.fillRect(x + S - 24, y + S - 22, 10, 10);
    bevel(c, x, y); rivets(c, x, y, 12);
  });
  tile(TILE.turret, (x, y) => {
    c.fillStyle = '#a6adb5'; c.fillRect(x, y, S, S);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 6; c.strokeRect(x + 18, y + 18, S - 36, S - 36);
    c.fillStyle = '#e0b43a'; c.fillRect(x + 6, y + 6, 18, 6); c.fillRect(x + S - 24, y + S - 12, 18, 6);
    bevel(c, x, y);
  });
  tile(TILE.rock, (x, y) => {
    c.fillStyle = '#c8c0b8'; c.fillRect(x, y, S, S);
    for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`; c.beginPath(); c.arc(x + r() * S, y + r() * S, 6 + r() * 18, 0, 7); c.fill(); }
    for (let i = 0; i < 16; i++) { c.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.1})`; c.beginPath(); c.arc(x + r() * S, y + r() * S, 4 + r() * 10, 0, 7); c.fill(); }
  });
  tile(TILE.ore, (x, y) => {
    c.fillStyle = '#c8c0b8'; c.fillRect(x, y, S, S);
    for (let i = 0; i < 20; i++) { c.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`; c.beginPath(); c.arc(x + r() * S, y + r() * S, 6 + r() * 16, 0, 7); c.fill(); }
    // crystals glow in the ore's own colour (set per block through the vertex colour × white glow → tinted below)
    for (let i = 0; i < 7; i++) {
      const cx = x + 16 + r() * (S - 32), cy = y + 16 + r() * (S - 32), s = 6 + r() * 9;
      c.fillStyle = '#ffffff'; g.fillStyle = 'rgba(255,255,255,0.55)';
      for (const ctx of [c, g]) { ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.7, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s * 0.7, cy); ctx.fill(); }
    }
  });
  tile(TILE.station, (x, y) => {
    c.fillStyle = '#c3c8cf'; c.fillRect(x, y, S, S); noise(c, x, y, r, 0.07);
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(x, y + S / 2 - 2, S, 4); c.fillRect(x + S / 2 - 2, y, 4, S);
    bevel(c, x, y, 0.18, 0.28, 5);
  });
  tile(TILE.station_lit, (x, y) => {
    c.fillStyle = '#8c939b'; c.fillRect(x, y, S, S);
    for (let i = 0; i < 3; i++) { c.fillStyle = '#20262c'; c.fillRect(x + 14 + i * 36, y + 20, 26, S - 40); g.fillStyle = '#ffffff'; g.fillRect(x + 16 + i * 36, y + 22, 22, S - 44); }
    bevel(c, x, y, 0.18, 0.28, 5);
  });

  const mk = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
  return { map: mk(base), glow: mk(glow) };
}

/** UV rectangle [u0, v0, u1, v1] of a tile (with a small inset so mip-maps don't bleed). */
export function tileUV(i) {
  const pad = 2 / (N * S);
  const u0 = (i % N) / N + pad, v1 = 1 - Math.floor(i / N) / N - pad;
  return [u0, v1 - 1 / N + 2 * pad, u0 + 1 / N - 2 * pad, v1];
}
