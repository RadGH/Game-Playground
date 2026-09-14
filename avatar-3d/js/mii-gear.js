// 3D counterparts of the gear parts in avatar-2d/js/parts/gear.js (hats, tops, capes, held/off-hand props, marks).
// Called from mii.js with its primitive helpers so the two files share materials and proportions.
import * as THREE from 'three';
export const GEAR_TOPS = ['surcoat', 'scale_plate', 'fur_tunic', 'strapped_leather', 'wraps', 'doublet', 'open_coat', 'trench', 'smith_apron', 'sash_robe', 'silks', 'harness', 'trim_robe', 'high_collar_robe'];
export const LONG_SKIRT_TOPS = { trim_robe: 0.7, high_collar_robe: 0.7, sash_robe: 0.68, trench: 0.72, open_coat: 0.5 };
export const LONG_SLEEVE_TOPS = ['surcoat', 'scale_plate', 'strapped_leather', 'doublet', 'open_coat', 'trench', 'silks', 'trim_robe', 'high_collar_robe'];
export const BARE_ARM_TOPS = ['fur_tunic', 'sash_robe', 'harness'];

/** Hats. head group: skull centre at y=R+0.01. `fit` = skull scale. */
export function buildGearHat(head, a, R, fit, H) {
  const { mat, box, sphere, cyl, cone, torus, capGeo, shade } = H; const id = a.hat.id, hc = a.hat.color; const y = R + 0.01, top = y + R * 0.98;
  const add = (m, x, yy, z) => { m.position.set(x, yy, z); head.add(m); return m; };
  const cap = (r, theta, color, extra = {}) => { const m = new THREE.Mesh(capGeo(R * r, theta), mat(color, extra)); m.position.y = y; m.scale.copy(fit); m.castShadow = true; head.add(m); return m; };
  const metal = { metalness: 0.55, roughness: 0.4 };
  if (id === 'great_helm') { cap(1.14, 2.5, hc, metal); const slit = box(R * 1.2, R * 0.16, R * 0.3, '#111'); add(slit, 0, y + R * 0.15, R * 1.0); const ridge = box(R * 0.08, R * 1.6, R * 0.1, shade(hc, -0.2)); add(ridge, 0, y + R * 0.3, R * 1.1); }
  if (id === 'plate_helm') { cap(1.14, 1.8, hc, metal); for (const s of [-1, 1]) { const cheek = box(R * 0.35, R * 0.9, R * 0.5, hc, 0.02); cheek.material.metalness = 0.5; add(cheek, s * R * 0.95, y - R * 0.3, R * 0.35); } const guard = box(R * 0.2, R * 0.8, R * 0.08, hc); add(guard, 0, y - R * 0.1, R * 1.08); }
  if (id === 'chain_coif') { cap(1.12, 1.25, hc, { metalness: 0.4, roughness: 0.7 }); const band = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 32, 16, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0.9, 1.6), mat(hc, { side: THREE.DoubleSide, metalness: 0.4, roughness: 0.7 })); band.position.y = y; band.scale.copy(fit); head.add(band); const drape = cyl(R * 1.0, R * 1.25, R * 0.7, hc, 24); drape.material.side = THREE.DoubleSide; add(drape, 0, y - R * 0.95, -0.02); }
  if (id === 'leather_cap') { cap(1.11, 1.4, hc, { roughness: 0.9 }); for (const s of [-1, 1]) { const strap = box(R * 0.2, R * 0.7, R * 0.05, shade(hc, -0.2)); add(strap, s * R * 1.05, y - R * 0.2, R * 0.2); } }
  if (id === 'dragon_helm') { cap(1.15, 2.35, hc, { roughness: 0.6 }); const slit = box(R * 1.1, R * 0.16, R * 0.3, '#111'); add(slit, 0, y + R * 0.1, R * 1.02); for (const s of [-1, 1]) { const horn = cone(R * 0.14, R * 0.8, '#c8362a', 8); horn.rotation.set(-0.5, 0, s * -0.6); add(horn, s * R * 0.7, y + R * 0.9, -R * 0.2); } const crest = box(R * 0.08, R * 0.5, R * 1.2, '#e8742a'); add(crest, 0, y + R * 1.05, -R * 0.1); for (let i = 0; i < 6; i++) { const sc = sphere(R * 0.14, shade(hc, -0.15), 8); sc.scale.set(1, 0.4, 1); add(sc, Math.sin(i) * R * 0.8, y + R * 0.55 + (i % 2) * R * 0.2, Math.cos(i) * R * 0.75); } }
  if (id === 'wide_brim') { add(cyl(R * 2.0, R * 2.0, 0.02, hc, 32), 0, top - 0.05, 0); add(cyl(R * 0.85, R * 0.95, R * 0.9, hc, 24), 0, top + R * 0.4, 0); const band = cyl(R * 0.87, R * 0.87, R * 0.15, '#c9b26b', 24); add(band, 0, top + R * 0.05, 0); }
  if (id === 'feather_cap') { cap(1.1, 1.15, hc); add(cyl(R * 1.3, R * 1.3, 0.015, hc, 32), 0, top - 0.06, 0); const f = cone(R * 0.12, R * 1.4, '#3aa35a', 6); f.rotation.set(0.5, 0, -0.9); add(f, R * 0.9, top + R * 0.5, -R * 0.3); }
  if (id === 'feather_band') { const t = torus(R * 1.05, 0.02, hc); t.rotation.x = Math.PI / 2; add(t, 0, y + R * 0.5, 0); for (let i = 0; i < 3; i++) { const f = cone(R * 0.09, R * 1.0, i === 1 ? '#c88' : '#e8e0c8', 6); f.rotation.set(-0.2, 0, -0.6 - i * 0.3); add(f, R * 0.8 + i * 0.03, y + R * 0.95 + i * 0.02, -R * 0.2 - i * 0.05); } }
  if (id === 'goggles_up') { const t = torus(R * 1.06, 0.02, hc); t.rotation.x = Math.PI / 2; add(t, 0, y + R * 0.6, 0); for (const s of [-1, 1]) { const lens = cyl(R * 0.22, R * 0.22, R * 0.14, hc, 16); lens.rotation.x = Math.PI / 2 - 0.5; lens.material.metalness = 0.6; add(lens, s * R * 0.32, y + R * 0.7, R * 0.78); const glass = cyl(R * 0.15, R * 0.15, R * 0.15, '#a9d3dc', 16); glass.rotation.x = Math.PI / 2 - 0.5; add(glass, s * R * 0.32, y + R * 0.71, R * 0.8); } }
  if (id === 'hood_down') { const t = torus(R * 0.95, R * 0.28, hc); t.rotation.x = Math.PI / 2 + 0.2; t.scale.set(1, 1, 0.8); add(t, 0, y - R * 1.05, -R * 0.15); }
}
/** Tops. torso group: box body at y=tl/2, width 0.42, depth 0.28. */
export function buildGearTop(torso, body, a, tl, H) {
  const { mat, box, sphere, cyl, cone, torus, shade } = H; const id = a.top.id, tc = a.top.color, tc2 = a.top.color2 || '#fff'; const skin = a.body.skin;
  const add = (m, x, y, z) => { m.position.set(x, y, z); torso.add(m); return m; };
  const belt = (color) => { const b = box(0.44, 0.06, 0.3, color, 0.02); add(b, 0, 0.06, 0); return b; };
  const pauldrons = (color) => { for (const s of [-1, 1]) { const p = sphere(0.11, color); p.scale.set(1, 0.7, 1); p.material.metalness = 0.5; p.material.roughness = 0.4; add(p, s * 0.22, tl - 0.05, 0); } };
  if (id === 'surcoat') { body.material.color.set(tc2); body.material.metalness = 0.5; body.material.roughness = 0.4; pauldrons(tc2); const tabard = box(0.26, tl * 0.95, 0.03, tc, 0.01); add(tabard, 0, tl / 2, 0.15); const cross1 = box(0.03, 0.2, 0.01, '#f4f4f4'); add(cross1, 0, tl * 0.55, 0.17); const cross2 = box(0.14, 0.03, 0.01, '#f4f4f4'); add(cross2, 0, tl * 0.6, 0.17); belt(shade(tc, -0.3)); }
  if (id === 'scale_plate') { body.material.roughness = 0.5; pauldrons(tc2); for (let row = 0; row < 4; row++) for (let i = 0; i < 5; i++) { const sc = sphere(0.045, shade(tc, -0.15), 8); sc.scale.set(1, 0.5, 0.4); add(sc, -0.16 + i * 0.08 + (row % 2) * 0.04, tl * 0.85 - row * 0.11, 0.15); } belt(shade(tc, -0.3)); }
  if (id === 'fur_tunic') { const fur = torus(0.22, 0.09, tc2); fur.rotation.x = Math.PI / 2; fur.scale.set(1, 0.75, 1); add(fur, 0, tl - 0.02, 0); for (let i = 0; i < 10; i++) { const tuft = cone(0.03, 0.08, shade(tc2, -0.2), 5); const ang = (i / 10) * Math.PI * 2; tuft.rotation.x = Math.PI; add(tuft, Math.sin(ang) * 0.26, tl - 0.12, Math.cos(ang) * 0.18); } const strap = box(0.05, tl * 0.9, 0.02, shade(tc, -0.4)); strap.rotation.z = 0.7; add(strap, 0, tl * 0.5, 0.15); belt(shade(tc, -0.35)); }
  if (id === 'strapped_leather') { body.material.roughness = 0.8; for (const s of [-1, 1]) { const strap = box(0.05, tl * 1.05, 0.02, tc2); strap.rotation.z = s * 0.65; add(strap, 0, tl * 0.5, 0.15); } const buckle = box(0.05, 0.05, 0.01, '#c8c8c8'); add(buckle, 0, tl * 0.5, 0.165); belt(tc2); const pauldron = sphere(0.1, shade(tc, -0.3)); pauldron.scale.set(1, 0.7, 1); add(pauldron, 0.22, tl - 0.05, 0); }
  if (id === 'wraps') { body.material.color.set(shade(tc, -0.05)); for (let i = 0; i < 4; i++) { const band = box(0.44, 0.05, 0.3, tc2, 0.02); band.rotation.z = (i % 2 ? 0.12 : -0.12); add(band, 0, tl * 0.2 + i * 0.13, 0); } belt('#8a6a3a'); const pauldron = sphere(0.1, shade(tc, -0.3)); pauldron.scale.set(1, 0.7, 1); add(pauldron, 0.22, tl - 0.05, 0); }
  if (id === 'doublet') { for (const s of [-1, 1]) { const puff = sphere(0.12, tc); add(puff, s * 0.2, tl - 0.04, 0); } const v = box(0.1, tl * 0.4, 0.01, tc2); add(v, 0, tl * 0.78, 0.15); for (let i = 0; i < 3; i++) { const btn = sphere(0.012, '#e0b040', 6); add(btn, 0, tl * 0.5 - i * 0.08, 0.155); } belt('#5a3a1a'); }
  if (id === 'open_coat') { body.material.color.set(tc2); for (const s of [-1, 1]) { const panel = box(0.14, tl * 0.98, 0.03, tc, 0.01); add(panel, s * 0.14, tl / 2, 0.145); const lapel = box(0.06, 0.12, 0.012, '#e0b040'); lapel.rotation.z = s * 0.5; add(lapel, s * 0.08, tl * 0.85, 0.165); } belt('#5a3a1a'); }
  if (id === 'trench') { const collar = cyl(0.11, 0.11, 0.1, tc, 16, true); collar.material.side = THREE.DoubleSide; add(collar, 0, tl + 0.02, 0); const shirt = box(0.08, 0.1, 0.01, '#f0f0f0'); add(shirt, 0, tl * 0.9, 0.15); for (let i = 0; i < 4; i++) { const bk = box(0.05, 0.02, 0.01, '#c0c0c0'); add(bk, 0, tl * 0.7 - i * 0.1, 0.155); } const bando = box(0.06, tl * 1.05, 0.02, tc2); bando.rotation.z = -0.65; add(bando, 0, tl * 0.5, 0.15); belt(shade(tc, -0.3)); }
  if (id === 'smith_apron') { body.material.color.set(tc2); const apron = box(0.28, tl * 0.98, 0.02, tc, 0.01); add(apron, 0, tl / 2, 0.15); const pocket = box(0.12, 0.08, 0.01, shade(tc, -0.2)); add(pocket, 0, tl * 0.3, 0.165); for (const [x, y] of [[-0.08, tl * 0.6], [0.08, tl * 0.6], [0, tl * 0.15]]) { const rune = sphere(0.014, '#ff9a2a', 6); rune.material.emissive = new THREE.Color('#ff7a1a'); rune.material.emissiveIntensity = 1.2; add(rune, x, y, 0.17); } belt('#4a3a2a'); }
  if (id === 'sash_robe') { const sash = box(0.44, 0.09, 0.3, tc2, 0.02); add(sash, 0, 0.1, 0); const fold = box(0.2, 0.36, 0.015, shade(tc, -0.15)); fold.rotation.z = 0.6; add(fold, 0, tl * 0.6, 0.145); }
  if (id === 'silks') { const sash = box(0.06, tl * 1.0, 0.015, tc2); sash.rotation.z = -0.6; add(sash, 0, tl * 0.5, 0.145); belt(tc2); }
  if (id === 'harness') { body.material.color.set(skin); for (const s of [-1, 1]) { const strap = box(0.045, tl * 1.05, 0.02, tc); strap.rotation.z = s * 0.65; add(strap, 0, tl * 0.5, 0.145); } belt(tc); for (let i = 0; i < 5; i++) { const bone = box(0.02, 0.05, 0.015, '#e8e0c8'); add(bone, -0.12 + i * 0.06, tl * 0.5 + (i % 2) * 0.05, 0.16); } const paint = box(0.1, 0.03, 0.005, '#c83a2a'); add(paint, -0.12, tl * 0.75, 0.145); }
  if (id === 'trim_robe') { const strip = box(0.06, tl * 0.98, 0.012, tc2); add(strip, 0, tl / 2, 0.15); const collar = torus(0.1, 0.02, tc2); collar.rotation.x = Math.PI / 2; add(collar, 0, tl + 0.01, 0); const clasp = sphere(0.02, '#e0b040', 8); add(clasp, 0, tl * 0.92, 0.16); }
  if (id === 'high_collar_robe') { const collar = cyl(0.12, 0.1, 0.13, shade(tc, -0.2), 16, true); collar.material.side = THREE.DoubleSide; add(collar, 0, tl + 0.03, -0.01); for (let i = 0; i < 3; i++) { const em = torus(0.05 + i * 0.03, 0.006, tc2); em.rotation.x = Math.PI / 2; add(em, 0, 0.12 + i * 0.03, 0.15); } const gem = sphere(0.02, '#a040e0', 8); gem.material.emissive = new THREE.Color('#8020c0'); gem.material.emissiveIntensity = 0.8; add(gem, 0, tl * 0.75, 0.155); }
}
/** Capes hang from the torso group (behind the body, z<0). */
export function buildCape(torso, a, tl, H) {
  const { mat, box, sphere, cyl, cone, torus, shade } = H; const id = a.cape?.id || 'none'; if (id === 'none') return; const c = a.cape.color, cd = shade(c, -0.25);
  const add = (m, x, y, z) => { m.position.set(x, y, z); torso.add(m); return m; };
  if (id === 'cape') { const cape = box(0.46, tl * 1.9, 0.02, c, 0.01); cape.rotation.x = 0.12; add(cape, 0, tl * 0.1, -0.2); for (const s of [-1, 1]) add(sphere(0.03, '#d8b040', 8), s * 0.16, tl - 0.02, 0.12); }
  if (id === 'shoulder_cape') { const cape = cyl(0.26, 0.34, tl * 0.55, c, 24, true); cape.material.side = THREE.DoubleSide; add(cape, 0, tl - 0.26, -0.02); }
  if (id === 'half_cape') { const cape = box(0.24, tl * 1.6, 0.02, c, 0.01); cape.rotation.set(0.1, 0, -0.15); add(cape, 0.16, tl * 0.2, -0.19); add(sphere(0.025, '#c0c0c0', 8), 0.2, tl - 0.02, 0.05); }
  if (id === 'fur_mantle') { const fur = torus(0.23, 0.1, c); fur.rotation.x = Math.PI / 2; fur.scale.set(1, 0.75, 1); add(fur, 0, tl - 0.01, 0); for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2; const tuft = cone(0.03, 0.09, cd, 5); tuft.rotation.x = Math.PI; add(tuft, Math.sin(ang) * 0.27, tl - 0.12, Math.cos(ang) * 0.19); } }
  if (id === 'feather_mantle') { const base = torus(0.22, 0.06, c); base.rotation.x = Math.PI / 2; base.scale.set(1, 0.7, 1); add(base, 0, tl - 0.01, 0); for (let i = 0; i < 10; i++) { const ang = (i / 10) * Math.PI * 2; const f = cone(0.025, 0.16, i % 2 ? '#e8e0c8' : cd, 5); f.rotation.x = Math.PI + 0.3; f.rotation.y = ang; add(f, Math.sin(ang) * 0.26, tl - 0.14, Math.cos(ang) * 0.18); } }
  if (id === 'shawl') { const sh = box(0.16, tl * 0.9, 0.01, c); sh.material.transparent = true; sh.material.opacity = 0.6; sh.rotation.z = 0.55; add(sh, 0.05, tl * 0.55, 0.15); }
}
/** Held (right hand pivot) and off-hand (left hand pivot) props. Hands sit at y=-0.5 in the arm pivot; +y is up the arm. */
export function buildHeld(armR, armL, a, H) {
  const { mat, box, sphere, cyl, cone, torus, shade } = H; const hy = -0.5; const glow = (m, color, k = 1) => { m.material.emissive = new THREE.Color(color); m.material.emissiveIntensity = k; return m; };
  // Held things hang off the ARM pivot, and the hand is at (0, hy, 0) in that frame — so the grip
  // belongs a couple of centimetres in front of the fingers, not a fifth of a metre in front of the
  // chest. The old +0.16 was measured for the torso and left every weapon floating in mid-air with
  // the hand nowhere near it (E18). HELD_Z is that small "just clear of the knuckles" offset.
  const HELD_Z = 0.03;
  const at = (parent, m, x, y, z, rx = 0, rz = 0) => { m.position.set(x, hy + y, z + HELD_Z); m.rotation.x = rx; m.rotation.z = rz; parent.add(m); return m; };
  const held = a.held?.id || 'none', hc = a.held?.color || '#9a9aa8', hd = shade(hc, -0.3); const metal = { metalness: 0.6, roughness: 0.35 };
  const blade = (parent, len, w = 0.035, color = hc, guard = true) => { const b = box(w, len, 0.008, color, 0.002); b.material.metalness = 0.6; b.material.roughness = 0.35; at(parent, b, 0, len / 2 + 0.06, 0.05); if (guard) at(parent, box(0.12, 0.02, 0.02, '#d8b040'), 0, 0.06, 0.05); at(parent, cyl(0.014, 0.014, 0.12, '#5a3a1a', 8), 0, 0, 0.05); };
  const staff = (parent, len = 1.3) => { at(parent, cyl(0.014, 0.018, len, hc, 8), 0, len * 0.35, 0.05); return len; };
  if (held === 'sword') blade(armR, 0.55);
  if (held === 'greatsword') blade(armR, 0.85, 0.05);
  if (held === 'rapier') blade(armR, 0.6, 0.018);
  if (held === 'saber') { const b = box(0.035, 0.6, 0.008, hc); b.material.metalness = 0.6; at(armR, b, 0.05, 0.36, 0.05, 0, -0.15); at(armR, cyl(0.014, 0.014, 0.12, '#222', 8), 0, 0, 0.05); }
  if (held === 'daggers') { blade(armR, 0.28, 0.03, hc, false); blade(armL, 0.28, 0.03, hc, false); }
  if (held === 'cleaver') { const b = box(0.09, 0.4, 0.01, hc); at(armR, b, 0.03, 0.3, 0.05); at(armR, cyl(0.014, 0.014, 0.14, '#8a6a3a', 8), 0, 0, 0.05); }
  if (held === 'greataxe') { at(armR, cyl(0.016, 0.02, 1.1, '#5a3a1a', 8), 0, 0.3, 0.05); for (const s of [-1, 1]) { const head = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16, 1, false, s < 0 ? Math.PI : 0, Math.PI), mat(hc, { metalness: 0.6, roughness: 0.35 })); head.castShadow = true; at(armR, head, 0, 0.75, 0.05, Math.PI / 2, 0); } }
  if (held === 'hammer' || held === 'warhammer') { const len = held === 'hammer' ? 0.6 : 0.95; at(armR, cyl(0.016, 0.02, len, '#5a3a1a', 8), 0, len * 0.35, 0.05); const head = box(held === 'hammer' ? 0.22 : 0.3, 0.12, 0.12, hc, 0.02); head.material.metalness = 0.6; at(armR, head, 0, len * 0.85, 0.05); if (held === 'warhammer') { const spike = cone(0.05, 0.14, hc, 8); at(armR, spike, 0, len * 0.85 + 0.13, 0.05); for (const s of [-1, 1]) at(armR, glow(sphere(0.02, '#ff8c2a', 6), '#ff6a1a'), s * 0.16, len * 0.85, 0.11); } }
  if (held === 'mace') { at(armR, cyl(0.014, 0.016, 0.5, '#5a3a1a', 8), 0, 0.2, 0.05); const head = sphere(0.08, hc, 10); head.material.metalness = 0.6; at(armR, head, 0, 0.5, 0.05); for (let i = 0; i < 8; i++) { const sp = cone(0.02, 0.06, hc, 5); const ang = (i / 8) * Math.PI * 2; sp.position.set(Math.sin(ang) * 0.09, hy + 0.5 + Math.cos(ang) * 0.09, 0.05 + HELD_Z); sp.lookAt(new THREE.Vector3(Math.sin(ang) * 2, hy + 0.5 + Math.cos(ang) * 2, 0.05 + HELD_Z)); sp.rotateX(Math.PI / 2); armR.add(sp); } }
  if (held === 'bow') { const arc = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.012, 8, 24, 2.2), mat(hc)); at(armR, arc, 0.3, 0.02, 0.05, 0, Math.PI - 1.1); const string = box(0.004, 0.7, 0.004, '#e8e0c0'); at(armR, string, -0.05, 0.02, 0.05); }
  if (held === 'crossbow') { at(armR, box(0.04, 0.32, 0.05, '#5a3a1a', 0.01), 0, 0.12, 0.05); const arm = box(0.34, 0.02, 0.02, hc); at(armR, arm, 0, 0.26, 0.05); at(armR, box(0.32, 0.004, 0.004, '#e8e0c0'), 0, 0.2, 0.05); }
  if (held === 'quarterstaff') staff(armR, 1.4);
  if (held === 'staff_orb') { const len = staff(armR); at(armR, glow(sphere(0.06, hd, 12), hd, 0.4), 0, len * 0.85 + 0.04, 0.05); }
  if (held === 'staff_skull') { const len = staff(armR); const sk = sphere(0.06, '#e8e0c8', 10); sk.scale.set(1, 1.1, 1); at(armR, sk, 0, len * 0.85 + 0.04, 0.05); for (const s of [-1, 1]) at(armR, sphere(0.015, '#222', 6), s * 0.025, len * 0.85 + 0.05, 0.1); }
  if (held === 'staff_crook') { const len = staff(armR); const crook = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 24, Math.PI * 1.3), mat(hc)); at(armR, crook, 0.03, len * 0.85 + 0.02, 0.05); const leaf = sphere(0.02, '#3aa35a', 6); at(armR, leaf, 0.05, len * 0.6, 0.06); }
  if (held === 'staff_crystal') { const len = staff(armR); const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), mat(hd)); glow(cr, hd, 0.9); at(armR, cr, 0, len * 0.85 + 0.06, 0.05); }
  if (held === 'staff_totem') { const len = staff(armR); at(armR, glow(sphere(0.045, '#40c8ff', 10), '#40c8ff', 1.0), 0, len * 0.85 + 0.03, 0.05); for (const s of [-1, 1]) { const f = cone(0.015, 0.12, '#e8e0c8', 5); at(armR, f, s * 0.04, len * 0.8, 0.05, Math.PI, s * 0.3); } }
  if (held === 'lute') { const bodyM = sphere(0.13, hc, 12); bodyM.scale.set(1, 1.2, 0.35); at(armR, bodyM, -0.08, 0.05, 0.14); at(armR, box(0.03, 0.34, 0.02, hd), 0.08, 0.28, 0.14, 0, -0.5); }
  if (held === 'book') { const b = box(0.16, 0.2, 0.05, hc, 0.005); at(armR, b, -0.04, 0.06, 0.12, 0.3, 0); at(armR, glow(sphere(0.025, hd, 8), hd, 0.6), -0.04, 0.08, 0.16); }
  if (held === 'hourglass') { for (const s of [-1, 1]) { const c = cone(0.05, 0.08, '#f4f0e0', 10); c.material.transparent = true; c.material.opacity = 0.7; at(armR, c, 0, 0.08 + s * 0.04, 0.1, s < 0 ? Math.PI : 0, 0); at(armR, cyl(0.06, 0.06, 0.012, '#d8b040', 12), 0, 0.08 + s * 0.085, 0.1); } at(armR, glow(cone(0.03, 0.05, hd, 8), hd, 0.5), 0, 0.09, 0.1, Math.PI, 0); }
  if (held === 'orb') at(armR, glow(sphere(0.07, hd, 16), hd, 1.0), 0, 0.14, 0.12);
  if (held === 'flame') { const f = cone(0.05, 0.16, '#ff8c2a', 8); glow(f, '#ff6a1a', 1.2); at(armR, f, 0, 0.12, 0.1); at(armR, glow(cone(0.025, 0.09, '#ffe27a', 8), '#ffd040', 1.2), 0, 0.1, 0.1); }
  if (held === 'lightning') { for (const p of [armR, armL]) for (let i = 0; i < 3; i++) { const bolt = box(0.01, 0.12, 0.01, hd); glow(bolt, hd, 1.4); at(p, bolt, (i - 1) * 0.04, 0.1 + i * 0.03, 0.06, 0, (i - 1) * 0.5); } }
  if (held === 'ring_rune') { const ring = torus(0.08, 0.008, hd); glow(ring, hd, 1.2); ring.rotation.x = Math.PI / 2; at(armR, ring, -0.24, 0.02, 0.16); }
  // off-hand
  const off = a.offhand?.id || 'none', oc = a.offhand?.color || '#8a7a5a', od = shade(oc, -0.3);
  const shield = (w, h, radius = 0.02) => { const s = box(w, h, 0.03, oc, radius); s.material.metalness = 0.4; s.material.roughness = 0.5; at(armL, s, -0.02, 0.06, 0.1); const rim = box(w * 0.85, h * 0.85, 0.005, od); at(armL, rim, -0.02, 0.06, 0.12); return s; };
  if (off === 'heater_shield') shield(0.3, 0.38);
  if (off === 'kite_shield') { shield(0.28, 0.46); at(armL, box(0.03, 0.26, 0.005, '#f4f4f4'), -0.02, 0.06, 0.125); at(armL, box(0.16, 0.03, 0.005, '#f4f4f4'), -0.02, 0.1, 0.125); }
  if (off === 'round_shield') { const s = cyl(0.18, 0.18, 0.03, oc, 24); s.rotation.x = Math.PI / 2; s.material.metalness = 0.4; at(armL, s, -0.02, 0.06, 0.1, Math.PI / 2, 0); at(armL, sphere(0.04, od, 8), -0.02, 0.06, 0.12); }
  if (off === 'tower_shield') shield(0.32, 0.62);
  if (off === 'buckler') { const s = cyl(0.11, 0.11, 0.03, oc, 20); s.material.metalness = 0.5; at(armL, s, -0.02, 0.06, 0.1, Math.PI / 2, 0); }
  if (off === 'dagger') { const b = box(0.03, 0.28, 0.008, oc); b.material.metalness = 0.6; at(armL, b, 0, 0.2, 0.05); at(armL, cyl(0.014, 0.014, 0.12, '#5a3a1a', 8), 0, 0, 0.05); }
  if (off === 'map') { const m = box(0.16, 0.12, 0.005, oc); at(armL, m, -0.02, 0.06, 0.1, 0.4, 0); }
  if (off === 'orb') at(armL, glow(sphere(0.06, od, 14), od, 0.6), 0, 0.1, 0.1);
  if (off === 'book') { const b = box(0.16, 0.2, 0.05, oc, 0.005); at(armL, b, 0.04, 0.06, 0.12, 0.3, 0); }
  if (off === 'torch') { at(armL, cyl(0.014, 0.018, 0.34, '#5a3a1a', 8), 0, 0.14, 0.05); at(armL, glow(cone(0.05, 0.14, '#ff8c2a', 8), '#ff6a1a', 1.2), 0, 0.38, 0.05); }
  if (off === 'quiver') { const q = cyl(0.045, 0.05, 0.42, oc, 10); q.rotation.z = 0.35; q.rotation.x = 0.2; const torso = armL.parent; q.position.set(0.12, 0.3, -0.16); torso.add(q); for (let i = 0; i < 3; i++) { const ar = cyl(0.005, 0.005, 0.2, '#e8e0c0', 5); ar.rotation.z = 0.35; ar.position.set(0.05 + i * 0.03, 0.56, -0.16 + i * 0.01); torso.add(ar); } }
}
/** Marks that live outside the face texture (2D 'extras' drawn on the body). */
export function buildBodyMarks(torso, a, tl, H) { const { sphere } = H; if (a.extras?.id === 'chest_glow') { const g = sphere(0.035, a.extras.color || '#40c8ff', 10); g.material.emissive = new THREE.Color(a.extras.color || '#40c8ff'); g.material.emissiveIntensity = 1.5; g.position.set(0, tl * 0.65, 0.15); torso.add(g); } }
