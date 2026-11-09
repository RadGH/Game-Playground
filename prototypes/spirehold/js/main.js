// Spirehold — the app: title, the loop, input, HUD, sheets, menus, saves and time away.
// The sim (js/sim) is pure; this file feeds it time and taps and turns its events into pictures, sound and words.

import { newGame, save, load, SAVE_KEY, exportText, importText } from './sim/state.js';
import { tick, STEP, catchUp, createBattle, newRealm, stewardSpend, cityTitle } from './sim/game.js';
import { castSpell, canCast, autoTarget, waveName, densest, towerPos, spawnR } from './sim/battle.js';
import { wallMax, manaMax, slotsOf, bon, spellKnown, isSiege, touch, towerStats, branchDue, crownsFor, PRESTIGE_WAVE } from './sim/rules.js';
import { SPELLS, SPELL_ORDER, REALMS, RELICS, NAME_PARTS, LANDMARKS, TOWERS } from './sim/data.js';
import { createRenderer, draw, handleEvents } from './render/draw.js';
import { initAudio, resumeAudio, setVolume, setMuted, soundEvents, play } from './audio.js';
import { $, el, btn, fmt, dur, toast, banner, modal } from './ui/dom.js';
import { TABS, BUILDERS, sheetSig, tabDot, reportCard } from './ui/panels.js';

const BUILD = '2026-11-08';

const COARSE = matchMedia?.('(pointer: coarse)').matches;
const SPELL_ICON = { fireball: '🔥', chain: '⚡', frostnova: '❄', meteor: '☄', quake: '⛰', ward: '🛡', barrage: '✨', starfury: '🌠' };
const app = window.app = {
  G: null, B: null, R: null, mode: 'title', speed: 1, paused: false, acc: 0, bulk: 1, sel: null, tab: null, sheetDirty: true, ups: [], sig: '',
  aiming: null, settings: loadSettings(), saveT: 0, stewardT: 0, hudT: 0, lastFrame: performance.now(), mouse: null,
};
function loadSettings() { const d = { volume: 0.6, muted: false, quality: COARSE ? 0.6 : 1, numbers: true, shake: true, seenHelp: false }; try { return { ...d, ...JSON.parse(localStorage.getItem('spirehold.prefs') || '{}') }; } catch { return d; } }
function saveSettings() { try { localStorage.setItem('spirehold.prefs', JSON.stringify(app.settings)); } catch { /* private mode */ } }

// ------------------------------------------------------------------ boot
const view = $('#view');
app.R = createRenderer(view); app.R.quality = app.settings.quality; app.R.numbers = app.settings.numbers;
setVolume(app.settings.volume); setMuted(app.settings.muted);
addEventListener('pointerdown', async () => { await initAudio(); resumeAudio(); setVolume(app.settings.volume); setMuted(app.settings.muted); });

function store() { try { return localStorage; } catch { return { getItem: () => null, setItem: () => {} }; } }
app.save = () => { if (!app.G) return false; app.G.lastSeen = Date.now(); return save(app.G, store()); };

function titleScene() {
  // a demo siege behind the title
  const G = newGame({ seed: 4242, now: Date.now() });
  G.city.level = 14; G.city.pop = 3000; G.wave.n = 12; G.city.landmarks = { market: 3, granary: 2, forge: 2, temple: 1, tavern: 2, academy: 2, library: 1 };
  const types = ['archer', 'ballista', 'bombard', 'frost', 'brazier', 'storm', 'arcane', 'archer', 'shrine', 'ballista', 'bombard', 'storm', 'frost', 'archer', 'arcane'];
  G.towers = types.slice(0, slotsOf(G)).map((type, slot) => ({ slot, type, lvl: 14 + slot % 5, br: [slot % 2, null], kills: 0, dmg: 0 }));
  G.mages = [{ id: 1, name: 'A', school: 'pyromancer', lvl: 8 }, { id: 2, name: 'B', school: 'stormcaller', lvl: 8 }];
  G.research = { rs_auto: 1, sp_chain: 1, sp_meteor: 1 }; G.spells.auto = { meteor: true, chain: true }; G.mana = 100; touch(G);
  G.wall.hp = wallMax(G);
  app.G = G; app.B = createBattle(G, 3); app.demo = true;
}
function showTitle() {
  app.mode = 'title'; closeSheet(); $('#hud').classList.add('hidden'); $('#title').classList.remove('hidden'); $('#panels').innerHTML = '';
  titleScene();
  const box = $('#title-buttons'); box.innerHTML = '';
  const saved = load(store());
  if (saved) box.append(btn(`Continue — ${saved.name}, wave ${saved.wave.n}`, () => startGame(saved), 'big primary'));
  box.append(btn(saved ? 'Start a new city' : 'Found your city', () => newGameDialog(!!saved), saved ? 'big' : 'big primary'));
  box.append(btn('How to play', helpDialog));
  const extra = $('#title-extra'); extra.innerHTML = '';
  extra.append(btn('Settings', settingsDialog, 'small'), btn('Load a saved code', importDialog, 'small'));
  import('../../../shared/whats-new.js').then(({ createWhatsNew }) => {
    app.news = createWhatsNew({ url: new URL('../data/changelog.json', import.meta.url), key: 'spirehold', title: "What's new" });
    extra.append(app.news.button({ label: "What's new" }));
  }).catch(() => {});
  import('../../../shared/credits.js').then(({ createCredits }) => {
    app.credits = createCredits({ game: 'prototypes/spirehold', made: 'Spirehold — by Radley Sustaire, built with Claude.' });
    extra.append(app.credits.button({ label: 'Credits' }));
  }).catch(() => {});
  import('../../../shared/rgs-signin.js').then(({ accountButton }) => { const b = accountButton({ game: 'spirehold', gameName: 'Spirehold' }); if (b) extra.append(b); }).catch(() => {});
}
function newGameDialog(replacing) {
  modal('Found your city', (m, close) => {
    const r = Math.floor(Math.random() * NAME_PARTS.city.length);
    const name = el('input', { value: NAME_PARTS.city[r], maxlength: 24 });
    m.append(el('label', { class: 'col' }, 'Name your city', name), el('p', { class: 'hint' }, 'Your city grows by itself. Build towers on the wall, cast spells, hire mages and send heroes on quests. The walls widen as the city grows.'));
    if (replacing) m.append(el('p', { class: 'bad' }, 'This replaces your current city. Copy your save code from the menu first if you want to keep it.'));
    m.append(el('div', { class: 'row' }, btn('Back', close), btn('Found it', () => { close(); const G = newGame({ seed: (Math.random() * 1e9) | 0, now: Date.now(), name: name.value.trim() || NAME_PARTS.city[r] }); startGame(G, true); }, 'primary')));
  });
}

function startGame(G, fresh = false) {
  app.demo = false; app.G = G; app.mode = 'play'; app.sel = null; app.pick = null;
  $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden'); $('#panels').innerHTML = '';
  app.R.cam.user = false; app.R.groundKey = ''; app.R.cityKey = '';
  const away = fresh ? null : catchUp(G, Date.now());
  app.B = createBattle(G, (Math.random() * 1e9) | 0); app.B.cap = app.settings.quality < 1 ? 450 : 800;
  buildTabs(); buildSpells(); app.save();
  if (away && away.secs > 60) awayDialog(away);
  else if (fresh && !app.settings.seenHelp) helpDialog();
  if (fresh) setTimeout(() => banner(G.name, 'The first wave is coming. Tap a + on the wall to build a tower.'), 600);
}

// ------------------------------------------------------------------ the loop
function loop(t) {
  requestAnimationFrame(loop);
  let dt = (t - app.lastFrame) / 1000; app.lastFrame = t;
  if (!app.G || !app.B) return;
  const G = app.G, B = app.B;
  if (app.mode === 'play' && dt > 30) { const away = catchUp(G, Date.now()); if (away && away.secs > 120) awayDialog(away); dt = 0; }
  dt = Math.min(dt, 30);
  const speed = app.paused ? 0 : (app.mode === 'title' ? 1 : app.speed);
  app.acc += dt * speed;
  let steps = 0; const maxSteps = 600;
  const now = Date.now();
  while (app.acc >= STEP && steps < maxSteps) {
    tick(G, B, STEP, now); app.acc -= STEP; steps++;
    if (B.ev.length) { if (steps > 40) B.ev = B.ev.filter(e => e.k !== 'shoot' && e.k !== 'die'); handleEvents(app.R, G, B); if (app.mode === 'play') { soundEvents(B, x => panOf(x), app.speed); onEvents(B.ev); } B.ev.length = 0; }
  }
  if (app.acc > 5) app.acc = 0;   // never fall further behind than this; time away is handled by catchUp
  if (app.mode === 'play') {
    drainNews();
    app.stewardT -= dt; if (G.steward && app.stewardT <= 0) { app.stewardT = 2; stewardSpend(G); }
    app.saveT -= dt; if (app.saveT <= 0) { app.saveT = 20; app.save(); }
    app.hudT -= dt; if (app.hudT <= 0) { app.hudT = 0.12; updateHud(); }
    app.sheetT = (app.sheetT || 0) - dt; if (app.sheetT <= 0) { app.sheetT = 0.3; refreshSheet(); }
  }
  const sheetOpen = !$('#sheet').classList.contains('hidden');
  const wide = innerWidth >= 900;
  app.R.fit(G, sheetOpen && !wide ? $('#sheet').offsetHeight + 62 : (wide ? 0 : 120), sheetOpen && wide ? 420 : 0);
  app.R.select = app.mode === 'play' && app.tab === 'defend' ? (app.sel ?? -1) : -1;
  draw(app.R, G, B, Math.min(dt, 0.1), { shake: app.settings.shake, range: t => towerStats(G, t).range, due: t => branchDue(t) >= 0, labels: app.mode === 'play' });
}
const panOf = x => Math.max(-0.8, Math.min(0.8, (x - app.R.cam.x) / (spawnR(app.G) || 400)));

// ------------------------------------------------------------------ what happened: banners, toasts
function onEvents(evs) {
  const G = app.G;
  for (const e of evs) {
    if (e.k === 'wave' && e.great) banner(`Great Siege — wave ${e.n}`, 'Every road is black with them. Hold the walls!', 'red');
    else if (e.k === 'wave' && e.siege) banner(`Siege — wave ${e.n}`, 'Their leader marches with them.', 'red');
    else if (e.k === 'boss') toast(`${e.name} leads the attack.`, 'bad');
    else if (e.k === 'bossdown') toast(`${e.name} has fallen! +${e.shards} starshard${e.shards > 1 ? 's' : ''}`, 'gold');
    else if (e.k === 'breach') { banner('The wall is breached!', `The defenders fall back and regroup. Back to wave ${G.wave.n}. Strengthen the wall or your towers.`, 'red'); }
  }
}
function drainNews() {
  const G = app.G;
  while (G.news.length) {
    const n = G.news.shift();
    if (n.k === 'city') { banner(`${G.name} grows`, `City level ${n.level}${n.ring ? ` — ${n.title}` : ''}${n.news.length ? '. ' + n.news.join(' ') : ''}`); play('levelup', { gain: 0.6 }); app.sheetDirty = true; }
    else if (n.k === 'party') { toast(`${n.name} (${n.n} adventurers) stopped at the tavern.`, 'good'); play('ui.open', { gain: 0.5 }); }
    else if (n.k === 'quest') {
      const r = n.rep; play(r.won ? 'quest.complete' : 'ui.error', { gain: 0.7 });
      const t = el('div', { class: `toast ${r.won ? 'good' : 'bad'}`, style: 'cursor:pointer;pointer-events:auto' }, `${r.won ? 'Quest won' : 'Quest failed'}: ${r.title}${r.relic ? ` — found ${RELICS[r.relic].name}!` : ''} (tap to read)`);
      t.addEventListener('click', () => modal(r.won ? 'They are back — and they won' : 'They are back — empty-handed', (m, close) => { m.append(reportCard(r), btn('Close', close, 'primary')); }));
      $('#toasts').append(t); setTimeout(() => t.remove(), 9000);
      app.sheetDirty = true; app.save();
    }
  }
}

// ------------------------------------------------------------------ HUD
function updateHud() {
  const G = app.G, B = app.B;
  $('#st-gold').textContent = fmt(G.gold); $('#st-lore').textContent = fmt(G.lore); $('#st-shards').textContent = fmt(G.shards);
  const w = B.wave;
  $('#wave-name').textContent = `${waveName(w.n)} ${w.n}`;
  $('#wave-sub').textContent = B.breachT > 0 ? 'Regrouping…' : `${G.wave.auto ? 'Pushing on' : 'Holding here'} · best ${G.wave.best} · ${B.enemies.length} foes`;
  $('#wave-prog').style.width = Math.min(100, w.idx / Math.max(1, w.list.length) * 100) + '%';
  const wf = Math.max(0, G.wall.hp / wallMax(G)); $('#bar-wall').style.transform = `scaleX(${wf})`; $('#txt-wall').textContent = `Wall ${Math.round(wf * 100)}%${B.wardT > 0 ? ' · warded' : B.wallDps > 0 ? ' · under attack' : ''}`;
  const mf = G.mana / manaMax(G); $('#bar-mana').style.transform = `scaleX(${mf})`; $('#txt-mana').textContent = `Mana ${Math.floor(G.mana)}/${Math.round(manaMax(G))}`;
  $('#btn-auto').textContent = G.wave.auto ? 'Pushing on' : 'Holding'; $('#btn-auto').classList.toggle('on', !G.wave.auto);
  $('#btn-speed').textContent = app.paused ? 'Paused' : `${app.speed}×`;
  const boss = B.enemies.find(e => e.boss && e.alive);
  $('#bossbar').classList.toggle('hidden', !boss);
  if (boss) { $('#boss-name').textContent = boss.name; $('#boss-hp').style.width = (boss.hp / boss.max * 100) + '%'; }
  // spells
  const known = SPELL_ORDER.filter(id => spellKnown(G, id)).join();
  if (known !== app.knownSpells) buildSpells();
  for (const b of document.querySelectorAll('.spell')) {
    const id = b.dataset.id; const S = SPELLS[id]; const cd = G.spells.cd[id] || 0;
    b.querySelector('.cd').style.height = (cd / S.cd * 100) + '%';
    b.classList.toggle('nomana', G.mana < S.mana); b.classList.toggle('aiming', app.aiming === id);
    b.querySelector('.auto').textContent = G.spells.auto[id] && bon(G, 'autocast') ? 'A' : '';
  }
  const now = Date.now();
  for (const b of document.querySelectorAll('.tabs button')) { const has = tabDot(app, b.dataset.tab, now); const d = b.querySelector('.dot'); if (has && !d) b.append(el('i', { class: 'dot' })); else if (!has && d) d.remove(); }
}
$('#btn-auto').addEventListener('click', () => { app.G.wave.auto = !app.G.wave.auto; toast(app.G.wave.auto ? 'Pushing on to harder waves.' : 'Holding at this wave to gather gold.'); updateHud(); });
$('#btn-speed').addEventListener('click', () => cycleSpeed());
function cycleSpeed() { const max = bon(app.G, 'speed3') ? 3 : 2; if (app.paused) { app.paused = false; app.speed = 1; } else app.speed = app.speed >= max ? 1 : app.speed + 1; updateHud(); }

// ------------------------------------------------------------------ spells
function buildSpells() {
  const G = app.G; const box = $('#spells'); box.innerHTML = '';
  const ids = SPELL_ORDER.filter(id => spellKnown(G, id)); app.knownSpells = ids.join();
  for (const id of ids) {
    const S = SPELLS[id];
    const b = el('button', { class: 'spell', 'data-id': id, title: `${S.name} (${S.key}) — ${S.desc}` }, SPELL_ICON[id], el('i', { class: 'cd' }), el('span', { class: 'k' }, S.key), el('span', { class: 'm' }, S.mana), el('span', { class: 'auto' }));
    b.addEventListener('click', e => { e.stopPropagation(); spellButton(id); });
    box.append(b);
  }
}
function spellButton(id) {
  const G = app.G, B = app.B; const S = SPELLS[id];
  if (id === 'ward' || id === 'quake') return tryCast(id, 0, 0);
  if (app.aiming === id) { app.aiming = null; app.R.aim = null; const at = autoTarget(G, B, id) || densest(B, S.radius || 70) || { x: 0, y: -200 }; return tryCast(id, at.x, at.y); }
  app.aiming = id; app.R.aim = { x: app.mouse?.x ?? 0, y: app.mouse?.y ?? -200, r: S.radius || 40, color: '#ffd080' };
}
function tryCast(id, x, y) {
  const why = castSpell(app.G, app.B, id, x, y);
  if (why === 'mana') toast('Not enough mana yet.', 'bad'); else if (why === 'cooldown') toast(`${SPELLS[id].name} is not ready yet.`, 'bad');
  else if (!why) { app.aiming = null; app.R.aim = null; }
  updateHud();
}

// ------------------------------------------------------------------ tabs and the sheet
function buildTabs() {
  const nav = $('#tabs'); nav.innerHTML = '';
  for (const t of TABS) { const b = el('button', { 'data-tab': t.id, title: t.label }, el('span', { class: 'ic' }, t.ic), t.label); b.addEventListener('click', () => toggleTab(t.id)); nav.append(b); }
}
function toggleTab(id) { if (app.tab === id && !$('#sheet').classList.contains('hidden')) closeSheet(); else openTab(id); }
function openTab(id) {
  app.tab = id; app.sheetDirty = true; $('#sheet').classList.remove('hidden'); document.body.classList.add('sheet-open');
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === id);
  $('#sheet-title').textContent = TABS.find(t => t.id === id).label;
  play('ui.tab', { gain: 0.4 }); refreshSheet();
}
function closeSheet() { app.tab = null; $('#sheet')?.classList.add('hidden'); document.body.classList.remove('sheet-open'); for (const b of document.querySelectorAll('.tabs button')) b.classList.remove('on'); app.sel = null; }
$('#sheet-close').addEventListener('click', closeSheet);
function refreshSheet() {
  if (!app.tab || !app.G) return;
  const now = Date.now(); const sig = app.tab + '|' + sheetSig(app, app.tab, now);
  if (app.sheetDirty || sig !== app.sig) {
    const body = $('#sheet-body'); const scroll = body.scrollTop; body.innerHTML = ''; app.ups = [];
    BUILDERS[app.tab](app, body, app.ups, now);
    app.sig = app.tab + '|' + sheetSig(app, app.tab, now); app.sheetDirty = false; body.scrollTop = scroll;
  }
  for (const u of app.ups) u();
}

// ------------------------------------------------------------------ the field: taps, drags, zoom
const pointers = new Map(); let drag = null, pinch = null;
view.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: app.R.cam.z }; drag = null; return; }
  drag = { x: e.clientX, y: e.clientY, cx: app.R.cam.x, cy: app.R.cam.y, moved: false, button: e.button };
});
view.addEventListener('pointermove', e => {
  const w = app.R.toWorld(e.clientX, e.clientY); app.mouse = w; if (app.R.aim) { app.R.aim.x = w.x; app.R.aim.y = w.y; }
  if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); app.R.cam.z = Math.max(app.R.cam.fitZ * 0.6, Math.min(4, pinch.z * d / pinch.d)); app.R.cam.user = true; return; }
  if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 8) drag.moved = true; if (drag.moved && !app.R.aim) { app.R.cam.x = drag.cx - dx / app.R.cam.z; app.R.cam.y = drag.cy - dy / app.R.cam.z; app.R.cam.user = true; } }
});
const up = e => {
  pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
  if (!drag) return; const d = drag; drag = null; if (d.moved && !app.R.aim) return;
  if (app.mode !== 'play') return;
  if (d.button === 2) { app.aiming = null; app.R.aim = null; return; }
  const w = app.R.toWorld(e.clientX, e.clientY);
  if (app.aiming) { tryCast(app.aiming, w.x, w.y); return; }
  // a tower spot?
  const G = app.G; let best = -1, bd = Math.max(16, 22 / app.R.cam.z);
  for (let s = 0; s < slotsOf(G); s++) { const p = towerPos(G, s); const dd = Math.hypot(p.x - w.x, p.y - w.y); if (dd < bd) { bd = dd; best = s; } }
  if (best >= 0) { app.sel = best; openTab('defend'); play('ui.click', { gain: 0.4 }); }
};
view.addEventListener('pointerup', up); view.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); drag = null; pinch = null; });
view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('wheel', e => { e.preventDefault(); const z0 = app.R.cam.z; const z = Math.max(app.R.cam.fitZ * 0.6, Math.min(4, z0 * Math.exp(-e.deltaY * 0.0015))); const w = app.R.toWorld(e.clientX, e.clientY); app.R.cam.z = z; const w2 = app.R.toWorld(e.clientX, e.clientY); app.R.cam.x += w.x - w2.x; app.R.cam.y += w.y - w2.y; app.R.cam.user = true; }, { passive: false });
view.addEventListener('dblclick', () => { app.R.cam.user = false; });

// ------------------------------------------------------------------ keyboard
addEventListener('keydown', e => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (app.mode !== 'play') return;
  const k = e.key.toLowerCase();
  const sp = SPELL_ORDER.find(id => SPELLS[id].key === e.key);
  if (sp && spellKnown(app.G, sp)) { const at = app.mouse && !COARSE ? app.mouse : (autoTarget(app.G, app.B, sp) || { x: 0, y: -200 }); tryCast(sp, at.x, at.y); e.preventDefault(); return; }
  const tabKey = { d: 'defend', c: 'city', m: 'mages', g: 'guild', r: 'research', l: 'realm' }[k];
  if (tabKey) { toggleTab(tabKey); return; }
  if (k === ' ') { app.paused = !app.paused; updateHud(); e.preventDefault(); }
  else if (k === 's') cycleSpeed();
  else if (k === 'escape') { if ($('.modal-back')) $('.modal-back').remove(); else if (app.aiming) { app.aiming = null; app.R.aim = null; } else if (app.tab) closeSheet(); else openMenu(); }
  else if (k === '0') app.R.cam.user = false;
  else if (k === '=' || k === '+') { app.R.cam.z = Math.min(4, app.R.cam.z * 1.2); app.R.cam.user = true; }
  else if (k === '-') { app.R.cam.z = Math.max(app.R.cam.fitZ * 0.6, app.R.cam.z / 1.2); app.R.cam.user = true; }
  else if (k === 'p') { app.G.wave.auto = !app.G.wave.auto; updateHud(); }
});

// ------------------------------------------------------------------ controller in battle (menus use padnav)
let padPrev = [];
function padBattle() {
  requestAnimationFrame(padBattle);
  if (app.mode !== 'play') return;
  const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected); if (!pad) return;
  const now = pad.buttons.map(b => b.pressed); const hit = i => now[i] && !padPrev[i]; padPrev = now;
  const menuOpen = !!$('.modal-back');
  if (hit(9)) { if (menuOpen) $('.modal-back').remove(); else openMenu(); }
  if (menuOpen) return;
  if (hit(4) || hit(5)) { const i = TABS.findIndex(t => t.id === app.tab); const n = (i + (hit(5) ? 1 : -1) + TABS.length + (i < 0 && hit(4) ? 1 : 0)) % TABS.length; openTab(TABS[n].id); }
  if (hit(8)) cycleSpeed();
  if (app.tab) return;      // padnav owns A/B/X/Y while a sheet is open
  const ids = SPELL_ORDER.filter(id => spellKnown(app.G, id));
  [0, 1, 2, 3].forEach((b, i) => { if (hit(b) && ids[i]) { const at = autoTarget(app.G, app.B, ids[i]) || densest(app.B, 70) || { x: 0, y: -200 }; tryCast(ids[i], at.x, at.y); } });
  if (hit(6) && ids[4]) { const at = autoTarget(app.G, app.B, ids[4]) || densest(app.B, 70) || { x: 0, y: -200 }; tryCast(ids[4], at.x, at.y); }
  if (hit(7) && ids[5]) { const at = autoTarget(app.G, app.B, ids[5]) || densest(app.B, 70) || { x: 0, y: -200 }; tryCast(ids[5], at.x, at.y); }
}
requestAnimationFrame(padBattle);
import('./ui/padnav.js').then(({ createPadNav }) => {
  app.padnav = createPadNav({
    busy: () => app.mode === 'play' && !app.tab && !$('.modal-back'),
    back: () => { if ($('.modal-back')) { $('.modal-back').remove(); return true; } if (app.tab) { closeSheet(); return true; } return false; },
  });
}).catch(() => {});

// ------------------------------------------------------------------ menus
$('#btn-menu').addEventListener('click', () => openMenu());
function openMenu() {
  modal('Menu', (m, close) => {
    const add = (label, fn, cls) => m.append(btn(label, () => { close(); fn(); }, cls));
    add('Back to the walls', () => {}, 'primary');
    add(app.paused ? 'Unpause' : 'Pause', () => { app.paused = !app.paused; updateHud(); });
    add('How to play', helpDialog);
    add('Settings', settingsDialog);
    if (app.news) add("What's new", () => app.news.open());
    if (app.credits) add('Credits', () => app.credits.open());
    add('Report a bug', reportDialog);
    add('Save now', () => toast(app.save() ? 'Saved.' : 'Could not save (storage full or blocked).', 'good'));
    add('Copy my save code', exportDialog);
    add('Save and go to the title', () => { app.save(); showTitle(); }, 'danger');
  });
}
function helpDialog() {
  app.settings.seenHelp = true; saveSettings();
  modal('How to play', (m, close) => {
    m.append(el('div', { html: `
      <p><b>Your city looks after itself.</b> People move in, pay taxes and the walls widen as it grows. You hold the walls.</p>
      <p><b>Towers</b> — tap a <b>+</b> on the wall to build one, tap a tower to upgrade it. At levels 10 and 30 each tower picks a path. Every 25 levels after that its damage doubles.</p>
      <p><b>Spells</b> — the buttons at the bottom. Tap one, then tap the field (or tap it twice to hit the thickest crowd). Keys 1–8 cast at the mouse.</p>
      <p><b>Mages</b> — build the Mage Academy, then hire court mages who cast on their own.</p>
      <p><b>Guild</b> — adventuring parties stop at the tavern. Hire them, then send them on quests. Harder and longer quests pay more; a failed quest brings back nothing and some heroes come home hurt. Heroes at home fight from the walls.</p>
      <p><b>Research</b> — spend lore for new spells and lasting bonuses. Research <i>Spellwardens</i> and apprentices cast your spells while you are away.</p>
      <p><b>Leave it running</b> — the city earns while you watch something else, and still earns (a little less) while the game is closed. Turn on the <b>Royal Steward</b> (Defend tab) to have gold spent for you.</p>
      <p><b>When the wall falls</b> the defenders fall back three waves and try again. Tap <b>Pushing on</b> to hold at one wave and build up gold.</p>
      <p><b>New realms</b> — from wave ${PRESTIGE_WAVE}, found a city in a new land and earn Crowns for bonuses that last forever. Relics and heroes come with you.</p>
      <p class="hint">Keys: D C M G R L open the tabs · Space pauses · S changes speed · mouse wheel zooms, drag to look around, double-click to reset. Controller: A B X Y cast spells, bumpers change tabs, Start opens the menu.</p>` }), btn('Got it', close, 'primary'));
  });
}
function settingsDialog() {
  modal('Settings', (m, close) => {
    const s = app.settings;
    const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume, oninput: e => { s.volume = +e.target.value; setVolume(s.volume); saveSettings(); } });
    const chk = (label, key, fn) => el('label', { class: 'row' }, el('input', { type: 'checkbox', checked: s[key] || null, onchange: e => { s[key] = e.target.checked; fn?.(s[key]); saveSettings(); } }), label);
    const q = el('select', { onchange: e => { s.quality = +e.target.value; app.R.quality = s.quality; app.R.groundKey = ''; app.R.cityKey = ''; app.R.w = 0; saveSettings(); } },
      el('option', { value: 1, selected: s.quality >= 1 || null }, 'Full (sharpest, most sparks)'), el('option', { value: 0.6, selected: s.quality < 1 || null }, 'Light (for phones and long idle sessions)'));
    m.append(el('label', { class: 'col' }, 'Volume', vol), chk('Mute everything', 'muted', setMuted), el('label', { class: 'col' }, 'Graphics', q), chk('Show gold numbers on kills', 'numbers', v => { app.R.numbers = v; }), chk('Screen shake', 'shake'));
    if (app.G && app.mode === 'play') m.append(el('label', { class: 'row' }, el('input', { type: 'checkbox', checked: app.G.stewardPaths !== false || null, onchange: e => { app.G.stewardPaths = e.target.checked; } }), 'The Royal Steward also picks tower paths'));
    m.append(btn('Done', close, 'primary'));
  });
}
function exportDialog() {
  app.save();
  modal('Your save code', (m, close) => {
    const ta = el('textarea', { rows: 6, readonly: true }); ta.value = exportText(app.G);
    m.append(el('p', { class: 'hint' }, 'Copy this somewhere safe. "Load a saved code" on the title screen brings this city back on any device.'), ta,
      el('div', { class: 'row' }, btn('Copy', async () => { try { await navigator.clipboard.writeText(ta.value); toast('Copied.', 'good'); } catch { ta.select(); } }), btn('Done', close, 'primary')));
  });
}
function importDialog() {
  modal('Load a saved code', (m, close) => {
    const ta = el('textarea', { rows: 6, placeholder: 'Paste your save code here' });
    m.append(ta, el('p', { class: 'hint' }, 'This replaces the city saved on this device.'), el('div', { class: 'row' }, btn('Cancel', close), btn('Load', () => { try { const G = importText(ta.value); close(); startGame(G); toast('City loaded.', 'good'); } catch { toast('That code could not be read.', 'bad'); } }, 'primary')));
  });
}
function awayDialog(a) {
  modal('While you were away', (m, close) => {
    m.append(el('p', {}, `You were gone ${dur(a.secs * 1000)}. The city kept going at ${Math.round(a.eff * 100)}% of its usual pace.`),
      el('div', { class: 'kv', html: `<span>Gold</span><span class="goldc">+${fmt(a.gold)}</span><span>Lore</span><span class="lorec">+${fmt(a.lore)}</span><span>New people</span><span>+${fmt(a.pop)}</span>${a.levels ? `<span>City</span><span>+${a.levels} level${a.levels > 1 ? 's' : ''}</span>` : ''}<span>Quests back</span><span>${a.quests.length}</span>` }));
    for (const r of a.quests.slice(0, 6)) m.append(reportCard(r));
    m.append(btn('Back to the walls', close, 'primary'));
  });
}
app.confirmRealm = (realm) => {
  const G = app.G; const c = crownsFor(G);
  modal(`Found a city in ${REALMS[realm].name}?`, (m, close) => {
    m.append(el('p', {}, `You earn ${c} Crowns. ${G.name} is left behind: its towers, walls, mages, landmarks, research and gold start over. You keep your relics, starshards, heroes and Legacy.`),
      el('div', { class: 'row' }, btn('Not yet', close), btn('Set out', () => {
        const r = newRealm(G, realm, (Math.random() * 1e9) | 0, Date.now()); if (r.err) { toast(r.err, 'bad'); return; }
        close(); const name = NAME_PARTS.city[Math.floor(Math.random() * NAME_PARTS.city.length)]; r.G.name = name;
        startGame(r.G, true); app.save(); banner(`${name}, ${REALMS[realm].name}`, `A new beginning. +${c} Crowns to spend on Legacy.`); openTab('realm'); app.realmTab = 'legacy';
      }, 'primary')));
  });
};
function reportDialog() {
  modal('Report a bug', (m, close) => {
    const text = el('textarea', { rows: 5, placeholder: 'What went wrong, or what would you like? Plain words are perfect.' });
    m.append(text, el('p', { class: 'hint' }, 'Your note, a picture of the screen and a few game details are sent to the developer.'),
      el('div', { class: 'row' }, btn('Cancel', close), btn('Send', async () => {
        if (!text.value.trim()) { toast('Write a few words first.', 'bad'); return; }
        let shot = null; try { shot = view.toDataURL('image/jpeg', 0.5); if (shot.length > 400000) shot = null; } catch { /* */ }
        const rep = { at: new Date().toISOString(), text: text.value, state: window.gameEye.state(), ua: navigator.userAgent, size: [innerWidth, innerHeight], build: BUILD, shot };
        close(); sendReport(rep);
      }, 'primary')));
    setTimeout(() => text.focus(), 30);
  });
}
async function sendReport(rep) {
  let list = []; try { list = JSON.parse(localStorage.getItem('spirehold.reports') || '[]'); } catch { /* */ }
  list.push(rep); const out = [];
  for (const r of list) { try { const res = await fetch('/api/report/spirehold', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) }); if (!res.ok) out.push(r); } catch { out.push(r); } }
  try { localStorage.setItem('spirehold.reports', JSON.stringify(out.slice(-10))); } catch { /* */ }
  toast('Thank you — report sent.', 'good');
}

// ------------------------------------------------------------------ saving when the page goes away
addEventListener('visibilitychange', () => { if (document.hidden && app.mode === 'play') app.save(); });
addEventListener('pagehide', () => { if (app.mode === 'play') app.save(); });

// ------------------------------------------------------------------ for Claude's game-eye and tests
window.gameEye = {
  state() {
    const G = app.G, B = app.B;
    if (!G) return { mode: app.mode };
    return {
      mode: app.mode, build: BUILD, tab: app.tab, speed: app.speed, paused: app.paused,
      city: { name: G.name, level: G.city.level, pop: Math.round(G.city.pop), title: cityTitle(G), landmarks: G.city.landmarks },
      gold: Math.round(G.gold), lore: Math.round(G.lore), shards: G.shards, crowns: G.crowns, realm: G.realm,
      wave: { n: G.wave.n, best: G.wave.best, auto: G.wave.auto, falls: G.wave.falls, foes: B?.enemies.length || 0 },
      wall: { lvl: G.wall.lvl, hp: Math.round(G.wall.hp), max: Math.round(wallMax(G)) }, mana: Math.round(G.mana),
      towers: G.towers.map(t => ({ slot: t.slot, type: t.type, lvl: t.lvl })), mages: G.mages.length,
      guild: { roster: G.guild.roster.length, away: G.guild.active.length, visitors: G.guild.visitors.length, board: G.guild.board.length, bestRank: G.guild.bestRank ?? -1 },
      relics: Object.keys(G.relics).length, totals: G.totals,
    };
  },
  health() { return { fps: Math.round(1 / Math.max(0.001, (performance.now() - app.lastFrame) / 1000 || 0.016)), parts: app.R.parts.length } },
};

// cloud saves while signed in to games.radgh.com (saves stay per game)
import('../../../shared/rgs-cloudsave.js').then(({ cloudSave }) => {
  app.cloud = cloudSave({ game: 'spirehold', keys: { save: SAVE_KEY, prefs: 'spirehold.prefs' }, canRestore: () => app.mode === 'title', onRestore: () => location.reload() });
}).catch(e => console.info('[spirehold] cloud saves unavailable', e?.message));

showTitle();
requestAnimationFrame(loop);
