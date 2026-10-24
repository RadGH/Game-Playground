// COSTUME CATWALK — the data: wardrobe pieces, colours, theme cards, poses and the judge's rules. A plain module (no
// DOM, no Three.js, no JSON import) so the server's sim, the browser's view and the node tests all read the same list.
//
// A PIECE is one thing from the Chibi 2 part catalog (avatar-2d/js/parts + chibi2-parts.js; every `part` id here is
// checked by tests/costume-catwalk.test.js) with a fair-friendly name and one or two STYLE TAGS. A theme card names the
// two tags it loves; a piece "fits the theme" when it carries one of them. A dealt piece is [pieceIndex, colourIndex]:
// the colour is rolled with it and painted on the part (a pink crown is allowed, and encouraged). Hair dye pieces
// carry their own colour and change only the hair colour.
//
// Indexes are what travel on the wire, so ADD to the end of these lists; never reorder or delete a row mid-season.

export const TAGS = {
  fancy: 'Fancy', spooky: 'Spooky', wild: 'Wild', cosy: 'Cosy', magic: 'Magic', mighty: 'Mighty', sunny: 'Sunny', silly: 'Silly',
};
/** The wardrobe slots in the order the phone shows them, with how many options each tray deals. `to` = avatar slot. */
export const SLOTS = [
  { id: 'hat', name: 'Hat', deal: 3 },
  { id: 'top', name: 'Top', deal: 3 },
  { id: 'bottom', name: 'Legs', deal: 3 },
  { id: 'shoes', name: 'Feet', deal: 3 },
  { id: 'cape', name: 'Cape', deal: 2 },
  { id: 'prop', name: 'Prop', deal: 3 },
  { id: 'acc', name: 'Extra', deal: 2 },
  { id: 'hair', name: 'Hair dye', deal: 3 },
];
export const SLOT_IDS = SLOTS.map(s => s.id);

const P = (slot, to, part, name, tags) => ({ slot, to, part, name, tags });
export const PIECES = [
  // hats
  P('hat', 'hat', 'crown', 'Tin Crown', ['fancy', 'mighty']),
  P('hat', 'hat', 'top_hat', 'Tall Top Hat', ['fancy', 'spooky']),
  P('hat', 'hat', 'wizard', 'Pointy Wizard Hat', ['magic', 'silly']),
  P('hat', 'hat', 'straw', 'Straw Sunhat', ['sunny', 'cosy']),
  P('hat', 'hat', 'flower', 'Daisy Clip', ['sunny', 'wild']),
  P('hat', 'hat', 'tricorn', "Captain's Tricorn", ['mighty', 'silly']),
  P('hat', 'hat', 'horned_helm', 'Horned Helmet', ['mighty', 'wild']),
  P('hat', 'hat', 'hood', 'Deep Hood', ['spooky', 'cosy']),
  P('hat', 'hat', 'bandana', 'Bandana', ['sunny', 'wild']),
  P('hat', 'hat', 'cap', 'Ball Cap', ['sunny', 'silly']),
  P('hat', 'hat', 'circlet', 'Silver Circlet', ['fancy', 'magic']),
  P('hat', 'hat', 'feather_band', 'Feather Band', ['wild', 'fancy']),
  P('hat', 'hat', 'wide_brim', 'Witchy Wide Brim', ['spooky', 'magic']),
  P('hat', 'hat', 'wolf_helm', 'Wolf Hood', ['wild', 'spooky']),
  P('hat', 'hat', 'great_helm', 'Bucket Helm', ['mighty', 'silly']),
  P('hat', 'hat', 'headband', 'Sweatband', ['sunny', 'silly']),
  P('hat', 'hat', 'leather_cap', 'Flying Cap', ['cosy', 'mighty']),
  // tops
  P('top', 'top', 'dress', 'Ball Gown', ['fancy', 'sunny']),
  P('top', 'top', 'doublet', 'Puffy Doublet', ['fancy', 'silly']),
  P('top', 'top', 'silks', 'Swishy Silks', ['fancy', 'magic']),
  P('top', 'top', 'robe', 'Long Robe', ['magic', 'cosy']),
  P('top', 'top', 'trim_robe', 'Starry Robe', ['magic', 'fancy']),
  P('top', 'top', 'hoodie', 'Comfy Hoodie', ['cosy', 'silly']),
  P('top', 'top', 'tshirt', 'Fair T-shirt', ['sunny', 'silly']),
  P('top', 'top', 'tank', 'Muscle Vest', ['sunny', 'mighty']),
  P('top', 'top', 'plate', 'Shiny Plate', ['mighty', 'fancy']),
  P('top', 'top', 'chainmail', 'Clinky Chainmail', ['mighty', 'spooky']),
  P('top', 'top', 'rags', 'Raggedy Rags', ['spooky', 'wild']),
  P('top', 'top', 'fur_tunic', 'Fur Tunic', ['wild', 'cosy']),
  P('top', 'top', 'apron', "Baker's Apron", ['cosy', 'silly']),
  P('top', 'top', 'coat', 'Long Dark Coat', ['spooky', 'fancy']),
  P('top', 'top', 'gi', 'Wrap Jacket', ['mighty', 'sunny']),
  P('top', 'top', 'leather', 'Leather Jerkin', ['wild', 'mighty']),
  P('top', 'top', 'vest', 'Waistcoat', ['fancy', 'cosy']),
  P('top', 'top', 'wraps', 'Mummy Wraps', ['spooky', 'silly']),
  // legs
  P('bottom', 'bottom', 'skirt', 'Twirly Skirt', ['fancy', 'sunny']),
  P('bottom', 'bottom', 'kilt', 'Kilt', ['wild', 'silly']),
  P('bottom', 'bottom', 'shorts', 'Short Shorts', ['sunny', 'silly']),
  P('bottom', 'bottom', 'pants', 'Plain Trousers', ['cosy']),
  P('bottom', 'bottom', 'baggy', 'Baggy Trousers', ['silly', 'cosy']),
  P('bottom', 'bottom', 'breeches', 'Breeches and Stockings', ['fancy']),
  P('bottom', 'bottom', 'leggings', 'Leggings', ['magic', 'sunny']),
  P('bottom', 'bottom', 'greaves', 'Armoured Legs', ['mighty']),
  P('bottom', 'bottom', 'loincloth', 'Loincloth', ['wild', 'silly']),
  P('bottom', 'bottom', 'ragged', 'Torn Trousers', ['spooky', 'wild']),
  // feet
  P('shoes', 'shoes', 'pointed', 'Curly-toe Shoes', ['magic', 'fancy']),
  P('shoes', 'shoes', 'slippers', 'Slippers', ['cosy', 'silly']),
  P('shoes', 'shoes', 'sandals', 'Sandals', ['sunny']),
  P('shoes', 'shoes', 'barefoot', 'Bare Feet', ['wild', 'sunny']),
  P('shoes', 'shoes', 'boots', 'Boots', ['mighty', 'wild']),
  P('shoes', 'shoes', 'heavy', 'Stompy Boots', ['mighty', 'spooky']),
  P('shoes', 'shoes', 'sneakers', 'Sneakers', ['sunny', 'silly']),
  P('shoes', 'shoes', 'shoes', 'Polished Shoes', ['fancy']),
  P('shoes', 'shoes', 'wraps', 'Foot Wraps', ['spooky', 'wild']),
  P('shoes', 'shoes', 'hooves', 'Pretend Hooves', ['silly', 'wild']),
  // capes
  P('cape', 'cape', 'cape', 'Grand Cape', ['fancy', 'mighty']),
  P('cape', 'cape', 'shoulder_cape', 'Shoulder Cape', ['fancy']),
  P('cape', 'cape', 'half_cape', 'One-shoulder Cape', ['mighty']),
  P('cape', 'cape', 'fur_mantle', 'Fur Mantle', ['wild', 'cosy']),
  P('cape', 'cape', 'feather_mantle', 'Feather Mantle', ['wild', 'magic']),
  P('cape', 'cape', 'shawl', 'Sheer Shawl', ['cosy', 'fancy']),
  P('cape', 'cape', 'tattered_cape', 'Tattered Cape', ['spooky']),
  P('cape', 'cape', 'travel_cloak', 'Travel Cloak', ['cosy', 'wild']),
  // props (right hand = held, left hand = offhand)
  P('prop', 'held', 'fh_scepter', 'Royal Sceptre', ['fancy', 'mighty']),
  P('prop', 'held', 'staff_crook', "Shepherd's Crook", ['wild', 'cosy']),
  P('prop', 'held', 'staff_orb', 'Orb Staff', ['magic']),
  P('prop', 'held', 'staff_crystal', 'Crystal Staff', ['magic', 'fancy']),
  P('prop', 'held', 'staff_skull', 'Skull Staff', ['spooky', 'magic']),
  P('prop', 'held', 'bow', 'Longbow', ['wild']),
  P('prop', 'held', 'fh_spear', 'Parade Spear', ['mighty']),
  P('prop', 'held', 'fh_hammer', 'Squeaky Mallet', ['silly', 'mighty']),
  P('prop', 'offhand', 'torch', 'Torch', ['spooky']),
  P('prop', 'offhand', 'map', 'Holiday Map', ['sunny']),
  P('prop', 'offhand', 'round_shield', 'Round Shield', ['mighty']),
  P('prop', 'offhand', 'tv_totem', 'Little Totem', ['spooky', 'wild']),
  P('prop', 'offhand', 'tv_ward', 'Glowing Focus', ['magic']),
  // extras (face and neck)
  P('acc', 'accessory', 'sunglasses', 'Sunglasses', ['sunny', 'fancy']),
  P('acc', 'accessory', 'monocle', 'Monocle', ['fancy']),
  P('acc', 'accessory', 'eyepatch', 'Eyepatch', ['mighty', 'silly']),
  P('acc', 'accessory', 'round_glasses', 'Round Glasses', ['cosy', 'magic']),
  P('acc', 'accessory', 'goggles', 'Goggles', ['silly']),
  P('acc', 'accessory', 'scarf', 'Big Scarf', ['cosy']),
  P('acc', 'accessory', 'pendant', 'Lucky Pendant', ['magic']),
  P('acc', 'accessory', 'earrings', 'Earrings', ['fancy']),
  P('acc', 'accessory', 'mask', 'Masquerade Mask', ['spooky', 'fancy']),
  P('acc', 'accessory', 'blindfold', 'Blindfold', ['spooky']),
  // hair dye (colour only; `part` = the dye colour)
  P('hair', 'hair', '#ff7ab6', 'Bubblegum Pink', ['silly']),
  P('hair', 'hair', '#4a7dff', 'Wizard Blue', ['magic']),
  P('hair', 'hair', '#3fae4a', 'Moss Green', ['wild']),
  P('hair', 'hair', '#eef2f4', 'Ghost White', ['spooky']),
  P('hair', 'hair', '#f2c033', 'Golden', ['fancy']),
  P('hair', 'hair', '#c8281e', 'Fire Red', ['mighty']),
  P('hair', 'hair', '#ff9a1f', 'Sunset Orange', ['sunny']),
  P('hair', 'hair', '#7a4a2a', 'Cocoa Brown', ['cosy']),
  // ---- round 12: more of everything (added at the end, so the indexes above never move)
  P('hat', 'hat', 'pumpkin_head', 'Pumpkin Head', ['spooky', 'silly']),
  P('hat', 'hat', 'witch_hat', 'Witch Hat', ['spooky', 'magic']),
  P('hat', 'hat', 'candy_corn_hat', 'Candy Corn Cap', ['silly', 'sunny']),
  P('hat', 'hat', 'toadstool_cap', 'Toadstool Cap', ['wild', 'silly']),
  P('hat', 'hat', 'ghost_sheet', 'Bedsheet Ghost', ['spooky', 'silly']),
  P('hat', 'hat', 'bolt_crown', 'Lightning Crown', ['magic', 'mighty']),
  P('hat', 'hat', 'dragon_helm', 'Dragon Helm', ['mighty', 'wild']),
  P('hat', 'hat', 'feather_cap', 'Feathered Cap', ['fancy', 'silly']),
  P('hat', 'hat', 'goggles_up', 'Aviator Goggles', ['silly', 'mighty']),
  P('hat', 'hat', 'bone_headdress', 'Bone Headdress', ['spooky', 'wild']),
  P('top', 'top', 'gown', 'Sparkly Gown', ['fancy', 'magic']),
  P('top', 'top', 'bodice_dress', 'Bodice Dress', ['fancy', 'cosy']),
  P('top', 'top', 'duster', 'Dusty Duster', ['wild', 'sunny']),
  P('top', 'top', 'surcoat', 'Knightly Surcoat', ['mighty', 'fancy']),
  P('top', 'top', 'trench', 'Detective Trench', ['spooky', 'cosy']),
  P('top', 'top', 'smith_apron', 'Smithy Apron', ['mighty', 'cosy']),
  P('top', 'top', 'sash_robe', 'Sash Robe', ['magic', 'sunny']),
  P('top', 'top', 'high_collar_robe', 'High-collar Robe', ['spooky', 'magic']),
  P('top', 'top', 'cassock', 'Choir Robe', ['cosy', 'fancy']),
  P('top', 'top', 'harness', 'Strappy Harness', ['wild', 'mighty']),
  P('bottom', 'bottom', 'long_skirt', 'Long Skirt', ['fancy', 'cosy']),
  P('bottom', 'bottom', 'pleated_skirt', 'Pleated Skirt', ['silly', 'fancy']),
  P('bottom', 'bottom', 'wide_trousers', 'Wide Trousers', ['magic', 'cosy']),
  P('bottom', 'bottom', 'g5_leather_chaps', 'Cowpoke Chaps', ['wild', 'sunny']),
  P('shoes', 'shoes', 'knee_boots', 'Knee Boots', ['fancy', 'mighty']),
  P('shoes', 'shoes', 'ankle_boots', 'Ankle Boots', ['cosy', 'wild']),
  P('shoes', 'shoes', 'soft_boots', 'Soft Boots', ['cosy', 'magic']),
  P('shoes', 'shoes', 'g5_cloth_curltoes', 'Jester Curl-toes', ['silly', 'magic']),
  P('cape', 'cape', 'long_cloak', 'Long Cloak', ['spooky', 'magic']),
  P('cape', 'cape', 'scarf_striped', 'Striped Scarf', ['cosy', 'silly']),
  P('cape', 'cape', 'neckerchief', 'Neckerchief', ['sunny', 'wild']),
  P('cape', 'cape', 'g5_pack_explorer', 'Explorer Pack', ['wild', 'sunny']),
  P('prop', 'held', 'lute', 'Lute', ['fancy', 'sunny']),
  P('prop', 'held', 'book', 'Spell Book', ['magic', 'cosy']),
  P('prop', 'held', 'hourglass', 'Hourglass', ['magic', 'spooky']),
  P('prop', 'held', 'flame', 'Handful of Fire', ['magic', 'mighty']),
  P('prop', 'held', 'fh_wand', 'Wand', ['magic', 'silly']),
  P('prop', 'held', 'g5_wand_bell', 'Bell Wand', ['silly', 'magic']),
  P('prop', 'held', 'quarterstaff', 'Walking Stick', ['cosy', 'wild']),
  P('prop', 'held', 'g5_harpoon', 'Fishing Harpoon', ['wild', 'sunny']),
  P('prop', 'offhand', 'buckler', 'Tiny Buckler', ['silly', 'mighty']),
  P('prop', 'offhand', 'g5_cresset', 'Fire Basket', ['spooky', 'mighty']),
  P('prop', 'offhand', 'g5_starglass', 'Star Glass', ['magic', 'fancy']),
  P('prop', 'offhand', 'g5_folio', 'Sketch Folio', ['cosy', 'fancy']),
  P('prop', 'offhand', 'g5_seeingmask', 'Mask on a Stick', ['spooky', 'silly']),
  P('acc', 'accessory', 'glasses', 'Specs', ['cosy', 'silly']),
  P('acc', 'accessory', 'nose_ring', 'Nose Ring', ['wild']),
  P('acc', 'accessory', 'pocketwatch', 'Pocket Watch', ['fancy', 'cosy']),
  P('acc', 'accessory', 'bandolier', 'Bandolier', ['mighty', 'wild']),
  P('acc', 'accessory', 'prayer_beads', 'Bead Necklace', ['magic', 'cosy']),
  P('acc', 'accessory', 'crescent', 'Moon Charm', ['magic', 'spooky']),
  P('hair', 'hair', '#9b4fe0', 'Royal Purple', ['fancy', 'magic']),
  P('hair', 'hair', '#1f9a96', 'Mermaid Teal', ['wild']),
  P('hair', 'hair', '#26262e', 'Midnight Black', ['spooky']),
  P('hair', 'hair', '#ffc2de', 'Candyfloss', ['silly', 'sunny']),
];

/** Colours a piece can be dealt in. `name` is always printed next to the swatch (colour is never the only cue). */
export const COLOURS = [
  { name: 'Gold', hex: '#e8b828' },
  { name: 'Royal purple', hex: '#7a3db0' },
  { name: 'Black', hex: '#2a2a32' },
  { name: 'White', hex: '#f0f0ea' },
  { name: 'Moss green', hex: '#4f8a2f' },
  { name: 'Sky blue', hex: '#5ab4ee' },
  { name: 'Sunflower', hex: '#ffd23f' },
  { name: 'Hot pink', hex: '#ff4fa0' },
  { name: 'Tangerine', hex: '#ff8a1f' },
  { name: 'Crimson', hex: '#c22a2a' },
  { name: 'Steel', hex: '#8a96a4' },
  { name: 'Cocoa', hex: '#6a4428' },
  { name: 'Teal', hex: '#1f9a96' },
];

/** Theme cards: what the room is dressing for, and the two style tags that fit it. */
const T = (name, a, b, line) => ({ name, likes: [a, b], line });
export const THEMES = [
  T('Royal Ball', 'fancy', 'mighty', 'Curtsies, crowns and very long capes.'),
  T('Swamp Chic', 'wild', 'spooky', 'Mud is a colour. Frogs are an accessory.'),
  T('Fairground Mascot', 'silly', 'sunny', 'Big, bright and waving at children.'),
  T('Haunted Mansion Butler', 'spooky', 'fancy', 'You rang? Dust, candles and very good manners.'),
  T('Wizard Graduation', 'magic', 'fancy', 'Robes, sparkles and a slightly singed hat.'),
  T('Beach Day', 'sunny', 'silly', 'Sand everywhere. Sunglasses mandatory.'),
  T('Winter Cabin', 'cosy', 'wild', 'Snow outside, cocoa inside, fur on everything.'),
  T('Pirate Captain', 'mighty', 'silly', 'Arr. Boots, a big hat and a lot of shouting.'),
  T('Forest Spirit', 'wild', 'magic', 'Leaves in the hair, glow in the eyes.'),
  T('Knight of the Pie Table', 'mighty', 'cosy', 'Armour, but make it lunch.'),
  T('Midnight Masquerade', 'fancy', 'spooky', 'Nobody knows who you are. Everyone knows you look great.'),
  T('Garden Party', 'sunny', 'fancy', 'Tiny sandwiches and enormous hats.'),
  T('Pyjama Parade', 'cosy', 'silly', 'Slippers on the catwalk. Bed hair is a style.'),
  T('Volcano Explorer', 'mighty', 'wild', 'Heavy boots and fearless faces.'),
  T('Fortune Teller', 'magic', 'spooky', 'Mist, mystery and a crystal ball.'),
  T('Circus Strongman', 'mighty', 'sunny', 'Lift with your legs. Smile with your teeth.'),
  T('Lighthouse Keeper', 'cosy', 'mighty', 'Stormproof, sensible and very brave.'),
  T('Monster Prom', 'spooky', 'silly', 'Fangs out, dance shoes on.'),
  T('Hedge Witch', 'magic', 'wild', 'Herbs in the pockets, cat on the shoulder.'),
  T('Sports Day Champion', 'sunny', 'mighty', 'Sweatbands, sneakers, victory.'),
  T('Rainy Day Reader', 'cosy', 'magic', 'Big scarf, round glasses, a story waiting.'),
  T('Jungle Expedition', 'wild', 'sunny', 'Map in hand, bugs everywhere.'),
  T('Court Jester', 'silly', 'fancy', 'Tell the king a joke he will not forget.'),
  T('Graveyard Gardener', 'spooky', 'cosy', 'Somebody has to water the ghost roses.'),
  T('Space Wizard', 'magic', 'silly', 'Beyond the stars, and slightly lost.'),
  T('Dragon Tamer', 'mighty', 'magic', 'Fireproof everything.'),
  T('Scarecrow Fashion Week', 'silly', 'wild', 'Straw is in this season.'),
  T('Lantern Festival', 'magic', 'sunny', 'Glowing, floating, lovely.'),
  T('Bandit Hideout', 'wild', 'mighty', 'Masks, bandanas and a secret handshake.'),
  T('Opera Night', 'fancy', 'cosy', 'Velvet seats, long gowns and a box of sweets.'),
  T('Ghost Ship Crew', 'spooky', 'mighty', 'They sail at midnight, and they never take off their boots.'),
  T('Toddler Birthday Party', 'silly', 'cosy', 'Cake on every surface.'),
  T('Moonlit Picnic', 'spooky', 'sunny', 'Sunglasses at night, because you are THAT kind of cool.'),
  T('Fancy Farmer', 'fancy', 'wild', 'Top hat in the pig pen.'),
  // round 12
  T('Superhero Sidekick', 'mighty', 'silly', 'Cape on, mask on, snack in the pocket.'),
  T('Mermaid Tea Party', 'magic', 'sunny', 'Shells, sparkles and very small cups.'),
  T('Mad Scientist', 'spooky', 'silly', 'Goggles down, hair up, something is bubbling.'),
  T('Cowpoke Hoedown', 'wild', 'sunny', 'Boots for stomping, hats for waving.'),
  T('Snow Day', 'cosy', 'sunny', 'Scarves, mittens and a snowball behind your back.'),
  T('Royal Gardener', 'fancy', 'wild', 'Prize roses and muddy knees.'),
  T('Night Watch', 'mighty', 'spooky', 'Lantern up, eyes open, cocoa later.'),
  T('Library Ghost', 'spooky', 'cosy', 'Shh. Haunting quietly in the poetry aisle.'),
  T('Rock Star', 'wild', 'fancy', 'Loud boots, louder hair.'),
  T('Desert Nomad', 'sunny', 'mighty', 'Sun on your face, sand in your boots.'),
  T('Fairy Godparent', 'magic', 'cosy', 'A wand, a wish and a warm hug.'),
  T('Duke of Dress-up', 'fancy', 'silly', 'Too many feathers is not a thing.'),
  T('Mountain Hermit', 'wild', 'cosy', 'A long walking stick and a longer story.'),
  T('Thunder Wizard', 'magic', 'mighty', 'Hair standing on end, on purpose.'),
  T('Haunted Carnival', 'spooky', 'sunny', 'Candyfloss at midnight.'),
  T('Toy Soldier Parade', 'mighty', 'fancy', 'Shiny buttons and a perfect march.'),
];

/** How each runway model may finish their walk (Chibi 2 emote clips). */
export const POSES = [
  { id: 'cheer', name: 'Big cheer' },
  { id: 'bowGreet', name: 'Fancy bow' },
  { id: 'dance', name: 'Little dance' },
  { id: 'salute', name: 'Salute' },
  { id: 'crossArms', name: 'Too cool' },
  { id: 'point', name: 'Point at the crowd' },
  { id: 'laugh', name: 'Laugh it off' },
  { id: 'clap', name: 'Clap for yourself' },
];

export const RACES = ['human', 'elf', 'dwarf', 'halfling'];

/** The plain clothes a model wears in every slot nobody filled. */
export const PLAIN = {
  hat: { id: 'none' }, top: { id: 'tshirt', color: '#c9ccd2', color2: '#ffffff' }, bottom: { id: 'pants', color: '#8a8f99' },
  shoes: { id: 'shoes', color: '#5a5f68' }, cape: { id: 'none' }, held: { id: 'none' }, offhand: { id: 'none' }, accessory: { id: 'none' },
};

/** The judge's ribbon rules. Bigger score is better; ties go to whoever finished first. */
export const JUDGE_RULES = [
  { id: 'theme', text: 'the most pieces that fit the theme' },
  { id: 'match', text: 'the most pieces in one colour' },
  { id: 'rainbow', text: 'the most different colours' },
];

/** The dealt pieces actually worn: tray + outfit (slot -> option index or -1) -> list of [pieceIndex, colourIndex]. */
export function worn(tray, outfit) {
  const out = [];
  for (const s of SLOT_IDS) { const i = outfit?.[s]; if (Number.isInteger(i) && i >= 0 && tray?.[s]?.[i]) out.push(tray[s][i]); }
  return out;
}
const fits = (theme, pi) => PIECES[pi].tags.some(t => theme.likes.includes(t));
/** Pieces worn that fit the theme. */
export const themeFit = (theme, list) => list.filter(([p]) => fits(theme, p)).length;
/** Colours of the clothing pieces (hair dye carries its own colour and is left out). */
const colourList = list => list.filter(([p]) => PIECES[p].slot !== 'hair').map(([, c]) => c);
/** The biggest group of pieces sharing one colour. */
export function colourMatch(list) { const n = new Map(); for (const c of colourList(list)) n.set(c, (n.get(c) || 0) + 1); return Math.max(0, ...n.values()); }
export const colourCount = list => new Set(colourList(list)).size;
/** A judge rule's score for a worn list. */
export function judgeScore(rule, theme, list) {
  if (rule === 'theme') return themeFit(theme, list);
  if (rule === 'match') return colourMatch(list);
  return colourCount(list);
}
/** Solo practice score, printed on the screen: 1 a piece that fits the theme, +2 when three or more share a colour. */
export const soloScore = (theme, list) => themeFit(theme, list) + (colourMatch(list) >= 3 ? 2 : 0);

/**
 * The full avatar a runway model wears: `base` (the model's own body/face from avatars.js avatarOf) with the plain
 * clothes, then every worn piece laid over it. Pure: no DOM, no Three.js, returns a NEW object.
 */
export function dressedAvatar(base, list) {
  const av = JSON.parse(JSON.stringify(base || {}));
  for (const [k, v] of Object.entries(PLAIN)) av[k] = { ...v };
  av.decor = { id: 'none' };
  for (const [p, c] of list) {
    const pc = PIECES[p], hex = COLOURS[c]?.hex || '#cccccc';
    if (!pc) continue;
    if (pc.to === 'hair') { av.hair = { ...(av.hair || { id: 'short' }), color: pc.part }; continue; }
    av[pc.to] = { id: pc.part, color: hex, ...(pc.to === 'top' ? { color2: '#ffffff' } : {}) };
  }
  // a two-handed prop in the right hand leaves the left hand empty; a left-hand prop is fine alone
  return av;
}
