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
import { createActors } from './actors.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createControls } from './controls.js';
import { campPlacements, CAMP_RADIUS } from './camp.js';
import { Predictor, MOVE } from './predict.js';
import { PLAYABLE_RACES, RACE_NAMES, loadLookData, defaultLook, loadMonsterLooks } from './looks.js';
import { connect, localTokenStore } from '../net/client.js';
import { createMirror } from '../net/mirror.js';
import { ANIMS, STATE, KIND_NAMES, TICK_MS, cleanName } from '../net/protocol.js';
import { tabNext } from '../net/tab.js';
import { createTelegraphs } from './telegraphs.js';
import { createBossUi } from './boss.js';
import { createObjects } from './objects.js';
import { createDungeonView } from './dungeon-view.js';
import { createSocial } from './social.js';
import { createBag } from './bag.js';
import { loadSkillData, barFromData, initials } from './skillbar.js';

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
  try {
    const g = document.createElement('canvas').getContext('webgl2');
    const e = g && g.getExtension('WEBGL_debug_renderer_info');
    if (/swiftshader|llvmpipe|software/i.test(e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '')) return 'low';
  } catch {}
  return 'high';
}
const quality = detectQuality();
const view = createScene($('view'), { quality });
const { scene, camera } = view;
const actors = createActors(scene, { plateLayer: $('plates'), camera, quality });
const fx = createFx(scene, { layer: $('numbers'), camera });
const vignette = document.getElementById('vignette');
const tele = createTelegraphs(scene, {
  serverNow: () => (S.net ? S.net.clock.serverNow() : 0),
  posOf: id => { if (id === S.selfId) { const p = S.predictor.pos; return { x: p.x, z: p.z, yaw: S.lastInput?.yaw }; } const a = actors.get(id); return a ? { x: a.pos.x, z: a.pos.z, yaw: a.yaw } : null; },
  selfPos: () => (S.selfId != null && S.phase === 'world' ? S.predictor.pos : null),
  selfId: () => S.selfId,
  onHitMe: () => { vignette.classList.add('hit'); setTimeout(() => vignette.classList.remove('hit'), 220); fx.shake(0.6); },
});
const objects = createObjects(scene, { onUse: (id, o) => (String(id).startsWith('demo:') ? demoUse(o) : S.net?.use(id)), onNear: o => worldUi.lore(o.key || o.id, o.name, o.lore), labelLayer: document.getElementById('plates'), camera });

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
const WS = createWorldStream(scene, { quality, onZoneReady: L => { L.town?.setNight(S.night || 0); if (!D.view) objects.setGround(WS.terrain.heightAt); }, opts: {
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
  S.predictor.terrain = { heightAt: WS.terrain.heightAt, walkable: WS.terrain.walkable, bounds: WS.terrain.bounds };
  controls.setHeightAt(WS.terrain.heightAt);
}
const groundY = (x, z) => (D.view ? 0 : WS.terrain.heightAt(x, z));

// --- dungeon instances (drawn from joined.room.dungeon; the outdoor ground is hidden, not thrown away) ---
const D = { view: null, roomId: null };
function enterDungeon(room) {
  if (D.roomId !== room.id || !D.view) {
    if (D.view) scene.remove(D.view.group);
    D.view = createDungeonView(room.dungeon, { quality }); D.roomId = room.id;
    scene.add(D.view.group);
  }
  WS.setVisible(false); W.horizon?.setVisible(false); footprints.setVisible(false);
  view.setMood('dungeon', { fog: D.view.fog });
  S.predictor.terrain = { heightAt: () => 0, walkable: D.view.terrain.walkable, bounds: D.view.terrain.bounds };
  controls.setHeightAt(D.view.cameraHeight);
  tele.setGround(() => 0); objects.setGround(() => 0);
}
function leaveDungeon() {
  if (D.view) { scene.remove(D.view.group); D.view = null; D.roomId = null; }
  WS.setVisible(true); W.horizon?.setVisible(true); footprints.setVisible(true);
  view.setMood('outdoor');
  S.predictor.terrain = { heightAt: WS.terrain.heightAt, walkable: WS.terrain.walkable, bounds: WS.terrain.bounds };
  controls.setHeightAt(WS.terrain.heightAt); tele.setGround(WS.terrain.heightAt); objects.setGround(WS.terrain.heightAt);
}
/** Ground for a room: the dungeon layout, or the province's zones (kept when a handoff stays on them). */
async function useRoom(room, at) {
  if (room.dungeon) { enterDungeon(room); return; }
  await useWorld(room, at || room.spawn || { x: 0, z: 0 });
  leaveDungeon();
}

const hud = createHud({
  onSlot: i => (i ? castSkill(i) : tryStrike(true)),
  onChatSubmit: text => social.command(text),
  onChatFocus: on => controls.setTyping(on),
  onRise: () => rise(),
});

const controls = createControls({
  dom: $('view'), camera, heightAt: groundY,
  getTarget: () => S.target,
  onSelect: ndc => {
    if (S.phase !== 'world') return null;
    const a = actors.pickAt(ndc, { exclude: S.selfId });
    if (a) { setTarget(a.id); return { id: a.id, hostile: a.hostile && !a.dead }; }
    return null;
  },
  onPickGround: ndc => (S.phase === 'world' ? pickGround(ndc) : null),
  onAttack: id => { setTarget(id); tryStrike(true); },
  onCycleTarget: () => cycleTarget(),
  onClearTarget: () => setTarget(null),
  onChat: () => hud.focusChat(),
  onRise: () => rise(),
  onSkill: n => castSkill(n),
});

const boss = createBossUi({ actors, serverNow: () => (S.net ? S.net.clock.serverNow() : 0), toast: hud });
const social = createSocial({ net: () => S.net, hud, actors, onTarget: id => setTarget(id), myChar: () => S.net?.joined?.you?.char ?? null });
const bag = createBag({ net: () => S.net, hud });
const worldUi = createWorldUi({ hud, net: () => S.net, me: () => S.predictor.pos, room: () => S.room, onFootprints: heat => footprints.set(heat) });
window.addEventListener('keydown', e => {
  if (S.phase !== 'world' || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
  if (e.code === 'KeyE' && objects.useFocus()) { e.preventDefault(); e.stopImmediatePropagation(); }
  else if (e.code === 'KeyB') bag.toggle();
  else if (e.code === 'KeyP') social.toggleMenu();
  else if (e.code === 'KeyC') { if (S.room?.kind === 'wilds') S.net?.campfire(); else hud.toast('You can only make camp out in the wilds.', 'warn'); }
  else if (e.code === 'Escape' && worldUi.dialogOpen) worldUi.closeDialog();
}, true);

// --- title screen -------------------------------------------------------------------------------------
let preview = null;
async function loadClasses() {
  try { const d = await (await fetch(new URL('../../../farhold/data/classes.json', import.meta.url))).json(); return d.classes.map(c => ({ id: c.id, name: c.name || c.id })); }
  catch { return STARTERS.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) })); }
}
function initTitle() {
  $('name').value = q.get('name') || store.get('name', '') || '';
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
  $('reroll').onclick = () => { S.look.seed = (Math.random() * 1e9) >>> 0; rebuildPreview(); };
  $('build-tag').textContent = `client ${q.get('build') || 'dev'} · ${netMode() === 'ws' ? 'online' : 'offline (in-browser server)'}`;
  $('login').addEventListener('submit', e => { e.preventDefault(); enterWorld(); });
  refreshChips();
}
function refreshChips() {
  for (const b of document.querySelectorAll('#races .chip')) b.setAttribute('aria-checked', String(b.dataset.race === S.look.race));
  for (const b of document.querySelectorAll('#classes .chip')) b.setAttribute('aria-checked', String(b.dataset.cls === S.cls));
  const more = $('class-more'); if (more) more.value = STARTERS.includes(S.cls) ? '' : S.cls;
}
function rebuildPreview() {
  if (!W.spot || S.phase === 'world') return;
  actors.remove('preview');
  const { x, z } = W.spot, y = groundY(x, z);
  preview = actors.add({ id: 'preview', kind: 'player', name: '', level: 1, hp: 1, hpMax: 1, look: { ...S.look, cls: S.cls }, x, y, z, yaw: 0.35 });
  preview.noPlate = true;
  preview.still = { x, y, z, yaw: 0.35 };
  store.set('look', S.look); store.set('cls', S.cls);
}

// --- connecting -----------------------------------------------------------------------------------------
const netMode = () => (q.has('offline') && q.get('offline') !== '0' ? 'worker' : 'ws');
async function enterWorld() {
  const name = cleanName($('name').value);
  if (!name || name.length < 2) { $('login-note').textContent = 'Pick a name of 2–16 letters.'; return; }
  $('login-note').textContent = '';
  store.set('name', name); store.set('look', S.look); store.set('cls', S.cls);
  S.self.name = name;
  const btn = $('enter'); btn.disabled = true; btn.textContent = 'Entering…';
  const mode = netMode();
  const net = connect({ mode, url: q.get('server') || undefined, build: q.get('build') || 'dev', guestName: name,
    tokenStore: localTokenStore('thousandvale.token.' + (mode === 'ws' ? (q.get('server') || location.host) : 'offline')) });
  S.net = net; S.phase = 'joining';
  wireNet(net);
  const fail = text => { $('login-note').textContent = text; btn.disabled = false; btn.textContent = 'Enter the world'; S.phase = 'title'; net.close(); S.net = null; };
  const timer = setTimeout(() => { if (S.phase === 'joining' && net.status !== 'online') fail(mode === 'ws' ? 'Cannot reach the game server. Add ?offline=1 to play against an in-browser server.' : 'The in-browser server did not start.'); }, 20000);
  try {
    await net.ready;
    let ch = net.chars.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!ch) ch = await net.createChar({ name, cls: S.cls, look: { race: S.look.race, seed: S.look.seed, v: 1 } });
    const join = (q.get('join') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || null;
    await net.play(ch.id, join ? { join } : {});
    clearTimeout(timer);
  } catch (e) {
    clearTimeout(timer);
    fail(e.code === 'name' ? 'That name is taken. Try another.' : e.code === 'full' ? 'This account has all the characters it can hold.' : (e.message || 'Could not enter the world.'));
  }
}

function wireNet(net) {
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
    hud.setSelf(S.self);
    if (levelled) levelFlash(S.selfId);
  });
  net.on('chat', m => {
    hud.chat(m.text, m.ch === 'say' ? 'say' : m.ch === 'party' ? 'party' : 'system', m.ch === 'say' || m.ch === 'party' ? (m.ch === 'party' ? `Party] [${m.name}` : m.name) : null);
    if (m.ch === 'say' && m.from != null) actors.say(m.from, m.text);
  });
  social.wire(net);
  bag.wire(net);
  worldUi.wire(net);
  net.on('relocate', () => hud.toast('Crossing into another province…', 'info'));
  net.on('used', u => {
    if (worldUi.onUsed(u)) return;
    if (!u.ok) { hud.toast(u.msg || ({ far: 'Too far away.', opened: 'Already emptied.', dead: 'You are dead.', unknown: 'Nothing happens.' }[u.why]) || 'Nothing happens.', 'warn'); if (u.why === 'opened') objects.markOpened(u.id); return; }
    const o = objects.items.get(u.id);
    if (o?.type === 'chest') objects.markOpened(u.id);
    if (o?.type === 'lever' && D.view) { D.view.openGate(D.view.floorAt(o.x, o.z)); hud.toast('Somewhere, a gate grinds open.', 'info'); }
    if (u.msg) hud.toast(u.msg, 'info');
  });
  net.on('targetR', r => { if (S.target === r.id) setTarget(null); hud.toast(r.why === 'range' ? 'Too far away to target.' : 'You cannot target that.', 'warn'); });
  net.on('castR', r => {
    if (r.slot > 0 && S.cds) { S.cds[r.slot] = 0; hud.cooldown(r.slot, 0); }
    if (r.why === 'cooldown' && !(r.slot > 0)) { S.swing.ms = Math.min(2500, S.swing.ms + 60); return; }
    if (r.why === 'range') { const t = actors.get(S.target); if (t) S.reach = Math.max(1.6, Math.min(S.reach, Math.hypot(t.pos.x - S.predictor.pos.x, t.pos.z - S.predictor.pos.z)) * 0.8); }
    hud.toast(r.text || CASTR_TEXT[r.why] || 'You cannot do that.', 'warn');
  });
}

function onJoined(j) {
  const prevRoom = S.room, prevSelf = S.selfId;
  S.room = j.room; S.selfId = j.you.id;
  S.mirror.reset();
  // Every id in the old room is void now — except our own body, which keeps its model under the new id.
  const keep = prevSelf != null && actors.get(prevSelf) ? prevSelf : null;
  for (const id of [...actors.actors.keys()]) if (id !== keep) actors.remove(id);
  if (keep != null) actors.rekey(keep, S.selfId);
  if (S.target != null) setTarget(null);
  tele.clear(); objects.clear(); boss.clear();
  worldUi.joined(j);
  preview = null;
  const you = j.you;
  Object.assign(S.self, { name: you.name, cls: you.cls, level: you.level, xp: you.xp || 0, next: you.xpNext || 100, hp: you.hp, hpMax: you.hpMax, dead: you.hp <= 0 });
  S.predictor.locked = S.self.dead;
  useRoom(j.room, { x: you.x, z: you.z }).then(() => {
    S.predictor.reset({ x: you.x, y: you.y, z: you.z });
    const a = actors.get(S.selfId) || actors.add({ id: S.selfId, kind: 'player', name: you.name, level: you.level, hp: you.hp, hpMax: you.hpMax, hostile: false,
      look: lookFor(S.mirror.infos.get(S.selfId)?.look || { race: S.look.race, seed: S.look.seed }, you.char, you.cls), x: you.x, y: you.y, z: you.z, yaw: you.yaw }, { self: true });
    a.self = true;
    controls.setFacing(you.yaw || 0); controls.cam.yaw = you.yaw || 0;
    hud.setSelf(S.self);
    refreshBar();
    if (S.phase !== 'world') startWorld(j);
    else if (prevRoom && prevRoom.id !== j.room.id && j.room.name !== prevRoom.name) { hud.zone(j.room.name); hud.chat(`You enter ${j.room.name}.`, 'system'); if (j.room.dungeon) hud.chat('Find the stairs down; the reward waits past the boss.', 'system'); }
    else if (!prevRoom || prevRoom.id === j.room.id) hud.toast('Reconnected.', 'good');
  });
}

function lookFor(look, charId, cls) {
  if (look && (look.race || look.avatar || look.body)) return { ...look, cls: look.cls || cls };
  return defaultLook(charId ?? 0, cls);
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
        hidden: !!info.hidden, hint: info.hint, lore: info.lore, key: info.key, banner: info.banner || null, trace: info.trace || null });
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
      look: kind === 'player' ? lookFor(info.look, info.char ?? id, info.cls) : npc ? folkLook(info, id) : null,
      creature: kind === 'monster' || pet ? { type: info.type || 'wolf', seed: (id * 7919) >>> 0 } : null, family: info.type && !npc ? displayName(info.type, 'monster') : null,
      x: e.x, y, z: e.z, yaw: e.yaw || 0, rank: info.rank || null, role: info.role || null, pet,
    });
    if (npc) objects.upsert({ id, type: 'npc', name: a.name, x: e.x, z: e.z, source: 'room' });
    if (e.state & STATE.dead) actors.setDead(id, true);
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
function refreshFromInfo(id) {
  objectState(id, S.mirror.infos.get(id));
  const a = actors.get(id), info = S.mirror.infos.get(id);
  if (!a || !info) return;
  const levelled = info.level > a.level;
  a.name = info.name ? displayName(info.name, a.kind) : a.name; a.level = info.level || a.level; a.hpMax = info.hpMax || a.hpMax;
  actors.refreshPlate(a);
  if (levelled && id !== S.selfId) levelFlash(id);
}

function onSnap(s) {
  S.stats.snaps++; S.stats.bytes += s.bytes || 0;
  S.mirror.snap(s);
  if (s.self && S.selfId != null && (D.view || WS.ready(S.predictor.pos.x, S.predictor.pos.z))) {
    const d = S.predictor.reconcile(s.ack, s.self);
    if (d > 0.02) { S.stats.corrections++; S.stats.maxCorrection = Math.max(S.stats.maxCorrection, d); }
  }
  if (s.vitals) { S.self.hp = s.vitals.hp; S.self.hpMax = s.vitals.hpMax; actors.setHp(S.selfId, s.vitals.hp, s.vitals.hpMax); hud.setSelf(S.self); }
  if (S.selfId != null && !!s.dead !== S.self.dead) setSelfDead(!!s.dead);
  for (const id of s.left) { actors.remove(id); objects.remove(id); if (S.target === id) setTarget(null); }
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
    }
  }
  if (S.target != null) hud.setTarget(actors.get(S.target));
}

function remember(ev) { S.events.push(ev); if (S.events.length > 200) S.events.shift(); }
function onEvent(ev) {
  if (!ev.type && ev.t) ev = { ...ev, type: ev.t };   // encounter events may still carry `t`
  remember(ev);
  const me = S.selfId;
  switch (ev.type) {
    case 'cast':
      if (ev.s === me) S.swing.last = performance.now();
      else actors.playAttack(ev.s, ev.target);
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
        if (src) S.reach = Math.max(S.reach, Math.min(30, Math.hypot(dst.pos.x - src.pos.x, dst.pos.z - src.pos.z)));
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
      actors.setDead(ev.d, true);
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
        for (const it of ev.items || []) { hud.chat(`You loot: ${it.name}`, 'loot rarity-' + (it.rarity || 'common')); hud.toast(it.name, 'loot rarity-' + (it.rarity || 'common')); }
      }
      break;
    case 'open': objects.markOpened(ev.d); break;
    case 'tele': tele.add(ev, (S.evTick ?? 0) * TICK_MS); break;
    case 'teleR': {
      const t = tele.resolve(ev);
      if (t && !ev.x) {
        const at = { x: t.x, y: groundY(t.x, t.z) + 0.4, z: t.z };
        fx.burst(at, { color: { fire: '#ff9a3d', frost: '#8fe4ff', poison: '#9ef06a', shadow: '#c08aff', lightning: '#fff08a' }[t.el] || '#ff6a4a', count: 14 });
      }
      break;
    }
    case 'boss': case 'phase': case 'castbar': case 'castX': case 'enrage': case 'say': boss.onEvent(ev); break;
    case 'obj': objects.onObj(ev); break;
    case 'aggro':
      if (ev.d === me) { const a = actors.get(ev.s); if (a) fx.number({ x: a.pos.x, y: a.pos.y + a.height + 0.3, z: a.pos.z }, '!', 'in'); }
      break;
  }
}
function levelFlash(id) { const a = actors.get(id); if (a) fx.burst({ x: a.pos.x, y: a.pos.y + 1, z: a.pos.z }, { color: '#ffe08a', count: 24 }); }

function setSelfDead(dead) {
  if (S.self.dead === dead) return;
  S.self.dead = dead; S.predictor.locked = dead;
  actors.setDead(S.selfId, dead);
  if (dead) { S.self.deadAt = performance.now(); controls.stopChase(); }
  else hud.toast('You rise again.', 'good');
}
function rise() { if (S.self.dead && S.net && performance.now() - S.self.deadAt > 2500) S.net.respawn(); }

function startWorld(j) {
  S.phase = 'world';
  $('title').classList.add('leaving');
  setTimeout(() => { $('title').hidden = true; }, 650);
  hud.show();
  hud.setSelf(S.self);
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
  const wasChasing = controls.chasing != null;
  controls.stopChase();
  const me = actors.get(S.selfId); if (!me) return;
  const next = [...actors.actors.values()].filter(x => x.hostile && !x.dead && x.tgt === S.selfId)
    .sort((p, r) => Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z) - Math.hypot(r.pos.x - me.pos.x, r.pos.z - me.pos.z))[0];
  if (next) { setTarget(next.id); if (wasChasing) controls.attack(next.id); }
}
function cycleTarget() {
  if (S.selfId == null) return;
  const p = S.predictor.pos;
  const id = tabNext(S.mirror, { id: S.selfId, x: p.x, z: p.z, yaw: controls.cam.yaw }, S.target || 0, { range: 40, facing: controls.cam.yaw, arc: Math.PI * 0.9 });
  if (!id) { hud.toast('No enemies nearby.', 'warn'); return; }
  setTarget(id);
}
// --- the skill bar (skillbar.js): the server's `you.bar` when it sends one, else Farhold's own data -------
S.bar = [];
async function refreshBar() {
  const server = S.net?.joined?.you?.bar;
  if (Array.isArray(server) && server.length) S.bar = server.map((b, i) => ({ slot: b.slot ?? i + 1, ...b, locked: b.locked ?? (S.self.level < (b.level || 1)) }));
  else S.bar = barFromData(await loadSkillData(), S.self.cls, S.self.level);
  hud.setBar(S.bar, initials);
}
/** Keys 1–6: cast that slot. Friendly skills go to a friendly target (or yourself); the rest at your enemy or ahead. */
function castSkill(n) {
  if (S.phase !== 'world' || S.self.dead || !S.net) return false;
  const sk = S.bar.find(b => b.slot === n);
  if (!sk) { hud.toast('Nothing on that key yet.', 'warn'); return false; }
  if (sk.locked) { hud.toast(`${sk.name} unlocks at level ${sk.level}.`, 'warn'); return false; }
  const now = performance.now();
  if ((S.cds?.[n] || 0) > now) { hud.toast(`${sk.name} is not ready.`, 'warn'); return false; }
  const t = S.target != null ? actors.get(S.target) : null;
  const p = S.predictor.pos;
  let target, aim;
  if (sk.ally) { target = t && !t.hostile && t.kind === 'player' ? t.id : S.selfId; aim = t && !t.hostile ? { x: t.pos.x, z: t.pos.z } : { x: p.x, z: p.z }; }
  else if (t && t.hostile && !t.dead) { target = t.id; aim = { x: t.pos.x, z: t.pos.z }; controls.setFacing(Math.atan2(t.pos.x - p.x, t.pos.z - p.z)); }
  else { const yaw = S.lastInput?.yaw ?? controls.cam.yaw; aim = { x: p.x + Math.sin(yaw) * 6, z: p.z + Math.cos(yaw) * 6 }; }
  S.net.cast({ slot: n, target, aim });
  actors.playAttack(S.selfId, target);
  hud.press(n);
  if (sk.cd) { (S.cds ||= {})[n] = now + sk.cd; hud.cooldown(n, sk.cd); }
  return true;
}

/** Swing at the target if we think the weapon is ready; the server decides (castR says no). */
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
  controls.setFacing(Math.atan2(t.pos.x - S.predictor.pos.x, t.pos.z - S.predictor.pos.z));
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
  if (p.y === undefined || p.y === null) p.y = groundY(p.x, p.z);
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
    for (const L of WS.loaded.values()) L.town?.setNight(n);
    W.horizon?.setNight(n);
    // leaves glow a little by day (thin cards read as lit canopy); at night that glow would look like phosphor
    if (leafMats?.leaf?.emissiveIntensity != null) leafMats.leaf.emissiveIntensity = 0.55 * (1 - n * 0.85);
  }
}

// --- frame loop ----------------------------------------------------------------------------------------
let last = performance.now(), elapsed = 0, titleOrbit = 0;
const FPS = { n: 0, t: 0, fps: 0 };
function frame(now) {
  requestAnimationFrame(frame);
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
      const it = controls.intent(S.predictor.pos, { targetPos: chasing, reach: Math.max(1.4, S.reach - 0.3), dead: S.self.dead });
      const inp = S.predictor.apply(it);
      S.net.input(inp);
      S.lastInput = it;
      S.movingSpeed = Math.hypot(it.mx, it.mz) > 0.01 && !S.self.dead ? (it.b & 1 ? MOVE.sprint : MOVE.run) : 0;
      if (it.inRange && controls.chasing != null) tryStrike(false);
    }
    if (steps === 5 || !online) S.acc = Math.min(S.acc, TICK_MS);
    const drawn = S.predictor.render(S.acc / TICK_MS, dt);
    if (CROWD.list.length) crowdTick(dt);
    const renderTime = S.net ? S.net.clock.serverNow() - INTERP_MS : 0;
    if (mouseNdc) { const h = actors.pickAt(mouseNdc, { exclude: S.selfId }); S.hover = h ? h.id : null; $('view').style.cursor = h ? (h.hostile && !h.dead ? 'crosshair' : 'pointer') : 'default'; }
    actors.update(fx.stopped ? dt * 0.1 : dt, renderTime, { selfPos: drawn, selfYaw: S.lastInput?.yaw ?? 0, selfMoving: S.movingSpeed, targetId: S.target, hoverId: S.hover, sample: sampleEnt, speed: speedOf });
    const me = actors.get(S.selfId);
    controls.updateCamera(drawn, dt, me ? Math.min(1.9, me.height * 0.8) : 1.5);
    fx.applyShake(camera, elapsed);
    if (S.fly) { camera.position.set(S.fly.x, S.fly.y, S.fly.z); camera.lookAt(S.fly.lx, S.fly.ly, S.fly.lz); }
    view.follow(S.fly ? { x: S.fly.lx, y: S.fly.ly, z: S.fly.lz } : drawn);
    if (!D.view) WS.update(dt, S.fly ? { x: S.fly.lx, z: S.fly.lz } : drawn);
    worldUi.tick(S.tod);
    D.view?.update(dt, S.fly ? { x: S.fly.lx, z: S.fly.lz } : drawn);
    tele.update(dt);
    boss.update(dt);
    for (const o of objects.items.values()) if (o.type === 'npc') { const a = actors.get(o.id); if (a) { o.x = a.pos.x; o.z = a.pos.z; } }
    objects.update(dt, S.self.dead ? null : drawn);
    vignette.classList.toggle('danger', tele.standingInDanger && !S.self.dead);
    hud.death(S.self.dead ? Math.max(0, 2.5 - (now - S.self.deadAt) / 1000) : null);
    if (S.self.dead && now - S.self.deadAt > 30000) rise();
    const tgt = S.target != null ? actors.get(S.target) : null;
    if (tgt) { hud.setTarget(tgt); hud.usable(0, !tgt.dead && Math.hypot(tgt.pos.x - drawn.x, tgt.pos.z - drawn.z) <= S.reach + 0.6); }
    else hud.usable(0, false);
  } else if (W.spot) {
    // Title screen (and while joining): a slow orbit around the preview character, framed right of the panel.
    titleOrbit += dt * 0.06;
    const { x: px, z: pz } = W.spot, py = groundY(px, pz);
    const ang = 0.35 + Math.sin(titleOrbit) * 0.35, dist = 6.2;
    camera.position.set(px + Math.sin(ang) * dist, py + 2.2, pz + Math.cos(ang) * dist);
    const side = window.innerWidth > 760 ? 1.9 : 0;
    camera.lookAt(px - Math.cos(ang) * side, py + 1.15, pz + Math.sin(ang) * side);
    if (preview?.still) preview.still.yaw = ang;
    actors.update(dt, 0, {});
    view.follow({ x: px, y: py, z: pz });
    WS.update(dt, { x: px, z: pz });
  }
  fx.update(dt);
  hud.tick(dt);
  view.render();
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
  S.predictor.terrain = { heightAt: WS.terrain.heightAt, walkable: WS.terrain.walkable, bounds: WS.terrain.bounds };
}
// Autoplay (tests, bots, a quick second tab) connects straight away; the title scene loads alongside.
const AUTO = (q.get('autoplay') === '1' || q.get('auto') === '1') && q.get('name');
if (AUTO) Promise.all([loadLookData(), loadMonsterLooks()]).then(() => enterWorld());
Promise.all([titleWorld(), loadLookData(), loadMonsterLooks()]).then(() => {
  rebuildPreview();
  $('loading').classList.add('done');
});

// --- test hook (stream G's two-player spec; also handy in the console) -----------------------------------
const tv = {
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
      stats: { ...S.stats, fps: FPS.fps, lod: { ...actors.lodStats }, pending: S.predictor.pending.length, rtt: S.net?.clock.rtt ?? null, draws: view.renderer.info.render.calls, tris: view.renderer.info.render.triangles, quality },
    };
  },
  walkTo(x, z) { controls.walkTo(x, z); },
  stop() { controls.stop(); },
  cast(slot = 0, targetId) {
    if (!S.net) return false;
    const t = targetId != null ? actors.get(targetId) : actors.get(S.target);
    if (t) setTarget(t.id);
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
    const ev = { id: 'world_grimtallow', uid: 'demo', name: 'Grimtallow, the Siege-Husk', province: 'torbor_downs', zoneName: 'Blackthorn Scar', x: p.x + 900, z: p.z, r: 100, level: 10, kind: 'worldboss' };
    worldUi.onRealm({ kind: 'eventSoon', ev, at: now + 600000 });
    setTimeout(() => worldUi.onRealm({ kind: 'eventStart', ev }), 2500);
    setTimeout(() => worldUi.onEventFrame({ uid: 'demo', name: ev.name, hp: 0.62, players: 23 }), 3200);
    setTimeout(() => worldUi.onGroupHint({ key: 'demo', with: [{ char: 1, name: 'Aldra' }, { char: 2, name: 'Brem' }] }), 1200);
    return { objects: [...objects.items.keys()].filter(k => String(k).startsWith('demo:')).length };
  },
  /** Open the dialog a server answer would open: tv.demoUsed({ kind: 'npc', name: 'Smith', role: 'smith' }). */
  demoUsed(u) { return worldUi.onUsed({ ok: true, ...u }); },
  /** Hide or show the HUD (clean screenshots). */
  hud(on = true) { $('hud').style.visibility = on ? '' : 'hidden'; $('plates').style.visibility = on ? '' : 'hidden'; },
  /** Hold the time of day (0 = midnight, 0.5 = noon); null goes back to the realm clock. */
  setTime(t) { S.todHold = t; todAt = 0; },
  world: () => ({ ...WS.stats(), tod: S.tod, night: S.night, horizon: !!W.horizon }),
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
window.thousandvale = { S, W, D, WS, view, actors, camera, controls, hud, fx, tv, tele, boss, objects, social, bag, worldUi, footprints };
