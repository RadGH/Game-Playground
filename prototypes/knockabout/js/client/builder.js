// The character builder (one player at a time, driven by that player's own controller or the mouse / touch).
//   Costume tab: a whole-costume preset stepper (Tumblefair's costumes — stepping one fills EVERY slot), then each piece
//                on its own: hat, top, bottom, shoes, cape, accessory, face marks, ears, extra gear — each with ‹ › to
//                step through the Chibi 2 parts for that slot and a row of colour swatches.
//   Face & body: people (race), every face part Tumblefair's / Thousandvale's editor offers, skin, body sliders.
// The character stands in the 3D view in the space the panel leaves (panel on the right in landscape, a bottom sheet
// held upright), turning slowly, rebuilt a moment after each change. Nothing inside the panel scrolls on its own: the
// panel is the only scroller (a nested scroller blanks the WebGL canvas on phones).
import { FACE_SLOTS, BODY_DIALS, BODY_PICKS, PALETTES, PART_NAMES, slotIds, customFrom } from '../../../thousandvale/js/client/ui/appearance-core.js';
import { WEAR_SLOTS, wearIds, wearHasColour, partName, CLOTH, RACES, RACE_NAMES, presets, withPreset, avatarOf, randomLook, wearOf } from './look.js';
import { createModel } from './puppet.js';
import { esc } from './feedback.js';

const FACE_ONLY = FACE_SLOTS.filter(s => !['accessory', 'extras', 'ears'].includes(s.slot));
const niceFace = (slot, id) => PART_NAMES[slot]?.[id] || partName(slot, id);

export function openBuilder({ player, view, nav, root, onChange, onClose, sounds, account = null }) {
  let look = JSON.parse(JSON.stringify(player.look)), tab = 'costume', model = null, closed = false, rebuild = 0, name = player.name;
  const el = document.createElement('div'); el.className = 'builder'; root.append(el);
  const sheet = document.createElement('div'); sheet.className = 'panel bsheet'; el.append(sheet);
  let custom = look.custom || customFrom(avatarOf({ ...look, wear: undefined })) || { body: {} };
  const commit = (redraw = true) => {
    look = { ...look, custom };
    clearTimeout(rebuild); rebuild = setTimeout(async () => { if (model && !closed) { await model.setAvatar(avatarOf(look)); } onChange?.({ look, name }); }, 140);
    if (redraw) draw();
  };
  const swatches = (list, val, attrs) => list.map(c => `<button class="sw${String(val || '').toLowerCase() === c ? ' on' : ''}" style="background:${c}" ${attrs} data-c="${c}" aria-label="colour ${c}"></button>`).join('');
  const stepper = (attrs, label) => `<button class="step" ${attrs} data-d="-1" aria-label="previous">‹</button><b class="sv">${esc(label)}</b><button class="step" ${attrs} data-d="1" aria-label="next">›</button>`;
  function draw() {
    const P = presets(), cur = look.preset ? P.find(p => p.id === look.preset) : null;
    const wear = look.wear || {};
    const costume = `
      <div class="b-row b-preset"><span>Whole costume</span>${stepper('data-preset', cur ? cur.name : 'Pick one…')}</div>
      <p class="note">A costume fills every piece below. Then change any piece on its own.</p>
      ${WEAR_SLOTS.map(({ slot, label }) => { const part = wear[slot] || { id: 'none' }; return `<div class="b-row"><span>${label}</span>${stepper(`data-wear="${slot}"`, partName(slot, part.id))}${wearHasColour(slot) && part.id !== 'none' ? `<div class="sws">${swatches(CLOTH, part.color, `data-wearc="${slot}"`)}</div>` : ''}</div>`; }).join('')}`;
    const face = `
      <div class="b-row"><span>People</span><div class="pills">${RACES.map(r => `<button class="pill${look.race === r ? ' on' : ''}" data-race="${r}">${RACE_NAMES[r]}</button>`).join('')}</div></div>
      <div class="b-row"><span>Skin</span><div class="sws">${swatches(PALETTES.skin, custom.body?.skin, 'data-skin')}</div></div>
      ${FACE_ONLY.map(s => { const ids = slotIds(s, look.race), v = s.slot === 'headShape' ? custom.headShape : custom[s.slot]?.id; return `<div class="b-row"><span>${s.label}</span>${stepper(`data-face="${s.slot}"`, niceFace(s.slot, v || ids[0]))}${s.color ? `<div class="sws">${swatches(PALETTES[s.color], custom[s.slot]?.color, `data-facec="${s.slot}"`)}</div>` : ''}</div>`; }).join('')}
      ${BODY_PICKS.map(p => `<div class="b-row"><span>${p.label}</span>${stepper(`data-pick="${p.key}"`, p.names?.[custom.body?.[p.key] ?? p.ids[0]] || custom.body?.[p.key] || p.ids[0])}</div>`).join('')}
      ${BODY_DIALS.map(d => `<label class="b-row"><span>${d.label}</span><input type="range" min="${d.min}" max="${d.max}" step="0.01" value="${custom.body?.[d.key] ?? (d.min + d.max) / 2}" data-dial="${d.key}"></label>`).join('')}`;
    sheet.innerHTML = `
      <div class="b-head" style="--seat:${player.color}"><i class="b-dot"></i><input class="b-name" maxlength="14" value="${esc(name)}" aria-label="Name" data-nav="1"><button class="btn small" data-random="1">Surprise me</button><button class="btn small primary" data-back="1" data-done="1">Done</button></div>
      <div class="tabs"><button class="tab${tab === 'costume' ? ' on' : ''}" data-tab="costume">Costume</button><button class="tab${tab === 'face' ? ' on' : ''}" data-tab="face">Face &amp; body</button></div>
      <div class="b-body">${tab === 'costume' ? costume : face}</div>
      <p class="note hint">${player.dev && player.dev !== 'touch' && player.dev !== 'mouse' ? 'Move with the stick / d-pad, A to pick, B when done.' : 'Tap a piece to change it.'}</p>
      ${account ? '<div class="b-acct"><span>Optional: sign in to keep this fighter on every device</span></div>' : ''}`;
    if (account) sheet.querySelector('.b-acct').append(account);      // accounts (2026-10-23): the same element every redraw
    nav.attach(sheet);
  }
  const step = (list, now, d) => list[(Math.max(0, list.indexOf(now)) + d + list.length) % list.length];
  sheet.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-done]')) return close();
    sounds?.('tap');
    const tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; return draw(); }
    if (t.closest('[data-random]')) { const r = randomLook(); look = { ...r }; custom = customFrom(avatarOf({ ...look, wear: undefined })) || { body: {} }; return commit(); }
    const pr = t.closest('[data-preset]');
    if (pr) { const P = presets(); if (!P.length) return; const ids = P.map(p => p.id); const id = look.preset ? step(ids, look.preset, +pr.dataset.d) : ids[pr.dataset.d > 0 ? 0 : ids.length - 1]; look = withPreset({ ...look, custom }, id); return commit(); }
    const w = t.closest('[data-wear]');
    if (w) { const slot = w.dataset.wear, ids = wearIds(slot), part = look.wear?.[slot] || { id: 'none' }; look = { ...look, wear: { ...(look.wear || {}), [slot]: { ...part, id: step(ids, part.id, +w.dataset.d) } } }; return commit(); }
    const wc = t.closest('[data-wearc]');
    if (wc) { const slot = wc.dataset.wearc, part = look.wear?.[slot] || { id: 'none' }; look = { ...look, wear: { ...(look.wear || {}), [slot]: { ...part, color: wc.dataset.c } } }; return commit(); }
    const race = t.closest('[data-race]');
    if (race) { const keep = look.wear; look = { race: race.dataset.race, seed: look.seed, v: 1 }; custom = customFrom(avatarOf(look)) || { body: {} }; look.wear = keep || wearOf(avatarOf(look)); return commit(); }
    const sk = t.closest('[data-skin]'); if (sk) { custom = { ...custom, body: { ...custom.body, skin: sk.dataset.c } }; return commit(); }
    const fc = t.closest('[data-facec]'); if (fc) { const s = fc.dataset.facec; custom = { ...custom, [s]: { ...(custom[s] || { id: FACE_SLOTS.find(x => x.slot === s).ids[0] }), color: fc.dataset.c } }; return commit(); }
    const f = t.closest('[data-face]');
    if (f) {
      const s = FACE_SLOTS.find(x => x.slot === f.dataset.face), ids = slotIds(s, look.race), now = s.slot === 'headShape' ? custom.headShape : custom[s.slot]?.id;
      const id = step(ids, now, +f.dataset.d);
      custom = s.slot === 'headShape' ? { ...custom, headShape: id } : { ...custom, [s.slot]: { ...(custom[s.slot] || {}), id } };
      return commit();
    }
    const pk = t.closest('[data-pick]');
    if (pk) { const p = BODY_PICKS.find(x => x.key === pk.dataset.pick); custom = { ...custom, body: { ...custom.body, [p.key]: step(p.ids, custom.body?.[p.key] ?? p.ids[0], +pk.dataset.d) } }; return commit(); }
  });
  sheet.addEventListener('input', e => {
    if (e.target.dataset.dial) { custom = { ...custom, body: { ...custom.body, [e.target.dataset.dial]: +e.target.value } }; commit(false); }
    if (e.target.classList.contains('b-name')) { name = e.target.value.replace(/[<>&"'`\\]/g, '').slice(0, 14); clearTimeout(rebuild); rebuild = setTimeout(() => onChange?.({ look, name }), 200); }
  });
  draw();
  // the character, standing in the free part of the screen
  let spin = 0;
  createModel(look).then(m => {
    if (closed) { m.dispose(); return; }
    model = m; view.world.add(m.group); m.group.position.set(0, 0, 0); m.setAnim('idle');
  });
  /** Put the character in the part of the screen the panel leaves: the left side (landscape) or the top (upright). */
  function frameModel() {
    const h = model ? model.metrics().totalHeight : 1.2, port = innerHeight > innerWidth;
    const cam = view.camera, tf = Math.tan(cam.fov * Math.PI / 360);
    const sheet = el.getBoundingClientRect();
    // the free area in screen fractions, and where its middle is in NDC
    const freeTop = port && sheet ? sheet.top / innerHeight : 1, freeLeft = !port && sheet ? sheet.left / innerWidth : 1;
    const ny = port ? 1 - freeTop * 1.12 : 0, nx = port ? 0 : freeLeft - 1;
    const frac = port ? Math.max(0.25, freeTop * 0.74) : 0.72;
    const d = h / (frac * 2 * tf);
    const camY = h * 0.62, mid = h * 0.5;
    const ay = Math.atan(ny * tf), ax = Math.atan(nx * tf * cam.aspect);
    const pitch = Math.atan((mid - camY) / d) - ay;                 // look a little below the body so it shows higher up
    const yaw = -ax;                                                // and a little to its right so it shows on the left
    const look = [Math.sin(yaw) * d, camY + Math.tan(pitch) * d, 0];
    view.lookAt([0, camY, d], look);
  }
  function tick(dt, edges) {
    if (closed) return;
    spin += dt * 0.5;
    if (model) { model.group.rotation.y = Math.sin(spin) * 0.6; model.update(dt); }
    frameModel();
    if (edges) {
      if (edges.x || edges.y) { const tabBtn = sheet.querySelector(`[data-tab="${tab === 'costume' ? 'face' : 'costume'}"]`); tabBtn?.click(); return; }
      if (nav.handle(edges)) sounds?.('move');
    }
  }
  function close() {
    if (closed) return; closed = true; clearTimeout(rebuild);
    onChange?.({ look: { ...look, custom }, name });
    model?.group.removeFromParent(); model?.dispose(); el.remove(); onClose?.();
  }
  return { tick, close, el };
}
