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
import { Group as THREE_GROUP } from 'three';

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
      const look = u.model.creature ? creatureLook(u.model, extra, u.race) : chibiLook(u.model, extra, u.race);
      look.id = id; look.name = u.name; look.race = u.race; look.tier = u.tier;
      cache.set(key, look); return look;
    },
    forHero(id) {
      const key = 'h:' + id;
      if (cache.has(key)) return cache.get(key);
      const h = looks.heroes?.[id];
      if (!h) throw new Error(`unit-looks: no hero "${id}"`);
      const look = chibiLook(h, h, null); look.id = id; look.hero = true;
      cache.set(key, look); return look;
    },
    /** Any ref: 'unit:levy', 'hero:druid', or a plain unit id. */
    forRef(ref) { const [k, id] = ref.includes(':') ? ref.split(':') : ['unit', ref]; return k === 'hero' ? api.forHero(id) : api.forUnit(id); },
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
 *   const bodies = createBodyFactory(looks, { scale: 1.3 });
 *   await bodies.preload(data);                 // builds one of every unit + hero: warms templates, learns heights
 *   makeBody(ent, look, data) -> { object, height, play(act, t, phase), dispose() }
 *
 * `makeBody` is synchronous (actors.js needs an object now), so it returns an empty group at once and
 * drops the real model into it when the async build lands (a frame or two; instant for preloaded
 * Chibi 2 templates). `height` comes from the preload, so HP bars sit right from the first frame.
 * `play(act, t)` maps the sim's act (idle/walk/attack/cast/dead…) to a clip and advances it.
 * Ent kinds: `hero` (ent.type = hero id), `unit` (ent.type = unit id), anything else (tides) uses
 * `fallback(ent, look, data)` if given, else nothing is drawn.
 */
export function createBodyFactory(looks, { scale = 1.3, fallback = null } = {}) {
  const heights = new Map();
  const refOf = ent => ent.kind === 'hero' ? 'hero:' + ent.type : 'unit:' + ent.type;
  function lookOf(ent) { try { return looks.forRef(refOf(ent)); } catch { return null; } }
  async function preload(data = null) {
    const refs = [...looks.unitIds().map(id => 'unit:' + id), ...looks.heroIds().map(id => 'hero:' + id)];
    for (const ref of refs) {
      if (heights.has(ref)) continue;
      const a = await buildActor(looks.forRef(ref));
      heights.set(ref, a.height); a.dispose?.();
    }
    return heights;
  }
  function makeBody(ent, lookRef, data) {
    const look = (ent.kind === 'hero' || ent.kind === 'unit' || ent.kind === undefined) ? lookOf(ent) : null;
    if (!look) return fallback ? fallback(ent, lookRef, data) : { object: new THREE_GROUP(), height: 1, play() {}, dispose() {} };
    const s = scale * (look.scale || 1);
    const holder = new THREE_GROUP(); holder.scale.setScalar(s);
    const body = { object: holder, height: (heights.get(refOf(ent)) ?? 1.1) * s, actor: null, look, disposed: false, anim: null, lastT: null,
      play(act, t) {
        const a = body.actor; if (!a) return;
        const clip = act === 'dead' || act === 'die' ? 'dead' : act === 'walk' || act === 'move' ? 'walk' : act === 'attack' ? 'attack' : act === 'cast' ? 'cast' : act === 'hit' || act === 'stun' ? 'hit' : 'ready';
        if (clip !== body.anim) { a.setAnim(clip, 0.12, clip === 'attack' || clip === 'cast'); body.anim = clip; }
        const dt = body.lastT == null ? 0 : Math.max(0, Math.min(0.1, t - body.lastT)); body.lastT = t;
        a.update(dt, t);
      },
      dispose() { body.disposed = true; body.actor?.dispose(); },
    };
    buildActor(look).then(a => {
      if (body.disposed) { a.dispose(); return; }
      body.actor = a; holder.add(a.group);
      if (!heights.has(refOf(ent))) { heights.set(refOf(ent), a.height); }
      body.height = a.height * s;
    }).catch(e => console.warn('unit-looks: build failed', refOf(ent), e));
    return body;
  }
  return { makeBody, preload, heights, lookOf };
}
