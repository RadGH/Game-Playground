// SPOTLIGHT DANCE, as drawn: a dark club stage — a light-up dance floor of square tiles that pulse on every beat, a
// velvet curtain at the back, speaker stacks at the sides and a turning mirror ball overhead (the stage's lights are
// dimmed for the night and put back after; on Halloween the shared dusk dressing does it). Each spotlight is a bright
// coloured pool on the floor under a see-through beam from the ceiling, with a BEAT RING that shrinks onto the pool's
// edge exactly on the beat (and flashes). The music is the fair-organ tune, started on a beat so it plays in time.
// Your step is timed on this device's clock (sent with the press, judged by the server at that time). HUD: score bar,
// a pill with a pulsing beat dot and your streak/multiplier, a word for each of your steps (Perfect / Good / Early…).
import { BEAT, LEAD, RULES, judge, multFor } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, init, meta } = ctx;
  const { hw, hd } = meta.arena, HW = ctx.season === 'halloween';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  // ---- club lighting (dimmed, restored on dispose)
  let restore = null;
  if (!HW) {
    const scene = stage.scene, hemi = scene.children.find(o => o.isHemisphereLight), sun = stage.sun;
    const was = { bg: scene.background?.clone?.() ?? scene.background, h: hemi && { c: hemi.color.clone(), g: hemi.groundColor.clone(), i: hemi.intensity }, s: sun && { c: sun.color.clone(), i: sun.intensity } };
    scene.background = new THREE.Color('#1a1238');
    if (hemi) { hemi.color.set('#b9a8ff'); hemi.groundColor.set('#2a1f4a'); hemi.intensity = was.h.i * 0.85; }
    if (sun) { sun.color.set('#ffd6f0'); sun.intensity = was.s.i * 0.6; }
    restore = () => { scene.background = was.bg; if (hemi) { hemi.color.copy(was.h.c); hemi.groundColor.copy(was.h.g); hemi.intensity = was.h.i; } if (sun) { sun.color.copy(was.s.c); sun.intensity = was.s.i; } };
  }
  // ---- room: floor tiles that pulse, curtain, speakers, mirror ball
  const base = new THREE.Mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), std('#22183e')); base.position.y = -0.02; base.receiveShadow = true; group.add(base);
  const TS = 1, NX = Math.round(hw * 2 / TS), NZ = Math.round(hd * 2 / TS), NT = NX * NZ;
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(TS * 0.94, 0.06, TS * 0.94), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.1, emissive: '#ffffff', emissiveIntensity: 0.18 }), NT);
  const TILE_COLS = HW ? ['#4a2a7a', '#6a3a1a', '#2a3a6a', '#5a2a5a'] : ['#3b2a7a', '#7a2a5a', '#1f4a7a', '#2a6a5a'], tileCol = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { const k = i * NZ + j; m4.compose(v.set(-hw + TS / 2 + i * TS, 0.0, -hd + TS / 2 + j * TS), q.identity(), sc.setScalar(1)); tiles.setMatrixAt(k, m4); tileCol.push(new THREE.Color(TILE_COLS[(i + j * 3) % 4])); tiles.setColorAt(k, tileCol[k]); }
  tiles.receiveShadow = true; group.add(tiles);
  const curtainTex = canvasTexture(256, 128, (c, w, hh) => { for (let x = 0; x < w; x += 16) { const gr = c.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, HW ? '#3a1050' : '#5a0f2a'); gr.addColorStop(0.5, HW ? '#7a2aa0' : '#b0204a'); gr.addColorStop(1, HW ? '#3a1050' : '#5a0f2a'); c.fillStyle = gr; c.fillRect(x, 0, 16, hh); } });
  curtainTex.wrapS = THREE.RepeatWrapping; curtainTex.repeat.set(4, 1);
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 8, 8), std('#ffffff', { map: curtainTex })); curtain.position.set(0, 4, -hd - 1.6); group.add(curtain);
  for (const sx of [-1, 1]) {
    const spk = new THREE.Group(); spk.position.set(sx * (hw + 1.6), 0, -hd + 1); group.add(spk);
    for (let k = 0; k < 2; k++) {
      const boxM = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 1.2), std('#1b1b24')); boxM.position.y = 0.75 + k * 1.5; boxM.castShadow = true; spk.add(boxM);
      const cone = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), std('#3a3a48')); cone.position.set(0, 0.75 + k * 1.5, 0.61); spk.add(cone);
      const dust = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), std('#666')); dust.position.set(0, 0.75 + k * 1.5, 0.62); spk.add(dust);
    }
    spk.userData.cones = spk.children.filter((c, i) => i % 3 === 1);
  }
  const speakers = group.children.filter(o => o.userData.cones);
  const ballTex = canvasTexture(128, 64, (c, w, hh) => { for (let x = 0; x < w; x += 8) for (let y = 0; y < hh; y += 8) { const g2 = 150 + ((x * 7 + y * 13) % 100); c.fillStyle = `rgb(${g2},${g2},${g2 + 20})`; c.fillRect(x, y, 7, 7); } });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), new THREE.MeshStandardMaterial({ map: ballTex, metalness: 0.9, roughness: 0.25, emissive: '#555577', emissiveMap: ballTex, emissiveIntensity: 0.7 })); ball.position.set(0, 8.6, -hd - 0.4); group.add(ball);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 4), std('#999')); chain.position.set(0, 10.5, -hd - 0.4); group.add(chain);

  // ---- spotlights: floor pool + beam + beat ring, per light id
  const LCOLS = ['#ff6ec7', '#5ee7ff', '#ffe066', '#7dff8a', '#c49bff'];
  const poolGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), ringGeo = new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), beamGeo = new THREE.CylinderGeometry(0.12, 1, 8, 24, 1, true).translate(0, 4, 0);
  const lights = new Map();
  function light(id, x, z, r) {
    let L = lights.get(id); if (L) return L;
    const c = LCOLS[(id - 1) % LCOLS.length];
    const pool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }));
    const edge = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, depthWrite: false }));
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    pool.position.y = 0.05; ring.position.y = 0.07; edge.position.y = 0.065; pool.renderOrder = 2; ring.renderOrder = 3; edge.renderOrder = 3;
    group.add(pool, ring, edge, beam);
    L = { id, x, z, r, tx: x, tz: z, tr: r, pool, ring, edge, beam, col: new THREE.Color(c), born: performance.now() };
    lights.set(id, L); return L;
  }
  function dropLight(id) { const L = lights.get(id); if (!L) return; for (const m of [L.pool, L.ring, L.edge, L.beam]) { m.removeFromParent(); m.material.dispose(); } lights.delete(id); }

  // ---- this device's song clock
  let t0 = null; const nowS = () => performance.now() / 1000;
  const myEl = () => (t0 == null ? -1 : nowS() - t0);
  const sync = el => { if (t0 == null) { t0 = nowS() - el; return; } const d = el - myEl(); if (d > 0.35 || d < -0.6) t0 = nowS() - el; };
  const tunes = createTunes({ volume: 0.26 });
  let tuneOn = false, lastBeatK = -99;

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'sd-pill', '<i class="sd-dot"></i><span>Get in a light!</span>'); ctx.ui.append(pill);
  const dot = pill.querySelector('.sd-dot'), pillTxt = pill.querySelector('span');
  const medals = init.solo ? h('div', 'sd-medals', init.medals.map((m, i) => `<span>${['🥉', '🥈', '🥇'][i]} ${m}</span>`).join('')) : null; if (medals) ctx.ui.append(medals);
  const word = h('div', 'sd-word'); ctx.ui.append(word); let wordT = 0;
  const say = (text, cls) => { word.textContent = text; word.className = 'sd-word show ' + cls; wordT = 0.55; };
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  const MOVES = [['jump', 380], ['clap', 420], ['wave', 420], ['cheer', 420]]; let mv = 0;
  let prevB = 0, prevS = -9, myStreak = 0, lastPill = '';
  function setPill(streak) {
    const t = myEl(), text = t < LEAD - BEAT ? 'Get in a light!' : streak > 0 ? `Streak ${streak} · ×${multFor(streak)}` : 'Press A on the beat';
    if (text !== lastPill) { lastPill = text; pillTxt.textContent = text; pill.classList.toggle('hot', streak >= RULES.streakStep); }
  }
  return {
    state(g) {
      sync(g.el);
      const seen = new Set();
      for (const [id, x, z, r] of g.l) { seen.add(id); const L = light(id, x, z, r); L.tx = x; L.tz = z; L.tr = r; }
      for (const id of [...lights.keys()]) if (!seen.has(id)) dropLight(id);
      bar.set(g.sc, g.left);
      if (ctx.me != null && g.st[ctx.me] != null) myStreak = g.st[ctx.me];
      if (medals) medals.querySelectorAll('span').forEach((s, i) => s.classList.toggle('won', (g.sc[ctx.players[0].pid] || 0) >= init.medals[i]));
    },
    input(inp) {
      const fresh = (inp.b & IN.A) && (!(prevB & IN.A) || inp.s !== prevS + 1); prevB = inp.b; prevS = inp.s;
      if (!fresh || t0 == null) return;
      const t = Math.round(myEl() * 1000) / 1000;
      ctx.send('step', { t });
      const [clip, ms] = MOVES[mv++ % MOVES.length]; ctx.actor(ctx.me)?.play(clip, ms);
      const { off } = judge(t); if (Math.abs(off) <= init.window) dot.classList.add('hit');
    },
    event(ev) {
      if (ev.e === 'step') {
        const mine = ev.pid === ctx.me, p = ctx.pos(ev.pid);
        if (!mine && ev.ok) { const [clip, ms] = MOVES[(ev.streak || 0) % MOVES.length]; ctx.actor(ev.pid)?.play(clip, ms); }
        if (ev.ok) {
          if (mine) { say(ev.perfect ? `Perfect! +${ev.add}` : `Good +${ev.add}`, ev.perfect ? 'perfect' : 'good'); ctx.sfx(ev.mult >= 2 ? 'coins' : 'tap'); }
          else if (p) floatText(stage, p.x, 2.2, p.z, `+${ev.add}`, '');
          if (ev.streak % RULES.streakStep === 0 && ev.mult >= 2 && p) floatText(stage, p.x, 2.6, p.z, `×${ev.mult}!`, 'good');
        } else if (mine) {
          say({ early: 'Too early!', late: 'Too late!', dark: 'Find a light!', double: 'One step a beat!' }[ev.why] || 'Miss', 'bad');
          ctx.sfx('bad'); ctx.actor(ctx.me)?.play('shrug', 500);
        }
      } else if (ev.e === 'drop') { if (ev.pid === ctx.me && ev.lost >= 3) say('Streak lost!', 'bad'); }
      else if (ev.e === 'merging') { /* the two lights glide together */ }
      else if (ev.e === 'merge') { ctx.sfx('pick'); floatText(stage, ev.x, 1.2, ev.z, 'Big light!', 'good'); }
      else if (ev.e === 'split') { ctx.sfx('tap'); }
      void nameOf;
    },
    pose(pid, flags) { if (flags & F.FROZEN) return 'dance'; return undefined; },
    frame(dt, t) {
      const el = myEl(), beatPos = (el - LEAD) / BEAT, k = Math.floor(beatPos), ph = beatPos - k;   // ph: 0 right on a beat .. 1 just before the next
      const toBeat = 1 - ph;                                                                       // fraction of a beat until the next one
      // start the tune on a beat so the music and the rings agree
      if (!tuneOn && el > 0 && el < meta.seconds) { const next = LEAD + Math.max(0, Math.ceil(beatPos)) * BEAT; if (next - el < 0.06) { tunes.start('boogie'); tuneOn = true; } }
      if (el >= meta.seconds && tuneOn) { tunes.stop(); tuneOn = false; }
      const flash = el >= LEAD - 0.05 ? Math.max(0, 1 - ph * 5) : 0;                           // bright for the first fifth of each beat
      if (k !== lastBeatK && el >= LEAD - 0.05) { lastBeatK = k; dot.classList.remove('hit'); dot.classList.remove('beat'); void dot.offsetWidth; dot.classList.add('beat'); }
      // floor pulse
      for (let i = 0; i < NT; i++) { const wave = 0.55 + 0.45 * Math.max(0, Math.sin(t * 2 + i * 0.37)); col.copy(tileCol[i]).multiplyScalar(wave + flash * 0.9 * ((i + k) % 3 === 0 ? 1 : 0.35)); tiles.setColorAt(i, col); }
      tiles.instanceColor.needsUpdate = true;
      // lights glide to the server's spots; rings shrink onto the edge exactly on the beat
      const kk = 1 - Math.exp(-dt * 9);
      for (const L of lights.values()) {
        L.x += (L.tx - L.x) * kk; L.z += (L.tz - L.z) * kk; L.r += (L.tr - L.r) * kk;
        const grow = Math.min(1, (performance.now() - L.born) / 350), r = L.r * grow;
        L.pool.position.set(L.x, 0.05, L.z); L.pool.scale.setScalar(r); L.pool.material.opacity = 0.42 + 0.35 * flash;
        L.edge.position.set(L.x, 0.065, L.z); L.edge.scale.setScalar(r);
        L.beam.position.set(L.x, 0, L.z); L.beam.scale.set(r, 1, r); L.beam.material.opacity = 0.09 + 0.1 * flash;
        const rs = el < LEAD - BEAT ? 0 : 1 + 0.9 * toBeat * (ph < 0.12 ? 0 : 1);
        L.ring.visible = rs > 0; L.ring.position.set(L.x, 0.07, L.z); L.ring.scale.setScalar(r * (ph < 0.12 ? 1 + ph * 2 : rs));
        L.ring.material.opacity = ph < 0.12 ? 1 - ph * 6 : 0.35 + 0.6 * (1 - toBeat);
      }
      ball.rotation.y = t * 0.6;
      for (const s of speakers) for (const c of s.userData.cones) c.scale.setScalar(1 + flash * 0.12);
      setPill(myStreak);
      if (wordT > 0) { wordT -= dt; if (wordT <= 0) word.className = 'sd-word'; }
    },
    dispose() { bar.el.remove(); tunes.dispose(); restore?.(); curtainTex.dispose(); ballTex.dispose(); },
  };
}
