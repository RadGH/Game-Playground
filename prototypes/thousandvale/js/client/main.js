// Thousandvale client — boot, title screen, the connection, and the frame loop.
//
// Query flags (all optional):
//   ?offline=1            play against an in-browser server (stand-in now, stream A's Worker later)
//   &shared=0             offline in a plain Worker instead of a SharedWorker (each tab alone)
//   ?server=ws://h:p/gw   connect to a specific game server (default: same host, /gw)
//   ?lag=120              add artificial round-trip delay (ms) to feel a real network on the LAN
//   ?name=Aldra&race=elf&cls=ranger&auto=1   skip the title screen (tests, bots, join links later)
//   ?quality=low|medium|high

import * as THREE from 'three';
import { createScene } from './scene.js';
import { createTerrainView } from './terrain-view.js';
import { createDecor } from './decor.js';
import { createActors } from './actors.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createControls } from './controls.js';
import { createConnection, connectionOptionsFromQuery } from './net.js';
import { Predictor, MOVE } from './predict.js';
import { ServerClock } from './interp.js';
import * as P from './protocol.js';
import { PLAYABLE_RACES, RACE_NAMES, loadLookData } from './looks.js';
import { standinTerrain, STANDIN } from './dev/standin-terrain.js';

const q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const store = {
  get(k, d = null) { try { const v = localStorage.getItem('tv.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tv.' + k, JSON.stringify(v)); } catch {} },
};

const STRIKE = { slot: 0, cooldownMs: 1050, reach: 3.0 };       // client-side guesses for feel; the server decides
const STARTERS = ['warrior', 'paladin', 'ranger', 'rogue', 'cleric', 'mage'];
const CLASS_NAMES = { dragon_knight: 'Dragon Knight' };
const className = id => CLASS_NAMES[id] || id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const ZONE_NAME = 'Greyfang Vale';

// --- world ------------------------------------------------------------------------------------------
/**
 * Software rendering (SwiftShader: headless test browsers, machines with no GPU driver) draws the high
 * setting at about one frame a second, so it starts on low unless ?quality= says otherwise.
 */
function detectQuality() {
  if (q.get('quality')) return q.get('quality');
  try {
    const g = document.createElement('canvas').getContext('webgl2');
    const e = g && g.getExtension('WEBGL_debug_renderer_info');
    const r = e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software/i.test(r)) return 'low';
  } catch {}
  return 'high';
}
const quality = detectQuality();
const view = createScene($('view'), { quality });
const { scene, camera } = view;
// Terrain: stream B's reader replaces the stand-in here (docs/requests.md "D -> B").
const terrain = standinTerrain(7);
const ground = createTerrainView(terrain, { paths: STANDIN.paths, seed: 7, textureSize: quality === 'low' ? 256 : 512, clearings: [STANDIN.clearing] });
scene.add(ground.group);
let decor = null;
const decorReady = createDecor(terrain, { placements: STANDIN.placements, paths: STANDIN.paths, seed: 7, avoid: [{ ...STANDIN.clearing, r: 34 }], density: quality === 'low' ? 0.35 : 1, lodFar: quality === 'low' ? [30, 120] : undefined })
  .then(d => { decor = d; scene.add(d.group); return d; })
  .catch(e => { console.warn('[decor] failed', e); });

const actors = createActors(scene, { plateLayer: $('plates'), camera });
const fx = createFx(scene, { layer: $('numbers'), camera });

// --- session state ----------------------------------------------------------------------------------
const S = {
  phase: 'title',       // title -> joining -> world
  conn: null, selfId: null, token: null, tickMs: P.TICK_MS,
  predictor: new Predictor({ heightAt: terrain.heightAt, stepSec: P.TICK_MS / 1000 }),
  clock: new ServerClock(),
  target: null, hover: null,
  self: { name: '', level: 1, hp: 1, hpMax: 1, xp: 0, next: 100, dead: false, deadAt: 0 },
  nextSwingAt: 0, acc: 0, lastInput: null, movingSpeed: 0, rtt: null,
  look: store.get('look', { race: 'human', cls: 'warrior', seed: (Math.random() * 1e9) >>> 0 }),
  stats: { snaps: 0, corrections: 0, maxCorrection: 0 },
};

const hud = createHud({
  onSlot: () => tryStrike(true),
  onChatSubmit: text => { if (S.conn) S.conn.send(P.encodeChat('say', text)); },
  onChatFocus: on => controls.setTyping(on),
});

const controls = createControls({
  dom: $('view'), camera, heightAt: terrain.heightAt,
  getTarget: () => S.target,
  onSelect: (ndc) => {
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
});

// --- title screen -------------------------------------------------------------------------------------
let preview = null;
function initTitle() {
  const nameIn = $('name');
  nameIn.value = q.get('name') || store.get('name', '') || '';
  if (q.get('race')) S.look.race = q.get('race');
  if (q.get('cls')) S.look.cls = q.get('cls');
  const races = $('races');
  for (const r of PLAYABLE_RACES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.role = 'radio'; b.dataset.race = r; b.textContent = RACE_NAMES[r];
    b.onclick = () => { S.look.race = r; refreshChips(); rebuildPreview(); };
    races.appendChild(b);
  }
  loadLookData().then(({ outfits }) => {
    const all = Object.keys(outfits || {});
    const box = $('classes'), more = $('class-more');
    for (const c of STARTERS.filter(c => all.includes(c))) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.role = 'radio'; b.dataset.cls = c; b.textContent = className(c);
      b.onclick = () => { S.look.cls = c; refreshChips(); rebuildPreview(); };
      box.appendChild(b);
    }
    more.innerHTML = '<option value="">More callings…</option>' + all.filter(c => !STARTERS.includes(c)).map(c => `<option value="${c}">${className(c)}</option>`).join('');
    more.onchange = () => { if (more.value) { S.look.cls = more.value; refreshChips(); rebuildPreview(); } };
    if (!all.includes(S.look.cls)) S.look.cls = 'warrior';
    refreshChips(); rebuildPreview();
  });
  $('reroll').onclick = () => { S.look.seed = (Math.random() * 1e9) >>> 0; rebuildPreview(); };
  $('build-tag').textContent = `${P.CLIENT_BUILD} · ${connectionOptionsFromQuery().mode === 'ws' ? 'online' : 'offline (in-browser server)'}`;
  $('login').addEventListener('submit', e => { e.preventDefault(); enterWorld(); });
  refreshChips();
}
function refreshChips() {
  for (const b of document.querySelectorAll('#races .chip')) b.setAttribute('aria-checked', String(b.dataset.race === S.look.race));
  for (const b of document.querySelectorAll('#classes .chip')) b.setAttribute('aria-checked', String(b.dataset.cls === S.look.cls));
  const more = $('class-more'); if (more) more.value = STARTERS.includes(S.look.cls) ? '' : S.look.cls;
}
let previewSeq = 0;
function rebuildPreview() {
  const seq = ++previewSeq;
  if (preview) { actors.remove('preview'); preview = null; }
  const x = STANDIN.spawn.x, z = STANDIN.spawn.z;
  preview = actors.add({ id: 'preview', kind: 'player', name: '', level: 1, hp: 1, hpMax: 1, look: { ...S.look }, x, y: terrain.heightAt(x, z), z, yaw: 0.35 });
  preview.noPlate = true; if (preview.plate) preview.plate.root.style.display = 'none';
  preview.buffer.push({ t: 0, x, y: terrain.heightAt(x, z), z, yaw: 0.35 });
  store.set('look', S.look);
  return seq;
}

// --- connecting -----------------------------------------------------------------------------------------
function enterWorld() {
  const name = P.cleanName($('name').value);
  if (!name) { $('login-note').textContent = 'Pick a name of 2–16 letters.'; return; }
  $('login-note').textContent = '';
  store.set('name', name); store.set('look', S.look);
  S.self.name = name;
  $('enter').disabled = true; $('enter').textContent = 'Entering…';
  const opts = connectionOptionsFromQuery();
  S.tokenKey = 'token.' + (opts.mode === 'ws' ? opts.url : 'offline');
  const conn = createConnection(opts);
  S.conn = conn; S.phase = 'joining';
  conn.onStatus((st) => {
    hud.conn(st, { rtt: S.rtt, mode: conn.mode });
    if (st === 'open') login();
    if (st === 'reconnecting' && S.phase === 'world') hud.toast('Connection lost — reconnecting…', 'warn');
  });
  conn.on(raw => handle(P.decode(raw)));
  hud.conn(conn.status, { mode: conn.mode });
  setTimeout(() => { if (S.phase === 'joining' && conn.status !== 'open') { $('login-note').textContent = conn.mode === 'ws' ? 'Cannot reach the game server. Try ?offline=1 to play against an in-browser server.' : 'The in-browser server did not start.'; $('enter').disabled = false; $('enter').textContent = 'Enter the world'; } }, 6000);
}
function login() {
  S.conn.send(P.encodeHello());
  const token = store.get(S.tokenKey);
  S.conn.send(token ? P.encodeResume(token) : P.encodeGuest(S.self.name, S.look));
}

// --- messages ---------------------------------------------------------------------------------------------
function handle(m) {
  switch (m.type) {
    case 'welcome': {
      S.selfId = m.you; S.token = m.token; S.tickMs = m.tickMs || P.TICK_MS;
      if (m.token) store.set(S.tokenKey, m.token);
      S.clock.seed(m.serverTime);
      if (S.phase !== 'world') startWorld(m);
      else { hud.toast('Reconnected.', 'good'); }
      break;
    }
    case 'refuse':
      if (m.reason === 'token') { store.set(S.tokenKey, null); S.conn.send(P.encodeGuest(S.self.name, S.look)); break; }
      $('login-note').textContent = m.text || ('Refused: ' + m.reason);
      hud.toast(m.text || m.reason, 'bad');
      break;
    case 'spawn':
      for (const e of m.ents) {
        const self = e.id === S.selfId;
        const a = actors.add(e, { self });
        if (self) {
          a.self = true;
          S.self.name = e.name; S.self.level = e.level; S.self.hp = e.hp; S.self.hpMax = e.hpMax;
          S.predictor.reset({ x: e.x, y: e.y, z: e.z });
          controls.setFacing(e.yaw); controls.cam.yaw = e.yaw;
          hud.setSelf(S.self);
        } else if (a.buffer.s.length === 0) {
          a.buffer.push({ t: S.clock.time() - P.INTERP_DELAY_MS - 50, x: e.x, y: e.y, z: e.z, yaw: e.yaw });
        }
        if (e.hp <= 0) actors.setDead(e.id, true);
      }
      break;
    case 'snap': {
      S.stats.snaps++;
      S.clock.observe(m.time);
      if (m.you && S.selfId != null) {
        const d = S.predictor.reconcile(m.ack, m.you);
        if (d > 0.02) { S.stats.corrections++; S.stats.maxCorrection = Math.max(S.stats.maxCorrection, d); }
        if (m.you.hp != null) { S.self.hp = m.you.hp; if (m.you.hpMax) S.self.hpMax = m.you.hpMax; actors.setHp(S.selfId, S.self.hp, S.self.hpMax); hud.setSelf(S.self); }
      }
      for (const e of m.ents) {
        const a = actors.get(e.id); if (!a) continue;
        a.buffer.push({ t: m.time, x: e.x, y: e.y, z: e.z, yaw: e.yaw });
        if (e.hp != null && e.hp !== a.hp) actors.setHp(e.id, e.hp);
        if (e.anim === 'dead' && !a.dead) actors.setDead(e.id, true);
        a.tgt = e.tgt;
      }
      for (const id of m.gone) { actors.remove(id); if (S.target === id) setTarget(null); }
      if (S.target != null) hud.setTarget(actors.get(S.target));
      break;
    }
    case 'cast':
      if (m.src !== S.selfId) {
        if (m.slot === 9) { const a = actors.get(m.src); if (a && m.target === S.selfId) fx.number({ x: a.pos.x, y: a.pos.y + a.height, z: a.pos.z }, '!', 'in'); }
        else actors.playAttack(m.src, m.target);
      }
      break;
    case 'hit': {
      const dst = actors.get(m.dst), src = actors.get(m.src);
      if (m.hp != null) { actors.setHp(m.dst, m.hp); if (m.dst === S.selfId) { S.self.hp = m.hp; hud.setSelf(S.self); } }
      if (!dst) break;
      const at = { x: dst.pos.x, y: dst.pos.y + dst.height * 0.75, z: dst.pos.z };
      const mine = m.src === S.selfId, onMe = m.dst === S.selfId;
      if (m.kind === 'miss' || m.amount <= 0) { fx.number(at, onMe ? 'Dodged' : 'Miss', 'miss'); break; }
      actors.playHit(m.dst, m.src, m.amount);
      fx.burst(at, { blood: dst.kind === 'monster', count: m.crit ? 12 : 7 });
      if (mine) { fx.number(at, m.crit ? `${m.amount}!` : `${m.amount}`, m.crit ? 'crit' : 'out'); fx.shake(m.crit ? 0.55 : 0.28); fx.hitStop(m.crit ? 90 : 55); }
      else if (onMe) { fx.number(at, `-${m.amount}`, 'in'); fx.shake(0.35); }
      else fx.number(at, `${m.amount}`, 'other');
      break;
    }
    case 'death': {
      actors.setDead(m.id, true);
      const a = actors.get(m.id), by = actors.get(m.by);
      if (m.id === S.selfId) {
        S.self.dead = true; S.self.deadAt = performance.now(); S.predictor.locked = true; controls.stopChase();
        hud.chat(`You were slain by ${by?.name || 'something'}.`, 'bad');
      } else if (a && m.by === S.selfId) {
        hud.chat(`You have slain ${a.name}.`, 'combat');
      }
      if (S.target === m.id) {
        // Your target fell: if something is still biting you, turn to it and keep fighting.
        const wasChasing = controls.chasing != null;
        controls.stopChase();
        const me = actors.get(S.selfId);
        const next = me && [...actors.actors.values()].filter(x => x.hostile && !x.dead && x.tgt === S.selfId)
          .sort((p, r) => Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z) - Math.hypot(r.pos.x - me.pos.x, r.pos.z - me.pos.z))[0];
        if (next) { setTarget(next.id); if (wasChasing) controls.attack(next.id); }
      }
      break;
    }
    case 'respawn': {
      actors.setDead(m.id, false); actors.setHp(m.id, m.hp);
      const a = actors.get(m.id);
      if (m.id === S.selfId) {
        S.self.dead = false; S.self.hp = m.hp; S.predictor.locked = false; S.predictor.reset({ x: m.x, y: m.y, z: m.z });
        hud.death(null); hud.setSelf(S.self); hud.toast('You rise again.', 'good');
      } else if (a) { a.buffer.clear(); a.buffer.push({ t: S.clock.time(), x: m.x, y: m.y, z: m.z, yaw: a.yaw }); }
      break;
    }
    case 'xp': {
      const levelled = m.level > S.self.level;
      if (m.amount > 0) { const me = actors.get(S.selfId); if (me) fx.number({ x: me.pos.x, y: me.pos.y + me.height + 0.4, z: me.pos.z }, `+${m.amount} XP`, 'xp'); }
      S.self.xp = m.total; S.self.level = m.level; S.self.next = m.next;
      hud.setSelf(S.self);
      if (levelled) { const me = actors.get(S.selfId); if (me) { me.level = m.level; actors.refreshPlate(me); fx.burst({ x: me.pos.x, y: me.pos.y + 1, z: me.pos.z }, { color: '#ffe08a', count: 24 }); } }
      break;
    }
    case 'chat':
      if (m.ch === 'say') hud.chat(m.text, 'say', m.from); else hud.chat(m.text, m.ch === 'system' ? 'system' : m.ch);
      break;
    case 'notice':
      hud.toast(m.text, m.tone);
      if (m.tone === 'good') hud.chat(m.text, 'system');
      break;
    case 'pong':
      S.clock.pong(m.c, m.s); S.rtt = S.clock.rtt;
      hud.conn(S.conn.status, { rtt: S.rtt, mode: S.conn.mode });
      break;
  }
}

function startWorld(m) {
  S.phase = 'world';
  actors.remove('preview'); preview = null;
  $('title').classList.add('leaving');
  setTimeout(() => { $('title').hidden = true; }, 650);
  hud.show();
  hud.setSelf(S.self);
  hud.zone(ZONE_NAME);
  hud.chat(`Welcome to ${ZONE_NAME}.`, 'system');
  if (m.motd) hud.chat(m.motd, 'system');
  hud.chat('Wolves hunt the meadow to the north. Right-click one to attack.', 'system');
  setInterval(() => { if (S.conn) S.conn.send(P.encodePing(performance.now())); }, 2000);
  S.conn.send(P.encodePing(performance.now()));
  window.addEventListener('pagehide', () => S.conn?.close());
}

// --- targeting and combat --------------------------------------------------------------------------------
function setTarget(id) {
  if (id === S.selfId) id = null;
  S.target = id;
  if (S.conn && S.phase === 'world') S.conn.send(P.encodeTarget(id));
  hud.setTarget(id != null ? actors.get(id) : null);
}
function cycleTarget() {
  const me = actors.get(S.selfId); if (!me) return;
  const fx_ = Math.sin(controls.cam.yaw), fz_ = Math.cos(controls.cam.yaw);
  const list = [...actors.actors.values()].filter(a => a.hostile && !a.dead && a.id !== S.selfId)
    .map(a => { const dx = a.pos.x - me.pos.x, dz = a.pos.z - me.pos.z, d = Math.hypot(dx, dz); return { a, d, front: (dx * fx_ + dz * fz_) / (d || 1) }; })
    .filter(o => o.d < 45 && o.front > -0.2)
    .sort((p, r) => (p.d * (1.6 - p.front)) - (r.d * (1.6 - r.front)));
  if (!list.length) { hud.toast('No enemies nearby.', 'warn'); return; }
  const i = list.findIndex(o => o.a.id === S.target);
  setTarget(list[(i + 1) % list.length].a.id);
}
function tryStrike(fromKey) {
  if (S.phase !== 'world' || S.self.dead) return;
  const t = actors.get(S.target), me = actors.get(S.selfId);
  if (!t || !t.hostile) { if (fromKey) hud.toast('You need a target.', 'warn'); return; }
  if (t.dead) { if (fromKey) hud.toast('That target is dead.', 'warn'); return; }
  const now = performance.now();
  const d = Math.hypot(t.pos.x - S.predictor.pos.x, t.pos.z - S.predictor.pos.z);
  if (d > STRIKE.reach + 0.4) return;           // controls walk us into range; the auto-strike fires there
  if (now < S.nextSwingAt) return;
  S.nextSwingAt = now + STRIKE.cooldownMs;
  controls.setFacing(Math.atan2(t.pos.x - S.predictor.pos.x, t.pos.z - S.predictor.pos.z));
  S.conn.send(P.encodeCast(STRIKE.slot, t.id, { x: t.pos.x, z: t.pos.z }, S.clock.time()));
  actors.playAttack(S.selfId, t.id);
  hud.cooldown(0, STRIKE.cooldownMs); hud.press(0);
}

const _ray = new THREE.Raycaster();
function pickGround(ndc) {
  _ray.setFromCamera(ndc, camera);
  const o = _ray.ray.origin, dir = _ray.ray.direction;
  let prev = 0;
  for (let t = 0.5; t < 400; t += t < 40 ? 0.5 : 2) {
    const x = o.x + dir.x * t, y = o.y + dir.y * t, z = o.z + dir.z * t;
    if (y <= terrain.heightAt(x, z)) {
      // refine between prev and t
      let a = prev, b = t;
      for (let i = 0; i < 10; i++) { const m = (a + b) / 2; const mx = o.x + dir.x * m, mz = o.z + dir.z * m; if (o.y + dir.y * m <= terrain.heightAt(mx, mz)) b = m; else a = m; }
      return { x: o.x + dir.x * b, z: o.z + dir.z * b };
    }
    prev = t;
  }
  return null;
}

// Hover: highlight what is under the mouse.
let mouseNdc = null;
$('view').addEventListener('pointermove', e => { const r = $('view').getBoundingClientRect(); mouseNdc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }; });
$('view').addEventListener('pointerleave', () => { mouseNdc = null; });

// --- frame loop ----------------------------------------------------------------------------------------
let last = performance.now(), elapsed = 0, titleOrbit = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; elapsed += dt;

  if (S.phase === 'world' && S.selfId != null) {
    // Fixed sim-rate input steps: predict locally, send to the server.
    S.acc += dt * 1000;
    let steps = 0;
    while (S.acc >= S.tickMs && steps < 4) {
      S.acc -= S.tickMs; steps++;
      const t = S.target != null ? actors.get(S.target) : null;
      const chasingTarget = controls.chasing != null && t && !t.dead ? t.pos : null;
      const it = controls.intent(S.predictor.pos, { targetPos: chasingTarget, reach: STRIKE.reach - 0.4, dead: S.self.dead });
      const step = S.predictor.apply(it);
      S.conn.send(P.encodeInput(step.seq, step.mx, step.mz, step.yaw, step.run));
      S.lastInput = it;
      S.movingSpeed = Math.hypot(it.mx, it.mz) > 0.01 && !S.self.dead ? (it.run ? MOVE.run : MOVE.walk) : 0;
      if (it.inRange && controls.chasing != null) tryStrike(false);
    }
    if (steps === 4) S.acc = 0;   // a stalled tab does not try to catch up forever
    const drawn = S.predictor.render(S.acc / S.tickMs, dt);
    const renderTime = S.clock.time() - P.INTERP_DELAY_MS;
    if (mouseNdc && !controls.cam.dragging) { const h = actors.pickAt(mouseNdc, { exclude: S.selfId }); S.hover = h ? h.id : null; $('view').style.cursor = h ? (h.hostile && !h.dead ? 'crosshair' : 'pointer') : 'default'; }
    const stopped = fx.stopped;
    actors.update(stopped ? dt * 0.1 : dt, renderTime, { selfPos: drawn, selfYaw: S.lastInput?.yaw ?? 0, selfMoving: S.movingSpeed, targetId: S.target, hoverId: S.hover });
    const me = actors.get(S.selfId);
    controls.updateCamera(drawn, dt, me ? Math.min(1.9, me.height * 0.8) : 1.5);
    fx.applyShake(camera, elapsed);
    view.follow(drawn);
    decor?.update(dt, drawn);
    if (S.self.dead) hud.death(6 - (now - S.self.deadAt) / 1000); else hud.death(null);
    const tgt = S.target != null ? actors.get(S.target) : null;
    if (tgt) { hud.setTarget(tgt); hud.usable(0, !tgt.dead && Math.hypot(tgt.pos.x - drawn.x, tgt.pos.z - drawn.z) <= STRIKE.reach + 0.4); }
    else hud.usable(0, false);
  } else {
    // Title screen: a slow orbit around the preview character, framed to the right of the panel.
    titleOrbit += dt * 0.06;
    const px = STANDIN.spawn.x, pz = STANDIN.spawn.z, py = terrain.heightAt(px, pz);
    const ang = 0.35 + Math.sin(titleOrbit) * 0.35, dist = 6.2;
    camera.position.set(px + Math.sin(ang) * dist, py + 2.2, pz + Math.cos(ang) * dist);
    const side = new THREE.Vector3(-Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(window.innerWidth > 760 ? 1.9 : 0);
    camera.lookAt(px + side.x, py + 1.15, pz + side.z);
    if (preview?.buffer.s[0]) preview.buffer.s[0].yaw = ang;
    actors.update(dt, 0, { });
    view.follow({ x: px, y: py, z: pz });
    decor?.update(dt, { x: px, z: pz });
  }
  fx.update(dt);
  ground.update(elapsed);
  hud.tick(dt);
  view.render();
}

// --- boot ----------------------------------------------------------------------------------------------
initTitle();
requestAnimationFrame(frame);
Promise.all([decorReady, loadLookData()]).then(() => {
  $('loading').classList.add('done');
  if (q.get('auto') === '1' && q.get('name')) enterWorld();
});

// For tests, bots and the console. Read-only use please.
window.thousandvale = {
  S, actors, terrain, camera, controls, hud, fx,
  get selfId() { return S.selfId; }, get phase() { return S.phase; }, get target() { return S.target; },
  setTarget, tryStrike, cycleTarget,
  info() {
    const me = actors.get(S.selfId);
    return {
      phase: S.phase, selfId: S.selfId, conn: S.conn?.status, mode: S.conn?.mode, rtt: S.rtt,
      pos: me ? { x: me.pos.x, y: me.pos.y, z: me.pos.z } : null, hp: S.self.hp, level: S.self.level, xp: S.self.xp,
      target: S.target, actors: actors.actors.size, players: [...actors.actors.values()].filter(a => a.kind === 'player').map(a => ({ id: a.id, name: a.name, x: +a.pos.x.toFixed(2), z: +a.pos.z.toFixed(2) })),
      monsters: [...actors.actors.values()].filter(a => a.kind === 'monster').map(a => ({ id: a.id, name: a.name, hp: a.hp, dead: a.dead, x: +a.pos.x.toFixed(1), z: +a.pos.z.toFixed(1) })),
      stats: { ...S.stats, pending: S.predictor.pending.length, draws: view.renderer.info.render.calls, tris: view.renderer.info.render.triangles },
    };
  },
};
