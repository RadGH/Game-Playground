// Chibi 2.5 options: the one list a game reads to offer the 2.5 face/hair choices (pure — no Three.js, so node tests,
// tools and game UIs can import it). See CHIBI2.md "Chibi 2.5 contracts".
//
//   import { CHIBI25_OPTIONS, isV25, asV25 } from '../../avatar-3d/js/chibi25-options.js';
//   CHIBI25_OPTIONS.face.hair.ids        every hair id a 2.5 character can wear (original first, then the new ones)
//   CHIBI25_OPTIONS.face.hair.added      only the ids 2.5 added
//   CHIBI25_OPTIONS.face.hair.names[id]  a label for a menu
//   CHIBI25_OPTIONS.fields.eyes          extra fields on a slot (pupil / iris / white / colorR …) with their choices
//   CHIBI25_OPTIONS.raceEars[race]       the ear shapes that suit a race, best first

/** Is this look a Chibi 2.5 look? The one test every builder uses. */
export const isV25 = a => Number(a?.body?.v) >= 2.5;
/** A copy of a look switched to Chibi 2.5. */
export const asV25 = a => ({ ...(a || {}), body: { ...((a && a.body) || {}), v: 2.5 } });

const slot = (original, added, names) => ({ ids: [...original, ...added], original, added, names });

export const CHIBI25_OPTIONS = {
  face: {
    hair: slot(
      ['bald', 'buzz', 'short', 'side_part', 'bangs', 'bob', 'long', 'wavy', 'ponytail', 'bun', 'buns', 'mohawk', 'spiky', 'curly', 'afro', 'braids', 'pixie', 'slicked', 'hood_hair', 'tonsure', 'horns_hair'],
      ['undercut', 'topknot', 'high_ponytail', 'twin_tails', 'messy', 'pompadour', 'locs', 'long_braid', 'mullet', 'side_swept',
        // hair pass 2 (2026-10-16): thirteen more, each with its own front and silhouette
        'crown_braid', 'side_shave', 'wolf_cut', 'half_up', 'ribbon_loops', 'cornrows', 'warrior_braids', 'feathered', 'curly_bob', 'puff', 'rolled_tail', 'bowl', 'court_cut'],
      { crown_braid: 'Braided crown', side_shave: 'Side shave', wolf_cut: 'Wolf cut', half_up: 'Half-up knot', ribbon_loops: 'Ribbon loops', cornrows: 'Cornrows', warrior_braids: 'Warrior braids', feathered: 'Feathered', curly_bob: 'Curly bob', puff: 'Top puff', rolled_tail: 'Rolled tail', bowl: 'Bowl cut', court_cut: 'Court cut',
        undercut: 'Undercut', topknot: 'Top knot', high_ponytail: 'High ponytail', twin_tails: 'Twin tails', messy: 'Messy', pompadour: 'Pompadour', locs: 'Locs', long_braid: 'Long braid', mullet: 'Mullet', side_swept: 'Side swept' }),
    eyes: slot(
      ['round', 'almond', 'narrow', 'wide', 'sleepy', 'angry', 'dot', 'anime', 'happy', 'wink', 'hollow', 'slit', 'tired', 'glow', 'glow_tear'],
      ['cat', 'doe', 'droopy', 'sharp', 'button', 'sparkle', 'hooded', 'lashes', 'heart'],
      { cat: 'Cat (upswept)', doe: 'Doe (big, lower lashes)', droopy: 'Droopy (downturned)', sharp: 'Sharp (slanted)', button: 'Button (beady)', sparkle: 'Sparkle', hooded: 'Hooded', lashes: 'Long lashes', heart: 'Heart pupils' }),
    brows: slot(
      ['straight', 'arched', 'angry', 'worried', 'thick', 'thin', 'none', 'raised'],
      ['bushy', 'unibrow', 'slanted', 'soft', 'split', 'dots', 'curved'],
      { bushy: 'Bushy', unibrow: 'Unibrow', slanted: 'Slanted', soft: 'Soft short', split: 'Split (scarred)', dots: 'Dots (noble)', curved: 'High curve' }),
    mouth: slot(
      ['smile', 'neutral', 'frown', 'open', 'grin', 'smirk', 'o', 'tongue', 'fangs', 'sad_open', 'stitched', 'tusks'],
      ['laugh', 'cat', 'pout', 'gritted', 'wavy', 'buck', 'fang', 'shark'],
      { laugh: 'Laugh (open)', cat: 'Cat (:3)', pout: 'Pout', gritted: 'Gritted teeth', wavy: 'Nervous (wavy)', buck: 'Buck teeth', fang: 'One fang', shark: 'Shark teeth' }),
    nose: slot(['small', 'dot', 'button', 'long', 'wide', 'hook', 'upturned', 'none', 'snout'], ['pointed', 'round', 'flat'],
      { pointed: 'Pointed', round: 'Round (bulb)', flat: 'Flat (broad)' }),
    ears: slot(['normal', 'pointed', 'big', 'none', 'fins'], ['long_pointed', 'swept', 'notched', 'small', 'cat_ears', 'wolf_ears'],
      { long_pointed: 'Long pointed (high elf)', swept: 'Swept back', notched: 'Notched (torn)', small: 'Small round', cat_ears: 'Cat ears (on top)', wolf_ears: 'Wolf ears (on top)' }),
    facialHair: slot(['none', 'stubble', 'goatee', 'mustache', 'full', 'long', 'chinstrap', 'soul_patch', 'braided_beard'],
      ['mutton_chops', 'handlebar', 'van_dyke', 'short_beard', 'forked_beard', 'sideburns'],
      { mutton_chops: 'Mutton chops', handlebar: 'Handlebar moustache', van_dyke: 'Van Dyke', short_beard: 'Short beard', forked_beard: 'Forked beard', sideburns: 'Sideburns' }),
    extras: slot(['none', 'freckles', 'freckles_heavy', 'blush', 'scar', 'scar_cheek', 'nose_scar', 'burn_scar', 'warpaint', 'cheek_stripes', 'eye_black', 'tattoo', 'face_glyphs', 'paint_dots', 'third_eye', 'wrinkles', 'soot', 'dirt', 'mud', 'blood', 'brand', 'undead_skin'],
      ['freckles_nose', 'beauty_mark', 'scar_brow', 'scar_lip', 'war_mask', 'chin_lines', 'tear_mark', 'star_mark', 'moon_mark', 'blush_soft'],
      { freckles_nose: 'Freckles over the nose', beauty_mark: 'Beauty mark', scar_brow: 'Scar through the brow', scar_lip: 'Scar on the lip', war_mask: 'War paint (band over the eyes)', chin_lines: 'Chin tattoo lines', tear_mark: 'Tear mark', star_mark: 'Star mark', moon_mark: 'Moon mark', blush_soft: 'Soft blush' }),
  },
  /** Extra fields on a slot that 2.5 reads (fields survive the shared normaliser, so they need no registration). */
  fields: {
    eyes: {
      pupil: { ids: ['round', 'slit', 'dot', 'star', 'heart', 'cross', 'ring', 'none'], default: 'round', names: { round: 'Round', slit: 'Slit', dot: 'Small dot', star: 'Star', heart: 'Heart', cross: 'Cross', ring: 'Ring', none: 'None (all iris)' } },
      iris: { ids: ['normal', 'large', 'small', 'ring', 'none'], default: 'normal', names: { normal: 'Normal', large: 'Large', small: 'Small', ring: 'Ringed', none: 'None (pupil only)' } },
      white: { type: 'color', default: '#fff8e8' },
      colorR: { type: 'color', default: null, note: 'right eye colour (odd eyes); unset = same as color' },
      blink: { type: 'boolean', default: true, note: 'false = never blinks (a statue, a construct)' },
    },
    brows: { thick: { type: 'range', min: 0.5, max: 1.8, default: 1 }, color: { type: 'color', default: null, note: 'unset = hair colour' } },
    mouth: { color: { type: 'color', default: '#b5484d' } },
    ears: { scale: { type: 'range', min: 0.6, max: 1.6, default: 1 } },
    facialHair: { color: { type: 'color', default: null, note: 'unset = hair colour' } },
    hair: { color2: { type: 'color', default: null, note: 'streak / tip colour for twin tails, locs, long braid; unset = a lighter hair colour' } },
  },
  /** Ear shapes that suit each race (best first) — what a builder offers first when the race changes. */
  raceEars: {
    human: ['normal', 'small', 'big'], elf: ['pointed', 'long_pointed', 'swept'], dwarf: ['normal', 'big', 'small'],
    orc: ['notched', 'pointed', 'big'], giant: ['normal', 'big', 'notched'], goblin: ['big', 'swept', 'notched', 'pointed'],
    halfling: ['pointed', 'small', 'normal'], undead: ['notched', 'normal', 'none'], beast: ['wolf_ears', 'cat_ears', 'pointed'],
  },
};

/** Every 2.5-only id, by slot (what chibi2-parts.js registers). */
export const CHIBI25_ADDED = Object.fromEntries(Object.entries(CHIBI25_OPTIONS.face).map(([s, o]) => [s, o.added]));

// ---------------------------------------------------------------- part B: the BODY options (shapes, postures, sliders,
// tails, the new clothes) — the tables live in chibi25-body-options.js; listed here so a game has one place to look.
import { CHIBI25_BODY_OPTIONS } from './chibi25-body-options.js';
CHIBI25_OPTIONS.body = CHIBI25_BODY_OPTIONS;
