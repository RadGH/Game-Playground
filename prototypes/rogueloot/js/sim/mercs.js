// The mercenary hall (M19, ruling 31): hire one of three kinds, give it a weapon / chest / head from your bag, revive it
// for gold when it has fallen, or let it go. Pure. Hiring and reviving happen at the hall's NPC (marker npc id mercenary).
import { spawnAlly, allyId } from './allies.js';
import { findSpot } from '../rules/bag.js';
import { itemReq } from '../rules/items.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const atHall = (w, p) => (w.area.markers || []).some(m => m.kind === 'npc' && m.id === 'mercenary' && dist(p, m) < 5);
export const hirePrice = (M, kind, L) => { const pr = M.kinds[kind]?.price || [50, 25]; return Math.round(pr[0] + pr[1] * L); };
export const revivePrice = (M, L) => Math.round((M.revive?.[0] || 20) + (M.revive?.[1] || 12) * L);
const SLOT_OK = { weapon: b => b.slot === 'weapon', chest: b => b.slot === 'chest', head: b => b.slot === 'head' };

export function mercAct(w, p, a) {
  const M = w.content.mercs; if (!M) return { err: 'No mercenaries here.' };
  const ch = p.char, L = ch.level, done = () => { w.charDirty.add(p.id); return { ok: true }; };
  const respawn = () => { w.allies?.delete(allyId(p.id)); if (p.char.merc && !p.char.merc.dead) spawnAlly(w, p.id, p.char.merc); };
  switch (a.op) {
    case 'hire': {
      if (!atHall(w, p)) return { err: 'Hire at the mercenary hall in town.' };
      const K = M.kinds[a.kind]; if (!K) return { err: 'No such mercenary.' };
      if (ch.merc && !ch.merc.dead && !a.replace) return { err: 'You already have a mercenary. Let them go first.' };
      const cost = hirePrice(M, a.kind, L); if ((ch.gold || 0) < cost) return { err: `Hiring costs ${cost} gold.` };
      const name = String(a.name || '').replace(/[^\p{L} '-]/gu, '').slice(0, 16) || M.names[Math.floor(w.rng() * M.names.length)];
      p.char = { ...ch, gold: ch.gold - cost, merc: { kind: a.kind, name, equip: {}, dead: false, look: a.look && typeof a.look === 'object' ? a.look : null } };
      respawn(); return done();
    }
    case 'revive': {
      if (!ch.merc?.dead) return { err: 'Your mercenary is fine.' };
      if (!atHall(w, p)) return { err: 'Revive them at the mercenary hall.' };
      const cost = revivePrice(M, L); if ((ch.gold || 0) < cost) return { err: `It costs ${cost} gold.` };
      p.char = { ...ch, gold: ch.gold - cost, merc: { ...ch.merc, dead: false } }; respawn(); return done();
    }
    case 'dismiss': { if (!ch.merc) return { err: 'No mercenary.' }; const back = Object.values(ch.merc.equip || {}).filter(Boolean); let bag = ch.bag || []; for (const it of back) { const pos = findSpot(w.content.items, bag, it); if (!pos) return { err: 'Make room in your bag for their gear first.' }; bag = [...bag, { ...it, pos }]; } p.char = { ...ch, bag, merc: null }; w.allies?.delete(allyId(p.id)); return done(); }
    case 'give': {
      if (!ch.merc) return { err: 'No mercenary.' };
      const slot = a.slot, it = (ch.bag || []).find(i => i.uid === a.uid); if (!it || !SLOT_OK[slot]) return { err: 'They can wear a weapon, a chest piece and a helm.' };
      const b = w.content.items.bases[it.base]; if (!b || !SLOT_OK[slot](b)) return { err: "That doesn't go there." };
      if (it.ided === false) return { err: 'Identify it first.' };
      if (itemReq(w.content.items, it).level > L) return { err: `Too high a level for them (they are ${L}).` };
      let bag = ch.bag.filter(i => i.uid !== it.uid); const old = ch.merc.equip?.[slot];
      if (old) { const pos = findSpot(w.content.items, bag, old); if (!pos) return { err: 'No room for what they wear now.' }; bag = [...bag, { ...old, pos }]; }
      const { pos: _, ...clean } = it;
      p.char = { ...ch, bag, merc: { ...ch.merc, equip: { ...ch.merc.equip, [slot]: clean } } }; respawn(); return done();
    }
    case 'take': {
      const it = ch.merc?.equip?.[a.slot]; if (!it) return { err: 'They wear nothing there.' };
      const pos = findSpot(w.content.items, ch.bag || [], it); if (!pos) return { err: 'No room in your bag.' };
      const equip = { ...ch.merc.equip }; delete equip[a.slot];
      p.char = { ...ch, bag: [...(ch.bag || []), { ...it, pos }], merc: { ...ch.merc, equip } }; respawn(); return done();
    }
  }
  return { err: 'unknown action' };
}
