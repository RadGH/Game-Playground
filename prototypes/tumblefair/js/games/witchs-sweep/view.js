// WITCH'S SWEEP, as drawn (under the shared Halloween dusk dressing): a round courtyard of lavender cobbles inside a
// low stone wall, a fat black cauldron in the middle bubbling green, with a floating witch's hat over it. Candy corn
// (orange-yellow-white cones) and swirly lollipops arc out of the cauldron and land. The witch's enchanted broom lies
// flat on the floor and sweeps round the cauldron: a long wooden handle from the cauldron's rim out to a huge straw
// brush at the wall, a sparkly purple trail behind it showing which way it turns. When it is about to swing back the
// wall ring flashes orange and the broom shakes. The broom's angle is worked out on this device from the plan in
// init and the game clock (the same function the server uses), so it sweeps smoothly between updates.
// HUD: score bar, a big "do this now" line ("JUMP!" when the broom is about to reach you), solo medals, banners.
import { RULES, broomAt } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { witchHatGeo } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { createJuice } from '../../client/juice.js';

export function createView(ctx) {
  const { THREE, group, stage, init, meta } = ctx;
  const R = meta.arena.r, HUB = RULES.hub;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const texs = [], mats = [], geos = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  // ---- courtyard
  const cob = tex(canvasTexture(256, 256, (c, w) => { c.fillStyle = '#6d5d8c'; c.fillRect(0, 0, w, w); let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let y = 0; y < w; y += 28) for (let x = (y / 28) % 2 ? -14 : 0; x < w; x += 28) { c.fillStyle = ['#b9aad6', '#c6b8e0', '#ad9dcc', '#cfc3e6'][Math.floor(r() * 4)]; c.beginPath(); c.roundRect(x + 2, y + 2, 24, 24, 7); c.fill(); } }));
  cob.wrapS = cob.wrapT = THREE.RepeatWrapping; cob.repeat.set(R / 2.5, R / 2.5);
  const ground = new THREE.Mesh(geo(new THREE.CircleGeometry(R, 64).rotateX(-Math.PI / 2)), std('#ffffff', { map: cob })); ground.receiveShadow = true; group.add(ground);
  const outside = new THREE.Mesh(geo(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2)), std('#2d3a35')); outside.position.y = -0.03; group.add(outside);
  const stoneM = std('#7d7396', { flatShading: true });
  const wall = new THREE.Mesh(geo(new THREE.CylinderGeometry(R + 0.55, R + 0.55, 0.6, 64, 1, true)), stoneM); wall.position.y = 0.3; group.add(wall);
  const wallTop = new THREE.Mesh(geo(new THREE.RingGeometry(R + 0.05, R + 0.6, 64).rotateX(-Math.PI / 2)), stoneM); wallTop.position.y = 0.6; group.add(wallTop);
  const warnRing = new THREE.Mesh(geo(new THREE.RingGeometry(R - 0.3, R, 64).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: '#ff8a1a', transparent: true, opacity: 0, depthWrite: false })); mats.push(warnRing.material); warnRing.position.y = 0.02; group.add(warnRing);
  // ---- cauldron + hat
  const pot = new THREE.Mesh(geo(new THREE.SphereGeometry(HUB, 24, 16, 0, Math.PI * 2, 0.35, Math.PI - 0.35)), std('#2a2233', { roughness: 0.5, metalness: 0.3 })); pot.position.y = 0.75; pot.castShadow = true; group.add(pot);
  const rim = new THREE.Mesh(geo(new THREE.TorusGeometry(HUB * 0.94, 0.12, 8, 28).rotateX(Math.PI / 2)), std('#3a3044', { metalness: 0.4 })); rim.position.y = 0.75 + HUB * Math.cos(0.35); group.add(rim);
  const brew = new THREE.Mesh(geo(new THREE.CircleGeometry(HUB * 0.9, 28).rotateX(-Math.PI / 2)), new THREE.MeshStandardMaterial({ color: '#7dff5a', emissive: '#3fbf2a', emissiveIntensity: 0.9, roughness: 0.3 })); mats.push(brew.material); brew.position.y = rim.position.y - 0.03; group.add(brew);
  const bubbles = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.12, 8, 6)), new THREE.MeshStandardMaterial({ color: '#b6ff9a', emissive: '#5fdf3a', emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }), 10); mats.push(bubbles.material);
  const NB = 10; bubbles.frustumCulled = false; group.add(bubbles);
  const hat = new THREE.Mesh(geo(witchHatGeo(THREE, 0.8)), std('#6a32b8', { roughness: 0.7 })); hat.position.y = 3.2; group.add(hat);
  // ---- the broom: one group spun round the middle; a second appears later
  const wood = std('#8a5a32'), straw = std('#e8c25a', { roughness: 0.95 }), bandM = std('#7a3cc8');
  const trailTex = tex(canvasTexture(64, 16, (c, w, hh) => { const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(190,120,255,0)'); g.addColorStop(1, 'rgba(190,120,255,.7)'); c.fillStyle = g; c.fillRect(0, 0, w, hh); }));
  function makeBroom() {
    const g = new THREE.Group(); group.add(g);
    const len = 4.4, h0 = HUB + 0.1;
    const handle = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.22, 0.22, len, 10).rotateX(Math.PI / 2)), wood); handle.position.set(0, 0.32, h0 + len / 2); handle.castShadow = true; g.add(handle);
    const band = new THREE.Mesh(geo(new THREE.TorusGeometry(0.22, 0.07, 6, 14)), bandM); band.position.set(0, 0.32, h0 + len); g.add(band);
    const brush = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.45, 0.85, R - h0 - len - 0.1, 12, 1).rotateX(Math.PI / 2)), straw); brush.scale.set(1, 0.55, 1); brush.position.set(0, 0.4, h0 + len + (R - h0 - len - 0.1) / 2); brush.castShadow = true; g.add(brush);
    // the sparkly trail: a thin wedge on the floor just behind the arm (flipped to the side it came from)
    const trail = new THREE.Mesh(geo(new THREE.PlaneGeometry(R - HUB, 1.6).rotateX(-Math.PI / 2).rotateY(Math.PI / 2)), new THREE.MeshBasicMaterial({ map: trailTex, transparent: true, depthWrite: false })); mats.push(trail.material);
    trail.position.set(0.8, 0.03, HUB + (R - HUB) / 2); g.add(trail);
    g.userData = { trail, shake: 0 };
    return g;
  }
  const brooms = [makeBroom(), makeBroom()]; brooms[1].visible = false;
  // ---- candy: candy corn + lollipops
  const MC = 64;
  const cornTex = tex(canvasTexture(16, 64, (c, w, hh) => { c.fillStyle = '#fff6e0'; c.fillRect(0, 0, w, hh / 3); c.fillStyle = '#ffb21a'; c.fillRect(0, hh / 3, w, hh / 3); c.fillStyle = '#ff6a14'; c.fillRect(0, hh * 2 / 3, w, hh / 3); }));
  const corn = new THREE.InstancedMesh(geo(new THREE.ConeGeometry(0.3, 0.66, 3)), new THREE.MeshStandardMaterial({ map: cornTex, roughness: 0.5 }), MC); mats.push(corn.material);
  const lolly = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18).rotateX(Math.PI / 2)), new THREE.MeshStandardMaterial({ map: tex(canvasTexture(64, 64, (c, w) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, w); c.strokeStyle = '#a24bff'; c.lineWidth = 6; c.beginPath(); for (let a = 0; a < 18; a += 0.2) { const r = a * 1.7; c.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); } c.stroke(); })), roughness: 0.3 }), 16); mats.push(lolly.material);
  const sticks = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 5)), std('#ffffff'), 16);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const m of [corn, lolly, sticks]) { for (let i = 0; i < m.count; i++) m.setMatrixAt(i, zero); m.castShadow = true; m.frustumCulled = false; group.add(m); }
  const candy = new Map();
  // ---- dizzy stars
  const starTex = tex(canvasTexture(32, 32, (c, w) => { c.fillStyle = '#ffe96b'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 6 : 15; c.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); } c.fill(); }));
  const stars = new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(0.3, 0.3)), new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false }), 12); mats.push(stars.material); stars.frustumCulled = false; group.add(stars);
  for (let i = 0; i < stars.count; i++) stars.setMatrixAt(i, zero);
  const flags = new Map();
  // ---- camera
  // the whole courtyard, always: the broom can come from any side and you need to see it coming
  const FULL = { cx: 0, cz: -0.2, hw: R + 0.7, hd: R + 0.7 };
  const frameCam = (dt, instant = false) => ctx.camera(FULL, { instant });
  frameCam(0, true);
  // ---- sound + HUD
  const tunes = createTunes({ volume: 0.22 }), juice = createJuice(ctx);
  const sbar = scoreBar(ctx, { unit: 'candy' });
  const medals = init.solo && init.medals ? h('div', 'ws-medals', init.medals.map((m, i) => `<span>${['🥉', '🥈', '🥇'][i]} ${m}</span>`).join('')) : null; if (medals) ctx.ui.append(medals);
  const now = h('div', 'ws-now'); ctx.ui.append(now);
  const banner = h('div', 'ws-banner'); ctx.ui.append(banner); let bannerT = 0;
  const show = (text, cls = '', s = 1.1) => { banner.textContent = text; banner.className = 'ws-banner show ' + cls; bannerT = s; };
  // ---- the clock: the server's game time + what has passed here since
  let elS = 0, elAt = performance.now(), fw = 0, prevB = 0, prevS = -9;
  const tNow = () => elS + Math.min(0.25, (performance.now() - elAt) / 1000);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const armsAt = t => { const b = broomAt(init.plan, t); const list = [b.a]; if (t >= init.second) list.push(wrap(b.a + Math.PI)); return { list, w: b.w, warn: b.warn }; };
  function etaMe(A) {
    if (ctx.me == null || !A.w) return Infinity; const p = ctx.pos(ctx.me); if (!p) return Infinity;
    const d = Math.hypot(p.x, p.z); if (d < HUB - 0.2) return Infinity;
    const phi = Math.atan2(p.x, p.z); let best = Infinity;
    for (const a of A.list) { const e = wrap(phi - a); if (Math.sign(e) === Math.sign(A.w)) best = Math.min(best, Math.abs(e) / Math.abs(A.w)); }
    return best;
  }
  const cq = new THREE.Quaternion();
  return {
    start() { tunes.start('spooky'); },
    state(g) {
      const t = performance.now();
      for (const [id, x, z, kind, falling, fx, fz] of g.c) if (!candy.has(id)) candy.set(id, { x, z, kind, fx: falling ? fx : x, fz: falling ? fz : z, born: t, fromPot: falling && fx === 0 && fz === 0 });
      const seen = new Set(g.c.map(c => c[0])); for (const id of [...candy.keys()]) if (!seen.has(id)) candy.delete(id);
      if (g.el > tNow() + 0.15 || g.el < tNow() - 0.4) { elS = g.el; elAt = t; } else if (g.el > elS) { elS = g.el; elAt = t; }
      fw = g.fw;
      sbar.set(g.sc, g.left);
      if (medals) medals.querySelectorAll('span').forEach((s, i) => s.classList.toggle('won', (g.sc[ctx.players[0].pid] || 0) >= init.medals[i]));
      if (g.left <= 0) { now.textContent = ''; tunes.stop(false); }
    },
    input(inp) {
      const fresh = (inp.b & IN.A) && (!(prevB & IN.A) || inp.s !== prevS + 1); prevB = inp.b; prevS = inp.s;
      if (fresh && !(flags.get(ctx.me) & (F.STUN | F.AIR))) { ctx.actor(ctx.me)?.play('jump', 600); tunes.fx('boing', 1.5); }
    },
    event(ev) {
      if (ev.e === 'grab') { ctx.sfx(ev.add > 1 ? 'coins' : 'pick'); if (ev.pid === ctx.me && ev.add > 1) { juice.flash('rgba(255,210,63,.7)', 160); show('Lollipop! +3', 'good', 0.8); } floatText(stage, ev.x, 1.4, ev.z, `+${ev.add}`, ev.pid === ctx.me ? 'good' : ''); }
      else if (ev.e === 'burst') tunes.fx('slime', 1.2);
      else if (ev.e === 'flip') { tunes.fx('boo', 1.3); show('It\'s turning back!', 'warn', 1.2); for (const b of brooms) b.userData.shake = 1.4; }
      else if (ev.e === 'second') { tunes.fx('whistle'); show('A SECOND broom!', 'warn', 1.4); }
      else if (ev.e === 'swept') { ctx.sfx('hit'); ctx.actor(ev.pid)?.play('hit', 500); floatText(stage, ev.x, 2.1, ev.z, ev.lose ? `−${ev.lose}` : 'Whoosh!', 'bad'); if (ev.pid === ctx.me) { show(ev.lose ? `Swept up! −${ev.lose}` : 'Swept up!', 'bad', 0.9); juice.flash('rgba(160,90,255,.85)', 240); juice.shake(0.1, 0.25); navigator.vibrate?.(70); } }
      else if (ev.e === 'jump') { if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('jump', 600); }
    },
    pose(pid, fl) { flags.set(pid, fl); if (fl & F.FROZEN) return 'cheer'; if ((fl & F.STUN) && (fl & F.GHOST)) return 'hit'; if (fl & F.AIR) return 'jump'; return undefined; },
    frame(dt, tt) {
      frameCam(dt); juice.frame(dt, tt);
      const T = tNow(), A = armsAt(T), t = performance.now();
      brooms[1].visible = A.list.length > 1;
      A.list.forEach((a, i) => {
        const b = brooms[i], ud = b.userData; if (ud.shake > 0) ud.shake -= dt;
        b.rotation.y = a + (ud.shake > 0 || A.warn ? Math.sin(tt * 40) * 0.03 : 0);
        ud.trail.visible = A.w !== 0; ud.trail.position.x = A.w > 0 ? -0.8 : 0.8; ud.trail.rotation.y = A.w > 0 ? Math.PI : 0;
      });
      warnRing.material.opacity = (A.warn || fw) ? 0.4 + 0.4 * Math.abs(Math.sin(tt * 10)) : 0;
      hat.position.y = 3.2 + Math.sin(tt * 1.6) * 0.2; hat.rotation.y = tt * 0.6;
      // bubbles rise and pop
      for (let i = 0; i < NB; i++) { const k = (tt * 0.7 + i / NB) % 1, a = i * 2.4; m4.compose(v.set(Math.cos(a) * HUB * 0.5 * (1 - k * 0.3), brew.position.y + k * 0.6, Math.sin(a) * HUB * 0.5), q.identity(), sc.setScalar(0.6 + k)); bubbles.setMatrixAt(i, m4); }
      bubbles.instanceMatrix.needsUpdate = true;
      // the do-this-now line
      const eta = etaMe(A), mine = flags.get(ctx.me) || 0;
      if (ctx.me != null && !(mine & F.FROZEN)) {
        const jump = eta < 0.7 && !(mine & F.AIR) && !(mine & F.GHOST);
        now.textContent = jump ? 'JUMP! (A)' : 'Grab candy — jump the broom!'; now.classList.toggle('hot', jump);
      }
      // candy
      let ci = 0, li = 0;
      for (const [id, c] of candy) {
        const k = Math.min(1, (t - c.born) / (RULES.land * 1000 + 50));
        const x = c.fx + (c.x - c.fx) * k, z = c.fz + (c.z - c.fz) * k, y0 = c.fromPot ? 1.6 : 0.8, y = (1 - k) * y0 + Math.sin(k * Math.PI) * 1.4 + 0.2;
        if (c.kind) {
          if (li >= 16) continue;
          m4.compose(v.set(x, y + 0.42, z), q.setFromEuler(e3.set(-0.6, Math.sin(tt * 2 + id) * 0.4, 0)), sc.setScalar(1)); lolly.setMatrixAt(li, m4);
          m4.compose(v.set(x, y + 0.1, z), q.identity(), sc.setScalar(1)); sticks.setMatrixAt(li, m4); li++;
        } else {
          if (ci >= MC) continue;
          m4.compose(v.set(x, y, z), q.setFromEuler(e3.set(k < 1 ? tt * 8 : 0.3, id * 1.3, 0)), sc.setScalar(1)); corn.setMatrixAt(ci++, m4);
        }
      }
      for (let i = ci; i < MC; i++) corn.setMatrixAt(i, zero);
      for (let i = li; i < 16; i++) { lolly.setMatrixAt(i, zero); sticks.setMatrixAt(i, zero); }
      for (const m of [corn, lolly, sticks]) m.instanceMatrix.needsUpdate = true;
      // dizzy stars + blink while safe
      cq.copy(stage.camera.quaternion); let st = 0;
      for (const p of ctx.players) {
        const fl = flags.get(p.pid) || 0, a = ctx.actor(p.pid), pos = ctx.pos(p.pid);
        if (a) a.body.group.visible = !(fl & F.GHOST) || (fl & F.STUN) || Math.floor(tt * 10) % 2 === 0;
        if (pos && (fl & F.STUN) && (fl & F.GHOST)) for (let k = 0; k < 3 && st < stars.count; k++) { const an = tt * 5 + k * 2.1; m4.compose(v.set(pos.x + Math.cos(an) * 0.45, (a?.height || 1.6) + 0.25, pos.z + Math.sin(an) * 0.45), cq, sc.setScalar(1)); stars.setMatrixAt(st++, m4); }
      }
      for (let i = st; i < stars.count; i++) stars.setMatrixAt(i, zero);
      stars.instanceMatrix.needsUpdate = true;
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.className = 'ws-banner'; }
      void col;
    },
    dispose() {
      juice.dispose(); sbar.el.remove(); tunes.dispose(); now.remove(); banner.remove(); medals?.remove();
      for (const p of ctx.players) { const a = ctx.actor(p.pid); if (a) a.body.group.visible = true; }
      for (const t of texs) t.dispose(); for (const m of mats) m.dispose(); for (const g of geos) g.dispose();
    },
  };
}
