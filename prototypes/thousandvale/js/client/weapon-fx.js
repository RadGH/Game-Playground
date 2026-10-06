// Basic attacks you can SEE (play-test 3, R5: "Gloom staff: no attack animation, no particle effect. ALL weapons
// (like spells) need a prominent effect").
//
// Stream C tags every basic-attack event (js/rules/cast.js weaponTag): `wk` how the weapon attacks (melee | arrow |
// bolt | staff), `wt` its type (items.json subtype: sword, staff, bow…), `el` its element, `two` two-handed.
//   fx {kind:'attack', shape:'swing', x, z, yaw, reach, arc, hand, step, strike}  a melee swing landing
//   fx {kind:'attack', shape: bolt|nova|cone|wave|jet|dome|wall|mortar|storm}     a staff's spell going off
//   fx {kind:'arrow'|'bolt', basic:1, …}                                         the projectile (spells.js flies it)
// This file draws the swing itself — a bright crescent sweeping along the arc at chest height, in the element's colour,
// thicker for a two-hander, upright for an overhead chop — and the staff's flash and shape, and gives every weapon type
// a look (`weaponLook`, tested against every weapon in the item data).
//
// Cost: a fixed pool of crescent meshes made at start (one shared geometry, one material each, additive, no lights),
// so a fight never adds a program or a light (P1).
//
//   const wfx = createWeaponFx(scene, { spellFx: spells.fx, actors, groundY })
//   wfx.onEvent(ev)   // every fx event
//   wfx.update(dt)

import * as THREE from 'three';

/** Element -> trail colour. */
export const ELEMENT_COLOUR = {
  physical: '#f4f0e6', fire: '#ff7a2a', ice: '#9ad8ff', lightning: '#ffe860', shadow: '#9a6ad8', holy: '#ffe8a0', nature: '#8ad860',
  arcane: '#c080ff', poison: '#7ae04a', bleed: '#e04a4a', void: '#8a4ad8', gloom: '#7a5ab0', true: '#ffffff',
};
const ELEMENT_ALIAS = { cold: 'ice', frost: 'ice', storm: 'lightning', shock: 'lightning', dark: 'shadow', gloom: 'shadow', light: 'holy', magic: 'arcane', blood: 'bleed' };
export const elementKey = e => { const k = String(e || 'physical').toLowerCase(); return ELEMENT_COLOUR[k] ? (ELEMENT_ALIAS[k] && ELEMENT_COLOUR[ELEMENT_ALIAS[k]] ? ELEMENT_ALIAS[k] : k) : ELEMENT_ALIAS[k] || 'physical'; };

/**
 * How a weapon type's basic attack looks. Pure — the test walks every weapon in the item data through it.
 * -> { kind: 'slash'|'thrust'|'smash'|'shoot'|'bolt'|'staff', width, tilt, trail }  (never null)
 */
export function weaponLook(wt, wk = null) {
  const t = String(wt || 'fist').toLowerCase();
  if (wk === 'arrow' || /bow|crossbow|sling|javelin/.test(t)) return { kind: 'shoot', width: 0.06, tilt: 0, trail: 'arrow' };
  if (wk === 'staff' || /^staff$|quarterstaff|^staff_/.test(t) && wk !== 'melee') return { kind: 'staff', width: 0.3, tilt: 0, trail: 'orb' };
  if (wk === 'bolt' || /wand|scepter|orb|tome|rod|focus/.test(t)) return { kind: 'bolt', width: 0.2, tilt: 0, trail: 'orb' };
  if (/dagger|rapier|spear|polearm|halberd|pike|lance|knife|stiletto/.test(t)) return { kind: 'thrust', width: /halberd|polearm/.test(t) ? 0.34 : 0.18, tilt: 0.1, trail: 'line' };
  if (/hammer|mace|maul|club|flail|warhammer|greataxe|axe2h/.test(t)) return { kind: 'smash', width: 0.42, tilt: 1.25, trail: 'crescent' };
  if (/sword2h|greatsword|claymore/.test(t)) return { kind: 'slash', width: 0.42, tilt: 0.35, trail: 'crescent' };
  if (/sword|sabre|saber|longsword|scimitar|axe|blade|cleaver|fist|claw|quarterstaff|staff/.test(t)) return { kind: 'slash', width: 0.28, tilt: 0.2, trail: 'crescent' };
  return { kind: 'slash', width: 0.26, tilt: 0.2, trail: 'crescent' };
}

export function createWeaponFx(scene, { spellFx = null, actors = null, groundY = () => 0, pool = 14, targetOf = () => null } = {}) {
  // crescent geometries: a 1 m ring sector lying flat and centred on +z, one per arc width (rounded to 0.2 rad, made on
  // first use — a geometry is not a program, so nothing recompiles), scaled to the reach per swing
  const GEO = new Map();
  const geoFor = (arc, inner = 0.7) => {
    const a = Math.max(0.2, Math.min(Math.PI * 2, Math.round(arc / 0.2) * 0.2)), k = a.toFixed(1) + '|' + inner.toFixed(2);
    if (!GEO.has(k)) { const g = new THREE.RingGeometry(inner, 1, Math.max(6, Math.round(a * 10)), 1, -Math.PI / 2 - a / 2, a); g.rotateX(-Math.PI / 2); GEO.set(k, g); }
    return GEO.get(k);
  };
  const geo = geoFor(1.6);
  const items = [];
  for (let i = 0; i < pool; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    m.visible = false; m.frustumCulled = false; m.renderOrder = 3; scene.add(m);
    items.push({ m, t: 0, life: 0, sweep: 0, yaw0: 0 });
  }
  let next = 0;
  const stats = { swings: 0, staff: 0, shots: 0 };

  /** A crescent along an arc of `arc` radians, `reach` metres, centred on facing `yaw`, at `y`. */
  function crescent({ x, y, z, yaw, reach, arc, colour, width, tilt = 0, life = 0.26, dir = 1, thrust = false }) {
    const it = items[next++ % items.length];
    const m = it.m;
    m.position.set(x, y, z);
    const a = Math.max(0.35, Math.min(Math.PI * 2, arc || 1.4));
    const r = Math.max(0.8, Math.min(9, reach || 2));
    // the unit sector is 1 rad wide: scale its angle by stretching x/z around +z is not exact, so build the arc from
    // the scale: a thrust is a long thin sliver, a slash a wide one
    m.geometry = thrust ? geoFor(0.22, 0.15) : geoFor(a, Math.max(0.35, 1 - (width || 0.3) * 4 / Math.max(1, r)));
    m.scale.set(r, 1, r);
    m.rotation.set(0, 0, 0);
    m.rotation.order = 'YXZ';
    m.rotation.y = yaw; m.rotation.z = tilt * dir;
    m.material.color.set(colour);
    it.t = 0; it.life = life; it.sweep = thrust ? 0 : a * 0.5 * dir; it.yaw0 = yaw; it.arcScale = thrust ? 1 : a;
    m.userData.width = width;
    m.visible = true; m.material.opacity = 0.95;
    return it;
  }

  // a shot the server resolves on the spot (point blank) sends no `fx arrow`/`bolt`: the cast's own projectile is drawn
  // when none follows it within a moment (and nothing is drawn twice when one does)
  const pendingShots = new Map();     // caster id -> { at, ev }
  function onEvent(ev) {
    if (ev && ev.type === 'cast' && ev.skill === 'basic' && (ev.wk === 'arrow' || ev.wk === 'bolt') && ev.clip !== 'draw') { pendingShots.set(ev.s, { at: performance.now(), ev }); return; }
    if (!ev || ev.type !== 'fx') return;
    if (ev.kind === 'attack') {
      const a = actors?.get(ev.id);
      const x = ev.x ?? a?.pos.x, z = ev.z ?? a?.pos.z; if (x == null) return;
      const el = elementKey(ev.el), colour = ELEMENT_COLOUR[el] || ELEMENT_COLOUR.physical;
      const gy = groundY(x, z), yaw = ev.yaw ?? a?.yaw ?? 0;
      const L = weaponLook(ev.wt, ev.wk);
      if (ev.shape === 'swing' || ev.wk === 'melee') {
        stats.swings++;
        const dir = (ev.step | 0) % 2 ? -1 : 1;
        crescent({ x, y: gy + (L.kind === 'smash' ? 0.6 : 1.0), z, yaw, reach: ev.reach || 2.2, arc: ev.arc || 1.6, colour, width: L.width * (ev.two ? 1.3 : 1), tilt: L.tilt, dir, thrust: L.kind === 'thrust', life: ev.two ? 0.32 : 0.24 });
        // a heavy weapon slams the ground at the end of its arc
        if (L.kind === 'smash' && spellFx) { const fx2 = x + Math.sin(yaw) * (ev.reach || 2) * 0.8, fz = z + Math.cos(yaw) * (ev.reach || 2) * 0.8; try { spellFx.footfall({ at: new THREE.Vector3(fx2, groundY(fx2, fz) + 0.02, fz), element: el === 'physical' ? 'physical' : el, size: 0.9 }); } catch {} }
        if (el !== 'physical' && spellFx) try { spellFx.aoe({ points: [new THREE.Vector3(x + Math.sin(yaw) * (ev.reach || 2) * 0.7, gy + 1, z + Math.cos(yaw) * (ev.reach || 2) * 0.7)], element: el, stagger: 0, ground: gy }); } catch {}
        return;
      }
      // a staff's spell: a flash at the hand, then its shape
      stats.staff++;
      if (!spellFx) return;
      const hand = new THREE.Vector3(x + Math.sin(yaw) * 0.45, gy + 1.25, z + Math.cos(yaw) * 0.45);
      try {
        spellFx.cast({ at: hand, element: el === 'physical' ? 'arcane' : el, ms: 260, ground: gy });
        const reach = ev.reach || 8, V = (d, h = 1) => new THREE.Vector3(x + Math.sin(yaw) * d, groundY(x + Math.sin(yaw) * d, z + Math.cos(yaw) * d) + h, z + Math.cos(yaw) * d);
        switch (ev.shape) {
          case 'nova': case 'dome': { const r = ev.r || 3, pts = []; for (let i = 0; i < 12; i++) { const q = i / 12 * Math.PI * 2, px = x + Math.cos(q) * r, pz = z + Math.sin(q) * r; pts.push(new THREE.Vector3(px, groundY(px, pz) + 0.6, pz)); } spellFx.aoe({ points: pts, element: el, stagger: 0.015, ground: gy }); if (ev.shape === 'dome') spellFx.pillar({ at: new THREE.Vector3(x, gy, z), radius: r, element: el, ms: 600 }); break; }
          case 'cone': case 'wave': case 'jet': spellFx.breath({ from: hand, dir: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), length: reach, arc: ev.arc || 0.6, element: el, ms: ev.shape === 'jet' ? 650 : 320 }); break;
          case 'wall': spellFx.aoe({ points: [V(3.5), V(4.5), V(5.5)], element: el, stagger: 0.03, ground: gy }); break;
          default: break;         // bolt / mortar / storm: the projectile comes as its own `bolt` event
        }
      } catch { /* an effect that cannot draw is not worth a crash */ }
      return;
    }
    if ((ev.kind === 'arrow' || ev.kind === 'bolt') && ev.basic && spellFx) {
      stats.shots++; pendingShots.delete(ev.id);
      const a = actors?.get(ev.id); if (!a) return;
      const el = elementKey(ev.el || ev.element);
      try { spellFx.cast({ at: new THREE.Vector3(a.pos.x + Math.sin(a.yaw) * 0.4, a.pos.y + 1.2, a.pos.z + Math.cos(a.yaw) * 0.4), element: el === 'physical' ? 'physical' : el, ms: 160, ground: a.pos.y }); } catch {}
    }
  }

  function update(dt) {
    if (pendingShots.size) {
      const now = performance.now();
      for (const [id, p] of pendingShots) {
        if (now - p.at < 140) continue;
        pendingShots.delete(id);
        const a = actors?.get(id), t = actors?.get(p.ev.target ?? p.ev.d ?? targetOf(id));
        if (!a || !spellFx) continue;
        const el = elementKey(p.ev.el);
        const from = new THREE.Vector3(a.pos.x, a.pos.y + Math.max(0.6, a.height * 0.6), a.pos.z);
        const to = t ? new THREE.Vector3(t.pos.x, t.pos.y + Math.max(0.4, t.height * 0.55), t.pos.z) : from.clone().add(new THREE.Vector3(Math.sin(a.yaw) * 6, 0, Math.cos(a.yaw) * 6));
        stats.shots++;
        try { spellFx.projectile({ from, to, element: el === 'physical' && p.ev.wk === 'bolt' ? 'arcane' : el, shape: p.ev.wk === 'arrow' ? 'arrow' : null, ms: Math.max(90, from.distanceTo(to) / 40 * 1000) }); } catch {}
      }
    }
    for (const it of items) {
      if (!it.m.visible) continue;
      it.t += dt;
      const k = it.t / it.life;
      if (k >= 1) { it.m.visible = false; it.m.material.opacity = 0; continue; }
      // the crescent sweeps across the arc as it fades: the swing reads as motion, not a stamp
      it.m.rotation.y = it.yaw0 + it.sweep * (1 - 2 * Math.min(1, k * 1.6)) * 0.5;
      it.m.material.opacity = 0.95 * (1 - k) * (1 - k);
    }
  }
  return { onEvent, update, stats, dispose() { for (const it of items) { scene.remove(it.m); it.m.material.dispose(); } for (const g of GEO.values()) g.dispose(); } };
}
