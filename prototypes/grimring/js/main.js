// Grimring — a small arena for the Model Library's Meshy fighters: pick one, face one or two at a time.
//   Title → Gauntlet (pick a fighter → eight rounds with a boon between) · Duel (you vs one or two of your choice)
//   · Watch (two or three bots fight while you look).
import { createFight, step, STEP, alive, specialCd } from './sim/fight.js';
import { stopPageZoom } from '../../../shared/no-zoom.js';
stopPageZoom();   // iPhone ignores user-scalable=no: no pinch / double-tap page zoom (shared/no-zoom.js)
import { createRun, foesFor, boonChoices, boonText, applyBoon, endRound } from './sim/gauntlet.js';
import { createStage } from './render/stage.js';
import { createActor, loadModel, cardUrl } from './render/actor.js';
import { createInput, KEYS, KEY_LABEL, PAD_LABEL } from './input.js';
import { initAudio, setVolume, setMuted, play, soundEvents } from './audio.js';
import { $, el, btn, toast, banner, hideBanner, sheet, topSheet, closeTopSheet } from './ui/dom.js';
import { statRows, specialText, clock } from './ui/text.js';
import { fmt } from '../../../shared/format.js';
import { ask } from '../../../shared/dialog.js';

const BUILD = '2026-11-15a';
const data = await (await fetch(new URL('../data/fighters.json', import.meta.url))).json();
const catalog = (await (await fetch(new URL('../../../model-library/data/models.json', import.meta.url))).json()).models;
const CAT = Object.fromEntries(catalog.map(m => [m.id, m]));
const IDS = data.fighters.filter(f => CAT[f.id]?.status === 'ready').map(f => f.id);
const DEF = Object.fromEntries(data.fighters.map(f => [f.id, f]));
const HEIGHTS = Object.fromEntries(catalog.map(m => [m.id, m.height]));
const nameOf = id => CAT[id]?.name || 'Fighter';

// ------------------------------------------------------------------ settings + records (this device)
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
};
const settings = Object.assign({ volume: 0.8, muted: false, shake: true, numbers: true, quality: 1 }, store.get('grimring.settings', {}));
const saveSettings = () => store.set('grimring.settings', settings);
const records = store.get('grimring.records', {});         // model → { best, diff, wins, duels }
const saveRecords = () => store.set('grimring.records', records);
const DIFF_ORDER = ['easy', 'normal', 'hard'];

// ------------------------------------------------------------------ app
const view = $('#view');
const stage = createStage(view);
stage.setQuality(settings.quality);
const app = {
  mode: 'title', paused: false, F: null, run: null, duel: null, actors: new Map(), cast: [], acc: 0, last: performance.now(),
  phase: 'idle', phaseT: 0, introT: 0, overT: 0, plates: new Map(), lastPick: store.get('grimring.lastPick', { me: 'bandit', foe: 'skeleton_warrior', foe2: null, diff: 'normal' }),
};
window.app = app;
setVolume(settings.volume); setMuted(settings.muted);

const input = createInput({
  onMenu: () => { if (closeTopSheet()) return; if (document.querySelector('.gdlg-modal, .wn-modal, .cr-modal')) return; if (app.mode === 'fight') openMenu(); else if (app.mode === 'pick') showTitle(); },
  onDevice: d => setDevice(d),
  enabled: () => app.mode === 'fight' && !app.paused && !topSheet(),
});
function setDevice(d) {
  document.body.classList.toggle('touch', d === 'touch');
  document.body.classList.toggle('pad', d === 'pad');
  $('#stick').classList.toggle('hidden', d !== 'touch');
  for (const k of document.querySelectorAll('kbd[data-key]')) k.textContent = d === 'pad' ? PAD_LABEL[k.dataset.key] : KEY_LABEL[k.dataset.key];
}
setDevice(input.device);
input.bindTouch($('#stick'), $('#stick-knob'), { attack: $('#act-attack'), special: $('#act-special'), dodge: $('#act-dodge') });
addEventListener('pointerdown', () => initAudio(), { capture: true });
addEventListener('keydown', () => initAudio(), { capture: true });

function showScreen(id) {
  for (const s of ['title', 'pick', 'boons', 'result']) $('#' + s).classList.toggle('hidden', s !== id);
  $('#hud').classList.toggle('hidden', id !== 'hud');
  if (id !== 'hud') { $('#labels').replaceChildren(); app.plates.clear(); }
}
let loadingN = 0;
async function withLoading(text, fn) {
  loadingN++; $('#loading-text').textContent = text; $('#loading').classList.remove('hidden');
  try { return await fn(); } finally { if (--loadingN === 0) $('#loading').classList.add('hidden'); }
}

// ------------------------------------------------------------------ the cast on the sand (title + pick screens)
const CAST_Z = -4;                      // the title/pick fighters stand north of the middle
const castKey = list => list.map(c => c.model).join(',');
let castWant = '';
async function showCast(list) {
  const key = castKey(list); castWant = key;
  const actors = await withLoading('Bringing the fighters out…', () => Promise.all(list.map(c => createActor(c.model, { height: HEIGHTS[c.model], weapon: DEF[c.model].weapon }))));
  if (castWant !== key) { actors.forEach(a => a.dispose()); return; }
  clearCast();
  actors.forEach((a, i) => {
    const c = list[i]; a.group.position.set(c.x, 0, c.z + CAST_Z); a.group.rotation.y = c.face; stage.scene.add(a.group);
    a.play(c.clip || (a.actions.ready ? 'ready' : 'idle'));
    a.showT = 3 + i * 2.2; a.spec = c;
  });
  app.cast = actors;
}
function clearCast() { for (const a of app.cast) a.dispose(); app.cast = []; }
function clearFightActors() { for (const a of app.actors.values()) a.dispose(); app.actors.clear(); stage.fx.clear(); }

// ------------------------------------------------------------------ title
let titlePair = [];
function showTitle() {
  app.mode = 'title'; app.F = null; app.run = null; app.duel = null; app.paused = false;
  clearFightActors(); hideBanner();
  showScreen('title');
  const b = $('#title-buttons'); b.replaceChildren(
    btn(el('span', {}, 'Gauntlet', el('span', { class: 'sub' }, 'Eight rounds, one or two foes at a time')), () => openPick('gauntlet'), 'primary'),
    btn(el('span', {}, 'Duel', el('span', { class: 'sub' }, 'You against the fighters you choose')), () => openPick('duel')),
    btn(el('span', {}, 'Watch a fight', el('span', { class: 'sub' }, 'Pick two or three and let them fight')), () => openPick('watch')),
  );
  const x = $('#title-extra'); x.replaceChildren(btn('Controls', controlsSheet, 'small'), btn('Settings', settingsSheet, 'small'), btn('Report a bug', reportSheet, 'small'));
  if (app.news) x.append(app.news.button({ label: "What's new", className: 'small' }));
  if (app.credits) x.append(app.credits.button({ label: 'Credits', className: 'small' }));
  if (app.account) x.append(app.account);
  // two fighters on the sand, swapped now and then
  const pool = IDS.slice(); const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; const c = pool[Math.floor(Math.random() * pool.length)];
  titlePair = [a, c];
  showCast([{ model: a, x: -1.15, z: 0, face: 0.45 }, { model: c, x: 1.15, z: 0, face: -0.45 }]);
  app.titleSwap = 9;
  requestAnimationFrame(frameTitle);
}
/** The open part of the title screen: right of the card on a wide screen, above it on a phone. */
function frameTitle() {
  if (app.mode !== 'title') return;
  const card = $('.title-card').getBoundingClientRect(), W = innerWidth, H = innerHeight;
  const r = W > H * 1.1 ? { left: card.right, top: 0, width: W - card.right, height: H } : { left: 0, top: 50, width: W, height: Math.max(120, card.top - 50) };
  const tall = Math.max(...titlePair.map(id => HEIGHTS[id] || 1.75));
  stage.cam.want = { ...stage.frame(r, 2.6, tall, 0.28), z: CAST_Z };
}
addEventListener('resize', () => { if (app.mode === 'title') frameTitle(); });
function titleTick(dt) {
  app.titleSwap -= dt;
  if (app.titleSwap > 0 || loadingN) return;
  app.titleSwap = 9;
  const keep = Math.random() < 0.5 ? 0 : 1, pool = IDS.filter(id => !titlePair.includes(id));
  titlePair[1 - keep] = pool[Math.floor(Math.random() * pool.length)];
  showCast([{ model: titlePair[0], x: -1.15, z: 0, face: 0.45 }, { model: titlePair[1], x: 1.15, z: 0, face: -0.45 }]);
}
function castTick(dt) {
  for (const a of app.cast) {
    a.showT -= dt;
    if (a.showT <= 0) {           // now and then each one shows off its swing or its special
      const def = DEF[a.id]; const special = Math.random() < 0.4;
      a.swing(special ? def.special.clip : 'attack', special ? def.special.time * 1.2 : def.swing * 1.3);
      a.showT = 4 + Math.random() * 3; a.backT = (special ? def.special.time * 1.2 : def.swing * 1.3) + 0.05;
    }
    if (a.backT > 0 && (a.backT -= dt) <= 0) a.play(a.actions.ready ? 'ready' : 'idle');
    a.update(dt);
  }
}

// ------------------------------------------------------------------ pick (gauntlet / duel / watch)
const pick = { mode: 'gauntlet', slots: [], active: 0, diff: 'normal' };
function openPick(mode) {
  app.mode = 'pick'; pick.mode = mode;
  const L = app.lastPick;
  pick.slots = mode === 'gauntlet' ? [L.me] : [L.me, L.foe || 'skeleton_warrior', L.foe2 || null];
  pick.active = 0; pick.diff = L.diff || 'normal';
  $('#pick-title').textContent = mode === 'gauntlet' ? 'Choose your fighter' : mode === 'duel' ? 'Set up a duel' : 'Set up a fight to watch';
  showScreen('pick');
  drawPick();
}
const SLOT_NAMES = { duel: ['You', 'Foe', 'Second foe'], watch: ['Left side', 'Right side', 'Right side, second'] };
function drawPick() {
  const slots = $('#slots'); slots.replaceChildren();
  if (pick.mode !== 'gauntlet') {
    pick.slots.forEach((id, i) => slots.append(btn(el('span', {}, el('small', {}, SLOT_NAMES[pick.mode][i]), el('br'), id ? nameOf(id) : 'None'), () => { pick.active = i; drawPick(); }, 'slot' + (pick.active === i ? ' on' : ''))));
  }
  const cur = pick.slots[pick.active];
  const roster = $('#roster'); roster.replaceChildren();
  for (const id of IDS) {
    const rec = records[id];
    const c = btn([el('img', { src: cardUrl(id), alt: '' }), el('span', { class: 'nm' }, nameOf(id)), pick.mode === 'gauntlet' && rec?.won ? el('span', { class: 'badge' }, 'Champion') : null], () => { pick.slots[pick.active] = id; drawPick(); }, 'card' + (cur === id ? ' on' : ''));
    c.dataset.model = id; roster.append(c);
  }
  if (pick.active === 2) roster.append(btn('None', () => { pick.slots[2] = null; drawPick(); }, 'card none' + (cur == null ? ' on' : '')));
  drawDetail(cur);
  const foot = $('#pick-foot'); foot.replaceChildren();
  if (pick.mode !== 'watch') {
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'How hard' });
    for (const d of DIFF_ORDER) seg.append(btn(data.difficulty[d].name, () => { pick.diff = d; drawPick(); }, pick.diff === d ? 'on' : ''));
    foot.append(el('div', {}, el('div', { class: 'seg-label' }, 'How hard the foes hit'), seg));
  }
  const go = pick.mode === 'gauntlet' ? 'Enter the ring' : pick.mode === 'duel' ? 'Fight' : 'Watch them fight';
  foot.append(btn(go, startFromPick, 'primary', { id: 'pick-go' }));
  // the fighters on the sand: one in the middle, or the sides facing each other
  const list = pick.mode === 'gauntlet'
    ? [{ model: pick.slots[0], x: 0, z: 0, face: 0 }]
    : pick.slots.map((id, i) => id && ({ model: id, x: i === 0 ? -1.3 : i === 1 ? 1.3 : 2.9, z: i === 2 ? -0.9 : 0, face: i === 0 ? 0.7 : -0.7 })).filter(Boolean);
  if (castKey(list) !== castWant) showCast(list);
  pick.list = list;
  focusStage();
}
function focusStage() {
  const r = $('#pick-stage').getBoundingClientRect(), list = pick.list || [];
  if (r.width < 10 || r.height < 10 || !list.length) return;
  const top = r.top + Math.min(60, r.height * 0.15);                 // under the screen's heading
  const xs = list.map(c => c.x), span = Math.max(...xs) - Math.min(...xs);
  const tall = Math.max(...list.map(c => HEIGHTS[c.model] || 1.75));
  stage.cam.want = { ...stage.frame({ left: r.left, top, width: r.width, height: r.bottom - top }, span + (list.length > 1 ? 1 : 0.4), tall, 0.24), x: (Math.max(...xs) + Math.min(...xs)) / 2, z: CAST_Z };
}
addEventListener('resize', () => { if (app.mode === 'pick') focusStage(); });
function drawDetail(id) {
  const d = $('#detail'); d.replaceChildren();
  if (!id) { d.append(el('h3', {}, 'No second foe'), el('p', { class: 'sub' }, 'A one-on-one fight.')); return; }
  const def = DEF[id], rec = records[id];
  const dl = el('dl', { class: 'stats' });
  for (const [k, v] of statRows(def)) dl.append(el('dt', {}, k), el('dd', {}, v));
  d.append(el('h3', {}, nameOf(id)), el('p', { class: 'sub' }, `${def.title} — ${def.blurb}`), dl,
    el('div', { class: 'special-box' }, el('b', {}, def.special.name), el('p', {}, specialText(def))));
  if (pick.mode === 'gauntlet') d.append(el('p', { class: 'best' }, rec?.best ? `Best: ${rec.won ? 'won the Gauntlet' : `${rec.best} of ${data.gauntlet.rounds.length} rounds`} (${data.difficulty[rec.diff]?.name || 'Normal'})` : 'Not tried in the Gauntlet yet.'));
}
function startFromPick() {
  const L = app.lastPick;
  if (pick.mode === 'gauntlet') { L.me = pick.slots[0]; L.diff = pick.diff; }
  else { L.me = pick.slots[0]; L.foe = pick.slots[1]; L.foe2 = pick.slots[2]; if (pick.mode === 'duel') L.diff = pick.diff; }
  store.set('grimring.lastPick', L);
  if (pick.mode === 'gauntlet') startGauntlet(pick.slots[0], pick.diff);
  else startDuel(pick.slots.slice(), pick.mode === 'watch', pick.mode === 'watch' ? 'normal' : pick.diff);
}
$('#pick-back').addEventListener('click', () => showTitle());

// ------------------------------------------------------------------ fights
function startGauntlet(model, diff) {
  app.run = createRun({ data, champion: model, difficulty: diff, seed: (Math.random() * 1e9) | 0 });
  app.duel = null;
  nextRound();
}
function nextRound() {
  const run = app.run;
  const foes = foesFor(data, run);
  const sides = [{ model: run.champion, team: 0, ctrl: 'player', mods: run.mods, hp: run.hp }, ...foes.map(f => ({ model: f.model, team: 1, tough: f.tough }))];
  beginFight(sides, run.difficulty, `Round ${run.round + 1} of ${run.rounds}`, foes.map(f => nameOf(f.model)).join(' and '));
}
function startDuel(slots, watch, diff) {
  app.run = null; app.duel = { slots, watch, diff };
  const sides = [{ model: slots[0], team: 0, ctrl: watch ? 'bot' : 'player' }, { model: slots[1], team: 1 }];
  if (slots[2]) sides.push({ model: slots[2], team: 1 });
  beginFight(sides, diff, watch ? 'Watching' : 'Duel', sides.slice(1).map(s => nameOf(s.model)).join(' and '));
}
async function beginFight(sides, diff, label, foeNames) {
  app.mode = 'fight'; app.paused = false;
  clearCast(); clearFightActors();
  showScreen('hud');
  stage.focus = null;
  document.body.classList.toggle('watching', !!app.duel?.watch);
  $('#watch-note').classList.toggle('hidden', !app.duel?.watch);
  $('#watch-note').textContent = 'Watching — open the menu to leave';
  const F = createFight({ data, sides, seed: (Math.random() * 1e9) | 0, difficulty: diff, heights: HEIGHTS });
  app.F = F;
  $('#round-label').textContent = label;
  const me = F.fighters[0];
  $('#me-name').textContent = app.duel?.watch ? nameOf(me.model) : `${nameOf(me.model)} (you)`;
  $('#act-special-name').textContent = me.def.special.name;
  $('#act-special').classList.toggle('long', me.def.special.name.length > 11);      // long names wrap smaller to fit the button
  const actors = await withLoading('Bringing the fighters out…', () => Promise.all(F.fighters.map(f => createActor(f.model, { height: HEIGHTS[f.model], weapon: f.def.weapon }))));
  if (app.F !== F) { actors.forEach(a => a.dispose()); return; }
  F.fighters.forEach((f, i) => { const a = actors[i]; a.group.position.set(f.x, 0, f.z); a.group.rotation.y = f.face; stage.scene.add(a.group); app.actors.set(f.id, a); });
  buildPlates();
  const c = centre(F); stage.cam.x = c.x; stage.cam.z = c.z;
  app.phase = 'intro'; app.introT = 2.4; app.acc = 0; input.clear();
  banner(label, `${app.duel?.watch ? `${nameOf(me.model)} against` : 'Against'} ${foeNames}`, 1700);
  stage.arena.cheer(0.6); play('crowd.cheer');
}
function centre(F) {
  const me = F.fighters[0], L = F.fighters.filter(alive);
  const foes = L.filter(f => f.team !== 0);
  if (app.duel?.watch || !alive(me)) { const n = L.length || 1; return { x: L.reduce((s, f) => s + f.x, 0) / n, z: L.reduce((s, f) => s + f.z, 0) / n }; }
  if (!foes.length) return { x: me.x, z: me.z };
  const fx = foes.reduce((s, f) => s + f.x, 0) / foes.length, fz = foes.reduce((s, f) => s + f.z, 0) / foes.length;
  return { x: me.x * 0.6 + fx * 0.4, z: me.z * 0.6 + fz * 0.4 };
}

function fightTick(dt) {
  const F = app.F; if (!F) return;
  if (app.paused || topSheet()) { renderFighters(0, 1); return; }
  if (app.phase === 'intro') {
    const was = app.introT; app.introT -= dt;
    if (was > 0.7 && app.introT <= 0.7) banner('Fight!', '', 800);
    if (app.introT <= 0) { app.phase = 'fight'; input.clear(); }
  }
  let inp = { mx: 0, mz: 0 };
  if (app.phase !== 'intro') {
    const raw = input.read();
    inp = raw;
    app.acc += dt;
    let first = true;
    while (app.acc >= STEP) {
      step(F, STEP, first ? inp : { mx: inp.mx, mz: inp.mz, attack: inp.attack });
      first = false; app.acc -= STEP;
      handleEvents(F);
    }
  } else input.read();
  renderFighters(dt, app.acc / STEP);
  // camera: frame you and your foes; pull back when they spread out
  const c = centre(F), L = F.fighters.filter(alive);
  let spread = 0; for (const f of L) spread = Math.max(spread, Math.hypot(f.x - c.x, f.z - c.z));
  stage.cam.want = { x: c.x * 0.85, z: c.z * 0.85, dist: Math.min(15, 8.5 + spread * 0.6), pitch: 0.9, y: 0.9 };
  if (F.over) {
    if (app.phase !== 'over') { app.phase = 'over'; app.overT = 2.4; onFightOver(F); }
    else if ((app.overT -= dt) <= 0) { app.phase = 'done'; afterFight(F); }
  }
  updateHud(F);
}
function renderFighters(dt, alpha) {
  const F = app.F;
  for (const f of F.fighters) {
    const a = app.actors.get(f.id); if (!a) continue;
    const x = f.px + (f.x - f.px) * alpha, z = f.pz + (f.z - f.pz) * alpha;
    a.group.position.set(x, 0, z);
    // turn smoothly toward the sim's facing
    let d = f.face - a.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    a.group.rotation.y += d * Math.min(1, dt * 18);
    f.foeNear = F.fighters.some(o => o.team !== f.team && alive(o) && Math.hypot(o.x - f.x, o.z - f.z) < 7);
    if (app.phase !== 'intro' || f.state === 'dead') a.follow(f, F.t);
    else if (a.clip !== 'ready' && a.clip !== 'idle') a.play(a.actions.ready ? 'ready' : 'idle');
    a.update(dt);
  }
  for (const s of F.shots) stage.fx.moveShot(s, shotY(s));
  for (const z of F.zones) stage.fx.warnFill('z' + z.by, 1 - z.t / z.total);
  placePlates();
}
const shotY = s => { const f = app.F.fighters.find(o => o.id === s.from); return (f ? f.height : 1.7) * 0.62; };

function handleEvents(F) {
  const ev = F.events; if (!ev.length) return;
  const me = F.fighters[0];
  soundEvents(F, ev, x => Math.max(-0.8, Math.min(0.8, (x - stage.cam.x) / 10)));
  for (const e of ev) {
    const f = e.id != null ? F.fighters.find(o => o.id === e.id) : null, a = f && app.actors.get(f.id);
    switch (e.type) {
      case 'swing': a?.swing(e.clip, e.dur); break;
      case 'shot': { const s = F.shots.find(q => q.id === e.shot); if (s) stage.fx.shot(s, shotY(s)); break; }
      case 'shot-end': stage.fx.endShot(e.shot); if (e.hit) stage.fx.sparks(e.x, 1.1, e.z, e.kind === 'archer' ? '#ffe0a0' : '#ffffff', 5); break;
      case 'warn': stage.fx.warn('z' + e.id, e.x, e.z, e.r, f?.def.shot?.color); break;
      case 'blast': stage.fx.endWarn('z' + e.id); stage.fx.ring(e.x, e.z, e.r * 1.1, f?.def.shot?.color || '#ff6040', 0.6); stage.fx.sparks(e.x, 0.4, e.z, f?.def.shot?.color || '#ff6040', 14); shake(0.25); break;
      case 'shout': stage.fx.ring(e.x, e.z, e.r, e.kind === 'roar' ? '#ffc060' : '#9cff80', 0.7, 0.3); stage.fx.ring(e.x, e.z, e.r * 0.6, e.kind === 'roar' ? '#ffc060' : '#9cff80', 0.5, 0.6); shake(0.3); break;
      case 'hit': {
        const to = F.fighters.find(o => o.id === e.to), ta = to && app.actors.get(to.id);
        ta?.hitFlash(e.blocked ? 0x8090a0 : 0xff3020);
        if (to) { stage.fx.sparks(to.x, to.height * 0.6, to.z, e.blocked ? '#d0d8e0' : '#ff9060', e.special ? 10 : 6); number(to, e.blocked ? `${e.dmg} blocked` : String(e.dmg), to.team === 0 && !app.duel?.watch ? 'me' : e.special ? 'big' : e.blocked ? 'blocked' : ''); }
        if (to === me && !app.duel?.watch) shake(e.special ? 0.35 : 0.15);
        break;
      }
      case 'miss': if (e.why === 'dodged') { const to = F.fighters.find(o => o.id === e.to); if (to) number(to, 'Dodged', 'miss'); } break;
      case 'dodge': if (f) stage.fx.ring(f.x, f.z, 0.9, '#d8c8a0', 0.35); break;
      case 'status': { const p = app.plates.get(e.id); if (p) { p.st.textContent = e.what === 'stun' ? 'Stunned' : 'Slowed'; p.stT = e.for; } break; }
      case 'death': stage.arena.cheer(1); play('crowd.cheer'); stage.fx.endWarn('z' + e.id); break;
    }
  }
  ev.length = 0;
}
function shake(k) { if (settings.shake) stage.cam.shake = Math.max(stage.cam.shake, k); }

function onFightOver(F) {
  const won = F.winner === 0;
  stage.fx.clearShots();
  if (app.duel?.watch) banner(F.winner === 0 ? `${nameOf(F.fighters[0].model)} wins` : `${F.fighters.filter(f => f.team === 1).map(f => nameOf(f.model)).join(' and ')} win${F.fighters.filter(f => f.team === 1).length > 1 ? '' : 's'}`, '', 2200);
  else banner(won ? 'Victory' : 'Defeated', '', 2200);
  play(won ? 'quest.complete' : 'death.humanoid');
}
function afterFight(F) {
  const me = F.fighters[0];
  if (app.run) {
    const healed = endRound(data, app.run, me, F);
    if (app.run.done) return showResult();
    return showBoons(healed);
  }
  const d = app.duel;
  if (!d.watch) { const r = records[d.slots[0]] ||= {}; r.duels = (r.duels || 0) + 1; if (F.winner === 0) r.duelWins = (r.duelWins || 0) + 1; saveRecords(); }
  showResult();
}

// ------------------------------------------------------------------ boons between rounds
function showBoons(healed) {
  app.mode = 'boons'; const run = app.run, def = DEF[run.champion];
  clearFightActors(); app.F = null;
  showScreen('boons');
  const max = Math.round(def.hp * run.mods.hpMul);
  const card = $('#boons-card'); card.replaceChildren(
    el('h2', {}, `Round ${run.round} won`),
    el('p', { class: 'lead' }, `Healed ${fmt(healed, { decimals: 0 })} — health now ${fmt(Math.round(run.hp), { decimals: 0 })} / ${fmt(max, { decimals: 0 })}. Choose a boon for the rest of the Gauntlet.`),
  );
  const grid = el('div', { class: 'boon-grid' });
  for (const b of boonChoices(data, run)) {
    const have = run.boons.filter(id => id === b.id).length;
    grid.append(btn([el('b', {}, b.name), el('span', {}, boonText(data, b)), have ? el('small', {}, `You have it ×${have}; it stacks`) : null], () => {
      applyBoon(run, b, def); play('levelup'); nextRound();
    }, 'boon'));
  }
  card.append(grid);
  if (run.boons.length) card.append(el('div', { class: 'boon-list' }, ...run.boons.map(id => el('span', {}, data.boons.find(b => b.id === id).name))));
  stage.focus = null; stage.cam.want = { x: 0, z: 0, dist: 14, pitch: 0.6 };
}

// ------------------------------------------------------------------ results
function showResult() {
  app.mode = 'result'; const card = $('#result-card'); card.replaceChildren();
  const F = app.F;
  showScreen('result');
  if (app.run) {
    const run = app.run, cleared = run.won ? run.rounds : run.round;
    const r = records[run.champion] ||= {};
    const better = cleared > (r.best || 0) || (cleared === (r.best || 0) && DIFF_ORDER.indexOf(run.difficulty) > DIFF_ORDER.indexOf(r.diff || 'easy'));
    if (better) { r.best = cleared; r.diff = run.difficulty; }
    if (run.won) r.won = true;
    saveRecords();
    card.append(el('div', { class: 'res-head' }, el('h2', { class: run.won ? 'win' : 'lose' }, run.won ? 'The ring is yours' : `Fallen in round ${run.round + 1}`),
      el('p', { class: 'lead' }, `${nameOf(run.champion)} · ${data.difficulty[run.difficulty].name}${better && cleared ? ' · a new best' : ''}`)));
    card.append(el('div', { class: 'kv' },
      el('span', {}, 'Rounds won'), el('span', {}, `${cleared} of ${run.rounds}`),
      el('span', {}, 'Damage dealt'), el('span', {}, fmt(run.totals.dealt, { decimals: 0 })),
      el('span', {}, 'Damage taken'), el('span', {}, fmt(run.totals.taken, { decimals: 0 })),
      el('span', {}, 'Time in the ring'), el('span', {}, clock(run.totals.time)),
      el('span', {}, 'Best with this fighter'), el('span', {}, r.won ? 'Won the Gauntlet' : `${r.best || 0} of ${run.rounds} rounds`)));
    if (run.boons.length) card.append(el('div', { class: 'boon-list' }, ...run.boons.map(id => el('span', {}, data.boons.find(b => b.id === id).name))));
    card.append(el('div', { class: 'btn-row' }, btn('Try again', () => startGauntlet(run.champion, run.difficulty), 'primary'), btn('Choose another fighter', () => openPick('gauntlet')), btn('Title', showTitle)));
  } else {
    const d = app.duel, me = F.fighters[0], won = F.winner === 0;
    const head = d.watch ? (won ? `${nameOf(me.model)} wins` : `${F.fighters.filter(f => f.team === 1).map(f => nameOf(f.model)).join(' and ')} win${F.fighters.filter(f => f.team === 1).length > 1 ? '' : 's'}`) : won ? 'You win' : 'You lose';
    card.append(el('div', { class: 'res-head' }, el('h2', { class: won || d.watch ? 'win' : 'lose' }, head), el('p', { class: 'lead' }, `Fight time ${clock(F.t)}`)));
    const kv = el('div', { class: 'kv' });
    for (const f of F.fighters) kv.append(el('span', {}, `${nameOf(f.model)}${f.team === 0 && !d.watch ? ' (you)' : ''}`), el('span', {}, `${fmt(f.stats.dealt, { decimals: 0 })} damage · ${alive(f) ? `${fmt(Math.round(f.hp), { decimals: 0 })} health left` : 'down'}`));
    card.append(kv);
    card.append(el('div', { class: 'btn-row' }, btn('Rematch', () => startDuel(d.slots, d.watch, d.diff), 'primary'), btn('Change fighters', () => openPick(d.watch ? 'watch' : 'duel')), btn('Title', showTitle)));
  }
  clearFightActors(); app.F = null;
  stage.focus = null; stage.cam.want = { x: 0, z: 0, dist: 14, pitch: 0.6 };
}

// ------------------------------------------------------------------ HUD: health bars over heads, numbers, buttons
function buildPlates() {
  const box = $('#labels'); box.replaceChildren(); app.plates.clear();
  for (const f of app.F.fighters) {
    const you = f.team === 0 && f.ctrl === 'player';
    const fill = el('i'), st = el('div', { class: 'st' });
    const node = el('div', { class: 'plate' + (you ? ' you' : '') }, el('div', { class: 'nm' }, you ? 'You' : nameOf(f.model)), el('div', { class: 'bar' }, fill), st);
    box.append(node); app.plates.set(f.id, { node, fill, st, stT: 0 });
  }
}
function placePlates() {
  const F = app.F;
  for (const f of F.fighters) {
    const p = app.plates.get(f.id); if (!p) continue;
    const a = app.actors.get(f.id); const pos = a ? a.group.position : f;
    const s = stage.toScreen(pos.x, f.height + 0.35, pos.z);
    p.node.classList.toggle('dead', !alive(f));
    if (!s) { p.node.style.display = 'none'; continue; }
    p.node.style.display = ''; p.node.style.left = `${s.x}px`; p.node.style.top = `${Math.max(s.y, 96)}px`;     // never under the top bar
    p.fill.style.width = `${(100 * f.hp) / f.max}%`;
    if (f.blockT > 0) p.st.textContent = 'Shield up';
    else if (f.stunT > 0) p.st.textContent = 'Stunned';
    else if (f.slowT > 0) p.st.textContent = 'Slowed';
    else p.st.textContent = '';
  }
}
function number(f, text, cls) {
  if (!settings.numbers && cls !== 'miss') return;
  const a = app.actors.get(f.id); const pos = a ? a.group.position : f;
  const s = stage.toScreen(pos.x + (Math.random() - 0.5) * 0.5, f.height * 0.8, pos.z); if (!s) return;
  const n = el('div', { class: 'num ' + (cls || '') }, text); n.style.left = `${s.x}px`; n.style.top = `${s.y}px`;
  $('#labels').append(n); setTimeout(() => n.remove(), 900);
}
function updateHud(F) {
  const me = F.fighters[0];
  $('#me-hp').style.width = `${(100 * me.hp) / me.max}%`;
  $('#me-hp-text').textContent = `${fmt(Math.ceil(me.hp), { decimals: 0 })} / ${fmt(me.max, { decimals: 0 })}`;
  const tags = []; if (me.blockT > 0) tags.push(['block', 'Shield up']); if (me.stunT > 0) tags.push(['stun', 'Stunned']); if (me.slowT > 0) tags.push(['slow', 'Slowed']);
  const sig = tags.map(t => t[1]).join();
  if ($('#me-tags').dataset.sig !== sig) { $('#me-tags').dataset.sig = sig; $('#me-tags').replaceChildren(...tags.map(([c, t]) => el('span', { class: 'tag-status ' + c }, t))); }
  const cd = (id, left, total) => { const b = $(id); b.querySelector('.cd').style.height = `${total > 0 ? Math.min(100, (100 * left) / total) : 0}%`; return b; };
  cd('#act-attack', me.cd.atk, me.def.swing);
  cd('#act-dodge', me.cd.dodge, 1);
  const sp = cd('#act-special', me.cd.sp, specialCd(me));
  sp.querySelector('.cd-num').textContent = me.cd.sp > 0 ? fmt(Math.ceil(me.cd.sp), { decimals: 0 }) : '';
  sp.classList.toggle('ready-glow', me.cd.sp <= 0 && alive(me));
}

// ------------------------------------------------------------------ menu + sheets
$('#btn-menu').addEventListener('click', () => openMenu());
function openMenu() {
  if (topSheet()) return;
  app.paused = true; input.clear();
  sheet('Paused', (m, close) => {
    const add = (label, fn, cls) => m.append(btn(label, () => { close(); fn(); }, cls));
    add('Back to the fight', () => {}, 'primary');
    add('Controls', controlsSheet);
    add('Settings', settingsSheet);
    if (app.news) add("What's new", () => app.news.open());
    if (app.credits) add('Credits', () => app.credits.open());
    add('Report a bug', reportSheet);
    add(app.run ? 'Give up this Gauntlet' : 'Leave the fight', async () => {
      if (app.run && !(await ask({ title: 'Give up?', text: `This Gauntlet ends at round ${app.run.round + 1}. Your best is kept.`, ok: 'Give up', danger: true }))) return;
      if (app.run && app.F) { app.run.done = true; app.run.won = false; app.run.totals.dealt += app.F.fighters[0].stats.dealt; app.run.totals.taken += app.F.fighters[0].stats.taken; app.run.totals.time += app.F.t; showResult(); }
      else showTitle();
    }, 'danger');
  }, { onClose: () => { app.paused = false; app.last = performance.now(); } });
}
function controlsSheet() {
  sheet('Controls', (m, close) => {
    const keys = (title, rows) => [el('div', { class: 'keys-h' }, title), el('dl', { class: 'keys' }, ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]))];
    const nice = c => c.replace(/^Key/, '').replace(/^Arrow/, 'Arrow ').replace(/Left$|Right$/, s => (c.startsWith('Shift') ? ` (${s.toLowerCase()})` : s)).replace('ShiftLeft', 'Shift');
    m.append(
      ...keys('Keyboard', [['W A S D / arrows', 'Move (W is up the screen)'], [KEYS.attack.map(nice).join(' or '), 'Attack (hold to keep swinging)'], [KEYS.special.map(nice).join(' or '), 'Special'], ['Shift or L', 'Dodge (you pass through blows and shots)'], ['Esc', 'Menu']]),
      ...keys('Controller', [['Left stick / d-pad', 'Move'], ['A', 'Attack'], ['X or Y', 'Special'], ['B', 'Dodge'], ['Start', 'Menu']]),
      ...keys('Touch', [['Left circle', 'Move'], ['Attack', 'Hold to keep swinging'], ['Special, Dodge', 'Tap']]),
      btn('Done', close, 'primary'));
  });
}
function settingsSheet() {
  sheet('Settings', (m, close) => {
    const s = settings;
    const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume, oninput: e => { s.volume = +e.target.value; setVolume(s.volume); saveSettings(); } });
    const chk = (label, key, fn) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: s[key] || null, onchange: e => { s[key] = e.target.checked; fn?.(s[key]); saveSettings(); } }), label);
    const seg = el('div', { class: 'seg' });
    const drawSeg = () => { seg.replaceChildren(...[[1, 'Full (shadows)'], [0.6, 'Light (for phones)']].map(([q, label]) => btn(label, () => { s.quality = q; stage.setQuality(q); saveSettings(); drawSeg(); }, s.quality === q ? 'on' : ''))); };
    drawSeg();
    m.append(el('label', { class: 'col' }, 'Volume', vol), chk('Mute everything', 'muted', setMuted), chk('Screen shake', 'shake'), chk('Damage numbers', 'numbers'), el('div', {}, el('div', { class: 'seg-label' }, 'Graphics'), seg), btn('Done', close, 'primary'));
  });
}
function reportSheet() {
  sheet('Report a bug', (m, close) => {
    const text = el('textarea', { rows: 5, placeholder: 'What went wrong, or what would you like? Plain words are perfect.' });
    m.append(text, el('p', { class: 'hint' }, 'Your note, a picture of the screen and a few game details are sent to the developer.'),
      el('div', { class: 'row' }, btn('Cancel', close), el('div', { class: 'grow' }), btn('Send', async () => {
        if (!text.value.trim()) { toast('Write a few words first.', 'bad'); return; }
        let shot = null; try { stage.render(0, performance.now() / 1000); shot = view.toDataURL('image/jpeg', 0.5); if (shot.length > 400000) shot = null; } catch { /* */ }
        const rep = { at: new Date().toISOString(), text: text.value, state: window.gameEye.state(), ua: navigator.userAgent, size: [innerWidth, innerHeight], build: BUILD, shot };
        close(); sendReport(rep);
      }, 'primary')));
    setTimeout(() => text.focus(), 30);
  });
}
async function sendReport(rep) {
  const list = store.get('grimring.reports', []); list.push(rep); const out = [];
  for (const r of list) {
    let ok = false;
    for (const url of ['/api/report/grimring', '/api/inbox/grimring-report']) { try { const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) }); if (res.ok) { ok = true; break; } } catch { /* offline */ } }
    if (!ok) out.push(r);
  }
  store.set('grimring.reports', out.slice(-10));
  toast(out.length ? 'Saved — it will be sent when the game can reach the server.' : 'Thank you — report sent.', out.length ? '' : 'good');
}

// ------------------------------------------------------------------ the loop
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - app.last) / 1000); app.last = now;
  if (app.mode === 'fight') fightTick(dt);
  else { castTick(dt); if (app.mode === 'title') titleTick(dt); }
  stage.render(dt, now / 1000);
}

// ------------------------------------------------------------------ controller in menus (padnav), What's new, credits, account
import('./ui/padnav.js').then(({ createPadNav }) => {
  app.padnav = createPadNav({
    busy: () => app.mode === 'fight' && !topSheet() && !document.querySelector('.gdlg-modal, .wn-modal, .cr-modal'),
    back: () => { if (closeTopSheet()) return true; const shared = document.querySelector('.wn-modal [data-close], .cr-modal [data-close]'); if (shared) { shared.click(); return true; } if (app.mode === 'pick') { showTitle(); return true; } return false; },
  });
}).catch(() => {});
const extras = Promise.allSettled([
  import('../../../shared/whats-new.js').then(({ createWhatsNew }) => { app.news = createWhatsNew({ url: new URL('../data/changelog.json', import.meta.url), key: 'grimring', title: "What's new" }); }),
  import('../../../shared/credits.js').then(({ createCredits }) => { app.credits = createCredits({ game: 'grimring', made: 'Grimring — by Radley Sustaire, built with Claude. Fighters modelled with Meshy from reference sheets drawn by Codex.' }); }),
  import('../../../shared/rgs-signin.js').then(({ accountButton }) => { const b = accountButton({ game: 'grimring', gameName: 'Grimring' }); if (b) { b.classList.add('small'); app.account = b; } }),
]);
import('../../../shared/rgs-cloudsave.js').then(({ cloudSave }) => {
  app.cloud = cloudSave({ game: 'grimring', keys: { records: 'grimring.records', settings: 'grimring.settings' }, canRestore: () => app.mode === 'title', onRestore: () => location.reload() });
}).catch(e => console.info('[grimring] cloud saves unavailable', e?.message));

// ------------------------------------------------------------------ for Claude's game-eye and tests
window.gameEye = {
  state() {
    const F = app.F;
    return {
      mode: app.mode, build: BUILD, paused: app.paused, phase: app.phase, pick: app.mode === 'pick' ? { mode: pick.mode, slots: pick.slots.slice(), diff: pick.diff } : null,
      run: app.run ? { champion: app.run.champion, round: app.run.round, rounds: app.run.rounds, boons: app.run.boons.slice(), hp: app.run.hp, done: app.run.done, won: app.run.won } : null,
      fight: F ? { t: +F.t.toFixed(2), over: F.over, winner: F.winner, fighters: F.fighters.map(f => ({ id: f.id, model: f.model, team: f.team, ctrl: f.ctrl, hp: Math.round(f.hp), max: f.max, x: +f.x.toFixed(2), z: +f.z.toFixed(2), face: +f.face.toFixed(2), state: f.state, clip: app.actors.get(f.id)?.clip || null })) } : null,
      cast: app.cast.map(a => a.id),
    };
  },
  /** Where a fighter's body is drawn on screen (CSS px), for tests that check W = up the screen. */
  screenOf(id) { const a = app.actors.get(id); if (!a) return null; const p = a.group.position; return stage.toScreen(p.x, 1, p.z); },
};

await extras;
showTitle();
requestAnimationFrame(loop);
