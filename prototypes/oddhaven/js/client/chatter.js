// Conversations you can see. The sim says two people are chatting; this gives them words: a line every few seconds, turn about, over their heads, and sound for the one nearest the middle of
// the screen. Off-screen pairs produce nothing at all. A new pair asks the sim what they have to talk about (the fire last week, the feud), once.
const BEAT = 3.1, MAX_PAIRS = 2;

import { createAllowance } from './talk.js';

export function createChatter({ town, people, talk, bubbles, voice, voiceOn, profileFor, delivery, words = () => null, staged = () => false, day = () => 0 }) {
  const allowance = createAllowance(day);
  const pairs = new Map();
  const stats = { lines: 0, spoken: 0, quiet: 0 };
  const ctxFor = (c, id) => {
    const row = town.mirror.people.get(id), r = town.roster, place = row?.at >= 0 ? r.places[row.at] : null, me = r.people[id];
    return { facts: c.facts?.[id] ?? null, heard: (c.heard[id] ??= new Set()), words: words(), mood: row?.mood, needs: c.needs?.[id], place, minute: town.mirror.minute, working: row?.a === 'work', home: row?.at === me.home };
  };
  const self = {
    stats, pairs,
    /** A one-off bubble: someone reacts to an order, a tow, a bad day. */
    bark(id, intent) {
      const p = town.roster?.people[id]; if (!p) return null;
      if (town.mirror.people.get(id)?.mw & 16) return null;      // hushed
      const out = talk().bark({ ...p, id }, intent);
      if (out) self.show(id, out, true);
      return out;
    },
    show(id, line, loud) {
      const person = town.roster.people[id];
      bubbles.show(id, line.text);
      stats.lines++;
      if (loud && voiceOn()) {
        const profile = profileFor({ ...person, id }), d = delivery(line.text, { household: people.household.has(id), profile });
        voice.speak(profile, d.text, { engine: d.engine, priority: d.priority, speaker: id });
        stats.spoken++;
      }
    },
    update(dt, zoom, speed) {
      if (!talk()?.ready || !town.roster) return;
      if (speed <= 0) return;
      const shown = people.shown, seen = new Set();
      for (const q of shown) {
        const p = town.mirror.people.get(q.id);
        if (!p || p.a !== 'chat' || p.w == null || p.w < 0 || q.hidden || !town.mirror.people.has(p.w) || staged(p.i)) continue;
        const key = `${Math.min(p.i, p.w)}:${Math.max(p.i, p.w)}`;
        seen.add(key);
        if (!pairs.has(key) && pairs.size < MAX_PAIRS) {
          const c = { a: Math.min(p.i, p.w), b: Math.max(p.i, p.w), i: 0, wait: 0.4, facts: {}, heard: {} };
          pairs.set(key, c);
          town.facts?.(c.a, c.b).then(f => { c.facts[c.a] = f; }); town.facts?.(c.b, c.a).then(f => { c.facts[c.b] = f; });
        }
      }
      for (const [key, c] of pairs) {
        if (!seen.has(key)) { pairs.delete(key); continue; }
        c.wait -= dt;
        if (c.wait > 0 || zoom > 150) continue;
        c.wait = BEAT;
        const [from, to] = c.i % 2 === 0 ? [c.a, c.b] : [c.b, c.a];
        const rA = town.roster.people[from], rB = town.roster.people[to], row = town.mirror.people.get(from);
        const i = c.i++;
        if (row?.mw & 16) { bubbles.show(from, '…'); continue; }     // hushed: they mouth it
        if (!allowance.take()) continue;
        const line = talk().beat({ ...rA, id: from }, { ...rB, id: to }, i, row?.op ?? 0, ctxFor(c, from));
        if (line) self.show(from, line, zoom < 80); else stats.quiet++;
      }
    },
  };
  return self;
}
