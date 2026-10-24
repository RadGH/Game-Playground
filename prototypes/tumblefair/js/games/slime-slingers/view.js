// SLIME SLINGERS, as drawn (under the shared Halloween dusk dressing): a dark-soil pumpkin patch in furrowed rows inside
// a white picket fence, an old iron water pump with a wooden trough in the middle, and pumpkin piles (or a hay cart)
// as cover. Globs are glowing green blobs that wobble as they fly; a splat throws green droplets and a miss leaves a
// shiny green puddle on the soil that fades away. A slimed player wears the goo: a green blob on the head (bigger for
// two), and three globs encases them in a wobbling see-through green jelly until they pop free. Jelly ghosts (solo
// targets) are round friendly ghosts that turn greener the more slime they carry.
// HUD: score bar, my slime meter (three drops) and a big "do this now" line, 3-2-1-GO, call-outs.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { pumpkinGeo, stemGeo, faceTexture, ghostGeo } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { createJuice } from '../../client/juice.js';

export function createView(ctx) {
  const { THREE, group, stage, arena: A, init } = ctx;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const tunes = createTunes({ volume: 0.22 }), juice = createJuice(ctx);
  // ---- soil with furrows, fence
  const soil = tex(canvasTexture(256, 256, (c, w) => { c.fillStyle = '#5a3d2a'; c.fillRect(0, 0, w, w); for (let y = 0; y < w; y += 32) { c.fillStyle = '#6b4a33'; c.fillRect(0, y, w, 14); c.fillStyle = '#4a3122'; c.fillRect(0, y + 14, w, 4); } c.fillStyle = '#4f7d3a'; for (let i = 0; i < 60; i++) c.fillRect((i * 53) % w, (i * 97) % w, 4, 3); }));
  soil.wrapS = soil.wrapT = THREE.RepeatWrapping; soil.repeat.set(3, 3);
  const ground = new THREE.Mesh(geo(new THREE.PlaneGeometry(A.hw * 2, A.hd * 2).rotateX(-Math.PI / 2)), std('#ffffff', { map: soil, roughness: 1 })); ground.receiveShadow = true; group.add(ground);
  const outside = new THREE.Mesh(geo(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)), std('#2a3a2c', { roughness: 1 })); outside.position.y = -0.03; group.add(outside);
  const white = std('#f4ecd8');
  const pickets = [];
  for (const sz of [-1, 1]) for (let x = -A.hw; x <= A.hw + 0.01; x += 0.5) pickets.push([x, sz * (A.hd + 0.25)]);
  for (const sx of [-1, 1]) for (let z = -A.hd + 0.5; z < A.hd; z += 0.5) pickets.push([sx * (A.hw + 0.25), z]);
  const pk = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(0.12, 0.75, 0.06)), white, pickets.length);
  pickets.forEach(([x, z], i) => { m4.compose(v.set(x, 0.38, z), q.identity(), sc.set(1, 1, 1)); pk.setMatrixAt(i, m4); }); group.add(pk);
  for (const sz of [-1, 1]) mesh(geo(new THREE.BoxGeometry(A.hw * 2 + 0.6, 0.08, 0.04)), white, 0, 0.5, sz * (A.hd + 0.25));
  for (const sx of [-1, 1]) mesh(geo(new THREE.BoxGeometry(0.04, 0.08, A.hd * 2 + 0.6)), white, sx * (A.hw + 0.25), 0.5, 0);
  // ---- the pump (post 0) and the piles
  const iron = std('#3c4a5a', { metalness: 0.5, roughness: 0.4 }), woodM = std('#8a5a32');
  const posts = A.posts || [];
  const pump = new THREE.Group(); pump.position.set(posts[0]?.x || 0, 0, posts[0]?.z || 0); group.add(pump);
  mesh(geo(new THREE.CylinderGeometry(0.22, 0.28, 1.3, 12)), iron, 0, 0.65, 0, pump);
  mesh(geo(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8).rotateZ(Math.PI / 2)), iron, 0.3, 1.0, 0, pump);
  const handle = mesh(geo(new THREE.BoxGeometry(0.7, 0.06, 0.06)), iron, -0.35, 1.35, 0, pump);
  mesh(geo(new THREE.BoxGeometry(0.9, 0.3, 0.5)), woodM, 0.5, 0.15, 0, pump);
  const water = mesh(geo(new THREE.PlaneGeometry(0.8, 0.4).rotateX(-Math.PI / 2)), basic({ color: '#7fd0ff', transparent: true, opacity: 0.8 }), 0.5, 0.31, 0, pump); void water;
  const washRing = new THREE.Mesh(geo(new THREE.RingGeometry(RULES.pump.reach - 0.12, RULES.pump.reach, 40).rotateX(-Math.PI / 2)), basic({ color: '#7fd0ff', transparent: true, opacity: 0.45, depthWrite: false })); washRing.position.set(pump.position.x, 0.02, pump.position.z); group.add(washRing);
  const pkGeo = geo(pumpkinGeo(THREE, 0.42)), pkM = std('#ff7a14', { roughness: 0.55, emissive: '#a83a00', emissiveIntensity: 0.25 }), stG = geo(stemGeo(THREE, 0.42)), stM = std('#4a7a2a');
  const faceM = basic({ map: tex(faceTexture(THREE)), transparent: true, depthWrite: false });
  for (const o of posts.slice(1)) {
    const g = new THREE.Group(); g.position.set(o.x, 0, o.z); group.add(g);
    if (init.patch === 'cart') {
      mesh(geo(new THREE.BoxGeometry(o.r * 2, 0.6, o.r * 1.4)), woodM, 0, 0.55, 0, g);
      mesh(geo(new THREE.BoxGeometry(o.r * 1.8, 0.4, o.r * 1.2)), std('#e8c25a', { roughness: 1 }), 0, 1.05, 0, g);
      for (const sx of [-1, 1]) mesh(geo(new THREE.TorusGeometry(0.3, 0.07, 6, 14)), woodM, sx * o.r * 0.7, 0.3, o.r * 0.72, g);
    } else {
      const spots = [[0, 0.42, 0, 1], [o.r * 0.6, 0.3, o.r * 0.3, 0.7], [-o.r * 0.55, 0.3, o.r * 0.25, 0.72], [0, 0.95, 0, 0.6]];
      for (const [x, y, z, s] of spots) { const p = mesh(pkGeo, pkM, x, y, z, g); p.scale.setScalar(s); const st = mesh(stG, stM, x, y, z, g); st.scale.setScalar(s); }
      const f = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.6, 0.6)), faceM); f.position.set(0, 0.42, 0.43); g.add(f);
    }
  }
  // ---- globs, puddles, splats
  const slimeM = std('#7dff5a', { emissive: '#3fbf2a', emissiveIntensity: 0.8, roughness: 0.2 });
  const globGeo = geo(new THREE.SphereGeometry(0.26, 12, 8)), globs = new Map();
  const puddleGeo = geo(new THREE.CircleGeometry(RULES.puddleR, 20).rotateX(-Math.PI / 2)), puddles = new Map();
  const dropGeo = geo(new THREE.SphereGeometry(0.1, 6, 4)), drops = [];
  function splash(x, z, y = 1.1) { for (let i = 0; i < 9; i++) { const d = new THREE.Mesh(dropGeo, slimeM); d.position.set(x, y, z); const a = i / 9 * Math.PI * 2; d.userData.v = [Math.sin(a) * 3, 2 + (i % 3), Math.cos(a) * 3]; group.add(d); drops.push({ d, t: 0 }); } }
  // ---- goo on players: a head blob and a jelly shell
  const jellyM = std('#7dff5a', { transparent: true, opacity: 0.45, emissive: '#3fbf2a', emissiveIntensity: 0.4, roughness: 0.1 });
  const blobGeo = geo(new THREE.SphereGeometry(0.32, 12, 8)), shellGeo = geo(new THREE.SphereGeometry(0.9, 16, 12));
  const goo = new Map();
  for (const p of ctx.players) {
    const a = ctx.actor(p.pid); if (!a) continue;
    const blob = new THREE.Mesh(blobGeo, slimeM); blob.visible = false; a.group.add(blob);
    const shell = new THREE.Mesh(shellGeo, jellyM); shell.visible = false; shell.position.y = 0.85; a.group.add(shell);
    goo.set(p.pid, { blob, shell, a });
  }
  // ---- jelly ghosts (solo / two players)
  const ghosts = new Map(), gTags = [];
  const gGeo = geo(ghostGeo(THREE, 0.6));
  for (const gh of init.ghosts || []) {
    const holder = new THREE.Group(); group.add(holder);
    const m = std('#e8e0ff', { transparent: true, opacity: 0.9, emissive: '#3fbf2a', emissiveIntensity: 0 });
    mesh(gGeo, m, 0, 0.1, 0, holder);
    for (const sx of [-0.16, 0.16]) mesh(geo(new THREE.SphereGeometry(0.07, 8, 6)), std('#1a0f26'), sx, 0.95, 0.5, holder);
    const sh = new THREE.Mesh(shellGeo, jellyM); sh.visible = false; sh.position.y = 0.6; holder.add(sh);
    ghosts.set(gh.id, { holder, m, sh, cur: null, to: null });
    gTags.push(stage.tag(holder, { text: gh.name, height: 1.6, cls: 'ss-cpu' }));
  }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'splats' });
  const meter = h('div', 'ss-meter', '<span></span><span></span><span></span>'), now = h('div', 'ss-now'), banner = h('div', 'ss-banner');
  ctx.ui.append(now, banner); if (ctx.me != null) ctx.ui.append(meter);
  const medals = init.solo && init.medals ? h('div', 'ss-medals', init.medals.map((m, i) => `<span>${['🥉', '🥈', '🥇'][i]} ${m}</span>`).join('')) : null; if (medals) ctx.ui.append(medals);
  let bannerT = 0, lv = {}, cd = 3, started = false, shown = false;
  const show = (text, cls = '', ms = 1000) => { banner.textContent = text; banner.className = 'ss-banner show ' + cls; bannerT = ms / 1000; };
  const flagsOf = new Map();
  const nameOf = id => id < 0 ? ((init.ghosts || []).find(g => g.id === id)?.name || 'Ghost') : id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';
  function nowText() {
    if (cd > 0) return 'Get your slime ready!';
    const l = lv[ctx.me] || 0, fl = flagsOf.get(ctx.me) || 0;
    if (fl & F.FROZEN) return '🟢 STUCK! Wobble free in a moment…';
    if (l >= 2) return '💧 Slimed! Wash off at the pump!';
    return 'Throw slime with A — three globs sticks them!';
  }
  return {
    state(g) {
      bar.set(g.sc, g.left); lv = g.lv || {}; cd = g.cd;
      if (!shown && g.cd) { shown = true; if (init.patchName) show(init.patchName, 'small', 1400); }
      const seen = new Set();
      for (const [id, x, z] of g.gl) { seen.add(id); let G = globs.get(id); if (!G) { G = { m: mesh(globGeo, slimeM, x, 1.1, z), x, z, px: x, pz: z }; globs.set(id, G); } G.px = G.x; G.pz = G.z; G.x = x; G.z = z; G.at = performance.now(); }
      for (const [id, G] of globs) if (!seen.has(id)) { group.remove(G.m); globs.delete(id); }
      const ps = new Set();
      for (const [id, x, z] of g.pd) { ps.add(id); if (!puddles.has(id)) { const m = basic({ color: '#7dff5a', transparent: true, opacity: 0.7, depthWrite: false }); const p = new THREE.Mesh(puddleGeo, m); p.position.set(x, 0.015, z); p.scale.setScalar(0.1); group.add(p); puddles.set(id, { p, m, born: performance.now() }); } }
      for (const [id, P] of puddles) if (!ps.has(id)) { group.remove(P.p); P.m.dispose(); puddles.delete(id); }
      for (const row of g.gh || []) { const G = ghosts.get(row[0]); if (!G) continue; const to = { x: row[1], z: row[2], lvl: row[3], flags: row[4] }; if (!G.cur) G.cur = { ...to }; G.to = to; }
      if (ctx.me != null) meter.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', (lv[ctx.me] || 0) > i));
      now.textContent = g.left <= 0 ? '' : nowText(); now.classList.toggle('hot', (lv[ctx.me] || 0) >= 2);
      if (medals) medals.querySelectorAll('span').forEach((s, i) => s.classList.toggle('won', (g.sc[ctx.players[0].pid] || 0) >= init.medals[i]));
      if (!g.cd && !started && g.left > 0) { started = true; tunes.start('spooky'); }
    },
    input(inp) { if ((inp.b & IN.A) && !((flagsOf.get(ctx.me) || 0) & (F.FROZEN | F.STUN))) ctx.actor(ctx.me)?.play('throw', 300); },
    event(ev) {
      if (ev.e === 'count') { show(String(ev.n), '', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('SLING!', 'go', 900); ctx.sfx('good'); }
      else if (ev.e === 'throw') { ctx.sfx('throw'); if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('throw', 300); }
      else if (ev.e === 'splat') {
        ctx.sfx('splat'); tunes.fx('slime', ev.lvl >= 3 ? 0.7 : 1); splash(ev.x, ev.z);
        floatText(stage, ev.x, 2.2, ev.z, ev.lvl >= 3 ? `STUCK! +${ev.pts}` : `+${ev.pts}`, ev.by === ctx.me ? 'good' : ev.id === ctx.me ? 'bad' : '');
        if (ev.by === ctx.me && ev.lvl >= 3) { show(`${nameOf(ev.id)} is STUCK!`, 'go small', 1100); juice.flash('rgba(125,255,90,.6)', 160); }
        if (ev.id === ctx.me) { juice.flash('rgba(125,255,90,.75)', 260); juice.shake(0.07, 0.2); navigator.vibrate?.(ev.lvl >= 3 ? 120 : 50); if (ev.lvl >= 3) show('STUCK!', 'bad', 1100); }
        if (ev.id > 0) ctx.actor(ev.id)?.play('hit', 300);
      } else if (ev.e === 'miss') { ctx.sfx('splat'); splash(ev.x, ev.z, 0.3); }
      else if (ev.e === 'washed') { if (ev.id === ctx.me) { show('Squeaky clean!', 'small', 900); ctx.sfx('good'); } handle.rotation.z = 0.5; }
      else if (ev.e === 'unstuck') { tunes.fx('pop', 1.2); }
      else if (ev.e === 'dodge') { if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('jump', 260); }
      else if (ev.e === 'end') { show('Time!', 'small', 1500); ctx.sfx('win'); tunes.stop(false); }
    },
    pose(pid, flags) { flagsOf.set(pid, flags); if (flags & F.FROZEN) return cd > 0 ? 'ready' : 'hit'; return undefined; },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      const nowMs = performance.now();
      for (const G of globs.values()) { const k = Math.min(1.5, (nowMs - G.at) / 50); G.m.position.set(G.x + (G.x - G.px) * k, 1.1, G.z + (G.z - G.pz) * k); G.m.scale.set(1 + Math.sin(t * 30) * 0.15, 1 - Math.sin(t * 30) * 0.12, 1); }
      for (const P of puddles.values()) { const age = (nowMs - P.born) / 1000; P.p.scale.setScalar(Math.min(1, 0.1 + age * 4)); P.m.opacity = Math.max(0.1, 0.7 * (1 - age / RULES.puddleLife)); }
      for (const [pid, G] of goo) {
        const l = lv[pid] || 0, fl = flagsOf.get(pid) || 0, stuck = !!(fl & F.FROZEN) && cd <= 0 && l >= 0 && (fl & F.GHOST);
        const hgt = G.a.height || 1.6;
        G.blob.visible = l > 0 && !stuck; G.blob.position.y = hgt + 0.05; G.blob.scale.set(l >= 2 ? 1.5 : 1, (l >= 2 ? 1.2 : 0.8) + Math.sin(t * 6) * 0.08, l >= 2 ? 1.5 : 1);
        G.shell.visible = stuck; if (stuck) { G.shell.scale.set(1 + Math.sin(t * 9) * 0.06, (hgt / 1.6) * (1 - Math.sin(t * 9) * 0.06), 1); G.shell.position.y = hgt * 0.5; }
        G.a.body.group.visible = !(fl & F.GHOST) || stuck || (fl & F.FROZEN) || Math.floor(t * 10) % 2 === 0;
      }
      for (const G of ghosts.values()) {
        if (!G.to) continue; const k = 1 - Math.exp(-dt * 12), c = G.cur, to = G.to;
        c.x += (to.x - c.x) * k; c.z += (to.z - c.z) * k;
        G.holder.position.set(c.x, 0.15 + Math.sin(t * 2.5 + c.x) * 0.12, c.z); G.holder.rotation.y = Math.atan2(to.x - c.x, to.z - c.z) || G.holder.rotation.y;
        G.m.emissiveIntensity = (to.lvl || 0) * 0.35; G.m.color.set(to.lvl ? '#c8ffb0' : '#e8e0ff');
        G.sh.visible = !!(to.flags & F.FROZEN) && cd <= 0; if (G.sh.visible) G.sh.scale.setScalar(0.85 + Math.sin(t * 9) * 0.05);
        G.holder.visible = !(to.flags & F.GHOST) || (to.flags & F.FROZEN) || Math.floor(t * 10) % 2 === 0;
      }
      handle.rotation.z *= Math.max(0, 1 - dt * 3);
      for (let i = drops.length - 1; i >= 0; i--) { const D = drops[i]; D.t += dt; const u = D.d.userData.v; u[1] -= 12 * dt; D.d.position.x += u[0] * dt; D.d.position.y = Math.max(0.05, D.d.position.y + u[1] * dt); D.d.position.z += u[2] * dt; if (D.t > 0.6) { group.remove(D.d); drops.splice(i, 1); } }
      juice.frame(dt, t);
    },
    dispose() {
      tunes.dispose(); juice.dispose(); bar.el.remove(); meter.remove(); now.remove(); banner.remove(); medals?.remove();
      for (const t2 of gTags) t2.remove();
      for (const G of goo.values()) { G.blob.removeFromParent(); G.shell.removeFromParent(); G.a.body.group.visible = true; }
      for (const P of puddles.values()) P.m.dispose();
      for (const t2 of texs) t2.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
