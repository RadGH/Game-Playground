// Stream G — FIRST-HOUR BOT v1 (PLAN §15 M1.5): two real-socket bots play the opening of the game on a fresh
// server — arrive in Torborhold, form a party, walk out of town, fight and loot on the way to the dungeon,
// enter the dungeon together (same instance), fight inside. Driver: tools/first-hour-bot.mjs.
//   node --test prototypes/thousandvale/tests/load/first-hour.test.js        (~2 min)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, serverExists } from './server-harness.mjs';

test('first-hour bot: town -> party -> wilds -> fight + loot -> dungeon together -> fight inside', { skip: !serverExists() && 'server/main.mjs not built yet', timeout: 420000 }, async () => {
  const { firstHour } = await import('../../tools/first-hour-bot.mjs');
  const srv = await startServer({ db: 'memory' });
  try {
    const r = await firstHour({ url: srv.url, log: m => console.log('# ' + m) });
    console.log('# ' + JSON.stringify({ seconds: r.seconds, bots: r.bots, templatesMet: r.templatesMet }));
    assert.ok(r.ok, `failed at "${r.failed?.step}": ${r.failed?.why}\n${srv.log().split('\n').slice(-15).join('\n')}`);
    assert.ok(r.bots.every(b => b.rooms.startsWith('town > wilds') && b.rooms.endsWith('instance')), 'each bot went town -> wilds -> instance');
    assert.ok(r.templatesMet.monsterTypes.length >= 3, 'met at least 3 kinds of monster: ' + r.templatesMet.monsterTypes.join(', '));
  } finally {
    await srv.kill('SIGTERM');
  }
});
