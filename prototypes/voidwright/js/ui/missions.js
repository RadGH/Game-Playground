// Missions, encounters and galaxy events on screen (PLAN §E1 E6-E8, E10). One module so main.js only needs a few
// hook lines:
//   initExpansion(app)     sets app.encTick(dt) (main.js frame, while flying), app.encNote(n) (main.js handleNotes),
//                          app.encInteract() (main.js nearestInteract), app.encOverlay (world-space drawing),
//                          app.missionsSection(box) (Goals panel)
//   missionsTab(S, box, bountyTab)   the station "Missions" tab (station.js); bounties are a section of it, so there
//                          is one screen for jobs, not two
//
// The sim parts are js/sim/encounters.js, js/sim/missions.js and js/sim/events.js.

import { el, btn, toast, banner, fmt } from './dom.js';
import { play } from '../core/audio.js';
import { encounterTick, encounterInteract, onKillNote } from '../sim/encounters.js';
import { MISSION_KINDS, MAX_ACTIVE, missionState, boardOf, boardOffers, boardRefresh, acceptMission, abandonMission, progressOf, handInBlock, handIn, missionTarget, missionTick } from '../sim/missions.js';
import { eventsAt, EVENT_KINDS, timeLeft } from '../sim/events.js';

const km = d => `${Math.max(0.1, Math.round(d / 100) / 10)} km`;
const mins = s => (s >= 60 ? `${Math.ceil(s / 60)} min` : `${Math.max(0, Math.ceil(s))} s`);

// ------------------------------------------------------------------ glue
export function initExpansion(app) {
  let lastW = null;
  app.encTick = dt => {
    const w = app.w, G = app.G; if (!w || !G || !app.P) return;
    missionState(G);
    if (w !== lastW) { lastW = w; arrived(app); }
    encounterTick(w, G, app.galaxy, dt);
    missionTick(w, G, dt);
    drain(app);
    hud(app, dt);
  };
  app.encNote = n => { if (n.t === 'kill' && app.w && app.G) onKillNote(app.w, app.G, n); };
  app.encInteract = () => (app.w ? encounterInteract(app.w, app.P) : null);
  app.encOverlay = (g, z) => drawWorld(app, g, z);
  app.missionsSection = box => goalsSection(app, box);
}

/** Banners and toasts the sim asked for. */
function drain(app) {
  const w = app.w; const list = w.encMsgs; if (!list?.length) return;
  w.encMsgs = [];
  for (const m of list) {
    if (m.t === 'banner') banner(m.title, m.text || '');
    else if (m.t === 'toast') toast(m.text, m.kind || '');
    else if (m.t === 'sound') play(m.id);
    else if (m.t === 'merchant') import('./merchant.js').then(x => x.openMerchant(app, m.e)).catch(e => console.error(e));
  }
  app.updateQuest?.();
}

/** Arriving in a system with a galaxy event running: say so once. */
function arrived(app) {
  const G = app.G; const evs = eventsAt(app.galaxy, G.system, G.playTime);
  if (!evs.length) return;
  const e = evs[0]; const K = EVENT_KINDS[e.kind];
  setTimeout(() => banner(`${K.name} — ${timeLeft(e, G.playTime)} left`, K.gives), 1600);
}

// ------------------------------------------------------------------ HUD lines under the goal box
let hudEl = null, hudT = 0, hudSig = '';
function hud(app, dt) {
  if ((hudT -= dt) > 0) return; hudT = 0.3;
  const G = app.G, w = app.w, P = app.P;
  if (!hudEl) {
    hudEl = el('div', { id: 'mission-hud', class: 'ms-hud' });
    document.querySelector('#hud')?.append(hudEl);
  }
  const act = missionState(G).active;
  const q = document.querySelector('#quest');
  if (!act.length || app.mode !== 'fly') { hudEl.classList.add('hidden'); return; }
  hudEl.classList.remove('hidden');
  if (q && !q.classList.contains('hidden')) { const r = q.getBoundingClientRect(); hudEl.style.top = `${Math.round(r.bottom + 6)}px`; }
  const rows = act.map(m => {
    const p = progressOf(G, m); const tg = missionTarget(m, w, G.system);
    const far = tg ? km(Math.hypot(tg.x - P.x, tg.y - P.y)) : m.kind === 'delivery' || m.kind === 'acquire' ? `to ${m.kind === 'delivery' ? m.to.name : m.board.name}` : '';
    const clock = m.expires ? ` · ${mins(m.expires - G.playTime)}` : '';
    return { m, tg, text: `${m.title}`, sub: `${p.need > 1 ? `${fmt(p.have)} / ${fmt(p.need)} · ` : ''}${far}${clock}` };
  });
  const sig = rows.map(r => r.text + r.sub).join('|');
  if (sig === hudSig) return; hudSig = sig;
  hudEl.innerHTML = '';
  for (const r of rows) {
    const line = el('button', { class: 'ms-line', style: `--k:${MISSION_KINDS[r.m.kind].color}` }, el('b', {}, r.text), el('span', {}, r.sub));
    line.addEventListener('click', e => { e.stopPropagation(); if (r.tg) { app.waypoint = { x: r.tg.x, y: r.tg.y, label: r.tg.label }; toast(`Course set: ${r.tg.label}`); } else toast(r.m.kind === 'delivery' ? `Deliver at ${r.m.to.name}.` : `Hand over at ${r.m.board.name}.`); });
    hudEl.append(line);
  }
}

// ------------------------------------------------------------------ the station tab
/** The Missions tab: your jobs, the board's offers, and (where the station has one) the bounty board. */
export function missionsTab(S, box, bountyTab) {
  const { G, app, st, sys } = S;
  const M = missionState(G);
  const board = boardOf(sys, st);
  const t = G.playTime || 0;
  box.append(el('h3', { class: 'st-h' }, `Your jobs (${M.active.length} / ${MAX_ACTIVE})`));
  if (!M.active.length) box.append(el('p', { class: 'hint' }, 'No jobs yet. Take one from the board below.'));
  else {
    const cards = el('div', { class: 'cards' });
    for (const m of M.active) cards.append(jobCard(app, G, m, board, S));
    box.append(cards);
  }
  box.append(el('h3', { class: 'st-h' }, 'Board'), el('p', { class: 'hint' }, `New jobs in ${mins(boardRefresh(t))}. ${fmt(M.done || 0)} jobs finished so far.`));
  const offers = boardOffers(G, app.galaxy, board, t);
  const cards = el('div', { class: 'cards' });
  const full = M.active.length >= MAX_ACTIVE;
  for (const m of offers) {
    const K = MISSION_KINDS[m.kind];
    const where = m.system === -1 ? 'Any system' : m.kind === 'delivery' ? `To ${m.to.name}${m.to.system !== sys.id ? ' (one jump)' : ''}` : m.kind === 'acquire' ? `Bring it here` : 'In this system';
    const dist = m.target ? km(Math.hypot(m.target.x - st.x, m.target.y - st.y)) : m.site ? km(Math.hypot(m.site.x - st.x, m.site.y - st.y)) : m.to?.x != null ? km(Math.hypot(m.to.x - st.x, m.to.y - st.y)) : '';
    const c = el('div', { class: 'card ms-card', style: `--k:${K.color}` },
      el('div', { class: 'ms-top' }, el('span', { class: 'ms-kind' }, K.name), el('span', { class: 'ms-pay' }, `${fmt(m.reward.cr)} cr`)),
      el('b', { class: 'ms-title' }, m.title),
      el('div', { class: 'hint' }, m.text),
      el('div', { class: 'ms-meta' }, el('span', {}, where), dist ? el('span', {}, dist) : '', m.limit ? el('span', { class: 'amber' }, `${mins(m.limit)} limit`) : '',
        el('span', { class: 'good' }, `+${m.reward.rep} standing`), m.reward.part ? el('span', { class: 'ms-part' }, '+ a part') : ''),
      full ? el('div', { class: 'bad ms-why' }, `You have ${MAX_ACTIVE} jobs already.`) : '',
      btn('Accept', () => {
        const why = acceptMission(G, m); if (why) return toast(why, 'bad');
        const live = M.active.find(x => x.id === m.id);
        const tg = live && aimFor(live, st);
        if (tg) app.waypoint = tg;
        play('coin');
        S.done(`Job taken: ${m.title}${tg ? ' — course set' : ''}`);
      }, full ? '' : 'primary'));
    cards.append(c);
  }
  if (!offers.length) cards.append(el('p', { class: 'hint' }, 'The board is empty. New jobs come in soon.'));
  box.append(cards);
  // bounties live on the same screen (one screen per job): only where the station keeps a bounty board
  if (bountyTab && st.services?.includes('bounty') && G.unlocked.bounty) bountyTab(S, box);
}

/** Where to point the course marker for a fresh job (we are docked, so the world may not have spawned it yet). */
function aimFor(m, st) {
  if (m.kind === 'recovery') return { x: m.target.x, y: m.target.y, label: 'Tow target' };
  if (m.kind === 'clear') return { x: m.site.x, y: m.site.y, label: m.title.replace('Clear out a ', '') };
  if (m.kind === 'escort') return { x: m.to.x, y: m.to.y, label: 'Relay beacon' };
  void st; return null;
}

function jobCard(app, G, m, board, S) {
  const K = MISSION_KINDS[m.kind]; const p = progressOf(G, m);
  const block = m.kind === 'delivery' || m.kind === 'acquire' ? handInBlock(G, m, board.id) : null;
  const ready = (m.kind === 'delivery' || m.kind === 'acquire') && !block;
  const c = el('div', { class: 'card ms-card' + (ready ? ' st-ready' : ''), style: `--k:${K.color}` },
    el('div', { class: 'ms-top' }, el('span', { class: 'ms-kind' }, K.name), el('span', { class: 'ms-pay' }, `${fmt(m.reward.cr)} cr`)),
    el('b', { class: 'ms-title' }, m.title),
    el('div', { class: 'hint' }, `From ${m.board.name}. ${m.text}`),
    el('div', { class: 'ms-prog' }, el('i', { style: `width:${Math.round(p.have / Math.max(1, p.need) * 100)}%` })),
    el('div', { class: 'ms-meta' }, el('span', {}, `${fmt(p.have)} / ${fmt(p.need)}`), m.expires ? el('span', { class: 'amber' }, `${mins(m.expires - G.playTime)} left`) : '', block && (m.kind === 'delivery' || m.kind === 'acquire') ? el('span', { class: 'hint' }, block) : ''));
  const row = el('div', { class: 'row wrap' });
  if (ready) row.append(btn('Hand over', () => { const res = handIn(G, m); banner(`Job done: ${m.title}`, res.text); play('rare'); S.done(); }, 'primary'));
  if (m.kind !== 'delivery' && m.kind !== 'acquire' && (m.system === G.system)) { const tg = aimFor(m); if (tg) row.append(btn('Set course', () => { app.waypoint = tg; toast(`Course set: ${tg.label}`); })); }
  row.append(btn('Give up', () => { abandonMission(G, m); S.done('Job dropped.', ''); }));
  c.append(row);
  return c;
}

// ------------------------------------------------------------------ the Goals panel section
function goalsSection(app, box) {
  const G = app.G; const M = missionState(G);
  box.append(el('h3', { style: 'margin-top:12px' }, `Jobs (${M.active.length} / ${MAX_ACTIVE})`));
  if (!M.active.length) { box.append(el('p', { class: 'hint' }, G.unlocked.missions ? 'Take jobs from the Missions tab of a station or outpost.' : 'Mission boards open later.')); return; }
  const cards = el('div', { class: 'cards' });
  for (const m of M.active) {
    const K = MISSION_KINDS[m.kind]; const p = progressOf(G, m); const tg = missionTarget(m, app.w, G.system) || (m.system === G.system ? aimFor(m) : null);
    cards.append(el('div', { class: 'card ms-card', style: `--k:${K.color}` },
      el('div', { class: 'ms-top' }, el('span', { class: 'ms-kind' }, K.name), el('span', { class: 'ms-pay' }, `${fmt(m.reward.cr)} cr`)),
      el('b', { class: 'ms-title' }, m.title), el('div', { class: 'hint' }, m.text),
      el('div', { class: 'ms-meta' }, el('span', {}, `${fmt(p.have)} / ${fmt(p.need)}`), m.expires ? el('span', { class: 'amber' }, `${mins(m.expires - G.playTime)} left`) : '',
        m.system >= 0 && m.system !== G.system ? el('span', {}, `In ${app.galaxy.systems[m.system].name}`) : ''),
      el('div', { class: 'row wrap' }, tg ? btn('Set course', () => { app.waypoint = { x: tg.x, y: tg.y, label: tg.label }; toast(`Course set: ${tg.label}`); }) : '',
        btn('Give up', e => { abandonMission(G, m); e.target.closest('.card')?.remove(); toast('Job dropped.'); }))));
  }
  box.append(cards);
}

// ------------------------------------------------------------------ world-space drawing (rifts, clouds, sections, labels)
function drawWorld(app, g, z) {
  const w = app.w; if (!w?.enc || app.mode === 'title') return;
  const cam = app.cam; const vw = innerWidth / z, vh = innerHeight / z;
  const inView = (x, y, r) => Math.abs(x - cam.x) < vw / 2 + r && Math.abs(y - cam.y) < vh / 2 + r;
  const t = w.t; const k = 1 / z;
  g.save();
  for (const e of w.enc.list) {
    if (e.kind === 'ion' && inView(e.x, e.y, e.radius)) {
      const gr = g.createRadialGradient(e.x, e.y, e.radius * 0.1, e.x, e.y, e.radius);
      gr.addColorStop(0, 'rgba(110,150,255,0.16)'); gr.addColorStop(0.7, 'rgba(90,120,255,0.08)'); gr.addColorStop(1, 'rgba(90,120,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(e.x, e.y, e.radius, 0, 7); g.fill();
      g.strokeStyle = 'rgba(140,180,255,0.25)'; g.lineWidth = 2 * k; g.setLineDash([14 * k, 12 * k]); g.beginPath(); g.arc(e.x, e.y, e.radius, 0, 7); g.stroke(); g.setLineDash([]);
    } else if (e.kind === 'rift' && !e.st.closed && inView(e.x, e.y, 600)) {
      for (let i = 0; i < 4; i++) {
        const a = t * (0.4 + i * 0.15) * (i % 2 ? -1 : 1);
        g.strokeStyle = `rgba(${200 + i * 10},${90 + i * 20},255,${0.55 - i * 0.1})`; g.lineWidth = (6 - i) * 1.6;
        g.beginPath(); g.ellipse(e.x, e.y, 70 + i * 55 + Math.sin(t * 2 + i) * 10, 200 + i * 40, a, 0, 7); g.stroke();
      }
      g.fillStyle = 'rgba(255,220,255,0.85)'; g.beginPath(); g.ellipse(e.x, e.y, 18, 120, Math.sin(t) * 0.2, 0, 7); g.fill();
      app.fx?.lights?.push({ x: e.x, y: e.y, r: 700, color: '#d06aff', life: 0.016, max: 0.016, k: 0.6 });
    } else if (e.kind === 'ruin' && inView(e.x, e.y, 900)) {
      for (const q of e.sections) {
        const s = 22; g.save(); g.translate(q.x, q.y); g.rotate(Math.PI / 4);
        g.strokeStyle = q.done ? 'rgba(140,140,140,0.4)' : `rgba(255,220,150,${0.6 + 0.3 * Math.sin(t * 3 + q.i)})`; g.lineWidth = 3;
        g.strokeRect(-s / 2, -s / 2, s, s); g.restore();
        if (!q.done) label(g, `Section ${q.i + 1}`, q.x, q.y - 26, '#ffe2a8', k);
      }
    } else if (e.kind === 'hulk' && e.cache && !e.cache.open && inView(e.cache.x, e.cache.y, 200)) {
      const p = 0.6 + 0.4 * Math.sin(t * 3);
      g.fillStyle = `rgba(255,216,74,${0.7 * p})`; g.fillRect(e.cache.x - 9, e.cache.y - 9, 18, 18);
      g.strokeStyle = '#ffd84a'; g.lineWidth = 2; g.strokeRect(e.cache.x - 14, e.cache.y - 14, 28, 28);
      label(g, 'Sealed cache', e.cache.x, e.cache.y - 26, '#ffd84a', k);
      app.fx?.lights?.push({ x: e.cache.x, y: e.cache.y, r: 160, color: '#ffd84a', life: 0.016, max: 0.016, k: 0.5 });
    } else if (e.kind === 'elite' && !e.ships[0].dead && inView(e.ships[0].x, e.ships[0].y, 400)) {
      const s = e.ships[0]; label(g, `WANTED · ${e.name} · ${fmt(e.reward)} cr`, s.x, s.y - s.r - 26 * k, '#ff7a3a', k);
    } else if (e.kind === 'vault' && e.open && !e.cracked) {
      const s = e.ships[0]; if (inView(s.x, s.y, s.r + 200)) label(g, 'Vault open — Use to crack it', s.x, s.y - s.r - 24 * k, '#ffd84a', k);
    }
  }
  // escort relay beacons
  for (const m of app.G?.missions?.active || []) if (m.kind === 'escort' && m.system === app.G.system && inView(m.to.x, m.to.y, 300)) {
    g.strokeStyle = 'rgba(122,255,216,0.7)'; g.lineWidth = 3 * k; g.beginPath(); g.arc(m.to.x, m.to.y, 600, 0, 7); g.stroke();
    label(g, 'Relay beacon', m.to.x, m.to.y - 30 * k, '#7affd8', k);
  }
  g.restore();
}
function label(g, text, x, y, color, k) {
  g.font = `600 ${Math.round(13 * k)}px Rajdhani, system-ui`; g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(text, x + 1 * k, y + 1 * k);
  g.fillStyle = color; g.fillText(text, x, y);
}

