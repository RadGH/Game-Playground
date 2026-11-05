// Headless: grow a town for N in-game days and draw its roads + buildings to a PNG-ready PPM.
//   node prototypes/stoneward/tools/road-map.mjs <out.ppm> [days=3] [seed=7]
// Roads: dirt brown / gravel grey / stone light; buildings dark red; water blue. Prints road counts by class.
import { writeFileSync } from 'node:fs';
import { townSim, M } from '../tests/helpers.mjs';
const [out = 'roads.ppm', days = '3', seed = '7'] = process.argv.slice(2);
const { sim } = townSim({ seed: +seed });
sim.settings = { monsters: 'off', raids: 'off', disasters: 'off', rivals: 0 };
sim.state.town.gold = 5000;
const keep = sim.state.town.buildings.find(b => b.kind === 'keep'); keep.store.stone = 400; keep.store.log = 400;
const T = sim.state.town.towns[0];
const total = Math.round(+days * sim.dayTicks);
const t0 = Date.now();
for (let k = 0; k < total; k++) {
  sim.step();
  if (k % sim.dayTicks === 0) console.log(`day ${k / sim.dayTicks}: pop ${sim.state.town.people.length}, roads ${sim.state.town.roads.length}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const R = 260, size = R * 2;
const px = Buffer.alloc(size * size * 3);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const at = sim.cell(Math.round(T.x - R + x), Math.round(T.y - R + y)); let c = [40, 70, 35];
  if (at) {
    const { c: ch, i } = at, g = ch.ground[i], m = ch.mat[i];
    if (m && M.liquid[m]) c = [40, 70, 140];
    else if (m === M.id.bridge) c = [150, 110, 60];
    else if (g === M.id.road_stone) c = [210, 205, 190]; else if (g === M.id.road_gravel) c = [150, 150, 150]; else if (g === M.id.road_dirt) c = [140, 100, 55];
    if (m && M.built[m] && m !== M.id.bridge) c = [120, 30, 30];
    if (ch.part[i]) c = [170, 40, 40];
  }
  px.set(c, (y * size + x) * 3);
}
writeFileSync(out, Buffer.concat([Buffer.from(`P6 ${size} ${size} 255\n`), px]));
const by = {}; for (const r of sim.state.town.roads) by[r[5] || 'old'] = (by[r[5] || 'old'] || 0) + 1;
console.log('pop', sim.state.town.people.length, 'buildings', sim.state.town.buildings.length, 'roads by class', JSON.stringify(by), 'avenues', JSON.stringify((T.avenues || []).map(a => [a.len, a.dead ? 'dead' : ''])));
