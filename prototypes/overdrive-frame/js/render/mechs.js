// Mechs on screen: the Mech Kit's layered pictures (legs face movement, upper body faces the aim, paint tinted at run
// time) driven by the mission's mech state. Shares one WebGL baker with the City Kit sprites (one context).
import { MechBaker, mechLayers, composeMech, DIRS } from '../../../../mechkit/js/bake-mech.js';
import { LEG_ANIMS, UPPER_ANIMS } from '../../../../mechkit/js/rig.js';
import { dirOfHeading } from '../../../../citykit/js/iso.js';

/** The game's build (weapons as [L, R, SL, SR], items or ids) → the Mech Kit's build shape. */
export function kitBuild(b) {
  const id = x => (typeof x === 'string' ? x : x?.id) || null;
  const w = b.weapons || [];
  return { head: id(b.head), core: id(b.core), arms: id(b.arms), legs: id(b.legs), booster: id(b.booster), generator: id(b.generator), cooling: id(b.cooling), cpu: id(b.cpu),
    weapons: { armL: id(w[0]), armR: id(w[1]), shoulderL: id(w[2]), shoulderR: id(w[3]) } };
}

/** The poses a mission shows, per facing (owner report: "loading screen takes a while"). Fewer frames where the
 *  motion is short or subtle; the walk keeps all 8. `load` = baked before the drop, the rest in the first seconds. */
const LEG_SET = { idle: [0], walk: [0, 1, 2, 3, 4, 5, 6, 7], boost: [0, 2], quickboost: [1], hover: [0, 2], jump: [2], land: [1] };
const LOAD_LEGS = ['idle', 'walk'];
const UPPER_SET = [['idle', 0], ['idle', 2], ['fire-L', 0], ['fire-R', 0], ['fire-shoulder', 0]];
const nearestOf = (list, f) => list.reduce((b, x) => (Math.abs(x - f) < Math.abs(b - f) ? x : b), list[0]);
const upperSig = b => { const w = b.weapons || {}; return [b.core, b.head, b.arms, b.booster, w.armL, w.armR, w.shoulderL, w.shoulderR].map(x => x || '-').join(','); };

const LEG_OF = { idle: 'idle', walk: 'walk', boost: 'boost', jump: 'jump', hover: 'hover', quickboost: 'quickboost', down: 'down', land: 'land' };

export class MechArt {
  constructor(baker) { this.mb = new MechBaker({ baker }); this.sets = new Map(); this.fireT = new Map(); }

  layersFor(build) {
    const kb = kitBuild(build), key = JSON.stringify(kb);
    if (!this.sets.has(key)) this.sets.set(key, mechLayers(this.mb, kb));
    return this.sets.get(key);
  }

  /** Remember a shot so the upper body plays its recoil. */
  fired(mechId, slot) { this.fireT.set(mechId, { slot, t: 0 }); }

  /** Everything this build will show in a mission, baked now (called during the dropship ride, with progress). */
  /** Bake steps: 'load' = standing + walking in all 16 facings (before the drop); 'rest' = every other pose. */
  *prebakeSteps(build, part = 'load') {
    const L = this.layersFor(build);
    for (let d = 0; d < DIRS; d++) {
      for (const [a, frames] of Object.entries(LEG_SET)) if (LOAD_LEGS.includes(a) === (part === 'load')) for (const f of frames) yield () => L.legs(a, f, d);
      for (const [a, f] of UPPER_SET) if ((a === 'idle' && f === 0) === (part === 'load')) yield () => L.upper(a, f, d);
    }
  }
  _has(kb, kind, anim, frame, dir) { return this.mb.cache.has(kind === 'L' ? `L|${kb.legs}|${anim}|${frame}|${dir}` : `U|${upperSig(kb)}|${anim}|${frame}|${dir}`); }

  /** The View's mechDrawer. */
  draw = (ctx, m, sx, sy, zoom, night, t, alt) => {
    const L = this.layersFor(m.build);
    const legDir = dirOfHeading(m.face, DIRS, 0), aimDir = dirOfHeading(m.aim, DIRS, 0);
    const la = LEG_OF[m.anim] || 'idle', LA = LEG_ANIMS[la];
    let lf = Math.floor((m.animT || 0) * LA.fps);
    lf = LA.once ? Math.min(LA.frames - 1, lf) : lf % LA.frames;
    let ua = m.down ? 'down' : 'idle', uf = (Math.floor(t * 1.5) % 2) * 2;
    const f = this.fireT.get(m.id);
    if (!m.down && f) {     // recoil: the peak pose for a moment after each shot
      f.t += 1 / 60;
      if (f.t < 0.09) { ua = f.slot >= 2 ? 'fire-shoulder' : f.slot === 0 ? 'fire-L' : 'fire-R'; uf = 0; } else this.fireT.delete(m.id);
    }
    if (m.down) { const D = UPPER_ANIMS.down; uf = Math.min(D.frames - 1, Math.floor((m.downT || 0) * D.fps)); }
    let legA = m.down ? 'down' : la, legF = m.down ? Math.min(LEG_ANIMS.down.frames - 1, Math.floor((m.downT || 0) * LEG_ANIMS.down.fps)) : lf;
    if (LEG_SET[legA]) legF = nearestOf(LEG_SET[legA], legF);
    if (ua === 'idle') uf = uf ? 2 : 0;
    // a pose not baked yet: use one that is (walk/idle) rather than bake in the middle of a fight
    const kb = L.build;
    if (!this._has(kb, 'L', legA, legF, legDir)) { legA = this._has(kb, 'L', 'walk', 0, legDir) ? 'walk' : 'idle'; legF = 0; }
    if (!this._has(kb, 'U', ua, uf, aimDir)) { ua = 'idle'; uf = 0; }
    lf = legF;
    try {
      const out = composeMech(ctx, L, legDir, aimDir, { legs: [legA, legF], upper: [ua, uf] }, m.paint || 'maker', night, { x: sx, y: sy, zoom: zoom / this.mb.scale, alt });
      // hurt flash: brief white over the whole mech
      if (m.hurtT > 0.18) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25; composeMech(ctx, L, legDir, aimDir, { legs: [legA, legF], upper: [ua, uf] }, { primary: '#ffffff', secondary: '#ffffff', accent: '#ffffff' }, 0, { x: sx, y: sy, zoom: zoom / this.mb.scale, alt, shadow: false }); ctx.restore(); }
      m._muzzles = out.muzzles; m._top = out.top;
    } catch (e) {
      if (!this._warned) { this._warned = true; console.warn('[overdrive] mech draw', e); }
    }
  };
}
