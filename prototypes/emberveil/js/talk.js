// Dialogue + voice glue: lingo Speakers for members and NPCs, combat reactions, area descriptions, camp talk.
import { Speaker, Entity } from '../../../lingo/js/lingo.js';
import { Scene } from '../../../lingo/js/context.js';
import { lexiconEntryFor } from '../../../library/js/make.js';

// Adapted from prototypes/party-quest/js/talk.js: lingo speakers + combat reactions, no memory/relations here.
export class Talk {
  constructor({ lingo, game, voice = null }) { this.lingo = lingo; this.game = game; this.voice = voice; this.speakers = new Map(); this.muted = false; this.engineOverride = ''; }
  /** lingo Speaker for a member/NPC (adds a lexicon entry so names, pronouns and pronunciation work). */
  speaker(ch) {
    if (this.speakers.has(ch.id)) return this.speakers.get(ch.id);
    let entry = ch.entry ? this.lingo.lexicon.get(ch.entry) : null;
    if (!entry) entry = lexiconEntryFor({ ...ch, id: ch.id, name: ch.name, short: ch.short, race: ch.race, pronouns: ch.pronouns, respell: ch.respell });
    // memories and relationship lines refer to people by game id, so the lexicon must know this id (even when the entry came from a named lexicon character)
    if (!this.lingo.lexicon.has(ch.id) || this.lingo.lexicon.get(ch.id) !== entry) { entry = { ...entry, id: ch.id, forms: { ...entry.forms } }; this.lingo.lexicon.add(entry); this.lingo.invalidatePronunciations(); }
    const sp = new Speaker({ id: ch.id, name: ch.short || ch.name, entry, lexicon: this.lingo.lexicon, speech: ch.speech || { traits: [] } }); this.speakers.set(ch.id, sp); return sp;
  }
  ctx(from, to, extra = {}) { const ctx = { speaker: this.speaker(from), listener: to ? this.speaker(to) : undefined, ...extra }; return ctx; }
  scene(zoneId) { const Z = this.game.zone(zoneId); const act = Z?.act || 0; const tags = { 0: ['quiet', 'wild'], 1: ['wild', 'crowded'], 2: ['hot', 'ruined', 'dark'], 3: ['hot', 'dark', 'loud'], 4: ['dark', 'cold', 'quiet'], 5: ['dark', 'enclosed', 'damp'], 6: ['high', 'cold', 'ruined'] }[act] || ['wild']; return new Scene({ id: zoneId, name: Z?.name || zoneId, place: { id: zoneId, type: 'place', proper: true, forms: { sg: Z?.name || zoneId } }, tags, danger: Math.min(0.9, 0.2 + act * 0.12), comfort: 0.4, timeOfDay: 'day' }, this.lingo.lexicon); }
  /** Generate a line. Returns { text, speech, intent, tags } or null. */
  line(from, intent, { to = null, scene = null, bindings = {} } = {}) { try { const out = this.lingo.speak(intent, this.ctx(from, to, { scene: scene || this.scene(this.game.zoneId), ...bindings })); return out && out.text ? out : null; } catch (e) { console.warn('line failed', intent, e); return null; } }
  
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
