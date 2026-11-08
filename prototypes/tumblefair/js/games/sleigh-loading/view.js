// SLEIGH LOADING, as drawn: a trampled-snow yard inside a little wooden fence with strings of coloured bulbs, pines and
// snowmen outside and flakes coming down. A red wooden sleigh with curled gold runners waits in the middle of each
// player's side, trimmed and flagged in their seat colour; a glowing ring in front of it is where you load, and every
// present loaded is stacked on the sleigh (the pile grows). Presents fall with a shadow that grows as they come down:
// small red ones, big green ones, rare gold ones that sparkle. A carried present is held over your head. Solo: Twinkle
// the elf (orange sleigh, name tag) and her running score in a box under the score bar.
import { RULES } from './sim.js';
import { snowKit, WINTER } from '../sled-bash/snow-kit.js';
import { scoreBar, floatText, h, esc } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { createJuice } from '../../client/juice.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const SHAPE_CH = { circle: '●', square: '■', triangle: '▲', diamond: '◆' };
const KIND = [{ color: WINTER.red, ribbon: WINTER.gold, size: 0.5, name: 'small' }, { color: '#2f9e5a', ribbon: '#ffffff', size: 0.78, name: 'big' }, { color: WINTER.gold, ribbon: WINTER.red, size: 0.56, name: 'gold' }];
const PILE = 14, DROP_H = 7;
export function createView(ctx) {
  const { THREE, group, stage, arena: A, init } = ctx;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const kit = snowKit(ctx), { std, basic, geo } = kit;
  const tunes = createTunes({ volume: 0.22 }), juice = createJuice(ctx);
  kit.sky();

  // ---- ground, the yard, fence + bulbs, pines, snowmen, flakes
  kit.ground(90);
  const yard = new THREE.Mesh(geo(new THREE.PlaneGeometry(A.hw * 2, A.hd * 2).rotateX(-Math.PI / 2)), std(WINTER.shade, { roughness: 1 })); yard.position.y = 0.004; yard.receiveShadow = true; group.add(yard);
  const fp = [], STEP = 1.4;
  for (let x = -A.hw; x <= A.hw + 0.01; x += STEP) fp.push([x, -A.hd - 0.3], [x, A.hd + 0.3]);
  for (let z = -A.hd + STEP; z < A.hd - 0.01; z += STEP) fp.push([-A.hw - 0.3, z], [A.hw + 0.3, z]);
  const fence = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(0.16, 0.8, 0.16)), std('#8a5a32'), fp.length);
  fp.forEach(([x, z], i) => { m4.compose(v.set(x, 0.4, z), q.identity(), sc.setScalar(1)); fence.setMatrixAt(i, m4); }); fence.castShadow = true; group.add(fence);
  const capT = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.13, 6, 4)), kit.snowMat, fp.length);
  fp.forEach(([x, z], i) => { m4.compose(v.set(x, 0.82, z), q.identity(), sc.set(1, 0.6, 1)); capT.setMatrixAt(i, m4); }); group.add(capT);
  const bulbs = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.09, 6, 4)), basic({ color: '#ffffff' }), fp.length);
  fp.forEach(([x, z], i) => { m4.compose(v.set(x, 0.7, z), q.identity(), sc.setScalar(1)); bulbs.setMatrixAt(i, m4); bulbs.setColorAt(i, col.set(['#ff5f5f', '#ffd23f', '#8ff07a', '#39d0e0'][i % 4])); }); group.add(bulbs);
  const pines = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + 0.2, r = A.hw + 3.5 + (i * 1.3) % 3; pines.push([Math.sin(a) * r * 1.25, Math.cos(a) * r, 0.9 + (i % 3) * 0.3]); }
  kit.pines(pines);
  for (const [x, z, s] of [[-A.hw - 1.8, -A.hd - 1.2, 1], [A.hw + 1.8, A.hd + 1.0, 0.9]]) { const sm = kit.snowman(s); sm.position.set(x, 0, z); sm.rotation.y = Math.atan2(-x, -z); group.add(sm); }
  kit.snowfall({ hw: A.hw + 5, hd: A.hd + 5, count: 150 });

  // ---- sleighs: one per seat in use (the elf's is orange)
  const seatColor = id => id < 0 ? '#ff8a1f' : ctx.players.find(p => p.pid === id)?.color || '#ffffff';
  const wood = std('#c6303e', { roughness: 0.55 }), gold = std(WINTER.gold, { metalness: 0.6, roughness: 0.3 }), seatMat = std('#7a1f2a');
  const runnerGeo = geo(new THREE.TorusGeometry(0.4, 0.05, 6, 16, Math.PI * 1.2)), pileGeo = geo(new THREE.BoxGeometry(1, 1, 1));
  const sleighs = new Map();       // sleigh index -> { owner, pile, count, ring }
  for (const [idStr, si] of Object.entries(init.seats || {})) {
    const id = +idStr, S = init.sleighs[si], color = seatColor(id);
    const g = new THREE.Group(); g.position.set(S.x, 0, S.z); g.rotation.y = S.hw < S.hd ? Math.PI / 2 : 0; group.add(g);
    const trim = std(color, { roughness: 0.5 });
    const body = new THREE.Mesh(geo(new THREE.BoxGeometry(2.4, 0.55, 1.2)), wood); body.position.y = 0.55; body.castShadow = true; g.add(body);
    const back = new THREE.Mesh(geo(new THREE.BoxGeometry(0.25, 0.7, 1.2)), wood); back.position.set(-1.1, 1.0, 0); g.add(back);
    const curl = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2)), wood); curl.position.set(1.2, 0.62, 0); curl.rotation.z = -Math.PI / 2; g.add(curl);
    const band = new THREE.Mesh(geo(new THREE.BoxGeometry(2.44, 0.12, 1.24)), trim); band.position.y = 0.78; g.add(band);
    const seat = new THREE.Mesh(geo(new THREE.BoxGeometry(0.6, 0.12, 1.1)), seatMat); seat.position.set(-0.7, 0.85, 0); g.add(seat);
    for (const sz of [-0.5, 0.5]) {
      const rail = new THREE.Mesh(geo(new THREE.BoxGeometry(2.6, 0.06, 0.06)), gold); rail.position.set(0, 0.12, sz); g.add(rail);
      const r = new THREE.Mesh(runnerGeo, gold); r.position.set(1.3, 0.48, sz); r.rotation.z = -Math.PI * 0.6; g.add(r);
      for (const sx of [-0.8, 0.6]) { const st = new THREE.Mesh(geo(new THREE.BoxGeometry(0.06, 0.32, 0.06)), gold); st.position.set(sx, 0.28, sz); g.add(st); }
    }
    const pole = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5)), gold); pole.position.set(-1.1, 1.9, 0.45); g.add(pole);
    const p = ctx.players.find(x => x.pid === id);
    const flag = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.55, 0.38)), std(color, { side: THREE.DoubleSide })); flag.position.set(-0.82, 2.4, 0.45); g.add(flag);
    const pile = new THREE.InstancedMesh(pileGeo, std('#ffffff', { roughness: 0.55 }), PILE); pile.count = 0; pile.castShadow = true; g.add(pile);
    for (let k = 0; k < PILE; k++) { const row = Math.floor(k / 5), j = k % 5; m4.compose(v.set(-0.3 + (j % 3) * 0.48 - row * 0.1, 0.98 + row * 0.36 + (j >= 3 ? 0.36 : 0), (j % 2 ? 0.25 : -0.25) * (j >= 3 ? 0.5 : 1)), q.setFromEuler(e3.set(0, k * 0.7, 0)), sc.setScalar(0.32 + (k % 3) * 0.05)); pile.setMatrixAt(k, m4); pile.setColorAt(k, col.set([WINTER.red, '#2f9e5a', '#3d8bff', WINTER.gold, '#ff7ab8'][k % 5])); }
    const ring = new THREE.Mesh(geo(new THREE.RingGeometry(RULES.loadR - 0.35, RULES.loadR - 0.15, 32).rotateX(-Math.PI / 2)), basic({ color, transparent: true, opacity: 0.6, depthWrite: false }));
    ring.position.set(S.mx, 0.02, S.mz); group.add(ring);
    const mark = stage.tag(ring, { text: id < 0 ? '🧝 ' + (init.elf?.name || 'Elf') : (id === ctx.me ? 'Your sleigh' : (p?.name || '')) + ' ' + (SHAPE_CH[p?.shape] || ''), height: 0.2, cls: 'sl-tag', seat: p?.seat });
    sleighs.set(si, { owner: id, pile, count: 0, ring, tag: mark });
  }

  // ---- presents: every present on the field is drawn by five instanced meshes (box, two ribbon bands, two bow
  // loops) + one for the shadows and one for the gold sparkles, so twenty presents cost the same as one
  const MAXG = 20, gifts = new Map(), white = std('#ffffff', { roughness: 0.55 });
  const parts = [0, 1, 2, 3, 4].map(i => { const m = new THREE.InstancedMesh(i < 3 ? geo(new THREE.BoxGeometry(1, 1, 1)) : geo(new THREE.TorusGeometry(0.27, 0.1, 6, 12)), white, MAXG); m.count = 0; m.castShadow = i === 0; group.add(m); return m; });
  const shadows = new THREE.InstancedMesh(geo(new THREE.CircleGeometry(0.45, 18).rotateX(-Math.PI / 2)), basic({ color: '#2a4a6a', transparent: true, opacity: 0.3, depthWrite: false }), MAXG); shadows.count = 0; group.add(shadows);
  const sparks = new THREE.InstancedMesh(geo(new THREE.OctahedronGeometry(0.08, 0)), basic({ color: '#fff6c0' }), MAXG * 4); sparks.count = 0; group.add(sparks);
  const giftFor = (id, kind) => { let G = gifts.get(id); if (!G) { G = { kind, x: 0, z: 0, y: 0, tx: 0, tz: 0, held: 0, fall: 0, seen: false, yaw: (id * 1.7) % 6.28 }; gifts.set(id, G); } return G; };
  const e3b = new THREE.Euler(), qb = new THREE.Quaternion(), mb = new THREE.Matrix4(), s3 = new THREE.Vector3();
  function drawGifts(t) {
    let i = 0, sp = 0, sh = 0;
    for (const G of gifts.values()) {
      if (i >= MAXG) break;
      const K = KIND[G.kind] || KIND[0], s = K.size, yaw = G.held ? 0 : G.fall > 0 ? t * 3 + G.yaw : G.yaw;
      qb.setFromEuler(e3b.set(0, yaw, 0));
      const at = (dx, dy, dz) => v.set(dx, dy, dz).applyQuaternion(qb).add(sc.set(G.x, G.y, G.z));
      m4.compose(at(0, s / 2, 0), qb, s3.set(s, s, s)); parts[0].setMatrixAt(i, m4); parts[0].setColorAt(i, col.set(K.color));
      m4.compose(at(0, s / 2, 0), qb, s3.set(s * 1.03, s * 1.03, s * 0.18)); parts[1].setMatrixAt(i, m4); parts[1].setColorAt(i, col.set(K.ribbon));
      m4.compose(at(0, s / 2, 0), qb, s3.set(s * 0.18, s * 1.03, s * 1.03)); parts[2].setMatrixAt(i, m4); parts[2].setColorAt(i, col.set(K.ribbon));
      for (const [j, side] of [[3, -1], [4, 1]]) { mb.makeRotationFromEuler(e3b.set(0, yaw + Math.PI / 2, side * 0.5)); qb.setFromRotationMatrix(mb); m4.compose(at(side * s * 0.14, s + 0.06, 0), qb, s3.set(s / 0.6, s / 0.6, s / 0.6)); parts[j].setMatrixAt(i, m4); parts[j].setColorAt(i, col.set(K.ribbon)); qb.setFromEuler(e3b.set(0, yaw, 0)); }
      if (!G.held) { const k = G.fall > 0 ? 0.5 + 0.5 * (1 - G.fall / RULES.fall) : 1; m4.compose(v.set(G.x, 0.012, G.z), q.identity(), s3.set(k * s / 0.5, 1, k * s / 0.5)); shadows.setMatrixAt(sh++, m4); }
      if (G.kind === 2) for (let k = 0; k < 4; k++) { const a = t * 2 + k * Math.PI / 2; m4.compose(v.set(G.x + Math.cos(a) * 0.5, G.y + 0.35 + Math.sin(t * 3 + k) * 0.2, G.z + Math.sin(a) * 0.5), q.identity(), s3.set(1, 1, 1)); sparks.setMatrixAt(sp++, m4); }
      i++;
    }
    for (const m of parts) { m.count = i; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    shadows.count = sh; shadows.instanceMatrix.needsUpdate = true; sparks.count = sp; sparks.instanceMatrix.needsUpdate = true;
  }

  // ---- the elf (solo)
  let elf = null, elfAt = null, elfTo = null, elfScore = 0;
  const tags = [];
  if (init.elf) {
    const holder = new THREE.Group(); group.add(holder);
    elf = { holder, actor: null };
    tags.push(stage.tag(holder, { text: init.elf.name, height: 1.9, cls: 'sl-elf' }));
    ctx.createActor({ look: { race: 'elf', seed: 1225 } }).then(a => { if (!a) return; elf.actor = a; holder.add(a.group); a.place(0, 0, 0, 0); });
  }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'sl-pill'), banner = h('div', 'sl-banner'), elfBox = init.elf ? h('div', 'sl-elfbox') : null;
  ctx.ui.append(pill, banner); if (elfBox) ctx.ui.append(elfBox);
  let bannerT = 0, lastPill = '', started = false, carrying = new Map(), lastElf = '';
  function show(text, cls = '', ms = 1000) { banner.textContent = text; banner.className = 'sl-banner show ' + cls; bannerT = ms / 1000; }
  const nameOf = id => id < 0 ? (init.elf?.name || 'Elf') : id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';
  const posOf = id => id < 0 ? (elfAt ? { x: elfAt.x, z: elfAt.z } : null) : ctx.pos(id);
  const flagsOf = new Map();
  return {
    winter: false,          // dresses itself with snow-kit.js (no shared Winter Fair dressing on top)
    state(g) {
      bar.set(g.sc, g.left);
      const seen = new Set(); carrying = new Map();
      for (const [id, x, z, kind, held, fall] of g.gf) {
        const G = giftFor(id, kind); seen.add(id);
        if (!G.seen) { G.x = x; G.z = z; G.y = fall > 0 ? fall / RULES.fall * DROP_H : 0; G.seen = true; }
        G.tx = x; G.tz = z; G.held = held; G.fall = fall; if (held) carrying.set(held, kind);
      }
      for (const id of [...gifts.keys()]) if (!seen.has(id)) gifts.delete(id);
      for (const S of sleighs.values()) { const n = Math.min(PILE, g.ld?.[S.owner] || 0); if (n !== S.count) { S.count = n; S.pile.count = n; S.pile.instanceMatrix.needsUpdate = true; } }
      if (g.elf) { const to = { x: g.elf[0], z: g.elf[1], yaw: g.elf[2], flags: g.elf[3] }; if (!elfAt) elfAt = { ...to }; elfTo = to; elfScore = g.elf[4]; const s = `🧝 ${esc(init.elf.name)}: <b>${elfScore}</b>`; if (s !== lastElf) { lastElf = s; elfBox.innerHTML = s; } }
      const mine = ctx.me != null ? carrying.get(ctx.me) : undefined;
      const text = g.cd ? 'Get ready…' : g.left <= 0 ? 'Done!' : mine != null ? `Carry it to your sleigh! (${KIND[mine].name})` : ctx.btn('Grab a present — press A!');
      if (text !== lastPill) { lastPill = text; pill.innerHTML = `<i>🎁</i><span>${text}</span>`; pill.classList.toggle('carry', mine != null); }
      if (!started && !g.cd && g.left > 0) { started = true; tunes.start('jig'); }
    },
    event(ev) {
      if (ev.e === 'count') { show(String(ev.n), 'count', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('GO!', 'go', 900); ctx.sfx('good'); }
      else if (ev.e === 'drop') { tunes.fx('whistle', 1.5); }
      else if (ev.e === 'land') { kit.puff(ev.x, 0.2, ev.z, '#ffffff', 6, 0.5); tunes.fx('knock', 1.2); }
      else if (ev.e === 'bonk') { const p = posOf(ev.id); if (p) floatText(stage, p.x, 2.2, p.z, 'BONK!', 'bad'); ctx.sfx('hit'); if (ev.id === ctx.me) { juice.flash('rgba(255,90,90,.7)', 200); navigator.vibrate?.(60); } }
      else if (ev.e === 'grab') { ctx.sfx('pick'); }
      else if (ev.e === 'miss') { const p = posOf(ev.id); if (p) floatText(stage, p.x, 2, p.z, 'Get closer!', 'bad'); ctx.sfx('tap'); }
      else if (ev.e === 'tackle') { tunes.fx('whistle', 0.9); if (ev.id !== ctx.me) (ev.id < 0 ? elf?.actor : ctx.actor(ev.id))?.play?.('punch', 350); }
      else if (ev.e === 'shove') { ctx.sfx('hit'); floatText(stage, ev.x, 1.8, ev.z, ev.drop ? 'Dropped it!' : 'Oof!', ev.by === ctx.me ? 'good' : ''); if (ev.id === ctx.me) juice.flash('rgba(110,180,255,.8)', 200); juice.shake(0.06, 0.18); }
      else if (ev.e === 'spill') { tunes.fx('pop', 1.3); }
      else if (ev.e === 'load') {
        const S = init.sleighs[ev.sleigh]; ctx.sfx(ev.id === ctx.me ? 'coins' : 'tap'); tunes.fx('ding', ev.pts > 1 ? 1.3 : 1);
        floatText(stage, S.mx, 1.8, S.mz, `+${ev.pts}`, ev.id === ctx.me ? 'good' : '');
        kit.puff(S.mx, 0.8, S.mz, KIND[ev.kind === 'gold' ? 2 : ev.kind === 'big' ? 1 : 0].ribbon, 6, 0.5);
        if (ev.id === ctx.me && ev.kind === 'gold') show('GOLD! +3', 'go small', 900);
      } else if (ev.e === 'end') {
        tunes.stop(false); ctx.sfx('win');
        if (ev.elf != null) show(ev.beat ? 'You beat Twinkle!' : `${init.elf?.name || 'Elf'} wins!`, ev.beat ? 'go small' : 'small', 2000); else show('Time!', 'small', 1500);
      }
    },
    input(inp) { if ((inp.b & IN.B) && ctx.me != null && !carrying.has(ctx.me)) ctx.actor(ctx.me)?.play('punch', 350); },
    pose(pid, flags) { flagsOf.set(pid, flags); if (flags & F.STUN) return 'hit'; return undefined; },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      kit.frame(dt, t); juice.frame(dt, t);
      if (elf && elfTo) {
        const k = 1 - Math.exp(-dt * 14); elfAt.x += (elfTo.x - elfAt.x) * k; elfAt.z += (elfTo.z - elfAt.z) * k;
        const moving = Math.hypot(elfTo.x - elfAt.x, elfTo.z - elfAt.z) > 0.02;
        let d = elfTo.yaw - elfAt.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); elfAt.yaw += d * k;
        elf.holder.position.set(elfAt.x, 0, elfAt.z);
        if (elf.actor) { elf.actor.body.group.rotation.y = elfAt.yaw; elf.actor.setPose(elfTo.flags & F.STUN ? 'hit' : 'idle'); elf.actor.setSpeed(moving ? 4.2 : 0); elf.actor.update(dt); }
      }
      for (const G of gifts.values()) {
        if (G.held) {
          const p = posOf(G.held); if (p) { G.x = p.x; G.z = p.z; }
          G.y = 1.55 + Math.sin(t * 8) * 0.04;
        } else {
          const k = Math.min(1, dt * 12); G.x += (G.tx - G.x) * k; G.z += (G.tz - G.z) * k;
          const want = G.fall > 0 ? (G.fall / RULES.fall) * DROP_H : 0; G.y += (want - G.y) * Math.min(1, dt * 18);
        }
      }
      drawGifts(t);
      for (const S of sleighs.values()) S.ring.material.opacity = 0.45 + 0.2 * Math.sin(t * 4 + S.owner);
    },
    dispose() {
      tunes.dispose(); juice.dispose(); bar.el.remove(); pill.remove(); banner.remove(); elfBox?.remove();
      for (const t2 of tags) t2.remove(); for (const S of sleighs.values()) S.tag?.remove?.();
      kit.dispose();
    },
  };
}
