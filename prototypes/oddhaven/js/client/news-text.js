// The words of Moments, a family's story and the Odd Sheet: facts in from the sim, sentences out of data/news.json. Pure, so a node test can
// read every line for a stray `{` and the 10-day story test can print exactly what a player would read.
//   const news = createNews(table, roster);   news.line(row)  news.head(row)  news.body(row)  news.sheet(sheet)  news.dayOf(t)
import { placeName } from './orders.js';

const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const pickOf = (list, key) => (Array.isArray(list) ? list[hash(key) % list.length] : list);
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const tallyLine = c => `Since the last issue: ${plural(c.rifts ?? 0, 'rift')}, ${plural(c.arrests ?? 0, 'arrest')}, ${plural(c.tickets ?? 0, 'ticket')}, ${plural(c.fires, 'fire')}, ${plural(c.rescues, 'rescue')}, ${plural(c.tows, 'tow')}, ${plural(c.friends, 'new friendship')}, ${plural(c.promoted, 'promotion')}, ${plural(c.weddings ?? 0, 'wedding')}, ${plural(c.feuds ?? 0, 'feud')} still going.`;

export function createNews(T, roster) {
  const first = id => roster.people[id]?.name.split(' ')[0] ?? 'Someone', full = id => roster.people[id]?.name ?? 'Someone';
  const owners = new Map(); for (const h of roster.households) { owners.set(h.home, h); if (h.was != null) owners.set(h.was, h); }
  // a place in a sentence: "the Kettle home", "the cafe in Brackenford"
  const town = z => (typeof z === 'string' && z !== 'country' ? z[0].toUpperCase() + z.slice(1) : '');
  const place = id => {
    const pl = roster.places[id]; if (id === undefined || !pl) return 'somewhere';
    if (pl.role === 'home') { const h = owners.get(id); return h ? `the ${h.name} home` : pl.kind === 'apartment' ? `a flat in ${town(pl.zone) || 'town'}` : `a house in ${town(pl.zone) || 'town'}`; }
    const name = placeName(pl), w = town(pl.zone);
    return `the ${name[0].toLowerCase() + name.slice(1)}${w ? ` in ${w}` : ''}`;
  };
  const entry = row => (row.k === 'story' ? T.stories[row.story] : row.k === 'radio' ? T.beats[`radio.${row.why}`] : row.k === 'rift.closed' && row.how === 'county' ? T.beats['rift.county'] : T.beats[row.k]);
  const pranked = id => T.pranks[id] ?? 'did something unspeakable';
  const vars = row => ({
    prank: pranked(row.prank), prank2: pranked(row.prank), guests: row.guests ?? 0,
    who: first(row.who), full: full(row.who), person: first(row.person), other: first(row.other), a: first(row.a), b: first(row.b), place: place(row.place), cause: T.cause[row.cause] ?? 'nobody knows what',
    pet: row.pet ?? 'the pet', find: T.finds?.[row.find] ?? 'something odd', kills: row.kills ?? 0, each: row.each ?? 0, offence: T.offence?.[row.why] ?? 'something', rooms: row.rooms ?? 0, roomcount: plural(row.rooms ?? 0, 'room'), amount: Math.abs(row.amount ?? 0), seconds: row.seconds ?? 0, boards: row.boards ?? 0, age: row.age ?? 0,
  });
  const fill = (text, v) => text.replace(/\{(\w+)\}/g, (_, k) => { const low = k.toLowerCase(), val = v[low]; if (val === undefined) return ''; return k === low ? val : String(val).toUpperCase(); });
  const word = (row, part) => { const e = entry(row), list = e?.[part] ?? e?.line; return list ? cap(fill(pickOf(list, `${row.i ?? 0}${part}`), vars(row))) : 'Something happened.'; };
  const self = {
    place, line: row => word(row, 'line'), head: row => word(row, 'head'), body: row => word(row, 'body'),
    dayOf: t => Math.floor((t * roster.clock.minutesPerTick + 360) / 1440),
    /** A thread as one thing you could retell: its steps in order, as a sentence or two. th = threadView. */
    tale(th) {
      const v = { a: first(th.a), b: first(th.b), cause: T.cause[th.cause] ?? 'something', place: place(th.place), rooms: plural(th.rooms ?? 0, 'room'), firecause: T.cause[th.fire] ?? 'nobody knows what' };
      const bits = th.beats.map(b => T.tale[b[1]]).filter(Boolean).map(x => fill(x, v)), out = [...new Set(bits)];
      if (!out.length) return '';
      const text = out.reduce((s, x, i) => s + (i === 0 ? '' : /^(and|then|all)\b/.test(x) ? ', ' : i % 3 === 0 ? '. ' : ', ') + (i && i % 3 === 0 && !/^(and|then|all)\b/.test(x) ? cap(x) : x), '');
      return `${cap(text)}.`;
    },
    causeWord: id => T.cause[id] ?? 'who knows',
    /** A short heading for a thread. */
    title(th) { const a = first(th.a), b = first(th.b); return th.k === 'romance' ? `${a} and ${b}` : th.k === 'feud' ? `${a} against ${b}: ${T.cause[th.cause] ?? 'the row'}` : `The fire at ${place(th.place)}`; },
    /** The Odd Sheet as a page: a lead, a few stories, the gossip column, the small print. */
    sheet(sh) {
      const S = T.sheet, lead = sh.lead ? { head: self.head(sh.lead), body: self.body(sh.lead) } : { head: pickOf(S.quiet.head, sh.no), body: pickOf(S.quiet.body, sh.no) };
      const followed = r => (r.arc && r.part >= 2 ? `${fill(pickOf(S.part, `${r.i}`), { n: r.part })} ${fill(pickOf(S.sofar, `${r.i}s`), { tale: self.tale(r.arc) })}` : '');
      if (sh.lead?.arc) lead.follow = followed(sh.lead);
      const stories = sh.stories.map(r => ({ head: self.head(r), body: self.line(r), follow: followed(r) }));
      const column = sh.column.map((r, i) => fill(pickOf(S.column, `${sh.no}${i}`), { line: self.line(r) }));
      const by = first(sh.columnist);
      return { no: sh.no, day: sh.day, lead, stories, column, by, signoff: fill(pickOf(S.signoff, sh.no), { who: by }), tally: tallyLine(sh.tally) };
    },
  };
  return self;
}
