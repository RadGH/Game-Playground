// UI gallery — the title screen's glue. In the game this lives inside js/client/main.js (initTitle / titleStep /
// toAppearance / toKit), next to the 3D preview figure, and is not a module the gallery can import. This is the SMALL part
// of it that fills the title cards (the markup is index.html's own; the editor and the kit step are the real modules).
// Asked of D-UI in docs/requests.md: move initTitle into js/client/title.js so this file can go away.
import { cleanName } from '../../net/protocol.js';

const STARTERS = ['warrior', 'paladin', 'ranger', 'rogue', 'cleric', 'mage'];
const $ = id => document.getElementById(id);

export function initTitleLite({ S, account, ui2, ui5, startNet, races, raceNames }) {
  let classes = STARTERS.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) }));
  const refresh = () => {
    for (const b of document.querySelectorAll('#races .chip')) b.setAttribute('aria-checked', String(b.dataset.race === S.look.race));
    for (const b of document.querySelectorAll('#classes .chip')) b.setAttribute('aria-checked', String(b.dataset.cls === S.cls));
    const more = $('class-more'); if (more) more.value = STARTERS.includes(S.cls) ? '' : S.cls;
  };
  $('name').value = 'Maren';
  for (const r of races) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.role = 'radio'; b.dataset.race = r; b.textContent = raceNames[r];
    b.onclick = () => { S.look.race = r; refresh(); };
    $('races').appendChild(b);
  }
  const ready = fetch(new URL('../../../../farhold/data/classes.json', import.meta.url)).then(r => r.json()).then(d => { classes = d.classes.map(c => ({ id: c.id, name: c.name || c.id })); }).catch(() => {}).then(() => {
    const name = id => classes.find(c => c.id === id)?.name || id;
    for (const id of STARTERS.filter(id => classes.some(c => c.id === id))) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.role = 'radio'; b.dataset.cls = id; b.textContent = name(id);
      b.onclick = () => { S.cls = id; refresh(); };
      $('classes').appendChild(b);
    }
    const more = $('class-more');
    more.innerHTML = '<option value="">More callings…</option>' + classes.filter(c => !STARTERS.includes(c.id)).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    more.onchange = () => { if (more.value) { S.cls = more.value; refresh(); } };
    refresh();
  });
  $('build-tag').textContent = 'client gallery · recorded data';
  $('loading')?.classList.add('done');
  $('new-char')?.addEventListener('click', () => go('new'));
  $('back-front')?.addEventListener('click', () => go('front'));
  $('tab-new')?.addEventListener('click', () => go(account.hasChars?.() ? 'front' : 'new'));
  $('tab-login')?.addEventListener('click', () => { $('front').hidden = true; });
  $('login').addEventListener('submit', e => { e.preventDefault(); toAppearance(); });

  function cards(step) {
    $('front').hidden = step !== 'front';
    $('login').hidden = step !== 'new';
    $('signin').hidden = true;
    $('back-front').hidden = !account.hasChars?.();
    $('tab-new')?.setAttribute('aria-selected', 'true'); $('tab-login')?.setAttribute('aria-selected', 'false');
    document.documentElement.dataset.titleStep = step;
  }
  function toAppearance() {
    const name = cleanName($('name').value);
    if (!name || name.length < 2) { $('login-note').textContent = 'Pick a name of 2–16 letters.'; return; }
    cards('look');
    ui5.kits.close?.();
    ui5.kits.load(S.cls);
    ui2.openEditor('title', { look: S.look, saveLabel: 'Next: equipment', gearToggle: { on: false, onChange: () => {} }, onDismiss: () => cards('new') });
  }
  async function toKit() {
    cards('kit');
    const name = classes.find(c => c.id === S.cls)?.name || S.cls;
    await ui5.kits.open({ cls: S.cls, className: name });
  }
  async function go(step) {
    await ready;
    if (step === 'login') { cards('new'); account.tab('login'); document.documentElement.dataset.titleStep = 'login'; return; }
    if (step === 'look') return toAppearance();
    if (step === 'kit') { startNet(); return toKit(); }
    cards(step);
  }
  return { go, toKit, toAppearance, refresh };
}
