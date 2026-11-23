// The ☰ menu on every screen (game-standards §4) plus the Settings and Controls sheets it opens. In a chapter it is
// the pause menu (Resume first; online the fight keeps going behind it). Every item is a real button, reachable by
// mouse, touch, keys and controller.
import { account } from '../../../../shared/rgs-account.js';
import { ask } from '../../../../shared/dialog.js';
import { icon } from './icons.js';
import { esc } from './text.js';
import { fmt, pct } from '../../../../shared/format.js';
import { openSheet } from './kit.js';
import { SCHEMES, ACTION_NAMES, ACTION_HELP, keyName, padName, KEYBOARD_LAYOUTS, MOUSE_LABELS } from '../input/bindings.js';

export function openMenu(app, { onClose = null } = {}) {
  const inPlay = app.screen === 'play', online = !!app.session?.online;
  const lead = currentHero(app);
  const items = [
    inPlay && ['resume', 'play', 'Resume', 'wr-primary'],
    lead && (inPlay || app.screen === 'map') && ['bag', 'bag', 'Bag and gear'],
    lead && (inPlay || app.screen === 'map') && ['spells', 'book', 'Spells'],
    ['settings', 'cog', 'Settings'], ['controls', 'keyboard', 'Controls'], ['whatsnew', 'scroll', "What's new"], ['report', 'bug', 'Report a bug'],
    ['credits', 'star', 'Credits'], ['account', 'user', app.user ? `Sign out (${app.user.username || 'account'})` : 'Sign in'],
    inPlay ? ['leave', 'map', online ? 'Leave the room' : 'Leave chapter', 'wr-ghost'] : app.screen !== 'title' && ['title', 'back', 'Title screen', 'wr-ghost'],
  ].filter(Boolean);
  const sh = openSheet({ title: inPlay ? (online ? 'Menu (the fight goes on)' : 'Paused') : 'Menu', cls: 'wr-menu', onClose, closeLabel: inPlay ? 'Resume' : 'Close',
    body: `<nav class="wr-menu-list">${items.map(([act, ic, label, cls = '']) => `<button type="button" class="wr-btn wr-menu-item ${cls}" data-act="${act}">${icon(ic)}<span>${esc(label)}</span>${act === 'whatsnew' ? '<i class="wr-dot" hidden></i>' : ''}</button>`).join('')}</nav>` });
  if (inPlay && online && app.session.connection) {
    // the connection detail lives here, never as a badge over the scores (game-standards §7)
    const c = app.session.connection() || {};
    sh.body.insertAdjacentHTML('afterbegin', `<p class="wr-conn"><span class="wr-conn-dot wr-conn-${esc(c.state || 'open')}"></span><span>${c.state === 'open' || !c.state ? 'Connected' : esc(c.state === 'closed' ? 'Disconnected' : 'Reconnecting…')}${c.code ? ` · room ${esc(c.code)}` : ''}${Number.isFinite(c.rtt) ? ` · ${fmt(Math.round(c.rtt))} ms` : ''}</span></p>`);
  }
  const dot = sh.body.querySelector('.wr-dot'); if (dot) app.whatsNew.onUnread(n => { dot.hidden = !n; });
  sh.body.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    app.audio.play('ui.click');
    switch (b.dataset.act) {
      case 'resume': sh.close(); break;
      case 'bag': (await import('./inventory.js')).openInventory(app, lead, { live: inPlay }); break;
      case 'spells': (await import('./spells.js')).openSpells(app, lead, { live: inPlay }); break;
      case 'settings': openSettings(app); break;
      case 'controls': openControls(app); break;
      case 'whatsnew': app.whatsNew.open(); break;
      case 'report': (await import('./report.js')).openReport(app); break;
      case 'credits': app.credits.open(); break;
      case 'account':
        if (app.user) { if (await ask({ title: 'Sign out?', text: 'Your heroes stay on this device.', ok: 'Sign out' })) { await account.signOut().catch(() => {}); app.user = null; sh.close(); } }
        else { sh.close(); app.signIn(); }
        break;
      case 'leave':
        if (online ? await ask({ title: 'Leave the room?', text: 'What you found and the levels you gained are kept. The others play on without you.', ok: 'Leave the room', danger: true })
          : await ask({ title: 'Leave this chapter?', text: 'What you found and the levels you gained are kept. The chapter starts from the beginning next time.', ok: 'Leave chapter', danger: true })) app.leaveChapter?.();
        break;
      case 'title': app.go('title'); break;
    }
  });
  return sh;
}

/** The hero the menu's Bag / Spells open: the first local player's (in a chapter) or the map's hero. */
function currentHero(app) {
  const s = app.session;
  if (s) { const slot = (app.party || []).find(p => !p.bot && s.localPids?.includes(p.pid)) || (app.party || []).find(p => !p.bot); return slot ? app.hero(slot.heroId) : null; }
  return app.hero(app.screenOpts?.heroId) || app.hero(app.save.lastHero);
}

export function openSettings(app) {
  const S = app.settings;
  const sw = (k, label, sub) => `<div class="wr-set-row"><div><b>${esc(label)}</b><small>${esc(sub)}</small></div><button type="button" class="wr-btn wr-toggle-btn${S[k] ? ' on' : ''}" data-flag="${k}" aria-pressed="${!!S[k]}"><span>${S[k] ? 'On' : 'Off'}</span><i class="wr-switch"></i></button></div>`;
  const sh = openSheet({ title: 'Settings', cls: 'wr-settings', body: `
    <div class="wr-set-row"><div><b>Sound</b><small>Fights, footsteps and the places you pass</small></div>
      <div class="wr-range"><input type="range" min="0" max="1" step="0.05" value="${S.volume}" aria-label="Sound volume"><output>${fmt(Math.round(S.volume * 100))}%</output></div></div>
    <div class="wr-set-row"><div><b>Graphics</b><small>Low is lighter on phones and older computers (used the next time the game opens)</small></div>
      <div class="wr-toggle">${['high', 'low'].map(q => `<button type="button" class="${S.quality === q ? 'on' : ''}" data-q="${q}" aria-pressed="${S.quality === q}">${q === 'high' ? 'High' : 'Low'}</button>`).join('')}</div></div>
    <div class="wr-set-row"><div><b>Characters</b><small data-models-sub>${esc(MODELS_TEXT[S.models === 'hd' ? 'hd' : 'legacy'])}</small></div>
      <div class="wr-toggle" role="group" aria-label="Character models">${['hd', 'legacy'].map(m => `<button type="button" class="${(S.models === 'hd' ? 'hd' : 'legacy') === m ? 'on' : ''}" data-models="${m}" aria-pressed="${(S.models === 'hd' ? 'hd' : 'legacy') === m}">${m === 'hd' ? 'High detail' : 'Legacy'}</button>`).join('')}</div></div>
    ${layoutRow(S)}
    ${sw('shake', 'Screen shake', 'Big hits and the waking road shake the view')}
    ${sw('damageNumbers', 'Damage numbers', 'Numbers float up from every hit')}
    <button type="button" class="wr-btn" data-act="controls">${icon('keyboard')}<span>Controls</span></button>
    ${backupRow(app)}` });
  const range = sh.body.querySelector('input[type=range]'), out = sh.body.querySelector('output');
  range.addEventListener('input', () => { app.setSetting('volume', +range.value); out.textContent = `${fmt(Math.round(+range.value * 100))}%`; });
  range.addEventListener('change', () => app.audio.play('ui.click'));
  sh.body.addEventListener('click', e => {
    const f = e.target.closest('[data-flag]');
    if (f) { const k = f.dataset.flag; app.setSetting(k, !S[k]); f.classList.toggle('on', S[k]); f.setAttribute('aria-pressed', S[k]); f.querySelector('span').textContent = S[k] ? 'On' : 'Off'; app.audio.play('ui.click'); return; }
    const L = e.target.closest('[data-layout]');
    if (L) { pickLayout(app, sh.body, L.dataset.layout); return; }
    const md = e.target.closest('[data-models]');
    if (md) { app.setSetting('models', md.dataset.models); app.audio.play('ui.click'); sh.body.querySelectorAll('[data-models]').forEach(b => { const on = b.dataset.models === md.dataset.models; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); sh.body.querySelector('[data-models-sub]').textContent = MODELS_TEXT[md.dataset.models]; return; }
    const q = e.target.closest('[data-q]');
    if (q) { app.setSetting('quality', q.dataset.q); sh.body.querySelectorAll('[data-q]').forEach(b => { const on = b.dataset.q === S.quality; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); return; }
    if (e.target.closest('[data-act="controls"]')) openControls(app);
    if (e.target.closest('[data-act="restore"]')) restore(app);
  });
  return sh;
}

/** Character models (js/ui/models.js asks on the first start): switched live, everyone on screen rebuilds. */
const MODELS_TEXT = { hd: 'Hand-painted heroes and monsters', legacy: 'The original round heroes and monsters' };

/** The keyboard layout choice (owner #93): keyboard and mouse is the default; the round-1 keys-only layout stays. */
const LAYOUT_TEXT = { kbm: ['Keyboard and mouse', 'WASD to walk, left click attacks, right click is Heavy, 1 and 2 cast'], kb: ['Keyboard only', 'WASD or arrows to walk, J attacks, K is Heavy, U and I cast'] };
function layoutRow(S) {
  return `<div class="wr-set-row"><div><b>Keyboard layout</b><small data-layout-sub>${esc(LAYOUT_TEXT[S.keys]?.[1] || '')}</small></div>
    <div class="wr-toggle" role="group" aria-label="Keyboard layout">${KEYBOARD_LAYOUTS.map(id => `<button type="button" class="${S.keys === id ? 'on' : ''}" data-layout="${id}" aria-pressed="${S.keys === id}">${id === 'kbm' ? 'With mouse' : 'Keys only'}</button>`).join('')}</div></div>`;
}
function pickLayout(app, root, id) {
  app.setSetting('keys', id); app.audio.play('ui.click');
  root.querySelectorAll('[data-layout]').forEach(b => { const on = b.dataset.layout === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  root.querySelectorAll('[data-layout-sub]').forEach(n => { n.textContent = LAYOUT_TEXT[id][1]; });
}

/** "Bring these saves back" (game-standards §3): the copy a sync replaced is kept in this browser; this puts it back. */
function backupRow(app) {
  const b = app.cloud?.backup?.();
  if (!b) return '';
  const when = b.at ? new Date(b.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'not recorded';
  return `<div class="wr-set-row wr-backup"><div><b>Saves kept as a backup</b><small>${b.kind === 'account' ? 'Your account\u2019s copy' : 'This device\u2019s copy'}, put aside ${esc(when)}</small>
    <ul>${(b.lines || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div><button type="button" class="wr-btn" data-act="restore">${icon('swap')}<span>Bring these saves back</span></button></div>`;
}
async function restore(app) {
  const yes = await ask({ title: 'Bring these saves back?', text: 'Your heroes now are kept as the backup instead, so you can switch again.', ok: 'Bring them back' });
  if (yes) { app.noSave = true; await app.cloud.restoreBackup(); }
}

/** Every control, from the one binding table (rule 34), for each way to play. */
export function openControls(app) {
  const HELP = { ...ACTION_HELP, breaker: `Knock back everyone around you for ${pct(app.T.breakerCost)} of your health` };
  const acts = ['left', 'right', 'up', 'down', 'attack', 'heavy', 'jump', 'dash', 'block', 'grab', 'spell1', 'spell2', 'breaker', 'pause'];
  const keysOf = (id, a) => {
    const S = SCHEMES[id]; const list = (S.move?.[a] || S.keys?.[a] || []).map(keyName);
    if (S.mouse && S.buttons?.[a] != null) list.unshift(MOUSE_LABELS[S.buttons[a]]);
    return [...new Set(list)];
  };
  const padOf = a => {
    const S = SCHEMES.pad;
    if (a in S.dpad) return ['Left stick', `D-pad ${a === 'up' ? '↑' : a === 'down' ? '↓' : a === 'left' ? '←' : '→'}`];
    const out = (S.buttons[a] || []).map(padName); if (a === 'breaker') out.push('L3 + R3'); return out;
  };
  const tab = (id, label) => `<button type="button" role="tab" class="wr-tab" data-ctab="${id}">${label}</button>`;
  const sh = openSheet({ title: 'Controls', wide: true, cls: 'wr-controls', body: `<div class="wr-tabs" role="tablist">${tab('kb', 'Keyboard')}${tab('two', 'Two on one keyboard')}${tab('pad', 'Controller')}${tab('touch', 'Touch')}</div><div class="wr-ctl-body"></div>` });
  const body = sh.body.querySelector('.wr-ctl-body');
  const kbd = list => list.map(k => `<kbd>${esc(k)}</kbd>`).join(' ');
  const table = cols => `<table class="wr-ctl"><thead><tr><th>Action</th>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${acts.map(a => `<tr><th scope="row"><b>${esc(ACTION_NAMES[a])}</b>${HELP[a] ? `<small>${esc(HELP[a])}</small>` : ''}</th>${cols.map(c => `<td>${kbd(c[1](a))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  function show(id) {
    sh.body.querySelectorAll('[data-ctab]').forEach(t => { const on = t.dataset.ctab === id; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
    if (id === 'kb') {
      const L = app.settings.keys;
      body.innerHTML = `${layoutRow(app.settings)}${table([[LAYOUT_TEXT[L][0], a => keysOf(L, a)]])}<p class="wr-dim">Tap a direction twice to dash. W walks up the street, S walks toward you.${L === 'kbm' ? ' Hold 1 or 2 to keep a spinning spell going.' : ''}</p>`;
    }
    else if (id === 'two') body.innerHTML = table([['Left player', a => keysOf('kbL', a)], ['Right player', a => keysOf('kbR', a)]]) + '<p class="wr-dim">Join from Local co-op with F (left keys) and K (right keys). With the mouse layout, the mouse player can share the keyboard with the right-keys player.</p>';
    else if (id === 'pad') body.innerHTML = table([['Controller', padOf]]) + '<p class="wr-dim">In menus: the d-pad or stick moves, A presses, B goes back. Flick the stick twice to dash.</p>';
    else body.innerHTML = `<ul class="wr-touch-help"><li>${icon('touch')}<span><b>Stick</b> bottom left: walk, and up or down the street</span></li>
      <li>${icon('attack')}<span><b>Attack, Heavy, Jump, Dash, Block</b>: hold Block to keep your guard up</span></li>
      <li>${icon('spell')}<span><b>Spell buttons</b> show the spell's name; greyed out while it recharges or you lack mana. Hold one to keep a spinning spell going</span></li>
      <li>${icon('breaker')}<span><b>Breaker</b> knocks everyone around you back for ${pct(app.T.breakerCost)} of your health</span></li>
      <li>${icon('grab')}<span><b>Grab</b> appears when a road weapon is at your feet</span></li></ul>`;
  }
  sh.body.addEventListener('click', e => {
    const t = e.target.closest('[data-ctab]'); if (t) show(t.dataset.ctab);
    const L = e.target.closest('[data-layout]'); if (L) { pickLayout(app, sh.body, L.dataset.layout); show('kb'); sh.body.querySelector(`[data-layout="${L.dataset.layout}"]`)?.focus({ preventScroll: true }); }
  });
  show(app.input.last === 'pad' ? 'pad' : app.input.last === 'touch' ? 'touch' : 'kb');
  return sh;
}
