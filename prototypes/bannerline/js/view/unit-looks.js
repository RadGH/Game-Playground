// Unit looks: turn a unit / hero id into a 3D body (stream C, PLAN §14).
//
//   import { loadLooks } from './unit-looks.js';
//   const looks = await loadLooks();                       // fetches the data files once
//   const look  = looks.forUnit('tuskback');               // { kind:'creature', spec, scale } or { kind:'chibi2', avatar, scale }
//   const look2 = looks.forHero('pyromancer');
//   const actor = await looks.build(look);                 // { group, update(dt,t), setAnim(name), metrics(), dispose(), kind, height }
//
// One resolver shared by the game view (actors), the bench (bench.html), the icon baker (icons.js)
// and the live portrait (portrait.js), so a unit looks the same everywhere. The data is
// data/looks.json (art only — the sim never reads it) on top of units.json `model` refs.
//
// Creatures are run through avatar-3d's mesh merge (one or two draw calls instead of thirty).
// Chibi 2 bodies share geometry per identical avatar JSON (chibi2.js caches templates), so twenty
// Levies cost one template and forty draw calls, not twenty templates.
//
// `setAnim` takes the Chibi 2 clip names (idle, ready, walk, run, attack, cast, hit, dead, talk...);
// a creature maps the ones it lacks (ready -> idle, cast -> attack, hit -> talk).

import { createChibi2Character } from '../../../../avatar-3d/js/chibi2.js';
import { createCreature, normalizeCreature, CREATURE_TYPES } from '../../../../avatar-3d/js/creatures.js';
import { compactCreature } from '../../../../avatar-3d/js/mesh-merge.js';
import { dressAs } from '../../../../avatar-3d/js/class-outfits.js';
import { Group as THREE_GROUP, Color as THREE_COLOR } from 'three';

const here = p => new URL(p, import.meta.url).href;
const clone = v => JSON.parse(JSON.stringify(v));
const CREATURE_CLIP = { ready: 'idle', cast: 'attack', hit: 'talk', guard: 'idle', wave: 'talk', jump: 'run' };

async function json(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }

/**
 * Load every file the looks need. Pass `urls` to override any of them (tests, other folders).
 * Never throws for a missing optional file (warbands, variants): those looks fall back to a bare body.
 */
export async function loadLooks(urls = {}) {
  const U = {
    looks: here('../../data/looks.json'),
    units: here('../../data/units.json'),
    races: here('../../data/races.json'),
    presets: here('../../../../avatar-3d/data/chibi2-presets.json'),
    outfits: here('../../../../avatar-3d/data/class-outfits.json'),
    variants: here('../../../../avatar-3d/data/creature-variants.json'),
    warbands: here('../../../farhold/data/warbands.json'),
    ...urls,
  };
  const soft = url => json(url).catch(() => null);
  const [looks, units, races, presets, outfits, variants, warbands] = await Promise.all([
    json(U.looks), json(U.units), soft(U.races), json(U.presets), soft(U.outfits), soft(U.variants), soft(U.warbands)]);
  return createLooks({ looks, units, races, presets, outfits, variants, warbands });
}

/** The resolver over already-loaded data (node tests call this directly with JSON from disk). */
export function createLooks({ looks, units, races = null, presets, outfits = null, variants = null, warbands = null }) {
  const unitTable = units.units || units;
  const presetBy = new Map((presets.presets || []).map(p => [p.name, p.avatar]));
  const outfitTable = outfits?.classes || outfits || {};
  const variantTable = variants?.variants || {};
  const warbandDef = new Map();
  for (const b of warbands?.warbands || []) for (const d of b.defs || []) warbandDef.set(d.id, d);
  const cache = new Map();

  function baseAvatar(race) {
    const name = looks.bases?.[race] || looks.bases?.human;
    const a = presetBy.get(name) || presetBy.values().next().value || {};
    return clone(a);
  }

  /** Swap any colour on the race's "from" list for its banner colour, in every slot. */
  function paint(avatar, p) {
    if (!p) return avatar;
    const from = new Set((p.from || []).map(c => c.toLowerCase()));
    for (const slot of Object.values(avatar)) {
      if (!slot || typeof slot !== 'object') continue;
      if (typeof slot.color === 'string' && from.has(slot.color.toLowerCase())) slot.color = p.to;
      if (typeof slot.color2 === 'string' && from.has(slot.color2.toLowerCase())) slot.color2 = p.trim || p.to;
    }
    return avatar;
  }

  function chibiLook(model, extra = {}, raceId = null) {
    let avatar;
    if (model.warband && warbandDef.has(model.warband)) avatar = clone(warbandDef.get(model.warband).look?.avatar || {});
    else avatar = baseAvatar(model.chibi2 || 'human');
    if (model.outfit && outfitTable[model.outfit]) avatar = dressAs(avatar, outfitTable[model.outfit]);
    for (const [slot, v] of Object.entries(extra.parts || {})) avatar[slot] = clone(v);
    if (raceId) paint(avatar, looks.races?.[raceId]?.paint);
    return { kind: 'chibi2', avatar, scale: extra.scale ?? 1 };
  }

  function creatureLook(model, extra = {}, raceId = null) {
    const vid = model.variant || looks.races?.[raceId]?.creatures?.[model.creature];
    const v = vid && variantTable[vid];
    const spec = normalizeCreature(v ? v.creature : { type: model.creature });
    return { kind: 'creature', spec, variant: v ? vid : null, scale: extra.scale ?? 1 };
  }

  const api = {
    /** Every unit id that has a model ref. */
    unitIds() { return Object.keys(unitTable).filter(id => unitTable[id]?.model); },
    heroIds() { return Object.keys(looks.heroes || {}); },
    /** A unit's look (memoised; treat it as read-only). */
    forUnit(id) {
      const key = 'u:' + id;
      if (cache.has(key)) return cache.get(key);
      const u = unitTable[id];
      if (!u || !u.model) throw new Error(`unit-looks: no unit "${id}"`);
      const extra = looks.units?.[id] || {};
      const tierScale = looks.tierScale?.[u.tier] ?? 1;
      const look = u.model.creature ? creatureLook(u.model, { ...extra, scale: extra.scale ?? tierScale }, u.race) : chibiLook(u.model, { ...extra, scale: extra.scale ?? tierScale }, u.race);
      look.id = id; look.name = u.name; look.race = u.race; look.tier = u.tier;
      cache.set(key, look); return look;
    },
    /** A hero's Chibi 2 look; `color` paints the slots in heroes.<id>.team (the player's colour). */
    forHero(id, { color = null } = {}) {
      const key = 'h:' + id + ':' + (color || '');
      if (cache.has(key)) return cache.get(key);
      const h = looks.heroes?.[id];
      if (!h) throw new Error(`unit-looks: no hero "${id}"`);
      const look = chibiLook(h, h, null); look.id = id; look.hero = true;
      if (color) for (const [slot, field] of Object.entries(h.team || {})) if (look.avatar[slot] && look.avatar[slot].id !== 'none') look.avatar[slot][field] = color;
      cache.set(key, look); return look;
    },
    /** Hunters vs Farmers: 'farmer' | 'hunter' (Chibi 2, `color` paints the hat band / jerkin). */
    forRole(role, { color = null } = {}) {
      const key = 'r:' + role + ':' + (color || '');
      if (cache.has(key)) return cache.get(key);
      const h = looks.hvf?.[role]; if (!h) throw new Error(`unit-looks: no hvf role "${role}"`);
      const look = chibiLook(h, h, null); look.id = role; look.role = role;
      if (color) for (const [slot, field] of Object.entries(h.team || {})) if (look.avatar[slot] && look.avatar[slot].id !== 'none') look.avatar[slot][field] = color;
      cache.set(key, look); return look;
    },
    /** Hunters vs Farmers creatures: kind 'animals' | 'army' | 'pets', id 'sheep' / 'scarecrow' / 'hound'... */
    forHvf(kind, id) {
      const vid = looks.hvf?.[kind]?.[id], v = vid && variantTable[vid];
      if (!v) throw new Error(`unit-looks: no hvf ${kind} "${id}"`);
      return { kind: 'creature', spec: normalizeCreature(v.creature), variant: vid, scale: 1, id };
    },
    /** How a downed farmer is drawn (looks.json hvf.ghost). */
    ghostStyle() { return looks.hvf?.ghost || { color: '#9fd8ff', opacity: 0.45, emissive: 0.6 }; },
    /** A hero's summon (heroes.json `pets`, e.g. the Druid's Grove Wolf): looks.json `pets.<id>` names a creature look. */
    forPet(id) {
      const vid = looks.pets?.[id], v = vid && variantTable[vid];
      if (!v) throw new Error(`unit-looks: no pet "${id}"`);
      return { kind: 'creature', spec: normalizeCreature(v.creature), variant: vid, scale: 1, id, pet: true };
    },
    /** The creature a hero becomes in a shape ('druid', 'wolf'); null when there is no such form. */
    forForm(heroId, formId) {
      const vid = looks.forms?.[heroId]?.[formId], v = vid && variantTable[vid];
      if (!v) return null;
      return { kind: 'creature', spec: normalizeCreature(v.creature), variant: vid, scale: looks.heroes?.[heroId]?.scale ?? 1, id: heroId + ':' + formId, hero: true, form: formId };
    },
    /** Any ref: 'unit:levy', 'hero:druid', or a plain unit id. */
    /** 'unit:levy', 'hero:druid', 'form:druid:wolf', or a plain unit id. */
    forRef(ref) { const [k, id, f] = ref.includes(':') ? ref.split(':') : ['unit', ref]; return k === 'hero' ? api.forHero(id) : k === 'form' ? api.forForm(id, f) : k === 'pet' ? api.forPet(id) : k === 'role' ? api.forRole(id) : k === 'hvf' ? api.forHvf(id, f) : api.forUnit(id); },
    build: buildActor,
  };
  return api;
}

/**
 * Build the body for a look. Options: `merge` (default true) folds a creature's meshes;
 * `anims` passes through to Chibi 2 (its default clip set otherwise). The returned actor
 * always answers the Chibi 2 clip names.
 */
export async function buildActor(look, { merge = true, anims } = {}) {
  if (look.kind === 'creature') {
    const c = await createCreature(look.spec);
    if (merge) c.compacted = compactCreature(c);
    const setAnim = c.setAnim.bind(c);
    const flyer = CREATURE_TYPES[look.spec.type]?.plan === 'bat';     // hovers ~1 m up: draw its shadow on the ground
    const m0 = c.metrics();
    return {
      kind: 'creature', group: c.group, look,
      height: m0.height, metrics: () => c.metrics(),
      setAnim(name) { setAnim(CREATURE_CLIP[name] || name); },
      get anim() { return c.anim; },
      setRate: r => c.setRate?.(r),
      update: (dt, t) => c.update(dt, t),
      flyer,
      dispose: () => c.dispose(),
      stats() { let meshes = 0, triangles = 0; c.group.traverse(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; } }); return { meshes, triangles }; },
    };
  }
  const ch = await createChibi2Character(look.avatar, anims ? { anims } : {});
  return {
    kind: 'chibi2', group: ch.group, look,
    height: ch.metrics().totalHeight, metrics: () => ch.metrics(),
    setAnim: (name, fade, restart) => ch.setAnim(name, fade, restart),
    get anim() { return ch.anim; },
    setRate: r => ch.setRate(r),
    update: dt => ch.update(dt),
    skeleton: ch.skeleton, parts: ch.parts,
    dispose: () => ch.dispose(),
    stats: () => ch.stats(),
  };
}

/**
 * The body factory stream B's actors take: `createActors({ makeBody: bodies.makeBody })`.
 *
 *   const bodies = createBodyFactory(looks, { scale: 1.3, colorOf: ent => identity.slotColor(slotOfPlayer(ent.owner)), turretLevelOf: ent => rank });
 *   await bodies.preload();                     // builds one of every unit + hero: warms templates, learns heights
 *   makeBody(ent, look, data) -> { object, height, play(act, t), dispose(), setForm(formId|null), setGhost(bool), turret? }
 *
 * Kinds: `hero` (Chibi 2, painted in `colorOf(ent)`), `unit`, `pet` (data/looks.json `pets`),
 * `turret` (js/view/engineer.js at `turretLevelOf(ent)` 1-3). Tides go to `fallback`.
 * `makeBody` is synchronous: it returns an empty group at once and drops the model in when the async
 * build lands. `height` comes from the preload, so HP bars sit right from the first frame.
 * `play(act, t)` maps the sim's act (idle/walk/attack/cast/stun/dead) to a clip and advances it.
 * `setForm('wolf')` swaps a hero into its shape body (on the `form` event), `setForm(null)` back.
 * `setGhost(true)` draws the body half-transparent (stealth units nobody can see); per-body
 * materials are cloned only while ghosted, so shared Chibi 2 templates are never touched.
 */
export function createBodyFactory(looks, { scale = 1.3, fallback = null, colorOf = () => null, turretLevelOf = () => 1, makeTurret = null } = {}) {
  const heights = new Map();
  const refOf = ent => ent.kind === 'hero' ? 'hero:' + ent.type : ent.kind === 'pet' ? 'pet:' + ent.type : 'unit:' + ent.type;
  function lookOf(ent) {
    try {
      if (ent.kind === 'hero') return looks.forHero(ent.type, { color: colorOf(ent) });
      if (ent.kind === 'pet') return looks.forPet(ent.type);
      return looks.forUnit(ent.type);
    } catch { return null; }
  }
  async function preload() {
    const refs = [...looks.unitIds().map(id => 'unit:' + id), ...looks.heroIds().map(id => 'hero:' + id)];
    for (const ref of refs) {
      if (heights.has(ref)) continue;
      const a = await buildActor(looks.forRef(ref));
      heights.set(ref, a.height); a.dispose?.();
    }
    return heights;
  }
  const CLIP = act => act === 'dead' || act === 'die' ? 'dead' : act === 'walk' || act === 'move' ? 'walk' : act === 'attack' ? 'attack' : act === 'cast' ? 'cast' : act === 'hit' || act === 'stun' ? 'hit' : 'ready';

  function turretBody(ent) {
    const T = makeTurret?.({ level: turretLevelOf(ent), color: colorOf(ent) || '#888888' });
    if (!T) return null;
    let lastT = null;
    return { object: T.group, height: T.height, turret: T,
      play(act, t) { const dt = lastT == null ? 0 : Math.max(0, Math.min(0.1, t - lastT)); lastT = t; if (act === 'attack' && T._act !== 'attack') T.fire(); T._act = act; T.aim(ent.face ?? 0); T.update(dt); },
      setForm() {}, setGhost() {}, dispose() { T.dispose(); } };
  }

  function makeBody(ent, lookRef, data) {
    if (ent.kind === 'turret') { const b = turretBody(ent); if (b) return b; }
    const look = (ent.kind === 'hero' || ent.kind === 'unit' || ent.kind === 'pet' || ent.kind === undefined) ? lookOf(ent) : null;
    if (!look) return fallback ? fallback(ent, lookRef, data) : { object: new THREE_GROUP(), height: 1, play() {}, dispose() {}, setForm() {}, setGhost() {} };
    const holder = new THREE_GROUP();
    const body = { object: holder, height: 1.1, actor: null, look, disposed: false, anim: null, lastT: null, form: null, ghost: false, ghostMats: null, token: 0,
      play(act, t) {
        const a = body.actor; if (!a) return;
        const clip = CLIP(act);
        if (clip !== body.anim) { a.setAnim(clip, 0.12, clip === 'attack' || clip === 'cast'); body.anim = clip; }
        const dt = body.lastT == null ? 0 : Math.max(0, Math.min(0.1, t - body.lastT)); body.lastT = t;
        a.update(dt, t);
      },
      setForm(formId) {
        if ((formId || null) === body.form) return;
        body.form = formId || null;
        const L = body.form && ent.kind === 'hero' ? looks.forForm(ent.type, body.form) : null;
        load(L || look, body.form ? 'form:' + ent.type + ':' + body.form : refOf(ent));
      },
      setGhost(v) {
        v = !!v; if (v === body.ghost) return; body.ghost = v; applyGhost();
      },
      dispose() { body.disposed = true; restoreMats(); body.actor?.dispose(); },
    };
    function restoreMats() { if (body.ghostMats) { for (const [m, orig] of body.ghostMats) { m.material.dispose(); m.material = orig; } body.ghostMats = null; } }
    function applyGhost() {
      restoreMats();
      if (!body.ghost || !body.actor) return;
      body.ghostMats = [];
      body.actor.group.traverse(o => { if (o.isMesh && !Array.isArray(o.material)) { const c = o.material.clone(); c.transparent = true; c.opacity = 0.42; c.depthWrite = false; body.ghostMats.push([o, o.material]); o.material = c; } });
    }
    function load(L, ref) {
      const my = ++body.token, s = scale * (L.scale || 1);
      holder.scale.setScalar(s);
      body.height = (heights.get(ref) ?? 1.1) * s;
      buildActor(L).then(a => {
        if (body.disposed || my !== body.token) { a.dispose(); return; }
        restoreMats();
        if (body.actor) { holder.remove(body.actor.group); body.actor.dispose(); }
        body.actor = a; body.anim = null; holder.add(a.group);
        if (!heights.has(ref)) heights.set(ref, a.height);
        body.height = a.height * s;
        applyGhost();
      }).catch(e => console.warn('unit-looks: build failed', ref, e));
    }
    load(look, refOf(ent));
    return body;
  }
  return { makeBody, preload, heights, lookOf };
}

/**
 * Make an actor (or any group) look like a GHOST: every mesh gets a translucent, glowing copy of its
 * material in `style.color` (Hunters vs Farmers' downed farmer, looks.json hvf.ghost). Returns
 * restore() which puts the original materials back. Shared Chibi 2 template materials are never edited.
 */
export function applyGhost(group, style = { color: '#9fd8ff', opacity: 0.45, emissive: 0.6 }) {
  const swaps = [];
  group.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const m = o.material.clone();
    m.transparent = true; m.opacity = style.opacity ?? 0.45; m.depthWrite = false;
    if (m.color) m.color.lerp(new THREE_COLOR(style.color), 0.7);
    if ('emissive' in m && m.emissive) { m.emissive = new THREE_COLOR(style.color); m.emissiveIntensity = style.emissive ?? 0.6; }
    swaps.push([o, o.material]); o.material = m;
  });
  return () => { for (const [o, orig] of swaps) { o.material.dispose(); o.material = orig; } };
}
