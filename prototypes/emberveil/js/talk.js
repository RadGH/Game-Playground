// Dialogue + voice glue: lingo Speakers for members and NPCs, combat reactions, area descriptions, camp talk.
import { Speaker, Entity } from '../../../lingo/js/lingo.js';
import { Scene } from '../../../lingo/js/context.js';
import { lexiconEntryFor } from '../../../library/js/make.js';
import { voiceFor } from '../../../shared/voices.js';

// ---------------------------------------------------------------- what is in the hand
// A line that talks about a weapon has to mean the weapon the hero is actually holding. Before this
// existed, the ammunition bark picked a random word out of the lexicon and archers shouted "I'm out
// of bows!". Now every line a character speaks carries three extra bindings —
//   weapon      the equipped weapon as an Entity, so {weapon} reads "longsword"
//   weaponType  the family below, so a phrase can say cond: "weaponType==='bow'"
//   ammo        what that weapon runs out of, or nothing at all
// — and a phrase that mentions ammunition is written with cond: "ammo", so a sword or a staff is
// never offered it. See lingo/data/grammar.json (combat_bark, brag).

/** Weapon subtype (data/items.json weaponBases) → the family spoken lines care about. */
export const WEAPON_KINDS = {
  bow: 'bow', crossbow: 'crossbow', sling: 'sling',
  javelin: 'thrown', dart: 'thrown', throwing: 'thrown', knife: 'thrown',
  staff: 'caster', wand: 'caster', scepter: 'caster', orb: 'caster', tome: 'caster',
  sword: 'blade', sword2h: 'blade', dagger: 'blade', axe: 'blade', axe2h: 'blade',
  polearm: 'polearm', spear: 'polearm',
  hammer: 'blunt', mace: 'blunt', club: 'blunt',
};
/** What each of those runs out of. A family that is not here has no ammunition and never says so. */
export const WEAPON_AMMO = {
  bow: ['arrow', 'arrows'],
  crossbow: ['bolt', 'bolts'],
  sling: ['stone', 'stones'],
  thrown: ['throwing knife', 'throwing knives'],
};
/** The families that shoot or throw something. */
export const RANGED_KINDS = Object.keys(WEAPON_AMMO);
/** Which family is this weapon? An unknown subtype counts as melee, which is the quiet answer. */
export function weaponKind(it) {
  if (!it) return '';
  const sub = String(it.subtype || it.baseKey || '').toLowerCase();
  if (WEAPON_KINDS[sub]) return WEAPON_KINDS[sub];
  for (const [k, kind] of Object.entries(WEAPON_KINDS)) if (sub.includes(k)) return kind;
  return 'blade';
}
/** `{ sg, pl }` for what this weapon runs out of, or null when it runs out of nothing. */
export function ammoFor(it) {
  const kind = weaponKind(it);
  // a javelin IS its own ammunition, so it keeps its own name rather than borrowing a knife's
  const sub = String(it?.subtype || '').toLowerCase();
  if (sub === 'javelin') return { sg: 'javelin', pl: 'javelins' };
  const a = WEAPON_AMMO[kind];
  return a ? { sg: a[0], pl: a[1] } : null;
}

// ---------------------------------------------------------------- the Narrator
/** The id the Narrator speaks under. Nothing on the stage ever has it, so it draws no bubble. */
export const NARRATOR_ID = 'narrator';
// Anything inside quotation marks is somebody talking, even in the middle of a description, so the
// test looks at the words outside the quotes only.
const QUOTED = /"[^"]*"|“[^”]*”|'(?:[^']{6,})'/g;
const FIRST_PERSON = /\b(i|i'm|i'll|i've|i'd|my|me|we|we're|we've|we'll|our|us|let's)\b/i;
/**
 * Is this line the scene describing itself, rather than a person speaking?
 *
 * Event data in data/random-events.json labels its scene-setting paragraphs `speaker: "hero"` —
 * "A massive wolf is caught in a rusted trap, too exhausted to snarl." A hero must never read those
 * out. The test is simple and holds on the real data (102 of the 104 hero-labelled lines are scene
 * text): a line with no first-person words outside its quotation marks is the scene talking.
 */
export function isSceneText(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  if (/^["'“‘]/.test(t)) return false;                 // the whole line is a quote: somebody said it
  return !FIRST_PERSON.test(t.replace(QUOTED, ' '));
}

// ---------------------------------------------------------------- speaker typing
// Combat phrases in lingo/data/grammar.json carry two extra tag families: enemy kind and hero role.
// A speaker's speech.tagWeights boosts its own tag and sets the others to 0 (0 = never picked), so
// one pool serves every kind of mouth without duplicating phrases per enemy type.
export const ENEMY_KINDS = ['goblin', 'bandit', 'cultist', 'undead', 'demon', 'void', 'dragon', 'knight'];
export const HERO_ROLES = ['tank', 'healer', 'caster', 'rogue', 'ranger'];

/** Which family of enemy is this template? Used to pick the tagged openers/taunts. */
export function enemyKind(templateId = '') {
  const id = String(templateId).toLowerCase();
  if (/cult|prophet|sorcer|scholar|herald|warden|acolyte|priest|veil_/.test(id)) return 'cultist';
  if (/knight|paladin|templar|sentinel|myrmidon/.test(id)) return 'knight';
  if (/dragon|wyrm|drake|whelp/.test(id)) return 'dragon';
  if (/skeleton|ghoul|wraith|lich|undead|bone|shade|zombie|wight|revenant/.test(id)) return 'undead';
  if (/demon|imp|fiend|hell|fel|abyss|archfiend/.test(id)) return 'demon';
  if (/void|star|cosmic|reality|shard|null|genesis|primordial|echo|unravel|architect/.test(id)) return 'void';
  if (/goblin|gremlin|kobold|orc|ogre|troll/.test(id)) return 'goblin';
  return 'bandit';
}
/** Which role does this class play? Used to pick role-flavoured hero lines. */
export function heroRole(role = '') {
  const r = String(role).toLowerCase();
  if (/tank|frontline|bulwark|protector|defend|warrior|paladin|knight/.test(r)) return 'tank';
  if (/heal|support|medic|priest|maestro/.test(r)) return 'healer';
  if (/ranged|archer|marksman|precision|shot|bow/.test(r)) return 'ranger';
  if (/assassin|duelist|stealth|rogue|blade|striker|killer|skirmisher|martial|artist/.test(r)) return 'rogue';
  if (/mage|caster|arcane|magic|spell|element|summon|chaos|time|mind|spirit|rune|holy|shadow|fire|frost|storm|glass|cannon|builder|mechanist|manipulat|resource|specialist|controller/.test(r)) return 'caster';
  return '';
}
/** tagWeights that turn on one tag out of a family and turn the rest off. */
function only(family, tag, on = 3) { const w = {}; for (const t of family) w[t] = t === tag ? on : 0; return w; }
// Personality per enemy family, so the same pool comes out cruel, hollow, greedy… depending on who speaks.
const KIND_SPEECH = {
  goblin: { traits: ['greedy', 'cruel'], formality: 0.05, aggression: 0.85, confidence: 0.5, cheer: 0.6 },
  bandit: { traits: ['gruff', 'greedy'], formality: 0.2, aggression: 0.7, confidence: 0.7, cheer: 0.4 },
  cultist: { traits: ['pious', 'cruel'], formality: 0.8, aggression: 0.6, confidence: 0.8, cheer: 0.2 },
  undead: { traits: ['grieving'], formality: 0.5, aggression: 0.6, confidence: 0.5, cheer: 0.05, mood: -0.6 },
  demon: { traits: ['cruel', 'sarcastic'], formality: 0.6, aggression: 0.9, confidence: 0.95, cheer: 0.3 },
  void: { traits: ['scholar', 'cynical'], formality: 0.75, aggression: 0.5, confidence: 0.9, cheer: 0.1 },
  dragon: { traits: ['pompous', 'cruel'], formality: 0.85, aggression: 0.8, confidence: 1, cheer: 0.2 },
  knight: { traits: ['honorable', 'gruff'], formality: 0.8, aggression: 0.75, confidence: 0.85, cheer: 0.2 },
};

// Adapted from prototypes/party-quest/js/talk.js: lingo speakers + combat reactions, no memory/relations here.
export class Talk {
  constructor({ lingo, game, voice = null }) { this.lingo = lingo; this.game = game; this.voice = voice; this.speakers = new Map(); this.muted = false; this.engineOverride = ''; this.fightLines = new Set(); this._fightKey = null; }
  /** lingo Speaker for a member/NPC (adds a lexicon entry so names, pronouns and pronunciation work). */
  speaker(ch) {
    if (this.speakers.has(ch.id)) return this.speakers.get(ch.id);
    let entry = ch.entry ? this.lingo.lexicon.get(ch.entry) : null;
    if (!entry) entry = lexiconEntryFor({ ...ch, id: ch.id, name: ch.name, short: ch.short, race: ch.race, pronouns: ch.pronouns, respell: ch.respell });
    // memories and relationship lines refer to people by game id, so the lexicon must know this id (even when the entry came from a named lexicon character)
    if (!this.lingo.lexicon.has(ch.id) || this.lingo.lexicon.get(ch.id) !== entry) { entry = { ...entry, id: ch.id, forms: { ...entry.forms } }; this.lingo.lexicon.add(entry); this.lingo.invalidatePronunciations(); }
    const sp = new Speaker({ id: ch.id, name: ch.short || ch.name, entry, lexicon: this.lingo.lexicon, speech: this.speechFor(ch) }); this.speakers.set(ch.id, sp); return sp;
  }
  /** speech section + the tag weights that decide which tagged combat lines this mouth may use. */
  speechFor(ch) {
    const base = ch.speech ? { ...ch.speech } : { traits: [] };
    // enemies never borrow hero-role lines ("I'm casting — cover me!"), even if their template has a role field
    const role = ch.kindTag ? '' : (ch.roleTag || heroRole(ch.role || (ch.class ? this.game?.classDef?.(ch.class)?.role : '') || ''));
    base.tagWeights = { ...only(ENEMY_KINDS, ch.kindTag || null), ...only(HERO_ROLES, role), ...(base.tagWeights || {}) };
    return base;
  }
  /**
   * The bindings that come from what this character is holding. Every line they speak gets them, so
   * a phrase can both name the weapon ({weapon}) and be gated on what kind it is (cond: "ammo").
   * A character with an empty hand gets nothing, and the gated phrases are simply never offered.
   */
  gearBindings(ch) {
    const it = ch?.equipment?.weapon; if (!it) return {};
    const lex = this.lingo.lexicon;
    const name = String(it.name || 'weapon');
    const base = it.baseKey && lex.has(it.baseKey) ? lex.get(it.baseKey) : null;
    const entry = base && !it.isUnique ? base
      : { id: it.id || it.baseKey || 'weapon', type: 'item', proper: !!it.isUnique, forms: { sg: it.isUnique ? name : name.toLowerCase(), pl: name.toLowerCase() + 's' } };
    const out = { weapon: new Entity(entry, { lexicon: lex }), weaponType: weaponKind(it), weaponSubtype: String(it.subtype || '') };
    const ammo = ammoFor(it);
    if (ammo) out.ammo = new Entity({ id: 'ammo_' + ammo.sg.replace(/\s+/g, '_'), type: 'item', forms: ammo }, { lexicon: lex });
    return out;
  }
  ctx(from, to, extra = {}) { const ctx = { speaker: this.speaker(from), listener: to ? this.speaker(to) : undefined, ...this.gearBindings(from), ...extra }; return ctx; }
  scene(zoneId) { const Z = this.game.zone(zoneId); const act = Z?.act || 0; const tags = { 0: ['quiet', 'wild'], 1: ['wild', 'crowded'], 2: ['hot', 'ruined', 'dark'], 3: ['hot', 'dark', 'loud'], 4: ['dark', 'cold', 'quiet'], 5: ['dark', 'enclosed', 'damp'], 6: ['high', 'cold', 'ruined'] }[act] || ['wild']; return new Scene({ id: zoneId, name: Z?.name || zoneId, place: { id: zoneId, type: 'place', proper: true, forms: { sg: Z?.name || zoneId } }, tags, danger: Math.min(0.9, 0.2 + act * 0.12), comfort: 0.4, timeOfDay: 'day' }, this.lingo.lexicon); }
  /** Generate a line. Returns { text, speech, intent, tags } or null. */
  line(from, intent, { to = null, scene = null, bindings = {} } = {}) { try { const out = this.lingo.speak(intent, this.ctx(from, to, { scene: scene || this.scene(this.game.zoneId), ...bindings })); return out && out.text ? out : null; } catch (e) { console.warn('line failed', intent, e); return null; } }

  // ------------------------------------------------------------ the Narrator
  /**
   * The Narrator. Scene text — "A massive wolf is caught in a rusted trap", "Your companions:
   * silence", the wind coming down off the ridge — is not something a hero or an NPC says out loud,
   * so it never goes to one of their mouths. It gets its own voice (shared/voices.js role
   * `narrator`: slow, low, unhurried) and its own look in the log: italics, no portrait, no bubble
   * over anyone's head.
   *
   * Always the same object, so the voice is the same from the first road to the last.
   */
  narrator() {
    if (!this._narrator) {
      this._narrator = {
        id: NARRATOR_ID, name: 'Narrator', short: 'Narrator', isNarrator: true,
        voice: voiceFor({ role: 'narrator', gender: 'n', seed: 20260913 }),
        speech: { traits: [], formality: 0.7, verbosity: 0.6, cheer: 0.3, aggression: 0.1, confidence: 0.9, mood: -0.1, tics: [], custom: {} },
      };
    }
    return this._narrator;
  }
  /**
   * Wrap a piece of scene text as a Narrator line.
   * @returns {{ who: object, line: { text, speech, narration: true } }|null} null for empty text.
   */
  narrate(text) {
    const t = String(text ?? '').trim();
    if (!t) return null;
    return { who: this.narrator(), line: { text: t, speech: t, narration: true } };
  }
  /** The same for a generated line: hand it the { text } a lingo call returned. */
  narrateLine(out) { return this.narrate(out?.text); }

  // ------------------------------------------------------------ combat openers
  /** Narration (no speaker, so no voice/tics): beast snarls, night raids, ambushes. */
  narration(intent, bindings = {}) {
    try { const out = this.lingo.speak(intent, { scene: this.scene(this.game.zoneId), exclude: this.fightLines, ...bindings }); if (!out || !out.text) return null; this.noteLine(out); return out; } catch (e) { console.warn('narration failed', intent, e); return null; }
  }
  /** Remember which phrase was used so nothing else in this fight repeats it. */
  noteLine(out) { const id = out?.parts?.entry?.id; if (id) this.fightLines.add(id); return out; }
  /** Start of a fight: forget the per-fight opener bans (session-wide anti-repeat lives in lingo). */
  beginFight(key = null) { if (key == null || key !== this._fightKey) { this._fightKey = key; this.fightLines = new Set(); } return this.fightLines; }
  /** Entity for an enemy: the lexicon word for its template, or an ad-hoc one from its name. */
  foeEntity(e, { count = 1, proper = false } = {}) {
    const lex = !proper && e.templateId ? this.lingo.lexicon.get(e.templateId) : null;
    if (lex) return new Entity(lex, { lexicon: this.lingo.lexicon, count });
    const sg = proper ? (e.short || e.name) : String(e.name || 'thing').toLowerCase();
    return new Entity({ id: e.id || e.templateId || sg, type: 'creature', proper, forms: { sg, pl: sg.replace(/y$/, 'ie') + 's' } }, { count, lexicon: this.lingo.lexicon });
  }
  /** Speaker for an enemy, typed by family so it gets that family's phrases and personality. */
  enemySpeaker(e, { kind = null, speech = null } = {}) {
    const k = kind || enemyKind(e.templateId || e.base || e.id);
    return this.speaker({ ...e, kindTag: k, speech: speech || { ...(KIND_SPEECH[k] || KIND_SPEECH.bandit), ...(e.speech || {}) } });
  }
  /** Fight-opening line for a talking enemy (boss → boss_opener). Never repeats another opener this fight. */
  enemyOpener(e, hero, { boss = false, enc = null, kind = null } = {}) {
    this.beginFight(enc || this._fightKey);
    this.enemySpeaker(e, { kind });
    return this.noteLine(this.line(e, boss ? 'boss_opener' : 'enemy_opener', { to: hero, bindings: { exclude: this.fightLines, foe: hero ? this.speaker(hero).entity : undefined } }));
  }
  /** Boss line when it flips into a new phase. */
  bossPhaseLine(e, hero = null) { this.enemySpeaker(e); return this.noteLine(this.line(e, 'boss_phase', { to: hero, bindings: { exclude: this.fightLines } })); }
  /** Wordless enemy: narration instead of speech. */
  beastOpener(e, { enc = null, named = false } = {}) {
    this.beginFight(enc || this._fightKey);
    return this.narration(named ? 'named_beast' : 'beast_snarl', { foe: this.foeEntity(e, { proper: named }) });
  }
  /**
   * Opener for a named enemy / nemesis. Picks the situation from what the game remembers:
   * first meeting, rematch, "I already put one of you down", or "you beat me once".
   * Bindings: defeats (times it beat the party), days (since it last got away), fallen (a hero it dropped).
   */
  namedOpener(L, hero, { enc = null, nemesis = null, rng = Math.random } = {}) {
    this.beginFight(enc || this._fightKey);
    const g = this.game, n = nemesis || L.nemesis || null;
    const defeats = n?.defeats || 0;
    const days = n?.sinceDay != null ? Math.max(0, (g?.day || 0) - n.sinceDay) : 0;
    const slain = g?.namedSlain || [];
    const beatenBefore = !!(L.staticId && slain.includes(L.staticId)) || slain.includes(L.name) || slain.length >= 2;
    const party = (g?.party || []).filter(h => h && h.id);
    const fallen = defeats >= 1 && party.length ? party[Math.floor(rng() * party.length)] : null;
    const intent = fallen && (defeats >= 2 || rng() < 0.5) ? 'named_avenge' : defeats >= 1 ? 'named_rematch' : beatenBefore ? 'named_beaten' : 'named_first';
    this.enemySpeaker(L, { speech: { ...(KIND_SPEECH[enemyKind(L.templateId)] || KIND_SPEECH.bandit), traits: ['cruel', 'pompous'], aggression: 0.95, confidence: 0.9 } });
    const bindings = { exclude: this.fightLines, defeats, days, met: defeats + 1 };
    if (fallen) bindings.fallen = this.speaker(fallen).entity;
    return this.noteLine(this.line(L, intent, { to: hero, bindings }));
  }
  /** Narration when the camp is hit at night, or the road closes on the party. */
  raidOpener(enc, { night = false } = {}) {
    this.beginFight(enc);
    const lead = enc?.enemies?.[0];
    return this.narration(night ? 'night_attack' : 'ambush_opener', lead ? { foe: this.foeEntity(lead, { count: enc.enemies.length }) } : {});
  }


  /** Speak aloud with the character's voice (returns when done). */
  async say(ch, line) {
    if (this.muted || !this.voice || !line) return;
    try { let v = this.voice.normalizeVoice(ch.voice || {}); if (this.engineOverride) v = { ...v, engine: this.engineOverride, variant: this.engineOverride === 'piper' ? (v.gender === 'f' ? 'en_US-hfc_female-medium' : 'en_US-hfc_male-medium') : 'custom' }; const text = ['formant', 'espeak'].includes(v.engine) ? (line.speech || line.text) : line.text; const { done } = await this.voice.say(text, v); await done; } catch (e) { console.warn('voice', e); }
  }
  /** Map a combat event to a reactive line (speaker, intent). Returns null if nobody should talk. */
  combatReaction(ev, party, enemies, rng = Math.random) {
    const alivePartyExcept = id => party.filter(m => m.hp > 0 && m.id !== id);
    const b = (foe) => ({ foe: foe ? new Entity({ id: foe.templateId, type: 'creature', forms: { sg: foe.name, pl: foe.name.replace(/y$/, 'ie') + 's' } }, { count: 1 }) : undefined });
    if (ev.type === 'start') { const m = rng() < 0.5 ? party.find(x => x.hp > 0) : null; return m ? { who: m, intent: 'combat_taunt', bindings: b(enemies[0]) } : null; }
    if (ev.type === 'bloodied' && ev.target.side === 'party') return { who: ev.target, intent: 'combat_hurt' };
    if (ev.type === 'down' && ev.target.side === 'party') { const w = alivePartyExcept(ev.target.id); const m = w[Math.floor(rng() * w.length)]; return m ? { who: m, intent: 'ally_down', bindings: { fallen: this.speaker(ev.target).entity } } : null; }
    if (ev.type === 'kill' && ev.source?.side === 'party' && rng() < 0.6) return { who: ev.source, intent: 'combat_kill', bindings: b(ev.target) };
    if (ev.type === 'spell' && ev.source?.side === 'party' && ev.spell?.line && rng() < 0.7) return { who: ev.source, text: ev.spell.line };
    if (ev.type === 'attack' && rng() < 0.12 && ev.source?.side === 'party') return { who: ev.source, intent: 'combat_bark' };
    if (ev.type === 'win') { const m = party.filter(x => x.hp > 0)[0]; return m ? { who: m, intent: rng() < 0.5 ? 'brag' : 'relief' } : null; }
    return null;
  }
}
