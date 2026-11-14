// Turret models (owner 2026-11-14: "make weapon turrets look different and move around").
// Every turret is base → yaw (turns about the mount face's normal) → pitch (raises the guns) → barrels, built from
// three.js primitives, and each kind has its own moving parts:
//   autocannon  boxy housing, twin barrels that kick back one after the other
//   gatling     drum + six barrels that spin up while firing and wind down after
//   laser       hex emitter with three focusing rings that light up, lens flare at the tip
//   railgun     two long rails with coils that fill with blue light as it charges; the slide slams back
//   flak        squat armoured box, four short barrels firing in turn, a radar fin that never stops turning
//   missile     tube box with hatch doors that open when it has a target; the tube caps flash on launch
//   plasma      glass bulb of green plasma that pulses, ribbed barrel, swells before each shot
//   mining      striped arm, crystal emitter, rings that spin around the beam while cutting
// The sim decides where each turret points (t.yaw / t.pitch, turn-rate limited, idle sweeps); this file only draws.

import * as THREE from 'three';
import { RARITY } from '../data/blocks.js';

const M = {};
function mats() {
  if (M.dark) return M;
  M.dark = new THREE.MeshStandardMaterial({ color: 0x2f343b, metalness: 0.7, roughness: 0.45 });
  M.mid = new THREE.MeshStandardMaterial({ color: 0x6b737d, metalness: 0.65, roughness: 0.4 });
  M.light = new THREE.MeshStandardMaterial({ color: 0xaeb6bf, metalness: 0.55, roughness: 0.38 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x0d0f12, metalness: 0.3, roughness: 0.8 });
  M.yellow = new THREE.MeshStandardMaterial({ color: 0xd8a521, metalness: 0.3, roughness: 0.5 });
  M.olive = new THREE.MeshStandardMaterial({ color: 0x5d6648, metalness: 0.45, roughness: 0.55 });
  M.rust = new THREE.MeshStandardMaterial({ color: 0x6d5642, metalness: 0.45, roughness: 0.6 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x0b2a12, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.55 });
  return M;
}
const glowMat = hex => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex), toneMapped: false });
const rarityMats = new Map();
function rarityMat(r) {
  if (!rarityMats.has(r)) rarityMats.set(r, new THREE.MeshStandardMaterial({ color: new THREE.Color(RARITY[r].color), emissive: new THREE.Color(RARITY[r].color), emissiveIntensity: r >= 2 ? 0.6 : 0.15, metalness: 0.4, roughness: 0.4 }));
  return rarityMats.get(r);
}

// shared geometries (made once)
const G = {};
function geos() {
  if (G.box) return G;
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.cyl = new THREE.CylinderGeometry(1, 1, 1, 14);       // along Y
  G.cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6);
  G.cone = new THREE.CylinderGeometry(0.55, 1, 1, 14);
  G.sphere = new THREE.SphereGeometry(1, 16, 12);
  G.torus = new THREE.TorusGeometry(1, 0.16, 8, 20);
  G.octa = new THREE.OctahedronGeometry(1);
  for (const g of [G.cyl, G.cyl6, G.cone]) g.rotateX(Math.PI / 2);   // along Z
  return G;
}
function mesh(geo, mat, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m;
}

/**
 * @param {string} kind turret id
 * @param {{tier?:number, rarity?:number, glow?:string}} opts
 */
export function buildTurret(kind, opts = {}) {
  mats(); geos();
  const tier = opts.tier || 1, rarity = opts.rarity || 0;
  const root = new THREE.Group(); root.name = 'turret-' + kind;
  const scale = 0.92 + (tier - 1) * 0.11;
  const body = new THREE.Group(); body.scale.setScalar(scale); root.add(body);
  const yaw = new THREE.Group(); const pitch = new THREE.Group();
  const T = { kind, root, yaw, pitch, muzzles: [], barrels: [], glows: [], anim: {}, recoil: [], fireIx: 0, spin: 0 };
  // base plate on the block face (y = 0 is the face), with a rarity band
  body.add(mesh(G.cyl, M.dark, 0.44, 0.44, 0.1, 0, 0.05, 0).rotateX(Math.PI / 2));
  body.add(mesh(G.torus, rarityMat(rarity), 0.42, 0.42, 0.35, 0, 0.1, 0).rotateX(Math.PI / 2));
  body.add(yaw); yaw.position.y = 0.12;
  const muzzle = (x, y, z, parent = pitch) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); T.muzzles.push(o); return o; };
  const glow = (geo, hex, sx, sy, sz, x, y, z, parent = pitch) => { const m = mesh(geo, glowMat(hex), sx, sy, sz, x, y, z); parent.add(m); T.glows.push(m); return m; };

  switch (kind) {
    case 'autocannon': {
      yaw.add(mesh(G.cyl, M.mid, 0.3, 0.3, 0.16, 0, 0.08, 0).rotateX(Math.PI / 2));
      yaw.add(pitch); pitch.position.y = 0.28;
      pitch.add(mesh(G.box, M.mid, 0.62, 0.32, 0.58, 0, 0, -0.02));
      pitch.add(mesh(G.box, M.light, 0.5, 0.06, 0.4, 0, 0.18, -0.05));
      pitch.add(mesh(G.box, M.dark, 0.64, 0.2, 0.14, 0, -0.02, 0.3));   // mantlet
      for (const sx of [-0.15, 0.15]) {
        const br = new THREE.Group(); br.position.set(sx, 0, 0.3); pitch.add(br);
        br.add(mesh(G.cyl, M.dark, 0.05, 0.05, 0.85, 0, 0, 0.42));
        br.add(mesh(G.cyl, M.mid, 0.075, 0.075, 0.14, 0, 0, 0.84));
        T.barrels.push(br); T.recoil.push(0); muzzle(sx, 0, 1.2);
      }
      break;
    }
    case 'gatling': {
      yaw.add(mesh(G.box, M.mid, 0.34, 0.3, 0.34, 0, 0.12, 0));
      yaw.add(pitch); pitch.position.y = 0.34;
      pitch.add(mesh(G.cyl, M.dark, 0.24, 0.24, 0.42, 0, 0, -0.05));
      pitch.add(mesh(G.box, M.yellow, 0.18, 0.22, 0.3, 0.3, -0.02, -0.08));  // ammo box
      pitch.add(mesh(G.box, M.black, 0.14, 0.05, 0.05, 0.22, 0.04, 0.0));   // feed
      const spinner = new THREE.Group(); spinner.position.z = 0.18; pitch.add(spinner); T.anim.spinner = spinner;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; spinner.add(mesh(G.cyl, M.dark, 0.032, 0.032, 0.9, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.45)); }
      spinner.add(mesh(G.cyl, M.light, 0.16, 0.16, 0.05, 0, 0, 0.3));
      spinner.add(mesh(G.cyl, M.light, 0.16, 0.16, 0.05, 0, 0, 0.82));
      spinner.add(mesh(G.cyl, M.mid, 0.05, 0.05, 0.9, 0, 0, 0.45));
      muzzle(0, 0, 1.0);
      break;
    }
    case 'laser': {
      yaw.add(mesh(G.cyl6, M.light, 0.22, 0.22, 0.2, 0, 0.1, 0).rotateX(Math.PI / 2));
      yaw.add(mesh(G.box, M.light, 0.08, 0.36, 0.2, -0.2, 0.26, 0)); yaw.add(mesh(G.box, M.light, 0.08, 0.36, 0.2, 0.2, 0.26, 0));
      yaw.add(pitch); pitch.position.y = 0.34;
      pitch.add(mesh(G.cyl6, M.light, 0.16, 0.16, 0.5, 0, 0, 0.05));
      pitch.add(mesh(G.cone, M.mid, 0.11, 0.11, 0.55, 0, 0, 0.55));
      for (let i = 0; i < 3; i++) glow(G.torus, opts.glow || '#5fe3ff', 0.13 - i * 0.015, 0.13 - i * 0.015, 0.5, 0, 0, 0.36 + i * 0.17);
      glow(G.sphere, '#d9fbff', 0.065, 0.065, 0.065, 0, 0, 0.86);
      pitch.add(mesh(G.box, M.dark, 0.05, 0.05, 0.4, 0, 0.17, 0.1));
      muzzle(0, 0, 0.9);
      break;
    }
    case 'railgun': {
      yaw.add(mesh(G.box, M.mid, 0.62, 0.16, 0.6, 0, 0.08, 0));
      yaw.add(mesh(G.box, M.dark, 0.1, 0.34, 0.3, -0.26, 0.3, 0)); yaw.add(mesh(G.box, M.dark, 0.1, 0.34, 0.3, 0.26, 0.3, 0));
      yaw.add(pitch); pitch.position.y = 0.36;
      pitch.add(mesh(G.box, M.mid, 0.38, 0.26, 0.5, 0, 0, -0.12));
      const slide = new THREE.Group(); pitch.add(slide); T.barrels.push(slide); T.recoil.push(0);
      for (const sx of [-0.09, 0.09]) slide.add(mesh(G.box, M.light, 0.07, 0.15, 1.7, sx, 0, 0.85));
      slide.add(mesh(G.box, M.dark, 0.11, 0.05, 1.5, 0, -0.06, 0.75));
      for (let i = 0; i < 4; i++) { const c = glow(G.torus, opts.glow || '#6fb6ff', 0.17, 0.17, 0.6, 0, 0, 0.35 + i * 0.36, slide); c.userData.coil = i; }
      muzzle(0, 0, 1.75);
      break;
    }
    case 'flak': {
      yaw.add(mesh(G.box, M.olive, 0.66, 0.3, 0.6, 0, 0.15, 0));
      yaw.add(mesh(G.box, M.olive, 0.5, 0.12, 0.38, 0, 0.36, -0.05));
      const fin = new THREE.Group(); fin.position.set(-0.18, 0.44, -0.18); yaw.add(fin); T.anim.fin = fin;
      fin.add(mesh(G.cyl, M.dark, 0.03, 0.03, 0.12, 0, 0.06, 0).rotateX(Math.PI / 2));
      fin.add(mesh(G.box, M.light, 0.3, 0.12, 0.03, 0, 0.14, 0));
      yaw.add(pitch); pitch.position.set(0, 0.26, 0.22);
      pitch.add(mesh(G.box, M.dark, 0.36, 0.3, 0.16, 0, 0, 0));
      for (const [sx, sy] of [[-0.09, 0.07], [0.09, 0.07], [-0.09, -0.07], [0.09, -0.07]]) {
        const br = new THREE.Group(); br.position.set(sx, sy, 0.05); pitch.add(br);
        br.add(mesh(G.cyl, M.dark, 0.055, 0.055, 0.55, 0, 0, 0.27)); br.add(mesh(G.cyl, M.black, 0.035, 0.035, 0.02, 0, 0, 0.555));
        T.barrels.push(br); T.recoil.push(0); muzzle(sx, sy, 0.62);
      }
      break;
    }
    case 'missile': {
      yaw.add(mesh(G.cyl, M.rust, 0.12, 0.12, 0.3, 0, 0.15, 0).rotateX(Math.PI / 2));
      yaw.add(pitch); pitch.position.y = 0.42;
      pitch.add(mesh(G.box, M.rust, 0.72, 0.46, 0.66, 0, 0, 0));
      pitch.add(mesh(G.box, M.dark, 0.74, 0.08, 0.68, 0, -0.2, 0));
      let i = 0;
      for (const sy of [0.1, -0.08]) for (const sx of [-0.22, 0, 0.22]) {
        pitch.add(mesh(G.cyl, M.black, 0.08, 0.08, 0.04, sx, sy, 0.32));
        glow(G.cyl, opts.glow || '#ff6a4a', 0.05, 0.05, 0.02, sx, sy, 0.34).userData.tube = i++;
        muzzle(sx, sy, 0.38);
      }
      // hatch doors on top: open when the pod has a target
      for (const sx of [-1, 1]) {
        const hinge = new THREE.Group(); hinge.position.set(sx * 0.36, 0.23, 0); pitch.add(hinge);
        hinge.add(mesh(G.box, M.mid, 0.36, 0.04, 0.64, -sx * 0.18, 0.02, 0));
        (T.anim.doors ||= []).push({ hinge, side: sx });
      }
      break;
    }
    case 'plasma': {
      yaw.add(mesh(G.sphere, M.olive, 0.32, 0.22, 0.32, 0, 0.12, 0));
      yaw.add(pitch); pitch.position.y = 0.32;
      pitch.add(mesh(G.cyl, M.dark, 0.17, 0.17, 0.3, 0, 0, -0.12));
      const bulb = glow(G.sphere, opts.glow || '#8dff6a', 0.15, 0.15, 0.15, 0, 0, 0.12); T.anim.bulb = bulb;
      pitch.add(mesh(G.sphere, M.glass, 0.21, 0.21, 0.21, 0, 0, 0.12));
      pitch.add(mesh(G.cone, M.mid, 0.13, 0.13, 0.5, 0, 0, 0.5));
      for (let i = 0; i < 3; i++) pitch.add(mesh(G.torus, M.dark, 0.14 - i * 0.012, 0.14 - i * 0.012, 0.8, 0, 0, 0.36 + i * 0.13));
      glow(G.cyl, opts.glow || '#8dff6a', 0.07, 0.07, 0.03, 0, 0, 0.76);
      muzzle(0, 0, 0.8);
      break;
    }
    case 'mining': default: {
      yaw.add(mesh(G.box, M.yellow, 0.24, 0.34, 0.24, 0, 0.17, 0));
      yaw.add(mesh(G.box, M.black, 0.25, 0.06, 0.25, 0, 0.22, 0));
      yaw.add(pitch); pitch.position.y = 0.38;
      pitch.add(mesh(G.cyl, M.yellow, 0.14, 0.14, 0.34, 0, 0, 0));
      pitch.add(mesh(G.cone, M.dark, 0.1, 0.1, 0.36, 0, 0, 0.33));
      const crystal = glow(G.octa, opts.glow || '#ffe066', 0.07, 0.07, 0.11, 0, 0, 0.56); T.anim.crystal = crystal;
      const rings = new THREE.Group(); rings.position.z = 0.36; pitch.add(rings); T.anim.rings = rings;
      for (let i = 0; i < 2; i++) { const r = mesh(G.torus, M.light, 0.16, 0.16, 0.5, 0, 0, i * 0.12); r.rotation.y = 0.5 * (i ? 1 : -1); rings.add(r); }
      muzzle(0, 0, 0.62);
      break;
    }
  }
  for (const g of T.glows) g.userData.base = g.material.color.clone();
  T.heat = 0; T.charge = 0; T.doors = 0; T.pulse = 0;
  return T;
}

/**
 * Animate one turret.
 * @param {object} T from buildTurret
 * @param {{yaw:number, pitch:number, firing:boolean, charge?:number, beam?:boolean, target?:boolean}} s sim state
 * @param {number} dt seconds, @param {number} now seconds
 */
export function animateTurret(T, s, dt, now) {
  T.yaw.rotation.y = s.yaw;
  T.pitch.rotation.x = -s.pitch;
  for (let i = 0; i < T.recoil.length; i++) {
    T.recoil[i] = Math.max(0, T.recoil[i] - dt * (T.kind === 'railgun' ? 1.1 : 6));
    T.barrels[i].position.z = (T.barrels[i].userData.z0 ??= T.barrels[i].position.z) - T.recoil[i] * (T.kind === 'railgun' ? 0.35 : 0.16);
  }
  T.heat = Math.max(0, T.heat - dt * 2.5);
  const flash = (m, k) => m.material.color.copy(m.userData.base).multiplyScalar(k);
  switch (T.kind) {
    case 'gatling':
      T.spin = s.firing ? Math.min(1, T.spin + dt * 2.2) : Math.max(0, T.spin - dt * 0.7);
      T.anim.spinner.rotation.z += T.spin * dt * 38; break;
    case 'laser':
      T.glows.forEach((g, i) => flash(g, s.beam ? 2.4 + Math.sin(now * 40 + i) * 0.4 : 0.35 + T.heat * 1.5 + (s.target ? 0.25 : 0))); break;
    case 'railgun': {
      const ch = s.charge || 0;
      T.glows.forEach(g => flash(g, 0.15 + Math.max(0, ch * 4 - g.userData.coil) * 0.9 + T.heat * 2)); break;
    }
    case 'flak':
      T.anim.fin.rotation.y += dt * 2.6; break;
    case 'missile': {
      T.doors += ((s.target ? 1 : 0) - T.doors) * Math.min(1, dt * 4);
      for (const d of T.anim.doors) d.hinge.rotation.z = d.side * T.doors * 1.25;
      T.glows.forEach(g => flash(g, 0.3 + T.doors * 0.4 + (g.userData.hot || 0)));
      T.glows.forEach(g => { g.userData.hot = Math.max(0, (g.userData.hot || 0) - dt * 3); });
      break;
    }
    case 'plasma': {
      const p = 1 + Math.sin(now * 6) * 0.08 + (s.charge || 0) * 0.35 + T.heat * 0.4;
      T.anim.bulb.scale.setScalar(0.15 * p); flash(T.anim.bulb, 0.8 + T.heat * 2 + (s.charge || 0)); break;
    }
    case 'mining':
      if (s.beam) T.anim.rings.rotation.z += dt * 14;
      flash(T.anim.crystal, s.beam ? 2.6 : 0.6); T.anim.crystal.rotation.z += dt * (s.beam ? 8 : 0.6); break;
  }
}

/** A shot left barrel `i` (recoil, heat, tube flash). Returns the muzzle index used. */
export function turretFired(T) {
  const n = T.muzzles.length; const i = T.fireIx % n; T.fireIx++;
  if (T.recoil.length) T.recoil[Math.min(T.recoil.length - 1, T.kind === 'railgun' ? 0 : i % T.recoil.length)] = 1;
  T.heat = Math.min(1, T.heat + 0.5);
  if (T.kind === 'missile') { const g = T.glows.find(x => x.userData.tube === i); if (g) g.userData.hot = 3; }
  return i;
}
