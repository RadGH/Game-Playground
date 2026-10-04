import { test } from 'node:test';
import { runBar } from './parity-kit.mjs';
const SKIP = row => !!row.form || (row.shape === 'summon' && !row.summon?.temporary) || !!row.channel;
test('explore', async () => {
  const d = (await import('../../../farhold/data/classes.json', { with: { type: 'json' } })).default.classes.map(c => c.id);
  for (const c of (process.env.CLS ? process.env.CLS.split(',') : d)) {
    const r = await runBar({ classId: c, skip: SKIP });
    console.log(`# ${c.padEnd(14)} casts ${r.casts} dealt ${Math.round(r.dealt)} ${r.problems.join(' | ') || 'OK'}`);
  }
});
