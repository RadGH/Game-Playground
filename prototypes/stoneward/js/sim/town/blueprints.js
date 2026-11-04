// Building shapes → the cells they are made of. PURE.
// cells(kind, M, seed) returns [{ dx, dy, mat, tall, ground }], dx/dy from the footprint's north-west
// corner. Every building is real material cells (owner, 2026-11-03), so a roof can burn and a keep
// can crack. Heights make the 3/4 look: a house has a gable (taller along the middle row), a keep
// has crenels and corner towers.

export function cells(kind, M, seed = 1) {
  const out = [];
  const id = M.id;
  const { w, h } = kind;
  const T = kind.tall ?? 3;
  const r = n => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) % n; };
  switch (kind.shape) {
    case 'keep': {
      const wall = id[kind.wall] ?? id.keepstone;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const corner = (dx < 3 || dx >= w - 3) && (dy < 3 || dy >= h - 3);
        const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1;
        let t = T + (corner ? 4 : 0);
        if (edge && !corner && (dx + dy) % 2) t += 1;          // crenels along the top
        out.push({ dx, dy, mat: wall, tall: t, ground: id.cobble });
      }
      break;
    }
    case 'tent': {
      const m = id[kind.roof] ?? id.canvas;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const mid = dx === (w >> 1);
        out.push({ dx, dy, mat: m, tall: mid ? T : Math.max(1, T - 1), ground: id.dirt });
      }
      break;
    }
    case 'fort': {    // a palisade ring with a hut in the middle
      const wall = id[kind.wall] ?? id.wall_wood;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1;
        const gate = dy === h - 1 && Math.abs(dx - (w >> 1)) <= 0;
        const inner = dx >= 3 && dx <= w - 4 && dy >= 2 && dy <= h - 4;
        if (edge && !gate) out.push({ dx, dy, mat: wall, tall: T + ((dx + dy) % 2), ground: id.dirt });
        else if (inner) out.push({ dx, dy, mat: id.roof_plank, tall: 3 + (dy === 3 ? 1 : 0), ground: id.planks });
        else out.push({ dx, dy, mat: 0, tall: 0, ground: id.dirt });
      }
      break;
    }
    case 'mine': {    // a timber head-frame over a dark shaft, with a shed
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        if (dx < 2 && dy >= 1 && dy <= 2) out.push({ dx, dy, mat: id.crate, tall: dx === 0 && dy === 1 ? 5 : 1, ground: id.gravel });
        else if (dx >= 2) out.push({ dx, dy, mat: id[kind.roof] ?? id.roof_plank, tall: T + (dy === 1 || dy === 2 ? 1 : 0), ground: id.planks });
        else out.push({ dx, dy, mat: 0, tall: 0, ground: id.gravel });
      }
      break;
    }
    case 'farm': {    // a small farmhouse in the corner, the rest a field of crops in rows
      const m = id[kind.roof] ?? id.roof_thatch;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        if (dx < 4 && dy < 4) out.push({ dx, dy, mat: m, tall: T + (dy === 1 || dy === 2 ? 1 : 0), ground: id.planks });
        else if (dy % 2 === 0) out.push({ dx, dy, mat: id.crop, tall: 0, ground: id.farmland, field: true });
        else out.push({ dx, dy, mat: 0, tall: 0, ground: id.farmland, field: true });
      }
      break;
    }
    case 'pasture': { // a fenced paddock with a shed
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1;
        if (dx >= w - 4 && dy < 3) out.push({ dx, dy, mat: id[kind.roof] ?? id.roof_thatch, tall: T, ground: id.planks });
        else if (edge && !(dy === h - 1 && dx === (w >> 1))) out.push({ dx, dy, mat: id.fence, tall: 1, ground: id.grass });
        else out.push({ dx, dy, mat: 0, tall: 0, ground: id.meadow, field: true });
      }
      break;
    }
    case 'market': {  // rows of stalls with gaps to walk between
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const stall = dy % 3 === 0 && dx % 3 !== 2;
        out.push({ dx, dy, mat: stall ? id.stall : 0, tall: stall ? 2 : 0, ground: id.cobble });
      }
      break;
    }
    case 'garden': {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1;
        out.push({ dx, dy, mat: edge ? id.hedge : (dx + dy) % 2 ? id.flowers : 0, tall: edge ? 1 : 0, ground: edge ? id.grass : id.meadow });
      }
      break;
    }
    case 'fountain': {   // a stone rim around still water, a statue spouting in the middle of big ones
      const rim = id.basin ?? id.well, pool = id.pool ?? id.water;
      const cx = (w - 1) / 2, cy = (h - 1) / 2;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1;
        const mid = Math.abs(dx - cx) < 0.6 && Math.abs(dy - cy) < 0.6;
        const corner = (dx === 0 || dx === w - 1) && (dy === 0 || dy === h - 1) && w > 3;
        if (corner) out.push({ dx, dy, mat: 0, tall: 0, ground: id.cobble });
        else if (mid && w >= 5) out.push({ dx, dy, mat: id.statue, tall: T + 2, ground: id.cobble });
        else if (mid) out.push({ dx, dy, mat: pool, tall: 0, ground: id.cobble });          // a small basin: all water
        else out.push({ dx, dy, mat: edge ? rim : pool, tall: edge && dy < h - 1 ? 1 : 0, ground: id.cobble });   // the south lip is flat so the water behind it shows in the 3/4 view
      }
      break;
    }
    case 'statue': {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ dx, dy, mat: id.statue, tall: kind.tall ?? 4, ground: id.cobble });
      break;
    }
    case 'station': { // a railway station (M10): stone platforms along both long sides, a roofed hall between
      const roof = id[kind.roof] ?? id.roof_slate;
      const plat = id.platform ?? id.keepstone;
      const ridge = (h - 1) / 2;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        if (dy === 0 || dy === h - 1) { out.push({ dx, dy, mat: plat, tall: 1, ground: id.cobble }); continue; }
        // the hall: a gable along the middle, a little clock tower over the centre
        const up = Math.round(ridge - Math.abs(dy - ridge));
        const tower = dx === (w >> 1) && dy === Math.round(ridge);
        out.push({ dx, dy, mat: roof, tall: T + up + (tower ? 3 : 0), ground: id.planks });
      }
      break;
    }
    case 'tower': {   // a tall round-ish tower; magic ones carry a glowing crystal on top
      const wall = id[kind.wall] ?? id.wall_stone;
      const top = kind.top ? id[kind.top] : null;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const corner = (dx === 0 || dx === w - 1) && (dy === 0 || dy === h - 1);
        const mid = dx === (w >> 1) && dy === (h >> 1);
        if (corner && w > 3) continue;
        out.push({ dx, dy, mat: mid && top ? top : wall, tall: T + (mid ? 2 : (dx + dy) % 2), ground: id.cobble });
      }
      break;
    }
    case 'church': {  // a gabled nave running east-west with a tall square bell tower at its west end
      const roof = id[kind.roof] ?? id.roof_slate, wall = id[kind.wall] ?? id.keepstone;
      const tw = kind.towerW ?? 2, top = kind.tower ?? T + 6;
      const ty0 = (h - tw) >> 1;
      const ridge = (h - 1) / 2;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const inTower = dx < tw && dy >= ty0 && dy < ty0 + tw;
        if (inTower) {
          // the tower: a spire on its middle cell(s) when the kind has one, battlements on its corners
          const mid = (dx === (tw - 1) >> 1 || dx === tw >> 1) && (dy - ty0 === (tw - 1) >> 1 || dy - ty0 === tw >> 1);
          const corner = (dx === 0 || dx === tw - 1) && (dy === ty0 || dy === ty0 + tw - 1);
          out.push({ dx, dy, mat: wall, tall: Math.min(31, top + (mid ? kind.spire || 0 : 0) + (corner && tw > 2 ? 1 : 0)), ground: id.cobble });
        } else if (dx < tw) {
          out.push({ dx, dy, mat: 0, tall: 0, ground: id.cobble });       // the yard beside the tower
        } else {
          const up = Math.round((ridge - Math.abs(dy - ridge)) * 0.9);
          out.push({ dx, dy, mat: roof, tall: T + up, ground: id.planks });
        }
      }
      break;
    }
    case 'dock': {    // a plank jetty with a small shed at the landward end
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        if (dx < 2) out.push({ dx, dy, mat: id[kind.roof] ?? id.roof_plank, tall: T, ground: id.planks });
        else out.push({ dx, dy, mat: dy % 3 === 0 ? id.crate : 0, tall: dy % 3 === 0 ? 1 : 0, ground: id.planks });
      }
      break;
    }
    case 'well': {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ dx, dy, mat: id.well, tall: 1, ground: id.cobble });
      break;
    }
    default: { // 'house': a block with a gable roof running east-west
      const m = id[kind.roof] ?? id.roof_thatch;
      const ridge = (h - 1) / 2;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const up = Math.round((ridge - Math.abs(dy - ridge)) * 0.9);
        out.push({ dx, dy, mat: m, tall: T + up, ground: id.planks });
      }
      if (kind.crates) for (let k = 0; k < 3; k++) out.push({ dx: r(w), dy: h, mat: id.crate, tall: 1, ground: id.planks, outside: true });
      // a glowing chimney on workshops with a fire (smelter, smithy, bakery…)
      if (kind.chimney) { const c = out.find(p => p.dx === w - 2 && p.dy === 1); if (c) { c.mat = id.chimney; c.tall = T + 3; } }
    }
  }
  return out;
}

/** The cell people walk to, to use a building: just south of the middle of its front. */
export function door(b) { return { x: b.x + (b.w >> 1), y: b.y + b.h }; }
