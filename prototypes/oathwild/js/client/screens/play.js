// The world: the 3D view of the shared world, your predicted hero, everyone else on the server's clock, the camera
// and the crosshair, spells with their ground indicators, interaction (talk, loot, open, use, shrines, revive), the HUD
// and the windows the server opens. Entered from the world list with the server's 'enter' message.
import * as THREE from 'three';
import { createView } from '../render/view.js';
import { createWorldView } from '../render/world.js';
import { createActors } from '../render/actors.js';
import { createFx } from '../render/fx.js';
import { createCamera } from '../play/camera.js';
import { createPredictor } from '../play/predict.js';
import { createHud } from '../play/hud.js';
import { createTouch } from '../play/touch.js';
import { createInput } from '../input/input.js';
import { castRow } from '../../rules/classes.js';
import { targetKind } from '../../rules/spells.js';
import { npcAt, npcPresent, liveObjects, questStatus } from '../../world/quests.js';
import { STEP, BTN, UF, packButtons } from '../../net/protocol.js';
import { windowsOpen, closeAll, findWin } from '../ui/kit.js';
import { fmt } from '../../../../../shared/format.js';

const WIN_OF = { loot: 'loot', talk: 'talk', shop: 'shop', repair: 'repair', stable: 'stable', trainer: 'trainer', respec: 'respec', travel: 'travel', locked: 'locked' };
const AIMED = new Set(['ground', 'cone', 'line']);

export async function show(app, { enter = null } = {}) {
  if (!enter) { app.go(app.world ? 'worlds' : 'title'); return { close() {} }; }
  const W = app.W, T = W.terrain, book = W.book, placements = W.data.placements;
  const heightAt = (x, z) => app.ground.y(x, z);
  // ---------------------------------------------------------------- the 3D view (made once per page)
  if (!app.view) {
    app.view = createView(document.getElementById('view'), { quality: app.settings.quality });
    app.worldView = createWorldView(app.view, { T, placements, art: app.art, scattered: app.scattered, book, quality: app.settings.quality });
    app.actors = createActors(app.view, { rules: app.rules, art: app.art, quality: app.settings.quality, maxTabards: app.settings.quality === 'low' ? 6 : 16 });
    app.fx = await createFx(app.view, { heightAt, quality: app.settings.quality });
  }
  const view = app.view, actors = app.actors, fx = app.fx;
  const canvas = view.renderer.domElement;
  canvas.style.visibility = 'visible';
  if (!app.input) {
    app.input = createInput({ canvas, bindings: app.bindings, blocked: () => windowsOpen() > 0 || app.screenName !== 'play' });
    app.input.onDevice = d => { app.device = d; app.emit('device', d); };
  }
  const input = app.input;
  const cam = createCamera(view, { heightAt, tuning: app.tuning || {}, settings: app.settings });
  const pred = createPredictor({ ground: app.ground, combat: app.rules.data.combat });

  // ---------------------------------------------------------------- state
  const S = {
    meId: enter.you, units: new Map(), auras: new Map(), target: null, cooldowns: {}, interact: null, tags: [], npcs: [], questMarkers: [],
    drawnMe: null, meFacing: 0, placeName: '', downLeft: 0, barrier: 0, aimingSlot: null, lootBoxes: [], zones: new Map(), lastSnap: 0,
  };
  app.world = enter.world;
  app.me = { ...(app.me || {}), char: enter.char };
  let clockOff = null, lastAck = 0;
  let acc = 0, lastT = performance.now(), raf = 0, alive = true;
  let sneakOn = false, aim = null, aimFx = null, windFx = null, placeSlot = null, pending = null, channelSlot = null, mountPress = false, dodgePress = false, powerPress = false, respawnPress = false;
  let lastAttackAt = -9, lastCastAt = -9, softTarget = null;
  const meUnit = () => S.units.get(S.meId);

  function unitFrom(info) {
    return { id: info.id, info, buf: [], x: 0, y: 0, z: 0, facing: 0, hp: info.mh, mp: 0, st: 0, ba: 0, fl: 0, downed: false, hostile: info.side === 'monsters', lastX: null, lastZ: null, speed: 0, actedAt: -9, height: 1.8, mh: info.mh, mm: info.mm, ms: info.ms };
  }

  // ---------------------------------------------------------------- server messages
  const offs = [];
  const onSnap = m => {
    const now = performance.now() / 1000;
    const off = m.wt - now;
    clockOff = clockOff == null ? off : Math.max(clockOff + (off - clockOff) * 0.08, Math.min(clockOff, off));
    S.lastSnap = performance.now();
    for (const info of m.add || []) {
      let u = S.units.get(info.id);
      if (!u) { u = unitFrom(info); S.units.set(info.id, u); } else { u.info = info; u.mh = info.mh; u.mm = info.mm; u.ms = info.ms; }
      actors.unit(info.id, info, { me: info.id === S.meId });
    }
    for (const [id, x, z, f, hp, mp, st, ba, fl] of m.u) {
      const u = S.units.get(id);
      if (!u) continue;
      u.buf.push({ t: m.wt, x, z, f });
      if (u.buf.length > 12) u.buf.shift();
      u.hp = hp; u.mp = mp; u.st = st; u.ba = ba; u.fl = fl; u.downed = !!(fl & UF.downed);
      if (id === S.meId) {
        if (m.tp || u.buf.length === 1) { pred.reset(x, z); cam.update(0, { x, y: heightAt(x, z), z }, { snap: true }); }
        else pred.reconcile(m.ack, x, z);
        lastAck = m.ack;
      }
    }
    for (const id of m.gone || []) { if (!S.units.has(id)) continue; S.units.delete(id); actors.drop(id, { corpse: dying.has(id) }); dying.delete(id); }
    if (m.au) { for (const [id, list] of Object.entries(m.au)) if (id !== 'b') S.auras.set(id, list); S.barrier = m.au.b || 0; }
    if (m.cd) S.cooldowns = m.cd;
    if (m.pj) fx.bolts(m.pj, spell => elementOf(spell));
    if (m.lb) S.lootBoxes = m.lb.map(([id, x, z, kind, name]) => ({ id, x, z, kind, name }));
    S.downLeft = m.dn?.left ?? S.downLeft;
    S.revive = m.rv || null;
    for (const e of m.ev || []) onEvent(e);
  };
  const dying = new Set();
  const elementOf = spell => { try { return spell ? castRow(app.rules, app.me.char, spell)?.element || app.rules.spells?.[spell]?.element : null; } catch { return app.rules.spells?.[spell]?.element || null; } };
  const posOf = id => { const u = S.units.get(id); return u ? [u.x, u.y, u.z] : null; };
  function onEvent(e) {
    const me = S.meId;
    switch (e.t) {
      case 'hit': {
        const p = posOf(e.to);
        if (p) app.play.hud.number(p[0], p[1], p[2], `${e.crit ? '' : ''}${fmt(e.amount)}${e.crit ? '!' : ''}`, e.to === me ? 'hurt' : e.from === me ? (e.crit ? 'crit' : 'mine') : 'other');
        actors.get(e.to)?.act('hit');
        const from = S.units.get(e.from);
        if (from && !e.spell && performance.now() / 1000 - (from.swungAt || 0) > 0.35) { from.swungAt = performance.now() / 1000; from.actedAt = from.swungAt; actors.get(e.from)?.act('attack'); }
        if (p && e.spell) fx.impact(p.map((v, i) => (i === 1 ? v + 1.1 : v)), e.spell, e.element, 1);
        if (e.from === me || e.to === me) app.sfx(e.crit ? 'melee.crit' : e.spell ? `spell.${e.element === 'ice' ? 'ice' : e.element || 'physical'}.impact` : 'melee.hit');
        if (e.from === me && S.units.get(e.to)?.hostile) softTarget = { id: e.to, until: performance.now() + 6000 };
        break;
      }
      case 'tick': { const p = posOf(e.to); if (p && e.to === me) app.play.hud.number(p[0], p[1], p[2], fmt(e.amount), 'tick'); break; }
      case 'heal': { const p = posOf(e.to); if (p && e.amount > 0) app.play.hud.number(p[0], p[1], p[2], `+${fmt(e.amount)}`, 'heal'); if (e.to === me) app.sfx('heal'); break; }
      case 'barrier': { const p = posOf(e.who); if (p) app.play.hud.number(p[0], p[1], p[2], `+${fmt(e.amount)} shield`, 'heal'); break; }
      case 'miss': { const p = posOf(e.to || e.who); if (p && (e.who === me || e.to === me)) app.play.hud.number(p[0], p[1], p[2], e.dodged ? 'Dodged' : e.evade ? 'Evaded' : 'Miss', 'miss'); if (e.who && !e.to) { const u = S.units.get(e.who); if (u && performance.now() / 1000 - (u.swungAt || 0) > 0.35) { u.swungAt = u.actedAt = performance.now() / 1000; actors.get(e.who)?.act('attack'); } } if (e.who === me) app.sfx('melee.swing'); break; }
      case 'cast': {
        const u = S.units.get(e.who); if (u) { u.actedAt = performance.now() / 1000; actors.get(e.who)?.act('cast'); }
        const el = elementOf(e.spell);
        if (e.kind === 'ground' && e.at) fx.impact([e.at[0], heightAt(e.at[0], e.at[1]) + 0.3, e.at[1]], e.spell, el, 2.5);
        else if (e.kind === 'self' && u) fx.impact([u.x, u.y + 1, u.z], e.spell, el, 1.6);
        if (e.who === me) { lastCastAt = performance.now() / 1000; app.sfx('cast.start'); }
        break;
      }
      case 'projectile': { const u = S.units.get(e.who); if (u) { u.actedAt = performance.now() / 1000; if (!e.spell) actors.get(e.who)?.act('attack'); } if (e.who === me) app.sfx(e.spell ? 'magic.missile' : 'arrow.shot'); break; }
      case 'zone': { const r = fx.ground([e.at[0], heightAt(e.at[0], e.at[1]), e.at[1]], e.spell, elementOf(e.spell), e.radius, e.seconds); S.zones.set(e.at.join(','), r); break; }
      case 'death': { dying.add(e.who); const u = S.units.get(e.who); if (u?.info.k === 'monster') app.sfx(/wolf|bear|boar|lion|bristle/.test(u.info.def || '') ? 'death.beast' : 'death.humanoid'); break; }
      case 'downed': actors.get(e.who)?.act('death'); if (e.who === me) { app.toast('You have fallen.', 'bad'); input.unlock(); } break;
      case 'revived': case 'respawned': actors.get(e.who)?.revive(); if (e.who === me) app.sfx('revive'); break;
      case 'xp': if (e.who === me) app.play.hud.log(`+${fmt(e.amount)} experience`, 'xp'); break;
      case 'loot': if (e.players?.includes(app.me?.char?.id)) { app.play.hud.log(`Loot waiting: ${e.name || 'remains'}`, 'loot'); app.sfx('loot.common'); } break;
      case 'skill': if (e.who === me) app.toast(`${app.rules.data.skillsUse.skills[e.skill]?.name || 'Skill'} is now ${fmt(e.to)}`, 'good'); break;
      case 'dodge': actors.get(e.who)?.act('dodge'); break;
      case 'mount': { const a = actors.get(e.who); if (a) actors.setMounted(a, !!e.on); if (e.who === me && e.thrown) app.toast('Thrown from your horse.', 'bad'); break; }
      case 'leash': { const p = posOf(e.who); if (p) app.play.hud.number(p[0], p[1], p[2], 'Evade', 'miss'); break; }
      case 'channelEnd': if (e.who === me) channelSlot = null; break;
      default: break;
    }
  }
  const early = app.snapBuf || []; app.snapBuf = null;
  // the first snapshots arrived while the world was being built: replay their units (not their old events)
  for (const m of early) onSnap({ ...m, ev: [] });
  offs.push(app.on('s', onSnap));
  offs.push(app.on('win', m => {
    if (m.kind === 'close') { findWin('talk')?.close(); return; }
    if (m.kind === 'loot') app.lastLoot = m;
    if (m.kind === 'shop') app.lastShop = m;
    const name = WIN_OF[m.kind];
    if (name) { input.unlock(); app.openWindow(name, m); }
  }));
  offs.push(app.on('say', m => { app.play.hud.log(m.text, m.kind); if (['quest', 'found', 'level', 'good', 'gold', 'bad'].includes(m.kind) && m.kind !== 'gold') app.toast(m.text, m.kind); if (m.kind === 'quest' && /complete/i.test(m.text)) app.sfx('quest.complete'); if (m.kind === 'gold') app.sfx('coin'); }));
  offs.push(app.on('err', m => { if (m.code === 'version') return; app.toast(m.msg, 'bad', m.quiet ? 1600 : 2600); }));
  offs.push(app.on('leveled', m => { app.sfx('levelup'); app.toast(`Level ${m.level}!`, 'level'); }));
  offs.push(app.on('enter', m => { S.meId = m.you; app.world = m.world; app.me = { ...(app.me || {}), char: m.char }; }));   // back after a drop
  offs.push(app.on('me', () => { app.play?.hud?.drawBar(); }));
  offs.push(app.on('windows', n => { if (n) input.unlock(); }));
  offs.push(app.on('device', () => app.play?.hud?.drawWins()));

  // ---------------------------------------------------------------- spells and aiming
  function slotSpell(slot) { return app.me?.char?.bar?.[slot] || null; }
  function rowOf(spell) { try { return castRow(app.rules, app.me.char, spell); } catch { return null; } }
  function slotDown(slot, src = 'keys') {
    const spell = slotSpell(slot);
    if (!spell || meUnit()?.downed) return;
    const row = rowOf(spell); if (!row) return;
    const kind = targetKind(row);
    if (row.channel) { pending = { slot, held: true }; channelSlot = slot; return; }
    const aimed = AIMED.has(kind) || (kind === 'self' && (row.radius || 0) >= 3 && row.mult);
    if (aimed && src === 'touch' && kind === 'ground') { placeSlot = slot; app.play.touch?.placing(`Tap the ground to place ${row.name}`); startAim(slot, row, kind); return; }
    if (aimed && !app.settings.quickCast && src !== 'touch') { startAim(slot, row, kind); return; }
    cast(slot);
  }
  function slotUp(slot, { cancel = false } = {}) {
    if (channelSlot === slot) { channelSlot = null; return; }
    if (S.aimingSlot !== slot || placeSlot === slot) return;
    stopAim();
    if (!cancel) cast(slot);
  }
  function startAim(slot, row, kind) {
    stopAim();
    S.aimingSlot = slot;
    const shape = kind === 'ground' || kind === 'self' ? 'circle' : kind === 'cone' ? 'cone' : 'line';
    const heal = row.heal || row.healPower || row.target === 'ally';
    aimFx = { shape, row, kind, h: fx.indicator(shape, { at: { x: 0, z: 0 }, radius: row.radius || row.place?.radius || 3, length: kind === 'cone' ? Math.max(row.reach || 3, 2) : (row.dash?.range || row.range || 20), width: row.width || (row.splash ? row.splash * 2 : 1.6), angle: row.arc || 1.6, kind: heal ? 'friendly' : 'hostile' }) };
    const a = actors.get(S.meId);
    windFx = a ? fx.windup(a.body?.bones?.hand_r || a.root, slotSpell(slot), row.element, a.body?.bones ? [a.body.bones.hand_l, a.body.bones.hand_r].filter(Boolean) : null) : null;
  }
  function stopAim() { aimFx?.h.stop(); aimFx = null; windFx?.stop(); windFx = null; S.aimingSlot = null; }
  function cast(slot) {
    const at = aim ? [aim.point.x, aim.point.y, aim.point.z] : null;
    pending = { slot, at, held: false };
  }
  function cancelPlace() { placeSlot = null; stopAim(); app.play.touch?.placing(null); }
  function tapAt(x, y) {
    const sx = (x / innerWidth) * 2 - 1, sy = -(y / innerHeight) * 2 + 1;
    const me = meUnit(); if (!me) return;
    const hit = cam.aim({ units: aimUnits(), from: { x: pred.state.x, z: pred.state.z }, screen: { x: sx, y: sy } });
    if (placeSlot != null) { aim = hit; const s = placeSlot; placeSlot = null; stopAim(); app.play.touch?.placing(null); cast(s); return; }
    if (hit.unit) S.target = hit.unit.id;
  }

  // ---------------------------------------------------------------- targeting
  function aimUnits() {
    const out = [];
    for (const u of S.units.values()) if (u.id !== S.meId && !u.downed) out.push({ id: u.id, x: u.x, y: u.y, z: u.z, height: actors.get(u.id)?.height || 1.8, hostile: u.hostile, radius: 0.5 });
    return out;
  }
  function pickTarget(next = false) {
    const f = cam.forward(), me = pred.state;
    const list = [...S.units.values()].filter(u => u.hostile && !u.downed && Math.hypot(u.x - me.x, u.z - me.z) < 35)
      .map(u => { const dx = u.x - me.x, dz = u.z - me.z, d = Math.hypot(dx, dz) || 1; return { u, d, front: (dx * f.x + dz * f.z) / d }; })
      .filter(o => o.front > 0.2).sort((a, b) => a.d - b.d);
    if (!list.length) { S.target = null; return; }
    if (next && S.target) { const i = list.findIndex(o => o.u.id === S.target); S.target = list[(i + 1) % list.length].u.id; }
    else S.target = list[0].u.id;
  }

  // ---------------------------------------------------------------- interaction (E / Use)
  const LOOT_R = 4.5, NPC_R = 4.5, OBJ_R = 4, SHRINE_R = 6;
  function wsLike() { const c = app.me?.char; return { quests: app.ws?.quests || {}, flags: app.ws?.flags || [], playerFlags: c ? { [c.id]: app.ws?.my || [] } : {}, shrines: app.ws?.shrines || [], players: {} }; }
  function findInteract() {
    const me = pred.state, mu = meUnit();
    if (!mu || mu.downed) return null;
    const near = (x, z, r) => Math.hypot(x - me.x, z - me.z) <= r;
    const R = app.tuning?.interactMetres || LOOT_R;
    // a fallen friend first
    for (const u of S.units.values()) if (u.info.k === 'player' && u.downed && u.id !== S.meId && near(u.x, u.z, app.rules.data.combat.death.reviveRange + 0.5)) return { kind: 'revive', id: u.id, text: `Hold to bring ${u.info.n} back`, progress: S.revive?.id === u.id ? S.revive.held / app.rules.data.combat.death.reviveSeconds : null };
    let best = null;
    const consider = (d, o) => { if (!best || d < best.d) best = { ...o, d }; };
    for (const b of S.lootBoxes) { const d = Math.hypot(b.x - me.x, b.z - me.z); if (d <= R) consider(d - 1, { kind: 'loot', id: b.id, text: `Search ${b.name || 'the remains'}` }); }
    for (const n of S.npcs) { const d = Math.hypot(n.x - me.x, n.z - me.z); if (d <= NPC_R) consider(d, { kind: 'talk', id: n.id, text: `Talk to ${n.name}` }); }
    for (const c of placements.chests) { const d = Math.hypot(c.at[0] - me.x, c.at[1] - me.z); if (d <= OBJ_R) consider(d, { kind: 'chest', id: c.id, text: `Open ${c.name || 'the chest'}` }); }
    for (const o of S.liveObjects || []) { const ob = book.objects[o.object]; if (!ob) continue; const d = Math.hypot(ob.at[0] - me.x, ob.at[1] - me.z); if (d <= OBJ_R + 0.5) consider(d - 0.5, { kind: 'use', id: o.object, text: `${o.kind === 'use' ? 'Use' : 'Search'} ${ob.name}` }); }
    for (const s of placements.shrines) { const d = Math.hypot(s.at[0] - me.x, s.at[1] - me.z); if (d <= SHRINE_R) consider(d + 0.5, { kind: 'shrine', id: s.id, name: s.name, text: `${s.name}: travel, enchant, change your path` }); }
    return best;
  }
  function interact(it) {
    if (!it) return;
    if (it.kind === 'loot') app.act('loot-open', { id: it.id });
    else if (it.kind === 'talk') app.act('talk', { npc: it.id });
    else if (it.kind === 'chest') app.act('chest', { id: it.id });
    else if (it.kind === 'use') app.act('use', { id: it.id });
    else if (it.kind === 'shrine') { input.unlock(); app.openWindow('shrine', { id: it.id, name: it.name }); }
  }

  // ---------------------------------------------------------------- the HUD
  app.play = {
    S, cam, slotDown, slotUp, cancelPlace, tapAt,
    get target() { return S.target; },
    auraUnit(id) {
      const list = S.auras.get(id) || [];
      const statuses = Object.fromEntries(list.map(a => [a.id, { ...(a.e || {}), name: a.n, remaining: a.r, total: a.to, stacks: a.s, beneficial: a.k === 'buff' }]));
      const u = S.units.get(id);
      return { statuses, maxHp: u?.mh || 1, barrier: id === S.meId ? S.barrier : 0 };
    },
    meState() { const u = meUnit(); return u ? { id: u.id, x: pred.state.x, z: pred.state.z, hp: u.hp, maxHp: u.mh, mp: u.mp, stamina: u.st, downed: u.downed, mounted: !!(u.fl & UF.mounted), target: S.target, aiming: S.aimingSlot, q: pred.state.q, ack: lastAck } : null; },
    playersState() { return [...S.units.values()].filter(u => u.info.k === 'player').map(u => ({ id: u.id, name: u.info.n, x: u.id === S.meId ? pred.state.x : u.x, z: u.id === S.meId ? pred.state.z : u.z, hp: u.hp, downed: u.downed })); },
    positions() { return app.play.playersState().map(p => ({ ...p, me: p.id === S.meId })); },
    unitsState() { return [...S.units.values()].map(u => ({ id: u.id, k: u.info.k, name: u.info.n, x: u.x, z: u.z, hp: u.hp, hostile: u.hostile })); },
  };
  app.play.hud = createHud(app, app.play);
  const touchy = matchMedia('(pointer: coarse)').matches;
  app.play.touch = touchy ? createTouch(app, input, app.play) : null;
  document.body.classList.toggle('ow-touch', touchy);

  // ---------------------------------------------------------------- the step (20 a second): input → prediction → server
  function step() {
    const me = meUnit(); if (!me) return;
    const ax = input.moveAxis();
    const f = cam.forward(), r = cam.right();
    let dx = r.x * ax.x + f.x * ax.y, dz = r.z * ax.x + f.z * ax.y;
    const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
    if (input.take('sneak')) sneakOn = !sneakOn;
    const dodge = dodgePress; dodgePress = false;
    const mount = mountPress; mountPress = false;
    const power = powerPress; powerPress = false;
    const respawn = respawnPress; respawnPress = false;
    const auras = S.auras.get(S.meId) || [];
    const held = auras.some(a => ['root', 'sleep', 'stagger', 'stasis', 'transmuted'].includes(a.id));
    const attack = (input.held('attack') || input.take('attackTap')) && !S.aimingSlot && placeSlot == null;
    const block = input.held('block') && S.aimingSlot == null;
    const sprint = input.held('sprint');
    pred.step({ x: dx, z: dz }, {
      canMove: !me.downed && !held, speed: app.me?.speed || 5, sprint, block, sneak: sneakOn, dodge, stamina: me.st, overloaded: !!app.me?.sheet?.overloaded,
      mounted: !!(me.fl & UF.mounted), facingDir: aim?.dir || f,
    }, STEP);
    const hero = { x: pred.state.x, z: pred.state.z };
    const d = aim?.dir || f;
    const it = S.interact;
    const reviving = it?.kind === 'revive' && input.held('interact');
    const msg = { t: 'in', q: pred.state.q, mx: round(dx), mz: round(dz), ax: round(hero.x), ay: round(heightAt(hero.x, hero.z) + 1.4), az: round(hero.z), dx: round(d.x), dy: 0, dz: round(d.z),
      b: packButtons({ attack: attack || power, power, block, sprint, sneak: sneakOn, dodge, mount, respawn, interact: reviving }), c: -1, h: channelSlot != null };
    if (pending) { msg.c = pending.slot; if (pending.at) msg.at = pending.at.map(round); msg.h = !!pending.held || channelSlot != null; pending = null; }
    if (reviving) msg.rv = it.id;
    if (S.target) msg.tg = S.target;
    app.net.send(msg);
    if (attack || power) lastAttackAt = performance.now() / 1000;
  }
  const round = v => Math.round(v * 100) / 100;

  // ---------------------------------------------------------------- the frame
  const ndc = new THREE.Vector3();
  function project(x, y, z) {
    ndc.set(x, y, z).project(view.camera);
    if (ndc.z > 1 || ndc.z < -1 || Math.abs(ndc.x) > 1.1 || Math.abs(ndc.y) > 1.1) return null;
    return { x: (ndc.x + 1) / 2 * view.size.w, y: (1 - ndc.y) / 2 * view.size.h };
  }
  let npcTick = 0, slowTick = 0;
  function frame(t) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    input.poll(dt);
    // one-shot presses are taken here (frame rate) and handed to the next step
    if (input.take('menu')) { if (windowsOpen()) closeAll(); else { input.unlock(); app.openWindow('menu', { where: 'play' }); } }
    for (const w of ['bag', 'sheet', 'levelup', 'classes', 'talents', 'spellbook', 'quests', 'map']) if (input.take(w)) { if (findWin(w)) findWin(w).close(); else { input.unlock(); app.openWindow(w); } }
    if (input.take('dodge')) dodgePress = true;
    if (input.take('mount')) mountPress = true;
    if (input.take('power')) powerPress = true;
    if (input.take('target')) pickTarget(false);
    if (input.take('targetNext')) pickTarget(true);
    const ia = findInteract(); S.interact = ia;
    if (input.take('interact') && ia && ia.kind !== 'revive') interact(ia);
    for (let i = 1; i <= 8; i++) {
      const pressed = input.take(`slot${i}`), held = input.held(`slot${i}`);
      if (pressed) slotDown(i - 1, input.device);
      if (S.aimingSlot === i - 1 && !held && placeSlot == null) slotUp(i - 1);
    }
    if (input.held('freeMouse') && input.locked) input.unlock();
    const look = input.takeLook();
    if (look.dx || look.dy) cam.look(look.dx, look.dy, { pad: input.device === 'pad' });
    const wh = input.takeWheel(); if (wh) cam.zoom(wh);
    // fixed steps
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 4) { acc -= STEP; step(); n++; }
    if (acc > STEP) acc = 0;
    pred.decay(dt, app.tuning?.correctionFade || 14);
    // draw: me between the last two steps; others on the server's clock
    const me = meUnit();
    const rt = (clockOff == null ? 0 : performance.now() / 1000 + clockOff) - (app.tuning?.interpDelay ?? 0.1);
    for (const u of S.units.values()) {
      if (u.id === S.meId) {
        const p = pred.drawn(acc / STEP);
        u.x = p.x; u.z = p.z;
      } else if (u.buf.length) {
        let a = u.buf[0], b = u.buf[u.buf.length - 1];
        for (let i = 0; i < u.buf.length - 1; i++) if (u.buf[i].t <= rt && u.buf[i + 1].t >= rt) { a = u.buf[i]; b = u.buf[i + 1]; break; }
        const k = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 1;
        u.x = a.x + (b.x - a.x) * k; u.z = a.z + (b.z - a.z) * k;
        u.facing = lerpAngle(a.f, b.f, k);
      }
      u.y = heightAt(u.x, u.z);
      if (u.lastX != null) { const sp = Math.hypot(u.x - u.lastX, u.z - u.lastZ) / Math.max(dt, 1e-3); u.speed += (sp - u.speed) * Math.min(1, dt * 10); }
      u.lastX = u.x; u.lastZ = u.z;
    }
    // aim (the hero's crosshair) and facings
    if (me) {
      const mx = pred.state.x, mz = pred.state.z;
      aim = cam.aim({ units: aimUnits(), from: { x: mx, z: mz }, range: 80, assistDeg: input.device === 'keys' ? 0 : (app.tuning?.aimAssistDeg ?? 9) });
      if (aimFx) {
        const row = aimFx.row, rng = row.range || 20;
        if (aimFx.kind === 'ground') { let px = aim.point.x, pz = aim.point.z; const dd = Math.hypot(px - mx, pz - mz); if (dd > rng) { px = mx + (px - mx) / dd * rng; pz = mz + (pz - mz) / dd * rng; aim.point = { x: px, y: heightAt(px, pz), z: pz }; } aimFx.h.set({ at: { x: px, z: pz } }); }
        else if (aimFx.kind === 'self') aimFx.h.set({ at: { x: mx, z: mz } });
        else aimFx.h.set({ at: { x: mx, z: mz }, dir: aim.dir });
      }
      app.play.hud.crosshair(aim.unit ? (aim.unit.hostile ? 'foe' : 'friend') : '');
    }
    const nowS = performance.now() / 1000;
    for (const u of S.units.values()) {
      const a = actors.get(u.id); if (!a) continue;
      let face = u.facing;
      if (u.id === S.meId) {
        const moving = u.speed > 0.6;
        const fighting = nowS - lastAttackAt < 1.2 || nowS - lastCastAt < 1.2 || S.aimingSlot != null || input.held('block');
        if (fighting && aim) face = Math.atan2(aim.dir.x, aim.dir.z);
        else if (moving) face = Math.atan2(u.x - (u.prevDrawX ?? u.x), u.z - (u.prevDrawZ ?? u.z)) || u.drawFacing || 0;
        else face = u.drawFacing ?? face;
        u.prevDrawX = u.x; u.prevDrawZ = u.z;
        S.meFacing = face;
      } else if (u.info.k === 'player' || u.info.k === 'pet' || u.info.k === 'monster') {
        if (u.speed > 0.6 && nowS - (u.actedAt || -9) > 1.2) face = Math.atan2(u.x - (u.prevDrawX ?? u.x), u.z - (u.prevDrawZ ?? u.z)) || u.facing;
        u.prevDrawX = u.x; u.prevDrawZ = u.z;
      }
      if (!Number.isFinite(face)) face = u.drawFacing || 0;
      u.drawFacing = lerpAngle(u.drawFacing ?? face, face, Math.min(1, dt * 12));
      a.place(u.x, u.y, u.z, u.drawFacing);
      a.channeling = !!(u.fl & UF.channel);
      if (!!(u.fl & UF.mounted) !== !!a.mounted) actors.setMounted(a, !!(u.fl & UF.mounted));
      if (u.downed && !a.dead) a.act('death'); else if (!u.downed && a.dead && !dying.has(u.id)) a.revive();
      actors.moveClip(a, u.speed);
    }
    // people: drawn while near, facing whoever comes close
    if (me && (npcTick += dt) > 0.5) { npcTick = 0; syncNpcs(); }
    for (const n of S.npcs) { const a = actors.get('npc:' + n.id); if (!a) continue; const y = heightAt(n.x, n.z); let f = n.face ?? 0; const dx = pred.state.x - n.x, dz = pred.state.z - n.z; if (Math.hypot(dx, dz) < 7) f = Math.atan2(dx, dz); n.face = lerpAngle(n.face ?? f, f, Math.min(1, dt * 4)); a.place(n.x, y, n.z, n.face); actors.moveClip(a, 0); }
    // tags: enemies near, damaged ones, the party, people (with ! / ? for quests)
    S.tags = [];
    const tagR = app.tuning?.nameplateMetres || 38;
    for (const u of S.units.values()) {
      if (u.id === S.meId) continue;
      const d = Math.hypot(u.x - pred.state.x, u.z - pred.state.z);
      if (d > tagR && u.info.k !== 'player') continue;
      const cls = u.info.k === 'player' ? 'ally' : u.hostile ? `foe ${u.info.rank || ''}${S.target === u.id ? ' tgt' : ''}` : 'pet';
      S.tags.push({ id: u.id, x: u.x, y: u.y, z: u.z, h: actors.get(u.id)?.height || 1.8, name: u.info.k === 'monster' ? `${u.info.n} · ${u.info.lv}` : u.info.n, cls, hp: u.hostile || u.info.k === 'player' ? u.hp / Math.max(1, u.mh) : null });
    }
    for (const n of S.npcs) if (Math.hypot(n.x - pred.state.x, n.z - pred.state.z) < 22) S.tags.push({ id: 'npc:' + n.id, x: n.x, y: heightAt(n.x, n.z), z: n.z, h: 1.85, name: `${n.mark ? n.mark + ' ' : ''}${n.name}`, cls: `npc${n.mark ? ' quest' : ''}`, hp: null });
    if ((slowTick += dt) > 0.5) {
      slowTick = 0;
      S.liveObjects = liveObjects(book, wsLike());
      const area = T.areaAt(pred.state.x, pred.state.z);
      S.placeName = area?.name || T.map.regions[T.regionAt(pred.state.x, pred.state.z)]?.name || '';
      if (softTarget && performance.now() > softTarget.until) softTarget = null;
    }
    if (S.target && !S.units.has(S.target)) S.target = null;
    if (!S.target && softTarget && S.units.has(softTarget.id)) S.target = softTarget.id;
    S.drawnMe = me ? { x: pred.state.x, z: pred.state.z } : null;
    // camera follows the drawn hero
    if (me) {
      const y = heightAt(me.x, me.z) + ((me.fl & UF.mounted) ? 0.9 : 0);
      cam.update(dt, { x: me.x, y, z: me.z });
      view.follow(me.x, y, me.z);
    }
    actors.update(dt);
    fx.update(dt);
    app.worldView.update(dt, { x: pred.state.x, z: pred.state.z });
    app.play.hud.update(dt, { ...S, meUnit: me, cooldowns: S.cooldowns }, project);
    view.render();
  }
  function syncNpcs() {
    const ws = wsLike();
    const near = [];
    const esc = new Map((app.ws?.esc || []).map(e => [e.npc, e.at]));
    for (const n of Object.values(book.npcs)) {
      if (n.body?.kind === 'object') continue;
      if (!npcPresent(book, ws, n.id)) continue;
      const at = esc.get(n.id) || npcAt(book, ws, n.id);
      if (!at) continue;
      const d = Math.hypot(at[0] - pred.state.x, at[1] - pred.state.z);
      if (d > 70) { if (actors.get('npc:' + n.id)) actors.drop('npc:' + n.id); continue; }
      let mark = '';
      for (const q of Object.values(book.quests)) {
        if (q.turnIn === n.id || q.giver === n.id) {
          const s = questStatus(book, ws, q.id, { playerId: app.me?.char?.id, level: app.me?.char?.level, flags: app.me?.flags || [] });
          if (q.turnIn === n.id && (s === 'ready' || (s === 'done' && !ws.quests[q.id]?.rewarded?.[app.me?.char?.id]))) { mark = '?'; break; }
          if (q.giver === n.id && s === 'available') mark = '!';
        }
      }
      const prev = S.npcs.find(x => x.id === n.id);
      near.push({ id: n.id, name: n.name, x: at[0], z: at[1], quest: !!mark, mark, face: prev?.face });
      actors.npc(n);
    }
    S.npcs = near;
  }
  const lerpAngle = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
  raf = requestAnimationFrame(frame);
  if (!touchy) setTimeout(() => { if (!windowsOpen()) app.toast('Click the world to look around. Esc for the menu.', 'info', 4000); }, 600);

  return {
    view: 'ready',
    close() {
      alive = false; cancelAnimationFrame(raf);
      for (const off of offs) off();
      stopAim();
      for (const id of [...S.units.keys()]) actors.drop(id);
      for (const n of S.npcs) actors.drop('npc:' + n.id);
      app.snapBuf = [];
      app.play.hud.destroy(); app.play.touch?.destroy();
      app.play = null;
      input.unlock();
      canvas.style.visibility = 'hidden';
    },
  };
}
export { BTN };
