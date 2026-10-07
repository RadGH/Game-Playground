// UI gallery — the stage: the game's interface, created the way js/client/main.js creates it, with no 3D world and no
// server behind it (play-test 5, T26 — stream G).
//
// What is REAL here: every module under js/client/ui/, hud.js, menubar.js, bag.js, social.js, chat.js, friends.js,
// guild.js, mail.js, callboard.js, account.js, help.js, world-ui.js, boss.js, the whole input layer (js/client/input/),
// js/net/client.js and js/net/mirror.js — imported from where the game imports them, called with the same arguments.
// What is a STAND-IN: the 3D pieces main.js owns (the scene, `actors`, `objects`, `controls`, the frame loop) — small
// objects below with the handful of methods the interface calls — and the socket (fake-net.js replays a recording).
//
// tests/G/gallery.test.js compares this file's create*() list with main.js's, so a window added to the game and not to
// the stage fails a test instead of silently missing from the mockups.

import { createHud } from '../hud.js';
import { createMenubar } from '../menubar.js';
import { createSocial } from '../social.js';
import { createBag } from '../bag.js';
import { createWorldUi } from '../world-ui.js';
import { createBossUi } from '../boss.js';
import { createChat } from '../chat.js';
import { createFriends } from '../friends.js';
import { createGuild } from '../guild.js';
import { createMail } from '../mail.js';
import { createCallboard } from '../callboard.js';
import { createAccount } from '../account.js';
import { createHelp } from '../help.js';
import { closeTop, openPanels } from '../ui-panel.js';
import { PANEL_KEYS } from '../social-core.js';
import { loadZoneNames, learnZone } from '../names.js';
import { createUiSuite } from '../ui/suite.js';
import { createUi2 } from '../ui/pt2.js';
import { createUi5 } from '../ui/pt5.js';
import { loadSkillData, barFromData, barFromServer, initials } from '../skillbar.js';
import { PLAYABLE_RACES, RACE_NAMES, loadLookData, defaultLook, avatarFor } from '../looks.js';
import { lookCustom } from '../ui/appearance-core.js';
import { connect, memoryTokenStore } from '../../net/client.js';
import { createMirror } from '../../net/mirror.js';
import { TICK_MS, KIND_NAMES, STATE } from '../../net/protocol.js';
import { installInput } from '../input/index.js';
import { createFakeServer } from './fake-net.js';
import { SCENES, sceneById } from './scenes.js';
import { initTitleLite } from './title-lite.js';
import { installFrameChrome } from './frame-chrome.js';

const GX = window.__gallery;
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const scene = sceneById(GX.scene) || SCENES[0];
const TITLE = scene.stage === 'title';
document.documentElement.dataset.scene = scene.id;
document.documentElement.dataset.stage = TITLE ? 'title' : 'world';

// ---- the 3D stand-ins -----------------------------------------------------------------------------------------
const backdrop = document.createElement('div');
backdrop.className = 'gallery-backdrop'; backdrop.dataset.kind = TITLE ? 'title' : 'world';
document.body.prepend(backdrop);

const S = {
  phase: 'title', net: null, mirror: createMirror({ tickMs: TICK_MS, keep: 12 }), selfId: null, room: null, target: null,
  self: { name: '', cls: 'cleric', level: 1, hp: 1, hpMax: 1, xp: 0, next: 100, dead: false, deadAt: 0 },
  pos: { x: 0, z: 0 }, yaw: 0, bar: [], cds: {}, look: { race: 'human', seed: 20261006 }, cls: 'cleric', tod: 0.45,
};
/** `actors` as the interface needs it: a table of bodies with a name, a place and a health bar. Nothing is drawn. */
const actors = (() => {
  const map = new Map();
  return {
    actors: map, get: id => map.get(id) || null, lodStats: {},
    add(o) { const a = { height: 1.8, dead: false, hostile: false, ...o, pos: { x: o.x || 0, y: o.y || 0, z: o.z || 0 } }; map.set(o.id, a); return a; },
    remove(id) { map.delete(id); },
    setLook(id, look) { const a = map.get(id); if (a) a.look = look; },
    setHp(id, hp, max) { const a = map.get(id); if (a) { a.hp = hp; if (max) a.hpMax = max; } },
    setDead(id, d) { const a = map.get(id); if (a) a.dead = !!d; },
    refreshPlate() {}, setMount() {}, setEating() {}, playAttack() {}, playHit() {}, say() {}, pickAt: () => null, rekey() {},
  };
})();
/** `objects`: chests, doors, town folk the map and the "E" prompt know about. */
const objects = { items: new Map(), upsert(o) { objects.items.set(o.id, { ...(objects.items.get(o.id) || {}), ...o }); }, remove(id) { objects.items.delete(id); }, clear() { objects.items.clear(); }, useFocus: () => false, markOpened() {}, setGround() {}, onObj() {}, update() {} };
/** `controls`: what you pressed. The gallery records what the input layer asks of it (the phone stick, the pad). */
const controls = {
  cam: { yaw: 0, pitch: 0.38, dist: 9, distWant: 9 }, analog: null, chasing: null, moveGoal: null, log: [],
  setTyping() {}, stopChase() {}, attack(id) { controls.log.push(['attack', id]); }, walkTo(x, z) { controls.log.push(['walkTo', x, z]); }, stop() {}, setFacing() {}, setHeightAt() {}, setBlocker() {},
  setAnalog(a) { controls.analog = a; document.documentElement.dataset.analog = a && (a.mx || a.mz) ? '1' : ''; },
};
/** The portraits module asks the renderer whether it is a software one; saying yes selects its own 2D-face path (no GPU read-backs). */
const softRenderer = { getContext: () => ({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => 'gallery software renderer (swiftshader)' }) };

// ---- the interface, in main.js's order ---------------------------------------------------------------------------
const hud = createHud({
  onSlot: i => (i ? castSkill(i) : strike()),
  onChatSubmit: text => chat.submit(text),
  onChatFocus: on => controls.setTyping(on),
  onRise: () => rise(),
});
const boss = createBossUi({ actors, serverNow: () => (S.net ? S.net.clock.serverNow() : 0), toast: hud });
const menubar = createMenubar();
const social = createSocial({ net: () => S.net, hud, actors, onTarget: id => setTarget(id), myChar: () => S.net?.joined?.you?.char ?? null });
const bag = createBag({ net: () => S.net, hud, me: () => ({ level: S.self.level, cls: S.self.cls }) });
const worldUi = createWorldUi({ hud, net: () => S.net, me: () => S.pos, room: () => S.room, onFootprints: () => {}, callout: (t, st) => boss.callout(t, st, null, true) });
const me = () => ({ name: S.self.name, level: S.self.level, cls: S.self.cls, char: S.net?.joined?.you?.char ?? null, inGuild: !!guild?.guild });
const chat = createChat({ net: () => S.net, hud, social, me, onTyping: on => controls.setTyping(on), actions: {
  openAccount: () => account.panel.open(), openFriends: () => friends.panel.open(),
  friendAdd: n => friends.add(n), friendRemove: n => friends.remove(n), isFriend: n => friends.isFriend(n),
  guildInvite: n => guild.invite(n), canGuildInvite: () => guild.canInvite(),
  command: (cmd, arg, rest) => ui2.command(cmd, arg, rest) || ui5.command(cmd, arg, rest),
} });
hud.chat = chat.line;
hud.focusChat = prefill => chat.focus(prefill);
const friends = createFriends({ net: () => S.net, hud, chat, social });
const guild = createGuild({ net: () => S.net, hud, chat, me });
const mail = createMail({ net: () => S.net, hud, bag, me, inTown: () => S.room?.kind === 'town' });
const callboard = createCallboard({ net: () => S.net, hud, me });
const account = createAccount({ net: () => S.net, hud, me, netOpts: () => ({ mode: 'ws', build: 'gallery' }),
  onLogin: async () => S.net?.chars || [], onPick: () => hud.toast('In the game this character walks into the world.', 'info'), onLoggedOut: () => {} });
const help = createHelp();
loadZoneNames();
const worldMe = () => (S.selfId != null && S.phase === 'world' ? { id: S.selfId, x: S.pos.x, z: S.pos.z, yaw: S.yaw, level: S.self.level, name: S.self.name, cls: S.self.cls, dead: S.self.dead, char: S.net?.joined?.you?.char ?? null } : null);
const ui = createUiSuite({ net: () => S.net, hud, room: () => S.room, actors, objects, worldUi, social, chat, panels: { friends: friends.panel, guild: guild.panel, mail: mail.panel, callboard: callboard.panel }, me: worldMe });
const ui2 = createUi2({ net: () => S.net, atlas: ui.atlas, hud, actors, controls, chat, social, friends, bag, help, account, objects, worldUi, renderer: softRenderer, scene: null,
  me: worldMe, self: () => S.self, targetId: () => S.target, setTarget: id => setTarget(id), infoOf: id => S.mirror.infos.get(id) || null,
  avatarFor, createBody: async () => { throw new Error('the gallery draws no 3D bodies'); }, defaultLook, races: PLAYABLE_RACES, raceNames: RACE_NAMES,
  titleLook: () => S.look, onLogout: () => hud.toast('In the game this logs you out.', 'info'),
  onLookPreview: look => { if (look) S.look = { race: look.race, seed: look.seed, ...(lookCustom(look) ? { custom: lookCustom(look) } : {}) }; },
  onLookSave: look => { S.look = look; title?.toKit(); } });
const ui5 = createUi5({ net: () => S.net, hud, bag, mail, worldUi, journal: ui.journal, actors, hotbar: ui2.hotbar, askPop: ui2.askPop, build: 'gallery', quality: 'gallery',
  me: worldMe, self: () => S.self, room: () => S.room, bar: () => S.bar,
  targetId: () => S.target, setTarget: id => setTarget(id), stats: () => ({ fps: 60 }), zoneName: () => $('zone-name')?.textContent || null,
  ensureNet: async () => { const n = startNet(); await n.ready; return n; }, onKitPreview: () => {}, onKitBack: () => title?.toAppearance(), onKitCreate: () => hud.toast('In the game this creates the character and walks into the world.', 'info') });
const PANELS = { ...ui5.panels, party: { toggle: () => social.toggleMenu() }, bag: { toggle: f => bag.toggle(f) }, friends: friends.panel, guild: guild.panel, mail: mail.panel, callboard: callboard.panel, account: account.panel, help, ...ui.panels };
for (const b of menubar.nav.querySelectorAll('.mb-btn')) if (!['party', 'bag'].includes(b.dataset.panel)) b.addEventListener('click', () => PANELS[b.dataset.panel].toggle());
// the same key handler main.js has (windows, help, chat, Esc) — the input layer turns pads and touch into these keys
window.addEventListener('keydown', e => {
  if (S.phase !== 'world' || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) return;
  if (e.code === 'KeyE' && ui2.useKey()) { e.preventDefault(); e.stopImmediatePropagation(); }
  else if (PANEL_KEYS[e.code] && !e.ctrlKey && !e.metaKey && !e.altKey) PANELS[PANEL_KEYS[e.code]].toggle();
  else if (e.code === 'F1' || (e.key === '?' && !e.ctrlKey)) { e.preventDefault(); help.toggle(); }
  else if (e.key === '/' && !e.ctrlKey) { e.preventDefault(); e.stopImmediatePropagation(); chat.focus('/'); }
  else if (e.code === 'Enter') { e.preventDefault(); hud.focusChat(); }
  else if (e.code === 'Tab') { e.preventDefault(); cycleTarget(); }
  else if (e.code === 'KeyF') strike();
  else if (/^Digit[1-6]$/.test(e.code)) castSkill(+e.code.slice(5));
  else if (e.code === 'KeyR') rise();
  else if (e.code === 'KeyH') hud.toast('In the game this calls your mount.', 'info');
  else if (e.code === 'KeyC') hud.toast('In the game this makes camp (in the wilds).', 'info');
  else if (e.code === 'Escape') {
    if (worldUi.dialogOpen) { worldUi.closeDialog(); e.stopImmediatePropagation(); }
    else if (closeTop()) e.stopImmediatePropagation();
    else if (!$('party-menu').hidden) { social.toggleMenu(false); e.stopImmediatePropagation(); }
    else if (bag.isOpen) { bag.toggle(false); e.stopImmediatePropagation(); }
    else if (S.target != null) setTarget(null);
    else if (ui2.escape()) e.stopImmediatePropagation();
  }
}, true);

// the input layer exactly as main.js installs it (gamepad, re-bound keys, hints; touch only under the phone layout)
const input = installInput({ controls, hud, setTarget: id => setTarget(id), targetId: () => S.target, pause: () => ui2.escape(), inWorld: () => S.phase === 'world', dead: () => S.self.dead,
  settings: ui2.settings, panels: PANELS, chat: () => chat.focus(), gallery: GX });

// ---- what main.js does between the interface and the server (a slim copy: no prediction, no drawing) ---------------
function setTarget(id) {
  if (id === S.selfId) id = null;
  S.target = id ?? null;
  hud.setTarget(id != null ? actors.get(id) : null);
}
function cycleTarget() {
  const foes = [...actors.actors.values()].filter(a => a.hostile && !a.dead).sort((a, b) => Math.hypot(a.pos.x - S.pos.x, a.pos.z - S.pos.z) - Math.hypot(b.pos.x - S.pos.x, b.pos.z - S.pos.z));
  if (!foes.length) { hud.toast('No enemies nearby.', 'warn'); return; }
  const i = foes.findIndex(a => a.id === S.target);
  setTarget(foes[(i + 1) % foes.length].id);
}
async function refreshBar() {
  const server = S.net?.joined?.you?.bar;
  if (Array.isArray(server)) S.bar = barFromServer(server, S.self.level);
  else S.bar = barFromData(await loadSkillData(), S.self.cls, S.self.level);
  hud.setBar(S.bar, initials);
}
function castSkill(n) {
  if (S.phase !== 'world' || S.self.dead) return false;
  const sk = S.bar.find(b => b.slot === n);
  if (!sk || sk.empty) { hud.toast(sk?.desc || 'Nothing on that key yet.', 'warn'); return false; }
  if (sk.locked) { hud.toast(`${sk.name} unlocks at level ${sk.level}.`, 'warn'); return false; }
  const now = performance.now();
  if ((S.cds[n] || 0) > now) { hud.toast(`${sk.name} is not ready.`, 'warn'); return false; }
  hud.press(n);
  if (sk.cd) { S.cds[n] = now + sk.cd; hud.cooldown(n, sk.cd); }
  return true;
}
function strike() { const t = actors.get(S.target); if (!t || !t.hostile) { hud.toast('You need a target.', 'warn'); return false; } hud.press(0); hud.cooldown(0, 1400); return true; }
function rise() { if (S.self.dead) { S.self.dead = false; hud.toast('You rise again.', 'good'); } }

function ensureActor(id) {
  if (id === S.selfId) return actors.get(id);
  const e = S.mirror.ents.get(id); if (!e || e.x === undefined) return null;
  let a = actors.get(id);
  const info = e.info || S.mirror.infos.get(id) || {};
  const kind = info.kind || KIND_NAMES[e.kind] || 'monster';
  if (kind === 'object') { objects.upsert({ id, type: info.type, name: info.name, x: e.x, z: e.z, r: info.r, state: info.state, source: 'room', hidden: !!info.hidden, key: info.key }); return null; }
  if (!a) {
    const hpMax = info.hpMax || 100;
    const npc = kind === 'npc' && (info.type === 'npc' || !!info.role), pet = kind === 'npc' && !npc;
    const nice = n => String(n || (kind === 'monster' ? 'Creature' : 'Adventurer')).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    a = actors.add({ id, kind, name: npc ? (info.name || 'Townsfolk') : kind === 'player' ? info.name || 'Adventurer' : nice(info.name), level: info.level || 1, hp: Math.round((e.hp ?? 1) * hpMax), hpMax,
      hostile: !npc && (info.team === 2 || (kind === 'monster' && info.team !== 1)), look: kind === 'player' ? { ...(info.look || defaultLook(info.char ?? id, info.cls)), cls: info.cls, gear: info.gear || {} } : npc ? defaultLook((info.key || info.name || 'folk') + ':' + (info.role || ''), 'ranger') : null,
      family: info.type && !npc ? nice(info.type) : null, x: e.x, y: 0, z: e.z, rank: info.rank || null, role: info.role || null, pet, mods: info.aff || info.mods || null });
    if (npc) objects.upsert({ id, type: 'npc', name: a.name, x: e.x, z: e.z, source: 'room' });
    if (e.state & STATE.dead) a.dead = true;
  }
  a.pos.x = e.x; a.pos.z = e.z;
  return a;
}
function onJoined(j) {
  S.room = j.room; S.selfId = j.you.id;
  S.mirror.reset();
  for (const id of [...actors.actors.keys()]) actors.remove(id);
  objects.clear(); boss.clear();
  worldUi.joined(j);
  const you = j.you;
  Object.assign(S.self, { name: you.name, cls: you.cls, level: you.level, xp: you.xp || 0, next: you.xpNext || 100, hp: you.hp, hpMax: you.hpMax, mp: you.mp ?? 0, mpMax: you.mpMax ?? 0, dead: you.hp <= 0 });
  S.pos = { x: you.x, z: you.z }; S.yaw = you.yaw || 0; controls.cam.yaw = S.yaw;
  const a = actors.add({ id: S.selfId, kind: 'player', name: you.name, level: you.level, hp: you.hp, hpMax: you.hpMax, hostile: false, look: { ...(you.look || S.look), cls: you.cls, gear: ui2.gearFor(you.equipment || {}) }, x: you.x, y: 0, z: you.z });
  a.self = true;
  hud.setSelf(S.self);
  refreshBar();
  if (S.phase !== 'world') {
    S.phase = 'world';
    $('title').hidden = true;
    hud.show();
    account.refreshPill();
    hud.zone(j.room.name || 'The Vale');
    hud.chat(`Welcome to ${j.room.name || 'the Vale'}.`, 'system');
  }
}
/**
 * Bodies the recording did not place: party members who walked up after the first snapshot stand round you, and — when no
 * monster was in view — the hand-kept ones from fixtures/moments.json (a target frame needs something to point at).
 */
function fillActors() {
  let k = 0;
  for (const [id, info] of S.mirror.infos) {
    if (id === S.selfId || actors.get(id) || info.kind !== 'player') continue;
    const a0 = 0.9 + k * 1.3, r = 3.5 + k; k++;
    actors.add({ id, kind: 'player', name: info.name || 'Adventurer', level: info.level || 1, hp: info.hpMax || 100, hpMax: info.hpMax || 100, hostile: false, look: { ...(info.look || defaultLook(info.char ?? id, info.cls)), cls: info.cls, gear: info.gear || {} }, x: S.pos.x + Math.sin(a0) * r, y: 0, z: S.pos.z + Math.cos(a0) * r });
  }
  for (const m of GX.moments?.actors?.list || []) actors.add({ ...m, hp: m.hpMax, x: S.pos.x + m.dx, y: 0, z: S.pos.z + m.dz });
}
const TAPS = new Map();
function wireNet(net) {
  const on0 = net.on;
  net.on = (ev, fn) => { (TAPS.get(ev) || TAPS.set(ev, []).get(ev)).push(fn); return on0(ev, fn); };
  net.on('status', st => hud.conn(st === 'online' ? 'open' : st === 'reconnecting' ? 'reconnecting' : 'connecting', { rtt: 38, mode: 'ws' }));
  net.on('pong', () => hud.conn('open', { rtt: 38, mode: 'ws' }));
  net.on('joined', onJoined);
  net.on('info', ents => { S.mirror.info(ents); for (const i of ents) { const a = ensureActor(i.id); if (a && i.name && a.kind === 'player') a.name = i.name; if (a && i.level) a.level = i.level; if (a && i.hpMax) a.hpMax = i.hpMax; } });
  net.on('snap', s => {
    S.mirror.snap(s);
    if (s.vitals) { S.self.hp = s.vitals.hp; S.self.hpMax = s.vitals.hpMax; S.self.mp = s.vitals.mp; S.self.mpMax = s.vitals.mpMax; hud.setSelf(S.self); }
    for (const id of s.left || []) { actors.remove(id); objects.remove(id); }
    for (const r of s.ents) { if (r.id === S.selfId) continue; const a = ensureActor(r.id); if (a && r.hp !== undefined) a.hp = Math.round(r.hp * (a.hpMax || 1)); if (a && r.state !== undefined) a.dead = !!(r.state & STATE.dead); }
  });
  net.on('you', patch => {
    if (patch.level != null) S.self.level = patch.level;
    if (patch.xp != null) S.self.xp = patch.xp;
    if (patch.xpNext != null) S.self.next = patch.xpNext;
    if (patch.hpMax != null) S.self.hpMax = patch.hpMax;
    if (patch.hp != null) S.self.hp = patch.hp;
    if (patch.mp != null) S.self.mp = patch.mp;
    if (patch.mpMax != null) S.self.mpMax = patch.mpMax;
    hud.setSelf(S.self);
    if (Array.isArray(patch.bar)) refreshBar();
  });
  net.on('ev', ({ e }) => { for (const ev0 of e || []) { const ev = !ev0.type && ev0.t ? { ...ev0, type: ev0.t } : ev0; if (['boss', 'phase', 'castbar', 'castX', 'enrage', 'say', 'fx'].includes(ev.type)) boss.onEvent(ev); } });
  net.on('equip', m => { const a = actors.get(S.selfId); if (a && m.equipment) a.look = { ...a.look, gear: ui2.gearFor(m.equipment) }; });
  net.on('zone', z => learnZone(z.zone, z.name));
  net.on('used', u => { if (worldUi.onUsed(u)) return; if (!u.ok && u.msg) hud.toast(u.msg, 'warn'); });   // as main.js routes it: dialogs, notes, graves
  net.on('castR', r => hud.toast(r.text || 'You cannot do that.', 'warn'));
  // the same order main.js wires them in
  social.wire(net);
  chat.wire(net); friends.wire(net); guild.wire(net); mail.wire(net); callboard.wire(net); account.wire(net);
  bag.wire(net);
  ui5.wire(net);
  ui.wire(net);
  worldUi.wire(net);
  ui2.wire(net);
}
const fake = createFakeServer(GX.session, GX.moments, { world: !TITLE });
const nearest = f => [...actors.actors.values()].filter(f).sort((a, b) => Math.hypot(a.pos.x - S.pos.x, a.pos.z - S.pos.z) - Math.hypot(b.pos.x - S.pos.x, b.pos.z - S.pos.z))[0] || null;
/** The @tokens of fixtures/moments.json and of scene steps. */
fake.resolve = tok => {
  let m;
  if ((m = /^@now([+-]\d+)?$/.exec(tok))) return Date.now() + (+m[1] || 0);
  if ((m = /^@me\.([xz])([+-][\d.]+)?$/.exec(tok))) return S.pos[m[1]] + (+m[2] || 0);
  if (tok === '@self') return S.selfId;
  if (tok === '@enemy') return nearest(a => a.hostile && !a.dead && a.hpMax > 10 && !a.rank)?.id ?? nearest(a => a.hostile && !a.dead)?.id ?? nearest(a => a.hostile)?.id ?? 0;
  if (tok === '@ally') return nearest(a => a.kind === 'player' && a.id !== S.selfId)?.id ?? 0;
  if (tok === '@npc') return nearest(a => a.kind === 'npc' && !a.pet)?.id ?? 0;
  if (tok === '@shop') return fake.replies('shop:open')[0]?.req.npc ?? 0;
  if (tok === '@char.ally') return (S.net?.party?.members || []).find(x => x.char !== S.net?.joined?.you?.char)?.char ?? 0;
  if (tok === '@partyFrames') { const hp = [0.31, 0.78, 0.52, 1]; return (S.net?.party?.members || []).map((x, i) => { const a = [...actors.actors.values()].find(y => y.kind === 'player' && y.name === x.name); return [x.char, Math.round(1800 * hp[i % 4]), 1800, S.room?.id, a?.pos.x ?? S.pos.x, a?.pos.z ?? S.pos.z, 0, 1, a?.id ?? null, 420 - i * 90, 600]; }); }
  if ((m = /^@item\.(.+)$/.exec(tok))) return fake.item(m[1]);
  return tok;
};
function startNet() {
  if (S.net) return S.net;
  const net = connect({ socketFactory: fake.open, build: 'gallery', tokenStore: memoryTokenStore('gallery-token'), clock: undefined });
  S.net = net; wireNet(net);
  return net;
}

// ---- the frame loop (the interface's own ticks; nothing is rendered) ----------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.phase === 'world') {
    worldUi.tick(S.tod); ui.tick(dt); ui2.tick(dt); ui5.tick(dt); boss.update(dt);
    hud.death(S.self.dead ? Math.max(0, (S.self.riseIn ?? 2.5) - (now - S.self.deadAt) / 1000) : null);
    const tgt = S.target != null ? actors.get(S.target) : null;
    if (tgt) { hud.setTarget(tgt); hud.usable(0, !tgt.dead && tgt.hostile); } else hud.usable(0, false);
  }
  hud.tick(dt);
  input.tick?.(dt);
}
requestAnimationFrame(frame);

// ---- scene steps (scenes.js is data; these are the verbs it may use) ----------------------------------------------
const q = sel => document.querySelector(sel);
async function waitFor(sel, ms = 6000) { const t0 = performance.now(); while (performance.now() - t0 < ms) { const e = q(sel); if (e && !e.hidden && e.getClientRects().length) return e; await sleep(50); } return null; }
function pointerAt(el, type, extra = {}) { const r = el.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: 'mouse', ...extra }; el.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, o)); }
const VERBS = {
  /** Open one of the game's windows by its id (the ids the menu bar and the hotkeys use). */
  async panel(id, on = true) { const p = PANELS[id]; if (!p) throw new Error('no window ' + id); if (p.open && on) p.open(); else p.toggle(on); await sleep(60); },
  /** The Party menu on a tab: party | friends | guild | mail | callboard. */
  async hub(tab) { ui.hub.show(tab); await sleep(60); },
  /** Play a recorded / hand-kept server moment through the real client. */
  async play(name) { if (!fake.play(name)) throw new Error('no moment "' + name + '" in the fixtures'); await sleep(80); },
  /** Send one message as the server would (rare: prefer a named moment). */
  async push(sock, m) { fake.push(sock, m); await sleep(40); },
  /** Ask the fake server for a recorded answer by its request key ("shop:open"), as if the window had asked. */
  async reply(key, prefer = null) {
    let r = fake.reply(key);
    if (prefer === 'offers') r = [...fake.replies(key)].sort((x, y) => (y.in[0]?.m.offers?.length || 0) - (x.in[0]?.m.offers?.length || 0))[0] || r;   // the dialog with the most on offer
    if (!r) throw new Error('no recorded reply "' + key + '"'); for (const e of r.in) fake.push(e.s || 'game', e.m); await sleep(80); },
  /** Call a test hook the game exposes (window.tvui / tvui2 / tvui5 / tv): ['call', 'tvui5.cook']. */
  async call(path, ...args) { const parts = path.split('.'); let o = window, f = null; for (const p of parts) { f = o?.[p]; if (typeof f === 'function' && p === parts[parts.length - 1]) break; o = f; } if (typeof f !== 'function') throw new Error('no hook ' + path); const out = f.apply(o, args); if (out && out.then) await out; await sleep(60); },
  async click(sel) { const e = await waitFor(sel); if (!e) throw new Error('nothing to click: ' + sel); e.click(); await sleep(80); },
  async rightClick(sel) { const e = await waitFor(sel); if (!e) throw new Error('nothing to right-click: ' + sel); pointerAt(e, 'contextmenu', { button: 2 }); await sleep(80); },
  /** Put the pointer on something so its card shows (the shared tooltip opens after 150 ms). */
  async hover(sel) { const e = await waitFor(sel); if (!e) throw new Error('nothing to hover: ' + sel); for (const t of ['pointerover', 'mouseover', 'pointerenter', 'mouseenter', 'pointermove', 'mousemove']) pointerAt(e, t); await sleep(400); },
  async focus(sel) { const e = await waitFor(sel); e?.focus(); await sleep(40); },
  async wait(ms) { await sleep(ms); },
  async waitFor(sel, ms) { if (!(await waitFor(sel, ms))) throw new Error('never appeared: ' + sel); },
  /** Select something: 'enemy' (nearest), 'elite' (a ranked monster if any), 'ally' (a party member in view), 'npc', or an entity id. */
  async target(what) {
    const near = f => [...actors.actors.values()].filter(f).sort((a, b) => Math.hypot(a.pos.x - S.pos.x, a.pos.z - S.pos.z) - Math.hypot(b.pos.x - S.pos.x, b.pos.z - S.pos.z))[0];
    const a = what === 'enemy' ? near(x => x.hostile && !x.dead && x.hpMax > 10 && !x.rank) || near(x => x.hostile && !x.dead) : what === 'elite' ? near(x => x.hostile && x.rank && x.rank !== 'normal') || near(x => x.hostile) : what === 'ally' ? near(x => x.kind === 'player' && x.id !== S.selfId) : what === 'npc' ? near(x => x.kind === 'npc' && !x.pet) : actors.get(what);
    if (!a) throw new Error('nothing to target: ' + what);
    if (what === 'enemy' || what === 'elite') { a.hp = Math.round(a.hpMax * 0.62); }
    setTarget(a.id); await sleep(40);
  },
  /** Your health / mana as fractions (a hurt HUD reads better than a full one). */
  async vitals(hp = 0.64, mp = 0.4) { S.self.hp = Math.round(S.self.hpMax * hp); if (S.self.mpMax) S.self.mp = Math.round(S.self.mpMax * mp); hud.setSelf(S.self); },
  /** You have fallen: `riseIn` seconds until the Rise button shows (0 = now). */
  async dead(riseIn = 0) { S.self.dead = true; S.self.deadAt = performance.now(); S.self.riseIn = riseIn; S.self.hp = 0; hud.setSelf(S.self); await sleep(60); },
  async toast(text, tone = 'info') { hud.toast(text, tone); },
  async chat(lines) { for (const l of lines) chat.line(l.text, l.cls || 'say', l.from || null, l); },
  /** Use a slot so its cooldown sweep shows. */
  async cast(n) { castSkill(n); },
  /** Title screens: 'new' | 'front' | 'login' | 'look' | 'kit'. */
  async title(step) { await title.go(step); },
  /** The quick wheel (pad and phone): open it, optionally pointing at a slice. */
  async wheel(id = null, ring = 0) { input.radial?.open({ ring, hold: true, point: id }); await sleep(120); },
  /** Pretend the last thing pressed was a pad / the keyboard / a finger (hints and the focus ring follow). */
  async device(d) { input.device.force(d); await sleep(40); },
  /** The pad's focus ring on an element. */
  async ring(sel) { const e = await waitFor(sel); if (e) input.focus?.set(e); await sleep(60); },
  /** The pad's steered pointer (map, perk forest) at a spot of an element (0..1). */
  async cursor(sel, fx = 0.5, fy = 0.5) { const e = await waitFor(sel); if (e) input.focus?.cursorAt(e, fx, fy); await sleep(60); },
  /** The on-screen keyboard (pad) on an input. */
  async osk(sel) { const e = await waitFor(sel); if (e) input.osk?.open(e); await sleep(60); },
  /** Phone: a tap-and-hold sheet on something that has a card. */
  async holdSheet(sel) { const e = await waitFor(sel); if (!e) throw new Error('nothing to hold: ' + sel); input.touch?.sheetFor(e); await sleep(200); },
  /** Phone: press a touch control so its state shows ('stick', 'hold-arc', 'belt'). */
  async touch(what, ...a) { input.touch?.demo(what, ...a); await sleep(120); },
  async attr(sel, name, value) { const e = await waitFor(sel); e?.setAttribute(name, value); },
  async scroll(sel, top) { const e = await waitFor(sel); if (e) e.scrollTop = top; },
  /** Clear what the boot replay printed (toasts, the zone banner) so a still picture is calm. */
  async calm() { $('toasts')?.replaceChildren(); $('zone-banner')?.classList.remove('show'); document.querySelectorAll('.tv-banner .show, .banner-stack .show').forEach(e => e.classList.remove('show')); },
};
VERBS.run = async fn => { await fn(api, VERBS); };
/** Stand next to a body (shops, loot and trade close when you are too far): an entity id or @token. */
VERBS.near = async id => { const a = actors.get(id); if (!a) throw new Error('nobody to stand next to: ' + id); S.pos = { x: a.pos.x + 1.2, z: a.pos.z + 1 }; const self = actors.get(S.selfId); if (self) { self.pos.x = S.pos.x; self.pos.z = S.pos.z; } };
/** Look at what a player wears (the right-click menu's Inspect). */
VERBS.inspect = async id => { ui2.menu.inspect(id); await sleep(200); };
/** This account is an admin (the Reports window is theirs only). */
VERBS.admin = async () => { S.net.admin = true; };
/** Track the first n quests so the HUD's quest tracker shows. */
VERBS.track = async (n = 2) => { for (const q of ui.atlas.quests.slice(0, n)) ui.atlas.setTracked(q.id); await sleep(80); };
/** Wait until the bag's 3D item icons are drawn (they are rendered a few at a time). */
VERBS.icons = async (ms = 9000) => { const t0 = performance.now(); while (performance.now() - t0 < ms && document.querySelector('#bag .islot.pending, .tv-panel:not([hidden]) .islot.pending')) await sleep(150); };
/** Settings on a tab: game | graphics | audio | keys. */
VERBS.settings = async (tab = 'game') => { ui2.settings.panel.open(); const on = () => document.querySelector(`#panel-settings [data-tab="${tab}"][aria-checked="true"]`); for (let i = 0; i < 8 && !on(); i++) { (await waitFor(`#panel-settings [data-tab="${tab}"]`))?.click(); await sleep(120); } };
/** The whole binding table three ways (generated from input/bindings.js). */
VERBS.controls = async () => { const { controlsReference } = await import('../input/bindings-ui.js'); $('hud').appendChild(controlsReference({ set: GX.glyphs || input.device.glyphs })); };
async function runSteps(steps = []) {
  for (const st of steps) {
    const [verb, ...args0] = st;
    const args = verb === 'run' ? args0 : fake.fill(args0);
    if (!VERBS[verb]) { GX.errors.push(`scene ${scene.id}: unknown step "${verb}"`); continue; }
    try { await VERBS[verb](...args); } catch (e) { GX.errors.push(`scene ${scene.id}: ${verb} ${JSON.stringify(args).slice(0, 80)} — ${e.message}`); console.error('[gallery]', scene.id, verb, e); }
  }
}

// ---- boot ----------------------------------------------------------------------------------------------------------
const title = initTitleLite({ S, account, ui2, ui5, startNet, races: PLAYABLE_RACES, raceNames: RACE_NAMES });
const api = window.gallery = { S, GX, scene, fake, hud, actors, objects, controls, panels: PANELS, ui, ui2, ui5, bag, social, chat, mail, friends, guild, callboard, account, help, worldUi, boss, menubar, input, title, verbs: VERBS, runSteps, openPanels, setTarget,
  /** What the page shows, for the spec: visible text of the interface. */
  text: () => [...document.querySelectorAll('#hud, #title:not([hidden]), .tv-panel, .tipbox, body > .ap-root, body > [class*="kit"], .phone-ui, .pad-ui')].map(e => (e.hidden ? '' : e.innerText)).join('\n'),
  ready: false, done: null };
api.done = (async () => {
  try {
    await Promise.race([loadLookData(), sleep(6000)]);
    for (let i = 0; i < 200 && !ui.talents; i++) await sleep(25);   // the Skills / Perks windows load on their own (suite.js): they must hear `joined`
    const net = startNet();
    await net.ready;
    if (TITLE) {
      account.showChars(net.chars, net.claimed ? net.username : null);
      await title.go(scene.step || 'new');
    } else {
      const ch = net.chars[net.chars.length - 1] || net.chars[0];
      await net.play(ch.id);
      await fake.whenBooted();
      await sleep(250);
      fillActors();
      await VERBS.calm();
    }
    if (document.documentElement.dataset.layout === 'phone') for (let i = 0; i < 80 && !input.touch; i++) await sleep(25);
    const layout = GX.layout === 'proposed' && scene[GX.device.startsWith('phone') ? 'phone' : GX.device === 'pad' ? 'pad' : 'x'];
    if (GX.device === 'pad' && GX.layout === 'proposed') input.device.force('pad', GX.glyphs || 'xbox');
    if (document.documentElement.dataset.layout === 'phone') input.device.force('touch');
    await runSteps(scene.steps);
    if (layout && layout.steps) await runSteps(layout.steps);
    if (GX.device.startsWith('phone') && GX.layout === 'current' && scene.phoneCurrent) await runSteps(scene.phoneCurrent);
    await sleep(scene.settle ?? 350);
    if (scene.expect) { const e = [...document.querySelectorAll(scene.expect)].find(x => !x.hidden && x.getClientRects().length); if (!e) GX.errors.push(`scene ${scene.id}: expected ${scene.expect} on screen and it is not`); }
  } catch (e) { GX.errors.push('stage: ' + e.message); console.error('[gallery] stage', e); }
  $('gallery-wait')?.remove();
  installFrameChrome({ GX, scene, api });
  api.ready = true;
  document.documentElement.dataset.ready = '1';
  try { window.parent !== window && window.parent.postMessage({ gallery: 'ready', scene: scene.id, errors: GX.errors, sent: fake.sent.length }, '*'); } catch { /* cross-origin parent: nothing to tell */ }
})();
