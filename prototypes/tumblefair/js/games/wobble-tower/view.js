// WOBBLE TOWER, as drawn: a row of candy-block towers on a fairground lawn in front of a striped tent, one per player,
// each on a plinth in the player's colour, with the player riding a little scissor lift beside it that rises as the
// tower grows. A block hangs on a rope from a trolley and swings over the top of the tower; a dark strip on the top
// block shows where it would land. Dropped blocks fall straight down; sliced overhangs and missed blocks tumble off,
// and a toppling tower sheds its top in a spray of spinning blocks. The tower sways more the higher its wobble; the
// number over each tower is its height, with a wobble bar under it (and "!" when it is close to toppling).
// As the tallest tower grows the whole scene sinks, so the tops stay in view and the sky gets deeper behind.
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { IN } from '../../shared/protocol.js';

const MAXB = 80, PLINTH = 0.3, SWING_UP = 1.15;
const CANDY = ['#ff8fa3', '#ffd166', '#8ce99a', '#74c0fc', '#d0a2f7', '#ffa94d', '#63e6be', '#faa2c1'];
export function createView(ctx) {
  const { THREE, group, stage, init } = ctx;
  const R = init.R, BH = R.BH, hw = ctx.arena.hw;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
  // ---- lawn, tent backdrop, sky that deepens with height
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(240, 200).rotateX(-Math.PI / 2), std('#7fd36a', { roughness: 0.95 })); lawn.position.y = -0.01; lawn.receiveShadow = true; group.add(lawn);
  const skyTex = canvasTexture(64, 512, (g, w, H) => { const gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, '#bfe9ff'); gr.addColorStop(0.25, '#7cc6f5'); gr.addColorStop(0.6, '#4a7fd6'); gr.addColorStop(1, '#2a2f7a'); g.fillStyle = gr; g.fillRect(0, 0, w, H);
    g.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 40; i++) { const y = H - (i * 37 % H), x = (i * 23) % w; g.beginPath(); g.ellipse(x, y, 10 + i % 7, 3 + i % 3, 0, 0, 7); g.fill(); } });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(140, 120), new THREE.MeshBasicMaterial({ map: skyTex, fog: false })); sky.position.set(0, 55, -16); group.add(sky);
  const tentTex = canvasTexture(256, 64, (g, w, H) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#ff5f7a'; g.fillRect(i * w / 16, 0, w / 16, H); } });
  tentTex.wrapS = THREE.RepeatWrapping; tentTex.repeat.set(4, 1);
  // the big top's wall behind the towers: an arc of a wide cylinder, seen from inside (only the far side is drawn)
  const tent = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 5, 48, 1, true, Math.PI - 0.6, 1.2), std('#ffffff', { map: tentTex, side: THREE.BackSide }));
  tent.position.set(0, 2.5, 26); group.add(tent);
  const flagGeo = new THREE.ConeGeometry(0.22, 0.42, 3).rotateX(Math.PI), flags = new THREE.InstancedMesh(flagGeo, std('#ffffff'), 30);
  for (let i = 0; i < 30; i++) { const x = -hw - 3 + i * (hw * 2 + 6) / 29; m4.compose(v.set(x, 4.6 - Math.sin(i / 29 * Math.PI) * 0.6, -7.2), q.identity(), sc.setScalar(1)); flags.setMatrixAt(i, m4); flags.setColorAt(i, col.set(CANDY[i % CANDY.length])); }
  group.add(flags);
  // ---- one tower per player
  const blockGeo = new THREE.BoxGeometry(1, BH * 0.94, 1.15), blockMat = std('#ffffff', { roughness: 0.45 });
  const towers = new Map();
  for (const t of init.towers) {
    const p = ctx.player(t.pid) || { color: '#ccc', seat: 0, name: '?' };
    const root = new THREE.Group(); root.position.set(t.x, 0, 0); group.add(root);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(R.W0 + 0.5, PLINTH, 1.6), std(p.color)); plinth.position.y = PLINTH / 2; plinth.receiveShadow = plinth.castShadow = true; root.add(plinth);
    const pivot = new THREE.Group(); pivot.position.y = PLINTH; root.add(pivot);
    const blocks = new THREE.InstancedMesh(blockGeo, blockMat, MAXB); blocks.count = 0; blocks.castShadow = blocks.receiveShadow = true; pivot.add(blocks);
    const swing = new THREE.Mesh(blockGeo, std(CANDY[0], { roughness: 0.45, emissive: '#ffffff', emissiveIntensity: 0.08 })); swing.castShadow = true; pivot.add(swing);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 5), std('#5a4030')); pivot.add(rope);
    const aim = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1.16), new THREE.MeshBasicMaterial({ color: '#1d2a3a', transparent: true, opacity: 0.35, depthWrite: false })); pivot.add(aim);
    const liftMat = std('#9aa3ad', { metalness: 0.3, roughness: 0.5 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 1.0), std('#ffd23f')); deck.castShadow = true; group.add(deck);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1, 0.18), liftMat); group.add(mast);
    const anchor = new THREE.Object3D(); pivot.add(anchor);
    const label = stage.tag(anchor, { text: '0', seat: p.seat, height: 0, cls: 'wt-meter' });
    const bar = h('i', 'wt-wob'); bar.innerHTML = '<b></b>'; label.el.append(bar);
    const T = { pid: t.pid, x: t.x, root, pivot, blocks, swing, rope, aim, deck, mast, anchor, label, fill: bar.firstChild,
      stack: [], h: 0, wob: 0, swinging: false, bid: -1, ph: 0, w: 0, tw: R.W0, tx: 0, shown: 0, sway: 0, local: false, fallingMine: null };
    towers.set(t.pid, T);
    for (const [x, w] of init.stacks[t.pid] || []) T.stack.push({ x, w });
    redraw(T);
  }
  function redraw(T) {
    T.stack.forEach((b, i) => { m4.compose(v.set(b.x, BH * (i + 0.5), 0), q.identity(), sc.set(b.w, 1, 1)); T.blocks.setMatrixAt(i, m4); T.blocks.setColorAt(i, col.set(CANDY[i % CANDY.length])); });
    T.blocks.count = Math.min(MAXB, T.stack.length); T.blocks.instanceMatrix.needsUpdate = true; if (T.blocks.instanceColor) T.blocks.instanceColor.needsUpdate = true;
    T.shown = T.stack.length;
  }
  // ---- falling, sliced and toppling pieces (short-lived meshes, a handful at a time)
  const fx = [];
  function piece(T, x, y, w, color, kind, extra = {}) {
    const m = new THREE.Mesh(blockGeo, std(color, { roughness: 0.45, transparent: true })); m.scale.set(w, 1, 1); m.position.set(x, y, 0); m.castShadow = true; T.pivot.add(m);
    const f = { T, m, kind, t: 0, x, y, ...extra }; fx.push(f); return f;
  }
  const kill = f => { f.m.removeFromParent(); f.m.material.dispose(); fx.splice(fx.indexOf(f), 1); };
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'blocks' }), banner = h('div', 'wt-banner');
  ctx.ui.append(banner);
  const showBanner = (text, cls = '') => { banner.textContent = text; banner.className = 'wt-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'wt-banner'; }, 1500); };
  let off = 0, prevA = 0;
  const swingY = T => BH * T.h + SWING_UP;
  const worldPos = (T, x, y) => ({ x: T.x + x, y: PLINTH + y - off, z: 0 });
  function landFromEvent(T, ev) {
    T.stack.length = Math.max(0, ev.h - 1); T.stack.push({ x: ev.x, w: ev.w }); redraw(T);
    if (ev.cut) piece(T, ev.cut[0], BH * (ev.h - 0.5), ev.cut[1], CANDY[(ev.h - 1) % CANDY.length], 'chip', { vx: Math.sign(ev.cut[0] - ev.x) * 2.2, vy: 1.5, spin: Math.sign(ev.cut[0] - ev.x) * -5 });
    const p = worldPos(T, ev.x, BH * ev.h + 0.4);
    if (ev.k === 'perfect') { floatText(stage, p.x, p.y, p.z, 'PERFECT!', 'good'); if (T.pid === ctx.me) ctx.sfx('good'); ctx.actor(T.pid)?.play('cheer', 650); }
    else if (T.pid === ctx.me) ctx.sfx(ev.k === 'trim' ? 'splat' : 'tap');
  }
  return {
    start() { showBanner('Stack!'); },
    state(g) {
      const now = performance.now() / 1000;
      const sc2 = {};
      for (const [k, row] of Object.entries(g.p)) {
        const T = towers.get(+k); if (!T) continue;
        const [hh, wob, sw, bid, ph, w, tw, tx] = row; sc2[k] = hh;
        T.h = hh; T.wob = wob; T.tw = tw; T.tx = tx; T.w = w;
        if (bid !== T.bid) { T.bid = bid; T.ph = ph; T.pressed = false; }
        else { let e = ph - T.ph; if (Math.abs(e) > 0.8) T.ph = ph; else T.ph += e * 0.25; }
        T.swinging = !!sw; T.at = now;
        T.label.set(String(hh));
      }
      bar.set(sc2, g.left);
    },
    event(ev) {
      const T = towers.get(ev.pid);
      if (ev.e === 'place' && T) {
        const mine = T.fallingMine;
        if (mine) { mine.ev = ev; T.fallingMine = null; }
        else piece(T, ev.from, swingY({ h: ev.h - 1 }), T.tw, CANDY[(ev.h - 1) % CANDY.length], 'fall', { ev, to: BH * (ev.h - 0.5) });
      } else if (ev.e === 'miss' && T) {
        const mine = T.fallingMine; T.fallingMine = null;
        if (mine) { mine.kind = 'tumble'; mine.vx = Math.sign(ev.x - T.tx) * 1.5; mine.vy = 0; mine.spin = 3; }
        else piece(T, ev.x, swingY(T), ev.w, CANDY[ev.y % CANDY.length], 'tumble', { vx: Math.sign(ev.x) * 1.5, vy: 0, spin: 3 });
        if (T.pid === ctx.me) { ctx.sfx('bad'); const p = worldPos(T, ev.x, BH * ev.y + 1); floatText(stage, p.x, p.y, p.z, 'Missed!', 'bad'); }
      } else if (ev.e === 'topple' && T) {
        // a drop that set off the topple arrives in the same update as the topple, while its block is still falling on
        // screen: landing it after the trim drew the tower one block too tall (the top block level with the next swing).
        // Any block still falling onto this tower is dropped; it is one of ev.lost, so it tumbles off with the rest (owner, 2026-10-22).
        for (const f of fx.filter(f => f.T === T && f.kind === 'fall')) kill(f);         // (it is in ev.lost, so it tumbles off below)
        T.fallingMine = null; T.pressed = false;
        ev.lost.forEach(([x, w], i) => { const y = BH * (ev.h + i + 0.5), s = (i % 2 ? 1 : -1) * (0.6 + i * 0.15); piece(T, x, y, w, CANDY[(ev.h + i) % CANDY.length], 'chip', { vx: s * 2 + (x > 0 ? 1 : -1), vy: 1 + i * 0.3, spin: -s * 3 }); });
        T.stack.length = ev.h; redraw(T);
        const p = worldPos(T, 0, BH * ev.h + 1.2); floatText(stage, p.x, p.y, p.z, 'TOPPLED!', 'bad');
        ctx.actor(ev.pid)?.play('hit', 900); ctx.sfx(ev.pid === ctx.me ? 'out' : 'hit');
        if (ev.pid === ctx.me) showBanner('Toppled!', 'bad');
      } else if (ev.e === 'end') { showBanner('Time!'); ctx.sfx('win'); for (const T2 of towers.values()) T2.swinging = false; }
    },
    input(inp) {
      // your press: judged by the swing you SEE (the server checks it is recent), and the block starts falling at once
      const a = inp.b & IN.A, edge = a && !prevA; prevA = a;
      const T = towers.get(ctx.me); if (!edge || !T || !T.swinging || T.pressed) return;
      T.pressed = true; ctx.send('drop', [T.bid, Math.round(T.ph * 1000) / 1000]);
      const x = T.tx + R.amp * Math.sin(T.ph);
      T.fallingMine = piece(T, x, swingY(T), T.tw, CANDY[T.h % CANDY.length], 'fall', { bid: T.bid, to: BH * (T.h + 0.5), mine: true });
    },
    pose() { return 'idle'; },
    frame(dt, t) {
      // a phone held upright with three or four towers: centre on your own (the score bar has everyone's height)
      const portrait = innerHeight > innerWidth * 1.15, mineT = towers.get(ctx.me), focus = portrait && mineT && towers.size >= 3;
      let top = 0;
      for (const T of towers.values()) {
        if (T.swinging) T.ph += T.w * dt;
        const showSwing = T.swinging && !T.pressed;
        const sx = T.tx + R.amp * Math.sin(T.ph), sy = swingY(T);
        T.swing.visible = T.rope.visible = T.aim.visible = showSwing;
        if (showSwing) {
          T.swing.position.set(sx, sy, 0); T.swing.scale.set(T.tw, 1, 1); T.swing.material.color.set(CANDY[T.h % CANDY.length]);
          T.rope.position.set(sx, sy + BH / 2 + 1.5, 0);
          T.aim.position.set(sx, BH * T.h + 0.012, 0); T.aim.scale.set(T.tw, 1, 1);
        }
        // sway: the more wobble, the wider and faster
        const amp = Math.min(0.09, T.wob * 0.07), want = amp * Math.sin(t * (2.2 + T.wob * 4) + T.x);
        T.sway += (want - T.sway) * Math.min(1, dt * 8); T.pivot.rotation.z = T.sway;
        T.anchor.position.set(T.tx, BH * T.h + SWING_UP + 1.9, 0);
        const danger = T.wob >= 0.75;
        const pct = Math.round(Math.min(1, T.wob) * 100) + '%'; if (T.fill.style.width !== pct) T.fill.style.width = pct;
        T.label.el.classList.toggle('danger', danger);
        // the lift follows the character's height
        const a = ctx.pos(T.pid), ly = a ? a.y : BH * T.h;
        T.deck.position.set(T.x + R.lift, ly - 0.07, R.liftZ); T.mast.position.set(T.x + R.lift, ly / 2 - 0.07, R.liftZ); T.mast.scale.y = Math.max(0.05, ly);
        T.deck.visible = T.mast.visible = ly > 0.05;
        if (!focus || T.pid === ctx.me) top = Math.max(top, BH * T.h + PLINTH + SWING_UP + 1.6);
      }
      // falling / tumbling pieces
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t += dt;
        if (f.kind === 'fall') {
          const k = Math.min(1, f.t / 0.28); f.m.position.y = f.y + (f.to - f.y) * k * k;
          if (k >= 1) {
            if (f.ev) { kill(f); landFromEvent(f.T, f.ev); }
            else if (f.t > 0.9) { kill(f); if (f.T.fallingMine === f) { f.T.fallingMine = null; f.T.pressed = false; } }   // the server never took it
          }
        } else {
          f.vy -= 14 * dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.rotation.z += f.spin * dt;
          if (f.t > 0.7) f.m.material.opacity = Math.max(0, 1 - (f.t - 0.7) * 2.5);
          if (f.t > 1.2 || f.m.position.y < -2) kill(f);
        }
      }
      // the scene sinks as the tallest tower grows, so its top stays in view
      // (a phone held upright has height to spare: show more of the tower)
      const tall = portrait ? 10.5 : 6.6, wantOff = Math.max(0, top - tall + 0.2);
      off += (wantOff - off) * Math.min(1, dt * 2.5); group.position.y = -off;
      ctx.camera(focus ? { cx: mineT.x + 0.4, cz: 0, hw: 4.4, hd: 2.4, tall, pitch: 12 } : { cx: 0, cz: 0, hw: hw + 0.4, hd: 2.4, tall, pitch: 12 });
    },
    dispose() { bar.el.remove(); banner.remove(); for (const T of towers.values()) T.label.remove(); clearTimeout(showBanner.t); skyTex.dispose(); tentTex.dispose(); },
  };
}
