// Builds one designed look per Emberveil enemy, boss, class pet, hireable companion and named hire, and files them
// in the shared character library. Re-run after editing the tables below:  node tools/build-emberveil-enemies.mjs
//
// Writes:
//   prototypes/emberveil/data/enemy-looks.json  { enemies, bosses, pets, companions, hires } — read by the prototype
//   library/data/defaults.json                  enemy_<id> (kind 'enemy') + companion_<id> (kind 'npc') entries
//
// Size rule (the game stage does not rescale bodies): ordinary creatures land about 1-2 m tall, bosses about 2.5-3.5 m.
// Type base heights are in avatar-3d/js/creature-types.js — a titan is 2.6 m at size 1, a wolf 0.9 m.
// A look is either { avatar } (humanoid, drawn by avatar-2d parts and the Mii 3D body) or { creature } (a procedural
// 3D body from avatar-3d/js/creature-types.js). Both carry name, desc, voiceRole, traits.
import fs from 'node:fs';
import { CREATURE_TYPES, normalizeCreature } from '../avatar-3d/js/creature-types.js';
import { normalizeAvatar } from '../avatar-2d/js/render.js';
import { voiceFor } from '../shared/voices.js';

const root = new URL('../', import.meta.url).pathname;
const J = p => JSON.parse(fs.readFileSync(root + p, 'utf8'));
const W = (p, o) => fs.writeFileSync(root + p, JSON.stringify(o, null, 1));

/** Full avatar JSON from a short spec. Every slot id must exist in avatar-2d/js/parts/*.js (incl. gear.js). */
const AV = o => ({
  body: { height: o.h ?? 0.7, width: o.w ?? 0.6, headSize: o.head ?? 0.5, skin: o.skin || '#c68642' },
  headShape: o.shape || 'round',
  hair: { id: o.hair?.[0] || 'bald', color: o.hair?.[1] || '#111111' },
  eyes: { id: o.eyes?.[0] || 'angry', color: o.eyes?.[1] || '#c33333', x: 0, y: o.eyeY ?? 0, scale: o.eyeScale ?? 1, rot: 0 },
  brows: { id: o.brows || 'angry', y: 0, rot: 0, x: 0 },
  nose: { id: o.nose || 'wide', y: 0, scale: 1 },
  mouth: { id: o.mouth || 'frown', y: 0, scale: 1, color: o.mouthColor || '#7a2a2a' },
  ears: { id: o.ears || 'normal' },
  facialHair: { id: o.beard || 'none' },
  top: { id: o.top[0], color: o.top[1], color2: o.top[2] || '#555555' },
  bottom: { id: o.bottom?.[0] || 'pants', color: o.bottom?.[1] || '#2a2018' },
  shoes: { id: o.shoes?.[0] || 'boots', color: o.shoes?.[1] || '#2a2018' },
  accessory: o.acc ? { id: o.acc[0], color: o.acc[1] } : { id: 'none', color: '#333333' },
  hat: o.hat ? { id: o.hat[0], color: o.hat[1] } : { id: 'none', color: '#333333' },
  extras: o.marks ? { id: o.marks[0], color: o.marks[1] } : { id: 'none', color: '#8a2e2e' },
  cape: o.cape ? { id: o.cape[0], color: o.cape[1] } : { id: 'none', color: '#333333' },
  held: o.held ? { id: o.held[0], color: o.held[1] } : { id: 'none', color: '#888888' },
  offhand: o.off ? { id: o.off[0], color: o.off[1] } : { id: 'none', color: '#888888' },
});
/** Creature spec: type + size + colour/feature overrides on top of the type defaults. */
const CR = (type, size, colors = {}, features = {}) => ({ type, size, colors, features, seed: 1 });

// ------------------------------------------------------------------ enemies (data/enemies.json entities)
const ENEMIES = {
  // --- goblins: green skin, big ears, hooked noses, scavenged kit
  goblin_scout: { race: 'goblin', voice: 'goblin', gender: 'n', traits: ['coward', 'greedy'], desc: 'Runs ahead of the warband, counts your swords, runs back faster.',
    av: { skin: '#9db38a', h: 0.18, w: 0.4, head: 0.66, ears: 'big', nose: 'hook', eyes: ['wide', '#e0c040'], brows: 'worried', mouth: 'smirk', hair: ['bald', '#111111'], hat: ['leather_cap', '#5a4a2a'], top: ['rags', '#6a6a3a', '#4a3a2a'], bottom: ['ragged', '#4a3a2a'], shoes: ['barefoot', '#9db38a'], marks: ['dirt', '#5a4a2a'], held: ['bow', '#7a5a2a'], off: ['quiver', '#5a3a1a'] } },
  goblin_warrior: { race: 'goblin', voice: 'goblin', gender: 'n', traits: ['abrasive', 'bloodlust'], desc: 'Small, loud, and holding a cleaver stolen off a farm three valleys back.',
    av: { skin: '#7fa86a', h: 0.22, w: 0.5, head: 0.64, ears: 'big', nose: 'hook', eyes: ['narrow', '#e0c040'], mouth: 'fangs', hair: ['spiky', '#111111'], top: ['vest', '#5a4a2a', '#7a3a2a'], bottom: ['loincloth', '#4a3a2a'], shoes: ['barefoot', '#7fa86a'], marks: ['warpaint', '#c83a2a'], held: ['cleaver', '#8a8a80'], off: ['round_shield', '#6a4a2a'] } },
  goblin_shaman: { race: 'goblin', voice: 'goblin', gender: 'n', traits: ['archaic', 'cruel'], desc: 'Burns bone and beetle wing, and the fire answers in a voice that is not hers.',
    av: { skin: '#9db38a', h: 0.2, w: 0.42, head: 0.7, ears: 'big', nose: 'long', eyes: ['slit', '#e06a20'], mouth: 'grin', hair: ['mohawk', '#8a1a1a'], hat: ['feather_band', '#c83a2a'], top: ['rags', '#3a5a3a', '#8a6a2a'], bottom: ['ragged', '#3a4a2a'], shoes: ['barefoot', '#9db38a'], marks: ['war_stripe', '#e0b040'], acc: ['pendant', '#c8b040'], held: ['staff_totem', '#5a3a1a'] } },
  goblin_warlord: { race: 'goblin', voice: 'goblin', gender: 'n', traits: ['pompous', 'cruel', 'bloodlust'], desc: 'Wears three helmets worth of scrap and answers to no chief but the one in the mirror.',
    av: { h: 0.35, w: 0.72, head: 0.6, skin: '#6e9a58', ears: 'big', nose: 'hook', eyes: ['angry', '#e8d040'], mouth: 'tusks', hair: ['bald', '#111111'], hat: ['horned_helm', '#7a7a6a'], top: ['scale_plate', '#4a5a3a', '#8a8a70'], bottom: ['greaves', '#5a5a4a'], shoes: ['heavy', '#4a4a3a'], marks: ['scar', '#4a6a3a'], cape: ['fur_mantle', '#6a5a3a'], held: ['greataxe', '#9a9aa8'] } },
  // --- humans: bandits and cults
  bandit: { race: 'human', voice: 'villager', gender: 'm', traits: ['greedy', 'sarcastic'], desc: 'Road tax, he calls it. There is no road and he is not a tax collector.',
    av: { skin: '#c68642', h: 0.55, w: 0.55, hair: ['short', '#3b2a1a'], beard: 'stubble', eyes: ['narrow', '#6b4a2a'], nose: 'hook', mouth: 'smirk', acc: ['scarf_mask', '#5a3a2a'], top: ['strapped_leather', '#4a3a28', '#6a5a3a'], bottom: ['pants', '#3a3028'], shoes: ['boots', '#2e2418'], marks: ['dirt', '#4a3a2a'], held: ['daggers', '#b0b0b8'] } },
  bandit_captain: { race: 'human', voice: 'villager', gender: 'm', traits: ['pompous', 'cruel'], desc: 'Keeps a ledger of everyone she has robbed, in case anyone comes back rich.',
    av: { skin: '#e0ac69', h: 0.7, w: 0.6, hair: ['ponytail', '#3b2a1a'], eyes: ['angry', '#4a6b8a'], nose: 'small', mouth: 'smirk', shape: 'oval', hat: ['wide_brim', '#2a2018'], top: ['open_coat', '#5a2a2a', '#d8c8a0'], bottom: ['pants', '#2a2a2a'], shoes: ['boots', '#2a1f18'], marks: ['scar_cheek', '#c07a5a'], acc: ['bandolier', '#5a3a1a'], held: ['saber', '#c8c8d0'], off: ['dagger', '#b0b0b8'] } },
  dragon_cultist: { race: 'human', voice: 'cultist', gender: 'n', traits: ['pious', 'bloodlust'], desc: 'Believes the burning to come is a kindness, and wants a good seat for it.',
    av: { skin: '#d9a77a', h: 0.6, w: 0.5, hair: ['bald', '#111111'], eyes: ['glow', '#e07a20'], brows: 'none', nose: 'small', mouth: 'open', hat: ['hood', '#6a1f14'], top: ['trim_robe', '#6a1f14', '#e0a030'], bottom: ['pants', '#3a1a12'], shoes: ['sandals', '#5a3a1a'], marks: ['face_glyphs', '#e07a20'], off: ['dagger', '#c0a060'] } },
  veil_cultist: { race: 'human', voice: 'cultist', gender: 'n', traits: ['pious', 'paranoid'], desc: 'Chants into the thin places where the Veil frays, hoping something chants back.',
    av: { skin: '#cfc0b0', h: 0.6, w: 0.5, hair: ['bald', '#111111'], eyes: ['hollow', '#a880ff'], brows: 'none', nose: 'small', mouth: 'stitched', hat: ['hood', '#2e1f5e'], top: ['trim_robe', '#2e1f5e', '#a880ff'], bottom: ['pants', '#1a1235'], shoes: ['slippers', '#1a1235'], marks: ['face_glyphs', '#a880ff'], off: ['dagger', '#8a80c0'] } },
  veil_sorcerer: { race: 'elf', voice: 'cultist', gender: 'f', traits: ['scholar', 'pompous'], desc: 'Reads the Veil the way a sailor reads weather, and sails straight into the worst of it.',
    av: { skin: '#b8a1d9', h: 0.65, w: 0.42, head: 0.55, shape: 'oval', ears: 'pointed', hair: ['long', '#4a3a8a'], eyes: ['glow', '#c8a0ff'], brows: 'thin', nose: 'small', mouth: 'neutral', top: ['high_collar_robe', '#1a1235', '#a880ff'], bottom: ['pants', '#140d2a'], shoes: ['pointed', '#140d2a'], marks: ['face_glyphs', '#a880ff'], cape: ['shoulder_cape', '#3a1f6a'], held: ['orb', '#a880ff'] } },
  veil_warden: { race: 'elf', voice: 'cultist', gender: 'n', traits: ['loyal', 'gruff'], desc: 'Stands at the tear in the world and lets nothing through, in either direction.',
    av: { skin: '#8a7aa8', h: 0.78, w: 0.68, ears: 'pointed', hair: ['bald', '#111111'], eyes: ['glow', '#8ae0ff'], nose: 'small', mouth: 'neutral', hat: ['plate_helm', '#4a4a68'], top: ['harness', '#2a2440', '#7a6ac0'], bottom: ['greaves', '#3a3a54'], shoes: ['heavy', '#2a2a3a'], cape: ['half_cape', '#2e1f5e'], held: ['quarterstaff', '#3a2a5a'], off: ['kite_shield', '#3a3358'] } },
  veilspawn_herald: { race: 'undead', voice: 'cultist', gender: 'n', traits: ['archaic', 'cruel'], desc: 'Announces the Veil the way a bell announces a funeral, and it is never your own.',
    av: { skin: '#6a5a8a', h: 0.85, w: 0.48, head: 0.48, shape: 'long', ears: 'pointed', hair: ['horns_hair', '#2a1f42'], eyes: ['glow', '#ffe86a'], brows: 'none', nose: 'none', mouth: 'stitched', top: ['high_collar_robe', '#241a3a', '#ffe86a'], bottom: ['pants', '#1a1228'], shoes: ['barefoot', '#6a5a8a'], marks: ['face_glyphs', '#ffe86a'], cape: ['cape', '#2a1f42'], held: ['staff_crystal', '#6a5aa8'] } },
  void_prophet: { race: 'undead', voice: 'cultist', gender: 'n', traits: ['archaic', 'paranoid', 'scholar'], desc: 'Blindfolded, because what he sees without the cloth does not need eyes.',
    av: { skin: '#5a4a78', h: 0.7, w: 0.5, hair: ['bald', '#111111'], eyes: ['hollow', '#ffffff'], brows: 'none', nose: 'small', mouth: 'o', acc: ['blindfold', '#1a1228'], hat: ['hood', '#1a1228'], top: ['trim_robe', '#1a1228', '#7a6ac0'], bottom: ['pants', '#140d20'], shoes: ['barefoot', '#5a4a78'], marks: ['third_eye', '#a880ff'], held: ['staff_orb', '#3a2a5a'] } },
  // --- armoured horrors
  abyssal_knight: { race: 'undead', voice: 'brute', gender: 'n', traits: ['cruel', 'archaic'], desc: 'Plate the colour of a starless sky, worn by something that gave up breathing centuries ago.',
    av: { skin: '#6a6480', h: 0.85, w: 0.75, hair: ['bald', '#111111'], eyes: ['glow', '#8ae0ff'], brows: 'none', nose: 'none', mouth: 'neutral', hat: ['great_helm', '#3a3450'], top: ['scale_plate', '#2a2440', '#6a5aa0'], bottom: ['greaves', '#33304a'], shoes: ['heavy', '#26243a'], cape: ['cape', '#1f1a33'], held: ['greatsword', '#8a84a8'] } },
  hell_knight: { race: 'orc', voice: 'demon', gender: 'm', traits: ['cruel', 'bloodlust'], desc: 'Armour welded shut from the inside, still glowing from the forge that was not a forge.',
    av: { skin: '#8a2a2a', h: 0.88, w: 0.82, hair: ['horns_hair', '#3a1010'], eyes: ['glow', '#ff6a20'], brows: 'none', nose: 'none', mouth: 'fangs', hat: ['great_helm', '#4a2018'], top: ['scale_plate', '#4a1a14', '#e07a20'], bottom: ['greaves', '#3a1a14'], shoes: ['heavy', '#2a1210'], cape: ['cape', '#6a1a10'], marks: ['chest_glow', '#ff7a20'], held: ['greatsword', '#c05a20'] } },
  demon_brute: { race: 'orc', voice: 'demon', gender: 'm', traits: ['bloodlust', 'abrasive'], desc: 'Four hundred pounds of grievance with horns filed to points for the look of it.',
    av: { skin: '#a83028', h: 0.85, w: 0.95, head: 0.42, shape: 'square', ears: 'pointed', hair: ['horns_hair', '#4a1410'], eyes: ['angry', '#ffd040'], nose: 'snout', mouth: 'tusks', top: ['harness', '#3a1a14', '#8a5a2a'], bottom: ['loincloth', '#3a1a14'], shoes: ['barefoot', '#a83028'], marks: ['brand', '#ffb020'], held: ['warhammer', '#7a6a5a'] } },
  wyrm_warrior: { race: 'human', voice: 'brute', gender: 'f', traits: ['honorable', 'gruff'], desc: 'Wears the scales of the wyrm she killed, which the wyrm-cult finds unforgivable.',
    av: { skin: '#c68642', h: 0.75, w: 0.7, hair: ['braids', '#5a3a1a'], eyes: ['narrow', '#e0a020'], nose: 'small', mouth: 'frown', hat: ['dragon_helm', '#3a5a3a'], top: ['scale_plate', '#3a5a3a', '#c8a040'], bottom: ['greaves', '#4a4a3a'], shoes: ['heavy', '#3a3a2a'], marks: ['scar', '#c07a5a'], held: ['warhammer', '#8a8a90'] } },
  // --- beasts and monsters
  corrupted_wolf: { voice: 'brute', traits: ['bloodlust'], desc: 'Ran through a Veil-tear chasing a deer. Only one of them came out, and it was hungrier.',
    cr: CR('wolf', 1.05, { body: '#5a4a62', belly: '#8a7a90', accent: '#241c30', eyes: '#c83a2a' }, { fangs: true, spikes: true }) },
  corrupted_bear: { voice: 'brute', traits: ['bloodlust', 'gruff'], desc: 'Three seasons past hibernation and still walking, which is the part that worries people.',
    cr: CR('bear', 1.25, { body: '#4a3a4a', belly: '#7a5a6a', accent: '#241a24', eyes: '#e06a20' }, { claws: true, spikes: true, fangs: true }) },
  cinder_hound: { voice: 'demon', traits: ['bloodlust'], desc: 'Leaves pawprints that smoke for an hour. Sleeps in the coals and wakes up hungry.',
    cr: CR('hound', 1.05, { body: '#2a1c18', belly: '#d0522a', accent: '#ff7a20', eyes: '#ffc040' }, { fangs: true, spikes: true, claws: true }) },
  giant_spider: { voice: 'brute', traits: ['paranoid'], desc: 'Webs the size of sails, strung between two trees that used to mark a safe road.',
    cr: CR('spider', 1.25, { body: '#2a2230', belly: '#3a2a3a', accent: '#8a2020', eyes: '#e02020' }, { fangs: true }) },
  dragon_whelp: { voice: 'dragon', traits: ['brave', 'hungry'], desc: 'Wings too small to fly, temper large enough to try anyway.',
    cr: CR('drake', 0.7, { body: '#7a2a2a', belly: '#e0b070', accent: '#3a1010', eyes: '#ffd040' }, { horns: true, wings: true, fangs: true, spikes: true }) },
  storm_dragon: { voice: 'dragon', traits: ['pompous', 'brave'], desc: 'Nests in thunderheads and treats the sky below as a private hunting ground.',
    cr: CR('dragon', 1.15, { body: '#3a4a6a', belly: '#c8d8e8', accent: '#1a2030', eyes: '#7ae0ff' }, { horns: true, wings: true, spikes: true, fangs: true }) },
  frost_wyrm: { voice: 'dragon', traits: ['cruel', 'archaic'], desc: 'Swims through snowpack like water and surfaces where the fire was.',
    cr: CR('worm', 1.2, { body: '#8ab0c8', belly: '#e8f4ff', accent: '#3a5a78', eyes: '#c8f0ff' }, { fangs: true, maw: true, plates: true }) },
  genesis_worm: { voice: 'brute', traits: ['hungry'], desc: 'Older than the tunnels it dug. The tunnels are the shape of its appetite.',
    cr: CR('worm', 1.6, { body: '#6a4a5a', belly: '#c89a9a', accent: '#2a1a22', eyes: '#ffd040' }, { maw: true, plates: true, fangs: true }) },
  imp: { voice: 'demon', traits: ['sarcastic', 'coward'], desc: 'Too small to kill you, too quick to catch, and it knows both of those things.',
    cr: CR('imp', 0.9, { body: '#a83028', belly: '#d0674a', accent: '#5a1410', eyes: '#ffd040' }, { horns: true, tail: true, fangs: true, claws: true, wings: true }) },
  molten_golem: { voice: 'brute', traits: ['gruff'], desc: 'Slag and cooling stone, packed around a heart that never finished burning.',
    cr: CR('golem', 1.35, { body: '#3a2a26', belly: '#6a4030', accent: '#ff5a10', eyes: '#ffb03a' }, { core: true, spikes: true }) },
  primordial_elemental: { voice: 'brute', traits: ['archaic'], desc: 'First fire, still arguing with first air, in a shape that keeps losing the argument.',
    cr: CR('elemental', 1.6, { body: '#ff6a20', belly: '#ffd070', accent: '#7a1a00', eyes: '#fff0a0' }, { core: true, glow: true }) },
  reality_shard: { voice: 'undead', traits: ['archaic'], desc: 'A piece of somewhere else, spinning, cutting the air it does not belong to.',
    cr: CR('shard', 1.15, { body: '#7a6ae0', belly: '#c8bcff', accent: '#2a1f60', eyes: '#ffffff' }, { glow: true }) },
  star_horror: { voice: 'undead', traits: ['cruel', 'archaic'], desc: 'Fell out of the wrong constellation and has been looking at us ever since.',
    cr: CR('horror', 1.3, { body: '#1f2a52', belly: '#4a5aa0', accent: '#0d1128', eyes: '#ffe86a' }, { glow: true, fangs: true }) },
  cosmic_titan: { voice: 'brute', traits: ['archaic', 'pompous'], desc: 'Walks the ridge lines at night. From the valley it is mistaken for weather.',
    cr: CR('titan', 1.1, { body: '#2a2a4a', belly: '#4a4a80', accent: '#12122a', eyes: '#9ce8ff' }, { core: true, horns: true, spikes: true, claws: true }) },
  ash_wraith: { voice: 'undead', traits: ['grieving', 'cruel'], desc: 'What is left when a person burns and the grudge does not.',
    cr: CR('wraith', 1.1, { body: '#4a4448', belly: '#8a8288', accent: '#191518', eyes: '#ff8a3a' }, { glow: true, claws: true }) },
  void_wraith: { voice: 'undead', traits: ['cruel', 'archaic'], desc: 'Robes with nothing in them, moving against the wind on purpose.',
    cr: CR('wraith', 1.2, { body: '#3a3350', belly: '#6a6088', accent: '#141220', eyes: '#a880ff' }, { glow: true, claws: true }) },
  void_shade: { voice: 'undead', traits: ['paranoid'], desc: 'Your shadow, if your shadow had opinions about where you should be standing.',
    cr: CR('wraith', 0.85, { body: '#1a1826', belly: '#3a3450', accent: '#0a0912', eyes: '#8ae0ff' }, { glow: true, claws: true }) },
};

// ------------------------------------------------------------------ bosses (data/bosses.json entities) — bigger than the rank and file
const BOSSES = {
  grax_veil_touched: { race: 'orc', voice: 'brute', gender: 'm', traits: ['bloodlust', 'abrasive', 'paranoid'], desc: 'Reached into a Veil-tear on a dare. The arm came back wrong and so did he.',
    av: { skin: '#7a8a6a', h: 0.92, w: 0.9, head: 0.45, shape: 'square', ears: 'pointed', hair: ['mohawk', '#2a1f42'], eyes: ['glow', '#a880ff'], nose: 'wide', mouth: 'tusks', top: ['harness', '#3a3a2a', '#6a5aa0'], bottom: ['ragged', '#2f2a1f'], shoes: ['heavy', '#2a2418'], marks: ['face_glyphs', '#a880ff'], cape: ['fur_mantle', '#4a3a2a'], held: ['greataxe', '#8a8a90'] } },
  void_scholar: { race: 'undead', voice: 'cultist', gender: 'm', traits: ['scholar', 'pompous', 'cynical'], desc: 'Read every book in the vault, then read the vault, then read what the vault was written on.',
    av: { skin: '#7a6a9a', h: 0.8, w: 0.45, head: 0.6, shape: 'long', hair: ['bald', '#111111'], eyes: ['glow', '#ffffff'], brows: 'thin', nose: 'long', mouth: 'neutral', acc: ['round_glasses', '#c8b040'], top: ['high_collar_robe', '#151228', '#c8b040'], bottom: ['pants', '#0f0c1c'], shoes: ['slippers', '#0f0c1c'], marks: ['third_eye', '#a880ff'], cape: ['shoulder_cape', '#2e1f5e'], held: ['staff_crystal', '#5b3aaa'], off: ['book', '#3a1a4a'] } },
  archfiend_malgrath: { race: 'orc', voice: 'demon', gender: 'm', traits: ['cruel', 'pompous', 'bloodlust'], desc: 'Signs every bargain himself, in your handwriting, before you have agreed to it.',
    av: { skin: '#8a1f1f', h: 1, w: 0.88, head: 0.46, shape: 'chiseled', ears: 'pointed', hair: ['horns_hair', '#2a0a0a'], eyes: ['glow', '#ff3020'], brows: 'none', nose: 'snout', mouth: 'fangs', top: ['scale_plate', '#3a0f0f', '#e0b040'], bottom: ['greaves', '#2a0c0c'], shoes: ['hooves', '#1a0808'], marks: ['brand', '#ffb020'], cape: ['cape', '#5a0f0f'], hat: ['crown', '#c8a030'], held: ['greatsword', '#c05a20'] } },
  the_architect: { race: 'undead', voice: 'cultist', gender: 'n', traits: ['archaic', 'scholar', 'cruel'], desc: 'Did not break the world. Drew it this way, and is annoyed that anyone objects.',
    av: { skin: '#cfd0e0', h: 1, w: 0.42, head: 0.52, shape: 'long', ears: 'pointed', hair: ['bald', '#111111'], eyes: ['glow', '#ffffff'], brows: 'none', nose: 'none', mouth: 'stitched', hat: ['circlet', '#e8e0c0'], top: ['high_collar_robe', '#101018', '#e0d0a0'], bottom: ['pants', '#0b0b12'], shoes: ['pointed', '#0b0b12'], marks: ['face_glyphs', '#e0d0a0'], cape: ['cape', '#16162a'], held: ['hourglass', '#e0d0a0'], off: ['orb', '#9ce8ff'] } },
  emberveil_sovereign: { race: 'undead', voice: 'demon', gender: 'n', traits: ['pompous', 'archaic', 'cruel'], desc: 'Wears the Veil like a coronation robe and expects the burning world to kneel in it.',
    av: { skin: '#d8b8a0', h: 1, w: 0.6, head: 0.5, shape: 'long', ears: 'pointed', hair: ['horns_hair', '#2a1010'], eyes: ['glow_tear', '#ff8a20'], brows: 'none', nose: 'small', mouth: 'neutral', hat: ['crown', '#e0a030'], top: ['trim_robe', '#3a1410', '#ff8a20'], bottom: ['pants', '#2a0f0c'], shoes: ['barefoot', '#d8b8a0'], marks: ['face_glyphs', '#ff8a20'], cape: ['cape', '#6a1a10'], held: ['flame', '#ff8c2a'], off: ['orb', '#ffd070'] } },
  ancient_dragon: { voice: 'dragon', traits: ['archaic', 'pompous', 'greedy'], desc: 'Older than the kingdom that named it, and it remembers every border the kingdom moved.',
    cr: CR('dragon', 1.5, { body: '#7a5a2a', belly: '#e8c890', accent: '#3a2a10', eyes: '#ffd040' }, { horns: true, wings: true, spikes: true, fangs: true }) },
  dragon_king: { voice: 'dragon', traits: ['pompous', 'cruel', 'archaic'], desc: 'Bahamorth holds court in a caldera and calls the other dragons his subjects. They come.',
    cr: CR('dragon', 1.7, { body: '#c8a030', belly: '#f4e0a0', accent: '#5a4010', eyes: '#ff3020' }, { horns: true, wings: true, spikes: true, fangs: true }) },
  lava_titan: { voice: 'brute', traits: ['gruff', 'bloodlust'], desc: 'Stone outside, furnace inside, and the mountain it climbed out of has not filled back in.',
    cr: CR('titan', 1.3, { body: '#2a2220', belly: '#6a3a1a', accent: '#ff5a10', eyes: '#ffca40' }, { core: true, horns: true, spikes: true, claws: true }) },
  vault_guardian: { voice: 'brute', traits: ['loyal', 'gruff'], desc: 'Sandstone and brass, wound tight around one instruction: nothing leaves the vault.',
    cr: CR('golem', 1.7, { body: '#a08a5a', belly: '#c8b078', accent: '#6a4a20', eyes: '#40c8ff' }, { core: true, spikes: false }) },
  the_first_ember: { voice: 'brute', traits: ['archaic', 'pompous'], desc: 'The spark every fire is a rumour of, awake and taking it personally.',
    cr: CR('elemental', 1.9, { body: '#ffb020', belly: '#fff0c0', accent: '#a03a00', eyes: '#ffffff' }, { core: true, glow: true }) },
  echo_sovereign: { voice: 'undead', traits: ['grieving', 'archaic'], desc: 'The Sovereign as the Veil remembers it, repeating a coronation that never finished.',
    cr: CR('wraith', 1.7, { body: '#6a5a4a', belly: '#e0d0a0', accent: '#2a2018', eyes: '#ffca40' }, { glow: true, claws: true }) },
  the_unraveler: { voice: 'undead', traits: ['cruel', 'archaic'], desc: 'Pulls one thread out of a thing and waits, politely, for the rest of it to come apart.',
    cr: CR('horror', 1.8, { body: '#2a1f42', belly: '#6a4a8a', accent: '#120c22', eyes: '#c8ff6a' }, { glow: true, fangs: true }) },
};

// ------------------------------------------------------------------ class pets (data/companions.json classPets)
const PETS = {
  pet_wolf: { voice: 'villager', traits: ['loyal', 'brave'], desc: 'Bonded through green magic, not a leash. Walks a pace ahead and picks the path.',
    cr: CR('wolf', 1, { body: '#5a5a52', belly: '#c0b8a0', accent: '#2a2a26', eyes: '#8ad060' }, { fangs: true }) },
  pet_bear: { voice: 'brute', traits: ['loyal', 'gruff'], desc: 'Came out of the deep wood when called and has not been asked to leave since.',
    cr: CR('bear', 1.15, { body: '#4a3524', belly: '#6a5238', accent: '#2a1c10', eyes: '#3a2a18' }, { claws: true }) },
  pet_war_hound: { voice: 'villager', traits: ['loyal', 'brave'], desc: 'Trained on a rope and a whistle. Knows four commands and ignores the fourth.',
    cr: CR('hound', 1, { body: '#6a4a30', belly: '#b09070', accent: '#3a2a1a', eyes: '#e0a040' }, { fangs: true, claws: true, spikes: false }) },
  pet_demon: { voice: 'demon', traits: ['cruel', 'loyal'], desc: 'Answers to the pact, not to you, but the pact says it must sit when you say sit.',
    cr: CR('hound', 1.1, { body: '#221410', belly: '#c8401a', accent: '#ff6a20', eyes: '#ffd040' }, { fangs: true, spikes: true, claws: true }) },
  pet_imp: { voice: 'demon', traits: ['sarcastic', 'greedy'], desc: 'Bound at the wrist, loyal to the letter of the deal and nothing past it.',
    cr: CR('imp', 0.85, { body: '#a83028', belly: '#d0674a', accent: '#5a1410', eyes: '#ffd040' }, { horns: true, tail: true, fangs: true, claws: true, wings: true }) },
  pet_familiar: { voice: 'child', traits: ['sarcastic', 'loyal'], desc: 'Black cat with rune-light under the fur, older than the mage it agreed to follow.',
    cr: CR('cat', 1, { body: '#191622', belly: '#3a3448', accent: '#a880ff', eyes: '#a880ff' }, { whiskers: true, claws: true, fangs: true }) },
  pet_fire_elemental: { voice: 'brute', traits: ['brave'], desc: 'Summoned out of the ember planes and pleased to be somewhere with things to burn.',
    cr: CR('elemental', 0.95, { body: '#ff6a20', belly: '#ffd070', accent: '#7a1a00', eyes: '#fff0a0' }, { core: true, glow: true }) },
  pet_lightning_elemental: { voice: 'brute', traits: ['brave', 'jolly'], desc: 'A bolt that was given a purpose before it finished striking, and kept going.',
    cr: CR('elemental', 0.95, { body: '#6ab8ff', belly: '#ffffff', accent: '#1a3a7a', eyes: '#ffffff' }, { core: true, glow: true }) },
  pet_bone_golem: { voice: 'undead', traits: ['loyal', 'gruff'], desc: 'Every bone in it was donated, in the sense that nobody living objected.',
    cr: CR('golem', 1.25, { body: '#d8cfb8', belly: '#efe8d2', accent: '#6a6050', eyes: '#8ae060' }, { core: true, spikes: true }) },
  pet_clockwork_turret: { voice: 'merchant', traits: ['loyal'], desc: 'Brass tripod, one blue eye, springs wound tight enough to worry the person winding them.',
    cr: CR('golem', 0.7, { body: '#b08a3a', belly: '#e0c070', accent: '#5a4418', eyes: '#40c8ff' }, { core: true, spikes: false }) },
  pet_skeletal_warrior: { race: 'undead', voice: 'undead', gender: 'n', traits: ['loyal', 'archaic'], desc: 'Fought for somebody once. Still holds the line, and still does not say for whom.',
    av: { skin: '#e8e2d0', h: 0.65, w: 0.42, head: 0.55, shape: 'square', hair: ['bald', '#111111'], eyes: ['hollow', '#8ae060'], brows: 'none', nose: 'none', mouth: 'stitched', marks: ['undead_skin', '#9aa08a'], hat: ['chain_coif', '#7a7a70'], top: ['chainmail', '#7a7a70', '#4a4a44'], bottom: ['ragged', '#4a4438'], shoes: ['boots', '#3a342a'], held: ['sword', '#b8b8c0'], off: ['heater_shield', '#6a6a60'] } },
};

// ------------------------------------------------------------------ hireable companions (data/companions.json companions — the kennel)
const COMPANIONS = {
  war_dog: { voice: 'villager', traits: ['loyal', 'brave'], desc: 'Farm dog with a soldier past. Hates goblins on sight and has never explained why.',
    cr: CR('hound', 0.95, { body: '#8a6a42', belly: '#d0b088', accent: '#4a3620', eyes: '#c88a30' }, { fangs: true, claws: true, spikes: false }) },
  shadow_cat: { voice: 'child', traits: ['cynical', 'sarcastic'], desc: 'Black fur, coal eyes, and a habit of arriving behind whatever it was hunting.',
    cr: CR('cat', 1.15, { body: '#141218', belly: '#2f2a38', accent: '#c83a2a', eyes: '#e06a20' }, { whiskers: true, claws: true, fangs: true }) },
  dire_wolf: { voice: 'brute', traits: ['loyal', 'gruff'], desc: 'A wolf the size of a horse, with a pack instinct it has decided you belong to.',
    cr: CR('dire_wolf', 1.1, { body: '#2f2f36', belly: '#5a5a62', accent: '#1a1a1e', eyes: '#ff5a3a' }, { fangs: true, spikes: true }) },
  forest_owl: { voice: 'child', traits: ['shy', 'loyal'], desc: 'Silent to the last wingbeat. Sees the ambush two turns before the scout does.',
    cr: CR('owl', 1, { body: '#7a6146', belly: '#d8c6a0', accent: '#4a3828', eyes: '#f0b020' }, { wings: true, beak: true }) },
  ember_drake: { voice: 'dragon', traits: ['brave', 'hungry'], desc: 'Small enough for a shoulder, hot enough to ruin the shoulder it sits on.',
    cr: CR('drake', 0.9, { body: '#8a2a1a', belly: '#e8b060', accent: '#3a1008', eyes: '#ffb020' }, { horns: true, wings: true, fangs: true, spikes: true }) },
  crystal_golem: { voice: 'brute', traits: ['loyal', 'gruff'], desc: 'Living crystal, slow as a season, and almost impossible to talk out of a doorway.',
    cr: CR('golem', 1.05, { body: '#8a9ad8', belly: '#d0dcff', accent: '#3a4a8a', eyes: '#ffffff' }, { core: true, spikes: true }) },
  spirit_wisp: { voice: 'child', traits: ['kind', 'shy'], desc: 'A mote of pale light that drifts close when someone is hurt, and warms as it goes.',
    cr: CR('wisp', 1, { body: '#9ce8ff', belly: '#e8fbff', accent: '#2a6a8a', eyes: '#ffffff' }, { glow: true }) },
  bone_hound: { voice: 'undead', traits: ['loyal'], desc: 'A mastiff held together by old necromantic thread. Tireless, and entirely unafraid.',
    cr: CR('hound', 0.95, { body: '#d8cfb8', belly: '#efe8d2', accent: '#6a6050', eyes: '#8ae060' }, { fangs: true, spikes: true, claws: true }) },
  ice_sprite: { voice: 'child', traits: ['shy', 'cynical'], desc: 'A flicker of frost that hangs about head height. The cold it leaves outlasts the fight.',
    cr: CR('wisp', 0.9, { body: '#a8e0ff', belly: '#ffffff', accent: '#2a5a8a', eyes: '#dff4ff' }, { glow: true }) },
  swamp_frog: { voice: 'villager', traits: ['hungry', 'jolly'], desc: 'Boulder-sized, sticky-tongued, and far harder to move than anything that green should be.',
    cr: CR('frog', 1.1, { body: '#5a8a3a', belly: '#cfd88a', accent: '#2f4a20', eyes: '#e8c020' }, { bulgeEyes: true }) },
  void_moth: { voice: 'undead', traits: ['shy', 'archaic'], desc: 'Wings of starless black. Drifts between the lines of the world and comes back dusted with somewhere else.',
    cr: CR('moth', 1.15, { body: '#2a2440', belly: '#7a6ac0', accent: '#141024', eyes: '#c0ff60' }, { wings: true, antennae: true }) },
  dragon_hatchling: { voice: 'dragon', traits: ['brave', 'hungry'], desc: 'Crimson, hand-sized, and convinced the fire it breathes is already a dragon.',
    cr: CR('dragon', 0.55, { body: '#b02a2a', belly: '#f0c880', accent: '#4a1010', eyes: '#ffd040' }, { horns: true, wings: true, spikes: true, fangs: true }) },
  frost_wyrmling: { voice: 'dragon', traits: ['shy', 'gruff'], desc: 'A young frost wyrm, blue-scaled, breathing cold in the shape of a held breath.',
    cr: CR('worm', 0.7, { body: '#8ab0c8', belly: '#e8f4ff', accent: '#3a5a78', eyes: '#c8f0ff' }, { fangs: true, maw: true, plates: true }) },
  storm_drake: { voice: 'dragon', traits: ['brave', 'jolly'], desc: 'Lightning in the wings and thunder a beat behind it, always in a hurry.',
    cr: CR('drake', 1.1, { body: '#3a4a78', belly: '#c8d8f0', accent: '#7ae0ff', eyes: '#ffffff' }, { horns: true, wings: true, spikes: true, fangs: true }) },
  shadow_wyrm: { voice: 'dragon', traits: ['cynical', 'archaic'], desc: 'Born of eclipse-fire. The dark clings to it, and whispers answer when it calls.',
    cr: CR('worm', 1.3, { body: '#241f34', belly: '#5a4a7a', accent: '#0f0c18', eyes: '#a880ff' }, { fangs: true, maw: true, plates: true }) },
};

// ------------------------------------------------------------------ named hires (data/companions.json hires) — humans with a face of their own
const HIRES = {
  aela: { race: 'human', voice: 'ranger', gender: 'f', traits: ['shy', 'loyal'], desc: 'Eastern border ranger. Waits for the shot the way other people wait for weather.',
    av: { skin: '#e0ac69', h: 0.6, w: 0.42, head: 0.52, shape: 'oval', hair: ['ponytail', '#6b4a2a'], eyes: ['almond', '#3a8a5a'], brows: 'straight', nose: 'small', mouth: 'neutral', hat: ['hood_down', '#2f4a2a'], top: ['tunic', '#3a5a32', '#5a3a1a'], bottom: ['pants', '#2a3a24'], shoes: ['boots', '#4a3a1a'], acc: ['scarf', '#6a6a4a'], held: ['bow', '#8a6a3a'], off: ['quiver', '#5a3a1a'] } },
  borin: { race: 'human', voice: 'warrior', gender: 'm', traits: ['gruff', 'brave', 'drunkard'], desc: 'Retired soldier, bored senseless by peace, looking for one more fight to lose slowly.',
    av: { skin: '#c68642', h: 0.7, w: 0.82, head: 0.48, shape: 'square', hair: ['buzz', '#888888'], beard: 'full', eyes: ['narrow', '#4a6b8a'], nose: 'hook', mouth: 'frown', top: ['chainmail', '#8a8a90', '#5a4a3a'], bottom: ['greaves', '#6a6a60'], shoes: ['heavy', '#3a3a34'], marks: ['scar', '#c07a5a'], held: ['sword', '#c8c8d0'], off: ['heater_shield', '#7a6a4a'] } },
  lysa: { race: 'human', voice: 'cleric', gender: 'f', traits: ['pious', 'kind', 'nervous'], desc: 'First posting outside the temple, and determined that nobody notice it is her first.',
    av: { skin: '#f1c27d', h: 0.55, w: 0.45, head: 0.55, shape: 'heart', hair: ['bob', '#d9c27a'], eyes: ['round', '#6b8aa0'], brows: 'worried', nose: 'button', mouth: 'smile', hat: ['hood', '#f4f4f0'], top: ['trim_robe', '#f4f4f0', '#e0b040'], bottom: ['pants', '#e8e4d8'], shoes: ['slippers', '#8a6a3a'], acc: ['pendant', '#e0b040'], held: ['mace', '#8a8a90'] } },
  rekk: { race: 'human', voice: 'rogue', gender: 'm', traits: ['sarcastic', 'greedy'], desc: 'Says he is not a thief. Carries three knives and a very specific route out of every room.',
    av: { skin: '#c68642', h: 0.55, w: 0.45, hair: ['spiky', '#3b2a1a'], beard: 'stubble', eyes: ['narrow', '#6b4a2a'], nose: 'small', mouth: 'smirk', hat: ['hood', '#1f1f24'], top: ['strapped_leather', '#242428', '#5a4a2a'], bottom: ['pants', '#1f1f24'], shoes: ['boots', '#2a2a2a'], acc: ['bandolier', '#4a3a2a'], held: ['daggers', '#b0b0b8'] } },
  kaldrek: { race: 'human', voice: 'dragon_knight', gender: 'm', traits: ['brave', 'pompous', 'bloodlust'], desc: 'Dragon-blooded, dragon-scaled, and unable to finish a sentence without saying dragon.',
    av: { skin: '#d9a77a', h: 0.82, w: 0.82, head: 0.46, shape: 'chiseled', hair: ['long', '#8a1a1a'], beard: 'goatee', eyes: ['angry', '#e0a020'], nose: 'wide', mouth: 'grin', hat: ['dragon_helm', '#8a2a1a'], top: ['scale_plate', '#8a2a1a', '#c8a040'], bottom: ['greaves', '#5a4a3a'], shoes: ['heavy', '#3a3028'], marks: ['burn_scar', '#c07a5a'], cape: ['cape', '#6a1a10'], held: ['greatsword', '#d0c0a0'] } },
  syra_wyrmsworn: { race: 'human', voice: 'dragon_knight', gender: 'f', traits: ['honorable', 'pious', 'gruff'], desc: 'Sworn to the old wyrm-oaths, which she recites before a fight whether or not anyone is listening.',
    av: { skin: '#e0ac69', h: 0.75, w: 0.7, head: 0.5, shape: 'oval', hair: ['braids', '#3b2a1a'], eyes: ['narrow', '#3a8a8a'], brows: 'straight', nose: 'small', mouth: 'neutral', hat: ['dragon_helm', '#2a5a5a'], top: ['scale_plate', '#2a5a5a', '#c8c8d0'], bottom: ['greaves', '#5a5a60'], shoes: ['heavy', '#3a3a40'], cape: ['half_cape', '#1a4a4a'], held: ['sword', '#d0d0d8'], off: ['kite_shield', '#2a5a5a'] } },
  vorin_emberjaw: { race: 'human', voice: 'dragon_knight', gender: 'm', traits: ['archaic', 'brave', 'abrasive'], desc: 'Raised in a red hoard by a dragon that miscounted its eggs. Still insists he is one of them.',
    av: { skin: '#c68642', h: 0.78, w: 0.78, head: 0.48, shape: 'square', hair: ['horns_hair', '#8a2a1a'], beard: 'long', eyes: ['glow', '#ff8a20'], nose: 'hook', mouth: 'fangs', top: ['scale_plate', '#6a2410', '#e0a030'], bottom: ['greaves', '#4a2a1a'], shoes: ['heavy', '#2f2018'], marks: ['burn_scar', '#e0a030'], cape: ['fur_mantle', '#5a3a1a'], held: ['greataxe', '#c8a060'] } },
  maelis_drakeblood: { race: 'human', voice: 'dragon_knight', gender: 'f', traits: ['cynical', 'sarcastic', 'paranoid'], desc: 'Left the dragon-cult with the tattoos still on. They light up when a wyrm is near, which she hates.',
    av: { skin: '#e8d8c8', h: 0.7, w: 0.55, head: 0.52, shape: 'oval', hair: ['bob', '#111111'], eyes: ['narrow', '#a040e0'], brows: 'thin', nose: 'small', mouth: 'smirk', top: ['strapped_leather', '#2a2030', '#8a3a6a'], bottom: ['pants', '#221a28'], shoes: ['boots', '#1f1820'], marks: ['tattoo', '#c85ad0'], cape: ['half_cape', '#3a1a4a'], held: ['daggers', '#c8c8d0'] } },
  ysolde_cogwright: { race: 'human', voice: 'tinker', gender: 'f', traits: ['scholar', 'jolly', 'nervous'], desc: 'Workshop-trained, brass-goggled, more pockets than fingers, and quicker with a wound than a wrench.',
    av: { skin: '#f1c27d', h: 0.58, w: 0.55, head: 0.55, shape: 'round', hair: ['bun', '#a86a3a'], eyes: ['round', '#6b4a2a'], brows: 'raised', nose: 'button', mouth: 'grin', hat: ['goggles_up', '#b08a3a'], top: ['smith_apron', '#5a3a1a', '#8a7a5a'], bottom: ['pants', '#4a3a2a'], shoes: ['boots', '#3b2a1a'], acc: ['pocketwatch', '#d8b040'], marks: ['soot', '#4a4038'], held: ['crossbow', '#b08a3a'] } },
};

// ------------------------------------------------------------------ build
const GROUPS = [
  { key: 'enemies', table: ENEMIES, roster: () => J('prototypes/emberveil/data/enemies.json').entities, libPrefix: 'enemy_', kind: 'enemy', tag: 'enemy' },
  { key: 'bosses', table: BOSSES, roster: () => J('prototypes/emberveil/data/bosses.json').entities, libPrefix: 'enemy_', kind: 'enemy', tag: 'boss' },
  { key: 'pets', table: PETS, roster: () => byId(J('prototypes/emberveil/data/companions.json').classPets), libPrefix: 'companion_', kind: 'npc', tag: 'pet' },
  { key: 'companions', table: COMPANIONS, roster: () => byId(J('prototypes/emberveil/data/companions.json').companions), libPrefix: 'companion_', kind: 'npc', tag: 'companion' },
  { key: 'hires', table: HIRES, roster: () => byId(J('prototypes/emberveil/data/companions.json').hires), libPrefix: 'companion_', kind: 'npc', tag: 'hire' },
];
function byId(list) { return Array.isArray(list) ? Object.fromEntries(list.map(e => [e.id, e])) : list; }
/** Speech section in the same shape the class blueprints use, derived from the traits. */
function speechFor(traits) {
  const has = t => traits.includes(t);
  return { traits, formality: has('archaic') || has('pious') ? 0.75 : has('gruff') || has('abrasive') ? 0.2 : 0.45,
    verbosity: has('scholar') || has('pompous') ? 0.75 : has('shy') || has('gruff') ? 0.25 : 0.45,
    cheer: has('jolly') ? 0.8 : has('cruel') || has('grieving') || has('cynical') ? 0.15 : 0.4,
    aggression: has('bloodlust') || has('cruel') ? 0.85 : has('kind') || has('shy') ? 0.15 : 0.5,
    confidence: has('pompous') || has('brave') ? 0.85 : has('coward') || has('nervous') || has('shy') ? 0.25 : 0.6,
    custom: {}, customRate: {}, tics: [], mood: 0 };
}
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const problems = [];
/** Guard: every part id must exist (normalizeAvatar silently swaps unknown ids for the default) and every creature type must be real. */
function check(id, look) {
  if (look.avatar) { const n = normalizeAvatar(look.avatar);
    for (const [slot, v] of Object.entries(look.avatar)) { if (slot === 'body') continue; const want = v?.id ?? v, got = n[slot]?.id ?? n[slot]; if (want !== got) problems.push(`${id}: ${slot} "${want}" is not a part (fell back to "${got}")`); } }
  if (look.creature) { if (!CREATURE_TYPES[look.creature.type]) problems.push(`${id}: creature type "${look.creature.type}" does not exist`);
    else { const n = normalizeCreature(look.creature); if (n.type !== look.creature.type) problems.push(`${id}: creature type fell back to ${n.type}`); } }
}

const looks = {}; const libEntries = []; let count = 0;
for (const g of GROUPS) {
  const roster = g.roster(); looks[g.key] = {};
  const missing = Object.keys(roster).filter(id => !g.table[id]); const extra = Object.keys(g.table).filter(id => !roster[id]);
  if (missing.length) problems.push(`${g.key}: no look for ${missing.join(', ')}`);
  if (extra.length) problems.push(`${g.key}: look for unknown id ${extra.join(', ')}`);
  for (const [id, def] of Object.entries(g.table)) {
    const entity = roster[id] || {}; const name = entity.name || def.name || id;
    const seed = hash(id); const traits = def.traits || ['gruff'];
    const voice = voiceFor({ role: def.voice || 'villager', gender: def.gender || 'n', seed });
    const look = { name, desc: def.desc, voiceRole: def.voice || 'villager', traits, voice, speech: speechFor(traits) };
    if (def.av) { look.race = def.race || 'human'; look.avatar = AV(def.av); } else { look.creature = normalizeCreature(def.cr); look.race = 'beast'; }
    check(g.key + '/' + id, look); looks[g.key][id] = look; count++;
    const data = { schema: 1, id: g.libPrefix + id, name, short: name.split(' ')[0], race: look.race, gender: def.gender || 'n', pronouns: def.gender === 'f' ? 'she' : def.gender === 'm' ? 'he' : 'they',
      templateId: id, avatar: look.avatar, creature: look.creature, voice, speech: look.speech, kind: g.kind, source: 'emberveil' };
    libEntries.push({ id: g.libPrefix + id, kind: g.kind, name, tags: ['emberveil', g.tag, look.creature ? look.creature.type : look.race], notes: def.desc, source: 'default', data });
  }
}
W('prototypes/emberveil/data/enemy-looks.json', {
  _doc: 'One designed look per Emberveil enemy, boss, class pet, hireable companion and named hire. Built by tools/build-emberveil-enemies.mjs — edit the tables there, not this file. Humanoids carry `avatar` (avatar-2d parts, also drives the Mii 3D body); beasts and constructs carry `creature` (avatar-3d/js/creature-types.js). `voiceRole` feeds shared/voices.js voiceFor(); `traits` feed the speech section. The same looks are filed in the library as enemy_<id> / companion_<id>.',
  enemies: looks.enemies, bosses: looks.bosses, pets: looks.pets, companions: looks.companions, hires: looks.hires,
});
const lib = J('library/data/defaults.json');
lib.entries = lib.entries.filter(e => !String(e.id).startsWith('enemy_') && !String(e.id).startsWith('companion_')).concat(libEntries);
W('library/data/defaults.json', lib);
console.log(`looks ${count} (enemies ${Object.keys(looks.enemies).length}, bosses ${Object.keys(looks.bosses).length}, pets ${Object.keys(looks.pets).length}, companions ${Object.keys(looks.companions).length}, hires ${Object.keys(looks.hires).length}) | library entries ${lib.entries.length}`);
if (problems.length) { console.error('\nPROBLEMS:\n' + problems.map(p => ' - ' + p).join('\n')); process.exit(1); }
