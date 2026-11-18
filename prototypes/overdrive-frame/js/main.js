// Overdrive Frame — the page: loads the data, owns the screens (title → missions board → drop → mission → results),
// the shared bakers, the save, and the menus every game has (☰, What's new, Credits, Report a bug, sign in).
import { loadTuning, tunePanel } from '../../../shared/tune.js';
import { installTooltips } from '../../../shared/tooltip.js';
import { createWhatsNew } from '../../../shared/whats-new.js';
import { createCredits } from '../../../shared/credits.js';
import { PARTS_JSON, MAKER_LIST } from '../../../mechkit/js/data.js';
import { partsIndex } from './sim/loadout.js';
import { starterBuild } from './sim/starters.js';
import { Sprites } from './render/sprites.js';
import { MechArt } from './render/mechs.js';
import { Play } from './play.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { loadSave, writeSave } from './save.js';
import { SPEAKERS } from './ui/speakers.js';
import { startSound, resume } from '../../../citykit/js/world/sound.js';
import './render/props.js';

const url = p => new URL(p, import.meta.url);
const [T, kindsRaw, missionsRaw] = await Promise.all([
  loadTuning(url('../data/tuning.json'), { game: 'overdrive-frame' }),
  fetch(url('../data/enemies.json')).then(r => r.json()),
  fetch(url('../data/missions.json')).then(r => r.json()),
]);
const KINDS = Object.fromEntries(Object.entries(kindsRaw).filter(([k]) => !k.startsWith('_')));
const MISSIONS = missionsRaw.missions;
const P = partsIndex(PARTS_JSON);
const STARTERS = Object.fromEntries(MAKER_LIST.map(m => [m.id, starterBuild(PARTS_JSON, m.id)]));

installTooltips();
const sprites = new Sprites({ scale: T.cameraZoom || 2.5 });
const mechArt = new MechArt(sprites.baker);
const save = loadSave();
const news = createWhatsNew({ url: url('../data/changelog.json'), key: 'overdrive-frame', title: "What's new" });
const credits = createCredits({ game: 'overdrive-frame', made: 'Overdrive Frame by Radley Sustaire, built with Claude.' });
tunePanel({ game: 'overdrive-frame', tuning: T });
addEventListener('pointerdown', () => { startSound(); resume(); }, { once: false });
addEventListener('keydown', () => { startSound(); resume(); }, { once: true });

const stage = document.getElementById('stage');
let play = null;

const game = {
  T, KINDS, MISSIONS, P, PARTS: PARTS_JSON, MAKERS: MAKER_LIST, STARTERS, sprites, mechArt, save, news, credits,
  buildOf(maker) { return save.builds?.[maker] || STARTERS[maker]; },
  saveNow() { writeSave(save); },
  /** Start a mission with a build. Resolves with the result when it ends. */
  startMission(mission, build) {
    return new Promise(resolve => {
      play?.dispose();
      const hud = new Hud(stage, { comms: mission.comms, speakers: SPEAKERS(sprites, mechArt, build), menu: screens.pauseMenu });
      play = new Play({ root: stage, mission, build, P, kinds: KINDS, T, sprites, mechArt, mechDrawer: mechArt.draw, hud, pilotName: save.callsign, night: mission.night ?? 0.72,
        onEnd: (result, S) => { const p = play; resolve({ result, S, mission, build }); setTimeout(() => { if (play === p) { play.dispose(); play = null; } }, 0); } });
      // the upper body plays its recoil when a weapon fires
      const fx = play.fxOf; play.fxOf = (ev, S) => { if (ev.type === 'fire' && ev.slot != null) mechArt.fired(ev.id, ev.slot); fx(ev, S); };
    });
  },
  quitMission() { play?.dispose(); play = null; },
  get play() { return play; },
};
const screens = new Screens(document.getElementById('screens'), game);
game.screens = screens;
screens.title();

// Claude's game-eye and the tests read the game through this
window.gameEye = { state: () => ({ screen: screens.current, previewsLeft: screens._previewQ?.length || 0, play: play?.state() || null, save: { credits: save.credits, grades: save.grades } }), game };

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
