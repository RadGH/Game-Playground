// One drive: the world, the bodies in it, the people, the flag — glued to the room (online or solo, same calls).
//
//   const s = await createSession({ THREE, RAPIER, renderer, scene, camera, world, view, net, defs, input, settings });
//   s.frame(dt)        every animation frame
//   s.hud()            what the HUD shows this frame (speed, seat hint, flag, run clock, markers…)
//   s.dispose()
//
// Who simulates what (docs/PLAN.md "Authority"): a body whose `owner` is me is a dynamic Rapier body run here; every
// other body is kinematic, placed each tick at its owner's pose ~120 ms in the past (interpolated between the two
// states either side of that moment), so it still pushes my car and my feet. Hitting someone else's body sends them a
// `bump`; their machine applies it. My own walker is mine alone; other people are drawn from their reported state.

import { createPhysics, GROUPS, DT } from '../phys/physics.js';
import { createVehicle } from '../phys/vehicle.js';
import { createWalker } from '../phys/walker.js';
import { createProp } from '../phys/props.js';
import { buildProp } from '../client/models/props.js';
import { qrot, qslerp, yawOf } from '../phys/vmath.js';
import { buildModel } from '../client/models/index.js';
import { setDetail } from '../client/models/kit.js';
import { createRider } from '../client/riders.js';
import { createCamera } from './camera.js';
import { createWheat } from './wheat.js';
import { avatarOf } from '../../../knockabout/js/client/look.js';

const INTERP_MS = 120;
const SEND_EVERY = 1 / 20;
const ENTER_RANGE = 3.6;
const MAX_SEND = 20;          // bodies per `pos` message (js/net/protocol.js allows 24)

export async function createSession(o) {
  const { THREE, RAPIER, scene, camera, world, view, net, defs, input, settings = () => ({}), spectate = false, sounds = null } = o;
  const defOf = Object.fromEntries(defs.map(d => [d.id, d]));
  const phys = createPhysics(RAPIER, world);
  const cam = createCamera(THREE, camera, phys);
  const enhance = view?.enhance || (m => m);
  const me = net.you;
  const ents = new Map();        // id -> E
  const people = new Map();      // pid -> P (everyone, me included: P.rider)
  const pieces = [];             // falling bits of broken world
  const shots = [];              // pellets in flight
  const toasts = [];
  let walker = spectate ? null : createWalker(phys, { p: startSpot() });
  let mySeat = null;             // [entId, seatIdx]
  let carrying = null, pendingPick = null;
  let pendingHitch = null, hitchNear = null;   // a trailer I asked the room for so I can hitch it; the trailer my tow point is near
  let pendingSeat = null, sendT = 0, flag = null, run = null, lastCrash = 0, resetHold = 0, bumpT = new Map(), lastDrive = null;
  let hostPid = net.room?.host, lastDev = 'keys', sleepCursor = 0;
  const brokenSet = new Set();
  // tall wheat on the farm fields (drawn near the camera; the harvester cuts it, the room remembers the cut)
  let wheat = null;
  try { if (world.surface && o.wheat !== false) wheat = createWheat({ THREE, scene, world, enhance, quality: settings().quality || 'medium' }); } catch (e) { console.warn('[roverlands] wheat', e); }
  let cutQueue = [], cutT = 0, grain = 0;
  const stat = { ticks: 0, sent: 0 };

  function startSpot() {
    const h = world.sites?.home || { x: 0, z: 0 };
    const a = (me * 2.4) % (Math.PI * 2), r = 6 + (me % 3);
    const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
    return [x, world.heightAt(x, z) + 0.3, z];
  }
  const isPropDef = def => def.type === 'prop';
  const restLift = def => isPropDef(def) ? (def.shape?.hy ?? def.shape?.r ?? def.shape?.h / 2 ?? 0.3) + 0.08 : Math.max(...def.wheels.map(w => w.r - w.p[1] - 0.06 + 0.05)) + 0.1;

  // ---------------------------------------------------------------------------------------------- bodies
  function placeForPad(def, pad) {
    const p = world.sites?.pads?.[pad];
    if (!p) return { p: [0, world.heightAt(0, 0) + 2, 0], yaw: 0 };
    return { p: [p.x, world.heightAt(p.x, p.z) + restLift(def), p.z], yaw: p.yaw || 0 };
  }
  async function addEnt(row) {
    const def = defOf[row.kind];
    if (!def) return;
    const E = { id: row.id, kind: row.kind, def, owner: row.owner, seats: row.seats.slice(), idle: row.idle, pad: row.pad, buf: [], model: null, veh: null, acts: { ...(row.acts || {}) } };
    ents.set(row.id, E);
    const start = row.pose ? { p: row.pose.p, yaw: yawOf({ x: row.pose.q[0], y: row.pose.q[1], z: row.pose.q[2], w: row.pose.q[3] }) } : placeForPad(def, row.pad);
    if (isPropDef(def)) {
      // a loose prop (crate, bag, barrel, ball) or something you wear (the jetpack)
      E.isProp = true;
      E.veh = createProp(phys, { kind: def.kind || def.id, shape: def.shape, mass: def.mass, friction: def.friction, restitution: def.restitution }, { id: row.id, p: start.p, local: row.owner === me });
      E.model = buildProp(THREE, { kind: def.kind || def.id, shape: def.shape }, { enhance });
      if (!ents.has(row.id)) return;
      scene.add(E.model.group);
      return;
    }
    E.veh = createVehicle(phys, def, { id: row.id, p: start.p, yaw: start.yaw, local: row.owner === me });
    E.veh.onImpact = (dv, info) => onImpact(E, dv, info);
    E.veh.onWheelContact = (w, pt, n, surf, slide, dir, speed) => onWheel(E, w, pt, n, surf, slide, dir, speed);
    applyActs(E);
    E.model = await buildModel(THREE, def, { enhance });
    if (!ents.has(row.id)) return;
    scene.add(E.model.group);
  }
  function removeEnt(id) {
    const E = ents.get(id); if (!E) return;
    E.veh.dispose(); E.model?.group.removeFromParent();
    ents.delete(id);
  }
  function syncEnts(list) {
    const seen = new Set();
    for (const row of list) {
      seen.add(row.id);
      let E = ents.get(row.id);
      if (!E) { addEnt(row); continue; }
      E.seats = row.seats.slice(); E.idle = row.idle;
      if (row.acts) { if (!!row.acts.siren !== !!E.acts.siren) sounds?.siren?.(E.id, !!row.acts.siren); E.acts = { ...row.acts }; applyActs(E); }
      if (E.owner !== row.owner) {
        E.owner = row.owner;
        const last = E.buf[E.buf.length - 1];
        if (row.owner === me && last) E.veh.setRemote(last.p, last.q, last.v, last.w);
        E.veh.setLocal(row.owner === me);
      }
    }
    for (const id of [...ents.keys()]) if (!seen.has(id)) removeEnt(id);
    // my seat as the room sees it
    let mine = null;
    for (const E of ents.values()) E.seats.forEach((pid, i) => { if (pid === me) mine = [E.id, i]; });
    if (mine && (!mySeat || mine[0] !== mySeat[0] || mine[1] !== mySeat[1])) sitDown(mine);
    else if (!mine && mySeat && !pendingSeat) standUp(false);
    pendingSeat = null;
    for (const E of ents.values()) { if (E.isProp) continue; const d = E.seats[0] != null; if (d && !E.veh.driver) E.veh.wake?.(); E.veh.driver = d; }
    // a prop I asked for is mine now: pick it up
    if (pendingPick != null) { const P = ents.get(pendingPick); if (P?.owner === me) { pendingPick = null; pickUp(P); } }
    // a trailer I asked for is mine now: hitch it (if I'm still in the tow vehicle and still close)
    if (pendingHitch) { const A = ents.get(pendingHitch.from), T = ents.get(pendingHitch.to); if (T?.owner === me) { pendingHitch = null; if (A?.veh.local && mySeat?.[0] === A.id) doHitch(A, T); } }
  }
  // ---- trailers: back the tow point up to a trailer's tongue, then T / d-pad left / HITCH
  const HITCH_RANGE = 1.8;
  function nearestTrailer(A) {
    const tp = A.veh.towPointWorld?.(); if (!tp) return null;
    let best = null, bd = HITCH_RANGE;
    for (const X of ents.values()) {
      if (X === A || X.isProp || !X.def.hitch || X.veh.towedBy || X.veh.towing === A.veh) continue;
      const hp = X.veh.hitchPointWorld(); const d = Math.hypot(hp.x - tp.x, hp.y - tp.y, hp.z - tp.z);
      if (d < bd) { bd = d; best = X; }
    }
    return best;
  }
  function doHitch(A, T) {
    if (A.veh.hitch(T.veh)) { toast(`Hitched the ${T.def.name}`); sounds?.play('door', { at: T.veh.rb.translation() }); }
  }
  function hitchPress(A) {
    if (A.veh.towing) { const t = A.veh.unhitch(); const T = t && [...ents.values()].find(X => X.veh === t); toast(`Unhitched the ${T?.def.name || 'trailer'}`); return; }
    const T = nearestTrailer(A);
    if (!T) { toast('Back up to a trailer\'s tongue first'); return; }
    if (T.veh.local) doHitch(A, T); else { pendingHitch = { from: A.id, to: T.id }; net.send({ t: 'own', id: T.id }); }
  }

  // ---------------------------------------------------------------------------------------------- people
  async function personFor(pid) {
    let P = people.get(pid);
    if (P) return P;
    const info = net.room?.players?.find(p => p.pid === pid);
    P = { pid, name: info?.name || 'Driver', look: info?.look, rider: null, buf: [], last: null };
    people.set(pid, P);
    try { P.rider = await createRider(avatarOf(info?.look || { race: 'human', seed: pid * 77 })); scene.add(P.rider.group); P.rider.group.add(nameTag(P.name, pid === me)); } catch (e) { console.warn('[roverlands] rider', e); }
    return P;
  }
  function syncRoom(room) {
    hostPid = room.host;
    for (const p of room.players) if (!p.spec) personFor(p.pid);
    for (const pid of [...people.keys()]) if (!room.players.some(p => p.pid === pid)) { people.get(pid)?.rider?.dispose(); people.delete(pid); }
  }
  function nameTag(text, mine) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.min(250, g.measureText(text).width + 28);
    g.fillStyle = mine ? 'rgba(40,110,60,0.75)' : 'rgba(20,24,30,0.7)';
    g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 22); g.fill();
    g.fillStyle = '#fff'; g.fillText(text, 128, 33);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.scale.set(1.2, 0.3, 1); s.position.set(0, 2.05, 0); s.renderOrder = 10;
    s.visible = !mine;
    return s;
  }

  // ---------------------------------------------------------------------------------------------- seats
  function seatWorld(E, i) {
    const s = E.def.seats[i];
    const lp = s.stand ? s.p : [s.p[0], s.p[1], s.p[2]];
    const w = E.veh.toWorld({ x: lp[0], y: lp[1], z: lp[2] });
    return [w.x, w.y, w.z];
  }
  function nearestSeat(feet) {
    let best = null;
    for (const E of ents.values()) {
      if (E.isProp) continue;
      const t = E.veh.rb.translation();
      if (Math.hypot(t.x - feet[0], t.z - feet[2]) > ENTER_RANGE + E.def.chassis.hz) continue;
      E.def.seats.forEach((s, i) => {
        if (E.seats[i] != null) return;
        const w = seatWorld(E, i);
        // the driver seat is a little "bigger": walk up to a jeep and E puts you behind the wheel
        const d = Math.hypot(w[0] - feet[0], w[2] - feet[2]) - (i === 0 ? 0.8 : 0);
        if (d < ENTER_RANGE && (!best || d < best.d)) best = { E, i, d };
      });
    }
    return best;
  }
  function sitDown([id, i]) {
    const E = ents.get(id); if (!E) return;
    if (carrying) putDown(false);
    mySeat = [id, i];
    walker?.disable();
    cam.idle = 0;
    cam.yaw = yawOf(E.veh.rb.rotation()) + (E.def.seats[i].yaw || 0);   // sit down looking the way the seat faces
    cam.pitch = 0.22;
    if (i === 0) { lastDrive = { kind: E.kind, from: performance.now() }; }
  }
  function standUp(tell = true, thrown = null) {
    if (!mySeat) return;
    const E = ents.get(mySeat[0]);
    const s = E?.def.seats[mySeat[1]];
    let p = startSpot(), yaw = cam.yaw;
    if (E && s) {
      const w = E.veh.toWorld({ x: s.exit[0], y: s.exit[1] + s.p[1], z: s.exit[2] + s.p[2] });
      p = [w.x, w.y, w.z];
      // somewhere solid: never into a rock or under water if the other side is free
      const hit = phys.raycast([p[0], p[1] + 2, p[2]], [0, -1, 0], 6, { exclude: E.veh.rb });
      if (hit) p[1] = hit.point[1] + 0.05;
      yaw = yawOf(E.veh.rb.rotation());
    }
    if (mySeat[1] === 0 && lastDrive) { o.onLeftVehicle?.(lastDrive.kind, (performance.now() - lastDrive.from) / 1000); lastDrive = null; }
    const seatPos = E ? seatWorld(E, mySeat[1]) : p;
    mySeat = null;
    walker?.enable(thrown ? [seatPos[0], seatPos[1], seatPos[2]] : p, yaw);
    if (thrown) walker?.throwOut(thrown.v, thrown.spin, [seatPos[0], seatPos[1] + 0.6, seatPos[2]]);
    if (tell) net.send(thrown ? { t: 'unseat', thrown: 1 } : { t: 'unseat' });
    pendingSeat = 'out';
  }

  // ---------------------------------------------------------------------------------------------- carrying things
  function nearestProp(feet) {
    let best = null;
    for (const E of ents.values()) {
      if (!E.isProp || E.veh.carriedBy || E.veh.remoteCarried) continue;
      const t = E.veh.rb.translation();
      const d = Math.hypot(t.x - feet[0], t.z - feet[2]);
      if (d < 2.2 && Math.abs(t.y - feet[1] - 0.5) < 1.8 && (!best || d < best.d)) best = { E, d };
    }
    return best?.E || null;
  }
  /** A door within reach of my feet: a vehicle part with `door` (its closed box's centre, in the vehicle's frame). */
  function nearestDoor(feet) {
    let best = null;
    for (const E of ents.values()) {
      if (E.isProp || !E.def.parts) continue;
      for (const part of E.def.parts) {
        if (!part.door) continue;
        const w = E.veh.toWorld({ x: part.p[0], y: part.p[1], z: part.p[2] });
        const d = Math.hypot(w.x - feet[0], w.z - feet[2]);
        if (d < 3.2 && (!best || d < best.d)) best = { E, name: part.door, d };
      }
    }
    return best;
  }
  function pickUp(E) {
    if (!walker || carrying) return;
    carrying = E;
    const wear = !!E.def.jetpack;
    E.veh.carry(walker, { wear });
    if (wear) { walker.jetpack = { fuel: 1, ...E.def.jetpack }; toast('Jetpack on — hold jump in the air to fly'); }
  }
  function putDown(throwIt = false) {
    const E = carrying; if (!E) return;
    carrying = null;
    if (E.def.jetpack) walker.jetpack = null;
    const f = [Math.sin(walker.yaw), Math.cos(walker.yaw)], k = throwIt ? 7 : 1.5;
    E.veh.drop([walker.vel[0] + f[0] * k, (throwIt ? 3 : 1), walker.vel[2] + f[1] * k]);
  }

  // ---------------------------------------------------------------------------------------------- crashes
  function onImpact(E, dv, info) {
    if (!E.veh.local) return;
    const open = !E.def.enclosed;
    const thr = E.def.eject?.threshold ?? 12;
    const flipped = info.upright < -0.15 && E.def.eject?.upsideDown;
    if (!open || !(dv > thr || flipped)) { if (dv > 6) sounds?.play('thud', { at: E.veh.rb.translation(), gain: Math.min(1, dv / 15) }); return; }
    if (!E.seats.some(p => p != null)) return;
    const now = performance.now();
    if (now - lastCrash < 800) return;
    lastCrash = now;
    const v = info.from || E.veh.rb.linvel();
    const vel = [v.x * 0.8, Math.max(2.5, v.y * 0.5 + 3), v.z * 0.8];
    net.send({ t: 'crash', id: E.id, v: vel.map(r2) });
    crashHere(E.id, vel);
    sounds?.play('crash', { at: E.veh.rb.translation() });
  }
  function crashHere(id, vel) {
    if (!mySeat || mySeat[0] !== id) return;
    const spin = [(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8];
    standUp(true, { v: vel, spin });
    toast('Thrown out!');
  }
  const r2 = v => Math.round(v * 100) / 100;

  // ---------------------------------------------------------------------------------------------- the ground's marks
  const trackStep = new Map();
  function onWheel(E, w, pt, n, surf, slide, dir, speed) {
    if (!view) return;
    const key = E.id + ':' + w.i;
    const last = trackStep.get(key);
    if (!last || Math.hypot(pt[0] - last[0], pt[2] - last[2]) > 0.3) {
      trackStep.set(key, pt);
      if (speed > 0.4 || slide > 0.2) view.tracks?.add(key, pt[0], pt[1], pt[2], n[0], n[1], n[2], w.def.w ?? 0.3, surf.id ?? 0, dir[0], dir[2]);
    }
    const soft = (surf.rut || 0) > 0.4;
    if ((slide > 0.35 && speed > 2) || (soft && speed > 6 && Math.random() < 0.25)) view.dust?.(pt[0], pt[1] + 0.1, pt[2], surf.id ?? 0, Math.min(1, slide + speed / 30));
    const water = world.waterAt?.(pt[0], pt[2]);
    if (water != null && water > pt[1] && speed > 3 && Math.random() < 0.5) view.splash?.(pt[0], water, pt[2], Math.min(1, speed / 15));
  }

  // ---------------------------------------------------------------------------------------------- breaking things
  phys.onBreak((id, info) => {
    if (brokenSet.has(id)) return;
    brokenSet.add(id);
    net.send({ t: 'break', obj: id, dir: info.dir.map(r2), speed: r2(info.speed) });
    breakLocal(id, info.dir, info.speed);
  });
  function breakLocal(id, dir, speed, instant = false) {
    const obj = world.objects?.[id];
    view?.breakObject?.(id, { dir, speed, instant });
    if (instant || !obj) return;
    sounds?.play(obj.fall === 'flatten' ? 'rustle' : 'crack', { at: { x: obj.x, y: obj.y, z: obj.z } });
    if (obj.fall !== 'topple' || !obj.shape) return;
    const piece = view?.objectPiece?.(id);
    const r = obj.shape.r ?? Math.max(obj.shape.hx ?? 0.3, obj.shape.hz ?? 0.3), h = obj.shape.h ?? (obj.shape.hy ?? 0.5) * 2;
    const rb = phys.rw.createRigidBody(phys.RAPIER.RigidBodyDesc.dynamic().setTranslation(obj.x, obj.y, obj.z)
      .setRotation({ x: 0, y: Math.sin((obj.yaw || 0) / 2), z: 0, w: Math.cos((obj.yaw || 0) / 2) }).setAngularDamping(0.6).setLinearDamping(0.3));
    const desc = obj.shape.t === 'box' ? phys.RAPIER.ColliderDesc.cuboid(obj.shape.hx, obj.shape.hy, obj.shape.hz).setTranslation(0, obj.shape.hy, 0)
      : phys.RAPIER.ColliderDesc.cylinder(h / 2, Math.max(0.08, r)).setTranslation(0, h / 2, 0);
    phys.rw.createCollider(desc.setMass(Math.min(obj.mass || 200, 1200)).setCollisionGroups(GROUPS.piece).setFriction(0.8), rb);
    // tip it over away from whatever hit it
    const d = dir || [0, 0, 1];
    const axis = { x: d[2], y: 0, z: -d[0] };
    const k = Math.min(obj.mass || 200, 1200) * (1.2 + Math.min(speed, 20) * 0.12);
    rb.applyTorqueImpulse({ x: axis.x * k * h * 0.35, y: 0, z: axis.z * k * h * 0.35 }, true);
    rb.applyImpulse({ x: d[0] * k * 0.6, y: 0, z: d[2] * k * 0.6 }, true);
    pieces.push({ rb, mesh: piece, born: performance.now() });
    if (pieces.length > 40) dropPiece(pieces.shift());
  }
  function dropPiece(pc) { try { phys.rw.removeRigidBody(pc.rb); } catch { /* gone */ } pc.mesh?.removeFromParent?.(); }

  // ---------------------------------------------------------------------------------------------- the network
  net.on('ents', m => syncEnts(m.list));
  net.on('room', m => syncRoom(m));
  net.on('state', m => {
    for (const [id, st] of Object.entries(m.ents || {})) {
      const E = ents.get(+id); if (!E || E.owner === me) continue;
      E.buf.push({ t: m.s, ...st });
      if (E.buf.length > 30) E.buf.shift();
    }
    for (const [pid, st] of Object.entries(m.players || {})) {
      const P = people.get(+pid); if (!P || +pid === me) continue;
      P.buf.push({ t: m.s, ...st }); if (P.buf.length > 30) P.buf.shift();
      P.last = st;
    }
  });
  net.on('bump', m => { const E = ents.get(m.id); if (E?.veh.local) E.veh.applyBump(m.j, m.at); });
  net.on('crash', m => crashHere(m.id, m.v));
  net.on('broken', m => {
    for (const id of m.objs) {
      if (brokenSet.has(id)) continue;
      brokenSet.add(id);
      phys.removeObject(id);
      const hit = m.hits?.find(h => h.obj === id);
      breakLocal(id, hit?.dir || [0, 0, 1], hit?.speed || 0, !hit);
    }
  });
  net.on('flag', m => {
    const was = flag?.state;
    flag = m;
    if (m.state === 'carried' && was !== 'carried') sounds?.play('flag');
    if (m.state === 'captured' && was !== 'captured') sounds?.play('capture');
    // the screens (js/client/ui) announce flag news themselves; the session only plays the sounds
  });
  net.on('run', m => { run = m; });
  net.on('fire', m => { if (m.by !== me) spawnShot(m.p, m.d, false, m.kind || 'pellet'); });
  net.on('horn', m => { const E = ents.get(m.id); if (E) sounds?.play('horn', { at: E.veh.rb.translation() }); });
  net.on('act', m => { const E = ents.get(m.id); if (E) { E.acts[m.what] = m.on; applyActs(E); if (m.what === 'siren') sounds?.siren?.(E.id, m.on); } });
  /** Switches that change the physics: doors and lids (`door_<name>` -> vehicle.setDoor(name)). */
  function applyActs(E) { for (const [k, on] of Object.entries(E.acts || {})) if (k.startsWith('door_')) E.veh.setDoor?.(k.slice(5), on); }
  net.on('cut', m => wheat?.cut(m.cells));
  net.on('toast', m => toast(m.text));
  net.on('deny', m => { if (m.what === 'seat') { pendingSeat = null; toast(m.why || 'That seat is taken.'); } });
  const nameOf = pid => people.get(pid)?.name || net.room?.players?.find(p => p.pid === pid)?.name || 'Someone';
  function toast(text) { toasts.push({ text, at: performance.now() }); if (toasts.length > 5) toasts.shift(); o.onToast?.(text); }

  // first picture of the room: everything that arrived before this session was listening
  if (net.room) syncRoom(net.room);
  const L = net.last || {};
  if (L.ents) syncEnts(L.ents.list);
  if (L.state) for (const [id, st] of Object.entries(L.state.ents || {})) { const E = ents.get(+id); if (E && E.owner !== me) E.buf.push({ t: L.state.s, ...st }); }
  if (L.broken?.objs?.length) for (const id of L.broken.objs) if (!brokenSet.has(id)) { brokenSet.add(id); phys.removeObject(id); breakLocal(id, [0, 0, 1], 0, true); }
  if (L.cut?.cells) wheat?.cut(L.cut.cells);
  if (L.flag) flag = L.flag;
  if (L.run) run = L.run;
  await personFor(me);

  // ---------------------------------------------------------------------------------------------- interpolation
  function sample(buf, t) {
    if (!buf.length) return null;
    if (buf.length === 1 || t <= buf[0].t) return buf[0];
    for (let i = buf.length - 1; i > 0; i--) {
      const a = buf[i - 1], b = buf[i];
      if (t >= a.t && t <= b.t) {
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        return {
          p: [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k],
          q: a.q && b.q ? qa(qslerp(qo(a.q), qo(b.q), k)) : b.q, v: b.v, w: b.w, x: b.x, yaw: lerpAng(a.yaw, b.yaw, k), a: b.a, on: b.on,
          rel: a.rel && b.rel && a.on === b.on ? [a.rel[0] + (b.rel[0] - a.rel[0]) * k, a.rel[1] + (b.rel[1] - a.rel[1]) * k, a.rel[2] + (b.rel[2] - a.rel[2]) * k] : b.rel,
          ryaw: b.ryaw, rq: b.rq,
        };
      }
    }
    // past the newest: carry on a little along its velocity
    const b = buf[buf.length - 1];
    const ex = Math.min(0.25, (t - b.t) / 1000);
    return b.v ? { ...b, p: [b.p[0] + b.v[0] * ex, b.p[1] + b.v[1] * ex, b.p[2] + b.v[2] * ex] } : b;
  }
  const qo = a => ({ x: a[0], y: a[1], z: a[2], w: a[3] }), qa = q => [q.x, q.y, q.z, q.w];
  const lerpAng = (a = 0, b = 0, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };

  // ---------------------------------------------------------------------------------------------- shooting
  // Shots by kind: speed (m/s), gravity, life, what a hit does. `push` = impulse on a body hit (N·s), `blast` = radius of a
  // burst that shoves and breaks things around the hit point, `breakMax` = the strongest object a direct hit breaks.
  const SHOT = {
    pellet: { speed: 90, gravity: 0, life: 1.2, push: 900, breakMax: 4500, col: '#ffd27a', r: 0.035, len: 0.9 },
    bolt:   { speed: 120, gravity: 0, life: 1.4, push: 6000, breakMax: 9000, col: '#7fe8ff', r: 0.07, len: 1.6 },
    shell:  { speed: 140, gravity: 9.8, life: 3, push: 18000, blast: 6, breakMax: 20000, col: '#ffe0a0', r: 0.1, len: 0.6 },
    water:  { speed: 32, gravity: 9.8, life: 1.6, push: 260, breakMax: 0, col: '#bfe6ff', r: 0.09, len: 0.35, spray: 5, wet: true },
  };
  const shotGeo = new Map(), shotMat = new Map();
  function spawnShot(p, d, mine, kind = 'pellet') {
    const K = SHOT[kind] || SHOT.pellet;
    const n = K.spray || 1;
    for (let i = 0; i < n; i++) {
      const jit = n > 1 ? 0.05 : 0;
      const dd = [d[0] + (Math.random() - 0.5) * jit, d[1] + (Math.random() - 0.5) * jit, d[2] + (Math.random() - 0.5) * jit];
      const key = kind;
      if (!shotGeo.has(key)) { shotGeo.set(key, new THREE.CylinderGeometry(K.r, K.r, K.len, 5).rotateX(Math.PI / 2)); shotMat.set(key, new THREE.MeshBasicMaterial({ color: K.col, transparent: !!K.wet, opacity: K.wet ? 0.7 : 1 })); }
      const m = new THREE.Mesh(shotGeo.get(key), shotMat.get(key));
      m.position.set(...p);
      scene.add(m);
      const sp = K.speed * (1 - Math.random() * (n > 1 ? 0.15 : 0));
      shots.push({ p: [...p], v: [dd[0] * sp, dd[1] * sp, dd[2] * sp], m, life: K.life, mine, K, kind });
    }
  }
  function stepShots(dt) {
    const myE = mySeat ? ents.get(mySeat[0]) : null;
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.v[1] -= s.K.gravity * dt;
      const sp = Math.hypot(...s.v), step = sp * dt, d = [s.v[0] / sp, s.v[1] / sp, s.v[2] / sp];
      const hit = phys.raycast(s.p, d, step, { exclude: myE?.veh.rb });
      const water = !hit && world.waterAt?.(s.p[0], s.p[2]);
      if (hit || (s.life -= dt) <= 0 || (water != null && s.p[1] < water)) {
        if (hit && s.mine) shotHit(hit, d, s.K);
        if (hit) view?.[s.K.wet ? 'splash' : 'dust']?.(hit.point[0], hit.point[1], hit.point[2], s.K.wet ? 0.3 : (world.surfaceAt?.(hit.point[0], hit.point[2])?.id ?? 1), s.K.blast ? 1 : 0.6);
        if (hit && s.K.blast) { sounds?.play('crash', { at: { x: hit.point[0], y: hit.point[1], z: hit.point[2] } }); for (let k = 0; k < 6; k++) view?.dust?.(hit.point[0] + (Math.random() - 0.5) * 3, hit.point[1], hit.point[2] + (Math.random() - 0.5) * 3, 1, 1); }
        s.m.removeFromParent(); shots.splice(i, 1); continue;
      }
      s.p = [s.p[0] + s.v[0] * dt, s.p[1] + s.v[1] * dt, s.p[2] + s.v[2] * dt];
      s.m.position.set(...s.p);
      s.m.lookAt(s.p[0] + d[0], s.p[1] + d[1], s.p[2] + d[2]);
    }
  }
  function pushBody(b, j, at) {
    if (b.local) b.rb.applyImpulseAtPoint({ x: j[0], y: j[1], z: j[2] }, { x: at[0], y: at[1], z: at[2] }, true);
    else net.send({ t: 'bump', id: b.id, j: j.map(r2), at: at.map(r2) });
  }
  function breakObj(obj, d, speed) {
    if (!obj || obj.breakAt == null || brokenSet.has(obj.id)) return;
    phys.removeObject(obj.id); brokenSet.add(obj.id);
    net.send({ t: 'break', obj: obj.id, dir: d.map(r2), speed });
    breakLocal(obj.id, d, speed);
  }
  function shotHit(hit, d, K = SHOT.pellet) {
    const b = hit.info?.body;
    if (b) pushBody(b, [d[0] * K.push, d[1] * K.push, d[2] * K.push], hit.point);
    const obj = hit.info?.obj;
    if (obj && obj.breakAt != null && obj.breakAt <= K.breakMax) breakObj(obj, d, 8);
    if (K.blast) {
      // a shell's burst: everything near the hit gets shoved outward; small things break
      const c = hit.point;
      for (const X of ents.values()) {
        const t = X.veh.rb.translation(), dx = t.x - c[0], dy = t.y - c[1], dz = t.z - c[2], dd = Math.hypot(dx, dy, dz);
        if (dd > K.blast || dd < 0.01) continue;
        const k = K.push * 0.6 * (1 - dd / K.blast);
        pushBody(X.veh, [dx / dd * k, (dy / dd + 0.6) * k, dz / dd * k], [t.x, t.y, t.z]);
      }
      for (const o of world.objects || []) {
        if (o.breakAt == null || o.breakAt > K.breakMax || brokenSet.has(o.id)) continue;
        const dx = o.x - c[0], dz = o.z - c[2];
        if (dx * dx + dz * dz < K.blast * K.blast * 0.5) breakObj(o, [dx, 0.3, dz].map(v => v / (Math.hypot(dx, dz) || 1)), 10);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- per frame
  let fireCd = 0;
  const camRay = new THREE.Raycaster();
  function frame(dt) {
    dt = Math.min(dt, 0.1);
    const s = input.read(dt);
    lastDev = s.device;
    const jumpWasNow = s.jump;
    const now = net.serverNow();
    const E = mySeat ? ents.get(mySeat[0]) : null;
    const seat = E ? E.def.seats[mySeat[1]] : null;

    // ---- controls
    if (s.camNear) cam.distScale = Math.max(0.55, cam.distScale - 0.12);
    if (s.camFar) cam.distScale = Math.min(1.8, cam.distScale + 0.12);
    for (const X of ents.values()) if (X.veh.local && !X.isProp && !(E === X && mySeat[1] === 0)) Object.assign(X.veh.input, { throttle: 0, brake: 0, steer: 0, handbrake: X.seats[0] == null, boost: false, pitch: 0, lean: 0, flip: false, elev: undefined });
    if (walker && !mySeat) {
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      walker.input.mx = fx * s.my - fz * s.mx;
      walker.input.mz = fz * s.my + fx * s.mx;
      walker.input.run = !s.boost;          // run by default; hold Shift (B / L3) to walk
      walker.input.jump = s.jump;
      if (s.use && !pendingSeat && !walker.isRag()) {
        if (carrying) putDown(s.boost);
        else {
          const ns = nearestSeat(walker.feet);
          if (ns) { pendingSeat = [ns.E.id, ns.i]; net.send({ t: 'seat', id: ns.E.id, seat: ns.i }); }
          else { const np = nearestProp(walker.feet); if (np) { if (np.owner === me) pickUp(np); else { pendingPick = np.id; net.send({ t: 'own', id: np.id }); } } }
        }
      }
      if (carrying?.def.jetpack) carrying.veh.flame = walker.thrusting;
      if (s.swap && !walker.isRag()) { const nd = nearestDoor(walker.feet); if (nd) net.send({ t: 'act', id: nd.E.id, what: 'door_' + nd.name, on: !nd.E.acts['door_' + nd.name] }); }
      // the flag: walk up to it
      if (flag && (flag.state === 'site' || flag.state === 'dropped') && !walker.isRag()) {
        const fp = flagPos();
        // ask once I have stood there long enough for the room to have my position (it checks the range too)
        if (fp && Math.hypot(fp[0] - walker.feet[0], fp[2] - walker.feet[2]) < 2.6 && Math.abs(fp[1] - walker.feet[1]) < 3) {
          frame.atFlag = (frame.atFlag || 0) + dt;
          if (frame.atFlag > 0.25 && (!frame.flagAsk || performance.now() - frame.flagAsk > 1000)) { frame.flagAsk = performance.now(); net.send({ t: 'flag', act: 'take', p: walker.feet.map(r2) }); }
        } else frame.atFlag = 0;
      }
    } else if (E && seat) {
      if (s.use) standUp(true);
      else if (s.swap) {
        const n = E.def.seats.length;
        for (let k = 1; k < n; k++) { const i = (mySeat[1] + k) % n; if (E.seats[i] == null) { pendingSeat = [E.id, i]; net.send({ t: 'seat', id: E.id, seat: i }); break; } }
      }
      if (mySeat && mySeat[1] === 0 && E.veh.local) {
        const st = settings();
        let steer = s.steer;
        // look-to-steer (the old jeep shooter way): with no steering key held, turn toward where the camera points
        if (st.lookSteer !== false && !seat.gun && Math.abs(steer) < 0.05 && s.device !== 'touch' && (E.def.type === 'car') && cam.idle < 1.2) {
          let d = cam.yaw - yawOf(E.veh.rb.rotation()); d = Math.atan2(Math.sin(d), Math.cos(d));
          const fwd = E.veh.forwardSpeed();
          if (s.gas > 0.1 || fwd > 2) steer = Math.max(-1, Math.min(1, -d * 1.6));
        }
        // Space and Shift mean different things per vehicle (README "Controls by vehicle")
        const d = E.def, jumpEdge = s.jump && !frame.jumpWas;
        const inp = { throttle: s.gas, brake: s.brake, steer, handbrake: s.jump, boost: s.boost, pitch: 0, lean: 0, flip: s.jump, jump: false, lift: 0, elev: undefined };
        // bikes: stick back = lean back (wheelie), stick forward = lean forward; with keys Shift leans back (and Q / Z,
        // below, for every vehicle). Gas is the trigger / GAS button there, so the stick's Y is free.
        if (d.type === 'bike') { inp.pitch = s.boost ? 1 : s.device !== 'keys' ? -(s.my || 0) : 0; inp.lean = s.mx; }
        // helicopter on a controller / phone: the stick tips it (forward / back), gas climbs, brake sinks
        // everything else on a controller / phone: the stick's up / down leans the vehicle forward / back in the air
        // (cars, trucks, buggy, quad, tank, hover) and is the elevator on the plane (stick back = nose up)
        const sy = Math.abs(s.my || 0) > 0.15 ? -(s.my || 0) : 0;
        if (s.device !== 'keys' && d.type !== 'bike' && d.type !== 'heli' && d.type !== 'plane' && sy) inp.pitch = sy;
        // keyboard: Q leans back, Z leans forward, any vehicle but the helicopter and plane (not Ctrl: Ctrl+W closes the tab)
        if (d.type !== 'heli' && d.type !== 'plane') { const kq = (input.keys.has('KeyQ') ? 1 : 0) - (input.keys.has('KeyZ') ? 1 : 0); if (kq) inp.pitch = kq; }
        if (s.device !== 'keys' && d.type === 'plane') inp.elev = Math.max(-1, Math.min(1, sy + (s.jump ? 1 : 0) - (s.boost ? 1 : 0)));
        if (d.type === 'heli' && s.device !== 'keys') { inp.throttle = Math.max(0, s.my || 0); inp.brake = Math.max(0, -(s.my || 0)); inp.handbrake = s.jump || s.gas > 0.1; inp.boost = s.boost || s.brake > 0.1; }
        if (d.pedal) { inp.pedalTap = s.gas > 0.5 && !(frame.gasWas > 0.5); inp.pitch = 0; }
        if (d.rocket) { inp.jump = jumpEdge; inp.handbrake = false; inp.flip = false; inp.lean = s.mx; }
        if (d.forks) { inp.lift = (s.jump ? 1 : 0) - (s.boost ? 1 : 0); inp.handbrake = false; inp.boost = false; inp.flip = false; }
        if (d.type === 'heli' || d.type === 'plane') inp.flip = false;
        Object.assign(E.veh.input, inp);
        if (s.horn) { net.send({ t: 'horn', id: E.id }); sounds?.play('horn', { at: E.veh.rb.translation() }); }
        if (d.tow) { hitchNear = E.veh.towing ? 'on' : nearestTrailer(E); if (s.hitch) hitchPress(E); } else hitchNear = null;
        // on its side or roof and not moving: after 3 s it is put back on its wheels by itself (phones have no R key)
        { const up = qrot(E.veh.rb.rotation(), { x: 0, y: 1, z: 0 }).y;
          if (up < 0.55 && E.veh.speed() < 2) { frame.stuckFor = (frame.stuckFor || 0) + dt; if (frame.stuckFor > 3) { frame.stuckFor = 0; const t = E.veh.rb.translation(); E.veh.teleport([t.x, world.heightAt(t.x, t.z) + restLift(E.def) + 0.6, t.z], yawOf(E.veh.rb.rotation())); toast('Back on its wheels'); } }
          else frame.stuckFor = 0; }
        // stuck? hold R for a second to sit it back on its wheels where it is
        if (input.keys.has('KeyR')) { resetHold += dt; if (resetHold > 0.8) { const t = E.veh.rb.translation(); E.veh.teleport([t.x, world.heightAt(t.x, t.z) + restLift(E.def) + 0.6, t.z], yawOf(E.veh.rb.rotation())); resetHold = 0; toast('Back on its wheels'); } }
        else resetHold = 0;
      }
    }

    // ---- remote bodies to their interpolated pose
    const rt = now - INTERP_MS;
    for (const X of ents.values()) {
      if (X.veh.local) continue;
      const smp = sample(X.buf, rt);
      if (smp?.q) { X.veh.setRemote(smp.p, smp.q, smp.v, smp.w); X.veh.applyExtras?.(smp.x); }
    }

    // ---- physics
    const n = phys.step(dt);
    stat.ticks += n;
    if (n) bumpRemotes();

    // ---- a seat's switch (siren, light bar…): the fire button flips it
    if (E && seat?.act && !seat.gun && s.fire && !frame.fireWas) net.send({ t: 'act', id: E.id, what: seat.act, on: !E.acts[seat.act] });
    frame.fireWas = s.fire;

    // ---- turret + shooting (gunner)
    fireCd -= dt;
    if (E && seat?.gun && E.model?.turret) {
      camRay.setFromCamera({ x: 0, y: 0.08 }, camera);
      const aimHit = phys.raycast(camRay.ray.origin.toArray(), camRay.ray.direction.toArray(), 400, { exclude: E.veh.rb });
      const target = aimHit ? new THREE.Vector3(...aimHit.point) : camRay.ray.origin.clone().addScaledVector(camRay.ray.direction, 300);
      aimTurret(E, target);
      if (s.fire && fireCd <= 0) {
        fireCd = 1 / (seat.gun.rate || 6);
        E.model.turret.muzzle.updateMatrixWorld(true);
        const mp = new THREE.Vector3().setFromMatrixPosition(E.model.turret.muzzle.matrixWorld);
        const d = target.clone().sub(mp).normalize();
        const kind = seat.gun.kind || 'pellet';
        spawnShot(mp.toArray(), d.toArray(), true, kind);
        net.send({ t: 'fire', id: E.id, p: mp.toArray().map(r2), d: d.toArray().map(v => Math.round(v * 1000) / 1000), kind });
        if (kind !== 'water' || Math.random() < 0.2) sounds?.play(kind === 'water' ? 'splash' : kind === 'shell' ? 'crash' : 'shot', { at: mp, gain: kind === 'water' ? 0.3 : 1 });
        // a tank shell kicks the tank back
        if (kind === 'shell' && E.veh.local) E.veh.rb.applyImpulse({ x: -d.x * 4000, y: 0, z: -d.z * 4000 }, true);
      }
      E.turretAim = [E.model.turret.yaw.rotation.y, E.model.turret.pitch.rotation.x];
    }
    stepShots(dt);

    // ---- the harvester's header cuts standing wheat under it
    if (wheat && E?.def.harvest && mySeat?.[1] === 0 && E.veh.local && Math.abs(E.veh.forwardSpeed()) > 0.5) {
      const cells = wheat.harvest(E.veh, E.def);
      if (cells.length) {
        wheat.cut(cells); grain += cells.length; cutQueue.push(...cells);
        const hp = E.veh.toWorld({ x: 0, y: E.def.harvest.p[1] + 1, z: E.def.harvest.p[2] - 1.5 });
        if (Math.random() < 0.5) view?.dust?.(hp.x, hp.y, hp.z, 9, 0.8);
      }
    }
    cutT += dt;
    if (cutQueue.length && (cutT > 0.3 || cutQueue.length >= 380)) { cutT = 0; while (cutQueue.length) net.send({ t: 'cut', cells: cutQueue.splice(0, 400) }); }

    // ---- send what I own, 20 times a second
    sendT += dt;
    if (sendT >= SEND_EVERY) {
      sendT = 0;
      // at most MAX_SEND bodies a message (the room refuses bigger ones): everything awake first (the one I'm in
      // before the rest), then parked, sleeping ones a few at a time in turn — they are not changing anyway
      const awake = [], asleep = [];
      for (const X of ents.values()) if (X.veh.local) (X.veh.rb.isSleeping() && !X.veh.carriedBy ? asleep : awake).push(X);
      if (E) awake.sort((a, b) => (b === E) - (a === E));
      const pick = awake.slice(0, MAX_SEND);
      for (let k = 0; k < Math.min(asleep.length, MAX_SEND - pick.length, 4); k++) pick.push(asleep[(sleepCursor++) % asleep.length]);
      const owned = [];
      for (const X of pick) {
        const st = X.veh.state();
        if (X.turretAim) st.x.push(r2(X.turretAim[0]), r2(X.turretAim[1]));
        owned.push({ id: X.id, ...st });
      }
      const meState = mySeat ? { p: seatWorld(E, mySeat[1]).map(r2), yaw: r2(yawOf(E.veh.rb.rotation())), a: 'sit', seat: mySeat.slice() } : walker ? walker.state() : { p: [0, 0, 0], yaw: 0, a: 'idle' };
      net.send({ t: 'pos', me: meState, ents: owned });
      stat.sent++;
    }

    // a hitch only lives while both ends are simulated on this machine (someone else took the trailer or the truck)
    for (const X of ents.values()) if (X.veh.towing && (!X.veh.local || !X.veh.towing.trailer.local)) X.veh.unhitch();
    if (!mySeat || mySeat[1] !== 0) hitchNear = null;

    // ---- draw bodies
    for (const X of ents.values()) {
      if (!X.model) continue;
      const t = X.veh.rb.translation(), q = X.veh.rb.rotation();
      X.model.group.position.set(t.x, t.y, t.z);
      X.model.group.quaternion.set(q.x, q.y, q.z, q.w);
      X.model.update(X.veh.look ? { ...X.veh.look(), acts: X.acts, t: performance.now() / 1000 } : { flame: X.veh.flame });
      if (X.model.forks && X.def.forks) X.model.forks.position.y = X.def.forks.anchor[1] + X.veh.look().forks;
      if (!X.veh.local && X.model.turret && !(mySeat && mySeat[0] === X.id)) {
        const last = X.buf[X.buf.length - 1];
        const k = X.veh.extrasEnd();
        if (last?.x?.length > k) { X.model.turret.yaw.rotation.y = last.x[k]; X.model.turret.pitch.rotation.x = last.x[k + 1]; }
      }
      setDetail(X.model.group, camera.position.distanceToSquared(X.model.group.position) < 45 * 45);
      X.model.group.updateMatrixWorld(true);
    }
    for (let i = pieces.length - 1; i >= 0; i--) {
      const pc = pieces[i];
      const t = pc.rb.translation(), q = pc.rb.rotation();
      if (pc.mesh) { pc.mesh.position.set(t.x, t.y, t.z); pc.mesh.quaternion.set(q.x, q.y, q.z, q.w); }
      if (performance.now() - pc.born > 30000) { dropPiece(pc); pieces.splice(i, 1); }
    }

    // ---- draw people
    for (const P of people.values()) {
      if (!P.rider) continue;
      let seatOf = null;
      for (const X of ents.values()) X.seats.forEach((pid, i) => { if (pid === P.pid) seatOf = [X, i]; });
      if (P.pid === me) {
        if (mySeat && E?.model) { P.rider.seated(E.model.group, seat, handsFor(E, seat)); P.rider.group.children.at(-1).visible = false; }
        else if (walker) P.rider.onFoot(walker.feet, walker.yaw, walker.anim, walker.anim === 'rag' ? (walker.ragQ ? [walker.ragQ.x, walker.ragQ.y, walker.ragQ.z, walker.ragQ.w] : null) : null);
      } else if (seatOf && seatOf[0].model) {
        P.rider.seated(seatOf[0].model.group, seatOf[0].def.seats[seatOf[1]], handsFor(seatOf[0], seatOf[0].def.seats[seatOf[1]]));
      } else {
        const smp = sample(P.buf, rt);
        if (smp) {
          let feet = smp.p, yaw = smp.yaw;
          const on = smp.on != null ? ents.get(smp.on) : null;
          if (on && smp.rel) {      // standing on a vehicle: place them in that vehicle's frame as it is drawn now
            const w = on.veh.toWorld({ x: smp.rel[0], y: smp.rel[1], z: smp.rel[2] });
            feet = [w.x, w.y, w.z]; yaw = (smp.ryaw || 0) + yawOf(on.veh.rb.rotation());
          }
          P.rider.onFoot(feet, yaw, smp.a, smp.rq || null);
        }
      }
      P.rider.update(dt);
    }

    // ---- camera
    if (E) {
      const t = E.veh.rb.translation(), v = E.veh.rb.linvel();
      const cd = E.def.camera || { dist: 6, height: 2 };
      cam.update(dt, { target: [t.x, t.y, t.z], height: seat?.gun ? cd.height + 0.5 : cd.height, dist: cd.dist, vel: [v.x, v.y, v.z], look: { x: s.lookX, y: s.lookY, active: s.lookActive || Math.abs(s.mx) > 0 && E.def.type === 'bike' && false }, follow: mySeat?.[1] === 0 && !seat?.gun, exclude: E.veh.rb });
    } else if (walker) {
      const f = walker.feet;
      cam.update(dt, { target: f, height: 1.55, dist: 4.6, look: { x: s.lookX, y: s.lookY, active: s.lookActive }, exclude: null });
    } else {
      // spectator: follow whoever is driving the flag run, else the host
      const P = [...people.values()].find(p => p.rider) || null;
      const tgt = P?.rider?.group.position;
      cam.update(dt, { target: tgt ? [tgt.x, tgt.y, tgt.z] : [0, world.heightAt(0, 0), 0], height: 2, dist: 9, look: { x: s.lookX, y: s.lookY, active: s.lookActive } });
    }
    drawFlag(dt);
    if (sounds) {
      const list = [];
      for (const X of ents.values()) {
        if (X.seats[0] == null) continue;          // nobody at the wheel: the engine is off
        const fs = Math.abs(X.veh.forwardSpeed());
        list.push({ id: X.id, kind: X.def.type, voice: X.def.voice, rpm: Math.min(1, fs / X.def.engine.top), load: X.veh.local ? Math.max(X.veh.input.throttle, 0.15) : Math.min(1, 0.3 + fs / X.def.engine.top * 0.5),
          slide: Math.max(0, ...X.veh.wheels.map(w => (w.ground ? w.slide : 0))), at: X.veh.rb.translation(), mine: !!(mySeat && mySeat[0] === X.id) });
      }
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
      for (const X of ents.values()) if (X.acts?.siren) sounds.sirenAt?.(X.id, X.veh.rb.translation());
      sounds.engines(list, { x: camera.position.x, y: camera.position.y, z: camera.position.z, rx: fwd.z >= 0 ? -1 : 1 });
    }
    view?.update?.(dt, camera);
    wheat?.update(camera.position);
    frame.jumpWas = jumpWasNow;
    frame.gasWas = s.gas;
    if (s.map) o.onMap?.();
    if (s.menu) o.onMenu?.();
  }

  function aimTurret(E, target) {
    const tm = E.model.turret;
    const inv = new THREE.Matrix4().copy(E.model.group.matrixWorld).invert();
    const lp = target.clone().applyMatrix4(inv);
    const pv = new THREE.Vector3().copy(tm.yaw.position);
    const d = lp.sub(pv);
    tm.yaw.rotation.y = Math.atan2(d.x, d.z);
    tm.pitch.rotation.x = Math.max(-0.6, Math.min(0.35, -Math.atan2(d.y, Math.hypot(d.x, d.z))));
  }
  function handsFor(E, seat) {
    const m = E.model;
    if (!m) return null;
    if (seat.hands === 'wheel' && m.steer) { m.steer.updateMatrixWorld(true); return [new THREE.Vector3(0.14, 0, 0).applyMatrix4(m.steer.matrixWorld), new THREE.Vector3(-0.14, 0, 0).applyMatrix4(m.steer.matrixWorld)]; }
    if (seat.hands === 'bars' && m.steer) {
      m.steer.updateMatrixWorld(true);
      const b = m.steer.children.find(c => c.isGroup && c.position.y > 0.1) || m.steer;
      return [new THREE.Vector3(0.3, 0.035, -0.02).applyMatrix4(b.matrixWorld), new THREE.Vector3(-0.3, 0.035, -0.02).applyMatrix4(b.matrixWorld)];
    }
    if (seat.gun && m.turret) { m.turret.pitch.updateMatrixWorld(true); return [new THREE.Vector3(0.2, -0.05, -0.25).applyMatrix4(m.turret.pitch.matrixWorld), new THREE.Vector3(-0.2, -0.05, -0.25).applyMatrix4(m.turret.pitch.matrixWorld)]; }
    return null;
  }

  // two machines' bodies touching: I tell the other owner how hard my body hit theirs
  function bumpRemotes() {
    for (const X of ents.values()) {
      if (!X.veh.local || X.isProp || X.veh.speed() < 0.3) continue;
      for (const c of X.veh.colliders) {
        phys.rw.contactPairsWith(c, other => {
          const inf = phys.infoOf(other);
          const b = inf?.body;
          if (!b || b.local || b === X.veh) return;
          const key = X.id + '>' + b.id, t = performance.now();
          // a loose prop touching a vehicle I drive becomes mine, so the two are simulated together (trunk cargo)
          // a loose prop, or a vehicle nobody is driving (a car on my forks, a quad on my flatbed, a parked car I
          // shove), touching a vehicle I drive becomes mine, so the two are simulated together on this machine
          const oe = ents.get(b.id);
          if (oe && (oe.isProp || oe.seats[0] == null)) { if (t - (bumpT.get(key) || 0) > 1000) { bumpT.set(key, t); net.send({ t: 'own', id: b.id }); } return; }
          if (t - (bumpT.get(key) || 0) < 250) return;
          bumpT.set(key, t);
          const v = X.veh.rb.linvel(), ov = b.rb.linvel?.() || { x: 0, y: 0, z: 0 };
          const m = X.def.mass * 0.5;
          const j = [(v.x - ov.x) * m, (v.y - ov.y) * m * 0.3, (v.z - ov.z) * m];
          const at = b.rb.translation();
          net.send({ t: 'bump', id: b.id, j: j.map(r2), at: [at.x, at.y, at.z].map(r2) });
        });
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- the flag
  let flagMesh = null;
  function flagPos() {
    if (!flag) return null;
    if (flag.state === 'dropped' && flag.p) return flag.p;
    if (flag.state === 'site' || flag.state === 'home' || flag.state === 'captured') {
      const site = flag.state === 'site' ? world.sites?.flags?.find(f => String(f.id) === String(flag.site)) : world.sites?.home;
      if (site) return [site.x, world.heightAt(site.x, site.z), site.z];
    }
    if (flag.state === 'carried') {
      const P = people.get(flag.by);
      if (P?.rider) { const g = P.rider.group.position; return [g.x, g.y, g.z]; }
    }
    return null;
  }
  function drawFlag(dt) {
    if (!flagMesh) {
      flagMesh = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6), new THREE.MeshStandardMaterial({ color: '#d9d9d9', metalness: 0.6, roughness: 0.3 }));
      pole.position.y = 1.3;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 6, 2), new THREE.MeshStandardMaterial({ color: '#ffcc22', side: THREE.DoubleSide, emissive: '#553300', roughness: 0.8 }));
      cloth.position.set(0.47, 2.25, 0);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 60, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.18, depthWrite: false }));
      beam.position.y = 30;
      flagMesh.add(pole, cloth, beam);
      flagMesh.userData = { cloth, beam };
      scene.add(flagMesh);
    }
    const p = flagPos();
    flagMesh.visible = !!p;
    if (!p) return;
    const carried = flag.state === 'carried';
    flagMesh.position.set(p[0] + (carried ? 0 : 0), p[1] + (carried ? 0.4 : 0), p[2]);
    flagMesh.scale.setScalar(carried ? 0.6 : 1);
    flagMesh.userData.beam.visible = !carried;
    const c = flagMesh.userData.cloth, pos = c.geometry.attributes.position, tt = performance.now() / 1000;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin(tt * 6 + x * 5) * 0.08 * (x + 0.45)); }
    pos.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------------- what the HUD reads
  function hud() {
    const E = mySeat ? ents.get(mySeat[0]) : null;
    const seat = E ? E.def.seats[mySeat[1]] : null;
    let hint = null;
    if (!E && walker && !walker.isRag()) {
      const ns = nearestSeat(walker.feet);
      if (ns) hint = `Get in ${ns.E.def.name} (${ns.E.def.seats[ns.i].role})`;
      else if (carrying) hint = carrying.def.jetpack ? 'Take off the jetpack' : `Put down the ${carrying.def.name} (Shift: throw)`;
      else { const np = nearestProp(walker.feet); if (np) hint = np.def.jetpack ? 'Put on the jetpack' : `Pick up the ${np.def.name}`; }
      if (!hint) { const nd = nearestDoor(walker.feet); if (nd) hint = `F — ${nd.E.acts['door_' + nd.name] ? 'Close' : 'Open'} the ${nd.name === 'rear' ? 'back doors' : nd.name}`; }
    } else if (E) hint = seat.act ? `Fire: ${seat.act === 'siren' ? 'siren and lights' : seat.act} ${E.acts[seat.act] ? 'off' : 'on'}` : mySeat[1] === 0 ? (hitchNear === 'on' ? 'T — Unhitch the trailer' : hitchNear ? `T — Hitch the ${hitchNear.def.name}` : null) : seat.gun ? 'Gunner — aim and fire' : 'Passenger — look around';
    const markers = [];
    for (const P of people.values()) if (P.rider) { const g = P.rider.group.position; markers.push({ kind: P.pid === me ? 'me' : 'player', x: g.x, z: g.z, label: P.name, yaw: P.pid === me ? cam.yaw : 0 }); }
    for (const X of ents.values()) { if (X.isProp) continue; const t = X.veh.rb.translation(); markers.push({ kind: 'vehicle', vehicle: X.kind, x: t.x, z: t.z, label: X.def.name, busy: X.seats.some(p => p != null) }); }
    const fp = flagPos(); if (fp) markers.push({ kind: 'flag', x: fp[0], z: fp[2], label: 'Flag' });
    const home = world.sites?.home; if (home) markers.push({ kind: 'home', x: home.x, z: home.z, label: 'Home' });
    if (flag && flag.state !== 'carried') { const site = world.sites?.flags?.find(f => String(f.id) === String(flag.site)); if (site) markers.push({ kind: 'site', x: site.x, z: site.z, label: site.name }); }
    return {
      speed: E ? Math.abs(E.veh.forwardSpeed()) : walker ? Math.hypot(walker.vel[0], walker.vel[2]) : 0,
      kmh: E ? Math.round(Math.abs(E.veh.forwardSpeed()) * 3.6) : null,
      vehicle: E?.def.name || null, role: seat?.role || null, boost: E?.def.engine.boost ? E.veh.boostFuel : null,
      hint, hitch: !!hitchNear, flag, run, grain: E?.def.harvest ? grain : null, runClock: run?.phase === 'go' && run.startedAt ? (net.serverNow() - run.startedAt) : run?.time ?? null,
      markers, toasts: toasts.filter(t => performance.now() - t.at < 4000).map(t => t.text),
      camYaw: cam.yaw, me: walker ? walker.feet : null, device: lastDev, mode: net.room?.mode, carrying: flag?.state === 'carried' && flag.by === me,
      biome: world.biomeAt?.(...(E ? [E.veh.rb.translation().x, E.veh.rb.translation().z] : walker ? [walker.feet[0], walker.feet[2]] : [0, 0])),
    };
  }
  function debug() {
    return { me, seat: mySeat, ents: [...ents.values()].map(E => ({ id: E.id, kind: E.kind, owner: E.owner, local: E.veh.local, seats: E.seats, p: Object.values(E.veh.rb.translation()).map(v => Math.round(v * 10) / 10), yaw: Math.round(yawOf(E.veh.rb.rotation()) * 100) / 100, up: Math.round(qrot(E.veh.rb.rotation(), { x: 0, y: 1, z: 0 }).y * 100) / 100, speed: Math.round(E.veh.speed() * 10) / 10 })),
      walker: walker ? { feet: walker.feet.map(v => Math.round(v * 100) / 100), anim: walker.anim, on: walker.platform?.id ?? null } : null,
      flag, run, broken: brokenSet.size, ticks: stat.ticks, sent: stat.sent, people: people.size };
  }
  function dispose() {
    for (const id of [...ents.keys()]) removeEnt(id);
    for (const P of people.values()) P.rider?.dispose();
    for (const pc of pieces) dropPiece(pc);
    flagMesh?.removeFromParent();
    walker?.dispose();
    wheat?.dispose();
  }
  /** Tests / debug: put me (on foot) somewhere. */
  function teleport(x, z) { if (mySeat) standUp(true); walker?.enable([x, world.heightAt(x, z) + 0.2, z]); }
  return { phys, frame, hud, debug, dispose, cam, teleport, ents, people, get mySeat() { return mySeat; }, get walker() { return walker; }, standUp, toast };
}
export function fmtTime(ms) { const s = ms / 1000; const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; }
