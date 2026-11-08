// SLED BASH, as drawn: a round frozen pond of pale blue ice (streaky, shiny) in a snowfield, ringed by a bank of soft
// snowdrift lumps that creeps inward as the round goes on (the ice disc shrinks with it), snow-capped pines and a few
// snowmen round the outside, and flakes drifting down. Everyone sits on a round saucer sled in their seat colour with
// a white rim and their seat shape painted in the middle; a sled that was bumped spins. Into the snow = head first,
// boots in the air. CPU sledders ride orange-and-white sleds with a name tag. HUD: score bar, a pill with the round
// and the button, 3-2-1-GO, and call-outs ("BUMP! +2", "Last on the ice! +3").
import { RULES } from './sim.js';
import { snowKit, WINTER } from './snow-kit.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { createJuice } from '../../client/juice.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const SHAPE_CH = { circle: '●', square: '■', triangle: '▲', diamond: '◆' };
const SEAT_Y = 0.2, DRIFTS = 44;
export function createView(ctx) {
  const { THREE, group, stage, init } = ctx, R = init.R || ctx.arena.r;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const kit = snowKit(ctx), { std, geo } = kit;
  const texs = [];
  const tex = t => { texs.push(t); return t; };
  const tunes = createTunes({ volume: 0.22 }), juice = createJuice(ctx);
  kit.sky();

  // ---- the snowfield, the pond, the drift bank, pines, snowmen, flakes
  kit.ground(90);
  const iceTex = tex(canvasTexture(256, 256, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 10, w / 2, w / 2, w / 2); g.addColorStop(0, '#e4f5ff'); g.addColorStop(0.7, '#c4e6f8'); g.addColorStop(1, '#9fd0ec'); c.fillStyle = g; c.fillRect(0, 0, w, w);
    let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    c.lineWidth = 2; for (let i = 0; i < 40; i++) { c.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,.55)' : 'rgba(120,180,220,.35)'; const x = r() * w, y = r() * w, a = r() * 6.28, l = 20 + r() * 60; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
  }));
  const ice = new THREE.Mesh(geo(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2)), std('#ffffff', { map: iceTex, roughness: 0.12, metalness: 0.15 }));
  ice.position.y = 0.01; ice.scale.setScalar(R); ice.receiveShadow = true; group.add(ice);
  const shine = new THREE.Mesh(geo(new THREE.RingGeometry(0.55, 0.62, 48).rotateX(-Math.PI / 2)), kit.basic({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false })); shine.position.y = 0.015; group.add(shine);
  const lumpList = Array.from({ length: DRIFTS }, () => [0, 0, 1, 0.5, 1]);
  const drift = kit.lumps(lumpList);
  let shownR = -1;
  function placeDrift(rr) {
    if (Math.abs(rr - shownR) < 0.005) return; shownR = rr;
    ice.scale.setScalar(rr); shine.scale.setScalar(rr);
    for (let i = 0; i < DRIFTS; i++) {
      const a = i / DRIFTS * Math.PI * 2 + (i % 2) * 0.05, r = rr + 0.75 + (i % 3) * 0.18, s = 0.85 + (i % 4) * 0.12;
      m4.compose(v.set(Math.sin(a) * r, 0.05, Math.cos(a) * r), q.setFromEuler(e3.set(0, i * 1.7, 0)), sc.set(s * 1.1, 0.42 + (i % 3) * 0.08, s * 0.9)); drift.setMatrixAt(i, m4);
    }
    drift.instanceMatrix.needsUpdate = true;
  }
  placeDrift(R);
  const pineSpots = []; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2 + 0.3, r = R + 4 + (i * 1.7) % 4; pineSpots.push([Math.sin(a) * r * 1.2, Math.cos(a) * r, 0.9 + (i % 3) * 0.3]); }
  kit.pines(pineSpots);
  const outer = []; for (let i = 0; i < 26; i++) { const a = i * 2.39996, r = R + 2.2 + (i % 5) * 0.6; outer.push([Math.sin(a) * r, Math.cos(a) * r, 0.9 + (i % 3) * 0.4, 0.4, 0.8 + (i % 2) * 0.3]); }
  kit.lumps(outer);
  for (const [x, z, yaw, s] of [[-R - 2.4, -2, 0.6, 1], [R + 2.6, -1.4, -0.6, 0.9], [-2, -R - 2.6, 0.1, 1.1]]) { const sm = kit.snowman(s); sm.position.set(x, 0, z); sm.rotation.y = yaw; group.add(sm); }
  kit.snowfall({ hw: R + 6, hd: R + 6, count: 170, top: 9 });

  // ---- sleds: a saucer in the seat colour with a white rim and the seat shape painted in the middle
  const saucerGeo = geo(new THREE.CylinderGeometry(0.72, 0.5, 0.18, 24)), rimGeo = geo(new THREE.TorusGeometry(0.72, 0.07, 6, 28).rotateX(Math.PI / 2));
  const ropeGeo = geo(new THREE.TorusGeometry(0.22, 0.03, 5, 14, Math.PI)), rimMat = std('#ffffff', { roughness: 0.4 }), ropeMat = std('#8a5a32');
  function makeSled(color, mark) {
    const g = new THREE.Group(), body = std(color, { roughness: 0.35, metalness: 0.1 });
    const s = new THREE.Mesh(saucerGeo, body); s.position.y = 0.1; s.castShadow = true; g.add(s);
    const rim = new THREE.Mesh(rimGeo, rimMat); rim.position.y = 0.19; g.add(rim);
    const rope = new THREE.Mesh(ropeGeo, ropeMat); rope.position.set(0, 0.22, 0.7); rope.rotation.x = -0.3; g.add(rope);
    const decal = new THREE.Mesh(geo(new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2)), kit.basic({ map: tex(canvasTexture(64, 64, (c, w) => { c.fillStyle = color; c.fillRect(0, 0, w, w); c.fillStyle = '#fff'; c.font = '900 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(mark, w / 2, w / 2 + 2); })) }));
    decal.position.y = 0.195; g.add(decal);
    g.userData = { body, hit: 0 };
    return g;
  }
  const sleds = new Map();      // id -> { sled, holder, actor, cpu, cur, to }
  for (const p of ctx.players) { const holder = new THREE.Group(), sled = makeSled(p.color, SHAPE_CH[p.shape] || '★'); holder.add(sled); group.add(holder); sleds.set(p.pid, { sled, holder, actor: ctx.actor(p.pid), cpu: false }); }
  const cpuTags = [];
  for (const [i, c] of (init.cpus || []).entries()) {
    const holder = new THREE.Group(), sled = makeSled('#ff8a1f', '✱'); holder.add(sled); group.add(holder);
    const K = { sled, holder, actor: null, cpu: true, cur: null, to: null }; sleds.set(c.id, K);
    cpuTags.push(stage.tag(holder, { text: c.name, height: 1.9, cls: 'sb-cpu' }));
    ctx.createActor({ look: { race: ['halfling', 'elf', 'dwarf'][i % 3], seed: 7300 + i * 41 } }).then(a => { if (!a) return; K.actor = a; holder.add(a.group); a.place(0, 0, 0, 0); a.setPose('sitGround'); a.body.group.position.y = SEAT_Y; });
  }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'sb-pill'), banner = h('div', 'sb-banner');
  ctx.ui.append(pill, banner);
  let bannerT = 0, g0 = null, dashing = new Set(), lastPill = '', started = false, phase = 'count';
  function show(text, cls = '', ms = 1000) { banner.textContent = text; banner.className = 'sb-banner show ' + cls; bannerT = ms / 1000; }
  const nameOf = id => id < 0 ? ((init.cpus || []).find(c => c.id === id)?.name || 'CPU') : id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';
  const posOf = id => { const K = sleds.get(id); if (!K) return null; if (K.cpu) return K.cur; return ctx.pos(id); };
  const flagsOf = new Map();
  return {
    winter: false,          // dresses itself with snow-kit.js (no shared Winter Fair dressing on top)
    state(g) {
      g0 = g; phase = g.ph; bar.set(g.sc, g.left);
      dashing = new Set(g.ds || []);
      placeDrift(g.rr);
      for (const row of g.cpu || []) { const K = sleds.get(row[0]); if (!K) continue; const to = { x: row[1], z: row[2], y: row[3], yaw: row[4], flags: row[5] }; if (!K.cur || Math.hypot(to.x - K.cur.x, to.z - K.cur.z) > 3) K.cur = { ...to }; K.to = to; }
      const out = ctx.me != null && ((flagsOf.get(ctx.me) || 0) & F.OUT);
      const text = g.ph === 'count' ? 'Get ready…' : g.ph === 'between' ? 'Next round…' : g.ph === 'done' ? 'Done!' : out ? 'In the snow! Wait for the next round' : `Round ${g.rd} · ${ctx.btn('A = BOOST into them!')}`;
      if (text !== lastPill) { lastPill = text; pill.innerHTML = `<i>🛷</i><span>${text}</span>`; }
      if (!started && g.ph === 'play') { started = true; tunes.start('boogie'); }
    },
    event(ev) {
      if (ev.e === 'count') { show(String(ev.n), 'count', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('GO!', 'go', 900); ctx.sfx('good'); }
      else if (ev.e === 'round') { if (ev.round > 1) show(`Round ${ev.round}!`, 'small go', 1000); }
      else if (ev.e === 'boost') { tunes.fx('whistle', 1.2); if (ev.id !== ctx.me) { const K = sleds.get(ev.id); K?.actor?.play?.('punch', 300); } }
      else if (ev.e === 'bonk') {
        ctx.sfx('hit'); tunes.fx('boing', ev.boost ? 0.8 : 1.1);
        kit.puff(ev.x, 0.6, ev.z, '#ffffff', 6, 0.6);
        const V = sleds.get(ev.id); if (V) V.sled.userData.hit = 1;
        if (ev.by === ctx.me) { juice.flash('rgba(255,210,63,.6)', 140); floatText(stage, ev.x, 1.8, ev.z, ev.boost ? 'BOOST BUMP!' : 'Bump!', 'good'); }
        if (ev.id === ctx.me) { juice.flash('rgba(110,180,255,.8)', 200); navigator.vibrate?.(50); }
        juice.shake(ev.boost ? 0.12 : 0.06, 0.2);
      } else if (ev.e === 'plop') {
        kit.puff(ev.x, 0.3, ev.z, '#ffffff', 12, 1.2); tunes.fx('pop', 0.7); ctx.sfx('out');
        floatText(stage, ev.x, 1.6, ev.z, ev.by != null && ev.by >= 0 ? `${nameOf(ev.by)} +${RULES.knockPts}!` : 'Whoops!', ev.by === ctx.me ? 'good' : '');
        if (ev.id === ctx.me) { show('Into the snow!', 'small', 1200); juice.shake(0.12, 0.25); }
        else if (ev.by === ctx.me) show(`BUMPED! +${RULES.knockPts}`, 'go small', 900);
      } else if (ev.e === 'last') {
        floatText(stage, ev.x, 2.2, ev.z, `Last on the ice! ${ev.id >= 0 ? '+' + RULES.lastPts : ''}`, ev.id === ctx.me ? 'good' : '');
        if (ev.id === ctx.me) { show(`Last on the ice! +${RULES.lastPts}`, 'go small', 1500); ctx.sfx('coins'); }
        else show(`${nameOf(ev.id)} stays on!`, 'small', 1300);
      } else if (ev.e === 'roundEnd') { if (ev.last == null) show(ev.why === 'you' ? 'Into the snow!' : 'Snowed in!', 'small', 1200); }
      else if (ev.e === 'end') { show('Time!', 'small', 1500); ctx.sfx('win'); tunes.stop(false); }
    },
    input(inp) { if ((inp.b & IN.A) && ctx.me != null && phase === 'play') { tunes.fx('whistle', 1.25); } },
    pose(pid, flags) { flagsOf.set(pid, flags); if (flags & F.OUT) return 'hit'; if (phase === 'done' || phase === 'between') return 'sitGround'; return 'sitGround'; },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      kit.frame(dt, t); juice.frame(dt, t);
      for (const [id, K] of sleds) {
        let flags = 0, x = 0, z = 0, y = 0;
        if (K.cpu) {
          if (!K.to) continue; const k = 1 - Math.exp(-dt * 14), c = K.cur, to = K.to;
          c.x += (to.x - c.x) * k; c.z += (to.z - c.z) * k; c.y = to.y; let d = to.yaw - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * k;
          flags = to.flags; x = c.x; z = c.z; y = c.y;
          if (K.actor) { K.actor.body.group.rotation.y = c.yaw; K.actor.setPose(flags & F.OUT ? 'hit' : 'sitGround'); K.actor.update(dt); }
          K.holder.position.set(x, 0, z);
        } else {
          const a = K.actor || (K.actor = ctx.actor(id)); if (!a) continue;
          flags = flagsOf.get(id) || 0; x = a.group.position.x; z = a.group.position.z; y = a.group.position.y;
          K.holder.position.set(x, 0, z);
        }
        const out = !!(flags & F.OUT), spin = (flags & F.STUN) && !dashing.has(id);
        const yaw = K.cpu ? K.cur.yaw : (K.actor?.body.group.rotation.y || 0);
        // the sled: under the rider on the ice; tipped on its side next to them in the snow
        if (out) { K.sled.position.set(0.7, 0.25, 0); K.sled.rotation.set(0, 0, 1.2); }
        else { K.sled.position.set(0, 0, 0); K.sled.rotation.set(0, yaw, 0); }
        const root = K.cpu ? K.actor?.group : K.actor?.group;
        if (root) {
          root.rotation.y = spin ? t * 13 : 0;
          if (out) { root.rotation.x = Math.PI; if (K.actor.body) K.actor.body.group.position.y = -0.95; }    // head first in the drift, boots in the air
          else { root.rotation.x = 0; if (K.actor.body) K.actor.body.group.position.y = SEAT_Y + (dashing.has(id) ? 0.06 : 0); }
          if (K.cpu) root.position.y = out ? y : 0;
        }
        K.holder.rotation.y = spin ? t * 13 : 0;
        const ud = K.sled.userData; if (ud.hit > 0) { ud.hit = Math.max(0, ud.hit - dt * 4); ud.body.emissive.setRGB(ud.hit * 0.6, ud.hit * 0.8, ud.hit); }
      }
    },
    dispose() {
      tunes.dispose(); juice.dispose(); bar.el.remove(); pill.remove(); banner.remove();
      for (const t2 of cpuTags) t2.remove();
      for (const p of ctx.players) { const a = ctx.actor(p.pid); if (a) { a.group.rotation.set(0, 0, 0); a.body.group.position.y = 0; } }
      for (const t2 of texs) t2.dispose();
      kit.dispose();
    },
  };
}
