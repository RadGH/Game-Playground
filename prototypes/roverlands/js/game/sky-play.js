// Skydiving in the page (Expansion 1 M9): the Jump Point at Wayfare Field, the jump plane, the hold, free fall, the
// parachute, the glider drop, the target rings — the client side of js/game/jobs/skydive.js (the room referees it).
//
//   const sky = createSkyPlay({ THREE, scene, world, net, defOf, phys, enhance, sounds, toast, S });
//     S = the session's own bits: { walker(), mySeat(), standUp(tell), ents, people, cam, me, land(v) }
//   sky.active                 true while I am in the plane, falling or under the canopy (my walker is parked)
//   sky.control(dt, s)         this frame's input (instead of walking) while active
//   sky.frame(dt, s)           every frame: the plane, the glider drop, landings, the high-fall parachute
//   sky.meState()              my `pos` while active;  sky.drawMe(rider) puts my body;  sky.cam() the camera's target
//   sky.platform(id)           a jump plane as something a remote person stands on (`on` = PLANE_ID + fid)
//   sky.nearSpot(feet)         the Jump Point's "E" (opens the menu)
//   sky.onMsg(m)               `{ t:'job', id:'skydive', … }` from the room
//   sky.defFor(row, def)       my own glider's definition (the Long-span wing upgrade)
//   sky.update(camera)         draw planes, canopies, rings, the Jump Point sign;  sky.hud() what the sky HUD shows
//   sky.board(glider)          (tests) ask for a seat on the next plane, as the menu does
//
// What happens (README "Skydiving"): E at the Jump Point -> menu -> `board` -> the room puts you on a plane (friends
// within 6 s share it) -> you stand in the hold of a Big Sky Lifter at 1200 m flying a straight line over the county
// (every machine draws it from the same flight data, js/game/sky.js) -> the ramp opens, the light turns green near the
// target -> run out the back -> free fall (steer with the stick, forward = track) -> OPEN (Space / A / the button) or it
// opens by itself at 140 m -> steer, flare (hold Space / S / LT / FLARE) just before the ground -> `land` -> paid.
// Glider: you come out of the ramp and your own glider is summoned under you, already flying.
import { flightPose, flightPhase, greenLight, holdLocal, clampHold, RAMP_END, HOLD, PLANE_ID, fallRules, fallStep, openCanopy, gliderDef, toTarget } from './sky.js';
import { buildModel } from '../client/models/index.js';
import { createSkyHud } from '../client/sky-hud.js';

const HIGH_FALL = 60;            // metres above the ground: falling off something this high gives you a parachute

export function createSkyPlay(o) {
  const { THREE, scene, world, net, defOf, phys, enhance = m => m, sounds = null, toast = () => {}, S } = o;
  const jp = world.sites.airport.jumpPoint;
  const targets = world.sites.skyTargets || [];
  const flights = new Map();            // fid -> flight (everything the room says is in the air)
  const planes = new Map();             // fid -> { model, veh?, building }
  const hudEl = o.hud || createSkyHud();
  let mine = null;                      // { f, slot } my flight
  let mode = 'none';                    // 'plane' | 'fall' | 'canopy'
  let hold = null;                      // { x, z, yaw (plane frame), anim, vx, vz }
  let st = null, R = fallRules([]), jumping = false;   // the fall; jumping = a real jump the room knows about (pays)
  let gl = null;                        // glider drop: { since, id, asked, seatAsked }
  let gliderRun = null;                 // { id, vy, still }
  let prog = null, landed = null, jumpWas = false, braking = false;
  const ups = () => net.last?.profile?.profile?.jobs?.skydive?.upgrades || net.last?.profile?.jobs?.skydive?.upgrades || [];
  const ownsGlider = () => { const P = net.last?.profile?.profile || net.last?.profile; return !!P?.owned?.vehicles?.includes?.('glider'); };
  const now = () => net.serverNow();
  const groundAt = (x, z) => world.heightAt(x, z);

  // ------------------------------------------------------------------------------------------------ the scenery
  const deco = new THREE.Group(); deco.name = 'sky-deco'; scene.add(deco);
  const signTex = (text, color) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d'); g.font = '800 54px "Trebuchet MS", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.min(500, g.measureText(text).width + 70);
    g.fillStyle = 'rgba(14,19,22,0.82)'; g.beginPath(); g.roundRect((512 - w) / 2, 14, w, 92, 46); g.fill(); g.lineWidth = 6; g.strokeStyle = color; g.stroke();
    g.fillStyle = '#f2ead8'; g.fillText(text, 256, 62);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex('Jump Point', '#f0973a'), depthTest: false, transparent: true }));
  sign.scale.set(6, 1.5, 1); sign.renderOrder = 9; sign.position.set(jp.x, groundAt(jp.x, jp.z) + 5.4, jp.z); deco.add(sign);
  /** A flat ring that follows the ground (a ribbon of quads). */
  function groundRing(x, z, r, w, color, opacity = 0.85, lift = 0.18) {
    const n = Math.max(24, Math.round(r * 3)), pos = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (const rr of [r - w / 2, r + w / 2]) { const px = x + c * rr, pz = z + s * rr; pos.push(px, groundAt(px, pz) + lift, pz); }
      if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.renderOrder = 2; return m;
  }
  deco.add(groundRing(jp.x, jp.z, 6, 0.6, '#f0973a'));
  const rings = new Map();              // target id -> { group, beam }
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ff6a4a', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  function addTarget(t, r = 30) {
    const g = new THREE.Group();
    g.add(groundRing(t.x, t.z, r, 1.6, '#ffffff', 0.9), groundRing(t.x, t.z, r * 0.55, 1.2, '#e8505b', 0.85), groundRing(t.x, t.z, 5, 1, '#e8505b', 0.95), groundRing(t.x, t.z, 1.1, 2.2, '#ffffff', 0.95));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 400, 10, 1, true), beamMat);
    beam.position.set(t.x, groundAt(t.x, t.z) + 200, t.z); beam.visible = false; g.add(beam);
    deco.add(g); rings.set(t.id, { group: g, beam, t });
  }
  for (const t of targets) addTarget(t);
  if (world.sites.plateau) { const p = world.sites.plateau; addTarget({ id: 'plateau', x: p.x, z: p.z, y: p.y }, 60); }

  // ------------------------------------------------------------------------------------------------ the canopy model
  const canopyMats = [new THREE.MeshStandardMaterial({ color: '#f0973a', roughness: 0.8, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: '#2f6fb2', roughness: 0.8, side: THREE.DoubleSide })].map(m => enhance(m));
  const lineMat = new THREE.LineBasicMaterial({ color: '#e8e2d2', transparent: true, opacity: 0.7 });
  function buildCanopy() {
    // a ram-air wing: nine cells on a gentle arc, 7.2 m span, 2.6 m chord, 4.6 m above the harness; lines to the shoulders
    const g = new THREE.Group(), wing = new THREE.Group(); g.add(wing);
    const cells = 9, span = 7.2, chord = 2.6, R0 = 9, H = 4.6;
    const ends = [];
    for (let i = 0; i < cells; i++) {
      const a = ((i + 0.5) / cells - 0.5) * span / R0;
      const cell = new THREE.Mesh(new THREE.BoxGeometry(span / cells * 0.98, 0.42, chord), canopyMats[i % 2]);
      cell.position.set(Math.sin(a) * R0, H + (Math.cos(a) - 1) * R0, 0); cell.rotation.z = -a;
      wing.add(cell);
      if (i % 2 === 0) for (const zz of [-chord * 0.4, chord * 0.35]) ends.push(cell.position.x, cell.position.y - 0.2, zz);
    }
    const pts = [];
    for (let k = 0; k < ends.length; k += 3) { const side = ends[k] < 0 ? -0.18 : 0.18; pts.push(side, 1.45, 0, ends[k], ends[k + 1], ends[k + 2]); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(lg, lineMat));
    g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    g.userData.wing = wing;
    return g;
  }
  const canopies = new Map();           // pid -> group
  function canopyFor(pid) { let c = canopies.get(pid); if (!c) { c = buildCanopy(); scene.add(c); canopies.set(pid, c); } return c; }

  // ------------------------------------------------------------------------------------------------ planes
  function planeFor(f) {
    let P = planes.get(f.fid);
    if (P) return P;
    P = { model: null, f };
    planes.set(f.fid, P);
    const def = defOf('cargo_plane');
    if (!def) return P;
    buildModel(THREE, def, { enhance }).then(m => { if (planes.get(f.fid) !== P) return; P.model = m; scene.add(m.group); }).catch(e => console.warn('[roverlands] jump plane', e));
    return P;
  }
  function dropPlane(fid) {
    const P = planes.get(fid); if (!P) return;
    P.model?.group.removeFromParent(); planes.delete(fid);
  }
  const wheelsIdle = n => Array.from({ length: n }, () => ({ comp: 0, steer: 0, spin: 0 }));
  /** Plane frame -> world, at a flight pose. */
  const toWorld = (pose, l) => { const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw); return [pose.p[0] + l[0] * c + l[2] * s, pose.p[1] + l[1], pose.p[2] - l[0] * s + l[2] * c]; };
  const dirToLocal = (yaw, w) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [w[0] * c - w[1] * s, w[0] * s + w[1] * c]; };

  // ------------------------------------------------------------------------------------------------ the room's messages
  function onMsg(m) {
    if (m.id !== 'skydive') return;
    if (m.k === 'flights') { for (const f of m.list || []) flights.set(f.fid, f); return; }
    if (m.k === 'flight') return board_(m.flight, m.slot || 0);
    if (m.k === 'prog') { prog = m; return; }
    if (m.k === 'landed') {
      const bits = [];
      if (!m.safe) bits.push(`Too hard (${m.speed} m/s) — no pay this time`);
      else if (m.glider) bits.push(m.plateau ? 'Glider down on Highgate Plateau!' : 'Glider down safely');
      else bits.push(m.bullseye ? 'Bullseye!' : m.onTarget ? `On target — ${Math.round(m.d)} m from the middle` : `Safe landing — ${Math.round(m.d)} m from the target`);
      if (m.gold) bits.push(`+${m.gold} gold`);
      if (m.level) bits.push(`Level ${m.level} done!`);
      landed = { at: String(performance.now()), text: bits.join(' · '), ...m };
      return;
    }
  }
  net.on('summoned', m => { if (gl && m.vehicle === 'glider') gl.id = m.id; });
  net.on('deny', m => { if (gl && (m.what === 'summon' || (m.what === 'seat' && m.id === gl.id))) { gl = null; toast('No glider this time — use your parachute (Space)'); } });

  function board_(f, slot) {
    flights.set(f.fid, f);
    mine = { f, slot };
    if (S.mySeat()) S.standUp(true);
    S.walker()?.disable();
    hold = { x: slot % 2 ? -0.6 : 0.6, z: 3.4 - Math.floor(slot / 2) * 1.1, yaw: Math.PI, anim: 'idle', vx: 0, vz: 0 };
    mode = 'plane'; jumping = true; landed = null; gl = null; R = fallRules(ups());
    S.cam.yaw = flightPose(f, now()).yaw + Math.PI;   // look down the hold toward the ramp (at the back)
    S.cam.pitch = 0.15;
    net.send({ t: 'go', place: 'sky', at: toWorld(flightPose(f, now()), [hold.x, 0, hold.z]).map(r2) });
    toast(f.glider ? 'Aboard! When the ramp opens, run out the back — your glider will be waiting.' : 'Aboard the Big Sky Lifter — wait for the green light, then run out the back');
    sounds?.play('open');
  }
  function board(glider = false) { net.send({ t: 'job', id: 'skydive', step: 'board', ...(glider ? { on: true } : {}) }); }

  // ------------------------------------------------------------------------------------------------ input while active
  function control(dt, s) {
    const jumpEdge = s.jump && !jumpWas; jumpWas = s.jump;
    if (mode === 'plane') return holdStep(dt, s);
    if (mode === 'fall') {
      if (jumpEdge || hudEl.pressed('open')) pull();
      fallStep(st, { mx: s.mx, my: s.my, camYaw: S.cam.yaw }, dt, R);
    } else if (mode === 'canopy') {
      hudEl.pressed('open');
      braking = Math.max(s.brake || 0, s.jump && st.open > 0.6 ? 1 : 0, hudEl.pressed('flare') ? 1 : 0) > 0.3;
      fallStep(st, { mx: s.mx, my: Math.max(0, s.my), brake: braking ? 1 : Math.min(1, s.brake || 0) }, dt, R);
    }
    if (mode === 'fall' || mode === 'canopy') afterStep(dt);
  }
  function pull() {
    if (!st || !openCanopy(st)) return;
    mode = 'canopy'; sounds?.play('open'); toast('Parachute open — steer with A / D, flare (hold Space or S) just before the ground');
  }
  function holdStep(dt, s) {
    const f = mine.f, t = now(), pose = flightPose(f, t), ph = flightPhase(f, t), open = ph !== 'boarding';
    const fx = Math.sin(S.cam.yaw), fz = Math.cos(S.cam.yaw);
    const wx = fx * s.my - fz * s.mx, wz = fz * s.my + fx * s.mx, ml = Math.min(1, Math.hypot(wx, wz));
    const [lx, lz] = dirToLocal(pose.yaw, [wx, wz]);
    const sp = s.boost ? 1.7 : 3.4, L = Math.hypot(lx, lz) || 1;
    hold.vx = ml > 0.1 ? lx / L * ml * sp : 0; hold.vz = ml > 0.1 ? lz / L * ml * sp : 0;
    [hold.x, hold.z] = clampHold(hold.x + hold.vx * dt, hold.z + hold.vz * dt, open);
    if (ml > 0.1) hold.yaw = Math.atan2(lx, lz);
    hold.anim = ml > 0.6 && !s.boost ? 'run' : ml > 0.1 ? 'walk' : 'idle';
    if (holdLocal(hold.z, open) === null || ph === 'gone') { if (ph === 'gone') toast('The plane turns for home — out you go!'); exitPlane(pose); }
  }
  function exitPlane(pose) {
    const feet = toWorld(pose, [hold.x, holdLocal(RAMP_END + 0.01), Math.max(hold.z, RAMP_END - 0.3)]);
    const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
    const v = [pose.v[0] + hold.vx * c + hold.vz * s, -1.5, pose.v[2] - hold.vx * s + hold.vz * c];
    st = { p: feet, v, yaw: pose.yaw + hold.yaw, mode: 'fall' };
    mode = 'fall'; S.cam.pitch = 0.75;          // look down at the county
    net.send({ t: 'job', id: 'skydive', step: 'jump', p: feet.map(r2) });
    if (mine.f.glider) gl = { since: performance.now(), id: null, asked: 0, seatAsked: 0 };
    else toast('Free fall! Steer with the stick — open your parachute with Space / A / OPEN');
  }
  /** Ground under the fall this step: terrain, water, roofs. -> { y, water } | null (still in the air). */
  function touchdown() {
    const [x, y, z] = st.p, vy = st.v[1];
    const w = world.waterAt?.(x, z), g = groundAt(x, z);
    if (w != null && w > g && y <= w) return { y: w, water: true };
    if (y <= g) return { y: g, water: false };
    if (vy < 0) {
      const hit = phys.raycast([x, y + 0.6, z], [0, -1, 0], 0.7 + Math.abs(vy) / 60 + 0.05);
      if (hit && !hit.info?.walker) return { y: hit.point[1], water: false };
    }
    return null;
  }
  function afterStep() {
    const h = st.p[1] - groundAt(st.p[0], st.p[2]);
    if (mode === 'fall' && !gl && h < R.autoOpen) { pull(); toast('Your parachute opened by itself'); }
    const td = touchdown();
    if (!td) return;
    const v = Math.max(0, -st.v[1]);
    landDown([st.p[0], td.y, st.p[2]], td.water ? 0 : v, v);
  }
  function landDown(p, hurt, real) {
    const yaw = st?.yaw ?? 0;
    mode = 'none';
    S.walker()?.enable([p[0], p[1] + 0.05, p[2]], yaw);
    S.land(hurt);
    if (jumping) net.send({ t: 'job', id: 'skydive', step: 'land', p: p.map(r2), n: Math.round(hurt * 10) });
    if (jumping || mine) net.send({ t: 'go', place: 'county' });
    jumping = false; mine = null; st = null; gl = null; braking = false;
    sounds?.wind?.(0);
    void real;
  }

  // ------------------------------------------------------------------------------------------------ every frame
  function frame(dt, s) {
    const t = now();
    // the Jump Point menu: E / X = parachute (nearSpot), F / Y = glider; walking away closes it
    if (hudEl.menuOpen) {
      const W0 = S.walker();
      if (mode !== 'none' || !W0 || Math.hypot(W0.feet[0] - jp.x, W0.feet[2] - jp.z) > 9) hudEl.closeMenu();
      else if (s.swap && ownsGlider()) hudEl.pick('glider');
    }
    // the glider drop: summon it under me (it is my vehicle: the room checks I own one), hold it there, sit in it
    if (gl && mode === 'fall') {
      if (!gl.id && !gl.asked && performance.now() - gl.since > 700) { gl.asked = performance.now(); net.send({ t: 'summon', vehicle: 'glider', p: st.p.map(r2), yaw: r2(st.yaw) }); }
      const E = gl.id != null ? S.ents.get(gl.id) : null;
      if (E?.veh?.local) {
        const fwd = [Math.sin(st.yaw), Math.cos(st.yaw)];
        E.veh.rb.setTranslation({ x: st.p[0], y: st.p[1] + 0.4, z: st.p[2] }, true);
        E.veh.rb.setRotation({ x: 0, y: Math.sin(st.yaw / 2), z: 0, w: Math.cos(st.yaw / 2) }, true);
        E.veh.rb.setLinvel({ x: fwd[0] * 24, y: -2, z: fwd[1] * 24 }, true); E.veh.rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
        if (performance.now() - gl.seatAsked > 1000) { gl.seatAsked = performance.now(); net.send({ t: 'seat', id: gl.id, seat: 0 }); }
      }
      if (performance.now() - gl.since > 9000 && !(S.mySeat()?.[0] === gl.id)) { gl = null; toast('No glider this time — open your parachute (Space)'); }
    }
    const seat = S.mySeat();
    if (gl?.id != null && seat?.[0] === gl.id) {
      // in the glider: the fall is over, the glider flies on (keep its speed; the room knows the jump)
      mode = 'none'; st = null; gliderRun = { id: gl.id, vy: 0, still: 0 }; gl = null; sounds?.wind?.(0);
      toast('Glider away! Space pulls up, Shift dives, A / D bank — land it on Highgate Plateau');
    }
    // a glider landing: on its wheels and nearly stopped
    if (gliderRun) {
      const E = S.ents.get(gliderRun.id);
      if (!E || seat?.[0] !== gliderRun.id) gliderRun = null;
      else {
        const lv = E.veh.rb.linvel();
        if (!E.veh.grounded()) gliderRun.vy = Math.min(gliderRun.vy, lv.y);
        if (E.veh.grounded() && E.veh.speed() < 3) gliderRun.still += dt; else gliderRun.still = 0;
        if (gliderRun.still > 0.6) {
          const t3 = E.veh.rb.translation(), hard = Math.max(0, -gliderRun.vy);
          net.send({ t: 'job', id: 'skydive', step: 'land', p: [t3.x, t3.y, t3.z].map(r2), n: Math.round(Math.min(hard, 30) * 10), veh: gliderRun.id });
          net.send({ t: 'go', place: 'county' });
          gliderRun = null; jumping = false; mine = null;
        } else if (E.veh.grounded()) gliderRun.vy = Math.max(gliderRun.vy, -2);
      }
    }
    // falling off something high (a cliff, out of a helicopter or the glider): you get a parachute
    const W = S.walker();
    if (mode === 'none' && !seat && W?.enabled && !W.isRag() && W.anim === 'fall' && W.vel[1] < -8 && W.feet[1] - groundAt(W.feet[0], W.feet[2]) > HIGH_FALL) {
      st = { p: W.feet.slice(), v: W.vel.slice(), yaw: W.yaw, mode: 'fall' };
      R = fallRules(ups()); mode = 'fall'; W.disable();
      toast('Falling! Open your parachute — Space / A / OPEN');
    }
    // flights the room has forgotten / that have flown on
    for (const [fid, f] of flights) if (t > f.endAt + 15000 && mine?.f.fid !== fid) { flights.delete(fid); dropPlane(fid); }
    // sound: the plane's drone in the hold, rushing air in free fall
    sounds?.wind?.(mode === 'fall' ? Math.min(1, Math.hypot(...st.v) / 55) : mode === 'canopy' ? 0.18 : mode === 'plane' ? 0.32 : 0);
  }

  // ------------------------------------------------------------------------------------------------ what the session asks
  function meState() {
    if (mode === 'plane') {
      const pose = flightPose(mine.f, now()), l = [hold.x, holdLocal(hold.z, true) ?? 0, hold.z];
      return { p: toWorld(pose, l).map(r2), yaw: r2(pose.yaw + hold.yaw), a: hold.anim, on: PLANE_ID + mine.f.fid, rel: l.map(r2), ryaw: r2(hold.yaw) };
    }
    if (mode === 'fall') return { p: [st.p[0], st.p[1] + 0.9, st.p[2]].map(r2), yaw: r2(st.yaw), a: 'skydive' };
    return { p: st.p.map(r2), yaw: r2(st.yaw), a: braking ? 'flare' : 'canopy' };
  }
  let holdDist = 3;                          // the hold camera's distance this frame (cam() below)
  function drawMe(rider) {
    if (mode === 'plane') { const m = meState(); rider.onFoot(m.p, m.yaw, hold.anim); rider.group.visible = holdDist > 1.2; return; }   // a camera squeezed into a corner hides my own body instead of filling the screen with it
    rider.group.visible = true;
    if (mode === 'fall') rider.onFoot([st.p[0], st.p[1] + 0.9, st.p[2]], st.yaw, 'skydive');
    else rider.onFoot(st.p, st.yaw, braking ? 'flare' : 'canopy');
  }
  function cam() {
    if (mode === 'plane') {
      // keep the camera inside the hold: how far it can sit back along its own direction before leaving the box
      // (worked out in the plane's frame — the plane moves 45 m/s, so a physics body for it is always a frame stale)
      const m = meState(), pose = flightPose(mine.f, now()), open = flightPhase(mine.f, now()) !== 'boarding';
      const cp = Math.cos(S.cam.pitch), sp = Math.sin(S.cam.pitch);
      const [dx, dz] = dirToLocal(pose.yaw, [-Math.sin(S.cam.yaw) * cp, -Math.cos(S.cam.yaw) * cp]), dy = sp;
      const o = [hold.x, (holdLocal(hold.z, true) ?? 0) + 1.25, hold.z];
      const lo = [-1.4, 0.2, open ? -9.2 : HOLD.hinge + 0.1], hi = [1.4, 2.45, 5.2];
      let tMax = 4.6;                    // (a phone in portrait shows little sideways: sit back as far as the hold allows)
      [dx, dy, dz].forEach((d, i) => { if (Math.abs(d) < 1e-6) return; const t = ((d > 0 ? hi[i] : lo[i]) - o[i]) / d; if (t >= 0) tMax = Math.min(tMax, t); });
      holdDist = Math.max(0.3, tMax - 0.15) / (S.cam.distScale || 1);
      return { target: m.p, height: 1.25, dist: holdDist, exclude: null };
    }
    if (mode === 'fall') return { target: [st.p[0], st.p[1] + 0.6, st.p[2]], height: 0.6, dist: 7, exclude: null };
    return { target: st.p, height: 2.4, dist: 9, exclude: null };
  }
  const pseudo = new Map();
  function platform(id) {
    const f = flights.get(id - PLANE_ID); if (!f) return null;
    const pose = flightPose(f, now()), q = { x: pose.q[0], y: pose.q[1], z: pose.q[2], w: pose.q[3] };
    let P = pseudo.get(f.fid);
    if (!P) { P = { veh: { toWorld: l => { const w = toWorld(P.pose, [l.x, l.y, l.z]); return { x: w[0], y: w[1], z: w[2] }; }, rb: { rotation: () => P.q } } }; pseudo.set(f.fid, P); }
    P.pose = pose; P.q = q;
    return P;
  }
  function nearSpot(feet) {
    if (mode !== 'none' || Math.hypot(feet[0] - jp.x, feet[2] - jp.z) > 7) return null;
    return { hint: 'Jump Point — board the jump plane', use: () => openMenu() };
  }
  function openMenu() {
    if (hudEl.menuOpen) { hudEl.pick('jump'); return; }
    const why = ownsGlider() ? null : 'The glider needs a Soarwing Glider of your own (the Dealer sells them).';
    hudEl.menu({ gliderWhy: why, onPick: c => { if (c === 'jump') board(false); else if (c === 'glider') board(true); } });
  }
  function defFor(row, def) {
    if (row.kind !== 'glider' || row.sum == null || row.sum !== S.me) return def;
    return gliderDef(def, ups());
  }

  // ------------------------------------------------------------------------------------------------ drawing
  function update(camera) {
    const t = now();
    for (const f of flights.values()) {
      const ph = flightPhase(f, t);
      if (t > f.endAt + 12000) continue;
      const P = planeFor(f), pose = flightPose(f, t);
      if (P.model) {
        P.model.group.position.set(...pose.p);
        P.model.group.quaternion.set(...pose.q);
        P.model.update({ wheels: wheelsIdle(defOf('cargo_plane')?.wheels.length || 6), acts: { door_ramp: ph !== 'boarding' }, lever: 1, t: performance.now() / 1000 });
      }
    }
    // canopies: mine, and everyone the room says is under one
    const want = new Set();
    if (mode === 'canopy') want.add(S.me);
    for (const P of S.people.values()) if (P.pid !== S.me && P.rider && (P.last?.a === 'canopy' || P.last?.a === 'flare')) want.add(P.pid);
    for (const pid of want) {
      const P = S.people.get(pid); if (!P?.rider) continue;
      const c = canopyFor(pid), g = P.rider.group;
      c.visible = true; c.position.copy(g.position); c.quaternion.copy(g.quaternion);
      const fill = pid === S.me ? Math.min(1, (st?.open || 0) / R.openSecs) : 1;
      c.scale.set(0.25 + 0.75 * fill, 0.4 + 0.6 * fill, 0.25 + 0.75 * fill);
      c.userData.wing.rotation.x = (pid === S.me ? braking : P.last?.a === 'flare') ? -0.18 : 0;
    }
    for (const [pid, c] of canopies) if (!want.has(pid)) c.visible = false;
    // rings: the beam over my target while I am up there
    const active = mine?.f.target?.id;
    for (const r of rings.values()) r.beam.visible = !!active && r.t.id === active && mode !== 'none';
    // the beam marks the target from far off; right over it, it would only tint the screen
    const bt = active && rings.get(active)?.t;
    if (bt) { const dd = Math.hypot(camera.position.x - bt.x, camera.position.z - bt.z); beamMat.opacity = 0.22 * Math.max(0, Math.min(1, (dd - 40) / 160)); }
    sign.visible = camera.position.distanceTo(sign.position) < 260;
    // linear fog (the simple view: 120..700 m) would hide the whole county from 1200 m up: push it out with the height
    const F = scene.fog;
    if (F?.isFog) {
      if (!F.userData?.skyBase) F.userData = { ...(F.userData || {}), skyBase: [F.near, F.far] };
      const [n0, f0] = F.userData.skyBase, h = Math.max(0, camera.position.y - groundAt(camera.position.x, camera.position.z));
      const k = h > 60 ? 1 + (h - 60) / 220 : 1;
      F.near = n0 * k; F.far = f0 * k;
    }
  }
  function hud() {
    let out = null;
    const t = now();
    if (mode === 'plane') {
      const f = mine.f, ph = flightPhase(f, t), g = greenLight(f, t), d = toTarget(f, t);
      const pp = flightPose(f, t).p;
      out = { mode, alt: pp[1] - groundAt(pp[0], pp[2]), label: 'in the plane',
        light: ph === 'boarding' ? 'red' : g ? 'green' : 'amber',
        lightText: ph === 'boarding' ? `Ramp opens in ${Math.ceil((f.openAt - t) / 1000)} s` : f.glider ? 'Green light — run out the back for your glider' : g ? 'GREEN — run out the back now!' : d > 0 ? `Wait — target ${Math.round(d)} m ahead` : 'Past the target — jump soon',
        button: null };
    } else if (mode === 'fall') {
      out = { mode, alt: st.p[1] - groundAt(st.p[0], st.p[2]), label: gl ? 'glider coming…' : `free fall · ${Math.round(-st.v[1] * 3.6)} km/h`, button: gl ? null : 'open' };
    } else if (mode === 'canopy') {
      out = { mode, alt: st.p[1] - groundAt(st.p[0], st.p[2]), label: braking ? 'flaring' : `canopy · ${Math.round(-st.v[1] * 10) / 10} m/s down`, button: 'flare' };
      const tg = mine?.f.target;
      if (tg) { const dd = Math.hypot(st.p[0] - tg.x, st.p[2] - tg.z); out.light = dd < 30 ? 'green' : 'amber'; out.lightText = `${tg.name || 'Target'}: ${Math.round(dd)} m`; }
    } else if (gliderRun) {
      const E = S.ents.get(gliderRun.id); if (E) { const p = E.veh.rb.translation(); const pl = world.sites.plateau;
        out = { mode: 'glider', alt: p.y - groundAt(p.x, p.z), label: 'glider', button: null };
        if (pl) { const dd = Math.hypot(p.x - pl.x, p.z - pl.z); out.light = dd < pl.r ? 'green' : 'amber'; out.lightText = dd < pl.r ? 'Over Highgate Plateau — land now' : `Highgate Plateau: ${Math.round(dd)} m`; } }
    }
    if (landed) { out ||= {}; out.landed = landed; }
    return out;
  }
  function spots() {
    const L = [{ kind: 'jump', x: jp.x, z: jp.z, label: 'Jump Point' }];
    for (const t of targets) L.push({ kind: 'target', x: t.x, z: t.z, label: t.name });
    return L;
  }
  function debug() {
    return { mode, flight: mine ? { fid: mine.f.fid, glider: mine.f.glider, phase: flightPhase(mine.f, now()), target: mine.f.target } : null,
      hold: hold && mode === 'plane' ? { x: r2(hold.x), z: r2(hold.z) } : null,
      fall: st ? { p: st.p.map(r2), v: st.v.map(r2), mode: st.mode, h: r2(st.p[1] - groundAt(st.p[0], st.p[2])) } : null,
      glider: gl ? { id: gl.id } : gliderRun ? { run: gliderRun.id } : null, flights: flights.size, landed: landed ? { safe: landed.safe, d: landed.d, gold: landed.gold, level: landed.level, glider: landed.glider } : null,
      prog: prog?.text || null, menu: hudEl.menuOpen };
  }
  function dispose() {
    for (const fid of [...planes.keys()]) dropPlane(fid);
    for (const c of canopies.values()) c.removeFromParent();
    deco.removeFromParent(); sounds?.wind?.(0);
    if (!o.hud) hudEl.dispose();
  }
  return {
    get active() { return mode !== 'none'; }, get mode() { return mode; },
    control, frame, meState, drawMe, cam, platform, nearSpot, onMsg, defFor, update, hud, spots, debug, dispose, board, openMenu, pull, hudEl,
    /** tests: where my plane is now; put my fall somewhere (a spec cannot steer for three minutes) */ planePose: () => (mine ? flightPose(mine.f, now()) : null),
    testPlace(x, h, z) { if (st) { st.p = [x, groundAt(x, z) + h, z]; st.v = [0, st.mode === 'fall' ? -40 : -5, 0]; } },
  };
}
const r2 = v => Math.round(v * 100) / 100;
