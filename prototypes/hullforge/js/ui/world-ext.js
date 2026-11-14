// Round 2 glue (owner 2026-11-14: "Implement the other features except for mercenaries for now"): factions and
// standing, the jobs board, encounters, planet outposts, drones, the harpoon and the scan pulse. Everything is
// registered from here through main.js's plug-in points (app.hooks, app.services, app.menuItems) and hud.js's
// app.hudMarkers, so the core files only carry small marked edits.
//
// Keys (core/input.js BINDINGS, one owner each): G harpoon, T reel in (hold), V scan, B drones, K jobs, L standing;
// F (main.js 'use') also docks at your outpost, founds one at the orbit spot, trades with a merchant or joins raiders.

import { $, el, toast, banner, num, dist, credits as cr } from './dom.js';
import { play } from '../core/audio.js';
import { BINDINGS, bindingText } from '../core/input.js';
import { save } from '../sim/state.js';
import { attachWorld, interaction, startLiveRaid, abandonLiveRaid, refreshOutpost } from '../sim/worldsys.js';
import { fireHarpoon, harpoonState, release } from '../sim/harpoon.js';
import { scanPulse, scanSummary, scanLabel, marked } from '../sim/scan.js';
import { launchDrones, recallDrones, loadedBays } from '../sim/drones.js';
import { missionMarks, missionState, progressOf, KINDS, boardOf, boardOffers, expireMissions } from '../sim/missions.js';
import { encounterMarks, joinRaid } from '../sim/encounters.js';
import { raidClock, RAID_WARN, outpostIn } from '../sim/outposts.js';
import { FACTIONS, stationOwner, priceMul, repLevel } from '../sim/factions.js';
import { createWorldDraw } from '../render/world-draw.js';
import { ask } from '../../../../shared/dialog.js';
import { openJobsBoard, openJobsLog, jobWhere } from './jobs.js';
import { openStanding } from './factions-ui.js';
import { openOutpost, openOutpostList } from './outpost-ui.js';
import { openMerchant } from './merchant.js';
import { openHangar } from './drones-ui.js';
import { vdist, vlen, vsub } from '../core/math.js';

/** The ship's two most used paints (outposts and drones wear your colours). */
export function shipColours(G) {
  const n = {}; for (const r of G.design || []) if (['hull', 'armor', 'frame'].includes(r[3])) n[r[5]] = (n[r[5]] || 0) + 1;
  const order = Object.keys(n).sort((a, b) => n[b] - n[a]).map(Number);
  return { paint: order[0] ?? 0, accent: order[1] ?? 2 };
}
/** The key (or pad button) for an action, for prompts. */
export function keyFor(app, id) { const b = BINDINGS.find(x => x.id === id); return app.input?.device === 'pad' ? (b?.pad || '') : bindingText(id); }

export function initWorld(app) {
  if (!document.querySelector('link[data-world-css]')) document.head.append(el('link', { rel: 'stylesheet', href: new URL('../../css/world.css', import.meta.url).href, 'data-world-css': '1' }));
  const draw = createWorldDraw(app.scene);
  const track = el('div', { class: 'w-track', id: 'w-track' });
  const prompt = el('div', { class: 'w-prompt', id: 'w-prompt' });
  $('#hud').append(track, prompt);
  let lastW = null, trackT = 0;

  // ---------------------------------------------------------------- entering a system, docking, launching
  app.hooks.enter.push((sys, w) => {
    const G = app.G;
    if (lastW && lastW !== w && lastW.raid) abandonLiveRaid(lastW, G);
    lastW = w;
    attachWorld(w, G, app.gal, { planet: app.sky?.planet?.position ? { x: app.sky.planet.position.x, y: app.sky.planet.position.y, z: app.sky.planet.position.z } : null, ...shipColours(G) });
    w.dronesWanted = !!G.dronesOut;
    draw.reset();
  });
  app.hooks.dock.push(() => {
    const w = app.w; if (!w) return;
    release(w); harpoonState(w).head = null; recallDrones(w); w.drones = [];
    w.sys.oreMul = priceMul(app.G, stationOwner(w.sys));
    for (const m of expireMissions(app.G)) toast(`Too late: ${m.title}. The job was called off.`, 'bad');
    draw.reset();
  });
  app.hooks.launch.push(() => {
    const w = app.w; if (!w) return;
    w.drones = []; w.dronesWanted = !!app.G.dronesOut;
    const c = shipColours(app.G); w.ext.paint = c.paint; w.ext.accent = c.accent;
    if (outpostIn(app.G, w.sys.id) && (!w.outpostBody || w.outpostBody.dead)) refreshOutpost(w, app.G);
  });

  // ---------------------------------------------------------------- every flying frame
  app.hooks.frame.push((dt, now) => {
    const w = app.w, P = app.P, G = app.G; if (!w?.ext || !P) return;
    w.ext.reel = !!app.input.last?.held?.has('reel');
    if (w.dronesWanted && !P.dead && w.t > 0.5) { w.dronesWanted = false; const n = launchDrones(w, G, P, w.ext.paint); if (n) toast(`${n} drone${n > 1 ? 's' : ''} out (${keyFor(app, 'drones')} to recall)`, 'good'); }
    drain(w);
    draw.update(w, P, dt, now, app.pose, app.camera);
    trackT -= dt; if (trackT <= 0) { trackT = 0.25; drawTrack(); }
    drawPrompt();
  });
  function drain(w) {
    const list = w.ext.msgs.splice(0);
    for (const m of list) {
      if (m.t === 'toast') toast(m.text, m.kind || '');
      else if (m.t === 'banner') banner(m.title, m.text || '');
      else if (m.t === 'sound') play(m.id);
    }
    if (list.length) save(app.G);
  }

  // ---------------------------------------------------------------- events from the sim
  app.hooks.event.push(e => {
    switch (e.type) {
      case 'harpoonFire': play('harpoon'); break;
      case 'harpoonHook': play('hook'); break;
      case 'harpoonSnap': play('clang'); toast('The cable snapped: it was stretched too far.', 'bad'); break;
      case 'scan': draw.scanPulse(e.pos, e.range); play('ion'); break;
      case 'droneLost': toast(`${e.name} lost — rebuilt free in 12 s`, 'bad'); break;
      case 'droneBack': toast(`${e.name} rebuilt and back out`, 'good'); break;
      case 'cacheOpen': app.fx.flash(e.pos, '#ffd38a', 6, 0.5); app.fx.ring(e.pos, 4, '#ffd38a', 0.6, app.camera); play('rare'); break;
      case 'shipDown': if (e.player) draw.reset(); break;
    }
  });

  // ---------------------------------------------------------------- keys
  app.hooks.action.push(async id => {
    const w = app.w, P = app.P, G = app.G; if (!w || !P || P.dead || app.mode !== 'fly') return;
    if (id === 'harpoon') { fireHarpoon(w, P, P.input.aimPoint); }
    else if (id === 'scan') {
      const r = scanPulse(w, P);
      if (!r.ok) { toast(`Scanner recharging: ${Math.ceil(r.wait)} s`); return; }
      G.stats.scans = (G.stats.scans || 0) + 1;
      toast(r.found.length ? `Scan ${dist(r.range)}: ${scanSummary(r.found)}` : `Scan ${dist(r.range)}: nothing out here`, r.found.length ? 'good' : '');
    } else if (id === 'drones') {
      if (w.drones?.some(s => s.body && !s.body.dead)) { recallDrones(w); G.dronesOut = false; toast('Drones recalled.'); return; }
      const n = launchDrones(w, G, P, w.ext.paint);
      if (!n) { toast(loadedBays(G, P).length ? 'No drones to launch.' : 'No drones aboard: fit a Drone bay in the Shipyard and load a drone at a station’s Drone hangar.', 'bad'); return; }
      G.dronesOut = true; toast(`${n} drone${n > 1 ? 's' : ''} launched`, 'good');
    } else if (id === 'jobs') openJobsLog(app);
    else if (id === 'factions') openStanding(app);
    else if (id === 'use') {
      const it = interaction(w); if (!it) return;
      if (it.kind === 'outpost' || it.kind === 'found') { P.vel = { ...P.vel, x: 0, y: 0, z: 0 }; openOutpost(app); }
      else if (it.kind === 'merchant') { P.vel = { x: 0, y: 0, z: 0 }; openMerchant(app, it.target); }
      else if (it.kind === 'join') {
        const yes = await ask({ title: 'Join the raiders?', text: `The pirates stop shooting at you and you get a cut when the convoy falls. The traders turn their guns on you and your standing with them drops (now ${repLevel(G, 'traders').name}).`, ok: 'Join them', danger: true });
        app.input.clear();   // the dialog swallows F's key-up: forget held keys so the next F counts
        if (!yes) return;
        const ch = joinRaid(w, it.target, G);
        if (ch) toast(`You joined the raiders. ${ch.map(c => `${FACTIONS[c.faction].short} ${c.d > 0 ? '+' : ''}${Math.round(c.d * 10) / 10}`).join(' · ')}`, 'bad');
      }
    }
  });

  // ---------------------------------------------------------------- station tiles and menu items
  app.services.push(
    { id: 'jobs', title: 'Jobs board', sub: a => { const sys = a.gal.systems[a.G.system]; const n = boardOffers(a.G, a.gal, boardOf(sys)).length; return `${num(n)} jobs offered · ${num(missionState(a.G).active.length)} of 3 taken`; }, open: (a, redraw) => openJobsBoard(a, redraw) },
    { id: 'standing', title: 'Standing', sub: a => { const o = stationOwner(a.gal.systems[a.G.system]); return `${FACTIONS[o].name} run this station · ${repLevel(a.G, o).name}`; }, open: (a, redraw) => openStanding(a, redraw) },
    { id: 'drones', title: 'Drone hangar', sub: a => `${num(a.G.drones.length)} drones · buy, load and sell`, open: (a, redraw) => openHangar(a, redraw) },
    { id: 'outposts', title: 'Your outposts', sub: a => `${num(a.G.outposts.length)} founded · stores and raids`, open: (a, redraw) => openOutpostList(a, redraw), when: a => a.G.outposts.length > 0 },
  );
  app.menuItems.push(
    { label: `Jobs (${bindingText('jobs')})`, run: a => openJobsLog(a), when: a => !!a.G },
    { label: `Standing (${bindingText('factions')})`, run: a => openStanding(a), when: a => !!a.G },
  );

  // ---------------------------------------------------------------- the outpost raid clock (play time, docked too)
  setInterval(() => {
    const G = app.G; if (!G || app.mode === 'title') return;
    const here = app.mode === 'jump' ? null : G.system;
    for (const ev of raidClock(G, G.playTime || 0, here)) {
      if (ev.t === 'warn') { banner('Raid warning', ev.text); toast(ev.text, 'bad'); play('warn'); }
      else if (ev.t === 'paper') toast(ev.text, 'bad');
      else if (ev.t === 'live' && app.w?.sys.id === ev.o.system) startLiveRaid(app.w, ev.o);
    }
    if (app.w?.ext && app.mode !== 'fly') drain(app.w);
  }, 1000);

  // ---------------------------------------------------------------- HUD: tracker card, prompt, markers
  function drawTrack() {
    const G = app.G, w = app.w; const out = [];
    for (const o of G.outposts || []) {
      const left = o.raid.at - (G.playTime || 0);
      if (o.raid.live || (w?.raid && w.raid.o === o.id)) out.push(el('div', { class: 'w-alert' }, `Raiders at ${o.name}!`, el('small', {}, w?.sys.id === o.system ? 'They are stripping its store. Drive them off.' : 'Settled by its guns while you are away.')));
      else if (o.raid.warned && left > 0 && left <= RAID_WARN + 2) out.push(el('div', { class: 'w-alert' }, `Raid on ${o.name} in ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, el('small', {}, w?.sys.id === o.system ? 'Be at the outpost to fight them for loot.' : `Its guns decide it if you are away.`)));
    }
    for (const m of missionState(G).active) {
      const p = progressOf(G, m); const where = jobWhere(app, m);
      const card = el('div', { class: 'w-job', style: `--jc:${KINDS[m.kind].color}` }, el('b', {}, m.title), el('small', {}, where), m.need > 1 ? el('div', { class: 'prog' }, el('i', { style: `width:${Math.round(p.have / p.need * 100)}%` })) : '');
      card.addEventListener('click', () => openJobsLog(app));
      out.push(card);
    }
    track.replaceChildren(...out);
  }
  function drawPrompt() {
    const w = app.w, P = app.P; const lines = [];
    const it = interaction(w);
    if (it) lines.push(el('div', { class: 'use' }, el('span', { class: 'k' }, keyFor(app, 'use') || 'F'), it.label));
    const T = harpoonState(w).tether;
    if (T) lines.push(el('div', { class: 'tow' }, `Towing ${T.b.name || (T.b.kind === 'rock' ? 'an asteroid' : 'a wreck')} · ${dist(T.d || 0)} · hold ${keyFor(app, 'reel')} to reel in · ${keyFor(app, 'harpoon')} lets go`));
    if (P.ionized) lines.push(el('div', {}, 'Ion cloud: shields will not refill in here'));
    const key = lines.map(l => l.textContent).join('|');
    if (prompt.dataset.key !== key) { prompt.dataset.key = key; prompt.replaceChildren(...lines); }
  }

  (app.hudMarkers ||= []).push({
    overlay({ g, project, label, bracket, W, H, cx, cy, P, w }) {
      if (!w.ext) return;
      const G = app.G;
      const onScreen = s => s.front && s.x > 20 && s.x < W - 20 && s.y > 20 && s.y < H - 20;
      const edge = (s, col) => {
        let dx = s.x - cx, dy = s.y - cy; if (!s.front) { dx = -dx; dy = -dy; }
        const a = Math.atan2(dy, dx); const R = Math.min(W, H) * 0.42;
        g.save(); g.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.rotate(a); g.strokeStyle = col; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(-4, -8); g.lineTo(8, 0); g.lineTo(-4, 8); g.stroke(); g.restore();
      };
      // jobs: always shown, with an edge arrow when off screen
      for (const mk of missionMarks(G, w, w.sys.id)) {
        if (mk.body === w.station && mk.stage === 'deliver') continue;   // the station already has its own marker
        const s = project(mk.pos); const d = vlen(vsub(mk.pos, P.pos));
        if (onScreen(s)) { g.strokeStyle = mk.color; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(s.x, s.y, 11, 0, 7); g.stroke(); g.setLineDash([]); label(s.x, s.y - 20, `${mk.label} · ${dist(d)}`, mk.color); }
        else edge(s, mk.color);
      }
      // encounters: a small diamond, named when within 2.5 km
      for (const mk of encounterMarks(w)) {
        const d = vlen(vsub(mk.pos, P.pos)); if (d > 7000) continue;
        const s = project(mk.pos); if (!onScreen(s)) continue;
        g.fillStyle = mk.color; g.beginPath(); g.moveTo(s.x, s.y - 6); g.lineTo(s.x + 6, s.y); g.lineTo(s.x, s.y + 6); g.lineTo(s.x - 6, s.y); g.closePath(); g.fill();
        if (d < 2500 || mk.e.kind === 'elite') label(s.x, s.y + 18, `${mk.label} · ${dist(d)}`, mk.color);
      }
      // the orbit spot where an outpost can go
      if (w.orbit && !w.outpostBody) {
        const s = project(w.orbit); const d = vlen(vsub(w.orbit, P.pos));
        if (onScreen(s)) { g.strokeStyle = '#62f0a8'; g.lineWidth = 1.5; g.setLineDash([3, 4]); g.beginPath(); g.arc(s.x, s.y, 10, 0, 7); g.stroke(); g.setLineDash([]); label(s.x, s.y + 22, `Outpost site · ${dist(d)}`, '#62f0a8'); }
      }
      // scan marks
      for (const b of w.bodies) {
        if (b.dead || b.hidden || !marked(w, b)) continue;
        const d = vlen(vsub(b.pos, P.pos)); if (d > 2500) continue;
        const s = project(app.pose(b).pos); if (!onScreen(s)) continue;
        const L = scanLabel(b);
        g.strokeStyle = L.color; g.lineWidth = 1.5; g.strokeRect(s.x - 4, s.y - 4, 8, 8);
        if (d < 700 || b.cache) label(s.x, s.y - 14, b.cache ? `${L.label} · ${dist(d)}` : L.label, L.color);
      }
      // traders, the patrol and your drones: small chevrons, named up close
      for (const b of w.bodies) {
        if (b.dead || b === P || b.kind !== 'ship' || b.team === 'hostile' || b.angry) continue;
        const d = vlen(vsub(b.pos, P.pos)); if (d > 1500 || (b.drone && d > 300)) continue;
        const s = project(app.pose(b).pos); if (!onScreen(s)) continue;
        const col = b.team === 'player' ? '#5fd8ff' : b.team === 'ally' ? '#7ad8ff' : '#ffd27a';
        g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.moveTo(s.x - 6, s.y - 9); g.lineTo(s.x, s.y - 4); g.lineTo(s.x + 6, s.y - 9); g.stroke();
        if (!b.drone && d < 500) label(s.x, s.y - 18, b.name, col);
      }
      // what is on the harpoon
      const T = harpoonState(w).tether;
      if (T && !T.b.dead) { const pp = app.pose(T.b).pos; const s = project(pp); if (onScreen(s)) { g.strokeStyle = '#ffd27a'; g.lineWidth = 1.6; bracket(s.x, s.y, Math.max(14, Math.min(90, T.b.radius * app.camera.projectionMatrix.elements[5] * H / 2 / Math.max(1, vdist(pp, app.camera.position)))), '#ffd27a'); } }
    },
    radar({ dot, P, w }) {
      if (!w.ext) return;
      for (const mk of encounterMarks(w)) dot(mk.pos, mk.color, 3, false);
      if (w.orbit && !w.outpostBody) dot(w.orbit, '#62f0a8', 3, false);
      for (const b of w.bodies) if (!b.dead && marked(w, b) && b.kind === 'rock' && vdist(b.pos, P.pos) < 2000) dot(b.pos, scanLabel(b).color, 2, false);
      for (const mk of missionMarks(app.G, w, w.sys.id)) dot(mk.pos, mk.color, 4.5);
    },
  });
}
