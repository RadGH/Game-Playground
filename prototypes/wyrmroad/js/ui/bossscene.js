// The short story scene before an Act II/III boss (chapter `bossScene`, data/story-acts.json), played ON the street
// while the fight holds (the sim's `bossScene` event; js/sim/brawl.js releaseHold). The street stays in view behind a
// speech box at the bottom of the stage: portrait (from the 3D model), name, the line revealed quickly, "3 / 5", a
// place line on the first line. Advance: Attack / Jump (A / Space / Enter / a click or tap on the box); the first
// press finishes the line. Skip: Esc / Start / the Skip button.
// Online the host reads it for everyone: guests see the same scene with "The host is reading" and no Skip; the room
// goes on when the host finishes (or after the scene's time, server/room.js — a room never freezes).
//
//   const sc = openBossScene(app, { host: stageEl, sceneId, lead, canSkip, onDone })
//   sc.next(); sc.skip(); sc.close();  sc.open
import { icon } from './icons.js';
import { esc } from './text.js';
import { keyLabel } from '../input/bindings.js';

const CPS = 70;                      // letters a second as a line appears

export function openBossScene(app, { host, sceneId, lead = null, canSkip = true, onDone = () => {}, scheme = 'kb' }) {
  const { data } = app;
  const scene = data.story.scenes[sceneId];
  if (!scene || !scene.lines?.length) { onDone(); return { open: false, next() {}, skip() {}, close() {} }; }
  const el = document.createElement('div');
  el.className = 'wr-bscene';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', scene.place || 'Before the fight');
  const k = a => (scheme === 'touch' ? '' : keyLabel(scheme, a));
  el.innerHTML = `<div class="wr-bscene-box">
      <div class="wr-portrait wr-portrait-md wr-bscene-face"></div>
      <div class="wr-bscene-main">
        <p class="wr-bscene-head"><b class="wr-bscene-name"></b><span class="wr-bscene-place"></span><span class="wr-grow"></span><small class="wr-bscene-count"></small></p>
        <p class="wr-bscene-text" aria-live="polite"></p>
        <div class="wr-bscene-acts">
          ${canSkip ? `<button type="button" class="wr-btn wr-small wr-ghost" data-bs="skip">${icon('next')}<span>Skip</span>${k('pause') ? `<kbd>${esc(k('pause'))}</kbd>` : ''}</button>` : '<span class="wr-bscene-wait">The host is reading</span>'}
          <button type="button" class="wr-btn wr-small wr-primary" data-bs="next">${icon('play')}<span>Next</span>${k('jump') ? `<kbd>${esc(k('jump'))}</kbd>` : ''}</button>
        </div>
      </div>
    </div>`;
  host.append(el);
  const face = el.querySelector('.wr-bscene-face'), nameEl = el.querySelector('.wr-bscene-name'), textEl = el.querySelector('.wr-bscene-text');
  let i = 0, shown = 0, t0 = 0, open = true, raf = 0;

  function speaker(id) {
    if (id === 'hero') return { name: lead?.name || 'You', spec: lead?.look ? { look: lead.look } : null };
    const sp = data.story.speakers[id] || { name: 'Someone' };
    if (sp.boss) { const b = data.enemies.bosses[sp.boss]; return { name: sp.name, spec: b?.body === 'creature' ? { creature: b.look } : b ? { look: b.look } : null }; }
    if (sp.look) return { name: sp.name, spec: { look: sp.look } };
    return { name: sp.name, spec: null, voice: true };
  }
  function line() {
    const [who, text] = scene.lines[i];
    const sp = speaker(who);
    nameEl.textContent = sp.name;
    el.querySelector('.wr-bscene-place').textContent = i === 0 && scene.place ? scene.place : '';
    el.querySelector('.wr-bscene-count').textContent = `${i + 1} / ${scene.lines.length}`;
    el.classList.toggle('wr-bscene-voice', !!sp.voice);
    face.innerHTML = sp.voice ? '<span class="wr-voice-mark"></span>' : '<span class="wr-portrait-wait"></span>';
    if (sp.spec) app.portrait(sp.spec, 160).then(url => { if (url && open && scene.lines[i]?.[0] === who) face.innerHTML = `<img src="${url}" alt="">`; });
    shown = 0; t0 = performance.now(); textEl.textContent = ''; textEl.dataset.full = text;
  }
  function tick() {
    if (!open) return;
    raf = requestAnimationFrame(tick);
    const full = textEl.dataset.full || '';
    const want = Math.min(full.length, Math.floor((performance.now() - t0) / 1000 * CPS));
    if (want !== shown) { shown = want; textEl.textContent = full.slice(0, shown); }
  }
  function next() {
    if (!open) return;
    const full = textEl.dataset.full || '';
    if (shown < full.length) { shown = full.length; t0 = -1e9; textEl.textContent = full; return; }
    app.audio.play('ui.click');
    if (i < scene.lines.length - 1) { i++; line(); return; }
    finish();
  }
  function finish() { if (!open) return; close(); onDone(); }
  function close() { if (!open) return; open = false; cancelAnimationFrame(raf); el.remove(); }
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-bs]');
    if (b?.dataset.bs === 'skip') { if (canSkip) finish(); return; }
    next();
  });
  line(); tick();
  setTimeout(() => el.querySelector('[data-bs="next"]')?.focus({ preventScroll: true }), 30);
  return { get open() { return open; }, next, skip() { if (canSkip) finish(); }, close, el, get line() { return i; }, lines: scene.lines.length };
}
