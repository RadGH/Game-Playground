// Character select (its own screen — lessons rule 13): my saved characters as cards, the selected one standing on a
// live 3D stage in their own look and gear. Play leads to the world list; New character to the creator; Retire asks
// first (shared/dialog.js). With no characters yet the screen invites you straight into the creator.
import { createPreview, summaryItems } from './creator.js';
import { esc, ask } from '../ui/kit.js';
import { glyph, uiIcon } from '../ui/icons.js';
import { fmt } from '../../../../../shared/format.js';

export async function show(app, opts = {}) {
  const ui = document.getElementById('ui');
  const st = { list: [], sel: opts.select || null, msg: '', loading: true };
  ui.innerHTML = `<section class="scr-chars" aria-label="Your heroes">
    <header class="scr-chars-bar">
      <button type="button" class="ow-x" data-back aria-label="Back">${glyph('back', 22)}</button>
      <h1>Your heroes</h1>
      <span class="ow-spacer"></span>
      <button type="button" class="ow-x" data-act="menu" aria-label="Menu">${uiIcon('menu', 22)}</button>
    </header>
    <div class="scr-chars-body">
      <div class="scr-chars-stage"><canvas class="scr-chars-canvas" aria-label="Selected hero"></canvas><p class="scr-chars-who"></p></div>
      <div class="scr-chars-panel">
        <div class="scr-chars-list" role="listbox" aria-label="Characters"></div>
        <div class="scr-chars-foot" data-lint-skip>
          <p class="scr-chars-msg" role="status"></p>
          <div class="scr-chars-btns">
            <button type="button" class="ow-btn ow-ghost" data-act="new">${glyph('plus', 18)}<span>New hero</span></button>
            <button type="button" class="ow-btn ow-ghost ow-danger" data-act="retire">${glyph('trash', 18)}<span>Retire</span></button>
            <button type="button" class="ow-btn ow-primary scr-chars-play" data-act="play">${glyph('next', 20)}<span>Play</span></button>
          </div>
        </div>
      </div>
    </div>
  </section>`;
  const root = ui.firstElementChild;
  const $ = s => root.querySelector(s);
  const list = $('.scr-chars-list'), msg = $('.scr-chars-msg');
  const preview = createPreview($('.scr-chars-canvas'), { quality: app.settings.quality });
  const rules = app.rules;

  const selected = () => st.list.find(c => c.id === st.sel) || null;
  function draw() {
    msg.textContent = st.msg;
    const has = st.list.length > 0;
    root.classList.toggle('scr-chars-empty-mode', !has && !st.loading);
    $('[data-act="play"]').disabled = !has;
    $('[data-act="retire"]').disabled = !has;
    if (st.loading) { list.innerHTML = '<p class="ow-empty">Calling your heroes…</p>'; return; }
    if (!has) {
      list.innerHTML = `<div class="scr-chars-empty"><h2>No heroes yet</h2><p>Brightwater Vale needs someone who keeps their word.</p>
        <button type="button" class="ow-btn ow-primary" data-act="new" data-primary>${glyph('plus', 18)}<span>Make your first hero</span></button></div>`;
      $('.scr-chars-who').textContent = '';
      return;
    }
    list.innerHTML = st.list.map(c => {
      const classes = c.classes.map(k => `${k.name} ${fmt(k.level)}`).join(' · ');
      const bg = rules.data.backgrounds.backgrounds[c.background]?.name || '';
      return `<button type="button" class="scr-chars-card" role="option" data-id="${esc(c.id)}" aria-selected="${c.id === st.sel}">
        <span class="scr-chars-lvl"><small>Level</small><b>${fmt(c.level)}</b></span>
        <span class="scr-chars-text"><b>${esc(c.name)}</b><span>${esc(classes)}</span><small>${esc(bg)} · ${glyph('coin', 14)} ${fmt(c.gold)} gold${c.inWorld ? ` · Now in world ${esc(c.inWorld)}` : ''}</small></span>
      </button>`;
    }).join('');
    const c = selected();
    if (c) {
      $('.scr-chars-who').textContent = `${c.name} — level ${fmt(c.level)}`;
      preview.show(c.look || { body: 'male' }, summaryItems(rules, c.gear));
    }
  }

  async function load() {
    st.loading = true; draw();
    try {
      if (app.net.state !== 'open') await app.net.connect();
      const r = await app.net.request({ t: 'chars' }, 'chars');
      st.list = r.list || [];
      if (!st.list.find(c => c.id === st.sel)) st.sel = st.list[0]?.id || null;
      st.msg = '';
    } catch (e) { st.list = []; st.msg = `${e.message || 'Could not load your heroes.'} The game keeps trying.`; }
    st.loading = false; draw();
    setTimeout(() => (root.querySelector('.scr-chars-card[aria-selected="true"]') || root.querySelector('[data-primary]'))?.focus({ preventScroll: true }), 30);
  }

  root.addEventListener('click', async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.back != null) return app.go('title');
    if (t.dataset.id) { st.sel = t.dataset.id; draw(); return; }
    const act = t.dataset.act;
    if (act === 'menu') return app.openWindow('menu', { where: 'chars' });
    if (act === 'new') return app.go('creator', { from: 'chars' });
    if (act === 'play') { const c = selected(); if (c) app.go('worlds', { char: c.id, name: c.name }); return; }
    if (act === 'retire') {
      const c = selected(); if (!c) return;
      const yes = await ask({ title: `Retire ${c.name}?`, text: `${c.name} and everything they carry will be gone for good. Worlds keep what you did together.`, ok: 'Retire', cancel: 'Keep', danger: true });
      if (!yes) return;
      try { const r = await app.net.request({ t: 'charDel', id: c.id }, 'chars'); st.list = r.list || []; st.sel = st.list[0]?.id || null; st.msg = `${c.name} has retired.`; }
      catch (err) { st.msg = err.message; }
      draw();
    }
  });
  list.addEventListener('dblclick', e => { const c = e.target.closest('[data-id]'); if (c) app.go('worlds', { char: c.dataset.id }); });

  const offOpen = app.net.on('open', () => { if (!st.list.length) load(); });
  load();
  return {
    get view() { return st.loading ? 'loading' : 'ready'; },
    close() { offOpen?.(); preview.dispose(); },
  };
}
