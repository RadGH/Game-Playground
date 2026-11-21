// Wyrmroad: the page. Loads the data, the save, the 3D view (js/render, render helper), the inputs and the sound, then
// runs one frame loop and routes between screens (js/ui/*). Every screen is its own module; this file only wires them.
//
//   app.go('title' | 'heroes' | 'creator' | 'map' | 'story' | 'join' | 'play' | 'results', opts)
//   app.loop = fn(dt)          the active screen's per-frame work (the play screen runs the session here)
//   window.gameEye.state()      what Claude's game-eye tool reads (screen, chapter, section, heroes, foes, props)
import { loadTuning, tunePanel } from '../../../shared/tune.js';
import { installTooltips } from '../../../shared/tooltip.js';
import { createWhatsNew } from '../../../shared/whats-new.js';
import { createCredits } from '../../../shared/credits.js';
import { accountButton, openSignIn } from '../../../shared/rgs-signin.js';
import { account } from '../../../shared/rgs-account.js';
import { dressedLook } from './sim/items.js';
import { createBrawl, step } from './sim/brawl.js';
import { mergeActs } from './sim/route.js';
import { loadSave, writeSave, loadSettings, writeSettings, SAVE_KEY, describeSaves } from './save.js';
import { createInput } from './input/devices.js';
import { setKeyboardLayout } from './input/bindings.js';
import { installCursor } from './input/cursor.js';
import { installPadNav } from './ui/padnav.js';
import { closeAllSheets, anySheet, note } from './ui/kit.js';
import * as audio from './audio.js';
import { titleScreen } from './ui/title.js';
import { heroesScreen } from './ui/heroes.js';
import { creatorScreen } from './ui/creator.js';
import { mapScreen } from './ui/map.js';
import { storyScreen } from './ui/story.js';
import { joinScreen } from './ui/join.js';
import { playScreen } from './ui/play.js';
import { resultsScreen } from './ui/results.js';
import { openMenu } from './ui/menu.js';

const BUILD = '2026-11-20';
const SCREENS = { title: titleScreen, heroes: heroesScreen, creator: creatorScreen, map: mapScreen, story: storyScreen, join: joinScreen, play: playScreen, results: resultsScreen };
const ui = document.getElementById('ui');
const canvas = document.getElementById('view');
const loading = document.getElementById('loading');
const say = t => { const p = loading?.querySelector('p'); if (p) p.textContent = t; };

const app = {
  build: BUILD, ui, canvas, data: null, T: null, save: null, settings: loadSettings(), input: createInput(), view: null, render: null,
  screen: 'loading', screenOpts: null, loop: null, cleanup: null, session: null, party: [], audio,
  go, saveNow, hero, heroLook, portrait, openMenu: (o) => openMenu(app, o), closeAllSheets, note,
  showcase, viewBox, signIn: () => openSignIn({ game: 'wyrmroad', gameName: 'Wyrmroad' }), user: null, noSave: false,
};
window.app = app;

// ------------------------------------------------------------------ boot
boot().catch(e => { console.error(e); say('Something went wrong while loading. Reload the page to try again.'); });

async function boot() {
  installTooltips();
  say('Loading the road…');
  const json = n => fetch(`data/${n}.json`).then(r => { if (!r.ok) throw new Error(`data/${n}.json ${r.status}`); return r.json(); });
  const [classes, enemies, chapters, items, story, acts, storyActs] = await Promise.all(['classes', 'enemies', 'chapters', 'items', 'story', 'acts', 'story-acts'].map(json));
  app.data = mergeActs({ classes, enemies, chapters, items, story, acts, storyActs });   // Acts II/III join the chapter list + story (js/sim/route.js)
  app.T = await loadTuning('data/tuning.json', { game: 'wyrmroad' });
  tunePanel({ game: 'wyrmroad', tuning: app.T });
  app.save = loadSave(app.data);
  app.whatsNew = createWhatsNew({ url: 'data/changelog.json', key: 'wyrmroad' });
  app.whatsNew.ensure();
  app.credits = createCredits({ game: 'wyrmroad', made: 'Wyrmroad is made by Radley Sustaire with Claude.' });
  app.pad = installPadNav({ busy: () => app.screen === 'play' || app.screen === 'join' || app.padBusy });
  audio.setVolume(app.settings.volume);
  setKeyboardLayout(app.settings.keys);
  app.cursor = installCursor(app);
  const wake = () => audio.initAudio();
  addEventListener('pointerdown', wake, { capture: true }); addEventListener('keydown', wake, { capture: true });

  say('Setting the stage…');
  app.render = await import('./render/view.js').catch(e => { console.warn('[wyrmroad] the 3D view is not ready', e?.message); return null; });
  app.view = app.render ? await app.render.createView({ canvas, data: app.data, quality: app.settings.quality, T: app.T }) : stubView();
  applyViewOptions();
  addEventListener('resize', () => app.view.resize());
  account.onChange?.(u => { app.user = u || null; document.querySelectorAll('[data-acct-name]').forEach(n => { n.textContent = u ? (u.username || 'Account') : 'Sign in'; }); });
  try { app.user = await account.user?.(); } catch { app.user = null; }
  startCloud();
  loading?.classList.add('hidden');
  requestAnimationFrame(frame);
  const code = new URLSearchParams(location.search).get('code');
  if (code) { go('title'); openOnline(); } else go('title');
}

/** Graphics/shake/damage-number settings the renderer reads (it owns the drawing; we only say what the player chose). */
export function applyViewOptions() {
  app.view.options = { shake: !!app.settings.shake, damageNumbers: !!app.settings.damageNumbers, quality: app.settings.quality };
}
app.applyViewOptions = applyViewOptions;
app.setSetting = (k, v) => { app.settings[k] = v; writeSettings(app.settings); if (k === 'volume') audio.setVolume(v); if (k === 'keys') { setKeyboardLayout(v); app.hud?.keys?.(); } applyViewOptions(); };

function stubView() {
  // only while the 3D view is missing (it is built by another part of the team): screens still work, nothing is drawn
  return { stub: true, options: {}, setChapter: async () => {}, update() {}, handle() {}, project: () => ({ x: -1, y: -1, visible: false }), setLocalPids() {}, resize() {}, dispose() {}, scenic() {} };
}

// ------------------------------------------------------------------ screens
function go(name, opts = {}) {
  const fn = SCREENS[name]; if (!fn) throw new Error(`no screen ${name}`);
  closeAllSheets();
  try { app.cleanup?.(); } catch (e) { console.error(e); }
  app.cleanup = null; app.loop = null; app.padBusy = false;
  app.screen = name; app.screenOpts = opts;
  document.documentElement.dataset.screen = name;
  ui.replaceChildren(); ui.scrollTop = 0;
  viewBox(null);
  app.cleanup = fn(app, opts) || null;
}

/** Put the 3D view in this element's box (the play stage), or full screen (null). */
function viewBox(el) {
  app._viewEl = el;
  placeView();
}
function placeView() {
  const el = app._viewEl;
  const r = el ? el.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  const s = canvas.style, px = v => `${Math.round(v)}px`;
  const want = [px(r.left), px(r.top), px(r.width), px(r.height)];
  if (s.left !== want[0] || s.top !== want[1] || s.width !== want[2] || s.height !== want[3]) {
    s.left = want[0]; s.top = want[1]; s.width = want[2]; s.height = want[3];
    app.view?.resize();
  }
}
new ResizeObserver(() => placeView()).observe(document.documentElement);

function saveNow(stamp = true) { if (app.noSave) return; writeSave(app.save, stamp); app.cloud?.saveSoon?.(); }
function hero(id) { return app.save?.heroes.find(h => h.id === id) || null; }
function heroLook(h) { return dressedLook(app.data.classes, app.data.items, { cls: h.cls, look: h.look, gear: h.gear }); }

const portraits = new Map();
/** A portrait drawn from the 3D model ({ look } or { creature }); cached by its look. Resolves null when no view yet. */
function portrait(spec, size = 128) {
  const key = JSON.stringify([spec, size]);
  if (!portraits.has(key)) portraits.set(key, app.render?.renderPortrait ? app.render.renderPortrait(spec, { size }).catch(e => { console.warn('[wyrmroad] portrait', e?.message); return null; }) : Promise.resolve(null));
  return portraits.get(key);
}

// The title's line-up: a real (never stepped by players) brawl of up to four heroes standing on the village street.
let show = null;
function showcase(heroes) {
  if (!heroes) { show = null; return; }
  const G = createBrawl({ data: app.data, T: app.T, chapter: 'millbrook', heroes: heroes.map((h, i) => ({ pid: 's' + i, name: h.name, cls: h.cls, level: h.level, gear: h.gear, look: heroLook(h) })), seed: 3, ally: false });
  const n = G.heroes.length;
  const off = innerWidth > 720 ? Math.min(4, innerWidth / innerHeight * 1.6) : 0;   // desktop: the line-up stands right of the menu
  G.heroes.forEach((e, i) => { e.x = G.camX + off + (i - (n - 1) / 2) * 1.7; e.z = innerWidth > 720 ? 0.6 - (i % 2) * 0.9 : -1.8 - (i % 2) * 0.6;   /* phone: far side of the street, above the menu */ e.dir = i < n / 2 ? 1 : -1; e.px = e.x; e.py = e.y; e.pz = e.z; });
  G.props = [];
  show = G;
  app.view.setChapter('millbrook');
  app.view.scenic(false);
}

// ------------------------------------------------------------------ the frame loop
let lastT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (t - (lastT || t)) / 1000)); lastT = t; app.frames = (app.frames || 0) + 1;
  if (app.loop) { try { app.loop(dt); } catch (e) { console.error(e); app.loop = null; } }
  else if (show) {
    // the line-up breathes: idle animations only, nobody moves
    for (const e of show.heroes) { e.px = e.x; e.py = e.y; e.pz = e.z; }
    show.t += dt;
    try { app.view.update(show, 1, dt); } catch (e) { console.error(e); show = null; }
  } else if (app.view) {
    try { app.view.update(sceneG(), 1, dt); } catch (e) { console.error(e); }
  }
}

// an empty street for scenic screens (map, creator, story): no actors, the renderer pans by itself
let scene = null;
function sceneG(chapterId = null) {
  const ch = app.data.chapters.chapters.find(c => c.id === chapterId) || scene?.ch || app.data.chapters.chapters[0];
  if (!scene || scene.ch !== ch) scene = { t: 0, camX: 8, phase: 'walk', secI: 0, ch, heroes: [], foes: [], props: [], shots: [], zones: [], quakeT: 0, over: false, outcome: null, events: [] };
  scene.t += 1 / 60;
  return scene;
}
app.sceneG = sceneG;

// ------------------------------------------------------------------ online hand-off (js/ui/online.js, net helper)
export async function openOnline() {
  const mod = await import('./ui/online.js').catch(e => { console.warn('[wyrmroad] online co-op is not ready', e?.message); return null; });
  if (!mod?.openOnline) { note('Online co-op is being set up. Try local co-op for now.'); return; }
  mod.openOnline({
    app, data: app.data, T: app.T, save: app.save, input: app.input, view: app.view,
    hero: hero(app.save.lastHero) || app.save.heroes[0] || null,
    // the net helper hands back a running session: run it with the same play loop and HUD as a local chapter
    play: (session, meta = {}) => go('play', { session, online: true, chapter: session.chapter || meta.chapter, heroId: meta.heroId || app.save.lastHero }),
    back: () => go('title'),
  });
}
app.openOnline = openOnline;

// ------------------------------------------------------------------ cloud saves + the conflict kit (game-standards §3)
function startCloud() {
  import('../../../shared/rgs-cloudsave.js').then(({ cloudSave }) => {
    app.cloud = cloudSave({
      game: 'wyrmroad', keys: { save: SAVE_KEY }, describe: v => describeSaves(v, app.data),
      canRestore: () => app.screen !== 'play',
      onRestore: () => { app.noSave = true; location.reload(); },
    });
  }).catch(e => console.info('[wyrmroad] cloud saves unavailable', e?.message));
}
let hiddenAt = 0;
addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); if (app.screen !== 'play') saveNow(false); return; }
  if (hiddenAt && Date.now() - hiddenAt > 60e3) checkStale();
});
setInterval(() => { if (!document.hidden) checkStale(); }, 5 * 60e3);
/** A tab left open is a stale copy: if another device saved since, stop saving and ask (lessons rule 8). */
async function checkStale() {
  if (app.staleAsked || !app.cloud?.peek) return;
  const p = await app.cloud.peek().catch(() => null);
  if (!p?.newer || p.sameDevice) return;
  app.staleAsked = true; app.noSave = true;
  const wasPaused = app.session?.paused; app.session?.pause?.();
  const { ask } = await import('../../../shared/dialog.js');
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(p.at)) / 60e3));
  const load = await ask({ title: 'A newer save is in your account',
    text: `Your heroes were saved from ${p.device} ${mins < 90 ? `${mins} min` : `${Math.round(mins / 60)} h`} ago, after this tab last checked. Load the newer copy? (This tab's heroes are kept as a backup.)`,
    ok: 'Load the newer copy', cancel: 'Keep playing this tab' });
  if (load) { await app.cloud.pull(); return; }
  app.noSave = false; app.staleAsked = false; if (!wasPaused && app.screen === 'play' && !anySheet()) app.session?.resume?.();
}
app.checkStale = checkStale;

// ------------------------------------------------------------------ game-eye (Claude's own tool) + debug state
window.gameEye = {
  state() {
    const s = app.session, G = s?.G;
    return {
      screen: app.screen, sheet: document.querySelector('.wr-sheet h2')?.textContent || null, build: BUILD,
      hero: hero(app.save?.lastHero)?.name || null, heroes: app.save?.heroes.length || 0,
      chapter: G?.ch?.id || app.screenOpts?.chapter || null, section: G?.secI ?? null, phase: G?.phase || null, over: G?.over || false, outcome: G?.outcome || null,
      paused: s?.paused || false, online: !!s?.online,
      players: G ? G.heroes.map(h => ({ pid: h.pid, name: h.name, cls: h.cls, hp: Math.round(h.hp), max: h.max, mp: Math.round(h.mp), state: h.state, x: +h.x.toFixed(2), z: +h.z.toFixed(2), lives: h.lives, level: h.level, ctrl: h.ctrl })) : [],
      foes: G ? G.foes.filter(f => f.team === 1 && f.state !== 'dead').length : 0,
      kinds: G ? [...new Set(G.foes.filter(f => f.team === 1 && f.state !== 'dead').map(f => f.kind))] : [],
      props: G ? G.props.map(p => p.type) : [], camX: G ? +G.camX.toFixed(2) : null, view: app.view?.stub ? 'missing' : 'ready',
      device: app.input.last,
    };
  },
  app,
  // test helpers (the screen walk + the tour use them to reach the results and lost screens quickly)
  test: {
    win() { const G = app.session?.G; if (!G) return; G.secI = G.ch.sections.length - 1; G.phase = 'fight'; G.waveI = G.ch.sections[G.secI].waves.length; G.foes = G.foes.filter(f => f.team === 0); },
    boss() { const G = app.session?.G; if (!G) return; const k = G.ch.sections.findIndex(s => s.boss); G.secI = k; G.phase = 'walk'; G.foes = G.foes.filter(f => f.team === 0); const at = G.ch.sections[k].at; G.camX = at - 4; for (const h of G.heroes) { h.x = h.px = at - 3; } },
    lose() { const G = app.session?.G; if (!G) return; for (const h of G.heroes) { h.state = 'gone'; h.lives = 0; } },
  },
};
