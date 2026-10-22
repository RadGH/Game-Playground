// Spell FX page tabs: "Shared effects" (spellfx-app.js, avatar-3d's own SpellFx) and "Thousandvale" (spellfx-tv.js, the
// game's class signatures, stars, forms, shots, beams, revives and island hazards). The Thousandvale stage is built the
// first time its tab opens, so the shared tab loads exactly as it always did. `#tv` (or `#tv&cls=starcaller`) opens it.
const tabs = document.getElementById('sfx-tabs');
const note = document.getElementById('tab-note');
const NOTES = {
  shared: note.innerHTML,
  tv: 'Thousandvale\'s own effects, imported straight from the game\'s client files: every class\'s signature shapes on top of the element effects, the Starcaller and Star Blade\'s gold stars, caster attack forms, shot models, held beams, revives and the Burning Isle\'s hazards. Pick a class and press a skill.',
};
let tv = null;

async function show(id) {
  for (const b of tabs.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === id);
  document.getElementById('tab-shared').hidden = id !== 'shared';
  document.getElementById('tab-tv').hidden = id !== 'tv';
  note.innerHTML = NOTES[id] || '';
  if (id === 'tv' && !tv) {
    tv = import('./spellfx-tv.js').then(m => m.openThousandvale(hashArgs())).catch(e => {
      console.error('[spellfx] Thousandvale tab', e);
      document.getElementById('tv-main').textContent = 'The Thousandvale stage could not load: ' + e.message;
      document.body.dataset.tvReady = 'error';
    });
  }
}
function hashArgs() {
  const h = location.hash.replace(/^#/, '');
  return Object.fromEntries(h.split('&').filter(Boolean).map(p => { const [k, v] = p.split('='); return [k, v == null ? true : decodeURIComponent(v)]; }));
}
tabs.addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) show(b.dataset.tab); });
if (hashArgs().tv) show('tv');
window.spellfxTabs = { show };
