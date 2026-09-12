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

export class Stage {
  /** @param {HTMLElement} container  @param {{assets?: Assets}} opts  Pass an Assets instance to share one loader; otherwise the stage opens its own. */
  constructor(container, { assets = null } = {}) {
    this.container = container;
    this.assets = assets ? Promise.resolve(assets) : Assets.open(new URL('../../../assets/', import.meta.url).href);
    this._backdropToken = 0; this.backdrop = document.createElement('div'); this.backdrop.className = 'backdrop'; container.append(this.backdrop);
    this.scene = createScene(container, { background: 0x1e2128, ground: false }); this.scene.renderer.setClearColor(0x000000, 0); this.scene.scene.background = null;
    this.scene.camera.position.set(0, 1.2, 6.2); this.scene.controls.target.set(0, 0.9, 0); this.scene.controls.enabled = false; this.scene.camera.fov = 28; this.scene.camera.updateProjectionMatrix();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ color: 0x2a2f2a, roughness: 1, transparent: true, opacity: 0.55 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.scene.add(ground); this.ground = ground;
    this.chars = new Map(); this.anims = []; this.fire = null;
    // Spell effects (avatar-3d/js/spellfx.js). The sprite textures are fetched in the background;
    // until they land the effects draw their geometry only, so nothing waits on the network.
    // scale 1.4: the fight camera sits further back than the effects gallery, so everything is
    // drawn larger here or it disappears against the backdrop.
    this.fx = new SpellFx(this.scene.scene, { camera: this.scene.camera, scale: 1.4 });
    this.fxReady = this.assets.then(a => a.fxTextures(THREE, { size: 128 })).then(t => { this.fx.setTextures(t); return t; }).catch(() => null);
    this.scene.addTicker((dt, t) => { for (const c of this.chars.values()) c.ctrl.update(dt, t); for (const a of [...this.anims]) if (a(dt, t)) this.anims.splice(this.anims.indexOf(a), 1); this.fx.update(dt); if (this.fire) { this.fire.scale.y = 1 + Math.sin(t * 9) * 0.12 + Math.sin(t * 23) * 0.05; this.fireLight.intensity = 2.2 + Math.sin(t * 13) * 0.4; } });
    this.setBackdrop('village');
  }
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
    const ctrl = ch.creature ? await createCreature(ch.creature) : await createMiiCharacter(ch.avatar || randomAvatar(this.presets || { palettes: { skin: ['#c68642'], hair: ['#222'], eye: ['#222'], cloth: ['#555'] }, raceRules: {} }, { seed: 1 }));
    const g = ctrl.group; g.userData.character = false;
    const x = side === 'left' ? -1.2 - index * 0.9 : 1.2 + index * 0.9; g.position.set(x, 0, (index % 2) * 0.35 - 0.2);
    g.rotation.y = facing != null ? facing : (side === 'left' ? 0.9 : -0.9);
    if (ch.creature) ctrl.isCreature = true; const mm = ctrl.metrics?.(); g.userData.fxHeight = mm?.totalHeight || mm?.height || 1.5; this.scene.scene.add(g); this.chars.set(ch.id, { ctrl, group: g, side, home: g.position.clone(), rot: g.rotation.y, ch });
    if (ch.hp !== undefined && ch.hp <= 0) this.down(ch.id); return ctrl;
  }
  async setSide(list, side, facing) { for (const c of [...this.chars.values()]) if (c.side === side) await this.remove(c.ch.id); for (let i = 0; i < list.length; i++) await this.add(list[i], { side, index: i, count: list.length, facing }); }
  async remove(id) { const c = this.chars.get(id); if (!c) return; this.fx.clearStatuses(c.group); this.scene.scene.remove(c.group); c.ctrl.dispose(); this.chars.delete(id); }
  clearSide(side) { for (const c of [...this.chars.values()]) if (c.side === side) this.remove(c.ch.id); }
  anim(id, name) { this.chars.get(id)?.ctrl.setAnim(name); }
  /** Thrust toward the target and back. */
  attack(id, targetId) {
    return new Promise(res => { const c = this.chars.get(id), t = this.chars.get(targetId); if (!c) return res(); if (c.ctrl.isCreature) { c.ctrl.setAnim('attack'); setTimeout(() => { if (c.ctrl.anim === 'attack') c.ctrl.setAnim('idle'); }, 650); } const from = c.home.clone(), to = t ? t.group.position.clone().lerp(from, 0.45) : from.clone().add(new THREE.Vector3(c.side === 'left' ? 1 : -1, 0, 0)); let k = 0; this.anims.push((dt) => { k += dt * 3.2; const p = k < 0.5 ? k * 2 : 2 - k * 2; c.group.position.lerpVectors(from, to, Math.min(1, Math.max(0, p))); if (k >= 1) { c.group.position.copy(from); res(); return true; } return false; }); });
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

  /** Camp: members in an arc around a fire, facing it. */
  async camp(members) {
    for (const c of [...this.chars.values()]) await this.remove(c.ch.id);
    const n = members.length; for (let i = 0; i < n; i++) { const a = Math.PI * 0.15 + (i / Math.max(1, n - 1)) * Math.PI * 0.7; const x = Math.cos(a) * 2.1, z = Math.sin(a) * 1.1 + 0.2; await this.add(members[i], { side: 'camp', index: i, facing: Math.atan2(-x, -(z - 0.1)) + Math.PI }); const c = this.chars.get(members[i].id); c.group.position.set(x, 0, z); c.home.copy(c.group.position); c.group.rotation.y = Math.atan2(0 - x, 0 - z); }
    const fire = new THREE.Group(); const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x4a2f1a })); logs.rotation.z = Math.PI / 2; logs.position.y = 0.06; fire.add(logs); const logs2 = logs.clone(); logs2.rotation.y = Math.PI / 3; fire.add(logs2);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.9 })); flame.position.y = 0.4; fire.add(flame); const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a0 })); flame2.position.y = 0.36; fire.add(flame2);
    const light = new THREE.PointLight(0xff9a3a, 2.2, 6, 1.5); light.position.y = 0.6; fire.add(light); fire.position.set(0, 0, 0.1); this.scene.scene.add(fire); this.fire = flame; this.fireLight = light; this.fireGroup = fire;
  }
  clearCamp() { if (this.fireGroup) { this.scene.scene.remove(this.fireGroup); this.fireGroup = null; this.fire = null; } }
  setNight(night) { const hemi = this.scene.scene.children.find(o => o.isHemisphereLight), key = this.scene.scene.children.find(o => o.isDirectionalLight && o.castShadow); if (hemi) hemi.intensity = night ? 0.25 : 1.1; if (key) key.intensity = night ? 0.3 : 2.2; }
}
