// Spell effects for a 3D stage: projectiles that fly, impacts that burst, cast flashes, heals,
// revives and looping status auras stuck to a body.
//
// Nothing here is a glowing ball. Every effect is built from shaped geometry (cones, spinning
// shard clusters, expanding torus rings, ground rune discs, tumbling planes, jagged lines) and/or
// the 64x64 particle sprites in assets/data/fx/ drawn as billboards with additive blending.
//
// The module knows nothing about any game: give it a THREE.Scene and a way to fetch a texture.
//
//   import * as THREE from 'three';
//   import { SpellFx, ELEMENTS, STATUS_FX } from '../../avatar-3d/js/spellfx.js';
//   const textures = await assets.fxTextures(THREE);         // { flame: CanvasTexture, ... }
//   const fx = new SpellFx(scene, { textures, camera });
//   sceneTicker(dt => fx.update(dt));
//   await fx.projectile({ from: a, to: b, element: 'fire' });
//   fx.impact({ at: b, element: 'fire', crit: true });
//   fx.status(bodyGroup, 'burn', true);
//
// `textures` may be a plain object, a Map, or a function (id) => THREE.Texture|null. A missing
// texture is simply skipped, so an effect degrades to its geometry instead of throwing.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];

/**
 * Every element the module draws. `shape` is the default projectile body, `impact` the burst style.
 * `speed` is in world units per second, `arc` how high the flight path bows (0 = flat).
 */
export const ELEMENTS = {
  fire:      { color: 0xff7a1a, accent: 0xffd070, shape: 'cone',    impact: 'fire',      trail: ['flame', 'ember'],            speed: 8,  arc: 0.30, label: 'Fire' },
  ice:       { color: 0x9ad8ff, accent: 0xe8f8ff, shape: 'shards',  impact: 'ice',       trail: ['snowflake'],                 speed: 9,  arc: 0.18, label: 'Ice' },
  shadow:    { color: 0x8a60c0, accent: 0xd0b0ff, shape: 'ribbon',  impact: 'shadow',    trail: ['wisp', 'shadow_claw'],       speed: 6.5, arc: 0.22, label: 'Shadow' },
  holy:      { color: 0xffe6a0, accent: 0xfff8e0, shape: 'rune',    impact: 'holy',      trail: ['holy_mote'],                 speed: 7,  arc: 0.55, label: 'Holy' },
  nature:    { color: 0x5ab04a, accent: 0x9ada70, shape: 'spiral',  impact: 'nature',    trail: ['leaf'],                      speed: 7,  arc: 0.40, label: 'Nature' },
  arcane:    { color: 0xa060e0, accent: 0xe0c0ff, shape: 'helix',   impact: 'arcane',    trail: ['arcane_shard', 'wisp'],      speed: 8.5, arc: 0.25, label: 'Arcane' },
  lightning: { color: 0xffe860, accent: 0xfffbd0, shape: 'bolt',    impact: 'lightning', trail: ['spark'],                     speed: 40, arc: 0,    label: 'Lightning' },
  physical:  { color: 0xd8dcea, accent: 0xffffff, shape: 'arrow',   impact: 'physical',  trail: ['spark'],                     speed: 11, arc: 0.20, label: 'Physical' },
  poison:    { color: 0x60c060, accent: 0xc8ffc8, shape: 'bubbles', impact: 'poison',    trail: ['bubble'],                    speed: 6,  arc: 0.35, label: 'Poison' },
  bleed:     { color: 0xc02020, accent: 0xff8080, shape: 'drops',   impact: 'bleed',     trail: ['drop'],                      speed: 7.5, arc: 0.45, label: 'Bleed' },
  true:      { color: 0xffffff, accent: 0xffffff, shape: 'shards',  impact: 'arcane',    trail: ['spark', 'glow'],             speed: 10, arc: 0.15, label: 'True' },
};

/** Damage-type / skill-type names a game might use, mapped onto the table above. */
export const ELEMENT_ALIASES = {
  cold: 'ice', frost: 'ice', water: 'ice',
  magic: 'arcane', force: 'arcane', chaos: 'arcane', void: 'shadow', necrotic: 'shadow', dark: 'shadow',
  light: 'holy', radiant: 'holy', divine: 'holy',
  earth: 'nature', wind: 'nature', air: 'nature', life: 'nature',
  storm: 'lightning', thunder: 'lightning', shock: 'lightning',
  melee: 'physical', ranged: 'physical', blunt: 'physical', pierce: 'physical', slash: 'physical', normal: 'physical', none: 'physical',
  venom: 'poison', acid: 'poison', blood: 'bleed',
};

/** Name of the element a damage type / skill type belongs to. Unknown names fall back to arcane. */
export function elementName(name) {
  const k = String(name || '').toLowerCase();
  if (ELEMENTS[k]) return k;
  if (ELEMENT_ALIASES[k]) return ELEMENT_ALIASES[k];
  return 'arcane';
}
/** The ELEMENTS row for a damage type / skill type. */
export function elementOf(name) { return ELEMENTS[elementName(name)]; }

/**
 * Looping auras. `where` is roughly where the effect sits: feet / body / head / face / above.
 * Colours follow Emberveil's status table (data/status-effects.json) where one exists.
 */
export const STATUS_FX = {
  burn:     { sprites: ['flame', 'ember'],     color: 0xe08020, where: 'body',  style: 'lick',   label: 'Burning' },
  poison:   { sprites: ['bubble'],             color: 0x60c060, where: 'body',  style: 'rise',   label: 'Poisoned' },
  bleed:    { sprites: ['drop'],               color: 0xe05050, where: 'body',  style: 'fall',   label: 'Bleeding' },
  freeze:   { sprites: ['ice_shard'],          color: 0x9ad8ff, where: 'body',  style: 'shell',  label: 'Frozen' },
  stun:     { sprites: ['star_daze'],          color: 0xe0c020, where: 'head',  style: 'orbit',  label: 'Stunned' },
  sleep:    { sprites: ['zzz'],                color: 0xb0c8ff, where: 'head',  style: 'drift',  label: 'Asleep' },
  confused: { sprites: ['question'],           color: 0xffb0e0, where: 'head',  style: 'orbit',  label: 'Confused' },
  dazed:    { sprites: ['ring'],               color: 0xffe860, where: 'head',  style: 'disc',   label: 'Dazed' },
  blind:    { sprites: ['eye_closed'],         color: 0xc0c0d0, where: 'face',  style: 'stick',  label: 'Blinded' },
  slow:     { sprites: ['arrow_down'],         color: 0x8090b0, where: 'body',  style: 'pulse',  label: 'Slowed' },
  marked:   { sprites: ['target'],             color: 0xff6060, where: 'above', style: 'bob',    label: 'Marked' },
  barrier:  { sprites: ['shield_ring'],        color: 0x60a0e0, where: 'body',  style: 'shield', label: 'Barrier' },
  regen:    { sprites: ['holy_mote', 'leaf'],  color: 0x9ada70, where: 'body',  style: 'rise',   label: 'Regenerating' },
  sunder:   { sprites: ['crack'],              color: 0xe0d0c0, where: 'body',  style: 'stick',  label: 'Sundered' },
  curse:    { sprites: ['skull', 'wisp'],      color: 0x8a60c0, where: 'feet',  style: 'circle', label: 'Cursed' },
  silence:  { sprites: ['mute'],               color: 0xff6060, where: 'above', style: 'bob',    label: 'Silenced' },
  disarm:   { sprites: ['chain'],              color: 0xb0b0c0, where: 'body',  style: 'stick',  label: 'Disarmed' },
  root:     { sprites: ['root_vine'],          color: 0x4a7a30, where: 'feet',  style: 'ground', label: 'Rooted' },
  rally:    { sprites: ['arrow_up'],           color: 0xe8a020, where: 'body',  style: 'burstup', label: 'Rallied' },
  haste:    { sprites: ['spark'],              color: 0x40c8ff, where: 'body',  style: 'streak', label: 'Hasted' },
  enchant:  { sprites: ['arcane_shard'],       color: 0xc080ff, where: 'body',  style: 'orbit',  ring: true, label: 'Enchanted' },
  block:    { sprites: ['shield_ring'],        color: 0x8080e0, where: 'body',  style: 'shield', label: 'Blocking' },
  deflect:  { sprites: ['ring'],               color: 0x8080e0, where: 'body',  style: 'disc',   label: 'Deflecting' },
};

/** The aura row for a status name; unknown names get a plain circling mote so nothing is invisible. */
export function statusFxOf(type) {
  return STATUS_FX[String(type || '').toLowerCase()] || { sprites: ['glow'], color: 0xc0c0d0, where: 'body', style: 'orbit', label: String(type || 'status') };
}

// ---------------------------------------------------------------------------------------------
// disposal helpers

function disposeObj(obj) {
  obj.traverse(o => {
    if (o.userData?.poolKey) return;     // a pooled trail sprite: its material is reused, not thrown away
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) m.dispose();   // textures are shared: never disposed here
  });
  if (obj.parent) obj.parent.remove(obj);
}

/** Height of a body, cached on the object so a Box3 is only ever walked once per character. */
function bodyHeight(obj) {
  if (obj.userData.fxHeight) return obj.userData.fxHeight;
  let h = 1.1;
  try { const b = new THREE.Box3().setFromObject(obj); if (isFinite(b.max.y) && b.max.y > 0.05) h = b.max.y - Math.max(0, b.min.y); } catch { /* keep the default */ }
  obj.userData.fxHeight = h;
  return h;
}

// ---------------------------------------------------------------------------------------------

/** A stream of billboard sprites left behind a moving head, each shrinking and fading out. */
class Trail {
  constructor(fx, { ids = ['glow'], size = 0.16, color = 0xffffff, life = 0.34, rate = 55, spread = 0.035, rise = 0, blending = THREE.AdditiveBlending, opacity = 1 } = {}) {
    this.fx = fx; this.ids = ids; this.size = size; this.color = color; this.life = life; this.rate = rate;
    this.spread = spread; this.rise = rise; this.blending = blending; this.opacity = opacity;
    this.group = new THREE.Group(); this.parts = []; this._acc = 0; this.emitting = true;
  }
  emit(pos, dt) {
    if (!this.emitting) return;
    // Budget (E31): when the stage is already drowning in particles the trail thins out instead of
    // adding to the pile — a busy 4v6 round looks the same and costs a fraction of the frame.
    const budget = this.fx.budgetScale();
    if (budget <= 0) { this._acc = 0; return; }
    this._acc += dt * this.rate * budget;
    while (this._acc >= 1) {
      this._acc -= 1;
      const s = this.fx._sprite(pick(this.ids), { size: this.size * rnd(0.7, 1.25), color: this.color, blending: this.blending, opacity: this.opacity, pooled: true });
      if (!s) { this._acc = 0; return; }
      s.position.copy(pos).add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(this.spread));
      s.material.rotation = rnd(0, Math.PI * 2);
      this.group.add(s);
      this.fx._particles++;
      this.parts.push({ s, age: 0, life: this.life * rnd(0.75, 1.2), size: s.scale.x, spin: rnd(-4, 4), vel: new THREE.Vector3(rnd(-0.1, 0.1), this.rise + rnd(-0.05, 0.05), rnd(-0.1, 0.1)) });
    }
  }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { this.group.remove(p.s); this.fx._freeSprite(p.s); this.parts.splice(i, 1); continue; }
      p.s.position.addScaledVector(p.vel, dt);
      p.s.material.rotation += p.spin * dt;
      p.s.material.opacity = this.opacity * (1 - k) * (1 - k);
      const sc = p.size * (1 - k * 0.75);
      p.s.scale.set(sc, sc, sc);
    }
  }
  get count() { return this.parts.length; }
  dispose() { for (const p of this.parts) { this.group.remove(p.s); this.fx._freeSprite(p.s); } this.parts.length = 0; disposeObj(this.group); }
}

// ---------------------------------------------------------------------------------------------

export class SpellFx {
  /**
   * @param {THREE.Scene} scene       where world-space effects are added
   * @param {object} opts
   * @param {object|Map|Function} opts.textures  fx sprite textures by id (see assets.fxTextures)
   * @param {THREE.Camera} [opts.camera]         used to face flat discs at the viewer
   * @param {number} [opts.scale]                global size multiplier (1 = tuned for ~1.2 m chibi bodies)
   * @param {number} [opts.maxParticles]         hard cap on live trail sprites (see budgetScale)
   * @param {number} [opts.maxLive]              hard cap on one-shot effects running at once
   */
  constructor(scene, { textures = null, camera = null, scale = 1, maxParticles = 320, maxLive = 48 } = {}) {
    this.scene = scene; this.camera = camera; this.scale = scale;
    this.root = new THREE.Group(); this.root.name = 'spellfx'; this.root.frustumCulled = false;
    scene.add(this.root);
    this.setTextures(textures);
    this.live = [];                 // one-shot effects
    this._statuses = new Map();     // object uuid -> Map(type -> handle)
    this._t = 0;
    this._spriteGeo = null;         // three makes its own sprite geometry; kept for API symmetry
    // ---- budget + pooling (E31) ---------------------------------------------------------------
    // A four-on-six round with everything casting used to build and throw away a SpriteMaterial per
    // trail particle — sixty a second per projectile. Sprites now come from a pool keyed by texture
    // and blend mode, and both particles and one-shot effects have a ceiling.
    this.maxParticles = maxParticles; this.maxLive = maxLive;
    this._particles = 0;            // live trail sprites right now
    this._pool = new Map();         // "id|blending" -> [Sprite]
    this._pooled = 0;
    this._dropped = 0;              // effects skipped because the stage was already full
  }
  /**
   * How much of its normal output a trail should emit right now: 1 while there is room, tapering to
   * 0 at the cap. This is the cheap level-of-detail switch — nothing disappears, the streams just
   * get thinner when ten things are in the air at once.
   */
  budgetScale() {
    const k = this._particles / Math.max(1, this.maxParticles);
    if (k < 0.6) return 1;
    if (k < 0.85) return 0.5;
    if (k < 1) return 0.25;
    return 0;
  }
  /** Counts for a perf overlay or a test: { live, particles, statuses, pooled, dropped }. */
  stats() {
    let statuses = 0; for (const m of this._statuses.values()) statuses += m.size;
    return { live: this.live.length, particles: this._particles, statuses, pooled: this._pooled, dropped: this._dropped, budget: this.budgetScale() };
  }
  /** Put a finished sprite back in the pool instead of throwing its material away. */
  _freeSprite(s) {
    if (!s) return;
    this._particles = Math.max(0, this._particles - 1);
    if (s.parent) s.parent.remove(s);
    const key = s.userData.poolKey;
    if (!key || this._pooled >= 400) { s.material?.dispose?.(); return; }
    const list = this._pool.get(key) || (this._pool.set(key, []), this._pool.get(key));
    list.push(s); this._pooled++;
  }
  /** Drop every pooled sprite (call when the stage is torn down). */
  clearPool() { for (const list of this._pool.values()) for (const s of list) s.material?.dispose?.(); this._pool.clear(); this._pooled = 0; }

  /** Swap the sprite set at any time (for example once the async texture load finishes). */
  setTextures(textures) {
    if (typeof textures === 'function') this._tex = textures;
    else if (textures instanceof Map) this._tex = id => textures.get(id) || null;
    else if (textures && typeof textures === 'object') this._tex = id => textures[id] || null;
    else this._tex = () => null;
  }
  /** The texture for a sprite id, or null when it has not been loaded. */
  texture(id) { try { return this._tex(id) || null; } catch { return null; } }
  /** Sprite ids this instance can actually draw. */
  hasTexture(id) { return !!this.texture(id); }

  // ---- small builders -------------------------------------------------------------------------

  /** A billboard sprite, or null when the texture is missing. Reused from the pool where possible. */
  _sprite(id, { size = 0.2, color = 0xffffff, opacity = 1, blending = THREE.AdditiveBlending, pooled = false } = {}) {
    const map = this.texture(id); if (!map) return null;
    if (!pooled) {   // one-off sprites (impacts, auras) are owned by their effect and disposed with it
      const m = new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending, depthWrite: false, depthTest: true, toneMapped: false });
      const one = new THREE.Sprite(m); const p0 = size * this.scale; one.scale.set(p0, p0, p0); return one;
    }
    const key = id + '|' + blending;
    const list = this._pool.get(key);
    let s = list && list.length ? list.pop() : null;
    if (s) { this._pooled--; s.material.color.set(color); s.material.opacity = opacity; s.material.rotation = 0; s.visible = true; }
    else {
      const m = new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending, depthWrite: false, depthTest: true, toneMapped: false });
      s = new THREE.Sprite(m); s.userData.poolKey = key;
    }
    const px = size * this.scale; s.scale.set(px, px, px);
    return s;
  }
  /** A flat textured plane (rune discs, cracks, slashes). Falls back to an untextured quad. */
  _plane(id, { size = 0.3, color = 0xffffff, opacity = 1, blending = THREE.AdditiveBlending } = {}) {
    const map = this.texture(id);
    const m = new THREE.MeshBasicMaterial({ map: map || null, color, transparent: true, opacity: map ? opacity : opacity * 0.5, blending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const px = size * this.scale;
    return new THREE.Mesh(new THREE.PlaneGeometry(px, px), m);
  }
  /** Solid additive material for shaped geometry. */
  _basic(color, opacity = 1) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  }
  /** An expanding torus ring. axis: 'ground' (flat on the floor) or 'camera' (faces the viewer). */
  _ring(color, { r = 0.3, tube = 0.02, axis = 'ground', opacity = 0.9 } = {}) {
    const g = new THREE.Mesh(new THREE.TorusGeometry(r * this.scale, tube * this.scale, 8, 40), this._basic(color, opacity));
    if (axis === 'ground') g.rotation.x = -Math.PI / 2;
    g.userData.faceCamera = axis === 'camera';
    return g;
  }

  /**
   * Register a one-shot effect. `step(dt, k, e)` runs each frame; return true to end it early.
   * Over `maxLive` the oldest effect is retired early rather than letting the list grow without
   * bound — its onDone still runs, so anything awaiting it (a projectile's promise) still resolves.
   */
  _add(obj, life, step, onDone = null) {
    if (obj && !obj.parent) this.root.add(obj);
    const e = { obj, life, step, onDone, age: 0 };
    this.live.push(e);
    while (this.live.length > this.maxLive) { this._dropped++; this._end(this.live[0]); }
    return e;
  }
  _end(e) {
    const i = this.live.indexOf(e); if (i >= 0) this.live.splice(i, 1);
    if (e.obj) disposeObj(e.obj);
    if (e.onDone) { const f = e.onDone; e.onDone = null; f(); }
  }

  // ---- projectiles ----------------------------------------------------------------------------

  /**
   * Throw something from one point to another.
   * @returns {Promise<void>} resolves the frame the projectile lands (so a caller can chain an impact).
   */
  projectile({ from, to, element = 'arcane', shape = null, speed = null, arc = null, ms = null, crit = false } = {}) {
    const E = elementOf(element);
    const kind = shape || E.shape;
    const a = from.clone(), b = to.clone();
    if (kind === 'bolt') return this._bolt(a, b, E, crit, ms);

    const dist = Math.max(0.2, a.distanceTo(b));
    const dur = ms != null ? ms / 1000 : clamp(dist / (speed || E.speed), 0.16, 0.45);
    const arcH = (arc != null ? arc : E.arc) * clamp(dist * 0.45, 0.2, 1.1);

    const head = this._head(kind, E, crit);
    const group = new THREE.Group(); group.add(head.group); group.position.copy(a);
    const tids = (E.trail || []).filter(id => this.hasTexture(id));
    const trail = new Trail(this, {
      ids: tids.length ? tids : ['glow'],
      size: kind === 'ribbon' ? 0.2 : 0.15, color: E.accent, life: 0.3, rate: 60, spread: 0.03,
      rise: kind === 'bubbles' ? 0.35 : kind === 'drops' ? -0.5 : 0.05,
    });
    this.root.add(trail.group);

    // fire also smoulders: dark smoke puffs that read against a bright backdrop
    const smoke = kind === 'cone' && this.hasTexture('smoke')
      ? new Trail(this, { ids: ['smoke'], size: 0.22, color: 0x8a8a92, life: 0.55, rate: 14, spread: 0.05, rise: 0.5, blending: THREE.NormalBlending, opacity: 0.5 })
      : null;
    if (smoke) this.root.add(smoke.group);

    const at = t => new THREE.Vector3().lerpVectors(a, b, t).addScaledVector(UP, arcH * 4 * t * (1 - t));
    const wobble = kind === 'ribbon' ? 0.13 : 0;
    const side = new THREE.Vector3().subVectors(b, a).cross(UP).normalize();

    let resolve; const done = new Promise(r => { resolve = r; });
    this._add(group, dur, (dt, k) => {
      const p = at(k);
      if (wobble) p.addScaledVector(side, Math.sin(k * Math.PI * 3.2) * wobble * (1 - k * 0.4));
      group.position.copy(p);
      const dir = at(Math.min(1, k + 0.02)).sub(at(Math.max(0, k - 0.02)));
      if (dir.lengthSq() > 1e-8) group.quaternion.setFromUnitVectors(UP, dir.normalize());
      head.update(dt, this._t, k);
      trail.emit(p, dt); trail.update(dt);
      if (smoke) { smoke.emit(p, dt); smoke.update(dt); }
      return false;
    }, () => {
      // let the tail catch up and fade out on its own
      trail.emitting = false;
      this._add(trail.group, trail.life * 1.3, dt => { trail.update(dt); return trail.count === 0; }, () => trail.dispose());
      if (smoke) { smoke.emitting = false; this._add(smoke.group, smoke.life * 1.4, dt => { smoke.update(dt); return smoke.count === 0; }, () => smoke.dispose()); }
      resolve();
    });
    return done;
  }

  /** Builds the flying body. Everything points along +Y; the caller rotates +Y onto the flight path. */
  _head(kind, E, crit = false) {
    const g = new THREE.Group();
    // heads are drawn a touch larger than life so they still read at fight distance
    const s = (crit ? 1.35 : 1) * 1.4;
    if (kind === 'cone') {
      // a dart of flame: hollow outer cone, brighter inner cone, halo at the base
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s * this.scale, 0.32 * s * this.scale, 12, 1, true), this._basic(E.color, 0.85));
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s * this.scale, 0.22 * s * this.scale, 10), this._basic(E.accent, 0.95));
      outer.position.y = 0.02; inner.position.y = 0.03;
      const halo = this._sprite('glow', { size: 0.24 * s, color: E.color, opacity: 0.55 });
      g.add(outer, inner); if (halo) { halo.position.y = -0.08 * this.scale; g.add(halo); }
      return { group: g, update: (dt, t) => { const f = 1 + Math.sin(t * 34) * 0.14; outer.scale.set(f, 1 + Math.sin(t * 21) * 0.1, f); inner.rotation.y += dt * 9; } };
    }
    if (kind === 'shards') {
      // 3-5 tumbling octahedra in a loose cluster
      const n = 3 + Math.floor(Math.random() * 3); const bits = [];
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(rnd(0.045, 0.075) * s * this.scale, 0), this._basic(i % 2 ? E.accent : E.color, 0.9));
        m.position.set(rnd(-0.07, 0.07), rnd(-0.09, 0.09), rnd(-0.07, 0.07)).multiplyScalar(this.scale);
        m.scale.y = rnd(1.4, 2.4);
        g.add(m); bits.push({ m, ax: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(), sp: rnd(4, 11) });
      }
      return { group: g, update: dt => { for (const b of bits) b.m.rotateOnAxis(b.ax, b.sp * dt); g.rotation.y += dt * 2.5; } };
    }
    if (kind === 'ribbon') {
      // a soul-wisp head with two claws sweeping around it
      const core = this._sprite('wisp', { size: 0.32 * s, color: 0xffffff }) || this._sprite('glow', { size: 0.3 * s, color: E.color });
      if (core) g.add(core);
      const claws = [];
      for (let i = 0; i < 2; i++) { const c = this._sprite('shadow_claw', { size: 0.2 * s, color: 0xffffff, opacity: 0.85 }); if (c) { g.add(c); claws.push(c); } }
      const veil = new THREE.Mesh(new THREE.ConeGeometry(0.1 * s * this.scale, 0.3 * s * this.scale, 8, 1, true), this._basic(E.color, 0.35));
      veil.rotation.x = Math.PI; veil.position.y = -0.12 * this.scale; g.add(veil);
      return { group: g, update: (dt, t) => { claws.forEach((c, i) => { const a = t * 6 + i * Math.PI; c.position.set(Math.cos(a) * 0.15, Math.sin(a * 1.3) * 0.08, Math.sin(a) * 0.15).multiplyScalar(this.scale); c.material.rotation = -a; }); if (core) core.material.rotation = Math.sin(t * 5) * 0.4; } };
    }
    if (kind === 'rune') {
      // a sigil turning as it flies, with a halo behind it and a spearpoint of light in front.
      // Billboards, so the script stays readable from any camera angle (a flat coin would be edge-on).
      const disc = this._sprite('holy_rune', { size: 0.34 * s, color: 0xffffff, opacity: 0.95 });
      const halo = this._sprite('ring', { size: 0.46 * s, color: E.color, opacity: 0.5 });
      if (halo) g.add(halo);
      if (disc) g.add(disc);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s * this.scale, 0.2 * s * this.scale, 8), this._basic(E.accent, 0.9));
      tip.position.y = 0.16 * s * this.scale; g.add(tip);
      return { group: g, update: (dt, t) => {
        if (disc) disc.material.rotation += dt * 5;
        if (halo) { halo.material.rotation -= dt * 2; const k = 1 + Math.sin(t * 12) * 0.09; halo.scale.setScalar(0.46 * s * this.scale * k); }
      } };
    }
    if (kind === 'spiral') {
      // leaves and thorns wound into a helix that drills forward
      const bits = []; const n = 7;
      for (let i = 0; i < n; i++) {
        const sp = this._sprite(i % 3 === 2 ? 'thorn' : 'leaf', { size: 0.17 * s, color: 0xffffff, blending: THREE.NormalBlending });
        if (!sp) continue;
        const a = (i / n) * Math.PI * 3;
        sp.userData.a = a; sp.userData.y = (i / n - 0.5) * 0.3;
        g.add(sp); bits.push(sp);
      }
      const core = this._sprite('glow', { size: 0.2 * s, color: E.color, opacity: 0.5 }); if (core) g.add(core);
      return { group: g, update: (dt, t) => { for (const b of bits) { const a = b.userData.a + t * 8; b.position.set(Math.cos(a) * 0.13, b.userData.y, Math.sin(a) * 0.13).multiplyScalar(this.scale); b.material.rotation = a; } } };
    }
    if (kind === 'helix') {
      // two counter-wound strands of arcane shards around a rune
      const bits = []; const n = 8;
      for (let i = 0; i < n; i++) {
        const sp = this._sprite('arcane_shard', { size: 0.15 * s, color: 0xffffff });
        if (!sp) continue;
        sp.userData.a = (i % 4) / 4 * Math.PI * 2 + (i < 4 ? 0 : Math.PI);
        sp.userData.y = ((i % 4) / 4 - 0.5) * 0.28; sp.userData.dir = i < 4 ? 1 : -1;
        g.add(sp); bits.push(sp);
      }
      const rune = this._plane('arcane_rune', { size: 0.34 * s, color: 0xffffff, opacity: 0.9 });
      rune.rotation.x = -Math.PI / 2; g.add(rune);
      return { group: g, update: (dt, t) => { for (const b of bits) { const a = b.userData.a + t * 7 * b.userData.dir; b.position.set(Math.cos(a) * 0.14, b.userData.y, Math.sin(a) * 0.14).multiplyScalar(this.scale); } rune.rotation.y += dt * 5; } };
    }
    if (kind === 'arrow') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017 * s * this.scale, 0.017 * s * this.scale, 0.46 * s * this.scale, 6), new THREE.MeshBasicMaterial({ color: 0x8a6234, toneMapped: false }));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.042 * s * this.scale, 0.14 * s * this.scale, 6), new THREE.MeshBasicMaterial({ color: 0xdfe4f0, toneMapped: false }));
      tip.position.y = 0.29 * s * this.scale;
      g.add(shaft, tip);
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.09 * s * this.scale, 0.17 * s * this.scale), new THREE.MeshBasicMaterial({ color: 0xe8ecf6, transparent: true, opacity: 0.92, side: THREE.DoubleSide, toneMapped: false }));
        f.position.y = -0.19 * s * this.scale; f.rotation.y = i * Math.PI / 3; g.add(f);
      }
      return { group: g, update: dt => { g.rotation.y += dt * 3; } };
    }
    if (kind === 'axe') {
      // two crossing blades, tumbling end over end
      const blades = [];
      for (let i = 0; i < 2; i++) {
        const b = this._plane('slash', { size: 0.36 * s, color: 0xd8dcea, opacity: 0.95, blending: THREE.NormalBlending });
        b.rotation.z = i * Math.PI / 2; g.add(b); blades.push(b);
      }
      return { group: g, update: dt => { g.rotation.y += dt * 22; for (const b of blades) b.rotation.z += dt * 6; } };
    }
    if (kind === 'bubbles') {
      const core = this._sprite('bubble', { size: 0.26 * s, color: 0xffffff, blending: THREE.NormalBlending, opacity: 0.9 }) || this._sprite('glow', { size: 0.24, color: E.color });
      if (core) g.add(core);
      const small = [];
      for (let i = 0; i < 3; i++) { const b = this._sprite('bubble', { size: 0.13 * s, color: 0xffffff, blending: THREE.NormalBlending, opacity: 0.8 }); if (b) { g.add(b); small.push(b); } }
      return { group: g, update: (dt, t) => { small.forEach((b, i) => { const a = t * 5 + i * 2.1; b.position.set(Math.cos(a) * 0.13, Math.sin(a * 1.7) * 0.1, Math.sin(a) * 0.13).multiplyScalar(this.scale); }); if (core) core.scale.setScalar((0.26 * s * this.scale) * (1 + Math.sin(t * 14) * 0.08)); } };
    }
    if (kind === 'drops') {
      const core = this._sprite('drop', { size: 0.22 * s, color: 0xffffff, blending: THREE.NormalBlending }) || this._sprite('glow', { size: 0.2, color: E.color });
      if (core) g.add(core);
      const small = [];
      for (let i = 0; i < 3; i++) { const d = this._sprite('drop', { size: 0.11 * s, color: 0xffffff, blending: THREE.NormalBlending, opacity: 0.85 }); if (d) { g.add(d); small.push(d); } }
      return { group: g, update: (dt, t) => { small.forEach((d, i) => { const a = t * 4 + i * 2.1; d.position.set(Math.cos(a) * 0.1, -0.06 - i * 0.05, Math.sin(a) * 0.1).multiplyScalar(this.scale); }); } };
    }
    // fallback: a tumbling shard so nothing is ever a featureless ball
    const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.09 * s * this.scale), this._basic(E.color, 0.9));
    g.add(m);
    return { group: g, update: dt => { m.rotation.x += dt * 6; m.rotation.y += dt * 9; } };
  }

  /** Lightning: a jagged polyline re-drawn a handful of times, then sparks at the far end. */
  _bolt(a, b, E, crit = false, ms = null) {
    const SEG = 14, LINES = 3;
    const group = new THREE.Group();
    const lines = [];
    for (let i = 0; i < LINES; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
      const mat = new THREE.LineBasicMaterial({ color: i === 0 ? E.accent : E.color, transparent: true, opacity: i === 0 ? 1 : 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const line = new THREE.Line(geo, mat); line.frustumCulled = false; group.add(line); lines.push(line);
    }
    const motes = [];
    for (let i = 0; i < 5; i++) { const s = this._sprite('bolt', { size: 0.22, color: 0xffffff, opacity: 0.9 }); if (s) { group.add(s); motes.push(s); } }

    const dir = new THREE.Vector3().subVectors(b, a);
    const side = dir.clone().cross(UP).normalize();
    const up2 = dir.clone().cross(side).normalize();
    const jitter = (crit ? 0.16 : 0.11) * clamp(dir.length() * 0.4, 0.4, 1.4);
    const scatter = () => {
      for (const line of lines) {
        const pos = line.geometry.attributes.position;
        for (let i = 0; i <= SEG; i++) {
          const t = i / SEG;
          const p = new THREE.Vector3().lerpVectors(a, b, t);
          const w = Math.sin(t * Math.PI) * jitter;
          p.addScaledVector(side, rnd(-w, w)).addScaledVector(up2, rnd(-w, w));
          pos.setXYZ(i, p.x, p.y, p.z);
        }
        pos.needsUpdate = true; line.geometry.computeBoundingSphere();
      }
      motes.forEach((m, i) => { const t = 0.25 + (i / motes.length) * 0.7; m.position.lerpVectors(a, b, t).addScaledVector(side, rnd(-jitter, jitter)).addScaledVector(up2, rnd(-jitter, jitter)); m.material.rotation = rnd(0, 6.28); });
    };
    scatter();

    const life = ms != null ? ms / 1000 : 0.26; let next = 0, frames = 0;
    let resolve; const done = new Promise(r => { resolve = r; });
    this._add(group, life, (dt, k) => {
      next -= dt;
      if (next <= 0 && frames < 8) { scatter(); frames++; next = life / 8; }
      for (const l of lines) l.material.opacity = (1 - k) * (l === lines[0] ? 1 : 0.6);
      for (const m of motes) m.material.opacity = 1 - k;
      return false;
    }, () => resolve());
    return done;
  }

  // ---- impacts --------------------------------------------------------------------------------

  /** A burst where a spell lands. Returns immediately; the effect cleans itself up. */
  impact({ at, element = 'arcane', crit = false, scale = 1, height = 1.8 } = {}) {
    const E = elementOf(element);
    const p = at.clone();
    const s = scale * (crit ? 1.5 : 1) * 1.25;
    const kind = E.impact;
    const bodyH = Math.max(0.4, height);

    const floor = v => new THREE.Vector3(v.x, 0.02, v.z);   // decals lie on the stage floor (y = 0)

    if (kind === 'fire') {
      this._expandRing(p, E.color, { r0: 0.1 * s, r1: 0.8 * s, life: 0.4, axis: 'camera', tube: 0.035 * s });
      this._burst(p, { ids: ['flame', 'ember'], n: Math.round(16 * s), color: 0xffffff, size: 0.2 * s, speed: 2.1 * s, life: 0.46, gravity: -1.2 });
      this._puff(p, { n: Math.round(4 * s), color: 0x9a8a80, size: 0.3 * s, life: 0.7 });
      this._expandRing(floor(p), E.accent, { r0: 0.1, r1: 0.55 * s, life: 0.45, axis: 'ground', tube: 0.02, opacity: 0.55 });
    } else if (kind === 'ice') {
      this._discFlash(p, 'frost_ring', 0xffffff, { size: 0.8 * s, life: 0.4, spin: 2, ground: false, opacity: 0.9 });
      this._expandRing(p, E.accent, { r0: 0.08 * s, r1: 0.6 * s, life: 0.35, axis: 'camera', tube: 0.022 * s });
      this._shardSpray(p, E, s);
    } else if (kind === 'shadow') {
      this._converge(p, { ids: ['shadow_claw'], n: Math.round(6 * s), color: 0xffffff, size: 0.32 * s, from: 0.8 * s, life: 0.36 });
      this._riser(p, { id: 'skull', color: 0xffffff, size: 0.34 * s, rise: 0.55, life: 0.6 });
      this._expandRing(p, E.color, { r0: 0.55 * s, r1: 0.06, life: 0.3, axis: 'camera', tube: 0.025, opacity: 0.8 });
    } else if (kind === 'holy') {
      this._discFlash(floor(p), 'holy_rune', 0xffffff, { size: 1.0 * s, life: 0.5, spin: -1.6, ground: true, opacity: 0.85 });
      this._burst(p, { ids: ['holy_mote', 'feather'], n: Math.round(13 * s), color: 0xffffff, size: 0.17 * s, speed: 1.1 * s, life: 0.65, gravity: 1.4, upward: true });
      this._expandRing(p, E.accent, { r0: 0.05, r1: 0.7 * s, life: 0.4, axis: 'camera', tube: 0.02 });
    } else if (kind === 'nature') {
      this._burst(p, { ids: ['leaf', 'thorn'], n: Math.round(15 * s), color: 0xffffff, size: 0.21 * s, speed: 1.8 * s, life: 0.75, gravity: -0.9, blending: THREE.NormalBlending, spin: 7 });
      this._expandRing(floor(p), E.color, { r0: 0.08, r1: 0.6 * s, life: 0.45, axis: 'ground', tube: 0.022 });
      this._expandRing(p, E.accent, { r0: 0.06, r1: 0.45 * s, life: 0.3, axis: 'camera', tube: 0.018, opacity: 0.7 });
    } else if (kind === 'arcane') {
      this._expandRing(p, E.color, { r0: 0.06, r1: 0.7 * s, life: 0.35, axis: 'camera', tube: 0.022 });
      this._discFlash(floor(p), 'arcane_rune', 0xffffff, { size: 0.85 * s, life: 0.45, spin: 3, ground: true, opacity: 0.8 });
      this._burst(p, { ids: ['arcane_shard', 'spark'], n: Math.round(13 * s), color: 0xffffff, size: 0.18 * s, speed: 2.0 * s, life: 0.45, gravity: -0.5, spin: 9 });
    } else if (kind === 'lightning') {
      this._burst(p, { ids: ['spark', 'bolt'], n: Math.round(16 * s), color: 0xffffff, size: 0.19 * s, speed: 3.2 * s, life: 0.3, gravity: -2 });
      this._discFlash(floor(p), 'crack', 0xfff0b0, { size: 0.7 * s, life: 0.5, spin: 0, ground: true, world: true, opacity: 0.5 });
      this._expandRing(floor(p), E.accent, { r0: 0.05, r1: 0.8 * s, life: 0.28, axis: 'ground', tube: 0.018 });
    } else if (kind === 'poison') {
      this._discFlash(p, 'glow', E.color, { size: 0.95 * s, life: 0.4, spin: 1.5, ground: false, opacity: 0.75 });   // the splash
      this._burst(p, { ids: ['bubble'], n: Math.round(20 * s), color: 0xffffff, size: 0.26 * s, speed: 1.5 * s, life: 0.85, gravity: 0.9, blending: THREE.NormalBlending, upward: true });
      this._expandRing(p, E.accent, { r0: 0.07 * s, r1: 0.6 * s, life: 0.34, axis: 'camera', tube: 0.022 * s });
      this._expandRing(floor(p), E.color, { r0: 0.06, r1: 0.6 * s, life: 0.5, axis: 'ground', tube: 0.024, opacity: 0.8 });
    } else if (kind === 'bleed') {
      this._burst(p, { ids: ['drop'], n: Math.round(13 * s), color: 0xffffff, size: 0.17 * s, speed: 1.9 * s, life: 0.55, gravity: -3.2, blending: THREE.NormalBlending });
      this._crossSlashes(p, 0xff6060, s, 2, bodyH * 0.5);
    } else { // physical
      this._crossSlashes(p, 0xffffff, s, crit ? 3 : 2, bodyH * 0.62);
      this._burst(p, { ids: ['spark'], n: Math.round(11 * s), color: 0xffffff, size: 0.16 * s, speed: 2.4 * s, life: 0.3, gravity: -2.5 });
      this._puff(floor(p), { n: 5, color: 0xa39a8e, size: 0.42 * s, life: 0.7 });
    }
    if (crit) {
      // a second, wider shockwave a beat later so a crit reads as bigger
      const holder = new THREE.Object3D();
      this._add(holder, 0.11, () => false, () => this._expandRing(p, E.accent, { r0: 0.1 * s, r1: 0.55 * s, life: 0.4, axis: 'camera', tube: 0.022 * s }));
    }
  }

  /** Several impacts at once (a zone skill). */
  aoe({ points = [], element = 'arcane', crit = false, stagger = 0.05 } = {}) {
    points.forEach((pt, i) => {
      if (!i) return this.impact({ at: pt, element, crit });
      const holder = new THREE.Object3D();
      this._add(holder, i * stagger, () => false, () => this.impact({ at: pt, element, crit }));
    });
  }

  // ---- impact building blocks ------------------------------------------------------------------

  _expandRing(at, color, { r0 = 0.1, r1 = 0.7, life = 0.4, axis = 'ground', tube = 0.03, opacity = 1 } = {}) {
    // the mesh is a unit torus scaled each frame, so the tube is sized against the widest radius:
    // the ring starts as a thin hoop and thickens slightly as it opens, instead of ballooning.
    const ring = this._ring(color, { r: 1, tube: tube / Math.max(0.05, Math.max(r0, r1)), axis, opacity });
    ring.scale.setScalar(r0); ring.position.copy(at);
    this._add(ring, life, (dt, k) => {
      const e = 1 - Math.pow(1 - k, 2);
      ring.scale.setScalar(r0 + (r1 - r0) * e);
      ring.material.opacity = opacity * (1 - k);
      if (axis === 'camera' && this.camera) ring.quaternion.copy(this.camera.quaternion);
      return false;
    });
    return ring;
  }

  _burst(at, { ids = ['spark'], n = 10, color = 0xffffff, size = 0.16, speed = 2, life = 0.45, gravity = -2, blending = THREE.AdditiveBlending, spin = 4, upward = false } = {}) {
    const g = new THREE.Group(); g.position.copy(at);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const s = this._sprite(pick(ids), { size: size * rnd(0.7, 1.3), color, blending });
      if (!s) continue;
      const dir = new THREE.Vector3(rnd(-1, 1), upward ? rnd(0.4, 1.4) : rnd(-0.5, 1), rnd(-1, 1)).normalize();
      s.material.rotation = rnd(0, 6.28);
      g.add(s);
      parts.push({ s, v: dir.multiplyScalar(speed * rnd(0.5, 1.2) * this.scale), base: s.scale.x, spin: rnd(-spin, spin), life: life * rnd(0.7, 1.2), age: 0 });
    }
    if (!parts.length) return null;
    return this._add(g, life * 1.25, dt => {
      let alive = 0;
      for (const p of parts) {
        p.age += dt; const k = clamp(p.age / p.life, 0, 1);
        if (k >= 1) { p.s.visible = false; continue; }
        alive++;
        p.v.y += gravity * dt;
        p.s.position.addScaledVector(p.v, dt);
        p.s.material.rotation += p.spin * dt;
        p.s.material.opacity = 1 - k * k;
        const sc = p.base * (1 - k * 0.6);
        p.s.scale.set(sc, sc, sc);
      }
      return alive === 0;
    });
  }

  /** Sprites flying inward from a ring toward the point (shadow claws closing on a body). */
  _converge(at, { ids = ['shadow_claw'], n = 6, color = 0xffffff, size = 0.3, from = 0.8, life = 0.35 } = {}) {
    const g = new THREE.Group(); g.position.copy(at);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const s = this._sprite(pick(ids), { size, color });
      if (!s) continue;
      const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2);
      const dirv = new THREE.Vector3(Math.cos(a), rnd(-0.3, 0.5), Math.sin(a));
      s.material.rotation = -a;
      g.add(s); parts.push({ s, dirv, base: s.scale.x });
    }
    if (!parts.length) return null;
    return this._add(g, life, (dt, k) => {
      for (const p of parts) {
        const d = from * (1 - k) * this.scale;
        p.s.position.copy(p.dirv).multiplyScalar(d);
        p.s.material.opacity = Math.min(1, k * 3) * (1 - Math.pow(k, 3));
        const sc = p.base * (0.6 + k * 0.7); p.s.scale.set(sc, sc, sc);
      }
      return false;
    });
  }

  /** One sprite lifting out of a body and fading (a skull leaving the dead). */
  _riser(at, { id = 'holy_mote', color = 0xffffff, size = 0.3, rise = 0.5, life = 0.6, spin = 0 } = {}) {
    const s = this._sprite(id, { size, color });
    if (!s) return null;
    s.position.copy(at);
    return this._add(s, life, (dt, k) => {
      s.position.y = at.y + rise * k * this.scale;
      s.material.opacity = k < 0.25 ? k * 4 : 1 - (k - 0.25) / 0.75;
      s.material.rotation += spin * dt;
      return false;
    });
  }

  /** A textured disc that flashes and spins: ground runes, frost rings, cracks. */
  _discFlash(at, id, color, { size = 0.9, life = 0.45, spin = 2, ground = true, world = false, opacity = 1 } = {}) {
    const m = this._plane(id, { size, color, opacity });
    m.position.copy(at); if (world) m.position.y = 0.015;
    if (ground) m.rotation.x = -Math.PI / 2;
    else if (this.camera) m.quaternion.copy(this.camera.quaternion);
    m.scale.setScalar(0.4);
    return this._add(m, life, (dt, k) => {
      m.scale.setScalar(0.4 + 0.9 * (1 - Math.pow(1 - k, 3)));
      m.material.opacity = opacity * (k < 0.2 ? k * 5 : 1 - (k - 0.2) / 0.8);
      m.rotation.z += spin * dt;
      if (!ground && this.camera) m.quaternion.copy(this.camera.quaternion);
      return false;
    });
  }

  /** Ice impact: shards thrown out plus a brief hex plate standing where the spell hit. */
  _shardSpray(at, E, s = 1) {
    const g = new THREE.Group(); g.position.copy(at);
    const bits = [];
    for (let i = 0; i < Math.round(7 * s); i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(rnd(0.035, 0.06) * s * this.scale), this._basic(i % 2 ? E.accent : E.color, 0.95));
      m.scale.y = rnd(1.6, 3);
      const dir = new THREE.Vector3(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize();
      g.add(m); bits.push({ m, v: dir.multiplyScalar(rnd(1.2, 2.6) * s * this.scale), ax: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize(), sp: rnd(5, 14) });
    }
    const hex = new THREE.Mesh(new THREE.CircleGeometry(0.22 * s * this.scale, 6), this._basic(E.accent, 0.45));
    if (this.camera) hex.quaternion.copy(this.camera.quaternion);
    g.add(hex);
    this._add(g, 0.5, (dt, k) => {
      for (const b of bits) { b.v.y -= 4 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotateOnAxis(b.ax, b.sp * dt); b.m.material.opacity = 1 - k; }
      hex.scale.setScalar(0.5 + k * 1.4); hex.material.opacity = 0.55 * (1 - k * 1.6 > 0 ? 1 - k * 1.6 : 0);
      if (this.camera) hex.quaternion.copy(this.camera.quaternion);
      return false;
    });
  }

  /** Two or three slash sprites crossing the target (a weapon hit). */
  _crossSlashes(at, color, s = 1, n = 2, size = 0.75) {
    for (let i = 0; i < n; i++) {
      const m = this._plane('slash', { size: size * s, color, opacity: 1, blending: THREE.AdditiveBlending });
      m.position.copy(at).add(new THREE.Vector3(rnd(-0.07, 0.07), rnd(-0.07, 0.07), 0.02 + i * 0.01));
      if (this.camera) m.quaternion.copy(this.camera.quaternion);
      m.rotateZ(i === 0 ? rnd(-0.5, 0.2) : rnd(2.2, 3.0));
      const delay = i * 0.07;
      this._add(m, 0.3 + delay, (dt, k) => {
        const kk = clamp((k * (0.3 + delay) - delay) / 0.3, 0, 1);
        m.visible = kk > 0;
        m.material.opacity = kk < 0.25 ? kk * 4 : 1 - (kk - 0.25) / 0.75;
        m.scale.setScalar(0.8 + kk * 0.5);
        return false;
      });
    }
  }

  /** Dark, non-additive smoke so it reads against a bright backdrop. */
  _puff(at, { n = 4, color = 0x8a8a92, size = 0.3, life = 0.7 } = {}) {
    const g = new THREE.Group(); g.position.copy(at);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const s = this._sprite('smoke', { size: size * rnd(0.7, 1.3), color, blending: THREE.NormalBlending, opacity: 0.55 });
      if (!s) continue;
      s.position.set(rnd(-0.1, 0.1), rnd(-0.05, 0.1), rnd(-0.1, 0.1));
      g.add(s); parts.push({ s, v: new THREE.Vector3(rnd(-0.3, 0.3), rnd(0.4, 0.9), rnd(-0.3, 0.3)), base: s.scale.x, spin: rnd(-1.5, 1.5) });
    }
    if (!parts.length) return null;
    return this._add(g, life, (dt, k) => {
      for (const p of parts) {
        p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * 1.2);
        p.s.material.rotation += p.spin * dt;
        p.s.material.opacity = 0.55 * (1 - k);
        const sc = p.base * (1 + k * 1.1); p.s.scale.set(sc, sc, sc);
      }
      return false;
    });
  }

  // ---- casts, heals, revives -------------------------------------------------------------------

  /** A brief flare at the caster while a spell is being spoken: a rune on the floor and motes rising. */
  cast({ at, element = 'arcane', ms = 380 } = {}) {
    const E = elementOf(element);
    const p = at.clone();
    const runeId = element === 'holy' ? 'holy_rune' : this.hasTexture('arcane_rune') ? 'arcane_rune' : 'ring';
    const disc = this._plane(runeId, { size: 1.0, color: E.accent, opacity: 0.95 });
    disc.rotation.x = -Math.PI / 2; disc.position.copy(p).setY(0.02);
    const life = ms / 1000;
    this._add(disc, life, (dt, k) => {
      disc.rotation.z += dt * 3.4;
      disc.scale.setScalar(0.5 + 0.7 * Math.min(1, k * 2));
      disc.material.opacity = k < 0.3 ? k * 3 : 1 - (k - 0.3) / 0.7;
      return false;
    });
    const motes = (E.trail || []).filter(id => this.hasTexture(id));
    this._burst(p.clone().setY(p.y + 0.1), { ids: motes.length ? motes : ['glow'], n: 7, color: 0xffffff, size: 0.15, speed: 0.7, life: life * 1.4, gravity: 1.6, upward: true });
    this._expandRing(p.clone().setY(0.03), E.color, { r0: 0.55, r1: 0.12, life, axis: 'ground', tube: 0.02, opacity: 0.8 });
    return new Promise(r => setTimeout(r, ms));
  }

  /** Green-gold motes spiralling up out of the ground with a ring at the feet. */
  heal({ at, color = 0x9ada70 } = {}) {
    const p = at.clone();
    this._expandRing(p.clone().setY(0.03), color, { r0: 0.08, r1: 0.55, life: 0.55, axis: 'ground', tube: 0.022 });
    const g = new THREE.Group(); g.position.copy(p);
    const ids = ['holy_mote', 'leaf'].filter(id => this.hasTexture(id));
    const parts = [];
    for (let i = 0; i < 12; i++) {
      const s = this._sprite(ids.length ? pick(ids) : 'glow', { size: rnd(0.11, 0.18), color: 0xffffff });
      if (!s) continue;
      g.add(s); parts.push({ s, a: rnd(0, 6.28), r: rnd(0.12, 0.34), y0: rnd(-0.05, 0.25), sp: rnd(1.6, 3.2), base: s.scale.x, delay: rnd(0, 0.25) });
    }
    if (!parts.length) return;
    this._add(g, 0.95, (dt, k) => {
      for (const p2 of parts) {
        const kk = clamp((k * 0.95 - p2.delay) / 0.7, 0, 1);
        p2.a += p2.sp * dt;
        p2.s.position.set(Math.cos(p2.a) * p2.r * this.scale, (p2.y0 + kk * 1.25) * this.scale, Math.sin(p2.a) * p2.r * this.scale);
        p2.s.material.opacity = kk <= 0 ? 0 : (1 - kk) * (kk < 0.15 ? kk / 0.15 : 1);
        const sc = p2.base * (1 - kk * 0.5); p2.s.scale.set(sc, sc, sc);
      }
      return false;
    });
  }

  /** A pillar of light: rings climbing the body, feathers and runes on the way up. */
  revive({ at } = {}) {
    const p = at.clone();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * this.scale, 0.42 * this.scale, 1.9 * this.scale, 18, 1, true), this._basic(0xfff2c0, 0.35));
    col.position.copy(p).setY(0.95 * this.scale);
    this._add(col, 0.9, (dt, k) => { col.material.opacity = 0.4 * (1 - k); col.rotation.y += dt * 1.2; col.scale.set(1 + k * 0.25, 1, 1 + k * 0.25); return false; });
    for (let i = 0; i < 3; i++) {
      const ring = this._ring(0xffe6a0, { r: 0.38, tube: 0.018, axis: 'ground' });
      ring.position.copy(p);
      const delay = i * 0.16;
      this._add(ring, 0.9, (dt, k) => {
        const kk = clamp((k * 0.9 - delay) / 0.55, 0, 1);
        ring.visible = kk > 0;
        ring.position.y = p.y + kk * 1.7 * this.scale;
        ring.scale.setScalar(1.2 - kk * 0.6);
        ring.material.opacity = 1 - kk;
        return false;
      });
    }
    this._burst(p.clone().setY(p.y + 0.15), { ids: ['feather', 'holy_mote'], n: 12, color: 0xffffff, size: 0.18, speed: 0.8, life: 1.0, gravity: 1.1, upward: true, spin: 3 });
    this._discFlash(p.clone().setY(0.02), 'holy_rune', 0xffffff, { size: 1.1, life: 0.7, spin: -2, ground: true });
  }

  // ---- status auras -----------------------------------------------------------------------------

  /**
   * Turn a looping aura on or off on a body. The aura is parented to the body, so it follows it
   * around the stage for free. Calling it twice with the same type is safe.
   * @param {THREE.Object3D} target  the character group
   * @param {string} type            a STATUS_FX key (unknown names get a plain circling mote)
   * @param {boolean} on
   */
  status(target, type, on = true) {
    if (!target) return null;
    if (!on) return this.clearStatus(target, type);
    const key = target.uuid;
    let m = this._statuses.get(key);
    if (!m) this._statuses.set(key, m = new Map());
    if (m.has(type)) return m.get(type);
    const h = this._buildStatus(target, type);
    if (!h) return null;
    target.add(h.group);
    m.set(type, h);
    return h;
  }

  /** Which auras are currently running on a body. */
  statusesOn(target) { const m = target && this._statuses.get(target.uuid); return m ? [...m.keys()] : []; }

  /** Remove one aura (type given) or every aura on a body (type omitted). */
  clearStatus(target, type = null) {
    if (!target) return;
    const m = this._statuses.get(target.uuid);
    if (!m) return;
    for (const [t, h] of [...m]) {
      if (type && t !== type) continue;
      disposeObj(h.group);
      m.delete(t);
    }
    if (!m.size) this._statuses.delete(target.uuid);
  }
  /** Alias so game code can read `clearStatuses(body)`. */
  clearStatuses(target) { this.clearStatus(target, null); }

  /** A one-off pulse of an existing aura, for a damage-over-time tick. */
  pulseStatus(target, type) {
    const m = target && this._statuses.get(target.uuid);
    const h = m && m.get(type);
    if (h) h.pulse = 1;
    return h;
  }

  _buildStatus(target, type) {
    const S = statusFxOf(type);
    const h = bodyHeight(target);
    const g = new THREE.Group();
    const ids = S.sprites.filter(id => this.hasTexture(id));
    const use = ids.length ? ids : ['glow'];
    const tint = 0xffffff;
    const parts = [];
    const style = S.style;
    const headY = h * 0.86, aboveY = h + 0.16, midY = h * 0.5;
    // R is how far out particles orbit: wide enough to clear a robe or a big creature's body.
    // Both R and the glyph size follow the body's height, so a rat and a dragon both look right.
    const R = Math.max(0.2, h * 0.2);
    // auras are drawn a little oversized: at fight distance a life-size glyph disappears
    const SZ = 1.4 * clamp(h / 1.8, 0.55, 1.4);
    const sprite = (id, size, opacity = 1, blending = THREE.AdditiveBlending) => this._sprite(id, { size: size * SZ, color: tint, opacity, blending });

    if (style === 'lick') {                       // flames climbing the whole body, embers trickling off
      const flameId = use.find(id => id !== 'ember') || use[0];
      for (let i = 0; i < 7; i++) {
        const s = sprite(flameId, rnd(0.24, 0.34)); if (!s) continue;
        g.add(s); parts.push({ s, a: (i / 7) * 6.28, r: rnd(R * 0.85, R * 1.15), off: i / 7 + rnd(-0.06, 0.06), sp: rnd(0.8, 1.3), base: s.scale.x, rise: h * 0.95 });
      }
      for (let i = 0; i < 5; i++) {               // faint embers drifting up past the flames
        const s = sprite(this.hasTexture('ember') ? 'ember' : flameId, rnd(0.1, 0.15), 0.8); if (!s) continue;
        g.add(s); parts.push({ s, a: rnd(0, 6.28), r: rnd(R * 0.9, R * 1.5), off: rnd(0, 1), sp: rnd(0.45, 0.75), base: s.scale.x, rise: h * 1.25, ember: true });
      }
      return this._statusHandle(g, parts, (dt, t, p) => {
        const k = (t * p.sp + p.off) % 1;
        const spin = p.ember ? t * 0.5 : t * 1.2;
        p.s.position.set(Math.cos(p.a + spin) * p.r, 0.1 + k * p.rise, Math.sin(p.a + spin) * p.r);
        p.s.material.opacity = p.ember ? Math.sin(k * Math.PI) * 0.8 : (1 - k * 0.85) * 0.95;
        p.s.material.rotation = p.ember ? t * 2 : 0;
        const sc = p.base * (p.ember ? 1 - k * 0.4 : 1.2 - k * 0.65); p.s.scale.set(sc, sc, sc);
      }, S);
    }
    if (style === 'rise') {                       // bubbles / motes floating up out of the body
      const fizzy = type === 'poison';            // poison wants a thick, obvious stream of bubbles
      const n = fizzy ? 11 : 8;
      for (let i = 0; i < n; i++) {
        const s = sprite(pick(use), fizzy ? rnd(0.22, 0.34) : rnd(0.16, 0.23), 1, fizzy ? THREE.NormalBlending : THREE.AdditiveBlending); if (!s) continue;
        g.add(s); parts.push({ s, a: rnd(0, 6.28), r: rnd(R * 0.6, R * 1.15), off: rnd(0, 1), sp: rnd(0.5, 0.9), base: s.scale.x });
      }
      return this._statusHandle(g, parts, (dt, t, p) => {
        const k = (t * p.sp + p.off) % 1;
        p.s.position.set(Math.cos(p.a + k * 2) * p.r, 0.08 + k * h, Math.sin(p.a + k * 2) * p.r);
        p.s.material.opacity = Math.sin(k * Math.PI) * 0.95;
      }, S);
    }
    if (style === 'fall') {                       // drops running down the body
      for (let i = 0; i < 8; i++) {
        const s = sprite(pick(use), rnd(0.12, 0.17), 1, THREE.NormalBlending); if (!s) continue;
        g.add(s); parts.push({ s, a: rnd(0, 6.28), r: rnd(R * 0.65, R * 0.95), off: rnd(0, 1), sp: rnd(0.7, 1.2), base: s.scale.x });
      }
      return this._statusHandle(g, parts, (dt, t, p) => {
        const k = (t * p.sp + p.off) % 1;
        p.s.position.set(Math.cos(p.a) * p.r, h * 0.7 - k * h * 0.68, Math.sin(p.a) * p.r);
        p.s.material.opacity = Math.min(1, (1 - k) * 2.2);
      }, S);
    }
    if (style === 'shell') {                      // ice shards locked around the body
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(rnd(0.07, 0.11) * clamp(h / 1.8, 0.5, 1.5) * this.scale), this._basic(i % 2 ? 0xe8f8ff : S.color, 0.8));
        m.scale.y = rnd(1.8, 3.2);
        const a = (i / 7) * 6.28, r = R * 0.9;
        m.position.set(Math.cos(a) * r, 0.15 + (i / 7) * h * 0.8, Math.sin(a) * r);
        m.rotation.set(rnd(-0.6, 0.6), a, rnd(-0.6, 0.6));
        g.add(m); parts.push({ s: m, a, base: 1 });
      }
      const frost = this._plane('frost_ring', { size: Math.max(0.45, h * 0.55), color: 0xffffff, opacity: 0.55 });
      frost.rotation.x = -Math.PI / 2; frost.position.y = 0.02; g.add(frost);
      return this._statusHandle(g, parts, (dt, t, p) => { p.s.material.opacity = 0.6 + Math.sin(t * 3 + p.a) * 0.2; }, S, (dt, t) => { frost.rotation.z += dt * 0.6; });
    }
    if (style === 'orbit') {                      // sprites circling the head (or the chest)
      const head = S.where === 'head';
      const y = head ? headY + 0.12 : midY;
      const orbitR = head ? R * 0.9 : R * 1.4;    // a chest orbit has to clear the body itself
      for (let i = 0; i < 3; i++) {
        const s = sprite(use[i % use.length], 0.26); if (!s) continue;
        g.add(s); parts.push({ s, a: (i / 3) * 6.28, r: orbitR, y, base: s.scale.x });
      }
      let band = null;
      if (S.ring) {                               // a faint hoop tying the orbit together
        band = new THREE.Mesh(new THREE.TorusGeometry(orbitR * this.scale, 0.014 * this.scale, 8, 28), this._basic(S.color, 0.5));
        band.rotation.x = -Math.PI / 2 + 0.35; band.position.y = y; g.add(band);
      }
      return this._statusHandle(g, parts, (dt, t, p) => {
        const a = p.a + t * 3;
        p.s.position.set(Math.cos(a) * p.r, p.y + Math.sin(a * 2) * 0.04, Math.sin(a) * p.r);
        p.s.material.rotation = a * 0.5;
        p.s.material.opacity = 0.7 + Math.sin(a) * 0.3;
      }, S, band ? (dt, t) => { band.rotation.z += dt * 1.4; band.material.opacity = 0.3 + Math.sin(t * 2.5) * 0.15; } : null);
    }
    if (style === 'drift') {                      // zzz letters floating off the head
      for (let i = 0; i < 3; i++) {
        const s = sprite(use[0], 0.2); if (!s) continue;
        g.add(s); parts.push({ s, off: i / 3, base: s.scale.x });
      }
      return this._statusHandle(g, parts, (dt, t, p) => {
        const k = (t * 0.55 + p.off) % 1;
        p.s.position.set(R * 0.4 + k * R * 0.7, headY + h * 0.07 + k * h * 0.28, R * 0.35);
        p.s.material.opacity = Math.sin(k * Math.PI);
        const sc = p.base * (0.7 + k * 0.6); p.s.scale.set(sc, sc, sc);
      }, S);
    }
    if (style === 'disc') {                       // a halo above the head: tilted so it is never edge-on
      const y0 = headY + 0.18, tilt = -Math.PI / 2 + 0.45;   // ~26 degrees off flat
      const rad = Math.max(0.17, h * 0.2);
      const d = this._plane(use[0], { size: rad * 2.1, color: S.color, opacity: 0.9 });
      d.rotation.x = tilt; d.position.y = y0; g.add(d);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(rad * this.scale, 0.022 * this.scale, 8, 30), this._basic(S.color, 0.85));
      hoop.rotation.x = tilt; hoop.position.y = y0; g.add(hoop);
      for (let i = 0; i < 3; i++) {               // motes riding the hoop so it reads as movement
        const m = sprite(this.hasTexture('spark') ? 'spark' : 'glow', 0.15, 0.9); if (!m) continue;
        g.add(m); parts.push({ s: m, a: (i / 3) * 6.28, r: rad, y: y0, base: m.scale.x });
      }
      return this._statusHandle(g, parts, (dt, t, p) => {
        const a = p.a + t * 2.6;
        p.s.position.set(Math.cos(a) * p.r, p.y + Math.sin(a) * p.r * 0.45, Math.sin(a) * p.r * 0.5);
        p.s.material.opacity = 0.55 + Math.sin(a) * 0.4;
      }, S, (dt, t) => {
        d.rotation.z += dt * 2.2; hoop.rotation.z += dt * 2.2;
        d.position.y = hoop.position.y = y0 + Math.sin(t * 2) * 0.03;
        d.material.opacity = 0.55 + Math.sin(t * 4) * 0.25;
        hoop.material.opacity = 0.7 + Math.sin(t * 4) * 0.25;
      });
    }
    if (style === 'stick') {                      // a sprite pinned to the face or body
      const spots = S.where === 'face'
        ? [[0, headY, h * 0.17]]
        : [[R * 0.45, midY + h * 0.07, R * 0.6], [-R * 0.5, midY - h * 0.03, R * 0.55], [R * 0.05, midY + h * 0.16, R * 0.62]].slice(0, type === 'disarm' ? 1 : 3);
      spots.forEach((sp, i) => {
        const s = sprite(use[i % use.length], S.where === 'face' ? 0.32 : 0.24, 0.95, S.where === 'face' ? THREE.NormalBlending : THREE.AdditiveBlending);
        if (!s) return;
        s.position.set(sp[0], sp[1], sp[2]); g.add(s); parts.push({ s, off: i * 0.4, base: s.scale.x });
      });
      let band = null;
      if (S.where === 'face') {                   // a blindfold: the glyph alone is lost at fight distance
        band = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.3 * this.scale, h * 0.075 * this.scale),
          new THREE.MeshBasicMaterial({ color: 0x100c18, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
        band.position.set(0, headY + h * 0.012, h * 0.165); g.add(band);
      }
      return this._statusHandle(g, parts, (dt, t, p) => { p.s.material.opacity = 0.7 + Math.sin(t * 5 + p.off * 6) * 0.3; }, S,
        band ? (dt, t) => { band.material.opacity = 0.78 + Math.sin(t * 3) * 0.08; } : null);
    }
    if (style === 'pulse') {                      // arrows sliding down beside the body
      for (let i = 0; i < 3; i++) {
        const s = sprite(use[0], 0.2); if (!s) continue;
        g.add(s); parts.push({ s, off: i / 3, x: [R, -R, 0][i], z: [R * 0.3, R * 0.3, R][i], base: s.scale.x });
      }
      return this._statusHandle(g, parts, (dt, t, p) => {
        const k = (t * 0.8 + p.off) % 1;
        p.s.position.set(p.x, h * 0.9 - k * h * 0.7, p.z);
        p.s.material.opacity = Math.sin(k * Math.PI) * 0.9;
      }, S);
    }
    if (style === 'burstup') {                    // arrows shooting up out of the body
      for (let i = 0; i < 4; i++) {
        const s = sprite(use[0], 0.2); if (!s) continue;
        g.add(s); parts.push({ s, off: i / 4, a: (i / 4) * 6.28, r: R * 0.85, base: s.scale.x });
      }
      return this._statusHandle(g, parts, (dt, t, p) => {
        const k = (t * 0.9 + p.off) % 1;
        p.s.position.set(Math.cos(p.a) * p.r, 0.1 + k * (h + 0.25), Math.sin(p.a) * p.r);
        p.s.material.opacity = Math.sin(k * Math.PI) * 0.95;
      }, S);
    }
    if (style === 'bob') {                        // a reticle / glyph hovering above the head
      const s = sprite(use[0], S.where === 'above' ? 0.45 : 0.34); if (!s) return null;
      s.position.y = aboveY; g.add(s);
      return this._statusHandle(g, [], null, S, (dt, t) => {
        s.position.y = aboveY + Math.sin(t * 2.6) * 0.05;
        s.material.rotation = type === 'marked' ? t * 1.2 : 0;
        s.material.opacity = 0.75 + Math.sin(t * 4) * 0.25;
      });
    }
    if (style === 'shield') {                     // a shield plate facing the viewer plus a faint torus
      const plate = this._sprite(use[0], { size: Math.max(0.5, h * 0.6), color: 0xffffff, opacity: 0.5 });
      if (plate) { plate.position.y = midY + 0.05; g.add(plate); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.2 * this.scale, 0.016 * this.scale, 8, 32), this._basic(S.color, 0.55));
      ring.rotation.x = -Math.PI / 2; ring.position.y = midY; g.add(ring);
      return this._statusHandle(g, [], null, S, (dt, t) => {
        if (plate) plate.material.opacity = 0.3 + Math.sin(t * 2.2) * 0.18;
        ring.position.y = midY + Math.sin(t * 1.6) * (h * 0.3);
        ring.material.opacity = 0.5 + Math.sin(t * 3) * 0.2;
      });
    }
    if (style === 'circle') {                     // sprites drifting around the feet
      for (let i = 0; i < 4; i++) {
        const s = sprite(use[i % use.length], 0.34, 0.95); if (!s) continue;
        g.add(s); parts.push({ s, a: (i / 4) * 6.28, r: R * 1.35, base: s.scale.x });
      }
      const halo = new THREE.Mesh(new THREE.TorusGeometry(R * 1.35 * this.scale, 0.016 * this.scale, 6, 28), this._basic(S.color, 0.45));
      halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; g.add(halo);
      return this._statusHandle(g, parts, (dt, t, p) => {
        const a = p.a - t * 1.8;
        p.s.position.set(Math.cos(a) * p.r, h * 0.14 + Math.sin(a * 1.5) * h * 0.06, Math.sin(a) * p.r);
        p.s.material.opacity = 0.6 + Math.sin(a) * 0.35;
      }, S, (dt, t) => { halo.material.opacity = 0.35 + Math.sin(t * 2) * 0.15; });
    }
    if (style === 'streak') {                     // speed lines streaming off a hasted body
      const lines = [];
      for (let i = 0; i < 6; i++) {
        const m = this._sprite(this.hasTexture('glow') ? 'glow' : use[0], { size: 1, color: S.color, opacity: 0.7 });
        if (!m) break;
        const side = i % 2 ? 1 : -1;
        m.position.set(side * R, midY + (Math.floor(i / 2) - 1) * h * 0.16, R * 0.2);
        g.add(m); lines.push({ m, off: (i / 6) + rnd(-0.05, 0.05), side, y: m.position.y, len: rnd(0.3, 0.5) * h });
      }
      for (let i = 0; i < 3; i++) {               // sparks kicked up at the feet
        const s = sprite(use[0], 0.2, 0.9); if (!s) continue;
        g.add(s); parts.push({ s, a: (i / 3) * 6.28, r: R, base: s.scale.x });
      }
      return this._statusHandle(g, parts, (dt, t, p) => {
        const a = p.a - t * 4.5;
        p.s.position.set(Math.cos(a) * p.r, 0.08, Math.sin(a) * p.r);
        p.s.material.opacity = 0.5 + Math.sin(a * 2) * 0.45;
      }, S, (dt, t) => {
        for (const l of lines) {
          const k = (t * 1.7 + l.off) % 1;
          l.m.position.x = l.side * (R * 0.85 + k * R * 1.3);
          l.m.position.z = R * 0.2 - k * R * 0.8;
          l.m.material.opacity = Math.sin(k * Math.PI) * 0.85;
          l.m.scale.set(l.len * this.scale * (0.5 + k), 0.05 * this.scale, 1);
        }
      });
    }
    if (style === 'ground') {                     // vines gripping the feet
      for (let i = 0; i < 5; i++) {
        const s = sprite(use[0], 0.4, 1, THREE.NormalBlending); if (!s) continue;
        const a = (i / 4) * 6.28;
        s.position.set(Math.cos(a) * R * 1.45, h * 0.1, Math.sin(a) * R * 1.45);
        g.add(s); parts.push({ s, off: i * 0.5, base: s.scale.x });
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.45 * this.scale, 0.022 * this.scale, 6, 24), this._basic(S.color, 0.7));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
      return this._statusHandle(g, parts, (dt, t, p) => { const sc = p.base * (1 + Math.sin(t * 2.4 + p.off) * 0.07); p.s.scale.set(sc, sc, sc); }, S);
    }
    // last resort: a mote orbiting the chest so an unknown status is still visible
    const s = sprite('glow', 0.18);
    if (!s) return null;
    g.add(s);
    return this._statusHandle(g, [{ s, a: 0, r: R, y: midY, base: s.scale.x }], (dt, t, p) => {
      const a = t * 2.4; p.s.position.set(Math.cos(a) * p.r, p.y, Math.sin(a) * p.r);
    }, S);
  }

  /** Wrap a built aura into the record the update loop drives. */
  _statusHandle(group, parts, perPart, S, extra = null) {
    const h = {
      group, parts, pulse: 0, S,
      update: (dt, t) => {
        if (h.pulse > 0) h.pulse = Math.max(0, h.pulse - dt * 2.2);
        const boost = 1 + h.pulse * 0.7;
        if (perPart) for (const p of parts) perPart(dt, t, p);
        if (extra) extra(dt, t);
        if (h.pulse > 0) group.scale.setScalar(boost); else if (group.scale.x !== 1) group.scale.setScalar(1);
      },
    };
    return h;
  }

  // ---- loop -------------------------------------------------------------------------------------

  /** Drive every running effect. Call once per frame from the stage's ticker. */
  update(dt) {
    const d = Math.min(0.05, Math.max(0, dt || 0));
    this._t += d;
    for (const e of [...this.live]) {
      e.age += d;
      let finished = false;
      try { finished = e.step ? e.step(d, e.life ? Math.min(1, e.age / e.life) : 0, e) === true : false; } catch (err) { console.warn('spellfx effect failed', err); finished = true; }
      if (finished || (e.life && e.age >= e.life)) this._end(e);
    }
    for (const [uuid, m] of [...this._statuses]) {
      for (const [type, h] of [...m]) {
        if (!h.group.parent) { m.delete(type); continue; }   // the body left the stage
        try { h.update(d, this._t); } catch (err) { console.warn('spellfx status failed', err); m.delete(type); disposeObj(h.group); }
      }
      if (!m.size) this._statuses.delete(uuid);
    }
  }

  /** How many effects and auras are running (handy in tests). */
  get liveCount() { let n = this.live.length; for (const m of this._statuses.values()) n += m.size; return n; }

  /** Drop everything and detach from the scene. Textures are shared and are not disposed. */
  dispose() {
    for (const e of [...this.live]) this._end(e);
    for (const m of this._statuses.values()) for (const h of m.values()) disposeObj(h.group);
    this._statuses.clear();
    if (this.root.parent) this.root.parent.remove(this.root);
    disposeObj(this.root);
  }
}

/**
 * Convenience: load every fx sprite as a texture from an Assets loader and build a SpellFx.
 *   const fx = await createSpellFx(scene, { assets, camera });
 */
export async function createSpellFx(scene, { assets = null, camera = null, scale = 1, size = 128 } = {}) {
  let textures = null;
  if (assets) { try { textures = await assets.fxTextures(THREE, { size }); } catch { textures = null; } }
  return new SpellFx(scene, { textures, camera, scale });
}

export default SpellFx;
