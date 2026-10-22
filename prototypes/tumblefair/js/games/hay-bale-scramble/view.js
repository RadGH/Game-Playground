// HAY BALE SCRAMBLE, as drawn: a round dirt farmyard with straw scattered on it and a split-rail fence round the edge,
// on bright grass. In the middle a fiddler stands on a barrel and dances while the tune plays (music notes float off
// him). Round him, golden hay bales tied with twine turn slowly like a carousel. When the music stops: the bales
// stop, every free bale gets a pulsing yellow ring, and a big STOP! banner says "press A". A taken bale gets a ring
// in its sitter's seat colour. Players who are out cheer from a red hay wagon at the back. Solo: bales vanish in a
// puff of straw one by one after the music stops.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { F } from '../../shared/arena.js';

const MAXB = 5;
export function createView(ctx) {
  const { THREE, group, stage, arena: A, init } = ctx, R = A.r;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const tunes = createTunes();

  // ---- ground, straw, fence, trees
  const grass = new THREE.Mesh(geo(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)), std('#79c95f', { roughness: 1 })); grass.position.y = -0.02; grass.receiveShadow = true; group.add(grass);
  const dirt = new THREE.Mesh(geo(new THREE.CircleGeometry(R + 0.4, 64).rotateX(-Math.PI / 2)), std('#d6a46a', { roughness: 1 })); dirt.receiveShadow = true; group.add(dirt);
  const ringPaint = new THREE.Mesh(geo(new THREE.RingGeometry(4.3, 4.45, 64).rotateX(-Math.PI / 2)), basic({ color: '#fff4dc', transparent: true, opacity: 0.5, depthWrite: false })); ringPaint.position.y = 0.006; group.add(ringPaint);
  const STRAW = 110, straw = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(0.34, 0.02, 0.04)), std('#f1cf5b', { roughness: 1 }), STRAW);
  for (let i = 0; i < STRAW; i++) { const a = i * 2.39996, r = Math.sqrt((i * 7919 % 1000) / 1000) * (R - 0.4); m4.compose(v.set(Math.sin(a) * r, 0.01, Math.cos(a) * r), q.setFromEuler(e3.set(0, i * 1.3, 0)), sc.setScalar(0.7 + (i % 5) * 0.15)); straw.setMatrixAt(i, m4); }
  group.add(straw);
  const POSTS = 30, fence = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 6)), std('#8a5a32'), POSTS);
  for (let i = 0; i < POSTS; i++) { const a = i / POSTS * Math.PI * 2; m4.compose(v.set(Math.sin(a) * (R + 0.35), 0.55, Math.cos(a) * (R + 0.35)), q.identity(), sc.setScalar(1)); fence.setMatrixAt(i, m4); }
  fence.castShadow = true; group.add(fence);
  for (const y of [0.45, 0.85]) { const rail = mesh(geo(new THREE.TorusGeometry(R + 0.35, 0.05, 5, 72).rotateX(Math.PI / 2)), std('#a06b3c'), 0, y, 0); rail.castShadow = false; }
  const TREES = 20, treeTop = new THREE.InstancedMesh(geo(new THREE.IcosahedronGeometry(1, 0)), std('#2f9e44', { flatShading: true }), TREES), trunk = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.14, 0.2, 1.2, 6)), std('#7a4a2a'), TREES);
  for (let i = 0; i < TREES; i++) { const a = i / TREES * Math.PI * 2 + 0.2, r = R + 3 + (i * 1.7) % 4, s = 0.9 + (i % 3) * 0.4, x = Math.sin(a) * r * 1.25, z = Math.cos(a) * r;
    m4.compose(v.set(x, 1.3 + s * 0.8, z), q.setFromEuler(e3.set(i, i * 2, 0)), sc.setScalar(s)); treeTop.setMatrixAt(i, m4); m4.compose(v.set(x, 0.6, z), q.identity(), sc.setScalar(1)); trunk.setMatrixAt(i, m4); }
  treeTop.castShadow = true; group.add(treeTop, trunk);

  // ---- barrel + fiddler
  const wood = std('#9a6236'), hoop = std('#5b5f66', { metalness: 0.5, roughness: 0.4 });
  mesh(geo(new THREE.CylinderGeometry(0.62, 0.62, 0.95, 16)), wood, 0, 0.475, 0);
  for (const y of [0.18, 0.77]) mesh(geo(new THREE.CylinderGeometry(0.64, 0.64, 0.07, 16)), hoop, 0, y, 0);
  let fiddler = null;
  ctx.createActor({ look: { race: 'dwarf', seed: 7311 }, costume: 'cos_none' }, { scale: 1.05 }).then(a => { if (!a) return; fiddler = a; a.place(0, 0.95, 0, 0); a.setPose('dance'); });
  const sprite = (draw, w, hh, scale) => { const t = tex(canvasTexture(w, hh, draw)), m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }); mats.push(m); const s = new THREE.Sprite(m); s.scale.set(scale * w / hh, scale, 1); return s; };
  const notes = [];
  for (let i = 0; i < 4; i++) { const ch = i % 2 ? '♪' : '♫', n = sprite((c, w, hh) => { c.font = '900 52px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 8; c.strokeStyle = '#0d2228'; c.strokeText(ch, w / 2, hh / 2); c.fillStyle = ['#ffd23f', '#39d0e0', '#ff7ab8', '#8ff07a'][i]; c.fillText(ch, w / 2, hh / 2); }, 64, 64, 0.7); n.visible = false; group.add(n); notes.push({ s: n, t: i / 4, side: i % 2 ? 1 : -1 }); }

  // ---- the hay wagon at the back (out players stand on it)
  const W = init.wagon || RULES.wagon, red = std('#d23b3b', { roughness: 0.7 });
  mesh(geo(new THREE.BoxGeometry(4.4, 0.22, 1.5)), std('#b9773a'), 0, W.y - 0.13, W.z);
  for (const sz of [-1, 1]) mesh(geo(new THREE.BoxGeometry(4.4, 0.4, 0.08)), red, 0, W.y + 0.1, W.z + sz * 0.72);
  for (const sx of [-1, 1]) mesh(geo(new THREE.BoxGeometry(0.08, 0.4, 1.5)), red, sx * 2.2, W.y + 0.1, W.z);
  for (const [x, z] of [[-1.5, -0.8], [1.5, -0.8], [-1.5, 0.8], [1.5, 0.8]]) { const w = mesh(geo(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 14)), std('#6b3f1f'), x, 0.45, W.z + z); w.rotation.x = Math.PI / 2; mesh(geo(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 8)), std('#ffd23f'), 0, 0, 0, w); }
  const signTex = tex(canvasTexture(256, 64, (c, w, hh) => { c.fillStyle = '#fff4dc'; c.fillRect(0, 0, w, hh); c.fillStyle = '#7a3d00'; c.font = '900 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('CHEER WAGON', w / 2, hh / 2 + 2); }));
  const sign = new THREE.Mesh(geo(new THREE.PlaneGeometry(2.2, 0.55)), basic({ map: signTex })); sign.position.set(0, W.y + 0.15, W.z + 0.77); group.add(sign);

  // ---- bales (instanced) + twine + rings under them
  const strawTex = tex(canvasTexture(128, 64, (c, w, hh) => { c.fillStyle = '#f2c94c'; c.fillRect(0, 0, w, hh); for (let i = 0; i < 160; i++) { c.strokeStyle = i % 3 ? '#d9a62e' : '#fff0a0'; c.lineWidth = 1.5; const x = (i * 37) % w, y = (i * 53) % hh; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 10 + (i % 7), y + (i % 5) - 2); c.stroke(); } }));
  const baleMesh = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(1.5, 0.75, 1.0)), std('#ffffff', { map: strawTex, roughness: 1 }), MAXB);
  const twine = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(0.07, 0.77, 1.02)), std('#7a4a2a'), MAXB * 2);
  const ringMesh = new THREE.InstancedMesh(geo(new THREE.RingGeometry(1.05, 1.3, 32).rotateX(-Math.PI / 2)), basic({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }), MAXB);
  baleMesh.castShadow = true; baleMesh.receiveShadow = true; twine.castShadow = false; group.add(baleMesh, twine, ringMesh);
  const baleScale = new Array(MAXB).fill(0), puffs = [], puffGeo = geo(new THREE.IcosahedronGeometry(0.5, 0));
  function puff(x, z) { for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(puffGeo, basic({ color: '#f6dc7a', transparent: true, opacity: 0.9, depthWrite: false })); p.position.set(x + Math.sin(i * 1.3) * 0.4, 0.4 + i * 0.1, z + Math.cos(i * 1.3) * 0.4); group.add(p); puffs.push({ p, t: 0 }); } }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'rounds' });
  const pill = h('div', 'hay-pill'), banner = h('div', 'hay-banner');
  ctx.ui.append(pill, banner);
  let bannerT = 0;
  function show(text, cls = '', ms = 1200) { banner.textContent = text; banner.className = 'hay-banner show ' + cls; bannerT = ms / 1000; }
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  const seatColor = pid => ctx.players.find(p => p.pid === pid)?.color || '#ffffff';
  let lastBits = 0, lastInputAt = 0, g = null, ph = 'ready', ang = 0, omega = 0, rr = 3, lastPill = '', hic = 0, seated = new Set(), outSet = new Set();
  const myOut = () => ctx.me != null && outSet.has(ctx.me);
  function baleXZ(i, k) { const a = ang + i * Math.PI * 2 / k; return [Math.sin(a) * rr, Math.cos(a) * rr, a]; }
  function setPhase(next) {
    if (next === ph) return; const prev = ph; ph = next;
    if (next === 'music') { tunes.start('jig'); fiddler?.setPose('dance'); }
    else if (next === 'scramble') { tunes.stop(true); fiddler?.setPose('idle'); show(myOut() || ctx.me == null ? 'STOP!' : ctx.btn('STOP! Press A!'), 'stop', 1300); ctx.sfx('hvf.bell'); }
    else if (next === 'done') { tunes.stop(false); fiddler?.setPose('clap'); }
  }
  return {
    state(s) {
      g = s; setPhase(s.ph);
      ang = s.a; omega = s.w; rr = s.rr;
      if (s.h && !hic) { tunes.mute(true); } else if (!s.h && hic) tunes.mute(false); hic = s.h;
      seated = new Set(s.bl.filter(o => o >= 0)); outSet = new Set(Object.keys(s.out).map(Number));
      for (const p of ctx.players) bar.mark(p.pid, 'out', outSet.has(p.pid));
      bar.set(s.sc, s.left);
      const free = s.bl.filter(o => o === -1).length, k = s.bl.length;
      const mine = ctx.me != null ? (myOut() ? 'out' : seated.has(ctx.me) ? 'sat' : 'stand') : 'watch';
      let icon = '🎻', text = '';
      if (s.ph === 'ready') { icon = '⏳'; text = 'Get ready…'; }
      else if (s.ph === 'music') { icon = '🎻'; text = s.h ? 'Hiccup! Not yet…' : init.solo ? `${k} bale${k === 1 ? '' : 's'} · stay close!` : `Round ${s.r} · ${k} bale${k === 1 ? '' : 's'} · keep walking!`; }
      else if (s.ph === 'scramble') { icon = '🛑'; text = mine === 'sat' ? 'You got a bale!' : mine === 'stand' ? ctx.btn(`Grab a bale — press A! (${free} free)`) : `${free} bale${free === 1 ? '' : 's'} left!`; }
      else if (s.ph === 'result') { icon = '🌾'; text = mine === 'sat' ? 'Safe!' : mine === 'out' ? 'Cheer them on!' : 'Next round…'; }
      else { icon = '🏆'; text = 'Done!'; }
      if (mine === 'out' && s.ph !== 'done') { icon = '📣'; text = init.solo ? 'Out of tries!' : 'You’re on the cheer wagon!'; }
      if (init.solo && s.tr != null && s.ph !== 'done') text += ' ' + '♥'.repeat(s.tr) + '♡'.repeat(Math.max(0, (init.tries || 3) - s.tr));
      const key = icon + text + s.ph;
      if (key !== lastPill) { lastPill = key; pill.dataset.ph = s.ph; pill.innerHTML = `<i>${icon}</i><span>${text}</span>`; }
    },
    event(ev) {
      if (ev.e === 'music') { if (ev.round > 1) show(init.solo ? `${ev.k} bale${ev.k === 1 ? '' : 's'}!` : `Round ${ev.round}!`, 'small', 1000); else show('Music!', 'go small', 900); }
      else if (ev.e === 'sit') { const at = g ? baleXZ(ev.i, g.bl.length) : [0, 0]; ctx.sfx('pick'); if (ev.pid === ctx.me) show('Got it!', 'go small', 800); floatText(stage, at[0], 1.8, at[1], ev.pid === ctx.me ? 'Sat!' : nameOf(ev.pid), 'good'); }
      else if (ev.e === 'stumble') { ctx.sfx('bad'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, 'Too soon!', 'bad'); }
      else if (ev.e === 'miss') { ctx.sfx('tap'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, 'Get closer!', 'bad'); }
      else if (ev.e === 'barge') { if (ev.pid !== ctx.me) { ctx.sfx('throw'); ctx.actor(ev.pid)?.play('punch', 350); } }
      else if (ev.e === 'shove') { ctx.sfx('hit'); floatText(stage, ev.x, 1.6, ev.z, 'Bump!', ''); }
      else if (ev.e === 'hiccup') { tunes.fx('scratch'); }
      else if (ev.e === 'stop') { /* handled by the phase */ }
      else if (ev.e === 'vanish') { const at = g ? baleXZ(ev.i, g.bl.length) : [0, 0]; puff(at[0], at[1]); tunes.fx('pop'); }
      else if (ev.e === 'result') {
        if (init.solo && ev.again) { ctx.sfx('bad'); show(`Missed! ${ev.tries} ${ev.tries === 1 ? 'try' : 'tries'} left`, 'stop small', 1800); }
        else if (ev.again) show('Nobody sat! Again!', 'small', 1600);
        else if (ev.outs.length) { ctx.sfx('out'); show(ev.outs.includes(ctx.me) ? 'You’re out!' : `${ev.outs.map(nameOf).join(' & ')} out!`, ev.outs.includes(ctx.me) ? 'stop small' : 'small', 1800); }
        else if (init.solo) { ctx.sfx('good'); show('Safe!', 'go small', 1000); }
      }
      else if (ev.e === 'done') { if (ev.win != null) { ctx.sfx('win'); show(ev.win === ctx.me ? 'You win!' : `${nameOf(ev.win)} wins!`, 'go', 2600); } else if (init.solo) show('Game over!', 'small', 2400); }
    },
    input(inp) {
      // the instant you press B: swing your barge at once (the server decides whether it hit)
      const pb = (inp.b & 2) && !(lastBits & 2); lastBits = inp.b; lastInputAt = performance.now();
      if (pb && ctx.me != null && !outSet.has(ctx.me) && !seated.has(ctx.me)) { ctx.actor(ctx.me)?.play('punch', 350); ctx.sfx('throw'); }
    },
    pose(pid, flags) {
      if (outSet.has(pid)) return 'cheer';
      if (seated.has(pid)) return 'sitGround';
      if (flags & F.STUN) return 'hit';
      if (ph === 'ready') return 'ready';
      return undefined;
    },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      if (performance.now() - lastInputAt > 90) lastBits = 0;           // view.input is only called while a button is down
      fiddler?.update(dt);
      if (!g) return;
      ang += omega * dt;
      const k = g.bl.length;
      for (let i = 0; i < MAXB; i++) {
        const o = i < k ? g.bl[i] : -2, want = o === -2 ? 0 : 1;
        baleScale[i] += (want - baleScale[i]) * Math.min(1, dt * (want ? 6 : 10));
        const s = Math.max(0.0001, baleScale[i]);
        const [x, z, a] = i < k ? baleXZ(i, k) : [0, 0, 0];
        m4.compose(v.set(x, 0.375 * s, z), q.setFromEuler(e3.set(0, a + Math.PI / 2, 0)), sc.setScalar(s)); baleMesh.setMatrixAt(i, m4);
        for (const [j, off] of [[0, -0.42], [1, 0.42]]) { const ox = Math.cos(a) * off, oz = -Math.sin(a) * off; m4.compose(v.set(x + ox * s, 0.375 * s, z + oz * s), q.setFromEuler(e3.set(0, a + Math.PI / 2, 0)), sc.setScalar(s)); twine.setMatrixAt(i * 2 + j, m4); }
        const freeLit = g.ph === 'scramble' && o === -1, taken = o >= 0;
        const rs = (freeLit ? 1 + Math.sin(t * 10) * 0.08 : 1) * (freeLit || taken ? s : 0.0001);
        m4.compose(v.set(x, 0.02, z), q.identity(), sc.setScalar(Math.max(0.0001, rs))); ringMesh.setMatrixAt(i, m4);
        ringMesh.setColorAt(i, col.set(taken ? seatColor(o) : '#ffd23f'));
      }
      baleMesh.instanceMatrix.needsUpdate = true; twine.instanceMatrix.needsUpdate = true; ringMesh.instanceMatrix.needsUpdate = true; if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
      // notes off the fiddler while the music plays
      const playing = g.ph === 'music' && !g.h;
      for (const n of notes) { n.t += dt * 0.55; if (n.t > 1) n.t -= 1; n.s.visible = playing; n.s.position.set(n.side * (0.4 + n.t * 1.1) + Math.sin(n.t * 9) * 0.2, 2.6 + n.t * 2.0, 0.2); n.s.material.opacity = n.t < 0.15 ? n.t / 0.15 : 1 - (n.t - 0.15) / 0.85; }
      if (fiddler) fiddler.body.group.rotation.y = playing ? Math.sin(t * 2.5) * 0.6 : fiddler.body.group.rotation.y * 0.9;
      for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt * 2.5; p.p.scale.setScalar(0.4 + p.t * 1.4); p.p.position.y += dt * 0.8; p.p.material.opacity = Math.max(0, 0.9 - p.t); if (p.t >= 1) { group.remove(p.p); p.p.material.dispose(); puffs.splice(i, 1); } }
    },
    dispose() {
      tunes.dispose(); bar.el.remove(); pill.remove(); banner.remove();
      for (const p of puffs) p.p.material.dispose();
      for (const t of texs) t.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
