// Chibi 4 kit — the pure part (no three.js, so node tests import it): avatar JSON -> outfit, Chibi 2 clip names ->
// kit clips, and the colour arithmetic the tint shader is fed with.
//
//   outfitFor(avatar)           -> { body, race, skin, hair: { id, color }, garments: [{ id, color, color2 }] }
//   dressOutfit(outfit, change) -> a new outfit (change: garment id, [ids], { slot: id|null }, or [{ id, color }])
//   clipFor(name, clips, robe)  -> { clip, loop, standIn } — what the kit plays for a Chibi 2 animation name
//   CHIBI2_NAMES                every animation name Chibi 2 knows (avatar-3d/js/chibi2-motion*.js), for coverage
//
// An outfit names garments from the kit's catalogue (kit.json): robe, mantle, sleeves, boots_low, undershirt, jerkin,
// trousers, boots_tall, bracers, pauldrons, tabard, scabbard, hat. Slots (kit.json `slots`) keep two things off the
// same place: a later garment replaces an earlier one that shares a slot (a jerkin takes the robe's torso).

export const KIT_BODIES = ['male', 'female'];
export const KIT_HAIRS = ['short', 'braid', 'ponytail', 'long', 'bob', 'crop'];

// The catalogue's slots, kept here too so the pure code can resolve conflicts without the kit loaded (the test
// checks this table against kit.json).
export const SLOTS = {
  robe: ['torso', 'skirt'], mantle: ['shoulders'], sleeves: ['arms'], boots_low: ['feet'], undershirt: ['shirt'],
  jerkin: ['torso'], trousers: ['legs'], boots_tall: ['feet'], bracers: ['wrists'], pauldrons: ['shoulders'],
  tabard: ['skirt'], scabbard: ['hip'], hat: ['head'],
};

// Chibi 2's hair ids -> the kit's six (MakeHuman CC0 hair fitted to each body)
const HAIR_MAP = [[/braid|plait/, 'braid'], [/pony|tail/, 'ponytail'], [/long|flow|mane|wavy/, 'long'], [/bob|bowl/, 'bob'],
  [/buzz|crop|shaved|stubble/, 'crop']];

function hairFor(avatar) {
  const h = avatar.hair || {};
  if (avatar.chibi4?.hair !== undefined) return avatar.chibi4.hair === null ? null : { id: avatar.chibi4.hair.id || avatar.chibi4.hair, color: avatar.chibi4.hair.color || h.color };
  const id = String(h.id || 'short');
  if (/^(none|bald)$/.test(id)) return null;
  const hit = HAIR_MAP.find(([re]) => re.test(id));
  return { id: hit ? hit[1] : 'short', color: h.color };
}

/** Chibi 2 avatar JSON -> a kit outfit. avatar.chibi4 = { body, race, hair, garments } overrides any part of it. */
export function outfitFor(avatar = {}) {
  const b = avatar.body || {};
  const c4 = avatar.chibi4 || {};
  const body = KIT_BODIES.includes(c4.body) ? c4.body : (b.gender === 'female' || b.sex === 'female' ? 'female' : 'male');
  const race = c4.race || (b.race === 'elf' ? 'elf' : 'human');
  let garments;
  if (Array.isArray(c4.garments)) garments = c4.garments.map(g => (typeof g === 'string' ? { id: g } : { ...g }));
  else {
    garments = [];
    const top = avatar.top || {}, bottom = avatar.bottom || {}, shoes = avatar.shoes || {}, hat = avatar.hat || {};
    const tid = String(top.id || 'none');
    const robed = /robe|gown|vestment|cassock|dress/.test(tid);
    garments.push({ id: 'trousers', color: bottom.color });
    if (robed) {
      garments.push({ id: 'robe', color: top.color, color2: top.color2 }, { id: 'mantle', color: top.color, color2: top.color2 },
        { id: 'sleeves', color: top.color, color2: top.color2 });
    } else {
      garments.push({ id: 'undershirt', color: top.color2 });
      if (tid !== 'none') garments.push({ id: 'jerkin', color: top.color, color2: top.color2 });
      if (/armou?r|plate|mail|cuirass|breast|scale/.test(tid)) garments.push({ id: 'pauldrons' }, { id: 'bracers' });
      if (/tabard|surcoat/.test(tid) || /kilt|skirt/.test(String(bottom.id || ''))) garments.push({ id: 'tabard', color: top.color });
    }
    const sid = String(shoes.id || 'boots');
    if (sid !== 'none') garments.push({ id: robed || /shoe|sandal|slipper/.test(sid) ? 'boots_low' : 'boots_tall', color: shoes.color });
    if (/wizard|witch|mage|pointed|conical/.test(String(hat.id || ''))) garments.push({ id: 'hat', color: hat.color });
  }
  return resolve({ body, race, skin: b.skin, hair: hairFor(avatar), garments });
}

/** Later garments win a slot; garments with no colour keep the kit's painted colours. */
export function resolve(outfit) {
  const out = []; const taken = new Map();
  for (const g of outfit.garments || []) {
    if (!SLOTS[g.id]) continue;
    for (const s of SLOTS[g.id]) {
      const prev = taken.get(s);
      if (prev) { const k = out.indexOf(prev); if (k >= 0) out.splice(k, 1); for (const [ss, v] of [...taken]) if (v === prev) taken.delete(ss); }
    }
    for (const s of SLOTS[g.id]) taken.set(s, g);
    out.push(g);
  }
  // knee boots never go under a floor-length robe (their heel kicks up through its back hem when running —
  // measured in step9_kit.py); low boots take their place
  if (out.some(g => g.id === 'robe')) for (const g of out) if (g.id === 'boots_tall') g.id = 'boots_low';
  // never naked: something on the torso and the legs
  const has = s => out.some(g => SLOTS[g.id].includes(s));
  if (!has('torso') && !has('shirt')) out.unshift({ id: 'undershirt' });
  if (!has('legs') && !has('skirt')) out.unshift({ id: 'trousers' });
  return { ...outfit, garments: out };
}

export function dressOutfit(outfit, change) {
  let list = [...outfit.garments];
  if (typeof change === 'string') list.push({ id: change });
  else if (Array.isArray(change)) list.push(...change.map(g => (typeof g === 'string' ? { id: g } : g)));
  else if (change && typeof change === 'object') {
    for (const [slot, id] of Object.entries(change)) {
      list = list.filter(g => !SLOTS[g.id]?.includes(slot));
      if (id) list.push(typeof id === 'string' ? { id } : id);
    }
  }
  return resolve({ ...outfit, garments: list });
}

export const outfitKey = o => [o.body, o.race, o.hair?.id || '-', ...o.garments.map(g => g.id).sort()].join('|');
export const isLong = o => o.garments.some(g => g.id === 'robe');

// ---------------------------------------------------------------- animation names
// Every Chibi 2 clip name -> [kit clip, how close it is]. 'good' = the clip IS that action; 'near' = the right kind
// of action, not the exact one (a shield bash played as a cross punch); a stand-in is listed honestly.
const G = 'good', N = 'near';
export const CLIP_MAP = {
  idle: ['idle', G], ready: ['ready', G], walk: ['walk', G], run: ['run', G], attack: ['attack', G], cast: ['cast', G],
  hit: ['hit', G], guard: ['guard', G], wave: ['wave', G], talk: ['talk', G], jump: ['jump', G], dead: ['death', G],
  swim: ['swim', G], swimBack: ['swimIdle', N], swimSide: ['swim', N],
  slash: ['attack', G], slashBack: ['attackL', N], thrust: ['jab', N], overhead: ['attack', G], sweep: ['spin', N], jab: ['jab', G],
  arcCut: ['attackL', N], slam: ['attack', N], lunge: ['cross', N], shoot: ['cast', N], reload: ['reload', G], castPoint: ['cast', G],
  castStaff: ['castEnter', N], channel: ['channel', G],
  boat: ['crouch', N], sit: ['sit', G], ride: ['ride', G], rideGallop: ['rideGallop', G],
  pickSwing: ['attack', N], chopSwing: ['attack', N], forage: ['pickUp', G],
  chop: ['attack', N], hack: ['attackL', N], smash: ['attack', N], uppercut: ['cross', N], stab: ['jab', N], flurry: ['jab', N],
  bash: ['cross', N], block: ['guard', G], parry: ['jabL', N], offSlash: ['attackL', G], offThrust: ['jabL', G],
  crossSlash: ['attack', N], twinCleave: ['attack', N], twinSlam: ['attack', N], spinSweep: ['spin', G], thrust2h: ['jab', N],
  punch: ['cross', G], kick: ['kick', G], throw: ['castL', N], castBook: ['cast', N], whirl: ['spin', G],
  lutePlay: ['idle', N],   // (2026-10-21) no lute clip in the kit yet: stand
  cheer: ['cheer', G], bowGreet: ['bow', G], point: ['point', G], shrug: ['shrug', G], nod: ['nod', G], headShake: ['headShake', G],
  laugh: ['laugh', G], clap: ['clap', G], salute: ['salute', G], kneel: ['kneelWork', N], sitGround: ['sitGround', G], pray: ['pray', G],
  dance: ['dance', G], lookAround: ['lookAround', G], crossArms: ['crossArms', G], stretch: ['stretch', G], drink: ['drink', G],
  sleep: ['sleep', G],
  dualSlashR: ['attack', G], dualSlashL: ['attackL', G], dualCross: ['spin', N], dualStabR: ['jab', G], dualStabL: ['jabL', G],
  dualFlurry: ['jab', N], twinChopR: ['attack', N], twinChopL: ['attackL', N], twinCrash: ['attack', N],
  fishCast: ['cast', N], fishWait: ['torch', N], fishReel: ['aim', N], fishShow: ['interact', N],
  standUp: ['standUp', G],
  profMine: ['attack', N], profChop: ['attack', N], profGather: ['pickUp', G], profSkin: ['kneelWork', N], profHammer: ['kneelWork', N],
  profStitch: ['kneelWork', N], profStir: ['push', N],
};
export const CHIBI2_NAMES = Object.keys(CLIP_MAP);

// which Chibi 2 names play once (chibi2-motion.js ONE_SHOTS + the dual/prof/fish one-shots)
const ONCE = new Set(['attack', 'cast', 'hit', 'jump', 'dead', 'slash', 'slashBack', 'thrust', 'overhead', 'sweep', 'jab', 'arcCut',
  'slam', 'lunge', 'shoot', 'reload', 'castPoint', 'castStaff', 'chop', 'hack', 'smash', 'uppercut', 'stab', 'flurry', 'bash',
  'parry', 'offSlash', 'offThrust', 'crossSlash', 'twinCleave', 'twinSlam', 'spinSweep', 'thrust2h', 'punch', 'kick', 'throw',
  'castBook', 'cheer', 'bowGreet', 'point', 'shrug', 'nod', 'headShake', 'laugh', 'clap', 'salute', 'drink', 'stretch',
  'dualSlashR', 'dualSlashL', 'dualCross', 'dualStabR', 'dualStabL', 'dualFlurry', 'twinChopR', 'twinChopL', 'twinCrash',
  'fishCast', 'fishShow', 'standUp', 'whirl']);

export function clipFor(name, clips = {}, robe = false) {
  let [clip, fit] = CLIP_MAP[name] || [name, G];
  if (!(clip in clips)) { clip = 'idle'; fit = 'missing'; }
  if (robe && (clip + '_robe') in clips) clip += '_robe';
  return { clip, loop: !ONCE.has(name), fit };
}

// ---------------------------------------------------------------- colours
export function hexToLinear(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
}
/** The tint uniform for one colour channel of a slot: rgb = colour / the painted colour's brightness, w = strength. */
export function tintUniform(hex, refLum, strength = 1) {
  const lin = hexToLinear(hex);
  if (!lin) return [1, 1, 1, 0];
  const k = 1 / Math.max(0.01, refLum || 0.2);
  return [lin[0] * k, lin[1] * k, lin[2] * k, strength];
}
/** Skin tone as a per-channel ratio against the painted skin (clamped so a pale skin cannot blow out). */
export function skinRatio(hex, ref) {
  const lin = hexToLinear(hex);
  if (!lin || !ref) return [1, 1, 1];
  return lin.map((v, i) => Math.min(3, Math.max(0.15, v / Math.max(0.005, ref[i]))));
}

// ---------------------------------------------------------------- a random outfit (crowds, the dress-up page, tests)
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// muted cloth dyes and leathers (random RGB reads as a costume party)
const DYES = ['#2a3a8a', '#1e2a5a', '#7a1020', '#5a1a2a', '#2e5a2a', '#3a6a3a', '#4a3020', '#6a4a2a', '#8a6a3a', '#3a3a40',
  '#5a5a62', '#d8d0b8', '#a08050', '#2a4a5a', '#4a2a5a', '#6a2a1a', '#203020', '#7a6a50', '#b09060', '#30303a'];
const hex = r => DYES[Math.floor(r() * DYES.length)];
export function randomLook(seed = Math.random() * 1e9) {
  const r = rng(seed);
  const body = r() < 0.5 ? 'male' : 'female';
  const robed = r() < 0.35;
  const g = [{ id: 'trousers', color: hex(r) }];
  if (robed) g.push({ id: 'robe', color: hex(r), color2: hex(r) }, ...(r() < 0.7 ? [{ id: 'mantle', color: hex(r) }] : []), { id: 'sleeves', color: hex(r) }, { id: 'boots_low' });
  else {
    g.push({ id: 'undershirt', color: hex(r) });
    if (r() < 0.75) g.push({ id: 'jerkin', color: hex(r), color2: hex(r) });
    g.push({ id: r() < 0.5 ? 'boots_tall' : 'boots_low' });
    for (const id of ['bracers', 'pauldrons', 'tabard', 'scabbard']) if (r() < 0.4) g.push({ id, color: hex(r) });
  }
  if (r() < 0.25) g.push({ id: 'hat', color: hex(r) });
  const tones = ['#f3d0b0', '#e8b890', '#c99068', '#a06a48', '#6e4a32', '#4a3020'];
  return { body: { skin: pick(tones, r) }, chibi4: { body, race: r() < 0.4 ? 'elf' : 'human', hair: r() < 0.08 ? null : { id: pick(KIT_HAIRS, r), color: pick(['#201810', '#4a3020', '#8a3a1a', '#c8a060', '#e0d8c0', '#303030'], r) }, garments: g } };
}
