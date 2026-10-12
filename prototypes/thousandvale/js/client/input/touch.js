// Input layer (T26) — the phone layout's touch controls. A PROPOSAL: this module is only loaded when
// <html data-layout="phone"> is set, and only input/layout.js (the game) or the gallery's frame may set that.
//
// What it adds (css/layout-phone.css places everything; this file only makes the controls work):
//   · a floating thumb stick, left          -> controls.setAnalog (a full push runs, part-way walks — W20)
//   · Jump / Target / Ally / Belt buttons   -> the same actions the keyboard has (input/bindings.js), as their default keys
//   · the Belt: tap = potion slot 1, hold = a small wheel of all four consumable slots under your thumb
//   · the quick-wheel button (every window)  and a chat bubble (the chat folds away while you fight)
//   · a tab bar while a window is open (windows become full-screen sheets; one tap moves between them)
//   · tap-and-hold on anything that has a card (tooltip) opens it as a sheet — nothing on a phone needs a hover
//   · a tap on an item in the bag opens its card as a sheet with big buttons (wear / other hand / throw away)
//   · pinch on the world = zoom (the wheel the camera already listens for)
// The skill buttons themselves are NOT made here: they are the game's own action-bar slots (#actionbar .slot), moved
// into the thumb's arc by the stylesheet — same cooldown sweep, same card, same click.
//   · play-test 10 (G2): a Mount button and a Fish button of their own (Y34: the Belt's bottle was taken for a "drink"
//     button — its first slot held the fishing rod); the Attack button's lit ring while auto-attack is on (Y35); a label on
//     a long press of any control and a "What do these buttons do?" overlay, both read from TOUCH_CONTROLS in
//     input/bindings.js; hold a party portrait = Track (Y36)
import { ACTION_BY_ID, TOUCH_CONTROLS } from './bindings.js';
import { actionKey, keyDown, keyUp } from './emit.js';
import { device } from './device.js';
import { waterInReach } from './water-reach.js';

const HOLD_MS = 380;
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  jump: svg('<path d="M12 19V6"/><path d="m6 11 6-6 6 6"/><path d="M5 21h14"/>'),
  target: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.5"/>'),
  ally: svg('<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z"/><path d="M12 9v5M9.5 11.5h5"/>'),
  belt: svg('<path d="M9 3h6v3l2 3v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l2-3Z"/><path d="M7 13h10"/>'),
  wheel: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M12 14.5V21M3 12h6.5M14.5 12H21"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  hook: svg('<path d="M12 3v11a4 4 0 0 1-8 0v-2"/><path d="m2 14 2-2 2 2"/><circle cx="12" cy="3" r="1"/>'),
  // Y34: a rod with its line and a fish on it (the same drawing idea as the desktop's cast button), and a horse's head
  fish: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 28 21 4"/><path d="M21 4q6 1 5 9"/><path d="M26 13v4"/><path d="M7.5 23.5l3 2.2" stroke-width="3.2"/><path d="M11 23c3.4-4.6 9-4.6 12.4-1.2L27 19.4v7.2l-3.6-2.4C20 27.6 14.400 27.600 11 23Z" fill="currentColor" stroke="none"/><circle cx="15" cy="22.6" r="0.9" fill="#10202c" stroke="none"/></svg>',
  mount: '<svg viewBox="0 0 32 32" fill="currentColor" stroke="none" aria-hidden="true"><path d="M9 29h15v-3.500c0-6-1.200-9.500-3.400-12.500.8-3.200-.2-6.300-2.400-8.500l-1.700 2.300C12.200 6.800 8.300 10 7.200 15l-2.600 4.200 2.300 2.600 4.300-2c1.200 0 2.300-.3 3.300-1-1 4.200-5.500 5.200-5.500 10.200Z"/><circle cx="13" cy="12.500" r="1.100" fill="#1a1206"/></svg>',
};
const ROD_KIND = /(^|_)rod($|_)|angling_rod|fishing/i;      // a tool is not a potion: the Belt never uses it (Y34)
const FISH_HOW = ['Tap Fish — it lights up when water is in reach.', 'Wait. When it says “A bite!”, tap Hook (the big blue button).', 'Then hold to reel in and let go to give line: keep the float inside the green band.'];
/** The sheets a tab stands for: tab id (an action id) -> what is on screen when it is open. */
const TABS = [
  { id: 'bag', label: 'Bag', sel: '#bag' }, { id: 'sheet', label: 'Character', sel: '#panel-sheet' }, { id: 'skills', label: 'Skills', sel: '#panel-skills' },
  { id: 'perks', label: 'Perks', sel: '#panel-perks' }, { id: 'map', label: 'Map', sel: '#panel-map' }, { id: 'journal', label: 'Journal', sel: '#panel-journal' },
  { id: 'party', label: 'Social', sel: '#panel-partyhub, #party-menu' },
];
const shown = sel => { for (const e of document.querySelectorAll(sel)) if (!e.hidden && e.getClientRects().length) return e; return null; };

export function createTouch({ api, input, run, radial }) {
  const html = document.documentElement;
  const hud = document.getElementById('hud') || document.body;
  const ui = document.createElement('div');
  ui.className = 'phone-ui'; ui.setAttribute('aria-label', 'Touch controls');
  hud.appendChild(ui);
  const mk = (cls, label, inner, parent = ui) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ph-btn ' + cls; b.setAttribute('aria-label', label); b.innerHTML = inner; parent.appendChild(b); return b; };
  const tap = (el, fn) => el.addEventListener('click', e => { e.stopPropagation(); device.seen('touch'); fn(e); });
  const menuIcon = id => document.querySelector(`#menubar [data-panel="${id}"] svg`)?.outerHTML || ICON.wheel;

  // ---------------------------------------------------------------- the stick
  const zone = document.createElement('div'); zone.className = 'ph-stickzone';
  const base = document.createElement('div'); base.className = 'ph-stick'; base.innerHTML = '<i class="ph-ring"></i><b class="ph-thumb"></b>';
  zone.appendChild(base); ui.appendChild(zone);
  const thumb = base.querySelector('.ph-thumb');
  const ST = { id: null, ox: 0, oy: 0, R: 54 };
  function stickAt(x, y) {
    const dx = x - ST.ox, dy = y - ST.oy, m = Math.hypot(dx, dy), k = m > ST.R ? ST.R / m : 1;
    thumb.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;
    const f = Math.min(1, m / ST.R), sprint = f >= 0.6;   // W20: run by default — only a part-way push walks
    base.classList.toggle('sprint', sprint);
    api.controls?.setAnalog?.(f < 0.18 ? null : { mx: dx / (m || 1), mz: -dy / (m || 1), camX: 0, camY: 0, sprint, walk: !sprint });
  }
  function stickEnd() { if (ST.id != null) { try { zone.releasePointerCapture?.(ST.id); } catch { /* already gone */ } } ST.id = null; base.classList.remove('on', 'sprint'); thumb.style.transform = ''; api.controls?.setAnalog?.(null); if (html.dataset.variant !== 'b') { base.style.left = ''; base.style.top = ''; } }
  zone.addEventListener('pointerdown', e => {
    if (ST.id != null) return;
    device.seen('touch'); e.preventDefault();
    ST.id = e.pointerId; zone.setPointerCapture?.(e.pointerId);
    const r = zone.getBoundingClientRect();
    if (html.dataset.variant === 'b') { const b = base.getBoundingClientRect(); ST.ox = b.left + b.width / 2; ST.oy = b.top + b.height / 2; }   // B: the stick stays where it is drawn
    else { ST.ox = e.clientX; ST.oy = e.clientY; base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px'; }      // A: it appears under the thumb
    base.classList.add('on'); stickAt(e.clientX, e.clientY);
  });
  zone.addEventListener('pointermove', e => { if (e.pointerId === ST.id) stickAt(e.clientX, e.clientY); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(t, e => { if (e.pointerId === ST.id) stickEnd(); });

  // ---------------------------------------------------------------- the right-thumb buttons
  const jump = mk('ph-jump', 'Jump', ICON.jump);
  jump.addEventListener('pointerdown', e => { e.preventDefault(); device.seen('touch'); actionKey('jump', true); jump.classList.add('on'); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) jump.addEventListener(t, () => { actionKey('jump', false); jump.classList.remove('on'); });
  const target = mk('ph-target', 'Next enemy', ICON.target); tap(target, () => (api.cycleTarget ? api.cycleTarget(true) : actionKey('targetNext')));   // nearest first, whichever way the camera looks
  const ally = mk('ph-ally', 'Next party member: your heals go to them', ICON.ally); tap(ally, () => run('allyNext', 'allyNext'));
  const hook = mk('ph-hook', 'Hook the bite; hold to reel', ICON.hook + '<span>Hook!</span>');
  hook.addEventListener('pointerdown', e => { e.preventDefault(); keyDown('Space'); hook.classList.add('on'); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) hook.addEventListener(t, () => { keyUp('Space'); hook.classList.remove('on'); });

  // the belt: tap = the first potion or food you carry; hold = the four consumable slots as a wheel under the thumb
  // (slide to one, let go). Y34: a slot holding a TOOL (the fishing rod auto-filled the first potion key of a new
  // character, so the bottle cast a line — the owner's "drink button") is not a belt item: skipped here, and the button
  // wears the picture of what a tap will really use.
  const belt = mk('ph-belt', 'Potions and food: tap for the first, hold for all four', ICON.belt);
  function beltItems() {
    return [...document.querySelectorAll('#actionbar .hb-slot')].map((s, i) => {
      const img = s.querySelector('.hb-face img'), n = s.querySelector('.hb-n')?.textContent || '';
      const kind = window.tvui2?.state?.().hotbar?.[i];                                   // the item kind on that key (ui/hotbar.js)
      const tool = !!kind && ROD_KIND.test(String(kind));
      const empty = tool || s.classList.contains('empty') || s.classList.contains('none-left');
      const name = kind ? String(kind).replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : `Slot ${i + 1}`;
      return { id: 'item' + (i + 1), empty, label: empty ? 'Empty' : (name.length > 16 ? name.slice(0, 15) + '…' : name) + (n ? ` ×${n}` : ''), html: img && !empty ? `<img src="${img.src}" alt="">` : ICON.belt, src: img && !empty ? img.src : '', sub: ACTION_BY_ID['item' + (i + 1)].label };
    });
  }
  function beltTap() {
    const first = beltItems().find(w => !w.empty);
    if (!first) { api.hud?.toast?.('Your belt is empty. Potions and food you pick up or buy go on it.', 'info'); return; }
    actionKey(first.id);
  }
  holdWheel(belt, { tapFn: beltTap, open: at => radial.open({ items: beltItems(), title: 'Belt', hold: true, at, onPick: w => { if (!w.empty) actionKey(w.id); } }) });

  // ---------------------------------------------------------------- Y34: Mount and Fish, each a button of its own with its name on it
  const mount = mk('ph-mount ph-cap', 'Mount', `${ICON.mount}<small>Mount</small><i class="ph-prog" aria-hidden="true"></i>`);
  tap(mount, () => (api.mount ? api.mount() : actionKey('mount')));
  const fish = mk('ph-fish ph-cap', 'Fish', `${ICON.fish}<small>Fish</small>`); fish.hidden = true;
  const fishState = () => document.querySelector('.tv-fish:not([hidden])')?.dataset.state || 'idle';
  let water = null, waterAt = 0;
  tap(fish, () => {
    if (fishState() !== 'idle') { actionKey('fish'); return; }                     // a line is out: this reels it in
    if (api.self && !water) { api.hud?.toast?.('No water in reach. Stand at the water’s edge and face it.', 'warn'); fishHint(); return; }
    fishHint(); actionKey('fish');
  });
  // the first time (per character) you could fish, say how — the owner asked "how to fish on mobile"
  const hintBox = document.createElement('div'); hintBox.className = 'ph-hint'; hintBox.hidden = true; hintBox.setAttribute('role', 'dialog'); hintBox.setAttribute('aria-label', 'How to fish'); ui.appendChild(hintBox);
  const hintKey = () => 'tv.hint.fish.' + String(document.getElementById('self-name')?.textContent || 'x').trim().toLowerCase();
  function fishHint(force = false) {
    try { if (!force && localStorage.getItem(hintKey())) return false; localStorage.setItem(hintKey(), '1'); } catch { if (!force && fishHint.shown) return false; }
    fishHint.shown = true;
    hintBox.innerHTML = `<strong>${ICON.fish} How to fish</strong><ol>${FISH_HOW.map(t => `<li>${t}</li>`).join('')}</ol><button type="button" class="primary">Got it</button>`;
    hintBox.querySelector('button').onclick = e => { e.stopPropagation(); hintBox.hidden = true; };
    hintBox.hidden = false;
    clearTimeout(fishHint.t); if (!force) fishHint.t = setTimeout(() => { hintBox.hidden = true; }, 20000);
    return true;
  }
  // the quick wheel: tap = it stays open (tap a slice); hold = slide to a slice and let go
  const wheel = mk('ph-wheel', 'Quick wheel: every window', ICON.wheel);
  holdWheel(wheel, { tapFn: () => radial.open({ hold: false }), open: () => radial.open({ hold: true }) });
  function holdWheel(btn, { tapFn, open }) {
    let t = 0, held = false, c = null, id = null;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); device.seen('touch'); id = e.pointerId; btn.setPointerCapture?.(id); held = false;
      const r = btn.getBoundingClientRect(); c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      t = setTimeout(() => { held = true; btn.classList.add('on'); open(clampAt(c)); c = wheelCentre() || c; }, HOLD_MS);
    });
    btn.addEventListener('pointermove', e => { if (held && e.pointerId === id) { const R = 104; radial.aim((e.clientX - c.x) / R * 1.6, (e.clientY - c.y) / R * 1.6); } });
    const end = e => { if (e.pointerId !== id) return; clearTimeout(t); id = null; btn.classList.remove('on'); if (held) { if (radial.at) radial.select(); else radial.close(); } else if (e.type === 'pointerup') tapFn(); held = false; };
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
  }
  /** Keep a placed wheel on the screen (and out of the safe areas). */
  function clampAt(c) { const m = 162, cs = getComputedStyle(html), n = k => parseFloat(cs.getPropertyValue(k)) || 0; return { x: Math.max(m + n('--safe-left'), Math.min(innerWidth - m - n('--safe-right'), c.x)), y: Math.max(m + n('--safe-top'), Math.min(innerHeight - m - n('--safe-bottom'), c.y)) }; }
  function wheelCentre() { const h = radial.root.querySelector('.rd-hub'); if (!h || radial.root.hidden) return null; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  // ---------------------------------------------------------------- chat: a bubble while you play
  const chatBtn = mk('ph-chat', 'Chat', ICON.chat + '<b></b>');
  const chatEl = document.getElementById('chat'), chatLog = document.getElementById('chat-log');
  let unread = 0;
  function setChat(open) { html.dataset.chat = open ? 'open' : ''; if (open) { unread = 0; chatBtn.querySelector('b').textContent = ''; chatLog && (chatLog.scrollTop = chatLog.scrollHeight); } else document.getElementById('chat-input')?.blur(); }
  tap(chatBtn, () => setChat(html.dataset.chat !== 'open'));
  if (chatLog) new MutationObserver(list => { if (html.dataset.chat === 'open') return; for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && /\b(say|party|guild|w|whisper|zone|world|trade)\b/.test(n.className) && !/\bsystem\b/.test(n.className)) unread++; chatBtn.querySelector('b').textContent = unread ? String(Math.min(99, unread)) : ''; }).observe(chatLog, { childList: true });
  if (chatEl) { const x = mk('ph-chat-x', 'Close the chat', ICON.close, chatEl); tap(x, () => setChat(false)); }
  document.getElementById('chat-input')?.addEventListener('focus', () => setChat(true));

  // ---------------------------------------------------------------- V7: quests + events behind ONE bubble; the party as round portraits
  const SCROLL = svg('<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2Z"/><path d="M6 3a2 2 0 0 0-2 2v2h2"/><path d="M10 8h6M10 12h6M10 16h3"/>');
  const info = mk('ph-info', 'Quests, events and a bigger map', SCROLL + '<b></b>');
  tap(info, () => { html.dataset.hudinfo = html.dataset.hudinfo === 'open' ? '' : 'open'; info.classList.toggle('on', html.dataset.hudinfo === 'open'); });
  // an event must never start unseen behind the closed bubble: a one-line chip says its name and time for a few seconds
  // when it starts / you walk into it / it ends, and the bubble pulses for as long as one is running round you
  const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'ph-chip'; chip.hidden = true; ui.appendChild(chip);
  tap(chip, () => { html.dataset.hudinfo = 'open'; info.classList.add('on'); chip.hidden = true; });
  const seenEv = new Map(); let chipT = 0;
  function eventWatch() {
    let live = false;
    for (const c of document.querySelectorAll('.right-col .et-card')) {
      const key = c.dataset.key || c.querySelector('.et-name')?.textContent || '', st = ['won', 'lost', 'live', 'soon'].find(k => c.classList.contains(k)) || 'live', where = c.classList.contains('inside') ? 'in' : 'out';
      if (st === 'live' && where === 'in') live = true;
      const sig = st + ':' + where;
      if (seenEv.get(key) === sig) continue;
      const first = !seenEv.has(key); seenEv.set(key, sig);
      if (html.dataset.hudinfo === 'open') continue;
      const name = c.querySelector('.et-name')?.textContent || 'An event';
      const tail = st === 'won' || st === 'lost' ? (c.querySelector('.et-result')?.textContent || (st === 'won' ? 'Done' : 'Over')) : [c.querySelector('.et-state')?.textContent, c.querySelector('.et-time')?.textContent].filter(Boolean).join(' · ');
      if (first || st === 'won' || st === 'lost' || where === 'in') { chip.textContent = `${name} — ${tail}`; chip.dataset.state = st; chip.hidden = false; clearTimeout(chipT); chipT = setTimeout(() => { chip.hidden = true; }, st === 'won' || st === 'lost' ? 9000 : 7000); }
    }
    for (const k of [...seenEv.keys()]) if (![...document.querySelectorAll('.right-col .et-card')].some(c => (c.dataset.key || c.querySelector('.et-name')?.textContent || '') === k)) seenEv.delete(k);
    info.classList.toggle('pulse', live && html.dataset.hudinfo !== 'open');
  }
  const pmin = mk('ph-partymin', 'Party frames: small or full', svg('<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><circle cx="12" cy="17" r="3"/>'));
  const setParty = min => { html.dataset.party = min ? 'min' : ''; pmin.classList.toggle('on', !!min); try { localStorage.setItem('tv.phone.party', min ? 'min' : ''); } catch { /* private window */ } };
  tap(pmin, () => setParty(html.dataset.party !== 'min'));
  try { if (localStorage.getItem('tv.phone.party') === 'min') setParty(true); } catch { /* private window */ }

  // Y35: pressing Attack ends the stick's push (the finger may stay down; it steers again after it is lifted)
  document.querySelector('#actionbar > .slot')?.addEventListener('pointerdown', () => { if (ST.id != null) stickEnd(); });

  // ---------------------------------------------------------------- prompts are buttons
  hud.addEventListener('click', e => { const p = e.target.closest?.('.interact'); if (p && !p.hidden) { e.stopPropagation(); actionKey('interact'); } }, true);
  document.getElementById('minimap')?.addEventListener('click', () => {}, true);

  // ---------------------------------------------------------------- windows are sheets: the tab bar
  const tabs = document.createElement('nav'); tabs.className = 'phone-tabs'; tabs.setAttribute('aria-label', 'Windows');
  hud.appendChild(tabs);
  const openSheets = () => [...document.querySelectorAll('.tv-panel:not([hidden]):not(.pause-panel), #bag:not([hidden]), #party-menu:not([hidden])')].filter(e => e.getClientRects().length);
  function closeSheets(except = null) {
    for (const p of openSheets()) { if (except && p.matches(except)) continue; (p.querySelector('.tvp-x') || p.querySelector('#bag-close') || p.querySelector('#party-close'))?.click(); }
  }
  for (const t of TABS) {
    const b = mk('pt-tab', t.label, `${menuIcon(t.id)}<span>${t.label}</span>`, tabs); b.dataset.tab = t.id;
    tap(b, () => { if (shown(t.sel)) return; closeSheets(); setTimeout(() => actionKey(t.id), 20); });
  }
  const closeTab = mk('pt-tab pt-close', 'Back to the world', `${ICON.close}<span>Close</span>`, tabs);
  tap(closeTab, () => closeSheets());

  // ---------------------------------------------------------------- cards without a hover: hold = a sheet
  const sheet = document.createElement('div'); sheet.className = 'phone-sheet'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Details');
  sheet.innerHTML = '<div class="ps-card"><div class="ps-grip"></div><div class="ps-body"></div><div class="ps-actions"></div></div>';
  document.body.appendChild(sheet);
  const sBody = sheet.querySelector('.ps-body'), sActs = sheet.querySelector('.ps-actions');
  function closeSheet() { sheet.hidden = true; sBody.replaceChildren(); sActs.replaceChildren(); }
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  const tipHost = el => el?.closest?.('[data-tip],[data-tip-html],[data-tip-render]') || null;
  /** The card of an element, built by the shared tooltip itself (we ask it to open, copy what it drew, and put it away). */
  function cardOf(el) {
    return new Promise(res => {
      const r = el.getBoundingClientRect(), o = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerType: 'mouse' };
      el.dispatchEvent(new PointerEvent('pointerover', o));
      setTimeout(() => {
        const box = document.getElementById('tipbox');
        const copy = box && !box.hidden && box.childNodes.length ? box.cloneNode(true) : null;
        el.dispatchEvent(new PointerEvent('pointerout', { ...o, relatedTarget: document.body }));
        if (box) { box.hidden = true; box.classList.remove('show'); }
        if (copy) { copy.removeAttribute('id'); copy.hidden = false; copy.className = 'ps-tip ' + copy.className.replace(/\btipbox\b|\bshow\b/g, ''); copy.style.cssText = ''; }
        res(copy);
      }, 230);
    });
  }
  async function sheetFor(el, actions = []) {
    const host = tipHost(el); if (!host) return false;
    const card = await cardOf(host); if (!card && !actions.length) return false;
    sBody.replaceChildren(...(card ? [card] : []));
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ghost ps-x'; x.textContent = 'Close'; x.onclick = closeSheet;
    sActs.replaceChildren(...actions.map(a => { const b = document.createElement('button'); b.type = 'button'; b.className = (a.primary ? 'primary' : a.danger ? 'ghost danger-ish' : 'ghost') + ' ps-act'; b.textContent = a.label; b.onclick = () => { closeSheet(); a.run(); }; return b; }), x);
    sheet.hidden = false;
    return true;
  }
  // Y34: a long press on a control says what it is (TOUCH_CONTROLS). Skills keep their own card; the Belt and the wheel
  // open their wheels on a hold; a party portrait opens Track (Y36).
  const LABELLED = TOUCH_CONTROLS.filter(c => !c.skill && !c.area && !['belt', 'wheel', 'party', 'prompt', 'minimap', 'self', 'hook'].includes(c.id));
  const controlAt = el => { for (const c of LABELLED) { const hit = el?.closest?.(c.sel); if (hit) return { row: c, el: hit }; } return null; };
  const label = document.createElement('div'); label.className = 'ph-label'; label.hidden = true; label.setAttribute('role', 'tooltip'); ui.appendChild(label);
  let labelT = 0;
  const nameOfControl = c => (c.id === 'mount' ? mount.querySelector('small').textContent : c.name);
  function showLabel(row, el) {
    label.innerHTML = `<b></b><span></span>`; label.firstChild.textContent = nameOfControl(row); label.lastChild.textContent = row.what;
    label.hidden = false;
    const r = el.getBoundingClientRect(), w = Math.min(250, innerWidth - 24); label.style.width = w + 'px';
    const h = label.offsetHeight, x = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const y = r.top - h - 10 > 50 ? r.top - h - 10 : r.bottom + 10;
    label.style.left = x + 'px'; label.style.top = y + 'px';
    clearTimeout(labelT); labelT = setTimeout(() => { label.hidden = true; }, 4200);
  }
  /** A sheet with plain words and buttons (no item card behind it). */
  function plainSheet(title, text, actions = []) {
    const box = document.createElement('div'); box.className = 'ps-tip ps-plain';
    const t = document.createElement('strong'); t.textContent = title; const p = document.createElement('span'); p.textContent = text; box.append(t, p);
    sBody.replaceChildren(box);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ghost ps-x'; x.textContent = 'Close'; x.onclick = closeSheet;
    sActs.replaceChildren(...actions.map(a => { const b = document.createElement('button'); b.type = 'button'; b.className = (a.primary ? 'primary' : 'ghost') + ' ps-act'; b.textContent = a.label; b.onclick = () => { closeSheet(); a.run(); }; return b; }), x);
    sheet.hidden = false; return true;
  }
  /** Y36: hold a party portrait — where they are, and Track (an arrow at the edge of the screen leads you to them). */
  function partySheet(pm) {
    const name = pm.querySelector('.pm-name')?.firstChild?.textContent || 'Party member';
    const T = api.tracker?.() || window.tvui10 || null;
    const row = T?.people?.().find(p => !p.self && p.name === name) || null;
    const on = !!(row && T.isTracked?.(row.char));
    const where = row ? [row.where, Number.isFinite(row.dist) ? `${row.dist >= 1000 ? (row.dist / 1000).toFixed(1) + ' km' : Math.round(row.dist / 5) * 5 + ' m'} away` : ''].filter(Boolean).join(' · ') : '';
    const acts = [];
    if (row) acts.push({ label: on ? 'Stop tracking' : 'Track', primary: true, run: () => T.track(row.char, row.name, 'party') });
    acts.push({ label: 'Target (heals go to them)', run: () => { const ev = new MouseEvent('click', { bubbles: true, cancelable: true }); ev.tvPass = true; pm.dispatchEvent(ev); } });
    return plainSheet(name, where || (row ? 'In your party.' : 'In your party — not in reach right now.') + (on ? ' You are tracking them.' : ''), acts);
  }
  let press = null, swallow = -Infinity;
  document.addEventListener('pointerdown', e => {
    if (!label.hidden && !e.target.closest?.('.ph-label')) label.hidden = true;
    if (e.pointerType === 'mouse' && !html.dataset.safeEmulated) return;
    const ctl = controlAt(e.target), pm = ctl ? null : e.target.closest?.('#party .pmember') || null;
    const host = ctl || pm ? null : tipHost(e.target);
    if (!ctl && !pm && (!host || host.closest('.phone-sheet, .ph-btn, .phone-tabs'))) return;
    clearTimeout(press?.t);
    const P = press = { x: e.clientX, y: e.clientY, fired: false, t: setTimeout(() => {
      if (press !== P) return;
      P.fired = true; swallow = performance.now();
      if (ctl) showLabel(ctl.row, ctl.el); else if (pm) partySheet(pm); else sheetFor(host);
    }, HOLD_MS + 80) };
  }, true);
  document.addEventListener('pointermove', e => { if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) { clearTimeout(press.t); press = null; } }, true);
  // (the click that ends a hold is swallowed however long the finger stayed down)
  for (const t of ['pointerup', 'pointercancel']) document.addEventListener(t, () => { if (press) { clearTimeout(press.t); if (press.fired) swallow = performance.now(); press = null; } }, true);

  // ---------------------------------------------------------------- Y34: "What do these buttons do?" — every control on screen, numbered and named
  const explainBox = document.createElement('div'); explainBox.className = 'ph-explain'; explainBox.hidden = true; explainBox.setAttribute('role', 'dialog'); explainBox.setAttribute('aria-label', 'What the buttons do');
  document.body.appendChild(explainBox);
  const seen = el => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  function explain() {
    closeSheets(); radial.close?.(); closeSheet(); setChat(false);
    const rows = []; const marks = [];
    for (const c of TOUCH_CONTROLS) {
      const el = [...document.querySelectorAll(c.sel)].find(seen);
      if (!el || (c.skill && el.classList.contains('empty'))) continue;
      const r = (c.area ? base.querySelector('.ph-ring') || el : el).getBoundingClientRect();
      let name = nameOfControl(c);
      if (c.skill) { const m = /class="tip-title">(?:\s*<svg[\s\S]*?<\/svg>)?\s*([^<]+)/.exec(el.dataset.tipHtml || ''); if (m) name = m[1].trim(); }
      rows.push({ n: rows.length + 1, name, what: c.what, id: c.id });
      marks.push(`<b class="ph-ex-n" style="left:${Math.round(r.left + r.width / 2)}px;top:${Math.round(r.top + r.height / 2)}px">${rows.length}</b>`);
    }
    explainBox.innerHTML = `${marks.join('')}<div class="ph-ex-card"><strong>What the buttons do</strong><ol>${rows.map(w => `<li data-id="${w.id}"><b>${w.n}</b><span><em></em><i></i></span></li>`).join('')}</ol><p>Hold any button for a moment to see its name again.</p><button type="button" class="primary">Got it</button></div>`;
    explainBox.querySelectorAll('li').forEach((li, i) => { li.querySelector('em').textContent = rows[i].name; li.querySelector('i').textContent = rows[i].what; });
    explainBox.querySelector('button').onclick = e => { e.stopPropagation(); explainBox.hidden = true; };
    explainBox.hidden = false;
    return rows;
  }
  // the click that ends a hold must not also press the thing; and a tap on a bag item opens its sheet instead of wearing it at once
  document.addEventListener('click', e => {
    if (performance.now() - swallow < 700) { e.stopPropagation(); e.preventDefault(); swallow = -Infinity; return; }
    if (e.tvPass) return;
    const cell = e.target.closest?.('#bag .islot:not(.empty)');
    if (cell && cell.dataset.tipRender) { e.stopPropagation(); e.preventDefault(); itemSheet(cell); return; }
    const row = e.target.closest?.('#panel-shop .shop-row');
    if (row) { e.stopPropagation(); e.preventDefault(); shopSheet(row); }
  }, true);
  /** V13: a shop row — the item's card (with the comparison against what you wear) and one big button for what a click does. */
  function shopSheet(row) {
    const cell = row.querySelector('.islot'), price = row.querySelector('.price')?.textContent || '';
    const tabOn = document.querySelector('#panel-shop .shop-tabs [aria-checked="true"]')?.dataset.tab || 'buy';
    const label = tabOn === 'sell' ? `Sell${price ? ' for ' + price : ''}` : tabOn === 'back' ? `Buy back${price ? ' for ' + price : ''}` : `Buy${price ? ' for ' + price : ''}`;
    const go = () => { const ev = new MouseEvent('click', { bubbles: true, cancelable: true }); ev.tvPass = true; row.dispatchEvent(ev); };
    const acts = [{ label, primary: true, run: go }];
    if (cell && tipHost(cell)) return sheetFor(cell, acts);
    sBody.replaceChildren(Object.assign(document.createElement('div'), { className: 'ps-tip', textContent: row.querySelector('.sr-name')?.textContent || '' }));
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ghost ps-x'; x.textContent = 'Close'; x.onclick = closeSheet;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'primary ps-act'; b.textContent = label; b.onclick = () => { closeSheet(); go(); };
    sActs.replaceChildren(b, x); sheet.hidden = false; return true;
  }
  /** A small button in a sheet's title bar that folds part of it away (V6: see the figure; V12: more map). */
  function headToggle(panelSel, cls, label, attr) {
    const head = document.querySelector(panelSel + ' .tvp-head'); if (!head || head.querySelector('.' + cls)) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost ph-headbtn ' + cls; b.textContent = label[0];
    b.onclick = e => { e.stopPropagation(); const on = html.dataset[attr] !== '1'; html.dataset[attr] = on ? '1' : ''; b.textContent = label[on ? 1 : 0]; b.classList.toggle('on', on); };
    head.insertBefore(b, head.querySelector('.tvp-x'));
  }
  // a mouse cannot flick a row sideways: let it drag rows that scroll (the gallery on a desktop; a phone scrolls them natively)
  let dragRow = null;
  document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; for (let p = e.target; p && p !== document.body; p = p.parentElement) { if (p.scrollWidth > p.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(p).overflowX)) { dragRow = { el: p, x: e.clientX, left: p.scrollLeft, moved: 0 }; return; } } }, true);
  document.addEventListener('pointermove', e => { if (!dragRow) return; const d = e.clientX - dragRow.x; dragRow.moved = Math.max(dragRow.moved, Math.abs(d)); if (dragRow.moved > 6) dragRow.el.scrollLeft = dragRow.left - d; }, true);
  document.addEventListener('pointerup', () => { if (dragRow && dragRow.moved > 6) swallow = performance.now(); dragRow = null; }, true);

  /** A bag or paper-doll square: its card, and what a click / Shift-click / right-click would do as buttons. */
  function itemSheet(cell) {
    const worn = !!cell.closest('#paperdoll, .inv-doll');
    const pass = (type, more = {}) => { const r = cell.getBoundingClientRect(); const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, ...more }); ev.tvPass = true; cell.dispatchEvent(ev); };
    const acts = worn ? [{ label: 'Take off', primary: true, run: () => pass('click') }]
      : [{ label: 'Use / wear', primary: true, run: () => pass('click') }, { label: 'Other hand', run: () => pass('click', { shiftKey: true }) }, { label: 'Throw away', danger: true, run: () => pass('contextmenu', { button: 2 }) }];
    return sheetFor(cell, acts);
  }

  // ---------------------------------------------------------------- pinch = the wheel (the world camera, any canvas that zooms on wheel)
  const pts = new Map(); let pinch = 0;
  const view = document.getElementById('view');
  if (view) {
    view.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') pts.set(e.pointerId, [e.clientX, e.clientY]); });
    view.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size !== 2) return;
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch && Math.abs(d - pinch) > 14) { view.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: d > pinch ? -120 : 120, clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 })); pinch = d; }
      else if (!pinch) pinch = d;
    });
    for (const t of ['pointerup', 'pointercancel']) view.addEventListener(t, e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; });
  }

  // ---------------------------------------------------------------- each frame: what is open, what the big button means
  let lastSheet = null;
  function tick() {
    const open = openSheets();
    const top = open.length ? open.sort((a, b) => (+b.style.zIndex || 0) - (+a.style.zIndex || 0))[0] : null;
    const id = top ? (TABS.find(t => top.matches(t.sel))?.id || 'other') : '';
    if (id !== lastSheet) { lastSheet = id; html.dataset.sheet = id; for (const b of tabs.children) b.classList.toggle('on', b.dataset.tab === id); if (id) { setChat(false); api.controls?.setAnalog?.(null); } }
    // V7: how many quests and events sit behind the bubble; each party row's health / mana as numbers the round frames draw; who is targeted
    const n = document.querySelectorAll('.right-col .et-card, .right-col .tr-main, .right-col .tr-row').length;
    const badge = info.querySelector('b'); if (badge.textContent !== (n ? String(n) : '')) badge.textContent = n ? String(n) : '';
    eventWatch();
    const tname = document.querySelector('#target-frame:not([hidden]) #target-name')?.textContent || '';
    for (const m of document.querySelectorAll('#party .pmember')) {
      const hp = parseFloat(m.querySelector('.bar.hp i')?.style.width || '100') / 100, mpEl = m.querySelector('.bar.mp'), mp = mpEl && !mpEl.hidden ? parseFloat(mpEl.querySelector('i')?.style.width || '0') / 100 : 0;
      if (m.dataset.hp !== hp.toFixed(2)) { m.dataset.hp = hp.toFixed(2); m.style.setProperty('--hp', hp.toFixed(3)); }
      if (m.dataset.mp !== mp.toFixed(2)) { m.dataset.mp = mp.toFixed(2); m.style.setProperty('--mp', mp.toFixed(3)); }
      const name = m.querySelector('.pm-name')?.firstChild?.textContent || '';
      m.classList.toggle('targeted', !!tname && name === tname);
    }
    // the menu bar is gone on a phone: the pause menu (wheel > Menu) carries what only it could open
    const pl = document.querySelector('#panel-pause:not([hidden]) .pause-list');
    if (pl && !pl.querySelector('.ph-extra')) {
      for (const [mid, label] of [['menu-feedback', 'Feedback: a suggestion or a bug'], ['menu-account', 'Account']]) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost wide ph-extra'; b.textContent = label; b.onclick = () => { document.querySelector('#panel-pause .tvp-x')?.click(); document.getElementById(mid)?.click(); }; pl.insertBefore(b, pl.lastElementChild); }
      // Y34: every on-screen control, named (generated from the binding table)
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost wide ph-extra ph-explain-open'; b.textContent = 'What do these buttons do?'; b.onclick = () => { document.querySelector('#panel-pause .tvp-x')?.click(); setTimeout(explain, 60); }; pl.insertBefore(b, pl.firstElementChild);
    }
    if (id === 'map') headToggle('#panel-map', 'ph-mapside', ['Hide list', 'Show list'], 'mapside');
    if (document.querySelector('#panel-appearance:not([hidden])')) headToggle('#panel-appearance', 'ph-peek', ['Preview', 'Back to editing'], 'peek');
    if (document.querySelector('#panel-kits:not([hidden])')) headToggle('#panel-kits', 'ph-peek', ['Preview', 'Back to choosing'], 'peek');
    const fs = document.querySelector('.tv-fish:not([hidden])')?.dataset.state || '';
    const f = fs === 'bite' || fs === 'tug' ? fs : '';
    if (html.dataset.fishing !== f) { html.dataset.fishing = f; hook.querySelector('span').textContent = f === 'tug' ? 'Reel' : 'Hook!'; }
    // Y34 — Mount: its name is what a tap will do; the ring fills while the mount is being called
    const me = api.self?.() || null, nowT = performance.now();
    const mText = me?.mount ? 'Dismount' : me?.calling ? 'Calling…' : 'Mount';
    const mSmall = mount.querySelector('small'); if (api.self && mSmall.textContent !== mText) { mSmall.textContent = mText; mount.setAttribute('aria-label', mText === 'Calling…' ? 'Calling your mount: tap to call it off' : mText); mount.classList.toggle('on', !!me?.mount); mount.classList.toggle('calling', !!me?.calling && !me?.mount); }
    if (me?.calling && !me.mount) mount.style.setProperty('--p', Math.max(0, Math.min(1, (nowT - me.calling.at) / Math.max(1, me.calling.until - me.calling.at))).toFixed(3));
    // Y34 — Fish: there only with a rod; lit only when a cast would land (the server's own rule, input/water-reach.js)
    const rodBtn = document.querySelector('.fish-btn'), hasRod = fishHint.demo || (rodBtn ? !rodBtn.hidden : false);
    if (fish.hidden === hasRod) fish.hidden = !hasRod;
    if (hasRod && nowT - waterAt > 350) {
      waterAt = nowT;
      water = fishHint.demo ? { demo: true } : me && !me.indoors ? waterInReach(me, api.waterAt, api.pools?.() || []) : null;
      const out = fs && fs !== 'idle';
      fish.classList.toggle('dim', !water && !out); fish.classList.toggle('lit', !!water && !out); fish.classList.toggle('on', !!out);
      const fText = out ? 'Reel in' : 'Fish'; const fSmall = fish.querySelector('small'); if (fSmall.textContent !== fText) { fSmall.textContent = fText; fish.setAttribute('aria-label', out ? 'Reel in' : water ? 'Fish: cast your line' : 'Fish: no water in reach'); }
      if (water && !water.demo && !out) fishHint();                                   // the first time water is in reach
      // … or at the angler: once the talk is over
      const dlg = document.querySelector('.tv-dialog:not([hidden])'); if (dlg && /\bangl|fishing rod|cast a line/i.test(dlg.textContent || '')) fishHint.pending = true; else if (fishHint.pending) { fishHint.pending = false; fishHint(); }
    }
    // the Belt wears the picture of what a tap will use (never the rod)
    if (nowT - (tick.beltAt || 0) > 500) { tick.beltAt = nowT; const first = beltItems().find(w => !w.empty), sig = first ? first.src || first.id : ''; if (belt.dataset.sig !== sig) { belt.dataset.sig = sig; belt.innerHTML = first && first.src ? `<img src="${first.src}" alt="">` : ICON.belt; belt.classList.toggle('empty', !first); } }
  }

  return {
    ui, tabs, sheet, tick, sheetFor, itemSheet, shopSheet, closeSheet, closeSheets, setChat, setParty, explain, fishHint, showLabel, partySheet,
    /** Y1: an activity started — the stick lets go (the finger may stay down; it steers again after it is lifted). */
    release() { if (ST.id != null) stickEnd(); },
    get water() { return water; },
    setInfo(on) { html.dataset.hudinfo = on ? 'open' : ''; info.classList.toggle('on', !!on); },
    /** For the gallery's still pictures: show a control mid-press. */
    demo(what, a = 0.7, b = -0.5) {
      if (what === 'stick') { const r = zone.getBoundingClientRect(); base.style.left = (r.width * 0.42) + 'px'; base.style.top = (r.height * 0.55) + 'px'; base.classList.add('on'); const br = base.getBoundingClientRect(); ST.ox = br.left + br.width / 2; ST.oy = br.top + br.height / 2; stickAt(ST.ox + a * ST.R, ST.oy + b * ST.R); }
      else if (what === 'belt') { const r = belt.getBoundingClientRect(); radial.open({ items: beltItems(), title: 'Belt', hold: true, at: clampAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 }), onPick: w => actionKey(w.id) }); radial.point(0); belt.classList.add('on'); }
      else if (what === 'wheel') { radial.open({ hold: false }); radial.point(typeof a === 'number' ? 0 : a); }
      else if (what === 'chat') setChat(true);
      else if (what === 'party') setParty(a !== false && a !== 0);
      else if (what === 'info') { html.dataset.hudinfo = 'open'; info.classList.add('on'); }
      else if (what === 'shop') { const r = document.querySelector('#panel-shop .shop-row'); if (r) return shopSheet(r); }
      else if (what === 'explain') return explain();
      else if (what === 'fish') { fishHint.demo = true; fish.hidden = false; fish.classList.add('lit'); fish.classList.remove('dim'); }
      else if (what === 'fishhint') { fishHint.demo = true; fish.hidden = false; fish.classList.add('lit'); fish.classList.remove('dim'); return fishHint(true); }
      else if (what === 'label') { const c = TOUCH_CONTROLS.find(x => x.id === (typeof a === 'string' ? a : 'attack')), el = c && document.querySelector(c.sel); if (el) showLabel(c, el); }
      else if (what === 'mount') { const sm = mount.querySelector('small'); sm.textContent = a === 'calling' ? 'Calling…' : a === 'on' ? 'Dismount' : 'Mount'; mount.classList.toggle('on', a === 'on'); mount.classList.toggle('calling', a === 'calling'); mount.style.setProperty('--p', '0.6'); }
      else if (what === 'track') { const pm = document.querySelector('#party .pmember'); if (pm) return partySheet(pm); }
    },
  };
}
