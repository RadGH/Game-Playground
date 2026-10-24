// NIGHT OF THE SHAMBLERS, as drawn: the fairground after closing — dark-blue grass inside a fence of warm string
// lights, a sandy ring path, a dark ticket booth and a carousel roof outside. Shamblers are chunky toys: a pale-green
// round head with sleepy droopy eyes and a big silly smile (no teeth), a paper party hat with a pom-pom, a crumpled
// party shirt, arms stuck out in front for a hug, and a waddle. A bonked one wobbles back; a flopped one tips over and
// sinks into the grass. Big Shamblers are half again as big, in a bow tie. Barricades are three planks between two
// posts that tilt and lose planks as they are chewed. Each player holds a foam bat (their seat colour) that swings on A.
// A downed player lies on the grass under a ring that fills while a friend stands by. Halloween: pumpkin-headed
// Shamblers in witch hats and candy-corn barricades (the arena dressing adds the dusk, bats and ghosts).
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { createJuice } from '../../client/juice.js';
import { pumpkinGeo, stemGeo, witchHatGeo } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, init, arena, me } = ctx, HW = ctx.season === 'halloween', W = arena.hw, D = arena.hd;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const nameOf = pid => (pid === me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  const seatOf = pid => ctx.players.find(p => p.pid === pid);
  // ---- the fairground at night
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 40, D * 2 + 40).rotateX(-Math.PI / 2), std(HW ? '#20283e' : '#25423a')); grass.receiveShadow = true; group.add(grass);
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(-Math.PI / 2), std(HW ? '#3a4668' : '#2f5a46')); yard.position.y = 0.005; yard.receiveShadow = true; group.add(yard);
  const path = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.4, 48).rotateX(-Math.PI / 2), std(HW ? '#46405a' : '#a8916a')); path.position.y = 0.012; group.add(path);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  const posts = [], bulbs = [];
  for (let x = -W; x <= W + 0.01; x += 2.25) posts.push([x, -D - 0.3], [x, D + 0.3]);
  for (let z = -D + 2.33; z < D - 0.1; z += 2.33) posts.push([-W - 0.3, z], [W + 0.3, z]);
  const postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), std('#4a3828'), posts.length);
  posts.forEach(([x, z], i) => { postMesh.setMatrixAt(i, m4.makeTranslation(x, 0.8, z)); bulbs.push([x, 1.62, z]); }); group.add(postMesh);
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), bulbs.length);
  const BC = HW ? ['#ff8a1a', '#b57bff', '#7dff5a'] : ['#ffd36b', '#ff7aa8', '#7ad7ff'];
  bulbs.forEach(([x, y, z], i) => { bulbMesh.setMatrixAt(i, m4.makeTranslation(x, y, z)); bulbMesh.setColorAt(i, col.set(BC[i % BC.length])); }); group.add(bulbMesh);
  const booth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 1.6), std(HW ? '#3a2a5a' : '#c94a4a')); booth.position.set(-W - 3, 1.1, -D - 1); group.add(booth);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 12), std(HW ? '#ff8a1a' : '#f4ecd8')); roof.position.set(W + 3.5, 3.2, -D - 2.5); group.add(roof);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8), std('#d9b25a')); pole.position.set(W + 3.5, 1.5, -D - 2.5); group.add(pole);
  // ---- Shamblers: shared geometry + materials, one small group each
  const skin = std(HW ? '#ff7a14' : '#a8d88a'), shirts = (HW ? ['#3a2a5a', '#5a2a7a', '#2a3a2a'] : ['#e86a8a', '#6a8aff', '#ffc94a', '#8ad6c8']).map(c => std(c)), pants = std(HW ? '#1a1a2a' : '#5a4a7a');
  const hats = (HW ? ['#2a1238'] : ['#ff4f5e', '#4fa8ff', '#ffd23f', '#4fdc6a']).map(c => std(c)), white = std('#ffffff'), ink = std('#1a1a22'), cheek = std('#ff9aa8');
  const G = {
    head: HW ? pumpkinGeo(THREE, 0.34) : new THREE.SphereGeometry(0.34, 16, 12), stem: stemGeo(THREE, 0.34),
    body: new THREE.CylinderGeometry(0.3, 0.36, 0.62, 12), leg: new THREE.CylinderGeometry(0.1, 0.1, 0.42, 8), arm: new THREE.BoxGeometry(0.13, 0.13, 0.55),
    eye: new THREE.SphereGeometry(0.075, 10, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), pupil: new THREE.SphereGeometry(0.035, 8, 6),
    smile: new THREE.TorusGeometry(0.13, 0.025, 6, 14, Math.PI), hat: HW ? witchHatGeo(THREE, 0.26) : new THREE.ConeGeometry(0.15, 0.36, 12), pom: new THREE.SphereGeometry(0.06, 8, 6),
    bow: new THREE.BoxGeometry(0.3, 0.1, 0.06), cheek: new THREE.SphereGeometry(0.045, 6, 4),
  };
  function buildShambler(kind, id) {
    const root = new THREE.Group(), g = new THREE.Group(); root.add(g);
    const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const legL = add(G.leg, pants, -0.13, 0.21, 0), legR = add(G.leg, pants, 0.13, 0.21, 0);
    add(G.body, shirts[id % shirts.length], 0, 0.72, 0);
    const armL = add(G.arm, skin, -0.32, 0.88, 0.25), armR = add(G.arm, skin, 0.32, 0.88, 0.25);
    const head = new THREE.Group(); head.position.set(0, 1.32, 0); g.add(head);
    add(G.head, skin, 0, 0, 0, head);
    if (HW) add(G.stem, ink, 0, 0, 0, head);
    for (const s of [-1, 1]) {
      const e = add(G.eye, white, s * 0.12, 0.05, 0.29, head); e.rotation.x = -0.4;            // droopy: the top of the eye is cut off
      add(G.pupil, ink, s * 0.12, 0.02, 0.355, head); add(G.cheek, cheek, s * 0.22, -0.08, 0.27, head);
    }
    const sm = add(G.smile, ink, 0, -0.1, 0.31, head); sm.rotation.z = Math.PI;
    const hat = add(G.hat, hats[id % hats.length], 0.05, HW ? 0.26 : 0.42, 0, head); hat.rotation.z = -0.25;
    if (!HW) add(G.pom, white, 0.1, 0.61, 0, head);
    if (kind === 1) { add(G.bow, hats[(id + 1) % hats.length], 0, 1.06, 0.33); root.scale.setScalar(1.45); }
    group.add(root);
    return { root, g, legL, legR, armL, armR, head, x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0, st: 0, sink: 0, ph: id * 1.7, k: kind };
  }
  const shamblers = new Map();
  // ---- barricades
  const plankMats = HW ? [std('#ffd23f'), std('#ff8a1a'), std('#fff6e0')] : [std('#c9925a'), std('#b07a44'), std('#d9a86a')];
  const postMat = std(HW ? '#2a1238' : '#6a4426'), plankGeo = new THREE.BoxGeometry(1.7, 0.2, 0.1), postGeo = new THREE.BoxGeometry(0.16, 1.0, 0.16);
  function buildBar(o) {
    const g = new THREE.Group(); g.position.set(o[1], 0, o[2]); g.rotation.y = o[3];
    const planks = [0.25, 0.5, 0.75].map((y, i) => { const p = new THREE.Mesh(plankGeo, plankMats[i]); p.position.y = y; p.castShadow = true; g.add(p); return p; });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(postGeo, postMat); p.position.set(s * 0.8, 0.5, 0); p.castShadow = true; g.add(p); }
    group.add(g); return { g, planks, hp: 9 };
  }
  const barsDrawn = new Map();
  // ---- bats, swings, downed rings
  const bats = new Map(), batGeo = new THREE.CylinderGeometry(0.09, 0.05, 0.75, 8).translate(0, 0.37, 0);
  const swingT = new Map();
  function batOf(pid) {
    if (bats.has(pid)) return bats.get(pid);
    const a = ctx.actor(pid); if (!a) return null;
    const p = seatOf(pid), m = new THREE.Mesh(batGeo, std(HW ? '#ff8a1a' : p?.color || '#ffd23f', { roughness: 1 })); m.castShadow = true;
    const hold = new THREE.Group(); hold.position.set(0.32, 0.95, 0.15); hold.add(m); m.rotation.x = 0.5; a.body.group.add(hold);
    bats.set(pid, { hold, m }); return bats.get(pid);
  }
  const ringGeo = new THREE.RingGeometry(0.75, 0.95, 32, 1).rotateX(-Math.PI / 2), ringBack = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false });
  const downs = new Map();
  function downMark(pid) {
    if (downs.has(pid)) return downs.get(pid);
    const g = new THREE.Group(), back = new THREE.Mesh(ringGeo, ringBack), fill = new THREE.Mesh(ringGeo.clone(), new THREE.MeshBasicMaterial({ color: seatOf(pid)?.color || '#7dff9a', toneMapped: false, depthWrite: false }));
    back.position.y = 0.03; fill.position.y = 0.035; g.add(back, fill); group.add(g);
    const tag = stage.tag(g, { text: pid === me ? 'DOWN! Wait for a friend…' : `Help ${nameOf(pid)} up!`, height: 1.2, cls: 'zs-help' });
    const M = { g, fill, tag }; downs.set(pid, M); return M;
  }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'points' });
  const pill = h('div', 'zs-pill'); ctx.ui.append(pill);
  const banner = h('div', 'zs-banner'); ctx.ui.append(banner); let bannerT = 0;
  const show = (text, cls = '', s = 1.6) => { banner.textContent = text; banner.className = 'zs-banner show ' + cls; bannerT = s; };
  const juice = createJuice(ctx);
  let last = null, prevB = 0, prevS = -9, sky = 0;
  return {
    halloween: { y: 0, mist: true, spots: [[-W - 1.4, 0, -D + 1], [W + 1.4, 0, -D + 1], [-W - 1.4, 0, D - 1], [W + 1.4, 0, D - 1]] },
    start() { show(init.solo ? 'Last until sunrise!' : 'Stick together — last until sunrise!', '', 2.2); },
    state(g) {
      last = g; bar.set(g.sc, g.left);
      const downSet = new Set(g.dn.map(d => d[0]));
      for (const p of ctx.players) bar.mark(p.pid, 'out', downSet.has(p.pid));
      const mine = me != null ? g.bc[me] : null, meDown = downSet.has(me);
      const word = meDown ? (init.solo ? `💤 Down! Getting up… (${g.lv} left)` : '💤 You are DOWN — a friend can pick you up') : `🌙 Sunrise in ${g.left}s · Wave ${g.w + 1}${mine != null ? ` · fences ×${mine}` : ''}${init.solo ? ` · ❤×${g.lv}` : ''}`;
      if (pill.textContent !== word) pill.textContent = word;
      pill.className = 'zs-pill' + (meDown ? ' down' : '');
      // Shamblers
      const seen = new Set();
      for (const [id, kind, x, z, yaw, st] of g.z) {
        seen.add(id); let S = shamblers.get(id);
        if (!S) { S = buildShambler(kind, id); S.x = S.tx = x; S.z = S.tz = z; S.yaw = S.tyaw = yaw; shamblers.set(id, S); }
        S.tx = x; S.tz = z; S.tyaw = yaw; S.st = st;
      }
      for (const [id, S] of shamblers) if (!seen.has(id)) { S.root.removeFromParent(); shamblers.delete(id); }
      // barricades
      const bs = new Set();
      for (const o of g.br) {
        bs.add(o[0]); let B = barsDrawn.get(o[0]); if (!B) { B = buildBar(o); barsDrawn.set(o[0], B); }
        B.hp = o[4]; B.planks[2].visible = o[4] > 6; B.planks[1].visible = o[4] > 3; B.g.rotation.z = (9 - o[4]) * 0.025;
      }
      for (const [id, B] of barsDrawn) if (!bs.has(id)) { B.g.removeFromParent(); barsDrawn.delete(id); }
      // downed players
      for (const [pid, prog] of g.dn) {
        const M = downMark(pid), p = ctx.pos(pid); if (p) M.g.position.set(p.x, 0, p.z);
        M.g.visible = true; M.fill.geometry.setDrawRange(0, 6 * Math.round(32 * prog / 9));
      }
      for (const [pid, M] of downs) if (!downSet.has(pid)) M.g.visible = false;
    },
    input(inp) {
      const fresh = !(prevB & IN.A) || inp.s !== prevS + 1; prevB = inp.b; prevS = inp.s;
      if ((inp.b & IN.A) && fresh && last && !last.dn.some(d => d[0] === me)) { ctx.actor(me)?.play('throw', 300); swingT.set(me, 0.3); }
    },
    event(ev) {
      if (ev.e === 'swing') { if (ev.pid !== me) { ctx.actor(ev.pid)?.play('throw', 300); swingT.set(ev.pid, 0.3); } if (ev.hit.length) { ctx.sfx('hit'); if (ev.pid === me) juice.shake(0.05, 0.12); } else if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'flop') { const S = shamblers.get(ev.id); floatText(stage, ev.x, 1.6, ev.z, ev.big ? 'BIG FLOP! +2' : 'Flop! +1', ev.pid === me ? 'good' : ''); ctx.sfx('splat'); if (S) S.flopAt = 0; }
      else if (ev.e === 'down') { ctx.sfx('out'); floatText(stage, ev.x, 1.6, ev.z, ev.pid === me ? 'Hugged! You are down' : `${nameOf(ev.pid)} got hugged!`, 'bad'); if (ev.pid === me) { juice.flash('#7dff9a', 420); show('HUGGED!', 'bad', 1.4); } }
      else if (ev.e === 'up') { ctx.sfx('good'); if (ev.pid === me) show(ev.by != null ? `${nameOf(ev.by)} picked you up!` : 'Back on your feet!', 'good', 1.6); else if (ev.by === me) { show(`You picked up ${nameOf(ev.pid)}! +3`, 'good', 1.5); juice.flash('#ffd23f', 200); } }
      else if (ev.e === 'bar') { ctx.sfx('pick'); }
      else if (ev.e === 'hug') { if (ev.pid === me) { juice.flash('#7dff9a', 160); show('HUG! Bonk it or run!', 'warn small', 0.8); ctx.sfx('bad'); } }
      else if (ev.e === 'nobar') { ctx.sfx('bad'); show(last && me != null && last.bc[me] === 0 ? 'No fences left (one every 15 s)' : 'No room for a fence here', 'small', 1.1); }
      else if (ev.e === 'barbreak') { ctx.sfx('trap'); floatText(stage, ev.x, 1, ev.z, 'Crunch!', ''); }
      else if (ev.e === 'wave') { show(ev.w >= 3 ? 'Last wave — hold on!' : `Here come more! (wave ${ev.w + 1})`, 'warn', 1.8); ctx.sfx('trap'); juice.shake(0.08, 0.3); }
      else if (ev.e === 'end') { show(ev.success ? '☀ SUNRISE! You made it!' : 'Everyone got hugged…', ev.success ? 'good' : 'bad', 2.8); ctx.sfx(ev.success ? 'win' : 'bad'); }
    },
    pose(pid, flags) { if (last?.dn.some(d => d[0] === pid)) return 'dead'; if (flags & F.STUN) return 'hit'; return undefined; },
    frame(dt, t) {
      const k = Math.min(1, dt * 10);
      for (const S of shamblers.values()) {
        S.x += (S.tx - S.x) * k; S.z += (S.tz - S.z) * k;
        let dy = S.tyaw - S.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); S.yaw += dy * k;
        S.root.position.set(S.x, 0, S.z); S.root.rotation.y = S.yaw;
        if (S.st === 3) { S.sink = Math.min(1, S.sink + dt / 1.3); S.g.rotation.x = -Math.min(1.45, S.sink * 4); S.g.position.y = -S.sink * 0.9; continue; }
        S.ph += dt * (S.st === 2 ? 9 : 5);
        const w = Math.sin(S.ph);
        S.legL.rotation.x = w * 0.5; S.legR.rotation.x = -w * 0.5; S.g.rotation.z = w * 0.12; S.g.position.y = Math.abs(w) * 0.04;
        S.armL.rotation.x = -0.2 + Math.sin(S.ph * 0.5) * 0.15; S.armR.rotation.x = -0.2 - Math.sin(S.ph * 0.5) * 0.15;
        S.head.rotation.z = Math.sin(S.ph * 0.4) * 0.25;
        S.g.rotation.x = S.st === 1 ? -0.35 : S.st === 2 ? 0.25 + Math.sin(S.ph * 2) * 0.1 : 0;
      }
      for (const p of ctx.players) {
        const B = batOf(p.pid); if (!B) continue;
        const s = swingT.get(p.pid) || 0; if (s > 0) swingT.set(p.pid, s - dt);
        const u = s > 0 ? 1 - s / 0.3 : 0;
        B.hold.rotation.set(s > 0 ? 0.5 + Math.sin(u * Math.PI) * 1.4 : 0, s > 0 ? -Math.sin(u * Math.PI) * 1.2 : 0, 0);
        B.hold.visible = !last?.dn.some(d => d[0] === p.pid);
      }
      for (const [pid, M] of downs) if (M.g.visible) { const p = ctx.pos(pid); if (p) M.g.position.set(p.x, 0, p.z); }
      // dawn creeps in over the last 15 seconds (the yard gets a little lighter; nothing switches on or off)
      const want = last && last.left <= 15 ? (15 - last.left) / 15 : 0; sky += (want - sky) * Math.min(1, dt * 2);
      yard.material.color.set(HW ? '#3a4668' : '#2f5a46').lerp(col.set(HW ? '#5a5a7a' : '#5f9a5a'), sky * 0.6);
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.className = 'zs-banner'; }
      juice.frame(dt, t);
    },
    dispose() {
      bar.el.remove(); pill.remove(); banner.remove(); juice.dispose();
      for (const M of downs.values()) M.tag.remove();
      for (const B of bats.values()) B.hold.removeFromParent();
    },
  };
}
