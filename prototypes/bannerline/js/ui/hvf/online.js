// Hunters vs Farmers online room (stream H). The room protocol itself is stream D's js/net/lobbysync.js
// (codes, hello/welcome, claims, ready-up, ping-measured input delay, rejoin by token, back to the
// lobby); this file only describes HvF's seats to it as a ROOM MODE (lobbysync.js header):
//
//   const room = await createRoom({ transport, name, dataHash, mode: 'hvf', format, roomMode: hvfRoomMode(rules) })
//   const room = await joinRoom({ transport, code, name, dataHash })            // clients need no room mode
//   room.state.slots = [{ key: 'farmer-0', role, index, kind: 'human'|'ai'|'open'|'closed', owner, local, name, device, ready, difficulty }]
//
// Seats default to AI (a match with one human is a full match); a freed seat goes back to AI. Every seat
// must be a player or an AI to start, so the format's farmer/hunter counts always hold.
// Co-op works by seats: three machines each claim a farmer seat, the hunters are AI.

/** The seat list for a format; seats that still exist keep what they had. */
export function seatsFor(rules, format, old = []) {
  const f = rules.formats[format], out = [];
  const add = (role, n) => { for (let i = 0; i < n; i++) { const key = `${role}-${i}`; const prev = old.find((s) => s.key === key); out.push(prev ? { ...prev } : { key, role, index: i, kind: 'ai', owner: null, local: 0, name: '', device: null, ready: true, difficulty: 'veteran' }); } };
  add('farmer', f.farmers); add('hunter', f.hunters);
  return out;
}

/** The sim players[] for a room's seats (the order is the packet's player ids). */
export function playersFromSeats(seats) {
  let colour = 0;
  return seats.filter((s) => s.kind === 'human' || s.kind === 'ai').map((s) => {
    const p = { role: s.role, kind: s.kind === 'human' ? 'human' : 'ai', name: s.name || (s.kind === 'ai' ? `${s.role === 'farmer' ? 'Farmer' : 'Hunter'} AI` : 'Player') };
    if (s.role === 'farmer') p.colour = colour++;
    if (s.kind === 'ai') p.ai = { difficulty: s.difficulty };
    return p;
  });
}

/** lobbysync room mode for Hunters vs Farmers. */
export function hvfRoomMode(rules) {
  return {
    formats: Object.keys(rules.formats),
    slots: (format, old) => seatsFor(rules, format, old),
    vacant: (s) => Object.assign(s, { kind: 'ai', owner: null, name: '', ready: true, device: null }),
    claimable: (s) => s.kind === 'open' || s.kind === 'ai',
    check(slots) {
      if (slots.some((s) => s.kind !== 'human' && s.kind !== 'ai')) return 'every seat needs a player or an AI';
      return null;
    },
    players: (used) => playersFromSeats(used),
  };
}
