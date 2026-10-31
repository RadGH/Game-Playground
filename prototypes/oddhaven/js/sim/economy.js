// Money. Every coin moves through earn() or charge(), which write the ledger, so the books can be checked: each
// household's money = what it started with + its ledger. Rule 4: nothing can take a household below zero. A charge it
// cannot meet is covered by a hardship grant, which is logged, because a working town should never need one.

import { log } from './log.js';
import { rand } from './rng.js';
import { addMoodlet } from './needs.js';
import { useRepairs } from './work.js';
import { sendMail } from './mail.js';

export function earn(c, h, amount, reason) {
  const a = Math.round(amount);
  if (a <= 0) return;
  h.money += a;
  h.ledger[reason] = (h.ledger[reason] || 0) + a;
  book(c, h, a, reason);
}
/** The statement the Bank app reads: the last few movements. */
function book(c, h, a, reason) {
  const rows = (h.book ||= []), last = rows[rows.length - 1], day = c.clock.day(c.s.t);
  if (last && last[0] === day && last[2] === reason) { last[1] += a; return; }
  rows.push([day, a, reason]);
  if (rows.length > c.k.mail.bookRows) rows.shift();
}

/** A charge that must be met (bills, invoices, meals). */
export function charge(c, h, amount, reason) {
  const a = Math.round(amount);
  if (a <= 0) return;
  if (h.money < a) {
    const gap = a - h.money;
    earn(c, h, gap, 'hardship');
    h.hardship = (h.hardship || 0) + 1;
    log(c, 'hardship', { household: h.id, amount: gap, reason });
    sendMail(c, h, 'hardship', { amount: gap, reason });
  }
  h.money -= a;
  h.ledger[reason] = (h.ledger[reason] || 0) - a;
  book(c, h, -a, reason);
}

/** Spending on a want: only with money to spare after the next bill. */
export const canSpend = (c, h, amount) => h.money >= amount + h.bill + c.k.economy.spendCushion;

export const payRate = (c, job, p) => job.payPerHour * (1 + c.k.economy.rankPayStep * rankOf(c, p, job));
export const rankOf = (c, p, job) => Math.floor((p.xp[job.skill] || 0) / c.k.economy.rankXpStep);

/** Expected earnings of a household in one billing cycle: rent is set against this, so no home is unaffordable. */
export function expectedIncome(c, h) {
  const cycle = c.k.economy.billsEveryDays;
  let total = 0;
  for (const id of h.members) {
    const p = c.s.people[id];
    if (p.job) {
      const job = c.jobById[p.job], [a, b] = job.shifts[p.shift], [on, off] = job.days;
      total += ((b - a + 24) % 24) * job.payPerHour * cycle * on / (on + off);
    } else if (p.retired) total += c.k.economy.pensionPerCycle;
  }
  return total;
}

export function setBill(c, h) {
  const e = c.k.economy, place = c.places[h.home];
  const asked = e.billsBase + place.rent + e.billsPerPerson * h.members.length;
  h.bill = Math.round(Math.min(asked, e.billsMaxIncomeShare * expectedIncome(c, h)));
}

/** End of a shift: pay for the time actually on the job, grow the skill, and run the job's abstract result. `handsHours` were played, at `handsRate` (rule 3). */
export function payShift(c, p, job, ticks, { handsHours = 0, handsRate = 1 } = {}) {
  const simHours = c.clock.hours(ticks), hours = simHours + handsHours;
  if (hours <= 0) return { pay: 0, played: 0 };
  const h = c.s.households[p.household], rate = payRate(c, job, p), pay = Math.round(simHours * rate), played = Math.round(handsHours * rate * handsRate);
  earn(c, h, pay, 'pay');
  earn(c, h, played, 'handson');
  p.pay = (p.pay || 0) + pay + played;
  p.shifts++;
  const before = rankOf(c, p, job);
  p.xp[job.skill] = (p.xp[job.skill] || 0) + hours * c.k.economy.rankXpPerHour;
  const after = rankOf(c, p, job);
  if (after > before) { log(c, 'promoted', { who: p.id, job: job.id, rank: after }); addMoodlet(c, p, 'promoted', 0.15, 24); }
  const a = job.abstract;
  c.s.output[a.good] = (c.s.output[a.good] || 0) + a.outputPerHour * hours;
  if (rand(c.s) < a.risk * hours) { log(c, 'mishap', { who: p.id, job: job.id }); addMoodlet(c, p, 'mishap', -0.08, 8); }
  return { pay: pay + played, played };
}

/** Bills and pensions, every few days at midnight. Homes get their repairs out of the lumber yards; a letter says how it went. */
export function runBills(c) {
  let total = 0, count = 0;
  for (const h of c.s.households) {
    if (!h.members.length) continue;      // everyone has married out: an empty home has no bills
    let pension = 0;
    for (const id of h.members) if (c.s.people[id].retired) { earn(c, h, c.k.economy.pensionPerCycle, 'pension'); pension += c.k.economy.pensionPerCycle; }
    const earned = (h.ledger.pay || 0) + (h.ledger.handson || 0), since = earned - (h.paidBefore || 0), rep = useRepairs(c, h);
    h.paidBefore = earned;
    charge(c, h, h.bill, 'bills');
    if (rep.short) charge(c, h, rep.short, 'repairs');
    sendMail(c, h, 'statement', { bill: h.bill, pay: since, pension, planks: rep.used, short: rep.short, money: h.money });
    total += h.bill; count++;
  }
  log(c, 'bills', { households: count, total });
}
