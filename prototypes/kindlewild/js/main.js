// Kindlewild — boot, screens and the glue between them.
// Independent project by Radley Sustaire. Plan: docs/PLAN.md. Rules for agents: README.md.

import { loadData } from './game/data.js';
import { createSession, prepareData } from './game/session.js';
import { createRealm, saveRealm, loadRealm } from './game/realm.js';
import { makeTrial, dayKey } from './game/trials.js';
import * as PR from './game/progress.js';
import { createStage } from './ui/stage.js';
import { createPlay } from './ui/play.js';
import { el, $, modal, toast, show, anyModal } from './ui/ui.js';
import { pageInfo, pageArt, iconUrl } from './ui/icons.js';
const picStyle = (id) => { const u = iconUrl(data, id); return u ? { backgroundImage: `url(${u})` } : {}; };
import { initAudio, setVolume, wireSounds, play as sound } from './ui/audio.js';
import { createPad } from './ui/pad.js';
import { createWhatsNew } from '../../../shared/whats-new.js';
import { createCredits } from '../../../shared/credits.js';

const REALM_KEY = 'kindlewild.realm.v1';
const SCREENS = ['title', 'challenges', 'sandbox-setup', 'realm-setup', 'grimoire'];
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
app.saveNow = () => { PR.writeSave(save); cloud?.saveSoon?.(); refreshEssence(); };
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
setInterval(() => { if (app.current?.kind === 'realm' && play.s) writeRealm(); }, 60000);
addEventListener('visibilitychange', () => { if (document.hidden) { if (app.current?.kind === 'realm' && play.s) writeRealm(); PR.writeSave(save); } });

// ---------- screens ----------
function screen(id) {
  for (const s of SCREENS) show(s, s === id);
  if (id === 'challenges') drawChallenges();
  if (id === 'grimoire') drawGrimoire();
  if (id === 'sandbox-setup') drawSandboxSetup();
  if (id === 'realm-setup') drawRealmSetup();
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
$('#go-sandbox').addEventListener('click', () => screen('sandbox-setup'));
$('#go-realm').addEventListener('click', () => screen('realm-setup'));
$('#go-grimoire').addEventListener('click', () => screen('grimoire'));
$('#go-settings').addEventListener('click', () => app.settings());
$('#go-journal').addEventListener('click', () => {
  const st = save.stats;
  const mins = Math.round((st.playSecs || 0) / 60);
  const rows = [
    ['✦ Essence earned', save.essenceTotal], ['Grimoire pages', `${save.pages.length} / ${data.grimoire.pages.length}`],
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
  box.append(el('p', { class: 'tip', text: 'More acts are coming. Stars and first clears pay Essence — spend it in the Grimoire.' }));
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
  if (c.kind === 'realm') return;
  if (c.kind === 'sandbox') c.cfg = { ...c.cfg, seed: (Math.random() * 1e9) | 0 };
  begin(c.kind, c.cfg, c.level);
};
function begin(kind, cfg, level) {
  for (const s of SCREENS) show(s, false);
  stage.onFrame = null;
  const s = kind === 'realm' ? cfg.session : createSession(data, cfg);
  app.current = { kind, cfg, level };
  wireSounds(s.sim, (x) => Math.max(-1, Math.min(1, (x - stage.cam.x) / 60)));
  stage.controller = play;
  play.start(s, kind, level);
  pad.refocus();
}
app.quit = () => {
  closeModals();
  if (app.current?.kind === 'realm') writeRealm();
  app.current = null;
  play.stop();
  startDemo();
  screen('title');
};
app.exitTo = (id) => { app.quit(); screen(id); };
function closeModals() { for (const b of document.querySelectorAll('.modal-back')) b.remove(); }

// ---------- sandbox ----------
let sbLand = 'greenvale', sbSize = 'medium';
function drawSandboxSetup() {
  const box = $('#land-cards');
  box.innerHTML = '';
  const lands = { ...data.biomes.recipes };
  const blurbs = { greenvale: 'Meadows, woods and a river.', pinewood: 'Snowy pine valleys.', dunesea: 'Hot dunes round a dry basin.', ashlands: 'A smoking volcano. Lava!', fenmoor: 'Wet marsh, glowcaps, bog gas.', isles: 'Little islands in the sea.', blank: 'Flat grass. Build anything.' };
  for (const [id, r] of Object.entries(lands)) {
    const c = el('button', { class: 'card' + (id === sbLand ? ' on' : '') }, el('b', { text: r.name }), el('small', { text: blurbs[id] || '' }));
    c.addEventListener('click', () => { sbLand = id; drawSandboxSetup(); });
    box.append(c);
  }
  for (const b of document.querySelectorAll('#size-seg button')) { b.classList.toggle('on', b.dataset.v === sbSize); b.onclick = () => { sbSize = b.dataset.v; drawSandboxSetup(); }; }
  $('#endless').checked = save.settings.endless;
  $('#everything').checked = save.settings.everything;
}
$('#start-sandbox').addEventListener('click', () => {
  save.settings.endless = $('#endless').checked;
  save.settings.everything = $('#everything').checked;
  app.saveNow();
  const size = { small: [160, 160], medium: [224, 224], large: [288, 288] }[sbSize];
  const cfg = { mode: 'sandbox', recipe: sbLand, W: size[0], H: size[1], seed: (Math.random() * 1e9) | 0, endlessMana: save.settings.endless, everything: save.settings.everything, manaMax: Math.round(150 * PR.challengeMana(save).manaScale), manaRegen: +(3 * PR.challengeMana(save).regenScale).toFixed(2), unlocked: save.pages, spellLevels: save.spellLevels, discovered: save.discoveries, villages: sbLand === 'blank' ? false : undefined };
  begin('sandbox', cfg, null);
});

// ---------- realm ----------
function realmCfg() { return { mana: PR.realmMana(save, data.grimoire), unlocked: save.pages, spellLevels: save.spellLevels, discovered: save.discoveries }; }
function drawRealmSetup() {
  const box = $('#realm-body');
  box.innerHTML = '';
  const has = !!ls.get(REALM_KEY);
  box.append(el('p', { text: 'Your own realm, saved as you go. Its people pray to you: their faith speeds your mana and pays Essence. Omens come every few minutes — protect them and grow.' }));
  const m = PR.realmMana(save, data.grimoire);
  box.append(el('p', { class: 'tip', text: `Mana ${m.max} · regen ×${m.regenScale.toFixed(2)} · faith ×${m.faithScale.toFixed(2)} — grow these with Boons in the Grimoire.` }));
  if (has) {
    const info = save.realm || {};
    const b = el('button', { class: 'big go', text: `Continue${info.name ? ' — ' + info.name : ''}${info.day != null ? ` (day ${info.day + 1})` : ''}` });
    b.addEventListener('click', () => { try { const s = loadRealm(data, ls.get(REALM_KEY), realmCfg()); begin('realm', { session: s }, null); } catch (e) { console.error(e); toast('That realm could not be loaded: ' + e.message, 'warn'); } });
    box.append(b);
  }
  box.append(el('h3', { text: has ? 'Or start over in a new land' : 'Choose your land' }));
  const cards = el('div', { class: 'cards' });
  for (const id of ['greenvale', 'pinewood', 'isles', 'fenmoor', 'dunesea', 'ashlands']) {
    const r = data.biomes.recipes[id];
    const c = el('button', { class: 'card' }, el('b', { text: r.name }));
    c.addEventListener('click', () => {
      const go = () => {
        const s = createRealm(data, { ...realmCfg(), recipe: id, seed: (Math.random() * 1e9) | 0 });
        save.realm = { name: r.name, recipe: id, day: 0 };
        app.saveNow();
        begin('realm', { session: s, recipe: id }, null);
        writeRealm();
      };
      if (has) modal({ title: 'Start over?', body: ['Your current realm will be gone for good.'], buttons: [{ label: 'Yes, a new realm', cls: 'big go', onClick: go }, { label: 'Keep my realm', cls: 'small-btn' }] });
      else go();
    });
    cards.append(c);
  }
  box.append(cards);
}
function writeRealm() {
  const s = play.s;
  if (!s || !s.realm) return;
  const str = saveRealm(s, { recipe: save.realm?.recipe || 'greenvale' });
  if (!ls.set(REALM_KEY, str)) toast('Could not save the realm (storage full?)', 'warn');
  save.realm = { ...(save.realm || {}), day: s.realm.day };
  PR.writeSave(save);
}

// ---------- grimoire ----------
let grimTab = 'pages';
for (const b of document.querySelectorAll('#grim-tabs button')) b.addEventListener('click', () => { grimTab = b.dataset.g; drawGrimoire(); });
function drawGrimoire() {
  for (const b of document.querySelectorAll('#grim-tabs button')) b.classList.toggle('on', b.dataset.g === grimTab);
  const box = $('#grim-body');
  box.innerHTML = '';
  const G = data.grimoire;
  if (grimTab === 'pages') {
    box.append(el('p', { class: 'tip', text: 'Spend Essence ✦ on new spells, elements and creatures. Each tier opens when you own enough pages of the one before.' }));
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
      const fold = nOwned ? el('details', { class: 'owned' }, el('summary', { text: `✓ ${nOwned} page${nOwned > 1 ? 's' : ''} you own` }), ownedBox) : null;
      const tierBox = el('div', { class: 'tier' }, el('h3', {}, `${G.tierNames[t]}`, el('small', { text: open ? `${notOwned.length} to learn` : `opens after ${G.opensAt[t]} ${G.tierNames[t - 1]} pages` })), notOwned.length ? pages : null, fold);
      if (notOwned.length && open) box.insertBefore(tierBox, box.querySelector('.tier.done') || null); else { tierBox.classList.add(notOwned.length ? 'later' : 'done'); box.append(tierBox); }
    }
  } else if (grimTab === 'upgrades') {
    box.append(el('p', { class: 'tip', text: 'Empower a spell you know: each level makes it 20% bigger and stronger.' }));
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
    box.append(el('p', { class: 'tip', text: `Boons grow your mana in every mode. Right now a challenge gives you ${Math.round(PR.challengeMana(save).manaScale * 100)}% of its mana pool and ${Math.round(PR.challengeMana(save).regenScale * 100)}% of its flow.` }));
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
  reset.addEventListener('click', () => modal({ title: 'Reset everything?', body: ['Essence, pages, stars, discoveries and your realm will be wiped.'], buttons: [{ label: 'Wipe it', cls: 'big', onClick: () => { ls.del(PR.SAVE_KEY); ls.del(REALM_KEY); location.reload(); } }, { label: 'Keep', cls: 'small-btn' }] }));
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

// Reports go to the LAN server's inbox at once (served by tools/serve.py: POST /api/inbox/<name>), so
// Claude can read them without the player signing in; they also stay in localStorage and ride the
// cloud save. Unsent ones are retried at start-up.
async function sendReports() {
  const list = JSON.parse(ls.get('kindlewild.reports') || '[]');
  let changed = false;
  for (const rep of list) {
    if (rep.sent) continue;
    try {
      const r = await fetch(new URL('../../../api/inbox/kindlewild-report', import.meta.url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rep) });
      if (r.ok) { rep.sent = true; changed = true; } else break;
    } catch { break; }
  }
  if (changed) ls.set('kindlewild.reports', JSON.stringify(list));
}
setTimeout(sendReports, 4000);

app.report = () => {
  const text = el('textarea', { placeholder: 'What went wrong, or what would you like? (Plain words are perfect.)' });
  // the picture and the speed numbers are taken NOW, before the window covers the world
  const shot = stage.capture(), perf = stage.perfReport();
  const was = play.s?.paused; if (play.s) play.s.paused = true;     // the game waits while you write
  modal({
    onClose: () => { if (play.s) play.s.paused = was; },
    title: 'Report a problem', body: [text, el('p', { class: 'tip', text: 'Your note, a picture of the screen and a few details about the game are saved and sent with your next cloud save.' })],
    buttons: [{ label: 'Send', cls: 'big go', onClick: () => {
      const rep = { at: new Date().toISOString(), text: text.value, screen: app.current?.kind || 'title', level: app.current?.level?.id || null, state: play.s?.state?.() || null, perf, ua: navigator.userAgent, size: [innerWidth, innerHeight], build: BUILD, shot: shot && shot.length < 180000 ? shot : null };
      const list = JSON.parse(ls.get('kindlewild.reports') || '[]');
      list.push(rep);
      while (JSON.stringify(list).length > 600000) list.shift();
      ls.set('kindlewild.reports', JSON.stringify(list));
      cloud?.saveSoon?.();
      sendReports();
      toast('Thank you — report sent.', 'good');
    } }, { label: 'Cancel', cls: 'small-btn' }],
  });
};
const BUILD = '2026-10-29';

// ---------- game-eye (Claude's own test hook) ----------
window.gameEye = {
  state: () => ({ screen: SCREENS.find(s => !$('#' + s).classList.contains('hidden')) || (app.current ? 'game' : null), current: app.current ? { kind: app.current.kind, level: app.current.level?.id } : null, essence: save.essence, game: play.s?.state?.() || null, tool: play.page, tab: play.tab }),
  use: (page, x, y, o) => play.s?.use(page, x, y, o),
  select: (page) => play.select(page),
  startLevel: (id) => app.startLevel(id === 'trial' ? makeTrial(dayKey(), save.pages) : data.levels.acts.flatMap(a => a.levels).find(l => l.id === id)),
  sandbox: (recipe = 'greenvale') => { sbLand = recipe; $('#start-sandbox').click(); },
  step: (n = 30) => { for (let k = 0; k < n; k++) play.s?.step(); },
  save, app,
};

// ---------- go ----------
(async () => {
  initAudio(save.settings.volume);
  try {
    const { cloudSave } = await import('../../../shared/rgs-cloudsave.js');
    cloud = cloudSave({ game: 'kindlewild', keys: { save: PR.SAVE_KEY, realm: REALM_KEY, reports: 'kindlewild.reports' }, onRestore: () => location.reload(), canRestore: () => !app.current });
    const { accountButton } = await import('../../../shared/rgs-signin.js');
    $('#account-slot').append(accountButton({ game: 'kindlewild', gameName: 'Kindlewild', onChange: () => cloud?.sync?.() }));
  } catch (e) { console.warn('accounts unavailable:', e.message); }
})();
startDemo();
screen('title');
refreshEssence();
document.getElementById('loading').remove();
