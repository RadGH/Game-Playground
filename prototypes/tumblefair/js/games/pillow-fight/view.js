// PILLOW FIGHT, as drawn: a cosy bedroom at night-light time. One enormous bed fills the middle — a patchwork quilt
// (the play area) on a thick mattress, a tall wooden headboard with heart cut-outs at the back, fat decorative
// pillows along it, stubby legs — high above a plank floor with a round rug, toy blocks, a teddy and a lamp. Every
// player holds a puffy pillow in their seat colour (on the hand bone, so it swings with the arm). A bop bursts a
// cloud of white feathers (one instanced pool) that flutter down. Each player's WOBBLE % floats over their head,
// going from white to orange to red. Fallers drop onto the rug and climb back. Solo: sleepwalkers in nightcaps
// (Chibi characters in the Sleepyhead costume) shuffle at you with a "Zzz" over their heads.
import { RULES, FLOOR_Y } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, init, meta } = ctx;
  const { hw, hd } = meta.arena, HW = ctx.season === 'halloween';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const box = (w, hh, d, mat, x, y, z, parent = group) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  // ---- the room: plank floor, rug, back walls with a window
  const planks = canvasTexture(256, 256, (c, w) => { for (let i = 0; i < 8; i++) { c.fillStyle = ['#b9824f', '#c48c57', '#ad7646', '#bf8952'][i % 4]; c.fillRect(0, i * 32, w, 32); c.fillStyle = 'rgba(70,40,20,.35)'; c.fillRect(0, i * 32, w, 2); c.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32); } });
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping; planks.repeat.set(6, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), std('#ffffff', { map: planks })); floor.position.y = FLOOR_Y; floor.receiveShadow = true; group.add(floor);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(hw + 3.2, 48).rotateX(-Math.PI / 2), std(HW ? '#6a3f9a' : '#5aa6d6')); rug.position.y = FLOOR_Y + 0.01; rug.scale.z = 0.8; rug.receiveShadow = true; group.add(rug);
  const rugRing = new THREE.Mesh(new THREE.RingGeometry(hw + 2.4, hw + 2.8, 48).rotateX(-Math.PI / 2), std(HW ? '#ff8a1a' : '#ffd23f')); rugRing.position.y = FLOOR_Y + 0.02; rugRing.scale.z = 0.8; group.add(rugRing);
  const wallMat = std(HW ? '#4a3a6e' : '#f6d7c3');
  box(40, 9, 0.3, wallMat, 0, FLOOR_Y + 4.5, -hd - 3.4);
  const win = box(3.4, 2.4, 0.1, new THREE.MeshBasicMaterial({ color: HW ? '#2a1b4a' : '#22305e' }), 6.5, 2.6, -hd - 3.2);
  box(3.6, 0.15, 0.2, std('#ffffff'), 6.5, 1.35, -hd - 3.15); box(0.12, 2.4, 0.15, std('#ffffff'), 6.5, 2.6, -hd - 3.12);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: '#fff4c4' })); moon.position.set(7.4, 3.2, -hd - 3.1); group.add(moon); void win;
  // ---- the bed: mattress, quilt, headboard, pillows, legs
  const BW = hw + 0.25, BD = hd + 0.25;
  box(BW * 2, -FLOOR_Y - 0.35, BD * 2, std('#fbf6ee'), 0, (FLOOR_Y - 0.35) / 2 + 0.0, 0);
  const quilt = canvasTexture(512, 360, (c, w, hh) => {
    const cols = HW ? ['#ff9a3a', '#8a55d6', '#ffd36b', '#6dcf6a', '#d65aa8', '#4a3a6e'] : ['#ff8fb1', '#8fd3ff', '#ffe17a', '#a8e6a1', '#c7a6ff', '#ffb98a'];
    const n = 8, m = 6, cw = w / n, ch = hh / m;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { c.fillStyle = cols[(i * 2 + j * 3) % cols.length]; c.fillRect(i * cw, j * ch, cw, ch); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(i * cw + cw / 2, j * ch + ch / 2, cw * 0.18, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.setLineDash([6, 6]); c.lineWidth = 3;
    for (let i = 1; i < n; i++) { c.beginPath(); c.moveTo(i * cw, 0); c.lineTo(i * cw, hh); c.stroke(); }
    for (let j = 1; j < m; j++) { c.beginPath(); c.moveTo(0, j * ch); c.lineTo(w, j * ch); c.stroke(); }
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(BW * 2 + 0.1, 0.36, BD * 2 + 0.1), [std('#e9e2ff'), std('#e9e2ff'), std('#ffffff', { map: quilt }), std('#e9e2ff'), std('#e9e2ff'), std('#e9e2ff')]);
  top.position.y = -0.18; top.receiveShadow = true; group.add(top);
  // the quilt hangs over the front and sides a little: a soft band (a visible edge = where you fall)
  const hem = new THREE.Mesh(new THREE.BoxGeometry(BW * 2 + 0.2, 0.5, BD * 2 + 0.2), std(HW ? '#8a55d6' : '#ff8fb1')); hem.position.y = -0.55; group.add(hem);
  const wood = std(HW ? '#5b3a2a' : '#a0663c');
  const head = box(BW * 2 + 0.4, 3.6, 0.35, wood, 0, FLOOR_Y + 1.8 + 0.9, -BD - 0.2);
  const heartShape = new THREE.Shape(); heartShape.moveTo(0, -0.35); heartShape.bezierCurveTo(-0.5, 0, -0.35, 0.4, 0, 0.18); heartShape.bezierCurveTo(0.35, 0.4, 0.5, 0, 0, -0.35);
  const heartGeo = new THREE.ShapeGeometry(heartShape); const heartMat = new THREE.MeshBasicMaterial({ color: HW ? '#ff8a1a' : '#ff5a8a' });
  for (const x of [-4, 0, 4]) { const ht = new THREE.Mesh(heartGeo, heartMat); ht.position.set(x, 2.2, -BD - 0.01); ht.scale.setScalar(1.3); group.add(ht); }
  const pillowGeo = new THREE.SphereGeometry(1, 16, 10); pillowGeo.scale(1.25, 0.45, 0.7);
  [[-3.6, '#ffffff'], [-1.2, '#ffe17a'], [1.2, '#8fd3ff'], [3.6, '#ffffff']].forEach(([x, cl]) => { const p = new THREE.Mesh(pillowGeo, std(cl)); p.position.set(x, 0.35, -BD + 0.15); p.rotation.x = -0.5; p.scale.setScalar(0.85); p.castShadow = true; group.add(p); });
  for (const [x, z] of [[-BW + 0.3, -BD + 0.3], [BW - 0.3, -BD + 0.3], [-BW + 0.3, BD - 0.3], [BW - 0.3, BD - 0.3]]) box(0.5, 0.5, 0.5, wood, x, FLOOR_Y + 0.25, z);
  // toys on the floor: blocks, a teddy, a lamp
  const blockCols = ['#ff5a5a', '#ffd23f', '#3d8bff', '#3ecf5a'];
  [[-hw - 1.8, 1.2], [-hw - 2.2, 2.4], [hw + 2.0, 2.2], [hw + 1.6, -1.0], [-hw - 1.6, -2.2]].forEach(([x, z], i) => box(0.7, 0.7, 0.7, std(blockCols[i % 4]), x, FLOOR_Y + 0.35, z).rotation.y = i * 0.6);
  const teddy = new THREE.Group(); teddy.position.set(hw + 2.2, FLOOR_Y, 0.6); group.add(teddy);
  const fur = std(HW ? '#9a7ab8' : '#b07a4a');
  [[0, 0.55, 0, 0.55], [0, 1.25, 0, 0.42], [-0.32, 1.55, 0, 0.14], [0.32, 1.55, 0, 0.14], [-0.5, 0.75, 0.1, 0.2], [0.5, 0.75, 0.1, 0.2], [-0.3, 0.15, 0.25, 0.2], [0.3, 0.15, 0.25, 0.2]].forEach(([x, y, z, r]) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), fur); s.position.set(x, y, z); s.castShadow = true; teddy.add(s); });
  teddy.rotation.y = -0.8;
  const lamp = new THREE.Group(); lamp.position.set(-hw - 2.4, FLOOR_Y, -BD - 1.4); group.add(lamp);
  box(1.0, 1.4, 1.0, wood, 0, 0.7, 0, lamp);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 0.8, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#fff0c8', emissive: '#ffcf6b', emissiveIntensity: 0.9, side: THREE.DoubleSide })); shade.position.y = 2.3; lamp.add(shade);
  box(0.08, 0.8, 0.08, std('#888'), 0, 1.8, 0, lamp);

  // ---- a pillow in every player's hand (attached when their character exists)
  const holdGeo = new THREE.SphereGeometry(1, 12, 8); holdGeo.scale(0.36, 0.16, 0.26);
  const held = new Map();
  function attach() {
    for (const p of ctx.players) {
      if (held.has(p.pid)) continue;
      const a = ctx.actor(p.pid); if (!a) continue;
      const pil = new THREE.Mesh(holdGeo, std(new THREE.Color(p.color).lerp(new THREE.Color('#ffffff'), 0.45))); pil.castShadow = true;
      const hand = a.body?.parts?.handR;
      if (hand) { pil.position.set(0, -0.12, 0.18); hand.add(pil); } else { pil.position.set(0.35, 0.9, 0.3); a.body.group.add(pil); }
      held.set(p.pid, pil);
      const tg = stage.tag(a.group, { text: '0%', height: 0, cls: 'pf-wob' }); wobTags.set(p.pid, tg);
    }
  }
  const wobTags = new Map();
  // ---- feathers: one instanced pool
  const FN = 160, feathers = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.34), new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 1 }), FN);
  feathers.frustumCulled = false; group.add(feathers);
  const fd = Array.from({ length: FN }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ph: 0 })); let fi = 0;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < FN; i++) feathers.setMatrixAt(i, zero);
  function burst(x, z, y = 1.1, n = 14) { for (let k = 0; k < n; k++) { const f = fd[fi = (fi + 1) % FN], a = k / n * Math.PI * 2 + fi; Object.assign(f, { life: 1.6 + (k % 4) * 0.2, x, y, z, vx: Math.cos(a) * (1.5 + (k % 3)), vy: 2 + (k % 3) * 0.8, vz: Math.sin(a) * (1.5 + (k % 3)), ph: k * 1.7 }); } }

  // ---- solo: sleepwalkers
  const sleepers = new Map(), LOOKS = [{ race: 'halfling', seed: 3101 }, { race: 'dwarf', seed: 3102 }, { race: 'human', seed: 3103 }, { race: 'elf', seed: 3104 }];
  function sleeper(id, x, z, y, yaw) {
    if (sleepers.has(id)) return sleepers.get(id);
    const S = { a: null, x, z, y, yaw, tx: x, tz: z, ty: y, tyaw: yaw, wob: 0, stun: 0, tag: null, wtag: null, dead: false };
    sleepers.set(id, S);
    ctx.createActor({ look: LOOKS[id % LOOKS.length], costume: 'cos_sleepy' }, { scale: 0.92 }).then(a => {
      if (!a) return; if (S.dead) { a.dispose(); return; }
      S.a = a; a.place(S.x, S.y, S.z, S.yaw);
      S.tag = stage.tag(a.group, { text: 'Zzz', height: a.height + 0.3, cls: 'pf-zzz' });
      S.wtag = stage.tag(a.group, { text: '0%', height: 0, cls: 'pf-wob' });
    });
    return S;
  }
  function dropSleeper(id) { const S = sleepers.get(id); if (!S) return; S.dead = true; S.tag?.remove(); S.wtag?.remove(); S.a?.dispose(); sleepers.delete(id); }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const banner = h('div', 'pf-banner'); ctx.ui.append(banner); let bannerT = 0;
  const show = (text, cls = '', s = 1.2) => { banner.textContent = text; banner.className = 'pf-banner show ' + cls; bannerT = s; };
  const tip = h('div', 'pf-tip', init.solo ? '🛏 Bop the sleepwalkers off the bed!' : '🛏 Bop everyone off the bed!'); ctx.ui.append(tip); setTimeout(() => tip.classList.add('gone'), 4500);
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  const hopUntil = new Map(); let prevB = 0, prevS = -9;
  const wobClass = w => (w >= 80 ? 'hot' : w >= 40 ? 'warm' : '');
  function setWob(tg, w) { if (!tg) return; const t = w + '%'; if (tg._t !== t) { tg._t = t; tg.set(t); tg.el.className = 'tag pf-wob ' + wobClass(w); } }
  attach();
  return {
    halloween: { y: FLOOR_Y },
    state(g) {
      bar.set(g.sc, g.left);
      for (const [pid, w] of Object.entries(g.wb)) setWob(wobTags.get(+pid), w);
      if (g.sl) {
        const seen = new Set();
        for (const [id, x, z, y, yaw, wob, stun] of g.sl) { seen.add(id); const S = sleeper(id, x, z, y, yaw); S.tx = x; S.tz = z; S.ty = y; S.tyaw = yaw; S.wob = wob; S.stun = stun; setWob(S.wtag, wob); }
        for (const id of [...sleepers.keys()]) if (!seen.has(id)) dropSleeper(id);
      }
    },
    input(inp) {
      const fresh = (bit) => (inp.b & bit) && (!(prevB & bit) || inp.s !== prevS + 1);
      if (fresh(IN.A)) ctx.actor(ctx.me)?.play('attack', 380);
      if (fresh(IN.B)) { ctx.actor(ctx.me)?.play('jump', 300); hopUntil.set(ctx.me, performance.now() + 300); }
      prevB = inp.b; prevS = inp.s;
    },
    event(ev) {
      if (ev.e === 'bop') {
        if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('attack', 380);
        burst(ev.x, ev.z, 1.1, 10 + Math.min(14, Math.round(ev.wob / 8))); ctx.sfx('hit');
        if (ev.to != null) ctx.actor(ev.to)?.play('hit', 400);
        if (ev.to === ctx.me && ev.wob >= 60) show(`Wobbly! ${ev.wob}%`, 'bad', 0.8);
      } else if (ev.e === 'swing') { if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('attack', 380); }
      else if (ev.e === 'hop') { if (ev.pid !== ctx.me) { ctx.actor(ev.pid)?.play('jump', 300); hopUntil.set(ev.pid, performance.now() + 300); } ctx.sfx('throw'); }
      else if (ev.e === 'bump') { burst(ev.x, ev.z, 1.0, 6); ctx.sfx('hit'); }
      else if (ev.e === 'fall') {
        ctx.sfx('out'); burst(ev.x, ev.z, 0.2, 18);
        const cx = Math.max(-hw, Math.min(hw, ev.x)), cz = Math.max(-hd, Math.min(hd, ev.z));
        floatText(stage, cx, 0.6, cz, ev.by >= 0 ? `+1 ${nameOf(ev.by)}` : `${nameOf(ev.pid)} fell!`, ev.by === ctx.me ? 'good' : ev.pid === ctx.me ? 'bad' : '');
        if (ev.pid === ctx.me) show('Off the bed! −1', 'bad'); else if (ev.by === ctx.me) show('Knock-off! +1', 'good');
      } else if (ev.e === 'drop') { ctx.sfx('good'); burst(ev.x, ev.z, 0.2, 16); floatText(stage, Math.max(-hw, Math.min(hw, ev.x)), 0.6, Math.max(-hd, Math.min(hd, ev.z)), '+1', 'good'); }
      else if (ev.e === 'climb') ctx.sfx('tap');
      else if (ev.e === 'back') { if (ev.pid === ctx.me) ctx.sfx('pick'); }
    },
    pose(pid, flags, b) {
      if (b.y < -0.05) return b.y <= FLOOR_Y + 0.05 ? 'sitGround' : 'hit';
      if ((hopUntil.get(pid) || 0) > performance.now()) return 'jump';
      if (flags & F.STUN) return 'hit';
      return undefined;
    },
    frame(dt, t) {
      if (held.size < ctx.players.length) attach();
      // sleepwalkers glide to where the server says
      const k = 1 - Math.exp(-dt * 12);
      for (const S of sleepers.values()) {
        S.x += (S.tx - S.x) * k; S.z += (S.tz - S.z) * k; S.y += (S.ty - S.y) * k;
        let d = S.tyaw - S.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); S.yaw += d * k;
        if (!S.a) continue;
        S.a.place(S.x, S.y, S.z, S.yaw); S.a.setPose(S.stun ? 'hit' : S.ty < -0.05 ? 'hit' : 'walk'); S.a.setSpeed(S.stun ? 0 : 1.6); S.a.update(dt);
        if (S.tag) S.tag.el.style.opacity = 0.6 + 0.4 * Math.sin(t * 3 + S.x);
      }
      // feathers flutter down
      let live = false;
      for (let i = 0; i < FN; i++) {
        const f = fd[i]; if (f.life <= 0) continue; live = true;
        f.life -= dt; f.vy = Math.max(-0.9, f.vy - 6 * dt); f.vx *= 1 - 1.8 * dt; f.vz *= 1 - 1.8 * dt;
        f.x += (f.vx + Math.sin(t * 4 + f.ph) * 0.6) * dt; f.y = Math.max(FLOOR_Y + 0.02, f.y + f.vy * dt); f.z += f.vz * dt;
        if (Math.abs(f.x) < hw + 0.3 && Math.abs(f.z) < hd + 0.3 && f.y < 0.02) f.y = 0.02;
        if (f.life <= 0) { feathers.setMatrixAt(i, zero); continue; }
        m4.compose(v.set(f.x, f.y, f.z), q.setFromEuler(e3.set(Math.sin(t * 5 + f.ph) * 0.8, f.ph, Math.cos(t * 3 + f.ph) * 0.8)), sc.setScalar(Math.min(1, f.life * 2)));
        feathers.setMatrixAt(i, m4);
      }
      if (live) feathers.instanceMatrix.needsUpdate = true;
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.className = 'pf-banner'; }
      void head;
    },
    dispose() { bar.el.remove(); for (const tg of wobTags.values()) tg.remove(); for (const id of [...sleepers.keys()]) dropSleeper(id); planks.dispose(); quilt.dispose(); },
  };
}
