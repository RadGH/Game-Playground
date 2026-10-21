// The calling picker (feedback #98, 2026-10-21): "Move the class selection to its own menu and have a list of classes as
// cards available on one side, and a description of what that class's abilities are, talents, etc on the other side,
// and your character visible on the edge … Make each class look interesting … with their own icon, colors, etc and bring
// in their skill icons."
//
// A layer over the title screen: every calling as a card (its first skill's picture as its emblem, its own colours from
// icons/js/motifs.js), and the chosen one's page — what it does, its signature, its six skills with their pictures, the
// level each opens at and the words the game itself writes for them (data/rules/class-catalog.json, made by
// tools/class-catalog.mjs). Desktop: the layer fills the left of the screen, the figure stands in the clear on the right.
// Phone: the cards are a strip along the top, the page a sheet at the bottom, the figure between them.
//
//   const P = createCallingPicker({ callings: () => list, current: () => id, onPick: id => …, drawCard })
//   P.open() · P.close() · P.isOpen · P.refresh()
// The card list is `#classes` and each card `.chip[data-cls]`; the chosen class's page is `#class-card` (the old
// element ids, so the specs and the rest of the title read the same names).

import { skillIconSvg } from './skill-icons.js';
import { classPalette } from '../../../../../icons/js/motifs.js';

const CATALOG = new URL('../../../data/rules/class-catalog.json', import.meta.url);
let catalogP = null;
const loadCatalog = () => (catalogP ||= fetch(CATALOG).then(r => (r.ok ? r.json() : null)).catch(() => null));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FALLBACK = { core: '#f2e6c8', glow: '#a07a3a', accent: '#e6c14a' };
const paletteOf = id => classPalette(id) || (id === 'starblade' ? classPalette('starcaller') : null) || FALLBACK;
const SHAPE = { bolt: 'Shot', beam: 'Beam', ground: 'Area', around: 'Around you', melee: 'Strike', dash: 'Move', self: 'On you', summon: 'Summon' };
const ARMOUR = { cloth: 'Cloth', light: 'Leather', medium: 'Mail', heavy: 'Plate' };

export function createCallingPicker({ callings, current, onPick, onClose = null, parent = null }) {
  const root = document.createElement('section');
  root.className = 'calling-picker'; root.id = 'calling-picker'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Choose a calling');
  root.innerHTML = `<header class="cp-head"><h2>Choose a calling</h2><button type="button" class="primary cp-done" id="calling-done">Choose</button></header>
    <div class="cp-body"><div class="cp-list chips classes" id="classes" role="radiogroup" aria-label="Calling"></div><article class="cp-page class-card" id="class-card" aria-live="polite"></article></div>`;
  (parent || document.getElementById('title') || document.body).appendChild(root);
  const list = root.querySelector('.cp-list'), page = root.querySelector('.cp-page');
  root.querySelector('.cp-done').onclick = () => close();
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  let cat = null;

  function cardFor(c) {
    const P = paletteOf(c.id), k = cat?.classes?.[c.id], first = k?.skills?.[0]?.id;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip cp-card'; b.setAttribute('role', 'radio'); b.dataset.cls = c.id;
    b.style.setProperty('--cp-glow', P.glow); b.style.setProperty('--cp-accent', P.accent); b.style.setProperty('--cp-core', P.core);
    b.innerHTML = `<span class="cp-emblem" aria-hidden="true">${first ? skillIconSvg(first, 40) || '' : ''}</span><span class="cp-name">${esc(c.name)}</span><span class="cp-role">${esc(k?.role || c.role || '')}</span>`;
    b.onclick = () => { onPick(c.id); mark(); drawPage(); };
    return b;
  }
  function fill() {
    const L = callings() || [];
    list.replaceChildren(...L.map(cardFor));
    mark(); drawPage();
  }
  function mark() { const id = current(); for (const b of list.querySelectorAll('.cp-card')) { const on = b.dataset.cls === id; b.setAttribute('aria-checked', String(on)); b.classList.toggle('on', on); } }
  function drawPage() {
    const id = current(), c = (callings() || []).find(x => x.id === id), k = cat?.classes?.[id];
    if (!c) { page.innerHTML = ''; return; }
    const P = paletteOf(id);
    page.style.setProperty('--cp-glow', P.glow); page.style.setProperty('--cp-accent', P.accent); page.style.setProperty('--cp-core', P.core);
    const weapons = (k?.weapons?.length ? k.weapons : c.weapons || []).map(w => esc(w.replace(/2h$/, ' (two-handed)'))).join(', ');
    const facts = [k?.armour || c.armorTier ? `${ARMOUR[k?.armour || c.armorTier] || k?.armour || c.armorTier} armour` : '', weapons ? `Fights with: ${weapons}` : '', k?.resource || c.resourceName ? `Its own resource: ${esc(k?.resource || c.resourceName)}` : ''].filter(Boolean);
    const sig = String(k?.signature || c.signature || '').trim();
    const skills = (k?.skills || []).map(s => `<li class="cp-skill"><span class="cp-icon" aria-hidden="true">${skillIconSvg(s.id, 44) || ''}</span><div><b>${esc(s.name)}</b><small>${s.level > 1 ? `Level ${s.level}` : 'From the start'} · ${esc(SHAPE[s.shape] || 'Skill')}${s.cd ? ` · ${Math.round(s.cd / 100) / 10}s cooldown` : ''}${s.mp ? ` · ${s.mp} mana` : ''}</small><p>${esc(s.desc)}</p></div></li>`).join('');
    page.innerHTML = `<header class="cp-title"><span class="cp-emblem big" aria-hidden="true">${k?.skills?.[0] ? skillIconSvg(k.skills[0].id, 56) || '' : ''}</span><div><h3>${esc(c.name)}</h3><span class="cp-role">${esc(k?.role || c.role || '')}</span></div></header>
      <p class="cp-hook">${esc(k?.hook || c.hook || '')}</p>
      ${sig ? `<p class="cp-sig"><b>Signature:</b> ${esc(/[.:]/.test(sig) ? sig : sig[0].toUpperCase() + sig.slice(1) + '.')}</p>` : ''}
      ${facts.length ? `<p class="cp-facts">${facts.join(' · ')}</p>` : ''}
      ${skills ? `<h4>Skills</h4><ul class="cp-skills">${skills}</ul><p class="cp-talents">Every skill grows: four tiers of talents to pick from as you level, each changing how it works — and a perk forest on top.</p>` : '<p class="dim">Loading its skills…</p>'}`;
  }
  function open() { root.hidden = false; document.documentElement.dataset.picking = '1'; fill(); loadCatalog().then(d => { cat = d; if (!root.hidden) fill(); }); setTimeout(() => list.querySelector('.cp-card.on')?.focus({ preventScroll: false }), 30); }
  function close() { if (root.hidden) return; root.hidden = true; delete document.documentElement.dataset.picking; onClose?.(); }
  loadCatalog().then(d => { cat = d; });
  return { open, close, refresh: () => { if (!root.hidden) { mark(); drawPage(); } }, get isOpen() { return !root.hidden; }, root, catalog: () => cat };
}
