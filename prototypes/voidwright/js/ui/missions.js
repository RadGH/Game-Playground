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
import { MISSION_KINDS, MAX_ACTIVE, missionState, boardOf, boardOffers, boardRefresh, acceptMission, abandonMission, progressOf, handInBlock, handIn, missionTarget, missionMarks, missionTick } from '../sim/missions.js';
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
    followCourse(app);
    drain(app);
    hud(app, dt);
  };
  app.encNote = n => { if (n.t === 'kill' && app.w && app.G) onKillNote(app.w, app.G, n); };
  app.encInteract = () => (app.w ? encounterInteract(app.w, app.P) : null);
  app.encOverlay = (g, z) => drawWorld(app, g, z);
  app.missionsSection = box => goalsSection(app, box);
  app.missionOverlay = (c, o) => drawMarks(app, c, o);   // main.js drawOverlay, after the other markers (so these sit on top)
}

/** Set the course marker to a job: it then follows the job's stage (sim/missions.js missionTarget). */
export function followMission(app, m, quiet = false) {
  const tg = app.w && missionTarget(m, app.w, app.G.system);
  const at = tg || (m.system === app.G.system ? aimFor(m) : null);
  if (!at) { if (!quiet) toast(m.kind === 'delivery' ? `Deliver at ${m.to.name}.` : m.kind === 'acquire' ? `Hand over at ${m.board.name}.` : 'This job has no single place to go.'); return null; }
  app.waypoint = { x: at.x, y: at.y, label: at.label, mission: m.id };
  if (!quiet) toast(`Course set: ${at.label}`);
  return app.waypoint;
}

/**
 * Each frame: a course that follows a job moves with it (the tow target drifts, the freighter flies, the stage
 * changes); a job whose stage changed says where to go next.
 */
const stages = new Map();
function followCourse(app) {
  const G = app.G, w = app.w; const act = missionState(G).active;
  for (const m of act) {
    const tg = missionTarget(m, w, G.system); const st = tg?.stage || null; const was = stages.get(m.id);
    if (was !== undefined && was !== st && tg) {
      if (st === 'tow') { toast(`Got it. Tow it to ${m.dest.name} — follow the ${MISSION_KINDS[m.kind].name.toLowerCase()} arrow.`, 'good'); if (!app.waypoint || app.waypoint.mission === m.id || !act.some(x => x.id === app.waypoint.mission)) followMission(app, m, true); }
      else if (st === 'find' && was === 'tow') toast('The tow line came loose. Harpoon it again (F).', 'bad');
    }
    stages.set(m.id, st);
  }
  const wp = app.waypoint; if (!wp?.mission) return;
  const m = act.find(x => x.id === wp.mission);
  if (!m) { app.waypoint = null; return; }
  const tg = missionTarget(m, w, G.system);
  if (tg) { wp.x = tg.x; wp.y = tg.y; wp.label = tg.label; }
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
    const away = m.kind === 'delivery' ? m.to.system : m.kind === 'acquire' ? m.board.system : m.system;
    const far = tg ? `${tg.label} · ${km(Math.hypot(tg.x - P.x, tg.y - P.y))}` : away >= 0 && away !== G.system ? `Jump to ${app.galaxy.systems[away]?.name || 'another system'}` : m.kind === 'survey' && m.survey.what === 'rock' ? 'Scan asteroids here (V)' : '';
    const clock = m.expires ? ` · ${mins(m.expires - G.playTime)}` : '';
    return { m, tg, text: `${m.title}`, sub: `${p.need > 1 ? `${fmt(p.have)} / ${fmt(p.need)} · ` : ''}${far}${clock}` };
  });
  const sig = rows.map(r => r.text + r.sub).join('|');
  if (sig === hudSig) return; hudSig = sig;
  hudEl.innerHTML = '';
  for (const r of rows) {
    const line = el('button', { class: 'ms-line', style: `--k:${MISSION_KINDS[r.m.kind].color}` }, el('b', {}, r.text), el('span', {}, r.sub));
    line.addEventListener('click', e => { e.stopPropagation(); followMission(app, r.m); });
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
        if (tg) app.waypoint = { ...tg, mission: live.id };   // follows the job's stage once you fly (followCourse)
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
  if (m.kind === 'clear') return { x: m.site.x, y: m.site.y, label: m.title.replace('Clear out a ', 'Clear: ') };
  if (m.kind === 'escort') return { x: m.from.x, y: m.from.y, label: 'Meet the freighter' };
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
  if (m.kind !== 'delivery' && m.kind !== 'acquire' && (m.system === G.system)) { const tg = aimFor(m); if (tg) row.append(btn('Set course', () => { app.waypoint = { ...tg, mission: m.id }; toast(`Course set: ${tg.label}`); })); }
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
      el('div', { class: 'row wrap' }, tg ? btn('Set course', () => followMission(app, m)) : '',
        btn('Give up', e => { abandonMission(G, m); e.target.closest('.card')?.remove(); toast('Job dropped.'); }))));
  }
  box.append(cards);
}

// ------------------------------------------------------------------ world-space drawing (rifts, clouds, sections, labels)
function drawWorld(app, g, z) {
  const w = app.w; if (!w || app.mode === 'title') return;
  if (w.tractors?.length) { g.save(); drawTractors(app, g, 1 / z); g.restore(); }
  if (!w.enc) return;
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
// ------------------------------------------------------------------ job markers on screen (live reports #43/#46)
/**
 * Every job with a place gets its own marker, drawn after (on top of) every other marker: a reticle on the spot
 * while it is on screen, an arrow at the screen edge with the distance while it is not. The job your course
 * follows pulses. Colours are the job kinds' colours (MISSION_KINDS).
 */
// HUD boxes the markers must not hide under (the goal box, the job list, the radar, the top-left bars…), in
// overlay pixels; read from the page a few times a second, not every frame
let hudBoxes = [], hudBoxT = 0;
const HUD_SEL = '#btn-menu, #st-credits, #st-system, #bars, #mini-stats, #quest, #mission-hud, #target, #minimap, #touch .tbtn';
function hudRects(k, now) {
  if (now - hudBoxT < 0.4) return hudBoxes;
  hudBoxT = now; hudBoxes = [];
  for (const e of document.querySelectorAll(HUD_SEL)) {
    if (e.closest('.hidden')) continue; const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    hudBoxes.push([(r.left - 6) * k, (r.top - 6) * k, (r.right + 6) * k, (r.bottom + 6) * k]);
  }
  return hudBoxes;
}
const hits = (boxes, x0, y0, x1, y1) => boxes.some(b => x1 > b[0] && x0 < b[2] && y1 > b[1] && y0 < b[3]);

function drawMarks(app, c, o) {
  const w = app.w, P = app.P, G = app.G; if (!w || !P || !G || app.mode === 'title') return;
  const marks = missionMarks(G, w, G.system); if (!marks.length) return;
  const k = o.ok, t = w.t; const follow = app.waypoint?.mission;
  const padX = 34 * k, padTop = 40 * k, padBot = 40 * k;
  const boxes = hudRects(k, performance.now() / 1000); const placed = [];
  c.save(); c.font = `700 ${Math.round(12 * k)}px Rajdhani, system-ui`; c.textBaseline = 'middle';
  // the followed job last, so it is on top of the others
  marks.sort((a, b) => (a.m.id === follow) - (b.m.id === follow));
  for (const mk of marks) {
    const on = mk.m.id === follow; const pulse = on ? 0.75 + 0.25 * Math.sin(t * 5) : 0.85;
    const x = o.ox(mk.x), y = o.oy(mk.y); const d = Math.hypot(mk.x - P.x, mk.y - P.y);
    const text = `${mk.label} · ${km(d)}`;
    const inside = x > padX && y > padTop && x < o.ow - padX && y < o.oh - padBot && !hits(boxes, x - 4, y - 4, x + 4, y + 4);
    let lx, ly, ux = 0, uy = -1;
    if (inside) {
      // reticle: four corners round the spot (or round the body), turning slowly
      const r = Math.max(16 * k, (mk.body?.r || 0) * o.oz * 1.15);
      c.strokeStyle = mk.color; c.lineWidth = (on ? 3 : 2) * k; c.globalAlpha = pulse;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4 + t * 0.6; const cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r; const q = 7 * k;
        c.beginPath(); c.moveTo(cx - Math.cos(a - 0.9) * q, cy - Math.sin(a - 0.9) * q); c.lineTo(cx, cy); c.lineTo(cx - Math.cos(a + 0.9) * q, cy - Math.sin(a + 0.9) * q); c.stroke();
      }
      lx = x; ly = y - r - 14 * k;
    } else {
      // arrow on the screen edge, along the line from the middle of the screen to the spot
      const cx = o.ow / 2, cy = o.oh / 2; const dx = x - cx, dy = y - cy; const a = Math.atan2(dy, dx);
      const sx = dx > 0 ? (o.ow - padX - cx) / dx : dx < 0 ? (padX - cx) / dx : Infinity;
      const sy = dy > 0 ? (o.oh - padBot - cy) / dy : dy < 0 ? (padTop - cy) / dy : Infinity;
      let s = Math.min(sx, sy); let ex = cx + dx * s, ey = cy + dy * s;
      // slide in along the same line until the arrow is clear of the HUD boxes
      for (let i = 0; i < 60 && hits(boxes, ex - 14 * k, ey - 14 * k, ex + 14 * k, ey + 14 * k); i++) { s *= 0.96; ex = cx + dx * s; ey = cy + dy * s; }
      const L = (on ? 17 : 14) * k;
      c.save(); c.translate(ex, ey); c.rotate(a); c.globalAlpha = pulse;
      c.beginPath(); c.moveTo(L, 0); c.lineTo(-L * 0.6, -L * 0.7); c.lineTo(-L * 0.25, 0); c.lineTo(-L * 0.6, L * 0.7); c.closePath();
      c.fillStyle = mk.color; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = 2.5 * k; c.stroke(); c.fill();
      c.restore();
      // the label sits on the inner side of the arrow
      lx = ex - Math.cos(a) * 30 * k; ly = ey - Math.sin(a) * 24 * k; ux = -Math.cos(a); uy = -Math.sin(a);
    }
    c.globalAlpha = 1;
    const tw = c.measureText(text).width + 12 * k; const th = 18 * k;
    const clampL = () => { lx = Math.max(tw / 2 + 4 * k, Math.min(o.ow - tw / 2 - 4 * k, lx)); ly = Math.max(th, Math.min(o.oh - th, ly)); };
    clampL();
    // the label keeps clear of the HUD and of the other job labels: step inward (toward the middle) until it is
    for (let i = 0; i < 40 && (hits(boxes, lx - tw / 2, ly - th / 2, lx + tw / 2, ly + th / 2) || hits(placed, lx - tw / 2, ly - th / 2, lx + tw / 2, ly + th / 2)); i++) {
      if (hits(placed, lx - tw / 2, ly - th / 2, lx + tw / 2, ly + th / 2) && !hits(boxes, lx - tw / 2, ly - th / 2, lx + tw / 2, ly + th / 2)) ly += (ly < o.oh / 2 ? 1 : -1) * (th + 2 * k);
      else { lx += ux * 12 * k; ly += uy * 12 * k; }
      clampL();
    }
    placed.push([lx - tw / 2, ly - th / 2, lx + tw / 2, ly + th / 2]);
    c.fillStyle = 'rgba(4,8,18,0.82)'; c.fillRect(lx - tw / 2, ly - th / 2, tw, th);
    c.fillStyle = mk.color; c.fillRect(lx - tw / 2, ly - th / 2, 3 * k, th);
    if (on) { c.strokeStyle = mk.color; c.lineWidth = 1 * k; c.strokeRect(lx - tw / 2, ly - th / 2, tw, th); }
    c.textAlign = 'center'; c.fillStyle = on ? '#ffffff' : mk.color; c.fillText(text, lx + 1.5 * k, ly + 0.5 * k);
  }
  c.restore();
}

/** Tractor beams: a station pulling a delivered tow in (sim/missions.js pullIn). */
function drawTractors(app, g, k) {
  const w = app.w; if (!w?.tractors?.length) return;
  const t = w.t;
  for (const T of w.tractors) {
    const b = T.b; const sx = T.st ? T.st.x : T.tx, sy = T.st ? T.st.y : T.ty;
    const dx = b.x - sx, dy = b.y - sy; const d = Math.hypot(dx, dy) || 1; const ux = dx / d, uy = dy / d;
    const from = Math.min(d * 0.5, (T.st?.r || 60) * 0.8); const x0 = sx + ux * from, y0 = sy + uy * from;
    const half = Math.max(20, b.r * (b.shrink ?? 1) * 0.9); const px = -uy, py = ux; const a = T.b.fade ?? 1;
    // the beam: a soft cone from the station to the hull
    const gr = g.createLinearGradient(x0, y0, b.x, b.y);
    gr.addColorStop(0, `rgba(120,220,255,${0.5 * a})`); gr.addColorStop(1, `rgba(120,220,255,${0.18 * a})`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(x0 + px * 8, y0 + py * 8); g.lineTo(b.x + px * half, b.y + py * half); g.lineTo(b.x - px * half, b.y - py * half); g.lineTo(x0 - px * 8, y0 - py * 8); g.closePath(); g.fill();
    // rings running toward the station
    g.strokeStyle = `rgba(180,240,255,${0.7 * a})`; g.lineWidth = 2.5 * k * 2;
    for (let i = 0; i < 4; i++) {
      const f = 1 - ((t * 0.9 + i / 4) % 1); const cx = x0 + (b.x - x0) * f, cy = y0 + (b.y - y0) * f; const hw = 8 + (half - 8) * f;
      g.beginPath(); g.moveTo(cx + px * hw, cy + py * hw); g.lineTo(cx - px * hw, cy - py * hw); g.stroke();
    }
    // the two edge lines
    g.strokeStyle = `rgba(150,230,255,${0.8 * a})`; g.lineWidth = 2 * k * 2;
    g.beginPath(); g.moveTo(x0 + px * 8, y0 + py * 8); g.lineTo(b.x + px * half, b.y + py * half); g.moveTo(x0 - px * 8, y0 - py * 8); g.lineTo(b.x - px * half, b.y - py * half); g.stroke();
    app.fx?.lights?.push({ x: b.x, y: b.y, r: half * 4, color: '#78dcff', life: 0.016, max: 0.016, k: 0.5 * a });
    app.fx?.lights?.push({ x: x0, y: y0, r: 260, color: '#78dcff', life: 0.016, max: 0.016, k: 0.6 * a });
  }
}

function label(g, text, x, y, color, k) {
  g.font = `600 ${Math.round(13 * k)}px Rajdhani, system-ui`; g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(text, x + 1 * k, y + 1 * k);
  g.fillStyle = color; g.fillText(text, x, y);
}

