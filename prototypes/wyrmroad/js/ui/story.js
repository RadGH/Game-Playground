// Story scenes (data/story.json): the chapter's own street drawn behind (view.setChapter + view.scenic), the place
// name, and a speech box at the bottom with the speaker's portrait drawn from their 3D model, a name plate and the
// line revealed quickly. Advance: A / Space / Enter / tap (the first press finishes the line). Skip: Esc / B / the
// Skip button. The last scene ends with the two-ending choice as two big buttons; the ending scene follows and the
// hero's ending is saved.
import { icon } from './icons.js';
import { esc } from './text.js';
import { keyLabel } from '../input/bindings.js';

const CPS = 70;                      // letters a second as a line appears

export function storyScreen(app, opts = {}) {
  const { data } = app;
  const lead = app.hero(opts.heroId) || app.hero(app.save.lastHero);
  const scene = data.story.scenes[opts.scene];
  const then = opts.then || (() => app.go('map', { heroId: lead?.id }));
  if (!scene) { then(); return; }
  const chapterId = opts.chapter || data.chapters.chapters.find(c => c.intro === opts.scene || c.outro === opts.scene)?.id || 'crownhollow';
  app.view.setChapter(chapterId); app.view.scenic(true);
  app.audio.ambience(chapterId);

  let i = 0, shown = 0, t0 = performance.now(), choosing = false, done = false;
  app.padBusy = true;                  // the pad talks to the scene, not to the Skip button, until the choice
  app.ui.innerHTML = `<section class="wr-story" data-scene="${esc(opts.scene)}">
    <header class="wr-story-top"><p class="wr-story-place">${esc(scene.place)}</p><div class="wr-grow"></div>
      <button type="button" class="wr-btn wr-small" data-act="skip">${icon('next')}<span>Skip</span><kbd data-hint="skip"></kbd></button>
      <button type="button" class="wr-icon-btn" data-act="menu" aria-label="Menu">${icon('menu')}</button></header>
    <div class="wr-story-tap" data-act="next"></div>
    <div class="wr-story-box" data-act="next">
      <div class="wr-story-face"><div class="wr-portrait wr-portrait-story"></div></div>
      <div class="wr-story-words"><p class="wr-story-name"></p><p class="wr-story-text" aria-live="polite"></p>
        <p class="wr-story-more"><span class="wr-story-count"></span><span>${icon('next')}<kbd data-hint="next"></kbd></span></p></div>
    </div>
    <div class="wr-story-choice" hidden></div>
  </section>`;
  const root = app.ui.firstElementChild;
  const nameEl = root.querySelector('.wr-story-name'), textEl = root.querySelector('.wr-story-text'), face = root.querySelector('.wr-portrait-story');
  const hints = () => {
    const d = app.input.last;
    root.querySelector('[data-hint="next"]').textContent = d === 'pad' ? 'A' : d === 'touch' ? '' : 'Space';
    root.querySelector('[data-hint="skip"]').textContent = d === 'pad' ? 'B' : d === 'touch' ? '' : 'Esc';
  };
  hints(); const offDev = app.input.onDevice(hints);

  function speaker(id) {
    if (id === 'hero') return { name: lead?.name || 'You', spec: lead ? { look: app.heroLook(lead) } : null };
    const sp = data.story.speakers[id] || { name: 'Someone' };
    if (sp.boss) { const b = data.enemies.bosses[sp.boss]; return { name: sp.name, spec: b?.body === 'creature' ? { creature: b.look } : b ? { look: b.look } : null }; }
    if (sp.look) return { name: sp.name, spec: { look: sp.look } };
    return { name: sp.name, spec: null, voice: true };
  }
  function line() {
    const [who, text] = scene.lines[i];
    const sp = speaker(who);
    nameEl.textContent = sp.name; nameEl.classList.toggle('wr-voice', !!sp.voice);
    root.querySelector('.wr-story-box').classList.toggle('wr-story-voice', !!sp.voice);
    root.querySelector('.wr-story-count').textContent = `${i + 1} / ${scene.lines.length}`;
    face.innerHTML = sp.voice ? '<span class="wr-voice-mark"></span>' : '<span class="wr-portrait-wait"></span>';
    if (sp.spec) app.portrait(sp.spec, 192).then(url => { if (url && scene.lines[i]?.[0] === who) face.innerHTML = `<img src="${url}" alt="">`; });
    shown = 0; t0 = performance.now(); textEl.textContent = ''; textEl.dataset.full = text;
  }
  function next() {
    if (choosing || done) return;
    const full = textEl.dataset.full || '';
    if (shown < full.length) { shown = full.length; textEl.textContent = full; return; }
    app.audio.play('ui.click');
    if (++i < scene.lines.length) return line();
    finish();
  }
  function finish() {
    if (scene.choice) return choose();
    done = true; then();
  }
  function choose() {
    choosing = true;
    const c = scene.choice, box = root.querySelector('.wr-story-choice');
    const blurb = { free: 'Let the wyrm rise. The bell-stones stop being chains, and the road is only a road.', hold: 'Keep the wyrm on the leash, with your own hand on it instead of his.' };
    box.innerHTML = `<p class="wr-choice-prompt">${esc(c.prompt)}</p><div class="wr-choice-row">${c.options.map(o => `<button type="button" class="wr-choice wr-choice-${o.id}" data-pick="${o.id}">${icon(o.id === 'free' ? 'breaker' : 'holy_light')}<b>${esc(o.label)}</b><small>${esc(blurb[o.id] || '')}</small></button>`).join('')}</div>`;
    box.hidden = false; root.querySelector('.wr-story-box').hidden = true; app.padBusy = false;
    setTimeout(() => box.querySelector('button')?.focus({ preventScroll: true }), 40);
  }
  root.addEventListener('click', e => {
    const p = e.target.closest('[data-pick]');
    if (p) {
      const o = scene.choice.options.find(x => x.id === p.dataset.pick);
      if (lead) { lead.story.ending = o.id; app.saveNow(); }
      app.audio.play('quest.complete');
      done = true;
      app.go('story', { scene: o.scene, chapter: chapterId, heroId: lead?.id, then: opts.afterEnding || (() => app.go('map', { heroId: lead?.id })) });
      return;
    }
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'menu') return app.openMenu();
    if (b.dataset.act === 'skip') { if (scene.choice) { i = scene.lines.length - 1; shown = 1e9; return choose(); } done = true; return then(); }
    next();
  });
  // keys + controller: A / Space / Enter next, Esc / B skip (the pad's menu nav is busy on this screen only while talking)
  const offKey = app.input.onKey(code => {
    if (document.querySelector('.wr-sheet, .modal') || choosing) return;
    if (code === 'Space' || code === 'Enter' || code === 'KeyJ') next();
    else if (code === 'Escape') root.querySelector('[data-act="skip"]').click();
  });
  const padR = app.input.pad(0), pads = [0, 1, 2, 3].map(k => (k ? app.input.pad(k) : padR));
  app.loop = dt => {
    const full = textEl.dataset.full || '';
    if (shown < full.length) { shown = Math.min(full.length, Math.floor((performance.now() - t0) / 1000 * CPS)); textEl.textContent = full.slice(0, shown); }
    if (!document.querySelector('.wr-sheet, .modal') && !choosing) for (const p of pads) { const r = p.read(); if (r.attack) next(); else if (r.jump) root.querySelector('[data-act="skip"]').click(); }
    app.view.update(app.sceneG(chapterId), 1, dt);
  };
  line();
  return () => { offKey(); offDev(); for (const p of pads) p.release(); };
}
