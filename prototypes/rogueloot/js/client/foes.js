// Monsters on screen. M4: a quick stylised low-poly body per role, built from the bestiary row's `look` when it has
// one (bodyPlan, palette, size). M14 replaces the body builder with the full Rogueloot bestiary kit; the interface stays:
//   const foes = createFoes(view, labelRoot);  foes.sync(snapshotFoes, now);  foes.update(dt, renderAt);  foes.pick(x, y)
import * as THREE from 'three';
import { buildMonster, animateMonster } from './bestiary-kit.js';
import { mergeStatic } from './mesh-merge.js';

// the raw bestiary (monsters / rares / bosses rows with their full `look`), loaded once for the 3D kit
let RAW = null; const rawReady = fetch(new URL('../../data/monsters.json', import.meta.url)).then(r => r.json()).then(j => { RAW = j; }).catch(() => {});
function rawRow(s) {
  if (!RAW) return null;
  if (s.ra && RAW.rares?.list?.[s.ra]) return { ...RAW.rares.list[s.ra], id: s.ra };
  if (RAW.bosses?.[s.d]) return { ...RAW.bosses[s.d], id: s.d };
  if (RAW.monsters?.[s.d]) return { ...RAW.monsters[s.d], id: s.d };
  return null;
}
function kitBody(s, phase = 0) {
  const row = rawRow(s); if (!row) return null;
  try { const g = mergeStatic(buildMonster(row, { content: RAW, rank: s.rk, level: s.lvl, phase })); g.userData.kit = true; return g; } catch (e) { console.warn('bestiary-kit', s.d, e.message); return null; }
}

const flat = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const MOD_COLOR = { thorned: '#6aff4a', hasted: '#ffffff', brawny: '#c87a2a', stonehide: '#a0a0a0', burning: '#ff6a1a', rimed: '#9fe0ff', stormtouched: '#c0c8ff', venomous: '#8aff2a', shrouded: '#7a3ab0', warded: '#4ab8ff', summoning: '#b070ff', shifting: '#e0a0ff', leeching: '#d01a3a', cursing: '#5a1a6a', volatile: '#ff3a1a', anchored: '#5a4a3a', hale: '#3ecf5a', twinned: '#ffd040' };
const ROLE_COLORS = { brute: ['#6b8f3a', '#5a3a22', '#9c9c9c'], skirmisher: ['#8a7a3a', '#3a2a1a', '#c9b37a'], archer: ['#5f7f4a', '#6a4a2a', '#d8c9a0'], caster: ['#7a3a3a', '#2a1a2a', '#ff8a3a'], shaman: ['#4a6a7a', '#3a2a1a', '#7affd8'], leader: ['#7a5a2a', '#8a1a1a', '#ffd040'] };

/** Build a body: a chunky squat creature with a role-coloured outfit and a prop (club / bow / staff / banner). */
export function buildFoeBody(row) {
  const look = row.look || {};
  const pal = Array.isArray(look.palette) && look.palette.length >= 2 ? look.palette : ROLE_COLORS[row.role] || ROLE_COLORS.brute;
  const size = row.size || 1.3, g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const skin = flat(pal[0]), cloth = flat(pal[1]), accent = flat(pal[2] || '#cccccc');
  const plan = String(look.bodyPlan || 'biped').toLowerCase();
  const add = (geo, mat, x, y, z, s = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.setScalar(s); m.castShadow = true; body.add(m); return m; };
  if (plan.startsWith('quad') || plan === 'beast') {
    add(new THREE.IcosahedronGeometry(0.42, 0), cloth, 0, 0.55, 0).scale.set(1, 0.8, 1.5);
    add(new THREE.IcosahedronGeometry(0.3, 0), skin, 0, 0.75, 0.6);
    for (const [x, z] of [[-0.25, 0.4], [0.25, 0.4], [-0.25, -0.4], [0.25, -0.4]]) add(new THREE.CylinderGeometry(0.08, 0.06, 0.45, 5), skin, x, 0.22, z);
    add(new THREE.ConeGeometry(0.08, 0.25, 4), accent, -0.12, 1.0, 0.65); add(new THREE.ConeGeometry(0.08, 0.25, 4), accent, 0.12, 1.0, 0.65);
  } else if (plan === 'blob' || plan === 'slime') {
    add(new THREE.IcosahedronGeometry(0.55, 1), skin, 0, 0.5, 0).scale.set(1, 0.8, 1);
    add(new THREE.IcosahedronGeometry(0.1, 0), accent, -0.18, 0.7, 0.45); add(new THREE.IcosahedronGeometry(0.1, 0), accent, 0.18, 0.7, 0.45);
  } else {
    // biped: stubby legs, round body, big head, a role prop
    add(new THREE.CylinderGeometry(0.11, 0.09, 0.38, 5), cloth, -0.16, 0.19, 0); add(new THREE.CylinderGeometry(0.11, 0.09, 0.38, 5), cloth, 0.16, 0.19, 0);
    add(new THREE.IcosahedronGeometry(0.36, 0), cloth, 0, 0.62, 0).scale.set(1, 1.05, 0.85);
    const head = add(new THREE.IcosahedronGeometry(0.3, 0), skin, 0, 1.08, 0.04);
    add(new THREE.IcosahedronGeometry(0.06, 0), flat('#ffe066'), -0.11, 1.1, 0.28); add(new THREE.IcosahedronGeometry(0.06, 0), flat('#ffe066'), 0.11, 1.1, 0.28);
    add(new THREE.ConeGeometry(0.08, 0.28, 4), skin, -0.3, 1.14, 0).rotation.z = 1.1; add(new THREE.ConeGeometry(0.08, 0.28, 4), skin, 0.3, 1.14, 0).rotation.z = -1.1;
    if (row.role === 'brute' || row.role === 'leader') { add(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 6), accent, 0, 1.3, 0); add(new THREE.ConeGeometry(0.06, 0.22, 4), accent, -0.22, 1.42, 0).rotation.z = 0.6; add(new THREE.ConeGeometry(0.06, 0.22, 4), accent, 0.22, 1.42, 0).rotation.z = -0.6; }
    if (row.role === 'caster' || row.role === 'shaman') add(new THREE.ConeGeometry(0.34, 0.5, 6), cloth, 0, 1.32, 0);
    const arm = new THREE.Group(); arm.position.set(0.42, 0.7, 0.05); body.add(arm);
    const prop = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; arm.add(m); };
    if (row.role === 'archer') { prop(new THREE.TorusGeometry(0.35, 0.03, 4, 8, Math.PI), flat('#7a4f2e'), 0.1); arm.rotation.y = Math.PI / 2; }
    else if (row.role === 'caster' || row.role === 'shaman') { prop(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), flat('#6a4a2a'), 0.25); prop(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: pal[2] || '#ff8a3a' }), 0.88); }
    else if (row.role === 'leader') { prop(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), flat('#5a3a22'), 0.45); const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshLambertMaterial({ color: pal[1], side: THREE.DoubleSide })); flag.position.set(0.2, 1.0, 0); arm.add(flag); }
    else { prop(new THREE.CylinderGeometry(0.05, 0.09, 0.7, 5), flat('#6a4a2a'), 0.2); prop(new THREE.IcosahedronGeometry(0.13, 0), accent, 0.55); }
    g.userData.arm = arm; g.userData.head = head;
  }
  const s = size / 1.3; g.scale.setScalar(s);
  g.userData.body = body; g.userData.height = 1.55 * s;
  return g;
}

/** Free what only this body owns (merged pieces; the kit's shared geometry and materials stay cached). */
function freeBody(g) { g.traverse(o => { if (o.name === 'merged') o.geometry.dispose(); }); }

export function createFoes(view, labelRoot, { content = null } = {}) {
  const list = new Map();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0.85, depthWrite: false }));
  ring.visible = false; view.scene.add(ring);
  function add(s) {
    const row = content?.monsters?.[s.d] || { role: guessRole(s.d), size: 1.3, look: {} };
    const group = kitBody(s) || buildFoeBody(row); view.scene.add(group);
    const tag = document.createElement('div'); tag.className = 'foe-tag' + (s.rk ? ' rk-' + s.rk : '');
    tag.innerHTML = `<span class="nm"></span><i class="bar"><b></b></i>`; labelRoot.append(tag);
    const f = { ph: s.ph || 0, kit: !!group.userData.kit, id: s.id, group, tag, buf: [], x: s.x, z: s.z, yaw: s.yaw, st: s.st, hp: s.hp, mhp: s.mhp, row, deadAt: 0, swingAt: -9, hitAt: -9, name: s.n, lvl: s.lvl, cast: null };
    tag.querySelector('.nm').textContent = s.n;
    list.set(s.id, f); return f;
  }
  function sync(foes, now) {
    const seen = new Set();
    for (const s of foes) {
      seen.add(s.id);
      const f = list.get(s.id) || add(s);
      f.buf.push({ at: now, x: s.x, z: s.z, yaw: s.yaw }); if (f.buf.length > 8) f.buf.shift();
      if (s.st === 'dead' && f.st !== 'dead') f.deadAt = now;
      // the kit arrived after this body was built, or a boss changed phase: rebuild the body
      if ((!f.kit && RAW) || (f.kit && (s.ph || 0) !== f.ph)) { const ng = kitBody(s, s.ph || 0); if (ng) { if (f.aura) { f.group.remove(f.aura); ng.add(f.aura); } ng.position.copy(f.group.position); ng.rotation.y = f.group.rotation.y; view.scene.remove(f.group); freeBody(f.group); view.scene.add(ng); f.group = ng; f.kit = true; f.ph = s.ph || 0; } else f.kit = true; }
      f.st = s.st; f.hp = s.hp; f.mhp = s.mhp; f.lvl = s.lvl; f.cast = s.cast || null; f.rk = s.rk; f.tg = s.tg; f.ward = s.ward;
      // champions and rares wear their modifiers: a coloured ring underfoot (the tell), the name plate says which
      const modKey = (s.mods || []).join(',');
      if (modKey !== f.modKey) { f.modKey = modKey; if (f.aura) { f.group.remove(f.aura); f.aura = null; } if (s.mods?.length || s.rk) { const c = MOD_COLOR[s.mods?.[0]] || (s.rk === 'rare' ? '#ffd040' : '#6ab8ff'); f.aura = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.05, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, depthWrite: false })); f.aura.position.y = 0.05; f.group.add(f.aura); } }
      if (s.n !== f.name) { f.name = s.n; f.tag.querySelector('.nm').textContent = s.n; }
      f.tag.className = 'foe-tag' + (s.rk ? ' rk-' + s.rk : '') + (f.tag.classList.contains('tg') ? ' tg' : '');
    }
    for (const [id, f] of list) if (!seen.has(id)) { view.scene.remove(f.group); freeBody(f.group); f.tag.remove(); list.delete(id); }
  }
  const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
  const v = new THREE.Vector3();
  function update(dt, renderAt, now, targetId, focus = null) {
    const W = view.renderer.domElement.clientWidth, H = view.renderer.domElement.clientHeight;
    ring.visible = false;
    const far = 46;                                   // past the fog: not drawn, not animated (phones, ruling 14)
    for (const f of list.values()) {
      if (focus && Math.hypot(f.x - focus.x, f.z - focus.z) > far && f.id !== targetId) {
        if (f.group.visible) { f.group.visible = false; f.tag.hidden = true; }
        const b = f.buf; if (b.length) { const p1 = b[b.length - 1]; f.x = p1.x; f.z = p1.z; }
        continue;
      }
      f.group.visible = true;
      const b = f.buf; if (b.length) {
        let i = b.length - 1; while (i > 0 && b[i - 1].at > renderAt) i--;
        const p1 = b[i], p0 = b[Math.max(0, i - 1)], k = p1.at === p0.at ? 1 : Math.max(0, Math.min(1, (renderAt - p0.at) / (p1.at - p0.at)));
        f.x = p0.x + (p1.x - p0.x) * k; f.z = p0.z + (p1.z - p0.z) * k; f.yaw = lerpAngle(p0.yaw, p1.yaw, k);
      }
      const g = f.group, body = g.userData.body;
      const gy = view.groundY ? view.groundY(f.x, f.z) : 0;
      g.position.set(f.x, gy, f.z); g.rotation.y = lerpAngle(g.rotation.y, f.yaw, 1 - Math.exp(-dt * 12));
      const t = now / 1000;
      if (g.userData.kit) {
        animateMonster(g, f.st, t, dt, { swing: Math.max(0, 1 - (now - f.swingAt) / 450), hit: Math.max(0, 1 - (now - f.hitAt) / 180), cast: !!f.cast, dead: f.st === 'dead', deadT: (now - f.deadAt) / 500, landed: f.st !== 'chase' && f.st !== 'attack' && f.st !== 'wander' });
      } else if (f.st === 'dead') { const k = Math.min(1, (now - f.deadAt) / 400); body.rotation.x = -k * Math.PI / 2; body.position.y = -k * 0.2; }
      else {
        const moving = f.st === 'chase' || f.st === 'wander' || f.st === 'return';
        body.position.y = moving ? Math.abs(Math.sin(t * 9 + f.x)) * 0.12 : Math.sin(t * 2 + f.z) * 0.02;
        body.rotation.z = moving ? Math.sin(t * 9 + f.x) * 0.08 : 0;
        const sw = Math.max(0, 1 - (now - f.swingAt) / 350);
        if (g.userData.arm) g.userData.arm.rotation.x = -Math.sin(sw * Math.PI) * 1.6 + (f.cast ? -0.9 + Math.sin(t * 12) * 0.2 : 0);
        const hit = Math.max(0, 1 - (now - f.hitAt) / 180); body.scale.setScalar(1 + hit * 0.12);
      }
      if (f.id === targetId && f.st !== 'dead') { ring.visible = true; ring.position.set(f.x, gy + 0.04, f.z); ring.scale.setScalar(g.userData.radius ? Math.max(0.8, g.userData.radius / 0.7) : Math.max(0.8, g.scale.x)); }
      // name + health over the head
      const show = f.st !== 'dead' && (f.hp < f.mhp || f.id === targetId || f.rk || f.st === 'attack' || f.st === 'chase');
      f.tag.hidden = !show;
      if (f.aura) f.aura.rotation.y += dt * 1.2;
      if (show) {
        v.set(f.x, gy + (g.userData.height || 1.6) + 0.35, f.z).project(view.camera);
        f.tag.style.transform = `translate(-50%, -100%) translate(${(v.x * 0.5 + 0.5) * W}px, ${(-v.y * 0.5 + 0.5) * H}px)`;
        f.tag.querySelector('b').style.width = Math.max(0, f.hp / f.mhp * 100) + '%';
        f.tag.classList.toggle('warded', !!f.ward);
        f.tag.classList.toggle('tg', f.id === targetId);
      }
    }
  }
  /** Screen point -> the foe under it (or nearest within 40 px), alive first. */
  function pick(sx, sy, { includeDead = false } = {}) {
    const W = view.renderer.domElement.clientWidth, H = view.renderer.domElement.clientHeight;
    let best = null, bd = 48 * 48;
    for (const f of list.values()) {
      if (f.st === 'dead' && !includeDead) continue;
      const H0 = f.group.userData.height || 1.3 * (f.group.scale.x || 1);
      for (const k of [0.25, 0.6, 0.95]) {
        v.set(f.x, k * H0, f.z).project(view.camera);
        const dx = (v.x * 0.5 + 0.5) * W - sx, dy = (-v.y * 0.5 + 0.5) * H - sy, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = f.id; }
      }
    }
    return best;
  }
  return { sync, update, pick, list, get: id => list.get(id), ready: rawReady };
}
const guessRole = id => /sling|archer|bow/.test(id) ? 'archer' : /hex|caster|mage/.test(id) ? 'caster' : 'brute';
