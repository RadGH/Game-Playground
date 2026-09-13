// Emberveil prototype controller. Screens: title → hire → world (map + node flows: town / combat / events / shrines /
// treasure / skill checks / dungeons). Data comes from data/*.json (built from the original game), rules from js/rules.js,
// loot from js/loot.js, fights from js/combat.js, the world from js/game.js. Bodies: Mii + creatures on the 3D stage.
import { Lingo, Entity } from '../../../lingo/js/lingo.js';
import { Library } from '../../../library/js/library.js';
import { loadDeps, makeNpc } from '../../../library/js/make.js';
import { voiceFor, roleForEnemy } from '../../../shared/voices.js';
import { renderSVG } from '../../../avatar-2d/js/render.js';
import { randomAvatar } from '../../../avatar-2d/js/random.js';
import { randomCreature } from '../../../avatar-3d/js/creatures.js';
import * as voice from '../../../voice-lab/js/voice.js';
import { Game, ACT_NAMES, MAIN_QUESTS, equip, unequip, refresh, derive, hireCost } from './game.js';
import { Combat, fleeCheck, skillType, recordEvent } from './combat.js';
import { elementName } from '../../../avatar-3d/js/spellfx.js';
import { mergeSkill, classSkills, passiveTree, PASSIVE_NODES, UNLOCKS, TALENT_LEVELS, xpForLevel, canUse, describeEffect } from './rules.js';
import { Stage } from './stage.js';
import { Talk } from './talk.js';
import { Conversations, factsFrom, Threads, expandVariants } from '../../../conversations/js/conversations.js';
import { LangDebug, LANGDEBUG_CSS } from '../../../shared/langdebug.js';
import { renderMeter, METER_CSS } from '../../../meters/js/meter-ui.js';
import { Assets } from '../../../assets/js/assets.js';
import { VEHICLES, SUPPLY_KINDS } from './game.js';
import { makeRng } from './rng.js';
import { setupUI, initMenu, decorateFrames, iconHtml, gemHtml, gemFor, slotIcon, SLOT_NAME, STAT_TIPS, nodeInfo, itemTipHtml, registerTip, hideTip, esc } from './ui.js';

const $ = id => document.getElementById(id);
// An attribute whose value is null/undefined is skipped, so `disabled: cond ? '' : undefined` means
// "only set it when cond" instead of setting the literal string "undefined" (which would still apply).
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null && k !== 'text' && k !== 'html') continue; if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const k of kids) if (k != null) e.append(k); return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const toast = t => { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => e.hidden = true, 2200); };

// ------------------------------------------------------------------ load
const base = '../../'; const j = async p => (await fetch(base + p)).json(); const D = p => j('prototypes/emberveil/data/' + p);
const [items, classes, skills, builds, enemies, bosses, encounters, spells, zones, zoneTables, dialogs, randomEvents, dungeons, companions, statuses, bossPhases, classLooks, enemyLooks, lexData, grammarData, traitsData, eventsData, relationsData, packData, topicsData, namedData, sideQuestData, classQuestData, threadsData, balanceData] = await Promise.all([D('items.json'), D('classes.json'), D('skills.json'), D('build-presets.json'), D('enemies.json'), D('bosses.json'), D('encounters.json'), D('enemy-spells.json'), D('zones.json'), D('zone-tables.json'), D('dialog-events.json'), D('random-events.json'), D('dungeons.json'), D('companions.json'), D('status-effects.json'), D('boss-phases.json'), D('class-looks.json'), D('enemy-looks.json'), j('lingo/data/lexicon.json'), j('lingo/data/grammar.json'), j('lingo/data/traits.json'), j('lingo/data/events.json'), j('lingo/data/relations.json'), j('lingo/data/packs/emberveil.json'), j('conversations/data/topics.json'), D('named-enemies.json'), D('side-quests.json'), D('class-quests.json'), j('conversations/data/threads.json'), D('balance.json')]);
const DATA = { items, classes, skills, builds, enemies, bosses, encounters, spells, zones, zoneTables, dialogs, randomEvents, dungeons, companions, statuses, bossPhases, events: eventsData, relations: relationsData, named: namedData, sideQuests: sideQuestData, classQuests: classQuestData, balance: balanceData };
const [deps, library, assets] = await Promise.all([loadDeps(base), Library.open(base + 'library/'), Assets.open(base + 'assets/')]);
const lingo = new Lingo({ lexicon: lexData, grammar: grammarData, traits: traitsData }); for (const e of packData.entries) lingo.lexicon.add(e); DATA.lexicon = lingo.lexicon;
expandVariants(topicsData, { perLine: 2, seed: 11 }); const conversations = new Conversations({ lingo, topics: topicsData }); const threads = new Threads({ conv: conversations, threads: threadsData }); const langdbg = new LangDebug({ lingo, base: base }); document.head.append(Object.assign(document.createElement('style'), { textContent: LANGDEBUG_CSS })); langdbg.mountSettings($('menu-langdbg') || $('hud'), { onToggle: on => { if (on) for (const p of document.querySelectorAll('#narrative .say')) langdbg.decorate(p); } }); document.head.append(Object.assign(document.createElement('style'), { textContent: METER_CSS }));
for (const [id, e] of Object.entries({ ...enemies.entities, ...bosses.entities })) if (!lingo.lexicon.has(id)) lingo.lexicon.add({ id, type: 'creature', forms: { sg: e.name.toLowerCase(), pl: e.name.toLowerCase() + 's' }, tags: [] });
lingo.invalidatePronunciations();
const LOOKS = classLooks.classes; const SK = skills.skills; const SP = spells.spells;
let game = null, talk = null, stage = null, busy = false, selectedHero = 0;
let textSpeed = 1;   // menu setting: multiplies how long a spoken line stays on screen
function showScreen(id) { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== 'screen-' + id; $('hud').hidden = id !== 'world'; document.body.dataset.screen = id; }

// ------------------------------------------------------------------ title
$('btn-new').onclick = () => { game = new Game(DATA); setupHire(); showScreen('hire'); };
$('btn-continue').onclick = () => { const g = Game.load(DATA); if (!g) return toast('No save'); game = g; startWorld(true); };
$('btn-continue').disabled = !Game.hasSave(); if ($('btn-continue').disabled) $('btn-continue').title = 'No saved run in this browser yet';

// ------------------------------------------------------------------ hire
let chosen = [];
function blueprintOptions() { const list = library.list('character'); $('hire-blueprint').replaceChildren(el('option', { value: '', text: 'Look: class default' }), ...list.map(e => el('option', { value: e.id, text: 'Look: ' + e.name }))); }
// Ribbon colour by what the class does, so the grid reads at a glance.
const roleColor = role => { const r = (role || '').toLowerCase(); if (/tank|frontline|guard|bulwark|defend/.test(r)) return '#5b7fa0'; if (/heal|support|priest|medic/.test(r)) return '#5aa06e'; if (/ranged|precision|archer|marksman|shot/.test(r)) return '#8b9a44'; if (/assassin|burst|duelist|striker|blade|hunter/.test(r)) return '#a9483f'; if (/summon|army|builder|beast|pet/.test(r)) return '#7d8a4e'; if (/mage|caster|arcane|glass|chaos|spell|element|dealer|void|blood/.test(r)) return '#7a56ab'; return '#9a7a3e'; };
function classTip(c) {
  const kit = (c.startingEquipment || []).map(k => game?.loot?.base(k)?.name || k).join(', ');
  const s = SK[(c.skills || [])[0]];
  return `<div class="tip-title">${esc(c.name)}</div><div class="tip-sub">${esc(c.role)} · ${esc(c.armorType)}</div><hr><div>${esc(c.hook || '')}</div>`
    + (kit ? `<hr><div class="tip-sub"><b>Kit:</b> ${esc(kit)}</div>` : '')
    + (s ? `<div class="tip-sub"><b>First skill:</b> ${esc(s.name || c.skills[0])} — ${esc(s.description || '')}</div>` : '')
    + `<hr><div class="tip-sub">${UNLOCKS[c.id] ? 'In the original this class unlocked by: ' + esc(UNLOCKS[c.id]) : 'Open from the start.'} Click the card to hire.</div>`;
}
function setupHire() { chosen = []; blueprintOptions(); $('class-grid').replaceChildren(...classes.classes.map(c => { const look = LOOKS[c.id]; return el('div', { class: 'class-card', 'data-class': c.id, 'data-tip-html': classTip(c), onclick: () => addChosen(c) }, el('div', { class: 'portrait', html: renderSVG(look.avatar, { width: 90, height: 120 }) }), el('b', { text: c.name }), el('span', { class: 'ribbon', style: `--role:${roleColor(c.role)}`, text: c.role }), el('div', { class: 'tiny', text: c.armorType }), UNLOCKS[c.id] ? el('div', { class: 'lock', text: 'unlock: ' + UNLOCKS[c.id] }) : el('div', { class: 'lock', text: 'starter class' })); })); renderChosen(); }
function addChosen(c) { if (chosen.length >= 4) return toast('Four heroes max (more go to the bench later)'); const bpId = $('hire-blueprint').value; const bp = bpId ? library.stamp(bpId) : null; const look = LOOKS[c.id]; const name = $('hire-name').value.trim() || bp?.name || look.name; const blueprint = bp ? { ...bp } : { ...look, name, short: name.split(' ')[0], pronouns: look.gender === 'f' ? 'she' : 'he' }; if (!bp) blueprint.avatar = look.avatar; const h = game.makeHero(c.id, name, 1, blueprint); h.voice = voiceFor({ role: c.id, gender: h.gender || look.gender, seed: hashSeed(name) }); chosen.push(h); $('hire-name').value = ''; renderChosen(); }
function renderChosen() {
  const slots = [];
  for (let i = 0; i < 4; i++) {
    const h = chosen[i];
    if (!h) { slots.push(el('div', { class: 'socket empty', 'data-tip': 'An empty place in the party — click a class card to fill it' }, el('span', { text: 'Empty place' }))); continue; }
    const kit = Object.values(h.equipment).map(x => x.name).join(', ');
    slots.push(el('div', { class: 'socket filled', 'data-tip-html': `<div class="tip-title">${esc(h.name)}</div><div class="tip-sub">${esc(h.className)} · ${esc(h.role)}</div><hr><div class="tip-sub"><b>Kit:</b> ${esc(kit)}</div>` },
      el('div', { class: 'portrait', html: renderSVG(h.avatar, { width: 56, height: 72 }) }),
      el('div', { class: 'info' }, el('b', { text: h.name }), el('div', { class: 'tiny', text: `${h.className} · ${h.role}` }),
        el('div', { class: 'statline' }, ...['STR', 'DEX', 'INT', 'CON'].map(k => el('span', { class: 'stat-chip', 'data-tip': STAT_TIPS[k] }, el('i', { class: 'ic ic-stat_' + k.toLowerCase() }), document.createTextNode(String(h.attrs[k]))))),
        el('div', { class: 'tiny', html: `${iconHtml('hp')} ${h.maxHp} hp · ${iconHtml('mp')} ${h.maxMp} mp` }),
        el('button', { class: 'small', text: 'Remove', 'data-tip': 'Send this hero away and free the place', onclick: e => { e.stopPropagation(); hideTip(); chosen = chosen.filter(x => x !== h); renderChosen(); } }))));
  }
  $('hire-party').replaceChildren(...slots);
  for (const card of document.querySelectorAll('#class-grid .class-card')) card.classList.toggle('picked', chosen.some(h => h.class === card.dataset.class));
  $('hire-count').textContent = `${chosen.length} / 4`;
  const start = $('btn-start'); start.disabled = chosen.length === 0;
  start.dataset.tip = chosen.length ? `Take these ${chosen.length} onto the road` : 'Hire at least one hero first';
  start.title = chosen.length ? '' : 'Hire at least one hero first';   // a disabled button gets no hover events, so fall back to the browser's own tooltip
}
$('btn-suggest').onclick = () => { chosen = []; for (const id of ['warrior', 'ranger', 'mage', 'cleric']) addChosen(classes.classes.find(c => c.id === id)); };
$('btn-start').onclick = () => { for (const h of chosen) game.addHero(h); game.startQuests(); startWorld(false); };

// ------------------------------------------------------------------ world
async function startWorld(resumed) {
  showScreen('world'); if (!stage) stage = new Stage($('stage'), { assets }); talk = new Talk({ lingo, game, voice }); talk.muted = $('mute').checked; talk.engineOverride = $('engine').value || 'formant'; for (const h of game.party) talk.speaker(h);
  $('narrative').replaceChildren(); renderHud(); renderSide(); renderMap();
  if (!resumed) narrate(`<h4>${ACT_NAMES[0]}</h4><p>A wanderer on a road that used to lead somewhere. The Veil bends around you. Somebody named you.</p>`); else narrate(`<p class="sys">Game loaded. ${game.zone().name}.</p>`);
  await stage.setSide(game.fighters().map(bodyOf), 'left'); stage.setBackdrop(game.zoneId); await enterNode();
}
$('mute').onchange = () => { if (talk) talk.muted = $('mute').checked; if ($('mute').checked) voice.stopAll(); };
$('engine').onchange = () => { if (talk) talk.engineOverride = $('engine').value || 'formant'; };
$('btn-save').onclick = () => { if (!game) return toast('Nothing to save yet'); game.save(); $('btn-continue').disabled = false; toast('Saved'); };
// In-game menu overlay. Each handler returns true to keep the menu open (something went wrong or the user said no).
const menu = initMenu($('menu-dialog'), {
  save: () => { if (!game) { toast('Nothing to save yet'); return true; } game.save(); $('btn-continue').disabled = false; toast('Saved'); },
  load: () => { if (busy) { toast('Wait for the scene to finish'); return true; } const g = Game.load(DATA); if (!g) { toast('No save'); return true; } game = g; startWorld(true); },
  newGame: () => { if (busy) { toast('Wait for the scene to finish'); return true; } if (game && !confirm('Abandon this run and hire a new party?')) return true; game = new Game(DATA); setupHire(); showScreen('hire'); },
  quit: () => { if (busy) { toast('Wait for the scene to finish'); return true; } if (game) game.save(); location.href = '../../index.html'; },
});
$('btn-menu').onclick = () => menu.open();
$('text-speed').onchange = () => { textSpeed = +$('text-speed').value || 1; };
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => { hideTip(); for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b); for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== 'tab-' + b.dataset.tab; };
function renderHud() {
  const z = game.zone();
  const act = ACT_NAMES[z.act] || '';
  $('hud-act').textContent = act;
  // the act label often already carries the zone name ("Prologue · The Lonely Road") — don't say it twice
  const dupe = act.toLowerCase().includes((z.name || '').toLowerCase());
  $('hud-place').textContent = (dupe ? '' : z.name + ' · ') + (game.node()?.name || '');
  $('hud-gold').textContent = game.gold; $('hud-fame').textContent = game.fame;
  const left = game.legsLeft(), per = game.legsPerDay();
  $('hud-day').textContent = `Day ${game.day} · ${left}/${per}`;
  $('hud-daynight').className = 'ic ic-' + (left ? 'day' : 'night');
  const day = $('hud-day-stat'); day.classList.toggle('warn', !left);
  day.dataset.tip = left ? `Day ${game.day}. ${left} of ${per} moves left before the party has to make camp.` : `Day ${game.day}. Out of moves — rest to start the next day.`;
  const rations = game.supplies.ration || 0, v = VEHICLES[game.vehicle] || VEHICLES.none;
  $('hud-ration').textContent = rations;
  const food = $('hud-food'); food.classList.toggle('warn', rations <= 1);
  food.dataset.tip = (rations <= 0 ? 'No food. The next rest adds exhaustion: −10% hit, dodge and damage per stack.'
    : `${rations} ration${rations === 1 ? '' : 's'} — one feeds the party for ${v.rationEvery > 1 ? v.rationEvery + ' days' : 'a day'}.${rations <= 1 ? ' Buy more at the next settlement.' : ''}`)
    + (game.exhaustion ? ` Exhausted ×${game.exhaustion}.` : '');
  $('hud-vehicle-name').textContent = v.name;
  $('hud-vehicle-ic').className = 'ic ic-' + (!game.vehicle || game.vehicle === 'none' ? 'boot' : 'wagon');
  $('hud-vehicle').dataset.tip = `${v.name} — ${v.desc}`;
}
function narrate(html, cls = '') { const p = el('div', { class: cls, html }); $('narrative').append(p); $('narrative').scrollTop = 1e9; return p; }
// An action button: optional icon (assets/data/ui or the map node icons) + label + a tooltip saying what it does.
// The label stays the button's only text so tests can match it exactly.
function setActions(list) {
  $('actions').replaceChildren(...list.map(a => {
    const b = el('button', { class: a.cls || '', onclick: async () => { if (busy) return; busy = true; hideTip(); try { await a.run(); } catch (e) { console.error(e); narrate(`<p class="bad">Something broke: ${e.message}</p>`); } busy = false; } });
    if (a.tip) b.dataset.tip = a.tip;
    if (a.icon) b.append(el('i', { class: 'ic ic-' + a.icon }));
    b.append(document.createTextNode(a.text));
    return b;
  }));
}
function waitForChoice(list) { const was = busy; busy = false; return new Promise(res => setActions(list.map(a => ({ ...a, run: async () => { const r = await a.run?.(); if (!a.stay) { busy = was; res(r); } } })))); }

// ---- bodies on the stage
// Designed looks (data/enemy-looks.json, built by tools/build-emberveil-enemies.mjs): one per enemy, boss, pet,
// companion and named hire. copyLook() hands out a deep copy so the game can resize/decorate without editing the data.
const ELOOKS = enemyLooks;
function copyLook(L) { return L ? JSON.parse(JSON.stringify(L)) : null; }
function designedLook(id) { return copyLook(ELOOKS.enemies?.[id] || ELOOKS.bosses?.[id]); }
function companionLook(id) { return copyLook(ELOOKS.pets?.[id] || ELOOKS.companions?.[id]); }
function hireLook(id) { return copyLook(ELOOKS.hires?.[id]); }
/** One plain-language line for each thing an equipped weapon just did out of combat. */
function narrateGear(fired = []) {
  for (const f of fired || []) {
    const who = f.hero?.short || f.hero?.name || 'Someone'; const w = f.hero?.equipment?.weapon?.name || 'their weapon'; const r = f.result || {};
    if (r.ration) narrate(`<p class="sys">${who} strips the field with ${w}: +${r.ration} ration${r.ration > 1 ? 's' : ''}.</p>`);
    else if (r.item) narrate(`<p class="good">${who} spots something off the trail with ${w}: <b>${r.item.name}</b>.</p>`);
    else if (r.gold) narrate(`<p class="good">${w} turns up a cache on the road: +${r.gold} gold.</p>`);
    else if (r.healed) narrate(`<p class="good">${w} is set by the fire. The party mends ${r.healed} HP in the night.</p>`);
    else if (r.watch) narrate(`<p class="sys">${who} plants ${w} and stands the watch. A ration goes on the fire.</p>`);
    else if (r.named) narrate(`<p class="good"><b>${w}</b> has a name now: ${r.named}. Fifty dead earned it.</p>`);
    else if (r.memory) narrate(`<p class="sys">${who} wipes ${w} down. That one will be told again.</p>`);
    else if (r.liked) narrate(`<p class="sys">The party saw who stood in front. ${who} goes up in their estimation.</p>`);
    else if (r.disliked) narrate(`<p class="bad">Nobody liked watching ${who} use ${w}.</p>`);
  }
}
function bodyOf(h) { const cl = h.isCompanion ? companionLook(h.templateId) : null; const av = cl?.creature ? null : (cl?.avatar || h.avatar || LOOKS[h.class]?.avatar || randomAvatar(deps.avatarPresets, { seed: 1 })); return { id: h.id, name: h.name, short: h.short, hp: h.hp, avatar: av ? withHeldGear(av, h) : null, creature: cl?.creature || (h.isCompanion ? creatureFor(h.templateId) : null) }; }
/** Weapons that carry their own `look` (the road weapons) are drawn in the hand instead of the class default. */
function withHeldGear(avatar, h) {
  const look = h.equipment?.weapon?.look, off = h.equipment?.offhand?.look; if (!look && !off) return avatar;
  const out = { ...avatar };
  if (look) out.held = { id: look.held, color: look.color };
  if (off) out.offhand = { id: off.held, color: off.color };
  return out;
}
function creatureFor(id = '') { const m = [[/wolf|hound|dog|warg/, 'wolf'], [/bear/, 'bear'], [/spider|widow/, 'spider'], [/dragon|wyrm|drake/, 'dragon'], [/bat|moth/, 'bat'], [/snake|serpent|worm/, 'snake'], [/rat/, 'rat'], [/boar/, 'boar'], [/horse|steed/, 'horse'], [/deer|stag|owl|cat|frog|sprite|wisp/, 'wolf']].find(([re]) => re.test(id)); return m ? { ...randomCreature(m[1], hashSeed(id)), size: /dire|giant|ancient|king|elder/.test(id) ? 1.5 : /dragon|wyrm|bear|titan/.test(id) ? 1.2 : 1 } : null; }
function hashSeed(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function enemyLook(e) { const id = e.templateId; if (e.named && e.look) { const L = e.look; if (L.creature) return { id: e.id, name: e.name, short: e.short, hp: e.hp, creature: { ...randomCreature(L.creature, hashSeed(e.name)), colors: { ...randomCreature(L.creature, 1).colors, ...(L.colors || {}) }, size: e.big ? 1.6 : 1.3 }, beast: true, named: true }; const D0 = designedLook(id); const av = D0?.avatar || randomAvatar(deps.avatarPresets, { race: L.race || 'human', seed: hashSeed(e.name), allowBespoke: true }); for (const k of ['hat', 'top', 'extras', 'eyes', 'held', 'offhand']) if (L[k]) av[k] = { ...(av[k] || {}), id: L[k], color: av[k]?.color || '#888' }; av.body.height = e.big ? 0.95 : 0.7; av.body.width = 0.7; return { id: e.id, name: e.name, short: e.short, hp: e.hp, avatar: av, named: true }; } if (e.named) { const base = enemyLook({ ...e, named: false }); if (base.avatar) { base.avatar.extras = { id: ['scar', 'war_stripe', 'brand', 'blood', 'eye_black'][hashSeed(e.name) % 5], color: '#c83a2a' }; base.avatar.body.height = e.big ? 0.95 : 0.7; } else if (base.creature) base.creature.size *= e.big ? 1.6 : 1.3; return { ...base, named: true }; } const D = designedLook(id);
  if (D?.creature) return { id: e.id, name: e.name, short: e.short || e.name, hp: e.hp, creature: D.creature, beast: true, desc: D.desc, voiceRole: D.voiceRole };
  if (D?.avatar) { if (e.boss) D.avatar.body.height = Math.max(D.avatar.body.height, 0.9); return { id: e.id, name: e.name, short: e.short || e.name, hp: e.hp, avatar: D.avatar, race: D.race, desc: D.desc, voiceRole: D.voiceRole }; }
  const cr = creatureFor(id) || (/golem|elemental|horror|titan|shard|worm|colossus|abomination/.test(id) ? { ...randomCreature('drake', hashSeed(id)), size: 1.3 } : null); if (cr) return { id: e.id, name: e.name, short: e.name, hp: e.hp, creature: cr, beast: true }; const race = /goblin|gremlin|kobold/.test(id) ? 'goblin' : /skeleton|ghoul|wraith|lich|undead|bone|shade|zombie|wight/.test(id) ? 'undead' : /orc|ogre|troll|brute/.test(id) ? 'orc' : /demon|imp|fiend|hell|fel|abyss|void|primordial/.test(id) ? 'orc' : /elf|veil|cult|sorcerer|prophet|scholar/.test(id) ? 'elf' : 'human'; const av = randomAvatar(deps.avatarPresets, { race, seed: hashSeed(id + e.id) }); if (/demon|imp|fiend|hell|fel/.test(id)) av.body.skin = '#8a2a2a'; if (/void|abyss|primordial|shade/.test(id)) av.body.skin = '#3a2a5a'; if (e.boss) av.body.height = 0.9; return { id: e.id, name: e.name, short: e.name, hp: e.hp, avatar: av, race }; }
function bubbleAt(id, text, who, cls = '') { const c = stage.chars.get(id); const b = el('div', { class: 'bubble ' + cls }, el('b', { text: who }), document.createTextNode(text)); if (c) { const v = c.group.position.clone(); v.y += 1.95; v.project(stage.scene.camera); b.style.left = `${(v.x + 1) / 2 * 100}%`; b.style.top = `${(1 - v.y) / 2 * 100}%`; } else { b.style.left = '50%'; b.style.top = '20%'; } $('bubbles').append(b); return b; }
// ---- spell effects on the stage ---------------------------------------------------------------
// A skill event says who is casting but not at whom, so we remember the caster's element and fire the
// projectile on their first damage event. Later hits of the same skill only get an impact burst.
const pendingCast = new Map();   // caster id -> { element, kind }
const RANGED_WEAPONS = ['bow', 'crossbow', 'javelin', 'sling', 'dart', 'throwing'];

/** How a plain attack should look: a thrust, an arrow, or a bolt of magic. */
function attackStyle(unit) {
  if (!unit || unit.isEnemy) return { kind: 'melee', element: 'physical' };
  if (unit.derived?.cat === 'magic') return { kind: 'magic', element: 'arcane' };
  if (RANGED_WEAPONS.includes(unit.equipment?.weapon?.subtype)) return { kind: 'ranged', element: 'physical' };
  return { kind: 'melee', element: 'physical' };
}
/** The element a skill or an enemy spell should be drawn in. */
function elementForSkill(ev) {
  const sp = SP[ev.skill]; if (sp?.fxKind) return elementName(sp.fxKind);
  const sk = SK[ev.skill]; if (sk) return elementName(skillType(sk));
  return ev.skillType === 'magic' ? 'arcane' : 'physical';
}
/** Remember what the caster is throwing, and flash a rune at their feet. */
function noteCast(ev) {
  if (!ev.source) return;
  const element = elementForSkill(ev);
  pendingCast.set(ev.source.id, { element, kind: ev.skillType || 'magic' });
  if (stage.chars.get(ev.source.id)) stage.fx.cast({ at: stage.footOf(ev.source.id), element, ms: 340 });
}
/** If the damage belongs to a skill that has not been thrown yet, throw it. */
async function flyIfPending(ev, fallbackElement) {
  const p = ev.source && pendingCast.get(ev.source.id);
  if (!p) return;
  pendingCast.delete(ev.source.id);
  if (['melee', 'heal', 'buff', 'revive'].includes(p.kind)) return;
  if (!stage.chars.get(ev.source.id) || !stage.chars.get(ev.target.id)) return;
  await stage.cast(ev.source.id, ev.target.id, { element: p.element || fallbackElement, kind: 'magic', crit: !!ev.crit, flash: false });
}
/** Make the auras on a fighter match their real status list (statuses expire silently). */
function syncStatuses(unit) {
  if (!unit || !stage.chars.get(unit.id)) return;
  const want = new Set((unit.statuses || []).map(x => x.type));
  for (const t of stage.statusesOn(unit.id)) if (!want.has(t)) stage.status(unit.id, t, false);
  for (const t of want) stage.status(unit.id, t, true);
}

function floatAt(id, text, cls = '') { const c = stage.chars.get(id); const d = el('div', { class: 'dmg ' + cls, text }); if (c) { const v = c.group.position.clone(); v.y += 1.3; v.project(stage.scene.camera); d.style.left = `${(v.x + 1) / 2 * 100}%`; d.style.top = `${(1 - v.y) / 2 * 100}%`; } else { d.style.left = '50%'; d.style.top = '50%'; } $('bubbles').append(d); setTimeout(() => d.remove(), 1000); }
async function sayLine(ch, line, { cls = '', wait = true } = {}) { if (!line?.text) return; const who = ch.short || ch.name; const b = bubbleAt(ch.id, line.text, who, cls); stage.talk(ch.id, true); const shown = langdbg.rewrite(line.text); const para = narrate(`<p class="say ${cls}"><b>${who}:</b> ${shown}</p>`); langdbg.decorate(para.querySelector('p')); const min = (700 + line.text.length * 24) * textSpeed; const t0 = Date.now(); if (wait) { await talk.say(ch, line); const left = min - (Date.now() - t0); if (left > 0) await sleep(Math.min(left, 2200)); b.remove(); } else setTimeout(() => b.remove(), min); stage.talk(ch.id, false); }
const speak = (ch, intent, opts) => talk.line(ch, intent, opts);
const randomAlive = () => { const a = game.alive(); return a[Math.floor(Math.random() * a.length)]; };

// ---- map
// Map node icons live in the shared asset library (assets/data/icons/<type>.svg) so other games can use them.
// If a fetch fails we still draw something: a plain dot, so the map stays readable.
const ICON_FALLBACK = '<circle r="2" fill="#cfd6e4"/>';
const NODE_ICONS = await assets.icons();
const iconMarkup = type => NODE_ICONS[type] || (assets.iconSpecs[type] ? ICON_FALLBACK : '');
/** Column = graph depth from start, row = spread within the column. Replaces the authored x/y so inserted nodes never overlap. */
function layoutZone(z) { const byId = Object.fromEntries(z.nodes.map(n => [n.id, n])); const depth = {}; const start = z.nodes.find(n => n.id === 'start') || z.nodes[0]; const q = [[start.id, 0]]; while (q.length) { const [id, d] = q.shift(); if (depth[id] != null && depth[id] >= d) continue; depth[id] = d; for (const e of byId[id]?.exits || []) if (byId[e]) q.push([e, d + 1]); } for (const n of z.nodes) if (depth[n.id] == null) depth[n.id] = 0; const cols = {}; for (const n of z.nodes) (cols[depth[n.id]] ||= []).push(n); const maxD = Math.max(...Object.keys(cols).map(Number)); const pos = {}; for (const [d, list] of Object.entries(cols)) { list.sort((a, b) => (a.y ?? 0.5) - (b.y ?? 0.5)); list.forEach((n, i) => { pos[n.id] = [7 + (maxD ? d / maxD : 0.5) * 82, list.length === 1 ? 50 : 12 + (i / (list.length - 1)) * 74]; }); } return pos; }
function renderMap() {
  const z = game.zone(); const svg = $('map'); svg.replaceChildren();
  const act = ACT_NAMES[z.act] || ''; const dupe = act.toLowerCase().includes((z.name || '').toLowerCase());
  $('map-zone').textContent = `${z.name} — ${dupe ? act.split(' · ')[0] : act}`;   // no "The Lonely Road (Prologue · The Lonely Road)"
  const reach = game.reachable(); const pos = layoutZone(z);
  const NS = 'http://www.w3.org/2000/svg'; const mk = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  // The svg stretches to its box (preserveAspectRatio="none"), so give the viewBox the same shape as
  // the panel: circles stay round and the labels are not smeared sideways.
  const box = svg.getBoundingClientRect();
  const vh = Math.max(26, Math.min(120, Math.round(100 * (box.height || 200) / (box.width || 620))));
  svg.setAttribute('viewBox', `0 0 100 ${vh}`);
  const P = id => { const [x, y] = pos[id]; return [x, 5 + (y / 100) * (vh - 10)]; };
  // aged-parchment ground, faint survey grid
  const defs = mk('defs'); defs.innerHTML = '<radialGradient id="map-ground" cx="50%" cy="42%" r="80%"><stop offset="0" stop-color="#4a3826"/><stop offset="45%" stop-color="#33261a"/><stop offset="100%" stop-color="#150e09"/></radialGradient>';
  svg.append(defs, mk('rect', { class: 'mapground', x: 0, y: 0, width: 100, height: vh, fill: 'url(#map-ground)' }));
  const grid = mk('g', { class: 'mapgrid' });
  for (let gx = 10; gx < 100; gx += 10) grid.append(mk('line', { x1: gx, y1: 0, x2: gx, y2: vh }));
  for (let gy = 10; gy < vh; gy += 10) grid.append(mk('line', { x1: 0, y1: gy, x2: 100, y2: gy }));
  svg.append(grid);
  // trails between nodes: dashed, hand-drawn ink; the ones you can walk today glow and march
  for (const n of z.nodes) for (const ex of n.exits || []) {
    const m = z.nodes.find(x => x.id === ex); if (!m) continue;
    const [x1, y1] = P(n.id), [x2, y2] = P(m.id);
    svg.append(mk('path', { d: `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`, fill: 'none', class: 'edge' + (n.id === game.nodeId && reach.includes(ex) ? ' open' : '') + (game.isVisited(n.id) && game.isVisited(ex) ? ' walked' : '') }));
  }
  // how much room a label has before it runs into its neighbour
  const xs = [...new Set(Object.values(pos).map(p => p[0]))].sort((a, b) => a - b);
  const gap = xs.length > 1 ? Math.min(...xs.slice(1).map((v, i) => v - xs[i])) : 30;
  const maxChars = Math.max(6, Math.min(20, Math.floor(gap / 0.95)));
  z.nodes.forEach((n, idx) => {
    const [x, y] = P(n.id); const open = reach.includes(n.id); const here = n.id === game.nodeId;
    const g = mk('g', { transform: `translate(${x} ${y})`, class: 'mapnode' + (open ? ' clickable' : '') });
    const cls = ['node', n.type]; if (game.isVisited(n.id)) cls.push('visited'); if (game.isCleared(n.id)) cls.push('cleared'); if (here) cls.push('here'); if (open) cls.push('open');
    const known = game.isVisited(n.id) || open || n.type === 'boss' || n.type === 'town';
    if (!known) cls.push('locked');
    const info = nodeInfo(n);
    const state = here ? 'You are here.' : game.isCleared(n.id) ? 'Cleared — nothing left but the walk.' : game.isVisited(n.id) ? 'Already been here.' : open ? 'One move away.' : 'Not reachable from where you stand.';
    g.setAttribute('data-tip-html', `<div class="tip-title">${esc(known ? n.name : 'Unknown ground')}</div><div class="tip-sub">${esc(info.name)}</div><hr><div>${esc(known ? info.text : 'Nobody has told you what waits here.')}</div><div class="tip-sub">${esc(state)}${open && !game.canMove() ? ' No moves left today — rest first.' : ''}</div>`);
    const r = n.type === 'boss' ? 2.9 : n.type === 'town' ? 2.6 : 2.2;
    const c = mk('circle', { r, class: cls.join(' ') }); g.append(c);
    if (game.isVisited(n.id)) g.append(mk('circle', { r: r * 0.62, class: 'seal' }));    // pressed wax seal
    if (known) { const ic = mk('g', { class: 'icon', transform: `scale(${n.type === 'boss' ? 0.32 : 0.26})` }); ic.innerHTML = iconMarkup(n.named ? 'named' : n.type); g.append(ic); }
    if (open) c.addEventListener('click', () => { if (busy) return toast('Finish the scene first'); if (!game.canMove()) return toast('No moves left today. Rest first.'); hideTip(); game.travel(n.id); narrateGear(game.legGear); renderMap(); renderHud(); enterNode(); });
    const label = !known ? '' : n.name.length > maxChars ? n.name.slice(0, maxChars - 1).trimEnd() + '…' : n.name;
    const t = mk('text', { y: idx % 2 ? -(r + 1.6) : r + 3.1, 'text-anchor': 'middle', class: here ? 'here' : '' }); t.textContent = label; g.append(t);
    svg.append(g);
  });
  const sel = $('zone-select'); sel.replaceChildren(...game.zoneOrder.filter(id => game.unlockedZones.includes(id)).map(id => el('option', { value: id, text: game.zones[id].name + (id === game.zoneId ? ' (here)' : '') }))); sel.value = game.zoneId; sel.onchange = () => { if (busy) { toast('Finish the scene first'); sel.value = game.zoneId; return; } game.enterZone(sel.value); stage.setBackdrop(game.zoneId); renderMap(); renderHud(); enterNode(); };
}
// ---- node flows
async function enterNode() {
  if (busy) return; busy = true; try { await enterNodeInner(); } catch (e) { console.error(e); narrate(`<p class="bad">Something broke: ${e.message}</p>`); mapActions(); } busy = false;
}
async function enterNodeInner() {
  const n = game.node(); renderHud(); renderMap(); const res = game.enter(n); stage.clearSide('right'); stage.setBackdrop(game.zoneId);
  if (res.kind === 'town') return town(res.town);
  if (res.kind === 'combat') { narrate(`<h4>${n.name}</h4><p class="bad">${res.encounter.name}.</p>`); const won = await fight(res.encounter, { node: n, boss: res.boss }); if (won) await afterCombat(n, res.encounter, res.boss); return mapActions(); }
  if (res.kind === 'event') return runEvent(res.event, n);
  if (res.kind === 'skillCheck') { narrate(`<h4>${n.name}</h4><p>${res.check.flavor}</p><p class="sys">${res.check.stat} check, difficulty ${res.check.dc}. Your best ${res.check.stat} plus a d20.</p>`); return setActions([{ text: `Attempt (${res.check.stat})`, cls: 'primary', run: async () => { const r = game.resolveSkillCheck(n); narrate(`<p class="${r.ok ? 'good' : 'bad'}">Rolled ${r.roll} + ${r.best} vs ${r.dc}: ${r.ok ? 'success' : 'failure'}. ${r.text || ''}</p>`); renderHud(); renderSide(); const m = randomAlive(); if (m) await sayLine(m, speak(m, r.ok ? 'brag' : 'complain')); mapActions(); } }, { text: 'Leave it', run: async () => mapActions() }]); }
  if (res.kind === 'shrine') { narrate(`<h4>${n.name}</h4><p class="good">${res.text}</p>`); renderSide(); const m = randomAlive(); if (m) await sayLine(m, speak(m, 'relief')); return mapActions(); }
  if (res.kind === 'treasure') { narrate(`<h4>${n.name}</h4><p class="good">+${res.gold} gold${res.item ? `, and <b class="${res.item.rarity}">${res.item.name}</b>` : ''}.</p>`); renderHud(); renderSide(); const m = randomAlive(); if (m) await sayLine(m, speak(m, 'happy')); return mapActions(); }
  if (res.kind === 'lore') { narrate(`<h4>${n.name}</h4><p class="lore">${res.text}</p>`); const m = game.party.find(h => h.speech?.traits?.includes('scholar')) || randomAlive(); if (m) await sayLine(m, speak(m, 'lore')); return mapActions(); }
  if (res.kind === 'dungeon') return dungeon(res.dungeon, res.done);
  if (res.kind === 'cleared') { narrate(`<p class="sys">${n.name}: cleared. Nothing stirs.</p>`); return mapActions(); }
  narrate(`<p class="sys">${res.text || n.name}</p>`); mapActions();
}
function mapActions() {
  const n = game.node(); const acts = []; const na = game.nightAttack(); const left = game.legsLeft();
  const rations = game.supplies.ration || 0, tent = game.supplies.tent > 0, torch = game.supplies.torch > 0;
  const restTip = `Camp for the night: everyone wakes up, mana refills and the day rolls over.`
    + ` Heals ${tent ? '15% of max health (tent)' : 'nothing on its own — buy a tent'}${rations ? '' : '. No rations left, so the party goes hungry and gains an exhaustion stack'}.`
    + ` Night attack chance ${Math.round(na.chance * 100)}%${torch ? ' (torch lit, −10%)' : ''}${na.town ? ' — safe inside a settlement' : ''}.`;
  acts.push({ text: `Rest (${left} moves left · night attack ${Math.round(na.chance * 100)}%)`, icon: tent ? 'tent' : 'torch', tip: restTip, cls: game.canMove() ? '' : 'primary', run: async () => restScene() });
  if (n.type === 'town') acts.push({ text: 'Town', icon: 'node-town', tip: 'Go into the settlement: merchant, smith, inn, quest board — and a safe night.', cls: 'primary', run: async () => town(game.townFor()) });
  acts.push({ text: 'Pick a node on the map', icon: 'tab_map', tip: left ? `Travel to a lit node on the map below. ${left} move${left === 1 ? '' : 's'} left today.` : 'No moves left today — rest first.', run: async () => toast('Click a lit node') });
  const nz = game.nextZoneId();
  if (nz && game.unlockedZones.includes(nz) && nz !== game.zoneId) acts.push({ text: `→ ${game.zones[nz].name}`, icon: 'boot', tip: `Leave for ${game.zones[nz].name} (${ACT_NAMES[game.zones[nz].act]}). You can always come back.`, cls: 'primary', run: async () => { game.enterZone(nz); stage.setBackdrop(game.zoneId); renderMap(); renderHud(); narrate(`<h4>${game.zones[nz].name}</h4><p class="sys">${ACT_NAMES[game.zones[nz].act]}</p>`); await enterNode(); } });
  setActions(acts);
}

// ---- events
async function runEvent(ev, n) {
  narrate(`<h4>${ev.npcName || n.name}</h4>`); const gen = makeNpc({ seed: hashSeed(ev.id), role: /merchant|trader|seller|peddler|fence|collector/.test(ev.id) ? 'merchant' : /child|orphan/.test(ev.id) ? 'child' : /elder|old|hermit|seer|mother/.test(ev.id) ? 'elder' : /cult|veil/.test(ev.id) ? 'cultist' : 'villager', race: /goblin/.test(ev.id) ? 'goblin' : 'human' }, deps); const npc = { ...gen, id: 'npc_' + ev.id, name: ev.npcName || gen.name, short: ev.npcName || gen.short, hp: 1 };
  if (ev.npcName) { await stage.setSide([npc], 'right', -0.5); talk.speaker(npc); }
  for (const line of ev.lines || []) { const who = line.speaker === 'npc' ? npc : game.party[0]; if (line.speaker === 'npc' && ev.npcName) await sayLine(npc, { text: line.text }, { cls: 'npc' }); else narrate(`<p class="say"><b>${line.speaker === 'hero' ? who.short : 'Narrator'}:</b> ${line.text}</p>`); }
  const choices = (ev.choices || []).filter(c => game.choiceAllowed(c));
  const res = await waitForChoice(choices.map(c => ({ text: c.text, run: async () => game.choose(ev, c) })));
  if (res.check) narrate(`<p class="${res.check.ok ? 'good' : 'bad'}">${res.check.stat} ${res.check.best} + d20 ${res.check.roll} vs ${res.check.dc}: ${res.check.ok ? 'pass' : 'fail'}.</p>`);
  if (res.text) { if (ev.npcName) await sayLine(npc, { text: res.text.replace(/^\(.*\)$/, '') }, { cls: 'npc' }); else narrate(`<p>${res.text}</p>`); }
  for (const r of res.rewards) narrate(`<p class="good">${r}</p>`); renderHud(); renderSide();
  if (res.startCombat) { const enc = game.encounter(res.startCombat); if (enc) { const won = await fight(enc, { node: n }); if (won) await afterCombat(n, enc, false); } }
  stage.clearSide('right'); mapActions();
}
// ---- combat
async function fight(enc, { node = null, boss = false } = {}) {
  const heroes = game.fighters(); const foes = enc.enemies; await stage.setSide(heroes.map(bodyOf), 'left'); await stage.setSide(foes.map(enemyLook), 'right');
  const looks = Object.fromEntries(foes.map(e => [e.id, enemyLook(e)])); const combat = new Combat(heroes, foes, { skills: SK, spells: SP, loot: game.loot, rng: makeRng(game.seed + game.kills * 13 + game.day), act: game.act, bossPhases: bossPhases.phases, exhaustionMult: game.exhaustionMult(), vehicle: game.vehicle, meter: game.meter, startBarrier: enc.night && game.vehicle === 'war_wagon' ? 25 : 0 }); game.meter.startFight(enc.name || 'fight', { zone: game.zoneId, day: game.day }); let tick = 0; const rec = ev => { tick += 0.5; recordEvent(game.meter, ev, tick); };
  for (const e of foes) e.voice = e.voice || voiceFor({ role: roleForEnemy(e.templateId), gender: 'n', seed: hashSeed(e.id) }); if (enc.named) { const L = enc.named; narrate(`<p class="bad"><b>${L.name}</b> — ${L.baseName}${L.mods?.length ? ' · ' + L.mods.map(m => namedData.modifiers[m] || m).join(', ') : ''}.${L.lore ? ` <span class="lore">${L.lore}</span>` : ''}</p>`); if (!looks[L.id].beast) { talk.speaker({ ...L, speech: { traits: ['cruel', 'pompous'], aggression: 0.95, confidence: 0.9 } }); await sayLine(L, enc.nemesis ? { text: `You again. ${L.nemesis?.defeats >= 2 ? 'I have beaten you twice. Kneel and it stops.' : 'I told you I would come back.'}` } : speak(L, 'threat', { to: heroes[0] }), { cls: 'enemy' }); } else narrate(`<p class="sys"><i>${L.name} ${enc.nemesis ? 'remembers you. It does not hurry.' : 'watches the party with more patience than its kind should have.'}</i></p>`); if (enc.nemesis) { const m = randomAlive(); const bank = game.banks[m?.id]; const mem = bank?.memories.find(x => x.type === 'nemesis'); if (m && mem) { try { await sayLine(m, lingo.speakAbout(mem, bank, game.now, { speaker: talk.speaker(m), scene: talk.scene(game.zoneId) })); } catch {} } } }
  const talker = foes.find(e => !looks[e.id].beast && !e.named); if (talker && Math.random() < 0.6) { talk.speaker({ ...talker, speech: { traits: ['gruff'], aggression: 0.9 } }); await sayLine(talker, speak(talker, 'combat_taunt', { to: heroes[0], bindings: { foe: talk.speaker(heroes[0]).entity } }), { cls: 'enemy' }); } else if (foes[0] && looks[foes[0].id].beast) narrate(`<p class="sys"><i>The ${foes[0].name} snarls.</i></p>`);
  const bloodied = new Set();
  while (!combat.over) {
    const events = combat.round(); narrate(`<p class="sys">— round ${combat.round_} —</p>`);
    for (const ev of events) { rec(ev);
      if (ev.type === 'attack') { const st = attackStyle(ev.source); if (st.kind === 'melee') await stage.attack(ev.source.id, ev.target.id); else await stage.cast(ev.source.id, ev.target.id, { element: st.element, kind: st.kind, crit: !!ev.crit, flash: st.kind === 'magic', flashMs: 90 }); }
      else if (ev.type === 'damage') { const dEl = elementName(ev.dtype); await flyIfPending(ev, dEl); stage.hit(ev.target.id); stage.impact(ev.target.id, dEl, ev.crit); floatAt(ev.target.id, ev.amount + (ev.crit ? '!' : ''), ev.crit ? 'crit' : ''); narrate(`<p class="${ev.source?.isEnemy ? 'bad' : ''}">${ev.source ? (ev.source.short || ev.source.name) : 'Something'} ${ev.label ? `(${ev.label}) ` : ''}hits ${ev.target.short || ev.target.name} for ${ev.amount}${ev.crit ? ' (crit)' : ''}${ev.tags?.length ? ' · ' + ev.tags.join(', ') : ''}.</p>`); if (!ev.target.isEnemy && ev.target.hp > 0 && ev.target.hp <= ev.target.maxHp / 2 && !bloodied.has(ev.target.id)) { bloodied.add(ev.target.id); if (ev.target.isHero) await sayLine(ev.target, speak(ev.target, 'combat_hurt')); } await sleep(160); }
      else if (ev.type === 'miss') { floatAt(ev.target.id, 'miss', 'miss'); narrate(`<p class="sys">${ev.source.short || ev.source.name} misses ${ev.target.short || ev.target.name}.</p>`); }
      else if (ev.type === 'skill') { noteCast(ev); narrate(`<p class="good">${ev.source.short || ev.source.name} uses <b>${ev.name}</b>.</p>`); if (!ev.source.isEnemy && Math.random() < 0.25) await sayLine(ev.source, speak(ev.source, 'combat_bark'), { wait: false }); await sleep(200); }
      else if (ev.type === 'heal') { if (ev.amount > 0) { stage.heal(ev.target.id); floatAt(ev.target.id, '+' + ev.amount, 'heal'); narrate(`<p class="good">${ev.target.short || ev.target.name} recovers ${ev.amount}${ev.label ? ' (' + ev.label + ')' : ''}.</p>`); } }
      else if (ev.type === 'dot') { stage.pulseStatus(ev.target.id, ev.status); if (stage.chars.get(ev.target.id)) stage.fx.impact({ at: stage.pointOf(ev.target.id), element: elementName(ev.dtype || ev.status), scale: 0.55, height: stage.heightOf(ev.target.id) }); floatAt(ev.target.id, ev.amount, ''); narrate(`<p class="sys">${ev.target.short || ev.target.name} takes ${ev.amount} from ${ev.status}.</p>`); }
      else if (ev.type === 'skip') narrate(`<p class="sys">${ev.target.short || ev.target.name} is ${ev.why}.</p>`);
      else if (ev.type === 'down') { stage.down(ev.target.id); stage.clearStatuses(ev.target.id); pendingCast.delete(ev.target.id); narrate(`<p class="bad"><b>${ev.target.short || ev.target.name} goes down.</b></p>`); const w = game.party.find(h => h.alive && h !== ev.target); if (w && ev.target.isHero) await sayLine(w, speak(w, 'ally_down', { bindings: { fallen: talk.speaker(ev.target).entity } })); }
      else if (ev.type === 'kill') { stage.down(ev.target.id); stage.clearStatuses(ev.target.id); pendingCast.delete(ev.target.id); narrate(`<p class="good">${ev.target.name} is dead.</p>`); if (ev.source?.isHero && Math.random() < 0.5) await sayLine(ev.source, speak(ev.source, 'combat_kill', { bindings: { foe: new Entity(lingo.lexicon.get(ev.target.templateId) || { id: ev.target.templateId, type: 'creature', forms: { sg: ev.target.name.toLowerCase() } }, { lexicon: lingo.lexicon }) } })); }
      else if (ev.type === 'revive') { stage.revive(ev.target.id); stage.reviveFx(ev.target.id); narrate(`<p class="good">${ev.target.short} is back on their feet.</p>`); }
      else if (ev.type === 'taunt') narrate(`<p class="sys">${ev.source.short} taunts ${ev.target.name}.</p>`);
      if (ev.type === 'status' && ev.target?.alive) stage.status(ev.target.id, ev.status, true);
      if (ev.target) syncStatuses(ev.target); if (ev.source && ev.source !== ev.target) syncStatuses(ev.source);
      renderPartyTab();
    }
  }
  pendingCast.clear(); for (const c of [...stage.chars.keys()]) stage.clearStatuses(c);
  for (const h of heroes) { h.statuses = []; h.buffs = []; h.dmgBuff = 0; h.dmgReduct = 0; } game.meter.endFight(); enc.killsBy = combat.killsBy; renderMeterTab(); const hqDone = game.trackFight(combat, enc, combat.result === 'win'); for (const q of hqDone || []) await heroQuestDone(q);
  if (combat.result === 'win') { const m = randomAlive(); if (m) await sayLine(m, speak(m, Math.random() < 0.5 ? 'brag' : 'relief')); return true; }
  if (combat.result === 'lose') { const d = game.defeat(enc); if (enc.named) narrate(`<p class="bad"><b>${enc.named.name}</b> leaves you in the dirt and walks away. You will meet again.</p>`); narrate(`<p class="bad"><b>The party falls.</b> ${d.text} You lose ${d.lost}.</p>`); for (const h of game.party) stage.revive(h.id); renderHud(); renderSide(); renderMap(); await stage.setSide(game.fighters().map(bodyOf), 'left'); stage.clearSide('right'); return false; }
  narrate('<p class="sys">The fight drags on until both sides give up.</p>'); return false;
}
async function afterCombat(node, enc, boss) {
  const v = game.victory(node, enc); narrate(`<p class="good"><b>Victory.</b> +${v.xp} xp each, +${v.gold} gold, +${v.fame} fame.</p>`); narrateGear(game.winGear);
  for (const it of [...v.drops, ...v.bossDrops]) narrate(`<p class="good">Loot: <span class="${it.rarity}">${it.name}</span>${it.isUnique ? ' (unique)' : it.setId ? ' (set piece)' : ''}</p>`);
  for (const { hero, ups } of v.levelUps) { narrate(`<p class="good">${hero.short} reaches level ${hero.level}. Points to spend in the Skills tab.</p>`); }
  if (v.namedSlain) narrate(`<p class="good"><b>${v.namedSlain.name} is dead.</b> The name goes on the board.</p>`); for (const q of v.sideDone || []) narrate(`<p class="good"><b>Bounty complete: ${q.title}</b> — +${q.gold} gold.</p>`);
  if (boss) { const enemyId = enc.enemies.find(e => e.boss)?.templateId; const dd = bossPhases.deathDialog?.[enemyId]; if (dd) { narrate(`<p class="say enemy"><b>${enc.enemies.find(e => e.boss)?.name}:</b> ${dd.bossLine}</p>`); await sayLine(game.party[0], { text: dd.heroLine.replace(/^"|"$/g, '') }); narrate(`<p class="lore">${dd.narratorLine}</p>`); } if (v.questDone) narrate(`<p class="good"><b>Quest complete: ${v.questDone.title}.</b></p>`); if (v.unlockedZone) narrate(`<p class="good">The way to <b>${game.zones[v.unlockedZone].name}</b> is open.</p>`); }
  for (const h of game.party) stage.revive(h.id); await sleep(300); stage.clearSide('right'); await stage.setSide(game.fighters().map(bodyOf), 'left'); renderHud(); renderSide(); renderMap();
}
// ---- dungeon
async function dungeon(dg, done) {
  narrate(`<h4>${dg.name}</h4>`); if (done) { narrate('<p class="sys">Sealed. You already cleared it.</p>'); return mapActions(); } if (game.avgLevel() < dg.minLevel) narrate(`<p class="sys">Recommended level ${dg.minLevel}.</p>`);
  const go = await waitForChoice([{ text: `Enter (${dg.stages.length} stages)`, cls: 'primary', run: async () => true }, { text: 'Not now', run: async () => false }]); if (!go) return mapActions();
  let stunFirst = false;
  for (const st of dg.stages) { narrate(`<h4>${st.name}</h4>`); if (st.type === 'skill_check') { const c = dungeons.DUNGEON_SKILL_CHECKS[st.checkId]; narrate(`<p>${c.flavor}</p>`); const best = Math.max(...game.alive().map(h => derive(h, game.loot)[c.stat] || 8)); const roll = 1 + Math.floor(Math.random() * 20); const ok = best + roll >= c.dc; narrate(`<p class="${ok ? 'good' : 'bad'}">${c.stat} ${best} + ${roll} vs ${c.dc}: ${ok ? c.passText : c.failText}</p>`); if (ok) stunFirst = true; else for (const h of game.alive()) h.hp = Math.max(1, Math.round(h.hp - h.maxHp * (c.failDamagePct || 0.12))); renderSide(); continue; }
    const enc = game.encounter(st.encounter, st.type === 'boss'); if (!enc) continue; if (stunFirst) { for (const e of enc.enemies) e.statuses.push({ type: 'stun', duration: 1, power: 0 }); stunFirst = false; } const won = await fight(enc, { node: null, boss: st.type === 'boss' }); if (!won) return mapActions(); game.victory(null, enc); renderSide(); }
  game.completedDungeons.push(dg.id); game.gold += dg.reward.gold; const it = game.loot.generate(dg.reward.item, 'rare', 'high', { rng: game.rng }); if (it) game.inventory.push(it); for (const h of game.party) { const { gainXp } = await import('./rules.js'); gainXp(h, Math.round(dg.reward.xp / game.party.length)); refresh(h, game.loot); }
  narrate(`<p class="good"><b>${dg.name} cleared.</b> +${dg.reward.gold} gold, +${dg.reward.xp} xp, ${it ? `<span class="${it.rarity}">${it.name}</span>` : ''}.</p>`); renderHud(); renderSide(); mapActions();
}
// ---- town
async function town(t) { game.threadEvent('town');
  narrate(`<h4>${t.name}</h4><p class="sys">${t.services.map(s => s.replace('blackmarket', 'black market')).join(' · ')}${game.fame >= 500 ? ' · guild hall' : ''}</p>`); stage.clearSide('right');
  const acts = [{ text: 'Merchant', icon: 'gold', tip: 'Buy gear, food, potions and vehicles — and sell what you are done with.', run: async () => shop(t) }, { text: 'Tavern (hire)', icon: 'tab_party', tip: 'Drink, listen, and hire extra heroes for the party or the bench.', run: async () => tavern(t) }, { text: 'Cleric (heal, free)', icon: 'hp', tip: 'A free full heal and a fresh day — settlements are safe ground.', run: async () => { game.clericRest(t); renderSide(); renderHud(); narrate('<p class="good">The cleric sees to everyone. Healed, fed, a new day.</p>'); town(t); } }];
  if (t.services.includes('blacksmith')) acts.push({ text: 'Blacksmith', icon: 'slot_weapon', tip: 'Upgrade the quality of a piece of gear for gold.', run: async () => smith(t, 'blacksmith') }); if (t.services.includes('enchanter')) acts.push({ text: 'Enchanter', icon: 'tab_skills', tip: 'Reroll the magic properties on a piece of gear.', run: async () => smith(t, 'enchanter') }); if (t.services.includes('trainer')) acts.push({ text: 'Trainer (respec 50g/level)', icon: 'xp', tip: 'Take back every talent and passive point the selected hero has spent.', run: async () => { const h = game.party[selectedHero]; const cost = h.level * 50; if (game.gold < cost) return toast('Not enough gold'); game.gold -= cost; h.pendingTalent += Object.keys(h.talents).length; h.talents = {}; h.pendingPassive += Object.values(h.passiveRanks).reduce((a, b) => a + b, 0); h.passiveRanks = {}; refresh(h, game.loot); renderHud(); renderSide(); toast(`${h.short} respecced`); town(t); } });
  acts.push({ text: 'Back to the map', icon: 'tab_map', tip: 'Leave the settlement and go back to travelling.', run: async () => mapActions() }); setActions(acts);
}
function itemRow(it, actions = []) {
  const hero = game.party[selectedHero] || game.party[0];
  const s = game.loot.score(it, hero);
  const cur = hero?.equipment?.[it.slot === 'ring' ? 'ring1' : it.slot] || null;
  const name = el('span', { class: 'n', onclick: () => itemDialog(it), html: `${gemHtml(it)}<span class="${it.rarity}">${esc(it.name)}</span> <small>${esc(SLOT_NAME[it.slot] || it.slot)}${it.dmg ? ` · ${it.dmg[0]}–${it.dmg[1]}` : ''}${it.armor ? ` · armor ${it.armor}` : ''} · score ${s.total}</small>` });
  name.dataset.tipHtml = itemTipHtml({ it, score: s, cur, curScore: cur ? game.loot.score(cur, hero) : null, heroShort: hero?.short || '', describe: a => game.loot.describe(a) }) + '<div class="tip-sub">Click for the full card, compare and equip.</div>';
  return el('div', { class: 'item' }, name, ...actions);
}
async function shop(t) {
  const stock = game.merchantStock(t); const box = narrate(`<h4>Merchant of ${t.name}</h4>`); const wrap = el('div', { class: 'shop' });
  const refreshUI = () => { wrap.replaceChildren(el('div', { class: 'tiny', text: `You have ${game.gold} gold. Prices scale with quality and rarity.` }), el('b', { text: 'For sale' }), ...stock.map(it => itemRow(it, [el('button', { class: 'small', text: `Buy ${it.price}g`, onclick: () => { if (!game.buy(it, it.price, stock)) return toast('Not enough gold'); renderHud(); renderSide(); refreshUI(); } })])), el('b', { text: 'Supplies' }), ...Object.entries(SUPPLY_KINDS).map(([k, d]) => el('div', { class: 'item' }, el('span', { class: 'n', html: `${iconHtml({ ration: 'ration', bandages: 'hp', torch: 'torch', tent: 'tent' }[k] || 'ration')}${d.name} <small>${d.desc}</small> · have ${game.supplies[k] || 0}` }), el('button', { class: 'small', text: `Buy ${d.price}g`, onclick: () => { if (!game.buySupply(k, 1)) return toast('Not enough gold'); renderHud(); renderSide(); refreshUI(); } }), k === 'ration' ? el('button', { class: 'small', text: `×5 ${d.price * 5}g`, onclick: () => { if (!game.buySupply(k, 5)) return toast('Not enough gold'); renderHud(); renderSide(); refreshUI(); } }) : null)), el('b', { text: 'Stable (vehicle)' }), ...Object.entries(VEHICLES).filter(([id, v]) => id !== 'none' && (!v.act || game.act >= v.act)).map(([id, v]) => el('div', { class: 'item' }, el('span', { class: 'n', html: `${iconHtml('wagon')}<b>${v.name}</b> <small>${v.desc}</small>${game.vehicle === id ? ' <b>(yours)</b>' : ''}` }), game.vehicle === id ? null : el('button', { class: 'small', text: `Buy ${v.price}g`, onclick: () => { if (!game.buyVehicle(id)) return toast('Not enough gold'); renderHud(); renderSide(); refreshUI(); toast(`You now travel by ${v.name.toLowerCase()}`); } }))), el('b', { text: 'Potions' }), ...Object.entries(items.potions).map(([id, p]) => el('div', { class: 'item' }, el('span', { class: 'n', html: `${iconHtml('hp')}<b>${p.name}</b> <small>${p.desc}</small>` }), el('button', { class: 'small', text: `Buy ${p.cost}g`, onclick: () => { if (game.gold < p.cost) return toast('Not enough gold'); game.gold -= p.cost; game.inventory.push({ id: 'p_' + Math.random().toString(36).slice(2, 7), potionId: id, name: p.name, type: 'consumable', slot: 'potion', rarity: 'normal', quality: 'medium', effect: p.effect, target: p.target, affixes: [], icon: p.icon }); renderHud(); renderSide(); refreshUI(); } }))), el('b', { text: 'Sell' }), ...game.inventory.filter(i => i.type !== 'consumable').map(it => itemRow(it, [el('button', { class: 'small', text: `Sell ${game.loot.sellPrice(it)}g`, onclick: () => { game.sell(it); renderHud(); renderSide(); refreshUI(); } })]))); };
  refreshUI(); box.append(wrap); town(t);
}
async function tavern(t) {
  const box = narrate(`<h4>Tavern</h4><p class="tiny">Party ${game.party.length}/4 (extra hires wait on the bench), companions ${game.companions.length}/4.</p>`); const wrap = el('div', { class: 'shop' });
  const hires = game.hires(t); const rows = hires.map(h => { const cd = game.classDef(h.class); const name = h.name || `${LOOKS[h.class]?.name || cd.name}`; return el('div', { class: 'item' }, el('span', { class: 'n', html: `<b>${name}</b> <small>${cd.name} L${h.level}${h.description ? ' · ' + h.description : ''}</small>` }), el('button', { class: 'small', text: `Hire ${h.cost}g`, onclick: () => { if (game.gold < h.cost) return toast('Not enough gold'); game.gold -= h.cost; const HL = hireLook(h.id); const hero = game.makeHero(h.class, name, h.level, { ...(HL || LOOKS[h.class]), name }); hero.voice = HL?.voice || voiceFor({ role: h.class, gender: hero.gender || 'n', seed: hashSeed(name + h.id) }); if (h.attrs) { hero.attrs = { ...h.attrs }; refresh(hero, game.loot); hero.hp = hero.maxHp; hero.mp = hero.maxMp; } game.addHero(hero); talk.speaker(hero); hires.splice(hires.indexOf(h), 1); renderHud(); renderSide(); toast(`${name} joins ${game.party.includes(hero) ? 'the party' : 'the bench'}`); tavern(t); } })); });
  const comps = game.kennel().map(c => el('div', { class: 'item' }, el('span', { class: 'n', html: `<b>${c.name}</b> <small>power ${c.power} · ${c.description}</small>` }), el('button', { class: 'small', text: `Buy ${c.price}g`, onclick: () => { if (game.gold < c.price) return toast('Not enough gold'); if (game.companions.length >= 4) return toast('Four companions max'); game.gold -= c.price; game.addCompanion(game.makeCompanion(c)); renderHud(); renderSide(); toast(`${c.name} joins you`); tavern(t); } })));
  const benchRows = game.bench.map(h => el('div', { class: 'item' }, el('span', { class: 'n', text: `${h.name} (${h.className} L${h.level}) — on the bench` }), el('button', { class: 'small', text: 'Swap in', onclick: () => { if (game.party.length >= 4) { const out = game.party.pop(); game.bench.push(out); } game.party.push(h); game.bench = game.bench.filter(x => x !== h); renderSide(); tavern(t); } })));
  wrap.replaceChildren(el('b', { text: 'Heroes for hire' }), ...rows, el('b', { text: 'Companions' }), ...comps, ...(benchRows.length ? [el('b', { text: 'Bench' }), ...benchRows] : [])); box.append(wrap); town(t);
}
async function smith(t, kind) {
  const box = narrate(`<h4>${kind === 'blacksmith' ? 'Blacksmith' : 'Enchanter'}</h4><p class="tiny">Materials: ${Object.entries(game.materials).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(' · ')}. Salvage unwanted items for materials, then add affixes (2 materials) or promote rarity (3 materials).</p>`); const wrap = el('div', { class: 'shop' });
  const refreshUI = () => { wrap.replaceChildren(...game.inventory.filter(i => i.type !== 'consumable').map(it => itemRow(it, [el('button', { class: 'small', text: 'Salvage', onclick: () => { const y = game.salvage(it); toast('Got ' + Object.entries(y).map(([k, v]) => v + ' ' + k.replace('_', ' ')).join(', ')); renderSide(); refreshUI(); } }), el('select', { onchange: e => { const mat = e.target.value; if (!mat) return; const r = game.loot.addAffix(it, mat, game.materials, game.rng); toast(r.ok ? `Added ${r.affix.name}` : r.why); e.target.value = ''; renderSide(); refreshUI(); } }, el('option', { value: '', text: 'add affix…' }), ...items.affixTiers.map(tier => el('option', { value: tier.mat, text: `${tier.label} (${tier.cost} ${tier.mat.replace('_', ' ')}, ×${tier.mult})` }))), el('button', { class: 'small', text: 'Promote', onclick: () => { const r = game.loot.promote(it, game.materials); toast(r.ok ? `${it.name} is now ${it.rarity}` : r.why); renderSide(); refreshUI(); } })])), ...game.party.flatMap(h => Object.values(h.equipment).map(it => itemRow(it, [el('span', { class: 'tiny', text: `equipped by ${h.short}` })])))); };
  refreshUI(); box.append(wrap); town(t);
}
// ---- side panels
function renderSide() { renderPartyTab(); renderBag(); renderSkills(); renderQuests(); renderMeterTab(); renderJournal(); }
async function heroQuestDone(q) { const hero = game.party.find(h => h.id === q.heroId); narrate(`<p class="good"><b>${q.heroName} finished the errand: ${q.title}.</b> ${q.rewardItem ? `Reward: <span class="${q.rewardItem.rarity}">${q.rewardItem.name}</span>.` : ''}</p>`); if (hero) { await sayLine(hero, speak(hero, 'brag')); for (const { who, intent } of game.reactionsTo(hero)) { if (Math.random() < 0.7) await sayLine(who, speak(who, intent, { to: hero })); } } renderMap(); renderSide(); }
function applyTopicReward(r, answerer, asker, lines, { after = false } = {}) { const who = r.who === 'asker' ? asker : answerer; const parts = []; if (r.xp) { for (const h of game.party) if (h.alive && (!r.who || h === who)) { const ups = gainXpSafe(h, r.xp); if (ups) parts.push(`${h.short} levels up`); } parts.push(`+${r.xp} xp${r.who ? ' for ' + who?.short : ''}`); } if (r.gold) { game.gold += r.gold; parts.push(`+${r.gold} gold`); } if (r.talent && who) { who.pendingTalent += r.talent; parts.push(`${who.short} gains a talent point`); } if (r.relation) { for (const a of game.party) for (const b of game.party) if (a !== b) game.relations.get(a.id, b.id).set('warmth', Math.min(1, game.relations.get(a.id, b.id).get('warmth') + r.relation)); parts.push('the party grows closer'); } if (r.relationIf) { const ok = (() => { try { return !!new Function('gear', 'return (' + r.relationIf.cond + ')')(lines?.gear || {}); } catch { return false; } })(); const v = ok ? r.relationIf.value : r.relationIf.else; if (asker && answerer) { const rel = game.relations.get(asker.id, answerer.id); rel.set('trust', Math.max(-1, Math.min(1, rel.get('trust') + v))); parts.push(v > 0 ? `${asker.short} trusts ${answerer.short} more` : `${asker.short} trusts ${answerer.short} less`); } } if (r.item) { const it = game.loot.generate(r.item.base || 'ring', r.item.rarity || 'magic', 'medium', { rng: game.rng }); if (it) { game.inventory.push(it); game.logLoot(it, { holder: who?.id }); parts.push(`found ${it.name}`); } } if (r.supply) for (const [k, n] of Object.entries(r.supply)) { game.supplies[k] = (game.supplies[k] || 0) + n; parts.push(`+${n} ${k}`); } if (r.companion) { const def = (companions.classPets || []).find(c => c.id === r.companion) || { id: r.companion, name: 'Wolf pup', power: 1, attrs: { STR: 6, DEX: 10, INT: 2, CON: 6 } }; if (game.addCompanion(game.makeCompanion({ ...def, name: def.name || 'Wolf pup', power: 1 }))) parts.push(`${def.name || 'a wolf pup'} joins the party`); } if (r.buff) { game.flags.empowered = 1; parts.push('the next fight starts blessed'); } narrate(`<p class="good">${(r.text || '').replace('{answerer}', who?.short || '')}${parts.length ? ' — ' + parts.join(', ') : ''}</p>`); renderHud(); renderSide(); }
function gainXpSafe(h, xp) { const before = h.level; h.xp += xp; let ups = 0; while (h.xp >= xpForLevel(h.level + 1) && h.level < 30) { h.level++; h.pendingAttr += 2; if (TALENT_LEVELS.includes(h.level)) h.pendingTalent++; if (h.level % 5 === 0) h.pendingPassive++; ups++; } if (ups) refresh(h, game.loot); return ups; }
const meterState = {};
function renderMeterTab() {
  if (!$('tab-meter')) return;
  if (!game.meter.fights.length) return $('tab-meter').replaceChildren(sectionHead('Damage meter', 'tab_meter'), el('p', { class: 'empty', text: 'Nothing has bled yet. After a fight: a bar per hero, click one for its sources, click again for every single hit.' }));
  const box = el('div'); renderMeter(game.meter, box, meterState);
  $('tab-meter').replaceChildren(sectionHead('Damage meter', 'tab_meter'), box);
}
async function restScene() {
  const na = game.nightAttack(); const v = VEHICLES[game.vehicle];
  narrate(`<h4>Camp, day ${game.day}</h4><p class="sys">Rations: ${game.supplies.ration} (${v.name.toLowerCase()}: one every ${v.rationEvery} day${v.rationEvery > 1 ? 's' : ''}). Night attack chance here: <b>${Math.round(na.chance * 100)}%</b> (base ${Math.round(na.base * 100)}%${na.vehicle ? `, vehicle ${na.vehicle > 0 ? '+' : ''}${Math.round(na.vehicle * 100)}%` : ''}${na.torch ? ', torch −10%' : ''}). Resting does not heal; eat an extra ration for 30% HP${game.supplies.tent ? ', the tent gives 15%' : ''}.</p>`);
  const choice = await waitForChoice([{ text: 'Rest', cls: 'primary', run: async () => ({ eatExtra: false }) }, ...(game.supplies.ration >= 2 ? [{ text: 'Rest + eat an extra ration (+30% HP)', run: async () => ({ eatExtra: true }) }] : []), { text: 'Not yet', run: async () => null }]); if (!choice) return mapActions();
  stage.setBackdrop(game.zoneId, true); stage.setNight(true); await stage.camp(game.party.filter(h => h.alive).map(bodyOf)); narrate('<p class="sys">The fire takes. Somebody finds the bad cheese.</p>');
  const speakers = game.party.filter(h => h.alive).map(h => talk.speaker(h)); const nextBossNode = game.zone().nodes.find(n => n.type === 'boss'); const facts = factsFrom({ now: game.now, day: game.day, banks: game.banks, heroes: game.party, meter: game.meter, lootLog: game.lootLog, relations: game.relations, party: { rations: game.supplies.ration, exhaustion: game.exhaustion, act: game.act, gold: game.gold, torches: game.supplies.torch, bandages: game.supplies.bandages, vehicle: game.vehicle === 'none' ? null : game.vehicle, vehicleName: v.name.toLowerCase(), nextBoss: nextBossNode && !game.isCleared(nextBossNode.id) ? nextBossNode.name : null, companion: game.companions[0]?.name?.toLowerCase() || null, companionKills: game.companions[0] ? (game.meter.fights.flatMap(f => f.records).filter(r => r.source === game.companions[0].id && r.killingBlow).length) : 0, companionHurt: !!game.companions[0] && game.companions[0].hp < game.companions[0].maxHp * 0.5, namedSeen: game.namedSeen.length, lastNamed: game.namedSeen[game.namedSeen.length - 1] || null, activeQuest: (() => { const q = game.quests.active.map(id => sideQuestData.quests.find(x => x.id === id) || MAIN_QUESTS.find(x => x.id === id)).filter(Boolean)[0]; return q?.title || null; })(), questGold: (() => { const q = game.quests.active.map(id => sideQuestData.quests.find(x => x.id === id)).filter(Boolean)[0]; return q?.gold || 0; })(), lastQuestDone: (() => { const id = game.quests.done[game.quests.done.length - 1]; const q = sideQuestData.quests.find(x => x.id === id) || MAIN_QUESTS.find(x => x.id === id); return q?.title || null; })(), shrineToday: (game.usedNodes || []).some(k => k.startsWith(game.zoneId + ':') && game.zone().nodes.find(n => `${game.zoneId}:${n.id}` === k)?.type === 'shrine' && game.legsUsed > 0) } });
  const facts2 = facts; facts2.party.nodesTravelled = game.nodesTravelled; facts2.party.companions = game.companions.length;
  const th = threads.play(speakers, facts2, game.threads, { scene: talk.scene(game.zoneId) }); if (th) { narrate(`<p class="sys"><i>${th.thread.id.replace('th_', '').replace(/_/g, ' ')}${th.done ? ' — settled' : ''}</i></p>`); for (const l of th.lines) { const who = game.party.find(h => h.id === l.speaker.id); if (who) await sayLine(who, l); } if (th.reward) applyTopicReward(th.reward, th.answerer, th.asker, th.lines); if (th.objective) narrate(`<p class="sys">(this continues after: ${th.objective.type === 'town' ? 'the next town' : th.objective.type === 'named' ? 'a named enemy falls' : th.objective.type + ' ×' + th.objective.n})</p>`); }
  if (Math.random() < 0.35) { const asker = game.party.filter(h => h.alive && !game.activeHeroQuest(h)); if (asker.length) { const h = asker[Math.floor(Math.random() * asker.length)]; const q = game.startHeroQuest(h); if (q) { await sayLine(h, { text: q.ask }); narrate(`<p class="good"><b>${h.short}'s errand: ${q.title}.</b> ${q.task} A violet star marks it on the map. Reward: ${Object.entries(q.reward).map(([k, v]) => k === 'item' ? 'a ' + v.rarity + ' ' + v.category : k === 'talent' ? 'a talent point' : v + ' ' + k).join(', ')}.</p>`); const o = game.party.find(x => x !== h && x.alive); if (o) await sayLine(o, speak(o, game.relations.get(o.id, h.id).opinion() >= 0 ? 'agree' : 'complain', { to: h })); renderMap(); renderQuests(); } } }
  for (let i = 0; i < 2; i++) { const lines = conversations.talk(speakers, facts, { tags: ['camp', 'rare'], scene: talk.scene(game.zoneId) }); for (const l of lines) { const who = game.party.find(h => h.id === l.speaker.id); if (who) await sayLine(who, l); } const topicDef = topicsData.topics.find(t => t.id === lines[0]?.topic); if (topicDef?.reward) { const ans = game.party.find(h => h.id === lines.find(l => l.role === 'answerer')?.speaker.id) || game.party[0]; applyTopicReward(topicDef.reward, ans, game.party.find(h => h.id === lines[0].speaker.id), lines); } const key = lines.find(l => l.role === 'answerer'); if (key && lines[0]) game.rememberConversation(key.speaker.id, key.listener?.id || lines[0].speaker.id, key.topic, key.text); }
  let attacked = false; if (Math.random() < na.chance) { attacked = true; const enc = game.nightEncounter(); if (enc) { narrate(`<p class="bad"><b>Something comes out of the dark.</b> ${enc.name}.</p>`); const m = randomAlive(); if (m) await sayLine(m, speak(m, 'warning', { bindings: { foe: new Entity(lingo.lexicon.get(enc.enemies[0].templateId) || { id: 'x', type: 'creature', forms: { sg: enc.enemies[0].name } }, { lexicon: lingo.lexicon, count: enc.enemies.length }) } })); stage.clearCamp(); const won = await fight(enc, { node: null }); if (won) { const vic = game.victory(null, enc); narrate(`<p class="good">The raiders are dead. +${vic.xp} xp, +${vic.gold} gold.</p>`); } else { stage.setNight(false); return mapActions(); } } }
  const r = game.rest(choice); narrateGear(r.gear); for (const q of r.questsDone || []) await heroQuestDone(q); stage.clearCamp(); stage.setNight(false); stage.setBackdrop(game.zoneId); await stage.setSide(game.fighters().map(bodyOf), 'left');
  narrate(`<h4>Day ${game.day}</h4><p class="${r.ate ? 'sys' : 'bad'}">${r.ate ? (r.extra ? 'Everyone ate well.' : 'A cold ration each.') : 'No food. Everyone is hungrier and slower.'}${r.exhaustion ? ` Exhaustion ×${r.exhaustion}.` : ''}${r.healed ? ` Healed ${r.healed} in total.` : ''}${attacked ? '' : ' The night passed quietly.'}</p>`); renderHud(); renderSide(); renderMap(); game.save(); mapActions();
}
/** A tab section heading: icon + name + the gold divider rule. */
function sectionHead(text, iconName) { return el('div', { class: 'bag-head' }, el('i', { class: 'ic ic-' + iconName }), el('span', { text })); }
function bar(v, max, cls = '', tip = '') { const pct = Math.max(0, Math.round(100 * v / Math.max(1, max))); const b = el('div', { class: 'bar ' + cls }, el('i', { style: `width:${pct}%`, class: pct <= 50 && !cls ? 'low' : '' })); if (tip) b.dataset.tip = tip; return b; }
/** A stat chip: optional icon, a number, and a line explaining what the number does. */
function statChip(label, value, tip, iconName = null) { return el('span', { class: 'stat-chip', 'data-tip': tip }, iconName ? el('i', { class: 'ic ic-' + iconName }) : null, document.createTextNode(label ? `${label} ${value}` : String(value))); }
/** One equipment slot: slot icon, rarity gem, item name — hovering shows the full item card. */
function slotRow(h, s) {
  const it = h.equipment[s];
  const row = el('span', { class: 'slot' + (it ? '' : ' empty') }, el('i', { class: 'ic ic-' + slotIcon(s) }));
  if (it) {
    row.append(el('i', { class: 'gem gem-' + gemFor(it) }), el('span', { class: 'nm ' + it.rarity, text: it.name }));
    row.dataset.tipHtml = itemTipHtml({ it, score: game.loot.score(it, h), describe: a => game.loot.describe(a) });
  } else {
    row.append(el('span', { class: 'nm', text: '—' }));
    row.dataset.tip = `${SLOT_NAME[s] || s}: nothing equipped.`;
  }
  return row;
}
function renderPartyTab() {
  const GEAR = ['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'ring1', 'ring2', 'necklace'];
  const rows = [...game.party, ...game.companions].map(h => {
    const d = h.isCompanion ? null : derive(h, game.loot);
    const points = h.pendingAttr || h.pendingTalent || h.pendingPassive;
    const stats = d ? el('div', { class: 'statline' },
      statChip('', `${d.dmgMin}–${d.dmgMax}`, STAT_TIPS.dmg, 'slot_weapon'),
      statChip('', d.armor, STAT_TIPS.armor, 'slot_chest'),
      statChip('hit', d.hit, STAT_TIPS.hit), statChip('dodge', d.dodge, STAT_TIPS.dodge), statChip('crit', Math.round(d.critChance) + '%', STAT_TIPS.crit),
      ...['STR', 'DEX', 'INT', 'CON'].map(k => statChip('', h.attrs[k], STAT_TIPS[k], 'stat_' + k.toLowerCase()))) : null;
    return el('div', { class: 'member' + (game.party[selectedHero] === h ? ' sel' : ''), 'data-tip': h.isCompanion ? `${h.name} follows the party and fights on its own.` : 'Click to point the Skills tab at this hero', onclick: () => { const i = game.party.indexOf(h); if (i >= 0) { selectedHero = i; renderSkills(); renderPartyTab(); } } },
      el('div', { class: 'portrait', html: h.avatar ? renderSVG(h.avatar) : '' }),
      el('div', {},
        el('div', { class: 'who' }, el('b', { text: h.name }), el('span', { class: 'tiny', text: ` ${h.className} L${h.level}${points ? ' · points to spend!' : ''}` })),
        bar(h.hp, h.maxHp, '', `Health ${h.hp} / ${h.maxHp}. ${STAT_TIPS.hp}`),
        h.isCompanion ? null : bar(h.mp, h.maxMp, 'mp', `Mana ${h.mp} / ${h.maxMp}. ${STAT_TIPS.mp}`),
        h.isCompanion ? null : bar(h.xp, xpForLevel(h.level + 1), 'xp', `Experience ${h.xp} / ${xpForLevel(h.level + 1)} towards level ${h.level + 1}. ${STAT_TIPS.xp}`),
        stats,
        h.isCompanion ? null : el('div', { class: 'slots' }, ...GEAR.map(s => slotRow(h, s))),
        h.isCompanion ? null : el('div', { class: 'row' },
          el('button', { class: 'small', text: 'Feelings', 'data-tip': `What ${h.short} thinks of the others, and the memories weighing on them`, onclick: e => { e.stopPropagation(); const lines = game.party.filter(o => o !== h).map(o => `${h.short} → ${o.short}: ${game.relations.get(h.id, o.id).summary()}`); const mem = (game.banks[h.id]?.list(game.now) || []).slice(0, 5).map(x => `· ${x.memory.type} ${JSON.stringify(x.memory.details)} (${Math.round(x.salience * 100)}%)`); narrate(`<h4>${h.name}</h4>` + lines.map(l => `<p class="sys">${l}</p>`).join('') + (mem.length ? `<p class="sys">Strongest memories:<br>${mem.join('<br>')}</p>` : '<p class="sys">No memories yet.</p>')); } }),
          el('button', { class: 'small', text: 'Save to library', 'data-tip': 'Keep this hero (look, voice, speech) in the shared character library', onclick: e => { e.stopPropagation(); library.putCharacter({ ...(h.blueprint || {}), name: h.name, short: h.short, race: 'human', avatar: h.avatar, voice: h.voice, speech: h.speech, title: h.className, class: h.class, kind: 'character' }, { source: 'emberveil', tags: ['emberveil', h.class] }); toast(`${h.short} saved to the library`); } }))));
  });
  $('tab-party').replaceChildren(...rows);
}
function renderBag() {
  const SUPPLY_ICON = { ration: 'ration', bandages: 'hp', torch: 'torch', tent: 'tent' };
  const rows = game.inventory.map(it => it.type === 'consumable'
    ? el('div', { class: 'item' }, el('span', { class: 'n', 'data-tip': `${it.name}${it.desc ? ' — ' + it.desc : ''}. Pick a hero to drink it.`, html: `${gemHtml(it)}<span class="${it.rarity || 'normal'}">${esc(it.name)}</span>` }), el('select', { 'data-tip': 'Use this on one of the party', onchange: e => { const h = game.party.find(x => x.id === e.target.value); if (!h) return; usePotion(it, h); } }, el('option', { value: '', text: 'use on…' }), ...game.party.map(h => el('option', { value: h.id, text: h.short }))))
    : itemRow(it));
  const sup = Object.entries(SUPPLY_KINDS).map(([k, d]) => el('div', { class: 'item', 'data-tip': `${d.name} — ${d.desc}` }, el('span', { class: 'n', html: `${iconHtml(SUPPLY_ICON[k] || 'ration')}<b>${esc(d.name)}</b> × ${game.supplies[k] || 0} <small>${esc(d.desc)}</small>` }), k === 'bandages' ? el('select', { 'data-tip': 'Patch a hero up between fights', onchange: e => { const h = game.party.find(x => x.id === e.target.value); if (h && game.useBandage(h)) { toast(`${h.short} is bandaged`); renderSide(); } e.target.value = ''; } }, el('option', { value: '', text: 'use on…' }), ...game.party.map(h => el('option', { value: h.id, text: h.short }))) : null));
  const v = VEHICLES[game.vehicle];
  $('tab-bag').replaceChildren(
    sectionHead('Party supplies', 'ration'),
    el('div', { class: 'tiny', text: `Rations feed the whole party (${v.name.toLowerCase()}: one every ${v.rationEvery} day${v.rationEvery > 1 ? 's' : ''}). Out of food = exhaustion: −10% hit, dodge and damage per stack.` }),
    ...sup,
    el('div', { class: 'item', 'data-tip': `${v.name} — ${v.desc}` }, el('span', { class: 'n', html: `${iconHtml(!game.vehicle || game.vehicle === 'none' ? 'boot' : 'wagon')}<b>${esc(v.name)}</b> <small>${esc(v.desc)}</small>` })),
    sectionHead('Gear', 'slot_weapon'),
    el('div', { class: 'tiny', html: `${iconHtml('gold')} ${game.gold} gold · ${game.inventory.length} items · hover for the stats, click to compare and equip` }),
    ...(rows.length ? rows : [el('p', { class: 'tiny', text: 'Empty.' })]));
}
function usePotion(it, h) { const e = it.effect; if (e.type === 'heal') { if (it.target === 'group') for (const x of game.party) x.hp = Math.min(x.maxHp, x.hp + e.amount); else h.hp = Math.min(h.maxHp, h.hp + e.amount); } if (e.type === 'mana') h.mp = Math.min(h.maxMp, h.mp + e.amount); if (e.type === 'revive') { h.alive = true; h.hp = Math.max(1, Math.floor(h.maxHp * e.pct)); } if (e.type === 'cleanse') h.statuses = []; game.inventory = game.inventory.filter(x => x !== it); renderSide(); toast(`${h.short} uses ${it.name}`); }
function itemDialog(it) {
  const dlg = $('item-dialog'); const hero = game.party[selectedHero]; const slot = it.slot === 'ring' ? (hero.equipment.ring1 ? 'ring1' : 'ring1') : it.slot; const cur = hero?.equipment[slot]; const s = game.loot.score(it, hero), cs = cur ? game.loot.score(cur, hero) : null;
  const affixes = (it.affixes || []).map(a => el('div', { class: 'affix ' + (a.baseIntrinsic ? '' : 'good'), text: game.loot.describe(a) }));
  const diff = cs ? s.total - cs.total : null;
  const kids = [
    el('h3', { html: `${gemHtml(it)}<span class="${it.rarity}">${esc(it.name)}</span>` }),
    el('div', { class: 'subline', html: `${iconHtml(slotIcon(it.slot))}${esc(it.rarity)} · ${esc(it.quality)} quality · ${esc(SLOT_NAME[it.slot] || it.slot)}${it.weaponCategory ? ' · ' + esc(it.weaponCategory) : ''}${it.twoHanded ? ' · two-handed' : ''}${it.attackSpeed && it.attackSpeed !== 'normal' ? ' · ' + esc(it.attackSpeed) : ''}` }),
    it.dmg ? el('div', { html: `<b>Damage</b> ${it.dmg[0]}–${it.dmg[1]}`, 'data-tip': STAT_TIPS.dmg }) : null,
    it.armor != null ? el('div', { html: `<b>Armor</b> ${it.armor}`, 'data-tip': STAT_TIPS.armor }) : null,
    ...affixes, it.lore ? el('p', { class: 'lore', text: it.lore }) : null, it.desc ? el('p', { class: 'tiny', text: it.desc }) : null,
    el('div', { class: 'cmp', 'data-tip': 'Score weighs damage, defence and utility for this hero — a rough "is it better?" number.', html: `Score: offense ${s.offense} · defense ${s.defense} · utility ${s.utility} = <b>${s.total}</b>`
      + (cs ? `<br>Against ${esc(hero.short)}'s ${esc(cur.name)} (${cs.total}): <span class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff}</span>` : `<br>${hero ? esc(hero.short) + ' has that slot empty.' : ''}`) }),
    el('div', { class: 'row' },
      el('select', { id: 'equip-to', 'data-tip': 'Who puts it on' }, ...game.party.map((h, i) => el('option', { value: i, text: 'Equip on ' + h.short, selected: i === selectedHero ? '' : undefined }))),
      el('button', { class: 'primary', text: 'Equip', 'data-tip': 'Wear it now — whatever it replaces goes back in the bag', onclick: () => { const h = game.party[+dlg.querySelector('#equip-to').value]; if (it.type === 'weapon' && !canUse(h, it)) return toast(`${h.short} can't use ${it.subtype}s (${h.weapons.join(', ')})`); const oldItem = h.equipment[it.slot === 'ring' ? 'ring1' : it.slot] || null; const delta = game.loot.score(it, h).total - (oldItem ? game.loot.score(oldItem, h).total : 0); if (game.inventory.includes(it)) { game.inventory = game.inventory.filter(x => x !== it); const out = equip(h, it, game.loot); game.inventory.push(...out); } game.logLoot(it, { holder: h.id, equipped: true, replaced: oldItem?.name || null, delta }); hideTip(); dlg.close(); renderSide(); toast(`${h.short} equips ${it.name}`); } }),
      game.inventory.includes(it) ? el('button', { text: `Sell ${game.loot.sellPrice(it)}g`, 'data-tip': 'Turn it into gold on the spot. There is no buying it back.', onclick: () => { const p = game.sell(it); hideTip(); dlg.close(); renderHud(); renderSide(); toast(`Sold for ${p} gold`); } }) : null,
      el('button', { text: 'Close', onclick: () => { hideTip(); dlg.close(); } }))];
  dlg.replaceChildren(...kids.filter(Boolean));   // replaceChildren turns a null into the text "null"
  decorateFrames(dlg);
  dlg.showModal();
}
function renderSkills() {
  const h = game.party[selectedHero]; if (!h) return $('tab-skills').replaceChildren();
  const attr = el('div', { class: 'row', 'data-tip': h.pendingAttr ? `${h.pendingAttr} point${h.pendingAttr === 1 ? '' : 's'} to spend — two come with every level` : 'No attribute points left. Two arrive with every level.' }, el('b', { text: `${h.name} · ${h.pendingAttr} attribute points` }), ...['STR', 'DEX', 'INT', 'CON'].map(k => { const b = el('button', { class: 'small', html: `${iconHtml('stat_' + k.toLowerCase())} +${k} (${h.attrs[k]})`, disabled: h.pendingAttr ? undefined : '', onclick: () => { h.attrs[k]++; h.pendingAttr--; refresh(h, game.loot); renderSide(); } }); b.dataset.tip = h.pendingAttr ? STAT_TIPS[k] : `No attribute points left. ${STAT_TIPS[k]}`; if (!h.pendingAttr) b.title = 'No attribute points left — two arrive with every level'; return b; }));
  const sk = classSkills(SK, h.class).map(s => {
    const m = mergeSkill(s, h); const known = s.unlockLevel <= h.level;
    const chips = el('div', { class: 'chip-row' },
      el('span', { class: 'chip type', 'data-tip': `How the skill is delivered${m.aoe ? ' — and how many it catches' : ''}`, text: m.type + (m.aoe ? ' · ' + m.aoe : '') }),
      m.damageMult ? el('span', { class: 'chip', 'data-tip': 'Damage multiplier against a normal weapon swing', text: '×' + m.damageMult.toFixed(2) }) : null,
      m.healMult ? el('span', { class: 'chip', 'data-tip': 'Healing multiplier', text: 'heal ×' + m.healMult }) : null,
      el('span', { class: 'chip mp', 'data-tip': `Costs ${m.mpCost || 0} mana each cast`, text: `${m.mpCost || 0} mp` }),
      el('span', { class: 'chip cd', 'data-tip': `Rounds of waiting before it can be used again`, text: `cd ${m.cooldown || 2}` }),
      el('span', { class: 'chip', 'data-tip': known ? `Known since level ${s.unlockLevel}` : `Unlocks at level ${s.unlockLevel} — ${h.short} is level ${h.level}`, text: `L${s.unlockLevel}` }));
    return el('div', { class: 'skill', style: known ? '' : 'opacity:.5' },
      el('div', {}, el('b', { text: s.name || s.id })), chips, el('div', { class: 'tiny', text: s.description || '' }),
      el('div', {},
        ...(s.talents || []).map(t => el('span', { class: 'talent' + (h.talents[t.id] ? ' on' : ''), 'data-tip': `${t.desc || describeEffect(t.effect || {})}${h.talents[t.id] ? ' · already learned' : h.pendingTalent ? ' · click to learn' : ' · no talent points yet (levels ' + TALENT_LEVELS.join('/') + ')'}`, text: `${t.name}: ${t.desc || describeEffect(t.effect || {})}`, onclick: () => { if (h.talents[t.id]) return; if (!h.pendingTalent) return toast('No talent points (levels ' + TALENT_LEVELS.join('/') + ')'); h.talents[t.id] = true; h.pendingTalent--; refresh(h, game.loot); renderSide(); toast(`Learned ${t.name}`); } })),
        ...(s.upgrades || []).map(u => el('span', { class: 'talent' + (h.level >= u.level ? ' on' : ''), 'data-tip': `${describeEffect(u.bonus || {}, { replace: true })} · ${h.level >= u.level ? 'already yours' : 'comes free at level ' + u.level}`, text: `L${u.level} ${u.name}: ${describeEffect(u.bonus || {}, { replace: true })}` }))));
  });
  const pass = passiveTree(h.class).map(n => { const r = h.passiveRanks[n.id] || 0; return el('div', { class: 'passive', 'data-tip': `${n.desc} · rank ${r} of 3${h.pendingPassive ? ' · you have a passive point to spend' : ''}` }, el('span', { html: `<b>${esc(n.name)}</b> ${r}/3 <span class="tiny">${esc(n.desc)}</span>` }), el('button', { class: 'small', text: '+', disabled: h.pendingPassive && r < 3 ? undefined : '', 'data-tip': h.pendingPassive ? 'Spend a passive point here' : 'No passive points — they come every fifth level', title: h.pendingPassive && r < 3 ? null : r >= 3 ? 'Already at rank 3' : 'No passive points — they come every fifth level', onclick: () => { h.passiveRanks[n.id] = r + 1; h.pendingPassive--; refresh(h, game.loot); renderSide(); } })); });
  $('tab-skills').replaceChildren(attr, el('div', { class: 'tiny', text: `Talent points: ${h.pendingTalent} · passive points: ${h.pendingPassive}. Talents add to a skill; upgrades come free with levels.` }), ...sk, sectionHead('Passives', 'tab_skills'), ...pass, el('div', { class: 'tiny', text: 'Select another hero by clicking them in the Party tab.' }));
}
function questDef(id) { return MAIN_QUESTS.find(q => q.id === id) || sideQuestData.quests.find(q => q.id === id); }
function renderJournal() {
  if (!$('tab-journal')) return;
  const rows = [];
  const entry = (iconName, title, kids, empty) => el('div', { class: 'quest quest-row' }, el('i', { class: 'ic ic-' + iconName }), el('div', { class: 'body' }, el('b', { text: title }), ...(kids.length ? kids : [el('div', { class: 'empty', text: empty })])));
  rows.push(sectionHead('The party', 'tab_party'));
  const heroRows = game.journal(lingo, talk).map(({ hero, lines }) => entry('tab_journal', hero.name, lines.map(t => el('div', { class: 'say', text: t })), 'Nothing worth writing yet.'));
  rows.push(...(heroRows.length ? heroRows : [el('p', { class: 'empty', text: 'Nobody has anything to write yet. Fight something, camp, and look again.' })]));
  const comp = [];
  for (const c of game.companions) { const bank = game.banks[c.id]; if (bank?.memories.length) comp.push(entry('tab_party', c.name, [el('div', { class: 'tiny', text: bank.list(game.now).slice(0, 3).map(x => `${x.memory.type}${x.memory.details?.name ? ' ' + x.memory.details.name : ''}`).join(' · ') })], '')); }
  if (comp.length) { rows.push(sectionHead('Companions', 'tab_party')); rows.push(...comp); }
  if (game.nemeses.length) { rows.push(sectionHead('Grudges', 'node-named')); rows.push(...game.nemeses.map(n => entry('node-named', `${n.name} ${n.title}`, [el('div', { class: 'tiny', text: `Beat us ${n.defeats}× · ${game.zones[n.zone]?.name || n.zone}, first met on day ${n.sinceDay}` })], ''))); }
  rows.push(sectionHead('Days on the road', 'day'));
  const days = game.restLog.slice(-8).reverse().map(r => el('div', { class: 'quest quest-row' }, el('i', { class: 'ic ic-' + (r.ate ? 'ration' : 'night') }), el('div', { class: 'body' }, el('b', { text: `Day ${r.day}` }), el('div', { class: 'tiny', text: `${game.zones[r.zone]?.name || r.zone} · ${r.ate ? 'ate well' : 'went hungry'}${r.exhaustion ? ' · exhausted ×' + r.exhaustion : ''}` }))));
  rows.push(...(days.length ? days : [el('p', { class: 'empty', text: 'The first camp has not been made yet.' })]));
  $('tab-journal').replaceChildren(...rows);
}
function renderQuests() {
  const row = (iconName, title, sub, extra = null, done = false) => el('div', { class: 'quest quest-row' + (done ? ' done' : '') }, el('i', { class: 'ic ic-' + iconName }), el('div', { class: 'body' }, el('b', { text: title }), sub ? el('div', { class: 'tiny', text: sub }) : null, extra));
  const act = game.quests.active.map(id => questDef(id)).filter(Boolean).map(q => row('tab_quests', q.title, q.text + (q.gold ? ` (${q.gold} gold)` : '')));
  const hq = Object.values(game.heroQuests).filter(q => !q.done).map(q => row('node-heroquest', `${q.heroName}'s errand: ${q.title}`, `${q.task} · ${Math.min(q.progress, q.objective.n)}/${q.objective.n}`));
  const board = game.sideQuests().filter(q => !game.quests.active.includes(q.id) && !game.quests.done.includes(q.id)).map(q => row('gold', q.title, `${q.text} · ${q.gold} gold`, el('button', { class: 'small', text: 'Accept', 'data-tip': 'Take the bounty — it shows up under Story until it is done', onclick: () => { game.acceptSideQuest(q.id); renderQuests(); toast('Bounty accepted'); } })));
  const done = game.quests.done.map(id => questDef(id)).filter(Boolean).map(q => row('fame', q.title, '', null, true));
  const rows = [];
  const push = (list, head, iconName) => { if (list.length) { rows.push(sectionHead(head, iconName)); rows.push(...list); } };
  push(act, 'The story', 'tab_quests'); push(hq, 'Hero errands', 'node-heroquest'); push(board, 'Bounty board', 'gold'); push(done, 'Finished', 'fame');
  if (!rows.length) rows.push(el('p', { class: 'empty', text: 'Nothing in hand. Settlements keep a board of paying work.' }));
  rows.push(el('div', { class: 'tiny', text: `Zones open: ${game.unlockedZones.map(z => game.zones[z]?.name).join(', ')}. Kills ${game.kills}, rare items found ${game.rareFound}, bosses ${game.completedBosses.length / 2 | 0}.` }));
  $('tab-quests').replaceChildren(...rows);
}

// ------------------------------------------------------------------ themed shell
let mapResizeT = 0;
addEventListener('resize', () => { clearTimeout(mapResizeT); mapResizeT = setTimeout(() => { if (game && !$('screen-world').hidden) renderMap(); }, 200); });

setupUI();   // tooltips everywhere, gold corner flourishes on every .framed box, title-screen embers, how-to-play text

window.emberveil = { menu, conversations, assets, restScene, get game() { return game; }, get stage() { return stage; }, get talk() { return talk; }, library, lingo, DATA, LOOKS, ELOOKS, enemyLook, bodyOf, companionLook, get busy() { return busy; }, fight, enterNode, startWorld, addChosen, renderSide, classes: classes.classes };
document.body.dataset.ready = '1';
