// Settings, kept per device (app.settings → localStorage): Game (camera, aiming, what shows over the world),
// Graphics (quality), Sound, and Controls — every action from the one binding table (input/bindings.js) with its keys
// and controller button, each rebindable (a key moves from any action that had it: one owner per key) and a reset.
import { openWin, esc } from './kit.js';
import { glyph } from './icons.js';
import { fmt } from '../../../../../shared/format.js';
import { ACTIONS, keyName, padName, rebind, saveBindings, resetBindings } from '../input/bindings.js';

const TABS = [{ id: 'game', label: 'Game' }, { id: 'graphics', label: 'Graphics' }, { id: 'sound', label: 'Sound' }, { id: 'controls', label: 'Controls' }];
const QUALITY = [['low', 'Low', 'Fewer trees, no shadows, sharper on old phones'], ['medium', 'Medium', 'Shadows near you, most trees'], ['high', 'High', 'Every tree, sharper shadows, full detail']];

export function open(app, opts = {}) {
  const S = app.settings;
  const set = (k, v) => {
    S[k] = v; app.saveSettings();
    if (k === 'quality') app.view?.setQuality?.(v);
    if (k === 'volume') app.sound?.setVolume?.(v);
    if (k === 'sfxOn' && app.sound) app.sound.setVolume?.(v ? S.volume : 0);
  };
  const toggle = (k, label, help) => `<label class="ow-check ow-set-row"><input type="checkbox" data-bool="${k}" ${S[k] ? 'checked' : ''}><span><b>${esc(label)}</b>${help ? `<small>${esc(help)}</small>` : ''}</span></label>`;
  const slider = (k, label, min, max, step, shown) => `<label class="ow-set-row ow-set-slide"><span><b>${esc(label)}</b><small data-out="${k}">${esc(shown(S[k]))}</small></span><input type="range" class="ow-range" data-num="${k}" min="${min}" max="${max}" step="${step}" value="${S[k]}"></label>`;
  const SHOW = { sens: v => `${fmt(v, { decimals: 1 })}×`, fov: v => `${fmt(v)}°`, cameraDist: v => `${fmt(v, { decimals: 1 })} m`, volume: v => `${fmt(Math.round(v * 100))}%` };
  const w = openWin({
    id: 'settings', title: 'Settings', size: 'wide', cls: 'ow-set', tabs: TABS, tab: opts.tab || 'game',
    render(body, tab, win) {
      if (tab === 'game') {
        body.innerHTML = `<section class="ow-section"><h3>Camera and aim</h3>
          ${slider('sens', 'Turning speed', 0.3, 3, 0.1, SHOW.sens)}
          ${toggle('invertY', 'Invert up and down', 'Push forward to look down')}
          ${slider('fov', 'Field of view', 50, 90, 1, SHOW.fov)}
          ${slider('cameraDist', 'Camera distance', 2.5, 9, 0.1, SHOW.cameraDist)}
          ${toggle('quickCast', 'Quick-cast ground spells', 'Ground spells land at the crosshair as soon as you press them, without showing where first')}
          ${toggle('shake', 'Camera shake on big hits', '')}
        </section><section class="ow-section"><h3>Over the world</h3>
          ${toggle('names', 'Name tags', 'Names and health bars over people and monsters near you')}
          ${toggle('numbers', 'Damage numbers', 'The numbers that rise from every hit and heal')}
        </section>`;
      } else if (tab === 'graphics') {
        body.innerHTML = `<section class="ow-section"><h3>Quality</h3><div class="ow-set-choices">${QUALITY.map(([id, name, help]) => `<button type="button" class="ow-set-choice${S.quality === id ? ' ow-set-on' : ''}" data-quality="${id}" ${S.quality === id ? 'data-primary' : ''}><b>${esc(name)}</b><small>${esc(help)}</small></button>`).join('')}</div></section>`;
      } else if (tab === 'sound') {
        body.innerHTML = `<section class="ow-section"><h3>Sound</h3>${toggle('sfxOn', 'Sound effects', '')}${slider('volume', 'Volume', 0, 1, 0.05, SHOW.volume)}</section>`;
      } else {
        body.innerHTML = controlsHtml(app, win.data.listen);
      }
      body.querySelectorAll('[data-bool]').forEach(i => { i.onchange = () => set(i.dataset.bool, i.checked); });
      body.querySelectorAll('[data-num]').forEach(i => { i.oninput = () => { const k = i.dataset.num; set(k, +i.value); const o = body.querySelector(`[data-out="${k}"]`); if (o) o.textContent = SHOW[k](+i.value); }; });
      body.querySelectorAll('[data-quality]').forEach(b => { b.onclick = () => { set('quality', b.dataset.quality); win.render(); }; });
      body.querySelectorAll('[data-rebind]').forEach(b => { b.onclick = () => listen(app, win, b.dataset.rebind, b.dataset.pad === '1'); });
      body.querySelector('[data-reset]')?.addEventListener('click', () => {
        const fresh = resetBindings();
        for (const k of Object.keys(app.bindings)) delete app.bindings[k];
        Object.assign(app.bindings, fresh);
        app.emit('bindings', app.bindings); win.render();
      });
    },
  });
  return w;
}

function controlsHtml(app, listening) {
  const groups = [...new Set(ACTIONS.map(a => a[0]))];
  const B = app.bindings;
  return `<div class="ow-set-ctl">${groups.map(g => `<section class="ow-section"><h3>${esc(g)}</h3><table class="ow-set-table"><thead><tr><th>Action</th><th>${glyph('keyboard', 16)} Keyboard and mouse</th><th>${glyph('pad', 16)} Controller</th></tr></thead><tbody>
    ${ACTIONS.filter(a => a[0] === g).map(([, id, name]) => {
      const keys = B[id]?.keys || [], pad = B[id]?.pad || [];
      const slot = /^slot(\d)$/.exec(id);
      const padText = slot ? `${+slot[1] <= 4 ? 'LB' : 'RB'} + ${['A', 'B', 'X', 'Y'][(+slot[1] - 1) % 4]}` : pad.map(padName).join(', ') || 'None';
      return `<tr><td>${esc(name)}</td>
        <td><button type="button" class="ow-set-key${listening?.id === id && !listening.pad ? ' ow-set-wait' : ''}" data-rebind="${id}">${esc(keys.map(keyName).join(', ') || 'None')}</button></td>
        <td>${slot ? `<span class="ow-set-fixed">${esc(padText)}</span>` : `<button type="button" class="ow-set-key${listening?.id === id && listening.pad ? ' ow-set-wait' : ''}" data-rebind="${id}" data-pad="1">${esc(padText)}</button>`}</td></tr>`;
    }).join('')}</tbody></table></section>`).join('')}
    <div class="ow-row"><span class="ow-spacer"></span><button type="button" class="ow-btn ow-ghost" data-reset>${glyph('refresh', 16)}<span>Reset all controls</span></button></div></div>`;
}

/** "Press a key" — a small dialog in the shared dialog's look; Esc (or the Cancel button) leaves the key as it was. */
function listen(app, win, id, pad) {
  const name = ACTIONS.find(a => a[1] === id)?.[2] || '';
  const box = document.createElement('div');
  box.className = 'modal gdlg-modal';
  box.dataset.padCapture = '1';
  box.innerHTML = `<div class="gdlg"><h2 class="gdlg-title">${esc(name)}</h2><p class="gdlg-text">${pad ? 'Press a controller button.' : 'Press a key or a mouse button.'}</p><div class="gdlg-btns"><button type="button" class="gdlg-btn" data-cancel>Cancel</button></div></div>`;
  document.body.append(box);
  let raf = 0;
  const prev = [];
  const done = code => {
    removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onMouse, true); cancelAnimationFrame(raf); box.remove();
    if (code != null) { rebind(app.bindings, id, code, { pad }); saveBindings(app.bindings); app.emit('bindings', app.bindings); }
    win.render();
  };
  const onKey = e => { e.preventDefault(); e.stopPropagation(); if (e.code === 'Escape') return done(null); if (!pad) done(e.code); };
  const onMouse = e => { if (pad || e.target.closest('[data-cancel]')) return; e.preventDefault(); e.stopPropagation(); done('Mouse' + e.button); };
  box.querySelector('[data-cancel]').onclick = () => done(null);
  addEventListener('keydown', onKey, true);
  addEventListener('mousedown', onMouse, true);
  if (pad) {
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const p = [...(navigator.getGamepads?.() || [])].find(x => x && x.connected); if (!p) return;
      p.buttons.forEach((b, i) => { if (b.pressed && prev[i] === false && i !== 4 && i !== 5) done(i); prev[i] = b.pressed; });
    };
    raf = requestAnimationFrame(loop);
  }
}
