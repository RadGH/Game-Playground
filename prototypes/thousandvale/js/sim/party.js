// Parties (stream A, PLAN §5.3/§5.5). Pure bookkeeping — the world sends the messages.
// A party lives while it has members (online or not); it is not saved (a server restart disbands
// parties — fine at M1). Max PARTY_MAX members. Every party has a 5-letter join code for the
// "join my party" link (https://<host>/?join=CODE).
//
//   const P = createParties({ random })
//   P.of(charId) -> party | null           party = { id, leader, members: [charId…], code, invites: Set<charId> }
//   P.create(leader) ; P.invite(fromChar, toChar) ; P.accept(char, partyId) ; P.decline(char, partyId)
//   P.join(char, code) ; P.leave(char) ; P.kick(byChar, char) ; P.lead(byChar, char)
// Every call returns { ok: true, party, changed: [party…] } or { ok: false, why }.

import { CODE_ALPHABET, CODE_LENGTH, PARTY_MAX } from '../net/protocol.js';

export function createParties({ random = Math.random } = {}) {
  const byId = new Map(), byChar = new Map(), byCode = new Map();
  let nextId = 1;
  const newCode = () => {
    for (;;) {
      let c = '';
      for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
      if (!byCode.has(c)) return c;
    }
  };
  const P = {
    byId,
    of: c => byChar.get(c) || null,
    get: id => byId.get(id) || null,
    byCode: code => byCode.get(code) || null,
    create(leader) {
      const old = byChar.get(leader);
      if (old) return { ok: true, party: old, changed: [] };
      const p = { id: nextId++, leader, members: [leader], code: newCode(), invites: new Set() };
      byId.set(p.id, p); byChar.set(leader, p); byCode.set(p.code, p);
      return { ok: true, party: p, changed: [p] };
    },
    invite(from, to) {
      if (from === to) return { ok: false, why: 'party' };
      const p = byChar.get(from) || P.create(from).party;
      if (p.leader !== from) return { ok: false, why: 'party' };
      if (p.members.length >= PARTY_MAX) return { ok: false, why: 'partyFull' };
      if (p.members.includes(to)) return { ok: false, why: 'party' };
      p.invites.add(to);
      return { ok: true, party: p, changed: [p] };
    },
    accept(c, partyId) {
      const p = byId.get(partyId);
      if (!p || !p.invites.has(c)) return { ok: false, why: 'party' };
      p.invites.delete(c);
      return addMember(p, c);
    },
    decline(c, partyId) { const p = byId.get(partyId); if (p) p.invites.delete(c); return { ok: true, party: p, changed: [] }; },
    join(c, code) {
      const p = byCode.get(code);
      if (!p) return { ok: false, why: 'noCode' };
      if (p.members.includes(c)) return { ok: true, party: p, changed: [] };
      return addMember(p, c);
    },
    leave(c) {
      const p = byChar.get(c);
      if (!p) return { ok: false, why: 'party' };
      p.members = p.members.filter(m => m !== c);
      byChar.delete(c);
      if (!p.members.length) { byId.delete(p.id); byCode.delete(p.code); return { ok: true, party: null, left: p, changed: [] }; }
      if (p.leader === c) p.leader = p.members[0];
      return { ok: true, party: p, left: p, changed: [p] };
    },
    kick(by, c) {
      const p = byChar.get(by);
      if (!p || p.leader !== by || by === c || !p.members.includes(c)) return { ok: false, why: 'party' };
      const r = P.leave(c);
      return { ...r, kicked: c };
    },
    lead(by, c) {
      const p = byChar.get(by);
      if (!p || p.leader !== by || !p.members.includes(c)) return { ok: false, why: 'party' };
      p.leader = c;
      return { ok: true, party: p, changed: [p] };
    },
  };
  function addMember(p, c) {
    if (p.members.length >= PARTY_MAX) return { ok: false, why: 'partyFull' };
    const changed = [p];
    const old = byChar.get(c);
    if (old && old !== p) { const r = P.leave(c); if (r.party) changed.push(r.party); }
    p.members.push(c); byChar.set(c, p);
    return { ok: true, party: p, changed };
  }
  return P;
}
