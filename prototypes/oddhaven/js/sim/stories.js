// The small things that happen to a household nobody is playing, so a family left alone for ten days has something to tell (PLAN pass test).
// One roll a household a day, off a hash of the day, not the sim's random stream, so the same things happen at every detail level. What can
// happen is data/stories.json; the words are data/news.json.
import { log } from './log.js';
import { addMoodlet } from './needs.js';
import { nudge, feelingIndex } from './feelings.js';
import { earn, canSpend } from './economy.js';
import { hashString } from './rng.js';
import { startFire } from './fire.js';
import { startRomance, startFeud, nudgeStory } from './threads.js';
import { raceTouch } from './racemood.js';
import { isSingle, partnerId } from './social.js';
import { fxOf } from './quirks.js';

const h01 = text => parseInt(hashString(text), 16) / 4294967296;

function neighbour(c, h, salt) {
  const s = c.s, node = c.places[h.home].node, near = s.households.filter(q => q !== h && q.members.length && c.places[q.home].node === node), list = near.length ? near : s.households.filter(q => Math.abs(q.id - h.id) <= 3 && q !== h && q.members.length);
  if (!list.length) return null;
  const q = list[Math.floor(h01(salt) * list.length)];
  return s.people[q.members[Math.floor(h01(salt + 'm') * q.members.length)]];
}
const single = (c, p) => isSingle(c, p);
function aSingle(c, p, salt) {
  const list = c.s.people.filter(q => q.household !== p.household && single(c, q) && Math.abs(q.age - p.age) < 14);
  return list.length ? list[Math.floor(h01(salt) * list.length)] : null;
}

function happen(c, h, id, p, salt) {
  const K = c.d.stories.kinds[id], s = c.s;
  let other = null;
  if (K.other === 'neighbour') other = neighbour(c, h, salt);
  else if (K.other === 'single') other = aSingle(c, p, salt);
  else if (K.other === 'date') { const id = partnerId(c, p.id); other = id >= 0 ? s.people[id] : null; }
  if (K.other && !other) return false;
  if (K.money < 0 && !canSpend(c, h, -K.money)) return false;
  // a date is the start of a thread, not a fact on its own; a row over the fence can become a feud
  if (id === 'first_date') return !!startRomance(c, p, other);
  if (K.money > 0) { earn(c, h, K.money, 'found'); raceTouch(c, p, 'found'); } if (K.money < 0) { h.money += K.money; h.ledger.found = (h.ledger.found || 0) + K.money; }
  if (K.mood) addMoodlet(c, p, id, K.mood[0], K.mood[1]);
  if (other && K.mood) addMoodlet(c, other, id, K.mood[0], K.mood[1]);
  if (other) for (const [f, v] of Object.entries(K.feel || {})) { nudge(c, p, other.id, f, v); nudge(c, other, p.id, f, v); }
  log(c, 'story', { story: id, who: p.id, ...(other ? { other: other.id } : null), ...(K.money ? { amount: K.money } : null), hh: [...new Set([h.id, ...(other ? [other.household] : [])])] });
  if (id === 'neighbour_row') { const fx = fxOf(c, p), list = c.d.social.neighbourCauses, cause = fx.noisy ? 'noise' : list[Math.floor(h01(salt + 'cause') * list.length)]; startFeud(c, p, other, cause); }
  // a small spell in a small kitchen, now and then, goes further than it should
  if (id === 'spell_wrong' && h01(salt + 'fire') < c.k.stories.spellFireChance && p.at === h.home) startFire(c, { building: c.places[h.home].building, cause: 'spell', who: p.id });
  void s;
  return true;
}

export function stepStories(c) {
  const s = c.s, cl = c.clock, k = c.k.stories, t = s.t;
  if (t % cl.ticksPerDay !== (cl.tickAt(1, k.hour * 60) % cl.ticksPerDay)) return;
  const day = cl.day(t), kinds = Object.entries(c.d.stories.kinds);
  const recentFire = s.news.filter(r => r.k === 'fire.out' && r.rooms > 0).flatMap(r => r.hh);
  for (const h of s.households) {
    if (!h.members.length) continue;
    for (const id of h.members) { const p = s.people[id]; if (parseInt(hashString(`bday/${s.seed}/${id}`), 16) % 28 === day % 28) log(c, 'story', { story: 'birthday', who: id, hh: [h.id], age: p.age }); }
    const salt = `${s.seed}/${day}/${h.id}`;
    if (h.premade && nudgeStory(c, h, day)) continue;
    // the street looks after its own
    if (recentFire.includes(h.id) && h01(salt + 'pie') < k.pieChance) { const p = s.people[h.members[0]]; if (happen(c, h, 'pie', p, salt)) continue; }
    if (h01(salt) >= k.dailyChance) continue;
    const who = s.people[h.members[Math.floor(h01(salt + 'who') * h.members.length)]];
    const fits = kinds.filter(([, K]) => K.weight > 0 && (!K.needs || (K.needs === 'single' ? single(c, who) : K.needs === 'dating' ? partnerId(c, who.id) >= 0 : K.needs === 'job' ? !!who.job : K.needs === 'car' ? who.car >= 0 : true)));
    let r = h01(salt + 'kind') * fits.reduce((n, [, K]) => n + K.weight, 0);
    for (const [id, K] of fits) { r -= K.weight; if (r <= 0) { happen(c, h, id, who, salt); break; } }
  }
}
