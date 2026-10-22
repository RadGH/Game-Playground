// Holidays (round 6): the season table, and that seasonal content only appears in its season.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEASONS, seasonByDate, effectiveSeason, inSeason } from '../js/shared/seasons.js';
import { GAMES, eligible } from '../js/games/index.js';
import { createProfiles } from '../js/sim/profiles.js';

const D = (m, d) => new Date(2026, m - 1, d, 12);
test('Halloween is October 1-31 by the date; the host can force it or turn it off', () => {
  assert.equal(seasonByDate(D(10, 1)), 'halloween'); assert.equal(seasonByDate(D(10, 31)), 'halloween');
  assert.equal(seasonByDate(D(9, 30)), null); assert.equal(seasonByDate(D(11, 1)), null); assert.equal(seasonByDate(D(3, 3)), null);
  assert.equal(effectiveSeason('auto', D(10, 22)), 'halloween'); assert.equal(effectiveSeason('off', D(10, 22)), null);
  assert.equal(effectiveSeason('halloween', D(5, 5)), 'halloween'); assert.equal(effectiveSeason('auto', D(5, 5)), null);
  for (const s of SEASONS) assert.ok(s.id && s.name && s.from && s.to);
});
test('holiday minigames are only eligible in their season; every season id is real', () => {
  const ids = SEASONS.map(s => s.id);
  const holiday = Object.keys(GAMES).filter(id => GAMES[id].meta.season);
  for (const id of holiday) {
    assert.ok(ids.includes(GAMES[id].meta.season), id);
    assert.ok(!eligible(2, [], null).includes(id), `${id} out of season`);
    if (GAMES[id].meta.min <= 2 && GAMES[id].meta.max >= 2) assert.ok(eligible(2, [], GAMES[id].meta.season).includes(id), `${id} in season`);
  }
  assert.ok(eligible(2, [], null).length >= 40);
});
test('seasonal costumes and board events name a real season; costumes cannot be bought or worn out of season', () => {
  const ids = SEASONS.map(s => s.id);
  const cos = JSON.parse(readFileSync(new URL('../data/cosmetics.json', import.meta.url)));
  const ch = JSON.parse(readFileSync(new URL('../data/chance.json', import.meta.url)));
  for (const x of [...cos.items, ...ch.events, ...ch.bulletins]) if (x.season) assert.ok(ids.includes(x.season), x.id);
  assert.ok(cos.items.filter(c => c.season === 'halloween').length >= 18);
  let t = D(11, 5).getTime();
  const P = createProfiles({ cosmetics: cos, cleanLook: l => ({ ok: true, look: l }), randomToken: () => 'tok', now: () => t });
  const p = P.create(); const tok = p.token ?? 'tok';
  const free = cos.items.find(c => c.season && !c.price), paid = cos.items.find(c => c.season && c.price);
  assert.equal(P.equip(tok, free.id), false, 'November: not wearable');
  assert.equal(P.buy(tok, paid.id).ok, false, 'November: not for sale');
  t = D(10, 22).getTime();
  assert.equal(P.equip(tok, free.id), true, 'October: wearable');
  assert.ok(inSeason({}, null) && !inSeason({ season: 'halloween' }, null));
});
