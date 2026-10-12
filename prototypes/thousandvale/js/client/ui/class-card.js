// Play-test 10 Y32 — the calling's card on the new-character form, and the one list of callings both the game's title
// and the gallery's read: Farhold's thirty (classes.json, shared and never written) plus the callings that exist only
// in Thousandvale (data/rules/classes-tv.json — the Starcaller), which the rules inject at boot and the title must
// offer too. The card says what a calling IS before you pick it: its role, what it wears, what it runs on, its hook and
// its signature mechanic, all in the class row's own words.
//
//   const list = await loadCallings();              // [{ id, name, role, hook, signature, armorTier, primaryAttr, … }]
//   drawClassCard(el, list.find(c => c.id === id)); // pure rule: classCardLines (node-tested)

const ARMOUR = { cloth: 'Cloth', light: 'Light armour', medium: 'Medium armour', heavy: 'Heavy armour' };
const ATTR = { STR: 'Strength', DEX: 'Dexterity', INT: 'Intelligence' };
const cap = s => String(s || '').replace(/^\w/, c => c.toUpperCase());

/** What the card says, as plain strings (no DOM). */
export function classCardLines(c) {
  if (!c) return null;
  const facts = [ARMOUR[c.armorTier] || cap(c.armorTier), ATTR[c.primaryAttr] || c.primaryAttr, cap(c.resource || 'mana')].filter(Boolean);
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
  el.replaceChildren(
    mk('strong', 'cc-name', L.name), mk('span', 'cc-role', L.role),
    mk('p', 'cc-facts', L.facts.join(' · ')),
    ...(L.hook ? [mk('p', 'cc-hook', L.hook)] : []),
    ...(L.signature ? [mk('p', 'cc-sig', L.signature)] : []));
}
