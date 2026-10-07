// T5 (play-test 5): step 3 of making a character — choose your starting equipment. Three budget armour sets for your
// calling and several weapon packs (sword and shield, a pair of blades, a two-hander; casters get wands, staves and
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
import { rememberItems, nameOf } from './item-card.js';
import { rarityOf } from './inv-core.js';

const cache = new Map();
let rulesJson;
/** A kits answer is only usable when its sets carry real item objects (a server with no rules engine sends base keys only). */
const usable = k => !!k && (k.armour.length || k.weapons.length) && [...k.armour, ...k.weapons].every(x => x.items.length > 0);
/**
 * The fallback when the server has no kits to send (a gateway process with no rules engine): C's pure module, run here.
 * It needs the booted rules engine for real item objects, so the rules (and their data) load in the page — only on this
 * path, only on the title screen, and while you are still choosing a face.
 */
async function fetchKits(cls) {
  const mod = await import('../../rules/starter-kits.js');
  if (rulesJson === undefined) { try { const r = await fetch(new URL('../../../data/rules/starter-kits.json', import.meta.url)); rulesJson = r.ok ? await r.json() : null; } catch { rulesJson = null; } }
  const fn = mod.kitsFor || mod.default;
  if (typeof fn !== 'function') return null;
  let k = normaliseKits(await fn(cls, rulesJson));
  if (!usable(k)) { const idx = await import('../../rules/index.js'); k = normaliseKits(await fn(cls, rulesJson, idx.rulesEngine?.() || null)); }
  return usable(k) ? k : null;
}

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
      let k = null;
      // the server's answer first (A: kits {cls} -> kitsR — no rules import in the browser), C's module as the fallback
      try { const raw = askServer ? await askServer(cls) : null; if (raw) { const n = normaliseKits(raw); if (usable(n)) k = n; } } catch { /* fall through */ }
      // (time-boxed: a slow machine must never sit on the title screen waiting for the rules to boot — no kits = the default gear)
      if (!k) { try { k = await Promise.race([fetchKits(cls), new Promise(r => setTimeout(() => r(null), 20000))]); } catch (e) { console.info('[kits] no starting kits for', cls, '-', e.message); } }
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
      h('div.kit-head', {}, h('span.kit-radio', { 'aria-hidden': 'true' }), h('strong', {}, k.name), sum ? h('em', {}, sum) : null),
      k.blurb ? h('p.kit-blurb', {}, k.blurb) : null,
      on ? h('ul.kit-items', {}, ...k.items.map(itemRow)) : h('p.kit-short', {}, k.items.map(nameOf).join(' · ')));
  }
  function draw() {
    if (!panel.isOpen || !S.kits) return;
    panel.setTitle('Starting equipment', `Step 3 of 3${S.className ? ' — ' + S.className : ''}`);
    const go = h('button.primary.small', { type: 'button', dataset: { act: 'create' }, disabled: S.busy, onclick: () => { S.busy = true; S.created = true; go.disabled = true; go.textContent = 'Entering…'; onCreate?.({ armour: S.armour, weapons: S.weapons }); } }, S.busy ? 'Entering…' : 'Create character');
    panel.fill(
      h('p.kit-intro', {}, 'Plain, honest gear to start with. You will find better within the hour — pick what you want to fight in. It shows on your figure as you choose.'),
      h('div.kit-body', {},
        S.kits.armour.length ? h('section.kit-group', { role: 'radiogroup', 'aria-label': 'Armour' }, h('h4', {}, 'Armour'), ...S.kits.armour.map(k => choice('armour', k, k.id === S.armour))) : null,
        S.kits.weapons.length ? h('section.kit-group', { role: 'radiogroup', 'aria-label': 'Weapons' }, h('h4', {}, 'Weapons'), ...S.kits.weapons.map(k => choice('weapons', k, k.id === S.weapons))) : null),
      h('p.note', { dataset: { k: 'kit-note' } }),
      h('div.row.kit-foot', {}, h('button.ghost.small', { type: 'button', dataset: { act: 'back' }, onclick: () => panel.close() }, '‹ Appearance'), h('span.grow'), go));
  }
  onIcon(() => { if (panel.isOpen) { clearTimeout(draw.t); draw.t = setTimeout(draw, 80); } });

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
    get choice() { return S.kits ? { armour: S.armour, weapons: S.weapons } : null; },
    get state() { return { open: panel.isOpen, cls: S.cls, armour: S.armour, weapons: S.weapons, sets: S.kits?.armour.length || 0, packs: S.kits?.weapons.length || 0, gear: S.kits ? Object.fromEntries(Object.entries(gear()).map(([s, it]) => [s, it.name])) : {} }; },
  };
}
