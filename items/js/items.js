// Item catalog + loot/lore roller.
//   import { ItemCatalog } from '/items/js/items.js';
//   const cat = await ItemCatalog.load('/items/data/');
//   cat.query({ race: 'dwarf', tags: ['drinking'], category: 'vessel' })          → weighted list of catalog items
//   cat.roll({ race: 'dwarf', rarity: 'rare', tags: ['weapon'], seed: 5, namegen }) → a concrete item: material, quality, enchant, name, value, lore
//   cat.toLexiconEntry(item)                                                        → lingo dictionary entry (sg/pl forms, tags)
import { makeRng, pluralize, hash } from '../../namegen/js/namegen.js';

export const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_W = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };

export class ItemCatalog {
  constructor({ items, materials }) { this.items = items.items || items; this.materials = materials.materials || []; this.qualities = materials.qualities || []; this.enchants = materials.enchant_prefix || []; this.enchantTags = materials.enchant_tags || {}; this.byId = Object.fromEntries(this.items.map(i => [i.id, i])); }
  static async load(base = './data/') { const j = async f => (await fetch(base + f)).json(); const [items, materials] = await Promise.all([j('items.json'), j('materials.json')]); return new ItemCatalog({ items, materials }); }
  get categories() { return [...new Set(this.items.map(i => i.category))]; }
  get tags() { const c = new Map(); for (const i of this.items) for (const t of i.tags) c.set(t, (c.get(t) || 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t); }
  get races() { const s = new Set(); for (const i of this.items) for (const r of Object.keys(i.affinity)) s.add(r); return [...s].sort(); }
  plural(item) { return item.pl || pluralize(item.name); }

  /** Weight of an item for a race (0 = excluded). Missing affinity = 0.2 (rare but possible); exclusives only for their race. */
  weightFor(item, race) { if (!race) return 1; if (item.exclusive && item.exclusive !== race) return 0; const a = item.affinity[race]; return a == null ? 0.2 : a; }
  /**
   * Filter + weight. opts: { race, category, sub, tags: [all required], anyTags: [any], notTags: [], rarity, maxRarity, exclusiveOnly }
   * Returns [{ item, weight }] sorted by weight.
   */
  query(opts = {}) {
    const out = [];
    for (const item of this.items) {
      if (opts.category && item.category !== opts.category) continue;
      if (opts.sub && item.sub !== opts.sub) continue;
      if (opts.tags?.length && !opts.tags.every(t => item.tags.includes(t))) continue;
      if (opts.anyTags?.length && !opts.anyTags.some(t => item.tags.includes(t))) continue;
      if (opts.notTags?.length && opts.notTags.some(t => item.tags.includes(t))) continue;
      if (opts.rarity && item.rarity !== opts.rarity) continue;
      if (opts.maxRarity && RARITY.indexOf(item.rarity) > RARITY.indexOf(opts.maxRarity)) continue;
      if (opts.exclusiveOnly && !item.exclusive) continue;
      const w = this.weightFor(item, opts.race); if (w <= 0) continue;
      out.push({ item, weight: w });
    }
    return out.sort((a, b) => b.weight - a.weight);
  }
  /** Precious materials (value ≥ 3: silver, gold, mithril, crystal, livingwood, dragonscale) are gated by rarity: rare for commons, likely for epics. */
  pickMaterial(item, race, rng, rarity = item.rarity) { const allowed = this.materials.filter(m => item.materials.length && item.materials.includes(m.id)); if (!allowed.length) return null; const ri = RARITY.indexOf(rarity); return rng.weighted(allowed, m => (m.affinity?.[race] ?? 0.4) * (m.value >= 3 ? [0.03, 0.15, 0.7, 2, 4][ri] : m.value >= 1.5 ? [0.5, 1, 1.5, 1.5, 1][ri] : 1)); }
  pickQuality(race, rng, rarity) { const bias = RARITY.indexOf(rarity); return rng.weighted(this.qualities, q => q.weight * (q.affinity?.[race] ?? 1) * (['fine', 'masterwork', 'ancient'].includes(q.id) ? 1 + bias : ['crude', 'worn'].includes(q.id) ? Math.max(0.2, 1 - bias * 0.5) : 1)); }

  /**
   * Roll one concrete item. opts: { race, category, sub, tags, anyTags, rarity ('common'…'legendary' | 'any'), seed, namegen (optional NameGen for artifact names), lore (bool, default true) }
   * Returns { id, name, fullName, pl, category, sub, tags, rarity, material, quality, enchant, artifact, value, desc, lore, race, seed, base }
   */
  roll(opts = {}) {
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9); const rng = makeRng(seed); const race = opts.race || null;
    const rarity = opts.rarity && opts.rarity !== 'any' ? opts.rarity : rng.weighted(RARITY, r => RARITY_W[r]);
    let pool = this.query({ ...opts, rarity: undefined, maxRarity: undefined }).filter(x => x.item.rarity === rarity);
    if (!pool.length) pool = this.query({ ...opts, rarity: undefined, maxRarity: undefined }); if (!pool.length) return null;
    const base = rng.weighted(pool, x => x.weight).item;
    const material = this.pickMaterial(base, race, rng, rarity), quality = this.pickQuality(race, rng, rarity);
    const ri = RARITY.indexOf(rarity); const enchant = ri >= 2 && rng() < 0.35 + ri * 0.2 && !['food', 'material', 'trophy'].includes(base.category) ? rng.pick(this.enchants) : null;
    const artifact = (ri >= 3 || (ri === 2 && rng() < 0.3)) && opts.namegen ? opts.namegen.generate('object', { race: race || 'human', seed }).text : null;
    const matAdj = material && !base.name.toLowerCase().includes(material.adj.toLowerCase()) && !base.tags.includes('consumable') && base.category !== 'material' && base.category !== 'food' ? material.adj + ' ' : '';
    const qAdj = quality.adj ? quality.adj + ' ' : '';
    const name = `${qAdj}${matAdj}${base.name}`.trim(); const fullName = artifact ? `${artifact}, ${enchant ? enchant.toLowerCase() + ' ' : ''}${name}` : (enchant ? `${enchant} ${name}` : name);
    const [lo, hi] = base.value; const value = Math.round((lo + rng() * (hi - lo)) * (material?.value ?? 1) * quality.value * (enchant ? 3 + ri : 1) * (artifact ? 2 : 1));
    const tags = [...new Set([...base.tags, ...(material?.tags || []), ...quality.tags, ...(enchant ? this.enchantTags[enchant] || [] : []), rarity, ...(artifact ? ['artifact', 'named'] : [])])];
    const result = { id: base.id, base, name, fullName, pl: pluralize(name), category: base.category, sub: base.sub, tags, rarity, material: material?.id || null, quality: quality.id, enchant, artifact, value, desc: base.desc, race, seed };
    if (opts.lore !== false) result.lore = this.lore(result, rng, opts.namegen);
    return result;
  }
  /** One-paragraph lore blurb from tags, quality and race, optionally naming a maker/place via namegen. */
  lore(r, rng, namegen) {
    const race = r.race || rng.pick(['human', 'dwarf', 'elf']); const maker = namegen ? namegen.generate('person.full', { race, seed: r.seed + 1 }).text : null; const place = namegen ? namegen.generate('settlement', { race, seed: r.seed + 2 }).text : null;
    const bits = [];
    if (r.quality === 'ancient') bits.push(rng.pick(['Older than the kingdom that claims it.', 'The script on it is no longer spoken.', 'Dug out of a barrow; the barrow is not mentioned.']));
    if (r.quality === 'masterwork') bits.push(maker ? `Made by ${maker}${place ? ' of ' + place : ''}, who signed nothing else.` : 'Signed with a maker\'s mark nobody can place.');
    if (r.quality === 'crude') bits.push(rng.pick(['Made in a hurry, by someone who did not care.', 'Works. Mostly.', 'Held together with hope and wire.']));
    if (r.quality === 'worn') bits.push(rng.pick(['Passed through many hands, most of them dead.', 'The grip is worn to the shape of a stranger\'s fingers.']));
    if (r.enchant) bits.push({ Flaming: 'Warm to the touch; the air above it wavers.', Frost: 'Frost gathers on it in summer.', Venomous: 'Anything it cuts sickens.', Shadowed: 'Hard to look at directly.', Blessed: 'A priest wept over it once.', Cursed: 'Every owner has died badly. So far.', Thundering: 'It hums before a storm.', Vampiric: 'It is never quite clean.', Keen: 'It has never needed sharpening.', Warding: 'Arrows seem to miss whoever carries it.', Whispering: 'It talks, quietly, at night.', Mending: 'Scratches on it close overnight.', Hungering: 'It wants to be used.', Sunlit: 'It is never in shadow.', Moonlit: 'It glows faintly when the moon is up.', Runed: 'The runes name a grudge and a debt.' }[r.enchant]);
    if (r.artifact) bits.push(rng.pick([`Songs call it ${r.artifact}; the songs disagree about why.`, `${r.artifact} has been stolen ${rng.int(2, 9)} times and recovered ${rng.int(1, 8)}.`, `Whoever holds ${r.artifact} is expected to do something about it.`]));
    if (r.race && r.base.exclusive === r.race) bits.push(`Only ${race === 'undead' ? 'the dead' : race + 's'} make these, and they do not sell them.`);
    else if (r.race && (r.base.affinity[r.race] ?? 0) >= 3) bits.push(`A ${race} would recognise the work at once.`);
    if (!bits.length) bits.push(rng.pick(['Unremarkable, which is its own kind of luck.', 'Somebody paid too much for it once.', 'Smells faintly of the last place it was kept.']));
    return bits.join(' ');
  }
  /** Convert a rolled or catalog item into a lingo lexicon entry. */
  toLexiconEntry(x) {
    const base = x.base || x; const name = x.fullName && x.artifact ? x.artifact : (x.name || base.name);
    const id = name.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return { id, type: 'item', proper: !!x.artifact, forms: { sg: name, pl: x.artifact ? name : (x.pl || this.plural(base)) }, tags: [...(x.tags || base.tags), base.category, base.sub].filter(Boolean), desc: base.desc };
  }
}
