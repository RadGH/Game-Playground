// Four small spells (PLAN M6, roast: "four spells"): Tidy, Warm, Mend and Hush. Modern magic, as ordinary as a kettle and as reliable as one in a bad mood: under a mood line
// a spell can go wrong, and wrong is a real result, not a miss. Both ways (rule 3): anyone can cast by themselves, one roll an hour off a hash (the same at every detail level), an
// order can tell them to (Direct), or you do it with your own hands (`cast`). All of them end in castSpell, so a spell does the same thing whoever asked.
//   { kind:'cast', who, spell, target?, room? }   hands-on: `who` must be yours; target = a person within reach
import { publicCast } from './law.js';
import { say, log } from './log.js';
import { addMoodlet, settle, peekNeeds } from './needs.js';
import { h01, partnerId } from './social.js';
import { startFire, mendRoom, moreBoards } from './fire.js';
import { fxOf } from './quirks.js';
import { coolFeud, feudBetween } from './threads.js';

const K = c => c.k.spells;
const need = (c, id) => c.needIds.indexOf(id);
export const wrongChance = (c, p) => {
  const k = K(c), m = p.mood ?? 0.7, under = Math.max(0, (k.moodLine - m) / k.moodLine);
  return Math.min(0.95, (k.wrongBase + under * (k.wrongAtZero - k.wrongBase)) * (fxOf(c, p).wrong ?? 1));
};
const ready = (c, p) => !(p.sp > c.s.t);
const burntHome = (c, p) => { const b = c.places[p.home].building; return c.s.fire.burnt[b] ? b : null; };

/** What this person can do right now, for the list on the page: [{ id, target?, off? }]. */
export function spellChoices(c, p, near = []) {
  const off = ready(c, p) ? null : 'cooling down', rows = [];
  rows.push({ id: 'tidy', off: off ?? (p.at === p.home || p.hold ? null : 'only at home') });
  for (const id of near) { rows.push({ id: 'warm', target: id, off }); rows.push({ id: 'hush', target: id, off }); }
  if (!near.length) rows.push({ id: 'warm', target: p.id, off });
  rows.push({ id: 'mend', off: off ?? (burntHome(c, p) ? null : 'nothing burned at home') });
  return rows;
}

export function castSpell(c, p, id, { target = -1, room = null } = {}) {
  const k = K(c), s = c.s, t = s.t, salt = `${s.seed}/${p.id}/${id}/${t}`, wrong = h01(salt) < wrongChance(c, p), other = target >= 0 ? s.people[target] : p;
  settle(c, p);
  p.sp = t + c.clock.ticks(k.cooldownMinutes);
  publicCast(c, p);
  const facts = { who: p.id, hh: [...new Set([p.household, other.household])], ...(other !== p ? { other: other.id } : null) };
  let done = true;
  switch (id) {
    case 'tidy': {
      for (const mid of s.households[p.household].members) { const q = s.people[mid]; settle(c, q); const i = need(c, 'clean'); if (wrong) { addMoodlet(c, q, 'tidied_away', -0.06, 8); } else q.n[i] = Math.min(1, q.n[i] + k.tidyClean); }
      if (wrong) log(c, 'story', { story: 'sp_tidy_bad', ...facts });
      break;
    }
    case 'warm': {
      settle(c, other);
      if (wrong) {
        addMoodlet(c, other, 'too_warm', -0.05, 5);
        log(c, 'story', { story: 'sp_warm_bad', ...facts });
        if (p.at === p.home && h01(salt + 'f') < k.warmFireChance) startFire(c, { building: c.places[p.home].building, cause: 'spell', who: p.id });
      } else { const i = need(c, 'comfort'); other.n[i] = Math.min(1, other.n[i] + k.warmComfort); addMoodlet(c, other, 'warmed', k.warmMood, k.warmHours); }
      break;
    }
    case 'mend': {
      const b = burntHome(c, p) ?? (c.places[p.at >= 0 ? p.at : p.home]?.building ?? null);
      if (b === null || !s.fire.burnt[b]) { done = false; break; }
      if (wrong) { moreBoards(c, b, k.mendWrongBoards); log(c, 'story', { story: 'sp_mend_bad', ...facts, place: c.places[p.home].id }); } else { const r = mendRoom(c, b, k.mendBurn, room); if (!r) { done = false; break; } if (r.gone) log(c, 'story', { story: 'sp_mend_ok', ...facts, place: c.places[p.home].id }); }
      break;
    }
    case 'hush': {
      if (other === p) { done = false; break; }
      const feud = feudBetween(c, p.id, other.id) ?? c.s.social.threads.find(x => x.k === 'feud' && (x.a === other.id || x.b === other.id) && x.hh.includes(p.household));
      if (wrong) { if (feud) feud.heat += k.wrongHeat; addMoodlet(c, other, 'hushed_badly', -0.08, 8); log(c, 'story', { story: 'sp_hush_bad', ...facts }); } else {
        other.hu = t + c.clock.ticks(k.hushMinutes);
        if (feud) { log(c, 'story', { story: 'sp_hush_ok', ...facts, thread: feud.id }); coolFeud(c, feud, -k.hushHeat); }
      }
      break;
    }
    default: done = false;
  }
  if (done) say(c, 'spell', { who: p.id, spell: id, ok: wrong ? 0 : 1, target: other.id });
  return done;
}

/** Someone with the keys of a person: only within reach, and only if it is really them. */
export function spellCommand(c, cmd, refuse) {
  const s = c.s, k = K(c), p = s.people[cmd.who];
  if (!p || !c.d.social.spells[cmd.spell]) return refuse('no such spell');
  if (!p.hold || p.hold.owner !== (cmd.owner ?? 'solo')) return refuse('not yours');
  if (!ready(c, p)) return say(c, 'spell.wait', { who: p.id, spell: cmd.spell });
  if (cmd.target !== undefined && cmd.target >= 0) {
    const q = s.people[cmd.target]; if (!q) return refuse('no such person');
    const at = q.hold ?? (q.at >= 0 ? c.places[q.at] : null);
    if (q !== p && cmd.near !== true && (!at || Math.hypot(at.x - p.hold.x, at.z - p.hold.z) > k.reachMeters * 8)) return refuse('too far');
  }
  if (!castSpell(c, p, cmd.spell, { target: cmd.target ?? -1, room: cmd.room ?? null })) refuse('nothing to do');
}

/** Direct: tell them to. They cast where they stand, on whoever the order names, once they are together. */
export function spellOrder(c, p, o) {
  if (!ready(c, p)) return false;
  return castSpell(c, p, o.spell, { target: o.person ?? -1 });
}

/** Who someone at home would like to shut up: a foe in the same place, or the opera in the shower. */
function noisy(c, p) {
  for (const id of c.foes.get(p.id) ?? []) if (c.s.people[id].at === p.at) return id;
  for (const id of c.s.households[p.household].members) { const q = c.s.people[id]; if (q !== p && q.at === p.at && q.act?.a === 'shower' && fxOf(c, q).noisy) return id; }
  return -1;
}

/** On the hour: a few people at home help themselves. Off a hash, so a house nobody is drawing tidies itself the same as one on screen. */
export function stepSpells(c) {
  const s = c.s, cl = c.clock, k = K(c);
  if (s.t % cl.ticks(60)) return;
  const hour = Math.floor(cl.minute(s.t) / 60), day = cl.day(s.t), clean = need(c, 'clean'), comfort = need(c, 'comfort');
  for (const h of s.households) {
    if (!h.members.length) continue;
    const salt = `${s.seed}/${day}/${hour}/${h.id}`;
    const who = s.people[h.members[Math.floor(h01(salt + 'w') * h.members.length)]], rate = k.castChance * (fxOf(c, who).magicAgain ?? 1);
    if (h01(salt) >= rate || who.at !== h.home || who.hold || who.trip || !ready(c, who) || !who.act || who.act.a === 'sleep' || who.call) continue;
    const n = peekNeeds(c, who), mate = partnerId(c, who.id);
    if (burntHome(c, who)) castSpell(c, who, 'mend');
    else if (n[clean] < k.needBelow) castSpell(c, who, 'tidy');
    else if (noisy(c, who) >= 0) castSpell(c, who, 'hush', { target: noisy(c, who) });
    else if (n[comfort] < k.needBelow) castSpell(c, who, 'warm', { target: mate >= 0 && s.people[mate].at === who.at ? mate : -1 });
  }
}
