// The rival army: a private military company's machines for Overdrive Frame (owner brief: "a rival company's army,
// tanks, artillery, gunships"). Sleek grey or olive hulls with one faction colour stripe that also glows at night, so
// a column reads as "theirs" in the dark. Each kind has one job and its own outline:
//   Trooper squad      — 3–4 powered-armour soldiers moving as one sprite; rifles
//   Light tank         — low wedge on tracks; the turret turns on its own (userData.face, layers 'hull' / 'turret')
//   Rocket truck       — six wheels; raises a launcher box on outriggers and ripples rockets off it
//   APC                — eight wheels; drops its rear ramp to let troopers out
//   Gunship            — VTOL with two ducted fans, chin gun and rocket pods; hovers at `alt` above its shadow
//   Attack drone       — a small quad-rotor with a gun pod, flies in swarms
//   AA emplacement     — a fortified pad with a turning missile launcher and a spinning radar
//   Shield bearer      — a heavy walker behind a tall shield with a glowing rim; braces it into the street
//   Jammer truck       — raises a mast with a spinning dish; jams the mech's radar (used sparingly)
//   Sniper walker      — a long-legged walker carrying a rail gun; a laser sight glows while it aims
//   Flamer, Bulwark, Field medic drone — round 5 roles, at the end of this file
//   Juggernaut         — the boss: a siege walker on four legs, main cannon, two missile racks, a shield generator
// Enemy mechs come from mechkit/, not here. Scale (ARCH.md): 1 unit = 16 m; a mech is 0.75 tall; a trooper 0.16.
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import {
  put, geo, cbox, seg, ball, spike, disc, wheel, ringFlat, profile, group, marker, V, clamp01, ease, lerp, lerpV, TAU, bump, ik, step,
  frame, torsoGroup, C, dim, lit, neonMat, shade, SCORCH, SOOT, FIRE, FIRE_HOT, throws, flight, chunk, fireball, flames, poseable, aimLocal, jitter, partKey,
} from './enemy-bits.js';

// ---------- paint + faction stripe ----------
const PAINTS = [['Grey', '#80878f'], ['Olive', '#6c704e'], ['Graphite', '#4a4f57']];
const STRIPES = [['Orange', '#ff7a1c'], ['Red', '#ff3346'], ['Cyan', '#2ee6ff'], ['Yellow', '#ffd02e']];
const paintParam = { key: 'paint', label: 'Paint', min: 0, max: PAINTS.length, step: 1, def: 0, names: ['From seed', ...PAINTS.map(p => p[0])] };
const stripeParam = { key: 'stripe', label: 'Stripe', min: 0, max: STRIPES.length, step: 1, def: 0, names: ['From seed', ...STRIPES.map(p => p[0])] };
const HEAD = '#eef6ff', TAIL = '#ff2a3a', FLASH = '#ffe9a8', NAV_R = '#ff3030', NAV_G = '#3cff6a';
function looks(p, extra = {}) {
  const paint = p.paint ? PAINTS[p.paint - 1][1] : PAINTS[p.seed % PAINTS.length][1];
  const stripe = p.stripe ? STRIPES[p.stripe - 1][1] : STRIPES[(p.seed * 3 + 1) % STRIPES.length][1];
  const R = p.R.fork(5);
  return {
    hull: C(paint, 0.45, 0.42), hullLight: C(shade(paint, 0.18), 0.45, 0.4), hullDark: C(shade(paint, -0.32), 0.45, 0.45),
    metal: C('#33383f', 0.6, 0.38), rubber: C('#1d2025', 0, 0.9), trim: C('#555c64', 0.5, 0.4), glass: C('#1d2a36', 0.7, 0.15),
    stripeColor: stripe, stripe: neonMat(stripe, 0.18), R, scale: jitter(p) * (extra.scale || 1),
    bits: throws(R, 12, { spread: 0.45, up: 0.55, size: [0.025, 0.05] }), ...extra,
  };
}
/** Scorched while it burns: the hull material once dead. */
const burnt = (L, dead, m) => dead ? SCORCH : m;
/** A muzzle flash: a hot core and a star of short spikes pointing along `dir`. */
function flash(parent, at, dir = [1, 0, 0], s = 0.03) {
  const d = V(...dir).normalize();
  ball(parent, s * 0.55, neonMat(FLASH, 1), ...at, 1, 1, 1, 10);
  spike(parent, at, [at[0] + d.x * s * 2.2, at[1] + d.y * s * 2.2, at[2] + d.z * s * 2.2], s * 0.45, neonMat(FLASH, 1), 6);
  for (const k of [-1, 1]) spike(parent, at, [at[0] + d.x * s + -d.z * s * k, at[1] + d.y * s, at[2] + d.z * s + d.x * s * k], s * 0.25, neonMat(FIRE, 1), 5);
}
/** A rocket in flight: body, glowing plume behind. */
function rocket(parent, at, dir, len = 0.06, r = 0.008, m) {
  const d = V(...dir).normalize(), back = [at[0] - d.x * len, at[1] - d.y * len, at[2] - d.z * len];
  seg(parent, back, at, r, r * 0.4, m, 6);
  spike(parent, back, [back[0] - d.x * len * 1.2, back[1] - d.y * len * 1.2, back[2] - d.z * len * 1.2], r * 1.3, neonMat(FIRE, 1), 6);
  ball(parent, r * 1.5, neonMat(FLASH, 1), ...back, 1, 1, 1, 8);
}
/** A drive cycle bob. */
const bob = (t, a = 0.003, n = 2) => a * Math.sin(t * TAU * n);

// =====================================================================================================================
// Trooper squad — 3 or 4 soldiers in powered armour, 0.16 tall, in a loose wedge.
// =====================================================================================================================
const A_TROOP = { walk: { label: 'Walk', frames: 8, fps: 10 }, fire: { label: 'Fire', frames: 6, fps: 12 }, die: { label: 'Die', frames: 10, fps: 12, once: true } };
const SLOTS = [[0.07, 0.0], [-0.03, 0.09], [-0.03, -0.09], [-0.13, 0.0]];
function troopLook(p) {
  const L = looks(p);
  const fling = throws(L.R, 4, { spread: 0.35, up: 0.5, size: [0.02, 0.03] });
  return { ...L, n: p.count, fling, plate: L.hullLight };
}
/** One soldier at (x, z), gait phase ph. `out` = 0..1 of the die flight. Visor and power pack glow. */
function soldier(root, L, x, z, ph, anim, t, i, die = null) {
  const S = group(root, 'trooper', x, 0, z);
  const on = !die || die.k < 0.35;
  let hipY = 0.07, lean = 0.05, stride = 0.05, aim = 0, recoil = 0, legPh = ph;
  if (anim === 'walk') { legPh = t + ph; hipY += 0.004 * Math.abs(Math.cos((t + ph) * TAU)); }
  else if (anim === 'fire') { aim = 1; stride = 0; lean = 0.02; const c = ((t + i * 0.37) % 1); recoil = c < 0.18 ? 1 - c / 0.18 : 0; }
  else if (anim === 'die') { stride = 0; aim = 0; }
  if (die) {
    const { p, landed, k, land } = flight([0, hipY, 0], die.piece.v, die.k * 0.9, 0.02);
    const u = landed ? 1 : k / Math.max(1e-3, land);
    S.position.set(x + p[0], Math.max(0.014, p[1] - hipY * (1 - u)), z + p[2]);
    S.rotation.set(die.piece.spin[0] * u * 0.3, 0, -(Math.PI / 2 + TAU) * u);
  }
  const f = frame(-0.004 * recoil, hipY, 0, -lean, 0, 0);
  const T = torsoGroup(S, f);
  // torso: armoured chest, a striped collar, a power pack on the back, shoulder pads
  cbox(T, 0.032, 0.02, 0.042, L.hullDark, 0, 0.004, 0);
  cbox(T, 0.036, 0.046, 0.05, L.hull, 0.0, 0.036, 0);
  cbox(T, 0.008, 0.032, 0.042, L.plate, 0.019, 0.04, 0);
  cbox(T, 0.03, 0.006, 0.052, L.stripe, 0.0, 0.06, 0);
  cbox(T, 0.022, 0.04, 0.04, L.metal, -0.028, 0.04, 0);
  cbox(T, 0.004, 0.022, 0.018, lit(L.stripeColor, on, 0.5), -0.04, 0.042, 0);
  for (const s of [1, -1]) ball(T, 0.015, L.hull, 0.0, 0.058, s * 0.031, 1.1, 0.8, 1, 10);
  // head: helmet with a glowing visor band
  ball(T, 0.016, L.hullLight, 0.003, 0.081, 0, 1.1, 1, 0.95, 12);
  cbox(T, 0.006, 0.007, 0.026, lit(L.stripeColor, on, 0.7), 0.017, 0.082, 0);
  // rifle: low-ready on the walk (diagonal across the chest), shouldered when firing
  const back = aim ? [-0.005 - 0.006 * recoil, 0.052, -0.016] : [-0.006, 0.026, -0.018];
  const muz = aim ? [0.085 - 0.006 * recoil, 0.054, -0.016] : [0.06, 0.004, -0.008];
  seg(T, back, muz, 0.006, 0.004, L.metal, 6);
  cbox(T, 0.016, 0.012, 0.008, L.metal, ...lerpV(back, muz, 0.35));
  marker(T, 'muzzle:' + i, ...muz);
  if (recoil > 0.4 && anim === 'fire') flash(T, muz, [1, 0, 0], 0.016);
  // arms reach the rifle
  for (const s of [1, -1]) {
    const sh = [0.0, 0.054, s * 0.03];
    const hand = s < 0 ? lerpV(back, muz, 0.3) : lerpV(back, muz, 0.62);
    const [el, h] = ik(sh, [hand[0], hand[1], hand[2] + (s > 0 ? 0.008 : 0)], 0.03, 0.03, [-0.4, -1, s * 0.6]);
    seg(T, sh, el, 0.009, 0.008, L.hull, 6); seg(T, el, h, 0.008, 0.007, L.hullDark, 6);
  }
  // legs: armoured thighs, shins, boots
  for (const s of [1, -1]) {
    const hip = f.tp([0, -0.004, s * 0.012]);
    const st = step(legPh + (s > 0 ? 0 : 0.5), 0.6);
    let foot = [st.u * stride + (aim ? s * 0.012 : 0), 0.016 * st.lift + 0.006, s * (aim ? 0.02 : 0.015)];
    if (die && die.k > 0) foot = f.tp([0.05 * (s > 0 ? 1 : 0.4), -0.06, s * 0.03]);
    const [kn, ft] = ik(hip, foot, 0.036, 0.036, [1, 0, 0]);
    seg(S, hip, kn, 0.011, 0.009, L.hull, 6); seg(S, kn, ft, 0.009, 0.008, L.hullDark, 6);
    cbox(S, 0.022, 0.01, 0.014, L.metal, ft[0] + 0.004, ft[1], ft[2]);
  }
}
function drawTroopers(root, L, anim, t) {
  const n = L.n;
  for (let i = 0; i < n; i++) {
    const [x, z] = SLOTS[i];
    const die = anim === 'die' ? { k: clamp01((t - i * 0.06) / 0.85), piece: L.fling[i] } : null;
    soldier(root, L, x, z, i * 0.27, anim, t, i, die);
  }
  if (anim === 'die') fireball(root, -0.02, 0.0, 0, 0.08, t / 0.55);   // one blast in the middle of the squad
}

// =====================================================================================================================
// Light tank — 0.42 long, 0.15 tall. Hull and turret are separate layers; the turret turns with userData.face(aim).
// =====================================================================================================================
const A_TANK = { drive: { label: 'Drive', frames: 6, fps: 10 }, fire: { label: 'Fire', frames: 8, fps: 12 }, die: { label: 'Die', frames: 12, fps: 10, once: true } };
function tankLook(p) { return looks(p, { turretFly: { v: [-0.18, 0.9, (p.seed % 2 ? 1 : -1) * 0.22] }, flameSpots: [[-0.12, 0.09, 0.03, 0.016], [0.02, 0.09, -0.04, 0.02], [0.1, 0.07, 0.05, 0.012]] }); }
function tracks(H, L, dead, t, len = 0.42, z = 0.105, w = 0.045, r = 0.03, wheels = 5) {
  for (const s of [1, -1]) {
    const Z = s * z;
    // the belt: top and bottom runs + rounded ends, links that crawl with the drive phase
    cbox(H, len - 2 * r, 0.006, w, L.rubber, 0, 0.003, Z);
    cbox(H, len - 2 * r, 0.006, w, L.rubber, 0, 2 * r - 0.003, Z);
    for (const e of [1, -1]) { const d = disc(H, r, w, L.rubber, e * (len / 2 - r), r, Z, 12); d.rotation.x = Math.PI / 2; }
    const links = 12, gap = (len - 2 * r) / links;
    for (let i = 0; i < links; i++) {
      const u = ((i + t * 2) % links) * gap - (len - 2 * r) / 2;
      cbox(H, 0.006, 0.004, w + 0.002, L.metal, u, 2 * r + 0.001, Z);
      cbox(H, 0.006, 0.004, w + 0.002, L.metal, -u, -0.0005 + 0.002, Z);
    }
    for (let i = 0; i < wheels; i++) wheel(H, r * 0.78, w * 0.7, dead ? SOOT : L.trim, L.metal, -len / 2 + r + i * (len - 2 * r) / (wheels - 1), r, Z + s * 0.004, t * TAU * 2);
  }
}
function drawTank(root, L, anim, t, st) {
  const dead = anim === 'die' && t > 0.12;
  let rock = 0, recoil = 0, flashOn = false, drive = 0, turretK = -1;
  if (anim === 'drive') drive = t;
  else if (anim === 'fire') { recoil = t < 0.15 ? ease(t / 0.15) : 1 - ease((t - 0.15) / 0.6); rock = -0.06 * bump(t, 0.05, 0.6); flashOn = t < 0.25; }
  else if (anim === 'die') turretK = clamp01((t - 0.08) / 0.9);
  const Hl = group(root, 'layer:hull');
  const H = group(Hl, '', 0, anim === 'drive' ? bob(t) : 0, 0); H.rotation.z = rock;
  tracks(H, L, dead, drive);
  // hull: a low wedge with a sloped glacis, side skirts carrying the stripe, engine deck at the back
  profile(H, 'tank-hull', [[-0.21, 0.035], [0.16, 0.035], [0.215, 0.055], [0.17, 0.088], [-0.17, 0.095], [-0.215, 0.075]], 0.19, burnt(L, dead, L.hull));
  for (const s of [1, -1]) {
    cbox(H, 0.36, 0.028, 0.008, burnt(L, dead, L.hullLight), -0.01, 0.075, s * 0.13);
    cbox(H, 0.3, 0.007, 0.0025, dead ? SOOT : L.stripe, -0.01, 0.07, s * 0.1345);
    cbox(H, 0.36, 0.006, 0.05, burnt(L, dead, L.hullDark), -0.01, 0.091, s * 0.11);
  }
  for (let i = 0; i < 4; i++) cbox(H, 0.012, 0.006, 0.12, L.metal, -0.19 + i * 0.022, 0.097, 0);   // engine grille
  for (const s of [1, -1]) { cbox(H, 0.005, 0.01, 0.022, lit(HEAD, !dead, 0.8), 0.205, 0.06, s * 0.065); cbox(H, 0.004, 0.008, 0.02, lit(TAIL, !dead, 0.6), -0.214, 0.075, s * 0.07); }
  // turret (own layer): angular, long gun with a muzzle brake, a sensor eye in the stripe colour
  const Tl = group(root, 'layer:turret');
  const Tu = group(Tl, '', -0.02, 0.095 + (anim === 'drive' ? bob(t) : 0), 0);
  if (turretK >= 0) {
    const { p, k, land } = flight([-0.02, 0.095, 0], L.turretFly.v, turretK, 0.03);
    const u = Math.min(1, k / Math.max(1e-3, land));      // tumbles in the air, lands tipped on its side
    Tu.position.set(...p); Tu.rotation.set(0.5 * u, u * 2.5, Math.PI * 2 * u + 0.35 * u);
  } else Tu.rotation.y = aimLocal(st);
  profile(Tu, 'tank-turret', [[-0.11, 0], [0.075, 0], [0.105, 0.022], [0.07, 0.048], [-0.085, 0.052], [-0.115, 0.03]], 0.13, burnt(L, dead, L.hullLight));
  cbox(Tu, 0.1, 0.006, 0.0025, dead ? SOOT : L.stripe, -0.02, 0.04, 0.0655); cbox(Tu, 0.1, 0.006, 0.0025, dead ? SOOT : L.stripe, -0.02, 0.04, -0.0655);
  const gx = 0.1 - 0.035 * recoil;
  seg(Tu, [gx - 0.02, 0.026, 0], [gx + 0.2, 0.026, 0], 0.011, 0.009, L.metal, 10);
  disc(Tu, 0.014, 0.026, L.metal, gx + 0.19, 0.026, 0, 10).rotation.z = Math.PI / 2;
  marker(Tu, 'muzzle', gx + 0.205, 0.026, 0);
  if (flashOn) flash(Tu, [gx + 0.21, 0.026, 0], [1, 0, 0], 0.04);
  cbox(Tu, 0.03, 0.022, 0.03, L.metal, -0.03, 0.06, 0.035);
  cbox(Tu, 0.006, 0.012, 0.02, lit(L.stripeColor, !dead, 0.7), -0.013, 0.063, 0.035);
  seg(Tu, [-0.08, 0.05, -0.04], [-0.1, 0.13, -0.04], 0.002, 0.001, L.metal, 4);
  // death: a fireball, the turret blown off, track and hull bits flung, then flames
  if (anim === 'die') {
    fireball(root, 0, 0.06, 0, 0.13, t / 0.6);
    for (let i = 0; i < 8; i++) chunk(root, [0, 0.08, 0], L.bits[i], clamp01(t / 0.8), i % 2 ? SCORCH : L.metal);
    if (t > 0.35) flames(root, L.flameSpots, t);
  }
}

// =====================================================================================================================
// Rocket artillery truck — 0.6 long. Raises its launcher box (2 rows × 4 tubes) onto outriggers, ripple-fires.
// =====================================================================================================================
const A_RTRUCK = { drive: { label: 'Drive', frames: 6, fps: 10 }, deploy: { label: 'Deploy', frames: 10, fps: 10, once: true }, fire: { label: 'Fire', frames: 12, fps: 12 }, die: { label: 'Die', frames: 12, fps: 10, once: true } };
function rtruckLook(p) { return looks(p, { podFly: throws(p.R.fork(11), 1, { spread: 0.25, up: 0.7 })[0], cook: throws(p.R.fork(12), 5, { spread: 0.4, up: 0.9, size: [0.03, 0.04] }), flameSpots: [[0.21, 0.1, 0, 0.018], [-0.05, 0.08, 0.04, 0.02], [-0.18, 0.08, -0.03, 0.014]] }); }
function cab(H, L, dead, x, wheelR, w = 0.15, h = 0.115, name = 'cab') {
  profile(H, name, [[-0.07, wheelR], [0.06, wheelR], [0.075, wheelR + 0.035], [0.055, h], [-0.07, h]], w, burnt(L, dead, L.hull));
  const ws = cbox(H, 0.006, 0.04, w - 0.02, L.glass, 0.068, h - 0.02, 0); ws.rotation.z = 0.35; ws.position.x = x + 0.066;
  for (const s of [1, -1]) {
    cbox(H, 0.04, 0.026, 0.004, L.glass, x - 0.005, h - 0.02, s * (w / 2 + 0.001));
    cbox(H, 0.005, 0.012, 0.025, lit(HEAD, !dead, 0.8), x + 0.077, wheelR + 0.02, s * (w / 2 - 0.02));
    cbox(H, 0.012, 0.008, 0.012, lit(L.stripeColor, !dead, 0.6), x - 0.03, h + 0.004, s * (w / 2 - 0.015));
  }
  cbox(H, 0.1, 0.008, 0.003, dead ? SOOT : L.stripe, x - 0.01, wheelR + 0.03, w / 2 + 0.001);
  cbox(H, 0.1, 0.008, 0.003, dead ? SOOT : L.stripe, x - 0.01, wheelR + 0.03, -w / 2 - 0.001);
}
function drawRocketTruck(root, L, anim, t, st) {
  const dead = anim === 'die' && t > 0.12;
  const wr = 0.035;
  let up = 0, legs = 0, spin = 0, fireI = -1, fireK = 0, podK = -1;
  if (anim === 'drive') spin = t * TAU * 2;
  else if (anim === 'deploy') { legs = ease(t / 0.45); up = ease((t - 0.35) / 0.65); }
  else if (anim === 'fire') { legs = 1; up = 1; fireI = Math.floor(t * 8); fireK = (t * 8) % 1; }
  else if (anim === 'die') { podK = clamp01((t - 0.06) / 0.9); }
  const H = group(root, 'layer:hull', 0, anim === 'drive' ? bob(t, 0.002) : 0, 0);
  // chassis + six wheels
  cbox(H, 0.56, 0.022, 0.12, L.metal, 0, wr + 0.012, 0);
  for (const x of [0.2, -0.1, -0.2]) for (const s of [1, -1]) wheel(H, wr, 0.026, dead ? SOOT : L.rubber, L.trim, x, wr, s * 0.07, spin);
  const C0 = group(H, '', 0.2, 0, 0); cab(C0, L, dead, 0, wr + 0.005, 0.15, 0.13, 'rt-cab');
  // the bed: side boxes and the turntable
  for (const s of [1, -1]) cbox(H, 0.3, 0.04, 0.03, burnt(L, dead, L.hullDark), -0.12, wr + 0.04, s * 0.06);
  disc(H, 0.06, 0.02, L.metal, -0.1, wr + 0.04, 0, 16);
  // outriggers: four legs swing down to the ground and lift the truck a touch
  for (const [x, s] of [[0.12, 1], [0.12, -1], [-0.25, 1], [-0.25, -1]]) {
    const top = [x, wr + 0.03, s * 0.065], foot = lerpV([x, wr + 0.03, s * 0.11], [x, 0.004, s * 0.16], legs);
    seg(H, top, foot, 0.007, 0.006, L.trim, 6);
    disc(H, 0.014, 0.006, L.metal, ...foot, 10);
  }
  // the launcher (turns with face(aim), elevates on deploy): a pod hinged at its back end
  const Tl = group(root, 'layer:turret');
  const Tt = group(Tl, '', -0.1, wr + 0.055, 0); Tt.rotation.y = aimLocal(st);
  const Pd = group(Tt, 'pod', -0.11, 0.0, 0);
  if (podK >= 0) { const { p, k } = flight([-0.21, wr + 0.06, 0], L.podFly.v, podK, 0.04); Tl.remove(Tt); const P2 = group(Tl, '', ...p); P2.rotation.set(L.podFly.spin[0] * k * 0.3, 0, L.podFly.spin[2] * k * 0.5); P2.add(Pd); Pd.position.set(0, 0, 0); }
  else Pd.rotation.z = up * 0.8;
  cbox(Pd, 0.26, 0.075, 0.13, burnt(L, dead, L.hullLight), 0.13, 0.04, 0);
  cbox(Pd, 0.2, 0.01, 0.003, dead ? SOOT : L.stripe, 0.12, 0.05, 0.0665); cbox(Pd, 0.2, 0.01, 0.003, dead ? SOOT : L.stripe, 0.12, 0.05, -0.0665);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const i = r * 4 + c, y = 0.022 + r * 0.034, z = -0.045 + c * 0.03;
    const loaded = fireI < 0 || i > fireI;
    const tube = disc(Pd, 0.012, 0.004, loaded ? C('#c8342a', 0.3, 0.5) : L.metal, 0.262, y, z, 10); tube.rotation.z = Math.PI / 2;
    marker(Pd, 'muzzle:' + i, 0.27, y, z);
    if (i === fireI) { rocket(Pd, [0.28 + 0.4 * fireK, y, z], [1, 0, 0], 0.05, 0.008, L.trim); if (fireK < 0.4) flash(Pd, [0.27, y, z], [1, 0, 0], 0.03); }
  }
  if (anim === 'die') {
    fireball(root, 0.0, 0.08, 0, 0.14, t / 0.55);
    for (let i = 0; i < L.cook.length; i++) { const k = clamp01((t - 0.15 - i * 0.08) / 0.5); if (k > 0 && k < 1) { const { p } = flight([-0.15, 0.12, 0], L.cook[i].v, k, 0.01); rocket(root, p, L.cook[i].v, 0.04, 0.007, L.trim); } }
    for (let i = 0; i < 8; i++) chunk(root, [0, 0.08, 0], L.bits[i], clamp01(t / 0.8), i % 2 ? SCORCH : L.metal);
    if (t > 0.35) flames(root, L.flameSpots, t);
  }
}

// =====================================================================================================================
// APC — 0.46 long, eight wheels, a remote gun on the roof; the rear ramp drops and two troopers step out.
// =====================================================================================================================
const A_APC = { drive: { label: 'Drive', frames: 6, fps: 10 }, open: { label: 'Open ramp', frames: 12, fps: 10, once: true }, die: { label: 'Die', frames: 12, fps: 10, once: true } };
function apcLook(p) { const L = looks(p, { n: 2, fling: [], hatch: throws(p.R.fork(13), 1, { spread: 0.25, up: 0.8 })[0], flameSpots: [[0.08, 0.15, 0.03, 0.02], [-0.1, 0.15, -0.03, 0.018]] }); L.plate = L.hullLight; return L; }
function drawApc(root, L, anim, t, st) {
  const dead = anim === 'die' && t > 0.12;
  const wr = 0.032;
  let spin = 0, ramp = 0, outK = -1, hatchK = -1;
  if (anim === 'drive') spin = t * TAU * 2;
  else if (anim === 'open') { ramp = ease(t / 0.35); outK = clamp01((t - 0.3) / 0.7); }
  else if (anim === 'die') hatchK = clamp01((t - 0.06) / 0.9);
  const H = group(root, 'layer:hull', 0, anim === 'drive' ? bob(t, 0.002) : 0, 0);
  for (const x of [0.15, 0.06, -0.06, -0.15]) for (const s of [1, -1]) wheel(H, wr, 0.024, dead ? SOOT : L.rubber, L.trim, x, wr, s * 0.083, spin);
  // the hull: a long slab-sided box with a steep glacis and sloped upper sides
  profile(H, 'apc-hull', [[-0.2, 0.025], [0.17, 0.025], [0.23, 0.07], [0.19, 0.12], [-0.2, 0.135]], 0.15, burnt(L, dead, L.hull));
  for (const s of [1, -1]) {
    const up = cbox(H, 0.36, 0.03, 0.02, burnt(L, dead, L.hullLight), -0.01, 0.142, s * 0.062); up.rotation.x = s * 0.5;
    cbox(H, 0.34, 0.009, 0.003, dead ? SOOT : L.stripe, -0.01, 0.085, s * 0.0765);
    for (let i = 0; i < 3; i++) cbox(H, 0.016, 0.008, 0.004, lit('#9fe0ff', !dead, 0.4), 0.1 - i * 0.08, 0.115, s * 0.0765);   // vision blocks
    cbox(H, 0.36, 0.012, 0.012, L.trim, -0.01, 0.065, s * 0.08);
  }
  for (const s of [1, -1]) { cbox(H, 0.005, 0.01, 0.022, lit(HEAD, !dead, 0.8), 0.21, 0.065, s * 0.05); cbox(H, 0.004, 0.008, 0.016, lit(TAIL, !dead, 0.6), -0.201, 0.1, s * 0.06); }
  // the remote gun (turns with face)
  const Tl = group(root, 'layer:turret');
  const G0 = group(Tl, '', 0.04, 0.145, 0);
  if (hatchK >= 0) { const { p, k } = flight([0.04, 0.145, 0], L.hatch.v, hatchK, 0.02); G0.position.set(...p); G0.rotation.set(L.hatch.spin[0] * k, 0, L.hatch.spin[2] * k); }
  else G0.rotation.y = aimLocal(st);
  disc(G0, 0.03, 0.014, L.metal, 0, 0.007, 0, 12);
  cbox(G0, 0.05, 0.028, 0.034, burnt(L, dead, L.hullLight), 0.004, 0.026, 0);
  cbox(G0, 0.006, 0.01, 0.014, lit(L.stripeColor, !dead, 0.7), 0.03, 0.03, 0.006);
  seg(G0, [0.02, 0.022, -0.008], [0.1, 0.022, -0.008], 0.005, 0.004, L.metal, 6);
  marker(G0, 'muzzle', 0.1, 0.022, -0.008);
  // the rear ramp: hinged at the bottom of the back, drops to the ground; a red-lit troop bay behind it
  const Rp = group(H, 'ramp', -0.2, 0.03, 0); Rp.rotation.z = ramp * 1.35;
  cbox(Rp, 0.008, 0.1, 0.12, burnt(L, dead, L.hullDark), -0.004, 0.05, 0);
  for (let i = 0; i < 3; i++) cbox(Rp, 0.004, 0.006, 0.11, L.metal, 0.0005, 0.02 + i * 0.03, 0);
  if (ramp > 0.05) cbox(H, 0.004, 0.085, 0.1, neonMat('#ff4030', 0.35), -0.19, 0.075, 0);
  if (outK >= 0) for (let i = 0; i < 2; i++) {
    const k = clamp01(outK * 1.4 - i * 0.4); if (k <= 0) continue;
    const S = group(root, 'disembark', lerp(-0.18, -0.38, k), lerp(0.03, 0, Math.min(1, k * 1.6)), (i ? -1 : 1) * lerp(0.02, 0.09, k)); S.rotation.y = Math.PI + (i ? 0.4 : -0.4) * k;
    soldier(S, L, 0, 0, i * 0.5, 'walk', (k * 3) % 1, i);
  }
  if (anim === 'die') {
    fireball(root, 0.0, 0.1, 0, 0.13, t / 0.6);
    for (let i = 0; i < 8; i++) chunk(root, [0, 0.1, 0], L.bits[i], clamp01(t / 0.8), i % 2 ? SCORCH : L.metal);
    if (t > 0.35) flames(root, L.flameSpots, t);
  }
}

// =====================================================================================================================
// Gunship — a VTOL 0.66 long with two ducted fans, chin gun and rocket pods, hovering at `alt` above its shadow.
// =====================================================================================================================
const A_GUNSHIP = { hover: { label: 'Hover', frames: 6, fps: 12 }, fire: { label: 'Fire', frames: 8, fps: 12 }, die: { label: 'Die', frames: 14, fps: 10, once: true } };
function gunshipLook(p) { return looks(p, { alt: p.alt, flameSpots: [[0.0, 0.07, 0.0, 0.025], [-0.15, 0.05, 0.04, 0.016], [0.1, 0.06, -0.05, 0.018]] }); }
function fan(parent, L, dead, x, y, z, spin, r = 0.075) {
  const F = group(parent, '', x, y, z);
  const ring = put(F, geo('duct', () => new THREE.TorusGeometry(1, 0.16, 8, 28)), dead ? SCORCH : L.hullLight, 0, 0, 0); ring.scale.setScalar(r); ring.rotation.x = Math.PI / 2;
  const blades = group(F, '', 0, 0.002, 0); blades.rotation.y = spin;
  for (let i = 0; i < 5; i++) { const b = cbox(blades, r * 0.9, 0.003, 0.016, L.metal, r * 0.45, 0, 0); b.parent.remove(b); const arm = group(blades); arm.rotation.y = i * TAU / 5; arm.add(b); b.rotation.x = 0.35; }
  disc(F, r * 0.25, 0.02, L.metal, 0, 0, 0, 12);
  disc(F, r * 0.9, 0.003, lit('#7fd6ff', !dead, 0.3), 0, -0.012, 0, 20).castShadow = false;   // engine glow under the fan
  cbox(F, 0.006, 0.006, 0.006, lit(L.stripeColor, !dead, 0.9), 0, 0.02, 0);
  return F;
}
function drawGunship(root, L, anim, t) {
  const dead = anim === 'die' && t > 0.1;
  let alt = L.alt, pitch = 0, roll = 0, yaw = 0, spin = t * TAU * 3, gunFlash = false, rocketK = -1;
  if (anim === 'hover') { alt += 0.012 * Math.sin(t * TAU); pitch = 0.04 * Math.sin(t * TAU); roll = 0.03 * Math.cos(t * TAU); }
  else if (anim === 'fire') { pitch = -0.05 - 0.04 * bump(t, 0, 0.3); gunFlash = Math.floor(t * 8) % 2 === 0; rocketK = t < 0.7 ? t / 0.7 : -1; }
  else if (anim === 'die') { const k = ease(t / 0.8); yaw = t * TAU * 1.4; alt = lerp(L.alt, 0.035, k); pitch = -0.4 * k; roll = 0.5 * k; spin = t * TAU * (3 - 2 * t); }
  const f = frame(0, alt, 0, pitch, roll, yaw);
  const B = torsoGroup(root, f, 'airframe');
  // fuselage: a sleek profile with a tinted canopy, a tail boom and twin canted fins
  const hullM = profile(B, 'gs-body', [[0.31, 0.0], [0.24, -0.035], [0.05, -0.045], [-0.12, -0.03], [-0.36, 0.012], [-0.37, 0.03], [-0.12, 0.05], [0.06, 0.07], [0.2, 0.05]], 0.1, burnt(L, dead, L.hull)); hullM.scale.set(1, 1.5, 1.4);
  profile(B, 'gs-canopy', [[0.27, 0.01], [0.2, 0.05], [0.1, 0.07], [0.08, 0.045], [0.18, 0.015]], 0.07, L.glass, 0.003).scale.set(1, 1.55, 1.4);
  profile(B, 'gs-hump', [[0.05, 0.06], [-0.02, 0.1], [-0.16, 0.1], [-0.22, 0.06]], 0.09, burnt(L, dead, L.hullDark));   // engine hump
  cbox(B, 0.006, 0.01, 0.06, lit(L.stripeColor, !dead, 0.5), 0.18, 0.04, 0);   // the cockpit's lit instruments
  for (const s of [1, -1]) {
    cbox(B, 0.4, 0.012, 0.003, dead ? SOOT : L.stripe, -0.04, 0.015, s * 0.0505);
    const fin = cbox(B, 0.07, 0.07, 0.006, burnt(L, dead, L.hullLight), -0.33, 0.06, s * 0.03); fin.rotation.set(s * 0.45, 0, 0.35);
    cbox(B, 0.04, 0.008, 0.004, dead ? SOOT : L.stripe, -0.335, 0.075, s * 0.045).rotation.set(s * 0.45, 0, 0.35);
    // stub wings with a rocket pod under each
    const wing = cbox(B, 0.09, 0.008, 0.16, burnt(L, dead, L.hullDark), -0.02, 0.01, s * 0.13);
    wing.rotation.x = s * -0.08;
    seg(B, [0.02, -0.012, s * 0.12], [-0.08, -0.012, s * 0.12], 0.016, 0.016, L.metal, 8);
    disc(B, 0.013, 0.004, C('#c8342a', 0.3, 0.5), 0.022, -0.012, s * 0.12, 10).rotation.z = Math.PI / 2;
    marker(B, 'muzzle:pod' + (s > 0 ? 'L' : 'R'), 0.03, -0.012, s * 0.12);
    if (rocketK >= 0 && s > 0) rocket(B, [0.04 + 0.5 * rocketK, -0.015 - 0.04 * rocketK, s * 0.12], [1, -0.08, 0], 0.05, 0.008, L.trim);
    // ducted fans on the wing tips
    fan(B, L, dead, -0.02, 0.02, s * 0.25, spin * (s > 0 ? 1 : -1));
    ball(B, 0.007, lit(s > 0 ? NAV_R : NAV_G, !dead, 0.9), -0.02, 0.025, s * 0.33, 1, 1, 1, 8);
  }
  ball(B, 0.007, lit('#ffffff', !dead && Math.floor(t * 6) % 2 === 0, 0.9), -0.37, 0.035, 0, 1, 1, 1, 8);   // tail strobe
  // chin gun
  const G0 = group(B, '', 0.2, -0.04, 0);
  ball(G0, 0.022, L.metal, 0, 0, 0, 1, 0.8, 1, 10);
  for (const z of [-0.006, 0.006]) seg(G0, [0.01, -0.006, z], [0.075, -0.012, z], 0.004, 0.003, L.metal, 5);
  marker(G0, 'muzzle', 0.08, -0.012, 0);
  if (gunFlash) flash(G0, [0.08, -0.012, 0], [1, -0.1, 0], 0.025);
  // dying: on fire in the air, then the crash
  if (anim === 'die') {
    fireball(B, -0.05, 0.03, 0, 0.06, clamp01(t / 0.5) * 0.7 + 0.15);
    if (t > 0.72) { fireball(root, 0, 0.0, 0, 0.18, (t - 0.72) / 0.28); for (let i = 0; i < 8; i++) chunk(root, [0, 0.05, 0], L.bits[i], (t - 0.72) / 0.28, i % 2 ? SCORCH : L.metal); }
  }
}

// =====================================================================================================================
// Attack drone — a small quad-rotor (0.12 across) with a gun pod and one red eye, at `alt`.
// =====================================================================================================================
const A_DRONE = { fly: { label: 'Fly', frames: 4, fps: 12 }, fire: { label: 'Fire', frames: 6, fps: 14 }, die: { label: 'Die', frames: 10, fps: 12, once: true } };
function droneLook(p) { return looks(p, { alt: p.alt }); }
function drawDrone(root, L, anim, t) {
  const dead = anim === 'die' && t > 0.1;
  let alt = L.alt, pitch = -0.12, roll = 0, yaw = 0, spin = t * TAU * 2, fl = false, k = 0;
  if (anim === 'fly') { alt += 0.006 * Math.sin(t * TAU); roll = 0.04 * Math.sin(t * TAU); }
  else if (anim === 'fire') { fl = Math.floor(t * 6) % 2 === 0; pitch = -0.08; }
  else if (anim === 'die') { k = ease(t / 0.7); alt = lerp(L.alt, 0.02, k); roll = 1.4 * k; yaw = t * TAU; pitch = -0.4 * k; }
  const f = frame(0, alt, 0, pitch, roll, yaw);
  const B = torsoGroup(root, f, 'airframe');
  ball(B, 0.024, burnt(L, dead, L.hull), 0, 0, 0, 1.5, 0.6, 1.1, 12);
  cbox(B, 0.03, 0.006, 0.026, dead ? SOOT : L.stripe, 0.0, 0.012, 0);
  ball(B, 0.009, lit('#ff2a2a', !dead, 1), 0.035, -0.002, 0, 1, 1, 1, 8);
  for (const [x, z] of [[0.04, 0.04], [0.04, -0.04], [-0.04, 0.04], [-0.04, -0.04]]) {
    if (dead && k > 0.4 && x > 0 && z > 0) continue;   // a rotor torn off
    seg(B, [0, 0.004, 0], [x, 0.01, z], 0.004, 0.003, L.metal, 5);
    const ring = put(B, geo('drone-duct', () => new THREE.TorusGeometry(1, 0.14, 6, 18)), L.hullDark, x, 0.012, z); ring.scale.setScalar(0.022); ring.rotation.x = Math.PI / 2;
    const bl = cbox(B, 0.038, 0.002, 0.005, L.metal, x, 0.013, z); bl.rotation.y = spin + x * 10;
    disc(B, 0.02, 0.002, lit('#7fd6ff', !dead, 0.3), x, 0.006, z, 12).castShadow = false;
  }
  seg(B, [0.0, -0.016, 0], [0.05, -0.02, 0], 0.006, 0.004, L.metal, 6);
  marker(B, 'muzzle', 0.052, -0.02, 0);
  if (fl) flash(B, [0.054, -0.02, 0], [1, -0.05, 0], 0.014);
  if (anim === 'die') { fireball(B, 0, 0, 0, 0.03, t / 0.6); if (t > 0.65) { fireball(root, 0, 0, 0, 0.05, (t - 0.65) / 0.35); for (let i = 0; i < 5; i++) chunk(root, [0, 0.03, 0], L.bits[i], (t - 0.65) / 0.35, L.metal); } }
}

// =====================================================================================================================
// AA emplacement — a fortified pad (1×1) with a turning launcher (4 missiles) beside a radar; userData.face aims it.
// =====================================================================================================================
const A_AA = { idle: { label: 'Watch', frames: 8, fps: 8 }, fire: { label: 'Fire', frames: 10, fps: 12 }, die: { label: 'Die', frames: 12, fps: 10, once: true } };
function aaLook(p) { return looks(p, { concrete: C('#8f918a', 0, 0.95), concreteDark: C('#6b6d68', 0, 0.95), sand: C('#8a7c5e', 0, 1), podFly: throws(p.R.fork(14), 2, { spread: 0.3, up: 0.7 }), flameSpots: [[0.0, 0.12, 0.0, 0.025], [0.15, 0.06, -0.12, 0.016]] }); }
function drawAA(root, L, anim, t, st) {
  const dead = anim === 'die' && t > 0.1;
  let sweep = 0, fireI = -1, fireK = 0, blow = -1, dishSpin = t * TAU;
  if (anim === 'idle') sweep = 0.45 * Math.sin(t * TAU);
  else if (anim === 'fire') { fireI = Math.floor(t * 4); fireK = (t * 4) % 1; dishSpin = t * TAU * 2; }
  else if (anim === 'die') blow = clamp01((t - 0.05) / 0.9);
  const Hl = group(root, 'layer:hull');
  // the pad: an eight-sided slab, a ring of armoured blocks with a gap for the stairs, hazard lamps
  disc(Hl, 0.44, 0.04, L.concreteDark, 0, 0.02, 0, 8).rotation.y = Math.PI / 8;
  disc(Hl, 0.4, 0.02, L.concrete, 0, 0.05, 0, 8).rotation.y = Math.PI / 8;
  for (let i = 0; i < 8; i++) {
    if (i === 3) continue;
    const a = i * TAU / 8 + TAU / 16, r = 0.37;
    const b = cbox(Hl, 0.07, 0.06, 0.27, i % 2 ? L.sand : burnt(L, dead && i < 3, L.hullDark), Math.cos(a) * r, 0.09, Math.sin(a) * r); b.rotation.y = -a;
    if (i % 2 === 0) cbox(Hl, 0.004, 0.01, 0.2, dead ? SOOT : L.stripe, Math.cos(a) * (r + 0.036), 0.1, Math.sin(a) * (r + 0.036)).rotation.y = -a;
  }
  cbox(Hl, 0.06, 0.05, 0.07, L.metal, -0.24, 0.085, 0.12);
  cbox(Hl, 0.01, 0.01, 0.01, lit('#5dff7a', !dead, 0.8), -0.24, 0.115, 0.12);
  // the launcher (turns with face, sweeps while it watches): turntable, sensor head, two pods of two missiles, radar
  const Tl = group(root, 'layer:turret');
  const Tt = group(Tl, '', 0, 0.06, 0); Tt.rotation.y = aimLocal(st) - sweep; Tt.scale.setScalar(1.8);
  disc(Tt, 0.11, 0.03, L.metal, 0, 0.015, 0, 16);
  cbox(Tt, 0.09, 0.08, 0.08, burnt(L, dead, L.hull), 0, 0.07, 0);
  cbox(Tt, 0.006, 0.02, 0.05, lit(L.stripeColor, !dead, 0.7), 0.046, 0.08, 0);
  for (const [s, i] of [[1, 0], [-1, 1]]) {
    const P = group(Tt, 'pod', 0, 0.085, s * 0.085);
    if (blow >= 0) { const { p, k } = flight([0, 0.2, s * 0.15], L.podFly[i].v, blow, 0.06); Tt.remove(P); Tl.add(P); P.scale.setScalar(1.8); P.position.set(...p); P.rotation.set(L.podFly[i].spin[0] * k * 0.4, 0, L.podFly[i].spin[2] * k * 0.4); }
    else P.rotation.z = 0.55;
    cbox(P, 0.2, 0.07, 0.06, burnt(L, dead, L.hullLight), 0.02, 0, 0);
    cbox(P, 0.16, 0.008, 0.002, dead ? SOOT : L.stripe, 0.02, 0.02, s * 0.031);
    for (let r = 0; r < 2; r++) {
      const n = i * 2 + r, y = -0.016 + r * 0.032;
      const live = fireI < 0 || n > fireI;
      if (live) spike(P, [0.12, y, 0], [0.15, y, 0], 0.012, C('#c8342a', 0.3, 0.5), 8);
      marker(P, 'muzzle:' + n, 0.14, y, 0);
      if (n === fireI) { rocket(P, [0.15 + 0.5 * fireK, y, 0], [1, 0, 0], 0.07, 0.012, L.trim); if (fireK < 0.35) { flash(P, [0.12, y, 0], [1, 0, 0], 0.03); flash(P, [-0.09, y, 0], [-1, 0, 0], 0.03); } }
    }
  }
  // radar: a dish on a post at the back, spinning
  const Rd = group(Tt, 'radar', -0.06, 0.11, 0); Rd.rotation.y = dishSpin;
  seg(Rd, [0, 0, 0], [0, 0.05, 0], 0.008, 0.006, L.metal, 6);
  const dish = put(Rd, geo('dish', () => new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI * 0.32)), L.hullLight, 0, 0.06, 0); dish.scale.set(0.05, 0.05, 0.05); dish.rotation.z = Math.PI / 2 + 0.3;
  if (anim === 'die') {
    fireball(root, 0, 0.12, 0, 0.14, t / 0.6);
    for (let i = 0; i < 9; i++) chunk(root, [0, 0.12, 0], L.bits[i], clamp01(t / 0.8), i % 2 ? SCORCH : L.metal);
    if (t > 0.35) flames(root, L.flameSpots, t);
  }
}

// =====================================================================================================================
// Shield bearer — a heavy two-legged walker (0.3 tall) behind a tall shield with a glowing rim; braces it down.
// =====================================================================================================================
const A_SHIELD = { walk: { label: 'Walk', frames: 8, fps: 8 }, brace: { label: 'Brace', frames: 8, fps: 8 }, die: { label: 'Die', frames: 12, fps: 10, once: true } };
function shieldLook(p) { return looks(p, { shieldFly: throws(p.R.fork(15), 1, { spread: 0.1, up: 0.2 })[0] }); }
function drawShield(root, L, anim, t) {
  const dead = anim === 'die' && t > 0.15;
  let hipY = 0.15, legPh = 0, stride = 0.08, brace = 0, buckle = 0, pitch = 0, roll = 0, field = 0;
  if (anim === 'walk') { legPh = t; hipY += 0.008 * Math.cos(t * TAU * 2); roll = 0.04 * Math.sin(t * TAU); }
  else if (anim === 'brace') { brace = ease(Math.min(1, t / 0.35)); field = brace * (0.6 + 0.4 * Math.sin(t * TAU * 2) ** 2); stride = 0; hipY -= 0.035 * brace; pitch = -0.08 * brace; }
  else if (anim === 'die') { buckle = ease(t / 0.7); hipY = lerp(0.15, 0.06, buckle); pitch = -0.3 * buckle; roll = 0.4 * buckle; stride = 0; }
  const f = frame(0, hipY, 0, pitch, roll, 0);
  const T = torsoGroup(root, f);
  // body: a squat armoured cockpit with a visor slit, an engine pack behind, a side gun on the right
  cbox(T, 0.12, 0.08, 0.12, burnt(L, dead, L.hull), -0.01, 0.05, 0);
  cbox(T, 0.08, 0.03, 0.13, burnt(L, dead, L.hullDark), 0.0, 0.1, 0);
  cbox(T, 0.006, 0.012, 0.06, lit(L.stripeColor, !dead, 0.7), 0.05, 0.085, 0);
  cbox(T, 0.06, 0.07, 0.09, L.metal, -0.09, 0.05, 0);
  for (let i = 0; i < 3; i++) cbox(T, 0.004, 0.05, 0.07, lit('#ffb02e', !dead, 0.35), -0.121, 0.05, -0.025 + i * 0.025);
  cbox(T, 0.122, 0.01, 0.003, dead ? SOOT : L.stripe, -0.01, 0.03, 0.0615); cbox(T, 0.122, 0.01, 0.003, dead ? SOOT : L.stripe, -0.01, 0.03, -0.0615);
  seg(T, [0.0, 0.05, -0.075], [0.12, 0.05, -0.075], 0.008, 0.007, L.metal, 6);
  marker(T, 'muzzle', 0.12, 0.05, -0.075);
  // the shield: three angled panels on an arm at the front left, rim lit; braced = planted on the ground
  const Sh = group(buckle > 0.3 ? root : T, 'shield');
  if (buckle > 0.3) { const k = ease((buckle - 0.3) / 0.7); Sh.position.set(lerp(0.14, 0.2, k), lerp(hipY - 0.13, 0.012, k), 0.02); Sh.rotation.z = -1.5 * k; }
  else { Sh.position.set(0.11 + 0.02 * brace, -0.11 - 0.02 * brace, 0.02); Sh.rotation.z = 0.06 - 0.04 * brace; }
  seg(T, [0.05, 0.04, 0.06], [0.1, 0.02, 0.04], 0.012, 0.01, L.metal, 6);
  for (const [z, a] of [[-0.075, 0.45], [0, 0], [0.075, -0.45]]) {
    const pn = cbox(Sh, 0.014, 0.28, 0.08, burnt(L, dead, L.hullLight), 0, 0.14, z); pn.rotation.y = a;
  }
  for (const y of [0.0, 0.28]) cbox(Sh, 0.018, 0.012, 0.22, lit(L.stripeColor, !dead, 0.6), 0.004, y, 0);
  for (const z of [-0.11, 0.11]) cbox(Sh, 0.018, 0.28, 0.01, lit(L.stripeColor, !dead, 0.6), 0.004, 0.14, z);
  cbox(Sh, 0.003, 0.05, 0.05, dead ? SOOT : L.stripe, 0.009, 0.2, 0);
  if (field > 0) for (let i = 0; i < 4; i++) cbox(Sh, 0.002, 0.04, 0.17, neonMat(shade(L.stripeColor, 0.3), 0.4 + 0.4 * field), 0.012, 0.05 + i * 0.06, 0);
  // two reverse-jointed legs with wide feet, set wider when braced
  for (const s of [1, -1]) {
    const hip = f.tp([-0.01, 0.0, s * 0.07]);
    const stp = step(legPh + (s > 0 ? 0 : 0.5), 0.6);
    let foot = [stp.u * stride + 0.01, 0.03 * stp.lift, s * (0.08 + 0.03 * brace)];
    if (buckle) foot = lerpV(foot, [0.08, 0, s * 0.14], buckle);
    const [kn, ft] = ik(hip, foot, 0.09, 0.1, [-1, 0.2, 0]);
    seg(root, hip, kn, 0.026, 0.02, burnt(L, dead, L.hull), 8); seg(root, kn, ft, 0.018, 0.014, L.metal, 8);
    ball(root, 0.022, L.hullDark, ...kn, 1, 1, 1, 10);
    cbox(root, 0.07, 0.016, 0.045, L.metal, ft[0] + 0.01, ft[1] + 0.008, ft[2]);
  }
  if (anim === 'die') {
    fireball(root, -0.02, hipY + 0.03, 0, 0.11, t / 0.6);
    for (let i = 0; i < 8; i++) chunk(root, [0, hipY + 0.05, 0], L.bits[i], clamp01(t / 0.8), i % 2 ? SCORCH : L.metal);
    if (t > 0.4) flames(root, [[-0.03, hipY + 0.05, 0.0, 0.02]], t);
  }
}

// =====================================================================================================================
// Jammer truck — 0.5 long; raises a mast with a spinning dish and pulsing emitter rings.
// =====================================================================================================================
const A_JAM = { drive: { label: 'Drive', frames: 6, fps: 10 }, jam: { label: 'Jam', frames: 12, fps: 10 }, die: { label: 'Die', frames: 12, fps: 10, once: true } };
function jamLook(p) { return looks(p, { flameSpots: [[0.15, 0.1, 0, 0.018], [-0.08, 0.13, 0.03, 0.02]] }); }
function drawJammer(root, L, anim, t) {
  const dead = anim === 'die' && t > 0.12;
  const wr = 0.042;
  let spin = 0, mast = 0.1, dish = t * TAU, pulse = 0, fall = 0;
  if (anim === 'drive') spin = t * TAU * 2;
  else if (anim === 'jam') { mast = 1; dish = t * TAU * 3; pulse = t; }
  else if (anim === 'die') { fall = ease((t - 0.1) / 0.6); mast = 0.6; }
  const H = group(root, 'layer:hull', 0, anim === 'drive' ? bob(t, 0.002) : 0, 0);
  cbox(H, 0.46, 0.022, 0.12, L.metal, 0, wr + 0.01, 0);
  for (const x of [0.16, -0.14]) for (const s of [1, -1]) wheel(H, wr, 0.03, dead ? SOOT : L.rubber, L.trim, x, wr, s * 0.075, spin);
  const C0 = group(H, '', 0.17, 0, 0); cab(C0, L, dead, 0, wr + 0.005, 0.15, 0.135, 'jm-cab');
  // the shelter: a ribbed electronics box with vents and a lit status panel
  cbox(H, 0.27, 0.11, 0.15, burnt(L, dead, L.hullLight), -0.08, wr + 0.08, 0);
  for (let i = 0; i < 6; i++) for (const s of [1, -1]) cbox(H, 0.006, 0.09, 0.004, L.hullDark, -0.2 + i * 0.045, wr + 0.08, s * 0.076);
  for (const s of [1, -1]) cbox(H, 0.25, 0.01, 0.003, dead ? SOOT : L.stripe, -0.08, wr + 0.125, s * 0.0765);
  cbox(H, 0.04, 0.02, 0.003, lit('#7dff6a', !dead, 0.6), 0.0, wr + 0.1, 0.0765);
  // the mast: telescoping sections up from the shelter's back, a dish on top, emitter rings that pulse out
  const M = group(H, 'mast', -0.16, wr + 0.135, 0);
  if (fall) { M.rotation.z = 1.35 * fall; M.rotation.x = 0.3 * fall; }
  const h = lerp(0.05, 0.3, mast);
  seg(M, [0, 0, 0], [0, h * 0.55, 0], 0.016, 0.013, L.trim, 8);
  seg(M, [0, h * 0.55, 0], [0, h, 0], 0.011, 0.009, L.trim, 8);
  for (let i = 0; i < 3; i++) {
    const y = h * (0.35 + i * 0.22), k = pulse > 0 ? ((pulse * 2 + i / 3) % 1) : 0;
    ringFlat(M, 0.025 + 0.05 * k, 0.004, lit(L.stripeColor, !dead, 0.45 + 0.45 * (1 - k)), 0, y, 0);
  }
  const D = group(M, 'dish', 0, h + 0.02, 0); D.rotation.y = dish;
  const dsh = put(D, geo('jdish', () => new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI * 0.3)), burnt(L, dead, L.hullLight), 0.0, 0.02, 0); dsh.scale.setScalar(0.08); dsh.rotation.z = Math.PI / 2 + 0.25;
  seg(D, [0, 0.02, 0], [0.06, 0.035, 0], 0.003, 0.002, L.metal, 4);
  ball(D, 0.008, lit(L.stripeColor, !dead, 0.9), 0.06, 0.035, 0, 1, 1, 1, 8);
  marker(D, 'muzzle', 0.06, 0.035, 0);
  for (const s of [1, -1]) { seg(H, [-0.03, wr + 0.135, s * 0.06], [-0.03, wr + 0.135 + (mast > 0.5 ? 0.12 : 0.04), s * 0.06], 0.003, 0.002, L.metal, 4); ball(H, 0.006, lit(L.stripeColor, !dead && (pulse === 0 || Math.floor(t * 12) % 2 === 0), 0.9), -0.03, wr + 0.135 + (mast > 0.5 ? 0.12 : 0.04), s * 0.06, 1, 1, 1, 8); }
  if (anim === 'die') {
    fireball(root, -0.05, 0.12, 0, 0.13, t / 0.6);
    for (let i = 0; i < 8; i++) chunk(root, [0, 0.12, 0], L.bits[i], clamp01(t / 0.8), i % 2 ? SCORCH : L.metal);
    if (t > 0.35) flames(root, L.flameSpots, t);
  }
}

// =====================================================================================================================
// Sniper walker — 0.38 tall on two long reverse-jointed legs, a rail gun longer than itself; a laser sight while aiming.
// =====================================================================================================================
const A_SNIPER = { walk: { label: 'Walk', frames: 8, fps: 8 }, aim: { label: 'Aim', frames: 8, fps: 8 }, fire: { label: 'Fire', frames: 8, fps: 12 }, die: { label: 'Die', frames: 12, fps: 10, once: true } };
function sniperLook(p) { return looks(p, { gunFly: throws(p.R.fork(16), 1, { spread: 0.25, up: 0.4 })[0] }); }
function drawSniper(root, L, anim, t) {
  const dead = anim === 'die' && t > 0.15;
  let hipY = 0.26, legPh = 0, stride = 0.14, pitch = 0, laser = 0, charge = 0, recoil = 0, flashOn = false, buckle = 0, gunK = -1;
  if (anim === 'walk') { legPh = t; hipY += 0.012 * Math.cos(t * TAU * 2); pitch = 0.04 * Math.sin(t * TAU * 2); }
  else if (anim === 'aim') { hipY = 0.22; stride = 0; laser = 1; charge = t; pitch = -0.02; }
  else if (anim === 'fire') { hipY = 0.22; stride = 0; recoil = t < 0.12 ? ease(t / 0.12) : 1 - ease((t - 0.12) / 0.7); flashOn = t < 0.25; laser = t < 0.05 ? 1 : 0; charge = t < 0.1 ? 1 : 0; pitch = 0.08 * recoil; }
  else if (anim === 'die') { buckle = ease(t / 0.75); hipY = lerp(0.26, 0.06, buckle); pitch = -0.4 * buckle; stride = 0; gunK = clamp01((t - 0.2) / 0.8); }
  const f = frame(-0.02 * recoil, hipY, 0, pitch, 0, 0);
  const T = torsoGroup(root, f);
  // a narrow pod with a glowing optic, a fin of armour on top
  ball(T, 0.075, burnt(L, dead, L.hull), 0, 0.03, 0, 1.3, 0.8, 0.85, 14);
  ball(T, 0.05, burnt(L, dead, L.hullDark), -0.02, -0.01, 0, 1.4, 0.6, 1, 12);
  cbox(T, 0.1, 0.012, 0.003, dead ? SOOT : L.stripe, -0.01, 0.03, 0.048); cbox(T, 0.1, 0.012, 0.003, dead ? SOOT : L.stripe, -0.01, 0.03, -0.048);
  ball(T, 0.014, lit(L.stripeColor, !dead, 0.9), 0.075, 0.03, 0.02, 1, 1, 1, 10);
  cbox(T, 0.08, 0.03, 0.006, burnt(L, dead, L.hullDark), -0.04, 0.07, 0).rotation.z = 0.2;
  // the rail gun: long twin rails with charge coils, on top
  const Gn = group(gunK >= 0 ? root : T, 'railgun');
  if (gunK >= 0) { const { p, k } = flight(f.tp([0.0, 0.08, 0]), L.gunFly.v, gunK, 0.02); Gn.position.set(...p); Gn.rotation.set(0, L.gunFly.spin[1] * k * 0.3, L.gunFly.spin[2] * k * 0.3); }
  else Gn.position.set(0.0 - 0.03 * recoil, 0.08, 0);
  cbox(Gn, 0.1, 0.03, 0.04, L.metal, -0.03, 0, 0);
  for (const z of [-0.01, 0.01]) seg(Gn, [0.0, 0.0, z], [0.36, 0.0, z], 0.006, 0.005, L.trim, 6);
  for (let i = 0; i < 4; i++) { const on = !dead && (charge === 0 ? 0.3 : charge) * 4 > i; ringFlat(Gn, 0.016, 0.004, on ? neonMat(L.stripeColor, 0.4 + 0.5 * charge) : C('#3a3f46', 0.4, 0.5), 0.05 + i * 0.07, 0, 0).rotation.set(0, 0, Math.PI / 2); }
  marker(Gn, 'muzzle', 0.37, 0, 0);
  if (laser) { seg(Gn, [0.37, -0.012, 0], [0.37 + 0.45, -0.03, 0], 0.0025, 0.0015, neonMat('#ff2030', 1), 4).castShadow = false; ball(Gn, 0.004, neonMat('#ff2030', 1), 0.37, -0.012, 0, 1, 1, 1, 6); }
  if (flashOn) { flash(Gn, [0.38, 0, 0], [1, 0, 0], 0.045); seg(Gn, [0.38, 0, 0], [0.75, 0, 0], 0.006 * (1 - t * 3), 0.002, neonMat(shade(L.stripeColor, 0.4), 1), 6); }
  // long legs: thigh forward, shin back (bird-like), three-toed feet
  for (const s of [1, -1]) {
    const hip = f.tp([0, -0.01, s * 0.04]);
    const stp = step(legPh + (s > 0 ? 0 : 0.5), 0.55);
    let foot = [stp.u * stride, 0.05 * stp.lift, s * 0.06];
    if (buckle) foot = lerpV(foot, [-0.08, 0, s * 0.12], buckle);
    const [kn, ft] = ik(hip, foot, 0.16, 0.17, [-1, 0.1, 0]);
    seg(root, hip, kn, 0.022, 0.016, burnt(L, dead, L.hull), 8); seg(root, kn, ft, 0.015, 0.011, L.metal, 8);
    ball(root, 0.019, L.hullDark, ...kn, 1, 1, 1, 8);
    for (const a of [-0.5, 0, 0.5]) seg(root, ft, [ft[0] + Math.cos(a) * 0.035, 0.003, ft[2] + Math.sin(a) * 0.035], 0.005, 0.003, L.metal, 4);
  }
  if (anim === 'die') {
    fireball(root, 0, hipY + 0.03, 0, 0.09, t / 0.55);
    for (let i = 0; i < 6; i++) chunk(root, [0, hipY, 0], L.bits[i], clamp01(t / 0.8), i % 2 ? SCORCH : L.metal);
  }
}

// =====================================================================================================================
// Juggernaut — the army's siege-walker boss (Overdrive Frame's second boss): ~1.9 long with its gun, ~1.05 tall (a
// mech is 0.75). An armoured hull on four splayed spider legs, a turret with one long main cannon, a missile rack on
// each flank and a shield generator mast on its back. Breakable parts (named groups `part:<name>`, a wreck stump when
// broken): cannon, rack-left, rack-right, generator, leg-fl, leg-fr, leg-rl, leg-rr. A broken leg leaves a torn
// thigh and that corner of the hull sags — two gone and it walks bent over.
// =====================================================================================================================
const JUG_PARTS = ['cannon', 'rack-left', 'rack-right', 'generator', 'leg-fl', 'leg-fr', 'leg-rl', 'leg-rr'];
const JUG_LABELS = { cannon: 'Main cannon', 'rack-left': 'Left missile rack', 'rack-right': 'Right missile rack', generator: 'Shield generator', 'leg-fl': 'Front left leg', 'leg-fr': 'Front right leg', 'leg-rl': 'Rear left leg', 'leg-rr': 'Rear right leg' };
const A_JUG = {
  walk: { label: 'Walk', frames: 8, fps: 8 }, fire: { label: 'Cannon', frames: 8, fps: 12 }, slam: { label: 'Stomp', frames: 10, fps: 10 },
  deploy: { label: 'Launch', frames: 8, fps: 10 }, roar: { label: 'Reel', frames: 8, fps: 10 }, die: { label: 'Die', frames: 14, fps: 10, once: true },
};
// legs: [name, side (+1 = left, +z), front (+1) / rear (−1), gait phase] — one foot moves at a time
const JUG_LEGS = [['leg-fl', 1, 1, 0], ['leg-fr', -1, 1, 0.5], ['leg-rl', 1, -1, 0.75], ['leg-rr', -1, -1, 0.25]];
const GEN_GLOW = '#5fe8ff', HAZARD = '#e8b21c';
function jugLook(p) {
  const L = looks(p, { flameSpots: [[0.1, 0.62, 0.12, 0.04], [-0.3, 0.6, -0.1, 0.035], [0.35, 0.55, -0.15, 0.03], [-0.15, 0.58, 0.2, 0.03]] });
  return { ...L, hazard: C(HAZARD, 0.3, 0.5), bits: throws(L.R, 18, { spread: 0.9, up: 0.9, size: [0.06, 0.12] }), legFly: throws(p.R.fork(21), 4, { spread: 0.5, up: 0.6 }) };
}
function drawJuggernaut(root, L, anim, t, st, p) {
  const dead = anim === 'die' && t > 0.18;
  const broken = name => st.broken.has(name) || !!p[partKey(name)];
  let hipY = 0.56, pitch = 0, roll = 0, legPh = 0, stride = 0.22, recoil = 0, flashOn = false, rise = 0, slamK = -1, rackUp = 0, launch = -1, reel = 0, die = 0;
  if (anim === 'walk') { legPh = t; hipY += 0.012 * Math.cos(t * TAU * 4); roll = 0.015 * Math.sin(t * TAU * 2); pitch = 0.01 * Math.sin(t * TAU * 4); }
  else if (anim === 'fire') { stride = 0; recoil = t < 0.25 ? ease(t / 0.25) : 1 - ease((t - 0.25) / 0.7); flashOn = t > 0.2 && t < 0.45; pitch = 0.03 * recoil; }
  else if (anim === 'slam') { stride = 0; rise = t < 0.55 ? ease(t / 0.55) : 1 - ease((t - 0.55) / 0.1); if (t > 0.62) slamK = (t - 0.62) / 0.38; pitch = 0.16 * rise - (slamK >= 0 ? 0.04 * (1 - slamK) : 0); hipY += 0.1 * rise - (slamK >= 0 ? 0.07 * (1 - slamK) : 0); }
  else if (anim === 'deploy') { stride = 0; rackUp = ease(Math.min(1, t / 0.4)); if (t > 0.45) launch = (t - 0.45) / 0.55; hipY -= 0.02 * rackUp; }
  else if (anim === 'roar') { stride = 0; reel = 1; roll = 0.05 * Math.sin(t * TAU * 2); pitch = -0.04 + 0.02 * Math.sin(t * TAU * 3); hipY -= 0.03; }
  else if (anim === 'die') { stride = 0; die = ease(t / 0.7); hipY = lerp(0.56, 0.14, die); pitch = -0.12 * die; roll = 0.22 * die; }
  // broken legs: that corner of the hull sags (the stump can't hold it up)
  const sag = {}; let nBroken = 0;
  for (const [name] of JUG_LEGS) if (broken(name)) { nBroken++; sag[name] = 1; }
  const dF = 0.08 * ((sag['leg-fl'] || 0) + (sag['leg-fr'] || 0)), dB = 0.08 * ((sag['leg-rl'] || 0) + (sag['leg-rr'] || 0));
  const dL = 0.08 * ((sag['leg-fl'] || 0) + (sag['leg-rl'] || 0)), dR = 0.08 * ((sag['leg-fr'] || 0) + (sag['leg-rr'] || 0));
  if (!die) { hipY -= 0.04 * nBroken; pitch += (dB - dF) * 0.9; roll += (dL - dR) * 0.9; }
  const f = frame(0, hipY, 0, pitch, roll, 0);
  const T = torsoGroup(root, f, 'hull');
  const hull = burnt(L, dead, L.hull), hullLight = burnt(L, dead, L.hullLight), hullDark = burnt(L, dead, L.hullDark), stripe = dead ? SOOT : L.stripe;
  // ---- hull: a long armoured body with a sloped glacis, side skirts carrying the faction stripe, a belly keel ----
  profile(T, 'jug-hull', [[-0.6, 0.0], [0.44, 0.0], [0.62, 0.09], [0.52, 0.2], [-0.44, 0.25], [-0.62, 0.15]], 0.56, hull, 0.01);
  profile(group(T, '', 0, -0.06, 0), 'jug-keel', [[-0.45, 0.0], [0.35, 0.0], [0.45, 0.06], [-0.5, 0.07]], 0.36, hullDark, 0.008);
  for (const s of [1, -1]) {
    cbox(T, 0.9, 0.11, 0.025, hullLight, -0.05, 0.11, s * 0.29);                 // side skirt
    cbox(T, 0.78, 0.016, 0.006, stripe, -0.05, 0.13, s * 0.304);                  // faction stripe (glows at night)
    for (let i = 0; i < 5; i++) cbox(T, 0.012, 0.09, 0.03, hullDark, -0.42 + i * 0.18, 0.11, s * 0.3);   // skirt ribs
    cbox(T, 0.006, 0.02, 0.05, lit(HEAD, !dead, 0.9), 0.585, 0.11, s * 0.2);     // head lamps on the glacis
    cbox(T, 0.006, 0.02, 0.03, lit(TAIL, !dead, 0.6), -0.615, 0.16, s * 0.22);   // tail lamps
  }
  for (let i = 0; i < 4; i++) cbox(T, 0.03, 0.012, 0.5, i % 2 ? L.metal : L.hazard, 0.47 + i * 0.03, 0.03 + i * 0.03, 0).rotation.z = 0.6;   // hazard bands on the nose
  cbox(T, 0.3, 0.03, 0.4, hullDark, -0.2, 0.245, 0);                               // engine deck
  for (let i = 0; i < 5; i++) cbox(T, 0.02, 0.012, 0.34, L.metal, -0.32 + i * 0.055, 0.265, 0);    // grille
  for (const s of [1, -1]) { cbox(T, 0.06, 0.04, 0.04, L.metal, -0.08, 0.26, s * 0.2); ball(T, 0.014, lit('#ff9a2e', !dead, 0.8), -0.08, 0.29, s * 0.2, 1, 1, 1, 8); }   // beacons
  if (reel && !dead) for (const [x, z] of [[-0.25, 0.1], [0.1, -0.15]]) ball(T, 0.03, neonMat(FIRE, 0.9), x, 0.27, z, 1, 0.6, 1, 8);   // reeling: sparks off the deck
  // ---- turret + main cannon (breakable: 'cannon') ----
  const Tu = group(T, '', 0.18, 0.22, 0);
  if (!broken('cannon')) {
    const Cn = group(Tu, 'part:cannon');
    profile(Cn, 'jug-turret', [[-0.22, 0.0], [0.15, 0.0], [0.24, 0.06], [0.16, 0.13], [-0.18, 0.14], [-0.25, 0.07]], 0.36, hullLight, 0.008);
    for (const s of [1, -1]) { cbox(Cn, 0.3, 0.012, 0.004, stripe, -0.02, 0.09, s * 0.181); cbox(Cn, 0.08, 0.06, 0.05, L.metal, -0.12, 0.17, s * 0.1); }
    cbox(Cn, 0.03, 0.02, 0.07, lit(L.stripeColor, !dead, 0.8), 0.18, 0.1, 0.0);        // sight
    const gx = 0.2 - 0.12 * recoil;
    seg(Cn, [gx - 0.06, 0.07, 0], [gx + 0.66, 0.07, 0], 0.046, 0.036, L.metal, 12);
    seg(Cn, [gx + 0.2, 0.07, 0], [gx + 0.3, 0.07, 0], 0.05, 0.05, L.trim, 12);           // fume extractor
    disc(Cn, 0.05, 0.1, L.metal, gx + 0.66, 0.07, 0, 10).rotation.z = Math.PI / 2;      // muzzle brake
    for (const s of [1, -1]) cbox(Cn, 0.05, 0.02, 0.03, L.trim, gx + 0.66, 0.07, s * 0.05);
    marker(Cn, 'muzzle', gx + 0.72, 0.07, 0);
    if (flashOn) { flash(Cn, [gx + 0.74, 0.07, 0], [1, 0, 0], 0.12); for (const s of [1, -1]) flash(Cn, [gx + 0.66, 0.07, s * 0.07], [0, 0, s], 0.05); }
    seg(Cn, [-0.15, 0.14, 0.06], [-0.18, 0.3, 0.06], 0.004, 0.002, L.metal, 4);          // antenna
  } else {
    const Sb = group(Tu, 'stump:cannon');
    profile(Sb, 'jug-turret-wreck', [[-0.22, 0.0], [0.12, 0.0], [0.18, 0.05], [0.1, 0.1], [-0.18, 0.12], [-0.25, 0.07]], 0.34, SCORCH, 0.008);
    seg(Sb, [0.1, 0.06, 0], [0.32, 0.05, 0.01], 0.046, 0.044, SOOT, 12);
    for (let i = 0; i < 5; i++) { const a = i * TAU / 5; spike(Sb, [0.31, 0.05 + Math.cos(a) * 0.03, Math.sin(a) * 0.03], [0.37 + (i % 2) * 0.03, 0.05 + Math.cos(a) * 0.045, Math.sin(a) * 0.045], 0.014, SOOT, 4); }
    if (!dead) ball(Sb, 0.03, neonMat(FIRE_HOT, 0.8), 0.32, 0.05, 0.01, 1, 1, 1, 8);    // the torn barrel still glows
    if (!dead) ball(Sb, 0.045, neonMat(FIRE, 0.7), -0.02, 0.12, 0, 1.4, 0.5, 1.2, 8);
  }
  // ---- missile racks on each flank (breakable): two rows of three tubes, raised to fire ----
  for (const [name, s] of [['rack-left', 1], ['rack-right', -1]]) {
    const at = [-0.12, 0.17, s * 0.39];
    seg(T, [-0.12, 0.13, s * 0.29], at, 0.03, 0.03, L.metal, 6);                     // bracket arm
    if (!broken(name)) {
      const R = group(T, 'part:' + name, ...at); R.rotation.z = 0.7 * rackUp;
      cbox(R, 0.34, 0.17, 0.13, hullLight, 0, 0.04, 0);
      cbox(R, 0.3, 0.012, 0.004, stripe, -0.01, 0.1, s * 0.066);
      cbox(R, 0.02, 0.15, 0.12, L.metal, 0.17, 0.04, 0);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const y = r * 0.075, z = (c - 1) * 0.038, n = r * 3 + c;
        disc(R, 0.015, 0.006, C('#151719', 0.2, 0.8), 0.181, y, z, 10).rotation.z = Math.PI / 2;
        const fired = launch >= 0 && n < launch * 6;
        if (!fired) ball(R, 0.012, lit('#ff3b30', !dead, 0.6), 0.178, y, z, 0.6, 1, 1, 8);
        else if (launch * 6 - n < 1.2) rocket(R, [0.2 + (launch * 6 - n) * 0.4, y, z], [1, 0, 0], 0.08, 0.012, L.trim);
        marker(R, 'muzzle:' + name + ':' + n, 0.19, y, z);
      }
      if (launch >= 0 && launch < 0.9) flash(R, [-0.19, 0.04, 0], [-1, 0, 0], 0.05);     // back-blast
    } else {
      const R = group(T, 'stump:' + name, ...at); R.rotation.set(0.25 * s, 0, -0.35);
      cbox(R, 0.18, 0.08, 0.1, SCORCH, -0.06, 0.0, 0);
      for (let i = 0; i < 4; i++) spike(R, [0.02, -0.03 + i * 0.025, (i - 1.5) * 0.025], [0.09 + (i % 2) * 0.04, i * 0.03, (i - 1.5) * 0.04], 0.012, SOOT, 4);
      if (!dead) ball(R, 0.035, neonMat(FIRE, 0.8), 0.0, 0.03, 0, 1.2, 0.8, 1, 8);
    }
  }
  // ---- shield generator mast on its back (breakable): a pylon, two coil rings and a glowing emitter ----
  if (!broken('generator')) {
    const Gn = group(T, 'part:generator', -0.44, 0.22, 0);
    cbox(Gn, 0.2, 0.05, 0.3, hullDark, 0, 0.02, 0);
    disc(Gn, 0.06, 0.16, L.metal, 0, 0.12, 0, 10);
    for (const s of [1, -1]) { seg(Gn, [0, 0.05, s * 0.12], [0, 0.2, s * 0.05], 0.014, 0.01, L.trim, 6); cbox(Gn, 0.05, 0.08, 0.008, hullLight, 0.02, 0.08, s * 0.15); }
    const glow = lit(GEN_GLOW, !dead, 0.9);
    ringFlat(Gn, 0.085, 0.012, glow, 0, 0.15, 0); ringFlat(Gn, 0.06, 0.01, glow, 0, 0.21, 0);
    ball(Gn, 0.055, glow, 0, 0.26, 0, 1, 0.9, 1, 14);
    spike(Gn, [0, 0.3, 0], [0, 0.38, 0], 0.012, L.metal, 6);
    for (const s of [1, -1]) cbox(Gn, 0.004, 0.04, 0.05, lit(GEN_GLOW, !dead, 0.6), 0.101, 0.08, s * 0.07);
  } else {
    const Sb = group(T, 'stump:generator', -0.44, 0.22, 0);
    cbox(Sb, 0.2, 0.05, 0.3, SCORCH, 0, 0.02, 0);
    seg(Sb, [0, 0.04, 0], [0.02, 0.1, 0.01], 0.06, 0.05, SOOT, 10);
    for (let i = 0; i < 5; i++) { const a = i * TAU / 5; spike(Sb, [Math.cos(a) * 0.04, 0.09, Math.sin(a) * 0.04], [Math.cos(a) * 0.07, 0.15 + (i % 2) * 0.03, Math.sin(a) * 0.07], 0.012, SOOT, 4); }
    if (!dead) ball(Sb, 0.03, neonMat(GEN_GLOW, 0.5), 0.0, 0.1, 0, 1, 0.6, 1, 8);       // a last flicker in the torn coil
    if (!dead) ball(Sb, 0.04, neonMat(FIRE, 0.7), 0.04, 0.07, -0.05, 1, 0.6, 1, 8);
  }
  // ---- four splayed legs: hip on a hull corner, an armoured thigh up to a high knee, a shin down to a broad
  //      three-toed foot ----
  JUG_LEGS.forEach(([name, s, fb, off], i) => {
    const hip = f.tp([fb * 0.4, 0.02, s * 0.28]);
    if (broken(name)) {        // torn at the knee: the thigh hangs, a cable trails, sparks at the break
      const Sb = group(root, 'stump:' + name);
      const end = f.tp([fb * 0.6, -0.2, s * 0.46]);
      seg(Sb, hip, end, 0.06, 0.05, dead ? SCORCH : L.hullDark, 6);
      ball(Sb, 0.07, SCORCH, ...hip, 1, 1, 1, 10);
      for (let k = 0; k < 3; k++) spike(Sb, end, [end[0] + fb * 0.03 * (k - 1), end[1] - 0.05 - k * 0.02, end[2] + s * 0.02 * k], 0.016, SOOT, 4);
      seg(Sb, end, [end[0] + fb * 0.02, Math.max(0.02, end[1] - 0.14), end[2] + s * 0.03], 0.006, 0.004, C('#1a1a1a', 0, 0.9), 4);   // cable
      if (!dead) ball(Sb, 0.025, neonMat(FIRE_HOT, 0.9), ...end, 1, 1, 1, 8);
      return;
    }
    const Lg = group(root, 'part:' + name);
    const stp = step(legPh + off, 0.75);
    let foot = [fb * 0.66 + stp.u * stride, 0.09 * stp.lift, s * 0.62];
    if (anim === 'slam' && fb > 0) foot = slamK >= 0 ? [fb * 0.72, 0, s * 0.66] : [fb * 0.66 + 0.08 * rise, 0.24 * rise, s * 0.62];
    if (die) { const lf = L.legFly[i]; foot = lerpV(foot, [fb * 0.85 + lf.v[0] * 0.1, 0, s * (0.82 + Math.abs(lf.v[2]) * 0.1)], die); }
    const [kn, ft] = ik(hip, foot, 0.44, 0.56, [fb * 0.25, 1, s * 0.5]);
    seg(Lg, hip, kn, 0.075, 0.06, hull, 6);                                            // thigh (six-sided: armoured)
    seg(Lg, lerpV(hip, kn, 0.15), lerpV(hip, kn, 0.75), 0.088, 0.07, hullLight, 4);   // thigh plate
    seg(Lg, f.tp([fb * 0.3, 0.12, s * 0.27]), lerpV(hip, kn, 0.6), 0.016, 0.014, L.trim, 6);   // hydraulic ram
    ball(Lg, 0.07, L.metal, ...hip, 1, 1, 1, 10);
    ball(Lg, 0.06, hullDark, ...kn, 1, 1, 1, 10);
    disc(Lg, 0.05, 0.12, L.metal, ...kn, 10).rotation.x = Math.PI / 2;                   // knee actuator
    seg(Lg, kn, ft, 0.052, 0.04, L.metal, 8);                                          // shin
    seg(Lg, kn, lerpV(kn, ft, 0.5), 0.055, 0.045, hull, 6);                            // shin guard
    cbox(Lg, 0.012, 0.06, 0.012, stripe, ...lerpV(kn, ft, 0.25));
    disc(Lg, 0.08, 0.035, hullDark, ft[0], ft[1] + 0.018, ft[2], 8);                    // foot pad
    for (const a of [-0.7, 0, 0.7]) { const d = Math.atan2(s, fb) + a; spike(Lg, [ft[0], ft[1] + 0.012, ft[2]], [ft[0] + Math.cos(d) * 0.13, ft[1] + 0.006, ft[2] + Math.sin(d) * 0.13], 0.018, L.metal, 4); }
  });
  // ---- the stomp lands: a ring of dust thrown out round its feet ----
  if (slamK >= 0 && slamK < 0.95) { const k = ease(slamK); ringFlat(root, 0.7 + 1.0 * k, 0.03 * (1 - k) + 0.006, C('#8a8478', 0, 1), 0, 0.02, 0); ringFlat(root, 0.5 + 0.7 * k, 0.02 * (1 - k) + 0.004, C('#a39a8a', 0, 1), 0, 0.03, 0); }
  // ---- death: the legs give, a fireball in the hull, plates and parts thrown, then it burns ----
  if (anim === 'die') {
    fireball(root, 0, hipY + 0.15, 0, 0.32, t / 0.55);
    if (t > 0.3) fireball(root, -0.35, hipY + 0.2, 0.1, 0.2, (t - 0.3) / 0.5);
    for (let i = 0; i < 14; i++) chunk(root, [(i % 5 - 2) * 0.12, hipY + 0.2, (i % 3 - 1) * 0.15], L.bits[i], clamp01(t / 0.85), i % 3 ? SCORCH : L.metal, i % 4 ? 'box' : 'ball');
    if (t > 0.4) flames(root, L.flameSpots.map(([x, y, z, r]) => [x, y - (0.56 - hipY), z, r]), t);
  }
}

// ---------- recipes ----------
const common = { group: 'army', genre: ['military'], dirs: 16, noStyle: true, size: [1, 1] };
const altParam = (def, min, max) => ({ key: 'alt', label: 'Altitude', min, max, step: 0.05, def, unit: 'tiles' });
addRecipes({
  'ar-troopers': {
    ...common, name: 'Trooper Squad', anims: A_TROOP, dims: { h: 0.17 },
    blurb: 'Three or four soldiers in powered armour moving as one; each about 2.5 m tall, visors in the faction colour.',
    params: [{ key: 'count', label: 'Soldiers', min: 3, max: 4, step: 1, def: 4 }, paintParam, stripeParam], build: poseable(A_TROOP, troopLook, drawTroopers),
  },
  'ar-tank': {
    ...common, name: 'Light Tank', anims: A_TANK, dims: { len: 0.5, h: 0.22 }, layers: ['hull', 'turret'],
    blurb: 'A low wedge on tracks. Its turret turns on its own: baked as separate hull and turret layers.',
    params: [paintParam, stripeParam], build: poseable(A_TANK, tankLook, drawTank),
  },
  'ar-rocket-truck': {
    ...common, name: 'Rocket Truck', anims: A_RTRUCK, dims: { len: 0.58, h: 0.17 }, layers: ['hull', 'turret'],
    blurb: 'Artillery: parks, drops four outriggers, raises its launcher box and ripple-fires eight rockets.',
    params: [paintParam, stripeParam], build: poseable(A_RTRUCK, rtruckLook, drawRocketTruck),
  },
  'ar-apc': {
    ...common, name: 'APC', anims: A_APC, dims: { len: 0.46, h: 0.19 }, layers: ['hull', 'turret'],
    blurb: 'Eight wheels and a remote gun; drops its rear ramp and lets out troopers.',
    params: [paintParam, stripeParam], build: poseable(A_APC, apcLook, drawApc),
  },
  'ar-gunship': {
    ...common, name: 'Gunship', anims: A_GUNSHIP, dims: { len: 0.72, h: 0.2 }, flyer: true,
    blurb: 'A VTOL with two ducted fans, a chin gun and rocket pods, hovering above its own shadow.',
    params: [altParam(0.35, 0.2, 0.8), paintParam, stripeParam], build: poseable(A_GUNSHIP, gunshipLook, drawGunship),
  },
  'ar-drone': {
    ...common, name: 'Attack Drone', anims: A_DRONE, dims: { len: 0.13, h: 0.05 }, flyer: true,
    blurb: 'A small quad-rotor with a gun pod and a red eye. Comes in swarms.',
    params: [altParam(0.25, 0.1, 0.6), paintParam, stripeParam], build: poseable(A_DRONE, droneLook, drawDrone),
  },
  'ar-aa': {
    ...common, name: 'AA Emplacement', anims: A_AA, dims: { h: 0.44 }, layers: ['hull', 'turret'],
    blurb: 'A fortified pad with a turning missile launcher and spinning radar. Locks on to anything that flies or jumps.',
    params: [paintParam, stripeParam], build: poseable(A_AA, aaLook, drawAA),
  },
  'ar-shield': {
    ...common, name: 'Shield Bearer', anims: A_SHIELD, dims: { h: 0.34 },
    blurb: 'A heavy walker behind a tall shield with a glowing rim; braces it into the street. Get round it.',
    params: [paintParam, stripeParam], build: poseable(A_SHIELD, shieldLook, drawShield),
  },
  'ar-jammer': {
    ...common, name: 'Jammer Truck', anims: A_JAM, dims: { len: 0.5, h: 0.34 },
    blurb: 'Used sparingly: raises a mast with a spinning dish and scrambles the mech\'s radar while it stands.',
    params: [paintParam, stripeParam], build: poseable(A_JAM, jamLook, drawJammer),
  },
  'ar-sniper': {
    ...common, name: 'Sniper Walker', anims: A_SNIPER, dims: { h: 0.4 },
    blurb: 'A tall long-legged walker with a rail gun longer than itself. A red laser shows where it is aiming.',
    params: [paintParam, stripeParam], build: poseable(A_SNIPER, sniperLook, drawSniper),
  },
  'ar-juggernaut': {
    ...common, name: 'Juggernaut', size: [2, 2], anims: A_JUG, dims: { len: 2.0, h: 1.15 }, parts: JUG_PARTS,
    blurb: 'Boss, a siege walker about 30 m long on four splayed legs: a main cannon, two missile racks and a shield generator on its back. Every one of them, and each leg, can be shot off.',
    params: [paintParam, stripeParam, ...JUG_PARTS.map(n => ({ key: partKey(n), label: JUG_LABELS[n], min: 0, max: 1, step: 1, def: 0, names: ['Whole', 'Shot off'] }))],
    build: poseable(A_JUG, jugLook, drawJuggernaut, { parts: JUG_PARTS }),
  },
});

// =====================================================================================================================
// Round 5 roles (Overdrive Frame R5 — "full enemy role list"):
//   Flamer          — one heavy trooper (0.2 tall) with twin fuel tanks and a flame lance; a pilot light flickers
//                     at the nozzle (`light`) before the short fire jet (`fire`); the tanks burst when it dies
//   Bulwark         — a squat four-legged walker carrying a tall emitter mast; the ring at the top spins and glows
//                     while it holds its dome up (`project` — the game draws the dome itself)
//   Field medic     — a pale twin-fan drone with a green emitter lens underneath; `heal` lowers the lens and lights it
// =====================================================================================================================
const A_FLAMER = { walk: { label: 'Walk', frames: 8, fps: 10 }, light: { label: 'Pilot light', frames: 6, fps: 12 }, fire: { label: 'Spray', frames: 6, fps: 14 }, die: { label: 'Die', frames: 10, fps: 12, once: true } };
function flamerLook(p) { const L = looks(p); return { ...L, tank: C('#7a3020', 0.5, 0.4), plate: L.hullLight, flyTank: throws(L.R.fork(21), 2, { spread: 0.25, up: 0.6 }) }; }
function drawFlamer(root, L, anim, t) {
  const dead = anim === 'die' && t > 0.15;
  let hipY = 0.09, lean = 0.06, stride = 0.06, legPh = 0, aim = 0, pilot = 0, jet = 0, fall = 0;
  if (anim === 'walk') { legPh = t; hipY += 0.005 * Math.abs(Math.cos(t * TAU)); }
  else if (anim === 'light') { aim = 1; stride = 0; lean = 0.02; pilot = 0.5 + 0.5 * Math.abs(Math.sin(t * TAU * 3)); }
  else if (anim === 'fire') { aim = 1; stride = 0; lean = -0.03; jet = 0.8 + 0.2 * Math.sin(t * TAU * 2); }
  else if (anim === 'die') { fall = ease(clamp01((t - 0.1) / 0.6)); stride = 0; }
  const f = frame(-0.01 * jet, hipY - 0.06 * fall, 0, -lean - 1.2 * fall, 0.25 * fall, 0);
  const T = torsoGroup(root, f);
  // body: a barrel chest of armour plates, a striped collar, a helmet with a narrow glowing slit
  cbox(T, 0.044, 0.026, 0.056, L.hullDark, 0, 0.005, 0);
  cbox(T, 0.05, 0.058, 0.064, burnt(L, dead, L.hull), 0, 0.045, 0);
  cbox(T, 0.01, 0.04, 0.054, burnt(L, dead, L.plate), 0.026, 0.046, 0);
  cbox(T, 0.042, 0.007, 0.066, dead ? SOOT : L.stripe, 0, 0.074, 0);
  for (const s of [1, -1]) ball(T, 0.02, burnt(L, dead, L.hull), 0.0, 0.07, s * 0.04, 1.1, 0.8, 1, 10);
  ball(T, 0.02, burnt(L, dead, L.hullLight), 0.004, 0.1, 0, 1.1, 1, 0.95, 12);
  cbox(T, 0.006, 0.006, 0.026, lit(L.stripeColor, !dead, 0.7), 0.022, 0.101, 0);
  // twin fuel tanks on the back with stripe bands (they fly off and burst when it dies)
  for (const [i, s] of [[0, 1], [1, -1]]) {
    const at = [-0.04, 0.05, s * 0.018];
    if (anim === 'die' && t > 0.12) { const { p } = flight(f.tp(at), L.flyTank[i].v, clamp01((t - 0.12) / 0.6), 0.015); const o = seg(root, [p[0], p[1] - 0.03, p[2]], [p[0], p[1] + 0.03, p[2]], 0.014, 0.014, SCORCH, 10); o.rotation.z = (t - 0.12) * 6 * s; continue; }
    seg(T, [at[0], at[1] - 0.035, at[2]], [at[0], at[1] + 0.035, at[2]], 0.015, 0.015, burnt(L, dead, L.tank), 10);
    ball(T, 0.015, burnt(L, dead, L.tank), at[0], at[1] + 0.035, at[2], 1, 0.6, 1, 10);
    disc(T, 0.0155, 0.006, dead ? SOOT : L.stripe, at[0], at[1] + 0.01, at[2], 10);
  }
  // the flame lance: held low on the walk, levelled at the hip when lit; a hose from the tanks
  const back = aim ? [0.0, 0.03, -0.03] : [-0.005, 0.02, -0.03];
  const muz = aim ? [0.12, 0.034, -0.03] : [0.08, -0.012, -0.022];
  const grip = lerpV(back, muz, 0.15);
  seg(T, back, muz, 0.009, 0.007, L.metal, 8);
  seg(T, grip, [grip[0], grip[1] - 0.018, -0.03], 0.006, 0.006, L.metal, 6);
  ball(T, 0.011, L.trim, ...lerpV(back, muz, 0.92), 1.4, 1, 1, 8);
  seg(T, [-0.04, 0.02, 0], lerpV(back, muz, 0.2), 0.004, 0.004, L.rubber, 5);
  marker(T, 'muzzle', ...muz);
  const dir = V(muz[0] - back[0], muz[1] - back[1], muz[2] - back[2]).normalize();
  const along = k => [muz[0] + dir.x * k, muz[1] + dir.y * k, muz[2] + dir.z * k];
  if (pilot > 0 && !dead) { ball(T, 0.005 + 0.005 * pilot, neonMat('#6ad8ff', 1), ...along(0.006), 1, 1, 1, 8); ball(T, 0.004 + 0.006 * pilot, neonMat(FIRE_HOT, 1), ...along(0.013), 1.3, 1, 1, 8); }
  if (jet > 0) for (let i = 0; i < 6; i++) {          // the jet: a widening tongue of fire, hot near the nozzle
    const k = (i + 1) / 6, w = 0.008 + 0.03 * k * jet, wob = 0.006 * Math.sin((t * 4 + i * 0.3) * TAU);
    const p = along(0.18 * k * jet); ball(T, w, neonMat(i < 2 ? FIRE_HOT : FIRE, 0.95), p[0], p[1] + wob + 0.01 * k, p[2] + wob, 1.4, 0.8, 1, 10).castShadow = false;
  }
  // arms reach the lance
  for (const s of [1, -1]) {
    const sh = [0.0, 0.066, s * 0.04];
    const hand = s < 0 ? lerpV(back, muz, 0.35) : lerpV(back, muz, 0.65);
    const [el, h] = ik(sh, [hand[0], hand[1], hand[2] + (s > 0 ? 0.01 : 0)], 0.036, 0.036, [-0.4, -1, s * 0.6]);
    seg(T, sh, el, 0.012, 0.01, burnt(L, dead, L.hull), 6); seg(T, el, h, 0.01, 0.009, L.hullDark, 6);
  }
  // legs: heavy armoured thighs and boots
  for (const s of [1, -1]) {
    const hip = f.tp([0, -0.005, s * 0.016]);
    const st = step(legPh + (s > 0 ? 0 : 0.5), 0.6);
    let foot = [st.u * stride + (aim ? s * 0.014 : 0), 0.02 * st.lift + 0.007, s * (aim ? 0.026 : 0.02)];
    if (fall) foot = lerpV(foot, [0.04 * s, 0.01, s * 0.03], fall);
    const [kn, ft] = ik(hip, foot, 0.045, 0.045, [1, 0, 0]);
    seg(root, hip, kn, 0.014, 0.012, burnt(L, dead, L.hull), 6); seg(root, kn, ft, 0.012, 0.01, L.hullDark, 6);
    cbox(root, 0.028, 0.012, 0.018, L.metal, ft[0] + 0.005, ft[1], ft[2]);
  }
  if (anim === 'die') { fireball(root, -0.03, 0.06, 0, 0.1, t / 0.6); if (t > 0.45) flames(root, [[-0.02, 0.03, 0.0, 0.016], [0.03, 0.02, 0.02, 0.01]], t); }
}

const A_BULWARK = { walk: { label: 'Walk', frames: 8, fps: 8 }, project: { label: 'Project', frames: 8, fps: 10 }, die: { label: 'Die', frames: 12, fps: 10, once: true } };
function bulwarkLook(p) { return looks(p, { mastFly: throws(p.R.fork(22), 1, { spread: 0.2, up: 0.4 })[0], field: '#6fe8ff' }); }
function drawBulwark(root, L, anim, t) {
  const dead = anim === 'die' && t > 0.15;
  let hipY = 0.1, legPh = 0, stride = 0.06, pulse = 0.35, spin = t * TAU * 0.5, buckle = 0, roll = 0;
  if (anim === 'walk') { legPh = t; hipY += 0.005 * Math.cos(t * TAU * 2); roll = 0.025 * Math.sin(t * TAU); }
  else if (anim === 'project') { stride = 0; hipY -= 0.015; pulse = 0.55 + 0.45 * Math.sin(t * TAU) ** 2; spin = t * TAU; }
  else if (anim === 'die') { buckle = ease(t / 0.7); hipY = lerp(0.1, 0.045, buckle); roll = 0.35 * buckle; stride = 0; pulse = 0; }
  const f = frame(0, hipY, 0, -0.1 * buckle, roll, 0);
  const T = torsoGroup(root, f);
  // a low armoured body with sloped plates, generator vents on the sides, the faction stripe round its skirt
  cbox(T, 0.2, 0.05, 0.16, burnt(L, dead, L.hull), 0, 0.03, 0);
  const top = cbox(T, 0.17, 0.02, 0.13, burnt(L, dead, L.hullLight), 0, 0.064, 0); top.rotation.z = 0.04;
  cbox(T, 0.202, 0.008, 0.162, dead ? SOOT : L.stripe, 0, 0.012, 0);
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) cbox(T, 0.03, 0.026, 0.003, lit(L.field, !dead, 0.35 * pulse + 0.1), -0.05 + i * 0.045, 0.034, s * 0.081);
  cbox(T, 0.04, 0.03, 0.05, L.metal, 0.09, 0.036, 0);
  cbox(T, 0.006, 0.01, 0.034, lit(L.stripeColor, !dead, 0.7), 0.111, 0.04, 0);
  // the emitter mast: a braced pylon, three fins, a ring that spins and a core that glows (the dome's source)
  const M = group(buckle > 0.35 ? root : T, 'mast');
  if (buckle > 0.35) { const { p, k } = flight(f.tp([-0.02, 0.07, 0]), L.mastFly.v, (buckle - 0.35) / 0.65, 0.02); M.position.set(...p); M.rotation.set(0.4 * k, 0, -1.3 * k); }
  else M.position.set(-0.02, 0.07, 0);
  seg(M, [0, 0, 0], [0, 0.17, 0], 0.016, 0.01, L.metal, 8);
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; const fin = cbox(M, 0.004, 0.09, 0.03, burnt(L, dead, L.hullDark), Math.cos(a) * 0.018, 0.06, Math.sin(a) * 0.018); fin.rotation.y = -a; }
  const R = group(M, 'ring', 0, 0.19, 0); R.rotation.y = spin;
  ringFlat(R, 0.045, 0.006, lit(L.field, !dead, 0.5 + 0.4 * pulse), 0, 0, 0);
  for (let i = 0; i < 4; i++) { const a = i * TAU / 4; cbox(R, 0.014, 0.01, 0.01, L.trim, Math.cos(a) * 0.045, 0, Math.sin(a) * 0.045).rotation.y = -a; }
  ball(M, 0.02 + 0.006 * pulse, lit(L.field, !dead, 0.6 + 0.4 * pulse), 0, 0.19, 0, 1, 1, 1, 12);
  for (const y of [0.2, 0.218]) disc(M, 0.012, 0.004, L.metal, 0, y, 0, 10);
  // four stubby legs with wide feet, set out to the corners
  for (const [hx, hz, off] of [[0.07, 1, 0], [0.07, -1, 0.5], [-0.07, 1, 0.5], [-0.07, -1, 0]]) {
    const hip = f.tp([hx, 0.0, hz * 0.07]);
    const stp = step(legPh + off, 0.6);
    let foot = [hx * 1.3 + stp.u * stride, 0.02 * stp.lift, hz * 0.12];
    if (buckle) foot = lerpV(foot, [hx * 1.6, 0, hz * 0.15], buckle);
    const [kn, ft] = ik(hip, foot, 0.06, 0.08, [0, 1, hz]);
    seg(root, hip, kn, 0.018, 0.014, burnt(L, dead, L.hull), 7); seg(root, kn, ft, 0.013, 0.01, L.metal, 7);
    cbox(root, 0.04, 0.01, 0.034, L.metal, ft[0], ft[1] + 0.005, ft[2]);
  }
  if (anim === 'die') {
    fireball(root, 0, hipY + 0.05, 0, 0.1, t / 0.6);
    for (let i = 0; i < 8; i++) chunk(root, [0, hipY + 0.04, 0], L.bits[i], clamp01(t / 0.8), i % 2 ? SCORCH : L.metal);
    if (t > 0.4) flames(root, [[0.02, hipY + 0.05, 0.03, 0.02], [-0.06, hipY + 0.04, -0.03, 0.014]], t);
  }
}

const A_MEDIC = { fly: { label: 'Fly', frames: 4, fps: 12 }, heal: { label: 'Heal', frames: 6, fps: 12 }, die: { label: 'Die', frames: 10, fps: 12, once: true } };
function medicLook(p) { return looks(p, { alt: p.alt, shell: C('#d8dde3', 0.3, 0.35), shellDark: C('#9aa2ac', 0.4, 0.4), green: '#5dff8a' }); }
function drawMedic(root, L, anim, t) {
  const dead = anim === 'die' && t > 0.1;
  let alt = L.alt, pitch = -0.08, roll = 0, yaw = 0, spin = t * TAU * 2, k = 0, lens = 0.3;
  if (anim === 'fly') { alt += 0.006 * Math.sin(t * TAU); roll = 0.05 * Math.sin(t * TAU); }
  else if (anim === 'heal') { pitch = 0.05; lens = 0.7 + 0.3 * Math.sin(t * TAU * 2); alt += 0.003 * Math.sin(t * TAU); }
  else if (anim === 'die') { k = ease(t / 0.7); alt = lerp(L.alt, 0.02, k); roll = -1.3 * k; yaw = -t * TAU; pitch = -0.5 * k; lens = 0; }
  const f = frame(0, alt, 0, pitch, roll, yaw);
  const B = torsoGroup(root, f, 'airframe');
  // a rounded pale body, a green band, a sensor eye at the front
  ball(B, 0.034, dead ? SCORCH : L.shell, 0, 0, 0, 1.45, 0.62, 1.05, 14);
  ball(B, 0.026, dead ? SOOT : L.shellDark, -0.012, 0.012, 0, 1.3, 0.5, 1, 12);
  cbox(B, 0.006, 0.008, 0.07, lit(L.green, !dead, 0.6), 0.0, 0.01, 0);
  cbox(B, 0.03, 0.004, 0.012, lit(L.green, !dead, 0.6), 0.0, 0.019, 0);
  ball(B, 0.008, lit('#eaffef', !dead, 0.9), 0.048, 0.0, 0, 1, 1, 1, 8);
  cbox(B, 0.018, 0.012, 0.006, dead ? SOOT : L.stripe, -0.036, 0.004, 0);
  // two side fans in ducts on short booms
  for (const s of [1, -1]) {
    if (dead && k > 0.45 && s > 0) continue;               // a fan torn off
    seg(B, [0, 0.004, s * 0.03], [0, 0.008, s * 0.062], 0.005, 0.004, L.metal, 5);
    const ring = put(B, geo('medic-duct', () => new THREE.TorusGeometry(1, 0.16, 6, 18)), dead ? SCORCH : L.shellDark, 0, 0.01, s * 0.075); ring.scale.setScalar(0.026); ring.rotation.x = Math.PI / 2;
    const bl = cbox(B, 0.044, 0.002, 0.006, L.metal, 0, 0.011, s * 0.075); bl.rotation.y = spin * s;
    disc(B, 0.023, 0.002, lit('#bfffd2', !dead, 0.25), 0, 0.006, s * 0.075, 12).castShadow = false;
  }
  // the emitter: a lens on a short arm under the body; lowered and bright while it heals
  const ly = -0.022 - (anim === 'heal' ? 0.012 : 0);
  seg(B, [0.006, -0.012, 0], [0.012, ly, 0], 0.005, 0.004, L.metal, 5);
  ball(B, 0.009, lit(L.green, !dead && lens > 0, 0.4 + 0.6 * lens), 0.012, ly - 0.004, 0, 1, 0.8, 1, 10);
  ringFlat(B, 0.012, 0.0025, lit(L.green, !dead, 0.3 + 0.5 * lens), 0.012, ly, 0);
  marker(B, 'muzzle', 0.012, ly - 0.01, 0);
  if (anim === 'heal') spike(B, [0.012, ly - 0.01, 0], [0.012, ly - 0.06 * lens, 0], 0.005 * lens, neonMat(L.green, 0.9), 6).castShadow = false;
  if (anim === 'die') { fireball(B, 0, 0, 0, 0.032, t / 0.6); if (t > 0.65) { fireball(root, 0, 0, 0, 0.05, (t - 0.65) / 0.35); for (let i = 0; i < 5; i++) chunk(root, [0, 0.03, 0], L.bits[i], (t - 0.65) / 0.35, i % 2 ? SCORCH : L.metal); } }
}

addRecipes({
  'ar-flamer': {
    ...common, name: 'Flamer', anims: A_FLAMER, dims: { h: 0.2 },
    blurb: 'A heavy trooper with twin fuel tanks and a flame lance. A pilot light flickers before it sprays: back off.',
    params: [paintParam, stripeParam], build: poseable(A_FLAMER, flamerLook, drawFlamer),
  },
  'ar-bulwark': {
    ...common, name: 'Bulwark', anims: A_BULWARK, dims: { len: 0.32, h: 0.34 },
    blurb: 'A squat four-legged shield projector. The ring on its mast holds a dome over the army round it: kill it first.',
    params: [paintParam, stripeParam], build: poseable(A_BULWARK, bulwarkLook, drawBulwark),
  },
  'ar-medic': {
    ...common, name: 'Field Medic Drone', anims: A_MEDIC, dims: { len: 0.11, h: 0.07 }, flyer: true,
    blurb: 'A pale twin-fan drone that patches up the army with a green beam from the lens underneath. Shoot it first.',
    params: [altParam(0.2, 0.1, 0.6), paintParam, stripeParam], build: poseable(A_MEDIC, medicLook, drawMedic),
  },
});
