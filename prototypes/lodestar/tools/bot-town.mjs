// Bot v1's town part (M7): keeps the people fed, watered, housed and lit so the economy has hands. It only sends the
// console's own commands (build), through the bot's own placement search (`spot`, which asks the sim's canPlace like
// the BUILD ghost does).
//
//   well → farm (one per ~45 people) → houses whenever the jobs outnumber the people or the beds run short →
//   a lamp post by any home that is dark at night → a Commons once the Town charter arrives.

export function createTownBot({ sim, spot, tryBuild, mine, hq }) {
  const D = sim.data;
  const near = (type, cx, cy, rMin, rMax, inRing = false) => () => spot(type, cx, cy, { rMin, rMax, inRing });

  function step(hud) {
    const h = hq(); if (!h) return;
    const t = hud.town; if (!t) return;
    const stock = hud.stock;
    const sitesOf = (type) => mine(type).filter((b) => b.built < 1).length;
    const cx = h.fp.cx, cy = h.fp.cy;
    // water: one well per 90 people
    if (mine('well').length < 1 + Math.floor(t.pop / 90) && !sitesOf('well') && (stock.stone || 0) >= 6) tryBuild('well' + mine('well').length, 'well', near('well', cx, cy, 30, 70, true), 'water');
    // food: one farm per 45 people (and one more while the stores run low)
    const farms = mine('farm').length;
    const wantFarms = 1 + Math.floor(t.pop / 45) + (t.foodDays !== null && t.foodDays < 0.8 && farms < 4 ? 1 : 0);
    if (farms < wantFarms && !sitesOf('farm')) tryBuild('farm' + farms, 'farm', near('farm', cx, cy, 50, 160), 'food');
    // houses: hands for every job, and a few spare beds so settlers keep coming
    const spare = t.beds - t.pop - t.walking;
    const short = t.jobs - (t.pop - t.drafted);
    // (spare beds only once timber is plentiful: early on every plank of timber goes to the industry)
    if ((short > 0 || (spare < 3 && (stock.timber || 0) >= 80)) && sitesOf('house') < 2 && (stock.timber || 0) >= 14) {
      const n = mine('house').length;
      tryBuild('house' + n, 'house', near('house', cx, cy, 34, 64 + 8 * Math.floor(n / 6)), 'beds');
    }
    // a lamp by any home that is in the dark
    if (t.lamps.light > 0 && !sitesOf('lamp_post')) {
      const dark = (sim.town?.homes || []).find((x) => x.residents && !x.ok.light);
      if (dark) tryBuild('lamp' + dark.id, 'lamp_post', near('lamp_post', dark.x, dark.y, 4, 14), 'street light');
    }
    // a Commons in the middle of the houses
    if (sim.unlocked.has('commons') && !mine('commons').length) {
      const hs = mine('house');
      const mx = hs.length ? hs.reduce((a, b) => a + b.fp.cx, 0) / hs.length : cx, my = hs.length ? hs.reduce((a, b) => a + b.fp.cy, 0) / hs.length : cy;
      tryBuild('commons', 'commons', near('commons', mx, my, 0, 60), 'morale');
    }
    void D;
  }
  return { step };
}
