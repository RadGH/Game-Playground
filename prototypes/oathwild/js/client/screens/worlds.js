// The world list: the worlds I have played (mine marked) and the public ones others keep, each with how many are in it
// (of 10), who, and how many quests it has finished. Join walks in with the character chosen on the last screen;
// New world asks a name and Public / Invite only; Join by code takes the four letters a friend shares. The selected
// world shows its invite link and a QR code. ?world=CODE in the address picks that world on arrival.
import { focusQuiet } from '../../../../../shared/tooltip.js';
import { esc, openWin, ask } from '../ui/kit.js';
import { glyph, uiIcon } from '../ui/icons.js';
import { qrSvg } from '../../../../../shared/rgs-signin.js';
import { cleanCode, CODE_ALPHABET, CODE_LENGTH } from '../../net/protocol.js';
import { fmt } from '../../../../../shared/format.js';

const inviteUrl = code => { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('world', code); return u.href; };

export async function show(app, opts = {}) {
  if (!opts.char) { app.go('chars'); return { view: 'ready', close() {} }; }
  const ui = document.getElementById('ui');
  const want = cleanCode(new URLSearchParams(location.search).get('world'));
  const st = { list: [], sel: want || null, msg: '', loading: true, joining: false, made: null };
  ui.innerHTML = `<section class="scr-worlds" aria-label="Worlds">
    <header class="scr-worlds-bar">
      <button type="button" class="ow-x" data-back aria-label="Back">${glyph('back', 22)}</button>
      <h1>Choose a world</h1>
      <span class="ow-spacer"></span>
      <button type="button" class="ow-x" data-act="refresh" aria-label="Refresh the list">${glyph('refresh', 22)}</button>
      <button type="button" class="ow-x" data-act="menu" aria-label="Menu">${uiIcon('menu', 22)}</button>
    </header>
    <div class="scr-worlds-body">
      <div class="scr-worlds-list" role="listbox" aria-label="Worlds"></div>
      <aside class="scr-worlds-detail"></aside>
    </div>
    <footer class="scr-worlds-foot" data-lint-skip>
      <p class="scr-worlds-msg" role="status"></p>
      <div class="scr-worlds-btns">
        <button type="button" class="ow-btn ow-ghost" data-act="code">${glyph('door', 18)}<span>Join by code</span></button>
        <button type="button" class="ow-btn ow-ghost" data-act="new">${glyph('plus', 18)}<span>New world</span></button>
        <button type="button" class="ow-btn ow-ghost" data-act="arena">${glyph('sword', 18)}<span>New arena</span></button>
        <button type="button" class="ow-btn ow-primary scr-worlds-join" data-act="join">${glyph('next', 20)}<span>Enter</span></button>
      </div>
    </footer>
  </section>`;
  const root = ui.firstElementChild;
  const $ = s => root.querySelector(s);
  const list = $('.scr-worlds-list'), detail = $('.scr-worlds-detail'), msg = $('.scr-worlds-msg');
  const selected = () => st.list.find(w => w.code === st.sel) || null;

  function row(w) {
    const full = w.players >= w.seats;
    const arena = w.kind === 'arena';
    return `<button type="button" class="scr-worlds-card${arena ? ' is-arena' : ''}" role="option" data-code="${esc(w.code)}" aria-selected="${w.code === st.sel}">
      <span class="scr-worlds-icon">${glyph(arena ? 'sword' : w.public ? 'globe' : 'lockOpen', 22)}</span>
      <span class="scr-worlds-text"><b>${esc(w.name)}</b><small>${arena ? 'Arena · ' : ''}${w.mine ? 'Yours · ' : ''}${w.public ? 'Public' : 'Invite only'} · code ${esc(w.code)} · ${arena ? `${fmt(w.arena?.wins || 0)} matches won${w.arena?.busy ? ` · now: ${esc(w.arena.busy)}` : ''}` : `${fmt(w.quests || 0)} quests done`}</small></span>
      <span class="scr-worlds-count${full ? ' ow-bad' : w.players ? ' ow-good' : ''}">${glyph('people', 16)} ${fmt(w.players)}/${fmt(w.seats)}</span>
    </button>`;
  }
  function draw() {
    msg.textContent = st.msg;
    $('[data-act="join"]').disabled = !selected() || st.joining;
    if (st.loading) { list.innerHTML = '<p class="ow-empty">Looking for worlds…</p>'; detail.innerHTML = ''; return; }
    const played = st.list.filter(w => w.played), pub = st.list.filter(w => !w.played);
    list.innerHTML = (played.length ? `<h2 class="scr-worlds-head">Your worlds</h2>${played.map(row).join('')}` : '')
      + `<h2 class="scr-worlds-head">Public worlds</h2>${pub.length ? pub.map(row).join('') : '<p class="ow-empty">No public worlds are open right now. Start one — others can find it here.</p>'}`;
    const w = selected();
    if (!w) { detail.innerHTML = `<div class="scr-worlds-hint"><h2>A world of your own</h2><p>Up to 10 heroes share one world. What you finish together stays done; each hero keeps their own gear and levels.</p><h2>Or an arena</h2><p>Waves of monsters by level range, champions to beat, a reward chest after every win. The same heroes: what you earn there is yours in the world too.</p></div>`; return; }
    detail.innerHTML = `<h2>${esc(w.name)}</h2>
      <p class="scr-worlds-meta">${w.public ? 'Public' : 'Invite only'} · ${fmt(w.players)} of ${fmt(w.seats)} playing${w.names?.length ? `: ${esc(w.names.join(', '))}` : ''}</p>
      <p class="scr-worlds-meta">${w.kind === 'arena' ? `An arena: waves of monsters by level, champions to beat, a reward chest for every win · ${fmt(w.arena?.wins || 0)} matches won here` : `${fmt(w.quests || 0)} quests finished in this world`}</p>
      <div class="scr-worlds-code"><span>Code</span><b>${esc(w.code)}</b></div>
      <div class="scr-worlds-qr" aria-label="QR code to join"></div>
      <div class="scr-worlds-share">
        <button type="button" class="ow-btn ow-small" data-act="copy">${glyph('scroll', 16)}<span>Copy invite link</span></button>
        ${w.mine ? `<button type="button" class="ow-btn ow-small ow-danger" data-act="remove">${glyph('trash', 16)}<span>Remove</span></button>` : ''}
      </div>`;
    qrSvg(inviteUrl(w.code)).then(svg => { const q = detail.querySelector('.scr-worlds-qr'); if (q && st.sel === w.code) q.innerHTML = svg; }).catch(() => {});
  }

  async function load() {
    st.loading = true; draw();
    try {
      if (app.net.state !== 'open') await app.net.connect();
      const r = await app.net.request({ t: 'worlds' }, 'worlds');
      st.list = r.list || [];
      if (st.made) st.sel = st.made;
      if (!st.list.find(w => w.code === st.sel)) st.sel = want && !st.list.find(w => w.code === want) ? null : st.list[0]?.code || null;
      st.msg = want && !st.list.find(w => w.code === want) ? `Invited to ${want}: press Join by code, or Enter once it is listed.` : '';
    } catch (e) { st.msg = e.message || 'Could not reach the world server. It keeps trying.'; }
    st.loading = false; draw();
    setTimeout(() => focusQuiet(root.querySelector('.scr-worlds-card[aria-selected="true"]') || root.querySelector('[data-act="new"]')), 30);
  }

  function join(code) {
    code = cleanCode(code);
    if (!code || st.joining) return;
    st.joining = true; st.msg = `Walking into ${code}…`; draw();
    app.net.world = code; app.net.char = opts.char;
    const done = () => { offEnter(); offErr(); clearTimeout(timer); };
    const offEnter = app.on('enter', m => { done(); app.world = m.world; app.go('play', { enter: m }); });
    const offErr = app.on('err', m => { if (m.quiet) return; done(); st.joining = false; app.net.world = null; st.msg = m.msg || 'Could not join that world.'; draw(); });
    const timer = setTimeout(() => { done(); st.joining = false; st.msg = 'The world did not answer. Try again.'; draw(); }, 12000);
    if (!app.net.send({ t: 'join', code, char: opts.char })) { done(); st.joining = false; st.msg = 'Not connected to the world server yet.'; draw(); }
  }

  function newWorld(kind = 'world') {
    const arena = kind === 'arena';
    const w = openWin({
      id: 'scr-worlds-new', title: arena ? 'A new arena' : 'A new world', size: 'narrow', cls: 'scr-worlds-form',
      render: () => `${arena ? '<p class="scr-worlds-why">A great arena and its court: pick a bracket for your level, fight five waves, open your reward chest. Champions wait for those who climb.</p>' : ''}<label class="scr-worlds-label" for="scr-worlds-name">Name</label>
        <input id="scr-worlds-name" class="ow-input" maxlength="28" autocomplete="off" value="${esc(arena ? (opts.name ? `${opts.name}'s Arena` : 'The Grand Arena') : opts.name ? `${opts.name}'s Vale` : 'A New Oath')}">
        <div class="scr-worlds-toggle" role="radiogroup" aria-label="Who can join">
          <button type="button" class="ow-btn" data-pub="1" aria-pressed="true">${glyph('globe', 18)}<span>Public</span></button>
          <button type="button" class="ow-btn" data-pub="0" aria-pressed="false">${glyph('lockOpen', 18)}<span>Invite only</span></button>
        </div>
        <p class="scr-worlds-why ow-dim">Public ${arena ? 'arenas' : 'worlds'} are listed for everyone; invite-only ones need the code.</p>
        <p class="scr-worlds-err ow-bad" role="status"></p>`,
      foot: `<button type="button" class="ow-btn ow-ghost" data-close>Cancel</button><button type="button" class="ow-btn ow-primary" data-make>${glyph('check', 18)}<span>Make it</span></button>`,
    });
    let pub = true;
    w.el.addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.close != null) return w.close();
      if (t.dataset.pub) { pub = t.dataset.pub === '1'; w.el.querySelectorAll('[data-pub]').forEach(b => b.setAttribute('aria-pressed', String(b === t))); return; }
      if (t.dataset.make != null) {
        t.disabled = true;
        try {
          const r = await app.net.request({ t: 'worldNew', name: w.el.querySelector('input').value, public: pub, kind }, 'worlds');
          w.close(); st.list = r.list || []; st.sel = r.made; st.made = r.made; draw();
          if (r.made) join(r.made);
        } catch (err) { t.disabled = false; w.el.querySelector('.scr-worlds-err').textContent = err.message; }
      }
    });
    setTimeout(() => w.el.querySelector('input')?.select(), 30);
  }

  function byCode() {
    const w = openWin({
      id: 'scr-worlds-code', title: 'Join by code', size: 'narrow', cls: 'scr-worlds-form',
      render: () => `<label class="scr-worlds-label" for="scr-worlds-code-in">The four letters a friend shares</label>
        <input id="scr-worlds-code-in" class="ow-input scr-worlds-code-in" maxlength="${CODE_LENGTH}" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(want || '')}" placeholder="ABCD">
        <p class="scr-worlds-err ow-bad" role="status"></p>`,
      foot: `<button type="button" class="ow-btn ow-ghost" data-close>Cancel</button><button type="button" class="ow-btn ow-primary" data-go>${glyph('next', 18)}<span>Join</span></button>`,
    });
    const input = w.el.querySelector('input');
    input.addEventListener('input', () => { input.value = [...input.value.toUpperCase()].filter(c => CODE_ALPHABET.includes(c)).join('').slice(0, CODE_LENGTH); });
    const go = () => { const c = cleanCode(input.value); if (!c) { w.el.querySelector('.scr-worlds-err').textContent = `Four letters, like ${CODE_ALPHABET.slice(0, 4)}.`; return; } w.close(); join(c); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    w.el.addEventListener('click', e => { if (e.target.closest('[data-go]')) go(); });
    setTimeout(() => input.focus(), 30);
  }

  root.addEventListener('click', async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.back != null) return app.go('chars', { select: opts.char });
    if (t.dataset.code) { st.sel = t.dataset.code; draw(); return; }
    const act = t.dataset.act;
    if (act === 'menu') return app.openWindow('menu', { where: 'worlds' });
    if (act === 'refresh') return load();
    if (act === 'join') return join(st.sel);
    if (act === 'new') return newWorld();
    if (act === 'arena') return newWorld('arena');
    if (act === 'code') return byCode();
    if (act === 'copy') {
      const link = inviteUrl(st.sel);
      try { await navigator.clipboard.writeText(link); st.msg = 'Invite link copied.'; } catch { st.msg = `Invite link: ${link}`; }
      return draw();
    }
    if (act === 'remove') {
      const w = selected(); if (!w) return;
      if (!await ask({ title: `Remove ${w.name}?`, text: 'The world and everything done in it will be gone. Characters keep their gear and levels.', ok: 'Remove', cancel: 'Keep', danger: true })) return;
      try { const r = await app.net.request({ t: 'worldDel', code: w.code }, 'worlds'); st.list = r.list || []; st.sel = st.list[0]?.code || null; st.msg = `${w.name} was removed.`; }
      catch (err) { st.msg = err.message; }
      draw();
    }
  });
  list.addEventListener('dblclick', e => { const c = e.target.closest('[data-code]'); if (c) join(c.dataset.code); });

  load();
  return { get view() { return st.loading ? 'loading' : 'ready'; }, close() {} };
}
