// The world: the 3D view of the shared world, your predicted hero, everyone else on the server's clock, the camera
// and the crosshair, spells with their ground indicators, interaction (talk, loot, open, use, shrines, revive), the HUD
// and the windows the server opens. Entered from the world list with the server's 'enter' message.
import { createLagMeter } from '../lagmeter.js';
import * as THREE from 'three';
import { createAmbient } from '../render/ambient.js';
import { createView } from '../render/view.js';
import { makeWorldView } from '../live-edits.js';
import { createZones } from '../render/zones.js';
import { createWeatherView } from '../render/weather.js';
import { createLook } from '../render/look.js';
import { createActors } from '../render/actors.js';
import { createFx } from '../render/fx.js';
import { createCasterFx } from '../render/caster-fx.js';
import { createSpellLook } from '../render/spell-look.js';
import { createSwings } from '../render/swings.js';
import { createMoves } from '../render/moves.js';
import { attackPlan } from '../../rules/casters.js';
import { createCamera } from '../play/camera.js';
import { createPredictor } from '../play/predict.js';
import { createHud } from '../play/hud.js';
import { createTouch } from '../play/touch.js';
import { createVillagers } from '../play/villagers.js';
import { createInput } from '../input/input.js';
import { castRow } from '../../rules/classes.js';
import { targetKind, spellRow } from '../../rules/spells.js';
import { npcAt, npcPresent, liveObjects, questStatus, npcCall } from '../../world/quests.js';
import { STEP, BTN, UF, packButtons } from '../../net/protocol.js';
import { windowsOpen, closeAll, findWin } from '../ui/kit.js';
import { fmt } from '../../../../../shared/format.js';
import { usePlace } from '../place.js';

const WIN_OF = { loot: 'loot', talk: 'talk', shop: 'shop', repair: 'repair', stable: 'stable', trainer: 'trainer', respec: 'respec', travel: 'travel', locked: 'locked' };
const AIMED = new Set(['ground', 'cone', 'line']);

export async function show(app, { enter = null } = {}) {
  if (!enter) { app.go(app.world ? 'worlds' : 'title'); return { close() {} }; }
  await usePlace(app, enter.world?.kind);            // an arena is its own place (js/client/place.js): swap it in before anything reads app.W
  const W = app.W, T = W.terrain, book = W.book, placements = W.data.placements;
  const heightAt = (x, z) => app.ground.y(x, z);
  // ---------------------------------------------------------------- the 3D view (made once per page)
  if (!app.view) {
    app.view = createView(document.getElementById('view'), { quality: app.settings.quality });
    app.worldView = makeWorldView(app);                // (live-edits.js: the dev map editor can swap it for a new one)
    app.actors = createActors(app.view, { rules: app.rules, art: app.art, quality: app.settings.quality, maxTabards: app.settings.quality === 'low' ? 6 : 16 });
    app.fx = await createFx(app.view, { heightAt, quality: app.settings.quality });
    // the weather (render/weather.js): made with the view, before the first frame (its lightning light is made once)
    app.weather = createWeatherView(app.view, { heightAt, T, quality: app.settings.quality, sound: () => (app.settings.sfxOn ? app.sound : null), seed: 7 });
    app.view.afterWeather = () => app.weather.apply();
    // the Look setting (render/look.js; ☰ Settings → Graphics): its colour factors ride on the Look tuning numbers
    app.lookStyle = createLook(app);   // (app.look is the spell look, render/spell-look.js)
    app.lookStyle.applyFx();
    app.view.afterQuality = q => { app.weather?.setQuality(q); app.lookStyle?.applyFx(); };

    // a quest object that is an animal (Chestnut the mare): a real body instead of the world's fallback box
    const mountIds = new Set((app.art.mounts || []).map(m => m.id));
    for (const o of placements.objects || []) {
      if (!mountIds.has(o.art)) continue;
      const box = app.worldView.objectMeshes.get(o.id); if (box) box.visible = false;
      app.actors.standingHorse(o.at[0], o.y ?? heightAt(o.at[0], o.at[1]), o.at[1], o.facing || 0).catch(e => { console.warn('standing horse', e); if (box) box.visible = true; });
    }
  }
  const view = app.view, actors = app.actors, fx = app.fx;
  const IDLES = W.data.towns?.idles || {};                 // townspeople's work routines (data/towns.json)
  const villagers = W.town ? createVillagers({ plan: W.town, actors: app.actors, heightAt, quality: app.settings.quality }) : null;
  view.tuning = app.lookStyle ? app.lookStyle.tuning(app.tuning) : app.tuning;   // the Look numbers (lighting, grade, bloom, mist, clouds) live from the ?tune panel, with the player's Look preset on top
  // ambient life round the camera (motes, leaves, chimney smoke, birds, butterflies) and the ambience bed for where you stand
  // effect zones and region looks from data/edits.json (render/zones.js — the same module the map editor draws with)
  app.zones = createZones(view, { T, edits: W.data.edits, quality: app.settings.quality });
  const ambient = createAmbient(view, { T, trees: app.scattered.trees, chimneys: app.worldView.chimneys || [], quality: app.settings.quality, sound: () => (app.settings.sfxOn ? app.sound : null) });
  // rain and storms bring their own sound bed (render/weather.js numbers; ambient checks it every 2 s)
  ambient.bedOverride = () => { const n = app.weather?.numbers; if (!n || n.rain < 0.15) return null; return n.lightning > 0.5 ? 'ambience.storm' : n.rain > 0.55 ? 'ambience.rain.heavy' : 'ambience.rain.light'; };
  // a wand / tome / staff / sceptre's own attack: how each style looks (data/casters.json look)
  fx.looks = app.rules.data.casters?.look || {};
  const handV = new THREE.Vector3();
  const cfx = createCasterFx(fx, {
    heightAt, looks: fx.looks,
    handOf: id => {
      const a = actors.get(id), bone = a?.body?.bones?.hand_r;
      if (bone && actors.shown?.(id) !== false) { bone.getWorldPosition(handV); return [handV.x, handV.y, handV.z]; }
      const u = S.units.get(id);
      return u ? [u.x, (u.y || heightAt(u.x, u.z)) + 1.3, u.z] : null;
    },
    bodyOf: id => actors.get(id)?.root || null,
  });
  // how every spell and attack looks and moves (render/spell-look.js + render/moves.js; docs/CASE-PALADIN.md recipe)
  const moves = createMoves(actors);
  const rowFor = (spell, who) => { try { return (who === S.meId && castRow(app.rules, app.me.char, spell)) || spellRow(app.rules, spell, { rank: 1 }); } catch { try { return spellRow(app.rules, spell, { rank: 1 }); } catch { return null; } } };
  const handsOf = id => { const b = actors.get(id)?.body?.bones; return b?.hand_l && b?.hand_r && actors.shown?.(id) !== false ? [b.hand_l, b.hand_r] : null; };
  // basic-attack swings: the weapon kind's clip and a trail along its real stroke (render/swings.js, owner report #138)
  const swings = fx.swingData ? createSwings({ fx, actors, moves, data: fx.swingData, unitOf: id => S.units.get(id), meId: () => S.meId }) : null;
  if (swings) actors.swingHook = swings.hook;
  // the kit's materials were compiled before the world's lights and fog were set: compile them again once the world is
  // up, so the first swing or spell of a fight builds no shader (lessons rule 29; swing-shots counts them)
  setTimeout(() => { try { if (alive) fx.kit?.warm?.(); } catch { /* decoration */ } }, 3000);
  const look = createSpellLook({ fx, actors, moves, heightAt, rowOf: rowFor, unitOf: id => S.units.get(id), handsOf, meId: () => S.meId, shakeOn: () => app.settings.shake !== false, swings });
  app.look = look; app.swings = swings;
  /** the hand of whoever stands where a bolt starts (the bolt is drawn from it) */
  const handNear = (x, z) => {
    let best = null, bd = 2.2;
    for (const u of S.units.values()) { const d = Math.hypot(u.x - x, u.z - z); if (d < bd) { bd = d; best = u; } }
    const h = best && handsOf(best.id)?.[1];
    if (!h) return null;
    h.getWorldPosition(handV); return [handV.x, handV.y, handV.z];
  };
  const canvas = view.renderer.domElement;
  canvas.style.visibility = 'visible';
  if (!app.input) {
    app.input = createInput({ canvas, bindings: app.bindings, blocked: () => windowsOpen() > 0 || app.screenName !== 'play' });
    app.input.onDevice = d => { app.device = d; app.emit('device', d); };
  }
  const input = app.input;
  const cam = createCamera(view, { heightAt, tuning: app.tuning || {}, settings: app.settings, solidsNear: (x, z, r) => app.ground.solidsNear(x, z, r) });
  const pred = createPredictor({ ground: app.ground, combat: app.rules.data.combat });

  // ---------------------------------------------------------------- state
  const S = {
    meId: enter.you, units: new Map(), auras: new Map(), target: null, cooldowns: {}, interact: null, tags: [], npcs: [], questMarkers: [],
    drawnMe: null, meFacing: 0, goTo: null, autoRevive: null, placeName: '', downLeft: 0, barrier: 0, aimingSlot: null, lootBoxes: [], zones: new Map(), lastSnap: 0,
  };
  app.world = enter.world;
  app.me = { ...(app.me || {}), char: enter.char };
  let clockOff = null, lastAck = 0;
  let acc = 0, lastT = performance.now(), raf = 0, alive = true;
  let sneakOn = false, aim = null, aimFx = null, windFx = null, placeSlot = null, pending = null, channelSlot = null, mountPress = false, dodgePress = false, powerPress = false, respawnPress = false;
  let lastAttackAt = -9, lastCastAt = -9, softTarget = null, attackWas = false;
  const meUnit = () => S.units.get(S.meId);

  function unitFrom(info) {
    return { id: info.id, info, buf: [], x: 0, y: 0, z: 0, facing: 0, hp: info.mh, mp: 0, st: 0, ba: 0, fl: 0, downed: false, hostile: info.side === 'monsters', lastX: null, lastZ: null, speed: 0, actedAt: -9, height: 1.8, mh: info.mh, mm: info.mm, ms: info.ms };
  }

  // ---------------------------------------------------------------- server messages
  const offs = [];
  // the world clock for the weather (strike times, a change rolling in between world-state messages)
  let wxClock = { t: app.ws?.time ?? 0, at: performance.now() }, wxSent = app.ws?.time ?? null;
  offs.push(app.on('s', m => { if (m.wt0 != null) wxClock = { t: m.wt0, at: performance.now() }; }));
  offs.push(app.on('wstate', m => { wxSent = m.time ?? null; if (m.time != null) wxClock = { t: m.time, at: performance.now() }; }));
  const onSnap = m => {
    const now = performance.now() / 1000;
    const off = m.wt - now;
    clockOff = clockOff == null ? off : Math.max(clockOff + (off - clockOff) * 0.08, Math.min(clockOff, off));
    S.lastSnap = performance.now();
    if (m.sp != null && app.me) app.me.speed = m.sp;        // my walking speed changed (a slow, a buff): predict with it
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
    if (m.pj) fx.bolts(m.pj, spell => elementOf(spell), { handNear, rowOf: spell => rowFor(spell, null) });
    if (m.lb) S.lootBoxes = m.lb.map(([id, x, z, kind, name]) => ({ id, x, z, kind, name }));
    S.downLeft = m.dn?.left ?? S.downLeft;
    S.revive = m.rv || null;
    for (const e of m.ev || []) onEvent(e);
  };
  const dying = new Set();
  const later = (s, f) => (s > 0.01 ? setTimeout(f, s * 1000) : f());
  const elementOf = spell => { try { return spell ? castRow(app.rules, app.me.char, spell)?.element || app.rules.spells?.[spell]?.element : null; } catch { return app.rules.spells?.[spell]?.element || null; } };
  const posOf = id => { const u = S.units.get(id); return u ? [u.x, u.y, u.z] : null; };
  /** Seconds until a server event's moment is drawn (others are drawn interpDelay behind the server's clock). */
  const drawDelay = e => (clockOff == null || e.at == null || Array.isArray(e.at) ? (app.tuning?.interpDelay ?? 0.1) : Math.max(0, Math.min(0.5, e.at - (performance.now() / 1000 + clockOff - (app.tuning?.interpDelay ?? 0.1)))));
  // ---------------------------------------------------------------- monster tells (lessons rule 39: every blow can be seen and dodged)
  // A monster winding up leans back into its swing and a red mark shows where the blow will land (a cone in front of
  // it, a line toward its target for a shot) until it falls; roll out of the mark or through it (a roll is untouchable).
  const tells = new Map();
  function tell(e) {
    const u = S.units.get(e.who); if (!u) return;
    actors.get(e.who)?.windup(e.seconds);
    u.swungAt = u.actedAt = performance.now() / 1000 + e.seconds;       // its 'hit' event will not start a second swing
    endTell(e.who);
    // only a SPECIAL blow shows a mark (owner report #137), and it points where the server will strike: the facing it sent
    if (e.special === false) return;
    const t = S.units.get(e.to);
    const dir = e.facing != null ? { x: Math.sin(e.facing), z: Math.cos(e.facing) } : t ? { x: t.x - u.x, z: t.z - u.z } : { x: Math.sin(u.facing), z: Math.cos(u.facing) };
    const l = Math.hypot(dir.x, dir.z) || 1; dir.x /= l; dir.z /= l;
    const h = e.ranged
      ? fx.indicator('line', { at: { x: u.x, z: u.z }, dir, length: e.reach || 20, width: 1.2, kind: 'hostile' })
      : e.ring ? fx.indicator('circle', { at: { x: e.ring.at[0], z: e.ring.at[1] }, radius: e.ring.radius, kind: 'hostile' })     // a champion's ability placed on the ground: the mark is where it lands
      : fx.indicator('cone', { at: { x: u.x, z: u.z }, dir, length: e.reach || 3, angle: e.arc || 1.9, radius: e.reach || 3, kind: 'hostile' });
    tells.set(e.who, { h, until: performance.now() / 1000 + e.seconds + 0.08, dir, fixed: !!e.ring });
  }
  function endTell(id) { const T = tells.get(id); if (T) { T.h?.stop(); tells.delete(id); } }
  function updateTells() {
    const now = performance.now() / 1000;
    for (const [id, T] of tells) {
      const u = S.units.get(id);
      if (!u || now > T.until) { endTell(id); continue; }
      if (!T.fixed) T.h?.set({ at: { x: u.x, z: u.z }, dir: T.dir });
    }
  }
  function onEvent(e) {
    const me = S.meId;
    swings?.event(e);                    // swing looks: a special blow marked, a plain hit's sparks on the blade's moment
    switch (e.t) {
      case 'hit': {
        const p = posOf(e.to);
        if (p) app.play.hud.number(p[0], p[1], p[2], `${e.crit ? '' : ''}${fmt(e.amount)}${e.crit ? '!' : ''}`, e.to === me ? 'hurt' : e.from === me ? (e.crit ? 'crit' : 'mine') : 'other');
        // a shield took part of it (blocks by itself: js/rules/combat.js blockRoll): a "Blocked" word over the hero
        if (p && e.blocked > 0 && e.to === me) { app.play.hud.number(p[0], p[1] + 0.5, p[2], `Blocked ${fmt(e.blocked)}`, 'block'); app.sfx('status.block.apply'); }
        actors.get(e.to)?.act(e.blocked > 0 && S.units.get(e.to)?.info.k === 'player' ? 'block' : 'hit');
        const from = S.units.get(e.from);
        // every hit lands with weight: pushed back and puffed for a moment (heavier on a crit or a big share of health)
        if (from) actors.get(e.to)?.flinch(from.x, from.z, !!e.crit || e.amount >= (S.units.get(e.to)?.mh || 1e9) * 0.18);
        if (from && !e.spell && !e.vis && performance.now() / 1000 - (from.swungAt || 0) > 0.35) { from.swungAt = performance.now() / 1000; from.actedAt = from.swungAt; actors.get(e.from)?.act('attack'); }
        const lk = look.hit(e) || { scale: 1 };
        if (p && e.spell) { const at = p.map((v, i) => (i === 1 ? v + 1.1 : v)); fx.impact(at, e.spell, e.element, 1.2, lk); fx.noteHit(at, e.spell); }
        else if (p && e.vis) fx.impact(p.map((v, i) => (i === 1 ? v + 1.1 : v)), fx.kit ? fx.kit.visualFor(null, { kind: 'bolt', element: e.element }) : null, e.element, 0.7);   // a magic weapon's hit lands in its element
        if (e.from === me || e.to === me) app.sfx(e.crit ? 'melee.crit' : e.spell || e.vis ? `spell.${e.element === 'ice' ? 'ice' : e.element || 'physical'}.impact` : 'melee.hit');
        if (e.from === me && S.units.get(e.to)?.hostile) softTarget = { id: e.to, until: performance.now() + 6000 };
        break;
      }
      case 'tick': { const p = posOf(e.to); if (p && e.to === me) app.play.hud.number(p[0], p[1], p[2], fmt(e.amount), 'tick'); break; }
      case 'heal': { const p = posOf(e.to); if (p && e.amount > 0) app.play.hud.number(p[0], p[1], p[2], `+${fmt(e.amount)}`, 'heal'); if (e.to === me) app.sfx('heal'); break; }
      case 'barrier': { const p = posOf(e.who); if (p) app.play.hud.number(p[0], p[1], p[2], `+${fmt(e.amount)} shield`, 'heal'); if (e.ward) cfx.ward(e); break; }
      case 'attack': {      // a wand / tome / staff / sceptre's basic attack in its own style (js/rules/caster-attack.js)
        const u = S.units.get(e.who);
        look.attack(e);                  // its own clip: a point-and-fire, a sceptre's swing, a placed style's push down
        cfx.attack(e);
        if (e.who === me && e.shape !== 'bolt' && e.shape !== 'pool' && e.shape !== 'burst') app.sfx(e.shape === 'melee' ? 'melee.swing' : 'cast.start');
        break;
      }
      case 'hop': cfx.hop(e); break;
      case 'rider': if (e.who === me && e.rider === 'siphon' && e.amt > 0) { const p = posOf(e.who); if (p) app.play.hud.number(p[0], p[1], p[2], `+${fmt(e.amt)} mana`, 'heal'); } break;
      // owner report #136 (2026-11-26): "Miss" only when a blow went at someone; a swing at the air just swings
      case 'miss': { const p = posOf(e.to || e.who); if (p && e.to && (e.who === me || e.to === me)) app.play.hud.number(p[0], p[1], p[2], e.dodged ? 'Dodged' : e.evade ? 'Evaded' : 'Miss', 'miss'); if (e.who && !e.to) { const u = S.units.get(e.who); if (u && performance.now() / 1000 - (u.swungAt || 0) > 0.35) { u.swungAt = u.actedAt = performance.now() / 1000; actors.get(e.who)?.act('attack'); } } if (e.who === me) app.sfx('melee.swing'); break; }
      case 'cast': {
        look.cast(e);                    // body, wind-up, release and the spell at its true shape and size
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
      case 'dodge': if (e.who !== me) actors.get(e.who)?.roll(e.seconds || 0.3); break;   // my own roll starts when I press (step)
      // combat motion (js/rules/combat.js knockUnit / startRush / monster wind-ups): drawn on the server's clock
      // (bodies: actors.js; the dust, shockwaves and blasts: render/spell-look.js, on the same clock)
      case 'knock': actors.get(e.who)?.knock(e, drawDelay(e)); later(drawDelay(e), () => look.knock(e)); if (e.down > 0 && posOf(e.who)) app.sfx('melee.crit'); break;
      case 'leap': if (e.who !== me) actors.get(e.who)?.leap({ air: e.air, len: Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]), delay: drawDelay(e) }); later(e.who === me ? 0 : drawDelay(e), () => look.leap(e)); break;
      case 'rush': if (e.who !== me) actors.get(e.who)?.lunge({ seconds: e.seconds, delay: drawDelay(e) }); later(e.who === me ? 0 : drawDelay(e), () => look.rush(e)); break;
      case 'land': later(e.who === me ? 0 : drawDelay(e), () => look.land(e)); if (e.who === me) app.sfx('melee.crit'); break;
      case 'windup': tell(e); break;
      case 'burst': { later(drawDelay(e), () => look.burst(e)); if (e.who === me || Math.hypot((posOf(me)?.[0] ?? 1e9) - e.at[0], (posOf(me)?.[2] ?? 1e9) - e.at[1]) < 25) app.sfx('melee.crit'); break; }   // an exploding ball (the fireball) bursts
      case 'windupEnd': endTell(e.who); break;
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
    if (row.channel) { pending = { slot, held: true }; channelSlot = slot; predictCast(slot); return; }
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
    predictCast(slot);
  }
  /** The key press shows at once (client prediction, CASE-PALADIN §4 phase 0): the body moves and the hands light up
   *  when the spell is ready and paid for; the server's 'cast' then adds the impacts without moving the body again. */
  function predictCast(slot) {
    const spell = slotSpell(slot), me = meUnit(), row = spell && rowOf(spell);
    if (!row || !me || me.downed || (S.cooldowns[spell] || 0) > 0.2 || me.mp < (row.mp || 0)) return;
    lastCastAt = performance.now() / 1000;
    look.press(spell, row);
  }
  function cancelPlace() { placeSlot = null; stopAim(); app.play.touch?.placing(null); }
  function tapAt(x, y) {
    const sx = (x / innerWidth) * 2 - 1, sy = -(y / innerHeight) * 2 + 1;
    const me = meUnit(); if (!me) return;
    const hit = cam.aim({ units: aimUnits(), from: { x: pred.state.x, z: pred.state.z }, screen: { x: sx, y: sy } });
    if (placeSlot != null) { aim = hit; const s = placeSlot; placeSlot = null; stopAim(); app.play.touch?.placing(null); cast(s); return; }
    const thing = pickAtScreen(x, y);
    if (thing) { reach(thing); return; }
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
  /** Everything near you can use, with where it stands on screen-height terms (feet `y`, height `h`) and its reach `r`.
   *  One list for the E / Use prompt, a tap on a phone and a click with a free mouse. */
  function interactables(maxD = 60) {
    const me = pred.state, out = [];
    const R = app.tuning?.interactMetres || LOOT_R;
    const add = (o, x, z) => { const d = Math.hypot(x - me.x, z - me.z); if (d <= maxD) out.push({ ...o, x, z, d, y: heightAt(x, z) }); };
    const D = app.rules.data.combat.death;
    for (const u of S.units.values()) if (u.info.k === 'player' && u.downed && u.id !== S.meId) add({ kind: 'revive', id: u.id, name: u.info.n, r: D.reviveRange + 0.5, bias: -99, h: 0.6, text: `Hold to bring ${u.info.n} back`, progress: S.revive?.id === u.id ? S.revive.held / D.reviveSeconds : null }, u.x, u.z);
    for (const b of S.lootBoxes) add({ kind: 'loot', id: b.id, name: b.name || 'the remains', r: R, bias: -1, h: 0.7, text: b.kind === 'reward' ? `Open ${b.name}` : `Search ${b.name || 'the remains'}` }, b.x, b.z);
    for (const o of app.arenaUi?.spots() || []) add(o, o.x, o.z);       // the arena's bracket board (js/client/arena-ui.js)
    for (const n of S.npcs) add({ kind: 'talk', id: n.id, name: n.name, r: NPC_R, bias: 0, h: 1.85, text: `Talk to ${npcCall(book.npcs[n.id] || n)}` }, n.x, n.z);
    for (const c of placements.chests) add({ kind: 'chest', id: c.id, name: c.name || 'the chest', r: OBJ_R, bias: 0, h: 0.9, text: `Open ${c.name || 'the chest'}` }, c.at[0], c.at[1]);
    for (const o of S.liveObjects || []) { const ob = book.objects[o.object]; if (ob) add({ kind: 'use', id: o.object, name: ob.name, r: OBJ_R + 0.5, bias: -0.5, h: 1.2, text: `${o.kind === 'use' ? 'Use' : 'Search'} ${ob.name}` }, ob.at[0], ob.at[1]); }
    for (const sh of placements.shrines) add({ kind: 'shrine', id: sh.id, name: sh.name, r: SHRINE_R, bias: 0.5, h: 2.6, text: `${sh.name}: travel, change your path` }, sh.at[0], sh.at[1]);
    return out;
  }
  function findInteract() {
    const mu = meUnit();
    if (!mu || mu.downed) return null;
    let best = null;
    for (const o of interactables(12)) {
      if (o.d > o.r) continue;
      if (o.kind === 'revive') return o;                  // a fallen friend first
      if (!best || o.d + o.bias < best.d + best.bias) best = o;
    }
    return best;
  }
  /** The usable thing under a screen point (css px): the one whose upright line (feet → head) passes nearest the point. */
  function pickAtScreen(x, y) {
    let best = null;
    for (const o of interactables(45)) {
      let px = Infinity;
      for (const k of [0.15, 0.5, 0.9]) { const p = project(o.x, o.y + o.h * k, o.z); if (p) px = Math.min(px, Math.hypot(p.x - x, p.y - y)); }
      const near = Math.max(44, 260 / Math.max(2, o.d));   // closer things are bigger on screen
      if (px <= near && (!best || px + o.d * 2 < best.px + best.d * 2)) best = { ...o, px };
    }
    return best;
  }
  /** Use a thing you tapped or clicked: in reach → use it now; further → walk there first (any move input cancels). */
  function reach(o) {
    if (!o || meUnit()?.downed) return;
    if (o.d <= o.r) { useThing(o); return; }
    S.goTo = { kind: o.kind, id: o.id, lastD: o.d, stuck: 0 };
  }
  function useThing(o) {
    if (o.kind === 'revive') { S.autoRevive = o.id; return; }
    interact(o);
  }
  /** One step of walking to a tapped thing: the world direction to it, or null (arrived, stuck, gone or cancelled). */
  function goToStep(manual) {
    const g = S.goTo; if (!g) return null;
    if (manual || meUnit()?.downed) { S.goTo = null; return null; }
    const o = interactables(60).find(t => t.kind === g.kind && t.id === g.id);
    if (!o) { S.goTo = null; return null; }
    if (o.d <= o.r - 0.6) { S.goTo = null; useThing(o); return null; }
    g.stuck = o.d > g.lastD - 0.03 ? g.stuck + STEP : 0; g.lastD = o.d;
    if (g.stuck > 1.2) { S.goTo = null; app.toast(`You can't reach ${o.name} from here.`, 'info'); return null; }
    return { x: (o.x - pred.state.x) / o.d, z: (o.z - pred.state.z) / o.d };
  }
  function interact(it) {
    if (!it) return;
    if (it.kind === 'loot') app.act('loot-open', { id: it.id });
    else if (it.kind === 'talk') app.act('talk', { npc: it.id });
    else if (it.kind === 'chest') app.act('chest', { id: it.id });
    else if (it.kind === 'use') app.act('use', { id: it.id });
    else if (it.kind === 'shrine') { input.unlock(); app.openWindow('shrine', { id: it.id, name: it.name }); }
    else if (it.kind === 'arena') { input.unlock(); app.arenaUi.use(it); }
  }

  // ---------------------------------------------------------------- the HUD
  app.play = {
    S, cam, slotDown, slotUp, cancelPlace, tapAt, ambient, villagers,
    /** Where a world point is on screen (css px) or null — tests and game-eye aim taps with it. */
    screenOf(x, z, h = 1) { return project(x, heightAt(x, z) + h, z); },
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
  // a click with a free mouse (not looking around) on a person, corpse, chest or shrine uses it
  input.onFreeClick = (x, y) => { const t = pickAtScreen(x, y); if (!t) return false; reach(t); return true; };
  const touchy = matchMedia('(pointer: coarse)').matches;
  app.play.touch = touchy ? createTouch(app, input, app.play) : null;
  document.body.classList.toggle('ow-touch', touchy);

  // ---------------------------------------------------------------- the step (20 a second): input → prediction → server
  function step() {
    const me = meUnit(); if (!me) return;
    const ax = input.moveAxis();
    const f = cam.forward(), r = cam.right();
    let dx = r.x * ax.x + f.x * ax.y, dz = r.z * ax.x + f.z * ax.y;
    const manual = Math.hypot(ax.x, ax.y) > 0.1;
    const walk = goToStep(manual);
    if (walk) { dx = walk.x; dz = walk.z; }
    const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
    if (input.take('sneak')) sneakOn = !sneakOn;
    const dodge = dodgePress; dodgePress = false;
    const mount = mountPress; mountPress = false;
    const power = powerPress; powerPress = false;
    const respawn = respawnPress; respawnPress = false;
    const auras = S.auras.get(S.meId) || [];
    const held = auras.some(a => ['root', 'sleep', 'stagger', 'knockdown', 'stasis', 'transmuted'].includes(a.id));
    const attack = (input.held('attack') || input.take('attackTap')) && !S.aimingSlot && placeSlot == null;
    if ((attack || power) && !attackWas && !me.downed) look.pressAttack(attackStyle());     // the first swing starts on the press, not a round trip later
    attackWas = !!(attack || power);
    pred.step({ x: dx, z: dz }, {
      canMove: !me.downed && !held, speed: app.me?.speed || 5, sneak: sneakOn, dodge, stamina: me.st,
      mounted: !!(me.fl & UF.mounted), facingDir: aim?.dir || f,
    }, STEP);
    if (pred.state.dodged) actors.get(S.meId)?.roll(app.rules.data.combat.stamina.dodgeSeconds ?? 0.3);   // my roll, drawn at once
    const hero = { x: pred.state.x, z: pred.state.z };
    const d = aim?.dir || f;
    const it = S.interact;
    if (S.autoRevive && (manual || it?.kind !== 'revive' || it.id !== S.autoRevive)) S.autoRevive = null;
    const reviving = it?.kind === 'revive' && (input.held('interact') || S.autoRevive === it.id);
    const msg = { t: 'in', q: pred.state.q, mx: round(dx), mz: round(dz), ax: round(hero.x), ay: round(heightAt(hero.x, hero.z) + 1.4), az: round(hero.z), dx: round(d.x), dy: 0, dz: round(d.z),
      b: packButtons({ attack: attack || power, power, sneak: sneakOn, dodge, mount, respawn, interact: reviving }), c: -1, h: channelSlot != null };
    if (pending) { msg.c = pending.slot; if (pending.at) msg.at = pending.at.map(round); msg.h = !!pending.held || channelSlot != null; predictRush(pending, msg, me, held); pending = null; }
    else if ((attack || power) && aim && LANDS.has(myPlan()?.shape)) msg.at = landAt().map(round);     // where a lobbed wand / tome / staff attack lands
    if (reviving) msg.rv = it.id;
    if (S.target) msg.tg = S.target;
    app.net.send(msg);
    if (attack || power) lastAttackAt = performance.now() / 1000;
  }
  const round = v => Math.round(v * 100) / 100;
  /** my basic attack's body move: a magic weapon points and fires (a sceptre swings), a bow shoots, the rest swing */
  function attackStyle() {
    const p = myPlan();
    if (p) return p.shape === 'melee' ? 'swing' : LANDS.has(p.shape) || p.shape === 'pool' ? 'ground' : 'wand';
    const w = app.me?.char?.gear?.weapon;
    return /bow|crossbow|sling/.test(`${w?.subtype || ''} ${w?.baseKey || ''} ${w?.weaponCategory || ''}`) ? 'shoot' : 'swing';
  }

  // ---------------------------------------------------------------- leaps and charges, predicted
  // A leap / charge cast in this step moves me along the same steps the server will (js/rules/combat.js startRush,
  // predict.js rush) from the next step on, so the hero flies at once and lands where the server lands it — no snap.
  const rushUntil = {};
  function predictRush(p, msg, me, held) {
    const spell = slotSpell(p.slot); const row = spell && rowOf(spell);
    if (!row || (row.shape !== 'leap' && row.shape !== 'dash') || me.downed || held || pred.busy()) return;
    const now = performance.now() / 1000;
    if ((S.cooldowns?.[spell] || 0) > 0.15 || (rushUntil[spell] || 0) > now || (me.mp ?? 0) < (row.mp || 0)) return;
    const x = pred.state.x, z = pred.state.z;
    let dir = { x: msg.dx, z: msg.dz }, len;
    if (row.shape === 'dash') len = Math.min(row.dash?.range || row.range || 10, row.range || 99);
    else {
      // = combat.js groundPoint: the aimed point, pulled in to the range; no point → 12 m (or less) ahead
      const range = row.range || 12;
      let tx, tz;
      if (msg.at) { tx = msg.at[0]; tz = msg.at[2]; const d = Math.hypot(tx - x, tz - z); if (d > range) { tx = x + (tx - x) / d * range; tz = z + (tz - z) / d * range; } }
      else { const l = Math.hypot(dir.x, dir.z) || 1; tx = x + dir.x / l * Math.min(range, 12); tz = z + dir.z / l * Math.min(range, 12); }
      len = Math.hypot(tx - x, tz - z);
      if (len > 0.05) dir = { x: tx - x, z: tz - z };
    }
    const secs = pred.rush(row.shape, dir, len, STEP);
    rushUntil[spell] = now + Math.max(0.5, (row.cooldown || 1) * 0.5);
    if (row.shape === 'leap') actors.get(S.meId)?.leap({ air: secs, me: true, len });
    else actors.get(S.meId)?.lunge({ seconds: secs, me: true });
  }

  // ---------------------------------------------------------------- the magic weapon's attack (lobs and placed styles)
  const LANDS = new Set(['lob', 'ground']);
  let planKey = '', planNow = null, landFx = null;
  /** My main hand's caster plan (js/rules/casters.js), recomputed when the weapon or off hand changes. */
  function myPlan() {
    const g = app.me?.char?.gear || {};
    const k = `${g.weapon?.id || ''}|${g.offhand?.id || ''}`;
    if (k !== planKey) { planKey = k; try { planNow = attackPlan(app.rules, g, null); } catch { planNow = null; } }
    return planNow;
  }
  /** The crosshair's ground point clamped to the attack's reach (what the server does too). */
  function landAt() {
    const p = myPlan(), mx = pred.state.x, mz = pred.state.z;
    let x = aim.point.x, z = aim.point.z;
    const d = Math.hypot(x - mx, z - mz);
    if (p && d > p.range) { x = mx + (x - mx) / d * p.range; z = mz + (z - mz) / d * p.range; }
    return [x, heightAt(x, z), z];
  }
  /** While attacking with a lobbed or placed style, the ground indicator shows where it will land and how wide. */
  function updateLandFx() {
    const p = myPlan();
    const want = p && LANDS.has(p.shape) && aim && S.aimingSlot == null && !meUnit()?.downed && (input.held('attack') || performance.now() / 1000 - lastAttackAt < 0.6);
    if (!want) { landFx?.stop(); landFx = null; return; }
    if (!landFx) landFx = fx.indicator('circle', { at: { x: 0, z: 0 }, radius: p.radius, kind: 'hostile' });
    const [x, , z] = landAt();
    landFx.set({ at: { x, z }, radius: p.radius });
  }

  // ---------------------------------------------------------------- the frame
  const ndc = new THREE.Vector3();
  function project(x, y, z) {
    ndc.set(x, y, z).project(view.camera);
    if (ndc.z > 1 || ndc.z < -1 || Math.abs(ndc.x) > 1.1 || Math.abs(ndc.y) > 1.1) return null;
    return { x: (ndc.x + 1) / 2 * view.size.w, y: (1 - ndc.y) / 2 * view.size.h };
  }
  let npcTick = 0, slowTick = 0, bodyTick = 0;
  let watchT = 0, watchN = 0, watchSum = 0, slowChecked = !!navigator.webdriver;   // (automated checks run slow on purpose)
  function frame(t) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    lag?.begin(t);
    const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
    input.poll(dt);
    // one-shot presses are taken here (frame rate) and handed to the next step
    if (input.take('menu')) { if (windowsOpen()) closeAll(); else { input.unlock(); app.openWindow('menu', { where: 'play' }); } }
    for (const w of ['bag', 'sheet', 'levelup', 'classes', 'talents', 'spellbook', 'quests', 'trade', 'map']) if (input.take(w)) { if (findWin(w)) findWin(w).close(); else { input.unlock(); app.openWindow(w); } }
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
    const lookIn = input.takeLook();      // (not `look`: that name is the spell-look below — shadowing it broke the frame)
    if (lookIn.dx || lookIn.dy) cam.look(lookIn.dx, lookIn.dy, { pad: input.device === 'pad' });
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
      updateLandFx();
    }
    updateTells();
    const nowS = performance.now() / 1000;
    for (const u of S.units.values()) {
      const a = actors.get(u.id); if (!a) continue;
      let face = u.facing;
      if (u.id === S.meId) {
        const moving = u.speed > 0.6;
        const fighting = nowS - lastAttackAt < 1.2 || nowS - lastCastAt < 1.2 || S.aimingSlot != null;
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
      a.swimming = app.ground.swimming(u.x, u.z);
      // a swimmer: the library swim clips already drop the body (head ≈ 0.5 m above the base), so the base goes UP to
      // just under the surface (the walked height is surface − wadeDepth): head and shoulders out of the water
      const lift = a.swimming ? (a.clip === 'Swim_Fwd_Loop' ? (app.tuning?.swimLiftStroke ?? 0.8) : (app.tuning?.swimLift ?? 0.55)) : 0;   // the stroke lies flatter: a little higher so the back shows
      a.lift = (a.lift ?? lift) + (lift - (a.lift ?? lift)) * Math.min(1, dt * 6);
      a.place(u.x, u.y + a.lift, u.z, u.drawFacing);
      a.channeling = !!(u.fl & UF.channel);
      if (!!(u.fl & UF.mounted) !== !!a.mounted) actors.setMounted(a, !!(u.fl & UF.mounted));
      if (u.downed && !a.dead) a.act('death'); else if (!u.downed && a.dead && !dying.has(u.id)) a.revive();
      actors.moveClip(a, u.speed);
    }
    // people: drawn while near, facing whoever comes close
    if (me && (npcTick += dt) > 0.5) { npcTick = 0; syncNpcs(); }
    if ((bodyTick += dt) > 0.25) { bodyTick = 0; actors.budget(pred.state.x, pred.state.z); }   // nearest people get bodies first
    // townspeople work at their spot (data/towns.json idles: the smith at the anvil, the shopkeeper behind the stall…),
    // turn to a hero who comes close, and talk while their window is open
    for (const n of S.npcs) {
      const a = actors.get('npc:' + n.id); if (!a) continue;
      const def = book.npcs[n.id] || {}, y = heightAt(n.x, n.z);
      const dx = pred.state.x - n.x, dz = pred.state.z - n.z, close = Math.hypot(dx, dz) < 4.5, talking = app.talkingTo === n.id;
      const f = close || talking ? Math.atan2(dx, dz) : (def.face ?? n.face ?? 0);
      n.face = lerpAngle(n.face ?? f, f, Math.min(1, dt * 4));
      a.place(n.x, y, n.z, n.face);
      if (talking) actors.playLoop(a, 'talk');
      else if (close || n.escort || !IDLES[def.idle]) actors.moveClip(a, 0);
      else actors.playLoop(a, routineClip(IDLES[def.idle], nowS + (n.id.length * 7.3) % 11));
    }
    villagers?.update(dt, pred.state);
    // tags: enemies near, damaged ones, the party, people (with ! / ? for quests)
    S.tags = [];
    const tagR = app.tuning?.nameplateMetres || 38;
    for (const u of S.units.values()) {
      if (u.id === S.meId) continue;
      const d = Math.hypot(u.x - pred.state.x, u.z - pred.state.z);
      if (d > tagR && u.info.k !== 'player') continue;
      if (!actors.shown(u.id)) continue;                 // no floating name over a body that is still loading
      const cls = u.info.k === 'player' ? 'ally' : u.hostile ? `${u.info.tp ? 'calm' : 'foe'} ${u.info.rank || ''}${S.target === u.id ? ' tgt' : ''}` : 'pet';   // calm: an animal that will not start a fight
      // a peaceful animal is scenery until you deal with it (owner 2026-11-25, "like wow … neutral, no healthbar"): no
      // tag at all, its name only while targeted, its bar only once it is hurt
      const calm = u.info.tp && u.hostile;
      if (calm && S.target !== u.id && u.hp >= u.mh) continue;
      S.tags.push({ id: u.id, x: u.x, y: u.y, z: u.z, h: actors.get(u.id)?.height || 1.8, name: u.info.k === 'monster' ? (calm ? u.info.n : `${u.info.n} · ${u.info.lv}`) : u.info.ti ? `${u.info.n}, ${u.info.ti}` : u.info.n, cls, hp: calm ? (u.hp < u.mh ? u.hp / Math.max(1, u.mh) : null) : u.hostile || u.info.k === 'player' ? u.hp / Math.max(1, u.mh) : null });
    }
    for (const n of S.npcs) if (Math.hypot(n.x - pred.state.x, n.z - pred.state.z) < 22 && actors.shown('npc:' + n.id)) S.tags.push({ id: 'npc:' + n.id, x: n.x, y: heightAt(n.x, n.z), z: n.z, h: 1.85, name: `${n.mark ? n.mark + ' ' : ''}${n.name}`, cls: `npc${n.mark ? ' quest' : ''}`, hp: null });
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
    // a hit-stop holds the world (bodies, spells) for a few hundredths of a second on your own big hits
    const wdt = look.update(dt);
    actors.update(wdt);
    moves.update(wdt);
    if (fx.kit) { fx.kit.shakeOn = app.settings.shake !== false; view.shakeOffset = fx.kit.shakeOffset; }
    fx.update(wdt);
    app.worldView.update(dt, { x: pred.state.x, z: pred.state.z });
    // the weather here (the server's, per region) before the ambience, so its rain bed wins over the place's
    const wxN = app.weather.update(dt, { wire: app.ws?.wx || null, seed: app.ws?.wxs ?? 1, time: wxClock.t + (performance.now() - wxClock.at) / 1000, sentAt: wxSent, at: { x: pred.state.x, z: pred.state.z } });
    ambient.wet = wxN.rain;
    ambient.update(dt, { x: pred.state.x, z: pred.state.z });
    app.zones?.update(dt, { x: pred.state.x, z: pred.state.z });
    // an automatic graphics pick that runs slow steps down once (from 8 s in, over 6 s: under ~24 frames a second)
    if (app.settings.qualityAuto !== false && !slowChecked && app.settings.quality !== 'low') {
      watchT += dt;
      if (watchT > 8) { watchN++; watchSum += dt; }
      if (watchT > 14) {
        slowChecked = true;
        if (watchSum / Math.max(1, watchN) > 1 / 24) {
          const next = app.settings.quality === 'high' ? 'medium' : 'low';
          app.settings.quality = next; app.saveSettings(); view.setQuality(next);
          app.toast(`Graphics set to ${next === 'medium' ? 'Medium' : 'Low'} for smoother play. Change it in Settings.`, 'info', 5000);
        }
      }
    }
    app.play.hud.update(dt, { ...S, meUnit: me, cooldowns: S.cooldowns }, project);
    lag?.mid();
    view.render();
    lag?.end();
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
      near.push({ id: n.id, name: n.name, x: at[0], z: at[1], quest: !!mark, mark, face: prev?.face, escort: esc.has(n.id) });
      actors.npc(n);
    }
    S.npcs = near;
  }
  /** The clip a work routine ([clip, min s, max s]…, looping) plays at time t: each step lasts the middle of its range. */
  function routineClip(steps, t) {
    const total = steps.reduce((s, [, lo, hi]) => s + (lo + hi) / 2, 0);
    let x = t % total;
    for (const [clip, lo, hi] of steps) { if ((x -= (lo + hi) / 2) < 0) return clip; }
    return steps[0][0];
  }
  const lerpAngle = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
  // the lag recorder (owner 2026-11-26: stalls on desktop) — ☰ → Send a lag report; every bug report carries its summary
  const lag = app.lag = createLagMeter({ ...app, play: { me: () => pred?.state ?? null } }, view);
  if (/[?&]camera\b/.test(location.search)) setTimeout(() => app.cameraTuner?.open(), 800);   // ?camera opens the camera tuner
  raf = requestAnimationFrame(frame);
  if (!touchy) setTimeout(() => { if (!windowsOpen()) app.toast('Click the world to look around. Esc for the menu.', 'info', 4000); }, 600);

  return {
    view: 'ready',
    close() {
      alive = false; cancelAnimationFrame(raf); lag?.stop();
      for (const off of offs) off();
      stopAim();
      landFx?.stop(); landFx = null;
      ambient.dispose();
      app.zones?.dispose(); app.zones = null;
      for (const id of [...S.units.keys()]) actors.drop(id);
      for (const n of S.npcs) actors.drop('npc:' + n.id);
      villagers?.dispose();
      app.snapBuf = [];
      app.play.hud.destroy(); app.play.touch?.destroy();
      app.play = null;
      input.onFreeClick = null;
      input.unlock();
      canvas.style.visibility = 'hidden';
    },
  };
}
export { BTN };
