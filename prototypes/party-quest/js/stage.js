// Cinematic 3D stage: party on the left facing right, others on the right facing left, Mii-style bodies,
// thrust attack animation, camp circle, SVG backdrops per location, day/night lighting.
import * as THREE from 'three';
import { createScene } from '../../../avatar-3d/js/scene.js';
import { createMiiCharacter } from '../../../avatar-3d/js/mii.js';
import { randomAvatar } from '../../../avatar-2d/js/random.js';

const BACKDROPS = {
  village: `<rect width="100%" height="100%" fill="#7fb0d8"/><path d="M0 70 Q25 60 50 68 T100 66 V100 H0Z" fill="#5b8f4a"/><g fill="#b58a5a"><rect x="12" y="52" width="14" height="14"/><rect x="60" y="50" width="18" height="16"/></g><g fill="#6b3b2a"><path d="M10 52 L19 44 L28 52Z"/><path d="M58 50 L69 41 L80 50Z"/></g><circle cx="80" cy="18" r="6" fill="#ffe9a8"/>`,
  forest: `<rect width="100%" height="100%" fill="#8fc0e0"/><path d="M0 72 Q50 62 100 70 V100 H0Z" fill="#4e7f3a"/><g fill="#2f5e2a">${[8, 22, 38, 55, 70, 86].map(x => `<path d="M${x} 70 L${x + 7} 40 L${x + 14} 70Z"/>`).join('')}</g><g fill="#3f7a35">${[15, 30, 47, 63, 78, 93].map(x => `<path d="M${x} 74 L${x + 6} 48 L${x + 12} 74Z"/>`).join('')}</g>`,
  deepforest: `<rect width="100%" height="100%" fill="#3a5a4a"/><g fill="#1f3a2a">${[2, 14, 26, 38, 50, 62, 74, 86].map(x => `<rect x="${x}" y="20" width="5" height="60"/><ellipse cx="${x + 2.5}" cy="24" rx="10" ry="12"/>`).join('')}</g><path d="M0 76 H100 V100 H0Z" fill="#2c4a34"/>`,
  cave: `<rect width="100%" height="100%" fill="#1a1c22"/><path d="M0 0 Q20 30 0 60 V100 H100 V60 Q80 30 100 0Z" fill="#2b2f38"/><g fill="#3a3f4a">${[10, 30, 55, 75].map(x => `<path d="M${x} 0 L${x + 4} 22 L${x + 8} 0Z"/>`).join('')}</g><path d="M0 80 H100 V100 H0Z" fill="#23262e"/>`,
  road: `<rect width="100%" height="100%" fill="#a9c8e2"/><path d="M0 70 Q50 64 100 70 V100 H0Z" fill="#7a9a5a"/><path d="M40 100 L48 70 L52 70 L60 100Z" fill="#9a8f7a"/><g fill="#6b6b6b"><rect x="30" y="66" width="2" height="6"/><rect x="66" y="66" width="2" height="6"/></g>`,
  downs: `<rect width="100%" height="100%" fill="#9aa5b0"/><g fill="#6f8a5a"><ellipse cx="15" cy="78" rx="22" ry="10"/><ellipse cx="55" cy="80" rx="26" ry="11"/><ellipse cx="90" cy="78" rx="20" ry="9"/></g><rect y="70" width="100" height="30" fill="#c9d3d9" opacity=".5"/>`,
  barrow: `<rect width="100%" height="100%" fill="#101418"/><path d="M0 80 H100 V100 H0Z" fill="#1c2228"/><path d="M35 80 L40 30 H60 L65 80Z" fill="#0a0c10"/><g stroke="#2e3a44" stroke-width="2" fill="none"><path d="M30 80 L36 26 H64 L70 80"/></g>`,
  marsh: `<rect width="100%" height="100%" fill="#8aa090"/><path d="M0 72 H100 V100 H0Z" fill="#2f4a3a"/><g stroke="#5a7a4a" stroke-width="1.5">${[5, 12, 20, 33, 41, 58, 66, 80, 91].map(x => `<line x1="${x}" y1="74" x2="${x + 1}" y2="46"/>`).join('')}</g><ellipse cx="50" cy="86" rx="30" ry="5" fill="#1f3a2f"/>`,
  bridge: `<rect width="100%" height="100%" fill="#9fb8cc"/><path d="M0 60 H30 V100 H0Z M70 60 H100 V100 H70Z" fill="#6b6f78"/><path d="M28 62 Q50 44 72 62 V70 Q50 56 28 70Z" fill="#8a8e96"/><path d="M30 100 Q50 70 70 100Z" fill="#3a4a5a"/>`,
  mountain: `<rect width="100%" height="100%" fill="#b8cfe6"/><path d="M0 80 L25 30 L45 65 L60 20 L80 60 L100 40 V100 H0Z" fill="#6e7a8a"/><path d="M25 30 L20 40 L30 40Z M60 20 L54 32 L66 32Z" fill="#eef3f8"/>`,
  camp_orc: `<rect width="100%" height="100%" fill="#5a3a3a"/><path d="M0 78 H100 V100 H0Z" fill="#3a2a22"/><g fill="#4a3226"><path d="M10 78 L22 52 L34 78Z"/><path d="M60 78 L74 50 L88 78Z"/></g><g stroke="#e6e0c8" stroke-width="1.2">${[40, 46, 52].map(x => `<line x1="${x}" y1="78" x2="${x}" y2="62"/><circle cx="${x}" cy="60" r="2" fill="#e6e0c8"/>`).join('')}</g>`,
  city: `<rect width="100%" height="100%" fill="#a8b8c8"/><g fill="#7a7f88"><rect x="0" y="40" width="100" height="40"/><rect x="20" y="30" width="10" height="12"/><rect x="70" y="28" width="12" height="14"/></g><path d="M44 80 V52 Q50 44 56 52 V80Z" fill="#2e3440"/><path d="M0 80 H100 V100 H0Z" fill="#8a8f99"/>`,
  camp: `<rect width="100%" height="100%" fill="#0f1420"/><g fill="#fff3c4">${[10, 25, 40, 58, 71, 88, 33, 80].map((x, i) => `<circle cx="${x}" cy="${8 + (i * 7) % 30}" r=".6"/>`).join('')}</g><path d="M0 76 H100 V100 H0Z" fill="#1a2418"/><g fill="#12201a"><path d="M0 76 L14 52 L28 76Z"/><path d="M74 76 L88 48 L100 76Z"/></g>`,
};
export class Stage {
  constructor(container) {
    this.container = container; this.backdrop = document.createElement('div'); this.backdrop.className = 'backdrop'; container.append(this.backdrop);
    this.scene = createScene(container, { background: 0x1e2128, ground: false }); this.scene.renderer.setClearColor(0x000000, 0); this.scene.scene.background = null;
    this.scene.camera.position.set(0, 1.2, 6.2); this.scene.controls.target.set(0, 0.9, 0); this.scene.controls.enabled = false; this.scene.camera.fov = 28; this.scene.camera.updateProjectionMatrix();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ color: 0x2a2f2a, roughness: 1, transparent: true, opacity: 0.55 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.scene.add(ground); this.ground = ground;
    this.chars = new Map(); this.anims = []; this.fire = null;
    this.scene.addTicker((dt, t) => { for (const c of this.chars.values()) c.ctrl.update(dt, t); for (const a of [...this.anims]) if (a(dt, t)) this.anims.splice(this.anims.indexOf(a), 1); if (this.fire) { this.fire.scale.y = 1 + Math.sin(t * 9) * 0.12 + Math.sin(t * 23) * 0.05; this.fireLight.intensity = 2.2 + Math.sin(t * 13) * 0.4; } });
    this.setBackdrop('village');
  }
  setBackdrop(id, night = false) { const svg = BACKDROPS[id] || BACKDROPS.road; this.backdrop.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">${svg}${night ? '<rect width="100%" height="100%" fill="#060a18" opacity=".62"/>' : ''}</svg>`; this.ground.material.color.set(night ? 0x141a18 : 0x2a2f2a); }
  async add(ch, { side = 'left', index = 0, count = 1, facing = null } = {}) {
    await this.remove(ch.id);
    const ctrl = await createMiiCharacter(ch.avatar || randomAvatar(this.presets || { palettes: { skin: ['#c68642'], hair: ['#222'], eye: ['#222'], cloth: ['#555'] }, raceRules: {} }, { seed: 1 }));
    const g = ctrl.group; g.userData.character = false;
    const x = side === 'left' ? -1.2 - index * 0.9 : 1.2 + index * 0.9; g.position.set(x, 0, (index % 2) * 0.35 - 0.2);
    g.rotation.y = facing != null ? facing : (side === 'left' ? 0.9 : -0.9);
    this.scene.scene.add(g); this.chars.set(ch.id, { ctrl, group: g, side, home: g.position.clone(), rot: g.rotation.y, ch });
    if (ch.hp !== undefined && ch.hp <= 0) this.down(ch.id); return ctrl;
  }
  async setSide(list, side, facing) { for (const c of [...this.chars.values()]) if (c.side === side) await this.remove(c.ch.id); for (let i = 0; i < list.length; i++) await this.add(list[i], { side, index: i, count: list.length, facing }); }
  async remove(id) { const c = this.chars.get(id); if (!c) return; this.scene.scene.remove(c.group); c.ctrl.dispose(); this.chars.delete(id); }
  clearSide(side) { for (const c of [...this.chars.values()]) if (c.side === side) this.remove(c.ch.id); }
  anim(id, name) { this.chars.get(id)?.ctrl.setAnim(name); }
  /** Thrust toward the target and back. */
  attack(id, targetId) {
    return new Promise(res => { const c = this.chars.get(id), t = this.chars.get(targetId); if (!c) return res(); const from = c.home.clone(), to = t ? t.group.position.clone().lerp(from, 0.45) : from.clone().add(new THREE.Vector3(c.side === 'left' ? 1 : -1, 0, 0)); let k = 0; this.anims.push((dt) => { k += dt * 3.2; const p = k < 0.5 ? k * 2 : 2 - k * 2; c.group.position.lerpVectors(from, to, Math.min(1, Math.max(0, p))); if (k >= 1) { c.group.position.copy(from); res(); return true; } return false; }); });
  }
  hit(id) { const c = this.chars.get(id); if (!c) return; let k = 0; const base = c.group.position.clone(); this.anims.push(dt => { k += dt * 8; c.group.position.x = base.x + Math.sin(k * 12) * 0.06 * (1 - k); if (k >= 1) { c.group.position.copy(base); return true; } return false; }); }
  down(id) { const c = this.chars.get(id); if (!c) return; c.ctrl.setAnim('dead'); }
  revive(id) { const c = this.chars.get(id); if (!c) return; c.ctrl.setAnim('idle'); c.group.rotation.x = 0; c.group.position.copy(c.home); }
  talk(id, on) { const c = this.chars.get(id); if (c && c.ch.hp !== 0) c.ctrl.setAnim(on ? 'talk' : 'idle'); }
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
