// GOBLIN KING'S CROWN, as drawn: a castle treasure courtyard — checkered flagstones, low crenellated walls (one
// instanced mesh), heaps of gold coins and a red throne at the back. The King is a Chibi goblin in the Royal outfit
// (crown, gown, red cloak) at nearly twice player size; his little SNEAKS are small Chibi goblins in pickpocket gear
// carrying a brown sack (a pool of four, reused). Barrels: he holds one over his head as he throws, a red ring shows
// the landing spot and the barrel drops in for the last half second. His hop: a crouch, a big arc through the air and
// a landing ring. A "+5 CROWN!" pop for the final bonk.
import { RULES } from './sim.js';
import { bossKit } from '../boss-kit-view.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, meta, me, init } = ctx;
  const { hw, hd } = meta.arena;
  const K = bossKit(ctx, { name: 'Goblin King', color: 'linear-gradient(#9fe36a, #4ea83a)' });
  const { std, basic, mesh, keep } = K;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0);

  // ---- the courtyard: checkered flagstones (one instanced mesh), low walls, gold heaps, a throne
  mesh(keep(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2)), std('#6f8f5a', { roughness: 1 }), 0, -0.03, 0);
  const cols = 9, rows = 7, tiles = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(hw * 2 / cols - 0.06, 0.06, hd * 2 / rows - 0.06)), std('#ffffff', { roughness: 0.9 }), cols * rows);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const k = i * rows + j; m4.compose(v.set(-hw + (i + 0.5) * hw * 2 / cols, -0.02, -hd + (j + 0.5) * hd * 2 / rows), q.identity(), sc.set(1, 1, 1)); tiles.setMatrixAt(k, m4); tiles.setColorAt(k, col.set((i + j) % 2 ? '#d8cbb0' : '#bfae8f')); }
  tiles.receiveShadow = true; group.add(tiles);
  const wallN = 2 * 10 + 2 * 8, walls = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 0.9, 0.6)), std('#a59a8a', { flatShading: true }), wallN);
  let wi = 0;
  for (let i = 0; i < 10; i++) { const x = -hw + (i + 0.5) * hw * 2 / 10; for (const z of [-hd - 0.5, hd + 0.5]) { m4.compose(v.set(x, 0.45 + (i % 2) * 0.15, z), q.identity(), sc.set(hw * 2 / 10 - 0.08, 1, 1)); walls.setMatrixAt(wi++, m4); } }
  for (let i = 0; i < 8; i++) { const z = -hd + (i + 0.5) * hd * 2 / 8; for (const x of [-hw - 0.5, hw + 0.5]) { m4.compose(v.set(x, 0.45 + (i % 2) * 0.15, z), q.setFromAxisAngle(UP, Math.PI / 2), sc.set(hd * 2 / 8 - 0.08, 1, 1)); walls.setMatrixAt(wi++, m4); } }
  walls.castShadow = true; group.add(walls);
  const goldM = std('#ffd23f', { metalness: 0.5, roughness: 0.35 });
  for (const [x, z, s] of [[-hw - 1.6, -hd - 1.4, 1.2], [hw + 1.6, -hd - 1.2, 1], [-hw - 1.8, hd - 1, 0.8]]) mesh(keep(new THREE.ConeGeometry(1, 0.8, 12)), goldM, x, 0.4 * s, z).scale.setScalar(s);
  const throne = new THREE.Group(); throne.position.set(0, 0, -hd - 1.8); group.add(throne);
  mesh(keep(new THREE.BoxGeometry(2, 1, 1.4)), std('#c8343f'), 0, 0.5, 0, throne); mesh(keep(new THREE.BoxGeometry(2, 2.6, 0.4)), std('#c8343f'), 0, 1.3, -0.6, throne);
  mesh(keep(new THREE.SphereGeometry(0.3, 12, 8)), goldM, -0.9, 2.7, -0.6, throne); mesh(keep(new THREE.SphereGeometry(0.3, 12, 8)), goldM, 0.9, 2.7, -0.6, throne);

  // ---- the King and his sneaks (Chibi goblins)
  let king = null, kingH = 3;
  const barrelGeo = keep(new THREE.CylinderGeometry(0.42, 0.42, 0.75, 14)), barrelM = std('#9a6232');
  const held = mesh(barrelGeo, barrelM, 0, 0, 0); held.visible = false; held.castShadow = true;
  ctx.createActor({ look: { race: 'goblin', seed: 4242 }, costume: 'cos_royal' }, { scale: 1.85 }).then(a => { if (!a) return; king = a; kingH = a.height; a.place(0, 0, -2, 0); });
  const sneakRing = keep(new THREE.RingGeometry(0.42, 0.6, 24).rotateX(-Math.PI / 2)), sneakRingM = basic('#ff3b3b', { opacity: 0.9 });
  const sneaks = [], sackGeo = keep(new THREE.SphereGeometry(0.28, 10, 8)), sackM = std('#a07a4a');
  for (let i = 0; i < 4; i++) ctx.createActor({ look: { race: 'goblin', seed: 900 + i * 31 }, costume: 'cos_rogue' }, { scale: 0.8 }).then(a => {
    if (!a) return; a.group.visible = false; const rr = mesh(sneakRing, sneakRingM, 0, 0.04, 0, a.group); rr.renderOrder = 3; const sack = mesh(sackGeo, sackM, 0, 0.75, -0.3, a.body.group); sack.scale.set(1, 1.2, 1); sneaks.push({ a, id: null, x: 0, z: 0, yaw: 0, tx: 0, tz: 0 });
  });

  const bar = scoreBar(ctx, { unit: 'pts' });
  const tall = () => innerHeight > innerWidth * 1.15;
  const frameCam = () => ctx.camera({ cx: 0, cz: -0.6, hw: hw + 0.8, hd: hd + 1.4, tall: tall() ? 3.6 : 3 }, { instant: true });
  frameCam(); addEventListener('resize', frameCam);
  let G = null, kx = 0, kz = -2, ky = 0, kyaw = 0, kph = '', ended = false;

  return {
    start() { frameCam(); K.banner('Bonk the King!'); },
    state(g) {
      G = g;
      K.rings(g.rg, { onAdd: (R, row) => { if (!row[6]) { R.bar = mesh(barrelGeo, barrelM, R.x, 9, R.z); R.bar.castShadow = true; } }, onDrop: R => { if (R.bar) group.remove(R.bar); } });
      K.hp(g.hp, init.hpMax);
      K.row(`<span class="bk-tag">Final bonk +${RULES.finalBonus}</span>${g.mn.some(m => !m[4]) ? '<span class="bk-tag hot">Sneaks! Bonk them (+1)</span>' : ''}`);
      // sneaks: assign pooled actors to ids
      const live = new Set(g.mn.map(m => m[0]));
      for (const s of sneaks) if (s.id != null && !live.has(s.id)) { s.id = null; s.a.group.visible = false; }
      for (const [id, x, z, yaw, flee] of g.mn) {
        let s = sneaks.find(o => o.id === id);
        if (!s) { s = sneaks.find(o => o.id == null); if (!s) continue; s.id = id; s.x = x; s.z = z; s.a.group.visible = true; K.puff(x, 0.5, z, '#9fe36a', 0.8); }
        s.tx = x; s.tz = z; s.yaw = yaw; s.flee = flee;
      }
      if (g.k[4] !== kph) { if (king) { if (g.k[4] === 'air') king.play('jump', 900); } kph = g.k[4]; }
      bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'bonk') {
        king?.play('hit', 220); ctx.sfx(ev.pid === me ? 'coins' : 'hit');
        floatText(stage, kx, kingH + 0.6, kz, ev.final ? `+${RULES.finalBonus + 1} CROWN!` : '+1', 'good'); K.puff(kx, kingH * 0.6, kz, '#fff3a0', 0.6);
        if (ev.final) { const n = ctx.player(ev.pid)?.name || ''; K.banner(ev.pid === me ? 'You toppled the King!' : `${n} toppled the King!`, 'good', 3500); }
      } else if (ev.e === 'throw') { king?.play('throw', 500); ctx.sfx('throw'); if (ev.pid === me) K.banner('Barrel! Move!', 'warn', 800); }
      else if (ev.e === 'crash') { K.puff(ev.x, 0.5, ev.z, '#c79a5a', 1.6); ctx.sfx('splat'); }
      else if (ev.e === 'hop') { K.banner('Royal hop!', 'warn', 800); ctx.sfx('trap'); }
      else if (ev.e === 'land') { K.puff(ev.x, 0.3, ev.z, '#d8cbb0', 2.4); ctx.sfx('splat'); }
      else if (ev.e === 'summon') { K.banner('Sneaks!', 'warn', 900); ctx.sfx('pick'); }
      else if (ev.e === 'steal') { ctx.sfx(ev.pid === me ? 'bad' : 'out'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2.2, p.z, `-${ev.n} stolen!`, 'bad'); }
      else if (ev.e === 'pop') { K.puff(ev.x, 0.5, ev.z, '#9fe36a', 1.2); ctx.sfx(ev.pid === me ? 'good' : 'tap'); floatText(stage, ev.x, 1.6, ev.z, '+1', 'good'); }
      else if (ev.e === 'hurt') { ctx.sfx(ev.pid === me ? 'bad' : 'hit'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, 'OOF!', 'bad'); }
      else if (ev.e === 'swing') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'end') { ended = true; if (!ev.beaten) K.banner('Time! The King escapes!', '', 3000); else if (ev.bonus) floatText(stage, 0, 3, 0, `+${ev.bonus} time bonus!`, 'good'); ctx.sfx('win'); }
    },
    input(inp) { if (inp.b & IN.A) ctx.actor(me)?.play('punch', 380); },
    pose(pid, flags) { if (flags & F.STUN) return 'hit'; if (G?.end) return 'cheer'; return undefined; },
    frame(dt, t) {
      K.frame(dt, t);
      if (G) { const k = Math.min(1, dt * 10); kx += (G.k[0] - kx) * k; kz += (G.k[1] - kz) * k; ky += (G.k[3] - ky) * Math.min(1, dt * 16); let d = G.k[2] - kyaw; d = Math.atan2(Math.sin(d), Math.cos(d)); kyaw += d * k; }
      if (king) {
        king.place(kx, ky, kz, kyaw);
        const ph = G?.k[4];
        king.setPose(ended && G?.hp <= 0 ? 'dead' : ph === 'crouch' ? 'ready' : ph === 'air' ? 'jump' : 'idle');
        king.setSpeed(ph === 'walk' && !ended ? 1.9 : 0);
        king.update(dt);
        held.visible = !!G?.k[6]; if (held.visible) held.position.set(kx, ky + kingH + 0.5, kz);
      }
      for (const s of sneaks) {
        if (s.id == null) continue;
        const k = Math.min(1, dt * 12); s.x += (s.tx - s.x) * k; s.z += (s.tz - s.z) * k;
        s.a.place(s.x, 0, s.z, s.yaw); s.a.setSpeed(4); s.a.update(dt);
      }
      for (const R of K.live.values()) if (R.bar) { const f = Math.max(0, R.left / 0.5); R.bar.position.y = 0.4 + Math.min(1, f) * 9; R.bar.visible = R.left < 0.55; R.bar.rotation.z += dt * 6; }
    },
    dispose() { removeEventListener('resize', frameCam); bar.el.remove(); K.dispose(); },
  };
}
