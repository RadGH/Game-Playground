// HIDE & PEEK, as drawn: the fairground after dark — dark grass, a sandy path, strings of warm bulbs round the edge,
// striped tents beyond the fence. Hiding places: wooden barrels with iron hoops, slatted crates, little stalls with a
// striped awning and a curtain, and hay stacks. A hider in a spot is not drawn at all (on every screen, yours too —
// your spot wears a "🙈 You" tag instead); a hider PEEKING is drawn standing in it, so their head pops out over the
// top, with a "!" over it. The seeker carries a lantern and a soft yellow fan of light on the ground shows the beam.
// While the seeker counts, their own screen goes dark ("Eyes shut!"). Halloween: pumpkin barrels, purple stalls,
// a green lantern glow (the arena dressing adds the bats and ghosts).
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { createJuice } from '../../client/juice.js';
import { pumpkinGeo } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { SPOT_KINDS } from './sim.js';

export function createView(ctx) {
  const { THREE, group, stage, init, arena, me } = ctx, HW = ctx.season === 'halloween', W = arena.hw, D = arena.hd;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const nameOf = pid => (pid === me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  // ---- ground, path, fence of lights, tents outside
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 40, D * 2 + 40).rotateX(-Math.PI / 2), std(HW ? '#24304a' : '#2f5a3e')); grass.receiveShadow = true; group.add(grass);
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(-Math.PI / 2), std(HW ? '#2e3a58' : '#3d6e4a')); yard.position.y = 0.005; yard.receiveShadow = true; group.add(yard);
  const path = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.2, 40).rotateX(-Math.PI / 2), std(HW ? '#4a3f5a' : '#b89a6a')); path.position.y = 0.012; group.add(path);
  const posts = [], bulbs = [];
  for (let x = -W; x <= W + 0.01; x += 2.25) posts.push([x, -D - 0.3], [x, D + 0.3]);
  for (let z = -D + 2.33; z < D - 0.1; z += 2.33) posts.push([-W - 0.3, z], [W + 0.3, z]);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
  const postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6), std('#5a4030'), posts.length);
  posts.forEach(([x, z], i) => postMesh.setMatrixAt(i, m4.makeTranslation(x, 0.9, z))); group.add(postMesh);
  for (let i = 0; i < posts.length; i++) { const [x, z] = posts[i]; for (let k = 1; k < 4; k++) { const nx = Math.abs(z) > D ? x + k * 0.56 : x, nz = Math.abs(z) > D ? z : z + k * 0.58; if (Math.abs(nx) <= W + 0.35 && Math.abs(nz) <= D + 0.35) bulbs.push([nx, 1.7 - Math.sin(k / 4 * Math.PI) * 0.18, nz]); } bulbs.push([x, 1.8, z]); }
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), bulbs.length);
  const BC = HW ? ['#ff8a1a', '#b57bff', '#7dff5a'] : ['#ffd36b', '#ff7aa8', '#7ad7ff', '#ffe9a8'], col = new THREE.Color();
  bulbs.forEach(([x, y, z], i) => { bulbMesh.setMatrixAt(i, m4.makeTranslation(x, y, z)); bulbMesh.setColorAt(i, col.set(BC[i % BC.length])); }); group.add(bulbMesh);
  for (const [x, z, c] of [[-W - 4, -D - 3, '#e8394a'], [W + 4, -D - 3, '#3d8bff'], [0, -D - 5, '#ffd23f'], [-W - 4, D + 1, '#9a7aff'], [W + 4, D + 1, '#3ecf6a']]) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.2, 10), std(HW ? '#5a2a7a' : c)); tent.position.set(x, 1.6, z); group.add(tent);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.4, 10), std(HW ? '#2a1d4a' : '#fff6e0')); base.position.set(x, 0.7, z); group.add(base);
  }
  // ---- hiding places
  const wood = std(HW ? '#5a3a2a' : '#9a6a3a'), iron = std('#3a3a44', { metalness: 0.4, roughness: 0.5 }), hay = std(HW ? '#b8902a' : '#e8c25a');
  const spotMeshes = init.spots.map(sp => {
    const K = SPOT_KINDS[sp.k], g = new THREE.Group(); g.position.set(sp.x, 0, sp.z); group.add(g);
    if (K.id === 'barrel') {
      if (HW) { const p = new THREE.Mesh(pumpkinGeo(THREE, K.r), std('#ff7a14')); p.scale.y = 1.7; p.position.y = 0.55; g.add(p); }
      else { const b = new THREE.Mesh(new THREE.CylinderGeometry(K.r * 0.92, K.r * 0.92, 1.05, 16), wood); b.position.y = 0.525; g.add(b); for (const y of [0.18, 0.87]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(K.r * 0.95, 0.04, 6, 18).rotateX(Math.PI / 2), iron); ring.position.y = y; g.add(ring); } }
    } else if (K.id === 'crate') {
      const c = new THREE.Mesh(new THREE.BoxGeometry(K.hw * 2, 1.0, K.hd * 2), std(HW ? '#6a4a3a' : '#c9925a')); c.position.y = 0.5; g.add(c);
      for (const y of [0.2, 0.8]) { const s = new THREE.Mesh(new THREE.BoxGeometry(K.hw * 2 + 0.02, 0.09, K.hd * 2 + 0.02), wood); s.position.y = y; g.add(s); }
    } else if (K.id === 'stall') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(K.hw * 2, 1.1, K.hd * 2), std(HW ? '#3a2a5a' : '#f4ecd8')); base.position.y = 0.55; g.add(base);
      const cur = new THREE.Mesh(new THREE.BoxGeometry(K.hw * 2 - 0.2, 0.9, 0.04), std(HW ? '#7a3cc8' : '#e8394a')); cur.position.set(0, 0.5, K.hd + 0.03); g.add(cur);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(K.hw * 2 + 0.3, 0.12, K.hd * 2 + 0.5), std(HW ? '#ff8a1a' : '#3d8bff')); awn.position.y = 2.0; g.add(awn);
      for (const sx of [-1, 1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), wood); pole.position.set(sx * (K.hw - 0.08), 1.5, K.hd - 0.05); g.add(pole); }
    } else {
      const b = new THREE.Mesh(new THREE.BoxGeometry(K.hw * 2, 0.95, K.hd * 2), hay); b.position.y = 0.475; g.add(b);
      const top = new THREE.Mesh(new THREE.BoxGeometry(K.hw * 1.4, 0.4, K.hd * 1.5), hay); top.position.y = 1.1; g.add(top);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  });
  // ---- the lantern beam (a fan on the ground) and the lantern itself
  const [BEAM, HALF] = init.beam;
  const beamMat = new THREE.MeshBasicMaterial({ color: HW ? '#a8ff7a' : '#ffe08a', transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CircleGeometry(BEAM, 24, Math.PI / 2 - HALF, HALF * 2).rotateX(-Math.PI / 2), beamMat);
  const beamHold = new THREE.Group(); beamHold.add(beam); beam.position.y = 0.03; beam.renderOrder = 2; beamHold.visible = false; group.add(beamHold);
  // CircleGeometry's fan points along +x before the turn; turn it so it points along the holder's +z
  beam.rotation.y = -Math.PI / 2;
  const lantern = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), new THREE.MeshBasicMaterial({ color: HW ? '#a8ff7a' : '#ffd36b', toneMapped: false })); lantern.add(glass);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 4), iron); cap.position.y = 0.19; cap.rotation.y = Math.PI / 4; lantern.add(cap);
  // ---- stand-ins (solo): Lamplighter Lou and the three Peekers
  const npcs = new Map();
  function npc(id, role) {
    const N = { a: null, role, x: 0, z: 0, yaw: 0, tx: 0, tz: 0, vis: true, tag: null };
    ctx.createActor({ look: { race: role === 0 ? 'dwarf' : 'halfling', seed: 5100 + id * 31 } }, { scale: 1 }).then(a => { if (!a) return; N.a = a; a.place(N.x, 0, N.z, N.yaw); if (role === 0) N.tag = stage.tag(a.group, { text: 'Lamplighter Lou', height: 2.1, cls: 'hs-tag' }); });
    npcs.set(id, N); return N;
  }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'points' });
  const pill = h('div', 'hs-pill'); ctx.ui.append(pill);
  const shut = h('div', 'hs-shut'); shut.innerHTML = '<b>Eyes shut!</b><span>Counting…</span><em></em>'; ctx.ui.append(shut);
  const juice = createJuice(ctx);
  const myTag = stage.tag(spotMeshes[0] || group, { text: '🙈 You', height: 1.6, cls: 'hs-me', declutter: false }); myTag.el.style.visibility = 'hidden';
  const peekTags = new Map();
  let G = null, lastSeeker = undefined;
  function say(text, cls = '', ms = 1500) { juice.say(text, ms, cls); }
  function myLine(g) {
    if (me == null) return g.ph === 'hide' ? 'The hiders are hiding…' : g.ph === 'seek' ? (g.sk != null ? `${nameOf(g.sk)} is seeking!` : 'Lamplighter Lou is seeking!') : 'Round over';
    const seeking = g.sk === me;
    if (g.ph === 'reveal') return 'Round over!';
    if (seeking) return g.ph === 'hide' ? 'You are the SEEKER — eyes shut…' : '🏮 SEEK! Lantern finds anyone in the open · A = look inside';
    if (g.fd.includes(me)) return 'Found! Watch the others…';
    if (g.hd[me] != null) return g.pk.includes(me) ? '👀 Peeking… duck back down!' : g.ph === 'hide' ? 'Hidden! Stay still…' : 'Hidden · B = peek for +1';
    return g.ph === 'hide' ? `HIDE! Run to a barrel or crate · A = climb in (${g.left})` : 'You are in the open! Hide (A at a spot)';
  }
  return {
    halloween: { y: 0, mist: true, spots: [[-W - 1.6, 0, -D + 1.2], [W + 1.6, 0, -D + 1.2], [-W - 1.6, 0, D - 1.2], [W + 1.6, 0, D - 1.2]] },
    state(g) {
      G = g; bar.set(g.sc, g.ph === 'hide' ? null : g.left);
      const line = myLine(g); if (pill.textContent !== line) pill.textContent = line;
      pill.className = 'hs-pill ' + (g.sk === me ? 'seek' : g.hd[me] != null ? 'hid' : g.fd.includes(me) ? 'found' : 'open');
      shut.classList.toggle('on', g.ph === 'hide' && g.sk === me && me != null);
      shut.querySelector('em').textContent = g.ph === 'hide' ? g.left : '';
      if (g.sk !== lastSeeker) {
        lastSeeker = g.sk; lantern.removeFromParent();
        const a = g.sk != null ? ctx.actor(g.sk) : null;
        if (a) { a.body.group.add(lantern); lantern.position.set(0.32, 0.75, 0.25); }
      }
      if (g.np) {
        const seen = new Set();
        for (const [id, x, z, yaw, role, spot, peek, found] of g.np) {
          seen.add(id); const N = npcs.get(id) || npc(id, role);
          N.tx = x; N.tz = z; N.yaw = yaw; N.spot = spot; N.peek = peek; N.found = found;
          if (role === 0 && N.a && lantern.parent !== N.a.body.group) { N.a.body.group.add(lantern); lantern.position.set(0.32, 0.75, 0.25); }
        }
        for (const [id, N] of npcs) if (!seen.has(id)) { N.tag?.remove(); N.a?.dispose(); npcs.delete(id); }
      } else if (npcs.size) { for (const N of npcs.values()) { N.tag?.remove(); N.a?.dispose(); } npcs.clear(); }
    },
    event(ev) {
      if (ev.e === 'round') { say(ev.npc ? `Round ${ev.r}: hide from Lamplighter Lou!` : ev.seeker === me ? `Round ${ev.r}: YOU seek!` : `Round ${ev.r}: ${nameOf(ev.seeker)} seeks — HIDE!`, ev.seeker === me ? 'good' : '', 2000); ctx.sfx('pick'); }
      else if (ev.e === 'seek') { say(ev.seeker === me ? 'Ready or not… GO!' : 'Here they come!', '', 1300); ctx.sfx('trap'); }
      else if (ev.e === 'in') { if (ev.pid === me) ctx.sfx('pick'); }
      else if (ev.e === 'nospot') { if (ev.pid === me) { ctx.sfx('bad'); say('Get right next to a spot', 'bad', 1000); } }
      else if (ev.e === 'peek') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'peeked') { if (ev.pid === me) { ctx.sfx('coins'); const p = ctx.pos(me); if (p) floatText(stage, p.x, 2.2, p.z, 'Sneaky! +1', 'good'); } }
      else if (ev.e === 'look') { if (ev.empty) { const sp = init.spots[ev.i]; if (sp) floatText(stage, sp.x, 1.6, sp.z, 'Nobody here!', ''); if (ev.by === me) ctx.sfx('bad'); } }
      else if (ev.e === 'found') {
        const who = ev.npc ? 'a Peeker' : nameOf(ev.pid), how = ev.how === 'peek' ? 'caught peeking!' : ev.how === 'look' ? 'found!' : 'spotted!';
        floatText(stage, ev.x, 2.2, ev.z, ev.pid === me ? `You were ${how}` : `${who} ${how}`, ev.pid === me ? 'bad' : ev.by === me ? 'good' : '');
        ctx.sfx(ev.by === me ? 'good' : 'hit');
        if (ev.by === me) juice.flash('#ffd23f', 220); if (ev.pid === me) juice.flash('#ff5f5f', 260);
      } else if (ev.e === 'reveal') {
        const safe = ev.safe.filter(x => x > 0);
        say(ev.all ? 'Everyone found!' : safe.includes(me) ? 'You stayed hidden! +3' : safe.length ? `${safe.map(nameOf).join(' & ')} stayed hidden! +3` : 'The Peekers stayed hidden!', safe.includes(me) ? 'good' : '', 2200);
        ctx.sfx(safe.includes(me) ? 'win' : 'good');
      }
    },
    pose(pid, flags, b) {
      if (!G) return undefined;
      if (G.fd.includes(pid)) return 'sitGround';
      if (G.sk === pid && G.ph === 'hide') return 'pray';
      if (G.ph === 'reveal') return 'cheer';
      if (flags & F.STUN) return 'lookAround';
      return undefined;
    },
    frame(dt, t) {
      if (!G) { juice.frame(dt, t); return; }
      // hidden hiders are not drawn (a peeker is: their head pokes out of the spot)
      let mine = -1;
      for (const p of ctx.players) {
        const a = ctx.actor(p.pid); if (!a) continue;
        const spot = G.hd[p.pid], peeking = G.pk.includes(p.pid);
        if (spot != null && !peeking) a.group.visible = false;
        if (spot != null && p.pid === me) mine = spot;
        let tg = peekTags.get(p.pid);
        if (peeking && !tg) { tg = stage.tag(a.group, { text: '!', height: 2.15, cls: 'hs-peek' }); peekTags.set(p.pid, tg); }
        if (!peeking && tg) { tg.remove(); peekTags.delete(p.pid); }
      }
      if (mine >= 0) { myTag.obj = spotMeshes[mine]; myTag.el.style.visibility = ''; } else myTag.el.style.visibility = 'hidden';
      // the stand-ins walk to where the server says, and hide the same way
      for (const N of npcs.values()) {
        if (!N.a) continue;
        const dx = N.tx - N.x, dz = N.tz - N.z, d = Math.hypot(dx, dz);
        if (d > 3) { N.x = N.tx; N.z = N.tz; } else { const k = Math.min(1, dt * 10); N.x += dx * k; N.z += dz * k; }
        N.a.place(N.x, 0, N.z, N.yaw); N.a.setSpeed(d > 0.05 ? 4 : 0);
        N.a.group.visible = !(N.spot >= 0 && !N.peek);
        N.a.setPose(N.found ? 'sitGround' : N.role === 0 && G.ph === 'hide' ? 'pray' : 'idle');
        N.a.update(dt);
      }
      // the beam follows the seeker (a player, or Lou)
      let sp = null;
      if (G.sk != null) { const p = ctx.pos(G.sk); if (p) sp = { x: p.x, z: p.z, yaw: p.yaw }; }
      else { const lou = [...npcs.values()].find(N => N.role === 0 && N.a); if (lou) sp = { x: lou.x, z: lou.z, yaw: lou.yaw }; }
      beamHold.visible = !!sp && G.ph === 'seek';
      if (sp) { beamHold.position.set(sp.x, 0, sp.z); beamHold.rotation.y = sp.yaw; beamMat.opacity = 0.26 + Math.sin(t * 6) * 0.04; }
      juice.frame(dt, t);
    },
    dispose() { bar.el.remove(); pill.remove(); shut.remove(); myTag.remove(); for (const tg of peekTags.values()) tg.remove(); juice.dispose(); for (const N of npcs.values()) { N.tag?.remove(); } lantern.removeFromParent(); },
  };
}
