// Spell Kit — layered, phased spell visuals for three.js games (owner 2026-11-23: "more elaborate spell effects like
// in WoW": hands that light up while you aim, ground spells with a projected rune, a rising see-through wall and many
// textured emitters, and real impacts).
//
//   import { createSpellKit } from '../../avatar-3d/spellkit/js/spellkit.js';
//   const kit = await createSpellKit({ THREE, scene, camera, renderer, visuals, heightAt, quality: 'high' });
//   kit.warm();                                                     // compile every material now, not mid-fight
//   const w = kit.windup(hero.group, 'fire_bolt', { hands: [bones.hand_l, bones.hand_r] });
//   const aim = kit.indicator('circle', { at, radius: 4, kind: 'friendly' });  aim.set({ at }) … aim.stop();
//   kit.release(w);
//   const hit = await kit.missile(handPos, target, 'fire_bolt');  kit.impact(hit, 'fire_bolt');
//   kit.ground(at, 'ring_of_dawn', { radius: 5, seconds: 8 });     kit.aura(target, 'aura_burning');
//   every frame: kit.update(dt)  (and add kit.shakeOffset to the camera if you want the kit's camera shake)
//
// Visuals are data (spell-visuals.json): per phase (windup / release / travel / impact / linger / aura / beam / sweep)
// a list of layers: emitter, flipbook, decal, shell, ribbon, arc, sweep, mesh, light, shake. README.md has the fields.
// Builds on avatar-3d/js/spellfx.js: its element palettes and names are the kit's colours.
import { ELEMENT_PALETTE, elementName } from '../../js/spellfx.js';
import { loadSpellTextures } from './textures.js';
import { validateVisuals } from './schema.js';
import { ParticlePool, Emitter } from './particles.js';
import {
  Pool, makeGround, drape, shellGeometries, makeShell, makeRibbon, fillRibbon, meshGeometries, makeGlow, makeLight,
} from './layers.js';

const TEXTURES = new URL('../textures/', import.meta.url);

/** Extra colour sets beyond spellfx's elements (school name → palette). Hex numbers. */
export const EXTRA_PALETTE = {
  blood: { hot: 0xff9a8a, mid: 0xd0202a, deep: 0x5a0610, smoke: 0x2a0608 },
  fel: { hot: 0xeaffb0, mid: 0x8adf20, deep: 0x2a6a08, smoke: 0x1a2a08 },
  dawn: { hot: 0xffffff, mid: 0xffd27a, deep: 0xff9a3a, smoke: 0xfff0d0 },
  moon: { hot: 0xffffff, mid: 0xc8d8ff, deep: 0x6a80d0, smoke: 0xd0d8ff },
  haste: { hot: 0xffffff, mid: 0x9af0ff, deep: 0x2a9ad0, smoke: 0xc0f0ff },
};
/** Texture school for `{school}` in texture names (rune_{school}). */
const TEX_SCHOOL = { ice: 'frost', frost: 'frost', fire: 'fire', holy: 'holy', nature: 'nature', arcane: 'arcane', shadow: 'shadow',
  lightning: 'lightning', poison: 'poison', physical: 'arcane', bleed: 'shadow', blood: 'shadow', fel: 'poison', dawn: 'holy', moon: 'arcane', haste: 'lightning', true: 'arcane' };

// Pool sizes per quality. Since the Oathwild spell-look round (2026-11-26, "TRIPLE the amount of graphics") every
// visual draws ~3x the pieces and phones draw the same counts as desktops: 'low' only has smaller pools and budget
// (the global cap, which the pressure() slow-down keeps storms under) and 2 lights instead of 6 — never 0, so a
// phone's spells still light the ground (lights are pooled and never toggled: lessons rule 29).
export const QUALITY = {
  high: { budget: 9000, normalShare: 0.5, ground: 180, shells: { cylinder: 40, cone: 6, funnel: 6, dome: 10, sphere: 12 }, ribbons: 80, glows: 16, lights: 6 },
  low: { budget: 6000, normalShare: 0.5, ground: 130, shells: { cylinder: 28, cone: 4, funnel: 4, dome: 6, sphere: 8 }, ribbons: 56, glows: 12, lights: 2 },
};
/** A contrasting accent per school (the Paladin's gold + cyan): sparks, rims and shards that pop off the main colour. */
export const ACCENT = {
  fire: 0xffe25a, ice: 0xe6d6ff, frost: 0xe6d6ff, holy: 0x9de9ff, dawn: 0x9de9ff, nature: 0xfff07a, arcane: 0x7af0ff,
  shadow: 0xff5ad0, lightning: 0xfff6b0, poison: 0xd07aff, physical: 0xffa040, bleed: 0xffb050, blood: 0xffb050,
  fel: 0xfff07a, moon: 0xfff0c0, haste: 0xfff6b0, true: 0xffffff,
};
/** Phases that play once and are done (decals etc. default to a 1 s life). */
const ONE_SHOT = new Set(['impact', 'release', 'point', 'area']);

/**
 * Points spread over a spell's TRUE shape (Thousandvale's ringPoints / arcPoints / fillPoints): the impact is repeated
 * at each so an area reads at its real size. o: at [x,y,z], dir {x,z}, radius, angle (radians, arc), length (line), n.
 * shape: 'arc' (across a swing, at 0.75 x the reach) | 'ring' (round the rim) | 'line' (along a beam) | 'disc' (filling
 * a circle, golden-angle spiral) | 'point'. Pure (no three.js): returns [[x, y, z], …].
 */
export function shapePoints(shape, { at = [0, 0, 0], dir = { x: 0, z: 1 }, radius = 3, angle = 1.6, length = 8, n = 6 } = {}) {
  const [x0, y0, z0] = Array.isArray(at) ? at : [at.x, at.y, at.z];
  const dl = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / dl, dz = dir.z / dl;
  const out = [];
  if (shape === 'ring') for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([x0 + Math.sin(a) * radius, y0, z0 + Math.cos(a) * radius]); }
  else if (shape === 'arc') {
    const r = radius * 0.75, a0 = Math.atan2(dx, dz);
    for (let i = 0; i < n; i++) { const a = a0 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * angle); out.push([x0 + Math.sin(a) * r, y0, z0 + Math.cos(a) * r]); }
  } else if (shape === 'line') for (let i = 0; i < n; i++) { const d = length * (i + 0.5) / n; out.push([x0 + dx * d, y0, z0 + dz * d]); }
  else if (shape === 'disc') for (let i = 0; i < n; i++) { const r = radius * Math.sqrt((i + 0.5) / n), a = i * 2.39996; out.push([x0 + Math.sin(a) * r, y0, z0 + Math.cos(a) * r]); }
  else out.push([x0, y0, z0]);
  return out;
}

const rnd = (r) => Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : (r ?? 0);
const env = (t, life, fin, fout, stopAt) => {
  let e = fin > 0 ? Math.min(1, t / fin) : 1;
  if (Number.isFinite(life) && fout > 0) e = Math.min(e, Math.max(0, (life - t) / fout));
  if (stopAt != null) e = Math.min(e, Math.max(0, 1 - (t - stopAt) / Math.max(0.05, fout || 0.3)));
  return Math.max(0, e);
};

export async function createSpellKit(opts = {}) {
  const kit = new SpellKit(opts);
  await kit.load(opts);
  return kit;
}

export class SpellKit {
  constructor({ THREE, scene, camera, renderer = null, quality = 'high', heightAt = null, onShake = null, budget = null } = {}) {
    if (!THREE || !scene) throw new Error('createSpellKit needs { THREE, scene }');
    this.THREE = THREE; this.scene = scene; this.camera = camera; this.renderer = renderer;
    this.quality = quality === 'low' ? 'low' : 'high';
    this.Q = { ...QUALITY[this.quality] }; if (budget) this.Q.budget = budget;
    this.heightAt = heightAt;   // (x, z) → ground y; null = flat ground at y 0
    this.onShake = onShake;
    this.effects = new Set();
    this.time = 0; this.waits = [];
    this.trauma = 0; this.shakeOffset = new THREE.Vector3(); this.shakeOn = true;   // shakeOn: the game's Settings toggle
    this.visuals = {}; this.spellMap = {}; this.fallback = {};
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.counts = { spawnRefused: 0, stolen: 0 };
  }

  async load({ visuals = null, textures = null } = {}) {
    const THREE = this.THREE, Q = this.Q;
    this.tex = await loadSpellTextures(THREE, textures ? new URL(textures, location.href) : TEXTURES);
    if (visuals) this.setVisuals(typeof visuals === 'string' ? await fetch(visuals).then(r => r.json()) : visuals);
    this.root = new THREE.Group(); this.root.name = 'spellkit'; this.scene.add(this.root);
    // particles: two pools, two draw calls
    this.pools = {
      add: new ParticlePool(THREE, { capacity: Q.budget, atlas: this.tex.atlas, cellsPerRow: this.tex.cellsPerRow, blending: THREE.AdditiveBlending, name: 'glow' }),
      normal: new ParticlePool(THREE, { capacity: Math.round(Q.budget * Q.normalShare), atlas: this.tex.atlas, cellsPerRow: this.tex.cellsPerRow, blending: THREE.NormalBlending, name: 'smoke' }),
    };
    this.root.add(this.pools.add.mesh, this.pools.normal.mesh);
    // pooled layers
    const add = it => { this.root.add(it.obj); return it; };
    this.grounds = new Pool(() => add(makeGround(THREE, this.tex)), Q.ground);
    this.shellGeo = shellGeometries(THREE);
    this.shells = {};
    for (const [k, g] of Object.entries(this.shellGeo)) this.shells[k] = new Pool(() => add(makeShell(THREE, this.tex, g)), Q.shells[k] ?? 4);
    this.ribbons = new Pool(() => add(makeRibbon(THREE, this.tex)), Q.ribbons);
    this.meshGeo = meshGeometries(THREE);
    this.glows = {};
    for (const [k, g] of Object.entries(this.meshGeo)) this.glows[k] = new Pool(() => add(makeGlow(THREE, g)), Q.glows);
    this.lights = new Pool(() => add(makeLight(THREE)), Q.lights);
    return this;
  }

  /** visuals: the spell-visuals.json object ({ visuals, spells, fallback }). */
  setVisuals(data) {
    const vis = { ...(data.visuals || data) };
    // `ref`: borrow another visual's phases, then change what the entry lists (school, scale, a phase…)
    for (const [id, v] of Object.entries(vis)) {
      let base = v, guard = 0;
      while (base.ref && vis[base.ref] && guard++ < 8) base = { ...vis[base.ref], ...base, ref: vis[base.ref].ref };
      vis[id] = base;
    }
    this.visuals = vis;
    this.spellMap = data.spells || {};
    this.problems = validateVisuals(data, this.tex?.ids());
    if (this.problems.length) console.warn('spellkit: visual data problems —\n' + this.problems.join('\n'));
    this.fallback = data.fallback || {};
  }

  // ---------------------------------------------------------------------------------------------- budget
  liveParticles() { return this.pools.add.n + this.pools.normal.n; }
  overBudget() { const o = this.liveParticles() >= this.Q.budget; if (o) this.counts.spawnRefused++; return o; }
  /** emitters slow down as the budget fills: full rate below 60%, down to 20% at the cap */
  pressure() { const f = this.liveParticles() / this.Q.budget; return f < 0.6 ? 1 : Math.max(0.2, 1 - (f - 0.6) / 0.4 * 0.8); }

  // ---------------------------------------------------------------------------------------------- lookup
  /**
   * The visual for a game spell: spells map (id → visual id or { visual, school, scale }), then fallback by
   * `<targetKind>:<element>`, then `<targetKind>`, then 'generic'. `row` (optional) = { kind, element }.
   */
  visualFor(spellId, row = null) {
    let m = this.spellMap[spellId];
    if (typeof m === 'string') m = { visual: m };
    if (!m && row) {
      const k = this.fallback[`${row.kind}:${row.element}`] || this.fallback[row.kind];
      if (k) m = typeof k === 'string' ? { visual: k, school: row.element } : { school: row.element, ...k };
    }
    if (!m || !this.visuals[m.visual]) m = { ...(m || {}), visual: this.visuals.generic ? 'generic' : Object.keys(this.visuals)[0] };
    return m;
  }

  /** visual id or a spell id or { visual, school, scale } → { def, school, scale } */
  resolve(id, extra = {}) {
    if (id && id.def) return { ...id, scale: id.scale * (extra.scale ?? 1), school: extra.school || id.school };   // already resolved
    let ref = typeof id === 'object' && id ? id : (this.visuals[id] ? { visual: id } : this.visualFor(id));
    const def = this.visuals[ref.visual];
    if (!def) throw new Error('spellkit: unknown visual ' + JSON.stringify(id));
    return { id: ref.visual, def, school: extra.school || ref.school || def.school || 'arcane', scale: (extra.scale ?? 1) * (ref.scale ?? 1), palette: ref.palette || extra.palette || null };
  }

  // ---------------------------------------------------------------------------------------------- phases
  /** Hands light up and gather power. Loops until release()/stop(). */
  windup(caster, visual, { hands = null, scale, school, height = 1.8 } = {}) {
    const r = this.resolve(visual, { scale, school });
    const fx = this.effect(r, 'windup', { caster, hands, height, loop: true });
    fx.addLayers(r.def.windup);
    return { fx, visual: r, caster, hands, height, stop: () => fx.stop(), release: o => this.release({ fx, visual: r, caster, hands, height }, o) };
  }

  /** End a windup with the release flash at the hands. */
  release(handle, { scale } = {}) {
    if (!handle) return null;
    handle.fx?.stop();
    const r = scale ? { ...handle.visual, scale: handle.visual.scale * scale } : handle.visual;
    if (!r.def.release) return null;
    const fx = this.effect(r, 'release', { caster: handle.caster, hands: handle.hands, height: handle.height });
    fx.addLayers(r.def.release);
    return fx;
  }

  /**
   * Targeting indicator. shape: circle | cone | line (rect). opts: at, dir, radius, length, width, angle (radians),
   * kind: valid | invalid | friendly | hostile, valid (false → invalid colour), color/edge (override).
   * Returns { set(opts), stop() }.
   */
  indicator(shape = 'circle', opts = {}) {
    const THREE = this.THREE, it = this.grounds.get();
    const st = { shape, at: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), radius: 3, length: 8, width: 1.6, angle: Math.PI / 2, kind: 'valid', t: 0, alive: true };
    const SH = { circle: 1, ring: 1, cone: 2, line: 3, rect: 3 };
    const COL = { valid: [0x9af0ff, 0x2a80c0], friendly: [0xa8ffb0, 0x2a9a40], hostile: [0xffb070, 0xd02a10], invalid: [0xff8080, 0x901010], neutral: [0xfff0c0, 0xa08040] };
    const self = this;
    const handle = {
      set(o = {}) {
        if (!st.alive) return handle;
        if (o.at) toVec(o.at, st.at);
        if (o.dir) { st.dir.set(o.dir.x, 0, o.dir.z); if (st.dir.lengthSq() < 1e-6) st.dir.set(0, 0, 1); st.dir.normalize(); }
        for (const k of ['radius', 'length', 'width', 'angle', 'kind']) if (o[k] != null) st[k] = o[k];
        if (o.valid === false) st.kind = 'invalid'; else if (o.valid === true && st.kind === 'invalid') st.kind = 'valid';
        const sh = SH[st.shape] || 1;
        let box;
        if (sh === 1) box = [-st.radius, st.radius, -st.radius, st.radius];
        else if (sh === 2) { const w = Math.sin(Math.min(Math.PI / 2, st.angle / 2)) * st.length; box = [-w, w, st.angle > Math.PI ? -st.length : -0.2, st.length]; }
        else box = [-st.width / 2, st.width / 2, 0, st.length];
        drape(it, self.heightAt, st.at.x, st.at.z, st.dir, box, 0.06);
        const u = it.u;
        u.uShape.value = sh; u.uHalf.value = sh === 1 ? st.radius : st.length * 0.5;
        u.uDims.value.set(sh === 3 ? st.length : (sh === 1 ? st.radius : st.length), sh === 2 ? st.angle : st.width, 0);
        const c = o.color != null ? [o.color, o.edge ?? o.color] : COL[st.kind] || COL.valid;
        u.uCol.value.set(c[0]); u.uEdge.value.set(c[1]);
        u.uMap.value = self.tex.map('ring_reticle'); u.uRim.value = self.tex.map('band_runes');
        it.obj.material.blending = THREE.AdditiveBlending;
        it.obj.visible = true;
        return handle;
      },
      stop() { if (st.alive) { st.alive = false; if (it.owner === me) self.grounds.put(it); self.indicators.delete(tick); } },
      get state() { return st; },
    };
    const tick = dt => { st.t += dt; it.u.uTime.value = st.t; it.u.uOpacity.value = Math.min(1, st.t / 0.12); };
    const me = { steal: () => { st.alive = false; this.indicators.delete(tick); } }; it.owner = me;
    (this.indicators ||= new Set()).add(tick);
    handle.set(opts);
    return handle;
  }

  /**
   * A missile from → to (Vector3 / Object3D — an Object3D is followed, aimed at its chest). Or { dir, range }.
   * Resolves with the arrival point. opts: speed, arc, height (target chest height), scale, school.
   */
  missile(from, to, visual, { speed, arc, dir = null, range = 25, height = 1.8, scale, school, delay = 0, track = null } = {}) {
    const THREE = this.THREE, r = this.resolve(visual, { scale, school });
    const tr = r.def.travel || {};
    const start = toVec(from, new THREE.Vector3());
    const end = new THREE.Vector3();
    const target = to && to.isObject3D ? to : null;
    const aimAt = () => {
      if (target) { target.getWorldPosition(end); end.y += height * 0.6; }
      else if (to) toVec(to, end);
      else end.copy(start).addScaledVector(dir || new THREE.Vector3(0, 0, 1), range);
      return end;
    };
    aimAt();
    const fx = this.effect(r, 'travel', { point: start.clone(), loop: true });
    fx.missile = start.clone(); fx.missileVel = new THREE.Vector3();
    fx.dir.subVectors(end, start).normalize();
    fx.addLayers(tr.layers || []);
    const sp = (speed ?? tr.speed ?? 16), ar = arc ?? tr.arc ?? 0;
    let t = -delay; const prev = new THREE.Vector3().copy(start);
    let done = null;
    // track(out): a game-driven missile (a server projectile) — it goes where track() says each frame, starting from
    // `from` (the hand) and easing onto the tracked path over 0.12 s, until the returned handle's stop()
    const p = new Promise(resolve => {
      done = resolve;
      if (track) {
        const want = new THREE.Vector3(); let k0 = 0;
        fx.mover = dt => {
          t += dt; if (t < 0) return;
          track(want); k0 = Math.min(1, k0 + dt / 0.12);
          prev.copy(fx.missile);
          fx.missile.lerpVectors(start, want, k0);
          if (k0 >= 1) fx.missile.copy(want);
          fx.missileVel.subVectors(fx.missile, prev).divideScalar(Math.max(dt, 1e-4));
          if (fx.missileVel.lengthSq() > 1e-6) fx.dir.copy(fx.missileVel).normalize();
          fx.point.copy(fx.missile);
        };
        return;
      }
      fx.mover = dt => {
        t += dt; if (t < 0) return;
        aimAt();
        const dist = start.distanceTo(end), dur = Math.max(0.05, dist / sp);
        const k = Math.min(1, t / dur);
        prev.copy(fx.missile);
        fx.missile.lerpVectors(start, end, k);
        fx.missile.y += ar * dist * 4 * k * (1 - k);
        fx.missileVel.subVectors(fx.missile, prev).divideScalar(Math.max(dt, 1e-4));
        if (fx.missileVel.lengthSq() > 1e-6) fx.dir.copy(fx.missileVel).normalize();
        fx.point.copy(fx.missile);
        if (k >= 1) { fx.mover = null; fx.stop(); resolve(end.clone()); }
      };
    });
    p.fx = fx;
    /** end it where it is now (a server bolt that hit or ran out); resolves with that point */
    p.stop = () => { if (!fx.mover) return; fx.mover = null; fx.stop(); done(fx.missile.clone()); };
    p.where = () => fx.missile;
    return p;
  }

  /** The burst where something lands. opts: scale, school, normal, radius, dir. */
  impact(at, visual, { scale, school, radius = 1.5, dir = null, target = null, height = 1.8 } = {}) {
    const r = this.resolve(visual, { scale, school });
    const fx = this.effect(r, 'impact', { point: toVec(at, new this.THREE.Vector3()), radius, dir, target, height });
    fx.addLayers(r.def.impact || []);
    return fx;
  }

  /**
   * The impact repeated over a spell's true shape (shapePoints): each point plays the visual's `point` phase (or its
   * impact when it has none), `every` seconds apart; then its `area` phase once at the centre with the real radius.
   * o: shape (arc|ring|line|disc), at, dir, radius, angle, length, n, every, y (lift of each point off the ground).
   */
  spread(visual, { shape = 'ring', at, dir = { x: 0, z: 1 }, radius = 3, angle = 1.6, length = 8, n = 8, every = 0.025, y = 0.5, scale, school, area = true } = {}) {
    const r = this.resolve(visual, { scale, school });
    const c = toVec(at, new this.THREE.Vector3());
    const pts = shapePoints(shape, { at: [c.x, c.y, c.z], dir, radius, angle, length, n });
    const phase = r.def.point ? 'point' : 'impact';
    const d3 = new this.THREE.Vector3(dir.x, 0, dir.z);
    pts.forEach((q, i) => {
      const go = () => {
        const v = new this.THREE.Vector3(q[0], this.heightAt ? this.heightAt(q[0], q[2]) + y : q[1], q[2]);
        this.effect(r, phase, { point: v, radius: Math.max(0.8, radius / Math.max(2, Math.sqrt(n))), dir: d3 }).addLayers(r.def[phase] || []);
      };
      if (i === 0 || !every) go(); else this.wait(i * every).then(go);
    });
    if (area && r.def.area) {
      const g = c.clone(); if (this.heightAt) g.y = this.heightAt(g.x, g.z);
      this.effect(r, 'area', { point: g, radius, dir: d3, length }).addLayers(r.def.area);
    }
    return pts;
  }

  /** Lingering ground effect (projected rune, rising wall, emitters). Returns a handle with stop(). */
  ground(at, visual, { radius, seconds, scale, school, dir = null, length } = {}) {
    const r = this.resolve(visual, { scale, school });
    const L = r.def.linger || {};
    const sec = seconds ?? L.seconds ?? 6;
    const fx = this.effect(r, 'linger', { point: toVec(at, new this.THREE.Vector3()), radius: radius ?? L.radius ?? 4, dir, length: length ?? L.length ?? 8, seconds: sec });
    if (this.heightAt) fx.point.y = this.heightAt(fx.point.x, fx.point.z);
    fx.addLayers(L.layers || []);
    return { fx, stop: () => fx.stop() };
  }

  /** Looping body effect (buffs/debuffs) on an Object3D. Returns { stop() }. */
  aura(target, visual, { height = 1.8, scale, school, seconds = Infinity } = {}) {
    const r = this.resolve(visual, { scale, school });
    const fx = this.effect(r, 'aura', { target, caster: target, height, loop: !Number.isFinite(seconds), seconds });
    fx.addLayers(r.def.aura || []);
    return { fx, stop: () => fx.stop() };
  }

  /**
   * Arcs between points: from → each target in turn (chain lightning), or a held channel beam. points: Vector3s or
   * Object3Ds (followed). opts.seconds, opts.hop (seconds between jumps, the chain grows link by link).
   */
  beam(from, points, visual, { seconds, hop = 0.08, scale, school, height = 1.8 } = {}) {
    const r = this.resolve(visual, { scale, school });
    const B = r.def.beam || {};
    const fx = this.effect(r, 'beam', { point: toVec(points[0] || from, new this.THREE.Vector3()), seconds: seconds ?? B.seconds ?? 0.6, height });
    fx.chain = [from, ...points]; fx.hop = hop;
    fx.addLayers(B.layers || []);
    return { fx, stop: () => fx.stop() };
  }

  /** Weapon trail: follows `weapon` (Object3D) from base to tip offsets (local metres). */
  trail(weapon, visual, { base = [0, 0, 0], tip = [0, 0.9, 0], seconds = 0.45, scale, school, target = null } = {}) {
    const r = this.resolve(visual, { scale, school });
    const fx = this.effect(r, 'sweep', { caster: weapon, seconds, target });
    fx.weapon = weapon; fx.base = new this.THREE.Vector3(...base); fx.tip = new this.THREE.Vector3(...tip);
    fx.addLayers(r.def.sweep || []);
    return { fx, stop: () => fx.stop() };
  }

  /**
   * A weapon swing drawn at the spell's TRUE reach without needing the weapon: a crescent ribbon sweeping `angle`
   * radians round `at` (the caster's feet) across `dir`, from `inner` x radius out to the radius, `height` m up, in
   * `seconds`. angle >= 2 pi = a full spin (Whirlwind). Uses the visual's sweep layers (colour, texture), or a default.
   * opts.overhead: the arc stands up (a vertical chop / slam) instead of lying flat.
   */
  swing(at, visual, { dir = { x: 0, z: 1 }, radius = 3, angle = 1.8, seconds = 0.2, height = 1.1, inner = 0.3, tail = 1.1, overhead = false, scale, school } = {}) {
    const r = this.resolve(visual, { scale, school });
    const fx = this.effect(r, 'sweep', { point: toVec(at, new this.THREE.Vector3()), seconds: seconds + 0.5 });
    fx.swingArc = { a0: Math.atan2(dir.x, dir.z), angle, R: radius, inner, h: height, seconds, tail: Math.min(angle, tail * (angle > 6 ? 2.2 : 1)), overhead };
    const L = (r.def.sweep || []).filter(l => l.type === 'sweep');
    fx.addLayers(L.length ? L : [{ type: 'sweep', color: 'white', edge: 'mid', tex: 'band_mist' }, { type: 'sweep', color: 'hot', edge: 'accent', tex: 'band_light', inner: 0.75 }]);
    return fx;
  }

  /**
   * A weapon swing along a MEASURED path (a basic attack: Oathwild data/swing-visuals.json, measured from the real clip
   * by tools/measure-swings.mjs): `path` = keyframes [t, hx, hy, hz, dx, dy, dz] in `obj`'s own frame (t = seconds
   * into the clip, h = the hand, d = the blade's direction); the ribbon runs from h + d*b0 to h + d*b1, its head
   * following the clip's own time (x `speed`), its tail `tail` seconds of clip behind. Starts `delay` s from now.
   * Emitter layers with at:'tip' ride the blade's tip as it moves (sparks thrown off the swing). `back` (< 0): the far
   * end of a two-ended weapon, for sweep layers with end:'back'. Returns the effect (null while it waits for `delay`).
   */
  pathSwing(obj, visual, { path, from, to, speed = 1, b0 = 0.25, b1 = 1, back = 0, tail = 0.09, delay = 0, scale, school } = {}) {
    if (!obj || !path?.length) return null;
    // the stroke starts `delay` from now: the whole effect waits (its sparks and its ribbon start together)
    if (delay > 0) { this.wait(delay).then(() => { if (obj.parent) this.pathSwing(obj, visual, { path, from, to, speed, b0, b1, back, tail, scale, school }); }); return null; }
    const r = this.resolve(visual, { scale, school });
    const t0 = from ?? path[0][0], t1 = to ?? path[path.length - 1][0];
    const fx = this.effect(r, 'sweep', { caster: obj, seconds: (t1 - t0) / speed + 0.5 });
    fx.weapon = obj; fx.tip = new this.THREE.Vector3(); fx.pathArc = { path, t0, t1, speed, b0, b1, back, tail };
    pathAt(path, t0, fx.tip, b1);
    const L = r.def.sweep || [];
    fx.addLayers(L.some(l => l.type === 'sweep') ? L : [{ type: 'sweep', color: 'white', edge: 'mid', tex: 'band_mist' }, ...L]);
    return fx;
  }

  /**
   * One whole cast, phase by phase (the Spell Lab and quick game use): windup → release → travel/beam/sweep →
   * impact → linger / aura. opts: caster, hands, target (Object3D or point), at (ground point), dir, windup
   * (seconds), radius, seconds, weapon, onPhase(name). Resolves when the last phase has started.
   */
  async cast(visual, o = {}) {
    const THREE = this.THREE, r = this.resolve(visual, { scale: o.scale, school: o.school });
    const d = r.def, kind = d.kind || 'missile';
    const ph = n => o.onPhase?.(n);
    const casterPos = o.caster ? toVec(o.caster, new THREE.Vector3()) : new THREE.Vector3();
    const tgtPos = o.target ? toVec(o.target, new THREE.Vector3()) : (o.at ? toVec(o.at, new THREE.Vector3()) : casterPos.clone().add(new THREE.Vector3(0, 0, 6)));
    const at = o.at ? toVec(o.at, new THREE.Vector3()) : (kind === 'nova' || kind === 'self' || kind === 'shift' ? casterPos.clone() : tgtPos.clone());
    const dir = o.dir ? o.dir.clone() : new THREE.Vector3().subVectors(tgtPos, casterPos).setY(0).normalize();
    const R = { ...r, scale: r.scale };
    if (d.windup && kind !== 'melee' && kind !== 'shift') {
      ph('windup');
      const w = this.windup(o.caster, R, { hands: o.hands });
      await this.wait(o.windup ?? d.windupTime ?? 0.8);
      ph('release'); this.release(w);
    } else if (d.release) { ph('release'); this.effect(R, 'release', { caster: o.caster, hands: o.hands }).addLayers(d.release); }
    const hand = handPoint(this, o.caster, o.hands, 1, new THREE.Vector3());
    if (kind === 'missile') {
      ph('travel');
      const n = d.travel?.count || 1;
      const hits = [];
      for (let i = 0; i < n; i++) hits.push(this.missile(hand.clone(), o.target || tgtPos, R, { delay: i * (d.travel?.every ?? 0.12) }).then(p => { if (i === 0) ph('impact'); this.impact(p, R, { dir, target: o.target?.isObject3D ? o.target : null }); return p; }));
      const p = await hits[0];
      if (d.linger) { ph('linger'); this.ground(p, R, { radius: o.radius, seconds: o.seconds }); }
      await Promise.all(hits);
    } else if (kind === 'ground' || kind === 'nova' || kind === 'summon' || kind === 'line') {
      if (d.travel) {   // falls from the sky / thrown
        ph('travel');
        const from = d.travel.from === 'sky' ? at.clone().add(new THREE.Vector3(-3, 14, -2)) : hand.clone();
        await this.missile(from, at, R, {});
      }
      if (kind === 'line' && d.beam) { ph('beam'); this.beam(hand.clone(), [at.clone().addScaledVector(dir, o.length ?? 8).setY(at.y + 1)], R, {}); }
      if (kind === 'nova' && d.sweep) this.swing(casterPos, R, { dir, radius: o.radius ?? 4, angle: Math.PI * 2.2, seconds: 0.4 });
      if (d.impact) { ph('impact'); this.impact(at, R, { radius: o.radius ?? d.linger?.radius ?? 4, dir }); }
      if (d.point || d.area) this.spread(R, kind === 'line' ? { shape: 'line', at, dir, length: o.length ?? 8, n: 6 } : { shape: kind === 'nova' ? 'ring' : 'disc', at, radius: o.radius ?? d.linger?.radius ?? 4, n: kind === 'nova' ? 12 : 9 });
      if (d.linger) { ph('linger'); this.ground(at, R, { radius: o.radius, seconds: o.seconds, dir, length: o.length }); }
    } else if (kind === 'beam') {
      ph('beam');
      const pts = o.chain || [o.target || tgtPos];
      const b = this.beam(o.caster && o.hands ? o.hands[1] || o.caster : hand.clone(), pts, R, { seconds: o.seconds });
      if (d.impact) { ph('impact'); pts.forEach((p, i) => this.wait(i * (b.fx.hop || 0.08)).then(() => this.impact(toVec(p, new THREE.Vector3(), p.isObject3D ? 1.1 : 0), R, {}))); }
      if (d.point || d.area) { const e0 = toVec(pts[pts.length - 1], new THREE.Vector3()); this.spread(R, { shape: 'line', at: hand, dir, length: hand.distanceTo(e0), n: 6, area: false }); }
      await this.wait(b.fx.seconds);
    } else if (kind === 'cone') {
      ph('impact');
      this.impact(hand.clone(), R, { dir, radius: o.radius ?? 5 });
      if (d.point || d.area) this.spread(R, { shape: 'arc', at: casterPos, dir, radius: o.radius ?? 5, angle: 1.2, n: 6 });
    } else if (kind === 'melee') {
      ph('sweep');
      if (o.weapon && d.sweep && !d.point) this.trail(o.weapon, R, { tip: o.tip, base: o.base, seconds: d.sweepTime ?? 0.4 });
      else this.swing(casterPos, R, { dir, radius: o.radius ?? 3, angle: 1.9, seconds: 0.2 });
      await this.wait(d.hitDelay ?? 0.25);
      ph('impact'); this.impact(toVec(o.target || tgtPos, new THREE.Vector3(), 1.1), R, { dir });
      if (d.point || d.area) this.spread(R, { shape: 'arc', at: casterPos, dir, radius: o.radius ?? 3, angle: 1.8, n: 6 });
    } else if (kind === 'self' || kind === 'shift') {
      if (d.impact) { ph('impact'); this.impact(casterPos, R, { target: o.caster, radius: o.radius ?? 2 }); }
      if (d.point || d.area) this.spread(R, { shape: 'ring', at: casterPos, radius: o.radius ?? 3, n: 12 });
      if (d.aura && o.caster) { ph('aura'); const a = this.aura(o.caster, R, { seconds: o.seconds ?? d.auraTime ?? 4 }); }
      if (d.linger) { ph('linger'); this.ground(casterPos, R, { radius: o.radius, seconds: o.seconds }); }
    }
  }

  /** resolves after `sec` seconds of KIT time (so slow motion stretches cast sequences too) */
  wait(sec) { return new Promise(ok => this.waits.push({ at: this.time + sec, ok })); }

  // ---------------------------------------------------------------------------------------------- frame
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    if (this.waits.length) {
      const due = this.waits.filter(w => w.at <= this.time); this.waits = this.waits.filter(w => w.at > this.time);
      due.forEach(w => w.ok());
    }
    for (const fx of this.effects) { fx.update(dt); if (fx.done) { fx.free(); this.effects.delete(fx); } }
    if (this.indicators) for (const t of this.indicators) t(dt);
    this.pools.add.update(dt, this.heightAt); this.pools.normal.update(dt, this.heightAt);
    // camera shake: trauma squared, decays
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 0.22;
    this.shakeOffset.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  shake(strength = 0.5, seconds = 0.3) {
    if (!this.shakeOn) return;
    this.trauma = Math.min(1, this.trauma + strength);
    this.onShake?.(strength, seconds);
  }

  /**
   * Compile every material now (call once after load, and after the game's own scene is set up). Shows every pooled
   * object for one compile pass, then hides it again. Returns the number of programs the renderer compiled.
   */
  warm(renderer = this.renderer, camera = this.camera) {
    if (!renderer || !camera) return 0;
    const before = renderer.info.programs?.length ?? 0;
    const shown = [];
    this.root.traverse(o => { if (o.isMesh && !o.visible) { o.visible = true; shown.push(o); } });
    renderer.compile(this.scene, camera);
    for (const o of shown) o.visible = false;
    return (renderer.info.programs?.length ?? 0) - before;
  }

  /** counts for HUDs and tests */
  stats() {
    let draws = (this.pools.add.n ? 1 : 0) + (this.pools.normal.n ? 1 : 0), objects = 0;
    this.root.traverse(o => { if (o.isMesh && o.visible && !o.name.startsWith('spellkit-particles')) { draws++; objects++; } });
    const lightsOn = this.lights.items.filter(l => l.busy).length;
    return {
      particles: this.liveParticles(), glow: this.pools.add.n, smoke: this.pools.normal.n, budget: this.Q.budget,
      effects: this.effects.size, draws, objects, lights: this.lights.items.length, lightsOn,
      refused: this.counts.spawnRefused, stolen: this.counts.stolen, quality: this.quality,
    };
  }

  /** stop and drop every running effect (the pools stay ready) */
  clear() {
    for (const fx of this.effects) fx.free();
    this.effects.clear();
    if (this.indicators) { this.grounds.each(it => { if (it.busy && it.obj.material.uniforms.uShape.value > 0) this.grounds.put(it); }); this.indicators.clear(); }
    this.pools.add.clear(); this.pools.normal.clear();
    this.waits = [];
  }

  dispose() {
    this.clear();
    this.scene.remove(this.root);
    const geos = new Set(), mats = new Set();
    this.root.traverse(o => { if (o.geometry) geos.add(o.geometry); if (o.material) mats.add(o.material); });
    for (const g of [...Object.values(this.shellGeo), ...Object.values(this.meshGeo)]) geos.add(g);
    geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose());
    this.lights.each(l => l.obj.dispose?.());
    this.tex.dispose();
    this.root.clear();
  }

  effect(r, phase, o) { const fx = new Effect(this, r, phase, o); this.effects.add(fx); return fx; }
}

// ================================================================================================ helpers
function toVec(v, out, yUp = 0) {
  if (!v) return out.set(0, 0, 0);
  if (v.isVector3) out.copy(v);
  else if (v.isObject3D) { v.getWorldPosition(out); out.y += yUp; }
  else if (Array.isArray(v)) out.set(v[0], v[1], v[2]);
  else out.set(v.x || 0, v.y || 0, v.z || 0);
  return out;
}

const _q = { a: null };
/** Palm position of a hand: the hand bone moved most of the way toward its first finger bone; or a body offset. */
function handPoint(kit, caster, hands, i, out) {
  const THREE = kit.THREE;
  const b = hands && (hands[i] || hands[0]);
  if (b && b.isObject3D) {
    b.getWorldPosition(out);
    const c = b.children.find(ch => ch.isBone);
    if (c) { if (!_q.a) _q.a = new THREE.Vector3(); c.getWorldPosition(_q.a); out.lerp(_q.a, 0.7); }
    return out;
  }
  if (b && b.isVector3) return out.copy(b);
  if (!caster) return out.set(0, 1.2, 0);
  toVec(caster, out);
  if (caster.isObject3D) {
    if (!_q.q) { _q.q = new THREE.Quaternion(); _q.r = new THREE.Vector3(); _q.f = new THREE.Vector3(); }
    caster.getWorldQuaternion(_q.q);
    _q.r.set(i === 0 ? 0.32 : -0.32, 0, 0).applyQuaternion(_q.q); _q.f.set(0, 0, 0.3).applyQuaternion(_q.q);
    out.add(_q.r).add(_q.f); out.y += 1.15;
  } else out.y += 1.15;
  return out;
}

// ================================================================================================ effects
class Effect {
  constructor(kit, r, phase, o = {}) {
    const THREE = kit.THREE;
    this.kit = kit; this.r = r; this.phase = phase;
    this.school = r.school; this.scale = r.scale;
    const el = elementName(r.school);
    const base = EXTRA_PALETTE[r.school] || ELEMENT_PALETTE[el] || ELEMENT_PALETTE.arcane;
    this.pal = { ...base, accent: ACCENT[r.school] ?? ACCENT[el] ?? base.hot, ...(r.def.palette || {}), ...(r.palette || {}), white: 0xffffff, black: 0x000000 };
    this.texSchool = TEX_SCHOOL[r.school] || TEX_SCHOOL[el] || 'arcane';
    this.caster = o.caster || null; this.hands = o.hands || null; this.target = o.target || null;
    this.height = o.height ?? 1.8;
    this.point = o.point || (o.caster ? toVec(o.caster, new THREE.Vector3()) : new THREE.Vector3());
    this.radius = (o.radius ?? 2) * this.scale;
    this.length = (o.length ?? 8) * this.scale;
    this.dir = new THREE.Vector3(0, 0, 1);
    if (o.dir) this.dir.copy(o.dir).normalize();
    else if (o.caster?.isObject3D) { o.caster.getWorldDirection(this.dir); }
    this.seconds = o.seconds ?? null;
    this.phaseLength = o.loop ? Infinity : (o.seconds ?? Infinity);
    this.density = r.def.density ?? 1;
    this.oneShot = ONE_SHOT.has(phase);
    this.layers = []; this.t = 0; this.stopped = false; this.done = false; this.stopAt = null;
  }

  /** how long a decal/shell/mesh/light lives when its layer gives no life: the phase, or 1 s for one-shot phases */
  defaultLife() { return this.oneShot ? 1 : (Number.isFinite(this.phaseLength) ? this.phaseLength : Infinity); }
  subst(id) { return String(id).replace('{school}', this.texSchool); }
  color(c) {
    const v = typeof c === 'string' && c[0] !== '#' ? (this.pal[c] ?? 0xffffff) : (typeof c === 'string' ? parseInt(c.slice(1), 16) : c);
    const col = this.kit._col || (this.kit._col = new this.kit.THREE.Color());
    col.setHex(v);
    return [col.r, col.g, col.b];
  }
  colors(list) {
    const l = Array.isArray(list) ? list : [list];
    const a = this.color(l[0]), b = this.color(l[1] ?? l[0]), c = this.color(l[2] ?? l[1] ?? l[0]);
    return [a, b, c];
  }
  hex(c) { const [r, g, b] = this.color(c); return new this.kit.THREE.Color(r, g, b); }

  /** anchor function(s) for a layer's `at` */
  anchors(at) {
    const kit = this.kit, fx = this;
    const yUp = (L) => L;
    switch (at || 'point') {
      case 'hands': return [0, 1].map(i => out => handPoint(kit, fx.caster, fx.hands, i, out));
      case 'hand_l': return [out => handPoint(kit, fx.caster, fx.hands, 0, out)];
      case 'hand_r': return [out => handPoint(kit, fx.caster, fx.hands, 1, out)];
      case 'caster': return [out => toVec(fx.caster || fx.point, out)];
      case 'chest': return [out => toVec(fx.caster || fx.target || fx.point, out, fx.height * 0.6)];
      case 'head': return [out => toVec(fx.target || fx.caster || fx.point, out, fx.height * 1.02)];
      case 'feet': case 'target': return [out => toVec(fx.target || fx.caster || fx.point, out)];
      case 'body': return [out => toVec(fx.target || fx.caster || fx.point, out, fx.height * 0.5)];
      case 'missile': return [out => out.copy(fx.missile || fx.point)];
      case 'ground': return [out => { out.copy(fx.point); if (kit.heightAt) out.y = kit.heightAt(out.x, out.z); return out; }];
      case 'tip': return [out => out.copy(fx.tip).applyMatrix4(fx.weapon.matrixWorld)];
      default: return [out => out.copy(fx.point)];
    }
  }

  addLayers(list) {
    for (const L of list || []) {
      if (L.quality && L.quality !== this.kit.quality) continue;
      const T = LAYERS[L.type || 'emitter'];
      if (!T) { console.warn('spellkit: unknown layer type ' + L.type); continue; }
      if (T === LAYERS.emitter || T === LAYERS.flipbook) { for (const a of this.anchors(L.at)) this.layers.push(T(this, L, a)); }
      else this.layers.push(T(this, L, this.anchors(L.at)[0]));
    }
    return this;
  }

  update(dt) {
    this.t += dt;
    this.mover?.(dt);
    if (this.seconds != null && Number.isFinite(this.seconds) && this.t >= this.seconds && !this.stopped && !ONE_SHOT.has(this.phase)) this.stop();
    let alive = false;
    for (const l of this.layers) { if (!l.done) { l.update(dt); if (!l.done) alive = true; } }
    if (this.mover) alive = true;
    if (!alive) this.done = true;
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true; this.stopAt = this.t;
    for (const l of this.layers) l.stop?.();
  }

  free() { for (const l of this.layers) l.free?.(); this.layers.length = 0; this.done = true; }
}

// ================================================================================================ layer types
// Each returns { update(dt), stop(), free(), done }.
const LAYERS = {
  emitter(fx, L, anchor) { return new Emitter(fx.kit, fx, L, anchor); },
  flipbook(fx, L, anchor) {
    return new Emitter(fx.kit, fx, { burst: L.count ?? 1, rate: 0, life: L.life ?? 0.6, size: L.size ?? 2, spread: 0, speed: 0, alpha: L.alpha ?? [1, 1, 0],
      sizeCurve: L.sizeCurve ?? [0.8, 1, 1.1], max: L.count ?? 1, duration: 0.01, ...L, tex: L.tex || 'fx_burst' }, anchor);
  },

  decal(fx, L, anchor) {
    const kit = fx.kit, THREE = kit.THREE, it = kit.grounds.get();
    const half = (L.rad != null ? L.rad * fx.radius : (L.size ?? 2) * 0.5 * fx.scale);
    const life = L.life ?? fx.defaultLife();
    const p = new THREE.Vector3(); anchor(p);
    const lay = { done: false, t: -(L.delay || 0), stopAt: null, it, last: p.clone() };
    const u = it.u;
    u.uShape.value = 0; u.uMap.value = kit.tex.map(fx.subst(L.tex || 'rune_{school}'));
    u.uCol.value.copy(fx.hex(L.color || 'mid')); u.uEdge.value.copy(fx.hex(L.edge || 'deep'));
    u.uHalf.value = half; u.uRot.value = L.rot ?? Math.random() * 6.28; u.uOpacity.value = 0; u.uScale.value = 1;
    it.obj.material.blending = L.blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
    it.obj.renderOrder = L.blend === 'normal' ? 4 : 5;
    const place = () => drape(it, kit.heightAt, lay.last.x, lay.last.z, fx.dir, [-half, half, -half, half], L.lift ?? 0.04 + (L.layer || 0) * 0.01);
    place();
    const me = { steal: () => { lay.done = true; kit.counts.stolen++; } }; it.owner = me;
    const fin = L.fadeIn ?? 0.15, fout = L.fadeOut ?? 0.5;
    lay.update = dt => {
      lay.t += dt; if (lay.t < 0) return;
      if (L.follow) { anchor(p); if (p.distanceToSquared(lay.last) > 0.0025) { lay.last.copy(p); place(); } }
      it.obj.visible = true;
      let e = env(lay.t, life, fin, fout, lay.stopAt);
      if (L.pulse) e *= 1 - L.pulse[0] + L.pulse[0] * (0.5 + 0.5 * Math.sin(lay.t * L.pulse[1] * 6.283));
      u.uOpacity.value = (L.opacity ?? 1) * e;
      u.uRot.value += (L.spin || 0) * dt;
      if (L.grow) { const k = Math.min(1, lay.t / (L.grow[2] ?? 0.3)); const ease = 1 - (1 - k) ** 3; u.uScale.value = L.grow[0] + (L.grow[1] - L.grow[0]) * ease; }
      if (lay.t >= life || (lay.stopAt != null && lay.t - lay.stopAt > fout)) lay.free();
    };
    lay.stop = () => { if (lay.stopAt == null) lay.stopAt = Math.max(0, lay.t); };
    lay.free = () => { if (!lay.freed) { lay.freed = true; if (it.busy && it.owner === me) kit.grounds.put(it); } lay.done = true; };
    return lay;
  },

  shell(fx, L, anchor) {
    const kit = fx.kit, THREE = kit.THREE;
    const pool = kit.shells[L.shape || 'cylinder'] || kit.shells.cylinder;
    const it = pool.get(), u = it.u, m = it.obj;
    const life = L.life ?? fx.defaultLife();
    const R = (L.rad != null ? L.rad * fx.radius : (L.radius ?? 1) * fx.scale), H = (L.height ?? 2) * fx.scale;
    const lay = { done: false, t: -(L.delay || 0), stopAt: null };
    u.uMap.value = kit.tex.map(fx.subst(L.tex || 'band_light'));
    u.uCol.value.copy(fx.hex(L.color || 'hot')); u.uEdge.value.copy(fx.hex(L.edge || 'mid'));
    u.uRepeat.value.set(...(L.repeat || [3, 1])); u.uScroll.value.set(0, 0); u.uFade.value = L.fade ?? 1.2; u.uOpacity.value = 0;
    const p = new THREE.Vector3();
    m.rotation.set(0, Math.random() * 6.28, 0);
    const me = { steal: () => { lay.done = true; kit.counts.stolen++; } }; it.owner = me;
    const fin = L.fadeIn ?? 0.2, fout = L.fadeOut ?? 0.5;
    lay.update = dt => {
      lay.t += dt; if (lay.t < 0) return;
      anchor(p);
      if (L.at === 'ground' || L.at == null) { if (kit.heightAt) p.y = kit.heightAt(p.x, p.z); }
      m.position.copy(p); m.position.y += (L.y ?? -0.15) * fx.scale;
      const g = L.grow ? L.grow[0] + (L.grow[1] - L.grow[0]) * (1 - (1 - Math.min(1, lay.t / (L.grow[2] ?? 0.4))) ** 3) : 1;
      const hg = L.heightGrow ? L.heightGrow[0] + (L.heightGrow[1] - L.heightGrow[0]) * Math.min(1, lay.t / (L.heightGrow[2] ?? 0.4)) : 1;
      m.scale.set(R * g, H * hg, R * g);
      m.rotation.y += (L.spin || 0) * dt;
      const sc = L.scroll || [0, -0.4];
      u.uScroll.value.x += sc[0] * dt; u.uScroll.value.y += sc[1] * dt;
      let e = env(lay.t, life, fin, fout, lay.stopAt);
      if (L.pulse) e *= 1 - L.pulse[0] + L.pulse[0] * (0.5 + 0.5 * Math.sin(lay.t * L.pulse[1] * 6.283));
      u.uOpacity.value = (L.opacity ?? 0.8) * e;
      m.visible = true;
      if (lay.t >= life || (lay.stopAt != null && lay.t - lay.stopAt > fout)) lay.free();
    };
    lay.stop = () => { if (lay.stopAt == null) lay.stopAt = Math.max(0, lay.t); };
    lay.free = () => { if (!lay.freed) { lay.freed = true; if (it.busy && it.owner === me) pool.put(it); } lay.done = true; };
    return lay;
  },

  mesh(fx, L, anchor) {
    const kit = fx.kit, THREE = kit.THREE;
    const pool = kit.glows[L.kind || 'core'] || kit.glows.core;
    const it = pool.get(), u = it.u, m = it.obj;
    const life = L.life ?? fx.defaultLife();
    const lay = { done: false, t: -(L.delay || 0), stopAt: null };
    u.uCol.value.copy(fx.hex(L.color || 'hot')); u.uEdge.value.copy(fx.hex(L.edge || 'mid')); u.uOpacity.value = 0;
    const p = new THREE.Vector3(), look = new THREE.Vector3();
    const size = (L.size ?? 0.4) * fx.scale, st = L.stretch ?? 1;
    const spin = L.spin || [0, 0, 0];
    const me = { steal: () => { lay.done = true; kit.counts.stolen++; } }; it.owner = me;
    const fin = L.fadeIn ?? 0.05, fout = L.fadeOut ?? 0.15;
    lay.update = dt => {
      lay.t += dt; if (lay.t < 0) return;
      anchor(p); if (L.offset) p.add(look.set(...L.offset).multiplyScalar(fx.scale));
      m.position.copy(p);
      if (L.align !== false && fx.missileVel && fx.missileVel.lengthSq() > 1e-4) { look.copy(p).add(fx.missileVel); m.lookAt(look); m.rotateZ(lay.t * (spin[2] || 0)); }
      else { m.rotation.x += spin[0] * dt; m.rotation.y += spin[1] * dt; m.rotation.z += spin[2] * dt; }
      const k = L.grow ? L.grow[0] + (L.grow[1] - L.grow[0]) * Math.min(1, lay.t / (L.grow[2] ?? 0.3)) : 1;
      const pul = L.pulse ? 1 + L.pulse[0] * Math.sin(lay.t * L.pulse[1] * 6.283) : 1;
      m.scale.set(size * k * pul, size * k * pul, size * k * pul * st);
      u.uOpacity.value = (L.opacity ?? 1) * env(lay.t, life, fin, fout, lay.stopAt);
      m.visible = true;
      if (lay.t >= life || (lay.stopAt != null && lay.t - lay.stopAt > fout)) lay.free();
    };
    lay.stop = () => { if (lay.stopAt == null) lay.stopAt = Math.max(0, lay.t); };
    lay.free = () => { if (!lay.freed) { lay.freed = true; if (it.busy && it.owner === me) pool.put(it); } lay.done = true; };
    return lay;
  },

  light(fx, L, anchor) {
    const kit = fx.kit, THREE = kit.THREE;
    const lay = { done: false, t: -(L.delay || 0), stopAt: null, stop() { if (lay.stopAt == null) lay.stopAt = Math.max(0, lay.t); }, free() { if (it && it.busy && it.owner === me) kit.lights.put(it); lay.done = true; } };
    let it = null, me = null;
    if (!kit.lights.items.length) { lay.done = true; lay.update = () => {}; return lay; }   // low quality: no lights
    it = kit.lights.get(); const l = it.obj;
    const life = L.life ?? fx.defaultLife();
    l.color.copy(fx.hex(L.color || 'mid')); l.distance = (L.range ?? 6) * fx.scale; l.intensity = 0;
    const p = new THREE.Vector3();
    me = { steal: () => { lay.done = true; } }; it.owner = me;
    const fin = L.fadeIn ?? 0.04, fout = L.fadeOut ?? (Number.isFinite(life) ? life * 0.8 : 0.3);
    lay.update = dt => {
      lay.t += dt; if (lay.t < 0) return;
      anchor(p); l.position.copy(p); l.position.y += (L.y ?? 0.6) * fx.scale;
      const fl = L.flicker ? 1 - L.flicker * Math.random() : 1;
      l.intensity = (L.intensity ?? 4) * env(lay.t, life, fin, fout, lay.stopAt) * fl;
      if (lay.t >= life || (lay.stopAt != null && lay.t - lay.stopAt > fout)) lay.free();
    };
    return lay;
  },

  shake(fx, L) {
    const lay = { done: false, t: -(L.delay || 0), stop() {}, free() { lay.done = true; } };
    lay.update = dt => { lay.t += dt; if (lay.t >= 0) { fx.kit.shake((L.strength ?? 0.4) * Math.min(1.5, fx.scale), L.seconds ?? 0.3); lay.done = true; } };
    return lay;
  },

  // trail behind a moving anchor (missile, hand)
  ribbon(fx, L, anchor) {
    const kit = fx.kit, THREE = kit.THREE, it = kit.ribbons.get(), u = it.u;
    const pts = [], ages = [];
    const keep = L.seconds ?? 0.25, step = (L.step ?? 0.12) * fx.scale;
    u.uCol.value.copy(fx.hex(L.color || 'hot')); u.uEdge.value.copy(fx.hex(L.edge || 'mid')); u.uOpacity.value = L.opacity ?? 1;
    u.uMap.value = kit.tex.map(fx.subst(L.tex || 'band_mist')); u.uTexMix.value = L.tex ? (L.texMix ?? 0.7) : 0;
    it.obj.material.blending = L.blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
    const p = new THREE.Vector3();
    const lay = { done: false, t: 0, stopAt: null };
    const me = { steal: () => { lay.done = true; kit.counts.stolen++; } }; it.owner = me;
    const fades = [];
    lay.update = dt => {
      lay.t += dt;
      for (let i = 0; i < ages.length; i++) ages[i] += dt;
      if (lay.stopAt == null) {
        anchor(p);
        if (!pts.length || pts[0].distanceTo(p) > step) { pts.unshift(p.clone()); ages.unshift(0); }
        else { pts[0].copy(p); }
      }
      while (ages.length && (ages[ages.length - 1] > keep || pts.length > it.N)) { ages.pop(); pts.pop(); }
      fades.length = pts.length;
      for (let i = 0; i < pts.length; i++) fades[i] = Math.max(0, 1 - ages[i] / keep) * (1 - i / Math.max(1, pts.length));
      u.uScroll.value -= dt * (L.scroll ?? 2);
      fillRibbon(THREE, it, pts, { width: (L.width ?? 0.3) * fx.scale, camPos: kit.camera.position, taper: L.taper ?? 0.9, fades });
      if (lay.stopAt != null && pts.length < 2) lay.free();
    };
    lay.stop = () => { lay.stopAt = lay.t; };
    lay.free = () => { if (!lay.freed) { lay.freed = true; if (it.busy && it.owner === me) kit.ribbons.put(it); } lay.done = true; };
    return lay;
  },

  // jagged lightning between the chain's points (beam phase). Each hop borrows one ribbon.
  arc(fx, L) {
    const kit = fx.kit, THREE = kit.THREE;
    const chain = fx.chain || [fx.caster, fx.point];
    const hops = [];
    const life = L.life ?? fx.seconds ?? 0.6;
    const lay = { done: false, t: -(L.delay || 0), stopAt: null, next: 0 };
    const segs = L.segs ?? 14, jit = (L.jitter ?? 0.35) * fx.scale;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
    const anchorOf = (v, out) => (v && v.isObject3D && !v.isBone ? toVec(v, out, fx.height * 0.6) : toVec(v, out));
    const fork = L.fork ?? 0;
    for (let i = 0; i < chain.length - 1; i++) {
      for (let f = 0; f <= fork; f++) {
        const it = kit.ribbons.get();
        it.u.uCol.value.copy(fx.hex(L.color || 'hot')); it.u.uEdge.value.copy(fx.hex(L.edge || 'mid'));
        it.u.uTexMix.value = 0; it.obj.material.blending = THREE.AdditiveBlending;
        const me = { steal: () => { kit.counts.stolen++; } }; it.owner = me;
        hops.push({ it, me, i, f, pts: Array.from({ length: segs + 1 }, () => new THREE.Vector3()), on: false });
      }
    }
    const reshape = h => {
      anchorOf(chain[h.i], a); anchorOf(chain[h.i + 1], b);
      const d = a.distanceTo(b);
      side.subVectors(b, a).normalize(); up.set(0, 1, 0).cross(side).normalize();
      const w = up.clone(), v = side.clone().cross(up).normalize();
      for (let k = 0; k <= segs; k++) {
        const s = k / segs, env2 = Math.sin(Math.PI * s);
        h.pts[k].lerpVectors(a, b, s)
          .addScaledVector(w, (Math.random() - 0.5) * 2 * jit * env2 * (h.f ? 1.8 : 1) * Math.min(1, d / 3))
          .addScaledVector(v, (Math.random() - 0.5) * 2 * jit * env2 * (h.f ? 1.8 : 1) * Math.min(1, d / 3));
      }
    };
    const fades = new Array(segs + 1).fill(1);
    lay.update = dt => {
      lay.t += dt; if (lay.t < 0) return;
      lay.next -= dt;
      const refresh = lay.next <= 0; if (refresh) lay.next = L.every ?? 0.05;
      const e = env(lay.t, life, 0.02, L.fadeOut ?? 0.15, lay.stopAt);
      for (const h of hops) {
        const shownAt = h.i * (fx.hop ?? 0.08);
        if (lay.t < shownAt) continue;
        if (refresh || !h.on) reshape(h);
        h.on = true;
        h.it.u.uOpacity.value = e * (h.f ? 0.55 : 1) * (0.75 + 0.25 * Math.random());
        fillRibbon(THREE, h.it, h.pts, { width: (L.width ?? 0.22) * fx.scale * (h.f ? 0.6 : 1), camPos: kit.camera.position, taper: 0, fades });
      }
      if (lay.t >= life || (lay.stopAt != null && e <= 0)) lay.free();
    };
    lay.stop = () => { if (lay.stopAt == null) lay.stopAt = Math.max(0, lay.t); };
    lay.free = () => { if (!lay.freed) { lay.freed = true; for (const h of hops) if (h.it.busy && h.it.owner === h.me) kit.ribbons.put(h.it); } lay.done = true; };
    return lay;
  },

  // weapon sweep: the strip between the blade's base and tip over the last few frames — or, from kit.swing(), a
  // crescent drawn analytically at the true reach (no weapon needed)
  sweep(fx, L) {
    if (fx.swingArc) return swingLayer(fx, L);
    if (fx.pathArc) return pathLayer(fx, L);
    const kit = fx.kit, THREE = kit.THREE, it = kit.ribbons.get(), u = it.u;
    const keep = L.seconds ?? 0.18;
    u.uCol.value.copy(fx.hex(L.color || 'hot')); u.uEdge.value.copy(fx.hex(L.edge || 'mid')); u.uOpacity.value = L.opacity ?? 1;
    u.uMap.value = kit.tex.map(fx.subst(L.tex || 'band_mist')); u.uTexMix.value = L.tex ? 0.6 : 0;
    it.obj.material.blending = THREE.AdditiveBlending;
    const pairs = [], ages = [], flat = [], fades = [];
    const lay = { done: false, t: 0, stopAt: null };
    const me = { steal: () => { lay.done = true; kit.counts.stolen++; } }; it.owner = me;
    lay.update = dt => {
      lay.t += dt;
      for (let i = 0; i < ages.length; i++) ages[i] += dt;
      if (lay.stopAt == null && fx.weapon) {
        fx.weapon.updateWorldMatrix(true, false);
        const b = fx.base.clone().applyMatrix4(fx.weapon.matrixWorld), t = fx.tip.clone().applyMatrix4(fx.weapon.matrixWorld);
        pairs.unshift([b, t]); ages.unshift(0);
      }
      while (ages.length && (ages[ages.length - 1] > keep || pairs.length > it.N)) { ages.pop(); pairs.pop(); }
      flat.length = 0; fades.length = 0;
      pairs.forEach((p, i) => { flat.push(p[0], p[1]); fades.push(Math.max(0, 1 - ages[i] / keep)); });
      fillRibbon(THREE, it, flat, { mode: 'sweep', fades });
      if (lay.stopAt != null && pairs.length < 2) lay.free();
    };
    lay.stop = () => { lay.stopAt = lay.t; };
    lay.free = () => { if (!lay.freed) { lay.freed = true; if (it.busy && it.owner === me) kit.ribbons.put(it); } lay.done = true; };
    return lay;
  },
};
LAYERS.trail = LAYERS.ribbon;

/** kit.swing()'s crescent: base/tip pairs round the arc from the trailing edge to the leading edge, every frame. */
function swingLayer(fx, L) {
  const kit = fx.kit, THREE = kit.THREE, it = kit.ribbons.get(), u = it.u, S = fx.swingArc;
  u.uCol.value.copy(fx.hex(L.color || 'hot')); u.uEdge.value.copy(fx.hex(L.edge || 'mid')); u.uOpacity.value = L.opacity ?? 1;
  u.uMap.value = kit.tex.map(fx.subst(L.tex || 'band_mist')); u.uTexMix.value = L.tex ? 0.6 : 0;
  it.obj.material.blending = THREE.AdditiveBlending;
  const M = 24, pts = Array.from({ length: M * 2 }, () => new THREE.Vector3()), fades = new Array(M).fill(1);
  const lay = { done: false, t: -(L.delay || 0), stopAt: null };
  const me = { steal: () => { lay.done = true; kit.counts.stolen++; } }; it.owner = me;
  const c = fx.point, inner = (L.inner ?? S.inner), fout = L.fadeOut ?? 0.22;
  lay.update = dt => {
    lay.t += dt; if (lay.t < 0) return;
    const k = Math.min(1, lay.t / S.seconds), e = 1 - (1 - k) ** 2;
    const head = -S.angle / 2 + S.angle * e, back = Math.max(-S.angle / 2, head - S.tail);
    const fadeAll = lay.t > S.seconds ? Math.max(0, 1 - (lay.t - S.seconds) / fout) : 1;
    for (let i = 0; i < M; i++) {
      const f = i / (M - 1), a = head + (back - head) * f;
      if (S.overhead) {   // a vertical arc over the front: from up high, down to the ground in front
        const fa = Math.atan2(Math.sin(S.a0), Math.cos(S.a0)), up = (a + S.angle / 2) / Math.max(1e-3, S.angle);   // 0 = top, 1 = ground
        const pitch = Math.PI * 0.5 * (1 - up), rr = S.R * (0.35 + 0.65 * up);
        const fx0 = Math.sin(fa), fz0 = Math.cos(fa);
        pts[i * 2].set(c.x + fx0 * rr * inner, c.y + S.h + Math.sin(pitch) * S.R * 0.55 * inner, c.z + fz0 * rr * inner);
        pts[i * 2 + 1].set(c.x + fx0 * rr, c.y + 0.25 + Math.sin(pitch) * S.R * 0.6, c.z + fz0 * rr);
      } else {
        const ang = S.a0 + a, sx = Math.sin(ang), sz = Math.cos(ang);
        pts[i * 2].set(c.x + sx * S.R * inner, c.y + S.h, c.z + sz * S.R * inner);
        pts[i * 2 + 1].set(c.x + sx * S.R, c.y + S.h + 0.15, c.z + sz * S.R);
      }
      fades[i] = (1 - f) * fadeAll;
    }
    fillRibbon(THREE, it, pts, { mode: 'sweep', fades });
    if (lay.t > S.seconds + fout) lay.free();
  };
  lay.stop = () => {};
  lay.free = () => { if (!lay.freed) { lay.freed = true; if (it.busy && it.owner === me) kit.ribbons.put(it); } lay.done = true; };
  return lay;
}
/** The point `k` metres along the blade at clip time `t` of a measured swing path (obj-local), into `out`. */
function pathAt(path, t, out, k) {
  let i = 0;
  while (i < path.length - 2 && path[i + 1][0] < t) i++;
  const a = path[i], b = path[Math.min(path.length - 1, i + 1)];
  const f = b[0] > a[0] ? Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0]))) : 0;
  const L = j => a[j] + (b[j] - a[j]) * f;
  let dx = L(4), dy = L(5), dz = L(6); const n = Math.hypot(dx, dy, dz) || 1; dx /= n; dy /= n; dz /= n;
  return out.set(L(1) + dx * k, L(2) + dy * k, L(3) + dz * k);
}
/** kit.pathSwing()'s ribbon: the blade's sweep between b0 and b1 along the measured path, head on the clip's clock. */
function pathLayer(fx, L) {
  const kit = fx.kit, THREE = kit.THREE, it = kit.ribbons.get(), u = it.u, S = fx.pathArc;
  u.uCol.value.copy(fx.hex(L.color || 'hot')); u.uEdge.value.copy(fx.hex(L.edge || 'mid')); u.uOpacity.value = L.opacity ?? 1;
  u.uMap.value = kit.tex.map(fx.subst(L.tex || 'band_mist')); u.uTexMix.value = L.tex ? 0.6 : 0;
  it.obj.material.blending = THREE.AdditiveBlending;
  const M = 20, pts = Array.from({ length: M * 2 }, () => new THREE.Vector3()), fades = new Array(M).fill(1);
  const lay = { done: false, t: -(L.delay || 0), stopAt: null };
  const me = { steal: () => { lay.done = true; kit.counts.stolen++; } }; it.owner = me;
  // L.end 'back': the weapon's other end (a quarterstaff swings both); L.inner: start part-way up the blade; L.reach: past the tip
  const lo = L.end === 'back' ? -S.b0 : S.b0, hi = L.end === 'back' ? S.back : S.b1;
  const inner = L.inner ?? 0, b0 = lo + (hi - lo) * inner, b1 = hi * (L.reach ?? 1), tail = S.tail * (L.tail ?? 1);
  const fout = L.fadeOut ?? 0.18;
  lay.update = dt => {
    lay.t += dt; if (lay.t < 0) return;
    // the head rides the clip's clock to the end of the stroke; then the whole arc stays and fades over fadeOut s
    const hT = S.t0 + lay.t * S.speed, head = Math.min(hT, S.t1), back = Math.max(S.t0, head - tail);
    const fadeAll = hT > S.t1 ? 1 - (hT - S.t1) / S.speed / fout : 1;
    if (fadeAll <= 0) { lay.free(); return; }
    const obj = fx.weapon; obj.updateWorldMatrix(true, false);
    const mw = obj.matrixWorld;
    for (let i = 0; i < M; i++) {
      const f = i / (M - 1), t = head + (back - head) * f;
      pathAt(S.path, t, pts[i * 2], b0).applyMatrix4(mw);
      pathAt(S.path, t, pts[i * 2 + 1], b1).applyMatrix4(mw);
      fades[i] = (1 - f) ** 1.1 * fadeAll;
    }
    pathAt(S.path, head, fx.tip, S.b1);              // the 'tip' anchor (obj-local; applied with obj.matrixWorld)
    fillRibbon(THREE, it, pts, { mode: 'sweep', fades });
  };
  lay.stop = () => {};
  lay.free = () => { if (!lay.freed) { lay.freed = true; if (it.busy && it.owner === me) kit.ribbons.put(it); } lay.done = true; };
  return lay;
}
export const LAYER_TYPES = Object.keys(LAYERS);
