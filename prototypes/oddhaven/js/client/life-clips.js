// Everyday clips for Chibi 2.5 bodies: sleeping, sitting, eating, cooking, washing, the toilet (seated, dressed, reading the paper),
// browsing a shelf, working a till, typing, working out. Oddhaven's own file: `registerClips` adds them to the shared motion
// module's table and a clip is only ever built for a character whose `anims` list names it, so no other game changes (rule 9).
import { registerClips, MOTION_KIT } from '../../../../avatar-3d/js/chibi2-motion.js';

export const LIFE_ANIMS = ['lifeSleep', 'lifeSit', 'lifeEat', 'lifeCook', 'lifeWash', 'lifeToilet', 'lifeBrowse', 'lifeTill', 'lifeType', 'lifeLift', 'lifeChop', 'lifeCarry', 'lifeLever', 'lifeHose'];
const { sin, PI } = Math;
void PI; void MOTION_KIT;

/** Knees at a right angle, feet on the floor: the hips come down by the length of the thigh, whatever the race's legs. */
function seated(p, ctx, o) {
  const hips = ctx.rig.byName.hips.position.y;
  o.rootY = -hips * 0.5;
  p.legL[0] = p.legR[0] = -1.5; p.kneeL[0] = p.kneeR[0] = 1.5; p.footL[0] = p.footR[0] = 0;
  p.legL[2] = -0.08; p.legR[2] = 0.08;
}
const free = { seconds: 3, handsFree: true };
registerClips({
  lifeSleep: { ...free, seconds: 5, pose(p, u, cy, ctx, o) { const b = sin(cy); p.chest[0] = 0.02 + b * 0.02; p.armL[2] = -0.2; p.armR[2] = 0.2; p.elbowL[0] = p.elbowR[0] = -0.1; p.head[1] = 0.25; o.bob = b * 0.004; return {}; } },
  lifeSit: { ...free, seconds: 4, pose(p, u, cy, ctx, o) { seated(p, ctx, o); const b = sin(cy); p.armL[0] = p.armR[0] = -0.55; p.elbowL[0] = p.elbowR[0] = -0.75; p.armL[2] = -0.12; p.armR[2] = 0.12; p.chest[0] = 0.05 + b * 0.012; p.head[1] = b * 0.08; return {}; } },
  lifeEat: { ...free, seconds: 2.6, pose(p, u, cy, ctx, o) { seated(p, ctx, o); const up = Math.max(0, sin(cy)); p.armL[0] = -0.75; p.elbowL[0] = -1; p.armR[0] = -0.75 - up * 0.55; p.elbowR[0] = -1 - up * 1.05; p.chest[0] = 0.12 - up * 0.04; p.head[0] = 0.12 - up * 0.1; return {}; } },
  lifeCook: { ...free, seconds: 2, pose(p, u, cy, ctx, o) { const s = sin(cy); p.armL[0] = -1.05; p.elbowL[0] = -0.5; p.armR[0] = -1.1 + s * 0.14; p.armR[1] = sin(cy + 1.4) * 0.26; p.elbowR[0] = -0.7; p.chest[0] = 0.14; p.head[0] = 0.16; p.hips[1] = s * 0.03; return {}; } },
  lifeWash: { ...free, seconds: 1.8, pose(p, u, cy, ctx, o) { const s = sin(cy * 2); p.armL[0] = -2.55 + s * 0.16; p.armR[0] = -2.55 - s * 0.16; p.elbowL[0] = p.elbowR[0] = -1.55; p.armL[2] = -0.25; p.armR[2] = 0.25; p.head[0] = -0.12; p.chest[1] = s * 0.04; return {}; } },
  lifeToilet: { ...free, seconds: 5, pose(p, u, cy, ctx, o) { seated(p, ctx, o); const t = sin(cy); p.armL[0] = p.armR[0] = -0.95; p.elbowL[0] = p.elbowR[0] = -1.1; p.armL[2] = -0.04; p.armR[2] = 0.04; p.chest[0] = 0.16; p.head[0] = 0.26 + t * 0.03; p.head[1] = t * 0.12; return {}; } },
  lifeBrowse: { ...free, seconds: 4, pose(p, u, cy, ctx, o) { const reach = Math.max(0, sin(cy)), look = sin(cy * 0.5); p.head[1] = look * 0.42; p.head[0] = -0.08; p.chest[1] = look * 0.1; p.armR[0] = -0.15 - reach * 1.5; p.elbowR[0] = -0.3 - reach * 0.4; p.armL[0] = -0.3; p.elbowL[0] = -0.9; return {}; } },
  lifeTill: { ...free, seconds: 2.2, pose(p, u, cy, ctx, o) { const k = Math.max(0, sin(cy * 2)); p.armL[0] = -0.85; p.elbowL[0] = -0.75; p.armR[0] = -0.95 + k * 0.2; p.elbowR[0] = -0.7; p.chest[0] = 0.1; p.head[0] = 0.14; p.chest[1] = sin(cy) * 0.1; return {}; } },
  lifeType: { ...free, seconds: 1.6, pose(p, u, cy, ctx, o) { seated(p, ctx, o); p.armL[0] = -1.1 + sin(cy * 3) * 0.05; p.armR[0] = -1.1 + sin(cy * 3 + 2) * 0.05; p.elbowL[0] = p.elbowR[0] = -0.75; p.chest[0] = 0.1; p.head[0] = 0.05; return {}; } },
  lifeLift: { ...free, seconds: 1.8, pose(p, u, cy, ctx, o) { const k = (sin(cy) + 1) / 2; p.armL[0] = p.armR[0] = -0.6 - k * 2.1; p.elbowL[0] = p.elbowR[0] = -1.5 + k * 1.3; p.armL[2] = -0.32; p.armR[2] = 0.32; o.bob = k * 0.012; return {}; } },
  // M4, the job kit: an axe swung from over the shoulder into the trunk, a load on the right shoulder while walking, both hands on a lever
  lifeChop: { ...free, seconds: 0.9, pose(p, u, cy, ctx, o) { const k = sin(cy), up = Math.max(0, k), down = Math.max(0, -k); p.armR[0] = -2.1 * up + (-0.9 * down) - 0.7; p.armL[0] = -1 * up - 0.7 - 0.5 * down; p.elbowR[0] = -0.7 * up - 0.3; p.elbowL[0] = -0.8; p.chest[0] = 0.32 * down - 0.2 * up; p.chest[1] = 0.35 * up - 0.25 * down; p.hips[1] = 0.1 * up; return {}; } },
  lifeCarry: { ...free, seconds: 0.8, pose(p, u, cy, ctx, o) { const s = sin(cy); p.legL[0] = s * 0.55; p.legR[0] = -s * 0.55; p.kneeL[0] = Math.max(0, -s) * 0.7; p.kneeR[0] = Math.max(0, s) * 0.7; p.armR[0] = -2.6; p.elbowR[0] = -1.7; p.armR[2] = 0.2; p.armL[0] = -s * 0.3; p.chest[2] = -0.1; p.head[2] = 0.08; o.bob = Math.abs(s) * 0.012; return {}; } },
  // M5: both hands on a hose, leaning into it
  lifeHose: { ...free, seconds: 0.5, pose(p, u, cy, ctx, o) { const s = sin(cy); p.armL[0] = -1.35 + s * 0.03; p.armR[0] = -1.1 + s * 0.03; p.elbowL[0] = -0.25; p.elbowR[0] = -0.7; p.armL[2] = -0.12; p.armR[2] = 0.28; p.chest[0] = 0.16; p.chest[1] = 0.22; p.legL[0] = 0.35; p.legR[0] = -0.3; p.head[1] = -0.2; o.bob = s * 0.004; return {}; } },
  lifeLever: { ...free, seconds: 0.8, pose(p, u, cy, ctx, o) { const k = (sin(cy) + 1) / 2; p.armL[0] = p.armR[0] = -1.5 + k * 0.9; p.elbowL[0] = p.elbowR[0] = -0.4; p.armL[2] = -0.14; p.armR[2] = 0.14; p.chest[0] = 0.26 * k; return {}; } },
});

/** What a slot's `use` looks like. Everything not here is the plain standing idle. */
export const USE_CLIP = { sleep: 'lifeSleep', sleepTop: 'lifeSleep', sit: 'lifeSit', eat: 'lifeEat', cook: 'lifeCook', wash: 'lifeWash', toilet: 'lifeToilet', browse: 'lifeBrowse', till: 'lifeTill', stack: 'lifeBrowse', type: 'lifeType', desk: 'lifeType', sitBar: 'lifeEat', exercise: 'lifeLift', snack: 'drink', work: 'lifeCook' };
/** What they do on a standing spot, by what the sim says they are doing. */
export const ACT_CLIP = { chat: 'talk', phone_friend: 'talk', coffee: 'drink', doze: 'lifeSleep', down: 'lifeSleep', clinic_stay: 'lifeSleep' };
export const LIES_DOWN = new Set(['sleep', 'sleepTop']);
