// Play-test 2 messages (protocol v6, docs/protocol.md §18 / requests.md "A -> D-UI … v6") sent from the interface.
// Uses stream A's net/client.js method when it has one, else writes the JSON on the right socket itself (`net._raw`),
// so the windows work the moment the server knows the message. Every call is a user action (a click, a key) — never
// a loop — so an older server that drops an unknown message never sees enough of them to call it abuse.

const raw = (net, sock, o) => { if (!net) return false; if (typeof net._raw === 'function') { net._raw(sock, JSON.stringify(o)); return true; } return false; };
const clean = o => { for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null) delete o[k]; return o; };

export const send2 = {
  /** loot {op:'open'|'take'|'all'|'close'|'roll', id?, uid?, roll?, choice?} — province socket. */
  loot(net, op, a = {}) { if (typeof net?.lootOp === 'function') return net.lootOp(op, a); return raw(net, 'game', clean({ t: 'loot', op, id: a.id, uid: a.uid != null ? String(a.uid) : undefined, roll: a.roll, choice: a.choice })); },
  /** shop {op:'open'|'buy'|'sell'|'back', npc, id?, uid?}. */
  shop(net, op, a = {}) { if (typeof net?.shopOp === 'function') return net.shopOp(op, a); return raw(net, 'game', clean({ t: 'shop', op, npc: a.npc, id: a.id != null ? String(a.id) : undefined, uid: a.uid != null ? String(a.uid) : undefined })); },
  /** gw settings {op:'get'|'set', data?}. */
  settings(net, op, data) { if (typeof net?.settingsOp === 'function') return net.settingsOp(op, data); return raw(net, 'gw', clean({ t: 'settings', op, data })); },
  /** pref {k:'showGear'|'showHelm', v} — province socket. */
  pref(net, k, v) { if (typeof net?.pref === 'function') return net.pref(k, v); return raw(net, 'game', { t: 'pref', k, v: !!v }); },
  /** follow {id} — the server's yes/no (followR). */
  follow(net, id) { if (typeof net?.follow === 'function') return net.follow(id); return raw(net, 'game', { t: 'follow', id }); },
  /** barber {npc, look} (in the world) / gw look {char, look} (title screen). */
  barber(net, npc, look) { if (typeof net?.barber === 'function') return net.barber(npc, look); return raw(net, 'game', { t: 'barber', npc, look }); },
  look(net, char, look) { if (typeof net?.setLook === 'function') return net.setLook(char, look); return raw(net, 'gw', { t: 'look', char, look }); },
  /** party loot threshold (leader only): gw party {op:'loot', code}. */
  lootMin(net, code) { if (typeof net?.partyOp === 'function') { net.partyOp('loot', { code }); return true; } return raw(net, 'gw', { t: 'party', op: 'loot', code }); },
};
