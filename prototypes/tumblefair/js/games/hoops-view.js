// HOOPS VIEW — browser-only drawing bits the basketball games share (Hoop Frenzy, Court Clash, Letter Shot), next to
// the pure rules in hoops-kit.js:
//   createHoopsArt(ctx)       -> { hoop({ x, y, z, nx, nz, color, pole }), ball({ fire, gold }), fireSprite(), mats, dispose }
//                                a hoop = pole + backboard + orange rim + a white net that swishes (`.swish()`);
//                                a ball = a seamed orange ball (Halloween: a little pumpkin with a stem)
//   powerPanel(ctx, opts)     -> the HOLD-to-shoot meter: a track with the green band, a fill that swings 0 -> 1 -> 0
//                                while you hold (the kit's charge()), and one big button (Space works too).
//                                opts: { period, label, onShoot(p) }; .band(lo, hi), .mode('ready'|'wait'|'done'|…),
//                                .info(html), .frame(), .holding, .dispose()
import { charge, BOARD, HOOP_R, BALL_R } from './hoops-kit.js';
import { canvasTexture } from '../client/stage.js';
import { h } from '../client/gamehud.js';
import { pumpkinGeo, stemGeo, PALETTE } from '../client/halloween.js';

export function createHoopsArt(ctx, { ballR = BALL_R, hoopR = HOOP_R } = {}) {
  const { THREE } = ctx, HW = ctx.season === 'halloween', mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }); mats.push(m); return m; };
  const g_ = g => { geos.push(g); return g; };
  // ball: orange with black seams (canvas), or a pumpkin
  const seams = canvasTexture(256, 128, (c, w, hh) => { c.fillStyle = '#ff8a2a'; c.fillRect(0, 0, w, hh); c.strokeStyle = '#2a1408'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, hh / 2); c.lineTo(w, hh / 2); c.moveTo(w / 4, 0); c.lineTo(w / 4, hh); c.moveTo(w * 3 / 4, 0); c.lineTo(w * 3 / 4, hh); c.stroke(); c.beginPath(); c.ellipse(w / 2, hh / 2, w * 0.16, hh * 0.5, 0, 0, Math.PI * 2); c.stroke(); });
  texs.push(seams);
  const ballGeo = g_(HW ? pumpkinGeo(THREE, ballR, 8) : new THREE.SphereGeometry(ballR, 18, 12)), stem = HW ? g_(stemGeo(THREE, ballR)) : null;
  const ballMat = HW ? std(PALETTE.pumpkin, { roughness: 0.5 }) : std('#ffffff', { map: seams, roughness: 0.55 });
  const fireMat = std('#ff6a1a', { emissive: '#ff3a00', emissiveIntensity: 0.9, map: HW ? null : seams });
  const goldMat = std('#ffd23f', { emissive: '#b88a00', emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.3 });
  const stemMat = std('#3f7a2a');
  const flameTex = canvasTexture(64, 64, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,240,160,1)'); g.addColorStop(0.35, 'rgba(255,150,30,.9)'); g.addColorStop(1, 'rgba(255,40,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
  texs.push(flameTex);
  const boardTex = canvasTexture(256, 160, (c, w, hh) => { c.fillStyle = HW ? '#2a1c40' : '#ffffff'; c.fillRect(0, 0, w, hh); c.strokeStyle = HW ? PALETTE.orange : '#e8473a'; c.lineWidth = 10; c.strokeRect(6, 6, w - 12, hh - 12); c.lineWidth = 8; c.strokeRect(w * 0.34, hh * 0.42, w * 0.32, hh * 0.38); });
  texs.push(boardTex);
  return {
    mats, std, g_,
    /** A whole hoop with its rim centre at (x, y, z), its board facing (nx, nz). color = the pole's colour. */
    hoop({ x, y, z, nx = 0, nz = 1, color = '#3d8bff', pole = true, r = hoopR }) {
      const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = Math.atan2(nx, nz);
      const board = new THREE.Mesh(g_(new THREE.BoxGeometry(BOARD.w, BOARD.h, 0.06)), [std('#dddddd'), std('#dddddd'), std('#dddddd'), std('#dddddd'), std('#ffffff', { map: boardTex }), std('#dddddd')]);
      board.position.set(0, BOARD.h / 2 - BOARD.below, -BOARD.back - 0.03); board.castShadow = true; grp.add(board);
      const rim = new THREE.Mesh(g_(new THREE.TorusGeometry(r, 0.028, 8, 28).rotateX(Math.PI / 2)), std(HW ? PALETTE.orange : '#ff5a1a', { metalness: 0.3, roughness: 0.4 }));
      grp.add(rim);
      const brace = new THREE.Mesh(g_(new THREE.BoxGeometry(0.08, 0.04, BOARD.back - r)), rim.material); brace.position.set(0, 0, -(BOARD.back + r) / 2); grp.add(brace);
      const net = new THREE.Mesh(g_(new THREE.CylinderGeometry(r * 0.98, r * 0.55, 0.5, 12, 3, true).translate(0, -0.25, 0)), std(HW ? PALETTE.slime : '#ffffff', { wireframe: true, emissive: HW ? PALETTE.slime : '#000000', emissiveIntensity: HW ? 0.6 : 0 }));
      grp.add(net);
      if (pole) {
        const ph = y - BOARD.below + 0.2, p = new THREE.Mesh(g_(new THREE.CylinderGeometry(0.09, 0.11, ph, 8)), std(color)); p.position.set(0, -y + ph / 2, -BOARD.back - 0.45); p.castShadow = true; grp.add(p);
        const arm = new THREE.Mesh(g_(new THREE.BoxGeometry(0.1, 0.1, 0.45)), std(color)); arm.position.set(0, 0.1, -BOARD.back - 0.25); grp.add(arm);
        const pad = new THREE.Mesh(g_(new THREE.CylinderGeometry(0.22, 0.26, 0.25, 10)), std(color)); pad.position.set(0, -y + 0.12, -BOARD.back - 0.45); grp.add(pad);
      }
      let sw = 0;
      grp.userData.swish = () => { sw = 1; };
      grp.userData.frame = dt => { if (sw > 0) { sw = Math.max(0, sw - dt * 2.5); net.scale.set(1 - sw * 0.25, 1 + Math.sin(sw * Math.PI) * 0.5, 1 - sw * 0.25); } };
      return grp;
    },
    /** A ball mesh; .look({ fire, gold }) recolours it. A flame sprite rides on it when it is on fire. */
    ball() {
      const m = new THREE.Mesh(ballGeo, ballMat); m.castShadow = true;
      if (stem) m.add(new THREE.Mesh(stem, stemMat));
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); mats.push(fl.material);
      fl.scale.setScalar(ballR * 6); m.add(fl);
      m.userData.look = ({ fire = false, gold = false } = {}) => { m.material = gold ? goldMat : fire ? fireMat : ballMat; fl.material.opacity = fire ? 0.9 : 0; };
      m.userData.flicker = t => { if (fl.material.opacity > 0) { fl.scale.setScalar(ballR * (5.5 + Math.sin(t * 30) * 0.8)); } };
      return m;
    },
    dispose() { for (const m of mats) m.dispose(); for (const g of geos) g.dispose(); for (const t of texs) t.dispose(); },
  };
}

/** The HOLD-to-shoot panel at the bottom of a phone that plays. Runs on the phone (so lag never moves the meter). */
export function powerPanel(ctx, { period, label = 'HOLD to shoot', onShoot }) {
  const el = h('div', 'hk-panel', `
    <div class="hk-info"></div>
    <div class="hk-meter"><div class="hk-track"><i class="hk-band"></i><i class="hk-fill"></i><i class="hk-mark"></i></div></div>
    <button class="hk-btn big-btn">${label}</button>`);
  ctx.ui.append(el);
  const $ = s => el.querySelector(s), fill = $('.hk-fill'), band = $('.hk-band'), mark = $('.hk-mark'), btn = $('.hk-btn'), info = $('.hk-info');
  let mode = 'wait', t0 = 0, holding = false, lastP = null, lo = 0.4, hi = 0.6;
  const now = () => performance.now() / 1000;
  const TEXT = { ready: label, hold: 'LET GO in the green!', wait: 'Get ready…', fly: 'Watch it…', done: 'All done!', watch: 'Watching…' };
  function down(e) { e?.preventDefault?.(); if (mode !== 'ready' || holding) return; holding = true; t0 = now(); ctx.sfx('tap'); }
  function up(e) { e?.preventDefault?.(); if (!holding) return; holding = false; const p = Math.round(charge(now() - t0, period) * 1000) / 1000; lastP = p; onShoot(p); }
  btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
  const kd = e => { if ((e.code === 'Space' || e.code === 'Enter') && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) { e.preventDefault(); if (!e.repeat) down(); } };
  const ku = e => { if (e.code === 'Space' || e.code === 'Enter') up(e); };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  return {
    el,
    get holding() { return holding; },
    band(a, b) { lo = Math.max(0, a); hi = Math.min(1, b); band.style.left = (lo * 100).toFixed(1) + '%'; band.style.width = ((hi - lo) * 100).toFixed(1) + '%'; },
    mode(m) { if (m === mode) return; mode = m; if (m !== 'ready') holding = false; el.dataset.mode = m; btn.disabled = m !== 'ready'; btn.textContent = TEXT[m] || m; },
    info(html) { if (info.innerHTML !== html) info.innerHTML = html; },
    frame() {
      const p = holding ? charge(now() - t0, period) : 0;
      fill.style.width = (p * 100).toFixed(1) + '%';
      fill.classList.toggle('in', holding && p >= lo && p <= hi);
      if (holding) btn.textContent = TEXT.hold; else if (mode === 'ready') btn.textContent = TEXT.ready;
      mark.style.left = ((lastP ?? 0) * 100).toFixed(1) + '%'; mark.style.opacity = lastP == null || holding ? 0 : 1;
    },
    dispose() { removeEventListener('keydown', kd); removeEventListener('keyup', ku); el.remove(); },
  };
}
