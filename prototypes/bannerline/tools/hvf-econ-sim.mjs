#!/usr/bin/env node
// Hunters vs Farmers economy model (docs/hvf-PLAN.md §8.2) — ADVISORY ONLY (owner: balance later).
//
//   node tools/hvf-econ-sim.mjs            every format
//   node tools/hvf-econ-sim.mjs 6v2 --log  one format, minute by minute
//
// A deliberately simple model on the real data files: each farmer spends every second on the
// producer with the best payback (each copy x copyMult), Feed once it pays back inside 4 minutes,
// then — once income passes `flipIncome` g/s — a Harvest Hall and scarecrows. Losses: each farmer
// loses `lossPerMin` of his animals' income a minute to hunting while the hunters are strong. Hunters
// gain a level every `levelEvery` s. Reports the minute the Turn crosses 0 (target 11-16 min).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = n => JSON.parse(readFileSync(join(ROOT, 'data', 'hvf', n), 'utf8'));
const rules = read('rules.json'), B = read('buildings.json'), A = read('animals.json'), U = read('units.json');
const MODEL = { flipIncome: 6, lossPerMin: 0.06, levelEvery: 110, hunterItemsPerMin: 60 };

function run(fmt, log) {
  const f = rules.formats[fmt], W = rules.turn;
  const farmers = [];
  for (let i = 0; i < f.farmers; i++) farmers.push({ gold: U.farmerStartGold, copies: {}, animalInc: 0, flat: 0, pct: 0, feed: 0, producers: 0, hall: false, army: 0 });
  let crossed = null;
  const out = [];
  for (let t = 1; t <= f.clock; t++) {
    const level = Math.min(U.hunter.maxLevel, 1 + Math.floor(t / MODEL.levelEvery));
    const items = MODEL.hunterItemsPerMin * t / 60;
    for (const p of farmers) {
      const inc = (p.animalInc * (1 + p.feed * B.upgrades.feed.animalIncomePct) + p.flat) * (1 + p.pct);
      p.gold += inc;
      p.inc = inc;
      if (t % 60 === 0 && t < f.clock * 0.6) p.animalInc *= 1 - MODEL.lossPerMin;
      // spend
      for (let guard = 0; guard < 8; guard++) {
        if (inc >= MODEL.flipIncome && !p.hall && p.producers >= B.kinds.hall.needsProducers) { if (p.gold >= B.kinds.hall.cost) { p.gold -= B.kinds.hall.cost; p.hall = true; continue; } break; }
        if (p.hall && p.gold >= U.army.scarecrow.cost && p.army < U.army.cap) { p.gold -= U.army.scarecrow.cost; p.army++; continue; }
        const fc = B.upgrades.feed.costs[p.feed];
        if (fc != null && p.animalInc * B.upgrades.feed.animalIncomePct * 240 > fc && p.gold >= fc) { p.gold -= fc; p.feed++; continue; }
        let best = null;
        for (const k of ['coop', 'pen', 'sty', 'barn', 'hive']) {
          const d = B.kinds[k];
          let c = d.cost; for (let i = 0; i < (p.copies[k] || 0); i++) c *= B.copyMult;
          const income = d.makes ? A.kinds[d.makes].income * d.cap : d.flat;
          if (!best || c / income < best.pay) best = { k, c, income, pay: c / income };
        }
        if (best && p.gold >= best.c && !(inc >= MODEL.flipIncome && p.hall === false && p.producers >= B.kinds.hall.needsProducers)) {
          p.gold -= best.c; p.copies[best.k] = (p.copies[best.k] || 0) + 1; p.producers++;
          if (B.kinds[best.k].makes) p.animalInc += best.income; else p.flat += best.income;
          continue;
        }
        break;
      }
    }
    const farm = farmers.reduce((s, p) => s + p.army * U.army.scarecrow.cost * W.armyWeight, 0);
    const hunt = f.hunters * (W.hunterBase * f.hunterMult + W.hunterPerLevel * (level - 1)) + items * W.itemWeight * f.hunters;
    const turn = (farm - hunt) / (farm + hunt);
    if (crossed == null && turn > 0) crossed = t;
    if (t % 60 === 0) out.push({ min: t / 60, income: Math.round(farmers.reduce((s, p) => s + p.inc, 0) * 10) / 10, army: farmers.reduce((s, p) => s + p.army, 0), level, turn: Math.round(turn * 100) / 100 });
  }
  if (log) console.table(out);
  return { format: fmt, turnCrossesMin: crossed == null ? null : Math.round(crossed / 6) / 10, clockMin: f.clock / 60, endIncome: out[out.length - 1].income, inTarget: crossed != null && crossed >= 660 && crossed <= 960 };
}

const args = process.argv.slice(2), only = args.find(a => /^\dv\d$/.test(a));
const rows = (only ? [only] : Object.keys(rules.formats)).map(f => run(f, args.includes('--log')));
console.table(rows);
console.log('Advisory: the Turn should cross 0 around minute 11-16 (owner: balance later). Model knobs:', JSON.stringify(MODEL));
