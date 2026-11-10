// Moon Work in the page (Expansion 1 M12): the glue between the Crater Crawler you drive and the Moon Work referee in
// the room (js/game/jobs/moon.js). js/game/session.js makes one on the Moon and calls it every frame. The room checks
// everything again; this side only reports what it saw happen, and draws what the room says (js/game/moon-fx.js).
//
//   const mp = createMoonPlay({ THREE, scene, world, net, view, enhance, sounds, toast, quality, S });
//     S = { ents, mySeat(), walker() }
//   mp.onMsg(m)              every `{ t:'job', id:'moon', … }`
//   mp.defFor(row, def)      a copy of a rover's definition (the Crater lamp's motor and the Mesh wheels change THAT body)
//   mp.control(dt, s)        before physics: the motor / grip upgrades on my rover, the Jump booster's one push
//   mp.frame(dt, s)          after physics: jumps (launch / land), T = the sample arm, stopping at the drop / a yard /
//                            a loose crate, jolts with crates aboard
//   mp.wheel(E, pt, n, surf, slide, dir, speed) -> true   a wheel on the regolith: dust that arcs up and falls slowly
//   mp.nearSpot(feet)        on foot beside a glowing sample: hold E to pick it up (into the rover beside you)
//   mp.hud({ E, seat, feet }) -> { line, hint, hitch }   mp.spots() -> map / minimap marks
//   mp.update(camera, dt) · mp.debug() · mp.dispose() · mp.test (Playwright helpers)
//
// Who does what:
//   sample runs    drive up to a glowing rock and stop: T (HITCH on a phone, D-pad left) swings the arm and the sample
//                  rides in the bin behind the seats (you can see it). Or get out and hold E beside it. Stop at the
//                  Sample Drop at Greywatch to hand the bin in.
//   crater jumps   take a run at a ramp (the room times you from the lip); land upright for the bonus, in the ring for
//                  more. With the Jump booster, Space / A / JUMP in the air gives one extra push.
//   supply runs    stop in the Greywatch supply yard (by the Rover Garage) to load, drive to Farside Depot and stop.
//                  A hard landing throws a crate out: stop beside it to load it again.
import { moonJobSites, moonRules, sampleRocks, MOON_VEHICLES, RAMP_R, DROP_R, PICK_R, FOOT_REACH, FOOT_ROVER, flat } from './jobs/moon.js';
import { qrot } from '../phys/vmath.js';
import { createMoonFx, RARITY_COLOR } from './moon-fx.js';

const LOAD_HOLD = 1.2;            // s holding still beside a sample on foot
const JOLT_WINDOW = 0.1;          // s: a jolt = the change of velocity over this long
const BOOST = { fwd: 5.5, up: 3.2 };   // m/s added by the Jump booster's one push

export function createMoonPlay({ THREE, scene, world, net, view = null, enhance = m => m, sounds = null, toast = () => {}, quality = 'medium', S }) {
  if (world.map !== 'moon') return null;
  const M = moonJobSites(world);
  if (!M) return null;
  const me = net.you;
  const fx = createMoonFx({ THREE, scene, world, enhance, quality });
  const rockList = sampleRocks(M, world.seed).map(r => ({ ...r, rarity: M.samples[r.site].rarity, ready: 1 }));
  fx.rocks(rockList);
  fx.rings(M.ramps);
  const st = { bins: [], loose: [], prog: null, order: null, lastJump: null, rocksDirty: false };
  const stats = { sent: 0, grabs: 0, drops: 0, launches: 0, lands: 0, jolts: 0, picks: 0, loads: 0, boosts: 0 };
  const ups = () => net.last?.profile?.profile?.jobs?.moon?.upgrades || [];
  const send = (step, extra = {}) => { stats.sent++; net.send({ t: 'job', id: 'moon', step, ...extra }); };
  const pin = (x, z) => net.send({ t: 'pin', p: [Math.round(x), Math.round(z)] });
  const now = () => performance.now();
  const every = (() => { const at = new Map(); return (k, ms) => { const t = now(); if (t - (at.get(k) || 0) < ms) return false; at.set(k, t); return true; }; })();
  send('sync');

  function onMsg(m) {
    if (m.id !== 'moon') return;
    if (m.k === 'prog') { st.prog = m.text; return; }
    if (m.k === 'rocks') { for (const [id, r] of m.list) { const q = rockList[id]; if (q) q.ready = r; } fx.rocks(rockList); return; }
    if (m.k === 'bins') { st.bins = m.list; return; }
    if (m.k === 'loose') { st.loose = m.list; fx.loose(m.list); return; }
    if (m.k === 'order') { st.order = m; toast(m.text); pin(m.x, m.z); return; }
    if (m.k === 'grabbed') { stats.grabs++; toast(`Sample from ${m.site}${m.rarity === 'rare' ? ' — a rare one!' : ''} · ${m.n}/${m.of} in the bin`); sounds?.play('ui'); return; }
    if (m.k === 'picked') { toast('Crate back on the rack'); return; }
    if (m.k === 'bounced') { if (myBin()?.veh === m.veh) toast(m.left ? `A crate bounced out! (${m.left} left aboard) — go back for it` : 'The crate bounced out! Stop beside it to load it again'); return; }
    if (m.k === 'rille') { toast('Down the Silverthread — the whole rille!'); return; }
    if (m.k === 'delivered' && m.by?.includes(me)) {
      if (m.what === 'samples') toast(`${m.n} sample${m.n === 1 ? '' : 's'} handed in${m.rare ? ` (${m.rare} rare)` : ''}! +${m.gold} gold`);
      else toast(`${m.n} crate${m.n === 1 ? '' : 's'} delivered${m.round ? ' — a clean round trip' : m.clean ? ', not one dropped' : ''}! +${m.gold} gold`);
      sounds?.play('capture'); return;
    }
    if (m.k === 'jump' && m.by?.includes(me)) {
      st.lastJump = { ...m, at: now() };
      toast(`${m.name}: ${m.dist} m, ${m.air} s in the air${m.upright ? ', landed upright' : ''}${m.ring ? ' — IN THE RING' : ''}! +${m.gold} gold${m.repeat ? ' (same ramp: half pay)' : ''}`);
      sounds?.play(m.ring ? 'capture' : 'flag');
    }
  }

  // ---- helpers
  const myE = () => { const s = S.mySeat(); return s ? S.ents.get(s[0]) : null; };
  const pos = X => X.veh.rb.translation();
  const isRover = X => !!X && MOON_VEHICLES.includes(X.kind);
  const binOf = veh => st.bins.find(b => b.veh === veh) || null;
  const myBin = () => { const E = myE(); return E ? binOf(E.id) : null; };
  const upOf = X => qrot(X.veh.rb.rotation(), { x: 0, y: 1, z: 0 }).y;
  const kmText = d => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`);
  const yard = id => M.yards.find(y => y.id === id);
  function nearestRock(p, r) { let b = null, bd = r; for (const q of rockList) { if (!q.ready) continue; const d = flat(q, p); if (d < bd) { bd = d; b = q; } } return b ? { rock: b, d: bd } : null; }

  // ---- vehicle definitions I may change per body (the motor and the wheels are MY upgrades on MY rover)
  function defFor(row, def) {
    if (!def || !isRover(row)) return null;
    const d = { ...def, engine: { ...def.engine }, tyre: { ...def.tyre } };
    d._base = { force: def.engine.force, top: def.engine.top, grip: def.tyre.grip, slide: def.tyre.slide };
    return d;
  }
  // ---------------------------------------------------------------------------------------------- before physics
  const jump = { state: 'ground', ramp: null, t: 0, airT: 0, groundT: 0, boosted: false, startP: null, maxAir: 0 };
  let jumpWas = false;
  function control(dt, s = {}) {
    const E = myE(), seat = S.mySeat()?.[1];
    const edge = !!s.jump && !jumpWas; jumpWas = !!s.jump;
    if (!isRover(E) || seat !== 0 || !E.veh.local || !E.def._base) return;
    const R = moonRules(ups()), b = E.def._base;
    E.def.engine.force = b.force * R.motor.force; E.def.engine.top = b.top * R.motor.top;
    E.def.tyre.grip = b.grip * R.grip; E.def.tyre.slide = Math.min(0.95, b.slide * (R.grip > 1 ? 1.12 : 1));
    // the Jump booster: one push per jump, in the air off a ramp (or any time you are flying)
    if (edge && R.booster && !E.veh.grounded() && (E.veh.airTime || 0) > 0.12 && !jump.boosted) {
      const q = E.veh.rb.rotation(), f = qrot(q, { x: 0, y: 0, z: 1 }), m = E.veh.rb.mass();
      const h = Math.hypot(f.x, f.z) || 1;
      E.veh.rb.applyImpulse({ x: f.x / h * BOOST.fwd * m, y: BOOST.up * m, z: f.z / h * BOOST.fwd * m }, true);
      jump.boosted = true; stats.boosts++;
      fx.boost(E); sounds?.play('open', { at: pos(E) });
    }
  }
  // ---------------------------------------------------------------------------------------------- after physics
  const jolt = { hist: [], worst: 0, t: 0, veh: null };
  function measureJolt(E, dt) {
    if (jolt.veh !== E.id) { jolt.veh = E.id; jolt.hist = []; jolt.worst = 0; jolt.t = 0; }
    jolt.clock = (jolt.clock || 0) + dt;          // game time (a slow page's physics runs slower than the wall clock)
    const v = E.veh.rb.linvel(), t = jolt.clock;
    jolt.hist.push({ t, v: [v.x, v.y, v.z] });
    while (jolt.hist.length > 2 && t - jolt.hist[0].t > JOLT_WINDOW) jolt.hist.shift();
    const a = jolt.hist[0], span = t - a.t;
    if (span > 0.04) jolt.worst = Math.max(jolt.worst, Math.hypot(v.x - a.v[0], v.y - a.v[1], v.z - a.v[2]) / span);
    jolt.t += dt;
    if (jolt.t >= 0.5) { const w = jolt.worst; jolt.t = 0; jolt.worst = 0; return w; }
    return null;
  }
  let footLoad = null, stopT = 0;
  function frame(dt, s = {}) {
    const E = myE(), seat = S.mySeat()?.[1], W = S.walker?.();
    // on foot: holding still beside a sample
    if (footLoad) {
      const f = W?.feet, q = rockList[footLoad.rock];
      if (!f || !q?.ready || S.mySeat() || flat(q, f) > FOOT_REACH + 0.6) footLoad = null;
      else if ((footLoad.t += dt) >= LOAD_HOLD) { send('grab', { veh: footLoad.veh, n: footLoad.rock }); footLoad = null; }
    }
    if (!isRover(E)) { jump.state = 'ground'; return; }
    const p = pos(E), here = [p.x, p.y, p.z], sp = Math.abs(E.veh.forwardSpeed());
    // the arm: any seat, T beside a glowing sample
    if (s.hitch) {
      const R = moonRules(ups()), nr = nearestRock(here, R.reach);
      if (nr) { send('grab', { veh: E.id, n: nr.rock.id }); }
      else if (nearestRock(here, 25)) toast(`Get closer — the arm reaches ${R.reach} m`);
    }
    if (seat !== 0 || !E.veh.local) return;
    // ---- jumps: the moment all wheels leave the ground near a ramp's lip is the launch; settled back down is the landing
    const grounded = E.veh.grounded();
    if (jump.state === 'ground') {
      if (!grounded && E.veh.forwardSpeed() > 3) {
        const r = M.ramps.find(q => flat(q.lip, here) <= RAMP_R);
        if (r) { jump.state = 'air'; jump.ramp = r.i; jump.airT = 0; jump.boosted = false; jump.groundT = 0; jump.touch = null; jump.startP = here; send('launch', { veh: E.id, n: r.i }); stats.launches++; }
        else jump.boosted = false;
      } else if (grounded) jump.boosted = false;
    } else if (jump.state === 'air') {
      jump.airT += dt;                    // game time, not the wall clock: a slow phone runs the physics slower than real time
      // touching down: the first touch is where it landed (and the air time ends there); a wheel bouncing off the
      // regolith in low gravity must not reset it, so the time on the ground only drains slowly in the air
      if (grounded) { if (!jump.touch) { jump.touch = { p: here.map(v => Math.round(v * 100) / 100), air: jump.airT }; } jump.groundT += dt; }
      else jump.groundT = Math.max(0, jump.groundT - dt * 0.4);
      if (jump.groundT > 0.15 && jump.touch && jump.touch.air > 0.4) {
        jump.state = 'ground'; jump.maxAir = Math.max(jump.maxAir, jump.touch.air);
        send('land', { veh: E.id, p: jump.touch.p, on: upOf(E) > 0.6, n: Math.round(jump.touch.air * 10) }); stats.lands++;
      } else if (jump.groundT > 0.15) jump.state = 'ground';        // a hop on the lip, not a jump
      if (jump.touch && jump.groundT === 0 && jump.touch.air <= 0.4) jump.touch = null;
      if (jump.airT > 16) jump.state = 'ground';    // (MAX_AIR: no jump is that long)
    }
    // ---- stopped: at the drop, at a yard, beside a loose crate
    if (sp < 1.5) stopT += dt; else stopT = 0;
    const b = binOf(E.id);
    if (stopT > 0.6) {
      if (b?.samples?.length && flat(M.drop, here) <= DROP_R - 1 && every('drop', 1500)) { send('drop', { veh: E.id }); stats.drops++; }
      if (b?.crates && flat(yard(b.to), here) <= yard(b.to).r - 2 && every('drop', 1500)) { send('drop', { veh: E.id }); stats.drops++; }
      if (!b?.crates && stopT > 1.2 && M.yards.some(y => flat(y, here) <= y.r - 2) && revealed() && every('load', 2500)) { send('load', { veh: E.id }); stats.loads++; }
      const lc = st.loose.find(c => flat(c, here) <= PICK_R - 1);
      if (lc && every('pick', 1500)) { send('pick', { veh: E.id, n: lc.id }); stats.picks++; }
    }
    // ---- crates aboard: the worst jolt of each half second
    if (b?.crates) { const w = measureJolt(E, dt); if (w != null && w > 12) { send('jolt', { veh: E.id, n: Math.round(w * 10) }); stats.jolts++; } }
  }
  const revealed = () => { const P = net.last?.profile?.profile; return !!(P?.seen?.jobs?.includes('moon') || P?.ach?.launch_rocket); };

  // ---- the wheels on the regolith: dust thrown back and up that hangs in the low gravity (cheap: a few points)
  let dustT = 0;
  function wheel(E, w, pt, n, surf, slide, dir, speed) {
    if (!view?.kick && !view?.dust) return false;
    if (speed < 1.5 && slide < 0.3) return true;
    const k = Math.min(1, speed / 10 + slide);
    if (Math.random() > 0.18 + k * 0.4) return true;
    dustT++;
    const v = E.veh.rb.linvel();
    if (view.kick) view.kick(pt[0], pt[1], pt[2], -v.x * 0.35, 1.2 + speed * 0.28, -v.z * 0.35, surf?.id ?? 0, 0.6 + k, world.gravity || 1.62);
    else view.dust(pt[0], pt[1], pt[2], surf?.id ?? 0, k);
    return true;
  }

  // ---- on foot: E beside a glowing sample
  function nearSpot(feet) {
    if (!revealed()) return null;
    const nr = nearestRock(feet, FOOT_REACH);
    if (!nr) return null;
    if (footLoad) return { hint: `Picking up the sample… ${Math.round(footLoad.t / LOAD_HOLD * 100)}%`, use: () => {} };
    const rv = [...S.ents.values()].filter(isRover).map(X => ({ X, d: flat(nr.rock, [pos(X).x, 0, pos(X).z]) })).sort((a, b) => a.d - b.d)[0];
    if (!rv || rv.d > FOOT_ROVER - 1) return { hint: 'Bring a Crater Crawler close — the sample rides in its bin', use: () => toast('Park a Crater Crawler beside the sample first.') };
    return { hint: 'Pick up the sample (stay beside it)', use: () => { footLoad = { rock: nr.rock.id, veh: rv.X.id, t: 0 }; } };
  }

  // ---------------------------------------------------------------------------------------------- what the HUD says
  function hud({ E = null, seat = null, feet = null } = {}) {
    if (!revealed()) return null;
    const at = E ? pos(E) : feet ? { x: feet[0], z: feet[2] } : null;
    if (!at) return null;
    const here = [at.x, 0, at.z], bits = []; let hint = null, hitch = false;
    const b = isRover(E) ? binOf(E.id) : null, R = moonRules(ups());
    if (b?.samples?.length) bits.push(`Samples ${b.samples.length}/${R.bin} · Sample Drop ${kmText(flat(M.drop, here))}`);
    if (b?.crates) bits.push(`${b.crates} crate${b.crates === 1 ? '' : 's'} of ${b.cargo} · ${yard(b.to).name} ${kmText(flat(yard(b.to), here))}`);
    if (st.loose.length && isRover(E)) { const c = st.loose.slice().sort((p, q) => flat(p, here) - flat(q, here))[0]; if (flat(c, here) < 400) bits.push(`Loose crate ${kmText(flat(c, here))}`); }
    if (isRover(E) && seat === 0 && jump.state === 'air') bits.unshift(`Air ${jump.airT.toFixed(1)} s · ${Math.round(flat(M.ramps[jump.ramp].lip, here))} m${R.booster && !jump.boosted ? ' · booster ready' : ''}`);
    else if (st.lastJump && now() - st.lastJump.at < 6000) bits.unshift(`Jump: ${st.lastJump.dist} m · ${st.lastJump.air} s${st.lastJump.ring ? ' · in the ring!' : ''}`);
    if (isRover(E)) {
      const nr = nearestRock(here, R.reach);
      if (nr) { hint = Math.abs(E.veh.forwardSpeed()) < 2.5 ? 'T — grab the sample with the arm' : 'Slow down to grab the sample'; hitch = true; }
      else if (seat === 0) {
        const sp = Math.abs(E.veh.forwardSpeed());
        if (b?.samples?.length && flat(M.drop, here) < 40) hint = sp < 1.5 ? 'Handing in the samples…' : 'Stop at the Sample Drop';
        else if (b?.crates && flat(yard(b.to), here) < 60) hint = sp < 1.5 ? 'Unloading…' : `Stop in ${yard(b.to).name}`;
        else if (!b?.crates && M.yards.some(y => flat(y, here) < y.r)) hint = sp < 1.5 ? 'Loading supply crates…' : 'Stop here to load supply crates';
        else if (jump.state === 'air' && R.booster && !jump.boosted) hint = 'Space — one push from the booster';
        else { const r = M.ramps.find(q => flat(q.lip, here) < 45 && flat(q, here) > flat(q.lip, here)); if (r && sp < 6) hint = `Stop — take a run at ${r.name} (faster = further)`; }
      }
    } else if (feet && nearestRock(here, 12) && !nearestRock(here, FOOT_REACH)) hint = 'Walk up to the glowing sample';
    if (!bits.length && !hint) return null;
    return { line: bits.slice(0, 2).join(' · '), hint, hitch };
  }
  function spots() {
    if (!revealed()) return [];
    const out = [];
    M.samples.forEach((s, i) => { if (rockList.some(r => r.site === i && r.ready)) out.push({ kind: s.rarity === 'rare' ? 'mrare' : 'msample', x: s.x, z: s.z, label: s.name }); });
    out.push({ kind: 'mdrop', x: M.drop.x, z: M.drop.z, label: 'Sample Drop' });
    for (const y of M.yards) out.push({ kind: 'myard', x: y.x, z: y.z, label: y.name });
    for (const r of M.ramps) out.push({ kind: 'mramp', x: r.lip.x, z: r.lip.z, label: r.name });
    for (const c of st.loose) out.push({ kind: 'mcrate', x: c.x, z: c.z, label: 'Loose crate' });
    return out;
  }
  function update(camera, dt) {
    for (const X of S.ents.values()) if (isRover(X)) { const b = binOf(X.id); fx.cargo(X, { samples: b?.samples?.map(q => q[1]) || [], crates: b?.crates || 0, cargo: b?.cargo }); }
    // beacons: where my load goes, else the sample sites (rare ones gold)
    const E = myE(), b = isRover(E) ? binOf(E.id) : null, list = [];
    if (revealed()) {
      if (b?.samples?.length) list.push({ x: M.drop.x, z: M.drop.z, color: '#ffb347' });
      if (b?.crates) { const y = yard(b.to); list.push({ x: y.x, z: y.z, color: '#ff9a2e' }); }
      for (const c of st.loose) list.push({ x: c.x, z: c.z, color: '#ff9a2e' });
      if (!b?.crates && !(b?.samples?.length >= moonRules(ups()).bin)) M.samples.forEach((s, i) => { if (rockList.some(r => r.site === i && r.ready)) list.push({ x: s.x, z: s.z, color: RARITY_COLOR[s.rarity] }); });
    }
    fx.beacons(list.slice(0, 10));
    fx.lamp(isRover(E) ? E : null, isRover(E) && moonRules(ups()).lamp);
    fx.update(camera, dt);
  }
  function debug() {
    return { bins: st.bins, loose: st.loose, prog: st.prog, order: st.order?.text || null, lastJump: st.lastJump, jump: { state: jump.state, ramp: jump.ramp, air: jump.airT, boosted: jump.boosted, maxAir: jump.maxAir },
      ready: rockList.filter(r => r.ready).length, rocks: rockList.length, stats: { ...stats }, dust: dustT, footLoad: footLoad && { ...footLoad }, draws: fx.draws(), lamp: !!fx.spot };
  }
  function dispose() { fx.dispose(); }
  const test = {
    sites: M, rocks: () => rockList.map(r => ({ ...r })),
    /** Playwright: the room's own steps, as the page sends them */
    send: (step, extra) => send(step, extra),
  };
  return { onMsg, defFor, control, frame, wheel, nearSpot, hud, spots, update, debug, dispose, test, sites: M };
}
