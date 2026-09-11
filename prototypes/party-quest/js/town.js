// Town: random NPCs with roles, dispositions toward the party (relationship graph), deeds they have heard of,
// quests on offer, a shop stocked from the Item Vault, and selling treasures.
import { makeCharacter } from '../../../library/js/make.js';
import { makeRng } from './rng.js';

export function generateTown(game, deps, locId) {
  const rng = makeRng(deps.seedBase + locId.length * 131); const roles = [...game.data.world.npcRoles].sort(() => rng() - 0.5);
  const questGivers = game.data.world.quests.map(q => q.giverTitle); const chosen = [...new Set([...questGivers.filter(() => rng() < 0.8), ...roles])].slice(0, 6);
  const races = locId === 'greyharbor_gate' ? ['human', 'human', 'halfling', 'dwarf', 'elf', 'gnome'] : ['human', 'human', 'human', 'halfling', 'dwarf'];
  const npcs = chosen.map((role, i) => { const ch = makeCharacter({ race: races[i % races.length], seed: rng.int(1, 1e9), kind: 'npc', title: role }, deps); ch.role = role; ch.side = 'npc'; ch.hp = 1; ch.location = locId; ch.disposition = +(rng.range(-0.3, 0.5)).toFixed(2); return ch; });
  // initial feelings toward the party leader from disposition; reputation shifts them
  const leader = game.party[0]; for (const n of npcs) { const rel = game.relations.get(n.id, leader.id); rel.set('warmth', n.disposition); rel.set('familiarity', 0.05); }
  game.npcs[locId] = npcs; return npcs;
}
/** NPCs learn of the party's deeds (rumours) and their feelings move with reputation. */
export function spreadDeeds(game, npcs) {
  const leader = game.party[0]; if (!leader) return;
  for (const n of npcs) {
    const bank = game.bank(n.id, n.speech?.traits || []); const known = new Set(bank.memories.filter(m => m.type === 'deed').map(m => m.details.what));
    for (const d of game.deeds) if (!known.has(d.text)) { bank.remember({ type: 'deed', time: game.now, bindings: { hero: { id: leader.id }, place: d.place ? { id: d.place } : undefined }, details: { what: d.text }, participants: [n.id] }, game.now); game.relations.apply(n.id, leader.id, 'rumor_good', { traits: n.speech?.traits || [], now: game.now }); }
    const rel = game.relations.get(n.id, leader.id); rel.set('respect', Math.min(1, rel.get('respect') + game.reputation * 0.03));
  }
}
export function questsAvailable(game, npc) { return game.data.world.quests.filter(q => q.giverTitle === npc.role && !game.quests.active.some(a => a.id === q.id) && !game.quests.done.includes(q.id)); }
export function acceptQuest(game, q) { game.quests.active.push({ id: q.id, name: q.name, target: q.target, kind: q.kind, done: false }); }
export function shopStock(game, deps, locId) {
  const rng = makeRng(deps.seedBase + game.day * 7 + locId.length); const stock = [];
  const wants = [['weapon', 'common'], ['weapon', 'uncommon'], ['armour', 'common'], ['armour', 'uncommon'], ['weapon', 'common'], ['alchemy', 'uncommon'], [null, 'rare']];
  for (const [category, rarity] of wants) { const r = game.data.items.roll({ race: rng.pick(['human', 'dwarf', 'elf']), category: category || undefined, rarity, seed: rng.int(1, 1e9), namegen: deps.namegen, lore: false }); if (r) { r.price = Math.max(3, Math.round(r.value * 1.2)); stock.push(r); } }
  return stock;
}
