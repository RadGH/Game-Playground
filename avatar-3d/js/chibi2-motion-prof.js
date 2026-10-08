// Chibi 2 — opt-in WORK clips added 2026-10-07 (Thousandvale play-test 8, W9 professions). A NEW FILE ON PURPOSE:
// chibi2-motion.js is read by every game and nothing here changes a clip any of them plays. Importing this module
// registers the clips (chibi2-motion.js `registerClips`); a character only pays for the ones its `anims` list names:
//
//   import { CHIBI2_PROF_ANIMS, PROF_TOOL_MOUNT } from './chibi2-motion-prof.js';
//   createChibi2Character(avatar, { anims: [...CHIBI2_ANIMS, ...CHIBI2_PROF_ANIMS] })
//   body.setAnim('profMine')
//
// Seven loops, all HANDS-FREE (the weapons are put away; the game parents its own tool to the `handR` bone — see
// PROF_TOOL_MOUNT — exactly as angling does with its rod):
//
//   profMine     a pick heaved up over the shoulder with both hands and driven down into a rock in front      (mining)
//   profChop     a hatchet drawn back to the shoulder and swung flat across into a trunk                      (logging)
//   profGather   stoop, pick with the right hand, straighten a little, put it in the crook of the left arm    (foraging)
//   profSkin     down on one knee, the left hand holding, the right drawing a knife toward the body           (skinning)
//   profHammer   the left hand holds the work on the anvil, the right raises a hammer and brings it down      (smithing, tempering)
//   profStitch   work held up at the chest in the left hand, the right pushing a needle through and drawing the thread out (outfitting)
//   profStir     a long spoon going round in a pot at the waist, the left hand resting on the hip             (alchemy, cooking)
//
// `PROF_BEAT[clip]` is the fraction of the loop at which the blow lands (the game times its spark and its sound to it).

import { registerClips, MOTION_KIT } from './chibi2-motion.js';

const { ss, stance, PI } = MOTION_KIT;
const sin = Math.sin, cos = Math.cos, TAU = PI * 2;

export const CHIBI2_PROF_ANIMS = ['profMine', 'profChop', 'profGather', 'profSkin', 'profHammer', 'profStitch', 'profStir'];
export const CHIBI2_PROF_SECONDS = { profMine: 1.25, profChop: 1.1, profGather: 2.2, profSkin: 1.6, profHammer: 0.95, profStitch: 1.5, profStir: 1.7 };
export const PROF_BEAT = { profMine: 0.56, profChop: 0.5, profGather: 0.42, profSkin: 0.55, profHammer: 0.5, profStitch: 0.3, profStir: 0 };
/** Which clip a profession works with (the server's loop names `mine` `chop` `gather` `skin` `craft` map through the profession). */
export const PROF_CLIP = { mining: 'profMine', logging: 'profChop', foraging: 'profGather', skinning: 'profSkin', smithing: 'profHammer', tempering: 'profHammer', outfitting: 'profStitch', alchemy: 'profStir', cooking: 'profStir' };

/**
 * Where a tool sits on the `handR` bone, for a tool modelled along its own +y with the grip at the origin and the
 * head at +y. Hand space: -y runs out past the fingers, +z is the thumb side. A hafted tool is held ACROSS the palm
 * — the haft stands up out of the fist on the thumb side — so its +y is turned onto the hand's +z. A knife and a
 * needle point out past the fingers instead; a spoon hangs down from the fist (out past the little finger).
 */
export const PROF_TOOL_MOUNT = {
  pick:    { bone: 'handR', position: [0, -0.05, 0.02], rotation: [PI / 2, 0, 0] },
  hatchet: { bone: 'handR', position: [0, -0.05, 0.02], rotation: [PI / 2, 0, 0] },
  hammer:  { bone: 'handR', position: [0, -0.05, 0.02], rotation: [PI / 2, 0, 0] },
  sickle:  { bone: 'handR', position: [0, -0.05, 0.02], rotation: [PI / 2, 0, 0] },
  knife:   { bone: 'handR', position: [0, -0.06, 0.02], rotation: [PI, 0, 0] },
  needle:  { bone: 'handR', position: [0, -0.07, 0.03], rotation: [PI, 0, 0] },
  spoon:   { bone: 'handR', position: [0, -0.05, 0.0], rotation: [-PI / 2, 0, 0] },
};
/** The tool a profession holds while it works. */
export const PROF_TOOL = { mining: 'pick', logging: 'hatchet', foraging: 'sickle', skinning: 'knife', smithing: 'hammer', tempering: 'hammer', outfitting: 'needle', alchemy: 'spoon', cooking: 'spoon' };

/** 0..1 through the loop from the cycle angle. */
const U = cy => { const u = cy / TAU; return u - Math.floor(u); };
/** Up then down: 0 at a, 1 at b..c, 0 at d (smooth). */
const hump = (u, a, b, c, d) => ss(u, a, b) * (1 - ss(u, c, d));

const POSES = {
  profMine(p, u0, cy, ctx, o) {
    // both hands on the haft: up and back over the right shoulder (the body straightening, a breath at the top),
    // then the whole trunk folds into the blow and the knees take it; a small rebound off the rock
    const u = U(cy), lift = ss(u, 0, 0.4), down = ss(u, 0.46, 0.56), up = lift * (1 - down), hit = hump(u, 0.46, 0.56, 0.62, 0.86), jar = hump(u, 0.54, 0.58, 0.6, 0.72);
    o.bob = stance(p, 0.9) + 0.02 * up - 0.09 * hit; o.surge = 0.05 * hit;
    p.chest[0] += -0.22 * up + 0.5 * hit; p.chest[1] += 0.3 * up - 0.1 * hit; p.hips[1] += 0.12 * up;
    p.head[0] += -0.1 * up + 0.12 * hit; p.head[1] = -0.12 * up;
    p.kneeL[0] += 0.4 * hit; p.kneeR[0] += 0.3 * hit; p.legL[0] -= 0.22 * hit;
    // right hand high on the haft, left hand below it
    p.armR = [-0.75 - 1.85 * up - 0.25 * hit + 0.1 * jar, -0.35 - 0.15 * up, 0.16 + 0.3 * up];
    p.elbowR[0] = -0.9 - 0.75 * up + 0.55 * hit;
    p.armL = [-0.85 - 1.55 * up - 0.3 * hit + 0.1 * jar, 0.75 + 0.1 * up, -0.1 - 0.1 * up];
    p.elbowL[0] = -1.0 - 0.6 * up + 0.45 * hit;
    p.handR[0] = 0.5 * up - 0.35 * hit;
    return {};
  },
  profChop(p, u0, cy, ctx, o) {
    // drawn back to the right shoulder, hips turned away; then the hips lead and the axe comes round flat, low
    const u = U(cy), back = ss(u, 0, 0.36), swing = ss(u, 0.4, 0.52), wind = back * (1 - swing), hit = hump(u, 0.4, 0.52, 0.6, 0.88);
    o.bob = stance(p, 1.0) - 0.04 * hit; o.sway = 0.02 * wind - 0.03 * hit;
    p.hips[1] += 0.3 * wind - 0.45 * hit; p.chest[1] += 0.7 * wind - 0.75 * hit; p.chest[0] += 0.12 + 0.12 * hit; p.chest[2] = 0.06 * wind - 0.1 * hit;
    p.head[1] = -0.35 * wind + 0.3 * hit; p.head[0] += 0.08;
    p.kneeL[0] += 0.2 + 0.2 * hit; p.kneeR[0] += 0.2;
    p.armR = [-1.0 - 0.5 * wind - 0.15 * hit, 0.55 * wind - 0.85 * hit, 0.25 + 0.55 * wind];
    p.elbowR[0] = -0.5 - 1.15 * wind + 0.25 * hit;
    p.handR[0] = 0.3 * wind - 0.2 * hit;
    p.armL = [-0.9 - 0.3 * wind - 0.2 * hit, 0.8 - 0.35 * wind + 0.1 * hit, -0.12];
    p.elbowL[0] = -1.05 - 0.4 * wind + 0.4 * hit;
    return {};
  },
  profGather(p, u0, cy, ctx, o) {
    // stoop (knees and hips together), the right hand down among the leaves, a small tug, up half way with it
    // into the crook of the left arm, a glance at it — and down again a step to the side
    const u = U(cy), down = hump(u, 0.04, 0.3, 0.52, 0.8), tug = hump(u, 0.34, 0.42, 0.44, 0.52), stow = hump(u, 0.6, 0.78, 0.86, 0.98);
    o.bob = -0.2 * down * (ctx.rig.leg / 0.53) - 0.02 * stow; o.sway = sin(cy) * 0.015;
    p.legL[0] = -0.95 * down; p.kneeL[0] = 1.5 * down; p.footL[0] = -0.4 * down;
    p.legR[0] = -0.6 * down; p.kneeR[0] = 1.3 * down; p.footR[0] = -0.3 * down;
    p.chest[0] += 0.75 * down + 0.1 * stow; p.head[0] += 0.1 * down + 0.3 * stow; p.head[1] = 0.3 * stow; p.chest[1] += -0.15 * down;
    p.armR = [-1.05 * down - 0.5 * stow + 0.12 * tug, -0.25 * down - 0.75 * stow, 0.14]; p.elbowR[0] = -0.3 - 0.25 * down - 1.35 * stow + 0.2 * tug; p.handR[0] = 0.4 * tug;
    p.armL = [-0.5 - 0.1 * down, 0.55, -0.1]; p.elbowL[0] = -1.5;                    // the basket arm stays put
    return {};
  },
  profSkin(p, u0, cy, ctx, o) {
    // on the right knee over the work; the left hand pins it, the right draws the knife back toward the hip in
    // one long stroke and reaches forward again
    const u = U(cy), reach = hump(u, 0, 0.22, 0.3, 0.7), pull = ss(u, 0.3, 0.7) * (1 - ss(u, 0.86, 1));
    p.legL[0] = -1.4; p.kneeL[0] = 1.55; p.footL[0] = -0.15;
    p.legR[0] = 0.3; p.kneeR[0] = 1.75; p.footR[0] = 0.9;
    o.bob = -0.26 * (ctx.rig.leg / 0.53);
    p.chest[0] += 0.5 + 0.12 * reach - 0.08 * pull; p.head[0] += 0.3; p.chest[1] += 0.12 * pull - 0.08 * reach; p.head[1] = -0.1;
    p.armL = [-1.0, 0.45, -0.14]; p.elbowL[0] = -0.45;
    p.armR = [-1.15 * reach - 0.5 + 0.5 * pull, -0.3 + 0.1 * pull, 0.2]; p.elbowR[0] = -0.3 - 1.1 * pull - 0.1 * reach; p.handR[0] = 0.25 * pull;
    return {};
  },
  profHammer(p, u0, cy, ctx, o) {
    // the left hand holds the work out on the anvil and does not move; the hammer goes up to the ear (elbow
    // leading) and comes straight down, the shoulder and a short knee-bend behind it, and bounces
    const u = U(cy), lift = ss(u, 0.08, 0.4), down = ss(u, 0.42, 0.5), up = lift * (1 - down), hit = hump(u, 0.42, 0.5, 0.56, 0.8), bounce = hump(u, 0.52, 0.58, 0.6, 0.7);
    o.bob = stance(p, 0.6) - 0.035 * hit;
    p.chest[0] += 0.14 - 0.1 * up + 0.16 * hit; p.chest[1] += 0.2 * up - 0.12 * hit; p.head[0] += 0.22; p.head[1] = -0.08;
    p.kneeL[0] += 0.14 * hit; p.kneeR[0] += 0.14 * hit;
    p.armR = [-0.75 - 0.75 * up + 0.05 * hit + 0.14 * bounce, -0.2, 0.2 + 0.2 * up]; p.elbowR[0] = -1.0 - 1.1 * up + 0.5 * hit - 0.2 * bounce; p.handR[0] = 0.55 * up - 0.3 * hit;
    p.armL = [-0.85, 0.3, -0.12]; p.elbowL[0] = -0.75 - 0.03 * hit;
    return {};
  },
  profStitch(p, u0, cy, ctx, o) {
    // the work held at the chest in the left hand; the right pushes the needle in (a small forward dab), then
    // draws the thread out and away to arm's length, and comes back
    const u = U(cy), dab = hump(u, 0.12, 0.26, 0.3, 0.38), draw = hump(u, 0.34, 0.62, 0.7, 0.96), breath = sin(cy);
    o.bob = breath * 0.004;
    p.chest[0] += 0.1; p.head[0] += 0.38 - 0.1 * draw; p.head[1] = 0.12 - 0.3 * draw;
    p.armL = [-0.7, 0.6, -0.1]; p.elbowL[0] = -1.75; p.handL[0] = 0.15;
    p.armR = [-0.7 - 0.12 * dab - 0.25 * draw, -0.55 + 0.75 * draw, 0.12 + 0.75 * draw]; p.elbowR[0] = -1.75 + 0.15 * dab + 1.05 * draw; p.handR[0] = -0.25 * dab + 0.35 * draw;
    p.hips[2] = 0.03; p.legL[2] = -0.03;
    return {};
  },
  profStir(p, u0, cy, ctx, o) {
    // the spoon goes round — the hand draws a level circle in front of the belt — and the body leans over the
    // pot and sways after it; now and then a look into the pot
    const c = cos(cy), s = sin(cy), peer = Math.max(0, sin(cy / 2)) ** 3;
    o.bob = stance(p, 0.3) - 0.01 * peer; o.sway = c * 0.012;
    p.chest[0] += 0.18 + 0.1 * peer; p.chest[1] += s * 0.1; p.head[0] += 0.25 + 0.12 * peer; p.hips[2] = c * 0.03;
    p.armR = [-0.78 + 0.16 * s, -0.25 + 0.22 * c, 0.16]; p.elbowR[0] = -1.05 + 0.22 * s; p.handR[0] = 0.12 * c;
    p.armL = [0.25, 0.1, -0.5]; p.elbowL[0] = -1.7;
    return {};
  },
};

registerClips(Object.fromEntries(Object.entries(POSES).map(([name, pose]) => [name, { pose, seconds: CHIBI2_PROF_SECONDS[name], oneShot: false, handsFree: true }])));
