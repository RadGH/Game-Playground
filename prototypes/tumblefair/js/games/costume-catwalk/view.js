// COSTUME CATWALK on a screen. A phone that plays gets the theme card, a live 2D picture of its runway model (the
// avatar-2d paper doll of the same look), tabs for each wardrobe slot with big option buttons (name, colour name +
// swatch, style tags, a star when it fits the theme), a pose picker and "I'm ready!". Then the 3D runway: a stage with
// a curtain, bulbs and a spotlight; each model walks down the catwalk and strikes its pose, then joins the line-up at
// the back. The vote shows every look as a card (the same paper doll) and the reveal puts each dresser's chip, the
// voters' faces, the ribbon and the points on it. A watch-only screen sees the runway big and who is still dressing.
import { esc, chip } from '../../client/gamehud.js';
import { avatarOf } from '../../client/avatars.js';
import { canvasTexture } from '../../client/stage.js';
import { renderSVG } from '../../../../../avatar-2d/js/render.js';
import { SLOTS, PIECES, COLOURS, TAGS, POSES, RACES, dressedAvatar, worn, themeFit, colourMatch, soloScore } from './pieces.js';

/** Round 12: the curtain's two stripes follow the theme's first style. */
const CURTAIN = { fancy: ['#8a1830', '#c8304a'], spooky: ['#3a1f5c', '#6a3a9a'], wild: ['#2f5a1f', '#4f8a2f'], cosy: ['#7a4a22', '#b0703a'],
  magic: ['#1f2f7a', '#3f5ac0'], mighty: ['#5a5f6a', '#8a96a4'], sunny: ['#c8701a', '#f2a63a'], silly: ['#b02a7a', '#e85aa8'] };
const RULE_TEXT = { theme: 'the most pieces that fit the theme', match: 'the most pieces in one colour', rainbow: 'the most different colours' };
const WALK_T = 3.2;                                     // seconds of walking before the pose (the sim gives each model 5.5)
// the line-up at the back, left to right by look number, leaving the middle free for whoever walks out next
const LINE_X = { 1: [-1.35], 2: [-1.35, 1.35], 3: [-2.7, -1.35, 1.35], 4: [-2.7, -1.35, 1.35, 2.7] }, LINE_Z = -4.1, START_Z = -5.6, END_Z = 1.2;

export function createView(ctx) {
  const { ui, players, me, init, THREE } = ctx;
  const byPid = new Map(players.map(p => [p.pid, p])), watching = me == null, theme = init.theme;
  const likes = theme.likes.map(t => `<i class="ck-tag fit">${TAGS[t]}</i>`).join(' ');
  ui.innerHTML = `
    <div class="ck-top">
      <div class="ck-theme"><small>Tonight's theme</small><b>${esc(theme.name)}</b><em>${esc(theme.line)}</em><span class="ck-likes">Loves ${likes}</span></div>
      <span class="clock"><b>--</b></span>
    </div>
    <section class="ck-dress">
      <div class="ck-look"><div class="ck-doll"></div><div class="ck-tally"></div></div>
      <div class="ck-slots">${SLOTS.map(s => `<button class="ck-slot" data-slot="${s.id}"><b>${s.name}</b><em></em></button>`).join('')}</div>
      <div class="ck-opts"></div>
      <div class="ck-pose"><button class="ck-pp" data-pose="-1" aria-label="Previous pose"><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M14 3 L4 10 L14 17 Z" fill="currentColor"/></svg></button><span>Runway pose: <b></b></span><button class="ck-pp" data-pose="1" aria-label="Next pose"><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M6 3 L16 10 L6 17 Z" fill="currentColor"/></svg></button></div>
      <button class="ck-done big-btn">I'm ready!</button>
    </section>
    <section class="ck-wait"><p class="ck-shout">Backstage! Everyone is getting dressed…</p><div class="ck-dressers">${players.map(p => chip(p, '<em class="st">dressing…</em>')).join('')}</div></section>
    <section class="ck-run"><b class="ck-runno"></b><span class="ck-runpose"></span></section>
    <section class="ck-gallery"><p class="ck-ghead"></p><div class="ck-cards"></div><button class="ck-both big-btn" data-vote="both" hidden>Both look great!</button></section>
    <p class="ck-note"></p>
    <div class="ck-flash" aria-hidden="true"></div>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'dress';
  if (init.solo) ui.classList.add('solo');

  // ---------------------------------------------------------------- dressing (a phone that plays)
  let tray = null, outfit = null, pose = 0, model = null, done = false, slot = 'hat', mine = null, myVote = null;
  let phase = 'dress', show = null, walk = -1, walkAt = 0, cards = [];
  const baseOf = m => avatarOf({ race: RACES[m[0]] || 'human', seed: m[1] });
  const doll = (m, list, w = 150) => { try { return renderSVG(dressedAvatar(baseOf(m), list), { width: w, height: Math.round(w * 4 / 3) }); } catch { return ''; } };
  const sw = c => `<i class="ck-sw" style="background:${COLOURS[c]?.hex}"></i>`;
  function optHtml(s, i, [p, c]) {
    const pc = PIECES[p], fit = pc.tags.some(t => theme.likes.includes(t)), on = outfit?.[s] === i;
    const colour = pc.slot === 'hair' ? `<i class="ck-sw" style="background:${pc.part}"></i>dye` : `${sw(c)}${esc(COLOURS[c].name)}`;
    return `<button class="ck-opt${on ? ' on' : ''}${fit ? ' fits' : ''}" data-s="${s}" data-i="${i}">
      <b>${esc(pc.name)}</b><span class="ck-col">${colour}</span>
      <span class="ck-tags">${pc.tags.map(t => `<i class="ck-tag${theme.likes.includes(t) ? ' fit' : ''}">${TAGS[t]}</i>`).join('')}${fit ? '<i class="ck-star">★ fits</i>' : ''}</span>
      <em class="ck-on">${on ? 'Wearing' : 'Tap to wear'}</em></button>`;
  }
  function paintDress() {
    if (!tray || watching) return;
    const list = worn(tray, outfit);
    const dl = $('.ck-doll'), had = dl.dataset.n; dl.innerHTML = doll(model, list); dl.dataset.n = list.map(x => x.join('.')).join(',');
    if (had != null && had !== dl.dataset.n) { dl.classList.remove('bounce'); void dl.offsetWidth; dl.classList.add('bounce'); }
    const fit = themeFit(theme, list), match = colourMatch(list);
    $('.ck-tally').innerHTML = `<span><b>${fit}</b> fit the theme</span><span><b>${match}</b> match in colour</span>${init.solo ? `<span>Practice score <b>${soloScore(theme, list)}</b></span>` : ''}`;
    for (const b of ui.querySelectorAll('.ck-slot')) {
      const i = outfit[b.dataset.slot], it = i >= 0 ? tray[b.dataset.slot][i] : null;
      b.classList.toggle('sel', b.dataset.slot === slot); b.classList.toggle('filled', !!it);
      b.querySelector('em').textContent = it ? '✓ ' + PIECES[it[0]].name : 'empty';
    }
    $('.ck-opts').innerHTML = tray[slot].map((it, i) => optHtml(slot, i, it)).join('') +
      `<button class="ck-opt none${outfit[slot] === -1 ? ' on' : ''}" data-s="${slot}" data-i="-1"><b>Nothing</b><em class="ck-on">${outfit[slot] === -1 ? 'Wearing nothing here' : 'Take it off'}</em></button>`;
    $('.ck-pose b').textContent = POSES[pose].name;
    const d = $('.ck-done'); d.textContent = done ? 'Ready! (tap to keep dressing)' : "I'm ready!"; d.classList.toggle('on', done);
    ui.classList.toggle('is-done', done);
  }
  ui.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || watching) return;
    if (phase === 'dress' && tray) {
      if (t.dataset.slot) { slot = t.dataset.slot; ctx.sfx('tap'); paintDress(); return; }
      if (t.dataset.s) {
        const i = +t.dataset.i; if (outfit[t.dataset.s] === i) return;
        outfit[t.dataset.s] = i; done = false; ctx.send('wear', { s: t.dataset.s, i }); ctx.sfx('pick');
        // move on to the next empty slot, so dressing is a run of taps
        if (i >= 0) { const k = SLOTS.findIndex(s => s.id === slot); if (k < SLOTS.length - 1) slot = SLOTS[k + 1].id; }
        paintDress(); return;
      }
      if (t.dataset.pose) { pose = (pose + +t.dataset.pose + POSES.length) % POSES.length; ctx.send('pose', pose); ctx.sfx('tap'); paintDress(); return; }
      if (t.classList.contains('ck-done')) { done = !done; ctx.send('done', done); ctx.sfx(done ? 'good' : 'tap'); paintDress(); }
      return;
    }
    if (phase === 'vote' && t.dataset.vote != null) {
      const v = t.dataset.vote === 'both' ? 'both' : +t.dataset.vote;
      if (v !== 'both' && v === mine) return;
      myVote = v; ctx.send('vote', v); ctx.sfx('pick'); paintVotes();
    }
  });

  // ---------------------------------------------------------------- the 3D runway
  const G = ctx.group;
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 14), mat('#2a1f3a')); floor.position.set(0, -0.1, -1.5); G.add(floor);
  const back = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.4, 2.4), mat('#f2e6d0')); back.position.set(0, 0.2, -4.6); G.add(back);
  const walkway = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 7.2), mat('#f7efe0')); walkway.position.set(0, 0.2, -1.2); G.add(walkway);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 7.2), new THREE.MeshStandardMaterial({ color: '#d0304a', roughness: 0.8 })); stripe.position.set(0, 0.41, -1.2); G.add(stripe);
  const curtainTex = canvasTexture(256, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    const [c1, c2] = CURTAIN[theme.likes[0]] || CURTAIN.fancy;
    for (let i = 0; i <= 16; i++) g.addColorStop(i / 16, i % 2 ? c1 : c2);
    c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = '#f2c033'; c.fillRect(0, 0, w, 10);
  });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.2), new THREE.MeshStandardMaterial({ map: curtainTex, roughness: 0.9 })); curtain.position.set(0, 2.1, -5.85); G.add(curtain);
  // bulbs down both edges of the catwalk and round the back stage: one instanced mesh
  const bulbAt = [];
  for (let z = -4.4; z <= 2.3; z += 0.55) bulbAt.push([-0.92, z], [0.92, z]);
  for (let x = -3.6; x <= 3.61; x += 0.6) if (Math.abs(x) > 1) bulbAt.push([x, -3.35]);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe48a' }), bulbAt.length);
  const M4 = new THREE.Matrix4(); bulbAt.forEach(([x, z], i) => bulbs.setMatrixAt(i, M4.makeTranslation(x, 0.45, z))); G.add(bulbs);
  // a fake spotlight (a soft cone and a bright floor disc) that follows whoever is walking; never a real light toggled
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.85, 4.4, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff6d0', transparent: true, opacity: 0.45, depthWrite: false }));
  const spotG = new THREE.Group(); cone.position.y = 2.6; spot.position.y = 0.42; spotG.add(cone, spot); spotG.visible = false; G.add(spotG);
  // the camera: the whole stage while dressing, close on whoever is walking, the line-up for the vote
  let camKey = '';
  function aim(key, v) { if (key !== camKey) { camKey = key; ctx.camera({ pitch: 20, tall: 2.6, ...v }); } }
  aim('all', { cx: 0, cz: -1.6, hw: 3.3, hd: 4.2 });

  let models = [], tags = [], building = false;
  async function buildModels(list) {
    if (building) return; building = true;
    models = await Promise.all(list.map(async (s, i) => {
      const look = { race: RACES[s.m[0]] || 'human', seed: s.m[1] };
      const a = await ctx.createActor({ look });
      if (!a) return null;
      try { await a.body.setAvatar(dressedAvatar(avatarOf(look), s.o)); } catch (e) { console.error(e); }
      a.group.visible = false; a.place(0, 0.4, START_Z, 0);
      tags[i] = ctx.stage.tag(a.group, { text: `Look ${i + 1}`, height: (a.height || 1.6) + 0.2, cls: 'ck-lt' });
      return a;
    }));
  }
  const lineup = i => [(LINE_X[models.length] || LINE_X[4])[i] ?? 0, LINE_Z];

  // ---------------------------------------------------------------- the vote / reveal cards
  function buildGallery(list) {
    $('.ck-cards').innerHTML = list.map((s, i) => `
      <button class="ck-card" data-vote="${i}"><i class="ck-ribbon">Judge's ribbon</i><span class="ck-no">Look ${i + 1}</span>
        <em class="ck-flag"></em><span class="ck-pic">${doll(s.m, s.o, 120)}</span>
        <span class="ck-fits">${themeFit(theme, s.o)} fit · ${s.o.length} pieces</span>
        <span class="ck-by"></span><span class="ck-vt"></span><strong class="ck-pts"></strong></button>`).join('');
    cards = [...ui.querySelectorAll('.ck-card')];
    $('.ck-both').hidden = !(players.length === 2 && !init.solo && !watching);
    paintVotes();
  }
  function paintVotes() {
    cards.forEach((c, i) => {
      const own = i === mine && !init.solo, picked = myVote === i || myVote === 'both';
      c.classList.toggle('mine', own); c.classList.toggle('picked', picked);
      c.querySelector('.ck-flag').textContent = own ? 'yours' : picked ? '✓ your vote' : '';
    });
    $('.ck-both').classList.toggle('picked', myVote === 'both');
  }
  const face = p => `<i class="ck-face" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  function paintReveal(r, scores) {
    cards.forEach((c, i) => {
      const pid = r.who[i], p = byPid.get(pid); if (!p) return;
      c.querySelector('.ck-by').innerHTML = chip(p, pid === me ? '<em class="you">you</em>' : '');
      const voters = Object.entries(r.votes).filter(([, v]) => v === i || v === 'both').map(([q]) => byPid.get(+q)).filter(Boolean);
      c.querySelector('.ck-vt').innerHTML = voters.length ? voters.map(face).join('') : (init.solo ? '' : '<em>no votes</em>');
      c.classList.toggle('ribbon', r.ribbon === pid);
      c.querySelector('.ck-pts').textContent = scores ? `+${scores[pid]}` : '';
      const best = scores ? Math.max(...Object.values(scores)) : 0, tops = scores ? Object.keys(scores).filter(k => scores[k] === best) : [];
      c.classList.toggle('best', !init.solo && best > 0 && tops.length === 1 && +tops[0] === pid);
    });
  }
  function note(g) {
    const rule = `Judge's ribbon (+1 point): ${RULE_TEXT[init.judge.id]} (a tie goes to whoever was ready first).`;
    if (g.phase === 'dress') {
      if (watching) return init.solo ? 'Practice: the judge scores the outfit against the theme.' : rule;
      if (init.solo) return 'Practice: 1 point a piece that fits the theme (★), +2 when three or more pieces share a colour.';
      return done ? 'Ready! Waiting for the others…' : rule;
    }
    if (g.phase === 'runway') return 'Nobody knows whose outfit is whose. Remember your favourite!';
    if (g.phase === 'vote') return watching ? `Vote on your phones! ${rule}` : myVote == null ? `Tap the best look (not your own). ${rule}` : `Vote in. You can still change it. ${rule}`;
    if (init.solo) { const s = g.scores && Object.values(g.scores)[0]; return `Practice score: ${s ?? 0} (1 a piece that fits the theme, +2 for three or more in one colour).`; }
    return `1 point for each vote. ${rule}`;
  }

  return {
    priv(d) {
      if (d.tray && !tray) { tray = d.tray; outfit = { ...d.outfit }; pose = d.pose; model = d.model; }
      if (d.done !== done) done = d.done;
      mine = d.mine; myVote = d.vote;
      if (phase === 'dress') paintDress(); else if (cards.length) paintVotes();
    },
    state(g) {
      if (g.phase !== phase) {
        if (g.phase === 'runway') ctx.sfx('pick');
        if (g.phase === 'vote') ctx.sfx('pick');
        if (g.phase === 'reveal') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      if (g.show && !show) { show = g.show; buildModels(show); buildGallery(show); }
      if (g.phase === 'runway' && g.walk !== walk) { walk = g.walk; walkAt = performance.now() / 1000; }
      if (g.phase !== 'runway' && g.phase !== 'dress') walk = show ? show.length : -1;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'dress' && g.left <= 10);
      if (g.phase === 'dress') for (const p of players) {
        const r = ui.querySelector(`.ck-dressers [data-pid="${p.pid}"]`); if (!r) continue;
        const isDone = g.done.includes(p.pid); r.classList.toggle('in', isDone); r.querySelector('.st').textContent = isDone ? 'ready!' : 'dressing…';
      }
      if (g.phase === 'runway' && show) {
        $('.ck-runno').textContent = `Look ${walk + 1} of ${show.length}`;
        $('.ck-runpose').textContent = `${show[walk].o.length} pieces · ${themeFit(theme, show[walk].o)} fit the theme`;
      }
      $('.ck-ghead').textContent = g.phase === 'vote' ? (watching ? `${g.voted.length} of ${players.length} have voted` : 'Which look wins?') : g.phase === 'reveal' ? (init.solo ? 'The judge has scored your look' : 'The votes are in!') : '';
      if (g.reveal) paintReveal(g.reveal, g.scores);
      if (g.phase === 'reveal' && g.reveal && models.length) {
        const best = Math.max(...Object.values(g.scores));
        g.reveal.who.forEach((pid, i) => { if (g.scores[pid] === best && best > 0 && models[i] && !models[i].cheered) { models[i].cheered = true; models[i].play('cheer', 2600); } });
      }
      $('.ck-note').textContent = note(g);
    },
    frame(dt) {
      const now = performance.now() / 1000;
      let lit = null;
      models.forEach((a, i) => {
        if (!a) return;
        if (phase === 'runway' && i > walk) { a.group.visible = false; return; }
        a.group.visible = true;
        if (phase === 'runway' && i === walk) {
          const e = now - walkAt, k = Math.min(1, e / WALK_T);
          a.place(0, 0.4, START_Z + (END_Z - START_Z) * k, 0);
          if (k < 1) { a.setPose('walk'); }
          else if (!a.posed) { a.posed = true; a.setPose('idle'); a.play(POSES[show[i].pose]?.id || 'cheer', 2200); ctx.sfx('good');
            const fl = $('.ck-flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); }
          lit = a;
        } else {
          const [x, z] = lineup(i); a.place(x, 0.4, z, 0); a.setPose('idle');
        }
        a.update(dt);
      });
      if (lit) { const z = lit.group.position.z; aim('walk' + Math.round(z * 2), { cx: 0, cz: z - 0.6, hw: 1.6, hd: 1.6 }); }
      else if (phase === 'vote' || phase === 'reveal') aim('line', { cx: 0, cz: LINE_Z + 0.3, hw: 3.1, hd: 1.3 });
      spotG.visible = !!lit;
      if (lit) spotG.position.set(lit.group.position.x, 0, lit.group.position.z);
      for (let i = 0; i < tags.length; i++) if (tags[i]) tags[i].el.style.visibility = phase === 'vote' || phase === 'reveal' ? '' : 'hidden';
    },
    dispose() { for (const t of tags) t?.remove(); curtainTex.dispose(); },
  };
}
