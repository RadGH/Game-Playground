// A build's numbers: the sum of its parts plus the few rules that tie them together (load, energy, heat). Pure — no
// DOM, no three.js — so the game's sim and the hangar can call the same function the dress-up page shows.
//
//   buildStats(build, PARTS) → { weight, carry, ap, res, energy, heat, move, lock, arms, weapons, firepower, cost, problems }
//   validBuild(build, PARTS) → list of problems (empty = every slot holds a part that fits it)

export const WEAPON_SLOTS = [
  { key: 'armL', label: 'Left arm', mount: 'arm' },
  { key: 'armR', label: 'Right arm', mount: 'arm' },
  { key: 'shoulderL', label: 'Left shoulder', mount: 'shoulder' },
  { key: 'shoulderR', label: 'Right shoulder', mount: 'shoulder' },
];
export const FRAME_SLOTS = ['head', 'core', 'arms', 'legs', 'booster', 'generator', 'cooling', 'cpu'];
export const DAMAGE_TYPES = ['kinetic', 'energy', 'explosive', 'fire', 'electric'];

const sum = (list, k) => list.reduce((a, p) => a + (p?.[k] || 0), 0);
const r1 = v => Math.round(v * 10) / 10;

/** Damage per second a weapon puts out (salvo / pellets count every hit). */
export function weaponDps(w) {
  if (!w || !w.damage) return 0;
  const per = w.damage * (w.salvo || w.pellets || 1);
  // a magazine with a reload: average over a full cycle
  if (w.mag && w.reload) { const fireTime = w.mag / w.rate; return per * w.mag / (fireTime + w.reload); }
  return per * w.rate;
}

export function validBuild(build, PARTS) {
  const out = [];
  for (const s of FRAME_SLOTS) {
    const p = PARTS[build[s]];
    if (!p) out.push(`${s}: empty`); else if (p.slot !== s) out.push(`${s}: ${p.name} is a ${p.slot}`);
  }
  const W = build.weapons || {};
  for (const s of WEAPON_SLOTS) {
    const id = W[s.key]; if (!id) continue;
    const w = PARTS[id];
    if (!w || w.slot !== 'weapon') out.push(`${s.label}: not a weapon`);
    else if (w.mount !== s.mount) out.push(`${s.label}: ${w.name} mounts on the ${w.mount}`);
  }
  const two = ['armL', 'armR'].filter(k => PARTS[W[k]]?.hand === 'two');
  if (two.length && W[two[0] === 'armL' ? 'armR' : 'armL']) out.push('A two-handed weapon needs the other hand free');
  return out;
}

export function buildStats(build, PARTS) {
  const frame = Object.fromEntries(FRAME_SLOTS.map(s => [s, PARTS[build[s]] || null]));
  const W = build.weapons || {};
  const weapons = WEAPON_SLOTS.map(s => ({ ...s, part: PARTS[W[s.key]] || null })).filter(s => s.part);
  const all = [...Object.values(frame), ...weapons.map(w => w.part)].filter(Boolean);
  const legs = frame.legs, core = frame.core, gen = frame.generator, cool = frame.cooling, cpu = frame.cpu, arms = frame.arms, boost = frame.booster, head = frame.head;

  const weight = sum(all, 'weight');
  const upperWeight = weight - (legs?.weight || 0);
  const carry = legs?.carry || 0;
  const over = Math.max(0, upperWeight - carry);
  const load = carry ? upperWeight / carry : 1;
  // overload slows everything down; a light load is a little quicker
  const moveK = over > 0 ? Math.max(0.35, 1 - (over / carry) * 1.6) : 1 + Math.max(0, 0.8 - load) * 0.15;

  const armour = [head, core, arms, legs].filter(Boolean);
  const ap = sum(all, 'ap');
  const res = Object.fromEntries(DAMAGE_TYPES.map(t => {
    const tot = armour.reduce((a, p) => a + (p.ap || 0), 0) || 1;
    return [t, Math.round(armour.reduce((a, p) => a + (p.res?.[t] || 0) * (p.ap || 0), 0) / tot)];
  }));

  const draw = sum(all, 'energy');
  const output = Math.round((gen?.output || 0) * (core?.supply || 100) / 100);
  const passive = r1(sum(all, 'heat'));
  const boostK = (core?.boostEff || 100) / 100;
  const weightK = Math.max(0.55, Math.min(1.15, 1.2 - weight / 220));

  const armsLoad = { L: PARTS[W.armL]?.weight || 0, R: PARTS[W.armR]?.weight || 0 };
  const handLoad = arms?.handLoad || 0;

  const wlist = weapons.map(s => {
    const w = s.part, dps = weaponDps(w);
    return { slot: s.key, label: s.label, id: w.id, name: w.name, type: w.type, hand: w.hand, dps: Math.round(dps), heal: w.heal || 0, block: w.block || 0,
      range: w.range, lock: w.lock, ammo: w.ammo, heatPerShot: w.heatPerShot, shotEnergy: w.shotEnergy, heatPerSec: r1((w.heatPerShot || 0) * w.rate),
      tooHeavy: s.mount === 'arm' && w.weight > handLoad };
  });
  const firepower = wlist.reduce((a, w) => a + w.dps, 0);
  const fireHeat = r1(wlist.reduce((a, w) => a + w.heatPerSec, 0));

  const stats = {
    weight: r1(weight), upperWeight: r1(upperWeight), carry, over: r1(over), load: Math.round(load * 100),
    ap, res,
    energy: { draw, output, spare: output - draw, capacity: gen?.capacity || 0, recharge: gen?.recharge || 0, delay: gen?.delay || 0 },
    heat: { passive, sink: cool?.sink || 0, rate: cool?.rate || 0, fire: fireHeat, boost: boost?.boostHeat || 0, recovery: cool?.recovery || 0,
      // seconds of full fire + boosting before the sink fills (no limit when cooling keeps up)
      overheatIn: (() => { const net = passive + fireHeat + (boost?.boostHeat || 0) - (cool?.rate || 0); return net > 0 ? r1((cool?.sink || 0) / net) : null; })() },
    move: {
      type: legs?.type || null, speed: Math.round((legs?.speed || 0) * moveK), boost: Math.round((boost?.thrust || 0) * boostK * weightK * moveK),
      qbThrust: Math.round((boost?.qbThrust || 0) * boostK * weightK), qbCost: boost?.qbCost || 0, qbCooldown: boost?.qbCooldown || 0, boostCost: boost?.boostCost || 0,
      jump: Math.round((legs?.jump || 0) * moveK), turn: Math.round((legs?.turn || 0) * (over > 0 ? moveK : 1)), hoverTime: legs?.hoverTime || 0, moveK: Math.round(moveK * 100),
    },
    stability: sum([head, core, legs], 'stability'),
    lock: { firmware: cpu?.firmware || 0, speed: cpu?.lockSpeed || 0, count: cpu?.lockCount || 0, range: cpu?.lockRange || 0, scan: head?.scan || 0 },
    arms: { aim: arms?.aim || 0, recoil: arms?.recoil || 0, melee: arms?.melee || 0, handLoad, loadL: armsLoad.L, loadR: armsLoad.R },
    weapons: wlist, firepower, cost: sum(all, 'cost'),
  };
  const problems = [...validBuild(build, PARTS)];
  if (over > 0) problems.push(`Over the legs' carry limit by ${r1(over)} t`);
  if (draw > output) problems.push(`Energy draw ${draw} is over the generator's ${output}`);
  for (const w of wlist) if (w.tooHeavy) problems.push(`${w.name} is too heavy for these arms`);
  stats.problems = problems;
  return stats;
}

/** A random build that fits: random legs first, then parts that keep it under the carry limit and energy output. */
export function randomBuild(PARTS, rnd = Math.random, { maker = null } = {}) {
  const list = Object.values(PARTS);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const of = (slot, extra = () => true) => {
    const all = list.filter(p => p.slot === slot && extra(p));
    const mine = maker ? all.filter(p => p.maker === maker) : all;
    return mine.length ? mine : all;
  };
  let best = null;
  for (let tries = 0; tries < 40; tries++) {
    const b = { weapons: {} };
    for (const s of FRAME_SLOTS) b[s] = pick(of(s)).id;
    const armW = of('weapon', p => p.mount === 'arm'), shW = of('weapon', p => p.mount === 'shoulder');
    b.weapons.armR = pick(armW).id;
    b.weapons.armL = PARTS[b.weapons.armR].hand === 'two' ? null : pick(armW.filter(p => p.hand !== 'two')).id;
    b.weapons.shoulderL = rnd() < 0.85 ? pick(shW).id : null;
    b.weapons.shoulderR = rnd() < 0.85 ? pick(shW).id : null;
    const st = buildStats(b, PARTS);
    const score = st.problems.length * 100 + st.over;
    if (!best || score < best.score) best = { b, score };
    if (!st.problems.length) break;
  }
  return best.b;
}
