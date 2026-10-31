// "What did I just do?": the sim's event log turned into a short plain card. Pure, so a test can read every line.
//   recapCard(event, roster, carName) -> { title, lines }         diaryLines(diary, since, roster) -> [line]
import { placeName } from './orders.js';

const first = (roster, id) => roster.people[id]?.name.split(' ')[0] ?? 'Someone';
const metres = m => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export function recapCard(e, roster, carName = m => m) {
  const who = first(roster, e.who), lines = [], seen = new Set();
  const once = t => { if (!seen.has(t)) { seen.add(t); lines.push(t); } };
  if (e.walked >= 5) lines.push(`Walked ${metres(e.walked)}.`);
  if (e.drove >= 5) lines.push(`Drove ${metres(e.drove)}.`);
  for (const r of e.rows) {
    if (r.kind === 'visit') once(`Stopped by ${placeName(roster.places[r.place])}.`);
    else if (r.kind === 'car.in') once(`Got into the ${carName(r.model)}.`);
    else if (r.kind === 'summoned') once(`Called for the ${carName(r.model)}.`);
    else if (r.kind === 'fetched') once(`Left the car out. The tow gnome took it home for ${r.amount} coins.`);
    else if (r.kind === 'tow') once(`The car was towed: ${r.amount} coins.`);
    else if (r.kind === 'late') once(`Turned up ${r.minutes} minutes late for work.`);
    else if (r.kind === 'swapped') once(`Took a turn in charge of the party.`);
    else if (r.kind === 'quarrel') once(`Had words with ${first(roster, r.a === e.who ? r.b : r.a)}.`);
    else if (r.kind === 'friends') once(`Made a friend: ${first(roster, r.a === e.who ? r.b : r.a)}.`);
    else if (r.kind === 'promoted') once('Got a promotion.');
    else if (r.kind === 'mishap') once('Had a small mishap.');
  }
  if (!lines.length) lines.push('Not much. A quiet moment.');
  return { title: `What did ${who} just do?`, lines };
}

/** The diary the sim keeps for everyone: what they got on with while nobody was playing them. */
export function diaryLines(diary, since, roster) {
  const out = [];
  for (const [t, a, place] of diary) {
    if (t < since) continue;
    const label = roster.actions[a]?.label ?? a;
    const line = `${label}, ${placeName(roster.places[place])}`;
    if (out[out.length - 1] !== line) out.push(line);
  }
  return out.slice(-3);
}
