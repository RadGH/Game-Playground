// Everyone in the world, drawn: heroes and people as Tabard characters (avatar-3d/tabard — their worn gear painted and
// attached, their face and hair from the look), monsters, companions and summons as fal bodies (avatar-3d/fal; a
// "placeholder" monster in data/art.json is its fallback body at its own height, tinted), druid shapes as the real
// animal's body, the horse under a mounted rider (the stand-in horse body, rider on its seat).
//
//   const A = createActors(view, { rules, art, T, ground, quality })
//   A.unit(id, info)  → actor (made the first time; info = the server's unit info)   A.drop(id, { die })
//   actor.place(x, y, z, facing, dt, speed)   actor.act('attack'|'cast'|'hit'|'block'|'death'|'channel')   A.update(dt)
//   combat feel (motion.js-style poses laid over the clips; see "combat motion" below): actor.knock(e, delay) thrown in
//   an arc, flat on the ground, up again · actor.leap({ air, len, delay }) jump arc · actor.lunge({ seconds }) a charge
//   lean · actor.flinch(fromX, fromZ, heavy) push + puff on every hit · actor.roll(seconds) the dodge roll ·
//   actor.windup(seconds) a monster's tell (leans back, then strikes)
//   A.npc(npc) — a person from data/npcs.json (drawn while near)
// Bodies load in the background; until then a simple 3D figure of the right size stands in (no 2D anything).
import * as THREE from 'three';
import { createTabard } from '../../../../../avatar-3d/tabard/js/tabard.js';
import { createFalCharacter } from '../../../../../avatar-3d/fal/js/fal.js';
import { createCritter } from './critters.js';
import { tabardItems } from '../../game/gear.js';
import { FACE_OPTIONS } from '../../../../../avatar-3d/tabard/js/face.js';

const HAIRS = ['short', 'side_part', 'bangs', 'bob', 'long', 'wavy', 'ponytail', 'bun', 'braids', 'spiky', 'curly', 'afro', 'mohawk', 'undercut', 'topknot', 'high_ponytail', 'twin_tails', 'messy', 'locs', 'long_braid', 'wolf_cut', 'curly_bob', 'warrior_braids', 'buzz', 'bald'];
const HAIR_COLOURS = ['#2a1d14', '#3b2618', '#5a3a22', '#7a4f2a', '#a8733c', '#d2a35c', '#e8d29a', '#9a3a22', '#c8c3ba', '#6a6a72'];
const hashStr = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** A body, an art row and a size for any monster / companion / summon art id (data/art.json). */
export function bodyFor(art, id) {
  if (!id) return null;
  const cr = art.critters?.[id];                     // a Quaternius animal (data/critters.json)
  if (cr) return { body: id, critter: cr, height: cr.height, tint: null };
  for (const r of Object.values(art.regions || {})) for (const list of Object.values(r.enemies || {})) for (const e of list) {
    if (e.id !== id) continue;
    if (e.status === 'ready') return { body: e.id, height: e.height || 1.8, tint: null };
    if (e.fallback) return { body: e.fallback.body, height: e.fallback.height || 1.8, tint: e.fallback.tint || null };
  }
  const s = (art.summons || []).find(x => x.id === id);
  if (s) return s.body ? { body: s.body, height: s.height || 1, tint: null } : s.fallback ? { body: s.fallback.body, height: s.fallback.height, tint: s.fallback.tint, opacity: s.fallback.opacity } : { shape: s.placeholder };
  return { body: id, height: 1.8, tint: null };
}
const FORM_BODY = { wolf: { body: 'wolf', height: 1.1 }, bear: { body: 'brown-bear', height: 1.35 }, cat: { body: 'mountain-lion', height: 0.85 }, 'brown-bear': { body: 'brown-bear', height: 1.35 }, 'mountain-lion': { body: 'mountain-lion', height: 0.85 } };

/** NPC outfit → Tabard items (data/npcs.json body.outfit). */
const OUTFIT = {
  robe: ['robe_mossgrove', 'wraps_mossgrove', 'leggings_mossgrove', 'sandals_mossgrove'],
  cloth: ['tunic_wanderer', 'leggings_wanderer', 'shoes_wanderer'],
  leather: ['jerkin_trail', 'gloves_trail', 'trousers_trail', 'boots_trail'],
  mail: ['hauberk_ironlink', 'mitts_ironlink', 'chausses_ironlink', 'boots_ironlink', 'sword_arming'],
  plate: ['cuirass_bulwark', 'gauntlets_bulwark', 'legplates_bulwark', 'sabatons_bulwark', 'pauldrons_bulwark', 'sword_arming', 'shield_heater'],
};
/** A look for a person nobody designed: picked from the creator's own options by their id (same person, same face). */
export function npcLook(npc) {
  const h = hashStr(npc.id || npc.name);
  const pick = (list, s) => list[(h >>> s) % list.length];
  const female = npc.body?.sex === 'female';
  const old = npc.body?.age === 'old';
  return {
    body: female ? 'female' : 'male',
    skin: { color: pick(FACE_OPTIONS.skin, 2)[0] },
    hair: { id: pick(female ? ['long', 'bun', 'braids', 'ponytail', 'wavy', 'bob', 'curly', 'long_braid'] : ['short', 'side_part', 'messy', 'buzz', 'undercut', 'curly', 'wolf_cut', 'bald'], 5), color: old ? '#c8c3ba' : pick(HAIR_COLOURS, 9) },
    eyes: { id: pick(FACE_OPTIONS.eyes, 11)[0], color: pick(FACE_OPTIONS.eyeColor, 13)[0] },
    brows: { id: pick(FACE_OPTIONS.brows, 15)[0] },
    extras: { id: (h >>> 17) % 4 === 0 ? pick(FACE_OPTIONS.extras, 19)[0] : 'none' },
    facialHair: { id: female ? 'none' : pick(FACE_OPTIONS.facialHair, 21)[0] },
  };
}

// a stand-in figure while a body loads (or when too many Tabards are on screen for this device)
const standinMat = new Map();
function standin(height = 1.8, colour = '#8a7a64') {
  if (!standinMat.has(colour)) standinMat.set(colour, new THREE.MeshLambertMaterial({ color: colour }));
  const g = new THREE.Group();
  const m = standinMat.get(colour);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(height * 0.16, height * 0.45, 3, 8), m); body.position.y = height * 0.42; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(height * 0.11, 10, 8), m); head.position.y = height * 0.86; head.castShadow = true; g.add(head);
  g.userData.standin = true;
  return g;
}

export function createActors(view, { rules, art, quality = 'medium', maxTabards = 16 }) {
  const scene = view.scene;
  const actors = new Map();
  const falCache = new Map();         // body -> native height (measured once)
  const statics = [];                 // standing animals (quest objects): drawn and animated, not units
  let tabardsLive = 0, loading = 0;
  const queue = [];
  const pump = () => { while (loading < 3 && queue.length) { const job = queue.shift(); loading++; job().finally(() => { loading--; pump(); }); } };
  const later = job => { queue.push(job); pump(); };

  async function falBody(spec) {
    const c = spec.critter ? await createCritter(spec.critter) : await createFalCharacter(spec.body);
    if (!falCache.has(spec.body)) {
      c.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(c.group);
      falCache.set(spec.body, Math.max(0.2, box.max.y - box.min.y));
    }
    const k = (spec.height || 1.8) / falCache.get(spec.body);
    c.group.scale.setScalar(k);
    if (spec.critter?.lift) c.group.children[0].position.y = spec.critter.lift / k;   // a bat flies (after the size is measured)
    if (spec.tint || spec.opacity) {
      const tint = spec.tint ? new THREE.Color(spec.tint) : null;
      c.group.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); if (tint) o.material.color.lerp(tint, 0.55); if (spec.opacity) { o.material.transparent = true; o.material.opacity = spec.opacity; } } });
    }
    return c;
  }

  function makeActor(id, info, { npc = null, me = false } = {}) {
    const root = new THREE.Group(); root.name = 'actor ' + id;
    scene.add(root);
    const a = {
      id, info, root, body: null, kind: info.k, height: 1.8, standin: null, clip: null, once: null, onceUntil: 0, dead: false, fade: 0,
      mountBody: null, formBody: null, formKey: null, speed: 0, lookKey: null, gearKey: null, npc,
      place(x, y, z, facing) { root.position.set(x, y, z); root.rotation.y = facing; combatPose(a, x, y, z, facing); },
      knock(e, delay = 0) { startKnock(a, e, delay); },
      leap(o) { startLeap(a, o); },
      lunge(o) { startLunge(a, o); },
      flinch(fromX, fromZ, heavy = false) { startFlinch(a, fromX, fromZ, heavy); },
      roll(seconds) { startRoll(a, seconds); },
      windup(seconds) { startWindup(a, seconds); },
      act(kind) {
        const b = a.formBody || a.body;
        if (!b) return;
        const map = { attack: 'attack', cast: 'cast', hit: 'hit', death: 'death', channel: 'channel', dodge: 'roll', block: 'ready' };   // a shield block: a snap into guard
        const clip = map[kind] || kind;
        if (kind === 'death') { a.dead = true; a.once = 'death'; b.play('death', 0.15); a.clip = 'death'; a.motion = null; return; }
        if (a.dead) return;
        if (kind === 'dodge') { startRoll(a, a.rollSeconds || 0.3); return; }   // the roll: its clip sped up to the real roll time
        if (a.motion?.knock && kind === 'hit') return;                           // thrown / lying: no flinch clip over it
        if ((kind === 'hit' || kind === 'block') && a.once && performance.now() < a.onceUntil) return;   // a hit never cuts off a swing
        b.play(clip, 0.12); a.clip = clip; a.once = clip; a.onceUntil = performance.now() + (kind === 'hit' || kind === 'block' ? 350 : 650);
      },
      revive() { a.dead = false; a.once = null; a.clip = null; },
      dispose() { scene.remove(root); if (a.body?.isTabard) { tabardsLive--; a.body.dispose?.(); } },
    };
    a.isMe = me; a.bornAt = performance.now();
    // a person (hero or townsfolk) is never a grey stand-in: they are simply not drawn until their own body is ready,
    // and the nearest ones get bodies first (budget). A monster gets a stand-in only if its model is slow (> 2 s), so
    // nothing you fight is ever invisible.
    if (!(info.k === 'player' || npc)) { a.standin = standin(info.k === 'monster' ? 1.6 : 1.8, '#7a5a4a'); a.standin.visible = false; root.add(a.standin); }
    actors.set(id, a);
    loadBody(a);
    return a;
  }

  function loadBody(a) {
    const info = a.info;
    if (info.k === 'player' || a.npc) {
      if (a.isMe) giveTabard(a);                             // everyone else waits for budget() — nearest first
      return;
    }
    const spec = bodyFor(art, info.art || info.def);
    if (!spec?.body) return;
    a.height = spec.height || 1.8;
    later(async () => {
      try {
        const c = await falBody(spec);
        if (!actors.has(a.id)) return;
        a.body = c;
        if (a.standin) { a.root.remove(a.standin); a.standin = null; }
        a.root.add(c.group);
        if (a.dead) c.play('death', 0);
      } catch (e) { console.warn('fal body', info.art, e); }
    });
  }

  /** A person's Tabard body (looks + worn gear). Called for me at once, for everyone else by budget(). */
  function giveTabard(a) {
    if (a.body || a.tabardPending) return;
    const info = a.info;
    a.tabardPending = true;
    const look = a.npc ? npcLook(a.npc) : (info.look || { body: 'male' });
    const items = a.npc ? (OUTFIT[a.npc.body?.outfit] || OUTFIT.cloth) : tabardItems(rules, { gear: pseudoGear(info.gear) });
    a.lookKey = JSON.stringify(look); a.gearKey = JSON.stringify(items);
    later(async () => {
      try {
        const t = await createTabard({ body: look.body === 'female' ? 'female' : 'male', items, look, clip: 'idle' });
        t.isTabard = true;
        if (!actors.has(a.id) || !a.tabardPending) { t.dispose?.(); return; }   // gone, or handed back while it loaded
        tabardsLive++;
        a.body = t; a.height = 1.8; a.clip = null;
        t.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
        a.root.add(t.group);
        if (a.formBody) t.group.visible = false;
        if (a.mounted && a.mountSeat) setMounted(a, true);
      } catch (e) { console.warn('tabard body', e); }
      finally { a.tabardPending = false; }
    });
  }
  /** Hand a far townsperson's body back so a nearer one can have it. */
  function takeTabard(a) {
    a.tabardPending = false;
    if (!a.body?.isTabard) return;
    a.root.remove(a.body.group); a.body.dispose?.(); a.body = null; tabardsLive--;
  }
  /**
   * Bodies by distance: the nearest `maxTabards` people (me always first) get a Tabard; a townsperson who falls well
   * outside that list (4 places of slack, so walking about doesn't swap bodies back and forth) gives theirs back.
   * Other heroes keep theirs once they have one (≤ 10 per world).
   */
  function budget(x, z) {
    const people = [];
    // (villagers give way: a townsperson or hero 18 m further off still gets a body before a passing villager)
    for (const a of actors.values()) if (a.info.k === 'player' || a.npc) people.push({ a, d: a.isMe ? -1 : Math.hypot(a.root.position.x - x, a.root.position.z - z) + (a.villager || a.npc?.villager ? 18 : 0) });
    people.sort((p, q) => p.d - q.d);
    people.forEach(({ a }, i) => {
      if (i < maxTabards) giveTabard(a);
      else if (i >= maxTabards + 4 && a.npc) takeTabard(a);
    });
  }

  /** The server sends gear as { slot: { b, s, c, sh, two } } — enough for the worn look. */
  function pseudoGear(g = {}) {
    const out = {};
    for (const [slot, x] of Object.entries(g || {})) out[slot] = { baseKey: x.b, subtype: x.s, twoHanded: !!x.two, weaponCategory: x.c || null, isShield: !!x.sh, type: slot === 'weapon' ? 'weapon' : 'armor' };
    return out;
  }

  /** The look, gear, druid shape or horse changed: rebuild what needs it. */
  function refresh(a, info) {
    const old = a.info; a.info = info;
    if (info.k !== 'player') return;
    const items = tabardItems(rules, { gear: pseudoGear(info.gear) });
    const gk = JSON.stringify(items), lk = JSON.stringify(info.look || null);
    if (a.body?.isTabard && gk !== a.gearKey) {
      a.gearKey = gk;
      const want = new Set(items);
      const D = a.body.worn;
      for (const [slot, id] of Object.entries(D)) if (!want.has(id) && slot !== 'hair') a.body.equip(slot, null);
      // equip by the Tabard slot each item names
      import('../../../../../avatar-3d/tabard/js/tabard.js').then(async T => { const data = await T.loadTabardData(); for (const id of items) { const it = data.items.items[id]; if (it && a.body.worn[it.slot] !== id) a.body.equip(it.slot, id); } });
    }
    if (a.body?.isTabard && lk !== a.lookKey && info.look) { a.lookKey = lk; a.body.setLook(info.look); }
    // druid shape: the animal's own body
    const fk = info.body || null;
    if (fk !== a.formKey) {
      a.formKey = fk;
      if (a.formBody) { a.root.remove(a.formBody.group); a.formBody = null; }
      if (a.body?.group) a.body.group.visible = !fk;
      if (fk) {
        const spec = FORM_BODY[fk] || bodyFor(art, fk);
        later(async () => { try { const c = await falBody(spec); if (a.formKey !== fk || !actors.has(a.id)) return; a.formBody = c; a.root.add(c.group); if (a.body?.group) a.body.group.visible = false; } catch (e) { console.warn('form body', fk, e); } });
      }
    }
    if (!!old?.horse !== !!info.horse) a.mountWanted = null;
  }

  function setMounted(a, on) {
    if (on && !a.mountBody && !a.mountLoading) {
      a.mountLoading = true;
      const m = (art.mounts || [])[0] || {};
      const spec = m.status === 'ready' ? { body: m.id, height: m.height || 1.75 } : { body: m.fallback?.body || 'wolf', height: m.fallback?.height || 1.75, tint: m.fallback?.tint || '#8a4a22' };
      later(async () => { try { const c = await falBody(spec); a.mountLoading = false; if (!actors.has(a.id)) return; a.mountBody = c; a.mountSeat = m.mount?.seat || m.fallback?.seat || [0, 0.875, 0.5]; a.root.add(c.group); c.group.visible = !!a.mounted; } catch (e) { a.mountLoading = false; console.warn('horse', e); } });
    }
    a.mounted = on;
    if (a.mountBody) a.mountBody.group.visible = on;
    const rider = a.body?.group;
    if (rider) { rider.position.set(on ? a.mountSeat?.[0] || 0 : 0, on ? (a.mountSeat?.[1] || 0.875) * 0.98 : 0, on ? (a.mountSeat?.[2] || 0.5) * 0.4 : 0); }
  }

  /** Pick the moving clip from how fast the DRAWN body moves. */
  function moveClip(a, speed) {
    if (a.dead) return;
    const b = a.formBody || a.body;
    if (!b) return;
    // a swing or a cast while walking gives the legs back after 0.3 s (no gliding with the legs still: owner 2026-11-26
    // "attack while moving, no sticking in place")
    if (a.once && performance.now() < a.onceUntil && !(speed > 1.5 && (a.once === 'attack' || a.once === 'cast') && performance.now() > a.onceUntil - 350)) return;
    if (a.motion?.knock || a.motion?.leap) return;                  // thrown, lying, getting up or in the air: no walk clip
    a.once = null;
    let want = speed < 0.35 ? 'idle' : speed < 3.6 ? 'walk' : speed < 7.2 ? 'run' : 'sprint';
    if (a.channeling) want = 'channel';
    if (a.mounted && a.body?.isTabard && !a.formBody) {
      want = 'sit';
      const h = a.mountBody; if (h) { const hw = speed < 0.35 ? 'idle' : speed < 5 ? 'walk' : 'run'; if (h.clip !== hw) h.play(hw, 0.2); }
    }
    if (want === 'sprint' && !b.isTabard) want = 'run';
    if (a.swimming && b.isTabard && !a.formBody) want = speed < 0.35 ? 'Swim_Idle_Loop' : 'Swim_Fwd_Loop';   // the animation library's own swim clips
    if (a.clip !== want) { b.play(want, 0.22); a.clip = want; }
  }

  /** Hold a looping clip (a townsperson's work routine, a villager chatting at a stall); one-shot reactions still win. */
  function playLoop(a, clip) {
    if (a.dead) return;
    const b = a.formBody || a.body;
    if (!b || (a.once && performance.now() < a.onceUntil)) return;
    a.once = null;
    if (a.clip !== clip) { b.play(clip, 0.3); a.clip = clip; }
  }

  return {
    actors,
    playLoop,
    get(id) { return actors.get(id) || null; },
    unit(id, info, opts = {}) {
      let a = actors.get(id);
      if (!a) a = makeActor(id, info, opts);
      else if (info !== a.info) refresh(a, info);
      return a;
    },
    npc(npc) {
      const id = 'npc:' + npc.id;
      return actors.get(id) || makeActor(id, { k: 'npc', n: npc.name }, { npc });
    },
    drop(id, { corpse = false } = {}) {
      const a = actors.get(id);
      if (!a) return;
      if (corpse) { a.act('death'); a.fade = 4; a.corpse = true; actors.delete(id); corpses.push(a); return; }
      actors.delete(id);
      a.dispose();
    },
    setMounted,
    moveClip,
    budget,
    /**
     * A standing animal for a quest object whose art is the horse (Chestnut the mare): the mount's own body — the
     * real horse once its model is ready, until then the same stand-in the riders use — idling where it was placed.
     */
    async standingHorse(x, y, z, facing = 0) {
      const m = (art.mounts || [])[0] || {};
      const spec = m.status === 'ready' ? { body: m.id, height: m.height || 1.75 } : { body: m.fallback?.body || 'wolf', height: m.fallback?.height || 1.75, tint: m.fallback?.tint || '#8a4a22' };
      const c = await falBody(spec);
      c.group.position.set(x, y, z); c.group.rotation.y = facing;
      c.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(c.group); c.play?.('idle', 0);
      statics.push(c);
      return c;
    },
    /** Has this actor a body on screen (a person waiting for theirs is not drawn, and neither is their name tag)? */
    shown: id => { const a = actors.get(id); return !!(a && (a.body || a.formBody || a.standin?.visible)); },
    update(dt) {
      for (const c of statics) c.update?.(dt);
      const now = performance.now();
      for (const a of actors.values()) {
        (a.formBody || null)?.update(dt); a.body?.update(dt); if (a.mounted) a.mountBody?.update(dt);
        if (a.standin && !a.standin.visible && now - a.bornAt > 2000) a.standin.visible = true;   // a slow monster model
      }
      for (let i = corpses.length - 1; i >= 0; i--) {
        const a = corpses[i];
        a.body?.update(dt);
        a.fade -= dt;
        if (a.fade < 1) a.root.position.y -= dt * 0.6;              // sinks away after the fall
        if (a.fade <= 0) { a.dispose(); corpses.splice(i, 1); }
      }
    },
    stats: () => ({ actors: actors.size, tabards: tabardsLive, loading, queued: queue.length }),
  };
}
const corpses = [];

// ---------------------------------------------------------------- combat motion (2026-11-26, owner: "I want things to get
// blown apart by fireball explosions and smack things in a circle knocking down enemies around me")
// Poses laid over whatever clip plays, on the actor's root, every frame in place(): a THROW (an arc away from the blow,
// the whole body tipping flat — fal / Meshy monster rigs have no knockdown clip — lying there, then rising), a LEAP arc,
// a charge LUNGE, a hit FLINCH (pushed 0.28 m and puffed 12% for a moment: CASE-PALADIN target reaction), the dodge
// ROLL (Tabard's Roll clip sped up to the real roll time), and a monster's WIND-UP tell (leans back, then snaps in).
// Times are performance.now() seconds; a remote unit's arc starts `delay` later (it is drawn on the server's clock).
const nowS = () => performance.now() / 1000;
const ease = k => k * k * (3 - 2 * k);
const FLAT = 85 * Math.PI / 180;

function startKnock(a, e, delay = 0) {
  if (a.dead) return;
  const dx = e.to[0] - e.from[0], dz = e.to[1] - e.from[1], push = Math.hypot(dx, dz);
  const dir = push > 0.01 ? Math.atan2(dx, dz) : a.root.rotation.y + Math.PI;     // no push: falls backward
  a.motion = a.motion || {};
  a.motion.knock = { t0: nowS() + delay, air: Math.max(0.12, e.air || 0), down: e.down || 0, up: e.up || 0, dir, facing: a.root.rotation.y, h: Math.min(1.5, 0.3 + push * 0.16), flat: (e.down || 0) > 0 };
  const b = a.formBody || a.body;
  if (b && !a.dead) { b.play('hit', 0.08); a.clip = 'hit'; }
}
function startLeap(a, { air = 0.45, len = 6, delay = 0 } = {}) {
  a.motion = a.motion || {};
  a.motion.leap = { t0: nowS() + delay, air, h: Math.min(2.8, 0.9 + len * 0.14) };
  const b = a.formBody || a.body;
  if (b?.isTabard) { b.play('Jump_Start', 0.08); speedClip(b, 'Jump_Start', 1.38 / Math.max(0.2, air)); a.clip = 'Jump_Start'; a.once = 'leap'; a.onceUntil = performance.now() + (air + delay) * 1000; }
}
function startLunge(a, { seconds = 0.3, delay = 0 } = {}) {
  a.motion = a.motion || {};
  a.motion.lunge = { t0: nowS() + delay, s: seconds };
  const b = a.formBody || a.body;
  if (b) { b.play(b.isTabard ? 'sprint' : 'run', 0.08); a.clip = 'lunge'; a.once = 'lunge'; a.onceUntil = performance.now() + (seconds + delay) * 1000; }
}
function startFlinch(a, fromX, fromZ, heavy) {
  if (a.dead) return;
  const dx = a.root.position.x - fromX, dz = a.root.position.z - fromZ, l = Math.hypot(dx, dz) || 1;
  a.motion = a.motion || {};
  a.motion.flinch = { t0: nowS(), x: dx / l, z: dz / l, m: heavy ? 0.45 : 0.28, puff: heavy ? 0.16 : 0.12 };
}
function startRoll(a, seconds = 0.3) {
  const b = a.formBody || a.body;
  a.motion = a.motion || {};
  a.motion.roll = { t0: nowS(), s: seconds };
  if (!b) return;
  if (b.isTabard) { b.play('roll', 0.06); speedClip(b, 'Roll', 1.5 / Math.max(0.2, seconds + 0.2)); }
  a.clip = 'roll'; a.once = 'roll'; a.onceUntil = performance.now() + (seconds + 0.2) * 1000;
}
function startWindup(a, seconds) {
  if (a.dead) return;
  const b = a.formBody || a.body;
  a.motion = a.motion || {};
  a.motion.windup = { t0: nowS(), s: Math.max(0.2, seconds) };
  // the swing clip starts with the tell, so its blow falls as the tell ends
  if (b) { b.play('attack', 0.1); a.clip = 'attack'; a.once = 'attack'; a.onceUntil = performance.now() + (seconds + 0.35) * 1000; }
}
/** Speed up a Tabard clip that just started (the library's roll / jump are 1.4-1.5 s; ours last 0.3-0.45 s). */
function speedClip(b, name, k) {
  try { const act = b._mixer?._actions?.find(x => x.getClip().name === name); if (act) act.setEffectiveTimeScale(Math.max(0.5, Math.min(6, k))); } catch { /* a body without a mixer */ }
}

/** Lay the current combat poses over the placed root (called from actor.place every frame). */
function combatPose(a, x, y, z, facing) {
  const M = a.motion;
  const root = a.root;
  root.rotation.x = 0; root.rotation.z = 0;
  if (root.scale.x !== a.baseScale) root.scale.setScalar(a.baseScale ?? 1);
  if (!M) return;
  const t = nowS();
  let lift = 0, tilt = 0, tiltDir = 0, px = 0, pz = 0, puff = 1;
  const k = M.knock;
  if (k) {
    const e = t - k.t0;
    if (e < 0) { /* waiting for the drawn body to reach the blow */ }
    else if (e < k.air) {
      const q = e / k.air;
      lift = 4 * k.h * q * (1 - q);
      tilt = (k.flat ? FLAT : 0.45) * Math.min(1, q * 1.3); tiltDir = k.dir;
    } else if (k.flat && e < k.air + k.down) { tilt = FLAT; tiltDir = k.dir; lift = 0.05; }
    else if (k.flat && e < k.air + k.down + k.up) {
      const q = (e - k.air - k.down) / Math.max(0.05, k.up);
      tilt = FLAT * (1 - ease(q)); tiltDir = k.dir;
    } else if (!k.flat && e < k.air + 0.2) { tilt = 0.45 * (1 - (e - k.air) / 0.2); tiltDir = k.dir; }
    else M.knock = null;
    if (M.knock && e >= 0) root.rotation.y = k.facing;           // it keeps facing where it faced (not the way it flies)
  }
  const L = M.leap;
  if (L) {
    const e = t - L.t0;
    if (e >= 0 && e < L.air) { const q = e / L.air; lift = Math.max(lift, 4 * L.h * q * (1 - q)); tilt = Math.max(tilt, -0.25 * Math.sin(q * Math.PI)); tiltDir = facing; }
    else if (e >= L.air) {
      M.leap = null;
      const b = a.formBody || a.body;
      if (b?.isTabard) { b.play('Jump_Land', 0.06); speedClip(b, 'Jump_Land', 1.29 / 0.4); a.clip = 'Jump_Land'; a.once = 'land'; a.onceUntil = performance.now() + 400; }
    }
  }
  const G = M.lunge;
  if (G) { const e = t - G.t0; if (e >= 0 && e < G.s) { tilt = Math.max(tilt, 0.3 * Math.sin(Math.PI * e / G.s)); tiltDir = facing; } else if (e >= G.s) M.lunge = null; }
  const R = M.roll;
  if (R) {
    const e = t - R.t0;
    // Tabard rolls in its clip; anything else (a druid's wolf, a monster) tucks and dips forward on its own
    if (e < R.s) { if (!(a.formBody || a.body)?.isTabard || a.formBody) { lift -= 0.25 * Math.sin(Math.PI * e / R.s); tilt = Math.max(tilt, 0.6 * Math.sin(Math.PI * e / R.s)); tiltDir = facing; } }
    else M.roll = null;
  }
  const F = M.flinch;
  if (F) {
    const e = t - F.t0;
    if (e < 0.32) { const q = e < 0.08 ? e / 0.08 : 1 - (e - 0.08) / 0.24; px = F.x * F.m * q; pz = F.z * F.m * q; puff = 1 + F.puff * q; if (!k) { tilt = Math.max(tilt, 0.18 * q); tiltDir = Math.atan2(F.x, F.z); } }
    else M.flinch = null;
  }
  const W = M.windup;
  if (W) {
    const e = t - W.t0;
    // leans back through the tell, then snaps forward as the blow falls
    if (e < W.s) { const q = e / W.s; tilt = Math.max(tilt, 0.22 * ease(q)); tiltDir = facing + Math.PI; puff = Math.max(puff, 1 + 0.06 * q); }
    else if (e < W.s + 0.15) { const q = (e - W.s) / 0.15; tilt = Math.max(tilt, 0.25 * (1 - q)); tiltDir = facing; }
    else M.windup = null;
  }
  if (lift) root.position.y = y + lift;
  if (px || pz) { root.position.x = x + px; root.position.z = z + pz; }
  if (puff !== 1) root.scale.setScalar((a.baseScale ?? 1) * puff);
  if (tilt) {
    // tip the body toward world direction `tiltDir` (Euler YXZ: yaw first, then the tip in the body's own frame)
    root.rotation.order = 'YXZ';
    const r = tiltDir - root.rotation.y;
    root.rotation.x = tilt * Math.cos(r);
    root.rotation.z = -tilt * Math.sin(r);
  }
  if (!M.knock && !M.leap && !M.lunge && !M.roll && !M.flinch && !M.windup) a.motion = null;
}
