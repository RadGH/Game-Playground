import * as THREE from 'three';

export const CHIBI2_ANIMS = ['idle', 'ready', 'walk', 'run', 'attack', 'cast', 'hit', 'guard', 'wave', 'talk', 'jump', 'dead'];

/**
 * Swimming, built only when a game asks for it: `createChibi2Character(avatar, { swim: true })`.
 * Clips are generated per body template, so three more of them is work every character pays for.
 * A game with no water should not pay it — and when they were on by default, the extra build time
 * was enough to trip a timing race in Emberveil's rest scene.
 */
export const CHIBI2_SWIM_ANIMS = ['swim', 'swimBack', 'swimSide'];
export const CHIBI2_ALL_ANIMS = [...CHIBI2_ANIMS, ...CHIBI2_SWIM_ANIMS];

/**
 * THE COMBAT CLIPS, opt-in — added 2026-09-20 for Farhold's weapon revamp.
 *
 * Every attack in both prototypes played ONE clip: the overhead chop in `attack`. Stabbing with a
 * rapier, cleaving with an axe, loosing an arrow and casting from a staff were the same animation.
 * These say what each strike shape actually looks like, and they are a SEPARATE list so that
 * `CHIBI2_ANIMS` and `CHIBI2_ALL_ANIMS` are byte-for-byte what they were.
 *
 *   createChibi2Character(avatar, { anims: CHIBI2_COMBAT_ALL })
 *
 * Note `overhead` is today's `attack`, under its own name, so a pattern can name it explicitly.
 */
export const CHIBI2_COMBAT_ANIMS = [
  'slash', 'slashBack', 'thrust', 'overhead', 'sweep', 'jab', 'arcCut', 'slam', 'lunge',
  'shoot', 'reload', 'castPoint', 'castStaff', 'channel',
];
export const CHIBI2_COMBAT_ALL = [...CHIBI2_ALL_ANIMS, ...CHIBI2_COMBAT_ANIMS];

/**
 * BEING CARRIED BY SOMETHING, opt-in — added 2026-09-21. `boat` (braced on a deck, working a pole)
 * and `sit` (astride something). Their own list, so a game with no boats builds what it built.
 */
export const CHIBI2_RIDE_ANIMS = ['boat', 'sit'];

/**
 * WORKING AT SOMETHING, opt-in — added 2026-09-21. All three loop (the gather bar decides how long
 * the job takes), so none is in `ONE_SHOTS`, and each returns to its first pose at the loop point.
 */
export const CHIBI2_WORK_ANIMS = ['pickSwing', 'chopSwing', 'forage'];

/**
 * THE WEAPON FAMILIES, opt-in — added 2026-09-24.
 *
 * The round-14 list said what a strike's SHAPE is (a slash, a thrust, a slam). These say what the
 * WEAPON is: an axe chops diagonally with its weight going into the follow-through, a mace smashes
 * with the body dropping under it, a dagger stabs in a reverse grip, a shield bashes, and a second
 * weapon in the off hand swings as the off hand. `twinCleave` / `twinSlam` are two two-handers at
 * once (Farhold's "Doubled Grasp" keystone), `block` holds a shield up, `offSlash` / `offThrust`
 * are the off hand's own strikes and `crossSlash` is both blades together.
 */
export const CHIBI2_MELEE_ANIMS = [
  'chop', 'hack', 'smash', 'uppercut', 'stab', 'flurry', 'bash', 'block', 'parry',
  'offSlash', 'offThrust', 'crossSlash', 'twinCleave', 'twinSlam', 'spinSweep', 'thrust2h',
  'punch', 'kick', 'throw', 'castBook', 'whirl',
];

/**
 * EMOTES, opt-in — added 2026-09-24. Everything a character does that is not fighting or
 * walking. Every one of them is HANDS-FREE: the weapons and the off-hand item are put away for the
 * length of the clip (see `HANDS_FREE`) — a wave with a greatsword in the waving hand is the case
 * that asked for this.
 */
export const CHIBI2_EMOTE_ANIMS = [
  'cheer', 'bowGreet', 'point', 'shrug', 'nod', 'headShake', 'laugh', 'clap', 'salute',
  'kneel', 'sitGround', 'pray', 'dance', 'lookAround', 'crossArms', 'stretch', 'drink', 'sleep',
];

/**
 * THE SET FARHOLD ASKS FOR. `prototypes/farhold/js/actors.js` is the only importer this constant has
 * ever had, and Emberveil asks for none of the opt-in lists. The 2026-09-24 families and emotes are
 * folded in here, so Farhold gets them and nothing else does.
 */
export const CHIBI2_COMBAT_RIDE = [...CHIBI2_COMBAT_ALL, ...CHIBI2_RIDE_ANIMS, ...CHIBI2_WORK_ANIMS, ...CHIBI2_MELEE_ANIMS, ...CHIBI2_EMOTE_ANIMS];
export const CHIBI2_COMBAT_RIDE_WORK = CHIBI2_COMBAT_RIDE;
/** Every clip there is — the avatar page and tests ask for this. */
export const CHIBI2_EVERY_ANIMS = CHIBI2_COMBAT_RIDE;

/** Groups for a menu. */
export const CHIBI2_ANIM_GROUPS = {
  Move: ['idle', 'ready', 'walk', 'run', 'jump', 'guard', 'hit', 'dead'],
  Talk: ['talk', 'wave', 'cast'],
  Strikes: ['attack', ...CHIBI2_COMBAT_ANIMS],
  Weapons: CHIBI2_MELEE_ANIMS,
  Emotes: CHIBI2_EMOTE_ANIMS,
  Work: CHIBI2_WORK_ANIMS,
  Ride: CHIBI2_RIDE_ANIMS,
  Swim: CHIBI2_SWIM_ANIMS,
};

export const ONE_SHOTS = new Set([
  'attack', 'cast', 'hit', 'jump', 'dead',
  'slash', 'slashBack', 'thrust', 'overhead', 'sweep', 'jab', 'arcCut', 'slam', 'lunge',
  'shoot', 'reload', 'castPoint', 'castStaff',
  'chop', 'hack', 'smash', 'uppercut', 'stab', 'flurry', 'bash', 'parry', 'offSlash', 'offThrust',
  'crossSlash', 'twinCleave', 'twinSlam', 'spinSweep', 'thrust2h', 'punch', 'kick', 'throw', 'castBook',
  'cheer', 'bowGreet', 'point', 'shrug', 'nod', 'headShake', 'laugh', 'clap', 'salute', 'drink', 'stretch',
]);

/**
 * Clips that want EMPTY HANDS. For their length the grip bones shrink to nothing, which puts the
 * weapon and the off-hand item away and brings them back as the clip fades out. This is done in the
 * model on purpose: every game gets it for free, and `actor.setHandsFree(true)` is there for a game
 * that wants the hands empty for some other reason (a cutscene, carrying something).
 */
export const HANDS_FREE = new Set(['wave', 'talk', ...CHIBI2_EMOTE_ANIMS, 'forage', 'swim', 'swimBack', 'swimSide', 'punch', 'kick']);

const LENGTHS = {
  idle: 3.2, ready: 1.6, walk: 1.05, run: 0.65, attack: 0.85, cast: 1.25, hit: 0.5, guard: 2,
  wave: 2, talk: 2.5, jump: 1, dead: 1.2, swim: 1.1, swimBack: 1.35, swimSide: 1.2,
  slash: 0.5, slashBack: 0.5, thrust: 0.42, overhead: 0.85, sweep: 0.92, jab: 0.26,
  arcCut: 0.62, slam: 1.05, lunge: 0.55, shoot: 0.6, reload: 1, castPoint: 0.35,
  castStaff: 0.7, channel: 1.6,
  boat: 2.4, sit: 3,
  pickSwing: 1, chopSwing: 0.85, forage: 1.4,
  chop: 0.72, hack: 0.6, smash: 0.9, uppercut: 0.6, stab: 0.42, flurry: 0.6, bash: 0.55, block: 1.6,
  parry: 0.45, offSlash: 0.5, offThrust: 0.42, crossSlash: 0.7, twinCleave: 0.95, twinSlam: 1.1,
  spinSweep: 1.0, whirl: 0.34, thrust2h: 0.55, punch: 0.4, kick: 0.6, throw: 0.7, castBook: 1.1,
  cheer: 1.6, bowGreet: 1.8, point: 1.4, shrug: 1.2, nod: 1.0, headShake: 1.2, laugh: 1.6, clap: 1.4,
  salute: 1.6, kneel: 3, sitGround: 3.4, pray: 3, dance: 1.6, lookAround: 3.2, crossArms: 3,
  stretch: 2.2, drink: 2.2, sleep: 3.6,
};
export const CHIBI2_CLIP_SECONDS = LENGTHS;

// ---------------------------------------------------------------------------- holds

/**
 * WHAT IS IN EACH HAND, which decides how every clip carries it. chibi2.js works this out from the
 * avatar's `held` / `offhand` ids with `holdFor()` and hands it to `createClips` on the rig.
 *
 *   right   none | blade | dagger | haft | heavy | polearm | staff | wand | caster | crossbow
 *   left    none | shield | blade | dagger | haft | heavy | book | orb | torch | bow | caster
 *   twoHand the right-hand weapon takes both hands (the left hand rides its haft)
 *   dualTwo a two-hander in EACH hand
 */
export const HOLD_NONE = { right: 'none', left: 'none', twoHand: false, dualTwo: false, dual: false };

// ---------------------------------------------------------------------------- helpers
const ss = (u, a, b) => THREE.MathUtils.smoothstep(u, a, b);
/** Rise from a to b, hold, fall from c to d. */
const env = (u, a, b, c, d) => ss(u, a, b) * (1 - ss(u, c, d));
const sin = Math.sin, cos = Math.cos, PI = Math.PI;

/** A blank pose for every animated bone. */
function blank(names) { const p = {}; for (const n of names) p[n] = [0, 0, 0]; return p; }

/**
 * Point a weapon. `pitch` is where its business end should face, in the CHEST's frame, measured like
 * a shoulder swing: 0 straight down, -PI/2 straight forward, -PI straight up. `yaw` leans it to one
 * side; `roll` turns it about its own length (the twist of the wrist through a cut).
 *
 * The wrist makes up whatever the shoulder, elbow and hand have not: the grip's rotation is SOLVED
 * so the blade ends up exactly where the clip asked, however the arm above it is rolled or twisted.
 * (A first version added up the three joints' x angles and subtracted, which is right only while
 * the arm swings in one plane; the moment a clip rolled the shoulder, a sword meant to point forward
 * pointed across the body.)
 *
 * The EDGE leads a downward cut by default — overhead the edge faces forward, level it faces down —
 * and `hold.edge*` says which of the item's own axes is its edge (a sword's edges are along x, an
 * axe head faces -z, a hammer's face -x, a crossbow's muzzle +z; see holdFor in chibi2-weapon-ids.js).
 */
const _qa = new THREE.Quaternion(), _qe = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _q = new THREE.Quaternion();
const _e = new THREE.Euler(), _m = new THREE.Matrix4(), _d = new THREE.Vector3(), _edge = new THREE.Vector3();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _M = new THREE.Matrix4();
function aim(p, side, pitch, roll = 0, yaw = 0, edgeAxis = '+x') {
  const s = side === 'R' ? 'R' : 'L';
  _qa.setFromEuler(_e.set(...p['arm' + s])); _qe.setFromEuler(_e.set(...p['elbow' + s])); _qh.setFromEuler(_e.set(...p['hand' + s]));
  const chain = _qa.multiply(_qe).multiply(_qh);                       // hand frame, in chest space
  _M.makeRotationX(pitch).multiply(_m.makeRotationZ(yaw));
  _d.set(0, -1, 0).applyMatrix4(_M); _edge.set(0, 0, -1).applyMatrix4(_M);
  if (roll) _edge.applyAxisAngle(_d, roll);
  const inv = _q.copy(chain).invert();
  _d.applyQuaternion(inv); _edge.applyQuaternion(inv);
  _edge.addScaledVector(_d, -_edge.dot(_d)).normalize();
  _Y.copy(_d).negate();                                                // the item's +y runs back up the grip
  if (edgeAxis === '-z') { _Z.copy(_edge).negate(); _X.crossVectors(_Y, _Z); }
  else if (edgeAxis === '-x') { _X.copy(_edge).negate(); _Z.crossVectors(_X, _Y); }
  else { _X.copy(_edge); _Z.crossVectors(_X, _Y); }
  _m.makeBasis(_X, _Y, _Z);
  _e.setFromRotationMatrix(_m, 'XYZ');
  p['grip' + s] = [_e.x, _e.y, _e.z];
}

/** Where each kind of weapon points at rest, while walking, and at the ready. */
const REST_PITCH = {
  blade: { idle: -0.95, walk: -0.95, ready: -1.85 },
  dagger: { idle: -0.8, walk: -0.8, ready: -1.6 },
  // 2026-09-25: a one-handed hammer, mace or axe hung head-down by the boot at -0.55; carried with
  // the head up and forward it reads as held rather than dragged ("back 45-90 degrees in his hand")
  haft: { idle: -2.0, walk: -2.0, ready: -1.95 },
  heavy: { idle: 2.5, walk: 2.5, ready: -2.1 },          // idle/walk: over the shoulder
  polearm: { idle: -PI + 0.12, walk: -PI + 0.2, ready: -1.45 },
  staff: { idle: 0.05, walk: 0.1, ready: 0.15 },        // staffs carry the topper at +y: pitch is the butt
  wand: { idle: -0.9, walk: -0.9, ready: -1.5 },
  crossbow: { idle: 0, walk: 0, ready: 0 },              // the stock lies along +z, so pitch 0 holds it level
  // a bow is built for the SHOT (limbs up the hand's +z with the arm held out, belly toward -y), so
  // the same pitch that holds it level in the shot stands it upright in a hanging hand
  // …tipped forward at rest so the upper limb clears the forearm instead of running through it
  bow: { idle: -1.25, walk: -1.25, ready: -1.72 },
  // the torch runs down -y from the fist like a blade; this stands it forward and up
  torch: { idle: -2.45, walk: -2.45, ready: -2.2 },
  caster: null, none: null, shield: null, book: null, orb: null,
};

// ---------------------------------------------------------------------------- the clips

/**
 * Keyframes are generated once per body template and handed to the standard Three.js mixer.
 * `rig.hold` (from chibi2.js) says what is in the hands; `rig.posture` is the race's lean.
 */
export function createClips(rig, anims = CHIBI2_ANIMS) {
  const names = rig.bones.map(b => b.name).filter(n => !n.startsWith('eye') && !n.startsWith('pupil'));
  const hold = rig.hold || HOLD_NONE, posture = rig.posture || { chest: 0, head: 0, knees: 0 }, R = rig.round || 0;
  const euler = new THREE.Euler(), quat = new THREE.Quaternion();
  const restY = rig.byName.hips.position.y;
  return anims.map(name => {
    const duration = LENGTHS[name] || 1, steps = Math.max(8, Math.ceil(duration * 30)), loop = !ONE_SHOTS.has(name);
    const frames = [];
    for (let frame = 0; frame <= steps; frame++) {
      const u = frame / steps;
      frames.push(poseAt(name, u, { names, hold, posture, R, rig }));
    }
    followThrough(frames, names, loop, duration / steps);
    const times = frames.map((_, i) => i / steps * duration);
    const tracks = [];
    for (const n of names) {
      const values = [];
      for (const f of frames) { quat.setFromEuler(euler.set(...f.pose[n])); values.push(quat.x, quat.y, quat.z, quat.w); }
      tracks.push(new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, values));
    }
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, frames.flatMap(f => [f.sway || 0, restY + f.bob, f.surge || 0])));
    tracks.push(new THREE.VectorKeyframeTrack('root.position', times, frames.flatMap(f => [0, f.rootY, f.rootZ || 0])));
    // hands free: the grips shrink to nothing for the body of the clip
    const free = HANDS_FREE.has(name);
    for (const s of ['L', 'R']) {
      tracks.push(new THREE.VectorKeyframeTrack('grip' + s + '.scale', times, frames.flatMap(f => {
        const k = free ? 0.001 : (f.handsFree ? 1 - f.handsFree * 0.999 : 1);
        return [k, k, k];
      })));
    }
    return new THREE.AnimationClip(name, duration, tracks);
  });
}

/**
 * OVERLAPPING ACTION — the fix for "stiff".
 *
 * Every clip is authored as whole-body poses, and a pose moved all at once is what reads as a
 * puppet: the shoulder, the elbow and the wrist arrive together. Real limbs are a chain, and each
 * link trails the one above it. So after the poses are sampled, each child is pushed a little way
 * back toward where its parent WAS a moment ago: the head trails the chest, the chest trails the
 * hips, the forearm trails the upper arm and the hand trails the forearm. It is one pass over the
 * finished keyframes and it applies to every clip, including ones written later.
 */
const CHAINS = [
  ['hips', 'chest', 1, 0.28, 0.05], ['chest', 'head', 0, 0.4, 0.07], ['chest', 'head', 1, 0.45, 0.07],
  ['armR', 'elbowR', 0, 0.35, 0.06], ['elbowR', 'handR', 0, 0.45, 0.05], ['armL', 'elbowL', 0, 0.35, 0.06], ['elbowL', 'handL', 0, 0.45, 0.05],
  ['armR', 'elbowR', 2, 0.25, 0.06], ['armL', 'elbowL', 2, 0.25, 0.06],
];
function followThrough(frames, names, loop, dt) {
  const n = frames.length;
  const base = frames.map(f => Object.fromEntries(names.map(k => [k, [...f.pose[k]]])));
  for (const [parent, child, axis, k, lag] of CHAINS) {
    const shift = Math.max(1, Math.round(lag / dt));
    for (let i = 0; i < n; i++) {
      let j = i - shift;
      if (j < 0) j = loop ? ((j % (n - 1)) + (n - 1)) % (n - 1) : 0;
      const delta = base[j][parent][axis] - base[i][parent][axis];
      // an elbow cannot bend backwards: forearm drag on the hinge only ever adds flexion
      let add = delta * k;
      if (axis === 0 && child.startsWith('elbow')) add = Math.min(add, 0.4) ;
      frames[i].pose[child][axis] += add;
      if (axis === 0 && child.startsWith('elbow')) frames[i].pose[child][0] = Math.min(frames[i].pose[child][0], 0.02);
    }
  }
  // the wrist keeps the blade where the clip aimed it, so re-aim after the drag moved the arm
  for (const f of frames) for (const s of ['R', 'L']) if (f.aim?.[s]) aim(f.pose, s, ...withEdge(f.aim[s], f.hold, s));
}

/** The body's rest: arms clear of a round belly, the race's lean, soft knees. */
function base(ctx) {
  const p = blank(ctx.names), { posture, R } = ctx;
  const spread = 0.11 + R * 0.2 + (ctx.hold.left === 'shield' ? 0.04 : 0);
  p.armL[2] = -spread; p.armR[2] = spread;
  p.elbowL[0] = p.elbowR[0] = -0.16;
  p.chest[0] = posture.chest; p.head[0] = posture.head - posture.chest * 0.6;
  const k = posture.knees || 0;
  p.kneeL[0] = p.kneeR[0] = k; p.legL[0] = p.legR[0] = -k * 0.5; p.footL[0] = p.footR[0] = -k * 0.5;
  return p;
}

/** How the hands carry what is in them: `mode` idle | walk | ready. Returns the aims. */
function carry(p, ctx, mode, swing = 0) {
  const h = ctx.hold, aims = {};
  const rp = REST_PITCH[h.right];
  if (h.right === 'heavy' && !h.dualTwo && mode !== 'ready') {
    // a two-hander over the right shoulder: hand at the chest, forearm up, the blade back past the head
    p.armR = [-0.55 + swing * 0.1, 0.1, 0.38]; p.elbowR = [-2.05, 0, 0];
    aims.R = [rp[mode] ?? rp.idle, 0.2, 0.15];
  } else if ((h.twoHand || h.right === 'polearm') && mode === 'ready') {
    // both hands on the haft, weapon up and forward across the body
    p.armR = [-0.62, 0, -0.32]; p.elbowR[0] = -0.95;
    p.armL = [-0.85, 0, 0.42]; p.elbowL[0] = -0.8;
    aims.R = [rp.ready, 0.1, h.right === 'polearm' ? -0.35 : -0.15];
  } else if (rp) aims.R = [rp[mode] ?? rp.idle, 0, 0];
  if (h.right === 'polearm' && mode !== 'ready') { p.armR[2] += 0.08; p.elbowR[0] = -0.55; aims.R = [rp[mode], 0, 0]; }
  if (h.right === 'staff') { p.elbowR[0] = mode === 'ready' ? -0.9 : -0.45; p.armR[0] += mode === 'ready' ? -0.3 : 0; aims.R = [rp[mode] ?? 0, 0, 0]; }
  if (h.right === 'wand' || h.right === 'caster') p.elbowR[0] = mode === 'ready' ? -1.1 : -0.35;
  // the left hand
  const lp = REST_PITCH[h.left];
  if (h.left === 'shield') {
    // a strapped shield rides the forearm; at the ready it comes up in front, face out
    if (mode === 'ready') { p.armL = [-0.45, 0.9, 0.05]; p.elbowL = [-1.35, -0.4, 0]; }
    else { p.armL[2] -= 0.08; p.elbowL[0] = -0.3; }
  } else if (h.left === 'book') { p.armL[0] = -0.35; p.elbowL = [-1.25, 0.2, 0]; p.handL = [0, 0, 0.2]; }
  else if (h.left === 'torch' || h.left === 'orb' || h.left === 'caster') { p.elbowL[0] = mode === 'ready' ? -1.2 : -0.7; if (lp) aims.L = [lp[mode] ?? lp.idle, 0, 0]; }
  else if (h.dualTwo && h.left === 'heavy') {
    if (mode === 'ready') { p.armL = [-0.6, 0, 0.1]; p.elbowL[0] = -0.9; p.armR = [-0.6, 0, -0.1]; p.elbowR[0] = -0.9; aims.L = [-2.0, 0, -0.3]; aims.R = [-2.0, 0, 0.3]; }
    else { p.armL = [-0.55 + swing * 0.1, -0.1, -0.38]; p.elbowL = [-2.05, 0, 0]; aims.L = [2.5, -0.2, -0.15]; }
  } else if (lp) aims.L = [lp[mode] ?? lp.idle, 0, 0];
  return aims;
}

/** [pitch, roll, yaw] plus the hand's edge axis. */
const withEdge = (a, h, s) => [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, (s === 'R' ? h.edgeR : h.edgeL) || '+x'];

/** Where the blades point when a clip leaves the arms at their plain rest (no shoulder carry). */
function restAims(ctx) {
  const aims = {}, h = ctx.hold;
  if (REST_PITCH[h.right]) aims.R = [h.right === 'heavy' ? -0.95 : REST_PITCH[h.right].idle, 0, 0];
  if (REST_PITCH[h.left]) aims.L = [h.left === 'heavy' ? -0.95 : REST_PITCH[h.left].idle, 0, 0];
  return aims;
}
/** The blade pitch a strike ends on: the plain rest, forward and down (a staff: upright). */
const END = ctx => ctx.hold.right === 'staff' ? 0.05 : ctx.hold.right === 'polearm' ? -PI + 0.12 : -0.95;

/** Everything a clip frame says: the pose, where the blades aim, and the body's height/offsets. */
function poseAt(name, u, ctx) {
  const p = base(ctx), h = ctx.hold, cycle = u * PI * 2;
  const out = { pose: p, bob: 0, rootY: 0, sway: 0, surge: 0, rootZ: 0, aim: null, handsFree: 0, hold: h };
  let aims = null;
  const clip = CLIPS[name] || CLIPS[name === 'attack' ? attackFor(h) : 'idle'] || CLIPS.idle;
  aims = clip(p, u, cycle, ctx, out);
  if (aims === undefined) aims = carry(p, ctx, 'idle');
  out.aim = aims || {};
  for (const s of ['R', 'L']) if (out.aim[s]) aim(p, s, ...withEdge(out.aim[s], h, s));
  return out;
}

/** `attack` plays the strike the hands suggest, so a game that only ever asks for `attack` still gets the right one. */
function attackFor(h) {
  if (h.dualTwo) return 'twinCleave';
  if (h.left === 'bow') return 'shoot';
  if (h.right === 'crossbow') return 'shoot';
  if (h.right === 'staff') return 'castStaff';
  if (h.right === 'wand' || h.right === 'caster') return 'castPoint';
  if (h.right === 'dagger') return 'stab';
  if (h.right === 'heavy') return h.twoHand ? 'twinSlam' : 'slam';
  if (h.right === 'polearm') return 'thrust2h';
  if (h.right === 'haft') return 'chop';
  if (h.right === 'none') return h.left === 'book' ? 'castBook' : 'punch';
  return 'overhead';
}

/** Legs in a fighting stance: feet apart, right foot back, knees soft. */
function stance(p, depth = 1) {
  p.legL[0] += -0.12 * depth; p.legR[0] += 0.22 * depth;
  p.legL[2] = -0.09 * depth; p.legR[2] = 0.09 * depth;
  p.kneeL[0] += 0.3 * depth; p.kneeR[0] += 0.34 * depth;
  p.footL[0] += -0.12 * depth; p.footR[0] += -0.36 * depth;
  p.hips[1] += -0.18 * depth; p.chest[1] += 0.16 * depth; p.head[1] += 0.04 * depth;
  return -0.035 * depth;       // how far the hips drop
}

/**
 * A single strike, as a function of three phases: WIND (the anticipation, back and up), STRIKE (fast)
 * and RECOVER. Each clip passes the shape of those three for the arm, the chest and the blade.
 */
function phases(u, w0, w1, s0, s1, r0) {
  const wind = ss(u, w0, w1), strike = ss(u, s0, s1), rec = 1 - ss(u, r0, 1);
  return { wind, strike, rec, up: wind * (1 - strike) };
}

const CLIPS = {
  // ---------------------------------------------------------------- standing, walking, running
  idle(p, u, cy, ctx, o) {
    // breathing (the chest lifts and the shoulders ride up with it), a slow weight shift from foot
    // to foot, and a look about — three rhythms that do not repeat together, so the idle never
    // looks like a loop
    const breath = sin(cy * 2), shift = sin(cy), look = sin(cy + 0.9);
    p.chest[0] += breath * 0.018; p.armL[2] -= breath * 0.012; p.armR[2] += breath * 0.012;
    p.hips[2] = shift * 0.035; p.chest[2] = -shift * 0.025; p.head[2] = shift * 0.02;
    p.legL[2] = -shift * 0.035; p.legR[2] = -shift * 0.035;
    p.kneeL[0] += Math.max(0, shift) * 0.1; p.kneeR[0] += Math.max(0, -shift) * 0.1;
    p.head[1] = look * 0.14; p.head[0] += sin(cy * 3) * 0.02;
    p.armL[0] += sin(cy + 1.3) * 0.03; p.armR[0] += sin(cy + 2.1) * 0.03;
    o.sway = shift * 0.012; o.bob = breath * 0.004 - Math.abs(shift) * 0.006;
    return carry(p, ctx, 'idle', breath);
  },
  ready(p, u, cy, ctx, o) {
    o.bob = stance(p) + sin(cy * 2) * 0.008;
    p.chest[0] += 0.08 + sin(cy * 2) * 0.015; p.head[0] -= 0.06;
    p.armL[0] = -0.4; p.armR[0] = -0.4; p.elbowL[0] = -0.9; p.elbowR[0] = -0.9;
    p.armR[2] = 0.28; p.armL[2] = -0.28;
    o.sway = sin(cy) * 0.006;
    return carry(p, ctx, 'ready');
  },
  walk(p, u, cy, ctx, o) {
    const s = sin(cy), c = cos(cy), amp = 0.42;
    p.legL[0] += s * amp; p.legR[0] += -s * amp;
    // the knee bends on the swing (after toe-off) and straightens for the heel strike
    p.kneeL[0] += Math.max(0, sin(cy - 0.9)) * 0.75 + 0.05; p.kneeR[0] += Math.max(0, -sin(cy - 0.9)) * 0.75 + 0.05;
    // heel strike then roll onto the toe
    p.footL[0] += -0.25 * Math.max(0, s) + 0.3 * Math.max(0, -sin(cy + 0.6)) - p.kneeL[0] * 0.25;
    p.footR[0] += -0.25 * Math.max(0, -s) + 0.3 * Math.max(0, sin(cy + 0.6)) - p.kneeR[0] * 0.25;
    // pelvis turns with the legs and drops on the swing side; the chest counter-turns; the head stays level
    p.hips[1] = s * 0.1; p.hips[2] = c * 0.04; p.chest[1] = -s * 0.14; p.chest[2] = -c * 0.03; p.head[1] = s * 0.05;
    p.chest[0] += 0.04;
    p.armL[0] += -s * 0.36; p.armR[0] += s * 0.36; p.elbowL[0] += -0.18 - Math.max(0, -s) * 0.2; p.elbowR[0] += -0.18 - Math.max(0, s) * 0.2;
    o.bob = -Math.abs(c) * 0.018 + 0.006; o.sway = c * 0.014;
    const aims = carry(p, ctx, 'walk', s);
    if (ctx.hold.left === 'shield') p.armL[0] *= 0.4;
    return aims;
  },
  run(p, u, cy, ctx, o) {
    const s = sin(cy), c = cos(cy), amp = 0.78;
    p.legL[0] += s * amp - 0.1; p.legR[0] += -s * amp - 0.1;
    p.kneeL[0] += 0.25 + Math.max(0, sin(cy - 0.7)) * 1.35; p.kneeR[0] += 0.25 + Math.max(0, -sin(cy - 0.7)) * 1.35;
    p.footL[0] += -0.3 * Math.max(0, s) + 0.45 * Math.max(0, -sin(cy + 0.5)) - p.kneeL[0] * 0.2;
    p.footR[0] += -0.3 * Math.max(0, -s) + 0.45 * Math.max(0, sin(cy + 0.5)) - p.kneeR[0] * 0.2;
    p.chest[0] += 0.2; p.hips[0] = 0.1; p.head[0] -= 0.14;
    p.hips[1] = s * 0.16; p.chest[1] = -s * 0.24; p.head[1] = s * 0.1;
    p.armL[0] += -s * 0.8 - 0.1; p.armR[0] += s * 0.8 - 0.1; p.elbowL[0] = -1.25 - Math.max(0, s) * 0.3; p.elbowR[0] = -1.25 - Math.max(0, -s) * 0.3;
    p.armL[2] -= 0.08; p.armR[2] += 0.08;
    o.bob = -Math.abs(c) * 0.04 + 0.02; o.sway = c * 0.01;
    const aims = carry(p, ctx, 'walk', s);
    if (ctx.hold.left === 'shield') { p.armL[0] = -0.3; p.elbowL[0] = -1.0; }
    return aims;
  },
  jump(p, u, cy, ctx, o) {
    // crouch (anticipation) → launch → tuck in the air → land and absorb → settle
    const crouch = env(u, 0, 0.18, 0.22, 0.32), air = env(u, 0.26, 0.4, 0.62, 0.78), land = env(u, 0.74, 0.82, 0.86, 1);
    const flight = sin(ss(u, 0.24, 0.8) * PI);
    o.rootY = flight * 0.34;
    const bend = crouch * 0.9 + land * 0.8 + air * 0.5;
    p.kneeL[0] += bend; p.kneeR[0] += bend; p.legL[0] -= bend * 0.55; p.legR[0] -= bend * 0.45; p.footL[0] -= bend * 0.4; p.footR[0] -= bend * 0.4;
    p.chest[0] += crouch * 0.3 + land * 0.25 - air * 0.12;
    p.armL[0] += crouch * 0.5 - air * 1.3; p.armR[0] += crouch * 0.5 - air * 1.3;
    p.armL[2] -= air * 0.4; p.armR[2] += air * 0.4;
    o.bob = -(crouch + land) * 0.09;
    return restAims(ctx);
  },
  guard(p, u, cy, ctx, o) {
    o.bob = stance(p, 1.1) + sin(cy * 2) * 0.006;
    p.chest[0] += 0.12; p.head[0] -= 0.1;
    const h = ctx.hold, aims = {};
    if (h.left === 'shield') {
      // THE SHIELD BLOCKS: the left forearm comes across the chest with the shield's face square to
      // the front (the forearm rolls to put the face forward), and the weapon waits cocked behind it
      p.armL = [-0.7, 1.4, 0]; p.elbowL = [-1.7, -0.6, 0];
      p.armR = [-0.35, -0.2, 0.35]; p.elbowR[0] = -1.35;
      if (REST_PITCH[h.right]) aims.R = [-2.3, 0.3, 0.2];
      p.head[0] -= 0.08; p.chest[1] += 0.1;
    } else if (h.twoHand || h.right === 'heavy' || h.right === 'polearm') {
      // a two-hander held across the body, haft up, to take a blow on the haft
      p.armR = [-0.95, 0, -0.25]; p.elbowR[0] = -0.9; p.armL = [-0.75, 0, 0.35]; p.elbowL[0] = -1.1;
      aims.R = [-2.6, 0, -0.9];
    } else if (REST_PITCH[h.right] && h.right !== 'staff') {
      // a single blade raised to parry, point up and angled across
      p.armR = [-0.95, 0, -0.1]; p.elbowR[0] = -1.1;
      aims.R = [-2.7, 0.2, -0.7];
      p.armL = [-0.6, 0, -0.35]; p.elbowL[0] = -1.4;
      if (REST_PITCH[h.left]) aims.L = [-2.4, -0.2, 0.6];
    } else {
      // fists up
      p.armL = [-0.75, 0.3, -0.2]; p.elbowL[0] = -2.0; p.armR = [-0.7, -0.3, 0.2]; p.elbowR[0] = -2.1;
      if (h.right === 'staff') aims.R = [0.2, 0, 0];
    }
    return aims;
  },
  block(p, u, cy, ctx, o) { return CLIPS.guard(p, u, cy, ctx, o); },
  hit(p, u, cy, ctx, o) {
    // snapped back at the chest, the head whips after it, a stagger step back, and recovery
    const k = sin(PI * ss(u, 0, 0.25)) * (1 - ss(u, 0.3, 1)) + ss(u, 0, 0.12) * (1 - ss(u, 0.12, 0.7)) * 0.6;
    p.chest[0] -= 0.4 * k; p.head[0] -= 0.35 * k; p.chest[1] += 0.15 * k; p.hips[0] -= 0.1 * k;
    p.legR[0] += 0.3 * k; p.kneeR[0] += 0.25 * k; p.kneeL[0] += 0.2 * k;
    p.armL[2] -= 0.35 * k; p.armR[2] += 0.35 * k; p.armL[0] += 0.2 * k; p.armR[0] += 0.2 * k;
    p.elbowL[0] -= 0.3 * k; p.elbowR[0] -= 0.3 * k;
    o.surge = -0.05 * k; o.bob = -0.02 * k;
    return restAims(ctx);
  },
  dead(p, u, cy, ctx, o) {
    // the knees go first, then the body tips back and down, arms trailing
    const buckle = ss(u, 0.0, 0.35), fall = ss(u, 0.2, 0.75), settle = ss(u, 0.7, 1);
    p.kneeL[0] += 0.9 * buckle * (1 - fall * 0.9); p.kneeR[0] += 1.1 * buckle * (1 - fall * 0.9);
    p.legL[0] -= 0.4 * buckle * (1 - fall); p.legR[0] -= 0.3 * buckle * (1 - fall);
    p.chest[0] += 0.3 * buckle * (1 - fall) - 0.1 * fall; p.head[0] += 0.3 * buckle * (1 - fall) - 0.25 * fall;
    p.root[0] = -PI / 2 * fall; o.rootY = fall * 0.13 - buckle * (1 - fall) * 0.12;
    p.armL[2] = -0.2 - 0.9 * fall; p.armR[2] = 0.2 + 1.1 * fall; p.armL[0] -= 0.3 * fall; p.elbowL[0] -= 0.4 * fall;
    p.head[1] = -0.35 * settle; p.legR[2] = 0.15 * settle; p.kneeL[0] += 0.3 * settle;
    return restAims(ctx);
  },

  // ---------------------------------------------------------------- the round-14 strike shapes, rebuilt with a wrist
  overhead(p, u, cy, ctx, o) {
    const { wind, strike, rec, up } = phases(u, 0, 0.36, 0.36, 0.62, 0.78);
    o.bob = (stance(p, 0.7) - 0.05 * strike) * rec;
    p.armR = [(-2.5 * up + 0.2 * strike - 0.4 * (1 - wind)) * rec - 0.2 * (1 - rec), -0.15 * rec, 0.3 * rec + 0.12];
    p.elbowR[0] = (-1.2 * up - 0.15 * strike) * rec - 0.2;
    p.chest[0] += (-0.18 * up + 0.32 * strike) * rec; p.chest[1] += (0.3 * up - 0.4 * strike) * rec;
    p.hips[1] += p.chest[1] * 0.35; p.head[0] += (-0.1 * up + 0.12 * strike) * rec;
    p.armL[0] = (-0.5 + 0.35 * strike) * rec; p.elbowL[0] = -0.9 * rec - 0.16;
    p.kneeL[0] += 0.25 * strike * rec;
    if (ctx.hold.left === 'shield') { p.armL = [-0.45 * rec, 0.9 * rec, 0.05]; p.elbowL = [-1.35 * rec - 0.2, -0.4 * rec, 0]; }
    // the blade goes back over the head on the wind, and the wrist snaps it through on the strike
    return { R: [(-3.4 * up - 1.2 * strike - 1.0 * (1 - wind)) * rec - 0.95 * (1 - rec), (0.4 * up - 0.2 * strike) * rec, 0] };
  },
  attack(p, u, cy, ctx, o) { return CLIPS[attackFor(ctx.hold)](p, u, cy, ctx, o); },
  slash(p, u, cy, ctx, o, dir = 1) {
    // A HORIZONTAL CUT. The hips lead, the chest follows, the arm arrives last, and the wrist rolls
    // the edge over as the blade crosses — that roll is what makes it a cut rather than a push.
    const { wind, strike, rec } = phases(u, 0, 0.3, 0.28, 0.58, 0.72), s = dir;
    o.bob = stance(p, 0.8) * rec - 0.02 * sin(u * PI);
    p.hips[1] += (0.35 * wind - 0.75 * strike) * s * rec;
    p.chest[1] += (0.6 * wind - 1.25 * strike) * s * rec;
    p.armR[0] = (-0.45 - 0.45 * wind + 0.3 * strike) * rec - 0.1;
    p.armR[1] = (0.55 * wind - 1.0 * strike) * s * rec;
    p.armR[2] = 0.14 + (0.7 * wind - 0.4 * strike) * rec;
    p.elbowR[0] = (-1.3 * wind + 1.15 * strike) * rec - 0.25;
    p.armL[0] = -0.45 * rec; p.armL[2] = -0.14 - 0.35 * s * rec; p.elbowL[0] = -0.9 * rec - 0.16;
    if (ctx.hold.left === 'shield') { p.armL = [-0.45 * rec, 0.9 * rec, 0.05]; p.elbowL = [-1.35 * rec - 0.2, -0.4 * rec, 0]; }
    p.head[1] = p.chest[1] * -0.3;
    return { R: [(-1.7 - 0.3 * wind) * rec - 0.95 * (1 - rec), (1.2 * wind - 1.5 * strike) * s * rec, (-0.9 * wind + 0.8 * strike) * s * rec] };
  },
  slashBack(p, u, cy, ctx, o) { return CLIPS.slash(p, u, cy, ctx, o, -1); },
  thrust(p, u, cy, ctx, o) {
    const back = ss(u, 0, 0.3), out = ss(u, 0.26, 0.48), rec = 1 - ss(u, 0.6, 1);
    o.bob = stance(p, 0.9) * rec - 0.05 * out * rec; o.surge = 0.06 * out * rec;
    p.armR[0] = (-0.35 + 0.5 * back - 1.5 * out) * rec - 0.05; p.armR[2] = 0.14 + 0.08 * rec;
    p.elbowR[0] = (-1.55 * back + 1.4 * out) * rec - 0.2;
    p.chest[1] += (0.35 * back - 0.55 * out) * rec; p.hips[1] += p.chest[1] * 0.5; p.chest[0] += 0.12 * out * rec;
    p.legR[0] += 0.15 * out * rec; p.kneeL[0] += 0.35 * out * rec;
    p.armL[0] = -0.3 * rec; p.armL[2] = -0.14 - 0.4 * out * rec;
    return { R: [-1.6 * rec - 0.95 * (1 - rec), -0.3 * back * rec, 0] };
  },
  jab(p, u, cy, ctx, o) {
    const out = sin(Math.min(1, u / 0.45) * PI);
    o.bob = stance(p, 0.6);
    p.armR[0] = -0.6 - 0.4 * out; p.armR[2] = 0.14;
    p.elbowR[0] = -1.3 + 1.15 * out;
    p.chest[1] += -0.18 * out; p.armL[0] = -0.5; p.elbowL[0] = -1.0;
    return { R: [-1.6, 0, 0] };
  },
  sweep(p, u, cy, ctx, o) {
    // BOTH HANDS ON THE HAFT: arms locked together and the whole body turns
    const { wind, strike, rec } = phases(u, 0, 0.34, 0.3, 0.64, 0.78);
    o.bob = stance(p, 1) * rec - 0.03 * sin(u * PI);
    const turn = (0.95 * wind - 1.95 * strike) * rec;
    p.chest[1] += turn; p.hips[1] += turn * 0.6; p.head[1] = -turn * 0.2;
    p.armR = [(-0.85 - 0.3 * wind + 0.35 * strike) * rec, 0, -0.3 * rec]; p.armL = [(-0.95 - 0.3 * wind + 0.35 * strike) * rec, 0, 0.42 * rec];
    p.elbowR[0] = -0.6 * rec - 0.16; p.elbowL[0] = -0.8 * rec - 0.16;
    p.legR[0] += -0.2 * strike * rec; p.legL[0] += 0.2 * strike * rec;
    return { R: [(-1.7 - 0.2 * wind) * rec - 0.95 * (1 - rec), (-0.6 * wind + 0.9 * strike) * rec, (1.3 * wind - 1.2 * strike) * rec] };
  },
  arcCut(p, u, cy, ctx, o) {
    const { wind, strike, rec } = phases(u, 0, 0.28, 0.26, 0.6, 0.8);
    o.bob = stance(p, 1) * rec - 0.045 * sin(u * PI); o.surge = 0.05 * strike * rec;
    const turn = (0.75 * wind - 2.1 * strike) * rec;
    p.chest[1] += turn * 0.65; p.hips[1] += turn * 0.55; p.head[1] = -turn * 0.15;
    p.armR[0] = (-0.6 - 0.55 * wind + 0.55 * strike) * rec; p.armR[1] = turn * 0.45; p.armR[2] = 0.14 + 0.6 * rec;
    p.elbowR[0] = (-1.0 + 0.85 * strike) * rec - 0.2;
    p.armL[0] = -0.4 * rec; p.armL[2] = -0.6 * rec;
    p.kneeR[0] += 0.35 * strike * rec;
    return { R: [(-1.7 - 0.4 * wind) * rec - 0.95 * (1 - rec), (1.4 * wind - 1.6 * strike) * rec, (-0.8 * wind + 0.9 * strike) * rec] };
  },
  slam(p, u, cy, ctx, o) {
    // THE SMASH. Both arms up and HELD (the pause is the weight), then down through the target fast
    const up = ss(u, 0, 0.3), hold = ss(u, 0.3, 0.4), down = ss(u, 0.4, 0.54), rec = 1 - ss(u, 0.76, 1);
    const raise = up * (1 - down);
    o.bob = (stance(p, 0.8) + 0.03 * raise - 0.13 * down) * rec;
    p.armR = [(-2.6 * raise + 0.3 * down - 0.2) * rec, 0, -0.18 * rec]; p.armL = [(-2.5 * raise + 0.25 * down - 0.2) * rec, 0, 0.3 * rec];
    p.elbowR[0] = (-0.5 - 0.6 * hold * (1 - down) - 0.2 * down) * rec - 0.16; p.elbowL[0] = p.elbowR[0];
    p.chest[0] += (-0.18 * raise + 0.35 * down) * rec; p.head[0] += (-0.12 * raise + 0.18 * down) * rec;
    p.kneeL[0] += 0.6 * down * rec; p.kneeR[0] += 0.6 * down * rec; p.legL[0] -= 0.3 * down * rec; p.legR[0] -= 0.3 * down * rec;
    return { R: [(-3.3 * raise - 1.2 * down) * rec + END(ctx) * (1 - rec), 0.2 * raise * rec, 0] };
  },
  lunge(p, u, cy, ctx, o) {
    const load = ss(u, 0, 0.24), out = ss(u, 0.2, 0.46), rec = 1 - ss(u, 0.66, 1);
    o.bob = -0.17 * out * rec; o.surge = 0.12 * out * rec;
    p.armR[0] = (-0.3 + 0.4 * load - 1.6 * out) * rec; p.elbowR[0] = (-1.45 * load + 1.35 * out) * rec - 0.16;
    p.legL[0] = -(0.2 * load + 0.85 * out) * rec;
    p.kneeL[0] += 1.1 * out * rec; p.legR[0] += 0.6 * out * rec; p.footR[0] -= 0.4 * out * rec; p.footL[0] -= 0.3 * out * rec;
    p.chest[0] += 0.25 * out * rec; p.chest[1] += -0.35 * out * rec; p.hips[1] += -0.25 * out * rec;
    p.armL[0] = -0.2 * rec + 0.6 * out * rec; p.armL[2] = -0.14 - 0.9 * out * rec; p.elbowL[0] = -0.3 * rec;
    return { R: [-1.55 * rec - 0.95 * (1 - rec), 0, 0] };
  },
  shoot(p, u, cy, ctx, o) {
    // A BOW IS DRAWN: the bow arm goes out straight and stays; the draw hand comes back to the
    // cheek, holds, and snaps back on the loose. The bow is in the LEFT hand.
    const h = ctx.hold, draw = ss(u, 0.08, 0.6), loose = ss(u, 0.66, 0.78), rec = 1 - ss(u, 0.86, 1);
    o.bob = stance(p, 0.5) * rec;
    if (h.right === 'crossbow') {
      // a crossbow is shouldered: both hands up, the stock at the cheek, a kick on the loose
      p.armR = [-1.25 * rec, -0.35 * rec, -0.1 * rec]; p.elbowR[0] = -1.35 * rec - 0.16;
      p.armL = [-1.3 * rec, 0.4 * rec, 0.2 * rec]; p.elbowL[0] = -0.7 * rec - 0.16;
      p.chest[0] -= 0.15 * loose * (1 - ss(u, 0.78, 0.9)) * rec; p.head[1] -= 0.25 * rec; p.head[0] += 0.08 * rec;
      return { R: [-0.3 * loose * (1 - ss(u, 0.78, 0.95)), 0, -0.2 * rec] };
    }
    p.chest[1] += (-0.35 - 0.3 * draw + 0.1 * loose) * rec; p.head[1] = 0.55 * rec; p.hips[1] += -0.3 * rec;
    p.armL = [-1.5 * rec, 0.15 * rec, -0.2 * rec]; p.elbowL[0] = -0.06 * rec - 0.16 * (1 - rec);
    p.armR = [(-1.4 + 0.25 * draw) * rec, (-0.15 - 0.45 * draw + 0.6 * loose) * rec, (0.35 + 0.1 * draw) * rec];
    p.elbowR[0] = (-0.4 - 1.5 * draw + 1.3 * loose) * rec - 0.16;
    o.bob += 0.01 * draw;
    return { L: [-1.57 - 0.15 * (1 - rec), 0, 0] };
  },
  reload(p, u, cy, ctx, o) {
    const down = ss(u, 0, 0.22), haul = sin(ss(u, 0.24, 0.72) * PI), back = 1 - ss(u, 0.78, 1);
    p.chest[0] += (0.4 * down + 0.25 * haul) * back;
    p.armR[0] = (-0.2 + 0.4 * down - 1.1 * haul) * back; p.armL[0] = (-0.3 + 0.3 * down - 1.0 * haul) * back;
    p.elbowR[0] = (-0.6 - 0.9 * haul) * back - 0.16; p.elbowL[0] = (-0.7 - 0.8 * haul) * back - 0.16;
    p.kneeL[0] += 0.5 * down * back; p.legL[0] -= 0.3 * down * back; p.head[0] += 0.3 * down * back;
    o.bob = -0.06 * down * back;
    return { R: [0.4 * down * back, 0, 0] };
  },
  castPoint(p, u, cy, ctx, o) {
    // a wand: the arm out and a flick of the wrist at the end
    const out = sin(Math.min(1, u / 0.5) * PI / 2), flick = sin(ss(u, 0.45, 0.85) * PI);
    p.armR[0] = -1.2 * out; p.armR[2] = 0.2 * out + 0.1; p.elbowR[0] = -0.4 * out + 0.25 * flick - 0.16;
    p.chest[1] += -0.2 * out; p.hips[1] += -0.1 * out; p.armL[0] = -0.35; p.elbowL[0] = -0.8;
    p.head[1] = 0.1 * out;
    return { R: [-1.55 - 0.45 * flick, 0, 0] };
  },
  castStaff(p, u, cy, ctx, o) {
    // both hands on the haft, the butt driven down, the body leaning into the release
    const plant = ss(u, 0, 0.35), push = sin(ss(u, 0.32, 0.8) * PI);
    o.bob = stance(p, 0.6) - 0.03 * push;
    p.armR[0] = -0.9 - 0.45 * push; p.armR[2] = 0.3; p.armL[0] = -1.1 - 0.4 * push; p.armL[2] = -0.42;
    p.elbowR[0] = -0.6 - 0.3 * push; p.elbowL[0] = -0.85 - 0.25 * push;
    p.chest[0] += -0.2 * plant + 0.38 * push; p.head[0] += -0.14 * plant + 0.22 * push;
    return { R: [0.35 * push - 0.2 * plant, 0, 0] };
  },
  channel(p, u, cy, ctx, o) {
    const rise = 0.5 - cos(cy) * 0.5, shiver = sin(cy * 7) * 0.02;
    o.bob = stance(p, 0.6) + 0.018 * rise;
    p.armR[0] = -1.0 - 0.15 * rise + shiver; p.armR[2] = 0.32; p.armL[0] = -1.2 - 0.15 * rise - shiver; p.armL[2] = -0.44;
    p.elbowR[0] = -0.65; p.elbowL[0] = -0.9;
    p.chest[0] += -0.14 - 0.1 * rise; p.head[0] += -0.16 - 0.08 * rise; p.hips[1] += shiver * 0.5;
    return { R: [0.1, 0, 0] };
  },
  cast(p, u, cy, ctx, o) {
    // gather at the chest, then both hands thrown forward and up with the chest arching after them
    const gather = env(u, 0, 0.35, 0.4, 0.5), throwIt = env(u, 0.42, 0.58, 0.72, 1);
    o.bob = stance(p, 0.5) + 0.02 * throwIt;
    p.armL = [-0.6 * gather - 1.35 * throwIt, -0.3 * gather, -0.2 * gather - 0.45 * throwIt]; p.armR = [-0.6 * gather - 1.35 * throwIt, 0.3 * gather, 0.2 * gather + 0.45 * throwIt];
    p.elbowL[0] = p.elbowR[0] = -1.6 * gather - 0.4 * throwIt - 0.16;
    p.chest[0] += 0.15 * gather - 0.18 * throwIt; p.head[0] += 0.1 * gather - 0.15 * throwIt;
    return restAims(ctx);
  },
  castBook(p, u, cy, ctx, o) {
    // the tome held open on the left forearm, the right hand drawing the sign over it and throwing it
    const read = env(u, 0, 0.2, 0.55, 0.7), sign = sin(ss(u, 0.15, 0.55) * PI * 2), throwIt = env(u, 0.55, 0.68, 0.8, 1);
    o.bob = stance(p, 0.4);
    p.armL = [-0.75, 0.25, 0.1]; p.elbowL = [-1.25, 0.3, 0]; p.handL = [0.3, 0, 0.5];
    p.armR = [-0.9 * read - 1.4 * throwIt, 0.2 * read, 0.25 + 0.15 * sign * read]; p.elbowR[0] = -1.2 * read - 0.3 * throwIt - 0.16;
    p.head[0] += 0.18 * read - 0.1 * throwIt; p.chest[0] += 0.06 * read - 0.12 * throwIt;
    return {};
  },

  // ---------------------------------------------------------------- 2026-09-24: weapon families
  chop(p, u, cy, ctx, o) {
    // AN AXE: diagonal, high right to low left, and the weight carries on past the target
    const { wind, strike, rec, up } = phases(u, 0, 0.34, 0.34, 0.56, 0.74);
    o.bob = stance(p, 0.9) * rec - 0.07 * strike * rec;
    p.armR = [(-2.3 * up + 0.3 * strike - 0.25) * rec, (0.35 * up - 0.4 * strike) * rec, (0.55 * up - 0.1 * strike) * rec + 0.12];
    p.elbowR[0] = (-1.3 * up - 0.1 * strike) * rec - 0.2;
    p.chest[1] += (0.5 * up - 0.7 * strike) * rec; p.chest[0] += (-0.12 * up + 0.24 * strike) * rec; p.hips[1] += p.chest[1] * 0.4;
    p.chest[2] = (0.1 * up - 0.12 * strike) * rec;
    p.kneeL[0] += 0.3 * strike * rec; p.armL[0] = (-0.6 + 0.3 * strike) * rec; p.elbowL[0] = -0.9 * rec - 0.16;
    if (ctx.hold.left === 'shield') { p.armL = [-0.45 * rec, 0.9 * rec, 0.05]; p.elbowL = [-1.35 * rec - 0.2, -0.4 * rec, 0]; }
    return { R: [(-3.2 * up - 1.15 * strike - 1.2 * (1 - wind)) * rec - 0.55 * (1 - rec), (0.3 * up) * rec, (0.5 * up - 0.4 * strike) * rec] };
  },
  hack(p, u, cy, ctx, o) {
    // a flat hack at waist height, the body turning through it
    const { wind, strike, rec } = phases(u, 0, 0.3, 0.28, 0.54, 0.72);
    o.bob = stance(p, 1) * rec;
    const turn = (0.8 * wind - 1.5 * strike) * rec;
    p.chest[1] += turn; p.hips[1] += turn * 0.5;
    p.armR = [(-0.8 - 0.2 * wind) * rec, (0.6 * wind - 0.9 * strike) * rec, (0.9 * wind - 0.2 * strike) * rec + 0.12]; p.elbowR[0] = (-1.2 * wind + 1.0 * strike) * rec - 0.2;
    p.armL[0] = -0.5 * rec; p.elbowL[0] = -1.0 * rec - 0.16;
    return { R: [-1.7 * rec - 0.55 * (1 - rec), (0.4 * wind - 0.4 * strike) * rec, (-1.3 * wind + 1.4 * strike) * rec] };
  },
  smash(p, u, cy, ctx, o) {
    // A MACE OR HAMMER in one hand: straight overhead, the body drops under the blow
    const { wind, strike, rec, up } = phases(u, 0, 0.4, 0.4, 0.58, 0.76);
    o.bob = (stance(p, 0.8) - 0.1 * strike) * rec;
    p.armR = [(-2.7 * up + 0.1 * strike - 0.2) * rec, -0.1 * rec, 0.25 * rec + 0.12]; p.elbowR[0] = (-1.5 * up - 0.2 * strike) * rec - 0.2;
    p.chest[0] += (-0.15 * up + 0.28 * strike) * rec; p.head[0] += (-0.1 * up + 0.12 * strike) * rec; p.chest[1] += 0.2 * up * rec;
    p.kneeL[0] += 0.45 * strike * rec; p.kneeR[0] += 0.4 * strike * rec;
    p.armL[0] = (-0.7 * up + 0.2 * strike) * rec; p.armL[2] = -0.14 - 0.4 * up * rec; p.elbowL[0] = -0.7 * rec - 0.16;
    if (ctx.hold.left === 'shield') { p.armL = [-0.45 * rec, 0.9 * rec, 0.05]; p.elbowL = [-1.35 * rec - 0.2, -0.4 * rec, 0]; }
    return { R: [(-3.5 * up - 1.25 * strike - 1.0 * (1 - wind)) * rec - 0.55 * (1 - rec), 0, 0] };   // the head lands at body height, not at the feet
  },
  uppercut(p, u, cy, ctx, o) {
    const load = ss(u, 0, 0.3), rise = ss(u, 0.3, 0.52), rec = 1 - ss(u, 0.7, 1);
    o.bob = (stance(p, 1) - 0.06 * load * (1 - rise) + 0.03 * rise) * rec;
    p.armR = [(0.3 * load - 2.0 * rise) * rec, 0, (0.3 - 0.2 * rise) * rec + 0.12]; p.elbowR[0] = (-0.5 - 0.6 * rise) * rec - 0.16;
    p.chest[0] += (0.3 * load - 0.35 * rise) * rec; p.chest[1] += (0.4 * load - 0.5 * rise) * rec;
    p.kneeL[0] += 0.5 * load * (1 - rise) * rec; p.kneeR[0] += 0.5 * load * (1 - rise) * rec;
    return { R: [(-0.4 * load - 2.8 * rise) * rec - 0.9 * (1 - rec), 0.5 * rise * rec, 0] };
  },
  stab(p, u, cy, ctx, o) {
    // A DAGGER in a reverse grip: raised, then driven down and in
    const { wind, strike, rec, up } = phases(u, 0, 0.35, 0.35, 0.55, 0.7);
    o.bob = stance(p, 0.8) * rec - 0.04 * strike * rec; o.surge = 0.04 * strike * rec;
    p.armR = [(-1.9 * up - 0.8 * strike) * rec, 0.1 * rec, (0.2 * up) * rec + 0.12]; p.elbowR[0] = (-1.4 * up - 0.3 * strike) * rec - 0.16;
    p.chest[0] += 0.25 * strike * rec; p.chest[1] += (0.2 * up - 0.3 * strike) * rec;
    p.armL[0] = -0.5 * rec; p.elbowL[0] = -1.2 * rec - 0.16;
    // reverse grip: the point down past the little finger
    return { R: [(0.3 * up - 0.6 + 0.3 * strike) * rec + END(ctx) * (1 - rec), 0, 0] };
  },
  flurry(p, u, cy, ctx, o) {
    // quick alternating jabs, both hands, three beats
    o.bob = stance(p, 0.8);
    const r = Math.max(0, sin(u * PI * 3)), l = Math.max(0, -sin(u * PI * 3)), rec = 1 - ss(u, 0.85, 1);
    p.armR[0] = (-0.6 - 0.6 * r) * rec - 0.1; p.elbowR[0] = (-1.3 + 1.2 * r) * rec - 0.16;
    p.armL[0] = (-0.6 - 0.6 * l) * rec - 0.1; p.elbowL[0] = (-1.3 + 1.2 * l) * rec - 0.16;
    p.chest[1] += (-0.2 * r + 0.2 * l) * rec;
    const aims = { R: [-1.6, 0, 0] }; if (REST_PITCH[ctx.hold.left]) aims.L = [-1.6, 0, 0];
    return aims;
  },
  bash(p, u, cy, ctx, o) {
    // THE SHIELD, SHOVED: forearm across, then the whole body behind it
    const load = ss(u, 0, 0.3), hit = ss(u, 0.3, 0.46), rec = 1 - ss(u, 0.64, 1);
    o.bob = stance(p, 1) * rec; o.surge = (0.12 * hit - 0.03 * load) * rec;
    p.armL = [(-0.7 + 0.2 * load - 0.2 * hit) * rec, 1.4 * rec, 0]; p.elbowL = [(-1.7 + 0.3 * hit) * rec - 0.16 * (1 - rec), -0.6 * rec, 0];
    p.chest[1] += (0.3 * load - 0.3 * hit) * rec; p.chest[0] += 0.2 * hit * rec; p.legR[0] += 0.3 * hit * rec; p.kneeL[0] += 0.3 * hit * rec;
    p.armR = [-0.35 * rec, -0.2 * rec, 0.35 * rec + 0.12]; p.elbowR[0] = -1.35 * rec - 0.16;
    return REST_PITCH[ctx.hold.right] ? { R: [-2.2 * rec - 0.95 * (1 - rec), 0.3 * rec, 0.2 * rec] } : {};
  },
  parry(p, u, cy, ctx, o) {
    // the blade snaps across to meet a blow and holds it for a beat
    const meet = ss(u, 0, 0.25), rec = 1 - ss(u, 0.6, 1);
    o.bob = stance(p, 1) * rec;
    p.armR = [-0.95 * meet * rec, 0, -0.1 * rec + 0.14 * (1 - rec)]; p.elbowR[0] = -1.1 * meet * rec - 0.16;
    p.chest[1] += 0.25 * meet * rec;
    return { R: [-2.7 * meet * rec - 0.95 * (1 - meet * rec), 0.2 * rec, -0.7 * meet * rec] };
  },
  offSlash(p, u, cy, ctx, o) {
    // the off hand's cut: slash, mirrored onto the left arm
    const { wind, strike, rec } = phases(u, 0, 0.3, 0.28, 0.58, 0.72);
    o.bob = stance(p, 0.8) * rec;
    p.hips[1] += (-0.35 * wind + 0.7 * strike) * rec; p.chest[1] += (-0.6 * wind + 1.2 * strike) * rec;
    p.armL[0] = (-0.45 - 0.45 * wind + 0.3 * strike) * rec - 0.1; p.armL[1] = (-0.55 * wind + 1.0 * strike) * rec;
    p.armL[2] = -0.14 - (0.7 * wind - 0.4 * strike) * rec; p.elbowL[0] = (-1.3 * wind + 1.15 * strike) * rec - 0.25;
    p.armR[0] = -0.5 * rec; p.elbowR[0] = -1.0 * rec - 0.16;
    return { L: [(-1.7 - 0.3 * wind) * rec - 0.95 * (1 - rec), (-1.2 * wind + 1.5 * strike) * rec, (0.9 * wind - 0.8 * strike) * rec], R: REST_PITCH[ctx.hold.right] ? [-1.85, 0, 0] : undefined };
  },
  offThrust(p, u, cy, ctx, o) {
    const back = ss(u, 0, 0.3), out = ss(u, 0.26, 0.48), rec = 1 - ss(u, 0.6, 1);
    o.bob = stance(p, 0.9) * rec; o.surge = 0.05 * out * rec;
    p.armL[0] = (-0.35 + 0.5 * back - 1.5 * out) * rec - 0.05; p.elbowL[0] = (-1.55 * back + 1.4 * out) * rec - 0.2;
    p.chest[1] += (-0.35 * back + 0.55 * out) * rec;
    return { L: [-1.6 * rec - 0.95 * (1 - rec), 0, 0], R: REST_PITCH[ctx.hold.right] ? [-1.85, 0, 0] : undefined };
  },
  crossSlash(p, u, cy, ctx, o) {
    // both blades up and crossed, then scissored down and out
    const { wind, strike, rec, up } = phases(u, 0, 0.35, 0.35, 0.58, 0.74);
    o.bob = (stance(p, 1) - 0.06 * strike) * rec;
    for (const [s, k] of [['R', 1], ['L', -1]]) {
      p['arm' + s] = [(-2.2 * up - 0.3 * strike) * rec, (-0.4 * up + 0.5 * strike) * k * rec, (-0.3 * up + 0.8 * strike) * k * rec + 0.12 * k];
      p['elbow' + s][0] = (-1.0 * up + 0.4 * strike) * rec - 0.2;
    }
    p.chest[0] += (-0.2 * up + 0.35 * strike) * rec;
    return { R: [(-3.2 * up - 1.0 * (1 - wind) - 0.4 * strike) * rec - 0.95 * (1 - rec), 0, (0.4 * up) * rec], L: [(-3.2 * up - 1.0 * (1 - wind) - 0.4 * strike) * rec - 0.95 * (1 - rec), 0, (-0.4 * up) * rec] };
  },
  twinCleave(p, u, cy, ctx, o) {
    // DOUBLED GRASP: a two-hander in each hand. Right comes down diagonally, then the left, each
    // with the body turning into it — two full blows, not one swing done twice
    const a = ss(u, 0, 0.2), b = ss(u, 0.2, 0.36), c = ss(u, 0.4, 0.52), d = ss(u, 0.52, 0.68), rec = 1 - ss(u, 0.8, 1);
    const upR = a * (1 - b), upL = c * (1 - d);
    o.bob = (stance(p, 1.1) - 0.07 * (b * (1 - c) + d)) * rec;
    p.armR = [(-2.3 * upR + 0.3 * b - 0.4 * (1 - a)) * rec, (0.3 * upR - 0.4 * b) * rec, (0.5 * upR) * rec + 0.14];
    p.elbowR[0] = (-1.1 * upR) * rec - 0.2;
    p.armL = [(-2.3 * upL + 0.3 * d - 0.4 * (1 - c)) * rec, (-0.3 * upL + 0.4 * d) * rec, (-0.5 * upL) * rec - 0.14];
    p.elbowL[0] = (-1.1 * upL) * rec - 0.2;
    p.chest[1] += ((0.5 * upR - 0.6 * b) - (0.5 * upL - 0.6 * d) * 1) * rec; p.hips[1] += p.chest[1] * 0.4;
    p.chest[0] += (0.35 * b * (1 - c) + 0.35 * d - 0.15 * (upR + upL)) * rec;
    p.kneeL[0] += 0.3 * (b + d) * rec * 0.5; p.kneeR[0] += 0.3 * (b + d) * rec * 0.5;
    return { R: [(-3.3 * upR - 1.1 * b - 1.3 * (1 - a)) * rec + END(ctx) * (1 - rec), 0, 0.3 * upR * rec], L: [(-3.3 * upL - 1.1 * d - 1.3 * (1 - c)) * rec + END(ctx) * (1 - rec), 0, -0.3 * upL * rec] };
  },
  twinSlam(p, u, cy, ctx, o) {
    // both arms up and held, then down together — two two-handers, or one held in both hands
    const up = ss(u, 0, 0.32), hold = ss(u, 0.32, 0.42), down = ss(u, 0.42, 0.56), rec = 1 - ss(u, 0.76, 1), raise = up * (1 - down);
    o.bob = (stance(p, 0.9) + 0.03 * raise - 0.14 * down) * rec;
    const inward = ctx.hold.dualTwo ? 0 : 0.3;
    p.armR = [(-2.6 * raise + 0.3 * down - 0.2) * rec, 0, (0.15 - inward) * rec]; p.armL = [(-2.6 * raise + 0.3 * down - 0.2) * rec, 0, (-0.15 + inward) * rec];
    p.elbowR[0] = p.elbowL[0] = (-0.6 - 0.5 * hold * (1 - down)) * rec - 0.16;
    p.chest[0] += (-0.18 * raise + 0.36 * down) * rec; p.head[0] += (-0.1 * raise + 0.18 * down) * rec;
    p.kneeL[0] += 0.6 * down * rec; p.kneeR[0] += 0.6 * down * rec; p.legL[0] -= 0.3 * down * rec; p.legR[0] -= 0.3 * down * rec;
    const pitch = (-3.4 * raise - 1.3 * down) * rec + END(ctx) * (1 - rec);
    const aims = { R: [pitch, 0, 0] }; if (ctx.hold.dualTwo) aims.L = [pitch, 0, 0];
    return aims;
  },
  spinSweep(p, u, cy, ctx, o) {
    // a full turn with the weapon out at arm's length — the whole root spins
    const spin = ss(u, 0.15, 0.8), rec = 1 - ss(u, 0.85, 1), out = env(u, 0.05, 0.2, 0.75, 0.95);
    o.bob = stance(p, 1) - 0.03 * out;
    p.root[1] = -spin * PI * 2;
    p.armR = [-1.1 * out, 0, 0.6 * out + 0.12]; p.elbowR[0] = -0.3 * out - 0.16;
    p.armL = [-1.0 * out, 0, -0.5 * out - 0.12]; p.chest[0] += 0.15 * out;
    return { R: [-1.6 * out * rec - 0.95 * (1 - out * rec), 0, -0.6 * out] };
  },
  whirl(p, u, cy, ctx, o) {
    // a LOOPING spin: one full turn per cycle, weapon out at arm's length — Farhold's Whirlwind
    // plays it for as many spins as the skill makes (a one-turn clip restarted every spin never
    // finished its turn)
    o.bob = stance(p, 0.9) - 0.02;
    p.root[1] = -u * PI * 2;
    p.armR = [-1.15, 0, 0.7]; p.elbowR[0] = -0.25;
    p.armL = [-1.0, 0, -0.6]; p.chest[0] += 0.12; p.head[1] = 0.15;
    return REST_PITCH[ctx.hold.right] ? { R: [-1.6, 0, -0.5] } : {};
  },
  thrust2h(p, u, cy, ctx, o) {
    // A POLEARM with both hands: the rear hand drives, the front hand guides
    const back = ss(u, 0, 0.3), out = ss(u, 0.28, 0.46), rec = 1 - ss(u, 0.62, 1);
    o.bob = stance(p, 1) * rec - 0.05 * out * rec; o.surge = 0.08 * out * rec;
    p.armR = [(-0.5 + 0.35 * back - 0.8 * out) * rec, 0, -0.25 * rec]; p.elbowR[0] = (-1.3 * back + 1.0 * out) * rec - 0.4;
    p.armL = [(-0.9 + 0.2 * back - 0.5 * out) * rec, 0, 0.35 * rec]; p.elbowL[0] = (-0.9 + 0.3 * out) * rec - 0.16;
    p.chest[1] += (0.4 * back - 0.5 * out) * rec; p.hips[1] += p.chest[1] * 0.5; p.chest[0] += 0.15 * out * rec;
    p.legR[0] += 0.2 * out * rec; p.kneeL[0] += 0.4 * out * rec;
    return { R: [-1.5 * rec + (ctx.hold.right === 'polearm' ? -PI + 0.2 : -0.95) * (1 - rec), 0, -0.3 * rec] };
  },
  punch(p, u, cy, ctx, o) {
    const back = ss(u, 0, 0.3), out = ss(u, 0.28, 0.45), rec = 1 - ss(u, 0.6, 1);
    o.bob = stance(p, 1) * rec;
    p.armR = [(-0.7 + 0.2 * back - 0.9 * out) * rec, 0, 0.2 * rec]; p.elbowR[0] = (-2.0 * (1 - out) + -0.2 * out) * rec - 0.16;
    p.armL = [-0.75 * rec, 0.3 * rec, -0.2 * rec]; p.elbowL[0] = -2.0 * rec - 0.16;
    p.chest[1] += (0.35 * back - 0.6 * out) * rec; p.hips[1] += p.chest[1] * 0.5; p.legR[0] += 0.2 * out * rec;
    return {};
  },
  kick(p, u, cy, ctx, o) {
    const chamber = ss(u, 0, 0.3), out = ss(u, 0.3, 0.45), rec = 1 - ss(u, 0.6, 1);
    o.bob = -0.02;
    p.legR[0] = (-1.2 * chamber - 0.3 * out) * rec; p.kneeR[0] = (1.6 * chamber - 1.5 * out) * rec; p.footR[0] = 0.3 * out * rec;
    p.kneeL[0] += 0.3 * rec; p.chest[0] -= (0.15 * chamber + 0.2 * out) * rec;
    p.armL = [-0.6 * rec, 0.3 * rec, -0.4 * rec]; p.elbowL[0] = -1.5 * rec; p.armR = [-0.4 * rec, 0, 0.5 * rec]; p.elbowR[0] = -1.4 * rec;
    return {};
  },
  throw(p, u, cy, ctx, o) {
    // a javelin: drawn back past the ear with the free arm pointing, then hurled
    const back = ss(u, 0, 0.4), release = ss(u, 0.4, 0.55), rec = 1 - ss(u, 0.7, 1);
    o.bob = stance(p, 1) * rec;
    p.armR = [(-2.4 * back + 1.6 * release) * rec, (0.4 * back - 0.4 * release) * rec, (0.5 * back) * rec + 0.12]; p.elbowR[0] = (-1.0 * back + 0.9 * release) * rec - 0.16;
    p.armL = [(-1.4 * back + 1.0 * release) * rec, 0, -0.2 * rec]; p.elbowL[0] = -0.2 * rec - 0.16;
    p.chest[1] += (0.6 * back - 0.9 * release) * rec; p.hips[1] += p.chest[1] * 0.5; p.chest[0] += (-0.2 * back + 0.35 * release) * rec;
    o.handsFree = ss(u, 0.52, 0.56) * (1 - ss(u, 0.85, 1));
    return { R: [(-1.7 * back - 0.2 * release) * rec - PI * 0.9 * (1 - rec), 0, 0] };
  },

  // ---------------------------------------------------------------- talking and waving (hands free)
  wave(p, u, cy, ctx, o) {
    const w = sin(cy * 3), raise = env(u, 0, 0.12, 0.88, 1);
    p.armR = [-0.3 * raise, 0.2 * raise, 0.12 + 2.3 * raise]; p.elbowR = [-0.25 * raise - 0.16, 0, 0]; p.elbowR[2] = (0.35 + w * 0.4) * raise;
    p.handR[2] = w * 0.25 * raise; p.head[2] = -0.1 * raise; p.head[1] = 0.12 * raise; p.chest[2] = -0.06 * raise;
    p.hips[2] = 0.04 * raise; p.legR[2] = -0.04 * raise; p.legL[2] = -0.04 * raise; o.sway = 0.01 * raise;
    return {};
  },
  talk(p, u, cy, ctx, o) {
    // one hand then the other makes the point; the head nods on the stresses
    const a = sin(cy), b = sin(cy + 2.2), stress = Math.max(0, sin(cy * 2)) ** 3;
    p.armL = [-0.35 + a * 0.2, 0.2, -0.25]; p.armR = [-0.3 + b * 0.2, -0.2, 0.25];
    p.elbowL[0] = -0.9 - Math.max(0, a) * 0.4; p.elbowR[0] = -0.8 - Math.max(0, b) * 0.45;
    p.handL[2] = 0.3 + a * 0.2; p.handR[2] = -0.3 - b * 0.2;
    p.head[0] += stress * 0.08 - 0.02; p.head[1] = sin(cy) * 0.14; p.chest[0] += stress * 0.03; p.chest[1] = a * 0.05;
    p.hips[2] = sin(cy * 0.5) * 0.02;
    return {};
  },

  // ---------------------------------------------------------------- emotes (hands free)
  cheer(p, u, cy, ctx, o) {
    const up = env(u, 0, 0.15, 0.8, 1), pump = Math.max(0, sin(u * PI * 4));
    p.armR = [-0.2 * up, 0, 0.12 + 2.6 * up]; p.armL = [-0.2 * up, 0, -0.12 - 2.6 * up];
    p.elbowR[0] = p.elbowL[0] = -0.6 * up - 0.3 * pump * up; o.rootY = 0.06 * pump * up;
    p.kneeL[0] += 0.3 * (1 - pump) * up; p.kneeR[0] += 0.3 * (1 - pump) * up;
    p.head[0] -= 0.25 * up; p.chest[0] -= 0.12 * up; return {};
  },
  bowGreet(p, u, cy, ctx, o) {
    const b = env(u, 0.05, 0.35, 0.65, 0.95);
    p.chest[0] += 0.5 * b; p.hips[0] = 0.12 * b; p.head[0] += 0.12 * b;
    p.armR = [-0.9 * b, -0.6 * b, 0.1]; p.elbowR[0] = -1.4 * b - 0.16; p.armL = [0.4 * b, 0, -0.2 * b]; p.elbowL[0] = -0.4 * b - 0.16;
    p.legR[0] += 0.25 * b; p.kneeR[0] += 0.2 * b; return {};
  },
  point(p, u, cy, ctx, o) {
    const out = env(u, 0.05, 0.25, 0.8, 1);
    p.armR = [-1.45 * out, -0.2 * out, 0.12]; p.elbowR[0] = -0.1 * out - 0.16 * (1 - out); p.handR[0] = -0.2 * out;
    p.chest[1] = -0.3 * out; p.head[1] = -0.15 * out; p.head[0] -= 0.05 * out; p.armL[2] = -0.2; return {};
  },
  shrug(p, u, cy, ctx, o) {
    const s = env(u, 0.1, 0.35, 0.6, 0.9);
    p.armL = [-0.3 * s, 0.6 * s, -0.12 - 0.5 * s]; p.armR = [-0.3 * s, -0.6 * s, 0.12 + 0.5 * s];
    p.elbowL[0] = p.elbowR[0] = -1.4 * s - 0.16; p.handL[2] = 0.6 * s; p.handR[2] = -0.6 * s;
    p.head[2] = 0.15 * s; p.head[0] -= 0.1 * s; o.bob = 0.015 * s; return {};
  },
  nod(p, u, cy, ctx, o) { p.head[0] += sin(u * PI * 4) * 0.22 * env(u, 0, 0.1, 0.8, 1); return {}; },
  headShake(p, u, cy, ctx, o) { p.head[1] = sin(u * PI * 6) * 0.35 * env(u, 0, 0.1, 0.8, 1); p.chest[1] = -p.head[1] * 0.2; return {}; },
  laugh(p, u, cy, ctx, o) {
    const s = env(u, 0, 0.1, 0.85, 1), shake = sin(u * PI * 14);
    p.chest[0] += (-0.2 + shake * 0.05) * s; p.head[0] += (-0.35 + shake * 0.06) * s;
    p.armL = [-0.4 * s, 0.4 * s, -0.2]; p.armR = [-0.4 * s, -0.4 * s, 0.2]; p.elbowL[0] = p.elbowR[0] = -1.5 * s - 0.16;
    o.bob = shake * 0.006 * s; return {};
  },
  clap(p, u, cy, ctx, o) {
    const s = env(u, 0, 0.12, 0.85, 1), c = Math.abs(sin(u * PI * 6));
    p.armL = [-0.9 * s, 0.7 * s, -0.12]; p.armR = [-0.9 * s, -0.7 * s, 0.12];
    p.elbowL[0] = p.elbowR[0] = -1.2 * s - 0.16; p.elbowL[2] = -0.3 * c * s; p.elbowR[2] = 0.3 * c * s;
    p.head[0] -= 0.05 * s; return {};
  },
  salute(p, u, cy, ctx, o) {
    const s = env(u, 0.05, 0.25, 0.75, 0.95);
    p.armR = [-0.5 * s, -0.4 * s, 0.12 + 1.45 * s]; p.elbowR = [-2.4 * s - 0.16, 0, 0]; p.handR[0] = 0.3 * s;
    p.chest[0] -= 0.06 * s; p.head[0] -= 0.06 * s; p.legL[2] = 0.02; p.legR[2] = -0.02; return {};
  },
  kneel(p, u, cy, ctx, o) {
    const k = ss(u, 0, 0.3) * (1 - ss(u, 0.85, 1) * 0) , breath = sin(u * PI * 2) * 0.02;
    p.legL[0] = -1.4 * k; p.kneeL[0] = 1.55 * k; p.footL[0] = -0.15 * k;
    p.legR[0] = 0.3 * k; p.kneeR[0] = 1.75 * k; p.footR[0] = 0.9 * k;
    p.chest[0] += (0.15 + breath) * k; p.head[0] += 0.2 * k;
    p.armL = [-0.55 * k, 0, -0.1]; p.elbowL[0] = -0.3 * k; p.armR = [-0.3 * k, 0, 0.15]; p.elbowR[0] = -0.4 * k;
    o.bob = -0.26 * k * (rigLeg(ctx) / 0.53); return {};
  },
  sitGround(p, u, cy, ctx, o) {
    const k = ss(u, 0, 0.35), breath = sin(u * PI * 2) * 0.015;
    p.legL[0] = -1.35 * k; p.legR[0] = -1.35 * k; p.kneeL[0] = 1.6 * k; p.kneeR[0] = 1.6 * k; p.legL[2] = -0.5 * k; p.legR[2] = 0.5 * k;
    p.footL[0] = -0.3 * k; p.footR[0] = -0.3 * k;
    p.chest[0] += (0.2 + breath) * k; p.armL = [-0.9 * k, 0.3 * k, -0.2 * k]; p.armR = [-0.9 * k, -0.3 * k, 0.2 * k];
    p.elbowL[0] = p.elbowR[0] = -0.7 * k;
    o.bob = -(rigLeg(ctx) + 0.02) * 0.88 * k; return {};
  },
  pray(p, u, cy, ctx, o) {
    const k = ss(u, 0, 0.25), breath = sin(u * PI * 2) * 0.02;
    p.armL = [-0.7 * k, 0.9 * k, -0.12]; p.armR = [-0.7 * k, -0.9 * k, 0.12]; p.elbowL[0] = p.elbowR[0] = -1.6 * k - 0.16;
    p.head[0] += 0.35 * k + breath; p.chest[0] += 0.08 * k; return {};
  },
  dance(p, u, cy, ctx, o) {
    const s = sin(cy * 2), c = cos(cy);
    p.hips[1] = s * 0.25; p.hips[2] = c * 0.08; p.chest[1] = -s * 0.2; p.head[2] = c * 0.12;
    p.armL = [-0.5 + c * 0.4, 0, -0.5 - s * 0.3]; p.armR = [-0.5 - c * 0.4, 0, 0.5 - s * 0.3];
    p.elbowL[0] = p.elbowR[0] = -1.2;
    p.kneeL[0] += Math.max(0, s) * 0.4; p.kneeR[0] += Math.max(0, -s) * 0.4; o.bob = -Math.abs(s) * 0.03; o.sway = c * 0.02; return {};
  },
  lookAround(p, u, cy, ctx, o) {
    const l = sin(cy) * env(u, 0, 0.1, 0.9, 1);
    p.head[1] = l * 0.7; p.chest[1] = l * 0.2; p.head[0] -= 0.08 * Math.abs(l); p.handR[0] = 0; p.armR = [-0.4 * Math.abs(l), 0, 0.3]; p.elbowR[0] = -2.3 * Math.abs(l) * 0.8;
    p.hips[2] = cos(cy) * 0.03; return {};
  },
  crossArms(p, u, cy, ctx, o) {
    const k = ss(u, 0, 0.2), breath = sin(u * PI * 2) * 0.015;
    p.armL = [-0.55 * k, 0.9 * k, -0.12]; p.armR = [-0.5 * k, -0.9 * k, 0.12]; p.elbowL = [-1.9 * k - 0.16, 0, 0]; p.elbowR = [-1.9 * k - 0.16, 0, 0];
    p.chest[0] += breath - 0.04 * k; p.head[0] -= 0.06 * k; p.hips[2] = 0.05 * k; p.legL[2] = -0.05 * k; p.legR[2] = -0.05 * k; p.kneeR[0] += 0.15 * k; return {};
  },
  stretch(p, u, cy, ctx, o) {
    const k = env(u, 0.05, 0.4, 0.65, 0.95);
    p.armL = [-0.3 * k, 0, -0.12 - 2.7 * k]; p.armR = [-0.3 * k, 0, 0.12 + 2.7 * k]; p.elbowL[0] = p.elbowR[0] = -0.2 * k - 0.16;
    p.chest[0] -= 0.2 * k; p.head[0] -= 0.3 * k; o.rootY = 0.02 * k; return {};
  },
  drink(p, u, cy, ctx, o) {
    const lift = env(u, 0.1, 0.35, 0.7, 0.9), tip = env(u, 0.35, 0.45, 0.6, 0.7);
    p.armR = [-0.6 * lift, -0.5 * lift, 0.12]; p.elbowR[0] = -2.2 * lift - 0.16; p.handR[0] = -0.4 * tip;
    p.head[0] -= 0.35 * tip; p.chest[0] -= 0.1 * tip; return {};
  },
  sleep(p, u, cy, ctx, o) {
    const k = ss(u, 0, 0.3), breath = sin(u * PI * 2) * 0.03;
    p.root[0] = -PI / 2 * k; o.rootY = 0.13 * k; p.root[2] = 0;
    p.chest[0] += breath * k; p.head[1] = 0.4 * k; p.armL[2] = -0.35 * k; p.armR = [-0.4 * k, 0, 0.2]; p.elbowR[0] = -1.8 * k;
    p.kneeL[0] = 0.3 * k; p.legL[0] = -0.2 * k; return {};
  },

  // ---------------------------------------------------------------- swimming, riding, working (kept, with the new base under them)
  swim(p, u, cy, ctx, o) { return swimPose(p, 'swim', cy, o); },
  swimBack(p, u, cy, ctx, o) { return swimPose(p, 'swimBack', cy, o); },
  swimSide(p, u, cy, ctx, o) { return swimPose(p, 'swimSide', cy, o); },
  boat(p, u, cy, ctx, o) {
    const sweep = sin(cy);
    p.legL[0] = -0.24; p.legR[0] = 0.12; p.kneeL[0] = 0.4; p.kneeR[0] = 0.3; p.footL[0] = -0.14; p.footR[0] = -0.1;
    p.hips[1] = -0.16; p.chest[1] = 0.15; p.chest[0] = 0.1 + sweep * 0.07;
    p.armL[0] = -0.95 + sweep * 0.4; p.armL[2] = -0.34; p.armR[0] = -0.55 - sweep * 0.32; p.armR[2] = 0.28;
    p.elbowL[0] = -0.55; p.elbowR[0] = -0.95; p.head[1] = sweep * 0.09;
    o.bob = sin(cy * 2) * 0.012; return {};
  },
  sit(p, u, cy, ctx, o) {
    const ride = sin(cy);
    o.rootY = -0.2;
    p.legL[0] = -1.15; p.legR[0] = -1.15; p.legL[2] = -0.26; p.legR[2] = 0.26; p.kneeL[0] = 0.85; p.kneeR[0] = 0.85;
    p.chest[0] = 0.08 + ride * 0.02; p.armL[0] = -0.7; p.armR[0] = -0.7; p.armL[2] = -0.2; p.armR[2] = 0.2;
    p.elbowL[0] = -0.85; p.elbowR[0] = -0.85; p.head[0] = ride * 0.03; o.bob = ride * 0.01; return restAims(ctx);
  },
  pickSwing(p, u, cy, ctx, o) {
    // A ONE-ARMED PICK SWING (2026-09-24: "the character leans over at the hips and swings both
    // arms — the mining animation should swing your dominant arm with some slight back
    // leaning/twist"). The right arm takes the pick up and back while the chest leans back a little
    // and twists away; then the arm comes down into the rock with the chest turning back through it.
    // The left hand stays low and loose. Loops, and returns to rest at the loop point.
    const raise = ss(u, 0.02, 0.4), strike = ss(u, 0.4, 0.53), rec = 1 - ss(u, 0.66, 0.98), up = raise * (1 - strike);
    p.armR = [(-2.5 * up - 0.75 * strike) * rec, (0.25 * up) * rec, 0.12 + 0.2 * up * rec];
    p.elbowR[0] = -0.16 + (-1.0 * up + 0.55 * strike) * rec;
    p.chest[0] += (-0.12 * up + 0.14 * strike) * rec;
    p.chest[1] += (0.28 * up - 0.18 * strike) * rec; p.hips[1] += (0.1 * up - 0.06 * strike) * rec;
    p.head[0] += (-0.05 * up + 0.1 * strike) * rec; p.head[1] = -p.chest[1] * 0.4;
    p.armL[0] = (-0.3 - 0.15 * strike) * rec; p.elbowL[0] = -0.16 - 0.5 * rec;
    p.kneeL[0] += 0.12 * strike * rec; p.kneeR[0] += 0.08 * strike * rec;
    o.bob = (0.01 * up - 0.03 * strike) * rec;
    return REST_PITCH[ctx.hold.right] ? { R: [(-3.2 * up - 1.2 * strike) * rec - 0.95 * (1 - rec) * (1 - strike), 0, 0] } : {};
  },
  chopSwing(p, u, cy, ctx, o) {
    const raise = ss(u, 0.02, 0.36), cut = ss(u, 0.36, 0.52), rec = 1 - ss(u, 0.62, 0.98), up = raise * (1 - cut);
    p.chest[1] = (0.5 * up - 0.42 * cut) * rec; p.hips[1] = p.chest[1] * 0.45; p.head[1] = p.chest[1] * -0.2;
    p.armR[0] = (-2.0 * up + 1.35 * cut) * rec; p.armL[0] = (-1.75 * up + 1.25 * cut) * rec;
    p.armR[1] = (0.35 * up - 0.3 * cut) * rec; p.armR[2] = 0.12 + (0.35 * up - 0.1 * cut) * rec; p.armL[2] = -0.12 - 0.3 * up * rec;
    p.elbowR[0] = -0.12 + (-0.7 * up + 0.85 * cut) * rec; p.elbowL[0] = p.elbowR[0];
    p.chest[0] += (-0.15 * up + 0.45 * cut) * rec; p.head[0] += (-0.12 * up + 0.25 * cut) * rec;
    p.kneeL[0] += 0.32 * cut * rec; p.kneeR[0] += 0.22 * cut * rec;
    o.bob = (0.02 * up - 0.07 * cut) * rec;
    return REST_PITCH[ctx.hold.right] ? { R: [(-3.0 * up - 1.4 * cut) * rec - 0.95 * (1 - rec) * (1 - cut), 0, 0.4 * up * rec] } : {};
  },
  forage(p, u, cy, ctx, o) {
    const reach = sin(cy);
    p.chest[0] = 0.66 + reach * 0.07; p.head[0] = 0.26; p.hips[0] = 0.2;
    p.legL[0] = 0.24; p.legR[0] = 0.1; p.kneeL[0] = 0.58; p.kneeR[0] = 0.42; p.footL[0] = -0.2; p.footR[0] = -0.14;
    p.armR[0] = -0.28 + reach * 0.3; p.armR[2] = 0.22; p.armL[0] = -0.28 - reach * 0.3; p.armL[2] = -0.22;
    p.elbowR[0] = -0.9 - Math.max(0, reach) * 0.25; p.elbowL[0] = -0.9 - Math.max(0, -reach) * 0.25; p.head[1] = reach * 0.1;
    o.bob = -0.075 + sin(cy * 2) * 0.012; return {};
  },
};

const rigLeg = ctx => ctx.rig.leg;

function swimPose(p, name, cy, o) {
  const stroke = sin(cy);
  p.root[0] = -1.12; o.rootY = 0.36;
  p.head[0] = 0.5; p.chest[0] = 0.12;
  p.legL[0] = stroke * 0.3; p.legR[0] = -stroke * 0.3;
  p.kneeL[0] = Math.max(0, -stroke) * 0.5; p.kneeR[0] = Math.max(0, stroke) * 0.5;
  if (name === 'swim') {
    p.armL[0] = -1.5 + stroke * 1.45; p.armR[0] = -1.5 - stroke * 1.45;
    p.elbowL[0] = -0.45 - Math.max(0, stroke) * 0.6; p.elbowR[0] = -0.45 - Math.max(0, -stroke) * 0.6;
  } else if (name === 'swimBack') {
    p.armL[0] = -0.35 + stroke * 0.75; p.armR[0] = -0.35 - stroke * 0.75;
    p.elbowL[0] = p.elbowR[0] = -1.05; p.armL[2] = -0.4; p.armR[2] = 0.4;
  } else {
    p.armL[2] = -0.95 + stroke * 0.45; p.armR[2] = 0.95 + stroke * 0.45;
    p.armL[0] = -0.8; p.armR[0] = -0.8; p.elbowL[0] = p.elbowR[0] = -0.8;
  }
  o.bob = sin(cy * 2) * 0.02;
  return {};
}
