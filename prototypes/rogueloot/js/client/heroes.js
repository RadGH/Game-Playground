// Heroes on this device (ruling 1): a list in localStorage, picked on the title screen, carried into any game.
// Optional cloud backup through the games.radgh.com account (ruling 44, shared/rgs-cloudsave.js).
//   const heroes = createHeroes({ root, onChange })   heroes.current() -> character   heroes.save(ch)
import { newCharacter, cleanName } from '../rules/character.js';
import { loadLookData, randomLook, RACES, RACE_NAMES, avatarOf } from '../../../knockabout/js/client/look.js';
import { svgPortrait } from '../../../../avatar-3d/js/chibi26-portrait.js';

export const KEY = 'rogueloot.heroes.v1', PICK = 'rogueloot.hero';
const read = () => { try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); return d && typeof d === 'object' && d.list ? d : { list: [] }; } catch { return { list: [] }; } };
const write = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const titleOf = ch => `Level ${ch.level} ${ch.spec ? cap(ch.spec) : ch.path ? cap(ch.path) : 'Wanderer'}`;
const cap = s => String(s).replace(/(^|_)(\w)/g, (_, a, b) => (a ? ' ' : '') + b.toUpperCase());

export function createHeroes({ root, onChange = () => {} }) {
  let data = read(), picked = null; try { picked = localStorage.getItem(PICK); } catch { /* */ }
  let draft = null;              // the create form's hero while it is open
  const portraits = new Map();
  const portrait = look => { const k = JSON.stringify(look); if (!portraits.has(k)) { try { portraits.set(k, svgPortrait(avatarOf(look), { width: 96, height: 120 })); } catch { portraits.set(k, ''); } } return portraits.get(k); };
  const current = () => data.list.find(c => c.id === picked) || data.list[0] || null;
  function save(ch) { const i = data.list.findIndex(c => c.id === ch.id); if (i < 0) data.list.unshift(ch); else data.list[i] = ch; write(data); cloud?.saveSoon?.(); draw(); }
  function pick(id) { picked = id; try { localStorage.setItem(PICK, id); } catch { /* */ } draw(); onChange(current()); }
  function remove(id) { data.list = data.list.filter(c => c.id !== id); write(data); cloud?.saveSoon?.(); if (picked === id) picked = data.list[0]?.id || null; draw(); onChange(current()); }

  function draw() {
    if (draft) return drawCreate();
    const cur = current();
    if (!cur) { startCreate(); return; }
    root.innerHTML = `<div class="hero-list">${data.list.map(c => `<button class="hero ${c.id === cur.id ? 'on' : ''}" data-id="${c.id}" aria-pressed="${c.id === cur.id}"><span class="face">${portrait(c.look)}</span><span class="who"><b>${esc(c.name)}</b><small>${titleOf(c)}</small></span></button>`).join('')}
      <button class="hero new" data-new><span class="face plus">+</span><span class="who"><b>New hero</b><small>Start as a Wanderer</small></span></button></div>
      <div class="hero-tools"><button class="del" data-del>Delete ${esc(cur.name)}…</button></div>`;
    root.querySelectorAll('[data-id]').forEach(b => b.onclick = () => pick(b.dataset.id));
    root.querySelector('[data-new]').onclick = startCreate;
    root.querySelector('[data-del]').onclick = () => {
      const typed = prompt(`Delete ${cur.name} for good? Their gear goes too. Type the name to confirm:`);
      if (typed != null && typed.trim().toLowerCase() === cur.name.toLowerCase()) remove(cur.id);
    };
  }
  function startCreate() { draft = { name: '', look: randomLook() }; draw(); }
  function drawCreate() {
    root.innerHTML = `<div class="create"><div class="face big">${portrait(draft.look)}</div>
      <label class="field">Name <input class="nm" maxlength="20" autocomplete="off" placeholder="Wanderer" value="${esc(draft.name)}"></label>
      <div class="races">${RACES.map(r => `<button data-race="${r}" class="${draft.look.race === r ? 'on' : ''}">${RACE_NAMES[r]}</button>`).join('')}</div>
      <div class="btns"><button data-reroll>New look</button>${data.list.length ? '<button data-cancel>Cancel</button>' : ''}<button class="primary" data-make>Create hero</button></div></div>`;
    const nm = root.querySelector('.nm'); nm.oninput = () => { draft.name = nm.value; };
    root.querySelectorAll('[data-race]').forEach(b => b.onclick = () => { let l; for (let i = 0; i < 40; i++) { l = randomLook(); if (l.race === b.dataset.race) break; } draft.look = l; drawCreate(); });
    root.querySelector('[data-reroll]').onclick = () => { const race = draft.look.race; let l; for (let i = 0; i < 40; i++) { l = randomLook(); if (l.race === race) break; } draft.look = l; drawCreate(); };
    root.querySelector('[data-cancel]')?.addEventListener('click', () => { draft = null; draw(); });
    root.querySelector('[data-make]').onclick = () => { const ch = newCharacter({ name: cleanName(draft.name), look: draft.look }); draft = null; save(ch); pick(ch.id); };
  }

  let cloud = null;
  (async () => {
    try {
      const { cloudSave } = await import('../../../../shared/rgs-cloudsave.js');
      cloud = cloudSave({ game: 'rogueloot', keys: { heroes: KEY }, onRestore: () => { data = read(); draw(); onChange(current()); }, canRestore: () => !document.body.classList.contains('in-game') });
      const { accountButton } = await import('../../../../shared/rgs-signin.js');
      document.querySelector('#account-slot')?.append(accountButton({ game: 'rogueloot', gameName: 'Rogueloot', onChange: () => cloud?.sync?.() }));
    } catch (e) { console.warn('cloud saves off', e); }
  })();

  loadLookData().then(() => { portraits.clear(); draw(); onChange(current()); });
  return { current, save, draw, get list() { return data.list; } };
}
