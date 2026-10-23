// HILLTOP HOLD, as drawn: a round sunny meadow inside a low wooden fence, six soft green hills (the same bumps the
// sim walks on), flowers and pebbles, round trees outside. The ZONE is a glowing disc hugging the top of its hill with
// a tall see-through column of light: warm gold while it is free, the holder's seat colour while one player holds it
// (with their name on a tag), red and flickering with "SHARED!" when two or more stand in it. The next hill shows a
// turning ring of dashes and a countdown before the hop. A shove throws a puff of grass. HUD: score bar, a pill that
// says who holds the zone, and (solo) the medal targets.
import { HILLS, HILL_R, groundAt } from './sim.js';
import { scoreBar, floatText, h, esc } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, init, meta } = ctx;
  const R = meta.arena.r, ZR = init.zoneR;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  // ---- ground: one displaced disc (the hills), a darker field outside, the fence
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), std('#4f9a45')); outside.position.y = -0.02; outside.receiveShadow = true; group.add(outside);
  const disc = new THREE.CircleGeometry(R + 0.4, 72, 0, Math.PI * 2);
  // CircleGeometry has only a centre fan; build rings instead so the hills have vertices to bend
  const ringsGeo = new THREE.RingGeometry(0.01, R + 0.4, 72, 30).rotateX(-Math.PI / 2); disc.dispose();
  const pos = ringsGeo.attributes.position, col = new Float32Array(pos.count * 3), cA = new THREE.Color('#5fb64a'), cB = new THREE.Color('#c8f07e'), cC = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = groundAt(x, z); pos.setY(i, y);
    cC.copy(cA).lerp(cB, Math.min(1, y / 0.8) * 0.95 + ((Math.sin(x * 3.1) * Math.cos(z * 2.7)) * 0.08)); col.set([cC.r, cC.g, cC.b], i * 3);
  }
  ringsGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); ringsGeo.computeVertexNormals();
  const meadow = new THREE.Mesh(ringsGeo, std('#ffffff', { vertexColors: true })); meadow.receiveShadow = true; group.add(meadow);
  const NP = 40, posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6), std('#8a5a34'), NP);
  for (let i = 0; i < NP; i++) { const a = i / NP * Math.PI * 2; m4.compose(v.set(Math.sin(a) * (R + 0.35), 0.4, Math.cos(a) * (R + 0.35)), q.identity(), sc.setScalar(1)); posts.setMatrixAt(i, m4); }
  posts.castShadow = true; group.add(posts);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(R + 0.35, 0.05, 4, 80).rotateX(Math.PI / 2), std('#a06c40')); rail.position.y = 0.62; group.add(rail);
  const rail2 = rail.clone(); rail2.position.y = 0.3; group.add(rail2);
  // flowers (tiny instanced cones in three colours) and round trees outside
  const FL = 70, flowers = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.22, 5), std('#ffffff', { roughness: 0.6 }), FL), fc = new THREE.Color();
  for (let i = 0; i < FL; i++) {
    const a = i * 2.39996, r = 0.8 + ((i * 37) % 71) / 71 * (R - 1.2), x = Math.sin(a) * r, z = Math.cos(a) * r;
    m4.compose(v.set(x, groundAt(x, z) + 0.1, z), q.setFromEuler(e3.set(Math.PI, 0, 0)), sc.setScalar(0.8 + (i % 3) * 0.2)); flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, fc.set(['#ffffff', '#ffd23f', '#ff8fb1', '#b28cff'][i % 4]));
  }
  group.add(flowers);
  const TR = 14, trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6), std('#7a5032'), TR), crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 1), std('#3f9c3d', { flatShading: true }), TR);
  for (let i = 0; i < TR; i++) {
    const a = i / TR * Math.PI * 2 + 0.2, r = R + 3 + (i % 3) * 1.6, x = Math.sin(a) * r, z = Math.cos(a) * r, s = 0.8 + (i % 4) * 0.18;
    m4.compose(v.set(x, 0.8 * s, z), q.identity(), sc.setScalar(s)); trunks.setMatrixAt(i, m4);
    m4.compose(v.set(x, 2.2 * s, z), q.setFromEuler(e3.set(0, i, 0)), sc.set(s, s * 1.1, s)); crowns.setMatrixAt(i, m4);
  }
  trunks.castShadow = crowns.castShadow = true; group.add(trunks, crowns);

  // ---- the zone: a disc that hugs its hill + a column of light. Built once per hill; only the live one is shown.
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 64; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const zoneMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', map: glowTex, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const hug = (geo, x0, z0, lift) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, groundAt(p.getX(i) + x0, p.getZ(i) + z0) + lift); geo.computeVertexNormals(); return geo; };
  const zones = HILLS.map(([x, z]) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.visible = false; group.add(g);
    g.add(new THREE.Mesh(hug(new THREE.CircleGeometry(ZR, 40).rotateX(-Math.PI / 2), x, z, 0.03), zoneMat));
    g.add(new THREE.Mesh(hug(new THREE.RingGeometry(ZR - 0.14, ZR, 48, 1).rotateX(-Math.PI / 2), x, z, 0.05), edgeMat));
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(ZR, ZR, 3.6, 32, 1, true), beamMat); beam.position.y = groundAt(x, z) + 1.8; beam.rotation.x = Math.PI; g.add(beam);
    return g;
  });
  // the "next hill" warning: a turning ring of dashes
  const DASH = 16, dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: '#ffffff' }), DASH);
  dashes.visible = false; group.add(dashes);
  let warnTag = null;
  // grass puffs (a shove)
  const puffGeo = new THREE.IcosahedronGeometry(0.35, 0), puffs = [];
  function puff(x, z) { for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? '#c9f59a' : '#ffffff', transparent: true, opacity: 0.9, depthWrite: false })); const a = i * 1.26; p.position.set(x, groundAt(x, z) + 0.7, z); p.userData.v = [Math.sin(a) * 2, 1.6, Math.cos(a) * 2]; group.add(p); puffs.push({ p, t: 0 }); } }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'hh-pill'); ctx.ui.append(pill);
  const medals = init.solo ? h('div', 'hh-medals', init.medals.map((m, i) => `<span data-i="${i}">${['🥉', '🥈', '🥇'][i]} ${m}</span>`).join('')) : null;
  if (medals) ctx.ui.append(medals);
  const banner = h('div', 'hh-banner'); ctx.ui.append(banner); let bannerT = 0;
  const show = (text, cls = '', s = 1.3) => { banner.textContent = text; banner.className = 'hh-banner show ' + cls; bannerT = s; };
  const player = pid => ctx.players.find(p => p.pid === pid);
  const nameOf = pid => (pid === ctx.me ? 'You' : player(pid)?.name || '?');
  let zone = -1, next = -1, owner = -1, lastPill = '', ownTag = null, ownTagPid = -9, prevB = 0, prevS = -9, myScore = 0;
  const OWN = new THREE.Color(), FREE = new THREE.Color('#ffd23f'), RED = new THREE.Color('#ff3b3b');
  function setPill() {
    let html, cls;
    if (zone < 0) { html = '⏳ The zone is coming…'; cls = ''; }
    else if (owner === -2) { html = '✖ SHARED — nobody scores!'; cls = 'red'; }
    else if (owner >= 0) { const p = player(owner); html = `<i class="dot" style="--c:${p?.color}" data-shape="${p?.shape}"></i>${owner === ctx.me ? 'You hold the hill! +2/s' : esc(nameOf(owner)) + ' holds the hill'}`; cls = owner === ctx.me ? 'me' : 'them'; }
    else { html = '★ Zone is free — get in!'; cls = 'free'; }
    const k = html + cls; if (k === lastPill) return; lastPill = k; pill.innerHTML = html; pill.className = 'hh-pill ' + cls;
  }
  setPill();
  return {
    state(g) {
      if (g.z !== zone) { zones.forEach((z, i) => { z.visible = i === g.z; }); zone = g.z; }
      next = g.nx; owner = g.o;
      dashes.visible = next >= 0;
      if (next >= 0) {
        const [x, z] = HILLS[next];
        if (!warnTag || warnTag.hill !== next) { warnTag?.remove?.(); const anchor = new THREE.Object3D(); anchor.position.set(x, groundAt(x, z), z); group.add(anchor); warnTag = stage.tag(anchor, { text: '', height: 1.2, cls: 'hh-next' }); warnTag.hill = next; warnTag.anchor = anchor; }
        warnTag.set(`Next hill in ${Math.ceil(g.w)}`);
      } else if (warnTag) { warnTag.remove?.(); warnTag.anchor?.removeFromParent(); warnTag = null; }
      // colour: free gold, holder's seat colour, shared red
      const c = owner === -2 ? RED : owner >= 0 ? OWN.set(player(owner)?.color || '#ffd23f') : FREE;
      zoneMat.color.copy(c); beamMat.color.copy(c);
      if (owner !== ownTagPid) {
        ownTag?.remove?.(); ownTag = null; ownTagPid = owner;
        if (zone >= 0 && owner !== -1) { const a = new THREE.Object3D(); const [x, z] = HILLS[zone]; a.position.set(x, groundAt(x, z), z); group.add(a); ownTag = stage.tag(a, owner === -2 ? { text: 'SHARED!', height: 3.9, cls: 'hh-shared' } : { text: '★ ' + nameOf(owner), seat: player(owner)?.seat, height: 3.9 }); ownTag.anchor = a; }
      }
      setPill();
      bar.set(g.sc, g.left);
      if (ctx.me != null && g.sc[ctx.me] != null) myScore = g.sc[ctx.me];
      if (medals) medals.querySelectorAll('span').forEach((s, i) => s.classList.toggle('won', (g.sc[ctx.players[0].pid] || 0) >= init.medals[i]));
    },
    input(inp) {
      const fresh = !(prevB & IN.A) || inp.s !== prevS + 1; prevB = inp.b; prevS = inp.s;
      if ((inp.b & IN.A) && fresh) ctx.actor(ctx.me)?.play('punch', 320);
    },
    event(ev) {
      if (ev.e === 'shove') { if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('punch', 320); puff(ev.x, ev.z); ctx.sfx('hit'); if (ev.to === ctx.me) show('Shoved!', 'bad', 0.8); }
      else if (ev.e === 'whiff') { if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('punch', 320); }
      else if (ev.e === 'hop') { ctx.sfx('pick'); show(ev.hill === 0 ? 'Zone: the middle hill!' : 'The zone hopped!', 'go', 1.1); }
      else if (ev.e === 'warn') ctx.sfx('tap');
      else if (ev.e === 'contest') ctx.sfx('bad');
      else if (ev.e === 'ten') { const [x, z] = HILLS[zone] || [0, 0]; floatText(stage, x, groundAt(x, z) + 2.4, z, `${ev.pid === ctx.me ? 'You' : nameOf(ev.pid)}: ${ev.pts}`, ev.pid === ctx.me ? 'good' : ''); if (ev.pid === ctx.me) ctx.sfx('coins'); }
    },
    pose(pid, flags) { if (flags & F.STUN) return 'hit'; if (flags & F.FROZEN) return pid === owner ? 'cheer' : 'idle'; return undefined; },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.className = 'hh-banner'; }
      if (zone >= 0) { const z = zones[zone]; const pulse = owner === -2 ? 0.35 + 0.25 * Math.abs(Math.sin(t * 12)) : 0.5 + 0.1 * Math.sin(t * 3); zoneMat.opacity = pulse; beamMat.opacity = owner === -2 ? 0.2 : 0.3 + 0.06 * Math.sin(t * 2); z.children[2].rotation.y = t * 0.4; }
      if (next >= 0) {
        const [x, z] = HILLS[next];
        for (let i = 0; i < DASH; i++) { const a = i / DASH * Math.PI * 2 + t * 0.9, px = x + Math.sin(a) * ZR, pz = z + Math.cos(a) * ZR; m4.compose(v.set(px, groundAt(px, pz) + 0.08, pz), q.setFromEuler(e3.set(0, a + Math.PI / 2, 0)), sc.setScalar(1)); dashes.setMatrixAt(i, m4); }
        dashes.instanceMatrix.needsUpdate = true;
        dashes.material.color.setHSL(0.14, 1, 0.6 + 0.3 * Math.sin(t * 8));
      }
      for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt * 2.5; const [vx, vy, vz] = p.p.userData.v; p.p.position.x += vx * dt; p.p.position.y += vy * dt; p.p.position.z += vz * dt; p.p.scale.setScalar(0.6 + p.t); p.p.material.opacity = Math.max(0, 0.9 - p.t); if (p.t >= 1) { p.p.removeFromParent(); p.p.material.dispose(); puffs.splice(i, 1); } }
    },
    dispose() { bar.el.remove(); warnTag?.remove?.(); ownTag?.remove?.(); glowTex.dispose(); void myScore; void HILL_R; },
  };
}
