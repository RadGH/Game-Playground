// Space in the page (Expansion 1 M11): the rocket's countdown, launch assist, staging and the moment it reaches orbit;
// floating in zero-g on Lantern Station; the landing pod's reentry glow, parachute and touchdown; the travel menus at
// the station's docking hatch and the Moon's landing pad; smoke, camera shake, the space HUD. The pure rules are
// js/game/space.js; the room referees every place change (js/net/room-core.js `space` + `go`).
//
//   const sp = createSpacePlay({ THREE, scene, world, net, phys, camera, sounds, toast, S, openDealer, arrive });
//     S = the session's own bits: { walker(), mySeat(), ents, cam, me, defOf(kind) }
//   sp.active                  true while I float on the station (my walker is parked; this moves me)
//   sp.control(dt, s)          this frame's input while active
//   sp.drive(E, s, dt)         after the session set my vehicle's input: the rocket's countdown + assist, the pod's chute
//   sp.frame(dt, s)            every frame: staging, orbit, reentry, touchdown, bailing out, the lap
//   sp.meState() / sp.drawMe(rider) / sp.cam()   my `pos`, my body and the camera while floating
//   sp.hint()                  the HUD's hint while floating;  sp.nearSpot(feet)   E at the sales desk / the Moon's pad
//   sp.update(camera)          smoke, shake, the far plane, the HUD;  sp.debug();  sp.dispose()
//   travelMsg(choice, k)       (exported) the `go` message for an orbit / travel choice ('station' | 'moon' | 'county')
import { SPACE, FLOAT, assistLever, countdownStep, stageDue, travelChoices, podStart, heatTarget, heatStep, chuteHeight,
  floatStep, hullBoxes, nearestRail, wallDistance, lapDone, arrival, launchPhase, moonParking } from './space.js';
import { insideStation } from '../world/station/stationgen.js';
import { C as COUNTY } from '../world/county/county-data.js';
import { createSpaceHud } from '../client/space-hud.js';
const SPIN_S = 0.9;            // seconds one zero-g somersault takes

const r2 = v => Math.round(v * 100) / 100;
/** Tests can start the pod lower: window.roverlandsTest = { podAlt: 900 }. */
const testPodAlt = () => (typeof window !== 'undefined' && Number.isFinite(window.roverlandsTest?.podAlt) ? window.roverlandsTest.podAlt : null);

/** The `go` message for a choice on the orbit screen / a travel menu. k = which of a group (friends do not overlap). */
export function travelMsg(choice, k = 0) {
  if (choice === 'station') return { t: 'go', place: 'station', at: arrival('station', k) };
  if (choice === 'moon') return { t: 'go', place: 'moon', at: arrival('moon', k).map(v => v ?? 0) };
  // home: the pod, high over the county between the airfield and the launch site (well inside the map, so the whole
  // county is under you on the way down; the ground there is a few tens of metres up)
  const s = podStart({ x: Math.round((COUNTY.launch.x + COUNTY.airport.x) / 2 + 50), z: Math.round(COUNTY.launch.z * 0.72) }, 0, k), alt = testPodAlt();
  if (alt != null) s.p[1] = Math.max(SPACE.podMinY + 1, alt);
  return { t: 'go', place: 'county', at: s.p };
}

export function createSpacePlay(o) {
  const { THREE, scene, world, net, phys, camera, sounds = null, toast = () => {}, S } = o;
  const hudEl = o.hud || (typeof document !== 'undefined' ? createSpaceHud() : null);
  const station = world.station || null, onMoon = world.map === 'moon', county = world.map === 'county';
  const launch = county ? world.sites?.launch || null : null;
  const control = launch ? world.objects?.find(x => x.id === launch.control) : null;
  const hull = station ? { boxes: hullBoxes(world.objects), rails: station.handholds || [] } : null;
  const hatch = station ? station.spots.find(x => x.id === 'dock_hatch') : null;
  const k = Math.abs(S.me | 0) % 4;
  let fl = null;                        // floating: { p, v, held, yaw }
  const visited = new Set(); let lapSent = false;
  let rk = { id: null, count: null, lit: false, sent: false, autoStage: false, lastAlt: 0 };
  let pod = { id: null, kicked: false, heat: 0, chuteSent: false, still: 0, done: false, was: false, vel: [0, 0, 0] };
  let shake = 0, banner = null, jumpWas = false, farSet = false, lastWind = 0, fogBase = null;
  const groundAt = (x, z) => world.heightAt(x, z);
  const altOf = E => { const t = E.veh.rb.translation(); return t.y - (launch ? launch.y : groundAt(t.x, t.z)); };

  // ------------------------------------------------------------------------------------------------ smoke
  const smoke = [], smokeGroup = new THREE.Group(); smokeGroup.name = 'space-smoke'; scene.add(smokeGroup);
  let smokeTex = null, smokeAcc = 0;
  function puffTex() {
    if (smokeTex || typeof document === 'undefined') return smokeTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(240,240,240,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    smokeTex = new THREE.CanvasTexture(c); return smokeTex;
  }
  function puff(p, v, size, life, color = '#dcdcdc') {
    if (!puffTex()) return;
    let s = smoke.find(x => !x.on);
    if (!s) { if (smoke.length >= 140) return; s = { sp: new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false })), on: false }; smokeGroup.add(s.sp); smoke.push(s); }
    s.on = true; s.p = p.slice(); s.v = v.slice(); s.size = size; s.age = 0; s.life = life;
    s.sp.material.color.set(color); s.sp.visible = true;
  }
  function stepSmoke(dt) {
    for (const s of smoke) {
      if (!s.on) continue;
      s.age += dt;
      if (s.age >= s.life) { s.on = false; s.sp.visible = false; continue; }
      for (let i = 0; i < 3; i++) { s.p[i] += s.v[i] * dt; s.v[i] *= Math.max(0, 1 - dt * 0.9); }
      const f = s.age / s.life, sz = s.size * (0.4 + f * 1.6);
      s.sp.position.set(s.p[0], s.p[1], s.p[2]); s.sp.scale.set(sz, sz, 1);
      s.sp.material.opacity = (1 - f) * 0.7;
    }
  }

  // ------------------------------------------------------------------------------------------------ zero-g
  if (station) {
    const a = arrival('station', k);
    fl = { p: a.slice(), v: [0, 0, 0], held: null, yaw: Math.PI / 2 };
    S.walker()?.disable();
    S.cam.yaw = Math.PI / 2; S.cam.pitch = 0.15; S.cam.snap?.();
  }
  // arriving on the Moon: face the rover parked beside the landing pad
  if (onMoon && o.arrive?.at) { const r = moonParking()[0], a = o.arrive.at; S.cam.yaw = Math.atan2(r.x - a[0], r.z - a[2]); S.cam.pitch = 0.3; }
  const look = () => S.cam.aimDir();
  const nearHatch = () => hatch && fl && Math.hypot(fl.p[0] - hatch.x, fl.p[1] - hatch.y, fl.p[2] - hatch.z) < 3.2;
  const roomOf = p => station ? insideStation(world, p[0], p[1], p[2]) : null;
  function controlFloat(dt, s) {
    const jumpEdge = s.jump && !jumpWas; jumpWas = s.jump;
    if (hudEl?.menuOpen) return;
    const L = look(), yaw = S.cam.yaw, R = [-Math.cos(yaw), 0, Math.sin(yaw)];
    const move = [L[0] * s.my + R[0] * s.mx, L[1] * s.my, L[2] * s.my + R[2] * s.mx];
    let grab = !!hudEl?.pressed('grab');
    if (s.use) { if (nearHatch()) openTravel('station'); else grab = true; }
    const kick = jumpEdge || !!hudEl?.pressed('push');
    // a somersault: R / d-pad right / the SPIN button (three in a row earn "Zero-g somersault")
    if (fl.spin > 0) fl.spin = Math.max(0, fl.spin - dt);
    if ((s.reset || s.flip || hudEl?.pressed('spin')) && !(fl.spin > 0)) { fl.spin = SPIN_S; net.send({ t: 'space', step: 'spin' }); sounds?.play('ui', { gain: 0.3 }); }
    const r = floatStep(fl, { move, kick, grab, look: L }, dt, hull);
    if (r.kicked) sounds?.play('thud', { gain: 0.35 });
    if (r.grabbed) sounds?.play('ui', { gain: 0.5 });
    if (kick && !r.kicked) toast('Nothing to push off — float up to a wall or a rail first');
    if (Math.hypot(...move) > 0.1 || r.kicked) fl.yaw = yaw;
    const room = roomOf(fl.p);
    if (room && station.rooms.some(x => x.id === room)) visited.add(room);
    if (!lapSent && lapDone(visited, station.rooms)) { lapSent = true; net.send({ t: 'space', step: 'lap' }); banner = 'Grand tour — you floated through every room of Lantern Station'; }
  }

  // ------------------------------------------------------------------------------------------------ travel menus
  function openTravel(place) {
    if (!hudEl) return;
    const title = place === 'station' ? 'Docking hatch' : 'Greywatch Landing';
    const text = place === 'station' ? 'The Homeward Pod is docked here, and a shuttle runs to the Moon.' : 'The Homeward Pod waits on the pad; a shuttle flies up to Lantern Station.';
    hudEl.menu({ title, text, choices: travelChoices(place), onPick: id => { if (!id) return; const c = travelChoices(place).find(x => x.id === id); if (c) go(c.id); } });
  }
  function go(choice) {
    net.send(travelMsg(choice, k));
    toast(choice === 'home' || choice === 'county' ? 'Into the pod — here we go' : choice === 'moon' ? 'Off to the Moon' : 'Off to Lantern Station');
  }

  // ------------------------------------------------------------------------------------------------ driving hooks
  /** After the session set my vehicle's input this frame (I drive it). */
  function drive(E, s, dt) {
    if (E.kind === 'rocket') {
      const alt = altOf(E), inp = E.veh.input;
      if (!rk.lit && (alt > 5 || (E.veh.lever || 0) > 0.05)) rk.lit = true;            // sat down in one already flying
      if (!rk.lit) {
        const ask = s.gas > 0.5 || (s.jump && !jumpWas) || hudEl?.pressed('launch');
        if (rk.count == null && ask && launch) { rk.count = SPACE.countdown; net.send({ t: 'act', id: E.id, what: 'countdown', on: true }); toast('Countdown! Hold on…'); sounds?.play('ui'); }
        inp.throttle = 0; inp.brake = 1;                                             // the lever stays at 0 until ignition
      } else {
        E.veh.lever = assistLever(E.veh.lever || 0, dt, s.brake);
        inp.throttle = 0; inp.brake = 0;
      }
      if (hudEl?.pressed('stage') && !E.acts.door_stage) net.send({ t: 'act', id: E.id, what: 'door_stage', on: true });
    }
    if (E.kind === 'landing_pod') {
      if (((s.jump && !jumpWas) || hudEl?.pressed('chute')) && !E.acts.door_chute) { net.send({ t: 'act', id: E.id, what: 'door_chute', on: true }); pod.chuteSent = true; }
    }
  }

  // ------------------------------------------------------------------------------------------------ every frame
  function frame(dt, s) {
    const seat = S.mySeat(), E = seat ? S.ents.get(seat[0]) : null;
    // friends' rockets: their flame from how fast they climb (the lever lives on the driver's machine)
    for (const X of S.ents.values()) if (X.kind === 'rocket' && !X.veh.local) X.veh.lever = X.veh.rb.linvel().y > 3 ? 1 : 0;
    // ---- the rocket (anyone aboard counts down; the driver's machine flies it)
    if (E?.kind === 'rocket') {
      if (rk.id !== E.id) rk = { id: E.id, count: null, lit: false, sent: false, autoStage: false, lastAlt: 0 };
      if (rk.count == null && !rk.lit && E.acts.countdown && seat[1] !== 0) rk.count = SPACE.countdown;   // a passenger sees it too
      if (rk.count != null) {
        const c = countdownStep(rk.count, dt);
        if (Math.ceil(c.left ?? 0) !== Math.ceil(rk.count)) sounds?.play('ui', { gain: 0.6 });
        rk.count = c.left;
        if (c.go) { rk.lit = true; shake = 1; sounds?.play('crash'); toast('Ignition! Liftoff — A / D and the stick tip it, S eases off'); }
      }
      const alt = altOf(E); rk.lastAlt = alt;
      const due = stageDue(alt, !!E.acts.door_stage);
      if (due === 'auto' && seat[1] === 0 && !rk.autoStage) { rk.autoStage = true; net.send({ t: 'act', id: E.id, what: 'door_stage', on: true }); toast('Booster separated'); }
      if (E.acts.door_stage && !rk.stagedSeen) { rk.stagedSeen = true; shake = Math.max(shake, 0.8); sounds?.play('crash', { gain: 0.6 }); }
      if (alt >= SPACE.orbitAlt && !rk.sent) { rk.sent = true; net.send({ t: 'space', step: 'launch', id: E.id }); }
      if (rk.lit) { const lv = E.veh.lever || (E.veh.local ? 0 : 1); shake = Math.max(shake, lv * (alt < 150 ? 0.55 : 0.22)); }
      if (rk.lit && sounds?.wind) { lastWind = 0.35 + 0.55 * (E.veh.lever || 0.8); sounds.wind(lastWind); }
    } else if (rk.id != null && !E) rk = { id: null, count: null, lit: false, sent: false, autoStage: false, lastAlt: 0 };
    // ---- the landing pod
    if (E?.kind === 'landing_pod') {
      if (pod.id !== E.id) pod = { id: E.id, kicked: false, heat: 0, chuteSent: false, still: 0, done: false, was: true, vel: [0, 0, 0] };
      const t = E.veh.rb.translation(), lv = E.veh.rb.linvel(), speed = Math.hypot(lv.x, lv.y, lv.z);
      pod.vel = [lv.x, lv.y, lv.z];
      const agl = t.y - Math.max(groundAt(t.x, t.z), world.waterAt?.(t.x, t.z) ?? -1e9);
      // fresh from orbit: it comes back into the air already falling fast (my machine simulates it)
      if (!pod.kicked && E.veh.local && seat[1] === 0) {
        pod.kicked = true;
        if (agl > 500) { S.cam.pitch = 0.75; S.cam.yaw = Math.atan2(-t.x, -t.z); const st = podStart({ x: t.x, z: t.z }, 0); E.veh.rb.setLinvel({ x: st.v[0], y: -Math.min(SPACE.podSpeed, Math.sqrt(agl) * 4.2), z: st.v[2] }, true); toast('Reentry! W / A / S / D nudge the pod — the parachute opens by itself (Space opens it early)'); }
      }
      pod.heat = heatStep(pod.heat, heatTarget(speed, agl), dt);
      shake = Math.max(shake, pod.heat * 0.6);
      if (seat[1] === 0 && !E.acts.door_chute && !pod.chuteSent && agl < chuteHeight(speed) && agl > 2) {
        pod.chuteSent = true; net.send({ t: 'act', id: E.id, what: 'door_chute', on: true }); toast('Parachute out!'); sounds?.play('open');
      }
      if (!pod.done && E.veh.grounded?.() && speed < SPACE.podLanded) {
        pod.still += dt;
        if (pod.still > 0.8) { pod.done = true; pod.doneAt = performance.now(); net.send({ t: 'space', step: 'touchdown' }); banner = 'Touchdown! Welcome home to Wayfare County'; sounds?.play('thud'); shake = 0.6; }
      } else pod.still = 0;
      // down and still: the canopy is cut away (it would only drag the pod over)
      if (pod.done && seat[1] === 0 && E.acts.door_chute && !pod.cut && performance.now() - pod.doneAt > 1800) { pod.cut = true; net.send({ t: 'act', id: E.id, what: 'door_chute', on: false }); }
      if (sounds?.wind) { lastWind = Math.min(1, pod.heat * 0.9 + (E.acts.door_chute ? 0.12 : speed / 160)); sounds.wind(lastWind); }
    } else if (pod.was && pod.id != null && !pod.done) {
      // out of the pod before touchdown: in the air that is a bail-out (the high fall gives you a parachute — M9)
      pod.was = false; pod.done = true;
      const W = S.walker();
      const agl = W ? W.feet[1] - groundAt(W.feet[0], W.feet[2]) : 0;
      if (W && agl > 20) {
        net.send({ t: 'space', step: 'bail' });
        if (W.vy != null) W.vy = Math.min(-9, pod.vel[1]);            // you leave it falling as fast as it was
        banner = 'Bailed out! Open your parachute — Space / A / OPEN';
      }
    }
    if (!E && lastWind) { lastWind = 0; sounds?.wind?.(0); }
    jumpWas = s.jump;
  }

  // ------------------------------------------------------------------------------------------------ what the session asks
  const meState = () => ({ p: fl.p.map(r2), yaw: r2(fl.yaw), a: 'float' });
  // (a wall right behind pulls the camera in close: then my own body would fill the screen — hide it)
  const drawMe = rider => {
    rider.onFoot(fl.p, fl.yaw, 'float');
    if (fl.spin > 0) { const g = rider.group; g.translateY(0.9); g.rotateX(Math.PI * 2 * (1 - fl.spin / SPIN_S)); g.translateY(-0.9); }   // tumble round the middle
    rider.group.visible = !camera || camera.position.distanceTo(rider.group.position) > 1.1; };
  const cam = () => ({ target: fl.p, height: 0.35, dist: 3.4, exclude: null });
  function hint() {
    if (!fl) return null;
    if (nearHatch()) return 'Docking hatch — home or the Moon';
    if (fl.held) return 'Space — push off the rail · E lets go';
    const sp = station.spots.find(x => x.id !== 'dock_hatch' && Math.hypot(fl.p[0] - x.x, fl.p[1] - x.y, fl.p[2] - x.z) < 2.6);
    if (sp) return `Space — ${sp.name}${sp.note ? ' · ' + sp.note : ''}`;
    const n = nearestRail(fl.p, hull.rails);
    if (n && n.d < FLOAT.grab) return 'Space — push off · E grabs the rail';
    return 'Space — push off a wall · W / S float the way you look';
  }
  /** The seat hint in the rocket / pod (instead of the seat switch's own words), or undefined to keep the session's. */
  function seatHint(E, seatIdx) {
    if (E.kind === 'rocket') {
      if (seatIdx !== 0) return rk.count != null ? null : rk.lit ? 'Passenger — enjoy the ride' : 'Passenger — the commander launches';
      if (!rk.lit && rk.count == null) return 'Space / LAUNCH — countdown';
      if (rk.count != null) return null;
      return stageDue(altOf(E), !!E.acts.door_stage) ? 'Fire: separate the booster' : null;
    }
    if (E.kind === 'landing_pod') return pod.done ? 'Get out — welcome home' : seatIdx !== 0 || E.acts.door_chute ? null : 'Fire: open the parachute';
    return undefined;
  }
  function nearSpot(feet) {
    if (control && feet) {
      const d = Math.hypot(feet[0] - control.x, feet[2] - (control.z + control.shape.hz + 1.5));
      if (d < 7) return { hint: 'Skyreach sales desk — buy the rocket', use: () => o.openDealer?.() };
    }
    if (onMoon && feet && world.sites?.landing) {
      const L = world.sites.landing;
      if (Math.hypot(feet[0] - L.x, feet[2] - L.z) < 9) return { hint: 'Greywatch Landing — fly home or up to the station', use: () => openTravel('moon') };
    }
    return null;
  }
  let lastT = null;
  function update(cam3) {
    const nowT = performance.now(), dt = lastT == null ? 1 / 60 : Math.min(0.25, (nowT - lastT) / 1000); lastT = nowT;
    // rocket smoke: under the engines while they burn, a cloud along the pad at liftoff
    smokeAcc += dt;
    for (const X of S.ents.values()) {
      if (X.kind !== 'rocket' || !(X.veh.lever > 0.05)) continue;
      const staged = !!X.acts?.door_stage, base = X.veh.toWorld({ x: 0, y: staged ? 5.6 : 0, z: 0 }), lv = X.veh.rb.linvel();
      const agl = base.y - groundAt(base.x, base.z);
      if (smokeAcc > 0.06) {
        puff([base.x, base.y - 2, base.z], [lv.x * 0.2 + (Math.random() - 0.5) * 3, -8 + lv.y * 0.1, lv.z * 0.2 + (Math.random() - 0.5) * 3], 5 + Math.random() * 3, 6, '#f1ede6');
        // at liftoff the exhaust hits the pad and billows out sideways in a ring
        if (agl < 40) for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2; puff([base.x + Math.cos(a) * 3, groundAt(base.x, base.z) + 2, base.z + Math.sin(a) * 3], [Math.cos(a) * 16, 2 + Math.random() * 2, Math.sin(a) * 16], 8 + Math.random() * 4, 7, '#e6e2da'); }
      }
    }
    for (const X of S.ents.values()) {
      if (X.kind !== 'landing_pod' || smokeAcc <= 0.06) continue;
      const lv = X.veh.rb.linvel(), sp = Math.hypot(lv.x, lv.y, lv.z);
      if (sp > SPACE.heatFrom + 10) { const t = X.veh.rb.translation(); puff([t.x, t.y + 2.5, t.z], [0, 0, 0], 3, 3.5, '#8a8078'); }
    }
    if (smokeAcc > 0.06) smokeAcc = 0;
    stepSmoke(dt);
    // the camera: shake (eases off), and a far plane deep enough to see the county shrink below
    if (shake > 0.01) { const a = shake * 0.12; cam3.position.x += (Math.random() - 0.5) * a; cam3.position.y += (Math.random() - 0.5) * a; cam3.position.z += (Math.random() - 0.5) * a; shake *= Math.pow(0.1, dt); }
    const seat = S.mySeat(), E = seat ? S.ents.get(seat[0]) : null;
    const high = E && (E.kind === 'rocket' || E.kind === 'landing_pod') ? E.veh.rb.translation().y : 0;
    if (high > 600) { const f = Math.min(9000, 2200 + high * 1.5); if (Math.abs(cam3.far - f) > 50) { cam3.far = f; cam3.updateProjectionMatrix(); farSet = true; } }
    else if (farSet) { cam3.far = 2200; cam3.updateProjectionMatrix(); farSet = false; }
    // linear fog (the simple view) would hide the county from up here: push it out with the height, put it back after
    if (scene.fog?.isFog) {
      if (high > 300) { fogBase ||= { near: scene.fog.near, far: scene.fog.far }; scene.fog.near = Math.max(fogBase.near, high * 0.8); scene.fog.far = Math.max(fogBase.far, high * 2.6); }
      else if (fogBase) { scene.fog.near = fogBase.near; scene.fog.far = fogBase.far; fogBase = null; }
    }
    hudEl?.update(hud());
  }
  function hud() {
    const seat = S.mySeat(), E = seat ? S.ents.get(seat[0]) : null;
    const st = { banner };
    if (E?.kind === 'rocket') {
      const lv = E.veh.rb.linvel(), alt = altOf(E), ph = launchPhase({ alt, count: rk.count, lever: E.veh.lever || 0, staged: !!E.acts.door_stage });
      Object.assign(st, { alt, kmh: Math.hypot(lv.x, lv.y, lv.z) * 3.6, lever: seat[1] === 0 ? E.veh.lever || 0 : null, count: rk.count,
        label: ph === 'pad' ? (seat[1] === 0 ? 'ready to launch' : 'waiting for the commander') : ph === 'countdown' ? 'countdown' : ph === 'liftoff' ? 'liftoff' : ph === 'staged' ? 'upper stage' : ph === 'orbit' ? 'orbit' : `orbit at ${SPACE.orbitAlt.toLocaleString()} m`,
        button: seat[1] !== 0 ? null : !rk.lit && rk.count == null ? 'launch' : stageDue(alt, !!E.acts.door_stage) ? 'stage' : null });
    } else if (E?.kind === 'landing_pod') {
      const t = E.veh.rb.translation(), lv = E.veh.rb.linvel();
      Object.assign(st, { alt: t.y - groundAt(t.x, t.z), kmh: Math.hypot(lv.x, lv.y, lv.z) * 3.6, lever: null, heat: pod.heat,
        label: pod.done ? 'down' : E.acts.door_chute ? 'parachute' : pod.heat > 0.2 ? 'reentry' : 'falling', button: seat[1] === 0 && !E.acts.door_chute && !pod.done ? 'chute' : null });
    } else if (fl && !seat) {
      st.button = 'push'; st.button2 = fl.held ? 'let' : nearestRail(fl.p, hull.rails)?.d < FLOAT.grab ? 'grab' : 'spin';
    }
    banner = null;
    return st;
  }
  function debug() {
    const seat = S.mySeat(), E = seat ? S.ents.get(seat[0]) : null;
    return { float: fl ? { p: fl.p.map(r2), v: fl.v.map(r2), held: !!fl.held, room: roomOf(fl.p), wall: r2(wallDistance(fl.p, hull.boxes)) } : null, visited: [...visited], lap: lapSent,
      rocket: E?.kind === 'rocket' ? { id: E.id, alt: r2(altOf(E)), lever: r2(E.veh.lever || 0), count: rk.count, lit: rk.lit, staged: !!E.acts.door_stage, sent: rk.sent } : null,
      pod: pod.id != null ? { id: pod.id, heat: r2(pod.heat), chute: !!(E?.kind === 'landing_pod' && E.acts.door_chute), done: pod.done, still: r2(pod.still), alt: E?.kind === 'landing_pod' ? r2(E.veh.rb.translation().y - groundAt(E.veh.rb.translation().x, E.veh.rb.translation().z)) : null } : null,
      menu: !!hudEl?.menuOpen };
  }
  function dispose() {
    smokeGroup.removeFromParent();
    for (const s of smoke) s.sp.material.dispose();
    smokeTex?.dispose();
    if (farSet && camera) { camera.far = 2200; camera.updateProjectionMatrix(); }
    if (fogBase && scene.fog) { scene.fog.near = fogBase.near; scene.fog.far = fogBase.far; }
    if (lastWind) sounds?.wind?.(0);
    if (!o.hud) hudEl?.dispose();
  }
  return {
    get active() { return !!fl && !S.mySeat(); },
    control: controlFloat, drive, frame, meState, drawMe, cam, hint, seatHint, nearSpot, update, debug, dispose, openTravel, go,
    get float() { return fl; }, get hudEl() { return hudEl; },
  };
}
