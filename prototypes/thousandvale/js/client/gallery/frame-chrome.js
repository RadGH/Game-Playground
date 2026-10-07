// UI gallery — what the frame page draws that is NOT the game: the iPhone 15 Pro's Dynamic Island and home indicator
// (so "nothing under the notch" can be judged by eye), an optional safe-area outline, and — when the page is opened
// directly on a real phone, with no gallery around it — a small scene picker.
import { SCENES, GROUPS } from './scenes.js';

export function installFrameChrome({ GX, scene }) {
  const html = document.documentElement;
  const phone = GX.device.startsWith('phone');
  if (phone && !GX.real) {
    const d = document.createElement('div');
    d.className = 'gallery-device'; d.setAttribute('aria-hidden', 'true');
    d.innerHTML = '<i class="gd-island"></i><i class="gd-home"></i><i class="gd-safe"></i>';
    document.body.appendChild(d);
    if (GX.params.get('safe') === '1') html.dataset.showSafe = '1';
  }
  if (!GX.top || GX.params.get('freeze') === '1') return;   // inside the gallery, or a test's still picture: no picker
  // opened on its own (a phone, or a deep link): a picker so every scene is one tap away
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'gallery-pick'; btn.textContent = 'Scenes'; btn.setAttribute('aria-label', 'Pick another scene');
  const sheet = document.createElement('div');
  sheet.className = 'gallery-sheet'; sheet.hidden = true;
  const url = (id, more = {}) => { const p = new URLSearchParams(GX.params); p.set('scene', id); for (const [k, v] of Object.entries(more)) p.set(k, v); return location.pathname + '?' + p; };
  const groups = GROUPS.map(g => `<h4>${g}</h4>` + SCENES.filter(s => s.group === g).map(s => `<a href="${url(s.id)}"${s.id === scene.id ? ' class="on"' : ''}>${s.title}</a>`).join('')).join('');
  sheet.innerHTML = `<header><strong>Thousandvale interface</strong><button type="button" class="gs-x" aria-label="Close">×</button></header>
    <p class="gs-row"><a href="${url(scene.id, { layout: 'proposed' })}"${GX.layout === 'proposed' ? ' class="on"' : ''}>Proposed phone layout</a><a href="${url(scene.id, { layout: 'current' })}"${GX.layout === 'current' ? ' class="on"' : ''}>The game today</a></p>
    <p class="gs-row"><a href="${url(scene.id, { variant: 'a' })}"${GX.variant === 'a' ? ' class="on"' : ''}>Variant A</a><a href="${url(scene.id, { variant: 'b' })}"${GX.variant === 'b' ? ' class="on"' : ''}>Variant B</a><a href="ui-gallery.html#scene=${scene.id}">Full gallery</a></p>
    <p class="gs-notes">${(scene.notes?.phone || scene.notes?.all || '').replace(/</g, '&lt;')}</p><div class="gs-list">${groups}</div>`;
  btn.onclick = () => { sheet.hidden = !sheet.hidden; };
  sheet.querySelector('.gs-x').onclick = () => { sheet.hidden = true; };
  document.body.append(btn, sheet);
}
