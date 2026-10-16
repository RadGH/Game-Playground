// Chibi 2.5 (part B): new clothes, written in the same vocabulary as chibi2-body.js's TOP_STYLES / BOTTOM_STYLES /
// SHOE_STYLES (sleeve, collar, front, hem, belt, armor, cuffs — see the comment on TOP_STYLES), so they need no new
// geometry of their own. Pure data, no Three.js. The 2D paper doll draws each one's nearest kin (`alias2d`), registered
// in avatar-2d/js/parts/chibi2-parts.js with `bespoke: true` so no seeded random roll ever hands one out.
//
// They are NEW ids: no existing look names them, so every game builds exactly what it built before. Any body may
// wear them (v2 or 2.5) — but only a 2.5 body gets the skirt bones that keep a long hem off the feet, so a game that
// offers the long ones should offer them on 2.5 bodies.

export const TOP25 = {
  cassock: { sleeve: 'long', collar: 'high', front: 'buttons', hem: 'long', belt: 'sash', cuffs: 'cuff', name: 'Cassock (buttoned, floor length)', alias2d: 'high_collar_robe' },
  gown: { sleeve: 'puff', collar: 'round', front: 'band', hem: 'long', belt: 'sash', name: 'Gown (floor length)', alias2d: 'dress' },
  bodice_dress: { sleeve: 'none', collar: 'scoop', front: 'laces', hem: 'long', belt: 'sash', name: 'Laced bodice dress (sleeveless)', alias2d: 'dress' },
  hauberk: { sleeve: 'mail', collar: 'round', front: 'none', hem: 'knee', belt: 'wide', armor: 'mail', name: 'Mail hauberk (to the knee)', alias2d: 'chainmail' },
  duster: { sleeve: 'long', collar: 'lapels', front: 'open', hem: 'trench', belt: 'none', shirt: true, cuffs: 'cuff', name: 'Open duster coat', alias2d: 'open_coat' },
  brigandine: { sleeve: 'long', collar: 'high', front: 'quilt', hem: 'mail', belt: 'wide', armor: 'scale', cuffs: 'bracers', name: 'Brigandine (studded plates)', alias2d: 'scale_plate' },
};

export const BOTTOM25 = {
  long_skirt: { leg: 0, garment: 'skirt', length: 0.86, name: 'Long skirt (to the ankle)', alias2d: 'skirt' },
  pleated_skirt: { leg: 0, belt: true, garment: 'kilt', length: 0.62, name: 'Pleated skirt (below the knee)', alias2d: 'kilt' },
  wide_trousers: { leg: 1, belt: 'sash', loose: true, name: 'Wide trousers', alias2d: 'baggy' },
};

export const SHOE25 = {
  knee_boots: { shaft: 0.92, foot: 'boot', cuff: true, name: 'Knee boots', alias2d: 'boots' },
  ankle_boots: { shaft: 0.22, foot: 'boot', name: 'Ankle boots', alias2d: 'boots' },
  soft_boots: { shaft: 0.6, foot: 'slipper', name: 'Soft boots (no sole)', alias2d: 'slippers' },
};

/** Capes built in chibi2-gear.js buildCape for these ids. */
export const CAPE25 = {
  long_cloak: { name: 'Long cloak (to the ankle)', alias2d: 'cape' },
  scarf: { name: 'Scarf', alias2d: 'cape' },
};

/** Everything above, by slot: what chibi2-parts.js registers and what CHIBI25_OPTIONS.body lists. */
export const OUTFIT25 = { top: TOP25, bottom: BOTTOM25, shoes: SHOE25, cape: CAPE25 };

/** One outfit per long garment, for the robe test (tests/chibi25-robe.test.js) and the body sheet's robe strip. */
export const ROBE_LOOKS = {
  robe: { top: { id: 'robe', color: '#4a3a8a' }, bottom: { id: 'pants', color: '#2a2a3a' }, shoes: { id: 'boots', color: '#3a2a1a' } },
  trim_robe: { top: { id: 'trim_robe', color: '#7a2a2a' }, bottom: { id: 'pants', color: '#2a2a3a' }, shoes: { id: 'slippers', color: '#3a2a1a' } },
  cassock: { top: { id: 'cassock', color: '#202028' }, bottom: { id: 'pants', color: '#2a2a3a' }, shoes: { id: 'shoes', color: '#222' } },
  dress: { top: { id: 'dress', color: '#a84a6a' }, bottom: { id: 'leggings', color: '#2a2a3a' }, shoes: { id: 'shoes', color: '#3a2a1a' } },
  surcoat: { top: { id: 'surcoat', color: '#7a8088', color2: '#2a4a8a' }, bottom: { id: 'greaves', color: '#8a8a90' }, shoes: { id: 'heavy', color: '#666' } },
  trench: { top: { id: 'trench', color: '#5a4a3a' }, bottom: { id: 'pants', color: '#2a2a3a' }, shoes: { id: 'boots', color: '#3a2a1a' } },
  coat: { top: { id: 'coat', color: '#3a4a5a' }, bottom: { id: 'pants', color: '#2a2a3a' }, shoes: { id: 'boots', color: '#3a2a1a' } },
  skirt: { top: { id: 'tunic', color: '#6a8a4a' }, bottom: { id: 'skirt', color: '#4a2a5a' }, shoes: { id: 'boots', color: '#3a2a1a' } },
  long_skirt: { top: { id: 'tunic', color: '#6a8a4a' }, bottom: { id: 'long_skirt', color: '#4a2a5a' }, shoes: { id: 'shoes', color: '#3a2a1a' } },
  kilt: { top: { id: 'tunic', color: '#6a8a4a' }, bottom: { id: 'kilt', color: '#2a5a3a' }, shoes: { id: 'boots', color: '#3a2a1a' } },
  loincloth: { top: { id: 'harness', color: '#5a3a2a' }, bottom: { id: 'loincloth', color: '#7a5a3a' }, shoes: { id: 'barefoot', color: '#3a2a1a' } },
  cape: { top: { id: 'tunic', color: '#6a6a7a' }, bottom: { id: 'pants', color: '#2a2a3a' }, shoes: { id: 'boots', color: '#3a2a1a' }, cape: { id: 'cape', color: '#8a2a2a' } },
  travel_cloak: { top: { id: 'tunic', color: '#6a6a7a' }, bottom: { id: 'pants', color: '#2a2a3a' }, shoes: { id: 'boots', color: '#3a2a1a' }, cape: { id: 'travel_cloak', color: '#4a5a3a' } },
  tattered_cape: { top: { id: 'rags', color: '#6a6a5a' }, bottom: { id: 'ragged', color: '#4a4a3a' }, shoes: { id: 'wraps', color: '#7a6a5a' }, cape: { id: 'tattered_cape', color: '#3a3a3a' } },
  long_cloak: { top: { id: 'tunic', color: '#6a6a7a' }, bottom: { id: 'pants', color: '#2a2a3a' }, shoes: { id: 'boots', color: '#3a2a1a' }, cape: { id: 'long_cloak', color: '#2a3a5a' } },
};
