// Build a complete character blueprint from a few choices. Used by Name Forge ("add to library"), the party game
// (custom members, town NPCs) and anything else that needs a whole character quickly.
//   const deps = await loadDeps();   // avatar presets, voice presets, name generator
//   const ch = makeCharacter({ race: 'dwarf', gender: 'f', traits: ['gruff', 'loyal'] }, deps);
import { randomAvatar, makeRng } from '../../avatar-2d/js/random.js';
import { NameGen } from '../../namegen/js/namegen.js';
import { voiceFor } from '../../shared/voices.js';

export async function loadDeps(base = new URL('../../', import.meta.url).href) {
  const j = async p => (await fetch(base + p)).json();
  const [avatarPresets, voicePresets, traits] = await Promise.all([j('avatar-2d/data/presets.json'), j('voice-lab/data/presets.json'), j('lingo/data/traits.json')]);
  const namegen = await NameGen.load(base + 'namegen/data/');
  return { avatarPresets, voicePresets, traits: traits.traits, namegen };
}
const VOICE_BY_RACE = { dwarf: 'ours_elder', giant: 'ours_giant', troll: 'ours_giant', goblin: 'ours_child', gnome: 'ours_child', undead: 'ours_whisper', dragon: 'ours_giant' };
const AVATAR_RACE = { human: 'human', elf: 'elf', dwarf: 'dwarf', halfling: 'human', gnome: 'human', giant: 'human', troll: 'orc', orc: 'orc', goblin: 'goblin', dragon: 'beast', undead: 'undead', fey: 'elf' };
/**
 * opts: { race, gender ('m'|'f'|'n'), name, traits: [], seed, avatar (override), voice (override), speech (override), kind ('character'|'npc'), title }
 */
export function makeCharacter(opts, deps) {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9); const rng = makeRng(seed);
  const race = opts.race || rng.pick(['human', 'elf', 'dwarf', 'halfling', 'orc', 'goblin']); const gender = opts.gender || rng.pick(['m', 'f', 'm', 'f', 'n']);
  const named = opts.name ? null : deps.namegen.generate('person.full', { race, gender, seed });
  const name = opts.name || named.text; const short = named?.forms.short || name.split(' ')[0];
  const pronouns = gender === 'm' ? 'he' : gender === 'f' ? 'she' : 'they';
  const avatar = opts.avatar || randomAvatar(deps.avatarPresets, { race: AVATAR_RACE[race] || 'human', seed });
  const vp = deps.voicePresets.presets.find(p => p.id === (VOICE_BY_RACE[race] || (gender === 'f' ? 'ours_female' : gender === 'm' ? 'ours_male' : 'ours_male')))?.voice || { engine: 'formant' };
  const voice = opts.voice || { ...vp, gender: vp.gender || (gender === 'n' ? 'n' : gender), pitch: Math.min(1, Math.max(0, (vp.pitch ?? 0.5) + rng.range(-0.12, 0.12))) };
  const traits = opts.traits || rng.pick([1, 2, 2, 3]) && deps.traits.map(t => t.id).sort(() => rng() - 0.5).slice(0, rng.pick([1, 2, 2, 3]));
  const speech = opts.speech || { traits, formality: +rng.range(0.1, 0.9).toFixed(2), verbosity: +rng.range(0.2, 0.8).toFixed(2), cheer: +rng.range(0.2, 0.8).toFixed(2), aggression: +rng.range(0.1, 0.7).toFixed(2), confidence: +rng.range(0.2, 0.9).toFixed(2), custom: {}, customRate: {}, tics: [], mood: 0 };
  const id = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + seed.toString(36).slice(0, 4);
  return { schema: 1, id, name, short, race, gender, pronouns, title: opts.title, entry: null, respell: named?.respell, nameGloss: named?.gloss?.join(' + ') || undefined, avatar, voice, speech, kind: opts.kind || 'character', seed };
}
/** Lingo lexicon entry for a made character (so {listener.name}, pronouns, race and pronunciation work). */
export function lexiconEntryFor(ch) { return { id: ch.id, type: 'person', proper: true, pronouns: ch.pronouns || 'they', race: ch.race, title: ch.title, forms: { sg: ch.name, short: ch.short || ch.name.split(' ')[0] }, tags: ['npc'], pron: ch.respell ? { respell: ch.respell } : undefined }; }

/**
 * Random NPC for towns, roads and enemy captains: a generic look (no class-specific parts unless `allowBespoke`), a decal
 * for variety, a role voice from shared/voices.js and Name Forge name. opts: { race, gender, role ('villager'|'merchant'|'elder'|'child'|'goblin'|'cultist'|…), seed, title, decal (extras id | 'random' | null), allowBespoke, name }
 */
export function makeNpc(opts, deps) {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9); const rng = makeRng(seed); const role = opts.role || 'villager';
  const ch = makeCharacter({ ...opts, seed, kind: 'npc', title: opts.title || role, avatar: opts.avatar || randomAvatar(deps.avatarPresets, { race: AVATAR_RACE[opts.race] || opts.race || 'human', seed, allowBespoke: !!opts.allowBespoke }) }, deps);
  const decals = ['none', 'none', 'freckles', 'scar', 'scar_cheek', 'dirt', 'soot', 'mud', 'paint_dots', 'blood', 'brand', 'pale', 'cheek_stripes', 'eye_black', 'burn_scar', 'nose_scar', 'freckles_heavy', 'war_stripe', 'warpaint'];
  const decal = opts.decal === 'random' || opts.decal == null ? rng.pick(decals) : opts.decal; ch.avatar.extras = { id: decal, color: rng.pick(['#c83a2a', '#333', '#8a6a3a', '#e0e0e0', '#5a3a8a']) };
  ch.voice = voiceFor({ role, gender: ch.gender, seed }); ch.role = role; return ch;
}
