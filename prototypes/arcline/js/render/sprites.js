// Baked pictures for the city view: City Kit models → day + night-lights pairs, cached by recipe/params/turn/facing.
// Baking happens a few at a time between frames so the game never hitches; until a picture is ready the map draws a
// simple stand-in shape of the right size. Zoned lots reuse a handful of looks per recipe+storeys (seed modulo) so
// a big city needs hundreds of bakes, not thousands.
import { Baker } from '../../../../citykit/js/bake.js';
import { headingOfDir, headingOfGroundDir } from '../../../../citykit/js/iso.js';
import { RECIPES, build } from '../../../../citykit/js/kit/buildings.js';
import '../../../../citykit/js/kit/all.js';

export class Sprites {
  constructor({ scale = 2 } = {}) { this.baker = new Baker({ scale }); this.map = new Map(); this.queue = []; this.queued = new Set(); this.baked = 0; }
  get scale() { return this.baker.scale; }
  has(id) { return !!RECIPES[id]; }
  recipe(id) { return RECIPES[id]; }
  _get(key, make, urgent = false) {
    const s = this.map.get(key); if (s) return s;
    if (!this.queued.has(key)) { this.queued.add(key); (urgent ? this.queue.unshift.bind(this.queue) : this.queue.push.bind(this.queue))({ key, make }); }
    return null;
  }
  /** A building/wall picture for map turn `rot`. */
  building(id, params, rot, urgent = false) {
    if (!RECIPES[id]) return null;
    return this._get(`b|${id}|${stable(params)}|${rot}`, () => this.baker.bakePair(build(id, params), { rot }), urgent);
  }
  /** A picture facing screen direction `dir` of n (turret heads, creatures, vehicles); same at every map turn. */
  facing(id, params, dir, n, anim = null, frame = 0) {
    const r = RECIPES[id]; if (!r) return null;
    return this._get(`f|${id}|${stable(params)}|${dir}|${anim}|${frame}`, () => {
      const g = build(id, params), h = headingOfDir(dir, n, 0);
      if (anim && g.userData.pose) g.userData.pose(anim, frame / r.anims[anim].frames, h); else g.userData.face?.(h);
      return this.baker.bakePair(g, { rot: 0 });
    });
  }
  /** A picture facing ground direction `i` of n (iso.js groundDirOfHeading — vehicles on roads): the model's long axis
   *  lies exactly along the road on screen. Same set at every map turn. */
  ground(id, params, i, n, anim = null, frame = 0) {
    const r = RECIPES[id]; if (!r) return null;
    return this._get(`g|${id}|${stable(params)}|${i}|${n}|${anim}|${frame}`, () => {
      const g = build(id, params), h = headingOfGroundDir(i, n);
      if (anim && g.userData.pose) g.userData.pose(anim, frame / r.anims[anim].frames, h); else g.userData.face?.(h);
      return this.baker.bakePair(g, { rot: 0 });
    });
  }
  /** Bake for up to `ms` milliseconds. Returns how many are still waiting. */
  work(ms = 8) {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < ms) {
      const { key, make } = this.queue.shift();
      try { this.map.set(key, make()); } catch (e) { this.map.set(key, { failed: String(e) }); console.warn('[arcline] bake failed', key, e); }
      this.queued.delete(key); this.baked++;
    }
    if (this.map.size > 2500) { let n = 400; for (const k of this.map.keys()) { this.map.delete(k); if (--n <= 0) break; } }
    return this.queue.length;
  }
}
const stable = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
