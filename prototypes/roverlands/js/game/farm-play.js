// Farming in the page (Expansion 1 M6): the glue between the machines you drive and the farming referee in the room.
// js/game/session.js makes one when the world has farm plots (Wayfare County) and calls it every frame.
//
//   const farm = createFarmPlay({ THREE, scene, world, net, enhance, quality, job, toast, sounds });
//   farm.onMsg(m)                  every `{ t:'job', id:'farming', … }` from the room (k: full / cells / veh / prog / sold)
//   farm.frame(dt, ctx)            ctx = { E (the vehicle I sit in), seat (my seat index), towed (what E tows), ents }
//   farm.hud(ctx) -> { line, hint } the HUD's farm line ("Field 1 · Wheat — cut 40% · Trailer 80 / 150") and a hint
//   farm.spots() -> [{ kind, x, z, label }]   the market, the Port Lindell depot and the water point, for the maps
//   farm.debug() / farm.dispose()
//
// What I do here, as the driver of a farm machine (the room checks all of it again — js/game/jobs/farming.js):
//   harvester            its header cuts standing crop          -> step 'cut' (crop into its own hopper)
//   tractor, mower down  the mower cuts (Space / Shift)         -> step 'cut' (crop into the produce trailer it tows)
//   towing a seed drill  switched on (fire), it plants cut soil -> step 'plant' (twice as wide with the Wide seed drill)
//   towing a bowser      spraying (fire), it waters planted soil -> step 'water' (until the tank is dry); parked at the
//                        yard's water point it fills up by itself -> step 'refill'
//   at the market        tip the produce trailer (fire), or stop the harvester in the yard -> step 'sell'
// Cells change on my screen at once (the room's answer follows); a cell the room did not take within 2.5 s goes back.
import { fieldsFrom, createFarm, cellsUnder, cellAt, fieldOf, sellPoints, waterPoints, farmRules, levelForField, STEPS, ST, CROP_NAMES } from './jobs/farming.js';
import { createCrops } from './crops.js';

const SEND_EVERY = 0.25;          // s between job messages while working
const CONFIRM_MS = 2500;          // a cell the room has not confirmed by then goes back to what it was

export function createFarmPlay({ THREE, scene, world, net, enhance = m => m, quality = 'medium', job = null, toast = () => {}, sounds = null }) {
  const fields = fieldsFrom(world.sites);
  if (!fields.length) return null;
  const farm = createFarm({ fields, seed: net.room?.seed ?? 7 });
  const crops = createCrops({ THREE, scene, world, fields, farm, enhance, quality });
  const sells = sellPoints(world.sites), waters = waterPoints(world.sites);
  const veh = new Map();                 // entId -> { load, cap, water, wcap, crop }
  let prog = { level: 1, text: '', open: 1 };
  const pending = new Map();             // cellId -> { was, at }
  const queue = { cut: [], plant: [], water: [] };
  const queueVeh = { cut: null, plant: null, water: null, to: null };
  let sendT = 0, actT = 0, stats = { sent: 0, cells: 0 };
  const now = () => performance.now();
  const upgrades = () => net.last?.profile?.profile?.jobs?.farming?.upgrades || [];
  const rules = () => farmRules(upgrades());
  net.send({ t: 'job', id: 'farming', step: 'sync' });      // the room's picture of the farm (it may have come before we listened)

  // ---- signs: the sell points, the water point (with a tank to see it by), a board on every field
  const signs = [];
  function sign(text, color, x, z, h, w = 5.6) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.font = '800 50px "Trebuchet MS", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = Math.min(500, g.measureText(text).width + 70);
    g.fillStyle = 'rgba(14,19,22,0.82)'; g.beginPath(); g.roundRect((512 - tw) / 2, 14, tw, 92, 46); g.fill();
    g.lineWidth = 6; g.strokeStyle = color; g.stroke(); g.fillStyle = '#f2ead8'; g.fillText(text, 256, 62);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    sp.scale.set(w, w / 4, 1); sp.renderOrder = 9; sp.position.set(x, world.heightAt(x, z) + h, z);
    scene.add(sp); signs.push(sp); return sp;
  }
  for (const s of sells) sign('Sell produce here', '#d9c45a', s.x, s.z, 7, 6.4);
  const tank = new THREE.Group();
  for (const w of waters) {
    sign('Water point', '#5aa7e8', w.x, w.z, 7.5);
    const y = world.heightAt(w.x, w.z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.6, 12), enhance(new THREE.MeshLambertMaterial({ color: '#4f7f9f' })));
    body.position.set(w.x, y + 3.3, w.z);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2.4), enhance(new THREE.MeshLambertMaterial({ color: '#6a5a48' })));
    legs.position.set(w.x, y + 1, w.z);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6), enhance(new THREE.MeshLambertMaterial({ color: '#3a3f44' })));
    pipe.rotation.z = Math.PI / 2; pipe.position.set(w.x - 1.8, y + 2.4, w.z);
    tank.add(legs, body, pipe);
  }
  scene.add(tank);
  const fieldSigns = fields.map(f => sign(`Field ${f.n} · ${CROP_NAMES[f.crop]}`, '#8fd05a', f.x, f.z + f.h / 2 + 2, 3.2, 4.6));
  function drawFieldSigns() {
    fields.forEach((f, k) => { fieldSigns[k].material.opacity = f.n <= prog.open ? 1 : 0.45; });
  }

  // ---- the room's news
  function onMsg(m) {
    if (m.id !== 'farming') return;
    if (m.k === 'full') {
      farm.load(m.farm, now());
      pending.clear();
      veh.clear(); for (const [id, load, cap, water, wcap] of m.veh || []) veh.set(id, { load, cap, water, wcap });
      if (m.open) prog.open = m.open;
      crops.dirtyAll(); drawFieldSigns();
    } else if (m.k === 'cells') {
      const t = now();
      for (const id of m.cells) pending.delete(id);
      farm.set(m.st, m.cells, t, m.g);
      crops.dirty(m.cells);
    } else if (m.k === 'veh') {
      veh.set(m.veh, { load: m.load, cap: m.cap, water: m.water, wcap: m.wcap, crop: m.crop });
    } else if (m.k === 'prog') {
      const was = prog.open; prog = { level: m.level, text: m.text, open: m.open || 1 };
      if (m.open > was) { toast(`Field ${m.open} is open (${CROP_NAMES[fields[m.open - 1]?.crop] || 'crop'})`); drawFieldSigns(); }
    } else if (m.k === 'sold') {
      sounds?.play?.('capture');
    }
  }

  // ---- working the field
  /** The cells under a machine's work strip (def block p / hw / hd, in the machine's frame) in the state that step takes. */
  function strip(X, part, step, scale = 1) {
    const c = X.veh.toWorld({ x: part.p[0], y: part.p[1], z: part.p[2] }), f = X.veh.toWorld({ x: part.p[0], y: part.p[1], z: part.p[2] + 1 });
    const from = STEPS[step][0];
    return cellsUnder(fields, { x: c.x, z: c.z, fx: f.x - c.x, fz: f.z - c.z, hw: part.hw * scale, hd: part.hd }, (id, fl) => fl.n <= prog.open && farm.state(id) === from && !pending.has(id));
  }
  function mark(step, ids, vehId, to = null) {
    if (!ids.length) return;
    const t = now(), toSt = STEPS[step][1];
    // the room's clock (CONFIRM_MS) starts when a cell goes on the wire (flush), not here: the queue is sent every
    // SEND_EVERY of GAME time (dt is capped), so at a few frames a second a cell could wait longer than CONFIRM_MS in
    // the queue, go back, be marked again and ride in the same message twice (the room watered and paid it twice)
    for (const id of ids) pending.set(id, { was: farm.state(id), at: Infinity });
    farm.set(toSt, ids, t, rules().growMs);
    crops.dirty(ids);
    queue[step].push(...ids); queueVeh[step] = vehId; if (step === 'cut') queueVeh.to = to;
  }
  function flush() {
    for (const step of ['cut', 'plant', 'water']) {
      const q = queue[step];
      const t = now();
      for (const id of q) { const p = pending.get(id); if (p) p.at = Math.min(p.at, t); }
      while (q.length) { const cells = q.splice(0, 400); net.send({ t: 'job', id: 'farming', step, veh: queueVeh[step], cells, ...(step === 'cut' && queueVeh.to != null ? { to: queueVeh.to } : {}) }); stats.sent++; stats.cells += cells.length; }
    }
  }
  const near = (X, list, pad = 0) => { if (!X) return null; const t = X.veh.rb.translation(); return list.find(s => Math.hypot(t.x - s.x, t.z - s.z) <= s.r + pad) || null; };
  const loadOf = id => veh.get(id) || { load: 0, cap: 0, water: 0, wcap: 0 };

  function frame(dt, { E = null, seat = null, towed = null, ents = null } = {}) {
    const t = now();
    // cells the room never confirmed go back
    for (const [id, p] of pending) if (t - p.at > CONFIRM_MS) { pending.delete(id); farm.set(p.was, [id], t); crops.dirty([id]); }
    // a produce trailer's heap shows its load (model.update reads X.load, 0..1)
    if (ents) for (const X of ents.values()) if (X.kind === 'produce_trailer') { const v = veh.get(X.id); X.load = v && v.cap ? Math.min(1, v.load / v.cap) : 0; }
    if (E && seat === 0 && E.veh.local && !E.isProp) {
      const moving = Math.abs(E.veh.forwardSpeed()) > 0.4, d = E.def;
      if (moving) {
        if (d.harvest) mark('cut', strip(E, d.harvest, 'cut'), E.id);
        else if (d.mower && E.acts.mower) mark('cut', strip(E, d.mower, 'cut'), E.id, towed?.kind === 'produce_trailer' ? towed.id : null);
        if (towed?.def.sow && towed.acts.door_sow) mark('plant', strip(towed, towed.def.sow, 'plant', rules().drillScale), towed.id);
        if (towed?.def.spray && towed.acts.door_spray) {
          const v = loadOf(towed.id), left = (v.wcap ? v.water : rules().waterCap) - queue.water.length;
          if (left > 0) mark('water', strip(towed, towed.def.spray, 'water').slice(0, left), towed.id);
        }
      }
      sendT += dt;
      if (sendT >= SEND_EVERY) { sendT = 0; flush(); }
      // fill up / sell: asked for once a second and a half while it applies (the room says no when it does not)
      actT += dt;
      if (actT > 1.5) {
        actT = 0;
        if (towed?.kind === 'water_bowser' && near(towed, waters, 6)) { const v = loadOf(towed.id); if (!v.wcap || v.water < rules().waterCap) net.send({ t: 'job', id: 'farming', step: 'refill', veh: towed.id }); }
        const bin = d.harvest ? E : towed?.kind === 'produce_trailer' ? towed : null;
        if (bin && loadOf(bin.id).load > 0 && near(bin, sells, 10) && (bin === E ? Math.abs(E.veh.forwardSpeed()) < 1.5 : bin.acts.door_bed)) net.send({ t: 'job', id: 'farming', step: 'sell', veh: bin.id });
      }
    } else { flush(); sendT = 0; }
  }
  function update(camera) { crops.update(camera.position, now()); for (const s of signs) { const d = s.position.distanceTo(camera.position); s.visible = d > 14 && d < 260; } }   // hidden right under it: a sign would fill the screen

  /** What the HUD shows for farming: a line while you are in a farm machine or near the fields, and a hint. */
  function hud({ E = null, seat = null, towed = null, feet = null } = {}) {
    const at = E ? E.veh.rb.translation() : feet ? { x: feet[0], z: feet[2] } : null;
    if (!at) return null;
    const farmVeh = E && (E.def.harvest || E.def.mower);
    const f = fields.find(x => Math.abs(at.x - x.x) <= x.w / 2 + 20 && Math.abs(at.z - x.z) <= x.h / 2 + 20);
    const nearFarm = f || Math.hypot(at.x - (world.sites.farms?.yard?.x ?? 1e9), at.z - (world.sites.farms?.yard?.z ?? 1e9)) < 80;
    const atSell = near(E && E.def.harvest ? E : towed, sells, 10);
    if (!farmVeh && !nearFarm && !atSell) return null;
    const bits = [];
    if (f) {
      const c = farm.counts(f);
      bits.push(f.n <= prog.open ? `Field ${f.n} · ${CROP_NAMES[f.crop]}: ${Math.round(c.grown / c.total * 100)}% ripe, ${Math.round(c.cut / c.total * 100)}% cut, ${Math.round((c.planted + c.watered) / c.total * 100)}% sown` : `Field ${f.n} · ${CROP_NAMES[f.crop]} — opens at farming level ${levelForField(job, f.n) ?? '?'}`);
    }
    const bin = E?.def.harvest ? E : towed?.kind === 'produce_trailer' ? towed : null;
    if (bin) { const v = loadOf(bin.id); bits.push(`${bin === E ? 'Hopper' : 'Trailer'} ${v.load} / ${v.cap || (bin === E ? rules().hopperCap : rules().trailerCap)}`); }
    if (towed?.kind === 'water_bowser') { const v = loadOf(towed.id); bits.push(`Water ${v.wcap ? v.water : rules().waterCap} / ${v.wcap || rules().waterCap}`); }
    if (!f && prog.text) bits.push(prog.text);
    let hint = null;
    if (E && seat === 0) {
      const v = towed ? loadOf(towed.id) : null;
      if (atSell && bin && loadOf(bin.id).load > 0) hint = bin === E ? 'Stop here to sell the hopper' : (towed.acts.door_bed ? 'Selling…' : 'Fire: tip the trailer to sell');
      else if (towed?.kind === 'water_bowser' && near(towed, waters, 6)) hint = 'Filling the tank…';
      else if (towed?.kind === 'water_bowser' && v.wcap && v.water <= 0) hint = 'Tank empty — fill up at the water point in the farm yard';
      else if (f && f.n > prog.open) hint = `Field ${f.n} opens at farming level ${levelForField(job, f.n) ?? '?'}`;
      else if (f && E.def.mower && !E.acts.mower && !towed?.def.sow && !towed?.def.spray) hint = 'Shift — lower the mower to cut';
    }
    return { line: bits.join(' · '), hint };
  }
  const spots = () => [...sells.map(s => ({ kind: 'sell', x: s.x, z: s.z, label: s.name })), ...waters.map(w => ({ kind: 'water', x: w.x, z: w.z, label: w.name }))];
  function debug() {
    const c = fields.slice(0, 3).map(f => farm.counts(f));
    return { open: prog.open, level: prog.level, prog: prog.text, fields: c, veh: Object.fromEntries(veh), pending: pending.size, sent: stats.sent, cells: stats.cells, draws: crops.draws() };
  }
  function dispose() { crops.dispose(); for (const s of signs) { s.removeFromParent(); s.material.map.dispose(); s.material.dispose(); } tank.removeFromParent(); }
  return { onMsg, frame, update, hud, spots, debug, dispose, farm, fields, cellAt: id => cellAt(fields, id), fieldOf: id => fieldOf(fields, id), ST };
}
