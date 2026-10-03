// Actors: one drawn body per sim entity (docs/interfaces.md §5.2), interpolated between ticks.
//
// M1 draws capsules. The body is made by a FACTORY so stream C (M7) can swap capsules for Chibi 2 /
// creature models without touching this file: `createActors({ ..., makeBody })` where
//   makeBody(ent, look) -> { object: THREE.Object3D, height, play?(act, t), dispose?() }
// The wrapper this file puts around a body (team ring, blob shadow, HP bar, hit flash, death sink)
// stays the same whatever the body is.

import * as THREE from 'three';
import { TEAM_COLORS } from './terrain.js';

const TAU = Math.PI * 2;
function lerpAngle(a, b, t) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; }

// Body colour per look (capsule stand-in until the art pass).
const LOOK_COLORS = {
  human: 0xc9a27e, halfling: 0xd8b48a, dwarf: 0xa9784f, orc: 0x6f8f45, undead: 0xa9b8b0, beast: 0x8a6a48,
  golem: 0x8e9196, tuskback: 0x6b5a4a, crow: 0x2c2c34, ghoul: 0x8a9a80, bone_colossus: 0xd8d2bc,
  wolf: 0x7d7468, saber_cat: 0xc0904a, thornback: 0x5d6b40,
};
const OUTFIT_COLORS = {
  fighter: 0x6c7da0, ranger: 0x4f7a43, knight: 0x9aa4b5, cleric: 0xe6e0cc, paladin: 0xd9c27a,
};
const HERO_COLORS = { warrior: 0xb54a3a, ranger: 0x3f7a4a, pyromancer: 0xd8742c, druid: 0x6a8f3a };

function lookOf(ent, data) {
  if (ent.kind === 'hero') return { hero: ent.type };
  if (ent.kind === 'tide') return { tide: true };
  return data.units?.units?.[ent.type]?.model || {};
}

// ---------- shared resources ----------
let RES = null;
function res() {
  if (RES) return RES;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const shadowTex = new THREE.CanvasTexture(c);
  RES = {
    shadowGeo: new THREE.PlaneGeometry(1, 1),
    shadowMat: new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    ringGeo: new THREE.RingGeometry(0.82, 1, 28),
    ringMats: TEAM_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false })),
    tideRing: new THREE.MeshBasicMaterial({ color: 0x9a8f80, transparent: true, opacity: 0.6, depthWrite: false }),
    selRing: new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, depthWrite: false }),
    barBg: new THREE.SpriteMaterial({ color: 0x0b0d10, depthTest: false, transparent: true, opacity: 0.85 }),
    barFgTeam: TEAM_COLORS.map((c) => new THREE.SpriteMaterial({ color: c, depthTest: false })),
    barFgEnemy: new THREE.SpriteMaterial({ color: 0xe0503e, depthTest: false }),
    barFgTide: new THREE.SpriteMaterial({ color: 0xc8b48a, depthTest: false }),
    barMp: new THREE.SpriteMaterial({ color: 0x4f8ff0, depthTest: false }),
  };
  return RES;
}

/** Default body: a capsule with a head, a weapon nub for ranged units, a crest for heroes. */
export function capsuleBody(ent, look, data) {
  const g = new THREE.Group();
  const r = Math.max(0.3, ent.r || 0.45);
  const isHero = ent.kind === 'hero';
  const isTide = ent.kind === 'tide';
  const big = !isHero && !isTide && (data.units?.units?.[ent.type]?.tier || 1) >= 4;
  const h = isHero ? 1.5 : big ? r * 2.2 : isTide ? 0.9 : 1.05;
  const skin = isHero ? 0xe2b896 : LOOK_COLORS[look.chibi2 || look.creature] ?? (isTide ? 0x8a7d6a : 0xb0a090);
  const cloth = isHero ? HERO_COLORS[ent.type] ?? 0x888888 : OUTFIT_COLORS[look.outfit] ?? skin;
  const bodyMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.8, h * 0.55, 4, 10), bodyMat);
  body.position.y = r * 0.8 + h * 0.275; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.62, 12, 8), skinMat);
  head.position.y = r * 1.6 + h * 0.55 + r * 0.25; g.add(head);
  // A nose so facing reads at a glance.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(r * 0.18, r * 0.4, 6), skinMat);
  nose.rotation.x = Math.PI / 2; nose.position.set(0, head.position.y, r * 0.62); g.add(nose);
  const u = data.units?.units?.[ent.type];
  const ranged = isHero ? (data.heroes?.heroes?.[ent.type]?.melee === false) : (u?.range || 0) > 3;
  const weaponMat = new THREE.MeshStandardMaterial({ color: ranged ? 0x6b4a2a : 0xc8ccd4, metalness: ranged ? 0 : 0.6, roughness: 0.4 });
  const weapon = new THREE.Mesh(ranged ? new THREE.CylinderGeometry(0.04, 0.04, h * 0.9, 5) : new THREE.BoxGeometry(0.08, h * 0.75, 0.16), weaponMat);
  weapon.position.set(r * 0.95, body.position.y + h * 0.1, r * 0.3); weapon.rotation.x = 0.5; g.add(weapon);
  if (isHero) {
    const crest = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, r * 0.6, 4), new THREE.MeshStandardMaterial({ color: 0xffd66b, metalness: 0.7, roughness: 0.3, emissive: 0x332200 }));
    crest.position.y = head.position.y + r * 0.75; g.add(crest);
  }
  if (big) { body.scale.set(1.3, 1, 1.3); }
  const height = head.position.y + r * 0.7;
  return {
    object: g, height, mats: [bodyMat, skinMat],
    weapon,
    play(act, t, phase) {
      // Procedural motion: bob when walking, lunge when attacking.
      const walk = act === 'walk';
      body.position.y = r * 0.8 + h * 0.275 + (walk ? Math.abs(Math.sin(t * 9 + phase)) * 0.08 : 0);
      head.position.y = r * 1.6 + h * 0.55 + r * 0.25 + (walk ? Math.abs(Math.sin(t * 9 + phase)) * 0.08 : 0);
      weapon.rotation.x = act === 'attack' ? 0.5 + Math.max(0, Math.sin(t * 12 + phase)) * 1.4 : act === 'cast' ? -0.6 : 0.5;
    },
    dispose() { g.traverse((o) => o.geometry?.dispose?.()); bodyMat.dispose(); skinMat.dispose(); weaponMat.dispose(); },
  };
}

export function createActors({ scene, data, makeBody = capsuleBody, localTeam = 0 }) {
  const R = res();
  const root = new THREE.Group(); root.name = 'actors'; scene.add(root);
  const actors = new Map();         // id -> actor
  const dying = [];                 // actors playing their death after leaving state.ents
  let time = 0;
  let selectedId = -1, hoverId = -1;

  function make(ent) {
    const look = lookOf(ent, data);
    const body = makeBody(ent, look, data);
    const g = new THREE.Group();
    const yaw = new THREE.Group();       // only the body turns; ring, shadow and bars stay put
    yaw.add(body.object);
    g.add(yaw);
    const r = Math.max(0.3, ent.r || 0.45);
    const shadow = new THREE.Mesh(R.shadowGeo, R.shadowMat);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.scale.setScalar(r * 3.2); shadow.renderOrder = 1;
    g.add(shadow);
    const ring = new THREE.Mesh(R.ringGeo, ent.team >= 0 ? R.ringMats[ent.team] || R.tideRing : R.tideRing);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.scale.setScalar(r * 1.35); ring.renderOrder = 2;
    g.add(ring);
    const sel = new THREE.Mesh(R.ringGeo, R.selRing);
    sel.rotation.x = -Math.PI / 2; sel.position.y = 0.05; sel.scale.setScalar(r * 1.75); sel.visible = false; sel.renderOrder = 3;
    g.add(sel);
    // HP bar (sprites always face the camera).
    const barW = ent.kind === 'hero' ? 1.6 : Math.max(0.9, r * 2.2);
    const barY = body.height + 0.45;
    const bg = new THREE.Sprite(R.barBg); bg.center.set(0, 0.5); bg.scale.set(barW + 0.08, 0.2, 1); bg.position.set(-barW / 2 - 0.04, barY, 0); bg.renderOrder = 10;
    const fgMat = ent.kind === 'tide' ? R.barFgTide : (ent.team === localTeam ? R.barFgTeam[ent.team] : R.barFgEnemy);
    const fg = new THREE.Sprite(fgMat); fg.center.set(0, 0.5); fg.scale.set(barW, 0.12, 1); fg.position.set(-barW / 2, barY, 0); fg.renderOrder = 11;
    g.add(bg, fg);
    let mp = null;
    if (ent.kind === 'hero') {
      mp = new THREE.Sprite(R.barMp); mp.center.set(0, 0.5); mp.scale.set(barW, 0.06, 1); mp.position.set(-barW / 2, barY - 0.13, 0); mp.renderOrder = 11;
      g.add(mp);
    }
    root.add(g);
    const a = { id: ent.id, ent, kind: ent.kind, team: ent.team, group: g, yaw, body, ring, sel, bg, fg, mp, barW,
      flash: 0, phase: (ent.id * 1.37) % TAU, lunge: 0, fade: 0, height: body.height, x: ent.x, z: ent.z };
    g.position.set(ent.x, 0, ent.z);
    yaw.rotation.y = ent.face || 0;
    actors.set(ent.id, a);
    return a;
  }

  function drop(a, animate) {
    actors.delete(a.id);
    if (animate) { a.fade = 0.0001; dying.push(a); return; }
    root.remove(a.group); a.body.dispose?.();
  }

  return {
    root, actors,
    get selected() { return selectedId; },
    select(id) { selectedId = id; },
    hover(id) { hoverId = id; },
    /** Per-frame sync with the sim state. `alpha` 0..1 between ticks. */
    sync(state, alpha, dt) {
      time += dt;
      const seen = new Set();
      for (const e of state.ents) {
        seen.add(e.id);
        let a = actors.get(e.id);
        if (!a) a = make(e);
        a.ent = e;
        const x = e.px + (e.x - e.px) * alpha, z = e.pz + (e.z - e.pz) * alpha;
        a.x = x; a.z = z;
        a.group.position.set(x, 0, z);
        a.yaw.rotation.y = lerpAngle(e.pface ?? e.face, e.face, alpha);
        const dead = e.alive === false;
        // A dead hero lies down and goes translucent until it respawns.
        a.body.object.rotation.x += ((dead ? -Math.PI / 2 : 0) - a.body.object.rotation.x) * Math.min(1, dt * 6);
        a.body.object.position.y = dead ? 0.3 : 0;
        a.ring.visible = !dead;
        a.bg.visible = a.fg.visible = !dead && (e.hp < e.hpMax || e.kind === 'hero' || e.id === hoverId || e.id === selectedId);
        if (a.mp) a.mp.visible = a.fg.visible;
        const f = e.hpMax > 0 ? Math.max(0, Math.min(1, e.hp / e.hpMax)) : 0;
        a.fg.scale.x = a.barW * f;
        if (a.mp) a.mp.scale.x = a.barW * (e.mpMax > 0 ? Math.max(0, Math.min(1, e.mp / e.mpMax)) : 0);
        a.sel.visible = e.id === selectedId || e.id === hoverId;
        a.sel.material = R.selRing;
        a.body.play?.(dead ? 'dead' : e.act, time, a.phase);
        // Lunge toward the facing on an attack event; flash white on a hit.
        if (a.lunge > 0) {
          a.lunge = Math.max(0, a.lunge - dt * 5);
          const k = Math.sin(a.lunge * Math.PI) * 0.35;
          a.body.object.position.z = k;
        } else a.body.object.position.z = 0;
        if (a.flash > 0) {
          a.flash = Math.max(0, a.flash - dt * 6);
          for (const m of a.body.mats || []) m.emissive?.setScalar(a.flash * 0.8);
        }
      }
      for (const a of [...actors.values()]) if (!seen.has(a.id)) drop(a, a.removeWhy === 'killed');
      for (let i = dying.length - 1; i >= 0; i--) {
        const a = dying[i];
        a.fade += dt * 1.6;
        a.body.object.rotation.x = -Math.min(1, a.fade * 2) * Math.PI / 2;
        a.group.position.y = -Math.max(0, a.fade - 0.5) * 1.2;
        a.ring.visible = a.bg.visible = a.fg.visible = a.sel.visible = false;
        if (a.mp) a.mp.visible = false;
        if (a.fade >= 1.2) { root.remove(a.group); a.body.dispose?.(); dying.splice(i, 1); }
      }
    },
    onEvent(ev) {
      if (ev.type === 'attack') { const a = actors.get(ev.src); if (a) a.lunge = 1; }
      else if (ev.type === 'hit') { const a = actors.get(ev.dst); if (a) a.flash = 1; }
      else if (ev.type === 'remove') { const a = actors.get(ev.id); if (a) a.removeWhy = ev.why; }
    },
    /** Nearest living actor to a ground point within `maxDist` (picking). */
    pick(x, z, maxDist = 1.6, filter = null) {
      let best = null, bd = maxDist * maxDist;
      for (const a of actors.values()) {
        if (a.ent.alive === false) continue;
        if (filter && !filter(a)) continue;
        const r = Math.max(0.5, a.ent.r || 0.5);
        const d = (a.x - x) ** 2 + (a.z - z) ** 2 - r * r;
        if (d < bd) { bd = d; best = a; }
      }
      return best;
    },
    get(id) { return actors.get(id); },
    dispose() { for (const a of actors.values()) drop(a, false); scene.remove(root); },
  };
}
