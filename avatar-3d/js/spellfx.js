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

/**
 * Colour ramps each element's particles are drawn with (2026-09-25 overhaul). A particle is born at
 * `hot`, cools through `mid` and dies at `deep`; `smoke` is the colour of anything drawn with NORMAL
 * blending (dark smoke, shadow tendrils, toxic cloud) so it reads against a bright sky as well as a
 * dark dungeon. Most of the new sprites are drawn white on purpose so one sprite serves every element.
 */
export const ELEMENT_PALETTE = {
  fire:      { hot: 0xfff2c0, mid: 0xff8a1a, deep: 0xc0240a, smoke: 0x2a201c },
  ice:       { hot: 0xffffff, mid: 0xaee6ff, deep: 0x3f9cff, smoke: 0xd8f0ff },
  lightning: { hot: 0xffffff, mid: 0xfff07a, deep: 0x8fa0ff, smoke: 0x3a3c50 },
  poison:    { hot: 0xe4ffa0, mid: 0x7ae04a, deep: 0x2a8a1a, smoke: 0x22401a },
  shadow:    { hot: 0xe6d0ff, mid: 0x9458e0, deep: 0x3a1470, smoke: 0x0e0816 },
  holy:      { hot: 0xffffff, mid: 0xffe69a, deep: 0xffa830, smoke: 0xfff4d0 },
  arcane:    { hot: 0xf6e4ff, mid: 0xb070ff, deep: 0x5a28d0, smoke: 0x2a1648 },
  nature:    { hot: 0xeeffb8, mid: 0x86d850, deep: 0x2f8a28, smoke: 0x3a5020 },
  physical:  { hot: 0xffffff, mid: 0xdfe3ee, deep: 0x9aa0b0, smoke: 0x8a8274 },
  bleed:     { hot: 0xff9090, mid: 0xd02020, deep: 0x700a0a, smoke: 0x4a0808 },
  true:      { hot: 0xffffff, mid: 0xf0f0ff, deep: 0xb0b8ff, smoke: 0xc0c0d0 },
};
const palOf = el => ELEMENT_PALETTE[el] || ELEMENT_PALETTE.arcane;
const GLYPHS = ['glyph_a', 'glyph_b', 'glyph_c'];
const NORMAL = THREE.NormalBlending;
const ADD = THREE.AdditiveBlending;
/** A random unit vector; `upBias` pushes it toward +Y (0 = uniform sphere). */
function randDir(upBias = 0) {
  const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1) + upBias, rnd(-1, 1));
  return v.lengthSq() < 1e-6 ? v.set(0, 1, 0) : v.normalize();
}
/** A random point on a flat disc of radius r around `c` (uniform over the area, not bunched in the middle). */
function onDisc(c, r, y = c.y) {
  const a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()) * r;
  return new THREE.Vector3(c.x + Math.cos(a) * d, y, c.z + Math.sin(a) * d);
}
const easeOut = k => 1 - Math.pow(1 - k, 3);

// ---------------------------------------------------------------------------------------------
// disposal helpers

function disposeObj(obj) {
  obj.traverse(o => {
    if (o.userData?.poolKey) return;     // a pooled trail sprite: its material is reused, not thrown away
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();   // shared unit shapes stay
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

/**
 * A pooled particle system (2026-09-25). Every sprite comes out of SpellFx's pool and is counted in
 * its particle budget, so a stage full of effects thins out instead of stalling. Sizes and positions
 * are WORLD units (the fx `scale` is undone here, so a 3 m storm is 3 m at any scale).
 *
 * add(id, o) options: pos, vel, life, size, size1 (end size as a multiple), color, color1 (colour
 * at death), opacity, blending, gravity (m/s², + is up), drag (1/s), spin, rot, fadeIn (fraction of
 * life), fadePow, delay (s), swirl { cx, cz, w, pull, lift } (orbit a vertical axis while moving in
 * or out), wobble (sideways flutter, m/s), stretch (streak along the screen-space velocity),
 * flicker (0..1 random dimming), onDie(p).
 */
class Particles {
  constructor(fx) { this.fx = fx; this.group = new THREE.Group(); this.parts = []; this._stretch = false; }
  add(id, o = {}) {
    const fx = this.fx;
    if (fx._particles >= fx.maxParticles || !o.pos) return null;
    const s = fx._sprite(id, { size: (o.size ?? 0.2) / (fx.scale || 1), color: o.color ?? 0xffffff, opacity: 0, blending: o.blending ?? ADD, pooled: true });
    if (!s) return null;
    fx._particles++;
    s.position.copy(o.pos);
    s.material.rotation = o.rot ?? rnd(0, Math.PI * 2);
    s.visible = !(o.delay > 0);
    this.group.add(s);
    const p = {
      s, age: -(o.delay || 0), life: Math.max(0.02, o.life ?? 0.5),
      v: o.vel ? o.vel.clone() : new THREE.Vector3(), g: o.gravity ?? 0, drag: o.drag ?? 0,
      base: s.scale.x, size1: o.size1 ?? 0.4, op: o.opacity ?? 1, fadeIn: o.fadeIn ?? 0.08, fadePow: o.fadePow ?? 2,
      spin: o.spin ?? 0, c0: o.color1 != null ? new THREE.Color(o.color ?? 0xffffff) : null, c1: o.color1 != null ? new THREE.Color(o.color1) : null,
      swirl: o.swirl || null, wob: o.wobble || 0, wobF: rnd(3, 7), ph: rnd(0, 6.28),
      stretch: o.stretch || 0, flicker: o.flicker || 0, onDie: o.onDie || null,
    };
    if (p.stretch) this._stretch = true;
    this.parts.push(p);
    return p;
  }
  update(dt) {
    let rx = 1, ry = 0, rz = 0, ux = 0, uy = 1, uz = 0;
    const cam = this.fx.camera;
    if (this._stretch && cam) { const e = cam.matrixWorld.elements; rx = e[0]; ry = e[1]; rz = e[2]; ux = e[4]; uy = e[5]; uz = e[6]; }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i], s = p.s;
      p.age += dt;
      if (p.age < 0) continue;
      const k = p.age / p.life;
      if (k >= 1) {
        this.parts.splice(i, 1);
        if (p.onDie) { try { p.onDie(p); } catch { /* decoration */ } }
        this.fx._freeSprite(s);
        continue;
      }
      s.visible = true;
      if (p.g) p.v.y += p.g * dt;
      if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      const pos = s.position;
      if (p.swirl) {
        const w = p.swirl, dx = pos.x - w.cx, dz = pos.z - w.cz;
        const r = Math.hypot(dx, dz), a = Math.atan2(dz, dx) + (w.w || 0) * dt;
        const nr = Math.max(0, r + (w.pull || 0) * dt);
        pos.x = w.cx + Math.cos(a) * nr; pos.z = w.cz + Math.sin(a) * nr; pos.y += (w.lift || 0) * dt;
      }
      pos.addScaledVector(p.v, dt);
      if (p.wob) { const a = p.age * p.wobF + p.ph; pos.x += Math.cos(a) * p.wob * dt; pos.z += Math.sin(a * 1.3) * p.wob * dt; }
      const fi = p.fadeIn > 0 ? Math.min(1, k / p.fadeIn) : 1;
      let op = p.op * fi * (1 - Math.pow(k, p.fadePow));
      if (p.flicker) op *= 1 - p.flicker * Math.random();
      s.material.opacity = op;
      if (p.c1) s.material.color.copy(p.c0).lerp(p.c1, k);
      const sc = p.base * (1 + (p.size1 - 1) * k);
      if (p.stretch) {
        const vx = p.v.x * rx + p.v.y * ry + p.v.z * rz, vy = p.v.x * ux + p.v.y * uy + p.v.z * uz;
        const sp = Math.hypot(vx, vy);
        if (sp > 1e-3) s.material.rotation = Math.atan2(-vx, vy);
        s.scale.set(sc, sc * (1 + p.stretch * sp * 10), 1);
      } else {
        s.material.rotation += p.spin * dt;
        s.scale.set(sc, sc, sc);
      }
    }
  }
  get count() { return this.parts.length; }
  dispose() { for (const p of this.parts) this.fx._freeSprite(p.s); this.parts.length = 0; }
}

/**
 * A jagged, camera-facing ribbon: lightning that is thicker than a one-pixel GL line. A wide faint
 * strip in the element colour under a thin white core. `set(a, b)` re-rolls the zigzag.
 */
class Jag {
  constructor(fx, { segs = 12, width = 0.05, color = 0xfff07a, opacity = 1, jitter = 0.12, taper = 0.5 } = {}) {
    this.fx = fx; this.segs = segs; this.width = width; this.jitter = jitter; this.taper = taper;
    this.group = new THREE.Group(); this.group.frustumCulled = false;
    const mk = (col, op) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((segs + 1) * 2 * 3), 3));
      const idx = []; for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: ADD, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.frustumCulled = false; this.group.add(m); return m;
    };
    this.glow = mk(color, 0.55 * opacity); this.core = mk(0xffffff, opacity);
    this.pts = Array.from({ length: segs + 1 }, () => new THREE.Vector3());
    this.opacity = opacity;
  }
  set(a, b, jitter = this.jitter) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length() || 1;
    const s1 = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y / len) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
    const s2 = new THREE.Vector3().crossVectors(dir, s1).normalize();
    for (let i = 0; i <= this.segs; i++) {
      const t = i / this.segs, w = Math.sin(t * Math.PI) * jitter;
      this.pts[i].lerpVectors(a, b, t).addScaledVector(s1, rnd(-w, w)).addScaledVector(s2, rnd(-w, w));
    }
    this._build();
  }
  _build() {
    const cam = this.fx.camera, camPos = new THREE.Vector3(0, 0, 1e4);
    if (cam) cam.getWorldPosition(camPos);
    const tan = new THREE.Vector3(), view = new THREE.Vector3(), side = new THREE.Vector3();
    for (const [mesh, wm] of [[this.glow, 3.2], [this.core, 1]]) {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i <= this.segs; i++) {
        const p = this.pts[i];
        tan.subVectors(this.pts[Math.min(this.segs, i + 1)], this.pts[Math.max(0, i - 1)]);
        view.subVectors(camPos, p);
        side.crossVectors(tan, view).normalize();
        const f = i / this.segs;   // pinched at both ends so the strip never ends in a flat edge
        const w = this.width * wm * 0.5 * (1 - this.taper * f) * Math.min(1, 0.15 + f * 5, 0.15 + (1 - f) * 5);
        pos.setXYZ(i * 2, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
        pos.setXYZ(i * 2 + 1, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
      }
      pos.needsUpdate = true;
    }
  }
  fade(k) { this.glow.material.opacity = 0.55 * this.opacity * k; this.core.material.opacity = this.opacity * k; }
}

/**
 * One composite effect = ONE live entry, however many pieces it has (2026-09-25). An impact used
 * to register eight separate entries, which ate the `maxLive` cap and the light slots in a big fight.
 * Pieces are timed tasks (`anim`, `emit`, `burst`, `once`) plus a pooled particle system; the entry
 * finishes when every task has run and the last particle is gone. All sizes are world units.
 */
class Effect {
  constructor(fx, { at, life = 3, density = 1 } = {}) {
    this.fx = fx; this.at = at.clone(); this.maxLife = life; this.age = 0;
    this.density = density * (fx._density || 1);
    // a thinned burst inside an aoe: the area signature carries the big pieces, so the per-point
    // bursts skip their beams, standing discs, spikes and camera-facing rings
    this.lite = this.density < 0.999;
    this.group = new THREE.Group();
    this.P = new Particles(fx); this.group.add(this.P.group);
    this.tasks = [];
  }
  /** Run fn(k, dt, localAge) from t0 for dur seconds. `obj` is added to the group and shown only in that window. */
  anim(t0, dur, fn, obj = null) {
    if (obj) { this.group.add(obj); obj.visible = false; }
    this.tasks.push({ t0, dur: Math.max(1e-3, dur), fn, obj });
    return obj;
  }
  /** Call spawn(P, k) `rate` times a second (budget-scaled) between t0 and t0 + dur. */
  emit(t0, dur, rate, spawn) { this.tasks.push({ t0, dur, emit: true, rate, spawn, acc: 0 }); }
  /** Spawn n particles at once at time t0 (budget-scaled). */
  burst(t0, n, spawn) { this.tasks.push({ t0, once: () => { const m = this.fx._n(n, this.density); for (let i = 0; i < m; i++) spawn(this.P, i, m); } }); }
  once(t0, fn) { this.tasks.push({ t0, once: fn }); }

  /** A camera-facing flash sprite that swells and fades. */
  flash(pos, { id = 'soft', size = 1, color = 0xffffff, t0 = 0, life = 0.16, opacity = 1, grow = 1.5, blending = ADD } = {}) {
    const s = this.fx._sprite(id, { size: size / (this.fx.scale || 1), color, opacity: 0, blending });
    if (!s) return null;
    s.position.copy(pos); s.material.rotation = rnd(0, 6.28);
    const base = s.scale.x;
    return this.anim(t0, life, k => { s.material.opacity = opacity * (k < 0.15 ? k / 0.15 : Math.pow(1 - (k - 0.15) / 0.85, 1.5)); s.scale.setScalar(base * (0.6 + grow * easeOut(k))); }, s);
  }
  /** A flat textured decal on the ground (scorch, frost ring, rune ring...). */
  decal(id, pos, { size = 1, color = 0xffffff, opacity = 1, blending = ADD, t0 = 0, life = 1, fadeIn = 0.06, fadeOut = 0.4, spin = 0, s0 = 0.5, s1 = 1, growT = 0.25, yaw = rnd(0, 6.28) } = {}) {
    const map = this.fx.texture(id); if (!map) return null;
    const m = new THREE.Mesh(this.fx._shared('plane'), new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0, blending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.rotation.set(-Math.PI / 2, 0, yaw); m.position.copy(pos);
    return this.anim(t0, life, (k, dt) => {
      const g = k < growT ? easeOut(k / growT) : 1;
      m.scale.setScalar(size * (s0 + (s1 - s0) * g));
      m.material.opacity = opacity * (k < fadeIn ? k / fadeIn : k > 1 - fadeOut ? (1 - k) / fadeOut : 1);
      m.rotation.z += spin * dt;
    }, m);
  }
  /** A camera-facing textured disc (a rune ring standing up at the hit point). */
  disc(id, pos, { size = 1, color = 0xffffff, opacity = 1, t0 = 0, life = 0.5, spin = 2, s0 = 0.3, s1 = 1 } = {}) {
    const map = this.fx.texture(id); if (!map || this.lite) return null;
    const m = new THREE.Mesh(this.fx._shared('plane'), new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0, blending: ADD, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.position.copy(pos);
    let rot = rnd(0, 6.28);
    return this.anim(t0, life, (k, dt) => {
      rot += spin * dt;
      if (this.fx.camera) m.quaternion.copy(this.fx.camera.quaternion);
      m.rotateZ(rot);
      m.scale.setScalar(size * (s0 + (s1 - s0) * easeOut(k)));
      m.material.opacity = opacity * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88);
    }, m);
  }
  /** An expanding torus. axis 'ground' lies flat, 'camera' faces the viewer. */
  ring(pos, color, { r0 = 0.1, r1 = 1, t0 = 0, life = 0.4, axis = 'ground', tube = 0.03, opacity = 1, rise = 0 } = {}) {
    if (this.lite && axis === 'camera') return null;
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, tube / Math.max(0.05, r0, r1), 6, 48), this.fx._basic(color, 0));
    m.position.copy(pos); if (axis === 'ground') m.rotation.x = -Math.PI / 2;
    return this.anim(t0, life, k => {
      m.scale.setScalar(r0 + (r1 - r0) * easeOut(k));
      m.material.opacity = opacity * (1 - k);
      if (rise) m.position.y = pos.y + rise * k;
      if (axis === 'camera' && this.fx.camera) m.quaternion.copy(this.fx.camera.quaternion);
    }, m);
  }
  /** A jagged arc that re-rolls every `every` seconds. `ends()` returns [a, b] each time (so they can move). */
  arc(ends, { t0 = 0, life = 0.3, every = 0.05, width = 0.04, color = 0xfff07a, jitter = 0.15, segs = 10, taper = 0.4, opacity = 1 } = {}) {
    const j = new Jag(this.fx, { segs, width, color, jitter, taper, opacity });
    let next = 0;
    return this.anim(t0, life, (k, dt) => {
      next -= dt;
      if (next <= 0) { const [a, b] = ends(); j.set(a, b); next = every; }
      j.fade((1 - k) * (0.7 + Math.random() * 0.3));
    }, j.group);
  }
  /** A vertical beam of light standing on `pos` (holy pillar, a judgement column). */
  beam(pos, { radius = 0.3, height = 3, color = 0xffe69a, t0 = 0, life = 0.6, opacity = 1, drop = 0, narrow = 0.8 } = {}) {
    if (this.lite) return null;
    const g = new THREE.Group(); g.position.copy(pos);
    const outer = new THREE.Mesh(this.fx._shared('beam'), new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity: 0, blending: ADD, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const inner = new THREE.Mesh(this.fx._shared('beam'), new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0, blending: ADD, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    g.add(outer, inner);
    return this.anim(t0, life, (k, dt) => {
      // `drop`: the first part of the life the beam spends slamming down from the sky
      const dk = drop > 0 ? Math.min(1, k / drop) : 1;
      const hk = drop > 0 ? easeOut(dk) : 1;
      const after = drop > 0 ? Math.max(0, (k - drop) / (1 - drop)) : k;
      const w = radius * (dk < 1 ? 0.6 : 1 + 0.35 * Math.max(0, 1 - after * 6)) * (1 - narrow * after);
      outer.scale.set(w, height * hk, w); inner.scale.set(w * 0.38, height * hk, w * 0.38);
      // hung from the top while it falls, standing on the ground once it lands
      outer.position.y = inner.position.y = height * (1 - hk);
      const op = opacity * (after < 0.1 ? 1 : 1 - (after - 0.1) / 0.9);
      outer.material.opacity = op * 0.8; inner.material.opacity = op;
      outer.rotation.y += dt * 2; inner.rotation.y -= dt * 3;
    }, g);
  }
  start({ onDone = null, lightLife = null, lightPos = null } = {}) {
    const e = this.fx._add(this.group, this.maxLife, dt => this.step(dt), () => { this.P.dispose(); if (onDone) onDone(); });
    e.main = true; e.lightPos = lightPos || this.at; if (lightLife != null) e.lightLife = lightLife;
    return e;
  }
  step(dt) {
    this.age += dt;
    let busy = false;
    for (const t of this.tasks) {
      if (t.done) continue;
      const local = this.age - t.t0;
      if (local < 0) { busy = true; continue; }
      if (t.once) { t.done = true; try { t.once(); } catch (err) { console.warn('spellfx piece failed', err); } continue; }
      if (t.emit) {
        t.acc += dt * t.rate * this.fx.budgetScale() * this.density;
        while (t.acc >= 1) { t.acc -= 1; t.spawn(this.P, clamp(local / Math.max(1e-3, t.dur), 0, 1)); }
        if (local >= t.dur) t.done = true; else busy = true;
        continue;
      }
      const k = Math.min(1, local / t.dur);
      if (t.obj) t.obj.visible = true;
      t.fn(k, dt, local);
      if (k >= 1) { t.done = true; if (t.obj) t.obj.visible = false; } else busy = true;
    }
    this.P.update(dt);
    return !busy && this.P.count === 0;
  }
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
    this._density = 1;              // aoe() lowers this while it fires many impacts at once
    this._geos = new Map();         // shared unit shapes (decal plane, beam, spike) — never disposed per effect
  }
  /** Budget-scaled particle count: n at full budget, fewer when the stage is busy, 0 at the cap. */
  _n(n, density = 1) {
    const b = this.budgetScale();
    if (b <= 0 || n <= 0) return 0;
    return Math.max(1, Math.round(n * b * density));
  }
  /** A shared unit geometry by name. Marked shared so disposing one effect never frees it. */
  _shared(name) {
    let g = this._geos.get(name);
    if (g) return g;
    if (name === 'plane') g = new THREE.PlaneGeometry(1, 1);
    else if (name === 'beam') {
      // an open cylinder, radius 1, from y = 0 to y = 1, bright at the foot and black (= invisible
      // under additive blending) at the top, so a beam fades into the sky instead of ending in a lid
      g = new THREE.CylinderGeometry(1, 1, 1, 24, 6, true); g.translate(0, 0.5, 0);
      const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { const f = Math.pow(1 - pos.getY(i), 1.4); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f; }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    } else if (name === 'spike') { g = new THREE.ConeGeometry(1, 1, 5); g.translate(0, 0.5, 0); }
    else g = new THREE.OctahedronGeometry(1, 0);
    g.userData.shared = true;
    this._geos.set(name, g);
    return g;
  }
  /**
   * Where the floor is under a point. Stages (Emberveil, the gallery) stand on y = 0 and hand in
   * points about a body's height above it; an open world (Farhold) hands in points far above 0, so
   * there the floor is taken as `drop` metres under the point. Pass `ground` to any call to be exact.
   */
  _groundY(at, ground = null, drop = 0.9) {
    if (ground != null && isFinite(ground)) return ground;
    return (at.y > 2.4 || at.y < -0.2) ? at.y - drop : 0;
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
    const e = { obj, life, step, onDone, age: 0, seq: (this._seq = (this._seq || 0) + 1) };
    this.live.push(e);
    while (this.live.length > this.maxLive) {
      // the oldest effect that is not a persistent handle (an orbiting orb lives until its owner says so)
      const old = this.live.find(x => !x.persistent);
      if (!old || old === e) break;
      this._dropped++; this._end(old);
    }
    return e;
  }
  _end(e) {
    const i = this.live.indexOf(e); if (i >= 0) this.live.splice(i, 1);
    else if (e.ended) return;
    e.ended = true;
    if (e.obj) disposeObj(e.obj);
    if (e.onDone) { const f = e.onDone; e.onDone = null; f(); }
  }

  // ---- projectiles ----------------------------------------------------------------------------

  /**
   * Throw something from one point to another.
   * @returns {Promise<void>} resolves the frame the projectile lands (so a caller can chain an impact).
   */
  projectile({ from, to, element = 'arcane', shape = null, speed = null, arc = null, ms = null, crit = false } = {}) {
    const el = elementName(element);
    const E = ELEMENTS[el];
    const kind = shape || E.shape;
    const a = from.clone(), b = to.clone();
    if (kind === 'bolt') return this._bolt(a, b, E, crit, ms, el);

    const dist = Math.max(0.2, a.distanceTo(b));
    const dur = ms != null ? ms / 1000 : clamp(dist / (speed || E.speed), 0.16, 0.45);
    const arcH = (arc != null ? arc : E.arc) * clamp(dist * 0.45, 0.2, 1.1);

    const head = this._head(kind, E, crit);
    const deco = this._decorateHead(head.group, el, crit);
    const group = new THREE.Group(); group.add(head.group); group.position.copy(a);
    const tids = (E.trail || []).filter(id => this.hasTexture(id));
    const trail = new Trail(this, {
      ids: tids.length ? tids : ['glow'],
      size: kind === 'ribbon' ? 0.2 : 0.15, color: E.accent, life: 0.3, rate: 45, spread: 0.03,
      rise: kind === 'bubbles' ? 0.35 : kind === 'drops' ? -0.5 : 0.05,
    });
    this.root.add(trail.group);
    // the element's own wake: embers + smoke for fire, mist + flakes for ice, drips + haze for
    // poison, tendrils for shadow... (see _flightStreams). Pooled and budget-scaled like the trail.
    const P = new Particles(this); this.root.add(P.group);
    const streams = this._flightStreams(el, crit);

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
      if (deco) deco(dt, this._t);
      trail.emit(p, dt); trail.update(dt);
      const budget = this.budgetScale();
      for (const s of streams) {
        s.acc += dt * s.rate * budget;
        while (s.acc >= 1) { s.acc -= 1; s.spawn(P, p, dir); }
      }
      P.update(dt);
      return false;
    }, () => {
      // let the tail catch up and fade out on its own
      trail.emitting = false;
      this._add(trail.group, trail.life * 1.3, dt => { trail.update(dt); return trail.count === 0; }, () => trail.dispose());
      this._add(P.group, 2.5, dt => { P.update(dt); return P.count === 0; }, () => P.dispose());
      resolve();
    });
    return done;
  }

  /**
   * What each element sheds while it flies: a list of { rate, spawn(P, pos, dir) }. `dir` is the
   * unit flight direction. Everything is world units, multiplied by the fx scale so a zoomed-out
   * stage still sees it.
   */
  _flightStreams(el, crit = false) {
    const sc = this.scale * (crit ? 1.25 : 1), c = palOf(el);
    const J = (p, r) => p.clone().add(randDir().multiplyScalar(r * sc));
    const st = (rate, spawn) => ({ rate, spawn, acc: rnd(0, 1) });
    switch (el) {
      case 'fire': return [
        st(40, (P, p) => P.add('soft', { pos: J(p, 0.05), vel: new THREE.Vector3(rnd(-0.4, 0.4), rnd(0.4, 1.2), rnd(-0.4, 0.4)).multiplyScalar(sc), size: rnd(0.05, 0.09) * sc, size1: 0.3, life: rnd(0.4, 0.8), color: 0xffe080, color1: c.deep, gravity: 0.8, flicker: 0.35 })),
        st(22, (P, p) => P.add('flame', { pos: J(p, 0.03), vel: new THREE.Vector3(0, 0.6 * sc, 0), size: rnd(0.16, 0.24) * sc, size1: 0.2, life: 0.28, color: c.hot, color1: c.deep, spin: rnd(-3, 3) })),
        st(13, (P, p) => P.add('puff', { pos: J(p, 0.06), vel: new THREE.Vector3(rnd(-0.1, 0.1), rnd(0.35, 0.7), rnd(-0.1, 0.1)).multiplyScalar(sc), size: 0.16 * sc, size1: 2.6, life: rnd(0.6, 0.9), color: c.smoke, blending: NORMAL, opacity: 0.5, fadeIn: 0.3, spin: rnd(-1, 1) })),
      ];
      case 'ice': return [
        st(28, (P, p) => P.add('puff', { pos: J(p, 0.05), vel: randDir().multiplyScalar(0.15 * sc), size: 0.14 * sc, size1: 2.8, life: rnd(0.45, 0.7), color: 0xcfeeff, opacity: 0.32, fadeIn: 0.2, spin: rnd(-1, 1) })),
        st(16, (P, p) => P.add('snowflake', { pos: J(p, 0.08), vel: new THREE.Vector3(0, -0.3 * sc, 0), size: rnd(0.07, 0.11) * sc, size1: 0.6, life: rnd(0.7, 1.0), gravity: -0.8, wobble: 0.5, spin: rnd(-3, 3) })),
        st(18, (P, p) => P.add('flare', { pos: J(p, 0.1), size: rnd(0.08, 0.14) * sc, size1: 0.2, life: 0.22, color: 0xffffff, color1: c.mid, spin: 4 })),
      ];
      case 'poison': return [
        st(16, (P, p) => P.add('soft', { pos: J(p, 0.04), vel: new THREE.Vector3(0, -0.4 * sc, 0), size: rnd(0.06, 0.09) * sc, size1: 0.6, life: 0.55, color: c.hot, color1: c.deep, gravity: -5, stretch: 0.05 })),
        st(22, (P, p) => P.add('puff', { pos: J(p, 0.05), vel: randDir().multiplyScalar(0.12 * sc), size: 0.16 * sc, size1: 3.0, life: rnd(0.8, 1.2), color: 0x4ac030, opacity: 0.3, fadeIn: 0.25, spin: rnd(-0.8, 0.8) })),
        st(10, (P, p) => P.add('bubble', { pos: J(p, 0.08), vel: new THREE.Vector3(0, 0.4 * sc, 0), size: rnd(0.05, 0.1) * sc, size1: 1.4, life: 0.5, blending: NORMAL, opacity: 0.85, wobble: 0.4 })),
      ];
      case 'shadow': return [
        st(30, (P, p) => P.add('tendril', { pos: J(p, 0.06), vel: randDir(0.4).multiplyScalar(0.3 * sc), size: rnd(0.18, 0.26) * sc, size1: 2.0, life: rnd(0.45, 0.7), color: c.smoke, blending: NORMAL, opacity: 0.8, fadeIn: 0.15, spin: rnd(-2.5, 2.5) })),
        st(14, (P, p) => P.add('soft', { pos: J(p, 0.08), vel: randDir(0.5).multiplyScalar(0.3 * sc), size: 0.14 * sc, size1: 1.5, life: 0.5, color: c.mid, color1: c.deep, opacity: 0.7 })),
      ];
      case 'holy': return [
        st(34, (P, p) => P.add('flare', { pos: J(p, 0.08), vel: randDir(0.6).multiplyScalar(0.25 * sc), size: rnd(0.08, 0.15) * sc, size1: 0.2, life: rnd(0.35, 0.6), color: c.hot, color1: c.deep, flicker: 0.3, spin: 2 })),
        st(8, (P, p) => P.add('feather', { pos: J(p, 0.06), vel: new THREE.Vector3(0, -0.2 * sc, 0), size: 0.12 * sc, size1: 0.8, life: 0.8, gravity: -0.3, wobble: 0.6, spin: rnd(-2, 2) })),
      ];
      case 'arcane': return [
        st(14, (P, p) => P.add(pick(GLYPHS), { pos: J(p, 0.05), vel: randDir().multiplyScalar(0.2 * sc), size: 0.13 * sc, size1: 0.5, life: 0.55, color: c.hot, color1: c.mid, spin: rnd(-3, 3), drag: 2 })),
        st(22, (P, p) => P.add('soft', { pos: J(p, 0.04), size: 0.16 * sc, size1: 1.8, life: 0.4, color: c.mid, color1: c.deep, opacity: 0.55 })),
      ];
      case 'nature': return [
        st(14, (P, p) => P.add('leaf', { pos: J(p, 0.06), vel: randDir().multiplyScalar(0.3 * sc), size: rnd(0.1, 0.14) * sc, size1: 0.8, life: rnd(0.7, 1.0), blending: NORMAL, gravity: -0.8, wobble: 0.7, spin: rnd(-6, 6) })),
        st(18, (P, p) => P.add('soft', { pos: J(p, 0.08), vel: randDir(0.5).multiplyScalar(0.2 * sc), size: 0.05 * sc, size1: 0.5, life: 0.6, color: c.hot, flicker: 0.5 })),
      ];
      case 'bleed': return [
        st(16, (P, p) => P.add('drop', { pos: J(p, 0.04), vel: new THREE.Vector3(0, -0.2 * sc, 0), size: rnd(0.06, 0.09) * sc, size1: 0.7, life: 0.5, blending: NORMAL, gravity: -6 })),
      ];
      case 'physical': return [
        st(24, (P, p) => P.add('soft', { pos: J(p, 0.02), size: 0.05 * sc, size1: 0.3, life: 0.2, color: 0xffffff, opacity: 0.5 })),
      ];
      default: return [
        st(25, (P, p) => P.add('flare', { pos: J(p, 0.05), size: 0.1 * sc, size1: 0.2, life: 0.3, color: c.hot, color1: c.mid })),
      ];
    }
  }

  /** Extra glow on the flying body so each element has its own silhouette of light. */
  _decorateHead(g, el, crit = false) {
    const c = palOf(el), k = (crit ? 1.35 : 1) * 1.4;
    const add = (id, size, color, opacity = 1, blending = ADD) => { const s = this._sprite(id, { size: size * k, color, opacity, blending }); if (s) g.add(s); return s; };
    if (el === 'fire') {
      const halo = add('soft', 0.55, 0xff5a10, 0.7), core = add('soft', 0.26, 0xfff4d0, 1);
      return (dt, t) => { const f = 1 + Math.sin(t * 41) * 0.12 + Math.sin(t * 17) * 0.08; if (halo) halo.scale.setScalar(0.55 * k * this.scale * f); if (core) core.scale.setScalar(0.26 * k * this.scale * (2 - f)); };
    }
    if (el === 'ice') { add('soft', 0.5, c.mid, 0.5); const gl = add('flare', 0.4, 0xffffff, 0.9); return dt => { if (gl) gl.material.rotation += dt * 3; }; }
    if (el === 'poison') { add('soft', 0.5, 0x5ad030, 0.55); return null; }
    if (el === 'shadow') {
      // a void at the heart of it: a NORMAL-blended dark blob, then a violet rim around it
      const rim = add('soft', 0.62, c.mid, 0.6); const dark = add('soft', 0.34, 0x000000, 0.9, NORMAL);
      if (dark) dark.renderOrder = 2;
      return (dt, t) => { if (rim) rim.material.opacity = 0.45 + Math.sin(t * 9) * 0.15; };
    }
    if (el === 'holy' || el === 'arcane') {
      // motes (holy) or glyphs (arcane) orbiting the flight axis
      add('soft', 0.5, c.mid, 0.55);
      const orbit = [];
      for (let i = 0; i < 3; i++) { const s = add(el === 'holy' ? 'flare' : GLYPHS[i], el === 'holy' ? 0.14 : 0.13, el === 'holy' ? c.hot : c.hot, 1); if (s) orbit.push(s); }
      return (dt, t) => orbit.forEach((s, i) => {
        const a = t * (el === 'holy' ? 9 : 6) + i * 2.094, r = 0.2 * this.scale * k * 0.7;
        s.position.set(Math.cos(a) * r, Math.sin(a * 2) * 0.03, Math.sin(a) * r);
        s.material.rotation = -a;
      });
    }
    if (el === 'nature') { add('soft', 0.45, c.mid, 0.45); return null; }
    if (el === 'true') { add('flare', 0.4, 0xffffff, 0.9); return null; }
    return null;
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

  /**
   * Lightning: thick camera-facing zigzags (a white core inside a coloured glow) that re-roll eight
   * times, two or three forks peeling off the main stroke, a flash at both ends and crackles
   * flickering along the path. No travel time — the promise resolves when the stroke ends.
   */
  _bolt(a, b, E, crit = false, ms = null, el = 'lightning') {
    const life = ms != null ? ms / 1000 : 0.26;
    const c = palOf(el), sc = this.scale * (crit ? 1.3 : 1);
    const fx = new Effect(this, { at: b, life: life + 1.2 });
    const dir = new THREE.Vector3().subVectors(b, a);
    const jitter = (crit ? 0.16 : 0.11) * clamp(dir.length() * 0.4, 0.4, 1.4);
    const every = life / 8;
    fx.arc(() => [a, b], { life, every, width: 0.07 * sc, color: E.color, jitter, segs: 16, taper: 0.2 });
    fx.arc(() => [a, b], { life: life * 0.8, every, width: 0.035 * sc, color: c.deep, jitter: jitter * 1.6, segs: 14, taper: 0.3, opacity: 0.7 });
    const forks = crit ? 3 : 2;
    for (let i = 0; i < forks; i++) {
      fx.arc(() => {
        const s = new THREE.Vector3().lerpVectors(a, b, rnd(0.25, 0.8));
        return [s, s.clone().add(randDir(-0.3).multiplyScalar(rnd(0.35, 0.7) * sc))];
      }, { t0: rnd(0, life * 0.3), life: life * 0.6, every: every * 1.5, width: 0.03 * sc, color: E.color, jitter: 0.08 * sc, segs: 6, taper: 0.8 });
    }
    fx.flash(a, { id: 'flare', size: 0.5 * sc, color: c.hot, life: 0.12 });
    fx.flash(b, { id: 'flare', size: 0.9 * sc, color: 0xffffff, life: 0.14, t0: 0.02 });
    fx.flash(b, { id: 'soft', size: 1.2 * sc, color: E.color, life: 0.22, opacity: 0.8 });
    fx.emit(0, life, 45, P => P.add('crackle', { pos: new THREE.Vector3().lerpVectors(a, b, Math.random()).add(randDir().multiplyScalar(0.12 * sc)), size: rnd(0.16, 0.26) * sc, size1: 1.2, life: 0.1, color: 0xffffff, color1: E.color, flicker: 0.5, fadePow: 1 }));
    let resolve; const done = new Promise(r => { resolve = r; });
    fx.once(life, () => { if (resolve) { resolve(); resolve = null; } });
    fx.start({ onDone: () => { if (resolve) { resolve(); resolve = null; } }, lightLife: life + 0.1, lightPos: new THREE.Vector3().lerpVectors(a, b, 0.5) });
    return done;
  }

  // ---- impacts --------------------------------------------------------------------------------

  /**
   * A burst where a spell lands. Returns immediately; the effect cleans itself up.
   * Each element has a signature no other shares (2026-09-25): fire leaves a scorch and a column of
   * dark smoke, ice a lingering frost ring with spikes, lightning forks into the ground, poison a
   * haze and a puddle that bubbles, shadow implodes before it bursts, holy drops a pillar of light,
   * arcane opens a rune ring, nature spirals leaves up, physical and bleed stay on the ground.
   * `ground` (optional) is the floor height under the hit; see _groundY for the default.
   */
  impact({ at, element = 'arcane', crit = false, scale = 1, height = 1.8, ground = null, density = 1 } = {}) {
    const el = elementName(element);
    const E = ELEMENTS[el], c = palOf(el);
    const p = at.clone();
    const s = scale * (crit ? 1.5 : 1) * 1.25;
    const S = s * this.scale;                     // world size of this burst
    const bodyH = Math.max(0.4, height);
    const gy = this._groundY(p, ground) + 0.02;
    const g0 = new THREE.Vector3(p.x, gy, p.z);   // the floor right under the hit
    const fx = new Effect(this, { at: p, life: 4, density });
    const pos = (r = 0.1) => p.clone().add(randDir().multiplyScalar(r * S));

    if (el === 'fire') {
      fx.flash(p, { size: 1.3 * S, color: 0xfff0c0, life: 0.16 });
      fx.flash(p, { id: 'flare', size: 0.8 * S, color: 0xffffff, life: 0.1 });
      fx.ring(p, c.mid, { r0: 0.1 * S, r1: 0.75 * S, life: 0.32, axis: 'camera', tube: 0.03 * S });
      fx.burst(0, 26, P => P.add(Math.random() < 0.7 ? 'flame' : 'soft', { pos: pos(0.12), vel: randDir(0.3).multiplyScalar(rnd(1.4, 3.0) * S), drag: 3.0, gravity: 1.8, size: rnd(0.3, 0.45) * S, size1: 0.35, life: rnd(0.35, 0.6), color: c.hot, color1: c.deep, spin: rnd(-3, 3) }));
      fx.burst(0, 16, P => P.add('soft', { pos: pos(0.05), vel: randDir(0.8).multiplyScalar(rnd(1.5, 3.5) * S), drag: 1.4, gravity: 0.6, size: rnd(0.04, 0.07) * S, size1: 0.4, life: rnd(0.6, 1.1), color: 0xffe080, color1: 0xff2a00, stretch: 0.05, flicker: 0.35 }));
      fx.emit(0.06, 0.4, 24, P => P.add('puff', { pos: pos(0.15), vel: new THREE.Vector3(rnd(-0.2, 0.2), rnd(0.5, 1.1), rnd(-0.2, 0.2)).multiplyScalar(S), drag: 0.6, size: rnd(0.28, 0.4) * S, size1: 2.6, life: rnd(1.0, 1.5), color: c.smoke, blending: NORMAL, opacity: 0.6, fadeIn: 0.25, spin: rnd(-1, 1) }));
      fx.decal('scorch', g0, { size: 1.3 * S, color: 0x140a06, blending: NORMAL, opacity: 0.75, life: 2.8, s0: 0.5, growT: 0.08, fadeOut: 0.5 });
      fx.decal('soft', g0.clone().setY(gy + 0.01), { size: 1.4 * S, color: 0xff6a10, opacity: 0.9, life: 0.9, s0: 0.3, growT: 0.15, fadeOut: 0.7 });
      fx.ring(g0, c.hot, { r0: 0.1 * S, r1: 0.9 * S, life: 0.45, tube: 0.025 * S, opacity: 0.7 });
    } else if (el === 'ice') {
      fx.flash(p, { id: 'flare', size: 1.0 * S, color: 0xffffff, life: 0.14 });
      fx.flash(p, { size: 1.1 * S, color: c.mid, life: 0.25, opacity: 0.7 });
      fx.disc('frost_ring', p, { size: 0.9 * S, life: 0.4, spin: 2 });
      this._iceShards(fx, p, S, 10);
      fx.burst(0, 12, P => P.add('ice_shard', { pos: pos(0.05), vel: randDir(0.2).multiplyScalar(rnd(1.5, 3) * S), drag: 1.5, gravity: -4, size: rnd(0.12, 0.2) * S, size1: 0.6, life: rnd(0.4, 0.6), spin: rnd(-8, 8) }));
      fx.burst(0.05, 14, P => P.add('snowflake', { pos: pos(0.35).setY(p.y + rnd(0, 0.4) * S), vel: new THREE.Vector3(rnd(-0.2, 0.2), -0.2, rnd(-0.2, 0.2)).multiplyScalar(S), gravity: -0.3, wobble: 0.5, size: rnd(0.07, 0.12) * S, size1: 0.6, life: rnd(1.0, 1.6), spin: rnd(-2, 2) }));
      fx.emit(0, 0.35, 36, P => P.add('puff', { pos: new THREE.Vector3(p.x, rnd(gy, p.y), p.z).add(randDir().multiplyScalar(0.2 * S)), vel: new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1)).multiplyScalar(0.6 * S), drag: 1.8, size: 0.3 * S, size1: 2.8, life: rnd(1.1, 1.6), color: 0xcfeeff, opacity: 0.28, fadeIn: 0.25, spin: rnd(-0.6, 0.6) }));
      // the frost ring stays on the floor after everything else has gone
      fx.decal('frost_ring', g0, { size: 1.5 * S, color: 0xe8f8ff, opacity: 0.95, life: 2.2, s0: 0.3, growT: 0.1, spin: 0.3, fadeOut: 0.45 });
      fx.decal('soft', g0, { size: 1.6 * S, color: c.mid, opacity: 0.35, life: 2.0, s0: 0.3, growT: 0.1 });
      this._iceSpikes(fx, g0, 0.5 * S, 6, 0.35 * S, 1.8, c);
    } else if (el === 'lightning') {
      fx.flash(p, { id: 'flare', size: 1.6 * S, color: 0xffffff, life: 0.1, grow: 1 });
      fx.flash(p, { size: 2.0 * S, color: c.mid, life: 0.22, opacity: 0.85 });
      // forks: from the hit into the floor, then crawling across it
      for (let i = 0; i < 4; i++) {
        const ang = rnd(0, 6.28), r = rnd(0.5, 1.0) * S;
        const end = new THREE.Vector3(g0.x + Math.cos(ang) * r, gy + 0.03, g0.z + Math.sin(ang) * r);
        fx.arc(() => [p, end], { t0: i * 0.03, life: 0.3, every: 0.045, width: 0.045 * S, color: c.mid, jitter: 0.12 * S, segs: 8, taper: 0.6 });
        const end2 = end.clone().add(new THREE.Vector3(Math.cos(ang + rnd(-0.6, 0.6)), 0, Math.sin(ang + rnd(-0.6, 0.6))).multiplyScalar(rnd(0.3, 0.6) * S));
        fx.arc(() => [end, end2], { t0: i * 0.03 + 0.04, life: 0.3, every: 0.05, width: 0.03 * S, color: c.deep, jitter: 0.08 * S, segs: 6, taper: 0.8 });
      }
      fx.burst(0, 18, P => P.add('streak', { pos: pos(0.05), vel: randDir(0.2).multiplyScalar(rnd(3, 5.5) * S), gravity: -7, drag: 1, size: rnd(0.07, 0.1) * S, size1: 0.5, life: rnd(0.25, 0.45), color: 0xffffff, color1: c.mid, stretch: 0.06 }));
      fx.emit(0, 0.4, 40, P => P.add('crackle', { pos: pos(0.35), size: rnd(0.2, 0.32) * S, size1: 1.2, life: 0.09, color: 0xffffff, color1: c.mid, flicker: 0.5, fadePow: 1 }));
      fx.decal('crack', g0, { size: 1.1 * S, color: 0xfff0b0, opacity: 0.6, life: 0.9, s0: 0.6, growT: 0.05 });
      fx.decal('scorch', g0, { size: 0.8 * S, color: 0x101018, blending: NORMAL, opacity: 0.5, life: 1.5, s0: 0.8, growT: 0.05 });
      fx.ring(g0, c.hot, { r0: 0.05, r1: 0.9 * S, life: 0.25, tube: 0.02 * S });
    } else if (el === 'poison') {
      fx.flash(p, { size: 1.1 * S, color: 0x9aff60, life: 0.2, opacity: 0.8 });
      fx.burst(0, 16, P => P.add('soft', { pos: pos(0.05), vel: randDir(0.9).multiplyScalar(rnd(1.4, 3) * S), gravity: -8, size: rnd(0.08, 0.13) * S, size1: 0.6, life: rnd(0.45, 0.7), color: c.hot, color1: c.deep, stretch: 0.04 }));
      fx.burst(0, 8, P => P.add('bubble', { pos: pos(0.1), vel: randDir(0.6).multiplyScalar(rnd(0.8, 1.6) * S), drag: 2, gravity: 0.5, size: rnd(0.12, 0.2) * S, size1: 1.3, life: rnd(0.5, 0.8), blending: NORMAL, opacity: 0.9 }));
      // the haze hangs around after the splash
      fx.emit(0, 0.6, 26, P => P.add('puff', { pos: new THREE.Vector3(p.x, rnd(gy + 0.1, p.y), p.z).add(randDir().multiplyScalar(0.35 * S)), vel: new THREE.Vector3(rnd(-0.25, 0.25), rnd(0, 0.12), rnd(-0.25, 0.25)).multiplyScalar(S), size: rnd(0.35, 0.5) * S, size1: 2.2, life: rnd(1.6, 2.2), color: 0x48c030, opacity: 0.32, fadeIn: 0.3, spin: rnd(-0.5, 0.5) }));
      fx.emit(0.15, 1.4, 12, P => P.add('bubble', { pos: onDisc(g0, 0.5 * S, gy + 0.03), vel: new THREE.Vector3(0, rnd(0.3, 0.6) * S, 0), wobble: 0.3, size: rnd(0.06, 0.12) * S, size1: 1.6, life: rnd(0.6, 0.9), blending: NORMAL, opacity: 0.9,
        onDie: q => fx.P.add('soft', { pos: q.s.position, size: 0.08 * S, size1: 2, life: 0.12, color: c.hot }) }));
      fx.decal('splat', g0, { size: 1.3 * S, color: 0x2e8a1c, blending: NORMAL, opacity: 0.8, life: 2.6, s0: 0.3, growT: 0.08 });
      fx.decal('splat', g0.clone().setY(gy + 0.005), { size: 1.35 * S, color: 0x70ff40, opacity: 0.45, life: 2.2, s0: 0.3, growT: 0.08 });
      fx.ring(p, c.hot, { r0: 0.07 * S, r1: 0.6 * S, life: 0.3, axis: 'camera', tube: 0.025 * S });
    } else if (el === 'shadow') {
      // implosion: tendrils and a dark ring close in, a void core swells, THEN it bursts out
      const tIn = 0.26;
      fx.burst(0, 12, P => {
        const off = randDir().multiplyScalar(0.9 * S);
        return P.add('tendril', { pos: p.clone().add(off), vel: off.clone().multiplyScalar(-1 / tIn), size: rnd(0.3, 0.42) * S, size1: 0.3, life: tIn, color: c.smoke, blending: NORMAL, opacity: 0.9, fadeIn: 0.3, fadePow: 4, spin: rnd(-4, 4) });
      });
      // violet motes riding in with the dark, so the pull reads on a dark stage too
      fx.burst(0, 10, P => {
        const off = randDir().multiplyScalar(rnd(0.7, 1.0) * S);
        return P.add(Math.random() < 0.5 ? 'wisp' : 'soft', { pos: p.clone().add(off), vel: off.clone().multiplyScalar(-1 / tIn), size: rnd(0.14, 0.22) * S, size1: 0.4, life: tIn, color: c.hot, color1: c.mid, opacity: 0.95, fadeIn: 0.3, fadePow: 4 });
      });
      fx.flash(p, { size: 1.5 * S, color: c.deep, life: tIn, opacity: 0.6, grow: -0.5 });
      fx.ring(p, c.mid, { r0: 0.8 * S, r1: 0.05, life: tIn, axis: 'camera', tube: 0.03 * S });
      const core = this._sprite('soft', { size: 0.8 * S / this.scale, color: 0x000000, opacity: 0, blending: NORMAL });
      if (core) { core.position.copy(p); core.renderOrder = 3; const base = core.scale.x; fx.anim(0, tIn + 0.35, k => { const kk = k * (tIn + 0.35); const grow = kk < tIn ? kk / tIn : 1 - (kk - tIn) / 0.35; core.scale.setScalar(base * (0.2 + 0.9 * grow)); core.material.opacity = 0.95 * grow; }, core); }
      fx.flash(p, { size: 1.4 * S, color: c.mid, t0: tIn, life: 0.3 });
      fx.ring(p, c.hot, { r0: 0.1 * S, r1: 0.9 * S, t0: tIn, life: 0.35, axis: 'camera', tube: 0.025 * S });
      fx.burst(tIn, 14, P => P.add('puff', { pos: pos(0.1), vel: randDir(0.3).multiplyScalar(rnd(0.8, 1.8) * S), drag: 2.2, gravity: 0.5, size: rnd(0.3, 0.45) * S, size1: 2.2, life: rnd(0.8, 1.2), color: c.smoke, blending: NORMAL, opacity: 0.7, spin: rnd(-1.5, 1.5) }));
      fx.burst(tIn, 10, P => P.add(Math.random() < 0.5 ? 'wisp' : 'tendril', { pos: pos(0.1), vel: randDir(0.8).multiplyScalar(rnd(0.6, 1.4) * S), drag: 1.5, gravity: 0.9, size: rnd(0.2, 0.3) * S, size1: 1.2, life: rnd(0.7, 1.1), color: c.hot, color1: c.mid, spin: rnd(-2, 2) }));
      fx.burst(tIn + 0.05, 1, P => P.add('skull', { pos: p.clone(), vel: new THREE.Vector3(0, 0.6 * S, 0), size: 0.3 * S, size1: 1.2, life: 0.7, fadeIn: 0.25 }));
      fx.decal('soft', g0, { size: 1.6 * S, color: 0x000000, blending: NORMAL, opacity: 0.55, life: 1.6, s0: 0.2, growT: 0.3 });
    } else if (el === 'holy') {
      fx.flash(p, { id: 'flare', size: 1.3 * S, color: 0xffffff, life: 0.16 });
      fx.beam(g0, { radius: 0.3 * S, height: Math.max(2.4, (p.y - gy) + 1.6 * S), color: c.mid, life: 0.7, drop: 0.12 });
      fx.decal('holy_rune', g0, { size: 1.3 * S, opacity: 0.9, life: 1.0, s0: 0.4, growT: 0.2, spin: -1.6 });
      fx.decal('soft', g0, { size: 1.6 * S, color: c.deep, opacity: 0.6, life: 0.9, s0: 0.4 });
      fx.burst(0.05, 16, P => { const q = onDisc(g0, 0.35 * S, gy + 0.05); return P.add(Math.random() < 0.5 ? 'holy_mote' : 'flare', { pos: q, vel: new THREE.Vector3(0, rnd(1.0, 2.2) * S, 0), drag: 0.8, size: rnd(0.1, 0.17) * S, size1: 0.4, life: rnd(0.7, 1.1), color: c.hot, color1: c.deep, spin: 2 }); });
      fx.burst(0.1, 5, P => P.add('feather', { pos: pos(0.3).setY(p.y + 0.3 * S), vel: new THREE.Vector3(0, -0.1, 0), gravity: -0.35, wobble: 0.6, size: 0.14 * S, size1: 0.8, life: rnd(1.1, 1.5), spin: rnd(-2, 2) }));
      fx.ring(p, c.hot, { r0: 0.05, r1: 0.75 * S, life: 0.4, axis: 'camera', tube: 0.022 * S });
      fx.ring(g0, c.mid, { r0: 0.3 * S, r1: 0.6 * S, life: 0.8, tube: 0.02 * S, rise: 1.4 * S, opacity: 0.8 });
    } else if (el === 'arcane' || el === 'true') {
      const col = el === 'true' ? 0xffffff : c.mid;
      fx.flash(p, { size: 1.1 * S, color: col, life: 0.2 });
      fx.flash(p, { id: 'flare', size: 0.7 * S, color: 0xffffff, life: 0.1 });
      fx.disc('rune_ring', p, { size: 1.3 * S, color: el === 'true' ? 0xffffff : c.hot, life: 0.5, spin: 3, s0: 0.2 });
      fx.decal('rune_ring', g0, { size: 1.6 * S, color: col, opacity: 0.95, life: 1.0, s0: 0.2, growT: 0.3, spin: 2.2 });
      fx.decal('arcane_rune', g0, { size: 1.0 * S, opacity: 0.7, life: 0.8, s0: 0.4, growT: 0.2, spin: -3 });
      // glyphs thrown out that then circle the hit before they fade
      fx.burst(0, 10, P => { const off = randDir(0.3).multiplyScalar(0.2 * S); return P.add(pick(GLYPHS), { pos: p.clone().add(off), vel: new THREE.Vector3(0, 0.3 * S, 0), swirl: { cx: p.x, cz: p.z, w: rnd(3, 5), pull: 0.9 * S }, drag: 0.5, size: rnd(0.13, 0.19) * S, size1: 0.6, life: rnd(0.7, 0.95), color: c.hot, color1: col, spin: rnd(-2, 2) }); });
      fx.burst(0, 10, P => P.add('arcane_shard', { pos: pos(0.05), vel: randDir().multiplyScalar(rnd(1.8, 3) * S), drag: 3, size: rnd(0.12, 0.18) * S, size1: 0.4, life: 0.45, spin: rnd(-9, 9), color: el === 'true' ? 0xffffff : 0xffffff }));
      fx.ring(p, col, { r0: 0.06, r1: 0.7 * S, life: 0.35, axis: 'camera', tube: 0.022 * S });
    } else if (el === 'nature') {
      fx.flash(p, { size: 0.9 * S, color: c.mid, life: 0.2, opacity: 0.7 });
      // a spiral of leaves winding up out of the hit
      fx.burst(0, 16, P => { const q = onDisc(g0, 0.3 * S, rnd(gy + 0.05, p.y)); return P.add('leaf', { pos: q, swirl: { cx: p.x, cz: p.z, w: rnd(4, 6), pull: 0.45 * S, lift: rnd(0.9, 1.5) * S }, size: rnd(0.14, 0.2) * S, size1: 0.8, life: rnd(0.8, 1.1), blending: NORMAL, spin: rnd(-6, 6) }); });
      fx.burst(0, 8, P => P.add('thorn', { pos: pos(0.05), vel: randDir(0.2).multiplyScalar(rnd(2, 3.2) * S), gravity: -4, size: rnd(0.12, 0.17) * S, size1: 0.7, life: 0.45, blending: NORMAL, spin: rnd(-6, 6) }));
      fx.emit(0, 0.6, 24, P => P.add('soft', { pos: onDisc(g0, 0.5 * S, rnd(gy, p.y)), vel: new THREE.Vector3(0, rnd(0.2, 0.5) * S, 0), size: rnd(0.04, 0.07) * S, size1: 0.5, life: rnd(0.7, 1.1), color: 0xeaff80, flicker: 0.5 }));
      fx.decal('root_vine', g0, { size: 1.2 * S, blending: NORMAL, opacity: 0.9, life: 1.4, s0: 0.2, growT: 0.25 });
      fx.ring(g0, c.mid, { r0: 0.08 * S, r1: 0.75 * S, life: 0.5, tube: 0.022 * S });
    } else if (el === 'bleed') {
      fx.burst(0, 14, P => P.add('drop', { pos: pos(0.05), vel: randDir(0.5).multiplyScalar(rnd(1.4, 2.6) * S), gravity: -9, size: rnd(0.1, 0.16) * S, size1: 0.8, life: rnd(0.45, 0.7), blending: NORMAL }));
      fx.burst(0, 4, P => P.add('puff', { pos: pos(0.08), vel: randDir().multiplyScalar(0.4 * S), drag: 2, size: 0.25 * S, size1: 1.8, life: 0.55, color: c.deep, blending: NORMAL, opacity: 0.5 }));
      fx.decal('splat', g0, { size: 0.8 * S, color: 0x7a0808, blending: NORMAL, opacity: 0.85, life: 2.4, t0: 0.15, s0: 0.3, growT: 0.1 });
      this._crossSlashes(p, 0xff6060, s, 2, bodyH * 0.5);
    } else { // physical
      fx.flash(p, { id: 'flare', size: 0.6 * S, color: 0xffffff, life: 0.08 });
      this._crossSlashes(p, 0xffffff, s, crit ? 3 : 2, bodyH * 0.62);
      fx.burst(0, 12, P => P.add('streak', { pos: pos(0.03), vel: randDir(0.3).multiplyScalar(rnd(2.5, 4.5) * S), gravity: -9, size: rnd(0.06, 0.09) * S, size1: 0.5, life: rnd(0.2, 0.35), color: 0xffffff, color1: 0xffc060, stretch: 0.05 }));
      fx.burst(0, 5, P => P.add('puff', { pos: onDisc(g0, 0.2 * S, gy + 0.1), vel: new THREE.Vector3(rnd(-1, 1), rnd(0.1, 0.4), rnd(-1, 1)).multiplyScalar(0.6 * S), drag: 1.8, size: 0.35 * S, size1: 2, life: 0.8, color: c.smoke, blending: NORMAL, opacity: 0.5, fadeIn: 0.2 }));
    }
    if (crit) {
      // a second, wider shockwave a beat later so a crit reads as bigger
      fx.ring(p, E.accent, { r0: 0.1 * S, r1: 0.6 * S, t0: 0.11, life: 0.4, axis: 'camera', tube: 0.025 * S });
    }
    fx.start({ lightLife: el === 'poison' ? 1.2 : 0.6 });
  }

  /** Crystal shards thrown out of an ice hit (shared shape, one material each so they fade alone). */
  _iceShards(fx, p, S, n = 8) {
    const m = this._n(n, fx.density);
    const c = palOf('ice');
    for (let i = 0; i < m; i++) {
      const mesh = new THREE.Mesh(this._shared('octa'), this._basic(i % 2 ? c.hot : c.mid, 0.95));
      const sz = rnd(0.035, 0.06) * S; mesh.scale.set(sz, sz * rnd(1.8, 3.2), sz);
      mesh.position.copy(p);
      const v = randDir(0.3).multiplyScalar(rnd(1.2, 2.6) * S), ax = randDir(), sp = rnd(5, 14);
      fx.anim(0, 0.55, (k, dt) => { v.y -= 4 * dt; mesh.position.addScaledVector(v, dt); mesh.rotateOnAxis(ax, sp * dt); mesh.material.opacity = 0.95 * (1 - k); }, mesh);
    }
  }

  /** Ice spikes that punch up out of the floor in a ring, hold, then sink. */
  _iceSpikes(fx, g0, r, n, h, life, c = palOf('ice'), t0 = 0) {
    if (fx.lite) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2);
      const mesh = new THREE.Mesh(this._shared('spike'), this._basic(i % 2 ? c.hot : c.mid, 0.85));
      const rr = r * rnd(0.8, 1.15), hh = h * rnd(0.7, 1.3), w = hh * 0.22;
      mesh.position.set(g0.x + Math.cos(a) * rr, g0.y, g0.z + Math.sin(a) * rr);
      // leaning outward, like crystals shoved up by the blast
      mesh.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      const delay = rnd(0, 0.08);
      fx.anim(t0 + delay, life, k => {
        const up = k < 0.08 ? easeOut(k / 0.08) : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        mesh.scale.set(w, hh * Math.max(0.001, up), w);
        mesh.material.opacity = 0.85 * (k > 0.75 ? (1 - k) / 0.25 : 1);
      }, mesh);
    }
  }

  /**
   * Several impacts at once (a zone skill). When the points outline an area (3 or more), the area
   * gets its own element signature first — a ring of flame, a frost field with spikes, lightning
   * chained point to point, a toxic haze, a collapsing shadow swirl, a rising halo, a spinning rune
   * ring, a leaf spiral — and each point's burst is thinned so a 12-point ring costs about what four
   * single hits do.
   */
  aoe({ points = [], element = 'arcane', crit = false, stagger = 0.05, ground = null } = {}) {
    if (!points.length) return;
    const n = points.length;
    const density = n <= 2 ? 1 : clamp(2.2 / Math.sqrt(n), 0.3, 1);
    let gy = ground;
    if (n >= 3) {
      const c = new THREE.Vector3(); for (const q of points) c.add(q); c.divideScalar(n);
      let r = 0, minY = Infinity; for (const q of points) { r += Math.hypot(q.x - c.x, q.z - c.z); minY = Math.min(minY, q.y); }
      r = Math.max(0.3, r / n);
      if (gy == null) gy = (minY > 2.4 || minY < -0.2) ? minY - 0.1 : 0;
      this._area(c, r, elementName(element), gy, points, n * stagger);
    }
    points.forEach((pt, i) => {
      const fire = () => this.impact({ at: pt, element, crit, ground: gy, density });
      if (!i) return fire();
      const holder = new THREE.Object3D();
      this._add(holder, i * stagger, () => false, fire);
    });
  }

  /** The area signature under an aoe (see aoe). `pts` are the burst points in order around the ring. */
  _area(center, R, el, gy, pts = [], span = 0.3) {
    const c = palOf(el);
    const g0 = new THREE.Vector3(center.x, gy + 0.03, center.z);
    const fx = new Effect(this, { at: g0.clone().setY(gy + 0.6), life: 4 });
    const rim = (f = 1) => { const a = rnd(0, 6.28), r = R * f * rnd(0.85, 1.08); return new THREE.Vector3(g0.x + Math.cos(a) * r, gy + 0.04, g0.z + Math.sin(a) * r); };
    const life = Math.max(0.6, span + 0.5);
    fx.ring(g0, c.mid, { r0: R * 0.2, r1: R * 1.05, life: 0.5, tube: Math.max(0.03, R * 0.02) });
    if (el === 'fire') {
      fx.emit(0, life, 60 * clamp(R / 2, 0.6, 2), P => P.add(Math.random() < 0.75 ? 'flame' : 'soft', { pos: rim(), vel: new THREE.Vector3(0, rnd(1.0, 2.2), 0), gravity: 0.6, size: rnd(0.3, 0.5), size1: 0.3, life: rnd(0.45, 0.7), color: c.hot, color1: c.deep, spin: rnd(-2, 2) }));
      fx.decal('scorch', g0, { size: R * 2.3, color: 0x140a06, blending: NORMAL, opacity: 0.55, life: 2.8, s0: 0.3, growT: 0.15 });
      fx.decal('soft', g0.clone().setY(gy + 0.035), { size: R * 2.4, color: 0xff5a10, opacity: 0.55, life: 1.2, s0: 0.3, growT: 0.2 });
    } else if (el === 'ice') {
      fx.decal('frost_ring', g0, { size: R * 2.3, color: 0xe8f8ff, opacity: 0.95, life: 2.4, s0: 0.2, growT: 0.15, spin: 0.2 });
      fx.decal('soft', g0.clone().setY(gy + 0.035), { size: R * 2.4, color: c.mid, opacity: 0.35, life: 2.2, s0: 0.2, growT: 0.15 });
      this._iceSpikes(fx, g0, R * 0.95, clamp(Math.round(R * 5), 6, 16), clamp(R * 0.3, 0.35, 0.9), 1.9, c, 0.05);
      fx.emit(0, life, 30, P => P.add('puff', { pos: rim(rnd(0.2, 1)), vel: new THREE.Vector3(rnd(-0.3, 0.3), 0.05, rnd(-0.3, 0.3)), size: rnd(0.5, 0.8), size1: 2, life: rnd(1.2, 1.8), color: 0xcfeeff, opacity: 0.25, fadeIn: 0.3 }));
    } else if (el === 'lightning') {
      // arcs chained from each burst point to the next, crackling around the ring
      const m = pts.length;
      for (let i = 0; i < m; i++) {
        const a = pts[i], b = pts[(i + 1) % m];
        fx.arc(() => [a, b], { t0: i * span / m, life: 0.45, every: 0.05, width: 0.045, color: c.mid, jitter: 0.18, segs: 10, taper: 0.1 });
      }
      fx.decal('crack', g0, { size: R * 1.8, color: 0xfff0b0, opacity: 0.5, life: 1.0, s0: 0.6, growT: 0.05 });
    } else if (el === 'poison') {
      fx.emit(0, life + 0.4, 34 * clamp(R / 2, 0.6, 1.8), P => P.add('puff', { pos: rim(rnd(0, 1)).setY(gy + rnd(0.1, 0.8)), vel: new THREE.Vector3(rnd(-0.2, 0.2), rnd(0, 0.15), rnd(-0.2, 0.2)), size: rnd(0.6, 1.0), size1: 2.0, life: rnd(1.8, 2.4), color: Math.random() < 0.6 ? 0x48c030 : 0x2a6a18, blending: Math.random() < 0.6 ? ADD : NORMAL, opacity: 0.32, fadeIn: 0.3, spin: rnd(-0.4, 0.4) }));
      fx.decal('splat', g0, { size: R * 2.2, color: 0x2e8a1c, blending: NORMAL, opacity: 0.6, life: 2.8, s0: 0.3, growT: 0.15 });
    } else if (el === 'shadow') {
      fx.decal('swirl', g0, { size: R * 2.4, color: 0x000000, blending: NORMAL, opacity: 0.75, life: 1.1, s0: 1.1, s1: 0.1, growT: 1, spin: -5 });
      fx.decal('swirl', g0.clone().setY(gy + 0.035), { size: R * 2.4, color: c.mid, opacity: 0.8, life: 1.0, s0: 1.1, s1: 0.1, growT: 1, spin: -4 });
      fx.burst(0, 20, P => P.add('tendril', { pos: rim(), vel: new THREE.Vector3(0, 0.3, 0), swirl: { cx: g0.x, cz: g0.z, w: -3.5, pull: -R / 0.8 }, size: rnd(0.3, 0.45), size1: 0.6, life: 0.8, color: c.smoke, blending: NORMAL, opacity: 0.85, fadeIn: 0.2, spin: rnd(-3, 3) }));
    } else if (el === 'holy') {
      fx.decal('holy_rune', g0, { size: R * 2.2, opacity: 0.9, life: 1.2, s0: 0.3, growT: 0.2, spin: -0.8 });
      fx.ring(g0, c.hot, { r0: R, r1: R * 1.1, life: 1.0, tube: 0.04, rise: 1.8, opacity: 0.9 });
      fx.ring(g0, c.mid, { r0: R * 0.9, r1: R, t0: 0.15, life: 1.0, tube: 0.03, rise: 1.3, opacity: 0.7 });
      fx.emit(0, life, 40, P => P.add(Math.random() < 0.5 ? 'holy_mote' : 'flare', { pos: rim(), vel: new THREE.Vector3(0, rnd(1, 2), 0), size: rnd(0.12, 0.2), size1: 0.4, life: rnd(0.7, 1.0), color: c.hot, color1: c.deep }));
    } else if (el === 'arcane' || el === 'true') {
      fx.decal('rune_ring', g0, { size: R * 2.3, color: el === 'true' ? 0xffffff : c.mid, opacity: 1, life: 1.2, s0: 0.2, growT: 0.3, spin: 1.6 });
      fx.decal('arcane_rune', g0.clone().setY(gy + 0.035), { size: R * 1.4, opacity: 0.6, life: 1.0, s0: 0.3, growT: 0.3, spin: -2.5 });
      fx.burst(0, 14, P => P.add(pick(GLYPHS), { pos: rim().setY(gy + rnd(0.2, 0.6)), swirl: { cx: g0.x, cz: g0.z, w: 2.5, lift: 0.4 }, size: rnd(0.18, 0.26), size1: 0.6, life: rnd(0.9, 1.2), color: c.hot, color1: c.mid }));
    } else if (el === 'nature') {
      fx.burst(0, 24, P => P.add('leaf', { pos: rim(), swirl: { cx: g0.x, cz: g0.z, w: 3, pull: -R * 0.3, lift: 1.3 }, size: rnd(0.16, 0.24), size1: 0.8, life: rnd(0.9, 1.3), blending: NORMAL, spin: rnd(-6, 6) }));
      fx.decal('root_vine', g0, { size: R * 1.8, blending: NORMAL, opacity: 0.8, life: 1.5, s0: 0.2, growT: 0.25 });
    } else {
      fx.burst(0, 14, P => P.add('puff', { pos: rim(), vel: new THREE.Vector3(0, rnd(0.2, 0.5), 0), drag: 1, size: rnd(0.4, 0.6), size1: 2, life: rnd(0.7, 1.0), color: c.smoke, blending: NORMAL, opacity: 0.5, fadeIn: 0.2 }));
      if (el === 'bleed') fx.decal('splat', g0, { size: R * 1.4, color: 0x7a0808, blending: NORMAL, opacity: 0.7, life: 2.2, s0: 0.3, growT: 0.1 });
    }
    fx.start({ lightLife: life });
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

  /**
   * A brief flare at the caster while a spell is being spoken: a rune on the floor (holy script,
   * a frost ring, a rune ring... by element), the element's own motes rising round the caster and a
   * ring drawing in. `ground` (optional) is the floor height; see _groundY.
   */
  cast({ at, element = 'arcane', ms = 380, ground = null } = {}) {
    const el = elementName(element);
    const E = ELEMENTS[el], c = palOf(el);
    const p = at.clone();
    const gy = this._groundY(p, ground, 0.4) + 0.02;
    const g0 = new THREE.Vector3(p.x, gy, p.z);
    const life = ms / 1000;
    const runeId = { holy: 'holy_rune', ice: 'frost_ring', arcane: 'rune_ring', nature: 'root_vine', shadow: 'swirl', poison: 'splat', fire: 'arcane_rune', lightning: 'arcane_rune' }[el]
      || (this.hasTexture('arcane_rune') ? 'arcane_rune' : 'ring');
    const S = this.scale;
    const fx = new Effect(this, { at: g0.clone().setY(gy + 0.5), life: life + 2 });
    fx.decal(runeId, g0, { size: 1.0 * S, color: el === 'shadow' || el === 'poison' ? c.mid : E.accent, opacity: 0.95, life, s0: 0.5, s1: 1.2, growT: 0.5, fadeIn: 0.3, fadeOut: 0.7, spin: el === 'shadow' ? -5 : 3.4 });
    fx.decal('soft', g0.clone().setY(gy + 0.005), { size: 1.4 * S, color: c.mid, opacity: 0.45, life, s0: 0.4, growT: 0.4, fadeIn: 0.3, fadeOut: 0.6 });
    fx.ring(g0.clone().setY(gy + 0.01), E.color, { r0: 0.55 * S, r1: 0.12 * S, life, tube: 0.02 * S, opacity: 0.8 });
    fx.emit(0, life * 0.8, 20, P => {
      const a = rnd(0, 6.28), r = rnd(0.25, 0.45) * S;
      this._mote(P, el, { pos: new THREE.Vector3(p.x + Math.cos(a) * r, gy + rnd(0.05, 0.3) * S, p.z + Math.sin(a) * r), vel: new THREE.Vector3(0, rnd(0.6, 1.2) * S, 0), size: 0.15 * S, life: life * 1.3, gravity: el === 'bleed' || el === 'physical' ? -2 : 0.8, swirl: { cx: p.x, cz: p.z, w: 3, pull: -0.2 * S } });
    });
    fx.start({ lightLife: life });
    return new Promise(r => setTimeout(r, ms));
  }

  /**
   * One of an element's own particles (used by cast, pillar, vortex, storm, the orb...).
   * `o`: pos, vel, size, life, delay, gravity (overrides the element's own), swirl. World units.
   */
  _mote(P, el, { pos, vel = null, size = 0.16, life = 0.7, delay = 0, gravity = null, swirl = null } = {}) {
    const c = palOf(el);
    const base = { pos, vel, life, delay, swirl };
    const g = v => (gravity ?? v);
    switch (el) {
      case 'fire': return Math.random() < 0.65
        ? P.add('flame', { ...base, size: size * 1.5, size1: 0.25, color: c.hot, color1: c.deep, gravity: g(1.6), spin: rnd(-2, 2) })
        : P.add('soft', { ...base, size: size * 0.5, size1: 0.3, color: 0xffd070, color1: 0xff3000, gravity: g(1.0), flicker: 0.4 });
      case 'ice': return Math.random() < 0.55
        ? P.add('snowflake', { ...base, size, size1: 0.6, gravity: g(-0.5), wobble: 0.5, spin: rnd(-2, 2) })
        : P.add('ice_shard', { ...base, size: size * 0.9, size1: 0.5, color: 0xffffff, color1: c.mid, gravity: g(-2), spin: rnd(-6, 6) });
      case 'lightning': return Math.random() < 0.5
        ? P.add('crackle', { ...base, size: size * 1.6, size1: 1.2, color: 0xffffff, color1: c.mid, flicker: 0.6, gravity: g(0), fadePow: 1 })
        : P.add('streak', { ...base, size: size * 0.6, size1: 0.4, color: 0xffffff, color1: c.mid, gravity: g(-4), stretch: 0.08 });
      case 'poison': return Math.random() < 0.55
        ? P.add('bubble', { ...base, size, size1: 1.3, blending: NORMAL, opacity: 0.9, gravity: g(0.8), wobble: 0.4 })
        : P.add('soft', { ...base, size: size * 0.6, size1: 0.5, color: c.hot, color1: c.deep, gravity: g(-4), stretch: 0.04 });
      case 'shadow': return Math.random() < 0.6
        ? P.add('tendril', { ...base, size: size * 1.8, size1: 1.6, color: c.smoke, blending: NORMAL, opacity: 0.8, gravity: g(0.6), spin: rnd(-2, 2), fadeIn: 0.2 })
        : P.add('wisp', { ...base, size: size * 1.2, size1: 0.6, gravity: g(0.8) });
      case 'holy': return Math.random() < 0.5
        ? P.add('holy_mote', { ...base, size, size1: 0.5, gravity: g(0.8) })
        : P.add('flare', { ...base, size: size * 1.2, size1: 0.3, color: c.hot, color1: c.deep, gravity: g(0.6), flicker: 0.3, spin: 2 });
      case 'arcane': return Math.random() < 0.6
        ? P.add(pick(GLYPHS), { ...base, size: size * 1.1, size1: 0.6, color: c.hot, color1: c.mid, gravity: g(0.2), spin: rnd(-2, 2), drag: 1.5 })
        : P.add('arcane_shard', { ...base, size, size1: 0.4, gravity: g(-0.5), spin: rnd(-8, 8), drag: 1 });
      case 'nature': return Math.random() < 0.7
        ? P.add('leaf', { ...base, size: size * 1.1, size1: 0.8, blending: NORMAL, gravity: g(-0.6), wobble: 0.8, spin: rnd(-6, 6) })
        : P.add('soft', { ...base, size: size * 0.4, size1: 0.4, color: c.hot, gravity: g(0.4), flicker: 0.5 });
      case 'bleed': return P.add('drop', { ...base, size: size * 0.8, size1: 0.7, blending: NORMAL, gravity: g(-7) });
      case 'physical': return P.add('streak', { ...base, size: size * 0.6, size1: 0.4, color: 0xffffff, color1: 0xffd080, gravity: g(-8), stretch: 0.06 });
      default: return P.add('flare', { ...base, size, size1: 0.3, color: c.hot, color1: c.mid, gravity: g(0) });
    }
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

  // ---- channelled and area spells (2026-09-25) -------------------------------------------------

  /**
   * One pulse of a breath / flamethrower cone from `from` along `dir` (flattened to horizontal),
   * `length` metres long and `arc` radians wide. A game calls it ~4 times a second while the skill
   * channels; each pulse emits for `ms` and its particles live a little longer, so pulses overlap
   * into one continuous stream.
   */
  breath({ from, dir, length = 7, arc = 0.9, element = 'fire', ms = 300 } = {}) {
    if (!from || !dir) return;
    const el = elementName(element), c = palOf(el), sc = this.scale;
    const d = new THREE.Vector3(dir.x, 0, dir.z);
    if (d.lengthSq() < 1e-8) d.set(0, 0, 1);
    d.normalize();
    const side = new THREE.Vector3(-d.z, 0, d.x);
    const dur = Math.max(0.05, ms / 1000);
    const L = Math.max(0.5, length);
    const life = el === 'lightning' ? 0.3 : el === 'poison' ? 0.95 : el === 'shadow' ? 0.7 : 0.55;
    const speed = L / life;
    const wEnd = clamp(2 * L * Math.tan(Math.min(1.4, arc) / 2) * 0.55, 0.5, 5);   // particle size at the far end
    const mouth = from.clone().addScaledVector(d, 0.2);
    const fx = new Effect(this, { at: from.clone().addScaledVector(d, L * 0.4), life: dur + life + 1.5 });
    const dirIn = (spread = 1) => {
      const yaw = rnd(-arc / 2, arc / 2) * spread;
      return d.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(side, Math.sin(yaw)).add(new THREE.Vector3(0, rnd(-0.05, 0.1), 0)).normalize();
    };
    const J = r => mouth.clone().add(randDir().multiplyScalar(r * sc));
    const grow = s0 => wEnd / Math.max(0.05, s0);
    fx.flash(mouth, { size: 0.5 * sc, color: c.hot, life: dur, opacity: 0.8, grow: 0.4 });
    if (el === 'fire') {
      fx.emit(0, dur, 80, P => { const s0 = rnd(0.22, 0.32) * sc; return P.add(Math.random() < 0.65 ? 'flame' : 'soft', { pos: J(0.05), vel: dirIn().multiplyScalar(speed * rnd(0.75, 1.05)), drag: 0.5, gravity: 1.2, size: s0, size1: grow(s0), life: life * rnd(0.85, 1.1), color: 0xfff0b0, color1: 0xb82008, opacity: 0.9, fadeIn: 0.04, fadePow: 1.6, spin: rnd(-2, 2) }); });
      fx.emit(0, dur, 25, P => P.add('soft', { pos: J(0.05), vel: dirIn(1.2).multiplyScalar(speed * rnd(0.6, 1.1)).add(new THREE.Vector3(0, rnd(0.3, 1), 0)), drag: 0.8, gravity: 1, size: rnd(0.04, 0.07) * sc, size1: 0.4, life: life * 1.4, color: 0xffe080, color1: 0xff2a00, stretch: 0.04, flicker: 0.4 }));
      fx.emit(0.08, dur, 9, P => P.add('puff', { pos: mouth.clone().addScaledVector(dirIn(), L * rnd(0.55, 0.95)), vel: new THREE.Vector3(0, rnd(0.6, 1.1), 0), size: wEnd * 0.5, size1: 2, life: rnd(0.8, 1.1), color: c.smoke, blending: NORMAL, opacity: 0.4, fadeIn: 0.35, spin: rnd(-1, 1) }));
    } else if (el === 'ice') {
      fx.emit(0, dur, 55, P => { const s0 = rnd(0.2, 0.3) * sc; return P.add('puff', { pos: J(0.05), vel: dirIn().multiplyScalar(speed * rnd(0.7, 1.0)), drag: 0.6, size: s0, size1: grow(s0), life: life * rnd(0.9, 1.15), color: 0xdcf4ff, opacity: 0.45, fadeIn: 0.08, spin: rnd(-1, 1) }); });
      fx.emit(0, dur, 30, P => P.add(Math.random() < 0.5 ? 'snowflake' : 'ice_shard', { pos: J(0.05), vel: dirIn(0.9).multiplyScalar(speed * rnd(0.8, 1.2)), drag: 0.4, gravity: -1, size: rnd(0.1, 0.16) * sc, size1: 0.7, life: life * 1.1, color: 0xffffff, color1: c.mid, spin: rnd(-6, 6) }));
      fx.emit(0, dur, 18, P => P.add('flare', { pos: mouth.clone().addScaledVector(dirIn(), L * rnd(0.1, 0.9)), size: rnd(0.1, 0.18) * sc, size1: 0.2, life: 0.2, color: 0xffffff, color1: c.mid, spin: 4 }));
    } else if (el === 'poison') {
      fx.emit(0, dur, 45, P => { const s0 = rnd(0.25, 0.35) * sc; return P.add('puff', { pos: J(0.05), vel: dirIn().multiplyScalar(speed * rnd(0.6, 0.95)), drag: 1.1, gravity: -0.25, size: s0, size1: grow(s0) * 1.2, life: life * rnd(0.9, 1.2), color: Math.random() < 0.65 ? 0x58d038 : 0x264a18, blending: Math.random() < 0.65 ? ADD : NORMAL, opacity: 0.42, fadeIn: 0.1, spin: rnd(-0.8, 0.8) }); });
      fx.emit(0, dur, 14, P => P.add('bubble', { pos: J(0.05), vel: dirIn().multiplyScalar(speed * rnd(0.4, 0.8)), drag: 1.2, gravity: 0.4, size: rnd(0.08, 0.14) * sc, size1: 1.4, life: life * 0.9, blending: NORMAL, opacity: 0.85 }));
      fx.emit(0, dur, 12, P => P.add('soft', { pos: J(0.05), vel: dirIn().multiplyScalar(speed * rnd(0.3, 0.6)), gravity: -6, size: 0.08 * sc, size1: 0.6, life: 0.5, color: c.hot, color1: c.deep, stretch: 0.04 }));
    } else if (el === 'shadow') {
      fx.emit(0, dur, 45, P => { const s0 = rnd(0.25, 0.35) * sc; return P.add(Math.random() < 0.6 ? 'tendril' : 'puff', { pos: J(0.05), vel: dirIn().multiplyScalar(speed * rnd(0.7, 1.0)), drag: 0.8, size: s0, size1: grow(s0), life: life * rnd(0.85, 1.1), color: c.smoke, blending: NORMAL, opacity: 0.8, fadeIn: 0.08, spin: rnd(-2, 2) }); });
      fx.emit(0, dur, 30, P => { const s0 = rnd(0.18, 0.26) * sc; return P.add(Math.random() < 0.5 ? 'wisp' : 'soft', { pos: J(0.05), vel: dirIn().multiplyScalar(speed * rnd(0.7, 1.05)), drag: 0.6, size: s0, size1: grow(s0) * 0.6, life: life * 0.9, color: c.hot, color1: c.deep, opacity: 0.8, spin: rnd(-2, 2) }); });
    } else if (el === 'arcane' || el === 'true') {
      fx.emit(0, dur, 45, P => { const s0 = rnd(0.2, 0.28) * sc; return P.add('soft', { pos: J(0.05), vel: dirIn().multiplyScalar(speed * rnd(0.75, 1.0)), drag: 0.5, size: s0, size1: grow(s0) * 0.8, life: life * rnd(0.9, 1.1), color: c.hot, color1: c.deep, opacity: 0.6 }); });
      fx.emit(0, dur, 24, P => { const v = dirIn().multiplyScalar(speed * rnd(0.7, 1.0)); return P.add(pick(GLYPHS), { pos: J(0.05), vel: v, drag: 0.4, size: rnd(0.14, 0.22) * sc, size1: 1.6, life: life, color: c.hot, color1: c.mid, spin: rnd(-4, 4) }); });
      fx.emit(0, dur, 18, P => P.add('arcane_shard', { pos: J(0.05), vel: dirIn(1.1).multiplyScalar(speed * rnd(0.9, 1.3)), size: rnd(0.1, 0.15) * sc, size1: 0.6, life: life * 0.8, spin: rnd(-8, 8) }));
    } else if (el === 'lightning') {
      // arcs that fork out of the mouth to points inside the cone, re-rolled every frame or two
      for (let i = 0; i < 3; i++) {
        let tip = null;
        fx.arc(() => { tip = mouth.clone().addScaledVector(dirIn(), L * rnd(0.55, 1.0)); return [mouth, tip]; }, { t0: i * dur / 3, life: Math.max(0.12, dur * 0.8), every: 0.045, width: 0.055 * sc, color: c.mid, jitter: 0.08 * L, segs: 12, taper: 0.5 });
      }
      fx.emit(0, dur, 40, P => P.add('crackle', { pos: mouth.clone().addScaledVector(dirIn(), L * rnd(0.1, 1.0)), size: rnd(0.25, 0.45) * sc, size1: 1.2, life: 0.1, color: 0xffffff, color1: c.mid, flicker: 0.5, fadePow: 1 }));
      fx.emit(0, dur, 30, P => P.add('streak', { pos: J(0.05), vel: dirIn().multiplyScalar(speed * rnd(0.8, 1.2)), size: rnd(0.07, 0.1) * sc, size1: 0.5, life: life * 0.8, color: 0xffffff, color1: c.mid, stretch: 0.03 }));
    } else {
      // holy / nature / physical / bleed: the element's own motes carried down the cone
      fx.emit(0, dur, 50, P => this._mote(P, el, { pos: J(0.05), vel: dirIn().multiplyScalar(speed * rnd(0.7, 1.05)), size: rnd(0.16, 0.24) * sc, life: life, gravity: 0 }));
      fx.emit(0, dur, 30, P => { const s0 = rnd(0.2, 0.3) * sc; return P.add('soft', { pos: J(0.05), vel: dirIn().multiplyScalar(speed * rnd(0.7, 1.0)), drag: 0.5, size: s0, size1: grow(s0) * 0.7, life: life, color: c.mid, color1: c.deep, opacity: el === 'physical' ? 0.3 : 0.55 }); });
    }
    fx.start({ lightLife: dur + 0.15 });
  }

  /**
   * A glowing orb a caller moves every frame (it orbits the player and zaps things). Returns
   * { group, setPosition(vec3), pulse(), dispose() }. `pulse()` flashes it when it strikes. The orb
   * reports its glow through lights() for as long as it exists, and is never retired by the
   * maxLive cap — its owner has to dispose() it.
   */
  orbitOrb({ element = 'lightning', size = 0.25 } = {}) {
    const el = elementName(element), c = palOf(el), sc = this.scale;
    const g = new THREE.Group(); g.name = 'spellfx-orb';
    const sz = size / sc;
    // Built lazily: an orb cast in the first second after load arrives before the sprite textures do,
    // and `_sprite` gives back null without one — so keep trying until the textures are in.
    let halo = null, flare = null, core = null, rim = null, dressed = false;
    const bits = [];
    const dress = () => {
      if (dressed || !this.hasTexture('soft')) return;
      dressed = true;
      // strong enough to read against daylit ground, where a pale additive glow washes out
      halo = this._sprite('soft', { size: sz * 3.2, color: c.mid, opacity: 0.9 });
      flare = el === 'shadow' ? null : this._sprite('flare', { size: sz * 2.4, color: c.mid, opacity: 0.95 });
      core = el === 'shadow'
        ? this._sprite('soft', { size: sz * 1.3, color: 0x000000, opacity: 0.9, blending: NORMAL })
        : this._sprite('soft', { size: sz * 1.4, color: c.hot, opacity: 1 });
      rim = el === 'shadow' ? this._sprite('soft', { size: sz * 1.9, color: c.hot, opacity: 0.7 }) : null;
      if (halo) g.add(halo); if (flare) g.add(flare); if (rim) g.add(rim); if (core) { core.renderOrder = 2; g.add(core); }
      const bitId = { lightning: 'crackle', fire: 'flame', ice: 'snowflake', poison: 'bubble', shadow: 'wisp', holy: 'flare', arcane: null, nature: 'leaf', bleed: 'drop', physical: 'spark' }[el] || 'flare';
      for (let i = 0; i < 3; i++) {
        const id = bitId || GLYPHS[i];
        const normal = el === 'poison' || el === 'nature' || el === 'bleed';
        const b = this._sprite(id, { size: sz * (el === 'lightning' ? 2.2 : 0.9), color: el === 'arcane' ? c.hot : 0xffffff, opacity: 0.9, blending: normal ? NORMAL : ADD });
        if (b) { g.add(b); bits.push({ s: b, a: (i / 3) * Math.PI * 2, tilt: rnd(-0.8, 0.8) }); }
      }
    };
    dress();
    const P = new Particles(this); this.root.add(P.group);
    let pulse = 0, acc = 0, flick = 0;
    const lastPos = new THREE.Vector3(); let hasLast = false;
    const e = this._add(g, 0, dt => {
      if (!dressed) dress();
      const t = this._t;
      pulse = Math.max(0, pulse - dt * 3.5);
      const boost = 1 + pulse * 1.3;
      const breathe = 1 + Math.sin(t * 7) * 0.08 + (el === 'lightning' || el === 'fire' ? (Math.random() - 0.5) * 0.12 : 0);
      if (halo) { halo.scale.setScalar(sz * 3.2 * sc * breathe * boost); halo.material.opacity = 0.8 + pulse * 0.2; }
      if (flare) { flare.scale.setScalar(sz * 2.4 * sc * breathe * boost); flare.material.rotation += dt * 2; }
      if (core) core.scale.setScalar(sz * 1.4 * sc * (el === 'shadow' ? 1 : breathe) * (1 + pulse * 0.5));
      if (rim) rim.scale.setScalar(sz * 1.9 * sc * breathe);
      flick -= dt;
      const reroll = flick <= 0; if (reroll) flick = 0.06;
      for (const b of bits) {
        if (el === 'lightning') {
          // crackles snap to a new angle every few frames instead of orbiting smoothly
          if (reroll) { b.s.material.rotation = rnd(0, 6.28); b.s.position.copy(randDir()).multiplyScalar(size * 0.35); }
          b.s.material.opacity = Math.random() < 0.8 ? 0.9 : 0.2;
        } else {
          b.a += dt * (el === 'shadow' ? -4 : 4.5);
          const r = size * 0.9;
          b.s.position.set(Math.cos(b.a) * r, Math.sin(b.a) * r * b.tilt * 0.5, Math.sin(b.a) * r);
          b.s.material.rotation += dt * 3;
        }
      }
      // a short wake of the element's own motes, so the orbit reads as a path
      if (hasLast && lastPos.distanceToSquared(g.position) > 1e-6) {
        acc += dt * 16 * this.budgetScale();
        while (acc >= 1) { acc -= 1; this._mote(P, el, { pos: g.position.clone().add(randDir().multiplyScalar(size * 0.4)), size: size * 0.45, life: 0.4, gravity: el === 'fire' ? 1 : 0 }); }
      }
      lastPos.copy(g.position); hasLast = true;
      P.update(dt);
      if (e.glow) e.glow.intensity = 1.6 * (1 + pulse * 2);
      return false;
    }, () => { P.dispose(); disposeObj(P.group); });
    e.persistent = true;
    e.glow = { color: '#' + new THREE.Color(ELEMENTS[el].color).getHexString(), range: 6, intensity: 1.6, moving: true };
    const self = this;
    return {
      group: g,
      setPosition(v) { if (v) g.position.copy(v); },
      pulse() {
        pulse = 1;
        const m = self._n(8);
        for (let i = 0; i < m; i++) {
          if (el === 'lightning') P.add('streak', { pos: g.position.clone(), vel: randDir().multiplyScalar(rnd(2, 4) * sc), size: 0.08 * sc, size1: 0.4, life: 0.25, color: 0xffffff, color1: c.mid, stretch: 0.05 });
          else self._mote(P, el, { pos: g.position.clone(), vel: randDir().multiplyScalar(rnd(1, 2) * sc), size: size * 0.6, life: 0.4 });
        }
        const f = self._sprite('flare', { size: sz * 3, color: c.hot, opacity: 1 });
        if (f) { g.add(f); let k = 0; self._add(new THREE.Object3D(), 0.16, dt => { k += dt / 0.16; f.material.opacity = 1 - k; f.scale.setScalar(sz * 3 * sc * (0.6 + k)); return false; }, () => { g.remove(f); f.material.dispose(); }); }
      },
      dispose() { self._end(e); },
    };
  }

  /**
   * A column of light slamming down onto a spot (a judgement strike), `radius` metres across at the
   * ground ring. The beam drops out of the sky in the first ~12% of `ms`, flashes, throws the
   * element's motes out, then narrows and fades. Colours and floor mark follow the element.
   */
  pillar({ at, radius = 3, element = 'holy', ms = 700 } = {}) {
    if (!at) return;
    const el = elementName(element), c = palOf(el);
    const dur = Math.max(0.2, ms / 1000);
    const gy = at.y + 0.03;
    const g0 = new THREE.Vector3(at.x, gy, at.z);
    const R = Math.max(0.3, radius);
    const H = clamp(R * 3, 6, 14);
    const tHit = dur * 0.12;
    const fx = new Effect(this, { at: g0.clone().setY(gy + 1), life: dur + 3 });
    fx.beam(g0, { radius: R * 0.3, height: H, color: el === 'shadow' ? c.mid : c.mid, life: dur, drop: 0.12, narrow: 0.85 });
    if (el === 'lightning') {
      for (let i = 0; i < 3; i++) fx.arc(() => [new THREE.Vector3(g0.x + rnd(-0.3, 0.3) * R, gy + H, g0.z + rnd(-0.3, 0.3) * R), g0.clone().add(new THREE.Vector3(rnd(-0.2, 0.2) * R, 0, rnd(-0.2, 0.2) * R))], { t0: tHit * 0.6 + i * 0.05, life: dur * 0.6, every: 0.05, width: 0.12, color: c.mid, jitter: 0.6, segs: 18, taper: 0.1 });
    }
    // the slam
    fx.flash(g0.clone().setY(gy + Math.max(0.5, R * 0.5)), { id: 'flare', size: R * 1.5, color: 0xffffff, t0: tHit, life: 0.18, grow: 1 });
    fx.flash(g0.clone().setY(gy + 0.4), { size: R * 2.4, color: c.mid, t0: tHit, life: 0.35 });
    fx.ring(g0, c.hot, { r0: R * 0.15, r1: R, t0: tHit, life: 0.45, tube: Math.max(0.04, R * 0.025) });
    fx.ring(g0, c.mid, { r0: R * 0.3, r1: R * 1.2, t0: tHit + 0.08, life: 0.6, tube: Math.max(0.03, R * 0.015), opacity: 0.7 });
    const mark = { holy: 'holy_rune', arcane: 'rune_ring', true: 'rune_ring', ice: 'frost_ring', fire: 'scorch', poison: 'splat', shadow: 'swirl', lightning: 'crack', nature: 'root_vine', bleed: 'splat', physical: 'crack' }[el] || 'ring';
    const dark = mark === 'scorch' || el === 'shadow' || el === 'bleed' || el === 'nature';
    fx.decal(mark, g0, { size: R * 2, color: dark ? (el === 'nature' ? 0xffffff : 0x0c0608) : el === 'poison' ? 0x2e8a1c : 0xffffff, blending: dark || el === 'poison' ? NORMAL : ADD, opacity: 0.9, t0: tHit, life: dur - tHit + 1.2, s0: 0.3, growT: 0.12, spin: el === 'shadow' ? -3 : el === 'holy' || el === 'arcane' ? -0.8 : 0 });
    fx.decal('soft', g0.clone().setY(gy + 0.01), { size: R * 2.4, color: c.mid, opacity: 0.6, t0: tHit, life: dur, s0: 0.3, growT: 0.1 });
    if (el === 'ice') this._iceSpikes(fx, g0, R * 0.85, clamp(Math.round(R * 4), 6, 14), clamp(R * 0.3, 0.4, 1), dur + 0.6, c, tHit);
    // debris / motes thrown out of the slam, then motes climbing the column while it holds
    fx.burst(tHit, 28, P => this._mote(P, el, { pos: onDisc(g0, R * 0.3, gy + 0.1), vel: randDir(0.8).multiplyScalar(rnd(2, 4)).setY(rnd(1.5, 4)), size: rnd(0.18, 0.28), life: rnd(0.6, 1.0), gravity: -3 }));
    fx.emit(tHit, dur - tHit, 30, P => this._mote(P, el, { pos: onDisc(g0, R * 0.28, gy + 0.1), vel: new THREE.Vector3(0, rnd(2, 4), 0), size: rnd(0.14, 0.22), life: rnd(0.6, 1.0), gravity: 0 }));
    fx.start({ lightLife: dur + 0.2, lightPos: g0.clone().setY(gy + 1.2) });
  }

  /**
   * A swirling rift on the ground (a pull spell): two counter-spinning swirl discs, a rim, and the
   * element's particles spiralling in from the rim to vanish at the centre. Shadow draws a real dark
   * hole (normal blending); the others glow.
   */
  vortex({ at, radius = 4, element = 'shadow', ms = 1500 } = {}) {
    if (!at) return;
    const el = elementName(element), c = palOf(el);
    const dur = Math.max(0.3, ms / 1000);
    const gy = at.y + 0.03, R = Math.max(0.3, radius);
    const g0 = new THREE.Vector3(at.x, gy, at.z);
    const fx = new Effect(this, { at: g0.clone().setY(gy + 0.8), life: dur + 2 });
    const fade = (fadeIn = 0.12) => ({ fadeIn: Math.min(0.4, fadeIn / dur), fadeOut: Math.min(0.4, 0.3 / dur) });
    const darkHole = el === 'shadow' || el === 'arcane';
    if (darkHole) fx.decal('soft', g0, { size: R * 2.1, color: 0x000000, blending: NORMAL, opacity: 0.85, life: dur, s0: 0.2, growT: 0.15 / dur, ...fade() });
    fx.decal('swirl', g0.clone().setY(gy + 0.005), { size: R * 2.2, color: darkHole ? c.smoke : c.deep, blending: NORMAL, opacity: 0.7, life: dur, s0: 0.3, growT: 0.2 / dur, spin: -4.5, ...fade() });
    fx.decal('swirl', g0.clone().setY(gy + 0.01), { size: R * 2.0, color: c.mid, opacity: 0.85, life: dur, s0: 0.3, growT: 0.2 / dur, spin: -2.6, ...fade() });
    fx.decal(el === 'arcane' ? 'rune_ring' : 'ring', g0.clone().setY(gy + 0.015), { size: R * 2.1, color: c.hot, opacity: 0.8, life: dur, s0: 0.5, growT: 0.2 / dur, spin: 1.2, ...fade() });
    // particles born on the rim that spiral in and die at the middle
    const inT = 0.9;
    fx.emit(0, dur - inT * 0.5, 70 * clamp(R / 3, 0.6, 1.6), P => {
      const a = rnd(0, 6.28), r = R * rnd(0.85, 1.1);
      const pos = new THREE.Vector3(g0.x + Math.cos(a) * r, gy + rnd(0.05, 0.4), g0.z + Math.sin(a) * r);
      const swirl = { cx: g0.x, cz: g0.z, w: -rnd(3, 4.5), pull: -r / inT, lift: rnd(0.1, 0.5) };
      if (el === 'shadow') return Math.random() < 0.65
        ? P.add('tendril', { pos, swirl, size: rnd(0.35, 0.55), size1: 0.3, life: inT, color: c.smoke, blending: NORMAL, opacity: 0.85, fadeIn: 0.2, fadePow: 3, spin: rnd(-3, 3) })
        : P.add('soft', { pos, swirl, size: rnd(0.15, 0.25), size1: 0.3, life: inT, color: c.hot, color1: c.mid, opacity: 0.9, fadeIn: 0.2 });
      return this._mote(P, el, { pos, swirl, size: rnd(0.16, 0.24), life: inT, gravity: 0 });
    });
    // the centre: a dark core for shadow, a hot one for the rest, throbbing
    const core = this._sprite('soft', { size: R * 0.7 / this.scale, color: el === 'shadow' ? 0x000000 : c.hot, opacity: 0, blending: el === 'shadow' ? NORMAL : ADD });
    if (core) { core.position.copy(g0).setY(gy + 0.3); core.renderOrder = 3; const b = core.scale.x; fx.anim(0, dur, (k, dt, t) => { core.scale.setScalar(b * (0.8 + Math.sin(t * 9) * 0.12)); core.material.opacity = 0.9 * (k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1); }, core); }
    fx.ring(g0.clone().setY(gy + 0.05), c.mid, { r0: R * 1.1, r1: R * 0.1, t0: dur - 0.35, life: 0.35, tube: 0.04 });
    fx.flash(g0.clone().setY(gy + 0.4), { size: R * 1.2, color: c.hot, t0: dur - 0.05, life: 0.3 });
    fx.start({ lightLife: dur });
  }

  /**
   * Weather over a circle for `ms`: hail and snow with a frost field for ice, a rolling toxic cloud
   * for poison, strikes from a dark cloud for lightning, falling cinders for fire, and the element's
   * own motes raining down for the rest.
   */
  storm({ at, radius = 5, element = 'ice', ms = 3000 } = {}) {
    if (!at) return;
    const el = elementName(element), c = palOf(el);
    const dur = Math.max(0.3, ms / 1000);
    const gy = at.y + 0.03, R = Math.max(0.5, radius);
    const g0 = new THREE.Vector3(at.x, gy, at.z);
    const top = gy + clamp(R * 0.9, 3.2, 6);
    const area = clamp((R / 5) * (R / 5), 0.6, 2.2);   // spawn rates scale with the area, capped
    const fx = new Effect(this, { at: g0.clone().setY(gy + 1.5), life: dur + 3.5 });
    const f = { fadeIn: Math.min(0.3, 0.3 / dur), fadeOut: Math.min(0.35, 0.6 / dur) };
    const cloud = (col, op, rate = 8) => fx.emit(0, dur - 0.4, rate * clamp(area, 0.5, 1.5), P => P.add('puff', { pos: onDisc(g0, R * 0.9, top + rnd(-0.3, 0.4)), vel: new THREE.Vector3(rnd(-0.3, 0.3), 0, rnd(-0.3, 0.3)), size: rnd(1.6, 2.4) * clamp(R / 5, 0.6, 1.4), size1: 1.4, life: rnd(1.6, 2.2), color: col, blending: NORMAL, opacity: op, fadeIn: 0.3, spin: rnd(-0.3, 0.3) }));
    if (el === 'poison') {
      // no rain: a thick cloud rolling round the circle at knee to head height
      fx.emit(0, dur - 0.6, 26 * area, P => {
        const q = onDisc(g0, R * 0.9, gy + rnd(0.15, 1.3));
        const add = Math.random() < 0.55;
        return P.add('puff', { pos: q, vel: new THREE.Vector3(rnd(-0.2, 0.2), rnd(0, 0.1), rnd(-0.2, 0.2)), swirl: { cx: g0.x, cz: g0.z, w: 0.35 }, size: rnd(0.35, 0.5) * R, size1: 1.6, life: rnd(2.0, 2.8), color: add ? 0x4cc034 : 0x203e14, blending: add ? ADD : NORMAL, opacity: add ? 0.3 : 0.42, fadeIn: 0.3, spin: rnd(-0.3, 0.3) });
      });
      fx.emit(0.2, dur - 0.4, 14 * area, P => P.add('bubble', { pos: onDisc(g0, R * 0.9, gy + 0.05), vel: new THREE.Vector3(0, rnd(0.3, 0.7), 0), wobble: 0.3, size: rnd(0.1, 0.2), size1: 1.6, life: rnd(0.7, 1.1), blending: NORMAL, opacity: 0.9, onDie: q => fx.P.add('soft', { pos: q.s.position, size: 0.14, size1: 2, life: 0.12, color: c.hot }) }));
      fx.decal('splat', g0, { size: R * 2.1, color: 0x2e8a1c, blending: NORMAL, opacity: 0.55, life: dur + 0.8, s0: 0.3, growT: 0.1, ...f });
      fx.decal('soft', g0.clone().setY(gy + 0.01), { size: R * 2.4, color: 0x60ff40, opacity: 0.25, life: dur + 0.5, s0: 0.3, growT: 0.1, ...f });
    } else if (el === 'ice') {
      cloud(0x6a7890, 0.55);
      const splash = q => { fx.P.add('flare', { pos: q.s.position.clone().setY(gy + 0.05), size: 0.3, size1: 0.3, life: 0.12, color: 0xffffff, color1: c.mid }); fx.P.add('puff', { pos: q.s.position.clone().setY(gy + 0.1), vel: new THREE.Vector3(0, 0.3, 0), size: 0.25, size1: 2, life: 0.5, color: 0xdff4ff, opacity: 0.3 }); };
      fx.emit(0.25, dur - 0.5, 50 * area, P => { const q = onDisc(g0, R, top); const fall = top - gy, vy = rnd(9, 12); return P.add(Math.random() < 0.7 ? 'streak' : 'ice_shard', { pos: q, vel: new THREE.Vector3(0.8, -vy, 0.3), size: rnd(0.14, 0.22), size1: 1, life: fall / vy, color: 0xeaf8ff, color1: c.mid, fadeIn: 0.05, fadePow: 8, stretch: 0.025, onDie: splash }); });
      fx.emit(0, dur - 0.3, 22 * area, P => P.add('snowflake', { pos: onDisc(g0, R, rnd(gy + 0.5, top)), vel: new THREE.Vector3(0.3, -rnd(0.7, 1.2), 0.1), wobble: 0.6, size: rnd(0.12, 0.2), size1: 0.8, life: rnd(1.4, 2.2), spin: rnd(-2, 2) }));
      fx.emit(0.3, dur - 0.5, 8 * area, P => P.add('puff', { pos: onDisc(g0, R * 0.9, gy + 0.15), vel: new THREE.Vector3(rnd(-0.2, 0.2), 0.03, rnd(-0.2, 0.2)), size: rnd(0.9, 1.3), size1: 1.6, life: rnd(1.6, 2.2), color: 0xdcf2ff, opacity: 0.22, fadeIn: 0.3 }));
      fx.decal('frost_ring', g0, { size: R * 2.1, color: 0xe8f8ff, opacity: 0.8, life: dur + 1, s0: 0.2, growT: 0.4 / (dur + 1), spin: 0.12, ...f });
      fx.decal('soft', g0.clone().setY(gy + 0.01), { size: R * 2.4, color: c.mid, opacity: 0.35, life: dur + 1, s0: 0.2, growT: 0.4 / (dur + 1), ...f });
    } else if (el === 'lightning') {
      cloud(0x2a2c3c, 0.7, 10);
      // strikes: a bolt from the cloud to a random point, with a flash and crackles where it lands
      const n = Math.max(3, Math.round(dur * 4 * clamp(area, 0.6, 1.6)));
      for (let i = 0; i < n; i++) {
        const t0 = 0.35 + (i / n) * (dur - 0.6) + rnd(-0.05, 0.05);
        const hit = onDisc(g0, R * 0.95, gy);
        const sky = hit.clone().add(new THREE.Vector3(rnd(-0.6, 0.6), top - gy, rnd(-0.6, 0.6)));
        fx.arc(() => [sky, hit], { t0, life: 0.22, every: 0.04, width: 0.1, color: c.mid, jitter: 0.5, segs: 16, taper: 0.2 });
        fx.flash(hit.clone().setY(gy + 0.6), { id: 'flare', size: 1.1, color: 0xffffff, t0, life: 0.12 });
        fx.burst(t0, 6, P => P.add('streak', { pos: hit.clone().setY(gy + 0.1), vel: randDir(0.6).multiplyScalar(rnd(2, 4)), gravity: -8, size: 0.1, size1: 0.5, life: 0.35, color: 0xffffff, color1: c.mid, stretch: 0.04 }));
        fx.decal('crack', hit, { size: 1.2, color: 0xfff0b0, opacity: 0.6, t0, life: 0.8, s0: 0.7, growT: 0.05 });
      }
      fx.decal('soft', g0, { size: R * 2.2, color: 0x6070c0, opacity: 0.25, life: dur, s0: 0.5, growT: 0.1, ...f });
    } else if (el === 'fire') {
      cloud(0x2a201c, 0.6);
      const ember = q => { fx.P.add('flame', { pos: q.s.position.clone().setY(gy + 0.1), vel: new THREE.Vector3(0, 0.8, 0), size: 0.35, size1: 0.3, life: 0.35, color: c.hot, color1: c.deep }); };
      fx.emit(0.25, dur - 0.5, 45 * area, P => { const q = onDisc(g0, R, top), fall = top - gy, vy = rnd(6, 8); return P.add('streak', { pos: q, vel: new THREE.Vector3(0.6, -vy, 0.2), size: rnd(0.16, 0.26), size1: 1, life: fall / vy, color: 0xffe080, color1: c.mid, fadeIn: 0.05, fadePow: 8, stretch: 0.03, onDie: ember }); });
      fx.decal('scorch', g0, { size: R * 2.1, color: 0x140a06, blending: NORMAL, opacity: 0.5, life: dur + 1, s0: 0.3, growT: 0.2, ...f });
      fx.decal('soft', g0.clone().setY(gy + 0.01), { size: R * 2.4, color: 0xff5a10, opacity: 0.3, life: dur, s0: 0.3, growT: 0.2, ...f });
    } else {
      // holy light, arcane glyphs, shadow ash, falling leaves, red rain...: the element's motes falling
      if (el === 'shadow' || el === 'bleed' || el === 'physical') cloud(c.smoke, 0.55);
      fx.emit(0.1, dur - 0.4, 40 * area, P => this._mote(P, el, { pos: onDisc(g0, R, rnd(gy + 1, top)), vel: new THREE.Vector3(rnd(-0.2, 0.2), -rnd(1.2, 2.2), rnd(-0.2, 0.2)), size: rnd(0.18, 0.28), life: rnd(1.2, 1.8), gravity: -0.5 }));
      fx.decal(el === 'holy' ? 'holy_rune' : el === 'arcane' || el === 'true' ? 'rune_ring' : 'soft', g0, { size: R * 2.1, color: el === 'holy' || el === 'arcane' || el === 'true' ? c.mid : c.deep, opacity: 0.6, life: dur + 0.5, s0: 0.3, growT: 0.2, spin: 0.2, ...f });
    }
    fx.start({ lightLife: dur });
  }

  /**
   * A small elemental footprint patch left on the ground (a fire-walking trail): lasts ~2.5 s and
   * fades. `yaw` (optional) turns the print to the walking direction; `dir` (optional vec3) works too.
   */
  footfall({ at, element = 'fire', yaw = null, dir = null, size = 0.45 } = {}) {
    if (!at) return;
    const el = elementName(element), c = palOf(el);
    const gy = at.y + 0.03;
    const g0 = new THREE.Vector3(at.x, gy, at.z);
    const fx = new Effect(this, { at: g0.clone().setY(gy + 0.3), life: 3.2 });
    const y = yaw != null ? yaw : dir ? Math.atan2(dir.x, dir.z) + Math.PI : rnd(0, 6.28);
    const life = 2.5;
    const darkId = el === 'fire' || el === 'lightning' ? 'scorch' : null;
    // a charred or stained print under a glowing one that fades faster
    fx.decal('footprint', g0, { size, color: darkId ? 0x160c08 : c.deep, blending: NORMAL, opacity: darkId ? 0.7 : 0.55, life, s0: 0.85, growT: 0.05, fadeOut: 0.5, yaw: y });
    fx.decal('footprint', g0.clone().setY(gy + 0.005), { size: size * 1.05, color: el === 'fire' ? 0xff6a10 : c.mid, opacity: 0.95, life: life * 0.6, s0: 0.9, growT: 0.05, fadeOut: 0.7, yaw: y });
    fx.decal('soft', g0.clone().setY(gy + 0.008), { size: size * 1.8, color: c.mid, opacity: 0.35, life: life * 0.5, s0: 0.6, growT: 0.1, fadeOut: 0.7 });
    const over = () => onDisc(g0, size * 0.3, gy + 0.05);
    if (el === 'fire') {
      fx.emit(0, 1.5, 7, P => P.add('flame', { pos: over(), vel: new THREE.Vector3(0, rnd(0.4, 0.8), 0), size: rnd(0.14, 0.22), size1: 0.3, life: rnd(0.35, 0.55), color: c.hot, color1: c.deep, spin: rnd(-1, 1) }));
      fx.emit(0, 2, 3, P => P.add('soft', { pos: over(), vel: new THREE.Vector3(rnd(-0.2, 0.2), rnd(0.5, 1), rnd(-0.2, 0.2)), size: 0.05, size1: 0.4, life: 0.8, color: 0xffe080, color1: 0xff3000, flicker: 0.4 }));
    } else if (el === 'ice') {
      fx.emit(0, 1.5, 4, P => P.add('puff', { pos: over(), vel: new THREE.Vector3(0, 0.1, 0), size: 0.3, size1: 1.8, life: 1.0, color: 0xdcf2ff, opacity: 0.3, fadeIn: 0.3 }));
    } else if (el === 'poison') {
      fx.emit(0, 1.6, 4, P => P.add('bubble', { pos: over(), vel: new THREE.Vector3(0, 0.3, 0), size: rnd(0.06, 0.1), size1: 1.5, life: 0.6, blending: NORMAL, opacity: 0.9 }));
    } else {
      fx.emit(0, 1.5, 4, P => this._mote(P, el, { pos: over(), vel: new THREE.Vector3(0, rnd(0.3, 0.6), 0), size: 0.12, life: 0.7, gravity: 0 }));
    }
    fx.start({ lightLife: 1.2 });
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

  /**
   * LIGHT FROM SPELLS (2026-09-24, for Farhold's nights). Every effect a public call adds is tagged
   * with a glow in its element's colour; `lights()` hands the live ones to a game as point-light
   * SOURCES (the game owns the lights — this module never creates one, because every light is a cost
   * in every lit material's shader and only the game knows its budget). A projectile glows at full
   * strength the whole flight; a burst, a nova or a cast flares and fades over its life.
   */
  _tagGlow(seq0, element, { range = 10, intensity = 2.4, moving = false } = {}) {
    const E = elementOf(element), color = '#' + new THREE.Color(E.color).getHexString();
    // ONE light per public call: the composite entry if there is one (it carries its own light
    // position and life), else the first new entry. A burst used to tag every piece it added, so a
    // single impact could take all six of a game's light slots.
    let pickE = null;
    // entries are found by serial number, not array index: the maxLive cap can retire old entries
    // DURING the call, which shifts the array under an index
    for (let i = 0; i < this.live.length; i++) {
      const e = this.live[i];
      if (e.seq <= seq0 || e.glow) continue;
      if (e.main) { pickE = e; break; }
      if (!pickE) pickE = e;
    }
    if (pickE) pickE.glow = { color, range, intensity, moving };
  }
  lights(max = 6) {
    const out = [], v = new THREE.Vector3();
    for (let i = this.live.length - 1; i >= 0 && out.length < max; i--) {
      const e = this.live[i];
      if (!e.glow || !e.obj) continue;
      if (e.lightPos) v.copy(e.lightPos); else e.obj.getWorldPosition(v);
      const lifeL = e.lightLife ?? e.life;
      const k = lifeL ? Math.min(1, e.age / lifeL) : 0;
      const fade = e.glow.moving ? 1 : Math.max(0, 1 - k) * (k < 0.15 ? k / 0.15 : 1);
      if (fade <= 0.02) continue;
      out.push({ x: v.x, y: v.y + 0.3, z: v.z, color: e.glow.color, range: e.glow.range, intensity: e.glow.intensity * fade, flicker: false, priority: 6 });
    }
    return out;
  }

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
    for (const g of this._geos.values()) g.dispose();
    this._geos.clear();
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

// ---- tag each public effect with its glow (see SpellFx#lights) ------------------------------
{
  const wrap = (name, opts) => {
    const inner = SpellFx.prototype[name];
    if (!inner) return;
    SpellFx.prototype[name] = function (args = {}, ...rest) {
      const seq0 = this._seq || 0;
      const out = inner.call(this, args, ...rest);
      try { this._tagGlow(seq0, args.element || 'arcane', opts(args)); } catch { /* a glow is decoration */ }
      return out;
    };
  };
  wrap('projectile', () => ({ range: 9, intensity: 2.6, moving: true }));
  wrap('impact', a => ({ range: 11 * (a.scale || 1), intensity: a.crit ? 4 : 3 }));
  wrap('aoe', a => ({ range: 13, intensity: 3.2 }));
  wrap('cast', () => ({ range: 7, intensity: 2 }));
  wrap('breath', a => ({ range: Math.min(12, 3 + (a.length || 7)), intensity: 2.2 }));
  wrap('pillar', a => ({ range: 10 + (a.radius || 3) * 2, intensity: 5 }));
  wrap('vortex', a => ({ range: 6 + (a.radius || 4) * 1.5, intensity: 2.6 }));
  wrap('storm', a => ({ range: 6 + (a.radius || 5) * 1.5, intensity: 1.8 }));
}
