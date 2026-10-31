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
  // modern everyday clothes (Oddhaven, 2026-10-30): same vocabulary, so no new geometry and no other game's look moves
  polo: { sleeve: 'short', collar: 'round', front: 'buttons', hem: 'none', name: 'Polo shirt', alias2d: 'tshirt' },
  button_shirt: { sleeve: 'rolled', collar: 'lapels', front: 'buttons', hem: 'none', name: 'Button shirt', alias2d: 'tshirt' },
  blazer: { sleeve: 'long', collar: 'lapels', front: 'open', hem: 'short', belt: 'none', shirt: true, cuffs: 'cuff', name: 'Blazer', alias2d: 'open_coat' },
  blouse: { sleeve: 'puff', collar: 'v', front: 'buttons', hem: 'none', name: 'Blouse', alias2d: 'tshirt' },
  sweater: { sleeve: 'long', collar: 'round', front: 'none', hem: 'none', cuffs: 'cuff', name: 'Sweater', alias2d: 'hoodie' },
  cardigan: { sleeve: 'long', collar: 'v', front: 'buttons', hem: 'short', belt: 'none', cuffs: 'cuff', name: 'Cardigan', alias2d: 'vest' },
  overalls: { sleeve: 'short', collar: 'round', front: 'apron', hem: 'none', shirt: true, under: true, name: 'Overalls', alias2d: 'apron' },
  // Oddhaven M4, modern clothes batch 1: work clothes. `front: 'hivis'` is a new branch in chibi2-body.js that only these ids reach; color2 = the silver tape
  hi_vis_vest: { sleeve: 'rolled', collar: 'v', front: 'hivis', hem: 'none', shirt: true, name: 'Hi-vis vest', alias2d: 'vest' },
  hi_vis_jacket: { sleeve: 'long', collar: 'high', front: 'hivis', hem: 'none', cuffs: 'cuff', name: 'Hi-vis jacket', alias2d: 'hoodie' },
  work_shirt: { sleeve: 'rolled', collar: 'lapels', front: 'buttons', hem: 'none', name: 'Work shirt', alias2d: 'tshirt' },
  coveralls: { sleeve: 'long', collar: 'lapels', front: 'seam', hem: 'none', belt: 'plain', cuffs: 'cuff', name: 'Coveralls', alias2d: 'hoodie' },
  scrubs: { sleeve: 'short', collar: 'v', front: 'pocket', hem: 'none', name: 'Scrubs', alias2d: 'tshirt' },
  chef_jacket: { sleeve: 'long', collar: 'high', front: 'buttons', hem: 'none', cuffs: 'cuff', name: 'Chef jacket', alias2d: 'tshirt' },
  shop_apron: { sleeve: 'short', collar: 'round', front: 'apron', hem: 'none', shirt: true, under: true, name: 'Shop apron', alias2d: 'apron' },
  uniform_shirt: { sleeve: 'short', collar: 'lapels', front: 'buttons', hem: 'none', belt: 'wide', name: 'Uniform shirt', alias2d: 'tshirt' },
  turnout_coat: { sleeve: 'long', collar: 'high', front: 'hivis', hem: 'short', belt: 'none', cuffs: 'cuff', name: 'Turnout coat', alias2d: 'open_coat' },
  // Oddhaven M7, modern clothes batch 2. `front: 'tie' | 'zip' | 'stripes' | 'print' | 'sequins'` are new branches in chibi2-body.js that only these ids reach; color2 = the second colour
  // casual
  henley: { sleeve: 'long', collar: 'round', front: 'buttons', hem: 'none', cuffs: 'cuff', name: 'Henley', alias2d: 'tshirt' },
  print_tee: { sleeve: 'short', collar: 'round', front: 'print', hem: 'none', name: 'Printed tee', alias2d: 'tshirt' },
  flannel_shirt: { sleeve: 'rolled', collar: 'lapels', front: 'quilt', hem: 'none', name: 'Flannel shirt', alias2d: 'tshirt' },
  denim_jacket: { sleeve: 'long', collar: 'lapels', front: 'open', hem: 'none', belt: 'none', cuffs: 'cuff', name: 'Denim jacket', alias2d: 'open_coat' },
  bomber_jacket: { sleeve: 'long', collar: 'high', front: 'zip', hem: 'none', cuffs: 'cuff', name: 'Bomber jacket', alias2d: 'hoodie' },
  sundress: { sleeve: 'none', collar: 'scoop', front: 'none', hem: 'knee', belt: 'sash', name: 'Sundress', alias2d: 'dress' },
  // smart
  dress_shirt: { sleeve: 'long', collar: 'lapels', front: 'tie', hem: 'none', cuffs: 'cuff', name: 'Shirt and tie', alias2d: 'tshirt' },
  waistcoat: { sleeve: 'long', collar: 'v', front: 'panels', hem: 'none', shirt: true, cuffs: 'cuff', name: 'Waistcoat', alias2d: 'vest' },
  suit_jacket: { sleeve: 'long', collar: 'lapels', front: 'open', hem: 'short', belt: 'none', cuffs: 'cuff', name: 'Suit jacket', alias2d: 'open_coat' },
  turtleneck: { sleeve: 'long', collar: 'high', front: 'none', hem: 'none', cuffs: 'cuff', name: 'Turtleneck', alias2d: 'hoodie' },
  shift_dress: { sleeve: 'short', collar: 'round', front: 'none', hem: 'knee', belt: 'none', name: 'Shift dress', alias2d: 'dress' },
  // sport
  sport_tee: { sleeve: 'short', collar: 'round', front: 'stripes', hem: 'none', name: 'Sports tee', alias2d: 'tshirt' },
  sports_vest: { sleeve: 'none', collar: 'scoop', front: 'stripes', hem: 'none', name: 'Sports vest', alias2d: 'tank' },
  track_jacket: { sleeve: 'long', collar: 'high', front: 'zip', hem: 'none', cuffs: 'cuff', name: 'Track jacket', alias2d: 'hoodie' },
  // swimwear: covered and cartoon, one piece or a vest
  swim_costume: { sleeve: 'none', collar: 'scoop', front: 'stripes', hem: 'none', name: 'Swimming costume', alias2d: 'tank' },
  swim_vest: { sleeve: 'short', collar: 'high', front: 'zip', hem: 'none', name: 'Swim vest', alias2d: 'tshirt' },
  // winter
  parka: { sleeve: 'long', collar: 'hooded', front: 'zip', hem: 'short', belt: 'none', cuffs: 'cuff', name: 'Parka', alias2d: 'hoodie' },
  puffer: { sleeve: 'long', collar: 'high', front: 'quilt', hem: 'none', cuffs: 'cuff', name: 'Puffer jacket', alias2d: 'hoodie' },
  wool_coat: { sleeve: 'long', collar: 'lapels', front: 'buttons', hem: 'coat', belt: 'none', cuffs: 'cuff', name: 'Wool coat', alias2d: 'coat' },
  // party
  party_dress: { sleeve: 'none', collar: 'scoop', front: 'sequins', hem: 'knee', belt: 'sash', name: 'Party dress', alias2d: 'dress' },
  sequin_top: { sleeve: 'short', collar: 'scoop', front: 'sequins', hem: 'none', name: 'Sequin top', alias2d: 'tshirt' },
  velvet_jacket: { sleeve: 'long', collar: 'lapels', front: 'open', hem: 'short', belt: 'none', cuffs: 'cuff', name: 'Velvet jacket', alias2d: 'open_coat' },
  // nightwear
  pyjama_top: { sleeve: 'long', collar: 'lapels', front: 'buttons', hem: 'none', name: 'Pyjama top', alias2d: 'tshirt' },
  nightshirt: { sleeve: 'short', collar: 'round', front: 'buttons', hem: 'knee', belt: 'none', name: 'Nightshirt', alias2d: 'dress' },
  // uniforms
  warden_coat: { sleeve: 'long', collar: 'high', front: 'band', hem: 'coat', belt: 'wide', cuffs: 'bracers', name: 'Warden coat', alias2d: 'coat' },
  police_shirt: { sleeve: 'short', collar: 'lapels', front: 'tie', hem: 'none', belt: 'wide', name: 'Police shirt', alias2d: 'tshirt' },
};

export const BOTTOM25 = {
  long_skirt: { leg: 0, garment: 'skirt', length: 0.86, name: 'Long skirt (to the ankle)', alias2d: 'skirt' },
  pleated_skirt: { leg: 0, belt: true, garment: 'kilt', length: 0.62, name: 'Pleated skirt (below the knee)', alias2d: 'kilt' },
  wide_trousers: { leg: 1, belt: 'sash', loose: true, name: 'Wide trousers', alias2d: 'baggy' },
  jeans: { leg: 1, belt: true, name: 'Jeans', alias2d: 'pants' },
  cargo_pants: { leg: 1, belt: true, loose: true, name: 'Cargo trousers', alias2d: 'baggy' },
  joggers: { leg: 0.94, loose: true, name: 'Joggers', alias2d: 'leggings' },
  pencil_skirt: { leg: 0, belt: true, garment: 'skirt', length: 0.46, name: 'Pencil skirt', alias2d: 'skirt' },
  // Oddhaven M4
  work_trousers: { leg: 1, belt: true, loose: true, name: 'Work trousers', alias2d: 'baggy' },
  scrub_trousers: { leg: 0.96, loose: true, name: 'Scrub trousers', alias2d: 'leggings' },
  // Oddhaven M7
  chinos: { leg: 1, belt: true, name: 'Chinos', alias2d: 'pants' },
  suit_trousers: { leg: 1, belt: true, name: 'Suit trousers', alias2d: 'pants' },
  track_pants: { leg: 0.96, loose: true, name: 'Track pants', alias2d: 'leggings' },
  running_shorts: { leg: 0.24, name: 'Running shorts', alias2d: 'shorts' },
  midi_skirt: { leg: 0, belt: true, garment: 'skirt', length: 0.62, name: 'Midi skirt', alias2d: 'skirt' },
  party_skirt: { leg: 0, garment: 'skirt', length: 0.38, name: 'Party skirt', alias2d: 'skirt' },
  swim_shorts: { leg: 0.3, loose: true, name: 'Swim shorts', alias2d: 'shorts' },
  swim_skirt: { leg: 0, garment: 'skirt', length: 0.3, name: 'Swim skirt', alias2d: 'skirt' },
  snow_trousers: { leg: 1, loose: true, name: 'Snow trousers', alias2d: 'baggy' },
  pyjama_trousers: { leg: 0.96, loose: true, name: 'Pyjama trousers', alias2d: 'leggings' },
};

export const SHOE25 = {
  knee_boots: { shaft: 0.92, foot: 'boot', cuff: true, name: 'Knee boots', alias2d: 'boots' },
  ankle_boots: { shaft: 0.22, foot: 'boot', name: 'Ankle boots', alias2d: 'boots' },
  soft_boots: { shaft: 0.6, foot: 'slipper', name: 'Soft boots (no sole)', alias2d: 'slippers' },
  dress_shoes: { shaft: 0.08, foot: 'pointed', name: 'Dress shoes', alias2d: 'shoes' },
  work_boots: { shaft: 0.34, foot: 'boot', cuff: true, name: 'Work boots', alias2d: 'boots' },
  // Oddhaven M4
  steel_toes: { shaft: 0.3, foot: 'boot', name: 'Steel-toe boots', alias2d: 'boots' },
  kitchen_clogs: { shaft: 0.06, foot: 'pointed', name: 'Kitchen clogs', alias2d: 'shoes' },
  // Oddhaven M7
  trainers: { shaft: 0.1, foot: 'shoe', name: 'Trainers', alias2d: 'shoes' },
  loafers: { shaft: 0.04, foot: 'shoe', name: 'Loafers', alias2d: 'shoes' },
  heels: { shaft: 0.04, foot: 'pointed', name: 'Heels', alias2d: 'shoes' },
  snow_boots: { shaft: 0.6, foot: 'boot', cuff: true, name: 'Snow boots', alias2d: 'boots' },
  flip_flops: { shaft: 0, foot: 'sandal', name: 'Flip-flops', alias2d: 'sandals' },
};

/** Capes built in chibi2-gear.js buildCape for these ids. */
export const CAPE25 = {
  long_cloak: { name: 'Long cloak (to the ankle)', alias2d: 'cape' },
  scarf: { name: 'Scarf', alias2d: 'cape' },
  // 2026-10-21 owner review (B9): more scarves, worn in the back slot OR the accessory slot (ACCESSORY25), built by
  // chibi2-gear.js buildScarf. Not 2.5-only: any body may wear them. 2D: the paper doll's scarf drawing.
  scarf_trailing: { name: 'Trailing scarf (tails down the back)', alias2d: 'scarf', alias2dSlot: 'accessory' },
  scarf_cowl: { name: 'Wool cowl', alias2d: 'scarf', alias2dSlot: 'accessory' },
  scarf_striped: { name: 'Striped scarf', alias2d: 'scarf', alias2dSlot: 'accessory' },
  neckerchief: { name: 'Knotted neckerchief', alias2d: 'scarf', alias2dSlot: 'accessory' },
};

/** The same scarves in the accessory slot (the old accessory 'scarf' is already registered there). */
export const ACCESSORY25 = Object.fromEntries(['scarf_trailing', 'scarf_cowl', 'scarf_striped', 'neckerchief'].map(id => [id, { ...CAPE25[id] }]));

/** Everything above, by slot: what chibi2-parts.js registers and what CHIBI25_OPTIONS.body lists. */
export const OUTFIT25 = { top: TOP25, bottom: BOTTOM25, shoes: SHOE25, cape: CAPE25, accessory: ACCESSORY25 };

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
