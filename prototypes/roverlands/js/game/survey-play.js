// Survey kits in the page (Expansion 1 M10): the glue between the room's Survey referee (js/game/jobs/survey.js) and
// what you see and press. js/game/session.js makes one when the world has a survey grid (Wayfare County).
//
//   const sv = createSurveyPlay({ THREE, scene, world, net, enhance, sounds, toast, S });
//     S = { ents, mySeat(), walker(), carrying(), grab(E) (pick a prop up: asks the room for it first when it is not
//           mine), placeCarried(p, v, q) (let go of what I carry at p with velocity v), keys (input.keys), cam }
//   sv.onMsg(m)            every `{ t:'job', id:'survey', … }` from the room
//   sv.press(E)            E pressed beside a loose prop: true when it is a kit crate (tap = pick up, hold = set up)
//   sv.load(C)             E pressed while carrying C: true when C is a kit crate and went into a vehicle's slot
//   sv.frame(dt, s)        every frame: the E hold, the helicopter sling (T), reporting at the office
//   sv.update(camera, dt)  draw: set-up kits (unfolding), crate bands, the ring, the sling rope, the HUD readout
//   sv.spawn(kitId)        the phone's Items app: put that kit's crate down beside me
//   sv.nearSpot(feet)      a set-up kit of mine within reach: { hint, use } (packs it up)
//   sv.hud() -> { hint, line }   sv.spots() -> map markers   sv.debug()   sv.dispose()
//
// What the readout judges is what the room judges: the same pure rules (js/game/survey.js) over the same grid
// (world.sites.surveyGrid, built from this world exactly as the server builds it).
import { CRATE, HOLDS } from './survey-kits.js';
import { placeView, judgeSpot, surveyRules, setupMs, goodSpots, kitById } from './survey.js';
import { OFFICE_R, NEAR_CRATE, NEAR_SITE, ON_GROUND } from './jobs/survey.js';
import { createKit } from '../client/models/kit.js';
import { createSurveyHud } from '../client/survey-hud.js';
import { yawOf } from '../phys/vmath.js';

const TAP_MS = 320;            // E held longer than this beside a kit crate starts setting it up; shorter picks it up
const READ_EVERY = 0.12;       // seconds between readouts (the summit rule samples the ground 48 times)

export function createSurveyPlay({ THREE, scene, world, net, enhance = m => m, sounds = null, toast = () => {}, S }) {
  const grid = world.sites?.surveyGrid, V = placeView(grid);
  if (!V || !grid.office) return null;
  const office = grid.office, me = net.you;
  const hud = typeof document !== 'undefined' ? createSurveyHud() : null;
  const root = new THREE.Group(); root.name = 'survey'; scene.add(root);
  let sites = [], crates = new Map(), prog = null, disposed = false;
  let hold = null, slung = null, pendingSling = null, lastReport = 0, readT = 0, read = null, scan = { at: null, t: 0, kit: null, list: [] };
  let lastKit = null, stats = { sent: 0, setups: 0, reports: 0 };
  const models = new Map();          // site key -> { group, born, spin: [objects that turn], kit }
  const bands = new Map();           // crate ent id -> the band group added to its model
  const ups = () => net.last?.profile?.profile?.jobs?.survey?.upgrades || [];
  const send = (step, extra = {}) => { net.send({ t: 'job', id: 'survey', step, ...extra }); stats.sent++; };
  const now = () => performance.now();
  const ground = (x, z) => world.heightAt(x, z);
  send('sync');

  // ---------------------------------------------------------------------------------------------- set-up kit models
  const M = {
    pole: enhance(new THREE.MeshStandardMaterial({ color: '#c9ced4', roughness: 0.35, metalness: 0.8 })),
    dark: enhance(new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.6, metalness: 0.4 })),
    white: enhance(new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.4, metalness: 0.1 })),
    dish: enhance(new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide })),
    canvas: enhance(new THREE.MeshStandardMaterial({ color: '#d9cfae', roughness: 0.95, metalness: 0, side: THREE.DoubleSide })),
    blink: new THREE.MeshBasicMaterial({ color: '#ff4a3a' }),
    ringOk: new THREE.MeshBasicMaterial({ color: '#7cf06a', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    ringBad: new THREE.MeshBasicMaterial({ color: '#ff5a48', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
    rope: new THREE.LineBasicMaterial({ color: '#2a2a2a' }),
  };
  const kitMat = new Map();
  const colourMat = c => { if (!kitMat.has(c)) kitMat.set(c, enhance(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.15 }))); return kitMat.get(c); };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  function buildSite(kit) {
    const g = new THREE.Group(), spin = [], col = colourMat(kit.colour);
    // every kit stands on the same olive case it came in (folded open), so a set-up kit still reads as "your crate"
    const k = createKit(THREE, { enhance });
    k.box('olive', [0.84, 0.3, 0.84], [0, 0.15, 0], { bevel: 0.03 });
    const base = new THREE.Group(); k.finish(base); g.add(base);
    if (kit.model === 'mast') {
      for (let i = 0; i < 3; i++) { const a = i * 2.094, leg = mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.4, 5), M.pole, Math.sin(a) * 0.8, 1.55, Math.cos(a) * 0.8); leg.rotation.set(Math.cos(a) * 0.27, 0, -Math.sin(a) * 0.27); g.add(leg); }
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 6.2, 8), M.pole, 0, 3.4, 0));
      const top = new THREE.Group(); top.position.y = 6.5; g.add(top); spin.push({ o: top, rate: 4 });
      for (let i = 0; i < 3; i++) { const a = i * 2.094, arm = mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), M.dark, Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25); arm.rotation.y = a; top.add(arm); top.add(mesh(new THREE.SphereGeometry(0.11, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), col, Math.cos(a) * 0.5, -0.05, -Math.sin(a) * 0.5)); }
      const vane = mesh(new THREE.BoxGeometry(0.04, 0.3, 0.7), col, 0, 6.05, -0.2); g.add(vane);
      g.add(mesh(new THREE.BoxGeometry(0.34, 0.42, 0.22), M.white, 0, 1.4, 0.12));
    } else if (kit.model === 'probe') {
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.01, 1.4, 8), M.pole, 0.9, 0.2, 0));
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), col, 0.9, 0.95, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.8, 5), M.dark, -0.2, 1.2, -0.2));
      const flag = mesh(new THREE.PlaneGeometry(0.4, 0.26), col, -0.02, 1.95, -0.2); flag.material = colourMat(kit.colour); g.add(flag); spin.push({ o: flag, wave: true });
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.005, 0.5, 5), M.dark, Math.cos(i * 1.57) * 2.2, 0.15, Math.sin(i * 1.57) * 2.2));
      g.add(mesh(new THREE.BoxGeometry(2.2, 0.02, 0.05), M.dark, 1.1 + 0.45, 0.04, 0));
    } else if (kit.model === 'dish') {
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 10), M.white, 0, 1.0, 0));
      const head = new THREE.Group(); head.position.y = 1.9; g.add(head); spin.push({ o: head, rate: 0.6 });
      const dish = mesh(new THREE.SphereGeometry(1.2, 20, 8, 0, Math.PI * 2, 0, 0.75), M.white, 0, 0, 0); dish.rotation.x = -Math.PI / 2 + 0.5; dish.position.set(0, 0.3, -0.5); head.add(dish);
      dish.material = M.dish;
      const feed = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), M.dark, 0, 0.75, 0.05); feed.rotation.x = -0.5; head.add(feed);
      head.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), col, 0, 1.2, 0.35));
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), col, 0.7, 0.55, 0.5));
    } else if (kit.model === 'lab') {
      // a ridge tent: a three-sided prism lying along x, apex up
      const tent = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3.6, 3, 1, true).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), M.canvas); tent.position.set(0, 0.8, -2.2); tent.castShadow = true; g.add(tent);
      g.add(mesh(new THREE.BoxGeometry(3.7, 0.08, 0.08), col, 0, 2.06, -2.2));
      g.add(mesh(new THREE.BoxGeometry(1.4, 0.06, 0.7), M.white, 1.4, 0.85, 0.4));
      for (const [x, z] of [[0.8, 0.15], [2, 0.15], [0.8, 0.65], [2, 0.65]]) g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 4), M.dark, x, 0.42, z));
      for (let i = 0; i < 4; i++) g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), colourMat(['#7fd0ff', '#b6f07a', '#ffcf6a', kit.colour][i]), 0.9 + i * 0.28, 0.98, 0.4));
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.45, 0.4), M.dark, -1.3, 0.22, 0.5));
    } else {
      // relay: a thin lattice mast with two panel antennas and a light on top
      for (let i = 0; i < 3; i++) { const a = i * 2.094; g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 5.6, 4), M.pole, Math.sin(a) * 0.18, 3.0, Math.cos(a) * 0.18)); }
      for (let y = 0.8; y < 5.6; y += 0.7) { const hoop = mesh(new THREE.TorusGeometry(0.2, 0.012, 4, 10), M.pole, 0, y, 0); hoop.rotation.x = Math.PI / 2; g.add(hoop); }
      for (const s of [1, -1]) { const p = mesh(new THREE.BoxGeometry(0.06, 0.8, 0.35), col, s * 0.3, 4.9, 0); g.add(p); }
      const light = mesh(new THREE.SphereGeometry(0.08, 8, 6), M.blink, 0, 5.9, 0); g.add(light); spin.push({ o: light, blink: true });
    }
    return { group: g, spin };
  }
  function syncModels() {
    const want = new Set(sites.map(s => s.key));
    for (const [k2, m] of models) if (!want.has(k2)) { m.group.removeFromParent(); models.delete(k2); }
    for (const s of sites) {
      let m = models.get(s.key);
      const kit = kitById(s.kit); if (!kit) continue;
      if (!m) {
        m = { ...buildSite(kit), born: now(), kit };
        m.group.position.set(s.p[0], ground(s.p[0], s.p[2]), s.p[2]); m.group.rotation.y = s.yaw || 0;
        root.add(m.group); models.set(s.key, m);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- the room's messages
  function onMsg(m) {
    if (m.id !== 'survey') return;
    if (m.k === 'sites') { sites = m.list || []; syncModels(); }
    else if (m.k === 'crates') crates = new Map((m.list || []).map(c => [c.id, c]));
    else if (m.k === 'spawned') { lastKit = m.kit; }
    else if (m.k === 'setup') {
      stats.setups++;
      const kit = kitById(m.kit);
      hud?.card(`${kit?.name || 'Kit'} set up — ${m.grade || 'good'} spot! Drive back to the ${office.name} to report it.`);
      sounds?.play('flag');
    } else if (m.k === 'report') {
      stats.reports++;
      hud?.card(`Survey report filed: ${m.n} kit${m.n === 1 ? '' : 's'}, +${m.gold} gold${m.level ? ` · level ${m.level} done!` : ''}`);
      sounds?.play('flag');
    } else if (m.k === 'prog') prog = m;
  }

  // ---------------------------------------------------------------------------------------------- crates near me
  const isKitCrate = E => !!E && E.kind === CRATE.kind && crates.has(E.id);
  const kitOfCrate = E => kitById(crates.get(E.id)?.kit);
  const tr = E => E.veh.rb.translation();
  const others = () => sites.map(s => ({ kit: s.kit, x: s.p[0], z: s.p[2] }));
  function nearCrate(feet, r = NEAR_CRATE) {
    let best = null, bd = r;
    for (const E of S.ents.values()) {
      if (!isKitCrate(E) || E.veh.carriedBy || E.veh.remoteCarried) continue;
      const t = tr(E), d = Math.hypot(t.x - feet[0], t.z - feet[2]);
      if (d < bd && Math.abs(t.y - feet[1]) < 2.5) { bd = d; best = E; }
    }
    return best;
  }
  /** What the readout is about: the crate I carry / sling / drive with / stand by. -> { E, kit, at: [x,y,z], how } | null */
  function target() {
    const seat = S.mySeat(), V2 = seat ? S.ents.get(seat[0]) : null, w = S.walker(), C = S.carrying?.();
    if (slung && S.ents.has(slung.id)) { const t = tr(slung.E); return { E: slung.E, kit: kitOfCrate(slung.E), at: [t.x, t.y, t.z], how: 'sling' }; }
    if (C && isKitCrate(C)) { const t = tr(C); return { E: C, kit: kitOfCrate(C), at: [t.x, t.y, t.z], how: 'carry' }; }
    if (V2) {
      const t = tr(V2), r = (V2.def.chassis?.hz || 2) + 1.5;
      for (const E of S.ents.values()) {
        if (!isKitCrate(E)) continue;
        const c = tr(E); if (Math.hypot(c.x - t.x, c.z - t.z) <= r && Math.abs(c.y - t.y) < 3) return { E, kit: kitOfCrate(E), at: [t.x, t.y, t.z], how: 'ride' };
      }
      return null;
    }
    if (w) { const E = nearCrate(w.feet, 6); if (E) { const t = tr(E); return { E, kit: kitOfCrate(E), at: [t.x, t.y, t.z], how: t.y - ground(t.x, t.z) <= ON_GROUND ? 'near' : 'loaded' }; } }      // loaded: still up in a truck bed
    return null;
  }

  // ---------------------------------------------------------------------------------------------- E: tap / hold
  const padHeld = () => { try { for (const p of navigator.getGamepads?.() || []) if (p?.buttons?.[2]?.pressed) return true; } catch { /* no pads */ } return false; };
  const touchy = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
  const eHeld = () => !!(S.keys?.has?.('KeyE') || padHeld() || hud?.held);
  /** A kit crate right at my feet (1.8 m): it beats a vehicle's seat for E, so a crate in a jeep's back can be unloaded. */
  const closeCrate = feet => nearCrate(feet, 1.8);
  function press(E) {
    if (!isKitCrate(E)) return false;
    hold = { E, t0: now(), begun: false, need: setupMs(kitOfCrate(E), ups()) };
    return true;
  }
  function stepHold() {
    // the touch button starts a hold straight away (nothing to pick up with it)
    if (!hold && hud?.held) { const w = S.walker(), E = w && !S.mySeat() && !S.carrying?.() ? nearCrate(w.feet) : null; if (E) hold = { E, t0: now() - TAP_MS, begun: false, need: setupMs(kitOfCrate(E), ups()) }; }
    if (!hold) return;
    const w = S.walker(), held = eHeld(), el = now() - hold.t0;
    if (!S.ents.has(hold.E.id) || !w || S.mySeat()) { hold = null; return; }
    const t = tr(hold.E);
    if (Math.hypot(t.x - w.feet[0], t.z - w.feet[2]) > NEAR_CRATE + 0.5) { if (hold.begun) toast('Stay by the crate while it unfolds'); hold = null; return; }
    if (!held && !hold.begun) { const E = hold.E; hold = null; if (el < TAP_MS + 400) S.grab(E); return; }      // a tap: pick it up
    if (!held && hold.begun) { toast('Let go too soon — hold E until it has unfolded'); hold = null; return; }
    if (!hold.begun && el >= TAP_MS) {
      const kit = kitOfCrate(hold.E), j = judgeSpot(kit, V, [t.x, t.y, t.z], { others: others(), office });
      if (t.y - ground(t.x, t.z) > ON_GROUND) { toast('Put the crate on the ground first'); hold = null; return; }
      if (!j.ok) { toast(`Not here: ${j.why}`); hold = null; return; }
      send('begin', { to: hold.E.id }); hold.begun = true; hold.tb = now();
      sounds?.play('door', { at: t });
      return;
    }
    if (hold.begun && now() - hold.tb >= hold.need) { send('setup', { to: hold.E.id }); hold = null; }
  }

  // ---------------------------------------------------------------------------------------------- loading a vehicle
  function freeSlot(V2) {
    const slots = HOLDS[V2.kind]; if (!slots) return null;
    for (const s of slots) {
      const w = V2.veh.toWorld({ x: s[0], y: s[1], z: s[2] });
      let taken = false;
      for (const E of S.ents.values()) { if (!E.isProp || E === S.carrying?.()) continue; const t = tr(E); if (Math.hypot(t.x - w.x, t.y - w.y, t.z - w.z) < 0.7) { taken = true; break; } }
      if (!taken) return w;
    }
    return null;
  }
  function loadTarget(feet) {
    let best = null, bd = 4.5;
    for (const E of S.ents.values()) {
      if (E.isProp || !HOLDS[E.kind]) continue;
      const t = tr(E), d = Math.hypot(t.x - feet[0], t.z - feet[2]) - (E.def.chassis?.hz || 1) * 0.5;
      if (d < bd) { bd = d; best = E; }
    }
    return best;
  }
  function load(C) {
    if (!isKitCrate(C)) return false;
    const w = S.walker(); if (!w) return false;
    const V2 = loadTarget(w.feet); if (!V2) return false;
    const at = freeSlot(V2);
    if (!at) { toast(`The ${V2.def.name} is full`); return true; }
    const v = V2.veh.rb.linvel(), q = V2.veh.rb.rotation();
    S.placeCarried([at.x, at.y, at.z], [v.x, v.y, v.z], q);
    toast(`Loaded into the ${V2.def.name} — drive gently, it can fall out`);
    sounds?.play('door', { at });
    return true;
  }

  // ---------------------------------------------------------------------------------------------- the helicopter sling
  const isHeli = E => !!E && (E.kind === 'helicopter' || !!E.def.heli);
  const slingLen = () => surveyRules(ups()).sling;
  function slingCandidate(H) {
    const t = tr(H), L = slingLen();
    let best = null, bd = 6;
    for (const E of S.ents.values()) {
      if (!isKitCrate(E) || E.veh.carriedBy || E.veh.remoteCarried) continue;
      const c = tr(E), d = Math.hypot(c.x - t.x, c.z - t.z), below = t.y - c.y;
      if (d < bd && below > 1 && below < L + 4) { bd = d; best = E; }
    }
    return best;
  }
  function attach(H, E) {
    const hy = CRATE.hy;
    // carried like a walker carries it, by a pretend walker hanging under the helicopter (props.js holds a carried
    // prop 0.6 m ahead of its carrier's feet and 0.95 m + its half height up)
    const hang = { get feet() { const t = H.veh.rb.translation(), y = yawOf(H.veh.rb.rotation()), L = slingLen(); return [t.x - Math.sin(y) * 0.6, t.y - L - 0.95 - hy, t.z - Math.cos(y) * 0.6]; },
      get yaw() { return yawOf(H.veh.rb.rotation()); } };
    E.veh.carry(hang);
    slung = { id: E.id, E, H };
    toast(`Crate on the sling (${slingLen()} m) — T drops it`);
    sounds?.play('door', { at: tr(E) });
  }
  function release(tell = true) {
    if (!slung) return;
    const E = slung.E, v = S.ents.has(slung.H.id) ? slung.H.veh.rb.linvel() : { x: 0, y: 0, z: 0 };
    if (S.ents.has(E.id) && E.veh.carriedBy) E.veh.drop([v.x, v.y, v.z]);
    slung = null;
    if (tell) toast('Crate dropped');
  }
  function sling(H) {
    if (slung) { release(); return; }
    const E = slingCandidate(H);
    if (!E) { toast(`Hover over a kit crate, less than ${slingLen()} m above it, then press T`); return; }
    if (E.veh.local) attach(H, E); else { pendingSling = { id: E.id, H }; net.send({ t: 'own', id: E.id }); }
  }

  // ---------------------------------------------------------------------------------------------- every frame
  function frame(dt, s = {}) {
    if (disposed) return;
    const seat = S.mySeat(), E = seat ? S.ents.get(seat[0]) : null, w = S.walker();
    stepHold();
    // the sling: T in the helicopter's pilot seat
    if (E && seat[1] === 0 && isHeli(E) && s.hitch) sling(E);
    if (pendingSling) { const C = S.ents.get(pendingSling.id); if (!C) pendingSling = null; else if (C.veh.local) { const H = pendingSling.H; pendingSling = null; if (S.mySeat()?.[0] === H.id) attach(H, C); } }
    if (slung && (!S.ents.has(slung.id) || !S.ents.has(slung.H.id) || S.mySeat()?.[0] !== slung.H.id || !slung.E.veh.local)) release(false);
    // the office: drive (or walk) in with something to report
    const at = E ? tr(E) : w ? { x: w.feet[0], z: w.feet[2] } : null;
    if (at && Math.hypot(at.x - office.x, at.z - office.z) <= OFFICE_R - 4 && sites.some(x => x.owner === me && !x.paid) && now() - lastReport > 4000) { lastReport = now(); send('report'); }
    // the readout
    readT += dt;
    if (readT >= READ_EVERY) {
      readT = 0;
      const T = target();
      if (T?.kit) {
        lastKit = T.kit.id;
        const j = judgeSpot(T.kit, V, T.at, { others: others(), office });
        read = { ...T, j };
      } else read = null;
    }
    // the scanner: good spots for the kit in hand (or the last one spawned) near me, every few seconds
    const R = surveyRules(ups());
    if (R.scanner && at && lastKit) {
      const moved = !scan.at || Math.hypot(at.x - scan.at[0], at.z - scan.at[1]) > 80;
      if ((moved || scan.kit !== lastKit) && now() - scan.t > 2500) { scan = { at: [at.x, at.z], t: now(), kit: lastKit, list: goodSpots(kitById(lastKit), V, { others: others(), office }, { x: at.x, z: at.z, r: 650, step: 26, max: 16 }) }; }
    } else if (!R.scanner) scan.list = [];
  }

  // ---------------------------------------------------------------------------------------------- draw
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.9, 40).rotateX(-Math.PI / 2), M.ringOk); ring.renderOrder = 4; ring.visible = false; root.add(ring);
  const ropeGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const rope = new THREE.Line(ropeGeo, M.rope); rope.visible = false; rope.frustumCulled = false; root.add(rope);
  function band(E) {
    if (bands.has(E.id) || !E.model?.group) return;
    const kit = kitOfCrate(E); if (!kit) return;
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(CRATE.hx * 2.06, 0.12, CRATE.hz * 2.06), colourMat(kit.colour)); b.position.y = -CRATE.hy * 0.25; g.add(b);
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
      x.fillStyle = kit.colour; x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#10161a'; x.font = '900 38px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(kit.letter, 32, 34);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
      sp.scale.set(0.42, 0.42, 1); sp.position.y = CRATE.hy + 0.6; sp.renderOrder = 9; g.add(sp);
    }
    E.model.group.add(g); bands.set(E.id, g);
  }
  function update(camera, dt) {
    if (disposed) return;
    const t = now();
    for (const E of S.ents.values()) if (isKitCrate(E)) band(E);
    for (const id of [...bands.keys()]) if (!S.ents.has(id)) bands.delete(id);
    for (const m of models.values()) {
      const k = Math.min(1, (t - m.born) / 1400), e = 1 - (1 - k) ** 3;
      m.group.scale.set(1, Math.max(0.05, e), 1);
      for (const sp of m.spin) {
        if (sp.rate) sp.o.rotation.y += sp.rate * dt;
        if (sp.wave) sp.o.rotation.y = Math.sin(t / 400) * 0.4;
        if (sp.blink) sp.o.visible = (t % 1400) < 300;
      }
    }
    // the ring under the crate I am working with
    if (read) {
      const gx = read.how === 'ride' ? read.at[0] : read.at[0], gz = read.at[2];
      ring.visible = true; ring.material = read.j.ok ? M.ringOk : M.ringBad;
      ring.position.set(gx, ground(gx, gz) + 0.15, gz);
    } else ring.visible = false;
    // the sling rope
    if (slung && S.ents.has(slung.id) && S.ents.has(slung.H.id)) {
      const a = tr(slung.H), b = tr(slung.E), P = ropeGeo.attributes.position;
      P.setXYZ(0, a.x, a.y - 0.6, a.z); P.setXYZ(1, b.x, b.y + CRATE.hy, b.z); P.needsUpdate = true; rope.visible = true;
    } else rope.visible = false;
    // HUD
    let r = null, holdK = null;
    if (read) {
      const j = read.j, kit = read.kit;
      const how = read.how === 'ride' ? 'riding with you' : read.how === 'sling' ? 'on the sling' : read.how === 'carry' ? 'in your hands' : read.how === 'loaded' ? 'loaded' : 'here';
      r = { name: `${kit.name} · ${how}`, colour: kit.colour, ok: j.ok, line: j.ok ? `Good spot — ${j.grade}` : j.why,
        sub: j.ok ? (read.how === 'near' ? (touchy() ? 'Hold the SET UP button to set it up' : 'Hold E to set it up') : read.how === 'carry' ? 'Put it down here, then hold E' : read.how === 'loaded' ? 'Take it out and put it on the ground to set it up' : 'Unload it here, then hold E beside it') : (kit.blurb || '') };
    }
    if (hold?.begun && r) holdK = (now() - hold.tb) / hold.need;
    const w = S.walker();
    const button = !!(read && read.how === 'near' && read.j.ok && w && !S.mySeat() && !S.carrying?.() && nearCrate(w.feet));
    hud?.update({ read: r, hold: holdK, button });
  }

  // ---------------------------------------------------------------------------------------------- phone, hints, map
  function spawn(kitId) {
    const kit = kitById(kitId); if (!kit) return { why: 'That is not a survey kit.' };
    const seat = S.mySeat(), E = seat ? S.ents.get(seat[0]) : null, w = S.walker();
    let p;
    if (E) { const sx = (E.def.chassis?.hx || 1) + 1.4; const at = E.veh.toWorld({ x: -sx, y: 0, z: 0 }); p = [at.x, 0, at.z]; }
    else if (w) { const y = S.cam?.yaw ?? 0; p = [w.feet[0] - Math.cos(y) * 2.2 + Math.sin(y) * 1.2, 0, w.feet[2] + Math.sin(y) * 2.2 + Math.cos(y) * 1.2]; }
    else return { why: 'Wait a moment and try again.' };
    lastKit = kitId;
    send('spawn', { kit: kitId, p: p.map(v => Math.round(v * 100) / 100) });
    return { ok: true };
  }
  function nearSpot(feet) {
    if (nearCrate(feet)) return null;
    let best = null, bd = NEAR_SITE - 1;
    for (const s of sites) { if (s.owner !== me) continue; const d = Math.hypot(s.p[0] - feet[0], s.p[2] - feet[2]); if (d < bd) { bd = d; best = s; } }
    if (!best) return null;
    const kit = kitById(best.kit);
    return { hint: `Pack up your ${kit?.name || 'kit'}`, use: () => send('pack', { n: best.id }) };
  }
  function hudOf() {
    const seat = S.mySeat(), E = seat ? S.ents.get(seat[0]) : null, w = S.walker(), C = S.carrying?.();
    let hint = null;
    if (E && seat[1] === 0 && isHeli(E)) {
      if (slung) hint = 'T — Drop the crate off the sling';
      else if (slingCandidate(E)) hint = 'T — Hook the crate on the sling';
    } else if (!E && w && C && isKitCrate(C)) {
      const V2 = loadTarget(w.feet);
      hint = V2 ? `Load the crate into the ${V2.def.name}` : 'Put the crate down (then hold E by it to set it up)';
    } else if (!E && w && !C) {
      const K = nearCrate(w.feet, 2.2);
      if (K) hint = read?.j?.ok && read.E === K ? 'tap: pick up · hold: set up the kit' : 'Pick up the kit crate';
    }
    const unpaid = sites.filter(s => s.owner === me && !s.paid).length;
    const line = unpaid ? `Survey: ${unpaid} kit${unpaid === 1 ? '' : 's'} to report at the ${office.name}` : prog?.text && read ? `Survey level ${prog.level ?? '✓'}: ${prog.text}` : null;
    return { hint, line };
  }
  function spots() {
    const out = sites.map(s => { const k = kitById(s.kit); return { kind: 'kit', x: s.p[0], z: s.p[2], label: `${k?.name || 'Kit'}${s.owner === me ? '' : ' (a friend\'s)'}${s.paid ? '' : ' — not reported yet'}`, color: k?.colour, letter: k?.letter || 'K' }; });
    out.push({ kind: 'office', x: office.x, z: office.z, label: office.name, color: '#e8c860', letter: 'O' });
    for (const g of scan.list) out.push({ kind: 'good', x: g.x, z: g.z, label: `Good spot for a ${kitById(scan.kit)?.name || 'kit'}`, color: '#8ff07a', letter: '+' });
    return out;
  }
  return {
    onMsg, press, load, closeCrate, frame, update, spawn, nearSpot, spots, hud: hudOf,
    get sites() { return sites; }, get crates() { return crates; }, get slung() { return slung; }, view: V, office,
    /** tests: the readout as the page shows it */
    get reading() { return read ? { kit: read.kit.id, ok: read.j.ok, why: read.j.why, how: read.how, q: read.j.q } : null; },
    debug: () => ({ sites: sites.map(s => ({ key: s.key, kit: s.kit, owner: s.owner, paid: s.paid, p: s.p })), crates: [...crates.values()], read: read ? { kit: read.kit.id, ok: read.j.ok, why: read.j.why, how: read.how } : null,
      hold: hold ? { begun: hold.begun, id: hold.E.id } : null, slung: slung ? slung.id : null, prog, scan: scan.list.length, sent: stats.sent, setups: stats.setups, reports: stats.reports, models: models.size, readText: hud?.readText || null }),
    dispose() { disposed = true; release(false); root.removeFromParent(); for (const g of bands.values()) g.removeFromParent(); hud?.dispose(); for (const m of Object.values(M)) m.dispose?.(); for (const m of kitMat.values()) m.dispose(); },
  };
}
