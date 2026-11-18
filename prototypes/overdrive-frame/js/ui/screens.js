// The screens around a mission, one job each (lessons 13): Title (the workshop) → Missions board (pick a contract, see
// the briefing, pick a frame) → Drop (the dropship ride while pictures bake) → the mission → Results. Plus the ☰ pause
// menu and Settings. Controller works everywhere: d-pad / stick moves the highlight, A presses, B backs (padnav).
import { fmt } from '../../../../shared/format.js';
import { ask } from '../../../../shared/dialog.js';
import { accountButton } from '../../../../shared/rgs-signin.js';
import { mechStats, weaponSpec, RARITY } from '../sim/loadout.js';
import { buildMissionDef } from '../sim/missiondef.js';
import { applyResult } from '../save.js';
import { TitleScene } from '../render/title-scene.js';
import { composeMech } from '../../../../mechkit/js/bake-mech.js';
import { SPEAKER_INFO } from './speakers.js';
import { drawFit } from './fit.js';
import { installPadNav } from './padnav.js';
import { openReport } from './report.js';
import { play as sound } from '../../../../citykit/js/world/sound.js';

const LENGTH = { short: '4–8 min', mid: '8–15 min', long: '15+ min' };
const DISTRICT = { downtown: 'Downtown', residential: 'Residential', industrial: 'Industrial' };
const MAT_NAMES = { scrap: 'Scrap', alloy: 'Alloy', exotic: 'Exotic' };
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const click = () => sound('ui.click', { global: true, gain: 0.4 });


export class Screens {
  constructor(root, game) { this.root = root; this.g = game; this.current = null; this.pad = installPadNav(root); }

  _show(name, el) {
    this.root.replaceChildren(el); this.current = name; this.root.hidden = false;
    this.pad.focusFirst();
  }

  // ---------------------------------------------------------------- title
  title() {
    const g = this.g;
    const el = h('section', 'of-title');
    const cv = h('canvas', 'of-title-scene'); cv.setAttribute('aria-hidden', 'true');
    el.append(cv);
    const col = h('div', 'of-title-col');
    col.innerHTML = `
      <div class="of-logo"><span>OVERDRIVE</span><span>FRAME</span></div>
      <p class="of-tag">Mech contracts. Swarms by the hundred.</p>
      <nav class="of-title-menu" aria-label="Main menu">
        <button type="button" class="of-btn of-primary" data-go="missions">Missions</button>
        <button type="button" class="of-btn of-locked" data-go="hangar" aria-disabled="true">Hangar <small>opens next update</small></button>
        <button type="button" class="of-btn" data-go="settings">Settings</button>
        <div class="of-title-small">
          <span class="of-news-slot"></span>
          <button type="button" class="of-btn of-small" data-go="credits">Credits</button>
          <span class="of-acct-slot"></span>
        </div>
      </nav>
      <div class="of-title-pilot"></div>`;
    el.append(col);
    const pilot = col.querySelector('.of-title-pilot');
    pilot.innerHTML = `<span>${fmt(g.save.credits, { decimals: 0 })} credits</span>${Object.entries(g.save.mats).map(([k, v]) => `<span class="of-mat of-mat-${k}">${MAT_NAMES[k]} ${fmt(v, { decimals: 0 })}</span>`).join('')}`;
    col.querySelector('.of-news-slot').append(g.news.button({ className: 'of-btn of-small' }));
    try { col.querySelector('.of-acct-slot').append(accountButton({ game: 'overdrive-frame', gameName: 'Overdrive Frame' })); } catch { /* accounts optional */ }
    col.querySelector('[data-go="missions"]').addEventListener('click', () => { click(); this.missions(); });
    col.querySelector('[data-go="settings"]').addEventListener('click', () => { click(); this.settings(); });
    col.querySelector('[data-go="credits"]').addEventListener('click', () => { click(); g.credits.open(); });
    col.querySelector('[data-go="hangar"]').addEventListener('click', () => { click(); this._toast(col, 'The hangar opens in the next update: walk your mech to the parts dealer, workshop and paint bay.'); });
    this._show('title', el);

    // the workshop picture (rendered once per size; your own frame stands in the cradle)
    const scene = new TitleScene(cv); this.titleScene = scene;
    const size = () => { const dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); };
    size();
    let alive = true, last = performance.now();
    const loop = now => { if (!alive || this.current !== 'title') return; const dt = Math.min(0.05, (now - last) / 1000); last = now; scene.frame(dt); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    setTimeout(() => scene.render(g.buildOf(g.save.frame), innerWidth, innerHeight).catch(e => console.warn('[overdrive] title scene', e)), 30);
    let rt = 0; const onResize = () => { size(); clearTimeout(rt); rt = setTimeout(() => scene.render(g.buildOf(g.save.frame), innerWidth, innerHeight), 400); };
    addEventListener('resize', onResize);
    this._leave = () => { alive = false; removeEventListener('resize', onResize); };
  }

  _toast(parent, text) { const t = h('div', 'of-toast', text); parent.append(t); setTimeout(() => t.remove(), 4200); }
  _leaveNow() { this._leave?.(); this._leave = null; }

  // ---------------------------------------------------------------- missions board
  missions(selId = null) {
    this._leaveNow();
    const g = this.g, M = g.MISSIONS;
    const el = h('section', 'of-board');
    el.innerHTML = `
      <header class="of-bar"><button type="button" class="of-btn of-back" aria-label="Back">‹ Back</button><h1>Contracts</h1><span class="of-bar-credits">${fmt(g.save.credits, { decimals: 0 })} credits</span></header>
      <div class="of-board-body">
        <ol class="of-board-list" aria-label="Missions"></ol>
        <article class="of-brief" aria-live="polite"></article>
      </div>`;
    el.querySelector('.of-back').addEventListener('click', () => { click(); this.title(); });
    const list = el.querySelector('.of-board-list'), brief = el.querySelector('.of-brief');
    let sel = M.find(m => m.id === selId) || M[0];
    const draw = () => {
      list.replaceChildren(...M.map(m => {
        const li = h('li'); const b = h('button', 'of-card' + (m === sel ? ' on' : ''));
        b.type = 'button';
        const best = g.save.grades[m.id];
        b.innerHTML = `<span class="of-card-name">${m.name}</span><span class="of-card-meta">${DISTRICT[m.map.district]} · ${LENGTH[m.length]}</span><span class="of-card-pay">${fmt(m.pay, { decimals: 0 })} cr</span>${best ? `<span class="of-grade of-grade-${best}">${best}</span>` : '<span class="of-card-new">New</span>'}`;
        b.addEventListener('click', () => { click(); sel = m; draw(); });
        li.append(b); return li;
      }));
      this._brief(brief, sel);
    };
    draw();
    this._show('missions', el);
  }

  _brief(el, m) {
    const g = this.g;
    const def = buildMissionDef(m);
    const kinds = [...new Set(m.waves.map(w => w.kind))];
    el.innerHTML = `
      <div class="of-brief-top">
        <div><h2>${m.name}</h2><p class="of-brief-meta">${DISTRICT[m.map.district]} district · ${LENGTH[m.length]} · Pay ${fmt(m.pay, { decimals: 0 })} credits + more for every kill · Loot tier ${m.tier}</p></div>
        <canvas class="of-minimap" width="220" height="140" aria-label="District map"></canvas>
      </div>
      <p class="of-brief-text">${m.brief}</p>
      <div class="of-brief-cols">
        <section><h3>Objectives</h3><ul class="of-obj-list">${def.objectives.map(o => `<li class="${o.optional ? 'of-opt' : ''}">${o.label}${o.optional ? ' <small>bonus</small>' : ''}</li>`).join('')}${def.extract ? '<li>Reach the dropship when done</li>' : ''}</ul></section>
        <section><h3>Expect</h3><ul class="of-expect">${kinds.map(k => `<li><canvas width="56" height="56" data-kind="${k}" aria-hidden="true"></canvas><span>${g.KINDS[k].name}</span></li>`).join('')}</ul></section>
      </div>
      <section class="of-frames"><h3>Frame</h3><div class="of-frame-row"></div><div class="of-frame-stats"></div></section>
      <div class="of-brief-go"><button type="button" class="of-btn of-primary of-launch">Launch</button></div>`;
    this._minimap(el.querySelector('.of-minimap'), def);
    el.querySelectorAll('[data-kind]').forEach(c => this._enemyIcon(c, c.dataset.kind));
    this._frames(el.querySelector('.of-frame-row'), el.querySelector('.of-frame-stats'));
    el.querySelector('.of-launch').addEventListener('click', () => { click(); this.drop(m); });
  }

  _minimap(cv, def) {
    const g = cv.getContext('2d'), M = def.map, k = Math.min(cv.width / M.w, cv.height / M.h) * 0.95, ox = (cv.width - M.w * k) / 2, oy = (cv.height - M.h * k) / 2;
    g.fillStyle = '#10141c'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#2a2f3a'; for (const [x, z, w, d] of M.roads) g.fillRect(ox + x * k, oy + z * k, w * k, d * k);
    for (const l of M.lots) { g.fillStyle = l.explosive ? '#a8542a' : '#4a5262'; g.fillRect(ox + l.x * k + 0.5, oy + l.z * k + 0.5, l.w * k - 1, l.d * k - 1); }
    for (const o of def.objectives) for (const id of o.lots || []) { const l = M.lots.find(x => x.id === id); if (l) { g.strokeStyle = o.optional ? '#7dff6a' : '#ffb02e'; g.lineWidth = 2; g.strokeRect(ox + l.x * k, oy + l.z * k, l.w * k, l.d * k); } }
    const dot = (p, c) => { g.fillStyle = c; g.beginPath(); g.arc(ox + p.x * k, oy + p.z * k, 4, 0, Math.PI * 2); g.fill(); };
    dot(M.start, '#3ff0ff'); if (def.extract) dot(def.extract, '#5fffb0');
  }

  _enemyIcon(cv, kind) {
    const K = this.g.KINDS[kind], sp = this.g.sprites;
    const tryDraw = () => {
      const s = sp.icon(K.recipe, { seed: 1 }, 6, sp.animOf(K.recipe, 'walk'), 0);
      if (!s) { sp.work(20); return requestAnimationFrame(tryDraw); }
      drawFit(cv, s.day, s.lights, 0.06, false);
    };
    tryDraw();
  }

  /** A frame's picture for its card: baked once per build and kept, and only one per animation frame so the board
   *  never freezes while the four are prepared. */
  _preview(cv, maker) {
    const g = this.g, key = JSON.stringify(g.buildOf(maker));
    this._previews ||= new Map(); this._previewQ ||= [];
    const done = this._previews.get(key);
    if (done) { drawFit(cv, done, null, 0.04); return; }
    this._previewQ.push({ cv, maker, key });
    if (this._previewQ.length > 1) return;
    const next = () => {
      const job = this._previewQ[0]; if (!job) return;
      try {
        let off = this._previews.get(job.key);
        if (!off) { off = document.createElement('canvas'); off.width = 300; off.height = 320; composeMech(off.getContext('2d'), g.mechArt.layersFor(g.buildOf(job.maker)), 6, 6, 0, 'maker', 0, { x: 150, y: 290, zoom: 1, shadow: false }); this._previews.set(job.key, off); }
        if (job.cv.isConnected) drawFit(job.cv, off, null, 0.04);
      } catch (e) { console.warn(e); }
      this._previewQ.shift(); if (this._previewQ.length) setTimeout(next, 30);
    };
    setTimeout(next, 60);
  }

  _frames(row, stats) {
    const g = this.g;
    const pick = maker => { g.save.frame = maker; g.saveNow(); this._frames(row, stats); };
    row.replaceChildren(...g.MAKERS.map(mk => {
      const b = h('button', 'of-frame' + (g.save.frame === mk.id ? ' on' : '')); b.type = 'button';
      const cv = h('canvas'); cv.width = 160; cv.height = 160; cv.setAttribute('aria-hidden', 'true');
      b.append(cv, h('span', 'of-frame-name', mk.short), h('small', null, mk.look === 'sleek' ? 'Fast, energy weapons' : mk.look === 'chunky' ? 'Heavy armour, big guns' : mk.look === 'rounded' ? 'Balanced, tough shell' : 'Cheap, scrappy, odd'));
      b.addEventListener('click', () => { click(); pick(mk.id); });
      this._preview(cv, mk.id);
      return b;
    }));
    const b = g.buildOf(g.save.frame), st = mechStats(b, g.P);
    const ws = b.weapons.filter(Boolean).map(id => g.P[id]);
    stats.innerHTML = `
      <dl class="of-stats">
        <div><dt>Armour</dt><dd>${fmt(st.hp, { decimals: 0 })}</dd></div>
        <div><dt>Speed</dt><dd>${fmt(st.speedMul * 100, { decimals: 0 })}%</dd></div>
        <div><dt>Boost</dt><dd>${fmt(st.boostMul * 100, { decimals: 0 })}%</dd></div>
        <div><dt>Energy</dt><dd>${fmt(g.T.energyMax + st.energyMax, { decimals: 0 })}</dd></div>
        <div><dt>Cooling</dt><dd>${fmt(st.coolMul * 100, { decimals: 0 })}%</dd></div>
        <div><dt>Weight</dt><dd class="${st.overweight > 0 ? 'of-bad' : ''}">${fmt(st.load, { decimals: 1 })} / ${fmt(st.carry, { decimals: 0 })} t</dd></div>
      </dl>
      <ul class="of-wlist">${ws.map((w, i) => `<li><small>${['Left arm', 'Right arm', 'Left shoulder', 'Right shoulder'][i]}</small><b>${w.name}</b><span>${fmt(w.damage, { decimals: 0 })} dmg · ${fmt(w.rate, { decimals: 1 })}/s</span></li>`).join('')}</ul>`;
  }

  // ---------------------------------------------------------------- the drop (load + bake while the dropship flies)
  async drop(m) {
    this._leaveNow();
    const g = this.g, build = g.buildOf(g.save.frame);
    const el = h('section', 'of-drop');
    el.innerHTML = `
      <canvas class="of-drop-ship" width="420" height="300" aria-hidden="true"></canvas>
      <div class="of-drop-info"><h2>${m.name}</h2><p class="of-drop-line"></p><div class="of-progress"><i></i></div><small class="of-drop-step">Prepping your frame</small></div>`;
    this._show('drop', el);
    const line = el.querySelector('.of-drop-line'), bar = el.querySelector('.of-progress i'), stepTxt = el.querySelector('.of-drop-step');
    const handler = SPEAKER_INFO.handler; line.innerHTML = `<b style="color:${handler.colour}">${handler.name}:</b> ${m.comms?.[0]?.text || 'Doors open on my mark.'}`;
    const ship = el.querySelector('.of-drop-ship'), sctx = ship.getContext('2d');
    // the work: the frame's pictures, then the district's buildings, then each enemy kind's walk + death
    const def = buildMissionDef(m);
    const jobs = [...g.mechArt.prebakeSteps(build)];
    // only what the first minute needs: the buildings round the drop point and the first waves' enemies — the rest
    // bakes in the background while you play (owner report: "loading screen takes a while"). Daytime: no night lights.
    g.sprites.lights = (m.night ?? 0.72) >= 0.15;
    const st0 = def.map.start;
    for (const l of def.map.lots) if (Math.hypot(l.x + l.w / 2 - st0.x, l.z + l.d / 2 - st0.z) < 11) jobs.push(() => g.sprites.building(l.recipe, l.params, 0, true));
    for (const k of new Set(m.waves.filter(w => w.at < 30).map(w => w.kind))) {
      const K = g.KINDS[k], walk = g.sprites.animOf(K.recipe, 'walk'), die = g.sprites.animOf(K.recipe, 'die');
      for (let d = 0; d < 16; d++) {
        for (let f = 0; f < g.sprites.frames(K.recipe, walk); f++) jobs.push(() => g.sprites.facing(K.recipe, { seed: 1 }, d, walk, f, true));
        if (die) jobs.push(() => g.sprites.facing(K.recipe, { seed: 1 }, d, die, g.sprites.frames(K.recipe, die) - 1, true));
      }
    }
    for (let f = 0; f < 4; f++) jobs.push(() => g.sprites.facing('of-dropship', { cargo: 0 }, 5, 'hover', f, true));
    for (const sp of Object.values(SPEAKER_INFO)) jobs.push(() => g.sprites.icon(sp.recipe, sp.params || {}, sp.dir));
    const total = jobs.length; let done = 0, t = 0;
    await new Promise(res => {
      const tick = () => {
        const t0 = performance.now();
        while (done < total && performance.now() - t0 < 14) { try { jobs[done](); } catch (e) { console.warn(e); } done++; }
        g.sprites.work(10);
        t += 1 / 60;
        const shipSp = g.sprites.facing('of-dropship', { cargo: 0 }, 5, 'hover', Math.floor(t * 8) % 4, true);   // the same pictures the drop-in uses
        sctx.clearRect(0, 0, ship.width, ship.height);
        if (shipSp) { const k = Math.min(ship.width / shipSp.w, ship.height / shipSp.h) * 0.9; sctx.drawImage(shipSp.day, (ship.width - shipSp.w * k) / 2, (ship.height - shipSp.h * k) / 2 + Math.sin(t * 2) * 4, shipSp.w * k, shipSp.h * k); sctx.globalCompositeOperation = 'lighter'; sctx.drawImage(shipSp.lights, (ship.width - shipSp.w * k) / 2, (ship.height - shipSp.h * k) / 2 + Math.sin(t * 2) * 4, shipSp.w * k, shipSp.h * k); sctx.globalCompositeOperation = 'source-over'; }
        const queued = g.sprites.queue.length;
        bar.style.width = ((done / (total + queued)) * 100).toFixed(1) + '%';
        stepTxt.textContent = done < jobs.length * 0.5 ? 'Prepping your frame' : queued ? 'Mapping the district' : 'Doors opening';
        if (done >= total && queued < 40) return res();
        requestAnimationFrame(tick);
      };
      tick();
    });
    this.root.hidden = true; this.current = 'mission';
    const { result, S } = await g.startMission(m, build);
    this.results(m, result, S);
  }

  // ---------------------------------------------------------------- results
  results(m, result, S) {
    const g = this.g;
    applyResult(g.save, result, m.id); g.saveNow();
    const me = result.perPlayer[0];
    const el = h('section', 'of-results' + (result.won ? '' : ' of-lost'));
    el.innerHTML = `
      <div class="of-res-card">
        <header><span class="of-res-kicker">${result.won ? 'Contract complete' : 'Frame recovered'}</span><h1>${m.name}</h1></header>
        <div class="of-res-body">
          <div class="of-res-grade">${result.won ? `<span class="of-grade of-grade-big of-grade-${result.grade}">${result.grade}</span><small>${result.points} points</small>` : '<span class="of-grade of-grade-big of-grade-F">—</span><small>No pay, you keep what you picked up</small>'}</div>
          <ul class="of-res-parts">${result.won ? result.parts.map(p => `<li><span>${p.label}</span><i style="--v:${(p.value * 100).toFixed(0)}%"></i><b>${fmt(p.value * p.weight, { decimals: 0 })} / ${p.weight}</b></li>`).join('') : ''}</ul>
        </div>
        <dl class="of-res-nums">
          <div><dt>Pay</dt><dd>${fmt(result.pay, { decimals: 0 })} cr</dd></div>
          <div><dt>Kills</dt><dd>${fmt(me.kills, { decimals: 0 })}</dd></div>
          <div><dt>Damage dealt</dt><dd>${fmt(me.dealt, { decimals: 0 })}</dd></div>
          <div><dt>Time</dt><dd>${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, '0')}</dd></div>
          ${Object.entries(me.mats).map(([k, v]) => `<div><dt>${MAT_NAMES[k]}</dt><dd class="of-mat-${k}">+${fmt(v, { decimals: 0 })}</dd></div>`).join('')}
          <div><dt>Parts found</dt><dd>${fmt(me.loot.length, { decimals: 0 })}${result.crates ? ` + ${result.crates} crate${result.crates > 1 ? 's' : ''}` : ''}</dd></div>
        </dl>
        ${me.loot.length || result.crates ? '<p class="of-res-note">Parts and crates wait in the hangar (opens next update).</p>' : ''}
        <div class="of-res-actions"><button type="button" class="of-btn of-primary" data-a="again">Run it again</button><button type="button" class="of-btn" data-a="board">Contracts</button><button type="button" class="of-btn" data-a="title">Title</button></div>
      </div>`;
    el.querySelector('[data-a="again"]').addEventListener('click', () => { click(); this.drop(m); });
    el.querySelector('[data-a="board"]').addEventListener('click', () => { click(); this.missions(m.id); });
    el.querySelector('[data-a="title"]').addEventListener('click', () => { click(); this.title(); });
    this._show('results', el);
    sound(result.won ? 'quest.complete' : 'ui.error', { global: true, gain: 0.6 });
  }

  // ---------------------------------------------------------------- ☰ pause menu + settings
  pauseMenu = ({ resume, play }) => {
    const g = this.g;
    const el = h('div', 'of-pause'); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Menu');
    el.innerHTML = `<div class="of-pause-card"><h2>Paused</h2>
      <button type="button" class="of-btn of-primary" data-a="resume">Resume</button>
      <button type="button" class="of-btn" data-a="controls">Controls</button>
      <button type="button" class="of-btn" data-a="settings">Settings</button>
      <span class="of-news-slot"></span>
      <button type="button" class="of-btn" data-a="report">Report a bug</button>
      <button type="button" class="of-btn of-danger" data-a="quit">Leave mission</button></div>`;
    el.querySelector('.of-news-slot').append(g.news.button({ className: 'of-btn' }));
    const close = () => { el.remove(); this.pad.popLayer(); resume(); };
    el.querySelector('[data-a="resume"]').addEventListener('click', close);
    el.querySelector('[data-a="controls"]').addEventListener('click', () => this._controls(el));
    el.querySelector('[data-a="settings"]').addEventListener('click', () => this.settings(el));
    el.querySelector('[data-a="report"]').addEventListener('click', () => openReport(g, play));
    el.querySelector('[data-a="quit"]').addEventListener('click', async () => {
      if (!(await ask({ title: 'Leave the mission?', text: 'You keep what you picked up. No pay.', ok: 'Leave', danger: true }))) return;
      el.remove(); this.pad.popLayer(); g.quitMission(); this.missions();
    });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    document.body.append(el); this.pad.pushLayer(el);
  };

  _controls(parent) {
    import('../input/bindings.js').then(({ ACTIONS, hintFor }) => {
      const dev = this.g.play?.controls.device || 'keys', gl = this.g.play?.controls.glyphs || 'xbox';
      const el = h('div', 'of-pause'); el.innerHTML = `<div class="of-pause-card of-controls"><h2>Controls</h2><table>${ACTIONS.filter(a => a.row !== 'move' || a.id === 'up').map(a => `<tr><th>${a.row === 'move' ? 'Move' : a.label}</th><td>${a.row === 'move' ? 'W A S D' : hintFor(a.id, 'keys') || '—'}</td><td>${a.pad ? hintFor(a.id, 'pad', gl) : '—'}</td></tr>`).join('')}</table><button type="button" class="of-btn of-primary">Done</button></div>`;
      el.querySelector('button').addEventListener('click', () => { el.remove(); this.pad.popLayer(); });
      document.body.append(el); this.pad.pushLayer(el);
    });
  }

  settings(parent = null) {
    const g = this.g;
    const el = h('div', 'of-pause'); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Settings');
    const s = g.save.settings;
    el.innerHTML = `<div class="of-pause-card"><h2>Settings</h2>
      <label class="of-set"><span>Callsign</span><input type="text" maxlength="16" value="${(g.save.callsign || '').replace(/"/g, '')}" data-k="callsign"></label>
      <label class="of-set"><span>Screen shake</span><input type="range" min="0" max="1" step="0.1" value="${s.shake ?? 1}" data-k="shake"></label>
      <label class="of-set"><span>Damage numbers</span><input type="checkbox" ${s.numbers === false ? '' : 'checked'} data-k="numbers"></label>
      <button type="button" class="of-btn of-primary">Done</button></div>`;
    el.querySelector('[data-k="callsign"]').addEventListener('change', e => { g.save.callsign = e.target.value.trim().slice(0, 16) || 'Frame'; g.saveNow(); });
    el.querySelector('[data-k="shake"]').addEventListener('input', e => { s.shake = +e.target.value; g.saveNow(); });
    el.querySelector('[data-k="numbers"]').addEventListener('change', e => { s.numbers = e.target.checked; g.saveNow(); });
    el.querySelector('.of-btn').addEventListener('click', () => { el.remove(); this.pad.popLayer(); });
    document.body.append(el); this.pad.pushLayer(el);
  }
}
