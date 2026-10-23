// KRAKEN COVE, as drawn: a round plank dock on a blue cove, mooring posts round its rim, and behind it a big round
// purple kraken with googly eyes and a little sailor's hat, bobbing in the water. Every tentacle is a chain of
// purple balls (ONE instanced mesh for all of them, tapering to the tip) that rises at the edge, rears up during the
// wind-up and flops onto the dock; while it rests its tip glows gold (a second instanced mesh). Red zones on the dock:
// a SLAM is a strip that fills from the edge inward; a SWEEP is a curved band along the edge with a white arrow showing
// which way it will go. Splashes on a slam, a little "OUCH" when a tentacle is sent off.
import { RULES, strip } from './sim.js';
import { bossKit } from '../boss-kit-view.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const SEGS = 11, MAXT = 6;

export function createView(ctx) {
  const { THREE, group, stage, meta, me, init } = ctx;
  const R = meta.arena.r;
  const K = bossKit(ctx, { name: 'Kraken courage', color: 'linear-gradient(#c58cff, #8a4fd6)' });
  const { std, basic, mesh, keep } = K;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();

  // ---- water, dock, posts
  const water = mesh(keep(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2)), std('#2f8fc8', { roughness: 0.25, metalness: 0.1 }), 0, -0.45, 0);
  water.receiveShadow = true;
  const dock = mesh(keep(new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.5, 48)), std('#c8925a', { roughness: 0.9 }), 0, -0.25, 0); dock.receiveShadow = true;
  const plankN = 14, planks = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.06, 0.02, 1)), std('#8a5a32'), plankN);
  for (let i = 0; i < plankN; i++) { const x = -R + (i + 0.5) * (2 * R / plankN), L = 2 * Math.sqrt(Math.max(0, (R + 0.25) ** 2 - x * x)); m4.compose(v.set(x, 0.01, 0), q.identity(), sc.set(1, 1, L)); planks.setMatrixAt(i, m4); }
  planks.receiveShadow = true; group.add(planks);
  const postN = 16, posts = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.2, 0.24, 1.3, 10)), std('#7a4a26'), postN);
  for (let i = 0; i < postN; i++) { const a = (i + 0.5) * Math.PI * 2 / postN; m4.compose(v.set(Math.sin(a) * (R + 0.45), 0.05, Math.cos(a) * (R + 0.45)), q.identity(), sc.set(1, 1, 1)); posts.setMatrixAt(i, m4); }
  posts.castShadow = true; group.add(posts);
  const rope = mesh(keep(new THREE.TorusGeometry(R + 0.45, 0.05, 6, 64).rotateX(Math.PI / 2)), std('#f1e2b8'), 0, 0.45, 0);

  // ---- the kraken's head behind the dock
  const head = new THREE.Group(); head.position.set(0, -0.9, -R - 3.4); head.scale.setScalar(0.85); group.add(head);
  const purple = std('#9a5ae0', { roughness: 0.55 }), white = std('#ffffff', { roughness: 0.3 }), ink = std('#1d2228');
  mesh(keep(new THREE.SphereGeometry(3, 28, 20)), purple, 0, 1.6, 0, head).scale.set(1, 1.15, 0.9);
  const eyes = [-1, 1].map(sx => { const e = mesh(keep(new THREE.SphereGeometry(0.75, 18, 12)), white, sx * 1.05, 2.5, 2.25, head); const p = mesh(keep(new THREE.SphereGeometry(0.34, 12, 8)), ink, 0, 0, 0.55, e); return { e, p }; });
  const lids = [-1, 1].map(sx => { const l = mesh(keep(new THREE.SphereGeometry(0.8, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2)), purple, sx * 1.05, 2.5, 2.25, head); l.rotation.x = -0.3; l.scale.y = 0.2; return l; });
  const hat = new THREE.Group(); hat.position.set(0.5, 4.75, 0); hat.rotation.z = -0.2; head.add(hat);
  mesh(keep(new THREE.CylinderGeometry(1.3, 1.45, 0.75, 20)), white, 0, 0, 0, hat);
  mesh(keep(new THREE.CylinderGeometry(1.5, 1.5, 0.16, 20)), std('#2e5fb8'), 0, -0.35, 0, hat);
  head.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // ---- tentacles: one instanced mesh of balls for all of them, tips separately
  const segN = SEGS * MAXT, tentM = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1, 12, 9)), std('#9a5ae0', { roughness: 0.5 }), segN);
  const tipM = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1, 12, 9)), std('#ffffff', { roughness: 0.4 }), MAXT);
  for (let i = 0; i < MAXT; i++) tipM.setColorAt(i, col.set('#c58cff'));
  tentM.castShadow = true; tipM.castShadow = true; tentM.count = 0; tipM.count = 0; group.add(tentM, tipM);
  tentM.frustumCulled = false; tipM.frustumCulled = false;

  // ---- red zones
  const stripGeo = keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5));
  const arrowGeo = keep(new THREE.ConeGeometry(0.45, 1.1, 3).rotateX(Math.PI / 2));
  const T = new Map();               // id -> view state
  function zoneFor(t, row) {
    const [, a, sweep, , , , , , dir, a0, a1] = row;
    if (!sweep) {
      t.zone = new THREE.Group(); group.add(t.zone);
      const s = strip(a); t.zone.position.set(s.ax, 0.05, s.az); t.zone.rotation.y = Math.atan2(s.bx - s.ax, s.bz - s.az);
      t.zoneOut = mesh(stripGeo, basic('#ff3b3b', { opacity: 0.3 }), 0, 0, 0, t.zone); t.zoneOut.scale.set(RULES.halfW * 2, 1, RULES.len);
      t.zoneIn = mesh(stripGeo, basic('#ff6a3a', { opacity: 0.55 }), 0, 0.01, 0, t.zone); t.zoneIn.scale.set(RULES.halfW * 2, 1, 0.01);
    } else {
      const lo = Math.min(a0, a1), len = Math.abs(a1 - a0);
      t.zone = new THREE.Group(); group.add(t.zone); t.zone.position.y = 0.05;
      t.zoneOut = mesh(new THREE.RingGeometry(R - RULES.bandIn, R, 32, 1, lo - Math.PI / 2, len).rotateX(-Math.PI / 2), basic('#ff3b3b', { opacity: 0.32 }), 0, 0, 0, t.zone);
      t.zoneIn = null; t.ownGeo = t.zoneOut.geometry;
      t.arrows = [0.3, 0.55, 0.8].map(k => { const ang = a0 + (a1 - a0) * k, rr = R - RULES.bandIn / 2; const m = mesh(arrowGeo, basic('#ffffff', { opacity: 0.85 }), Math.sin(ang) * rr, 0.02, Math.cos(ang) * rr, t.zone); m.rotation.y = ang + dir * Math.PI / 2; return m; });
    }
  }
  function dropGold(t) { if (t.gold) { group.remove(t.gold); t.gold.material.dispose(); t.gold = null; } }
  function dropZone(t) { if (!t.zone) return; t.zone.traverse(o => { if (o.isMesh) o.material.dispose(); }); t.ownGeo?.dispose(); group.remove(t.zone); t.zone = null; }

  const bar = scoreBar(ctx, { unit: 'whacks' });
  const tall = () => innerHeight > innerWidth * 1.15;
  const frameCam = () => ctx.camera({ cx: 0, cz: -1.4, hw: R + 0.9, hd: R + 2.2, tall: tall() ? 3.2 : 2.6 }, { instant: true });
  frameCam(); addEventListener('resize', frameCam);
  let G = null, ouch = 0, endK = 0;

  /** Points along a tentacle. f: 0 = standing up at the edge, 1 = flat along its strip; h: how far up/out (0..1). */
  function pose(t, row, now) {
    const [, a, sweep, ph, left, total, at] = row;
    const k = 1 - left / Math.max(0.01, total);
    let f = 0, h = 1, rear = 0, lift = 0.28, sink = 0, ang = a;
    if (ph === 'rise') { h = k; }
    else if (ph === 'wind') { rear = 0.4 + 0.6 * k; h = 1; if (sweep) { ang = row[9]; f = 0.15; } }
    else if (ph === 'strike') { f = sweep ? 1 : Math.min(1, k * 1.5 + 0.4); ang = sweep ? at : a; lift = sweep ? 0.65 : 0.28; }
    else if (ph === 'rest') { f = 1; ang = at; }
    else if (ph === 'sink') { f = 1; ang = at; sink = k; }
    t.ang += (ang - t.ang) * (ph === 'strike' ? 1 : 0.25);
    const ox = Math.sin(t.ang), oz = Math.cos(t.ang), bx = ox * (R + 0.5), bz = oz * (R + 0.5);
    const pts = [];
    for (let i = 0; i < SEGS; i++) {
      const s = i / (SEGS - 1);
      // standing: up out of the water, curling outward at the top when rearing back
      const ux = bx + ox * (rear * 1.6 * s * s) + ox * 0.3 * Math.sin(now * 3 + s * 4) * s, uy = -0.4 + 4.6 * s * h, uz = bz + oz * (rear * 1.6 * s * s);
      // flat: along the strip inward
      const fx = bx - ox * (RULES.len + 0.5) * s, fz = bz - oz * (RULES.len + 0.5) * s, fy = lift + 0.08 * Math.sin(now * 6 + s * 7) - sink * 1.2 - (1 - Math.min(1, s * 5)) * 0.5;
      pts.push([ux + (fx - ux) * f, uy + (fy - uy) * f, uz + (fz - uz) * f]);
    }
    return pts;
  }

  return {
    start() { frameCam(); K.banner('The kraken wakes!'); },
    state(g) {
      G = g;
      const seen = new Set();
      for (const row of g.tn) {
        const id = row[0]; seen.add(id); let t = T.get(id);
        if (!t) { t = { id, ang: row[1] }; T.set(id, t); }
        t.row = row;
        const wantZone = row[3] === 'wind' || (row[3] === 'strike' && row[2]);
        if (wantZone && !t.zone) zoneFor(t, row); else if (!wantZone && t.zone) dropZone(t);
        if (row[3] === 'rest' && !t.gold) {
          const s = strip(row[6]); t.gold = mesh(stripGeo, basic('#ffd23f', { opacity: 0.38 }), s.ax, 0.04, s.az); t.gold.rotation.y = Math.atan2(s.bx - s.ax, s.bz - s.az); t.gold.scale.set(RULES.reach * 2, 1, RULES.len + 0.6);
        } else if (row[3] !== 'rest' && t.gold) dropGold(t);
      }
      for (const [id, t] of T) if (!seen.has(id)) { dropZone(t); dropGold(t); T.delete(id); }
      K.hp(g.hp, init.hpMax);
      const resting = g.tn.filter(r => r[3] === 'rest').length;
      K.row(resting ? `<span class="bk-tag hot">${resting} resting — WHACK!</span>` : `<span class="bk-tag">Watch the red zones</span>`);
      bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'wind') ctx.sfx('trap');
      else if (ev.e === 'slam') { const t = T.get(ev.id); if (t) { const s = strip(t.row[1]); for (const k of [0.3, 0.6, 0.9]) K.puff(s.ax + (s.bx - s.ax) * k, 0.3, s.az + (s.bz - s.az) * k, '#e6f6ff', 1.2); } ctx.sfx('splat'); }
      else if (ev.e === 'sweep') ctx.sfx('throw');
      else if (ev.e === 'whack') { const t = T.get(ev.id); if (t) { const s = strip(t.row[6]); floatText(stage, (s.ax + s.bx) / 2, 1.6, (s.az + s.bz) / 2, ev.dmg > 1 ? 'OUCH! +2' : '+1', 'good'); } ctx.sfx(ev.pid === me ? 'coins' : 'hit'); ouch = 0.5; }
      else if (ev.e === 'sink' && ev.beaten) { K.banner('Sent packing!', 'good', 800); ctx.sfx('good'); }
      else if (ev.e === 'hurt') { ctx.sfx(ev.pid === me ? 'bad' : 'hit'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, 'SPLAT!', 'bad'); }
      else if (ev.e === 'swing') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'end') { K.banner(ev.ok ? 'The kraken swims off!' : 'The kraken keeps the cove!', ev.ok ? 'good' : 'bad', 4000); ctx.sfx(ev.ok ? 'win' : 'bad'); }
    },
    input(inp) { if (inp.b & IN.A) ctx.actor(me)?.play('punch', 380); },
    pose(pid, flags) { if (flags & F.STUN) return 'hit'; if (G?.end) return G.end === 1 ? 'cheer' : 'sitGround'; return undefined; },
    frame(dt, t) {
      K.frame(dt, t);
      // tentacles
      let si = 0, ti = 0;
      for (const tv of T.values()) {
        if (ti >= MAXT) break;
        const row = tv.row, ph = row[3];
        row[4] = Math.max(0, row[4] - dt);                 // count down between updates
        const pts = pose(tv, row, t);
        pts.forEach(([x, y, z], i) => { const r = 0.55 - 0.36 * (i / (SEGS - 1)); m4.compose(v.set(x, y, z), q.identity(), sc.set(r, r, r)); tentM.setMatrixAt(si++, m4); });
        const [x, y, z] = pts[SEGS - 1], glow = ph === 'rest';
        m4.compose(v.set(x, y + 0.05, z), q.identity(), sc.setScalar(glow ? 0.34 + 0.05 * Math.sin(t * 8) : 0.2)); tipM.setMatrixAt(ti, m4);
        tipM.setColorAt(ti, col.set(glow ? '#ffd23f' : '#c58cff')); ti++;
        // zone fill
        if (tv.zone && tv.zoneIn) { const k = 1 - row[4] / Math.max(0.01, row[5]); tv.zoneIn.scale.z = Math.max(0.01, RULES.len * (ph === 'wind' ? k : 1)); tv.zoneOut.material.opacity = k > 0.7 ? 0.3 + 0.25 * Math.abs(Math.sin(t * 16)) : 0.3; }
        if (tv.gold) tv.gold.material.opacity = 0.25 + 0.2 * Math.abs(Math.sin(t * 5));
        if (tv.zone && !tv.zoneIn) tv.zoneOut.material.opacity = 0.25 + 0.2 * Math.abs(Math.sin(t * (ph === 'strike' ? 20 : 8)));
      }
      tentM.count = si; tipM.count = ti; tentM.instanceMatrix.needsUpdate = true; tipM.instanceMatrix.needsUpdate = true; if (tipM.instanceColor) tipM.instanceColor.needsUpdate = true;
      // the head bobs; blinks when whacked; sinks when beaten
      ouch = Math.max(0, ouch - dt); if (G?.end === 1) endK = Math.min(1, endK + dt * 0.5);
      head.position.y = -0.9 + Math.sin(t * 1.4) * 0.15 - endK * 5;
      head.rotation.z = Math.sin(t * 0.9) * 0.05;
      for (const l of lids) l.scale.y = ouch > 0 ? 1 : 0.2;
      const look = [...T.values()][0]; for (const { p } of eyes) { p.position.x = look ? Math.sin(look.ang) * 0.2 : Math.sin(t) * 0.15; }
      water.position.y = -0.45 + Math.sin(t * 1.1) * 0.03;
    },
    dispose() { removeEventListener('resize', frameCam); bar.el.remove(); for (const t of T.values()) { dropZone(t); dropGold(t); } K.dispose(); },
  };
}
