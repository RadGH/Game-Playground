// Overdrive Frame — the page: loads the data, owns the screens (title → missions board → drop → mission → results),
// the shared bakers, the save, and the menus every game has (☰, What's new, Credits, Report a bug, sign in).
import { loadTuning, tunePanel } from '../../../shared/tune.js';
import { stopPageZoom } from '../../../shared/no-zoom.js';
stopPageZoom();   // iPhone ignores user-scalable=no: no pinch / double-tap page zoom (shared/no-zoom.js)
import { installTooltips } from '../../../shared/tooltip.js';
import { createWhatsNew } from '../../../shared/whats-new.js';
import { createCredits } from '../../../shared/credits.js';
import { PARTS_JSON, MAKER_LIST } from '../../../mechkit/js/data.js';
import { partsIndex } from './sim/loadout.js';
import { starterBuild } from './sim/starters.js';
import { chipsIndex } from './sim/chips.js';
import { resolveBuild, activeBuild } from './sim/inventory.js';
import { rankOf } from './sim/progress.js';
import { applyCampaign } from './sim/campaign.js';
import { aceKinds } from './sim/ace.js';
import { Sprites } from './render/sprites.js';
import { MechArt } from './render/mechs.js';
import { Play } from './play.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { loadSave, writeSave, applyResult, SAVE_KEY } from './save.js';
import { NetPlay } from './netplay.js';
import { makeMirror, frameFor, asItems } from './net/mirror.js';
import { botBuild, botName } from './sim/bots.js';
import { levelTier } from './sim/progress.js';
import { Coop } from './ui/coop.js';
import { SPEAKERS } from './ui/speakers.js';
import { startSound, resume } from '../../../citykit/js/world/sound.js';
import './render/props.js';

const url = p => new URL(p, import.meta.url);
const json = p => fetch(url(p)).then(r => r.json());
const [T, kindsRaw, missionsRaw, CRAFTED, CHIPS_J, RECIPES_J, PAINTS, CAMP, ACES] = await Promise.all([
  loadTuning(url('../data/tuning.json'), { game: 'overdrive-frame' }),
  json('../data/enemies.json'), json('../data/missions.json'), json('../data/crafted.json'), json('../data/chips.json'), json('../data/recipes.json'), json('../data/paints.json'), json('../data/campaign.json'), json('../data/aces.json'),
]);
const KINDS = Object.fromEntries(Object.entries(kindsRaw).filter(([k]) => !k.startsWith('_')));
const MISSIONS = missionsRaw.missions;
const P = partsIndex(PARTS_JSON, CRAFTED);
const C = chipsIndex(CHIPS_J), CHIPS = CHIPS_J.chips, RECIPES = RECIPES_J.recipes;
Object.assign(KINDS, aceKinds(ACES, P, C));            // rival aces are enemy kinds 'ace:<id>' (sim/ace.js)
const STARTERS = Object.fromEntries(MAKER_LIST.map(m => [m.id, starterBuild(PARTS_JSON, m.id)]));

installTooltips();
const sprites = new Sprites({ scale: T.cameraZoom || 2.5 });
const mechArt = new MechArt(sprites.baker);
const ctx = { PARTS: PARTS_JSON, MAKERS: MAKER_LIST, P, CHIPS, RECIPES, MISSIONS };
const save = loadSave(ctx);
writeSave(save, false);   // an upgraded round 1 save is stored in the new shape straight away
const news = createWhatsNew({ url: url('../data/changelog.json'), key: 'overdrive-frame', title: "What's new" });
const credits = createCredits({ game: 'overdrive-frame', made: 'Overdrive Frame by Radley Sustaire, built with Claude.' });
tunePanel({ game: 'overdrive-frame', tuning: T });
addEventListener('pointerdown', () => { startSound(); resume(); }, { once: false });
addEventListener('keydown', () => { startSound(); resume(); }, { once: true });

const stage = document.getElementById('stage');
let play = null;

const game = {
  T, KINDS, MISSIONS, P, C, CHIPS, RECIPES, PAINTS, CAMP, PARTS: PARTS_JSON, MAKERS: MAKER_LIST, STARTERS, sprites, mechArt, news, credits, ctx,
  get save() { return save; },
  /** Swap in a different save (a cloud copy picked on sign-in): same object, new contents, so every screen keeps it. */
  replaceSave(next) { for (const k of Object.keys(save)) delete save[k]; Object.assign(save, next); },
  /** The build a mission runs: the active saved build, resolved to owned items. */
  build(b = null) {
    const sb = b || activeBuild(save);
    if (!sb) return asItems({ ...STARTERS[MAKER_LIST[0].id], kit: 1, skill: 'repulse', paint: 'maker' });   // round 7: a new pilot before the first-frame choice (the title scene still shows a frame)
    return resolveBuild(save, sb, P);
  },
  buildOf(maker) { return STARTERS[maker]; },
  rank() { return rankOf(save.xp); },
  saveNow(stamp = true) { if (game.noSave) return; writeSave(save, stamp); game.cloud?.saveSoon?.(); },
  noSave: false, cloud: null,
  applyResult(result, mission, S = null, pid = 'p1', coop = false) {
    const st = (S?.mechs?.find(m => m.pid === pid) || S?.mechs?.[0])?.stats;
    // co-op: the host's mission, your rewards at your own level (owner ruling)
    const gained = applyResult(save, result, mission.id, { ...ctx, stats: st, mission, ...(coop ? { tier: levelTier(rankOf(save.xp).rank) } : {}) }, pid);
    applyCampaign(save, mission, result);
    return gained;
  },
  /** Bot teammates for solo play (sim/bots.js): starter frames from each maker, built like a co-op seat. */
  soloBots(n) { return Array.from({ length: n }, (_, i) => { const id = 'b' + (i + 1), b = asItems(botBuild(PARTS_JSON, MAKER_LIST, i)); return { id, mech: frameFor(NETDATA, id, b, botName(i)) }; }); },
  /** Start a mission with a build. Resolves with the result when it ends. */
  startMission(mission, build, nBots = 0, checkpoint = null) {
    return new Promise(resolve => {
      play?.dispose();
      const hud = new Hud(stage, { comms: mission.comms, speakers: SPEAKERS(sprites, mechArt, build), menu: screens.pauseMenu });
      play = new Play({ root: stage, mission, build, bots: game.soloBots(nBots), checkpoint, P, C, kinds: KINDS, T, sprites, mechArt, mechDrawer: mechArt.draw, hud, pilotName: save.callsign, night: mission.night ?? 0.72,
        onEnd: (result, S) => { const p = play; resolve({ result, S, mission, build }); setTimeout(() => { if (play === p) { play.dispose(); play = null; } }, 0); } });
      // the upper body plays its recoil when a weapon fires
      const fx = play.fxOf; play.fxOf = (ev, S) => { if (ev.type === 'fire' && ev.slot != null) mechArt.fired(ev.id, ev.slot); fx(ev, S); };
    });
  },
  /** A co-op mission (start = the server's 'start' message): the browser's copy of it, drawn by NetPlay. */
  startCoop(start, net) {
    return new Promise(resolve => {
      play?.dispose();
      const mission = start.mission, M = makeMirror(start, NETDATA, start.you);
      const build = M.byId.get('m-' + start.you)?.build || game.build();
      const hud = new Hud(stage, { comms: mission.comms, speakers: SPEAKERS(sprites, mechArt, build), menu: screens.pauseMenu });
      play = new NetPlay({ root: stage, M, net, data: NETDATA, P, C, kinds: KINDS, T, sprites, mechArt, build, mechDrawer: mechArt.draw, hud, night: mission.night ?? 0.72,
        onEnd: (result, S) => { const p = play; resolve({ result, S, mission }); setTimeout(() => { if (play === p) { play.dispose(); play = null; } }, 0); } });
      const fx = play.fxOf; play.fxOf = (ev, S) => { if (ev.type === 'fire' && ev.slot != null) mechArt.fired(ev.id, ev.slot); fx(ev, S); };
      net.send({ t: 'loaded' });
    });
  },
  quitMission() { play?.dispose(); play = null; },
  stage,
  /** The test range (round 2): your build against target dummies (js/range.js), never ends; onLeave → the hangar. */
  async startRange(build, onLeave) {
    const { Range } = await import('./range.js');
    play?.dispose(); play = null;
    const r = new Range({ root: stage, T, P, C, kinds: KINDS, sprites, mechArt, build, pilotName: save.callsign,
      onLeave: () => { r.dispose(); if (game.range === r) game.range = null; onLeave(); },
      onMenu: ({ resume, leave }) => screens.rangeMenu({ resume, leave }) });
    game.range = r;
  },

  get play() { return play; },
};
const NETDATA = { P, C, KINDS, T };
const screens = new Screens(document.getElementById('screens'), game);
game.screens = screens;
game.coop = new Coop(screens, game);
screens.title();
// an invite link (?code=ABCD) joins that room straight away
{ const code = new URLSearchParams(location.search).get('code'); if (code && /^[A-Za-z]{4}$/.test(code)) game.coop.join(code.toUpperCase()); }

// Cloud saves while signed in to games.radgh.com, with the whole conflict kit (game-standards §3): the "which copy?"
// choice shows each side's own stats + last-played time (save-summary.js); the side not chosen is kept as a backup
// (Settings → Bring the other saves back); a tab left open checks for newer saves before it saves over them.
Promise.all([import('../../../shared/rgs-cloudsave.js'), import('./save-summary.js')]).then(([{ cloudSave }, { describeSaves }]) => {
  game.cloud = cloudSave({ game: 'overdrive-frame', keys: { save: SAVE_KEY }, describe: describeSaves,
    canRestore: () => ['title', 'missions'].includes(screens.current), onRestore: () => location.reload() });
}).catch(e => console.info('[overdrive] cloud saves unavailable', e?.message));
let hiddenAt = 0;
addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 60e3) checkStale();
});
setInterval(() => { if (!document.hidden) checkStale(); }, 5 * 60e3);
/** Has another device saved since this tab last matched the account? Pause, stop saving, and ask (Arcline lost a
 *  PC session to an old phone tab that woke and saved over it). Asked once per tab. */
async function checkStale() {
  if (game.staleAsked || !game.cloud?.peek) return;
  const p = await game.cloud.peek().catch(() => null);
  if (!p?.newer || p.sameDevice) return;
  game.staleAsked = true; game.noSave = true;
  const hg = screens.hangarNow, wasPaused = play?.paused;
  hg?.pause(true); if (play) play.paused = true;
  const { ask } = await import('../../../shared/dialog.js');
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(p.at)) / 60e3));
  const load = await ask({ title: 'A newer save is in your account',
    text: `Your pilot was saved from ${p.device} ${mins < 90 ? `${mins} min` : `${Math.round(mins / 60)} h`} ago, after this tab last checked. This tab has an older copy. Load the newer copy? (This tab's save is kept as a backup.)`,
    ok: 'Load the newer copy', cancel: 'Keep playing this tab' });
  if (load) { await game.cloud.pull(); return; }
  game.noSave = false; hg?.pause(false); if (play) play.paused = !!wasPaused;
}
game.checkStale = checkStale;

// Claude's game-eye and the tests read the game through this
window.gameEye = { state: () => ({ screen: screens.current, coop: game.coop.room ? { code: game.coop.room.code, phase: game.coop.room.phase, you: game.coop.room.you, host: game.coop.room.host, seats: game.coop.room.seats.length, net: game.coop.net?.state } : null, range: game.range?.state?.() || null, hangar: screens.hangarNow?.state?.() || null, noSave: game.noSave, previewsLeft: screens._previewQ?.length || 0, play: play?.state() || null, save: { credits: save.credits, grades: save.grades, items: save.items.length, xp: save.xp } }), game };

// While a sheet or a shared dialog is open, everything behind it is hidden from screen readers and can't take focus
// (and the screen checks read only what's on top).
const SHEETS = '.of-pause, .wn-root, .cr-root, .wn-modal, .cr-modal, .rgs-signin, .gdlg-modal, .tune-panel';
let lastOpen = null;
setInterval(() => {
  const open = [...document.querySelectorAll(SHEETS)].some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  if (open === lastOpen) return; lastOpen = open;
  for (const el of [document.getElementById('screens'), document.getElementById('stage')]) {
    if (open) { el.setAttribute('aria-hidden', 'true'); el.inert = true; } else { el.removeAttribute('aria-hidden'); el.inert = false; }
  }
}, 120);

// Round 3: rival aces become enemy kinds; ?mission=<id> launches a mission directly for testing (js/boss-ace-hooks.js)
import('./boss-ace-hooks.js').then(m => m.install(game)).catch(e => console.warn('[overdrive] boss/ace hooks', e));
