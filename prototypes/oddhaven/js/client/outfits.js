// What people wear, as plain rows (M7, pure). The sim says a word (`casual`, `work`, `sleep`…); this says what that word means for
// a job, or for a person with no written wardrobe. `WEAR_SLOTS` is what the creator offers for each kind of outfit.
export const WEAR_NAMES = { casual: 'Everyday', smart: 'Smart', sport: 'Sport', swim: 'Swim', winter: 'Winter', party: 'Party', sleep: 'Night', work: 'Work' };
/** The kinds of outfit you choose clothes for. Work clothes come with the job. */
export const WEAR_KINDS = ['casual', 'smart', 'sport', 'swim', 'winter', 'party', 'sleep'];

export const CLOTH = ['#c2493d', '#3f78b5', '#e0b93c', '#4e9a6a', '#8d5aa8', '#e8e2d4', '#2f3d55', '#d97e36', '#5db7bd', '#b5476f', '#23232a', '#7a7468'];
const DARK = ['#2d3a55', '#3a3a40', '#6a5a44', '#50606e', '#7a7468', '#23232a'];
const NIGHT = ['#8fa8c8', '#c88aa8', '#7fb08f', '#6a7aa8', '#7a8aa8'];
const BRIGHT = ['#e02f6a', '#2fa8e0', '#e0c02f', '#8a3fd0', '#20b090', '#e0602f'];
const DEEP = ['#23232a', '#2f3d55', '#5a2a3a', '#2a4a3a', '#4a3a5a'];
const WARM = ['#b5352d', '#2f5a8a', '#3a6a4a', '#d9b24c', '#6a4a8a', '#e8e2d4'];

/** A job with no row here would stand in its everyday clothes: tests/client.test.js fails if a job is missing. */
export const UNIFORMS = {
  logger: { top: { id: 'hi_vis_vest', color: '#ee7a1f', color2: '#e6e9ea' }, bottom: { id: 'work_trousers', color: '#3a3f46' }, shoes: { id: 'steel_toes', color: '#4a3a2c' }, hat: { id: 'hard_hat', color: '#f2c230' } },
  sawyer: { top: { id: 'coveralls', color: '#3f6a8a' }, bottom: { id: 'work_trousers', color: '#2f4a60' }, shoes: { id: 'steel_toes', color: '#4a3a2c' }, hat: { id: 'hard_hat', color: '#e8e4d8' } },
  timber_driver: { top: { id: 'hi_vis_jacket', color: '#d8e23a', color2: '#e6e9ea' }, bottom: { id: 'jeans', color: '#2d3a55' }, shoes: { id: 'work_boots', color: '#4a3a2c' }, hat: { id: 'ball_cap', color: '#3f7c40' } },
  yard_clerk: { top: { id: 'work_shirt', color: '#7a8a5a' }, bottom: { id: 'work_trousers', color: '#50606e' }, shoes: { id: 'work_boots', color: '#4a3a2c' } },
  mechanic: { top: { id: 'coveralls', color: '#2f4f6f' }, bottom: { id: 'work_trousers', color: '#2f4f6f' }, shoes: { id: 'steel_toes', color: '#23232a' } },
  nurse: { top: { id: 'scrubs', color: '#5db7bd' }, bottom: { id: 'scrub_trousers', color: '#5db7bd' }, shoes: { id: 'sneakers', color: '#e8e2d4' } },
  doctor: { top: { id: 'scrubs', color: '#3f78b5' }, bottom: { id: 'scrub_trousers', color: '#3f78b5' }, shoes: { id: 'dress_shoes', color: '#23232a' } },
  cook: { top: { id: 'chef_jacket', color: '#f0ece0' }, bottom: { id: 'pants', color: '#23232a' }, shoes: { id: 'kitchen_clogs', color: '#23232a' }, hat: { id: 'chef_hat', color: '#f4f0e6' } },
  barista: { top: { id: 'shop_apron', color: '#4e7a52' }, bottom: { id: 'jeans', color: '#2d3a55' }, shoes: { id: 'sneakers', color: '#3a3430' }, hat: { id: 'visor', color: '#4e7a52' } },
  server: { top: { id: 'shop_apron', color: '#2f3d55' }, bottom: { id: 'pants', color: '#23232a' }, shoes: { id: 'shoes', color: '#23232a' } },
  officer: { top: { id: 'police_shirt', color: '#2f4f8a', color2: '#23232a' }, bottom: { id: 'pants', color: '#23232a' }, shoes: { id: 'boots', color: '#23232a' }, hat: { id: 'police_cap', color: '#23304a' } },
  firefighter: { top: { id: 'turnout_coat', color: '#3a342c', color2: '#e0d84a' }, bottom: { id: 'work_trousers', color: '#3a342c' }, shoes: { id: 'steel_toes', color: '#23232a' } },
  gardener: { top: { id: 'overalls', color: '#4e7a52' }, bottom: { id: 'work_trousers', color: '#50606e' }, shoes: { id: 'work_boots', color: '#6a4a3c' }, hat: { id: 'bucket_hat', color: '#4e7a52' } },
  // batch 2: every other job
  clerk: { top: { id: 'polo', color: '#c2493d' }, bottom: { id: 'chinos', color: '#50606e' }, shoes: { id: 'shoes', color: '#23232a' } },
  bartender: { top: { id: 'waistcoat', color: '#23232a', color2: '#e8e2d4' }, bottom: { id: 'suit_trousers', color: '#23232a' }, shoes: { id: 'loafers', color: '#23232a' } },
  trainer: { top: { id: 'sports_vest', color: '#2fa8e0', color2: '#ffffff' }, bottom: { id: 'running_shorts', color: '#23232a' }, shoes: { id: 'trainers', color: '#e8e2d4' } },
  office_clerk: { top: { id: 'dress_shirt', color: '#dfe6ea', color2: '#2f4f8a' }, bottom: { id: 'chinos', color: '#3a3a40' }, shoes: { id: 'loafers', color: '#3a3430' } },
  accountant: { top: { id: 'suit_jacket', color: '#2f3d55', color2: '#e8e2d4' }, bottom: { id: 'suit_trousers', color: '#2f3d55' }, shoes: { id: 'dress_shoes', color: '#23232a' } },
  teacher: { top: { id: 'cardigan', color: '#7a6a4a' }, bottom: { id: 'chinos', color: '#6a5a44' }, shoes: { id: 'loafers', color: '#6a4a3c' } },
  caretaker: { top: { id: 'work_shirt', color: '#50606e' }, bottom: { id: 'work_trousers', color: '#3a3f46' }, shoes: { id: 'work_boots', color: '#3a3430' }, hat: { id: 'ball_cap', color: '#50606e' } },
  town_clerk: { top: { id: 'waistcoat', color: '#3a4a3a', color2: '#e8e2d4' }, bottom: { id: 'suit_trousers', color: '#2d3a55' }, shoes: { id: 'dress_shoes', color: '#3a3430' } },
  rift_warden: { top: { id: 'warden_coat', color: '#2a3f4a', color2: '#7fd0d8' }, bottom: { id: 'work_trousers', color: '#23232a' }, shoes: { id: 'boots', color: '#23232a' }, hat: { id: 'warden_cap', color: '#2a3f4a' } },
  freelance: { top: { id: 'henley', color: '#7a7468' }, bottom: { id: 'chinos', color: '#50606e' }, shoes: { id: 'sneakers', color: '#e8e2d4' } },
};

/** What the creator offers for each kind of outfit. Everyday is every everyday thing the town already wears, plus the new ones. */
export const WEAR_SLOTS = {
  casual: { top: ['tshirt', 'print_tee', 'polo', 'henley', 'button_shirt', 'flannel_shirt', 'blouse', 'hoodie', 'sweater', 'cardigan', 'tank', 'vest', 'blazer', 'denim_jacket', 'bomber_jacket', 'sundress', 'overalls', 'apron'], bottom: ['jeans', 'chinos', 'pants', 'cargo_pants', 'baggy', 'joggers', 'shorts', 'leggings', 'long_skirt', 'midi_skirt', 'pencil_skirt', 'running_shorts'], shoes: ['sneakers', 'trainers', 'shoes', 'boots', 'ankle_boots', 'work_boots', 'dress_shoes', 'sandals', 'loafers'], hat: ['none', 'ball_cap', 'beanie', 'bucket_hat', 'visor'] },
  smart: { top: ['dress_shirt', 'suit_jacket', 'waistcoat', 'blazer', 'turtleneck', 'shift_dress', 'blouse', 'cardigan'], bottom: ['suit_trousers', 'chinos', 'pants', 'pencil_skirt', 'midi_skirt', 'running_shorts'], shoes: ['dress_shoes', 'loafers', 'heels', 'shoes', 'ankle_boots'], hat: ['none'] },
  sport: { top: ['sport_tee', 'sports_vest', 'track_jacket', 'tshirt', 'hoodie'], bottom: ['track_pants', 'running_shorts', 'joggers', 'leggings'], shoes: ['trainers', 'sneakers'], hat: ['none', 'ball_cap', 'visor'] },
  swim: { top: ['swim_costume', 'swim_vest', 'tank'], bottom: ['swim_shorts', 'swim_skirt', 'running_shorts'], shoes: ['flip_flops', 'sandals', 'barefoot'], hat: ['none', 'sun_hat', 'bucket_hat'] },
  winter: { top: ['parka', 'puffer', 'wool_coat', 'sweater', 'turtleneck'], bottom: ['snow_trousers', 'jeans', 'chinos', 'leggings'], shoes: ['snow_boots', 'boots', 'ankle_boots'], hat: ['beanie', 'bobble_hat', 'ear_muffs', 'none'] },
  party: { top: ['party_dress', 'sequin_top', 'velvet_jacket', 'shift_dress', 'blouse', 'dress_shirt'], bottom: ['party_skirt', 'pencil_skirt', 'suit_trousers', 'leggings', 'running_shorts'], shoes: ['heels', 'dress_shoes', 'loafers', 'ankle_boots'], hat: ['none'] },
  sleep: { top: ['pyjama_top', 'nightshirt', 'tshirt'], bottom: ['pyjama_trousers', 'shorts', 'running_shorts'], shoes: ['slippers', 'barefoot'], hat: ['none'] },
};

/** Someone nobody dressed by hand: a likely set for each kind of outfit. Colours are short lists, so templates repeat. */
const SETS = {
  smart: { f: [['shift_dress', 'running_shorts', 'heels'], ['blouse', 'pencil_skirt', 'dress_shoes'], ['blazer', 'suit_trousers', 'loafers'], ['turtleneck', 'midi_skirt', 'ankle_boots']], m: [['dress_shirt', 'suit_trousers', 'dress_shoes'], ['suit_jacket', 'suit_trousers', 'dress_shoes'], ['waistcoat', 'chinos', 'loafers'], ['turtleneck', 'chinos', 'loafers']], tops: WARM, bottoms: DARK },
  sport: { f: [['sport_tee', 'running_shorts', 'trainers'], ['track_jacket', 'track_pants', 'trainers'], ['sports_vest', 'leggings', 'trainers']], m: [['sport_tee', 'running_shorts', 'trainers'], ['track_jacket', 'track_pants', 'trainers'], ['sports_vest', 'running_shorts', 'trainers']], tops: BRIGHT, bottoms: DARK },
  swim: { f: [['swim_costume', 'swim_skirt', 'flip_flops'], ['swim_vest', 'swim_shorts', 'flip_flops']], m: [['swim_vest', 'swim_shorts', 'flip_flops'], ['tank', 'swim_shorts', 'sandals']], tops: BRIGHT, bottoms: BRIGHT },
  winter: { f: [['parka', 'jeans', 'snow_boots', 'bobble_hat'], ['wool_coat', 'leggings', 'boots', 'beanie'], ['puffer', 'snow_trousers', 'snow_boots', 'ear_muffs']], m: [['parka', 'jeans', 'snow_boots', 'beanie'], ['wool_coat', 'chinos', 'boots', 'none'], ['puffer', 'snow_trousers', 'snow_boots', 'bobble_hat']], tops: WARM, bottoms: DARK },
  party: { f: [['party_dress', 'running_shorts', 'heels'], ['sequin_top', 'party_skirt', 'heels'], ['velvet_jacket', 'suit_trousers', 'dress_shoes']], m: [['velvet_jacket', 'suit_trousers', 'dress_shoes'], ['dress_shirt', 'suit_trousers', 'loafers'], ['sequin_top', 'suit_trousers', 'loafers']], tops: [...BRIGHT, ...DEEP], bottoms: DEEP },
  sleep: { f: [['pyjama_top', 'pyjama_trousers', 'slippers'], ['nightshirt', 'running_shorts', 'slippers']], m: [['pyjama_top', 'pyjama_trousers', 'slippers'], ['tshirt', 'pyjama_trousers', 'barefoot']], tops: NIGHT, bottoms: NIGHT },
};

const mix = (n, k) => Math.imul(n ^ k, 2654435761) >>> 0;
/** The outfit a person with this seed would own. Same seed, same clothes, on every device. */
export function setFor(seed, gender, wear) {
  const S = SETS[wear]; if (!S) return null;
  const list = S[gender] || S.m, row = list[mix(seed, 7) % list.length], top = S.tops[mix(seed, 11) % S.tops.length], low = S.bottoms[mix(seed, 13) % S.bottoms.length];
  const out = { top: { id: row[0], color: top }, bottom: { id: row[1], color: low }, shoes: { id: row[2], color: wear === 'sleep' ? '#8a7a6a' : '#23232a' }, hat: { id: row[3] ?? 'none', color: top } };
  if (row[0] === 'sports_vest' || row[0] === 'sport_tee' || row[0] === 'swim_costume') out.top.color2 = '#ffffff';
  if (row[0] === 'dress_shirt') out.top.color2 = DEEP[mix(seed, 17) % DEEP.length];
  if (row[0] === 'sequin_top' || row[0] === 'party_dress') out.top.color2 = '#f0d060';
  return out;
}

/** The look with these clothes on. A slot the outfit leaves out stays as it is, except the hat, which comes off. */
export function dress(a, outfit) {
  if (!outfit) return a;
  a.hat = { id: 'none' };
  for (const [slot, row] of Object.entries(outfit)) a[slot] = { ...row };
  return a;
}
