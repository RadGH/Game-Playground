// W9 professions — the interface's controller: one object that hears the profession messages and runs the flows.
//
//   gather   E on a node / a skinnable corpse (or a gathering tool used from the bag)
//              -> net.gather('start', {id}) -> gatherR {game} -> the mini-game -> net.gather('done', {id, inputs})
//              -> gatherDone {quality, got, skill, reopenMs} -> the result card; the node is bare for YOU until it reopens
//   craft    a craftsman's "Use the forge" (or the journal's Recipes button) -> the crafting window (prof-craft.js)
//              -> Make -> net.craft('start') -> craftR {game} -> the mini-game -> net.craft('done') -> craftDone -> the card
//   learn    an NPC whose `used` reply carries `prof {trains, stations, known}` -> a small window: Learn (free), buy the
//              tool again, open the station
//   skills   the Professions block of the Character menu and a page of the journal (prof-skills.js)
//
// The server's messages and their fields: docs/requests.md "Round 8 contracts — P-core". The 3D side (nodes, tools in
// hand, stations) is js/client/prof-view.js; this file tells it which nodes are spent and which corpses can be skinned.
//
//   const prof = createProf({ net, hud, bag, sheet, journal })      prof.wire(net)      prof.setView(profView)
//   window.tvprof = test hooks (specs, the gallery): demo(type, opts), state, mini, craft

import { createPanel, h } from '../ui-panel.js';
import { fmt } from '../../../../../shared/format.js';
import { createMinigame } from './prof-minigame.js';
import { createCraftWindow } from './prof-craft.js';
import { professionRows, teachersOf } from './prof-skills.js';
import { makeGame, GAME_OF, QUALITY_WORD } from './prof-games.js';
import { profIcon, PROF_NAME, PROF_TINT } from './prof-icons.js';
import { createProfSound } from '../prof-sound.js';

const WHY = { far: 'Too far away.', spent: 'There is nothing left here for now.', combat: 'Not while you are fighting.', dead: 'You are dead.', swim: 'Not while you are swimming.', bagFull: 'Your bag is full.', busy: 'You are busy.', unknown: 'Nothing to work here.' };
const STOPPED = { moved: 'You stepped away and stopped working.', move: 'You stepped away and stopped working.', hit: 'You stop — you are under attack!', swim: 'You stop working.', dead: null, left: null, stopped: null, restart: null, done: null, fail: null };
const VERB = { mining: 'Mine', logging: 'Fell', foraging: 'Gather', skinning: 'Skin', smithing: 'Forge', outfitting: 'Stitch', alchemy: 'Brew', cooking: 'Cook', tempering: 'Temper' };
const STATION_WORD = { smithing: 'the forge', tempering: 'the tempering bench', outfitting: 'the workbench', alchemy: 'the still', cooking: 'the fire' };

function injectCss() {
  if (typeof document === 'undefined' || document.querySelector('link[href$="css/prof.css"]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../../css/prof.css', import.meta.url).href; document.head.appendChild(l);
}
const load = path => fetch(new URL(path, import.meta.url)).then(r => (r.ok ? r.json() : null)).catch(() => null);

export function createProf({ net, hud, bag = null, sheet = null, journal = null, sound = createProfSound() } = {}) {
  injectCss();
  const S = { list: [], opened: new Map(), skins: new Map(), work: null, numbers: null, content: null, view: null, joinAt: 0, lastNpc: null };
  const words = () => S.numbers?.quality?.name || QUALITY_WORD;
  const mini = createMinigame({ sound, words });
  const dataP = Promise.all([load('../../../data/rules/professions.json'), load('../../../data/provinces/professions.json')]).then(([n, c]) => { S.numbers = n; S.content = c; redraw(); return { numbers: n, content: c }; });
  const rowOf = id => S.list.find(r => r.id === id) || null;
  const tintOf = (prof, kind) => S.content?.nodeKinds?.[kind]?.look?.tint || PROF_TINT[prof];
  const send = (what, op, a = {}) => { const n = net(); if (!n?.joined || typeof n[what] !== 'function') return false; n[what](op, a); return true; };

  // ---- the Professions list (Character menu block, journal page) ---------------------------------------------
  const drawers = [];
  function redraw() { try { sheet?.refresh?.(); } catch { /* not open */ } try { journal?.redraw?.(); } catch { /* not built yet */ } }
  function mount(sh = sheet, jr = journal) {
    if (sh?.addSection && !mount.sheet) { mount.sheet = sh; sheet = sh; drawers.push(sh.addSection('professions', 'Professions', () => professionRows(S.list, { numbers: S.numbers, content: S.content, compact: true }), { tip: 'Ten trades. Every character can learn them all. The journal has the full page.' })); }
    if (jr?.addTab && !mount.journal) { mount.journal = jr; journal = jr; drawers.push(jr.addTab('professions', 'Professions', () => [h('p.tiny-left', {}, 'Ten trades, and every character can learn them all. Gathering is done out in the world; making at a craftsman’s building in town. Each piece of work is a few seconds of skill — how well you play it decides how good the result is.'), ...professionRows(S.list, { numbers: S.numbers, content: S.content, onOpen: id => craft.open({ tab: id }) })])); }
  }
  mount();

  // ---- the mini-game: one flow for gathering and for making --------------------------------------------------
  async function play(kind, m, extra = {}) {
    const token = {}; S.work = { kind, id: m.id, token, ...extra };
    craft.setBusy(true);
    const prof = m.prof || extra.prof || Object.keys(GAME_OF).find(p => GAME_OF[p] === m.game?.type);
    const res = await mini.play({ game: m.game, prof, mins: S.numbers?.quality?.min, tint: extra.tint || PROF_TINT[prof], title: extra.title, sub: extra.sub || PROF_NAME[prof] });
    if (S.work?.token !== token) return;                                  // something newer took over
    if (!res) { S.work = null; craft.setBusy(false); send(kind, 'stop'); return; }
    S.work.sent = true;
    if (!send(kind, 'done', { id: m.id, inputs: res.inputs })) { S.work = null; craft.setBusy(false); mini.showResult({ quality: res.quality, note: 'Not connected — nothing was made.' }); }
  }
  function refused(m, fallback) {
    const msg = m.msg || WHY[m.why] || fallback;
    if (m.why === 'tool') hud.toast(msg || 'You need the right tool in your bag.', 'warn');
    else if (m.why === 'notLearned') hud.toast(msg || 'You have not learned that trade.', 'warn');
    else if (msg) hud.toast(msg, 'warn');
  }
  function stopped(m) {
    if (mini.isOpen && mini.run && !mini.run.done) { mini.cancel(); const t = m.why in STOPPED ? STOPPED[m.why] : m.msg; if (t) hud.toast(t, 'info'); }
    S.work = null; craft.setBusy(false);
  }
  const gotItems = m => (m.got || []).map(g => ({ name: g.name, count: g.n, rarity: g.rarity && g.rarity !== 'normal' ? g.rarity : null, tint: g.tint, bonus: !!g.bonus }));
  function skillLines(m, prof) {
    const out = [], s = m.skill;
    if (s?.up) out.push(`${PROF_NAME[prof] || 'Skill'} is now ${s.level}`);
    else if (m.xp > 0 && s && s.next) out.push(`${PROF_NAME[prof] || 'Skill'} ${s.level} — ${fmt(s.next, { decimals: 0 })} more to ${s.level + 1}`);
    return out;
  }

  function gather(id = null) {
    if (mini.isOpen && mini.run && !mini.run.done) return false;
    return send('gather', 'start', id != null ? { id } : {});
  }
  function onGatherR(m) {
    if (!m.ok) { if (m.state === 'idle' && S.work?.kind === 'gather') stopped(m); refused(m, 'You cannot work that.'); return; }
    if (m.state !== 'play' || !m.game) { if (m.state === 'idle') stopped(m); return; }
    play('gather', m, { prof: m.prof, title: m.node?.name || null, sub: `${PROF_NAME[m.prof] || ''}${m.node?.tier ? ' · tier ' + m.node.tier : ''}`, tint: tintOf(m.prof, m.node?.kind) });
  }
  function onGatherDone(m) {
    S.work = null; craft.setBusy(false);
    if (m.key && m.ok && m.reopenMs > 0) { S.opened.set(m.key, Date.now() + m.reopenMs); S.view?.setSpent(m.key, Date.now() + m.reopenMs); }
    const items = gotItems(m);
    mini.showResult({ quality: m.quality, items, lines: skillLines(m, m.prof), note: m.ok ? (m.reopenMs > 0 ? `Back in about ${Math.max(1, Math.round(m.reopenMs / 60000))} min` : null) : (m.msg || 'Nothing. It is still there: try again.'), stay: m.ok ? 3200 : 2600 });
    if (m.ok && items.length) hud.chat?.(`${words()[m.quality] || ''} work: ${items.map(i => `${i.count} ${i.name}`).join(', ')}.`, 'loot');
    if (m.skill?.up) hud.toast(`${PROF_NAME[m.prof]} ${m.skill.level}`, 'good');
  }

  // ---- making ------------------------------------------------------------------------------------------------
  const craft = createCraftWindow({ net, hud, bag, numbers: () => S.numbers,
    onMake(r, { base, npc }) { S.pending = { title: r.name, prof: r.prof }; send('craft', 'start', { id: r.id, ...(base ? { base } : {}), ...(npc != null ? { npc } : {}) }); },
    onTemper(op, a, item) { S.pending = { title: `${op.name}: ${item.name}`, prof: 'tempering' }; send('craft', 'start', { id: op.id, ...a }); } });
  function onCraftR(m) {
    if (!m.ok) { if (S.work?.kind === 'craft') stopped(m); refused(m, 'You cannot make that.'); craft.setBusy(false); return; }
    if (m.state !== 'play' || !m.game) { if (m.state === 'idle') stopped(m); return; }
    const p = S.pending || {}; S.pending = null;
    play('craft', m, { prof: p.prof, title: p.title, sub: m.text || PROF_NAME[p.prof] });
  }
  function onCraftDone(m) {
    S.work = null; craft.setBusy(false);
    const made = (m.items || []).filter(it => it && it.name), gear = made.find(it => it.crafted || it.slot);
    const items = gear ? [{ name: gear.name, count: 1, rarity: gear.rarity || 'normal' }] : gotItems(m);
    const tempered = m.item ? [{ name: m.item.name, count: 1, rarity: m.item.rarity || 'normal' }] : [];
    mini.showResult({ quality: m.quality, items: items.length ? items : tempered, lines: [...(m.item && m.msg ? [m.msg] : []), ...skillLines(m, m.prof)], note: m.ok ? (gear ? 'It is in your bag.' : null) : (m.msg || 'Nothing was made.'), stay: gear || m.item ? 4200 : 3000 });
    if (m.item) craft.onTempered(m);
    if (m.ok && (items.length || tempered.length)) hud.chat?.(m.msg || `You made ${items.map(i => i.name).join(', ')}.`, 'loot' + (gear?.rarity ? ' rarity-' + gear.rarity : ''));
    if (m.skill?.up) hud.toast(`${PROF_NAME[m.prof]} ${m.skill.level}`, 'good');
  }

  // ---- a craftsman: learn, buy the tool again, use the station -----------------------------------------------
  const T = { npc: null, name: '', prof: null, busy: null };
  const trainer = createPanel({ id: 'trade', title: 'Trades', width: 360, cls: 'trade-panel' });
  function drawTrainer() {
    if (!trainer.isOpen || !T.prof) return;
    trainer.setTitle(T.name || 'Trades', 'Teaches for nothing');
    const known = new Set([...(T.prof.known || []), ...S.list.filter(r => r.known).map(r => r.id)]);
    const stations = (T.prof.stations || []).filter(id => id !== 'cooking' || true);
    trainer.fill(
      (T.prof.trains || []).length ? h('ul.tr-list', {}, ...(T.prof.trains || []).map(id => {
        const row = rowOf(id), has = known.has(id), needsTool = row?.kind === 'gather' && id !== 'angling', blurb = (S.numbers?.professions || []).find(p => p.id === id)?.blurb;
        return h('li.tr-row', { style: `--pt:${PROF_TINT[id]}` }, h('i.pk-ico', {}, profIcon(id, 22)),
          h('div.tr-main', {}, h('b', {}, PROF_NAME[id] || id), has ? h('small', {}, row ? `You know this — ${row.rank || ''} ${row.level}` : 'You know this.') : blurb ? h('small', {}, blurb) : null,
            has && needsTool && row && !row.tool ? h('small.pc-why', {}, 'You have no tool for it in your bag.') : null),
          !has ? h('button.primary.small', { type: 'button', disabled: T.busy === id, dataset: { learn: id }, onclick: () => { T.busy = id; send('prof', 'learn', { id, npc: T.npc }); drawTrainer(); } }, 'Learn')
            : needsTool && row && !row.tool ? h('button.ghost.small', { type: 'button', disabled: T.busy === id, dataset: { tool: id }, onclick: () => { T.busy = id; send('prof', 'tool', { id, npc: T.npc }); drawTrainer(); } }, `Buy the tool (${fmt(T.prof.toolPrice || 0, { decimals: 0 })} gold)`) : null);
      })) : null,
      stations.length ? h('div.tr-stations', {}, ...[...new Set(stations.map(id => (id === 'tempering' ? 'smithing' : id)))].map(id =>
        h('button.primary.wide', { type: 'button', dataset: { station: id }, onclick: () => { trainer.close(); craft.open({ npc: T.npc, tab: id }); } }, `Use ${STATION_WORD[id] || 'the station'}`))) : null,
      !(T.prof.trains || []).length && !stations.length ? h('p.empty', {}, 'Nothing to learn here.') : null);
  }
  function onUsed(u) {
    if (!u || !u.ok || !u.prof) return;
    T.npc = u.id ?? u.npc ?? null; T.name = u.name || u.who || 'Trades'; T.prof = u.prof; T.busy = null; S.lastNpc = T.npc;
    for (const id of u.prof.taught || []) hud.toast(`You have learned ${PROF_NAME[id] || id}.`, 'good');
    // nothing left to do here (he taught it as he spoke, you have the tool, he has no station): no window at all
    const known = new Set([...(u.prof.known || []), ...(u.prof.taught || [])]);
    const todo = (u.prof.trains || []).some(id => !known.has(id) || (rowOf(id)?.kind === 'gather' && id !== 'angling' && rowOf(id) && !rowOf(id).tool && !(u.prof.taught || []).includes(id)));
    if (!todo && !(u.prof.stations || []).length) return;
    // the craftsman's own dialog (quests, his shop) is usually up as well: put our doors IN it rather than a window over it.
    // The dialog is drawn by another handler of this same message — give it a moment before deciding it is not coming.
    const expectDialog = !!(u.says || u.offers || u.shop || u.kind === 'npc'), t0 = performance.now();
    const place = () => {
      if (T.npc !== (u.id ?? u.npc ?? null)) return;
      const dlg = [...document.querySelectorAll('.tv-dialog')].find(d => !d.hidden && d.getClientRects().length), foot = dlg?.querySelector('footer');
      if (!foot) { if (expectDialog && performance.now() - t0 < 700) { setTimeout(place, 60); return; } api.showTrainer(); return; }
      foot.querySelectorAll('.prof-dlg').forEach(b => b.remove());
      const add = (text, fn) => { const b = h('button.ghost.prof-dlg', { type: 'button', onclick: () => { dlg.hidden = true; fn(); } }, text); foot.prepend(b); };
      const st = [...new Set((u.prof.stations || []).map(id => (id === 'tempering' ? 'smithing' : id)))];
      for (const id of st.reverse()) add(`Use ${STATION_WORD[id] || 'the station'}`, () => craft.open({ npc: T.npc, tab: id }));
      const fresh = (u.prof.trains || []).filter(id => !known.has(id));
      if (todo) add(fresh.length ? `Learn: ${fresh.map(id => PROF_NAME[id]).join(', ')}` : 'Trades', () => api.showTrainer());
    };
    setTimeout(place, 60);
  }
  function onProfR(m) {
    T.busy = null;
    if (!m.ok) hud.toast(m.msg || 'That did not work.', 'warn');
    else { if (m.op === 'learn') hud.toast(m.msg || `You have learned ${PROF_NAME[m.id] || m.id}.`, 'good'); if (m.tool?.name) hud.toast(`${m.tool.name} is in your bag. It takes no slot.`, 'info'); if (T.prof && m.op === 'learn') T.prof.known = [...new Set([...(T.prof.known || []), m.id])]; }
    drawTrainer();
  }

  // ---- what the server says about you ------------------------------------------------------------------------
  function setList(p) { if (p && Array.isArray(p.list)) { S.list = p.list; redraw(); drawTrainer(); } }
  function setOpened(keys) {
    // the join list has the keys but not when each reopens: hold a node bare for the longest it could take
    const N = S.numbers?.gather, hold = ((N?.respawnMin?.[1]) || 10) * 60000, now = Date.now();
    for (const k of keys || []) if (String(k).startsWith('node:') && !S.opened.has(k)) S.opened.set(k, now + hold);
    S.view?.setSpentAll(S.opened);
  }
  function wire(n) {
    n.on('joined', j => { S.joinAt = Date.now(); S.skins.clear(); S.view?.clearSkins?.(); setList(j.you?.professions); const o = j.you?.opened; setOpened(Array.isArray(o) ? o : Object.keys(o || {})); if (S.work) { mini.cancel(); S.work = null; craft.setBusy(false); } mount(); });
    n.on('you', p => { if (p.professions) setList(p.professions); });
    n.on('sheet', s => { if (s?.professions) setList(s.professions); });
    n.on('gatherR', onGatherR); n.on('gatherDone', onGatherDone);
    n.on('craftList', m => craft.onList(m)); n.on('craftR', onCraftR); n.on('craftDone', onCraftDone); n.on('craftQuote', m => craft.onQuote(m));
    n.on('profR', onProfR);
    n.on('skinnable', m => { if (m.on) S.skins.set(m.id, m); else S.skins.delete(m.id); S.view?.setSkinnable(m.id, !!m.on, m); });
    n.on('used', onUsed);
    n.on('bag', () => craft.onBag());
  }

  const api = {
    wire, mini, craft, trainer, sound, gather, mount, data: dataP,
    setView(v) { S.view = v; v?.setSpentAll?.(S.opened); for (const [id, m] of S.skins) v?.setSkinnable(id, true, m); },
    /** Open the crafting window (`prof` = the tab; `npc` = the craftsman's entity). */
    open(profId = null, npc = S.lastNpc) { craft.open({ npc, tab: profId }); },
    skills: () => S.list,
    /** The craftsman's window for the NPC talked to last. */
    showTrainer() { if (T.prof) { trainer.open(); drawTrainer(); } },
    isSpent: key => (S.opened.get(key) || 0) > Date.now(),
    verb: prof => VERB[prof] || 'Work',
    /** Play a mini-game with no server (the gallery, specs): demo('strike', { seed, ease }) -> the result. */
    async demo(type, { seed = 7, ease = 0, prof = null, title = null, sub = null, tint = null } = {}) {
      await dataP;
      const t = GAME_OF[type] || type, game = makeGame(t, { seed, ease, base: S.numbers?.games?.[t], ...(type === 'cooking' ? { steps: 1 } : {}) });
      const res = await mini.play({ game, prof: prof || (GAME_OF[type] ? type : null), mins: S.numbers?.quality?.min, title, sub, tint });
      if (res) setTimeout(() => mini.showResult({ quality: res.quality, lines: ['A practice round — nothing was made.'], stay: 2600 }), 250);
      return res;
    },
    get state() { return { list: S.list, opened: [...S.opened.keys()], skins: [...S.skins.keys()], work: S.work ? { kind: S.work.kind, id: S.work.id, sent: !!S.work.sent } : null, mini: mini.state, craft: craft.state, trainer: { open: trainer.isOpen, npc: T.npc }, ready: !!S.numbers }; },
    _test: { onGatherR, onGatherDone, onCraftR, onCraftDone, onUsed, onProfR, setList, teachersOf },
  };
  if (typeof window !== 'undefined') window.tvprof = api;
  return api;
}
