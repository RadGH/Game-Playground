// The words of the Phone: letters, the bank statement, Happening now. Pure: facts in from the sim, plain sentences out, so a node test
// can read every line for a stray `undefined`.
import { placeName } from './orders.js';

const first = (roster, id) => roster.people[id]?.name.split(' ')[0] ?? 'Someone';
const coins = n => `${n} coin${n === 1 ? '' : 's'}`;
const jobName = (roster, id) => roster.jobs[id]?.title ?? 'the job';
const SCENE = { introduce: 'meeting', date: 'on a date', row: 'having a row', patch: 'patching it up' };
const PRANK = { gnome: 'has been moving your gnome', bins: 'put your bins out on the wrong day', hedge: 'trimmed your hedge into a rude shape', note: 'left you a very polite note', flyers: 'pinned up flyers about your manners', doorbell: 'taught your doorbell a new tune', cones: 'put traffic cones round your car' };
const STAGE = { first_date: 'on a first date', second_date: 'on a second date', proposal: 'having a big talk', wedding: 'getting married', row: 'having a public row', showdown: 'at the town hall', thanks: 'saying thank you', housewarming: 'at a housewarming' };
const WHY = { fine: 'Town hall fine', wedding: 'Wedding', joined: 'Joined accounts', pay: 'Wages', handson: 'Hands-on wages', pension: 'Pension', bills: 'Bills', repairs: 'Repairs', food: 'Food', treats: 'Treats', tow: 'Tow gnome', travel: 'Taxi', hardship: 'Hardship grant', found: 'Found', mech: 'Found', insurance: 'Insurance paid out', clinic: 'Clinic' };
export const bookReason = r => WHY[r] ?? 'Other';

/** { from, subject, lines } for one letter. */
export function letterOf(m, roster) {
  const who = first(roster, m.who);
  switch (m.k) {
    case 'statement': return { from: 'Wend County Bank', subject: `Your bills: ${coins(m.bill)}`, lines: [`Bills paid: ${coins(m.bill)}.`, m.pay > 0 ? `Wages since last time: ${coins(m.pay)}.` : 'No wages since last time.', ...(m.pension ? [`Pension: ${coins(m.pension)}.`] : []), ...(m.planks ? [`Your home's repairs used ${m.planks} boards from the lumber yard.`] : []), ...(m.short ? [`The yard was short of boards, so repairs cost ${coins(m.short)} more.`] : []), `Balance now: ${coins(m.money)}.`] };
    case 'hardship': return { from: 'Wend County Bank', subject: 'A hardship grant', lines: [`You were ${coins(m.amount)} short, so the county covered it. This should never happen. Tell someone.`] };
    case 'wage': return { from: m.job === 'firefighter' ? 'Wend County Fire Service' : 'Wend Timber Co.', subject: `Payslip for ${who}: ${coins(m.pay)}`, lines: [`${who} worked a shift as ${jobName(roster, m.job)} and was paid ${coins(m.pay)}.`, `${m.hands} hours done by hand at the hands-on rate, out of ${m.heldHours} on site.`] };
    case 'promoted': return { from: 'The boss', subject: `${who} got a promotion`, lines: [`Well done, ${who}. You are now rank ${m.rank} as ${jobName(roster, m.job)}, and that means more pay.`] };
    case 'mishap': return { from: 'The accident book', subject: `${who} had a small mishap`, lines: [`${who} had a mishap at work as ${jobName(roster, m.job)}. Nothing a plaster cannot fix. Please be more careful.`] };
    case 'tow': return { from: 'The tow gnome', subject: `Invoice: ${coins(m.amount)}`, lines: [`${who}'s car got ${m.reason === 'flipped' ? 'turned over' : 'stuck'}. It has been put back on the road. That will be ${coins(m.amount)}.`] };
    case 'fetched': return { from: 'The tow gnome', subject: `Invoice: ${coins(m.amount)}`, lines: [`Somebody left a car out. It is back home now. That will be ${coins(m.amount)}.`] };
    case 'newjob': return { from: roster.places[m.place] ? placeName(roster.places[m.place]) : 'Your new boss', subject: `Welcome, ${who}`, lines: [`${who} starts as ${jobName(roster, m.job)}. Do not be late.`] };
    case 'friends': return { from: first(roster, m.a), subject: 'Good to see you', lines: [`${first(roster, m.a)} and ${first(roster, m.b)} are friends now. Nobody saw it coming.`] };
    case 'insurance': return { from: 'Wend Mutual Insurance', subject: `Your fire claim: ${coins(m.cost)}`, lines: [`We have paid for the repairs to ${m.rooms} room${m.rooms === 1 ? '' : 's'}: ${coins(m.cost)}.`, m.excess ? `Your share is ${coins(m.excess)}.` : 'There is nothing for you to pay.', ...(m.moved ? ['Your home cannot be lived in yet. The county has found you somewhere to stay, and you go back when the repairs are done.'] : ['The repair crew will be round once the boards come from the yard.'])] };
    case 'clinic': return { from: 'Wend Clinic', subject: `${who} is with us`, lines: [`${who} breathed in some smoke and we are keeping an eye on them. Your insurance has paid the ${coins(m.cost)}.`] };
    case 'feud': return { from: 'A neighbour', subject: 'Regarding last night', lines: [`Somebody ${PRANK[m.prank] ?? 'did something unspeakable'}. ${first(roster, m.b)} knows who it was, and so does ${first(roster, m.a)}.`] };
    case 'sheet': return { from: 'The Odd Sheet', subject: `The Odd Sheet, issue ${m.no}, is out`, lines: ['The paper is out. Open the Paper app on your Phone to read it.'] };
    case 'rescued': return { from: 'Wend County Fire Service', subject: `${first(roster, m.person)} is out safe`, lines: [`${who} carried ${first(roster, m.person)} out of ${roster.places[m.place] ? placeName(roster.places[m.place]) : 'the fire'}. You may want to say thank you.`] };
    case 'discharged': return { from: 'Wend Clinic', subject: `${who} can go home`, lines: [`${who} has been sent home, and told to stop complaining about the food.`] };
    case 'stir': {
      const a = first(roster, m.a), b = first(roster, m.b), T = { introduce: [`${a} and ${b} have met. It went fine.`, `${a} and ${b} have met. It was awkward.`], date: [`${a} and ${b} went on a date. There may be a second.`, `${a} and ${b} went on a date. There will be no second.`], row: [`${a} and ${b} had a blazing row. Nobody knows what about.`, `${a} and ${b} nearly had a row, then laughed about it.`], patch: [`${a} and ${b} have made up.`, `${a} tried to make up with ${b}. It did not work.`] }[m.stir];
      return { from: 'A little bird', subject: `Have you heard about ${a}?`, lines: [T?.[m.ok ? 0 : 1] ?? `${a} and ${b}: something happened.`] };
    }
    default: return { from: 'The post', subject: 'A letter', lines: ['Something happened. The ink has run.'] };
  }
}

/** One line of Happening now. */
export function happeningLine(r, roster, news = null) {
  const who = r.who !== undefined ? first(roster, r.who) : '';
  switch (r.k) {
    case 'fire': return `Fire at ${roster.places[r.place] ? placeName(roster.places[r.place]) : 'a building'}: ${r.n} room${r.n === 1 ? '' : 's'} alight${r.down ? `, ${r.down} inside` : ''}`;
    case 'moment': return news ? news.line(r.m) : 'Something is going on';
    case 'scene': return `${first(roster, r.a)} and ${first(roster, r.b)}: ${SCENE[r.stir] ?? 'a scene'}`;
    case 'stage': return `${first(roster, r.a)} and ${first(roster, r.b)}: ${STAGE[r.scene] ?? 'a scene'}`;
    case 'flipped': return `${who}'s car is on its roof`;
    case 'blocked': return 'Something is blocking a road';
    case 'felling': return `${r.n} felling in Wend Wood`;
    case 'sawing': return `${r.n} at the saws in Wend Mill`;
    case 'truck': return `${who} is taking ${r.planks} boards to the lumber yard`;
    case 'deckfull': return 'The mill deck is full of logs';
    case 'noplanks': return 'The lumber yards are out of boards';
    case 'stir': return `${first(roster, r.a)} and ${first(roster, r.b)}: ${r.ok ? 'it went well' : 'it went badly'}`;
    case 'quarrel': return `${first(roster, r.a)} and ${first(roster, r.b)} had words`;
    case 'friends': return `${first(roster, r.a)} and ${first(roster, r.b)} are friends now`;
    case 'promoted': return `${who} got a promotion`;
    case 'mishap': return `${who} had a mishap at work`;
    case 'wage': return `${who} finished a shift by hand`;
    case 'tow': return `The tow gnome got ${who}'s car`;
    case 'bills': return 'Bills are due at midnight';
    default: return 'Something is going on';
  }
}
