// The play-test-2 interface in one place (stream D-UI), so main.js only creates it, wires it and ticks it:
//   Q2 right-click menu + /follow · Q3 corpse loot · Q4 Need/Greed/Skip + the party loot threshold · Q5 pop-ups at the
//   top centre · Q6 one area banner · Q11 shops · Q13 portraits · Q14 trade · Q15 pause menu + settings · Q20/Q21 the
//   appearance editor (barber + title) · Q22 show equipment · Q24 the XP bar · Q25 class names.
//
//   const ui2 = createUi2({ ...main's pieces });  ui2.wire(net);  ui2.tick(dt);  ui2.pass() after view.render()
// window.tvui2 = test hooks (state of every window, fake server messages through the real handlers).

import { h } from '../ui-panel.js';
import { createBanner } from './banner.js';
import { createContextMenu } from './context-menu.js';
import { createLoot } from './loot.js';
import { createShop, SHOP_ROLES } from './shop.js';
import { createTrade } from './trade.js';
import { createSettings } from './settings.js';
import { createAppearanceEditor } from './appearance.js';
import { createPortraits } from './portraits.js';
import { send2 } from './net2.js';
import { LOOT_TIERS, DEFAULT_THRESHOLD, xpText, className, gearShown } from './pt2-core.js';
import { lookWith } from './appearance-core.js';

const LOOKS_KEY = 'tv.looks';
const lookStore = {
  all() { try { return JSON.parse(localStorage.getItem(LOOKS_KEY) || '{}') || {}; } catch { return {}; } },
  get(name) { return this.all()[String(name || '').toLowerCase()] || null; },
  set(name, look) { try { const a = this.all(); a[String(name).toLowerCase()] = look; localStorage.setItem(LOOKS_KEY, JSON.stringify(a)); } catch { /* private window */ } },
};

export function createUi2(o) {
  const { net, hud, actors, controls, me, chat, social, friends, bag, help, account, renderer, scene, setTarget, objects, worldUi, infoOf, avatarFor, createBody, defaultLook, races, raceNames, onLogout } = o;
  const banner = createBanner({ hud });

  // ---- Q5: pop-ups that ask you something sit at the top centre, in the same column as the banner (never under the menu bar)
  const pops = h('div.ask-pops', { 'aria-live': 'polite' });
  banner.stack.prepend(pops);
  const invite = document.getElementById('invite-pop');
  if (invite) pops.appendChild(invite);                    // the party invite (social.js still owns its buttons)
  const askPop = {
    show({ key, text, yes = 'Yes', no = 'No', ms = 0, onYes, onNo }) {
      askPop.drop(key);
      const done = (fn) => { el.remove(); clearTimeout(t); fn?.(); };
      const el = h('div.invite-pop.ask', { dataset: { key } }, h('span', {}, text), h('button.primary', { type: 'button', onclick: () => done(onYes) }, yes), h('button.ghost', { type: 'button', onclick: () => done(onNo) }, no));
      pops.appendChild(el);
      const t = ms ? setTimeout(() => done(onNo), ms) : 0;
      return el;
    },
    drop(prefix) { for (const e of [...pops.querySelectorAll('.ask')]) if (e.dataset.key?.startsWith(prefix)) e.remove(); },
  };

  // ---- Q15 / Q22 settings
  const settings = createSettings({ net, hud, help, onLogout, onGear: () => refreshSelfGear() });
  const gearFor = gear => gearShown(gear, { showGear: settings.get('showGear'), showHelm: settings.get('showHelm') });
  function refreshSelfGear() {
    const id = me()?.id, a = id != null ? actors.get(id) : null;
    const worn = net()?.joined?.you?.equipment || infoOf(id)?.gear || {};
    if (a) actors.setLook(id, { ...a.look, gear: gearFor(worn) });
  }

  // ---- Q3 / Q4
  const loot = createLoot({ net, hud, actors, me });
  // ---- Q11
  const shop = createShop({ net, hud, actors, me, bag });
  // ---- Q14
  const trade = createTrade({ net, hud, bag, settings, isFriend: n => friends.isFriend(n), askPop });

  // ---- Q2
  const menu = createContextMenu({ net, infoOf, hud, actors, controls, me, chat, social, friends, setTarget,
    onTalk: id => { net()?.use(id); }, onLoot: id => loot.open(id), isLootable: id => loot.isLootable(id),
    partyInfo: () => social.party, tradeAsk: (id, name) => trade.ask(id, name) });

  // ---- Q20 / Q21 appearance editor (the title one lives on the title screen, the barber one in the world)
  const ed = createAppearanceEditor({ parent: document.body, races, raceNames, avatarFor,
    onChange: look => o.onLookPreview?.(look, edMode),
    onCancel: look => o.onLookPreview?.(look, edMode),
    onSave: (look, mode) => {
      if (mode === 'barber') { send2.barber(net(), barberNpc, look); hud.toast('The barber gets to work…', 'info'); }
      else o.onLookSave?.(look);
    } });
  let edMode = 'title', barberNpc = null;
  function openEditor(mode, { look, avatar, npc = null, price = 0 } = {}) { edMode = mode; barberNpc = npc; return ed.open({ look, avatar, mode, price }); }

  // ---- Q13 portraits
  const portraits = createPortraits({ renderer, scene, avatarFor, createBody });
  const selfSlot = document.querySelector('#self-frame .uf-portrait');
  const targetSlot = document.querySelector('#target-frame .uf-portrait');
  if (selfSlot) portraits.live(selfSlot, () => { const id = me()?.id; return id != null ? actors.get(id) : null; });
  if (targetSlot) portraits.live(targetSlot, () => (o.targetId() != null ? actors.get(o.targetId()) : null), { kind: 'target' });
  /** A static portrait for someone not in view: their look if we have seen it, else the look their id gives. */
  function staticFor({ char, name, cls, look }) {
    const L = look || portraits.lookOf(char) || lookStore.get(name) || (char != null ? defaultLook(char, cls) : null);
    if (!L) return null;
    return portraits.img({ ...L, cls: L.cls || cls });
  }
  social.portraitFor = m => staticFor({ char: m.char, name: m.name, cls: m.cls, look: m.look });
  friends.portraitFor = f => staticFor({ char: f.char, name: f.name, cls: f.cls, look: f.look });
  account.portraitFor = c => staticFor({ char: c.id, name: c.name, cls: c.cls, look: c.look });
  portraits.onReady(() => { social.render?.(); friends.draw?.(); account.redrawChars?.(); });

  // ---- Q24 the XP bar on the HUD (number on hover) and in the character window
  const xpBar = h('div.xpbar', { id: 'xpbar', dataset: { tip: 'Experience' } }, h('i'), h('span'));
  document.getElementById('actionbar')?.before(xpBar);
  const invXp = h('div.inv-xp', { dataset: { tip: 'Experience' } }, h('i'), h('span'));
  document.querySelector('#bag .inv-body')?.before(invXp);
  // Q22: Show equipment / Show helm right in the character window too (the same settings)
  const gearBox = (k, label, tip) => h('label.inv-gearbox', { title: tip }, h('input', { type: 'checkbox', checked: settings.get(k), dataset: { k }, onchange: e => settings.set(k, e.target.checked) }), label);
  const gearRow = h('div.inv-gearrow', {}, gearBox('showGear', 'Show equipment', 'Off: you are drawn in plain clothes — everyone sees it. Weapons stay in your hands.'), gearBox('showHelm', 'Show helm', 'Off: your helm or hat is hidden so your face shows.'));
  document.querySelector('#bag .inv-doll')?.appendChild(gearRow);
  settings.on(k => { if (k === 'showGear' || k === 'showHelm') for (const i of gearRow.querySelectorAll('input')) i.checked = settings.get(i.dataset.k); });
  function setXp() {
    const s = o.self();
    const x = xpText(s.xp || 0, s.next || 100, s.level || 1);
    for (const el of [xpBar, invXp]) { el.querySelector('i').style.width = (x.frac * 100).toFixed(2) + '%'; el.querySelector('span').textContent = x.text; el.dataset.tip = x.tip; }
  }

  // ---- Q4 party loot threshold (leader only) in the Party tab
  function drawThreshold() {
    const pm = document.getElementById('party-menu'); if (!pm) return;
    let row = pm.querySelector('.loot-threshold');
    const p = social.party, mine = net()?.joined?.you?.char;
    if (!p) { row?.remove(); return; }
    if (!row) { row = h('div.row.loot-threshold'); const mem = pm.querySelector('.hub-members'); if (mem) mem.after(row); else pm.prepend(row); }
    const cur = p.lootMin || DEFAULT_THRESHOLD, lead = p.leader === mine;
    row.replaceChildren(h('label', { title: 'Items this rare or rarer from a party kill go to a Need / Greed / Skip roll; the rest is personal loot.' }, 'Loot rolls for ',
      h('select', { disabled: !lead, dataset: { k: 'lootMin' }, onchange: e => { send2.lootMin(net(), e.target.value); hud.chat(`Loot rolls now start at ${LOOT_TIERS.find(t => t.id === e.target.value)?.label.toLowerCase()}.`, 'party'); } },
        ...LOOT_TIERS.map(t => h('option', { value: t.id, selected: t.id === cur }, t.label)))),
      lead ? null : h('small.dim', {}, ' (the leader sets this)'));
  }

  worldUi.onBanner = b => banner.push(b);          // Q6: a vignette's lore is a place banner
  // ---- talking to town folk: a shop button / the barber's chair in the dialog
  worldUi.npcButtons = u => {
    const out = [];
    const role = String(u.role || '').toLowerCase();
    if (u.shop || SHOP_ROLES.has(role)) out.push({ text: role === 'stablehand' || role.startsWith('stable') ? 'See the mounts' : 'Browse wares', primary: true, on: () => { shop.open(u.id, u.name); } });
    if (u.barber || role === 'barber') out.push({ text: 'Sit in the chair', primary: true, on: () => { barber(u); } });
    return out;
  };
  function barber(u) {
    const id = me()?.id, a = id != null ? actors.get(id) : null;
    const look = a?.look ? { race: a.look.race, seed: a.look.seed, ...(a.look.avatar ? { avatar: a.look.avatar } : {}) } : null;
    openEditor('barber', { look, npc: u.id, price: u.price || 0 });
  }

  // ---- inputs main.js forwards
  function contextAt(id, x, y) { return menu.open(id, x, y); }

  function wire(n) {
    loot.wire(n); shop.wire(n); trade.wire(n); settings.wire(n); menu.wire(n);
    n.on('party', () => drawThreshold());
    n.on('joined', j => { setXp(); drawThreshold(); const look = infoOf(j.you.id)?.look; if (look && j.you.name) lookStore.set(j.you.name, look); });
    n.on('you', () => setXp());
    n.on('info', ents => { for (const i of ents) if (i.kind === 'player' && i.look) portraits.remember(i.char ?? i.id, { ...i.look, cls: i.cls }); });
    n.on('lookR', r => {
      if (!r.ok) { hud.toast(r.msg || 'The barber shakes his head.', 'warn'); o.onLookPreview?.(null, 'revert'); return; }
      hud.toast(r.cost ? `A new look — ${r.cost} gold.` : 'A new look.', 'good');
      if (r.look) { const id = me()?.id, a = id != null ? actors.get(id) : null; if (a) actors.setLook(id, { ...a.look, ...r.look, gear: a.look.gear }); if (me()?.name) lookStore.set(me().name, r.look); }
    });
    n.on('charList', m => account.redrawChars?.(m.chars));
  }
  function tick(dt) {
    menu.tick(); loot.tick(); shop.tick();
    if (o.self) { const s = o.self(); if (s.xp !== tick.xp || s.next !== tick.next || s.level !== tick.lv) { tick.xp = s.xp; tick.next = s.next; tick.lv = s.level; setXp(); } }
    return dt;
  }

  const api = {
    banner, menu, loot, shop, trade, settings, ed, portraits, askPop, wire, tick, pass: () => portraits.pass(),
    contextAt, gearFor, openEditor, lookStore, refreshSelfGear,
    /** E: a lootable corpse in reach first (true = used). */
    useKey: () => loot.useKey(),
    /** A left-click on a body: a lootable corpse opens (true = handled). */
    onPick(a) { if (a && a.dead && loot.isLootable(a.id)) { loot.open(a.id); return true; } return false; },
    /** Esc with nothing open and no target: the pause menu. */
    escape: () => settings.escape(),
    /** /follow, /tradewith from chat (true = it was ours). */
    command(cmd, arg) {
      if (cmd === 'follow') { menu.followCommand(arg, o.targetId()); return true; }
      if (cmd === 'unfollow' || cmd === 'stopfollow') { menu.stopFollow(true); return true; }
      if (cmd === 'tradewith' || cmd === 'twith') { const a = arg ? [...actors.actors.values()].find(x => x.kind === 'player' && x.name.toLowerCase() === arg.toLowerCase()) : actors.get(o.targetId()); if (a && a.kind === 'player') trade.ask(a.id, a.name); else hud.chat(arg ? `${arg} is not near enough to trade.` : 'Trade with whom? Target a player or type /tradewith Name.', 'bad'); return true; }
      if (cmd === 'settings' || cmd === 'options') { settings.panel.open(); return true; }
      return false;
    },
  };
  window.tvui2 = {
    state: () => ({ banner: banner.state, loot: loot.state, shop: shop.state, trade: trade.state, following: menu.following, menu: menu.isOpen, settings: settings.all(), pause: settings.pause.isOpen, editor: ed.isOpen ? ed.look : null, portraits: portraits.stats, pops: [...pops.children].filter(c => !c.hidden).map(c => c.textContent) }),
    fake: (ev, msg) => { const fns = fakeTaps.get(ev) || []; for (const fn of fns) fn(msg); return fns.length; },
    banner: b => banner.push(b), context: (id, x = 400, y = 300) => menu.open(id, x, y), follow: id => menu.follow(id), stopFollow: () => menu.stopFollow(true),
    openShop: (npc, name) => shop.open(npc, name), openLoot: id => loot.open(id), editor: (mode = 'barber') => (mode === 'barber' ? barber({ id: 0, name: 'Barber' }) : openEditor('title', { look: o.titleLook?.() })),
    pauseMenu: () => settings.escape(), staticPortrait: look => portraits.img(look),
  };
  // tvui2.fake: the same handlers a server message reaches (screenshots, specs)
  const fakeTaps = new Map();
  const wire0 = api.wire;
  api.wire = n0 => {
    const n = Object.create(n0);
    n.on = (ev, fn) => { (fakeTaps.get(ev) || fakeTaps.set(ev, []).get(ev)).push(fn); return n0.on(ev, fn); };
    wire0(n);
  };
  return api;
}
export { className, lookWith };
