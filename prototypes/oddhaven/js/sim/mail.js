// Letters (PLAN §1 "The Phone"). Every letter comes from something that really happened: a bills run, a payslip, a promotion, a tow.
// A household keeps the last few, as plain rows; the words are written on the page (js/client/phone-text.js), so a save holds
// only facts. `h.mail = [{ i, t, k, ...facts, read? }]`.

const LETTER = {
  promoted: e => ({ who: e.who, job: e.job, rank: e.rank }),
  mishap: e => ({ who: e.who, job: e.job }),
  tow: e => ({ who: e.who, amount: e.amount, reason: e.reason }),
  fetched: e => ({ who: e.who, amount: e.amount }),
  wage: e => ({ who: e.who, job: e.job, pay: e.pay, played: e.played, hands: e.hands, heldHours: e.heldHours }),
  newjob: e => ({ who: e.who, job: e.job, place: e.place }),
  stir: e => ({ a: e.a, b: e.b, stir: e.stir, ok: e.ok }),
  friends: e => ({ a: e.a, b: e.b }),
  rescued: e => ({ who: e.who, person: e.person, place: e.place }),
  discharged: e => ({ who: e.who }),
  ticket: e => ({ who: e.who, amount: e.amount, why: e.why }),
  arrested: e => ({ who: e.who, amount: e.amount, why: e.why, place: e.place }),
  permit: e => ({ who: e.who, amount: e.amount, permit: e.permit, days: e.days }),
  'pet.found': e => ({ who: e.who, person: e.person, pet: e.pet }),
};

export function sendMail(c, h, k, facts) {
  const n = (h.mailNext = (h.mailNext || 0) + 1);
  h.mail ||= [];
  h.mail.push({ i: n, t: c.s.t, k, ...facts });
  if (h.mail.length > c.k.mail.cap) h.mail.shift();
}

/** The shared log's entries that are worth a letter. A letter about two people goes to both homes. */
export function mailFromLog(c, e) {
  const make = LETTER[e.kind]; if (!make) return;
  const ids = e.who !== undefined ? [e.who] : [e.a, e.b], homes = new Set();
  for (const id of ids) { const h = c.s.people[id]?.household; if (h !== undefined) homes.add(h); }
  for (const h of homes) sendMail(c, c.s.households[h], e.kind, make(e));
}
