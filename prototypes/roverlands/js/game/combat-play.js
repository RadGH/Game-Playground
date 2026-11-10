// The Rustwild in the page (Expansion 1 M8): the glue between the room's raiders (js/game/jobs/combat.js runs them)
// and what you see, hear and press. js/game/session.js makes one when the world has the Rustwild (Wayfare County).
//
//   const cb = createCombatPlay({ THREE, scene, world, net, phys, defOf, enhance, sounds, toast, S });
//     S = { ents, mySeat(), walker(), health, teleport(x, z), shoot(p, d, kind, entId), keys (input.keys), tipped() }
//   cb.onMsg(m)                    every `{ t:'job', id:'combat', … }` from the room
//   cb.control(E, seatIdx)         after the driver's input is set: a wrecked vehicle does not go
//   cb.frame(dt, s)                every frame (s = the input state): zone notice, my forward gun, repair, KO respawn
//   cb.update(camera)              draw (raiders, shots, effects, HUD)
//   cb.shotTest(p, d, len)         my shot's step meets a raider? -> { id, t, point } | null (session.js stepShots)
//   cb.shotHit(hit)                ... it did: tell the room (it checks the gun, the range and the rate)
//   cb.shellLanded(point)          a shell burst on the ground: a raider inside the blast takes the splash
//   cb.impact(E, dv)               the vehicle I drive hit something at dv m/s (crash damage in the zone)
//   cb.rateScale()                 the Quick loader: how much faster my guns fire
//   cb.hud(ctx) -> { hint, line }  cb.spots() -> map markers   cb.debug()   cb.dispose()
//
// Who decides what: the ROOM moves the raiders, flies their shots, keeps every hit point and pays; this page draws
// what it is told (raiders ~110 ms behind, like other people's vehicles), shows the room's shots flying the same
// straight line, and reports its own guns' hits.
import { createCamps, inZone, isMountGun, gunRate, segSphere, campLeft } from './combat.js';
import { FOES, WEAPONS, CRASH } from './combat-data.js';
import { createCombatFx } from '../client/combat-fx.js';
import { createCombatHud } from '../client/combat-hud.js';
import { buildModel } from '../client/models/index.js';
import { GROUPS } from '../phys/physics.js';
import { qrot } from '../phys/vmath.js';

const INTERP_MS = 110;
const BAR_RANGE = 140;

export function createCombatPlay({ THREE, scene, world, net, phys, defOf = () => null, enhance = m => m, sounds = null, toast = () => {}, S }) {
  const sites = world.sites;
  if (!sites?.rustwild?.camps?.length) return null;
  const garage = sites.rustwild.garage || null;
  const camps = createCamps(sites);
  const fx = createCombatFx({ THREE, scene });
  const hud = typeof document !== 'undefined' ? createCombatHud() : null;
  const vhp = new Map();                    // vehicle id -> { hp, max, wreck }
  const rows = new Map();                   // camp id -> the room's row ({ state, back, left, total })
  let disposed = false;
  let prog = null, inside = null, ko = false, wasOut = false, fireCd = 0, crashAt = 0, repairAsk = 0, stats = { hits: 0, sent: 0 };
  const upgrades = () => net.last?.profile?.profile?.jobs?.combat?.upgrades || [];
  const send = (step, extra = {}) => { net.send({ t: 'job', id: 'combat', step, ...extra }); stats.sent++; };
  send('sync');

  // ---------------------------------------------------------------------------------------------- the camps' models
  const M = {
    rust: enhance(new THREE.MeshStandardMaterial({ color: '#7d4a2c', roughness: 0.85, metalness: 0.3 })),
    dark: enhance(new THREE.MeshStandardMaterial({ color: '#3b3532', roughness: 0.9, metalness: 0.2 })),
    metal: enhance(new THREE.MeshStandardMaterial({ color: '#8d8b86', roughness: 0.55, metalness: 0.6 })),
    burnt: enhance(new THREE.MeshStandardMaterial({ color: '#1d1b1a', roughness: 1, metalness: 0 })),
    glow: new THREE.MeshBasicMaterial({ color: '#ff5a2a' }),
    off: new THREE.MeshBasicMaterial({ color: '#3a2a26' }),
    rotor: new THREE.MeshBasicMaterial({ color: '#cfd6da', transparent: true, opacity: 0.35, depthWrite: false }),
    barBg: new THREE.MeshBasicMaterial({ color: '#120d0c', transparent: true, opacity: 0.75, depthTest: false }),
    barFg: new THREE.MeshBasicMaterial({ color: '#ff5a3c', depthTest: false }),
  };
  const bannerTex = (() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = 128; c.height = 80; const g = c.getContext('2d');
    g.fillStyle = '#a8281f'; g.fillRect(0, 0, 128, 80); g.fillStyle = '#16100e';
    g.beginPath(); g.moveTo(14, 66); g.lineTo(40, 14); g.lineTo(58, 44); g.lineTo(76, 12); g.lineTo(112, 66); g.lineTo(88, 66); g.lineTo(76, 42); g.lineTo(60, 66); g.lineTo(46, 40); g.lineTo(36, 66); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  M.banner = new THREE.MeshStandardMaterial({ map: bannerTex, color: bannerTex ? '#ffffff' : '#a8281f', side: THREE.DoubleSide, roughness: 0.9 });
  const G = {
    base: new THREE.CylinderGeometry(0.75, 1.5, 5.8, 8), ring: new THREE.CylinderGeometry(1.5, 1.5, 0.25, 12), head: new THREE.BoxGeometry(1.4, 0.9, 1.6),
    barrel: new THREE.CylinderGeometry(0.13, 0.16, 2.3, 8).rotateX(Math.PI / 2), lamp: new THREE.SphereGeometry(0.16, 8, 6),
    genBox: new THREE.BoxGeometry(2.6, 2.0, 2.0), coil: new THREE.CylinderGeometry(0.34, 0.34, 2.6, 10), coilTop: new THREE.TorusGeometry(0.42, 0.1, 6, 14).rotateX(Math.PI / 2),
    pole: new THREE.CylinderGeometry(0.07, 0.07, 7, 6), banner: new THREE.PlaneGeometry(2.2, 1.35, 6, 2),
    droneBody: new THREE.BoxGeometry(1.1, 0.38, 1.1), arm: new THREE.BoxGeometry(2.2, 0.08, 0.14), rotor: new THREE.CylinderGeometry(0.5, 0.5, 0.03, 14), eye: new THREE.SphereGeometry(0.17, 8, 6),
    bar: new THREE.PlaneGeometry(1, 0.16),
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
  const root = new THREE.Group(); root.name = 'rustwild-camps'; scene.add(root);
  const foes = new Map();                    // id -> V (a raider as drawn)
  const bodies = [];                         // Rapier bodies we made (removed at dispose)

  function solid(x, y, z, hx, hy, hz, kinematic = false) {
    try {
      const R = phys.RAPIER;
      const rb = phys.rw.createRigidBody((kinematic ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.fixed()).setTranslation(x, y, z));
      phys.rw.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setCollisionGroups(GROUPS.static), rb);
      bodies.push(rb); return rb;
    } catch (e) { console.warn('[roverlands] combat collider', e); return null; }
  }
  function hpBar() {
    const g = new THREE.Group(), bg = new THREE.Mesh(G.bar, M.barBg), fg = new THREE.Mesh(G.bar, M.barFg);
    bg.scale.set(2.1, 1.4, 1); fg.position.z = 0.01; bg.renderOrder = 8; fg.renderOrder = 9;
    g.add(bg, fg); g.visible = false; g.userData.fg = fg; root.add(g); return g;
  }
  function makeFoe(camp, f) {
    const g = new THREE.Group(); g.position.set(...f.p);
    const V = { id: f.id, type: f.type, camp, f, g, a: null, b: null, hp: f.hp, max: f.max, dead: false, deadAt: 0, parts: {}, rb: null, bar: hpBar(), lift: 0, spin: 0 };
    if (f.type === 'turret') {
      // a scrap tower (its gun clears the shacks' roofs, so you can see it and it can see you)
      const head = new THREE.Group(); head.position.y = 6.35;
      const barrel = mesh(G.barrel, M.metal, 0, 0.1, 1.5);
      head.add(mesh(G.head, M.rust), barrel, mesh(G.lamp, M.glow, 0, 0.55, -0.3));
      g.add(mesh(G.base, M.dark, 0, 2.9, 0), mesh(G.ring, M.metal, 0, 5.85, 0), head);
      V.parts = { head, barrel }; V.lift = 6.0;
      V.rb = solid(f.p[0], f.p[1] + 2.9, f.p[2], 0.9, 2.9, 0.9);
    } else if (f.type === 'generator') {
      const coils = [mesh(G.coil, M.metal, -0.75, 3.2, 0), mesh(G.coil, M.metal, 0.75, 3.2, 0)];
      const tops = [mesh(G.coilTop, M.glow, -0.75, 4.55, 0), mesh(G.coilTop, M.glow, 0.75, 4.55, 0)];
      const flag = new THREE.Group(); flag.position.set(1.9, 0, 0.9);
      const cloth = mesh(G.banner, M.banner, 1.1, 6.2, 0); flag.add(mesh(G.pole, M.dark, 0, 3.5, 0), cloth);
      g.add(mesh(G.genBox, M.rust, 0, 1.0, 0), ...coils, ...tops, flag);
      V.parts = { tops, flag, cloth, box: g.children[0] }; V.lift = 2.6;
      V.rb = solid(f.p[0], f.p[1] + 1.1, f.p[2], 1.35, 1.1, 1.05);
    } else if (f.type === 'drone') {
      const rotors = [];
      g.add(mesh(G.droneBody, M.dark), mesh(G.arm, M.rust), mesh(G.arm, M.rust).rotateY(Math.PI / 2), mesh(G.eye, M.glow, 0, -0.05, 0.6));
      for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r = mesh(G.rotor, M.rotor, x * 1.05, 0.12, z * 1.05); rotors.push(r); g.add(r); }
      V.parts = { rotors };
    } else if (f.type === 'buggy') {
      V.lift = 0.8;
      const def = defOf('raider_buggy');
      if (def) buildModel(THREE, def, { enhance }).then(m => { if (disposed) return; V.model = m; g.add(m.group); }).catch(e => console.warn('[roverlands] raider buggy model', e));
      V.rb = solid(f.p[0], f.p[1] + 0.7, f.p[2], 0.85, 0.55, 1.8, true);
    }
    root.add(g);
    foes.set(f.id, V);
    return V;
  }
  for (const c of camps) for (const f of c.foes) makeFoe(c, f);
  // the Rustwild Gate Garage: a shed with a sign (you wake up here; the gate's buggies park here)
  if (garage) {
    const shed = new THREE.Group(); shed.position.set(garage.x, (garage.y ?? world.heightAt(garage.x, garage.z)), garage.z); shed.rotation.y = (garage.yaw || 0) + Math.PI;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 5), M.metal); roof.position.set(0, 4.2, -9);
    for (const x of [-4.3, 4.3]) for (const z of [-11.3, -6.7]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 6), M.dark); p.position.set(x, 2.1, z); shed.add(p); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 0.25), M.rust); back.position.set(0, 2, -11.5);
    shed.add(roof, back); shed.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(shed);
  }

  // ---------------------------------------------------------------------------------------------- the room's news
  const now = () => performance.now();
  function snapIn(m) {
    const t = now(), F = m.f || [];
    for (let k = 0; k + 6 < F.length; k += 7) {
      const V = foes.get(F[k]); if (!V) continue;
      const st = { t, p: [F[k + 1] / 10, F[k + 2] / 10, F[k + 3] / 10], yaw: F[k + 4] / 100, aim: F[k + 5] / 100 };
      V.a = V.b || st; V.b = st;
      setHp(V, F[k + 6], false);
    }
  }
  function setHp(V, hp, live) {
    const was = V.dead;
    V.hp = hp; V.dead = hp <= 0;
    if (V.dead && !was) die(V, live);
    if (!V.dead && was) revive(V);
  }
  const centre = V => { const p = drawnPos(V); return [p[0], p[1] + (V.type === 'drone' ? 0 : V.lift), p[2]]; };
  function die(V, live) {
    V.deadAt = now();
    const c = centre(V);
    if (live) { fx.boom(c, V.type === 'generator' ? 2.6 : V.type === 'drone' ? 0.8 : 1.4); sounds?.play(V.type === 'generator' ? 'explosion.large' : 'explosion.small', { at: { x: c[0], y: c[1], z: c[2] } }); }
    V.g.traverse(o => { if (o.isMesh && o.material !== M.rotor) { o.userData.mat ??= o.material; o.material = o.material === M.glow ? M.off : M.burnt; } });
    if (V.type === 'turret') { V.parts.head.rotation.x = 0.45; V.parts.head.position.y = 6.1; }
    if (V.type === 'generator') V.parts.flag.rotation.z = -1.25;
    V.bar.visible = false;
  }
  function revive(V) {
    V.g.traverse(o => { if (o.isMesh && o.userData.mat) { o.material = o.userData.mat; delete o.userData.mat; } });
    if (V.type === 'turret') { V.parts.head.rotation.x = 0; V.parts.head.position.y = 6.35; }
    if (V.type === 'generator') V.parts.flag.rotation.z = 0;
    V.g.rotation.set(0, 0, 0);
    if (V.model) V.model.group.visible = true;
  }
  function onMsg(m) {
    if (m.id !== 'combat') return;
    if (m.k === 'foes') snapIn(m);
    else if (m.k === 'foe') { const V = foes.get(m.fid); if (V) setHp(V, m.hp, true); }
    else if (m.k === 'camps') {
      for (const r of m.list || []) {
        const was = rows.get(r.id);
        rows.set(r.id, r);
        if (was && was.state === 'held' && r.state === 'cleared') { const c = camps.find(x => x.id === r.id); if (c) { const g = foes.get(c.foes[0].id); fx.boom(g ? centre(g) : [c.x, c.y + 2, c.z], 3); } }
      }
    } else if (m.k === 'shot') {
      fx.shot(m.s, m.kind, m.p, m.d, m.v);
      sounds?.play(m.kind === 'slug' ? 'tower.shot' : 'shot', { at: { x: m.p[0], y: m.p[1], z: m.p[2] }, gain: m.kind === 'scrap' ? 0.5 : 0.8 });
    } else if (m.k === 'boom') {
      fx.endShot(m.s);
      if (m.hit) { fx.boom(m.at, m.kind === 'slug' ? 0.8 : 0.45); sounds?.play('explosion.small', { at: { x: m.at[0], y: m.at[1], z: m.at[2] }, gain: 0.7 }); } else fx.spark(m.at);
    } else if (m.k === 'vhp') {
      const mine = S.mySeat()?.[0] === m.veh;
      const was = vhp.get(m.veh);
      if (m.hp == null) { vhp.delete(m.veh); return; }
      vhp.set(m.veh, { hp: m.hp, max: m.max, wreck: !!m.wreck });
      if (m.wreck && !was?.wreck) {
        const E = S.ents.get(m.veh); if (E) { const t = E.veh.rb.translation(); fx.boom([t.x, t.y + 0.8, t.z], 2); sounds?.play('explosion.large', { at: t }); }
        if (mine) toast('Wrecked! Get out and call another vehicle from the phone\'s Garage');
      }
      if (!m.wreck && was?.wreck && mine) toast('Back in working order');
    } else if (m.k === 'hurt') {
      const r = S.health.hurt(m.dmg);
      if (r?.out) { toast('Knocked out! You will wake up at the Rustwild Gate Garage'); ko = true; }
      else if (r) toast(`Hit! −${r.dmg} health`);
      const w = S.walker(); if (w) fx.spark([w.feet[0], w.feet[1] + 1, w.feet[2]]);
    } else if (m.k === 'cleared') {
      const text = `${m.name} cleared! +${m.gold} gold${m.level ? ` · level ${m.level} done` : ''}`;
      hud?.card(text); toast(text); sounds?.play('capture');
    } else if (m.k === 'repaired') { toast(`Repaired (${m.hp} hp). Your kit is spent at ${m.camp}.`); sounds?.play('ui'); }
    else if (m.k === 'prog') prog = { level: m.level, text: m.text };
  }

  // ---------------------------------------------------------------------------------------------- drawing
  function drawnPos(V) {
    if (!V.b) return V.f.p;
    if (!V.a || V.b.t === V.a.t) return V.b.p;
    const rt = now() - INTERP_MS, k = Math.max(0, Math.min(1.15, (rt - V.a.t) / (V.b.t - V.a.t)));
    return [V.a.p[0] + (V.b.p[0] - V.a.p[0]) * k, V.a.p[1] + (V.b.p[1] - V.a.p[1]) * k, V.a.p[2] + (V.b.p[2] - V.a.p[2]) * k];
  }
  const lerpA = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };
  function drawnAng(V, key) {
    if (!V.b) return 0;
    if (!V.a || V.b.t === V.a.t) return V.b[key];
    const rt = now() - INTERP_MS, k = Math.max(0, Math.min(1, (rt - V.a.t) / (V.b.t - V.a.t)));
    return lerpA(V.a[key], V.b[key], k);
  }
  const camPos = new THREE.Vector3();
  let smokeT = 0;
  function update(camera, dt = 1 / 60) {
    camera.getWorldPosition(camPos);
    const t = now();
    smokeT += dt;
    const puff = smokeT > 0.25; if (puff) smokeT = 0;
    for (const V of foes.values()) {
      const p = drawnPos(V), yaw = drawnAng(V, 'yaw'), aim = drawnAng(V, 'aim');
      const far = Math.hypot(p[0] - camPos.x, p[2] - camPos.z) > 900;
      V.g.visible = !far;
      if (far) continue;
      V.g.position.set(p[0], p[1], p[2]);
      if (V.type === 'turret') { V.parts.head.rotation.y = aim; }
      else if (V.type === 'drone') {
        if (V.dead) {        // falls out of the sky, then lies there
          const gy = world.heightAt(p[0], p[2]) + 0.3, ft = (t - V.deadAt) / 1000;
          V.g.position.y = Math.max(gy, p[1] - 0.5 * 9.8 * ft * ft); V.g.rotation.set(0.6, yaw, 0.4);
        } else { V.g.rotation.set(0, yaw, 0); V.spin += dt * 40; for (const r of V.parts.rotors) r.rotation.y = V.spin; V.g.position.y += Math.sin(t / 300 + V.id) * 0.15; }
      } else if (V.type === 'buggy') {
        V.g.rotation.set(V.dead ? 0.15 : 0, yaw, V.dead ? 0.5 : 0);
        if (V.dead) V.g.position.y -= 0.25;
        if (V.model) {
          const moved = V.lastP ? Math.hypot(p[0] - V.lastP[0], p[2] - V.lastP[2]) : 0; V.lastP = p;
          V.spin += moved / 0.42;
          V.model.update({ wheels: V.model.wheels.map(() => ({ comp: 0.12, steer: 0, spin: V.spin })), steer: 0 });
          if (V.model.turret) V.model.turret.yaw.rotation.y = V.dead ? 0 : aim - yaw;
        }
        if (V.rb) { V.rb.setNextKinematicTranslation({ x: p[0], y: p[1] + 0.75, z: p[2] }); V.rb.setNextKinematicRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }); }
      } else if (V.type === 'generator' && !V.dead) {
        const pos = V.parts.cloth.geometry.attributes.position, tt = t / 1000;
        for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin(tt * 5 + x * 3) * 0.12 * (x + 1.1)); }
        pos.needsUpdate = true;
      }
      // a wreck smokes for half a minute
      if (V.dead && puff && t - V.deadAt < 30000) fx.smoke([p[0], p[1] + (V.type === 'drone' ? 0.3 : V.lift + 0.6), p[2]], 1, true);
      // hp bar over a hurt raider
      const showBar = !V.dead && V.hp < V.max && camPos.distanceTo(V.g.position) < BAR_RANGE;
      V.bar.visible = showBar;
      if (showBar) {
        V.bar.position.set(p[0], p[1] + (V.type === 'drone' ? 1.2 : V.type === 'generator' ? 5.2 : V.type === 'buggy' ? 2.8 : 7.8), p[2]);
        V.bar.quaternion.copy(camera.quaternion);
        const k = Math.max(0, V.hp / V.max), fg = V.bar.userData.fg;
        fg.scale.set(2 * k, 1, 1); fg.position.x = -(1 - k);
      }
    }
    // smoking vehicles: wrecks pour it out, badly hurt ones trail a little
    if (puff) for (const [veh, R] of vhp) {
      const E = S.ents.get(veh); if (!E) continue;
      const k = R.max ? R.hp / R.max : 1;
      if (!R.wreck && k > 0.35) continue;
      const tt = E.veh.rb.translation();
      fx.smoke([tt.x, tt.y + 1.0, tt.z], R.wreck ? 2 : 1, R.wreck);
    }
    fx.update(dt, camera);
  }

  // ---------------------------------------------------------------------------------------------- my guns
  /** The nearest live raider my shot's step (p, unit d, len metres) meets: { id, t, point } | null. */
  function shotTest(p, d, len) {
    let best = null;
    const p1 = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
    for (const V of foes.values()) {
      if (V.dead || rows.get(V.camp.id)?.state === 'cleared') continue;
      const c = centre(V);
      if (Math.abs(c[0] - p[0]) > len + 4 || Math.abs(c[2] - p[2]) > len + 4) continue;
      const k = segSphere(p, p1, c, FOES[V.type].r);
      if (k != null && (!best || k * len < best.t)) best = { id: V.id, t: k * len, point: [p[0] + d[0] * k * len, p[1] + d[1] * k * len, p[2] + d[2] * k * len] };
    }
    return best;
  }
  function shotHit(hit, kind = 'pellet') {
    const seat = S.mySeat(); if (!seat) return;
    stats.hits++;
    send('hit', { veh: seat[0], to: hit.id });
    if (kind === 'shell') { fx.boom(hit.point, 1); sounds?.play('explosion.small', { at: { x: hit.point[0], y: hit.point[1], z: hit.point[2] } }); }
    else fx.spark(hit.point);
  }
  function shellLanded(point) {
    fx.boom(point, 1);
    const seat = S.mySeat(); if (!seat) return;
    let best = null, bd = WEAPONS.shell.splash;
    for (const V of foes.values()) {
      if (V.dead || rows.get(V.camp.id)?.state === 'cleared') continue;
      const c = centre(V), d = Math.hypot(c[0] - point[0], c[1] - point[1], c[2] - point[2]);
      if (d < bd) { bd = d; best = V; }
    }
    if (best) { stats.hits++; send('hit', { veh: seat[0], to: best.id, n: 1 }); }
  }
  const rateScale = () => (upgrades().includes('combat_fast_guns') ? 1.5 : 1);
  function control(E, seatIdx) {
    if (!E || seatIdx !== 0 || !vhp.get(E.id)?.wreck) return;
    Object.assign(E.veh.input, { throttle: 0, brake: 1, steer: 0, boost: false, handbrake: true, jump: false, lift: 0 });
  }
  function impact(E, dv) {
    if (!E?.veh.local || !vhp.has(E.id) || S.mySeat()?.[0] !== E.id || S.mySeat()[1] !== 0 || dv <= CRASH.safe) return;
    const t = now(); if (t - crashAt < 600) return; crashAt = t;
    send('crash', { veh: E.id, n: Math.round(dv * 10) });
  }
  /** The Second gun mount: the driver's forward machine gun (aims a little toward the raider nearest straight ahead). */
  function forwardGun(E, s, dt) {
    fireCd -= dt;
    if (!s.fire || fireCd > 0) return;
    const ups = upgrades();
    if (!isMountGun(E.kind, 0, ups)) return;
    fireCd = 1 / gunRate(E.kind, 0, ups);
    const ch = E.def.chassis || { hx: 0.9, hy: 0.3, hz: 1.8 };
    const mp = E.veh.toWorld({ x: (ch.hx || 0.9) * 0.55, y: (ch.p?.[1] || 0) + (ch.hy || 0.3) + 0.25, z: (ch.hz || 1.8) + 0.3 });
    const fwd = qrot(E.veh.rb.rotation(), { x: 0, y: 0, z: 1 });
    let d = [fwd.x, fwd.y, fwd.z], bestDot = Math.cos(0.22);
    for (const V of foes.values()) {
      if (V.dead || rows.get(V.camp.id)?.state === 'cleared') continue;
      const c = centre(V), v = [c[0] - mp.x, c[1] - mp.y, c[2] - mp.z], m = Math.hypot(...v);
      if (m > WEAPONS.pellet.range) continue;
      const dot = (v[0] * fwd.x + v[1] * fwd.y + v[2] * fwd.z) / m;
      if (dot > bestDot) { bestDot = dot; d = v.map(x => x / m); }
    }
    S.shoot([mp.x, mp.y, mp.z], d, 'pellet', E.id);
  }

  // ---------------------------------------------------------------------------------------------- every frame
  function frame(dt, s = {}) {
    const seat = S.mySeat(), E = seat ? S.ents.get(seat[0]) : null, w = S.walker();
    const at = E ? E.veh.rb.translation() : w ? { x: w.feet[0], y: w.feet[1], z: w.feet[2] } : null;
    // the border
    if (at) {
      const now2 = inZone(sites, at.x, at.z);
      if (inside !== null && now2 !== inside) {
        if (now2) { hud?.notice('Entering the Rustwild', 'Raider country — vehicles take damage here. Clear the camps for gold.'); sounds?.play('flag'); }
        else hud?.notice('Leaving the Rustwild', 'Vehicles are safe again — and whole again.');
      }
      inside = now2;
    }
    // my forward gun (Second gun mount), repair kit
    if (E && seat[1] === 0) forwardGun(E, s, dt);
    const R = E ? vhp.get(E.id) : null;
    const canRepair = !!(R && upgrades().includes('combat_repair') && (R.wreck || R.hp < R.max));
    const ask = (S.keys?.has?.('KeyG') && !frame.gWas) || (s.flip && !frame.flipWas && canRepair && !(E && S.tipped?.())) || hud?.pressed('repair');
    frame.gWas = !!S.keys?.has?.('KeyG'); frame.flipWas = !!s.flip;
    if (ask && E && now() - repairAsk > 800) { repairAsk = now(); send('repair', { veh: E.id }); }
    // knocked out in the Rustwild: you wake up at the gate garage
    const st = S.health.state;
    if (st === 'out' && !wasOut && at && inZone(sites, at.x, at.z)) ko = true;
    if (wasOut && st === 'ok' && ko) {
      ko = false;
      if (garage) { S.teleport(garage.x + 3, garage.z + 3); toast('You came round at the Rustwild Gate Garage'); }
    }
    wasOut = st === 'out';
  }

  // ---------------------------------------------------------------------------------------------- HUD + maps
  function nearestCamp(at, within = 320) {
    let best = null, bd = within;
    for (const c of camps) { const d = Math.hypot(c.x - at.x, c.z - at.z); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function campLine(c) {
    const r = rows.get(c.id);
    if (r?.state === 'cleared') return `${c.name} cleared — back in ${mmss(r.back - net.serverNow())}`;
    const alive = c.foes.filter(f => !foes.get(f.id)?.dead);
    const raiders = alive.filter(f => f.type !== 'generator').length, gen = alive.some(f => f.type === 'generator');
    return `${c.name} · ${c.title} — ${raiders ? `${raiders} raider${raiders === 1 ? '' : 's'}` : 'raiders down'}${gen ? ' + generator' : ''}`;
  }
  function hudOf() {
    const seat = S.mySeat(), E = seat ? S.ents.get(seat[0]) : null, w = S.walker();
    const at = E ? E.veh.rb.translation() : w ? { x: w.feet[0], y: w.feet[1], z: w.feet[2] } : null;
    const R = E ? vhp.get(E.id) : null;
    const c = at ? nearestCamp(at) : null;
    let hint = null;
    if (R?.wreck) hint = 'Get out — this vehicle is wrecked. Call another from the phone\'s Garage';
    else if (E && seat[1] === 0 && inside && isMountGun(E.kind, 0, upgrades())) hint = 'Fire: forward gun';
    const repair = R && upgrades().includes('combat_repair') && (R.wreck || R.hp < R.max) ? 'ready' : null;
    return { hint, line: c ? campLine(c) : null, vhp: R ? { name: E.def.name, ...R } : null, repair };
  }
  function draw(camera, dt) {
    update(camera, dt);
    const h = hudOf();
    hud?.update({ vhp: h.vhp, camp: h.line, repair: h.repair });
  }
  function spots() {
    const out = camps.map(c => ({ kind: rows.get(c.id)?.state === 'cleared' ? 'campDone' : 'camp', x: c.x, z: c.z, label: c.name }));
    if (garage) out.push({ kind: 'garage', x: garage.x, z: garage.z, label: garage.name });
    return out;
  }
  return {
    /** where a raider is hit (its drawn middle) — tests aim at it */
    centreOf: id => { const V = foes.get(id); return V ? centre(V) : null; },
    onMsg, control, frame, update: draw, shotTest, shotHit, shellLanded, impact, rateScale, spots, fx,
    hud: () => { const h = hudOf(); return { hint: h.hint, line: h.line }; },
    get inside() { return !!inside; }, vhp, foes, camps, rows,
    debug: () => ({ inside: !!inside, camps: camps.map(c => ({ id: c.id, state: rows.get(c.id)?.state || null, left: c.foes.filter(f => !foes.get(f.id)?.dead).length, back: rows.get(c.id)?.back || 0 })),
      vhp: Object.fromEntries([...vhp].map(([k, v]) => [k, { ...v }])), shots: fx.shots, hits: stats.hits, sent: stats.sent, prog, ko, notice: hud?.noticeText || null,
      seen: [...foes.values()].filter(V => V.b).length, garage: garage ? { x: garage.x, z: garage.z } : null }),
    dispose() {
      disposed = true;
      for (const rb of bodies) { try { phys.rw.removeRigidBody(rb); } catch { /* gone with the world */ } }
      root.removeFromParent(); fx.dispose(); hud?.dispose();
      for (const g of Object.values(G)) g.dispose?.();
      for (const m of Object.values(M)) m.dispose?.();
      bannerTex?.dispose();
    },
  };
}
