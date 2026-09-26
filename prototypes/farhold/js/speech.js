// Farhold phase 7 — speech.
//
// The people in the towns stop reciting one fixed line each. `lingo/` generates what they say from
// their own personality, and `voice-lab/`'s formant engine says it aloud in a voice built from their
// role, gender and seed — so the smith in one town does not sound like the smith in the next.
//
//   const speech = await createSpeech();
//   const npc = speech.attach(rawNpc);        // gives them traits, sliders and a voice
//   speech.line(npc, 'greet', { listener });  // "Well met. The road has been quiet."
//   speech.say(npc, text);                    // out loud, if audio is allowed
//
// Everything degrades quietly: if the language data will not load, `line()` falls back to the
// role's written greeting, and `say()` simply does nothing.

import { Lingo, Speaker } from '../../../lingo/js/lingo.js';
import { voiceFor } from '../../../shared/voices.js';
import { say as speakAloud, stopAll } from '../../../voice-lab/js/voice.js';

/** Personality by role: what kind of person stands behind that counter. */
const ROLE_SPEECH = {
  merchant: { traits: ['greedy', 'talkative'], formality: 0.45, cheer: 0.6, verbosity: 0.6, confidence: 0.6 },
  smith: { traits: ['gruff', 'proud'], formality: 0.3, cheer: 0.35, verbosity: 0.35, confidence: 0.75 },
  innkeeper: { traits: ['kind', 'talkative'], formality: 0.4, cheer: 0.8, verbosity: 0.7, confidence: 0.55 },
  elder: { traits: ['wise', 'formal'], formality: 0.85, cheer: 0.45, verbosity: 0.65, confidence: 0.7 },
  guard: { traits: ['blunt', 'dutiful'], formality: 0.5, cheer: 0.25, verbosity: 0.25, confidence: 0.8 },
  villager: { traits: ['nervous', 'kind'], formality: 0.35, cheer: 0.5, verbosity: 0.45, confidence: 0.35 },
};

/** Which of shared/voices.js's timbres a role sounds like. */
const ROLE_VOICE = {
  merchant: 'villager', smith: 'brute', innkeeper: 'villager',
  elder: 'scholar', guard: 'brute', villager: 'villager',
};

const INTENTS = ['greet', 'farewell', 'smalltalk'];

/**
 * R27 M4 — WHAT A GATE GUARD SAYS TO YOU, BY YOUR STANDING WITH WHOEVER HOLDS THE GROUND.
 *
 * One line per band. `Known` is the faction's own `greeting` out of data/factions.json — that is
 * the line they wrote for a stranger with coin — and the others name the faction the way the rest
 * of the game does (`short`, "the Reach"), so the guard is plainly theirs. Plain sentences (see
 * WORDING.md): a challenge says what happens, not how it feels.
 */
export const GATE_LINES = {
  hunted: 'You are wanted by {short}. The gate stays shut, and we will cut you down outside it.',
  disliked: '{Short} has no love for you. Pay the gate fee or walk on.',
  known: null,
  trusted: 'Welcome back. {Short} keeps a place for you here.',
  sworn: 'Make way — sworn to {short}. The gate is yours.',
};

/** A gate guard's line for this band. `faction` is a data/factions.json row (or null). */
export function gateLine(band, faction = null) {
  const short = faction?.short || faction?.name || 'the watch';
  const cap = short.charAt(0).toUpperCase() + short.slice(1);
  if (band === 'known' || !GATE_LINES[band]) return faction?.greeting || 'State your business at the gate.';
  return GATE_LINES[band].replace('{short}', short).replace('{Short}', cap);
}

export async function createSpeech({ base = new URL('../../../lingo/data/', import.meta.url).href, enabled = true } = {}) {
  let lingo = null;
  let failure = null;
  let voiceOn = enabled;

  if (enabled) {
    try {
      const [lexicon, grammar, traits] = await Promise.all(
        ['lexicon', 'grammar', 'traits'].map(f => fetch(`${base}${f}.json`).then(r => {
          if (!r.ok) throw new Error(`${f}.json ${r.status}`);
          return r.json();
        })),
      );
      lingo = new Lingo({ lexicon, grammar, traits });
    } catch (err) {
      failure = err?.message || String(err);
    }
  }

  /** Give an NPC a personality and a voice. Safe to call twice. */
  function attach(npc) {
    if (npc.speaker) return npc;
    const spec = ROLE_SPEECH[npc.role] || ROLE_SPEECH.villager;
    const seed = hash(npc.id + npc.name);
    npc.speech = { ...spec };
    npc.voice = voiceFor({
      role: ROLE_VOICE[npc.role] || 'villager',
      gender: npc.gender || 'n',
      seed,
    });
    if (lingo) {
      npc.speaker = new Speaker({ id: npc.id, name: npc.name, speech: npc.speech });
    }
    return npc;
  }

  /**
   * What this person says right now. Falls back to their written greeting when the language data
   * is not there, so a town is never silent in text.
   */
  function line(npc, intent = 'greet', ctx = {}) {
    attach(npc);
    if (!lingo || !npc.speaker) return npc.greeting || '…';
    try {
      const out = lingo.speak(INTENTS.includes(intent) ? intent : 'greet', {
        speaker: npc.speaker,
        listener: ctx.listener || null,
        ...ctx,
      });
      const text = (out?.text || '').trim();
      return text.length > 1 ? text : (npc.greeting || '…');
    } catch {
      return npc.greeting || '…';
    }
  }

  /** Say it out loud. Never throws, never blocks. */
  async function say(npc, text) {
    if (!voiceOn || !text) return false;
    attach(npc);
    try {
      await speakAloud(text, npc.voice, { volume: 0.9 });
      return true;
    } catch {
      return false;
    }
  }

  return {
    attach, line, say,
    get ready() { return !!lingo; },
    get failure() { return failure; },
    get voiceOn() { return voiceOn; },
    setVoice(v) { voiceOn = v; if (!v) stopAll(); return voiceOn; },
    stop: () => { try { stopAll(); } catch { /* ignore */ } },
    stats: () => ({ lingo: !!lingo, voice: voiceOn, failure }),
  };
}

function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
