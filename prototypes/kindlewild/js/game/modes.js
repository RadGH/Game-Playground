// Custom Game: turns a setup (type, land, size, options) into a running session, and a running session into a save.
// PURE apart from the strings the caller stores. The list of types and their choices is data/gamemodes.json.

import { createSession } from './session.js';
import { createRealm, loadRealm, saveRealm, saveWorld, restoreWorld } from './realm.js';
import { attachTowerGame } from './towers.js';
import { attachWildfire, attachFlood, attachCataclysm, attachGarden } from './scenarios.js';

const TPS = 30;
const ATTACH = { td: attachTowerGame, wildfire: attachWildfire, flood: attachFlood, cataclysm: attachCataclysm, garden: attachGarden };

/** A complete setup with every choice filled in. */
export function fillSetup(data, setup = {}) {
  const G = data.gamemodes, T = G.types[setup.type] ? setup.type : 'realm', t = G.types[T];
  const lands = t.lands || Object.keys(data.biomes.recipes);
  const sizes = t.sizes || Object.keys(G.sizes);
  return {
    type: T, recipe: lands.includes(setup.recipe) ? setup.recipe : lands[0], size: sizes.includes(setup.size) ? setup.size : t.size,
    events: G.events[setup.events] ? setup.events : 'random', difficulty: G.difficulty[setup.difficulty] ? setup.difficulty : 'fair',
    length: G.length[setup.length] ? String(setup.length) : '20', liquid: setup.liquid === 'lava' ? 'lava' : 'water',
    base: ['choose', 'random', 'none'].includes(setup.base) ? setup.base : 'choose',
    endless: setup.endless ?? true, everything: !!setup.everything,
    seed: setup.seed ?? ((Math.random() * 1e9) | 0), name: setup.name || '',
  };
}
export const titleOf = (data, setup) => setup.name || `${data.biomes.recipes[setup.recipe]?.name || setup.recipe} ${data.gamemodes.types[setup.type].name}`;

function attach(s, setup) {
  s.setup = setup;
  s.finishRun = (r) => {
    if (s.result) return;
    s.result = { ...r, stars: [false, false, false], starCount: 0, reason: r.text, secs: s.stats.ticks / TPS, manaUsed: Math.round(s.stats.manaUsed), custom: true };
    s.sim.fire('result', s.result);
  };
  const add = ATTACH[setup.type];
  if (add) s.run = add(s, setup);
  return s;
}

/**
 * Start a new game. player = { mana: realmMana(...), unlocked, spellLevels, discovered, manaScale, regenScale }.
 */
export function newGame(data, raw, player) {
  const setup = fillSetup(data, raw);
  const dim = data.gamemodes.sizes[setup.size];
  const base = { W: dim.W, H: dim.H, seed: setup.seed, recipe: setup.recipe, scaleMap: true, unlocked: player.unlocked, spellLevels: player.spellLevels, discovered: player.discovered };
  if (setup.type === 'realm') return attach(createRealm(data, { ...base, mana: player.mana, events: setup.events, base: setup.base }), setup);
  if (setup.type === 'sandbox') {
    const blank = setup.recipe === 'blank';
    return attach(createSession(data, { ...base, mode: 'sandbox', base: setup.base === 'none' ? undefined : setup.base, villages: setup.base === 'none' || (blank && setup.base !== 'choose') ? false : undefined, endlessMana: setup.endless, everything: setup.everything, manaMax: player.mana.max, manaRegen: +(3 * player.mana.regenScale).toFixed(2) }), setup);
  }
  const cfg = { ...base, mode: setup.type, manaMax: player.mana.max, manaRegen: +(1.5 * player.mana.regenScale).toFixed(2), manaStart: player.mana.max * 0.7 };
  if (setup.type === 'td') { cfg.villages = false; cfg.base = 'choose'; cfg.baseRadius = 9; if (setup.base === 'random') cfg.autoBase = true; cfg.fish = false; }
  if (setup.type === 'wildfire' || setup.type === 'flood') { cfg.base = setup.base; cfg.villages = undefined; }
  if (setup.type === 'cataclysm') {
    const D = data.gamemodes.cataclysm[setup.difficulty];
    cfg.map = { extraSites: 2 };
    cfg.villageTemplate = { people: D.people, wardens: D.wardens, mages: 1, prebuilt: ['cottage', 'cottage', 'longhouse', 'stonehouse', 'farm', 'farm', 'well', 'shrine'], food: 200, wood: 60, stone: 40 };
  }
  if (setup.type === 'garden') { cfg.villages = false; cfg.herds = false; }
  const s = attach(createSession(data, cfg), setup);
  if (cfg.autoBase || (setup.base === 'random' && s.placing)) { const at = s.suggestBase(); if (at) s.placeBase(at[0], at[1]); }
  return s;
}

/** The whole game as a string, for one save slot. */
export function saveGame(s) {
  const setup = s.setup;
  if (setup.type === 'realm') return JSON.stringify({ game: 2, setup, ...JSON.parse(saveRealm(s, { recipe: setup.recipe })) });
  return JSON.stringify({ game: 2, setup, ...saveWorld(s, { recipe: setup.recipe }), stats: s.stats, run: s.run?.save?.() ?? null });
}
export function loadGame(data, str, player) {
  const o = JSON.parse(str);
  const setup = fillSetup(data, o.setup);
  if (setup.type === 'realm') return attach(loadRealm(data, str, { mana: player.mana, unlocked: player.unlocked, spellLevels: player.spellLevels, discovered: player.discovered }), setup);
  const s = newGame(data, { ...setup, base: 'none', seed: o.seed }, player);
  s.placing = null;
  s.setup = setup;
  if (s.run?.load) { s.run.load(o.run); }
  restoreWorld(s, o);
  if (s.sim.td) s.sim.td.dirty = true;   // the road was measured before the saved walls came back
  Object.assign(s.stats, o.stats || {});
  return s;
}
/** One line for the saved-games list. */
export function progressOf(s) {
  if (s.realm) return s.realm.wave ? `Day ${s.realm.day + 1} · wave ${s.realm.wave}` : `Day ${s.realm.day + 1}`;
  return s.run ? (s.run.progress?.() ?? s.run.goal()) : '';
}
