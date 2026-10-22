// BOARDWALK BRAWL, as drawn: a long fairground street seen from the side and a little above. The camera slides
// along with the screen window the server keeps (state.w); the two invisible screen walls in our copy of the arena
// are moved from the same number, so your own character stops at the edge of the screen without waiting for the
// server. Scenery is a kit per theme (booths / pier / ghost), all instanced. Roughnecks are Chibi characters made
// with ctx.createActor (three looks per kind, so the body cache does the work). A roughneck about to swing shows a
// red "!" over its head (a boss's slam also lights a red ring on the ground) — the cue to step away or jump-kick.
import { W, HD, ST, RULES, KINDS } from './sim.js';
import { FOES } from './levels.js';
import { scoreBar, floatText, h, esc } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx;
  const L = init.level.length, hw = L / 2, T = init.level.theme;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  // ---- ground, lane, curbs, sky
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(L + 60, 46).rotateX(-Math.PI / 2), std(T.props === 'pier' ? T.water : T.ground));
  ground.position.set(0, T.props === 'pier' ? -1.4 : -0.02, 0); ground.receiveShadow = true; group.add(ground);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L + 30, 0.4, HD * 2 + (T.props === 'pier' ? 6.5 : 3)), std(T.lane));
  deck.position.set(0, -0.2, T.props === 'pier' ? -1.6 : 0); deck.receiveShadow = true; group.add(deck);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(L + 120, 40), new THREE.MeshBasicMaterial({ color: T.sky }));
  sky.position.set(0, 12, -HD - 14); group.add(sky);
  const NC = Math.ceil((L + 30) / 1.6), curbs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.16, 0.24), std('#ffffff'), NC * 2);
  for (let i = 0; i < NC; i++) for (const s of [0, 1]) { m4.compose(v.set(-hw - 15 + i * 1.6, 0.06, s ? HD + 0.25 : -HD - 0.25), q.identity(), sc.set(1, 1, 1)); curbs.setMatrixAt(i * 2 + s, m4); curbs.setColorAt(i * 2 + s, col.set(i % 2 ? '#ffffff' : (T.walls[0]))); }
  group.add(curbs);
  if (T.props === 'pier') {     // planks across the deck
    const NP = Math.ceil((L + 30) / 0.9), planks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.02, HD * 2 + 6.4), std(T.trim), NP);
    for (let i = 0; i < NP; i++) { m4.compose(v.set(-hw - 15 + i * 0.9, 0.005, -1.6), q.identity(), sc.set(1, 1, 1)); planks.setMatrixAt(i, m4); }
    group.add(planks);
  }
  // ---- the back row: booths (walls + a pointed striped roof + a counter), string lights between them
  const STEP = 6, NB = Math.ceil((L + 30) / STEP), backZ = T.props === 'pier' ? -HD - 3.4 : -HD - 2.4;
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(4.4, 2.8, 2.2), std('#ffffff'), NB);
  const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(3.3, 1.8, 4), std('#ffffff', { flatShading: true }), NB);
  const counters = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, 0.25, 0.7), std(T.trim), NB);
  for (let i = 0; i < NB; i++) {
    const x = -hw - 15 + i * STEP + 2;
    m4.compose(v.set(x, 1.4, backZ), q.identity(), sc.set(1, 1, 1)); walls.setMatrixAt(i, m4); walls.setColorAt(i, col.set(T.walls[i % T.walls.length]));
    m4.compose(v.set(x, 3.7, backZ), q.setFromEuler(e3.set(0, Math.PI / 4, 0)), sc.set(1, 1, 0.75)); roofs.setMatrixAt(i, m4); roofs.setColorAt(i, col.set(T.roofs[i % T.roofs.length]));
    m4.compose(v.set(x, 1.1, backZ + 1.3), q.identity(), sc.set(1, 1, 1)); counters.setMatrixAt(i, m4);
  }
  walls.receiveShadow = true; group.add(walls, roofs, counters);
  const NL = NB * 6, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: T.lights }), NL);
  for (let i = 0; i < NL; i++) { const t = (i % 6) / 6, x = -hw - 15 + Math.floor(i / 6) * STEP + 4.2 + t * (STEP - 0.4); m4.compose(v.set(x, 3.0 - Math.sin(t * Math.PI) * 0.5, backZ + 1.2), q.identity(), sc.set(1, 1, 1)); bulbs.setMatrixAt(i, m4); }
  group.add(bulbs);
  // front: short posts (pier rope posts / fence) far enough down not to hide anyone
  const NF = Math.ceil((L + 30) / 3), posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.14, 0.7, 6), std(T.trim), NF);
  for (let i = 0; i < NF; i++) { m4.compose(v.set(-hw - 15 + i * 3, 0.35, HD + 1.1), q.identity(), sc.set(1, 1, 1)); posts.setMatrixAt(i, m4); }
  group.add(posts);
  // every wave stop: a painted line across the street and a flag pole at the back (the boss's is gold and taller)
  const flagMat = std('#ffd23f', { roughness: 0.5 }), poleGeo = new THREE.CylinderGeometry(0.12, 0.14, 4.6, 8), flagGeo = new THREE.BoxGeometry(1.4, 0.8, 0.06), lineGeo = new THREE.PlaneGeometry(0.35, HD * 2).rotateX(-Math.PI / 2);
  init.level.waves.forEach((at, i) => {
    const x = at - hw + 0.4, last = i === init.level.waves.length - 1, s = last ? 1.3 : 1;
    const p = new THREE.Mesh(poleGeo, std(T.trim)); p.position.set(x, 2.3 * s, -HD - 0.9); p.scale.y = s; group.add(p);
    const f = new THREE.Mesh(flagGeo, last ? flagMat : std(T.walls[i % T.walls.length])); f.position.set(x + 0.7, 4.2 * s, -HD - 0.9); f.castShadow = true; group.add(f);
    const ln = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: last ? '#ffd23f' : '#ffffff', transparent: true, opacity: 0.35, depthWrite: false })); ln.position.set(x, 0.01, 0); group.add(ln);
  });
  // ghosts bob along the back of the spook alley
  let ghosts = null;
  if (T.props === 'ghost') { ghosts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1.4, 8), new THREE.MeshBasicMaterial({ color: '#e8f0ff', transparent: true, opacity: 0.75 }), 10); group.add(ghosts); }

  // ---- roughnecks
  const foes = new Map();
  const defOf = k => KINDS[k] === 'boss' ? init.boss : FOES[KINDS[k]];
  const slamGeo = new THREE.RingGeometry(2.2, 2.5, 40).rotateX(-Math.PI / 2);
  function addFoe(id, k) {
    const def = defOf(k), boss = KINDS[k] === 'boss';
    const race = boss ? def.race : def.races[(id + init.lookSalt) % def.races.length];
    const seed = boss ? def.seed : init.lookSalt * 13 + k * 101 + (id % 3);
    const r = { id, k, def, a: null, to: [0, 0, 0, 0], st: 0, tag: null, ring: null, prev: null, dead: 0, seen: true };
    foes.set(id, r);
    ctx.createActor({ look: { race, seed }, costume: def.costume }, { scale: def.scale }).then(a => {
      if (!a) return; if (!foes.has(id)) { a.dispose(); return; }
      r.a = a; a.place(r.to[0], r.to[2], r.to[1], r.to[3]);
      for (const o of a.group.children) if (o.isMesh) o.material.color.set('#2a1414'); a.setRing(true);          // a dark ring under every roughneck; players have their seat colour
    });
    if (boss) { r.ring = new THREE.Mesh(slamGeo, new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0, depthWrite: false })); r.ring.position.y = 0.03; group.add(r.ring); }
    return r;
  }
  function dropFoe(r) { r.a?.dispose(); r.tag?.remove(); if (r.ring) { group.remove(r.ring); r.ring.material.dispose(); } foes.delete(r.id); }

  // ---- HUD: score chips with a health bar each, wave counter, boss bar, GO arrow
  const bar = scoreBar(ctx, { unit: 'pts' });
  const hpEls = new Map();
  for (const p of ctx.players) { const c = bar.el.querySelector(`[data-pid="${p.pid}"]`); const e = h('i', 'bb-hp', '<b></b>'); c?.append(e); hpEls.set(p.pid, e.firstChild); }
  const hud = h('div', 'bb-hud', `<span class="bb-wave"></span><span class="bb-boss" hidden><b>${esc(init.boss?.name || '')}</b><i><u></u></i></span>`);
  const go = h('div', 'bb-go', '<span>GO</span><b>➜</b>'); go.hidden = true;
  ctx.ui.append(hud, go);
  const waveEl = hud.querySelector('.bb-wave'), bossEl = hud.querySelector('.bb-boss'), bossFill = hud.querySelector('.bb-boss u');
  const banner = (text, ms = 1600, cls = '') => { const b = h('div', 'banner fx bb-banner ' + cls); b.textContent = text; ctx.ui.append(b); setTimeout(() => b.remove(), ms); };
  const helpTags = new Map();

  // ---- local feel: your own punch/kick plays the moment you press
  let lastIn = 0, prevBits = 0, myCombo = 0, myComboAt = 0, myCool = 0, myKickCool = 0;
  const hp = new Map(ctx.players.map(p => [p.pid, init.hp])), flagsOf = new Map();
  let camX = -hw + W / 2, lastG = null, ended = false, framed = false;
  const name = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  const COMBO = ['punch', 'punch', 'kick'];

  return {
    start() { banner(init.level.name, 1800); },
    input(inp) {
      const now = performance.now();
      if (now - lastIn > 90) prevBits = 0;
      lastIn = now;
      const bits = inp.b | 0, pa = (bits & IN.A) && !(prevBits & IN.A), pb = (bits & IN.B) && !(prevBits & IN.B); prevBits = bits;
      const me = ctx.actor(ctx.me), f = flagsOf.get(ctx.me) || 0;
      if (!me || (hp.get(ctx.me) ?? 1) <= 0 || f & (F.STUN | F.FROZEN)) return;
      if (pa && now >= myCool) {
        myCombo = now - myComboAt < RULES.comboWin * 1000 && myCombo < 3 ? myCombo + 1 : 1; myComboAt = now;
        myCool = now + (myCombo === 3 ? RULES.finCool : RULES.jabCool) * 1000;
        me.play(COMBO[myCombo - 1], myCombo === 3 ? 420 : 260); if (myCombo === 3) myCombo = 0;
      } else if (pb && now >= myKickCool) { myKickCool = now + RULES.kickCool * 1000; me.play('kick', 520); ctx.sfx('throw'); }
    },
    state(g) {
      lastG = g;
      // the screen walls in our copy of the arena follow the server's window, so prediction stops at the same edge
      const bl = ctx.arena.blocks; if (bl) { bl[0].x = g.w - 2; bl[1].x = g.w + W + 2; }
      const seen = new Set();
      for (const [id, k, x, z, y, yaw, st, hp20] of g.e) {
        seen.add(id); const r = foes.get(id) || addFoe(id, k);
        r.to = [x, z, y, yaw]; r.st = st; r.hp20 = hp20;
      }
      for (const r of [...foes.values()]) if (!seen.has(r.id)) dropFoe(r);
      for (const p of ctx.players) {
        const n = g.hp[p.pid] ?? 0; hp.set(p.pid, n);
        const e = hpEls.get(p.pid); if (e) { e.style.width = Math.max(0, n) + '%'; e.parentElement.classList.toggle('low', n > 0 && n <= 30); }
        bar.mark(p.pid, 'out', n <= 0);
        const down = n <= 0 && !g.clr;
        let t = helpTags.get(p.pid);
        if (down && !t) { const a = ctx.actor(p.pid); if (a) { t = stage.tag(a.group, { text: 'HELP!', cls: 'bb-help', height: 1.2 }); helpTags.set(p.pid, t); } }
        if (!down && t) { t.remove(); helpTags.delete(p.pid); }
        if (t) t.set(g.rv?.[p.pid] ? `Up ${Math.round(g.rv[p.pid] * 100)}%` : 'HELP!');
      }
      const boss = g.e.find(r => KINDS[r[1]] === 'boss' && r[6] !== ST.dead);
      bossEl.hidden = !boss; if (boss) bossFill.style.width = boss[7] * 5 + '%';
      waveEl.textContent = g.clr ? 'Cleared!' : `Wave ${Math.min(g.wv + 1, init.level.waves.length)} / ${init.level.waves.length}`;
      go.hidden = !g.go;
      bar.set(g.sc, g.left);
    },
    event(ev) {
      const a = ev.pid != null ? ctx.actor(ev.pid) : null, r = ev.id != null ? foes.get(ev.id) : null;
      if (ev.e === 'punch') { if (ev.pid !== ctx.me) a?.play(COMBO[(ev.n || 1) - 1], ev.n === 3 ? 420 : 260); if (ev.hit) ctx.sfx('hit'); }
      else if (ev.e === 'kick') { if (ev.pid !== ctx.me) a?.play('kick', 520); }
      else if (ev.e === 'hit') { if (ev.fin) floatText(stage, ev.x, 1.6, ev.z, 'POW!', 'good'); }
      else if (ev.e === 'ko') { ctx.sfx('good'); floatText(stage, ev.x, 1.9, ev.z, `+${ev.pts}`, 'good'); if (ev.boss) banner(`${name(ev.by)} topped the boss!`, 1800); }
      else if (ev.e === 'tell') { if (r?.a && ev.m === 'slam') r.a.play('cast', 900); }
      else if (ev.e === 'swing') { r?.a?.play('punch', 380); }
      else if (ev.e === 'slam') { r?.a?.play('attack', 500); ctx.sfx('splat'); }
      else if (ev.e === 'hurt') { if (ev.pid === ctx.me) { ctx.sfx('bad'); navigator.vibrate?.(60); } }
      else if (ev.e === 'down') { ctx.sfx('out'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 1.4, p.z, ev.pid === ctx.me ? 'Down!' : `${name(ev.pid)} down!`, 'bad'); }
      else if (ev.e === 'up') { if (ev.pid === ctx.me || ev.by === ctx.me) ctx.sfx('pick'); }
      else if (ev.e === 'wave') { ctx.sfx('trap'); banner(ev.boss ? `Boss: ${ev.boss}!` : `Wave ${ev.i + 1}!`, 1200, ev.boss ? 'boss' : ''); }
      else if (ev.e === 'clearWave') { if (ev.i < init.level.waves.length - 1) { ctx.sfx('coins'); banner('Go! Go! Go!', 1000); } }
      else if (ev.e === 'clear') { ended = true; ctx.sfx('win'); banner(`Street cleared! +${ev.bonus} each`, 2400); }
      else if (ev.e === 'fail') { ended = true; ctx.sfx('bad'); banner('Everyone is down!', 2000, 'bad'); }
    },
    pose(pid, flags, b) {
      flagsOf.set(pid, flags);
      if ((hp.get(pid) ?? 1) <= 0) return 'dead';
      if (ended && lastG?.clr) return 'cheer';
      if (flags & F.AIR) return 'jump';
      if (flags & F.STUN) return 'hit';
      return undefined;
    },
    frame(dt, t) {
      // the camera slides with the server's window
      // (a phone held upright frames less street, following its own character inside the window, so people are not specks)
      const tall = innerHeight > innerWidth * 1.15, me = ctx.me != null ? ctx.pos(ctx.me) : null, half = tall && me ? 4.6 : W / 2;
      if (lastG) { const want = half < W / 2 ? Math.max(lastG.w + half - 1, Math.min(lastG.w + W - half + 1, me.x)) : lastG.w + W / 2; camX += (want - camX) * (1 - Math.exp(-dt * 6)); }
      ctx.camera({ cx: camX, cz: 0.3, hw: half, hd: HD + 0.7, pitch: 38, tall: 2.4 }, { instant: !framed }); framed = true;
      const k = 1 - Math.exp(-dt * 16);
      for (const r of foes.values()) {
        const a = r.a; if (!a) continue;
        const [x, z, y, yaw] = r.to, g = a.group.position;
        const px = g.x, pz = g.z;
        g.x += (x - g.x) * k; g.z += (z - g.z) * k; g.y += (y - g.y) * k;
        if (r.st === ST.dead) { r.dead += dt; if (r.dead > 0.5) g.y -= (r.dead - 0.5) * 1.6; }
        let d = yaw - a.body.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); a.body.group.rotation.y += d * Math.min(1, dt * 12);
        const tilt = r.st === ST.fly ? -1.1 * (Math.sign(Math.sin(yaw)) || 1) : 0; a.group.rotation.z += (tilt - a.group.rotation.z) * Math.min(1, dt * 8);
        const speed = Math.hypot(g.x - px, g.z - pz) / Math.max(dt, 1e-3);
        a.setSpeed(r.st === ST.walk || r.st === ST.charge ? speed : 0);
        a.setPose(r.st === ST.wind || r.st === ST.windCharge ? 'ready' : r.st === ST.stagger || r.st === ST.fly ? 'hit' : r.st === ST.down || r.st === ST.dead ? 'dead' : r.st === ST.charge ? 'run' : r.st === ST.windSlam ? 'cast' : ended && lastG?.fail ? 'cheer' : 'idle');
        a.update(dt);
        const warn = r.st === ST.wind || r.st === ST.windSlam || r.st === ST.windCharge;
        if (warn && !r.tag) r.tag = stage.tag(a.group, { text: '!', cls: 'bb-warn', height: 1.7 * r.def.scale + 0.3 });
        if (!warn && r.tag) { r.tag.remove(); r.tag = null; }
        if (r.ring) { r.ring.position.x = g.x; r.ring.position.z = g.z; const on = r.st === ST.windSlam; r.ring.material.opacity += ((on ? 0.45 + 0.35 * Math.sin(t * 20) : 0) - r.ring.material.opacity) * k; }
      }
      for (const [pid, f] of flagsOf) { const a = ctx.actor(pid); if (a) a.body.group.visible = !(f & F.GHOST) || Math.floor(t * 10) % 2 === 0; }
      if (ghosts) for (let i = 0; i < 10; i++) { const x = camX - 14 + i * 3.1 + Math.sin(t * 0.5 + i) * 0.8; m4.compose(v.set(x, 2.2 + Math.sin(t * 1.7 + i * 2) * 0.4, -HD - 4.6 + (i % 3) * 0.6), q.identity(), sc.set(1, 1, 1)); ghosts.setMatrixAt(i, m4); }
      if (ghosts) ghosts.instanceMatrix.needsUpdate = true;
    },
    dispose() { bar.el.remove(); for (const r of [...foes.values()]) dropFoe(r); for (const t of helpTags.values()) t.remove(); },
  };
}
