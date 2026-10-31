// Sparse feelings (roast risk 16): each person keeps numbers only about the people they have dealt with, up to a cap.
// p.f[otherId] = one small whole number per feeling in data/people.json, -100..100.

import { log } from './log.js';
import { rand } from './rng.js';

export function feelingIndex(c, name) { return c.feelingIds.indexOf(name); }

function row(c, p, other) {
  let r = p.f[other];
  if (r) return r;
  r = p.f[other] = new Array(c.feelingIds.length).fill(0);
  const ids = Object.keys(p.f);
  if (ids.length > c.k.feelings.cap) {
    // Over the cap: forget whoever matters least, never the person being added or their own household.
    let drop = null, least = Infinity;
    for (const id of ids) {
      if (Number(id) === other || c.s.people[id].household === p.household) continue;
      let weight = 0;
      for (const v of p.f[id]) weight += Math.abs(v);
      if (weight < least) { least = weight; drop = id; }
    }
    if (drop !== null) delete p.f[drop];
  }
  return r;
}

export function nudge(c, p, other, name, amount) {
  const r = row(c, p, other), i = feelingIndex(c, name);
  const v = r[i] + amount;
  r[i] = v > 100 ? 100 : v < -100 ? -100 : v;
  return r[i];
}

/** Two people spent time together. Mostly they warm up; sometimes it goes wrong (traits make that likelier). */
export function meet(c, a, b, gain) {
  const k = c.k.feelings;
  const scale = person => person.traits.reduce((v, tr) => v * (c.traitById[tr].quarrelScale || 1), 1);
  nudge(c, a, b.id, 'known', gain); nudge(c, b, a.id, 'known', gain);
  if (rand(c.s) < k.quarrelChance * Math.max(scale(a), scale(b))) {
    nudge(c, a, b.id, 'grudge', k.quarrelLoss); nudge(c, b, a.id, 'grudge', k.quarrelLoss);
    nudge(c, a, b.id, 'like', -k.quarrelLoss); nudge(c, b, a.id, 'like', -k.quarrelLoss);
    return 'quarrel';
  }
  const before = a.f[b.id]?.[feelingIndex(c, 'like')] ?? 0;
  nudge(c, a, b.id, 'like', gain);
  nudge(c, b, a.id, 'like', gain);
  friendsCheck(c, a, b, before);
  return 'warm';
}

/** They just crossed the line into friends: worth telling once. */
export function friendsCheck(c, a, b, before) {
  const k = c.k.feelings, after = a.f[b.id]?.[feelingIndex(c, 'like')] ?? 0;
  if (before < k.friendsAt && after >= k.friendsAt && a.household !== b.household) log(c, 'friends', { a: a.id, b: b.id });
}
