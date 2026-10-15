// Thousandvale client — boot, title screen, the connection, and the frame loop.
//
// The connection is stream A's `js/net/client.js` (gateway + province sockets, guest token, reconnect,
// binary snapshots decoded), the entity table is `js/net/mirror.js`, and prediction runs stream A's
// `stepMove` — so this file only turns what the server says into pictures and what you press into inputs.
//
// Query flags (all optional):
//   ?offline=1                      play against the whole server sim in a Web Worker (no server needed)
//   ?server=ws://host:8491          a specific game server (default: the page's own host)
//   ?autoplay=1&name=Aldra&cls=warrior[&race=elf]   skip the title screen (tests, bots, quick second tab)
//   ?quality=low|medium|high        default: high, or low on a software renderer
//   ?build=<id>                     the build id sent in hello (default 'dev')
//   ?tod=0.9                        hold the time of day (0 = midnight, 0.5 = noon) instead of the realm clock
//   ?zone=z12_02                    the zone the title screen stands in (default: the starter, Torborhold)

import * as THREE from 'three';
import { createScene } from './scene.js';
import { createDecor, foliageMaterials } from './decor.js';
import { createWorldStream, zoneBounds } from './world-stream.js';
import { createHorizon } from './horizon.js';
import { createWorldUi } from './world-ui.js';
import { createFootprints } from './traces.js';
import { nightness } from './daynight.js';
import { createSolids } from './solids.js';
import { createActors } from './actors.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createControls } from './controls.js';
import { campPlacements, CAMP_RADIUS } from './camp.js';
import { Predictor, MOVE } from './predict.js';
import { PLAYABLE_RACES, RACE_NAMES, loadLookData, defaultLook, loadMonsterLooks } from './looks.js';
import { gearKey } from './gear-look.js';
import { connect, localTokenStore } from '../net/client.js';
import { createMirror } from '../net/mirror.js';
import { ANIMS, STATE, KIND_NAMES, TICK_MS, cleanName } from '../net/protocol.js';
import { tabNext, tabOrder } from '../net/tab.js';
import { tabPick } from './pick-rule.js';
import { createTelegraphs } from './telegraphs.js';
import { createBossUi } from './boss.js';
import { createObjects } from './objects.js';
import { createDungeonView } from './dungeon-view.js';
import { createSocial } from './social.js';
import { createBag } from './bag.js';
import { loadSkillData, barFromData, barFromServer, initials } from './skillbar.js';
import { createMenubar } from './menubar.js';
import { createChat } from './chat.js';
import { createFriends } from './friends.js';
import { createGuild } from './guild.js';
import { createMail } from './mail.js';
import { createCallboard } from './callboard.js';
import { createAccount } from './account.js';
import { createHelp } from './help.js';
import { closeTop, getPanel } from './ui-panel.js';
import { PANEL_KEYS } from './social-core.js';
import { loadZoneNames, learnZone } from './names.js';
import { humanFn } from './turnstile.js';
import { createUiSuite } from './ui/suite.js';   // D-UI play-test 1: map, minimap, journal, party menu, tooltips, talents
import { perf, compileBeforeShow } from './perf.js';
import { LIGHTS } from './lightpool.js';
import { createTransition, isJump } from './transition.js';
import { createSpells } from './spells.js';
import { createProjectiles } from './projectiles.js';   // play-test 8 (W2/W14)
import { createStarFx } from './star-fx.js';             // Y32: the Starcaller's gold stars
import { moteCount } from './star-looks.js';
import { createMoveMarker } from './move-marker.js';       // play-test 9 (X2): the marker where click-to-move is heading
import { createHeld } from './held-view.js';
import { createCarts } from './carts-view.js';             // play-test 8 (W5): ox carts — parked, on the road, and the ride
import { createShipVoyage } from './ship-view.js';         // [V] Expansion 1 §6: the voyage between the continents + the Harbourmaster window
import { createQuestMarks } from './quest-marks.js';     // play-test 8 (W12): ! and ? over quest givers
import { createStatusSync } from './status-sync.js';
import { createWeaponFx } from './weapon-fx.js';
import { createFormFx } from './form-fx.js';             // play-test 5 (D-world): T15 caster forms, T16 sceptre swings
import { createReviveFx } from './revive-fx.js';         // T4: each class's revive
import { cropSample, setCropDetail } from './setpiece-view.js';       // play-test 6 (U4): the standing-crop material, warmed at boot
import { createAngling } from './angling-view.js';
import { createProfView } from './prof-view.js';      // W9 (P-client): gathering nodes, stations, tools in hand, the skinning prompt
import { createProf } from './ui/prof.js';            // W9 (P-client): mini-games, crafting / tempering windows, the Professions list      // T25: rod, float, line, catch, fish pools
import { basicReach as reachOf, shortenReach } from './reach.js';   // T14: walk into the attack form's real reach
import { createLootMarkers } from './loot-marker.js';
import { makeGlowTexture } from './decor.js';
import { createUi2 } from './ui/pt2.js';          // D-UI play-test 2: menus, loot, rolls, shops, trade, pause/settings, portraits, editor
import { tileLos } from './ui/pt6-core.js';
import { createUi10 } from './ui/pt10.js';        // D-UI play-test 10: changelog, tracking a friend, emotes
import { createUi8 } from './ui/pt8.js';          // D-UI play-test 8: ox-cart window, damage meter, quest marks on the map
import { createUi5 } from './ui/pt5.js';          // D-UI play-test 5: kit step, crates, event tracker, character sheet, feedback, angling
import { savedQuality, savedFxLevel } from './ui/settings.js';
import { createSigFx } from './sig-fx.js';                 // 2026-10-14: every class's signature spell shapes
import { createTitleFront, rememberGear, rememberedGear } from './ui/title-front.js';   // D-UI play-test 10 (Y29): the title's front card + whose figure it shows
import { titleCharLook } from './ui/pt10-core.js';
import { loadCallings, drawClassCard } from './ui/class-card.js';
import { lookWith, lookCustom } from './ui/appearance-core.js';
import { avatarFor } from './looks.js';
import { installInput } from './input/index.js';
import { looksLikePhone } from './input/layout.js';   // play-test 5 T27 (stream G): gamepad, re-bound keys, key hints that follow the device (touch only when the phone layout is on)

const q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const store = {
  get(k, d = null) { try { const v = localStorage.getItem('tv.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tv.' + k, JSON.stringify(v)); } catch {} },
};
const INTERP_MS = 130;                              // others are drawn this far behind the server (PLAN §8.3)
const STARTERS = ['warrior', 'paladin', 'ranger', 'rogue', 'cleric', 'mage'];
const ONE_SHOT = new Set(['attack', 'attack2', 'cast', 'bite', 'howl', 'emote', 'interact']);
const CASTR_TEXT = { range: 'Out of range.', target: 'You need a target.', dead: 'You are dead.', mana: 'Not enough mana.', unknown: 'You cannot do that yet.' };

// --- quality ----------------------------------------------------------------------------------------
/** Software rendering (headless test browsers, no GPU driver) draws "high" at ~1 fps, so it starts low. */
function detectQuality() {
  if (q.get('quality')) return q.get('quality');
  if (savedQuality()) return savedQuality();          // Settings > Graphics (play-test 2 Q15)
  try {
    const g = document.createElement('canvas').getContext('webgl2');
    const e = g && g.getExtension('WEBGL_debug_renderer_info');
    if (/swiftshader|llvmpipe|software/i.test(e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '')) return 'low';
  } catch {}
  if (looksLikePhone()) return 'medium';              // a phone starts on Medium (stream G, phone go-live): its GPU is good, its battery and heat budget are not
  return 'high';
}
const quality = detectQuality();
// standing crops: half the blades and stalks only close by on a cheap renderer; a phone (Medium) gets 10 blades within 70 m
if (quality === 'low') setCropDetail(8, 60); else if (quality === 'medium') setCropDetail(10, 70);
const view = createScene($('view'), { quality });
const { scene, camera } = view;
perf.hookGl(view.renderer.getContext());
LIGHTS.attach(scene, { count: quality === 'low' ? 4 : 8 });   // the page's fixed lights (lightpool.js: no recompiles)
const actors = createActors(scene, { plateLayer: $('plates'), camera, quality, renderer: view.renderer, waterAt: (x, z) => (D.view ? null : WS.terrain.waterAt(x, z)) });
const fx = createFx(scene, { layer: $('numbers'), camera });
const vignette = document.getElementById('vignette');
const tele = createTelegraphs(scene, {
  serverNow: () => (S.net ? S.net.clock.serverNow() : 0),
  posOf: id => { if (id === S.selfId) { const p = S.predictor.pos; return { x: p.x, z: p.z, yaw: S.lastInput?.yaw }; } const a = actors.get(id); return a ? { x: a.pos.x, z: a.pos.z, yaw: a.yaw } : null; },
  selfPos: () => (S.selfId != null && S.phase === 'world' ? S.predictor.pos : null),
  selfId: () => S.selfId,
  onHitMe: () => { vignette.classList.add('hit'); setTimeout(() => vignette.classList.remove('hit'), 220); fx.shake(0.6); },
});
// P20: every skill's look (spell-looks.js) drawn with avatar-3d SpellFx from the rules' cast/fx/hit events
let SKILLS = null; const SKILL_CLASS = new Map();
loadSkillData().then(d => { SKILLS = d?.skills || null; window.__skillClasses = d?.classes || {}; for (const [c, ids] of Object.entries(d?.classes || {})) for (const id of ids) SKILL_CLASS.set(id, c); }).catch(() => {});
const FX_FOCUS = () => ({ self: S.selfId, target: S.target });       // Spell effects: Reduced draws these in full
// play-test 8 (W2/W14): every ranged attack is a body in the air — arrows, quarrels, knives, stones, firebolts (pooled, warmed at boot)
const shots = createProjectiles(scene, { actors, groundY: (x, z) => groundY(x, z), night: () => S.night || 0 });
// Y32 (wrap-up): the Starcaller's thrown and falling stars, star-rune zones and Constellation motes (pooled, warmed at boot)
const stars = createStarFx(scene, { camera, actors, quality, groundY: (x, z) => groundY(x, z) });
const spells = createSpells(scene, { camera, renderer: view.renderer, actors, quality, lights: LIGHTS, shots, stars, groundY: (x, z) => groundY(x, z), skillOf: id => SKILLS?.[id] || null, level: savedFxLevel(), focus: FX_FOCUS });
// the caster's class: the skill's owner in the class table, else the body's own class (a druid's shape skills, a talent's)
const sig = createSigFx(scene, { camera, actors, groundY: (x, z) => groundY(x, z), level: savedFxLevel(), focus: FX_FOCUS, skillOf: id => SKILLS?.[id] || null, classOf: (id, a) => SKILL_CLASS.get(id) || a?.look?.cls || null });
// R5: every weapon's basic attack drawn (swing crescents, staff spells, shot flashes)
const weaponFx = createWeaponFx(scene, { shots, spellFx: spells.fx, actors, groundY: (x, z) => groundY(x, z), targetOf: id => (id === S.selfId ? S.target : null) });
// play-test 5: a look per caster attack form + the sceptre's elemental swing (T15/T16), each class's revive (T4), angling (T25)
const formFx = createFormFx(scene, { spellFx: spells.fx, actors, groundY: (x, z) => groundY(x, z) });
const reviveFx = createReviveFx({ forms: formFx, spellFx: spells.fx, actors, groundY: (x, z) => groundY(x, z) });
const angling = createAngling(scene, { actors, forms: formFx, spellFx: spells.fx, camera, groundY: (x, z) => groundY(x, z), waterAt: (x, z) => (D.view ? null : WS.terrain.waterAt(x, z)), selfId: () => S.selfId });
// Q3/S23: a corpse with loot for you sparkles, tinted by the best rarity on it
const lootMarks = createLootMarkers({ actors, glowTexture: makeGlowTexture() });
// W5: ox carts by the town gates and on the roads (avatar-3d's ox cart; one is built and compiled at boot)
const held = createHeld(scene, { groundY: (x, z) => groundY(x, z), compile: g => compileBeforeShow(view.renderer, g, camera, scene) });   // #59: the cage a road-event captive sits in
const carts = createCarts(scene, { actors, groundY: (x, z) => groundY(x, z), compile: g => compileBeforeShow(view.renderer, g, camera, scene) });
const ships = createShipVoyage(scene, { view, camera, actors, travel: { cover: t => travel.cover(t), reveal: () => travel.reveal(), get covered() { return travel.covered; } }, hud: { toast: (...a) => hud.toast(...a), chat: (...a) => hud.chat(...a) }, controls: { hold: v => controls.hold(v), stop: () => controls.stop() }, horizon: () => W.horizon, ws: { get terrain() { return WS.terrain; }, whenReady: (x, z) => WS.whenReady(x, z) }, worldUi: { closeDialog: () => worldUi.closeDialog?.() }, journal: () => ui.journal, selfId: () => S.selfId, compile: g => compileBeforeShow(view.renderer, g, camera, scene) });   // [V]
// W12: A's per-player quest marks, floated over the NPCs they belong to (D-UI reads questMarks.list() for the minimap)
const questMarks = createQuestMarks(scene, { actors, camera });
// Q8: auras follow the server's info.st on every body (late arrivals see them; a death clears them)
const statusSync = createStatusSync({ actors, fx: spells.fx, infoOf: id => S.mirror?.infos.get(id), selfDead: () => S.self.dead, selfId: () => S.selfId, groundY: (x, z) => groundY(x, z) });
const travel = createTransition({ el: document.getElementById('travel-veil'), view, scene, camera });
const objects = createObjects(scene, { onUse: (id, o) => (String(id).startsWith('demo:') ? demoUse(o) : o.type === 'node' ? prof.gather(id) : o.type === 'skin' ? prof.gather(o.corpse) : S.net?.use(id)),   // W9 (P-client): a node / a skinnable corpse starts a mini-game
  onNear: o => worldUi.lore(o.key || o.id, o.name, o.lore), labelLayer: document.getElementById('plates'), camera, posOf: id => { const a = actors.get(id); return a && !a.dead ? { x: a.pos.x, y: a.pos.y, z: a.pos.z, h: a.height } : null; } });

// --- session state ----------------------------------------------------------------------------------
const S = {
  phase: 'title',            // title -> joining -> world
  net: null, mirror: createMirror({ tickMs: TICK_MS, keep: 12 }), selfId: null, room: null,
  predictor: new Predictor({ stepMs: TICK_MS }),
  target: null, hover: null,
  self: { name: '', cls: 'warrior', level: 1, hp: 1, hpMax: 1, xp: 0, next: 100, dead: false, deadAt: 0 },
  acc: 0, lastInput: null, movingSpeed: 0,
  swing: { last: 0, attempt: 0, ms: 1000 }, reach: 2.4,
  look: store.get('look', { race: 'human', seed: (Math.random() * 1e9) >>> 0 }),
  cls: q.get('cls') || store.get('cls', 'warrior'),
  events: [], stats: { snaps: 0, bytes: 0, corrections: 0, maxCorrection: 0 },
};

// --- the outdoor world: zones streamed around you (world-stream.js), the far horizon beyond them ----------
const STARTER_ZONE = q.get('zone') || 'z12_02';
const SOLIDS = createSolids();
const WS = createWorldStream(scene, { quality, solids: SOLIDS, onZoneReady: L => { L.town?.setNight(S.night || 0); L.setpieces?.setNight(S.night || 0); if (!D.view) objects.setGround(WS.terrain.heightAt); }, opts: {
  compile: group => compileBeforeShow(view.renderer, group, camera, scene),
  // A zone with no baked scatter (the M0 test zone) gets the old random woods and the waystone camp.
  fallbackDecor: async T => {
    const camp = T.spawn;
    return createDecor(T, { placements: campPlacements(camp, T), seed: 7, avoid: [{ ...camp, r: CAMP_RADIUS + 4 }],
      density: quality === 'low' ? 0.3 : 1, lodFar: quality === 'low' ? [0, 90] : undefined, cheap: quality === 'low' });
  },
} });
const W = { terrain: WS.terrain, horizon: null, spot: null };
createHorizon(scene, { quality }).then(h => { W.horizon = h; WS.setHorizon(h); if (D.view) h.setVisible(false); }).catch(e => console.warn('[horizon] not drawn:', e.message));
const footprints = createFootprints(scene, { heightAt: (x, z) => WS.terrain.heightAt(x, z) });
/** Show the outdoor world for a room's zones and wait until the ground under (x, z) is drawn. */
async function useWorld(room, at) {
  const zones = room && room.zones && room.zones.length ? room.zones : [{ key: (room && room.terrain) || 'test', bounds: null }];
  WS.setZones(zones);
  await WS.whenReady(at.x, at.z);
  S.predictor.terrain = outdoorTerrain();
  controls.setHeightAt(WS.terrain.heightAt);
}
const groundY = (x, z) => (D.view ? 0 : WS.terrain.heightAt(x, z));
/** What prediction walks on outdoors — WITH the water layer, so swimming and wading predict what the server does (P25/P2). */
function outdoorTerrain() { return { heightAt: WS.terrain.heightAt, walkable: WS.terrain.walkable, waterAt: WS.terrain.waterAt, moveAt: WS.terrain.moveAt, bounds: WS.terrain.bounds, nav: WS.terrain.nav }; }   // nav: walls/houses (play-test 4)

// --- dungeon instances (drawn from joined.room.dungeon; the outdoor ground is hidden, not thrown away) ---
const D = { view: null, roomId: null };
function enterDungeon(room) {
  if (D.roomId !== room.id || !D.view) {
    if (D.view) { scene.remove(D.view.group); D.view.dispose?.(); }
    D.view = createDungeonView(room.dungeon, { quality }); D.roomId = room.id;
    scene.add(D.view.group);
  }
  WS.setVisible(false); W.horizon?.setVisible(false); footprints.setVisible(false);
  view.setMood('dungeon', { fog: D.view.fog, bright: D.view.bright });
  S.predictor.terrain = { heightAt: () => 0, walkable: D.view.terrain.walkable, waterAt: D.view.terrain.waterAt, moveAt: D.view.terrain.moveAt, bounds: D.view.terrain.bounds };
  controls.setHeightAt(D.view.cameraHeight);
  tele.setGround(() => 0); objects.setGround(() => 0);
}
function leaveDungeon() {
  if (D.view) { scene.remove(D.view.group); D.view.dispose?.(); D.view = null; D.roomId = null; }
  WS.setVisible(true); W.horizon?.setVisible(true); footprints.setVisible(true);
  view.setMood('outdoor');
  S.predictor.terrain = outdoorTerrain();
  controls.setHeightAt(WS.terrain.heightAt); tele.setGround(WS.terrain.heightAt); objects.setGround(WS.terrain.heightAt);
}
/** Ground for a room: the dungeon layout, or the province's zones (kept when a handoff stays on them). */
async function useRoom(room, at) {
  if (room.dungeon) { enterDungeon(room); return; }
  await useWorld(room, at || room.spawn || { x: 0, z: 0 });
  leaveDungeon();
}

const hud = createHud({
  onSlot: i => (i ? castSkill(i) : attackButton()),   // Y7/Y35 (G2): the Attack button starts (or stops) auto-attack
  onChatSubmit: text => chat.submit(text),
  onChatFocus: on => controls.setTyping(on),
  onRise: () => rise(),
});

const controls = createControls({
  dom: $('view'), camera, heightAt: groundY,
  getTarget: () => S.target,
  onSelect: ndc => {
    if (S.phase !== 'world') return null;
    const a = actors.pickAt(ndc, { exclude: S.selfId });
    if (a) { setTarget(a.id); ui2.onPick(a); return { id: a.id, hostile: a.hostile && !a.dead }; }
    return null;
  },
  onPickGround: ndc => (S.phase === 'world' ? pickGround(ndc) : null),
  onAttack: id => { setTarget(id); tryStrike(true); },
  onCycleTarget: () => cycleTarget(),
  onClearTarget: () => setTarget(null),
  onChat: () => hud.focusChat(),
  onRise: () => rise(),
  onSkill: n => castSkill(n),
  onContext: (id, x, y) => ui2.contextAt(id, x, y),
  onAutorun: on => hud.toast(on ? 'Auto-run on. Steer with the camera; any move key stops it.' : 'Auto-run off.', 'info'),   // W20
});

// the camera stops short of buildings, fort walls and big rocks (dungeon walls come in through cameraHeight)
controls.setBlocker((ax, ay, az, bx, by, bz) => (D.view ? 1 : SOLIDS.firstHit(ax, ay, az, bx, by, bz)));

const boss = createBossUi({ actors, serverNow: () => (S.net ? S.net.clock.serverNow() : 0), toast: hud });
const menubar = createMenubar();
const social = createSocial({ net: () => S.net, hud, actors, onTarget: id => setTarget(id), myChar: () => S.net?.joined?.you?.char ?? null });
const bag = createBag({ net: () => S.net, hud, me: () => ({ level: S.self.level, cls: S.self.cls }) });   // P15: required level vs yours
const worldUi = createWorldUi({ hud, net: () => S.net, me: () => S.predictor.pos, room: () => S.room, onFootprints: heat => footprints.set(heat), callout: (t, st) => boss.callout(t, st, null, true) });

// --- M3 social windows (chat channels, friends, guild, mail, the Callboard, account, help) ------------------
const me = () => ({ name: S.self.name, level: S.self.level, cls: S.self.cls, char: S.net?.joined?.you?.char ?? null, inGuild: !!guild?.guild });
const chat = createChat({ net: () => S.net, hud, social, me, onTyping: on => controls.setTyping(on), actions: {
  openAccount: () => account.panel.open(), openFriends: () => friends.panel.open(),
  friendAdd: n => friends.add(n), friendRemove: n => friends.remove(n), isFriend: n => friends.isFriend(n),
  guildInvite: n => guild.invite(n), canGuildInvite: () => guild.canInvite(),
  command: (cmd, arg, rest) => ui2.command(cmd, arg, rest) || ui5.command(cmd, arg, rest) || ui8.command(cmd, arg, rest) || ui10.command(cmd, arg, rest),
} });
hud.chat = chat.line;                 // every system/combat/loot line lands in the chat window's All tab
hud.focusChat = prefill => chat.focus(prefill);
const friends = createFriends({ net: () => S.net, hud, chat, social });
const guild = createGuild({ net: () => S.net, hud, chat, me });
const mail = createMail({ net: () => S.net, hud, bag, me, inTown: () => S.room?.kind === 'town' });
const callboard = createCallboard({ net: () => S.net, hud, me });
const account = createAccount({ net: () => S.net, hud, me, guestKey: { get: () => { try { return localStorage.getItem(tokenKey() + '.guest'); } catch { return null; } }, clear: () => { try { localStorage.removeItem(tokenKey() + '.guest'); } catch {} } }, netOpts: () => ({ mode: netMode(), url: q.get('server') || undefined, build: q.get('build') || 'dev' }),
  onLogin: (user, pass) => loginFromTitle(user, pass), onPick: ch => enterWorld(ch), onLoggedOut: () => backToTitle(), onTitleStep: step => titleStep(step) });
const help = createHelp();
loadZoneNames();
const ui = createUiSuite({ net: () => S.net, hud, room: () => S.room, actors, objects, worldUi, social, chat, panels: { friends: friends.panel, guild: guild.panel, mail: mail.panel, callboard: callboard.panel },
  me: () => (S.selfId != null && S.phase === 'world' ? { id: S.selfId, x: S.predictor.pos.x, z: S.predictor.pos.z, yaw: S.lastInput?.yaw ?? controls.cam.yaw, level: S.self.level, cls: S.self.cls, char: S.net?.joined?.you?.char ?? null } : null) });
const ui2 = createUi2({ net: () => S.net, atlas: ui.atlas, hud, actors, controls, chat, social, friends, bag, help, account, objects, worldUi, renderer: view.renderer, scene,
  me: () => (S.selfId != null && S.phase === 'world' ? { id: S.selfId, x: S.predictor.pos.x, z: S.predictor.pos.z, level: S.self.level, name: S.self.name, dead: S.self.dead, char: S.net?.joined?.you?.char ?? null } : null),
  self: () => S.self, targetId: () => S.target, setTarget: id => setTarget(id), infoOf: id => S.mirror.infos.get(id) || null,
  avatarFor, createBody: async av => (await import('../../../../avatar-3d/js/chibi2.js')).createChibi2Character(av), defaultLook, races: PLAYABLE_RACES, raceNames: RACE_NAMES,
  titleLook: () => S.look, onLogout: () => { try { S.net?.leave(); } catch {} backToTitle(); },
  onLookPreview: (look, mode) => previewLook(look, mode), onLookSave: look => { S.look = look; store.set('look', look); previewLook(look, 'title'); if (S.titleStep === 'look') toKit(); } });
// play-test 5 (created BEFORE the key handler below, so a bite's Space / E reaches the fishing prompt first)
const ui5 = createUi5({ atlas: ui.atlas, objects, inDungeon: () => !!D.view, lootable: () => ui2.loot?.lootable || new Map(), infoOf: id => S.mirror.infos.get(id) || null, selfId: () => S.selfId, los: (ax, az, bx, bz) => sightLine(ax, az, bx, bz), net: () => S.net, hud, bag, mail, worldUi, journal: ui.journal, actors, hotbar: ui2.hotbar, askPop: ui2.askPop, build: q.get('build') || 'dev', quality,
  me: () => (S.selfId != null && S.phase === 'world' ? { id: S.selfId, x: S.predictor.pos.x, z: S.predictor.pos.z } : null), self: () => S.self, room: () => S.room, bar: () => S.bar,
  targetId: () => S.target, setTarget: id => setTarget(id), stats: () => ({ fps: FPS.fps }), zoneName: () => document.getElementById('zone-name')?.textContent || null,
  ensureNet: () => kitNet(), onKitPreview: g => { S.titleGear = g; previewLook(S.look, 'title'); }, onKitBack: () => { if (S.phase === 'title') { S.titleGear = null; toAppearance(); } }, onKitCreate: c => { S.kit = c; enterWorld(); } });
// T27: one binding table (js/client/input/bindings.js) drives the keyboard, the gamepad, the hints and — when switched on — touch
const input = installInput({ controls, hud, setTarget: id => setTarget(id), targetId: () => S.target, pause: () => ui2.escape(), inWorld: () => S.phase === 'world', dead: () => S.self.dead, settings: ui2.settings, chat: () => chat.focus(), cycleTarget: any => cycleTarget(any),
  // Y34/Y35/Y36 (G2): what the phone's own controls need to know and do (docs/requests.md "Round 10 contracts — G")
  self: () => (S.selfId != null && S.phase === 'world' ? { x: S.predictor.pos.x, z: S.predictor.pos.z, yaw: S.lastInput?.yaw ?? controls.cam.yaw, mount: S.self.mount || null, calling: S.mountCall ? { at: S.mountCall.at, until: S.mountCall.until } : null, dead: !!S.self.dead, room: S.room?.id ?? null, indoors: !!D.view } : null),
  mount: () => toggleMount(), attackButton: () => attackButton(), tracker: () => ui10,
  waterAt: (x, z) => (D.view ? null : WS.terrain.waterAt(x, z)), pools: () => angling.list(),
  project: (x, y, z) => { const v = camera.position.clone().set(x, y ?? groundY(x, z) + 1.4, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, behind: v.z > 1 }; } });
ui2.settings.on((k, v) => { if (k === 'fx') { spells.setLevel(v); sig.setLevel(v); } });     // Spell effects: at once, no reload
const ui8 = createUi8({ net: () => S.net, hud, actors, worldUi, feedback: ui5.feedback, atlas: ui.atlas, settings: ui2.settings, selfId: () => S.selfId, bar: () => S.bar });
const ui10 = createUi10({ net: () => S.net, hud, actors, atlas: ui.atlas, me, pos: () => S.predictor.pos, worldMap: ui.worldMap, settings: ui2.settings, camYaw: () => controls.cam.yaw, room: () => S.room });
friends.tracker = ui10;
ui10.useRadial(input.radial);      // Y5: the quick wheel's emote ring
// W9 (P-client): professions — the 3D side and the interface's controller
const profView = createProfView(scene, { actors, objects, camera, groundY: (x, z) => groundY(x, z), selfId: () => S.selfId });
const prof = createProf({ net: () => S.net, hud, bag, sheet: ui5.sheet, journal: ui.journal }); prof.setView(profView);
const PANELS = { ...ui5.panels, ...ui8.panels, party: { toggle: () => social.toggleMenu() }, bag: { toggle: () => bag.toggle() }, friends: friends.panel, guild: guild.panel, mail: mail.panel, callboard: callboard.panel, account: account.panel, help, ...ui.panels };
for (const b of menubar.nav.querySelectorAll('.mb-btn')) if (!['party', 'bag'].includes(b.dataset.panel)) b.addEventListener('click', () => PANELS[b.dataset.panel].toggle());
window.addEventListener('keydown', e => {
  if (S.phase !== 'world' || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) return;
  if (e.code === 'KeyE' && (ui2.useKey() || objects.useFocus())) { e.preventDefault(); e.stopImmediatePropagation(); }
  else if (PANEL_KEYS[e.code] && !e.ctrlKey && !e.metaKey && !e.altKey) PANELS[PANEL_KEYS[e.code]].toggle();
  else if (e.code === 'F1' || (e.key === '?' && !e.ctrlKey)) { e.preventDefault(); help.toggle(); }
  else if (e.key === '/' && !e.ctrlKey) { e.preventDefault(); e.stopImmediatePropagation(); chat.focus('/'); }
  else if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey) toggleMount();   // Q16
  else if (e.code === 'KeyC') { if (S.room?.kind === 'wilds') S.net?.campfire(); else hud.toast('You can only make camp out in the wilds.', 'warn'); }
  else if (e.code === 'Escape') {
    // close the top window first; only then does Esc clear the target (controls.js)
    if (worldUi.dialogOpen) { worldUi.closeDialog(); e.stopImmediatePropagation(); }
    else if (closeTop()) e.stopImmediatePropagation();
    else if (!document.getElementById('party-menu').hidden) { social.toggleMenu(false); e.stopImmediatePropagation(); }
    else if (bag.isOpen) { bag.toggle(false); e.stopImmediatePropagation(); }
    else if (S.target == null && ui2.escape()) e.stopImmediatePropagation();   // nothing open, nothing targeted: the menu (Q15)
  }
}, true);

// --- title screen -------------------------------------------------------------------------------------
let preview = null;
let CALLINGS = [];     // play-test 10 (Y32): every calling's own row — Farhold's thirty and Thousandvale's own (the Starcaller) — for the card
async function loadClasses() {
  const list = await loadCallings();
  if (list.length) { CALLINGS = list; return list; }
  return STARTERS.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) }));
}
function initTitle() {
  $('name').value = q.get('name') || store.get('name', '') || '';
  if (q.get('tab') === 'login') account.tab('login');
  if (PLAYABLE_RACES.includes(q.get('race'))) S.look.race = q.get('race');
  for (const r of PLAYABLE_RACES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.role = 'radio'; b.dataset.race = r; b.textContent = RACE_NAMES[r];
    b.onclick = () => { S.look.race = r; refreshChips(); rebuildPreview(); };
    $('races').appendChild(b);
  }
  loadClasses().then(list => {
    const name = id => list.find(c => c.id === id)?.name || id;
    for (const id of STARTERS.filter(id => list.some(c => c.id === id))) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.role = 'radio'; b.dataset.cls = id; b.textContent = name(id);
      b.onclick = () => { S.cls = id; refreshChips(); rebuildPreview(); };
      $('classes').appendChild(b);
    }
    const more = $('class-more');
    more.innerHTML = '<option value="">More callings…</option>' + list.filter(c => !STARTERS.includes(c.id)).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    more.onchange = () => { if (more.value) { S.cls = more.value; refreshChips(); rebuildPreview(); } };
    if (!list.some(c => c.id === S.cls)) S.cls = 'warrior';
    refreshChips(); rebuildPreview();
  });
  $('reroll').onclick = () => { S.look.seed = (Math.random() * 1e9) >>> 0; delete S.look.avatar; delete S.look.custom; rebuildPreview(); };
  // R1 (play-test 3): the front page lists your characters + "New character"; step 1 = name/people/calling, step 2 = the
  // appearance editor with the figure in starting clothes (class gear on a toggle); "Create character" enters the world
  $('new-char')?.addEventListener('click', () => titleStep('new'));
  $('back-front')?.addEventListener('click', () => titleStep('front'));
  $('tab-new')?.addEventListener('click', () => titleStep('front'));     // Y29: always the front card — never straight into creation
  $('tab-login')?.addEventListener('click', () => { $('front').hidden = true; });
  $('build-tag').textContent = `client ${q.get('build') || 'dev'} · ${netMode() === 'ws' ? 'online' : 'offline (in-browser server)'}`;
  $('login').addEventListener('submit', e => { e.preventDefault(); toAppearance(); });
  refreshChips();
  // Y29 (play-test 10): the title opens on the front card — "finding your characters" while the list is on its way,
  // then the list, or one "Create character" button. The new-character form shows only when you ask for it.
  titleFront = createTitleFront({ onShow: c => { S.titleChar = c; if (S.titleStep === 'front') refreshTitleFigure(); } });
  account.onChars = (list, user) => { titleFront.chars(list); titleFront.set({ hasToken: true, loaded: true, count: list.length }); };
  const expecting = !!TOKENS().get() && q.get('fresh') !== '1';
  titleFront.set({ hasToken: expecting });
  if (expecting) setTimeout(() => { if (titleFront.state.state === 'loading') titleFront.set({ hasToken: true, failed: true }); }, 12000);
  if (!AUTOPLAY && q.get('tab') !== 'login') titleStep('front');
}
/** Y29: what you are wearing, kept in this browser so the title can dress your figure next time (trimmed to what the body builder reads). */
const GEAR_KEYS = ['look', 'rarity', 'baseKey', 'base', 'subtype', 'sub', 'type', 'tier', 'isUnique', 'unique', 'isShield', 'isMagicShield', 'g5', 'el', 'castElement', 'brand', 'setId', 'packLook', 'pack', 'catalogBase', 'slot', 'twoHanded', 'hand'];
function saveTitleGear() {
  const you = S.net?.joined?.you, a = S.selfId != null ? actors.get(S.selfId) : null;
  if (S.phase !== 'world' || you?.char == null || !a?.look?.gear) return;
  const out = {};
  for (const [slot, it] of Object.entries(a.look.gear)) if (it && typeof it === 'object') { out[slot] = {}; for (const k of GEAR_KEYS) if (it[k] != null) out[slot][k] = it[k]; }
  rememberGear(you.char, out);
}
setInterval(saveTitleGear, 20000);
addEventListener('pagehide', saveTitleGear);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveTitleGear(); });
let titleFront = null;
const AUTOPLAY = (q.get('autoplay') === '1' || q.get('auto') === '1') && !!q.get('name');
/** Y29: put the title's figure in step with what the title is showing (a listed character, or the one being made). */
function refreshTitleFigure() { if (S.phase === 'world' || !W.spot) return; if (preview && actors.get('preview')) actors.setLook('preview', titleLook()); else rebuildPreview(); }
function refreshChips() {
  for (const b of document.querySelectorAll('#races .chip')) b.setAttribute('aria-checked', String(b.dataset.race === S.look.race));
  for (const b of document.querySelectorAll('#classes .chip')) b.setAttribute('aria-checked', String(b.dataset.cls === S.cls));
  const more = $('class-more'); if (more) more.value = STARTERS.includes(S.cls) ? '' : S.cls;
  drawClassCard($('class-card'), CALLINGS.find(c => c.id === S.cls) || null);      // Y32: what the calling is, before you pick it
}
function rebuildPreview() {
  if (!W.spot || S.phase === 'world') return;
  actors.remove('preview');
  const { x, z } = W.spot, y = groundY(x, z);
  preview = actors.add({ id: 'preview', kind: 'player', name: '', level: 1, hp: 1, hpMax: 1, look: titleLook(), x, y, z, yaw: 0.35 });
  preview.noPlate = true;
  preview.still = { x, y, z, yaw: 0.35 };
  store.set('look', S.look); store.set('cls', S.cls);
}

/** Q20/Q21: the appearance editor's live preview — the title figure, or you in the world at the barber's chair. */
function previewLook(look, mode) {
  if (mode === 'barber' || mode === 'revert') {
    const a = actors.get(S.selfId); if (!a) return;
    if (!look) { a.look = { ...a.look }; actors.setLook(S.selfId, { ...(S.mirror.infos.get(S.selfId)?.look || a.look), cls: a.look.cls, gear: a.look.gear }); return; }
    actors.setLook(S.selfId, { ...a.look, race: look.race, seed: look.seed, custom: lookCustom(look) || undefined, avatar: undefined, gear: a.look.gear });
    return;
  }
  if (!look) return;
  S.look = { race: look.race, seed: look.seed, ...(lookCustom(look) ? { custom: lookCustom(look) } : {}) };
  refreshChips();
  if (preview && actors.get('preview')) actors.setLook('preview', titleLook()); else rebuildPreview();
}
/** The title figure: the class outfit, or plain starting clothes while you customise (unless "Show class gear"). */
function titleLook() {
  // Y29 (report #37): on the front card the figure IS the listed character — its saved look and the gear it wears, through
  // the same lookFor() that dresses the body in the world — never whatever the new-character form last held
  if (S.titleStep === 'front' && S.titleChar) { const L = titleCharLook(S.titleChar, { remembered: rememberedGear(S.titleChar.id) }); const out = lookFor(L, S.titleChar.id, S.titleChar.cls, L.gear); if (!L.gear) delete out.gear; return out; }
  return { ...S.look, cls: S.cls, ...(S.titleGear ? { gear: S.titleGear } : S.titleBare ? { gear: {} } : {}) };   // T5: the kit you are choosing, worn
}
/** R1: which title card shows — 'front' (your characters), 'new' (name/people/calling), 'look' (the editor). */
function titleStep(step) {
  const was = S.titleStep;
  S.titleStep = step;
  $('front').hidden = step !== 'front';
  $('login').hidden = step !== 'new';
  $('signin').hidden = true;
  $('back-front').hidden = false;
  $('tab-new')?.setAttribute('aria-selected', 'true'); $('tab-login')?.setAttribute('aria-selected', 'false');
  if ((was === 'front') !== (step === 'front') && S.titleChar) refreshTitleFigure();     // the figure follows: a listed character <-> the one being made
  if (step !== 'look' && S.titleBare) { S.titleBare = false; previewLook(S.look, 'title'); }
  if (step !== 'kit' && S.titleGear) { S.titleGear = null; previewLook(S.look, 'title'); }
  if (step === 'new') setTimeout(() => $('name').focus(), 0);
}
function toAppearance() {
  const name = cleanName($('name').value);
  if (!name || name.length < 2) { $('login-note').textContent = 'Pick a name of 2–16 letters.'; return; }
  $('login-note').textContent = '';
  // an existing character of yours with that name: just play it
  if (S.net?.chars?.some(c => c.name.toLowerCase() === name.toLowerCase())) { enterWorld(); return; }
  titleStep('look');
  S.titleBare = true; previewLook(S.look, 'title');
  ui5.kits.load(S.cls);                                  // T5: have the starting kits ready by the time the face is done
  ui2.openEditor('title', { look: S.look, saveLabel: 'Next: equipment', gearToggle: { on: false, onChange: on => { S.titleBare = !on; previewLook(S.look, 'title'); } },
    onDismiss: () => { if (S.phase === 'title') titleStep('new'); } });
}

/** Play-test 6 U14: can the character see from a to b? Dungeon: no wall tile between; outdoors: no building, fort wall or big rock between. */
function sightLine(ax, az, bx, bz) {
  if (D.view) return tileLos((x, z) => D.view.terrain.walkable(x, z), ax, az, bx, bz, 0.75);
  return SOLIDS.firstHit(ax, groundY(ax, az) + 1.6, az, bx, groundY(bx, bz) + 1.2, bz) >= 0.97;
}
/** T5 (play-test 5): step 3 — starting equipment on the figure. A calling with no kits goes straight in, as before. */
async function toKit() {
  titleStep('kit');
  S.titleBare = false;
  const name = id => document.querySelector(`#classes [data-cls="${id}"]`)?.textContent || [...($('class-more')?.options || [])].find(o => o.value === id)?.textContent || id;
  // the kits may take a few seconds to arrive (a first connection): say so — never a title screen with no card and no word
  const note = $('loading'), text = $('loading-text'), was = text?.textContent;
  if (note && text) { text.textContent = 'Laying out your starting gear…'; note.classList.remove('done'); }
  let ok = false;
  try { ok = await ui5.kits.open({ cls: S.cls, className: name(S.cls) }); } catch (e) { console.warn('[kits] step tripped:', e?.stack || e?.message); ok = ui5.kits.panel.isOpen; }
  if (note && text) { note.classList.add('done'); text.textContent = was || ''; }
  if (!ok && S.phase === 'title') { S.kit = null; S.kitWhy = ui5.kits.why || ''; enterWorld(); }
}
/** The connection the kit step asks through (a guest is made under the name from step 1, exactly as entering does). */
async function kitNet() {
  const name = cleanName($('name').value);
  if (!name || name.length < 2) return null;
  const net = startNet({ guestName: name });
  const ok = await Promise.race([net.ready.then(() => true, () => false), new Promise(r => setTimeout(() => r(false), 8000))]);
  return ok ? net : null;
}
// --- connecting -----------------------------------------------------------------------------------------
const netMode = () => (q.has('offline') && q.get('offline') !== '0' ? 'worker' : 'ws');
const tokenKey = () => 'thousandvale.token.' + (netMode() === 'ws' ? (q.get('server') || location.host) : 'offline');
const TOKENS = () => localTokenStore(tokenKey());
/** The connection (one per page): a guest (made on first use, named after the title's name field) or a login. */
function startNet({ login = null, guestName = null } = {}) {
  if (S.net) return S.net;
  const mode = netMode();
  const net = connect({ mode, url: q.get('server') || undefined, build: q.get('build') || 'dev', guestName, login, tokenStore: TOKENS(), human: humanFn($('human-check')) });
  S.net = net;
  wireNet(net);
  return net;
}
function dropNet() { if (S.net) { S.net.close(); S.net = null; } }
/** Title "Log in": a fresh connection signed in with a username (this browser's guest key is set aside, not lost). */
async function loginFromTitle(user, pass) {
  const toks = TOKENS(), old = toks.get();
  if (S.net && S.net.claimed && S.net.username && S.net.username.toLowerCase() === user.toLowerCase()) return S.net.chars;
  if (old && !(S.net && S.net.claimed)) { try { localStorage.setItem(tokenKey() + '.guest', old); } catch {} }
  dropNet(); toks.set(null);
  const net = startNet({ login: { user, pass } });
  return new Promise((res, rej) => {
    const off = net.on('accountR', r => { if (r.op === 'login' && !r.ok) { off(); dropNet(); if (old) toks.set(old); rej(Object.assign(new Error(r.msg || 'Wrong username or password.'), { why: r.why })); } });
    const t = setTimeout(() => { off(); rej(new Error('The server did not answer.')); }, 15000);
    net.ready.then(n => { clearTimeout(t); off(); res(n.chars); });
  });
}
/** Logged out (or the account was): back to a clean title screen. */
function backToTitle() { saveTitleGear(); try { S.net?.close(); } catch {} location.href = location.pathname; }

async function enterWorld(pick = null) {
  const name = pick ? pick.name : cleanName($('name').value);
  if (!name || name.length < 2) { $('login-note').textContent = 'Pick a name of 2–16 letters.'; return; }
  $('login-note').textContent = '';
  if (!pick) { store.set('name', name); store.set('look', S.look); store.set('cls', S.cls); }
  S.self.name = name;
  const btn = $('enter'); btn.disabled = true; btn.textContent = 'Entering…';
  const mode = netMode();
  const fresh = !S.net;
  const net = startNet({ guestName: name });
  S.phase = 'joining';
  const fail = text => {
    $('login-note').textContent = text;
    // say it where the player is looking: on the kit step (a kit the server refused), else back on step 1 with the note showing —
    // never a title screen with every card hidden (a taken name used to end there)
    if (ui5.kits.panel.isOpen && !/name/i.test(text)) ui5.kits.failed(text);
    else if (S.titleStep === 'kit' || S.titleStep === 'look') { ui5.kits.close(); S.titleGear = null; setTimeout(() => { titleStep('new'); $('login-note').textContent = text; }, 0); } btn.disabled = false; btn.textContent = 'Next: appearance'; S.phase = 'title'; if (fresh && !net.claimed) dropNet(); };
  const timer = setTimeout(() => { if (S.phase === 'joining' && net.status !== 'online') fail(mode === 'ws' ? 'Cannot reach the game server. Add ?offline=1 to play against an in-browser server.' : 'The in-browser server did not start.'); }, 20000);
  try {
    await net.ready;
    let ch = pick || net.chars.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!ch) { const look = lookWith(S.look, lookCustom(S.look)); ch = await net.createChar({ name, cls: S.cls, look, kit: S.kit || undefined }); ui2.lookStore.set(name, look); }
    const join = (q.get('join') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || null;
    await net.play(ch.id, join ? { join } : {});
    clearTimeout(timer);
    titleFront?.played(ch);
  } catch (e) {
    clearTimeout(timer);
    fail(e.code === 'name' ? 'That name is taken. Try another.' : e.code === 'full' ? 'This account has all the characters it can hold.' : (e.message || 'Could not enter the world.'));
  }
}

const TAPS = new Map();   // event -> every handler the client registered (tv.fake plays a server message through all of them)
function wireNet(net) {
  const on0 = net.on;
  net.on = (ev, fn) => { (TAPS.get(ev) || TAPS.set(ev, []).get(ev)).push(fn); return on0(ev, fn); };
  net.on('status', st => {
    const pill = st === 'online' ? 'open' : st === 'reconnecting' ? 'reconnecting' : ['refused', 'kicked', 'closed', 'left'].includes(st) ? 'closed' : 'connecting';
    hud.conn(pill, { rtt: net.clock.rtt, mode: netMode() });
    if (st === 'reconnecting' && S.phase === 'world') hud.toast('Connection lost — reconnecting…', 'warn');
  });
  net.on('pong', p => hud.conn(net.status === 'online' ? 'open' : 'connecting', { rtt: p.rtt, mode: netMode() }));
  net.on('kick', k => {
    const text = k.code === 'elsewhere' ? 'You logged in from another tab.' : k.code === 'version' || k.code === 'build' ? 'A new version is out — reload the page.' : k.msg || 'Disconnected.';
    hud.toast(text, 'bad'); hud.chat(text, 'bad');
    if (S.phase !== 'world') $('login-note').textContent = text;
    if (k.code === 'loggedOut') backToTitle();
  });
  net.on('joined', onJoined);
  net.on('info', ents => { S.mirror.info(ents); for (const i of ents) refreshFromInfo(i.id); });
  net.on('snap', onSnap);
  net.on('ev', ({ k, e }) => { S.evTick = k; for (const ev of e) onEvent(ev); });
  net.on('you', patch => {
    const levelled = patch.level != null && patch.level > S.self.level;
    if (patch.level != null) S.self.level = patch.level;
    if (patch.xp != null) S.self.xp = patch.xp;
    if (patch.xpNext != null) S.self.next = patch.xpNext;
    if (patch.hpMax != null) S.self.hpMax = patch.hpMax;
    if (patch.hp != null) S.self.hp = patch.hp;
    if ('reach' in patch || patch.attackRange != null) S.reach = basicReach();
    hud.setSelf(S.self);
    if (Array.isArray(patch.bar)) refreshBar();   // §15.10: level-up, form/stance, talent pick (client.js merged it into joined.you)
    if (levelled) levelFlash(S.selfId);
    // Q16: riding — the predictor walks at the server's speed factor, and my body sits on the mount
    if (patch.lightRange != null) { S.lightRange = +patch.lightRange || null; view.setCarryLight({ range: S.lightRange }); }   // W22: C's radius, when the server sends one
    if (patch.speedMul != null) S.predictor.speedMul = patch.speedMul;
    if ('mount' in patch) { endMountCall(); S.self.mount = patch.mount || null; actors.setMount(S.selfId, S.self.mount); if (patch.dismount && patch.dismount !== 'asked') hud.toast({ cast: 'You get down to fight.', hit: 'You are thrown from the saddle!', swim: 'Your mount will not swim.', dead: 'You fall from the saddle.' }[patch.dismount] || 'You get down.', 'warn'); }
    if ('regen' in patch) actors.setEating(S.selfId, patch.regen ? patch.regen.kind || 'food' : null);   // S20
    if (patch.mountNew) hud.toast('You have a mount! Press H to ride.', 'good');
  });
  net.on('lootable', m => { lootMarks.set(m.id, m.on !== false, m.best || m.rarity || (m.free ? 'magic' : null)); if (m.on === false && S.target === m.id && actors.get(m.id)?.dead) setTarget(null); });   // Y8: an emptied corpse is let go of
  net.on('lootWin', m => { if (m.closed) lootMarks.set(m.id, false); });
  net.on('mountR', r => {
    if (!r.ok && r.msg) hud.toast(r.msg, 'warn');
    if (!r.ok) endMountCall();                                                      // W26: refused or broken — you may move again
    else if (r.casting && S.mountCall) S.mountCall.until = performance.now() + r.casting + 900;
  });
  net.on('equip', m => { S.reach = basicReach(m.equipment); });
  net.on('equip', m => { const a = actors.get(S.selfId); if (a && m.equipment) actors.setLook(S.selfId, { ...a.look, gear: ui2.gearFor(m.equipment) }); });   // Q22: shown as the settings say   // P22: what I wear, on me
  net.on('chat', m => { if (m.ch === 'say' && m.from != null) actors.say(m.from, m.text); });   // the line itself: chat.js
  net.on('zone', z => learnZone(z.zone, z.name));
  social.wire(net);
  chat.wire(net); friends.wire(net); guild.wire(net); mail.wire(net); callboard.wire(net); account.wire(net);
  bag.wire(net);
  ui5.wire(net);
  ui8.wire(net); ui10.wire(net);
  ships.wire(net);      // [V] the Harbourmaster window, the voyage
  prof.wire(net);   // W9 (P-client)
  ui.wire(net);
  worldUi.wire(net);
  ui2.wire(net);
  net.on('relocate', () => { travel.cover('Crossing into another province…'); hud.toast('Crossing into another province…', 'info'); });
  // P10: the moment a waystone jump is granted, veil the screen and start loading the far stone's ground
  net.on('travelR', r => {
    if (!r.ok || S.phase !== 'world') return;
    travel.cover('Travelling…');
    // a jump inside the SAME room brings no `joined` to lift the veil: lift it once the move has had time to land
    setTimeout(() => { if (travel.covered) travel.reveal(); }, (r.delayMs || 1500) + 2000);
    // A sends where (`at`, `province`) and moves us `delayMs` (1.5 s) later: stream that ground in behind the veil now
    const w = r.at || (S.room?.waystones || []).find(x => x.key === r.to);
    if (w && (!r.province || r.province === S.room?.province) && WS.terrain.zoneAt(w.x, w.z)) WS.whenReady(w.x, w.z);
  });
  net.on('used', u => {
    if (u.ok && u.kind === 'cache') objects.markOpened(u.id);
    if (worldUi.onUsed(u)) return;
    if (!u.ok) { hud.toast(u.msg || ({ far: 'Too far away.', opened: 'Already emptied.', dead: 'You are dead.', unknown: 'Nothing happens.' }[u.why]) || 'Nothing happens.', 'warn'); if (u.why === 'opened') objects.markOpened(u.id); return; }
    const o = objects.items.get(u.id);
    if (o?.type === 'chest') objects.markOpened(u.id);
    if (o?.type === 'lever' && D.view) { D.view.openGate(D.view.floorAt(o.x, o.z)); hud.toast('Somewhere, a gate grinds open.', 'info'); }
    if (u.msg) hud.toast(u.msg, 'info');
  });
  net.on('targetR', r => { if (S.target === r.id) setTarget(null); hud.toast(r.why === 'range' ? 'Too far away to target.' : 'You cannot target that.', 'warn'); });
  // play-test 7 (V3): the open fish pools of the zone, listed beyond entity range (asked of A: `fishPools {open: [{id, x, z, tier}]}`)
  // W5: A granted a cart ride — you sit on the bed, it pulls away toward the town, the veil closes; the arrival is the usual `joined`
  net.on('cartRide', m => {
    if (S.phase !== 'world' || S.selfId == null) return;
    const p = S.predictor.pos;
    carts.startRide(m, { self: { x: p.x, z: p.z }, cover: text => travel.cover(text) }).then(ok => {
      if (!ok) return;
      controls.hold(true); controls.stop(); actors.setEating(S.selfId, 'food'); S.cartRide = true;
      hud.toast(`You climb aboard${m.to?.name ? ' for ' + m.to.name : ''}.`, 'info');
    });
  });
  net.on('cartR', r => { if (r && r.ok === false) endCartRide(); });
  // round 9 (A): a raid wave walks in through a gate — `gate {id, x, z}` on the event's view. A brief red ring and arrow at that gate.
  const gatePing = m => { const g = m?.gate || m?.ev?.gate; if (!g || !Number.isFinite(g.x) || D.view) return; const k = `${g.id ?? ''}:${Math.round(g.x)}:${Math.round(g.z)}`; if (S.gatePinged === k && performance.now() - (S.gatePingAt || 0) < 20000) return; S.gatePinged = k; S.gatePingAt = performance.now(); moveMark.ping(g.x, g.z, { ms: 10000 }); };
  net.on('eventTrack', gatePing); net.on('zoneEvent', gatePing); net.on('realm', gatePing);
  net.on('questMarks', m => questMarks.onMessage(m));        // W12 (protocol v8: whole map with `full`, then patches)
  net.on('fishPools', m => { try { angling.setKnown(m.open || m.list || []); } catch {} });
  net.on('castR', r => {
    if (r.slot > 0 && S.cds) { S.cds[r.slot] = 0; hud.cooldown(r.slot, 0); }
    if (r.why === 'cooldown' && !(r.slot > 0)) { S.swing.ms = Math.min(2500, S.swing.ms + 60); return; }
    if (r.why === 'range' && !(r.slot > 0)) { const t = actors.get(S.target); S.reach = shortenReach(S.reach, { need: r.need, dist: t ? Math.hypot(t.pos.x - S.predictor.pos.x, t.pos.z - S.predictor.pos.z) : null }); }   // T14: only the basic attack's own refusal, and only ever shorter
    hud.toast(r.text || CASTR_TEXT[r.why] || 'You cannot do that.', 'warn');
  });
}

function onJoined(j) {
  const prevRoom = S.room, prevSelf = S.selfId;
  // P10: a jump (waystone, door, respawn, relocate) fades out and back in over the rebuild; a walk across a town
  // edge onto the same ground does not
  const jumped = S.phase === 'world' && isJump(j.handoff, S.predictor.pos, j.you);
  if (jumped) travel.cover(j.room.dungeon ? 'Descending…' : j.handoff?.via === 'respawn' ? 'You wake…' : 'Travelling…');
  S.room = j.room; S.selfId = j.you.id;
  S.mirror.reset();
  // Every id in the old room is void now — except our own body, which keeps its model under the new id.
  const keep = prevSelf != null && actors.get(prevSelf) ? prevSelf : null;
  held.clear();
  for (const id of [...actors.actors.keys()]) if (id !== keep) actors.remove(id);
  if (keep != null) { actors.rekey(keep, S.selfId); statusSync.dead(S.selfId); }   // C/Q8: the kept body starts the new room with no stale aura or torch
  if (S.target != null) setTarget(null);
  tele.clear(); objects.clear(); boss.clear(); angling.clearPools(); profView.clear(); questMarks.roomChanged(); endCartRide(); carts.clear();
  worldUi.joined(j);
  preview = null;
  const you = j.you;
  Object.assign(S.self, { name: you.name, cls: you.cls, level: you.level, xp: you.xp || 0, next: you.xpNext || 100, hp: you.hp, hpMax: you.hpMax, mp: you.mp ?? 0, mpMax: you.mpMax ?? 0, dead: you.hp <= 0 });
  S.reach = basicReach(you.equipment);         // Q1: a ranged weapon fires from range
  S.predictor.locked = S.self.dead;
  S.predictor.speedMul = you.speedMul || 1; S.self.mount = you.mount || null;
  S.lightRange = +you.lightRange || +you.light?.radius || null; view.setCarryLight({ range: S.lightRange, dungeonRange: +you.light?.dungeonRadius || null, dungeonAmbient: +you.light?.dungeonAmbient || null }); endMountCall();
  useRoom(j.room, { x: you.x, z: you.z }).then(() => {
    S.predictor.reset({ x: you.x, y: you.y, z: you.z });
    const a = actors.get(S.selfId) || actors.add({ id: S.selfId, kind: 'player', name: you.name, level: you.level, hp: you.hp, hpMax: you.hpMax, hostile: false,
      look: lookFor(S.mirror.infos.get(S.selfId)?.look || { race: S.look.race, seed: S.look.seed, ...(lookCustom(S.look) ? { custom: lookCustom(S.look) } : {}) }, you.char, you.cls, ui2.gearFor(you.equipment || S.mirror.infos.get(S.selfId)?.gear || {})), x: you.x, y: you.y, z: you.z, yaw: you.yaw }, { self: true });
    a.self = true;
    // P8: a respawn that lands in another room (the graveyard town) arrives as `joined`, not as a snapshot with
    // dead=false — the body kept its corpse pose for good ("my character never stood up")
    actors.setDead(S.selfId, S.self.dead); actors.setHp(S.selfId, you.hp, you.hpMax); actors.setMount(S.selfId, S.self.mount);
    controls.setFacing(you.yaw || 0); controls.cam.yaw = you.yaw || 0;
    hud.setSelf(S.self);
    refreshBar();
    if (S.phase !== 'world') startWorld(j);
    else if (prevRoom && prevRoom.id !== j.room.id && j.room.name !== prevRoom.name) { hud.zone(j.room.name); hud.chat(`You enter ${j.room.name}.`, 'system'); if (j.room.dungeon) hud.chat('Find the stairs down; the reward waits past the boss.', 'system'); }
    else if (!prevRoom || prevRoom.id === j.room.id) hud.toast('Reconnected.', 'good');
    if (travel.covered) travel.reveal();
  });
}

/** A player's look in the world: body from `look`, clothes = exactly the worn `gear` (P22; plain clothes where empty). */
function lookFor(look, charId, cls, gear = {}) {
  const base = look && (look.race || look.avatar || look.custom || look.body) ? { ...look, cls: look.cls || cls } : defaultLook(charId ?? 0, cls);
  return { ...base, gear: gear || {} };
}

/** Make sure an actor exists for a mirrored entity. */
function ensureActor(id) {
  if (id === S.selfId) return actors.get(id);
  const e = S.mirror.ents.get(id); if (!e || e.x === undefined) return null;
  let a = actors.get(id);
  if (!a) {
    const info = e.info || S.mirror.infos.get(id) || {};
    const kind = info.kind || KIND_NAMES[e.kind] || 'monster';
    if (kind === 'object') {
      objects.upsert({ id, type: info.type, name: info.name, x: e.x, z: e.z, yaw: e.yaw || 0, r: info.r, state: info.state, source: 'room', opened: info.type === 'chest' && wasOpened(info.key),
        hidden: !!info.hidden, hint: info.hint, lore: info.lore, shimmer: info.shimmer, key: info.key, banner: info.banner || null, trace: info.trace || null, look: info.look || null, tether: info.tether ?? null, bare: !!info.bare });   // R7: look 'chained' + tether · #63: bare = the place draws it already
      if (info.type === 'fishpool') angling.setPool(id, { x: e.x, z: e.z }, info.pool || null);
      if (info.type === 'node') profView.setNode(id, { x: e.x, z: e.z, yaw: e.yaw || 0 }, info);   // W9 (P-client): boulders, marked trees, patches
      if (info.type === 'cart' || info.vehicle) carts.setParked(id, { x: e.x, z: e.z, yaw: e.yaw ?? info.yaw ?? 0 });   // W5: the ox cart by the gate     // T25: ripples and a jumping fish, seen from the road
      objectState(id, info);
      return null;
    }
    const hpMax = info.hpMax || 100;
    const y = e.y ?? groundY(e.x, e.z);
    const npc = kind === 'npc' && (info.type === 'npc' || !!info.role);      // town folk and vignette people
    const pet = kind === 'npc' && !npc;                                     // companions: beasts on your side
    a = actors.add({
      id, kind, name: npc ? (info.name || 'Townsfolk') : displayName(info.name, kind), level: info.level || 1,
      hp: Math.round((e.hp ?? 1) * hpMax), hpMax, hostile: !npc && (info.team === 2 || (kind === 'monster' && info.team !== 1)),
      look: kind === 'player' ? lookFor(info.look, info.char ?? id, info.cls, info.gear) : npc ? folkLook(info, id) : null,
      creature: kind === 'monster' || pet ? { type: info.type || 'wolf', seed: (id * 7919) >>> 0 } : null, family: info.type && !npc ? displayName(info.type, 'monster') : null,
      x: e.x, y, z: e.z, yaw: e.yaw || 0, rank: info.rank || null, role: info.role || null, pet, mods: info.aff || info.mods || info.affixes || null, sc: info.sc || null,   // S4 (protocol §20.4: aff [{id, name, aura?}], sc)
    });
    if (npc) { objects.upsert({ id, type: 'npc', name: a.name, x: e.x, z: e.z, source: 'room' }); if (info.office) WS.claimOffice(info.office); }   // Q10: its own building, dressed
    if (npc && info.held) held.set(id, info.held);
    if (npc && info.role) profView.setNpc(id, { x: e.x, z: e.z, yaw: e.yaw || 0 }, info.role);   // W9 (P-client): a craftsman's forge / workbench / still beside him
    if (kind === 'player' && info.working) profView.setWorking(id, info.working);
    if (e.state & STATE.dead) actors.setDead(id, true);
    if (kind !== 'player' && info.vehicle) carts.setRoaming(id, true);                          // W5: a carter on the road leads an ox cart
    if (kind === 'player' && info.mount) actors.setMount(id, info.mount);
    if (kind === 'player' && info.form) actors.setShape(id, shapeOfForm(info.form));          // U16: arrived already shaped
  }
  return a;
}
/** A chest key this character already emptied (joined.you.opened: an array of keys at M2, an object of expiry times before). */
function wasOpened(key) {
  const o = S.net?.joined?.you?.opened;
  if (!key || !o) return false;
  return Array.isArray(o) ? o.includes(key) : !!(o[key] && o[key] > Date.now());
}
/** Town folk wear their trade: a class outfit that reads as the job, from a stable seed. */
const ROLE_CLASS = { smith: 'warrior', merchant: 'bard', elder: 'cleric', innkeeper: 'monk', healer: 'cleric', unbinder: 'mage', broker: 'rogue', guard: 'knight' };
function folkLook(info, id) {
  const d = defaultLook((info.key || info.name || 'folk') + ':' + (info.role || ''), ROLE_CLASS[info.role] || 'ranger');
  return { race: d.race, seed: d.seed, cls: d.cls };
}

/** Monster names arrive as type ids ("wolf", "moor_hound"); show them as names. */
function displayName(n, kind) {
  if (!n) return kind === 'monster' ? 'Creature' : 'Adventurer';
  return kind === 'player' ? n : n.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function objectState(id, info) {
  if (!info || info.kind !== 'object') return;
  objects.upsert({ id, state: info.state, name: info.name });
  if (info.type === 'gate' && info.state === 'open' && D.view) { const o = objects.items.get(id); if (o) D.view.openGate(D.view.floorAt(o.x, o.z)); }
}
/** U16: the body in a form record / `fx form` event, or null (stances, tempers and songs have no body). C: `{ group:'shape', creature | shape:{…} }`. */
function shapeOfForm(f) {
  if (!f || typeof f !== 'object' || f.on === false) return null;
  const sh = f.shape && typeof f.shape === 'object' ? f.shape : f.body && typeof f.body === 'object' ? { id: f.id || f.form, ...f.body } : f;
  if ((f.group || sh.group || 'shape') !== 'shape') return null;
  const creature = [sh.creature, sh.body, f.body].find(v => typeof v === 'string');
  return creature ? { id: sh.id || f.form || f.id || creature, creature, scale: sh.scale, colors: sh.colors, upright: sh.upright } : null;
}
function refreshFromInfo(id) {
  objectState(id, S.mirror.infos.get(id));
  const a = actors.get(id), info = S.mirror.infos.get(id);
  if (info?.type === 'fishpool' && info.pool) angling.setPool(id, null, info.pool);     // T25: a fished-out pool goes (left 0)
  if (!a || !info) return;
  if (info.held) held.set(id, info.held);                   // #59: the captive was freed — `held.open` swings the cage door
  if (a.kind === 'player') angling.setLine(id, info.fishing || null);
  if (a.kind === 'player') profView.setWorking(id, info.working || null);              // W9 (P-client): at a node or a station (late arrivals see the loop and the tool)                  // T25: a line in the water (late arrivals see the float)
  // play-test 6 (U16/U18): a druid's shape changes the MODEL — `info.form` (group 'shape') carries the creature; null changes back
  if (a.kind === 'player' && 'form' in info) actors.setShape(id, shapeOfForm(info.form));
  // U8: a boss ward for someone who walks in late (`info.ward {max, ms, until}`); the live changes come as `fx shield`
  if (a.kind === 'monster' && 'ward' in info) { const w = info.ward, on = !!w && w.on !== false; if (on !== (boss.ward.shielded && boss.bossId === id)) { let left = on && w.until ? w.until - (S.net ? S.net.clock.serverNow() : Date.now()) : null; if (on && !(left > 0 && left <= (w.ms || 6e4) + 500)) left = w.leftMs ?? w.ms ?? 0; boss.shield(id, on, on ? { ms: left, total: w.ms, text: w.text || null, need: w.need, have: w.have } : { why: 'faded' }); } }
  const levelled = info.level > a.level;
  a.name = info.name ? displayName(info.name, a.kind) : a.name; a.level = info.level || a.level; a.hpMax = info.hpMax || a.hpMax;
  actors.refreshPlate(a);
  // P22: another player (or my own entity, seen by the server) changed what they wear
  if (a.kind === 'player' && info.gear && gearKey(info.gear) !== gearKey(a.look?.gear || {}) && !(id === S.selfId && S.net?.joined?.you?.equipment)) actors.setLook(id, { ...a.look, gear: info.gear });
  // Q20/Q21: a new face or body (the barber, the title editor) reaches everyone through info.look; gear stays as worn
  if (a.kind === 'player' && info.look && lookSig(info.look) !== lookSig(a.look)) actors.setLook(id, { ...a.look, race: info.look.race || a.look?.race, seed: info.look.seed ?? a.look?.seed, custom: lookCustom(info.look) || undefined, gear: a.look?.gear });
  if (a.kind === 'player' && id !== S.selfId) { actors.setMount(id, info.mount || null); actors.setEating(id, info.sit ? 'food' : info.eat || null); }   // S20: others eat sitting down too (info.eat)   // Q16: everyone sees the rider
  if (levelled && id !== S.selfId) levelFlash(id);
}
/** The part of a look that is the body (not the clothes): race, seed and the editor's avatar. */
const lookSig = l => (l ? `${l.race || ''}|${l.seed ?? ''}|${lookCustom(l) ? JSON.stringify(lookCustom(l)) : ''}` : '');

function onSnap(s) {
  S.stats.snaps++; S.stats.bytes += s.bytes || 0;
  S.mirror.snap(s);
  if (s.self && S.selfId != null && (D.view || WS.ready(S.predictor.pos.x, S.predictor.pos.z))) {
    const d = S.predictor.reconcile(s.ack, s.self);
    if (d > 0.02) { S.stats.corrections++; S.stats.maxCorrection = Math.max(S.stats.maxCorrection, d); }
  }
  if (s.vitals) { S.self.hp = s.vitals.hp; S.self.hpMax = s.vitals.hpMax; S.self.mp = s.vitals.mp; S.self.mpMax = s.vitals.mpMax; actors.setHp(S.selfId, s.vitals.hp, s.vitals.hpMax); hud.setSelf(S.self); }
  if (S.selfId != null && !!s.dead !== S.self.dead) setSelfDead(!!s.dead);
  for (const id of s.left) { held.remove(id); carts.remove(id); actors.remove(id); objects.remove(id); angling.removePool(id); angling.setPhase(id, 'end'); profView.remove(id); if (S.target === id) setTarget(null); }
  for (const r of s.ents) {
    if (r.id === S.selfId) continue;
    const a = ensureActor(r.id); if (!a) continue;
    if (r.hp !== undefined) actors.setHp(r.id, Math.round(r.hp * (a.hpMax || 1)));
    if (r.state !== undefined) {
      const dead = !!(r.state & STATE.dead);
      if (dead !== a.dead) actors.setDead(r.id, dead);
      if (r.state & STATE.combat) a.lastCombat = performance.now();
    }
    if (r.target !== undefined) a.tgt = r.target;
    if (r.anim !== undefined && r.animSeq !== a.animSeq) {
      const first = a.animSeq === undefined;
      a.animSeq = r.animSeq;
      const name = ANIMS[r.anim];
      if (name === 'hit') actors.playHit(r.id, null, 1);
      else if (name === 'die' || name === 'dead') actors.setDead(r.id, true);
      else if (ONE_SHOT.has(name) && !first) actors.playAttack(r.id, a.tgt);
      if (!first && (name === 'idle' || name === 'walk' || name === 'run')) held.release(r.id);   // #59: a captive who gets up has been freed — the cage door swings open
    }
  }
  if (S.target != null) hud.setTarget(actors.get(S.target));
}

function remember(ev) { S.events.push(ev); if (S.events.length > 200) S.events.shift(); }
function onEvent(ev) {
  if (!ev.type && ev.t) ev = { ...ev, type: ev.t };   // encounter events may still carry `t`
  remember(ev);
  if (ev.type === 'fx' && ev.kind === 'channel' && ev.ab === 'mount' && ev.end && ev.id === S.selfId) endMountCall();   // W26
  // W1 (C): a town guard never dies — at 0 health it is DOWN on one knee for a while, then up; a sergeant's rally is a shout and a glow
  if (ev.type === 'fx' && ev.kind === 'guard') {
    const g = actors.get(ev.id);
    if (g) {
      if (ev.down === 1 || ev.down === true) { actors.setEating(ev.id, 'food'); g.guardDown = true; }
      else if (ev.down === 0 || ev.down === false) { actors.setEating(ev.id, null); g.guardDown = false; actors.playClip(ev.id, 'standUp'); }
      if (ev.say) actors.say(ev.id, ev.say);
      if (ev.rally) { try { spells.fx.cast({ at: new THREE.Vector3(g.pos.x, g.pos.y + 1.2, g.pos.z), element: 'holy', ms: 600, ground: g.pos.y }); } catch {} }
    }
    return;
  }
  if (ev.type === 'cast' || ev.type === 'hit' || ev.type === 'fx') { spells.onEvent(ev); sig.onEvent(ev); statusSync.onEvent(ev); statusSync.onChannel(ev); weaponFx.onEvent(ev); formFx.onEvent(ev); reviveFx.onEvent(ev); angling.onEvent(ev); profView.onEvent(ev); }
  const me = S.selfId;
  switch (ev.type) {
    case 'cast':
      if (ev.s === me) {
        S.swing.last = performance.now();
        // Q1 (C): the basic attack's own pace, and a bow's draw then loose ('draw' / 'shoot') as two plays
        if (!(ev.slot > 0) && Number.isFinite(ev.every) && ev.every > 0) S.swing.ms = ev.every;
        if (ev.clip === 'draw' || ev.clip === 'shoot') actors.playAttack(me, ev.target, { force: true });
        else if (ev.hand === 'off') actors.playAttack(me, ev.target, { hand: 'off' });          // T6/T7: the off hand swings on its own clock (C)
      } else actors.playAttack(ev.s, ev.target, { hand: ev.hand, force: ev.clip === 'shoot' });   // T6: a pair of weapons picks its own strike (actors.js swingClip)
      break;
    case 'hit': {
      const dst = actors.get(ev.d), src = actors.get(ev.s);
      if (!dst) break;
      const at = { x: dst.pos.x, y: dst.pos.y + dst.height * 0.75, z: dst.pos.z };
      const mine = ev.s === me, onMe = ev.d === me;
      if (ev.kind === 'heal') { fx.number(at, `+${ev.n}`, 'heal'); break; }
      if (ev.kind === 'absorb') { fx.number(at, 'Absorbed', 'miss'); break; }
      if (dst.id !== me) actors.setHp(dst.id, Math.max(0, dst.hp - ev.n));   // the snapshot confirms a moment later
      actors.playHit(ev.d, ev.s, ev.n);
      fx.burst(at, { blood: dst.kind === 'monster', count: ev.crit ? 12 : 7 });
      if (mine) {
        fx.number(at, ev.crit ? `${ev.n}!` : `${ev.n}`, ev.crit ? 'crit' : 'out'); fx.shake(ev.crit ? 0.55 : 0.28); fx.hitStop(ev.crit ? 90 : 55);
        // T14: a hit from further out only teaches the reach when the server never said it (a spell landing at 25 m taught a 9 m cone wand to fire from 25 m)
        if (src && !S.reachKnown && (!ev.skill || ev.skill === 'basic' || ev.skill === 'melee' || ev.skill === 'arrow' || ev.skill === 'bolt')) S.reach = Math.max(S.reach, Math.min(30, Math.hypot(dst.pos.x - src.pos.x, dst.pos.z - src.pos.z)));
      } else if (onMe) { fx.number(at, `-${ev.n}`, 'in'); fx.shake(0.35); }
      else fx.number(at, `${ev.n}`, 'other');
      break;
    }
    case 'miss': {
      const dst = actors.get(ev.d); if (!dst) break;
      fx.number({ x: dst.pos.x, y: dst.pos.y + dst.height * 0.75, z: dst.pos.z }, ev.d === me ? 'Dodged' : ev.why === 'block' ? 'Blocked' : 'Miss', 'miss');
      break;
    }
    case 'die': {
      actors.setDead(ev.d, true); statusSync.dead(ev.d);
      tele.dropSource(ev.d); spells.ownerGone(ev.d); shots.drop(ev.d); stars.ownerGone(ev.d);          // (W2: a shot still in the air from the dead lands on nobody — C cancels its hit)          // play-test 6 (U3): what the dead were casting is gone with them, at once
      const a = actors.get(ev.d), by = actors.get(ev.by);
      if (ev.d === me) { setSelfDead(true); hud.chat(by ? `You were slain by ${by.name}.` : 'You have fallen.', 'bad'); }
      else if (a && ev.by === me) hud.chat(`You have slain ${a.name}.`, 'combat');
      if (S.target === ev.d) retargetAfterKill();
      break;
    }
    case 'xp': {
      const a = actors.get(me);
      if (a && ev.n > 0) fx.number({ x: a.pos.x, y: a.pos.y + a.height + 0.4, z: a.pos.z }, `+${ev.n} XP`, 'xp');
      if (ev.total != null) { S.self.xp = ev.total; hud.setSelf(S.self); }
      break;
    }
    case 'level': {
      if (ev.d === me) { S.self.level = ev.level; hud.setSelf(S.self); hud.toast(`You reached level ${ev.level}!`, 'good'); hud.chat(`You reached level ${ev.level}.`, 'system'); refreshBar(); }
      const a = actors.get(ev.d); if (a) { a.level = ev.level; actors.refreshPlate(a); }
      levelFlash(ev.d);
      break;
    }
    case 'loot':
      if (ev.d === me || ev.to === me) {
        if (ev.gold) hud.chat(`You pick up ${ev.gold} gold.`, 'loot');
        for (const it of ev.items || []) { const need = (it.levelReq || 0) > S.self.level ? ` (needs level ${it.levelReq})` : ''; hud.chat(`You loot: ${it.name}${need}`, 'loot rarity-' + (it.rarity || 'common')); hud.toast(it.name + need, 'loot rarity-' + (it.rarity || 'common')); }   // P15
      }
      break;
    case 'open': objects.markOpened(ev.d); break;
    case 'tele': tele.add(ev, (S.evTick ?? 0) * TICK_MS); break;
    case 'teleM': tele.move(ev); break;                                   // Y12: knocked back mid wind-up — the warning goes with the caster
    case 'emote': actors.playEmote(ev.id, ev.e, { ms: ev.ms, end: !!ev.end }); break;   // Y5: /wave /sit /dance /cheer /bow /point, and the wave while a mount comes
    case 'teleR': {
      const t = tele.resolve(ev);
      if (t && !ev.x) {
        const at = { x: t.x, y: groundY(t.x, t.z) + 0.4, z: t.z };
        fx.burst(at, { color: { fire: '#ff9a3d', frost: '#8fe4ff', poison: '#9ef06a', shadow: '#c08aff', lightning: '#fff08a' }[t.el] || '#ff6a4a', count: 14 });
      }
      break;
    }
    case 'boss': case 'phase': case 'castbar': case 'castX': case 'enrage': case 'say': case 'fx': if (ev.type === 'fx' && ev.kind === 'interrupt' && ev.id != null) { tele.dropSource(ev.id); const ia = actors.get(ev.id); if (ia) fx.number({ x: ia.pos.x, y: ia.pos.y + ia.height + 0.3, z: ia.pos.z }, 'Interrupted', 'miss'); }   /* Y12 */ if (ev.type === 'fx' && ev.kind === 'form' && (ev.group || 'shape') === 'shape') actors.setShape(ev.id, ev.on === false ? null : shapeOfForm(ev)); if (ev.type === 'castX' && ev.id != null) tele.dropSource(ev.id); boss.onEvent(ev); break;   // U3: an interrupted cast takes its telegraph with it
    case 'obj': objects.onObj(ev); break;
    case 'aggro':
      if (ev.d === me) { const a = actors.get(ev.s); if (a) fx.number({ x: a.pos.x, y: a.pos.y + a.height + 0.3, z: a.pos.z }, '!', 'in'); }
      break;
  }
}
function levelFlash(id) { const a = actors.get(id); if (a) fx.burst({ x: a.pos.x, y: a.pos.y + 1, z: a.pos.z }, { color: '#ffe08a', count: 24 }); }

/** Q16: H — call your fastest mount, or get down. The server says no in a fight, in water or indoors (mountR). */
function toggleMount() {
  if (!S.net) return;
  if (S.mountCall && !S.self.mount) { endMountCall(); S.net.mount('cancel'); return; }     // W26: a second press calls it off (protocol §24)
  if (S.self.mount) { S.net.mount('off'); return; }     // W26: a second press calls it off (the server ends the channel: why 'asked')
  // W26: you stand still for the call — from the key press, not from the server's answer, so the steps already on their
  // way are the last ones. Keys, the stick, auto-run and a click-to-move goal are kept and carry on once you are up.
  S.mountCall = { at: performance.now(), until: performance.now() + 4000 };
  controls.hold(true);
  S.net.mount('summon');
}
/** W5: off the cart (arrived, refused, or the room changed): the cart goes home, you stand, you may move. */
function endCartRide() { if (!S.cartRide && !carts.riding) return; S.cartRide = false; carts.endRide(); if (!S.mountCall) controls.hold(false); if (S.selfId != null) actors.setEating(S.selfId, null); }
/** W26: the call is over (riding, refused, broken, called off): movement is let through again. */
function endMountCall() { if (!S.mountCall) return; S.mountCall = null; if (!S.cartRide) controls.hold(false); }
function setSelfDead(dead) {
  if (S.self.dead === dead) return;
  S.self.dead = dead; S.predictor.locked = dead;
  actors.setDead(S.selfId, dead); statusSync.dead(S.selfId);   // Q8: no aura survives a death or a revive
  if (dead) { S.self.deadAt = performance.now(); controls.stopChase(); }
  else { hud.toast('You rise again.', 'good'); if (travel.covered) setTimeout(() => travel.reveal(), 50); }
}
function rise() { if (S.self.dead && S.net && performance.now() - S.self.deadAt > 2500) { S.net.respawn(); travel.cover('You wake…'); } }

function startWorld(j) {
  S.phase = 'world';
  $('title').classList.add('leaving');
  setTimeout(() => { $('title').hidden = true; }, 650);
  hud.show();
  hud.setSelf(S.self);
  account.refreshPill();
  ui5.kits.close(); S.titleGear = null; S.kit = null;
  if (S.kitWhy) { hud.chat(`${S.kitWhy} You start in your calling's usual gear.`, 'system'); hud.toast(S.kitWhy, 'warn'); S.kitWhy = ''; }
  if (!S.net?.claimed) hud.chat('You are playing as a guest. Open Account (the person button, right) to claim it — free — and keep this character.', 'system');
  const zone = j.room.name || 'The Vale';
  hud.zone(zone);
  hud.chat(`Welcome to ${zone}.`, 'system');
  if (netMode() !== 'ws') hud.chat('Offline: the whole server is running inside this tab.', 'system');
  hud.chat('Wolves prowl near the waystone. Right-click one to attack; Tab picks the next.', 'system');
  window.addEventListener('pagehide', () => S.net?.leave());
}

// --- targeting and combat --------------------------------------------------------------------------------
function setTarget(id) {
  if (id === S.selfId) id = null;
  S.target = id ?? null;
  if (S.net && S.phase === 'world') S.net.target(id || undefined);
  hud.setTarget(id != null ? actors.get(id) : null);
}
function retargetAfterKill() {
  const wasChasing = controls.auto != null;      // Y7/Y35 (G2): the ATTACK carries over to the next enemy on you, whether or not you were walking at it
  controls.stopChase();
  const me = actors.get(S.selfId); if (!me) return;
  const next = [...actors.actors.values()].filter(x => x.hostile && !x.dead && x.tgt === S.selfId)
    .sort((p, r) => Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z) - Math.hypot(r.pos.x - me.pos.x, r.pos.z - me.pos.z))[0];
  if (next) { setTarget(next.id); if (wasChasing) controls.attack(next.id); }
}
function cycleTarget(anyWay = false) {   // anyWay (the phone's Target button): enemies behind the camera count too — there is no quick way to turn it with a thumb mid-fight
  if (S.selfId == null) return;
  const p = S.predictor.pos;
  const order = tabOrder(S.mirror, { id: S.selfId, x: p.x, z: p.z, yaw: controls.cam.yaw }, { range: 40, facing: controls.cam.yaw, arc: anyWay ? Math.PI * 2 : Math.PI * 0.9 });
  // Y8: Tab never stops on a corpse (the body on screen may be dead a moment before the snapshot says so)
  const id = tabPick(order, S.target || 0, i => !!actors.get(i)?.dead);
  if (!id) { hud.toast('No enemies nearby.', 'warn'); return; }
  setTarget(id);
}
// --- the skill bar (skillbar.js): the server's `you.bar` when it sends one, else Farhold's own data -------
S.bar = [];
async function refreshBar() {
  const server = S.net?.joined?.you?.bar;   // protocol §15.10, kept current by `you {bar}`
  if (Array.isArray(server)) S.bar = barFromServer(server, S.self.level);
  else S.bar = barFromData(await loadSkillData(), S.self.cls, S.self.level);   // stand-in rules: no `bar` field
  hud.setBar(S.bar, initials);
}
/** Keys 1–6: cast that slot. Friendly skills go to a friendly target (or yourself); the rest at your enemy or ahead. */
function castSkill(n) {
  if (S.phase !== 'world' || S.self.dead || !S.net) return false;
  const sk = S.bar.find(b => b.slot === n);
  if (!sk || sk.empty) { hud.toast(sk?.desc || 'Nothing on that key yet.', 'warn'); return false; }
  if (sk.locked) { hud.toast(sk.lockedText ? `${sk.name}: ${sk.lockedText.replace(/^U/, 'u')}.` : `${sk.name} unlocks at level ${sk.level}.`, 'warn'); return false; }
  const now = performance.now();
  if ((S.cds?.[n] || 0) > now) { hud.toast(`${sk.name} is not ready.`, 'warn'); return false; }
  const t = S.target != null ? actors.get(S.target) : null;
  const p = S.predictor.pos;
  let target, aim;
  // T3/T4 (play-test 5): a friendly skill lands on the ally you have targeted (a player, or a pet / follower on your side), else on you;
  // a revive is sent at the fallen party member you target (none targeted: the rules pick the nearest)
  if (sk.revive) { target = t && !t.hostile && t.kind === 'player' ? t.id : undefined; aim = t ? { x: t.pos.x, z: t.pos.z } : { x: p.x, z: p.z }; }
  else if (sk.ally) { const friend = t && !t.hostile && (t.kind === 'player' || t.pet); target = friend ? t.id : S.selfId; aim = friend ? { x: t.pos.x, z: t.pos.z } : { x: p.x, z: p.z }; }
  else if (t && t.hostile && !t.dead) { target = t.id; aim = { x: t.pos.x, z: t.pos.z }; controls.setFacing(Math.atan2(t.pos.x - p.x, t.pos.z - p.z)); }
  else { const yaw = S.lastInput?.yaw ?? controls.cam.yaw; aim = { x: p.x + Math.sin(yaw) * 6, z: p.z + Math.cos(yaw) * 6 }; }
  S.net.cast({ slot: n, target, aim });
  actors.playAttack(S.selfId, target, { force: true });
  hud.press(n);
  if (sk.cd) { (S.cds ||= {})[n] = now + sk.cd; hud.cooldown(n, sk.cd); }
  return true;
}

/** Swing at the target if we think the weapon is ready; the server decides (castR says no). */
/**
 * Q1: how far the basic attack reaches — a bow, crossbow or wand fires from range instead of walking to 2.4 m (the server
 * says no with why:'range' if this is too far, and the castR handler shortens it). `you.attackRange` from A wins.
 */
const RANGED_SUB = /bow|crossbow|wand|sling|javelin|throw/i;
function basicReach(eq) {
  const y = S.net?.joined?.you || {};
  // T14 (reach.js): `you.reach` is the reach of the attack FORM (a 9 m cone, a 5 m nova); walk inside it before swinging
  const out = reachOf(y, (eq || y.equipment || {}).weapon);
  S.reachKnown = out.known;
  return out.reach;
}
/**
 * Y7/Y35 (G2): the Attack BUTTON (action-bar slot 0 — the phone's big button, a click on desktop). One press starts
 * attacking and keeps going: it picks the nearest enemy when you have none, ends whatever was moving you, faces the
 * target and walks into the attack's real reach (reach.js through `S.reach`). A second press switches it off — unless it
 * comes within 0.6 s of the last one (someone hammering the button means "attack", not "on, off, on, off").
 */
function attackButton() {
  if (S.phase !== 'world' || S.self.dead || !S.net) return false;
  const now = performance.now(), fast = now - (S.attackTapAt || 0) < 600;
  S.attackTapAt = now;
  let t = S.target != null ? actors.get(S.target) : null;
  if (controls.auto != null && t && t.hostile && !t.dead && !fast) { controls.stopAuto(); hud.toast('You stop attacking.', 'info'); return false; }
  if (!t || !t.hostile || t.dead) {
    const p = S.predictor.pos;
    // whoever is already on you first (nearest), else the nearest enemy all round
    const onMe = [...actors.actors.values()].filter(x => x.hostile && !x.dead && x.tgt === S.selfId).sort((q, r) => Math.hypot(q.pos.x - p.x, q.pos.z - p.z) - Math.hypot(r.pos.x - p.x, r.pos.z - p.z))[0];
    // (a training dummy is only "the nearest enemy" when nothing real is about)
    const order = tabOrder(S.mirror, { id: S.selfId, x: p.x, z: p.z, yaw: controls.cam.yaw }, { range: 40, facing: controls.cam.yaw, arc: Math.PI * 2 });
    const id = onMe ? onMe.id : order.find(i => !S.mirror.infos.get(i)?.dummy && S.mirror.infos.get(i)?.type !== 'training_dummy') || order[0] || 0;
    if (!id) { hud.toast('No enemy near enough to attack.', 'warn'); return false; }
    setTarget(id); t = actors.get(id);
  }
  if (S.self.mount) { /* the server gets you down to fight (you {dismount:'cast'}) */ }
  controls.release(); input.pad.release(); input.touch?.release();
  controls.attack(S.target);                      // -> onAttack -> tryStrike(true); out of reach, the controls walk you in
  return true;
}
function tryStrike(fromKey, slot = 0) {
  if (S.phase !== 'world' || S.self.dead || !S.net) return false;
  const t = actors.get(S.target);
  if (!t || !t.hostile) { if (fromKey) hud.toast('You need a target.', 'warn'); return false; }
  if (t.dead) { if (fromKey) hud.toast('That target is dead.', 'warn'); return false; }
  const now = performance.now();
  const d = Math.hypot(t.pos.x - S.predictor.pos.x, t.pos.z - S.predictor.pos.z);
  if (d > S.reach + 0.6) return false;                 // controls walk us into range; the auto-strike fires there
  if (now - S.swing.attempt < 250 || now - S.swing.last < S.swing.ms * 0.92) return false;
  S.swing.attempt = now;
  if (!S.movingByHand) controls.setFacing(Math.atan2(t.pos.x - S.predictor.pos.x, t.pos.z - S.predictor.pos.z));   // Y7/Y35 (G2): a strike on the run does not wrench you round
  S.net.cast({ slot, target: t.id, aim: { x: t.pos.x, z: t.pos.z } });
  actors.playAttack(S.selfId, t.id);
  hud.cooldown(0, S.swing.ms); hud.press(0);
  return true;
}

const _ray = new THREE.Raycaster();
function pickGround(ndc) {
  _ray.setFromCamera(ndc, camera);
  const o = _ray.ray.origin, dir = _ray.ray.direction;
  let prev = 0;
  for (let t = 0.5; t < 500; t += t < 40 ? 0.5 : 2) {
    const x = o.x + dir.x * t, y = o.y + dir.y * t, z = o.z + dir.z * t;
    if (y <= groundY(x, z)) {
      let a = prev, b = t;
      for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (o.y + dir.y * m <= groundY(o.x + dir.x * m, o.z + dir.z * m)) b = m; else a = m; }
      return { x: o.x + dir.x * b, z: o.z + dir.z * b };
    }
    prev = t;
  }
  return null;
}

let mouseNdc = null;
$('view').addEventListener('pointermove', e => { const r = $('view').getBoundingClientRect(); mouseNdc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }; });
$('view').addEventListener('pointerleave', () => { mouseNdc = null; });

// Interpolation: the mirror's samples, with the ground filled in for entities the server sends no y for.
function sampleEnt(id, t) {
  const p = S.mirror.sample(id, t);
  if (!p || p.x === undefined) return null;
  // P9: the server sends y only while an entity is airborne or swimming (and once in its FULL record); every
  // other sample carries that stale y, so a wolf that spawned at the bottom of a hill was drawn at that height
  // all the way up it (under the ground) and vice versa (floating). Grounded = on the SAME ground the server
  // measures (terrain heightAt, bridge decks included); airborne/swimming = the server's y, never below ground.
  const e = S.mirror.ents.get(id), st = e?.state || 0;
  const g = groundY(p.x, p.z);
  p.swim = !!(st & STATE.swimming);
  if (st & STATE.swimming) p.y = p.y == null ? g : p.y;
  else if ((st & STATE.airborne) && p.y != null) p.y = Math.max(g, p.y);
  else p.y = g;
  return p;
}
function speedOf(id, t) {
  const e = S.mirror.ents.get(id); if (!e) return 0;
  const sm = e.samples; if (sm.length < 2) return 0;
  let i = sm.length - 1;
  while (i > 1 && sm[i - 1].t > t) i--;
  const a = sm[i - 1], b = sm[i];
  if (t - b.t > 350) return 0;                         // no samples for a while: it is standing still
  const dt = (b.t - a.t) / 1000;
  return dt > 0 ? Math.hypot(b.x - a.x, b.z - a.z) / dt : 0;
}

/** E on a demo object (tv.demoLiving): answer locally the way the server would. */
function demoUse(o) {
  if (o.type === 'grave') worldUi.onUsed({ ok: true, kind: 'grave', ...(o.trace || {}) });
  else if (o.type === 'campfire') worldUi.onUsed({ ok: true, kind: 'campfire', who: 'Brem' });
  else if (o.type === 'note') worldUi.onUsed({ ok: true, kind: 'note', name: o.name, text: 'Pell — the toll men at the ford took the flock money. I told them it was all we had. Tell my sister in Wamonhold I tried. — Aled', quest: 'rope_for_old_pell' });
  else if (o.type === 'chest') { objects.markOpened(o.id); hud.toast('You find 12 gold and a Worn Ring.', 'loot rarity-magic'); }
  else hud.toast(o.name || 'Nothing happens.', 'info');
}

// X2: a gold ring on the ground where click / tap-to-move is taking you (it follows controls.moveGoal, so every way a goal ends ends it)
const moveMark = createMoveMarker(scene, { groundY: (x, z) => groundY(x, z), goal: () => (S.phase === 'world' && !S.self.dead ? controls.moveGoal : null) });

// --- the perf crowd (tv.crowd) ------------------------------------------------------------------------
const CROWD = { list: [] };
function crowdTick(dt) {
  for (const f of CROWD.list) {
    const st = f.a.still; if (!st) continue;
    if (f.wait > 0) { f.wait -= dt; st.speed = 0; continue; }
    if (!f.goal) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * f.radius; f.goal = { x: f.home.x + Math.cos(a) * r, z: f.home.z + Math.sin(a) * r }; }
    const dx = f.goal.x - st.x, dz = f.goal.z - st.z, d = Math.hypot(dx, dz);
    if (d < 0.5) { f.goal = null; f.wait = 1 + Math.random() * 4; st.speed = 0; continue; }
    const step = Math.min(d, f.sp * dt);
    st.x += dx / d * step; st.z += dz / d * step; st.y = groundY(st.x, st.z); st.yaw = Math.atan2(dx, dz); st.speed = f.sp;
  }
}

// --- day and night ------------------------------------------------------------------------------------
const TOD_HOLD = q.has('tod') ? +q.get('tod') : null;
S.tod = TOD_HOLD ?? 0.42; S.night = 0;
let todAt = 0, leafMats = null;
foliageMaterials(quality === 'low').then(m => { leafMats = m; });
function dayNight(dt) {
  todAt -= dt;
  if (todAt > 0) return;
  todAt = 0.5;                                        // the sky moves slowly: twice a second is plenty
  S.tod = S.todHold ?? TOD_HOLD ?? (S.net && S.net.realmClock ? S.net.timeOfDay() : S.tod);
  const k = view.setTimeOfDay(S.tod);
  const n = k.night;
  if (Math.abs(n - S.night) > 0.01 || !dayNight.done) {
    S.night = n; dayNight.done = true;
    for (const L of WS.loaded.values()) { L.town?.setNight(n); L.setpieces?.setNight(n); }
    W.horizon?.setNight(n);
    view.setCarryLight({ night: n, range: S.lightRange ?? null });      // W22: the glow everyone carries comes up with the dark
    // leaves glow a little by day (thin cards read as lit canopy); at night that glow would look like phosphor
    if (leafMats?.leaf?.emissiveIntensity != null) leafMats.leaf.emissiveIntensity = 0.55 * (1 - n * 0.85);
  }
}

// --- frame loop ----------------------------------------------------------------------------------------
let last = performance.now(), elapsed = 0, titleOrbit = 0;
const FPS = { n: 0, t: 0, fps: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  perf.frame(now);
  const realMs = Math.min(250, now - last);          // the input clock keeps real time down to 4 fps
  const dt = Math.min(0.1, (now - last) / 1000); last = now; elapsed += dt;
  FPS.n++; FPS.t += realMs / 1000; if (FPS.t >= 1) { FPS.fps = Math.round(FPS.n / FPS.t * 10) / 10; FPS.n = 0; FPS.t = 0; }

  dayNight(dt);
  if (S.phase === 'world' && S.selfId != null && actors.get(S.selfId)) {
    // Fixed 20 Hz input steps: predict locally, send the same step to the server.
    const online = S.net?.status === 'online';
    S.acc += realMs;
    let steps = 0;
    while (online && S.acc >= TICK_MS && steps < 5) {
      S.acc -= TICK_MS; steps++;
      const t = S.target != null ? actors.get(S.target) : null;
      const chasing = controls.chasing != null && t && !t.dead ? t.pos : null;
      if (S.mountCall && (performance.now() > S.mountCall.until || S.self.dead)) endMountCall();      // W26: never stuck if an answer is lost
      const it = controls.intent(S.predictor.pos, { targetPos: chasing, reach: Math.max(1.4, S.reach - 0.3), dead: S.self.dead });
      // Never step onto ground that is not drawn yet: prediction would walk on the horizon's rough heights and the
      // server would correct us. Hold still at the edge (a moment, usually) and load that zone now.
      if (!D.view && (it.mx || it.mz)) {
        const pp = S.predictor.pos, ahead = { x: pp.x + it.mx * 2.5, z: pp.z + it.mz * 2.5 };
        if (!WS.ready(ahead.x, ahead.z) && WS.terrain.zoneAt(ahead.x, ahead.z)) {
          it.mx = 0; it.mz = 0; S.stats.edgeHolds = (S.stats.edgeHolds || 0) + 1;
          WS.whenReady(ahead.x, ahead.z);
          if (!S.edgeToastAt || performance.now() - S.edgeToastAt > 4000) { S.edgeToastAt = performance.now(); hud.toast('The land ahead is still loading…', 'info'); }
        } else if (!WS.terrain.zoneAt(ahead.x, ahead.z) && (!S.coastToastAt || performance.now() - S.coastToastAt > 6000)) {
          // 2026-10-14: past the last zone is the continent's wild coast, falling to the sea (tools/lib/world-core.mjs)
          S.coastToastAt = performance.now(); hud.toast('The land falls away to the sea here. Ships sail from the harbours.', 'info');
        }
      }
      const inp = S.predictor.apply(it);
      S.net.input(inp);
      S.lastInput = it;
      S.movingSpeed = Math.hypot(it.mx, it.mz) > 0.01 && !S.self.dead ? (it.b & 1 ? MOVE.sprint : MOVE.run) : 0;
      // Y7/Y35 (G2, report #45): auto-attack does not need you to stand still — in reach is enough (tryStrike measures it).
      // Moving by hand used to clear `chasing`, and with it the attack; the attack is `controls.auto` now.
      S.movingByHand = !!it.manual;
      if (controls.auto != null && (!t || !t.hostile)) controls.stopAuto();      // the target was cleared or swapped for a friend: the attack is over
      if (controls.auto != null && (it.inRange || it.manual || controls.chasing == null)) tryStrike(false);
    }
    if (steps === 5 || !online) S.acc = Math.min(S.acc, TICK_MS);
    const drawn = ships.ridePos(carts.ridePos(S.predictor.render(S.acc / TICK_MS, dt)));      // W5: on a cart you are drawn on its bed; [V] at sea, on the ship's deck
    if (CROWD.list.length) crowdTick(dt);
    const renderTime = S.net ? S.net.clock.serverNow() - INTERP_MS : 0;
    if (mouseNdc) { const h = actors.pickAt(mouseNdc, { exclude: S.selfId }); S.hover = h ? h.id : null; $('view').style.cursor = h ? (h.hostile && !h.dead ? 'crosshair' : 'pointer') : 'default'; }
    actors.update(fx.stopped ? dt * 0.1 : dt, renderTime, { selfPos: drawn, selfYaw: drawn.riding ? drawn.yaw : S.lastInput?.yaw ?? 0, selfMoving: S.movingSpeed, selfSwim: !!S.predictor.pos.swim, targetId: S.target, hoverId: S.hover, sample: sampleEnt, speed: speedOf });
    const me = actors.get(S.selfId);
    controls.updateCamera(drawn, dt, me ? Math.min(1.9, me.height * 0.8) : 1.5);
    fx.applyShake(camera, elapsed);
    if (S.fly) { camera.position.set(S.fly.x, S.fly.y, S.fly.z); camera.lookAt(S.fly.lx, S.fly.ly, S.fly.lz); }
    view.follow(S.fly ? { x: S.fly.lx, y: S.fly.ly, z: S.fly.lz } : drawn);
    if (!D.view) WS.update(dt, S.fly ? { x: S.fly.lx, z: S.fly.lz } : drawn);
    worldUi.tick(S.tod);
    ui.tick(dt);
    ui2.tick(dt);
    ui5.tick(dt); ui8.tick(dt); ui10.tick(dt);
    D.view?.update(dt, S.fly ? { x: S.fly.lx, z: S.fly.lz } : drawn);
    tele.update(dt);
    boss.update(dt);
    for (const o of objects.items.values()) if (o.type === 'npc') { const a = actors.get(o.id); if (a) { o.x = a.pos.x; o.z = a.pos.z; } }
    objects.update(dt, S.self.dead ? null : drawn);
    vignette.classList.toggle('danger', tele.standingInDanger && !S.self.dead);
    hud.death(S.self.dead ? Math.max(0, 2.5 - (now - S.self.deadAt) / 1000) : null);
    if (S.self.dead && now - S.self.deadAt > 30000) rise();
    const tgt = S.target != null ? actors.get(S.target) : null;
    if (tgt) hud.setTarget(tgt);
    // Attack can pick an enemy and walk into reach; it remains available before either has happened.
    hud.usable(0, !S.self.dead);
  } else if (W.spot) {
    // Title screen (and while joining): a slow orbit around the preview character, framed right of the panel.
    titleOrbit += dt * 0.06;
    const { x: px, z: pz } = W.spot, py = groundY(px, pz);
    const ang = 0.35 + Math.sin(titleOrbit) * 0.35, dist = 6.2;
    camera.position.set(px + Math.sin(ang) * dist, py + 2.2, pz + Math.cos(ang) * dist);
    const side = window.innerWidth > 760 ? 1.9 : 0;
    // on a phone the editor / kit panel fills the lower half: look lower, so the figure stands in the upper half
    const low = !side && (S.titleStep === 'look' || S.titleStep === 'kit') ? 1.25 : 0;
    camera.lookAt(px - Math.cos(ang) * side, py + 1.15 - low, pz + Math.sin(ang) * side);
    if (preview?.still) preview.still.yaw = ang;
    actors.update(dt, 0, {});
    view.follow({ x: px, y: py, z: pz });
    WS.update(dt, { x: px, z: pz });
  }
  fx.update(dt);
  spells.update(dt); sig.update(dt);
  if (S.selfId != null) stars.setMotes(S.selfId, S.self.dead ? 0 : moteCount(ui10.classRes.state));   // Y32: your Starlight, as motes round your head
  stars.update(dt);
  statusSync.update();
  weaponFx.update(dt); formFx.update(dt); angling.update(dt); profView.update(dt); shots.update(dt);
  lootMarks.update(dt); questMarks.update(dt); carts.update(dt, elapsed); held.update(dt, id => actors.get(id)?.pos || null); moveMark.update(dt);
  ships.update(dt, elapsed);      // [V] the voyage camera + sea + moored ships (after the game's own camera, before the render)
  // W5: an arrival inside the SAME room brings no `joined` — step down once the ride's own time is up (on the ride's clock, not the wall's)
  if (S.cartRide && (!carts.riding || carts.rideOver())) { endCartRide(); if (travel.covered) travel.reveal(); }
  hud.tick(dt);
  input.tick(dt);                           // T27: poll the gamepad, keep the focus ring on its element
  LIGHTS.update(dt, camera.position);
  W.horizon?.update(camera.position);       // far-horizon chunk LOD (built in a worker; cheap when nothing changes)
  perf.span('render', () => view.render());
  if (S.phase === 'world') ui2.pass();         // Q13: live portraits, drawn with this frame's renderer in the same task
  perf.setPrograms(view.renderer.info.programs?.length || 0);
  perf.frameEnd();
}

// --- boot ----------------------------------------------------------------------------------------------
initTitle();
requestAnimationFrame(frame);
// The title screen stands in the starter town's square (the server's joined.room decides after that).
async function titleWorld() {
  const b = zoneBounds(STARTER_ZONE, true);
  WS.setZones([{ key: STARTER_ZONE, bounds: STARTER_ZONE === 'test' ? zoneBounds('test', false) : b }]);
  const L = await WS.whenReady((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
  const T = L ? L.T : null;
  W.spot = T ? { ...T.spawn } : { x: 1024, z: 1024 };   // the bake's spawn: a flat dry spot in the hub's square
  S.predictor.terrain = outdoorTerrain();
}
// Autoplay (tests, bots, a quick second tab) connects straight away; the title scene loads alongside.
const AUTO = AUTOPLAY;
if (AUTO) Promise.all([loadLookData(), loadMonsterLooks()]).then(() => enterWorld());
// A browser that already has an account: connect now and list its characters on the title screen (M3).
else if (TOKENS().get() && q.get('fresh') !== '1') {
  const net = startNet();
  net.ready.then(n => { if (S.phase === 'title') { account.showChars(n.chars, n.claimed ? n.username : null); if (n.chars?.length && S.titleStep !== 'look' && S.titleStep !== 'new' && $('signin').hidden) titleStep('front'); } }).catch(() => { titleFront?.set({ hasToken: true, failed: true }); });
}
Promise.all([titleWorld(), loadLookData(), loadMonsterLooks()]).then(() => {
  rebuildPreview();
  $('loading').classList.add('done');
  // P1: every tree/rock/reed kit piece any zone can ask for, built in idle moments now rather than mid-walk, and
  // every creature family's / humanoid monster's shaders compiled and kept (warmup.js) — no first-sight compile later
  S.warm = { done: false };
  import('./scatter-view.js').then(m => m.prewarmScatter({ quality })).catch(() => {})
    .then(() => Promise.all([import('./warmup.js'), loadMonsterLooks()]))
    .then(([m, looks]) => m.warmBodies({ scene, renderer: view.renderer, camera, monsterLooks: looks, extras: [shots.sample(), moveMark.sample(), questMarks.sample(), weaponFx.sample(), lootMarks.sample(), formFx.sample(), spells.beams.sample(), sig.sample(), angling.sample(), profView.sample(), cropSample(), stars.sample()], extraTypes: ['wolf', 'boar', 'crocodile', 'mushroom', 'bear', 'cow'] }))
    .then(r => carts.prewarm().then(() => r, () => r))                     // W5: one ox cart built and compiled before anybody meets one
    .then(r => { S.warm = { done: true, ...r }; }, e => { S.warm = { done: true, error: e?.message }; });
});

// --- test hook (stream G's two-player spec; also handy in the console) -----------------------------------
const tv = {
  /** Play a server event through the client's own handlers (screenshots / demos: a swing, a staff spell…). */
  fxEvent(ev) { onEvent(ev); },
  /** U16 (specs / demos): shape a player (default: you) as a creature, or back with null. */
  shape(shape, id = S.selfId) { return actors.setShape(id, shape); },
  /** Play a server message through EVERY handler the client registered for it (specs, screenshots). Returns how many heard it. */
  fake(ev, msg) { const fns = TAPS.get(ev) || []; for (const fn of [...fns]) { try { fn(msg); } catch (e) { console.error('[fake]', ev, e); } } return fns.length; },
  weaponFx: () => weaponFx.stats,
  /** W2/W14: what the projectile pool has drawn (specs read it). */
  shots: () => ({ ...shots.stats, live: shots.live, list: shots.list(), pools: shots.pools() }),
  /** play-test 5: what the form / revive / angling drawers have drawn (specs read these). */
  fx5: () => ({ forms: formFx.stats, revives: reviveFx.stats, angling: angling.stats, live: formFx.live, lines: angling.lines.size, pools: angling.pools.size, reach: S.reach, reachKnown: !!S.reachKnown }),
  /** T25 (specs / demos): a fish pool on the water at an offset from you, or an angler's phase. */
  fishDemo(o = {}) { const p = S.predictor.pos; if (o.pool) angling.setPool(o.pool, { x: p.x + (o.dx || 0), z: p.z + (o.dz || 8) }, { tier: o.tier || 1, left: 5 }); if (o.phase) angling.setPhase(o.id ?? S.selfId, o.phase, { x: o.x ?? p.x + (o.dx || 0), z: o.z ?? p.z + (o.dz || 6), rarity: o.rarity, tension: o.tension }); return { lines: angling.lines.size, pools: angling.pools.size }; },
  /** Q16: toggle the mount (as H does). */
  mount() { toggleMount(); },
  state() {
    const me = actors.get(S.selfId);
    return {
      status: S.net?.status || 'idle', phase: S.phase,
      you: S.selfId != null ? { id: S.selfId, x: S.predictor.pos.x, z: S.predictor.pos.z, hp: S.self.hp, hpMax: S.self.hpMax, level: S.self.level, xp: S.self.xp, dead: S.self.dead } : null,
      target: S.target,
      ents: [...S.mirror.ents.values()].filter(e => e.id !== S.selfId).map(e => {
        const info = e.info || S.mirror.infos.get(e.id) || {};
        const a = actors.get(e.id);
        return { id: e.id, kind: info.kind || KIND_NAMES[e.kind], type: info.type || null, name: info.name || '', x: e.x, z: e.z, hp: Math.round((e.hp ?? 1) * (info.hpMax || 1)), dead: !!(e.state & STATE.dead) || !!a?.dead };
      }),
      events: S.events.slice(),
      drawn: me ? { x: me.pos.x, y: me.pos.y, z: me.pos.z } : null,
      stats: { ...S.stats, fps: FPS.fps, lod: { ...actors.lodStats }, pending: S.predictor.pending.length, rtt: S.net?.clock.rtt ?? null, draws: view.renderer.info.render.calls, tris: view.renderer.info.render.triangles, quality, longFrames: perf.stats().longFrames, worstFrameMs: perf.stats().worstMs, programs: perf.stats().programs },
    };
  },
  /** P20: play every skill of a class (default: yours) from you at your target/nearest monster, one per `gap` ms. */
  demoSpells(cls = null, gap = 1400, only = null) {
    const ids = only ? [].concat(only) : (SKILLS && cls !== null ? (window.__skillClasses?.[cls] || []) : S.bar.filter(b => b.id).map(b => b.id));
    const me = S.selfId, p = S.predictor.pos;
    const t = S.target ?? [...actors.actors.values()].filter(a => a.kind === 'monster' && !a.dead).sort((x, y) => Math.hypot(x.pos.x - p.x, x.pos.z - p.z) - Math.hypot(y.pos.x - p.x, y.pos.z - p.z))[0]?.id;
    ids.forEach((id, i) => setTimeout(() => { spells.demo(id, me, t); sig.demo(SKILL_CLASS.get(id) || cls || S.self.cls, id, me, t); }, i * gap));
    return { ids, target: t ?? null };
  },
  /** 2026-10-14: the class signature layer (sig-fx.js) — its counters, and its level for tests. */
  sig() { return { level: sig.level, live: sig.live, ...sig.stats }; },
  /** Frame watchdog (P1): long frames with the spans that ran in them; tv.perf(true) resets the counters. */
  perf(reset = false) {
    const progs = (view.renderer.info.programs || []).map(p => `${p.name}#${p.id}`);
    const s = { ...perf.stats(), stalls: perf.stalls(), parallelCompile: view.renderer.extensions.has('KHR_parallel_shader_compile'), newProgramNames: progs.filter(n => !(tv._progs || []).includes(n)), newProgramKeys: (view.renderer.info.programs || []).filter(p => !(tv._progs || []).includes(`${p.name}#${p.id}`)).map(p => String(p.cacheKey).slice(0, 400)) };
    if (reset) { perf.reset(); tv._progs = progs; }
    return s;
  },
  walkTo(x, z) { controls.walkTo(x, z); },
  stop() { controls.stop(); },
  cast(slot = 0, targetId) {
    if (!S.net) return false;
    const t = targetId != null ? actors.get(targetId) : actors.get(S.target);
    if (t) { setTarget(t.id); controls.setFacing(Math.atan2(t.pos.x - S.predictor.pos.x, t.pos.z - S.predictor.pos.z)); }   // a swing lands in its arc: face the target first (as tryStrike does)
    S.net.cast({ slot, target: t?.id, aim: t ? { x: t.pos.x, z: t.pos.z } : undefined });
    actors.playAttack(S.selfId, t?.id);
    return true;
  },
  attack(targetId) { setTarget(targetId); controls.attack(targetId); },
  target: setTarget, say: text => S.net?.say(text), rise,
  /** Camera for screenshots: distance, pitch (radians up), yaw. */
  view(dist = 9, pitch = 0.38, yaw = null) { controls.cam.distWant = dist; controls.cam.dist = dist; controls.cam.pitch = pitch; if (yaw != null) controls.cam.yaw = yaw; },
  /** Inspect camera (PLAN §3.8): put the camera at (x, y, z) looking at (lx, ly, lz); streams zones round the look point. tv.fly(null) ends it. */
  fly(x, y, z, lx, ly, lz) { S.fly = x == null ? null : { x, y, z, lx, ly, lz }; },
  /**
   * Client-only look at a dungeon family (E's generator, drawn by dungeon-view.js) with the inspect camera:
   * tv.demoDungeon('cave_river'). tv.demoDungeon(null) goes back outside. Nothing is sent to the server.
   */
  async demoDungeon(family = 'crypt_spiral', seed = 7) {
    if (!family) { tv.fly(null); leaveDungeon(); return null; }
    const [{ planDungeon }, { describeDungeon }] = await Promise.all([import('../rules/dungeon-tiers.js'), import('../sim/dungeon.js')]);
    const plan = planDungeon(seed, { family, floors: 2, level: 3 });
    D.roomId = null;
    enterDungeon({ id: 'demo:' + family + ':' + seed, dungeon: describeDungeon(plan) });
    const f = plan.floors[0], r = (f.rooms || []).slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const cx = f.origin.x + (r.i + r.w / 2) * plan.cell, cz = f.origin.z + (r.j + r.h / 2) * plan.cell;
    tv.fly(cx + 14, 22, cz + 18, cx, 0, cz);
    D.view.update(0.1, { x: cx, z: cz });
    return { family: plan.family, look: D.view.look, name: plan.name, dressing: D.view.dressing };
  },
  /**
   * Client-only showcase of the living-world pieces whose server side may not be live yet: a realm event
   * (announcement, then start + free travel), a "Group up" hint, the zone deed feed with footprints, and
   * client-side objects round you (a grave, a campfire, a note, a hidden cache, a cleared door banner,
   * a vignette whose lore shows when you stand in it). tv.demoLiving(false) removes the objects.
   */
  demoLiving(on = true) {
    for (const id of [...objects.items.keys()]) if (String(id).startsWith('demo:')) objects.remove(id);
    if (!on) return null;
    const p = S.predictor.pos, now = Date.now();
    const put = (k, dx, dz, o) => objects.upsert({ id: 'demo:' + k, x: p.x + dx, z: p.z + dz, source: 'demo', ...o });
    put('grave', 6, 3, { type: 'grave', name: "Aldra's grave", trace: { who: 'Aldra', level: 4, by: 'Grandmother Skein', at: now - 6 * 60000 } });
    put('fire', -5, 5, { type: 'campfire', name: "Brem's campfire" });
    put('note', 3, -6, { type: 'note', name: "Shepherd's satchel" });
    put('cache', -4, -7, { type: 'chest', name: 'Hidden cache', hidden: true });
    put('door', 0, 11, { type: 'portal', name: 'Barrow entrance', banner: { by: 'Aldra', party: 3, at: now - 4 * 60000 } });
    put('vig', 0, 0, { type: 'vignette', name: 'The Hanging Oak', r: 14, lore: 'Somebody cut the rope down, but not before the crows had their turn. A satchel lies in the grass beneath.', key: 'demo:vig' });
    worldUi.onZone({ zone: 'z12_02', name: 'The Torbor Fields', band: [1, 4], deeds: { rares: 3, bosses: 1, elites: 2, deaths: 4, visitors: 17 },
      heat: Array.from({ length: 40 }, (_, i) => [Math.round((p.x + Math.cos(i * 0.6) * i * 9) / 32) * 32 + 16, Math.round((p.z + Math.sin(i * 0.6) * i * 9) / 32) * 32 + 16, 250 - i * 5]) });
    const ev = { id: 'world_grimtallow', uid: 'demo', name: 'Grimtallow, the Siege-Husk', province: S.room?.province || 'torbor_downs', zoneName: 'Blackthorn Scar', x: p.x + 900, z: p.z, r: 100, level: 10, kind: 'worldboss' };
    worldUi.onRealm({ kind: 'eventSoon', ev, at: now + 600000 });
    setTimeout(() => worldUi.onRealm({ kind: 'eventStart', ev }), 2500);
    setTimeout(() => worldUi.onEventFrame({ uid: 'demo', name: ev.name, hp: 0.62, players: 23 }), 3200);
    setTimeout(() => worldUi.onGroupHint({ key: 'demo', with: [{ char: 1, name: 'Aldra' }, { char: 2, name: 'Brem' }] }), 1200);
    return { objects: [...objects.items.keys()].filter(k => String(k).startsWith('demo:')).length };
  },
  /** Open the dialog a server answer would open: tv.demoUsed({ kind: 'npc', name: 'Smith', role: 'smith' }). */
  demoUsed(u) { return worldUi.onUsed({ ok: true, ...u }); },
  /**
   * Client-only look at the province world boss (Grimtallow, protocol §16.7) through the real handlers: the realm
   * announcement (broken out to another arena), the boss frame with its four phases and new bars, the shield phase
   * ("light the signal fires"), and its four telegraph shapes. Nothing is sent to the server. tv.demoWorldBoss()
   */
  demoWorldBoss() {
    const p = S.predictor.pos, me = S.selfId;
    const mons = [...actors.actors.values()].filter(a => a.kind === 'monster' && !a.dead);
    const b = mons.sort((x, y) => Math.hypot(x.pos.x - p.x, x.pos.z - p.z) - Math.hypot(y.pos.x - p.x, y.pos.z - p.z))[0];
    const id = b ? b.id : me;
    const fire = evs => { S.evTick = Math.round(S.net.clock.serverNow() / TICK_MS); for (const ev of evs) onEvent(ev); };
    const ev = { id: 'world_grimtallow', uid: 'demo', name: 'Grimtallow, the Siege-Husk', province: S.room?.province || 'torbor_downs', zoneName: 'The Ashcombe Ruins', kind: 'worldboss', roamed: true, level: 10 };
    worldUi.onRealm({ kind: 'eventStart', ev, text: 'Grimtallow has torn free of Blackthorn Scar and marches on the Ashcombe Ruins!' });
    fire([{ type: 'boss', id, name: 'Grimtallow', title: 'the Siege-Husk', bars: 3, enrageMs: 540000,
      phases: [{ n: 0, name: 'The March', at: 1 }, { n: 1, name: 'The Warband', at: 0.65 }, { n: 2, name: 'Uprooted', at: 0.5 }, { n: 3, name: 'Death Throes', at: 0.3 }] }]);
    let n = 9100;
    const at = (dx, dz) => ({ x: p.x + dx, z: p.z + dz });
    setTimeout(() => fire([{ type: 'phase', id, n: 1, name: 'The Warband' }, { type: 'fx', kind: 'shield', id, on: true },
      { type: 'say', id, text: 'Grimtallow plants itself behind a wall of blight. Light all four signal fires to call the catapults!', style: 'warn' }]), 700);
    setTimeout(() => fire([{ type: 'castbar', id, ab: 'blight_rain', name: 'Blight Rain', ms: 3200 },
      { type: 'tele', id: ++n, s: id, ab: 'stomp', k: 'harm', ms: 2600, shape: 'circle', ...at(-6, 3), r: 5, el: 'poison' },
      { type: 'tele', id: ++n, s: id, ab: 'siege_volley', k: 'harm', ms: 3000, shape: 'cone', ...at(0, 0), yaw: controls.cam.yaw + Math.PI, r: 16, arc: 0.9 },
      { type: 'tele', id: ++n, s: id, ab: 'charge', k: 'harm', ms: 2800, shape: 'line', ...at(5, -5), yaw: 0.7, len: 18, w: 3 },
      { type: 'tele', id: ++n, s: id, ab: 'blight_nova', k: 'harm', ms: 3200, shape: 'donut', ...at(0, 0), r: 12, r2: 6, el: 'poison' }]), 1500);
    return { boss: id };
  },
  /** M3 social state for tests: account, friends, guild, mail, the Callboard, chat lines (text) and open windows. */
  social() {
    const n = S.net;
    return {
      claimed: !!n?.claimed, username: n?.username || null, friends: friends.list.map(f => ({ name: f.name, online: !!f.online })),
      guild: guild.guild ? { name: guild.guild.name, motd: guild.guild.motd, members: guild.guild.members.map(m => ({ name: m.name, rank: m.rank, online: !!m.online })) } : null,
      mail: { unread: mail.state.unread, list: mail.state.list.map(m => ({ id: m.id, from: m.from, subject: m.subject, read: !!m.read, taken: !!m.taken, items: (m.items || []).length, gold: m.gold || 0 })), view: mail.state.view },
      callboard: { queued: callboard.state.queued, pop: !!callboard.state.pop, dungeons: callboard.state.dungeons.length },
      chat: [...document.querySelectorAll('#chat-log p')].slice(-40).map(p => ({ tab: p.dataset.tab, text: p.textContent })),
      gold: bag.state.gold, bag: bag.state.bag.map(i => ({ uid: i.uid, name: i.name })), room: S.room?.kind || null,
    };
  },
  panel(id, open = true) { const P = { friends: friends.panel, guild: guild.panel, mail: mail.panel, callboard: callboard.panel, account: account.panel, help }[id]; P?.toggle(open); return !!P?.isOpen; },
  /** Hide or show the HUD (clean screenshots). */
  hud(on = true) { $('hud').style.visibility = on ? '' : 'hidden'; $('plates').style.visibility = on ? '' : 'hidden'; },
  /** Hold the time of day (0 = midnight, 0.5 = noon); null goes back to the realm clock. */
  setTime(t) { S.todHold = t; todAt = 0; },
  warm: () => S.warm,
  world: () => ({ ...WS.stats(), solids: SOLIDS.count(), tod: S.tod, night: S.night, horizon: !!W.horizon, horizonStats: W.horizon?.stats?.() || null }),
  /**
   * Client-only crowd for the performance check (PLAN §12: a town of 100 players): n fake players wander
   * round you, drawn through the same LOD as real ones. tv.crowd(0) clears them. Returns the LOD counts.
   */
  crowd(n = 100, radius = 45) {
    for (const f of CROWD.list) actors.remove(f.id);
    CROWD.list = [];
    const c = S.predictor.pos, CLS = ['warrior', 'ranger', 'mage', 'cleric', 'rogue', 'paladin', 'bard', 'druid', 'monk', 'knight'];
    for (let i = 0; i < n; i++) {
      const a0 = i * 2.399, r0 = Math.sqrt((i + 1) / n) * radius;
      const x = c.x + Math.cos(a0) * r0, z = c.z + Math.sin(a0) * r0;
      const look = defaultLook('crowd' + i, CLS[i % CLS.length]);
      const a = actors.add({ id: 'crowd-' + i, kind: 'player', name: 'Wanderer ' + (i + 1), level: 1 + (i % 9), hp: 1, hpMax: 1, hostile: false, look, x, y: groundY(x, z), z, yaw: a0 });
      a.still = { x, y: groundY(x, z), z, yaw: a0, speed: 0 };
      CROWD.list.push({ id: a.id, a, home: { x: c.x, z: c.z }, goal: null, wait: (i % 7) * 0.4, sp: 1.6 + (i % 5) * 0.6, radius });
    }
    return actors.lodStats;
  },
  /**
   * Client-only showcase: plays a fake boss fight's events through the real handlers (every telegraph
   * shape, phases with a new bar, a cast bar, call-outs, enrage) around you. Nothing is sent to the server.
   * Console: tv.demoEncounter()
   */
  demoEncounter() {
    const p = S.predictor.pos, me = S.selfId;
    const mons = [...actors.actors.values()].filter(a => a.kind === 'monster' && !a.dead);
    const b = mons.sort((x, y) => Math.hypot(x.pos.x - p.x, x.pos.z - p.z) - Math.hypot(y.pos.x - p.x, y.pos.z - p.z))[0];
    const id = b ? b.id : me;
    const tick = () => Math.round(S.net.clock.serverNow() / TICK_MS);
    const fire = evs => { S.evTick = tick(); for (const ev of evs) onEvent(ev); };
    let n = 9000;
    const at = (dx, dz) => ({ x: p.x + dx, z: p.z + dz });
    fire([{ type: 'boss', id, name: b ? b.name : 'The Screelhag', title: 'Mother of the Moor', bars: 2, phases: [{ n: 0, name: 'The Hunt', at: 1 }, { n: 1, name: 'Shrieking Gale', at: 0.6 }, { n: 2, name: 'Last Breath', at: 0.25 }], enrageMs: 185000 }]);
    setTimeout(() => fire([{ type: 'say', id, text: `${b ? b.name : 'The Screelhag'} draws breath!`, style: 'warn' }, { type: 'castbar', id, ab: 'shriek', name: 'Rending Shriek', ms: 2600, int: 1 },
      { type: 'tele', id: ++n, s: id, ab: 'shriek', k: 'harm', ms: 2600, shape: 'cone', ...at(0, 0), yaw: controls.cam.yaw, r: 14, arc: 1.1 }]), 600);
    setTimeout(() => fire([{ type: 'tele', id: ++n, s: id, ab: 'stomp', k: 'harm', ms: 1800, shape: 'circle', ...at(-7, 4), r: 3.5, el: 'fire' },
      { type: 'tele', id: ++n, s: id, ab: 'ring', k: 'harm', ms: 2400, shape: 'ring', ...at(0, 0), r: 9, r2: 5, el: 'frost' },
      { type: 'tele', id: ++n, s: id, ab: 'beam', k: 'harm', ms: 2000, shape: 'line', ...at(6, -6), yaw: 0.8, len: 16, w: 2.5, el: 'shadow' },
      { type: 'tele', id: ++n, s: id, ab: 'cross', k: 'harm', ms: 2800, shape: 'cross', ...at(10, 8), yaw: 0.3, r: 7, w: 2, el: 'lightning' },
      { type: 'tele', id: ++n, s: id, ab: 'pool', k: 'harm', ms: 3000, shape: 'donut', ...at(-12, -9), r: 5, r2: 2, el: 'poison' }]), 1400);
    setTimeout(() => fire([9001, 9002, 9003, 9004, 9005, 9006].map(i => ({ type: 'teleR', id: i, hits: i === 9001 ? [me] : [] }))), 4600);
    setTimeout(() => fire([{ type: 'phase', id, n: 1, name: 'Shrieking Gale', bar: 1, hpMax: b ? b.hpMax : 1000 }]), 5400);
    setTimeout(() => fire([{ type: 'enrage', id, hard: 1 }]), 7600);
    return { boss: id };
  },
};
window.tv = tv;
window.thousandvale = { stars, onEvent, held, ui10, tracking: () => ui10.tracking(), titleFront: () => titleFront, moveMark, prof, profView, shots, questMarks, carts, input, formFx, reviveFx, angling, lootMarks, weaponFx, statusSync, S, W, D, WS, view, actors, spells, LIGHTS, travel, camera, controls, hud, fx, tv, tele, boss, objects, social, bag, worldUi, footprints, chat, friends, guild, mail, callboard, account, ui, ui2, ui5, ui8 };
window.thousandvale.ships = ships;      // [V]
