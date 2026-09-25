// Party Quest — game controller. Screens: title → party assembly → world (town / wild / travel / combat / camp).
// Everything below glues the experiments together; the rules live in data/*.json and the logic modules beside this file.
import { Lingo, Entity } from '../../../lingo/js/lingo.js';
import { Library } from '../../../library/js/library.js';
import { loadDeps, makeCharacter, makeNpc } from '../../../library/js/make.js';
import { ItemCatalog } from '../../../items/js/items.js';
import { renderSVG } from '../../../avatar-2d/js/render.js';
import { randomAvatar } from '../../../avatar-2d/js/random.js';
import { randomCreature } from '../../../avatar-3d/js/creatures.js';
import * as voice from '../../../voice-lab/js/voice.js';
import { Game } from './state.js';
import { Talk } from './talk.js';
import { Stage } from './stage.js';
import { elementName } from '../../../avatar-3d/js/spellfx.js';
import { Combat, EV, itemStats } from './combat.js';
import { generateTown, spreadDeeds, questsAvailable, acceptQuest, shopStock } from './town.js';
import { planLeg, Minigame } from './travel.js';
import { makeRng } from './rng.js';
import { Conversations, factsFrom } from '../../../conversations/js/conversations.js';
import { voiceFor } from '../../../shared/voices.js';
import { LangDebug, LANGDEBUG_CSS } from '../../../shared/langdebug.js';

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const k of kids) if (k != null) e.append(k); return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function hashSeed(str) { let h = 7; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
const AVATAR_RACE = { human: 'human', elf: 'elf', dwarf: 'dwarf', halfling: 'human', gnome: 'human', giant: 'human', troll: 'orc', orc: 'orc', goblin: 'goblin', dragon: 'beast', undead: 'undead', fey: 'elf', beast: 'beast' };
const BEAST_BODY = { wolf: { type: 'wolf' }, dire_wolf: { type: 'dire_wolf' }, giant_spider: { type: 'spider', size: 1.3 }, bat: { type: 'bat' }, boar: { type: 'boar' }, bear: { type: 'bear' }, rat: { type: 'rat' }, mire_drake: { type: 'drake' }, dragon: { type: 'dragon' }, snake: { type: 'snake' } };
const BEAST_NOISES = { wolf: ['snarls', 'growls low', 'bares its teeth', 'howls'], dire_wolf: ['snarls', 'growls, deep in its chest', 'howls'], giant_spider: ['clicks its fangs', 'hisses', 'rears up'], default: ['snarls', 'hisses', 'growls'] };
const ENEMY_VOICE = { goblin: 'ours_child', orc: 'ours_giant', troll: 'ours_giant', undead: 'ours_whisper', beast: null, human: 'ours_male' };

// ------------------------------------------------------------------ load everything
const base = '../../';
const j = async p => (await fetch(base + p)).json();
const [rules, world, lexData, grammarData, traitsData, eventsData, relationsData, topicsData] = await Promise.all([j('prototypes/party-quest/data/rules.json'), j('prototypes/party-quest/data/world.json'), j('lingo/data/lexicon.json'), j('lingo/data/grammar.json'), j('lingo/data/traits.json'), j('lingo/data/events.json'), j('lingo/data/relations.json'), j('conversations/data/topics.json')]);
const [items, deps, library] = await Promise.all([ItemCatalog.load(base + 'items/data/'), loadDeps(base), Library.open(base + 'library/')]);
deps.seedBase = 1000 + Math.floor(Math.random() * 1e6);
const lingo = new Lingo({ lexicon: lexData, grammar: grammarData, traits: traitsData }); const conversations = new Conversations({ lingo, topics: topicsData }); const langdbg = new LangDebug({ lingo, base: '../../' }); document.head.append(Object.assign(document.createElement('style'), { textContent: LANGDEBUG_CSS })); langdbg.mountSettings(document.querySelector('#hud'), { onToggle: on => { if (on) for (const p of document.querySelectorAll('#narrative .say')) langdbg.decorate(p); } });
// places, enemies and class spells get lexicon entries so memories and lines can name them
for (const [id, L] of Object.entries(world.locations)) { L.place = id; if (!lingo.lexicon.has(id)) lingo.lexicon.add({ id, type: 'place', proper: true, forms: { sg: L.name }, tags: L.tags }); }
for (const [id, e] of Object.entries(rules.enemies)) if (!lingo.lexicon.has(id)) lingo.lexicon.add({ id, type: 'creature', forms: { sg: e.name, pl: e.name.replace(/y$/, 'ie').replace(/f$/, 've') + 's' }, tags: e.tags, race: e.race });
for (const [id, s] of Object.entries(rules.spells)) if (!lingo.lexicon.has(id)) lingo.lexicon.add({ id, type: 'spell', forms: { sg: s.name }, tags: ['spell'] });
lingo.invalidatePronunciations();
const DATA = { rules, world, items, events: eventsData.types, relations: relationsData, lingo };
const presets = deps.avatarPresets;

// ------------------------------------------------------------------ state
let game = null, talk = null, stage = null, mode = 'title', busy = false; let currentCombat = null; const RACES = ['human', 'elf', 'dwarf', 'halfling', 'gnome', 'orc', 'goblin'];
const toast = (t) => { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => e.hidden = true, 2200); };
function showScreen(id) { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== 'screen-' + id; $('hud').hidden = id !== 'world'; }

// ------------------------------------------------------------------ title
$('btn-new').onclick = () => { game = new Game(DATA); setupParty(); showScreen('party'); };
$('btn-continue').onclick = () => { const g = Game.load(DATA); if (!g) return toast('No save found'); game = g; startWorld(true); };
$('btn-continue').disabled = !Game.hasSave();

// ------------------------------------------------------------------ party assembly
let pool = [], chosen = [];
function blueprintCard(bp, { onAdd, onRemove, classSel = true } = {}) {
  const sel = classSel ? el('select', {}, ...Object.entries(rules.classes).map(([id, c]) => el('option', { value: id, text: `${c.name} · ${c.desc}` }))) : null;
  if (sel) { const fit = Object.entries(rules.classes).find(([, c]) => c.races?.includes(bp.race) && (bp.speech?.traits || []).some(t => c.traitsHint?.includes(t)))?.[0] || Object.entries(rules.classes).find(([, c]) => c.races?.includes(bp.race))?.[0]; sel.value = bp.class || fit || 'warrior'; sel.onchange = () => bp.class = sel.value; bp.class = sel.value; }
  return el('div', { class: 'card', 'data-id': bp.id }, el('div', { class: 'portrait', html: bp.avatar ? renderSVG(bp.avatar) : '' }), el('div', { class: 'info' }, el('div', { class: 'name', text: bp.name }), el('div', { class: 'sub', text: `${bp.race || 'human'} · ${(bp.speech?.traits || []).join(', ') || 'no traits'}${bp.libraryName ? ' · library' : ''}` }), sel, el('div', { class: 'row' }, onAdd ? el('button', { class: 'small', text: 'Add', onclick: () => onAdd(bp) }) : null, onRemove ? el('button', { class: 'small', text: 'Remove', onclick: () => onRemove(bp) }) : null)));
}
function setupParty() {
  chosen = []; pool = library.list('character').map(e => library.stamp(e.id)); renderPool(); renderChosen();
  const f = $('custom-form'); f.race.replaceChildren(...RACES.map(r => el('option', { value: r, text: r }))); f.class.replaceChildren(...Object.entries(rules.classes).map(([id, c]) => el('option', { value: id, text: c.name }))); f.traits.replaceChildren(...deps.traits.map(t => el('option', { value: t.id, text: `${t.id} — ${t.desc || ''}` })));
}
function renderPool() { $('pool-list').replaceChildren(...pool.filter(bp => !chosen.some(c => c.id === bp.id)).map(bp => blueprintCard(bp, { onAdd: addChosen }))); }
function renderChosen() { $('chosen-list').replaceChildren(...chosen.map(bp => blueprintCard(bp, { onRemove: removeChosen }))); $('chosen-count').textContent = `${chosen.length} / 4`; $('btn-start').disabled = chosen.length !== 4; }
function addChosen(bp) { if (chosen.length >= 4 || chosen.some(c => c.id === bp.id)) return; chosen.push(bp); renderPool(); renderChosen(); }
function removeChosen(bp) { chosen = chosen.filter(c => c.id !== bp.id); renderPool(); renderChosen(); }
$('btn-default-party').onclick = () => { const p = library.get('party_default'); chosen = []; for (const id of p?.data?.members || []) { const bp = pool.find(x => x.libraryId === id); if (bp) chosen.push(bp); } renderPool(); renderChosen(); };
$('btn-random-party').onclick = () => { chosen = []; const rng = makeRng(); const cands = rng.shuffle(pool); while (chosen.length < 4) { chosen.push(cands.length ? cands.pop() : makeCharacter({ seed: rng.int(1, 1e9), race: rng.pick(RACES) }, deps)); } renderPool(); renderChosen(); };
$('btn-custom').onclick = () => $('custom-dialog').showModal();
$('custom-cancel').onclick = () => $('custom-dialog').close();
$('custom-form').onsubmit = (e) => { const f = e.target; const traits = [...f.traits.selectedOptions].map(o => o.value); const bp = makeCharacter({ name: f.name.value.trim() || undefined, race: f.race.value, gender: f.gender.value || undefined, traits: traits.length ? traits : undefined }, deps); bp.class = f.class.value; pool.unshift(bp); addChosen(bp); f.reset(); };
$('btn-start').onclick = () => { game.party = chosen.map(bp => { const m = game.makeMember(bp, bp.class || 'warrior'); if (!bp.voice) m.voice = voiceFor({ role: roleOfClass(m.class), gender: m.gender || 'n', seed: hashSeed(m.id) }); return m; }); const ids = game.partyIds(); for (const m of game.party) for (const o of game.party) if (m !== o) { const r = game.relations.get(m.id, o.id); r.set('familiarity', 0.3); r.set('warmth', 0.15); } game.remember({ type: 'join', participants: ids, bindings: { newcomer: { id: ids[1] }, place: { id: game.location } }, details: { impression: 'seemed all right' } }); startWorld(false); };

// ------------------------------------------------------------------ world
async function startWorld(resumed) {
  showScreen('world'); if (!stage) stage = new Stage($('stage')); talk = new Talk({ lingo, game, voice }); for (const m of game.party) talk.speaker(m); talk.muted = $('mute').checked; talk.engineOverride = $('engine').value;
  $('narrative').replaceChildren(); renderHud(); renderSide();
  if (!resumed) narrate(`<h4>Day 1</h4><p>The four of you meet at the well in ${world.locations[game.location].name}. Nobody has any money. Somebody has a map.</p>`);
  else narrate(`<p class="sys">Game loaded. Day ${game.day}, ${game.slotName}, ${world.locations[game.location].name}.</p>`);
  await arrive(game.location, { resumed });
}
$('mute').onchange = () => { if (talk) talk.muted = $('mute').checked; if ($('mute').checked) voice.stopAll(); };
$('engine').onchange = () => { if (talk) talk.engineOverride = $('engine').value; };
$('btn-save').onclick = () => { game.save(); toast('Saved'); };
$('btn-menu').onclick = () => { if (busy) return toast('Wait for the scene to finish'); game.save(); showScreen('title'); $('btn-continue').disabled = false; };
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => { for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b); for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== 'tab-' + b.dataset.tab; };

function renderHud() { $('hud-place').textContent = world.locations[game.location].name; $('hud-slot').textContent = game.slotName; $('hud-day').textContent = game.day; $('hud-gold').textContent = game.gold; $('hud-rep').textContent = game.reputation; const sun = $('hud-sun'); sun.className = game.isNight ? 'night' : (['dusk', 'dawn'].includes(game.slotName) ? game.slotName : ''); }
function renderSide() { renderPartyTab(); renderBag(); renderQuests(); renderJournal(); }
function hpBar(m) { const pct = Math.max(0, Math.round(100 * m.hp / m.maxHp)); return el('div', { class: 'hp' }, el('i', { style: `width:${pct}%`, class: pct <= 50 ? 'low' : '' })); }
function renderPartyTab() {
  const rows = game.party.map(m => {
    const gear = `${m.weapon?.fullName || m.weapon?.name || 'bare hands'} · ${m.armour?.fullName || m.armour?.name || 'no armour'}${m.implement ? ' · ' + (m.implement.fullName || m.implement.name) : ''}`;
    const stats = `${m.hp}/${m.maxHp} hp · hits for ${m.damage} · armour ${m.armourValue} · ${m.xp} xp${m.spell ? ' · ' + rules.spells[m.spell].name : ''}`;
    const save = () => { library.putCharacter({ ...m.blueprint, ...pickBlueprintFields(m) }, { source: 'party-quest', tags: [m.className.toLowerCase()] }); toast(`${m.short} saved to the library`); };
    return el('div', { class: 'member' },
      el('div', { class: 'portrait', html: renderSVG(m.avatar) }),
      el('div', {},
        el('div', {}, el('b', { text: m.name }), el('span', { class: 'tiny', text: ` ${m.className} L${m.level} · ${m.race}` })),
        hpBar(m), el('div', { class: 'tiny', text: stats }), el('div', { class: 'gear', text: gear }),
        el('div', { class: 'row' }, el('button', { class: 'small', text: 'Feelings', onclick: () => showFeelings(m) }), el('button', { class: 'small', text: 'Save to library', onclick: save }))));
  });
  $('tab-party').replaceChildren(...rows);
}
function pickBlueprintFields(m) { return { name: m.name, short: m.short, race: m.race, pronouns: m.pronouns, gender: m.gender, avatar: m.avatar, voice: m.voice, speech: m.speech, respell: m.respell, kind: 'character', title: m.className }; }
function showFeelings(m) { const lines = game.party.filter(o => o !== m).map(o => `${m.short} → ${o.short}: ${game.relations.get(m.id, o.id).summary()}`); const mem = game.banks[m.id]?.list(game.now).slice(0, 5).map(x => `· ${x.memory.type} (${(x.salience * 100 | 0)}%) ${JSON.stringify(x.memory.details)}`) || []; narrate(`<h4>${m.name}</h4>` + lines.map(l => `<p class="sys">${l}</p>`).join('') + (mem.length ? `<p class="sys">Strongest memories:<br>${mem.join('<br>')}</p>` : '')); }
function itemRow(it, actions = []) { const st = itemStats(it, rules); const what = st.kind === 'weapon' ? `weapon · hits for ${st.damage}` : st.kind === 'armour' ? `armour ${st.armour}` : st.kind === 'implement' ? `implement · ${rules.spells[st.spell]?.name || st.spell}` : st.kind === 'potion' ? `potion · heals ${st.heal}` : st.kind === 'treasure' ? 'treasure · sell it' : st.kind; return el('div', { class: 'item' }, el('span', { class: 'n' }, el('span', { class: it.rarity, text: it.fullName || it.name }), el('small', { text: ` ${what} · ${it.value || 0}g` })), ...actions); }
function renderBag() {
  const rows = game.inventory.map(it => { const st = itemStats(it, rules); const acts = []; if (['weapon', 'armour', 'implement'].includes(st.kind)) acts.push(el('select', { onchange: e => { const m = game.party.find(x => x.id === e.target.value); if (m) { game.removeItem(it); game.equip(m, it); renderSide(); toast(`${m.short} takes the ${it.name}`); } } }, el('option', { value: '', text: 'give to…' }), ...game.party.map(m => el('option', { value: m.id, text: m.short })))); if (st.kind === 'potion') acts.push(el('select', { onchange: e => { const m = game.party.find(x => x.id === e.target.value); if (m) { m.hp = Math.min(m.maxHp, m.hp + st.heal); game.removeItem(it); renderSide(); toast(`${m.short} drinks it`); } } }, el('option', { value: '', text: 'drink…' }), ...game.party.map(m => el('option', { value: m.id, text: m.short })))); return itemRow(it, acts); });
  $('tab-bag').replaceChildren(el('div', { class: 'tiny', text: `${game.gold} gold · ${game.inventory.length} items` }), ...(rows.length ? rows : [el('p', { class: 'tiny', text: 'Nothing but lint.' })]));
}
function renderQuests() { const act = game.quests.active.map(q => el('div', { class: 'quest' + (q.done ? ' done' : '') }, el('b', { text: q.name }), el('div', { class: 'tiny', text: q.done ? 'Done — return to the quest giver.' : game.quest(q.id).desc }))); const done = game.quests.done.map(id => el('div', { class: 'quest done', text: game.quest(id).name })); $('tab-quests').replaceChildren(...(act.length || done.length ? [...act, ...done] : [el('p', { class: 'tiny', text: 'No quests yet. Talk to people in town.' })]), el('h4', { text: 'Deeds' }), ...(game.deeds.length ? game.deeds.map(d => el('div', { class: 'tiny', text: `Day ${d.day}: ${d.text}` })) : [el('p', { class: 'tiny', text: 'Nothing yet.' })])); }
function renderJournal() { $('tab-log').replaceChildren(...game.log.slice(-40).reverse().map(l => el('div', { class: 'tiny', text: `${Math.floor(l.at / 24) + 1}d ${l.at % 24}h · ${l.type} ${l.details ? JSON.stringify(l.details) : ''}` }))); }
function narrate(html, cls = '') { const p = el('div', { class: cls, html }); $('narrative').append(p); $('narrative').scrollTop = 1e9; return p; }
/** Show choices and wait for one. Options with stay:true run without ending the wait. Releases the busy flag while waiting so nested choices work. */
function waitForChoice(list) { const was = busy; busy = false; return new Promise(res => setActions(list.map(a => ({ ...a, run: async () => { const r = await a.run?.(); if (!a.stay) { busy = was; res(r); } } })))); }
function setActions(list) { $('actions').replaceChildren(...list.map(a => el('button', { class: a.cls || '', text: a.text, onclick: async () => { if (busy) return; busy = true; try { await a.run(); } catch (e) { console.error(e); narrate(`<p class="bad">Something broke: ${e.message}</p>`); } busy = false; } }))); }

// ---- speech bubbles over the 3D bodies
function bubbleAt(id, text, who, cls = '') {
  const c = stage.chars.get(id); const wrap = $('bubbles'); const b = el('div', { class: 'bubble ' + cls }, el('b', { text: who }), document.createTextNode(text));
  if (c) { const v = c.group.position.clone(); v.y += 1.95; v.project(stage.scene.camera); b.style.left = `${(v.x + 1) / 2 * 100}%`; b.style.top = `${(1 - v.y) / 2 * 100}%`; } else { b.style.left = '50%'; b.style.top = '20%'; }
  wrap.append(b); return b;
}
/** Show a line in a bubble + the log, say it aloud, keep the bubble up for a while. */
async function sayLine(ch, line, { cls = '', wait = true } = {}) {
  if (!line || !line.text) return; const who = ch.short || ch.name; const b = bubbleAt(ch.id, line.text, who, cls); stage.talk(ch.id, true);
  const shown = langdbg.rewrite(line.text); const para = narrate(`<p class="say ${cls}"><b>${who}:</b> ${shown}</p>`); langdbg.decorate(para.querySelector('p'));
  const minMs = 900 + line.text.length * 28; const t0 = Date.now();
  if (wait) { await talk.say(ch, line); const left = minMs - (Date.now() - t0); if (left > 0) await sleep(Math.min(left, 2600)); } else setTimeout(() => b.remove(), minMs);
  if (wait) b.remove(); stage.talk(ch.id, false);
}
function speak(ch, intent, opts = {}) { return talk.line(ch, intent, opts); }
function randomAlive() { const a = game.alive(); return a[Math.floor(Math.random() * a.length)]; }

// ---- arriving somewhere
async function arrive(locId, { resumed = false, fromTravel = false } = {}) {
  game.location = locId; const L = world.locations[locId]; const first = !game.visited.has(locId); game.visited.add(locId); renderHud();
  stage.clearCamp(); stage.setBackdrop(L.backdrop, game.isNight); stage.setNight(game.isNight); await stage.setSide(game.party, 'left');
  if (!resumed) { narrate(`<h4>${L.name}</h4><p>${L.desc}</p>`); if (fromTravel) game.remember({ type: 'travel', participants: game.partyIds(), bindings: { place: { id: locId } }, details: {} }); }
  if (L.kind === 'town') { mode = 'town'; await enterTown(locId, first || !resumed); }
  else { mode = 'wild'; if (!resumed) { const m = randomAlive(); if (m) await sayLine(m, speak(m, L.scene?.danger > 0.5 ? (Math.random() < 0.5 ? 'fear' : 'observe') : 'observe')); if (first && L.lore) { const t = game.party.find(x => x.hp > 0 && x.speech?.traits?.some(tr => ['scholar', 'pious', 'curious', 'elder'].includes(tr))) || randomAlive(); narrate(`<p class="lore">${t.short} tells the story: “${L.lore}”</p>`); await sayLine(t, { text: L.lore }, { cls: 'lore' }); } } wildActions(L); }
}
function exitButtons(L) { return Object.entries(L.exits).map(([dir, to]) => ({ text: `${dir} → ${world.locations[to].name}`, cls: 'dir', run: () => travel(dir, to) })); }
function wildActions(L) {
  const acts = [];
  if (L.kind === 'dungeon' && L.boss && !game.cleared.has(L.place)) acts.push({ text: `Push deeper (fight ${rules.enemies[L.boss].name})`, cls: 'primary', run: () => bossFight(L) });
  if (L.kind === 'dungeon' && game.cleared.has(L.place)) acts.push({ text: 'Search the place', run: () => searchPlace(L) });
  if (game.isNight || game.slotName === 'dusk') acts.push({ text: '🔥 Make camp', cls: 'primary', run: () => camp() });
  acts.push({ text: 'Rest an hour', run: async () => { game.advance(1); for (const m of game.party) if (m.hp > 0) m.hp = Math.min(m.maxHp, m.hp + 1); renderHud(); renderSide(); narrate('<p class="sys">You sit a while. Blisters, mostly.</p>'); wildActions(L); } });
  acts.push(...exitButtons(L)); setActions(acts);
}
async function searchPlace(L) { const r = items.roll({ race: L.boss ? rules.enemies[L.boss].race : 'human', rarity: Math.random() < 0.3 ? 'rare' : 'uncommon', seed: Math.floor(Math.random() * 1e9), namegen: deps.namegen }); if (r && Math.random() < 0.7) { addLoot(r, L.place); } else narrate('<p class="sys">Bones, bat droppings, and somebody\'s boot. Nothing worth carrying.</p>'); game.advance(1); renderHud(); wildActions(L); }
function addLoot(r, placeId) { game.addItem(r); const entry = items.toLexiconEntry(r); if (!lingo.lexicon.has(entry.id)) { lingo.lexicon.add(entry); lingo.invalidatePronunciations(); } const finder = randomAlive(); game.remember({ type: 'loot', participants: game.partyIds(), bindings: { item: { id: entry.id }, place: { id: placeId } }, details: { worth: r.value > 40 ? 'a fortune' : r.value > 12 ? 'more than it looked' : 'a few coins' } }); narrate(`<p class="good">Found: <b>${r.fullName}</b> (${r.value}g).${r.lore ? ` <span class="lore">${r.lore}</span>` : ''}</p>`); renderSide(); return finder; }

// ------------------------------------------------------------------ town
async function enterTown(locId, greet) {
  const L = world.locations[locId]; let npcs = game.npcs[locId]; if (!npcs) npcs = generateTown(game, deps, locId); spreadDeeds(game, npcs);
  for (const n of npcs) talk.speaker(n); await stage.setSide(npcs.slice(0, 3), 'right');
  if (greet) { const done = game.quests.active.filter(q => q.done); if (done.length) narrate(`<p class="good">You have finished: ${done.map(q => q.name).join(', ')}. Find the person who asked.</p>`); }
  townActions(L, npcs);
}
function townActions(L, npcs) {
  const acts = npcs.map(n => { const rel = game.relations.get(n.id, game.party[0].id); const op = rel.opinion(); return { text: `Talk: ${n.short} the ${n.role} ${op > 0.25 ? '☺' : op < -0.15 ? '☹' : ''}`, run: () => talkTo(n, L) }; });
  acts.push({ text: '🛒 Market', run: () => shop(L) });
  acts.push({ text: `🛏 Inn (${rules.prices.inn || 5}g, sleep till dawn)`, run: () => inn(L) });
  if (game.isNight) acts.push({ text: '🔥 Camp outside the walls', run: () => camp() });
  acts.push(...exitButtons(L)); setActions(acts);
}
async function talkTo(n, L) {
  const leader = game.party[0]; const rel = game.relations.get(n.id, leader.id); rel.set('familiarity', Math.min(1, rel.familiarity + 0.15)); const bank = game.bank(n.id, n.speech?.traits || []);
  await stage.setSide([n], 'right', -0.5);
  narrate(`<h4>${n.name}, ${n.role}</h4><p class="sys">${n.short} thinks of you: ${rel.summary()}</p>`);
  const first = !game.flags['met_' + n.id]; game.flags['met_' + n.id] = true;
  await sayLine(n, speak(n, rel.opinion() < -0.2 ? 'insult' : 'greet', { to: leader }), { cls: 'npc' });
  const deed = bank.memories.find(m => m.type === 'deed' && !m.recalled); if (deed) { const out = lingo.speakAbout(deed, bank, game.now, talk.ctx(n, leader, { scene: talk.scene(L.place) })); deed.recalled = (deed.recalled || 0) + 1; await sayLine(n, out, { cls: 'npc' }); rel.apply('compliment', { now: game.now }); }
  else if (first) await sayLine(leader, speak(leader, 'greet_reply', { to: n }));
  // turn in finished quests
  for (const q of game.quests.active.filter(q => q.done && game.quest(q.id).giverTitle === n.role)) { await completeQuest(q, n); }
  const offers = questsAvailable(game, n);
  const acts = [];
  for (const q of offers) acts.push({ text: `Quest: ${q.name}`, cls: 'primary', run: async () => { narrate(`<p><b>${n.short}:</b> ${q.desc}</p><p class="sys">Reward: ${q.reward.gold} gold, ${q.reward.item ? q.reward.item.rarity + ' ' + q.reward.item.category : ''}, and people will hear about it.</p>`); await sayLine(n, { text: q.desc }, { cls: 'npc' }); acceptQuest(game, q); renderQuests(); toast('Quest accepted'); await sayLine(randomAlive(), speak(randomAlive(), 'plan', { to: n })); talkTo(n, L); } });
  acts.push({ text: 'Ask about the road', run: async () => { const near = Object.values(L.exits).map(id => world.locations[id]).filter(x => x.encounters?.length); const t = near[Math.floor(Math.random() * near.length)]; if (t) { const foeId = world.encounterPools[t.encounters[0]].enemies[0]; await sayLine(n, speak(n, 'warning', { to: leader, bindings: { foe: new Entity(lingo.lexicon.get(foeId), { lexicon: lingo.lexicon, count: 3 }) } }), { cls: 'npc' }); narrate(`<p class="sys">${n.short} means ${t.name}. ${t.desc}</p>`); } else await sayLine(n, speak(n, 'smalltalk', { to: leader }), { cls: 'npc' }); talkTo(n, L); } });
  acts.push({ text: 'Ask about the past', run: async () => { await sayLine(n, speak(n, Math.random() < 0.5 ? 'lore' : 'gossip', { to: leader }), { cls: 'npc' }); if (L.lore && Math.random() < 0.5) { narrate(`<p class="lore">${L.lore}</p>`); await sayLine(n, { text: L.lore }, { cls: 'npc' }); } talkTo(n, L); } });
  acts.push({ text: 'Chat', run: async () => { const m = randomAlive(); const lines = lingo.converse(talk.speaker(m), talk.speaker(n), { turns: 4, banks: game.banks, now: game.now, scene: talk.scene(L.place), relations: game.relations }); for (const l of lines.slice(0, 4)) { const who = l.speaker.id === n.id ? n : m; await sayLine(who, l, { cls: who === n ? 'npc' : '' }); } rel.apply('shared_meal', { now: game.now, strength: 0.4 }); talkTo(n, L); } });
  if (n.role === 'healer' || n.role === 'priest') acts.push({ text: `Healing (${rules.prices.heal || 8}g)`, run: async () => { const cost = rules.prices.heal || 8; if (game.gold < cost) { await sayLine(n, speak(n, 'trade_refuse', { to: leader }), { cls: 'npc' }); return talkTo(n, L); } game.gold -= cost; for (const m of game.party) m.hp = m.maxHp; renderHud(); renderSide(); await sayLine(n, speak(n, 'pray', { to: leader }), { cls: 'npc' }); talkTo(n, L); } });
  acts.push({ text: '💾 Save to library', run: async () => { library.putCharacter(n, { source: 'party-quest', tags: [n.role, L.name] }); toast(`${n.name} saved to the library`); talkTo(n, L); } });
  acts.push({ text: 'Leave', run: async () => { await sayLine(n, speak(n, 'farewell', { to: leader }), { cls: 'npc', wait: false }); await enterTown(L.place, false); } });
  setActions(acts);
}
async function completeQuest(q, n) {
  const Q = game.quest(q.id); game.quests.active = game.quests.active.filter(x => x.id !== q.id); game.quests.done.push(q.id); game.gold += Q.reward.gold; game.reputation += Q.reward.reputation;
  narrate(`<p class="good"><b>Quest complete: ${Q.name}.</b> +${Q.reward.gold} gold, reputation ${game.reputation}.</p>`);
  await sayLine(n, speak(n, 'thanks', { to: game.party[0] }), { cls: 'npc' });
  if (Q.reward.item) { const r = items.roll({ race: n.race, category: Q.reward.item.category, rarity: Q.reward.item.rarity, seed: Math.floor(Math.random() * 1e9), namegen: deps.namegen }); if (r) addLoot(r, game.location); }
  game.relations.apply(n.id, game.party[0].id, 'debt_paid', { now: game.now }); renderHud(); renderSide();
}
async function shop(L) {
  const key = 'stock_' + L.place + '_' + game.day; if (!game.flags[key]) game.flags[key] = shopStock(game, deps, L.place); const stock = game.flags[key];
  const box = narrate(`<h4>Market at ${L.name}</h4>`); const wrap = el('div', { class: 'shop' });
  const refresh = () => { wrap.replaceChildren(el('div', { class: 'tiny', text: `You have ${game.gold} gold.` }), el('b', { text: 'For sale' }), ...stock.map(it => itemRow(it, [el('button', { class: 'small', text: `Buy ${it.price}g`, onclick: () => { if (game.gold < it.price) return toast('Not enough gold'); game.gold -= it.price; stock.splice(stock.indexOf(it), 1); game.addItem(it); renderHud(); renderSide(); refresh(); } })])), el('b', { text: 'Sell' }), ...game.inventory.map(it => itemRow(it, [el('button', { class: 'small', text: `Sell ${game.sellValue(it)}g`, onclick: () => { game.gold += game.sellValue(it); game.removeItem(it); renderHud(); renderSide(); refresh(); } })]))); };
  refresh(); box.append(wrap); const npc = game.npcs[L.place].find(n => n.role === 'merchant') || game.npcs[L.place][0]; await sayLine(npc, speak(npc, 'trade_offer', { to: game.party[0], bindings: { item: new Entity(items.toLexiconEntry(stock[0] || { name: 'goods', base: { tags: [], category: 'x' } }), { lexicon: lingo.lexicon }) } }), { cls: 'npc' }); townActions(L, game.npcs[L.place]);
}
async function inn(L) {
  const cost = rules.prices.inn || 5; if (game.gold < cost) { narrate('<p class="bad">The innkeeper looks at your purse and then at the door.</p>'); return; } game.gold -= cost;
  narrate('<p class="sys">Clean straw, a hot meal, and a roof. You sleep until dawn.</p>'); game.remember({ type: 'meal', participants: game.partyIds(), bindings: { food: { id: lingo.lexicon.byType('food')[0]?.id }, place: { id: L.place } }, details: { quality: 'good' } });
  for (const m of game.party) m.hp = m.maxHp; game.newDay(); renderHud(); renderSide(); narrate(`<h4>Day ${game.day}</h4>`); await enterTown(L.place, true);
}

// ------------------------------------------------------------------ travel
async function travel(dir, to) {
  const from = world.locations[game.location], T = world.locations[to]; mode = 'travel';
  narrate(`<h4>${dir} toward ${T.name}</h4>`); stage.clearSide('right'); await stage.setSide(game.party, 'left', 0.3); for (const m of game.alive()) stage.anim(m.id, 'walk');
  const legs = planLeg(game, game.location, to); let i = 0;
  const next = async () => {
    if (i >= legs.length) { game.advance(1); renderHud(); for (const m of game.alive()) stage.anim(m.id, 'idle'); return arrive(to, { fromTravel: true }); }
    const ev = legs[i++]; game.advance(1); renderHud(); for (const m of game.alive()) stage.anim(m.id, 'idle');
    if (ev.kind === 'combat') { narrate(`<p class="bad">${ev.name} on the ${dir} road.</p>`); const m = randomAlive(); await sayLine(m, speak(m, 'warning', { bindings: { foe: new Entity(lingo.lexicon.get(ev.enemies[0]), { lexicon: lingo.lexicon, count: ev.enemies.length }) } })); const won = await fight(ev.enemies, { place: game.location }); if (!won) return; }
    else if (ev.kind === 'find') { if (ev.item) { const f = addLoot(ev.item, game.location); await sayLine(f, speak(f, 'happy')); } }
    else if (ev.kind === 'minigame') { await minigame(ev.game); }
    else if (ev.kind === 'wanderer') { await wanderer(ev); }
    else if (ev.kind === 'rest') { narrate('<p class="sys">A spring, a flat rock, and no one trying to kill you. Everyone heals a little.</p>'); for (const m of game.alive()) m.hp = Math.min(m.maxHp, m.hp + ev.heal); renderSide(); }
    else { const m = randomAlive(); narrate('<p class="sys">The trees open and you can see a long way.</p>'); await sayLine(m, speak(m, 'observe', { scene: talk.scene(to) })); }
    if (game.isNight && i < legs.length) { narrate('<p class="sys">Night comes down before you get there.</p>'); return setActions([{ text: '🔥 Make camp here', cls: 'primary', run: async () => { await camp(); await next(); } }, { text: 'Push on in the dark', run: next }]); }
    setActions([{ text: 'Continue', cls: 'primary', run: next }]);
  };
  await next();
}
async function wanderer(ev) {
  const n = makeNpc({ seed: Math.floor(Math.random() * 1e9), title: ev.role, role: ev.role === 'pedlar' || ev.role === 'tinker' ? 'merchant' : 'villager', race: Math.random() < 0.7 ? 'human' : 'halfling' }, deps); n.role = ev.role; n.hp = 1; talk.speaker(n); await stage.setSide([n], 'right', -0.5);
  narrate(`<p>A ${ev.role} on the road${ev.mood === 'drunk' ? ', singing' : ev.mood === 'grieving' ? ', in black' : ''}. ${n.name}.</p>`);
  const m = randomAlive(); const rel = game.relations.get(n.id, m.id); rel.set('warmth', ev.mood === 'friendly' ? 0.4 : ev.mood === 'wary' ? -0.2 : 0.1);
  const lines = lingo.converse(talk.speaker(n), talk.speaker(m), { turns: 4, banks: game.banks, now: game.now, scene: talk.scene(game.location), relations: game.relations, topics: ev.mood === 'drunk' ? ['greet', 'greet_reply', 'drunk', 'farewell'] : ev.mood === 'grieving' ? ['greet', 'greet_reply', 'sad', 'farewell'] : null });
  for (const l of lines) { const who = l.speaker.id === n.id ? n : m; await sayLine(who, l, { cls: who === n ? 'npc' : '' }); }
  if (Math.random() < 0.35) { const r = items.roll({ race: 'human', rarity: 'common', category: 'alchemy', seed: Math.floor(Math.random() * 1e9), lore: false }); if (r) { narrate(`<p class="good">${n.short} presses a ${r.name} into ${m.short}'s hands.</p>`); game.addItem(r); game.remember({ type: 'kindness', participants: [m.id, n.id], bindings: { by: { id: n.id } }, details: { what: 'shared their last ' + r.name } }); renderSide(); } }
  await waitForChoice([{ text: '💾 Save this person to the library', stay: true, run: async () => { library.putCharacter(n, { source: 'party-quest', tags: [ev.role, 'wanderer'] }); toast(`${n.name} saved`); } }, { text: 'Move on', cls: 'primary', run: async () => { stage.clearSide('right'); } }]);
}
async function minigame(g) {
  narrate(`<h4>${g.name}</h4><p>${g.desc}</p>`); const mg = new Minigame({ speed: 0.8 + Math.random() * 0.5, green: [0.4, 0.6] }); const box = $('minigame'); box.hidden = false; $('mg-green').style.left = `${mg.green[0] * 100}%`; $('mg-green').style.width = `${(mg.green[1] - mg.green[0]) * 100}%`;
  setActions([]); mg.start(); let last = performance.now(); let raf;
  const frame = (t) => { mg.tick((t - last) / 1000); last = t; $('mg-marker').style.left = `${mg.pos * 100}%`; if (mg.running) raf = requestAnimationFrame(frame); }; raf = requestAnimationFrame(frame);
  const ok = await new Promise(res => { $('mg-stop').onclick = () => res(mg.stop()); }); cancelAnimationFrame(raf); box.hidden = true;
  const m = randomAlive();
  if (ok) { narrate(`<p class="good">${g.success}</p>`); if (g.reward?.gold) { game.gold += g.reward.gold; renderHud(); } if (g.reward?.category) { const r = items.roll({ race: 'human', category: g.reward.category, rarity: g.reward.rarity, seed: Math.floor(Math.random() * 1e9), namegen: deps.namegen }); if (r) addLoot(r, game.location); } await sayLine(m, speak(m, 'brag')); game.remember({ type: 'skill', participants: game.partyIds(), bindings: { skill: { id: lingo.lexicon.byType('spell')[0]?.id }, teacher: { id: m.id } }, details: {} }); }
  else { narrate(`<p class="bad">${g.fail}</p>`); if (g.damage) { m.hp = Math.max(1, m.hp - g.damage); renderSide(); await sayLine(m, speak(m, 'complain')); } else await sayLine(m, speak(m, 'sad')); }
}

// ------------------------------------------------------------------ combat
function roleOfClass(c) { return c || 'villager'; }
function makeEnemy(templateId, i) {
  const t = rules.enemies[templateId]; const seed = Math.floor(Math.random() * 1e9);
  if (t.race === 'beast') { const b = BEAST_BODY[templateId] || { type: 'wolf' }; const creature = { ...randomCreature(b.type, seed), size: (b.size || 1) * (0.9 + Math.random() * 0.2) }; return { id: `e_${templateId}_${i}_${seed.toString(36).slice(0, 4)}`, templateId, name: t.name, short: t.name, side: 'enemy', hp: t.hp, maxHp: t.hp, damage: t.damage, armour: t.armour, role: t.role || 'melee', spell: null, tags: t.tags, regen: t.regen, xp: t.xp, gold: t.gold, race: t.race, beast: true, creature }; }
  const avatar = randomAvatar(presets, { race: AVATAR_RACE[t.race] || 'human', seed }); const vp = ENEMY_VOICE[t.race] ? deps.voicePresets.presets.find(p => p.id === ENEMY_VOICE[t.race])?.voice : { engine: 'babble', pitch: 0.3 }; return { id: `e_${templateId}_${i}_${Math.random().toString(36).slice(2, 5)}`, templateId, name: t.name, short: t.name, side: 'enemy', hp: t.hp, maxHp: t.hp, damage: t.damage, armour: t.armour, role: t.role || 'melee', spell: t.spell || null, tags: t.tags, regen: t.regen, xp: t.xp, gold: t.gold, race: t.race, avatar, voice: { ...(vp || { engine: 'babble' }), pitch: (vp?.pitch ?? 0.5) + (Math.random() - 0.5) * 0.2 }, speech: { traits: ['gruff'], aggression: 0.9, formality: 0.1 } }; }
// ---- spell effects -----------------------------------------------------------------------------
// Ranged and caster fighters throw something instead of walking up and hitting; every spell carries an
// `element` in data/rules.json, so the projectile and the burst are coloured to match.
const RANGED_ROLES = ['ranged', 'caster', 'healer', 'support'];
function attackElement(c) { return RANGED_ROLES.includes(c?.role) ? (c.role === 'ranged' ? 'physical' : 'arcane') : 'physical'; }
function isRangedFighter(c) { return RANGED_ROLES.includes(c?.role); }

async function fight(enemyIds, { place, boss = false } = {}) {
  mode = 'combat'; const enemies = enemyIds.map(makeEnemy); await stage.setSide(enemies, 'right'); for (const m of game.alive()) stage.anim(m.id, 'idle');
  const partyForCombat = game.party.map(m => ({ id: m.id, name: m.name, short: m.short, side: 'party', hp: m.hp, maxHp: m.maxHp, damage: m.damage, armour: m.armourValue, role: m.role, spell: m.spell, tags: m.speech?.traits || [] }));
  const combat = new Combat(partyForCombat, enemies, rules, Math.random); currentCombat = combat; const byId = Object.fromEntries([...partyForCombat, ...enemies].map(c => [c.id, c])); const memberOf = c => game.party.find(m => m.id === c.id) || c;
  narrate(`<p class="bad"><b>Fight:</b> ${enemies.map(e => e.name).join(', ')}.</p>`);
  const sync = () => { for (const p of partyForCombat) { const m = memberOf(p); m.hp = p.hp; } renderPartyTab(); };
  const react = async (ev) => { const r = talk.combatReaction(ev, partyForCombat, enemies); if (!r) return; const who = memberOf(r.who); const line = r.text ? { text: r.text } : speak(who, r.intent, { bindings: r.bindings }); await sayLine(who, line, { wait: true }); };
  const taunt = async () => { const e = enemies.find(x => x.hp > 0); if (!e || Math.random() >= 0.6) return; if (e.beast) { await beastNoise(e); return; } const tgt = randomAlive(); await sayLine(e, speak(e, 'combat_taunt', { to: tgt, bindings: { foe: talk.speaker(tgt).entity } }), { cls: 'enemy' }); };
  await taunt();
  while (!combat.over) {
    const events = combat.round(); narrate(`<p class="sys">— round ${combat.round_} —</p>`);
    for (const ev of events) {
      if (ev.type === EV.START) { await react(ev); continue; }
      if (ev.type === EV.ATTACK) { const el = attackElement(ev.source); if (isRangedFighter(ev.source)) await stage.cast(ev.source.id, ev.target.id, { element: el, kind: 'magic', flash: el === 'arcane', flashMs: 90 }); else await stage.attack(ev.source.id, ev.target.id); stage.hit(ev.target.id); stage.impact(ev.target.id, el); narrate(`<p class="${ev.source.side === 'party' ? '' : 'bad'}">${ev.source.short || ev.source.name} hits ${ev.target.short || ev.target.name} for ${ev.amount}.</p>`); sync(); await sleep(220); }
      else if (ev.type === EV.SPELL) { await playSpell(ev); narrate(ev.target ? `<p class="good">${ev.spell.name} ${ev.spell.kind === 'drain' ? 'drains' : 'burns'} ${ev.target.short || ev.target.name} for ${ev.amount}.</p>` : `<p class="good">${ev.source.short || ev.source.name} casts <b>${ev.spell.name}</b>.</p>`); if (ev.target) stage.hit(ev.target.id); if (!ev.target) await react(ev); sync(); await sleep(300); }
      else if (ev.type === EV.HEAL) { stage.heal(ev.target.id); narrate(`<p class="good">${ev.target.short || ev.target.name} recovers ${ev.amount}.</p>`); sync(); }
      else if (ev.type === EV.MISS) { if (ev.reason === 'stunned' && ev.source) stage.status(ev.source.id, 'freeze', false); narrate(`<p class="sys">${ev.source.short || ev.source.name} ${ev.reason === 'stunned' ? 'is frozen' : 'swings at shadows'}.</p>`); }
      else if (ev.type === EV.REGEN) { narrate(`<p class="bad">${ev.source.name} knits back together (+${ev.amount}).</p>`); }
      else if (ev.type === EV.BLOODIED) { narrate(`<p class="bad">${ev.target.short} is bloodied.</p>`); await react(ev); }
      else if (ev.type === EV.DOWN) { stage.down(ev.target.id); stage.clearStatuses(ev.target.id); narrate(`<p class="bad"><b>${ev.target.short} goes down.</b></p>`); sync(); await react(ev); }
      else if (ev.type === EV.KILL) { stage.down(ev.target.id); stage.clearStatuses(ev.target.id); narrate(`<p class="good">${ev.target.name} is dead.</p>`); await react(ev); if (Math.random() < 0.3) await taunt(); }
      else if (ev.type === EV.WIN) { await afterWin(enemies, partyForCombat, place, boss); }
      else if (ev.type === EV.LOSE) { await afterLose(enemies, place); return false; }
    }
  }
  spellInFlight = null; for (const id of [...stage.chars.keys()]) stage.clearStatuses(id);
  sync(); currentCombat = null; mode = 'wild'; return combat.result === 'win';
}

/**
 * Draw a spell. The combat engine emits one SPELL event announcing the cast (no target) and one per
 * hit (with a target), so the flash goes on the announcement, the projectile on the first hit, and
 * later hits of the same cast only get a burst — a spell that hits three enemies stays quick.
 * Party-wide buffs put a looping aura on every ally instead.
 */
let spellInFlight = null;
async function playSpell(ev) {
  const sp = ev.spell || {};
  const element = elementName(sp.element || (sp.kind === 'heal_one' ? 'nature' : 'arcane'));
  if (!stage.chars.get(ev.source?.id)) return;
  if (!ev.target) {                                          // the cast itself
    if (sp.kind === 'shield_all' || sp.kind === 'buff_all' || sp.kind === 'dodge_all') {
      stage.fx.cast({ at: stage.footOf(ev.source.id), element, ms: 420 });
      const aura = sp.kind === 'shield_all' ? 'barrier' : sp.kind === 'buff_all' ? 'rally' : 'deflect';
      for (const m of game.party) if (m.hp > 0) stage.status(m.id, aura, true);
      return;
    }
    stage.fx.cast({ at: stage.footOf(ev.source.id), element, ms: 340 });
    if (sp.kind !== 'heal_one') spellInFlight = { source: ev.source.id, element };
    return;
  }
  if (!stage.chars.get(ev.target.id)) return;                // the hits
  if (spellInFlight && spellInFlight.source === ev.source?.id) {
    spellInFlight = null;
    await stage.cast(ev.source.id, ev.target.id, { element, kind: 'magic', flash: false });
  }
  stage.impact(ev.target.id, element, false);
  if (sp.stun) stage.status(ev.target.id, 'freeze', true);
}
async function afterWin(enemies, partyForCombat, place, boss) {
  const alive = game.alive(); const ids = game.partyIds(); const xp = enemies.reduce((s, e) => s + e.xp, 0); const gold = enemies.reduce((s, e) => s + Math.floor(e.gold[0] + Math.random() * (e.gold[1] - e.gold[0] + 1)), 0);
  game.gold += gold; narrate(`<p class="good"><b>Victory.</b> ${xp} xp each, ${gold} gold from the bodies.</p>`);
  const foeId = enemies[0].templateId; const wounded = partyForCombat.some(p => p.hp <= p.maxHp / 2);
  game.remember({ type: 'combat', participants: ids, bindings: { foe: { id: foeId, count: enemies.length }, place: { id: place }, ally: { id: ids[1] } }, details: { outcome: 'won', wounded } });
  for (const m of game.party) { if (m.hp <= 0) { m.hp = 1; stage.revive(m.id); narrate(`<p class="sys">${m.short} comes round, swearing.</p>`); game.remember({ type: 'wounded', participants: [m.id], bindings: { bodypart: { id: lingo.lexicon.byType('bodypart')[Math.floor(Math.random() * 3)]?.id }, foe: { id: foeId, count: 1 }, place: { id: place } }, details: {} }); } }
  for (const m of alive) { if (Math.random() < 0.5) game.remember({ type: 'kill', participants: [m.id], bindings: { foe: { id: foeId, count: 1 }, weapon: m.weapon ? { id: lexId(m.weapon) } : undefined, place: { id: place } }, details: { how: ['a clean stroke', 'a lucky blow', 'a long ugly struggle'][Math.floor(Math.random() * 3)] } }); const ups = game.gainXp(m, xp); if (ups) { narrate(`<p class="good">${m.short} reaches level ${m.level}.</p>`); game.remember({ type: 'levelup', participants: [m.id], bindings: {}, details: { level: m.level } }); } }
  // loot: enemies sometimes drop something; bosses always
  const dropChance = boss ? 1 : 0.4; if (Math.random() < dropChance) { const r = items.roll({ race: enemies[0].race === 'beast' ? 'human' : enemies[0].race, rarity: boss ? (Math.random() < 0.5 ? 'rare' : 'uncommon') : (Math.random() < 0.3 ? 'uncommon' : 'common'), seed: Math.floor(Math.random() * 1e9), namegen: deps.namegen }); if (r) addLoot(r, place); }
  await react({ type: 'win' }); renderHud(); renderSide();
  async function react(ev) { const r = talk.combatReaction(ev, partyForCombat, enemies); if (r) { const who = game.party.find(m => m.id === r.who.id); await sayLine(who, speak(who, r.intent)); } }
  await sleep(400); for (const e of enemies) await stage.remove(e.id);
}
/** Beasts don't talk: a short animal action in the log and a jaw/attack animation, no bubble, no voice. */
async function beastNoise(e) { const list = BEAST_NOISES[e.templateId] || BEAST_NOISES.default; const what = list[Math.floor(Math.random() * list.length)]; narrate(`<p class="sys"><i>The ${e.name} ${what}.</i></p>`); stage.talk(e.id, true); await sleep(700); stage.talk(e.id, false); }
function lexId(item) { const e = items.toLexiconEntry(item); if (!lingo.lexicon.has(e.id)) { lingo.lexicon.add(e); lingo.invalidatePronunciations(); } return e.id; }
async function afterLose(enemies, place) {
  narrate('<p class="bad"><b>Everyone is down.</b> You wake at dawn, stripped of coin, dragged to the roadside by someone kinder than your enemies.</p>');
  game.gold = Math.floor(game.gold / 2); for (const m of game.party) { m.hp = Math.max(1, Math.floor(m.maxHp / 3)); stage.revive(m.id); }
  game.remember({ type: 'combat', participants: game.partyIds(), bindings: { foe: { id: enemies[0].templateId, count: enemies.length }, place: { id: place } }, details: { outcome: 'lost', wounded: true } });
  game.newDay(); currentCombat = null; for (const e of enemies) await stage.remove(e.id); renderHud(); renderSide(); mode = 'wild'; game.save();
  const L = world.locations[game.location]; if (L.kind === 'town') await enterTown(game.location, false); else wildActions(L);
}
async function bossFight(L) {
  const pool = world.encounterPools[L.encounters[0]]; const adds = pool.enemies.slice(0, 2); const won = await fight([L.boss, ...adds], { place: L.place, boss: true }); if (!won) return;
  game.cleared.add(L.place); const q = game.quests.active.find(x => x.target === L.place && !x.done); const Q = q && game.quest(q.id);
  if (Q) { q.done = true; game.addDeed(Q.deed, { place: L.place, quest: Q.id }); narrate(`<p class="good"><b>${Q.name}</b>: done. Word will travel. Go and tell the ${Q.giverTitle}.</p>`); }
  else { const Qany = world.quests.find(x => x.target === L.place); if (Qany) { game.addDeed(Qany.deed, { place: L.place }); narrate(`<p class="good">Nobody asked you to, but you ${Qany.deed}. People will hear.</p>`); } }
  game.reputation += 1; renderHud(); renderSide(); const m = randomAlive(); await sayLine(m, speak(m, 'relief')); wildActions(L);
}

// ------------------------------------------------------------------ camp
async function camp() {
  mode = 'camp'; const L = world.locations[game.location]; stage.setBackdrop('camp', true); stage.setNight(true); await stage.camp(game.party.filter(m => m.hp > 0));
  narrate(`<h4>Camp, night of day ${game.day}</h4><p class="sys">The fire takes. Someone finds the bad cheese.</p>`);
  game.remember({ type: 'meal', participants: game.partyIds(), bindings: { food: { id: lingo.lexicon.byType('food')[Math.floor(Math.random() * 4)]?.id }, place: { id: L.place } }, details: { quality: ['good', 'terrible', 'cold', 'burnt'][Math.floor(Math.random() * 4)] } });
  const alive = game.alive(); const sceneCamp = talk.scene(L.place); sceneCamp.def.timeOfDay = 'night'; sceneCamp.def.comfort = 0.6; sceneCamp.def.tags = [...new Set([...sceneCamp.def.tags, 'quiet'])];
  // structured conversations (conversations/ experiment) from real memories, gear and feelings; then one free memory exchange
  const speakers = alive.map(h => talk.speaker(h)); const facts = factsFrom({ now: game.now, day: game.day, banks: game.banks, heroes: alive.map(h => ({ ...h, equipment: { weapon: h.weapon, armour: h.armour, implement: h.implement } })), meter: null, lootLog: [], relations: game.relations, party: { rations: 9, act: 1, exhaustion: 0 } });
  for (let i = 0; i < 2; i++) { const lines = conversations.talk(speakers, facts, { tags: ['camp'], scene: sceneCamp }); for (const l of lines) { const who = alive.find(h => h.id === l.speaker.id); if (who) await sayLine(who, l); } if (lines.length >= 2) game.relations.applyMutual(lines[0].speaker.id, lines[1].speaker.id, 'shared_meal', { now: game.now }); }
  if (alive.length >= 2 && Math.random() < 0.7) { const [a, b] = makeRng().shuffle(alive); const lines = lingo.converse(talk.speaker(a), talk.speaker(b), { turns: 2, banks: game.banks, now: game.now, scene: sceneCamp, relations: game.relations, topics: ['recall', 'recall_reply'] }); for (const l of lines) { const who = l.speaker.id === a.id ? a : b; await sayLine(who, l); } const ra = game.relations.get(a.id, b.id), rb = game.relations.get(b.id, a.id); for (const [r, other] of [[ra, b], [rb, a]]) { const unknown = (other.speech?.traits || []).filter(t => !r.knows(t)); if (unknown.length && Math.random() < 0.6) r.learn(unknown[0]); } }
  await waitForChoice([{ text: 'Sleep till dawn', cls: 'primary', run: async () => {} }]);
  for (const m of game.party) m.hp = Math.min(m.maxHp, m.hp + Math.ceil(m.maxHp / 2)); game.newDay(); renderHud(); renderSide(); game.save();
  narrate(`<h4>Day ${game.day}</h4><p class="sys">Cold ash, stiff backs, and a road.</p>`); stage.clearCamp();
  if (mode === 'camp') await arrive(game.location, { resumed: true }); mode = 'wild';
}

window.partyQuest = { get game() { return game; }, get stage() { return stage; }, get talk() { return talk; }, library, lingo, items, rules, world, get mode() { return mode; }, get busy() { return busy; }, fight, camp, travel, arrive };
document.body.dataset.ready = '1';
