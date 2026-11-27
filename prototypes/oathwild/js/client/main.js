// Oathwild — the page: loads the rules and the world (the same pure code the server runs), then shows the screens.
//
// THE APP CONTRACT (every screen and window reads and writes through `app`; window.app in the browser):
//   app.rules  rules engine (js/rules)          app.W { data, terrain, book } (js/world)   app.art data/art.json
//   app.scattered / app.ground                  trees + decor, and the walk check (js/game/ground.js)
//   app.net    the server line (net.js): app.net.send / app.net.request / app.act(a, fields)
//   app.me     { char, sheet, pending, flags, speed, home } — my character as the server last sent it ('me')
//   app.ws     the world's shared state ('wstate'): { flags, my, quests, shrines, found, camps, players, esc }
//   app.world  { code, name } of the world I am in (or null)
//   app.settings (persisted per device) · app.saveSettings() · app.bindings / app.input / app.device
//   app.go(screen, opts)  'title' | 'chars' | 'creator' | 'worlds' | 'play'  (js/client/screens/<name>.js show(app, opts))
//   app.openWindow(name, opts) → a window from js/client/ui/win-<name>.js open(app, opts) (bag, sheet, levelup, classes,
//                         talents, spellbook, quests, trade, map, loot, talk, shop, trainer, stable, respec, travel, repair,
//                         locked, shrine, menu, settings, report, death …)
//   app.on(type, fn)      server messages and app events ('me', 'wstate', 'win', 'say', 'err', 'enter', 'leveled', 'units')
//   app.itemRef(ref)      'bag:<id>' | 'gear:<slot>' | 'loot:<cid>:<id>' | 'shop:<id>' → an item (tooltips)
//   app.auraUnit(id)      a unit with .statuses for describeAura · app.toast(text, kind) · app.sfx(id)
// window.gameEye.state() → { screen, view, world, me, players, target, windows } for Claude's game-eye and the tests.
import { bootRules } from '../rules/boot.js';
import { bootWorld } from '../world/boot.js';
import { understory } from '../world/scatter.js';
import { worldScene } from '../world/live.js';
import { installLiveEdits } from './live-edits.js';
import { installArena } from './arena-ui.js';
import { createGround } from '../game/ground.js';
import { createNet } from './net.js';
import { installTips } from './ui/tip.js';
import { openWin, toast, windowsOpen, topWin, closeAll, onWindows } from './ui/kit.js';
import { loadBindings } from './input/bindings.js';
import { createPadNav } from './input/padnav.js';
import { stopPageZoom } from '../../../../shared/no-zoom.js';
import { account } from '../../../../shared/rgs-account.js';
import { createWhatsNew } from '../../../../shared/whats-new.js';
import { loadTuning, tunePanel } from '../../../../shared/tune.js';

const SETTINGS_KEY = 'oathwild.settings';
const LITE = navigator.webdriver || new URLSearchParams(location.search).has('lite');   // automated checks draw the cheapest world
// first visit: a graphics tier from the device (environment round 2026-11-24). The player's own pick in Settings always
// wins (qualityAuto: false); an automatic pick may step down once if the game runs slow (play.js frame watch).
function autoQuality() {
  if (LITE) return 'low';
  let gpu = '';
  try { const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) || ''); gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* no WebGL info */ }
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return 'low';
  const cores = navigator.hardwareConcurrency || 4;
  if (matchMedia('(pointer: coarse)').matches) {
    const big = Math.min(screen.width, screen.height) >= 744;
    if (/apple/i.test(gpu) && cores >= 6 && big) return 'medium';                           // a recent iPad
    if (/adreno \(tm\) [7-9]\d\d|mali-g7[1-9]|mali-g[89]\d|immortalis|xclipse/i.test(gpu) && big) return 'medium';
    return 'low';
  }
  if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m[1-9]/i.test(gpu) && cores >= 6) return 'high';
  return 'medium';
}
const DEFAULTS = { quality: autoQuality(), qualityAuto: true, volume: 0.8, sfxOn: true, sens: 1, invertY: false, quickCast: false, names: true, numbers: true, shake: true, fov: 62, cameraDist: 4.6, hand: 'right' };
const URL_QUALITY = new URLSearchParams(location.search).get('quality');   // ?quality=low|medium|high: this visit only (tests, comparisons)
const loadSettings = () => {
  let s = {}; try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { s = {}; }
  const out = { ...DEFAULTS, ...s };
  if (out.qualityAuto !== false && !s.quality) out.quality = DEFAULTS.quality;
  if (['low', 'medium', 'high'].includes(URL_QUALITY)) { out.quality = URL_QUALITY; out.qualityAuto = false; }
  return out;
};

const bar = document.querySelector('#loading .ow-loading-bar i');
const progress = (k, text) => { if (bar) bar.style.width = `${Math.round(k * 100)}%`; const p = document.querySelector('#loading p'); if (p && text) p.textContent = text; };

const app = {
  build: 'r1', rules: null, W: null, art: null, scattered: null, ground: null, net: null, me: null, ws: null, world: null,
  settings: loadSettings(), bindings: loadBindings(), input: null, device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys', screen: null, screenName: null, view: null, play: null,
  tuning: null, lastWin: null, events: new Map(),
  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(app.settings)); } catch { /* private window */ } app.emit('settings', app.settings); },
  on(type, fn) { if (!app.events.has(type)) app.events.set(type, new Set()); app.events.get(type).add(fn); return () => app.events.get(type)?.delete(fn); },
  emit(type, m) { for (const fn of [...(app.events.get(type) || [])]) { try { fn(m); } catch (e) { console.error('[app]', type, e); } } },
  act(a, fields = {}) { return app.net?.act(a, fields); },
  toast, openWin, closeAll,
  windowsOpen, topWin,
  async go(name, opts = {}) {
    closeAll();
    try { app.screen?.close?.(); } catch (e) { console.error(e); }
    app.screen = null; app.screenName = name;
    const ui = document.getElementById('ui');
    ui.replaceChildren();
    document.body.dataset.screen = name;
    const mod = await import(`./screens/${name}.js`);
    if (app.screenName !== name) return null;
    app.screen = await mod.show(app, opts);
    app.emit('screen', name);
    return app.screen;
  },
  async openWindow(name, opts = {}) {
    if (!/^[a-z-]+$/.test(name)) return null;
    const mod = await import(`./ui/win-${name}.js`);
    return mod.open(app, opts);
  },
  itemRef(ref) {
    const c = app.me?.char; if (!c || !ref) return null;
    const [kind, a, b] = String(ref).split(':');
    if (kind === 'bag') return (c.bag || []).find(it => it.id === a) || null;
    if (kind === 'gear') return c.gear?.[a] || null;
    if (kind === 'loot') { const w = app.lastLoot; return w ? (w.items || []).find(it => it.id === b) || null : null; }   // (area loot: items of several bodies)
    if (kind === 'shop') return (app.lastShop?.stock || []).map(s => s.item).find(it => it.id === a) || null;
    if (kind === 'item') return app.itemCache?.get(a) || null;
    return null;
  },
  auraUnit(id) { return app.play?.auraUnit?.(id) || null; },
  sfx(id, opts) { if (!app.settings.sfxOn) return; app.sound?.play?.(id, opts); },
};
window.app = app;

window.gameEye = {
  state() {
    const p = app.play;
    return {
      screen: app.screenName, view: app.screen?.view || 'ready', step: app.screen?.step || null, world: app.world, connected: app.net?.state,
      me: p?.meState?.() || null, players: p?.playersState?.() || [], target: p?.target || null,
      windows: [...document.querySelectorAll('.ow-win')].map(w => w.getAttribute('aria-label')),
      pending: app.me?.pending || 0, device: app.device,
    };
  },
  app,
};

async function boot() {
  stopPageZoom();
  progress(0.05, 'Reading the old oaths…');
  const [rules, art, critters] = await Promise.all([
    bootRules({ seed: 7 }),
    fetch(new URL('../../data/art.json', import.meta.url)).then(r => r.json()),
    fetch(new URL('../../data/critters.json', import.meta.url)).then(r => r.json()).catch(() => ({ critters: {} })),
  ]);
  art.critters = critters.critters;                  // Quaternius animals (render/critters.js) beside the fal bodies
  app.rules = rules; app.art = art;
  progress(0.3, 'Raising the hills…');
  await new Promise(r => setTimeout(r, 0));
  app.W = await bootWorld({ regions: rules.data.regions });
  progress(0.6, 'Planting the Hartwood…');
  await new Promise(r => setTimeout(r, 0));
  app.scattered = worldScene(app.W);                       // trees + decor with the map editor's layer (js/world/edits.js)
  app.scattered.trees.push(...(app.W.town?.trees || []));                  // the towns' own big trees are drawn with the rest
  app.scattered.understory = understory(app.W.terrain, app.W.data.placements, app.scattered.trees);   // drawing only (no colliders)
  app.ground = createGround(app.W.terrain, app.W.data.placements, app.scattered, app.W.town);
  progress(0.85, 'Lighting the shrines…');
  try { app.tuning = await loadTuning(new URL('../../data/tuning.json', import.meta.url), { game: 'oathwild' }); tunePanel({ game: 'oathwild', tuning: app.tuning });
    // the camera tuner (owner 2026-11-26: "create camera edit mode so i can fine tune the knobs"): ☰ → Tune camera, or ?camera;
    // the world stays live beside it; "Send to Claude" puts the changed numbers in the report box (kind 'tune')
    app.cameraTuner = tunePanel({ game: 'oathwild', tuning: app.tuning, groups: ['Camera'], title: 'Camera', key: null, button: false,
      send: async text => (await import('./ui/win-report.js')).sendReport({ kind: 'tune', text, ...(await import('./ui/win-report.js')).context(app) }) });
    // on a phone it docks at the top (css/oathwild.css .ow-cam-tuner) so the stick, Attack and Dodge stay usable below it,
    // and the top of the HUD (bars, minimap) steps aside while it is open
    app.cameraTuner.element.classList.add('ow-cam-tuner');
    new MutationObserver(() => document.body.classList.toggle('ow-cam-tuning', !app.cameraTuner.element.hidden)).observe(app.cameraTuner.element, { attributes: true, attributeFilter: ['hidden'] });
  } catch (e) { console.warn('tuning', e); app.tuning = {}; }
  installTips(app);
  app.news = createWhatsNew({ url: new URL('../../data/changelog.json', import.meta.url), key: 'oathwild', title: "What's new in Oathwild" });
  app.news.onUnread?.(n => { app.news.unread = n; app.emit('news', n); });
  // the server line: signed in players hand over a one-time ticket, so their characters follow their account
  app.net = createNet({ getTicket: async () => { try { const u = await account.user(); return u ? await account.ticket('oathwild') : null; } catch { return null; } } });
  for (const t of ['worldEdit', 'me', 'wstate', 'win', 'say', 'err', 'enter', 'leveled', 'chars', 'worlds', 's', 'left', 'state', 'open', 'outdated', 'arena']) app.net.on(t, m => app.emit(t, m));
  app.on('me', m => { app.me = m; });
  // snapshots carry each unit's description once: keep every one from 'enter' until the play screen takes them
  app.snapBuf = [];
  app.on('enter', () => { app.snapBuf = []; });
  app.on('s', m => { if (app.snapBuf) { app.snapBuf.push(m); if (app.snapBuf.length > 600) app.snapBuf.shift(); } });
  app.on('wstate', m => { app.ws = m; });
  app.on('outdated', () => toast('A newer version of Oathwild is out. Reload the page.', 'bad', 8000));
  installLiveEdits(app);                                   // dev map editor: its changes redraw here without a reload
  installArena(app);                                       // the arena: match panel, edge markers, the board and its windows (arena-ui.js)
  app.net.connect().catch(() => {});
  // the controller walks every menu (lessons rule 27); in the world the hero has it unless a window is open
  app.padnav = createPadNav({ busy: () => app.screenName === 'play' && !windowsOpen(), back: () => { const w = topWin(); if (w) { w.close(); return true; } document.querySelector('#ui [data-back]')?.click(); return true; } });
  onWindows(() => app.emit('windows', windowsOpen()));
  // a window on top hides what is under it from screen readers (and the walk's overlap check): the page and the HUD
  // behind a shade are aria-hidden while it is open; a see-through window (loot) leaves the HUD as it is
  const behind = () => {
    const modal = !!document.querySelector('.ow-shade:not(.ow-clear), .wn-modal, .cr-modal, .gdlg, .rgs-signin');
    for (const id of ['ui', 'hud']) { const n = document.getElementById(id); if (!n) continue; if (modal) n.setAttribute('aria-hidden', 'true'); else n.removeAttribute('aria-hidden'); }
  };
  new MutationObserver(behind).observe(document.body, { childList: true });
  import('../../../../sfx/js/sfx.js').then(({ Sfx }) => Sfx.create({ method: 'hybrid', volume: app.settings.volume })).then(s => { app.sound = s; }).catch(() => {});
  progress(1, 'Ready.');
  document.getElementById('loading').classList.add('gone');
  setTimeout(() => document.getElementById('loading')?.remove(), 700);
  const q = new URLSearchParams(location.search);
  await app.go(q.get('screen') && /^[a-z]+$/.test(q.get('screen')) ? q.get('screen') : 'title');
}

boot().catch(e => {
  console.error(e);
  const p = document.querySelector('#loading p');
  if (p) p.textContent = 'Something went wrong while loading. Reload the page to try again.';
});
