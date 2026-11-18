// The screens around a mission, one job each (lessons 13): Title (the workshop) → Missions board (pick a contract, see
// the briefing, pick a frame) → Drop (the dropship ride while pictures bake) → the mission → Results. Plus the ☰ pause
// menu and Settings. Controller works everywhere: d-pad / stick moves the highlight, A presses, B backs (padnav).
import { fmt } from '../../../../shared/format.js';
import { ask } from '../../../../shared/dialog.js';
import { accountButton } from '../../../../shared/rgs-signin.js';
import { mechStats, weaponSpec, RARITY } from '../sim/loadout.js';
import { buildMissionDef } from '../sim/missiondef.js';
import { RARITY_BY_ID } from '../sim/loadout.js';
import { rankOf } from '../sim/progress.js';
import { lineText } from '../sim/loot.js';
import { buildProblems } from '../sim/inventory.js';
import { districtStates, storyList, contractsFor } from '../sim/campaign.js';
import { TitleScene } from '../render/title-scene.js';
import { composeMech } from '../../../../mechkit/js/bake-mech.js';
import { SPEAKER_INFO } from './speakers.js';
import { drawFit } from './fit.js';
import { openAssembly, openPaint } from './bays.js';
import { openDealer, openWorkshop } from './shop.js';
import { bossBakeJobs, aceBakeJobs } from '../render/boss-art.js';
import { installPadNav } from './padnav.js';
import { openReport } from './report.js';
import { play as sound } from '../../../../citykit/js/world/sound.js';

const LENGTH = { short: '4–8 min', mid: '8–15 min', long: '15+ min' };
const DISTRICT = { downtown: 'Downtown', residential: 'Residential', industrial: 'Industrial' };
const MAT_NAMES = { scrap: 'Scrap', alloy: 'Alloy', exotic: 'Exotic', chitin: 'Chitin' };
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
    this._leaveNow();
    const g = this.g;
    const el = h('section', 'of-title');
    const cv = h('canvas', 'of-title-scene'); cv.setAttribute('aria-hidden', 'true');
    el.append(cv);
    const col = h('div', 'of-title-col');
    col.innerHTML = `
      <div class="of-logo"><span>OVERDRIVE</span><span>FRAME</span></div>
      <p class="of-tag">Mech contracts. Swarms by the hundred.</p>
      <nav class="of-title-menu" aria-label="Main menu">
        <button type="button" class="of-btn of-primary" data-go="hangar">Hangar <small>walk to the bays, launch from the pad</small></button>
        <button type="button" class="of-btn" data-go="missions">Contracts</button>
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
    const rk = rankOf(g.save.xp);
    pilot.innerHTML = `<span class="of-rank">Rank ${rk.rank} · ${rk.name}</span><span>${fmt(g.save.credits, { decimals: 0 })} credits</span>${Object.entries(g.save.mats).map(([k, v]) => `<span class="of-mat of-mat-${k}">${MAT_NAMES[k]} ${fmt(v, { decimals: 0 })}</span>`).join('')}`;
    col.querySelector('.of-news-slot').append(g.news.button({ className: 'of-btn of-small' }));
    try { col.querySelector('.of-acct-slot').append(accountButton({ game: 'overdrive-frame', gameName: 'Overdrive Frame' })); } catch { /* accounts optional */ }
    col.querySelector('[data-go="missions"]').addEventListener('click', () => { click(); this.missions(); });
    col.querySelector('[data-go="settings"]').addEventListener('click', () => { click(); this.settings(); });
    col.querySelector('[data-go="credits"]').addEventListener('click', () => { click(); g.credits.open(); });
    col.querySelector('[data-go="hangar"]').addEventListener('click', () => { click(); this.hangar(); });
    this._show('title', el);

    // the workshop picture (rendered once per size; your own frame stands in the cradle)
    const scene = new TitleScene(cv); this.titleScene = scene;
    const size = () => { const dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); };
    size();
    let alive = true, last = performance.now();
    const loop = now => { if (!alive || this.current !== 'title') return; const dt = Math.min(0.05, (now - last) / 1000); last = now; scene.frame(dt); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    setTimeout(() => scene.render(g.build(), innerWidth, innerHeight).catch(e => console.warn('[overdrive] title scene', e)), 30);
    let rt = 0; const onResize = () => { size(); clearTimeout(rt); rt = setTimeout(() => scene.render(g.build(), innerWidth, innerHeight), 400); };
    addEventListener('resize', onResize);
    this._leave = () => { alive = false; removeEventListener('resize', onResize); };
  }

  _toast(parent, text) { const t = h('div', 'of-toast', text); parent.append(t); setTimeout(() => t.remove(), 4200); }
  _leaveNow() { this._leave?.(); this._leave = null; }

  // ---------------------------------------------------------------- the hangar (walk your mech to the bays)
  /** The walkable hub (owner: "walk your mech around the hangar hub — menus are lame"). The hangar runs on the stage
   *  like a mission; each bay opens its sheet over it and the mech waits until you close it. */
  async hangar() {
    this._leaveNow();
    const g = this.g;
    this.root.replaceChildren(); this.root.hidden = true; this.current = 'hangar';
    const { Hangar } = await import('../hangar.js');
    if (this.current !== 'hangar') return;
    g.sprites.lights = true;
    let hg = null;
    const resume = () => { if (this.current === 'hangar' && hg) hg.pause(false); };
    const changed = () => { hg?.setBuild(g.build()); };
    const open = id => {
      if (!hg || hg.paused) return;
      const opts = { onClose: resume, onChange: changed };
      if (id === 'terminal' || id === 'pad') { this._leaveNow(); this.missions(null, 'hangar'); return; }
      if (id === 'range') { this._leaveNow(); this.range(); return; }
      hg.pause(true);
      ({ assembly: openAssembly, dealer: openDealer, workshop: openWorkshop, paint: openPaint })[id]?.(this, opts);
    };
    hg = new Hangar({ root: g.stage, T: g.T, P: g.P, C: g.C, kinds: g.KINDS, sprites: g.sprites, mechArt: g.mechArt, build: g.build(), pilotName: g.save.callsign,
      onBay: open, onMenu: () => { hg.pause(true); this.hangarMenu(hg, resume); } });
    this.hangarNow = hg;
    g.sprites.keepBuildingsFor(hg.def.map.lots);   // the last district's buildings aren't needed in here
    this._leave = () => { hg.dispose(); this.hangarNow = null; this.root.hidden = false; };
  }

  /** ☰ in the hangar: resume, settings, controls, What's new, report, back to the title. */
  hangarMenu(hg, resume) {
    const g = this.g;
    const el = h('div', 'of-pause'); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Menu');
    el.innerHTML = `<div class="of-pause-card"><h2>Hangar</h2>
      <button type="button" class="of-btn of-primary" data-a="resume">Back to the hangar</button>
      <button type="button" class="of-btn" data-a="missions">Contracts</button>
      <button type="button" class="of-btn" data-a="controls">Controls</button>
      <button type="button" class="of-btn" data-a="settings">Settings</button>
      <span class="of-news-slot"></span>
      <button type="button" class="of-btn" data-a="report">Report a bug</button>
      <button type="button" class="of-btn" data-a="title">Title screen</button></div>`;
    el.querySelector('.of-news-slot').append(g.news.button({ className: 'of-btn' }));
    const shut = () => { el.remove(); this.pad.popLayer(); };
    el.querySelector('[data-a="resume"]').addEventListener('click', () => { shut(); resume(); });
    el.querySelector('[data-a="missions"]').addEventListener('click', () => { shut(); this.missions(null, 'hangar'); });
    el.querySelector('[data-a="controls"]').addEventListener('click', () => this._controls(el));
    el.querySelector('[data-a="settings"]').addEventListener('click', () => this.settings(el));
    el.querySelector('[data-a="report"]').addEventListener('click', () => openReport(g, hg));
    el.querySelector('[data-a="title"]').addEventListener('click', () => { shut(); this.title(); });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); shut(); resume(); } });
    document.body.append(el); this.pad.pushLayer(el);
  }

  /** The test range: your frame against target dummies, damage per second on screen, never ends. */
  async range() {
    this._leaveNow();
    const g = this.g;
    this.root.replaceChildren(); this.root.hidden = true; this.current = 'range';
    await g.startRange(g.build(), () => { this._leave = null; this.hangar(); });
    this._leave = () => { g.range?.dispose(); g.range = null; this.root.hidden = false; };
  }

  // ---------------------------------------------------------------- missions board
  missions(selId = null, from = this._from || 'title') {
    this._leaveNow(); this._from = from;
    const g = this.g, CAMP = g.CAMP;
    const story = storyList(g.save, CAMP, g.MISSIONS), contracts = contractsFor(g.save, CAMP, g.MAKERS);
    const all = [...story.filter(x => x.open || x.done).map(x => x.mission), ...contracts];
    const el = h('section', 'of-board');
    el.innerHTML = `
      <header class="of-bar"><button type="button" class="of-btn of-back" aria-label="Back">‹ Back</button><h1>${CAMP.city.name} <span class="of-wide">operations</span></h1><span class="of-bar-credits">${fmt(g.save.credits, { decimals: 0 })} credits</span></header>
      <div class="of-board-body">
        <div class="of-board-side">
          <canvas class="of-city" width="420" height="330" aria-label="City map: freed districts glow, dark ones are held by the enemy"></canvas>
          <div class="of-board-lists"><h3>Story</h3><ol class="of-board-list" data-l="story" aria-label="Story missions"></ol><h3>Contracts <small>new ones after every mission</small></h3><ol class="of-board-list" data-l="contracts" aria-label="Contracts"></ol></div>
        </div>
        <article class="of-brief" aria-live="polite"></article>
      </div>`;
    el.querySelector('.of-back').addEventListener('click', () => { click(); if (from === 'hangar') this.hangar(); else this.title(); });
    const brief = el.querySelector('.of-brief');
    let sel = all.find(m => m.id === selId) || story.find(x => x.open)?.mission || all[0];
    const card = (m, locked = null) => {
      const li = h('li'); const b = h('button', 'of-card' + (m === sel ? ' on' : '') + (locked ? ' of-card-locked' : '')); b.type = 'button';
      const best = g.save.grades[m.id], d = CAMP.districts.find(x => x.id === (m.district || CAMP.districts.find(y => y.story === m.id)?.id));
      const tag = m.contract ? `<span class="of-card-client">${g.MAKERS.find(x => x.id === m.client)?.short}</span>` : best ? `<span class="of-grade of-grade-${best}">${best}</span>` : locked ? '' : '<span class="of-card-new">New</span>';
      b.innerHTML = `<span class="of-card-name">${m.name}</span><span class="of-card-meta">${locked || `${d?.name || DISTRICT[m.map.district]} · ${LENGTH[m.length]}`}</span><span class="of-card-pay">${locked ? '' : fmt(m.pay, { decimals: 0 }) + ' cr'}</span>${tag}`;
      if (locked) b.disabled = true; else b.addEventListener('click', () => { click(); sel = m; draw(); });
      li.append(b); return li;
    };
    const draw = () => {
      el.querySelector('[data-l="story"]').replaceChildren(...story.map(x => card(x.mission, x.open || x.done ? null : x.district.reached ? 'Finish the missions before it first' : `Free a district next to ${x.district.name} first`)));
      el.querySelector('[data-l="contracts"]').replaceChildren(...contracts.map(m => card(m)));
      this._brief(brief, sel);
      this._city(el.querySelector('.of-city'), sel);
    };
    draw();
    this._show('missions', el);
  }

  /** The city map: districts glow as they are freed and cleaned up (owner: "the city recovers visibly"); dark ones
   *  carry the colour of whoever holds them. The selected mission's district is outlined. */
  _city(cv, sel) {
    const g = this.g, ctx = cv.getContext('2d'), st = districtStates(g.save, g.CAMP), W = cv.width, H = cv.height;
    ctx.fillStyle = '#060a12'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0a1a2a'; ctx.fillRect(0, H - 34, W, 34);                  // the sea along the south edge
    ctx.strokeStyle = 'rgba(63, 240, 255, 0.15)'; for (let x = 0; x < W; x += 14) { ctx.beginPath(); ctx.moveTo(x, H - 20 + Math.sin(x) * 2); ctx.lineTo(x + 7, H - 20); ctx.stroke(); }
    const cw = (W - 40) / 3, ch = (H - 74) / 3, R = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(7);
    const selD = sel && (sel.district || g.CAMP.districts.find(d => d.story === sel.id)?.id);
    for (const d of st) {
      const x = 20 + d.x * cw + 4, y = 20 + d.y * ch + 4, w = cw - 8, hh = ch - 8;
      const held = g.CAMP.factions[d.held === 'both' ? 'army' : d.held]?.colour || '#888';
      ctx.fillStyle = d.freed ? '#10221f' : d.reached ? '#1a1712' : '#0d0f14'; ctx.fillRect(x, y, w, hh);
      // street grid + lit windows: more lights the more the district has recovered
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + w * k / 4, y); ctx.lineTo(x + w * k / 4, y + hh); ctx.moveTo(x, y + hh * k / 4); ctx.lineTo(x + w, y + hh * k / 4); ctx.stroke(); }
      const lights = Math.round(10 + d.control * 90);
      for (let k = 0; k < 100; k++) { const lx = x + 4 + R() * (w - 8), ly = y + 4 + R() * (hh - 8); if (k >= lights) continue; ctx.fillStyle = d.freed ? (k % 5 ? '#7dffd0' : '#ffcf4a') : k % 3 ? held : '#3a3a3a'; ctx.globalAlpha = d.freed ? 0.75 : 0.35; ctx.fillRect(lx, ly, 2, 2); }
      ctx.globalAlpha = 1;
      if (!d.freed) { ctx.fillStyle = held + (d.reached ? '22' : '14'); ctx.fillRect(x, y, w, hh); }
      ctx.lineWidth = d.id === selD ? 3 : 1; ctx.strokeStyle = d.id === selD ? '#ffb02e' : d.freed ? '#5fffb0' : d.reached ? '#6a5a3a' : '#2a3140'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
      ctx.font = '600 13px "Chakra Petch", system-ui'; ctx.fillStyle = d.freed ? '#d9fff0' : d.reached ? '#f0e2c0' : '#8a93a6'; ctx.fillText(d.name, x + 8, y + 18);
      ctx.font = '500 12px "Chakra Petch", system-ui'; ctx.fillStyle = d.freed ? '#5fffb0' : d.storyOpen ? '#ffb02e' : '#8a93a6';
      ctx.fillText(d.freed ? `Freed · ${Math.round(d.control * 100)}%` : d.storyOpen ? 'Story mission ready' : d.reached ? `Held by ${g.CAMP.factions[d.held === 'both' ? 'army' : d.held].label}${d.held === 'both' ? ' + swarm' : ''}` : 'Out of reach', x + 8, y + hh - 9);
    }
  }

  _brief(el, m) {
    const g = this.g;
    const def = buildMissionDef(m);
    const kinds = [...new Set([...(m.enemies || []).map(e => e.kind), ...m.waves.map(w => w.kind), ...(m.convoy?.side === 'enemy' ? [m.convoy.kind] : [])])].filter(k => g.KINDS[k]);
    const dist = g.CAMP.districts.find(x => x.id === (m.district || g.CAMP.districts.find(y => y.story === m.id)?.id));
    const client = m.contract ? g.MAKERS.find(x => x.id === m.client) : null;
    el.innerHTML = `
      <div class="of-brief-top">
        <div><h2>${m.name}</h2><p class="of-brief-meta">${m.contract ? `Contract for ${client?.name || 'a client'} · ` : 'Story · '}${dist?.name || DISTRICT[m.map.district]} (${DISTRICT[m.map.district].toLowerCase()}) · ${LENGTH[m.length]} · Pay ${fmt(m.pay, { decimals: 0 })} credits + more for every kill · Loot tier ${m.tier}</p></div>
        <canvas class="of-minimap" width="220" height="140" aria-label="District map"></canvas>
      </div>
      <p class="of-brief-text">${m.brief}</p>
      <div class="of-brief-cols">
        <section><h3>Objectives</h3><ul class="of-obj-list">${def.objectives.map(o => `<li class="${o.optional ? 'of-opt' : ''}">${o.label}${o.optional ? ' <small>bonus</small>' : ''}</li>`).join('')}${def.extract ? '<li>Reach the dropship when done</li>' : ''}</ul></section>
        <section><h3>Expect</h3><ul class="of-expect">${kinds.map(k => `<li><canvas width="56" height="56" data-kind="${k}" aria-hidden="true"></canvas><span>${g.KINDS[k].name}</span></li>`).join('')}</ul></section>
      </div>
      <section class="of-frames"><h3>Frame <small>saved builds — change parts in the hangar's assembly bay</small></h3><div class="of-frame-row"></div><div class="of-frame-stats"></div></section>
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
  _preview(cv, b) {
    const g = this.g, build = g.build(b), key = JSON.stringify([build, b.paint]);
    this._previews ||= new Map(); this._previewQ ||= [];
    const done = this._previews.get(key);
    if (done) { drawFit(cv, done, null, 0.04); return; }
    this._previewQ.push({ cv, build, key });
    if (this._previewQ.length > 1) return;
    const next = () => {
      const job = this._previewQ[0]; if (!job) return;
      try {
        let off = this._previews.get(job.key);
        if (!off) { off = document.createElement('canvas'); off.width = 300; off.height = 320; composeMech(off.getContext('2d'), g.mechArt.layersFor(job.build), 6, 6, 0, job.build.paint || 'maker', 0, { x: 150, y: 290, zoom: 1, shadow: false }); this._previews.set(job.key, off); }
        if (job.cv.isConnected) drawFit(job.cv, off, null, 0.04);
      } catch (e) { console.warn(e); }
      this._previewQ.shift(); if (this._previewQ.length) setTimeout(next, 30);
    };
    setTimeout(next, 60);
  }

  _frames(row, stats) {
    const g = this.g;
    const pick = b => { g.save.active = b.id; g.saveNow(false); this._frames(row, stats); };
    row.replaceChildren(...g.save.builds.map(b => {
      const bad = buildProblems(g.build(b), g.P, g.C).errors.length;
      const on = g.save.active === b.id;
      const btn = h('button', 'of-frame' + (on ? ' on' : '') + (bad ? ' of-frame-bad' : '')); btn.type = 'button';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const cv = h('canvas'); cv.width = 160; cv.height = 160; cv.setAttribute('aria-hidden', 'true');
      const core = g.P[g.build(b).core?.id];
      btn.append(cv, h('span', 'of-frame-name', b.name), h('small', null, bad ? 'Needs fixing in the assembly bay' : `${core ? g.MAKERS.find(m => m.id === core.maker)?.short : ''} core · ${fmt(mechStats(g.build(b), g.P, g.C).hp, { decimals: 0 })} armour`));
      btn.addEventListener('click', () => { click(); pick(b); });
      this._preview(cv, b);
      return btn;
    }));
    const b = g.build(), st = mechStats(b, g.P, g.C);
    const ws = b.weapons.map(w => w && { part: g.P[w.id], it: w });
    stats.innerHTML = `
      <dl class="of-stats">
        <div><dt>Armour</dt><dd>${fmt(st.hp, { decimals: 0 })}</dd></div>
        <div><dt>Speed</dt><dd>${fmt(st.speedMul * 100, { decimals: 0 })}%</dd></div>
        <div><dt>Boost</dt><dd>${fmt(st.boostMul * 100, { decimals: 0 })}%</dd></div>
        <div><dt>Energy</dt><dd>${fmt(g.T.energyMax + st.energyMax, { decimals: 0 })}</dd></div>
        <div><dt>Cooling</dt><dd>${fmt(st.coolMul * 100, { decimals: 0 })}%</dd></div>
        <div><dt>Weight</dt><dd class="${st.overweight > 0 ? 'of-bad' : ''}">${fmt(st.load, { decimals: 1 })} / ${fmt(st.carry, { decimals: 0 })} t</dd></div>
      </dl>
      <ul class="of-wlist">${ws.map((w, i) => w ? `<li><small>${['Left arm', 'Right arm', 'Left shoulder', 'Right shoulder'][i]}</small><b style="color:${RARITY_BY_ID[w.it.rarity]?.colour}">${w.part.name}</b><span>${fmt(w.part.damage, { decimals: 0 })} dmg · ${fmt(w.part.rate, { decimals: 1 })}/s</span></li>` : '').join('')}</ul>`;
    const launch = row.closest('.of-brief')?.querySelector('.of-launch');
    if (launch) { const bad = buildProblems(b, g.P, g.C).errors; launch.disabled = bad.length > 0; launch.textContent = bad.length ? 'Fix the frame first' : 'Launch'; }
  }

  // ---------------------------------------------------------------- the drop (load + bake while the dropship flies)
  async drop(m) {
    this._leaveNow();
    const g = this.g, build = g.build();
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
    g.sprites.keepBuildingsFor(def.map.lots);      // let go of the last district's buildings (memory on phones)
    const st0 = def.map.start;
    for (const l of def.map.lots) if (Math.hypot(l.x + l.w / 2 - st0.x, l.z + l.d / 2 - st0.z) < 11) jobs.push(() => g.sprites.building(l.recipe, l.params, 0, true));
    for (const k of new Set(m.waves.filter(w => w.at < 30).map(w => w.kind))) {
      const K = g.KINDS[k], walk = g.sprites.animOf(K.recipe, 'walk'), die = g.sprites.animOf(K.recipe, 'die');
      for (let d = 0; d < 16; d++) {
        for (let f = 0; f < g.sprites.frames(K.recipe, walk); f++) jobs.push(() => g.sprites.facing(K.recipe, { seed: 1 }, d, walk, f, true));
        if (die) jobs.push(() => g.sprites.facing(K.recipe, { seed: 1 }, d, die, g.sprites.frames(K.recipe, die) - 1, true));
      }
    }
    for (const w of m.waves) {                   // bosses' attack poses and rival aces' frames
      const K = g.KINDS[w.kind];
      if (K?.job === 'boss') jobs.push(...bossBakeJobs(g.sprites, K));
      if (K?.job === 'ace') jobs.push(...aceBakeJobs(g.mechArt, K.ace.build));
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
    const gained = g.applyResult(result, m, S); g.saveNow();
    const me = result.perPlayer[0];
    const el = h('section', 'of-results' + (result.won ? '' : ' of-lost'));
    const mats = Object.entries(gained.mats).filter(([, v]) => v > 0);
    const rk = rankOf(g.save.xp);
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
          ${mats.map(([k, v]) => `<div><dt>${MAT_NAMES[k]}</dt><dd class="of-mat-${k}">+${fmt(v, { decimals: 0 })}</dd></div>`).join('')}
          <div><dt>Experience</dt><dd>+${fmt(gained.xp, { decimals: 0 })}</dd></div>
        </dl>
        <div class="of-res-rank"><span>${gained.rankUp ? `<b>Rank up!</b> Rank ${rk.rank} · ${rk.name}` : `Rank ${rk.rank} · ${rk.name}`}</span><i style="--v:${rk.max ? 100 : Math.round(rk.into / rk.need * 100)}%"></i><small>${rk.max ? 'Top rank' : `${fmt(rk.need - rk.into, { decimals: 0 })} to rank ${rk.rank + 1}`}</small></div>
        ${Object.keys(gained.rep || {}).length ? `<p class="of-res-rep">${Object.entries(gained.rep).filter(([, v]) => v > 0).map(([k, v]) => `<span>+${fmt(v, { decimals: 0 })} ${g.MAKERS.find(x => x.id === k)?.short} reputation</span>`).join('')}</p>` : ''}
        ${gained.items.length || gained.chips.length || gained.learned.length ? `<section class="of-res-loot"><h2>${gained.crates ? `${gained.crates} crate${gained.crates > 1 ? 's' : ''} opened · ` : ''}Found</h2><ul class="of-loot-row"></ul></section>` : ''}
        <div class="of-res-actions"><button type="button" class="of-btn of-primary" data-a="hangar">Back to the hangar</button><button type="button" class="of-btn" data-a="again">Run it again</button><button type="button" class="of-btn" data-a="board">Contracts</button></div>
      </div>`;
    const row = el.querySelector('.of-loot-row');
    if (row) {
      const cards = [
        ...gained.items.map(it => { const p = g.P[it.id], r = RARITY_BY_ID[it.rarity]; return `<li class="of-loot of-r-${it.rarity}" style="--rc:${r.colour}"><small>${r.label} ${p.slot === 'weapon' ? 'weapon' : p.slot}</small><b>${p.name}</b>${it.rolls.map(x => `<span>${lineText(x)}</span>`).join('')}</li>`; }),
        ...gained.chips.map(c => { const ch = g.C[c.id]; return `<li class="of-loot of-loot-chip" style="--rc:${ch.colour}"><small>Firmware chip · ${ch.cost} firmware</small><b>${ch.name}</b><span>${ch.text}</span></li>`; }),
        ...gained.learned.map(r => `<li class="of-loot of-loot-recipe"><small>Secret recipe learned</small><b>${r.name}</b><span>Make it at the workshop.</span></li>`),
      ];
      row.innerHTML = cards.join('');
      [...row.children].forEach((li, i) => { li.style.animationDelay = `${0.25 + i * 0.18}s`; });
      const best = gained.items.reduce((b, it) => Math.max(b, ['common', 'refined', 'rare', 'prototype', 'experimental'].indexOf(it.rarity)), 0);
      setTimeout(() => sound(best >= 2 ? 'loot.rare' : best ? 'loot.uncommon' : 'loot.common', { global: true, gain: 0.5 }), 400);
    }
    el.querySelector('[data-a="hangar"]').addEventListener('click', () => { click(); this.hangar(); });
    el.querySelector('[data-a="again"]').addEventListener('click', () => { click(); this.drop(m); });
    el.querySelector('[data-a="board"]').addEventListener('click', () => { click(); this.missions(m.id, 'hangar'); });
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

  /** ☰ on the test range. */
  rangeMenu = ({ resume, leave }) => {
    const el = h('div', 'of-pause'); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Menu');
    el.innerHTML = `<div class="of-pause-card"><h2>Test range</h2>
      <button type="button" class="of-btn of-primary" data-a="resume">Keep shooting</button>
      <button type="button" class="of-btn" data-a="controls">Controls</button>
      <button type="button" class="of-btn" data-a="report">Report a bug</button>
      <button type="button" class="of-btn" data-a="leave">Leave the range</button></div>`;
    const close = () => { el.remove(); this.pad.popLayer(); resume(); };
    el.querySelector('[data-a="resume"]').addEventListener('click', close);
    el.querySelector('[data-a="controls"]').addEventListener('click', () => this._controls(el));
    el.querySelector('[data-a="report"]').addEventListener('click', () => openReport(this.g, this.g.range?.play));
    el.querySelector('[data-a="leave"]').addEventListener('click', () => { el.remove(); this.pad.popLayer(); leave(); });
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
      <div class="of-set-cloud"></div>
      <button type="button" class="of-btn of-primary">Done</button></div>`;
    const bk = g.cloud?.backup?.();
    if (bk) {
      const box = el.querySelector('.of-set-cloud');
      box.innerHTML = `<p class="of-note">Kept from ${bk.kind === 'account' ? 'your account' : 'this device'}${bk.at ? ` (${new Date(bk.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })})` : ''}: ${(bk.lines || []).join(' · ')}</p><button type="button" class="of-btn" data-a="restore">Bring the other saves back</button>`;
      box.querySelector('[data-a="restore"]').addEventListener('click', async () => {
        if (!(await ask({ title: 'Swap to the other saves?', text: 'The saves you have now are kept as the backup, so you can swap back.', ok: 'Swap' }))) return;
        await g.cloud.restoreBackup();
      });
    }
    el.querySelector('[data-k="callsign"]').addEventListener('change', e => { g.save.callsign = e.target.value.trim().slice(0, 16) || 'Frame'; g.saveNow(); });
    el.querySelector('[data-k="shake"]').addEventListener('input', e => { s.shake = +e.target.value; g.saveNow(); });
    el.querySelector('[data-k="numbers"]').addEventListener('change', e => { s.numbers = e.target.checked; g.saveNow(); });
    const close = () => { el.remove(); this.pad.popLayer(); };
    el.querySelector('.of-btn.of-primary').addEventListener('click', close);
    el.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.querySelector('.gdlg-modal')) { e.preventDefault(); close(); } });
    document.body.append(el); this.pad.pushLayer(el);
  }
}
