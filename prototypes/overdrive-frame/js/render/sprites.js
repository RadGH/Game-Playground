// Baked pictures for a mission: City Kit models (buildings in their wreck stages, enemies in every facing and
// animation frame, props) → day + night-lights pairs, cached by recipe/params/facing/frame. Copied from Arcline's
// sprites.js and extended: wreck stages, a pre-bake list with progress (done during the dropship ride, so the fight
// never hitches), and a "nearest frame ready" fallback so an enemy never blinks out while its next frame bakes.
import { Baker } from '../../../../citykit/js/bake.js';
import { headingOfDir } from '../../../../citykit/js/iso.js';
import { RECIPES, build } from '../../../../citykit/js/kit/buildings.js';
import '../../../../citykit/js/kit/all.js';

export const DIRS = 16;
/** Frames baked per animation (fewer than the recipe offers: enough to read, cheap to bake). */
export const ANIM_FRAMES = { walk: 6, run: 6, drive: 2, fly: 4, hover: 4, attack: 4, fire: 3, spit: 4, leap: 4, charge: 6, slam: 4, die: 6, swell: 4, burst: 4, idle: 2, spawn: 4, emerge: 4, burrow: 2, aim: 2, deploy: 4, open: 3, jam: 2, brace: 2, summon: 4, roar: 4, crawl: 6 };

export class Sprites {
  constructor({ scale = 2.5 } = {}) {
    this.baker = new Baker({ scale }); this.map = new Map(); this.queue = []; this.queued = new Set(); this.baked = 0; this.failed = 0;
    this.lights = true;     // false on daytime missions: no night-light layer is baked (about half the work per picture)
  }
  get scale() { return this.baker.scale; }
  /** Day + lights, or day only when lights are off (an empty lights layer, same shape). */
  _pair(g, opts) {
    if (this.lights) return this.baker.bakePair(g, opts);
    const d = this.baker.bake(g, { ...opts, layer: 'day' });
    return { day: d.canvas, lights: EMPTY, w: d.w, h: d.h, ax: d.ax, ay: d.ay };
  }
  get lk() { return this.lights ? 'n' : 'd'; }
  has(id) { return !!RECIPES[id]; }
  recipe(id) { return RECIPES[id]; }

  _get(key, make, urgent = false) {
    const s = this.map.get(key); if (s) return s.failed ? null : s;
    if (!this.queued.has(key)) { this.queued.add(key); const job = { key, make }; if (urgent) this.queue.unshift(job); else this.queue.push(job); }
    return null;
  }

  /** A building (any wreck stage 0..3) for map turn 0. No baked smoke: the game draws its own, live. */
  buildingKey(id, params, stage) { const p = { ...params, damage: stage, smoke: 0 }; delete p.rot; return `b|${this.lk}|${id}|${stable(p)}|${params?.rot || 0}`; }
  building(id, params, stage = 0, urgent = false) {
    if (!RECIPES[id]) return null;
    const p = { ...params, damage: stage, smoke: 0 }; delete p.rot;
    const got = this._get(this.buildingKey(id, params, stage), () => this._pair(build(id, p), { rot: params?.rot || 0 }), urgent);
    if (got) return got;
    // not baked yet: show the nearest stage that is (a hit building keeps its old look a moment instead of hitching)
    for (const s of [stage - 1, stage - 2, stage - 3, stage + 1]) { if (s < 0 || s > 3) continue; const q = this.map.get(this.buildingKey(id, params, s)); if (q && !q.failed) return q; }
    return null;
  }
  hasKey(key) { return this.map.has(key); }

  /** A new map is about to be shown: let go of building pictures no lot on it uses (every stage, day and night), so
   *  a long session of missions doesn't keep every district it ever visited in memory (phones run out). */
  keepBuildingsFor(lots) {
    const keep = new Set(), lights = this.lights;
    for (const l of lots) if (l.recipe) for (const lt of [true, false]) { this.lights = lt; for (let st = 0; st < 4; st++) keep.add(this.buildingKey(l.recipe, l.params, st)); }
    this.lights = lights;
    let n = 0;
    for (const k of [...this.map.keys()]) if (k.startsWith('b|') && !keep.has(k)) { this.map.delete(k); n++; }
    return n;
  }

  /** Which animation names a recipe really has (falls back to the closest it offers). */
  animOf(id, want) {
    const A = RECIPES[id]?.anims; if (!A) return null;
    if (A[want]) return want;
    const alias = { attack: ['fire', 'slam', 'spit'], fire: ['attack'], walk: ['run', 'crawl', 'drive', 'fly', 'hover'], drive: ['walk'], fly: ['hover', 'walk'], die: ['burst'], idle: ['walk', 'hover', 'fly', 'drive'] };
    for (const a of alias[want] || []) if (A[a]) return a;
    return Object.keys(A)[0];
  }
  frames(id, anim) { const A = RECIPES[id]?.anims?.[anim]; return A ? Math.min(A.frames || 4, ANIM_FRAMES[anim] || 4) : 1; }

  /** A thing that faces a way (enemies, props): screen direction dir of DIRS, animation frame. */
  facing(id, params, dir, anim = null, frame = 0, urgent = false) {
    const r = RECIPES[id]; if (!r) return null;
    const n = r.dirs || DIRS, d = Math.round(dir * n / DIRS) % n;
    const key = `f|${this.lk}|${id}|${stable(params)}|${d}|${anim}|${frame}`;
    const got = this._get(key, () => {
      const g = build(id, params), h = headingOfDir(d, n, 0);
      if (anim && g.userData.pose) g.userData.pose(anim, frame / this.frames(id, anim), h); else g.userData.face?.(h);
      return this._pair(g, { rot: 0 });
    }, urgent);
    if (got) return got;
    // not ready yet: any frame of the same animation and facing, then any facing at all
    for (let f = 0; f < 8; f++) { const s = this.map.get(`f|${this.lk}|${id}|${stable(params)}|${d}|${anim}|${f}`); if (s && !s.failed) return s; }
    for (let k = 1; k < n; k++) for (const dd of [(d + k) % n, (d - k + n) % n]) { const s = this.map.get(`f|${this.lk}|${id}|${stable(params)}|${dd}|${anim}|0`); if (s && !s.failed) return s; }
    return null;
  }

  /** A picture for a menu icon: no ground shadow, so the frame is tight around the model (no cropping needed). */
  icon(id, params, dir, anim = null, frame = 0) {
    const r = RECIPES[id]; if (!r) return null;
    const n = r.dirs || DIRS, d = Math.round(dir * n / DIRS) % n;
    return this._get(`i|${id}|${stable(params)}|${d}|${anim}|${frame}`, () => {
      const g = build(id, params), h = headingOfDir(d, n, 0);
      if (anim && g.userData.pose) g.userData.pose(anim, frame / this.frames(id, anim), h); else g.userData.face?.(h);
      return this.baker.bakePair(g, { rot: 0, shadow: false });
    }, true);
  }

  /** Queue everything a mission will draw (enemy kinds × facings × animations, buildings' whole stage). */
  plan(list) { for (const it of list) it(); }

  /** Bake for up to ms milliseconds. Returns how many are still waiting. */
  work(ms = 8) {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < ms) {
      const { key, make } = this.queue.shift();
      try { this.map.set(key, make()); } catch (e) { this.map.set(key, { failed: String(e) }); this.failed++; console.warn('[overdrive] bake failed', key, e); }
      this.queued.delete(key); this.baked++;
    }
    return this.queue.length;
  }
}
const EMPTY = (() => { try { const c = document.createElement('canvas'); c.width = c.height = 1; return c; } catch { return null; } })();
export const stable = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
