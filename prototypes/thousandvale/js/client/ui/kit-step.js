// T5 (play-test 5): step 3 of making a character — choose your starting equipment. Your calling's own armour set (one,
// shown but not chosen since 2026-10-22) and several weapon packs (sword and shield, a pair of blades, a two-hander; casters get wands, staves and
// focuses). Whatever you pick is put on the 3D figure at once (onPreview), and every piece is listed with its real
// numbers — the same item card as the bag on hover, and a plain line under it for touch screens.
//
// Data: stream C's `kitsFor(classId)` (js/rules/starter-kits.js, data/rules/starter-kits.json). The choice travels in the
// create message as `kit: { armour: <set id>, weapons: <pack id> }` (stream A applies and validates it). When the rules
// have no kits for a calling the step is skipped and the character starts in the default gear, as before.
//
//   const kits = createKitStep({ parent, onPreview(gear), onBack(), onCreate({ armour, weapons }) });
//   const k = await kits.load('warrior');        // null = no kits: skip the step
//   kits.open({ cls: 'warrior', className: 'Warrior' });

import { createPanel, h } from '../ui-panel.js';
import { normaliseKits, kitGear, kitTotals, itemFacts, rarityClass } from './pt5-core.js';
import { iconFor, onIcon, iconsActive } from './item-icons.js';
import { rememberItems, nameOf, itemByUid } from './item-card.js';
import { rarityOf } from './inv-core.js';

const cache = new Map();
/** A kits answer is only usable when its sets carry real item objects (a server with no rules engine sends base keys only). */
const usable = k => !!k && (k.armour.length || k.weapons.length) && [...k.armour, ...k.weapons].every(x => x.items.length > 0);
export function createKitStep({ parent = null, onPreview, onBack, onCreate, askServer = null }) {
  const S = { cls: null, kits: null, armour: null, weapons: null, busy: false, created: false, test: null };
  const panel = createPanel({ id: 'kits', title: 'Starting equipment', width: 400, cls: 'kits-panel title-mode', parent,
    onClose: () => { iconsActive(false, 'kits'); if (!S.created) onBack?.(); S.created = false; } });

  /** The kits for a calling (cached). null when there are none — the caller skips the step. */
  const flying = new Map();        // cls -> the load in flight (two askers share ONE load; a late empty answer never replaces a good one)
  function load(cls) {
    if (S.test) return Promise.resolve(S.test);
    if (cache.get(cls)) return Promise.resolve(cache.get(cls));
    if (flying.has(cls)) return flying.get(cls);
    const run = (async () => {
      // protocol §23.1: `kits {cls}` is answered in any state with complete items, or ok:false + why. No rules run in the page.
      let k = null; S.why = '';
      try {
        const r = askServer ? await askServer(cls) : null;
        const raw = r && typeof r === 'object' && ('kits' in r || 'ok' in r) ? r.kits : r;
        if (raw) { const n = normaliseKits(raw); if (usable(n)) k = n; }
        if (!k) S.why = { none: 'This calling has no starting kits yet.', noItems: 'The server could not lay the kits out.', failed: 'The server could not fetch the kits.' }[r?.why] || (r ? 'The kits came back empty.' : 'The server did not answer about starting kits.');
      } catch (e) { S.why = 'The starting kits could not be fetched.'; }
      if (k) cache.set(cls, k);
      return k || cache.get(cls) || null;
    })();
    flying.set(cls, run);
    run.finally(() => flying.delete(cls));
    return run;
  }
  const pick = () => ({ armour: S.kits.armour.find(a => a.id === S.armour) || null, weapons: S.kits.weapons.find(w => w.id === S.weapons) || null });
  const gear = () => { const p = pick(); return kitGear(p.armour, p.weapons); };
  function changed() { onPreview?.(gear()); draw(); }

  function itemRow(it) {
    if (it.uid == null) it.uid = 'kit:' + (it.id || it.baseKey || it.name) + ':' + Math.random().toString(36).slice(2, 7);
    rememberItems([it]);
    const url = iconFor(it), r = rarityClass(rarityOf(it));
    return h('li.kit-item', { dataset: { tipRender: 'item', tipItem: String(it.uid) }, tabIndex: 0 },
      h('span.islot.r-' + r, {}, url ? h('img', { src: url, alt: '' }) : h('span.glyph', {}, (nameOf(it)[0] || '?').toUpperCase())),
      h('span.kit-itemtext', {}, h('b.r-' + r, {}, nameOf(it)), h('small', {}, [itemFacts(it), it.attackText || it.focusText || it.castLine || ''].filter(Boolean).join(' · ') || it.handNote || it.desc || 'No numbers of its own.')));   // a caster's weapon also says what its attack IS
  }
  function choice(group, k, on) {
    const g = kitGear(group === 'armour' ? k : null, group === 'weapons' ? k : null), t = kitTotals(g);
    const sum = group === 'armour' ? `${t.armour} armour in all` : '';
    return h('div.kit-choice' + (on ? '.on' : ''), { role: 'radio', 'aria-checked': String(on), tabIndex: 0, dataset: { group, id: k.id },
      onclick: () => { S[group] = k.id; changed(); }, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S[group] = k.id; changed(); } } },
      // play-test 8 (W23, C): `role` = a short tag of what this choice IS ("Weapon and shield · steady, arm's length"), `diff` = the one
      // plain sentence that sets it apart from the others — both written by the rules from the items themselves
      h('div.kit-head', {}, h('span.kit-radio', { 'aria-hidden': 'true' }), h('strong', {}, k.name), k.role ? h('span.kit-role', {}, k.role) : null, sum ? h('em', {}, sum) : null),
      k.diff ? h('p.kit-diff', {}, k.diff) : null,
      k.blurb && k.blurb !== k.diff ? h('p.kit-blurb', {}, k.blurb) : null,
      on ? h('ul.kit-items', {}, ...k.items.map(itemRow)) : h('p.kit-short', {}, k.items.map(nameOf).join(' · ')));
  }
  function fixedArmour(k) {
    const t = kitTotals(kitGear(k, null));
    return h('section.kit-group.kit-fixed', { 'aria-label': 'Armour', dataset: { group: 'armour-fixed', id: k.id } },
      h('h4', {}, 'Armour'),
      h('div.kit-choice.on.fixed', {},
        h('div.kit-head', {}, h('strong', {}, k.name), k.role ? h('span.kit-role', {}, k.role) : null, h('em', {}, `${t.armour} armour in all`)),
        h('p.kit-blurb', {}, `Every ${S.className || 'one of your calling'} starts in this. Better pieces drop as you play.`),
        h('ul.kit-items', {}, ...k.items.map(itemRow))));
  }
  function draw() {
    if (!panel.isOpen || !S.kits) return;
    panel.setTitle('Starting equipment', `Step 3 of 3${S.className ? ' — ' + S.className : ''}`);
    const go = h('button.primary.small', { type: 'button', dataset: { act: 'create' }, disabled: S.busy, onclick: () => { S.busy = true; S.created = true; go.disabled = true; go.textContent = 'Entering…'; onCreate?.({ armour: S.armour, weapons: S.weapons }); } }, S.busy ? 'Entering…' : 'Create character');
    panel.fill(
      h('p.kit-intro', {}, 'Plain, honest gear to start with. You will find better within the hour — pick the weapons you want to fight with. They show on your figure as you choose.'),
      h('div.kit-body', {},
        // owner 2026-10-22: no armour choice — a class starts in its own set, shown (with every piece) but not picked
        S.kits.armour.length === 1 ? fixedArmour(S.kits.armour[0])
          : S.kits.armour.length ? h('section.kit-group', { role: 'radiogroup', 'aria-label': 'Armour' }, h('h4', {}, 'Armour'), ...S.kits.armour.map(k => choice('armour', k, k.id === S.armour))) : null,
        S.kits.weapons.length ? h('section.kit-group', { role: 'radiogroup', 'aria-label': 'Weapons' }, h('h4', {}, 'Weapons'), ...S.kits.weapons.map(k => choice('weapons', k, k.id === S.weapons))) : null),
      h('p.note', { dataset: { k: 'kit-note' } }),
      h('div.row.kit-foot', {}, h('button.ghost.small', { type: 'button', dataset: { act: 'back' }, onclick: () => panel.close() }, '‹ Appearance'), h('span.grow'), go));
  }
  // an icon that finishes rendering is put into its square IN PLACE: rebuilding the list for every picture (a dozen arrive one
  // by one on a slow machine) detached the choice under the pointer and swallowed the click
  onIcon(() => {
    if (!panel.isOpen) return;
    for (const row of panel.body.querySelectorAll('.kit-item')) {
      const sq = row.querySelector('.islot'); if (!sq || sq.querySelector('img')) continue;
      const it = itemByUid(row.dataset.tipItem), url = it ? iconFor(it) : null;
      if (url) sq.replaceChildren(h('img', { src: url, alt: '' }));
    }
  });

  /** Show the step. Resolves false when there is nothing to choose. */
  async function open({ cls, className = '' } = {}) {
    const k = await load(cls);
    if (!k) return false;
    if (S.cls !== cls || !S.kits) { S.armour = k.armour[0]?.id ?? null; S.weapons = k.weapons[0]?.id ?? null; }
    S.cls = cls; S.kits = k; S.className = className; S.busy = false; S.created = false;
    iconsActive(true, 'kits');
    panel.open();
    // the choice must be offered even if drawing a preview trips: each part on its own, and the reason on the console
    try { draw(); } catch (e) { console.warn('[kits] draw failed:', e?.stack || e?.message); }
    try { onPreview?.(gear()); } catch (e) { console.warn('[kits] preview failed:', e?.stack || e?.message); }
    return true;
  }
  return {
    panel, load, open, draw,
    /** The create failed: let them try again, and say why. */
    failed(text) { S.busy = false; S.created = false; if (panel.isOpen) { draw(); const n = panel.body.querySelector('[data-k="kit-note"]'); if (n) n.textContent = text || ''; } },
    close() { S.created = true; panel.close(); },
    /** Tests / screenshots before the rules data lands: kits to use instead of C's. */
    useKits(k) { S.test = k ? normaliseKits(k) : null; cache.clear(); S.kits = null; },
    /** Why the last load came back with nothing (said to the player when the step is skipped). */
    get why() { return S.why || ''; },
    get choice() { return S.kits ? { armour: S.armour, weapons: S.weapons } : null; },
    get state() { return { open: panel.isOpen, cls: S.cls, armour: S.armour, weapons: S.weapons, sets: S.kits?.armour.length || 0, packs: S.kits?.weapons.length || 0, gear: S.kits ? Object.fromEntries(Object.entries(gear()).map(([s, it]) => [s, it.name])) : {} }; },
  };
}
