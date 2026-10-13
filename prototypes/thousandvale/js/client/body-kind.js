// Which KIND of body a monster type is drawn with. Pure (no three), so a node test can ask it.
//
//   bodyKindFor(type, look)  ->  'dummy' | 'avatar' | 'creature'
//
// Report #61: a training dummy (monster type `training_dummy`, js/rules/index.js spawnDummy) had no row in
// data/monster-looks.json, so actors.js fell through to "a creature of that type", and an unknown creature type is a
// wolf — the dummies in the square were dogs. A type listed in PROP_BODIES is a built object (js/client/dummy-model.js),
// never an animal, whatever the looks file says.

/** Monster types that are an OBJECT, not a creature: type -> the body kind actors.js builds. */
export const PROP_BODIES = { training_dummy: 'dummy' };

/** `look` is the type's row in data/monster-looks.json (or nothing). */
export function bodyKindFor(type, look = null) {
  if (type && Object.hasOwn(PROP_BODIES, type)) return PROP_BODIES[type];
  return look && look.avatar ? 'avatar' : 'creature';
}

// ---- how a dummy rocks on its post (the model is js/client/dummy-model.js; the arithmetic is here so node can test it)

/** Spring that brings the rocking part upright again: pure, exported for tests. `s` = { ax, az, tw, vx, vz, vt }. */
export function settle(s, dt) {
  const K = 70, C = 4.2, MAX = 0.32;
  for (let left = Math.min(dt, 0.1); left > 1e-6; left -= 1 / 120) {
    const h = Math.min(1 / 120, left);
    for (const [p, v] of [['ax', 'vx'], ['az', 'vz'], ['tw', 'vt']]) {
      s[v] += (-K * s[p] - C * s[v]) * h; s[p] += s[v] * h;
      if (Math.abs(s[p]) > MAX) { s[p] = Math.sign(s[p]) * MAX; s[v] *= -0.3; }
    }
  }
  return s;
}
/** A blow from world direction (dx, dz) on a dummy facing `yaw`: pure, exported for tests. Tips the top AWAY from the hitter. */
export function knock(s, dx, dz, yaw = 0, amount = 1) {
  const d = Math.hypot(dx, dz) || 1, c = Math.cos(yaw), sn = Math.sin(yaw);
  const lx = (dx * c - dz * sn) / d, lz = (dx * sn + dz * c) / d;        // the push in the dummy's own axes
  const k = amount > 0 ? 2.6 : 0.8;
  s.vx += lz * k; s.vz -= lx * k; s.vt += (lx >= 0 ? 1 : -1) * k * 0.5;   // rotation about x tips toward +z; about z tips toward -x
  return s;
}
