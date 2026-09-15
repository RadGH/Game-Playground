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
import { mergeSkill, classSkills, passiveTree, PASSIVE_NODES, UNLOCKS, TALENT_LEVELS, xpForLevel, canUse, describeEffect, checkBonus, bestCheckBonus, fmt, fmtHp, fmtSign } from './rules.js';
import { syncCompanions } from './effects.js';
import { Stage } from './stage.js';
import { installSfx } from './sfx-bridge.js';
import { Talk, isSceneText } from './talk.js';
import { Conversations, factsFrom, Threads, expandVariants } from '../../../conversations/js/conversations.js';
import { LangDebug, LANGDEBUG_CSS } from '../../../shared/langdebug.js';
import { showRewards, specFromVictory, itemToReward } from '../../../shared/rewards.js';
import { renderMeter, METER_CSS } from '../../../meters/js/meter-ui.js';
import { Assets } from '../../../assets/js/assets.js';
import { VEHICLES, SUPPLY_KINDS } from './game.js';
import { makeRng } from './rng.js';
import { resolveCrossing, crossingChoices, payRetry, RETRY_COST } from './explore.js';
import { NODE_INFO } from './ui.js';
import { SPEEDS, SPEED_TIPS, PACE, GAP_EVENTS, normalizeSpeed, paceFactor, timeScale as paceTimeScale, paceMs, extraGap } from './pace.js';
import { StickyScroll } from './scroll.js';
import { woundedReport, woundedLine, woundedFallback, registerTownTalk } from './talk.js';
import { setupUI, initMenu, decorateFrames, iconHtml, gemHtml, gemFor, slotIcon, SLOT_NAME, STAT_TIPS, nodeInfo, itemTipHtml, registerTip, hideTip, esc, checkText, checkHtml, skillCheckPopup } from './ui.js';

const $ = id => document.getElementById(id);
// An attribute whose value is null/undefined is skipped, so `disabled: cond ? '' : undefined` means
// "only set it when cond" instead of setting the literal string "undefined" (which would still apply).
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null && k !== 'text' && k !== 'html') continue; if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const k of kids) if (k != null) e.append(k); return e; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const toast = t => { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => e.hidden = true, 2200); };

// ------------------------------------------------------------------ load
const base = '../../'; const j = async p => (await fetch(base + p)).json(); const D = p => j('prototypes/emberveil/data/' + p);
const [items, classes, skills, builds, enemies, bosses, encounters, spells, zones, zoneTables, dialogs, randomEvents, dungeons, companions, statuses, bossPhases, classLooks, enemyLooks, lexData, grammarData, traitsData, eventsData, relationsData, packData, topicsData, namedData, sideQuestData, classQuestData, threadsData, balanceData, crossingData, familyData, roadQuestData] = await Promise.all([D('items.json'), D('classes.json'), D('skills.json'), D('build-presets.json'), D('enemies.json'), D('bosses.json'), D('encounters.json'), D('enemy-spells.json'), D('zones.json'), D('zone-tables.json'), D('dialog-events.json'), D('random-events.json'), D('dungeons.json'), D('companions.json'), D('status-effects.json'), D('boss-phases.json'), D('class-looks.json'), D('enemy-looks.json'), j('lingo/data/lexicon.json'), j('lingo/data/grammar.json'), j('lingo/data/traits.json'), j('lingo/data/events.json'), j('lingo/data/relations.json'), j('lingo/data/packs/emberveil.json'), j('conversations/data/topics.json'), D('named-enemies.json'), D('side-quests.json'), D('class-quests.json'), j('conversations/data/threads.json'), D('balance.json'), D('crossings.json'), D('enemy-families.json'), D('road-quests.json')]);
const DATA = { items, classes, skills, builds, enemies, bosses, encounters, spells, zones, zoneTables, dialogs, randomEvents, dungeons, companions, statuses, bossPhases, events: eventsData, relations: relationsData, named: namedData, sideQuests: sideQuestData, classQuests: classQuestData, balance: balanceData, crossings: crossingData, families: familyData, roadQuests: roadQuestData };
const [deps, library, assets] = await Promise.all([loadDeps(base), Library.open(base + 'library/'), Assets.open(base + 'assets/')]);
const lingo = new Lingo({ lexicon: lexData, grammar: grammarData, traits: traitsData }); for (const e of packData.entries) lingo.lexicon.add(e); DATA.lexicon = lingo.lexicon;
expandVariants(topicsData, { perLine: 2, seed: 11 }); const conversations = new Conversations({ lingo, topics: topicsData }); const threads = new Threads({ conv: conversations, threads: threadsData }); const langdbg = new LangDebug({ lingo, base: base }); document.head.append(Object.assign(document.createElement('style'), { textContent: LANGDEBUG_CSS })); langdbg.mountSettings($('menu-langdbg') || $('hud'), { onToggle: on => { if (on) for (const p of document.querySelectorAll('#narrative .say')) langdbg.decorate(p); } }); document.head.append(Object.assign(document.createElement('style'), { textContent: METER_CSS }));
for (const [id, e] of Object.entries({ ...enemies.entities, ...bosses.entities })) if (!lingo.lexicon.has(id)) lingo.lexicon.add({ id, type: 'creature', forms: { sg: e.name.toLowerCase(), pl: e.name.toLowerCase() + 's' }, tags: [] });
lingo.invalidatePronunciations();
registerTownTalk(lingo, await D('town-talk.json'));   // round 21 (E39): "We should take a rest, Corvin is wounded."
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
  // sound wraps the stage from outside, see js/sfx-bridge.js
  showScreen('world');
  if (!stage) {
    const options = { assets };
    const rendererParam = new URLSearchParams(location.search).get('renderer');
    const useChibi2 = rendererParam !== 'chibi1';
    if (useChibi2) {
      const { createChibi2Character } = await import('../../../avatar-3d/js/chibi2.js');
      const { BatchedSpellFx } = await import('../../../avatar-3d/js/spellfx-batched.js');
      options.characterFactory = createChibi2Character; options.effectsClass = BatchedSpellFx;
    }
    stage = new Stage($('stage'), options); window.emberveilSfx = await installSfx({ stage, game });
  }
  talk = new Talk({ lingo, game, voice }); talk.muted = $('mute').checked; talk.engineOverride = $('engine').value || 'formant'; for (const h of game.party) talk.speaker(h);
  summonUnlockedPets({ quiet: true, restage: false });   // a loaded save may already have the talent bought
  if (typeof closeTownPanel === 'function') closeTownPanel(); logScroll.clear(); renderHud(); renderSide(); renderMap();
  if (!resumed) narrate(`<h4>${ACT_NAMES[0]}</h4><p>A wanderer on a road that used to lead somewhere. The Veil bends around you. Somebody named you.</p>`); else narrate(`<p class="sys">Game loaded. ${game.zone().name}.</p>`);
  await stage.setSide(game.fighters().map(bodyOf), 'left'); stage.setBackdrop(game.zoneId); stage.parkVehicle(game.vehicle); await enterNode();
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
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => { hideTip(); for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b); for (const t of document.querySelectorAll('.tab')) t.hidden = t.id !== 'tab-' + b.dataset.tab; if (b.dataset.tab === 'meter' && game) renderMeterTab(); };
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
// E35: the log follows new lines only while the reader is at the bottom; scrolled up, it holds still
// and the "new lines" button offers a way back down (js/scroll.js).
const logScroll = new StickyScroll($('narrative'), { button: $('log-latest') });
function narrate(html, cls = '') { const p = el('div', { class: cls, html }); logScroll.append(p); return p; }
// An action button: optional icon (assets/data/ui or the map node icons) + label + a tooltip saying what it does.
// The label stays the button's only text so tests can match it exactly.
function setActions(list) {
  $('actions').replaceChildren(...list.map(a => {
    const b = el('button', { class: a.cls || '', onclick: async () => { if (busy) return; busy = true; hideTip(); try { await a.run(); } catch (e) { console.error(e); closeTownPanel(); narrate(`<p class="bad">Something broke: ${e.message}</p>`); } busy = false; } });   // a town screen must never hide the error
    if (a.tip) b.dataset.tip = a.tip;
    if (a.icon) b.append(el('i', { class: 'ic ic-' + a.icon }));
    b.append(document.createTextNode(a.text));
    return b;
  }));
}
// A player choice. Two things happen the moment a button is clicked, for every caller:
// the choice row is emptied (so the buttons can't sit there being clickable while the answer is read)
// and the pick is written into the log as a gold "you" line. Pass { silent: true } as the second
// argument (or `silent: true` on one action) for the rare choice that shouldn't be logged, and
// `log: '...'` on an action to log different words than the button's label.
function waitForChoice(list, opts = {}) {
  const was = busy; busy = false;
  return new Promise(res => setActions(list.map(a => ({ ...a, run: async () => {
    if (!a.stay) $('actions').replaceChildren();
    if (!opts.silent && !a.silent) narrate(`<p class="you">\u25b8 You: ${esc(a.log || a.text || '')}</p>`);
    const r = await a.run?.();
    if (!a.stay) { busy = was; res(r); }
  } }))));
}

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
function bubbleAt(id, text, who, cls = '') { const b = el('div', { class: 'bubble ' + cls }, el('b', { text: who }), document.createTextNode(text)); $('bubbles').append(b); placeBubble(b, id); return b; }
/**
 * Put a speech bubble over someone's head and keep the whole thing inside the stage box: if there is
 * no room above the head the bubble flips underneath it, and near an edge it slides sideways instead
 * of hanging off. Measured in pixels after the bubble is in the page, so the real size is known.
 */
function placeBubble(b, id) {
  const box = $('bubbles'); const W = box.clientWidth || 640, H = box.clientHeight || 300, PAD = 6;
  const head = stage.headOf?.(id);
  let x = W / 2, yHead = H * 0.22;
  if (head) { const v = head.clone().project(stage.scene.camera); x = (v.x + 1) / 2 * W; yHead = (1 - v.y) / 2 * H; }
  // put it over the head first, then measure what the browser actually drew (wrapping depends on the
  // text and the font, so guessing the size before it is laid out gets it wrong by a line)
  b.classList.remove('below'); b.style.left = x + 'px'; b.style.top = yHead + 'px';
  const r = b.getBoundingClientRect(); const bw = r.width || 170, bh = r.height || 44;
  const below = yHead - bh - PAD < 0;                 // nothing above the head to hang it from
  b.classList.toggle('below', below);
  const top = below ? Math.min(H - bh - PAD, Math.max(PAD, yHead + 8)) : Math.min(H - PAD, Math.max(bh + PAD, yHead));
  b.style.left = Math.min(W - bw / 2 - PAD, Math.max(bw / 2 + PAD, x)) + 'px';
  b.style.top = top + 'px';
}
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

/**
 * Why something came back, in words, for a recover line (E7): "Corvin recovers 15 health (on kill)".
 * `label` is the reason combat.js passed ("on kill", "life steal", the skill's name); the few that
 * are only meaningful to the engine get a plain-language stand-in.
 */
const RECOVER_WHY = { heal: 'a mending', regen: 'regeneration', kill: 'on kill', mana: 'mana', drain: 'drained from a wound', effect: '' };
function recoverWhy(ev) { const raw = ev.label || ''; const why = RECOVER_WHY[raw] !== undefined ? RECOVER_WHY[raw] : raw; return why ? ` (${why})` : ''; }
function floatAt(id, text, cls = '') { const c = stage.chars.get(id); const d = el('div', { class: 'dmg ' + cls, text }); if (c) { const v = c.group.position.clone(); v.y += 1.3; v.project(stage.scene.camera); d.style.left = `${(v.x + 1) / 2 * 100}%`; d.style.top = `${(1 - v.y) / 2 * 100}%`; } else { d.style.left = '50%'; d.style.top = '50%'; } $('bubbles').append(d); setTimeout(() => d.remove(), paceMs(PACE.floatText, fightPace())); }
// Every spoken line goes through one queue, so two lines never talk over each other and none is ever
// dropped: a hero's reply waits for the enemy's taunt to finish playing. speakCount is here for the
// tests — it counts the lines actually handed to the voice engine.
let voiceQueue = Promise.resolve(); let speakCount = 0;
function enqueueSpeech(ch, line, onStart) {
  const p = voiceQueue.then(async () => { speakCount++; onStart?.(); try { await talk.say(ch, line); } catch (e) { console.warn('voice', e); } });
  voiceQueue = p.catch(() => {});
  return p;
}
/**
 * Show a line as a bubble over the speaker + a line in the log, and speak it.
 * `wait: false` still speaks the line (queued) — it just doesn't hold up the scene while it plays.
 */
async function sayLine(ch, line, { cls = '', wait = true } = {}) {
  if (!line?.text) return;
  const who = ch.short || ch.name;
  // The Narrator is not on the stage: no bubble over anybody's head, no talk animation, and the log
  // line is set in italics instead of looking like somebody said it out loud (js/talk.js narrate()).
  const narrating = !!(ch.isNarrator || line.narration);
  const b = narrating ? null : bubbleAt(ch.id, line.text, who, cls);
  const shown = langdbg.rewrite(line.text);
  const para = narrate(narrating
    ? `<p class="say narration"><b>${who}</b> <i>${shown}</i></p>`
    : `<p class="say ${cls}"><b>${who}:</b> ${shown}</p>`);
  langdbg.decorate(para.querySelector('p'));
  const min = (700 + line.text.length * 24) * textSpeed;
  const t0 = Date.now();
  let ended = false; const end = () => { if (ended) return; ended = true; b?.remove(); if (!narrating) stage.talk(ch.id, false); };
  const spoken = enqueueSpeech(ch, line, () => { if (!narrating) stage.talk(ch.id, true); });
  if (wait) { await spoken; const left = min - (Date.now() - t0); if (left > 0) await sleep(Math.min(left, 2200)); end(); }
  else { Promise.all([spoken, sleep(min)]).then(end); setTimeout(end, min + 12000); }   // the timer is a safety net, not the normal path
}
/**
 * Scene text — a description of what the party is looking at, not something a person says. It goes
 * to the Narrator, never to a hero or an NPC. `talk.narrate()` wraps it; sayLine() gives it the
 * italic look and the Narrator's own voice (shared/voices.js role `narrator`).
 */
async function sayScene(text, { wait = true } = {}) {
  const n = talk?.narrate(text);
  if (!n) { if (text) narrate(`<p class="say narration"><b>Narrator</b> <i>${text}</i></p>`); return; }
  return sayLine(n.who, n.line, { wait });
}
const speak = (ch, intent, opts) => talk.line(ch, intent, opts);
/**
 * One skill check, shown the same way everywhere: the die tumbles in a popup, then exactly one line
 * goes in the log — "CON 18 + d20 (rolled 2) = 20 vs 20: pass" (js/ui.js checkText).
 */
async function showCheck(r, { title = null, subtitle = '' } = {}) {
  await skillCheckPopup({ ...r, title: title || `${r.stat || ''} check`.trim(), subtitle },
    { enabled: rewardPopups, speed: textSpeed >= 1 ? 1 : 1 / textSpeed });
  narrate(checkHtml(r));
  return r;
}
const randomAlive = () => { const a = game.alive(); return a[Math.floor(Math.random() * a.length)]; };

// ---- map
// Map node icons live in the shared asset library (assets/data/icons/<type>.svg) so other games can use them.
// If a fetch fails we still draw something: a plain dot, so the map stays readable.
const ICON_FALLBACK = '<circle r="2" fill="#cfd6e4"/>';
const NODE_ICONS = await assets.icons();
const iconMarkup = type => NODE_ICONS[type] || (assets.iconSpecs[type] ? ICON_FALLBACK : '');
/** Column = graph depth from start, row = spread within the column. Replaces the authored x/y so inserted nodes never overlap. */
function layoutZone(z) { const byId = Object.fromEntries(z.nodes.map(n => [n.id, n])); const depth = {}; const start = z.nodes.find(n => n.id === 'start') || z.nodes[0]; const q = [[start.id, 0]]; while (q.length) { const [id, d] = q.shift(); if (depth[id] != null && depth[id] >= d) continue; depth[id] = d; for (const e of byId[id]?.exits || []) if (byId[e]) q.push([e, d + 1]); } for (const n of z.nodes) if (depth[n.id] == null) depth[n.id] = 0; const cols = {}; for (const n of z.nodes) (cols[depth[n.id]] ||= []).push(n); const maxD = Math.max(...Object.keys(cols).map(Number)); const pos = {}; for (const [d, list] of Object.entries(cols)) { list.sort((a, b) => (a.y ?? 0.5) - (b.y ?? 0.5)); list.forEach((n, i) => { pos[n.id] = [7 + (maxD ? d / maxD : 0.5) * 82, list.length === 1 ? 50 : 12 + (i / (list.length - 1)) * 74]; }); } return pos; }
/**
 * Split a node name onto at most two lines of roughly `maxChars` each, breaking at the word gap that
 * leaves the two lines most even. Nothing is ever dropped — a name too long for one line wraps
 * instead of being cut with "…", and the hover card carries the full name either way.
 */
function wrapLabel(name, maxChars) {
  if (name.length <= maxChars) return [name];
  const words = name.split(/\s+/);
  if (words.length < 2) return [name];
  let best = 1, bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length, b = words.slice(i).join(' ').length;
    const score = Math.abs(a - b) + Math.max(0, Math.max(a, b) - maxChars) * 3;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}
function renderMap() {
  const z = game.zone(); const svg = $('map'); svg.replaceChildren();
  const act = ACT_NAMES[z.act] || ''; const dupe = act.toLowerCase().includes((z.name || '').toLowerCase());
  $('map-zone').textContent = `${z.name} — ${dupe ? act.split(' · ')[0] : act}`;   // no "The Lonely Road (Prologue · The Lonely Road)"
  const reach = game.reachable(); const pos = layoutZone(z);
  // quest markers: every accepted job that names a place gets a pin on the node it points at
  const marks = {}; for (const m of game.questMarkers(z.id)) (marks[m.nodeId] ||= []).push(m);
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
  const maxChars = Math.max(9, Math.min(15, Math.round(gap / 0.75)));
  // Labels are collected here and laid out after the loop, once they can be measured. Nodes are walked
  // left to right (and top to bottom inside a column) so a label only ever has to dodge labels to its left.
  const labels = []; const colRow = {}; const byCol = {};
  for (const n of z.nodes) (byCol[pos[n.id][0]] ||= []).push(n.id);
  for (const list of Object.values(byCol)) list.sort((a, b) => pos[a][1] - pos[b][1]).forEach((id, i) => colRow[id] = i);
  const ordered = [...z.nodes].sort((a, b) => pos[a.id][0] - pos[b.id][0] || pos[a.id][1] - pos[b.id][1]);
  ordered.forEach((n, idx) => {
    const [x, y] = P(n.id); const open = reach.includes(n.id); const here = n.id === game.nodeId;
    const g = mk('g', { transform: `translate(${x} ${y})`, class: 'mapnode' + (open ? ' clickable' : '') });
    const cls = ['node', n.type]; if (game.isVisited(n.id)) cls.push('visited'); if (game.isCleared(n.id)) cls.push('cleared'); if (here) cls.push('here'); if (open) cls.push('open');
    const known = game.isVisited(n.id) || open || n.type === 'boss' || n.type === 'town';
    if (!known) cls.push('locked');
    const info = nodeInfo(n);
    const state = here ? 'You are here.' : game.isCleared(n.id) ? 'Cleared — nothing left but the walk.' : game.isVisited(n.id) ? 'Already been here.' : open ? 'One move away.' : 'Not reachable from where you stand.';
    const questLine = (marks[n.id] || []).map(m => `<div class="tip-quest">◆ ${esc(m.title)}${m.gold ? ` — ${m.gold} gold` : ''}</div>`).join('');
    g.setAttribute('data-tip-html', `<div class="tip-title">${esc(known ? n.name : 'Unknown ground')}</div><div class="tip-sub">${esc(info.name)}</div><hr><div>${esc(known ? info.text : 'Nobody has told you what waits here.')}</div>${questLine}<div class="tip-sub">${esc(state)}${open && !game.canMove() ? ' No moves left today — rest first.' : ''}</div>`);
    const r = n.type === 'boss' ? 2.9 : n.type === 'town' ? 2.6 : 2.2;
    const c = mk('circle', { r, class: cls.join(' ') }); g.append(c);
    if (game.isVisited(n.id)) g.append(mk('circle', { r: r * 0.62, class: 'seal' }));    // pressed wax seal
    if (known) { const ic = mk('g', { class: 'icon', transform: `scale(${n.type === 'boss' ? 0.32 : 0.26})` }); ic.innerHTML = iconMarkup(n.named ? 'named' : n.type); g.append(ic); }
    // a pin over the node for every quest that points here — story, bounty board, road job or errand
    if (marks[n.id]?.length) { const pin = mk('g', { class: 'questpin ' + marks[n.id][0].kind, transform: `translate(0 ${-r - 1.6})` }); pin.innerHTML = '<path d="M0 1.6 L-1.5 -0.6 L-0.6 -0.6 L-0.6 -2 L0.6 -2 L0.6 -0.6 L1.5 -0.6 Z"/>'; g.append(pin); }
    if (open) c.addEventListener('click', () => { if (busy) return toast('Finish the scene first'); if (!game.canMove()) return toast('No moves left today. Rest first.'); hideTip(); game.travel(n.id); narrateGear(game.legGear); renderMap(); renderHud(); enterNode(); });
    if (known) {
      const lines = wrapLabel(n.name, maxChars);
      const t = mk('text', { 'text-anchor': 'middle', class: here ? 'here' : '' });
      lines.forEach((ln, i) => { const ts = mk('tspan', { x: 0, dy: i ? 1 : 0 }); ts.textContent = ln; t.append(ts); });
      g.append(t); labels.push({ t, lines, x, y, r, row: colRow[n.id] || 0 });
    }
    svg.append(g);
  });
  // Place the labels last, once they exist and can be measured. Each one tries a few spots in order —
  // under the node, over it, out to one side (what saves a crowded column, where the discs sit almost
  // touching), then a second and third tier further out — and takes the first that lands on nothing
  // already drawn. If a zone is so tight that nothing is clear, it takes the least crowded spot.
  // Names are never cut short: long ones wrap onto two lines and the hover card repeats them in full.
  if (labels.length) {
    const fs = parseFloat(getComputedStyle(labels[0].t).fontSize) || 1.2;
    const LH = fs * 1.15;
    for (const L of labels) [...L.t.children].forEach((ts, i) => { if (i) ts.setAttribute('dy', LH); });
    const boxes = labels.map(L => ({ x1: L.x - L.r, x2: L.x + L.r, y1: L.y - L.r, y2: L.y + L.r }));   // the node discs
    const hits = (a, b) => !(a.x2 < b.x1 - .4 || a.x1 > b.x2 + .4 || a.y2 < b.y1 - .2 || a.y1 > b.y2 + .2);
    const boxOf = (L, dx, dy, w, h) => { const x1 = dx > 0 ? L.x + dx : dx < 0 ? L.x + dx - w : L.x - w / 2; return { x1, x2: x1 + w, y1: L.y + dy, y2: L.y + dy + h }; };
    for (const L of labels) {
      let w = 0;
      try { w = Math.max(...[...L.t.children].map(ts => ts.getComputedTextLength())); } catch {}
      if (!w || !isFinite(w)) w = Math.max(...L.lines.map(t => t.length)) * fs * 0.58;
      const h = L.lines.length * LH, step = h + 0.9;
      const under = L.r + 0.9, over = -(L.r + 0.7) - h, side = L.r + 0.6, mid = -h / 2;
      const near = L.row % 2 ? [[0, over], [0, under]] : [[0, under], [0, over]];
      const cands = [...near, [side, mid], [-side, mid], [0, under + step], [0, over - step],
        [side, over], [-side, over], [side, under], [-side, under], [0, under + 2 * step], [0, over - 2 * step]];
      let best = cands[0], bestCost = Infinity;
      for (const [dx, dy] of cands) {
        const box = boxOf(L, dx, dy, w, h);
        const off = Math.max(0, 0.4 - box.y1) + Math.max(0, box.y2 - (vh - 0.4)) + Math.max(0, 0.4 - box.x1) + Math.max(0, box.x2 - 99.6);
        const cost = boxes.reduce((n, b) => n + (hits(box, b) ? 1 : 0), 0) * 10 + off * 3 + (dx ? 0.35 : 0) + Math.abs(dy) * 0.04;
        if (cost < bestCost) { bestCost = cost; best = [dx, dy]; }
        if (cost < 0.5) break;
      }
      const [dx, dy] = best;
      L.t.setAttribute('text-anchor', dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle');
      for (const ts of L.t.children) ts.setAttribute('x', dx);
      L.t.setAttribute('y', dy + fs * 0.92);
      boxes.push(boxOf(L, dx, dy, w, h));
    }
  }
  const sel = $('zone-select'); sel.replaceChildren(...game.zoneOrder.filter(id => game.unlockedZones.includes(id)).map(id => el('option', { value: id, text: game.zones[id].name + (id === game.zoneId ? ' (here)' : '') }))); sel.value = game.zoneId; sel.onchange = () => { if (busy) { toast('Finish the scene first'); sel.value = game.zoneId; return; } game.enterZone(sel.value); stage.setBackdrop(game.zoneId); renderMap(); renderHud(); enterNode(); };
}
// ---- node flows
async function enterNode() {
  if (busy) return; busy = true; try { await enterNodeInner(); } catch (e) { console.error(e); narrate(`<p class="bad">Something broke: ${e.message}</p>`); mapActions(); } busy = false;
}
async function enterNodeInner() {
  const n = game.node(); renderHud(); renderMap(); const res = game.enter(n); stage.clearSide('right'); stage.setBackdrop(game.zoneId);
  stage.parkVehicle(game.vehicle);   // whatever the party bought stands behind them on the road
  if (res.kind === 'crossing') return crossingNode(res, n);
  if (res.kind === 'town') { await town(res.town); await woundedReminder(); return; }   // E39: said once, on arrival
  if (res.kind === 'combat') { narrate(`<h4>${n.name}</h4><p class="bad">${res.encounter.name}.</p>`); const won = await fight(res.encounter, { node: n, boss: res.boss }); if (won) await afterCombat(n, res.encounter, res.boss); return mapActions(); }
  if (res.kind === 'event') return runEvent(res.event, n);
  if (res.kind === 'skillCheck') { narrate(`<h4>${n.name}</h4><p>${res.check.flavor}</p><p class="sys">${res.check.stat} check, difficulty ${res.check.dc}. A d20 plus the party's best ${res.check.stat} bonus (+${bestCheckBonus(game.alive(), res.check.stat, h => derive(h, game.loot)[res.check.stat] ?? h.attrs?.[res.check.stat] ?? 8)}).</p>`); return setActions([{ text: `Attempt (${res.check.stat})`, cls: 'primary', run: async () => { const r = game.resolveSkillCheck(n); await showCheck({ stat: res.check.stat, best: r.best, statBonus: r.statBonus, roll: r.roll, dc: r.dc, ok: r.ok }, { subtitle: n.name }); if (r.text) narrate(`<p class="${r.ok ? 'good' : 'bad'}">${r.text}</p>`); renderHud(); renderSide(); const m = randomAlive(); if (m) await sayLine(m, speak(m, r.ok ? 'brag' : 'complain')); mapActions(); } }, { text: 'Leave it', run: async () => mapActions() }]); }
  if (res.kind === 'shrine') { narrate(`<h4>${n.name}</h4><p class="good">${res.text}</p>`); narrateRevives(res.revived, []); renderSide(); const m = randomAlive(); if (m) await sayLine(m, speak(m, 'relief')); return mapActions(); }
  if (res.kind === 'treasure') { narrate(`<h4>${n.name}</h4><p class="good">+${res.gold} gold${res.item ? `, and <b class="${res.item.rarity}">${res.item.name}</b>` : ''}.</p>`); renderHud(); renderSide(); await showRewardsFor({ title: 'Treasure', subtitle: n.name, gold: res.gold, items: [itemToReward(res.item)].filter(Boolean) }); const m = randomAlive(); if (m) await sayLine(m, speak(m, 'happy')); return mapActions(); }
  if (res.kind === 'lore') { narrate(`<h4>${n.name}</h4>`); await sayScene(res.text); const m = game.party.find(h => h.speech?.traits?.includes('scholar')) || randomAlive(); if (m) await sayLine(m, speak(m, 'lore')); return mapActions(); }
  if (res.kind === 'dungeon') return dungeon(res.dungeon, res.done);
  if (res.kind === 'cleared') { narrate(`<p class="sys">${n.name}: cleared. Nothing stirs.</p>`); return mapActions(); }
  narrate(`<p class="sys">${res.text || n.name}</p>`); mapActions();
}
function mapActions() {
  closeTownPanel(); setInFight(false);   // back on the road: no town screen over the log, no slowed stage
  const n = game.node(); const acts = []; const na = game.nightAttack(); const left = game.legsLeft();
  const rations = game.supplies.ration || 0, tent = game.supplies.tent > 0, torch = game.supplies.torch > 0;
  const down = game.fallen();
  const restTip = `Camp for the night: mana refills and the day rolls over.`
    + (down.length ? ` ${down.map(h => h.short).join(', ')} ${down.length === 1 ? 'is' : 'are'} down — ${game.healers().length ? 'your healer will sit up with them' : 'a night\'s sleep will not wake them; you need a flask, a shrine or a settlement'}.` : '')
    + ` Heals ${tent ? '15% of max health (tent)' : 'nothing on its own — buy a tent'}${rations ? '' : '. No rations left, so the party goes hungry and gains an exhaustion stack'}.`
    + ` Night attack chance ${Math.round(na.chance * 100)}%${torch ? ` (torch lit, ${Math.round(na.torch * 100)}%)` : ''}${na.town ? ' — safe inside a settlement' : ''}. A night raid is bigger and tougher than the same fight by daylight, and pays better for it.`;
  acts.push({ text: `Rest (${left} moves left · night attack ${Math.round(na.chance * 100)}%)`, icon: tent ? 'tent' : 'torch', tip: restTip, cls: game.canMove() ? '' : 'primary', run: async () => restScene() });
  if (n.type === 'town') acts.push({ text: 'Town', icon: 'node-town', tip: 'Go into the settlement: merchant, smith, inn, quest board — and a safe night.', cls: 'primary', run: async () => town(game.townFor()) });
  acts.push({ text: 'Pick a node on the map', icon: 'tab_map', tip: left ? `Travel one node at a time: only the places joined to this one by a trail are lit. Turning round and walking back the way you came costs a move like any other. ${left} move${left === 1 ? '' : 's'} left today.` : 'No moves left today — rest first.', run: async () => toast('Click a lit node next to you') });
  const nz = game.nextZoneId();
  if (nz && game.unlockedZones.includes(nz) && nz !== game.zoneId) acts.push({ text: `→ ${game.zones[nz].name}`, icon: 'boot', tip: `Leave for ${game.zones[nz].name} (${ACT_NAMES[game.zones[nz].act]}). You can always come back.`, cls: 'primary', run: async () => { game.enterZone(nz); stage.setBackdrop(game.zoneId); renderMap(); renderHud(); narrate(`<h4>${game.zones[nz].name}</h4><p class="sys">${ACT_NAMES[game.zones[nz].act]}</p>`); await enterNode(); } });
  setActions(acts);
}

// ---- events
async function runEvent(ev, n) {
  narrate(`<h4>${ev.npcName || n.name}</h4>`); const gen = makeNpc({ seed: hashSeed(ev.id), role: /merchant|trader|seller|peddler|fence|collector/.test(ev.id) ? 'merchant' : /child|orphan/.test(ev.id) ? 'child' : /elder|old|hermit|seer|mother/.test(ev.id) ? 'elder' : /cult|veil/.test(ev.id) ? 'cultist' : 'villager', race: /goblin/.test(ev.id) ? 'goblin' : 'human' }, deps); const npc = { ...gen, id: 'npc_' + ev.id, name: ev.npcName || gen.name, short: ev.npcName || gen.short, hp: 1 };
  if (ev.npcName) { await stage.setSide([npc], 'right', -0.5); talk.speaker(npc); }
  for (const line of ev.lines || []) {
    const who = line.speaker === 'npc' ? npc : (game.party.find(h => h.alive) || game.party[0]);
    if (line.speaker === 'npc' && ev.npcName) await sayLine(npc, { text: line.text }, { cls: 'npc' });
    else if (line.speaker === 'hero' && who && !isSceneText(line.text)) await sayLine(who, { text: line.text });
    else await sayScene(line.text);
  }
  const choices = (ev.choices || []).filter(c => game.choiceAllowed(c));
  const res = await waitForChoice(choices.map(c => ({ text: c.text, run: async () => game.choose(ev, c) })));
  if (res.check) await showCheck({ stat: res.check.stat, best: res.check.best, statBonus: res.check.statBonus, roll: res.check.roll, dc: res.check.dc, ok: res.check.ok }, { subtitle: ev.npcName || n.name });
  // An outcome is sometimes the NPC answering and sometimes the scene resolving ("You wrench the trap
  // open. The wolf limps a few steps…"). The second kind goes to the Narrator even when the event has
  // a named NPC standing there, so the wolf never narrates its own rescue.
  if (res.text) { const t = res.text.replace(/^\((.*)\)$/, '$1'); if (ev.npcName && !isSceneText(t)) await sayLine(npc, { text: t }, { cls: 'npc' }); else await sayScene(t); }
  for (const r of res.rewards) narrate(`<p class="good">${r}</p>`); renderHud(); renderSide();
  await showRewardsFor(specFromRewardLines(res.rewards, { title: 'Reward', subtitle: ev.npcName || n.name }));
  if (res.startCombat) { const enc = game.encounter(res.startCombat); if (enc) { const won = await fight(enc, { node: n }); if (won) await afterCombat(n, enc, false); } }
  stage.clearSide('right'); mapActions();
}
// ---- crossings (travel hazards on the road between two places)
// The node plays a travel scene on the stage — the party walks, or rides if they own a vehicle —
// and then one thing is in the way: a ford, a slide, a sick village, a toll, a gate with a warden.
// The rules are in js/explore.js; this is only the show. Rewards come back in the same shape a won
// fight returns, so showRewards() (when the game has one) can present them identically.
NODE_INFO.crossing = ['Crossing', 'Something on the road has to be got past. Pick how, and roll for it.'];

/** The icon on a crossing button: what kind of answer it is. */
function crossingIcon(st) { return st.fight ? 'node-combat' : st.goldCost ? 'gold' : st.days ? 'day' : st.stat ? 'stat_' + st.stat.toLowerCase() : 'ration'; }

async function crossingNode(res, n) {
  const C = res.crossing;
  narrate(`<h4>${C.name}</h4>`);
  // the travel scene: the whole party crosses the stage, riding if there is anything to ride
  await stage.setSide(game.fighters().map(bodyOf), 'left');
  stage.setBackdrop(C.scenery || game.zoneId);
  await stage.travelAcross({ vehicle: game.vehicle, ms: 3400 });
  stage.resetPositions(); stage.frame('fight'); stage.parkVehicle(game.vehicle);
  narrate(`<p>${C.intro}</p>`);
  if (res.failed) narrate('<p class="sys">You have been turned back here before.</p>');
  // a gate has somebody standing at it: walk them on and let them talk
  let guard = null;
  if (C.guard) {
    const g = makeNpc({ seed: hashSeed(C.id), role: C.guard.role || 'guard', race: C.guard.race || 'human' }, deps);
    guard = { ...g, id: 'npc_' + C.id, name: C.guard.name || g.name, short: C.guard.name || g.short, hp: 1, speech: { ...(g.speech || {}), traits: C.guard.traits || ['dutiful'] } };
    await stage.add(guard, { side: 'right', index: 0, count: 1 });
    talk.speaker(guard);
    await stage.walkIn(guard.id, stage.worldFrame.width / 2 + 1.2, 1.5, { ms: 1600, faceAtEnd: -0.9 });
    await sayLine(guard, { text: C.guard.greeting }, { cls: 'npc' });
  } else {
    const scout = randomAlive(); if (scout) await sayLine(scout, speak(scout, 'warning'));
  }
  return crossingActions(res, n, C, guard);
}

/** The list of ways past, with what each one needs and how likely it is. */
function crossingActions(res, n, C, guard) {
  const states = crossingChoices(game, C);
  const acts = states.map(st => ({
    text: st.text + (st.dc ? ` — ${st.stat} ${fmtSign(st.bonus ?? checkBonus(st.best))}${st.traitBonus ? '+' + st.traitBonus : ''} vs ${st.dc}` : st.goldCost ? ` — ${st.goldCost} gold` : st.days ? ` — costs ${st.days} day` : ''),
    icon: crossingIcon(st),
    cls: st.available ? (st.odds != null && st.odds >= 70 ? 'primary' : '') : '',
    tip: st.available
      ? (st.odds != null ? `Roughly ${st.odds}% to pass. ${st.hero ? st.hero.short + ' leads it.' : ''}` : st.fight ? 'This one ends in a fight.' : 'No roll — this simply works, at the price shown.')
      : `Not possible: ${st.why}.`,
    run: async () => { if (!st.available) return toast(st.why); await doCrossing(res, n, C, st.id, guard); },
  }));
  acts.push({ text: 'Turn back for now', icon: 'boot', tip: 'Leave it and go somewhere else. The crossing will still be here.', run: async () => { stage.clearSide('right'); mapActions(); } });
  setActions(acts);
}

/** A crossing payout: the lines go in the log and the chest pops. Returns the popup's promise. */
function crossingRewards(C, rw) {
  if (!rw) return;
  narrate(`<p class="good"><b>${C.name} is behind you.</b> +${rw.xp} xp each, +${rw.gold} gold, +${rw.fame} fame.</p>`);
  for (const it of rw.drops || []) narrate(`<p class="good">Loot: <span class="${it.rarity}">${it.name}</span>${it.isUnique ? ' (unique)' : ''}</p>`);
  for (const { hero } of rw.levelUps || []) narrate(`<p class="good">${hero.short} reaches level ${hero.level}.</p>`);
  return showRewardsFor(specFromVictory({ xp: rw.xp, gold: rw.gold, fame: rw.fame, drops: rw.drops || [], bossDrops: [], levelUps: rw.levelUps || [] }, { title: 'Crossing passed', subtitle: C.name }));
}

async function doCrossing(res, n, C, choiceId, guard) {
  const r = resolveCrossing(game, C, choiceId, game.rng);
  if (r.blocked) { toast(r.why); return crossingActions(res, n, C, guard); }
  if (r.roll != null) await showCheck({ stat: r.stat, best: r.best, statBonus: r.statBonus ?? checkBonus(r.best), bonus: r.bonus, bonusLabel: 'the right words', roll: r.roll, dc: r.dc, ok: r.ok }, { subtitle: C.name });
  narrate(`<p class="${r.ok ? 'good' : 'bad'}">${r.text}</p>`);
  if (r.costs.length) narrate(`<p class="sys">${r.costs.join(' · ')}.</p>`);
  if (r.days) narrate(`<p class="sys">That cost ${r.days} day${r.days === 1 ? '' : 's'}. It is day ${game.day} now.</p>`);
  if (guard) await sayLine(guard, { text: r.ok ? (C.guard.relent || 'Go on, then.') : (C.guard.refuse || 'Turn around.') }, { cls: 'npc' });
  renderHud(); renderSide();

  // a choice that ends in a fight: win it and the road is open, lose it and you are back where you started
  if (r.fight) {
    const enc = game.encounter(r.fight);
    if (enc) {
      enc.name = game.encounterLabel(enc); narrate(`<p class="bad">${enc.name}.</p>`);
      const won = await fight(enc, { node: null });
      if (!won) { renderHud(); renderSide(); renderMap(); return crossingFailed(res, n, C, guard); }
      const v = game.victory(null, enc);
      await crossingRewards(C, { xp: v.xp, gold: v.gold, fame: v.fame, drops: [...v.drops, ...v.bossDrops], levelUps: v.levelUps });
      return crossingPassed(n, C);
    }
  }
  if (!r.ok) return crossingFailed(res, n, C, guard);
  await crossingRewards(C, r.rewards);
  return crossingPassed(n, C);
}

/** The crossing is beaten: the node stays open from now on and the party has something to remember. */
async function crossingPassed(n, C) {
  game.clearCrossing(n);
  stage.clearSide('right'); stage.setBackdrop(game.zoneId);
  await stage.setSide(game.fighters().map(bodyOf), 'left'); stage.parkVehicle(game.vehicle);
  const m = randomAlive(); if (m) await sayLine(m, speak(m, Math.random() < 0.5 ? 'brag' : 'relief'));
  renderHud(); renderSide(); renderMap(); renderJournal();
  mapActions();
}

/** Turned back: try again for a day and a ration, or walk away and come back later. */
function crossingFailed(res, n, C, guard) {
  narrate(`<p class="bad">${C.name} is still in the way.</p>`);
  setActions([
    { text: `Try again (costs a day and a ration)`, icon: 'day', cls: 'primary',
      tip: `Another attempt: the party loses a day and eats a ration first. ${game.supplies.ration ? '' : 'No rations left — they will go hungry.'}`,
      run: async () => { const paid = payRetry(game); narrate(`<p class="sys">A day goes by and a ration with it. Day ${game.day}.</p>`); renderHud(); renderSide(); renderMap(); return crossingActions(res, n, C, guard); } },
    { text: 'Leave it and go another way', icon: 'boot', tip: 'The crossing stays on the map. Come back stronger, or better equipped.', run: async () => { stage.clearSide('right'); mapActions(); } },
  ]);
}

// ---- combat
async function fight(enc, { node = null, boss = false } = {}) {
  if (typeof closeTownPanel === 'function') closeTownPanel(); setInFight(true);   // E34: the chosen combat speed paces everything from the walk-in on
  const heroes = game.fighters(); const foes = enc.enemies; await stage.setSide(heroes.map(bodyOf), 'left'); await stage.setSide(foes.map(enemyLook), 'right');
  // E9: the enemies walk on before anyone swings, so a fight opens with something arriving rather
  // than a line of bodies appearing out of nowhere. About a second, and the round loop waits for it.
  await stage.marchIn('right', { ms: 850, stagger: 110 });
  // E25 / E32: a health bar (with a shield segment) floats over every fighter for the whole fight.
  stage.syncBars([...heroes, ...foes]);
  const looks = Object.fromEntries(foes.map(e => [e.id, enemyLook(e)])); const combat = new Combat(heroes, foes, { skills: SK, spells: SP, loot: game.loot, rng: makeRng(game.seed + game.kills * 13 + game.day), act: game.act, bossPhases: bossPhases.phases, exhaustionMult: game.exhaustionMult(), vehicle: game.vehicle, meter: game.meter, startBarrier: enc.night && game.vehicle === 'war_wagon' ? 25 : 0 }); game.meter.startFight(enc.name || 'fight', { zone: game.zoneId, day: game.day });
  // Point the meter tab at the fight that just started (dropping any drill-down left over from the last
  // one), draw it empty right away, then refresh it at most every 250ms while the rounds run.
  meterState.scope = 'current'; meterState.actor = null; meterState.source = null; renderMeterTab();
  let tick = 0, meterDrawn = 0;
  const rec = ev => { tick += 0.5; recordEvent(game.meter, ev, tick); const now = Date.now(); if (now - meterDrawn >= 250) { meterDrawn = now; renderMeterTab(); } };
  for (const e of foes) e.voice = e.voice || voiceFor({ role: roleForEnemy(e.templateId), gender: 'n', seed: hashSeed(e.id) }); if (enc.named) { const L = enc.named; narrate(`<p class="bad"><b>${L.name}</b> — ${L.baseName}${L.mods?.length ? ' · ' + L.mods.map(m => namedData.modifiers[m] || m).join(', ') : ''}.${L.lore ? ` <span class="lore">${L.lore}</span>` : ''}</p>`); if (!looks[L.id].beast) { await sayLine(L, talk ? (talk.namedOpener(L, heroes[0], { enc, nemesis: enc.nemesis }) || speak(L, 'threat', { to: heroes[0] })) : null, { cls: 'enemy' }); } else { const nb = talk?.beastOpener(L, { enc, named: true }); await sayScene(nb?.text || `${L.name} watches the party with more patience than its kind should have.`); } if (enc.nemesis) { const m = randomAlive(); const bank = game.banks[m?.id]; const mem = bank?.memories.find(x => x.type === 'nemesis'); if (m && mem) { try { await sayLine(m, lingo.speakAbout(mem, bank, game.now, { speaker: talk.speaker(m), scene: talk.scene(game.zoneId) })); } catch {} } } }
  if (talk) { talk.beginFight(enc); if (node?.type === 'ambush') { const am = talk.raidOpener(enc); if (am) await sayScene(am.text); }
    const talkers = foes.filter(e => !looks[e.id].beast && !e.named); let spoke = 0;
    for (const t of talkers) { if (spoke >= 2) break; if (Math.random() < (spoke === 0 ? 0.75 : 0.3)) { await sayLine(t, talk.enemyOpener(t, heroes[0], { boss: boss && !spoke, enc }), { cls: 'enemy' }); spoke++; } }
    if (!spoke && foes[0] && looks[foes[0].id].beast) { const bs = talk.beastOpener(foes[0], { enc }); await sayScene(bs?.text || `The ${foes[0].name} snarls.`); } }
  const bloodied = new Set();
  while (!combat.over) {
    if (combat.round_ > 0) await sleep(extraGap(PACE.roundGap, fightPace()));   // E34: a breath between rounds at 1x/2x, none at 4x
    const events = combat.round(); narrate(`<p class="sys">— round ${combat.round_} —</p>`);
    for (const ev of events) { rec(ev);
      if (ev.type === 'attack') { const st = attackStyle(ev.source); if (st.kind === 'melee') await stage.attack(ev.source.id, ev.target.id); else await stage.cast(ev.source.id, ev.target.id, { element: st.element, kind: st.kind, crit: !!ev.crit, flash: st.kind === 'magic', flashMs: paceMs(PACE.attackFlash, fightPace()) }); }
      else if (ev.type === 'damage') { const dEl = elementName(ev.dtype); await flyIfPending(ev, dEl); stage.hit(ev.target.id); stage.impact(ev.target.id, dEl, ev.crit); floatAt(ev.target.id, fmtHp(ev.amount) + (ev.crit ? '!' : ''), ev.crit ? 'crit' : ''); narrate(`<p class="${ev.source?.isEnemy ? 'bad' : ''}">${ev.source ? (ev.source.short || ev.source.name) : 'Something'} ${ev.label ? `(${ev.label}) ` : ''}hits ${ev.target.short || ev.target.name} for ${fmtHp(ev.amount)} damage${ev.crit ? ' (crit)' : ''}${ev.tags?.length ? ' · ' + ev.tags.join(', ') : ''}.</p>`); if (!ev.target.isEnemy && ev.target.hp > 0 && ev.target.hp <= ev.target.maxHp / 2 && !bloodied.has(ev.target.id)) { bloodied.add(ev.target.id); if (ev.target.isHero) await sayLine(ev.target, speak(ev.target, 'combat_hurt')); } await sleep(paceMs(PACE.afterDamage, fightPace())); }
      else if (ev.type === 'miss') { floatAt(ev.target.id, 'miss', 'miss'); narrate(`<p class="sys">${ev.source.short || ev.source.name} misses ${ev.target.short || ev.target.name}.</p>`); }
      else if (ev.type === 'skill') { noteCast(ev); narrate(`<p class="good">${ev.source.short || ev.source.name} uses <b>${ev.name}</b>.</p>`); if (!ev.source.isEnemy && Math.random() < 0.25) await sayLine(ev.source, speak(ev.source, 'combat_bark'), { wait: false }); await sleep(paceMs(PACE.afterSkill, fightPace())); }
      else if (ev.type === 'heal') { if (ev.amount > 0) { stage.heal(ev.target.id); floatAt(ev.target.id, '+' + fmtHp(ev.amount), 'heal'); narrate(`<p class="good">${ev.target.short || ev.target.name} recovers ${fmtHp(ev.amount)} health${recoverWhy(ev)}.</p>`); } }
      else if (ev.type === 'mana') { if (ev.amount > 0) { floatAt(ev.target.id, '+' + fmtHp(ev.amount) + ' mp', 'mana'); narrate(`<p class="sys">${ev.target.short || ev.target.name} recovers ${fmtHp(ev.amount)} mana${recoverWhy(ev)}.</p>`); } }
      else if (ev.type === 'dot') { stage.pulseStatus(ev.target.id, ev.status); if (stage.chars.get(ev.target.id)) stage.fx.impact({ at: stage.pointOf(ev.target.id), element: elementName(ev.dtype || ev.status), scale: 0.55, height: stage.heightOf(ev.target.id) }); floatAt(ev.target.id, fmtHp(ev.amount), ''); narrate(`<p class="sys">${ev.target.short || ev.target.name} takes ${fmtHp(ev.amount)} damage from ${ev.status}.</p>`); }
      else if (ev.type === 'skip') narrate(`<p class="sys">${ev.target.short || ev.target.name} is ${ev.why}.</p>`);
      else if (ev.type === 'down') { stage.down(ev.target.id); stage.clearStatuses(ev.target.id); pendingCast.delete(ev.target.id); narrate(`<p class="bad"><b>${ev.target.short || ev.target.name} goes down.</b></p>`); const w = game.party.find(h => h.alive && h !== ev.target); if (w && ev.target.isHero) await sayLine(w, speak(w, 'ally_down', { bindings: { fallen: talk.speaker(ev.target).entity } })); }
      else if (ev.type === 'kill') { stage.down(ev.target.id); stage.clearStatuses(ev.target.id); pendingCast.delete(ev.target.id); narrate(`<p class="good">${ev.target.name} is dead.</p>`); if (ev.source?.isHero && Math.random() < 0.5) await sayLine(ev.source, speak(ev.source, 'combat_kill', { bindings: { foe: new Entity(lingo.lexicon.get(ev.target.templateId) || { id: ev.target.templateId, type: 'creature', forms: { sg: ev.target.name.toLowerCase() } }, { lexicon: lingo.lexicon }) } })); }
      else if (ev.type === 'revive') { stage.revive(ev.target.id); stage.reviveFx(ev.target.id); narrate(`<p class="good">${ev.target.short} is back on their feet.</p>`); }
      else if (ev.type === 'taunt') narrate(`<p class="sys">${ev.source.short} taunts ${ev.target.name}.</p>`);
      else if (ev.type === 'phase') {
        // A boss crossing an hp threshold: name the phase in the log, flash the boss so the change is
        // visible, and let it say something about it (beasts get narration instead — they don't talk).
        narrate(`<p class="bad"><b>${ev.target.name}: ${ev.name}.</b>${ev.text ? ` <span class="lore">${ev.text}</span>` : ''}</p>`);
        stage.impact(ev.target.id, elementName(ev.dtype || 'arcane'), true); stage.pulseStatus(ev.target.id, 'enrage');
        if (talk && !looks[ev.target.id]?.beast) { try { const l = talk.bossPhaseLine?.(ev.target, heroes.find(h => h.alive) || heroes[0]); if (l) await sayLine(ev.target, l, { cls: 'enemy' }); } catch (e) { console.warn('boss phase line', e); } }
        else narrate(`<p class="sys"><i>${ev.target.name} changes how it fights.</i></p>`);
        await sleep(paceMs(PACE.afterPhase, fightPace()));
      }
      if (ev.type === 'status' && ev.target?.alive) { stage.status(ev.target.id, ev.status, true); if (ev.status === 'barrier' && ev.power > 0) { floatAt(ev.target.id, '+' + fmtHp(ev.power) + ' shield', 'heal'); narrate(`<p class="good">${ev.target.short || ev.target.name} gains a ${fmtHp(ev.power)} shield${ev.source && ev.source !== ev.target ? ` (${ev.source.short || ev.source.name})` : ''}.</p>`); } }
      if (ev.target) syncStatuses(ev.target); if (ev.source && ev.source !== ev.target) syncStatuses(ev.source);
      renderPartyTab();
      if (GAP_EVENTS.includes(ev.type)) { const gap = extraGap(PACE.eventGap, fightPace()); if (gap) await sleep(gap); }   // E34: 0 at 4x
    }
  }
  setInFight(false);
  pendingCast.clear(); stage.clearBars(); for (const c of [...stage.chars.keys()]) stage.clearStatuses(c);
  for (const h of heroes) { h.statuses = []; h.buffs = []; h.dmgBuff = 0; h.dmgReduct = 0; } game.meter.endFight(); enc.killsBy = combat.killsBy; renderMeterTab(); const hqDone = game.trackFight(combat, enc, combat.result === 'win'); for (const q of hqDone || []) await heroQuestDone(q);
  if (combat.result === 'win') { const m = randomAlive(); if (m) await sayLine(m, speak(m, Math.random() < 0.5 ? 'brag' : 'relief')); return true; }
  if (combat.result === 'lose') { const d = game.defeat(enc); if (enc.named) narrate(`<p class="bad"><b>${enc.named.name}</b> leaves you in the dirt and walks away. You will meet again.</p>`); narrate(`<p class="bad"><b>The party falls.</b> ${d.text} You lose ${d.lost}.</p>`); for (const h of game.party) stage.revive(h.id); renderHud(); renderSide(); renderMap(); await stage.setSide(game.fighters().map(bodyOf), 'left'); stage.clearSide('right'); return false; }
  narrate('<p class="sys">The fight drags on until both sides give up.</p>'); return false;
}
async function afterCombat(node, enc, boss) {
  const v = game.victory(node, enc); narrate(`<p class="good"><b>Victory.</b> +${v.xp} xp each, +${v.gold} gold, +${v.fame} fame.</p>`); narrateGear(game.winGear);
  for (const it of [...v.drops, ...v.bossDrops]) narrate(`<p class="good">Loot: <span class="${it.rarity}">${it.name}</span>${it.isUnique ? ' (unique)' : it.setId ? ' (set piece)' : ''}</p>`);
  for (const { hero, ups } of v.levelUps) { narrate(`<p class="good">${hero.short} reaches level ${hero.level}. Points to spend in the Skills tab.</p>`); }
  if (v.namedSlain) { recordNamedKill(v.namedSlain, enc); narrate(`<p class="good"><b>${v.namedSlain.name} is dead.</b> The name goes on the board — see the Journal.</p>`); } for (const q of v.sideDone || []) narrate(`<p class="good"><b>Bounty complete: ${q.title}</b> — +${q.gold} gold.</p>`);
  narrateRevives(v.revived, v.stillDown);
  if (boss) { const enemyId = enc.enemies.find(e => e.boss)?.templateId; const dd = bossPhases.deathDialog?.[enemyId]; if (dd) { const bossUnit = enc.enemies.find(e => e.boss); await sayLine(bossUnit, { text: dd.bossLine.replace(/^"|"$/g, '') }, { cls: 'enemy' }); await sayLine(game.party.find(h => h.alive) || game.party[0], { text: dd.heroLine.replace(/^"|"$/g, '') }); await sayScene(dd.narratorLine); } if (v.questDone) narrate(`<p class="good"><b>Quest complete: ${v.questDone.title}.</b></p>`); if (v.unlockedZone) narrate(`<p class="good">The way to <b>${game.zones[v.unlockedZone].name}</b> is open.</p>`); }
  await showRewardsFor(specFromVictory({ ...v, unlockedZoneName: v.unlockedZone ? game.zones[v.unlockedZone].name : null }, { title: boss ? 'Boss defeated' : 'Victory', subtitle: enc.name || node?.name || '' }));
  for (const h of game.party) if (h.alive) stage.revive(h.id); await sleep(300); stage.clearSide('right'); await stage.setSide(game.fighters().map(bodyOf), 'left'); renderHud(); renderSide(); renderMap();
}
/**
 * Say who got back on their feet and who did not. Since round 20 a hero who goes down stays down
 * until a healer, a flask, a shrine or a settlement picks them up — so the log has to say so, every
 * time, or the player only finds out when the next fight starts three-handed.
 */
function narrateRevives(revived = [], stillDown = []) {
  for (const r of revived) narrate(`<p class="good"><b>${esc(r.hero.short)} is back on their feet</b> — ${esc(r.how)}.</p>`);
  if (stillDown?.length) narrate(`<p class="bad"><b>${esc(stillDown.map(h => h.short).join(', '))} ${stillDown.length === 1 ? 'is' : 'are'} still down.</b> ${esc(game.reviveHelp())}</p>`);
}
// ---- dungeon
async function dungeon(dg, done) {
  narrate(`<h4>${dg.name}</h4>`); if (done) { narrate('<p class="sys">Sealed. You already cleared it.</p>'); return mapActions(); } if (game.avgLevel() < dg.minLevel) narrate(`<p class="sys">Recommended level ${dg.minLevel}.</p>`);
  const go = await waitForChoice([{ text: `Enter (${dg.stages.length} stages)`, cls: 'primary', run: async () => true }, { text: 'Not now', run: async () => false }]); if (!go) return mapActions();
  let stunFirst = false;
  for (const st of dg.stages) { narrate(`<h4>${st.name}</h4>`); if (st.type === 'skill_check') { const c = dungeons.DUNGEON_SKILL_CHECKS[st.checkId]; narrate(`<p>${c.flavor}</p>`); const attr = Math.max(...game.alive().map(h => derive(h, game.loot)[c.stat] || 8)); const best = bestCheckBonus(game.alive(), c.stat, h => derive(h, game.loot)[c.stat] || 8); const roll = 1 + Math.floor(Math.random() * 20); const ok = best + roll >= c.dc; await showCheck({ stat: c.stat, best: attr, statBonus: best, roll, dc: c.dc, ok }, { subtitle: st.name }); narrate(`<p class="${ok ? 'good' : 'bad'}">${ok ? c.passText : c.failText}</p>`); if (ok) stunFirst = true; else for (const h of game.alive()) h.hp = Math.max(1, Math.round(h.hp - h.maxHp * (c.failDamagePct || 0.12))); renderSide(); continue; }
    const enc = game.encounter(st.encounter, st.type === 'boss'); if (!enc) continue; if (stunFirst) { for (const e of enc.enemies) e.statuses.push({ type: 'stun', duration: 1, power: 0 }); stunFirst = false; } const won = await fight(enc, { node: null, boss: st.type === 'boss' }); if (!won) return mapActions(); game.victory(null, enc); renderSide(); }
  game.completedDungeons.push(dg.id); game.gold += dg.reward.gold; const it = game.loot.generate(dg.reward.item, 'rare', 'high', { rng: game.rng }); if (it) game.inventory.push(it); for (const h of game.party) { const { gainXp } = await import('./rules.js'); gainXp(h, Math.round(dg.reward.xp / game.party.length)); refresh(h, game.loot); }
  narrate(`<p class="good"><b>${dg.name} cleared.</b> +${dg.reward.gold} gold, +${dg.reward.xp} xp, ${it ? `<span class="${it.rarity}">${it.name}</span>` : ''}.</p>`); renderHud(); renderSide(); mapActions();
}
// ---- town
async function town(t) { game.threadEvent('town'); closeTownPanel();
  narrate(`<h4>${t.name}</h4><p class="sys">${t.services.map(s => s.replace('blackmarket', 'black market')).join(' · ')}${game.fame >= 500 ? ' · guild hall' : ''}</p>`); stage.clearSide('right');
  townActions(t);
}
/**
 * The town's buttons. Every service calls this (not town()) when it is done, so the town heading is
 * written into the log once per visit instead of again after every purchase (round 21).
 */
function townActions(t) {
  const acts = [{ text: 'Merchant', icon: 'gold', tip: 'Buy gear, food, potions and vehicles — and sell what you are done with.', run: async () => shop(t) }, { text: 'Tavern (hire)', icon: 'tab_party', tip: 'Drink, listen, and hire extra heroes for the party or the bench.', run: async () => tavern(t) }, { text: 'Cleric (heal, free)', icon: 'hp', tip: 'A free full heal, a fresh day, and the fallen back on their feet — settlements are safe ground. This and a shrine are the only revives that cost nothing.', run: async () => { const r = game.clericRest(t); narrate('<p class="good">The cleric sees to everyone. Healed, fed, a new day — and anybody who was down is up again.</p>'); narrateRevives(r?.revived || [], []); renderSide(); renderHud(); closeTownPanel(); townActions(t); } },
    { text: 'Manage party', icon: 'tab_party', tip: `Swap heroes between the party and the bench${game.bench.length ? ` (${game.bench.length} waiting)` : ''}. The party only changes in a settlement.`, run: async () => manageParty() }];
  if (t.services.includes('blacksmith')) acts.push({ text: 'Blacksmith', icon: 'slot_weapon', tip: 'Upgrade the quality of a piece of gear for gold.', run: async () => smith(t, 'blacksmith') }); if (t.services.includes('enchanter')) acts.push({ text: 'Enchanter', icon: 'tab_skills', tip: 'Reroll the magic properties on a piece of gear.', run: async () => smith(t, 'enchanter') }); if (t.services.includes('trainer')) acts.push({ text: 'Trainer (respec 50g/level)', icon: 'xp', tip: 'Take back every talent and passive point the selected hero has spent.', run: async () => { const h = game.party[selectedHero]; const cost = h.level * 50; if (game.gold < cost) return toast('Not enough gold'); game.gold -= cost; h.pendingTalent += Object.keys(h.talents).length; h.talents = {}; h.pendingPassive += Object.values(h.passiveRanks).reduce((a, b) => a + b, 0); h.passiveRanks = {}; refresh(h, game.loot); renderHud(); renderSide(); toast(`${h.short} respecced`); townActions(t); } });
  acts.push({ text: 'Back to the map', icon: 'tab_map', tip: 'Leave the settlement and go back to travelling.', run: async () => mapActions() }); setActions(acts);
}
// ---- town screens (round 21, E37) ------------------------------------------------------------
// Merchant, Tavern, Blacksmith and Enchanter open in a panel that covers the log while it is up, with
// a scroll of its own. The shop used to be written INTO the log, so scrolling it ran straight into old
// fight lines. The log keeps receiving lines underneath and comes back intact (and scrolled the way
// the reader left it) when the panel closes.
function openTownPanel(title, ...nodes) {
  hideTip();
  $('town-panel-title').textContent = title;
  const body = $('town-panel-body'); body.replaceChildren(...nodes.filter(Boolean)); body.scrollTop = 0;
  $('narrative').hidden = true; $('town-panel').hidden = false; logScroll.paint();
  try { body.focus({ preventScroll: true }); } catch { /* focus is a nicety for keyboard scrolling */ }
}
/** Close the town screen and show the log again. Returns true if one was open. */
function closeTownPanel() {
  const panel = $('town-panel'); if (!panel || panel.hidden) return false;
  hideTip(); panel.hidden = true; $('town-panel-body').replaceChildren();
  $('narrative').hidden = false; logScroll.reveal();
  return true;
}
$('town-panel-back').onclick = () => closeTownPanel();

// ---- "We should take a rest, Corvin is wounded." (round 21, E39) ------------------------------
// On arrival in a settlement, if anyone is under 60% health or down, one healthy member says so —
// a healer when one is standing. Spoken through Lingo (data/town-talk.json) so it gets their voice
// and personality. Once per arrival: the key changes only when the party actually travels or a day
// passes, so opening shops and coming back to the town buttons never repeats it.
let woundedSaidFor = null;
async function woundedReminder({ force = false } = {}) {
  if (!game || !talk) return null;
  const key = `${game.zoneId}:${game.nodeId}:${game.nodesTravelled}:${game.day}`;
  if (!force && woundedSaidFor === key) return null;
  const report = woundedReport(game.party, { isHealer: h => game.isHealer(h) });
  if (!report?.speaker) return null;
  woundedSaidFor = key;
  const line = woundedLine(talk, report, { town: game.townFor()?.name || '' }) || { text: woundedFallback(report) };
  await sayLine(report.speaker, line, { cls: 'wounded' });
  return line.text;
}

// ---- Manage Party (round 21, E38) --------------------------------------------------------------
// The active party and the bench side by side; rules in js/bench.js through game.benchHero /
// game.joinParty / game.takeGear. Every change saves the game, restages the party and redraws the tabs.
function manageParty() {
  const dlg = $('party-dialog'); if (!dlg || !game) return;
  let msg = '';
  const changed = async text => {
    msg = text || '';
    for (const h of game.party) { try { talk?.speaker(h); } catch { /* a missing voice never blocks the swap */ } }
    summonUnlockedPets({ quiet: true, restage: false });
    selectedHero = Math.min(selectedHero, Math.max(0, game.party.length - 1));
    renderSide(); renderHud(); game.save(); $('btn-continue').disabled = false;
    draw();
    if (stage) { await stage.setSide(game.fighters().map(bodyOf), 'left'); stage.parkVehicle(game.vehicle); }
  };
  const card = (h, where) => {
    const down = !h.alive || h.hp <= 0;
    const pets = (where === 'party' ? game.companions : (game.benchCompanions || [])).filter(c => c.ownerId === h.id);
    const gearN = Object.keys(h.equipment || {}).length;
    const actions = el('div', { class: 'pm-actions' });
    if (where === 'party') {
      const r = game.canBench(h.id);
      actions.append(el('button', { class: 'small', text: 'To the bench', disabled: r.ok ? undefined : '', title: r.ok ? undefined : `Not possible: ${r.why}`,
        'data-tip': r.ok ? `${h.short} sits out and waits here with their gear${pets.length ? ' — ' + pets.map(p => p.name).join(', ') + ' goes with them' : ''}.` : `Not possible: ${r.why}.`,
        onclick: () => { const x = game.benchHero(h.id); if (!x.ok) return toast(x.why); narrate(`<p class="sys">${esc(h.short)} sits out on the bench${x.pets.length ? `, and ${esc(x.pets.map(p => p.name).join(', '))} with them` : ''}.</p>`); changed(`${h.short} is on the bench.`); } }));
    } else {
      const r = game.canJoin(h.id);
      if (r.ok) actions.append(el('button', { class: 'small primary', text: 'Join the party', 'data-tip': `${h.short} takes the empty place in the party.`,
        onclick: () => { const x = game.joinParty(h.id); if (!x.ok) return toast(x.why); narrate(`<p class="sys">${esc(h.short)} joins the party.</p>`); changed(`${h.short} joins the party.`); } }));
      else if (r.needsSwap) actions.append(el('select', { 'aria-label': `Swap ${h.short} in for a party member`, 'data-tip': `The party is full. Pick who sits out so ${h.short} can take their place.`,
        onchange: e => { const outId = e.target.value; if (!outId) return; const out = game.party.find(p => p.id === outId); const x = game.joinParty(h.id, outId); if (!x.ok) { e.target.value = ''; return toast(x.why); } narrate(`<p class="sys">${esc(h.short)} takes ${esc(out?.short || 'a')}'s place in the party; ${esc(out?.short || 'they')} waits on the bench.</p>`); changed(`${h.short} in, ${out?.short || 'one'} out.`); } },
        el('option', { value: '', text: 'swap in for…' }),
        ...game.party.map(p => { const c = game.canJoin(h.id, p.id); return el('option', { value: p.id, text: p.short + (c.ok ? '' : ' (not possible)'), disabled: c.ok ? undefined : '' }); })));
      else actions.append(el('span', { class: 'tiny bad', text: r.why }));
      if (gearN) actions.append(el('button', { class: 'small ghost', text: 'Take their gear', 'data-tip': `Move everything ${h.short} wears into the bag, so the party can use it. ${h.short} stays on the bench.`,
        onclick: () => { const moved = game.takeGear(h); narrate(`<p class="sys">${esc(h.short)} hands over ${moved.length} piece${moved.length === 1 ? '' : 's'} of gear. It is in the bag.</p>`); changed(`${moved.length} piece${moved.length === 1 ? '' : 's'} of gear moved to the bag.`); } }));
    }
    return el('div', { class: 'pm-card' + (down ? ' down' : ''), 'data-id': h.id },
      el('div', { class: 'portrait', html: h.avatar ? renderSVG(h.avatar) : '' }),
      el('div', { class: 'pm-body' },
        el('div', { class: 'who' }, el('b', { text: h.name }), ' ', el('span', { class: 'tiny', text: `${h.className} · level ${h.level}` })),
        bar(h.hp, h.maxHp, '', down ? `${h.short} is down. ${game.reviveHelp()}` : `Health ${fmtHp(h.hp)} / ${fmtHp(h.maxHp)}. ${STAT_TIPS.hp}`),
        el('div', { class: 'tiny' + (down ? ' bad' : ''), text: `${down ? 'Down' : `${fmtHp(h.hp)} / ${fmtHp(h.maxHp)} health`} · ${gearN} piece${gearN === 1 ? '' : 's'} of gear${pets.length ? ' · ' + pets.map(p => p.name).join(', ') : ''}` }),
        actions));
  };
  const draw = () => {
    const limit = game.partyLimit();
    dlg.replaceChildren(
      el('h3', { text: 'Manage party' }),
      el('div', { class: 'subline', text: `Up to ${limit} heroes walk the road. The rest wait here in ${game.townFor()?.name || 'the settlement'}.` }),
      el('div', { class: 'party-cols' },
        el('div', { class: 'party-col active' }, el('h4', { text: `Party ${game.party.length} / ${limit}` }), ...game.party.map(h => card(h, 'party'))),
        el('div', { class: 'party-col bench' }, el('h4', { text: `Bench ${game.bench.length}` }),
          ...(game.bench.length ? game.bench.map(h => card(h, 'bench')) : [el('div', { class: 'pm-empty', text: 'Nobody is waiting. Hire at the tavern: once the party is full, new hires sit here.' })]))),
      el('p', { class: 'tiny pm-note', text: 'Gear stays on whoever wears it; take a benched hero\'s gear to put it in the bag. A pet called by a hero\'s talent sits out with them. The party can never be left with nobody, or with nobody on their feet.' }),
      el('p', { class: 'tiny pm-msg', role: 'status', text: msg }),
      el('div', { class: 'row' }, el('button', { class: 'primary', text: 'Done', 'data-tip': 'Close. Changes are already saved.', onclick: () => { hideTip(); dlg.close(); } })));
    decorateFrames(dlg);
  };
  draw();
  if (!dlg.dataset.wired) { dlg.dataset.wired = '1'; dlg.addEventListener('close', () => hideTip()); }
  if (!dlg.open) dlg.showModal();
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
  const stock = game.merchantStock(t); const wrap = el('div', { class: 'shop' });
  const refreshUI = () => { wrap.replaceChildren(el('div', { class: 'tiny', text: `You have ${game.gold} gold. Prices scale with quality and rarity.` }), el('b', { text: 'For sale' }), ...stock.map(it => itemRow(it, [el('button', { class: 'small', text: `Buy ${it.price}g`, onclick: () => { if (!game.buy(it, it.price, stock)) return toast('Not enough gold'); renderHud(); renderSide(); refreshUI(); } })])), el('b', { text: 'Supplies' }), ...Object.entries(SUPPLY_KINDS).map(([k, d]) => el('div', { class: 'item' }, el('span', { class: 'n', html: `${iconHtml({ ration: 'ration', bandages: 'hp', torch: 'torch', tent: 'tent' }[k] || 'ration')}${d.name} <small>${d.desc}</small> · have ${game.supplies[k] || 0}` }), el('button', { class: 'small', text: `Buy ${d.price}g`, onclick: () => { if (!game.buySupply(k, 1)) return toast('Not enough gold'); renderHud(); renderSide(); refreshUI(); } }), k === 'ration' ? el('button', { class: 'small', text: `×5 ${d.price * 5}g`, onclick: () => { if (!game.buySupply(k, 5)) return toast('Not enough gold'); renderHud(); renderSide(); refreshUI(); } }) : null)), el('b', { text: 'Stable (vehicle)' }), ...Object.entries(VEHICLES).filter(([id, v]) => id !== 'none' && (!v.act || game.act >= v.act)).map(([id, v]) => el('div', { class: 'item' }, el('span', { class: 'n', html: `${iconHtml('wagon')}<b>${v.name}</b> <small>${v.desc}</small>${game.vehicle === id ? ' <b>(yours)</b>' : ''}` }), game.vehicle === id ? null : el('button', { class: 'small', text: `Buy ${v.price}g`, onclick: () => { if (!game.buyVehicle(id)) return toast('Not enough gold'); renderHud(); renderSide(); refreshUI(); toast(`You now travel by ${v.name.toLowerCase()}`); } }))), el('b', { text: 'Potions' }), ...Object.entries(items.potions).map(([id, p]) => el('div', { class: 'item' }, el('span', { class: 'n', html: `${iconHtml('hp')}<b>${p.name}</b> <small>${p.desc}</small>` }), el('button', { class: 'small', text: `Buy ${p.cost}g`, onclick: () => { if (game.gold < p.cost) return toast('Not enough gold'); game.gold -= p.cost; game.inventory.push({ id: 'p_' + Math.random().toString(36).slice(2, 7), potionId: id, name: p.name, type: 'consumable', slot: 'potion', rarity: 'normal', quality: 'medium', effect: p.effect, target: p.target, affixes: [], icon: p.icon }); renderHud(); renderSide(); refreshUI(); } }))), el('b', { text: 'Sell' }), ...game.inventory.filter(i => i.type !== 'consumable').map(it => itemRow(it, [el('button', { class: 'small', text: `Sell ${game.loot.sellPrice(it)}g`, onclick: () => { game.sell(it); renderHud(); renderSide(); refreshUI(); } })]))); };
  refreshUI(); openTownPanel(`Merchant of ${t.name}`, wrap); townActions(t);
}
async function tavern(t) {
  const intro = el('p', { class: 'tiny', text: `Party ${game.party.length}/${game.partyLimit()} (extra hires wait on the bench; Manage party swaps them), companions ${game.companions.length}/4.` }); const wrap = el('div', { class: 'shop' });
  const hires = game.hires(t); const rows = hires.map(h => { const cd = game.classDef(h.class); const name = h.name || `${LOOKS[h.class]?.name || cd.name}`; return el('div', { class: 'item' }, el('span', { class: 'n', html: `<b>${name}</b> <small>${cd.name} L${h.level}${h.description ? ' · ' + h.description : ''}</small>` }), el('button', { class: 'small', text: `Hire ${h.cost}g`, onclick: () => { if (game.gold < h.cost) return toast('Not enough gold'); game.gold -= h.cost; const HL = hireLook(h.id); const hero = game.makeHero(h.class, name, h.level, { ...(HL || LOOKS[h.class]), name }); hero.voice = HL?.voice || voiceFor({ role: h.class, gender: hero.gender || 'n', seed: hashSeed(name + h.id) }); if (h.attrs) { hero.attrs = { ...h.attrs }; refresh(hero, game.loot); hero.hp = hero.maxHp; hero.mp = hero.maxMp; } game.addHero(hero); talk.speaker(hero); hires.splice(hires.indexOf(h), 1); renderHud(); renderSide(); toast(`${name} joins ${game.party.includes(hero) ? 'the party' : 'the bench'}`); tavern(t); } })); });
  const comps = game.kennel().map(c => el('div', { class: 'item' }, el('span', { class: 'n', html: `<b>${c.name}</b> <small>power ${c.power} · ${c.description}</small>` }), el('button', { class: 'small', text: `Buy ${c.price}g`, onclick: () => { if (game.gold < c.price) return toast('Not enough gold'); if (game.companions.length >= 4) return toast('Four companions max'); game.gold -= c.price; game.addCompanion(game.makeCompanion(c)); renderHud(); renderSide(); toast(`${c.name} joins you`); tavern(t); } })));
  // The bench is changed in its own dialog now (E38). The old "Swap in" here popped the last hero off the
  // party without asking and ignored gear, pets and a party left with nobody standing.
  const benchRows = game.bench.map(h => el('div', { class: 'item' }, el('span', { class: 'n', text: `${h.name} (${h.className} L${h.level}) — on the bench` })));
  const manage = el('button', { class: 'small', text: 'Manage party', 'data-tip': 'Open the party and the bench side by side and swap heroes between them.', onclick: () => manageParty() });
  wrap.replaceChildren(el('b', { text: 'Heroes for hire' }), ...rows, el('b', { text: 'Companions' }), ...comps, el('b', { text: `Bench (${game.bench.length})` }), ...benchRows, el('div', { class: 'row' }, manage)); openTownPanel('Tavern', intro, wrap); townActions(t);
}
async function smith(t, kind) {
  const title = kind === 'blacksmith' ? 'Blacksmith' : 'Enchanter';
  const intro = el('p', { class: 'tiny', text: `Materials: ${Object.entries(game.materials).map(([k, v]) => `${v} ${k.replace('_', ' ')}`).join(' · ')}. Salvage unwanted items for materials, then add affixes (2 materials) or promote rarity (3 materials).` }); const wrap = el('div', { class: 'shop' });
  const refreshUI = () => { wrap.replaceChildren(...game.inventory.filter(i => i.type !== 'consumable').map(it => itemRow(it, [el('button', { class: 'small', text: 'Salvage', onclick: () => { const y = game.salvage(it); toast('Got ' + Object.entries(y).map(([k, v]) => v + ' ' + k.replace('_', ' ')).join(', ')); renderSide(); refreshUI(); } }), el('select', { onchange: e => { const mat = e.target.value; if (!mat) return; const r = game.loot.addAffix(it, mat, game.materials, game.rng); toast(r.ok ? `Added ${r.affix.name}` : r.why); e.target.value = ''; renderSide(); refreshUI(); } }, el('option', { value: '', text: 'add affix…' }), ...items.affixTiers.map(tier => el('option', { value: tier.mat, text: `${tier.label} (${tier.cost} ${tier.mat.replace('_', ' ')}, ×${tier.mult})` }))), el('button', { class: 'small', text: 'Promote', onclick: () => { const r = game.loot.promote(it, game.materials); toast(r.ok ? `${it.name} is now ${it.rarity}` : r.why); renderSide(); refreshUI(); } })])), ...game.party.flatMap(h => Object.values(h.equipment).map(it => itemRow(it, [el('span', { class: 'tiny', text: `equipped by ${h.short}` })])))); };
  refreshUI(); openTownPanel(title, intro, wrap); townActions(t);
}
// ---- side panels
function renderSide() { renderPartyTab(); renderBag(); renderSkills(); renderQuests(); renderMeterTab(); renderJournal(); }
async function heroQuestDone(q) { const hero = game.party.find(h => h.id === q.heroId); narrate(`<p class="good"><b>${q.heroName} finished the errand: ${q.title}.</b> ${q.rewardItem ? `Reward: <span class="${q.rewardItem.rarity}">${q.rewardItem.name}</span>.` : ''}</p>`);
  await showRewardsFor({ title: 'Errand done', subtitle: `${q.heroName} — ${q.title}`, gold: q.reward?.gold || 0, xp: q.reward?.xp || 0, items: [itemToReward(q.rewardItem)].filter(Boolean), extras: q.reward?.talent ? [{ kind: 'level', text: `${q.heroName} gains a talent point` }] : [] });
  if (hero) { await sayLine(hero, speak(hero, 'brag')); for (const { who, intent } of game.reactionsTo(hero)) { if (Math.random() < 0.7) await sayLine(who, speak(who, intent, { to: hero })); } } renderMap(); renderSide(); }
/**
 * Hand out a conversation's reward and say what happened — once. The reward line used to be written
 * twice: the topic's own `text` spelled out "+50 xp each and the next fight starts with a blessing"
 * AND this function generated "+50 xp, the next fight starts blessed" from the reward object, so the
 * player read both. The reward object is the half that is always right, so it is the only half that
 * carries numbers now; the text in conversations/data/topics.json is flavour and nothing else.
 */
function applyTopicReward(r, answerer, asker, lines, { after = false } = {}) { const who = r.who === 'asker' ? asker : answerer; const parts = []; if (r.xp) { for (const h of game.party) if (h.alive && (!r.who || h === who)) { const ups = gainXpSafe(h, r.xp); if (ups) parts.push(`${h.short} levels up`); } parts.push(`+${r.xp} xp${r.who ? ' for ' + who?.short : ' each'}`); } if (r.gold) { game.gold += r.gold; parts.push(`+${r.gold} gold`); } if (r.talent && who) { who.pendingTalent += r.talent; parts.push(`${who.short} gains a talent point`); } if (r.relation) { for (const a of game.party) for (const b of game.party) if (a !== b) game.relations.get(a.id, b.id).set('warmth', Math.min(1, game.relations.get(a.id, b.id).get('warmth') + r.relation)); parts.push('the party grows closer'); } if (r.relationIf) { const ok = (() => { try { return !!new Function('gear', 'return (' + r.relationIf.cond + ')')(lines?.gear || {}); } catch { return false; } })(); const v = ok ? r.relationIf.value : r.relationIf.else; if (asker && answerer) { const rel = game.relations.get(asker.id, answerer.id); rel.set('trust', Math.max(-1, Math.min(1, rel.get('trust') + v))); parts.push(v > 0 ? `${asker.short} trusts ${answerer.short} more` : `${asker.short} trusts ${answerer.short} less`); } } if (r.item) { const it = game.loot.generate(r.item.base || 'ring', r.item.rarity || 'magic', 'medium', { rng: game.rng }); if (it) { game.inventory.push(it); game.logLoot(it, { holder: who?.id }); parts.push(`found ${it.name}`); } } if (r.supply) for (const [k, n] of Object.entries(r.supply)) { game.supplies[k] = (game.supplies[k] || 0) + n; parts.push(`+${n} ${k}`); } if (r.companion) { const def = (companions.classPets || []).find(c => c.id === r.companion) || { id: r.companion, name: 'Wolf pup', power: 1, attrs: { STR: 6, DEX: 10, INT: 2, CON: 6 } }; if (game.addCompanion(game.makeCompanion({ ...def, name: def.name || 'Wolf pup', power: 1 }))) parts.push(`${def.name || 'a wolf pup'} joins the party`); } if (r.buff) { game.flags.empowered = 1; parts.push('the next fight starts blessed'); } narrate(`<p class="good">${(r.text || '').replace('{answerer}', who?.short || '')}${parts.length ? ' — ' + parts.join(', ') : ''}</p>`); renderHud(); renderSide(); if (r.item || r.talent || r.companion || (r.gold || 0) >= 50) showRewardsFor({ title: 'A good talk', subtitle: (r.text || '').replace('{answerer}', who?.short || ''), gold: r.gold || 0, xp: r.xp || 0, extras: parts.map(t => ({ kind: 'memory', text: t })) }); }
function gainXpSafe(h, xp) { const before = h.level; h.xp += xp; let ups = 0; while (h.xp >= xpForLevel(h.level + 1) && h.level < 30) { h.level++; h.pendingAttr += 2; if (TALENT_LEVELS.includes(h.level)) h.pendingTalent++; if (h.level % 5 === 0) h.pendingPassive++; ups++; } if (ups) refresh(h, game.loot); return ups; }
// ------------------------------------------------------------------ the Named Foes board
// "The name goes on the board" is a real board: the Journal keeps a row for every named enemy and
// every nemesis the party has killed — who they were, where, which day, and whose blow finished it.
// The killing blow is read straight out of the damage meter's record for the fight that just ended,
// which is the same record the meter tab shows, so the two can never disagree.

/** Who landed the killing blow on this enemy in the fight that just finished? */
function killingBlowOn(enemyId) {
  const fight = game.meter?.current || game.meter?.fights?.[game.meter.fights.length - 1];
  if (!fight) return null;
  const rec = [...fight.records].reverse().find(r => r.target === enemyId && r.killingBlow);
  if (!rec) return null;
  return { by: rec.sourceName || rec.source, via: rec.viaName || rec.via, crit: !!rec.crit };
}
/**
 * Write one name on the board. Kept on the game object, so it goes into the save file with
 * everything else (game.save() stringifies the whole game, game.load() copies it back).
 */
function recordNamedKill(L, enc) {
  const board = (game.namedBoard ||= []);
  const blow = killingBlowOn(L.id);
  board.push({
    name: L.name, title: L.title || '', baseName: L.baseName || '',
    zone: game.zoneId, zoneName: game.zone()?.name || game.zoneId, day: game.day, act: game.act,
    nemesis: !!enc?.nemesis, defeats: enc?.nemesis?.defeats || 0,
    by: blow?.by || null, via: blow?.via || null, crit: !!blow?.crit,
  });
  if (board.length > 60) board.shift();
  return board[board.length - 1];
}

// ------------------------------------------------------------------ rewards popup
// shared/rewards.js: a chest lands, opens, the numbers count up and the loot flies out. Every call
// still writes its lines into the narrative log, so the popup is a flourish and never the only record.
// Set window.emberveil.rewardPopups = false to turn it off (the tests that drive fights use this).
let rewardPopups = true;
async function showRewardsFor(spec) {
  if (!rewardPopups || !spec) return;
  const worth = (spec.gold > 0) || (spec.xp > 0) || (spec.fame > 0) || spec.items?.length || spec.extras?.length;
  if (!worth) return;
  try { await showRewards(spec, { base: '../../assets/data/ui', speed: textSpeed >= 1 ? 1 : 1 / textSpeed }); } catch (e) { console.warn('rewards popup', e); }
}
/** Reward strings from game.applyReward ("+40 gold", "+15 xp", "found X") → a popup spec. */
function specFromRewardLines(lines, { title = 'Reward', subtitle = '' } = {}) {
  const spec = { title, subtitle, gold: 0, xp: 0, extras: [] };
  for (const t of lines || []) {
    const g = /^([+-]?\d+) gold$/.exec(t), x = /^\+(\d+) xp$/.exec(t);
    if (g && +g[1] > 0) spec.gold += +g[1];
    else if (x) spec.xp += +x[1];
    else spec.extras.push({ kind: /found|obtained/.test(t) ? 'item' : /join/.test(t) ? 'memory' : 'quest', text: t });
  }
  return spec;
}
const meterState = {};
function renderMeterTab() {
  if (!$('tab-meter')) return;
  if (!game.meter.fights.length) return $('tab-meter').replaceChildren(sectionHead('Damage meter', 'tab_meter'), el('p', { class: 'empty', text: 'Nothing has bled yet. After a fight: a bar per hero, click one for its sources, click again for every single hit.' }));
  const box = el('div'); renderMeter(game.meter, box, meterState);
  $('tab-meter').replaceChildren(sectionHead('Damage meter', 'tab_meter'), box);
}
async function restScene() {
  const na = game.nightAttack(); const v = VEHICLES[game.vehicle];
  narrate(`<h4>Camp, day ${game.day}</h4><p class="sys">Rations: ${game.supplies.ration} (${v.name.toLowerCase()}: one every ${v.rationEvery} day${v.rationEvery > 1 ? 's' : ''}). Night attack chance here: <b>${Math.round(na.chance * 100)}%</b> (base ${Math.round(na.base * 100)}%${na.vehicle ? `, vehicle ${na.vehicle > 0 ? '+' : ''}${Math.round(na.vehicle * 100)}%` : ''}${na.torch ? `, torch ${Math.round(na.torch * 100)}%` : ''}). Resting does not heal; eat an extra ration for 30% HP${game.supplies.tent ? ', the tent gives 15%' : ''}.</p>`);
  const choice = await waitForChoice([{ text: 'Rest', cls: 'primary', run: async () => ({ eatExtra: false }) }, ...(game.supplies.ration >= 2 ? [{ text: 'Rest + eat an extra ration (+30% HP)', run: async () => ({ eatExtra: true }) }] : []), { text: 'Not yet', run: async () => null }]); if (!choice) return mapActions();
  stage.setBackdrop(game.zoneId, true); stage.setNight(true); stage.vehicleId = game.vehicle; await stage.camp(game.party.filter(h => h.alive).map(bodyOf), { vehicle: game.vehicle }); narrate('<p class="sys">The fire takes. Somebody finds the bad cheese.</p>');
  const speakers = game.party.filter(h => h.alive).map(h => talk.speaker(h)); const nextBossNode = game.zone().nodes.find(n => n.type === 'boss'); const facts = factsFrom({ now: game.now, day: game.day, banks: game.banks, heroes: game.party, meter: game.meter, lootLog: game.lootLog, relations: game.relations, party: { rations: game.supplies.ration, exhaustion: game.exhaustion, act: game.act, gold: game.gold, torches: game.supplies.torch, bandages: game.supplies.bandages, vehicle: game.vehicle === 'none' ? null : game.vehicle, vehicleName: v.name.toLowerCase(), nextBoss: nextBossNode && !game.isCleared(nextBossNode.id) ? nextBossNode.name : null, companion: game.companions[0]?.name?.toLowerCase() || null, companionKills: game.companions[0] ? (game.meter.fights.flatMap(f => f.records).filter(r => r.source === game.companions[0].id && r.killingBlow).length) : 0, companionHurt: !!game.companions[0] && game.companions[0].hp < game.companions[0].maxHp * 0.5, namedSeen: game.namedSeen.length, lastNamed: game.namedSeen[game.namedSeen.length - 1] || null, activeQuest: (() => { const q = game.quests.active.map(id => game.questById(id) || MAIN_QUESTS.find(x => x.id === id)).filter(Boolean)[0]; return q?.title || null; })(), questGold: (() => { const q = game.quests.active.map(id => game.questById(id)).filter(Boolean)[0]; return q?.gold || 0; })(), lastQuestDone: (() => { const id = game.quests.done[game.quests.done.length - 1]; const q = game.questById(id) || MAIN_QUESTS.find(x => x.id === id); return q?.title || null; })(), shrineToday: (game.usedNodes || []).some(k => k.startsWith(game.zoneId + ':') && game.zone().nodes.find(n => `${game.zoneId}:${n.id}` === k)?.type === 'shrine' && game.legsUsed > 0) } });
  const facts2 = facts; facts2.party.nodesTravelled = game.nodesTravelled; facts2.party.companions = game.companions.length;
  const th = threads.play(speakers, facts2, game.threads, { scene: talk.scene(game.zoneId) }); if (th) { narrate(`<p class="sys"><i>${th.thread.id.replace('th_', '').replace(/_/g, ' ')}${th.done ? ' — settled' : ''}</i></p>`); for (const l of th.lines) { const who = game.party.find(h => h.id === l.speaker.id); if (who) await sayLine(who, l); } if (th.reward) applyTopicReward(th.reward, th.answerer, th.asker, th.lines); if (th.objective) narrate(`<p class="sys">(this continues after: ${th.objective.type === 'town' ? 'the next town' : th.objective.type === 'named' ? 'a named enemy falls' : th.objective.type + ' ×' + th.objective.n})</p>`); }
  if (Math.random() < 0.35) { const asker = game.party.filter(h => h.alive && !game.activeHeroQuest(h)); if (asker.length) { const h = asker[Math.floor(Math.random() * asker.length)]; const q = game.startHeroQuest(h); if (q) { await sayLine(h, { text: q.ask }); narrate(`<p class="good"><b>${h.short}'s errand: ${q.title}.</b> ${q.task} A violet star marks it on the map. Reward: ${Object.entries(q.reward).map(([k, v]) => k === 'item' ? 'a ' + v.rarity + ' ' + v.category : k === 'talent' ? 'a talent point' : v + ' ' + k).join(', ')}.</p>`); const o = game.party.find(x => x !== h && x.alive); if (o) await sayLine(o, speak(o, game.relations.get(o.id, h.id).opinion() >= 0 ? 'agree' : 'complain', { to: h })); renderMap(); renderQuests(); } } }
  for (let i = 0; i < 2; i++) { const lines = conversations.talk(speakers, facts, { tags: ['camp', 'rare'], scene: talk.scene(game.zoneId) }); for (const l of lines) { const who = game.party.find(h => h.id === l.speaker.id); if (who) await sayLine(who, l); } const topicDef = topicsData.topics.find(t => t.id === lines[0]?.topic); if (topicDef?.reward) { const ans = game.party.find(h => h.id === lines.find(l => l.role === 'answerer')?.speaker.id) || game.party[0]; applyTopicReward(topicDef.reward, ans, game.party.find(h => h.id === lines[0].speaker.id), lines); } const key = lines.find(l => l.role === 'answerer'); if (key && lines[0]) game.rememberConversation(key.speaker.id, key.listener?.id || lines[0].speaker.id, key.topic, key.text); }
  let attacked = false; if (Math.random() < na.chance) { attacked = true; const enc = game.nightEncounter(); if (enc) { const nr = talk?.raidOpener(enc, { night: true }); await sayScene(nr?.text || 'Something comes out of the dark.'); narrate(`<p class="bad"><b>${enc.name}.</b></p>`); const m = randomAlive(); if (m) await sayLine(m, speak(m, 'warning', { bindings: { foe: new Entity(lingo.lexicon.get(enc.enemies[0].templateId) || { id: 'x', type: 'creature', forms: { sg: enc.enemies[0].name } }, { lexicon: lingo.lexicon, count: enc.enemies.length }) } })); stage.clearCamp(); const won = await fight(enc, { node: null }); if (won) { const vic = game.victory(null, enc); narrate(`<p class="good">The raiders are dead. +${vic.xp} xp, +${vic.gold} gold.</p>`); } else { stage.setNight(false); return mapActions(); } } }
  const r = game.rest(choice); narrateGear(r.gear); for (const q of r.questsDone || []) await heroQuestDone(q); stage.clearCamp(); stage.setNight(false); stage.setBackdrop(game.zoneId); await stage.setSide(game.fighters().map(bodyOf), 'left'); stage.parkVehicle(game.vehicle);
  narrate(`<h4>Day ${game.day}</h4><p class="${r.ate ? 'sys' : 'bad'}">${r.ate ? (r.extra ? 'Everyone ate well.' : 'A cold ration each.') : 'No food. Everyone is hungrier and slower.'}${r.exhaustion ? ` Exhaustion ×${r.exhaustion}.` : ''}${r.healed ? ` Healed ${r.healed} in total.` : ''}${attacked ? '' : ' The night passed quietly.'}</p>`); renderHud(); renderSide(); renderMap(); game.save(); mapActions();
}
/** A tab section heading: icon + name + the gold divider rule. */
function sectionHead(text, iconName) { return el('div', { class: 'bag-head' }, el('i', { class: 'ic ic-' + iconName }), el('span', { text })); }
/**
 * A bar. `shield` (E32) draws a pale blue segment after the fill for temporary hit points — the same
 * colour the floating stage bars use, so a barrier reads the same wherever you look at it.
 */
function bar(v, max, cls = '', tip = '', shield = 0) {
  const pct = Math.max(0, Math.min(100, Math.round(100 * v / Math.max(1, max))));
  const shPct = shield > 0 ? Math.max(0, Math.min(100 - pct, Math.round(100 * shield / Math.max(1, max)))) : 0;
  const b = el('div', { class: 'bar ' + cls }, el('i', { style: `width:${pct}%`, class: pct <= 50 && !cls ? 'low' : '' }), shPct ? el('i', { class: 'shield', style: `width:${shPct}%` }) : null);
  if (tip) b.dataset.tip = tip; return b;
}
/** Temporary hit points on a hero right now (barrier / shield statuses). */
function shieldOn(h) { return (h.statuses || []).reduce((n, st) => n + (st.type === 'barrier' || st.type === 'shield' ? Math.max(0, st.power || 0) : 0), 0); }
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
// Small interface preferences that should survive a reload but are not part of the save file
// (right now: which hero cards have their gear drawer open).
const UI_PREFS_KEY = 'playground:emberveil:ui:v1';
const uiPrefs = (() => { try { return JSON.parse(localStorage.getItem(UI_PREFS_KEY)) || {}; } catch { return {}; } })();
function saveUiPrefs() { try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(uiPrefs)); } catch {} }
const gearOpen = id => !!(uiPrefs.gearOpen || {})[id];                       // default: every drawer closed
function setGearOpen(id, on) { const m = (uiPrefs.gearOpen ||= {}); if (on) m[id] = 1; else delete m[id]; saveUiPrefs(); }

// ---- combat speed (round 21, E34) ---------------------------------------------------------------
// Three buttons in the top bar. The choice is a per-browser preference (uiPrefs.combatSpeed), shared
// by every run. While a fight runs, fightPace() is the chosen speed and both the stage clock and the
// CSS --pace variable follow it; outside a fight they are back at normal, so camp and travel never slow.
let combatSpeed = normalizeSpeed(uiPrefs.combatSpeed);
let inFight = false;
const NORMAL_SPEED = SPEEDS[SPEEDS.length - 1];
/** The speed pacing whatever is happening now: the chosen one during a fight, normal otherwise. */
function fightPace() { return inFight ? combatSpeed : NORMAL_SPEED; }
function applyPace() {
  const s = fightPace();
  stage?.setTimeScale?.(paceTimeScale(s));
  document.documentElement.style.setProperty('--pace', String(paceFactor(s)));
}
function setInFight(on) { inFight = !!on; applyPace(); }
/** Pick a speed (1, 2 or 4). Mid-fight it applies from the next swing, wait or animation frame. */
function setCombatSpeed(v) {
  combatSpeed = normalizeSpeed(v); uiPrefs.combatSpeed = combatSpeed; saveUiPrefs();
  for (const b of document.querySelectorAll('#combat-speed button')) b.setAttribute('aria-pressed', String(+b.dataset.speed === combatSpeed));
  applyPace();
  return combatSpeed;
}
for (const b of document.querySelectorAll('#combat-speed button')) {
  b.dataset.tip = SPEED_TIPS[b.dataset.speed] || '';
  b.addEventListener('click', () => { hideTip(); setCombatSpeed(b.dataset.speed); });
}
setCombatSpeed(combatSpeed);

/**
 * Party tab. One compact card per hero so all four fit on screen without scrolling: portrait,
 * name/class/level, the hp/mp/xp bars and a single line of numbers. Everything else — the ten
 * equipment slots, hit/dodge, the Feelings and Save buttons — lives in a drawer behind the card's
 * "Gear" button, which remembers whether it was open.
 */
function renderPartyTab() {
  const GEAR = ['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'ring1', 'ring2', 'necklace'];
  const rows = [...game.party, ...game.companions].map(h => {
    const d = h.isCompanion ? null : derive(h, game.loot);
    const points = h.pendingAttr || h.pendingTalent || h.pendingPassive;
    const open = !h.isCompanion && gearOpen(h.id);
    const stats = d ? el('div', { class: 'statline' },
      statChip('', `${d.dmgMin}–${d.dmgMax}`, STAT_TIPS.dmg, 'slot_weapon'),
      statChip('', d.armor, STAT_TIPS.armor, 'slot_chest'),
      statChip('crit', Math.round(d.critChance) + '%', STAT_TIPS.crit),
      ...['STR', 'DEX', 'INT', 'CON'].map(k => statChip('', h.attrs[k], STAT_TIPS[k], 'stat_' + k.toLowerCase()))) : null;
    const drawer = h.isCompanion ? null : el('div', { class: 'member-more', hidden: open ? null : '' },
      d ? el('div', { class: 'statline' }, statChip('hit', d.hit, STAT_TIPS.hit), statChip('dodge', d.dodge, STAT_TIPS.dodge)) : null,
      el('div', { class: 'slots' }, ...GEAR.map(s => slotRow(h, s))),
      el('div', { class: 'row more-row' },
        el('button', { class: 'small', text: 'Feelings', 'data-tip': `What ${h.short} thinks of the others, and the memories weighing on them`, onclick: e => { e.stopPropagation(); const lines = game.party.filter(o => o !== h).map(o => `${h.short} → ${o.short}: ${game.relations.get(h.id, o.id).summary()}`); const mem = (game.banks[h.id]?.list(game.now) || []).slice(0, 5).map(x => `· ${x.memory.type} ${JSON.stringify(x.memory.details)} (${Math.round(x.salience * 100)}%)`); narrate(`<h4>${h.name}</h4>` + lines.map(l => `<p class="sys">${l}</p>`).join('') + (mem.length ? `<p class="sys">Strongest memories:<br>${mem.join('<br>')}</p>` : '<p class="sys">No memories yet.</p>')); } }),
        el('button', { class: 'small', text: 'Save to library', 'data-tip': 'Keep this hero (look, voice, speech) in the shared character library', onclick: e => { e.stopPropagation(); library.putCharacter({ ...(h.blueprint || {}), name: h.name, short: h.short, race: 'human', avatar: h.avatar, voice: h.voice, speech: h.speech, title: h.className, class: h.class, kind: 'character' }, { source: 'emberveil', tags: ['emberveil', h.class] }); toast(`${h.short} saved to the library`); } })));
    const gearBtn = h.isCompanion ? null : el('button', {
      class: 'small ghost gear-toggle' + (open ? ' on' : ''), text: `Gear ${open ? '▴' : '▾'}`,
      'data-tip': `Show or hide ${h.short}'s ten equipment slots, hit and dodge, and the Feelings / Save buttons`,
      onclick: e => { e.stopPropagation(); setGearOpen(h.id, !gearOpen(h.id)); renderPartyTab(); },
    });
    // next to Gear: rename this one, or roll them a different voice (companions get it too — a pet
    // the party named itself turns up by that name in camp talk and in the journal)
    const cogBtn = el('button', {
      class: 'small ghost cog', text: '⚙',
      'data-tip': `Settings for ${h.short}: change the name the party uses, or roll a new voice`,
      onclick: e => { e.stopPropagation(); heroSettings(h); },
    });
    return el('div', { class: 'member' + (game.party[selectedHero] === h ? ' sel' : '') + (open ? ' open' : ''), 'data-tip': h.isCompanion ? `${h.name} follows the party and fights on its own.` : 'Click to point the Skills tab at this hero', onclick: () => { const i = game.party.indexOf(h); if (i >= 0) { selectedHero = i; renderSkills(); renderPartyTab(); } } },
      el('div', { class: 'portrait', html: h.avatar ? renderSVG(h.avatar) : '' }),
      el('div', { class: 'member-body' },
        el('div', { class: 'who' },
          el('b', { text: h.name }),
          el('span', { class: 'tiny', text: `${h.className} L${h.level}` }),
          points ? el('span', { class: 'pip', text: 'points', 'data-tip': 'Unspent attribute, talent or passive points — spend them in the Skills tab' }) : null,
          el('span', { class: 'gap' }),
          gearBtn, cogBtn),
        bar(h.hp, h.maxHp, '', h.alive && h.hp > 0 ? `Health ${fmtHp(h.hp)} / ${fmtHp(h.maxHp)}${shieldOn(h) ? ` + ${fmtHp(shieldOn(h))} shield` : ''}. ${STAT_TIPS.hp}` : `${h.short} is down. ${game.reviveHelp()}`, shieldOn(h)),
        h.isCompanion ? null : bar(h.mp, h.maxMp, 'mp', `Mana ${fmtHp(h.mp)} / ${fmtHp(h.maxMp)}. ${STAT_TIPS.mp}`),
        h.isCompanion ? null : bar(h.xp, xpForLevel(h.level + 1), 'xp', `Experience ${fmtHp(h.xp)} / ${fmtHp(xpForLevel(h.level + 1))} towards level ${h.level + 1}. ${STAT_TIPS.xp}`),
        stats,
        drawer));
  });
  // The revive rules live in the tooltip on a fallen hero's health bar. The line only takes up room in
  // the panel when somebody is actually down — four hero cards have to fit without a scrollbar.
  const down = game.fallen();
  const help = down.length ? el('div', { class: 'tiny revive-help bad', 'data-tip': 'Being knocked out is not the end, but it does not fix itself either. These are all the ways back up.', text: game.reviveHelp() }) : null;
  $('tab-party').replaceChildren(...rows, ...(help ? [help] : []));
}
function renderBag() {
  const SUPPLY_ICON = { ration: 'ration', bandages: 'hp', torch: 'torch', tent: 'tent' };
  const rows = game.inventory.map(it => it.type === 'consumable'
    ? el('div', { class: 'item' }, el('span', { class: 'n', 'data-tip': `${it.name}${it.desc ? ' — ' + it.desc : ''}. Pick a hero to drink it.`, html: `${gemHtml(it)}<span class="${it.rarity || 'normal'}">${esc(it.name)}</span>` }), el('select', { 'data-tip': it.effect?.type === 'revive' ? 'Wake one of the fallen' : 'Use this on one of the party', onchange: e => { const h = game.party.find(x => x.id === e.target.value); if (!h) return; usePotion(it, h); e.target.value = ''; } }, el('option', { value: '', text: it.effect?.type === 'revive' ? 'wake…' : 'use on…' }), ...game.party.map(h => el('option', { value: h.id, text: h.short + (h.alive && h.hp > 0 ? '' : ' (down)') }))))
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
function usePotion(it, h) {
  const e = it.effect;
  if (e.type === 'heal') { if (it.target === 'group') for (const x of game.party) { if (x.alive) x.hp = Math.min(x.maxHp, x.hp + e.amount); } else if (h.alive) h.hp = Math.min(h.maxHp, h.hp + e.amount); }
  if (e.type === 'mana') h.mp = Math.min(h.maxMp, h.mp + e.amount);
  // a revive goes through the game's own rule so the pair remember it and the hero carries revivedBy
  if (e.type === 'revive') {
    if (h.alive && h.hp > 0) return toast(`${h.short} is already on their feet`);
    const by = game.party.find(x => x !== h && x.alive && x.hp > 0) || null;
    const r = game.revive(h, { by, how: `${it.name} tipped down their throat`, hpFrac: e.pct ?? 0.25, source: 'item' });
    narrate(`<p class="good"><b>${esc(h.short)} is back on their feet</b> — ${esc(r?.how || it.name)}.</p>`);
  }
  if (e.type === 'cleanse') h.statuses = [];
  game.inventory = game.inventory.filter(x => x !== it); renderSide(); renderHud(); toast(`${h.short} uses ${it.name}`);
}
// ---- per-hero settings (round 20): the name the party calls them, and the voice they call it in
// Names live in the save (hero.name / hero.short), so they survive a reload, and everything that
// speaks goes through the Lingo lexicon entry the Talk layer builds from them — drop the cached
// speaker and the new name turns up in barks, camp talk, the journal and every memory line.
/** Rename a hero or a companion everywhere it matters. Returns the new short name. */
function renameMember(m, name, short = '') {
  const full = String(name || '').trim() || m.name;
  m.name = full;
  if (!m.isCompanion && !game.companions.includes(m)) m.short = String(short || '').trim() || full.split(/\s+/)[0];
  else m.short = String(short || '').trim() || full.split(/\s+/)[0];
  if (m.blueprint) m.blueprint.name = full;
  try { talk.speakers.delete(m.id); talk.speaker(m); } catch { /* the lexicon rebuild is best-effort */ }
  return m.short;
}
/** Give a hero a new voice from a fresh seed (the timbre still follows their class or role). */
function rerollVoice(m) {
  const seed = Math.floor(Math.random() * 1e9);
  m.voiceSeed = seed;
  m.voice = voiceFor({ role: m.class || m.templateId || 'villager', gender: m.gender || m.avatar?.gender || 'n', seed });
  return m.voice;
}
/** The little settings sheet behind the ⚙ button on a party card. */
function heroSettings(m) {
  if (!m) return;
  const dlg = $('hero-dialog'); if (!dlg) return;
  const isCompanion = game.companions.includes(m);
  const nameIn = el('input', { type: 'text', value: m.name, maxlength: '28', 'data-tip': 'What the party calls them. Used in speech, memories, the journal and the damage meter.' });
  const shortIn = el('input', { type: 'text', value: m.short || '', maxlength: '14', 'data-tip': 'The short name used in barks and the cramped panels. Leave it empty to use the first word of the full name.' });
  const say = async () => { try { await sayLine(m, { text: `${m.short || m.name}. That is the name.` }); } catch { toast('No voice for that one'); } };
  const kids = [
    el('h3', { text: `${m.name} — settings` }),
    el('div', { class: 'subline', text: isCompanion ? 'Companion' : `${m.className} · level ${m.level}` }),
    el('div', { class: 'hero-settings' },
      el('div', { class: 'row' }, el('span', { class: 'tiny', text: 'Name' }), nameIn),
      el('div', { class: 'row' }, el('span', { class: 'tiny', text: 'Short' }), shortIn),
      el('div', { class: 'row' },
        el('button', { class: 'small', text: '🎲 New voice', 'data-tip': 'Roll a different timbre for this one. The class or role still decides the general sound.', onclick: () => { rerollVoice(m); toast(`${m.short || m.name} has a new voice`); say(); } }),
        el('button', { class: 'small ghost', text: '🔊 Hear it', 'data-tip': 'Say a line in this voice', onclick: say })),
      el('p', { class: 'tiny', text: isCompanion ? 'A pet can be renamed too — camp talk about the dog uses this name.' : 'The name is saved with the game and flows into speech, memories and the journal.' })),
    el('div', { class: 'row' },
      el('button', { class: 'primary', text: 'Save', 'data-tip': 'Keep the name and the voice', onclick: () => { renameMember(m, nameIn.value, shortIn.value); hideTip(); dlg.close(); renderSide(); renderHud(); game.save(); toast(`Now called ${m.short}`); } }),
      el('button', { text: 'Close', onclick: () => { hideTip(); dlg.close(); } })),
  ];
  dlg.replaceChildren(...kids.filter(Boolean));
  decorateFrames(dlg);
  dlg.showModal();
}

/** The slot this item would actually land in for a hero — the same rules rules.js `equip()` uses. */
function slotFor(h, it) {
  let slot = it.slot;
  if (slot === 'ring') slot = !h?.equipment?.ring1 ? 'ring1' : !h?.equipment?.ring2 ? 'ring2' : 'ring1';
  if (it.type === 'weapon' && it.offHandOk && h?.equipment?.weapon && !h.equipment.weapon.twoHanded && !h.equipment.offhand) slot = 'offhand';
  return slot;
}
/** The classes whose kit includes this weapon type — what "class restriction" means on the item card. */
function classesForWeapon(subtype) { return classes.classes.filter(c => (c.weapons || []).includes(subtype)).map(c => c.name); }
/**
 * The item card. Pick which hero you are thinking about first (a row of tabs across the top, greyed
 * out for anyone whose class cannot use the thing), and everything below — the slot it would fill,
 * what it would replace, the damage/armour/score deltas — is about that hero. Nobody has to click
 * Equip to find out it will not work: the restriction is on the card.
 */
function itemDialog(it) {
  const dlg = $('item-dialog');
  const usable = h => it.type !== 'weapon' || canUse(h, it);
  let pick = game.party[selectedHero] && usable(game.party[selectedHero]) ? selectedHero : Math.max(0, game.party.findIndex(usable));
  const users = it.type === 'weapon' && it.subtype ? classesForWeapon(it.subtype) : [];

  const draw = () => {
    const hero = game.party[pick] || null;
    const slot = hero ? slotFor(hero, it) : (it.slot === 'ring' ? 'ring1' : it.slot);
    const cur = hero?.equipment?.[slot] || null;
    const s = game.loot.score(it, hero), cs = cur ? game.loot.score(cur, hero) : null;
    const affixes = (it.affixes || []).map(a => el('div', { class: 'affix ' + (a.baseIntrinsic ? '' : 'good'), text: game.loot.describe(a) }));
    const diff = cs ? s.total - cs.total : null;
    const canWear = hero ? usable(hero) : false;
    const delta = (label, mine, theirs, tip) => {
      if (mine == null && theirs == null) return null;
      const a = mine ?? 0, b = theirs ?? 0, d = a - b;
      return el('div', { class: 'cmp-row', 'data-tip': tip },
        el('span', { text: label }),
        el('b', { text: String(mine ?? '—') }),
        el('span', { class: 'tiny', text: cur ? `was ${theirs ?? '—'}` : 'slot empty' }),
        el('span', { class: d >= 0 ? 'up' : 'down', text: `${d >= 0 ? '+' : ''}${Math.round(d * 10) / 10}` }));
    };
    const heroTabs = el('div', { class: 'row hero-picker' }, ...game.party.map((h, i) => el('button', {
      class: 'small hero-tab' + (i === pick ? ' on' : '') + (usable(h) ? '' : ' cant'),
      text: `${h.short} ${h.className}`,
      'data-tip': usable(h) ? `Compare ${esc(it.name)} with what ${esc(h.short)} is wearing, and equip it on ${esc(h.short)}.`
        : `${esc(h.short)} is a ${esc(h.className)} and cannot use ${esc(it.subtype || 'this')}s — ${esc((h.weapons || []).join(', ') || 'no weapons')} only.`,
      onclick: () => { pick = i; if (usable(h)) { selectedHero = i; renderSkills(); renderPartyTab(); } draw(); },
    })));
    const kids = [
      el('h3', { html: `${gemHtml(it)}<span class="${it.rarity}">${esc(it.name)}</span>` }),
      el('div', { class: 'subline', html: `${iconHtml(slotIcon(it.slot))}${esc(it.rarity)} · ${esc(it.quality)} quality · ${esc(SLOT_NAME[it.slot] || it.slot)}${it.subtype ? ' · ' + esc(it.subtype) : ''}${it.weaponCategory ? ' · ' + esc(it.weaponCategory) : ''}${it.twoHanded ? ' · two-handed' : ''}${it.attackSpeed && it.attackSpeed !== 'normal' ? ' · ' + esc(it.attackSpeed) : ''}` }),
      users.length ? el('div', { class: 'tiny restrict', 'data-tip': 'Only these classes have this weapon in their kit. Everyone else is greyed out above.', html: `<b>Who can use it:</b> ${esc(users.join(', '))}` }) : null,
      it.dmg ? el('div', { html: `<b>Damage</b> ${it.dmg[0]}–${it.dmg[1]}`, 'data-tip': STAT_TIPS.dmg }) : null,
      it.armor != null ? el('div', { html: `<b>Armor</b> ${it.armor}`, 'data-tip': STAT_TIPS.armor }) : null,
      ...affixes, it.lore ? el('p', { class: 'lore', text: it.lore }) : null, it.desc ? el('p', { class: 'tiny', text: it.desc }) : null,
      heroTabs,
      hero ? el('div', { class: 'cmp' },
        el('div', { class: 'tiny', html: `Against <b>${esc(hero.short)}</b>'s ${esc(SLOT_NAME[slot] || slot)}: ${cur ? `<span class="${cur.rarity}">${esc(cur.name)}</span>` : '<i>nothing equipped</i>'}` }),
        delta('Damage (low)', it.dmg?.[0] ?? null, cur?.dmg?.[0] ?? null, STAT_TIPS.dmg),
        delta('Damage (high)', it.dmg?.[1] ?? null, cur?.dmg?.[1] ?? null, STAT_TIPS.dmg),
        delta('Armor', it.armor ?? null, cur?.armor ?? null, STAT_TIPS.armor),
        delta('Offense', s.offense, cs?.offense ?? 0, 'The damage half of the score.'),
        delta('Defense', s.defense, cs?.defense ?? 0, 'The survival half of the score.'),
        delta('Utility', s.utility, cs?.utility ?? 0, 'Finding, speed, regeneration and the odd trick.'),
        el('div', { class: 'cmp-row total', 'data-tip': 'Score weighs damage, defence and utility for this hero — a rough "is it better?" number.' },
          el('span', { text: 'Score' }), el('b', { text: String(s.total) }),
          el('span', { class: 'tiny', text: cur ? `was ${cs.total}` : 'slot empty' }),
          el('span', { class: (diff ?? s.total) >= 0 ? 'up' : 'down', text: `${(diff ?? s.total) >= 0 ? '+' : ''}${diff ?? s.total}` })),
        canWear ? null : el('div', { class: 'tiny bad', text: `${hero.short} cannot use ${it.subtype || 'this'}s. Pick another hero above.` })) : null,
      el('div', { class: 'row' },
        el('button', {
          class: 'primary', text: hero ? `Equip on ${hero.short}` : 'Equip', disabled: hero && canWear ? undefined : '',
          'data-tip': hero && canWear ? `Wear it now — whatever it replaces goes back in the bag` : 'Pick a hero who can use it',
          onclick: () => {
            const h = game.party[pick]; if (!h) return;
            if (!usable(h)) return toast(`${h.short} can't use ${it.subtype}s (${(h.weapons || []).join(', ')})`);
            const target = slotFor(h, it); const oldItem = h.equipment[target] || null;
            const d = game.loot.score(it, h).total - (oldItem ? game.loot.score(oldItem, h).total : 0);
            if (game.inventory.includes(it)) { game.inventory = game.inventory.filter(x => x !== it); const out = equip(h, it, game.loot); game.inventory.push(...out); }
            game.logLoot(it, { holder: h.id, equipped: true, replaced: oldItem?.name || null, delta: d });
            hideTip(); dlg.close(); renderSide(); toast(`${h.short} equips ${it.name}`);
          },
        }),
        game.inventory.includes(it) ? el('button', { text: `Sell ${game.loot.sellPrice(it)}g`, 'data-tip': 'Turn it into gold on the spot. There is no buying it back.', onclick: () => { const p = game.sell(it); hideTip(); dlg.close(); renderHud(); renderSide(); toast(`Sold for ${p} gold`); } }) : null,
        el('button', { text: 'Close', onclick: () => { hideTip(); dlg.close(); } })),
    ];
    dlg.replaceChildren(...kids.filter(Boolean));   // replaceChildren turns a null into the text "null"
    decorateFrames(dlg);
  };
  draw();
  dlg.showModal();
}
/** Point the Skills tab at another hero. Also repaints the Party tab so the selection matches. */
function selectHero(i) { const n = game.party.length; if (!n) return; selectedHero = ((i % n) + n) % n; renderSkills(); renderPartyTab(); $('tab-skills')?.scrollTo?.({ top: 0 }); }
/** The switcher at the top of the Skills tab: back arrow, a tab per hero, forward arrow. */
function heroSwitcher() {
  return el('div', { class: 'row skill-heroes' },
    el('button', { class: 'small ghost arrow', text: '◀', 'data-tip': 'Previous hero', disabled: game.party.length > 1 ? undefined : '', onclick: () => selectHero(selectedHero - 1) }),
    ...game.party.map((x, i) => el('button', {
      class: 'small hero-tab' + (i === selectedHero ? ' on' : ''), text: x.short,
      'data-tip': `${esc(x.name)} — ${esc(x.className)} level ${x.level}${x.pendingAttr || x.pendingTalent || x.pendingPassive ? ' · has points to spend' : ''}`,
      onclick: () => selectHero(i),
    })),
    el('button', { class: 'small ghost arrow', text: '▶', 'data-tip': 'Next hero', disabled: game.party.length > 1 ? undefined : '', onclick: () => selectHero(selectedHero + 1) }),
    el('span', { class: 'gap' }),
    el('button', { class: 'small ghost', text: '⚙ Settings', 'data-tip': 'Rename this hero, or roll them a new voice', onclick: () => heroSettings(game.party[selectedHero]) }));
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
        ...(s.talents || []).map(t => el('span', { class: 'talent' + (h.talents[t.id] ? ' on' : ''), 'data-tip': `${t.desc || describeEffect(t.effect || {})}${h.talents[t.id] ? ' · already learned' : h.pendingTalent ? ' · click to learn' : ' · no talent points yet (levels ' + TALENT_LEVELS.join('/') + ')'}`, text: `${t.name}: ${t.desc || describeEffect(t.effect || {})}`, onclick: () => { if (h.talents[t.id]) return; if (!h.pendingTalent) return toast('No talent points (levels ' + TALENT_LEVELS.join('/') + ')'); h.talents[t.id] = true; h.pendingTalent--; refresh(h, game.loot); summonUnlockedPets(); renderSide(); toast(`Learned ${t.name}`); } })),
        ...(s.upgrades || []).map(u => el('span', { class: 'talent' + (h.level >= u.level ? ' on' : ''), 'data-tip': `${describeEffect(u.bonus || {}, { replace: true })} · ${h.level >= u.level ? 'already yours' : 'comes free at level ' + u.level}`, text: `L${u.level} ${u.name}: ${describeEffect(u.bonus || {}, { replace: true })}` }))));
  });
  const pass = passiveTree(h.class).map(n => { const r = h.passiveRanks[n.id] || 0; return el('div', { class: 'passive', 'data-tip': `${n.desc} · rank ${r} of 3${h.pendingPassive ? ' · you have a passive point to spend' : ''}` }, el('span', { html: `<b>${esc(n.name)}</b> ${r}/3 <span class="tiny">${esc(n.desc)}</span>` }), el('button', { class: 'small', text: '+', disabled: h.pendingPassive && r < 3 ? undefined : '', 'data-tip': h.pendingPassive ? 'Spend a passive point here' : 'No passive points — they come every fifth level', title: h.pendingPassive && r < 3 ? null : r >= 3 ? 'Already at rank 3' : 'No passive points — they come every fifth level', onclick: () => { h.passiveRanks[n.id] = r + 1; h.pendingPassive--; refresh(h, game.loot); renderSide(); } })); });
  $('tab-skills').replaceChildren(heroSwitcher(), attr, el('div', { class: 'tiny', text: `Talent points: ${h.pendingTalent} · passive points: ${h.pendingPassive}. Talents add to a skill; upgrades come free with levels.` }), ...sk, sectionHead('Passives', 'tab_skills'), ...pass, el('div', { class: 'tiny', text: 'Switch heroes with the tabs and arrows above, or by clicking a card in the Party tab.' }));
}
/**
 * E19: a talent that says it summons a companion actually summons one. effects.js reads every
 * hero's bought talents (skills.json `unlocksCompanion`) and hands the pet to the party; here we
 * announce it, put its body on the stage and redraw the party tab. Safe to call any time — a pet
 * that is already out is not summoned twice — so it also runs when a save is loaded.
 */
function summonUnlockedPets({ quiet = false, restage = true } = {}) {
  let added = [];
  try { added = syncCompanions(game); } catch (e) { console.warn('companion unlock', e); return []; }
  if (!added.length) return added;
  for (const c of added) {
    if (!quiet) narrate(`<p class="good"><b>${c.name}</b> answers ${c.ownerShort || 'the call'} and joins the party.</p>`);
    try { talk?.speaker(c); } catch { /* the pet can still fight without a voice */ }
  }
  if (restage && stage) stage.setSide(game.fighters().map(bodyOf), 'left');
  renderSide();
  return added;
}
/** A quest by id: the main story, a town board bounty, or a job taken from somebody on the road. */
function questDef(id) { return MAIN_QUESTS.find(q => q.id === id) || game.questById(id); }
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
  // The board. Every named enemy and nemesis the party has put down: who, where, which day, and
  // whose blow finished it (read out of the damage meter when the fight ended).
  const board = game.namedBoard || [];
  rows.push(sectionHead('Named Foes', 'node-named'));
  if (!board.length) {
    rows.push(el('p', { class: 'empty', text: 'The board is empty. Kill something with a name and it goes up here.' }));
  } else {
    rows.push(...board.slice().reverse().map(b => entry('node-named', `${b.name}${b.title && !b.name.includes(b.title) ? ' ' + b.title : ''}`, [
      el('div', { class: 'tiny', text: `${b.zoneName || b.zone} · day ${b.day}${b.nemesis ? ` · nemesis, beat us ${b.defeats}×` : ''}${b.baseName ? ' · ' + b.baseName : ''}` }),
      el('div', { class: 'tiny', text: b.by ? `Killing blow: ${b.by}${b.via ? ' (' + b.via + ')' : ''}${b.crit ? ', a crit' : ''}` : 'Killing blow: nobody is sure' }),
    ], '')));
  }
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

window.emberveil = { menu, conversations, assets, restScene, crossingNode, doCrossing, resolveCrossing, crossingChoices, NODE_INFO, placeBubble, get game() { return game; }, get stage() { return stage; }, get talk() { return talk; }, get effectsRenderer() { return stage?.fx?.constructor?.name || null; }, library, lingo, DATA, LOOKS, ELOOKS, enemyLook, bodyOf, companionLook, get busy() { return busy; }, get speakCount() { return speakCount; }, get rewardPopups() { return rewardPopups; }, set rewardPopups(v) { rewardPopups = !!v; }, showRewardsFor, fight, afterCombat, enterNode, addChosen, renderSide, renderMeterTab, renderPartyTab, renderMap, renderJournal, waitForChoice, sayScene, showCheck, recordNamedKill, isSceneText, classes: classes.classes,
  // round 21
  narrate, logScroll, setCombatSpeed, get combatSpeed() { return combatSpeed; }, get inFight() { return inFight; }, openTownPanel, closeTownPanel, town, townActions, manageParty, woundedReminder };
document.body.dataset.ready = '1';
