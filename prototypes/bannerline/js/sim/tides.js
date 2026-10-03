// Tides (neutral waves every econ.clock.tide s into every field) and the Rising Tide end clock.

import { secToTicks, baseEnt } from './state.js';

const TIDE_SPEED = 3;
const TIDE_RANGE = 1.5;

export function risingStep(data, tick) {
  const C = data.econ.clock;
  const t = tick / 20;
  return t < C.risingTide ? 0 : 1 + Math.floor((t - C.risingTide) / C.risingEvery);
}

/** Leak multiplier now. */
export function leakMult(state, data) {
  if (!state.rising) return 1;
  const C = data.econ.clock;
  return C.risingLeakMult + (C.risingLeakStep || 0) * (state.rising - 1);
}

export function tideTick(ctx) {
  const { state, data, map } = ctx;
  const step = risingStep(data, state.tick);
  if (step !== state.rising) { state.rising = step; ctx.emit('rising', { step }); }
  const every = secToTicks(data.econ.clock.tide);
  if (state.tick === 0 || state.tick % every !== 0) return;
  state.tides++;
  const L = state.tides + state.rising * data.econ.clock.risingTideLevels;
  state.tideLevel = L;
  const T = data.econ.tide;
  const armours = data.damage.armours;
  for (const f of map.fields) {
    const gate = f.gates[(state.tides - 1) % f.gates.length];
    const group = state.nextGroup++;
    for (let b = 0; b < T.bodies; b++) {
      const hp = T.hpBase + T.hpPerLevel * L;
      const e = baseEnt(state, {
        kind: 'tide', type: 'tide', team: -1, owner: -1, field: f.id,
        x: gate.x + (b - (T.bodies - 1) / 2) * 1.4, z: gate.z, r: 0.5, level: L,
        hp, hpMax: hp, armour: armours[L % 4], dmgType: 'blade', group,
        _spd: TIDE_SPEED, _dps: T.dpsBase + T.dpsPerLevel * L, _range: TIDE_RANGE, _atkEvery: 20, _atkAt: state.tick + 10,
        _leak: T.leak / T.bodies, _bounty: (T.gold + T.goldPerLevel * L) / T.bodies, _xp: (T.xp + T.xpPerLevel * L) / T.bodies,
      });
      ctx.emit('spawn', { id: e.id, kind: 'tide', unit: 'tide', team: -1, field: f.id });
    }
    ctx.emit('tide', { level: L, field: f.id });
  }
}
