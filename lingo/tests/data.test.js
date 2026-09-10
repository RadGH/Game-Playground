// Data validation: every phrase in grammar.json expands cleanly for every sample speaker (no unresolved {x?} or .mod? markers,
// no empty output), every lexicon entry has the forms its type declares, every trait tag is used somewhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Lingo, Speaker, parseTemplate } from '../js/lingo.js';
import { MemoryBank, generateEvent, memoryBindings } from '../js/memory.js';
import { Scene } from '../js/context.js';
const read = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url)));
const lexicon = read('lexicon.json'), grammar = read('grammar.json'), traits = read('traits.json'), speakersData = read('speakers.json'), EV = read('events.json').types, SCENES = read('scenes.json').scenes;
const lingo = new Lingo({ lexicon, grammar, traits, seed: 42 });
const speakers = speakersData.speakers.map(s => new Speaker({ id: s.id, name: s.name, entry: lingo.lexicon.get(s.entry), lexicon: lingo.lexicon, speech: s.speech }));

test('all templates parse', () => {
  for (const [name, list] of Object.entries(lingo.grammar.symbols)) for (const e of list) assert.doesNotThrow(() => parseTemplate(e.t), `${name}: ${e.t}`);
});

test('every entry expands without unresolved markers for every speaker/listener pair', () => {
  const bad = [];
  for (const [name, list] of Object.entries(lingo.grammar.symbols)) for (const e of list) {
    for (let i = 0; i < speakers.length; i++) {
      const sp = speakers[i], li = speakers[(i + 3) % speakers.length];
      const ctx = { speaker: sp, listener: li, opinion: 0, scene: new Scene(SCENES[i % SCENES.length], lingo.lexicon) };
      Object.assign(ctx, ctx.scene.bindings());
      if (name.startsWith('recall')) { // memory symbols need a memory: roll one of the matching type (or combat)
        const type = Object.keys(EV).find(t => EV[t].intent === name) || 'combat'; const bank = new MemoryBank({ ownerId: sp.id, traits: sp.traits, eventTypes: EV, lexicon: lingo.lexicon });
        const m = bank.remember(generateEvent(type, EV[type], { lexicon: lingo.lexicon, rng: lingo.rng, participants: [sp.id, li.id], time: 0 }), 0);
        Object.assign(ctx, memoryBindings(m, lingo.lexicon, 30, { speakerId: li.id }));
      }
      if (e.cond && !lingo.cond(e.cond, ctx)) continue; // conditions guard optional bindings (threat, weather…)
      const state = lingo.newState(ctx); if (e.bind) lingo.bind(e.bind, ctx, state);
      const text = lingo.expand(e.t, ctx, state).text;
      if (!text.trim() || /\{[^}]*\?\}|\.\w+\?/.test(text) || /<no \w+>/.test(text)) bad.push(`${name} [${e.id}] with ${sp.name}: "${text}"`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every intent produces a line for every speaker (no personality dead-ends)', () => {
  const bad = [];
  const scene = new Scene(SCENES[0], lingo.lexicon);
  for (const intent of lingo.grammar.intents()) for (const sp of speakers) for (const li of speakers) {
    if (sp === li) continue;
    for (const opinion of [-1, 0, 1]) { const out = lingo.speak(intent, { speaker: sp, listener: li, opinion, scene }); if (out.error || !out.text) bad.push(`${intent} / ${sp.name} → ${li.name} @${opinion}: ${out.error}`); }
  }
  assert.deepEqual(bad, []);
});

test('lexicon entries have the forms their type declares (or a derivable fallback)', () => {
  const bad = [];
  for (const e of lingo.lexicon.all()) {
    const t = lingo.lexicon.types[e.type]; if (!t) { bad.push(`${e.id}: unknown type ${e.type}`); continue; }
    if (!e.forms.sg) bad.push(`${e.id}: missing sg`);
    for (const ref of t.refs || []) if (e[ref] && !lingo.lexicon.has(e[ref])) bad.push(`${e.id}: ${ref} → unknown entry ${e[ref]}`);
  }
  assert.deepEqual(bad, []);
});

test('traits reference tags that exist in the grammar', () => {
  const used = new Set(); for (const list of Object.values(lingo.grammar.symbols)) for (const e of list) for (const t of e.tags || []) used.add(t);
  const derived = new Set(['formal', 'casual', 'crude', 'long', 'short', 'happy', 'gloomy', 'aggressive', 'gentle', 'confident', 'timid', 'angry', 'sad', 'joyful', 'friendly', 'hostile']);
  const unused = [];
  for (const t of traits.traits) for (const tag of Object.keys(t.tagWeights)) if (!used.has(tag) && !derived.has(tag)) unused.push(`${t.id}: ${tag}`);
  assert.deepEqual(unused, []);
});

test('speakers all have valid traits and tics', () => {
  const validTics = new Set(Object.keys(lingo.filters));
  for (const s of speakersData.speakers) { for (const t of s.speech.traits) assert.ok(lingo.traits[t], `${s.id}: unknown trait ${t}`); for (const tic of s.speech.tics) assert.ok(validTics.has(tic), `${s.id}: unknown tic ${tic}`); }
});

test('sample conversation reads sensibly (smoke)', () => {
  const [thalen, mara] = speakers; const lines = lingo.converse(thalen, mara, { turns: 8, opinionAB: -0.5, opinionBA: -0.6 });
  assert.equal(lines.length, 8); for (const l of lines) { assert.ok(l.text.length > 1); console.log(`  ${l.speaker.name.padEnd(16)} [${l.intent}] ${l.text}`); }
});
