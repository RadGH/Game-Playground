// MONSTER FORECAST on a screen. Up top, in 3D: the monster on a little fairground stage, built here from plain shapes
// (body, belly, eyes with a glowing iris, arms, feet, tail / ears / horns / spikes / wind-up key by monster), and every
// player's character facing it. Each TELL is a procedural pose (crouch, arms up, eyes glow — the iris material's
// emissive is turned up, never a light switched on —, lick, breath in, tail swish, lean back, stomp, wiggle) whose size
// shrinks in later rounds. On the reveal the monster does its move and each character acts out its pick (jump aside /
// guard / punch), then cheers or gets bonked.
// Below, a cheat sheet (each move, its two tells, its answer) and, on a phone that plays, three big answer buttons.
import { chip, esc, floatText } from '../../client/gamehud.js';
import { MONSTERS, TELLS, ANSWERS } from './sim.js';
import { ANSWER_NAMES, ANSWER_HINT } from './monsters.js';

const INK = '#0d2228';
const ICON = {
  dodge: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 30 q10 -22 26 -18" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M26 6 l8 6 l-9 5" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="33" r="4" fill="#fff" stroke="${INK}" stroke-width="3"/></svg>`,
  block: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 L34 9 V20 Q34 31 20 37 Q6 31 6 20 V9 Z" fill="#9fd8ff" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><path d="M20 9 V32" stroke="${INK}" stroke-width="3"/></svg>`,
  counter: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="12" width="20" height="17" rx="6" fill="#ffd8a8" stroke="${INK}" stroke-width="3.5"/><path d="M14 12 v6 M20 12 v6 M25 12 v6" stroke="${INK}" stroke-width="2.5"/><path d="M29 18 h6 M30 12 l5 -3 M30 24 l5 3" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></svg>`,
};

export function createView(ctx) {
  const { ui, players, me, init, THREE } = ctx, watching = me == null;
  const mon = MONSTERS.find(m => m.id === init.monster) || MONSTERS[0];
  ui.innerHTML = `
    <div class="mf-top"><span class="mf-round">${esc(mon.name)}</span><span class="clock"><b>--</b></span></div>
    <div class="mf-chips">${players.map(p => chip(p, '<em class="sc">0</em><strong class="mf-st"></strong>')).join('')}</div>
    <div class="mf-say" aria-live="polite"></div>
    <div class="mf-banner"></div>
    <div class="mf-panel">
      <div class="mf-sheet"><b class="mf-sheet-h">${esc(mon.name)}'s cheat sheet</b>${mon.moves.map(m => `
        <div class="mf-row" data-m="${m.id}"><span class="mf-move">${esc(m.name)}</span><span class="mf-tells">${m.tells.map(t => `<i>${esc(TELLS[t].name)}</i>`).join('<u>or</u>')}</span><span class="mf-ans mf-${m.answer}">${ICON[m.answer]}${ANSWER_NAMES[m.answer]}</span></div>`).join('')}
        <p class="mf-fake">Fake-outs now: the LAST tell is the true one!</p></div>
      <div class="mf-btns">${ANSWERS.map(a => `<button class="mf-btn mf-${a}" data-a="${a}">${ICON[a]}<b>${ANSWER_NAMES[a]}</b><small>${ANSWER_HINT[a]}</small></button>`).join('')}</div>
    </div>
    <p class="mf-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.mf-chips [data-pid="${me}"]`)?.classList.add('me');
  const tall = () => innerHeight > innerWidth * 1.15;
  const safe = () => ctx.stage.setSafe?.(tall() ? { top: 0.16, bottom: 0.5, left: 0.03, right: 0.03 } : { top: 0.15, bottom: 0.36, left: 0.03, right: 0.03 });
  safe(); addEventListener('resize', safe);

  // ---------------------------------------------------------------- the 3D stage and the monster
  const G = ctx.group, mats = [];
  const M = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, ...o }); mats.push(m); return m; };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = G) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  mesh(new THREE.CylinderGeometry(5.2, 5.4, 0.3, 40), M('#a8633a'), 0, 0.15, -0.2).receiveShadow = true;
  mesh(new THREE.TorusGeometry(5.22, 0.08, 6, 48).rotateX(Math.PI / 2), M('#ffd23f'), 0, 0.3, -0.2);
  // a striped tent wall behind
  const stripes = []; for (let i = 0; i < 12; i++) { const a0 = Math.PI * (0.6 + i * 0.0667); stripes.push(mesh(new THREE.CylinderGeometry(6, 6, 4.2, 3, 1, true, a0, Math.PI * 0.0667), M(i % 2 ? '#fff3e0' : '#e8434f', { side: THREE.DoubleSide }), 0, 2.1, 0.6)); }
  const L = mon.look, mon3 = new THREE.Group(); mon3.position.set(0, 0.3, -2); G.add(mon3);
  const bodyMat = M(L.body), bellyMat = M(L.belly), accMat = M(L.accent), white = M('#ffffff', { roughness: 0.3 }), ink = M(INK, { roughness: 0.4 });
  const irisMat = M(L.eye, { emissive: new THREE.Color(L.eye), emissiveIntensity: 0.05, roughness: 0.3 });
  const tongueMat = M('#ff6f91');
  const core = new THREE.Group(); mon3.add(core);                  // squashes and stretches
  const body = mesh(new THREE.SphereGeometry(1.15, 22, 16), bodyMat, 0, 1.3, 0, core); body.scale.set(1, 1.05, 0.92);
  mesh(new THREE.SphereGeometry(0.82, 18, 12), bellyMat, 0, 1.12, 0.48, core).scale.set(1, 1.05, 0.55);
  const eyeR = L.bigEyes ? 0.34 : 0.26, eyes = [];
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(eyeR, 16, 12), white, s * 0.42, 1.95 + (L.bigEyes ? 0.2 : 0), 0.82, core);
    const iris = mesh(new THREE.SphereGeometry(eyeR * 0.6, 14, 10), irisMat, 0, 0, eyeR * 0.62, e);
    mesh(new THREE.SphereGeometry(eyeR * 0.3, 10, 8), ink, 0, 0, eyeR * 0.5, iris);
    eyes.push(e);
  }
  const mouth = mesh(new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ink, 0, 1.42, 0.92, core); mouth.scale.set(1, 0.5, 0.4); mouth.rotation.x = 0.2;
  const tongue = mesh(new THREE.CapsuleGeometry(0.11, 0.35, 4, 8), tongueMat, 0, 1.3, 1.06, core); tongue.rotation.x = 1.2; tongue.scale.setScalar(0.001);
  const arms = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * 1.05, 1.45, 0.1); core.add(piv);
    mesh(new THREE.CapsuleGeometry(0.2, 0.6, 4, 10), bodyMat, 0, -0.42, 0, piv);
    mesh(new THREE.SphereGeometry(0.24, 12, 8), accMat, 0, -0.85, 0, piv);
    piv.rotation.z = s * 0.35; arms.push(piv);
  }
  const feet = [];
  for (const s of [-1, 1]) feet.push(mesh(new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), accMat, s * 0.5, 0, 0.25, mon3));
  feet.forEach(f => f.scale.set(1, 0.8, 1.4));
  let tail = null;
  if (L.tail) { tail = new THREE.Group(); tail.position.set(0, 0.8, -0.95); core.add(tail); [0.28, 0.22, 0.17].forEach((r, i) => mesh(new THREE.SphereGeometry(r, 12, 8), i === 2 ? accMat : bodyMat, 0, 0.12 * i, -0.3 - i * 0.32, tail)); }
  if (L.ears) for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.28, 0.6, 10), bodyMat, s * 0.62, 2.35, 0, core); e.rotation.z = -s * 0.5; }
  if (L.horns) for (const s of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.16, 0.55, 10), accMat, s * 0.55, 2.4, 0.1, core); e.rotation.z = -s * 0.35; }
  if (L.spikes) for (let i = 0; i < 4; i++) { const e = mesh(new THREE.ConeGeometry(0.16, 0.4, 6), accMat, 0, 2.3 - i * 0.38, -0.55 - i * 0.18, core); e.rotation.x = -0.5 - i * 0.3; }
  if (L.key) { const k = new THREE.Group(); k.position.set(0, 1.4, -1.15); core.add(k); mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8).rotateX(Math.PI / 2), accMat, 0, 0, -0.2, k); for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 14), accMat, s * 0.22, 0, -0.45, k); core.userData.key = k; }
  const ring = mesh(new THREE.TorusGeometry(1, 0.08, 6, 36).rotateX(Math.PI / 2), M('#ffffff', { transparent: true, opacity: 0 }), 0, 0.35, -0.3);
  ring.castShadow = false;
  ctx.camera({ cx: 0, cz: 0.1, hw: 3.4, hd: 2.5, pitch: 20, tall: 3.4 }, { instant: true });

  // players in a row in front of the monster, backs half to the camera
  const n = players.length, crew = new Map();
  players.forEach((p, i) => {
    const x = (i - (n - 1) / 2) * 1.35, slot = { x, z: 2.2, actor: null, dx: 0, hop: 0 };
    crew.set(p.pid, slot);
    ctx.createActor({ look: p.look || { race: 'human', seed: p.pid * 977 + 1 }, costume: p.costume, seat: p.seat }, { scale: 0.85 }).then(a => {
      if (!a) return; slot.actor = a; a.place(x, 0.3, slot.z, Math.PI + x * -0.12);
    }).catch(() => {});
  });

  // ---------------------------------------------------------------- tells and moves
  let anim = null;           // { cues: [[tell, dur]], t: 0, size }
  let strike = null;         // { kind: answer, t: 0 }
  let idleT = 0, blinkAt = 2;
  function poseFrom(tell, e, t, size) {
    const k = e * size, P = { sy: 1, sxz: 1, y: 0, lean: 0, wig: 0, arm: 0, glow: 0, tongue: 0, tail: 0, foot: 0 };
    if (tell === 'crouch') { P.sy = 1 - 0.28 * k; P.y = -0.25 * k; P.arm = -0.3 * k; }
    if (tell === 'armsUp') P.arm = 2.5 * k;
    if (tell === 'eyesGlow') P.glow = 3.2 * k;
    if (tell === 'lick') P.tongue = k;
    if (tell === 'breathIn') { P.sxz = 1 + 0.2 * k; P.sy = 1 + 0.12 * k; }
    if (tell === 'tailSwish') P.tail = Math.sin(t * 13) * 1.1 * k;
    if (tell === 'lean') P.lean = -0.42 * k;
    if (tell === 'stomp') { P.foot = Math.max(0, Math.sin(t * 9)) * 0.45 * k; P.y = -Math.max(0, -Math.sin(t * 9)) * 0.06 * k; }
    if (tell === 'wiggle') P.wig = Math.sin(t * 24) * 0.16 * k;
    if (!L.tail && tell === 'tailSwish') P.wig = Math.sin(t * 13) * 0.1 * k;
    return P;
  }
  function apply(P, t) {
    core.scale.set(P.sxz, P.sy, P.sxz); core.position.y = P.y; core.rotation.x = P.lean; core.rotation.z = P.wig;
    arms.forEach((a, i) => { const s = i ? 1 : -1; a.rotation.z = s * (0.35 + P.arm); });
    irisMat.emissiveIntensity = 0.05 + P.glow;
    tongue.scale.setScalar(Math.max(0.001, P.tongue)); tongue.position.x = Math.sin(t * 10) * 0.08 * P.tongue;
    if (tail) tail.rotation.y = P.tail;
    feet[1].position.y = P.foot;
    if (core.userData.key) core.userData.key.rotation.z = t * 2;
  }
  const env = (u, up = 0.3, down = 0.18) => u < up ? u / up : u > 1 - down ? Math.max(0, (1 - u) / down) : 1;
  function monsterFrame(dt) {
    idleT += dt;
    let P = poseFrom(null, 0, idleT, 0);
    if (anim) {
      anim.t += dt; let t = anim.t;
      for (const [tell, dur] of anim.cues) { if (t <= dur) { P = poseFrom(tell, env(t / dur), idleT, anim.size); break; } t -= dur; }
      if (anim.hold && t > 0) { const [tell] = anim.cues[anim.cues.length - 1]; P = poseFrom(tell, 0.35, idleT, anim.size); }
    }
    P.y += Math.sin(idleT * 2.2) * 0.04;
    apply(P, idleT);
    // the move itself
    mon3.position.y = 0.3; mon3.position.z = -2; mon3.rotation.y = 0;
    let mouthOpen = 0.5;
    if (strike) {
      strike.t += dt; const u = Math.min(1, strike.t / 0.9), s = Math.sin(u * Math.PI);
      if (strike.kind === 'dodge') { mon3.position.y = 0.3 + Math.sin(Math.min(1, u * 1.4) * Math.PI) * 1.8; mon3.position.z = -2 + u * 1.6; if (u > 0.68) { ring.material.opacity = Math.max(0, 1 - (strike.t - 0.62) * 1.5); ring.scale.setScalar(1 + (strike.t - 0.62) * 6); } }
      if (strike.kind === 'block') { mon3.position.z = -2 + s * 2.1; mouthOpen = 0.5 + s * 1.3; arms.forEach((a, i) => { a.rotation.x = -s * 1.6; }); }
      if (strike.kind === 'counter') { core.rotation.x = -0.35 * s; mouthOpen = 0.5 + s * 1.6; mon3.rotation.y = Math.sin(strike.t * 30) * 0.08 * s; }
      if (strike.t > 1.6) { strike = null; arms.forEach(a => { a.rotation.x = 0; }); ring.material.opacity = 0; }
    }
    mouth.scale.y = mouthOpen;
    blinkAt -= dt; const blink = blinkAt < 0.12 && blinkAt > 0; if (blinkAt < 0) blinkAt = 2 + (idleT * 7.3 % 2);
    for (const e of eyes) e.scale.y = blink ? 0.15 : 1;
  }

  // ---------------------------------------------------------------- screens
  let phase = '', round = -1, pick = null, shown = -1;
  const paintPick = () => { for (const b of ui.querySelectorAll('.mf-btn')) { b.classList.toggle('on', b.dataset.a === pick); b.setAttribute('aria-pressed', b.dataset.a === pick); } ui.classList.toggle('picked', pick != null); };
  ui.addEventListener('click', e => {
    const b = e.target.closest('.mf-btn'); if (!b || watching || (phase !== 'tell' && phase !== 'pick')) return;
    pick = b.dataset.a; ctx.send('pick', pick); ctx.sfx('pick'); paintPick();
  });
  function onReveal(rv) {
    const move = mon.moves[rv.m];
    strike = { kind: move.answer, t: 0 }; anim = null;
    $('.mf-banner').innerHTML = `<b>${esc(move.name)}!</b><span class="mf-ans mf-${move.answer}">${ICON[move.answer]}${ANSWER_NAMES[move.answer]}</span>`;
    ui.querySelectorAll('.mf-row').forEach(r => r.classList.toggle('hot', r.dataset.m === move.id));
    for (const p of players) {
      const o = rv.out[p.pid], c = crew.get(p.pid); if (!o || !c) continue;
      const a = c.actor;
      if (o.pick === 'dodge') { c.dx = (c.x <= 0 ? -1 : 1) * 0.9; a?.play('jump', 700); }
      else if (o.pick === 'block') a?.play('guard', 1100);
      else if (o.pick === 'counter') a?.play('punch', 600);
      setTimeout(() => { if (!c.actor) return; if (o.ok) c.actor.play('cheer', 1100); else { c.actor.play('hit', 900); c.hop = 1; } c.dx = 0; if (o.gain) floatText(ctx.stage, c.x, 2.2, c.z, `+${o.gain}`, 'good'); }, 750);
    }
    const mine = me != null ? rv.out[me] : null;
    if (mine) setTimeout(() => ctx.sfx(mine.ok ? 'good' : 'hit'), 700); else ctx.sfx('throw');
  }
  function note(g) {
    if (g.phase === 'ready') return watching ? `Here comes ${mon.name}! Study the cheat sheet…` : 'Study the cheat sheet: each move has its tells and its answer.';
    if (g.phase === 'end') {
      if (init.solo && me != null) { const r = g.right?.[me] ?? 0; return `You read ${r} of ${init.rounds} moves — ${r >= 7 ? 'monster whisperer!' : r >= 5 ? 'sharp eyes!' : r >= 3 ? 'not bad!' : 'it got you good.'}`; }
      return `${mon.name} stomps off in a huff. Best reader wins!`;
    }
    if (g.phase === 'reveal') return '';
    if (watching) return `${(g.in || []).length} of ${players.length} have picked`;
    return pick ? `Picked ${ANSWER_NAMES[pick]}. You can still change it!` : 'Watch the tell, then pick!';
  }
  return {
    priv(d) { if (phase === 'tell' || phase === 'pick') { pick = d.pick; paintPick(); } },
    state(g) {
      if (g.round !== round) { round = g.round; pick = null; paintPick(); $('.mf-banner').innerHTML = ''; ui.querySelectorAll('.mf-row').forEach(r => r.classList.remove('hot')); }
      if (g.phase !== phase) {
        if (g.phase === 'tell') {
          anim = { cues: g.cues, t: 0, size: g.tier === 1 ? 1 : g.tier === 2 ? 0.62 : 0.5, hold: true };
          const real = g.cues[g.cues.length - 1][0];
          $('.mf-say').textContent = g.tier === 1 ? TELLS[real].say : '';
          ctx.sfx('tap');
        }
        if (g.phase === 'pick' && anim) anim.hold = true;
        if (g.phase === 'reveal' && g.reveal && shown !== g.round) { shown = g.round; $('.mf-say').textContent = ''; onReveal(g.reveal); }
        if (g.phase === 'end') { ctx.sfx('win'); anim = null; pick = null; paintPick(); ui.querySelectorAll('.mf-row').forEach(r => r.classList.remove('hot')); $('.mf-say').textContent = ''; $('.mf-banner').innerHTML = ''; for (const c of crew.values()) c.actor?.play('cheer', 2000); }
      }
      phase = g.phase; ui.dataset.phase = g.phase; ui.dataset.tier = g.tier || 1;
      $('.clock b').textContent = g.left;
      $('.mf-round').textContent = g.phase === 'end' ? 'Final scores' : g.round < 0 ? mon.name : `Round ${g.round + 1} of ${init.rounds}${g.tier === 3 ? ' · fake-outs!' : g.tier === 2 ? ' · quicker!' : ''}`;
      const best = Math.max(...Object.values(g.scores));
      for (const p of players) {
        const el = ui.querySelector(`.mf-chips [data-pid="${p.pid}"]`); if (!el) continue;
        el.querySelector('.sc').textContent = g.scores[p.pid];
        el.classList.toggle('lead', g.scores[p.pid] === best && best > 0);
        const st = el.querySelector('.mf-st'), o = g.reveal?.out[p.pid];
        st.textContent = g.phase === 'reveal' && o ? (o.ok ? `+${o.gain}${o.streak >= 3 ? ' streak!' : ''}` : (o.pick ? 'bonked!' : 'no pick')) : (g.phase === 'tell' || g.phase === 'pick') ? ((g.in || []).includes(p.pid) ? 'ready' : '…') : '';
        st.className = 'mf-st ' + (g.phase === 'reveal' && o ? (o.ok ? 'good' : 'bad') : '');
      }
      $('.mf-note').textContent = note(g);
    },
    frame(dt) {
      monsterFrame(dt);
      for (const c of crew.values()) {
        if (!c.actor) continue;
        c.hop = Math.max(0, c.hop - dt * 2.5);
        const cx = c.actor.group.position.x, tx = c.x + c.dx;
        c.actor.place(cx + (tx - cx) * Math.min(1, dt * 9), 0.3, c.z + c.hop * 0.5, Math.PI + c.x * -0.12);
        c.actor.update(dt);
      }
    },
    dispose() { removeEventListener('resize', safe); for (const m of mats) m.dispose(); },
  };
}
