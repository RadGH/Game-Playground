// The loading screen between places (owner 2026-11-27: "regions separated by travel points and loading screens";
// docs/BRAINSTORM-2026-11-27-regions.md §1): the region's painted picture, its name and levels (coloured against your
// level), one line about it, a tip, and a bar that moves with the real steps of building the place — never a frozen
// frame (lessons: no frozen screens). place.js drives it.
//
//   const L = showLoading(app, { id, row })   row = data/regions/index.json region row
//   L.step(share 0..1, words)   L.done()
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function showLoading(app, { id, row }) {
  const el = document.createElement('div');
  el.className = 'ow-travelload';
  el.setAttribute('role', 'status');
  const lv = row?.levels, mine = app.me?.char?.level || 1;
  const tone = !lv ? '' : mine < lv[0] - 1 ? 'hard' : mine > lv[1] + 2 ? 'easy' : 'fair';
  const art = row?.loading?.art ? `url("${new URL(`../../${row.loading.art}`, import.meta.url).href}")` : 'none';
  el.innerHTML = `<div class="ow-travelload-art" data-region="${esc(id)}" style="--art:${esc(art)}"></div>
    <div class="ow-travelload-card">
      <h2>${esc(row?.name || 'Travelling')}</h2>
      ${lv ? `<p class="ow-travelload-lv ${tone}">Levels ${lv[0]}-${lv[1]}${tone === 'hard' ? ' · dangerous for you' : tone === 'easy' ? ' · easy for you' : ''}</p>` : ''}
      ${row?.loading?.line ? `<p class="ow-travelload-line">${esc(row.loading.line)}</p>` : ''}
      <div class="ow-travelload-bar"><i></i></div>
      <p class="ow-travelload-step">Setting out</p>
      ${row?.loading?.tip ? `<p class="ow-travelload-tip"><b>Tip</b> ${esc(row.loading.tip)}</p>` : ''}
    </div>`;   // lint-ok: every value escaped
  document.body.appendChild(el);
  const bar = el.querySelector('.ow-travelload-bar i'), words = el.querySelector('.ow-travelload-step');
  const shownAt = performance.now();
  return {
    step(k, text) { bar.style.width = `${Math.round(Math.max(0, Math.min(1, k)) * 100)}%`; if (text) words.textContent = text; },
    done() {
      // never a flash: the screen stays at least long enough to read the name, then fades
      const wait = Math.max(0, 900 - (performance.now() - shownAt));
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, wait);
    },
  };
}
