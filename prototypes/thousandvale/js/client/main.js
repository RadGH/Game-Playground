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

import * as THREE from 'three';
import { createScene } from './scene.js';
import { createTerrainView } from './terrain-view.js';
import { createDecor } from './decor.js';
import { createActors } from './actors.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createControls } from './controls.js';
import { loadClientTerrain } from './terrain.js';
import { findTown } from '../sim/realm.js';
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
const actors = createActors(scene, { plateLayer: $('plates'), camera });
const fx = createFx(scene, { layer: $('numbers'), camera });
const vignette = document.getElementById('vignette');
const tele = createTelegraphs(scene, {
  serverNow: () => (S.net ? S.net.clock.serverNow() : 0),
  posOf: id => { if (id === S.selfId) { const p = S.predictor.pos; return { x: p.x, z: p.z, yaw: S.lastInput?.yaw }; } const a = actors.get(id); return a ? { x: a.pos.x, z: a.pos.z, yaw: a.yaw } : null; },
  selfPos: () => (S.selfId != null && S.phase === 'world' ? S.predictor.pos : null),
  selfId: () => S.selfId,
  onHitMe: () => { vignette.classList.add('hit'); setTimeout(() => vignette.classList.remove('hit'), 220); fx.shake(0.6); },
});
const objects = createObjects(scene, { onUse: id => S.net?.use(id) });

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

// --- the world's ground (rebuilt if the server puts us on a different terrain) ------------------------
const W = { key: undefined, terrain: null, ground: null, decor: null, loading: null, loadingKey: undefined };
async function useTerrain(key, campAt = null) {
  if (W.key === key && W.terrain) { if (campAt) placeCamp(campAt); return W.terrain; }
  if (W.loading && W.loadingKey === key) { const T = await W.loading; if (campAt) placeCamp(campAt); return T; }
  W.loadingKey = key;
  W.loading = (async () => {
    const T = await loadClientTerrain(key);
    if (W.ground) { scene.remove(W.ground.group); W.ground = null; }
    const biomeColors = T.reader ? Object.fromEntries(T.reader.biomes.map(b => [b.key, b.color])) : null;
    W.terrain = T; W.key = key; W.camp = null;
    S.predictor.terrain = { heightAt: T.heightAt, walkable: T.walkable, bounds: T.bounds };
    controls.setHeightAt(T.heightAt);
    let town = null; try { town = findTown(T); } catch {}
    placeCamp(campAt || town || T.spawn, () => {
      W.ground = createTerrainView(T, { quality, textureSize: quality === 'low' ? 256 : 512, clearings: [{ ...W.camp, r: CAMP_RADIUS + 6 }], biomeColors });
      scene.add(W.ground.group);
    });
    return T;
  })();
  return W.loading;
}
/** The waystone camp (and the trees kept clear of it) at `at`; rebuilt only if it moves more than 10 m. */
function placeCamp(at, before = null) {
  const T = W.terrain;
  if (W.camp && Math.hypot(W.camp.x - at.x, W.camp.z - at.z) < 10) return;
  const moved = !!W.camp;
  W.camp = { x: at.x, z: at.z };
  if (before) before();
  else if (moved && W.ground) {
    // The ground's trodden clearing follows the camp too.
    scene.remove(W.ground.group);
    const biomeColors = T.reader ? Object.fromEntries(T.reader.biomes.map(b => [b.key, b.color])) : null;
    W.ground = createTerrainView(T, { quality, textureSize: quality === 'low' ? 256 : 512, clearings: [{ ...W.camp, r: CAMP_RADIUS + 6 }], biomeColors });
    scene.add(W.ground.group);
  }
  const old = W.decor;
  createDecor(T, { placements: campPlacements(W.camp, T), seed: 7, avoid: [{ ...W.camp, r: CAMP_RADIUS + 4 }],
    density: quality === 'low' ? 0.3 : 1, lodFar: quality === 'low' ? [0, 90] : undefined, cheap: quality === 'low' })
    .then(d => { if (W.terrain !== T) return; if (old) scene.remove(old.group); if (W.decor && W.decor !== old) scene.remove(W.decor.group); W.decor = d; scene.add(d.group); })
    .catch(e => console.warn('[decor] failed', e));
}
const groundY = (x, z) => (D.view ? 0 : W.terrain ? W.terrain.heightAt(x, z) : 0);

// --- dungeon instances (drawn from joined.room.dungeon; the outdoor ground is hidden, not thrown away) ---
const D = { view: null, roomId: null };
function enterDungeon(room) {
  if (D.roomId !== room.id || !D.view) {
    if (D.view) scene.remove(D.view.group);
    D.view = createDungeonView(room.dungeon, { quality }); D.roomId = room.id;
    scene.add(D.view.group);
  }
  if (W.ground) W.ground.group.visible = false;
  if (W.decor) W.decor.group.visible = false;
  view.setMood('dungeon');
  S.predictor.terrain = { heightAt: () => 0, walkable: D.view.terrain.walkable, bounds: D.view.terrain.bounds };
  controls.setHeightAt(D.view.cameraHeight);
  tele.setGround(() => 0); objects.setGround(() => 0);
}
function leaveDungeon() {
  if (D.view) { scene.remove(D.view.group); D.view = null; D.roomId = null; }
  if (W.ground) W.ground.group.visible = true;
  if (W.decor) W.decor.group.visible = true;
  view.setMood('outdoor');
  if (W.terrain) { S.predictor.terrain = { heightAt: W.terrain.heightAt, walkable: W.terrain.walkable, bounds: W.terrain.bounds }; controls.setHeightAt(W.terrain.heightAt); tele.setGround(W.terrain.heightAt); objects.setGround(W.terrain.heightAt); }
}
/** Ground for a room: the dungeon layout, or the zone terrain (kept when a handoff stays on it). */
async function useRoom(room) {
  if (room.dungeon) { enterDungeon(room); return; }
  await useTerrain(room.terrain, room.kind === 'town' ? (room.area || room.spawn) : room.town ? { x: room.town.x, z: room.town.z } : null);
  leaveDungeon();
}

const hud = createHud({
  onSlot: () => tryStrike(true),
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
});

const boss = createBossUi({ actors, serverNow: () => (S.net ? S.net.clock.serverNow() : 0), toast: hud });
const social = createSocial({ net: () => S.net, hud, actors, onTarget: id => setTarget(id), myChar: () => S.net?.joined?.you?.char ?? null });
const bag = createBag({ net: () => S.net, hud });
window.addEventListener('keydown', e => {
  if (S.phase !== 'world' || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
  if (e.code === 'KeyE' && objects.useFocus()) { e.preventDefault(); e.stopImmediatePropagation(); }
  else if (e.code === 'KeyB') bag.toggle();
  else if (e.code === 'KeyP') social.toggleMenu();
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
  if (!W.terrain || S.phase === 'world') return;
  actors.remove('preview');
  const { x, z } = W.camp || W.terrain.spawn, y = groundY(x, z);
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
  net.on('used', u => {
    if (!u.ok) { hud.toast(u.msg || ({ far: 'Too far away.', opened: 'Already emptied.', dead: 'You are dead.', unknown: 'Nothing happens.' }[u.why]) || 'Nothing happens.', 'warn'); if (u.why === 'opened') objects.markOpened(u.id); return; }
    const o = objects.items.get(u.id);
    if (o?.type === 'chest') objects.markOpened(u.id);
    if (o?.type === 'lever' && D.view) { D.view.openGate(D.view.floorAt(o.x, o.z)); hud.toast('Somewhere, a gate grinds open.', 'info'); }
    if (u.msg) hud.toast(u.msg, 'info');
  });
  net.on('targetR', r => { if (S.target === r.id) setTarget(null); hud.toast(r.why === 'range' ? 'Too far away to target.' : 'You cannot target that.', 'warn'); });
  net.on('castR', r => {
    if (r.why === 'cooldown') { S.swing.ms = Math.min(2500, S.swing.ms + 60); return; }
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
  preview = null;
  const you = j.you;
  Object.assign(S.self, { name: you.name, cls: you.cls, level: you.level, xp: you.xp || 0, next: you.xpNext || 100, hp: you.hp, hpMax: you.hpMax, dead: you.hp <= 0 });
  S.predictor.locked = S.self.dead;
  useRoom(j.room).then(() => {
    S.predictor.reset({ x: you.x, y: you.y, z: you.z });
    const a = actors.get(S.selfId) || actors.add({ id: S.selfId, kind: 'player', name: you.name, level: you.level, hp: you.hp, hpMax: you.hpMax, hostile: false,
      look: lookFor(S.mirror.infos.get(S.selfId)?.look || { race: S.look.race, seed: S.look.seed }, you.char, you.cls), x: you.x, y: you.y, z: you.z, yaw: you.yaw }, { self: true });
    a.self = true;
    controls.setFacing(you.yaw || 0); controls.cam.yaw = you.yaw || 0;
    hud.setSelf(S.self);
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
      const opened = (S.net?.joined?.you?.opened || {});
      objects.upsert({ id, type: info.type, name: info.name, x: e.x, z: e.z, yaw: e.yaw || 0, r: info.r, state: info.state, source: 'room', opened: info.type === 'chest' && !!(info.key && opened[info.key] && opened[info.key] > Date.now()) });
      objectState(id, info);
      return null;
    }
    const hpMax = info.hpMax || 100;
    const y = e.y ?? groundY(e.x, e.z);
    a = actors.add({
      id, kind, name: displayName(info.name, kind), level: info.level || 1,
      hp: Math.round((e.hp ?? 1) * hpMax), hpMax, hostile: info.team === 2 || (kind === 'monster' && info.team !== 1),
      look: kind === 'player' ? lookFor(info.look, info.char ?? id, info.cls) : null,
      creature: kind !== 'player' ? { type: info.type || 'wolf', seed: (id * 7919) >>> 0 } : null, family: info.type ? displayName(info.type, 'monster') : null,
      x: e.x, y, z: e.z, yaw: e.yaw || 0, rank: info.rank || null,
    });
    if (e.state & STATE.dead) actors.setDead(id, true);
  }
  return a;
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
  if (s.self && S.selfId != null && W.terrain) {
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
      if (ev.d === me) { S.self.level = ev.level; hud.setSelf(S.self); hud.toast(`You reached level ${ev.level}!`, 'good'); hud.chat(`You reached level ${ev.level}.`, 'system'); }
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
  const zone = j.room.name || W.terrain?.name || 'The Vale';
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

// --- frame loop ----------------------------------------------------------------------------------------
let last = performance.now(), elapsed = 0, titleOrbit = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; elapsed += dt;

  if (S.phase === 'world' && S.selfId != null && W.terrain && actors.get(S.selfId)) {
    // Fixed 20 Hz input steps: predict locally, send the same step to the server.
    const online = S.net?.status === 'online';
    S.acc += dt * 1000;
    let steps = 0;
    while (online && S.acc >= TICK_MS && steps < 4) {
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
    if (steps === 4 || !online) S.acc = 0;
    const drawn = S.predictor.render(S.acc / TICK_MS, dt);
    const renderTime = S.net ? S.net.clock.serverNow() - INTERP_MS : 0;
    if (mouseNdc) { const h = actors.pickAt(mouseNdc, { exclude: S.selfId }); S.hover = h ? h.id : null; $('view').style.cursor = h ? (h.hostile && !h.dead ? 'crosshair' : 'pointer') : 'default'; }
    actors.update(fx.stopped ? dt * 0.1 : dt, renderTime, { selfPos: drawn, selfYaw: S.lastInput?.yaw ?? 0, selfMoving: S.movingSpeed, targetId: S.target, hoverId: S.hover, sample: sampleEnt, speed: speedOf });
    const me = actors.get(S.selfId);
    controls.updateCamera(drawn, dt, me ? Math.min(1.9, me.height * 0.8) : 1.5);
    fx.applyShake(camera, elapsed);
    view.follow(drawn);
    W.ground?.update(dt, drawn);
    W.decor?.update(dt, drawn);
    D.view?.update(dt, drawn);
    tele.update(dt);
    boss.update(dt);
    objects.update(dt, S.self.dead ? null : drawn);
    vignette.classList.toggle('danger', tele.standingInDanger && !S.self.dead);
    hud.death(S.self.dead ? Math.max(0, 2.5 - (now - S.self.deadAt) / 1000) : null);
    if (S.self.dead && now - S.self.deadAt > 30000) rise();
    const tgt = S.target != null ? actors.get(S.target) : null;
    if (tgt) { hud.setTarget(tgt); hud.usable(0, !tgt.dead && Math.hypot(tgt.pos.x - drawn.x, tgt.pos.z - drawn.z) <= S.reach + 0.6); }
    else hud.usable(0, false);
  } else if (W.terrain) {
    // Title screen (and while joining): a slow orbit around the preview character, framed right of the panel.
    titleOrbit += dt * 0.06;
    const { x: px, z: pz } = W.camp || W.terrain.spawn, py = groundY(px, pz);
    const ang = 0.35 + Math.sin(titleOrbit) * 0.35, dist = 6.2;
    camera.position.set(px + Math.sin(ang) * dist, py + 2.2, pz + Math.cos(ang) * dist);
    const side = window.innerWidth > 760 ? 1.9 : 0;
    camera.lookAt(px - Math.cos(ang) * side, py + 1.15, pz + Math.sin(ang) * side);
    if (preview?.still) preview.still.yaw = ang;
    actors.update(dt, 0, {});
    view.follow({ x: px, y: py, z: pz });
    W.ground?.update(dt, { x: px, z: pz });
    W.decor?.update(dt, { x: px, z: pz });
  }
  fx.update(dt);
  hud.tick(dt);
  view.render();
}

// --- boot ----------------------------------------------------------------------------------------------
initTitle();
requestAnimationFrame(frame);
// The title screen stands on the test zone (where M0 puts everyone); joined.room.terrain decides after that.
Promise.all([useTerrain('test'), loadLookData(), loadMonsterLooks()]).then(() => {
  rebuildPreview();
  $('loading').classList.add('done');
  const auto = q.get('autoplay') === '1' || q.get('auto') === '1';
  if (auto && q.get('name')) enterWorld();
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
      stats: { ...S.stats, pending: S.predictor.pending.length, rtt: S.net?.clock.rtt ?? null, draws: view.renderer.info.render.calls, tris: view.renderer.info.render.triangles, quality },
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
window.thousandvale = { S, W, D, actors, camera, controls, hud, fx, tv, tele, boss, objects, social, bag };
