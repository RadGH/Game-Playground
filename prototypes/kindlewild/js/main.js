// Kindlewild — boot, screens and the glue between them.
// Independent project by Radley Sustaire. Plan: docs/PLAN.md. Rules for agents: README.md.

import { loadData } from './game/data.js';
import { createSession, prepareData } from './game/session.js';
import { newGame, saveGame, loadGame, fillSetup, titleOf, progressOf } from './game/modes.js';
import { makeTrial, dayKey } from './game/trials.js';
import * as PR from './game/progress.js';
import { createStage } from './ui/stage.js';
import { createPlay } from './ui/play.js';
import { el, $, modal, toast, show, anyModal } from './ui/ui.js';
import { pageInfo, pageArt, iconUrl } from './ui/icons.js';
const picStyle = (id) => { const u = iconUrl(data, id); return u ? { backgroundImage: `url(${u})` } : {}; };
import { initAudio, setVolume, wireSounds, play as sound, audioInfo } from './ui/audio.js';
import { createPad } from './ui/pad.js';
import { createWhatsNew } from '../../../shared/whats-new.js';
import { createCredits } from '../../../shared/credits.js';

const REALM_KEY = 'kindlewild.realm.v1';   // the one realm of before Custom Game; moved into a save slot at boot
const GAMES_KEY = 'kindlewild.games', GAME_KEY = (id) => 'kindlewild.game.' + id, MAX_GAMES = 12;
const SCREENS = ['title', 'challenges', 'custom', 'custom-new', 'grimoire'];
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }, del(k) { try { localStorage.removeItem(k); } catch { /* */ } } };

const raw = await loadData().catch((e) => { document.getElementById('loading').innerHTML = `<p>Could not load the game: ${e.message}</p>`; throw e; });
const data = prepareData(raw);
const save = PR.loadSave(data.grimoire);
const stage = createStage(document.getElementById('world'), { quality: save.settings.quality });
stage.shakeOn = save.settings.shake;
stage.covered = () => !!document.querySelector('#modal-root .modal-back, .wn-modal, .cr-modal');
stage.onAutoLow = () => { save.settings.quality = 'low'; PR.writeSave(save); toast('Switched to the Fast picture to keep things smooth (Settings to change).', '', 3600); };

const app = {
  data, save, stage, stats: save.stats,
  credits: createCredits({ game: 'kindlewild', title: 'Credits', made: 'Kindlewild — made by Radley Sustaire with Claude. Level and spell pictures drawn for this game.' }),
  news: createWhatsNew({ url: new URL('../data/changelog.json', import.meta.url), key: 'kindlewild', title: "What's new" }),
  current: null,     // { kind, level, cfg }
};
const play = createPlay(app);
const pad = createPad(app, play);
app.pad = pad;

// ---------- saving / progress ----------
let cloud = null;
let merging = false;   // mergeWithAccount() below
// The page reloads to read saves the account just wrote into localStorage. While it goes, nothing may write this
// page's in-memory save back over them — the 'hidden' handler did exactly that, so a download from the account was
// undone on the way out and the device's old progress came back (and could then be uploaded over the account's).
let leaving = false;
function reloadFromStorage() { leaving = true; location.reload(); }
app.saveNow = () => { if (leaving) return; PR.writeSave(save); cloud?.saveSoon?.(); refreshEssence(); };
app.earn = (n) => { PR.earn(save, n); app.saveNow(); };
app.onDiscover = (id) => {
  const got = PR.discover(save, data.discoveries, id);
  if (!got) return;
  const d = data.discoveries.list[id];
  toast(`✦ <b>${d.name}</b> +${got}<small>${d.text}</small>`, 'disc', 3400);
  app.saveNow();
};
app.recordLevel = (level, result) => { const g = PR.recordLevel(save, level, result); app.saveNow(); return g; };
function refreshEssence() {
  // a first-time player is pointed at the first challenge
  $('#go-challenges').classList.toggle('hint', !save.levels['1-1']?.cleared);
  for (const e of document.querySelectorAll('[data-essence], #title-essence')) e.textContent = `✦ ${save.essence}`;
  $('#grim-dot').classList.toggle('hidden', !affordable());
}
function affordable() {
  return data.grimoire.pages.some(p => !save.pages.includes(p.id) && !PR.pageRefusal(save, data.grimoire, p.id));
}
setInterval(() => { if (app.current) { save.stats.playSecs = (save.stats.playSecs || 0) + 10; } }, 10000);
setInterval(() => { if (app.current?.custom && play.s) writeGame(); }, 60000);
addEventListener('visibilitychange', () => { if (document.hidden && !leaving) { if (app.current?.custom && play.s) writeGame(); PR.writeSave(save); } });

// ---------- screens ----------
function screen(id) {
  for (const s of SCREENS) show(s, s === id);
  if (id === 'challenges') drawChallenges();
  if (id === 'grimoire') drawGrimoire();
  if (id === 'custom') drawCustom();
  if (id === 'custom-new') drawNewGame();
  refreshEssence();
  pad.refocus();
}
let grimFromGame = false;
for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => {
  sound('ui.close', {}, 50);
  if (grimFromGame && app.current) {
    // back into the running game, with whatever was just learned in the dock
    grimFromGame = false;
    for (const s of SCREENS) show(s, false);
    if (play.s) { play.s.paused = false; for (const p of save.pages) play.s.unlocked.add(p); play.s.spellLevels = save.spellLevels; }
    play.refreshTiles();
    return;
  }
  screen('title');
});
app.openGrimoire = () => { grimFromGame = true; if (play.s) play.s.paused = true; screen('grimoire'); };
$('#go-challenges').addEventListener('click', () => screen('challenges'));
$('#go-sandbox').addEventListener('click', () => { form = fillSetup(data, { ...form, type: 'sandbox', endless: save.settings.endless, everything: save.settings.everything }); fromTitle = true; screen('custom-new'); });
$('#go-custom').addEventListener('click', () => { if (!games().length) { fromTitle = true; form = fillSetup(data, { ...form, type: 'realm' }); screen('custom-new'); } else screen('custom'); });
$('#custom-new-back').addEventListener('click', () => { sound('ui.close', {}, 50); screen(fromTitle ? 'title' : 'custom'); });
$('#go-grimoire').addEventListener('click', () => screen('grimoire'));
$('#go-settings').addEventListener('click', () => app.settings());
$('#go-journal').addEventListener('click', () => {
  const st = save.stats;
  const mins = Math.round((st.playSecs || 0) / 60);
  const rows = [
    ['✦ Essence earned', save.essenceTotal], ['Unlocks', `${save.pages.length} / ${data.grimoire.pages.length}`],
    ['★ Stars', `${data.levels.acts.reduce((a, x) => a + x.levels.reduce((b, l) => b + (save.levels[l.id]?.stars.filter(Boolean).length || 0), 0), 0)} / ${data.levels.acts.reduce((a, x) => a + x.levels.length * 3, 0)}`], ['Trials cleared', Object.entries(save.levels).filter(([id, r]) => id.startsWith('trial-') && r.cleared).length], ['Discoveries', `${save.discoveries.length} / ${Object.keys(data.discoveries.list).length}`],
    ['Meteors dropped', st.meteors || 0], ['Explosions', st.blasts || 0], ['Spells cast', st.casts || 0], ['Births seen', st.born || 0],
    ['Buildings lost', st.burned || 0], ['Levels cleared', st.levelsWon || 0], ['Time played', mins < 60 ? `${mins} min` : `${(mins / 60).toFixed(1)} h`],
  ];
  const list = el('ul', { class: 'goal-list' }, ...rows.map(([a, b]) => el('li', {}, el('span', { text: a }), el('b', { text: String(b) }))));
  const rated = Object.entries(save.ratings).filter(([, r]) => r.vote);
  const rl = rated.length ? el('p', { class: 'tip', text: 'Your ratings: ' + rated.map(([id, r]) => `${id} ${r.vote > 0 ? 'liked' : 'not for you'}`).join(', ') }) : null;
  modal({ title: 'Journal', body: [list, rl], buttons: [{ label: 'Close', cls: 'big go' }] });
});
$('#go-credits').addEventListener('click', () => app.credits.open());
$('#news-slot').append(app.news.button({ label: "✨ What's new" }));
for (const b of document.querySelectorAll('.whatsnew-btn, #news-slot button')) b.classList.add('small-btn');

// title background: a live little world that shows off now and then
let demo = null;
function startDemo() {
  demo = createSession(data, { mode: 'sandbox', recipe: ['greenvale', 'isles', 'fenmoor', 'pinewood'][(Math.random() * 4) | 0], W: 192, H: 192, seed: (Math.random() * 1e6) | 0, endlessMana: true, everything: true });
  demo.sim.world.clock = 0.7 + Math.random() * 0.1;
  demo.sim.world.dayLength = 9000;
  stage.controller = null;
  stage.setSession(demo);
  stage.cam.zoom = Math.max(innerWidth / 150, innerHeight / 150);
  stage.cam.x = 96; stage.cam.y = 96;
  let t = 0, drift = Math.random() * 6;
  stage.onFrame = (dt) => {
    if (stage.session !== demo) return;
    t += dt;
    drift += dt * 0.05;
    stage.cam.x = 96 + Math.cos(drift) * 25; stage.cam.y = 96 + Math.sin(drift * 0.7) * 25;
    if (t > 3.5) {
      t = 0;
      const pick = ['meteor', 'lightning', 'fireball', 'fireball', 'fireflies', 'storm'][(Math.random() * 6) | 0];
      demo.sim.spells.cast(pick, stage.cam.x + (Math.random() - 0.5) * 50, stage.cam.y + (Math.random() - 0.5) * 50, {});
    }
  };
}

// ---------- challenges ----------
function drawChallenges() {
  const box = $('#act-list');
  box.innerHTML = '';
  // today's generated trial
  const T = makeTrial(dayKey(), save.pages);
  const trec = save.levels[T.id];
  const tb = el('button', { class: 'level trial' + (trec?.cleared ? ' done' : '') },
    el('div', { class: 'ico', style: picStyle(T.icon) }),
    el('b', { text: `Today's Trial: ${T.name}` }),
    el('small', { text: `${['', 'Gentle', 'Fair', 'Tough', 'Fierce'][Math.min(4, Math.max(1, Math.round((T.difficulty - 0.6) * 6)))]} · a new one every day` }),
    el('div', { class: 'stars' }, ...[0, 1, 2].map(k => el('i', { class: trec?.stars[k] ? 'on' : '', text: '★' }))));
  tb.addEventListener('click', () => app.startLevel(T));
  const trialBox = el('div', { class: 'act' }, el('h3', { text: 'Daily Trial' }), tb);
  const newcomer = !save.levels['1-1']?.cleared;
  if (!newcomer) box.append(trialBox);
  for (const act of data.levels.acts) {
    const stars = act.levels.reduce((a, l) => a + (save.levels[l.id]?.stars.filter(Boolean).length || 0), 0);
    const list = el('div', { class: 'levels' });
    act.levels.forEach((L, i) => {
      const open = PR.levelOpen(save, act, i, data.levels.acts);
      const rec = save.levels[L.id];
      const b = el('button', { class: 'level' + (open ? '' : ' locked') + (rec?.cleared ? ' done' : ''), disabled: !open },
        el('div', { class: 'ico' + (open ? '' : ' locked'), style: picStyle(L.icon) }, open ? null : el('span', { class: 'lock', text: 'Locked' })),
        el('b', { text: `${L.id}  ${L.name}` }),
        el('div', { class: 'stars' }, ...[0, 1, 2].map(k => el('i', { class: rec?.stars[k] ? 'on' : '', text: '★' }))));
      b.addEventListener('click', () => app.startLevel(L));
      list.append(b);
    });
    box.append(el('div', { class: 'act' }, el('h3', { text: act.name }), el('p', { text: `${act.blurb}  ★ ${stars}/${act.levels.length * 3}` }), list));
  }
  if (newcomer) { trialBox.classList.add('dim'); box.append(trialBox); }
  box.append(el('p', { class: 'tip', text: 'More acts are coming. Stars and first clears pay Essence — spend it in Upgrades.' }));
}

app.startLevel = (L) => {
  closeModals();
  const cfg = { mode: 'challenge', level: L, spellLevels: save.spellLevels, discovered: save.discoveries, ...PR.challengeMana(save) };
  begin('challenge', cfg, L);
};
app.restart = () => {
  closeModals();
  const c = app.current;
  if (!c) return;
  // a custom game starts again on fresh land, with the same choices
  if (c.custom) return startCustom({ ...c.cfg.session.setup, seed: undefined });
  begin(c.kind, c.cfg, c.level);
};
function begin(kind, cfg, level) {
  for (const s of SCREENS) show(s, false);
  stage.onFrame = null;
  const s = cfg.session || createSession(data, cfg);
  app.current = { kind, cfg, level, custom: !!cfg.session, gameId: cfg.gameId };
  wireSounds(s.sim, (x) => Math.max(-1, Math.min(1, (x - stage.cam.x) / 60)));
  stage.controller = play;
  play.start(s, kind, level);
  pad.refocus();
}
app.quit = () => {
  closeModals();
  if (app.current?.custom && !play.s?.result) writeGame();
  app.current = null;
  play.stop();
  startDemo();
  screen('title');
};
app.exitTo = (id) => { app.quit(); screen(id); };
function closeModals() { for (const b of document.querySelectorAll('.modal-back')) b.remove(); }

// ---------- custom games ----------
// Every saved game has its own localStorage key, with a small index for the list. Worlds stay on the device they were
// played on: an Extra Large one is ~700 KB and the account's upload limit is 2 MB a go, so they would crowd out the
// progress save that does travel (owner 2026-10-30: fine to leave out).
let form = fillSetup(data, {});
let fromTitle = false;
const player = () => ({ mana: PR.realmMana(save, data.grimoire), unlocked: save.pages, spellLevels: save.spellLevels, discovered: save.discoveries });
function games() { try { return JSON.parse(ls.get(GAMES_KEY) || '[]'); } catch { return []; } }
function setGames(list) { ls.set(GAMES_KEY, JSON.stringify(list)); }
function dropGame(id) { ls.del(GAME_KEY(id)); setGames(games().filter(g => g.id !== id)); }
function migrateRealm() {
  const old = ls.get(REALM_KEY);
  if (!old) return;
  try {
    const o = JSON.parse(old);
    const size = Object.entries(data.gamemodes.sizes).find(([, z]) => z.W === o.W)?.[0] || 'large';
    const setup = { ...fillSetup(data, { type: 'realm', recipe: o.recipe, size, events: 'random', seed: o.seed }), size };
    if (ls.set(GAME_KEY('realm-old'), JSON.stringify({ game: 2, setup, ...o }))) {
      setGames([{ id: 'realm-old', title: titleOf(data, setup), type: 'realm', size, progress: `Day ${(o.realm?.day || 0) + 1}`, at: Date.now() }, ...games().filter(g => g.id !== 'realm-old')]);
      ls.del(REALM_KEY);
    }
  } catch (e) { console.warn('old realm not moved:', e.message); }
}
migrateRealm();
function writeGame() {
  const s = play.s, c = app.current;
  if (!s || !c?.custom || s.placing || s.result) return;
  const id = c.gameId ||= 'g' + Date.now().toString(36);
  const row = { id, title: titleOf(data, s.setup), type: s.setup.type, size: s.setup.size, progress: progressOf(s), at: Date.now() };
  if (!ls.set(GAME_KEY(id), saveGame(s))) { toast('This device is out of room for saves. Delete an old game in Custom Game.', 'warn', 4000); return; }
  setGames([row, ...games().filter(g => g.id !== id)]);
  PR.writeSave(save);
}
function startCustom(setup) {
  const list = games();
  if (list.length >= MAX_GAMES) { toast(`You have ${MAX_GAMES} saved games. Delete one first.`, 'warn', 3000); return; }
  const s = newGame(data, setup, player());
  begin(s.setup.type, { session: s }, null);
}
function openGame(g) {
  const str = ls.get(GAME_KEY(g.id));
  if (!str) { toast('That save is missing.', 'warn'); dropGame(g.id); drawCustom(); return; }
  try { const s = loadGame(data, str, player()); begin(s.setup.type, { session: s, gameId: g.id }, null); }
  catch (e) { console.error(e); toast('That game could not be loaded: ' + e.message, 'warn'); }
}
app.runOver = (r) => {
  const t = play.s.setup.type, recs = save.records ||= {};
  const best = recs[t] || null;
  if (r.score != null && (!best || r.score > best.score)) recs[t] = { score: r.score, label: r.label };
  if (r.essence) app.earn(r.essence);
  if (app.current?.gameId) dropGame(app.current.gameId);
  app.current.gameId = null;
  app.saveNow();
  return { best };
};
function drawCustom() {
  const box = $('#custom-body');
  box.innerHTML = '';
  const go = el('button', { class: 'big go', text: 'New game' });
  go.addEventListener('click', () => { fromTitle = false; screen('custom-new'); });
  box.append(go);
  const list = games();
  box.append(el('h3', { text: list.length ? 'Saved games' : 'No saved games yet' }));
  for (const g of list) {
    const open = el('button', { class: 'save-open' }, el('b', { text: g.title }), el('small', { text: [data.gamemodes.types[g.type]?.name, data.gamemodes.sizes[g.size]?.name, g.progress].filter(Boolean).join(' · ') }));
    open.addEventListener('click', () => openGame(g));
    const del = el('button', { class: 'save-del', 'aria-label': `Delete ${g.title}`, text: '✕' });
    del.addEventListener('click', () => modal({ title: 'Delete this game?', body: [`${g.title} will be gone for good.`], buttons: [{ label: 'Delete it', cls: 'big', onClick: () => { dropGame(g.id); drawCustom(); } }, { label: 'Keep it', cls: 'small-btn' }] }));
    box.append(el('div', { class: 'save-row' }, open, del));
  }
  const best = Object.entries(save.records || {}).filter(([t]) => data.gamemodes.types[t]);
  if (best.length) box.append(el('p', { class: 'tip', text: 'Best: ' + best.map(([t, r]) => `${data.gamemodes.types[t].name} ${r.label}`).join(' · ') }));
}
function seg(label, value, options, pick) {
  const row = el('div', { class: 'seg' }, ...options.map(([v, name]) => { const b = el('button', { class: String(v) === String(value) ? 'on' : '', text: name }); b.addEventListener('click', () => pick(v)); return b; }));
  return [el('h3', { text: label }), row];
}
function drawNewGame() {
  const box = $('#custom-form'), G = data.gamemodes, f = form = fillSetup(data, form), t = G.types[f.type];
  const set = (patch) => { form = fillSetup(data, { ...form, ...patch }); const y = box.parentElement.scrollTop; drawNewGame(); box.parentElement.scrollTop = y; };
  box.innerHTML = '';
  box.append(el('h3', { text: 'Game type' }));
  const types = el('div', { class: 'cards' });
  for (const [id, x] of Object.entries(G.types)) {
    const c = el('button', { class: 'card' + (id === f.type ? ' on' : ''), 'data-type': id }, el('b', { text: x.name }));
    c.addEventListener('click', () => set({ type: id, size: undefined }));
    types.append(c);
  }
  box.append(types, el('p', { class: 'tip', text: t.blurb }));
  box.append(el('h3', { text: 'Land' }));
  const lands = el('div', { class: 'cards' });
  const blurbs = { greenvale: 'Meadows, woods and a river.', pinewood: 'Snowy pine valleys.', dunesea: 'Hot dunes round a dry basin.', ashlands: 'A smoking volcano. Lava!', fenmoor: 'Wet marsh, glowcaps, bog gas.', isles: 'Little islands in the sea.', blank: 'Flat grass. Build anything.' };
  for (const id of t.lands || Object.keys(data.biomes.recipes)) {
    const c = el('button', { class: 'card' + (id === f.recipe ? ' on' : '') }, el('b', { text: data.biomes.recipes[id].name }), el('small', { text: blurbs[id] || '' }));
    c.addEventListener('click', () => set({ recipe: id }));
    lands.append(c);
  }
  box.append(lands);
  box.append(...seg('World size', f.size, (t.sizes || Object.keys(G.sizes)).map(k => [k, G.sizes[k].name]), (v) => set({ size: v })));
  if (t.opts.includes('events')) { box.append(...seg('Events', f.events, Object.entries(G.events).map(([k, e]) => [k, e.name]), (v) => set({ events: v })), el('p', { class: 'tip', text: G.events[f.events].blurb })); }
  if (t.opts.includes('difficulty')) box.append(...seg('Difficulty', f.difficulty, Object.entries(G.difficulty).map(([k, e]) => [k, e.name]), (v) => set({ difficulty: v })));
  if (t.opts.includes('length')) box.append(...seg('Length', f.length, Object.entries(G.length).map(([k, e]) => [k, e.name]), (v) => set({ length: v })));
  if (t.opts.includes('liquid')) box.append(...seg('What pours in', f.liquid, [['water', 'Water'], ['lava', 'Lava']], (v) => set({ liquid: v })));
  if (t.opts.includes('base')) {
    const opts = [['choose', 'I choose'], ['random', 'Pick for me']];
    if (f.type === 'sandbox') opts.push(['none', 'No base']);
    box.append(...seg('Your base', f.base, opts, (v) => set({ base: v })));
  }
  const tog = (key, text) => { const i = el('input', { type: 'checkbox' }); i.checked = !!f[key]; i.addEventListener('change', () => { form[key] = i.checked; }); return el('label', { class: 'toggle' }, i, text); };
  if (t.opts.includes('endless')) box.append(tog('endless', 'Endless mana'));
  if (t.opts.includes('everything')) box.append(tog('everything', 'Unlock everything here (try anything; your own unlocks are not changed)'));
  const name = el('input', { class: 'game-name', type: 'text', maxlength: 32, placeholder: 'Name (optional)', 'aria-label': 'Name this game', value: f.name });
  name.addEventListener('input', () => { form.name = name.value; });
  const start = el('button', { class: 'big go', id: 'start-custom', text: 'Begin' });
  start.addEventListener('click', () => {
    if (form.type === 'sandbox') { save.settings.endless = form.endless; save.settings.everything = form.everything; app.saveNow(); }
    startCustom({ ...form, seed: undefined });
  });
  box.append(name, start);
}

// ---------- upgrades (the Grimoire in code; renamed for players 2026-10-29; owner 2026-10-30: Spell levels first) ----------
let grimTab = 'upgrades';
for (const b of document.querySelectorAll('#grim-tabs button')) b.addEventListener('click', () => { grimTab = b.dataset.g; drawGrimoire(); });
function drawGrimoire() {
  for (const b of document.querySelectorAll('#grim-tabs button')) b.classList.toggle('on', b.dataset.g === grimTab);
  const box = $('#grim-body');
  box.innerHTML = '';
  const G = data.grimoire;
  if (grimTab === 'pages') {
    box.append(el('p', { class: 'tip', text: 'Spend Essence ✦ on new spells, elements and creatures. Each tier opens when you own enough unlocks from the one before.' }));
    const tiers = Math.max(...G.pages.map(p => p.tier));
    for (let t = 0; t <= tiers; t++) {
      const open = PR.tierOpen(save, G, t);
      const pages = el('div', { class: 'pages' });
      const ownedBox = el('div', { class: 'pages' });
      const inTier = G.pages.filter(q => q.tier === t);
      const notOwned = inTier.filter(q => !save.pages.includes(q.id)).sort((a, b) => (PR.pageRefusal(save, G, a.id) ? 1 : 0) - (PR.pageRefusal(save, G, b.id) ? 1 : 0) || a.cost - b.cost);
      for (const p of [...notOwned, ...inTier.filter(q => save.pages.includes(q.id))]) {
        const owned = save.pages.includes(p.id);
        const why = owned ? null : PR.pageRefusal(save, G, p.id);
        const info = pageInfo(data, p.id);
        const art = pageArt(data, p.id, 32);
        const b = el('button', { class: 'page' + (owned ? ' owned' : !open ? ' locked' : !why ? ' afford' : '') },
          el('div', { class: 'art', style: { backgroundImage: `url(${art})` } }),
          el('b', { text: info.name }),
          el('span', { class: 'price', text: owned ? '✓' : `${p.cost} ✦` }));
        b.addEventListener('click', () => {
          const body = [el('p', { text: info.desc || '' }), el('p', { class: 'tip', text: p.id.split(':')[0] === 'spell' ? `${data.spells.spells[info.id].cost} mana` : p.id.startsWith('creature:') ? `${data.species[info.id].cost} mana each` : `${p.mana ?? 0.2} mana a cell` })];
          const buttons = [];
          if (!owned) buttons.push({ label: why ? why : `Learn for ${p.cost} ✦`, cls: why ? 'big' : 'big go', onClick: () => { const r = PR.buyPage(save, G, p.id); if (r.ok) { toast(`Learned <b>${info.name}</b>`, 'disc'); sound('loot.epic', {}, 200); app.saveNow(); drawGrimoire(); } else { toast(r.reason, 'warn'); return false; } } });
          buttons.push({ label: 'Close', cls: 'small-btn' });
          modal({ title: info.name, body, buttons });
        });
        (owned ? ownedBox : pages).append(b);
      }
      const nOwned = ownedBox.children.length;
      const fold = nOwned ? el('details', { class: 'owned' }, el('summary', { text: `✓ ${nOwned} unlock${nOwned > 1 ? 's' : ''} you own` }), ownedBox) : null;
      const tierBox = el('div', { class: 'tier' }, el('h3', {}, `${G.tierNames[t]}`, el('small', { text: open ? `${notOwned.length} to learn` : `opens after ${G.opensAt[t]} ${G.tierNames[t - 1]} unlocks` })), notOwned.length ? pages : null, fold);
      if (notOwned.length && open) box.insertBefore(tierBox, box.querySelector('.tier.done') || null); else { tierBox.classList.add(notOwned.length ? 'later' : 'done'); box.append(tierBox); }
    }
  } else if (grimTab === 'upgrades') {
    box.append(el('p', { class: 'tip', text: 'Level up a spell you know: each level makes it 20% bigger and stronger.' }));
    for (const id of Object.keys(data.spells.spells)) {
      if (!save.pages.includes('spell:' + id)) continue;
      const d = data.spells.spells[id];
      const lv = save.spellLevels[id] || 0;
      const c = PR.upgradeCost(save, G, id);
      const btn = el('button', { text: c == null ? 'Max' : `${c} ✦`, disabled: c == null || save.essence < c });
      btn.addEventListener('click', () => { const r = PR.buyUpgrade(save, G, id); if (r.ok) { sound('levelup', {}, 100); app.saveNow(); drawGrimoire(); } else toast(r.reason, 'warn'); });
      box.append(el('div', { class: 'row-item' }, el('div', { class: 'art', style: { backgroundImage: `url(${pageArt(data, 'spell:' + id, 32)})` } }), el('div', { class: 'txt' }, el('b', { text: d.name }), el('span', { class: 'pips', text: '◆'.repeat(lv) + '◇'.repeat(G.upgrades.max - lv) })), btn));
    }
  } else if (grimTab === 'boons') {
    box.append(el('p', { class: 'tip', text: `Boosts grow your mana in every mode. Right now a challenge gives you ${Math.round(PR.challengeMana(save).manaScale * 100)}% of its mana pool and ${Math.round(PR.challengeMana(save).regenScale * 100)}% of its flow.` }));
    for (const [id, b] of Object.entries(G.boons)) {
      const lv = save.boons[id] || 0;
      const c = PR.boonCost(save, G, id);
      const btn = el('button', { text: c == null ? 'Max' : `${c} ✦`, disabled: c == null || save.essence < c });
      btn.addEventListener('click', () => { const r = PR.buyBoon(save, G, id); if (r.ok) { sound('levelup', {}, 100); app.saveNow(); drawGrimoire(); } else toast(r.reason, 'warn'); });
      box.append(el('div', { class: 'row-item' }, el('div', { class: 'art', style: picStyle({ manaCap: 'spell-barrier', manaRegen: 'spell-spring', faith: 'spell-heal', fertility: 'spell-growth' }[id]) }), el('div', { class: 'txt' }, el('b', { text: b.name }), el('small', { text: b.text }), el('span', { class: 'pips', text: '◆'.repeat(lv) + '◇'.repeat(b.cost.length - lv) })), btn));
    }
  } else {
    const all = Object.entries(data.discoveries.list);
    box.append(el('p', { class: 'tip', text: `${save.discoveries.length} of ${all.length} found. Each one pays Essence the first time you cause it.` }));
    for (const [id, d] of all) {
      const found = save.discoveries.includes(id);
      box.append(el('div', { class: 'row-item disc' + (found ? ' found' : ' hidden-one') }, el('div', { class: 'art', text: found ? '✦' : '?' }), el('div', { class: 'txt' }, el('b', { text: found ? d.name : '???' }), el('small', { text: found ? d.text : d.hint })), el('span', { class: 'pips', text: `${d.essence} ✦` })));
    }
  }
}

// ---------- settings, report ----------
app.settings = () => {
  const S = save.settings;
  const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: S.volume, style: { width: '100%' } });
  vol.addEventListener('input', () => { S.volume = +vol.value; setVolume(S.volume); app.saveNow(); });
  const q = el('div', { class: 'seg' }, ...['high', 'low'].map(v => { const b = el('button', { class: S.quality === v ? 'on' : '', text: v === 'high' ? 'Sharp' : 'Fast' }); b.addEventListener('click', () => { S.quality = v; stage.setQuality(v); app.saveNow(); q.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }); return b; }));
  const tog = (key, label) => { const i = el('input', { type: 'checkbox' }); i.checked = !!S[key]; i.addEventListener('change', () => { S[key] = i.checked; if (key === 'shake') stage.shakeOn = i.checked; if (key === 'perfHud') perfHud(i.checked); app.saveNow(); }); return el('label', { class: 'toggle' }, i, label); };
  const reset = el('button', { class: 'small-btn', text: 'Reset all progress' });
  reset.addEventListener('click', () => modal({ title: 'Reset everything?', body: ['Essence, unlocks, stars, discoveries and your saved games will be wiped.'], buttons: [{ label: 'Wipe it', cls: 'big', onClick: () => { for (const g of games()) ls.del(GAME_KEY(g.id)); ls.del(GAMES_KEY); ls.del(PR.SAVE_KEY); ls.del(REALM_KEY); leaving = true; location.reload(); } }, { label: 'Keep', cls: 'small-btn' }] }));
  modal({ title: 'Settings', body: [el('p', { text: 'Sound' }), vol, el('p', { text: 'Picture' }), q, tog('shake', 'Screen shake'), tog('tips', 'Show tips'), tog('perfHud', 'Show speed numbers'), reset], buttons: [{ label: 'Done', cls: 'big go' }] });
};

// ---------- speed readout (Settings → Show speed numbers) ----------
// fps and where each frame's time goes: sim (game rules), build (CPU picture), draw (sending it to
// the GPU), gpu (waiting for the GPU to finish — only measured while this is on). A slow phone tells
// us which of the four it is, and every bug report carries the same numbers.
let perfTimer = null;
function perfHud(on) {
  stage.diag = !!on;
  clearInterval(perfTimer); perfTimer = null;
  document.getElementById('perf-hud')?.remove();
  if (!on) return;
  const box = el('div', { id: 'perf-hud' });
  document.body.append(box);
  perfTimer = setInterval(() => {
    const r = stage.perfReport();
    box.textContent = `${r.fps} fps (slowest ${r.frameMs.worst ?? '-'} ms)\nsim ${r.ms.sim}  build ${r.ms.build}\ndraw ${r.ms.draw}  gpu ${r.ms.gpu}\n${r.canvas.join('x')} @${r.dpr}x  lights ${r.lights}\n${r.quality}${r.autoDropped ? ' (auto)' : ''}  ${r.creatures ?? 0} creatures`;
  }, 500);
}
if (save.settings.perfHud) setTimeout(() => perfHud(true), 0);

// Reports are sent at once: on the LAN to the dev server's inbox (tools/serve.py: POST /api/inbox/<name>),
// anywhere else to games.radgh.com's report inbox (rgs-api POST /api/report/kindlewild, read on the admin
// page; signing in is optional and only adds the account name). They also stay in localStorage and ride
// the cloud save. Unsent ones are retried at start-up.
const REPORT_LAN = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
const REPORT_URL = REPORT_LAN ? new URL('../../../api/inbox/kindlewild-report', import.meta.url) : 'https://games.radgh.com/api/report/kindlewild';
async function sendReports() {
  const list = JSON.parse(ls.get('kindlewild.reports') || '[]');
  let changed = false;
  for (const rep of list) {
    if (rep.sent) continue;
    try {
      const body = REPORT_LAN ? rep : { ...rep, kind: rep.kind || 'report', page: rep.level || rep.screen };
      const r = await fetch(REPORT_URL, { method: 'POST', credentials: REPORT_LAN ? 'same-origin' : 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) { rep.sent = true; changed = true; } else break;
    } catch { break; }
  }
  if (changed) ls.set('kindlewild.reports', JSON.stringify(list));
}
setTimeout(sendReports, 4000);

// The ! button, and "Tell us more" after rating a level (owner 2026-10-29: "a feedback button after liking or
// disliking, similar to Tumblefair"). `o.kind` 'feedback' + `o.rating` ({ level, vote, reasons }) ride along in the report.
app.report = (o = {}) => {
  const fb = o.kind === 'feedback';
  const text = el('textarea', { placeholder: fb ? 'What made it fun, or not? Anything you would change? (Plain words are perfect.)' : 'What went wrong, or what would you like? (Plain words are perfect.)' });
  // the picture and the speed numbers are taken NOW, before the window covers the world
  const shot = stage.capture(), perf = stage.perfReport();
  const was = play.s?.paused; if (play.s) play.s.paused = true;     // the game waits while you write
  modal({
    onClose: () => { if (play.s) play.s.paused = was; },
    title: o.title || 'Report a problem', body: [text, el('p', { class: 'tip', text: fb ? 'Your note and your rating are sent to the developer.' : 'Your note, a picture of the screen and a few details about the game (speed, level, device) are sent to the developer.' })],
    buttons: [{ label: 'Send', cls: 'big go', onClick: () => {
      if (fb && !text.value.trim()) return toast('Write a few words first.', 'bad');
      const rep = { at: new Date().toISOString(), kind: o.kind || 'report', rating: o.rating || null, text: text.value, screen: app.current?.kind || 'title', level: app.current?.level?.id || null, state: play.s?.state?.() || null, perf, audio: audioInfo(), ua: navigator.userAgent, size: [innerWidth, innerHeight], build: BUILD, shot: shot && shot.length < 180000 ? shot : null };
      const list = JSON.parse(ls.get('kindlewild.reports') || '[]');
      list.push(rep);
      while (JSON.stringify(list).length > 600000) list.shift();
      ls.set('kindlewild.reports', JSON.stringify(list));
      cloud?.saveSoon?.();
      sendReports();
      toast(fb ? 'Thank you — feedback sent.' : 'Thank you — report sent.', 'good');
    } }, { label: 'Cancel', cls: 'small-btn' }],
  });
};
const BUILD = '2026-10-30';

// ---------- game-eye (Claude's own test hook) ----------
window.gameEye = {
  state: () => ({ screen: SCREENS.find(s => !$('#' + s).classList.contains('hidden')) || (app.current ? 'game' : null), current: app.current ? { kind: app.current.kind, level: app.current.level?.id } : null, essence: save.essence, game: play.s?.state?.() || null, tool: play.page, tab: play.tab }),
  use: (page, x, y, o) => play.s?.use(page, x, y, o),
  select: (page) => play.select(page),
  startLevel: (id) => app.startLevel(id === 'trial' ? makeTrial(dayKey(), save.pages) : data.levels.acts.flatMap(a => a.levels).find(l => l.id === id)),
  sandbox: (recipe = 'greenvale') => startCustom({ type: 'sandbox', recipe, base: 'random', endless: true }),
  custom: (setup) => startCustom(setup),
  placeBase: () => { const at = play.s?.suggestBase(); if (at) play.pickBase(at); play.confirmBase(); },
  writeGame,
  step: (n = 30) => { for (let k = 0; k < n; k++) play.s?.step(); },
  save, app, audio: audioInfo,
};

// ---------- one account, several devices ----------
// Owner 2026-10-30: four acts done on the phone, the PC (signed in to the same account) showed a fresh start — the
// account copy was offered through a browser OK/Cancel box, where Cancel would even have copied the empty PC save
// over the phone's. Progress only grows, so this device's copy and the account's are COMBINED instead, with no
// question: the combined save is written here, uploaded, and the page reloads to read it.
function mergeWithAccount(q) {
  try {
    const theirs = q.cloud.save ? JSON.parse(q.cloud.save) : null;
    if (theirs) { const both = PR.mergeSaves(save, { ...PR.freshSave(data.grimoire), ...theirs }, data); ls.set(PR.SAVE_KEY, JSON.stringify(both)); }
    // the realm world goes with whichever copy has lived more days (mergeSaves picked the record the same way)
    const mine = save.realm?.day || 0, other = theirs?.realm?.day || 0;
    if (q.cloud.realm && (other > mine || !ls.get(REALM_KEY))) ls.set(REALM_KEY, q.cloud.realm);
    const reps = [...JSON.parse(ls.get('kindlewild.reports') || '[]'), ...JSON.parse(q.cloud.reports || '[]')];
    const seen = new Set();
    ls.set('kindlewild.reports', JSON.stringify(reps.filter(r => { const k = r.at + '|' + r.text; if (seen.has(k)) return false; seen.add(k); return true; }).sort((x, y) => (x.at < y.at ? -1 : 1))));
    merging = true;
    return 'local';
  } catch (e) { console.warn('could not combine saves:', e.message); return 'later'; }
}
if (ls.get('kindlewild.merged')) { ls.del('kindlewild.merged'); setTimeout(() => toast('Your progress from your account and this device are combined.', 'good', 5000), 800); }

// ---------- go ----------
(async () => {
  initAudio(save.settings.volume);
  try {
    const { cloudSave } = await import('../../../shared/rgs-cloudsave.js');
    cloud = cloudSave({ game: 'kindlewild', keys: { save: PR.SAVE_KEY, realm: REALM_KEY, reports: 'kindlewild.reports' }, onRestore: reloadFromStorage, canRestore: () => !app.current, onConflict: mergeWithAccount });
    cloud.onStatus((st) => { if (merging && st.state === 'saved') { merging = false; ls.set('kindlewild.merged', '1'); reloadFromStorage(); } });
    const { accountButton } = await import('../../../shared/rgs-signin.js');
    $('#account-slot').append(accountButton({ game: 'kindlewild', gameName: 'Kindlewild', onChange: () => cloud?.sync?.() }));
  } catch (e) { console.warn('accounts unavailable:', e.message); }
})();
startDemo();
screen('title');
refreshEssence();
document.getElementById('loading').remove();
