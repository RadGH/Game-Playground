// Chibi 3 races: parameter sets on the one heroic body. No Three.js (node tests read this).
//
// Same idea as chibi2-races.js — a race is numbers, not a second model — but the numbers mean real
// anatomy now: stature in metres, muscle and fat as separate dials, and face shaping that moves bone
// and cartilage (jaw, brow ridge, cheekbones, nose bridge) instead of scaling a sphere.
//
// Chibi 2's nine race ids are all here, so any saved Chibi 2 look renders as the same race.
// Human, elf, dwarf and orc are the tuned ones; the other five are reasonable first passes.

export const CHIBI3_RACES = {
  human: {
    name: 'Human', stature: 1.80, body: { leg: 1, torso: 1, shoulders: 1, width: 1, arm: 1, hand: 1, head: 1, neck: 1, muscle: 0.5, fat: 0.12 },
    face: { jaw: 1, chin: 1, brow: 0.35, cheek: 0.5, nose: 1, noseWidth: 1, lips: 1, ear: 1, earPoint: 0, tusks: 0, hollow: 0, muzzle: 0, eye: 1 },
    posture: { spine: 0, neck: 0, knees: 0, shoulders: 0 },
    skin: ['#f3d2b8', '#e8b994', '#d29a6e', '#b07a50', '#7d4f32', '#4f3222'],
    hair: ['#1a1410', '#3b2a1a', '#6b4a2a', '#a86a3a', '#d6b46a', '#e9dcb4', '#7a1d12', '#8d8a86'],
  },
  elf: {
    name: 'Elf', stature: 1.86, body: { leg: 1.07, torso: 1.0, shoulders: 0.9, width: 0.86, arm: 1.04, hand: 0.94, head: 0.95, neck: 1.15, muscle: 0.35, fat: 0.02 },
    face: { jaw: 0.86, chin: 1.05, brow: 0.1, cheek: 0.85, nose: 0.95, noseWidth: 0.82, lips: 0.9, ear: 1.15, earPoint: 1, tusks: 0, hollow: 0.25, muzzle: 0, eye: 1.08 },
    posture: { spine: -0.03, neck: -0.02, knees: 0, shoulders: -0.02 },
    skin: ['#f6dcc6', '#ecc6a4', '#d9ab84', '#c9cfc3', '#b9a8d6'],
    hair: ['#e9dcb4', '#f4efe2', '#c9b27a', '#1a1410', '#4a3a8a', '#2a6a5a'],
  },
  dwarf: {
    name: 'Dwarf', stature: 1.36, body: { leg: 0.7, torso: 0.96, shoulders: 1.18, width: 1.26, arm: 0.92, hand: 1.18, head: 1.14, neck: 0.8, muscle: 0.65, fat: 0.38 },
    face: { jaw: 1.12, chin: 0.95, brow: 0.85, cheek: 0.7, nose: 1.25, noseWidth: 1.3, lips: 1.0, ear: 1.05, earPoint: 0, tusks: 0, hollow: 0, muzzle: 0, eye: 0.92 },
    posture: { spine: 0.02, neck: 0, knees: 0.04, shoulders: 0 },
    skin: ['#f0c8a8', '#e0aa84', '#c88a62', '#9a6444'],
    hair: ['#7a1d12', '#a8501f', '#3b2a1a', '#1a1410', '#8d8a86', '#d6b46a'],
  },
  orc: {
    name: 'Orc', stature: 1.98, body: { leg: 0.97, torso: 1.06, shoulders: 1.28, width: 1.2, arm: 1.08, hand: 1.25, head: 0.98, neck: 1.35, muscle: 0.9, fat: 0.16 },
    face: { jaw: 1.32, chin: 0.85, brow: 1.0, cheek: 0.75, nose: 0.85, noseWidth: 1.45, lips: 1.15, ear: 1.05, earPoint: 0.7, tusks: 1, hollow: 0, muzzle: 0.25, eye: 0.85 },
    posture: { spine: 0.09, neck: 0.12, knees: 0.06, shoulders: 0.05 },
    skin: ['#6f8f4a', '#5d7d3e', '#7f9a55', '#4f6a3a', '#8a8f5a', '#7d6a55'],
    hair: ['#1a1410', '#2a2420', '#3b2a1a', '#5a5550'],
  },
  giant: {
    name: 'Giant', stature: 2.5, body: { leg: 1.0, torso: 1.08, shoulders: 1.3, width: 1.3, arm: 1.1, hand: 1.3, head: 0.88, neck: 1.3, muscle: 0.7, fat: 0.3 },
    face: { jaw: 1.25, chin: 1.1, brow: 1.0, cheek: 0.6, nose: 1.3, noseWidth: 1.3, lips: 1.1, ear: 1.1, earPoint: 0, tusks: 0, hollow: 0, muzzle: 0, eye: 0.85 },
    posture: { spine: 0.06, neck: 0.06, knees: 0.03, shoulders: 0.03 },
    skin: ['#c9a58a', '#a8b0b8', '#8a7a6a'], hair: ['#5a5550', '#3b2a1a', '#c8c0b0'],
  },
  goblin: {
    name: 'Goblin', stature: 1.15, body: { leg: 0.78, torso: 0.9, shoulders: 0.85, width: 0.85, arm: 1.12, hand: 1.2, head: 1.32, neck: 0.85, muscle: 0.3, fat: 0.05 },
    face: { jaw: 0.95, chin: 1.2, brow: 0.6, cheek: 0.9, nose: 1.6, noseWidth: 1.0, lips: 0.85, ear: 1.9, earPoint: 1, tusks: 0.2, hollow: 0.2, muzzle: 0, eye: 1.1 },
    posture: { spine: 0.12, neck: 0.1, knees: 0.1, shoulders: 0.05 },
    skin: ['#7f9a4a', '#9aa85a', '#6a8a5a'], hair: ['#1a1410', '#3b2a1a'],
  },
  halfling: {
    name: 'Halfling', stature: 1.12, body: { leg: 0.82, torso: 0.92, shoulders: 0.92, width: 1.0, arm: 0.95, hand: 1.05, head: 1.22, neck: 0.9, muscle: 0.25, fat: 0.4 },
    face: { jaw: 0.92, chin: 0.9, brow: 0.2, cheek: 0.4, nose: 0.85, noseWidth: 1.05, lips: 1.05, ear: 1.15, earPoint: 0.55, tusks: 0, hollow: 0, muzzle: 0, eye: 1.08 },
    posture: { spine: 0, neck: 0, knees: 0, shoulders: 0 },
    skin: ['#f3d2b8', '#e8b994', '#d29a6e'], hair: ['#3b2a1a', '#6b4a2a', '#a86a3a', '#d6b46a'],
  },
  undead: {
    name: 'Undead', stature: 1.78, body: { leg: 1.0, torso: 1.0, shoulders: 0.95, width: 0.82, arm: 1.02, hand: 0.95, head: 0.98, neck: 1.0, muscle: 0.15, fat: 0 },
    face: { jaw: 0.95, chin: 1.0, brow: 0.7, cheek: 1.1, nose: 0.7, noseWidth: 0.9, lips: 0.6, ear: 0.9, earPoint: 0, tusks: 0, hollow: 0.9, muzzle: 0, eye: 1.0 },
    posture: { spine: 0.12, neck: 0.14, knees: 0.05, shoulders: 0.08 },
    skin: ['#a8b0a0', '#8a9a8a', '#b8b0a0', '#9aa0b0'], hair: ['#5a5550', '#2a2420', '#c8c0b0'],
  },
  beast: {
    name: 'Beastkin', stature: 1.82, body: { leg: 1.02, torso: 1.0, shoulders: 1.08, width: 1.04, arm: 1.02, hand: 1.06, head: 1.02, neck: 1.1, muscle: 0.6, fat: 0.1 },
    face: { jaw: 1.05, chin: 0.85, brow: 0.6, cheek: 0.6, nose: 1.2, noseWidth: 1.25, lips: 0.9, ear: 1.4, earPoint: 1, tusks: 0.3, hollow: 0, muzzle: 0.8, eye: 1.0 },
    posture: { spine: 0.05, neck: 0.05, knees: 0.04, shoulders: 0 },
    skin: ['#8a6a4a', '#a8865a', '#6a5a4a', '#c8b090'], hair: ['#3b2a1a', '#6b4a2a', '#1a1410'],
  },
};

export const CHIBI3_RACE_IDS = Object.keys(CHIBI3_RACES);
export function race3Of(avatar) { return CHIBI3_RACES[avatar?.body?.race] || CHIBI3_RACES.human; }

/**
 * The Chibi 3 dials that live on top of the shared avatar JSON, with their defaults. Stored at
 * `avatar.body.c3` because the shared 2D normaliser keeps unknown keys inside `body` and drops
 * unknown top-level keys — so a Chibi 3 look survives Farhold's and Emberveil's normalise step.
 * Every dial is 0..1 with 0.5 meaning "the race's own value".
 */
export const C3_DIALS = {
  muscle: { label: 'Muscle', group: 'Body' },
  fat: { label: 'Body fat', group: 'Body' },
  shoulders: { label: 'Shoulders', group: 'Body' },
  legs: { label: 'Leg length', group: 'Body' },
  arms: { label: 'Arm length', group: 'Body' },
  neck: { label: 'Neck', group: 'Body' },
  jaw: { label: 'Jaw width', group: 'Face' },
  chin: { label: 'Chin', group: 'Face' },
  brow: { label: 'Brow ridge', group: 'Face' },
  cheek: { label: 'Cheekbones', group: 'Face' },
  nose: { label: 'Nose length', group: 'Face' },
  noseWidth: { label: 'Nose width', group: 'Face' },
  noseBridge: { label: 'Nose bridge', group: 'Face' },
  lips: { label: 'Lip fullness', group: 'Face' },
  mouthWidth: { label: 'Mouth width', group: 'Face' },
  eyeSize: { label: 'Eye size', group: 'Face' },
  eyeSpacing: { label: 'Eye spacing', group: 'Face' },
  eyeTilt: { label: 'Eye tilt', group: 'Face' },
  ear: { label: 'Ear size', group: 'Face' },
  earPoint: { label: 'Ear point', group: 'Face' },
  age: { label: 'Age lines', group: 'Face' },
};

/** Resolve a dial: 0.5 keeps the race value, 0 and 1 reach `spread` below and above it. */
export function dial(avatar, key, raceValue, spread) {
  const v = avatar?.body?.c3?.[key];
  if (!Number.isFinite(v)) return raceValue;
  return raceValue + (Math.max(0, Math.min(1, v)) - 0.5) * 2 * spread;
}
