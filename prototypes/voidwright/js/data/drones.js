// Drones: little craft launched from drone bays. They fly AHEAD of you in a fan (owner: "not behind you
// but up front ready for action"), engage what is near, and are rebuilt at the bay from materials.

export const DRONES = {
  dart:    { name: 'Dart', hp: 30, speed: 420, weapon: { dmg: 3, type: 'laser', size: 's', rate: 3, range: 260, proj: 'bolt', speed: 1300, color: '#ff6a8a' }, cost: { cr: 120, mats: { ferrite: 4 } }, color: '#ff6a8a', tier: 1, blurb: 'Fast laser fighter.' },
  hornet:  { name: 'Stinger', hp: 40, speed: 360, weapon: { dmg: 2, type: 'kinetic', size: 's', rate: 8, range: 220, proj: 'bullet', speed: 1000, color: '#ffd27a' }, cost: { cr: 150, mats: { ferrite: 5 } }, color: '#ffd27a', tier: 1, blurb: 'Gun drone. Good against light hulls.' },
  miner:   { name: 'Prospector', hp: 35, speed: 260, mines: true, weapon: { dmg: 8, type: 'laser', size: 's', rate: 0, range: 160, proj: 'beam', color: '#7dff9a' }, cost: { cr: 180, mats: { ferrite: 3, carbon: 2 } }, color: '#7dff9a', tier: 1, blurb: 'Cuts ore from nearby rocks while you fly.' },
  mender:  { name: 'Mender', hp: 30, speed: 300, repairs: 6, cost: { cr: 260, mats: { ferrite: 4, carbon: 3 } }, color: '#7fd0ff', tier: 2, blurb: 'Patches your blocks, even in combat (slowly).' },
  warden:  { name: 'Warden', hp: 60, speed: 300, interceptor: true, weapon: { dmg: 3, type: 'laser', size: 's', rate: 5, range: 220, proj: 'pulse', speed: 2200, color: '#ff9db8' }, cost: { cr: 240, mats: { ferrite: 4, quartz: 1 } }, color: '#ff9db8', tier: 2, blurb: 'Shoots down missiles before they reach you.' },
  wasp:    { name: 'Rocketeer', hp: 45, speed: 330, weapon: { dmg: 10, type: 'explosive', size: 'm', rate: 0.8, range: 420, proj: 'rocket', speed: 600, color: '#ff8a2a', splash: 28 }, cost: { cr: 320, mats: { ferrite: 5, carbon: 3 } }, color: '#ff8a2a', tier: 2, blurb: 'Fires rockets at bigger targets.' },
  spark:   { name: 'Spark', hp: 35, speed: 380, weapon: { dmg: 6, type: 'lightning', size: 's', rate: 1.2, range: 220, proj: 'arc', chain: 2, chainRange: 120, color: '#b48cff', shieldMult: 2 }, cost: { cr: 300, mats: { carbon: 4, quartz: 1 } }, color: '#b48cff', tier: 2, blurb: 'Arc drone. Strips shields.' },
  lancer:  { name: 'Lancer', hp: 90, speed: 300, weapon: { dmg: 22, type: 'plasma', size: 'm', rate: 0.7, range: 360, proj: 'plasma', speed: 700, color: '#5ff3ff', splash: 18 }, cost: { cr: 700, mats: { titanium: 3, cobalt: 2 } }, color: '#5ff3ff', tier: 3, blurb: 'Heavy plasma drone.' },
  bulwark: { name: 'Bulwark', hp: 220, speed: 260, shield: 160, cost: { cr: 900, mats: { titanium: 4, diamond: 1 } }, color: '#9fd8ff', tier: 3, blurb: 'A flying shield that soaks shots in front of you.' },
  hunter:  { name: 'Hunter', hp: 70, speed: 400, weapon: { dmg: 14, type: 'explosive', size: 'm', rate: 0.5, range: 700, proj: 'missile', speed: 520, homing: 3, color: '#ff6a3a', splash: 30 }, cost: { cr: 800, mats: { cobalt: 3, titanium: 2 } }, color: '#ff6a3a', tier: 3, blurb: 'Missile drone. Long range.' },
  // enemy-only
  lattice_mite: { name: 'Mite', hp: 25, speed: 360, enemy: true, weapon: { dmg: 3, type: 'lightning', size: 's', rate: 1.5, range: 200, proj: 'arc', chain: 1, chainRange: 90, color: '#7fe6ff' }, color: '#7fe6ff', tier: 1 },
  vesh_spawn:   { name: 'Spawnling', hp: 20, speed: 380, enemy: true, weapon: { dmg: 4, type: 'plasma', size: 's', rate: 1.6, range: 160, proj: 'plasma', speed: 500, color: '#a6ff4a' }, color: '#a6ff4a', tier: 1 },
};
for (const [id, d] of Object.entries(DRONES)) d.id = id;
