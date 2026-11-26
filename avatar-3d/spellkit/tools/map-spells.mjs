// Spell Kit: give every Oathwild spell a visual. Writes the `spells` and `fallback` sections of
// prototypes/oathwild/data/spell-visuals.json from the rules (targetKind + element + a few flags) and the hand table
// below. Hand changes go in HAND, then run again:
//   node avatar-3d/spellkit/tools/map-spells.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OW = join(HERE, '..', '..', '..', 'prototypes', 'oathwild');
const { bootRules } = await import(join(OW, 'js', 'rules', 'boot.js'));
const { spellRow, targetKind } = await import(join(OW, 'js', 'rules', 'spells.js'));
const FILE = join(OW, 'data', 'spell-visuals.json');
const data = JSON.parse(readFileSync(FILE, 'utf8'));
const rules = await bootRules({ seed: 1 });

// spells that deserve their own look (or a specific shared one). { visual, school?, scale? }
const HAND = {
  firebolt: 'fire_bolt', frost_shard: 'frost_bolt', frost_fletch: { visual: 'arrow', school: 'ice' },
  wild_bolt: 'arcane_missile', star_dart: 'arcane_missile', omen_bolt: 'arcane_missile', second_hand: 'arcane_missile', flung_edge: 'arcane_missile',
  seeking_volley: { visual: 'arcane_missile' }, discord_note: { visual: 'arcane_missile', scale: 0.8 },
  shadow_lance: 'shadow_bolt', gnawing_dark: 'shadow_bolt', curse: { visual: 'shadow_bolt', scale: 0.9 }, hex_bolt: 'shadow_bolt',
  marrow_lance: 'shadow_bolt', grave_mark: { visual: 'shadow_bolt', scale: 0.8 }, mark_the_killer: { visual: 'shadow_bolt', scale: 0.8 },
  thornlash: 'nature_bolt', spirit_bolt: { visual: 'bolt_generic', school: 'lightning' }, chain_bolt: 'chain_lightning',
  poison_dart: { visual: 'bolt_generic', school: 'poison', scale: 0.7 },
  kindly_light: { visual: 'bolt_generic', school: 'holy' }, writ_of_guilt: { visual: 'bolt_generic', school: 'holy' },
  hallowed_ground: 'ring_of_dawn', sanctuary: { visual: 'ring_of_dawn', scale: 0.9 }, great_post: { visual: 'ring_of_dawn', scale: 0.8 },
  dawnfall: { visual: 'ring_of_dawn', school: 'dawn' }, null_circle: { visual: 'ground_generic', school: 'holy' },
  judgement: { visual: 'thunder_strike', school: 'holy' }, consecrate: { visual: 'ring_of_dawn', scale: 0.7 },
  toxic_cloud: 'poison_cloud', smoke: { visual: 'poison_cloud', school: 'shadow', scale: 0.7 },
  blizzard: 'blizzard', stillfrost: { visual: 'ground_generic', school: 'ice' },
  meteor: 'meteor', called_star: { visual: 'meteor', school: 'arcane' }, starfall_arrow: { visual: 'meteor', school: 'arcane', scale: 0.7 },
  fire_wall: 'fire_wall', flashover: { visual: 'ground_generic', school: 'fire' }, flask_grenade: 'flask_throw',
  rain_of_arrows: 'arrow_rain', caltrop_scatter: { visual: 'ground_generic', school: 'physical', scale: 0.5 },
  hunters_snare: { visual: 'ground_generic', school: 'nature', scale: 0.5 },
  skybreaker: 'thunder_strike', tempest_eye: { visual: 'thunder_strike', scale: 1.2 },
  frost_nova: 'frost_nova', thunderclap: { visual: 'nova_generic', school: 'lightning' },
  flamethrower: 'breath_cone', scorch: { visual: 'elemental_slash', school: 'fire' },
  renew: 'nature_heal', mending_rain: { visual: 'ground_generic', school: 'nature' }, elder_grove: { visual: 'summon_circle', school: 'nature' },
  mending_post: { visual: 'ground_generic', school: 'nature', scale: 0.6 }, rootgrasp: { visual: 'ground_generic', school: 'nature' },
  wolf_shape: 'shapeshift_puff', bear_shape: 'shapeshift_puff', cat_shape: 'shapeshift_puff',
  call_wolf: { visual: 'summon_circle', school: 'nature' }, call_bear: { visual: 'summon_circle', school: 'nature', scale: 1.3 },
  call_spirit: { visual: 'summon_circle', school: 'holy' }, bind_imp: 'summon_circle', raise_thrall: 'summon_circle',
  buried_march: { visual: 'summon_circle', scale: 1.4 }, host_of_shades: { visual: 'summon_circle', scale: 1.2 },
  deploy_sentry: { visual: 'summon_circle', school: 'physical', scale: 0.8 }, corpse_pyre: { visual: 'summon_circle', school: 'fire' },
  void_rift: { visual: 'summon_circle', scale: 1.6 }, abyss_gate: { visual: 'summon_circle', scale: 2.2 },
  warcry: 'battle_shout', rally: { visual: 'battle_shout', school: 'holy' }, challenge: 'battle_shout', red_haze: 'battle_shout',
  quicken: { visual: 'buff_generic', school: 'haste' }, mana_shield: { visual: 'buff_generic', school: 'arcane' },
  storm_beam: 'chain_lightning', static_lash: { visual: 'chain_lightning', scale: 0.7 },
  drain: { visual: 'beam_generic', school: 'shadow' }, silver_moonlight: { visual: 'beam_generic', school: 'moon' },
  inner_stillness: { visual: 'heal_generic', school: 'physical' },
  // the rebuilt class trees (2026-11-26, the "TRIPLE the graphics" round): big named looks
  fireball: 'fireball', ground_slam: 'ground_slam', leap_strike: 'leap_slam', savage_leap: 'leap_slam',
  whirlwind: 'whirlwind', cleave: 'cleave_arc', shield_bash: { visual: 'shield_bash', school: 'physical' }, charge: 'charge_rush',
  war_cry: 'war_cry', earthquake: 'earthquake', world_breaker: { visual: 'earthquake', scale: 1.2 }, mountain_fist: { visual: 'earthquake', scale: 0.8 },
  ice_spikes: 'ice_spikes', deep_freeze: { visual: 'frost_nova', scale: 1.2 }, sunlance: 'line_wave', divine_hammer: { visual: 'line_wave', scale: 1.2 },
  lightning_strike: 'thunder_strike', teleport: { visual: 'nova_generic', school: 'arcane', scale: 0.7 },
  arcane_blast: { visual: 'breath_cone', school: 'arcane', scale: 1.3 }, flame_wave: { visual: 'breath_cone', scale: 1.5 },
  smite: { visual: 'thunder_strike', school: 'holy' }, holy_nova: { visual: 'nova_generic', scale: 1.25 },
  multi_shot: 'arrow', explosive_arrow: 'fireball', volley: 'arrow_rain', fan_of_knives: { visual: 'whirlwind', scale: 1.1 },
  poison_cloud: 'poison_cloud', thunderclap: { visual: 'nova_generic', school: 'lightning', scale: 1.25 },
  corpse_explosion: { visual: 'fireball', school: 'shadow' }, bone_spikes: { visual: 'ice_spikes', school: 'shadow' },
  chain_lightning: 'chain_lightning',
};

/** the visual for a spell nobody named: by target kind, element and flags */
function guess(id, row) {
  const k = targetKind(row), el = row.element || 'physical', shape = row.shape;
  const heal = !!(row.heal || row.healPower);
  if (row.form) return { visual: 'shapeshift_puff', school: el };
  if (shape === 'leap') return { visual: 'leap_slam', school: el };
  if (row.summon || shape === 'summon') return { visual: 'summon_circle', school: el };
  if (shape === 'dash') return { visual: 'charge_rush', school: el };
  if (k === 'bolt') return el === 'physical' ? { visual: 'arrow' } : { visual: 'bolt_generic', school: el };
  if (k === 'ground') return el === 'physical' ? { visual: 'arrow_rain' } : el === 'fire' ? { visual: 'fireball' } : { visual: 'ground_generic', school: el };
  if (k === 'cone') return el === 'physical' ? { visual: 'cleave_arc', ...((row.arc || 0) < 2 ? { scale: 0.85 } : {}) } : { visual: 'elemental_slash', school: el };
  if (k === 'beam') return { visual: 'beam_generic', school: el };
  if (k === 'line') return el === 'physical' ? ((row.width || 0) >= 4 ? { visual: 'earthquake' } : { visual: 'line_wave', school: 'physical', scale: 0.8 }) : el === 'ice' ? { visual: 'ice_spikes' } : { visual: 'line_wave', school: el };
  if (shape === 'around') {
    if (el === 'physical') return row.knock?.down ? { visual: 'ground_slam' } : { visual: 'whirlwind' };
    return el === 'ice' ? { visual: 'frost_nova' } : { visual: 'nova_generic', school: el };
  }
  if (heal) return { visual: 'heal_generic', school: el === 'physical' ? 'holy' : el };
  return { visual: el === 'physical' ? 'battle_shout' : 'buff_generic', ...(el === 'physical' ? {} : { school: el }) };
}

const spells = {};
const counts = {};
const labList = {};   // for the Spell Lab's picker only: id -> [name, target kind, element]
for (const id of Object.keys(rules.spells).sort()) {
  const row = spellRow(rules, id, { rank: 1 });
  let m = HAND[id] ?? guess(id, row);
  if (typeof m === 'string') m = { visual: m };
  if (!data.visuals[m.visual]) throw new Error(`${id}: no visual ${m.visual}`);
  // keep the school only when it differs from the visual's own
  const own = data.visuals[m.visual].school;
  const el = m.school ?? (row.element && row.element !== 'physical' ? row.element : null);
  const out = { visual: m.visual };
  if (el && el !== own && !(own === 'ice' && el === 'ice')) out.school = el;
  if (m.scale && m.scale !== 1) out.scale = m.scale;
  spells[id] = Object.keys(out).length === 1 ? out.visual : out;
  labList[id] = [row.name || id, targetKind(row), row.element || 'physical'];
  counts[m.visual] = (counts[m.visual] || 0) + 1;
}

data.spells = spells;
data.fallback = {
  'bolt:fire': 'fire_bolt', 'bolt:ice': 'frost_bolt', 'bolt:arcane': 'arcane_missile', 'bolt:shadow': 'shadow_bolt', 'bolt:nature': 'nature_bolt',
  'bolt:physical': 'arrow', bolt: 'bolt_generic',
  'ground:holy': 'ring_of_dawn', 'ground:poison': 'poison_cloud', 'ground:ice': 'blizzard', 'ground:lightning': 'thunder_strike', 'ground:physical': 'arrow_rain', ground: 'ground_generic',
  'ground:fire': 'fireball',
  'cone:physical': 'cleave_arc', 'cone:fire': 'breath_cone', cone: 'elemental_slash',
  'line:lightning': 'chain_lightning', 'line:physical': 'charge_rush', 'line:ice': 'ice_spikes', line: 'line_wave', beam: 'beam_generic',
  'self:ice': 'frost_nova', 'self:physical': 'war_cry', self: 'buff_generic',
};
// readable: a layer (has "type"), a short array or a short object stays on one line
function pretty(v, ind = '') {
  const one = JSON.stringify(v);
  if (v === null || typeof v !== 'object') return one;
  const small = one.length < 110 || (!Array.isArray(v) && 'type' in v) || (Array.isArray(v) && v.every(x => typeof x !== 'object'));
  if (small) return one.replace(/":/g, '": ').replace(/,(?=["\[{\d-])/g, ', ');
  const next = ind + '  ';
  if (Array.isArray(v)) return '[\n' + v.map(x => next + pretty(x, next)).join(',\n') + '\n' + ind + ']';
  return '{\n' + Object.entries(v).map(([k, x]) => next + JSON.stringify(k) + ': ' + pretty(x, next)).join(',\n') + '\n' + ind + '}';
}
writeFileSync(FILE, pretty(data) + '\n');
mkdirSync(join(HERE, '..', 'data'), { recursive: true });
writeFileSync(join(HERE, '..', 'data', 'oathwild-spells.json'), JSON.stringify({ _doc: 'Oathwild spell names for the Spell Lab picker (written by tools/map-spells.mjs): id -> [name, target kind, element].', spells: labList }) + '\n');
console.log(`${Object.keys(spells).length} spells mapped onto ${Object.keys(counts).length} visuals:`);
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`).join(', '));
