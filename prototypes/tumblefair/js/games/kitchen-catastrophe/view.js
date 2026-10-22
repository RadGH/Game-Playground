// KITCHEN CATASTROPHE, as drawn: a fair food stall seen from above — red-and-white tiled floor, a low stripy wall round
// it, eight counters round the walls each with its ingredient sitting on top (a giant lemon, a sausage, a bowl of
// batter…) and a mat in front in the owner's colour with a name tag showing their shape. At the back, the serving
// hatch with the shared tray, the parts stacking up on it, and the customers queuing outside the hatch with their
// orders over their heads. Whatever you carry floats in front of you. The order cards sit under the score bar: the
// front order big, its recipe as steps (done ✓ / NEXT / later) with who owns each; on your phone a line says what
// to do next, and says YOU when the next part is yours.
import { RECIPES, ITEMS } from './sim.js';
import { scoreBar, floatText, h, esc } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';

const SHAPE = { circle: '<circle cx="0" cy="0" r="7"/>', square: '<rect x="-6.5" y="-6.5" width="13" height="13" rx="2"/>', diamond: '<path d="M0 -8 L8 0 L0 8 L-8 0 Z"/>', triangle: '<path d="M0 -8 L8 6 H-8 Z"/>' };
const COL = { cup: '#f4f4f4', lemon: '#ffe14d', ice: '#a8e6ff', sausage: '#c4553a', batter: '#f2c26b', mustard: '#f5c400', cone: '#7fb0ff', floss: '#ff8fd0' };

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx, A = ctx.arena;
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  const who = pid => ctx.player(pid), name = pid => pid === ctx.me ? 'You' : (who(pid)?.name || '?');
  const mark = pid => { const p = who(pid); return p ? `<i class="kc-mark" style="--seat:${p.color}"><svg viewBox="-10 -10 20 20">${SHAPE[p.shape] || SHAPE.circle}</svg></i>` : ''; };
  const ownerOf = new Map(init.stations.map(s => [s.item, s.own]));
  // ---- floor, walls, outside
  const tiles = canvasTexture(128, 128, (g, w) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#f6efe2' : '#e46a5c'; g.fillRect(x * w / 2, y * w / 2, w / 2, w / 2); } });
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping; tiles.repeat.set(A.hw, A.hd);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(A.hw * 2, A.hd * 2).rotateX(-Math.PI / 2), std('#ffffff', { map: tiles, roughness: 0.5 })); floor.receiveShadow = true; group.add(floor);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(70, 60).rotateX(-Math.PI / 2), std('#6cbf55')); lawn.position.y = -0.02; group.add(lawn);
  const stripe = canvasTexture(64, 16, (g, w, H) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#3d8bff'; g.fillRect(i * w / 8, 0, w / 8, H); } });
  stripe.wrapS = THREE.RepeatWrapping; stripe.repeat.set(6, 1);
  const wallMat = std('#ffffff', { map: stripe });
  for (const [x, z, w, d] of [[-A.hw - 0.2, 0, 0.4, A.hd * 2 + 0.8], [A.hw + 0.2, 0, 0.4, A.hd * 2 + 0.8], [0, A.hd + 0.2, A.hw * 2, 0.4], [-A.hw / 2 - 1.2, -A.hd - 0.2, A.hw - 2.4, 0.4], [A.hw / 2 + 1.2, -A.hd - 0.2, A.hw - 2.4, 0.4]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, d), wallMat); m.position.set(x, 0.4, z); m.castShadow = true; group.add(m);
  }
  // the stall's sign on the back wall, so it reads as a food stand (over the hatch, the customers queue under it)
  const sign = canvasTexture(256, 64, (g, w, H) => { g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, H); g.strokeStyle = '#2b1d0e'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, H - 6); g.fillStyle = '#2b1d0e'; g.font = '900 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SNACK SHACK', w / 2, H / 2 + 2); });
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: sign })); signM.position.set(0, 2.55, -A.hd - 1.3); group.add(signM);
  for (const sx of [-1, 1]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), std('#ffffff')); pole.position.set(sx * 1.6, 1.3, -A.hd - 1.32); group.add(pole); }
  // ---- ingredient models (one builder; counters show a big one, a carried one and the tray small ones)
  const G = {
    cyl: new THREE.CylinderGeometry(0.2, 0.16, 0.42, 12), sph: new THREE.SphereGeometry(0.2, 12, 9), box: new THREE.BoxGeometry(0.3, 0.3, 0.3),
    cap: new THREE.CapsuleGeometry(0.11, 0.42, 4, 8).rotateZ(Math.PI / 2), bowl: new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    bottle: new THREE.CylinderGeometry(0.13, 0.15, 0.46, 10), nozzle: new THREE.ConeGeometry(0.07, 0.16, 8), cone: new THREE.ConeGeometry(0.17, 0.46, 12).rotateX(Math.PI), puff: new THREE.IcosahedronGeometry(0.24, 1), straw: new THREE.CylinderGeometry(0.025, 0.025, 0.4, 5),
  };
  const M = Object.fromEntries(Object.entries(COL).map(([k, c]) => [k, std(c, k === 'ice' ? { transparent: true, opacity: 0.85, roughness: 0.15 } : {})]));
  const red = std('#e8343b'), white = std('#ffffff');
  function itemMesh(i, s = 1) {
    const id = ITEMS[i].id, g = new THREE.Group(), add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    if (id === 'cup') { add(G.cyl, M.cup, 0, 0.21); add(G.straw, red, 0.06, 0.5).rotation.z = 0.25; }
    else if (id === 'lemon') add(G.sph, M.lemon, 0, 0.2).scale.set(1.25, 0.95, 0.95);
    else if (id === 'ice') { add(G.box, M.ice, -0.1, 0.15); add(G.box, M.ice, 0.14, 0.15, 0.06).scale.setScalar(0.8); add(G.box, M.ice, 0, 0.38, 0).scale.setScalar(0.7); }
    else if (id === 'sausage') add(G.cap, M.sausage, 0, 0.14);
    else if (id === 'batter') { add(G.bowl, white, 0, 0.24).rotation.x = Math.PI; add(G.sph, M.batter, 0, 0.2).scale.set(1, 0.4, 1); }
    else if (id === 'mustard') { add(G.bottle, M.mustard, 0, 0.23); add(G.nozzle, red, 0, 0.54); }
    else if (id === 'cone') add(G.cone, M.cone, 0, 0.23);
    else if (id === 'floss') { add(G.puff, M.floss, 0, 0.26); add(G.puff, M.floss, 0.12, 0.34).scale.setScalar(0.7); }
    g.scale.setScalar(s); return g;
  }
  // ---- stations: counter, the ingredient on top, the owner's mat and tag
  const counterMat = std('#c98a4b'), topMat = std('#f3e4c8'), tags = [];
  for (const s of init.stations) {
    const spot = init.spots[s.spot], side = !!spot.face[0], p = who(s.own);
    const c = new THREE.Mesh(new THREE.BoxGeometry(side ? 1 : 1.5, 0.9, side ? 1.5 : 1), counterMat); c.position.set(spot.x, 0.45, spot.z); c.castShadow = true; c.receiveShadow = true; group.add(c);
    const top = new THREE.Mesh(new THREE.BoxGeometry(side ? 1.1 : 1.6, 0.08, side ? 1.6 : 1.1), topMat); top.position.set(spot.x, 0.93, spot.z); group.add(top);
    const it = itemMesh(s.item, 1.7); it.position.set(spot.x, 0.97, spot.z); group.add(it);
    const mat = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: p?.color || '#888', transparent: true, opacity: 0.6, depthWrite: false })); mat.position.set(spot.use.x, 0.012, spot.use.z); group.add(mat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#2b1d0e' })); ring.position.set(spot.use.x, 0.013, spot.use.z); group.add(ring);
    tags.push(stage.tag(it, { text: ITEMS[s.item].name + (s.own === ctx.me ? ' (you)' : ''), seat: p?.seat ?? null, height: 1.15, cls: 'kc-st' + (s.own === ctx.me ? ' me' : '') }));
  }
  // ---- the hatch and the tray
  const T = init.tray;
  const pass = new THREE.Mesh(new THREE.BoxGeometry(T.hw * 2, 1.0, T.hd * 2), std('#8a5a34')); pass.position.set(T.x, 0.5, T.z); pass.castShadow = true; group.add(pass);
  const trayM = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.8), std('#b8c4cc', { metalness: 0.6, roughness: 0.3 })); trayM.position.set(T.x, 1.04, T.z); group.add(trayM);
  const trayMat = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.55, depthWrite: false })); trayMat.position.set(T.use.x, 0.012, T.use.z); group.add(trayMat);
  const trayTag = stage.tag(trayM, { text: 'TRAY', height: 0.9, cls: 'kc-tray' });
  const onTray = new THREE.Group(); onTray.position.set(T.x, 1.08, T.z); group.add(onTray);
  let trayKey = '';
  function drawTray(list) {
    const key = list.join(','); if (key === trayKey) return; trayKey = key;
    for (const c of [...onTray.children]) onTray.remove(c);
    list.forEach((it, k) => { const m = itemMesh(it, 0.9); m.position.set(-0.6 + k * 0.4, 0, 0); onTray.add(m); });
  }
  // ---- customers outside the hatch: one per open order, with the order over their head
  const customers = new Map();   // order id -> { a, tag, slot }
  const LOOKS = [{ race: 'human', seed: 311 }, { race: 'halfling', seed: 72 }, { race: 'dwarf', seed: 905 }, { race: 'elf', seed: 1444 }];
  function addCustomer(id, r, slot) {
    const rec = { a: null, tag: null, slot, gone: false, miss: 0 };
    customers.set(id, rec);
    ctx.createActor({ look: LOOKS[id % LOOKS.length] }, { scale: 0.95 }).then(a => {
      if (!a) return; if (rec.gone) { a.dispose(); return; }
      rec.a = a; a.place(-1.1 + slot * 1.1, 0, -A.hd - 0.9, 0); a.setPose?.('idle');
    });
  }
  function dropCustomer(id, mood) {
    const c = customers.get(id); if (!c) return; customers.delete(id); c.gone = true;
    if (!c.a) return;
    c.a.play?.(mood === 'happy' ? 'cheer' : 'hit', 700); c.tag?.remove();
    setTimeout(() => c.a.dispose(), 900);
  }
  // ---- what each player carries, in front of them
  const carried = new Map();   // pid -> { item, m }
  function setCarry(pid, item) {
    let c = carried.get(pid); if (c && c.item === item) return;
    const a = ctx.actor(pid); if (!a) return;
    if (c) c.m.removeFromParent();
    if (item < 0) { carried.delete(pid); return; }
    const m = itemMesh(item, 1.1); m.position.set(0, 0.85, 0.42); a.body.group.add(m); carried.set(pid, { item, m });
  }
  // ---- HUD: score bar, order cards, your next job
  const bar = scoreBar(ctx, { unit: 'items' }), panel = h('div', 'kc-panel'), job = h('div', 'kc-job'), banner = h('div', 'kc-banner');
  ctx.ui.append(panel, job, banner);
  if (ctx.me == null) job.style.display = 'none';
  const showBanner = (text, cls = '') => { banner.textContent = text; banner.className = 'kc-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'kc-banner'; }, 1400); };
  let panelKey = '', jobKey = '';
  return {
    start() { showBanner('Orders up!'); },
    state(g) {
      bar.set(g.sc, g.left);
      drawTray(g.tray);
      for (const [pid, it] of Object.entries(g.hold)) setCarry(+pid, it);
      // customers follow the open orders
      const open = new Set(g.o.map(o => o[0]));
      g.o.forEach(([id, r], i) => { const c = customers.get(id); if (!c) addCustomer(id, r, [1, 0, 2][i] ?? i); });
      for (const [id, c] of [...customers]) { if (open.has(id)) c.miss = 0; else if (++c.miss > 3) dropCustomer(id, 'sad'); }   // events say happy/sad first
      // order cards
      const front = g.o[0], rec = front ? RECIPES[front[1]] : null;
      const key = JSON.stringify([g.o.map(o => [o[0], o[2]]), g.tray, g.served]);
      if (key !== panelKey) {
        panelKey = key;
        panel.innerHTML = `<div class="kc-goal">Served <b>${g.served}</b> / ${g.target}</div>` + g.o.map((o, i) => {
          const r = RECIPES[o[1]], warn = o[2] <= 6 ? ' hurry' : '';
          const steps = r.steps.map((it, k) => { const st = i ? 'todo' : k < g.tray.length ? 'done' : k === g.tray.length ? 'next' : 'todo';
            return `<span class="kc-step ${st}" style="--c:${COL[ITEMS[it].id]}">${st === 'done' ? '✓ ' : st === 'next' ? '▶ ' : ''}${esc(ITEMS[it].name)}${mark(ownerOf.get(it))}</span>`; }).join('<i class="kc-arrow">›</i>');
          return `<div class="kc-order${i ? ' later' : ' front'}${warn}"><div class="kc-oh"><b>${esc(r.name)}</b><span class="kc-time">${o[2]}s</span></div><div class="kc-steps">${steps}</div><div class="kc-pat"><i style="width:${Math.round(o[3] * 100)}%"></i></div></div>`;
        }).join('');
      }
      if (ctx.me != null) {
        const need = rec ? rec.steps[g.tray.length] : -1, mine = g.hold[ctx.me], owner = need >= 0 ? ownerOf.get(need) : null;
        let text, cls = '';
        if (!rec) text = 'Waiting for an order…';
        else if (mine === need) { text = `Take the ${ITEMS[need].name} to the TRAY!`; cls = 'go'; }
        else if (owner === ctx.me) { text = `NEXT: ${ITEMS[need].name} — that's YOU! Grab it.`; cls = 'go'; }
        else { const later = rec.steps.slice(g.tray.length + 1).find(it => ownerOf.get(it) === ctx.me);
          text = `NEXT: ${ITEMS[need].name} (${name(owner)})` + (later != null ? (mine === later ? ` · then your ${ITEMS[later].name}` : ` · get your ${ITEMS[later].name} ready`) : ''); }
        if (mine >= 0 && mine !== need && cls !== 'go') text += ` · holding ${ITEMS[mine].name}`;
        const k2 = text + cls; if (k2 !== jobKey) { jobKey = k2; job.textContent = text; job.className = 'kc-job ' + cls; }
      }
      { const y = bar.el.offsetTop + bar.el.offsetHeight + 6; if (y > 20 && panel.dataset.y !== String(y)) { panel.dataset.y = y; panel.style.top = y + 'px'; } }
    },
    event(ev) {
      const mine = ev.pid === ctx.me, a = ev.pid != null ? ctx.actor(ev.pid) : null;
      if (ev.e === 'grab') { if (mine) ctx.sfx('pick'); a?.play('throw', 250); }
      else if (ev.e === 'add') { ctx.sfx(mine ? 'good' : 'tap'); floatText(stage, T.x, 1.8, T.z, `+ ${ITEMS[ev.item].name}`, 'good'); }
      else if (ev.e === 'spoil') { ctx.sfx('splat'); floatText(stage, T.x, 2, T.z, `Spoiled! Needed ${ITEMS[ev.want].name}`, 'bad'); a?.play('hit', 500); }
      else if (ev.e === 'serve') { ctx.sfx('coins'); dropCustomer(ev.id, 'happy'); floatText(stage, T.x, 2.4, T.z - 1, `${RECIPES[ev.r].name} served!`, 'good'); }
      else if (ev.e === 'gone') { ctx.sfx('bad'); floatText(stage, 0, 2.4, -A.hd - 1, 'Too slow!', 'bad'); }
      else if (ev.e === 'nope') { const s = init.spots[ev.spot]; floatText(stage, s.x, 1.8, s.z, `That's ${name(ev.own)}'s!`, 'bad'); ctx.sfx('bad'); }
      else if (ev.e === 'order') { ctx.sfx('tap'); }
      else if (ev.e === 'end') { showBanner(ev.ok ? 'Kitchen saved!' : 'Closing time!', ev.ok ? 'win' : ''); ctx.sfx(ev.ok ? 'win' : 'out'); }
    },
    frame(dt, t) {
      for (const c of customers.values()) if (c.a) { c.a.update?.(dt); }
      onTray.position.y = 1.08 + Math.sin(t * 3) * 0.01;
    },
    dispose() { bar.el.remove(); panel.remove(); job.remove(); banner.remove(); trayTag.remove(); for (const t of tags) t.remove(); for (const c of customers.values()) c.tag?.remove(); clearTimeout(showBanner.t); tiles.dispose(); stripe.dispose(); sign.dispose(); },
  };
}
