// LETTER SHOT, as drawn: one hoop on a little fairground half-court at dusk-ish, seven chalk marks on the boards round
// it (numbered on the floor), and everyone's character waiting on the sideline. The setter walks to the mark they
// picked and shoots; on a make everyone else walks onto that mark (side by side) and shoots at the same moment, each
// ball flying the exact path the server sent. A strip under the score bar spells each player's letters (F-A-I-R,
// Halloween B-O-O-!), lit as they earn them; a pill says what is happening and who it is waiting for. On a phone
// that plays: when you set, a little map of the court with the seven marks to tap; when it is your shot, the HOLD
// panel (the green band is that mark's); otherwise the panel says who you are watching.
import { PH, SPOTS, WORD as PLAY_WORD } from './sim.js';
import { idealPower, tolFor, pathAt } from '../hoops-kit.js';
import { createHoopsArt, powerPanel } from '../hoops-view.js';
import { scoreBar, floatText, h, esc } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';

export function createView(ctx) {
  const { THREE, group, stage, players, me, init } = ctx, HW = ctx.season === 'halloween', L = init.level;
  const WORD = HW ? 'BOO!' : init.word || PLAY_WORD;
  const art = createHoopsArt(ctx), std = art.std, g_ = art.g_, tags = [], who = init.who, H = init.hoop;
  const iOf = new Map(who.map((w, i) => [w.pid, i])), myI = me != null ? iOf.get(me) : null;
  const seatOf = i => players.find(p => p.pid === who[i].pid);
  const nameOf = i => (who[i].pid === me ? 'You' : who[i].name);
  // ---- court: boards, a painted key, the marks
  const floorTex = canvasTexture(512, 512, (c, w) => {
    c.fillStyle = HW ? '#2a2140' : '#d9a066'; c.fillRect(0, 0, w, w);
    c.strokeStyle = HW ? 'rgba(0,0,0,.25)' : 'rgba(120,70,20,.25)'; c.lineWidth = 2; for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, w); c.stroke(); }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 3);
  const floor = new THREE.Mesh(g_(new THREE.PlaneGeometry(22, 18).rotateX(-Math.PI / 2)), std('#ffffff', { map: floorTex, roughness: 0.85 })); floor.position.set(0, 0, 0); floor.receiveShadow = true; group.add(floor);
  const key = new THREE.Mesh(g_(new THREE.PlaneGeometry(3.4, 4.6).rotateX(-Math.PI / 2)), std(HW ? '#4a2a70' : '#3d8bff', { transparent: true, opacity: 0.45, depthWrite: false })); key.position.set(0, 0.01, H.z + 2.1); group.add(key);
  const arc = new THREE.Mesh(g_(new THREE.RingGeometry(4.75, 4.85, 48, 1, Math.PI * 0.07, Math.PI * 0.86).rotateX(-Math.PI / 2)), std('#ffffff', { side: THREE.DoubleSide }));
  arc.rotation.y = Math.PI; arc.position.set(0, 0.012, H.z); group.add(arc);
  const wall = new THREE.Mesh(g_(new THREE.PlaneGeometry(22, 7)), std(HW ? '#2b1a48' : '#7fc8f8', { roughness: 1 })); wall.position.set(0, 3.5, H.z - 1.6); group.add(wall);
  const hoop = art.hoop({ x: H.x, y: H.y, z: H.z, color: HW ? '#ff8a1a' : '#e8473a' }); group.add(hoop);
  const numTex = [];
  const markGeo = g_(new THREE.CircleGeometry(0.42, 22).rotateX(-Math.PI / 2)), marks = SPOTS.map((s, i) => {
    const m = new THREE.Mesh(markGeo, std(HW ? '#7dff5a' : '#ffffff', { emissive: HW ? '#3a8a2a' : '#000000', emissiveIntensity: HW ? 0.5 : 0 })); m.position.set(s.x, 0.02, s.z); group.add(m);
    const num = numTex[i] = canvasTexture(64, 64, (c, w) => { c.fillStyle = '#1d2b33'; c.font = '900 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), w / 2, w / 2 + 2); });
    const lab = new THREE.Mesh(g_(new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: num, transparent: true, depthWrite: false })); art.mats.push(lab.material); lab.material.map = num;
    lab.position.set(s.x, 0.03, s.z); group.add(lab); return m;
  });
  const glow = new THREE.Mesh(g_(new THREE.RingGeometry(0.46, 0.62, 28).rotateX(-Math.PI / 2)), std('#ffd23f', { emissive: '#ffb400', emissiveIntensity: 0.8 })); glow.visible = false; group.add(glow);
  // ---- shooters: on the sideline until it is their go
  const bench = i => ({ x: (i - (who.length - 1) / 2) * 1.1, z: H.z + 8, yaw: Math.PI });
  const A = who.map((w, i) => ({ i, actor: null, pos: { ...bench(i) }, to: { ...bench(i) } }));
  who.forEach((w, i) => {
    const p = seatOf(i);
    ctx.createActor(p ? { look: p.look || { race: 'human', seed: p.pid * 977 + 1 }, costume: p.costume, seat: p.seat } : { look: { race: 'dwarf', seed: 4711 }, seat: null }).then(a => { if (!a) return; A[i].actor = a; a.place(A[i].pos.x, 0, A[i].pos.z, A[i].pos.yaw); tags.push(stage.tag(a.group, { text: w.pid === me ? 'YOU' : w.name, seat: p?.seat, height: a.height + 0.3, cls: w.pid === me ? 'me' : '' })); });
  });
  const pool = Array.from({ length: 5 }, () => { const b = art.ball(); b.visible = false; group.add(b); return b; }), flying = [];
  // ---- camera: from behind the marks, looking at the hoop
  const tall = () => innerHeight > innerWidth * 1.15;
  const frameCam = (instant = false) => ctx.camera(tall() ? { cx: 0, cz: H.z + 3.6, hw: 4.4, hd: 3.6, pitch: 16, tall: 4.2 } : { cx: 0, cz: H.z + 3.6, hw: 6.2, hd: 3.6, pitch: 22, tall: 4.2 }, { instant });
  frameCam(true);
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'letters' });
  const letters = h('div', 'ls-letters'); ctx.ui.append(letters);
  letters.innerHTML = who.map((w, i) => { const p = seatOf(i); return `<span class="ls-row" data-i="${i}" style="--seat:${p ? p.color : '#9aa'}"><b>${esc(w.pid === me ? 'You' : w.name)}</b>${[...WORD].map(c => `<i>${esc(c)}</i>`).join('')}</span>`; }).join('');
  const rows = [...letters.querySelectorAll('.ls-row')];
  const pill = h('div', 'gp-pill ls-pill'), banner = h('div', 'gp-banner'); ctx.ui.append(pill, banner);
  const showBanner = (html, cls = '', ms = 1500) => { banner.innerHTML = html; banner.className = 'gp-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'gp-banner'; }, ms); };
  const playing = myI != null;
  const map = h('div', 'ls-map hidden', `<div class="ls-map-t">Pick a mark <em></em></div><div class="ls-court"><i class="ls-hoop"></i>${SPOTS.map((s, i) => `<button class="ls-spot" data-i="${i}" style="left:${50 + s.x / 7.6 * 46}%;top:${8 + (s.z - H.z) / 7.4 * 84}%" aria-label="${esc(s.name)}"><b>${i + 1}</b><small>${esc(s.name)}</small></button>`).join('')}</div>`);
  if (playing) ctx.ui.append(map);
  map.addEventListener('click', e => { const b = e.target.closest('.ls-spot'); if (!b || map.classList.contains('hidden')) return; ctx.send('pick', +b.dataset.i); ctx.sfx('tap'); map.classList.add('hidden'); });
  let last = null, myTurn = false, sentAt = -9;
  const panel = playing ? powerPanel(ctx, { period: L.period, label: 'HOLD to shoot', onShoot: p => { ctx.send('shoot', { p }); sentAt = performance.now() / 1000; A[myI].actor?.play('throw', 520); ctx.sfx('throw'); } }) : null;
  function place(g) {
    // who stands where: the setter on the mark while setting; everyone still in on the mark while copying
    const S = g.sp >= 0 ? SPOTS[g.sp] : null, copiers = g.r.map((r, i) => i).filter(i => i !== g.s && !g.r[i][1]);
    A.forEach((a, i) => { a.to = { ...bench(i) }; });
    if (S && (g.ph === PH.SET || g.ph === PH.SETFLY)) A[g.s].to = { x: S.x, z: S.z + 0.15, yaw: Math.atan2(H.x - S.x, H.z - S.z) };
    if (S && (g.ph === PH.COPY || g.ph === PH.COPYFLY)) copiers.forEach((i, k) => { const off = (k - (copiers.length - 1) / 2) * 0.75, a = Math.atan2(H.x - S.x, H.z - S.z); A[i].to = { x: S.x + Math.cos(a) * off, z: S.z - Math.sin(a) * off + 0.15, yaw: a }; });
  }
  return {
    state(g) {
      last = g; bar.set(g.sc, g.left); place(g);
      g.r.forEach(([n, out], i) => { const r = rows[i]; if (!r) return; r.classList.toggle('out', !!out); r.classList.toggle('set', i === g.s && g.ph !== PH.END); r.querySelectorAll('i').forEach((el, k) => el.classList.toggle('lit', k < n)); });
      const S = g.sp >= 0 ? SPOTS[g.sp] : null; glow.visible = !!S && g.ph !== PH.PICK; if (S) glow.position.set(S.x, 0.025, S.z);
      const setter = nameOf(g.s), x2 = g.x2 ? ' · misses cost 2!' : '';
      const waitingOn = g.r.map((r, i) => i).filter(i => i !== g.s && !g.r[i][1] && !g.r[i][2]);
      pill.innerHTML = g.ph === PH.START ? 'Get ready…'
        : g.ph === PH.PICK ? `<b>${esc(setter)}</b> ${g.s === myI ? 'pick' : 'is picking'} a mark <em>${g.tl}</em>`
        : g.ph === PH.SET || g.ph === PH.SETFLY ? `<b>${esc(setter)}</b> ${g.s === myI ? 'shoot' : 'shoots'} from ${esc(S.name)} ${g.ph === PH.SET ? `<em>${g.tl}</em>` : ''}`
        : g.ph === PH.COPY ? `Copy it! ${esc(S.name)}${x2} ${waitingOn.length ? `<em>${waitingOn.map(nameOf).map(esc).join(', ')}</em>` : ''}`
        : g.ph === PH.COPYFLY ? `Copies in the air…` : 'Game over';
      if (playing) {
        const out = g.r[myI][1];
        map.classList.toggle('hidden', !(g.ph === PH.PICK && g.s === myI));
        map.querySelector('em').textContent = g.ph === PH.PICK ? g.tl : '';
        myTurn = !out && ((g.ph === PH.SET && g.s === myI) || (g.ph === PH.COPY && g.s !== myI && !g.r[myI][2]));
        panel.el.classList.toggle('hidden', g.ph === PH.PICK && g.s === myI);
        if (S) { const p0 = idealPower(S.d), t = tolFor(S.d, L.tol); panel.band(p0 - t, p0 + t); }
        panel.mode(out ? 'done' : myTurn && performance.now() / 1000 - sentAt > 0.6 ? 'ready' : g.ph === PH.END ? 'done' : 'watch');
        const myTimer = g.ph === PH.COPY ? g.r[myI][3] : g.tl;
        panel.info(out ? `<span>You spelled <b>${esc(WORD)}</b> — watch the rest!</span>` : myTurn ? `<span>Your shot: <b>${esc(S.name)}</b></span><span>${myTimer ?? ''}s</span>` : g.ph === PH.PICK && g.s !== myI ? `<span>${esc(setter)} is picking…</span>` : `<span>${g.s === myI && g.ph === PH.SETFLY ? 'Your shot is up…' : g.ph === PH.COPY || g.ph === PH.COPYFLY ? 'Copies flying…' : `Watching ${esc(setter)}`}</span><span>Letters: <b>${esc(WORD.slice(0, g.r[myI][0]) || '–')}</b></span>`);
      }
    },
    event(ev) {
      if (ev.e === 'shot') {
        const b = pool.find(x => !x.visible) || pool[0]; b.visible = true; b.userData.look({});
        flying.push({ b, path: ev.path, t: 0, T: ev.T, made: ev.made, swished: false, who: ev.who });
        if (ev.who !== myI) A[ev.who].actor?.play('throw', 520);
        if (ev.auto && ev.who === myI) showBanner('Too slow!<small>the clock threw it for you</small>', 'bad', 1300);
      } else if (ev.e === 'turn') { if (ev.who === myI) { ctx.sfx('pick'); showBanner('Your set!<small>pick a mark</small>', '', 1200); } }
      else if (ev.e === 'copy') { const S = SPOTS[ev.spot]; showBanner(`${esc(nameOf(ev.who))} made it!<small>${ev.who === myI ? 'now they have to copy' : `copy it: ${esc(S.name)}`}</small>`, 'good', 1500); ctx.sfx(ev.who === myI ? 'good' : 'tap'); A[ev.who].actor?.play('cheer', 900); }
      else if (ev.e === 'nobody') { if (ev.who === myI) ctx.sfx('bad'); }
      else if (ev.e === 'letter') {
        const ch = WORD.slice(0, ev.n), at = A[ev.who].actor?.group.position; if (at) floatText(stage, at.x, 2.2, at.z, ev.out ? WORD + '!' : ch.slice(-1) + (ev.n - (last?.r?.[ev.who]?.[0] ?? ev.n) > 1 ? '+' : ''), 'bad');
        if (ev.who === myI) { ctx.sfx(ev.out ? 'out' : 'bad'); showBanner(ev.out ? `${esc(WORD)}!<small>you are out</small>` : `${esc(ch)}<small>you took a letter</small>`, 'bad', 1500); }
        else if (ev.out) showBanner(`${esc(nameOf(ev.who))} is out!`, '', 1300);
      } else if (ev.e === 'end') { ctx.sfx('win'); if (ev.who >= 0) { showBanner(`${esc(nameOf(ev.who))} ${ev.who === myI ? 'win' : 'wins'}!<small>last one in</small>`, 'good', 3500); A[ev.who].actor?.play('cheer', 2500); } else showBanner('Time!<small>fewest letters wins</small>', 'good', 3000); }
    },
    frame(dt, t) {
      frameCam();
      hoop.userData.frame(dt);
      for (const a of A) {
        const dx = a.to.x - a.pos.x, dz = a.to.z - a.pos.z, d = Math.hypot(dx, dz), sp = Math.min(d, dt * 5);
        if (d > 0.01) { a.pos.x += dx / d * sp; a.pos.z += dz / d * sp; }
        const want = d > 0.2 ? Math.atan2(dx, dz) : a.to.yaw; let dy = want - a.pos.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.pos.yaw += dy * Math.min(1, dt * 10);
        if (a.actor) { a.actor.place(a.pos.x, 0, a.pos.z, a.pos.yaw); a.actor.setSpeed?.(d > 0.05 ? 4 : 0); a.actor.update(dt); }
      }
      for (let i = flying.length - 1; i >= 0; i--) {
        const F = flying[i]; F.t += dt; const [x, y, z] = pathAt(F.path, F.t); F.b.position.set(x, y, z); F.b.rotation.x -= dt * 8;
        if (F.made && !F.swished && F.t >= F.T) { F.swished = true; hoop.userData.swish(); }
        if (F.t > (F.path.length / 3 - 1) * 0.05 + 0.15) { F.b.visible = false; flying.splice(i, 1); }
      }
      panel?.frame(); void t;
    },
    dispose() { clearTimeout(showBanner.t); bar.el.remove(); panel?.dispose(); for (const tg of tags) tg.remove(); art.dispose(); floorTex.dispose(); for (const t of numTex) t.dispose(); void marks; },
  };
}
