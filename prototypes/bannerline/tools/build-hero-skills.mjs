#!/usr/bin/env node
// Builds data/heroes.json from Farhold's data/skills.json rows + Bannerline's own hero numbers.
//
//   node tools/build-hero-skills.mjs          writes data/heroes.json
//   node tools/build-hero-skills.mjs --check  exits 1 if data/heroes.json is out of date
//
// Only DATA is reused (PLAN §6.3): the skill's shape, element, multiplier, radius, cooldown, mana and
// effects are copied from Farhold, then checked against the Bannerline skill vocabulary. A kept skill
// (or a kept talent mod) that uses a key outside the vocabulary FAILS LOUDLY, because the Bannerline
// runtime would silently ignore it. Descriptions are Bannerline's own (Farhold's descriptions quote
// Farhold-scaled numbers). Ranges (`range`) are halved for the top-down camera; radii are kept.
//
// Heroes are added per milestone: M1 Warrior; M3 Pyromancer; M6 Ranger, Druid.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FARHOLD = join(ROOT, '..', 'farhold', 'data', 'skills.json');
const OUT = join(ROOT, 'data', 'heroes.json');

// ── vocabulary (PLAN §6.3) ──────────────────────────────────────────────────────────────────────
const SHAPES = new Set(['melee', 'around', 'bolt', 'ground', 'dash', 'self', 'summon', 'form', 'place', 'turret']);
// keys a skill row may carry after normalisation (effects + shape parameters)
const SKILL_KEYS = new Set(['fxId', 'name', 'shape', 'element', 'mult', 'radius', 'reach', 'arc', 'range', 'cooldown', 'mp',
  'projectiles', 'spread', 'splash', 'pierce', 'repeats', 'line', 'pet', 'count', 'form', 'place',
  // effects
  'status', 'statuses', 'knock', 'pullIn', 'taunt', 'selfBuff', 'pool', 'detonate', 'empowerNext', 'bonusIf', 'pen',
  'trail', 'heal', 'stack', 'statusMult', 'delay',
  // M6 (Ranger, Druid)
  'split', 'dash', 'consumes', 'onHit', 'forms', 'howl', 'barrier',
  // round 2 (Engineer)
  'turret', 'repair', 'turretBuff']);
const SUB_KEYS = {
  line: ['length', 'width', 'every', 'across'],
  pool: ['seconds', 'radius', 'power', 'element', 'slow'],
  detonate: ['types', 'share', 'keep'],
  trail: ['seconds', 'every', 'radius', 'burns', 'step'],
  stack: ['status', 'add', 'max'],
  place: ['kind', 'arm', 'seconds', 'radius', 'triggerRadius', 'max', 'strike', 'tag'],
  split: ['shards', 'range', 'keep', 'when'],
  dash: ['to', 'range'],
  empowerNext: ['count', 'mult', 'seconds'],
  consumes: ['tag', 'mult'],
  onHit: ['healPet'],
  howl: ['status', 'seconds', 'damage', 'radius'],
  barrier: ['share', 'seconds'],
  form: ['id', 'name', 'group', 'toggle', 'body', 'stats', 'basic', 'onEnter'],
  turret: ['name', 'hp', 'hpPerLevel', 'range', 'attackEvery', 'mult', 'seconds', 'max', 'radius', 'dmgType'],
  repair: ['radius', 'share', 'self'],
  turretBuff: ['seconds', 'attackSpeed', 'damage'],
};
// shape-changing forms the runtime knows (PLAN §6.2: Briarback in v1; Fenrunner and Sporecap after v1)
const FORMS = ['briarback', 'wolf'];
const SELFBUFF_KEYS = new Set(['name', 'seconds', 'movePct', 'resistPerFoe', 'every', 'resist', 'damage', 'haste', 'regen', 'reflect', 'petsOnly']);
const TAUNT_KEYS = new Set(['radius', 'seconds', 'perTaunt', 'perTauntCap', 'target', 'by']);
const KNOCK_KEYS = new Set(['push', 'stagger']);
const MOD_KEYS = new Set(['set', 'add', 'mul', 'knock', 'pullIn', 'pool', 'statuses', 'forms']);
const BONUS_WHEN = /^(crowd|distance):[0-9.]+(:[0-9.]+){0,2}$/;
// Farhold keys dropped on purpose (presentation or Farhold-only systems)
const DROP = new Set(['desc', 'talents', 'icon', 'fx', 'sound', 'anim', 'unlock']);

// ── Bannerline heroes ───────────────────────────────────────────────────────────────────────────
// Combat numbers that are Bannerline's own. dps/hp curves come from econ.json hero + classes
// (dpsK/hpK); these are the mechanical parts the econ model does not have.
const HEROES = {
  warrior: {
    name: 'Warrior', dmgType: 'blade', armourClass: 'heavy', melee: true,
    range: 2.0, attackEvery: 1.0, moveSpeed: 5.0, radius: 0.6, aggro: 7,
    mp: 60, mpPerLevel: 5, mpRegen: 1.2, mpRegenPerLevel: 0.1,
    slots: { Q: 'cleave', W: 'breaching_shove', E: 'warcry', D: 'iron_resolve', R: 'whirlwind' },
    talentSkill: 'cleave', talentTier: '1',
    // Farhold's multipliers are tuned for a game where skills ARE the damage; here basic attacks carry
    // the econ model's dps curve and skills are the crowd bonus on top (econ.json classes.warrior.aoe).
    // Tuned with tools/sim-match.mjs so AI-vs-AI matches land in the PLAN §3.4 band.
    skillScale: 0.25,
    desc: 'Melee bruiser. Holds a crowd in place and cuts it down.',
  },
  pyromancer: {
    name: 'Pyromancer', dmgType: 'fire', armourClass: 'spectral', melee: false,
    range: 8, attackEvery: 1.1, moveSpeed: 5.0, radius: 0.55, aggro: 9,
    mp: 80, mpPerLevel: 8, mpRegen: 1.6, mpRegenPerLevel: 0.15,
    slots: { Q: 'firebolt', W: 'fire_wall', E: 'flashover', D: 'ember_stride', R: 'meteor' },
    talentSkill: 'firebolt', talentTier: '1',
    skillScale: 0.43,
    desc: 'Ranged caster. Stacks Burning on crowds and sets them off.',
  },
  ranger: {
    name: 'Ranger', dmgType: 'pierce', armourClass: 'light', melee: false,
    range: 9, attackEvery: 0.9, moveSpeed: 5.4, radius: 0.5, aggro: 10,
    mp: 60, mpPerLevel: 5, mpRegen: 1.3, mpRegenPerLevel: 0.1,
    slots: { Q: 'aimed_shot', W: 'hunters_snare', E: 'multi_shot', D: 'trackers_leap', R: 'rain_of_arrows' },
    passive: { name: 'Quarry', everyNth: 4, status: 'quarry', desc: 'Every 4th basic attack marks the target as Quarry: it takes 20% more damage for 6 s.' },
    talentSkill: 'multi_shot', talentTier: '1',
    skillScale: 0.4,
    desc: 'Ranged marksman. Marks Quarry, snares the road and rains arrows on it.',
  },
  druid: {
    name: 'Druid', dmgType: 'nature', armourClass: 'hide', melee: false,
    range: 7, attackEvery: 1.0, moveSpeed: 5.0, radius: 0.6, aggro: 8,
    mp: 70, mpPerLevel: 6, mpRegen: 1.5, mpRegenPerLevel: 0.12,
    slots: { Q: 'thornlash', W: 'renew', E: 'wolf_shape', D: 'briarback_shape', R: 'call_wolf' },
    talentSkill: 'thornlash', talentTier: '1',
    skillScale: 0.4,
    desc: 'Shapeshifter. Roots and heals at range; becomes a thorned boar that holds the line or a wolf that hunts; calls wolves.',
  },
  engineer: {
    name: 'Engineer', dmgType: 'pierce', armourClass: 'light', melee: false,
    range: 8, attackEvery: 1.0, moveSpeed: 5.0, radius: 0.55, aggro: 9,
    mp: 70, mpPerLevel: 6, mpRegen: 1.5, mpRegenPerLevel: 0.12,
    slots: { Q: 'bolt_turret', W: 'shrapnel_mine', E: 'field_repair', D: 'grapnel', R: 'overcharge' },
    talentSkill: null,
    desc: 'Builder. Holds a lane with turrets (one, then two, then three), mines the road and overcharges the guns.',
  },
};

// Bannerline descriptions (numbers here must match the copied rows; tests/skills.test.js checks the
// percentages against mult).
// {mult} and {every} are filled from the scaled numbers (percent of weapon damage at rank 1).
const DESC = {
  cleave: 'Strike everything within 4.5 m for {mult} weapon damage, +12% for each enemy hit past the first (up to +48%).',
  breaching_shove: 'Strike an 80° arc 3 m ahead for {mult} weapon damage, knock targets back 4 m and stun them for 0.6 s.',
  warcry: 'Gain Might (+30% damage for 12 s). Enemies within 10 m attack you for 3 s; each one adds 5% to Might (up to +25%).',
  iron_resolve: 'For 10 s take 6% less damage per enemy within 6 m (up to 36%); every 4th hit you take releases a 4 m shockwave for {every} weapon damage.',
  whirlwind: 'Spin 5 times over 1.6 s, striking everything within 5.5 m for {mult} weapon damage each spin, pulling it in and leaving it Bleeding. You move 30% slower while spinning.',
  firebolt: 'Hurl a bolt up to {range} m for {mult} weapon damage that splashes 2.6 m and adds a stack of Burning ({status} weapon damage a second per stack, up to 5).',
  fire_wall: 'Raise a 10 m line of flame up to {range} m away across your aim: {mult} weapon damage and 2 Burning stacks to everything in it, then it burns for 5 s ({pool} weapon damage a second).',
  flashover: 'Ignite a 6 m area up to {range} m away for {mult} weapon damage and set off Burning: 60% of each target\'s remaining burn damage at once (one stack stays).',
  ember_stride: 'For 8 s move 20% faster and leave burning ground behind you ({mult} weapon damage a second); the spot you start from burns for 4 s ({pool} a second).',
  aimed_shot: 'Loose a heavy arrow up to {range} m for {mult} weapon damage that ignores half of the target\'s resistance; more damage the further it flies (up to +60%).',
  hunters_snare: 'Set a snare up to {range} m away (two at most). It arms after 1 s; the first enemy to step on it roots everything within 2.5 m, deals {strike} weapon damage and marks them as Quarry.',
  multi_shot: 'Fire 5 arrows in a fan for {mult} weapon damage each. An arrow that hits Quarry splits into 2 shards.',
  trackers_leap: 'Leap {dash} m back from where you aim, striking everything within 2.5 m of where you stood for {mult} weapon damage. Your next basic attack within 3 s deals 50% more.',
  rain_of_arrows: 'Rain 8 volleys over 4 s on a 6.5 m area up to {range} m away, {mult} weapon damage each; Quarry takes 50% more and loses the mark.',
  bolt_turret: 'Build a Bolt Turret up to 8 m away. It shoots the nearest enemy within 10 m for {tmult} weapon damage and stands 45 s or until destroyed. One turret at rank 1, two at rank 2, three at rank 3 (building past the limit takes down the oldest).',
  shrapnel_mine: 'Bury a mine up to 8 m away (three at most). It arms after 1 s; the first enemy over it blasts everything within 3 m for {strike} weapon damage and slows them.',
  field_repair: 'Repair every turret within 8 m for 35% of its health, and patch yourself for 10%.',
  grapnel: 'Fire a grapnel and pull yourself up to 8 m toward where you aim, clipping enemies where you land for {mult} weapon damage.',
  overcharge: 'For 8 s your turrets fire twice as fast and deal 50% more damage.',
  wolf_shape: 'Take the Wolf shape (or leave it): 25% faster, 30% quicker bites, +10% health, and your other skills become wolf abilities: Throat Leap, Rending Bite, Pack Run and Running Howl.',
  thornlash: 'Lash a target up to {range} m away for {mult} weapon damage and root it for 0.6 s (not again on the same target for 6 s); your wolves heal 3%. In Briarback: Bramble Gore, a wide gore that knocks back and taunts what it hits. As a Wolf: Throat Leap, a pounce up to 7 m that bites and leaves the target Bleeding.',
  renew: 'Mending for 10 s (2.5% of your health a second). In Briarback: Thornswell, a barrier of 20% of your health for 6 s that returns 20% of the damage it takes. As a Wolf: Rending Bite, a bite that adds 2 Bleeding stacks.',
  briarback_shape: 'Take the Briarback shape (or leave it): +60% armour, +30% health, attackers take 15% of their blow back, and your attacks gore everything in front of you. Taking it taunts enemies within 6 m. As a Wolf: Pack Run, 35% faster for 5 s.',
  call_wolf: 'Call two Grove Wolves to fight beside you (at most two) and howl: you and your wolves are Hastened and deal 30% more for 6 s. In Briarback: Den Guard, your wolves take 30% less damage and taunt everything near them for 4 s. As a Wolf: Running Howl, you, your wolves and allied heroes within 12 m are Hastened and deal 20% more for 6 s.',
  meteor: 'Call a stone down on an 8 m area up to {range} m away after a short delay: {mult} weapon damage and 3 Burning stacks.',
};
const TALENT_DESC = {
  reaping_arc: 'Cleave becomes a wide 220° sweep reaching 5.5 m that knocks enemies back 1.5 m.',
  hooked_edge: 'Cleave drags everything it hits 2 m toward you.',
  cinder_spray: 'Firebolt throws three bolts in a fan, each for 65% of the damage.',
  slow_burner: 'Firebolt leaves a 2 m patch of fire for 3 s where it lands.',
  wide_fan: 'Broadhead Fan looses 7 arrows in a wider fan, each for 80% of the damage.',
  tight_fan: 'Broadhead Fan looses 3 arrows straight ahead, each for 130% of the damage.',
  thorn_fan: 'Thornlash throws three lashes in a fan; Bramble Gore sweeps a wider arc.',
  barbed: 'Thornlash also leaves the target Bleeding.',
};

// Statuses the runtime knows (PLAN §6.3: 9). Numbers are Bannerline's.
const STATUSES = {
  burn:   { name: 'Burning', kind: 'dot', dmgType: 'fire', perSecond: 0.15, seconds: 5, maxStacks: 5 },
  bleed:  { name: 'Bleeding', kind: 'dot', dmgType: 'blade', perSecond: 0.12, seconds: 6, maxStacks: 5 },
  root:   { name: 'Rooted', kind: 'root', seconds: 2 },
  stun:   { name: 'Stunned', kind: 'stun', seconds: 1 },
  slow:   { name: 'Slowed', kind: 'slow', slow: 0.4, seconds: 3 },
  quarry: { name: 'Quarry', kind: 'debuff', takeMore: 0.2, seconds: 6 },
  might:  { name: 'Might', kind: 'buff', damage: 0.15, seconds: 12 },
  regen:  { name: 'Mending', kind: 'buff', healPerSecond: 0.025, seconds: 10 },
  haste:  { name: 'Hastened', kind: 'buff', attackSpeed: 0.3, move: 0.2, seconds: 8 },
};

const RANKS = {
  _doc: 'Basic skills (Q W E D) have 3 ranks; rank r needs hero level 2r-1. The ultimate (R) has 3 ranks at levels 6/11/16. Each rank past the first: mult x (1 + multPerRank), cooldown x (1 - cdPerRank).',
  max: 3, basicLevels: [1, 3, 5], ultLevels: [6, 11, 16], multPerRank: 0.2, cdPerRank: 0.1, talentLevel: 6,
};

// Bannerline-only additions merged onto a Farhold row before it is normalised.
// Bannerline-original skill rows (no Farhold source): same vocabulary, Bannerline numbers already final
// (skillScale does not apply). Owner round 2: the Druid's WOLF form (R2.7), the ENGINEER (R2.8).
const BL_SKILLS = {
  bolt_turret: { name: 'Bolt Turret', shape: 'turret', element: 'physical', range: 8, cooldown: 8, mp: 15,
    turret: { name: 'Bolt Turret', hp: 320, hpPerLevel: 45, range: 10, attackEvery: 0.8, mult: 0.45, seconds: 45, max: [1, 2, 3], radius: 0.7 } },
  shrapnel_mine: { name: 'Shrapnel Mine', shape: 'ground', element: 'physical', range: 8, cooldown: 7, mp: 8,
    place: { kind: 'trap', arm: 1, seconds: 40, radius: 3, triggerRadius: 1.6, max: 3, strike: { mult: 0.9, status: 'slow' } } },
  field_repair: { name: 'Field Repair', shape: 'self', element: 'physical', cooldown: 14, mp: 12, repair: { radius: 8, share: 0.35, self: 0.1 } },
  grapnel: { name: 'Grapnel', shape: 'dash', element: 'physical', mult: 0.3, cooldown: 12, mp: 8, dash: { to: 'target', range: 8 } },
  overcharge: { name: 'Overcharge', shape: 'self', element: 'physical', cooldown: 40, mp: 30, turretBuff: { seconds: 8, attackSpeed: 1.0, damage: 0.5 } },
  wolf_shape: { name: 'Wolf Shape', shape: 'self', element: 'nature', cooldown: 1.5, mp: 6,
    form: { id: 'wolf', name: 'Wolf', group: 'shape', toggle: true, body: { creature: 'wolf', scale: 1.25 },
      stats: { movePct: 0.25, attackSpeedPct: 0.3, maxHpPct: 0.1 },
      basic: { shape: 'melee', reach: 2.0, arc: 1.0, mult: 0.9, element: 'blade' } } },
};
// per-form overrides added to Farhold rows (data-driven: the runtime swaps the skill while in the form)
const FORM_ADD = {
  thornlash: { wolf: { fxId: 'throat_leap', name: 'Throat Leap', shape: 'dash', dash: { to: 'target', range: 7 }, mult: 0.6, cooldown: 6, mp: 6, statuses: [{ id: 'bleed' }], onHit: null } },
  renew: { wolf: { fxId: 'rending_bite', name: 'Rending Bite', shape: 'melee', reach: 2.4, arc: 1.2, mult: 0.8, cooldown: 5, mp: 6, status: null, stack: { status: 'bleed', add: 2, max: 5 }, statusMult: 0.12 } },
  briarback_shape: { wolf: { fxId: 'pack_run', name: 'Pack Run', shape: 'self', form: null, cooldown: 14, mp: 10, selfBuff: { name: 'Pack Run', seconds: 5, movePct: 0.35 } } },
  call_wolf: { wolf: { fxId: 'running_howl', name: 'Running Howl', pet: null, count: null, cooldown: 20, mp: 12, howl: { status: 'haste', seconds: 6, damage: 0.2, radius: 12 } } },
};

// talents for Bannerline-original heroes (same mod vocabulary)
const BL_TALENTS = {
  engineer: { skill: 'bolt_turret', choices: [
    { id: 'heavy_bolts', name: 'Heavy Bolts', desc: 'Bolt Turrets hit 40% harder but fire a little slower.', mod: { set: { 'turret.mult': 0.63, 'turret.attackEvery': 1.0 } } },
    { id: 'scrap_walls', name: 'Scrap Plating', desc: 'Bolt Turrets have 60% more health and stand 15 s longer.', mod: { set: { 'turret.hp': 512, 'turret.seconds': 60 } } },
  ] },
};

const OVERRIDES = {
  meteor: { delay: 0.8 },
  call_wolf: { count: 2 },            // PLAN §6.2: two Grove Wolves
};

// Farhold keys a kept skill carries that Bannerline does not run, each with the reason. Anything not
// listed here and not in the vocabulary FAILS the build.
const REMOVE = {
  hunters_snare: { mult: 'the trap\'s strike carries its own multiplier (place.strike.mult)', radius: 'place.radius is the trap radius' },
  trackers_leap: { range: 'dash.range is the leap' },
};
// Bannerline numbers for pets (Farhold's pets read Farhold's level curve). Per body, at hero level 1;
// grows per hero level.
const PETS = {
  grove_wolf: { name: 'Grove Wolf', hp: 260, hpPerLevel: 40, dps: 9, dpsPerLevel: 2.2, speed: 5.4, range: 1.6, radius: 0.5, armour: 'hide', dmgType: 'nature', leash: 9, max: 2 },
};
function normaliseForm(id, f, scale) {
  // a form override: same vocabulary, `null` removes the key while in the form
  const nulls = Object.keys(f).filter(k => f[k] === null);
  const rest = {};
  for (const [k, v] of Object.entries(f)) if (v !== null) rest[k] = v;
  const out = normaliseSkill(id, { shape: f.shape || 'self', ...rest }, scale, true);
  if (!f.shape) delete out.shape;
  for (const k of nulls) out[k] = null;
  return out;
}

// ── normalise + validate ───────────────────────────────────────────────────────────────────────
function fail(msg) { console.error('build-hero-skills: ' + msg); process.exit(1); }

function normaliseSkill(id, src, scale = 1, inForm = false) {
  const out = {};
  const original = !!src._bl;   // a Bannerline-original row or override: numbers are already top-down
  if (original) scale = 1;       // ...and already final (skillScale is for Farhold multipliers)
  for (const [k, v] of Object.entries(src)) {
    if (DROP.has(k) || k === '_bl') continue;
    if (REMOVE[id] && REMOVE[id][k]) continue;
    if (k === 'forms') {
      const forms = {};
      for (const [fid, f] of Object.entries(v)) if (FORMS.includes(fid)) forms[fid] = normaliseForm(`${id}.forms.${fid}`, f, scale);
      out.forms = forms;
      continue;
    }
    if (k === 'repeatEvery') continue;               // folded into repeats below
    if (k === 'repeats') { out.repeats = typeof v === 'number' ? { count: v, every: src.repeatEvery ?? 0.3 } : v; continue; }
    if (!SKILL_KEYS.has(k)) fail(`skill ${id}: key "${k}" is not in the Bannerline vocabulary (PLAN §6.3). Add a handler in js/sim/skills.js and to SKILL_KEYS, or drop the skill.`);
    out[k] = v;
  }
  if (out.shape != null && !SHAPES.has(out.shape)) fail(`skill ${id}: shape "${out.shape}" unknown`);
  if (!original && out.range != null) out.range = out.range / 2;   // top-down camera: Farhold ranges halved
  if (!original && out.dash && out.dash.range != null) out.dash = { ...out.dash, range: out.dash.range / 2 };
  // a distance bonus starts at half the distance (ranges are halved) and grows twice as fast per metre
  if (out.bonusIf) out.bonusIf = out.bonusIf.map(b => { const m = /^distance:([0-9.]+):([0-9.]+):([0-9.]+)$/.exec(b.when); return m ? { when: `distance:${+m[1] / 2}:${+m[2] * 2}:${m[3]}` } : b; });
  if (out.statuses) for (const st of out.statuses) for (const k of Object.keys(st)) if (!['id', 'seconds', 'lockout', 'minCrowd', 'slow', 'add', 'max'].includes(k)) fail(`skill ${id}: statuses[].${k} unknown`);
  if (out.pet && !PETS[out.pet]) fail(`skill ${id}: pet "${out.pet}" has no Bannerline stats in PETS`);
  if (out.selfBuff) for (const k of Object.keys(out.selfBuff)) if (!SELFBUFF_KEYS.has(k)) fail(`skill ${id}: selfBuff.${k} unknown`);
  if (out.taunt) for (const k of Object.keys(out.taunt)) if (!TAUNT_KEYS.has(k)) fail(`skill ${id}: taunt.${k} unknown`);
  if (out.knock) for (const k of Object.keys(out.knock)) if (!KNOCK_KEYS.has(k)) fail(`skill ${id}: knock.${k} unknown`);
  for (const [k, keys] of Object.entries(SUB_KEYS)) if (out[k]) for (const sk of Object.keys(out[k])) if (!keys.includes(sk)) fail(`skill ${id}: ${k}.${sk} unknown`);
  if (out.stack && !STATUSES[out.stack.status]) fail(`skill ${id}: stack status "${out.stack.status}" unknown`);
  if (out.status && !STATUSES[out.status]) fail(`skill ${id}: status "${out.status}" unknown`);
  if (out.bonusIf) for (const b of out.bonusIf) if (!BONUS_WHEN.test(b.when)) fail(`skill ${id}: bonusIf "${b.when}" unknown`);
  const r2 = v => Math.round(v * 100) / 100;
  if (out.mult != null) out.mult = r2(out.mult * scale);
  if (out.selfBuff && out.selfBuff.every && out.selfBuff.every.mult != null) out.selfBuff.every.mult = r2(out.selfBuff.every.mult * scale);
  if (out.statusMult != null) out.statusMult = r2(out.statusMult * scale);
  if (out.pool && out.pool.power != null) out.pool = { ...out.pool, power: r2(out.pool.power * scale) };
  if (out.place && out.place.strike && out.place.strike.mult != null) out.place = { ...out.place, strike: { ...out.place.strike, mult: r2(out.place.strike.mult * scale) } };
  if (out.form && out.form.basic && out.form.basic.mult != null) out.form = { ...out.form, basic: { ...out.form.basic } };
  if (inForm) return out;
  if (!DESC[id]) fail(`skill ${id}: no Bannerline description in DESC`);
  const pc = v => `${Math.round(v * 100)}%`;
  out.desc = DESC[id].replace('{mult}', out.mult != null ? pc(out.mult) : '').replace('{every}', out.selfBuff?.every ? pc(out.selfBuff.every.mult) : '')
    .replace('{status}', out.statusMult != null ? pc(out.statusMult) : '').replace('{pool}', out.pool ? pc(out.pool.power) : '').replace('{range}', out.range != null ? String(out.range) : '')
    .replace('{strike}', out.place && out.place.strike ? pc(out.place.strike.mult) : '').replace('{tmult}', out.turret ? pc(out.turret.mult) : '').replace('{dash}', out.dash ? String(out.dash.range) : '');
  if (out.desc.includes('{')) fail(`skill ${id}: unfilled placeholder in description`);
  return out;
}

function normaliseTalent(skillId, node) {
  for (const k of Object.keys(node.mod)) if (!MOD_KEYS.has(k)) fail(`talent ${node.id} (${skillId}): mod key "${k}" is not one of ${[...MOD_KEYS].join(', ')}`);
  if (node.mod.knock) for (const k of Object.keys(node.mod.knock)) if (!KNOCK_KEYS.has(k)) fail(`talent ${node.id}: knock.${k} unknown`);
  if (!TALENT_DESC[node.id]) fail(`talent ${node.id}: no Bannerline description`);
  const mod = JSON.parse(JSON.stringify(node.mod));
  if (mod.forms) { for (const f of Object.keys(mod.forms)) if (!FORMS.includes(f)) delete mod.forms[f]; }
  return { id: node.id, name: node.name, desc: TALENT_DESC[node.id], mod };
}

const farhold = JSON.parse(readFileSync(FARHOLD, 'utf8'));
const out = {
  _doc: 'GENERATED by tools/build-hero-skills.mjs from prototypes/farhold/data/skills.json (skill rows) + the HEROES/DESC tables in that tool. Do not edit by hand: change the tool and re-run it. Hero dps/hp curves live in econ.json (hero + classes). Read by js/sim/heroes.js, skills.js, talents.js, statuses.js.',
  ranks: RANKS,
  statuses: STATUSES,
  heroes: {},
  skills: {},
  pets: {},
};
for (const [hid, h] of Object.entries(HEROES)) {
  const hero = { ...h };
  delete hero.talentSkill; delete hero.talentTier; delete hero.skillScale;
  for (const sid of Object.values(h.slots)) {
    if (BL_SKILLS[sid]) { out.skills[sid] = normaliseSkill(sid, { ...BL_SKILLS[sid], _bl: true }, 1); continue; }
    const row0 = farhold.skills[sid];
    if (!row0) fail(`hero ${hid}: Farhold skill "${sid}" missing`);
    const tagged = FORM_ADD[sid] ? Object.fromEntries(Object.entries(FORM_ADD[sid]).map(([k, v]) => [k, { ...v, _bl: true }])) : null;
    const row = tagged ? { ...row0, forms: { ...(row0.forms || {}), ...tagged } } : row0;
    out.skills[sid] = normaliseSkill(sid, { ...row, ...(OVERRIDES[sid] || {}) }, h.skillScale ?? 1);
  }
  if (h.talentSkill) {
    const tier = farhold.skills[h.talentSkill]?.talents?.[h.talentTier];
    if (!tier) fail(`hero ${hid}: talent tier ${h.talentTier} of ${h.talentSkill} missing`);
    hero.talent = { skill: h.talentSkill, choices: tier.nodes.slice(0, 2).map(n => normaliseTalent(h.talentSkill, n)) };
  } else hero.talent = { skill: BL_TALENTS[hid].skill, choices: BL_TALENTS[hid].choices };
  for (const sid of Object.values(h.slots)) if (out.skills[sid].pet) out.pets[out.skills[sid].pet] = PETS[out.skills[sid].pet];
  out.heroes[hid] = hero;
}

const text = JSON.stringify(out, null, 1) + '\n';
if (process.argv.includes('--check')) {
  let cur = ''; try { cur = readFileSync(OUT, 'utf8'); } catch {}
  if (cur !== text) { console.error('data/heroes.json is out of date: run node tools/build-hero-skills.mjs'); process.exit(1); }
  console.log('data/heroes.json up to date');
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}: ${Object.keys(out.heroes).length} heroes, ${Object.keys(out.skills).length} skills`);
}
