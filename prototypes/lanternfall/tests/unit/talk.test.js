// M10 talk tests (docs/01 §12.8 rule 6, docs/10 §10.1): every speaker speaks every intent it is assigned with no
// stray '{', the pools are wide enough, the new-intent budget holds, traits/tics/voice roles are real, the pack
// covers every speaker and monster, fixed lines exist, and the bark throttle keeps 01's table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as L from '../../../../lingo/js/lingo.js';
import { ROLE_VOICES } from '../../../../shared/voices.js';
import { createTalk, splitPronunciations, isSceneText } from '../../js/talk/lingo-bridge.js';
import { createBarks } from '../../js/talk/barks.js';
import { createBus } from '../../js/core/bus.js';
import { loadJson } from './helpers.js';

const lingoJson = f => JSON.parse(readFileSync(new URL('../../../../lingo/data/' + f, import.meta.url), 'utf8'));
const FILES = { lexicon: lingoJson('lexicon.json'), grammar: lingoJson('grammar.json'), traits: lingoJson('traits.json'), events: lingoJson('events.json'),
  pack: lingoJson('packs/lanternfall.json'), extra: loadJson('data/grammar-lanternfall.json'), npcs: loadJson('data/npcs.json'), eventsExtra: loadJson('data/events-lanternfall.json') };
const talkFor = (seed = 7) => createTalk({ seed, files: FILES, lingoModule: L });
const { npcs, extra, pack } = { npcs: FILES.npcs, extra: FILES.extra, pack: FILES.pack };
const TRAITS = new Set(FILES.traits.traits.map(t => t.id));
const TICS = new Set(['um', 'drawl', 'shout', 'whisper', 'hesitant', 'archaic', 'lisp', 'growl', 'clipped', 'flowery', 'curses', 'thirdperson', 'pirate', 'posh']);
const FLAGS = ['tallow_cooled', 'pim_trusted', 'hollis_lantern', 'pale_kept', 'nell_alive', 'widow_mercy', 'knell_spared', 'corvin_freed'];
const MONSTERS = ['wax_mite', 'soot_pigeon', 'dripling', 'tallow_hound', 'gutter_rat', 'rat_chorister', 'rope_scuttler', 'fatberg', 'maw_fry', 'sluice_eel', 'sluice_crab', 'drowned_lockkeeper',
  'oilback', 'lampeater', 'clapperling', 'tumbler', 'echo_bat', 'bronze_sentinel', 'stormgull', 'rainwraith', 'rootgnarl', 'hailstone_golem',
  'unlit_creeper', 'unlit_hound', 'unlit_stalker', 'unlit_wickthief', 'knell_novice', 'knell_hookman', 'knell_lampbreaker', 'knell_maulbearer'];
const BAD = /[{}]|\?}|<no |undefined|NaN|\[object/;

/** A context that gives each intent what it may ask for, cycling tags so every tagged line gets a turn. */
function ctxFor(npc, intent, i) {
  const hint = Object.entries(extra.lines).find(([id, l]) => id.startsWith('hint_') && l.speaker === npc.id)?.[1]?.flag;
  const act = (npc.places?.[0] || 'a1').slice(0, 2).replace('a', 'act');
  switch (intent) {
    case 'hush_chirr': return { tag: ['wall', 'grapple', 'oil', 'dark', 'hurt', 'happy', 'scared', 'idle'][i % 8] };
    case 'kindling_hint': return { tag: hint || FLAGS[i % 8] };
    case 'idle_chatter': return { tag: [act, i % 2 ? 'lit' : 'dark'] };
    case 'boss_phase': return { tag: ['p1', 'p2', 'p3', 'p4'][i % 4], flags: { corvin_freed: i % 3 === 0 } };
    case 'last_words': return { flags: { tallow_cooled: i % 2 === 0, widow_mercy: i % 2 === 1 } };
    case 'odile_names_wick': return i % 2 ? { flame: 'rime', shape: 'arc', charm: 'split' } : {};
    case 'pawn_recall': return { item: 'sealed_lantern', price: 12 + i, days: i % 3 };
    case 'soup_menu': return i % 2 ? { dish1: 'meal_eel_pie', dish2: 'meal_ember_stew' } : {};
    case 'flood_warning': return i % 2 ? { gate: 'the red wheel', sec: 8 } : {};
    case 'ledger_arrival': return { place: pack.entries.filter(e => e.type === 'place')[i % 40].id };
    case 'lamp_relit': return { lamp: ['crown_lamp', 'gutter_lamp', 'sluice_lamp', 'deep_lamp', 'bell_lamp', 'sky_lamp'][i % 6] };
    case 'beast_snarl': case 'named_beast': return { foe: MONSTERS[i % 30] };
    default: return {};
  }
}

test('every NPC, Hush, the Narrator and every boss speaks every intent it is assigned, with no stray markers', async () => {
  const talk = await talkFor(3); assert.equal(talk.ready, true, talk.reason);
  const problems = [];
  for (const npc of npcs.list) {
    talk.newRoom({ place: pack.entries.find(e => e.id === npc.place) ? npc.place : 'a1_guild_hall' });
    for (const intent of npc.intents) {
      for (let i = 0; i < 30; i++) {
        const out = talk.say(npc.id, intent, ctxFor(npc, intent, i));
        if (!out) { problems.push(`${npc.id} ${intent}: no line`); break; }
        if (BAD.test(out.text.replace(/^\[.*\]$/, 'x'))) problems.push(`${npc.id} ${intent}: "${out.text}"`);
        if (BAD.test(out.text.replace(/\[[^\]]*\]/g, 'x'))) problems.push(`${npc.id} ${intent}: marker in "${out.text}"`);
      }
    }
  }
  assert.deepEqual([...new Set(problems)].slice(0, 20), []);
});

test('talking enemies and swarms speak their tagged pools; bosses keep to their own lines', async () => {
  const talk = await talkFor(5);
  const knell = talk.enemySpeaker({ def: { id: 'knell_hookman' }, id: 1 }), drowned = talk.enemySpeaker({ def: { id: 'drowned_lockkeeper' }, id: 2 });
  const rat = talk.enemySpeaker({ def: { id: 'rat_chorister' }, id: 3 }), unlit = talk.enemySpeaker({ def: { id: 'unlit_hound' }, id: 4 });
  assert.equal(knell.kind, 'knell'); assert.equal(drowned.kind, 'drowned'); assert.equal(rat.kind, 'choir'); assert.equal(unlit.kind, 'unlit');
  assert.equal(talk.enemySpeaker({ def: { id: 'wax_mite' }, id: 5 }), null, 'a wax mite has no voice');
  const own = (sym, tag) => new Set(extra.symbols[sym].filter(e => e.tags.includes(tag)).map(e => e.id));
  const cases = [[knell, 'enemy_opener', 'knell'], [drowned, 'enemy_opener', 'drowned'], [knell, 'combat_bark', 'knell'], [knell, 'combat_flee', 'knell'], [rat, 'beast_snarl', 'choir'], [unlit, 'beast_snarl', 'unlit']];
  for (const [sp, intent, tag] of cases) for (let i = 0; i < 20; i++) {
    const out = talk.say(sp.id, intent); assert.ok(out, `${tag} ${intent}`);
    assert.ok(own(intent, tag).has(out.entryId), `${tag} ${intent} spoke an outside line: "${out.text}"`);
  }
  for (const [tag, n] of [['knell_order', 10], ['lampbreaker', 8]]) { const seen = new Set(); for (let i = 0; i < 60; i++) seen.add(talk.say(knell.id, 'combat_bark', { tag })?.entryId); assert.ok([...seen].every(id => extra.symbols.combat_bark.find(e => e.id === id)?.tags.includes(tag)), tag); assert.equal(seen.size, n, tag); }
  const tallowOpen = own('boss_opener', 'tallow');
  for (let i = 0; i < 10; i++) assert.ok(tallowOpen.has(talk.say('boss_tallow', 'boss_opener').entryId), 'Tallow opened with a core line');
});

test('pools are wide: 100 draws give 10+ lines with no repeat in the first 10 (smaller tagged pools: every line, no back-to-back)', async () => {
  const thin = [];
  const who = { odile_names_wick: 'npc_odile', pawn_recall: 'npc_hollis', soup_menu: 'npc_brisket', idle_chatter: 'npc_aldra', rain_talk: 'npc_wenna', lamp_relit: 'npc_pim',
    ledger_arrival: 'narrator', ledger_relight: 'narrator', flood_warning: 'npc_voss', hush_chirr: 'npc_hush', kindling_hint: 'npc_brisket' };
  const runs = Object.entries(who).map(([intent, sp]) => ({ label: intent, sp, intent, ctx: {}, pool: extra.symbols[intent].length }));
  const talk0 = await talkFor(1);
  const en = id => talk0.enemySpeaker({ def: { id }, id: 900 + id.length });
  for (const [id, intent, tag] of [['knell_novice', 'enemy_opener', 'knell'], ['drowned_lockkeeper', 'enemy_opener', 'drowned'], ['knell_novice', 'combat_bark', 'knell'], ['knell_novice', 'combat_bark', 'knell_order'],
    ['knell_novice', 'combat_bark', 'lampbreaker'], ['knell_novice', 'combat_flee', 'knell'], ['knell_novice', 'combat_taunt', 'knell'], ['gutter_rat', 'beast_snarl', 'choir'], ['unlit_creeper', 'beast_snarl', 'unlit']])
    runs.push({ label: `${intent}#${tag}`, enemy: id, intent, ctx: tag === 'knell' || tag === 'drowned' || tag === 'choir' || tag === 'unlit' ? {} : { tag }, pool: extra.symbols[intent].filter(e => e.tags.includes(tag)).length });
  for (const boss of ['tallow', 'gnaw', 'widow', 'ossery']) for (const intent of ['boss_opener', 'boss_low']) runs.push({ label: `${intent}#${boss}`, sp: `boss_${boss}`, intent, ctx: {}, pool: extra.symbols[intent].filter(e => e.tags.includes(boss)).length });
  for (const tag of ['lanternfall']) for (const intent of ['greet', 'farewell', 'rally', 'relief', 'observe']) runs.push({ label: `${intent}#${tag}`, sp: 'npc_aldra', intent, ctx: {}, pool: 10, soft: true });
  for (const r of runs) {
    const talk = await talkFor(11); talk.newRoom({ place: 'a2_dripmarket' });
    const sp = r.enemy ? talk.enemySpeaker({ def: { id: r.enemy }, id: 77 }).id : r.sp;
    const ids = [], texts = new Set();
    for (let i = 0; i < 100; i++) { const out = talk.say(sp, r.intent, r.ctx); assert.ok(out, `${r.label}: no line`); ids.push(out.entryId); texts.add(out.text); }
    const distinct = new Set(ids).size;
    if (r.pool >= 10) {
      if (distinct < 10) thin.push(`${r.label}: only ${distinct} lines in 100 draws`);
      if (!r.soft && new Set(ids.slice(0, 10)).size !== 10) thin.push(`${r.label}: repeat inside the first 10`);
    } else {
      if (distinct < r.pool) thin.push(`${r.label}: ${distinct}/${r.pool} lines ever came up`);
      if (r.pool > 1 && ids.some((id, i) => i && id === ids[i - 1])) thin.push(`${r.label}: the same line twice in a row`);
    }
  }
  assert.deepEqual(thin, []);
});

test('the grammar extension: at most 12 new intents, each documented, NR ones in noRepeat, 10+ lines each', () => {
  const core = new Set(FILES.grammar.meta.intents);
  const created = Object.keys(extra.symbols).filter(s => !core.has(s) && !FILES.grammar.symbols[s]);
  assert.ok(created.length <= 12, `new intents: ${created.length}`);
  assert.deepEqual(new Set(created), new Set(extra.meta.intents));
  for (const s of extra.meta.intents) { assert.ok(extra.meta.intentDoc[s], `${s} has no intentDoc`); assert.ok(extra.symbols[s].length >= 10 || s === 'boss_low', `${s}: ${extra.symbols[s].length} lines`); }
  for (const s of ['odile_names_wick', 'pawn_recall', 'boss_low', 'ledger_arrival', 'flood_warning', 'hush_chirr', 'kindling_hint']) assert.ok(extra.meta.noRepeat.includes(s), `${s} should be NR`);
  const ids = new Set(); for (const list of Object.values(extra.symbols)) for (const e of list) { assert.ok(!ids.has(e.id), 'duplicate id ' + e.id); ids.add(e.id); L.parseTemplate(e.t); }
});

test('speakers use only real traits and tics, and every voice role exists in shared/voices.js (the 7 roles too)', () => {
  for (const r of ['elder', 'merchant', 'priest', 'child', 'cultist', 'brute', 'stormcaller', 'villager', 'ranger', 'mage', 'cleric', 'narrator']) assert.ok(ROLE_VOICES[r], `role ${r} missing from ROLE_VOICES`);
  const all = [...npcs.list, ...Object.values(npcs.enemyVoices).map(v => ({ id: 'enemy', ...v }))];
  for (const n of all) {
    for (const t of n.speech.traits || []) assert.ok(TRAITS.has(t), `${n.id}: trait ${t} is not one of Lingo's 25`);
    for (const t of n.speech.tics || []) assert.ok(TICS.has(t), `${n.id}: tic ${t} is not one of Lingo's 14`);
    for (const k of ['formality', 'verbosity', 'cheer', 'aggression', 'confidence']) if (n.speech[k] != null) assert.ok(n.speech[k] >= 0 && n.speech[k] <= 1, `${n.id} ${k}`);
    for (const slot of Object.keys(n.speech.custom || {})) assert.ok(L.CUSTOM_SLOTS.includes(slot), `${n.id}: custom slot ${slot}`);
    const v = n.voice || {};
    if (v.engine !== 'babble' && v.engine !== 'none') assert.ok(ROLE_VOICES[v.role], `${n.id}: voice role ${v.role}`);
  }
  assert.equal(npcs.list.filter(n => n.kind === 'npc').length, 14);
  for (const id of ['npc_hush', 'narrator', 'boss_tallow', 'boss_gnaw', 'boss_sluicemaw', 'boss_widow', 'boss_bellfather', 'boss_ossery']) assert.ok(npcs.list.find(n => n.id === id), id);
});

test('fixed lines: every boss line of 01 §6.5, exactly 8 Kindling flags each with a hint line, speakers exist', async () => {
  const talk = await talkFor(2);
  const slots = { tallow: ['open', 'p1', 'p2', 'p3', 'death'], gnaw: ['open', 'p1', 'p2', 'p3', 'death'], sluicemaw: ['open', 'p1', 'p2', 'p3', 'death'], widow: ['open', 'p1', 'p2', 'p3', 'death'],
    bellfather: ['open', 'p1', 'p2', 'p3', 'death'], ossery: ['open', 'p1', 'p2', 'p3', 'p4', 'freeze', 'refuse', 'kill'] };
  for (const [boss, list] of Object.entries(slots)) for (const s of list) { const l = talk.line(`bl_${boss}_${s}`); assert.ok(l && l.text, `bl_${boss}_${s}`); }
  const hints = Object.keys(extra.lines).filter(id => id.startsWith('hint_'));
  assert.deepEqual(hints.map(h => h.slice(5)).sort(), [...FLAGS].sort());
  for (const f of FLAGS) assert.equal(extra.symbols.kindling_hint.filter(e => e.tags.includes(f)).length, 3, `${f}: fixed hint + 2 variants`);
  for (const [id, l] of Object.entries(extra.lines)) { assert.ok(talk.speaker(l.speaker), `${id}: speaker ${l.speaker}`); assert.ok(!BAD.test(l.text.replace(/\[[^\]]*\]/g, 'x')), id); }
  // bossLine: fixed the first time, the pool after; the flag variant wins
  const t2 = await talkFor(4);
  assert.equal(t2.bossLine('tallow', 'open').lineId, 'bl_tallow_open');
  assert.equal(t2.bossLine('tallow', 'open').lineId, undefined);
  assert.equal(t2.bossLine('tallow', 'death', { flags: { tallow_cooled: true } }).lineId, 'bl_tallow_death_cooled');
  assert.equal(t2.bossLine('sluicemaw', 'p1').narration, true);
  assert.equal(t2.line('bl_widow_p2').voiceOf, 'npc_aldra');
});

test('the pack covers every speaker, every monster (with a real family), every place a speaker stands in; no duplicate ids', () => {
  const ids = new Map(); for (const e of pack.entries) { assert.ok(!ids.has(e.id), 'duplicate ' + e.id); ids.set(e.id, e); }
  for (const n of npcs.list) assert.ok(ids.has(n.lexicon), `${n.id}: lexicon ${n.lexicon}`);
  for (const n of npcs.list) if (n.place) assert.ok(ids.get(n.place)?.type === 'place', `${n.id}: place ${n.place}`);
  for (const m of MONSTERS) { const e = ids.get(m); assert.ok(e && e.type === 'creature', `monster ${m}`); assert.ok(ids.get(e.family)?.tags.includes('family'), `${m}: family ${e.family}`); }
  for (const e of loadJson('data/enemies.json').list) assert.ok(ids.has(e.id), `enemies.json ${e.id} has no pack entry`);
  for (const [kind, v] of Object.entries(npcs.enemyVoices)) for (const f of v.families) assert.ok(ids.get(f)?.tags.includes('family'), `${kind}: family ${f}`);
  for (const e of pack.entries.filter(x => x.proper && x.type === 'person')) assert.ok(e.pron?.respell, `${e.id} needs a respelling`);
  assert.equal(pack.entries.filter(e => e.tags.includes('family')).length, 19);
  assert.equal(pack.entries.filter(e => e.type === 'faction').length, 9);
  assert.equal(pack.entries.filter(e => e.type === 'person').length, 18);
});

test('pronunciations are split word by word; the Narrator test and the stub', async () => {
  const p = splitPronunciations(pack.entries);
  assert.equal(p.Aldra.respell, 'AL-dra'); assert.equal(p.Crake.respell, 'KRAYK'); assert.equal(p.mother, undefined); assert.equal(p.Mother, undefined);
  const talk = await talkFor(1);
  assert.match(talk.lingo.toSpeech('Aldra waits.'), /^\[\[[^\]]+\]\] waits\.$/);
  assert.ok(!/\s/.test(talk.lingo.toSpeech('Aldra').replace(/^\[\[|\]\]$/g, '')), 'the short name reads as one word');
  assert.equal(isSceneText('The rain goes on.'), true); assert.equal(isSceneText('I kept the oath.'), false);
  const stub = await createTalk({ files: { ...FILES, pack: { entries: [{ type: 'broken' }] } }, lingoModule: L });
  assert.equal(stub.ready, false); assert.equal(stub.say('npc_aldra', 'greet'), null); assert.equal(stub.line('bl_tallow_open'), null);
});

test('memories: Hollis recalls a sold item through pawn_recall', async () => {
  const talk = await talkFor(9);
  const bank = talk.memoryBank('npc_hollis'); assert.ok(bank);
  bank.remember({ type: 'sold_item', bindings: { item: { id: 'sealed_lantern' } }, details: { price: 30 }, time: 0, participants: ['player'] });
  const out = talk.recall('npc_hollis', bank, 48);
  assert.ok(out && out.intent === 'pawn_recall', 'recall should use pawn_recall'); assert.ok(!BAD.test(out.text), out.text);
});

test('barks: 01 §12.8 limits, subtitles, bubbles and talk.line', async () => {
  const talk = await talkFor(6); const bus = createBus();
  const game = { bus, time: 0, entities: [], player: { x: 0, y: 0, hp: 10, maxHp: 100, oil: 50, maxOil: 100, kind: 'player' }, flags: { hush: true }, room: { act: 'act2' } };
  const lines = []; bus.on('talk.line', l => lines.push(l));
  const barks = createBarks({ game, talk, random: () => 0 });
  const knellA = { def: { id: 'knell_novice' }, id: 1, x: 10, y: 10, h: 12, maxHp: 40, hp: 40 }, knellB = { def: { id: 'knell_hookman' }, id: 2, x: 30, y: 10, h: 12, maxHp: 70, hp: 70 };
  game.entities.push(knellA, knellB);
  bus.emit('room.enter', {}); bus.flush();
  const pre = []; bus.on('talk.prerender', e => pre.push(e));
  bus.emit('enemy.alert', { enemy: knellA }); bus.emit('enemy.alert', { enemy: knellB }); bus.flush(); bus.flush();
  assert.equal(lines.length, 1, 'two alerts in the same instant: the global 1.5 s gap lets one through');
  assert.ok(game.subtitle && game.subtitle.text === lines[0].text && game.subtitle.dur >= 1.6);
  assert.equal(game.bubbles.length, 1); assert.equal(lines[0].x, 10);
  game.time = 2; bus.emit('enemy.alert', { enemy: knellA }); bus.flush(); bus.flush();
  assert.equal(lines.length, 1, 'the same enemy again inside 6 s is quiet');
  game.time = 2.1; bus.emit('player.hurt', { amount: 5, source: knellB }); bus.flush(); bus.flush();
  assert.equal(lines.length, 2, 'the other enemy taunts after the global gap');
  game.time = 10; bus.emit('player.hurt', { amount: 5, source: knellB }); bus.flush(); bus.flush();
  assert.ok(lines.some(l => l.speakerId === 'npc_hush'), 'Hush chirrs when the player is below 30%');
  const hushLine = lines.find(l => l.speakerId === 'npc_hush'); assert.match(hushLine.text, /^Hush chirrs: "/);
  game.time = 20; bus.emit('boss.line', { boss: 'tallow', slot: 'open' }); bus.flush(); bus.flush();
  assert.equal(lines.at(-1).lineId, 'bl_tallow_open'); assert.ok(lines.at(-1).priority >= 4);
  game.time = 20.1; bus.emit('talk.request', { speakerId: 'npc_aldra', intent: 'greet', priority: 'npc' }); bus.flush(); bus.flush();
  assert.equal(lines.at(-1).speakerId, 'npc_aldra', 'an NPC line asked for by the game is not throttled by barks');
  game.time = 40; bus.emit('knockout', { target: knellB }); bus.flush(); bus.flush();
  assert.ok(extra.symbols.combat_flee.some(e => e.t === lines.at(-1).text.replace(/\.$/, '') || lines.at(-1).text.startsWith(e.t.slice(0, 10))), 'a knocked-out Knell surrenders');
  assert.ok(game.talkLog.length === lines.length);
  barks.dispose();
});
