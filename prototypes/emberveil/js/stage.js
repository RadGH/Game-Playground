// Cinematic 3D stage: party on the left facing right, others on the right facing left, Mii-style bodies,
// thrust attack animation, camp circle, day/night lighting. Backdrops come from the shared asset
// library (assets/data/scenery/*.svg, indexed by assets/data/manifest.json) through assets/js/assets.js.
import * as THREE from 'three';
import { createScene } from '../../../avatar-3d/js/scene.js';
import { createMiiCharacter } from '../../../avatar-3d/js/mii.js';
import { randomAvatar } from '../../../avatar-2d/js/random.js';
import { createCreature } from '../../../avatar-3d/js/creatures.js';
import { Assets } from '../../../assets/js/assets.js';
import { SpellFx } from '../../../avatar-3d/js/spellfx.js';
import { createVehicle, vehicleModelFor } from '../../../avatar-3d/js/vehicles.js';

/**
 * How much of the world each view has to show, in world units. `width` is the widest the scene ever
 * gets (four heroes against four enemies), `top` is the tallest head we expect, and `headroom` is the
 * share of the frame kept empty above that head so speech bubbles always have somewhere to sit.
 * frame() turns these into a camera distance for whatever shape the stage panel actually is.
 */
export const FRAMES = {
  fight: { width: 7.8, top: 2.4, bottom: -0.15, headroom: 0.25 },
  camp: { width: 7.6, top: 2.2, bottom: -0.15, headroom: 0.25 },
  travel: { width: 9.0, top: 2.4, bottom: -0.2, headroom: 0.22 },
};
/**
 * Where the bodies on one side stand: the more of them there are, the tighter they line up.
 * Four heroes plus two summoned pets is six on one side, so the steps keep shrinking past four
 * instead of marching the last body off the edge of the stage (E30).
 */
function lineUp(count = 1) {
  if (count >= 7) return { base: 0.85, step: 0.56 };
  if (count >= 6) return { base: 0.88, step: 0.62 };
  if (count === 5) return { base: 0.92, step: 0.70 };
  if (count === 4) return { base: 0.95, step: 0.78 };
  if (count === 3) return { base: 1.05, step: 0.88 };
  return { base: 1.15, step: 0.95 };
}

/**
 * Floating health bars (E25) and the party tab's shield segment (E32) share one stylesheet, and the
 * perf overlay (E31) rides along with it. Injected once by the first Stage so no page has to
 * remember to import a CSS file.
 */
export const STAGE_CSS = `
.stage-bars{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3}
.stage-bars .sb{position:absolute;transform:translate(-50%,-100%);width:56px}
.stage-bars .sb .track{position:relative;height:6px;border-radius:3px;background:#1a1208cc;border:1px solid #00000080;box-shadow:0 1px 2px #0008;overflow:hidden;display:flex}
.stage-bars .sb .hpfill{height:100%;background:linear-gradient(#e0603a,#a82c20);transition:width calc(.18s * var(--pace, 1)) linear}
.stage-bars .sb.party .hpfill{background:linear-gradient(#6fc26a,#3d8a3a)}
.stage-bars .sb .shfill{height:100%;background:linear-gradient(#bcd8ff,#5f8fd8);opacity:.95}
.stage-bars .sb .nm{font:600 9px/1.2 system-ui,sans-serif;color:#e8ddc4;text-shadow:0 1px 2px #000,0 0 3px #000;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px}
.stage-bars .sb.dead{opacity:.35;filter:grayscale(1)}
.bar i.shield{background:linear-gradient(#bcd8ff,#5f8fd8)}
.stage-perf{position:absolute;left:6px;top:6px;z-index:9;font:11px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#cfe;background:#000a;border:1px solid #ffffff22;border-radius:4px;padding:4px 6px;pointer-events:none;white-space:pre}
`;
let cssInjected = false;
function injectCss() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  document.head.append(Object.assign(document.createElement('style'), { textContent: STAGE_CSS }));
}

export class Stage {
  /** Optional character/effect factories allow renderer comparisons without changing gameplay. */
  constructor(container, { assets = null, characterFactory = createMiiCharacter, effectsClass = SpellFx } = {}) {
    injectCss();
    this.container = container;
    this.characterFactory = characterFactory;
    this.chars = new Map();            // set up before frame(), which measures the line-up
    this.assets = assets ? Promise.resolve(assets) : Assets.open(new URL('../../../assets/', import.meta.url).href);
    this._backdropToken = 0; this.backdrop = document.createElement('div'); this.backdrop.className = 'backdrop'; container.append(this.backdrop);
    this.scene = createScene(container, { background: 0x1e2128, ground: false }); this.scene.renderer.setClearColor(0x000000, 0); this.scene.scene.background = null;
    this.scene.controls.enabled = false;
    // Camera framing is worked out from the panel's real shape (see frame()), not hard-coded, so a
    // full party of four against four enemies fits with room above the tallest head for speech bubbles.
    this.frameMode = 'fight'; this.frame('fight');
    this._ro = new ResizeObserver(() => this.frame()); this._ro.observe(container);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ color: 0x2a2f2a, roughness: 1, transparent: true, opacity: 0.55 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.scene.add(ground); this.ground = ground;
    this.anims = []; this.fire = null; this.vehicle = null; this._vehToken = 0;
    // floating health bars (E25) live in their own overlay above the canvas
    this.barsBox = document.createElement('div'); this.barsBox.className = 'stage-bars'; container.append(this.barsBox);
    this.bars = new Map();             // unit id -> { unit, el, hp, sh, name }
    this._perf = null; this._fps = 0; this._frames = 0; this._fpsT = 0; this.quality = 'high'; this._slow = 0;
    // Spell effects (avatar-3d/js/spellfx.js). The sprite textures are fetched in the background;
    // until they land the effects draw their geometry only, so nothing waits on the network.
    // scale 1.4: the fight camera sits further back than the effects gallery, so everything is
    // drawn larger here or it disappears against the backdrop.
    this.fx = new effectsClass(this.scene.scene, { camera: this.scene.camera, scale: 1.4 });
    this.fxReady = this.assets.then(a => a.fxTextures(THREE, { size: 128 })).then(t => { this.fx.setTextures(t); return t; }).catch(() => null);
    // Combat speed (E34): everything that moves on frame time — body animation, walk-ins, thrusts,
    // hit shakes, projectiles, impacts, auras — reads a scaled dt, so 1x really is slower and not
    // just longer gaps between actions. setTimeScale() changes it; the bars and perf readout keep real time.
    this.scene.addTicker((rawDt, t) => { const dt = rawDt * (this.timeScale ?? 1); for (const c of this.chars.values()) c.ctrl.update(dt, t); if (this.vehicle) this.vehicle.update(dt, t); for (const a of [...this.anims]) if (a(dt, t)) this.anims.splice(this.anims.indexOf(a), 1); this.fx.update(dt); if (this.fire) { this.fire.scale.y = 1 + Math.sin(t * 9) * 0.12 + Math.sin(t * 23) * 0.05; this.fireLight.intensity = 2.2 + Math.sin(t * 13) * 0.4; } this.updateBars(); this.tickPerf(dt); });
    this.setBackdrop('village');
    // ?perf=1 in the address bar, or shift+P at any time, shows the frame-cost overlay
    try { const q = new URLSearchParams(location.search);
      if (q.get('perf')) this.showPerf(true);
      if (q.get('quality')) { this.autoQualityOff = true; this.setQuality(q.get('quality')); }
    } catch { /* no location in tests */ }
    this._keyHandler = e => { if (e.key === 'P' && e.shiftKey && !e.metaKey && !e.ctrlKey) this.showPerf(!this._perf); };
    addEventListener('keydown', this._keyHandler);
  }

  // ---- floating health bars (E25) + shield segment (E32) ----------------------------------------
  // syncBars() is given the live unit objects (heroes and enemies from the fight), so the bars read
  // hp / maxHp / barrier straight off them every frame: no per-event bookkeeping to get out of step.

  /**
   * Show a bar over each of these fighters. Call once when a fight starts; call again if the
   * line-up changes. Units with no body on the stage are skipped.
   * @param {Array<{id:string,name?:string,short?:string,hp:number,maxHp:number,statuses?:Array}>} units
   */
  syncBars(units = []) {
    const want = new Set();
    for (const u of units) {
      if (!u || !this.chars.get(u.id)) continue;
      want.add(u.id);
      let b = this.bars.get(u.id);
      if (!b) {
        const el = document.createElement('div'); el.className = 'sb ' + (this.chars.get(u.id).side === 'left' ? 'party' : 'foe');
        const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = u.short || u.name || '';
        const track = document.createElement('div'); track.className = 'track';
        const hp = document.createElement('i'); hp.className = 'hpfill';
        const sh = document.createElement('i'); sh.className = 'shfill';
        track.append(hp, sh); el.append(nm, track); this.barsBox.append(el);
        b = { unit: u, el, hp, sh }; this.bars.set(u.id, b);
      } else b.unit = u;
    }
    for (const [id, b] of [...this.bars]) if (!want.has(id)) { b.el.remove(); this.bars.delete(id); }
    return this.bars.size;
  }
  /** Take every bar away (the fight is over). */
  clearBars() { for (const b of this.bars.values()) b.el.remove(); this.bars.clear(); }
  /** Total temporary hit points on a unit — barrier statuses plus anything marked as a shield. */
  shieldOf(unit) { return (unit?.statuses || []).reduce((n, s) => n + (s.type === 'barrier' || s.type === 'shield' ? Math.max(0, s.power || 0) : 0), 0); }
  /** Move and refill the bars. Runs every frame; there are never more than about a dozen. */
  updateBars() {
    if (!this.bars.size) return;
    const W = this.container.clientWidth || 640, H = this.container.clientHeight || 300;
    const v = new THREE.Vector3();
    for (const b of this.bars.values()) {
      const c = this.chars.get(b.unit.id);
      if (!c) { b.el.style.display = 'none'; continue; }
      c.group.getWorldPosition(v); v.y += this.heightOf(b.unit.id) + 0.1;
      v.project(this.scene.camera);
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
      const onScreen = v.z < 1 && x > -60 && x < W + 60;
      b.el.style.display = onScreen ? '' : 'none';
      if (!onScreen) continue;
      b.el.style.left = x + 'px'; b.el.style.top = y + 'px';
      const max = Math.max(1, Math.round(b.unit.maxHp || 1));
      const hp = Math.max(0, Math.min(max, Math.round(b.unit.hp || 0)));
      const sh = Math.min(max, Math.round(this.shieldOf(b.unit)));
      const hpPct = 100 * hp / max, shPct = Math.min(100 - hpPct, 100 * sh / max);
      b.hp.style.width = hpPct.toFixed(1) + '%';
      b.sh.style.width = shPct.toFixed(1) + '%';
      b.el.classList.toggle('dead', hp <= 0);
    }
  }

  // ---- perf overlay (E31) -----------------------------------------------------------------------

  /** Show or hide the frame-cost readout (?perf=1 or shift+P). */
  showPerf(on = true) {
    if (on && !this._perf) { this._perf = document.createElement('div'); this._perf.className = 'stage-perf'; this.container.append(this._perf); }
    else if (!on && this._perf) { this._perf.remove(); this._perf = null; }
    return !!this._perf;
  }
  /** Numbers the overlay (and the benchmark) reads. */
  perfStats() {
    const info = this.scene.renderer?.info || { render: {}, memory: {} };
    const fx = this.fx.stats();
    return { fps: Math.round(this._fps), calls: info.render.calls || 0, tris: info.render.triangles || 0,
      sprites: fx.particles, effects: fx.live, auras: fx.statuses, pooled: fx.pooled, dropped: fx.dropped, budget: fx.budget,
      bodies: this.chars.size, geometries: info.memory?.geometries || 0, textures: info.memory?.textures || 0,
      floats: typeof document !== 'undefined' ? document.querySelectorAll('.dmg').length : 0,
      bubbles: typeof document !== 'undefined' ? document.querySelectorAll('.bubble').length : 0 };
  }
  /**
   * How much the stage spends on looking good (E31).
   *
   * 'high' is the normal picture: shadow mapping on and the display's own pixel ratio. 'low' drops
   * the shadow pass (which is a whole extra draw of every body — the biggest single cost on the
   * stage, well ahead of the spell particles), pins the buffer to one device pixel and tightens the
   * particle budget. autoQuality() switches between them on its own when the frame rate sags, so a
   * fight on a slow machine loses the shadows rather than the frame rate.
   */
  setQuality(level) {
    if (this.quality === level) return level;
    this.quality = level; const r = this.scene.renderer;
    if (level === 'low') {
      r.shadowMap.enabled = false;
      r.setPixelRatio(1);
      this.fx.maxParticles = Math.min(this.fx.maxParticles, 140); this.fx.maxLive = Math.min(this.fx.maxLive, 24);
    } else {
      r.shadowMap.enabled = true; r.shadowMap.needsUpdate = true;
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      this.fx.maxParticles = 320; this.fx.maxLive = 48;
    }
    this.scene.resize?.();
    return level;
  }
  /** Drop to 'low' when the frame rate sags for a while, and climb back when it recovers. */
  autoQuality(dt) {
    if (this.autoQualityOff) return;
    this._slow = (this._slow || 0) + ((this._fps && this._fps < 24) ? dt : -dt * 0.5);
    this._slow = Math.max(0, Math.min(6, this._slow));
    if (this._slow > 1.5 && this.quality !== 'low') this.setQuality('low');
    else if (this._slow === 0 && this._fps > 50 && this.quality === 'low') this.setQuality('high');
  }
  tickPerf(dt) {
    this._frames++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this._fps = this._frames / this._fpsT; this._frames = 0; this._fpsT = 0; this.autoQuality(0.5); }
    if (!this._perf || this._frames % 6) return;
    const s = this.perfStats();
    this._perf.textContent = `fps ${s.fps}  draw ${s.calls}  tris ${s.tris}  [${this.quality}]\nfx sprites ${s.sprites} (pool ${s.pooled}, x${s.budget})\neffects ${s.effects}  auras ${s.auras}  dropped ${s.dropped}\nbodies ${s.bodies}  float text ${s.floats}  bubbles ${s.bubbles}`;
  }
  /**
   * Point the camera so a whole scene fits the stage panel, whatever shape the panel is.
   *
   * The panel is short and wide, so the width of the scene is usually what decides how far back the
   * camera has to sit; when the panel is squarer, the height decides. Either way we keep a slice of
   * empty frame (FRAMES[mode].headroom) above the tallest head, which is where the speech bubbles go.
   * Called on every resize, so the framing follows the window.
   */
  frame(mode = this.frameMode) {
    this.frameMode = mode; const F = FRAMES[mode] || FRAMES.fight;
    const cam = this.scene.camera, aspect = Math.max(0.5, cam.aspect || 1.78);
    // What is actually standing there decides the width, not just the four-on-four default: two
    // summoned pets make six bodies on the party side and the sixth used to stand off screen (E30).
    const need = this.contentBounds();
    const width = Math.max(F.width, need.halfWidth * 2);
    const contentH = Math.max(F.top, need.top) - F.bottom;
    const worldH = Math.max(contentH / (1 - F.headroom), width / aspect);   // tall enough for the heads, wide enough for the line-up
    const fov = 30; cam.fov = fov;
    const dist = (worldH / 2) / Math.tan(fov * Math.PI / 360);
    const midY = F.bottom + worldH / 2;
    cam.position.set(0, midY + 0.35, dist); this.scene.controls.target.set(0, midY, 0);   // a touch above, looking slightly down
    cam.updateProjectionMatrix(); this.scene.controls.update?.();
    this.worldFrame = { width: worldH * aspect, height: worldH, bottom: F.bottom, top: F.bottom + worldH, dist };
    return this.worldFrame;
  }
  /**
   * How much room everything on the stage needs right now: the widest body's standing place plus
   * half a body of margin, and the tallest head. Bodies that are mid-walk are measured where they
   * belong (their home), so a travel scene does not zoom the camera out and back.
   */
  contentBounds() {
    let halfWidth = 0, top = 0;
    for (const c of this.chars.values()) {
      const x = Math.abs((c.home || c.group.position).x);
      const h = c.group.userData.fxHeight || 1.5;
      halfWidth = Math.max(halfWidth, x + Math.max(0.55, h * 0.35));
      top = Math.max(top, h + 0.15);
    }
    return { halfWidth, top };
  }
  /** Where a body's speech bubble should point, in world space: just above the head. */
  // With floating health bars on (a fight) the anchor sits a little higher so a bubble does not
  // land on top of the bar.
  headOf(id) { const c = this.chars.get(id); if (!c) return null; const v = new THREE.Vector3(); c.group.getWorldPosition(v); v.y += this.heightOf(id) + (this.bars.size ? 0.38 : 0.22); return v; }
  /**
   * Show a scene behind the characters. Async because the art is fetched, but callers do not need to
   * await it: the ground tint changes right away and the art swaps in when it arrives. If two calls
   * overlap, only the newest one paints.
   */
  async setBackdrop(id, night = false) {
    const token = ++this._backdropToken;
    this.ground.material.color.set(night ? 0x141a18 : 0x2a2f2a);
    const assets = await this.assets;
    const svg = await assets.sceneryElement(id, { night, fallback: 'road' });
    if (token !== this._backdropToken) return; // a newer setBackdrop won
    this.backdrop.replaceChildren(svg);
  }
  async add(ch, { side = 'left', index = 0, count = 1, facing = null } = {}) {
    await this.remove(ch.id);
    const ctrl = ch.creature ? await createCreature(ch.creature) : await this.characterFactory(ch.avatar || randomAvatar(this.presets || { palettes: { skin: ['#c68642'], hair: ['#222'], eye: ['#222'], cloth: ['#555'] }, raceRules: {} }, { seed: 1 }));
    const g = ctrl.group; g.userData.character = false;
    const { base, step } = lineUp(count); const x = side === 'left' ? -base - index * step : base + index * step; g.position.set(x, 0, (index % 2) * 0.35 - 0.2);
    g.rotation.y = facing != null ? facing : (side === 'left' ? 0.9 : -0.9);
    if (ch.creature) ctrl.isCreature = true; const mm = ctrl.metrics?.(); g.userData.fxHeight = mm?.totalHeight || mm?.height || 1.5; this.scene.scene.add(g); this.chars.set(ch.id, { ctrl, group: g, side, home: g.position.clone(), rot: g.rotation.y, ch });
    if (ch.hp !== undefined && ch.hp <= 0) this.down(ch.id); return ctrl;
  }
  async setSide(list, side, facing) { for (const c of [...this.chars.values()]) if (c.side === side) await this.remove(c.ch.id); for (let i = 0; i < list.length; i++) await this.add(list[i], { side, index: i, count: list.length, facing }); this.frame(); return this.chars.size; }
  /**
   * Walk a whole side on from off stage to where they already stand, then hold them there (E9).
   * Used at the start of a fight so the enemies arrive instead of popping into existence.
   * Resolves when the last body is in place.
   * @param {'left'|'right'} side
   * @param {{ms?: number, stagger?: number}} opts
   */
  async marchIn(side = 'right', { ms = 900, stagger = 90 } = {}) {
    const list = [...this.chars.values()].filter(c => c.side === side);
    if (!list.length) return 0;
    const edge = (this.worldFrame?.width || 8) / 2 + 1.2;
    const jobs = list.map((c, i) => {
      const home = c.home.clone(); const startX = side === 'left' ? -edge : edge;
      c.group.position.set(startX, home.y, home.z);
      c.group.rotation.y = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
      c.ctrl.setAnim('walk');
      return new Promise(res => {
        let k = 0, wait = i * stagger / 1000;
        this.anims.push(dt => {
          if (wait > 0) { wait -= dt; return false; }
          k = Math.min(1, k + dt * 1000 / Math.max(200, ms));
          c.group.position.x = startX + (home.x - startX) * (k < 1 ? 1 - Math.pow(1 - k, 2) : 1);
          if (k >= 1) { c.group.position.copy(home); c.group.rotation.y = c.rot; if (!(c.ch.hp <= 0)) c.ctrl.setAnim('idle'); res(); return true; }
          return false;
        });
      });
    });
    await Promise.all(jobs);
    return list.length;
  }
  async remove(id) { const c = this.chars.get(id); if (!c) return; this.fx.clearStatuses(c.group); this.scene.scene.remove(c.group); c.ctrl.dispose(); this.chars.delete(id); const b = this.bars.get(id); if (b) { b.el.remove(); this.bars.delete(id); } }
  clearSide(side) { for (const c of [...this.chars.values()]) if (c.side === side) this.remove(c.ch.id); }
  anim(id, name) { this.chars.get(id)?.ctrl.setAnim(name); }
  /**
   * Combat speed (E34, js/pace.js): 1 is normal, 0.25 is four times slower. Scales the frame clock
   * every animation and effect runs on, and the one timer below that ends the attack pose.
   * main.js sets it when a fight starts and puts it back to 1 when the fight ends.
   */
  setTimeScale(s = 1) { this.timeScale = Math.max(0.05, Math.min(4, Number(s) || 1)); return this.timeScale; }
  /** Thrust toward the target and back. Bodies swing whatever they are holding (see mii.js 'attack'). */
  attack(id, targetId) {
    return new Promise(res => { const c = this.chars.get(id), t = this.chars.get(targetId); if (!c) return res(); c.ctrl.setAnim('attack'); setTimeout(() => { if (c.ctrl.anim === 'attack') c.ctrl.setAnim('idle'); }, 650 / (this.timeScale ?? 1)); const from = c.home.clone(), to = t ? t.group.position.clone().lerp(from, 0.45) : from.clone().add(new THREE.Vector3(c.side === 'left' ? 1 : -1, 0, 0)); let k = 0; this.anims.push((dt) => { k += dt * 3.2; const p = k < 0.5 ? k * 2 : 2 - k * 2; c.group.position.lerpVectors(from, to, Math.min(1, Math.max(0, p))); if (k >= 1) { c.group.position.copy(from); res(); return true; } return false; }); });
  }
  hit(id) { const c = this.chars.get(id); if (!c) return; let k = 0; const base = c.group.position.clone(); this.anims.push(dt => { k += dt * 8; c.group.position.x = base.x + Math.sin(k * 12) * 0.06 * (1 - k); if (k >= 1) { c.group.position.copy(base); return true; } return false; }); }
  down(id) { const c = this.chars.get(id); if (!c) return; c.ctrl.setAnim('dead'); }
  revive(id) { const c = this.chars.get(id); if (!c) return; c.ctrl.setAnim('idle'); c.group.rotation.x = 0; c.group.position.copy(c.home); }
  talk(id, on) { const c = this.chars.get(id); if (c && c.ch.hp !== 0) c.ctrl.setAnim(on ? 'talk' : 'idle'); }
  // ---- spell effects -------------------------------------------------------------------------
  // Positions come from the character group plus a height (ctrl.metrics(), cached on the group).

  /** Height of a body on the stage, in world units. */
  heightOf(id) { const c = this.chars.get(id); return c ? (c.group.userData.fxHeight || 1.5) : 1.5; }
  /** Chest height of a body, in world space — where spells come from and land. */
  pointOf(id, frac = 0.62) { const c = this.chars.get(id); if (!c) return new THREE.Vector3(0, 1, 0); const v = new THREE.Vector3(); c.group.getWorldPosition(v); v.y += this.heightOf(id) * frac; return v; }
  /** Ground under a body, in world space — where cast runes and heal rings sit. */
  footOf(id) { const c = this.chars.get(id); if (!c) return new THREE.Vector3(); const v = new THREE.Vector3(); c.group.getWorldPosition(v); v.y = 0; return v; }

  /**
   * Play a spell from one fighter at another: a flash at the caster, then something in flight.
   * `kind` 'melee' (or 'attack') keeps the old thrust animation and skips the projectile.
   * Resolves when the spell arrives, so the caller can follow it with impact().
   */
  async cast(sourceId, targetId, { element = 'arcane', kind = 'magic', crit = false, flash = true, flashMs = 150 } = {}) {
    const c = this.chars.get(sourceId); if (!c) return;
    if (kind === 'melee' || kind === 'attack') return this.attack(sourceId, targetId);
    if (c.ctrl.skeleton) { c.ctrl.setAnim('cast'); setTimeout(() => { if (c.ctrl.anim === 'cast') c.ctrl.setAnim('idle'); }, 1250); }
    if (flash) { this.fx.cast({ at: this.footOf(sourceId), element, ms: 340 }); await new Promise(r => setTimeout(r, flashMs)); }
    if (!targetId || !this.chars.get(targetId)) return;
    await this.fx.projectile({ from: this.pointOf(sourceId), to: this.pointOf(targetId), element, crit });
  }
  /** A burst on a fighter. */
  impact(targetId, element = 'physical', crit = false) { if (!this.chars.get(targetId)) return; this.fx.impact({ at: this.pointOf(targetId), element, crit, height: this.heightOf(targetId) }); }
  /** Turn a looping status aura on or off. */
  status(id, type, on = true) { const c = this.chars.get(id); if (!c) return; this.fx.status(c.group, type, on); }
  /** Which auras are showing on a fighter. */
  statusesOn(id) { const c = this.chars.get(id); return c ? this.fx.statusesOn(c.group) : []; }
  /** Drop every aura on a fighter (on death, or when a fight ends). */
  clearStatuses(id) { const c = this.chars.get(id); if (c) this.fx.clearStatuses(c.group); }
  /** One pulse of an existing aura, for a damage-over-time tick. */
  pulseStatus(id, type) { const c = this.chars.get(id); if (c) this.fx.pulseStatus(c.group, type); }
  /** Green motes rising out of the ground. */
  heal(id) { if (this.chars.get(id)) this.fx.heal({ at: this.footOf(id) }); }
  /** A pillar of light where someone gets back up. */
  reviveFx(id) { if (this.chars.get(id)) this.fx.revive({ at: this.footOf(id) }); }
  /** Bursts on several fighters at once (a zone skill). */
  aoe(ids, element = 'arcane', crit = false) { this.fx.aoe({ points: ids.map(i => this.pointOf(i)).filter(Boolean), element, crit }); }

  // ---- the party's vehicle ---------------------------------------------------------------------
  // One model at a time (avatar-3d/js/vehicles.js). The game stores a vehicle id; vehicleModelFor()
  // turns 'none' into null, which means the party walks and nothing is drawn.

  /**
   * Park the party's vehicle somewhere on the stage.
   * @param {string|null} gameId  a js/game.js VEHICLES key ('wagon', 'none', …)
   * @returns the vehicle controller, or null when the party is on foot
   */
  async setVehicle(gameId, { x = 0, z = 0, rot = 0, scale = 1, anim = 'idle' } = {}) {
    this.vehicleId = gameId; const model = vehicleModelFor(gameId); const token = ++this._vehToken;
    if (!model) { this.clearVehicle(); return null; }
    if (this.vehicle?.spec?.type !== model) {
      const v = await createVehicle(model);
      if (token !== this._vehToken) { v.dispose(); return this.vehicle; }   // a newer setVehicle won
      this.clearVehicle(); this.vehicle = v; this.scene.scene.add(v.group);
    }
    const g = this.vehicle.group; g.position.set(x, 0, z); g.rotation.y = rot; g.scale.setScalar(scale); this.vehicle.setAnim(anim);
    return this.vehicle;
  }
  clearVehicle() { if (this.vehicle) { this.scene.scene.remove(this.vehicle.group); this.vehicle.dispose(); this.vehicle = null; } }
  /** Park the vehicle behind and to the left of the party, out of the way of a fight. */
  // angled back and away: the cart's origin is the bed and the animal stands ~3 units in front of it,
  // so pointing it into the distance keeps the whole rig out of the party's half of the stage
  async parkVehicle(gameId) { return this.setVehicle(gameId, { x: -3.2, z: -1.0, rot: Math.PI * 0.38, scale: 0.72, anim: 'idle' }); }

  // ---- travel scenes ---------------------------------------------------------------------------

  /** Put everyone back where setSide/camp left them (after a travel scene has walked them around). */
  resetPositions() { for (const c of this.chars.values()) { c.group.position.copy(c.home); c.group.rotation.y = c.rot; if (c.ch.hp === undefined || c.ch.hp > 0) c.ctrl.setAnim('idle'); } }

  /**
   * The party crosses the stage from the left edge to the right, walking (or riding, when a vehicle
   * is owned) while the camera pans with them. Used by crossing nodes. Resolves at the far side;
   * call resetPositions() afterwards to put the line-up back.
   * @param {{vehicle?: string|null, ms?: number}} opts
   */
  async travelAcross({ vehicle = null, ms = 4200 } = {}) {
    this.frame('travel');
    const W = this.worldFrame.width, startX = -W / 2 - 1.4, endX = W / 2 + 1.4, dist = endX - startX;
    const walkers = [...this.chars.values()].filter(c => c.side !== 'right');
    walkers.forEach((c, i) => { c.group.position.set(startX - i * 0.85, 0, (i % 2) * 0.55 - 0.3); c.group.rotation.y = Math.PI / 2; c.ctrl.setAnim('walk'); });
    const veh = vehicle ? await this.setVehicle(vehicle, { x: startX - walkers.length * 0.85 - 4.4, z: 1.15, rot: 0, scale: 0.8, anim: 'roll' }) : null;
    const vehX0 = veh ? veh.group.position.x : 0;
    const cam = this.scene.camera, camX0 = cam.position.x, tgtX0 = this.scene.controls.target.x;
    await new Promise(res => {
      let k = 0;
      this.anims.push(dt => {
        k = Math.min(1, k + dt * 1000 / Math.max(400, ms));
        walkers.forEach((c, i) => { c.group.position.x = startX - i * 0.85 + dist * k; });
        if (veh) veh.group.position.x = vehX0 + dist * k;
        const pan = (k - 0.5) * W * 0.22;                 // the camera drifts with them instead of holding still
        cam.position.x = camX0 + pan; this.scene.controls.target.x = tgtX0 + pan;
        if (k >= 1) { res(); return true; }
        return false;
      });
    });
    cam.position.x = camX0; this.scene.controls.target.x = tgtX0;
    for (const c of walkers) c.ctrl.setAnim('idle'); if (veh) veh.setAnim('idle');
    return true;
  }

  /**
   * Walk one body on from an edge to a spot on the stage — a guard coming out to meet the party.
   * `from` and `to` are world x positions; the body turns to face the way it is going and then faces
   * back toward the party when it stops.
   */
  walkIn(id, from, to, { ms = 1800, z = 0, faceAtEnd = null } = {}) {
    const c = this.chars.get(id); if (!c) return Promise.resolve();
    c.group.position.set(from, 0, z); c.group.rotation.y = to < from ? -Math.PI / 2 : Math.PI / 2; c.ctrl.setAnim('walk');
    return new Promise(res => {
      let k = 0;
      this.anims.push(dt => {
        k = Math.min(1, k + dt * 1000 / Math.max(200, ms));
        c.group.position.x = from + (to - from) * k;
        if (k >= 1) { c.ctrl.setAnim('idle'); c.group.rotation.y = faceAtEnd != null ? faceAtEnd : (to < from ? -0.9 : 0.9); c.home.copy(c.group.position); c.rot = c.group.rotation.y; res(); return true; }
        return false;
      });
    });
  }

  /** Camp: members in an arc around a fire, facing it. */
  // `vehicle` falls back to the last id setVehicle/parkVehicle was given, so the camp still shows the
  // party's wagon even when camp() is called through a wrapper that only passes `members` along.
  async camp(members, { vehicle = undefined } = {}) {
    const vehicleId = vehicle === undefined ? this.vehicleId : vehicle;
    if (this.fireGroup) { this.scene.scene.remove(this.fireGroup); this.fireGroup = null; this.fire = null; }   // a second camp must not leave the first fire burning
    this.frame('camp');
    for (const c of [...this.chars.values()]) await this.remove(c.ch.id);
    const n = members.length; for (let i = 0; i < n; i++) { const a = Math.PI * 0.15 + (i / Math.max(1, n - 1)) * Math.PI * 0.7; const x = Math.cos(a) * 2.1, z = Math.sin(a) * 1.1 + 0.2; await this.add(members[i], { side: 'camp', index: i, facing: Math.atan2(-x, -(z - 0.1)) + Math.PI }); const c = this.chars.get(members[i].id); c.group.position.set(x, 0, z); c.home.copy(c.group.position); c.group.rotation.y = Math.atan2(0 - x, 0 - z); }
    const fire = new THREE.Group(); const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x4a2f1a })); logs.rotation.z = Math.PI / 2; logs.position.y = 0.06; fire.add(logs); const logs2 = logs.clone(); logs2.rotation.y = Math.PI / 3; fire.add(logs2);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.9 })); flame.position.y = 0.4; fire.add(flame); const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a0 })); flame2.position.y = 0.36; fire.add(flame2);
    const light = new THREE.PointLight(0xff9a3a, 2.2, 6, 1.5); light.position.y = 0.6; fire.add(light); fire.position.set(0, 0, 0.1); this.scene.scene.add(fire); this.fire = flame; this.fireLight = light; this.fireGroup = fire;
    // the vehicle stands at the edge of the circle, broadside to the fire so the light catches it
    if (vehicleId) await this.setVehicle(vehicleId, { x: -2.6, z: -0.85, rot: Math.PI * 0.18, scale: 0.78, anim: 'idle' }); else this.clearVehicle();
    this.frame('camp');   // the circle is as wide as the party is big (pets and companions included)
  }
  clearCamp() { if (this.fireGroup) { this.scene.scene.remove(this.fireGroup); this.fireGroup = null; this.fire = null; } this.frame('fight'); }
  setNight(night) { const hemi = this.scene.scene.children.find(o => o.isHemisphereLight), key = this.scene.scene.children.find(o => o.isDirectionalLight && o.castShadow); if (hemi) hemi.intensity = night ? 0.25 : 1.1; if (key) key.intensity = night ? 0.3 : 2.2; }
}
