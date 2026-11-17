// The screens around the city view: Title, New world, World map — plus the sheets every screen shares (Settings,
// Load world, Report a bug, What's new, Credits). main.js owns the city view; it hands these screens an `app`:
//
//   app.root                       a full-screen element the screens draw into (they replace its children)
//   app.playRegion(worldSave, id)  open the city view for that region (an unfounded one: the view picks the landing)
//   app.settings                   the settings object (filled from localStorage 'arcline.settings' if missing)
//   app.onSettings(settings)       called after any settings change
//   app.awaySummary?.(ws, id)      optional: what a city earned while away → string | string[] (shown on its card)
//   app.build?                     optional build label for the version line
//   app.padBusy?.()                optional: true while the city view wants the controller for itself
//
// Set by these screens (main.js may read them): app.screen ('title'|'new'|'map'), app.news, app.credits, app.account,
// app.cloud, app.padnav. screenState() gives game-eye a summary. Call leaveScreens() before showing the city view
// yourself (playRegion is called after the screens have already left).
import { el, btn, toast, sheet, topSheet, closeTopSheet } from './dom.js';
import { fmt, pct, sign } from '../../../../shared/format.js';
import { installTooltips } from '../../../../shared/tooltip.js';
import { BIOMES, CELL, generateWorld, neighbours } from '../sim/world.js';
import { linkKind, linkReport } from '../sim/transit.js';
import { neighbourList } from './stats.js';
import { milestones } from '../sim/tuning.js';
import * as S from '../save.js';
import { WorldView, worldFacts } from '../render/world-view.js';

export const BUILD = '2026-11-15a';
const SHARED = new URL('../../../../shared/', import.meta.url);
const CSS = [new URL('whats-new.css', SHARED), new URL('credits.css', SHARED), new URL('dialog.css', SHARED), new URL('tooltip.css', SHARED), new URL('../../css/screens.css', import.meta.url)];
const DEP = [['metal', 'Metal'], ['stone', 'Stone'], ['crystal', 'Crystal']];
const isPhone = () => innerWidth < 760;
const touchy = () => matchMedia?.('(pointer: coarse)').matches;

let cur = null;          // { name, node, back(), destroy() }
let booted = false;

// ------------------------------------------------------------------ boot (once)
function boot(app) {
  app.settings ||= S.loadSettings();
  if (booted) return; booted = true;
  for (const href of CSS) if (![...document.styleSheets].some(s => s.href === href.href) && !document.querySelector(`link[href="${href.href}"]`)) document.head.append(el('link', { rel: 'stylesheet', href: href.href }));
  for (const id of ['panels', 'toasts']) if (!document.getElementById(id)) document.body.append(el('div', { id, 'aria-live': id === 'toasts' ? 'polite' : null }));
  installTooltips();
  addEventListener('keydown', e => onKey(app, e));
  // whatever sits behind the top dialog is hidden from readers and clicks (and the walk's overlap check)
  const shade = () => {
    const layers = [...document.querySelectorAll('#panels > .modal-back, body > .modal')];
    const top = layers.pop() || null;
    for (const n of [app.root, ...layers]) { if (!n) continue; if (top) { n.setAttribute('aria-hidden', 'true'); n.inert = true; } else { n.removeAttribute('aria-hidden'); n.inert = false; } }
    if (top) { top.removeAttribute('aria-hidden'); top.inert = false; }
  };
  const mo = new MutationObserver(shade);
  mo.observe(document.body, { childList: true }); mo.observe(document.getElementById('panels'), { childList: true });
  if (!app.padnav) import('./padnav.js').then(({ createPadNav }) => {
    app.padnav ||= createPadNav({ busy: () => !!app.padBusy?.(), back: () => goBack() });
  }).catch(() => {});
  import('../../../../shared/whats-new.js').then(({ createWhatsNew }) => { app.news ||= createWhatsNew({ url: new URL('../../data/changelog.json', import.meta.url), key: 'arcline', title: "What's new" }); app.news.ensure?.(); refreshTitle(app); }).catch(() => {});
  import('../../../../shared/credits.js').then(({ createCredits }) => { app.credits ||= createCredits({ game: 'arcline', made: 'Arcline — by Radley Sustaire, built with Claude. Buildings, creatures and vehicles are our own models, drawn by City Kit.' }); }).catch(() => {});
  import('../../../../shared/rgs-signin.js').then(({ accountButton }) => { if (!app.account) { const b = accountButton({ game: 'arcline', gameName: 'Arcline' }); if (b) { b.classList.add('small'); app.account = b; } } refreshTitle(app); }).catch(() => {});
  Promise.all([import('../../../../shared/rgs-cloudsave.js'), import('../save-summary.js')]).then(([{ cloudSave }, { describeSaves }]) => {
    app.cloud ||= cloudSave({ describe: describeSaves, game: 'arcline', keys: S.CLOUD.keys, prefixes: S.CLOUD.prefixes, canRestore: () => app.screen === 'title', onRestore: () => location.reload() });
    S.onSaved(() => app.cloud?.saveSoon?.());
  }).catch(e => console.info('[arcline] cloud saves unavailable', e?.message));
}
function sharedModal() { return document.querySelector('.gdlg-modal, .wn-modal, .cr-modal'); }
function goBack() {
  const m = sharedModal();
  if (m) { (m.querySelector('[data-close], .gdlg-cancel') || m.querySelector('.gdlg-ok'))?.click(); return true; }
  if (closeTopSheet()) return true;
  return !!cur?.back?.();
}
function onKey(app, e) {
  if (!cur) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName);
  if (e.key === 'Escape') {
    const m = sharedModal(); if (m && m.contains(e.target)) return;      // the shared dialog handles its own Esc
    if (goBack()) e.preventDefault();
    return;
  }
  if (typing || topSheet() || sharedModal()) return;
  cur.key?.(e);
}
/** Stop every screen loop and empty the root (main.js calls this before showing the city). */
export function leaveScreens() { cur?.destroy?.(); cur = null; while (topSheet()) closeTopSheet(); }
function mount(app, name, node, hooks = {}) {
  leaveScreens();
  app.screen = name;
  app.root.replaceChildren(node);
  cur = { name, node, ...hooks };
  return cur;
}
/** For game-eye / bug reports. */
export function screenState() { return { screen: cur?.name || null, ...(cur?.state?.() || {}) }; }

const kbd = k => el('kbd', { class: 'ac-kbd', 'aria-hidden': 'true' }, k);
const ago = ts => {
  if (!ts) return 'never';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24); return `${d} day${d === 1 ? '' : 's'} ago`;
};
const plural = (n, one, many = one + 's') => `${fmt(n, { decimals: 0 })} ${n === 1 ? one : many}`;
const worldLine = w => [S.sizeOf(w.cells).label + ' world', plural(w.totals?.cities ?? S.worldTotals(w).cities, 'city', 'cities'), plural(w.totals?.people ?? S.worldTotals(w).people, 'person', 'people')].join(' · ');

// ================================================================== TITLE
let titleScene = null;
export function showTitle(app) {
  boot(app);
  const bg = el('canvas', { class: 'ac-bg', 'aria-hidden': 'true' });
  const corner = el('div', { class: 'ac-corner' });
  const menu = el('nav', { class: 'ac-menu', 'aria-label': 'Main menu' });
  const small = el('div', { class: 'ac-menu-small' });
  const root = el('section', { class: 'ac-screen ac-title panel-full' },
    bg,
    el('main', { class: 'ac-title-main' },
      el('header', { class: 'ac-logo' },
        el('h1', { class: 'ac-wordmark', 'aria-label': 'Arcline' }, el('span', { class: 'ac-arc', 'aria-hidden': 'true' }), 'ARCLINE'),
        el('p', { class: 'ac-tagline' }, 'Raise a skyline. Hold the wall.')),
      el('div', { class: 'ac-menu-card' }, menu, small)),
    corner,                                   // after the menu, so a controller starts on Continue
    el('div', { class: 'ac-version' }, `Build ${app.build || BUILD}`));
  mount(app, 'title', root, {
    destroy: () => titleScene?.stop(),
    state: () => ({ worlds: S.listWorlds().length, skyline: titleScene?.baked ?? 0 }),
  });
  drawTitleMenu(app, menu, small, corner);
  import('../render/title-scene.js').then(({ createTitleScene }) => {
    if (cur?.node !== root) return;
    titleScene?.stop();
    titleScene = createTitleScene(bg, { light: app.settings.effects === 'light', sky: app.settings.weather !== false, paused: () => !!app.root.inert });
    titleScene.start();
  }).catch(e => console.info('[arcline] title backdrop unavailable', e?.message));
}
function refreshTitle(app) {
  if (cur?.name !== 'title') return;
  const n = cur.node; drawTitleMenu(app, n.querySelector('.ac-menu'), n.querySelector('.ac-menu-small'), n.querySelector('.ac-corner'));
}
function drawTitleMenu(app, menu, small, corner) {
  const last = S.lastWorld(), count = S.listWorlds().length;
  const big = (title, sub, fn, cls = '') => btn([el('b', {}, title), sub ? el('small', {}, sub) : null], fn, `ac-big ${cls}`);
  menu.replaceChildren(...[   // filter: a null would print the word "null"
    last ? big('Continue', `${last.name} · ${worldLine(last).replace(/^[A-Za-z]+ world · /, '')}`, () => openWorld(app, last.id), 'primary') : null,
    big('New world', 'Generate a planet', () => showNewWorld(app), last ? '' : 'primary'),
    count ? big('Load world', plural(count, 'saved world'), () => openLoadWorlds(app)) : null,
  ].filter(Boolean));
  small.replaceChildren(...[
    btn('Settings', () => openSettings(app), 'ac-chip'),
    app.news ? (() => { const b = app.news.button({ label: "What's new" }); b.classList.add('ac-chip'); return b; })() : null,
    btn('Credits', () => openCredits(app), 'ac-chip'),
    btn('Report a bug', () => openReport(app), 'ac-chip')].filter(Boolean));
  if (app.account && !corner.contains(app.account)) corner.replaceChildren(app.account);
}
async function openWorld(app, id) {
  const ws = await S.loadWorld(id);
  if (!ws) { toast('That world could not be opened.', 'bad'); return; }
  showWorldMap(app, ws);
}

// ------------------------------------------------------------------ Load world sheet
export function openLoadWorlds(app) {
  boot(app);
  sheet('Load world', (m, close) => {
    const list = el('div', { class: 'ac-worlds' });
    const draw = () => {
      const all = S.listWorlds();
      if (!all.length) { list.replaceChildren(el('p', { class: 'ac-empty' }, 'No saved worlds in this browser yet.')); return; }
      list.replaceChildren(...all.map(w => el('div', { class: 'ac-world-row' },
        el('div', { class: 'ac-world-text' }, el('b', {}, w.name), el('small', {}, worldLine(w)), el('small', { class: 'dim' }, `Played ${ago(w.lastPlayed)}`)),
        el('div', { class: 'ac-world-btns' },
          btn('Play', () => { close(); openWorld(app, w.id); }, 'primary'),
          btn('Rename', () => renameSheet(w, draw)),
          btn('Delete', () => deleteSheet(w, draw), 'danger')))));
    };
    draw();
    m.append(list, btn('Close', close));
  });
}
function renameSheet(w, after) {
  sheet('Rename world', (m, close) => {
    const input = el('input', { type: 'text', value: w.name, maxlength: 40, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'World name' });
    const save = () => { const v = input.value.trim(); if (!v) { toast('Give it a name first.', 'bad'); return; } S.renameWorld(w.id, v); close(); after?.(); toast(`Renamed to ${v}.`, 'good'); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    m.append(el('label', { class: 'ac-field' }, el('span', {}, 'Name'), input), el('div', { class: 'ac-row end' }, btn('Cancel', close), btn('Save', save, 'primary')));
    setTimeout(() => { input.focus(); input.select(); }, 20);
  });
}
function deleteSheet(w, after) {
  const t = w.totals || S.worldTotals(w);
  sheet(`Delete ${w.name}?`, (m, close) => {
    m.append(el('p', { class: 'ac-text' }, t.cities ? `Its ${plural(t.cities, 'city', 'cities')} and ${plural(t.people, 'person', 'people')} are gone for good.` : 'This world is gone for good.'),
      el('div', { class: 'ac-row end' }, btn('Keep it', close, 'primary'), btn('Delete', () => { S.deleteWorld(w.id); close(); after?.(); toast(`${w.name} deleted.`); }, 'danger')));
  });
}

// ------------------------------------------------------------------ Settings sheet
export function openSettings(app) {
  boot(app);
  const s = app.settings;
  const changed = () => { S.saveSettings(s); app.onSettings?.(s); titleScene?.set({ light: s.effects === 'light', sky: s.weather !== false }); };
  sheet('Settings', (m, close) => {
    // one slider per sound layer; each saves as it moves (Volume = everything, then music / effects / ambience)
    const slider = (label, keyName, def, note) => {
      if (!Number.isFinite(+s[keyName])) s[keyName] = def;
      const out = el('output', {}, pct(s[keyName]));
      const input = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[keyName], 'aria-label': label, 'data-setting': keyName, oninput: e => { s[keyName] = +e.target.value; out.textContent = pct(s[keyName]); changed(); } });
      return el('label', { class: 'ac-field' }, el('span', {}, `${label} `, out), input, note ? el('small', { class: 'dim' }, note) : null);
    };
    const toggle = (label, keyName, note) => el('label', { class: 'ac-toggle' }, el('input', { type: 'checkbox', checked: s[keyName] || null, onchange: e => { s[keyName] = e.target.checked; changed(); } }), el('span', { class: 'ac-switch', 'aria-hidden': 'true' }), el('span', { class: 'ac-toggle-text' }, el('b', {}, label), note ? el('small', {}, note) : null));
    const seg = el('div', { class: 'ac-seg', role: 'group', 'aria-label': 'Effects' });
    const drawSeg = () => seg.replaceChildren(...[['full', 'Full', 'Every particle'], ['light', 'Light', 'For phones']].map(([v, label, sub]) => btn([el('b', {}, label), el('small', {}, sub)], () => { s.effects = v; changed(); drawSeg(); }, s.effects === v ? 'on' : '')));
    drawSeg();
    m.append(
      el('div', { class: 'ac-group' }, el('h3', {}, 'Sound'), slider('Volume', 'volume', 0.8), slider('Music', 'musicVol', 0.5), slider('Effects', 'sfxVol', 1, 'Turrets and blasts. They get quieter as you zoom out.'), slider('Ambience', 'ambVol', 0.7, 'The city and the wilds around it. Louder as you zoom out.'), toggle('Mute everything', 'muted')),
      el('div', { class: 'ac-group' }, el('h3', {}, 'Look'), el('div', { class: 'ac-field' }, el('span', {}, 'Effects'), seg), toggle('Weather and sky shows', 'weather', 'Rain, lightning, auroras, shooting stars'), toggle('Screen shake', 'shake', 'On big blasts')),
      el('div', { class: 'ac-group' }, el('h3', {}, 'Controls'), toggle('Edge scroll', 'edgeScroll', 'Move the view when the mouse touches the screen edge')),
      btn('Done', close, 'primary'));
  });
}

// ------------------------------------------------------------------ Report a bug
export function openReport(app) {
  boot(app);
  sheet('Report a bug', (m, close) => {
    const text = el('textarea', { rows: 5, placeholder: 'What went wrong, or what would you like? Plain words are perfect.', 'aria-label': 'Your report' });
    m.append(text, el('p', { class: 'ac-text dim' }, 'Your note, a picture of the screen and a few game details go to the developer.'),
      el('div', { class: 'ac-row end' }, btn('Cancel', close), btn('Send', () => {
        if (!text.value.trim()) { toast('Write a few words first.', 'bad'); return; }
        const rep = { at: new Date().toISOString(), text: text.value, state: safeState(), ua: navigator.userAgent, size: [innerWidth, innerHeight], build: app.build || BUILD, shot: screenshot() };
        close(); sendReport(rep);
      }, 'primary')));
    setTimeout(() => text.focus(), 30);
  });
}
function safeState() { try { return window.gameEye?.state?.() ?? screenState(); } catch { return screenState(); } }
/** A picture of the biggest canvas on screen (the city, the map or the title backdrop). */
function screenshot() {
  const cvs = [...document.querySelectorAll('canvas')].filter(c => c.width > 50 && c.getBoundingClientRect().width > 50).sort((a, b) => b.width * b.height - a.width * a.height);
  for (const c of cvs) { try { let s = c.toDataURL('image/jpeg', 0.5); if (s.length > 400000) s = c.toDataURL('image/jpeg', 0.3); return s.length > 400000 ? null : s; } catch { /* tainted or lost */ } }
  return null;
}
async function sendReport(rep) {
  const list = S.storage.getJSON('arcline.reports', []); list.push(rep); const out = [];
  for (const r of list) {
    let ok = false;
    for (const url of ['/api/report/arcline', '/api/inbox/arcline-report']) { try { const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) }); if (res.ok) { ok = true; break; } } catch { /* offline */ } }
    if (!ok) out.push(r);
  }
  if (out.length) S.storage.set('arcline.reports', JSON.stringify(out.slice(-10))); else S.storage.remove('arcline.reports');
  toast(out.length ? 'Saved — it will be sent when the game can reach the server.' : 'Thank you — report sent.', out.length ? '' : 'good');
}
export function openWhatsNew(app) { boot(app); app.news?.open(); }
export function openCredits(app) { boot(app); app.credits?.open(); }

// ================================================================== NEW WORLD
export function showNewWorld(app) {
  boot(app);
  const st = { seed: S.randomSeed(), size: 'medium', pressure: 'normal', difficulty: 'normal', name: '', named: false };
  st.name = S.planetName(st.seed);
  const cv = el('canvas', { class: 'ac-preview-cv', 'aria-label': 'Preview of the world' });
  const facts = el('div', { class: 'ac-facts' }), biomes = el('div', { class: 'ac-biomes' });
  const nameIn = el('input', { type: 'text', value: st.name, maxlength: 40, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Planet name', oninput: e => { st.name = e.target.value; st.named = true; } });
  const seedIn = el('input', { type: 'text', inputmode: 'numeric', value: st.seed, maxlength: 7, autocomplete: 'off', 'aria-label': 'Seed', oninput: e => { const v = e.target.value.replace(/\D/g, '').slice(0, 7); if (v !== e.target.value) e.target.value = v; if (+v > 0) { st.seed = +v; follow(); redraw(); } } });
  const follow = () => { if (!st.named) { st.name = S.planetName(st.seed); nameIn.value = st.name; } };
  const sizeSeg = el('div', { class: 'ac-seg three', role: 'group', 'aria-label': 'World size' });
  const presSeg = el('div', { class: 'ac-seg', role: 'group', 'aria-label': 'Creature pressure' });
  const diffSeg = el('div', { class: 'ac-seg', role: 'group', 'aria-label': 'Difficulty' });
  const drawSegs = () => {
    sizeSeg.replaceChildren(...S.WORLD_SIZES.map(z => btn([el('b', {}, z.label), el('small', {}, `${z.cells} × ${z.cells} cells`)], () => { st.size = z.id; drawSegs(); redraw(); }, st.size === z.id ? 'on' : '')));
    presSeg.replaceChildren(...S.PRESSURES.map(p => btn([el('b', {}, p.label), el('small', {}, `Attacks ×${fmt(p.value)}`)], () => { st.pressure = p.id; drawSegs(); }, st.pressure === p.id ? 'on' : '', { 'data-tip': p.note })));
    diffSeg.replaceChildren(...S.DIFFICULTIES.map(d => btn([el('b', {}, d.label), el('small', {}, `${fmt(d.money)} credits`)], () => { st.difficulty = d.id; drawSegs(); }, st.difficulty === d.id ? 'on' : '', { 'data-tip': d.note })));
  };
  drawSegs();
  const create = () => {
    const name = nameIn.value.trim() || S.planetName(st.seed);
    const ws = S.newWorldSave({ name, seed: st.seed, cells: S.WORLD_SIZES.find(z => z.id === st.size).cells, pressure: S.PRESSURES.find(p => p.id === st.pressure).value, difficulty: st.difficulty });
    if (!ws.ok) toast('This browser would not save it. You can play, but the world will not be kept.', 'bad');
    showWorldMap(app, ws, { fresh: true });
  };
  const root = el('section', { class: 'ac-screen ac-new panel-full' },
    el('header', { class: 'ac-head' },
      btn([el('span', { 'aria-hidden': 'true' }, '‹'), ' Back', kbd('Esc')], () => showTitle(app), 'ac-back'),
      el('h2', {}, 'New world')),
    el('div', { class: 'ac-new-body' },
      el('div', { class: 'ac-new-preview' }, el('div', { class: 'ac-preview-frame' }, cv), facts, biomes),
      el('div', { class: 'ac-new-form' },
        el('label', { class: 'ac-field' }, el('span', {}, 'Planet name'), el('div', { class: 'ac-inline' }, nameIn, btn('New name', () => { st.named = false; st.name = S.planetName(S.randomSeed()); nameIn.value = st.name; st.named = true; }, 'ac-mini'))),
        el('label', { class: 'ac-field' }, el('span', {}, 'Seed'), el('div', { class: 'ac-inline' }, seedIn, btn('Reroll', () => { st.seed = S.randomSeed(); seedIn.value = st.seed; follow(); redraw(); }, 'ac-mini'))),
        el('div', { class: 'ac-field' }, el('span', {}, 'World size'), sizeSeg),
        el('div', { class: 'ac-field' }, el('span', {}, 'Difficulty'), diffSeg),
        el('div', { class: 'ac-field' }, el('span', {}, 'Creature pressure'), presSeg),
        btn([el('b', {}, 'Create world'), kbd('Enter')], create, 'ac-big primary ac-create'))));

  let view = null, timer = 0, ro = null;
  const redraw = () => { clearTimeout(timer); timer = setTimeout(paint, 90); };
  function paint() {
    if (cur?.node !== root) return;
    const cells = S.WORLD_SIZES.find(z => z.id === st.size).cells;
    const world = generateWorld({ seed: st.seed, cells });
    view = new WorldView(cv, world, { ppc: 8, labels: false, cities: false });
    size(); view.draw(0);
    const f = worldFacts(world, view.land);
    facts.replaceChildren(...[['Regions', fmt(f.regions)], ['Large', fmt(f.large)], ['Medium', fmt(f.medium)], ['Small', fmt(f.small)], ['Sea', pct(f.sea)]].map(([k, v]) => el('span', { class: 'ac-fact' }, el('small', {}, k), el('b', {}, v))));
    biomes.replaceChildren(...f.biomes.filter(b => b.share >= 0.01).map(b => el('span', { class: 'ac-biome' }, el('i', { style: `background:${BIOMES[b.id].ground}` }), BIOMES[b.id].name, el('b', {}, pct(b.share)))));
  }
  const size = () => { if (!view) return; const r = cv.getBoundingClientRect(); view.resize(r.width, r.height, Math.min(2, devicePixelRatio || 1)); view.fit({ x: 0, y: 0, w: r.width, h: r.height }, 6); };
  mount(app, 'new', root, {
    back: () => { showTitle(app); return true; },
    key: e => { if (e.key === 'Enter') { e.preventDefault(); create(); } },
    destroy: () => { clearTimeout(timer); ro?.disconnect(); },
    state: () => ({ seed: st.seed, size: st.size, pressure: st.pressure, difficulty: st.difficulty, name: nameIn.value }),
  });
  ro = new ResizeObserver(() => { size(); view?.draw(0); }); ro.observe(cv);
  paint();
}

// ================================================================== WORLD MAP
/** The world map for a save { meta, world, regions } (from S.loadWorld or S.newWorldSave). opts: { fresh, focus: regionId to pick } */
export function showWorldMap(app, ws, { fresh = false, focus = null } = {}) {
  boot(app);
  const { meta, world } = ws;
  for (const r of world.regions) if (r.city === undefined || r.city === null) r.city = meta.regions?.[r.id] || null;
  S.touchWorld(meta.id);
  const cv = el('canvas', { class: 'ac-map-cv', 'aria-label': `Map of ${meta.name}` });
  const totals = el('div', { class: 'ac-totals' });
  const card = el('aside', { class: 'ac-card hidden', 'aria-label': 'Region' });
  const nameH = el('h2', {}, meta.name);
  const root = el('section', { class: 'ac-screen ac-map panel-full' },
    cv,
    el('header', { class: 'ac-mapbar' },
      btn([el('span', { 'aria-hidden': 'true' }, '‹'), el('span', { class: 'ac-hide-xs' }, ' Title')], () => showTitle(app), 'ac-back', { 'aria-label': 'Back to the title', 'data-tip': 'Back to the title (Esc)' }),
      el('div', { class: 'ac-mapname' }, nameH, el('small', {}, `${S.sizeOf(meta.cells).label} world · ${S.pressureOf(meta.pressure ?? 1).label} wildlife`)),
      btn('Cities', () => citiesSheet(), 'ac-chip'),
      btn('☰', () => mapMenu(), 'ac-icon', { 'aria-label': 'Menu', 'data-tip': 'Menu' })),
    totals,
    el('div', { class: 'ac-zoom' },
      btn('+', () => zoomBtn(1.35), 'ac-icon ac-pm', { 'aria-label': 'Zoom in', 'data-tip': 'Zoom in (+)' }),
      btn('−', () => zoomBtn(1 / 1.35), 'ac-icon ac-pm', { 'aria-label': 'Zoom out', 'data-tip': 'Zoom out (−)' }),
      btn('Fit', () => { view.fit(fitArea()); }, 'ac-icon ac-fit', { 'aria-label': 'Show the whole world', 'data-tip': 'Show the whole world (F)' }),
      btn('Key', () => keySheet(), 'ac-icon ac-fit', { 'aria-label': 'Map key', 'data-tip': 'What the colours mean' })),
    card);

  const view = new WorldView(cv, world, { ppc: world.cells > 14 ? 16 : 20 });
  let raf = 0, sel = null, dirtyFit = true;
  const order = [...world.regions].sort((a, b) => (a.cz + a.span / 2) + (a.cx + a.span / 2) - ((b.cz + b.span / 2) + (b.cx + b.span / 2)) || (a.cx - a.cz) - (b.cx - b.cz));

  // the part of the canvas not under the bars or the card
  function visibleArea() {
    const W = root.clientWidth, H = root.clientHeight;
    const top = Math.max(totals.getBoundingClientRect().bottom, root.querySelector('.ac-mapbar').getBoundingClientRect().bottom) - root.getBoundingClientRect().top + 6;
    const cardR = card.classList.contains('hidden') ? null : card.getBoundingClientRect();
    if (isPhone()) return { x: 0, y: top, w: W, h: Math.max(120, (cardR ? cardR.top - root.getBoundingClientRect().top : H) - top) };
    return { x: 0, y: top, w: W - (cardR ? cardR.width + 28 : 0), h: H - top - 12 };
  }
  function fitArea() {
    const W = root.clientWidth, H = root.clientHeight, a = visibleArea();
    if (isPhone()) return { x: 0, y: a.y, w: W, h: Math.max(160, H * 0.5 - a.y + 40) };
    return { x: 0, y: a.y, w: W - Math.min(380, W * 0.36) - 12, h: H - a.y - 12 };
  }
  function resize() {
    const r = root.getBoundingClientRect();
    view.resize(r.width, r.height, Math.min(2, devicePixelRatio || 1));
    if (dirtyFit) { view.fit(fitArea()); dirtyFit = false; } else view.area = visibleArea();
  }
  const zoomBtn = f => { const a = visibleArea(); view.zoomAt(f, a.x + a.w / 2, a.y + a.h / 2); };

  function drawTotals() {
    const t = S.worldTotals(meta);
    totals.replaceChildren(...[['Cities', fmt(t.cities)], ['People', fmt(t.people)], ['Regions', fmt(world.regions.length)]].map(([k, v]) => el('span', { class: k === 'Regions' ? 'ac-fact ac-hide-xs' : 'ac-fact' }, el('small', {}, k), el('b', {}, v))));
  }
  const peopleText = r => `${plural(r.city?.population || 0, 'person', 'people')}`;

  // ---------- selection + card
  function select(r, { centre = false } = {}) {
    sel = r; view.sel = r;
    if (!r) { card.classList.add('hidden'); return; }
    drawCard(r);
    card.classList.remove('hidden');
    requestAnimationFrame(() => { const a = visibleArea(); view.area = a; if (centre || !view.isVisible(r, a, 40)) view.centreOn(r, a); });
  }
  function suggested() {
    if (world.regions.some(r => r.city?.founded)) return null;
    let best = null, score = -1e9;
    for (const r of world.regions) {
      const d = r.deposits, s = r.land * 2 + (r.span === 2 ? 1 : r.span === 1 ? 0.55 : 0.3) + (r.river ? 0.3 : 0) + (r.coast ? 0.15 : 0) - (r.nests / (r.span * r.span * 3)) * 0.6 + (d.metal + d.stone + d.crystal) * 0.25;
      if (r.land > 0.55 && s > score) { score = s; best = r; }
    }
    return best;
  }
  const hint = suggested();
  function drawCard(r) {
    const B = BIOMES[r.biome], c = r.city?.founded ? r.city : null;
    const sizeLabel = { 1: 'Small', 2: 'Medium', 4: 'Large' }[r.span] || 'Region';
    const fact = (k, v, tip) => el('div', { class: 'ac-kv', 'data-tip': tip || null }, el('dt', {}, k), el('dd', {}, v));
    const bar = (k, label) => { const v = r.deposits[k] || 0, word = v >= 0.6 ? 'Rich' : v >= 0.3 ? 'Fair' : 'Poor'; return el('div', { class: `ac-dep ${k}`, 'data-tip': `${label}: ${pct(v)} of the best a region can hold` }, el('span', { class: 'ac-dep-name' }, label), el('span', { class: 'ac-dep-bar' }, el('i', { style: `width:${Math.round(v * 100)}%` })), el('span', { class: 'ac-dep-val' }, `${word} · ${pct(v)}`)); };
    const ms = milestones().filter(Number.isFinite);
    let status;
    if (c) {
      const next = ms[c.milestone];
      const away = awayLines(app, ws, r);
      status = el('div', { class: 'ac-city' },
        el('div', { class: 'ac-badge city' }, 'Your city'),
        el('dl', { class: 'ac-kvs' },
          fact('People', fmt(c.population || 0)),
          fact('Credits', fmt(Math.round(c.money || 0))),
          fact('Milestone', ms.length ? `${fmt(c.milestone || 0)} of ${fmt(ms.length)}` : fmt(c.milestone || 0), next ? `Next milestone at ${fmt(next)} people` : null),
          fact('Day', fmt(c.day || 0)),
          fact('Played', ago(c.lastPlayed))),
        away.length ? el('div', { class: 'ac-away' }, el('h4', {}, away.estimate ? 'While you are away' : 'While you were away'), ...away.map(t => el('p', {}, t))) : null);
    } else {
      status = el('div', { class: 'ac-badges' }, el('span', { class: 'ac-badge' }, 'Unclaimed'), r === hint ? el('span', { class: 'ac-badge hint', 'data-tip': 'Lots of land, a river or coast, few nests' }, 'Good first city') : null);
    }
    const go = () => { const id = r.id; leaveScreens(); app.playRegion(ws, id); };
    card.replaceChildren(
      el('div', { class: 'ac-card-head', style: `--biome:${B.ground}` },
        el('div', { class: 'ac-card-title' }, el('h3', {}, c?.name || r.name), el('small', {}, `${sizeLabel} region · ${fmt(r.size)} × ${fmt(r.size)} tiles`)),
        el('div', { class: 'ac-card-nav' },
          btn('‹', () => step(-1), 'ac-icon', { 'aria-label': 'Previous region' }),
          btn('›', () => step(1), 'ac-icon', { 'aria-label': 'Next region' }),
          btn('×', () => select(null), 'ac-icon', { 'aria-label': 'Close' }))),
      el('div', { class: 'ac-card-foot' }, btn([el('b', {}, c ? `Play ${c.name || r.name}` : 'Found a city here'), kbd('Enter')], go, 'ac-big primary')),
      el('div', { class: 'ac-card-body' },
        status,
        el('dl', { class: 'ac-kvs' },
          fact('Ground', B.name),
          fact('Land', pct(r.land), `${pct(1 - r.land)} of it is sea`),
          fact('Coast', r.coast ? 'Yes' : 'No'),
          fact('River', r.river ? 'Yes' : 'No', r.river ? 'Bridges over it make good choke points' : null),
          fact('Nests', fmt(r.nests), 'Wildlife nests in the region at the start')),
        el('div', { class: 'ac-deps' }, el('h4', {}, 'In the ground'), ...DEP.map(([k, l]) => bar(k, l))),
        neighbourSection(r)));
  }
  // the region's neighbours: how each city links and what it gives (the same list as Statistics › Neighbours). Links
  // come from linkKind — the rule the map's lines are drawn by — so the card and the map always agree.
  function neighbourSection(r) {
    const links = []; for (const o of neighbours(world, r)) { const by = r.city?.founded ? linkKind(world, r, o) : null; if (by) links.push({ id: o.id, by }); }
    const rep = linkReport(world, r, links);
    if (!rep.rows.some(x => x.city) && !r.city?.founded) return null;
    return el('div', { class: 'ac-nbs' }, el('h4', {}, r.city?.founded ? 'Neighbours and links' : 'Cities next door'), neighbourList(rep, { compact: true }));
  }
  function step(d) { const i = order.indexOf(sel); select(order[(i + d + order.length) % order.length], { centre: true }); }
  function moveSel(dx, dy) {
    if (!sel) { select(order.find(r => r.city?.founded) || hint || order[0], { centre: true }); return; }
    const a = view.centre(sel); let best = null, score = Infinity;
    for (const r of world.regions) {
      if (r === sel) continue; const b = view.centre(r), along = (b.x - a.x) * dx + (b.y - a.y) * dy, side = Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx);
      if (along <= 2) continue; const s = along + side * 2; if (s < score) { score = s; best = r; }
    }
    if (best) select(best);
  }

  // ---------- sheets on the map
  function citiesSheet() {
    sheet('Your cities', (m, close) => {
      const list = world.regions.filter(r => r.city?.founded).sort((a, b) => (b.city.lastPlayed || 0) - (a.city.lastPlayed || 0));
      if (!list.length) m.append(el('p', { class: 'ac-text dim' }, 'No cities yet. Pick a region and found one.'));
      for (const r of list) m.append(el('div', { class: 'ac-world-row' },
        el('div', { class: 'ac-world-text' }, el('b', {}, r.city.name || r.name), el('small', {}, `${peopleText(r)} · Day ${fmt(r.city.day || 0)}`), el('small', { class: 'dim' }, `Played ${ago(r.city.lastPlayed)}`)),
        el('div', { class: 'ac-world-btns' }, btn('Show', () => { close(); select(r, { centre: true }); }), btn('Play', () => { close(); leaveScreens(); app.playRegion(ws, r.id); }, 'primary'))));
      m.append(btn('Close', close));
    });
  }
  function keySheet() {
    sheet('Map key', (m, close) => {
      const row = (sw, label) => el('div', { class: 'ac-key-row' }, sw, el('span', {}, label));
      const sq = (bg, extra = '') => el('i', { class: `ac-sw ${extra}`, style: `background:${bg}` });
      m.append(el('div', { class: 'ac-key' },
        ...Object.values(BIOMES).map(b => row(sq(b.ground), b.name)),
        row(sq('#14507a'), 'Sea'), row(sq('#d9c99c'), 'Coast'), row(sq('#53c8f2'), 'River'),
        row(sq('transparent', 'city'), 'Your city'), row(sq('transparent', 'link'), 'Road link between your cities'), row(sq('transparent', 'link transit'), 'Transit link (a road too: both lines)'), row(sq('transparent', 'sel'), 'Picked region')),
      btn('Close', close, 'primary'));
    });
  }
  function mapMenu() {
    sheet('Menu', (m, close) => {
      const add = (label, fn, cls = '') => m.append(btn(label, () => { close(); fn(); }, cls));
      add('Back to the map', () => {}, 'primary');
      add('Settings', () => openSettings(app));
      add("What's new", () => openWhatsNew(app));
      add('Report a bug', () => openReport(app));
      add('Credits', () => openCredits(app));
      add('Load another world', () => openLoadWorlds(app));
      add('Title screen', () => showTitle(app));
    });
  }

  // ---------- input: drag to pan, wheel / pinch to zoom, tap to pick
  const pts = new Map(); let drag = null, pinch = null;
  const local = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' && pts.size === 0) pts.clear();
    cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, local(e));
    if (pts.size === 1) drag = { ...local(e), moved: 0 };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null; }
  });
  cv.addEventListener('pointermove', e => {
    const p = local(e);
    if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') { view.hover = view.pick(p.x, p.y); cv.style.cursor = view.hover ? 'pointer' : 'grab'; } return; }
    pts.set(e.pointerId, p);
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      view.panBy(mx - pinch.mx, my - pinch.my); view.zoomAt(d / Math.max(1, pinch.d), mx, my); pinch = { d, mx, my };
    } else if (drag) {
      const dx = p.x - drag.x, dy = p.y - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 6) { view.panBy(dx, dy); cv.style.cursor = 'grabbing'; }
      drag.x = p.x; drag.y = p.y;
    }
  });
  const up = e => {
    const p = local(e);
    if (drag && drag.moved <= 6 && pts.size === 1) { const r = view.pick(p.x, p.y); select(r); }
    pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) drag = null;
    cv.style.cursor = '';
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); pinch = null; drag = null; });
  cv.addEventListener('pointerleave', () => { if (!pts.size) view.hover = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); view.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y); }, { passive: false });

  const frame = now => { raf = requestAnimationFrame(frame); if (!app.root.inert) view.draw(now / 1000, { peopleText }); };   // paused under a sheet
  const ro = new ResizeObserver(() => resize());
  mount(app, 'map', root, {
    back: () => { if (sel && isPhone()) { select(null); return true; } showTitle(app); return true; },
    key: e => {
      const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (dirs[e.key]) { e.preventDefault(); moveSel(...dirs[e.key]); }
      else if (e.key === 'Enter' && sel) { e.preventDefault(); card.querySelector('.ac-card-foot button')?.click(); }
      else if (e.key === '+' || e.key === '=') zoomBtn(1.35);
      else if (e.key === '-' || e.key === '_') zoomBtn(1 / 1.35);
      else if (e.key === 'f' || e.key === 'F') view.fit(fitArea());
    },
    destroy: () => { cancelAnimationFrame(raf); ro.disconnect(); },
    state: () => ({ world: { id: meta.id, name: meta.name, cells: meta.cells, regions: world.regions.length, cities: S.worldTotals(meta).cities }, selected: sel ? { id: sel.id, name: sel.name, founded: !!sel.city?.founded } : null, zoom: +(view.s / view.fitS).toFixed(2) }),
  });
  drawTotals();
  ro.observe(root);
  resize();
  const first = focus != null ? world.regions.find(r => r.id === focus) : (world.regions.filter(r => r.city?.founded).sort((a, b) => (b.city.lastPlayed || 0) - (a.city.lastPlayed || 0))[0] || hint);
  if (first) select(first);
  raf = requestAnimationFrame(frame);
}
function awayLines(app, ws, r) {
  let v = null;
  try { v = app.awaySummary?.(ws, r.id); } catch (e) { console.info('[arcline] awaySummary failed', e?.message); }
  if (typeof v === 'string' && v.trim()) return [v];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  const rate = r.city?.rates?.money;
  const out = Number.isFinite(rate) && Math.abs(rate) >= 1 ? [`Earns about ${sign(Math.round(rate), { decimals: 0 })} credits a day.`] : [];
  out.estimate = true; return out;
}
