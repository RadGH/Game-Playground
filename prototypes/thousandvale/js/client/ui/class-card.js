// Play-test 10 Y32 — the calling's card on the new-character form, and the one list of callings both the game's title
// and the gallery's read: Farhold's thirty (classes.json, shared and never written) plus the callings that exist only
// in Thousandvale (data/rules/classes-tv.json — the Starcaller), which the rules inject at boot and the title must
// offer too. The card says what a calling IS before you pick it: its role, what it wears, what it runs on, its hook and
// its signature mechanic, all in the class row's own words.
//
//   const list = await loadCallings();              // [{ id, name, role, hook, signature, armorTier, primaryAttr, … }]
//   drawClassCard(el, list.find(c => c.id === id)); // pure rule: classCardLines (node-tested)

import { CLASS_MOTIFS, classPalette, motifSvg } from '../../../../../icons/js/motifs.js';
import { iconSvg } from '../../../../../icons/js/catalog.js';

/**
 * Play-test 11 (the Star Blade, owner #53 "all distinct artwork"): the calling's EMBLEM on its card — its ground sigil
 * from the effect shapes (icons/data/game/fx-motifs.js, `<class>.c`) in its own glow colour; a calling with no effect
 * shapes (the Starcaller keeps its own stars) shows its first skill's picture. Pure string; '' when there is nothing.
 */
export function classEmblemSvg(c, size = 44) {
  if (!c?.id) return '';
  const glyph = CLASS_MOTIFS[c.id]?.[2];
  if (glyph) {
    const pal = classPalette(c.id) || {};
    return String(motifSvg(glyph, size) || '').replace(/#fff\b/g, pal.glow || '#e6c14a').replace('<svg ', '<svg aria-hidden="true" ');
  }
  const first = (c.skills || [])[0];
  return (first && iconSvg(first, size)) || '';
}

const ARMOUR = { cloth: 'Cloth', light: 'Light armour', medium: 'Medium armour', heavy: 'Heavy armour' };
const ATTR = { STR: 'Strength', DEX: 'Dexterity', INT: 'Intelligence' };
// round 11 (C, Z2 / owner #2): no attributes any more — the card names the weapon family the calling fights with
const FAMILY = { heavy: 'Heavy weapons', light: 'Light weapons', magic: 'Magic weapons' };
const cap = s => String(s || '').replace(/^\w/, c => c.toUpperCase());

/** What the card says, as plain strings (no DOM). */
export function classCardLines(c) {
  if (!c) return null;
  // [C] the card reads Farhold's classes.json straight, whose rows carry `primaryAttr` and no `weaponFamily`: the same
  // mapping the rules use (js/rules/attributes.js) — STR heavy, DEX light, INT magic
  const fam = c.weaponFamily || { STR: 'heavy', DEX: 'light', INT: 'magic' }[c.primaryAttr] || null;
  const facts = [ARMOUR[c.armorTier] || cap(c.armorTier), FAMILY[fam] || (fam ? cap(fam) + ' weapons' : null), cap(c.resource || 'mana')].filter(Boolean);
  // a signature is either a sentence ("Constellation: Star Dart … gains 1 Starlight …") or a few words ("stronger in a crowd")
  const sig = String(c.signature || '').trim();
  return { name: c.name || cap(c.id), role: c.role || '', facts, hook: c.hook || '', signature: sig ? (/[.:]/.test(sig) ? sig : `Signature: ${sig}.`) : '', mechanic: c.resourceName || '' };
}
let listP = null;
/** Every calling a new character may be: Farhold's, then Thousandvale's own. Cached; never throws. */
export function loadCallings() {
  listP ||= (async () => {
    const get = async u => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
    const [f, tv] = await Promise.all([get(new URL('../../../../farhold/data/classes.json', import.meta.url)), get(new URL('../../../data/rules/classes-tv.json', import.meta.url))]);
    const out = [];
    for (const c of [...(f?.classes || []), ...(tv?.classes || [])]) if (c && c.id && !out.some(x => x.id === c.id)) out.push({ ...c, name: c.name || c.id });
    return out;
  })();
  return listP;
}
/** Fill `el` with the card for class row `c` (hides it when there is none). */
export function drawClassCard(el, c) {
  if (!el) return;
  const L = classCardLines(c);
  el.hidden = !L;
  if (!L) { el.replaceChildren(); return; }
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; };
  el.dataset.cls = c.id;
  const emblem = document.createElement('span'); emblem.className = 'cc-emblem'; emblem.innerHTML = classEmblemSvg(c);   // trusted authored SVG
  el.replaceChildren(
    ...(emblem.innerHTML ? [emblem] : []),
    mk('strong', 'cc-name', L.name), mk('span', 'cc-role', L.role),
    mk('p', 'cc-facts', L.facts.join(' · ')),
    ...(L.hook ? [mk('p', 'cc-hook', L.hook)] : []),
    ...(L.signature ? [sigPart(L, mk)] : []));
}
/**
 * Play-test 12 (#64): the Star Blade's "way" paragraph is six lines long, and on a short screen it pushed "Next" off
 * the bottom. A long signature folds into "How it plays" — open on a tall screen, folded on a phone or a short window —
 * so step 1 always fits (and the title screen scrolls as well, css/pt12.css).
 */
export const SIG_FOLD = 140;
function sigPart(L, mk) {
  const p = mk('p', 'cc-sig', L.signature);
  if (L.signature.length <= SIG_FOLD) return p;
  const d = document.createElement('details'); d.className = 'cc-more';
  const short = typeof innerHeight === 'number' && (innerHeight < 820 || document.documentElement.dataset.layout === 'phone');
  d.open = !short;
  d.append(mk('summary', '', `How the ${L.name} plays`), p);
  return d;
}
