// What the Phone shows (PLAN §1): one household's bank, jobs, mail and calendar, worked out on request, so it costs nothing until
// somebody opens it. Never changes the state. Pure; the same in a Worker and a room.

import { payRate, rankOf } from './economy.js';
import { isWorkDay } from './people.js';
import { threadsFor, whosWho } from './gossip.js';
import { spellChoices, wrongChance } from './spells.js';

/** Where this person could take this job: the nearest place with a seat free. */
export function openingFor(c, p, jobId) {
  let best = null, d = Infinity;
  for (const pl of c.places) {
    const n = pl.jobs?.[jobId]; if (!n) continue;
    const taken = (c.staff[pl.id] || []).filter(id => c.s.people[id].job === jobId).length;
    if (taken >= n) continue;
    const e = c.roads.distance(c.places[p.home].node, pl.node);
    if (e < d) { d = e; best = pl; }
  }
  return best;
}
function openings(c, who) {
  const p = c.s.people[who], out = [];
  for (const job of c.d.jobs.jobs) {
    if (job.fallback || job.id === p?.job) continue;
    const pl = p && openingFor(c, p, job.id);
    if (pl) out.push({ job: job.id, title: job.title, pay: job.payPerHour, place: pl.id, shifts: job.shifts, hands: !!job.chain });
  }
  return out.sort((a, b) => b.pay - a.pay);
}

export function phoneOf(c, household, who) {
  const s = c.s, h = s.households[household], t = s.t, today = c.clock.day(t), every = c.k.economy.billsEveryDays;
  if (!h) return null;
  const nextBills = Math.ceil((today + 1) / every) * every;
  const days = [...Array(7)].map((_, i) => today + i);
  const members = h.members.map(id => {
    const p = s.people[id], job = p.job ? c.jobById[p.job] : null, sh = job?.shifts[p.shift];
    return {
      id, name: p.name, job: p.job, title: job?.title ?? (p.retired ? 'Retired' : 'Between jobs'), work: p.work, shift: sh ?? null, retired: !!p.retired,
      rate: job ? Math.round(payRate(c, job, p) * 10) / 10 : 0, rank: job ? rankOf(c, p, job) : 0, shifts: p.shifts, earned: p.pay || 0,
      days: job ? days.map(d => isWorkDay(job, p, d)) : days.map(() => false), onShift: !!p.sh, chain: job?.chain ?? null,
    };
  });
  const S = s.sites;
  return {
    id: h.id, name: h.name, money: h.money, bill: h.bill, nextBills, today, days, every,
    book: (h.book || []).slice().reverse(), mail: (h.mail || []).slice().reverse(), members,
    story: (h.story || []).slice().reverse(), threads: threadsFor(c, h.id), who: whosWho(c, h.id, who), sheets: s.sheets.slice().reverse(), homeWas: h.homeWas ?? null, home: h.home,
    openings: who >= 0 ? openings(c, who) : [],
    timber: S ? { standing: S.trees.filter(x => x.st === 0).length, landing: S.landing, deck: S.deck, rack: S.rack, yards: Object.values(S.yards).reduce((a, b) => a + b, 0), felled: S.made.felled, planks: S.made.planks } : null,
  };
}
